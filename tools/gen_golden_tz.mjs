// gen_golden_tz.mjs - answer keys for the clock-reading functions at two wall times.
// The generator runs with TZ=UTC, so freezing Date at 2026-10-31 02:00 UTC and 23:30 UTC
// gives LOCAL wall times 02:00 and 23:30 (iso()/todayISO() use local date parts in JS).
//
//   TZ=UTC node tools/gen_golden_tz.mjs     writes fixtures/golden/tz.json
//
// Format: { module: "tz", wallTimes: ["02:00","23:30"], cases: [ { fn, wall, in, out } ] }.
// The Dart test (tz_test.dart) sets its clock to DateTime(2026,10,31,2,0) / (…,23,30) LOCAL.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.LEGACY || path.join(ROOT, 'legacy/web-src/js/');
const OUT = path.join(ROOT, 'fixtures/golden');
const J = n => import(SRC + n + '.js');
const [Util, Exporters, Home, Rules, Insights, Game, St, Week] = await Promise.all(
  ['util', 'exporters', 'home', 'rules', 'insights', 'game', 'store', 'week'].map(J));

globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };

const WALLS = [
  ['02:00', Date.UTC(2026, 9, 31, 2, 0, 0)],
  ['23:30', Date.UTC(2026, 9, 31, 23, 30, 0)],
];

const clean = v => JSON.parse(JSON.stringify(v, (k, x) => (x instanceof Map ? Object.fromEntries(x) : x instanceof Set ? [...x] : (typeof x === 'number' && !Number.isInteger(x) ? Math.round(x * 1e6) / 1e6 : x))));

// needsItems returns {kind, rank, sub, r}: keep only the fields the answer key records.
const slim = v => {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if ('kind' in v && 'rank' in v && 'sub' in v && 'r' in v && Object.keys(v).length === 4) {
      const r = v.r && typeof v.r === 'object' ? { id: v.r.id } : v.r;
      return { kind: v.kind, rank: v.rank, sub: v.sub, r };
    }
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, slim(x)]));
  }
  return Array.isArray(v) ? v.map(slim) : v;
};

const cases = [];
const rec = (fn, wall, args, out, note) => cases.push({ fn, wall, in: clean(args), out: slim(clean(out === undefined ? null : out)), ...(note ? { note } : {}) });

const res = (rid, x = {}) => ({ id: rid, title: 'Sample ' + rid, url: 'https://' + rid + '.example.org/', status: 'active', tags: [], draft: false, checkCadence: 'none', nextCheck: '', trialEnd: '', fields: {}, useWhen: [], capabilities: [], notes: '', inputs: '', outputs: '', verdict: null, ...x });

// A small resource set with a check due soon and a trial, so "today" shifts the answers.
const resources = [
  res('a1', { checkCadence: 'weekly', nextCheck: '2026-11-02' }),
  res('a2', { status: 'testing', trialEnd: '2026-11-01' }),
  res('a3', { fields: { resets: '2026-11-05' } }),
  res('a4', { status: 'archived' }),
];
const state = { resources, jobs: [], threads: [], settings: {} };
const events = [{ rid: 'a1', kind: 'check', date: '2026-11-02', title: 'Check a1' }];

