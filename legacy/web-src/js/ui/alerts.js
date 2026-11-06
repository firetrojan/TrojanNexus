// ui/alerts.js - what needs you: due checks, stale things, and the scan queue (unreviewed worlds).
import { h, domainOf, todayISO, daysBetween, fmtDate, plural, shortUrl } from '../util.js';
import { siteIndex, sameSite } from '../dupes.js';
import { offerUndo } from './safety.js';
import { openResource } from './launch.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import * as game from '../game.js';
import * as sfx from '../sfx.js';
import { app } from './app.js';
import { bulkGuess, bulkLook, webStatus } from './scan.js';
import { TOPIC_BY_ID } from '../topics.js';
import { addToCalendar } from './share.js';
import { upcomingEvents } from '../exporters.js';
import { addDays } from '../util.js';
import { checkWatch, whyNot } from './watch.js';
import { FRAMED, canShareFiles } from './kit.js';
import { profiles, fitFor, fitLine, clearFits, sortAll, choiceRow } from './fit.js';
import { openPanel, getPanel, btn, chip, ico, toast, confirmBox, promptBox, actionSheet, monogram, dueChip, openLink, segmented, CAD_LABEL, RESEARCH_LABEL, TYPE_LABEL } from './kit.js';

let tab = 'due', rf = '', shown = 12, checking = '';
let selMode = false, curList = [];
const sel = new Set(), editing = new Set(), wide = new Set();
const RSHORT = { verified: 'Checked', known: 'From knowledge', scanned: 'Read from page', guess: 'Guessed', 'title-only': 'Title only', user: 'Yours', import: 'Imported' };
const rChip = (k, o = {}) => chip((RSHORT[k] || (RESEARCH_LABEL[k] || k).split(' - ')[0].split(',')[0]) + (o.count != null ? ' ' + o.count : ''), { cls: k === 'verified' ? 'good' : (k === 'known' || k === 'scanned' ? 't' : 'warn'), title: RESEARCH_LABEL[k] || k, on: o.on, onclick: o.onclick });
const lockedNote = o => (o && o.skipped ? ' ' + plural(o.skipped, 'locked item') + (o.skipped === 1 ? ' was' : ' were') + ' skipped.' : '');
export function openAlerts(t) {
  if (t) { tab = t; shown = 12; }
  return openPanel('alerts', { kind: 'view', title: 'Alerts', render: draw });
}
const redraw = () => { const p = getPanel('alerts'); if (p) draw(p); };

function counts() {
  const due = store.state.resources.filter(r => ['overdue', 'today'].includes(store.dueBucket(r))).length;
  const up = store.state.resources.filter(r => store.dueBucket(r) === 'upcoming').length;
  const stale = store.state.resources.filter(r => store.staleInfo(r)).length;
  const scan = store.state.resources.filter(r => r.draft && r.src !== 'following').length;
  const st = store.stats();
  return { due: st.attention, checks: due, events: st.events, up, stale, scan };
}

function draw(p) {
  const c = counts(), keep = p.scroller.scrollTop;
  if (tab !== 'scan' || !c.scan) { selMode = false; sel.clear(); }
  p.setActions(tab === 'scan' && c.scan ? btn(selMode ? 'Done' : 'Select', { cls: 'ghost' + (selMode ? ' bold' : ''), onclick: () => { selMode = !selMode; if (!selMode) sel.clear(); draw(p); } }) : null);
  const tabs = segmented([{ v: 'due', l: 'Due', n: c.due }, { v: 'stale', l: 'Stale', n: c.stale }, { v: 'scan', l: 'To review', n: c.scan }], tab, v => { tab = v; shown = 12; draw(p); });
  const body = tab === 'due' ? dueTab(c) : (tab === 'stale' ? staleTab() : scanTab());
  p.body.replaceChildren(h('div.stack', tabs, body, selMode ? h('div.bulk-space') : null)); p.scroller.scrollTop = keep;
  bulkBar(p);
}

