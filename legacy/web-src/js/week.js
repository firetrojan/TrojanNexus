// week.js - the weekly reset and "3 things for this week". Pure logic: no DOM, no store.
import { daysBetween, addDays } from './util.js';

export const RESET_EVERY = 7;    // days between resets before Home nudges you
export const PICKS_LIVE = 7;     // a pick list stays on Home this many days
export const MAX_PICKS = 3;
const isoOrEmpty = s => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '');

/** Clean what was saved: { doneAt, pickedAt, snooze, picks: [{ rid, done }] }. Safe for null and old data. */
export function normWeekly(v) {
  const o = v && typeof v === 'object' ? v : {};
  const seen = new Set(), picks = [];
  for (const p of Array.isArray(o.picks) ? o.picks : []) {
    if (p && typeof p.rid === 'string' && p.rid && !seen.has(p.rid) && picks.length < MAX_PICKS) { seen.add(p.rid); picks.push({ rid: p.rid, done: !!p.done }); }
  }
  return { doneAt: isoOrEmpty(o.doneAt), pickedAt: isoOrEmpty(o.pickedAt), snooze: isoOrEmpty(o.snooze), picks };
}

/** Should Home nudge for a reset? Only once there is something worth resetting (10+ links), 7+ days after the last one, and not snoozed. */
export function resetDue(weekly, today, count) {
  const w = normWeekly(weekly), days = w.doneAt ? daysBetween(w.doneAt, today) : null;
  const later = !!(w.snooze && w.snooze > today);
  return { due: count >= 10 && (days === null || days >= RESET_EVERY) && !later, days };
}

/** The picks to show on Home: only if picked within the last 7 days, and only links that still exist. */
export function activePicks(weekly, today, has = () => true) {
  const w = normWeekly(weekly);
  if (!w.pickedAt) return [];
  const age = daysBetween(w.pickedAt, today);
  if (age < 0 || age >= PICKS_LIVE) return [];
  return w.picks.filter(p => has(p.rid));
}

export const setPicks = (weekly, rids, today) => ({ ...normWeekly(weekly), pickedAt: today, picks: [...new Set(rids)].slice(0, MAX_PICKS).map(rid => ({ rid, done: false })) });
export const togglePick = (weekly, rid) => { const w = normWeekly(weekly); return { ...w, picks: w.picks.map(p => (p.rid === rid ? { ...p, done: !p.done } : p)) }; };
export const finishReset = (weekly, today) => ({ ...normWeekly(weekly), doneAt: today, snooze: '' });
export const snoozeReset = (weekly, today, days = 2) => ({ ...normWeekly(weekly), snooze: addDays(today, days) });

/**
 * Up to 3 things worth doing this week, with the reason for each. Order of importance:
 * a trial to decide (it can cost money), the next step of your mission, another thing that is due, an old link, links still to review.
 * ctx: { needs: [{ r, kind, sub }], mission: { r, name } | null, stale: [r], drafts: [r] }
 */
export function suggestPicks(ctx, n = MAX_PICKS) {
  const out = [], seen = new Set(), needs = ctx.needs || [];
  const add = (r, why) => { if (r && !seen.has(r.id) && out.length < n) { seen.add(r.id); out.push({ rid: r.id, why }); } };
  needs.filter(x => x.kind === 'trial').slice(0, 1).forEach(x => add(x.r, 'Trial: decide keep or drop'));
  if (ctx.mission) add(ctx.mission.r, 'Next step of ' + ctx.mission.name);
  needs.filter(x => x.kind !== 'trial').slice(0, 1).forEach(x => add(x.r, x.sub));
  (ctx.stale || []).slice(0, 1).forEach(r => add(r, 'Not checked in a while'));
  (ctx.drafts || []).slice(0, 2).forEach(r => add(r, 'Still to review'));
  needs.forEach(x => add(x.r, x.sub));
  return out;
}

/**
 * What happened in the last 7 days (today included), for the top of the weekly reset.
 * { added, opened, reviewed, checked, learned, merged, stage, picks: { done, total, at } | null }
 * opened = different links you opened (not how many times). reviewed/checked/learned/merged/stage come from each link's own history,
 * which only exists since version 3.2, so a week that began before that is under-counted.
 */
export function weekDigest(resources, weekly, today, days = 7) {
  const from = addDays(today, -(days - 1)), fromMs = new Date(from + 'T00:00:00').getTime();
  const d = { added: 0, opened: 0, reviewed: 0, checked: 0, learned: 0, merged: 0, stage: 0, picks: null };
  const kinds = { reviewed: 'reviewed', checked: 'checked', learned: 'learned', merged: 'merged', status: 'stage' };
  for (const r of resources) {
    if (r.createdAt >= from && r.createdAt <= today) d.added++;
    if (r.openedAt >= fromMs) d.opened++;
    for (const e of r.log || []) if (e.at >= from && e.at <= today && kinds[e.k]) d[kinds[e.k]]++;
  }
  const w = normWeekly(weekly);
  if (w.picks.length && w.pickedAt) d.picks = { done: w.picks.filter(p => p.done).length, total: w.picks.length, at: w.pickedAt };
  return d;
}
