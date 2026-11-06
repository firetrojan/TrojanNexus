// ui/scan.js - the "What is it about?" card for one item, and the bulk "Guess topics" / "Look up online" boxes.
// The offline guess is always there. The online look is an extra: it reads the real page or account when the internet is available.
import { h, plural, fmtDate, domainOf } from '../util.js';
import * as store from '../store.js';
import * as game from '../game.js';
import * as sfx from '../sfx.js';
import { analyse, lookupResource, buildPatch, runBatch, errorText, isOnline, isFramed, igHandle, skipReason, READER_DEFAULT } from '../lookup.js';
import { TOPIC_BY_ID, BASIS_LABEL } from '../topics.js';
import { btn, chip, ico, toast, dialog, confirmBox, promptBox } from './kit.js';

// ---------- settings and status ----------
export const webSettings = () => ({ web: store.getSetting('web') !== false, webMode: store.getSetting('webMode') || 'auto', webReader: store.getSetting('webReader') || '', webSkip: store.getSetting('webSkip') || [], webPace: +store.getSetting('webPace') || 0 });
/** { ok, text } - can an online look be tried right now? */
export function webStatus() {
  const s = webSettings();
  if (!s.web) return { ok: false, off: true, text: 'Online lookup is switched off. Turn it on in Profile.' };
  if (!isOnline()) return { ok: false, text: 'No internet right now. The offline guess still works.' };
  return { ok: true, text: isFramed() ? 'This copy runs inside another page, so the internet may be blocked here.' : '' };
}
/** Seconds-ish between lookups. The free reader allows about 20 a minute, so the default is a little slower than that. */
export const paceFor = s => s.webPace > 0 ? s.webPace : (s.webMode === 'direct' ? 450 : (String(s.webReader || '').trim() ? 1500 : 3200));

const CONF_CLS = { clear: 'good', maybe: 't', none: 'warn' };
const BASIS_SHORT = { bio: 'from the bio', page: 'from the page', name: 'from the name only', link: 'from the link only' };
const VIA = { offline: 'name and link only', direct: 'the page', reader: 'the page', github: 'GitHub', wikipedia: 'Wikipedia' };

/** Topic chips for a result (or a stored scan). */
export function topicChips(x) {
  const lab = x.label || (TOPIC_BY_ID[x.topic] || {}).label || '', lab2 = x.label2 || (TOPIC_BY_ID[x.topic2] || {}).label || '';
  if (!x.topic) return [chip('Not clear', { cls: 'warn', icon: 'info' })];
  return [chip(lab + (lab2 ? ' + ' + lab2 : ''), { cls: CONF_CLS[x.conf] || 't', icon: 'spark' }), chip(BASIS_SHORT[x.basis] || '', { cls: '' })];
}
const fromStored = sc => ({ ok: true, via: sc.via, topic: sc.topic, topic2: sc.topic2, conf: sc.conf, basis: sc.basis, desc: sc.desc, site: sc.site, at: sc.at, stored: true, label: (TOPIC_BY_ID[sc.topic] || {}).label || '', label2: (TOPIC_BY_ID[sc.topic2] || {}).label || '' });

export function applyResult(r, res, mode = 'fill') {
  const { patch, changes } = buildPatch(r, res, mode);
  store.updateResource(r.id, patch);
  return changes;
}

// ---------- the card on one item ----------
const S = new Map();
const stOf = id => { let s = S.get(id); if (!s) S.set(id, s = { busy: false, res: null, err: null, bio: '' }); return s; };
export const forgetScan = id => S.delete(id);