function row(r, sub, actions, cls) {
  return h('div.card.arow' + (cls ? '.' + cls : ''), monogram(r, 38), h('div.grow', h('div.t', { role: 'button', tabindex: '0', onclick: () => app.open.detail(r.id), style: { cursor: 'pointer' } }, r.title), h('div.s', sub), h('div.meta.acts', actions)));
}
const checkBtn = r => btn('Checked', { cls: 'xs pri', icon: 'check', onclick: () => { store.markChecked(r.id); game.award('check', 1, r.title.slice(0, 36)); sfx.feel('ok', [10, 25]); } });
const snoozeBtn = r => btn('Snooze', { cls: 'xs', icon: 'clock', onclick: () => actionSheet({ title: 'Snooze ' + r.title.slice(0, 40), items: [{ label: '1 day', icon: 'clock', run: () => { store.snooze(r.id, 1); toast('Back tomorrow.', { icon: 'clock' }); } }, { label: '1 week', icon: 'clock', run: () => { store.snooze(r.id, 7); toast('Back in a week.', { icon: 'clock' }); } }] }) });
const feedBtn = r => (r.rssUrl || r.url) ? btn(r.rssUrl ? 'Open feed' : 'Open', { cls: 'xs', icon: r.rssUrl ? 'rss' : 'open', onclick: () => openResource(r, r.rssUrl || r.url) }) : null;

