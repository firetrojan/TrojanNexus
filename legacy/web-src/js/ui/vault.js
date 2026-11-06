// ui/vault.js - the table: sort, filter, select many and change them together. Cards on a phone, a real table on a wide screen.
import { h, domainOf, fmtDate, plural, debounce } from '../util.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import * as game from '../game.js';
import * as sfx from '../sfx.js';
import { app } from './app.js';
import { bulkGuess, bulkLook } from './scan.js';
import { copyAsTask } from './share.js';
import { summaryOf } from '../fields.js';
import { TOPIC_BY_ID } from '../topics.js';
import { openPanel, getPanel, btn, chip, ico, toast, promptBox, actionSheet, monogram, dueChip, nextText, TYPE_LABEL, STATUS_LABEL, CAD_LABEL } from './kit.js';

const V = { q: '', types: new Set(), statuses: new Set(), sector: '', drafts: false, ig: false, sort: 'title', dir: 1, sel: new Set(), selMode: false, shown: 80 };
const SORTS = [['title', 'By name'], ['type', 'By type'], ['status', 'By status'], ['next', 'By due'], ['last', 'By checked'], ['added', 'By saved']];
/** " 2 locked items were skipped." or nothing. */
const lockedNote = o => (o && o.skipped ? ' ' + plural(o.skipped, 'locked item') + (o.skipped === 1 ? ' was' : ' were') + ' skipped.' : '');
const totalCount = () => store.state.resources.filter(r => V.ig || r.src !== 'following').length;
const hay = r => (r.title + ' ' + r.url + ' ' + r.tags.join(' ') + ' ' + r.notes + ' ' + Object.values(r.fields || {}).join(' ')).toLowerCase();

export function openVault(opts = {}) {
  if (opts.drafts !== undefined) V.drafts = !!opts.drafts;
  return openPanel('vault', { kind: 'view', title: 'Vault', render: draw });
}

function rows() {
  const t = V.q.trim().toLowerCase(), set = V.sector ? new Set((store.jobById(V.sector) || { members: [] }).members) : null;
  const a = store.state.resources.filter(r => {
    if (!V.ig && r.src === 'following') return false;
    if (V.types.size && !V.types.has(r.type)) return false;
    if (V.statuses.size ? !V.statuses.has(r.status) : r.status === 'archived') return false;
    if (V.drafts && !r.draft) return false;
    if (set && !set.has(r.id)) return false;
    return !t || hay(r).includes(t);
  });
  const key = { title: r => r.title.toLowerCase(), type: r => r.type, status: r => r.status, next: r => r.nextCheck || '￿', last: r => r.lastChecked || '', added: r => r.added || '' }[V.sort];
  a.sort((x, y) => (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0) * V.dir || x.title.localeCompare(y.title));
  return a;
}

function draw(p) {
  const keepScroll = p.scroller.scrollTop;
  p.setActions(btn(V.selMode ? 'Done' : 'Select', { cls: 'ghost' + (V.selMode ? ' bold' : ''), onclick: () => { V.selMode = !V.selMode; if (!V.selMode) V.sel.clear(); draw(p); } }));
  const total = store.state.resources.filter(r => V.ig || r.src !== 'following').length;
  const list = rows();
  const wide = innerWidth >= 820;
  const q = h('div.fld', h('span.ico-s', { html: icon('search', 'sm') }), h('input.in', { type: 'search', placeholder: 'Filter this list', value: V.q, autocomplete: 'off', 'aria-label': 'Filter the list', oninput: debounce(e => { V.q = e.target.value; V.shown = 80; redrawList(p); }, 120) }));
  const sector = h('select.sel', { 'aria-label': 'Sector', onchange: e => { V.sector = e.target.value; V.shown = 80; draw(p); } }, h('option', { value: '' }, 'All sectors'), store.state.jobs.map(j => h('option', { value: j.id, selected: j.id === V.sector }, j.name + ' (' + j.members.length + ')')));
  const sort = h('select.sel', { 'aria-label': 'Sort by', onchange: e => { V.sort = e.target.value; draw(p); } }, SORTS.map(([v, l]) => h('option', { value: v, selected: v === V.sort }, l)));
  const chips = h('div.chips.scrollx',
    store.TYPES.map(t => chip(TYPE_LABEL[t], { cls: 't', on: V.types.has(t), onclick: () => { V.types.has(t) ? V.types.delete(t) : V.types.add(t); draw(p); } })),
    store.STATUSES.map(t => chip(STATUS_LABEL[t], { cls: t === 'testing' ? 'warn' : '', on: V.statuses.has(t), onclick: () => { V.statuses.has(t) ? V.statuses.delete(t) : V.statuses.add(t); draw(p); } })),
    chip('To review', { cls: 'warn', icon: 'scan', on: V.drafts, onclick: () => { V.drafts = !V.drafts; draw(p); } }),
    chip('Instagram', { cls: 'good', icon: 'nebula', on: V.ig, onclick: () => { V.ig = !V.ig; draw(p); } }));
  p._list = h('div.v-list');
  p.body.replaceChildren(h('div.v-filters', q, h('div.row.vsort', sector, sort, btn('', { cls: 'icon', icon: V.dir > 0 ? 'down' : 'up', title: 'Reverse order', onclick: () => { V.dir *= -1; draw(p); } })), chips,
    h('div.v-count.dim.small', h('b', list.length), ' of ', total, ' shown', V.sel.size ? ' · ' + V.sel.size + ' selected' : '')), p._list, h('div.bulk-space'));
  p._bulk && p._bulk.remove(); p._bulk = null; bulkBar(p, list);
  redrawList(p, list, wide); p.scroller.scrollTop = keepScroll;
}

