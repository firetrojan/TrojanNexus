// ui/detail.js - the Scanner: a card for one resource (peek -> full), with inline editing. Also the sector card.
import { h, domainOf, todayISO, fmtDate, daysBetween, plural, iso } from '../util.js';
import { showLog } from '../history.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import * as game from '../game.js';
import * as sfx from '../sfx.js';
import { suggestLinks } from '../search.js';
import { app, showInGalaxy } from './app.js';
import { scanSection } from './scan.js';
import { defsFor, filled } from '../fields.js';
import { upcomingEvents } from '../exporters.js';
import { copyAsTask, addToCalendar } from './share.js';
import { ruleText, editRule } from './rules.js';
import { watchSection } from './watch.js';
import { siteIndex, sameSite } from '../dupes.js';
import { openPanel, closePanel, getPanel, openPanels, btn, chip, ico, toast, confirmBox, promptBox, actionSheet, dialog, monogram, dueChip, nextText, copyText, openLink,
  TYPE_LABEL, TYPE_ICON, STATUS_LABEL, CAD_LABEL, RESEARCH_LABEL, pickDialog, inkFor, panelsChanged } from './kit.js';

let cur = { id: null, kind: 'node', expanded: false, editing: false, focus: '' };
const sec = (title, ...kids) => h('section.d-sec', h('div.sec-h', h('h3', title)), h('div.group.pad', kids));
const list = items => h('ul.d-list', items.map(x => h('li', x)));

export function openDetail(id, o = {}) {
  if (!store.byId(id)) return null;
  const viewOpen = openPanels().some(p => p.kind === 'view');
  cur = { id, kind: 'node', expanded: !!o.expanded || viewOpen, editing: !!o.edit, focus: o.focus || '' };
  store.noteVisit('r', id);
  const p = openPanel('detail', { kind: 'sheet', render: draw, onClose: () => { if (app.scene && app.ok && app.scene.sel) app.scene.clearSelection(); cur.id = null; } });
  p.el.classList.toggle('tall', cur.expanded);
  if (!viewOpen && o.fly !== false && app.scene && app.ok) app.scene.select(id, { fly: true });
  return p;
}
export function openSectorCard(id, o = {}) {
  if (!store.jobById(id)) return null;
  cur = { id, kind: 'sector', expanded: false, editing: false };
  store.noteVisit('s', id);
  const p = openPanel('detail', { kind: 'sheet', render: draw, onClose: () => { if (app.scene && app.ok && app.scene.sel) app.scene.clearSelection(); cur.id = null; } });
  p.el.classList.remove('tall');
  if (o.fly !== false && app.scene && app.ok) app.scene.selectSector(id, { fly: true });
  return p;
}
export const closeDetail = () => closePanel('detail');
const redraw = () => { const p = getPanel('detail'); if (p) p.render(); };
function setTall(p, on) { cur.expanded = on; p.el.classList.toggle('tall', on); redraw(); panelsChanged(); }

function draw(p) {
  if (!cur.id) return;
  if (cur.kind === 'sector') return drawSector(p);
  const r = store.byId(cur.id); if (!r) { p.close(); return; }
  const jobs = store.jobsOf(r.id);
  p.el.style.setProperty('--c', jobs[0] ? jobs[0].color : '#8E8E93');
  p.setTitle(cur.editing ? 'Edit' : (r.draft ? 'To review' : TYPE_LABEL[r.type]));
  p.closeBtn.classList.toggle('hide', cur.editing);
  if (cur.editing) { p.setLeft(btn('Cancel', { cls: 'ghost', onclick: () => { cur.editing = false; redraw(); } })); p.setActions(btn('Save', { cls: 'ghost bold', onclick: () => saveEdit(p) })); }
  else { p.setLeft(btn('Edit', { cls: 'ghost', onclick: () => { cur.editing = true; setTall(p, true); } }));
    p.setActions(btn('', { cls: 'ghost icon', icon: cur.expanded ? 'down' : 'up', title: cur.expanded ? 'Collapse' : 'Show all details', onclick: () => setTall(p, !cur.expanded) })); }
  p.body.replaceChildren(...(cur.editing ? editView(r, p) : readView(r, jobs, p)));
  if (cur.focus && cur.editing) { const f = p.body.querySelector('[data-f="' + cur.focus + '"]'); if (f) setTimeout(() => f.focus(), 120); cur.focus = ''; }
}

