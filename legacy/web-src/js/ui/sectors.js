// ui/sectors.js - the Jobs board: every sector is a card. Swipe sideways between them. Resources can sit in several sectors.
import { h, domainOf, clamp, plural } from '../util.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import * as game from '../game.js';
import * as sfx from '../sfx.js';
import { app, showInGalaxy } from './app.js';
import { openPanel, closePanel, getPanel, btn, chip, ico, toast, promptBox, confirmBox, actionSheet, monogram, dueChip, inkFor, TYPE_LABEL } from './kit.js';
import { editSector } from './detail.js';
import { ruleText, editRule } from './rules.js';
import { ideaList } from './ideas.js';
const ideaCount = () => ideaList().length;

let want = null; const more = new Map();
export function openSectors(jobId) {
  want = jobId || null;
  const p = openPanel('sectors', { kind: 'view', title: 'Sectors', render: draw });
  if (jobId && p._flow) goTo(p, jobId, false);
  return p;
}

function draw(p) {
  const jobs = store.state.jobs;
  p.setActions(btn('', { cls: 'ghost icon', icon: 'plus', title: 'New sector', onclick: () => actionSheet({ title: 'New sector', items: [{ label: 'New sector', sub: 'You choose what goes in it', icon: 'sectors', run: () => newSector() }, { label: 'New smart sector', sub: 'Fills itself from a rule, like "free AI tools"', icon: 'spark', run: () => newSector(true) }, ideaCount() ? { label: 'Ideas from your links (' + ideaCount() + ')', sub: 'Groups of links with the same tag that have no sector', icon: 'sectors', run: () => app.open.ideas() } : null] }) }));
  const keep = p._flow ? p._flow.scrollLeft : 0;
  const jump = h('div.jump.scrollx', jobs.map(j => h('button', { type: 'button', class: 'jchip' + (j.rule ? ' auto' : ''), style: { '--c': j.color }, onclick: () => goTo(p, j.id, true) }, h('i.dot'), j.name, h('b', j.members.length))));
  const flow = p._flow = h('div.flow', jobs.map(j => column(j)));
  p.body.replaceChildren(h('div.board', jump, flow));
  flow.addEventListener('scroll', () => { if (!p._raf) p._raf = requestAnimationFrame(() => { p._raf = 0; tilt(flow); }); }, { passive: true });
  requestAnimationFrame(() => { flow.scrollLeft = keep; tilt(flow); if (want) { goTo(p, want, false); want = null; } });
}
function tilt(flow) {
  const mid = flow.scrollLeft + flow.clientWidth / 2;
  for (const c of flow.children) {
    const d = clamp((c.offsetLeft + c.offsetWidth / 2 - mid) / (c.offsetWidth * 0.95), -1.5, 1.5), a = Math.abs(d);
    c.style.transform = 'scale(' + (1 - Math.min(1, a) * 0.06).toFixed(3) + ')';
    c.style.opacity = (1 - Math.min(1, a) * 0.35).toFixed(2);
  }
}
function goTo(p, id, smooth) {
  const i = store.state.jobs.findIndex(j => j.id === id), c = p._flow && p._flow.children[i]; if (!c) return;
  p._flow.scrollTo({ left: c.offsetLeft - (p._flow.clientWidth - c.offsetWidth) / 2, behavior: smooth ? 'smooth' : 'auto' });
}

