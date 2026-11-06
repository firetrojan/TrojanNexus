// ui/hud.js - the galaxy screen chrome: search field, add button, shortcut capsules, control group (recenter, appearance, profile), tab bar, banners.
import { h, $, plural } from '../util.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import * as game from '../game.js';
import * as sfx from '../sfx.js';
import { app, clearHighlight } from './app.js';
import { toast, setHooks, openPanels } from './kit.js';

const TABS = [['home', 'Home', 'home'], ['galaxy', 'Galaxy', 'galaxy'], ['sectors', 'Sectors', 'sectors'], ['vault', 'Vault', 'vault'], ['missions', 'Missions', 'mission'], ['alerts', 'Alerts', 'alert']];
let els = {}, sig = '', probe = null;

const ctrl = (cls, label, ic, fn) => h('button', { type: 'button', class: 'ctrl ' + cls, 'aria-label': label, title: label, html: ic ? icon(ic) : null, onclick: () => { sfx.feel('tap'); fn(); } });

export function buildHUD() {
  const hud = $('#hud');
  els.ask = h('button.ask', { type: 'button', onclick: () => { sfx.feel('tap'); app.open.search(); } }, h('span.ico-s', { html: icon('search') }), h('span', 'Search or ask “Can I…?”'), h('span.kbd.dsk', '/'));
  els.add = h('button.circ', { type: 'button', 'aria-label': 'Add a resource', title: 'Add a resource', html: icon('plus'), onclick: () => { sfx.feel('tap', 12); app.open.quickadd(); } });
  els.top = h('div.top', els.ask, els.add);
  els.quests = h('div.quests', { role: 'toolbar', 'aria-label': 'Shortcuts' });
  els.home = ctrl('home', 'Recenter the galaxy', 'target', () => { app.open.closeViews(); clearHighlight(); if (app.scene && app.ok) { app.scene.clearSelection(); app.scene.home(); } if (app.open.closeDetail) app.open.closeDetail(); });
  els.theme = ctrl('theme', 'Appearance', null, () => { app.toggleTheme(); });
  els.lvl = h('button', { type: 'button', class: 'ctrl lvl', 'aria-label': 'Profile and settings', title: 'Profile and settings', onclick: () => { sfx.feel('tap'); app.open.core(); } }, h('i.lvl-ring'), h('b', '1'));
  els.ctrls = h('div.ctrls', els.home, els.theme, els.lvl);
  els.tabs = {};
  els.dock = h('nav.dock', { 'aria-label': 'Main' }, TABS.map(([id, label, ic]) => {
    const b = els.tabs[id] = h('button.tab', { type: 'button', 'data-tab': id, onclick: () => go(id) }, h('span.ico-s', { html: icon(ic) }), h('span', label));
    return b;
  }));
  hud.append(els.top, els.quests, els.ctrls, els.dock);

  app.hud = { refresh, refreshInsets: setInsets };
  setHooks({ change: onPanels });
  store.on('change', refresh); store.on('load', refresh); store.on('game', onGame);
  app.on('hl', refresh); app.on('route', refresh); app.on('theme', themeIcon);
  addEventListener('resize', setInsets); setInsets();
  themeIcon(); refresh(); markTabs();
}

function themeIcon() {
  if (!els.theme) return;
  const dark = app.theme === 'dark';
  els.theme.innerHTML = icon(dark ? 'moon' : 'sun');
  els.theme.title = els.theme.ariaLabel = dark ? 'Appearance: Dark (tap for Light)' : 'Appearance: Light (tap for Dark)';
  els.theme.setAttribute('aria-label', els.theme.title);
}

export function go(id) {
  sfx.feel('tap');
  const open = openPanels().filter(p => p.kind === 'view').map(p => p.id);
  if (id === 'galaxy') { app.open.closeViews(); if (app.open.closeDetail) app.open.closeDetail(); return; }
  if (open.includes(id)) return;
  app.open[id]();
}