function dueTab(c) {
  const t = todayISO(), groups = { overdue: [], today: [], upcoming: [] };
  store.state.resources.forEach(r => { const b = store.dueBucket(r); if (b) groups[b].push(r); });
  Object.values(groups).forEach(a => a.sort((x, y) => x.nextCheck.localeCompare(y.nextCheck)));
  const scheduled = store.state.resources.filter(r => r.checkCadence !== 'none' && r.status !== 'archived').length;
  const out = [];
  const trials = store.state.resources.filter(r => store.trialBucket(r)).sort((a, b) => a.trialEnd.localeCompare(b.trialEnd));
  const limits = store.state.resources.filter(r => store.resetBucket(r) === 'soon' || store.resetBucket(r) === 'past').sort((a, b) => a.fields.resets.localeCompare(b.fields.resets));
  const nudge = store.backupNudge(), watched = store.state.resources.filter(r => r.watch && r.watch.on && r.status !== 'archived'), changedPages = watched.filter(store.watchChanged).sort((a, b) => b.watch.changed.localeCompare(a.watch.changed));
  if (nudge.due) out.push(h('div.card.prog.backup', h('div.grow.stack', { style: { gap: '8px' } }, h('b', 'Back up your data'),
    h('p.dim.small', (nudge.days === null ? 'You have not downloaded a backup yet. ' : 'Your last backup was ' + plural(nudge.days, 'day') + ' ago. ') + 'Everything lives only in this browser, so clearing site data or losing the phone loses it.'),
    h('div.chips', canShareFiles() ? btn('Share backup', { cls: 'sm pri', icon: 'open', onclick: async () => { await app.open.backupNow('share'); redraw(); } }) : null, FRAMED ? null : btn('Download backup', { cls: 'sm pri', icon: 'download', onclick: async () => { await app.open.backupNow('file'); redraw(); } }), btn('Copy backup text', { cls: 'sm', icon: 'copy', onclick: async () => { await app.open.backupNow('copy'); redraw(); } }), btn('Remind me in a week', { cls: 'sm', onclick: () => { store.setSetting('backupSnooze', addDays(todayISO(), 7)); redraw(); } })))));
  const sec = (title, list, cls, mk) => list.length ? [h('div.sec-h', h('h3', { class: cls }, title), h('span.n', list.length)), h('div.list', list.map(mk))] : [];
  out.push(...sec('Pages that changed', changedPages, 'bad', r => row(r, r.watch.what[0] || 'Changed on ' + fmtDate(r.watch.changed), [btn('Open', { cls: 'xs pri', icon: 'open', onclick: () => openResource(r) }), btn('Seen', { cls: 'xs', icon: 'check', onclick: () => { store.markWatchSeen(r.id); sfx.feel('ok'); } }), btn('Details', { cls: 'xs', icon: 'eye', onclick: () => app.open.detail(r.id) })], 'due')));
  if (watched.length) out.push(h('div.card.prog.watchbar', h('div.grow', h('div.t', 'Watched pages'), h('div.s', plural(watched.length, 'page') + ' watched. Checking needs the internet and takes a few seconds each.')),
    btn(checking ? checking : 'Check now', { cls: 'sm pri', icon: 'signal', disabled: !!checking, onclick: async () => { checking = 'Checking…'; redraw(); try { await checkWatch(store.state.resources.filter(r => r.watch && r.watch.on && r.status !== 'archived' && !whyNot(r)).map(r => r.id), { onProgress: p => { checking = 'Checking ' + p.done + ' of ' + p.total; redraw(); } }); } finally { checking = ''; redraw(); } } })));
  out.push(...sec('Trials to decide', trials, trials.some(r => store.trialBucket(r) === 'overdue') ? 'bad' : '', r => { const d = daysBetween(t, r.trialEnd);
    return row(r, d < 0 ? 'Trial ended ' + (-d) + ' days ago' : (d === 0 ? 'Trial ends today' : 'Trial ends in ' + d + ' days') + (r.fields.cost ? ' · ' + r.fields.cost : ''), [btn('Keep', { cls: 'xs pri', icon: 'check', onclick: () => app.open.verdict(r, 'keep') }), btn('Drop', { cls: 'xs', icon: 'close', onclick: () => app.open.verdict(r, 'drop') }), btn('+7 days', { cls: 'xs', icon: 'clock', onclick: () => { store.extendTrial(r.id, 7); toast('Trial now ends ' + fmtDate(store.byId(r.id).trialEnd) + '.', { icon: 'clock' }); } })], d < 0 ? 'due' : ''); }));
  out.push(...sec('Limits and offers', limits, '', r => { const d = daysBetween(t, r.fields.resets), lim = r.fields.limit ? r.fields.limit + ' · ' : '';
    return row(r, lim + (d < 0 ? 'Reset date passed ' + (-d) + ' days ago' : (d === 0 ? 'Resets today' : 'Resets in ' + d + ' days (' + fmtDate(r.fields.resets) + ')')), [btn('Next month', { cls: 'xs pri', icon: 'clock', onclick: () => { store.setField(r.id, 'resets', addDays(r.fields.resets, 30)); toast('Moved to ' + fmtDate(store.byId(r.id).fields.resets) + '.', { icon: 'clock' }); } }), btn('Clear', { cls: 'xs', icon: 'close', onclick: () => store.setField(r.id, 'resets', '') }), btn('Calendar', { cls: 'xs', icon: 'clock', onclick: () => addToCalendar(upcomingEvents([r], { days: 400 }).filter(e => e.kind === 'resets')) })], d < 0 ? 'due' : ''); }));
  out.push(...sec('Overdue', groups.overdue, 'bad', r => row(r, CAD_LABEL[r.checkCadence] + ' · ' + (-daysBetween(t, r.nextCheck)) + ' days late', [checkBtn(r), snoozeBtn(r), feedBtn(r)], 'due')));
  out.push(...sec('Today', groups.today, '', r => row(r, CAD_LABEL[r.checkCadence] + ' · due today', [checkBtn(r), snoozeBtn(r), feedBtn(r)], 'due')));
  out.push(...sec('Next 7 days', groups.upcoming, '', r => row(r, CAD_LABEL[r.checkCadence] + ' · ' + fmtDate(r.nextCheck), [checkBtn(r), snoozeBtn(r), feedBtn(r)])));
  if (!out.filter(x => x && !(x.classList && (x.classList.contains('backup') || x.classList.contains('watchbar')))).length) out.push(h('div.empty', h('div.big', { html: icon('check', 'lg') }), h('b', scheduled || store.state.resources.some(r => r.status === 'testing') ? 'All clear' : 'Nothing is scheduled yet'),
    h('p', scheduled ? 'Nothing is due in the next 7 days. ' + plural(scheduled, 'resource') + ' on a schedule.' : 'Give a resource a daily, weekly or monthly check, a trial end date or a limit reset date, and it shows up here when it is due.'), btn('Open the Vault', { cls: 'sm', icon: 'vault', onclick: () => app.open.vault() })));
  return h('div', out);
}

