// gen_golden.mjs - runs the REAL web code (legacy/web-src/js) on fixed inputs and records what it returns.
// The Dart port must return the same thing for the same input. These files are the answer key.
//
//   node tools/gen_golden.mjs          writes fixtures/golden/*.json and fixtures/sample-backup.json
//
// Rules for the JSON: { module, cases: [ { fn, in: [args...], out } ] }. "in" and "out" are plain JSON.
// A missing key in "out" means the JS value was undefined (treat as null). Numbers with decimals are rounded to 6 places.
// Where JS takes a function or a Set, the case says what the argument means (see "note"); the Dart test adapts it.
// You may ADD cases. Never edit an "out" by hand: change the input in this file and run the script again.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Freeze the clock at 2026-10-31 12:00 UTC. The web code asks the clock for "today" (Date.now / new Date()); without this the files change every day.
{ const RealDate = Date, FROZEN = RealDate.UTC(2026, 9, 31, 12, 0, 0);
  globalThis.Date = class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(FROZEN); else super(...a); } static now() { return FROZEN; } }; }
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.LEGACY || path.join(ROOT, 'legacy/web-src/js/');
const OUT = path.join(ROOT, 'fixtures/golden');
const J = n => import(SRC + n + '.js');
const [St, Util, Tidy, Tags, Spell, Ideas, Week, Time, Jump, Inst, Hist, Recent, Choices, Merge, Dupes, Search, Mission, Insights, Home, Fields, Rules] = await Promise.all(
  ['store', 'util', 'tidy', 'tags', 'spell', 'ideas', 'week', 'time', 'jump', 'install', 'history', 'recent', 'choices', 'merge', 'dupes', 'search', 'mission', 'insights', 'home', 'fields', 'rules'].map(J));

const TODAY = '2026-10-31', NOW = Date.UTC(2026, 9, 31, 12, 0, 0);
const clean = v => JSON.parse(JSON.stringify(v, (k, x) => (x instanceof Map ? Object.fromEntries(x) : x instanceof Set ? [...x] : (typeof x === 'number' && !Number.isInteger(x) ? Math.round(x * 1e6) / 1e6 : x))));
const files = {};
let RS_JSON = '';   // set once RS exists: any argument equal to the shared link list is written as the text "$RS" to keep the files small
const shrink = a => (Array.isArray(a) ? a.map(x => (RS_JSON && JSON.stringify(x) === RS_JSON ? '$RS' : x)) : a);
const rec = (mod, fn, args, out, note) => { (files[mod] ||= []).push({ fn, in: shrink(clean(args)), out: clean(out === undefined ? null : out), ...(note ? { note } : {}) }); };
const each = (mod, fn, f, lists) => lists.forEach(a => rec(mod, fn, a, f(...a)));
const ids = list => list.map(x => x.id);