function column(j) {
  const items = j.members.map(id => store.byId(id)).filter(Boolean), lim = more.get(j.id) || 40;
  const head = h('div.col-h', h('span.mono-ic', { style: { '--c': j.color, '--ink': inkFor(j.color), '--s': '40px' }, html: icon(j.sealed ? 'lock' : (j.icon && j.icon !== 'star' ? j.icon : 'sectors')) }),
    h('div.grow', h('div.col-t', j.name, j.rule ? h('span.autotag', 'auto') : null), h('div.s.dim', plural(items.length, 'resource'))),
    btn('', { cls: 'ghost icon sm', icon: 'more', title: 'Sector options', onclick: () => sectorMenu(j) }));
  const cards = items.slice(0, lim).map(r => card(r, j));
  return h('section.col', { style: { '--c': j.color }, dataset: { id: j.id } }, head, j.rule ? h('p.col-n.dim.small.rule', 'Fills itself: ' + ruleText(j.rule) + '.') : null, j.note ? h('p.col-n.dim.small', j.note) : null,
    h('div.col-b.scroll', items.length ? cards : h('div.empty', h('div.big', { html: icon(j.sealed ? 'lock' : 'spark', 'lg') }), h('b', j.sealed ? 'Sealed and empty' : 'Nothing here yet'), h('p', j.rule ? 'Nothing matches the rule right now. It fills itself when something does.' : 'Add a resource to light up this sector.')),
      items.length > lim ? btn('Show ' + Math.min(60, items.length - lim) + ' more', { cls: 'sm', onclick: () => { more.set(j.id, lim + 60); const p = getPanel('sectors'); if (p) p.render(); } }) : null),
    h('div.col-f', j.rule ? btn('Edit rule', { cls: 'sm', icon: 'edit', onclick: () => changeRule(j) }) : btn('Add here', { cls: 'sm', icon: 'plus', onclick: () => app.open.quickadd({ jobId: j.id }) }), btn('Fly there', { cls: 'sm', icon: 'galaxy', onclick: () => { app.open.closeViews(); app.scene.selectSector(j.id); app.open.sectorCard(j.id, { fly: false }); } })));
}
function card(r, j) {
  const el = h('div.kcard' + (r.draft ? '.draft' : '') + (r.status === 'archived' ? '.arch' : ''), { role: 'button', tabindex: '0', onclick: () => app.open.detail(r.id), onkeydown: e => { if (e.key === 'Enter') app.open.detail(r.id); } },
    monogram(r, 34), h('div.grow', h('div.t', r.title), h('div.s', domainOf(r.url) || r.tags.slice(0, 2).map(t => '#' + t).join(' ')),
      h('div.meta', chip(TYPE_LABEL[r.type], { cls: 't' }), dueChip(r), store.jobsOf(r.id).length > 1 ? chip('in ' + store.jobsOf(r.id).length, { icon: 'layers' }) : null)),
    h('button.kmore', { type: 'button', 'aria-label': 'Move or copy', html: icon('more'), onclick: e => { e.stopPropagation(); cardMenu(r, j); } }));
  return el;
}

