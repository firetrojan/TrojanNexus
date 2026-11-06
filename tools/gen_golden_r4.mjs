// gen_golden_r4.mjs - answer keys for the pure modules that had no golden files yet.
// It imports the REAL legacy modules, freezes the clock and records made-up inputs.
//
//   node tools/gen_golden_r4.mjs       writes fixtures/golden/<module>.json
//
// Same file format as gen_golden.mjs: { module, cases: [ { fn, in: [args...], out } ] }.
// A missing key in "out" means the JS value was undefined (treat as null). Decimals are rounded to 6 places.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Freeze the clock at 2026-10-31 12:00 UTC, exactly like gen_golden.mjs.
{ const RealDate = Date, FROZEN = RealDate.UTC(2026, 9, 31, 12, 0, 0);
  globalThis.Date = class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(FROZEN); else super(...a); } static now() { return FROZEN; } }; }
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.LEGACY || path.join(ROOT, 'legacy/web-src/js/');
const OUT = path.join(ROOT, 'fixtures/golden');
const J = n => import(SRC + n + '.js');
const [Suggest, Topics, Exporters, Watch, Game, Pageparse, Importers, Sharein, Snap, St] = await Promise.all(
  ['suggest', 'topics', 'exporters', 'watch', 'game', 'pageparse', 'importers', 'sharein', 'snap', 'store'].map(J));

const TODAY = '2026-10-31', NOW = Date.UTC(2026, 9, 31, 12, 0, 0);
const clean = v => JSON.parse(JSON.stringify(v, (k, x) => (x instanceof Map ? Object.fromEntries(x) : x instanceof Set ? [...x] : (typeof x === 'number' && !Number.isInteger(x) ? Math.round(x * 1e6) / 1e6 : x))));
const files = {};
const rec = (mod, fn, args, out, note) => { (files[mod] ||= []).push({ fn, in: clean(args), out: clean(out === undefined ? null : out), ...(note ? { note } : {}) }); };
const each = (mod, fn, f, lists, note) => lists.forEach(a => rec(mod, fn, a, f(...a), note));
// Constants have no input. Repeat them three times so every export has at least three cases too.
const cst3 = (mod, name, v, note = '') => {
  for (let i = 0; i < 3; i++) rec(mod, name, [], v, (note || 'constant: the Dart value must equal this') + (i ? ' (repeat case)' : ''));
};
const safe = f => { try { return f(); } catch (e) { return { throws: (e && e.name) || 'Error' }; } };
const id = x => (x && x.id) || null;

// ---------- suggest ----------
{
  const links = {};
  const L = (rid, title, x = {}) => (links[rid] = {
    id: rid, title, url: 'https://' + rid + '.example.org/', tags: [], status: 'active', draft: false,
    folder: '', type: 'article-site', scan: null, ...x,
  });
  L('l1', 'कला पत्रिका', { tags: ['design', 'कला'], folder: 'Design', scan: { topic: 'design', conf: 'clear' } });
  L('l2', 'Café layout', { tags: ['design'], folder: 'Design', scan: { topic: 'design', conf: 'maybe' } });
  L('l3', 'Poster study', { tags: ['design'], folder: 'Design' });
  L('l4', 'Type specimen', { tags: ['design'], folder: 'Design' });
  L('l5', 'Café art', { tags: ['art', 'café'], folder: 'Art', scan: { topic: 'art', conf: 'clear' } });
  L('l6', 'Sketch book', { tags: ['art'], folder: 'Art' });
  L('l7', 'Ink study', { tags: ['art'], folder: 'Art' });
  L('l8', 'Old archive', { status: 'archived', tags: ['design'], folder: 'Design' });
  L('l9', 'Draft note', { draft: true, tags: ['design'], folder: 'Design' });
  L('l10', 'No fields', { url: '', tags: [], folder: '', scan: null });
  const jobs = [
    { id: 'j1', name: 'Design', rule: null, sealed: false, members: ['l2', 'l3', 'l4', 'l8', 'l9'] },
    { id: 'j2', name: 'कला sector', rule: null, sealed: false, members: ['l5', 'l6', 'l7'] },
    { id: 'j3', name: 'Auto', rule: { match: 'all', conds: [] }, sealed: false, members: ['l1', 'l2', 'l3'] },
    { id: 'j4', name: 'Sealed', rule: null, sealed: true, members: ['l1', 'l2', 'l3'] },
    { id: 'j5', name: 'Tiny', rule: null, sealed: false, members: ['l1'] },
  ];
  const byId = rid => links[rid];
  const jobOf = jid => jobs.find(j => j.id === jid);
  const jobsOf = jids => rid => jids.map(jobOf).filter(Boolean);
  const profiles = () => Suggest.buildProfiles(jobs, byId);
  const pOut = ps => ({
    profiles: ps.map(p => ({
      job: p.job.id, n: p.n, ids: [...p.ids], tags: Object.fromEntries(p.tags), sites: Object.fromEntries(p.sites),
      folders: Object.fromEntries(p.folders), topics: Object.fromEntries(p.topics), types: Object.fromEntries(p.types), words: p.words,
    })),
    common: [...ps.common],
  });
  const sOut = s => s && { job: s.job.id, score: s.score, why: s.why, unsure: s.unsure, also: (s.also || []).map(j => j.id) };
  const topOut = list => list.map(x => ({ job: x.job.id, score: x.score, why: x.why }));
  rec('suggest', 'buildProfiles', [jobs, links], pOut(profiles()), 'in: jobs + an id->link object; out: maps are objects and ids are arrays');
  rec('suggest', 'buildProfiles', [[], {}], pOut(Suggest.buildProfiles([], byId)), 'empty input');
  rec('suggest', 'buildProfiles', [[{ id: 'jx', name: 'Odd', rule: null, sealed: false, members: ['missing', 'l10', 'l9'] }], links], pOut(Suggest.buildProfiles([{ id: 'jx', name: 'Odd', rule: null, sealed: false, members: ['missing', 'l10', 'l9'] }], byId)), 'missing and draft members');
  rec('suggest', 'suggestTop', [links.l1, jobs, links, [], 3], topOut(Suggest.suggestTop(links.l1, profiles(), jobsOf([]), 3)), 'profiles and jobsOfFn are built in the test from jobs, links and memberJobIds');
  rec('suggest', 'suggestTop', [links.l1, jobs, links, ['j1'], 3], topOut(Suggest.suggestTop(links.l1, profiles(), jobsOf(['j1']), 3)), 'already in a sector -> no suggestion');
  rec('suggest', 'suggestTop', [links.l8, jobs, links, [], 3], topOut(Suggest.suggestTop(links.l8, profiles(), jobsOf([]), 3)), 'archived -> no suggestion');
  rec('suggest', 'suggestTop', [links.l5, jobs, links, [], 2], topOut(Suggest.suggestTop(links.l5, profiles(), jobsOf([]), 2)), 'unicode tags and n=2');
  rec('suggest', 'suggest', [links.l1, jobs, links, []], sOut(Suggest.suggest(links.l1, profiles(), jobsOf([]))), 'best sector or null');
  rec('suggest', 'suggest', [links.l1, jobs, links, ['j1']], sOut(Suggest.suggest(links.l1, profiles(), jobsOf(['j1']))), 'already filed away');
  rec('suggest', 'suggest', [links.l10, jobs, links, []], sOut(Suggest.suggest(links.l10, profiles(), jobsOf([]))), 'missing fields / no link');
  rec('suggest', 'suggest', [links.l5, jobs, links, []], sOut(Suggest.suggest(links.l5, profiles(), jobsOf([]))), 'unicode');
  rec('suggest', 'suggestMany', [[links.l1, links.l5, links.l10], jobs, links, []], Suggest.suggestMany([links.l1, links.l5, links.l10], jobs, byId, jobsOf([])).map(x => ({ r: x.r.id, s: sOut(x.s) })), 'out lists ids');
  rec('suggest', 'suggestMany', [[], jobs, links, []], Suggest.suggestMany([], jobs, byId, jobsOf([])), 'empty input');
  rec('suggest', 'suggestMany', [[links.l2, links.l6], jobs, links, []], Suggest.suggestMany([links.l2, links.l6], jobs, byId, jobsOf([])).map(x => ({ r: x.r.id, s: sOut(x.s) })), 'members of existing sectors');
  // Common-tag and tie cases added for the second pass.
  const commonLinks = {};
  const C = (rid, n) => (commonLinks[rid] = { id: rid, title: 'Common ' + rid, url: 'https://c' + n + '.test/', tags: ['free', 'art'], status: 'active', draft: false, folder: 'Mine', type: 'article-site', scan: null });
  C('c1', 1); C('c2', 2); C('c3', 3); C('c4', 4); C('c5', 5); C('c6', 6); C('c7', 7); C('c8', 8); C('c9', 9);
  const commonJobs = [
    { id: 'cj1', name: 'Alpha', rule: null, sealed: false, members: ['c1', 'c2', 'c3'] },
    { id: 'cj2', name: 'Beta', rule: null, sealed: false, members: ['c4', 'c5', 'c6'] },
    { id: 'cj3', name: 'Gamma', rule: null, sealed: false, members: ['c7', 'c8', 'c9'] },
  ];
  const commonById = rid => commonLinks[rid];
  const commonProfiles = () => Suggest.buildProfiles(commonJobs, commonById);
  rec('suggest', 'buildProfiles', [commonJobs, commonLinks], pOut(commonProfiles()), 'a tag common to three sectors');
  const tieLink = { id: 'lt', title: 'Tie link', url: 'https://example.org/x', tags: [], status: 'active', draft: false, folder: '', type: 'feed', scan: null };
  rec('suggest', 'suggest', [tieLink, jobs, links, []], sOut(Suggest.suggest(tieLink, profiles(), jobsOf([]))), 'two sectors tie');
  const commonLink = { id: 'cq', title: 'Common query', url: 'https://c1.test/', tags: ['free', 'art'], status: 'active', draft: false, folder: '', type: 'feed', scan: null };
  rec('suggest', 'suggestTop', [commonLink, commonJobs, commonLinks, [], 3], topOut(Suggest.suggestTop(commonLink, commonProfiles(), jobsOf([]), 3)), 'common tag, same website as one and a type with no history');
  const otherSite = { id: 'co', title: 'Other site', url: 'https://other.test/x', tags: ['free'], status: 'active', draft: false, folder: '', type: 'feed', scan: null };
  rec('suggest', 'suggestTop', [otherSite, commonJobs, commonLinks, [], 3], topOut(Suggest.suggestTop(otherSite, commonProfiles(), jobsOf([]), 3)), 'a site the profiles have never seen');
  // Starter cases from the build order: score under 2.0, rule-based-only link, exact ties, Hindi tag, n=1 and n=5.
  rec('suggest', 'suggest', [otherSite, commonJobs, commonLinks, []], sOut(Suggest.suggest(otherSite, commonProfiles(), jobsOf([]))), 'score under 2.0 gives null');
  rec('suggest', 'suggest', [links.l1, jobs, links, ['j3']], sOut(Suggest.suggest(links.l1, profiles(), jobsOf(['j3']))), 'only in a rule-based sector still gets a suggestion');
  const tieJobs = [
    { id: 'tj1', name: 'First', rule: null, sealed: false, members: ['l2', 'l3', 'l4'] },
    { id: 'tj2', name: 'Second', rule: null, sealed: false, members: ['l5', 'l6', 'l7'] },
  ];
  rec('suggest', 'suggest', [tieLink, tieJobs, links, []], sOut(Suggest.suggest(tieLink, Suggest.buildProfiles(tieJobs, byId), jobsOf([]))), 'exact tie, winner listed first');
  const revTieJobs = [tieJobs[1], tieJobs[0]];
  rec('suggest', 'suggest', [tieLink, revTieJobs, links, []], sOut(Suggest.suggest(tieLink, Suggest.buildProfiles(revTieJobs, byId), jobsOf([]))), 'exact tie, better-listed sector comes second');
  const hindiLinks = {};
  const H = (rid) => (hindiLinks[rid] = { id: rid, title: 'कला ' + rid, url: 'https://hindi' + rid + '.example.org/', tags: ['कला'], status: 'active', draft: false, folder: '', type: 'article-site', scan: null });
  H('h1'); H('h2'); H('h3');
  const hindiJobs = [{ id: 'hj', name: 'Hindi sector', rule: null, sealed: false, members: ['h1', 'h2', 'h3'] }];
  const hindiQuery = { id: 'hq', title: 'कला query', url: 'https://other.example.org/', tags: ['कला'], status: 'active', draft: false, folder: '', type: 'feed', scan: null };
  rec('suggest', 'suggest', [hindiQuery, hindiJobs, hindiLinks, []], sOut(Suggest.suggest(hindiQuery, Suggest.buildProfiles(hindiJobs, id => hindiLinks[id]), jobsOf([]))), 'a Hindi tag one sector really uses');
  rec('suggest', 'suggestTop', [links.l1, jobs, links, [], 1], topOut(Suggest.suggestTop(links.l1, profiles(), jobsOf([]), 1)), 'n=1');
  rec('suggest', 'suggestTop', [links.l1, jobs, links, [], 5], topOut(Suggest.suggestTop(links.l1, profiles(), jobsOf([]), 5)), 'n=5');
}