function staleTab() {
  const list = store.state.resources.map(r => ({ r, s: store.staleInfo(r) })).filter(x => x.s).sort((a, b) => b.s.days - a.s.days);
  if (!list.length) return h('div.empty', h('div.big', { html: icon('spark', 'lg') }), h('b', 'Nothing is going stale'), h('p', 'A resource goes stale after 30 days without a check, 60 days in a trial, or 30 days on your to-try list.'));
  const why = s => s.reasons.map(x => x.kind === 'testing' ? 'In trial for ' + x.days + ' days' : (x.kind === 'candidate' ? 'On your to-try list for ' + x.days + ' days' : x.kind === 'never' ? 'Never checked, saved ' + x.days + ' days ago' : 'Last checked ' + x.days + ' days ago')).join(' · ');
  return h('div', h('div.hint', 'These have not been looked at in a while. Check them, archive them, or leave them.'), h('div.sec-h', h('h3', 'Stale'), h('span.n', list.length)),
    h('div.list', list.slice(0, shown * 3).map(({ r, s }) => row(r, why(s), [checkBtn(r), btn(r.status === 'candidate' ? 'Try it' : 'Archive', { cls: 'xs', icon: r.status === 'candidate' ? 'flag' : 'layers', onclick: () => { if (r.status === 'candidate') { store.startTrial(r.id, 14); toast('Trial started. It ends ' + fmtDate(store.byId(r.id).trialEnd) + '.', { icon: 'flag' }); } else { store.updateResource(r.id, { status: 'archived' }); game.award('archive'); } } }), r.status === 'candidate' ? btn('Archive', { cls: 'xs', icon: 'layers', onclick: () => { store.updateResource(r.id, { status: 'archived' }); game.award('archive'); } }) : feedBtn(r)]))),
    list.length > shown * 3 ? h('div.row', { style: { justifyContent: 'center', margin: '12px 0' } }, btn('Show more', { cls: 'sm', onclick: () => { shown += 12; redraw(); } })) : null);
}

function scanTab() {
  const all = store.state.resources.filter(r => r.draft && r.src !== 'following'), total = store.state.resources.filter(r => r.src !== 'following').length;
  [...sel].forEach(id => { const r = store.byId(id); if (!r || !r.draft) sel.delete(id); });
  const index = siteIndex(store.state.resources), flags = new Map();
  all.forEach(r => { const o = sameSite(r, index); if (o.length) flags.set(r.id, o); });
  if (rf === 'site' && !flags.size) rf = '';
  const list = all.filter(r => rf === 'site' ? flags.has(r.id) : (!rf || r.research === rf)), ready = all.filter(r => (r.research === 'verified' || r.research === 'known') && (r.capabilities.length || r.useWhen.length));
  curList = list;
  const done = total - all.length, pct = total ? Math.round(100 * done / total) : 100;
  const out = [h('div.card.prog', h('div.grow', h('div.row', h('b', 'Mapped'), h('span.grow'), h('b.mono', done + ' / ' + total)), h('div.bar', h('i', { style: { width: pct + '%' } })), h('p.dim.small', 'Each new item starts unreviewed: the title is yours, the notes are a first guess. Check what is right, fix what is not. Tap Select (top right) to confirm, tag, move or delete many at once.')))];
  out.push(fillCard(all));
  const fits = clearFits(all);
  if (fits.length && !selMode) out.push(h('div.card.fit-card', h('div.grow', h('div.t', 'Auto-sort'), h('div.s', plural(fits.length, 'link') + (fits.length === 1 ? ' has' : ' have') + ' a clear sector fit. Nothing is confirmed.')), btn('Sort ' + fits.length, { cls: 'sm pri', icon: 'sectors', onclick: () => sortAll(all, redraw) })));
  if (ready.length && !selMode) out.push(h('div.d-acts', btn('Confirm ' + ready.length + ' researched', { cls: 'pri', icon: 'check', onclick: async () => {
    if (await confirmBox({ title: 'Confirm ' + plural(ready.length, 'researched resource') + '?', text: 'These have notes written from research or general knowledge. Confirming means you accept them as they are. You can still edit any of them later.', ok: 'Confirm all' })) { store.bulkUpdate(ready.map(r => r.id), () => ({ draft: false }), { includeLocked: true }); game.award('review', ready.length, plural(ready.length, 'resource') + ' confirmed'); toast(plural(ready.length, 'resource') + ' confirmed.', { icon: 'check' }); }
  } })));
  const kinds = ['verified', 'known', 'scanned', 'guess', 'title-only', 'import'].filter(k => all.some(r => r.research === k || (k === 'import' && r.src === 'import')));
  out.push(h('div.chips.scrollx', chip('All ' + all.length, { on: !rf, onclick: () => { rf = ''; shown = 12; redraw(); } }),
    flags.size ? chip('Same site ' + flags.size, { cls: 'warn', icon: 'link', on: rf === 'site', onclick: () => { rf = 'site'; shown = 12; redraw(); } }) : null,
    kinds.filter(k => k !== 'import').map(k => rChip(k, { on: rf === k, onclick: () => { rf = k; shown = 12; redraw(); }, count: all.filter(r => r.research === k).length }))));
  if (!list.length) { out.push(h('div.empty', h('div.big', { html: icon('trophy', 'lg') }), h('b', all.length ? 'Nothing in this filter' : 'Everything is reviewed'), h('p', all.length ? 'Try another filter.' : 'New imports will land here.'))); return h('div.stack', out); }
  const prof = profiles();
  out.push(h('div.list', list.slice(0, shown).map(r => scanCard(r, flags.get(r.id), fitFor(r, prof), prof))));
  if (list.length > shown) out.push(h('div.row', { style: { justifyContent: 'center', margin: '8px 0' } }, btn('Show ' + Math.min(12, list.length - shown) + ' more', { cls: 'sm', onclick: () => { shown += 12; redraw(); } })));
  return h('div.stack', out);
}

