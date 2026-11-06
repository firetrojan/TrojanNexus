// ui/merge.js - join links about the same thing, and the Duplicates page (sites where you saved more than one link).
// Nexus never merges by itself: different pages on one site are not always the same thing. You choose which link survives.
import { h, plural, shortUrl } from '../util.js';
import * as store from '../store.js';
import * as sfx from '../sfx.js';
import { dupeGroups } from '../merge.js';
import { app } from './app.js';
import { offerUndo } from './safety.js';
import { openPanel, getPanel, btn, toast, confirmBox, monogram } from './kit.js';

const clip = (s, n = 34) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const REASON = 'Before merging links';

/** Ask, then merge `dropId` into `keepId`. Returns the store's result, or null if cancelled or not allowed. */
export async function mergeFlow(keepId, dropId) {
  const keep = store.byId(keepId), drop = store.byId(dropId); if (!keep || !drop) return null;
  if (drop.locked) { toast('"' + clip(drop.title) + '" is locked. Unlock it first.', { icon: 'lock' }); return null; }
  const ok = await confirmBox({ title: 'Merge these two?', text: '"' + clip(drop.title) + '" is removed. Its tags, notes, sectors and mission steps move into "' + clip(keep.title) + '". A safety copy is saved first, so you can undo.', ok: 'Merge' });
  if (!ok) return null;
  const o = store.mergeResources(keepId, dropId); if (!o) return null;
  sfx.feel('ok', [10, 25]); offerUndo(REASON, 'Merged into ' + clip(keep.title) + '.');
  return o;
}

async function keepOne(g, keep) {
  const others = g.items.filter(r => r.id !== keep.id && !r.locked), locked = g.items.length - 1 - others.length;
  if (!others.length) return toast('The other links here are locked. Unlock them first.', { icon: 'lock' });
  const ok = await confirmBox({ title: 'Keep "' + clip(keep.title, 28) + '"?', text: plural(others.length, 'other link') + ' on this site will be removed. Their tags, notes, sectors and mission steps move into the one you keep.' + (locked ? ' ' + plural(locked, 'locked link') + ' stays.' : '') + ' A safety copy is saved first, so you can undo.', ok: 'Merge' });
  if (!ok) return;
  store.before(REASON);
  let n = 0; for (const r of others) if (store.mergeResources(keep.id, r.id, { quiet: true })) n++;
  sfx.feel('ok', [10, 25]); offerUndo(REASON, 'Merged ' + plural(n, 'link') + ' into ' + clip(keep.title) + '.');
}
function ignoreSite(key) {
  const list = store.getSetting('dupeIgnore') || [];
  store.setSetting('dupeIgnore', list.concat(key).slice(-300)); sfx.feel('tap');
  toast('Not shown again for ' + key + '.', { icon: 'check', ms: 5000, action: { label: 'Undo', fn: () => store.setSetting('dupeIgnore', (store.getSetting('dupeIgnore') || []).filter(k => k !== key)) } });
}

export const dupeCount = () => dupeGroups(store.state.resources, store.getSetting('dupeIgnore')).length;
export function openDupes() { return openPanel('dupes', { kind: 'view', title: 'Duplicates', back: true, render: draw }); }
const redraw = () => { const p = getPanel('dupes'); if (p) draw(p); };

function draw(p) {
  const groups = dupeGroups(store.state.resources, store.getSetting('dupeIgnore')), keepY = p.scroller ? p.scroller.scrollTop : 0;
  p.setActions();
  const meta = r => [r.opens ? r.opens + '× opened' : '', store.jobsOf(r.id).filter(j => !j.rule).slice(0, 2).map(j => j.name).join(', '), r.draft ? 'to review' : ''].filter(Boolean).join(' · ');
  const out = [h('p.dim.small', 'Sites where you saved more than one link. They are not always the same thing, so nothing is merged unless you choose which one to keep.')];
  if (!groups.length) out.push(h('div.empty', h('b', 'No duplicates'), h('p', 'Every site has one link, or you marked the rest "not duplicates".')));
  for (const g of groups.slice(0, 25)) {
    out.push(h('section.tile', h('div.tile-h', h('span', g.key), g.exact ? h('span.tile-n', 'Same address') : null),
      g.items.map(r => h('div.nrow', monogram(r, 34),
        h('div.grow', h('div.t', { role: 'button', tabindex: '0', onclick: () => app.open.detail(r.id, { fly: false }) }, r.title), h('div.s', shortUrl(r.url, 46) + (meta(r) ? ' · ' + meta(r) : ''))),
        h('div.acts', btn('Keep this', { cls: 'xs pri', onclick: () => keepOne(g, r) })))),
      h('div.row.wrap', { style: { marginTop: '6px' } }, btn('Not duplicates', { cls: 'xs ghost', onclick: () => ignoreSite(g.key) }))));
  }
  if (groups.length > 25) out.push(h('p.dim.small', '+ ' + (groups.length - 25) + ' more sites. Finish these and they show up.'));
  p.body.replaceChildren(h('div.rs', out)); if (p.scroller) p.scroller.scrollTop = keepY;
}
store.on('change', redraw); store.on('settings', e => { if (e && e.key === 'dupeIgnore') redraw(); });
app.open.dupes = openDupes; app.open.mergeFlow = mergeFlow;