// ---------- topics ----------
{
  const const3 = (name, v) => cst3('topics', name, v);
  rec('topics', 'TOPICS', [], Topics.TOPICS, 'constant recorded once; the Dart test builds TOPIC_BY_ID from it');
  const3('BASIS_LABEL', Topics.BASIS_LABEL);
  const g1 = Topics.guessTopic({ bio: 'मैं कला और डिज़ाइन सीखता हूँ। Café sketchbook.', name: 'कला notes', tags: ['design', 'कला'], url: 'https://maker.example.org/design' });
  const g2 = Topics.guessTopic({ handle: '@example_health_9x7', name: 'Café health notes' });
  const g3 = Topics.guessTopic({ text: ('design studio and typography ').repeat(240), url: 'https://maker.example.org/design' });
  rec('topics', 'guessTopic', [{}], Topics.guessTopic({}), 'empty input');
  rec('topics', 'guessTopic', [{ bio: 'मैं कला और डिज़ाइन सीखता हूँ। Café sketchbook.', name: 'कला notes', tags: ['design', 'कला'], url: 'https://maker.example.org/design' }], g1, 'unicode Hindi and accents');
  rec('topics', 'guessTopic', [{ handle: '@example_health_9x7', name: 'Café health notes' }], g2, 'joined handle');
  rec('topics', 'guessTopic', [{ text: ('design studio and typography ').repeat(240), url: 'https://maker.example.org/design' }], g3, 'long text is capped');
  rec('topics', 'guessTopic', [{ title: '', bio: '', handle: '', text: '', tags: [], url: 'not a url' }], Topics.guessTopic({ title: '', bio: '', handle: '', text: '', tags: [], url: 'not a url' }), 'all fields empty');
  rec('topics', 'describeGuess', [null, { read: true }], Topics.describeGuess(null, { read: true }), 'missing guess');
  rec('topics', 'describeGuess', [g1, { kind: 'site' }], Topics.describeGuess(g1, { kind: 'site' }));
  rec('topics', 'describeGuess', [g2, { kind: 'account', handle: true }], Topics.describeGuess(g2, { kind: 'account', handle: true }));
  rec('topics', 'describeGuess', [{ top: null, second: null, conf: 'none', basis: 'none', words: [], ranked: [] }, {}], Topics.describeGuess({ top: null, second: null, conf: 'none', basis: 'none', words: [], ranked: [] }, {}));
  rec('topics', 'guessFields', [null, {}], Topics.guessFields(null, {}), 'missing guess');
  rec('topics', 'guessFields', [g1, { kind: 'site' }], Topics.guessFields(g1, { kind: 'site' }));
  rec('topics', 'guessFields', [g2, { kind: 'account' }], Topics.guessFields(g2, { kind: 'account' }));
  rec('topics', 'guessFields', [g3, { kind: 'account' }], Topics.guessFields(g3, { kind: 'account' }), 'long text');
  // Cases added for the branches the first pass did not reach.
  rec('topics', 'guessTopic', [{ text: 'mental health' }], Topics.guessTopic({ text: 'mental health' }), 'a phrase with a space');
  rec('topics', 'guessTopic', [{ url: 'https://health.example.org/' }], Topics.guessTopic({ url: 'https://health.example.org/' }), 'link-only basis');
  rec('topics', 'guessTopic', [{ handle: '@x', title: 'Café' }], Topics.guessTopic({ handle: '@x', title: 'Café' }), 'name-only basis from handle and title');
  rec('topics', 'guessTopic', [{ handle: 'design.design' }], Topics.guessTopic({ handle: 'design.design' }), 'the same word twice in a handle');
  rec('topics', 'guessTopic', [{ handle: '@ai' }], Topics.guessTopic({ handle: '@ai' }), 'a short allowed word');
  rec('topics', 'guessTopic', [{ handle: 'mymusic' }], Topics.guessTopic({ handle: 'mymusic' }), 'a five letter word at the end');
  rec('topics', 'guessTopic', [{ handle: 'xmusicx' }], Topics.guessTopic({ handle: 'xmusicx' }), 'a word inside another word');
  rec('topics', 'guessTopic', [{ handle: 'codex' }], Topics.guessTopic({ handle: 'codex' }), 'a four letter word at the start');
  rec('topics', 'guessTopic', [{ handle: 'learnenglish' }], Topics.guessTopic({ handle: 'learnenglish' }), 'a six letter word inside');
  rec('topics', 'guessTopic', [{ handle: 'healthfitness' }], Topics.guessTopic({ handle: 'healthfitness' }), 'two matches of different lengths');
  rec('topics', 'guessTopic', [{ handle: 'xhealthy' }], Topics.guessTopic({ handle: 'xhealthy' }), 'one match inside another');
  rec('topics', 'guessTopic', [{ keywords: ['design', 'typography'], headings: ['A design heading'] }], Topics.guessTopic({ keywords: ['design', 'typography'], headings: ['A design heading'] }), 'keywords and headings arrays');
  rec('topics', 'guessTopic', [{ bio: 'design typography' }], Topics.guessTopic({ bio: 'design typography' }), 'a clear bio');
  rec('topics', 'guessTopic', [{ text: 'design animation' }], Topics.guessTopic({ text: 'design animation' }), 'two close topics');
  const gClear = Topics.guessTopic({ bio: 'design typography' });
  const gClose = Topics.guessTopic({ text: 'design animation' });
  rec('topics', 'describeGuess', [gClear, { kind: 'site' }], Topics.describeGuess(gClear, { kind: 'site' }), 'clear with no words');
  rec('topics', 'describeGuess', [gClose, { kind: 'site' }], Topics.describeGuess(gClose, { kind: 'site' }), 'second topic in the sentence');
  rec('topics', 'describeGuess', [null, { handle: true }], Topics.describeGuess(null, { handle: true }), 'missing guess with a name');
  rec('topics', 'describeGuess', [g2, { kind: 'site' }], Topics.describeGuess(g2, { kind: 'site' }), 'name basis on a site');
  const gMaths = Topics.guessTopic({ handle: '@maths' });
  rec('topics', 'guessFields', [gMaths, { kind: 'account' }], Topics.guessFields(gMaths, { kind: 'account' }), 'maths tag');
  const gClearSecond = Topics.guessTopic({ bio: 'design typography notes' });
  const gClose2 = Topics.guessTopic({ bio: 'design animation' });
  const gNameSecond = Topics.guessTopic({ handle: 'healthdesign' });
  rec('topics', 'guessTopic', [{ bio: 'design typography notes' }], gClearSecond, 'clear lead with a weak second');
  rec('topics', 'guessTopic', [{ bio: 'design animation' }], gClose2, 'two close topics with weight');
  rec('topics', 'guessTopic', [{ handle: 'healthdesign' }], gNameSecond, 'two joined words in a handle');
  rec('topics', 'describeGuess', [gClearSecond, { kind: 'site' }], Topics.describeGuess(gClearSecond, { kind: 'site' }), 'clear but with a second');
  rec('topics', 'describeGuess', [gClose2, { kind: 'site' }], Topics.describeGuess(gClose2, { kind: 'site' }), 'two topics in the sentence');
  rec('topics', 'describeGuess', [{ top: { id: 'design', label: 'Design', score: 6, words: [] }, second: null, conf: 'clear', basis: 'bio', words: [], ranked: [] }, {}], Topics.describeGuess({ top: { id: 'design', label: 'Design', score: 6, words: [] }, second: null, conf: 'clear', basis: 'bio', words: [], ranked: [] }, {}), 'no words to list');
}

