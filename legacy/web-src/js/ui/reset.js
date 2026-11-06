// ui/reset.js - the weekly reset: a short checklist (inbox, due, old links, backup) and 3 picks for the week.
// Each step shows its live status and opens the place that fixes it. Nothing is forced: Finish works even if a step is left.
import { h, plural, todayISO, domainOf, fmtDate } from '../util.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import * as game from '../game.js';
import * as sfx from '../sfx.js';
import { needsItems, reviewQueue } from '../home.js';
import { pickActive, progress } from '../mission.js';
import { normWeekly, resetDue, activePicks, setPicks, finishReset, suggestPicks, weekDigest, MAX_PICKS } from '../week.js';
import { app } from './app.js';
import { openPanel, getPanel, btn, toast, monogram, pickDialog, canShareFiles, FRAMED } from './kit.js';

let picks = [];            // links being chosen for this week (ids)
const why = new Map();     // id -> the reason it was suggested
let draft = null;          // { day, picks, why } kept while you leave to fix a step, so coming back does not lose your choices

/** Up to 3 suggestions from what is really waiting. Used here and nowhere else, so Home and this screen agree. */
export function suggestForWeek(today = todayISO()) {
  const has = id => !!store.byId(id), t = pickActive(store.state.threads, store.getSetting('activeMission'), has), p = t && progress(t, has);
  const mr = p && p.next && store.byId(p.next.s.rid);
  return suggestPicks({
    needs: needsItems(store.state.resources, store, today), mission: mr ? { r: mr, name: t.name } : null,
    stale: store.state.resources.filter(r => r.status !== 'archived' && store.staleInfo(r, today)), drafts: reviewQueue(store.state.resources)
  });
}

export function openReset() {
  const today = todayISO(), cur = activePicks(store.getSetting('weekly'), today, id => !!store.byId(id));
  why.clear();
  if (draft && draft.day === today) { picks = draft.picks.filter(id => !!store.byId(id)); draft.why.forEach((v, k) => why.set(k, v)); }
  else if (cur.length) picks = cur.map(p => p.rid);
  else { const s = suggestForWeek(today); picks = s.map(x => x.rid); s.forEach(x => why.set(x.rid, x.why)); }
  return openPanel('reset', { kind: 'view', title: 'Weekly reset', back: true, render: draw });
}
const redraw = () => { const p = getPanel('reset'); if (p) draw(p); };
const remember = () => { draft = { day: todayISO(), picks: picks.slice(), why: new Map(why) }; };

function stepRow(s) {
  return h('div.nrow.rs-st' + (s.done ? '.ok' : ''), h('span.rs-dot', { html: s.done ? icon('check', 'sm') : '' }),
    h('div.grow', h('div.t', { style: { cursor: 'default' } }, s.title), h('div.s', s.text)), s.go ? h('div.acts', s.go) : null);
}

