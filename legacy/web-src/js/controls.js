// controls.js - orbit / pan / zoom camera driven by critically damped springs, with touch gestures and fly-to.
// 1 finger or left mouse = orbit, 2 fingers = pinch zoom + pan, right mouse / shift = pan, wheel = zoom.
import { clamp } from './util.js';

class Spring {
  constructor(v) { this.x = v; this.v = 0; this.t = v; }
  step(dt, w) { this.v += ((this.t - this.x) * w * w - 2 * w * this.v) * dt; this.x += this.v * dt; }
  snap(v) { this.x = this.t = v; this.v = 0; }
}
const wrapPi = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

export class Controls {
  constructor(el, camera) {
    this.el = el; this.cam = camera;
    this.tx = new Spring(0); this.ty = new Spring(0); this.tz = new Spring(0);
    this.r = new Spring(300); this.th = new Spring(0.5); this.ph = new Spring(1.1);
    this.omega = 6.5; this.minR = 9; this.maxR = 760;
    this.vTh = 0; this.vPh = 0; this.speed = 0;
    this.enabled = true; this.autoRotate = true; this.dragging = false;
    this.lastInput = performance.now();
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.ptrs = new Map(); this.keys = new Set();
    this.onTap = null; this.onDoubleTap = null; this.onHover = null; this.onInput = null;
    this._tap = { t: 0, x: 0, y: 0 }; this._pinch = 0; this._mid = null; this._moved = 0; this._gesture0 = 0;
    this._bind();
  }

  // ----- camera state -----
  setView({ x, y, z, radius, theta, phi }, instant) {
    if (x !== undefined) { this.tx.t = x; this.ty.t = y; this.tz.t = z; }
    if (radius !== undefined) this.r.t = clamp(radius, this.minR, this.maxR);
    if (theta !== undefined) this.th.t = this.th.x + wrapPi(theta - this.th.x);
    if (phi !== undefined) this.ph.t = clamp(phi, 0.15, Math.PI - 0.15);
    if (instant) [this.tx, this.ty, this.tz, this.r, this.th, this.ph].forEach(s => s.snap(s.t));
    this.vTh = this.vPh = 0;
  }
  flyTo(v, omega = 6.2) { this.omega = omega; this.setView(v); }
  get target() { return [this.tx.x, this.ty.x, this.tz.x]; }

  update(dt) {
    dt = Math.min(dt, 1 / 30);
    const now = performance.now();
    if (!this.dragging) {
      this.th.t += this.vTh * dt; this.ph.t = clamp(this.ph.t + this.vPh * dt, 0.15, Math.PI - 0.15);
      const k = Math.exp(-3.4 * dt); this.vTh *= k; this.vPh *= k;
    }
    if (this.autoRotate && !this.reduced && !this.dragging && now - this.lastInput > 9000) this.th.t += 0.03 * dt;
    if (this.keys.size && this.enabled) this._keyMove(dt);
    const w = this.omega; this.omega += (6.5 - this.omega) * Math.min(1, dt * 0.8);
    for (const s of [this.tx, this.ty, this.tz, this.r, this.th, this.ph]) s.step(dt, w);
    const r = this.r.x, sp = Math.sin(this.ph.x);
    const px = this.tx.x + r * sp * Math.sin(this.th.x), py = this.ty.x + r * Math.cos(this.ph.x), pz = this.tz.x + r * sp * Math.cos(this.th.x);
    const c = this.cam.position, d = Math.hypot(px - c.x, py - c.y, pz - c.z);
    this.speed += (d / Math.max(dt, 1e-3) - this.speed) * Math.min(1, dt * 6);
    c.set(px, py, pz); this.cam.lookAt(this.tx.x, this.ty.x, this.tz.x);
    this.cam.updateMatrixWorld();
  }

