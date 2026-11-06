// pageparse.js - read what a page says about itself: title, description, keywords, headings, plain text, feed links.
// Pure text work with no DOM, so it behaves the same in a browser and in tests. Fetched text is never put into the page as HTML.
import { decode } from './importers.js';

const MAXHTML = 600000;
const squash = s => decode(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const attrOf = (tag, name) => { const m = new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(tag); return m ? decode(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3])) : ''; };
const abs = (href, base) => { try { return new URL(href, base).href; } catch (e) { return ''; } };

const WALLS = [
  [/just a moment|attention required|checking your browser|verify you are (a )?human|are you a robot|captcha|access denied|request blocked|unusual traffic/i, 'bot'],
  [/log ?in to|sign ?in to|log in or sign up|create an account to|login\s*[•|·-]\s*instagram|you must be logged in|sign up to see|join to view/i, 'login'],
  [/enable javascript|javascript is (disabled|required)|please turn on javascript/i, 'js']
];
/** 'bot' | 'login' | 'js' when the text is a wall, not the real page. Only trusted for short pages. */
export function wallKind(title, text) {
  const t = String(title || '') + ' ' + String(text || '').slice(0, 500);
  if (String(text || '').length > 1800) return '';
  for (const [rx, k] of WALLS) if (rx.test(t)) return k;
  return '';
}

/** Split a comma / pipe list of keywords into short lower-case tags. */
export function cleanKeywords(v) {
  const list = Array.isArray(v) ? v : String(v || '').split(/[,;|\n]/);
  const out = []; for (const x of list) { const k = String(x).trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}+#.-]/gu, ''); if (k.length >= 2 && k.length <= 24 && !out.includes(k)) out.push(k); }
  return out.slice(0, 8);
}

/** Tidy a page title: drop " | Site name" and " - Site name" endings when what is left is still a real title. */
export function tidyTitle(t, site) {
  let s = squash(t); if (!s) return '';
  const parts = s.split(/\s+[|·•–—-]\s+/);
  if (parts.length > 1) {
    const sn = String(site || '').toLowerCase();
    const last = parts[parts.length - 1].toLowerCase(), first = parts[0];
    if (parts.length >= 2 && ((sn && (last.includes(sn) || sn.includes(last))) || (last.split(' ').length <= 3 && first.length >= 12))) s = parts.slice(0, -1).join(' - ');
  }
  return s.slice(0, 140);
}

/** Parse an HTML string. */
export function parseHTML(html, url = '') {
  const raw = String(html || '').slice(0, MAXHTML), meta = {};
  for (const m of raw.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0], key = (attrOf(tag, 'property') || attrOf(tag, 'name') || attrOf(tag, 'itemprop') || attrOf(tag, 'http-equiv')).toLowerCase(), c = attrOf(tag, 'content');
    if (key && c && !(key in meta)) meta[key] = c;
  }
  const tm = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw), htmlTag = /<html\b[^>]*>/i.exec(raw);
  const rss = []; for (const m of raw.matchAll(/<link\b[^>]*>/gi)) { const t = m[0]; if (/alternate/i.test(attrOf(t, 'rel')) && /(rss|atom)\+xml/i.test(attrOf(t, 'type'))) { const u = abs(attrOf(t, 'href'), url); if (u && !rss.includes(u)) rss.push(u); } }
  const canon = (() => { for (const m of raw.matchAll(/<link\b[^>]*>/gi)) if (/canonical/i.test(attrOf(m[0], 'rel'))) return abs(attrOf(m[0], 'href'), url); return ''; })();
  const ld = []; for (const m of raw.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) { try { const j = JSON.parse(m[1].trim()); (Array.isArray(j) ? j : (j['@graph'] || [j])).forEach(x => x && typeof x === 'object' && ld.push(x)); } catch (e) { /* ignore broken JSON-LD */ } }
  const body = (/<body\b[\s\S]*<\/body>/i.exec(raw) || [raw])[0];
  const pick = (/<(main|article)\b[\s\S]*?<\/\1>/i.exec(body) || [body])[0];
  const stripped = pick.replace(/<(script|style|noscript|svg|template|iframe|nav|footer|form)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  const headings = []; for (const m of stripped.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) { const t = squash(m[2]); if (t && t.length > 2 && t.length < 140 && !headings.includes(t)) headings.push(t); if (headings.length >= 8) break; }
  const text = squash(stripped).slice(0, 5000);
  const org = ld.find(x => /Organization|WebSite|Person|Blog|Course|SoftwareApplication|WebApplication|Product|Article/i.test(String(x['@type'] || '')));
  const description = squash(meta['og:description'] || meta['description'] || meta['twitter:description'] || (org && org.description) || '');
  const page = {
    title: squash(tm ? tm[1] : ''), ogTitle: squash(meta['og:title'] || meta['twitter:title'] || ''), site: squash(meta['og:site_name'] || meta['application-name'] || ''),
    description: description.slice(0, 500), ogType: meta['og:type'] || '', lang: (htmlTag ? attrOf(htmlTag[0], 'lang') : '') || meta['og:locale'] || '',
    keywords: cleanKeywords(meta['keywords'] || meta['news_keywords'] || (org && org.keywords) || ''), headings, text, rss: rss.slice(0, 3), canonical: canon,
    ldType: org ? [].concat(org['@type']).join(',') : '', author: squash(meta['author'] || meta['article:author'] || '')
  };
  page.wall = wallKind(page.title, page.text);
  return page;
}

