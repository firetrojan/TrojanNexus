// ui/focus.js - the daily focus run: a 20-30 minute timer for your YouTube session (or anything). Survives a page reload.
import { h } from '../util.js';
import * as store from '../store.js';
import * as game from '../game.js';
import * as sfx from '../sfx.js';
import { app } from './app.js';
import { toast, promptBox, actionSheet } from './kit.js';

const KEY = 'nexus.focus';
let run = null, timer = null;
const save = () => { try { run ? localStorage.setItem(KEY, JSON.stringify(run)) : localStorage.removeItem(KEY); } catch (e) { /* ignore */ } };
const fmt = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

export function status() {
  if (!run) return null;
  const left = run.end - Date.now(), total = run.minutes * 60000;
  return { label: fmt(left), left, pct: Math.max(0, Math.min(100, Math.round(100 * (1 - left / total)))), goal: run.goal, minutes: run.minutes, elapsedMin: (total - left) / 60000 };
}
function tick() {
  if (!run) return;
  if (Date.now() >= run.end) return finish(true);
  if (app.hud) app.hud.refresh();
}
function arm() { clearInterval(timer); timer = run ? setInterval(tick, 1000) : null; }
export function init() {
  try { const x = JSON.parse(localStorage.getItem(KEY) || 'null'); if (x && x.end && x.minutes) run = x; } catch (e) { run = null; }
  if (run && Date.now() >= run.end) { const late = Date.now() - run.end; if (late < 3 * 3600e3) finish(true, true); else { run = null; save(); } }
  arm();
}
export function start(minutes, goal) { run = { end: Date.now() + minutes * 60000, minutes, goal: goal || '', started: Date.now() }; save(); arm(); sfx.feel('open', [15, 30, 15]); if (app.hud) app.hud.refresh(); }
export function stop() { run = null; save(); arm(); if (app.hud) app.hud.refresh(); }
function finish(full, late) {
  const r = run, mins = full ? r.minutes : Math.floor((Date.now() - r.started) / 60000); run = null; save(); arm();
  if (app.hud) app.hud.refresh();
  if (mins < 5) return;
  const res = game.focusDone(mins); sfx.feel('done', [30, 60, 30, 60, 30]);
  const yt = store.byId('hub-youtube');
  toast('', { html: '<b>Focus run complete</b> &middot; ' + mins + ' min' + (late ? ' (finished while you were away)' : '') + '.', icon: 'check', kind: 'xp', ms: 7000,
    action: yt ? { label: 'Mark YouTube checked', fn: () => { store.markChecked('hub-youtube'); game.award('check', 1, 'YouTube'); } } : null });
}

export async function openFocus() {
  const s = status();
  if (s) {
    actionSheet({ title: 'Focus run · ' + s.label + ' left', sub: s.goal ? 'Fixing: ' + s.goal : 'Stay with one thing.', items: [
      { label: 'Finish now' + (s.elapsedMin < 20 ? ' (under 20 min counts as a short run)' : ''), icon: 'check', run: () => finish(false) },
      { label: 'Cancel this run', icon: 'close', danger: true, run: () => { stop(); toast('Run cancelled. No penalty.', { icon: 'info' }); } },
      { label: 'Keep going', icon: 'play' }] });
    return;
  }
  const v = await promptBox({ title: 'Focus run', text: '20-30 minutes, focused. Fix an internal issue, a method, a learning-method problem or a resource problem. Not noise, not study.', fields: [
    { key: 'goal', label: 'What are you fixing? (optional)', placeholder: 'e.g. my note-taking method' },
    { key: 'minutes', label: 'Length', type: 'select', value: '25', options: [{ v: '20', l: '20 minutes' }, { v: '25', l: '25 minutes' }, { v: '30', l: '30 minutes' }] }], ok: 'Start' });
  if (v) { start(parseInt(v.minutes, 10) || 25, v.goal.trim()); toast('Run started. Go. I will tell you when time is up.', { icon: 'play' }); }
}
app.focus = { status, start, stop, init }; app.open.focus = openFocus;
