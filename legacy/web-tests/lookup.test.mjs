// lookup.test.mjs - topic guesses, page parsing, the online lookup (with a fake network), applying results, batches.
import test from 'node:test';
import assert from 'node:assert/strict';
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const S = new URL('../src/js/', import.meta.url).pathname;
const T = await import(S + 'topics.js'), P = await import(S + 'pageparse.js'), L = await import(S + 'lookup.js'), st = await import(S + 'store.js');

// ---------- a fake network ----------
let calls = [];
const routes = [];
const reply = (body, o = {}) => () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: o.status || 200, headers: { 'content-type': o.type || (typeof body === 'string' ? 'text/html' : 'application/json'), ...(o.headers || {}) } });
const route = (rx, fn) => routes.unshift({ rx, fn });
const setOnline = v => Object.defineProperty(globalThis, 'navigator', { value: { onLine: v }, configurable: true, writable: true });
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  for (const r of routes) if (r.rx.test(String(url))) return r.fn(url, init);
  throw new TypeError('Failed to fetch');
};
const fresh = () => { calls = []; routes.length = 0; setOnline(true); L.resetSession(); };
const res = o => st.normalizeResource({ title: 'Thing', url: 'https://site.example/', ...o });

const HEALTH_PAGE = `<!doctype html><html lang="en"><head><title>Calm Body | Yoga and wellness tips</title>
<meta name="description" content="Daily yoga, nutrition and mental health advice from certified trainers."><meta property="og:site_name" content="Calm Body">
<meta name="keywords" content="yoga, wellness, nutrition, Mental Health"><link rel="alternate" type="application/rss+xml" href="/feed.xml">
<script type="application/ld+json">{"@type":"Organization","name":"Calm Body"}</script><style>.x{color:red}</style><script>var secret=1;</script></head>
<body><nav>Home About</nav><main><h1>Yoga for a healthy life</h1><h2>Nutrition basics</h2><p>Learn <b>meditation</b> and fitness.</p></main><footer>copyright</footer></body></html>`;

