// suggest.js - "which of my sectors does this link belong in?" Pure logic, works offline, no guessing from thin air:
// it only learns from what YOU already put in each sector (tags, same website, bookmark folder, topic, type, the sector's name).
import { siteKey } from './dupes.js';

const MIN_MEMBERS = 3;        // a sector with fewer links has nothing to learn from
const MIN_SCORE = 2.0;        // below this we say nothing rather than guess
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const bump = (m, k) => { if (k) m.set(k, (m.get(k) || 0) + 1); };

/** One profile per sector you filled yourself (not rule-based, not sealed, 3+ links). Build once, reuse for many links. */
export function buildProfiles(jobs, byId) {
  const out = [];
  for (const job of jobs) {
    if (job.rule || job.sealed) continue;
    const members = job.members.map(byId).filter(r => r && r.status !== 'archived' && !r.draft);
    if (members.length < MIN_MEMBERS) continue;
    const p = { job, n: members.length, ids: new Set(job.members), tags: new Map(), sites: new Map(), folders: new Map(), topics: new Map(), types: new Map(), words: norm(job.name).split(' ').filter(w => w.length >= 4) };
    for (const r of members) {
      new Set(r.tags).forEach(t => bump(p.tags, t));
      bump(p.sites, siteKey(r.url)); bump(p.folders, norm(r.folder)); bump(p.types, r.type);
      if (r.scan && r.scan.topic && r.scan.conf !== 'none') bump(p.topics, r.scan.topic);
    }
    out.push(p);
  }
  // a tag that is common in 3+ sectors (like "free" or "tool") says little about which one fits
  const homes = new Map(); out.forEach(p => p.tags.forEach((c, t) => { if (c / p.n >= 0.15) bump(homes, t); }));
  out.common = new Set([...homes].filter(([, n]) => n >= 3).map(([t]) => t));
  return out;
}

/** Score one link against one profile. Returns { score, why: [short reasons, strongest first] }. */
function scoreOne(r, p, key, folder, common) {
  let score = 0; const why = [];
  const add = (v, text) => { if (v > 0) { score += v; why.push({ v, text }); } };
  const tagHits = r.tags.map(t => ({ t, f: (p.tags.get(t) || 0) / p.n, w: common && common.has(t) ? 0.4 : 1.5 })).filter(x => x.f > 0).sort((a, b) => b.f * b.w - a.f * a.w);
  if (tagHits.length) add(Math.min(3.3, tagHits.reduce((s, x) => s + Math.min(1, 3 * x.f) * x.w, 0)), 'tags ' + tagHits.slice(0, 3).map(x => '#' + x.t).join(' '));
  const sameSite = key ? (p.sites.get(key) || 0) : 0;
  if (sameSite) add(3 + Math.min(2, sameSite * 0.5), sameSite === 1 ? 'same website as 1 link here' : 'same website as ' + sameSite + ' links here');
  if (folder) {
    const f = (p.folders.get(folder) || 0) / p.n;
    if (f > 0) add(Math.min(2.6, 5 * f), 'same bookmark folder');
    if (folder === norm(p.job.name)) add(4, 'bookmark folder has the sector\'s name');
  }
  if (r.scan && r.scan.topic && r.scan.conf !== 'none') { const f = (p.topics.get(r.scan.topic) || 0) / p.n; if (f > 0) add(Math.min(2.5, 5 * f), 'same topic'); }
  const tf = (p.types.get(r.type) || 0) / p.n; score += 0.8 * tf;   // counts a little, never shown as a reason
  if (p.words.length) { const hay = norm(r.title + ' ' + r.tags.join(' ')); if (p.words.some(w => hay.includes(w.slice(0, Math.max(4, w.length - 2))))) add(1.5, 'its name fits "' + p.job.name + '"'); }
  why.sort((a, b) => b.v - a.v);
  return { score, why: why.map(x => x.text) };
}

/**
 * The best sector for a link, or null. Only links with no sector of yours yet get a suggestion.
 * { job, score, why: [up to 2 short reasons], also: [a runner-up job, if close] }
 */
function rank(r, profiles, jobsOfFn) {
  if (!r || r.status === 'archived') return [];
  if (jobsOfFn && jobsOfFn(r.id).some(j => !j.rule)) return [];
  const key = siteKey(r.url), folder = norm(r.folder);
  return profiles.filter(p => !p.ids.has(r.id)).map(p => ({ p, ...scoreOne(r, p, key, folder, profiles.common) })).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
}
/** The best few sectors for a link, strongest first: [{ job, score, why }]. Empty when nothing scores high enough. */
export function suggestTop(r, profiles, jobsOfFn, n = 3) {
  return rank(r, profiles, jobsOfFn).filter(x => x.score >= MIN_SCORE).slice(0, n).map(x => ({ job: x.p.job, score: x.score, why: x.why.slice(0, 2) }));
}
export function suggest(r, profiles, jobsOfFn) {
  const ranked = rank(r, profiles, jobsOfFn);
  const best = ranked[0]; if (!best || best.score < MIN_SCORE) return null;
  const second = ranked[1];
  if (second && second.score > best.score * 0.85 && best.score - second.score < 1) return { job: best.p.job, score: best.score, why: best.why.slice(0, 2), unsure: true, also: [second.p.job] };   // a near tie: still shown, but marked as unsure
  return { job: best.p.job, score: best.score, why: best.why.slice(0, 2), unsure: false, also: second && second.score >= MIN_SCORE ? [second.p.job] : [] };
}

/** Suggestions for many links at once: [{ r, s }] for those with a clear (not unsure) fit. */
export function suggestMany(list, jobs, byId, jobsOfFn) {
  const profiles = buildProfiles(jobs, byId), out = [];
  for (const r of list) { const s = suggest(r, profiles, jobsOfFn); if (s && !s.unsure) out.push({ r, s }); }
  return out;
}
