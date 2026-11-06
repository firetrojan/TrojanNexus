// ui/watch.js - "tell me when this page changes". Checks run only when you tap Check, and need the internet.
// It compares the page's title, description and headings (see ../watch.js). It cannot see changes lower down a page.
import { h, fmtDate, plural } from '../util.js';
import * as store from '../store.js';
import * as sfx from '../sfx.js';
import { fetchPage, runBatch, skipReason, igHandle, errorText } from '../lookup.js';
import { fingerprint, usable } from '../watch.js';
import { app } from './app.js';
import { webSettings, webStatus, paceFor } from './scan.js';
import { btn, toast } from './kit.js';

/** Can this resource be watched at all? Returns '' when yes, or the reason. */
export function whyNot(r) {
  if (!r.url) return 'It has no link.';
  if (igHandle(r.url) || r.src === 'following') return 'Instagram shows a visitor too little to compare.';
  const s = skipReason(r.url, webSettings()); return s ? 'Not checked: ' + s + '.' : '';
}

async function lookup(item, settings, o) {
  const f = await fetchPage(item.url, settings, o);
  if (!f.ok) return { ok: false, error: f.error };
  const fp = fingerprint(f.page, f.via);
  return usable(fp) ? { ok: true, result: { fp } } : { ok: false, error: { code: 'empty', msg: '' } };
}

let running = false;
/** Check these resources (only the watched ones). Returns { done, baseline, same, changed:[ids], unreadable, failed, paused } or null if it could not start. */
export async function checkWatch(ids, o = {}) {
  if (running) { toast('A check is already running.', { icon: 'info' }); return null; }
  const st = webStatus(); if (!st.ok) { toast(st.text, { icon: 'info', ms: 5200 }); return null; }
  const settings = webSettings();
  const items = ids.map(store.byId).filter(r => r && r.watch && r.watch.on && !whyNot(r));
  if (!items.length) { toast('Nothing here can be checked.', { icon: 'info' }); return null; }
  const out = { done: 0, baseline: 0, same: 0, changed: [], unreadable: 0, failed: 0, reasons: {}, paused: '' };
  running = true;
  try {
    const sum = await runBatch(items, { settings, concurrency: 1, spacing: items.length > 1 ? paceFor(settings) : 0, lookup, onProgress: p => { if (o.onProgress) o.onProgress(p); },
      onItem: (item, res) => {
        if (res.ok) { const k = store.recordWatch(item.id, res.result.fp); out.done++; if (k === 'baseline') out.baseline++; else if (k === 'changed') out.changed.push(item.id); else out.same++; }
        else if (res.error && res.error.code === 'empty') { store.recordWatch(item.id, { t: '', d: '', h: [], via: '' }); out.done++; out.unreadable++; }
        else { out.failed++; const c = res.error ? errorText(res.error) : 'Could not check.'; out.reasons[c] = (out.reasons[c] || 0) + 1; }
      } });
    out.paused = sum.paused || '';
  } finally { running = false; }
  const bits = [];
  if (out.changed.length) bits.push(plural(out.changed.length, 'page') + ' changed');
  if (out.same) bits.push(out.same + ' the same');
  if (out.baseline) bits.push(out.baseline + ' saved as a starting point');
  if (out.unreadable) bits.push(out.unreadable + ' could not be read (built by scripts?)');
  if (out.failed) bits.push(out.failed + ' failed: ' + Object.keys(out.reasons).slice(0, 1).join(''));
  toast((items.length === 1 ? '' : 'Checked ' + plural(out.done + out.failed, 'page') + ': ') + (bits.join(', ') || 'nothing to report') + '.', { icon: out.changed.length ? 'alert' : 'check', ms: 7000 });
  sfx.feel(out.changed.length ? 'open' : 'ok');
  return out;
}

const busy = new Set();
/** The block on the detail card. */
export function watchSection(r) {
  const why = whyNot(r); if (why && !r.watch) return null;   // nothing to offer for a link that cannot be watched
  const w = r.watch, body = [];
  const run = async () => { if (busy.has(r.id)) return; busy.add(r.id); redraw(); try { await checkWatch([r.id]); } finally { busy.delete(r.id); redraw(); } };
  const redraw = () => { if (app.open.detailRedraw) app.open.detailRedraw(); };
  if (!w) {
    body.push(h('p.dim', 'Nexus can tell you when this page changes its title, description or headings. It checks only when you tap Check, and it needs the internet.'));
    body.push(h('div.chips', btn('Start watching', { cls: 'sm pri', icon: 'eye', onclick: async () => { store.setWatch(r.id, true); if (webStatus().ok) run(); else toast('Watching. The first check needs the internet.', { icon: 'info', ms: 5000 }); } })));
  } else {
    const line = !w.fp ? 'No starting point yet. Tap Check now to save one.' : (w.changed ? 'Changed on ' + fmtDate(w.changed) + '.' : 'Last checked ' + (w.at ? fmtDate(w.at) : 'never') + '. Nothing changed.');
    body.push(h('p', line));
    if (w.changed && w.what.length) body.push(h('ul.d-list', w.what.map(x => h('li', x))));
    if (why) body.push(h('p.dim.small', why));
    body.push(h('div.chips', btn(busy.has(r.id) ? 'Checking…' : 'Check now', { cls: 'sm pri', icon: 'signal', disabled: busy.has(r.id) || !!why, onclick: run }),
      w.changed ? btn('Mark as seen', { cls: 'sm', icon: 'check', onclick: () => { store.markWatchSeen(r.id); sfx.feel('ok'); } }) : null,
      btn('Stop watching', { cls: 'sm', icon: 'close', onclick: () => { store.setWatch(r.id, false); toast('Stopped watching.', { icon: 'info' }); } })));
  }
  body.push(h('p.dim.small', 'It cannot see changes lower down the page, and pages built by scripts may look empty. Numbers and dates are ignored so a changing counter does not count.'));
  return h('section.d-sec', h('div.sec-h', h('h3', 'Watch for changes')), h('div.group.pad', body));
}
app.open.checkWatch = checkWatch;