/** Markdown from a reader service -> headings + plain text. */
function fromMarkdown(md) {
  const headings = []; for (const m of md.matchAll(/^\s{0,3}#{1,3}\s+(.+)$/gm)) { const t = squash(m[1].replace(/[*_`\[\]()]/g, '')); if (t && t.length < 140 && !headings.includes(t)) headings.push(t); if (headings.length >= 8) break; }
  const text = md.replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, ' ').replace(/^\s{0,3}#{1,6}\s+/gm, '').replace(/[*_`>|~]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000);
  return { headings, text };
}

/** Reader service output: JSON ({data:{title,description,content,url}}), or "Title: ... Markdown Content: ...", or plain HTML. */
export function parseReader(body, url = '') {
  const t = String(body || '').trim();
  if (!t) return { empty: true };
  let j = null; if (t[0] === '{') { try { j = JSON.parse(t); } catch (e) { j = null; } }
  if (j) {
    const d = j.data || j;
    if (j.code && j.code >= 400 && !d.content) return { error: { code: j.code, msg: String(j.message || j.readableMessage || j.name || '') } };
    const md = fromMarkdown(String(d.content || ''));
    const p = { title: squash(d.title || ''), ogTitle: '', site: '', description: squash(d.description || '').slice(0, 500), ogType: '', lang: '', keywords: [], headings: md.headings, text: md.text, rss: [], canonical: String(d.url || ''), ldType: '', author: '' };
    p.wall = wallKind(p.title, p.text); return p;
  }
  const head = /^Title:\s*(.*)$/m.exec(t);
  if (head && /Markdown Content:|URL Source:/.test(t.slice(0, 2000))) {
    const warn = /^Warning:\s*Target URL returned error (\d{3})[:\s]*(.*)$/m.exec(t);
    const src = /^URL Source:\s*(\S+)/m.exec(t), pos = t.indexOf('Markdown Content:'), md = fromMarkdown(pos >= 0 ? t.slice(pos + 17) : t);
    const p = { title: squash(head[1]), ogTitle: '', site: '', description: '', ogType: '', lang: '', keywords: [], headings: md.headings, text: md.text, rss: [], canonical: src ? src[1] : '', ldType: '', author: '' };
    if (warn) p.targetError = { code: +warn[1], msg: warn[2] };
    p.wall = wallKind(p.title, p.text); return p;
  }
  if (/<(html|head|body|title|meta|div|p)\b/i.test(t.slice(0, 3000))) return parseHTML(t, url);
  const md = fromMarkdown(t);
  const p = { title: '', ogTitle: '', site: '', description: '', ogType: '', lang: '', keywords: [], headings: md.headings, text: md.text, rss: [], canonical: '', ldType: '', author: '' };
  p.wall = wallKind('', p.text); return p;
}

/** Instagram profile: pull name, bio and counts from the page's own description lines. Bios are often not shown to visitors who are logged out. */
export function parseInstagramPage(page, handle) {
  const out = { handle, name: '', bio: '', followers: '', following: '', posts: '', private: false, shown: false };
  const src = [page.description, page.ogTitle, page.title, page.text].filter(Boolean).join(' \n ');
  const counts = /([\d.,]+[KMkm]?)\s+Followers?,\s*([\d.,]+[KMkm]?)\s+Following,\s*([\d.,]+[KMkm]?)\s+Posts?/i.exec(src);
  if (counts) { out.followers = counts[1]; out.following = counts[2]; out.posts = counts[3]; }
  const nm = /(?:from|-)\s+([^()@\n]{2,60}?)\s*\(@([A-Za-z0-9._]+)\)/i.exec(src) || /^([^()\n]{2,60}?)\s*\(@([A-Za-z0-9._]+)\)/.exec(page.ogTitle || page.title || '');
  if (nm && (!handle || nm[2].toLowerCase() === String(handle).toLowerCase())) out.name = nm[1].trim().replace(/^See Instagram photos and videos from\s*/i, '');
  const bio = /on Instagram:\s*["“]([\s\S]{2,500}?)["”]\s*$/i.exec(String(page.description || '').trim());
  if (bio) { out.bio = bio[1].replace(/\s+/g, ' ').trim(); out.shown = true; }
  if (/this account is private/i.test(src)) out.private = true;
  return out;
}

/** Plain JSON from GitHub's API -> page-like object. */
export function parseGithub(j) {
  if (!j || typeof j !== 'object' || j.message) return null;
  const topics = Array.isArray(j.topics) ? j.topics : [];
  const desc = j.description || j.bio || '';
  return { title: j.full_name || j.name || j.login || '', ogTitle: '', site: 'GitHub', description: squash(desc), ogType: j.full_name ? 'repo' : 'profile', lang: '', keywords: cleanKeywords(topics.concat(j.language ? [j.language] : [])), headings: [], text: squash([desc, j.homepage, j.company, j.blog].filter(Boolean).join(' . ')), rss: [], canonical: j.html_url || '', ldType: '', author: j.owner ? j.owner.login : '', archived: !!j.archived, wall: '' };
}
/** Wikipedia REST summary -> page-like object. */
export function parseWikipedia(j) {
  if (!j || typeof j !== 'object' || !j.title || j.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') return null;
  return { title: squash(j.title), ogTitle: '', site: 'Wikipedia', description: squash(j.description || '').slice(0, 300), ogType: 'article', lang: j.lang || '', keywords: [], headings: [], text: squash(j.extract || '').slice(0, 3000), rss: [], canonical: '', ldType: '', author: '', wall: '' };
}
