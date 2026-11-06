// main.js - boots the data, the galaxy and the UI, and wires them together.
import seed from '../../seed/seed.json';
import * as store from './store.js';
import * as game from './game.js';
import { GalaxyScene } from './scene.js';
import { $, h, plural } from './util.js';
import { icon } from './icons.js';
import { app, clearHighlight } from './ui/app.js';
import { closeKind, setHooks, toast, btn } from './ui/kit.js';
import './ui/home.js'; import './ui/reset.js'; import './ui/merge.js'; import './ui/tidy.js'; import './ui/tags.js'; import './ui/ideas.js'; import './ui/install.js'; import './ui/detail.js'; import './ui/ask.js'; import './ui/quickadd.js'; import './ui/importer.js'; import './ui/sectors.js'; import './ui/vault.js'; import './ui/missions.js'; import './ui/alerts.js'; import './ui/insights.js'; import './ui/core.js';
import { buildHUD, insets } from './ui/hud.js';
import * as focus from './ui/focus.js';
import * as snap from './snap.js';
import { parseShare, parseAction } from './sharein.js';
import { shortcutFor } from './install.js';
import { VERSION } from './whatsnew.js';
import './ui/share.js'; import './ui/rules.js'; import './ui/compare.js'; import { offerRecovery } from './ui/safety.js';

app.seed = seed;
store.load(seed);
snap.start();
app.open.closeViews = () => closeKind('view');
const html = document.documentElement, dark = matchMedia('(prefers-color-scheme: dark)');
const resolveTheme = () => { const t = store.getSetting('theme'); return t === 'light' ? 'light' : (t === 'dark' ? 'dark' : (dark.matches ? 'dark' : 'light')); };
const applyTheme = () => {
  const t = resolveTheme(); html.dataset.theme = t; app.theme = t;
  html.style.setProperty('--ts', String({ l: 1.12, xl: 1.24 }[store.getSetting('textSize')] || 1));
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => { m.removeAttribute('media'); m.content = t === 'light' ? '#F2F2F7' : '#000000'; });
  if (app.ok) app.scene.setTheme(t, store.getSetting('space') !== false);
  app.emit('theme', t);
};
if (dark.addEventListener) dark.addEventListener('change', () => { if (store.getSetting('theme') === 'auto') applyTheme(); });
app.toggleTheme = () => store.setSetting('theme', app.theme === 'dark' ? 'light' : 'dark');
const bootSub = t => { const e = $('#boot-sub'); if (e) e.textContent = t; };

// ---- galaxy ----
const scene = new GalaxyScene($('#gl'), $('#labels'));
app.scene = scene; app.ok = scene.init(store.getSetting('quality'));
applyTheme();

function noGL() {
  document.body.classList.add('nogl'); $('#gl').style.display = 'none';
  $('#hud').appendChild(h('div.noglcard', h('div.big', { html: icon('galaxy', 'lg') }), h('h3', '3D map unavailable'), h('p.dim', 'This browser could not start WebGL' + (scene.error ? ' (' + String(scene.error).slice(0, 80) + ')' : '') + '. Everything else works: use the bar at the bottom.'),
    h('div.row.wrap', { style: { justifyContent: 'center' } }, btn('Open Sectors', { cls: 'pri', onclick: () => app.open.sectors() }), btn('Search', { onclick: () => app.open.search() }))));
}
if (!app.ok) noGL();

let queued = false;
const syncScene = () => { if (!app.ok || queued) return; queued = true; requestAnimationFrame(() => { queued = false; scene.setData(store.state.resources, store.state.jobs, { home: false }); }); };
const applySettings = () => {
  applyTheme();
  if (!app.ok) return;
  scene.setQuality(store.getSetting('quality')); scene.setTethers(store.getSetting('tethers'));
  scene.controls.autoRotate = !store.getSetting('calm'); scene.controls.reduced = scene.controls.reduced || !!store.getSetting('calm');
};
store.on('change', syncScene); store.on('load', syncScene); store.on('settings', applySettings);

let pauseT = 0;
setHooks({ cover: c => { clearTimeout(pauseT); if (!app.ok) return; if (c) pauseT = setTimeout(() => scene.setPaused(true), 420); else scene.setPaused(false); } });

if (app.ok) {
  scene.setData(store.state.resources, store.state.jobs, { home: false });
  scene.cb.tap = hit => {
    if (!hit) { scene.clearSelection(); app.open.closeDetail(); return; }
    if (hit.kind === 'node') app.open.detail(hit.id, { fly: true }); else app.open.sectorCard(hit.id);
  };
  scene.cb.double = hit => { if (!hit) scene.home(); else if (hit.kind === 'node') scene.flyToNode(hit.id, 26); };
  scene.canvas.addEventListener('pointermove', () => { scene.canvas.style.cursor = scene.hover ? 'pointer' : ''; });
}

// ---- UI ----
buildHUD(); focus.init(); applySettings();
if (app.ok) {
  scene.setInsets(insets());
  if (store.getSetting('intro') && !matchMedia('(prefers-reduced-motion: reduce)').matches) { scene.controls.setView({ x: 0, y: 0, z: 0, radius: 1500, theta: 2.4, phi: 1.3 }, true); scene.home(false); } else scene.home(true);
}
bootSub(plural(store.state.resources.length, 'resource') + ' loaded');
setTimeout(() => $('#boot').classList.add('gone'), 650);