// ---------- read view ----------
function readView(r, jobs, p) {
  const out = [];
  out.push(h('div.d-top', monogram(r, 56), h('div.grow', h('div.d-title', r.title), h('div.s.dim.ell', domainOf(r.url) || 'No link saved yet'))));
  out.push(h('div.chips.d-chips', chip(TYPE_LABEL[r.type], { cls: 't', icon: TYPE_ICON[r.type] }),
    r.status !== 'active' ? chip(STATUS_LABEL[r.status], { cls: r.status === 'testing' ? 'warn' : '' }) : null,
    r.checkCadence !== 'none' ? chip(CAD_LABEL[r.checkCadence], { icon: 'clock' }) : null, dueChip(r),
    r.draft ? chip('To review', { cls: 'warn', icon: 'scan' }) : null, r.locked ? chip('Locked', { icon: 'lock' }) : null, store.watchChanged(r) ? chip('Page changed', { cls: 'warn', icon: 'alert' }) : null,
    jobs.map(j => chip(j.name, { dot: true, color: j.color }))));
  const facts = filled(r, store.customFields());
  if (facts.length && !cur.expanded) out.push(h('div.chips.facts', facts.slice(0, 4).map(x => chip(x.def.kind === 'date' ? x.def.label + ' ' + fmtDate(x.value) : x.value, { cls: x.def.key === 'resets' && store.resetBucket(r) ? 'warn' : '' }))));
  out.push(h('div.d-acts',
    r.url ? h('a.btn.pri', { href: r.url, target: '_blank', rel: 'noopener noreferrer', onclick: () => { sfx.feel('tap'); store.markOpened(r.id); } }, ico('open', 'sm'), 'Open') : btn('Add link', { cls: 'pri', icon: 'link', onclick: () => { cur.editing = true; cur.focus = 'url'; setTall(p, true); } }),
    btn('Checked', { icon: 'check', onclick: () => checked(r) }),
    btn('', { cls: 'icon', icon: 'target', title: 'Show in galaxy', onclick: () => { if (openPanels().some(x => x.kind === 'view')) { closePanel('detail'); showInGalaxy(r.id); } else app.scene.select(r.id); } }),
    btn('', { cls: 'icon', icon: 'more', title: 'More', onclick: () => moreMenu(r) })));
  if (r.draft) out.push(h('div.hint', h('b', 'Not reviewed yet. '), RESEARCH_LABEL[r.research] || '', '. ',
    h('button.lnk', { type: 'button', onclick: () => confirmReview(r) }, 'Looks right, confirm'), ', ', h('button.lnk', { type: 'button', onclick: () => { cur.editing = true; setTall(p, true); } }, 'edit it'), ' or ', h('button.lnk', { type: 'button', onclick: () => setTall(p, true) }, 'see what it is about'), '.'));
  const uw = r.useWhen[0] || r.capabilities[0] || r.notes;
  if (!cur.expanded) { if (uw) out.push(h('p.d-peek', uw.length > 150 ? uw.slice(0, 148) + '…' : uw)); out.push(h('button.lnk.more', { type: 'button', onclick: () => setTall(p, true) }, 'Show all details')); return out; }

  out.push(detailsSection(r, p), ...lifeSection(r, p));
  out.push(scanSection(r, redraw)); out.push(watchSection(r));
  out.push(sec('Use it when', r.useWhen.length ? list(r.useWhen) : h('p.dim.small', 'Nothing written yet. This is what "Can I do X?" search looks at first.')));
  out.push(sec('What it can do', r.capabilities.length ? list(r.capabilities) : h('p.dim.small', 'Nothing written yet.')));
  if (r.inputs || r.outputs) out.push(sec('Goes in / comes out', h('div.kv', r.inputs ? [h('span.k', 'In'), h('span', r.inputs)] : null, r.outputs ? [h('span.k', 'Out'), h('span', r.outputs)] : null)));
  if (r.notes) out.push(sec('Notes', h('p.d-notes', r.notes)));
  out.push(learnedSection(r));
  if (r.tags.length) out.push(sec('Tags', h('div.chips', r.tags.map(t => chip('#' + t, { cls: '', onclick: () => { closePanel('detail'); app.open.search(t); } })))));
  out.push(sec('Sectors', h('div.chips', store.state.jobs.filter(j => !j.rule || j.members.includes(r.id)).map(j => chip(j.name + (j.rule ? ' · auto' : ''), { dot: true, color: j.color, on: j.members.includes(r.id), onclick: j.rule ? null : () => toggleSector(r, j) }))),
    store.state.jobs.some(j => j.rule) ? h('p.dim.small', 'Sectors marked auto fill themselves from a rule. You cannot place things in them by hand.') : null));
  out.push(relatedSection(r));
  const sib = sameSite(r, siteIndex(store.state.resources));
  if (sib.length) out.push(sec('Same site', h('p.dim.small', 'Other saved pages on the same website. Check you need each one.'), h('div.chips', sib.slice(0, 8).map(({ r: o, same }) => chip((o.title.length > 32 ? o.title.slice(0, 31) + '…' : o.title) + (same ? ' (same link)' : ''), { icon: 'link', cls: same ? 'warn' : '', onclick: () => openDetail(o.id, { fly: !openPanels().some(x => x.kind === 'view') }) }))), sib.length > 8 ? h('p.dim.small', 'and ' + (sib.length - 8) + ' more') : null));
  const th = store.threadsOf(r.id);
  out.push(sec('Missions', th.length ? h('div.chips', th.map(t => chip(t.name, { icon: 'mission', onclick: () => { closePanel('detail'); app.open.missions(t.id); } }))) : h('p.dim.small', 'Not part of a mission yet.'),
    btn('Add to a mission', { cls: 'sm', icon: 'plus', onclick: () => addToMission(r) })));
  out.push(sec('Schedule', h('div.kv', h('span.k', 'Check'), h('span', CAD_LABEL[r.checkCadence]), h('span.k', 'Last'), h('span', r.lastChecked ? fmtDate(r.lastChecked) : 'Never'), h('span.k', 'Next'), h('span', nextText(r))),
    r.rssUrl ? h('div.rss', ico('rss', 'sm'), h('span.grow.ell.mono', r.rssUrl), btn('Copy', { cls: 'xs', onclick: async () => toast((await copyText(r.rssUrl)) ? 'Feed link copied.' : 'Could not copy.', { icon: 'rss' }) }), btn('Open', { cls: 'xs', onclick: () => openLink(r.rssUrl) })) : null,
    r.rssUrl ? h('p.dim.small', 'This page cannot fetch feeds by itself (it runs from a file). Open the feed in your reader or browser.') : null,
    r.nextCheck && r.checkCadence !== 'none' ? btn('Add next check to calendar', { cls: 'sm', icon: 'clock', onclick: () => addToCalendar(upcomingEvents([r], { days: 400 }).filter(e => e.kind === 'check')) }) : null));
  out.push(sec('Where it came from', h('div.kv', h('span.k', 'Source'), h('span', r.src === 'bookmarks' ? 'Your bookmarks' + (r.folder ? ' / ' + r.folder : '') : (r.src === 'following' ? 'Instagram following' : (r.src === 'import' ? 'Imported' : 'Added by you'))),
    h('span.k', 'Research'), h('span', RESEARCH_LABEL[r.research] || r.research), r.added ? [h('span.k', 'Saved'), h('span', fmtDate(r.added))] : null, r.scan ? [h('span.k', 'Looked'), h('span', fmtDate(r.scan.at) + (r.scan.via === 'offline' ? ' (name and link only)' : ' (the page)'))] : null)));
  out.push(historySection(r));
  return out;
}

