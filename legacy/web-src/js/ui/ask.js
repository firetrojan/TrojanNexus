// ui/ask.js - "Ask the Nexus": the Can-I-do-X search. Words must all match (or any, if you switch), best fields first.
import { h, domainOf, debounce, plural } from '../util.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import * as sfx from '../sfx.js';
import { search, highlight, threadsFor, FIELD_LABEL, stem } from '../search.js';
import { suggestFix } from '../spell.js';
import { app, setHighlight, showInGalaxy } from './app.js';
import { openPanel, closePanel, getPanel, btn, chip, ico, monogram, segmented, TYPE_LABEL, STATUS_LABEL } from './kit.js';
import { copyAsTask } from './share.js';
import { labelOf } from '../fields.js';

export const EXAMPLES = ['find who owns a company', 'where was this photo taken', 'find a scholarship', 'track a flight', 'check a username', 'find a research paper'];
const S = { q: '', mode: 'and', types: new Set(), statuses: new Set(), res: null, shown: 30 };
const recent = () => (Array.isArray(store.state.settings.recent) ? store.state.settings.recent : []);
function remember(q) {
  q = q.trim(); if (q.length < 3) return;
  const r = [q, ...recent().filter(x => x.toLowerCase() !== q.toLowerCase())].slice(0, 6);
  store.state.settings.recent = r; store.save();
}

export function openAsk(prefill) {
  if (typeof prefill === 'string') S.q = prefill;
  const p = openPanel('search', { kind: 'overlay', bare: true, cls: 'search', live: false, render: build });
  if (typeof prefill === 'string' && p.input) { p.input.value = S.q; run(); }
  return p;
}