for (const [wall, frozen] of WALLS) {
  const RealDate = Date;
  globalThis.Date = class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(frozen); else super(...a); }
    static now() { return frozen; }
  };
  St.load({ resources: [], jobs: [], threads: [], settings: {}, game: {} });
  St.state.resources = resources;

  // util: todayISO() and addDays with a bad/empty date fall back to "now".
  rec('util.todayISO', wall, [], Util.todayISO());
  rec('util.addDays', wall, ['', 3], Util.addDays('', 3), 'empty date means today');
  rec('util.addDays', wall, ['not-a-date', 1], Util.addDays('not-a-date', 1), 'bad date means today');

  // exporters: markdownAll writes today into the header; upcomingEvents defaults from=todayISO().
  rec('exporters.markdownAll', wall, [state, {}], Exporters.markdownAll(state, {}));
  rec('exporters.upcomingEvents', wall, [resources], Exporters.upcomingEvents(resources));
  // icsFor defaults now = new Date(); the DTSTAMP line carries it.
  rec('exporters.icsFor', wall, [events], Exporters.icsFor(events));

  // home.needsItems defaults today; fns are the store bucket helpers.
  const fns = { dueBucket: St.dueBucket, trialBucket: St.trialBucket, resetBucket: St.resetBucket, watchChanged: St.watchChanged };
  rec('home.needsItems', wall, [resources, 'FN'], Home.needsItems(resources, fns), 'fns are the store bucket helpers');

  // rules: condMatches/matches default today.
  const r1 = res('r1', { status: 'testing', trialEnd: '2026-11-01' });
  rec('rules.condMatches', wall, [r1, { f: 'trialEnd', op: 'within', v: '3' }], Rules.condMatches(r1, { f: 'trialEnd', op: 'within', v: '3' }));
  rec('rules.matches', wall, [r1, { match: 'all', conds: [{ f: 'status', op: 'is', v: 'testing' }] }], Rules.matches(r1, { match: 'all', conds: [{ f: 'status', op: 'is', v: 'testing' }] }));

  // insights.addedPerMonth with an empty today falls back to new Date().
  const many = [res('m1', { createdAt: '2026-05-04' }), res('m2', { createdAt: '2026-10-01' }), res('m3', { createdAt: '2026-10-30' })];
  rec('insights.addedPerMonth', wall, [many, ''], Insights.addedPerMonth(many, ''), 'empty today means now');

  // game: award/focusDone/focusToday/unlock stamp today into days/badges/focus.
  St.state.game = {};
  rec('game.award', wall, ['check', 1], Game.award('check', 1), 'stamps today into days and log');
  St.state.game = { focus: [{ date: '2026-10-30', minutes: 20 }] };
  rec('game.focusDone', wall, [25], { result: Game.focusDone(25), focus: St.state.game.focus, today: Game.focusToday() });
  St.state.game = { counters: { checks: 1 } };
  rec('game.focusToday', wall, [], Game.focusToday());
  St.state.game = { counters: { checks: 1 } };
  rec('game.unlock', wall, [], Game.unlock().map(b => ({ id: b.id, name: b.name, desc: b.desc })));

  // week.weekDigest (week.js L64): openedAt is compared with LOCAL midnight of `from`, where
  // from = addDays(today, -6) = 2026-10-25. The golden carries openedAt as a LOCAL wall-time
  // string; new Date(str).getTime() is that same wall time in ms.
  const wToday = Util.todayISO(), wFrom = Util.addDays(wToday, -6);
  const wallStrings = ['2026-10-24T23:59:59.999', '2026-10-25T00:00:00.000', '2026-10-25T00:00:00.001', 'not-a-date'];
  const weekRes = wallStrings.map((s, i) => ({
    id: 'w' + i, title: 'Sample w' + i, url: 'https://w' + i + '.example.org/', status: 'active',
    createdAt: '2026-10-26', opens: 1, openedAt: s, log: [],
  }));
  const weekMs = weekRes.map(r => ({ ...r, openedAt: new Date(String(r.openedAt)).getTime() }));
  rec('week.weekDigest', wall, [weekRes, null, wToday], Week.weekDigest(weekMs, null, wToday),
      'from ' + wFrom + ' local midnight: opened counts the 00:00:00.000 and 00:00:00.001 entries');

  // store: the functions that stamp today's date into a resource or a mission step. The store's
  // own clock is the frozen wall time, so todayISO() inside the store answers 2026-10-31.
  // NOTE: load() reads the fake localStorage first, so a second load() in the same wall time would
  // replay the earlier saved state instead of the seed (proved: byId('s1') is null after it).
  // resetToSeed() always applies the seed and re-indexes.
  const seedState = () => ({
    resources: [St.normalizeResource({
      id: 's1', title: 'Sample s1', url: 'https://s1.example.org/', status: 'candidate', checkCadence: 'weekly',
    })],
    jobs: [],
    threads: [{ id: 'th1', name: 'Sample mission', steps: [{ rid: 's1', note: '', done: false, doneAt: '' }], lastDone: '' }],
    settings: {},
    game: {},
  });
  const pick = (r, keys) => Object.fromEntries(keys.map(k => [k, r[k]]));
  const reset = () => St.resetToSeed(seedState());

  reset();
  rec('store.addResource', wall, [{ id: 'a1', title: 'Sample added', url: 'https://added.example.org/', status: 'candidate' }],
      pick(St.addResource({ id: 'a1', title: 'Sample added', url: 'https://added.example.org/', status: 'candidate' }),
          ['id', 'createdAt', 'statusSince', 'added', 'nextCheck']), 'added and createdAt come from today');

  reset();
  rec('store.markChecked', wall, ['s1'], pick(St.markChecked('s1'), ['lastChecked', 'nextCheck']), 'checked today, next check from today');

  reset();
  rec('store.startTrial', wall, ['s1', 14], pick(St.startTrial('s1', 14), ['statusSince', 'trialEnd']), 'trial starts today');

  reset();
  rec('store.setVerdict', wall, ['s1', 'keep', 'worth it'], pick(St.setVerdict('s1', 'keep', 'worth it'), ['statusSince', 'verdict']), 'the verdict date is today');

  reset();
  rec('store.snooze', wall, ['s1', 5], pick(St.snooze('s1', 5), ['nextCheck']), 'next check is today + 5 days');

  reset();
  St.setStepDone('th1', 0, true);
  const thread = St.state.threads[0];
  rec('store.setStepDone', wall, ['th1', 0, true], { doneAt: thread.steps[0].doneAt, lastDone: thread.lastDone },
      'mission step doneAt is the frozen instant (the generator ran with TZ=UTC, so the wall clock read as UTC)');
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'tz.json'), JSON.stringify({
  module: 'tz',
  generatedFrom: 'legacy/web-src/js',
  note: 'generated with TZ=UTC; wall times are local wall times',
  wallTimes: WALLS.map(w => w[0]),
  cases,
}, null, 1) + '\n');
console.log('tz: ' + cases.length + ' cases at wall times ' + WALLS.map(w => w[0]).join(', '));