// ---------- the shared little library of links used by many cases ----------
const R = (id, x = {}) => St.normalizeResource({ id, title: id, url: '', draft: false, createdAt: '2026-10-01', ...x }, TODAY);
const RS = [
  R('r1', { title: 'Slides converter', url: 'https://slides.example.org/convert?utm_source=news&id=7', tags: ['presentation', 'pdf'], capabilities: ['turn pdf into slides', 'export pptx'], useWhen: ['I need a deck quickly'], opens: 3, openedAt: Date.UTC(2026, 9, 29) }),
  R('r2', { title: 'Video editor', url: 'https://video.example.com/', tags: ['video', 'editing', 'ai tools'], capabilities: ['trim clips', 'add subtitles'], opens: 5, openedAt: Date.UTC(2026, 9, 30), pinned: true }),
  R('r3', { title: 'Cheap hosting', url: 'https://host.example.net/', tags: ['hosting', 'ai-tools'], type: 'article-site' }),
  R('r4', { title: 'Design inspiration | Dribbble', url: 'https://dribbble.com/shots', tags: ['design'], type: 'catalogue' }),
  R('r5', { title: '(3) Great read - Medium', url: 'https://medium.com/@x/great-read?fbclid=zzz', tags: ['writing', 'design'], type: 'article-site' }),
  R('r6', { title: 'Color palette', url: 'https://colors.example.org/', tags: ['design', 'color'] }),
  R('r7', { title: 'Font finder', url: 'https://fonts.example.org/', tags: ['design', 'fonts'] }),
  R('r8', { title: 'Logo maker', url: 'https://logos.example.org/', tags: ['design', 'logo'], type: 'web-tool' }),
  R('r9', { title: 'API guide', url: 'https://docs.example.dev/api', tags: ['api', 'docs'], type: 'docs', useWhen: ['look up an endpoint'] }),
  R('r10', { title: 'Old archived tool', url: 'https://old.example.org/', tags: ['design'], status: 'archived' }),
  R('r11', { title: 'Follow someone', url: 'https://instagram.com/someone', tags: ['instagram', 'following'], src: 'following' }),
  R('r12', { title: 'Daily channel', url: 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv', type: 'youtube-channel', tags: ['video'] }),
  R('r13', { title: 'Draft link', url: 'https://draft.example.org/', draft: true, createdAt: '2026-10-30' }),
  R('r14', { title: 'Locked one', url: 'https://l.example.org/?utm_medium=x', locked: true, createdAt: '2026-10-28' }),
  R('r15', { title: 'Slides converter again', url: 'https://www.slides.example.org/convert?id=7', tags: ['presentation'] }),
  R('r16', { title: 'Slides blog', url: 'https://slides.example.org/blog' })
];
const byId = new Map(RS.map(r => [r.id, r]));
RS_JSON = JSON.stringify(clean(RS));

// ---------- util ----------
each('util', 'normUrl', Util.normUrl, ['https://www.Example.com/a/?utm_source=x&b=2&a=1', 'https://example.com/a/', 'http://example.com', 'not a url', '', 'https://a.test/p?ref=1&igshid=2&q=3'].map(x => [x]));
each('util', 'domainOf', Util.domainOf, ['https://www.example.com/x', 'http://sub.example.co.uk/', '', 'bad'].map(x => [x]));
each('util', 'shortUrl', Util.shortUrl, [['https://www.example.com/some/long/path/here/and/more/and/more/stuff?x=1', 30], ['https://a.test/', 46], ['', 10]]);
each('util', 'daysBetween', Util.daysBetween, [['2026-10-01', '2026-10-31'], ['2026-10-31', '2026-10-01'], ['2026-02-28', '2026-03-01'], ['2026-12-31', '2027-01-01']]);
each('util', 'addDays', Util.addDays, [['2026-10-31', 1], ['2026-10-31', -31], ['2026-02-28', 1], ['2026-12-31', 7]]);
each('util', 'plural', Util.plural, [[0, 'link'], [1, 'link'], [2, 'link'], [2, 'match', 'matches']]);
each('util', 'isHttpUrl', Util.isHttpUrl, ['https://a.test', 'ftp://a.test', 'a b', ' https://a.test '].map(x => [x]));
each('dupes', 'siteKey', Dupes.siteKey, ['https://www.example.com/a', 'https://news.bbc.co.uk/x', 'https://a.b.example.org/', 'https://github.com/user/repo', 'localhost', ''].map(x => [x]));

// ---------- normalizeResource (the data model) ----------
const raws = [
  { id: 'n1', title: '  Padded  ', url: ' https://a.test/x ', tags: '#AI, Tools,ai', capabilities: 'one; two\nthree', useWhen: ['a', ' ', 'b'], type: 'nonsense', status: 'weird', checkCadence: 'weekly' },
  { id: 'n2', url: 'https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv', type: 'youtube-channel' },
  { id: 'n3', title: 'Cadence', checkCadence: 'monthly', lastChecked: '2026-10-01' },
  { id: 'n4', title: 'None cadence', checkCadence: 'none', nextCheck: '2026-11-11' },
  { id: 'n5', title: 'Scan', scan: { at: '2026-10-20', via: 'reader', topic: 'music', conf: 'clear', basis: 'text', desc: 'x'.repeat(400), site: 'site' }, verdict: { result: 'keep', at: '2026-10-25', note: 'ok' }, opens: -5, openedAt: 12.7 },
  { id: 'n6', title: 'Bad scan', scan: { at: 'yesterday' }, verdict: { result: 'maybe', at: '2026-10-25' }, learned: 'y'.repeat(900), related: ['a', 'a', 'b'] },
  { id: 'n7', title: 'Log', log: [{ at: '2026-10-01', k: 'reviewed', t: 'Marked as reviewed' }, { at: 'bad', k: 'reviewed' }, { at: '2026-10-02', k: 'nope', t: 'x' }], fields: { limit: '100/day', resets: '2026-11-05', nonsense: 'x' } },
  { id: 'n8' }
];
raws.forEach(r => rec('normalize', 'normalizeResource', [r, TODAY], St.normalizeResource(r, TODAY), 'today is the second argument'));
each('normalize', 'computeNextCheck', St.computeNextCheck, [[{ checkCadence: 'weekly', lastChecked: '2026-10-01' }, TODAY], [{ checkCadence: 'daily', lastChecked: '' }, TODAY], [{ checkCadence: 'none', lastChecked: '2026-10-01' }, TODAY], [{ checkCadence: 'monthly', lastChecked: '2026-01-31' }, TODAY]]);
each('normalize', 'deriveRssUrl', St.deriveRssUrl, [['https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv', ''], ['https://youtube.com/@handle', ''], ['', 'UCabcdefghijklmnopqrstuv'], ['https://a.test', '']]);

// ---------- tidy ----------
each('tidy', 'cleanUrl', Tidy.cleanUrl, ['https://a.test/p?utm_source=x&utm_medium=y&id=7&fbclid=abc#top', 'https://a.test/p?utm_source=x', 'https://a.test/p?utm_source=x#frag', 'https://a.test/p?q=a%20b&page=2', 'https://www.youtube.com/watch?v=abc&si=XYZ&t=30s', 'https://youtu.be/abc?si=XYZ', 'https://a.test/p?si=keepme', 'https://a.test/p?ref=home', 'not a link?utm_source=1', '', 'https://a.test/?UTM_Source=x&b=1', 'https://open.spotify.com/track/1?si=abc&utm_source=copy-link', 'https://a.test/?gclid=1&msclkid=2&irclickid=3'].map(x => [x]));
each('tidy', 'droppedParams', Tidy.droppedParams, ['https://a.test/p?utm_source=x&id=7&fbclid=abc#t', 'https://a.test/p?id=7', 'https://a.test/p?utm_source=x&utm_source=y'].map(x => [x]));
each('tidy', 'cleanTitle', Tidy.cleanTitle, [['(3) Great article | Medium', 'https://medium.com/x'], ['Cat video - YouTube', 'https://www.youtube.com/watch?v=1'], ['Tom &amp; Jerry   fans', 'https://fans.test/'], ['Pricing - Notion', 'https://notion.so/pricing'], ['How AI works | MIT News', 'https://news.mit.edu/x'], ['Python - The Basics', 'https://docs.example.org/py'], ['A | B', 'https://b.test/'], ['Canva', 'https://canva.com'], ['', 'https://x.test'], ['Gamma - Gamma', 'https://gamma.test/'], ['Why I left Google - News', 'https://news.example.com/a'], ['Home | BBC', 'https://www.bbc.co.uk/']]);
{ const f = Tidy.tidyFindings(RS); rec('tidy', 'tidyFindings', [RS], { links: f.links.map(x => ({ id: x.r.id, to: x.to })), titles: f.titles.map(x => ({ id: x.r.id, to: x.to })), nowSame: f.nowSame }, 'out lists resource ids instead of resource objects'); }

// ---------- tags ----------
each('tags', 'cleanTag', Tags.cleanTag, ['  #AI   Tools ', 'a, b', '###', 'हिंदी', 'c++', 'x'.repeat(50), 'A;B\nC'].map(x => [x]));
rec('tags', 'tagCounts', [RS], Tags.tagCounts(RS));
rec('tags', 'retag', [RS, 'ai tools', 'ai-tools'], Tags.retag(RS, 'ai tools', 'ai-tools'));
rec('tags', 'retag', [RS, ['design', 'color'], 'visual'], Tags.retag(RS, ['design', 'color'], 'visual'));
rec('tags', 'retag', [RS, 'design', ''], Tags.retag(RS, 'design', ''), 'empty target deletes');
rec('tags', 'retag', [RS, 'nope', 'x'], Tags.retag(RS, 'nope', 'x'));
rec('tags', 'similarTags', [Tags.tagCounts(RS)], Tags.similarTags(Tags.tagCounts(RS)));

// ---------- spell ----------
{
  const V = Spell.vocabulary(RS); rec('spell', 'vocabulary', [RS], V);
  each('spell', 'editDistance', Spell.editDistance, [['slides', 'slides', 2], ['slidez', 'slides', 2], ['sildes', 'slides', 2], ['abc', 'abcdefg', 2], ['', 'ab', 2], ['kitten', 'sitting', 3], ['presentatoin', 'presentation', 2]]);
  ['slidse converter', 'slidez converter', 'vidoe editng', 'vidoe presentaton', 'presentatoin', 'zzzzzz qqqq', 'vid', '', 'the slidse', 'hsting', 'desing colour'].forEach(q => rec('spell', 'didYouMean', [RS, q], Spell.didYouMean(q, V), 'first arg = resources: build vocabulary(resources) first'));
  [['slidse converter', {}], ['slidse video', {}], ['slidse video', { mode: 'or' }], ['hsting', {}], ['vidoe', { types: ['web-tool'] }]].forEach(([q, o]) => rec('spell', 'suggestFix', [RS, q, o], Spell.suggestFix(RS, q, { ...o, types: o.types ? new Set(o.types) : undefined }), 'opts.types is an array here (a Set in JS)'));
}

// ---------- search ----------
each('search', 'tokenize', Search.tokenize, ['Turn a PDF into slides!', "can't stop c++ and .net", 'hindi हिंदी words', '', '  '].map(x => [x]));
each('search', 'stem', Search.stem, ['slides', 'converting', 'hosting', 'classes', 'status', 'bus', 'tried', 'ai', 'glass'].map(x => [x]));
[['turn pdf into slides', {}], ['video editing', {}], ['hosting', {}], ['design', {}], ['slidez', {}], ['api docs', {}], ['pdf slides video', { mode: 'or' }], ['design', { statuses: ['archived'] }], ['design', { types: ['catalogue', 'web-tool'] }], ['quickly deck', {}], ['', {}], ['the and of', {}], ['ai tools', {}]].forEach(([q, o]) => {
  const res = Search.search(RS, q, { ...o, types: o.types ? new Set(o.types) : null, statuses: o.statuses ? new Set(o.statuses) : null });
  rec('search', 'search', [RS, q, o], { tokens: res.tokens, results: res.results.map(x => ({ id: x.r.id, score: x.score, matched: x.matched, fields: x.fields, hit: x.hit })) }, 'opts.types/statuses are arrays here (Sets in JS); out lists ids');
});

// ---------- ideas ----------
{
  const manual = { r9: ['Existing'] }, labels = { 'youtube-channel': 'YouTube', catalogue: 'Catalogue', docs: 'Docs', 'article-site': 'Articles' };
  [[[], {}], [['design'], {}], [[], { min: 2, max: 2 }]].forEach(([names, o]) => rec('ideas', 'sectorIdeas', [RS, names, manual, labels, o],
    Ideas.sectorIdeas(RS, names, id => manual[id] || [], t => labels[t] || t, o), 'manualJobsOf(id) = manual[id] or []; typeLabel(t) = labels[t] or t'));
}

// ---------- week ----------
{
  const w1 = { doneAt: '2026-10-20', pickedAt: '2026-10-26', snooze: '', picks: [{ rid: 'r1', done: true }, { rid: 'r2', done: false }, { rid: 'r1', done: false }, { rid: 'r3' }, { rid: 'r4' }] };
  each('week', 'normWeekly', Week.normWeekly, [[null], [{}], [w1], [{ doneAt: 'bad', picks: 'x' }]]);
  each('week', 'resetDue', Week.resetDue, [[null, TODAY, 12], [null, TODAY, 5], [{ doneAt: '2026-10-25' }, TODAY, 40], [{ doneAt: '2026-10-20' }, TODAY, 40], [{ doneAt: '2026-10-01', snooze: '2026-11-02' }, TODAY, 40], [{ doneAt: '2026-10-01', snooze: '2026-10-30' }, TODAY, 40]]);
  [[w1, TODAY, ['r1', 'r2', 'r3']], [w1, '2026-11-02', ['r1', 'r2']], [w1, '2026-11-03', ['r1']], [w1, TODAY, ['r2']], [{}, TODAY, []]].forEach(([w, t, has]) => rec('week', 'activePicks', [w, t, has], Week.activePicks(w, t, id => has.includes(id)), 'has(id) = id is in the list'));
  rec('week', 'setPicks', [w1, ['r5', 'r5', 'r6', 'r7', 'r8'], TODAY], Week.setPicks(w1, ['r5', 'r5', 'r6', 'r7', 'r8'], TODAY));
  rec('week', 'togglePick', [w1, 'r2'], Week.togglePick(w1, 'r2')); rec('week', 'finishReset', [{ ...w1, snooze: '2026-11-05' }, TODAY], Week.finishReset({ ...w1, snooze: '2026-11-05' }, TODAY)); rec('week', 'snoozeReset', [w1, TODAY, 2], Week.snoozeReset(w1, TODAY, 2));
  const ctx = { needs: [{ r: RS[0], kind: 'check', sub: 'Check is due today' }, { r: RS[1], kind: 'trial', sub: 'Trial ends today' }, { r: RS[2], kind: 'changed', sub: 'The page changed' }], mission: { r: RS[3], name: 'Launch' }, stale: [RS[4]], drafts: [RS[12], RS[5]] };
  const sp = c => Week.suggestPicks(c); rec('week', 'suggestPicks', [{ ...ctx, needs: ctx.needs.map(x => ({ rid: x.r.id, kind: x.kind, sub: x.sub })), mission: { rid: 'r4', name: 'Launch' }, stale: ['r5'], drafts: ['r13', 'r6'] }], sp(ctx), 'in: resources are replaced by { rid } objects; the answer only uses ids');
  rec('week', 'suggestPicks', [{ needs: [], mission: null, stale: [], drafts: [] }], sp({ needs: [], mission: null, stale: [], drafts: [] }));
  const lg = [R('d1', { createdAt: '2026-10-25', log: [{ at: '2026-10-30', k: 'reviewed', t: 'Marked as reviewed' }, { at: '2026-10-20', k: 'reviewed', t: 'old' }, { at: '2026-10-29', k: 'checked', t: 'Checked' }, { at: '2026-10-31', k: 'learned', t: 'x' }, { at: '2026-10-27', k: 'merged', t: 'm' }, { at: '2026-10-28', k: 'status', t: 'To try to Trial' }, { at: '2026-10-28', k: 'verdict', t: 'Keep' }] }), R('d2', { createdAt: '2026-10-24', openedAt: Date.UTC(2026, 9, 26, 12) }), R('d3', { createdAt: '2026-10-31', openedAt: Date.UTC(2026, 9, 24, 12) })];
  rec('week', 'weekDigest', [lg, w1, TODAY], Week.weekDigest(lg, w1, TODAY), 'openedAt compares against local midnight of the first day: use UTC for the golden run (TZ=UTC)');
  rec('week', 'weekDigest', [[], null, TODAY], Week.weekDigest([], null, TODAY));
}

// ---------- time ----------
[['quick', { drafts: 9, easy: 4, attention: 5, overdueTrials: 1, missionLeft: 2, missionName: 'Launch', stale: 3, backupDue: true }], ['hour', { drafts: 20, easy: 4, attention: 12, overdueTrials: 0, missionLeft: 5, missionName: 'Launch', stale: 8, backupDue: true }], ['tired', { drafts: 9, easy: 4, attention: 5, overdueTrials: 2, missionLeft: 2, stale: 3, backupDue: false }], ['quick', { drafts: 0, attention: 0, missionLeft: 0 }], ['tired', { drafts: 0, easy: 0, overdueTrials: 0 }], ['hour', { drafts: 1, attention: 1, missionLeft: 1, stale: 1 }], ['quick', { attention: 2, missionLeft: 1, drafts: 1 }]]
  .forEach(([m, c]) => rec('time', 'timePlan', [m, c], Time.timePlan(m, c)));

// ---------- jump ----------
rec('jump', 'COMMANDS', [], Jump.COMMANDS, 'the whole list; port it as data');
{ const all = Jump.COMMANDS.map(c => c.id), missing = ['tags', 'tidy', 'install', 'ideas'];
  ['backup', 'back up my data', 'restore', 'tags', 'dupes', 'duplicates', 'reset', 'week', 'review', 'tidy', 'ideas', 'sector ideas', 'install', 'xyz', '', 'go to settings', 'insights', 'ca', 'cal'].forEach(q => {
    rec('jump', 'jumpMatches', [q, 4, { missing: [] }], Jump.jumpMatches(q, 4, () => true).map(c => c.id), 'has(id) = id is NOT in "missing"; out = command ids');
    rec('jump', 'jumpMatches', [q, 4, { missing }], Jump.jumpMatches(q, 4, id => !missing.includes(id)).map(c => c.id), 'has(id) = id is NOT in "missing"; out = command ids');
  }); void all; }

// ---------- install ----------
[{ standalone: true, protocol: 'https:' }, { protocol: 'file:' }, { protocol: 'file:', canPrompt: true }, { protocol: 'http:', host: 'example.com' }, { protocol: 'http:', host: 'localhost' }, { protocol: 'https:', host: 'x.app', canPrompt: true }, { protocol: 'https:', host: 'x.app' }, {}].forEach(o => rec('install', 'installState', [o], Inst.installState(o)));
each('install', 'badgeCount', Inst.badgeCount, [[0], [5], [99], [150], [-3], [null], ['7'], [2.9]]);
[[{ key: '/' }, false], [{ key: 'n' }, false], [{ key: 'N' }, false], [{ key: '?' }, false], [{ key: 'x' }, false], [{ key: 'n', ctrlKey: true }, false], [{ key: '/', metaKey: true }, false], [{ key: 'n' }, true]].forEach(a => rec('install', 'shortcutFor', a, Inst.shortcutFor(...a)));

// ---------- history / recent / choices ----------
{
  const lg = [{ at: '2026-10-01', k: 'reviewed', t: 'a' }, { at: 'bad', k: 'reviewed', t: 'b' }, { at: '2026-10-02', k: 'nope', t: 'c' }, { at: '2026-10-03', k: 'checked', t: 'd'.repeat(200) }];
  each('history', 'normLog', Hist.normLog, [[lg], [null], [Array.from({ length: 30 }, (_, i) => ({ at: '2026-10-' + String(i % 28 + 1).padStart(2, '0'), k: 'reviewed', t: 'e' + i }))]]);
  each('history', 'pushLog', Hist.pushLog, [[[], [['reviewed', 'Marked as reviewed']], TODAY], [[{ at: TODAY, k: 'reviewed', t: 'Marked as reviewed' }], [['reviewed', 'Marked as reviewed']], TODAY], [[{ at: '2026-10-30', k: 'checked', t: 'Checked' }], [['checked', 'Checked'], ['status', 'To try to Trial']], TODAY], [[], [['bogus', 'x']], TODAY], [null, [['learned', 'Wrote what I learned']], TODAY]]);
  each('history', 'showLog', Hist.showLog, [[[{ at: '2026-10-01', k: 'reviewed', t: 'a' }, { at: '2026-10-02', k: 'checked', t: 'b' }]]]);
  const rl = [{ k: 'r', id: 'r1', at: NOW - 60000 }, { k: 's', id: 'j1', at: NOW - 3600000 }, { k: 'x', id: 'bad', at: 1 }, { k: 'm', id: 't1', at: NOW - 86400000 * 3 }];
  each('recent', 'normRecent', Recent.normRecent, [[rl], [null]]);
  each('recent', 'pushVisit', Recent.pushVisit, [[rl, 'r', 'r1', NOW], [rl, 'r', 'r9', NOW], [[], 'm', 't1', NOW], [rl, 'x', 'a', NOW], [rl, 'r', '', NOW]]);
  [[rl, ['r:r1', 's:j1'], 5], [rl, ['m:t1'], 5], [rl, ['r:r1', 's:j1', 'm:t1'], 2]].forEach(([l, ex, n]) => rec('recent', 'liveVisits', [l, ex, n], Recent.liveVisits(l, (k, id) => ex.includes(k + ':' + id), n), 'exists(k, id) = "k:id" is in the list'));
  each('recent', 'agoText', Recent.agoText, [[NOW - 5000, NOW], [NOW - 120000, NOW], [NOW - 7200000, NOW], [NOW - 86400000, NOW], [NOW - 86400000 * 9, NOW], [NOW + 5000, NOW]]);
  each('choices', 'pushRecent', Choices.pushRecent, [[['a', 'b'], 'b'], [[], 'a'], [['1', '2', '3', '4', '5', '6', '7', '8'], '9'], [null, 'a']]);
  const jobs = [{ id: 'j1', name: 'Design', rule: null, members: ['r6', 'r7'] }, { id: 'j2', name: 'Video', rule: null, members: [] }, { id: 'j3', name: 'Auto', rule: { all: [] }, members: [] }, { id: 'j4', name: 'Docs', rule: null, members: ['r9'] }, { id: 'j5', name: 'Misc', rule: null, members: [] }, { id: 'j6', name: 'More', rule: null, members: [] }];
  [[RS[7], jobs, { fits: [{ job: jobs[0] }], recent: ['j2', 'j4'] }, 4], [RS[7], jobs, { fits: [], recent: [] }, 4], [RS[5], jobs, { fits: [{ job: jobs[0] }], recent: ['j1'] }, 2]]
    .forEach(([r, js, o, n]) => rec('choices', 'sectorChoices', [r, js, { fits: o.fits.map(x => x.job.id), recent: o.recent }, n], Choices.sectorChoices(r, js, o, n).map(x => ({ job: x.job.id, kind: x.kind })), 'in: fits is a list of job ids (JS passes {job}); out lists job ids'));
}

// ---------- merge / dupes ----------
rec('merge', 'mergePatch', [RS[0], RS[14]], Merge.mergePatch(RS[0], RS[14]));
rec('merge', 'mergePatch', [R('k', { title: 'Keep', url: 'https://k.test/', notes: 'mine', tags: ['a'], draft: true, opens: 2, createdAt: '2026-10-05' }), R('d', { title: 'Drop', url: 'https://d.test/x', notes: 'theirs', tags: ['A', 'b'], draft: true, opens: 3, createdAt: '2026-09-01', pinned: true })], Merge.mergePatch(R('k', { title: 'Keep', url: 'https://k.test/', notes: 'mine', tags: ['a'], draft: true, opens: 2, createdAt: '2026-10-05' }), R('d', { title: 'Drop', url: 'https://d.test/x', notes: 'theirs', tags: ['A', 'b'], draft: true, opens: 3, createdAt: '2026-09-01', pinned: true })));
[[[]], [['slides.example.org']]].forEach(([ig]) => rec('merge', 'dupeGroups', [RS, ig], Merge.dupeGroups(RS, ig).map(g => ({ key: g.key, ids: ids(g.items), exact: g.exact }))));

// ---------- mission / insights / home ----------
{
  const t = { id: 't1', name: 'Route', steps: [{ rid: 'r1', note: '', done: true, doneAt: '2026-10-30' }, { rid: 'gone', note: '', done: false, doneAt: '' }, { rid: 'r2', note: '', done: false, doneAt: '' }, { rid: 'r3', note: '', done: false, doneAt: '' }] };
  const has = id => byId.has(id);
  rec('mission', 'progress', [t, 'ids of RS'], Mission.progress(t, has), 'has(id) = id is in the shared link list (r1..r16)');
  rec('mission', 'liveSteps', [t, 'ids of RS'], Mission.liveSteps(t, has));
  rec('mission', 'pickActive', [[t, { ...t, id: 't2', steps: [] }], 't2', 'ids of RS'], Mission.pickActive([t, { ...t, id: 't2', steps: [] }], 't2', has));
  rec('mission', 'pickActive', [[t], '', 'ids of RS'], Mission.pickActive([t], '', has));
  rec('insights', 'mostUsed', [RS, 3], Insights.mostUsed(RS, 3).map(x => x.id), 'out lists ids');
  rec('insights', 'addedPerMonth', [RS, TODAY, 3], Insights.addedPerMonth(RS, TODAY, 3));
  rec('insights', 'looseEnds', [RS, { r9: ['Existing'] }], (() => { const l = Insights.looseEnds(RS, id => ({ r9: ['Existing'] }[id] || [])); return { noSector: ids(l.noSector), noWords: ids(l.noWords) }; })(), 'manualJobsOf(id) = map[id] or []; out lists ids');
  each('insights', 'storageInfo', Insights.storageInfo, [[0], [500000], [3000000], [9000000], [2048, 4096]]);
  each('home', 'normShelves', Home.normShelves, [[null], [['a', 'b', 'a', 'c', 'd', 'e']], [[1, 'x', '']]]);
  rec('home', 'shelfList', [['r1', 'r2', 'r4', 'zz', 'r11', 'r10', 'r6'], 3], Home.shelfList(['r1', 'r2', 'r4', 'zz', 'r11', 'r10', 'r6'], id => byId.get(id), 3).map(r => r.id), 'byId(id) looks in the shared link list; out lists ids');
  rec('home', 'shelfList', [['r1', 'r2', 'r4', 'zz', 'r11', 'r10', 'r6'], 8], Home.shelfList(['r1', 'r2', 'r4', 'zz', 'r11', 'r10', 'r6'], id => byId.get(id), 8).map(r => r.id));
  rec('home', 'launchable', [RS], RS.map(r => ({ id: r.id, v: !!Home.launchable(r) })), 'one boolean per link');
  ['fav', 'recent'].forEach(m => rec('home', 'launchList', [RS, m, 5], Home.launchList(RS, m, 5).map(r => r.id)));
  rec('home', 'reviewQueue', [RS, []], Home.reviewQueue(RS, []).map(r => r.id)); rec('home', 'reviewQueue', [RS, ['r13']], Home.reviewQueue(RS, ['r13']).map(r => r.id));
  each('home', 'normHome', Home.normHome, [[null], [{ order: ['launch', 'needs', 'bogus'], hide: ['sectors', 'nope'] }]]);
  rec('home', 'visibleTiles', [{ order: ['launch', 'needs'], hide: ['needs'] }], Home.visibleTiles({ order: ['launch', 'needs'], hide: ['needs'] }));
  rec('home', 'TILES', [], Home.TILES);
}

// ---------- fields / rules (only the parts that are plain data in -> data out) ----------
try { each('fields', 'normFields', Fields.normFields, [[{ limit: '100/day', resets: '2026-11-05', plan: 'free', junk: 'x' }], [null], [{ limit: 5 }]]); } catch (e) { console.log('skipped fields.normFields:', e.message); }
{
  const rules = [null, { match: 'all', conds: [{ f: 'tag', op: 'has', v: '#design' }] }, { match: 'any', conds: [{ f: 'type', op: 'is', v: 'docs' }, { f: 'tag', op: 'has', v: 'video' }] }, { match: 'all', conds: [{ f: 'status', op: 'is', v: 'archived' }] }, { match: 'all', conds: [{ f: 'tag', op: 'nohas', v: 'design' }, { f: 'draft', op: 'no', v: '' }] }, { conds: [{ f: 'text', op: 'contains', v: 'slides' }, { f: 'bad field!', op: 'is', v: 'x' }, { f: 'type', op: 'is', v: '' }, { f: 'nope', op: 'zzz', v: '1' }] }, { match: 'all', conds: [] }, { match: 'all', conds: [{ f: 'lastChecked', op: 'older', v: '20' }] }, { match: 'all', conds: [{ f: 'limit', op: 'filled', v: '' }] }];
  rules.forEach(rule => rec('rules', 'normRule', [rule], Rules.normRule(rule)));
  rules.forEach(rule => rec('rules', 'matches', ['$RS', rule, TODAY], RS.filter(r => Rules.matches(r, rule, TODAY)).map(r => r.id), 'in[0] is the shared link list; out = ids of the links that match'));
}

// ---------- write ----------
// ---------- round 2: the exported functions and constants the first golden set did not cover (screens depend on them) ----------
{
  const mkJob = (id, name, members, x = {}) => ({ id, name, color: '#007AFF', members, rule: null, ...x });
  const cst = (mod, name, v) => rec(mod, name, [], v, 'constant: the Dart value must equal this');
  const look = id => byId.get(id) || null;

  // util
  each('util', 'clamp', Util.clamp, [[5, 0, 3], [-1, 0, 3], [2, 0, 3], [1.5, 1, 2]]);
  each('util', 'lerp', Util.lerp, [[0, 10, 0.25], [2, 4, 1], [5, 5, 0.5]]);
  each('util', 'damp', Util.damp, [[0, 10, 4, 0.1], [5, 5, 10, 1], [0, 1, 20, 0.016]]);
  each('util', 'hash32', Util.hash32, ['a', 'hello', '', 'नमस्ते', 'Nexus 3.3'].map(x => [x]));
  each('util', 'uniq', Util.uniq, [[[1, 2, 2, 3, 1]], [['b', 'a', 'b']], [[]]]);
  each('util', 'esc', Util.esc, [['<a href="x">Tom & \'Jerry\'</a>'], [null], [5], ['plain']]);
  each('util', 'relDays', Util.relDays, [0, 1, -1, 3, -5].map(x => [x]));
  each('util', 'fmtDate', Util.fmtDate, ['2026-10-31', '2026-01-05', '', 'bad'].map(x => [x]));
  ['2026-10-31', '', 'bad', '2026-02-30', '2026-10-31T12:00:00Z', '2026-1-5'].forEach(s => { const d = Util.parseISO(s); rec('util', 'parseISO', [s], d ? { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() } : null, 'out = {y, m, d} of the local date, or null'); });
  [[2026, 10, 31], [2026, 1, 5], [2027, 12, 1]].forEach(a => rec('util', 'iso', a, Util.iso(new Date(a[0], a[1] - 1, a[2])), 'in = [year, month, day]; out = yyyy-mm-dd'));

  // dupes (site index helpers). Plain {id, url, src} objects are enough: the functions read only those.
  const DL = [{ id: 'd1', title: 'T1', url: 'https://github.com/alice/a' }, { id: 'd2', title: 'T2', url: 'https://github.com/bob/b' }, { id: 'd3', title: 'T3', url: 'https://news.example.org/a' }, { id: 'd4', title: 'T4', url: 'https://news.example.org/b' }, { id: 'd5', title: 'T5', url: 'https://www.youtube.com/@x/videos' }, { id: 'd6', title: 'T6', url: 'https://instagram.com/someone', src: 'following' }, { id: 'd7', title: 'T7', url: 'https://github.com/alice/a/' }, { id: 'd8', title: 'T8', url: '' }];
  const idxObj = m => Object.fromEntries([...m].map(([k, v]) => [k, v.map(x => x.id)]));
  rec('dupes', 'siteIndex', [DL], idxObj(Dupes.siteIndex(DL)), 'out = { siteKey: [ids] }');
  { const idx = Dupes.siteIndex(DL); ['d1', 'd2', 'd3', 'd5', 'd6', 'd7', 'd8'].forEach(i => { const r = DL.find(x => x.id === i); rec('dupes', 'sameSite', [r, DL], Dupes.sameSite(r, idx).map(x => ({ id: x.r.id, same: x.same })), 'in[1] = the list the index is built from (siteIndex(list)); out = [{id, same}]'); }); }
  [[{ url: 'https://github.com/alice/z', title: 'New A' }, { url: 'https://news.example.org/zz', title: 'New N' }], [{ url: 'https://a.example/x', title: 'P1' }, { url: 'https://a.example/y', title: 'P2' }, { url: 'https://github.com/alice/a', title: 'Same' }], [{ url: 'https://instagram.com/q', src: 'following' }], []].forEach(es => rec('dupes', 'flagEntries', [es, DL], Dupes.flagEntries(es, DL).map(x => ({ entry: x.entry.url, others: x.others })), 'out = [{entry: url, others: [{title, url, saved}]}]'));

  // search
  [['Slides converter for pdf', ['slides', 'pdf']], ['', ['x']], ['Hello & goodbye', []], ['The AI is here', ['ai']], ['Cats and cat toys', ['cats']], ['a<b>c', ['b']], ['Price (free) + more', ['free+', '(free']]].forEach(a => rec('search', 'highlight', a, Search.highlight(...a)));
  const TH = [{ id: 't1', name: 'A', steps: [{ rid: 'r1' }, { rid: 'r2' }, { rid: 'r1' }] }, { id: 't2', name: 'B', steps: [{ rid: 'r2' }] }, { id: 't3', name: 'C', steps: [{ rid: 'r9' }] }, { id: 't4', name: 'D', steps: [] }];
  [['r1', 'r2'], ['r2'], ['zz'], []].forEach(a => rec('search', 'threadsFor', [a, TH], Search.threadsFor(a, TH).map(x => ({ id: x.t.id, n: x.n })), 'out = [{id, n}] best first'));
  ['r1', 'r4', 'r6', 'r2', 'r16', 'r13'].forEach(rid => rec('search', 'suggestLinks', [rid, '$RS', 4], Search.suggestLinks(byId.get(rid), RS, 4).map(x => ({ id: x.r.id, score: x.score })), 'in[0] = id of a link in the shared list; in[1] = the shared list; out = [{id, score}]'));
  rec('search', 'suggestLinks', ['r6', '$RS', 2], Search.suggestLinks(byId.get('r6'), RS, 2).map(x => ({ id: x.r.id, score: x.score })), 'k = 2');
  const JB = [mkJob('j1', 'Design', ['r4', 'r5', 'r6', 'r7']), mkJob('j2', 'Video', ['r2', 'r12']), mkJob('j3', 'Slides', ['r1']), mkJob('j4', 'Empty', [])];
  ['r8', 'r2', 'r3', 'r13', 'r1'].forEach(rid => rec('search', 'suggestJobs', [rid, JB, 3], Search.suggestJobs(byId.get(rid), JB, look, 3).map(x => ({ id: x.j.id, score: x.score })), 'in[0] = id of a link in the shared list; byId(id) looks in the shared list; out = [{id, score}]'));
  cst('search', 'STOP', Search.STOP); cst('search', 'FIELD_LABEL', Search.FIELD_LABEL); cst('search', 'FIELD_WEIGHT', Search.FIELD_WEIGHT);

  // insights
  const CU = [R('c1', { url: 'https://c1.test/', opens: 1, openedAt: Date.UTC(2026, 5, 1, 12) }), R('c2', { url: 'https://c2.test/', opens: 2, openedAt: Date.UTC(2026, 6, 1, 12) }), R('c3', { url: 'https://c3.test/', opens: 1, openedAt: Date.UTC(2026, 5, 1, 12), pinned: true }), R('c4', { url: 'https://c4.test/', locked: true }), R('c5', { url: 'https://c5.test/' }), R('c6', { url: 'https://c6.test/', opens: 1, openedAt: Date.UTC(2026, 9, 20, 12) }), R('c7', { url: 'https://c7.test/', status: 'testing' }), R('c8', { url: 'https://c8.test/', opens: 1, openedAt: Date.UTC(2026, 5, 2, 12) }), R('c9', { title: 'Alpha', url: 'https://c9.test/' })];
  [['', []], ['2026-10-01', []], ['2026-08-01', []], ['2026-08-01', ['c8']], ['bad-date', []]].forEach(([since, inm]) => {
    const o = Insights.cullInfo(CU, { opensSince: since, today: TODAY, inMission: new Set(inm) });
    rec('insights', 'cullInfo', [CU, { opensSince: since, today: TODAY, inMission: inm }], { ready: o.ready, daysTracked: o.daysTracked, waitDays: o.waitDays, since: o.since, list: o.list.map(x => ({ id: x.r.id, idle: x.idle })) }, 'ctx.inMission is an array here (a Set in JS); out lists ids');
  });
  const SJ = [mkJob('j1', 'Design', ['r4', 'r5', 'r6', 'r7', 'r13', 'r10']), mkJob('j2', 'Video', ['r2', 'r12'], { rule: { match: 'all', conds: [{ f: 'type', op: 'is', v: 'youtube-channel' }] } }), mkJob('j3', 'Empty', []), mkJob('j4', 'Old', ['r10']), mkJob('j5', 'Alpha', ['r1', 'r9'])];
  rec('insights', 'sectorShare', [SJ], Insights.sectorShare(SJ, look), 'byId(id) looks in the shared list');
  cst('insights', 'IDLE_DAYS', Insights.IDLE_DAYS);

  // home
  const ND = [R('n1', { title: 'Overdue check', url: 'https://n1.test/', checkCadence: 'weekly', lastChecked: '2026-10-01', nextCheck: '2026-10-20' }), R('n2', { title: 'Due today', url: 'https://n2.test/', checkCadence: 'weekly', lastChecked: '2026-10-24', nextCheck: TODAY }), R('n3', { title: 'Trial ending', url: 'https://n3.test/', status: 'testing', trialEnd: '2026-11-02' }), R('n4', { title: 'Trial over', url: 'https://n4.test/', status: 'testing', trialEnd: '2026-10-28' }), R('n5', { title: 'Page changed', url: 'https://n5.test/', watch: { on: true, at: TODAY, fp: 'x', changed: TODAY, what: ['Price changed'] } }), R('n6', { title: 'Limit resets', url: 'https://n6.test/', fields: { limit: '1M tokens', resets: '2026-11-03' } }), R('n7', { title: 'Reset past', url: 'https://n7.test/', fields: { resets: '2026-10-29' } }), R('n8', { title: 'Archived', url: 'https://n8.test/', status: 'archived', checkCadence: 'weekly', nextCheck: '2026-10-01' }), R('n9', { title: 'Fine', url: 'https://n9.test/' })];
  const fns = { trialBucket: St.trialBucket, dueBucket: St.dueBucket, resetBucket: St.resetBucket, watchChanged: St.watchChanged };
  [TODAY, '2026-11-10'].forEach(t => rec('home', 'needsItems', [ND, t], Home.needsItems(ND, fns, t).map(x => ({ id: x.r.id, kind: x.kind, rank: x.rank, sub: x.sub })), 'fns = the store\'s dueBucket, trialBucket, resetBucket, watchChanged (golden: store.json); out = [{id, kind, rank, sub}]'));
  [{ drafts: 3, stale: 2, total: 20, pins: 1 }, { drafts: 1, stale: 0, total: 20, pins: 1 }, { drafts: 0, stale: 2, total: 20, pins: 1 }, { drafts: 0, stale: 1, total: 20, pins: 1 }, { drafts: 0, stale: 0, total: 10, pins: 0 }, { drafts: 0, stale: 0, total: 3, pins: 0 }, { drafts: 0, stale: 0, total: 10, pins: 2 }].forEach(c => rec('home', 'nextAction', [c], Home.nextAction(c)));
  [[3, 0], [3, 5], [2, -4], [10, 0]].forEach(([n, s]) => rec('home', 'exampleQueries', ['$RS', n, s], Home.exampleQueries(RS, n, s)));
  rec('home', 'exampleQueries', [[], 3, 0], Home.exampleQueries([], 3, 0));
  cst('home', 'MAX_SHELVES', Home.MAX_SHELVES);

  // fields
  each('fields', 'keyFor', Fields.keyFor, ['Free limit', '  Hello World!! ', '', 'काम', 'A very long label that exceeds twenty chars', null].map(x => [x]));
  const CF1 = [{ label: 'Rating', kind: 'choice', options: 'Good, Bad ,Good' }, { label: 'Cost', kind: 'text' }, { label: 'Notes', kind: 'bogus', types: ['web-tool', 'nope'] }, { label: 'Pick', kind: 'choice' }, { label: 'rating' }, { key: 'c_x', label: 'X', kind: 'date', types: [] }, null, 'str', { label: '' }];
  [[CF1, ['web-tool', 'docs']], [CF1, null], [null, null], [[], null]].forEach(a => rec('fields', 'normCustom', a, Fields.normCustom(a[0], a[1] || undefined), 'in[1] = list of valid types, or null for any'));
  const CUS = Fields.normCustom(CF1, undefined); const keys = l => l.map(d => d.key);
  [['ai-source', []], ['social', []], ['web-tool', CUS], ['docs', CUS]].forEach(a => rec('fields', 'defsFor', a, keys(Fields.defsFor(...a)), 'out = keys of the fields, in order'));
  rec('fields', 'allDefs', [CUS], keys(Fields.allDefs(CUS)), 'out = keys'); rec('fields', 'allDefs', [[]], keys(Fields.allDefs([])), 'out = keys');
  [['cost', []], ['c_x', CUS], ['zzz', []], ['rating', CUS]].forEach(a => rec('fields', 'defOf', a, Fields.defOf(...a)));
  [['cost', []], ['zzz', []], ['c_x', CUS]].forEach(a => rec('fields', 'labelOf', a, Fields.labelOf(...a)));
  const FR = [{ type: 'ai-source', fields: { cost: 'Free', limit: '1M tokens', resets: '2026-11-05', handle: '@x', c_x: '2026-12-01', zz: 'junk' } }, { type: 'social', fields: {} }, { type: 'other' }];
  FR.forEach(r => rec('fields', 'filled', [r, CUS], Fields.filled(r, CUS).map(x => ({ key: x.def.key, value: x.value })), 'in[0] = {type, fields}; out = [{key, value}]'));
  [[FR[0], CUS, []], [FR[0], CUS, ['cost']], [FR[1], CUS, []], [FR[2], [], []]].forEach(a => rec('fields', 'summaryOf', a, Fields.summaryOf(...a), 'in[0] = {type, fields}'));
  cst('fields', 'BUILTIN', Fields.BUILTIN); cst('fields', 'CUSTOM_KINDS', Fields.CUSTOM_KINDS); cst('fields', 'KIND_LABEL', Fields.KIND_LABEL);

  // rules
  cst('rules', 'OPS', Rules.OPS); cst('rules', 'PRESETS', Rules.PRESETS);
  each('rules', 'needsValue', Rules.needsValue, [...Object.keys(Rules.OPS), 'bogus'].map(x => [x]));
  each('rules', 'opsFor', Rules.opsFor, ['choice', 'text', 'tags', 'date', 'age', 'bool', 'zzz'].map(x => [x]));
  rec('rules', 'ruleFields', [{}], Rules.ruleFields({}).map(f => ({ ...f, options: f.options === undefined ? null : f.options })), 'a field without options has options: null');
  { const c = { types: ['web-tool', 'docs'], statuses: [{ v: 'active', l: 'Active' }], cadences: ['daily'], custom: CUS }; rec('rules', 'ruleFields', [c], Rules.ruleFields(c).map(f => ({ key: f.key, label: f.label, kind: f.kind, options: f.options === undefined ? null : f.options })), 'options are {v, l}, or null'); }
  const MR = [R('m1', { title: 'Alpha tool', url: 'https://m1.test/', type: 'ai-source', tags: ['ai', 'design'], lastChecked: '2026-08-01', trialEnd: '2026-11-03', draft: true, fields: { cost: 'Free', resets: '2026-11-20' }, scan: { at: TODAY, via: 'offline', topic: 'study', conf: 'maybe', basis: 'title', desc: 'd', site: 's' }, notes: 'Some NOTE here' }), R('m2', { title: 'Beta', url: 'https://m2.test/', type: 'docs', status: 'testing' })];
  [[0, { f: 'type', op: 'is', v: 'ai-source' }], [0, { f: 'type', op: 'not', v: 'ai-source' }], [0, { f: 'tag', op: 'has', v: '#design' }], [0, { f: 'tag', op: 'nohas', v: 'design' }], [1, { f: 'tag', op: 'has', v: 'ai' }], [0, { f: 'text', op: 'contains', v: 'note' }], [0, { f: 'text', op: 'contains', v: '' }], [0, { f: 'cost', op: 'is', v: 'free' }], [0, { f: 'cost', op: 'filled', v: '' }], [1, { f: 'cost', op: 'empty', v: '' }], [0, { f: 'trialEnd', op: 'soon', v: '7' }], [0, { f: 'trialEnd', op: 'soon', v: '1' }], [1, { f: 'trialEnd', op: 'soon', v: '7' }], [0, { f: 'resets', op: 'soon', v: 'abc' }], [0, { f: 'lastChecked', op: 'older', v: '60' }], [1, { f: 'lastChecked', op: 'older', v: '60' }], [0, { f: 'draft', op: 'yes', v: '' }], [1, { f: 'draft', op: 'no', v: '' }], [0, { f: 'topic', op: 'is', v: 'study' }], [0, { f: 'status', op: 'is', v: 'active' }], [0, { f: 'type', op: 'bogus', v: 'x' }]]
    .forEach(([i, c]) => rec('rules', 'condMatches', [MR[i], c, TODAY], Rules.condMatches(MR[i], c, TODAY)));
  [{ match: 'all', conds: [{ f: 'status', op: 'is', v: 'archived' }] }, { match: 'all', conds: [{ f: 'type', op: 'is', v: 'docs' }] }, null].forEach(r => rec('rules', 'mentionsStatus', [r], Rules.mentionsStatus(r)));
  Rules.PRESETS.forEach(p => rec('rules', 'describeRule', [p.rule, {}], Rules.describeRule(p.rule, {})));
  { const c = { types: [{ v: 'ai-source', l: 'AI source' }], custom: CUS }; rec('rules', 'describeRule', [Rules.PRESETS[0].rule, c], Rules.describeRule(Rules.PRESETS[0].rule, c)); }
  [{ match: 'all', conds: [] }, null, { match: 'any', conds: [{ f: 'zzz', op: 'is', v: 'q' }, { f: 'draft', op: 'yes', v: '' }] }].forEach(r => rec('rules', 'describeRule', [r, {}], Rules.describeRule(r, {})));

  // store: the small pure rules the alerts use (needsItems above calls them)
  const SB = (id, x) => R(id, { url: 'https://' + id + '.test/', ...x });
  [SB('s1', { checkCadence: 'weekly', nextCheck: '2026-10-20' }), SB('s2', { checkCadence: 'weekly', nextCheck: TODAY }), SB('s3', { checkCadence: 'weekly', nextCheck: '2026-11-05' }), SB('s4', { checkCadence: 'weekly', nextCheck: '2026-12-31' }), SB('s5', { checkCadence: 'none' }), SB('s6', { status: 'archived', checkCadence: 'weekly', nextCheck: '2026-10-01' })].forEach(r => rec('store', 'dueBucket', [r, TODAY], St.dueBucket(r, TODAY)));
  [SB('s1', { status: 'candidate', statusSince: '2026-09-01' }), SB('s2', { status: 'candidate', statusSince: '2026-10-25' }), SB('s3', { status: 'testing', statusSince: '2026-08-01', lastChecked: '2026-10-30' }), SB('s4', { status: 'active', createdAt: '2026-08-01' }), SB('s5', { status: 'active', createdAt: '2026-08-01', lastChecked: '2026-09-01' }), SB('s6', { status: 'active', createdAt: '2026-10-25' }), SB('s7', { status: 'archived', createdAt: '2020-01-01' })].forEach(r => rec('store', 'staleInfo', [r, TODAY], St.staleInfo(r, TODAY)));
  ['2026-10-30', '2026-10-31', '2026-11-03', '2026-11-04', ''].forEach(t => rec('store', 'trialBucket', [SB('s1', { status: 'testing', trialEnd: t }), TODAY], St.trialBucket(SB('s1', { status: 'testing', trialEnd: t }), TODAY)));
  rec('store', 'trialBucket', [SB('s2', { status: 'active', trialEnd: '2026-10-30' }), TODAY], St.trialBucket(SB('s2', { status: 'active', trialEnd: '2026-10-30' }), TODAY), 'only a link in stage "testing" has a trial');
  ['2026-10-27', '2026-10-28', '2026-10-31', '2026-11-07', '2026-11-08', 'bad', ''].forEach(t => rec('store', 'resetBucket', [SB('s1', { fields: { resets: t } }), TODAY], St.resetBucket(SB('s1', { fields: { resets: t } }), TODAY)));
  [{ on: true, changed: TODAY }, { on: true, changed: '' }, { on: false, changed: TODAY }, null].forEach(w => { const r = SB('s1', { watch: w ? { on: w.on, at: TODAY, fp: 'x', changed: w.changed, what: [] } : null }); rec('store', 'watchChanged', [r], St.watchChanged(r)); });
  { const r = SB('s2', { status: 'archived', watch: { on: true, at: TODAY, fp: 'x', changed: TODAY, what: [] } }); rec('store', 'watchChanged', [r], St.watchChanged(r), 'archived links never alert'); }
  for (const k of ['TYPES', 'STATUSES', 'CADENCES', 'CADENCE_DAYS', 'STALE_CANDIDATE_DAYS', 'STALE_UNCHECKED_DAYS', 'STALE_TESTING_DAYS', 'SCHEMA', 'JOB_COLORS', 'STAR_COLORS', 'PLANET_COLORS', 'DEFAULT_SETTINGS']) cst('store', k, St[k]);

  // constants of the small modules
  cst('week', 'RESET_EVERY', Week.RESET_EVERY); cst('week', 'PICKS_LIVE', Week.PICKS_LIVE); cst('week', 'MAX_PICKS', Week.MAX_PICKS);
  cst('time', 'MODES', Time.MODES); cst('history', 'LOG_MAX', Hist.LOG_MAX); cst('history', 'LOG_KINDS', Hist.LOG_KINDS);
  cst('recent', 'RECENT_MAX', Recent.RECENT_MAX); cst('choices', 'RECENT_MAX', Choices.RECENT_MAX);
}

// ---------- round 3: the store as a whole. Scenarios: start data + a list of operations -> what the state looks like afterwards ----------
// The Dart NexusStore must behave the same. A scenario is { start, ops: [[name, ...args], ...], state?: false }.
//  - start = a name in _store_start.json, or an inline backup object. It goes through the same load path as a real file.
//  - every op calls the store function of that name with those JSON args (bulkUpdate takes [ids, patchObject, options]).
//  - out = { returns: [one per op], events: [[kind, ids]...], before: [safety-copy reasons], state: {resources, jobs, threads, settings, game} }.
//  - A function that throws is recorded as { throws: message }. undefined results are null. A result that is a link, sector or mission is written as { id }.
//  - New ids: the Dart store takes an id generator. Use prefix + P + 5 digits (P is in the note). Before comparing, rename every id of that shape
//    that was not in the start data to $N1, $N2 ... in sorted order (same rule on both sides); then compare the whole out.
//  - Dates: today is 2026-10-31, "now" is 2026-10-31T12:00:00.000Z (milliseconds 1793448000000). The store must take both from an injected clock.
{
  const START = {
    mini: {
      resources: [
        { id: 'a1', title: 'Alpha tool', url: 'https://alpha.test/', type: 'ai-source', tags: ['ai', 'design'], checkCadence: 'weekly', lastChecked: '2026-10-20', nextCheck: '2026-10-27', useWhen: ['design a logo'], opens: 2, openedAt: 1793000000000 },
        { id: 'a2', title: 'Beta draft', url: 'https://beta.test/', tags: ['design'], draft: true, createdAt: '2026-10-29' },
        { id: 'a3', title: 'Gamma locked', url: 'https://gamma.test/x?utm_source=q', locked: true, tags: ['ai'] },
        { id: 'a4', title: 'Delta trial', url: 'https://delta.test/', type: 'web-tool', status: 'testing', trialEnd: '2026-11-02', fields: { limit: '5/day', resets: '2026-11-03' } },
        { id: 'a5', title: 'Epsilon old', url: 'https://eps.test/', status: 'archived', tags: ['old'] },
        { id: 'a6', title: 'Zeta no link', pinned: true, related: ['a1'] }
      ],
      jobs: [
        { id: 'j1', name: 'Design', color: '#FF6B6B', members: ['a1', 'a2'], slot: 0 },
        { id: 'j2', name: 'Tools', color: '#4DABF7', members: ['a3', 'a4'], slot: 1 },
        { id: 'j3', name: 'AI sources', color: '#51CF66', members: [], slot: 2, rule: { match: 'all', conds: [{ f: 'type', op: 'is', v: 'ai-source' }] } }
      ],
      threads: [{ id: 't1', name: 'Launch', steps: [{ rid: 'a1', note: 'first', done: true, doneAt: '2026-10-29T09:00:00.000Z' }, { rid: 'a2', note: '', done: false, doneAt: '' }, { rid: 'a4', note: '', done: false, doneAt: '' }] }],
      settings: { intro: false, recentJobs: ['j1'], weekly: { doneAt: '', pickedAt: '2026-10-26', snooze: '', picks: [{ rid: 'a2', done: false }, { rid: 'a4', done: true }] } }
    },
    dirty: {
      resources: [{ id: 'd1', title: 'One', url: 'https://one.test/', related: ['d1', 'd2', 'zz'] }, { id: 'd1', title: 'Same id again' }, { id: 'd2', title: 'Two', tags: 'x, #Y ,x' }, 'junk', null, { title: 'No id' }],
      jobs: [{ id: 'j1', name: 'A', members: ['d1', 'd1', 'zz', 'd2'], slot: 3 }, { id: 'j2', name: 'B', members: [], slot: 3 }, { id: 'j3', name: 'C', members: ['d2'] }, { name: '' }],
      threads: [{ id: 't1', name: 'T', steps: ['d1', { rid: 'zz' }, { rid: 'd2', done: true }, { note: 'no rid' }] }],
      settings: { theme: 'dark', junkKey: 'kept', recentJobs: ['j1', 5, 'j2'], dupeIgnore: ['a|b', 7], customFields: [{ label: 'Rating', kind: 'choice', options: 'Good, Bad' }], shelves: [{ job: 'j1' }, { job: 'j1' }, { job: 'j2' }], siteIcons: 'yes', badge: 0 },
      game: { xp: 5 }
    }
  };
  const P = Date.UTC(2026, 9, 31, 12).toString(36).slice(-5);
  const NEWID = new RegExp('^[rjt]' + P + '[0-9a-z]{5}$');
  const EV = [], BEF = [];
  St.on('change', e => EV.push([e.kind, e.ids || []])); St.on('before-bulk', r => BEF.push(r)); St.on('settings', e => EV.push(['settings', [e.key]]));
  const isEntity = v => v && typeof v === 'object' && !Array.isArray(v) && typeof v.id === 'string' && ('title' in v || 'members' in v || 'steps' in v);
  const dig = v => v === undefined ? null : Array.isArray(v) ? v.map(dig) : isEntity(v) ? { id: v.id } : (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dig(x)])) : v);
  const runScenario = sc => {
    let n = 0; const realRandom = Math.random; Math.random = () => (++n + 0.5) / 36 ** 5;
    EV.length = 0; BEF.length = 0; globalThis.localStorage._d = {};
    const seed = typeof sc.start === 'string' ? START[sc.start] : sc.start;
    St.load(JSON.parse(JSON.stringify(seed)));
    EV.length = 0; BEF.length = 0;   // only what the ops cause
    const startIds = new Set(JSON.stringify(St.state).match(/"[rjt][0-9a-z]+"/g) || []);
    const returns = sc.ops.map(([name, ...args]) => {
      try {
        if (name === 'bulkUpdate') { const [ids, patch, o] = args; return dig(St.bulkUpdate(ids, () => ({ ...patch }), o || {})); }
        if (typeof St[name] !== 'function') throw new Error('no such store function: ' + name);
        return dig(St[name](...args));
      } catch (e) { return { throws: String((e && e.message) || e) }; }
    });
    Math.random = realRandom;
    const out = { returns, events: EV.map(x => [...x]), before: [...BEF] };
    if (sc.state !== false) out.state = clean({ resources: St.state.resources, jobs: St.state.jobs, threads: St.state.threads, settings: St.state.settings, game: St.state.game });
    let txt = JSON.stringify(clean(out));
    const fresh = [...new Set((txt.match(/"[rjt][0-9a-z]{10}"/g) || []).map(s => s.slice(1, -1)).filter(s => NEWID.test(s)))].sort();
    fresh.forEach((id, i) => { txt = txt.split('"' + id + '"').join('"$N' + (i + 1) + '"'); });
    return JSON.parse(txt);
  };
  const S = (name, start, ops, extra = {}) => { const sc = { name, start, ops, ...extra }; rec('store_ops', 'scenario', [sc], runScenario(sc), 'see the header of tools/gen_golden.mjs round 3 and docs/PLAN.md T1.8; new ids are masked as $N1.. in sorted order'); };
  S('add one, add a repeat, add empty', 'mini', [['addResource', { title: 'New tool', url: 'https://new.test/a?utm_source=x', tags: ['a', 'B'] }, ['j1']], ['addResource', { url: 'https://new.test/a' }], ['addResource', {}], ['addResource', { id: 'given', title: 'Has id', type: 'ai-source' }, ['j2', 'j3', 'nope']]]);
  S('add many with repeats and deleted links', 'mini', [['deleteResource', 'a1'], ['addMany', [{ url: 'https://m1.test/', title: 'M1' }, { url: 'https://beta.test', title: 'Same as a2' }, { url: 'https://m1.test/?utm_source=q', title: 'M1 again' }, { title: 'No link' }, { url: 'https://alpha.test/', title: 'Alpha back' }], ['j2']], ['wasDeleted', 'https://alpha.test/'], ['addMany', [{ url: 'https://solo.test/' }]]]);
  S('update: review, stage, cadence, learned', 'mini', [['updateResource', 'a2', { draft: false }], ['updateResource', 'a2', { status: 'testing', learned: 'works well' }], ['updateResource', 'a1', { checkCadence: 'monthly' }], ['updateResource', 'a1', { lastChecked: '2026-10-31' }], ['updateResource', 'a6', { checkCadence: 'daily' }], ['updateResource', 'nope', { title: 'x' }], ['updateResource', 'a4', { title: 'Delta renamed', tags: 'x, y' }, true], ['setField', 'a1', 'cost', 'Free'], ['setField', 'a1', 'resets', 'not a date']]);
  S('bulk update with a locked link', 'mini', [['bulkUpdate', ['a1', 'a2', 'a3'], { pinned: true }], ['bulkUpdate', ['a3'], { tags: ['forced'] }, { includeLocked: true }], ['bulkUpdate', ['a1'], { notes: 'one only' }], ['bulkUpdate', ['a1'], { notes: 'with reason' }, { reason: 'Before test' }], ['bulkUpdate', ['nope'], { notes: 'x' }]]);
  S('delete and delete many', 'mini', [['deleteResource', 'a3'], ['deleteResource', 'nope'], ['setLocked', 'a3', false], ['deleteResource', 'a3'], ['deleteMany', ['a1', 'a2', 'a6', 'nope']], ['deleteMany', ['nope']], ['findByUrl', 'https://delta.test'], ['findByUrl', 'https://alpha.test/'], ['wasDeleted', 'https://alpha.test'], ['deletedCount']]);
  S('merge', 'mini', [['link', 'a2', 'a4'], ['updateResource', 'a2', { tags: ['design', 'new-tag'], notes: 'beta note', learned: 'beta learned' }], ['mergeResources', 'a1', 'a2'], ['mergeResources', 'a1', 'a1'], ['mergeResources', 'a1', 'a3'], ['mergeResources', 'a1', 'nope'], ['mergeResources', 'a4', 'a1', { quiet: true }]]);
  S('merge two with the same address', { resources: [{ id: 'k', title: 'Keep', url: 'https://same.test/p' }, { id: 'd', title: 'Drop', url: 'https://same.test/p?utm_source=x', tags: ['t'] }], jobs: [{ id: 'j1', name: 'J', members: ['d'] }], threads: [{ id: 't1', name: 'T', steps: [{ rid: 'k', done: false }, { rid: 'd', done: true, doneAt: '2026-10-30T00:00:00.000Z' }] }], settings: { weekly: { doneAt: '', pickedAt: '2026-10-30', snooze: '', picks: [{ rid: 'd', done: false }, { rid: 'k', done: false }] } } }, [['mergeResources', 'k', 'd']]);
  S('duplicate, link, unlink, lock', 'mini', [['duplicateResource', 'a1'], ['duplicateResource', 'nope'], ['link', 'a1', 'a4'], ['link', 'a1', 'a1'], ['link', 'a1', 'nope'], ['unlink', 'a1', 'a6'], ['setLocked', 'a2', true], ['setPinned', 'a2', true]]);
  S('life of a resource: open, check, snooze, trial, verdict', 'mini', [['markOpened', 'a1'], ['markOpened', 'a2'], ['markChecked', 'a1'], ['snooze', 'a1', 3], ['snooze', 'a2', 3], ['startTrial', 'a2'], ['startTrial', 'a1', 0], ['extendTrial', 'a4', 5], ['extendTrial', 'a1', 5], ['setVerdict', 'a4', 'keep', 'good'], ['setVerdict', 'a2', 'drop', 'x'.repeat(400)], ['setVerdict', 'a1', 'maybe'], ['markOpened', 'nope']]);
  S('watch flags', 'mini', [['setWatch', 'a1', true], ['setWatch', 'a1', true], ['markWatchSeen', 'a1'], ['markWatchSeen', 'a2'], ['setWatch', 'a1', false], ['setWatch', 'nope', true]]);
  S('sectors: add, ensure inbox, update, delete, place', 'mini', [['addJob', { name: '  New one ' }], ['addJob', {}], ['addJob', { name: 'Smart', rule: { match: 'any', conds: [{ f: 'tag', op: 'has', v: '#old' }, { f: 'zzz', op: 'bogus', v: '' }] }, planetColor: '#abcdef', sealed: 1 }], ['ensureInbox'], ['ensureInbox'], ['updateJob', 'j1', { name: 'Design 2', planetColor: 'red', sealed: 'yes', note: 'n' }], ['updateJob', 'j3', { rule: null }], ['updateJob', 'nope', {}], ['addToJob', 'j1', 'a4'], ['addToJob', 'j3', 'a1'], ['addToJob', 'j1', 'nope'], ['removeFromJob', 'j1', 'a1'], ['moveToJob', 'j2', 'j1', 'a3'], ['placeMany', [['a5', 'j1'], ['a6', 'j1'], ['a1', 'j1'], ['a5', 'j2'], ['nope', 'j1']]], ['placeMany', [['a1', 'j1']]], ['createSector', 'Made', ['a1', 'a1', 'nope', 'a5'], '#123456'], ['deleteJob', 'j2']]);
  S('smart sectors follow the data', 'mini', [['addResource', { title: 'New AI', url: 'https://newai.test/', type: 'ai-source' }], ['updateResource', 'a1', { type: 'docs' }], ['updateResource', 'a2', { type: 'ai-source' }], ['moveToJob', 'j1', 'j3', 'a6'], ['refreshSmart', '2026-10-31'], ['jobsOf', 'a2']]);
  S('missions', 'mini', [['addThread', 'Second', [{ rid: 'a1' }, { rid: 'zz' }, 'a4']], ['addThread', '', []], ['renameThread', 't1', '  '], ['renameThread', 't1', 'Launch 2'], ['addStep', 't1', 'a6', 'extra'], ['addStep', 't1', 'nope'], ['removeStep', 't1', 0], ['removeStep', 't1', 99], ['moveStep', 't1', 0, 1], ['moveStep', 't1', 0, -1], ['moveStep', 't1', 2, 1], ['setStepDone', 't1', 0, true], ['setStepDone', 't1', 0, false], ['setStepDone', 't1', 99], ['setStepNote', 't1', 1, 'a note'], ['resetThread', 't1'], ['deleteThread', 't1']]);
  S('backup: preview and export', 'mini', [['previewBackup', [{ title: 'bare' }]], ['previewBackup', { resources: [], jobs: [1, 2], threads: [1] }], ['previewBackup', { nothing: true }], ['previewBackup', null], ['exportData']]);
  S('backup: import merge', 'mini', [['importBackup', { resources: [{ id: 'a1', title: 'same id' }, { id: 'n1', title: 'same link', url: 'https://alpha.test' }, { id: 'n2', title: 'brand new', url: 'https://brand.test/' }], jobs: [{ id: 'jx', name: 'design', members: ['n2', 'a6'] }, { id: 'jn', name: 'Fresh', members: ['n2'] }], threads: [{ id: 't1', name: 'dup' }, { id: 'tn', name: 'New mission', steps: [{ rid: 'n2' }, { rid: 'zz' }] }] }, 'merge'], ['importBackup', [{ id: 'bare1', title: 'From a bare list' }]], ['importBackup', { nothing: 1 }]]);
  S('backup: import replace', 'mini', [['importBackup', { resources: [{ id: 'r9', title: 'Only one', url: 'https://only.test/' }], settings: { intro: true } }, 'replace'], ['importBackup', [{ title: 'bare' }], 'replace']]);
  S('loading messy data', 'dirty', []);
  S('settings and small helpers', 'mini', [['noteJobUsed', 'j2'], ['noteJobUsed', 'nope'], ['noteVisit', 'r', 'a1'], ['noteVisit', 's', 'j1'], ['setSetting', 'customFields', [{ label: 'Cost2', kind: 'text' }, { label: 'Pick', kind: 'choice' }]], ['setSetting', 'theme', 'dark'], ['getSetting', 'theme'], ['getSetting', 'nope'], ['clearDeleted'], ['allTags'], ['jobsOf', 'a1'], ['threadsOf', 'a1']]);
  S('numbers: stats and backup nudge', 'mini', [['stats', '2026-10-31'], ['stats', '2026-11-05'], ['backupNudge', '2026-10-31']], { state: false });
  S('numbers on a bigger set', JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures/sample-backup.json'), 'utf8')), [['stats', '2026-10-31'], ['backupNudge', '2026-10-31'], ['setSetting', 'backupSnooze', '2026-11-03'], ['backupNudge', '2026-10-31'], ['backupNudge', '2026-11-04'], ['allTags']], { state: false });
  files.__start = START;
}

