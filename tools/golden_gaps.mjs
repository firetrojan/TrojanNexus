#!/usr/bin/env node
// tools/golden_gaps.mjs - which lines of the ORIGINAL JavaScript do the golden cases never run?
//
// A golden file can look big and still skip whole branches of the real code. This replays every case ("fn" + "in")
// through the real legacy JS and asks V8 which lines never ran. Those lines are the gaps: a Dart port of them
// would be untested.
//
//   node tools/golden_gaps.mjs importers suggest      detail for the named modules (golden file names, no .json)
//   node tools/golden_gaps.mjs --all                   one summary line per module
//   node tools/golden_gaps.mjs importers --max 200     print up to 200 never-run blocks (default 80)
//
// Run it from the kit root (the folder that has legacy/ and fixtures/). Read-only: it writes nothing there.
// "mismatches" = replayed cases whose output differs from the golden. If it is above 0 the replay is not trusted
// for that function: add a wrapper in WRAP below (copy the call shape from tools/gen_golden_r4.mjs).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import inspector from 'node:inspector';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const ROOT = path.resolve(opt('--root', process.cwd()));
const GOLD = path.join(ROOT, 'fixtures', 'golden');
const LEGACY = path.join(ROOT, 'legacy', 'web-src', 'js');
const MAX = Number(opt('--max', 80));
const MARK = '@@RESULT@@';

// ---- how golden "in" lists are turned into real calls, where the function does not take them as they are ----
const plainProfile = p => ({ job: p.job.id, n: p.n, ids: [...p.ids], tags: Object.fromEntries(p.tags), sites: Object.fromEntries(p.sites), folders: Object.fromEntries(p.folders), topics: Object.fromEntries(p.topics), types: Object.fromEntries(p.types), words: p.words });
const plainSug = s => s && { ...s, job: s.job.id, also: s.also ? s.also.map(j => j.id) : undefined };
const WRAP = (() => {
  // The generator freezes the clock at 2026-10-31 12:00 UTC and gives the store a fake localStorage.
  // The replay has to do the same, or "today" and the stored dates differ.
  const FROZEN = Date.UTC(2026, 9, 31, 12, 0, 0);
  let ready = false;
  const setup = () => {
    if (ready) return;
    const RealDate = Date;
    globalThis.Date = class FakeDate extends RealDate {
      constructor(...a) { if (a.length === 0) super(FROZEN); else super(...a); }
      static now() { return FROZEN; }
    };
    globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
    ready = true;
  };
  // The legacy store is a module singleton; find the temp copy this run spawned (it has store.js).
  const store = async () => {
    const base = os.tmpdir();
    const dirs = fs.readdirSync(base)
      .filter(d => d.startsWith('nexus-gaps-') && fs.existsSync(path.join(base, d, 'store.js')))
      .map(d => ({ d, t: fs.statSync(path.join(base, d)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    if (!dirs.length) throw new Error('no legacy temp dir with store.js');
    return import(pathToFileURL(path.join(base, dirs[0].d, 'store.js')).href);
  };
  const withState = async (st, fn) => {
    setup();
    const St = await store();
    St.load({ resources: [], jobs: [], threads: [], settings: {}, game: {} });
    St.state.game = st.game;
    St.state.resources = st.resources || [];
    return fn(St);
  };
  return {
    suggest: {
      buildProfiles: (m, [jobs, links]) => { const p = m.buildProfiles(jobs, id => links[id]); return { profiles: p.map(plainProfile), common: [...(p.common || [])] }; },
      suggestTop: (m, [r, jobs, links, ids, n]) => m.suggestTop(r, m.buildProfiles(jobs, id => links[id]), () => jobs.filter(j => ids.includes(j.id)), n).map(x => ({ ...x, job: x.job.id })),
      suggest: (m, [r, jobs, links, ids]) => plainSug(m.suggest(r, m.buildProfiles(jobs, id => links[id]), () => jobs.filter(j => ids.includes(j.id)))),
      suggestMany: (m, [list, jobs, links, ids]) => m.suggestMany(list, jobs, id => links[id], () => jobs.filter(j => ids.includes(j.id))).map(x => ({ r: x.r.id, s: plainSug(x.s) }))
    },
    exporters: {
      pick: (m, [state, o]) => m.pick(state, o).map(r => r.id),
      missionTask: (m, [thread, byId]) => m.missionTask(thread, id => byId[id]),
      markdownAll: (m, [state, o]) => { setup(); return m.markdownAll(state, o); },
      icsFor: (m, [events, o]) => { setup(); return m.icsFor(events, o && o.now ? { ...o, now: new Date(o.now) } : o); }
    },
    game: {
      progress: (m, [st]) => withState(st, () => m.progress()),
      award: (m, [st, kind, times, label]) => withState(st, () => m.award(kind, times, label)),
      focusDone: (m, [st, minutes]) => withState(st, St => {
        const out = m.focusDone(minutes);
        return { result: out, focus: St.state.game.focus, today: m.focusToday() };
      }),
      focusToday: (m, [st]) => withState(st, () => m.focusToday()),
      unlock: (m, [st]) => withState(st, () => m.unlock())
    }
  };
})();

// ---- comparing outputs the way the Dart tests do: key order ignored, numbers rounded to 6 places ----
const rnd = (k, x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1e6) / 1e6 : x);
const stable = x => Array.isArray(x) ? '[' + x.map(stable).join(',') + ']' : (x && typeof x === 'object') ? '{' + Object.keys(x).sort().map(k => JSON.stringify(k) + ':' + stable(x[k])).join(',') + '}' : JSON.stringify(x);
const canon = v => stable(JSON.parse(JSON.stringify(v === undefined ? null : v, rnd) ?? 'null'));
const clone = v => JSON.parse(JSON.stringify(v));
const replaceShared = (v, shared) => v === '$RS' ? shared : Array.isArray(v) ? v.map(x => replaceShared(x, shared)) : (v && typeof v === 'object') ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, replaceShared(x, shared)])) : v;

