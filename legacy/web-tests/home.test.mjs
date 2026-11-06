// home.test.mjs - the Home screen's decisions: tile layout, launch pad, what needs you, next action, quick review queue.
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
const S = new URL('../src/js/', import.meta.url).pathname;
const H = await import(S + 'home.js'), st = await import(S + 'store.js'), U = await import(S + 'util.js');
const fresh = () => { st.state.resources = []; st.state.jobs = []; st.state.threads = []; st.load({ resources: [], jobs: [], threads: [] }); };
const add = (title, extra = {}) => st.addResource({ title, url: 'https://' + title.toLowerCase().replace(/\W+/g, '') + '.test/', draft: false, ...extra });
const today = U.todayISO();

test('layout: unknown tiles dropped, missing tiles appended, hidden list cleaned', () => {
  assert.deepEqual(H.normHome(null), { order: ['needs', 'week', 'mission', 'continue', 'launch', 'shelves', 'time', 'review', 'sectors'], hide: [] });
  assert.deepEqual(H.normHome({ order: ['review', 'nope', 'review', 'needs'], hide: ['sectors', 'x', 'sectors'] }), { order: ['review', 'needs', 'week', 'mission', 'continue', 'launch', 'shelves', 'time', 'sectors'], hide: ['sectors'] });
  assert.deepEqual(H.visibleTiles({ order: ['sectors', 'needs'], hide: ['needs'] }), ['sectors', 'week', 'mission', 'continue', 'launch', 'shelves', 'time', 'review']);
  assert.deepEqual(H.normHome('garbage'), H.normHome(null));
});

test('launch pad: pinned first, then most opened; archived, link-less and Instagram-follow items stay out unless pinned', () => {
  fresh();
  const a = add('Alpha', { opens: 5, openedAt: 100 }), b = add('Bravo', { opens: 9, openedAt: 50 }), c = add('Charlie', { pinned: true, opens: 1 }), d = add('Delta', { pinned: true, opens: 4 });
  add('Never opened'); add('Gone', { opens: 50, status: 'archived' }); add('NoLink', { opens: 50, url: '' });
  const ig = add('@someone', { src: 'following', opens: 20 }), igPin = add('@pinned', { src: 'following', pinned: true });
  assert.deepEqual(H.launchList(st.state.resources, 'fav', 8).map(r => r.title), ['Delta', 'Charlie', '@pinned', 'Bravo', 'Alpha']);
  assert.deepEqual(H.launchList(st.state.resources, 'fav', 2).map(r => r.title), ['Delta', 'Charlie']);
  assert.deepEqual(H.launchList(st.state.resources, 'recent', 8).map(r => r.title), ['Alpha', 'Bravo'].filter(x => x), 'recent needs an open time');
  void a; void b; void c; void d; void ig; void igPin;
});
test('launch pad: recent is ordered by the last open time', () => {
  fresh();
  add('Old', { opens: 9, openedAt: 1000 }); add('New', { opens: 1, openedAt: 3000 }); add('Mid', { opens: 2, openedAt: 2000 }); add('Unopened');
  assert.deepEqual(H.launchList(st.state.resources, 'recent', 8).map(r => r.title), ['New', 'Mid', 'Old']);
});
test('store: opening counts quietly, pinning is a normal change, and old data gets sane defaults', () => {
  fresh();
  const r = add('Tool'); assert.equal(r.pinned, false); assert.equal(r.opens, 0); assert.equal(r.openedAt, 0);
  let changes = 0; const off = st.on('change', () => { changes++; });
  st.markOpened(r.id); st.markOpened(r.id);
  assert.equal(st.byId(r.id).opens, 2); assert.ok(st.byId(r.id).openedAt > 0); assert.equal(changes, 0, 'counting an open does not redraw everything');
  st.setPinned(r.id, true); assert.equal(st.byId(r.id).pinned, true); assert.equal(changes, 1);
  off();
  const n = st.normalizeResource({ title: 'x', opens: -5, openedAt: 'abc', pinned: 1 });
  assert.equal(n.opens, 0); assert.equal(n.openedAt, 0); assert.equal(n.pinned, true);
  assert.equal(st.markOpened('nope'), null);
});
test('store: the Home layout is cleaned when data loads', () => {
  fresh(); st.state.settings.home = { order: ['sectors', 'zzz'], hide: ['review', 'zzz'] }; st.save(true); st.load();
  assert.deepEqual(st.state.settings.home, { order: ['sectors', 'needs', 'week', 'mission', 'continue', 'launch', 'shelves', 'time', 'review'], hide: ['review'] });
  assert.equal(st.state.settings.startOn, 'home');
});

