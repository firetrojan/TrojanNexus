// insights.js - what the numbers say about how you use Nexus. Pure functions: pass in data, get plain facts back.
import { daysBetween, parseISO, iso } from './util.js';

export const IDLE_DAYS = 60;       // not opened for this long = a candidate to archive
// Opens are only counted when you open a link from inside Nexus, so "never opened" means nothing until Nexus has been counting for a while.

/** The links you open most (opened at least once), most first. */
export function mostUsed(resources, n = 6) {
  return resources.filter(r => r.opens > 0 && r.status !== 'archived').sort((a, b) => b.opens - a.opens || (b.openedAt || 0) - (a.openedAt || 0) || a.title.localeCompare(b.title)).slice(0, n);
}

/**
 * Links you probably do not use any more. ctx: { opensSince: 'yyyy-mm-dd' or '', today, inMission: Set of ids }.
 * Returns { ready, daysTracked, waitDays, list: [{ r, idle: days or null }] }. Not ready until Nexus has counted opens for IDLE_DAYS.
 * Never listed: pinned, locked, kept, drafts, Instagram follows, links without an address, watched pages, trials, and mission steps.
 */
export function cullInfo(resources, ctx) {
  const today = ctx.today, since = ctx.opensSince && parseISO(ctx.opensSince) ? ctx.opensSince : '';
  const daysTracked = since ? Math.max(0, daysBetween(since, today)) : 0;
  const ready = daysTracked >= IDLE_DAYS, waitDays = ready ? 0 : IDLE_DAYS - daysTracked;
  if (!ready) return { ready, daysTracked, waitDays, since, list: [] };
  const inMission = ctx.inMission || new Set(), list = [];
  for (const r of resources) {
    if (r.status === 'archived' || r.pinned || r.locked || r.keep || r.draft || r.src === 'following' || !r.url) continue;
    if (r.watch && r.watch.on) continue;
    if (r.trialEnd || r.status === 'testing' || inMission.has(r.id)) continue;
    const lastOpen = r.openedAt ? daysBetween(iso(new Date(r.openedAt)), today) : null;   // whole calendar days, so the answer does not change with the time of day
    if (lastOpen === null) list.push({ r, idle: null });
    else if (lastOpen >= IDLE_DAYS) list.push({ r, idle: lastOpen });
  }
  // longest idle first; never-opened ones after the ones we know were used once
  list.sort((a, b) => (b.idle === null ? -1 : b.idle) - (a.idle === null ? -1 : a.idle) || a.r.title.localeCompare(b.r.title));
  return { ready, daysTracked, waitDays, since, list };
}

/** Resources per sector you fill yourself (rule-based sectors included), biggest first, with how many are still to review. */
export function sectorShare(jobs, byId) {
  return jobs.map(j => {
    const rs = j.members.map(byId).filter(r => r && r.status !== 'archived');
    return { id: j.id, name: j.name, color: j.color, n: rs.length, drafts: rs.filter(r => r.draft).length, smart: !!j.rule };
  }).filter(x => x.n > 0).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

/** New links per month for the last `months` months, oldest first: [{ key: '2026-10', label: 'Oct', n }]. */
export function addedPerMonth(resources, today, months = 6) {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], t = parseISO(today) || new Date(), out = [];
  for (let i = months - 1; i >= 0; i--) { const d = new Date(t.getFullYear(), t.getMonth() - i, 1); out.push({ key: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: names[d.getMonth()], n: 0 }); }
  const idx = new Map(out.map(o => [o.key, o]));
  for (const r of resources) { const k = String(r.createdAt || r.added || '').slice(0, 7), o = idx.get(k); if (o) o.n++; }
  return out;
}

/** Things left lying around. `manualJobsOf(id)` returns the sectors you filled yourself that hold a resource. */
export function looseEnds(resources, manualJobsOf) {
  const live = resources.filter(r => r.status !== 'archived' && r.src !== 'following');
  return { noSector: live.filter(r => !manualJobsOf(r.id).length), noWords: live.filter(r => !r.draft && !r.useWhen.length && !r.capabilities.length) };
}

/** { kb, pct, label } for the saved data against the browser's usual 5 MB limit. */
export function storageInfo(bytes, cap = 5 * 1024 * 1024) {
  const kb = Math.round(bytes / 1024), pct = Math.min(100, Math.round(100 * bytes / cap));
  return { kb, pct, label: kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB' };
}