function cardMenu(r, j) {
  actionSheet({ title: r.title.length > 50 ? r.title.slice(0, 49) + '…' : r.title, sub: 'In ' + store.jobsOf(r.id).map(x => x.name).join(', '), items: [
    { label: 'Open details', icon: 'eye', run: () => app.open.detail(r.id) },
    { label: 'Show in galaxy', icon: 'galaxy', run: () => showInGalaxy(r.id) },
    j.rule ? null : { label: 'Move to another sector', icon: 'move', run: () => chooseSector(r, j, 'move') },
    { label: 'Also show in another sector', icon: 'layers', run: () => chooseSector(r, j, 'copy') },
    !j.rule && store.jobsOf(r.id).length > 1 ? { label: 'Remove from ' + j.name, icon: 'close', run: () => { store.removeFromJob(j.id, r.id); toast('Removed from ' + j.name + '.', { icon: 'check' }); } } : null,
    j.rule ? { label: 'Why is it here?', sub: 'Fills itself: ' + ruleText(j.rule), icon: 'info', run: () => toast('It matches the rule of this sector. Change the item, or edit the rule, to change that.', { icon: 'info', ms: 5000 }) } : null] });
}
function chooseSector(r, from, mode) {
  const items = store.state.jobs.filter(x => x.id !== from.id && !x.rule).map(x => ({ label: x.name, color: x.color, on: x.members.includes(r.id), sub: x.members.includes(r.id) ? 'already there' : null,
    run: () => { if (mode === 'move') { store.moveToJob(from.id, x.id, r.id); toast('Moved to ' + x.name + '.', { icon: 'move' }); } else { if (x.members.includes(r.id)) store.removeFromJob(x.id, r.id); else store.addToJob(x.id, r.id); toast(x.members.includes(r.id) ? 'Now also in ' + x.name + '.' : 'Removed from ' + x.name + '.', { icon: 'layers' }); } sfx.feel('ok'); } }));
  actionSheet({ title: mode === 'move' ? 'Move to' : 'Also show in', items });
}
function sectorMenu(j) {
  actionSheet({ title: j.name, items: [
    { label: 'Edit name, star and planet colours, notes', icon: 'edit', run: () => editSector(j) },
    j.rule ? { label: 'Edit the rule', icon: 'spark', run: () => changeRule(j) } : { label: 'Fill by a rule…', sub: 'Turns it into a smart sector. Its current items are replaced by what matches.', icon: 'spark', run: () => makeSmart(j) },
    j.rule ? { label: 'Make it a normal sector', sub: 'Keeps what is in it now. It stops updating by itself.', icon: 'sectors', run: () => { store.updateJob(j.id, { rule: null }); toast('It is a normal sector now. The items stay.', { icon: 'check' }); } } : null,
    { label: j.sealed ? 'Unseal' : 'Seal (private look)', icon: j.sealed ? 'unlock' : 'lock', run: () => store.updateJob(j.id, { sealed: !j.sealed }) },
    { label: 'Fly to it in the galaxy', icon: 'galaxy', run: () => { app.open.closeViews(); app.scene.selectSector(j.id); app.open.sectorCard(j.id, { fly: false }); } },
    { label: 'Delete sector', icon: 'trash', danger: true, run: async () => {
      if (!(await confirmBox({ title: 'Delete "' + j.name + '"?', text: j.rule ? 'The resources stay where they are. Only this auto sector goes.' : (j.members.length ? 'Its ' + plural(j.members.length, 'resource') + ' stay in your library and move to the Inbox sector.' : 'It is empty.'), ok: 'Delete sector', danger: true }))) return;
      if (j.members.length && !j.rule) { const ib = store.ensureInbox(); j.members.slice().forEach(id => store.addToJob(ib.id, id, true)); }
      store.deleteJob(j.id); toast('Sector deleted.', { icon: 'trash' }); } }] });
}
async function changeRule(j) {
  const r = await editRule({ rule: j.rule, title: 'Rule for ' + j.name }); if (!r) return;
  store.updateJob(j.id, { rule: r }); sfx.feel('ok'); toast('Rule saved. ' + plural(store.jobById(j.id).members.length, 'resource') + ' match now.', { icon: 'check' });
}
async function makeSmart(j) {
  if (j.members.length && !(await confirmBox({ title: 'Fill "' + j.name + '" by a rule?', text: 'Its ' + plural(j.members.length, 'item') + ' will be replaced by whatever matches the rule. The resources themselves are not deleted. A safety copy is saved first.', ok: 'Choose a rule' }))) return;
  const r = await editRule({ title: 'Rule for ' + j.name }); if (!r) return;
  store.before('Before a bulk change'); store.updateJob(j.id, { rule: r }); sfx.feel('ok'); toast('Smart sector. ' + plural(store.jobById(j.id).members.length, 'resource') + ' match now.', { icon: 'check' });
}
async function newSector(smart) {
  let rule = null;
  if (smart) { rule = await editRule({ title: 'What should fill this sector?', ok: 'Next' }); if (!rule) return; }
  const v = await promptBox({ title: smart ? 'Name the smart sector' : 'New sector', text: smart ? 'It fills itself from the rule you just made.' : 'A sector is a column on the board and a star system in the galaxy.', fields: [{ key: 'name', label: 'Name', placeholder: 'e.g. Design Lab' }, { key: 'note', label: 'What goes here (optional)', type: 'textarea', rows: 2 }, { key: 'color', label: 'Star colour', type: 'color', colors: store.STAR_COLORS, value: store.STAR_COLORS[store.state.jobs.length % store.STAR_COLORS.length] }, { key: 'sealed', label: 'Sealed (private look)', type: 'check', value: false }], ok: 'Create' });
  if (!v || !v.name.trim()) return;
  const j = store.addJob({ name: v.name, color: v.color, sealed: v.sealed, rule }); if (v.note) store.updateJob(j.id, { note: v.note });
  game.award('sector', 1, j.name); sfx.feel('spawn', [10, 30, 10]); toast('Sector "' + j.name + '" created. It now exists in the galaxy.', { icon: 'rocket' });
  const p = getPanel('sectors'); if (p) setTimeout(() => goTo(p, j.id, true), 80);
}
store.on('change', () => { const p = getPanel('sectors'); if (p) p.render(); });   // moves, new sectors and smart sectors filling themselves show at once
app.open.sectors = openSectors;
