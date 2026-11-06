import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const S = new URL('../src/js/', import.meta.url).pathname;
const U = await import(S + 'util.js'), st = await import(S + 'store.js'), se = await import(S + 'search.js');
const im = await import(S + 'importers.js'), gm = await import(S + 'game.js');
const today = U.todayISO();

test('load empty seed, add / edit / delete resource', () => {
  mem.clear(); st.load({ resources: [], jobs: [], threads: [] });
  assert.equal(st.state.resources.length, 0);
  const j = st.addJob({ name: 'Slides' });
  const r = st.addResource({ title: 'Deck Maker', url: 'https://deck.example/', type: 'web-tool', tags: 'slides, pdf', capabilities: 'turns PDF into slides;makes charts', useWhen: ['I need a quick visual for a presentation'] }, [j.id]);
  assert.equal(r.tags.length, 2); assert.equal(r.capabilities.length, 2); assert.equal(st.jobsOf(r.id)[0].id, j.id);
  st.updateResource(r.id, { title: 'Deck Maker Pro', notes: 'fast' });
  assert.equal(st.byId(r.id).title, 'Deck Maker Pro');
  assert.equal(st.deleteResource(r.id), true);
  assert.equal(st.byId(r.id), null); assert.equal(st.jobById(j.id).members.length, 0);
});

test('check cadence: nextCheck recomputes, snooze, due buckets', () => {
  const r = st.addResource({ title: 'Feed', url: 'https://f.example/', checkCadence: 'weekly' });
  assert.equal(r.nextCheck, today); assert.equal(st.dueBucket(r), 'today');
  st.markChecked(r.id);
  assert.equal(r.lastChecked, today); assert.equal(r.nextCheck, U.addDays(today, 7)); assert.equal(st.dueBucket(r), 'upcoming');
  st.updateResource(r.id, { checkCadence: 'daily' }); assert.equal(r.nextCheck, U.addDays(today, 1));
  st.updateResource(r.id, { checkCadence: 'monthly' }); assert.equal(r.nextCheck, U.addDays(today, 30)); assert.equal(st.dueBucket(r), null);
  r.nextCheck = U.addDays(today, -3); assert.equal(st.dueBucket(r), 'overdue');
  st.snooze(r.id, 7); assert.equal(r.nextCheck, U.addDays(today, 7));
  st.updateResource(r.id, { checkCadence: 'none' }); assert.equal(r.nextCheck, ''); assert.equal(st.dueBucket(r), null);
});

test('stale rules', () => {
  const old = U.addDays(today, -40);
  const a = st.normalizeResource({ title: 'a', url: 'https://a.example', createdAt: old });
  assert.equal(st.staleInfo(a).reasons[0].kind, 'never');
  const b = st.normalizeResource({ title: 'b', url: 'https://b.example', createdAt: old, lastChecked: U.addDays(today, -2) });
  assert.equal(st.staleInfo(b), null);
  const c = st.normalizeResource({ title: 'c', url: 'https://c.example', createdAt: U.addDays(today, -70), lastChecked: today, status: 'testing', statusSince: U.addDays(today, -65) });
  assert.equal(st.staleInfo(c).reasons[0].kind, 'testing');
  assert.equal(st.staleInfo(st.normalizeResource({ title: 'd', createdAt: old, status: 'archived' })), null);
});

test('threads: create, add, reorder, remove, cascade delete', () => {
  const a = st.addResource({ title: 'A', url: 'https://a1.example' }), b = st.addResource({ title: 'B', url: 'https://b1.example' }), c = st.addResource({ title: 'C', url: 'https://c1.example' });
  const t = st.addThread('Research', [a.id, b.id].map(rid => ({ rid, note: '' })));
  st.addStep(t.id, c.id); assert.deepEqual(t.steps.map(s => s.rid), [a.id, b.id, c.id]);
  st.moveStep(t.id, 2, -1); assert.deepEqual(t.steps.map(s => s.rid), [a.id, c.id, b.id]);
  st.moveStep(t.id, 0, -1); assert.equal(t.steps[0].rid, a.id);
  st.removeStep(t.id, 0); assert.equal(t.steps.length, 2);
  st.deleteResource(c.id); assert.deepEqual(t.steps.map(s => s.rid), [b.id]);
  assert.equal(st.threadsOf(b.id).length, 1);
});

test('links are two-way and cleaned on delete', () => {
  const a = st.addResource({ title: 'LA', url: 'https://la.example' }), b = st.addResource({ title: 'LB', url: 'https://lb.example' });
  st.link(a.id, b.id); assert.ok(a.related.includes(b.id) && b.related.includes(a.id));
  st.deleteResource(b.id); assert.equal(a.related.length, 0);
});

