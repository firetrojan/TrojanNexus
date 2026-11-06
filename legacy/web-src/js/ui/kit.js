// ui/kit.js - shared UI pieces in the iOS style: tab screens with large titles, page sheets, bottom sheets with a grabber,
// alerts and action sheets, banners, a sliding segmented control, and small builders. Handles the Android back button too.
import { h, $, clamp, domainOf, todayISO, daysBetween, fmtDate } from '../util.js';
import { icon } from '../icons.js';
import * as sfx from '../sfx.js';
import * as store from '../store.js';

export const TYPE_LABEL = { 'web-tool': 'Tool', 'article-site': 'Articles', 'youtube-channel': 'YouTube', 'ai-source': 'AI', social: 'Social', community: 'Community', feed: 'Feed', catalogue: 'Catalogue', docs: 'Docs', other: 'Other' };
export const TYPE_ICON = { 'web-tool': 'wrench', 'article-site': 'news', 'youtube-channel': 'play', 'ai-source': 'chip', social: 'nebula', community: 'people', feed: 'rss', catalogue: 'library', docs: 'book', other: 'hex' };
export const STATUS_LABEL = { candidate: 'To try', testing: 'Trial', active: 'Active', archived: 'Archived' };
export const CAD_LABEL = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', none: 'No schedule' };
export const RESEARCH_LABEL = { verified: 'Opened and checked', known: 'Written from general knowledge, not re-checked', 'title-only': 'Title only - nothing about it was checked', user: 'Added by you', guess: 'Guessed from the name and link only, not checked', scanned: 'Read from the live page by Nexus, not checked by you' };

export const ico = (name, cls) => h('span.ico-s', { html: icon(name, cls) });
export function btn(label, o = {}) {
  const cls = 'btn' + (o.cls ? ' ' + o.cls : '');
  return h('button', { type: 'button', class: cls, title: o.title, 'aria-label': o.aria || (label ? undefined : o.title), disabled: o.disabled, onclick: o.onclick },
    o.icon ? h('span.ico-s', { html: icon(o.icon, o.sm ? 'sm' : '') }) : null, label || null);
}
export const chip = (text, o = {}) => h(o.onclick ? 'button' : 'span', { type: o.onclick ? 'button' : undefined, class: 'chip ' + (o.cls || '') + (o.on ? ' on' : ''), style: o.color ? { '--c': o.color } : null, onclick: o.onclick, title: o.title },
  o.dot ? h('i.dot') : null, o.icon ? h('span.ico-s', { html: icon(o.icon, 'sm') }) : null, text);

