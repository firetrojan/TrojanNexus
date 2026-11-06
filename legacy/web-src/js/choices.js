// choices.js - which sectors to offer as one-tap buttons for a link that has no sector yet. Pure logic: no DOM, no store.

export const RECENT_MAX = 8;

/** Put a sector id first in the "used lately" list, no repeats, at most 8. */
export const pushRecent = (list, id) => [id].concat((Array.isArray(list) ? list : []).filter(x => x !== id)).filter(x => typeof x === 'string' && x).slice(0, RECENT_MAX);

/**
 * Up to n sectors to show: first the ones that fit the link, then the ones you placed links in lately, then the biggest.
 * Only sectors you fill by hand (not rule sectors), and not ones the link is already in.
 * Returns [{ job, kind: 'fit' | 'recent' | 'big' }].
 */
export function sectorChoices(r, jobs, { fits = [], recent = [] } = {}, n = 4) {
  const ok = j => j && !j.rule && !j.members.includes(r.id);
  const byId = new Map(jobs.map(j => [j.id, j])), out = [], seen = new Set();
  const add = (j, kind) => { if (ok(j) && !seen.has(j.id) && out.length < n) { seen.add(j.id); out.push({ job: j, kind }); } };
  fits.forEach(j => add(j && byId.get(j.id), 'fit'));
  recent.forEach(id => add(byId.get(id), 'recent'));
  jobs.slice().sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name)).forEach(j => add(j, 'big'));
  return out;
}