test('export/import round trip (replace + merge)', () => {
  const data = JSON.parse(JSON.stringify(st.exportData()));
  const n = st.state.resources.length, jn = st.state.jobs.length, tn = st.state.threads.length;
  mem.clear(); st.load({ resources: [], jobs: [], threads: [] });
  const res = st.importBackup(data, 'replace');
  assert.equal(st.state.resources.length, n); assert.equal(st.state.jobs.length, jn); assert.equal(st.state.threads.length, tn);
  const again = st.importBackup(data, 'merge'); assert.equal(again.added, 0); assert.equal(again.skipped, n);
  assert.equal(st.previewBackup({ nope: 1 }).ok, false);
  assert.equal(st.importBackup([{ title: 'New', url: 'https://new.example' }], 'merge').added, 1);
  st.save(true); const raw = JSON.parse(mem.get(st.STORAGE_KEY)); assert.equal(raw.resources.length, st.state.resources.length);
});

test('search: AND / OR, ranking, stemming, stopwords, highlight escaping', () => {
  const R = [
    { title: 'SlideMaker', url: 'https://s.example', capabilities: ['turns PDF into slides'], useWhen: ['I need a quick visual for a presentation'], tags: 'slides,pdf', notes: 'mentions photo only in notes' },
    { title: 'PhotoCheck', url: 'https://p.example', capabilities: ['checks if a photo was edited'], useWhen: ['I need to verify a photo'], tags: 'photo,osint' },
    { title: 'Notes Hub', url: 'https://n.example', notes: 'convert pdf to slides maybe', tags: 'misc' }
  ].map(x => st.normalizeResource(x));
  let o = se.search(R, 'Can I turn a PDF into slides?');
  assert.equal(o.results[0].r.title, 'SlideMaker'); assert.ok(o.results.length >= 1);
  assert.equal(se.search(R, 'pdf slides').results[0].r.title, 'SlideMaker');
  assert.equal(se.search(R, 'photo pdf').results.map(x => x.r.title).join(), 'SlideMaker');
  assert.equal(se.search(R, 'photo pdf', { mode: 'or' }).results.length, 3);
  const ph = se.search(R, 'photo', {}).results.map(x => x.r.title); assert.equal(ph[0], 'PhotoCheck');
  assert.equal(se.search(R, 'converting presentations').results.length, 0);
  assert.equal(se.search(R, 'presentations').results[0].r.title, 'SlideMaker');
  assert.equal(se.search(R, 'verify', { types: new Set(['docs']) }).results.length, 0);
  const h = se.highlight('Slides <b>&</b> pdf', ['slides']); assert.ok(h.includes('<mark>Slide</mark>s') && h.includes('&lt;b&gt;&amp;'));
  assert.equal(se.search(R, 'can I').results.length, 0);
});

test('importers: real bookmarks + instagram + url list + json', () => {
  const bm = im.parseBookmarksHTML(fs.readFileSync('/mnt/user-data/uploads/bookmarks.html', 'utf8'));
  assert.equal(bm.length, 170); assert.ok(bm.some(e => e.folder === 'NewsRoom / P&F Follow the money'));
  const ig = im.parseInstagramFollowing(fs.readFileSync('/mnt/user-data/uploads/following.html', 'utf8'));
  assert.equal(ig.length, 148); assert.equal(ig[0].url.startsWith('https://www.instagram.com/'), true);
  const ul = im.parseUrlList('Cool Tool | https://cool.example/a\nhttps://plain.example/x\n[MD](https://md.example)\nbare.example.org/path Bare Title\n# comment\n\njunk line');
  assert.deepEqual(ul.map(x => x.url), ['https://cool.example/a', 'https://plain.example/x', 'https://md.example', 'https://bare.example.org/path']);
  assert.equal(ul[0].title, 'Cool Tool'); assert.equal(ul[3].title, 'Bare Title');
  assert.equal(im.parseJSONArray('["https://a.example", {"name":"B","href":"https://b.example","tags":["x"]}, 5]').length, 2);
  assert.equal(im.parseAny('https://www.youtube.com/@x').entries[0].type, 'youtube-channel');
  assert.equal(im.parseAny('https://x.example/feed.xml').entries[0].type, 'feed');
  assert.equal(im.detectFormat('{"resources":[]}'), 'backup'); assert.equal(im.detectFormat('[oops'), 'json-broken');
  mem.clear(); st.load({ resources: [], jobs: [], threads: [] });
  const added = st.addMany(bm.map(im.entryToResource)); assert.equal(added.added.length, 169); assert.equal(added.skipped, 1);
  assert.ok(st.state.resources.every(r => r.draft));
});

