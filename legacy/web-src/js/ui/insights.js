// ui/insights.js - Insights: what you use, what you do not, how your map is balanced, and what is lying around.
import { h, plural, todayISO, daysBetween, fmtDate } from '../util.js';
import * as store from '../store.js';
import * as game from '../game.js';
import * as sfx from '../sfx.js';
import { mostUsed, cullInfo, sectorShare, addedPerMonth, looseEnds, storageInfo, IDLE_DAYS } from '../insights.js';
import { app } from './app.js';
import { offerUndo } from './safety.js';
import { dupeCount } from './merge.js';
import { tidyCount } from './tidy.js';
import { similarCount } from './tags.js';
import { ideaList } from './ideas.js';
import { openPanel, getPanel, btn, toast, confirmBox, monogram } from './kit.js';

let more = 8;
export function openInsights() { more = 8; return openPanel('insights', { kind: 'view', title: 'Insights', back: true, render: draw }); }
const redraw = () => { const p = getPanel('insights'); if (p) draw(p); };

const bar = (pct, color) => h('div.ins-bar', h('i', { style: { width: Math.max(2, pct) + '%', background: color || 'var(--blue)' } }));
const stat = (label, value, sub) => h('div.ins-stat', h('div.ins-v', String(value)), h('div.ins-l', label), sub ? h('div.ins-s', sub) : null);
const sec = (title, ...kids) => h('section.tile', h('div.tile-h', h('span', title)), ...kids);

