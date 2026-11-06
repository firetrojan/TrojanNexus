// scene.js - the galaxy view. Sectors are suns, resources are worlds around them, related items are linked by beams.
// The UI talks to it through: setData, select, selectSector, setHighlight, setRoute, home, frameIds, pulse, setTheme, setPaused.
import { THREE, SPEC, makeAttrs, instGeo, sharedUniforms, nodeMaterial, sunMaterial, haloMaterial, setBlend, edgeMaterial, makeStars, makeSky, Edges } from './gfx.js';
import { Layout } from './layout3d.js';
import { Controls } from './controls.js';
import { hash32, clamp } from './util.js';
import { dueBucket } from './store.js';

// planet shapes by type, kept close to round so they read as worlds (k = 2 is a sphere)
const SHAPES = { 'article-site': [2, 1], 'web-tool': [1.6, 1], 'youtube-channel': [3.2, 1], 'ai-source': [1.8, 1.1], social: [1.5, 1.5], community: [2.2, 1.2], feed: [1.6, 1.5], catalogue: [2.6, 0.75], docs: [3, 0.9], other: [2, 0.85] };
export const hexRGB = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const ROUTE = [0.04, 0.52, 1], NEUTRAL = hexRGB('#8E8E93');   // iOS blue for routes, iOS gray for unsorted worlds
const FOG = { dark: [0.012, 0.016, 0.035], light: [0.949, 0.949, 0.969] };   // deep space blue-black / the light page background (#F2F2F7)
const RING = { dark: [1, 1, 1], light: [0.11, 0.11, 0.12] };

export class GalaxyScene {
  constructor(canvas, labelRoot) {
    Object.assign(this, {
      canvas, labelRoot, ok: false, time: 0, paused: false, light: false, quality: 'auto', error: '', slowN: 0, lowfx: false,
      layout: new Layout(), order: [], index: new Map(), spawnById: new Map(), titles: [], scales: [], hl: null, routeIds: null,
      sel: null, hover: null, cb: {}, pr: 1, maxPR: 1, frameMs: 16, lastPR: 0, follow: 0, nodeCap: 0, sectorList: [], tethers: true, w: 1, h: 1,
      secLabels: new Map(), nodeLabels: [], nbrs: new Set(), pulseN: 0, last: 0, edgeMeta: [], tethMeta: [], lblRects: new Map()
    });
  }

