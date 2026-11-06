// ui/install.js - "Install as an app" (Chrome), the count on the app icon, and the keyboard help.
// Honest about limits: a saved .html file cannot be installed. Only the https version can, and only Chrome decides when to offer it.
import { h, debounce } from '../util.js';
import * as store from '../store.js';
import { needsItems } from '../home.js';
import { installState, badgeCount } from '../install.js';
import { app } from './app.js';
import { openPanel, getPanel, btn, toast, dialog } from './kit.js';

let deferred = null;   // Chrome's "install" offer, kept until you press the button
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; redraw(); });
addEventListener('appinstalled', () => { deferred = null; toast('Nexus is installed.', { icon: 'check' }); redraw(); });

const standalone = () => { try { return matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true; } catch (e) { return false; } };
export const currentInstall = () => installState({ protocol: location.protocol, host: location.hostname, standalone: standalone(), canPrompt: !!deferred });
const redraw = () => { const p = getPanel('install'); if (p) draw(p); };

export function openInstall() { return openPanel('install', { kind: 'view', title: 'Install as an app', back: true, render: draw }); }
function draw(p) {
  const s = currentInstall(), badgeOk = 'setAppBadge' in navigator;
  p.setActions();
  p.body.replaceChildren(h('div.rs',
    h('section.tile', h('div.tile-h', h('span', s.title)), h('p.small', s.text),
      s.steps.length ? h('ol.lst', s.steps.map(x => h('li', x))) : null,
      s.kind === 'ready' ? h('div.row.wrap', btn('Install Nexus', { cls: 'pri', icon: 'download', onclick: async () => { try { deferred.prompt(); await deferred.userChoice; } catch (e) { /* closed */ } deferred = null; redraw(); } })) : null),
    h('section.tile', h('div.tile-h', h('span', 'What installing gives you')),
      h('ul.lst', [
        'Its own window or home-screen icon. No browser bar.',
        'Works with no internet.',
        'A count on the icon for what needs you' + (badgeOk ? '.' : ' (this browser does not support it).'),
        'Long-press the icon for Add, Search and Review.',
        'Other apps can share a link straight into Nexus (Android).'].map(x => h('li', x)))),
    h('p.dim.small', 'Your data stays on each device and in each browser. An installed copy starts empty. Move your data with a backup file.')));
}

// ---- count on the app icon: what needs you, as of the last change ----
export function updateBadge() {
  try {
    if (!('setAppBadge' in navigator)) return;
    const n = store.getSetting('badge') === false ? 0 : badgeCount(needsItems(store.state.resources, store).length);
    const r = n ? navigator.setAppBadge(n) : navigator.clearAppBadge();
    if (r && r.catch) r.catch(() => {});
  } catch (e) { /* not supported here */ }
}
const later = debounce(updateBadge, 800);
store.on('change', later); store.on('load', later); store.on('settings', e => { if (e && e.key === 'badge') updateBadge(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) updateBadge(); });
setTimeout(updateBadge, 1500);

// ---- keyboard help ----
export function openKeys() {
  const rows = [['/', 'Search, or type where to go'], ['n', 'Add a link'], ['?', 'This list'], ['g', 'Back to the galaxy'], ['h', 'Reset the galaxy view'], ['Esc', 'Close the top panel']];
  return dialog((box, done) => box.append(h('h3', 'Keyboard shortcuts'), h('p.dim.small', 'They work when you are not typing in a box.'),
    h('div.keys', rows.map(([k, t]) => h('div.nrow.cmp', h('kbd', k), h('div.grow', h('div.t', { style: { cursor: 'default' } }, t))))),
    h('div.dlg-actions', btn('Close', { cls: 'pri', onclick: () => done(true) }))));
}
app.open.install = openInstall; app.open.keys = openKeys;
