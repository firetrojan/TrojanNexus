// importers.js - turn pasted text or files into resource entries. Nothing here touches the network: it only reads text you give it.
// Formats: browser bookmarks (HTML file, Firefox JSON, Chrome "Bookmarks" file), Instagram "Download your information" (following list as
// JSON or HTML), CSV lists (Pocket, Raindrop, Pinboard, any sheet with a link column), OPML feed lists, link files, plain links, JSON lists.
import { domainOf, isHttpUrl, uniq } from './util.js';
import { tokenize, stem } from './search.js';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decode = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch (x) { return m; } }
  return ENT[e.toLowerCase()] !== undefined ? ENT[e.toLowerCase()] : m;
});
const clean = s => decode(String(s).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
const attr = (s, name) => { const m = new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(s); return m ? decode(m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3])) : ''; };
const MAX_ENTRIES = 6000;
const stripBom = s => String(s || '').replace(/^\uFEFF/, '');

/** Dates in many shapes -> yyyy-mm-dd or ''. Seconds, milliseconds, Chrome's 1601 microseconds, or a date string. */
export function toISODate(v) {
  if (v === undefined || v === null || v === '') return '';
  let d;
  if (typeof v === 'number' || /^\d{9,19}$/.test(String(v).trim())) {
    let n = Number(v);
    if (n > 1e16) n = n / 1e6 - 11644473600;          // Chrome / WebKit: microseconds since 1601
    else if (n > 1e14) n = n / 1e6;                    // Firefox: microseconds since 1970
    else if (n > 1e11) n = n / 1e3;                    // milliseconds
    d = new Date(n * 1000);
  } else d = new Date(String(v));
  if (isNaN(d) || d.getFullYear() < 1995 || d.getFullYear() > 2100) return '';
  return d.toISOString().slice(0, 10);
}
const toTagList = v => {
  if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
  const s = String(v || '').trim(); if (!s) return [];
  return (s.includes(',') || s.includes(';') ? s.split(/[,;]/) : s.split(/\s+/)).map(x => x.trim()).filter(Boolean);
};
const ROOT_FOLDER = /^(bookmarks?( bar| menu| toolbar)?|other bookmarks|mobile bookmarks|favou?rites( bar)?|menu|toolbar|unfiled|mobile|unsorted|root|bookmarks bar)$/i;

// ---------- what is this text? ----------
const IG_LIST_NAMES = { followers: 'followers', following: 'following', blocked: 'blocked profiles', close: 'close friends', unfollowed: 'recently unfollowed profiles', requests: 'follow requests', restricted: 'restricted profiles', hidden: 'hidden-story list' };
function igKindFromKey(k) {
  if (/following/.test(k)) return 'following';
  if (/followers?/.test(k)) return 'followers';
  if (/block/.test(k)) return 'blocked';
  if (/close_friends/.test(k)) return 'close';
  if (/unfollow/.test(k)) return 'unfollowed';
  if (/request/.test(k)) return 'requests';
  if (/restrict/.test(k)) return 'restricted';
  if (/hide/.test(k)) return 'hidden';
  return 'other';
}
function igKindFromName(name) {
  const n = String(name || '').toLowerCase();
  if (/following/.test(n)) return 'following';
  if (/followers?/.test(n)) return 'followers';
  if (/blocked/.test(n)) return 'blocked';
  if (/close_friends/.test(n)) return 'close';
  if (/unfollow/.test(n)) return 'unfollowed';
  if (/request/.test(n)) return 'requests';
  return '';
}
function igKindFromHeading(t) {
  const m = /<h1[^>]*>([^<]*)<\/h1>/i.exec(t); const h = m ? decode(m[1]).trim().toLowerCase() : '';
  if (!h) return '';
  if (/^following$/.test(h)) return 'following';
  if (/follower/.test(h)) return 'followers';
  if (/block/.test(h)) return 'blocked';
  if (/close friends/.test(h)) return 'close';
  if (/unfollow/.test(h)) return 'unfollowed';
  if (/request/.test(h)) return 'requests';
  if (/restrict/.test(h)) return 'restricted';
  if (/hide|hidden/.test(h)) return 'hidden';
  return 'other';
}