// ---------- exporters ----------
{
  const E = (rid, x = {}) => ({
    id: rid, title: 'Sample ' + rid, url: 'https://' + rid + '.example.org/', type: 'web-tool', status: 'active',
    tags: [], useWhen: [], capabilities: [], notes: '', fields: {}, checkCadence: 'none', nextCheck: '', trialEnd: '',
    src: '', draft: false, createdAt: '2026-10-01', ...x,
  });
  const resources = [
    E('e1', { title: 'Design maker', url: 'https://maker.example.org/कला?utm_source=x', tags: ['design', 'कला'], useWhen: ['make a sample deck'], capabilities: ['draw shapes'], notes: 'Line one\nLine two', fields: { cost: 'Free', resets: '2026-11-04' }, checkCadence: 'weekly', nextCheck: '2026-11-02' }),
    E('e2', { title: 'Café notes', url: 'https://notes.example.org/cafe', status: 'testing', trialEnd: '2026-11-03', tags: ['notes'], useWhen: [], capabilities: ['write a note'], fields: { resets: '2026-11-05' } }),
    E('e3', { title: 'Old archive', url: 'https://old.example.org/', status: 'archived', tags: ['old'], useWhen: ['look back'], checkCadence: 'weekly', nextCheck: '2026-11-01' }),
    E('e4', { title: '=SUM(A1) odd', url: 'https://sheet.example.org/x', tags: ['a,b'], notes: '=cmd\nnext', type: 'article-site', checkCadence: 'none' }),
    E('e5', { title: 'No link', url: '', tags: [], useWhen: [], capabilities: [], src: 'following', status: 'active', checkCadence: 'none' }),
  ];
  const jobs = [
    { id: 'j1', name: 'Design', note: 'Sector note', members: ['e1', 'e2', 'e3'] },
    { id: 'j2', name: 'Other', note: '', members: ['e4'] },
  ];
  const threads = [
    { id: 't1', name: 'Launch route', note: 'A small goal', steps: [{ rid: 'e1', note: '', done: true }, { rid: 'e2', note: 'write', done: false }, { rid: 'missing', note: '', done: false }] },
    { id: 't2', name: 'Empty route', note: '', steps: [] },
  ];
  const state = { resources, jobs, threads, settings: {} };
  const empty = { resources: [], jobs: [], threads: [], settings: {} };
  const byId = Object.fromEntries(resources.map(r => [r.id, r]));
  const ids = list => list.map(r => r.id);
  rec('exporters', 'typeName', ['web-tool'], Exporters.typeName('web-tool'));
  rec('exporters', 'typeName', ['bogus'], Exporters.typeName('bogus'));
  rec('exporters', 'typeName', [''], Exporters.typeName(''));
  rec('exporters', 'stageName', ['testing'], Exporters.stageName('testing'));
  rec('exporters', 'stageName', ['bogus'], Exporters.stageName('bogus'));
  rec('exporters', 'stageName', [''], Exporters.stageName(''));
  rec('exporters', 'pick', [state, {}], ids(Exporters.pick(state, {})), 'out lists ids');
  rec('exporters', 'pick', [state, { jobId: 'j1' }], ids(Exporters.pick(state, { jobId: 'j1' })), 'out lists ids');
  rec('exporters', 'pick', [state, { ids: ['e2', 'e4', 'zz'], archived: true, following: false }], ids(Exporters.pick(state, { ids: ['e2', 'e4', 'zz'], archived: true, following: false })), 'out lists ids');
  rec('exporters', 'pick', [empty, {}], Exporters.pick(empty, {}), 'empty input');
  rec('exporters', 'taskText', [[resources[0]], {}], Exporters.taskText([resources[0]], {}));
  rec('exporters', 'taskText', [resources.slice(0, 2), { title: 'Plan', goal: 'Sample goal', steps: ['one', 'two'] }], Exporters.taskText(resources.slice(0, 2), { title: 'Plan', goal: 'Sample goal', steps: ['one', 'two'] }));
  rec('exporters', 'taskText', [[], { title: 'कला कार्य', steps: ['कदम'] }], Exporters.taskText([], { title: 'कला कार्य', steps: ['कदम'] }), 'empty items, unicode');
  rec('exporters', 'missionTask', [threads[0], byId], Exporters.missionTask(threads[0], x => byId[x]), 'byId is built from the resource object');
  rec('exporters', 'missionTask', [threads[1], byId], Exporters.missionTask(threads[1], x => byId[x]), 'empty steps');
  rec('exporters', 'missionTask', [{ id: 't3', name: 'Café', note: '', steps: [{ rid: 'e4', note: 'नोट', done: false }] }, byId], Exporters.missionTask({ id: 't3', name: 'Café', note: '', steps: [{ rid: 'e4', note: 'नोट', done: false }] }, x => byId[x]), 'unicode');
  rec('exporters', 'markdownAll', [state, {}], Exporters.markdownAll(state, {}));
  rec('exporters', 'markdownAll', [empty, {}], Exporters.markdownAll(empty, {}), 'empty input');
  rec('exporters', 'markdownAll', [state, { archived: true, following: false }], Exporters.markdownAll(state, { archived: true, following: false }), 'archived and hidden following');
  rec('exporters', 'csvAll', [state, {}], Exporters.csvAll(state, {}));
  rec('exporters', 'csvAll', [empty, {}], Exporters.csvAll(empty, {}), 'empty input');
  rec('exporters', 'csvAll', [state, { archived: true, following: false }], Exporters.csvAll(state, { archived: true, following: false }), 'archived and hidden following');
  rec('exporters', 'estimateTokens', [''], Exporters.estimateTokens(''));
  rec('exporters', 'estimateTokens', ['abcd efgh'], Exporters.estimateTokens('abcd efgh'));
  rec('exporters', 'estimateTokens', ['कला और café'], Exporters.estimateTokens('कला और café'));
  rec('exporters', 'aiBrief', [state, {}], Exporters.aiBrief(state, {}));
  rec('exporters', 'aiBrief', [state, { detail: 'full', links: true, maxChars: 800 }], Exporters.aiBrief(state, { detail: 'full', links: true, maxChars: 800 }), 'cut path');
  rec('exporters', 'aiBrief', [empty, { detail: 'short' }], Exporters.aiBrief(empty, { detail: 'short' }), 'empty input');
  rec('exporters', 'upcomingEvents', [resources, { from: TODAY, days: 10 }], Exporters.upcomingEvents(resources, { from: TODAY, days: 10 }));
  rec('exporters', 'upcomingEvents', [[], { from: TODAY, days: 10 }], Exporters.upcomingEvents([], { from: TODAY, days: 10 }), 'empty input');
  rec('exporters', 'upcomingEvents', [resources, { from: TODAY, days: 0 }], Exporters.upcomingEvents(resources, { from: TODAY, days: 0 }), 'no range');
  const events = Exporters.upcomingEvents(resources, { from: TODAY, days: 10 });
  rec('exporters', 'icsFor', [events, { now: new Date(NOW) }], Exporters.icsFor(events, { now: new Date(NOW) }), 'in: now is an ISO string in JSON; the test passes new Date(now)');
  rec('exporters', 'icsFor', [[], { now: new Date(NOW) }], Exporters.icsFor([], { now: new Date(NOW) }), 'empty input');
  rec('exporters', 'icsFor', [[{ rid: 'e9', kind: 'check', date: '2026-11-02', title: 'कला: ' + 'x'.repeat(100), details: 'Line 1\nLine 2', url: 'https://maker.example.org/कला' }], { now: new Date(NOW) }], Exporters.icsFor([{ rid: 'e9', kind: 'check', date: '2026-11-02', title: 'कला: ' + 'x'.repeat(100), details: 'Line 1\nLine 2', url: 'https://maker.example.org/कला' }], { now: new Date(NOW) }), 'long unicode line and folding');
  rec('exporters', 'gcalLink', [events[0] || { rid: 'e1', kind: 'check', date: TODAY, title: 'Sample', details: 'Details', url: '' }], Exporters.gcalLink(events[0] || { rid: 'e1', kind: 'check', date: TODAY, title: 'Sample', details: 'Details', url: '' }));
  rec('exporters', 'gcalLink', [{ rid: 'e9', kind: 'trial', date: '2026-11-03', title: 'कला', details: '', url: '' }], Exporters.gcalLink({ rid: 'e9', kind: 'trial', date: '2026-11-03', title: 'कला', details: '', url: '' }), 'unicode');
  rec('exporters', 'gcalLink', [{ rid: 'e9', kind: 'resets', date: '2026-11-04', title: 'Line', details: 'A & B', url: '' }], Exporters.gcalLink({ rid: 'e9', kind: 'resets', date: '2026-11-04', title: 'Line', details: 'A & B', url: '' }), 'escaping');
  rec('exporters', 'whatsappLink', ['Hello sample'], Exporters.whatsappLink('Hello sample'));
  rec('exporters', 'whatsappLink', [''], Exporters.whatsappLink(''));
  rec('exporters', 'whatsappLink', ['कला और café'], Exporters.whatsappLink('कला और café'));
  rec('exporters', 'mailtoLink', ['Sample', 'A short body'], Exporters.mailtoLink('Sample', 'A short body'));
  rec('exporters', 'mailtoLink', ['', 'कला और café'], Exporters.mailtoLink('', 'कला और café'));
  rec('exporters', 'mailtoLink', ['Long', 'x'.repeat(50), 10], Exporters.mailtoLink('Long', 'x'.repeat(50), 10), 'cut path');
  // Cases added for the branches the first pass did not reach.
  rec('exporters', 'pick', [state, { jobId: 'missing' }], ids(Exporters.pick(state, { jobId: 'missing' })), 'missing sector');
  rec('exporters', 'taskText', [resources[4], {}], Exporters.taskText(resources[4], {}), 'single item and no link');
  rec('exporters', 'taskText', [[], {}], Exporters.taskText([], {}), 'no title and no items');
  rec('exporters', 'missionTask', [{ id: 't4', name: 'Plain', note: '', steps: [{ rid: 'e5', note: 'check', done: false }] }, byId], Exporters.missionTask({ id: 't4', name: 'Plain', note: '', steps: [{ rid: 'e5', note: 'check', done: false }] }, x => byId[x]), 'step note and no link');
  const odd = { ...resources[0], id: 'e6', title: 'Odd', url: '', type: '', status: 'active', tags: [], useWhen: [], capabilities: [], notes: '', fields: {}, inputs: 'a file', outputs: '', verdict: { result: 'keep', at: TODAY, note: 'sample note' }, checkCadence: 'none', nextCheck: '', trialEnd: '', src: '' };
  const state2 = { resources: [...resources, odd], jobs: [...jobs, { id: 'j3', name: 'Empty sector', note: '', members: [] }], threads: [{ id: 't5', name: 'Plain mission', note: '', steps: [{ rid: 'e5', note: 'check', done: false }] }], settings: {} };
  rec('exporters', 'markdownAll', [state2, {}], Exporters.markdownAll(state2, {}), 'inputs, verdict, no link and an empty sector');
  rec('exporters', 'csvAll', [state2, {}], Exporters.csvAll(state2, {}), 'missing saved-from');
  rec('exporters', 'aiBrief', [state2, { detail: 'full', maxChars: 30 }], Exporters.aiBrief(state2, { detail: 'full', maxChars: 30 }), 'cut tail');
  const oddEvents = [{ rid: 'e9', kind: 'check', date: '2026-11-02', title: 'A;B\\C, D', details: 'A;B', url: 'ftp://bad.example.org/' }];
  rec('exporters', 'icsFor', [oddEvents, { now: new Date(NOW) }], Exporters.icsFor(oddEvents, { now: new Date(NOW) }), 'escaping and a non-http url');
  const edgeResources = [{ ...resources[1], id: 'e7', useWhen: [], url: '', nextCheck: 'bad', fields: { resets: '2026-11-20' }, checkCadence: 'weekly' }];
  rec('exporters', 'upcomingEvents', [edgeResources, { from: TODAY, days: 10 }], Exporters.upcomingEvents(edgeResources, { from: TODAY, days: 10 }), 'bad and out-of-range dates');
  const odd2 = { ...odd, id: 'e8', outputs: 'a result', verdict: { result: 'keep', at: TODAY, note: '' } };
  rec('exporters', 'markdownAll', [{ ...state2, resources: [...state2.resources, odd2] }, {}], Exporters.markdownAll({ ...state2, resources: [...state2.resources, odd2] }, {}), 'outputs and verdict without note');
  const nullFields = { resources: [{ ...resources[0], id: 'e10', fields: null }], jobs: [], threads: [], settings: {} };
  rec('exporters', 'csvAll', [nullFields, {}], Exporters.csvAll(nullFields, {}), 'resource without a fields object');
  const tieResources = [resources[0], { ...resources[0], id: 'e11', title: 'Café tie', useWhen: [], capabilities: [] }];
  rec('exporters', 'aiBrief', [{ resources: tieResources, jobs: [], threads: [], settings: {} }, { detail: 'full', links: true, maxChars: 0 }], Exporters.aiBrief({ resources: tieResources, jobs: [], threads: [], settings: {} }, { detail: 'full', links: true, maxChars: 0 }), 'equal scores and default size');
  rec('exporters', 'icsFor', [[{ rid: 'e12', kind: 'check', date: '2026-11-06' }], { now: new Date(NOW) }], Exporters.icsFor([{ rid: 'e12', kind: 'check', date: '2026-11-06' }], { now: new Date(NOW) }), 'missing title, details and url');
  const sameDay = [
    { ...resources[0], id: 'e13', title: 'Same day B', nextCheck: '2026-11-02' },
    { ...resources[0], id: 'e14', title: 'Same day A', nextCheck: '2026-11-02' },
  ];
  rec('exporters', 'upcomingEvents', [sameDay, { from: TODAY, days: 10 }], Exporters.upcomingEvents(sameDay, { from: TODAY, days: 10 }), 'same date sorts by title');
  rec('exporters', 'aiBrief', [state2, { links: true }], Exporters.aiBrief(state2, { links: true }), 'no url and links asked');
}

// ---------- watch ----------
{
  const page1 = { title: 'Café page', ogTitle: '', description: 'A sample description 123', headings: ['One', 'Two'] };
  const page2 = { title: 'Café page', description: 'A sample description 456', headings: ['One', 'Three'] };
  const fp1 = Watch.fingerprint(page1, 'direct');
  const fp2 = Watch.fingerprint(page2, 'direct');
  each('watch', 'norm', Watch.norm, ['', '  Café   PAGE 123,456.7  ', 'कला   2026-10-31', 'x'.repeat(500)].map(x => [x]));
  rec('watch', 'fingerprint', [{}, ''], Watch.fingerprint({}, ''));
  rec('watch', 'fingerprint', [null, null], Watch.fingerprint(null, null), 'missing page and via');
  rec('watch', 'fingerprint', [page1, 'direct'], fp1);
  rec('watch', 'fingerprint', [{ ogTitle: 'कला', description: 'Café', headings: Array.from({ length: 15 }, (_, i) => 'Heading ' + i), title: 'ignored' }, 'reader'], Watch.fingerprint({ ogTitle: 'कला', description: 'Café', headings: Array.from({ length: 15 }, (_, i) => 'Heading ' + i), title: 'ignored' }, 'reader'), 'headings capped at 12');
  [[null], [{}], [fp1], [{ h: [] }], [{ t: '' }]].forEach(a => rec('watch', 'usable', a, safe(() => Watch.usable(...a)), 'missing headings throws'));
  rec('watch', 'compare', [fp1, fp1], Watch.compare(fp1, fp1));
  rec('watch', 'compare', [fp1, fp2], Watch.compare(fp1, fp2));
  rec('watch', 'compare', [fp1, { t: '', d: '', h: [], via: '' }], Watch.compare(fp1, { t: '', d: '', h: [], via: '' }), 'unreadable new page');
  rec('watch', 'compare', [{ t: '', d: '', h: [], via: '' }, fp1], Watch.compare({ t: '', d: '', h: [], via: '' }, fp1), 'rebase');
  rec('watch', 'compare', [{ ...fp1, via: 'direct' }, { ...fp2, via: 'reader' }], Watch.compare({ ...fp1, via: 'direct' }, { ...fp2, via: 'reader' }), 'via changed');
  rec('watch', 'compare', [fp1, { ...fp1, t: 'Café page two' }], Watch.compare(fp1, { ...fp1, t: 'Café page two' }), 'title changed');
  rec('watch', 'compare', [{ ...fp1, d: '' }, { ...fp1, d: 'A description appeared' }], Watch.compare({ ...fp1, d: '' }, { ...fp1, d: 'A description appeared' }), 'description appeared');
  rec('watch', 'compare', [{ ...fp1, d: 'An old description' }, { ...fp1, d: '' }], Watch.compare({ ...fp1, d: 'An old description' }, { ...fp1, d: '' }), 'description gone');
  rec('watch', 'compare', [{ ...fp1, d: '' }, { ...fp1, d: '' }], Watch.compare({ ...fp1, d: '' }, { ...fp1, d: '' }), 'both descriptions empty');
  rec('watch', 'compare', [{ ...fp1, d: 'A sample description' }, { ...fp1, d: 'Another sample description' }], Watch.compare({ ...fp1, d: 'A sample description' }, { ...fp1, d: 'Another sample description' }), 'description words changed');
  rec('watch', 'compare', [{ ...fp1, h: [] }, { ...fp1, h: ['One', 'Two'] }], Watch.compare({ ...fp1, h: [] }, { ...fp1, h: ['One', 'Two'] }), 'two new headings');
  rec('watch', 'compare', [{ ...fp1, h: ['One', 'Two'] }, { ...fp1, h: [] }], Watch.compare({ ...fp1, h: ['One', 'Two'] }, { ...fp1, h: [] }), 'two headings gone');
  rec('watch', 'normWatch', [null], Watch.normWatch(null));
  rec('watch', 'normWatch', [{ on: true, at: '2026-10-31T12:00:00Z', fp: fp1, changed: '2026-10-30', what: ['x', '', 'y'] }], Watch.normWatch({ on: true, at: '2026-10-31T12:00:00Z', fp: fp1, changed: '2026-10-30', what: ['x', '', 'y'] }));
  rec('watch', 'normWatch', [{ on: false, fp: fp1 }], Watch.normWatch({ on: false, fp: fp1 }), 'not watched');
  rec('watch', 'normWatch', [{ on: true, at: 'bad', fp: { t: '', h: [] }, what: ['a', 'b', 'c', 'd', 'e'] }], Watch.normWatch({ on: true, at: 'bad', fp: { t: '', h: [] }, what: ['a', 'b', 'c', 'd', 'e'] }), 'bad date and unusable fingerprint');
  rec('watch', 'normWatch', [{ on: true, at: '2026-10-31', fp: 'bad', what: 'bad' }], Watch.normWatch({ on: true, at: '2026-10-31', fp: 'bad', what: 'bad' }), 'non-object fingerprint and non-list what');
  rec('watch', 'normWatch', [{ on: true, fp: null, what: [] }], Watch.normWatch({ on: true, fp: null, what: [] }), 'null fingerprint');
  rec('watch', 'normWatch', [{ on: true, at: '2026-10-31', fp: { t: 'Café' } }], Watch.normWatch({ on: true, at: '2026-10-31', fp: { t: 'Café' } }), 'fingerprint without headings');
}