/** iOS segmented control with a sliding thumb. items: [{ v, l, n }]. onChange(v) runs just after the thumb starts to slide. */
export function segmented(items, value, onChange, o = {}) {
  const el = h('div', { class: 'seg' + (o.cls ? ' ' + o.cls : ''), role: 'tablist' });
  el.style.setProperty('--n', items.length);
  const set = v => { const i = Math.max(0, items.findIndex(x => x.v === v)); el.style.setProperty('--i', i); [...el.querySelectorAll('button')].forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-selected', k === i ? 'true' : 'false'); }); };
  el.append(h('i.seg-thumb'), items.map(it => h('button', { type: 'button', role: 'tab', onclick: () => { set(it.v); sfx.feel('tap'); if (o.instant) onChange(it.v); else setTimeout(() => onChange(it.v), 130); } }, it.l, it.n != null ? h('b', it.n) : null)));
  set(value); return el;
}

// ---------- banners ----------
export function toast(msg, o = {}) {
  const host = $('#toasts'); if (!host) return null;
  while (host.children.length >= 2) host.firstChild.remove();
  let gone = false;
  const dismiss = () => { if (gone) return; gone = true; el.classList.add('out'); setTimeout(() => el.remove(), 320); };
  const el = h('div', { class: 'toast ' + (o.kind || ''), onclick: o.action ? null : dismiss },
    o.icon ? h('span.t-ico', { html: icon(o.icon, 'sm') }) : null, h('div.grow', o.html ? { html: o.html } : null, o.html ? null : msg),
    o.action ? btn(o.action.label, { cls: 'xs pri', onclick: () => { dismiss(); o.action.fn(); } }) : null);
  host.appendChild(el); setTimeout(dismiss, o.ms || 3800);
  return { dismiss };
}

export function clearToasts() { const host = $('#toasts'); if (host) [...host.children].forEach(t => t.classList.add('out')), setTimeout(() => { [...host.querySelectorAll('.toast.out')].forEach(t => t.remove()); }, 320); }

// ---------- panels ----------
const stack = []; const hooks = { cover: () => {}, change: () => {} };
export const setHooks = x => Object.assign(hooks, x);
const layer = () => document.getElementById('sheets');
// Android back button: while any panel is open there is exactly one extra history entry. Back consumes it and closes the top panel.
let armed = false, pending = 0, wantArm = false;
const arm = () => { if (armed) return; if (pending) { wantArm = true; return; } try { history.pushState({ nx: 1 }, '', location.href); armed = true; } catch (e) { /* sandboxed */ } };
const disarm = () => { if (!armed) return; armed = false; pending++; try { history.back(); } catch (e) { pending--; } };
function updateCover() { const c = stack.some(p => p.kind === 'view'); document.body.classList.toggle('covered', c); document.body.classList.toggle('has-sheet', stack.some(p => p.kind === 'sheet')); hooks.cover(c); hooks.change(stack); }
addEventListener('popstate', () => {
  if (pending) { pending--; if (!pending && wantArm && stack.length) { wantArm = false; arm(); } return; }
  armed = false;
  const top = stack[stack.length - 1]; if (top) closePanel(top.id, true);
  if (stack.length) arm();
});
addEventListener('keydown', e => { if (e.key === 'Escape') { const top = stack[stack.length - 1]; if (top && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) closePanel(top.id); } });

/** Drag the top bar of a sheet down to close it (or up to make it taller), like a native sheet. */
function swipeable(p) {
  let y0 = 0, t0 = 0, dy = 0, on = false;
  const bar = p.nav;
  bar.addEventListener('pointerdown', e => {
    if (e.target.closest('button, a, input, textarea, select')) return;
    on = true; y0 = e.clientY; t0 = e.timeStamp; dy = 0; p.el.classList.add('dragging');
    try { bar.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  bar.addEventListener('pointermove', e => {
    if (!on) return; dy = e.clientY - y0;
    p.el.style.transform = 'translateY(' + (dy > 0 ? dy : dy * 0.2) + 'px)';
  });
  const end = e => {
    if (!on) return; on = false; p.el.classList.remove('dragging'); p.el.style.transform = '';
    const v = dy / Math.max(1, e.timeStamp - t0);
    if (dy > 90 || (dy > 30 && v > 0.55)) closePanel(p.id);
    else if (dy < -45 && p.kind === 'sheet') { p.el.classList.add('tall'); hooks.change(stack); }
    else if (dy > 45 && p.el.classList.contains('tall')) { p.el.classList.remove('tall'); hooks.change(stack); }
  };
  bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', end);
}

/**
 * kind: 'view' (tab screen above the tab bar, large title) | 'overlay' (page sheet over everything) | 'sheet' (bottom card).
 * Panel API: setTitle, setActions (right side of the bar), setLeft (left side), scroller (the element that scrolls), body (put content here), render, close.
 * Options: back (view gets a "back" button), bare (overlay draws its own bar), live:false (not redrawn on every data change).
 */
export function openPanel(id, o) {
  const old = stack.find(p => p.id === id);
  if (old) { old.render(); return old; }
  const kind = o.kind || 'view';
  if (kind !== 'sheet') clearToasts();
  const p = { id, kind, o, titleText: o.title || '' };
  const close = () => closePanel(id);
  p.navL = h('div.nav-l'); p.navR = h('div.nav-r'); p.navTitle = h('div.nav-title', p.titleText);
  p.nav = h('header' + (o.bare ? '.nav.bare' : '.nav'), o.bare ? null : [p.navL, p.navTitle, p.navR]);
  p.closeBtn = h('button.btn.icon.ghost.p-close', { type: 'button', 'aria-label': 'Close', html: icon('close'), onclick: close });
  let kids;
  if (kind === 'view') {
    p.large = h('h1.large', p.titleText); p.body = h('div.p-body'); p.scroller = h('div.p-scroll.scroll', p.large, p.body);
    p.scroller.addEventListener('scroll', () => p.nav.classList.toggle('scrolled', p.scroller.scrollTop > 28), { passive: true });
    kids = [p.nav, p.scroller];
  } else {
    p.body = p.scroller = h('div.p-body.scroll');
    kids = kind === 'sheet' ? [h('div.grab'), p.nav, p.body] : [p.nav, p.body];
  }
  p.el = h('section', { class: 'panel ' + kind + (o.cls ? ' ' + o.cls : ''), dataset: { id }, role: 'dialog', 'aria-label': o.title || id }, kids);
  p.close = close;
  p.setTitle = t => { p.titleText = t; p.navTitle.textContent = t; if (p.large) p.large.textContent = t; };
  p.setActions = (...n) => { if (!o.bare) p.navR.replaceChildren(n, kind === 'sheet' ? p.closeBtn : null); };
  p.setLeft = (...n) => { if (!o.bare) p.navL.replaceChildren(n); };
  p.defaultLeft = () => {
    if (o.bare) return;
    if (kind === 'view' && o.back) p.setLeft(btn('Back', { cls: 'ghost', icon: 'back', onclick: close }));
    else if (kind === 'overlay') p.setLeft(btn('Close', { cls: 'ghost', onclick: close }));
    else p.setLeft();
  };
  p.render = () => { try { if (o.render) o.render(p); } catch (e) { console.error(e); p.body.textContent = 'Something went wrong drawing this panel.'; } };
  if (kind === 'sheet') p.navR.append(p.closeBtn);
  p.defaultLeft();
  if (kind === 'overlay') { p.scrim = h('div.pscrim', { onclick: close }); layer().appendChild(p.scrim); }
  layer().appendChild(p.el); stack.push(p); p.render();
  if (kind !== 'view') swipeable(p);
  requestAnimationFrame(() => requestAnimationFrame(() => { p.el.classList.add('in'); if (p.scrim) p.scrim.classList.add('in'); }));
  arm(); sfx.feel('open', 6);
  // a tab screen replaces the other tab screens (they are hidden underneath anyway)
  if (kind === 'view') stack.filter(q => q.kind === 'view' && q !== p).forEach(q => closePanel(q.id, false, true));
  updateCover();
  return p;
}
export function closePanel(id, fromPop, instant) {
  const i = stack.findIndex(p => p.id === id); if (i < 0) return;
  const p = stack[i]; stack.splice(i, 1);
  p.el.style.transform = ''; p.el.classList.remove('in', 'dragging');
  if (instant) { p.el.remove(); if (p.scrim) p.scrim.remove(); }
  else { p.el.classList.add('out'); if (p.scrim) p.scrim.classList.remove('in'); setTimeout(() => { p.el.remove(); if (p.scrim) p.scrim.remove(); }, 420); }
  try { if (p.o.onClose) p.o.onClose(p); } catch (e) { console.error(e); }
  updateCover(); if (!instant) sfx.play('close');
  if (!stack.length) disarm();
}
export const getPanel = id => stack.find(p => p.id === id) || null;
export const openPanels = () => stack.slice();
export function closeKind(kind, except) { stack.filter(p => p.kind === kind && p.id !== except).forEach(p => closePanel(p.id)); }
export const panelsChanged = () => hooks.change(stack);
export const refreshPanels = () => stack.forEach(p => { if (p.o.live !== false) p.render(); });

// ---------- alerts and action sheets ----------
export function dialog(build, cls) {
  return new Promise(res => {
    const scrim = h('div.scrim'), box = h('div.dlg' + (cls ? '.' + cls : ''), { role: 'dialog', 'aria-modal': 'true' });
    let closed = false;
    const done = v => { if (closed) return; closed = true; removeEventListener('keydown', onKey, true); box.classList.remove('in'); scrim.classList.remove('in'); setTimeout(() => { box.remove(); scrim.remove(); }, 300); res(v); };
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } };
    addEventListener('keydown', onKey, true); scrim.onclick = () => done(null);
    build(box, done); layer().append(scrim, box);
    requestAnimationFrame(() => { scrim.classList.add('in'); box.classList.add('in'); const f = box.querySelector('input,textarea,select'); if (f && matchMedia('(hover:hover)').matches) f.focus(); });
  });
}
export const confirmBox = o => dialog((box, done) => box.append(
  h('h3', o.title || 'Are you sure?'), o.text ? h('p', o.text) : null,
  h('div.dlg-actions', btn(o.cancel || 'Cancel', { onclick: () => done(false) }), btn(o.ok || 'OK', { cls: o.danger ? 'danger' : 'pri', onclick: () => done(true) }))));

export const promptBox = o => dialog((box, done) => {
  const inputs = {}, previews = [];
  const rows = (o.fields || []).map(f => {
    let el;
    if (f.type === 'select') el = h('select.sel', (f.options || []).map(x => h('option', { value: x.v, selected: String(x.v) === String(f.value) }, x.l)));
    else if (f.type === 'textarea') el = h('textarea.ta', { placeholder: f.placeholder || '', rows: f.rows || 3 }, f.value || '');
    else if (f.type === 'starprev') { el = h('div.starprev', h('i.sp-star'), h('i.sp-pl', { style: { left: '58%', top: '30%' } }), h('i.sp-pl.b', { style: { left: '72%', top: '62%' } }), h('i.sp-pl.c', { style: { left: '86%', top: '36%' } })); previews.push([el, f]); return h('div.field', el); }
    else if (f.type === 'color') {
      const list = f.colors || store.JOB_COLORS, hex = c => /^#[0-9a-f]{6}$/i.test(c || ''), same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
      el = h('div.swatches'); el.value = f.value == null ? (f.none ? '' : list[0]) : f.value;
      const inp = h('input', { type: 'color', 'aria-label': 'Pick any colour', value: hex(el.value) ? el.value : list[0] });
      const custom = h('label.sw.custom', { title: 'Any colour' }, inp);
      const mark = () => { [...el.children].forEach(b => { if (b !== custom) b.classList.toggle('on', same(b._v, el.value)); }); const isCustom = hex(el.value) && !list.some(c => same(c, el.value)); custom.classList.toggle('on', isCustom); custom.style.setProperty('--c', isCustom ? el.value : 'transparent'); };
      const pick = v => { el.value = v; mark(); el.dispatchEvent(new Event('pick')); };
      if (f.none) el.appendChild(h('button.sw.none', { type: 'button', title: f.none, 'aria-label': f.none, onclick: () => pick('') }, h('span', f.none === true ? 'Auto' : 'Same')));
      if (f.none) el.lastChild._v = '';
      list.forEach(c => { const b = h('button.sw', { type: 'button', style: { '--c': c }, 'aria-label': c, onclick: () => pick(c) }); b._v = c; el.appendChild(b); });
      inp.addEventListener('input', () => pick(inp.value.toUpperCase())); el.appendChild(custom); mark();
    } else if (f.type === 'check') { el = h('button.switch' + (f.value ? '.on' : ''), { type: 'button', role: 'switch', onclick: () => el.classList.toggle('on') }); Object.defineProperty(el, 'value', { get: () => el.classList.contains('on'), set: v => el.classList.toggle('on', !!v), configurable: true }); }   // a button's own .value is a string, so the real on/off lives in the class
    else el = h('input.in', { type: 'text', value: f.value || '', placeholder: f.placeholder || '', autocomplete: 'off', onkeydown: e => { if (e.key === 'Enter' && (o.fields || []).length === 1) submit(); } });
    inputs[f.key] = el;
    return h('div', { class: 'field' + (f.type === 'check' ? ' inline' : '') }, f.label ? h('label', f.label) : null, el);
  });
  for (const [pv, f] of previews) {   // live preview: a star with three planets in the chosen colours
    const upd = () => { const sc = inputs[f.star] && inputs[f.star].value, pc = (inputs[f.planet] && inputs[f.planet].value) || sc; if (sc) pv.style.setProperty('--star', sc); if (pc) pv.style.setProperty('--pl', pc); };
    upd(); [f.star, f.planet].forEach(k => inputs[k] && inputs[k].addEventListener('pick', upd));
  }
  const submit = () => { const out = {}; for (const k in inputs) out[k] = inputs[k].value; done(out); };
  box.classList.add('form');
  box.append(h('h3', o.title || ''), o.text ? h('p', o.text) : null, h('div.stack', rows),
    h('div.dlg-actions', btn('Cancel', { onclick: () => done(null) }), btn(o.ok || 'Save', { cls: 'pri', onclick: submit })));
});

/** Bottom action menu. items: [{label, sub, icon, color, danger, run, on, sep}] -> resolves with the chosen item. */
export const actionSheet = o => dialog((box, done) => {
  box.classList.add('menu');
  box.append(
    h('div.menu-card', (o.title || o.sub) ? h('div.menu-head', o.title ? h('h3', o.title) : null, o.sub ? h('p.dim', o.sub) : null) : null,
      h('div.menu-list.scroll', (o.items || []).filter(Boolean).map(it => it.sep ? h('div.menu-sep', it.sep) : h('button', { type: 'button', class: 'menu-item' + (it.danger ? ' danger' : '') + (it.on ? ' on' : ''), onclick: () => { done(it); if (it.run) it.run(); } },
        it.icon ? h('span.ico-s', { html: icon(it.icon) }) : (it.color ? h('i.dot', { style: { '--c': it.color } }) : null),
        h('span.grow', h('b', it.label), it.sub ? h('small', it.sub) : null), it.on ? h('span.ico-s', { html: icon('check', 'sm') }) : null)))),
    h('div.menu-card.cancel', btn('Cancel', { onclick: () => done(null) })));
}, 'menu');

// ---------- small builders ----------
/** White glyphs on most colours, dark ones on light colours such as yellow. */
export function inkFor(c) { const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '')); if (!m) return '#fff'; const n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 175 ? 'rgba(0,0,0,.72)' : '#fff'; }