/** Bulk help for the whole review list: guess topics offline, or read the real pages online. */
function fillCard(all) {
  const ig = store.state.resources.filter(r => r.src === 'following'), web = webStatus();
  const fresh = a => a.filter(r => !r.scan), seen = a => a.filter(r => r.scan && r.scan.topic).length;
  const line = (label, list) => h('div.fill-row', h('div.grow', h('div.t', label), h('div.s', plural(list.length, 'item') + ' · ' + seen(list) + ' with a topic · ' + fresh(list).length + ' not looked at')),
    h('div.meta.acts', btn('Guess', { cls: 'xs pri', icon: 'spark', disabled: !fresh(list).length, onclick: () => bulkGuess(fresh(list).map(r => r.id)) }), btn('Look online', { cls: 'xs', icon: 'signal', disabled: !list.length, onclick: () => bulkLook(list.map(r => r.id)) })));
  return h('div.card.prog', h('div.grow.stack', { style: { gap: '10px' } }, h('b', 'Fill in the blanks'),
    h('p.dim.small', 'Guess what things are about from names and links (works offline), or read the real pages when you are online. It only fills empty fields.'),
    line('Websites to review', all), ig.length ? line('Instagram accounts', ig) : null,
    !web.ok ? h('p.dim.small', web.text) : null));
}

const toggleSel = id => { sel.has(id) ? sel.delete(id) : sel.add(id); sfx.feel('tap', 4); redraw(); };
const confirmOne = r => { store.updateResource(r.id, { draft: false }); game.award('review', 1, r.title.slice(0, 30)); sfx.feel('ok'); };

