// dupes.js - "same site" detection. Pure: no DOM, no store.
// An exact repeat (same address) is already skipped by the import. This finds the other case: a different page on a site you already have.
// "Site" means the owner, not just the domain: github.com/alice/a and github.com/bob/b are different sites, github.com/alice/a and github.com/alice/b are the same one.
import { normUrl } from './util.js';

// Platforms where many people share one domain. The key is the domain plus the owner part of the address.
const PLATFORM = {
  'github.com': 1, 'gitlab.com': 1, 'bitbucket.org': 1, 'x.com': 1, 'twitter.com': 1, 'instagram.com': 1, 'tiktok.com': 1,
  'facebook.com': 1, 'threads.net': 1, 't.me': 1, 'medium.com': 1, 'kaggle.com': 1, 'dev.to': 1, 'linktr.ee': 1, 'pinterest.com': 1,
  'linkedin.com': 2, 'reddit.com': 2, 'youtube.com': 'yt', 'huggingface.co': 'hf'
};
// Domains where one address says nothing about another (every page is a different thing). Never flagged.
const NOISY = ['google.com', 'wikipedia.org', 'stackoverflow.com', 'stackexchange.com', 'arxiv.org', 'doi.org', 'amazon.com', 'amazon.in', 'bit.ly', 't.co', 'goo.gl', 'tinyurl.com',
  'notion.so', 'figma.com', 'canva.com', 'archive.org', 'ycombinator.com', 'apple.com', 'quora.com', 'imdb.com', 'wikimedia.org', 'fandom.com', 'yahoo.com', 'bing.com', 'duckduckgo.com'];
// Places that hand out one sub-domain per person: the whole host is the site.
const HOSTING = ['github.io', 'vercel.app', 'netlify.app', 'pages.dev', 'web.app', 'firebaseapp.com', 'herokuapp.com', 'onrender.com', 'streamlit.app', 'hf.space', 'gradio.live',
  'blogspot.com', 'wordpress.com', 'substack.com', 'notion.site', 'carrd.co', 'wixsite.com', 'weebly.com', 'tumblr.com', 'ghost.io', 'beehiiv.com', 'bubbleapps.io', 'framer.website', 'webflow.io', 'repl.co', 'replit.app', 'glitch.me', 'itch.io'];
const SECOND = new Set(['co', 'com', 'org', 'net', 'gov', 'ac', 'edu', 'or', 'ne', 'go']);

const endsWith = (host, list) => list.some(d => host === d || host.endsWith('.' + d));
function registrable(host) {
  const p = host.split('.');
  if (p.length <= 2) return host;
  const tld = p[p.length - 1], sld = p[p.length - 2];
  return (tld.length === 2 && SECOND.has(sld) ? p.slice(-3) : p.slice(-2)).join('.');
}

/** The site an address belongs to, as a short key, or '' when it cannot be told (then nothing is flagged). */
export function siteKey(url) {
  let x; try { x = new URL(String(url || '').trim()); } catch (e) { return ''; }
  if (!/^https?:$/.test(x.protocol)) return '';
  let host = x.hostname.toLowerCase().replace(/^(www|m|mobile|old|new)\./, '');
  if (!host || !host.includes('.')) return '';
  if (host === 'youtu.be') return '';
  if (host.endsWith('youtube.com')) host = 'youtube.com';
  if (endsWith(host, NOISY)) return '';
  const seg = x.pathname.split('/').filter(Boolean).map(s => s.toLowerCase());
  const rule = PLATFORM[host];
  if (rule) {
    if (rule === 'yt') {   // channels have an owner in the address; single videos and playlists do not
      if (/^@/.test(seg[0] || '')) return host + '/' + seg[0];
      if (['channel', 'c', 'user'].includes(seg[0]) && seg[1]) return host + '/' + seg[0] + '/' + seg[1];
      return '';
    }
    if (rule === 'hf') { const o = ['spaces', 'datasets', 'models'].includes(seg[0]) ? seg[1] : seg[0]; return o ? host + '/' + o : ''; }
    if (!seg.length) return '';
    if (rule === 2) { const k = seg.slice(0, 2).join('/'); return seg.length >= 2 ? host + '/' + k : ''; }
    return host + '/' + seg[0];
  }
  if (endsWith(host, HOSTING)) return host;
  return registrable(host);
}

/** Map of site key -> [resources]. Resources without a link, or from the Instagram follow list, are left out. */
export function siteIndex(resources) {
  const m = new Map();
  for (const r of resources) {
    if (!r.url || r.src === 'following') continue;
    const k = siteKey(r.url); if (!k) continue;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

/** Other resources from the same site as this one: [{ r, same }] where same = the very same address. */
export function sameSite(r, index) {
  const k = r && r.url ? siteKey(r.url) : ''; if (!k || r.src === 'following') return [];
  const me = normUrl(r.url);
  return (index.get(k) || []).filter(o => o.id !== r.id).map(o => ({ r: o, same: normUrl(o.url) === me }));
}

/**
 * For an import: which new entries sit on a site you already have (or that another new entry in the same list also uses)?
 * Returns [{ entry, others: [{ title, url, saved }] }]. Entries are { url, title }.
 */
export function flagEntries(entries, resources) {
  const idx = siteIndex(resources), batch = new Map(), out = [];
  for (const e of entries) {
    const k = e.src === 'following' ? '' : siteKey(e.url); if (!k) continue;
    if (!batch.has(k)) batch.set(k, []);
    batch.get(k).push(e);
  }
  for (const e of entries) {
    const k = e.src === 'following' ? '' : siteKey(e.url); if (!k) continue;
    const saved = (idx.get(k) || []).map(r => ({ title: r.title, url: r.url, saved: true }));
    const mine = normUrl(e.url);
    const peers = (batch.get(k) || []).filter(o => normUrl(o.url) !== mine).map(o => ({ title: o.title || o.url, url: o.url, saved: false }));
    if (saved.length || peers.length) out.push({ entry: e, others: saved.concat(peers) });
  }
  return out;
}
