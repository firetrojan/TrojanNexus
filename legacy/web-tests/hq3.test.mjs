// hq3.test.mjs - same-site flags and the memory of deleted links. Pure logic and store behaviour, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
const S = new URL('../src/js/', import.meta.url).pathname;
const D = await import(S + 'dupes.js'), st = await import(S + 'store.js'), U = await import(S + 'util.js');
const fresh = () => { st.state.resources = []; st.state.jobs = []; st.state.threads = []; st.load({ resources: [], jobs: [], threads: [] }); st.state.settings.deletedKeys = []; };
const add = (url, extra = {}) => st.addResource({ title: extra.title || url, url, ...extra });

test('siteKey: ordinary sites are the registrable domain, so sub-domains and www match', () => {
  assert.equal(D.siteKey('https://www.example.com/a/b?x=1#top'), 'example.com');
  assert.equal(D.siteKey('https://docs.example.com/guide'), 'example.com');
  assert.equal(D.siteKey('http://Example.COM'), 'example.com');
  assert.equal(D.siteKey('https://shop.example.co.uk/x'), 'example.co.uk');
  assert.equal(D.siteKey('not a url'), ''); assert.equal(D.siteKey('mailto:a@b.com'), ''); assert.equal(D.siteKey(''), '');
});
test('siteKey: shared platforms use the owner, so two different people never match', () => {
  assert.equal(D.siteKey('https://github.com/alice/tool-a'), 'github.com/alice');
  assert.equal(D.siteKey('https://github.com/alice/tool-b/issues'), 'github.com/alice');
  assert.notEqual(D.siteKey('https://github.com/bob/tool-a'), D.siteKey('https://github.com/alice/tool-a'));
  assert.equal(D.siteKey('https://github.com/'), '');
  assert.equal(D.siteKey('https://www.youtube.com/@nasa/videos'), 'youtube.com/@nasa');
  assert.equal(D.siteKey('https://m.youtube.com/channel/UC123/about'), 'youtube.com/channel/uc123');
  assert.equal(D.siteKey('https://www.youtube.com/watch?v=abc'), '', 'a single video says nothing about the channel');
  assert.equal(D.siteKey('https://youtu.be/abc'), '');
  assert.equal(D.siteKey('https://www.reddit.com/r/space/comments/1'), 'reddit.com/r/space');
  assert.equal(D.siteKey('https://www.linkedin.com/in/jane/'), 'linkedin.com/in/jane');
  assert.equal(D.siteKey('https://huggingface.co/spaces/acme/demo'), 'huggingface.co/acme');
  assert.equal(D.siteKey('https://x.com/nasa/status/1'), 'x.com/nasa');
});
test('siteKey: sites where every page is a different thing, and one-sub-domain-per-person hosts', () => {
  assert.equal(D.siteKey('https://en.wikipedia.org/wiki/Mars'), '');
  assert.equal(D.siteKey('https://docs.google.com/document/d/1'), '');
  assert.equal(D.siteKey('https://stackoverflow.com/q/1'), '');
  assert.equal(D.siteKey('https://alice.github.io/notes'), 'alice.github.io');
  assert.notEqual(D.siteKey('https://alice.github.io/'), D.siteKey('https://bob.github.io/'));
  assert.equal(D.siteKey('https://my-app.vercel.app/x'), 'my-app.vercel.app');
});
test('sameSite: finds other pages of the same site, marks the very same address, ignores the Instagram follow list', () => {
  fresh();
  const a = add('https://example.com/tools/pdf', { title: 'PDF tool' }), b = add('https://www.example.com/blog', { title: 'Blog' });
  const c = add('https://other.org/x', { title: 'Other' }), g1 = add('https://github.com/alice/a'), g2 = add('https://github.com/bob/a');
  const ig = add('https://www.instagram.com/nasa/', { src: 'following' });
  const idx = D.siteIndex(st.state.resources);
  assert.deepEqual(D.sameSite(a, idx).map(x => x.r.title), ['Blog']);
  assert.deepEqual(D.sameSite(c, idx), []);
  assert.deepEqual(D.sameSite(g1, idx), []); assert.deepEqual(D.sameSite(g2, idx), []);
  assert.deepEqual(D.sameSite(ig, idx), []);
  const d = add('https://example.com/tools/pdf/', { title: 'PDF tool again' });
  assert.equal(D.sameSite(d, D.siteIndex(st.state.resources)).find(x => x.r.id === a.id).same, true);
});
test('flagEntries: new links on a site you already have, and new links that share a site with each other', () => {
  fresh();
  add('https://example.com/tools/pdf', { title: 'PDF tool' }); add('https://github.com/alice/a', { title: 'Alice A' });
  const entries = [
    { url: 'https://example.com/tools/ocr', title: 'OCR tool' },
    { url: 'https://github.com/alice/b', title: 'Alice B' },
    { url: 'https://github.com/bob/b', title: 'Bob B' },
    { url: 'https://news.test/a', title: 'News A' }, { url: 'https://news.test/b', title: 'News B' },
    { url: 'https://www.instagram.com/nasa/', title: '@nasa', src: 'following' },
    { url: 'https://www.instagram.com/esa/', title: '@esa', src: 'following' }
  ];
  const f = D.flagEntries(entries, st.state.resources);
  assert.deepEqual(f.map(x => x.entry.title), ['OCR tool', 'Alice B', 'News A', 'News B']);
  assert.deepEqual(f[0].others, [{ title: 'PDF tool', url: 'https://example.com/tools/pdf', saved: true }]);
  assert.equal(f[1].others[0].saved, true);
  assert.deepEqual(f[2].others, [{ title: 'News B', url: 'https://news.test/b', saved: false }]);
  assert.equal(f.filter(x => x.others.some(o => o.saved)).length, 2, 'only two of them sit on a site you already saved');
});
test('shortUrl: no protocol, no www, no query, cut with an ellipsis', () => {
  assert.equal(U.shortUrl('https://www.example.com/a/b/?x=1#y'), 'example.com/a/b');
  assert.equal(U.shortUrl('https://example.com/' + 'x'.repeat(80), 20).length, 20);
  assert.equal(U.shortUrl(''), '');
});