/** What you learned from using it, in your words. Kept if you leave and come back before saving. */
let draftLearned = { id: '', text: '' };
function learnedSection(r) {
  const start = draftLearned.id === r.id ? draftLearned.text : r.learned;
  const ta = h('textarea.ta', { rows: 3, maxlength: '800', placeholder: 'e.g. The free plan stops at 3 exports a day. The phone app is slower than the website.', 'aria-label': 'What I learned', oninput: () => { draftLearned = { id: r.id, text: ta.value }; } }, start);
  return sec('What I learned', h('p.dim.small', 'Your own words about using it. Search finds this text.'), ta,
    h('div.row', { style: { marginTop: '8px' } }, btn('Save', { cls: 'sm pri', onclick: () => { const v = ta.value.trim(); draftLearned = { id: '', text: '' }; if (v === r.learned) return toast('Nothing changed.', { icon: 'info' }); store.updateResource(r.id, { learned: v }); sfx.feel('ok'); toast('Saved.', { icon: 'check' }); } })));
}
/** The few things that happened to it since this feature started, plus how often you open it. */
function historySection(r) {
  const log = showLog(r.log);
  const used = r.opens ? 'Opened ' + plural(r.opens, 'time') + ' in Nexus, last on ' + fmtDate(iso(new Date(r.openedAt))) + '.' : 'Not opened through Nexus yet.';
  return sec('History', h('p.dim.small', 'Saved ' + fmtDate(r.createdAt) + '. ' + used),
    log.length ? h('ul.d-list.hist', log.slice(0, 12).map(e => h('li', h('span.dim', fmtDate(e.at) + '  '), e.t))) : h('p.dim.small', 'From now on this lists what happens to it: reviewed, stage changes, checks, decisions and merges.'));
}

