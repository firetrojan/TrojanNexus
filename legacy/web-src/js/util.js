// util.js - small helpers shared by every module. No dependencies.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Escape text before putting it inside HTML strings. */
export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Tiny DOM builder: h('div.card#id', {class:'x', onclick:fn, dataset:{a:1}}, 'text', [child, child])
 * Strings are always inserted as text nodes (safe). Use {html:'...'} only with pre-escaped markup.
 */
export function h(tag, attrs, ...kids) {
  const name = (tag.match(/^[a-z][a-z0-9-]*/i) || ['div'])[0];
  const el = document.createElement(name);
  for (const m of tag.matchAll(/([.#])([\w-]+)/g)) {
    if (m[1] === '.') el.classList.add(m[2]); else el.id = m[2];
  }
  if (attrs != null && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs); attrs = null;
  }
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') String(v).split(' ').forEach(c => c && el.classList.add(c));
      else if (k === 'style' && typeof v === 'object') { for (const s in v) { if (v[s] == null) continue; if (s.startsWith('--')) el.style.setProperty(s, String(v[s])); else el.style[s] = v[s]; } }
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  const add = c => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

// ---------- ids, hashing, random ----------
export const uid = (p = 'r') => p + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);

export function hash32(s) {
  let x = 2166136261;
  s = String(s);
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}

/** Small deterministic random generator (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- math ----------
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/** Frame-rate independent smoothing: move a toward b. lambda ~ 4 (slow) .. 20 (snappy). */
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

// ---------- dates (all ISO yyyy-mm-dd, local time) ----------
const pad = n => String(n).padStart(2, '0');
export const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
export const todayISO = () => iso(new Date());
export function parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
export function addDays(s, n) {
  const d = parseISO(s) || new Date();
  d.setDate(d.getDate() + n);
  return iso(d);
}
export function daysBetween(a, b) {
  const x = parseISO(a), y = parseISO(b);
  if (!x || !y) return 0;
  return Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / 864e5);
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtDate(s) {
  const d = parseISO(s);
  return d ? d.getDate() + ' ' + MON[d.getMonth()] : '';
}
/** "today", "tomorrow", "in 3 days", "2 days ago" */
export function relDays(n) {
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? 'in ' + n + ' days' : Math.abs(n) + ' days ago';
}
export const plural = (n, w, many) => n + ' ' + (n === 1 ? w : (many || w + 's'));

// ---------- urls ----------
export function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
}
const TRACK = /^(utm_|fbclid$|gclid$|irclickid$|irgwc$|afsrc$|subid1$|from_src$|ref$|igshid$|mc_)/i;
/** Normalised key for spotting duplicate links (ignores www, trailing slash, tracking params, #fragment). */
export function normUrl(u) {
  try {
    const x = new URL(String(u).trim());
    const host = x.hostname.toLowerCase().replace(/^www\./, '');
    const path = x.pathname.replace(/\/+$/, '');
    const q = [...x.searchParams.entries()].filter(([k]) => !TRACK.test(k)).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => k + '=' + v).join('&');
    return host + path + (q ? '?' + q : '');
  } catch (e) { return String(u || '').trim().toLowerCase(); }
}
/** "example.com/some/page" - an address without https://, www. and the trailing slash, cut to n characters. */
export function shortUrl(u, n = 46) {
  const s = String(u || '').trim().replace(/^https?:\/\/(www\.)?/i, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
export const isHttpUrl = u => /^https?:\/\/\S+$/i.test(String(u || '').trim());

// ---------- misc ----------
export function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  return d;
}
export function emitter() {
  const m = {};
  return {
    on(e, f) { (m[e] = m[e] || []).push(f); return () => { m[e] = m[e].filter(x => x !== f); }; },
    emit(e, d) { (m[e] || []).slice().forEach(f => { try { f(d); } catch (err) { console.error(err); } }); }
  };
}
export const uniq = a => Array.from(new Set(a));

// replaceChildren/append/prepend turn null into the text "null". Skip empty values and flatten arrays instead.
if (typeof Element !== 'undefined') {
  for (const fn of ['replaceChildren', 'append', 'prepend']) {
    const orig = Element.prototype[fn];
    if (orig) Element.prototype[fn] = function (...n) { return orig.apply(this, n.flat(Infinity).filter(x => x != null && x !== false)); };
  }
}
