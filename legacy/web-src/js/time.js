// time.js - "how much time do I have?" turns what is waiting into a short list. Pure logic: no DOM, no store.
// It does not guess how long a job takes. It limits how MANY jobs you get, so a short list stays short.

export const MODES = [{ v: 'quick', l: '10 min' }, { v: 'hour', l: '1 hour' }, { v: 'tired', l: 'Tired' }];

const many = (n, one, more) => n + ' ' + (n === 1 ? one : more);

/**
 * c: { drafts, easy (to-review links that already show a description), attention (due + trials + limits + changed pages),
 *      overdueTrials, missionLeft, missionName, stale, backupDue }
 * Returns { lead, items: [{ id: 'needs' | 'mission' | 'review' | 'stale' | 'backup', text }] }. id says where "Go" takes you.
 */
export function timePlan(mode, c) {
  const items = [], add = (id, text) => items.push({ id, text });
  const left = c.missionLeft || 0;
  let lead;
  if (mode === 'quick') {
    lead = 'Short on time. Do these, then stop.';
    if (c.attention > 0) add('needs', 'Clear ' + many(Math.min(3, c.attention), 'thing', 'things') + ' from Needs you' + (c.attention > 3 ? ' (' + c.attention + ' waiting)' : ''));
    if (left > 0) add('mission', 'Do the next step of ' + (c.missionName || 'your mission'));
    if (c.drafts > 0) add('review', 'Review ' + many(Math.min(5, c.drafts), 'new link', 'new links') + (c.drafts > 5 ? ' (' + c.drafts + ' waiting)' : ''));
  } else if (mode === 'hour') {
    lead = 'A full hour. In this order:';
    if (c.backupDue) add('backup', 'Back up your data');
    if (c.attention > 0) add('needs', 'Clear ' + (c.attention > 8 ? 'the first 8 of ' + c.attention : 'all ' + c.attention) + ' in Needs you');
    if (left > 0) add('mission', 'Do the next ' + many(Math.min(3, left), 'step', 'steps') + ' of ' + (c.missionName || 'your mission'));
    if (c.drafts > 0) add('review', 'Review ' + many(Math.min(15, c.drafts), 'new link', 'new links') + (c.drafts > 15 ? ' (' + c.drafts + ' waiting)' : ''));
    if (c.stale > 0) add('stale', 'Look at ' + many(Math.min(5, c.stale), 'old resource', 'old resources'));
  } else {
    lead = 'Tired. Only easy jobs: one tap each, no thinking.';
    if (c.overdueTrials > 0) add('needs', 'Decide on ' + many(c.overdueTrials, 'trial', 'trials') + ' that already ended. They can cost money.');
    if (c.easy > 0) add('review', 'Keep or archive ' + many(Math.min(5, c.easy), 'link', 'links') + ' that already show what they are');
  }
  if (!items.length) lead = mode === 'tired' ? 'Nothing easy is waiting. Rest.' : 'Nothing is waiting. You are clear.';
  return { lead, items };
}
