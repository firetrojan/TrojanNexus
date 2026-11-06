// ui/app.js - the one shared object the UI modules use to find each other (no circular imports).
import { emitter } from '../util.js';

const bus = emitter();
export const app = {
  scene: null, ok: false,
  open: {},                 // filled by modules: detail, search, quickadd, sectors, vault, missions, alerts, core, focus
  hl: null, hlLabel: '',    // ids currently lit in the galaxy (search result etc.)
  route: null,              // {id, name, ids, step} while a mission is being flown
  on: bus.on, emit: bus.emit
};

export function setHighlight(ids, label) {
  app.hl = ids && ids.length ? new Set(ids) : null; app.hlLabel = label || '';
  if (app.scene && app.ok) app.scene.setHighlight(app.hl);
  bus.emit('hl');
}
export const clearHighlight = () => setHighlight(null);

/** Show a node in the galaxy: closes full-screen views, flies there, selects it. */
export function showInGalaxy(id) {
  if (app.open.closeViews) app.open.closeViews();
  if (app.scene && app.ok) app.scene.select(id, { fly: true });
  bus.emit('select', { kind: 'node', id });
}