/** Cost, free limit, handle... the facts this kind of resource carries. */
function detailsSection(r, p) {
  const custom = store.customFields(), have = filled(r, custom), can = defsFor(r.type, custom);
  if (!have.length && !can.length) return null;
  const rows = have.map(x => [h('span.k', x.def.label), h('span', x.def.kind === 'date' ? [fmtDate(x.value), ' ', datePill(x.value)] : x.value)]);
  const dates = upcomingEvents([r], { days: 400 }).filter(e => e.kind === 'resets');
  return sec('Details', have.length ? h('div.kv.fx', rows) : h('p.dim.small', 'Cost, limits and other facts for ' + TYPE_LABEL[r.type].toLowerCase() + ' resources. Nothing filled in yet.'),
    h('div.chips', btn(have.length ? 'Edit details' : 'Fill in', { cls: 'sm', icon: 'edit', onclick: () => { cur.editing = true; cur.focus = 'fld_' + (can[0] ? can[0].key : ''); setTall(p, true); } }), dates.length ? btn('Add to calendar', { cls: 'sm', icon: 'clock', onclick: () => addToCalendar(dates) }) : null));
}
function datePill(iso) {
  const d = daysBetween(todayISO(), iso);
  return h('span.dpill' + (d < 0 ? '.bad' : (d <= 7 ? '.warn' : '')), d === 0 ? 'today' : (d > 0 ? 'in ' + d + 'd' : -d + 'd ago'));
}
/** To try -> trial -> keep or drop. Shows where this resource is and what to do next. */
function lifeSection(r, p) {
  if (r.status === 'candidate') return [sec('To try', h('p.dim', 'On your to-try list since ' + fmtDate(r.statusSince || r.createdAt) + '. Start a trial to give it an end date and a decision.'),
    h('div.chips', btn('Start a trial', { cls: 'sm pri', icon: 'flag', onclick: () => trialSheet(r) }), btn('Mark active', { cls: 'sm', icon: 'check', onclick: () => store.updateResource(r.id, { status: 'active' }) })))];
  if (r.status === 'testing') {
    const left = r.trialEnd ? daysBetween(todayISO(), r.trialEnd) : null;
    return [sec('Trial', h('p', r.trialEnd ? 'Ends ' + fmtDate(r.trialEnd) + (left < 0 ? ' (' + (-left) + ' days ago, time to decide)' : (left === 0 ? ' (today)' : ' (' + left + ' days left)')) : 'No end date set. Give it one so you remember to decide.'),
      h('div.chips', btn('Keep it', { cls: 'sm pri', icon: 'check', onclick: () => verdictFlow(r, 'keep') }), btn('Drop it', { cls: 'sm', icon: 'close', onclick: () => verdictFlow(r, 'drop') }), btn(r.trialEnd ? 'Extend' : 'Set an end', { cls: 'sm', icon: 'clock', onclick: () => trialSheet(r, true) }),
        r.trialEnd ? btn('Add to calendar', { cls: 'sm', icon: 'clock', onclick: () => addToCalendar(upcomingEvents([r], { days: 400 }).filter(e => e.kind === 'trial')) }) : null))];
  }
  if (r.verdict) return [sec('Your decision', h('p', (r.verdict.result === 'keep' ? 'You decided to keep it on ' : 'You dropped it on ') + fmtDate(r.verdict.at) + '.' + (r.verdict.note ? ' ' + r.verdict.note : '')))];
  return [];
}
function trialSheet(r, extend) {
  actionSheet({ title: extend ? 'Extend the trial' : 'Start a trial', sub: 'You get an alert when it ends, so you decide on time.', items: [7, 14, 30].map(d => ({ label: d + ' days', icon: 'clock', run: () => { if (extend && r.status === 'testing') store.extendTrial(r.id, d); else store.startTrial(r.id, d); toast('Trial ends ' + fmtDate(store.byId(r.id).trialEnd) + '.', { icon: 'flag' }); sfx.feel('ok'); } })) });
}
/** Keep or drop, with a short reason that stays on the resource. */
export async function verdictFlow(r, result) {
  const keep = result === 'keep';
  const v = await promptBox({ title: keep ? 'Keep ' + r.title.slice(0, 30) : 'Drop ' + r.title.slice(0, 30), text: keep ? 'It becomes Active.' : 'It is archived, not deleted. You can bring it back.', fields: [{ key: 'note', label: 'Why? (optional)', type: 'textarea', rows: 2, placeholder: keep ? 'e.g. fast, free limit is enough' : 'e.g. limit too small' }], ok: keep ? 'Keep it' : 'Drop it' });
  if (!v) return false;
  store.setVerdict(r.id, result, v.note.trim()); game.award('review', 1, 'Decided'); sfx.feel('ok', [10, 30]);
  toast(keep ? 'Kept. It is Active now.' : 'Dropped and archived.', { icon: 'check' }); return true;
}

