// search.js - the "Can I do X?" engine, plus helpers that suggest where a new resource belongs.
// Words must match (AND) unless mode is 'or'. Matches in "use when" and "can do" outrank notes.
import { esc, domainOf } from './util.js';

export const STOP = new Set(('a an the and or of to for in on at is are was be been can could do does did how i me my we you your it its this that ' +
  'these those with from by as into about what which who where when why get use using need want help make please some any there here also just ' +
  'find looking look search').split(' '));

export const FIELD_WEIGHT = { useWhen: 5, capabilities: 4, title: 3, tags: 3, inputs: 1.5, outputs: 1.5, type: 1.5, fields: 2, notes: 1 };
export const FIELD_LABEL = { useWhen: 'use when', capabilities: 'can do', title: 'name', tags: 'tag', inputs: 'input', outputs: 'output', type: 'type', fields: 'details', notes: 'notes' };

export function tokenize(q) {
  return (String(q || '').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}+#._'-]*/gu) || [])
    .map(t => t.replace(/[._'-]+$/g, '')).filter(Boolean);
}

/** Very light stemmer: slides -> slide, converting -> convert. */
export function stem(w) {
  w = String(w).toLowerCase();
  if (w.length <= 3) return w;
  if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
  if (w.endsWith('sses')) return w.slice(0, -2);
  if (w.endsWith('ss')) return w;
  if (w.endsWith('s') && !w.endsWith('us') && !w.endsWith('is')) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  return w;
}

function fieldText(r, f) {
  switch (f) {
    case 'useWhen': return r.useWhen.join(' · ');
    case 'capabilities': return r.capabilities.join(' · ');
    case 'tags': return r.tags.join(' ');
    case 'type': return r.type.replace(/-/g, ' ');
    case 'fields': return Object.values(r.fields || {}).join(' · ');
    case 'notes': return (r.notes || '') + ' ' + (r.learned || '');   // what you learned is searchable like a note
    default: return r[f] || '';
  }
}

const cache = new Map();
function indexOf(r) {
  const sig = [r.title, r.tags.join(','), r.capabilities.join('|'), r.useWhen.join('|'), r.inputs, r.outputs, r.type, r.notes, r.learned, JSON.stringify(r.fields || {})].join('\u0001');
  let c = cache.get(r.id);
  if (c && c.sig === sig) return c;
  const f = {};
  for (const k in FIELD_WEIGHT) { const text = fieldText(r, k).toLowerCase(); f[k] = { text, words: tokenize(text).map(stem) }; }
  c = { sig, f }; cache.set(r.id, c);
  return c;
}

/** 1 = whole word, 0.85 = same word start, 0.6 = inside a word, 0 = no match */
function matchField(fi, tok, ts) {
  for (const w of fi.words) if (w === ts) return 1;
  if (ts.length >= 4) for (const w of fi.words) if (w.length >= 4 && (w.startsWith(ts) || ts.startsWith(w))) return 0.85;
  if (tok.length >= 3 && fi.text.includes(tok)) return 0.6;
  return 0;
}

/**
 * search(resources, 'turn pdf into slides', {mode:'and'|'or', types:Set, statuses:Set})
 * -> { tokens, results:[{r, score, matched, hit:{field:[tokenIndex]}, fields:[field...]}] }
 */
export function search(resources, query, opts = {}) {
  const { mode = 'and', types = null, statuses = null } = opts;
  const raw = tokenize(query);
  let toks = raw.filter(t => !STOP.has(t));
  if (!toks.length) toks = raw;
  if (!toks.length) return { tokens: [], results: [] };
  const stems = toks.map(stem);
  const phrase = toks.join(' ');
  const results = [];
  for (const r of resources) {
    if (types && types.size && !types.has(r.type)) continue;
    if (statuses && statuses.size && !statuses.has(r.status)) continue;
    const c = indexOf(r);
    let score = 0, matched = 0;
    const hit = {};
    for (let i = 0; i < toks.length; i++) {
      let any = false;
      for (const k in FIELD_WEIGHT) {
        const m = matchField(c.f[k], toks[i], stems[i]);
        if (m) { score += FIELD_WEIGHT[k] * m; (hit[k] = hit[k] || []).push(i); any = true; }
      }
      if (any) matched++;
    }
    if (mode === 'and' ? matched < toks.length : matched === 0) continue;
    if (toks.length > 1) {
      if (c.f.useWhen.text.includes(phrase) || c.f.capabilities.text.includes(phrase) || c.f.title.text.includes(phrase)) score += 4;
      for (const k of ['useWhen', 'capabilities']) if (hit[k] && hit[k].length === toks.length) score += 3;
    }
    if (r.status === 'archived') score *= 0.5;
    results.push({ r, score, matched, hit, fields: Object.keys(hit).sort((a, b) => FIELD_WEIGHT[b] - FIELD_WEIGHT[a]) });
  }
  // more matched words first (matters in 'any word' mode), then score
  results.sort((a, b) => b.matched - a.matched || b.score - a.score || a.r.title.localeCompare(b.r.title));
  return { tokens: toks, results };
}

/** Escape text and wrap query words in <mark>. Safe to put into innerHTML. */
export function highlight(text, toks) {
  const t = String(text == null ? '' : text);
  if (!toks || !toks.length) return esc(t);
  const pats = toks.map(w => {
    const s = stem(w), base = (s.length >= 3 ? s : w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return base.length < 3 ? '\\b' + base + '\\b' : base;
  }).sort((a, b) => b.length - a.length);
  const re = new RegExp('(' + pats.join('|') + ')', 'gi');
  let out = '', last = 0, m;
  while ((m = re.exec(t))) {
    if (!m[0]) { re.lastIndex++; continue; }
    out += esc(t.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>';
    last = m.index + m[0].length;
  }
  return out + esc(t.slice(last));
}

/** Threads that contain at least one of the given resource ids, best first. */
export function threadsFor(ids, threads) {
  const set = new Set(ids);
  return threads.map(t => ({ t, n: t.steps.filter(s => set.has(s.rid)).length })).filter(x => x.n).sort((a, b) => b.n - a.n);
}

// ---------- suggestions for newly added resources ----------
export function suggestLinks(r, resources, k = 4) {
  const tags = new Set(r.tags), dom = domainOf(r.url);
  const words = new Set(tokenize(r.title).filter(w => w.length > 3 && !STOP.has(w)).map(stem));
  const out = [];
  for (const o of resources) {
    if (o.id === r.id || r.related.includes(o.id)) continue;
    let s = 0;
    for (const t of o.tags) if (tags.has(t)) s += 3;
    if (dom && domainOf(o.url) === dom) s += 4;
    for (const w of tokenize(o.title)) if (words.has(stem(w))) s += 1;
    if (s >= 3) out.push({ r: o, score: s });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, k);
}

export function suggestJobs(r, jobs, byId, k = 3) {
  const tags = new Set(r.tags), out = [];
  for (const j of jobs) {
    if (j.members.includes(r.id)) continue;
    let s = 0;
    for (const m of j.members) {
      const o = byId(m); if (!o) continue;
      for (const t of o.tags) if (tags.has(t)) s += 1;
      if (o.type === r.type) s += 0.2;
    }
    s /= Math.sqrt(Math.max(1, j.members.length));
    if (s > 0) out.push({ j, score: s });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, k);
}
