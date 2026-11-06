// watch.js - notice when a page changed. Pure functions, no network here.
// It compares only what a page says about itself: the title, the description and the headings.
// That is stable enough to avoid false alarms and cannot see changes lower down the page.
import { parseISO } from './util.js';

const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
/** For comparing: lower case, numbers masked (counters, dates and prices change all the time), spaces squeezed. */
export const norm = s => clip(s, 400).toLowerCase().replace(/\d[\d,.:/-]*/g, '#').replace(/\s+/g, ' ').trim();

/** The small record kept for a page. via = how it was read ('direct' or 'reader'): the two can word a title differently. */
export function fingerprint(page, via = '') {
  const p = page || {};
  return { t: clip(p.ogTitle || p.title, 160), d: clip(p.description, 300), h: (Array.isArray(p.headings) ? p.headings : []).map(x => clip(x, 90)).filter(Boolean).slice(0, 12), via: String(via || '').slice(0, 12) };
}
/** Enough to compare against? A page that gave no title and no headings is not watchable (often a page built by scripts, or a block page). */
export const usable = fp => !!(fp && (fp.t || fp.h.length));

/** What changed between two fingerprints. { same, what:[plain text], rebase } - rebase = read a different way, so start again instead of comparing. */
export function compare(a, b) {
  if (!usable(b)) return { same: true, what: [], unreadable: true };
  if (!usable(a)) return { same: true, what: [], rebase: true };
  if (a.via && b.via && a.via !== b.via) return { same: true, what: [], rebase: true };
  const what = [];
  if (norm(a.t) !== norm(b.t)) what.push('The title changed: "' + clip(a.t, 60) + '" is now "' + clip(b.t, 60) + '".');
  if (norm(a.d) !== norm(b.d) && (a.d || b.d)) what.push(a.d && b.d ? 'The description changed.' : (b.d ? 'A description appeared.' : 'The description is gone.'));
  const ha = new Map(a.h.map(x => [norm(x), x])), hb = new Map(b.h.map(x => [norm(x), x]));
  const added = [...hb].filter(([k]) => !ha.has(k)).map(([, v]) => v), gone = [...ha].filter(([k]) => !hb.has(k)).map(([, v]) => v);
  if (added.length) what.push((added.length === 1 ? 'New heading: ' : added.length + ' new headings, like ') + '"' + clip(added[0], 60) + '".');
  if (gone.length) what.push((gone.length === 1 ? 'A heading is gone: ' : gone.length + ' headings are gone, like ') + '"' + clip(gone[0], 60) + '".');
  return { same: !what.length, what: what.slice(0, 4) };
}

/** The part stored on a resource. null = not watched. */
export function normWatch(w) {
  if (!w || typeof w !== 'object' || !w.on) return null;
  const fp = w.fp && typeof w.fp === 'object' ? { t: clip(w.fp.t, 160), d: clip(w.fp.d, 300), h: (Array.isArray(w.fp.h) ? w.fp.h : []).map(x => clip(x, 90)).filter(Boolean).slice(0, 12), via: String(w.fp.via || '').slice(0, 12) } : null;
  const day = x => (parseISO(x) ? String(x).slice(0, 10) : '');
  return { on: true, at: day(w.at), fp: fp && usable(fp) ? fp : null, changed: day(w.changed), what: (Array.isArray(w.what) ? w.what : []).map(x => clip(x, 200)).filter(Boolean).slice(0, 4) };
}
