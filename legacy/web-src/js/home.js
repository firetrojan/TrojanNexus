// home.js - what the Home screen shows, and in what order. Pure logic: no DOM here.
import { daysBetween, todayISO } from './util.js';

/** The tiles under the search bar. The user can hide them and change their order. */
export const TILES = [
  { id: 'needs', label: 'Needs you', sub: 'Trials, changed pages and checks that are due' },
  { id: 'week', label: 'This week', sub: 'Your 3 picks for the week and the weekly reset' },
  { id: 'mission', label: 'Mission', sub: 'The next step of the mission you are working on' },
  { id: 'continue', label: 'Continue', sub: 'The last links, sectors and missions you looked at' },
  { id: 'launch', label: 'Launch pad', sub: 'Your pinned and most-opened links' },
  { id: 'shelves', label: 'Shelves', sub: 'Sectors you pinned to Home as launch buttons' },
  { id: 'time', label: 'Time I have', sub: 'Tell Nexus 10 minutes, an hour or tired, get a short list' },
  { id: 'review', label: 'Quick review', sub: 'Go through new links one at a time' },
  { id: 'sectors', label: 'Sectors', sub: 'Jump into a sector' }
];
const IDS = TILES.map(t => t.id);

/** Clean the saved layout: known tiles only, no repeats, nothing missing. Returns { order, hide }. */
export function normHome(v) {
  const o = v && typeof v === 'object' ? v : {};
  const order = [], seen = new Set();
  for (const id of Array.isArray(o.order) ? o.order : []) if (IDS.includes(id) && !seen.has(id)) { seen.add(id); order.push(id); }
  for (const id of IDS) if (!seen.has(id)) order.push(id);
  const hide = [...new Set((Array.isArray(o.hide) ? o.hide : []).filter(id => IDS.includes(id)))];
  return { order, hide };
}
/** Tiles to draw, in order, without the hidden ones. */
export const visibleTiles = layout => { const l = normHome(layout); return l.order.filter(id => !l.hide.includes(id)); };

// ---------- launch pad ----------
export const launchable = r => r.url && r.status !== 'archived' && (r.pinned || r.src !== 'following');
/**
 * mode 'fav': pinned first, then the ones you open most. mode 'recent': the ones you opened last.
 * Only links you actually opened through Nexus count, so a new list starts short on purpose.
 */
export function launchList(resources, mode = 'fav', n = 8) {
  const pool = resources.filter(launchable);
  const byUse = (a, b) => (b.opens || 0) - (a.opens || 0) || (b.openedAt || 0) - (a.openedAt || 0) || a.title.localeCompare(b.title);
  let list;
  if (mode === 'recent') list = pool.filter(r => r.openedAt).sort((a, b) => b.openedAt - a.openedAt || byUse(a, b));
  else list = pool.filter(r => r.pinned).sort(byUse).concat(pool.filter(r => !r.pinned && r.opens > 0).sort(byUse));
  return list.slice(0, n);
}

// ---------- shelves: a sector pinned to Home ----------
export const MAX_SHELVES = 4;
/** Clean the saved shelves: [{ job }] with a real id, no repeats, at most 4. */
export function normShelves(v) {
  const seen = new Set(), out = [];
  for (const e of Array.isArray(v) ? v : []) { const job = e && typeof e.job === 'string' ? e.job : ''; if (job && !seen.has(job) && out.length < MAX_SHELVES) { seen.add(job); out.push({ job }); } }
  return out;
}
/** The links to show on a shelf: pinned first, then the ones you open most, then the rest by name. Only links you can open. */
export function shelfList(memberIds, byId, n = 8) {
  const pool = memberIds.map(byId).filter(r => r && launchable(r));
  return pool.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.opens || 0) - (a.opens || 0) || (b.openedAt || 0) - (a.openedAt || 0) || a.title.localeCompare(b.title)).slice(0, n);
}

// ---------- what needs you ----------
/**
 * One line per resource, most urgent first. `fns` are the store's own rules (dueBucket, trialBucket, resetBucket, watchChanged).
 * kinds: trial (decide), changed (a watched page changed), check (due or overdue), limit (a free limit resets soon).
 */