export function scanSection(r, redraw) {
  const s = stOf(r.id), ig = igHandle(r.url), web = webStatus();
  const off = analyse(r, null, { bio: s.bio });
  const stored = r.scan && r.scan.via !== 'offline' ? fromStored(r.scan) : null;
  const res = s.res || (s.bio ? off : (stored || off));
  const kind = ig ? 'account' : 'site';
  const summary = s.res ? s.res.summary : (stored && !s.bio ? 'Last looked ' + fmtDate(r.scan.at) + ' at ' + (VIA[r.scan.via] || 'the page') + '.' : off.summary);
  const quote = res.desc ? h('p.scan-quote', '“' + res.desc + '”') : null;
  const canApply = !res.stored && (res.topic || res.desc || res.notes);
  const look = async () => {
    if (!web.ok) { toast(web.text, { icon: 'info', ms: 5000 }); return; }
    s.busy = true; s.err = null; redraw(); sfx.feel('tap');
    const out = await lookupResource(store.byId(r.id) || r, webSettings(), { extra: { bio: s.bio } });
    s.busy = false; s.res = out.result; s.err = out.ok ? null : out.error; redraw();
  };
  const paste = async () => {
    const v = await promptBox({ title: ig ? 'Paste the bio' : 'Paste text about it', text: ig ? 'Copy the bio (and a few captions if you like) from the Instagram profile and paste it here. Nexus reads only what you paste.' : 'Paste a description or a few lines from the page.', fields: [{ key: 't', label: '', type: 'textarea', rows: 6, value: s.bio, placeholder: ig ? 'Bio and captions' : 'Text' }], ok: 'Read it' });
    if (v) { s.bio = v.t.trim(); s.res = null; s.err = null; redraw(); }
  };
  const use = () => {
    const x = s.res || off;
    const ch = applyResult(store.byId(r.id) || r, x, 'fill'); game.award('scan', 1, r.title.slice(0, 30)); sfx.feel('ok');
    toast(ch.length ? 'Filled in: ' + ch.join(', ') + '.' : 'Nothing new to fill. Your fields already have text.', { icon: 'check', ms: 4200 });
  };
  const replace = async () => {
    const x = s.res || off;
    if (await confirmBox({ title: 'Replace your text?', text: 'This overwrites "Use it when", "What it can do" and the note with the guess. You can edit them afterwards.', ok: 'Replace', danger: true })) { applyResult(store.byId(r.id) || r, x, 'replace'); toast('Replaced.', { icon: 'check' }); }
  };
  const hasText = r.useWhen.length || r.capabilities.length;
  return h('section.d-sec', h('div.sec-h', h('h3', 'What is it about?')),
    h('div.group.pad.scanbox',
      h('div.chips', topicChips(res)),
      h('p.scan-sum', summary),
      quote,
      s.err ? h('div.hint.warn', errorText(s.err, { framed: isFramed() })) : null,
      s.res && s.res.via !== 'offline' && !s.err ? h('p.dim.small', 'Read from ' + (VIA[s.res.via] || 'the page') + ' just now. It is a guess made by Nexus from the words it found: check it before you rely on it.') : null,
      h('div.d-acts',
        btn(s.busy ? 'Reading…' : (stored || s.res ? 'Look again' : 'Look at it online'), { cls: 'sm' + (web.ok ? ' pri' : ''), icon: 'signal', disabled: s.busy || !r.url, onclick: look }),
        canApply ? btn('Use this', { cls: 'sm' + (!web.ok ? ' pri' : ''), icon: 'check', disabled: s.busy, onclick: use }) : null,
        btn(ig ? 'Paste bio' : 'Paste text', { cls: 'sm', icon: 'edit', disabled: s.busy, onclick: paste })),
      canApply && hasText ? h('button.lnk', { type: 'button', onclick: replace }, 'Replace my "Use it when" and "Can do" with this') : null,
      !web.ok && !web.off ? h('p.dim.small', web.text) : null,
      web.ok && web.text ? h('p.dim.small', web.text) : null,
      web.off ? h('p.dim.small', web.text) : null,
      h('p.dim.small', 'The guess works offline, from words only. "Look at it online" also reads the real ' + (kind === 'account' ? 'account' : 'page') + ' when the internet is there.')));
}

