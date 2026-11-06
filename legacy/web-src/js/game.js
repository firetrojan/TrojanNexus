// game.js - quiet progress layer: XP, rank, badges, focus runs.
// Design rule: no streak guilt, no loss messages. Progress only goes up. "Active days" is a plain count.
import * as store from './store.js';
import { todayISO } from './util.js';

export const RANKS = ['Cadet', 'Pilot', 'Navigator', 'Cartographer', 'Captain', 'Commander', 'Admiral', 'Architect'];
export const XP = { add: 6, review: 4, check: 10, archive: 3, thread: 10, step: 4, missionDone: 25, link: 3, backup: 20, focus20: 15, focus30: 25, sector: 8, import: 1, scan: 1, reset: 15 };

export const levelStart = l => Math.round(30 * Math.pow(Math.max(0, l - 1), 1.6));
export function levelOf(xp) { let l = 1; while (levelStart(l + 1) <= xp) l++; return l; }
export const rankOf = level => RANKS[Math.min(RANKS.length - 1, Math.floor((level - 1) / 3))];

export const BADGES = [
  { id: 'first-contact', name: 'First Contact', desc: 'Add your first own resource', test: c => c.counters.adds >= 1 },
  { id: 'watchkeeper', name: 'Watchkeeper', desc: 'Check 5 resources', test: c => c.counters.checks >= 5 },
  { id: 'cartographer', name: 'Cartographer', desc: 'Review 25 resources', test: c => c.counters.reviews >= 25 },
  { id: 'full-atlas', name: 'Full Atlas', desc: 'Clear every "To review" item', test: c => c.stats.total >= 10 && c.stats.drafts === 0 && c.counters.reviews >= 1 },
  { id: 'archivist', name: 'Archivist', desc: 'Export a backup', test: c => c.counters.backups >= 1 },
  { id: 'route-maker', name: 'Route Maker', desc: 'Create a mission', test: c => c.counters.threads >= 1 },
  { id: 'finisher', name: 'Finisher', desc: 'Complete every step of a mission', test: c => c.counters.missions >= 1 },
  { id: 'founder', name: 'Sector Founder', desc: 'Create your own sector', test: c => c.counters.sectors >= 1 },
  { id: 'broadcast', name: 'Broadcast', desc: 'Import 10 links at once', test: c => c.counters.imported >= 10 },
  { id: 'deep-focus', name: 'Deep Focus', desc: 'Finish 3 focus runs', test: c => c.game.focus.length >= 3 },
  { id: 'clear-sky', name: 'Clear Sky', desc: 'No overdue signals', test: c => c.counters.checks >= 1 && c.stats.overdue === 0 }
];

function g() {
  const x = store.state.game;
  if (typeof x.xp !== 'number') x.xp = 0;
  if (!Array.isArray(x.days)) x.days = [];
  if (!Array.isArray(x.focus)) x.focus = [];
  if (!Array.isArray(x.log)) x.log = [];
  if (!x.badges || typeof x.badges !== 'object') x.badges = {};
  if (!x.counters) x.counters = {};
  for (const k of ['adds', 'checks', 'reviews', 'imported', 'backups', 'sectors', 'threads', 'links', 'steps', 'missions']) if (typeof x.counters[k] !== 'number') x.counters[k] = 0;
  return x;
}

export function progress() {
  const x = g(), level = levelOf(x.xp), a = levelStart(level), b = levelStart(level + 1);
  return { xp: x.xp, level, rank: rankOf(level), into: x.xp - a, span: b - a, pct: Math.round(100 * (x.xp - a) / (b - a)), days: x.days.length, badges: Object.keys(x.badges).length };
}

/** award('check') or award('import', 12). Returns {gain, levelUp, newBadges}. Emits store event 'game'. */
export function award(kind, times = 1, label = '') {
  const x = g(), before = levelOf(x.xp), today = todayISO();
  const countKey = { add: 'adds', check: 'checks', review: 'reviews', import: 'imported', backup: 'backups', sector: 'sectors', thread: 'threads', link: 'links', step: 'steps', missionDone: 'missions' }[kind];
  if (countKey) x.counters[countKey] += times;
  let gain = (XP[kind] || 0) * times;
  if (kind === 'import' || kind === 'scan') gain = Math.min(20, gain);
  x.xp += gain;
  if (!x.days.includes(today)) x.days.push(today);
  x.log.unshift({ t: Date.now(), kind, gain, label }); x.log.length = Math.min(x.log.length, 30);
  const newBadges = unlock();
  const after = levelOf(x.xp);
  store.save();
  const out = { gain, kind, label, levelUp: after > before ? { level: after, rank: rankOf(after), rankUp: rankOf(after) !== rankOf(before) } : null, newBadges };
  store.emit('game', out);
  return out;
}

/** Record a finished focus run (minutes). 20+ min counts, 30+ earns more. */
export function focusDone(minutes) {
  const x = g(); x.focus.push({ date: todayISO(), minutes: Math.round(minutes) });
  if (x.focus.length > 400) x.focus.splice(0, x.focus.length - 400);
  return award(minutes >= 30 ? 'focus30' : (minutes >= 20 ? 'focus20' : 'review'), 1, 'Focus run ' + Math.round(minutes) + ' min');
}
export const focusToday = () => g().focus.filter(f => f.date === todayISO()).reduce((s, f) => s + f.minutes, 0);

export function unlock() {
  const x = g(), ctx = { game: x, counters: x.counters, stats: store.stats() }, fresh = [];
  for (const b of BADGES) if (!x.badges[b.id] && b.test(ctx)) { x.badges[b.id] = todayISO(); fresh.push(b); }
  return fresh;
}
