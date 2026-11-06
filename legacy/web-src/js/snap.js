// snap.js - the safety net. Keeps copies of all your data in IndexedDB (a second place, next to the main copy in localStorage):
//  - a snapshot taken just before anything big changes (import, restore, reset, bulk edit, delete), so you can go back
//  - a mirror of the latest data, so a broken or emptied main copy can be recovered
//  - a request to the browser to not delete this site's data when the phone is low on space
// Every function fails quietly: if IndexedDB is not allowed (private window, blocked), Nexus works as before.
import * as store from './store.js';
import { hash32, debounce } from './util.js';

const DB = 'nexus-safety', SNAPS = 'snaps', MIRROR = 'mirror';
export const KEEP_HARD = 5, KEEP_SOFT = 3;
/** Reasons that fire often during normal work. They are kept in a small separate group so they cannot push out an import or restore. */
export const SOFT = { 'Before a bulk change': 120000, 'Before a delete': 60000 };

let dbp = null;
const open = () => dbp || (dbp = new Promise(res => {
  try {
    const q = indexedDB.open(DB, 1);
    q.onupgradeneeded = () => { const d = q.result; d.createObjectStore(SNAPS, { keyPath: 'id', autoIncrement: true }); d.createObjectStore(MIRROR); };
    q.onsuccess = () => res(q.result); q.onerror = () => res(null); q.onblocked = () => res(null);
  } catch (e) { res(null); }
}));
/** Run one request. Resolves with its result, or null when anything fails. */
async function run(name, mode, make) {
  const d = await open(); if (!d) return null;
  return new Promise(res => {
    try { const t = d.transaction(name, mode), req = make(t.objectStore(name)); let out = null; if (req) req.onsuccess = () => { out = req.result === undefined ? true : req.result; }; t.oncomplete = () => res(out === null ? true : out); t.onerror = t.onabort = () => res(null); } catch (e) { res(null); }
  });
}
export const available = async () => !!(await open());

const meta = s => ({ id: s.id, at: s.at, reason: s.reason, n: s.n, kb: s.kb, sig: s.sig });

/** All snapshots, newest first, without the data itself. */
export async function list() {
  const all = await run(SNAPS, 'readonly', s => s.getAll());
  return Array.isArray(all) ? all.map(meta).sort((a, b) => b.at - a.at) : [];
}

/**
 * Keep a copy of everything now. The copy is captured at once (before the next change), saved a moment later.
 * Resolves with the snapshot id, or null if it was skipped or could not be saved.
 */
export async function take(reason, o = {}) {
  let text; try { text = JSON.stringify(store.exportData()); } catch (e) { return null; }   // captured now, before any await
  const n = store.state.resources.length, sig = text.length + ':' + hash32(text), at = Date.now();
  const all = await list();
  if (!o.force) {
    if (all[0] && all[0].sig === sig) return all[0].id;                                      // nothing changed since the last copy
    const gap = SOFT[reason]; if (gap && all.some(s => s.reason === reason && at - s.at < gap)) return null;
  }
  const id = await run(SNAPS, 'readwrite', s => s.add({ at, reason: String(reason || 'Snapshot'), n, kb: Math.round(text.length / 1024), sig, text }));
  if (typeof id !== 'number') return null;
  await prune();
  return id;
}

async function prune() {
  const all = await list(), soft = all.filter(s => SOFT[s.reason]), hard = all.filter(s => !SOFT[s.reason]);
  const drop = [...soft.slice(KEEP_SOFT), ...hard.slice(KEEP_HARD)];
  for (const s of drop) await run(SNAPS, 'readwrite', st => st.delete(s.id));
}

export const get = id => run(SNAPS, 'readonly', s => s.get(id));
export const remove = id => run(SNAPS, 'readwrite', s => s.delete(id));

/** Put a snapshot back. The current data is copied first (the store does that when it is replaced), so going back can be undone too. */
export async function restore(id) {
  const s = await get(id); if (!s || typeof s.text !== 'string') throw new Error('That copy could not be read.');
  const obj = JSON.parse(s.text);
  return store.importBackup(obj, 'replace');
}
/** The newest copy taken for this reason (for the Undo button after an import). */
export async function newestFor(reason) { const all = await list(); return all.find(s => s.reason === reason) || null; }

// ---------- mirror of the latest data ----------
let lastMirror = '';
/** A signature of what is saved (ids, names, links, stages), the same for the live data and for a mirror. Used to tell "the same data" from "different data". */
export const currentSig = () => store.state.resources.length + ':' + hash32(store.state.resources.map(r => r.id + '|' + r.title + '|' + r.url + '|' + r.status).sort().join('\n'));
export async function mirror() {
  let text; try { text = JSON.stringify(store.exportData()); } catch (e) { return false; }
  const sig = text.length + ':' + hash32(text); if (sig === lastMirror) return true;
  const ok = await run(MIRROR, 'readwrite', s => s.put({ at: Date.now(), n: store.state.resources.length, sig, rsig: currentSig(), text }, 'latest'));
  if (ok) lastMirror = sig;
  return !!ok;
}
/** What the mirror holds, or null. */
export async function mirrorInfo() { const m = await run(MIRROR, 'readonly', s => s.get('latest')); return m && typeof m.text === 'string' ? { at: m.at, n: m.n, rsig: m.rsig || '' } : null; }
export async function restoreMirror() {
  const m = await run(MIRROR, 'readonly', s => s.get('latest')); if (!m || typeof m.text !== 'string') throw new Error('No saved copy found.');
  return store.importBackup(JSON.parse(m.text), 'replace');
}

// ---------- storage protection ----------
export async function storageInfo() {
  const out = { supported: !!(typeof navigator !== 'undefined' && navigator.storage), persisted: null, usage: 0, quota: 0 };
  try {
    if (navigator.storage.persisted) out.persisted = await navigator.storage.persisted();
    if (navigator.storage.estimate) { const e = await navigator.storage.estimate(); out.usage = e.usage || 0; out.quota = e.quota || 0; }
  } catch (e) { /* not available */ }
  return out;
}
/** Ask the browser to keep this site's data even when space is low. It may say no, and it never asks you a question in Chrome. */
export async function askPersist() { try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* no */ } return false; }

let started = false;
/** Wire the safety net to the store. Call once at start. */
export function start() {
  if (started) return; started = true;
  // A page that just started from the starter map must not overwrite a real mirror: it only starts mirroring once you change something.
  let armed = !store.meta.firstRun;
  store.on('change', () => { armed = true; });
  store.on('before-bulk', reason => { take(reason); });
  store.on('saved', debounce(() => { if (armed) mirror(); }, 2500));
  setTimeout(async () => { try { if (navigator.storage && navigator.storage.persisted && !(await navigator.storage.persisted())) await askPersist(); } catch (e) { /* ignore */ } if (armed) mirror(); }, 3000);
}
