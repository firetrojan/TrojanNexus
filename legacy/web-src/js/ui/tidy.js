// ui/tidy.js - Tidy up: take tracking junk out of saved links, and tidy messy titles. You see every change first.
// Nothing here is automatic. "Fix all" and each single fix save a safety copy first, and offer Undo.
import { h, plural, shortUrl } from '../util.js';
import * as store from '../store.js';
import * as sfx from '../sfx.js';
import { tidyFindings, cleanUrl, cleanTitle, droppedParams } from '../tidy.js';
import { app } from './app.js';
import { offerUndo } from './safety.js';
import { openPanel, getPanel, btn, monogram } from './kit.js';

const R_LINK = 'Before tidying links', R_TITLE = 'Before tidying titles';
const skipped = new Set();            // titles you chose to leave alone, until the app is closed
const MAX_ROWS = 8;
let showAll = { u: false, t: false };

export const tidyCount = () => { const f = tidyFindings(store.state.resources); return f.links.length + f.titles.filter(x => !skipped.has(x.r.id)).length; };
export function openTidy() { showAll = { u: false, t: false }; return openPanel('tidy', { kind: 'view', title: 'Tidy up', back: true, render: draw }); }
const redraw = () => { const p = getPanel('tidy'); if (p) draw(p); };

function apply(kind, items) {
  const ids = items.map(x => x.r.id), link = kind === 'u';
  const o = store.bulkUpdate(ids, r => (link ? { url: cleanUrl(r.url) } : { title: cleanTitle(r.title, r.url) }), { reason: link ? R_LINK : R_TITLE });
  sfx.feel('ok', [10, 25]);
  offerUndo(link ? R_LINK : R_TITLE, (link ? 'Cleaned ' + plural(o.changed, 'link') : 'Tidied ' + plural(o.changed, 'title')) + '.' + (o.skipped ? ' ' + plural(o.skipped, 'locked link') + ' skipped.' : ''));
}

function section(title, note, kind, items, row) {
  if (!items.length) return null;
  const shown = showAll[kind] ? items : items.slice(0, MAX_ROWS);
  return h('section.tile', h('div.tile-h', h('span', title), h('span.tile-n', String(items.length))),
    note ? h('p.dim.small', note) : null, shown.map(row),
    h('div.row.wrap', { style: { marginTop: '8px' } },
      btn((kind === 'u' ? 'Clean all ' : 'Tidy all ') + items.length, { cls: 'xs pri', icon: 'check', onclick: () => apply(kind, items) }),
      items.length > MAX_ROWS && !showAll[kind] ? btn('Show all', { cls: 'xs', onclick: () => { showAll[kind] = true; redraw(); } }) : null));
}

function draw(p) {
  const f = tidyFindings(store.state.resources), keepY = p.scroller ? p.scroller.scrollTop : 0;
  const titles = f.titles.filter(x => !skipped.has(x.r.id));
  p.setActions();
  const out = [h('p.dim.small', 'Removes the tracking tags that sites add to links (utm_source, fbclid and similar), and tidies titles. The page you open stays the same. A safety copy is saved first, so you can undo.')];
  out.push(section('Links with tracking junk', 'Only the junk after "?" is removed. Locked links are left alone.', 'u', f.links, x => h('div.nrow', monogram(x.r, 34),
    h('div.grow', h('div.t', { role: 'button', tabindex: '0', onclick: () => app.open.detail(x.r.id, { fly: false }) }, x.r.title), h('div.s', shortUrl(x.to, 40) + ' · removes ' + droppedParams(x.r.url).slice(0, 3).join(', '))),
    h('div.acts', btn('Clean', { cls: 'xs', onclick: () => apply('u', [x] ) })))));
  out.push(section('Titles to tidy', 'Alert counts like "(3)", a site name on the end, and web symbols. A few may be wrong, so look before you accept.', 't', titles, x => h('div.nrow', monogram(x.r, 34),
    h('div.grow', h('div.t', { style: { cursor: 'default' } }, x.to), h('div.s', 'Was: ' + x.r.title)),
    h('div.acts', btn('Fix', { cls: 'xs', onclick: () => apply('t', [x]) }), btn('Skip', { cls: 'xs ghost', onclick: () => { skipped.add(x.r.id); redraw(); } })))));
  if (f.nowSame) out.push(h('section.tile', h('div.tile-h', h('span', 'Same page twice')),
    h('p.dim.small', plural(f.nowSame, 'of these link') + (f.nowSame === 1 ? ' is' : ' are') + ' already the same page as another link you saved.'),
    h('div.row.wrap', btn('Open Duplicates', { cls: 'xs', onclick: () => app.open.dupes() }))));
  if (!f.links.length && !titles.length) out.push(h('div.empty', h('b', 'Nothing to tidy'), h('p', 'No tracking junk in your links, and no messy titles. Links you add later can be checked here again.')));
  p.body.replaceChildren(h('div.rs', out.filter(Boolean))); if (p.scroller) p.scroller.scrollTop = keepY;
}
store.on('change', redraw);
app.open.tidy = openTidy;
