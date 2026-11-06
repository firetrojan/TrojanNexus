// tags.js - look after your tags: counts, rename, merge, delete, and "these look like the same tag". Pure logic: no store, no DOM.

/** A tag the way Nexus stores it: lower case, no leading #, no commas, single spaces, at most 40 letters. */
export const cleanTag = s => String(s || '').toLowerCase().replace(/[,;\n]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^#+\s*/, '').trim().slice(0, 40).trim();

/** [{ tag, n, live }] most used first, then A to Z. n = every link with it, live = not archived. */
export function tagCounts(resources) {
  const m = new Map();
  for (const r of resources) for (const t of r.tags || []) { const e = m.get(t) || { tag: t, n: 0, live: 0 }; e.n++; if (r.status !== 'archived') e.live++; m.set(t, e); }
  return [...m.values()].sort((a, b) => b.live - a.live || b.n - a.n || a.tag.localeCompare(b.tag));
}

/**
 * For rename, join and delete: { [resource id]: new tag list } for the links that have any tag in `from` (one tag, or a list).
 * to = '' deletes them. Order is kept and no tag appears twice. Links without those tags are left out.
 */
export function retag(resources, from, to) {
  const out = {}, set = new Set([].concat(from)), dest = cleanTag(to);
  for (const r of resources) {
    if (!(r.tags || []).some(t => set.has(t))) continue;
    const next = []; for (const t of r.tags) { const x = set.has(t) ? dest : t; if (x && !next.includes(x)) next.push(x); }
    out[r.id] = next;
  }
  return out;
}

const key = t => t.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '').replace(/(ies)$/, 'y').replace(/(es|s)$/, '');
/** Groups of tags that probably mean the same thing (case, hyphens, plural): [{ tags: [{tag, n}] }], the most used first in each group. */
export function similarTags(counts) {
  const g = new Map();
  for (const c of counts) { const k = key(c.tag); if (k.length < 3) continue; if (!g.has(k)) g.set(k, []); g.get(k).push(c); }
  return [...g.values()].filter(a => a.length > 1).map(a => ({ tags: a.slice().sort((x, y) => y.n - x.n || x.tag.localeCompare(y.tag)) }))
    .sort((a, b) => b.tags.reduce((s, x) => s + x.n, 0) - a.tags.reduce((s, x) => s + x.n, 0));
}
