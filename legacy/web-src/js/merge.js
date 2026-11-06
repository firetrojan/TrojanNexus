// merge.js - join two links about the same thing into one. Pure logic: it works out WHAT the survivor gets; the store does the moving.
import { siteIndex } from './dupes.js';
import { normUrl } from './util.js';

const key = s => String(s || '').trim().toLowerCase();
const union = (a, b) => { const seen = new Set(a.map(key)); return a.concat(b.filter(x => !seen.has(key(x)))); };

/**
 * The fields the surviving link (keep) gets from the one being removed (drop). Nothing of keep is overwritten except by adding:
 * tags, uses, abilities and notes are joined; empty fields are filled; opens are added up; the older date wins.
 * If either one was already reviewed, the result counts as reviewed.
 */
export function mergePatch(keep, drop) {
  const extra = [];
  if (drop.notes && !String(keep.notes).includes(drop.notes)) extra.push('From "' + drop.title + '": ' + drop.notes);
  if (drop.url && keep.url && normUrl(drop.url) !== normUrl(keep.url) && !String(keep.notes).includes(drop.url)) extra.push('Also: ' + drop.url);
  const fields = { ...(drop.fields || {}) };
  for (const [k, v] of Object.entries(keep.fields || {})) if (v !== '' && v != null) fields[k] = v;
  const learned = keep.learned && drop.learned && !keep.learned.includes(drop.learned) ? keep.learned + '\n' + drop.learned : (keep.learned || drop.learned || '');
  return {
    url: keep.url || drop.url, tags: union(keep.tags, drop.tags), capabilities: union(keep.capabilities, drop.capabilities), useWhen: union(keep.useWhen, drop.useWhen),
    inputs: keep.inputs || drop.inputs, outputs: keep.outputs || drop.outputs, notes: [keep.notes].concat(extra).filter(Boolean).join('\n\n'), learned, fields,
    pinned: !!(keep.pinned || drop.pinned), keep: !!(keep.keep || drop.keep), opens: Math.min(1e6, (keep.opens || 0) + (drop.opens || 0)), openedAt: Math.max(keep.openedAt || 0, drop.openedAt || 0),
    draft: !!(keep.draft && drop.draft), createdAt: [keep.createdAt, drop.createdAt].filter(Boolean).sort()[0] || keep.createdAt, watch: keep.watch || drop.watch, scan: keep.scan || drop.scan
  };
}

/**
 * Sites where you saved more than one link: [{ key, items: [resource], exact }]. exact = two of them share the very same address.
 * Biggest groups first. Archived links and sites you marked "not a duplicate" (ignore: list of keys) are left out.
 */
export function dupeGroups(resources, ignore = []) {
  const skip = new Set(ignore), out = [];
  for (const [k, items] of siteIndex(resources.filter(r => r.status !== 'archived'))) {
    if (items.length < 2 || skip.has(k)) continue;
    const seen = new Set(); let exact = false;
    for (const r of items) { const u = normUrl(r.url); if (seen.has(u)) exact = true; seen.add(u); }
    out.push({ key: k, items, exact });
  }
  return out.sort((a, b) => (b.exact - a.exact) || b.items.length - a.items.length || a.key.localeCompare(b.key));
}
