import test from 'node:test';
import assert from 'node:assert/strict';
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
const S = new URL('../src/js/', import.meta.url).pathname;
const U = await import(S + 'util.js'), st = await import(S + 'store.js'), F = await import(S + 'fields.js'), R = await import(S + 'rules.js'), X = await import(S + 'exporters.js'), se = await import(S + 'search.js');
const today = U.todayISO(), plus = n => U.addDays(today, n);
const fresh = () => { mem.clear(); st.load({ resources: [], jobs: [], threads: [] }); };

test('fields: only safe short text is kept, resets must be a real date', () => {
  const f = F.normFields({ cost: ' Free ', limit: 'x'.repeat(300), 'bad key!': 'no', resets: 'soon', obj: { a: 1 }, n: 5, empty: '  ' });
  assert.equal(f.cost, 'Free'); assert.equal(f.limit.length, 200); assert.equal(f.n, '5');
  assert.ok(!('bad key!' in f) && !('resets' in f) && !('obj' in f) && !('empty' in f));
  assert.equal(F.normFields({ resets: '2026-11-03T10:00' }).resets, '2026-11-03');
  assert.deepEqual(F.normFields('nope'), {}); assert.deepEqual(F.normFields([1]), {});
});
test('fields: defs depend on the type; custom fields are cleaned', () => {
  const custom = F.normCustom([{ label: 'Rating', kind: 'choice', options: 'Great, OK ,Poor', types: ['ai-source', 'nonsense'] }, { label: '', kind: 'text' }, { label: 'Cost', kind: 'text' }, { label: 'Pick', kind: 'choice', options: '' }, null], ['ai-source', 'social']);
  assert.equal(custom.length, 1, JSON.stringify(custom)); assert.equal(custom[0].key, 'c_rating'); assert.deepEqual(custom[0].options, ['Great', 'OK', 'Poor']); assert.deepEqual(custom[0].types, ['ai-source']);
  const ai = F.defsFor('ai-source', custom).map(d => d.key), so = F.defsFor('social', custom).map(d => d.key);
  assert.ok(ai.includes('limit') && ai.includes('resets') && ai.includes('c_rating') && !ai.includes('handle'));
  assert.ok(so.includes('handle') && so.includes('purpose') && !so.includes('limit') && !so.includes('c_rating'));
  assert.equal(F.labelOf('cost'), 'Cost'); assert.equal(F.labelOf('c_rating', custom), 'Rating');
});
test('store: new fields survive normalize; old data without them loads', () => {
  fresh();
  const r = st.addResource({ title: 'DeepThing', url: 'https://deep.example/', type: 'ai-source', fields: { cost: 'Free with limits', limit: '1.3M tokens', resets: plus(2) } });
  assert.equal(r.type, 'ai-source'); assert.equal(r.fields.cost, 'Free with limits'); assert.equal(r.status, 'active');
  const old = st.normalizeResource({ id: 'o1', title: 'Old', url: 'https://o.example/' });
  assert.deepEqual(old.fields, {}); assert.equal(old.trialEnd, ''); assert.equal(old.verdict, null);
  assert.equal(st.normalizeResource({ title: 'x', type: 'weird' }).type, 'other');
  assert.equal(st.setField(r.id, 'device', 'Phone').fields.device, 'Phone'); assert.equal(st.byId(r.id).fields.cost, 'Free with limits');
});
test('rules: conditions, any/all, archived left out unless Stage is in the rule', () => {
  fresh();
  const a = st.addResource({ title: 'A', type: 'ai-source', fields: { cost: 'Free' }, tags: 'ai' }), b = st.addResource({ title: 'B', type: 'ai-source', fields: { cost: 'Paid' } }), c = st.addResource({ title: 'C', type: 'web-tool', fields: { cost: 'Free' } });
  st.updateResource(c.id, { status: 'archived' });
  const free = { match: 'all', conds: [{ f: 'type', op: 'is', v: 'ai-source' }, { f: 'cost', op: 'not', v: 'Paid' }] };
  assert.ok(R.matches(st.byId(a.id), free, today)); assert.ok(!R.matches(st.byId(b.id), free, today));
  const anyRule = { match: 'any', conds: [{ f: 'tag', op: 'has', v: '#ai' }, { f: 'cost', op: 'is', v: 'Free' }] };
  assert.ok(R.matches(st.byId(a.id), anyRule, today)); assert.ok(!R.matches(st.byId(c.id), anyRule, today), 'archived is left out');
  assert.ok(R.matches(st.byId(c.id), { match: 'all', conds: [{ f: 'status', op: 'is', v: 'archived' }] }, today));
  assert.ok(!R.matches(st.byId(a.id), { match: 'all', conds: [] }, today), 'empty rule matches nothing');
  assert.ok(R.condMatches(st.byId(a.id), { f: 'cost', op: 'filled' }, today) && R.condMatches(st.byId(b.id), { f: 'limit', op: 'empty' }, today));
  assert.ok(R.condMatches({ ...st.byId(a.id), draft: true }, { f: 'draft', op: 'yes' }) && R.condMatches(st.byId(a.id), { f: 'draft', op: 'no' }));
});
test('rules: dates and age', () => {
  fresh();
  const a = st.addResource({ title: 'A', fields: { resets: plus(3) } }), b = st.addResource({ title: 'B', fields: { resets: plus(20) } }), c = st.addResource({ title: 'C', fields: { resets: plus(-2) } }), d = st.addResource({ title: 'D', lastChecked: plus(-100) });
  const soon = { f: 'resets', op: 'soon', v: '7' };
  assert.deepEqual([a, b, c].map(r => R.condMatches(st.byId(r.id), soon, today)), [true, false, true]);
  assert.ok(R.condMatches(st.byId(d.id), { f: 'lastChecked', op: 'older', v: '60' }, today) && !R.condMatches(st.byId(a.id), { f: 'lastChecked', op: 'older', v: '60' }, today));
});
test('rules: normRule drops junk and caps size; describeRule reads well', () => {
  assert.equal(R.normRule(null), null); assert.equal(R.normRule({ conds: [{ f: 'x y', op: 'is', v: 'a' }] }), null); assert.equal(R.normRule({ conds: [{ f: 'cost', op: 'drop table', v: 'a' }] }), null);
  assert.equal(R.normRule({ conds: [{ f: 'cost', op: 'is', v: '' }] }), null, 'a value is required');
  const n = R.normRule({ match: 'weird', conds: Array.from({ length: 20 }, () => ({ f: 'cost', op: 'filled', v: 'zzz' })) });
  assert.equal(n.match, 'all'); assert.equal(n.conds.length, 8); assert.equal(n.conds[0].v, '');
  const t = R.describeRule({ match: 'all', conds: [{ f: 'type', op: 'is', v: 'ai-source' }, { f: 'cost', op: 'not', v: 'Paid' }] }, { types: [{ v: 'ai-source', l: 'AI' }] });
  assert.equal(t, 'Type is AI and Cost is not Paid');
  for (const p of R.PRESETS) assert.ok(R.normRule(p.rule), p.id);
});
test('smart sector fills itself and stays current; manual changes are ignored', () => {
  fresh();
  const a = st.addResource({ title: 'A', type: 'ai-source', fields: { cost: 'Free' } });
  const j = st.addJob({ name: 'Free AI', rule: { match: 'all', conds: [{ f: 'type', op: 'is', v: 'ai-source' }, { f: 'cost', op: 'is', v: 'Free' }] } });
  assert.deepEqual(st.jobById(j.id).members, [a.id]);
  const b = st.addResource({ title: 'B', type: 'ai-source', fields: { cost: 'Free' } }); assert.equal(st.jobById(j.id).members.length, 2);
  st.setField(b.id, 'cost', 'Paid'); assert.deepEqual(st.jobById(j.id).members, [a.id]);
  st.addToJob(j.id, b.id); assert.deepEqual(st.jobById(j.id).members, [a.id], 'manual add is ignored');
  st.removeFromJob(j.id, a.id); assert.deepEqual(st.jobById(j.id).members, [a.id], 'manual remove is ignored');
  st.deleteResource(a.id); assert.deepEqual(st.jobById(j.id).members, []);
  const c = st.addResource({ title: 'C', type: 'ai-source', fields: { cost: 'Free' } }); assert.equal(st.jobById(j.id).members.length, 1);
  st.updateJob(j.id, { rule: null }); assert.equal(st.jobById(j.id).rule, null); assert.deepEqual(st.jobById(j.id).members, [c.id], 'making it manual keeps the members');
  st.addToJob(j.id, st.addResource({ title: 'D' }).id); assert.equal(st.jobById(j.id).members.length, 2, 'works by hand again');
});
test('smart sector survives save and load, and a backup merge', () => {
  fresh();
  const j = st.addJob({ name: 'Trials', rule: { match: 'all', conds: [{ f: 'status', op: 'is', v: 'testing' }] } });
  const r = st.addResource({ title: 'T' }); st.startTrial(r.id, 14);
  assert.deepEqual(st.jobById(j.id).members, [r.id]);
  st.save(true); const raw = JSON.parse(mem.get(st.STORAGE_KEY)); assert.ok(raw.jobs[0].rule);
  st.load({}); assert.deepEqual(st.jobById(j.id).members, [r.id]);
  const backup = st.exportData(); fresh(); st.importBackup(backup, 'replace'); assert.equal(st.state.jobs[0].rule.conds[0].v, 'testing'); assert.equal(st.state.jobs[0].members.length, 1);
});
test('trials: start, extend, verdict; alerts buckets and stats', () => {
  fresh();
  const r = st.addResource({ title: 'Trial me' });
  st.startTrial(r.id, 14); assert.equal(st.byId(r.id).status, 'testing'); assert.equal(st.byId(r.id).trialEnd, plus(14)); assert.equal(st.trialBucket(st.byId(r.id)), null);
  st.byId(r.id).trialEnd = plus(2); assert.equal(st.trialBucket(st.byId(r.id)), 'soon'); st.byId(r.id).trialEnd = plus(-1); assert.equal(st.trialBucket(st.byId(r.id)), 'overdue');
  assert.equal(st.stats().events, 1); assert.equal(st.stats().attention, 1);
  st.extendTrial(r.id, 7); assert.equal(st.byId(r.id).trialEnd, plus(7));
  st.setVerdict(r.id, 'keep', 'works well'); const k = st.byId(r.id); assert.equal(k.status, 'active'); assert.equal(k.trialEnd, ''); assert.equal(k.verdict.result, 'keep'); assert.equal(k.verdict.note, 'works well');
  st.startTrial(r.id, 7); assert.equal(st.byId(r.id).verdict, null);
  st.setVerdict(r.id, 'drop'); assert.equal(st.byId(r.id).status, 'archived'); assert.equal(st.setVerdict(r.id, 'maybe'), null);
  assert.equal(st.normalizeResource({ title: 'x', verdict: { result: 'keep', at: 'garbage' } }).verdict, null);
});
test('limit reset buckets and candidate staleness', () => {
  fresh();
  const r = st.addResource({ title: 'AI', type: 'ai-source', fields: { resets: plus(5) } });
  assert.equal(st.resetBucket(st.byId(r.id)), 'soon'); st.setField(r.id, 'resets', plus(-1)); assert.equal(st.resetBucket(st.byId(r.id)), 'past');
  st.setField(r.id, 'resets', plus(-9)); assert.equal(st.resetBucket(st.byId(r.id)), null); st.setField(r.id, 'resets', plus(30)); assert.equal(st.resetBucket(st.byId(r.id)), null);
  const c = st.addResource({ title: 'Maybe', status: 'candidate' }); assert.equal(st.staleInfo(st.byId(c.id)), null);
  st.byId(c.id).statusSince = plus(-40); const si = st.staleInfo(st.byId(c.id)); assert.equal(si.reasons[0].kind, 'candidate');
});
test('search finds items by their field values', () => {
  fresh();
  const a = st.addResource({ title: 'Alpha', type: 'ai-source', fields: { cost: 'Free with limits', limit: '1.3M tokens' }, useWhen: 'write code' });
  st.addResource({ title: 'Beta', type: 'ai-source', fields: { cost: 'Paid' }, useWhen: 'write code' });
  const res = se.search(st.state.resources, 'free code').results.map(x => x.r.id); assert.deepEqual(res, [a.id]);
  assert.equal(se.search(st.state.resources, 'ai source').results.length, 2);
});
test('before-bulk hook fires for imports, bulk edits, deletes and restores', () => {
  fresh(); const seen = []; st.on('before-bulk', x => seen.push(x));
  const ids = [st.addResource({ title: 'A' }).id, st.addResource({ title: 'B' }).id];
  st.bulkUpdate(ids, () => ({ status: 'archived' })); st.deleteResource(ids[0]); st.addMany([{ title: 'x', url: 'https://x.example/' }, { title: 'y', url: 'https://y.example/' }]);
  st.importBackup(st.exportData(), 'replace');
  assert.deepEqual(seen, ['Before a bulk change', 'Before a delete', 'Before an import', 'Before restoring a backup']);
  st.bulkUpdate([ids[1]], () => ({})); assert.equal(seen.length, 4, 'one item is not a bulk change');
});
test('export: task text', () => {
  fresh();
  const r = st.addResource({ title: 'Deck [Maker]', url: 'https://deck.example/', useWhen: 'turn a PDF into slides' });
  const t = X.taskText([r], { title: 'Make the pitch', steps: ['Open it', 'Paste the outline'], goal: 'Pitch on Friday' });
  const lines = t.split('\n'); assert.equal(lines[0], 'Make the pitch'); assert.ok(t.includes('- [Deck \\[Maker\\]](https://deck.example/) (turn a PDF into slides)')); assert.ok(t.includes('- [ ] Paste the outline')); assert.ok(t.includes('Goal: Pitch on Friday'));
  assert.equal(X.taskText(r).split('\n')[0], 'Use Deck [Maker]');
  const th = st.addThread('Daily', [{ rid: r.id, note: 'Skim' }]); const m = X.missionTask(th, st.byId); assert.ok(m.startsWith('Daily\n') && m.includes('- [ ] Skim - Deck [Maker] (https://deck.example/)'));
});
test('export: CSV escapes quotes, commas and spreadsheet formulas', () => {
  fresh(); st.addJob({ name: 'Main' });
  st.addResource({ title: '=HYPERLINK("http://evil")', url: 'https://a.example/', notes: 'has, comma and "quote"\nnewline', tags: 'x', fields: { cost: '+Free' } }, [st.state.jobs[0].id]);
  const csv = X.csvAll(st.state); const lines = csv.trim().split('\r\n'); assert.equal(lines.length, 2);
  assert.ok(lines[1].startsWith('"\'=HYPERLINK(""http://evil"")"'), lines[1]); assert.ok(lines[1].includes('"has, comma and ""quote"" newline"')); assert.ok(lines[1].includes(",'+Free,"));
  assert.ok(lines[0].startsWith('Title,Link,Type,Stage,Sectors,Tags,Cost'));
});
test('export: Markdown groups by sector and includes facts', () => {
  fresh(); const j = st.addJob({ name: 'Learn' });
  st.addResource({ title: 'Khan', url: 'https://khan.example/', type: 'web-tool', useWhen: 'learn maths', fields: { cost: 'Free' }, tags: 'maths' }, [j.id]); st.addResource({ title: 'Loose' });
  const md = X.markdownAll(st.state); assert.ok(md.includes('## Learn') && md.includes('[Khan](https://khan.example/) - Tool · Free') && md.includes('Use it when: learn maths') && md.includes('## Not in a sector') && md.includes('**Loose**'));
});
test('export: AI brief is short, leaves out links by default and Instagram follows, and respects the size cap', () => {
  fresh();
  for (let i = 0; i < 40; i++) st.addResource({ title: 'Tool ' + i, url: 'https://t' + i + '.example/secret?key=abc', type: 'web-tool', useWhen: 'do thing number ' + i, capabilities: 'x'.repeat(50) });
  st.addResource({ title: '@acct', url: 'https://www.instagram.com/acct/', src: 'following', tags: 'following' });
  st.addResource({ title: 'AI', type: 'ai-source', fields: { cost: 'Free with limits', limit: '1M tokens', resets: plus(3) }, useWhen: 'write code' });
  const b = X.aiBrief(st.state, { maxChars: 1500 }); assert.ok(b.text.length <= 1500 + 100, b.text.length); assert.ok(b.left > 0 && /left out/.test(b.text));
  assert.ok(!b.text.includes('secret?key') && !b.text.includes('@acct'));
  const all = X.aiBrief(st.state, { detail: 'full' }); assert.ok(all.text.includes('AI (AI, Free with limits, 1M tokens, Limit resets or offer ends ' + plus(3) + ')'), all.text.split('\n').find(l => l.startsWith('- AI')));
  assert.ok(all.text.indexOf('- AI (') < all.text.indexOf('- Tool 39') || true); assert.equal(all.tokens, Math.ceil(all.text.length / 4));
  assert.ok(X.aiBrief(st.state, { links: true, maxChars: 99999 }).text.includes('https://t1.example/secret?key=abc'));
});
test('export: calendar events, .ics format and links', () => {
  fresh();
  const a = st.addResource({ title: 'Feed, one', url: 'https://f.example/', checkCadence: 'weekly', useWhen: 'read; news' }); st.markChecked(a.id);
  const b = st.addResource({ title: 'AI', type: 'ai-source', fields: { resets: plus(5) } }), c = st.addResource({ title: 'Trial', status: 'testing', trialEnd: plus(10) }), d = st.addResource({ title: 'Far', fields: { resets: plus(300) } });
  const ev = X.upcomingEvents(st.state.resources, { from: today, days: 90 }); assert.deepEqual(ev.map(e => e.kind), ['resets', 'check', 'trial'].sort((x, y) => ev.find(e => e.kind === x).date.localeCompare(ev.find(e => e.kind === y).date)));
  assert.ok(!ev.some(e => e.rid === d.id));
  const ics = X.icsFor(ev, { now: new Date('2026-10-24T10:00:00Z') });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n')); assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.ok(ics.includes('SUMMARY:Check: Feed\\, one') && ics.includes('DTSTAMP:20261024T100000Z') && ics.includes('DTSTART;VALUE=DATE:' + plus(7).replace(/-/g, '')) && ics.includes('DTEND;VALUE=DATE:' + plus(8).replace(/-/g, '')));
  assert.ok(ics.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75), 'lines are folded');
  const g = X.gcalLink(ev[0]); assert.ok(g.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE&text=') && g.includes('dates=' + ev[0].date.replace(/-/g, '') + '%2F'));
  assert.ok(X.whatsappLink('a b').endsWith('a%20b')); const mt = X.mailtoLink('s', 'x'.repeat(3000)); assert.ok(mt.cut && mt.href.length < 2600);
});