export function needsItems(resources, fns, today = todayISO()) {
  const out = [];
  for (const r of resources) {
    if (r.status === 'archived') continue;
    const tb = fns.trialBucket(r, today), due = fns.dueBucket(r, today), rb = fns.resetBucket(r, today);
    let it = null;
    if (tb) { const d = daysBetween(today, r.trialEnd); it = { kind: 'trial', rank: tb === 'overdue' ? 0 : 1, sub: d < 0 ? 'Trial ended ' + (-d) + (d === -1 ? ' day ago' : ' days ago') : (d === 0 ? 'Trial ends today' : 'Trial ends in ' + d + (d === 1 ? ' day' : ' days')) }; }
    else if (fns.watchChanged(r)) it = { kind: 'changed', rank: 2, sub: (r.watch.what && r.watch.what[0]) || 'The page changed' };
    else if (due === 'overdue' || due === 'today') { const d = daysBetween(today, r.nextCheck); it = { kind: 'check', rank: due === 'overdue' ? 3 : 4, sub: due === 'overdue' ? 'Check is ' + (-d) + (d === -1 ? ' day late' : ' days late') : 'Check is due today' }; }
    else if (rb === 'soon' || rb === 'past') { const d = daysBetween(today, r.fields.resets); it = { kind: 'limit', rank: 5, sub: (r.fields.limit ? r.fields.limit + ' · ' : '') + (d < 0 ? 'Reset date passed' : (d === 0 ? 'Resets today' : 'Resets in ' + d + (d === 1 ? ' day' : ' days'))) }; }
    if (it) out.push({ ...it, r });
  }
  return out.sort((a, b) => a.rank - b.rank || (a.r.nextCheck || a.r.trialEnd || '￿').localeCompare(b.r.nextCheck || b.r.trialEnd || '￿') || a.r.title.localeCompare(b.r.title));
}

/** When nothing is urgent: the one most useful thing to do next. ctx: { drafts, stale, total, pins }. */
export function nextAction(ctx) {
  if (ctx.drafts > 0) return { id: 'review', text: ctx.drafts + (ctx.drafts === 1 ? ' link is' : ' links are') + ' still unreviewed. Two minutes in Quick review clears a few.', button: 'Review now' };
  if (ctx.stale > 0) return { id: 'stale', text: ctx.stale + (ctx.stale === 1 ? ' resource has' : ' resources have') + ' not been looked at in a while.', button: 'See them' };
  if (ctx.total >= 4 && !ctx.pins) return { id: 'pin', text: 'Pin the links you use most, so they are one tap away here.', button: 'Pin some' };
  if (ctx.total < 5) return { id: 'add', text: 'Add the links you use. Share them to Nexus, paste them, or import a bookmarks file.', button: 'Add links' };
  return { id: 'clear', text: 'Nothing needs you right now.', button: '' };
}

// ---------- quick review ----------
/** Unreviewed links, best-informed first (a page description beats a note beats nothing), skipped ones last. */
export function reviewQueue(resources, skipped = []) {
  const skip = new Map(skipped.map((id, i) => [id, i]));
  const info = r => (r.scan && r.scan.desc ? 0 : (r.notes ? 1 : 2));
  return resources.filter(r => r.draft && r.src !== 'following')
    .sort((a, b) => (skip.has(a.id) ? 1 : 0) - (skip.has(b.id) ? 1 : 0) || (skip.has(a.id) ? skip.get(a.id) - skip.get(b.id) : info(a) - info(b) || (a.createdAt || '').localeCompare(b.createdAt || '') || a.title.localeCompare(b.title)));
}

/** Examples for the search box, taken from the user's own "use it when" lines. */
export function exampleQueries(resources, n = 3, seed = 0) {
  const lines = [];
  for (const r of resources) if (!r.draft && r.status !== 'archived') for (const l of r.useWhen) if (l.length >= 8 && l.length <= 48) lines.push(l);
  if (!lines.length) return [];
  const out = []; let i = Math.abs(seed) % lines.length;
  for (let k = 0; k < lines.length && out.length < n; k++, i = (i + 7) % lines.length) if (!out.includes(lines[i])) out.push(lines[i]);
  return out;
}