function relatedSection(r) {
  const rel = r.related.map(id => store.byId(id)).filter(Boolean);
  const sug = suggestLinks(r, store.state.resources, 3);
  return sec('Linked to', rel.length ? h('div.chips', rel.map(o => chip(o.title.length > 34 ? o.title.slice(0, 33) + '…' : o.title, { icon: 'link', onclick: () => openDetail(o.id, { fly: !openPanels().some(x => x.kind === 'view') }) }))) : h('p.dim.small', 'No links yet. Linked resources are joined by a line in the galaxy.'),
    h('div.chips', btn('Link a resource', { cls: 'sm', icon: 'plus', onclick: () => pickResource(r) }), sug.map(s => chip('+ ' + (s.r.title.length > 26 ? s.r.title.slice(0, 25) + '…' : s.r.title), { cls: 'good', onclick: () => { store.link(r.id, s.r.id); game.award('link'); } }))),
    sug.length ? h('p.dim.small', 'Green chips are suggestions based on shared tags and words.') : null);
}

// ---------- actions ----------
function checked(r) {
  store.markChecked(r.id); const x = store.byId(r.id); game.award('check', 1, r.title.slice(0, 40)); sfx.feel('ok', [10, 30]);
  toast(x.nextCheck ? 'Checked. Next look: ' + fmtDate(x.nextCheck) + '.' : 'Checked today.', { icon: 'check' });
}
function confirmReview(r) { store.updateResource(r.id, { draft: false }); game.award('review', 1, 'Reviewed'); sfx.feel('ok'); toast('Marked as reviewed.', { icon: 'check' }); }
function toggleSector(r, j) { if (j.members.includes(r.id)) store.removeFromJob(j.id, r.id); else store.addToJob(j.id, r.id); sfx.feel('tap'); }
async function addToMission(r) {
  const ts = store.state.threads, items = ts.map(t => ({ label: t.name, sub: t.steps.length + ' steps', icon: 'mission', run: () => { store.addStep(t.id, r.id); game.award('link'); toast('Added to ' + t.name + '.', { icon: 'mission' }); } }));
  items.push({ label: 'New mission with this step', icon: 'plus', run: async () => { const v = await promptBox({ title: 'New mission', fields: [{ key: 'name', label: 'Name', placeholder: 'e.g. Check a claim' }], ok: 'Create' }); if (v && v.name.trim()) { store.addThread(v.name, [{ rid: r.id, note: '' }]); game.award('thread', 1, v.name.trim()); toast('Mission created.', { icon: 'mission' }); } } });
  actionSheet({ title: 'Add to mission', items });
}
function moreMenu(r) {
  actionSheet({ title: r.title.slice(0, 60), items: [
    r.url ? { label: r.pinned ? 'Unpin from Home' : 'Pin to Home', sub: r.pinned ? 'Remove it from the launch pad favourites' : 'Keep it first on the Home launch pad', icon: 'star', run: () => { store.setPinned(r.id, !r.pinned); toast(r.pinned ? 'Pinned to Home.' : 'Unpinned.', { icon: 'star' }); } } : null,
    r.url ? { label: 'Copy link', icon: 'copy', run: async () => toast((await copyText(r.url)) ? 'Link copied.' : 'Could not copy.', { icon: 'copy' }) } : null,
    r.url ? { label: 'What is it about?', icon: 'signal', run: () => { const p = getPanel('detail'); if (p) setTall(p, true); } } : null,
    { label: 'Copy as task', sub: 'For Super Productivity or any to-do app', icon: 'copy', run: () => copyAsTask([r]) },
    upcomingEvents([r], { days: 400 }).length ? { label: 'Add to calendar', sub: 'Next check, limit date or trial end', icon: 'clock', run: () => addToCalendar(upcomingEvents([r], { days: 400 })) } : null,
    { label: 'Compare with…', icon: 'layers', run: async () => { const o = await pickDialog('Compare with', new Set([r.id])); if (o) app.open.compare([r.id, o.id]); } },
    r.checkCadence !== 'none' ? { label: 'Snooze 1 day', icon: 'clock', run: () => { store.snooze(r.id, 1); toast('Snoozed until tomorrow.', { icon: 'clock' }); } } : null,
    r.checkCadence !== 'none' ? { label: 'Snooze 1 week', icon: 'clock', run: () => { store.snooze(r.id, 7); toast('Snoozed for a week.', { icon: 'clock' }); } } : null,
    { label: r.status === 'archived' ? 'Restore from archive' : 'Archive', icon: 'layers', run: () => { store.updateResource(r.id, { status: r.status === 'archived' ? 'active' : 'archived' }); if (r.status !== 'archived') game.award('archive'); } },
    r.status === 'testing' ? { label: 'Keep or drop…', icon: 'flag', run: () => actionSheet({ title: 'Decide', items: [{ label: 'Keep it', icon: 'check', run: () => verdictFlow(r, 'keep') }, { label: 'Drop it', icon: 'close', run: () => verdictFlow(r, 'drop') }, { label: 'Extend the trial', icon: 'clock', run: () => trialSheet(r, true) }] }) } : { label: 'Start a trial…', icon: 'flag', run: () => trialSheet(r) },
    r.status === 'active' ? { label: 'Move to "to try"', icon: 'flag', run: () => store.updateResource(r.id, { status: 'candidate' }) } : null,
    { label: 'Merge another link into this one…', sub: 'The other link is removed. Its tags, notes and sectors move here', icon: 'layers', run: async () => { const o = await pickDialog('Merge into ' + r.title.slice(0, 28), new Set([r.id])); if (o) app.open.mergeFlow(r.id, o.id); } },
    { label: 'Duplicate', icon: 'copy', run: () => { const d = store.duplicateResource(r.id); if (d) { toast('Duplicated.', { icon: 'copy' }); openDetail(d.id); } } },
    { label: r.locked ? 'Unlock' : 'Lock', sub: r.locked ? 'Allow bulk changes and deleting again' : 'Protect it from bulk changes and deleting', icon: r.locked ? 'unlock' : 'lock', run: () => { const was = r.locked; store.setLocked(r.id, !was); toast(was ? 'Unlocked.' : 'Locked. Bulk changes skip it and it cannot be deleted.', { icon: 'lock' }); } },
    { label: 'Delete', icon: 'trash', danger: true, run: async () => { if (r.locked) return toast('It is locked. Unlock it first.', { icon: 'lock' }); if (await confirmBox({ title: 'Delete this resource?', text: 'It is removed from every sector, link and mission. This cannot be undone (export a backup first if unsure).', ok: 'Delete', danger: true })) { closePanel('detail'); store.deleteResource(r.id); toast('Deleted.', { icon: 'trash' }); } } }] });
}
export async function pickResource(r) {
  const o = await pickDialog('Link to', new Set([r.id, ...r.related]));
  if (o) { store.link(r.id, o.id); game.award('link'); sfx.feel('ok'); }
}

