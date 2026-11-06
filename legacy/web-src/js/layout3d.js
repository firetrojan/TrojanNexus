// layout3d.js - 3D force layout for the galaxy. No rendering code here.
// Sectors sit on a golden-angle spiral by their fixed `slot`, so adding a sector never moves the old ones.
// Resources are pulled to a shell around their sector sun, pushed apart by each other, and tied to related items.
import { hash32, rng } from './util.js';

export const SPIRAL = { c: 44, sx: 0.8, sz: 1.05 };   // taller than wide: fits a phone held upright
export function sectorAnchor(slot) {
  const k = slot + 0.5, a = k * 2.399963229728653, rad = SPIRAL.c * Math.sqrt(k);
  return [Math.cos(a) * rad * SPIRAL.sx, Math.sin(slot * 1.7) * 14 + Math.cos(slot * 0.6) * 6, Math.sin(a) * rad * SPIRAL.sz];
}
/** Best free slot for a new sector: the free spiral spot with the most room around it. */
export function pickSlot(jobs, nNew = 0) {
  const used = new Set(jobs.map(j => j.slot)), R0 = sectorRadius(nNew);
  const others = jobs.map(j => ({ a: sectorAnchor(j.slot), R: sectorRadius(j.members.length) }));
  let best = -1, bg = -1e9;
  for (let slot = 0; slot < 60; slot++) {
    if (used.has(slot)) continue;
    const a = sectorAnchor(slot); let g = 1e9;
    for (const o of others) g = Math.min(g, Math.hypot(a[0] - o.a[0], a[2] - o.a[2]) - R0 - o.R);
    const score = Math.min(g, 40) - slot * 0.35;           // roomy first, then close to the middle
    if (score > bg) { bg = score; best = slot; }
  }
  return best;
}
export const sectorRadius = n => 12 + 3.0 * Math.sqrt(Math.max(1, n));

const REP = 14, CUT2 = 36 * 36, K_SHELL = 0.14, K_LINK = 0.035, LINK_LEN = 15, DAMP = 0.8, VMAX = 3.2;

export class Layout {
  constructor() { this.nodes = []; this.byId = new Map(); this.links = []; this.sectors = []; this.secById = new Map(); this.alpha = 0; this.ready = false; }

  /** Rebuild node list from data. Keeps positions of existing nodes. `emerge` = new nodes start inside their sun. */
  sync(resources, jobs, emerge) {
    this.sectors = jobs.map(j => ({ id: j.id, name: j.name, color: j.color, sealed: j.sealed, slot: j.slot, n: j.members.length, anchor: sectorAnchor(j.slot), R: sectorRadius(j.members.length) }));
    this.secById = new Map(this.sectors.map(s => [s.id, s]));
    const memberOf = new Map();
    jobs.forEach(j => j.members.forEach(m => { if (!memberOf.has(m)) memberOf.set(m, []); memberOf.get(m).push(j.id); }));
    const keep = new Set(), nodes = [];
    for (const r of resources) {
      keep.add(r.id);
      let n = this.byId.get(r.id);
      const secs = (memberOf.get(r.id) || []).map(id => this.secById.get(id)).filter(Boolean);
      if (!n) {
        n = { id: r.id, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, fx: 0, fy: 0, fz: 0, cx: 0, cy: 0, cz: 0, R: 18, isNew: true };
        this.byId.set(r.id, n);
        this._center(n, secs);
        const g = rng(hash32(r.id)), u = g() * 2 - 1, ph = g() * 6.2832, s = Math.sqrt(1 - u * u);
        const rad = emerge ? 2 + g() * 3 : n.R * (0.7 + 0.5 * g());
        n.x = n.cx + s * Math.cos(ph) * rad; n.y = n.cy + u * rad; n.z = n.cz + s * Math.sin(ph) * rad;
      } else n.isNew = false;
      n.secIds = secs.map(s => s.id);
      this._center(n, secs);
      nodes.push(n);
    }
    for (const id of [...this.byId.keys()]) if (!keep.has(id)) this.byId.delete(id);
    this.nodes = nodes;
    this.links = []; const seen = new Set();
    for (const r of resources) for (const o of r.related) {
      const k = r.id < o ? r.id + '|' + o : o + '|' + r.id;
      if (!seen.has(k) && this.byId.has(o)) { seen.add(k); this.links.push([this.byId.get(r.id), this.byId.get(o)]); }
    }
    this.alpha = Math.max(this.alpha, emerge ? 0.5 : 1);
  }

  _center(n, secs) {
    if (!secs.length) { n.cx = 0; n.cy = -6; n.cz = 0; n.R = 22; return; }
    let x = 0, y = 0, z = 0, R = 0;
    for (const s of secs) { x += s.anchor[0]; y += s.anchor[1]; z += s.anchor[2]; R += s.R; }
    n.cx = x / secs.length; n.cy = y / secs.length; n.cz = z / secs.length;
    n.R = (R / secs.length) * (secs.length > 1 ? 0.55 : 1);
  }

  /** Run `steps` simulation steps. Returns true if anything moved. */
  tick(steps = 1) {
    if (this.alpha < 0.004) return false;
    const N = this.nodes, n = N.length;
    for (let s = 0; s < steps; s++) {
      const a = this.alpha;
      for (let i = 0; i < n; i++) { N[i].fx = 0; N[i].fy = 0; N[i].fz = 0; }
      for (let i = 0; i < n; i++) {
        const p = N[i];
        for (let j = i + 1; j < n; j++) {
          const q = N[j], dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
          let d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > CUT2) continue;
          d2 += 1.5;
          const f = REP / d2;
          p.fx += dx * f; p.fy += dy * f; p.fz += dz * f; q.fx -= dx * f; q.fy -= dy * f; q.fz -= dz * f;
        }
        const dx = p.x - p.cx, dy = p.y - p.cy, dz = p.z - p.cz, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
        const f = -K_SHELL * (d - p.R) / d;
        p.fx += dx * f; p.fy += dy * f; p.fz += dz * f;
      }
      for (const [p, q] of this.links) {
        const dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.001;
        const f = K_LINK * (d - LINK_LEN) / d;
        p.fx += dx * f; p.fy += dy * f; p.fz += dz * f; q.fx -= dx * f; q.fy -= dy * f; q.fz -= dz * f;
      }
      for (let i = 0; i < n; i++) {
        const p = N[i];
        p.vx = (p.vx + p.fx * a) * DAMP; p.vy = (p.vy + p.fy * a) * DAMP; p.vz = (p.vz + p.fz * a) * DAMP;
        const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
        if (sp > VMAX) { const k = VMAX / sp; p.vx *= k; p.vy *= k; p.vz *= k; }
        p.x += p.vx; p.y += p.vy; p.z += p.vz;
      }
      this.alpha *= 0.985;
    }
    return true;
  }

  /** Settle quickly (used at boot while the intro plays). */
  settle(steps = 220) { this.tick(steps); this.ready = true; }
}