// ---------- game ----------
{
  St.load({ resources: [], jobs: [], threads: [], settings: {}, game: {} });
  const setGame = (game, resources) => { St.state.game = game; St.state.resources = resources || []; };
  const res = (rid, x = {}) => ({ id: rid, title: rid, url: 'https://' + rid + '.example.org/', status: 'active', tags: [], draft: false, checkCadence: 'none', ...x });
  each('game', 'levelStart', Game.levelStart, [[0], [1], [2], [10], [1000]]);
  each('game', 'levelOf', Game.levelOf, [[0], [29], [30], [1000], [999999], [1000000], [1000001]]);
  each('game', 'rankOf', Game.rankOf, [[0], [1], [4], [8], [99]]);
  // The state the JS ran against goes into "in", so the Dart test can rebuild the same store.
  const gstate = (game, resources) => ({ game: game || {}, resources: resources || [] });
  const gcase = (name, fn, args, st, note, wrap) => {
    const input = JSON.parse(JSON.stringify(st));
    setGame(st.game, st.resources);
    const out = fn(...args);
    rec('game', name, [input, ...args], wrap ? wrap(out) : out, note);
  };
  const badgeOut = out => out.map(b => ({ id: b.id, name: b.name, desc: b.desc }));
  gcase('progress', Game.progress, [], gstate({}), 'empty game state');
  gcase('progress', Game.progress, [], gstate({ xp: 30, days: ['2026-10-31'], badges: { a: '2026-10-31' }, counters: { adds: 2 } }), 'some xp');
  gcase('progress', Game.progress, [], gstate({ xp: 1000000, days: Array.from({ length: 20 }, () => '2026-10-31'), badges: { a: 1, b: 2 }, counters: {} }), 'large xp');
  for (const xp of [29, 30, 1000, 999999, 1000000, 1000001]) {
    gcase('progress', Game.progress, [], gstate({ xp, days: [], badges: {}, counters: {} }), 'xp ' + xp);
  }
  gcase('award', Game.award, ['check', 2], gstate({}), 'fresh game');
  gcase('award', Game.award, ['import', 12], gstate({}), 'gain is capped');
  gcase('award', Game.award, ['add', 1, 'कला जोड़ा'], gstate({}), 'unicode label');
  gcase('award', Game.award, ['missionDone', 3], gstate({}), 'level up happens');
  gcase('award', Game.award, ['bogus', 5], gstate({}), 'unknown kind gives zero gain');
  gcase('focusDone', Game.focusDone, [10], gstate({ focus: [] }), 'result plus the focus list',
    out => ({ result: out, focus: St.state.game.focus, today: Game.focusToday() }));
  gcase('focusDone', Game.focusDone, [20], gstate({ focus: [{ date: '2026-10-30', minutes: 25 }] }), '20+ minutes',
    out => ({ result: out, focus: St.state.game.focus, today: Game.focusToday() }));
  gcase('focusDone', Game.focusDone, [45], gstate({ focus: Array.from({ length: 3 }, () => ({ date: '2026-10-31', minutes: 5 })) }), '30+ minutes and existing runs',
    out => ({ result: out, focus: St.state.game.focus, today: Game.focusToday() }));
  gcase('focusToday', Game.focusToday, [], gstate({ focus: [] }), 'empty focus');
  gcase('focusToday', Game.focusToday, [], gstate({ focus: [{ date: '2026-10-31', minutes: 20 }, { date: '2026-10-31', minutes: 5 }, { date: '2026-10-30', minutes: 30 }] }), 'today only');
  gcase('focusToday', Game.focusToday, [], gstate({ focus: [{ date: '2026-10-30', minutes: 30 }] }), 'old runs');
  gcase('unlock', Game.unlock, [], gstate({}), 'no counters', badgeOut);
  gcase('unlock', Game.unlock, [], gstate({ counters: { adds: 1, checks: 5, reviews: 25, backups: 1, threads: 1, missions: 1, sectors: 1, imported: 10, links: 1, steps: 1 } }, [res('g1')]), 'many badges', badgeOut);
  gcase('unlock', Game.unlock, [], gstate({ counters: { checks: 1 }, badges: { 'first-contact': '2026-10-31' } }, [res('g2')]), 'already unlocked', badgeOut);
  gcase('unlock', Game.unlock, [], gstate({ counters: { reviews: 2 }, badges: {} }, Array.from({ length: 12 }, (_, i) => res('fa' + i))), 'full-atlas conditions met', badgeOut);
  cst3('game', 'RANKS', Game.RANKS);
  cst3('game', 'XP', Game.XP);
  cst3('game', 'BADGES', Game.BADGES.map(({ id, name, desc }) => ({ id, name, desc })), 'constant without the test functions');
}

// ---------- pageparse ----------
{
  const htmlFull = `<!doctype html><html lang="hi"><head>
    <title>कला पत्रिका | Example</title>
    <meta property="og:title" content="कला पत्रिका">
    <meta name="description" content="Café design notes &amp; more">
    <meta name="keywords" content="कला, Design, design, café">
    <meta name="author" content="Mira Example">
    <link rel="canonical" href="/kala">
    <link rel="alternate" type="application/rss+xml" href="/feed.xml">
    <script type="application/ld+json">{"@type":"Article","description":"Sample desc","keywords":["कला"]}</script>
  </head><body><main><h1>कला</h1><h2>Café &amp; notes</h2><p>${'sample text '.repeat(20)}</p><a href="/x">x</a></main></body></html>`;
  const htmlWall = `<html><head><title>Please log in</title></head><body><h1>Log in to continue</h1><p>Sign in to see this page.</p></body></html>`;
  const htmlLong = '<html><head><title>' + 'x'.repeat(200) + '</title></head><body><h1>' + 'y'.repeat(200) + '</h1><p>' + 'z'.repeat(7000) + '</p></body></html>';
  rec('pageparse', 'wallKind', ['', ''], Pageparse.wallKind('', ''));
  rec('pageparse', 'wallKind', ['Please log in', 'Sign in to continue'], Pageparse.wallKind('Please log in', 'Sign in to continue'));
  rec('pageparse', 'wallKind', ['ok', 'z'.repeat(2000)], Pageparse.wallKind('ok', 'z'.repeat(2000)), 'long pages are trusted');
  rec('pageparse', 'wallKind', ['कला', 'सामान्य पाठ'], Pageparse.wallKind('कला', 'सामान्य पाठ'), 'unicode');
  each('pageparse', 'cleanKeywords', Pageparse.cleanKeywords, ['', 'कला, Design, design, café', 'a; b|c\nd, e'.split(',')].map(x => [x]));
  rec('pageparse', 'cleanKeywords', [Array.from({ length: 20 }, (_, i) => 'Tag ' + i)], Pageparse.cleanKeywords(Array.from({ length: 20 }, (_, i) => 'Tag ' + i)), 'capped at 8');
  each('pageparse', 'tidyTitle', Pageparse.tidyTitle, [['', ''], ['कला पत्रिका | Example', 'example'], ['Café - Notes - Example', 'example'], ['A | B', '']]);
  rec('pageparse', 'parseHTML', [htmlFull, 'https://maker.example.org/base/'], Pageparse.parseHTML(htmlFull, 'https://maker.example.org/base/'));
  rec('pageparse', 'parseHTML', ['', ''], Pageparse.parseHTML('', ''), 'empty input');
  rec('pageparse', 'parseHTML', [htmlLong, 'https://maker.example.org/'], Pageparse.parseHTML(htmlLong, 'https://maker.example.org/'), 'long text is capped');
  rec('pageparse', 'parseHTML', [htmlWall, ''], Pageparse.parseHTML(htmlWall, ''), 'login wall');
  const readerJson = JSON.stringify({ data: { title: 'कला', description: 'Café notes', content: '# Heading\n\nSome **sample** text with a [link](/x).', url: 'https://maker.example.org/kala' } });
  rec('pageparse', 'parseReader', [readerJson, ''], Pageparse.parseReader(readerJson, ''));
  rec('pageparse', 'parseReader', ['Title: कला\nURL Source: https://maker.example.org/kala\nMarkdown Content:\n# Heading\n\nCafé **text**.', ''], Pageparse.parseReader('Title: कला\nURL Source: https://maker.example.org/kala\nMarkdown Content:\n# Heading\n\nCafé **text**.', ''));
  rec('pageparse', 'parseReader', ['', ''], Pageparse.parseReader('', ''), 'empty input');
  rec('pageparse', 'parseReader', [JSON.stringify({ code: 404, message: 'Not found' }), ''], Pageparse.parseReader(JSON.stringify({ code: 404, message: 'Not found' }), ''), 'error JSON');
  rec('pageparse', 'parseReader', [htmlFull, 'https://maker.example.org/base/'], Pageparse.parseReader(htmlFull, 'https://maker.example.org/base/'), 'HTML fallback');
  rec('pageparse', 'parseInstagramPage', [{ description: '1,234 Followers, 56 Following, 78 Posts', ogTitle: 'Café (@example_handle_9x7) • Instagram photos', title: '', text: '' }, 'example_handle_9x7'], Pageparse.parseInstagramPage({ description: '1,234 Followers, 56 Following, 78 Posts', ogTitle: 'Café (@example_handle_9x7) • Instagram photos', title: '', text: '' }, 'example_handle_9x7'));
  rec('pageparse', 'parseInstagramPage', [{ description: 'This account is private', ogTitle: '', title: '', text: '' }, 'hidden_handle'], Pageparse.parseInstagramPage({ description: 'This account is private', ogTitle: '', title: '', text: '' }, 'hidden_handle'), 'private account');
  rec('pageparse', 'parseInstagramPage', [{}, ''], Pageparse.parseInstagramPage({}, ''), 'missing fields');
  rec('pageparse', 'parseGithub', [{ full_name: 'example-owner/example-repo-9x7', description: 'A café sample', topics: ['design', 'कला'], language: 'Dart', html_url: 'https://example.org/sample', archived: false }], Pageparse.parseGithub({ full_name: 'example-owner/example-repo-9x7', description: 'A café sample', topics: ['design', 'कला'], language: 'Dart', html_url: 'https://example.org/sample', archived: false }));
  rec('pageparse', 'parseGithub', [{ login: 'example_user_9x7', bio: 'कला और café', blog: 'https://example.org', topics: [] }], Pageparse.parseGithub({ login: 'example_user_9x7', bio: 'कला और café', blog: 'https://example.org', topics: [] }), 'profile');
  rec('pageparse', 'parseGithub', [null], Pageparse.parseGithub(null), 'missing input');
  rec('pageparse', 'parseGithub', [{ message: 'Not Found' }], Pageparse.parseGithub({ message: 'Not Found' }), 'error');
  rec('pageparse', 'parseWikipedia', [{ title: 'कला', description: 'Café sample', extract: 'Some sample text.', lang: 'hi' }], Pageparse.parseWikipedia({ title: 'कला', description: 'Café sample', extract: 'Some sample text.', lang: 'hi' }));
  rec('pageparse', 'parseWikipedia', [{ title: '', extract: 'x' }], Pageparse.parseWikipedia({ title: '', extract: 'x' }), 'missing title');
  rec('pageparse', 'parseWikipedia', [{ title: 'x', type: 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found' }], Pageparse.parseWikipedia({ title: 'x', type: 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found' }), 'not found');
  // Gap cases: itemprop / http-equiv meta keys, broken JSON-LD, many headings, org fallback, markdown-only reader, instagram bio.
  const htmlMeta = `<html><head><title>Meta page</title><meta itemprop="description" content="Item description"><meta http-equiv="keywords" content="one, two"><script type="application/ld+json">{broken</script><script type="application/ld+json">{"@type":"Organization","description":"Org desc","keywords":"org, keywords"}</script></head><body>${['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8'].map((h, i) => `<${h}>Heading ${i}</${h}>`).join('')}<p>body text</p></body></html>`;
  rec('pageparse', 'parseHTML', [htmlMeta, 'https://meta.example.org/'], Pageparse.parseHTML(htmlMeta, 'https://meta.example.org/'), 'itemprop and http-equiv meta, broken ld+json, 8 headings');
  rec('pageparse', 'parseHTML', [htmlFull, 'not a base url'], Pageparse.parseHTML(htmlFull, 'not a base url'), 'invalid base url');
  rec('pageparse', 'tidyTitle', ['A very long first part of the title - Example', 'example'], Pageparse.tidyTitle('A very long first part of the title - Example', 'example'), 'long first part, short last part');
  rec('pageparse', 'tidyTitle', ['Sample - Notes', 'sample notes'], Pageparse.tidyTitle('Sample - Notes', 'sample notes'), 'site name contains the last part');
  rec('pageparse', 'parseReader', ['# Just markdown\n\nNo url source line here **bold**.', ''], Pageparse.parseReader('# Just markdown\n\nNo url source line here **bold**.', ''), 'markdown without URL Source');
  rec('pageparse', 'parseInstagramPage', [{ description: 'Café. on Instagram: "My sample bio text here."', ogTitle: 'Name (@some_handle_1) • Instagram', title: '', text: '' }, 'some_handle_1'], Pageparse.parseInstagramPage({ description: 'Café. on Instagram: "My sample bio text here."', ogTitle: 'Name (@some_handle_1) • Instagram', title: '', text: '' }, 'some_handle_1'), 'bio from the description');
  // Second pageparse gap round: attribute quoting, ld+json, heading caps, reader branches, empty json fields.
  const htmlQuotes = `<html><head><title>Quoted</title><meta name='description' content='Single quoted'><meta name=generator content=Unquoted></head><body><p>text</p></body></html>`;
  rec('pageparse', 'parseHTML', [htmlQuotes, 'https://q.example.org/'], Pageparse.parseHTML(htmlQuotes, 'https://q.example.org/'), 'single-quoted and unquoted meta attributes');
  const htmlLd = `<html><head><title>LD</title><script type="application/ld+json">{not json</script><script type="application/ld+json">{"@type":"Organization","name":"Org","description":"Org description","keywords":"org, keywords"}</script></head><body>${['h1', 'h2', 'h3', 'h1', 'h2', 'h3', 'h1', 'h2', 'h3'].map((h, i) => `<${h}>Heading ${i}</${h}>`).join('')}</body></html>`;
  rec('pageparse', 'parseHTML', [htmlLd, 'https://ld.example.org/'], Pageparse.parseHTML(htmlLd, 'https://ld.example.org/'), 'broken ld+json, organization fallback, 9 headings');
  const mdMany = 'Title: T\nMarkdown Content:\n' + ['# One', '## Two', '### Three', '# Four', '## Five', '### Six', '# Seven', '## Eight', '### Nine'].join('\n') + '\nSome text.';
  rec('pageparse', 'parseReader', [mdMany, ''], Pageparse.parseReader(mdMany, ''), 'markdown with 9 headings');
  rec('pageparse', 'parseReader', ['{ broken json', ''], Pageparse.parseReader('{ broken json', ''), 'broken JSON falls back to markdown');
  rec('pageparse', 'parseReader', ['{"code":500}', ''], Pageparse.parseReader('{"code":500}', ''), 'error JSON without a message');
  rec('pageparse', 'parseReader', ['{"data":{"title":"Only title"}}', ''], Pageparse.parseReader('{"data":{"title":"Only title"}}', ''), 'JSON response without content');
  rec('pageparse', 'parseReader', ['Title: Sample\nURL Source: https://reader.example.org/page\nSome plain text.', ''], Pageparse.parseReader('Title: Sample\nURL Source: https://reader.example.org/page\nSome plain text.', ''), 'URL Source without Markdown Content');
  rec('pageparse', 'parseReader', ['Title: T\nWarning: Target URL returned error 404: Not found\nMarkdown Content:\n# H\n\nText', ''], Pageparse.parseReader('Title: T\nWarning: Target URL returned error 404: Not found\nMarkdown Content:\n# H\n\nText', ''), 'reader warning line');
  rec('pageparse', 'parseGithub', [{ login: 'user_9x7' }], Pageparse.parseGithub({ login: 'user_9x7' }), 'github profile without description, bio or owner');
  rec('pageparse', 'parseWikipedia', [{ title: 'Topic' }], Pageparse.parseWikipedia({ title: 'Topic' }), 'wikipedia without description, extract or lang');
  // Third pageparse gap round: JSON-LD as an array and as @graph, an entry without @type,
  // reader JSON without a title, and the GitHub name fallbacks.
  const htmlLdArray = `<html><head><title>LD array</title><script type="application/ld+json">[null, {"description":"No type at all"}, {"@type":"Organization","description":"Array org description","keywords":"array, keywords"}]</script></head><body><p>text</p></body></html>`;
  rec('pageparse', 'parseHTML', [htmlLdArray, 'https://lda.example.org/'], Pageparse.parseHTML(htmlLdArray, 'https://lda.example.org/'), 'JSON-LD as an array, a non-object entry and an entry without @type');
  const htmlLdGraph = `<html><head><title>LD graph</title><script type="application/ld+json">{"@graph":[{"@type":"WebSite","description":"Graph description"}]}</script></head><body><p>text</p></body></html>`;
  rec('pageparse', 'parseHTML', [htmlLdGraph, 'https://ldg.example.org/'], Pageparse.parseHTML(htmlLdGraph, 'https://ldg.example.org/'), 'JSON-LD with an @graph');
  rec('pageparse', 'parseReader', ['{"data":{"description":"Café notes"}}', ''], Pageparse.parseReader('{"data":{"description":"Café notes"}}', ''), 'reader JSON without a title');
  rec('pageparse', 'parseGithub', [{ description: 'Café sample', owner: { login: 'owner_login' } }], Pageparse.parseGithub({ description: 'Café sample', owner: { login: 'owner_login' } }), 'github payload with an owner and no full_name, name or login');
  rec('pageparse', 'parseGithub', [{ name: 'user_name', description: 'Café sample' }], Pageparse.parseGithub({ name: 'user_name', description: 'Café sample' }), 'github payload with a name and no full_name');
}

