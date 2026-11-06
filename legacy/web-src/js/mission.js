// mission.js - pure helpers for mission progress (no browser, no store). A step only counts while its resource still exists.

/** Steps of a mission that still have a resource, each with its place (i) in the full list. */
export function liveSteps(t, has = () => true) {
  return (t.steps || []).map((s, i) => ({ s, i })).filter(x => has(x.s.rid));
}

/** { total, done, left, pct, next, complete }: next is the first step not done yet ({ s, i }) or null. */
export function progress(t, has = () => true) {
  const st = liveSteps(t, has), done = st.filter(x => x.s.done).length, total = st.length;
  return { total, done, left: total - done, pct: total ? Math.round(100 * done / total) : 0, next: st.find(x => !x.s.done) || null, complete: total > 0 && done === total };
}

/**
 * The mission Home should show: the one you chose (if it still has work left), else the one you worked on last,
 * else the one furthest along, else the first with any steps. Finished and empty missions are never picked.
 */
export function pickActive(threads, activeId = '', has = () => true) {
  const open = (threads || []).map((t, k) => ({ t, k, p: progress(t, has) })).filter(x => x.p.total > 0 && !x.p.complete);
  if (!open.length) return null;
  const chosen = open.find(x => x.t.id === activeId); if (chosen) return chosen.t;
  open.sort((a, b) => (b.t.lastDone || '').localeCompare(a.t.lastDone || '') || b.p.done - a.p.done || a.k - b.k);
  return open[0].t;
}
