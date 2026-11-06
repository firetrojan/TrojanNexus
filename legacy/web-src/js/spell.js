// spell.js - "Did you mean": when a search finds nothing, look for a word YOU have used that is one or two typos away.
// It only uses words from your own links (names, tags, "can do", "use it when"), so it never suggests a word you do not have.
// Pure logic: no DOM, no store.
import { search, tokenize, stem, STOP } from './search.js';

/** Every word of 3+ letters in your names, tags, abilities and "use it when" lines, with how often it appears. */
export function vocabulary(resources) {
  const m = new Map();
  for (const r of resources) {
    for (const w of tokenize([r.title, (r.tags || []).join(' '), (r.capabilities || []).join(' '), (r.useWhen || []).join(' ')].join(' '))) if (w.length >= 3) m.set(w, (m.get(w) || 0) + 1);
  }
  return m;
}

/** Number of edits (add, remove, change a letter, swap two neighbours) to turn a into b. Gives max+1 as soon as it is clearly more than max. */
export function editDistance(a, b, max = 2) {
  const A = [...String(a)], B = [...String(b)];
  if (Math.abs(A.length - B.length) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length: B.length + 1 }, (_, j) => j);
  for (let i = 1; i <= A.length; i++) {
    const cur = [i]; let low = i;
    for (let j = 1; j <= B.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && A[i - 1] === B[j - 2] && A[i - 2] === B[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v; if (v < low) low = v;
    }
    if (low > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[B.length];
}

/** Would search already find this word in your links? (Same idea as search: whole word, same start, or inside a word.) */
function known(t, words, stems) {
  if (stems.has(stem(t))) return true;
  if (t.length >= 4) for (const w of stems) if (w.length >= 4 && (w.startsWith(t) || t.startsWith(w))) return true;   // "hostng" still finds "hosting", because search compares the stem "host"
  for (const w of words) { if (w === t) return true; if (t.length >= 4 && w.length >= 4 && (w.startsWith(t) || t.startsWith(w))) return true; if (t.length >= 3 && w.includes(t)) return true; }
  return false;
}

/**
 * The query with typos fixed: { q, changes: [{ from, to }] }, or null when every word is fine or nothing close exists.
 * Words under 4 letters are never changed. 4-5 letter words may be 1 edit off, longer ones 2.
 */
export function didYouMean(query, vocab) {
  const raw = tokenize(query); if (!raw.length) return null;
  const words = [...vocab.keys()], stems = new Set(words.map(stem)), fix = new Map();
  for (const t of raw) {
    if (STOP.has(t) || t.length < 4 || fix.has(t) || known(t, words, stems)) continue;
    const max = t.length >= 6 ? 2 : 1; let best = null, bd = max + 1;
    for (const w of words) {
      if (w === t || w.length < 3) continue;
      const d = editDistance(t, w, max); if (d > max) continue;
      const better = !best || d < bd || (d === bd && ((vocab.get(w) > vocab.get(best)) || (vocab.get(w) === vocab.get(best) && ((w[0] === t[0]) > (best[0] === t[0]) || ((w[0] === t[0]) === (best[0] === t[0]) && w < best)))));
      if (better) { best = w; bd = d; }
    }
    if (best) fix.set(t, best);
  }
  if (!fix.size) return null;
  return { q: raw.map(t => fix.get(t) || t).join(' '), changes: [...fix].map(([from, to]) => ({ from, to })) };
}

/** A fix that really helps: { q, changes, n } where n = how many links the fixed words find. Null if there is no fix or it finds nothing. */
export function suggestFix(resources, query, opts = {}) {
  const dm = didYouMean(query, vocabulary(resources)); if (!dm) return null;
  const n = search(resources, dm.q, { mode: opts.mode || 'and', types: opts.types, statuses: opts.statuses }).results.length;
  return n ? { ...dm, n } : null;
}