/**
 * Work out what a piece of text is. Returns { kind, igKind, data } where kind is one of
 * empty | backup | json-broken | json-other | instagram | bookmarks | bookmarks-json | opml | csv | shortcut | links-html | json-list | urls
 */
export function sniff(text, name = '') {
  const t = stripBom(text).trim(), fn = String(name || '').toLowerCase();
  if (!t) return { kind: 'empty' };
  if (/^\[InternetShortcut\]/i.test(t)) return { kind: 'shortcut' };
  if (/^[\[{]/.test(t)) {
    let j; try { j = JSON.parse(t); } catch (e) { return { kind: 'json-broken' }; }
    if (Array.isArray(j)) {
      if (j.length && j[0] && typeof j[0] === 'object' && Array.isArray(j[0].string_list_data)) return { kind: 'instagram', igKind: igKindFromName(fn) || 'followers', data: j };
      return { kind: 'json-list', data: j };
    }
    if (j && Array.isArray(j.resources)) return { kind: 'backup', data: j };
    if (j && typeof j === 'object') {
      const key = Object.keys(j).find(k => /^relationships_/.test(k));
      if (key && Array.isArray(j[key])) return { kind: 'instagram', igKind: igKindFromKey(key), data: j[key] };
      if (j.roots && (j.roots.bookmark_bar || j.roots.other)) return { kind: 'bookmarks-json', data: j, flavor: 'chrome' };
      if (j.children && (j.root || j.typeCode || /moz-place/.test(j.type || ''))) return { kind: 'bookmarks-json', data: j, flavor: 'firefox' };
      if (Array.isArray(j.bookmarks)) return { kind: 'json-list', data: j.bookmarks };
      if (Array.isArray(j.items)) return { kind: 'json-list', data: j.items };
    }
    return { kind: 'json-other', data: j };
  }
  if (/<opml[\s>]/i.test(t.slice(0, 2000))) return { kind: 'opml' };
  if (/\[InternetShortcut\]/i.test(t.slice(0, 300)) || (/<plist/i.test(t.slice(0, 600)) && /<key>URL<\/key>/i.test(t))) return { kind: 'shortcut' };
  const looksHtml = /^<(!doctype|html|head|body|meta|title|h1|dl|ul|div)/i.test(t) || /<a\s[^>]*href/i.test(t.slice(0, 4000));
  if (looksHtml) {
    if (/NETSCAPE-Bookmark-file/i.test(t.slice(0, 600)) || /<DT>\s*<A\s/i.test(t)) return { kind: 'bookmarks' };
    const igHead = igKindFromHeading(t), igLinks = (t.match(/instagram\.com\/(?:_u\/)?[A-Za-z0-9._]+/g) || []).length;
    if ((igHead || /_a6-[a-z]|instagram/i.test(t.slice(0, 20000))) && /<h2/i.test(t) && igLinks >= 1) return { kind: 'instagram', igKind: igHead || igKindFromName(fn) || 'following' };
    if ((t.match(/<a\s[^>]*href=["']?https?:/gi) || []).length >= 1) return { kind: 'links-html' };
    return { kind: 'unknown' };
  }
  const first = t.split(/\r?\n/, 1)[0];
  if (/\.csv$|\.tsv$/.test(fn) || (/[,;\t]/.test(first) && /(^|[,;\t"])\s*(url|link|href|uri|address|website)\s*($|[,;\t"])/i.test(first))) return { kind: 'csv' };
  return { kind: 'urls' };
}

/** Old name kept for callers and tests. */
export function detectFormat(text) {
  const s = sniff(text);
  if (s.kind === 'json-list') return 'json-array';
  if (s.kind === 'instagram') return s.igKind === 'following' || !s.igKind ? 'instagram-' + (/^\s*[\[{]/.test(text) ? 'json' : 'html') : 'instagram-other';
  if (s.kind === 'urls') return 'url-list';
  return s.kind;
}

// ---------- browser bookmarks ----------
/** Browser bookmarks export (Netscape format: Chrome, Edge, Firefox, Safari, Brave, Opera, Pinboard, Raindrop). Keeps the folder path in `folder`. */
export function parseBookmarksHTML(text) {
  const re = /<DL[^>]*>|<\/DL>|<H3([^>]*)>([\s\S]*?)<\/H3>|<A\s+([^>]*)>([\s\S]*?)<\/A>|<DD>([\s\S]*?)(?=<DT|<\/DL|<DD|$)/gi;
  const stack = []; let pending = null, m, last = null; const out = [];
  while ((m = re.exec(text))) {
    const tok = m[0].toUpperCase();
    if (tok.startsWith('<DL')) { stack.push(pending == null ? '' : pending); pending = null; }
    else if (tok.startsWith('</DL')) stack.pop();
    else if (tok.startsWith('<H3')) pending = clean(m[2]);
    else if (tok.startsWith('<DD')) { if (last) last.notes = clean(m[5]).slice(0, 400); }
    else {
      const url = attr(m[3], 'href');
      if (!isHttpUrl(url)) { last = null; continue; }
      const path = stack.filter(Boolean).filter((p, i) => !(i === 0 && ROOT_FOLDER.test(p)));
      const e = { title: clean(m[4]), url, folder: path.join(' / '), added: toISODate(attr(m[3], 'add_date')) };
      const tags = attr(m[3], 'tags'); if (tags) e.tags = toTagList(tags);
      out.push(e); last = e;
      if (out.length >= MAX_ENTRIES) break;
    }
  }
  return out;
}

/** Firefox (Backup / "Export bookmarks to JSON") and Chrome (the "Bookmarks" file) bookmark trees. */
export function parseBookmarksJSON(data) {
  const out = [];
  const walk = (node, path, depth) => {
    if (!node || typeof node !== 'object' || out.length >= MAX_ENTRIES) return;
    const url = node.uri || node.url || '';
    if (url && /^https?:\/\//i.test(url) && (node.type === 'url' || node.typeCode === 1 || /moz-place$/.test(node.type || '') || node.uri)) {
      const e = { title: String(node.title || node.name || '').trim(), url, folder: path.join(' / '), added: toISODate(node.dateAdded || node.date_added) };
      if (node.tags) e.tags = toTagList(node.tags);
      out.push(e); return;
    }
    const kids = node.children || (node.roots ? Object.values(node.roots) : null);
    if (!Array.isArray(kids)) return;
    const name = String(node.title || node.name || '').trim();
    const next = depth > 0 && name && !(depth <= 2 && ROOT_FOLDER.test(name)) ? path.concat(name) : path;
    kids.forEach(k => walk(k, next, depth + 1));
  };
  if (data.roots) Object.values(data.roots).forEach(r => walk(r, [], 1)); else walk(data, [], 0);
  return out;
}

// ---------- OPML feed lists ----------
export function parseOPML(text) {
  const re = /<outline\b([^>]*?)(\/?)>|<\/outline>/gi; const out = [], stack = []; let m;
  while ((m = re.exec(text))) {
    if (m[0].toLowerCase() === '</outline>') { stack.pop(); continue; }
    const a = m[1], xml = attr(a, 'xmlUrl'), html = attr(a, 'htmlUrl'), url = attr(a, 'url'), name = decode(attr(a, 'text') || attr(a, 'title')).trim();
    const link = html || url || xml;
    if (link && isHttpUrl(link)) {
      const e = { title: name, url: link, type: 'feed', folder: stack.filter(Boolean).join(' / ') };
      if (xml && isHttpUrl(xml)) e.rssUrl = xml;
      out.push(e);
    }
    if (m[2] !== '/') stack.push(link ? '' : name);
    if (out.length >= MAX_ENTRIES) break;
  }
  return out;
}

// ---------- CSV ----------
/** Small CSV reader: quotes, doubled quotes, line breaks inside quotes, comma / semicolon / tab. */
export function parseCSVRows(text) {
  const t = stripBom(text), first = t.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"' && !cell) q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(x => x.trim())) rows.push(row); row = []; if (rows.length > MAX_ENTRIES + 1) break; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); if (row.some(x => x.trim())) rows.push(row); }
  return rows;
}
const COL = {
  url: /^(url|link|href|uri|address|web ?address|website|page url|resolved_url)$/i,
  title: /^(title|name|page|page title|resolved_title)$/i,
  folder: /^(folder|collection|category|group|list|path|board)$/i,
  tags: /^(tags?|labels?|keywords?)$/i,
  notes: /^(notes?|excerpt|comments?|summary|extended|description)$/i,
  date: /^(created|created at|created_at|date|date added|added|added at|time_added|timestamp|saved|saved at|time)$/i
};
export function parseCSV(text) {
  const rows = parseCSVRows(text); if (rows.length < 2) return [];
  const head = rows[0].map(x => x.trim()), idx = {};
  head.forEach((hname, i) => { for (const k in COL) if (idx[k] === undefined && COL[k].test(hname)) idx[k] = i; });
  let body = rows.slice(1);
  if (idx.url === undefined) {   // no header name says "link": find the column that is mostly links
    const n = Math.min(body.length, 20); let best = -1, bs = 0;
    for (let c = 0; c < head.length; c++) { let s = 0; for (let r = 0; r < n; r++) if (isHttpUrl((body[r][c] || '').trim())) s++; if (s > bs) { bs = s; best = c; } }
    if (best < 0 || bs < Math.max(1, n / 2)) return [];
    idx.url = best;
    if (idx.title === undefined) { const o = head.findIndex((_, i) => i !== best); if (o >= 0 && !isHttpUrl((body[0][o] || '').trim())) idx.title = o; }
  }
  if (idx.title === undefined && idx.notes !== undefined && /^description$/i.test(head[idx.notes])) { idx.title = idx.notes; delete idx.notes; }   // Pinboard style: description is the title
  const out = [];
  for (const r of body) {
    const url = (r[idx.url] || '').trim(); if (!isHttpUrl(url)) continue;
    const e = { title: idx.title !== undefined ? (r[idx.title] || '').trim() : '', url, folder: idx.folder !== undefined ? (r[idx.folder] || '').trim() : '', added: idx.date !== undefined ? toISODate((r[idx.date] || '').trim()) : '' };
    if (idx.tags !== undefined && (r[idx.tags] || '').trim()) e.tags = toTagList(r[idx.tags]);
    if (idx.notes !== undefined && (r[idx.notes] || '').trim()) e.notes = r[idx.notes].trim().slice(0, 400);
    out.push(e); if (out.length >= MAX_ENTRIES) break;
  }
  return out;
}

// ---------- link files ----------
export function parseShortcut(text, name = '') {
  const m = /^\s*URL\s*=\s*(\S+)/im.exec(text) || /<key>URL<\/key>\s*<string>([^<]+)<\/string>/i.exec(text);
  if (!m || !isHttpUrl(decode(m[1]))) return [];
  return [{ title: String(name).replace(/\.(url|webloc)$/i, '').trim(), url: decode(m[1]) }];
}
/** An HTML page that is just a list of links (Pocket export, a saved page). */
export function parseLinksHTML(text) {
  const out = [], re = /<a\s+([^>]*)>([\s\S]*?)<\/a>/gi; let m;
  while ((m = re.exec(text))) {
    const url = attr(m[1], 'href'); if (!isHttpUrl(url)) continue;
    const e = { title: clean(m[2]), url, added: toISODate(attr(m[1], 'time_added') || attr(m[1], 'add_date')) };
    const tags = attr(m[1], 'tags'); if (tags) e.tags = toTagList(tags);
    out.push(e); if (out.length >= MAX_ENTRIES) break;
  }
  return out;
}

/** One link per line. Accepts "Title | url", "url Title", "[Title](url)" or just a url / domain. */
export function parseUrlList(text) {
  const out = [];
  for (let line of String(text).split(/\r?\n/)) {
    line = line.trim();
    if (!line || /^(#|\/\/)/.test(line)) continue;
    let url = '', title = '';
    const md = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/.exec(line);
    if (md) { title = md[1]; url = md[2]; }
    else {
      const m = /(https?:\/\/[^\s<>"'|]+)/i.exec(line);
      if (m) { url = m[1]; title = line.slice(0, m.index) + ' ' + line.slice(m.index + m[0].length); }
      else {
        const a = /^((?:[a-z0-9-]+\.)+[a-z]{2,24}(?:\/\S*)?)(?:\s+(.*))?$/i.exec(line);
        const b = /^(.*?)\s*[|,:–—-]\s*((?:[a-z0-9-]+\.)+[a-z]{2,24}(?:\/\S*)?)$/i.exec(line);
        if (a) { url = 'https://' + a[1]; title = a[2] || ''; }
        else if (b) { url = 'https://' + b[2]; title = b[1]; }
        else continue;
      }
    }
    url = url.replace(/[),.;]+$/, '');
    title = title.replace(/^[\s|,;:–—-]+|[\s|,;:–—-]+$/g, '').replace(/[<>"]/g, '').trim();
    if (isHttpUrl(url)) out.push({ title, url });
    if (out.length >= MAX_ENTRIES) break;
  }
  return out;
}

/** JSON array of strings (urls) or objects ({title|name|description, url|href|link, tags, notes|extended, ...}). */
export function parseJSONArray(input) {
  const data = typeof input === 'string' ? JSON.parse(input) : input;
  if (!Array.isArray(data)) throw new Error('JSON must be an array');
  return data.map(x => {
    if (typeof x === 'string') return isHttpUrl(x.trim()) ? { title: '', url: x.trim() } : null;
    if (x && typeof x === 'object') {
      const url = x.url || x.href || x.link || x.uri || '';
      const e = { ...x, title: x.title || x.name || (typeof x.description === 'string' && x.description.length < 160 && !/^https?:/.test(x.description) ? x.description : ''), url };
      if (typeof x.tags === 'string') e.tags = toTagList(x.tags);
      if (!e.notes && (x.extended || x.note)) e.notes = String(x.extended || x.note).slice(0, 400);
      if (!e.added && (x.time || x.created || x.date)) e.added = toISODate(x.time || x.created || x.date);
      return url ? e : null;
    }
    return null;
  }).filter(Boolean).slice(0, MAX_ENTRIES);
}

// ---------- Instagram "Download your information" ----------
const IG_OK = /^[A-Za-z0-9._]{1,30}$/;
const igEntry = (handle, date) => ({
  title: '@' + handle, url: 'https://www.instagram.com/' + handle + '/', type: 'feed', tags: ['instagram', 'following'],
  src: 'following', research: 'user', added: date || ''
});
const igHandleFromHref = href => { const m = /instagram\.com\/(?:_u\/)?([A-Za-z0-9._]+)/i.exec(String(href || '')); return m ? m[1] : ''; };
/** Instagram data export: following.json (old and new layout) or following.html. Gives { entries, skipped:{deleted, bad} }. */
export function parseInstagramList(input, opts = {}) {
  const out = [], seen = new Set(), skipped = { deleted: 0, bad: 0 };
  const push = (h, date) => {
    if (!h) { skipped.bad++; return; }
    if (/^__deleted__/i.test(h)) { skipped.deleted++; return; }
    if (!IG_OK.test(h)) { skipped.bad++; return; }
    if (seen.has(h.toLowerCase())) return;
    seen.add(h.toLowerCase()); out.push(igEntry(h, date));
  };
  let t = typeof input === 'string' ? stripBom(input).trim() : input;
  if (typeof t === 'string' && (t[0] === '{' || t[0] === '[')) { t = JSON.parse(t); }
  if (typeof t !== 'string') {
    let list = Array.isArray(t) ? t : [];
    if (!Array.isArray(t) && t) { const k = Object.keys(t).find(x => /^relationships_/.test(x)); list = k ? t[k] : []; }
    for (const it of list) {
      const d = it && Array.isArray(it.string_list_data) ? it.string_list_data[0] : null; if (!d) { skipped.bad++; continue; }
      const h = (d.value || it.title || igHandleFromHref(d.href) || '').trim();
      push(h, d.timestamp ? toISODate(d.timestamp) : '');
    }
    return { entries: out, skipped };
  }
  const re = /<h2[^>]*>([^<]*)<\/h2>([\s\S]*?)(?=<h2|$)/gi; let m, any = false;
  while ((m = re.exec(t))) {
    any = true;
    const h = decode(m[1]).trim() || igHandleFromHref((/href="([^"]+)"/.exec(m[2]) || [])[1]);
    const dm = /([A-Z][a-z]{2} \d{1,2}, \d{4})/.exec(m[2]);
    let date = ''; if (dm) { const x = new Date(dm[1] + ' 12:00'); if (!isNaN(x)) date = x.toISOString().slice(0, 10); }
    push(h, date);
  }
  if (!any) { const re2 = /href="https?:\/\/(?:www\.)?instagram\.com\/(?:_u\/)?([A-Za-z0-9._]+)\/?"/gi; while ((m = re2.exec(t))) push(m[1], ''); }
  return { entries: out, skipped };
}
/** Old name: returns just the entries. */
export function parseInstagramFollowing(text) { return parseInstagramList(text).entries; }

// ---------- guessing type and tags from a link and its title ----------
const TOOLW = /\b(tool|tools|convert|converter|generator|editor|maker|downloader|checker|finder|calculator|optimizer|translator|compressor|extractor|viewer|builder|planner|tracker|app|apps|map|maps|cyberchef|toolkit)\b/;
const CATW = /\b(awesome|catalog|catalogue|directory|index|collection|database|archive|library|list of|roadmaps?)\b/;
const GENERIC = new Set(['home', 'homepage', 'official', 'welcome', 'free', 'online', 'website', 'page', 'google', 'site', 'with', 'from', 'your', 'that', 'this', 'what', 'best', 'more']);
const TLD_TAG = { edu: 'education', gov: 'government', ac: 'academic', ai: 'ai', in: 'india', uk: 'uk' };

export function inferType(url, title = '') {
  const host = domainOf(url), t = String(title).toLowerCase();
  let path = ''; try { path = new URL(url).pathname.toLowerCase(); } catch (e) { /* ignore */ }
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return 'youtube-channel';
  if (/(^|[\/._-])(rss|feed|atom)([\/._-]|$)|\.xml$/.test(host + path)) return 'feed';
  if (/^docs\.|(^|\.)readthedocs\.io$|^\/docs?(\/|$)/.test(host + '|') || /^\/docs?(\/|$)/.test(path) || /\bdocumentation\b/.test(t)) return 'docs';
  if (CATW.test(t)) return 'catalogue';
  if (TOOLW.test(t)) return 'web-tool';
  return 'article-site';
}

export function inferTags(url, title = '') {
  const tags = [], host = domainOf(url), parts = host.split('.');
  const core = parts.length > 1 ? parts[parts.length - 2] : parts[0];
  if (core && core.length > 2 && !['com', 'org', 'net', 'co', 'gov', 'edu'].includes(core)) tags.push(core);
  const tld = parts[parts.length - 1];
  if (TLD_TAG[tld]) tags.push(TLD_TAG[tld]);
  for (const w of tokenize(title)) if (w.length >= 4 && !GENERIC.has(w) && !/^\d+$/.test(w) && !/^https?/.test(w)) tags.push(w);
  return uniq(tags.map(x => x.toLowerCase())).slice(0, 6);
}

/** Entry -> resource fields. Imported items are drafts so the user can review them. */
export function entryToResource(e) {
  const url = e.url || '', title = e.title || '';
  return {
    ...e, title, url,
    type: e.type || inferType(url, title),
    tags: (e.tags && e.tags.length) ? e.tags : inferTags(url, title),
    draft: e.draft === undefined ? true : e.draft,
    src: e.src || 'import', research: e.research || 'title-only'
  };
}

export const KIND_LABEL = {
  bookmarks: 'Browser bookmarks file', 'bookmarks-json': 'Browser bookmarks file (JSON)', instagram: 'Instagram following list', csv: 'CSV list of links', opml: 'Feed list (OPML)',
  shortcut: 'Link file', 'links-html': 'Web page with links', 'json-list': 'JSON list of links', urls: 'Text with links', backup: 'Nexus backup'
};

/**
 * Read one file or one pasted text. Returns { name, kind, label, entries, note, skip, backup, igKind, skipped }.
 * `skip` = true when the file is understood but should not be imported (for example an Instagram followers list).
 */
export function readSource(name, text) {
  const sn = sniff(text, name), r = { name: name || 'Pasted text', kind: sn.kind, label: KIND_LABEL[sn.kind] || '', entries: [], note: '', skip: false };
  try {
    switch (sn.kind) {
      case 'bookmarks': r.entries = parseBookmarksHTML(stripBom(text)); break;
      case 'bookmarks-json': r.entries = parseBookmarksJSON(sn.data); break;
      case 'instagram': {
        r.igKind = sn.igKind || 'following';
        if (r.igKind !== 'following') { r.skip = true; r.label = 'Instagram ' + (IG_LIST_NAMES[r.igKind] || 'list'); r.note = 'This is not your following list, so it was left out. Look for following.json or following.html.'; break; }
        const x = parseInstagramList(sn.data || stripBom(text)); r.entries = x.entries; r.skipped = x.skipped;
        if (x.skipped.deleted) r.note = plural1(x.skipped.deleted, 'deleted account') + ' skipped.';
        break;
      }
      case 'csv': r.entries = parseCSV(text); if (!r.entries.length) r.note = 'No link column found. The file needs a column called url or link.'; break;
      case 'opml': r.entries = parseOPML(text); break;
      case 'shortcut': r.entries = parseShortcut(text, name); break;
      case 'links-html': r.entries = parseLinksHTML(text); break;
      case 'json-list': r.entries = parseJSONArray(sn.data); if (!r.entries.length) r.note = 'The list has no links in it.'; break;
      case 'urls': r.entries = parseUrlList(stripBom(text)); if (!r.entries.length) r.note = 'No links found in this text.'; break;
      case 'backup': r.skip = true; r.backup = true; r.note = 'This is a full Nexus backup. It is restored with "Import a backup", not as links.'; break;
      case 'json-broken': r.skip = true; r.note = 'This JSON is damaged or cut off.'; break;
      case 'json-other': r.skip = true; r.label = 'JSON file'; r.note = 'Not a list of links, so nothing was imported.'; break;
      case 'empty': r.skip = true; r.note = 'The file is empty.'; break;
      default: r.skip = true; r.note = 'Could not recognise this file.';
    }
  } catch (e) { r.skip = true; r.note = 'Could not read it: ' + String((e && e.message) || e).slice(0, 80); r.entries = []; }
  r.entries = r.entries.map(entryToResource);
  if (!r.skip && !r.entries.length) { r.skip = true; if (!r.note) r.note = 'No links found.'; }
  return r;
}
const plural1 = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

/** Detect + parse anything pasted. Returns {format, entries, note}. Same shape as before. */
export function parseAny(text) {
  const r = readSource('', text), f = detectFormat(text);
  return { format: f, entries: r.entries, note: r.backup ? 'This is a full backup. Use "Import backup".' : (r.kind === 'empty' ? '' : (r.note || '')), kind: r.kind, label: r.label, skip: r.skip };
}
export { stem };
