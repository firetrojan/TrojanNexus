// gfx.js - builds the three.js objects (materials, instanced sets, stars). No app logic here.
import * as THREE from 'three';
import { NODE_VERT, NODE_FRAG, SUN_VERT, SUN_FRAG, HALO_VERT, HALO_FRAG, EDGE_VERT, EDGE_FRAG, STAR_VERT, STAR_FRAG } from './shaders.js';
import { rng } from './util.js';

THREE.ColorManagement.enabled = false;   // hex colours are used as plain sRGB everywhere (shaders, clear colour, lines)
export { THREE };
export const SPEC = {
  node: { aPos: 3, aScale: 1, aColor: 3, aShape: 2, aState: 4, aMisc: 4, aSun: 3 },
  halo: { aPos: 3, aScale: 1, aColor: 3, aState: 4, aMisc: 4 }
};

/** Per-instance attributes, optionally copying old data when the pool grows. */
export function makeAttrs(spec, cap, old) {
  const out = {};
  for (const k in spec) {
    const arr = new Float32Array(spec[k] * cap);
    if (old && old[k]) arr.set(old[k].array.subarray(0, Math.min(arr.length, old[k].array.length)));
    const at = new THREE.InstancedBufferAttribute(arr, spec[k]);
    at.setUsage(THREE.DynamicDrawUsage);
    out[k] = at;
  }
  return out;
}

/** Instanced geometry from a base shape + shared attribute objects. */
export function instGeo(base, attrs, names) {
  const g = new THREE.InstancedBufferGeometry();
  if (base.index) g.setIndex(base.index);
  for (const k in base.attributes) g.setAttribute(k, base.attributes[k]);
  for (const k of names || Object.keys(attrs)) g.setAttribute(k, attrs[k]);
  g.instanceCount = 0;
  return g;
}

export function sharedUniforms() {
  return {
    uTime: { value: 0 }, uLight: { value: 0 }, uFh: { value: 700 },
    uFog: { value: new THREE.Vector3(0, 0, 0) }, uFogNear: { value: 260 }, uFogFar: { value: 900 }
  };
}

const mat = (vs, fs, uniforms, extra) => new THREE.ShaderMaterial(Object.assign({ vertexShader: vs, fragmentShader: fs, uniforms }, extra));
export const nodeMaterial = U => mat(NODE_VERT, NODE_FRAG, U, {});
export const sunMaterial = U => mat(SUN_VERT, SUN_FRAG, U, {});

/** mode: 0 alert ping + hit ring, 1 hub ring, 2 sector haze, 3 select pulse, 4 reticle, 5 route dot, 6 star glow.
 *  Modes 2 and 6 add light on a dark sky (additive); setBlend() switches them to plain blending on a light backdrop. */
export function haloMaterial(U, mode, size, intensity = 1, minPx = 0) {
  return mat(HALO_VERT, HALO_FRAG, Object.assign({}, U, { uMode: { value: mode }, uSize: { value: size }, uIntensity: { value: intensity }, uMinPx: { value: minPx } }),
    { transparent: true, depthWrite: false, blending: (mode === 2 || mode === 6) ? THREE.AdditiveBlending : THREE.NormalBlending });
}
export function setBlend(material, additive) {
  const b = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
  if (material.blending !== b) { material.blending = b; material.needsUpdate = true; }
}
export function edgeMaterial(U, alpha) {
  return mat(EDGE_VERT, EDGE_FRAG, Object.assign({}, U, { uAlpha: { value: alpha } }), { transparent: true, depthWrite: false, blending: THREE.NormalBlending });
}

/** Real star colours by temperature: blue-white, white, yellow, orange, a few red. Most are faint, a few are bright. */
const STAR_TINTS = [[0.62, 0.72, 1], [0.78, 0.86, 1], [0.92, 0.95, 1], [1, 1, 1], [1, 0.96, 0.84], [1, 0.88, 0.66], [1, 0.74, 0.52], [1, 0.58, 0.45]];
export function makeStars(count, radius, uniforms) {
  const g = new THREE.BufferGeometry(), R = rng(1234);
  const pos = new Float32Array(count * 3), size = new Float32Array(count), ph = new Float32Array(count), tint = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = R() * 2 - 1, a = R() * 6.2832, s = Math.sqrt(1 - u * u), rr = radius * (0.85 + 0.15 * R());
    pos[i * 3] = s * Math.cos(a) * rr; pos[i * 3 + 1] = u * rr; pos[i * 3 + 2] = s * Math.sin(a) * rr;
    size[i] = 1.2 + Math.pow(R(), 6) * 5.2; ph[i] = R();
    const t = R(), k = t < 0.18 ? 0 : t < 0.34 ? 1 : t < 0.5 ? 2 : t < 0.68 ? 3 : t < 0.8 ? 4 : t < 0.9 ? 5 : t < 0.97 ? 6 : 7;
    tint.set(STAR_TINTS[k], i * 3);
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
  g.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
  const m = mat(STAR_VERT, STAR_FRAG, Object.assign({}, uniforms, { uPx: { value: 1 } }), { transparent: true, depthWrite: false, blending: THREE.NormalBlending });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = -9;
  return pts;
}

