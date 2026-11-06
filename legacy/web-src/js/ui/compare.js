// ui/compare.js - put 2 to 4 resources side by side, see where they differ, then keep one and archive the others.
import { h, domainOf, fmtDate, plural } from '../util.js';
import * as store from '../store.js';
import * as game from '../game.js';
import * as sfx from '../sfx.js';
import { allDefs } from '../fields.js';
import { app } from './app.js';
import { openPanel, closePanel, getPanel, btn, toast, confirmBox, pickDialog, monogram, openLink, TYPE_LABEL, STATUS_LABEL, CAD_LABEL } from './kit.js';

let ids = [];
export const MAX_COMPARE = 4;

export function openCompare(list) {
  ids = [...new Set((list || []).filter(id => store.byId(id)))].slice(0, MAX_COMPARE);
  if (ids.length < 2) return toast('Pick at least two resources to compare.', { icon: 'info' });
  return openPanel('compare', { kind: 'overlay', title: 'Compare', render: draw });
}
const items = () => ids.map(id => store.byId(id)).filter(Boolean);

/** Rows of facts. Each cell is plain text so two cells can be compared. */
export function compareRows(rs, custom = store.customFields()) {
  const sectors = r => store.jobsOf(r.id).map(j => j.name).join(', ');
  const rows = [
    ['Type', r => TYPE_LABEL[r.type]], ['Stage', r => STATUS_LABEL[r.status] + (r.status === 'testing' && r.trialEnd ? ' (ends ' + fmtDate(r.trialEnd) + ')' : '')]
  ];
  for (const d of allDefs(custom)) if (rs.some(r => r.fields && r.fields[d.key])) rows.push([d.label, r => { const v = (r.fields || {})[d.key] || ''; return d.kind === 'date' && v ? fmtDate(v) : v; }]);
  rows.push(['Use it when', r => r.useWhen.join('\n')], ['What it can do', r => r.capabilities.join('\n')],
    ['Goes in / out', r => [r.inputs && 'In: ' + r.inputs, r.outputs && 'Out: ' + r.outputs].filter(Boolean).join('\n')],
    ['Checked', r => (r.checkCadence !== 'none' ? CAD_LABEL[r.checkCadence] + '. ' : '') + (r.lastChecked ? 'Last ' + fmtDate(r.lastChecked) : 'Never checked')],
    ['Sectors', sectors], ['Tags', r => r.tags.map(t => '#' + t).join(' ')], ['Earlier decision', r => (r.verdict ? r.verdict.result + ' on ' + fmtDate(r.verdict.at) + (r.verdict.note ? ': ' + r.verdict.note : '') : '')]);
  return rows.map(([label, fn]) => { const cells = rs.map(fn); return { label, cells, diff: new Set(cells.map(c => String(c || '').trim().toLowerCase())).size > 1 }; })
    .filter(row => row.cells.some(c => String(c || '').trim()));
}

function draw(p) {
  const rs = items(); if (rs.length < 2) { p.close(); return; }
  p.setTitle('Compare ' + rs.length);
  p.setActions(btn('Done', { cls: 'ghost bold', onclick: () => closePanel('compare') }));
  const rows = compareRows(rs), diffs = rows.filter(r => r.diff).length;
  const head = h('tr', h('th.corner'), rs.map(r => h('th', h('div.cmp-h', { role: 'button', tabindex: '0', onclick: () => app.open.detail(r.id, { fly: false }) }, monogram(r, 34), h('b', r.title), h('span.dim.small', domainOf(r.url) || '')),
    rs.length > 2 ? btn('Remove', { cls: 'xs', onclick: () => { ids = ids.filter(x => x !== r.id); draw(p); } }) : null)));
  const body = rows.map(row => h('tr', { class: row.diff ? 'diff' : '' }, h('th', row.label, row.diff ? h('i.dd', { title: 'These differ' }) : null),
    row.cells.map(c => h('td', String(c || '').trim() ? String(c).split('\n').map((l, i) => h('div', l)) : h('span.dim', '-')))));
  const winners = h('tr.pick', h('th'), rs.map(r => h('td', btn('Keep this', { cls: 'sm pri', onclick: () => keepOne(r.id) }), r.url ? btn('Open', { cls: 'sm', icon: 'open', onclick: () => openLink(r.url) }) : null)));
  p.body.replaceChildren(h('div.stack',
    h('p.dim.small', diffs ? plural(diffs, 'row') + ' differ (marked with a dot). Swipe sideways to see every column.' : 'Nothing differs in what is written down. Add cost, limits and use-it-when lines to see real differences.'),
    h('div.cmp-wrap', h('table.cmp', h('thead', head), h('tbody', body, winners))),
    h('div.d-acts', rs.length < MAX_COMPARE ? btn('Add another', { icon: 'plus', onclick: async () => { const o = await pickDialog('Compare with', new Set(ids)); if (o) { ids.push(o.id); draw(p); } } }) : null,
      btn('Mark as alternatives', { icon: 'link', onclick: () => { for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) store.link(ids[i], ids[j]); game.award('link', 1, 'Alternatives'); toast('Linked. They now show as related, with a line between them in the galaxy.', { icon: 'link' }); } })),
    h('p.foot', 'Keep this: you choose the winner. It becomes Active with a note that it won. The others are archived (not deleted) with a note, so you can bring them back.')));
}

async function keepOne(id) {
  const win = store.byId(id), others = items().filter(r => r.id !== id); if (!win) return;
  if (!(await confirmBox({ title: 'Keep ' + win.title.slice(0, 40) + '?', text: (others.filter(r => !r.locked).map(r => r.title.slice(0, 30)).join(', ') || 'Nothing') + ' will be archived. Nothing is deleted.' + (others.some(r => r.locked) ? ' Locked items stay as they are.' : ''), ok: 'Keep this one' }))) return;
  store.setVerdict(id, 'keep', 'Chosen over ' + others.map(r => r.title).join(', '));
  const kept = others.filter(r => r.locked), dropped = others.filter(r => !r.locked);
  dropped.forEach(r => store.setVerdict(r.id, 'drop', 'Replaced by ' + win.title));
  game.award('review', dropped.length + 1, 'Decided'); sfx.feel('ok', [10, 30]);
  toast('Kept ' + win.title + '. ' + plural(dropped.length, 'other') + ' archived.' + (kept.length ? ' ' + plural(kept.length, 'locked item') + ' left alone.' : ''), { icon: 'check' }); closePanel('compare');
}
store.on('change', () => { const p = getPanel('compare'); if (p) p.render(); });
app.open.compare = openCompare;
