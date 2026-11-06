// import.test.mjs - file import: bookmarks (HTML, Firefox, Chrome), Instagram (JSON, HTML, ZIP), CSV, OPML, link files.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const S = new URL('../src/js/', import.meta.url).pathname, F = new URL('./fixtures/', import.meta.url).pathname;
const im = await import(S + 'importers.js'), zip = await import(S + 'zip.js');
const rd = f => fs.readFileSync(F + f, 'utf8');
const REAL = '/mnt/user-data/uploads/';

test('Instagram following.json: both layouts, deleted accounts, duplicates', () => {
  const r = im.readSource('following.json', rd('following.json'));
  assert.equal(r.kind, 'instagram'); assert.equal(r.igKind, 'following'); assert.equal(r.skip, false);
  assert.deepEqual(r.entries.map(e => e.title), ['@nasa', '@natgeo', '@yoga.with.adriene']);
  assert.equal(r.skipped.deleted, 1);
  assert.equal(r.entries[0].url, 'https://www.instagram.com/nasa/'); assert.equal(r.entries[0].src, 'following'); assert.equal(r.entries[0].type, 'feed');
  assert.match(r.entries[0].added, /^20\d\d-\d\d-\d\d$/);
});
test('Instagram followers and blocked lists are recognised and NOT imported', () => {
  const a = im.readSource('followers_1.json', rd('followers_1.json'));
  assert.equal(a.skip, true); assert.equal(a.igKind, 'followers'); assert.equal(a.entries.length, 0); assert.match(a.note, /not your following list/);
  const b = im.readSource('blocked_profiles.json', rd('blocked_profiles.json'));
  assert.equal(b.skip, true); assert.equal(b.igKind, 'blocked'); assert.equal(b.entries.length, 0);
  // a bare array with a following file name is still following
  assert.equal(im.readSource('following.json', rd('followers_1.json')).skip, false);
});
test('Instagram following.html: the real export file', { skip: !fs.existsSync(REAL + 'following.html') }, () => {
  const r = im.readSource('following.html', fs.readFileSync(REAL + 'following.html', 'utf8'));
  assert.equal(r.kind, 'instagram'); assert.equal(r.igKind, 'following'); assert.equal(r.skip, false);
  assert.ok(r.entries.length >= 140 && r.entries.length <= 156, 'count ' + r.entries.length);
  assert.ok(r.entries.every(e => /^@[A-Za-z0-9._]+$/.test(e.title)));
  assert.ok(r.entries.some(e => e.title === '@nobelprize' && e.added === '2026-10-11'));
});
test('Instagram followers.html is skipped by its heading', () => {
  const html = '<html><body><h1>Followers</h1><main><div><h2>abc</h2><div><a href="https://www.instagram.com/_u/abc">x</a><div>Oct 1, 2026 1:00 am</div></div></div></main></body></html>';
  const r = im.readSource('followers_1.html', html); assert.equal(r.skip, true); assert.equal(r.igKind, 'followers');
});
test('Bookmarks: Netscape HTML with folders, tags, notes, quotes, bad links', () => {
  const r = im.readSource('bookmarks.html', rd('netscape.html'));
  assert.equal(r.kind, 'bookmarks'); assert.equal(r.entries.length, 2);
  const m = r.entries.find(e => e.url === 'https://music.example/');
  assert.equal(m.title, 'Music & More'); assert.equal(m.folder, 'Music'); assert.deepEqual(m.tags, ['a', 'b']); assert.equal(m.notes, 'my note here'); assert.equal(m.added, '2023-11-14');
  assert.equal(r.entries.find(e => e.url === 'https://top.example/').folder, '');
});
test('Bookmarks: the real Chrome export keeps its folders', { skip: !fs.existsSync(REAL + 'bookmarks.html') }, () => {
  const r = im.readSource('bookmarks.html', fs.readFileSync(REAL + 'bookmarks.html', 'utf8'));
  assert.equal(r.kind, 'bookmarks'); assert.equal(r.entries.length, 170);
  assert.ok(r.entries.some(e => e.folder === 'Learning')); assert.ok(r.entries.every(e => !/^bookmarks bar/i.test(e.folder)));
});
test('Bookmarks: Firefox JSON and Chrome Bookmarks file', () => {
  const f = im.readSource('bookmarks-2026.json', rd('firefox.json'));
  assert.equal(f.kind, 'bookmarks-json'); assert.equal(f.entries.length, 2);
  const k = f.entries.find(e => /khanacademy/.test(e.url)); assert.equal(k.folder, 'Learning'); assert.deepEqual(k.tags, ['math', 'study']); assert.equal(k.added, '2023-11-14');
  const c = im.readSource('Bookmarks', rd('chrome-Bookmarks'));
  assert.equal(c.kind, 'bookmarks-json'); assert.equal(c.entries.length, 2);
  assert.equal(c.entries.find(e => /CyberChef/.test(e.url)).folder, 'Tools'); assert.match(c.entries[0].added, /^20\d\d-/);
});
test('CSV: Raindrop (quotes, line breaks, tags), Pocket, and a headerless list', () => {
  const r = im.readSource('raindrop.csv', rd('raindrop.csv'));
  assert.equal(r.kind, 'csv'); assert.equal(r.entries.length, 2);
  const a = r.entries[0]; assert.equal(a.title, 'Cool, tool'); assert.equal(a.folder, 'Dev/Tools'); assert.deepEqual(a.tags, ['x', 'y']); assert.match(a.notes, /my "own" note\nline two/); assert.equal(a.added, '2025-03-01');
  const p = im.readSource('pocket.csv', rd('pocket.csv')); assert.equal(p.entries.length, 1); assert.equal(p.entries[0].added, '2023-11-14'); assert.deepEqual(p.entries[0].tags, ['reading']);
  const h = im.readSource('list.csv', 'Name;Where\nFoo;https://foo.example/a\nBar;https://bar.example/b\n'); assert.equal(h.entries.length, 2); assert.equal(h.entries[0].title, 'Foo');
  assert.equal(im.readSource('x.csv', 'a,b\n1,2\n').entries.length, 0);
});
test('Pinboard JSON, OPML, link files, Pocket HTML', () => {
  const p = im.readSource('pinboard.json', rd('pinboard.json')); assert.equal(p.kind, 'json-list');
  assert.equal(p.entries[0].title, 'Pin A'); assert.equal(p.entries[0].notes, 'why'); assert.deepEqual(p.entries[0].tags, ['alpha', 'beta']); assert.equal(p.entries[0].added, '2025-01-02');
  const o = im.readSource('feeds.opml', rd('feeds.opml')); assert.equal(o.kind, 'opml'); assert.equal(o.entries.length, 2);
  assert.equal(o.entries[0].url, 'https://www.bbc.co.uk/news'); assert.equal(o.entries[0].rssUrl, 'https://feeds.bbci.co.uk/news/rss.xml'); assert.equal(o.entries[0].type, 'feed'); assert.equal(o.entries[0].folder, 'News');
  assert.equal(o.entries[1].url, 'https://blog.example/feed.xml');
  const s = im.readSource('My site.url', rd('site.url')); assert.equal(s.entries[0].url, 'https://shortcut.example/page'); assert.equal(s.entries[0].title, 'My site');
  const k = im.readSource('ril_export.html', rd('pocket.html')); assert.equal(k.kind, 'links-html'); assert.equal(k.entries.length, 2); assert.deepEqual(k.entries[0].tags, ['x', 'y']);
});
test('Plain text, junk and backups', () => {
  const t = im.readSource('', 'Cool | https://cool.example/a\nhttps://b.example'); assert.equal(t.kind, 'urls'); assert.equal(t.entries.length, 2);
  assert.equal(im.readSource('x.txt', 'hello world').skip, true);
  assert.equal(im.readSource('b.json', '{"resources":[],"jobs":[]}').backup, true);
  assert.equal(im.readSource('x.json', '[oops').kind, 'json-broken');
  assert.equal(im.readSource('x.json', '{"a":1}').skip, true);
  assert.equal(im.readSource('', '   ').kind, 'empty');
  assert.equal(im.parseAny('https://www.youtube.com/@x').entries[0].type, 'youtube-channel');
});
test('ZIP: finds following.json inside an Instagram download without reading the photos', async () => {
  for (const [file, want] of [['instagram-export.zip', 'following.json'], ['stored.zip', 'following.html']]) {
    const buf = fs.readFileSync(F + file);
    const read = async (a, n) => new Uint8Array(buf.subarray(a, a + n));
    const list = await zip.listZip(read, buf.length);
    assert.ok(list.length >= 1);
    const hit = list.find(e => zip.IG_FOLLOWING.test(e.name)); assert.ok(hit, 'no following file in ' + file); assert.ok(hit.name.endsWith(want));
    const text = await zip.readZipText(read, hit);
    const r = im.readSource(hit.name, text); assert.equal(r.igKind, 'following'); assert.ok(r.entries.length >= 3);
  }
  const buf = fs.readFileSync(F + 'instagram-export.zip'), read = async (a, n) => new Uint8Array(buf.subarray(a, a + n));
  const list = await zip.listZip(read, buf.length); assert.equal(list.filter(e => zip.isUsable(e.name)).length, 4);   // 3 connection files + stories.json; the jpg is ignored
  await assert.rejects(() => zip.listZip(async () => new Uint8Array(100), 100), /not a ZIP/);
});