function redrawList(p, list, wide) {
  list = list || rows(); wide = wide === undefined ? innerWidth >= 820 : wide;
  const cnt = p.body.querySelector('.v-count'); if (cnt) cnt.replaceChildren(h('b', list.length), ' of ', totalCount(), ' shown', V.sel.size ? ' · ' + V.sel.size + ' selected' : '');
  if (!list.length) return p._list.replaceChildren(h('div.empty', h('div.big', { html: icon('vault', 'lg') }), h('b', 'Nothing matches'), h('p', 'Clear a filter or add something new.'), btn('Clear filters', { cls: 'sm', onclick: () => { V.q = ''; V.types.clear(); V.statuses.clear(); V.sector = ''; V.drafts = false; draw(p); } })));
  const part = list.slice(0, V.shown);
  const more = list.length > V.shown ? h('div.row', { style: { justifyContent: 'center', margin: '12px 0' } }, btn('Show ' + Math.min(80, list.length - V.shown) + ' more', { cls: 'sm', onclick: () => { V.shown += 80; redrawList(p, list, wide); } })) : null;
  if (wide) {
    const th = (k, l) => h('th', { class: V.sort === k ? 'on' : '', onclick: () => { if (V.sort === k) V.dir *= -1; else { V.sort = k; V.dir = 1; } draw(getPanel('vault')); } }, l, V.sort === k ? (V.dir > 0 ? ' ▴' : ' ▾') : '');
    p._list.replaceChildren(h('table.vt', h('thead', h('tr', V.selMode ? h('th') : null, th('title', 'Name'), th('type', 'Type'), th('status', 'Status'), h('th', 'Sectors'), h('th', 'Tags'), h('th', 'Check'), th('last', 'Last'), th('next', 'Next'))),
      h('tbody', part.map(r => h('tr', { class: (V.sel.has(r.id) ? 'sel ' : '') + (r.draft ? 'draft' : ''), onclick: () => pick(p, r, list) },
        V.selMode ? h('td', h('span.tick' + (V.sel.has(r.id) ? '.on' : ''))) : null, h('td.nm', h('b', r.title), h('div.dim.small.ell', domainOf(r.url))), h('td', TYPE_LABEL[r.type]), h('td', STATUS_LABEL[r.status]),
        h('td.dim', store.jobsOf(r.id).map(j => j.name).join(', ')), h('td.dim', r.tags.slice(0, 3).join(', ')), h('td', CAD_LABEL[r.checkCadence]), h('td.dim', r.lastChecked ? fmtDate(r.lastChecked) : '—'), h('td', dueChip(r) || nextText(r)))))), more);
  } else {
    p._list.replaceChildren(h('div.list', part.map(r => h('button.card' + (r.draft ? '.draft' : '') + (V.sel.has(r.id) ? '.hot' : '') + (store.dueBucket(r) === 'overdue' || store.dueBucket(r) === 'today' ? '.due' : ''), { type: 'button', onclick: () => pick(p, r, list) },
      V.selMode ? h('span.tick' + (V.sel.has(r.id) ? '.on' : '')) : null, monogram(r, 40),
      h('div.grow', h('div.t', r.title), h('div.s', domainOf(r.url) || r.tags.slice(0, 3).map(t => '#' + t).join(' ')),
        h('div.meta', chip(TYPE_LABEL[r.type], { cls: 't' }), r.locked ? chip('Locked', { icon: 'lock' }) : null, store.watchChanged(r) ? chip('Page changed', { cls: 'warn', icon: 'alert' }) : null, r.scan && r.scan.topic ? chip((TOPIC_BY_ID[r.scan.topic] || {}).label || r.scan.topic, { icon: 'spark' }) : null, r.status !== 'active' ? chip(STATUS_LABEL[r.status], { cls: r.status === 'testing' ? 'warn' : '' }) : null, r.checkCadence !== 'none' ? chip(CAD_LABEL[r.checkCadence], { icon: 'clock' }) : null, (r.fields && r.fields.cost) ? chip(r.fields.cost, { cls: 'good' }) : null, dueChip(r), store.jobsOf(r.id).slice(0, 2).map(j => chip(j.name, { dot: true, color: j.color }))))))), more);
  }
}
function pick(p, r, list) {
  if (!V.selMode) return app.open.detail(r.id);
  V.sel.has(r.id) ? V.sel.delete(r.id) : V.sel.add(r.id); sfx.feel('tap', 4); redrawList(p, list); bulkBar(p, list);
}