// ---- coverage -> list of never-run lines ----
function analyse(src, entry) {
  const len = src.length, cov = new Int32Array(len).fill(-1), rs = []; let idx = 0;
  for (const f of entry.functions) for (const r of f.ranges) rs.push({ s: r.startOffset, e: r.endOffset, c: r.count, i: idx++ });
  rs.sort((a, b) => a.s - b.s || b.e - a.e || a.i - b.i);
  for (const r of rs) cov.fill(r.c, r.s, Math.min(r.e, len));
  const lines = src.split('\n'); let off = 0, inBlock = false, total = 0, never = 0; const blocks = []; let cur = null;
  lines.forEach((L, li) => {
    const t = L.trim(); let comment = false;
    if (inBlock) { comment = true; if (t.includes('*/')) inBlock = false; }
    else if (t.startsWith('/*')) { comment = true; if (!t.includes('*/')) inBlock = true; }
    else if (t.startsWith('//')) comment = true;
    if (!comment && /[A-Za-z0-9_$]/.test(t)) {
      total++;
      let unc = false;
      for (let k = 0; k < L.length; k++) if (/[A-Za-z0-9_$'"`]/.test(L[k]) && cov[off + k] === 0) { unc = true; break; }
      if (unc) {
        never++;
        if (cur && li + 1 - cur.to <= 2) cur.to = li + 1; else { cur = { from: li + 1, to: li + 1, text: t.slice(0, 100) }; blocks.push(cur); }
      }
    }
    off += L.length + 1;
  });
  return { total, never, blocks };
}

async function runOne(mod, jsDir) {
  const file = path.join(jsDir, mod + '.js');
  if (!fs.existsSync(file)) return { module: mod, skip: 'no legacy file ' + mod + '.js (nothing to measure)' };
  const g = JSON.parse(fs.readFileSync(path.join(GOLD, mod + '.json'), 'utf8'));
  let shared = null; try { shared = JSON.parse(fs.readFileSync(path.join(GOLD, '_shared_links.json'), 'utf8')); } catch (e) { /* none */ }
  const session = new inspector.Session(); session.connect();
  const post = (m, p) => new Promise((res, rej) => session.post(m, p, (e, r) => (e ? rej(e) : res(r))));
  await post('Profiler.enable'); await post('Profiler.startPreciseCoverage', { callCount: true, detailed: true });
  const url = pathToFileURL(file).href; let M;
  try { M = await import(url); } catch (e) { return { module: mod, skip: 'import failed: ' + String(e && e.message).slice(0, 140) }; }
  const mismatches = []; let ok = 0;
  for (const c of g.cases) {
    let got, threw = null;
    try {
      const args = clone(replaceShared(c.in, shared)), w = (WRAP[mod] || {})[c.fn], target = M[c.fn];
      got = w ? await w(M, args) : typeof target === 'function' ? await target(...args) : target;
    } catch (e) { threw = e; }
    const exp = c.out, wantThrow = exp && typeof exp === 'object' && !Array.isArray(exp) && Object.keys(exp).length === 1 && 'throws' in exp;
    const same = wantThrow ? !!threw : (!threw && canon(got) === canon(exp));
    if (same) ok++; else mismatches.push({ fn: c.fn, note: c.note || '', why: threw ? 'threw ' + String(threw.message).slice(0, 60) : 'different output' });
  }
  const { result } = await post('Profiler.takePreciseCoverage');
  const entry = result.find(r => r.url === url);
  const a = entry ? analyse(fs.readFileSync(file, 'utf8'), entry) : { total: 0, never: 0, blocks: [] };
  return { module: mod, cases: g.cases.length, ok, mismatches, ...a };
}

function show(r) {
  if (r.skip) return '  ' + r.module.padEnd(12) + ' skipped: ' + r.skip;
  const pct = r.total ? Math.round(100 * (r.total - r.never) / r.total) : 0;
  return '  ' + r.module.padEnd(12) + ' cases ' + String(r.cases).padStart(4) + '   replay mismatches ' + String(r.mismatches.length).padStart(3) +
    '   code lines ' + String(r.total).padStart(4) + '   never run ' + String(r.never).padStart(4) + '   (' + pct + '% run)';
}

async function main() {
  const oneIdx = argv.indexOf('--one');
  if (oneIdx >= 0) { const r = await runOne(argv[oneIdx + 1], opt('--js', LEGACY)); process.stdout.write('\n' + MARK + JSON.stringify(r) + '\n'); process.exit(0); }
  if (!fs.existsSync(GOLD) || !fs.existsSync(LEGACY)) { console.error('Run this from the kit root: needs legacy/web-src/js and fixtures/golden here (or pass --root <dir>).'); process.exit(2); }
  const all = argv.includes('--all');
  const skipNext = new Set(['--root', '--max']);
  const names = argv.filter((a, i) => !a.startsWith('--') && !skipNext.has(argv[i - 1]));
  const mods = all ? fs.readdirSync(GOLD).filter(f => f.endsWith('.json') && !f.startsWith('_') && f !== 'store_ops.json').map(f => f.slice(0, -5)).sort() : names;
  if (!mods.length) { console.error('Usage: node tools/golden_gaps.mjs <module> [<module> ...]   or   --all'); process.exit(2); }
  // The legacy files are ES modules named .js: copy them next to a package.json that says so, so any Node can import them.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-gaps-'));
  fs.cpSync(LEGACY, tmp, { recursive: true }); fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');
  const rows = [];
  for (const m of mods) {
    if (!fs.existsSync(path.join(GOLD, m + '.json'))) { rows.push({ module: m, skip: 'no golden file fixtures/golden/' + m + '.json' }); continue; }
    const p = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--one', m, '--js', tmp, '--root', ROOT], { encoding: 'utf8', maxBuffer: 1 << 28 });
    const line = (p.stdout || '').split('\n').find(l => l.startsWith(MARK));
    rows.push(line ? JSON.parse(line.slice(MARK.length)) : { module: m, skip: 'replay crashed: ' + String(p.stderr || '').trim().split('\n').slice(-1)[0].slice(0, 140) });
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('Golden gaps: lines of the original JS that no golden case ever runs (fewer is better)');
  for (const r of rows) {
    console.log(show(r));
    if (!all && !r.skip) {
      for (const x of r.mismatches.slice(0, 5)) console.log('      replay differs: ' + x.fn + (x.note ? ' (' + x.note + ')' : '') + ' - ' + x.why);
      r.blocks.slice(0, MAX).forEach(b => console.log('      L' + (b.from === b.to ? b.from : b.from + '-' + b.to) + '  ' + b.text));
      if (r.blocks.length > MAX) console.log('      ... ' + (r.blocks.length - MAX) + ' more blocks (use --max)');
    }
  }
}
main();
