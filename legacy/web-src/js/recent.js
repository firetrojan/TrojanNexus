// recent.js - "Continue where you left off": the last few links, sectors and missions you looked at. Pure logic: no DOM, no store.

export const RECENT_MAX = 8;
const KINDS = new Set(['r', 's', 'm']);   // r = link, s = sector, m = mission

/** Clean a saved list: known kinds, real ids and times, newest first, no repeats, at most 8. */
export function normRecent(v) {
  const seen = new Set(), out = [];
  for (const e of Array.isArray(v) ? v : []) {
    if (!e || !KINDS.has(e.k) || typeof e.id !== 'string' || !e.id || !Number.isFinite(+e.at)) continue;
    const key = e.k + ':' + e.id; if (seen.has(key)) continue;
    seen.add(key); out.push({ k: e.k, id: e.id, at: +e.at });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, RECENT_MAX);
}
/** Note that you just looked at something. It moves to the front. */
export const pushVisit = (list, k, id, now) => (KINDS.has(k) && id ? normRecent([{ k, id, at: now }].concat(normRecent(list).filter(e => !(e.k === k && e.id === id)))) : normRecent(list));
/** The ones that still exist, newest first. */
export const liveVisits = (list, exists, n = 5) => normRecent(list).filter(e => exists(e.k, e.id)).slice(0, n);

/** "just now", "12 min ago", "3 h ago", "yesterday", "4 days ago". */
export function agoText(at, now) {
  const m = Math.floor((now - at) / 6e4);
  if (m < 2) return 'just now'; if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60); if (h < 24) return h + ' h ago';
  const d = Math.floor(h / 24); return d === 1 ? 'yesterday' : d + ' days ago';
}
