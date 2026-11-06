// ui/fit.js - "fits this sector" hints and the one-tap Auto-sort for unreviewed links. The logic is in ../suggest.js.
import { h, plural } from '../util.js';
import * as store from '../store.js';
import { buildProfiles, suggest, suggestMany, suggestTop } from '../suggest.js';
import { sectorChoices } from '../choices.js';
import { chip, toast, confirmBox, actionSheet } from './kit.js';
import { offerUndo } from './safety.js';

export const profiles = () => buildProfiles(store.state.jobs, store.byId);
export const fitFor = (r, prof = profiles()) => suggest(r, prof, store.jobsOf);

/** One line: Fits [Sector] and why. Marked "Could fit" when two sectors are close. */
export function fitLine(s) {
  if (!s) return null;
  return h('div.fit', h('span.fit-l', s.unsure ? 'Could fit' : 'Fits'), chip(s.job.name, { dot: true, color: s.job.color }),
    s.unsure && s.also[0] ? h('span.dim.small', 'or ' + s.also[0].name) : null, s.why.length ? h('span.dim.small.fit-why', s.why.join(' · ')) : null);
}

/**
 * "Keep in" buttons for a link that has no sector yet: best fits, then sectors you used lately, then the biggest. One tap places it.
 * place(job) does the rest (keep it, say so, offer Undo). Returns null when the link already has a sector or there is nothing to offer.
 */
export function choiceRow(r, place, prof = profiles()) {
  if (store.jobsOf(r.id).some(j => !j.rule)) return null;
  const choices = sectorChoices(r, store.state.jobs, { fits: suggestTop(r, prof, store.jobsOf, 2).map(x => x.job), recent: store.getSetting('recentJobs') }, 4);
  if (!choices.length) return null;
  const go = j => { store.noteJobUsed(j.id); place(j); };
  const all = store.state.jobs.filter(j => !j.rule).sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name));
  return h('div.sc-sect', h('span.fit-l', 'Keep in'),
    h('div.chips', choices.map(c => chip(c.job.name, { dot: true, color: c.job.color, cls: c.kind === 'fit' ? 'good' : '', onclick: () => go(c.job) })),
      all.length > choices.length ? chip('More…', { cls: 't', onclick: () => actionSheet({ title: 'Keep in which sector?', items: all.map(j => ({ label: j.name, sub: j.members.length + (j.members.length === 1 ? ' link' : ' links'), run: () => go(j) })) }) }) : null));
}

/** Links with a clear fit, from this list (unreviewed, no sector of their own yet). */
export function clearFits(list) { return suggestMany(list, store.state.jobs, store.byId, store.jobsOf); }

/** Ask once, then place every clear fit. The links stay in To review. */
export async function sortAll(list, after) {
  const fits = clearFits(list);
  if (!fits.length) return toast('No clear fits right now.', { icon: 'info' });
  const by = new Map(); fits.forEach(({ s }) => by.set(s.job.name, (by.get(s.job.name) || 0) + 1));
  const top = [...by].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, c]) => n + ' ' + c).join(', ');
  if (!(await confirmBox({ title: 'Sort ' + plural(fits.length, 'link') + '?', text: 'Each goes into the sector it matches best (' + top + (by.size > 4 ? ' and more' : '') + '). They stay in To review, so nothing is confirmed. On your own sorted links this is right about 9 times in 10. A safety copy is saved first, with Undo.', ok: 'Sort them' }))) return;
  const n = store.placeMany(fits.map(({ r, s }) => [r.id, s.job.id]));
  offerUndo('Before auto-sort', plural(n, 'link') + ' sorted into sectors.');
  if (after) after();
}