// ---------- bulk: Guess topics (offline) ----------
const tally = (list, key) => { const m = new Map(); list.forEach(x => { if (x[key]) m.set(x[key], (m.get(x[key]) || 0) + 1); }); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
const topicRows = results => tally(results.filter(x => x.topic), 'label').slice(0, 8).map(([l, n]) => chip(l + ' ' + n, { cls: 't' }));

export function bulkGuess(ids) {
  const items = ids.map(store.byId).filter(Boolean).filter(r => !(r.scan && r.scan.via !== 'offline'));
  if (!items.length) { toast('Everything here was already looked at.', { icon: 'info' }); return Promise.resolve(null); }
  return dialog((box, done) => {
    box.classList.add('form', 'lookbox');
    const intro = () => box.replaceChildren(h('h3', 'Guess topics'),
      h('p', 'Guess what ' + plural(items.length, 'item') + (items.length === 1 ? ' is' : ' are') + ' about from names, links and your notes. This works offline. Empty fields get filled; text you wrote is never changed.'),
      h('div.dlg-actions', btn('Cancel', { onclick: () => done(null) }), btn('Guess', { cls: 'pri', onclick: go })));
    const go = () => {
      const results = [], patches = new Map();
      for (const r of items) { const res = analyse(r, null); results.push(res); patches.set(r.id, buildPatch(r, res, 'fill').patch); }
      store.bulkUpdate(items.map(r => r.id), r => patches.get(r.id) || {}, { includeLocked: true });
      game.award('scan', items.length, items.length + ' guesses'); sfx.feel('ok');
      const got = results.filter(x => x.topic).length;
      box.replaceChildren(h('h3', 'Done'),
        h('p', got + ' of ' + items.length + ' could be guessed. ' + (items.length - got) + ' are not clear from the name alone (many are people’s names or short words).'),
        h('div.chips.centered', topicRows(results)),
        h('p.dim.small', 'These stay marked "to review". "Look up online" can read the real pages for the rest.'),
        h('div.dlg-actions', btn('Done', { cls: 'pri', onclick: () => done(true) })));
    };
    intro();
  }, 'form');
}

// ---------- bulk: Look up online ----------
const REASON = { notfound: 'page not found', denied: 'site refuses automatic reading', blocked: 'could not connect', timeout: 'took too long', server: 'site or reader had an error', wall: 'login or bot wall', empty: 'no readable text', badtype: 'a file, not a page', slow: 'reader asked to slow down', offline: 'no internet', off: 'switched off' };

/** ids: resource ids. Opens a box that explains, runs the lookups politely, shows progress and a summary. */
export function bulkLook(ids, o = {}) {
  const settings = webSettings(), st = webStatus();
  const items = ids.map(store.byId).filter(Boolean);
  if (!st.ok) { toast(st.text, { icon: 'info', ms: 5200 }); return Promise.resolve(null); }
  const todo = items.filter(r => r.url && !(r.scan && r.scan.via !== 'offline'));
  const ok = todo.filter(r => !skipReason(r.url, settings)), skipped = todo.length - ok.length;
  const sites = ok.filter(r => !igHandle(r.url)), accts = ok.filter(r => igHandle(r.url));
  if (!ok.length) { toast(todo.length ? 'Nothing here can be looked up (private-looking or skipped links).' : 'Everything here was already looked up.', { icon: 'info', ms: 4600 }); return Promise.resolve(null); }
  const pace = paceFor(settings);
  return dialog((box, done) => {
    box.classList.add('form', 'lookbox');
    let scope = sites.length ? 'sites' : 'ig', ctl = null;
    const list = () => scope === 'sites' ? sites : (scope === 'ig' ? accts : sites.concat(accts));
    const eta = n => { const m = Math.max(1, Math.round(n * pace / 60000)); return m === 1 ? 'about 1 minute' : 'about ' + m + ' minutes'; };
    const intro = () => {
      const n = list().length;
      box.replaceChildren(h('h3', 'Look up online'),
        h('p', 'Nexus will open each link (through the reader service, ' + (settings.webReader ? 'your own' : 'r.jina.ai') + ') and read what the page says about itself. Keep this screen open.'),
        sites.length && accts.length ? h('div.field', h('label', 'What to look up'), segPick([['sites', 'Websites ' + sites.length], ['ig', 'Instagram ' + accts.length], ['both', 'Both']], scope, v => { scope = v; intro(); })) : null,
        h('p.dim.small', plural(n, 'link') + ', ' + eta(n) + '.' + (skipped ? ' ' + plural(skipped, 'link') + ' skipped because they look private.' : '')),
        scope !== 'sites' ? h('p.dim.small', 'Instagram usually hides bios and posts from visitors who are not logged in. Expect many accounts to stay "not clear" unless the bio shows up.') : null,
        h('p.dim.small', 'What it finds is a guess. It fills only empty fields and keeps items in "to review".'),
        h('div.dlg-actions', btn('Cancel', { onclick: () => done(null) }), btn('Start', { cls: 'pri', onclick: run })));
    };
    const run = async () => {
      const queue = list(), results = new Map(); let pending = [];
      ctl = new AbortController();
      const bar = h('i'), line = h('p.scan-sum', 'Starting…'), sub = h('p.dim.small'), cancel = btn('Stop', { onclick: () => { ctl.abort(); cancel.disabled = true; } });
      box.replaceChildren(h('h3', 'Looking…'), h('div.bar', bar), line, sub, h('div.dlg-actions', cancel));
      const flush = () => { if (!pending.length) return; const batch = pending; pending = []; store.bulkUpdate(batch, r => (results.get(r.id) ? buildPatch(r, results.get(r.id), 'fill').patch : {}), { includeLocked: true }); };
      const sum = await runBatch(queue, {
        settings, signal: ctl.signal, spacing: pace, concurrency: 2,
        onItem: (item, out) => { results.set(item.id, out.result); pending.push(item.id); if (pending.length >= 15) flush(); line.textContent = domainOf(item.url) || item.title; },
        onProgress: p => { bar.style.width = Math.round(100 * p.done / p.total) + '%'; sub.textContent = p.done + ' of ' + p.total + ' · ' + p.ok + ' read' + (p.failed ? ' · ' + p.failed + ' not readable' : '') + (p.skipped ? ' · ' + p.skipped + ' skipped' : ''); }
      });
      flush(); game.award('scan', sum.done, plural(sum.done, 'lookup')); sfx.feel('ok');
      const good = [...results.values()].filter(x => x && x.read), found = good.filter(x => x.topic);
      const why = Object.entries(sum.reasons).map(([k, n]) => n + ' × ' + (REASON[k] || k));
      const stop = sum.paused === 'slow' ? 'The reader service asked Nexus to slow down, so it stopped. Wait a few minutes and run it again; finished items are kept.' : (sum.paused === 'offline' ? 'The internet went away, so it stopped. Finished items are kept.' : (sum.paused === 'cancelled' ? 'Stopped. Finished items are kept.' : ''));
      box.replaceChildren(h('h3', stop ? 'Stopped' : 'Done'),
        h('p', sum.ok + ' of ' + sum.done + ' read. ' + found.length + ' show a clear or likely topic' + (sum.partial ? '; ' + sum.partial + ' accounts did not show a bio' : '') + '.'),
        h('div.chips.centered', topicRows(found)),
        why.length ? h('p.dim.small', 'Not readable: ' + why.join(', ') + '.') : null,
        stop ? h('p.dim.small', stop) : null,
        h('p.dim.small', 'Nothing was marked reviewed. Open "To review" to confirm what is right.'),
        h('div.dlg-actions', btn('Done', { cls: 'pri', onclick: () => done(sum) })));
    };
    intro();
  }, 'form');
}
const segPick = (items, value, on) => h('div.chips', items.map(([v, l]) => chip(l, { on: v === value, cls: 't', onclick: () => on(v) })));
export { READER_DEFAULT };
