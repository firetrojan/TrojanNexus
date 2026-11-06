// tidy.js - small clean-ups for saved links and titles. Pure logic: it only PROPOSES changes; the screen shows them and you apply.
import { normUrl } from './util.js';

// Parameters that only say "this click came from X". Removing them never changes the page. (Anything not listed stays.)
const TRACK = /^(utm_[a-z0-9_]+|fbclid|gclid|dclid|msclkid|yclid|igshid|igsh|mc_cid|mc_eid|_hsenc|_hsmi|ref_src|ref_url|twclid|ttclid|vero_id|oly_enc_id|oly_anon_id|gbraid|wbraid|irclickid|irgwc|from_src)$/i;
const SHARE_ID = /^(si|feature|pp)$/i;                                  // tracking ids that YouTube and Spotify add to shared links
const SHARE_HOST = /(^|\.)(youtube\.com|youtu\.be|spotify\.com)$/i;

/** The address without tracking parameters, or the same string when there is nothing to remove. Everything else is kept exactly as saved. */
export function cleanUrl(url) {
  const s = String(url || '').trim(); if (!/^https?:\/\//i.test(s) || !s.includes('?')) return s;
  let host = ''; try { host = new URL(s).hostname; } catch (e) { return s; }
  const hashAt = s.indexOf('#'), hash = hashAt >= 0 ? s.slice(hashAt) : '', main = hashAt >= 0 ? s.slice(0, hashAt) : s;
  const q = main.indexOf('?'), base = main.slice(0, q), pairs = main.slice(q + 1).split('&').filter(x => x !== '');
  const keep = pairs.filter(p => { let k = p.split('=')[0]; try { k = decodeURIComponent(k); } catch (e) { /* keep raw */ } return !(TRACK.test(k) || (SHARE_ID.test(k) && SHARE_HOST.test(host))); });
  if (keep.length === pairs.length) return s;
  return base + (keep.length ? '?' + keep.join('&') : '') + hash;
}

/** The names of the tracking parameters cleanUrl removes, e.g. ["utm_source", "fbclid"]. */
export function droppedParams(url) {
  const to = cleanUrl(url); if (to === String(url || '').trim()) return [];
  const names = u => { const m = String(u).split('#')[0].split('?')[1]; return m ? m.split('&').filter(Boolean).map(x => x.split('=')[0]) : []; };
  const kept = names(to).slice(); const out = [];
  for (const n of names(url)) { const i = kept.indexOf(n); if (i >= 0) kept.splice(i, 1); else out.push(n); }
  return out;
}

const brand = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };
const GENERIC = new Set(['www', 'www2', 'm', 'news', 'docs', 'blog', 'app', 'web', 'mail', 'support', 'help', 'shop', 'store', 'en', 'learn', 'wiki']);
/** The words of the address that name the site: news.mit.edu -> ["mit"]; bbc.co.uk -> ["bbc"]. */
function siteWords(url) {
  let host = ''; try { host = new URL(String(url)).hostname.toLowerCase(); } catch (e) { return []; }
  const parts = host.split('.'); parts.pop();
  return parts.filter(w => w.length >= 3 && !GENERIC.has(w)).map(brand);
}
/**
 * A tidier title, or the same one. Removes: a "(3)" alert count at the start, a site name tacked on the end
 * ("Great article | Medium", "Cat video - YouTube") when it matches the site's own address, web-page symbols such as &amp;, extra spaces.
 */
export function cleanTitle(title, url) {
  let t = String(title || '').replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, m => ENT[m]).replace(/\s+/g, ' ').trim();
  t = t.replace(/^\(\d{1,3}\+?\)\s+/, '');
  const words = siteWords(url);
  const m = /^(.{4,}?)\s+(?:\||-|–|—|·|:)\s+([^|\-–—·:]{2,40})$/.exec(t);
  if (m && words.length) { const sb = brand(m[2]); if (sb && words.some(w => sb === w || sb.includes(w) || (w.includes(sb) && sb.length >= 4))) t = m[1].trim(); }
  return t;
}

/**
 * What could be tidied (archived, followed and locked links are left out): { links: [{ r, to }], titles: [{ r, to }], nowSame: n }.
 * nowSame = how many of those links are already the same page as another saved link (the Duplicates screen can merge them).
 */
export function tidyFindings(resources) {
  const links = [], titles = [], count = new Map();
  for (const r of resources) if (r.url && r.status !== 'archived') { const k = normUrl(r.url); count.set(k, (count.get(k) || 0) + 1); }
  let nowSame = 0;
  for (const r of resources) {
    if (r.status === 'archived' || r.src === 'following' || r.locked) continue;   // locked links are never changed
    if (r.url) {
      const to = cleanUrl(r.url);
      if (to !== r.url) { links.push({ r, to }); if ((count.get(normUrl(r.url)) || 0) > 1) nowSame++; }
    }
    const tt = cleanTitle(r.title, r.url);
    if (tt && tt !== r.title) titles.push({ r, to: tt });
  }
  return { links, titles, nowSame };
}