function draw(p) {
  const today = todayISO(), st = store.stats(today), nudge = store.backupNudge(today), att = needsItems(store.state.resources, store, today).length;
  const steps = [
    { done: st.drafts === 0, title: 'Clear the inbox', text: st.drafts ? plural(st.drafts, 'link') + ' still to review.' : 'Nothing to review.', go: st.drafts ? btn('Review', { cls: 'xs pri', onclick: () => app.open.homeGo('review') }) : null },
    { done: att === 0, title: 'Handle what is due', text: att ? plural(att, 'thing') + ' in Needs you: due checks, trials, limits, changed pages.' : 'Nothing is due.', go: att ? btn('Open', { cls: 'xs pri', onclick: () => app.open.homeGo('needs') }) : null },
    { done: st.stale === 0, title: 'Look at old links', text: st.stale ? plural(st.stale, 'resource') + ' not checked in a while.' : 'Nothing is old.', go: st.stale ? btn('See', { cls: 'xs pri', onclick: () => app.open.alerts('stale') }) : null },
    { done: !nudge.due, title: 'Back up', text: nudge.days === null ? 'No backup downloaded yet.' : nudge.days === 0 ? 'Backed up today.' : 'Last backup ' + plural(nudge.days, 'day') + ' ago.',
      go: btn(nudge.due ? 'Back up' : 'Again', { cls: 'xs' + (nudge.due ? ' pri' : ''), onclick: async () => { await app.open.backupNow(FRAMED ? 'copy' : (canShareFiles() ? 'share' : 'file')); redraw(); } }) }
  ];
  const nDone = steps.filter(s => s.done).length;
  p.setActions(); remember();
  const keep = p.scroller ? p.scroller.scrollTop : 0;

  const pickRows = picks.map(id => store.byId(id)).filter(Boolean).map(r => h('div.nrow', monogram(r, 34),
    h('div.grow', h('div.t', { style: { cursor: 'default' } }, r.title), h('div.s', why.get(r.id) || domainOf(r.url) || r.tags.slice(0, 3).join(', ') || 'No link')),
    h('div.acts', btn('Remove', { cls: 'xs', onclick: () => { picks = picks.filter(x => x !== r.id); redraw(); } }))));

  const dg = weekDigest(store.state.resources, store.getSetting('weekly'), today), stat = (n, l) => h('div.dg', h('b', String(n)), h('span', l));
  const more = [dg.checked && plural(dg.checked, 'link') + ' checked', dg.merged && plural(dg.merged, 'merge'), dg.stage && plural(dg.stage, 'stage change')].filter(Boolean);
  const digest = h('section.tile', h('div.tile-h', h('span', 'This week'), h('span.tile-n', 'last 7 days')),
    h('div.dg-row', stat(dg.added, 'added'), stat(dg.opened, 'opened'), stat(dg.reviewed, 'reviewed'), stat(dg.learned, 'learned')),
    more.length ? h('p.dim.small', 'Also: ' + more.join(', ') + '.') : null,
    dg.picks ? h('p.small', 'Your picks from ' + fmtDate(dg.picks.at) + ': ' + dg.picks.done + ' of ' + dg.picks.total + ' done.') : null,
    h('p.dim.small', 'Opened counts different links. Reviewed, learned and checked come from each link\'s history, which Nexus only keeps since version 3.2.'));
  p.body.replaceChildren(h('div.rs',
    digest,
    h('section.tile', h('div.tile-h', h('span', 'Checklist'), h('span.tile-n.ok', nDone + ' of ' + steps.length + ' clear')), steps.map(stepRow)),
    h('section.tile', h('div.tile-h', h('span', 'Your ' + MAX_PICKS + ' for this week')),
      h('p.dim.small', 'Pick up to ' + MAX_PICKS + ' things to finish before the next reset. They stay on Home for 7 days.'),
      pickRows.length ? pickRows : h('p.dim.small', 'Nothing suggested. Add one yourself.'),
      h('div.row.wrap', { style: { marginTop: '8px' } },
        picks.length < MAX_PICKS ? btn('Add one', { cls: 'xs', icon: 'plus', onclick: async () => { const o = await pickDialog('Pick for this week', new Set(picks)); if (o) { picks.push(o.id); redraw(); } } }) : null,
        btn('Suggest again', { cls: 'xs ghost', onclick: () => { why.clear(); const s = suggestForWeek(); picks = s.map(x => x.rid); s.forEach(x => why.set(x.rid, x.why)); redraw(); } }))),
    h('div.row.wrap', { style: { justifyContent: 'center', margin: '4px 0 16px' } }, btn('Finish reset', { cls: 'pri', icon: 'check', onclick: () => finish(p) }))));
  if (p.scroller) p.scroller.scrollTop = keep;
}

function finish(p) {
  const today = todayISO(), w = store.getSetting('weekly'), cur = activePicks(w, today, id => !!store.byId(id));
  const days = resetDue(w, today, 1e6).days, ids = picks.filter(id => store.byId(id));
  const same = cur.length === ids.length && cur.every((x, i) => x.rid === ids[i]);
  store.setSetting('weekly', finishReset(same ? normWeekly(w) : setPicks(w, ids, today), today));
  if (days === null || days >= 3) game.award('reset', 1, 'Weekly reset');   // doing it twice in a day earns nothing extra
  sfx.feel('ok', [10, 25, 10]);
  draft = null;
  app.open.home();   // the picks live there; opening Home also closes this screen
  toast(ids.length ? 'Reset done. Your ' + ids.length + (ids.length === 1 ? ' pick is' : ' picks are') + ' on Home.' : 'Reset done.', { icon: 'check' });
}

store.on('change', redraw);
app.open.reset = openReset;