/** The site name to ask for an icon: only a normal web address, never an IP, localhost or a private name. */
export const iconHost = url => {
  try { const u = new URL(String(url || '').trim()); if (!/^https?:$/.test(u.protocol)) return ''; const h0 = u.hostname.toLowerCase().replace(/^www\./, ''); return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h0) && !/^\d+(\.\d+)+$/.test(h0) && !/\.(local|internal|lan|test|invalid|localhost)$/.test(h0) ? h0 : ''; } catch (e) { return ''; }
};
/** A round letter badge. With "Site icons" on (Profile, off by default), the site's own icon is loaded on top of it from DuckDuckGo; if it fails, the letter stays. */
export function monogram(r, size) {
  const j = store.jobsOf(r.id)[0], c = (j && j.color) || '#8E8E93', d = domainOf(r.url) || r.title || '?';
  const ch = (r.tags.includes('following') ? '@' : (d.replace(/^www\./, '')[0] || '?')).toUpperCase();
  const el = h('span.mono-ic', { style: { '--c': c, '--ink': inkFor(c), '--s': (size || 40) + 'px' } }, ch);
  const host = store.getSetting('siteIcons') === true && !r.tags.includes('following') ? iconHost(r.url) : '';
  if (host) { const img = h('img.mono-img', { src: 'https://icons.duckduckgo.com/ip3/' + host + '.ico', alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', onload: () => el.classList.add('has-img'), onerror: () => img.remove() }); el.append(img); }
  return el;
}
export function dueChip(r) {
  const b = store.dueBucket(r); if (!b) return null;
  const d = daysBetween(todayISO(), r.nextCheck);
  return chip(b === 'overdue' ? 'Overdue ' + (-d) + 'd' : (b === 'today' ? 'Due today' : 'In ' + d + 'd'), { cls: b === 'upcoming' ? 't' : 'bad', icon: 'clock' });
}
export const nextText = r => r.checkCadence === 'none' ? 'No schedule' : (r.nextCheck ? fmtDate(r.nextCheck) : 'Not scheduled');
export function openLink(url) { if (!url) return; try { const w = window.open(url, '_blank', 'noopener,noreferrer'); if (!w) location.href = url; } catch (e) { location.href = url; } }
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall back */ }
  try { const t = h('textarea', { style: { position: 'fixed', opacity: 0 } }, text); document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok; } catch (e) { return false; }
}
/** Save text as a file. Returns false when the browser blocks downloads (for example inside another page). */
export function downloadText(name, text, mime = 'text/plain') {
  try { const url = URL.createObjectURL(new Blob([text], { type: mime + ';charset=utf-8' })), a = h('a', { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); return true; } catch (e) { return false; }
}
/** True when this browser can hand a file to the phone's share sheet (Drive, email, chat). Needs the installed or https version. */
export function canShareFiles() {
  try { const f = new File(['x'], 'x.json', { type: 'application/json' }); return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [f] })); } catch (e) { return false; }
}
/** Share a text file through the share sheet. Returns 'shared', 'cancelled' or 'failed'. */
export async function shareTextFile(name, text, mime, title) {
  try { await navigator.share({ files: [new File([text], name, { type: mime })], title: title || name }); return 'shared'; }
  catch (e) { return e && e.name === 'AbortError' ? 'cancelled' : 'failed'; }
}
export const FRAMED = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
export const rowsOf = (v, fn) => (v && v.length ? v.map(fn) : null);