/** One item to review: everything needed to decide, without opening it. */
function scanCard(r, others, fit, prof) {
  const save = (k, v) => { store.updateResource(r.id, { [k]: v }, true); store.save(); const t = card.querySelector('.saved'); if (t) { t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 1200); } };
  const desc = r.scan && r.scan.desc ? r.scan.desc : '', jobs = store.jobsOf(r.id).filter(j => !j.rule), edit = editing.has(r.id) && !selMode;
  const topic = r.scan && r.scan.topic ? chip((TOPIC_BY_ID[r.scan.topic] || {}).label || r.scan.topic, { cls: r.scan.conf === 'clear' ? 'good' : 't', icon: 'spark' }) : null;
  const row = selMode ? null : choiceRow(r, j => { store.addToJob(j.id, r.id, true); confirmOne(r); }, prof);
  const lab = t => h('div.sc-lab', t);
  const clamp = (t, key) => h('p.sc-desc' + (wide.has(key) ? '.open' : ''), { onclick: e => { if (selMode) return; e.stopPropagation(); wide.has(key) ? wide.delete(key) : wide.add(key); e.currentTarget.classList.toggle('open'); } }, t);
  const flag = others && others.length ? h('div.sc-flag', h('b', 'Same site'), ' as ' + (others.length === 1 ? 'one other link' : others.length + ' other links') + '. Check you need both:',
    others.slice(0, 3).map(({ r: o, same }) => h('button.sc-other', { type: 'button', onclick: e => { e.stopPropagation(); app.open.detail(o.id); } }, h('span.grow.ell', h('b', o.title), ' ', h('span.dim', shortUrl(o.url, 40))), same ? chip('same link', { cls: 'warn' }) : (o.draft ? chip('to review', { cls: 't' }) : null))),
    others.length > 3 ? h('span.dim.small', 'and ' + (others.length - 3) + ' more') : null,
    selMode ? null : h('div.row.wrap', btn('Compare', { cls: 'xs', icon: 'layers', onclick: e => { e.stopPropagation(); app.open.compare([r.id, others[0].r.id]); } }))) : null;
  const facts = h('div.chips.sc-facts', chip(TYPE_LABEL[r.type] || r.type, { cls: 't' }), r.fields && r.fields.cost ? chip(r.fields.cost, { cls: 'good' }) : null, r.folder ? chip(r.folder.length > 30 ? '…' + r.folder.slice(-29) : r.folder, { icon: 'vault', title: 'Bookmark folder' }) : null,
    jobs.slice(0, 3).map(j => chip(j.name, { dot: true, color: j.color })), jobs.length > 3 ? chip('+' + (jobs.length - 3)) : null, chip('Saved ' + fmtDate(r.added || r.createdAt), { icon: 'clock' }), r.locked ? chip('Locked', { icon: 'lock' }) : null);
  const tags = h('div.chips.sc-tags', r.tags.slice(0, 12).map(t => chip('#' + t)), r.tags.length > 12 ? chip('+' + (r.tags.length - 12)) : null,
    selMode ? null : chip(r.tags.length ? 'Edit tags' : 'Add tags', { cls: 't', icon: 'tag', onclick: async () => { const v = await promptBox({ title: 'Tags', text: 'Separate tags with commas.', fields: [{ key: 'tags', label: '', value: r.tags.join(', '), placeholder: 'e.g. design, free, learn' }], ok: 'Save' }); if (v) store.updateResource(r.id, { tags: v.tags }); } }));
  const uw = h('textarea.ta', { rows: 2, placeholder: 'Use it when… (one per line)', onchange: e => save('useWhen', e.target.value) }, r.useWhen.join('\n'));
  const cp = h('textarea.ta', { rows: 2, placeholder: 'What it can do (one per line)', onchange: e => save('capabilities', e.target.value) }, r.capabilities.join('\n'));
  const written = h('div.sc-use', r.useWhen.length ? h('p', h('b', 'Use it when: '), r.useWhen.join(' · ')) : null, r.capabilities.length ? h('p', h('b', 'It can: '), r.capabilities.join(' · ')) : null,
    !r.useWhen.length && !r.capabilities.length ? h('p.dim', 'Not described yet.') : null);
  const card = h('div.card.scan' + (selMode ? '.pick' : '') + (sel.has(r.id) ? '.hot' : ''), selMode ? { role: 'button', tabindex: '0', onclick: () => toggleSel(r.id) } : null, h('div.grow.stack', { style: { gap: '9px' } },
    h('div.row', selMode ? h('span.tick' + (sel.has(r.id) ? '.on' : '')) : null, monogram(r, 38),
      h('div.grow', h('div.t', selMode ? null : { role: 'button', tabindex: '0', onclick: () => app.open.detail(r.id), style: { cursor: 'pointer' } }, r.title), h('div.s.mono.ell', shortUrl(r.url, 60) || 'No link')),
    ),
    selMode ? null : fitLine(fit),
    row,
    flag,
    desc ? [lab('From the page'), clamp('“' + desc + '”', r.id + ':d')] : null,
    r.notes ? [lab(desc ? 'Notes' : 'First guess'), clamp(r.notes, r.id + ':n')] : null,
    !desc && !r.notes ? h('p.dim.small', 'No description yet. Use "Look online" above, or open Details.') : null,
    h('div.chips', rChip(r.research), topic),
    tags, facts,
    edit ? [uw, cp] : (selMode && !r.useWhen.length && !r.capabilities.length ? null : written),
    selMode ? null : h('div.row.wrap', btn('Confirm', { cls: 'xs' + (row ? '' : ' pri'), icon: 'check', onclick: () => confirmOne(r) }), btn('Details', { cls: 'xs', icon: 'eye', onclick: () => app.open.detail(r.id) }),
      r.url ? btn('Open', { cls: 'xs', icon: 'open', onclick: () => openResource(r) }) : null,
      btn(edit ? 'Done' : 'Edit notes', { cls: 'xs', icon: 'edit', onclick: () => { edit ? editing.delete(r.id) : editing.add(r.id); redraw(); } }),
      btn('Archive', { cls: 'xs', icon: 'layers', onclick: () => { store.updateResource(r.id, { status: 'archived', draft: false }); game.award('archive'); toast('Archived. It stays saved, so a new export will not add it again.', { icon: 'layers' }); } }),
      h('span.grow'), h('span.saved.dim.small', 'Saved'))));
  return card;
}

