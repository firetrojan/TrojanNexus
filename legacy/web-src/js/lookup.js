// lookup.js - "Look at it": guess what a link or account is about. Two layers that work together:
//   1. Offline guess (always): words in the name, @handle, link, your own notes.   -> analyse(r, null)
//   2. Online look (only when allowed and the internet is there): reads the real page or account, then runs the same analysis on it.
// Rules this file keeps: it only runs when you ask (or switch it on for new links), it never sends links that look private
// (shared files, passwords or keys in the link, the part after #), and everything it reads is treated as text, never as page code.
import { guessTopic, describeGuess, guessFields, TOPIC_BY_ID } from './topics.js';
import { parseHTML, parseReader, parseInstagramPage, parseGithub, parseWikipedia, tidyTitle, cleanKeywords } from './pageparse.js';
import { inferType } from './importers.js';
import { domainOf, todayISO, uniq } from './util.js';

export const READER_DEFAULT = 'https://r.jina.ai/';
export const SKIP_DEFAULT = ['filen.io'];
export const WEB_DEFAULTS = { web: true, webMode: 'auto', webReader: '', webSkip: SKIP_DEFAULT.slice() };
const TIMEOUT_MS = 14000;

// ---------- where am I running? ----------
export const isFramed = () => { try { return typeof window !== 'undefined' && window.self !== window.top; } catch (e) { return true; } };
export const isOnline = () => !(typeof navigator !== 'undefined' && navigator.onLine === false);

// ---------- what is never sent ----------
const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|.*\.lan|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|\[.*\])$/i;
const SHARE_HOSTS = /(^|\.)(docs\.google\.com|drive\.google\.com|dropbox\.com|1drv\.ms|onedrive\.live\.com|sharepoint\.com|mega\.nz|wetransfer\.com|we\.tl|notion\.site|airtable\.com|figma\.com|canva\.com|box\.com|icloud\.com|filen\.io|proton\.me|pcloud\.com|sendspace\.com|mediafire\.com)$/i;
const SECRET_PARAM = /(^|[_-])(key|token|secret|password|passwd|pwd|auth|sig|signature|session|access|apikey|api_key|otp|code)($|[_-])/i;
/** '' when the link is fine to look up, otherwise a short plain reason. */
export function skipReason(url, settings = {}) {
  let u; try { u = new URL(String(url).trim()); } catch (e) { return 'not a web link'; }
  if (!/^https?:$/.test(u.protocol)) return 'not a web link';
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || PRIVATE_HOST.test(host)) return 'a private or local address';
  if (u.username || u.password) return 'it has a password in the link';
  for (const k of u.searchParams.keys()) if (SECRET_PARAM.test(k)) return 'the link carries a key or token';
  if (/^[A-Za-z0-9_-]{24,}$/.test(u.hash.replace(/^#\/?/, '')) || /#.*[A-Za-z0-9_-]{32,}/.test(u.hash)) return 'the link has a long key after the #';
  const user = (settings.webSkip || []).map(x => String(x).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')).filter(Boolean);
  if (user.some(d => host === d || host.endsWith('.' + d))) return 'you put this site on the "never look up" list';
  if (SHARE_HOSTS.test(host)) return 'it is a file-sharing or private-document site (shared links can be private)';
  return '';
}
const TRACK = /^(utm_|fbclid$|gclid$|irclickid$|irgwc$|igshid$|mc_|ref$|from_src$)/i;
/** The address that is actually sent: no #part, no password, no tracking parameters. */
export function cleanForSend(url) {
  const u = new URL(String(url).trim()); u.hash = ''; u.username = ''; u.password = '';
  for (const k of [...u.searchParams.keys()]) if (TRACK.test(k)) u.searchParams.delete(k);
  return u.href;
}
export function readerUrl(target, settings = {}) {
  const base = String(settings.webReader || '').trim() || READER_DEFAULT;
  return base.includes('{url}') ? base.replace('{url}', encodeURIComponent(target)) : base + target;
}

// ---------- errors in plain words ----------
export function errorText(e, ctx = {}) {
  if (!e) return '';
  const c = e.code;
  if (c === 'skip') return 'Not looked up: ' + e.msg + '.';
  if (c === 'off') return 'Online lookup is switched off in Profile.';
  if (c === 'offline') return 'No internet right now. The offline guess is still shown.';
  if (c === 'blocked') return (ctx.framed || isFramed()) ? 'This copy runs inside another page, which blocks the internet. Open the downloaded file in your browser to use online lookup.' : 'Could not reach it. The site may be down, or your browser or network is blocking the request.';
  if (c === 'timeout') return 'It took too long to answer.';
  if (c === 'notfound') return 'The page was not found (the link may be dead).';
  if (c === 'denied') return 'The site refuses automatic reading.';
  if (c === 'slow') return 'The reader service asked us to slow down. Try again in a minute.';
  if (c === 'server') return 'The site or the reader service had an error. Try again later.';
  if (c === 'wall') return e.msg === 'login' ? 'The site wants a login, so the real page could not be read.' : (e.msg === 'bot' ? 'The site blocks automatic visitors.' : 'The page needs JavaScript to show anything, so nothing readable came back.');
  if (c === 'empty') return 'The page had no readable text.';
  if (c === 'badtype') return 'This link is a file (PDF, image, video), not a web page.';
  return e.msg || 'Lookup failed.';
}
const err = (code, msg, extra) => ({ ok: false, error: { code, msg: msg || '', ...extra } });
const fromStatus = (s, retry) => s === 404 || s === 410 ? err('notfound') : (s === 401 || s === 403 || s === 451 ? err('denied') : (s === 429 ? err('slow', '', { retryAfter: retry }) : (s >= 500 ? err('server') : err('server', 'HTTP ' + s))));

// ---------- fetching ----------
async function req(url, { headers, ms = TIMEOUT_MS, parent } = {}) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), ms) : null;
  if (parent && ctl) parent.addEventListener('abort', () => ctl.abort(), { once: true });
  try {
    const res = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit', redirect: 'follow', referrerPolicy: 'no-referrer', headers: headers || {}, signal: ctl ? ctl.signal : undefined });
    return { res };
  } catch (e) {
    if (parent && parent.aborted) return { error: err('cancelled') };
    if (e && (e.name === 'AbortError' || e.name === 'TimeoutError')) return { error: err('timeout') };
    return { error: err('blocked', String((e && e.message) || e)) };
  } finally { if (timer) clearTimeout(timer); }
}
async function bodyOf(res, cap = 700000) {
  const len = +(res.headers && res.headers.get && res.headers.get('content-length')) || 0;
  if (len > 6e6) return null;
  const t = await res.text();
  return t.length > cap ? t.slice(0, cap) : t;
}

