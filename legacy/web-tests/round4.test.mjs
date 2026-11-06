// round4.test.mjs - mission done-state, and (added as built) auto-sort, insights, weekly reset, time picker, merge.
import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
const S = new URL('../src/js/', import.meta.url).pathname;
const M = await import(S + 'mission.js'), st = await import(S + 'store.js'), X = await import(S + 'exporters.js');
const fresh = () => { st.state.resources = []; st.state.jobs = []; st.state.threads = []; st.load({ resources: [], jobs: [], threads: [] }); };
const add = (title, extra = {}) => st.addResource({ title, url: 'https://' + title.toLowerCase().replace(/\W+/g, '') + '.test/', draft: false, ...extra });

test('mission progress counts only steps whose resource still exists', () => {
  fresh();
  const a = add('Alpha'), b = add('Bravo'), c = add('Charlie');
  const t = st.addThread('Route', [a.id, b.id, c.id]);
  let p = M.progress(t, id => !!st.byId(id));
  assert.deepEqual([p.total, p.done, p.left, p.pct, p.complete], [3, 0, 3, 0, false]);
  assert.equal(p.next.i, 0);
  st.setStepDone(t.id, 0, true);
  p = M.progress(t, id => !!st.byId(id));
  assert.deepEqual([p.done, p.pct, p.next.i], [1, 33, 1]);
  assert.ok(t.steps[0].doneAt && t.lastDone, 'tick time is remembered');
  st.setStepDone(t.id, 0, false);
  assert.equal(t.steps[0].doneAt, '', 'unticking clears the time');
  st.setStepDone(t.id, 0, true); st.setStepDone(t.id, 1, true); st.setStepDone(t.id, 2, true);
  p = M.progress(t, id => !!st.byId(id));
  assert.equal(p.complete, true); assert.equal(p.next, null); assert.equal(p.pct, 100);
  st.resetThread(t.id);
  assert.equal(M.progress(t).done, 0);
});

test('a deleted resource drops out of the count instead of blocking the mission', () => {
  fresh();
  const a = add('Alpha'), b = add('Bravo');
  const t = st.addThread('Route', [a.id, b.id]); st.setStepDone(t.id, 0, true);
  st.deleteResource(b.id);
  const p = M.progress(t, id => !!st.byId(id));
  assert.deepEqual([p.total, p.done, p.complete], [t.steps.length, 1, true]);
});

test('which mission Home shows: chosen one, else last worked on, else furthest, never finished or empty ones', () => {
  fresh();
  const rs = ['A', 'B', 'C', 'D'].map(x => add(x));
  const t1 = st.addThread('One', [rs[0].id, rs[1].id]), t2 = st.addThread('Two', [rs[2].id, rs[3].id]), t3 = st.addThread('Empty', []), t4 = st.addThread('Done', [rs[0].id]);
  const has = id => !!st.byId(id);
  st.setStepDone(t4.id, 0, true);
  assert.equal(M.pickActive(st.state.threads, '', has).id, t1.id, 'nothing started: the first one with steps');
  st.setStepDone(t2.id, 0, true);
  assert.equal(M.pickActive(st.state.threads, '', has).id, t2.id, 'the one you ticked last');
  assert.equal(M.pickActive(st.state.threads, t1.id, has).id, t1.id, 'your own choice wins');
  st.setStepDone(t2.id, 1, true);
  assert.equal(M.pickActive(st.state.threads, t2.id, has).id, t1.id, 'a finished mission is skipped even if chosen');
  st.setStepDone(t1.id, 0, true); st.setStepDone(t1.id, 1, true);
  assert.equal(M.pickActive(st.state.threads, '', has), null, 'everything finished or empty');
  assert.ok(t3);
});

test('done-state survives a backup round trip and old backups load as not done', () => {
  fresh();
  const a = add('Alpha'); const t = st.addThread('Route', [a.id]); st.setStepDone(t.id, 0, true);
  const data = JSON.parse(JSON.stringify(st.exportData()));
  st.importBackup(data, 'replace');
  assert.equal(st.state.threads[0].steps[0].done, true);
  const old = { resources: data.resources, jobs: [], threads: [{ id: 't9', name: 'Old', steps: [{ rid: a.id, note: 'x' }, a.id] }] };
  st.importBackup(old, 'replace');
  assert.deepEqual(st.state.threads[0].steps.map(s => s.done), [false, false]);
});

test('mission task text and notes mark finished steps', () => {
  fresh();
  const a = add('Alpha'), b = add('Bravo'); const t = st.addThread('Route', [a.id, b.id]); st.setStepDone(t.id, 0, true);
  const txt = X.missionTask(t, st.byId);
  assert.match(txt, /\(done\) Use Alpha/); assert.doesNotMatch(txt, /\(done\) Use Bravo/);
  const md = X.markdownAll(st.state, {});
  assert.match(md, /1\. \[x\] Alpha/);
});

// ---------------- auto-sort ----------------
const G = await import(S + 'suggest.js');
const mk = (title, url, extra = {}) => st.addResource({ title, url, draft: false, ...extra });
const place = (job, rs) => rs.forEach(r => st.addToJob(job.id, r.id, true));
const prof = () => G.buildProfiles(st.state.jobs, st.byId);

