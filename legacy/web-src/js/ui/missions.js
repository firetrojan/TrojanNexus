// ui/missions.js - threads as missions: ordered steps through your own resources. "Fly through" lights a gold route in the galaxy.
import { h, domainOf, plural } from '../util.js';
import { progress } from '../mission.js';
import { openResource } from './launch.js';
import { icon } from '../icons.js';
import * as store from '../store.js';
import * as game from '../game.js';
import * as sfx from '../sfx.js';
import { app } from './app.js';
import { copyMissionAsTask } from './share.js';
import { openPanel, getPanel, btn, chip, ico, toast, promptBox, confirmBox, pickDialog, actionSheet, monogram, openLink } from './kit.js';

let cur = null, bar = null;
export function openMissions(tid) {
  cur = tid || null; if (cur) store.noteVisit('m', cur);
  return openPanel('missions', { kind: 'view', title: 'Missions', render: draw });
}
const redraw = () => { const p = getPanel('missions'); if (p) p.render(); };

function draw(p) {
  const t = cur && store.threadById(cur);
  if (!t) { cur = null; return drawList(p); }
  drawThread(p, t);
}

function drawList(p) {
  p.setTitle('Missions'); p.setLeft(); p.setActions(btn('', { cls: 'ghost icon', icon: 'plus', title: 'New mission', onclick: newMission }));
  const ts = store.state.threads;
  p.body.replaceChildren(h('div.stack',
    h('div.hint', 'A mission is an ordered route through your own resources, the way you actually work a problem. Open one and fly through it: the galaxy lights a path from step to step.'),
    ts.length ? h('div.list', ts.map(t => h('div.card.mis', { role: 'button', tabindex: '0', onclick: () => { cur = t.id; store.noteVisit('m', cur); redraw(); } },
      h('span.mono-ic', { style: { '--c': 'var(--orange)', '--s': '40px' }, html: icon('mission') }),
      h('div.grow', h('div.t', t.name), h('div.s', stepsLine(t) + (t.note ? ' · ' + t.note : '')), progBar(t),
        h('div.meta', t.steps.slice(0, 3).map(s => { const r = store.byId(s.rid); return r ? chip(r.title.length > 18 ? r.title.slice(0, 17) + '…' : r.title) : null; }))),
      btn('', { cls: 'icon', icon: 'play', title: 'Fly through', onclick: e => { e.stopPropagation(); fly(t); } }))))
      : h('div.empty', h('div.big', { html: icon('mission', 'lg') }), h('b', 'No missions yet'), h('p', 'Create one, then add steps from any resource card.'), btn('New mission', { cls: 'pri', icon: 'plus', onclick: newMission }))));
}

function drawThread(p, t) {
  p.setTitle(t.name); p.setLeft(btn('Missions', { cls: 'ghost', icon: 'back', onclick: () => { cur = null; redraw(); } }));
  p.setActions(btn('', { cls: 'ghost icon', icon: 'more', title: 'Options', onclick: () => actionSheet({ title: t.name, items: [{ label: 'Copy as task', sub: 'One task with a checklist, for your to-do app', icon: 'copy', run: () => copyMissionAsTask(t) }, { label: store.getSetting('activeMission') === t.id ? 'This is your Home mission' : 'Show this on Home', sub: 'The mission Home shows the next step of', icon: 'star', run: () => { store.setSetting('activeMission', t.id); toast('Home will show this mission.', { icon: 'star' }); redraw(); } }, { label: 'Start over', sub: 'Untick every step', icon: 'play', run: () => startOver(t) }, { label: 'Rename or add a note', icon: 'edit', run: () => rename(t) }, { label: 'Delete mission', icon: 'trash', danger: true, run: () => del(t) }] }) }));
  const steps = t.steps.map((s, i) => ({ s, i, r: store.byId(s.rid) })).filter(x => x.r);
  p.body.replaceChildren(h('div.stack',
    t.note ? h('p.dim', t.note) : null,
    steps.length ? h('div.mprog', progBar(t), h('span.dim.small', stepsLine(t))) : null,
    h('div.d-acts', btn('Fly through', { cls: 'pri', icon: 'play', disabled: !steps.length, onclick: () => fly(t) }), btn('Add step', { icon: 'plus', onclick: () => addStep(t) })),
    steps.length ? h('div.tl', steps.map(({ s, i, r }) => h('div.step' + (s.done ? '.done' : ''), h('button.num' + (s.done ? '.on' : ''), { type: 'button', 'aria-pressed': String(!!s.done), 'aria-label': (s.done ? 'Mark step ' + (i + 1) + ' not done' : 'Mark step ' + (i + 1) + ' done'), onclick: () => toggleStep(t, i), html: s.done ? icon('check', 'sm') : String(i + 1) }),
      h('div.sbody', h('div.row', monogram(r, 36), h('div.grow', h('div.t', r.title), h('div.s', domainOf(r.url) || r.tags.slice(0, 2).join(', ')))),
        h('textarea.ta.snote', { rows: 2, placeholder: 'What do you do at this step?', onchange: e => store.setStepNote(t.id, i, e.target.value) }, s.note || ''),
        h('div.row.wrap', btn('', { cls: 'xs icon', icon: 'up', title: 'Move up', disabled: i === 0, onclick: () => store.moveStep(t.id, i, -1) }), btn('', { cls: 'xs icon', icon: 'down', title: 'Move down', disabled: i === t.steps.length - 1, onclick: () => store.moveStep(t.id, i, 1) }),
          r.url ? btn('Open', { cls: 'xs', icon: 'open', onclick: () => openResource(r) }) : null, btn('Details', { cls: 'xs', icon: 'eye', onclick: () => app.open.detail(r.id) }), h('span.grow'), btn('', { cls: 'xs icon', icon: 'close', title: 'Remove step', onclick: () => store.removeStep(t.id, i) }))))))
      : h('div.empty', h('b', 'No steps yet'), h('p', 'Add the first resource of this mission.'))));
}

