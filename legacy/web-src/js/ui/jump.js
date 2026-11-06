// ui/jump.js - "Go to": what each place in jump.js actually does. Used by Home search, so any screen is one short word away.
import { jumpMatches } from '../jump.js';
import { app } from './app.js';
import { canShareFiles, FRAMED } from './kit.js';

const O = () => app.open;
export const RUN = {
  backup: () => O().backupNow(FRAMED ? 'copy' : (canShareFiles() ? 'share' : 'file')),
  restore: () => O().core(), safety: () => O().snapshots(), insights: () => O().insights(), reset: () => O().reset(), dupes: () => O().dupes(),
  tags: () => O().tags(), ideas: () => O().ideas(), tidy: () => O().tidy(), import: () => O().import(), add: () => O().quickadd(),
  review: () => O().alerts('scan'), due: () => O().alerts(), stale: () => O().alerts('stale'),
  missions: () => O().missions(), sectors: () => O().sectors(), vault: () => O().vault(), galaxy: () => O().closeViews(),
  calendar: () => O().exportCalendar(), focus: () => O().focus(), profile: () => O().core(), whatsnew: () => O().whatsNew(), install: () => O().install()
};
// places that only exist once their screen is loaded (so a missing one is simply not offered)
const NEEDS = { tags: 'tags', tidy: 'tidy', ideas: 'ideas', install: 'install' };
const exists = id => id in RUN && (!NEEDS[id] || !!O()[NEEDS[id]]);

/** The places matching what was typed (at most 4). */
export const goMatches = q => jumpMatches(q, 4, exists);
export const runJump = id => { try { const f = RUN[id]; if (f) f(); } catch (e) { console.error(e); } };