test('suggest: tags the sector already uses point to it, with a reason', () => {
  fresh();
  const news = st.addJob({ name: 'Newsroom' }), tools = st.addJob({ name: 'Tools' });
  place(news, [1, 2, 3, 4].map(i => mk('N' + i, 'https://n' + i + '.example/', { tags: ['news', 'world'] })));
  place(tools, [1, 2, 3, 4].map(i => mk('T' + i, 'https://t' + i + '.example/', { tags: ['tool', 'free'] })));
  const r = mk('Daily Herald', 'https://herald.example/', { tags: ['news'], draft: true });
  const s = G.suggest(r, prof(), st.jobsOf);
  assert.equal(s.job.name, 'Newsroom'); assert.equal(s.unsure, false);
  assert.match(s.why[0], /#news/);
});

test('suggest: the same website beats weak hints', () => {
  fresh();
  const a = st.addJob({ name: 'Learning' }), b = st.addJob({ name: 'Misc' });
  place(a, [1, 2, 3].map(i => mk('Khan ' + i, 'https://khanacademy.org/course/' + i)));
  place(b, [1, 2, 3].map(i => mk('Other ' + i, 'https://other' + i + '.example/')));
  const r = mk('Khan new', 'https://www.khanacademy.org/new', { draft: true });
  const s = G.suggest(r, prof(), st.jobsOf);
  assert.equal(s.job.name, 'Learning'); assert.match(s.why[0], /same website/);
});

test('suggest: says nothing when it has nothing to go on', () => {
  fresh();
  const a = st.addJob({ name: 'Newsroom' }); place(a, [1, 2, 3].map(i => mk('N' + i, 'https://n' + i + '.example/', { tags: ['news'] })));
  assert.equal(G.suggest(mk('Mystery', 'https://zz.example/', { draft: true, tags: ['pottery'], type: 'docs' }), prof(), st.jobsOf), null);
});

test('suggest: small, smart and sealed sectors are never used, and a link that already has a sector is left alone', () => {
  fresh();
  const small = st.addJob({ name: 'Tiny' }), sealed = st.addJob({ name: 'Secret', sealed: true }), real = st.addJob({ name: 'Real' });
  place(small, [1, 2].map(i => mk('S' + i, 'https://s' + i + '.example/', { tags: ['x'] })));
  place(sealed, [1, 2, 3, 4].map(i => mk('V' + i, 'https://v' + i + '.example/', { tags: ['x'] })));
  place(real, [1, 2, 3].map(i => mk('R' + i, 'https://r' + i + '.example/', { tags: ['y'] })));
  const r = mk('Newbie', 'https://newbie.example/', { tags: ['x'], draft: true });
  assert.equal(G.suggest(r, prof(), st.jobsOf), null, 'tiny and sealed are skipped');
  const r2 = mk('Placed', 'https://placed.example/', { tags: ['y'], draft: true }); st.addToJob(real.id, r2.id, true);
  assert.equal(G.suggest(r2, prof(), st.jobsOf), null, 'already in one of your sectors');
});

test('suggest: two equally good sectors are marked unsure and excluded from the automatic pass', () => {
  fresh();
  const a = st.addJob({ name: 'Alpha' }), b = st.addJob({ name: 'Beta' });
  place(a, [1, 2, 3].map(i => mk('A' + i, 'https://a' + i + '.example/', { tags: ['ai'] })));
  place(b, [1, 2, 3].map(i => mk('B' + i, 'https://b' + i + '.example/', { tags: ['ai'] })));
  const r = mk('Both', 'https://both.example/', { tags: ['ai'], draft: true });
  const s = G.suggest(r, prof(), st.jobsOf);
  assert.equal(s.unsure, true); assert.ok(s.also.length === 1);
  assert.equal(G.suggestMany([r], st.state.jobs, st.byId, st.jobsOf).length, 0);
});

test('suggest: a bookmark folder named like the sector is a strong hint', () => {
  fresh();
  const a = st.addJob({ name: 'Music Storeroom' }), b = st.addJob({ name: 'Maths' });
  place(a, [1, 2, 3].map(i => mk('M' + i, 'https://m' + i + '.example/')));
  place(b, [1, 2, 3].map(i => mk('Q' + i, 'https://q' + i + '.example/')));
  const r = mk('Guitar tabs', 'https://tabs.example/', { draft: true, folder: 'Music Storeroom' });
  const s = G.suggest(r, prof(), st.jobsOf);
  assert.equal(s && s.job.name, 'Music Storeroom');
});

// ---------------- shortcuts and What's new ----------------
const SH = await import(S + 'sharein.js'), WN = await import(S + 'whatsnew.js');
test('app shortcuts: only known actions are accepted', () => {
  assert.equal(SH.parseAction('?do=add'), 'add'); assert.equal(SH.parseAction('?do=REVIEW'), 'review');
  assert.equal(SH.parseAction('?do=due&x=1'), 'due'); assert.equal(SH.parseAction('?do=search'), 'search');
  assert.equal(SH.parseAction('?do=delete'), ''); assert.equal(SH.parseAction(''), ''); assert.equal(SH.parseAction('?url=https://x.y'), '');
  assert.equal(SH.parseShare('?do=add'), null, 'a shortcut is not a share');
});
test("what's new: newest first, unique versions, every item is a plain sentence", () => {
  const vs = WN.NEWS.map(n => n.v); assert.deepEqual(vs, [...new Set(vs)]);
  const num = v => v.replace(/^v/, '').split('.').map(Number);
  for (let i = 1; i < vs.length; i++) assert.ok(num(vs[i - 1])[0] * 100 + num(vs[i - 1])[1] >= num(vs[i])[0] * 100 + num(vs[i])[1], 'sorted newest first');
  WN.NEWS.forEach(n => { assert.ok(n.items.length > 0); n.items.forEach(t => assert.ok(t.length > 10 && t.length < 200 && /[.]$/.test(t), t)); });
});

// ---------------- insights ----------------
const I = await import(S + 'insights.js');
const DAY = 864e5, today = '2026-10-28', ago = d => Date.parse(today + 'T12:00:00') - d * DAY;

test('insights: most used lists only opened, non-archived links, most opened first', () => {
  fresh();
  add('A', { opens: 3, openedAt: 5 }); add('B', { opens: 9, openedAt: 4 }); add('C'); add('D', { opens: 20, status: 'archived' });
  assert.deepEqual(I.mostUsed(st.state.resources, 5).map(r => r.title), ['B', 'A']);
});

test('insights: the cull list waits until Nexus has counted opens for 60 days', () => {
  fresh(); add('Old', { openedAt: ago(100), opens: 2 });
  let c = I.cullInfo(st.state.resources, { opensSince: '', today });
  assert.equal(c.ready, false); assert.equal(c.waitDays, 60); assert.equal(c.list.length, 0);
  c = I.cullInfo(st.state.resources, { opensSince: '2026-10-08', today });
  assert.equal(c.daysTracked, 20); assert.equal(c.waitDays, 40); assert.equal(c.ready, false);
});

test('insights: once ready, it lists idle links and leaves out the ones that must not be listed', () => {
  fresh();
  add('Idle old', { openedAt: ago(90), opens: 1 }); add('Idle new', { openedAt: ago(61), opens: 1 }); add('Used lately', { openedAt: ago(5), opens: 4 });
  add('Never opened'); add('Pinned', { pinned: true }); add('Locked', { locked: true }); add('Kept', { keep: true }); add('Draft', { draft: true });
  add('Follow', { src: 'following' }); add('No link', { url: '' }); add('Trial', { trialEnd: '2026-11-10' }); add('Archived', { status: 'archived' });
  const w = add('Watched'); st.setWatch(w.id, true);
  const m = add('In mission'); const t = st.addThread('T', [m.id]);
  const c = I.cullInfo(st.state.resources, { opensSince: '2026-08-01', today, inMission: new Set([m.id]) });
  assert.equal(c.ready, true);
  assert.deepEqual(c.list.map(x => x.r.title), ['Idle old', 'Idle new', 'Never opened'], 'longest idle first, never-opened last');
  assert.equal(c.list[2].idle, null);
});

test('insights: sector shares, monthly additions, loose ends and storage', () => {
  fresh();
  const a = st.addJob({ name: 'Big' }), b = st.addJob({ name: 'Small' });
  [1, 2, 3].forEach(i => st.addToJob(a.id, add('B' + i, { draft: i === 1 }).id, true)); st.addToJob(b.id, add('S1').id, true);
  const sh = I.sectorShare(st.state.jobs, st.byId); assert.deepEqual(sh.map(x => [x.name, x.n, x.drafts]), [['Big', 3, 1], ['Small', 1, 0]]);
  const free = add('Loose'); free.createdAt = '2026-08-15'; const old = add('Older'); old.createdAt = '2025-01-01';
  const pm = I.addedPerMonth(st.state.resources, today, 3); assert.deepEqual(pm.map(x => x.key), ['2026-08', '2026-09', '2026-10']); assert.equal(pm[0].n, 1);
  const le = I.looseEnds(st.state.resources, id => st.jobsOf(id).filter(j => !j.rule)); assert.deepEqual(le.noSector.map(r => r.title).sort(), ['Loose', 'Older']);
  assert.deepEqual(I.storageInfo(243 * 1024), { kb: 243, pct: 5, label: '243 KB' }); assert.equal(I.storageInfo(2 * 1024 * 1024).label, '2.0 MB');
});

// ---------- weekly reset and time picker ----------
const W = await import(S + 'week.js'), T = await import(S + 'time.js');
const dayStr = n => { const d = new Date(2026, 9, 29 + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const today29 = dayStr(0);

test('weekly: bad or old saved data becomes a clean empty state', () => {
  for (const bad of [null, undefined, 5, 'x', [], { picks: 'no', doneAt: 12, pickedAt: 'yesterday' }]) assert.deepEqual(W.normWeekly(bad), { doneAt: '', pickedAt: '', snooze: '', picks: [] });
  const w = W.normWeekly({ picks: [{ rid: 'a', done: 1 }, { rid: 'a' }, { rid: 'b' }, { rid: 'c' }, { rid: 'd' }, null, { rid: 5 }] });
  assert.deepEqual(w.picks.map(p => p.rid), ['a', 'b', 'c'], 'no repeats, no junk, max 3'); assert.equal(w.picks[0].done, true);
});

test('weekly: the reset nudge needs 10+ links, 7+ days since the last one, and no snooze', () => {
  assert.equal(W.resetDue(null, today29, 9).due, false, 'too few links to be worth it');
  assert.deepEqual(W.resetDue(null, today29, 10), { due: true, days: null });
  assert.equal(W.resetDue({ doneAt: dayStr(-6) }, today29, 50).due, false);
  assert.deepEqual(W.resetDue({ doneAt: dayStr(-7) }, today29, 50), { due: true, days: 7 });
  assert.equal(W.resetDue({ doneAt: dayStr(-30), snooze: dayStr(2) }, today29, 50).due, false, 'snoozed');
  assert.equal(W.resetDue({ doneAt: dayStr(-30), snooze: dayStr(0) }, today29, 50).due, true, 'snooze ended today');
  assert.equal(W.resetDue({ doneAt: dayStr(3) }, today29, 50).due, false, 'a clock set back does not nag');
});

test('weekly: picks live for 7 days, skip deleted links, and toggle', () => {
  let w = W.setPicks(null, ['a', 'b', 'a', 'c', 'd'], dayStr(-2));
  assert.deepEqual(w.picks.map(p => p.rid), ['a', 'b', 'c']);
  assert.equal(W.activePicks(w, today29).length, 3);
  assert.deepEqual(W.activePicks(w, today29, id => id !== 'b').map(p => p.rid), ['a', 'c'], 'a deleted link drops out');
  assert.equal(W.activePicks(w, dayStr(5)).length, 0, 'expired on day 7');
  assert.equal(W.activePicks(W.setPicks(null, ['a'], dayStr(4)), today29).length, 0, 'future date (clock changed) shows nothing');
  w = W.togglePick(w, 'a'); assert.equal(w.picks[0].done, true); w = W.togglePick(w, 'a'); assert.equal(w.picks[0].done, false);
  assert.equal(W.finishReset(W.snoozeReset(null, today29), today29).snooze, '');
  assert.equal(W.snoozeReset(null, today29).snooze, dayStr(2));
});

test('weekly: suggested picks put a trial first, then mission, then other needs, and never repeat', () => {
  const r = id => ({ id, title: id });
  const ctx = { needs: [{ r: r('check1'), kind: 'check', sub: 'Check is late' }, { r: r('trial1'), kind: 'trial', sub: 'x' }], mission: { r: r('m1'), name: 'Route' }, stale: [r('old1')], drafts: [r('d1'), r('d2')] };
  assert.deepEqual(W.suggestPicks(ctx).map(x => x.rid), ['trial1', 'm1', 'check1']);
  assert.equal(W.suggestPicks(ctx)[0].why, 'Trial: decide keep or drop');
  assert.deepEqual(W.suggestPicks({ mission: { r: r('m1'), name: 'R' }, needs: [{ r: r('m1'), kind: 'check', sub: 's' }], drafts: [r('d1')] }).map(x => x.rid), ['m1', 'd1'], 'same link only once');
  assert.deepEqual(W.suggestPicks({}), []);
});

test('time picker: each mode limits the list; tired mode drops hard work', () => {
  const c = { drafts: 40, easy: 12, attention: 7, overdueTrials: 2, missionLeft: 5, missionName: 'Route', stale: 9, backupDue: true };
  const q = T.timePlan('quick', c); assert.deepEqual(q.items.map(i => i.id), ['needs', 'mission', 'review']);
  assert.match(q.items[0].text, /Clear 3 things from Needs you \(7 waiting\)/); assert.match(q.items[2].text, /Review 5 new links \(40 waiting\)/);
  const h = T.timePlan('hour', c); assert.deepEqual(h.items.map(i => i.id), ['backup', 'needs', 'mission', 'review', 'stale']);
  assert.match(h.items[1].text, /Clear all 7 in Needs you/); assert.match(h.items[2].text, /next 3 steps of Route/); assert.match(h.items[3].text, /Review 15 new links/); assert.match(h.items[4].text, /Look at 5 old resources/);
  const t = T.timePlan('tired', c); assert.deepEqual(t.items.map(i => i.id), ['needs', 'review']);
  assert.match(t.items[0].text, /2 trials that already ended/); assert.match(t.items[1].text, /Keep or archive 5 links/);
  assert.ok(!t.items.some(i => ['mission', 'stale', 'backup'].includes(i.id)), 'no mission, old-link or backup work when tired');
});

test('time picker: singular wording, and an honest empty answer', () => {
  const one = T.timePlan('quick', { drafts: 1, attention: 1, missionLeft: 1 });
  assert.match(one.items[0].text, /Clear 1 thing from Needs you$/); assert.match(one.items[2].text, /Review 1 new link$/);
  assert.equal(T.timePlan('quick', {}).lead, 'Nothing is waiting. You are clear.'); assert.equal(T.timePlan('tired', {}).lead, 'Nothing easy is waiting. Rest.');
  assert.equal(T.timePlan('hour', {}).items.length, 0);
});

test('insights: idle days are whole calendar days, the same at any time of day', () => {
  fresh();
  add('Early', { openedAt: new Date(2026, 7, 29, 0, 5).getTime(), opens: 1 }); add('Late', { openedAt: new Date(2026, 7, 29, 23, 55).getTime(), opens: 1 });
  const c = I.cullInfo(st.state.resources, { opensSince: '2026-06-01', today, inMission: new Set() });
  assert.deepEqual(c.list.map(x => [x.r.title, x.idle]).sort(), [['Early', 60], ['Late', 60]], 'both were opened on 29 Aug, so both are 60 days idle on 28 Oct');
});

// ---------- history, what I learned, merge ----------
const Hs = await import(S + 'history.js'), Mg = await import(S + 'merge.js');

test('history: bad data is cleaned, the list is capped, repeats collapse', () => {
  assert.deepEqual(Hs.normLog(null), []); assert.deepEqual(Hs.normLog('x'), []);
  assert.deepEqual(Hs.normLog([{ at: '2026-10-01', k: 'checked', t: 'ok' }, { at: 'bad', k: 'checked' }, { at: '2026-10-01', k: 'nope' }, null, 5]), [{ at: '2026-10-01', k: 'checked', t: 'ok' }]);
  let log = [];
  for (let i = 0; i < 40; i++) log = Hs.pushLog(log, [['status', 'S' + i]], '2026-10-0' + (1 + (i % 9)));
  assert.equal(log.length, Hs.LOG_MAX); assert.equal(log[log.length - 1].t, 'S39', 'newest is kept');
  log = Hs.pushLog([], [['status', 'A'], ['status', 'A']], '2026-10-29'); assert.equal(log.length, 1, 'same event twice on one day is kept once');
  log = Hs.pushLog(log, [['checked', 'ok']], '2026-10-29'); log = Hs.pushLog(log, [['checked', 'ok']], '2026-10-30');
  assert.deepEqual(log.map(e => e.k + '@' + e.at), ['status@2026-10-29', 'checked@2026-10-30'], 'a run of "checked" is one line, the latest');
  assert.equal(Hs.showLog(log)[0].k, 'checked', 'newest first for display'); assert.equal(Hs.pushLog([], [['bogus', 'x']], '2026-10-29').length, 0);
});

test('store logs what happened to a resource, and "learned" is saved and searchable', async () => {
  fresh();
  const r = add('Tool', { draft: true });
  st.updateResource(r.id, { draft: false });
  st.updateResource(r.id, { status: 'testing' }); st.markChecked(r.id);
  st.updateResource(r.id, { learned: 'Free plan caps at 3 exports a day.' });
  st.setVerdict(r.id, 'keep', 'good');
  const k = st.byId(r.id).log.map(e => e.k);
  assert.deepEqual(k, ['reviewed', 'status', 'checked', 'learned', 'verdict']);
  assert.match(st.byId(r.id).log.find(e => e.k === 'status').t, /Active to Trial/);
  const { search } = await import(S + 'search.js');
  assert.equal(search(st.state.resources, 'exports', { mode: 'and', types: new Set(), statuses: new Set() }).results.length, 1, 'search finds text from "what I learned"');
  const back = st.normalizeResource(JSON.parse(JSON.stringify(st.byId(r.id)))); assert.equal(back.learned, 'Free plan caps at 3 exports a day.'); assert.equal(back.log.length, k.length);
  assert.equal(st.normalizeResource({ title: 'Old', url: 'https://old.test/' }).log.length, 0, 'an older backup without a log loads fine');
});

test('merge patch: joins tags and notes, fills gaps, adds opens, never overwrites what the survivor has', () => {
  const keep = { title: 'A', url: 'https://a.test/x', tags: ['ai', 'tool'], capabilities: ['cut video'], useWhen: ['edit clips'], inputs: '', outputs: 'mp4', notes: 'mine', learned: '', fields: { cost: 'Free', plan: '' }, pinned: false, keep: false, opens: 2, openedAt: 100, draft: false, createdAt: '2026-05-01', watch: null, scan: null };
  const drop = { title: 'B', url: 'https://a.test/y', tags: ['Tool', 'video'], capabilities: ['cut video', 'subtitles'], useWhen: [], inputs: 'a clip', outputs: 'gif', notes: 'theirs', learned: 'big files slow', fields: { cost: 'Paid', plan: 'Pro' }, pinned: true, keep: true, opens: 3, openedAt: 500, draft: true, createdAt: '2026-03-01', watch: { on: true }, scan: { at: '2026-10-01' } };
  const p = Mg.mergePatch(keep, drop);
  assert.deepEqual(p.tags, ['ai', 'tool', 'video'], 'tags joined, no repeat (case ignored)'); assert.deepEqual(p.capabilities, ['cut video', 'subtitles']);
  assert.equal(p.inputs, 'a clip', 'empty field filled'); assert.equal(p.outputs, 'mp4', 'existing field kept');
  assert.match(p.notes, /^mine\n\nFrom "B": theirs\n\nAlso: https:\/\/a\.test\/y$/, 'the other note and address are kept, not lost');
  assert.deepEqual(p.fields, { cost: 'Free', plan: 'Pro' }, 'survivor value wins, gaps filled');
  assert.deepEqual([p.pinned, p.keep, p.opens, p.openedAt, p.draft, p.createdAt, p.learned], [true, true, 5, 500, false, '2026-03-01', 'big files slow']);
  assert.ok(p.watch && p.scan, 'a watch or scan is not lost');
  assert.equal(Mg.mergePatch({ ...keep, draft: true }, { ...drop, draft: true }).draft, true, 'two drafts stay a draft');
});

test('merge: sectors, mission steps, links and picks move over; the other link is gone; same address is not "deleted"', () => {
  fresh();
  const a = add('Alpha', { tags: ['x'] }), b = add('Beta', { tags: ['y'] }), c = add('Gamma');
  const j1 = st.addJob({ name: 'J1' }), j2 = st.addJob({ name: 'J2' });
  st.addToJob(j1.id, a.id, true); st.addToJob(j1.id, b.id, true); st.addToJob(j2.id, b.id, true);
  const t = st.addThread('Route', [b.id, c.id, a.id]); st.setStepDone(t.id, 0, true);
  st.link(c.id, b.id);
  st.setSetting('weekly', { doneAt: '', pickedAt: '2026-10-29', snooze: '', picks: [{ rid: b.id, done: false }, { rid: a.id, done: true }] });
  assert.equal(st.mergeResources(a.id, a.id), null, 'cannot merge a link into itself');
  const lockedDrop = add('Locked', { locked: true }); assert.equal(st.mergeResources(a.id, lockedDrop.id), null, 'a locked link is not removed');
  const o = st.mergeResources(a.id, b.id);
  assert.ok(o && !st.byId(b.id), 'the dropped link is gone'); assert.equal(o.moved.sectors, 2); assert.equal(o.moved.steps, 1); assert.equal(o.moved.tags, 1);
  assert.deepEqual(st.byId(a.id).tags, ['x', 'y']);
  assert.deepEqual(st.state.jobs.find(j => j.id === j1.id).members, [a.id], 'already in J1: no repeat'); assert.deepEqual(st.state.jobs.find(j => j.id === j2.id).members, [a.id], 'J2 now holds the survivor');
  assert.deepEqual(st.threadById(t.id).steps.map(s => [s.rid, s.done]), [[a.id, true], [c.id, false]], 'one step for the survivor, and a done tick is not lost');
  assert.deepEqual(st.byId(c.id).related, [a.id], 'links to the old one now point to the survivor');
  assert.deepEqual(st.getSetting('weekly').picks.map(p => [p.rid, p.done]), [[a.id, false]], 'weekly picks: one entry, no repeat');
  assert.ok(st.byId(a.id).log.some(e => e.k === 'merged' && /Beta/.test(e.t)), 'the merge is in its history');
  assert.equal(st.wasDeleted('https://beta.test/'), true, 'a different address is remembered as removed');
  const x = add('Same1', { url: 'https://same.test/p' }), y = add('Same2', { url: 'https://same.test/p/' });
  st.mergeResources(x.id, y.id); assert.equal(st.wasDeleted('https://same.test/p'), false, 'the same address is not marked deleted, the survivor has it');
});

test('dupe groups: only sites with 2+ live links, exact repeats first, and ignored sites stay out', () => {
  fresh();
  add('S1', { url: 'https://shop.example.com/a' }); add('S2', { url: 'https://shop.example.com/b' });
  add('E1', { url: 'https://exact.example.org/p' }); add('E2', { url: 'https://exact.example.org/p/' });
  add('Gh1', { url: 'https://github.com/alice/a' }); add('Gh2', { url: 'https://github.com/bob/b' }); add('One', { url: 'https://single.example.net/' });
  add('Arc1', { url: 'https://old.example.io/a', status: 'archived' }); add('Arc2', { url: 'https://old.example.io/b' });
  const g = Mg.dupeGroups(st.state.resources);
  assert.deepEqual(g.map(x => [x.key, x.items.length, x.exact]), [['example.org', 2, true], ['example.com', 2, false]]);
  assert.deepEqual(Mg.dupeGroups(st.state.resources, ['example.com']).map(x => x.key), ['example.org']);
});

// ---------- round 5: sector choices ----------
const Ch = await import(S + 'choices.js'), Sg = await import(S + 'suggest.js');
test('choices: recent list keeps order, no repeats, max 8, ignores junk', () => {
  assert.deepEqual(Ch.pushRecent(null, 'a'), ['a']); assert.deepEqual(Ch.pushRecent(['a', 'b', 'c'], 'b'), ['b', 'a', 'c']);
  let l = []; for (let i = 0; i < 12; i++) l = Ch.pushRecent(l, 'j' + i); assert.equal(l.length, 8); assert.equal(l[0], 'j11');
  assert.deepEqual(Ch.pushRecent(['a', 5, ''], 'b'), ['b', 'a']);
});
test('choices: fits first, then recent, then biggest; never rule sectors or ones it is already in', () => {
  const J = (id, name, n, extra = {}) => ({ id, name, members: Array.from({ length: n }, (_, i) => id + i), rule: null, ...extra });
  const jobs = [J('a', 'Alpha', 2), J('b', 'Beta', 9), J('c', 'Gamma', 5), J('r', 'Auto', 30, { rule: { x: 1 } }), J('d', 'Delta', 1), J('e', 'Eps', 7)];
  const r = { id: 'x1' };
  assert.deepEqual(Ch.sectorChoices(r, jobs, { fits: [jobs[2]], recent: ['d', 'zz', 'a'] }, 4).map(c => c.job.id + ':' + c.kind), ['c:fit', 'd:recent', 'a:recent', 'b:big']);
  assert.deepEqual(Ch.sectorChoices(r, jobs, {}, 3).map(c => c.job.id), ['b', 'e', 'c'], 'with nothing else, the biggest hand-filled sectors');
  jobs[1].members.push('x1'); assert.ok(!Ch.sectorChoices(r, jobs, {}, 5).some(c => c.job.id === 'b'), 'a sector it is already in is not offered');
  assert.deepEqual(Ch.sectorChoices(r, [], {}, 4), []);
});
test('suggestTop: ranks sectors for a link with no sector and stays quiet below the bar', () => {
  fresh();
  const j1 = st.addJob({ name: 'Newsroom' }), j2 = st.addJob({ name: 'Video' });
  ['news a', 'news b', 'news c'].forEach((t, i) => st.addToJob(j1.id, add(t, { tags: ['news', 'media'], url: 'https://paper' + i + '.test/' }).id, true));
  ['clip a', 'clip b', 'clip c'].forEach((t, i) => st.addToJob(j2.id, add(t, { tags: ['video', 'edit'], url: 'https://clip' + i + '.test/' }).id, true));
  const prof = Sg.buildProfiles(st.state.jobs, st.byId), fresh1 = add('A new thing', { tags: ['news', 'media'], url: 'https://newone.test/' }), none = add('Unrelated', { tags: ['cooking'], url: 'https://cook.test/' });
  const top = Sg.suggestTop(fresh1, prof, st.jobsOf, 3); assert.equal(top[0].job.name, 'Newsroom'); assert.ok(top[0].why.length >= 1);
  assert.deepEqual(Sg.suggestTop(none, prof, st.jobsOf, 3), [], 'nothing related, nothing suggested');
  st.addToJob(j1.id, fresh1.id, true); assert.deepEqual(Sg.suggestTop(fresh1, prof, st.jobsOf, 3), [], 'a link that already has a sector gets none');
  st.noteJobUsed(j2.id); st.noteJobUsed(j1.id); assert.deepEqual(st.getSetting('recentJobs'), [j1.id, j2.id]); st.noteJobUsed('nope'); assert.equal(st.getSetting('recentJobs').length, 2);
});

// ---------- round 5: jump ----------
const Jp = await import(S + 'jump.js');
test('jump: finds places by plain words, best first, and ignores normal questions', () => {
  const ids = (q, n) => Jp.jumpMatches(q, n).map(c => c.id);
  assert.equal(ids('backup')[0], 'backup'); assert.equal(ids('back up')[0], 'backup'); assert.equal(ids('how do I back up my data')[0], 'backup', 'filler words are ignored');
  assert.equal(ids('weekly')[0], 'reset'); assert.equal(ids('ins')[0], 'insights', 'a few letters is enough');
  assert.ok(ids('merge').includes('dupes') && ids('merge').includes('tags'), 'keywords count too');
  assert.deepEqual(ids('can I turn a PDF into slides'), [], 'a normal question matches no place');
  assert.deepEqual(ids('a'), []); assert.deepEqual(ids(''), []); assert.deepEqual(ids('the'), []);
  assert.equal(ids('sectors', 1).length, 1); assert.equal(ids('sector')[0], 'sectors');
  assert.deepEqual(Jp.jumpMatches('backup', 4, id => id !== 'backup').map(c => c.id).includes('backup'), false, 'places that do not exist are left out');
  assert.equal(new Set(Jp.COMMANDS.map(c => c.id)).size, Jp.COMMANDS.length, 'ids are unique');
});

// ---------- round 5: continue and shelves ----------
const Rc = await import(S + 'recent.js'), Hm = await import(S + 'home.js');
test('recent: newest first, no repeats, capped, junk dropped, and gone items skipped', () => {
  assert.deepEqual(Rc.normRecent(null), []); assert.deepEqual(Rc.normRecent([{ k: 'x', id: 'a', at: 1 }, { k: 'r', id: '', at: 1 }, { k: 'r', id: 'a', at: 'no' }, null]), []);
  let l = []; for (let i = 0; i < 12; i++) l = Rc.pushVisit(l, 'r', 'id' + i, 1000 + i); assert.equal(l.length, Rc.RECENT_MAX); assert.equal(l[0].id, 'id11');
  l = Rc.pushVisit(l, 'r', 'id5', 5000); assert.equal(l[0].id, 'id5'); assert.equal(l.filter(e => e.id === 'id5').length, 1, 'a repeat moves to the front');
  l = Rc.pushVisit(l, 's', 'id5', 6000); assert.equal(l.length, Rc.RECENT_MAX); assert.deepEqual(l.slice(0, 2).map(e => e.k + e.id), ['sid5', 'rid5'], 'a sector and a link with the same id are different');
  assert.deepEqual(Rc.liveVisits(l, (k, id) => id !== 'id5', 3).map(e => e.id).length, 3); assert.ok(!Rc.liveVisits(l, (k, id) => id !== 'id5').some(e => e.id === 'id5'));
  assert.deepEqual(Rc.pushVisit(l, 'q', 'x', 1), Rc.normRecent(l), 'an unknown kind changes nothing');
});
test('recent: plain time wording', () => {
  const n = 10 * 864e5; assert.equal(Rc.agoText(n - 30e3, n), 'just now'); assert.equal(Rc.agoText(n - 12 * 6e4, n), '12 min ago'); assert.equal(Rc.agoText(n - 3 * 36e5, n), '3 h ago');
  assert.equal(Rc.agoText(n - 30 * 36e5, n), 'yesterday'); assert.equal(Rc.agoText(n - 4 * 864e5, n), '4 days ago');
});
test('shelves: clean list, max 4, and the shelf shows pinned, then most opened, then A to Z; no dead or follow-only links', () => {
  assert.deepEqual(Hm.normShelves(null), []); assert.deepEqual(Hm.normShelves([{ job: 'a' }, { job: 'a' }, { job: '' }, null, { job: 5 }, { job: 'b' }, { job: 'c' }, { job: 'd' }, { job: 'e' }]), [{ job: 'a' }, { job: 'b' }, { job: 'c' }, { job: 'd' }]);
  fresh();
  const a = add('Zeta', { opens: 1 }), b = add('Alpha'), c = add('Beta', { opens: 9 }), d = add('Pinned', { pinned: true }), e = add('Gone', { status: 'archived' }), f = add('Nolink', { url: '' }), g = add('Follow', { src: 'following' });
  const ids = [a, b, c, d, e, f, g].map(r => r.id);
  assert.deepEqual(Hm.shelfList(ids, st.byId, 10).map(r => r.title), ['Pinned', 'Beta', 'Zeta', 'Alpha']);
  assert.equal(Hm.shelfList(ids, st.byId, 2).length, 2); assert.deepEqual(Hm.shelfList(['nope'], st.byId), []);
});
test('store: visits and shelves are cleaned when data loads, and noteVisit keeps the list short', () => {
  fresh(); const r = add('X'); st.noteVisit('r', r.id); st.noteVisit('s', 'j1'); assert.deepEqual(st.getSetting('recent').map(e => e.k + e.id), ['sj1', 'r' + r.id]);
  st.importBackup({ resources: [], jobs: [], threads: [], settings: { recent: [{ k: 'r', id: 'a', at: 5 }, 'bad'], shelves: [{ job: 'q' }, { job: 'q' }] } }, 'replace');
  assert.deepEqual(st.getSetting('recent').length, 1); assert.deepEqual(st.getSetting('shelves'), [{ job: 'q' }]);
});

// ---------- round 5: tidy and tags ----------
const Td = await import(S + 'tidy.js'), Tg = await import(S + 'tags.js');
test('tidy: tracking parameters go, everything else stays exactly as saved', () => {
  assert.equal(Td.cleanUrl('https://a.test/p?utm_source=x&utm_medium=y&id=7&fbclid=abc#top'), 'https://a.test/p?id=7#top');
  assert.equal(Td.cleanUrl('https://a.test/p?utm_source=x'), 'https://a.test/p'); assert.equal(Td.cleanUrl('https://a.test/p?utm_source=x#frag'), 'https://a.test/p#frag');
  assert.equal(Td.cleanUrl('https://a.test/p?q=a%20b&page=2'), 'https://a.test/p?q=a%20b&page=2', 'nothing to remove: same string, not re-encoded');
  assert.equal(Td.cleanUrl('https://www.youtube.com/watch?v=abc&si=XYZ&t=30s'), 'https://www.youtube.com/watch?v=abc&t=30s'); assert.equal(Td.cleanUrl('https://youtu.be/abc?si=XYZ'), 'https://youtu.be/abc');
  assert.equal(Td.cleanUrl('https://a.test/p?si=keepme'), 'https://a.test/p?si=keepme', 'si= is only tracking on YouTube and Spotify');
  assert.equal(Td.cleanUrl('https://a.test/p?ref=home'), 'https://a.test/p?ref=home', 'ref= can change the page, so it stays');
  assert.equal(Td.cleanUrl('not a link?utm_source=1'), 'not a link?utm_source=1'); assert.equal(Td.cleanUrl(''), ''); assert.equal(Td.cleanUrl(null), '');
  assert.equal(Td.cleanUrl('https://a.test/?UTM_Source=x&b=1'), 'https://a.test/?b=1', 'case is ignored');
  assert.deepEqual(Td.droppedParams('https://a.test/p?utm_source=x&id=7&fbclid=abc#t'), ['utm_source', 'fbclid']); assert.deepEqual(Td.droppedParams('https://a.test/p?id=7'), []);
});
test('tidy: titles lose alert counts, the site name on the end, and web symbols; real titles are left alone', () => {
  assert.equal(Td.cleanTitle('(3) Great article | Medium', 'https://medium.com/x'), 'Great article'); assert.equal(Td.cleanTitle('Cat video - YouTube', 'https://www.youtube.com/watch?v=1'), 'Cat video');
  assert.equal(Td.cleanTitle('Tom &amp; Jerry   fans', 'https://fans.test/'), 'Tom & Jerry fans');
  assert.equal(Td.cleanTitle('Pricing - Notion', 'https://notion.so/pricing'), 'Pricing'); assert.equal(Td.cleanTitle('How AI works | MIT News', 'https://news.mit.edu/x'), 'How AI works');
  assert.equal(Td.cleanTitle('Python - The Basics', 'https://docs.example.org/py'), 'Python - The Basics', 'a dash that is not the site name stays');
  assert.equal(Td.cleanTitle('A | B', 'https://b.test/'), 'A | B', 'too short to be sure');
  assert.equal(Td.cleanTitle('Canva', 'https://canva.com'), 'Canva'); assert.equal(Td.cleanTitle('', 'https://x.test'), '');
});
test('tidy: findings list changes, skip archived, followed and locked links, and count links that would become duplicates', () => {
  fresh();
  add('One', { url: 'https://a.test/p?utm_source=x' }); add('Two', { url: 'https://a.test/p' }); add('Three - Three', { url: 'https://three.test/' }); add('Old', { url: 'https://o.test/?utm_source=1', status: 'archived' }); add('Fol', { url: 'https://f.test/?utm_source=1', src: 'following' }); add('Lock', { url: 'https://l.test/?utm_source=1', locked: true });
  add('Quiet | Quiet', { url: 'https://quiet.test/' });
  const f = Td.tidyFindings(st.state.resources);
  assert.deepEqual(f.links.map(x => x.r.title), ['One']); assert.equal(f.links[0].to, 'https://a.test/p'); assert.equal(f.nowSame, 1, 'One is already the same page as Two');
  assert.deepEqual(f.titles.map(x => [x.r.title, x.to]), [['Three - Three', 'Three'], ['Quiet | Quiet', 'Quiet']]);
});
test('tags: counts, rename, merge, delete, and look-alike groups', () => {
  assert.equal(Tg.cleanTag('  #AI   Tools '), 'ai tools'); assert.equal(Tg.cleanTag('a, b'), 'a b'); assert.equal(Tg.cleanTag('###'), ''); assert.equal(Tg.cleanTag('हिंदी'), 'हिंदी'); assert.equal(Tg.cleanTag('c++'), 'c++');
  const R = (id, tags, status = 'active') => ({ id, tags, status });
  const rs = [R('1', ['ai', 'tool']), R('2', ['ai', 'tools']), R('3', ['AI-Tool', 'x']), R('4', ['tool'], 'archived'), R('5', ['ai-tools'])];
  const c = Tg.tagCounts(rs); assert.deepEqual(c.slice(0, 2).map(x => x.tag + ':' + x.live + '/' + x.n), ['ai:2/2', 'tool:1/2']);
  assert.deepEqual(Tg.retag(rs, 'tool', 'tools'), { 1: ['ai', 'tools'], 4: ['tools'] }, 'rename; links without it are left out');
  assert.deepEqual(Tg.retag(rs, 'tools', 'ai'), { 2: ['ai'] }, 'merging into a tag the link already has leaves one');
  assert.deepEqual(Tg.retag(rs, 'ai', ''), { 1: ['tool'], 2: ['tools'] }, 'empty target deletes'); assert.deepEqual(Tg.retag(rs, 'nope', 'x'), {});
  const sim = Tg.similarTags(c).map(g => g.tags.map(x => x.tag).sort());
  assert.deepEqual(sim.sort((x, y) => x[0].localeCompare(y[0])), [['AI-Tool', 'ai-tools'], ['tool', 'tools']], 'case, hyphen and plural look-alikes are grouped; ai alone is too short to match');
});

// ---------- round 5: spelling help and sector ideas ----------
const Sp = await import(S + 'spell.js'), Id = await import(S + 'ideas.js');
test('spell: edit distance counts a swapped pair as one edit and stops early', () => {
  assert.equal(Sp.editDistance('slides', 'slides'), 0); assert.equal(Sp.editDistance('slidez', 'slides'), 1); assert.equal(Sp.editDistance('sildes', 'slides'), 1, 'swap');
  assert.equal(Sp.editDistance('convertr', 'converter'), 1); assert.equal(Sp.editDistance('abc', 'abcdefg', 2), 3, 'too far: max+1'); assert.equal(Sp.editDistance('', 'ab'), 2);
});
test('spell: only words you have used are suggested, and only when a word is really unknown', () => {
  fresh();
  add('Slides converter', { tags: ['presentation'], capabilities: ['turn pdf into slides'], useWhen: ['I need a deck quickly'] }); add('Video editor', { tags: ['video', 'editing'] }); add('Cheap hosting', { tags: ['hosting'] });
  const v = Sp.vocabulary(st.state.resources);
  assert.ok(v.has('slides') && v.has('presentation') && v.has('quickly') && !v.has('a'), 'words of 3+ letters from names, tags, abilities and use-when');
  assert.equal(Sp.didYouMean('slidez converter', v), null, 'search already finds this one (it compares the stem "slide"), so no suggestion');
  let d = Sp.didYouMean('slidse converter', v); assert.deepEqual(d, { q: 'slides converter', changes: [{ from: 'slidse', to: 'slides' }] });
  d = Sp.didYouMean('vidoe editng', v); assert.equal(d.q, 'video editng', 'only the word search cannot find is changed (editng still finds "editing")');
  d = Sp.didYouMean('vidoe presentaton', v); assert.equal(d.q, 'video presentation', 'two typos in one query');
  d = Sp.didYouMean('presentatoin', v); assert.equal(d.q, 'presentation', 'a swapped pair in a long word');
  assert.equal(Sp.didYouMean('slides converter', v), null, 'nothing wrong');
  assert.equal(Sp.didYouMean('slide', v), null, 'a word the search already finds is left alone');
  assert.equal(Sp.didYouMean('convert', v), null, 'a start of a word is fine too');
  assert.equal(Sp.didYouMean('zzzzzz qqqq', v), null, 'nothing close in your words');
  assert.equal(Sp.didYouMean('vid', v), null, 'short words are never changed'); assert.equal(Sp.didYouMean('', v), null);
  assert.equal(Sp.didYouMean('the slidse', v).q, 'the slides', 'filler words stay');
});
test('spell: suggestFix only offers a fix that finds something, using the same filters', () => {
  fresh();
  add('Slides converter', { tags: ['presentation'] }); add('Video editor', { tags: ['video'], type: 'youtube-channel' });
  const rs = st.state.resources;
  const f = Sp.suggestFix(rs, 'slidse converter'); assert.equal(f.q, 'slides converter'); assert.equal(f.n, 1);
  assert.equal(Sp.suggestFix(rs, 'slidse video'), null, 'the fixed words match no single link together (AND), so no suggestion');
  assert.equal(Sp.suggestFix(rs, 'slidse video', { mode: 'or' }).n, 2, 'any-word mode finds both');
  assert.equal(Sp.suggestFix(rs, 'vidoe', { types: new Set(['web-tool']) }), null, 'a filter that hides the match means no suggestion');
});
test('ideas: groups by tag or type, skips what is sorted, taken names, drafts and small groups; no link twice', () => {
  fresh();
  const mk = (t, x) => add(t, { draft: false, ...x });
  for (let i = 1; i <= 4; i++) mk('Design ' + i, { tags: ['design', 'x' + i] });
  for (let i = 1; i <= 3; i++) mk('Writer ' + i, { tags: ['writing', 'design'].slice(0, i === 3 ? 2 : 1) });
  for (let i = 1; i <= 3; i++) mk('Yt ' + i, { type: 'youtube-channel' });
  mk('Draft one', { tags: ['writing'], draft: true }); mk('Arch', { tags: ['writing'], status: 'archived' });
  mk('Sorted', { tags: ['writing'] }); mk('Two only', { tags: ['pair'] }); mk('Two only b', { tags: ['pair'] });
  const sorted = st.state.resources.find(r => r.title === 'Sorted').id, manual = id => (id === sorted ? ['Some sector'] : []);
  let ideas = Id.sectorIdeas(st.state.resources, [], manual, t => ({ 'youtube-channel': 'YouTube' }[t] || t));
  assert.deepEqual(ideas.map(i => i.name + ':' + i.n), ['Design:5', 'YouTube:3'], 'biggest first; Writing is left with only 2 once Design takes the writer with both tags')
  const all = ideas.flatMap(i => i.ids); assert.equal(new Set(all).size, all.length, 'no link is in two ideas');
  assert.ok(!all.includes(sorted) && !ideas.some(i => i.name === 'Pair'), 'sorted links and groups under 3 are left out');
  assert.ok(ideas.some(i => i.name === 'YouTube' && i.n === 3 && i.how === 'type YouTube'));
  ideas = Id.sectorIdeas(st.state.resources, ['design'], manual, t => t); assert.ok(!ideas.some(i => i.name === 'Design'), 'a sector with that name already exists');
  assert.deepEqual(Id.sectorIdeas([], [], () => []), []); assert.equal(Id.sectorIdeas(st.state.resources, [], manual, t => t, { max: 1 }).length, 1);
});
test('store: createSector makes one sector with all the links and one undo point', () => {
  fresh();
  const a = add('A'), b = add('B'); let saved = 0; st.on('before-bulk', () => saved++);
  const j = st.createSector('Group', [a.id, b.id, a.id, 'nope']);
  assert.equal(j.name, 'Group'); assert.deepEqual(j.members, [a.id, b.id]); assert.deepEqual(st.jobsOf(a.id).map(x => x.name), ['Group']);
});

// ---------- round 5: this week, install, shortcuts ----------
const Wk = await import(S + 'week.js'), In = await import(S + 'install.js');
test('week: the digest counts only the last 7 days, from dates and history', () => {
  const today = '2026-10-31', ms = d => new Date(d + 'T12:00:00').getTime();
  const R = (id, x) => ({ id, createdAt: '2026-01-01', openedAt: 0, log: [], ...x });
  const rs = [R('a', { createdAt: '2026-10-25' }), R('b', { createdAt: '2026-10-24' }), R('c', { openedAt: ms('2026-10-26') }), R('d', { openedAt: ms('2026-10-24') }),
    R('e', { log: [{ at: '2026-10-30', k: 'reviewed', t: '' }, { at: '2026-10-20', k: 'reviewed', t: '' }, { at: '2026-10-29', k: 'checked', t: '' }, { at: '2026-10-31', k: 'learned', t: '' }, { at: '2026-10-27', k: 'merged', t: '' }, { at: '2026-10-28', k: 'status', t: '' }, { at: '2026-10-28', k: 'verdict', t: '' }] })];
  const d = Wk.weekDigest(rs, { pickedAt: '2026-10-24', picks: [{ rid: 'a', done: true }, { rid: 'b', done: false }, { rid: 'c', done: true }] }, today);
  assert.deepEqual({ ...d, picks: null }, { added: 1, opened: 1, reviewed: 1, checked: 1, learned: 1, merged: 1, stage: 1, picks: null }, 'Oct 25 to Oct 31 is 7 days; Oct 24 is outside');
  assert.deepEqual(d.picks, { done: 2, total: 3, at: '2026-10-24' });
  assert.equal(Wk.weekDigest([], null, today).picks, null); assert.equal(Wk.weekDigest([], null, today).added, 0);
});
test('install: says the true thing for each situation', () => {
  assert.equal(In.installState({ standalone: true, protocol: 'https:' }).kind, 'installed');
  const f = In.installState({ protocol: 'file:' }); assert.equal(f.kind, 'file'); assert.ok(f.steps.length >= 3 && /https/.test(f.text));
  assert.equal(In.installState({ protocol: 'file:', canPrompt: true }).kind, 'file', 'a file can never be installed, whatever Chrome says');
  assert.equal(In.installState({ protocol: 'http:', host: 'example.com' }).kind, 'insecure'); assert.equal(In.installState({ protocol: 'http:', host: 'localhost' }).kind, 'menu');
  assert.equal(In.installState({ protocol: 'https:', host: 'x.app', canPrompt: true }).kind, 'ready'); assert.equal(In.installState({ protocol: 'https:', host: 'x.app' }).kind, 'menu');
  assert.equal(In.installState().kind, 'menu');
});
test('install: badge numbers and shortcut keys', () => {
  assert.deepEqual([0, 5, 99, 150, -3, NaN, '7', 2.9].map(In.badgeCount), [0, 5, 99, 99, 0, 0, 7, 2]);
  const k = (key, x = {}) => In.shortcutFor({ key, ...x }, false);
  assert.equal(k('/'), 'search'); assert.equal(k('n'), 'add'); assert.equal(k('N'), 'add'); assert.equal(k('?'), 'help'); assert.equal(k('x'), '');
  assert.equal(k('n', { ctrlKey: true }), '', 'Ctrl+N is the browser\'s'); assert.equal(k('/', { metaKey: true }), ''); assert.equal(In.shortcutFor({ key: 'n' }, true), '', 'not while typing');
});