test('topics: handles, honest "not clear", bios', () => {
  assert.equal(T.guessTopic({ handle: 'natgeoanimals' }).top.id, 'nature');
  assert.equal(T.guessTopic({ handle: 'nasasolarsystem' }).top.id, 'space');
  assert.equal(T.guessTopic({ handle: 'utsav_kamboj' }).conf, 'none');
  assert.equal(T.guessTopic({ handle: 'fullyscholarship' }).top.id, 'jobs');   // "scholar" inside "scholarship" must not win
  const nameOnly = T.guessTopic({ handle: 'healthyfood.india' });
  assert.ok(['maybe'].includes(nameOnly.conf) && nameOnly.basis === 'name', 'name-only can never be clear');
  const bio = T.guessTopic({ handle: 'priya_abiram', bio: 'Yoga teacher. Helping you with mental health, nutrition and sleep.' });
  assert.equal(bio.top.id, 'health'); assert.equal(bio.conf, 'clear'); assert.equal(bio.basis, 'bio'); assert.ok(bio.words.length >= 2);
  assert.equal(T.guessTopic({ handle: 'x', bio: 'Hello! Welcome to my page.' }).conf, 'none');
  assert.match(T.describeGuess(T.guessTopic({ handle: 'utsav_kamboj' }), { handle: true }), /^Not clear/);
  assert.match(T.describeGuess(bio), /^Health & wellness \(from the bio or description/);
  // false-positive guards
  assert.equal(T.guessTopic({ title: 'Technique notes' }).conf, 'none');
  assert.equal(T.guessTopic({ handle: 'cloudgazer.mag' }).conf, 'none');
});
test('topics: a real page text gives a clear answer with its words', () => {
  const p = P.parseHTML(HEALTH_PAGE, 'https://calmbody.example/');
  const g = T.guessTopic({ title: p.title, desc: p.description, keywords: p.keywords, headings: p.headings, text: p.text, url: 'https://calmbody.example/' });
  assert.equal(g.top.id, 'health'); assert.equal(g.conf, 'clear'); assert.ok(g.basis === 'bio' || g.basis === 'page');
});

test('parseHTML: title, meta, keywords, feeds, headings, clean text', () => {
  const p = P.parseHTML(HEALTH_PAGE, 'https://calmbody.example/blog/');
  assert.equal(p.title, 'Calm Body | Yoga and wellness tips'); assert.equal(p.site, 'Calm Body'); assert.equal(p.lang, 'en');
  assert.match(p.description, /^Daily yoga/); assert.deepEqual(p.keywords, ['yoga', 'wellness', 'nutrition', 'mental-health']);
  assert.deepEqual(p.rss, ['https://calmbody.example/feed.xml']); assert.deepEqual(p.headings, ['Yoga for a healthy life', 'Nutrition basics']);
  assert.ok(!/secret|color:red|copyright|Home About/.test(p.text), p.text); assert.match(p.text, /meditation and fitness/);
  assert.equal(P.tidyTitle(p.title, p.site), 'Calm Body | Yoga and wellness tips');
  assert.equal(P.tidyTitle('Learn Python the Hard Way | Example Site', 'Example Site'), 'Learn Python the Hard Way');
});
test('parseHTML: walls are recognised, long real pages are not mistaken for walls', () => {
  assert.equal(P.parseHTML('<title>Just a moment...</title><body>Checking your browser before accessing</body>').wall, 'bot');
  assert.equal(P.parseHTML('<title>Login • Instagram</title><body>Log in to continue</body>').wall, 'login');
  assert.equal(P.parseHTML('<title>Docs</title><body>' + 'We explain how to log in to your account. '.repeat(80) + '</body>').wall, '');
});
test('parseReader: JSON, text and warning formats', () => {
  const j = P.parseReader(JSON.stringify({ code: 200, status: 20000, data: { title: 'Rocket Lab', description: 'Launch services and satellites.', url: 'https://rocketlab.example/', content: '# Rocket Lab\n\nWe build [rockets](https://x.y) and ![img](a.png) spacecraft.\n\n## Missions' } }));
  assert.equal(j.title, 'Rocket Lab'); assert.equal(j.description, 'Launch services and satellites.'); assert.deepEqual(j.headings, ['Rocket Lab', 'Missions']); assert.match(j.text, /We build rockets and spacecraft/); assert.ok(!/https|img/.test(j.text));
  const t = P.parseReader('Title: Tea Basics\n\nURL Source: https://tea.example/\n\nMarkdown Content:\n# Tea Basics\nBrewing tea at home.');
  assert.equal(t.title, 'Tea Basics'); assert.equal(t.canonical, 'https://tea.example/'); assert.match(t.text, /Brewing tea/);
  const w = P.parseReader('Title: Not Found\n\nURL Source: https://x.example/\n\nWarning: Target URL returned error 404: Not Found\n\nMarkdown Content:\nNope');
  assert.equal(w.targetError.code, 404);
  assert.equal(P.parseReader('{"code":429,"message":"Too many requests"}').error.code, 429);
  assert.ok(P.parseReader('').empty);
});
test('Instagram page text: counts, name, bio when shown, nothing invented when not', () => {
  const a = P.parseInstagramPage({ description: '1,234 Followers, 56 Following, 78 Posts - See Instagram photos and videos from Nature Daily (@naturedaily)', title: 'Nature Daily (@naturedaily) • Instagram photos and videos' }, 'naturedaily');
  assert.equal(a.followers, '1,234'); assert.equal(a.posts, '78'); assert.equal(a.name, 'Nature Daily'); assert.equal(a.bio, ''); assert.equal(a.shown, false);
  const b = P.parseInstagramPage({ description: '2.1M Followers, 10 Following, 900 Posts - Dr. Mira (@drmira) on Instagram: "Yoga & mental health coach. Free tips daily 🌿"' }, 'drmira');
  assert.equal(b.bio, 'Yoga & mental health coach. Free tips daily 🌿'); assert.equal(b.shown, true);
  assert.equal(P.parseInstagramPage({ description: 'Private. This account is private.' }, 'x').private, true);
});

test('skip rules: private-looking links are never sent', () => {
  const s = { webSkip: ['filen.io', 'example.org'] };
  assert.match(L.skipReason('https://app.filen.io/#/d/aaaa-bbbb#KEYKEYKEYKEYKEYKEYKEYKEYKEYKEY', s), /never look up|key|file-sharing/);
  assert.ok(L.skipReason('https://docs.google.com/document/d/abc/edit', {}));
  assert.ok(L.skipReason('https://mega.nz/file/abc#key', {}));
  assert.ok(L.skipReason('http://localhost:3000/a', {})); assert.ok(L.skipReason('http://192.168.1.4/a', {})); assert.ok(L.skipReason('https://intranet/a', {}));
  assert.ok(L.skipReason('https://user:pw@site.example/', {})); assert.ok(L.skipReason('https://site.example/a?token=abc', {})); assert.ok(L.skipReason('https://site.example/a?api_key=abc', {}));
  assert.ok(L.skipReason('https://app.example.com/page#ABCDEFGHIJKLMNOPQRSTUVWXYZ012345', {}));
  assert.ok(L.skipReason('https://sub.example.org/x', s));
  assert.equal(L.skipReason('https://ielts.org/take-a-test/preparation-resources/', s), ''); assert.equal(L.skipReason('https://site.example/page?id=5#section-two', s), '');
  assert.equal(L.cleanForSend('https://user:pw@site.example/a?utm_source=x&id=5#frag'), 'https://site.example/a?id=5');
  assert.equal(L.readerUrl('https://a.example/x', {}), 'https://r.jina.ai/https://a.example/x');
  assert.equal(L.readerUrl('https://a.example/x', { webReader: 'https://my.worker.dev/?u={url}' }), 'https://my.worker.dev/?u=https%3A%2F%2Fa.example%2Fx');
});

test('fetchPage: reads the site directly when it allows it', async () => {
  fresh(); route(/^https:\/\/site\.example\/$/, reply(HEALTH_PAGE));
  const r = await L.fetchPage('https://site.example/', {});
  assert.equal(r.ok, true); assert.equal(r.via, 'direct'); assert.equal(r.page.site, 'Calm Body'); assert.equal(calls.length, 1);
  assert.equal(calls[0].init.credentials, 'omit'); assert.equal(calls[0].init.referrerPolicy, 'no-referrer');
});
test('fetchPage: falls back to the reader service when the browser blocks the direct read (file:// pages)', async () => {
  fresh(); route(/^https:\/\/r\.jina\.ai\//, reply({ code: 200, data: { title: 'Site', description: 'About astronomy and space telescopes.', content: '# Site\nAstronomy.', url: 'https://site.example/p' } }));
  const r = await L.fetchPage('https://site.example/p?utm_source=a#secretpart', {});
  assert.equal(r.ok, true); assert.equal(r.via, 'reader');
  assert.equal(calls[0].url, 'https://site.example/p'); assert.equal(calls[1].url, 'https://r.jina.ai/https://site.example/p');   // no #part, no tracking in either request
  assert.equal(calls[1].init.headers.Accept, 'application/json');
});
test('fetchPage: modes, and it stops trying direct after repeated browser blocks', async () => {
  fresh(); route(/r\.jina\.ai/, reply({ data: { title: 'T', description: 'A page about maths.', content: 'maths' } }));
  await L.fetchPage('https://a.example/', { webMode: 'reader' }); assert.equal(calls.length, 1); assert.match(calls[0].url, /r\.jina\.ai/);
  fresh(); const d = await L.fetchPage('https://a.example/', { webMode: 'direct' }); assert.equal(d.ok, false); assert.equal(d.error.code, 'blocked'); assert.equal(calls.length, 1);
  fresh(); route(/r\.jina\.ai/, reply({ data: { title: 'T', description: 'd', content: 'c' } }));
  for (let i = 0; i < 3; i++) await L.fetchPage('https://s' + i + '.example/', {});
  calls = []; await L.fetchPage('https://s9.example/', {}); assert.equal(calls.length, 1, 'goes straight to the reader');
  fresh(); route(/r\.jina\.ai/, reply({ data: { title: 'T', description: 'd', content: 'c' } }));
  await L.fetchPage('https://www.youtube.com/@x', {}); assert.match(calls[0].url, /r\.jina\.ai/, 'sites that never allow direct reads skip it');
});
test('fetchPage: error cases come back in plain words', async () => {
  fresh(); route(/404\.example/, reply('nope', { status: 404 })); route(/slow\.example/, reply('x', { status: 429, headers: { 'retry-after': '30' } })); route(/wall\.example/, reply('<title>Just a moment...</title><body>Checking your browser</body>')); route(/blank\.example/, reply('<html><body></body></html>')); route(/file\.example/, reply('%PDF', { type: 'application/pdf' }));
  assert.equal((await L.fetchPage('https://404.example/', {})).error.code, 'notfound');
  const sl = await L.fetchPage('https://slow.example/', {}); assert.equal(sl.error.code, 'slow'); assert.equal(sl.error.retryAfter, '30');
  assert.equal((await L.fetchPage('https://wall.example/', {})).error.code, 'wall');
  assert.equal((await L.fetchPage('https://blank.example/', {})).error.code, 'empty');
  const f = await L.fetchPage('https://file.example/a.pdf', {}); assert.equal(f.ok, true); assert.equal(f.page.file, 'application/pdf');
  setOnline(false); assert.equal((await L.fetchPage('https://404.example/', {})).error.code, 'offline'); setOnline(true);
  assert.equal((await L.fetchPage('https://404.example/', { web: false })).error.code, 'off');
  assert.match(L.errorText({ code: 'wall', msg: 'login' }), /wants a login/); assert.match(L.errorText({ code: 'skip', msg: 'a private or local address' }), /^Not looked up/);
});
test('fetchPage: never sends a Filen key link or a shared document', async () => {
  fresh(); route(/./, reply(HEALTH_PAGE));
  const a = await L.fetchPage('https://app.filen.io/#/d/12345678-aaaa-bbbb-cccc-1234567890ab#abcdefghijklmnopqrstuvwxyz0123456789', { webSkip: ['filen.io'] });
  const b = await L.fetchPage('https://docs.google.com/spreadsheets/d/xyz/edit', {});
  assert.equal(a.error.code, 'skip'); assert.equal(b.error.code, 'skip'); assert.equal(calls.length, 0);
});
test('fetchPage: GitHub and Wikipedia use their own APIs', async () => {
  fresh(); route(/api\.github\.com\/repos\/o\/r$/, reply({ full_name: 'o/r', description: 'A python machine learning toolkit', topics: ['ml', 'python'], language: 'Python', html_url: 'https://github.com/o/r' }));
  const g = await L.fetchPage('https://github.com/o/r/tree/main', {}); assert.equal(g.via, 'github'); assert.equal(g.page.title, 'o/r'); assert.deepEqual(g.page.keywords, ['ml', 'python']);
  fresh(); route(/wikipedia\.org\/api\/rest_v1\/page\/summary\/Aurora/, reply({ title: 'Aurora', description: 'Natural light display', extract: 'An aurora is a natural light display in the sky.' }));
  const w = await L.fetchPage('https://en.wikipedia.org/wiki/Aurora', {}); assert.equal(w.via, 'wikipedia'); assert.equal(w.page.title, 'Aurora');
});

test('lookupResource: website -> clear topic, fields to fill, never touches your own text', async () => {
  fresh(); route(/^https:\/\/calmbody\.example\/$/, reply(HEALTH_PAGE));
  const r = res({ title: 'https://calmbody.example/', url: 'https://calmbody.example/', draft: true, research: 'title-only', type: 'article-site', tags: ['calmbody'], useWhen: ['my own line'] });
  const out = await L.lookupResource(r, {});
  assert.equal(out.ok, true); const x = out.result;
  assert.equal(x.topic, 'health'); assert.equal(x.conf, 'clear'); assert.equal(x.via, 'direct'); assert.equal(x.title, 'Calm Body | Yoga and wellness tips');
  assert.match(x.notes, /^Looked up \d{4}-\d\d-\d\d: Daily yoga/); assert.deepEqual(x.rss, ['https://calmbody.example/feed.xml']);
  const { patch, changes } = L.buildPatch(r, x, 'fill');
  assert.equal(patch.useWhen, undefined, 'your own use-it-when line is kept'); assert.ok(changes.includes('title') && changes.includes('tags') && changes.includes('what it can do'));
  assert.equal(patch.research, 'scanned'); assert.ok(patch.tags.includes('calmbody') && patch.tags.includes('health') && patch.tags.includes('yoga')); assert.equal(patch.rssUrl, 'https://calmbody.example/feed.xml');
  assert.equal(patch.scan.topic, 'health'); assert.equal(patch.scan.via, 'direct');
  const rep = L.buildPatch(r, x, 'replace'); assert.ok(rep.patch.useWhen.length);
  // applying and saving through the store keeps the scan block
  mem.clear(); st.load({ resources: [], jobs: [], threads: [] }); const added = st.addResource(r); st.updateResource(added.id, patch);
  assert.equal(st.byId(added.id).scan.topic, 'health'); assert.equal(st.byId(added.id).research, 'scanned'); assert.equal(st.byId(added.id).useWhen[0], 'my own line');
  mem.clear(); st.load(); assert.ok(true);
});
test('lookupResource: verified or written-by-you items are not relabelled', () => {
  const r = res({ research: 'verified', title: 'Mine', useWhen: ['a'], capabilities: ['b'], draft: false });
  const x = L.analyse(r, { ok: true, via: 'direct', page: P.parseHTML(HEALTH_PAGE, 'https://site.example/') });
  const { patch } = L.buildPatch(r, x, 'fill');
  assert.equal(patch.research, undefined); assert.equal(patch.title, undefined); assert.equal(patch.useWhen, undefined); assert.equal(patch.capabilities, undefined);
  const again = L.buildPatch(st.normalizeResource({ ...r, ...patch, notes: patch.notes }), x, 'fill'); assert.equal(again.patch.notes, undefined, 'a second look does not stack the same note');
});
test('Instagram: offline guess, online "bio not shown", online with a bio, pasted bio', async () => {
  const mk = h => res({ title: '@' + h, url: 'https://www.instagram.com/' + h + '/', type: 'feed', tags: ['instagram', 'following'], src: 'following', research: 'user' });
  const off = L.analyse(mk('natgeoanimals'), null); assert.equal(off.topic, 'nature'); assert.equal(off.conf, 'maybe'); assert.equal(off.basis, 'name'); assert.equal(off.read, false);
  assert.equal(L.analyse(mk('utsav_kamboj'), null).topic, ''); assert.match(L.analyse(mk('utsav_kamboj'), null).summary, /^Not clear/);
  // online, Instagram shows counts but no bio
  fresh(); route(/r\.jina\.ai\/https:\/\/www\.instagram\.com\/utsav_kamboj\//, reply({ data: { title: 'Utsav (@utsav_kamboj) • Instagram photos and videos', description: '900 Followers, 400 Following, 12 Posts - See Instagram photos and videos from Utsav Kamboj (@utsav_kamboj)', content: '' } }));
  const a = await L.lookupResource(mk('utsav_kamboj'), {}); assert.equal(a.ok, true); assert.equal(a.result.topic, ''); assert.match(a.result.summary, /did not show a bio/); assert.equal(a.result.ig.followers, '900'); assert.equal(calls.length, 1, 'Instagram never tries a direct read');
  // online with a bio
  fresh(); route(/r\.jina\.ai\/https:\/\/www\.instagram\.com\/drmira\//, reply({ data: { title: 'Dr. Mira (@drmira)', description: '2.1M Followers, 10 Following, 900 Posts - Dr. Mira (@drmira) on Instagram: "Yoga & mental health coach. Nutrition tips daily"', content: '' } }));
  const b = await L.lookupResource(mk('drmira'), {}); assert.equal(b.result.topic, 'health'); assert.equal(b.result.conf, 'clear'); assert.equal(b.result.basis, 'bio'); assert.match(b.result.capabilities[0], /Yoga & mental health coach/);
  // login wall -> still ok, partial, guess stays name-only
  fresh(); route(/r\.jina\.ai/, reply({ data: { title: 'Login • Instagram', description: '', content: 'Log in to continue' } }));
  const c = await L.lookupResource(mk('natgeoanimals'), {}); assert.equal(c.ok, true); assert.equal(c.result.partial, true); assert.equal(c.result.topic, 'nature'); assert.equal(c.result.basis, 'name');
  // pasted bio works with no internet at all
  fresh(); setOnline(false);
  const d = await L.lookupResource(mk('priya_abiram'), {}, { extra: { bio: 'Marine biologist. Ocean wildlife, reefs and conservation.' } });
  assert.equal(d.ok, false); assert.equal(d.error.code, 'offline'); assert.equal(d.result.topic, 'nature'); assert.equal(d.result.basis, 'bio');
  // handle detection
  assert.equal(L.igHandle('https://www.instagram.com/p/ABC123/'), ''); assert.equal(L.igHandle('https://www.instagram.com/_u/nasa'), 'nasa'); assert.equal(L.igHandle('https://example.com/nasa'), '');
});
test('"not specified" is an honest answer for a real page that says nothing about a topic', () => {
  const p = P.parseHTML('<title>Welcome</title><meta name="description" content="Welcome to our website. Click here to continue."><body><p>Welcome to our website.</p></body>', 'https://x.example/');
  const x = L.analyse(res({ title: 'x', url: 'https://x.example/' }), { ok: true, via: 'direct', page: p });
  assert.equal(x.topic, ''); assert.equal(x.conf, 'none'); assert.match(x.summary, /^Not clear\. What was read does not say/); assert.deepEqual(x.useWhen, []);
});

test('runBatch: 2 at a time, progress, skips, pause on repeated "slow down", cancel', async () => {
  const items = Array.from({ length: 7 }, (_, i) => ({ id: 'i' + i, url: 'https://s' + i + '.example/' }));
  let active = 0, peak = 0; const prog = [];
  const lookup = async (it) => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 5)); active--; return it.id === 'i3' ? { ok: false, error: { code: 'skip', msg: 'x' } } : (it.id === 'i5' ? { ok: false, error: { code: 'notfound' } } : { ok: true, result: { partial: it.id === 'i1' } }); };
  const s = await L.runBatch(items, { settings: {}, lookup, spacing: 0, sleep: async () => {}, onProgress: p => prog.push(p.done) });
  assert.equal(peak <= 2, true); assert.equal(s.total, 7); assert.equal(s.done, 7); assert.equal(s.ok, 5); assert.equal(s.skipped, 1); assert.equal(s.failed, 1); assert.equal(s.partial, 1); assert.equal(s.reasons.notfound, 1); assert.equal(prog.at(-1), 7);
  const slow = await L.runBatch(items, { settings: {}, lookup: async () => ({ ok: false, error: { code: 'slow', retryAfter: 1 } }), spacing: 0, sleep: async () => {} });
  assert.equal(slow.paused, 'slow'); assert.ok(slow.done < 7);
  const ctl = new AbortController(); let n = 0;
  const cut = await L.runBatch(items, { settings: {}, signal: ctl.signal, lookup: async () => { if (++n === 2) ctl.abort(); return { ok: true, result: {} }; }, spacing: 0, sleep: async () => {} });
  assert.equal(cut.paused, 'cancelled'); assert.ok(cut.done < 7);
  const off = await L.runBatch(items, { settings: {}, lookup: async () => ({ ok: false, error: { code: 'offline' } }), spacing: 0, sleep: async () => {} }); assert.equal(off.paused, 'offline');
});