test('youtube rss derive + suggestions', () => {
  const r = st.normalizeResource({ title: 'Chan', url: 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv', type: 'youtube-channel' });
  assert.equal(r.rssUrl, 'https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv');
  const A = st.normalizeResource({ title: 'Scholarship Finder', url: 'https://sf.example', tags: 'scholarships,study' }), B = st.normalizeResource({ title: 'Grant Hub', url: 'https://gh.example', tags: 'scholarships' });
  assert.equal(se.suggestLinks(A, [B])[0].r.id, B.id);
});

test('game: xp, rank, badges', () => {
  mem.clear(); st.load({ resources: [], jobs: [], threads: [] });
  const o = gm.award('backup'); assert.equal(o.gain, 20); assert.ok(o.newBadges.some(b => b.id === 'archivist'));
  for (let i = 0; i < 12; i++) gm.award('check');
  assert.ok(gm.progress().level >= 3); assert.equal(gm.progress().days, 1);
  assert.equal(gm.focusDone(25).gain, 15);
});

// ---- tests against the real seed (what the user will actually search) ----
const seed = JSON.parse(fs.readFileSync(new URL('../seed/seed.json', import.meta.url), 'utf8'));
const seedRes = seed.resources.map(r => ({ status: 'active', ...r }));
const top = (q, mode = 'and') => se.search(seedRes, q, { mode }).results.map(x => x.r.title);

test('seed: shape, unique ids, no invented research label, links only to real ids', () => {
  const ids = new Set(seed.resources.map(r => r.id));
  assert.equal(ids.size, seed.resources.length);
  for (const r of seed.resources) {
    assert.ok(['verified', 'known', 'title-only', 'user'].includes(r.research), r.id);
    for (const l of r.related || []) assert.ok(ids.has(l), r.id + ' -> ' + l);
  }
  for (const j of seed.jobs) for (const id of j.members || []) assert.ok(ids.has(id), j.id + ' -> ' + id);
  for (const t of seed.threads) for (const s of t.steps) assert.ok(ids.has(s.rid), t.id + ' -> ' + s.rid);
  assert.equal(seed.resources.filter(r => r.id.startsWith('b')).length, 170);
});

test('seed: "Can I do X?" questions find the right resource first', () => {
  assert.match(top('find who owns a company')[0], /Panama|Leakd/i);
  assert.match(top('track a flight')[0], /ADS-B|OSIRIS/i);
  assert.ok(top('find a scholarship').length >= 3);
  assert.ok(top('check a username').some(t => /Username|WhatsMyName/i.test(t)));
  assert.ok(top('where was this photo taken').some(t => /Yandex|FotoForensics/i.test(t)));
  assert.equal(top('zzzxq').length, 0);
});

test('search: results report how many words matched; partial matches rank by that count in OR mode', () => {
  const r = se.search(seedRes, 'photo taken yesterday', { mode: 'or' }).results;
  assert.equal(se.search(seedRes, 'photo taken yesterday', { mode: 'and' }).results.length, 0);
  assert.ok(r.length > 0 && r[0].matched >= 2);
  for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].matched >= r[i].matched);
});

test('search: hostile text is escaped in highlights and never matches by accident', () => {
  const out = se.highlight('<img src=x onerror=alert(1)> photo', ['photo', 'img']);
  assert.ok(!out.includes('<img'));
  assert.ok(out.includes('&lt;'));
  assert.doesNotThrow(() => se.search(seedRes, '<script>alert(1)</script> ((( [[[ \\'));
});

test('sector star and planet colours: saved, validated, exported and re-imported', () => {
  mem.clear(); st.load({ resources: [], jobs: [], threads: [] });
  const j = st.addJob({ name: 'Deep Sea', color: '#FFE066', planetColor: '#4F8CFF' });
  assert.equal(j.color, '#FFE066'); assert.equal(j.planetColor, '#4F8CFF');
  st.updateJob(j.id, { planetColor: 'not a colour' }); assert.equal(st.jobById(j.id).planetColor, '');   // bad value falls back to "same as star"
  st.updateJob(j.id, { color: '#7FA2FF', planetColor: '#FF9500' });
  const data = JSON.parse(JSON.stringify(st.exportData()));
  assert.equal(data.jobs[0].color, '#7FA2FF'); assert.equal(data.jobs[0].planetColor, '#FF9500');
  mem.clear(); st.load({ resources: [], jobs: [], threads: [] });
  st.importBackup(data, 'replace');
  assert.equal(st.state.jobs[0].planetColor, '#FF9500');
  // an old backup without planetColor still loads, planets follow the star
  mem.clear(); st.load({ resources: [], jobs: [{ id: 'j1', name: 'Old', color: '#34C759', members: [] }], threads: [] });
  assert.equal(st.state.jobs[0].planetColor, '');
});