  // ----- internals -----
  _touch() { this.lastInput = performance.now(); if (this.onInput) this.onInput(); }
  _zoom(f) { this.r.t = clamp(this.r.t * f, this.minR, this.maxR); this._touch(); }
  _pan(dx, dy) {
    const e = this.cam.matrixWorld.elements, k = this.r.x * 0.0017;
    this.tx.t += (-e[0] * dx + e[4] * dy) * k; this.ty.t += (-e[1] * dx + e[5] * dy) * k; this.tz.t += (-e[2] * dx + e[6] * dy) * k;
    const L = Math.hypot(this.tx.t, this.ty.t, this.tz.t);
    if (L > 520) { const s = 520 / L; this.tx.t *= s; this.ty.t *= s; this.tz.t *= s; }
    this._touch();
  }
  _keyMove(dt) {
    const k = this.keys, sp = (this.r.x * 0.9 + 40) * dt, e = this.cam.matrixWorld.elements;
    let rx = 0, fz = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) rx -= 1; if (k.has('KeyD') || k.has('ArrowRight')) rx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) fz += 1; if (k.has('KeyS') || k.has('ArrowDown')) fz -= 1;
    if (rx || fz) {
      const fx = -Math.sin(this.th.x), fzz = -Math.cos(this.th.x);
      this.tx.t += (e[0] * rx + fx * fz) * sp; this.tz.t += (e[2] * rx + fzz * fz) * sp; this._touch();
    }
    if (k.has('KeyQ')) this._zoom(Math.exp(-1.4 * dt)); if (k.has('KeyE')) this._zoom(Math.exp(1.4 * dt));
  }

  _bind() {
    const el = this.el; el.style.touchAction = 'none';
    el.addEventListener('pointerdown', e => this._down(e));
    el.addEventListener('pointermove', e => this._move(e));
    el.addEventListener('pointerup', e => this._up(e, false));
    el.addEventListener('pointercancel', e => this._up(e, true));
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && this.onHover) this.onHover(null); });
    el.addEventListener('wheel', e => { if (!this.enabled) return; e.preventDefault(); this._zoom(Math.exp(clamp(e.deltaY, -120, 120) * (e.ctrlKey ? 0.01 : 0.0013))); }, { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('keydown', e => { if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName) || e.ctrlKey || e.metaKey || e.altKey) return; if (/^(Key[WASDQE]|Arrow(Up|Down|Left|Right))$/.test(e.code)) this.keys.add(e.code); });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  _down(e) {
    if (!this.enabled) return;
    try { this.el.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t0: performance.now(), btn: e.button, shift: e.shiftKey, lt: performance.now() });
    this.dragging = true; this.vTh = this.vPh = 0; this._moved = 0; this._touch();
    if (this.ptrs.size === 1) this._gesture0 = performance.now();
    if (this.ptrs.size === 2) { const [a, b] = [...this.ptrs.values()]; this._pinch = Math.hypot(a.x - b.x, a.y - b.y); this._mid = [(a.x + b.x) / 2, (a.y + b.y) / 2]; this._moved = 99; }
  }

  _move(e) {
    const p = this.ptrs.get(e.pointerId);
    if (!p) { if (e.pointerType === 'mouse' && this.onHover && this.enabled) this.onHover(e.clientX, e.clientY); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y, now = performance.now(), dts = Math.max((now - p.lt) / 1000, 1 / 240);
    p.x = e.clientX; p.y = e.clientY; p.lt = now;
    if (this.ptrs.size === 1) {
      this._moved += Math.abs(dx) + Math.abs(dy);
      if (p.btn === 2 || p.btn === 1 || p.shift) this._pan(dx, dy);
      else {
        const sx = 0.0052, dth = -dx * sx, dph = -dy * sx;
        this.th.t += dth; this.ph.t = clamp(this.ph.t + dph, 0.15, Math.PI - 0.15);
        this.vTh += (dth / dts - this.vTh) * 0.4; this.vPh += (dph / dts - this.vPh) * 0.4;
        this._touch();
      }
    } else if (this.ptrs.size === 2) {
      const [a, b] = [...this.ptrs.values()], dist = Math.hypot(a.x - b.x, a.y - b.y), mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      if (this._pinch > 0 && dist > 0) this._zoom(this._pinch / dist);
      if (this._mid) this._pan(mid[0] - this._mid[0], mid[1] - this._mid[1]);
      this._pinch = dist; this._mid = mid;
    }
  }

  _up(e, cancelled) {
    const p = this.ptrs.get(e.pointerId); if (!p) return;
    this.ptrs.delete(e.pointerId);
    try { this.el.releasePointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    if (this.ptrs.size === 0) {
      this.dragging = false;
      const now = performance.now(), quick = now - p.t0 < 450 && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 10 && this._moved < 14;
      if (!quick || p.lt < now - 120) { this.vTh *= p.lt < now - 120 ? 0 : 1; this.vPh *= p.lt < now - 120 ? 0 : 1; }
      if (quick && !cancelled) {
        const t = this._tap, dbl = now - t.t < 320 && Math.hypot(e.clientX - t.x, e.clientY - t.y) < 32;
        this.vTh = this.vPh = 0;
        if (this.onTap) this.onTap(e.clientX, e.clientY, e);
        if (dbl && this.onDoubleTap) this.onDoubleTap(e.clientX, e.clientY, e);
        this._tap = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
      }
      this._pinch = 0; this._mid = null;
    } else if (this.ptrs.size === 1) { this._pinch = 0; this._mid = null; this._moved = 99; }
  }
}