const NEVER_DIRECT = /(^|\.)(instagram\.com|facebook\.com|x\.com|twitter\.com|linkedin\.com|youtube\.com|tiktok\.com|reddit\.com|pinterest\.com|medium\.com)$/i;
const session = { directFails: 0, directOk: 0 };
export const resetSession = () => { session.directFails = 0; session.directOk = 0; };

async function viaDirect(target, o) {
  const r = await req(target, { ...o, headers: { Accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5' } });
  if (r.error) { if (r.error.error && r.error.error.code === 'blocked') session.directFails++; return r.error; }
  const res = r.res;
  if (!res.ok) return fromStatus(res.status, res.headers.get('retry-after'));
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (/(pdf|image\/|video\/|audio\/|zip|octet-stream|msword|officedocument)/.test(ct)) return { ok: true, via: 'direct', page: { title: '', description: '', headings: [], keywords: [], text: '', rss: [], file: ct.split(';')[0] }, finalUrl: res.url || target };
  const body = await bodyOf(res); if (body === null) return err('badtype');
  session.directOk++;
  return { ok: true, via: 'direct', page: parseHTML(body, res.url || target), finalUrl: res.url || target };
}
async function viaReader(target, settings, o) {
  const r = await req(readerUrl(target, settings), { ...o, ms: TIMEOUT_MS + 8000, headers: { Accept: 'application/json' } });
  if (r.error) return r.error;
  const res = r.res;
  if (!res.ok) {
    let body = ''; try { body = await bodyOf(res, 4000); } catch (e) { /* ignore */ }
    const m = /returned error (\d{3})/i.exec(body || '');
    return fromStatus(m ? +m[1] : res.status, res.headers.get('retry-after'));
  }
  const body = await bodyOf(res); if (body === null) return err('badtype');
  const p = parseReader(body, target);
  if (p.error) return fromStatus(p.error.code, '');
  if (p.empty) return err('empty');
  if (p.targetError) return fromStatus(p.targetError.code, '');
  return { ok: true, via: 'reader', page: p, finalUrl: p.canonical || target };
}
const GH_RESERVED = new Set(['topics', 'orgs', 'sponsors', 'settings', 'features', 'marketplace', 'about', 'pricing', 'login', 'join', 'explore', 'notifications', 'collections', 'trending', 'events', 'search', 'apps', 'enterprise', 'security', 'issues', 'pulls', 'codespaces', 'new', 'organizations']);
async function viaApi(u, o) {
  const host = u.hostname.replace(/^www\./, ''), parts = u.pathname.split('/').filter(Boolean);
  let api = '', parse = null, label = '';
  if (host === 'github.com' && parts.length >= 1 && !GH_RESERVED.has(parts[0].toLowerCase())) { api = 'https://api.github.com/' + (parts.length >= 2 ? 'repos/' + parts[0] + '/' + parts[1] : 'users/' + parts[0]); parse = parseGithub; label = 'github'; }
  else if (/^[a-z-]{2,10}\.wikipedia\.org$/.test(host) && parts[0] === 'wiki' && parts[1]) { api = 'https://' + host + '/api/rest_v1/page/summary/' + parts[1]; parse = parseWikipedia; label = 'wikipedia'; }
  if (!api) return null;
  const r = await req(api, { ...o, headers: { Accept: 'application/json' } });
  if (r.error || !r.res.ok) return null;
  let j = null; try { j = JSON.parse(await bodyOf(r.res, 200000)); } catch (e) { return null; }
  const page = parse(j); return page ? { ok: true, via: label, page, finalUrl: u.href } : null;
}

/** Read one page. Tries the site's own API or the site itself, then a reader service, depending on the setting. */
export async function fetchPage(url, settings = {}, opts = {}) {
  const why = skipReason(url, settings); if (why) return err('skip', why);
  if (settings.web === false && !opts.force) return err('off');
  if (typeof fetch === 'undefined') return err('blocked', 'no fetch');
  if (!isOnline()) return err('offline');
  let target, u; try { target = cleanForSend(url); u = new URL(target); } catch (e) { return err('skip', 'not a web link'); }
  const mode = settings.webMode || 'auto', o = { parent: opts.signal };
  const api = await viaApi(u, o); if (api) return api;
  const direct = mode === 'direct' || (mode === 'auto' && !NEVER_DIRECT.test(u.hostname) && !(session.directFails >= 3 && session.directOk === 0));
  let first = null;
  if (direct) { first = await viaDirect(target, o); if (first.ok || mode === 'direct' || !['blocked', 'server', 'denied', 'timeout'].includes(first.error.code)) return screen(first); }
  const rd = await viaReader(target, settings, o);
  return screen(rd.ok || !first ? rd : (rd.error && rd.error.code === 'blocked' ? first : rd));
}
function screen(r) {
  if (r.ok && r.page && r.page.wall) return err('wall', r.page.wall);
  if (r.ok && r.page && !r.page.file && !r.page.title && !r.page.description && !r.page.text) return err('empty');
  return r;
}

// ---------- Instagram ----------
const IG_RESERVED = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'tv', 'direct', 'about', 'web', 'developer', 'legal', 'directory']);
export function igHandle(url) {
  const m = /^https?:\/\/(?:www\.)?instagram\.com\/(?:_u\/)?([A-Za-z0-9._]{1,30})\/?(?:[?#].*)?$/i.exec(String(url || '').trim());
  return m && !IG_RESERVED.has(m[1].toLowerCase()) ? m[1] : '';
}
async function fetchInstagram(handle, settings, opts) {
  if (settings.web === false && !opts.force) return err('off');
  if (typeof fetch === 'undefined') return err('blocked', 'no fetch');
  if (!isOnline()) return err('offline');
  if ((settings.webMode || 'auto') === 'direct') return err('blocked', 'Instagram cannot be read directly');
  const target = 'https://www.instagram.com/' + handle + '/';
  const r = await viaReader(target, settings, { parent: opts.signal });
  if (r.ok) return r;
  return r.error && ['slow', 'blocked', 'offline', 'timeout', 'server', 'cancelled'].includes(r.error.code) ? r : { ok: true, via: 'reader', page: { title: '', description: '', headings: [], keywords: [], text: '', rss: [], wall: r.error && r.error.code === 'wall' ? r.error.msg : 'login' }, partial: true };
}

// ---------- analysis ----------
const firstSentence = (s, n = 150) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); if (!t) return ''; const m = /^(.{20,}?[.!?])(\s|$)/.exec(t); const x = m ? m[1] : t; return x.length > n ? x.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : x; };
const NOTE_RX = /^(Looked up|Pasted) [^:]*: /;

/**
 * Work out what a resource is about. `fetched` is the result of fetchPage / fetchInstagram (or null for the offline guess).
 * `extra.bio` is text the user pasted (an Instagram bio, a few captions).
 */
export function analyse(r, fetched, extra = {}) {
  const ig = igHandle(r.url), page = fetched && fetched.ok ? fetched.page : null, at = todayISO();
  const info = ig && page ? parseInstagramPage(page, ig) : null;
  const pasted = (extra.bio || '').trim(), bio = pasted || (info && info.bio) || '';
  const own = [r.useWhen.join(' . '), r.capabilities.join(' . ')].filter(Boolean).join(' . ');
  let input;
  if (ig) input = { handle: ig, name: (info && info.name) || '', bio: bio || own, tags: r.tags };
  else if (page) input = { title: page.ogTitle || page.title || r.title, desc: page.description, keywords: page.keywords, headings: page.headings, text: page.text, url: r.url, tags: r.tags, bio: [pasted, own].filter(Boolean).join(' . ') };
  else input = { title: r.title, url: r.url, tags: r.tags, bio: [pasted, own].filter(Boolean).join(' . ') };
  const guess = guessTopic(input);
  const kind = ig ? 'account' : 'site', f = guessFields(guess, { kind });
  const readPage = !!(page && (page.title || page.description || page.text)), readBio = !!bio;
  const read = ig ? readBio : (readPage || !!pasted);
  let summary = describeGuess(guess, { read, handle: !!ig, kind });
  if (ig && page && !bio) summary = (info && info.private ? 'This account is private. ' : 'Instagram did not show a bio to a visitor who is not logged in, so the posts and bio could not be read. ') + (guess.conf === 'none' ? 'Not clear from the name either.' : 'The guess below comes from the name only.');
  const base = ig ? 'feed' : inferType(r.url, (page && (page.ogTitle || page.title)) || r.title);
  const type = !ig && page && /SoftwareApplication|WebApplication/i.test(page.ldType || '') ? 'web-tool' : base;
  const desc = (ig ? bio : ((page && page.description) || pasted)).trim();
  const site = page ? (page.site || domainOf(r.url)) : '';
  const title = ig ? ((info && info.name) ? info.name + ' (@' + ig + ')' : '') : (page ? tidyTitle(page.ogTitle || page.title, page.site) : '');
  const caps = desc ? [firstSentence(desc)] : f.capabilities;
  const when = f.useWhen.slice();
  return {
    ok: true, at, via: page ? fetched.via : 'offline', read, partial: !!(fetched && fetched.partial) || !!(ig && page && !bio), summary, conf: guess.conf, basis: guess.basis, words: guess.words,
    topic: guess.top ? guess.top.id : '', topic2: guess.second ? guess.second.id : '', label: guess.top ? guess.top.label : '', label2: guess.second ? guess.second.label : '',
    title, desc: desc.slice(0, 300), site, type, rss: page && page.rss ? page.rss : [], keywords: page && page.keywords ? page.keywords : [],
    tags: uniq(f.tags.concat(page && page.keywords ? page.keywords.slice(0, 4) : [])), useWhen: when, capabilities: caps,
    notes: read && desc ? (page && !(ig && !readBio) ? 'Looked up ' : 'Pasted ') + at + ': ' + desc.slice(0, 220) : '',
    ig: info ? { name: info.name, bio: info.bio, followers: info.followers, posts: info.posts, private: info.private } : null
  };
}

/** Read the real page or account, then analyse it. Always returns { ok, result } with the offline guess inside, or { ok:false, error, result } (result = the offline guess). */
export async function lookupResource(r, settings = {}, opts = {}) {
  const offline = analyse(r, null, opts.extra);
  const ig = igHandle(r.url);
  const f = ig ? await fetchInstagram(ig, settings, opts) : await fetchPage(r.url, settings, opts);
  if (!f.ok) return { ok: false, error: f.error, result: offline };
  return { ok: true, result: analyse(r, f, opts.extra) };
}

// ---------- applying a result to a resource ----------
const looksEmptyTitle = r => !r.title || /^https?:\/\//i.test(r.title) || r.title === domainOf(r.url) || r.title === 'Untitled' || r.title === r.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
/**
 * What to change on `r`. mode 'fill' only fills empty fields and adds tags; 'replace' also overwrites the three text fields.
 * Never touches what you wrote unless mode is 'replace'. Returns { patch, changes:[plain text] }.
 */
export function buildPatch(r, res, mode = 'fill') {
  const patch = {}, changes = [], rep = mode === 'replace';
  if (res.title && res.read && (rep || looksEmptyTitle(r)) && res.title !== r.title && !igHandle(r.url)) { patch.title = res.title; changes.push('title'); }
  if (res.type && res.type !== r.type && (rep || r.type === 'other' || (r.draft && ['title-only', 'guess', 'scanned'].includes(r.research) && res.type !== 'article-site' && r.type === 'article-site'))) { patch.type = res.type; changes.push('type'); }
  const tags = uniq(r.tags.concat(res.tags)).slice(0, 14); if (tags.length > r.tags.length) { patch.tags = tags; changes.push('tags'); }
  if (res.useWhen.length && (rep || !r.useWhen.length)) { patch.useWhen = res.useWhen; changes.push('use it when'); }
  if (res.capabilities.length && (rep || !r.capabilities.length)) { patch.capabilities = res.capabilities; changes.push('what it can do'); }
  if (res.notes) {
    const keep = r.notes.split('\n').filter(l => !NOTE_RX.test(l)).join('\n').trim();
    const next = (rep ? '' : keep ? keep + '\n' : '') + res.notes;
    if (next !== r.notes) { patch.notes = next; changes.push('notes'); }
  }
  if (res.rss.length && !r.rssUrl) { patch.rssUrl = res.rss[0]; changes.push('feed link'); }
  const better = res.via === 'offline' && r.scan && r.scan.via !== 'offline';   // an earlier look at the real page is kept
  if ((['title-only', 'guess', 'scanned'].includes(r.research) || !r.research) && !better) patch.research = res.read && res.via !== 'offline' ? 'scanned' : (res.topic ? 'guess' : r.research || 'title-only');
  if (!better) patch.scan = { at: res.at, via: res.via, topic: res.topic, topic2: res.topic2, conf: res.conf, basis: res.basis, desc: res.desc.slice(0, 280), site: res.site };
  return { patch, changes };
}

// ---------- many at once ----------
/**
 * Run lookups for many resources with a polite pace: 2 at a time, a pause between starts, and a stop if the service says "too many".
 * onItem(item, outcome) is called for each; onProgress({done,total,...}) after each. Returns a summary.
 */
export async function runBatch(items, { settings, signal, concurrency = 2, spacing = 1300, onItem, onProgress, lookup = lookupResource, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const total = items.length, s = { total, done: 0, ok: 0, partial: 0, failed: 0, skipped: 0, paused: '', reasons: {} };
  let next = 0, last = 0, slowStreak = 0, stop = false;
  const worker = async () => {
    while (!stop && !(signal && signal.aborted)) {
      const i = next++; if (i >= total) return;
      const wait = last + spacing - Date.now(); last = Math.max(Date.now(), last + spacing);
      if (wait > 0) await sleep(wait);
      if (signal && signal.aborted) return;
      const item = items[i];
      let out = await lookup(item, settings, { signal });
      if (!out.ok && out.error && out.error.code === 'slow') {
        slowStreak++;
        if (slowStreak >= 3) { s.paused = 'slow'; stop = true; if (onItem) onItem(item, out); break; }
        await sleep(Math.min(60000, (+out.error.retryAfter || 15) * 1000));
        out = await lookup(item, settings, { signal });
      } else if (out.ok) slowStreak = 0;
      if (out.error && out.error.code === 'cancelled') return;
      s.done++;
      if (out.ok) { s.ok++; if (out.result.partial) s.partial++; }
      else if (out.error && out.error.code === 'skip') s.skipped++;
      else { s.failed++; const k = out.error ? out.error.code : 'error'; s.reasons[k] = (s.reasons[k] || 0) + 1; if (['offline', 'off'].includes(k)) { s.paused = k; stop = true; } }
      if (onItem) onItem(item, out);
      if (onProgress) onProgress({ ...s });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  if (signal && signal.aborted && !s.paused) s.paused = 'cancelled';
  return s;
}

export { TOPIC_BY_ID, guessTopic, describeGuess, cleanKeywords };