function bulkBar(p, list) {
  if (p._bulk) p._bulk.remove();
  if (!V.selMode) return;
  const ids = [...V.sel], n = ids.length;
  const bar = p._bulk = h('div.bulk', h('b', n), h('span.dim', ' selected'), h('span.grow'),
    btn('All', { cls: 'ghost sm', onclick: () => { list.forEach(r => V.sel.add(r.id)); redrawList(p, list); bulkBar(p, list); } }),
    btn('Compare', { cls: 'ghost sm', disabled: n < 2 || n > 4, title: 'Pick 2 to 4', onclick: () => app.open.compare(ids) }),
    btn('Stage', { cls: 'ghost sm', disabled: !n, onclick: () => actionSheet({ title: 'Move ' + plural(n, 'resource') + ' to', items: store.STATUSES.map(st => ({ label: STATUS_LABEL[st], icon: st === 'archived' ? 'layers' : (st === 'testing' ? 'flag' : 'check'), run: () => { const o = store.bulkUpdate(ids, () => ({ status: st })); if (st === 'archived') game.award('archive', o.changed, plural(o.changed, 'item') + ' archived'); V.sel.clear(); toast(plural(o.changed, 'resource') + ' moved to ' + STATUS_LABEL[st] + '.' + lockedNote(o), { icon: 'flag' }); } })) }) }),
    btn('Sector', { cls: 'ghost sm', disabled: !n, onclick: () => actionSheet({ title: 'Also show in', items: store.state.jobs.filter(j => !j.rule).map(j => ({ label: j.name, color: j.color, run: () => { ids.forEach(id => store.addToJob(j.id, id, true)); store.addToJob(j.id, ids[ids.length - 1]); toast(plural(n, 'resource') + ' added to ' + j.name + '.', { icon: 'layers' }); } })) }) }),
    btn('More', { cls: 'ghost sm', disabled: !n, onclick: () => actionSheet({ title: plural(n, 'resource') + ' selected', items: [
      { label: 'Copy as task', sub: 'One task for your to-do app', icon: 'copy', run: () => copyAsTask(ids.map(store.byId).filter(Boolean)) },
      { label: 'Archive', icon: 'layers', run: () => { const o = store.bulkUpdate(ids, () => ({ status: 'archived' })); game.award('archive', o.changed, plural(o.changed, 'item') + ' archived'); V.sel.clear(); toast(plural(o.changed, 'resource') + ' archived.' + lockedNote(o), { icon: 'layers' }); } },
      { label: 'Check how often…', icon: 'clock', run: () => actionSheet({ title: 'Check how often', items: store.CADENCES.map(c => ({ label: CAD_LABEL[c], icon: 'clock', run: () => { const o = store.bulkUpdate(ids, () => ({ checkCadence: c })); toast(plural(o.changed, 'resource') + ' set to ' + CAD_LABEL[c].toLowerCase() + '.' + lockedNote(o), { icon: 'clock' }); } })) }) },
      { label: 'Add a tag…', icon: 'tag', run: async () => { const v = await promptBox({ title: 'Add a tag to ' + plural(n, 'resource'), fields: [{ key: 'tag', label: 'Tag', placeholder: 'e.g. to-try' }], ok: 'Add tag' }); const t = v && v.tag.trim().toLowerCase().replace(/^#/, ''); if (t) { const o = store.bulkUpdate(ids, r => ({ tags: [...r.tags, t] })); toast('Tag #' + t + ' added.' + lockedNote(o), { icon: 'tag' }); } } },
      { label: 'What are these about?', sub: 'Guess topics offline, or look them up online', icon: 'spark', run: () => actionSheet({ title: 'What are these about?', items: [{ label: 'Guess topics', sub: 'From names and links. Works offline.', icon: 'spark', run: () => bulkGuess(ids) }, { label: 'Look up online', sub: 'Reads the real pages or accounts.', icon: 'signal', run: () => bulkLook(ids) }] }) }] }) }));
  p.el.appendChild(bar);
}
store.on('change', () => { const p = getPanel('vault'); if (p) draw(p); });
app.open.vault = openVault;