fs.mkdirSync(OUT, { recursive: true });
const STARTS = files.__start; delete files.__start;
if (STARTS) fs.writeFileSync(path.join(OUT, '_store_start.json'), JSON.stringify({ note: 'Start data for the store scenarios (store_ops.json). Raw input: it goes through the normal load path. P for generated ids: ' + Date.UTC(2026, 9, 31, 12).toString(36).slice(-5), starts: STARTS }, null, 1) + '\n');
for (const [mod, cases] of Object.entries(files)) fs.writeFileSync(path.join(OUT, mod + '.json'), JSON.stringify({ module: mod, generatedFrom: 'legacy/web-src/js', today: TODAY, cases }, null, 1) + '\n');
fs.writeFileSync(path.join(OUT, '_shared_links.json'), JSON.stringify({ note: "The link list RS that many cases use. Where a case's in-list has the text $RS, use this whole list. Cases that say shared link list refer to these ids.", resources: clean(RS) }, null, 1) + '\n');
console.log('wrote', Object.keys(files).length, 'files,', Object.values(files).reduce((n, c) => n + c.length, 0), 'cases');

// ---------- a synthetic backup (no real data) in the real export format ----------
{
  const topics = ['design', 'video', 'writing', 'hosting', 'music', 'study', 'data', 'ai tools'], types = ['web-tool', 'article-site', 'youtube-channel', 'ai-source', 'docs', 'catalogue', 'community'];
  const extra = Array.from({ length: 28 }, (_, i) => ({ id: 'x' + (i + 1), title: 'Sample ' + (i + 1) + ' ' + topics[i % 8], url: 'https://sample' + (i + 1) + '.example.org/page', type: types[i % 7], tags: [topics[i % 8], topics[(i + 3) % 8]], capabilities: i % 3 ? ['does thing ' + i] : [], useWhen: i % 4 ? ['when I need ' + topics[i % 8]] : [], status: ['active', 'candidate', 'testing', 'active'][i % 4], draft: i % 9 === 0, createdAt: '2026-0' + (4 + (i % 6)) + '-1' + (i % 9), opens: i % 5, checkCadence: ['none', 'weekly', 'monthly'][i % 3], notes: i % 6 === 0 ? 'A note for sample ' + i : '', trialEnd: i % 4 === 2 ? '2026-11-0' + (1 + (i % 8)) : '', fields: i % 5 === 0 ? { limit: '50/day', resets: '2026-11-0' + (1 + (i % 8)) } : {}, log: i % 7 === 0 ? [{ at: '2026-10-2' + (i % 9), k: 'reviewed', t: 'Marked as reviewed' }] : [], learned: i % 8 === 0 ? 'It works well for ' + topics[i % 8] : '', scan: i % 6 === 1 ? { at: '2026-10-1' + (i % 9), via: 'offline', topic: 'study', conf: 'maybe', basis: 'title', desc: 'Sample description', site: 'example' } : null }));
  const raw = RS.map(r => ({ ...r })).concat(extra);
  const jobs = [{ id: 'j1', name: 'Design', color: '#FF6B6B', icon: 'star', members: ['r4', 'r5', 'r6', 'r7', 'r8', 'x1', 'x9'] }, { id: 'j2', name: 'Video', color: '#4DABF7', icon: 'star', members: ['r2', 'r12', 'x2'] }, { id: 'j3', name: 'Reading', color: '#51CF66', icon: 'star', members: ['x3', 'x4', 'x5', 'x11'], note: 'Things to read' }, { id: 'j4', name: 'Docs', color: '#FCC419', icon: 'star', members: ['r9'] }];
  const threads = [{ id: 't1', name: 'Launch route', note: '', steps: [{ rid: 'r1', note: 'start here', done: true, doneAt: '2026-10-29' }, { rid: 'r2', note: '', done: false, doneAt: '' }, { rid: 'r9', note: '', done: false, doneAt: '' }] }, { id: 't2', name: 'Learn data', note: '', steps: [{ rid: 'x6', note: '', done: false, doneAt: '' }] }];
  St.load({ resources: raw, jobs, threads, settings: { intro: false, textSize: 'm', weekly: { doneAt: '2026-10-20', pickedAt: '2026-10-26', snooze: '', picks: [{ rid: 'r1', done: true }, { rid: 'r2', done: false }] }, shelves: ['j1'], recent: [{ k: 'r', id: 'r1', at: NOW - 60000 }] } });
  const data = St.exportData(); data.exportedAt = '2026-10-31T12:00:00.000Z';
  fs.writeFileSync(path.join(ROOT, 'fixtures/sample-backup.json'), JSON.stringify(data, null, 1) + '\n');
  console.log('sample backup:', data.resources.length, 'resources,', data.jobs.length, 'sectors,', data.threads.length, 'missions');
}