test('needs you: trials first, then changed pages, then late checks, then due today, then limits; one line per resource', () => {
  fresh();
  const late = add('Late check', { checkCadence: 'daily', lastChecked: U.addDays(today, -4) });
  const due = add('Due today', { checkCadence: 'daily', lastChecked: U.addDays(today, -1) });
  const trial = add('Trial', { status: 'testing', trialEnd: U.addDays(today, 2) });
  const over = add('Trial over', { status: 'testing', trialEnd: U.addDays(today, -3) });
  const chg = add('Changed', {}); st.setWatch(chg.id, true); st.recordWatch(chg.id, { t: 'A', d: '', h: ['x'], via: 'direct' }, today); st.recordWatch(chg.id, { t: 'B', d: '', h: ['x'], via: 'direct' }, today);
  const lim = add('Limit', { fields: { resets: U.addDays(today, 3), limit: '50 per day' } });
  add('Fine'); add('Archived late', { status: 'archived', checkCadence: 'daily', lastChecked: U.addDays(today, -9) });
  const items = H.needsItems(st.state.resources, st, today);
  assert.deepEqual(items.map(x => x.r.title), ['Trial over', 'Trial', 'Changed', 'Late check', 'Due today', 'Limit']);
  assert.deepEqual(items.map(x => x.kind), ['trial', 'trial', 'changed', 'check', 'check', 'limit']);
  assert.equal(items[0].sub, 'Trial ended 3 days ago'); assert.equal(items[1].sub, 'Trial ends in 2 days');
  assert.equal(items[3].sub, 'Check is 3 days late'); assert.equal(items[4].sub, 'Check is due today'); assert.match(items[5].sub, /^50 per day · Resets in 3 days$/);
  assert.match(items[2].sub, /title changed/i);
  void late; void due; void trial; void over; void lim;
});
test('needs you: a resource that is both on trial and late shows once, as the trial', () => {
  fresh();
  add('Both', { status: 'testing', trialEnd: U.addDays(today, 1), checkCadence: 'daily', lastChecked: U.addDays(today, -5) });
  const items = H.needsItems(st.state.resources, st, today); assert.equal(items.length, 1); assert.equal(items[0].kind, 'trial');
});

test('next action: review backlog, then stale, then pin, then add, then all clear', () => {
  assert.equal(H.nextAction({ drafts: 3, stale: 9, total: 50, pins: 0 }).id, 'review');
  assert.equal(H.nextAction({ drafts: 0, stale: 2, total: 50, pins: 0 }).id, 'stale');
  assert.equal(H.nextAction({ drafts: 0, stale: 0, total: 50, pins: 0 }).id, 'pin');
  assert.equal(H.nextAction({ drafts: 0, stale: 0, total: 2, pins: 0 }).id, 'add');
  const clear = H.nextAction({ drafts: 0, stale: 0, total: 50, pins: 3 }); assert.equal(clear.id, 'clear'); assert.equal(clear.button, '');
  assert.match(H.nextAction({ drafts: 1, stale: 0, total: 9, pins: 0 }).text, /^1 link is still unreviewed/);
});

test('quick review: items with a page description first, then notes, then bare ones; skipped go last in skip order; Instagram follows never', () => {
  fresh();
  const bare = add('Bare', { draft: true }), note = add('Noted', { draft: true, notes: 'a guess' });
  const desc = add('Described', { draft: true, scan: { at: today, via: 'reader', topic: '', conf: 'none', desc: 'About it.' } });
  add('@ig', { draft: true, src: 'following' }); add('Reviewed');
  assert.deepEqual(H.reviewQueue(st.state.resources, []).map(r => r.title), ['Described', 'Noted', 'Bare']);
  assert.deepEqual(H.reviewQueue(st.state.resources, [desc.id]).map(r => r.title), ['Noted', 'Bare', 'Described']);
  assert.deepEqual(H.reviewQueue(st.state.resources, [desc.id, note.id]).map(r => r.title), ['Bare', 'Described', 'Noted']);
  void bare;
});
test('search examples come from your own "use it when" lines, are short, and change with the seed', () => {
  fresh();
  add('A', { useWhen: ['turn a pdf into slides', 'x'] }); add('B', { useWhen: ['find who owns a company'] }); add('C', { useWhen: ['track a flight in real time'] }); add('Draft', { draft: true, useWhen: ['should not appear anywhere'] });
  const ex = H.exampleQueries(st.state.resources, 3, 0); assert.equal(ex.length, 3);
  assert.ok(ex.every(x => x.length >= 8 && x.length <= 48) && !ex.includes('should not appear anywhere'));
  assert.notDeepEqual(H.exampleQueries(st.state.resources, 1, 0), H.exampleQueries(st.state.resources, 1, 1));
  fresh(); assert.deepEqual(H.exampleQueries([], 3, 0), []);
});