// ---------- edit view ----------
function editView(r, p) {
  const F = {};
  const fld = (key, label, el, hint) => { F[key] = el; el.dataset.f = key; return h('div.field', h('label', label), el, hint ? h('p.dim.small', hint) : null); };
  const sel = (key, label, opts, val) => fld(key, label, h('select.sel', opts.map(([v, l]) => h('option', { value: v, selected: v === val }, l))));
  const lines = a => a.join('\n');
  const vals = { ...r.fields }, fbox = h('div.stack.fbox');
  p._vals = vals;
  const fieldEl = d => {
    const set = v => { if (v === '' || v == null) delete vals[d.key]; else vals[d.key] = v; };
    let el;
    if (d.kind === 'choice') el = h('select.sel', { onchange: e => set(e.target.value) }, h('option', { value: '' }, 'Not set'), d.options.map(o => h('option', { value: o, selected: vals[d.key] === o }, o)), vals[d.key] && !d.options.includes(vals[d.key]) ? h('option', { value: vals[d.key], selected: true }, vals[d.key]) : null);
    else if (d.kind === 'date') el = h('input.in', { type: 'date', value: vals[d.key] || '', onchange: e => set(e.target.value) });
    else el = h('input.in', { value: vals[d.key] || '', placeholder: d.ph || '', autocomplete: 'off', oninput: e => set(e.target.value.trim()) });
    el.dataset.f = 'fld_' + d.key;
    return h('div.field.sub', h('label', d.label), el);
  };
  const drawF = () => { const defs = defsFor(F.type ? F.type.value : r.type, store.customFields()); fbox.replaceChildren(...(defs.length ? defs.map(fieldEl) : [h('p.dim.small', 'No extra fields for this type yet.')])); };
  const rev = h('button.switch' + (r.draft ? '.on' : ''), { type: 'button', onclick: e => e.currentTarget.classList.toggle('on') });
  p._form = F; p._rev = rev; setTimeout(() => { if (F.type) F.type.addEventListener('change', drawF); }, 0); drawF();
  return [h('div.stack.form',
    fld('title', 'Title', h('input.in', { value: r.title })), fld('url', 'Link', h('input.in', { value: r.url, placeholder: 'https://', inputmode: 'url', autocapitalize: 'off', autocomplete: 'off' })),
    h('div.two', sel('type', 'Type', store.TYPES.map(t => [t, TYPE_LABEL[t]]), r.type), sel('status', 'Stage', store.STATUSES.map(t => [t, STATUS_LABEL[t]]), r.status)),
    fld('trialEnd', 'Trial ends (optional)', h('input.in', { type: 'date', value: r.trialEnd || '' }), 'Used when the stage is Trial. You get an alert on this day.'),
    h('div.field', h('label', 'Details'), fbox, h('div.chips', btn('Add your own field', { cls: 'xs', icon: 'plus', onclick: () => app.open.manageFields().then(() => drawF()) }))),
    sel('cadence', 'Check how often', store.CADENCES.map(t => [t, CAD_LABEL[t]]), r.checkCadence),
    fld('useWhen', 'Use it when (one per line)', h('textarea.ta', { rows: 4, placeholder: 'turn a PDF into slides\nfind who owns a company' }, lines(r.useWhen)), 'Search ranks these lines highest. Write them the way you would ask the question.'),
    fld('capabilities', 'What it can do (one per line)', h('textarea.ta', { rows: 4 }, lines(r.capabilities))),
    h('div.two', fld('inputs', 'Goes in', h('input.in', { value: r.inputs })), fld('outputs', 'Comes out', h('input.in', { value: r.outputs }))),
    fld('tags', 'Tags (comma separated)', h('input.in', { value: r.tags.join(', '), autocapitalize: 'off' })),
    fld('notes', 'Notes', h('textarea.ta', { rows: 3 }, r.notes)),
    fld('rss', 'Feed link (optional)', h('input.in', { value: r.rssUrl, inputmode: 'url', autocapitalize: 'off' }), 'YouTube channel links that contain the channel id get their feed link automatically.'),
    h('div.group', h('div.set', h('div.grow', h('div.lab', 'Mark as reviewed')), rev))), h('div.d-acts', btn('Save changes', { cls: 'pri', onclick: () => saveEdit(p) }))];
}
function saveEdit(p) {
  const r = store.byId(cur.id), F = p._form; if (!r || !F) return;
  const v = k => F[k].value, was = r.draft, nowDraft = !p._rev.classList.contains('on');
  const patch = { title: v('title'), url: v('url').trim(), type: v('type'), status: v('status'), checkCadence: v('cadence'), useWhen: v('useWhen'), capabilities: v('capabilities'), inputs: v('inputs'), outputs: v('outputs'), tags: v('tags'), notes: v('notes'), rssUrl: v('rss').trim(), draft: nowDraft, trialEnd: v('status') === 'testing' ? v('trialEnd') : '', fields: p._vals || r.fields };
  store.updateResource(r.id, patch); cur.editing = false;
  if (was && !nowDraft) game.award('review', 1, 'Reviewed'); else sfx.feel('ok');
  toast('Saved.', { icon: 'check' }); redraw();
}