/** The bar for many at once: shown while Select is on. */
function bulkBar(p) {
  p._bulk && p._bulk.remove(); p._bulk = null;
  if (!(tab === 'scan' && selMode)) return;
  const ids = [...sel], n = ids.length;
  const flagged = () => { const idx = siteIndex(store.state.resources); return curList.filter(r => sameSite(r, idx).length).map(r => r.id); };
  const after = () => { sel.clear(); redraw(); };
  p._bulk = h('div.bulk', h('b', n), h('span.dim', ' selected'), h('span.grow'),
    btn('All', { cls: 'ghost sm', onclick: () => { curList.forEach(r => sel.add(r.id)); redraw(); } }),
    btn('Confirm', { cls: 'ghost sm bold', disabled: !n, onclick: () => { const o = store.bulkUpdate(ids, () => ({ draft: false }), { includeLocked: true }); game.award('review', o.changed, plural(o.changed, 'resource') + ' confirmed'); sfx.feel('ok'); toast(plural(o.changed, 'resource') + ' confirmed.', { icon: 'check' }); after(); } }),
    btn('Tag', { cls: 'ghost sm', disabled: !n, onclick: async () => { const v = await promptBox({ title: 'Add a tag to ' + plural(n, 'resource'), fields: [{ key: 'tag', label: 'Tag', placeholder: 'e.g. to-try' }], ok: 'Add tag' }); const t = v && v.tag.trim().toLowerCase().replace(/^#/, ''); if (t) { const o = store.bulkUpdate(ids, r => ({ tags: [...r.tags, t] })); toast('Tag #' + t + ' added to ' + plural(o.changed, 'resource') + '.' + lockedNote(o), { icon: 'tag' }); after(); } } }),
    btn('Sector', { cls: 'ghost sm', disabled: !n, onclick: () => actionSheet({ title: 'Also show ' + plural(n, 'resource') + ' in', items: store.state.jobs.filter(j => !j.rule).map(j => ({ label: j.name, color: j.color, run: () => { ids.forEach(id => store.addToJob(j.id, id, true)); store.addToJob(j.id, ids[ids.length - 1]); toast(plural(n, 'resource') + ' added to ' + j.name + '.', { icon: 'layers' }); after(); } })) }) }),
    btn('More', { cls: 'ghost sm', disabled: !n && !flagged().length, onclick: () => actionSheet({ title: n ? plural(n, 'resource') + ' selected' : 'Select', items: [
      { label: 'Select the "same site" ones', sub: plural(flagged().length, 'item') + ' in this list', icon: 'link', run: () => { flagged().forEach(id => sel.add(id)); redraw(); } },
      { label: 'Guess topics', sub: 'From names and links. Works offline.', icon: 'spark', run: () => { if (n) bulkGuess(ids); } },
      { label: 'Look up online', sub: 'Reads the real pages.', icon: 'signal', run: () => { if (n) bulkLook(ids); } },
      { label: 'Archive', sub: 'Keeps them saved, out of the review list.', icon: 'layers', run: () => { if (!n) return; const o = store.bulkUpdate(ids, () => ({ status: 'archived', draft: false })); game.award('archive', o.changed, plural(o.changed, 'item') + ' archived'); toast(plural(o.changed, 'resource') + ' archived.' + lockedNote(o), { icon: 'layers' }); after(); } },
      { label: 'Delete', sub: 'Removes them. Undo is offered.', icon: 'trash', danger: true, run: async () => {
        if (!n || !(await confirmBox({ title: 'Delete ' + plural(n, 'resource') + '?', text: 'They are removed from every sector, link and mission. A new import will not bring them back. Locked items stay. A safety copy is saved first, and Undo is offered.', ok: 'Delete', danger: true }))) return;
        const o = store.deleteMany(ids); offerUndo('Before deleting several', plural(o.deleted, 'resource') + ' deleted.' + lockedNote(o)); after(); } }] }) }));
  p.el.appendChild(p._bulk);
}
store.on('change', () => { const p = getPanel('alerts'); if (p && !p.body.contains(document.activeElement)) draw(p); });
store.on('game', () => { const p = getPanel('alerts'); if (p && !p.body.contains(document.activeElement)) draw(p); });
app.open.alerts = openAlerts;
