// jump.js - "Go to": type a few words in Home search and reach any screen or action. Pure logic: the list of places and the matcher.
// `run` is a key the screen maps to a real action (see ui/jump.js). Words are plain, the way you would say them.

export const COMMANDS = [
  { id: 'backup', label: 'Back up my data', sub: 'Save a copy off this phone', words: 'backup back up save copy export download safe', icon: 'download' },
  { id: 'restore', label: 'Restore a backup', sub: 'Bring a saved copy back', words: 'restore recover import backup file undo copy', icon: 'upload' },
  { id: 'safety', label: 'Safety copies', sub: 'Automatic copies made before big changes', words: 'safety snapshot undo recover lost copies', icon: 'lock' },
  { id: 'insights', label: 'Insights', sub: 'What you use and what you do not', words: 'insights stats numbers usage most used idle cull balance storage', icon: 'sigma' },
  { id: 'reset', label: 'Weekly reset', sub: 'A short checklist and 3 picks', words: 'weekly week reset review checklist picks routine', icon: 'check' },
  { id: 'dupes', label: 'Duplicates', sub: 'Merge links about the same thing', words: 'duplicates duplicate merge same site twice', icon: 'layers' },
  { id: 'tags', label: 'Tags', sub: 'Rename, merge or delete tags', words: 'tags tag rename merge clean labels', icon: 'tag' },
  { id: 'ideas', label: 'New sector ideas', sub: 'Groups of links that have no sector yet', words: 'ideas suggest sectors group organise organize new categories', icon: 'sectors' },
  { id: 'tidy', label: 'Tidy up links', sub: 'Remove tracking junk and fix bad titles', words: 'tidy clean links tracking utm titles fix junk', icon: 'spark' },
  { id: 'import', label: 'Import links', sub: 'Bookmarks, Instagram list, CSV, OPML', words: 'import bookmarks instagram csv opml upload file', icon: 'upload' },
  { id: 'add', label: 'Add a link', sub: 'Save a new link', words: 'add new link save paste create', icon: 'plus' },
  { id: 'review', label: 'Review new links', sub: 'The links waiting for you', words: 'review inbox new unreviewed drafts waiting confirm', icon: 'scan' },
  { id: 'due', label: 'What is due', sub: 'Checks, trials, limits, changes', words: 'due alerts overdue today trials checks needs', icon: 'alert' },
  { id: 'stale', label: 'Old links', sub: 'Not checked in a while', words: 'old stale unchecked outdated', icon: 'clock' },
  { id: 'missions', label: 'Missions', sub: 'Your step-by-step routes', words: 'missions mission route steps threads plan', icon: 'mission' },
  { id: 'sectors', label: 'Sectors', sub: 'Your sectors in columns', words: 'sectors sector folders groups columns', icon: 'sectors' },
  { id: 'vault', label: 'Vault', sub: 'Every link in one table', words: 'vault table all links list filter sort', icon: 'library' },
  { id: 'galaxy', label: 'Galaxy', sub: 'The 3D map', words: 'galaxy map 3d space stars', icon: 'target' },
  { id: 'calendar', label: 'Put dates in my calendar', sub: 'Due dates, trial ends, limit resets', words: 'calendar dates reminders ics schedule trial', icon: 'clock' },
  { id: 'focus', label: 'Focus run', sub: 'A timed work session', words: 'focus timer run session work pomodoro', icon: 'play' },
  { id: 'profile', label: 'Profile and settings', sub: 'Theme, text size, open on, lookups', words: 'profile settings theme dark light text size options preferences open on', icon: 'core' },
  { id: 'whatsnew', label: "What's new", sub: 'What changed in this version', words: 'whats new changes version update release notes', icon: 'star' },
  { id: 'install', label: 'Install the app', sub: 'Add Nexus to your home screen', words: 'install app home screen chrome pwa shortcut', icon: 'download' }
];

const STOP = new Set(['how', 'do', 'i', 'my', 'the', 'a', 'an', 'to', 'can', 'where', 'is', 'go', 'show', 'me', 'please', 'want', 'open', 'take', 'find', 'need', 'get', 'of', 'and', 'for', 'in']);
const words = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

/**
 * The places that match what was typed, best first (at most n). Every word typed must match the start of a word in the
 * name (best) or in the keywords. A normal question such as "can I turn a PDF into slides" matches nothing here.
 * `has(id)` lets the screen leave out places that do not exist in this build.
 */
export function jumpMatches(query, n = 4, has = () => true, commands = COMMANDS) {
  const toks = words(query).filter(t => !STOP.has(t));
  if (!toks.length || toks.join('').length < 2) return [];
  const out = [];
  for (const c of commands) {
    if (!has(c.id)) continue;
    const label = words(c.label), kw = words(c.words);
    let score = 0, all = true;
    for (const t of toks) {
      let best = 0;
      if (label.join('').startsWith(t) || label[0].startsWith(t)) best = 3;   // "backup" also starts "Back up my data"
      else if (label.some(w => w.startsWith(t))) best = 2.5;
      else if (kw.some(w => w.startsWith(t))) best = 1.5;
      if (!best) { all = false; break; }
      score += best;
    }
    if (all) out.push({ c, score });
  }
  return out.sort((a, b) => b.score - a.score || a.c.label.localeCompare(b.c.label)).slice(0, n).map(x => x.c);
}