// ---------- importers ----------
{
  const bookmarkHtml = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE><H1>Bookmarks</H1>
<DL><p>
  <DT><H3 ADD_DATE="1700000000">Example folder</H3>
  <DL><p>
    <DT><A HREF="https://maker.example.org/कला" ADD_DATE="1700000000" TAGS="कला, design">कला पत्रिका</A>
    <DD>Café note
    <DT><A HREF="https://docs.example.org/guide" ADD_DATE="1700000000000">Guide &amp; notes</A>
  </DL><p>
  <DT><A HREF="ftp://bad.example.org/">Bad</A>
</DL><p>`;
  const chrome = { roots: { bookmark_bar: { children: [{ type: 'folder', name: 'Example folder', children: [{ type: 'url', name: 'कला', url: 'https://maker.example.org/कला', date_added: '13300000000000000' }, { type: 'url', name: 'Docs', url: 'https://docs.example.org/guide', date_added: '13300000000000000' }] }] }, other: { children: [] } } };
  const firefox = { type: 'text/x-moz-place-container', title: '', children: [{ type: 'text/x-moz-place', title: 'Café', uri: 'https://cafe.example.org/', dateAdded: 1700000000000000, tags: 'café,notes' }] };
  const opml = `<opml version="2.0"><body><outline text="Feeds"><outline text="कला feed" xmlUrl="https://feeds.example.org/kala.xml" htmlUrl="https://maker.example.org/kala" /><outline text="Café notes" xmlUrl="https://feeds.example.org/cafe.xml" /></outline></body></opml>`;
  const csv = `Title,URL,Tags,Notes,Added\n"कला, पत्रिका",https://maker.example.org/कला,"कला;design","Line one\nLine two",2026-10-30\nCafé,https://cafe.example.org/,notes,"A, sample",1700000000000\n`;
  const linksHtml = `<html><body><a href="https://maker.example.org/कला" tags="कला,design">कला</a><a href="https://cafe.example.org/">Café</a><a href="ftp://bad.example.org/">Bad</a></body></html>`;
  const shortcut = `[InternetShortcut]\nURL=https://maker.example.org/कला\n`;
  const igJson = { relationships_following: [
    { title: 'example_handle_9x7', string_list_data: [{ href: 'https://www.instagram.com/example_handle_9x7/', value: 'example_handle_9x7', timestamp: 1700000000 }] },
    { title: '__deleted__old', string_list_data: [{ value: '__deleted__old' }] },
    { title: 'bad handle!', string_list_data: [{ value: 'bad handle!' }] },
    { title: 'example_handle_9x7', string_list_data: [{ value: 'example_handle_9x7' }] },
  ] };
  const igHtml = `<html><body><h1>Following</h1><h2>example_handle_9x7</h2><a href="https://www.instagram.com/example_handle_9x7/">Café</a> Sep 10, 2026<h2>example_maker_9x7</h2><a href="https://www.instagram.com/example_maker_9x7/">Maker</a></body></html>`;
  const urlList = `# my sample links\nकला पत्रिका | https://maker.example.org/कला\nhttps://cafe.example.org/ Café notes\n[Design](https://design.example.org/)\nnot a link\n`;
  const jsonList = ['https://maker.example.org/कला', { title: 'Café', url: 'https://cafe.example.org/', tags: 'notes, café', note: 'sample' }, { title: 'No link' }, 42];
  const backup = { resources: [{ id: 'b1', title: 'Sample', url: 'https://maker.example.org/' }] };
  const rows = (x) => x;
  rec('importers', 'decode', ['&amp; &lt; &gt;'], Importers.decode('&amp; &lt; &gt;'));
  rec('importers', 'decode', ['&#x1F642; &#128512;'], Importers.decode('&#x1F642; &#128512;'));
  rec('importers', 'decode', ['&bad;'], Importers.decode('&bad;'));
  rec('importers', 'decode', [''], Importers.decode(''));
  rec('importers', 'toISODate', ['1700000000'], Importers.toISODate('1700000000'), 'seconds');
  rec('importers', 'toISODate', [1700000000000], Importers.toISODate(1700000000000), 'milliseconds');
  rec('importers', 'toISODate', ['13300000000000000'], Importers.toISODate('13300000000000000'), 'Chrome microseconds since 1601');
  rec('importers', 'toISODate', ['2026-10-31'], Importers.toISODate('2026-10-31'));
  rec('importers', 'toISODate', [''], Importers.toISODate(''));
  rec('importers', 'toISODate', ['bad'], Importers.toISODate('bad'));
  rec('importers', 'sniff', [bookmarkHtml, 'sample.html'], Importers.sniff(bookmarkHtml, 'sample.html'));
  rec('importers', 'sniff', [JSON.stringify(chrome), 'Bookmarks'], Importers.sniff(JSON.stringify(chrome), 'Bookmarks'));
  rec('importers', 'sniff', ['', ''], Importers.sniff('', ''), 'empty input');
  rec('importers', 'sniff', [JSON.stringify(igJson), 'following.json'], Importers.sniff(JSON.stringify(igJson), 'following.json'), 'Instagram JSON');
  rec('importers', 'detectFormat', [bookmarkHtml], Importers.detectFormat(bookmarkHtml));
  rec('importers', 'detectFormat', [urlList], Importers.detectFormat(urlList));
  rec('importers', 'detectFormat', [JSON.stringify(backup)], Importers.detectFormat(JSON.stringify(backup)));
  rec('importers', 'detectFormat', [''], Importers.detectFormat(''), 'empty input');
  rec('importers', 'parseBookmarksHTML', [bookmarkHtml], Importers.parseBookmarksHTML(bookmarkHtml));
  rec('importers', 'parseBookmarksHTML', [''], Importers.parseBookmarksHTML(''));
  rec('importers', 'parseBookmarksHTML', ['<DL><DT><A HREF="ftp://bad.example.org/">Bad</A></DL>'], Importers.parseBookmarksHTML('<DL><DT><A HREF="ftp://bad.example.org/">Bad</A></DL>'));
  rec('importers', 'parseBookmarksJSON', [chrome], Importers.parseBookmarksJSON(chrome), 'Chrome tree');
  rec('importers', 'parseBookmarksJSON', [firefox], Importers.parseBookmarksJSON(firefox), 'Firefox tree');
  rec('importers', 'parseBookmarksJSON', [{}], Importers.parseBookmarksJSON({}), 'empty input');
  rec('importers', 'parseOPML', [opml], Importers.parseOPML(opml));
  rec('importers', 'parseOPML', [''], Importers.parseOPML(''));
  rec('importers', 'parseOPML', ['<opml><body><outline text="No link"/></body></opml>'], Importers.parseOPML('<opml><body><outline text="No link"/></body></opml>'));
  rec('importers', 'parseCSVRows', [csv], Importers.parseCSVRows(csv));
  rec('importers', 'parseCSVRows', ['one;two\nthree;four\n'], Importers.parseCSVRows('one;two\nthree;four\n'), 'semicolon delimiter');
  rec('importers', 'parseCSVRows', [''], Importers.parseCSVRows(''), 'empty input');
  rec('importers', 'parseCSV', [csv], Importers.parseCSV(csv));
  rec('importers', 'parseCSV', ['One,Two\nhttps://maker.example.org/कला,Sample\n'], Importers.parseCSV('One,Two\nhttps://maker.example.org/कला,Sample\n'), 'no url header');
  rec('importers', 'parseCSV', [''], Importers.parseCSV(''), 'empty input');
  rec('importers', 'parseShortcut', [shortcut, 'sample.url'], Importers.parseShortcut(shortcut, 'sample.url'));
  rec('importers', 'parseShortcut', ['<plist><dict><key>URL</key><string>https://maker.example.org/</string></dict></plist>', ''], Importers.parseShortcut('<plist><dict><key>URL</key><string>https://maker.example.org/</string></dict></plist>', ''));
  rec('importers', 'parseShortcut', ['', ''], Importers.parseShortcut(''), 'empty input');
  rec('importers', 'parseLinksHTML', [linksHtml], Importers.parseLinksHTML(linksHtml));
  rec('importers', 'parseLinksHTML', [''], Importers.parseLinksHTML(''));
  rec('importers', 'parseLinksHTML', ['<a href="https://maker.example.org/कला">कला</a><a href="https://cafe.example.org/">Café</a>'], Importers.parseLinksHTML('<a href="https://maker.example.org/कला">कला</a><a href="https://cafe.example.org/">Café</a>'));
  rec('importers', 'parseUrlList', [urlList], Importers.parseUrlList(urlList));
  rec('importers', 'parseUrlList', [''], Importers.parseUrlList(''));
  rec('importers', 'parseUrlList', ['कला पत्रिका | https://maker.example.org/कला\nhttps://cafe.example.org/ Café'], Importers.parseUrlList('कला पत्रिका | https://maker.example.org/कला\nhttps://cafe.example.org/ Café'));
  rec('importers', 'parseJSONArray', [jsonList], Importers.parseJSONArray(jsonList));
  rec('importers', 'parseJSONArray', [[]], Importers.parseJSONArray([]), 'empty input');
  rec('importers', 'parseJSONArray', ['{'], safe(() => Importers.parseJSONArray('{')), 'broken JSON throws');
  rec('importers', 'parseInstagramList', [igJson], Importers.parseInstagramList(igJson), 'JSON object with relationships_following');
  rec('importers', 'parseInstagramList', [igHtml], Importers.parseInstagramList(igHtml), 'HTML export');
  rec('importers', 'parseInstagramList', [''], Importers.parseInstagramList(''));
  rec('importers', 'parseInstagramFollowing', [igJson], Importers.parseInstagramFollowing(igJson));
  rec('importers', 'parseInstagramFollowing', [igHtml], Importers.parseInstagramFollowing(igHtml));
  rec('importers', 'parseInstagramFollowing', [''], Importers.parseInstagramFollowing(''));
  each('importers', 'inferType', Importers.inferType, [['https://docs.example.org/guide', 'Docs'], ['https://maker.example.org/tool', 'PDF converter'], ['https://catalogue.example.org/list', 'Awesome catalogue'], ['https://example.org/feed.xml', '']]);
  each('importers', 'inferTags', Importers.inferTags, [['https://maker.example.org/कला', 'कला पत्रिका'], ['https://cafe.example.org/', 'Café notes'], ['', '']]);
  rec('importers', 'entryToResource', [{ title: 'कला', url: 'https://maker.example.org/कला', tags: ['कला'] }], Importers.entryToResource({ title: 'कला', url: 'https://maker.example.org/कला', tags: ['कला'] }));
  rec('importers', 'entryToResource', [{ title: '', url: '' }], Importers.entryToResource({ title: '', url: '' }), 'missing fields');
  rec('importers', 'entryToResource', [{ title: 'Café', url: 'https://cafe.example.org/' }], Importers.entryToResource({ title: 'Café', url: 'https://cafe.example.org/' }));
  rec('importers', 'readSource', ['sample.html', bookmarkHtml], Importers.readSource('sample.html', bookmarkHtml));
  rec('importers', 'readSource', ['Bookmarks', JSON.stringify(chrome)], Importers.readSource('Bookmarks', JSON.stringify(chrome)), 'Chrome JSON');
  rec('importers', 'readSource', ['backup.json', JSON.stringify(backup)], Importers.readSource('backup.json', JSON.stringify(backup)), 'Nexus backup');
  rec('importers', 'readSource', ['broken.json', '{'], Importers.readSource('broken.json', '{'), 'broken JSON');
  rec('importers', 'parseAny', [bookmarkHtml], Importers.parseAny(bookmarkHtml), 'bookmarks HTML');
  rec('importers', 'parseAny', [JSON.stringify(chrome)], Importers.parseAny(JSON.stringify(chrome)), 'Chrome bookmarks JSON');
  rec('importers', 'parseAny', [opml], Importers.parseAny(opml), 'OPML');
  rec('importers', 'parseAny', [csv], Importers.parseAny(csv), 'CSV');
  rec('importers', 'parseAny', [JSON.stringify(igJson)], Importers.parseAny(JSON.stringify(igJson)), 'Instagram following JSON');
  rec('importers', 'parseAny', [urlList], Importers.parseAny(urlList), 'plain list of urls');
  rec('importers', 'parseAny', [''], Importers.parseAny(''), 'empty input');
  rec('importers', 'parseAny', [JSON.stringify(backup)], Importers.parseAny(JSON.stringify(backup)), 'Nexus backup is skipped');
  // Starter and gap cases added before the Dart port. All values are made up.
  rec('importers', 'decode', ['&nbsp; &AMP; &#X41; &#x110000; &#99999999999999999999; &amp;amp;'], Importers.decode('&nbsp; &AMP; &#X41; &#x110000; &#99999999999999999999; &amp;amp;'), 'named, upper hex, invalid codepoint and double escape');
  rec('importers', 'toISODate', ['2023-11-14T22:13:20Z'], Importers.toISODate('2023-11-14T22:13:20Z'), 'ISO instant');
  rec('importers', 'toISODate', ['2023-11-15T03:43:20+05:30'], Importers.toISODate('2023-11-15T03:43:20+05:30'), 'ISO with offset');
  rec('importers', 'toISODate', ['1994-12-31'], Importers.toISODate('1994-12-31'), 'before 1995');
  rec('importers', 'toISODate', ['2101-01-01'], Importers.toISODate('2101-01-01'), 'after 2100');
  rec('importers', 'toISODate', ['123456789'], Importers.toISODate('123456789'), 'nine digits');
  rec('importers', 'parseCSVRows', ['\uFEFFtitle,url\r\n"One, two","https://one.example.org/"\r\n'], Importers.parseCSVRows('\uFEFFtitle,url\r\n"One, two","https://one.example.org/"\r\n'), 'BOM and CRLF');
  rec('importers', 'parseCSVRows', ['title,url\n"Say ""hello""","https://quote.example.org/"\n'], Importers.parseCSVRows('title,url\n"Say ""hello""","https://quote.example.org/"\n'), 'doubled quotes');
  rec('importers', 'parseCSVRows', ['title\turl\nTabbed\thttps://tab.example.org/\n'], Importers.parseCSVRows('title\turl\nTabbed\thttps://tab.example.org/\n'), 'tab separated');
  rec('importers', 'parseCSVRows', ['one\nhttps://one.example.org/\n'], Importers.parseCSVRows('one\nhttps://one.example.org/\n'), 'single column');
  rec('importers', 'parseCSVRows', ['title,url\n"unterminated,https://one.example.org/\n'], Importers.parseCSVRows('title,url\n"unterminated,https://one.example.org/\n'), 'unterminated quote');
  rec('importers', 'parseCSV', ['\uFEFFtitle,url,time_added,tags\nPocket sample,https://pocket.example.org/,1700000000,"read, later"\n'], Importers.parseCSV('\uFEFFtitle,url,time_added,tags\nPocket sample,https://pocket.example.org/,1700000000,"read, later"\n'), 'Pocket header and BOM');
  rec('importers', 'parseCSV', ['description,href,extended\nPinboard sample,https://pinboard.example.org/,A longer note\n'], Importers.parseCSV('description,href,extended\nPinboard sample,https://pinboard.example.org/,A longer note\n'), 'Pinboard description is the title');
  rec('importers', 'parseCSV', ['name,note\nNo link here,still none\n'], Importers.parseCSV('name,note\nNo link here,still none\n'), 'no link column');
  rec('importers', 'parseBookmarksHTML', ['<DL><p><DT><H3>Bookmarks bar</H3><DL><p><DT><H3>A</H3><DL><p><DT><H3>B</H3><DL><p><DT><A HREF=\'https://nested.example.org/\' ADD_DATE="1700000000" TAGS="कला; design">Nested</A><DD>Long note</DL><p></DL><p></DL><p></DL><p>'], Importers.parseBookmarksHTML('<DL><p><DT><H3>Bookmarks bar</H3><DL><p><DT><H3>A</H3><DL><p><DT><H3>B</H3><DL><p><DT><A HREF=\'https://nested.example.org/\' ADD_DATE="1700000000" TAGS="कला; design">Nested</A><DD>Long note</DL><p></DL><p></DL><p></DL><p>'), 'three nested folders and single-quoted href');
  rec('importers', 'parseBookmarksHTML', ['<DL><DT><A HREF="javascript:alert(1)">Bad</A><DT><A HREF="https://good.example.org/">Good</A></DL>'], Importers.parseBookmarksHTML('<DL><DT><A HREF="javascript:alert(1)">Bad</A><DT><A HREF="https://good.example.org/">Good</A></DL>'), 'javascript link skipped');
  rec('importers', 'parseBookmarksJSON', [{ roots: { bookmark_bar: { children: [{ type: 'folder', name: 'Bookmarks bar', children: [{ type: 'url', name: 'Nested', url: 'https://nested.example.org/', date_added: '1700000000' }] }] }, other: {} } }], Importers.parseBookmarksJSON({ roots: { bookmark_bar: { children: [{ type: 'folder', name: 'Bookmarks bar', children: [{ type: 'url', name: 'Nested', url: 'https://nested.example.org/', date_added: '1700000000' }] }] }, other: {} } }), 'Chrome roots with nested folder');
  rec('importers', 'parseBookmarksJSON', [{ typeCode: 2, title: '', root: 'placesRoot', children: [{ typeCode: 1, title: 'Nested', uri: 'https://nested.example.org/', dateAdded: 1700000000 }] }], Importers.parseBookmarksJSON({ typeCode: 2, title: '', root: 'placesRoot', children: [{ typeCode: 1, title: 'Nested', uri: 'https://nested.example.org/', dateAdded: 1700000000 }] }), 'Firefox nested tree');
  rec('importers', 'parseOPML', ['<opml><body><outline text="A"><outline text="B" xmlUrl="https://feed.example.org/rss" htmlUrl="https://feed.example.org/"/></outline></body></opml>'], Importers.parseOPML('<opml><body><outline text="A"><outline text="B" xmlUrl="https://feed.example.org/rss" htmlUrl="https://feed.example.org/"/></outline></body></opml>'), 'two levels and feed urls');
  rec('importers', 'parseUrlList', ['example.org\nExample | docs.example.org/path).\n[Design](https://design.example.org/a).\nTitle, example.net\nhttps://cafe.example.org/ (notes)\n// comment\n'], Importers.parseUrlList('example.org\nExample | docs.example.org/path).\n[Design](https://design.example.org/a).\nTitle, example.net\nhttps://cafe.example.org/ (notes)\n// comment\n'), 'bare domains, markdown and trailing punctuation');
  const igBare = [{ string_list_data: [{ value: 'Café.User', timestamp: 1700000000 }] }, { string_list_data: [{ value: 'café.user' }] }, { string_list_data: [{ title: 'no_value' }] }, { string_list_data: [] }, { title: 'NoData' }, { string_list_data: [{ value: 'a'.repeat(31) }] }, { string_list_data: [{ value: '__deleted__old' }] }, { string_list_data: [{ value: 'bad handle' }] }];
  rec('importers', 'parseInstagramList', [igBare], Importers.parseInstagramList(igBare), 'bare array, duplicate case, deleted and bad handles');
  rec('importers', 'parseInstagramList', ['<html><h1>Following</h1><h2>Following</h2><a href="https://www.instagram.com/Example.One/">Example.One</a></html>'], Importers.parseInstagramList('<html><h1>Following</h1><h2>Following</h2><a href="https://www.instagram.com/Example.One/">Example.One</a></html>'), 'HTML heading');
  rec('importers', 'parseInstagramList', ['<html><a href="https://www.instagram.com/NoHeading/">NoHeading</a></html>'], Importers.parseInstagramList('<html><a href="https://www.instagram.com/NoHeading/">NoHeading</a></html>'), 'HTML without h2');
  rec('importers', 'readSource', ['sample.url', '[InternetShortcut]\nURL=https://shortcut.example.org/\n'], Importers.readSource('sample.url', '[InternetShortcut]\nURL=https://shortcut.example.org/\n'), 'shortcut file');
  rec('importers', 'readSource', ['links.html', '<html><body><a href="https://one.example.org/">One</a><a href="ftp://bad/">Bad</a></body></html>'], Importers.readSource('links.html', '<html><body><a href="https://one.example.org/">One</a><a href="ftp://bad/">Bad</a></body></html>'), 'links-only HTML');
  rec('importers', 'readSource', ['links.json', '["https://one.example.org/","bad"]'], Importers.readSource('links.json', '["https://one.example.org/","bad"]'), 'JSON list of urls');
  rec('importers', 'readSource', ['wrapped.json', '{"bookmarks":[{"title":"One","url":"https://one.example.org/"}]}'], Importers.readSource('wrapped.json', '{"bookmarks":[{"title":"One","url":"https://one.example.org/"}]}'), 'bookmarks wrapper');
  rec('importers', 'readSource', ['other.json', '{"hello":1}'], Importers.readSource('other.json', '{"hello":1}'), 'JSON that is not a link list');
  rec('importers', 'readSource', ['unknown.html', '<html><body><p>No links</p></body></html>'], Importers.readSource('unknown.html', '<html><body><p>No links</p></body></html>'), 'HTML without links');
  rec('importers', 'inferType', ['https://www.youtube.com/@sample', ''], Importers.inferType('https://www.youtube.com/@sample', ''), 'YouTube channel');
  rec('importers', 'inferTags', ['https://study.example.edu/', 'Sample'], Importers.inferTags('https://study.example.edu/', 'Sample'), 'education TLD');
  rec('importers', 'sniff', ['[InternetShortcut]\nURL=https://shortcut.example.org/\n', ''], Importers.sniff('[InternetShortcut]\nURL=https://shortcut.example.org/\n', ''), 'shortcut');
  rec('importers', 'sniff', ['{"items":[{"url":"https://one.example.org/"}]}', 'items.json'], Importers.sniff('{"items":[{"url":"https://one.example.org/"}]}', 'items.json'), 'JSON items list');
  rec('importers', 'sniff', ['{"relationships_blocked":[{"string_list_data":[{"value":"blocked_one"}]}]}', 'blocked.json'], Importers.sniff('{"relationships_blocked":[{"string_list_data":[{"value":"blocked_one"}]}]}', 'blocked.json'), 'Instagram blocked object');
  rec('importers', 'sniff', ['{"relationships_followers":[{"string_list_data":[{"value":"follower_one"}]}]}', 'followers.json'], Importers.sniff('{"relationships_followers":[{"string_list_data":[{"value":"follower_one"}]}]}', 'followers.json'), 'Instagram followers object');
  rec('importers', 'sniff', ['{"relationships_close_friends":[]}', 'close.json'], Importers.sniff('{"relationships_close_friends":[]}', 'close.json'), 'Instagram close friends object');
  rec('importers', 'sniff', ['{"relationships_unfollowed_users":[]}', 'unfollow.json'], Importers.sniff('{"relationships_unfollowed_users":[]}', 'unfollow.json'), 'Instagram unfollowed object');
  rec('importers', 'sniff', ['{"relationships_other":[]}', 'other.json'], Importers.sniff('{"relationships_other":[]}', 'other.json'), 'Instagram other object');
  rec('importers', 'sniff', ['[{"string_list_data":[]}]', 'blocked.json'], Importers.sniff('[{"string_list_data":[]}]', 'blocked.json'), 'Instagram file name');
  rec('importers', 'parseJSONArray', ['[{"href":"https://one.example.org/","name":"One","extended":"Long note","time":1700000000}]'], Importers.parseJSONArray('[{"href":"https://one.example.org/","name":"One","extended":"Long note","time":1700000000}]'), 'object fields and note');
  // Gap cases for lines no earlier case ran (attr fallbacks, ig kinds, readSource notes, CSV heuristics).
  rec('importers', 'sniff', ['<plist><dict><key>URL</key><string>https://maker.example.org/</string></dict></plist>', 'x.webloc'], Importers.sniff('<plist><dict><key>URL</key><string>https://maker.example.org/</string></dict></plist>', 'x.webloc'), 'plist shortcut');
  rec('importers', 'sniff', ['<html><body><h1>Followers</h1><h2>x</h2><a href="https://www.instagram.com/u1/">u1</a></body></html>', ''], Importers.sniff('<html><body><h1>Followers</h1><h2>x</h2><a href="https://www.instagram.com/u1/">u1</a></body></html>', ''), 'instagram h1 fallback');
  rec('importers', 'readSource', ['requests.json', JSON.stringify(igJson)], Importers.readSource('requests.json', JSON.stringify(igJson)), 'instagram requests list is skipped');
  rec('importers', 'readSource', ['restricted.json', JSON.stringify(igJson)], Importers.readSource('restricted.json', JSON.stringify(igJson)), 'instagram restricted list is skipped');
  rec('importers', 'readSource', ['hidden.json', JSON.stringify(igJson)], Importers.readSource('hidden.json', JSON.stringify(igJson)), 'instagram hidden list is skipped');
  rec('importers', 'readSource', ['followers_1.json', JSON.stringify(igBare)], Importers.readSource('followers_1.json', JSON.stringify(igBare)), 'followers_1.json is skipped with its note');
  rec('importers', 'readSource', ['list.csv', 'name,note\nNo link here,still none\n'], Importers.readSource('list.csv', 'name,note\nNo link here,still none\n'), 'csv without a link column');
  rec('importers', 'readSource', ['empty.json', '[]'], Importers.readSource('empty.json', '[]'), 'json list without links');
  rec('importers', 'readSource', ['notes.txt', 'no links in this text at all'], Importers.readSource('notes.txt', 'no links in this text at all'), 'plain text without links');
  rec('importers', 'parseJSONArray', ['{"a":1}'], safe(() => Importers.parseJSONArray('{"a":1}')), 'not an array throws');
  rec('importers', 'parseJSONArray', ['[{"url":"https://a.example.org/","tags":["one","two"]}]'], Importers.parseJSONArray('[{"url":"https://a.example.org/","tags":["one","two"]}]'), 'tags as an array');
  rec('importers', 'parseBookmarksHTML', ['<DL><DT><A HREF=https://unquoted.example.org/>Unquoted</A></DL>'], Importers.parseBookmarksHTML('<DL><DT><A HREF=https://unquoted.example.org/>Unquoted</A></DL>'), 'unquoted attribute');
  rec('importers', 'parseOPML', ['<opml><body><outline text=Feeds><outline text=B xmlUrl=https://feed.example.org/rss/></outline></body></opml>'], Importers.parseOPML('<opml><body><outline text=Feeds><outline text=B xmlUrl=https://feed.example.org/rss/></outline></body></opml>'), 'unquoted opml attributes');
  rec('importers', 'parseCSV', ['note,link,label\nn1,https://a.example.org/,L1\nn2,not-a-url,L2\n'], Importers.parseCSV('note,link,label\nn1,https://a.example.org/,L1\nn2,not-a-url,L2\n'), 'link column not first, non-http row skipped');
  each('importers', 'inferTags', Importers.inferTags, [['https://x.example.in/', 'T'], ['https://x.example.co.in/', 'T'], ['https://x.example.ac.in/', 'T']]);
  rec('importers', 'toISODate', ['2026-10-31T10:00:00'], Importers.toISODate('2026-10-31T10:00:00'), 'time without a zone is local');
  // Second gap round: sniff branches, CSV heuristics, OPML/bookmarks edge lines, instagram list edges.
  rec('importers', 'sniff', [JSON.stringify({ relationships_following: igJson.relationships_following }), ''], Importers.sniff(JSON.stringify({ relationships_following: igJson.relationships_following }), ''), 'instagram from the object key');
  rec('importers', 'sniff', [JSON.stringify([igJson.relationships_following[0]]), 'list.json'], Importers.sniff(JSON.stringify([igJson.relationships_following[0]]), 'list.json'), 'bare array root defaults to followers');
  rec('importers', 'sniff', [JSON.stringify(chrome), 'Bookmarks'], Importers.sniff(JSON.stringify(chrome), 'Bookmarks'), 'chrome roots bookmark_bar');
  rec('importers', 'sniff', [igHtml, 'following.html'], Importers.sniff(igHtml, 'following.html'), 'instagram html with h2');
  rec('importers', 'detectFormat', [JSON.stringify([{ url: 'https://one.example.org/' }])], Importers.detectFormat(JSON.stringify([{ url: 'https://one.example.org/' }])), 'json array format name');
  rec('importers', 'readSource', ['following.json', JSON.stringify(igJson)], Importers.readSource('following.json', JSON.stringify(igJson)), 'instagram following json by name');
  rec('importers', 'readSource', ['following.html', igHtml], Importers.readSource('following.html', igHtml), 'instagram following html by name');
  rec('importers', 'readSource', ['deleted.json', JSON.stringify({ relationships_following: [{ title: '__deleted__x', string_list_data: [{ value: '__deleted__x' }] }, igJson.relationships_following[0]] })], Importers.readSource('deleted.json', JSON.stringify({ relationships_following: [{ title: '__deleted__x', string_list_data: [{ value: '__deleted__x' }] }, igJson.relationships_following[0]] })), 'deleted account note uses the plural');
  rec('importers', 'parseBookmarksJSON', [chrome], Importers.parseBookmarksJSON(chrome), 'chrome tree walk');
  rec('importers', 'parseOPML', [opml], Importers.parseOPML(opml), 'opml with folders and rss');
  rec('importers', 'parseCSV', ['description,link\nA pin,https://pin.example.org/\n'], Importers.parseCSV('description,link\nA pin,https://pin.example.org/\n'), 'pinboard style description is the title');
  rec('importers', 'parseCSV', ['a,b,c\nhttps://x.example.org/,https://y.example.org/,https://z.example.org/\n'], Importers.parseCSV('a,b,c\nhttps://x.example.org/,https://y.example.org/,https://z.example.org/\n'), 'no header name: most-links column wins');
  rec('importers', 'parseCSVRows', ['a,b\r\n"x\r\ny",z\r\n'], Importers.parseCSVRows('a,b\r\n"x\r\ny",z\r\n'), 'CRLF and a line break inside quotes');
  rec('importers', 'parseUrlList', ['example.com/page Title\nTitle - example.com\nhttps://trail.example.org/x).\n'], Importers.parseUrlList('example.com/page Title\nTitle - example.com\nhttps://trail.example.org/x).\n'), 'bare domains and trailing punctuation');
  rec('importers', 'parseInstagramList', [JSON.stringify([{ string_list_data: [{ value: 'no_href_handle' }] }, { title: 'titled_only' }, { string_list_data: [{ href: 'https://www.instagram.com/from_href_1/' }] }])], Importers.parseInstagramList(JSON.stringify([{ string_list_data: [{ value: 'no_href_handle' }] }, { title: 'titled_only' }, { string_list_data: [{ href: 'https://www.instagram.com/from_href_1/' }] }])), 'json entries without string_list_data, title and href fallback');
  rec('importers', 'parseInstagramList', ['<html><body><a href="https://www.instagram.com/plain_link_1/">x</a></body></html>'], Importers.parseInstagramList('<html><body><a href="https://www.instagram.com/plain_link_1/">x</a></body></html>'), 'html without h2 falls back to hrefs');
  rec('importers', 'entryToResource', [{ url: 'https://entry.example.org/', title: 'Entry', draft: false }], Importers.entryToResource({ url: 'https://entry.example.org/', title: 'Entry', draft: false }), 'draft given as false');
  rec('importers', 'entryToResource', [{ url: 'https://entry.example.org/', title: 'Entry' }], Importers.entryToResource({ url: 'https://entry.example.org/', title: 'Entry' }), 'draft defaults to true');
  // Third gap round (last 4 slots for this module): tag list branches, CSV heuristics, JSON date and description.
  const bmTags = { roots: { bookmark_bar: { children: [
    { type: 'url', uri: 'https://tagged.example.org/', title: 'Tagged', tags: ['alpha', ' beta '] },
    { type: 'url', uri: 'https://spaces.example.org/', title: 'Spaces', tags: '   ' },
  ] } } };
  rec('importers', 'parseBookmarksJSON', [bmTags], Importers.parseBookmarksJSON(bmTags), 'tags as an array and a blank tag string');
  rec('importers', 'parseCSV', ['One,Two\nhttps://a.example.org/,\nhttps://b.example.org/,B\n'], Importers.parseCSV('One,Two\nhttps://a.example.org/,\nhttps://b.example.org/,B\n'), 'no url header, empty cell in the first row');
  rec('importers', 'parseCSV', ['title,url,folder,tags,notes\nA,https://a.example.org/,,,,\nB,not-a-url,,,\n'], Importers.parseCSV('title,url,folder,tags,notes\nA,https://a.example.org/,,,,\nB,not-a-url,,,\n'), 'non-http row skipped, empty title, folder, tags and notes');
  const jsonDates = '[{"url":"https://d1.example.org/","description":"Short description"},{"url":"https://d2.example.org/","description":"' + 'x'.repeat(200) + '"},{"url":"https://d3.example.org/","created":1700000000},{"url":"https://d4.example.org/","date":"2026-10-20"}]';
  rec('importers', 'parseJSONArray', [jsonDates], Importers.parseJSONArray(jsonDates), 'description as title, long description, created and date');
  cst3('importers', 'KIND_LABEL', Importers.KIND_LABEL);
  each('importers', 'stem', Importers.stem, [['slides'], ['café'], ['']]);
  // Fourth gap round: no case cap. Every never-run block the earlier rounds left, one at a time.
  // toTagList: an empty string still reaches the "String(v || '')" fallback through parseJSONArray.
  rec('importers', 'parseJSONArray', ['[{"url":"https://a.example.org/","tags":""}]'], Importers.parseJSONArray('[{"url":"https://a.example.org/","tags":""}]'), 'tags as an empty string');
  const igTitles = [{ title: 'Title One', string_list_data: [{ timestamp: 1700000000 }] }, { string_list_data: [{ value: 'value_two', timestamp: 1700000001 }] }];
  rec('importers', 'parseInstagramList', [igTitles], Importers.parseInstagramList(igTitles), 'handle from the entry title, timestamp without a value');
  rec('importers', 'readSource', ['followers_1.json', JSON.stringify(igTitles)], Importers.readSource('followers_1.json', JSON.stringify(igTitles)), 'followers export with titles: skipped, label "Instagram followers"');
  rec('importers', 'readSource', ['x.txt', 'just some words'], Importers.readSource('x.txt', 'just some words'), 'plain words in a text file');
  rec('importers', 'readSource', ['a.json', '{"a":1}'], Importers.readSource('a.json', '{"a":1}'), 'a JSON object with no link list in it');
  rec('importers', 'readSource', ['', '<html><body>nothing here</body></html>'], Importers.readSource('', '<html><body>nothing here</body></html>'), 'HTML with no links and no file name');
  const ffJson = { type: 'text/x-moz-place-container', title: 'Café', children: [{ type: 'text/x-moz-place', title: 'Café', uri: 'https://cafe.example.org/', dateAdded: 1700000000, tags: 'café' }] };
  rec('importers', 'readSource', ['backup.json', JSON.stringify(ffJson)], Importers.readSource('backup.json', JSON.stringify(ffJson)), 'Firefox JSON flavour end to end');
  // sniff: Instagram relationship keys no earlier case reached.
  for (const key of ['relationships_follow_requests', 'relationships_restricted', 'relationships_hidden_story']) {
    const body = JSON.stringify({ [key]: [{ string_list_data: [{ value: 'k_one' }] }] });
    rec('importers', 'sniff', [body, ''], Importers.sniff(body, ''), 'instagram ' + key.replace('relationships_', '') + ' key');
  }
  // sniff: a bare instagram array with a file name that says which list it is.
  for (const n of ['', 'close_friends.json', 'unfollowed.json', 'requests.json']) {
    const body = '[{"string_list_data":[{"value":"bare_one"}]}]';
    rec('importers', 'sniff', [body, n], Importers.sniff(body, n), 'bare instagram array, file name ' + (n || '(none)'));
  }
  // sniff: Instagram HTML whose kind comes from the h1 heading.
  for (const [h1, kind] of [['Blocked profiles', 'blocked'], ['Close friends', 'close'], ['Recently unfollowed profiles', 'unfollowed'], ['Follow requests', 'requests'], ['Restricted profiles', 'restricted'], ['Hidden story list', 'hidden']]) {
    const body = '<html><body><h1>' + h1 + '</h1><h2>x</h2><a href="https://www.instagram.com/u1/">u1</a></body></html>';
    rec('importers', 'sniff', [body, ''], Importers.sniff(body, ''), 'instagram html heading "' + h1 + '" -> ' + kind);
  }
  // sniff: browser JSON flavours, and an Instagram page with no heading.
  rec('importers', 'sniff', ['{"roots":{"other":{"children":[]}}}', ''], Importers.sniff('{"roots":{"other":{"children":[]}}}', ''), 'chrome roots with only "other"');
  const ffType = { type: 'text/x-moz-place-container', children: [{ type: 'text/x-moz-place', uri: 'https://c.example.org/' }] };
  rec('importers', 'sniff', [JSON.stringify(ffType), ''], Importers.sniff(JSON.stringify(ffType), ''), 'firefox JSON from the type field');
  rec('importers', 'sniff', ['{"children":[],"typeCode":2}', ''], Importers.sniff('{"children":[],"typeCode":2}', ''), 'firefox JSON from typeCode');
  rec('importers', 'sniff', ['<html><body><h2>x</h2><a href="https://www.instagram.com/u1/">u1</a></body></html>', ''], Importers.sniff('<html><body><h2>x</h2><a href="https://www.instagram.com/u1/">u1</a></body></html>', ''), 'instagram html with no h1');
  rec('importers', 'detectFormat', [JSON.stringify({ relationships_followers: [{ string_list_data: [{ value: 'fol_one' }] }] })], Importers.detectFormat(JSON.stringify({ relationships_followers: [{ string_list_data: [{ value: 'fol_one' }] }] })), 'an instagram list that is not the following one');
  // parseBookmarksJSON: a null child, a root with no children, a node that holds roots.
  const bmNull = { roots: { bookmark_bar: { children: [null, { type: 'url', name: 'N', url: 'https://n.example.org/', date_added: '13300000000000000' }] } } };
  rec('importers', 'parseBookmarksJSON', [bmNull], Importers.parseBookmarksJSON(bmNull), 'a null child in the tree');
  rec('importers', 'parseBookmarksJSON', [{ roots: { bookmark_bar: {} } }], Importers.parseBookmarksJSON({ roots: { bookmark_bar: {} } }), 'a root with no children and no roots');
  const bmRoots = { roots: { bookmark_bar: { roots: { inner: { type: 'url', name: 'Inner', url: 'https://inner.example.org/' } } } } };
  rec('importers', 'parseBookmarksJSON', [bmRoots], Importers.parseBookmarksJSON(bmRoots), 'a node that holds roots but no children');
  // parseOPML: a name from title, and a non-self-closing outline that is itself a link.
  rec('importers', 'parseOPML', ['<opml><body><outline title="Titled group"><outline title="Feed one" xmlUrl="https://feeds.example.org/one.xml"/></outline></body></opml>'], Importers.parseOPML('<opml><body><outline title="Titled group"><outline title="Feed one" xmlUrl="https://feeds.example.org/one.xml"/></outline></body></opml>'), 'names from title instead of text');
  rec('importers', 'parseOPML', ['<opml><body><outline text="Feed group" htmlUrl="https://group.example.org/"><outline text="Feed two" xmlUrl="https://feeds.example.org/two.xml"/></outline></body></opml>'], Importers.parseOPML('<opml><body><outline text="Feed group" htmlUrl="https://group.example.org/"><outline text="Feed two" xmlUrl="https://feeds.example.org/two.xml"/></outline></body></opml>'), 'an outline that is a link and has children');
  // CSV: a lone carriage return, and a body row shorter than the header.
  rec('importers', 'parseCSVRows', ['a,b\rc,d\r'], Importers.parseCSVRows('a,b\rc,d\r'), 'lone carriage return line endings');
  rec('importers', 'parseCSV', ['title,url\nNoUrlColumn\n'], Importers.parseCSV('title,url\nNoUrlColumn\n'), 'a body row with no url column');
  // Instagram HTML whose h2 is empty: the handle comes from the href, or from nothing.
  rec('importers', 'parseInstagramList', ['<html><h2>  </h2><a href="https://www.instagram.com/SomeOne/">SomeOne</a></html>'], Importers.parseInstagramList('<html><h2>  </h2><a href="https://www.instagram.com/SomeOne/">SomeOne</a></html>'), 'empty h2, handle from the href');
  rec('importers', 'parseInstagramList', ['<html><h2>  </h2>nothing here at all</html>'], Importers.parseInstagramList('<html><h2>  </h2>nothing here at all</html>'), 'empty h2 and no link');
  // Fifth round: the last reachable return values. "hide" is a substring, "hidden" is not.
  rec('importers', 'sniff', ['{"relationships_hide_story":[{"string_list_data":[{"value":"k_one"}]}]}', ''], Importers.sniff('{"relationships_hide_story":[{"string_list_data":[{"value":"k_one"}]}]}', ''), 'instagram hide_story key');
  rec('importers', 'sniff', ['[{"string_list_data":[{"value":"bare_one"}]}]', 'following.json'], Importers.sniff('[{"string_list_data":[{"value":"bare_one"}]}]', 'following.json'), 'bare instagram array, file name following.json');
  rec('importers', 'sniff', ['<html><body><h1>Suggested users</h1><h2>x</h2><a href="https://www.instagram.com/u1/">u1</a></body></html>', ''], Importers.sniff('<html><body><h1>Suggested users</h1><h2>x</h2><a href="https://www.instagram.com/u1/">u1</a></body></html>', ''), 'an instagram heading that names no list');
  rec('importers', 'sniff', ['{"children":[]}', ''], Importers.sniff('{"children":[]}', ''), 'a JSON object with children but no browser fields');
  rec('importers', 'detectFormat', ['<html><h1>Following</h1><h2>Following</h2><a href="https://www.instagram.com/Following/">Following</a></html>'], Importers.detectFormat('<html><h1>Following</h1><h2>Following</h2><a href="https://www.instagram.com/Following/">Following</a></html>'), 'instagram html format name');
  const bmBare = { roots: { bookmark_bar: { children: [{ uri: 'https://bare.example.org/', title: 'Bare' }, { uri: 'https://noname.example.org/' }] } } };
  rec('importers', 'parseBookmarksJSON', [bmBare], Importers.parseBookmarksJSON(bmBare), 'a uri node with no type, a node with no title or name');
  rec('importers', 'parseCSVRows', ['a,b\r\nc,d\r\n'], Importers.parseCSVRows('a,b\r\nc,d\r\n'), 'CRLF outside quotes');
  rec('importers', 'parseCSV', ['url,title\nhttps://a.example.org/\n'], Importers.parseCSV('url,title\nhttps://a.example.org/\n'), 'a body row with no title column');
  rec('importers', 'parseCSV', ['title,url,folder,tags,notes,added\nA,https://a.example.org/,,,,\n'], Importers.parseCSV('title,url,folder,tags,notes,added\nA,https://a.example.org/,,,,\n'), 'a body row shorter than the date column');
  rec('importers', 'readSource', ['other.html', '<html><body><h1>Suggested users</h1><h2>x</h2><a href="https://www.instagram.com/u1/">u1</a></body></html>'], Importers.readSource('other.html', '<html><body><h1>Suggested users</h1><h2>x</h2><a href="https://www.instagram.com/u1/">u1</a></body></html>'), 'an instagram list that is not the following one, by heading');
  rec('importers', 'readSource', ['following.json', '[{"string_list_data":[]}]'], Importers.readSource('following.json', '[{"string_list_data":[]}]'), 'a following list with no handles in it');
  const igDeleted2 = JSON.stringify([{ title: '__deleted__one', string_list_data: [{ value: '__deleted__one' }] }, { title: '__deleted__two', string_list_data: [{ value: '__deleted__two' }] }]);
  rec('importers', 'readSource', ['following_deleted2.json', igDeleted2], Importers.readSource('following_deleted2.json', igDeleted2), 'two deleted accounts: the plural note');
}