test('deleted links are remembered, so a new import can skip them', () => {
  fresh();
  const r = add('https://www.example.com/page/?utm_source=x', { title: 'Page' });
  assert.equal(st.wasDeleted('https://example.com/page'), false);
  assert.equal(st.deleteResource(r.id), true);
  assert.equal(st.wasDeleted('https://example.com/page'), true, 'tracking bits and www are ignored, as for duplicates');
  assert.equal(st.wasDeleted('https://example.com/other'), false);
  assert.equal(st.deletedCount(), 1);
});
test('adding a link on purpose makes it no longer "deleted"; locked items are neither deleted nor remembered', () => {
  fresh();
  const r = add('https://example.com/a'); st.deleteResource(r.id); assert.equal(st.wasDeleted('https://example.com/a'), true);
  add('https://example.com/a'); assert.equal(st.wasDeleted('https://example.com/a'), false);
  const l = add('https://example.com/locked'); st.setLocked(l.id, true);
  assert.equal(st.deleteResource(l.id), false); assert.equal(st.wasDeleted('https://example.com/locked'), false);
  const m = add('https://example.com/m'); st.addMany([{ title: 'again', url: 'https://example.com/z' }]);
  st.deleteResource(m.id); assert.equal(st.wasDeleted('https://example.com/m'), true);
  st.addMany([{ title: 'm again', url: 'https://example.com/m' }]); assert.equal(st.wasDeleted('https://example.com/m'), false);
});
test('deleteMany: one safety copy, locked stay, links remembered, nothing left pointing at them', () => {
  fresh();
  const a = add('https://a.test/1'), b = add('https://b.test/1'), c = add('https://c.test/1'), job = st.addJob({ name: 'J' });
  st.addToJob(job.id, a.id); st.addToJob(job.id, b.id); st.link(a.id, c.id); st.setLocked(c.id, true);
  let copies = 0; const off = st.on('before-bulk', () => { copies++; });
  const o = st.deleteMany([a.id, b.id, c.id, 'nope']);
  off();
  assert.deepEqual(o, { deleted: 2, skipped: 1 }); assert.equal(copies, 1);
  assert.deepEqual(st.state.resources.map(r => r.id), [c.id]);
  assert.deepEqual(st.byId(c.id).related, []); assert.deepEqual(st.jobById(job.id).members, []);
  assert.equal(st.wasDeleted('https://a.test/1'), true); assert.equal(st.wasDeleted('https://c.test/1'), false);
  assert.deepEqual(st.deleteMany([]), { deleted: 0, skipped: 0 });
});
test('the deleted list survives a reload and is capped', () => {
  fresh();
  for (let i = 0; i < 5; i++) { const r = add('https://keep.test/' + i); st.deleteResource(r.id); }
  st.save(true);
  const raw = JSON.parse(localStorage.getItem(st.STORAGE_KEY)); assert.equal(raw.settings.deletedKeys.length, 5);
  st.load(); assert.equal(st.deletedCount(), 5); assert.equal(st.wasDeleted('https://keep.test/3'), true);
  st.state.settings.deletedKeys = Array.from({ length: 3500 }, (_, i) => 'k' + i); st.save(true); st.load();
  assert.equal(st.deletedCount(), 3000); assert.equal(st.wasDeleted('https://x.test'), false);
  st.clearDeleted(); assert.equal(st.deletedCount(), 0);
});