// ---- start on Home (the dashboard) unless the person chose the galaxy, or opened the page with #galaxy ----
const startGalaxy = store.getSetting('startOn') === 'galaxy' || /[#&]galaxy\b/.test(location.hash);
const startHome = !startGalaxy;
if (startHome) setTimeout(() => { try { app.open.home(); } catch (e) { console.error(e); } }, 0);

// ---- saving ----
const flush = () => store.save(true);
addEventListener('pagehide', flush); document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
store.on('persist-fail', () => toast('This browser would not save your changes. Export a backup from Core.', { icon: 'warn', ms: 8000 }));

// ---- keys ----
addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '') || (e.target && e.target.isContentEditable) || !!document.querySelector('.dlg'), a = shortcutFor(e, typing);
  if (a === 'search') { e.preventDefault(); app.open.homeSearch(); }
  else if (a === 'add') { e.preventDefault(); app.open.quickadd(); }
  else if (a === 'help') { e.preventDefault(); app.open.keys(); }
  else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key === 'g' || e.key === 'G') { app.open.closeViews(); app.open.closeDetail(); }
    else if (e.key === 'h' || e.key === 'H') { if (app.ok) scene.home(); }
  }
});

// ---- welcome / due banner ----
setTimeout(() => {
  const st = store.stats(), act = parseAction(location.search), shared = parseShare(location.search) || (act ? { quiet: true } : null), nudge = store.backupNudge();
  if (store.meta.firstRun && !shared) toast('', { html: __PUBLIC__ ? '<b>Welcome.</b> These are 8 starter examples. Tap + at the top right, then Import files or Restore a backup file, to bring in your own.' : (startHome ? '<b>Welcome.</b> This is Home: what needs you, your launch pad and search. Tap Galaxy below for the map.' : '<b>Welcome.</b> Tap any dot on the map, or search for what you want to do.'), icon: startHome ? 'home' : 'galaxy', ms: __PUBLIC__ ? 9000 : 6000 });
  // first run: the welcome note is enough, the Alerts badge already shows what is due
  if (st.attention > 0 && !store.meta.firstRun && !shared) toast('', { html: [st.due ? '<b>' + plural(st.due, 'check') + '</b> due' + (st.overdue ? ' (' + st.overdue + ' overdue)' : '') : '', st.events ? '<b>' + plural(st.events, 'trial or limit date') + '</b> to look at' : '', st.changes ? '<b>' + plural(st.changes, 'page') + '</b> changed' : ''].filter(Boolean).join(', ') + '.', icon: 'alert', ms: 7000, action: { label: 'Open', fn: () => app.open.alerts('due') } });
  if (st.due > 0 && store.getSetting('notify') && 'Notification' in window && Notification.permission === 'granted') { try { new Notification('Nexus', { body: plural(st.due, 'check') + ' due today.' }); } catch (e) { /* ignore */ } }
  if (nudge.due && st.attention === 0 && !store.meta.firstRun && !shared) toast('', { html: '<b>Back up your data.</b> ' + (nudge.days === null ? 'No backup downloaded yet.' : 'Last backup ' + plural(nudge.days, 'day') + ' ago.'), icon: 'download', ms: 8000, action: { label: 'Back up', fn: () => app.open.core() } });
  if (act) {   // a shortcut from long-pressing the app icon
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* ignore */ }
    try { if (act === 'add') app.open.quickadd(); else if (act === 'search') app.open.homeSearch(); else if (act === 'review') app.open.alerts('scan'); else app.open.alerts('due'); } catch (e) { /* ignore */ }
  } else if (shared) {   // another app shared a link to Nexus (the installed app is a share target): open Quick Add with it
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* ignore */ }
    try { app.open.quickadd({ text: shared.text }); toast(shared.url ? 'Shared to Nexus. Check it, then tap Add.' : 'Shared to Nexus. No link was found in it, so edit the text.', { icon: 'download', ms: 5000 }); } catch (e) { /* ignore */ }
  }
  if (VERSION !== 'dev' && store.getSetting('seenVersion') !== VERSION) {   // after an update: say so once, with a way to see what changed
    const was = store.getSetting('seenVersion'); store.setSetting('seenVersion', VERSION);
    if (was && !store.meta.firstRun && !shared) toast('', { html: '<b>Updated to ' + VERSION.replace(/^v/, '') + '.</b> See what is new.', icon: 'spark', ms: 7000, action: { label: 'See', fn: () => app.open.whatsNew() } });
  }
  const m = /[#&]add=([^&]+)/.exec(location.hash); if (m) { try { app.open.quickadd({ text: decodeURIComponent(m[1]) }); } catch (e) { /* ignore */ } }
  if (store.meta.firstRun) setTimeout(offerRecovery, 1200);   // an emptied main copy but a surviving safety copy: offer it back
}, 1500);

window.__nexus = { store, scene, game, app, ok: app.ok };