  init(quality = 'auto') {
    let r;
    try {
      r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: (window.devicePixelRatio || 1) < 1.6, alpha: false, powerPreference: 'high-performance', stencil: false });
    } catch (e) { this.error = String((e && e.message) || e); return false; }
    this.renderer = r; r.outputColorSpace = THREE.LinearSRGBColorSpace; r.setClearColor(0x000000, 1);
    this.setQuality(quality, true);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.5, 4200); this.camera.position.set(0, 220, 520);
    this.U = sharedUniforms();
    this.icoBase = new THREE.IcosahedronGeometry(1, 2); this.planeBase = new THREE.PlaneGeometry(1, 1);
    this.nodeMat = nodeMaterial(this.U); this.sunMat = sunMaterial(this.U);
    this.haloMat = haloMaterial(this.U, 0, 7, 1);
    this.coronaMat = haloMaterial(this.U, 6, 16, 1, 64); this.fogMat = haloMaterial(this.U, 2, 1, 1);   // star glow (quad = 16 star radii, at least 64 px wide) and sector haze
    this.pulseMat = haloMaterial(this.U, 3, 1, 1); this.retMat = haloMaterial(this.U, 4, 1, 1); this.cometMat = haloMaterial(this.U, 5, 1, 1);
    this.relMat = edgeMaterial(this.U, 1); this.tethMat = edgeMaterial(this.U, 0.2); this.routeMat = edgeMaterial(this.U, 1.6);
    this.stars = makeStars(4200, 1500, this.U); this.scene.add(this.stars);
    this.sky = makeSky(); this.scene.add(this.sky);
    this._allocNodes(512); this._allocSuns(64);
    this.edgesRel = new Edges(this.relMat); this.edgesTeth = new Edges(this.tethMat); this.routeEdges = new Edges(this.routeMat);
    this.scene.add(this.edgesRel.mesh, this.edgesTeth.mesh, this.routeEdges.mesh);
    this._fx();
    this.rings = new THREE.Group(); this.scene.add(this.rings);
    this.controls = new Controls(this.canvas, this.camera);
    this.controls.onTap = (x, y) => { const h = this.pick(x, y, true); this.cb.tap && this.cb.tap(h, x, y); };
    this.controls.onDoubleTap = (x, y) => { const h = this.pick(x, y, true); this.cb.double && this.cb.double(h); };
    this.controls.onHover = (x, y) => { const h = x == null ? null : this.pick(x, y, false); this.hover = h; this.cb.hover && this.cb.hover(h); };
    this.controls.setView({ x: 0, y: 0, z: 0, radius: 900, theta: 0.9, phi: 1.0 }, true);
    this._onResize = () => this.resize(); addEventListener('resize', this._onResize);
    this.canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.lost = true; });
    this.canvas.addEventListener('webglcontextrestored', () => { this.lost = false; });
    this.resize(); this.ok = true; this.start();
    return true;
  }

  // ----- construction helpers -----
  _allocNodes(cap) {
    const old = this.nodeAttrs; this.nodeCap = cap; this.nodeAttrs = makeAttrs(SPEC.node, cap, old);
    if (this.nodeMesh) { this.scene.remove(this.nodeMesh, this.haloMesh); this.nodeGeo.dispose(); this.haloGeo.dispose(); }
    this.nodeGeo = instGeo(this.icoBase, this.nodeAttrs, Object.keys(SPEC.node)); this.haloGeo = instGeo(this.planeBase, this.nodeAttrs, Object.keys(SPEC.halo));
    this.nodeMesh = new THREE.Mesh(this.nodeGeo, this.nodeMat); this.haloMesh = new THREE.Mesh(this.haloGeo, this.haloMat);
    for (const m of [this.nodeMesh, this.haloMesh]) m.frustumCulled = false;
    this.nodeMesh.renderOrder = 1; this.haloMesh.renderOrder = 4; this.scene.add(this.nodeMesh, this.haloMesh);
    const grow = a => { const b = new Float32Array(cap); if (a) b.set(a); return b; };
    this.hi = grow(this.hi); this.dim = grow(this.dim); this.hiT = grow(this.hiT); this.dimT = grow(this.dimT); this.selA = grow(this.selA); this.selT = grow(this.selT);
    this.px = new Float32Array(cap); this.py = new Float32Array(cap); this.pd = new Float32Array(cap); this.prad = new Float32Array(cap);
  }

  _allocSuns(cap) {
    this.sunCap = cap; this.sunAttrs = makeAttrs(SPEC.halo, cap); this.fogAttrs = makeAttrs(SPEC.halo, cap);
    for (const o of [this.sunMesh, this.coronaMesh, this.fogMesh]) if (o) { this.scene.remove(o); o.geometry.dispose(); }
    this.sunMesh = new THREE.Mesh(instGeo(this.icoBase, this.sunAttrs, Object.keys(SPEC.halo)), this.sunMat);
    this.coronaMesh = new THREE.Mesh(instGeo(this.planeBase, this.sunAttrs, Object.keys(SPEC.halo)), this.coronaMat);
    this.fogMesh = new THREE.Mesh(instGeo(this.planeBase, this.fogAttrs, Object.keys(SPEC.halo)), this.fogMat);
    this.sunMesh.renderOrder = 1; this.coronaMesh.renderOrder = 3; this.fogMesh.renderOrder = -5;
    for (const m of [this.sunMesh, this.coronaMesh, this.fogMesh]) { m.frustumCulled = false; this.scene.add(m); }
  }

  _fx() {
    const one = (cap, mat, order) => { const a = makeAttrs(SPEC.halo, cap), g = instGeo(this.planeBase, a, Object.keys(SPEC.halo)), m = new THREE.Mesh(g, mat); g.instanceCount = cap; m.frustumCulled = false; m.renderOrder = order; this.scene.add(m); for (let i = 0; i < cap; i++) a.aMisc.array[i * 4 + 1] = -100; Object.defineProperty(a, 'geo', { value: g }); return a; };
    this.pulseA = one(16, this.pulseMat, 6); this.retA = one(1, this.retMat, 7); this.cometA = one(1, this.cometMat, 7);
    this.retA.aColor.array.set(RING.dark); this.cometA.aColor.array.set(ROUTE); this.cometA.aMisc.array[1] = -10;
  }

  // ----- data -----
  setData(resources, jobs, opts = {}) {
    if (!this.ok) return;
    const first = !this.layout.ready;
    this.layout.sync(resources, jobs, !first);
    if (first) this.layout.settle(240);
    const N = this.layout.nodes, n = N.length;
    if (n > this.nodeCap) this._allocNodes(Math.ceil(n * 1.4 / 256) * 256);
    const A = this.nodeAttrs, rmap = new Map(resources.map(r => [r.id, r])), prim = new Map();
    jobs.forEach(j => j.members.forEach(m => { if (!prim.has(m)) prim.set(m, j); }));
    this.order = N.map(x => x.id); this.index = new Map(this.order.map((id, i) => [id, i]));
    this.titles = new Array(n); this.scales = new Array(n);
    for (let i = 0; i < n; i++) {
      const nd = N[i], r = rmap.get(nd.id), j = prim.get(nd.id), c = j ? hexRGB(j.planetColor || j.color) : NEUTRAL, sh = SHAPES[r.type] || SHAPES.other, sun = j && this.layout.secById.get(j.id);
      const b = dueBucket(r), alert = (b === 'overdue' || b === 'today') ? 1 : (b === 'upcoming' ? 0.3 : 0);
      const sc = (r.tags.includes('following') ? 0.8 : 1.15) * (r.status === 'archived' ? 0.85 : 1);   // planets are small: stars are the big things
      if (!this.spawnById.has(nd.id)) this.spawnById.set(nd.id, first ? this.time + 0.5 + (hash32(nd.id) % 1000) / 1000 * 1.6 : this.time);
      this.titles[i] = r.title; this.scales[i] = sc;
      const o3 = i * 3, o4 = i * 4;
      A.aPos.array[o3] = nd.x; A.aPos.array[o3 + 1] = nd.y; A.aPos.array[o3 + 2] = nd.z;
      A.aScale.array[i] = sc;
      if (sun) { A.aSun.array[o3] = sun.anchor[0]; A.aSun.array[o3 + 1] = sun.anchor[1]; A.aSun.array[o3 + 2] = sun.anchor[2]; } else { A.aSun.array[o3] = nd.x - 35; A.aSun.array[o3 + 1] = nd.y + 75; A.aSun.array[o3 + 2] = nd.z + 55; }
      A.aColor.array[o3] = c[0]; A.aColor.array[o3 + 1] = c[1]; A.aColor.array[o3 + 2] = c[2];
      A.aShape.array[i * 2] = sh[0]; A.aShape.array[i * 2 + 1] = sh[1];
      A.aState.array[o4] = r.status === 'archived' ? 2 : (r.status === 'testing' ? 1 : 0); A.aState.array[o4 + 1] = alert;
      A.aMisc.array[o4] = r.draft ? 1 : 0; A.aMisc.array[o4 + 1] = this.spawnById.get(nd.id); A.aMisc.array[o4 + 2] = (hash32(nd.id) % 10007) / 10007;
    }
    for (const id of [...this.spawnById.keys()]) if (!this.index.has(id)) this.spawnById.delete(id);
    this.nodeGeo.instanceCount = n; this.haloGeo.instanceCount = n;
    this._syncSectors(jobs, n);
    this._syncEdges();
    this._applyHighlight(true);
    for (const k in A) A[k].needsUpdate = true;
    if (first && opts.home !== false) this.home(true);
    this.dirtyPos = false;
  }

  _syncSectors(jobs, nNodes) {
    const S = this.layout.sectors; this.sectorList = S;
    if (S.length > this.sunCap) this._allocSuns(Math.ceil(S.length * 1.5 / 32) * 32);
    const a = this.sunAttrs, f = this.fogAttrs;
    S.forEach((s, i) => {
      const c = hexRGB(s.color), seed = (hash32(s.id) % 10007) / 10007, o3 = i * 3, o4 = i * 4;
      s.sunR = 6.5 + 1.0 * Math.sqrt(s.n); s.rgb = c;   // stars are big: 8 to 20 units across, planets about 1
      if (!this.spawnById.has('s:' + s.id)) this.spawnById.set('s:' + s.id, this.time + (this.layout.ready && this._hadSun ? 0 : 0.2));
      const t0 = this.spawnById.get('s:' + s.id);
      for (const A of [a, f]) {
        A.aPos.array[o3] = s.anchor[0]; A.aPos.array[o3 + 1] = s.anchor[1]; A.aPos.array[o3 + 2] = s.anchor[2];
        A.aColor.array[o3] = c[0]; A.aColor.array[o3 + 1] = c[1]; A.aColor.array[o3 + 2] = c[2];
        A.aMisc.array[o4 + 1] = t0; A.aMisc.array[o4 + 2] = seed;
      }
      a.aScale.array[i] = s.sunR; f.aScale.array[i] = s.R * 3.3;
    });
    this._hadSun = true;
    for (const m of [this.sunMesh, this.coronaMesh, this.fogMesh]) m.geometry.instanceCount = S.length;
    for (const k in a) { a[k].needsUpdate = true; f[k].needsUpdate = true; }
    // rings
    while (this.rings.children.length) { const c = this.rings.children.pop(); c.geometry.dispose(); c.material.dispose(); }
    S.forEach((s, i) => {
      const pts = []; for (let k = 0; k < 96; k++) { const t = k / 96 * 6.2832; pts.push(new THREE.Vector3(Math.cos(t) * s.R * 1.02, 0, Math.sin(t) * s.R * 1.02)); }
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: new THREE.Color(s.color), transparent: true, opacity: this.light ? 0.4 : 0.13, depthWrite: false }));
      line.position.set(s.anchor[0], s.anchor[1], s.anchor[2]); line.rotation.set(0.35 + (i % 3) * 0.12, i, 0.1 * i); line.userData.spin = 0.05 + (i % 4) * 0.012; line.frustumCulled = false; this.rings.add(line);
    });
    this._sectorLabels();
  }

  _syncEdges() {
    const N = this.layout.nodes, idx = this.index, A = this.nodeAttrs.aColor.array, links = this.layout.links;
    this.edgeMeta = links.map(([p, q]) => [idx.get(p.id), idx.get(q.id)]);
    this.edgesRel.setCount(links.length);
    this.edgeMeta.forEach(([a, b], k) => {
      const col = [(A[a * 3] + A[b * 3]) / 2 * 1.1, (A[a * 3 + 1] + A[b * 3 + 1]) / 2 * 1.1, (A[a * 3 + 2] + A[b * 3 + 2]) / 2 * 1.1];
      this.edgesRel.set(k, N[a].x, N[a].y, N[a].z, N[b].x, N[b].y, N[b].z, col, 0);
    });
    this.edgesRel.touch(true);
    this.tethMeta = [];
    if (this.tethers) N.forEach((nd, i) => (nd.secIds || []).forEach(sid => { const si = this.sectorList.findIndex(s => s.id === sid); if (si >= 0) this.tethMeta.push([i, si]); }));
    this.edgesTeth.setCount(this.tethMeta.length);
    this.tethMeta.forEach(([i, si], k) => { const s = this.sectorList[si], nd = N[i]; this.edgesTeth.set(k, s.anchor[0], s.anchor[1], s.anchor[2], nd.x, nd.y, nd.z, s.rgb, 0); });
    this.edgesTeth.touch(true);
    this.dirtyPos = true;
  }

  // ----- highlight / selection -----
  setHighlight(set) { this.hl = set && set.size ? set : (set ? new Set() : null); this._applyHighlight(false); }
  setRoute(ids) { this.routeIds = ids && ids.length ? ids.slice() : null; this._buildRoute(); this._applyHighlight(false); }
  setTethers(on) { this.tethers = on; this._syncEdges(); }

  _applyHighlight(snap) {
    const n = this.order.length, hl = this.hl, route = this.routeIds ? new Set(this.routeIds) : null, nb = this.nbrs = new Set();
    let selId = null;
    if (this.sel && this.sel.kind === 'node') selId = this.sel.id;
    const rmap = this._rel || (this._rel = new Map());
    this.edgeMeta.forEach(([a, b]) => { if (this.order[a] === selId) nb.add(this.order[b]); if (this.order[b] === selId) nb.add(this.order[a]); });
    const secMembers = this.sel && this.sel.kind === 'sector' ? new Set((this.layout.nodes.filter(nd => (nd.secIds || []).includes(this.sel.id))).map(nd => nd.id)) : null;
    for (let i = 0; i < n; i++) {
      const id = this.order[i]; let h = 0, d = 0;
      if (hl) { h = hl.has(id) ? 1 : 0; d = hl.has(id) ? 0 : 1; }
      else if (route) { h = route.has(id) ? 0.8 : 0; d = route.has(id) ? 0 : 0.6; }
      else if (selId) { h = id === selId ? 0.9 : (nb.has(id) ? 0.55 : 0); d = (id === selId || nb.has(id)) ? 0 : 0.5; }
      else if (secMembers) { h = secMembers.has(id) ? 0.5 : 0; d = secMembers.has(id) ? 0 : 0.6; }
      this.hiT[i] = h; this.dimT[i] = d;
      this.selT[i] = (selId === id) ? 1 : 0;
      if (snap) { this.hi[i] = h; this.dim[i] = d; this.selA[i] = this.selT[i]; }
    }
    // beams around the selection glow
    const E = this.edgesRel;
    this.edgeMeta.forEach(([a, b], k) => { E.glow.array[k * 2] = E.glow.array[k * 2 + 1] = (selId && (this.order[a] === selId || this.order[b] === selId)) ? 1 : (hl && hl.has(this.order[a]) && hl.has(this.order[b]) ? 0.7 : 0); });
    E.glow.needsUpdate = true; this._hlDirty = true;
  }

  select(id, { fly = true } = {}) {
    if (!id || !this.index.has(id)) return this.clearSelection();
    this.sel = { kind: 'node', id }; this._applyHighlight(false);
    if (fly) this.flyToNode(id);
    this.pulse(id);
  }
  selectSector(id, { fly = true } = {}) {
    const s = this.sectorList.find(x => x.id === id); if (!s) return;
    this.sel = { kind: 'sector', id }; this._applyHighlight(false);
    if (fly) this.controls.flyTo({ x: s.anchor[0], y: s.anchor[1], z: s.anchor[2], radius: s.R * 3.1 + 30, phi: 1.12 });
  }
  clearSelection() { this.sel = null; this.follow = 0; this._applyHighlight(false); }
  flyToNode(id, radius) {
    const i = this.index.get(id); if (i === undefined) return;
    const nd = this.layout.nodes[i];
    this.controls.flyTo({ x: nd.x, y: nd.y, z: nd.z, radius: radius || Math.max(30, Math.min(this.controls.r.t, 62)) });
    this.follow = 3.5;
  }
  /** A bottom sheet covers this many pixels: slide the picture up so what you picked stays visible above it. */
  setCover(px) { this.coverT = Math.max(0, px || 0); }
  _viewShift() {
    const ins = this.insets || { top: 104 }, sh = Math.max(0, ((this.coverC || 0) - ins.top) / 2);
    if (sh < 0.5) { if (this.camera.view && this.camera.view.enabled) this.camera.clearViewOffset(); } else this.camera.setViewOffset(this.w, this.h, 0, sh, this.w, this.h);
  }
  setInsets(i) { this.insets = Object.assign({ top: 110, bottom: 140, left: 8, right: 8 }, i); }
  /** Overview camera: fitted so every sector lies inside the free screen area (between the top bar and the dock). */
  homeView() {
    const w = this.w, h = this.h, ins = this.insets || { top: 110, bottom: 140, left: 8, right: 8 }, portrait = w < h * 1.05;
    const phi = portrait ? 0.72 : 0.95;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const s of this.sectorList) { x0 = Math.min(x0, s.anchor[0] - s.R); x1 = Math.max(x1, s.anchor[0] + s.R); z0 = Math.min(z0, s.anchor[2] - s.R); z1 = Math.max(z1, s.anchor[2] + s.R); }
    if (x0 > x1) { x0 = -100; x1 = 100; z0 = -100; z1 = 100; }
    const tx = (x0 + x1) / 2, tz = (z0 + z1) / 2, ty = 0;
    const cam = this._hc || (this._hc = new THREE.PerspectiveCamera(60, 1, 1, 6000));
    cam.fov = this.baseFov || 60; cam.aspect = w / h; cam.updateProjectionMatrix();
    const fh = h / (2 * Math.tan(cam.fov * Math.PI / 360)), L = ins.left, Rr = w - ins.right, T = ins.top, B = h - ins.bottom, v = new THREE.Vector3();
    const fits = (r, theta) => {
      cam.position.set(tx + r * Math.sin(phi) * Math.sin(theta), ty + r * Math.cos(phi), tz + r * Math.sin(phi) * Math.cos(theta)); cam.lookAt(tx, ty, tz); cam.updateMatrixWorld();
      for (const s of this.sectorList) {
        v.set(s.anchor[0], s.anchor[1], s.anchor[2]); const c = v.clone().applyMatrix4(cam.matrixWorldInverse), d = -c.z; if (d < 1) return false;
        v.project(cam); const px = (v.x * 0.5 + 0.5) * w, py = (0.5 - v.y * 0.5) * h, rad = (s.R * 1.1 + 4) * fh / d + 14;
        if (px - rad < L || px + rad > Rr || py - rad < T || py + rad > B) return false;
      }
      return true;
    };
    // try looking along both axes and keep the tighter fit, so a tall phone screen gets the long side of the map running up and down
    let best = null;
    for (const theta of portrait ? [0, Math.PI / 2] : [Math.PI / 2, 0]) {
      let lo = 90, hi = 2200; for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (fits(mid, theta)) hi = mid; else lo = mid; }
      if (!best || hi < best.hi * 0.97) best = { hi, theta };
    }
    return { x: tx, y: ty, z: tz, radius: best.hi * 1.02, theta: best.theta, phi };
  }
  home(instant) {
    const v = this.homeView(); this.controls.maxR = Math.max(520, v.radius * 1.3);
    if (instant) this.controls.setView(v, true); else this.controls.flyTo(v, 5.2);
    this.follow = 0;
  }
  frameIds(ids) {
    const pts = ids.map(id => this.index.get(id)).filter(i => i !== undefined).map(i => this.layout.nodes[i]);
    if (!pts.length) return;
    let cx = 0, cy = 0, cz = 0; pts.forEach(p => { cx += p.x; cy += p.y; cz += p.z; }); cx /= pts.length; cy /= pts.length; cz /= pts.length;
    let m = 14; pts.forEach(p => { m = Math.max(m, Math.hypot(p.x - cx, p.y - cy, p.z - cz)); });
    const fov = this.camera.fov * Math.PI / 180;
    this.controls.flyTo({ x: cx, y: cy, z: cz, radius: clamp(m / Math.tan(fov / 2) * 1.5 + 18, 32, 700) });
  }
  pulse(id) {
    const i = this.index.get(id); if (i === undefined) return;
    const nd = this.layout.nodes[i], P = this.pulseA, k = this.pulseN++ % 16, c = this.nodeAttrs.aColor.array;
    P.aPos.array.set([nd.x, nd.y, nd.z], k * 3); P.aScale.array[k] = 9; P.aColor.array.set([c[i * 3], c[i * 3 + 1], c[i * 3 + 2]], k * 3); P.aMisc.array[k * 4 + 1] = this.time;
    for (const key in P) P[key].needsUpdate = true;
  }
  _buildRoute() {
    const R = this.routeEdges, ids = (this.routeIds || []).map(id => this.index.get(id)).filter(i => i !== undefined);
    this.routePts = ids; R.setCount(Math.max(0, ids.length - 1));
    this.routeLen = 0;
    for (let k = 0; k + 1 < ids.length; k++) { const a = this.layout.nodes[ids[k]], b = this.layout.nodes[ids[k + 1]]; R.set(k, a.x, a.y, a.z, b.x, b.y, b.z, ROUTE, 1); this.routeLen += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); }
    R.touch(true);
  }

  /** name: the app theme. space: keep the galaxy a dark sky even in the light theme (stars only glow on dark). */
  setTheme(name, space = true) {
    this.light = name === 'light' && !space; const f = FOG[this.light ? 'light' : 'dark'], rc = RING[this.light ? 'light' : 'dark'];
    this.U.uLight.value = this.light ? 1 : 0; this.U.uFog.value.set(f[0], f[1], f[2]);
    this.renderer.setClearColor(new THREE.Color(f[0], f[1], f[2]), 1);
    this.retA.aColor.array.set(rc); this.retA.aColor.needsUpdate = true;
    this.rings.children.forEach(l => { l.material.opacity = this.light ? 0.4 : 0.13; l.material.needsUpdate = true; });
    setBlend(this.coronaMat, !this.light); setBlend(this.fogMat, !this.light);
    this.sky.visible = !this.light && !this.lowfx;
    document.documentElement.style.setProperty('--gl', this.light ? '1' : '0');
  }

  // ----- sizing, quality, loop -----
  setQuality(q, silent) {
    this.quality = q; const dpr = window.devicePixelRatio || 1;
    this.maxPR = q === 'low' ? Math.min(1, dpr) : Math.min(dpr, 2);
    this.pr = q === 'high' ? this.maxPR : Math.min(this.maxPR, q === 'low' ? 1 : Math.max(1, this.maxPR * 0.9));
    if (!silent) this.resize();
  }
  resize() {
    if (!this.renderer) return;
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight); this.w = w; this.h = h;
    this.renderer.setPixelRatio(this.pr); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.baseFov = w / h < 1 ? 66 : 52; this.camera.fov = this.baseFov; this.camera.updateProjectionMatrix();
    this.stars.material.uniforms.uPx.value = this.pr;
  }
  setPaused(p) { this.paused = p; if (!p) this.start(); }
  start() { if (this._raf || this.paused || !this.ok) return; this.last = performance.now(); this._raf = requestAnimationFrame(t => this._loop(t)); }
  _loop(t) {
    this._raf = null;
    if (this.paused) return;
    if (!document.hidden && !this.lost) { const dt = Math.min(0.05, (t - this.last) / 1000 || 0.016); this._frame(dt, t); }
    this.last = t; this._raf = requestAnimationFrame(tt => this._loop(tt));
  }

  _frame(dt, t) {
    this.time += dt; this.U.uTime.value = this.time; this.stars.position.copy(this.camera.position); this.sky.position.copy(this.camera.position);
    const A = this.nodeAttrs, n = this.order.length;
    let moved = false;
    if (this.layout.alpha > 0.004 && n) {
      this.layout.tick(1); moved = true;
      const N = this.layout.nodes, pa = A.aPos.array;
      for (let i = 0; i < n; i++) { pa[i * 3] = N[i].x; pa[i * 3 + 1] = N[i].y; pa[i * 3 + 2] = N[i].z; }
      A.aPos.needsUpdate = true; this._moveEdges();
      if (this.follow > 0 && this.sel && this.sel.kind === 'node') { const nd = this.layout.nodes[this.index.get(this.sel.id)]; if (nd) this.controls.setView({ x: nd.x, y: nd.y, z: nd.z }); }
    }
    this.follow = Math.max(0, this.follow - dt);
    // eased highlight values
    if (this._hlDirty || moved) {
      let active = false; const k = 1 - Math.exp(-9 * dt), st = A.aState.array, ms = A.aMisc.array;
      for (let i = 0; i < n; i++) {
        const h = this.hi[i] += (this.hiT[i] - this.hi[i]) * k, d = this.dim[i] += (this.dimT[i] - this.dim[i]) * k, s = this.selA[i] += (Math.max(this.selT[i], this.hover && this.hover.kind === 'node' && this.hover.id === this.order[i] ? 0.6 : 0) - this.selA[i]) * k;
        st[i * 4 + 2] = h; st[i * 4 + 3] = d; ms[i * 4 + 3] = s;
        if (Math.abs(this.hiT[i] - h) > 0.004 || Math.abs(this.dimT[i] - d) > 0.004 || Math.abs(this.selT[i] - s) > 0.004) active = true;
      }
      A.aState.needsUpdate = true; A.aMisc.needsUpdate = true; this._hlDirty = active;
    } else if (this.hover) { this._hlDirty = true; }
    this.rings.children.forEach(l => { l.rotation.y += dt * l.userData.spin; });
    this._fxFrame(dt);
    this.controls.update(dt);
    const kick = this.controls.reduced ? 0 : Math.min(9, this.controls.speed * 0.012), fov = this.baseFov + kick;
    if (Math.abs(fov - this.camera.fov) > 0.05) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    const ct = this.coverT || 0, cc = this.coverC || 0;
    if (ct !== cc) { this.coverC = Math.abs(ct - cc) < 0.5 ? ct : cc + (ct - cc) * (1 - Math.exp(-7 * dt)); this._viewShift(); }
    this._project(); this._labels();
    this.renderer.render(this.scene, this.camera);
    this._adapt(dt);
  }

  _moveEdges() {
    const N = this.layout.nodes, R = this.edgesRel, p = R.pos.array;
    this.edgeMeta.forEach(([a, b], k) => { const o = k * 6, A = N[a], B = N[b]; p[o] = A.x; p[o + 1] = A.y; p[o + 2] = A.z; p[o + 3] = B.x; p[o + 4] = B.y; p[o + 5] = B.z; const L = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z); R.len.array[k * 2] = R.len.array[k * 2 + 1] = L; });
    R.touch(false);
    const T = this.edgesTeth, q = T.pos.array;
    this.tethMeta.forEach(([i, si], k) => { const o = k * 6, nd = N[i]; q[o + 3] = nd.x; q[o + 4] = nd.y; q[o + 5] = nd.z; const s = this.sectorList[si]; T.len.array[k * 2] = T.len.array[k * 2 + 1] = Math.hypot(nd.x - s.anchor[0], nd.y - s.anchor[1], nd.z - s.anchor[2]); });
    T.touch(false);
    if (this.routePts) this._buildRoute();
  }

  _fxFrame(dt) {
    // reticle follows the selection
    const r = this.retA; let target = 0;
    if (this.sel) {
      let pos, size;
      if (this.sel.kind === 'node') { const i = this.index.get(this.sel.id); if (i !== undefined) { const nd = this.layout.nodes[i]; pos = [nd.x, nd.y, nd.z]; size = this.scales[i] * 3.9; } }
      else { const s = this.sectorList.find(x => x.id === this.sel.id); if (s) { pos = s.anchor; size = s.sunR * 3.2; } }
      if (pos) { r.aPos.array.set(pos); r.aScale.array[0] = size; target = 1; }
    }
    r.aMisc.array[3] += (target - r.aMisc.array[3]) * (1 - Math.exp(-10 * dt));
    r.aPos.needsUpdate = r.aScale.needsUpdate = r.aMisc.needsUpdate = true;
    // comet travelling the mission route
    const c = this.cometA, onRoute = !!(this.routePts && this.routePts.length > 1 && this.routeLen > 0);
    c.geo.instanceCount = onRoute ? 1 : 0;   // with no mission route the comet must not draw at all (it used to sit as a blue dot in the middle of the map)
    if (onRoute) {
      this.cometT = ((this.cometT || 0) + dt * 38 / this.routeLen) % 1;
      let d = this.cometT * this.routeLen;
      for (let k = 0; k + 1 < this.routePts.length; k++) {
        const a = this.layout.nodes[this.routePts[k]], b = this.layout.nodes[this.routePts[k + 1]], L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        if (d <= L || k + 2 === this.routePts.length) { const u = clamp(d / (L || 1), 0, 1); c.aPos.array.set([a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u]); break; }
        d -= L;
      }
      c.aScale.array[0] = 7;
    } else c.aScale.array[0] = 0;
    c.aPos.needsUpdate = c.aScale.needsUpdate = true;
  }

  _adapt(dt) {
    this.frameMs += (dt * 1000 - this.frameMs) * 0.04;
    if (this.quality !== 'auto' || this.time - this.lastPR < 3) return;
    // slow even at the lowest resolution 3 checks in a row: drop the blurred bars for the rest of the session
    if (this.frameMs > 28 && this.pr <= 0.72) { if (++this.slowN >= 3 && !this.lowfx) { this.lowfx = true; this.lastPR = this.time; try { document.body.classList.add('lowfx'); } catch (e) {} this.sky.visible = false; } else this.lastPR = this.time; return; }
    this.slowN = 0;
    if (this.frameMs > 24 && this.pr > 0.7) { this.pr = Math.max(0.7, this.pr * 0.85); this.lastPR = this.time; this.resize(); }
    else if (this.frameMs < 13 && this.pr < this.maxPR - 0.01) { this.pr = Math.min(this.maxPR, this.pr * 1.12); this.lastPR = this.time + 3; this.resize(); }
  }
  // ----- projection, picking, labels -----
  _project() {
    const n = this.order.length, cam = this.camera;
    if (!this._vp) this._vp = new THREE.Matrix4();
    cam.updateMatrixWorld(); const e = this._vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements;
    const w = this.w, h = this.h, fh = h / (2 * Math.tan(cam.fov * Math.PI / 360)), N = this.layout.nodes;
    this.fh = fh; this.U.uFh.value = fh;
    for (let i = 0; i < n; i++) {
      const x = N[i].x, y = N[i].y, z = N[i].z, cw = e[3] * x + e[7] * y + e[11] * z + e[15];
      if (cw <= 0.5) { this.pd[i] = -1; continue; }
      this.px[i] = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / cw * 0.5 + 0.5) * w;
      this.py[i] = (0.5 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / cw * 0.5) * h;
      this.pd[i] = cw; this.prad[i] = this.scales[i] * fh / cw;
    }
    for (const s of this.sectorList) {
      const x = s.anchor[0], y = s.anchor[1], z = s.anchor[2], cw = e[3] * x + e[7] * y + e[11] * z + e[15];
      if (cw <= 0.5) { s.sd = -1; continue; }
      s.sx = ((e[0] * x + e[4] * y + e[8] * z + e[12]) / cw * 0.5 + 0.5) * w; s.sy = (0.5 - (e[1] * x + e[5] * y + e[9] * z + e[13]) / cw * 0.5) * h;
      s.sd = cw; s.srad = (s.sunR || 6) * fh / cw;
    }
  }

  /** What is under the screen point (x, y)? tap=true uses a bigger touch radius. */
  pick(x, y, tap) {
    const n = this.order.length, slack = tap ? 24 : 11; let best = -1, bs = 1e9;
    for (let i = 0; i < n; i++) {
      if (this.pd[i] < 0) continue;
      const d = Math.hypot(this.px[i] - x, this.py[i] - y), r = Math.max(this.prad[i] * 1.1, 4) + slack;
      if (d < r) { const sc = d / r + this.pd[i] * 0.0004; if (sc < bs) { bs = sc; best = i; } }
    }
    if (best >= 0) return { kind: 'node', id: this.order[best], x: this.px[best], y: this.py[best] };
    let bsec = null, bd = 1e9;
    for (const s of this.sectorList) {
      if (s.sd < 0) continue;
      const lr = this.lblRects.get(s.id); let d = Math.hypot(s.sx - x, s.sy - y) - Math.max(s.srad, 18);
      if (lr && x > lr.x - 6 && x < lr.x + lr.w + 6 && y > lr.y - 6 && y < lr.y + lr.h + 6) d = Math.min(d, -1);
      if (d < (tap ? 14 : 4) && d < bd) { bd = d; bsec = s; }
    }
    return bsec ? { kind: 'sector', id: bsec.id, x: bsec.sx, y: bsec.sy } : null;
  }

  _sectorLabels() {
    const keep = new Set(this.sectorList.map(s => s.id));
    for (const [id, o] of this.secLabels) if (!keep.has(id)) { o.el.remove(); this.secLabels.delete(id); this.lblRects.delete(id); }
    for (const s of this.sectorList) {
      let o = this.secLabels.get(s.id);
      if (!o) {
        const el = document.createElement('div'); el.className = 'lbl lbl-sec'; el.innerHTML = '<i></i><b></b><em></em>';
        this.labelRoot.appendChild(el); o = { el, w: 0, h: 0, key: '' }; this.secLabels.set(s.id, o);
      }
      const key = s.name + '|' + s.n + '|' + s.color + '|' + (s.sealed ? 1 : 0);
      if (o.key !== key) {
        o.key = key; o.el.style.setProperty('--c', s.color); o.el.classList.toggle('sealed', !!s.sealed);
        o.el.children[1].textContent = (s.sealed ? '\u{1F512} ' : '') + s.name; o.el.children[2].textContent = s.n; o.w = 0;
      }
    }
  }

  _nodeLabel(i) {
    let o = this.nodeLabels[i];
    if (!o) { const el = document.createElement('div'); el.className = 'lbl lbl-node'; this.labelRoot.appendChild(el); o = this.nodeLabels[i] = { el, id: null, w: 0, h: 0 }; }
    return o;
  }

  _labels() {
    const W = this.w, H = this.h, R = this.lblRects; let placed = [];
    const hide = o => { if (o.shown) { o.el.style.opacity = '0'; o.shown = false; } };
    const place = (o, x, y, op, dy) => {
      if (!o.w) { o.w = o.el.offsetWidth || 60; o.h = o.el.offsetHeight || 22; }
      const left = clamp(x - o.w / 2, 6, Math.max(6, W - o.w - 6)), top = y - o.h / 2 + dy;
      o.el.style.transform = `translate3d(${left.toFixed(1)}px,${top.toFixed(1)}px,0)`; o.el.style.opacity = op.toFixed(2); o.shown = true;
      return { x: left, y: top, w: o.w, h: o.h };
    };
    const cam = this.camera.position, far = this.controls.r.x > 340;
    if (far !== this._far) { this._far = far; this.labelRoot.classList.toggle('far', far); for (const o of this.secLabels.values()) o.w = 0; }
    const order = this.sectorList.slice().sort((a, b) => (this.sel && this.sel.id === b.id) - (this.sel && this.sel.id === a.id) || b.n - a.n);
    for (const s of order) {
      const o = this.secLabels.get(s.id); if (!o) continue;
      if (s.sd < 0 || s.sx < -80 || s.sx > W + 80 || s.sy < -40 || s.sy > H + 40) { hide(o); R.delete(s.id); continue; }
      const dc = Math.hypot(cam.x - s.anchor[0], cam.y - s.anchor[1], cam.z - s.anchor[2]), inside = clamp((dc - s.R * 0.55) / (s.R * 0.5), 0, 1);
      const sel = this.sel && this.sel.kind === 'sector' && this.sel.id === s.id;
      const op = (sel ? 1 : 0.95) * inside * (this.sel && !sel && this.sel.kind === 'sector' ? 0.55 : 1);
      if (op < 0.03) { hide(o); R.delete(s.id); continue; }
      if (!o.w) { o.w = o.el.offsetWidth || 90; o.h = o.el.offsetHeight || 22; }
      const dy = -(s.srad + 16), cand = { x: clamp(s.sx - o.w / 2, 6, Math.max(6, W - o.w - 6)), y: s.sy - o.h / 2 + dy, w: o.w, h: o.h };
      if (!sel && placed.some(p => cand.x < p.x + p.w + 4 && cand.x + cand.w + 4 > p.x && cand.y < p.y + p.h + 3 && cand.y + cand.h + 3 > p.y)) { hide(o); R.delete(s.id); continue; }
      const rect = place(o, s.sx, s.sy, op, dy); R.set(s.id, rect); o.el.classList.toggle('picked', !!sel); placed.push(rect);
    }
    // node labels: highlighted, selected, neighbours, hovered, then the nearest ones when zoomed in
    const n = this.order.length, cand = [], zoom = this.controls.r.x;
    const want = new Set();
    if (this.sel && this.sel.kind === 'node') want.add(this.sel.id);
    if (this.hover && this.hover.kind === 'node') want.add(this.hover.id);
    const add = (i, pri) => { if (this.pd[i] > 0 && this.px[i] > -20 && this.px[i] < W + 20 && this.py[i] > 40 && this.py[i] < H - 20) cand.push([pri, i]); };
    if (this.hl && this.hl.size && this.hl.size <= 40) this.hl.forEach(id => { const i = this.index.get(id); if (i !== undefined) add(i, 1 + this.pd[i] * 0.0005); });
    if (this.routeIds) this.routeIds.forEach((id, k) => { const i = this.index.get(id); if (i !== undefined) add(i, 1.5 + k * 0.01); });
    want.forEach(id => { const i = this.index.get(id); if (i !== undefined) add(i, 0); });
    this.nbrs.forEach(id => { const i = this.index.get(id); if (i !== undefined) add(i, 2 + this.pd[i] * 0.001); });
    if (zoom < 150 && !this.hl) for (let i = 0; i < n; i++) if (this.pd[i] > 0 && this.pd[i] < zoom * 1.3 + 30) add(i, 5 + this.pd[i] * 0.01);
    cand.sort((a, b) => a[0] - b[0]);
    let used = 0; const seen = new Set();
    for (const [pri, i] of cand) {
      if (used >= 16 || seen.has(i)) continue; seen.add(i);
      const o = this._nodeLabel(used); const id = this.order[i];
      if (o.id !== id) { o.id = id; o.el.textContent = this.titles[i].length > 30 ? this.titles[i].slice(0, 29) + '…' : this.titles[i]; o.w = 0; o.el.style.setProperty('--c', '#' + new THREE.Color().setRGB(this.nodeAttrs.aColor.array[i * 3], this.nodeAttrs.aColor.array[i * 3 + 1], this.nodeAttrs.aColor.array[i * 3 + 2]).getHexString()); }
      if (!o.w) { o.w = o.el.offsetWidth || 70; o.h = o.el.offsetHeight || 22; }
      const x = this.px[i], y = this.py[i] - this.prad[i] - 14, rect = { x: x - o.w / 2, y: y - o.h / 2, w: o.w, h: o.h };
      const forced = pri < 3;
      if (!forced && placed.some(p => rect.x < p.x + p.w + 3 && rect.x + rect.w + 3 > p.x && rect.y < p.y + p.h + 2 && rect.y + rect.h + 2 > p.y)) continue;
      o.el.classList.toggle('picked', this.sel && this.sel.id === id);
      place(o, x, this.py[i] - this.prad[i] - 12, forced ? 1 : clamp(1.2 - this.pd[i] / (zoom * 1.5 + 60), 0.35, 1), 0); placed.push(rect); used++;
    }
    for (let k = used; k < this.nodeLabels.length; k++) if (this.nodeLabels[k]) { hide(this.nodeLabels[k]); this.nodeLabels[k].id = null; }
  }
}