function build(p) {
  if (p._built) { if (p.input) setTimeout(() => p.input.focus(), 50); run(); return; }
  p._built = true;
  const input = p.input = h('input.in.q-in', { type: 'search', enterkeyhint: 'search', placeholder: 'Can I… find who owns a company?', value: S.q, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Search or ask' });
  const clear = h('button.q-x', { type: 'button', 'aria-label': 'Clear', html: icon('close', 'sm'), onclick: () => { input.value = ''; S.q = ''; input.focus(); run(); } });
  const go = debounce(() => { S.q = input.value; S.shown = 30; run(); }, 110);
  input.addEventListener('input', () => { go(); clear.classList.toggle('hide', !input.value); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { go.flush(); input.blur(); } });
  clear.classList.toggle('hide', !S.q);
  p.nav.append(h('div.q-wrap', h('span.ico-s', { html: icon('search') }), input, clear), btn('Cancel', { cls: 'ghost', onclick: () => closePanel('search') }));
  p.filters = h('div.filters'); p.out = h('div.s-out');
  p.body.append(p.filters, p.out);
  drawFilters(p); run();
  setTimeout(() => input.focus(), 280);
}

function drawFilters(p) {
  const seg = segmented([{ v: 'and', l: 'All words' }, { v: 'or', l: 'Any word' }], S.mode, m => { S.mode = m; drawFilters(p); run(); });
  const types = store.TYPES.map(t => chip(TYPE_LABEL[t], { on: S.types.has(t), cls: 't', onclick: () => { S.types.has(t) ? S.types.delete(t) : S.types.add(t); drawFilters(p); run(); } }));
  const sts = store.STATUSES.map(t => chip(STATUS_LABEL[t], { on: S.statuses.has(t), cls: t === 'testing' ? 'warn' : '', onclick: () => { S.statuses.has(t) ? S.statuses.delete(t) : S.statuses.add(t); drawFilters(p); run(); } }));
  p.filters.replaceChildren(seg, h('div.chips.scrollx', types, sts));
}

function run() {
  const p = getPanel('search'); if (!p || !p.out) return;
  const q = S.q.trim();
  if (!q) { S.res = null; return drawEmpty(p); }
  S.res = search(store.state.resources, q, { mode: S.mode, types: S.types, statuses: S.statuses });
  S.res.relaxed = 0;
  // "All words" found nothing: show the closest partial matches instead of a dead end
  if (!S.res.results.length && S.mode === 'and' && S.res.tokens.length > 1) {
    const any = search(store.state.resources, q, { mode: 'or', types: S.types, statuses: S.statuses });
    const top = any.results.length ? any.results[0].matched : 0;
    if (top > 0) S.res = { tokens: any.tokens, results: any.results.filter(x => x.matched === top), relaxed: top };
  }
  drawResults(p);
}

function drawEmpty(p) {
  const rc = recent();
  p.out.replaceChildren(
    h('div.s-hero', h('div.big', { html: icon('radar', 'lg') }), h('h3', 'Ask in plain words'), h('p.dim', 'Describe the job, not the website. Search looks at what each resource is for, what it can do, and its name and tags.')),
    rc.length ? h('div', h('div.cap.s-cap', 'Recent'), h('div.chips', rc.map(x => chip(x, { icon: 'clock', onclick: () => setQ(x) })))) : null,
    h('div', h('div.cap.s-cap', 'Try'), h('div.chips', EXAMPLES.map(x => chip(x, { cls: 't', onclick: () => setQ(x) })))),
    h('p.hint', 'Tip: all your words must match. If you get nothing, switch to "Any word" or use fewer words. Lines you write under "Use it when" rank highest, so describe each resource the way you would ask for it.'));
}
function setQ(x) { const p = getPanel('search'); S.q = x; S.shown = 30; if (p && p.input) p.input.value = x; const c = p && p.nav.querySelector('.q-x'); if (c) c.classList.remove('hide'); run(); sfx.feel('tap'); }

function snippet(text, toks) {
  const t = String(text || ''), low = t.toLowerCase(); let at = -1;
  for (const w of toks) { const i = low.indexOf(w.slice(0, Math.max(3, w.length - 2))); if (i >= 0 && (at < 0 || i < at)) at = i; }
  if (at < 0 || t.length < 140) return t.length > 140 ? t.slice(0, 138) + '…' : t;
  const a = Math.max(0, at - 50); return (a ? '…' : '') + t.slice(a, a + 130) + (a + 130 < t.length ? '…' : '');
}
function lineFor(r, field, toks) {
  const stems = toks.map(stem);
  const hits = l => { const lo = l.toLowerCase(); return toks.reduce((n, w, i) => n + (lo.includes(w) || lo.includes(stems[i]) ? 1 : 0), 0); };
  const pickLine = arr => arr.reduce((best, l) => (hits(l) > hits(best) ? l : best), arr[0]);
  if (field === 'useWhen') return r.useWhen.length ? pickLine(r.useWhen) : '';
  if (field === 'capabilities') return r.capabilities.length ? pickLine(r.capabilities) : '';
  if (field === 'tags') return r.tags.filter(t => toks.some((w, i) => t.includes(w) || t.includes(stems[i]))).map(t => '#' + t).join('  ');
  if (field === 'inputs' || field === 'outputs') return r[field];
  if (field === 'notes') return snippet(r.notes, toks);
  if (field === 'fields') { const hit = Object.entries(r.fields || {}).filter(([, v]) => toks.some((w, i) => String(v).toLowerCase().includes(w) || String(v).toLowerCase().includes(stems[i]))); return (hit.length ? hit : Object.entries(r.fields || {}).slice(0, 2)).slice(0, 2).map(([k, v]) => labelOf(k, store.customFields()) + ': ' + v).join('  ·  '); }
  return '';
}

function drawResults(p) {
  const { tokens, results } = S.res, q = S.q.trim(), n = results.length;
  const out = [];
  out.push(h('div.s-head', h('div.grow', h('b', n), ' ', n === 1 ? 'match' : 'matches', tokens.length ? h('span.dim.small', '  for ' + tokens.join(' ' + (S.mode === 'and' ? '+' : '/') + ' ')) : null),
    n ? h('div.row', btn('Copy as task', { cls: 'sm', icon: 'copy', onclick: () => copyAsTask(results.slice(0, 12).map(x => x.r), { title: q ? 'Try: ' + q : 'From Nexus', goal: q }) }), btn('Show in galaxy', { cls: 'sm', icon: 'galaxy', onclick: () => lightUp(results.map(x => x.r.id), q) })) : null));
  const fix = !n || S.res.relaxed ? suggestFix(store.state.resources, q, { mode: S.mode, types: S.types, statuses: S.statuses }) : null;
  if (fix) out.push(h('div.row.wrap.dym', h('span.dim.small', 'Did you mean'), chip(fix.q + ' (' + fix.n + ')', { cls: 'good', onclick: () => setQ(fix.q) }), h('span.dim.small', '?')));
  if (S.res.relaxed) out.push(h('p.hint.relax', 'Nothing matches all ' + tokens.length + ' words. These are the closest: each matches ' + S.res.relaxed + ' of ' + tokens.length + ' (' + tokens.join(', ') + '). Words that matched are highlighted.'));
  if (!n) {
    out.push(h('div.empty', h('div.big', { html: icon('search', 'lg') }), h('b', 'Nothing matches "' + q + '"'), h('p', S.mode === 'and' && tokens.length > 1 ? 'All words must match right now. Try "Any word", or fewer words.' : 'Try another word, or add the resource you were thinking of with the + button.'),
      h('div.row.wrap', S.mode === 'and' && tokens.length > 1 ? btn('Try any word', { cls: 'sm', onclick: () => { S.mode = 'or'; drawFilters(p); run(); } }) : null, btn('Add something new', { cls: 'sm pri', icon: 'plus', onclick: () => { closePanel('search'); app.open.quickadd({ text: q }); } }))));
    return p.out.replaceChildren(...out);
  }
  const th = threadsFor(results.map(x => x.r.id), store.state.threads).slice(0, 3);
  if (th.length) out.push(h('div.s-th', h('span.cap', 'Missions that use these'), h('div.chips', th.map(x => chip(x.t.name + ' · ' + x.n, { icon: 'mission', cls: 'warn', onclick: () => { remember(q); closePanel('search'); app.open.missions(x.t.id); } })))));
  const list = h('div.list');
  results.slice(0, S.shown).forEach(({ r, fields }) => {
    const lines = fields.filter(f => f !== 'type' && f !== 'title').slice(0, 2).map(f => { const t = lineFor(r, f, tokens); return t ? h('div.mline', h('span.mf', FIELD_LABEL[f]), h('span', { html: highlight(t, tokens) })) : null; });
    list.appendChild(h('button.card.res' + (r.status === 'archived' ? '.arch' : ''), { type: 'button', onclick: () => openResult(r.id, results.map(x => x.r.id), q) },
      monogram(r, 40), h('div.grow', h('div.t', { html: highlight(r.title, tokens) }), h('div.s', domainOf(r.url) || (r.tags.slice(0, 3).map(t => '#' + t).join(' '))), lines,
        h('div.meta', chip(TYPE_LABEL[r.type], { cls: 't' }), r.draft ? chip('To review', { cls: 'warn', icon: 'scan' }) : null, r.status !== 'active' ? chip(STATUS_LABEL[r.status], { cls: r.status === 'testing' ? 'warn' : '' }) : null))));
  });
  out.push(list);
  if (n > S.shown) out.push(h('div.row', { style: { justifyContent: 'center', marginTop: '12px' } }, btn('Show ' + Math.min(30, n - S.shown) + ' more', { cls: 'sm', onclick: () => { S.shown += 30; drawResults(p); } })));
  p.out.replaceChildren(...out);
}

function lightUp(ids, q) {
  remember(q); closePanel('search'); app.open.closeViews(); setHighlight(ids.slice(0, 120), 'matches');
  if (app.scene && app.ok) { app.scene.clearSelection(); app.scene.frameIds(ids.slice(0, 120)); }
  sfx.feel('open');
}
function openResult(id, ids, q) {
  remember(q); closePanel('search'); setHighlight(ids.slice(0, 120), 'matches'); showInGalaxy(id); app.open.detail(id, { fly: false });
}
app.open.search = openAsk;