// ---------- sharein ----------
{
  each('sharein', 'parseShare', Sharein.parseShare, [
    [''],
    ['?text='],
    ['?title=Caf%C3%A9+notes&text=Check+https%3A%2F%2Fmaker.example.org%2Fkala'],
    ['?url=https%3A%2F%2Fmaker.example.org%2Fkala%3Futm_source%3Dx'],
    ['?text=No+link+here'],
    ['?title=%E0%A4%95%E0%A4%B2%E0%A4%BE&text=%E0%A4%89%E0%A4%A6%E0%A4%BE%E0%A4%B9%E0%A4%B0%E0%A4%A3+https%3A%2F%2Fmaker.example.org%2Fkala'],
    ['?url=https%3A%2F%2Fmaker.example.org%2Fkala)%2C'],
    ['?url=https%3A%2F%2Fmaker.example.org%2Fkala%3Fq%3D1%2C'],
    ['?title=A%7CB&text=https%3A%2F%2Fmaker.example.org%2Fkala'],
    ['?title=No+link&text=Still+no+link'],
    ['?title=https%3A%2F%2Fone.example.org%2F&text=See+https%3A%2F%2Ftwo.example.org%2F'],
    ['?title=Only+title+here'],
    ['?url=www.example.org/x&text=see+www.example.org/x+now'],
    ['?title=Caf%C3%A9&url=https%3A%2F%2Fmaker.example.org%2Fkala&text=https%3A%2F%2Fmaker.example.org%2Fkala+Caf%C3%A9'],
    ['?url=example.com'],
  ]);
  each('sharein', 'parseAction', Sharein.parseAction, [['?do=add'], ['?do=SEARCH'], ['?do=bogus'], [''], ['?do=review'], ['?do=due']]);
}

