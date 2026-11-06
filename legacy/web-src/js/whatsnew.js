// whatsnew.js - the change list shown in Profile > What's new. Newest first. Keep each line plain and short.
export const VERSION = (typeof __BUILD__ === 'string' ? __BUILD__ : 'dev').split(' ')[0];
export const NEWS = [
  { v: 'v3.3', date: '2026-10-31', items: [
    'Sort faster: new links show "Keep in" chips (sectors you used lately and the best fits). "More" lists the rest.',
    'Go to: type a place on Home (backup, tags, reset, duplicates, install) and jump straight there.',
    'Home has "Continue" (what you looked at last) and Shelves: put a sector on Home as a row of buttons.',
    'Tidy up removes tracking junk from saved links and fixes messy titles. Tags manager: rename, join look-alikes, delete. Both have Undo.',
    'Did you mean: a typo in search gets a suggestion made only from your own words. New sector ideas group links that share a tag.',
    'Chrome: Install card (says plainly when it cannot install), a count on the app icon, keyboard keys (/ search, n add, ? list), optional site icons.',
    'The weekly reset opens with "This week": what you added, opened, reviewed and learned in the last 7 days.'
  ] },
  { v: 'v3.2', date: '2026-10-30', items: [
    'Missions: tick steps off and see progress. Home shows the next step of the mission you are on.',
    'Auto-sort: new links get a "Fits Newsroom" hint with the reason. Keep in it with one tap, or sort all the clear ones at once.',
    'Weekly reset: a short checklist plus 3 picks for the week, shown on Home. "Time I have": pick 10 min, 1 hour or Tired and get a short list.',
    'Quick review: swipe right to keep, left to archive. Merge links about the same thing (Insights, Loose ends, Merge).',
    'Each link now has "What I learned" (searchable) and a History of what happened to it from now on.',
    'Insights page: most used, sector balance, links you have not opened in 60 days, storage.',
    'Back up through the share sheet (Drive, email, a chat with yourself). Calendar button puts due dates in your phone calendar.',
    'Paste a link and voice search on Home. Text size setting. App shortcuts: long-press the app icon for Add, Search, Review, Due.'
  ] },
  { v: 'v3.1', date: '2026-10-28', items: ['Fixed a stray blue dot in the middle of the Galaxy map.'] },
  { v: 'v3.0', date: '2026-10-27', items: [
    'Home: one screen with search, what needs you, a launch pad, quick review and sectors.',
    'Re-importing an export skips links you have, and flags new pages on a site you already have.',
    'To review cards show the description, tags and details. Select many to confirm, tag, sort or archive.'
  ] }
];
