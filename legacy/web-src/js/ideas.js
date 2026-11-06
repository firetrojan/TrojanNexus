// ideas.js - "New sector ideas": groups of links that share a tag (or a type) but sit in no sector you made yourself.
// It only SUGGESTS. Nothing is created until you press Create. Pure logic: no DOM, no store.

const SKIP_TYPES = new Set(['other', 'web-tool']);          // too general to be a sector
const title = s => String(s).replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

/**
 * resources, existing sector names, manualJobsOf(id) -> the hand-made sectors a link is in (leave "Inbox" out of it),
 * typeLabel(type) -> a readable name. Returns up to `max` ideas: [{ key, name, ids, n, how }] best first, with no link in two ideas.
 * Needs at least `min` links in the group.
 */
export function sectorIdeas(resources, jobNames, manualJobsOf, typeLabel = t => t, { min = 3, max = 4 } = {}) {
  const taken = new Set(jobNames.map(n => String(n).trim().toLowerCase()));
  let pool = resources.filter(r => r.status !== 'archived' && r.src !== 'following' && !r.draft && !manualJobsOf(r.id).length);
  const out = [];
  while (out.length < max && pool.length >= min) {
    const g = new Map();
    const add = (key, name, how, r) => { let e = g.get(key); if (!e) g.set(key, e = { key, name, how, ids: [] }); e.ids.push(r.id); };
    for (const r of pool) {
      for (const t of r.tags || []) if (t.length >= 2 && !/^\d+$/.test(t) && !taken.has(t.toLowerCase())) add('t:' + t, title(t), 'tag #' + t, r);
      if (!SKIP_TYPES.has(r.type) && !taken.has(String(typeLabel(r.type)).toLowerCase())) add('y:' + r.type, typeLabel(r.type), 'type ' + typeLabel(r.type), r);
    }
    const best = [...g.values()].filter(e => e.ids.length >= min && !out.some(o => o.key === e.key))
      .sort((a, b) => b.ids.length - a.ids.length || (a.key.startsWith('t:') ? 0 : 1) - (b.key.startsWith('t:') ? 0 : 1) || a.name.localeCompare(b.name))[0];
    if (!best) break;
    out.push({ key: best.key, name: best.name, ids: best.ids, n: best.ids.length, how: best.how });
    const used = new Set(best.ids); pool = pool.filter(r => !used.has(r.id));
  }
  return out;
}