// ---------- sector card ----------
function drawSector(p) {
  const j = store.jobById(cur.id); if (!j) { p.close(); return; }
  p.el.style.setProperty('--c', j.color); p.setTitle(j.sealed ? 'Sealed sector' : 'Sector'); p.closeBtn.classList.remove('hide');
  p.setLeft(btn('Edit', { cls: 'ghost', onclick: () => editSector(j) })); p.setActions();
  const items = j.members.map(id => store.byId(id)).filter(Boolean);
  p.body.replaceChildren(
    h('div.d-top', h('span.mono-ic', { style: { '--c': j.color, '--ink': inkFor(j.color), '--s': '56px' }, html: icon(j.icon && j.icon !== 'star' ? j.icon : 'sectors') }), h('div.grow', h('div.d-title', j.name), h('div.s.dim', items.length + (items.length === 1 ? ' resource' : ' resources')))),
    j.note ? h('p.d-peek', j.note) : null,
    j.rule ? h('p.dim.small', 'Fills itself: ' + ruleText(j.rule) + '.') : null,
    h('div.d-acts', btn('Open sector', { cls: 'pri', icon: 'sectors', onclick: () => { closePanel('detail'); app.open.sectors(j.id); } }), btn(onShelf(j.id) ? 'Remove from Home' : 'Show on Home', { icon: 'star', onclick: () => toggleShelf(j) }), j.rule ? btn('Edit rule', { icon: 'edit', onclick: async () => { const r = await editRule({ rule: j.rule }); if (r) { store.updateJob(j.id, { rule: r }); toast('Rule saved.', { icon: 'check' }); } } }) : btn('Add here', { icon: 'plus', onclick: () => app.open.quickadd({ jobId: j.id }) }), btn('', { cls: 'icon', icon: 'galaxy', title: 'Back to overview', onclick: () => { closePanel('detail'); app.scene.home(); } })),
    items.length ? h('div.chips', items.slice(0, 10).map(r => chip(r.title.length > 26 ? r.title.slice(0, 25) + '…' : r.title, { onclick: () => openDetail(r.id) })), items.length > 10 ? chip('+' + (items.length - 10) + ' more', { cls: 't', onclick: () => { closePanel('detail'); app.open.sectors(j.id); } }) : null)
      : h('p.dim.small', j.sealed ? 'Sealed and empty. Anything you add here stays in this sector until you move it.' : 'Nothing here yet. Tap "Add here" to drop in your first resource.'));
}
const onShelf = id => (store.getSetting('shelves') || []).some(x => x.job === id);
function toggleShelf(j) {
  const cur = (store.getSetting('shelves') || []);
  if (onShelf(j.id)) { store.setSetting('shelves', cur.filter(x => x.job !== j.id)); toast(j.name + ' is off Home.', { icon: 'check' }); }
  else if (cur.length >= 4) toast('Home has 4 shelves already. Remove one first (Home, Edit).', { icon: 'info' });
  else { store.setSetting('shelves', cur.concat({ job: j.id })); toast(j.name + ' is on Home as a shelf.', { icon: 'check' }); }
  redraw();
}
export async function editSector(j) {
  const v = await promptBox({ title: 'Edit sector', fields: [
    { type: 'starprev', star: 'color', planet: 'planetColor' },
    { key: 'name', label: 'Name', value: j.name }, { key: 'note', label: 'What goes here', type: 'textarea', value: j.note || '', rows: 2 },
    { key: 'color', label: 'Star colour', type: 'color', colors: store.STAR_COLORS, value: j.color },
    { key: 'planetColor', label: 'Planet colour (the sites around the star)', type: 'color', colors: store.PLANET_COLORS, none: 'Same as star', value: j.planetColor || '' },
    { key: 'sealed', label: 'Sealed (private look)', type: 'check', value: j.sealed }], ok: 'Save' });
  if (v) { store.updateJob(j.id, { name: v.name.trim() || j.name, note: v.note, color: v.color, planetColor: v.planetColor, sealed: v.sealed }); toast('Sector updated.', { icon: 'check' }); }
}
store.on('change', () => { if (getPanel('detail') && cur.id) redraw(); });
app.open.detail = openDetail; app.open.verdict = verdictFlow; app.open.detailRedraw = redraw; app.open.sectorCard = openSectorCard; app.open.closeDetail = closeDetail;