function onPanels() { markTabs(); coverSheet(); }
/** Tell the galaxy how much of the screen a bottom sheet covers, so the picked item stays in view. */
function coverSheet() {
  if (!app.scene || !app.ok) return;
  const ps = openPanels(), sh = ps.find(p => p.kind === 'sheet'), view = ps.some(p => p.kind === 'view');
  app.scene.setCover(sh && !view && innerWidth < 700 && !sh.el.classList.contains('tall') ? Math.min(sh.el.offsetHeight, innerHeight * 0.58) : 0);
}
function markTabs() {
  const v = openPanels().filter(p => p.kind === 'view').map(p => p.id), cur = v.length ? v[v.length - 1] : 'galaxy';
  for (const id in els.tabs) els.tabs[id].classList.toggle('on', id === cur);
  els.lvl.classList.toggle('on', cur === 'core');
}

/** Real safe-area sizes (a CSS custom property would hand back the unresolved env() text). */
export function safeArea() {
  if (!probe) { probe = h('div', { 'aria-hidden': 'true', style: { position: 'fixed', left: '0', top: '0', width: '0', height: '0', visibility: 'hidden', pointerEvents: 'none', paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' } }); document.body.appendChild(probe); }
  const cs = getComputedStyle(probe); return { t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 };
}
export function insets() {
  const s = safeArea(), portrait = innerWidth < innerHeight * 1.05;
  return portrait ? { top: s.t + 104, bottom: s.b + 49 + 26, left: 10, right: 10 } : { top: s.t + 76, bottom: s.b + 49 + 40, left: 20, right: 20 };
}
function setInsets() { if (app.scene && app.ok) app.scene.setInsets(insets()); }
export const refreshInsets = setInsets;

function q(cls, icn, html, onclick) { return h('button', { type: 'button', class: 'q ' + cls, onclick: () => { sfx.feel('tap'); onclick(); } }, h('span.ico-s', { html: icon(icn) }), h('span', { html })); }

export function refresh() {
  const p = game.progress(), st = store.stats(), f = app.focus && app.focus.status ? app.focus.status() : null;
  const scan = store.state.resources.filter(r => r.draft && r.src !== 'following').length;
  els.lvl.style.setProperty('--p', p.pct); els.lvl.children[1].textContent = p.level; els.lvl.title = 'Profile and settings · level ' + p.level + ' ' + p.rank;
  const alerts = st.attention; const b = els.tabs.alerts; let bd = b.querySelector('.bdg');
  if (alerts > 0) { if (!bd) { bd = h('i.bdg'); b.appendChild(bd); } bd.textContent = alerts > 99 ? '99+' : alerts; } else if (bd) bd.remove();
  const key = [f ? f.label : '', st.attention, st.overdue, scan, app.hl ? app.hl.size + app.hlLabel : '', app.route ? app.route.name + app.route.step : ''].join('|');
  if (key === sig) return; sig = key;
  const items = [];
  items.push(f ? q('run', 'play', '<b>' + f.label + '</b> focus', () => app.open.focus()) : q('gold', 'bolt', 'Focus', () => app.open.focus()));
  if (st.attention > 0) items.push(q('bad', 'alert', '<b>' + st.attention + '</b> due', () => app.open.alerts('due')));
  if (scan > 0) items.push(q('info', 'scan', '<b>' + scan + '</b> to review', () => app.open.alerts('scan')));
  if (app.hl) items.push(q('gold', 'close', 'Showing <b>' + app.hl.size + '</b> ' + (app.hlLabel || 'matches'), () => clearHighlight()));
  els.quests.replaceChildren(...items);
}

function onGame(res) {
  els.lvl.classList.remove('pulse'); void els.lvl.offsetWidth; els.lvl.classList.add('pulse');
  refresh();
  if (res.gain > 0 && !res.levelUp) toast('', { html: '<b>+' + res.gain + ' XP</b>' + (res.label ? ' &middot; ' + String(res.label).replace(/[<>&]/g, '') : ''), kind: 'xp', icon: 'bolt', ms: 2200 });
  if (res.levelUp) { toast('', { html: '<b>Level ' + res.levelUp.level + '</b> &middot; ' + res.levelUp.rank + (res.levelUp.rankUp ? ' (new rank)' : ''), kind: 'xp', icon: 'star', ms: 4200 }); sfx.feel('level', [20, 40, 20]); }
  (res.newBadges || []).forEach((bd, i) => setTimeout(() => toast('', { html: '<b>Badge:</b> ' + bd.name + ' &middot; ' + bd.desc, kind: 'xp', icon: 'trophy', ms: 4200 }), 500 + i * 700));
  if (res.gain > 0 && !res.levelUp) sfx.play('xp');
}
