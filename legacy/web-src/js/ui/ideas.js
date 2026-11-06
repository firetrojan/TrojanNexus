// ui/ideas.js - New sector ideas: groups of links with the same tag or type that sit in no sector you made.
// Nothing is created by itself. Create makes the sector and puts those links in it, after a safety copy (Undo is offered).
import { h, plural } from '../util.js';
import * as store from '../store.js';
import * as sfx from '../sfx.js';
import { sectorIdeas } from '../ideas.js';
import { app } from './app.js';
import { offerUndo } from './safety.js';
import { openPanel, getPanel, btn, toast, promptBox, TYPE_LABEL } from './kit.js';

const REASON = 'Before creating a sector';
const named = new Map();     // idea key -> a name you typed
const later = new Set();     // ideas you pressed "Not now" on, until the app is closed

/** The current ideas. Used by this screen, Insights and the Sectors menu, so they always agree. */
export const ideaList = () => sectorIdeas(store.state.resources, store.state.jobs.map(j => j.name),
  id => store.jobsOf(id).filter(j => !j.rule && j.name !== 'Inbox'), t => TYPE_LABEL[t] || t).filter(i => !later.has(i.key));
export function openIdeas() { return openPanel('ideas', { kind: 'view', title: 'Sector ideas', back: true, render: draw }); }
const redraw = () => { const p = getPanel('ideas'); if (p) draw(p); };

async function rename(i) {
  const o = await promptBox({ title: 'Name this sector', ok: 'Save', fields: [{ key: 'name', label: 'Name', value: named.get(i.key) || i.name }] });
  const n = o && String(o.name).trim().slice(0, 40); if (n) { named.set(i.key, n); redraw(); }
}
function create(i) {
  const name = named.get(i.key) || i.name;
  if (store.state.jobs.some(j => j.name.trim().toLowerCase() === name.toLowerCase())) return toast('A sector called "' + name + '" already exists. Rename this one first.', { icon: 'warn', ms: 5000 });
  const j = store.createSector(name, i.ids);
  sfx.feel('ok', [10, 25]);
  offerUndo(REASON, 'Created "' + j.name + '" with ' + plural(j.members.length, 'link') + '.');
}

function draw(p) {
  const ideas = ideaList(), keepY = p.scroller ? p.scroller.scrollTop : 0;
  p.setActions();
  const out = [h('p.dim.small', 'Groups of links that share a tag or a type but are in no sector you made. Create one and those links are placed in it. A safety copy is saved first, so you can undo.')];
  for (const i of ideas) {
    const names = i.ids.map(id => store.byId(id)).filter(Boolean).map(r => r.title);
    out.push(h('section.tile', h('div.tile-h', h('span', named.get(i.key) || i.name), h('span.tile-n', String(i.n))),
      h('p.dim.small', 'Because of ' + i.how + '.'),
      h('p.small', names.slice(0, 4).join(', ') + (names.length > 4 ? ' and ' + (names.length - 4) + ' more' : '') + '.'),
      h('div.row.wrap', btn('Create', { cls: 'xs pri', icon: 'plus', onclick: () => create(i) }), btn('Rename', { cls: 'xs', onclick: () => rename(i) }), btn('Not now', { cls: 'xs ghost', onclick: () => { later.add(i.key); redraw(); } }))));
  }
  if (!ideas.length) out.push(h('div.empty', h('b', 'No ideas right now'), h('p', 'Ideas appear when 3 or more links share a tag or a type and are in no sector. Tag your links, or review the new ones, and check again.')));
  p.body.replaceChildren(h('div.rs', out)); if (p.scroller) p.scroller.scrollTop = keepY;
}
store.on('change', redraw);
app.open.ideas = openIdeas;
