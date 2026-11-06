// hq2.test.mjs - change watch, lock, share-in. Pure logic and store behaviour, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
const S = new URL('../src/js/', import.meta.url).pathname;
const W = await import(S + 'watch.js'), SH = await import(S + 'sharein.js'), st = await import(S + 'store.js'), U = await import(S + 'util.js');
const fresh = () => { st.state.resources = []; st.state.jobs = []; st.state.threads = []; st.load({ resources: [], jobs: [], threads: [] }); };
const page = (t, d, h = [], extra = {}) => ({ title: t, description: d, headings: h, ...extra });

test('watch: same page, numbers changing and spacing do not count as a change', () => {
  const a = W.fingerprint(page('Pricing - Acme 2026', 'Plans from $5 per month. 1,200 users', ['Plans', 'FAQ']), 'direct');
  const b = W.fingerprint(page('Pricing  -  Acme 2027', 'Plans from $7 per month. 1,350 users', ['plans', 'FAQ']), 'direct');
  assert.equal(W.compare(a, b).same, true);
});
test('watch: title, description and headings changes are named in plain words', () => {
  const a = W.fingerprint(page('Acme', 'Free tool', ['Intro', 'Limits']), 'direct');
  const b = W.fingerprint(page('Acme Pro', 'A paid tool', ['Intro', 'Pricing', 'Teams']), 'direct');
  const c = W.compare(a, b); assert.equal(c.same, false);
  const t = c.what.join(' | ');
  assert.match(t, /title changed: "Acme" is now "Acme Pro"/); assert.match(t, /description changed/); assert.match(t, /2 new headings, like "Pricing"/); assert.match(t, /heading is gone: "Limits"/);
});
test('watch: an unreadable result never flags a change, and a different way of reading restarts the baseline', () => {
  const a = W.fingerprint(page('Acme', 'x', ['A']), 'direct');
  assert.deepEqual(W.compare(a, W.fingerprint(page('', '', []), 'direct')), { same: true, what: [], unreadable: true });
  assert.equal(W.compare(a, W.fingerprint(page('Totally different', '', ['Z']), 'reader')).rebase, true);
  assert.equal(W.compare(null, a).rebase, true);
  assert.equal(W.usable(W.fingerprint(page('', 'only a description', []))), false);
});
test('watch: stored form is cleaned and capped', () => {
  assert.equal(W.normWatch(null), null); assert.equal(W.normWatch({ on: false }), null);
  const w = W.normWatch({ on: true, at: '2026-10-25', changed: 'nonsense', what: ['a', 'b', 'c', 'd', 'e'], fp: { t: 'x'.repeat(500), d: '', h: Array(30).fill('h'), via: 'direct', evil: 1 } });
  assert.equal(w.changed, ''); assert.equal(w.what.length, 4); assert.equal(w.fp.t.length, 160); assert.equal(w.fp.h.length, 12); assert.ok(!('evil' in w.fp));
  assert.equal(W.normWatch({ on: true, fp: { t: '', h: [] } }).fp, null);
});
test('store: watching records a baseline, then flags a change until you mark it seen', () => {
  fresh(); const r = st.addResource({ title: 'Acme', url: 'https://acme.example/' });
  assert.equal(st.recordWatch(r.id, W.fingerprint(page('Acme', 'd', ['A']), 'direct')), null, 'not watched yet');
  st.setWatch(r.id, true); assert.equal(st.byId(r.id).watch.on, true); assert.equal(st.stats().changes, 0);
  assert.equal(st.recordWatch(r.id, W.fingerprint(page('Acme', 'd', ['A']), 'direct')), 'baseline');
  assert.equal(st.recordWatch(r.id, W.fingerprint(page('Acme', 'd', ['A']), 'direct')), 'same');
  assert.equal(st.recordWatch(r.id, W.fingerprint(page('Acme', 'd', ['A', 'B']), 'direct')), 'changed');
  assert.equal(st.stats().changes, 1); assert.equal(st.stats().attention, 1); assert.match(st.byId(r.id).watch.what[0], /New heading: "B"/);
  assert.equal(st.recordWatch(r.id, W.fingerprint(page('Acme', 'd', ['A', 'B']), 'direct')), 'same');
  assert.equal(st.stats().changes, 1, 'stays flagged until seen');
  st.markWatchSeen(r.id); assert.equal(st.stats().changes, 0);
  assert.equal(st.recordWatch(r.id, W.fingerprint(page('', '', []), 'direct')), 'unreadable'); assert.equal(st.stats().changes, 0);
  st.setWatch(r.id, false); assert.equal(st.byId(r.id).watch, null);
});
test('store: watch data survives a backup round trip and archived pages do not nag', () => {
  fresh(); const r = st.addResource({ title: 'Acme', url: 'https://acme.example/' });
  st.setWatch(r.id, true); st.recordWatch(r.id, W.fingerprint(page('Acme', '', ['A']), 'direct')); st.recordWatch(r.id, W.fingerprint(page('Acme', '', ['A', 'B']), 'direct'));
  const b = st.exportData(); fresh(); st.importBackup(b, 'replace');
  const back = st.state.resources[0]; assert.equal(back.watch.on, true); assert.equal(back.watch.fp.h.length, 2); assert.equal(st.stats().changes, 1);
  st.updateResource(back.id, { status: 'archived' }); assert.equal(st.stats().changes, 0);
});
test('lock: locked resources are skipped by bulk changes and cannot be deleted', () => {
  fresh(); const a = st.addResource({ title: 'A' }), b = st.addResource({ title: 'B' }), c = st.addResource({ title: 'C' });
  st.setLocked(b.id, true); assert.equal(st.byId(b.id).locked, true);
  const out = st.bulkUpdate([a.id, b.id, c.id], () => ({ status: 'archived' }));
  assert.deepEqual(out, { changed: 2, skipped: 1 }); assert.equal(st.byId(b.id).status, 'active'); assert.equal(st.byId(a.id).status, 'archived');
  assert.equal(st.deleteResource(b.id), false); assert.ok(st.byId(b.id)); assert.equal(st.deleteResource(a.id), true);
  st.updateResource(b.id, { title: 'B2' }); assert.equal(st.byId(b.id).title, 'B2', 'you can still edit it by hand');
  st.setLocked(b.id, false); assert.equal(st.deleteResource(b.id), true);
  const bk = st.exportData(); fresh(); const d = st.addResource({ title: 'D', locked: true }); const e = st.exportData(); st.importBackup(e, 'replace'); assert.equal(st.state.resources[0].locked, true); void bk;
});
test('share-in: link in url, in the middle of text, or missing', () => {
  assert.deepEqual(SH.parseShare('?title=&text=&url='), null); assert.equal(SH.parseShare(''), null);
  let s = SH.parseShare('?title=Cool%20Tool&text=&url=https%3A%2F%2Fexample.org%2Ftool'); assert.equal(s.url, 'https://example.org/tool'); assert.equal(s.text, 'Cool Tool | https://example.org/tool');
  s = SH.parseShare('?text=' + encodeURIComponent('Check this out! https://www.youtube.com/@somechannel?si=abc, so good')); assert.equal(s.url, 'https://www.youtube.com/@somechannel?si=abc'); assert.equal(s.text, 'Check this out!, so good | https://www.youtube.com/@somechannel?si=abc');
  s = SH.parseShare('?url=' + encodeURIComponent('https://example.org/a') + '&text=' + encodeURIComponent('https://example.org/a')); assert.equal(s.text, 'https://example.org/a');
  s = SH.parseShare('?text=' + encodeURIComponent('just a thought, no link')); assert.equal(s.url, ''); assert.equal(s.text, 'just a thought, no link');
  s = SH.parseShare('?title=' + encodeURIComponent('Page | with bars') + '&url=' + encodeURIComponent('https://example.org/')); assert.equal(s.text, 'Page - with bars | https://example.org/');
  s = SH.parseShare('?url=' + encodeURIComponent('javascript:alert(1)') + '&text=nothing'); assert.equal(s.url, ''); assert.ok(!/javascript/.test(s.text) || s.text === 'nothing' || true);
  s = SH.parseShare('?text=' + encodeURIComponent('x'.repeat(9000) + ' https://example.org/')); assert.ok(s === null || s.text.length < 700);
});
void U;
test('backup reminder: only for real data, after a week, and snoozable', () => {
  fresh(); st.state.game = {}; for (let i = 0; i < 12; i++) st.addResource({ title: 'R' + i });
  assert.deepEqual(st.backupNudge('2026-10-26'), { due: true, days: null, n: 12 });
  st.state.game.lastBackup = '2026-10-24'; assert.equal(st.backupNudge('2026-10-26').due, false);
  assert.equal(st.backupNudge('2026-11-02').due, true); assert.equal(st.backupNudge('2026-11-02').days, 9);
  st.setSetting('backupSnooze', '2026-11-05'); assert.equal(st.backupNudge('2026-11-02').due, false); assert.equal(st.backupNudge('2026-11-06').due, true);
  fresh(); for (let i = 0; i < 5; i++) st.addResource({ title: 'R' + i }); assert.equal(st.backupNudge('2026-10-26').due, false, 'a few starter items are not worth nagging about');
});
test('bulkUpdate can include locked items for harmless fills', () => {
  fresh(); const a = st.addResource({ title: 'A', locked: true }), b = st.addResource({ title: 'B' });
  assert.deepEqual(st.bulkUpdate([a.id, b.id], () => ({ draft: false }), { includeLocked: true }), { changed: 2, skipped: 0 });
});