export const stepsLine = t => { const p = progress(t, id => !!store.byId(id)); return !p.total ? 'No steps yet' : p.complete ? 'All ' + p.total + ' done' : p.done + ' of ' + plural(p.total, 'step') + ' done'; };
export const progBar = t => { const p = progress(t, id => !!store.byId(id)); return p.total ? h('div.pbar' + (p.complete ? '.full' : ''), { role: 'progressbar', 'aria-valuenow': String(p.pct), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('i', { style: { width: p.pct + '%' } })) : null; };
/** Tick a step off or back on. Finishing the last one is a small moment of its own. */
export function toggleStep(t, i) {
  const st = t.steps[i], r = st && store.byId(st.rid); if (!st) return;
  const was = progress(t, id => !!store.byId(id)).complete;
  store.setStepDone(t.id, i, !st.done);
  if (!st.done) { redraw(); return; }
  game.award('step', 1, r ? r.title.slice(0, 30) : 'step'); sfx.feel('ok', [10, 20]);
  const now = progress(t, id => !!store.byId(id));
  if (now.complete && !was) { game.award('missionDone', 1, t.name.slice(0, 30)); toast('Mission complete: ' + t.name, { icon: 'check', ms: 4200 }); sfx.feel('ok', [20, 30, 40]); }
}
async function startOver(t) { if (await confirmBox({ title: 'Start "' + t.name + '" over?', text: 'Every step is unticked. Your notes stay.', ok: 'Start over' })) { store.resetThread(t.id); toast('All steps unticked.', { icon: 'check' }); } }

async function newMission() {
  const v = await promptBox({ title: 'New mission', fields: [{ key: 'name', label: 'Name', placeholder: 'e.g. Check a claim' }], ok: 'Create' });
  if (!v || !v.name.trim()) return;
  const t = store.addThread(v.name); game.award('thread', 1, t.name); cur = t.id; redraw(); sfx.feel('ok');
}
async function rename(t) { const v = await promptBox({ title: 'Rename mission', fields: [{ key: 'name', label: 'Name', value: t.name }, { key: 'note', label: 'Note', type: 'textarea', rows: 2, value: t.note || '' }], ok: 'Save' }); if (v) { store.renameThread(t.id, v.name); t.note = v.note; store.save(); redraw(); } }
async function del(t) { if (await confirmBox({ title: 'Delete "' + t.name + '"?', text: 'The resources stay. Only the route is removed.', ok: 'Delete', danger: true })) { store.deleteThread(t.id); cur = null; if (app.route && app.route.id === t.id) stopRoute(); toast('Mission deleted.', { icon: 'trash' }); } }
async function addStep(t) { const r = await pickDialog('Add a step', new Set(t.steps.map(s => s.rid))); if (r) { store.addStep(t.id, r.id); sfx.feel('ok'); } }

// ---------- flying a route ----------
export function fly(t) {
  const ids = t.steps.map(s => s.rid).filter(id => store.byId(id));
  if (!ids.length) return toast('Add a step first.', { icon: 'info' });
  app.open.closeViews(); if (app.open.closeDetail) app.open.closeDetail();
  app.route = { id: t.id, name: t.name, ids, step: 0 };
  if (app.scene && app.ok) { app.scene.setRoute(ids); app.scene.frameIds(ids); }
  app.emit('route'); showBar(); sfx.feel('open');
}
export function stopRoute() { app.route = null; if (app.scene && app.ok) { app.scene.setRoute(null); app.scene.clearSelection(); } if (bar) { bar.remove(); bar = null; } app.emit('route'); }
function go(i) {
  const r = app.route; if (!r) return;
  r.step = Math.max(0, Math.min(r.ids.length - 1, i)); const id = r.ids[r.step];
  if (app.scene && app.ok) app.scene.select(id, { fly: true });
  showBar(); sfx.feel('tap', 6);
}
function showBar() {
  const r = app.route; if (!r) return;
  const t = store.threadById(r.id), step = t && t.steps.find(s => s.rid === r.ids[r.step]), res = store.byId(r.ids[r.step]);
  const el = h('div.mbar', btn('', { cls: 'icon sm', icon: 'back', disabled: r.step === 0, onclick: () => go(r.step - 1) }),
    h('div.grow', h('div.t.ell', r.name + ' · ' + (r.step + 1) + '/' + r.ids.length), h('div.s', res ? res.title : ''), step && step.note ? h('div.s.note', step.note) : null),
    res && res.url ? btn('', { cls: 'icon sm', icon: 'open', title: 'Open', onclick: () => openResource(res) }) : null,
    t && step ? btn('', { cls: 'icon sm' + (step.done ? ' pri' : ''), icon: 'check', title: step.done ? 'Step is done' : 'Mark step done', onclick: () => { const j = t.steps.indexOf(step); if (!step.done) { toggleStep(t, j); if (r.step < r.ids.length - 1) go(r.step + 1); else showBar(); } else { store.setStepDone(t.id, j, false); showBar(); } } }) : null,
    btn('', { cls: 'icon sm pri', icon: 'fwd', disabled: r.step === r.ids.length - 1, onclick: () => go(r.step + 1) }),
    btn('', { cls: 'icon sm ghost', icon: 'close', title: 'End mission', onclick: stopRoute }));
  if (bar) bar.replaceWith(el); else document.getElementById('hud').appendChild(el); bar = el;
}
store.on('change', () => { const p = getPanel('missions'); if (p) p.render(); });
app.open.missions = openMissions; app.open.flyMission = fly;
