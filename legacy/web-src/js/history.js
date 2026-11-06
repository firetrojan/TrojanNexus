// history.js - the short list of things that happened to one resource (reviewed, stage changed, checked, decided, merged, learned).
// Pure logic. It starts when this version is installed: it cannot know what happened before, so it never pretends to.

export const LOG_MAX = 25;
export const LOG_KINDS = { reviewed: 'Reviewed', status: 'Stage', checked: 'Checked', verdict: 'Decision', merged: 'Merged', learned: 'Learned' };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Clean a saved log: known kinds only, real dates, short text, newest last, at most 25. Safe for null and old data. */
export function normLog(v) {
  return (Array.isArray(v) ? v : [])
    .filter(e => e && typeof e === 'object' && LOG_KINDS[e.k] && typeof e.at === 'string' && ISO.test(e.at))
    .map(e => ({ at: e.at, k: e.k, t: String(e.t || '').slice(0, 120) }))
    .slice(-LOG_MAX);
}

/**
 * Add events ([[kind, text], ...]) dated today. The same event twice in a row on one day is kept once,
 * and a run of "checked" is kept as one line (the latest), so a daily check cannot push everything else out.
 */
export function pushLog(log, events, today) {
  const out = normLog(log);
  for (const [k, t] of events || []) {
    if (!LOG_KINDS[k]) continue;
    const text = String(t || '').slice(0, 120), last = out[out.length - 1];
    if (last && last.k === k && last.t === text && last.at === today) continue;
    if (last && last.k === 'checked' && k === 'checked') out.pop();
    out.push({ at: today, k, t: text });
  }
  return out.slice(-LOG_MAX);
}

/** Newest first, ready to show. */
export const showLog = log => normLog(log).slice().reverse();
