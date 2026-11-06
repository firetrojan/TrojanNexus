// ui/safety.js - the safety net on screen: saved copies you can go back to, an Undo after big changes, and recovery of an emptied page.
import { h, plural } from '../util.js';
import * as store from '../store.js';
import * as snap from '../snap.js';
import * as sfx from '../sfx.js';
import { app } from './app.js';
import { openPanel, getPanel, btn, toast, confirmBox } from './kit.js';

const when = ms => { const d = new Date(ms), t = new Date(), same = d.toDateString() === t.toDateString(); return (same ? 'Today' : d.toLocaleDateString('en', { day: 'numeric', month: 'short' })) + ' ' + d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }); };
export const bytesText = n => (n >= 1073741824 ? (n / 1073741824).toFixed(1) + ' GB' : (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'));

/** After a big change: a banner with Undo that puts the data back to how it was just before. */
export function offerUndo(reason, message) {
  toast(message, { icon: 'check', ms: 9000, action: { label: 'Undo', fn: async () => {
    const s = await snap.newestFor(reason);
    if (!s) return toast('The safety copy could not be found, so it cannot be undone. (Private windows do not allow it.)', { icon: 'warn', ms: 6000 });
    if (!(await confirmBox({ title: 'Go back?', text: 'Everything returns to how it was at ' + when(s.at) + ' (' + plural(s.n, 'resource') + '). Anything you changed after that is lost, but this moment is also saved first.', ok: 'Go back' }))) return;
    try { await snap.restore(s.id); sfx.feel('ok'); toast('Went back to ' + when(s.at) + '.', { icon: 'check' }); } catch (e) { toast(String(e.message || e), { icon: 'warn' }); }
  } } });
}

export function openSnapshots() { return openPanel('snapshots', { kind: 'overlay', title: 'Safety copies', live: false, render: draw }); }
async function draw(p) {
  p.setActions(btn('Done', { cls: 'ghost bold', onclick: () => p.close() }));
  p.body.replaceChildren(h('p.dim', 'Loading…'));
  const ok = await snap.available(), list = ok ? await snap.list() : [], info = await snap.storageInfo(), mir = ok ? await snap.mirrorInfo() : null;
  const rows = list.map(s => h('div.card.snap', h('div.grow', h('div.t', s.reason), h('div.s', when(s.at) + ' · ' + plural(s.n, 'resource') + ' · ' + s.kb + ' KB')),
    btn('Go back to this', { cls: 'xs pri', onclick: async () => {
      if (!(await confirmBox({ title: 'Go back to this copy?', text: 'Your data becomes what it was at ' + when(s.at) + '. The data you have now is saved as a new copy first, so you can come back.', ok: 'Go back' }))) return;
      try { await snap.restore(s.id); toast('Restored the copy from ' + when(s.at) + '.', { icon: 'check' }); draw(p); } catch (e) { toast(String(e.message || e), { icon: 'warn' }); }
    } }),
    btn('', { cls: 'xs icon ghost', icon: 'trash', title: 'Delete this copy', onclick: async () => { await snap.remove(s.id); draw(p); } })));
  p.body.replaceChildren(h('div.stack',
    !ok ? h('div.hint.warn', 'This browser does not allow safety copies here (a private window or blocked storage). Download a backup from Profile instead.') : h('div.hint', 'Nexus keeps a copy just before an import, a restore, a reset, a delete or a bulk change. The newest are kept. They live on this phone, next to your data, so they do not replace a downloaded backup.'),
    ok ? btn('Save a copy now', { cls: 'pri', icon: 'check', onclick: async () => { const id = await snap.take('Saved by you', { force: true }); toast(id ? 'Copy saved.' : 'Could not save a copy.', { icon: id ? 'check' : 'warn' }); draw(p); } }) : null,
    list.length ? h('div.list', rows) : (ok ? h('div.empty', h('b', 'No copies yet'), h('p', 'They appear before the next import or bulk change.')) : null),
    ok && mir ? h('p.foot', 'Latest mirror: ' + when(mir.at) + ', ' + plural(mir.n, 'resource') + '. If the main copy is ever lost, Nexus offers this one when it opens.') : null,
    h('div.sec-h', h('h3', 'Storage')),
    h('div.group.pad', storageBlock(info, p))));
}
function storageBlock(info, p) {
  if (!info.supported) return h('p.dim.small', 'This browser does not report storage details.');
  const state = info.persisted === true ? 'Protected: the browser will not clear this site\'s data when space is low.' : (info.persisted === false ? 'Not protected: the browser may clear this site\'s data if the phone runs very low on space.' : 'Unknown.');
  return h('div.stack', { style: { gap: '8px' } }, h('p', state), info.quota ? h('p.dim.small', bytesText(info.usage) + ' used of about ' + bytesText(info.quota) + ' allowed.') : null,
    info.persisted === false ? btn('Ask the browser to protect it', { cls: 'sm', icon: 'lock', onclick: async () => { const ok = await snap.askPersist(); toast(ok ? 'Protected.' : 'The browser said no. Installing the app from the browser menu usually makes it say yes. Keep a downloaded backup either way.', { icon: ok ? 'check' : 'info', ms: 7000 }); draw(p); } }) : null);
}

/** If the page started empty but a safety mirror has data, offer it back. */
export async function offerRecovery() {
  try {
    if (!store.meta.firstRun || !(await snap.available())) return;
    const m = await snap.mirrorInfo(); if (!m || m.n < 1) return;
    if (m.rsig && m.rsig === snap.currentSig()) return;   // it is the same data as now: nothing to bring back
    if (!(await confirmBox({ title: 'Found a saved copy', text: 'This page started with the starter map, but a safety copy from ' + when(m.at) + ' holds ' + plural(m.n, 'resource') + '. Bring it back?', ok: 'Bring it back', cancel: 'No, start fresh' }))) return;
    await snap.restoreMirror(); store.meta.firstRun = false; toast('Your saved copy is back.', { icon: 'check' });
  } catch (e) { /* the safety net never gets in the way */ }
}
app.open.snapshots = openSnapshots;
void getPanel;