/** Find-and-pick dialog over all resources. Resolves with the resource or null. */
export function pickDialog(title, exclude) {
  const ex = exclude || new Set();
  return dialog((box, done) => {
    const q = h('input.in', { type: 'text', placeholder: 'Type to find a resource', autocomplete: 'off' }), res = h('div.menu-list.scroll', { style: { maxHeight: '44vh' } });
    const show = () => {
      const t = q.value.trim().toLowerCase();
      const items = store.state.resources.filter(o => !ex.has(o.id) && (!t || o.title.toLowerCase().includes(t) || o.tags.some(g => g.includes(t)) || domainOf(o.url).includes(t))).slice(0, 40);
      res.replaceChildren(...(items.length ? items.map(o => h('button.menu-item', { type: 'button', onclick: () => done(o) }, monogram(o, 32), h('span.grow', h('b', o.title.length > 44 ? o.title.slice(0, 43) + '…' : o.title), h('small', domainOf(o.url) || '')))) : [h('p.dim.small.center', { style: { padding: '16px' } }, 'Nothing matches.')]));
    };
    q.addEventListener('input', show); box.classList.add('menu');
    box.append(h('div.menu-card', h('div.menu-head', h('h3', title), h('div', { style: { marginTop: '10px' } }, q)), res), h('div.menu-card.cancel', btn('Cancel', { onclick: () => done(null) }))); show();
  }, 'menu');
}