// ---------- deep-space backdrop: faint blue, violet and rose clouds plus a thin milky band, painted once into a texture ----------
function hash3(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf), L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), L(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
           L(L(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), L(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v), w);
}
const fbm = (x, y, z) => 0.55 * vnoise(x, y, z) + 0.28 * vnoise(x * 2.1, y * 2.1, z * 2.1) + 0.17 * vnoise(x * 4.3, y * 4.3, z * 4.3);
export function makeSky(W = 512, H = 256) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
  for (let j = 0; j < H; j++) {
    const lat = (0.5 - (j + 0.5) / H) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < W; i++) {
      const lon = (i + 0.5) / W * Math.PI * 2, x = cl * Math.cos(lon), y = sl, z = cl * Math.sin(lon);
      const a = fbm(x * 1.7 + 11, y * 1.7, z * 1.7), b = fbm(x * 2.6 - 5, y * 2.6 + 9, z * 2.6), c = fbm(x * 1.2 + 3, y * 1.2 - 7, z * 1.2 + 2);
      const band = Math.exp(-Math.pow((x * 0.35 + y * 0.9 - z * 0.25) * 2.4, 2)) * (0.5 + 0.9 * fbm(x * 5 + 2, y * 5, z * 5));   // a faint milky band
      const na = Math.max(0, a - 0.46) * 2.0, nb = Math.max(0, b - 0.5) * 2.2, nc = Math.max(0, c - 0.5) * 1.8;
      const r = 0.020 + na * 0.10 + nb * 0.12 + nc * 0.02 + band * 0.07;
      const gr = 0.026 + na * 0.05 + nb * 0.03 + nc * 0.07 + band * 0.07;
      const bl = 0.050 + na * 0.22 + nb * 0.18 + nc * 0.15 + band * 0.10;
      const o = (j * W + i) * 4; d[o] = Math.min(255, r * 255); d[o + 1] = Math.min(255, gr * 255); d[o + 2] = Math.min(255, bl * 255); d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.NoColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false }));
  mesh.frustumCulled = false; mesh.renderOrder = -20;
  return mesh;
}

/** Growable line segments: positions (3), end flag, length, color (3), glow. */
export class Edges {
  constructor(material) {
    this.material = material; this.cap = 0; this.n = 0;
    this.mesh = new THREE.LineSegments(new THREE.BufferGeometry(), material);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    this.alloc(256);
  }
  alloc(cap) {
    this.cap = cap; const g = this.mesh.geometry; g.dispose();
    const mk = (size, name) => { const a = new THREE.BufferAttribute(new Float32Array(cap * 2 * size), size); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; };
    this.pos = mk(3, 'position'); this.end = mk(1, 'aEnd'); this.len = mk(1, 'aLen'); this.col = mk(3, 'aColor'); this.glow = mk(1, 'aGlow');
    g.setDrawRange(0, this.n * 2);
  }
  setCount(n) { if (n > this.cap) this.alloc(Math.ceil(n * 1.5 / 128) * 128); this.n = n; this.mesh.geometry.setDrawRange(0, n * 2); }
  set(i, ax, ay, az, bx, by, bz, color, glow) {
    const p = this.pos.array, o = i * 6;
    p[o] = ax; p[o + 1] = ay; p[o + 2] = az; p[o + 3] = bx; p[o + 4] = by; p[o + 5] = bz;
    const L = Math.hypot(bx - ax, by - ay, bz - az);
    this.end.array[i * 2] = 0; this.end.array[i * 2 + 1] = 1; this.len.array[i * 2] = L; this.len.array[i * 2 + 1] = L;
    if (color) { const c = this.col.array, q = i * 6; c[q] = c[q + 3] = color[0]; c[q + 1] = c[q + 4] = color[1]; c[q + 2] = c[q + 5] = color[2]; }
    if (glow !== undefined) { this.glow.array[i * 2] = glow; this.glow.array[i * 2 + 1] = glow; }
  }
  touch(all) { this.pos.needsUpdate = true; this.len.needsUpdate = true; if (all) { this.end.needsUpdate = true; this.col.needsUpdate = true; this.glow.needsUpdate = true; } }
}