function draw(p) {
  const today = todayISO(), st = store.stats(today), nudge = store.backupNudge(today);
  const used = mostUsed(store.state.resources, 6), top = used[0] ? used[0].opens : 1;
  const shares = sectorShare(store.state.jobs, store.byId), maxShare = shares[0] ? shares[0].n : 1;
  const months = addedPerMonth(store.state.resources, today, 6), maxM = Math.max(1, ...months.map(m => m.n));
  const inMission = new Set(); store.state.threads.forEach(t => t.steps.forEach(s => inMission.add(s.rid)));
  const cull = cullInfo(store.state.resources, { opensSince: store.getSetting('opensSince'), today, inMission });
  const dupes = dupeCount(), tidy = tidyCount(), alike = similarCount(), ideas = ideaList().length, loose = looseEnds(store.state.resources, id => store.jobsOf(id).filter(j => !j.rule));
  let bytes = 0; try { bytes = (localStorage.getItem(store.STORAGE_KEY) || '').length; } catch (e) { /* no storage */ }
  const sto = storageInfo(bytes);
  p.setActions(btn('Done', { cls: 'ghost bold', onclick: () => p.close ? p.close() : app.open.closeViews() }));
  const keep = p.scroller ? p.scroller.scrollTop : 0;

  const out = [];
  out.push(h('div.ins-grid',
    stat('Links', st.active, st.total !== st.active ? (st.total - st.active) + ' archived' : ''), stat('To review', st.drafts, st.drafts ? 'Quick review on Home' : 'All reviewed'),
    stat('Sectors', store.state.jobs.filter(j => j.members.length).length, shares[0] ? 'Largest: ' + shares[0].name : ''),
    stat('Backup', nudge.days === null ? 'None' : nudge.days === 0 ? 'Today' : nudge.days + ' d', nudge.days === null ? 'Not backed up yet' : 'since the last one')));

  out.push(sec('Most used', used.length ? h('div.ins-list', used.map(r => h('div.ins-row', monogram(r, 30), h('div.grow', h('div.t.ell', r.title), bar(100 * r.opens / top)), h('span.ins-n', r.opens + '×')))) :
    h('p.dim.small', 'Nothing opened through Nexus yet. Open links from Home, or from any list, and your most used ones show up here. Opens made outside Nexus cannot be counted.')));

  out.push(sec('By sector', h('div.ins-list', shares.slice(0, 10).map(s => h('button.ins-row.btnrow', { type: 'button', onclick: () => app.open.sectorCard(s.id, { fly: false }) }, h('span.dot', { style: { background: s.color } }),
    h('div.grow', h('div.t.ell', s.name + (s.drafts ? '  ·  ' + s.drafts + ' to review' : '')), bar(100 * s.n / maxShare, s.color)), h('span.ins-n', s.n)))),
    shares.length > 10 ? h('p.dim.small', '+ ' + (shares.length - 10) + ' smaller sectors') : null));

  out.push(sec('Added per month', h('div.ins-cols', months.map(m => h('div.ins-col', h('span.ins-cv', m.n || ''), h('div.ins-cbar', h('i', { style: { height: (m.n ? Math.max(6, 100 * m.n / maxM) : 2) + '%' } })), h('span.ins-cl', m.label))))));

  // not used lately
  const cullBody = !cull.ready
    ? [h('p.dim.small', cull.since ? 'Nexus has counted opens for ' + plural(cull.daysTracked, 'day') + ' (since ' + fmtDate(cull.since) + '). It needs ' + IDLE_DAYS + ' days before it can fairly say what you do not use. About ' + plural(cull.waitDays, 'day') + ' to go.'
      : 'Nexus has not counted any opens yet. Open links from Home or any list, and after ' + IDLE_DAYS + ' days this shows what you never touch, so you can archive it.')]
    : cull.list.length
      ? [h('p.dim.small', plural(cull.list.length, 'link') + ' not opened in ' + IDLE_DAYS + '+ days (or never, since ' + fmtDate(cull.since) + '). Archiving keeps them saved and out of your way. Opens outside Nexus are not counted, so use "I use it" for those.'),
        h('div.ins-list', cull.list.slice(0, more).map(({ r, idle }) => h('div.ins-row', monogram(r, 30), h('div.grow', h('div.t.ell', r.title), h('div.s.dim.small', idle === null ? 'Never opened here' : 'Last opened ' + plural(idle, 'day') + ' ago')),
          btn('Archive', { cls: 'xs', onclick: () => { const was = r.status; store.updateResource(r.id, { status: 'archived' }); game.award('archive'); sfx.feel('ok'); toast('Archived.', { icon: 'layers', action: { label: 'Undo', fn: () => store.updateResource(r.id, { status: was }) } }); } }),
          btn('I use it', { cls: 'xs ghost', onclick: () => { store.updateResource(r.id, { keep: true }); sfx.feel('tap'); } })))),
        h('div.row.wrap', { style: { marginTop: '8px' } }, cull.list.length > more ? btn('Show more', { cls: 'xs', onclick: () => { more += 10; redraw(); } }) : null,
          btn('Archive all ' + cull.list.length, { cls: 'xs', icon: 'layers', onclick: async () => {
            if (!(await confirmBox({ title: 'Archive ' + plural(cull.list.length, 'link') + '?', text: 'They stay saved but leave your lists and Home. A safety copy is saved first, with Undo.', ok: 'Archive' }))) return;
            const o = store.bulkUpdate(cull.list.map(x => x.r.id), () => ({ status: 'archived' })); game.award('archive', o.changed); offerUndo('Before a bulk change', plural(o.changed, 'link') + ' archived.');
          } }))]
      : [h('p.dim.small', 'Nothing to clear. Every link was opened lately, or is pinned, watched, in a mission or marked "I use it".')];
  out.push(sec('Not used lately', ...cullBody));

  out.push(sec('Loose ends', h('div.ins-list',
    h('div.ins-row', h('div.grow', h('div.t', plural(loose.noSector.length, 'link') + ' in no sector'), h('div.s.dim.small', 'They only show up in search and Vault.')), h('div.row', { style: { flex: 'none' } }, ideas ? btn('Ideas', { cls: 'xs pri', onclick: () => app.open.ideas() }) : null, btn('Vault', { cls: 'xs', onclick: () => app.open.vault() }))),
    h('div.ins-row', h('div.grow', h('div.t', plural(loose.noWords.length, 'link') + ' with no "use it when"'), h('div.s.dim.small', 'Search finds you faster when each says what it is for.')), btn('Vault', { cls: 'xs', onclick: () => app.open.vault() })),
    dupes ? h('div.ins-row', h('div.grow', h('div.t', plural(dupes, 'site') + ' with more than one link'), h('div.s.dim.small', 'Different pages on one website. Merge the ones that are the same thing.')), btn('Merge', { cls: 'xs', onclick: () => app.open.dupes() })) : null,
    tidy ? h('div.ins-row', h('div.grow', h('div.t', plural(tidy, 'link') + ' to tidy'), h('div.s.dim.small', 'Tracking junk in the address, or a messy title.')), btn('Tidy', { cls: 'xs', onclick: () => app.open.tidy() })) : null,
    alike ? h('div.ins-row', h('div.grow', h('div.t', plural(alike, 'group') + ' of look-alike tags'), h('div.s.dim.small', 'For example "ai-tool" and "ai tools". Join them so search finds all.')), btn('Tags', { cls: 'xs', onclick: () => app.open.tags() })) : null,
    h('div.ins-row', h('div.grow', h('div.t', plural(st.stale, 'link') + ' not checked in a while'), h('div.s.dim.small', 'Checked means you confirmed it still works.')), btn('See', { cls: 'xs', onclick: () => app.open.alerts('stale') })))));

  out.push(sec('Storage', h('div.ins-bar.big', h('i', { style: { width: Math.max(2, sto.pct) + '%', background: sto.pct > 70 ? 'var(--orange)' : 'var(--green)' } })),
    h('p.dim.small', sto.label + ' of about 5 MB used (' + sto.pct + '%). Space is not the risk. Losing the phone or clearing the browser is, so keep a backup off the phone.')));

  p.body.replaceChildren(h('div.ins', out)); if (p.scroller) p.scroller.scrollTop = keep;
}
store.on('change', () => { const p = getPanel('insights'); if (p) draw(p); });
app.open.insights = openInsights;
