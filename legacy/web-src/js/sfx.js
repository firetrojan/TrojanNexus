// sfx.js - tiny synthesised sounds (off by default) and phone vibration. No audio files.
import * as store from './store.js';

let ctx = null, master = null;
function ac() {
  if (!ctx) {
    try { const C = window.AudioContext || window.webkitAudioContext; if (C) { ctx = new C(); master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination); } } catch (e) { ctx = null; }
  }
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
function tone(freq, dur, o = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + (o.delay || 0), osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(freq, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * o.slide), t + dur);
  const v = o.vol == null ? 0.06 : o.vol;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g); g.connect(master); osc.start(t); osc.stop(t + dur + 0.05);
}
const SOUNDS = {
  tap: () => tone(760, 0.05, { type: 'triangle', vol: 0.04 }),
  open: () => { tone(420, 0.09, { type: 'sine', slide: 1.6, vol: 0.05 }); tone(640, 0.12, { delay: 0.05, vol: 0.04 }); },
  close: () => tone(520, 0.1, { type: 'sine', slide: 0.6, vol: 0.04 }),
  ok: () => { tone(523, 0.1, { type: 'triangle' }); tone(784, 0.16, { type: 'triangle', delay: 0.08 }); },
  xp: () => { [880, 1175, 1568].forEach((f, i) => tone(f, 0.12, { type: 'sine', delay: i * 0.06, vol: 0.045 })); },
  level: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', delay: i * 0.1, vol: 0.06 })); },
  warn: () => { tone(220, 0.16, { type: 'square', vol: 0.025 }); tone(196, 0.2, { type: 'square', delay: 0.12, vol: 0.025 }); },
  spawn: () => { tone(200, 0.35, { type: 'sine', slide: 4, vol: 0.05 }); tone(900, 0.18, { delay: 0.25, vol: 0.035 }); },
  done: () => { [659, 880, 1319].forEach((f, i) => tone(f, 0.3, { type: 'sine', delay: i * 0.14, vol: 0.06 })); }
};
export function play(name) { if (store.getSetting('sound') && SOUNDS[name]) try { SOUNDS[name](); } catch (e) { /* ignore */ } }
export function buzz(p) { if (store.getSetting('haptics')) try { const ua = navigator.userActivation; if (navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(p); } catch (e) { /* ignore */ } }   // browsers refuse (and log an error) before the first tap
export const feel = (name, pattern) => { play(name); buzz(pattern || 8); };