// ---------- snap: only the pure parts; IndexedDB/navigator code is listed in docs/log ----------
{
  const load = resources => { St.state.resources = resources; };
  const res = (rid, x = {}) => ({ id: rid, title: rid, url: 'https://' + rid + '.example.org/', status: 'active', tags: [], draft: false, ...x });
  cst3('snap', 'KEEP_HARD', Snap.KEEP_HARD);
  cst3('snap', 'KEEP_SOFT', Snap.KEEP_SOFT);
  cst3('snap', 'SOFT', Snap.SOFT);
  load([]);
  rec('snap', 'currentSig', [], Snap.currentSig(), 'empty store');
  load([res('s1'), res('s2', { title: 'Café', status: 'testing' })]);
  rec('snap', 'currentSig', [], Snap.currentSig(), 'two resources');
  load(Array.from({ length: 20 }, (_, i) => res('s' + i, { title: 'कला ' + i, url: 'https://s' + i + '.example.org/', status: i % 2 ? 'active' : 'candidate' })));
  rec('snap', 'currentSig', [], Snap.currentSig(), 'many unicode resources');
}

// ---------- validate coverage ----------
const SKIPPED = {
  snap: new Set(['available', 'list', 'take', 'get', 'remove', 'restore', 'newestFor', 'mirror', 'mirrorInfo', 'restoreMirror', 'storageInfo', 'askPersist', 'start']),
  topics: new Set(['TOPIC_BY_ID']),
};
const ONE_CASE = { topics: new Set(['TOPICS']) };
const EXPORTS = { suggest: Suggest, topics: Topics, exporters: Exporters, watch: Watch, game: Game, pageparse: Pageparse, importers: Importers, sharein: Sharein, snap: Snap };
for (const [mod, cases] of Object.entries(files)) {
  for (const [name, value] of Object.entries(EXPORTS[mod])) {
    if (SKIPPED[mod] && SKIPPED[mod].has(name)) continue;
    const n = cases.filter(c => c.fn === name).length;
    if (ONE_CASE[mod] && ONE_CASE[mod].has(name)) { if (n < 1) throw new Error(`${mod}.${name} has no cases`); continue; }
    if (n < 3) throw new Error(`${mod}.${name} has only ${n} cases`);
  }
}

// ---------- write ----------
fs.mkdirSync(OUT, { recursive: true });
for (const [mod, cases] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, mod + '.json'), JSON.stringify({ module: mod, generatedFrom: 'legacy/web-src/js', today: TODAY, cases }, null, 1) + '\n');
}
for (const [mod, cases] of Object.entries(files)) console.log(mod + ': ' + cases.length + ' cases');
console.log('wrote', Object.keys(files).length, 'files,', Object.values(files).reduce((n, c) => n + c.length, 0), 'cases');
