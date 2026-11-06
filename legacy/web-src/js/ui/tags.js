// ui/tags.js - the Tags manager: every tag with its count. Rename, join look-alikes, or delete a tag across all links at once.
// Links keep everything else. A safety copy is saved first, with Undo.
import { h, plural } from '../util.js';
import * as store from '../store.js';
import * as sfx from '../sfx.js';
import { tagCounts, retag, similarTags, cleanTag } from '../tags.js';
import { app } from './app.js';
import { offerUndo } from './safety.js';
import { openPanel, getPanel, btn, toast, confirmBox, promptBox } from './kit.js';

const REASON = 'Before changing tags';
let q = '', more = 40;

export const similarCount = () => similarTags(tagCounts(store.state.resources)).length;
export function openTags() { q = ''; more = 40; return openPanel('tags', { kind: 'view', title: 'Tags', back: true, render: draw }); }
const redraw = () => { const p = getPanel('tags'); if (p && !(document.activeElement && document.activeElement.classList.contains('tg-q'))) draw(p); };

/** Change every link that has one of the `from` tags. to = '' deletes. */
function change(from, to, doneText) {
  const map = retag(store.state.resources, from, to), ids = Object.keys(map);
  if (!ids.length) return toast('Nothing to change.', { icon: 'warn' });
  const o = store.bulkUpdate(ids, r => ({ tags: map[r.id] || r.tags }), { reason: REASON });
  sfx.feel('ok', [10, 25]);
  offerUndo(REASON, doneText(o.changed) + (o.skipped ? ' ' + plural(o.skipped, 'locked link') + ' skipped.' : ''));
}

async function rename(t) {
  const o = await promptBox({ title: 'Rename "' + t + '"', text: 'It changes on every link that has it. If the new name already exists, the two tags become one.', ok: 'Rename', fields: [{ key: 'name', label: 'New name', value: t }] });
  if (!o) return;
  const to = cleanTag(o.name); if (!to) return toast('Type a name first.', { icon: 'warn' });
  if (to === t) return;
  change(t, to, n => '"' + t + '" is now "' + to + '" on ' + plural(n, 'link') + '.');
}
async function del(c) {
  if (!(await confirmBox({ title: 'Delete the tag "' + c.tag + '"?', text: 'It is taken off ' + plural(c.n, 'link') + '. The links stay, with everything else on them. A safety copy is saved first, so you can undo.', ok: 'Delete', danger: true }))) return;
  change(c.tag, '', n => 'Removed "' + c.tag + '" from ' + plural(n, 'link') + '.');
}
async function join(g) {
  const top = g.tags[0].tag, others = g.tags.slice(1).map(x => x.tag);
  if (!(await confirmBox({ title: 'Join these into "' + top + '"?', text: others.map(t => '"' + t + '"').join(', ') + ' become "' + top + '" on every link. A safety copy is saved first, so you can undo.', ok: 'Join' }))) return;
  change(others, top, n => 'Joined into "' + top + '" on ' + plural(n, 'link') + '.');
}

function draw(p) {
  const all = tagCounts(store.state.resources), keepY = p.scroller ? p.scroller.scrollTop : 0, needle = q.trim().toLowerCase();
  const list = needle ? all.filter(c => c.tag.includes(needle)) : all, sim = needle ? [] : similarTags(all);
  p.setActions();
  const out = [h('p.dim.small', plural(all.length, 'tag') + '. Rename one, join look-alikes, or delete one. It changes every link that has the tag.')];
  if (sim.length) out.push(h('section.tile', h('div.tile-h', h('span', 'Look alike'), h('span.tile-n', String(sim.length))),
    h('p.dim.small', 'These differ only by capital letters, dashes or an "s". Joining keeps the one you use most.'),
    sim.slice(0, 6).map(g => h('div.nrow.cmp', h('div.grow', h('div.t', { style: { cursor: 'default' } }, g.tags.map(x => x.tag).join(' · ')), h('div.s', g.tags.map(x => x.n).join(' + ') + ' links')),
      h('div.acts', btn('Join', { cls: 'xs pri', onclick: () => join(g) }))))));
  out.push(h('input.in.tg-q', { type: 'search', placeholder: 'Find a tag', 'aria-label': 'Find a tag', value: q, autocomplete: 'off', autocapitalize: 'off', oninput: e => { q = e.target.value; more = 40; drawList(p); } }));
  out.push(h('div.tg-list'));
  p.body.replaceChildren(h('div.rs', out)); listInto(p, list); if (p.scroller) p.scroller.scrollTop = keepY;
}
// typing in the box redraws only the list, so the keyboard stays open
function drawList(p) { const all = tagCounts(store.state.resources), n = q.trim().toLowerCase(); listInto(p, n ? all.filter(c => c.tag.includes(n)) : all); }
function listInto(p, list) {
  const box = p.body.querySelector('.tg-list'); if (!box) return;
  const rows = list.slice(0, more).map(c => h('div.nrow.cmp', h('div.grow', h('div.t', { role: 'button', tabindex: '0', onclick: () => app.open.search(c.tag) }, '#' + c.tag), h('div.s', plural(c.live, 'link') + (c.n > c.live ? ' · ' + (c.n - c.live) + ' archived' : ''))),
    h('div.acts', btn('Rename', { cls: 'xs', onclick: () => rename(c.tag) }), btn('Delete', { cls: 'xs ghost', onclick: () => del(c) }))));
  box.replaceChildren(...rows, list.length > more ? btn('Show more (' + (list.length - more) + ')', { cls: 'xs', onclick: () => { more += 60; listInto(p, list); } }) : null, !list.length ? h('div.empty', h('b', 'No tags'), h('p', q ? 'Nothing matches.' : 'Add tags to links and they show up here.')) : null);
}
store.on('change', redraw);
app.open.tags = openTags;
