// Tiny synthesized sound kit — zero audio files to download.
import { G } from './state.js';

let ctx = null, master = null, noiseBuf = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = G.settings.volume;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { ctx = null; }
}

export function setVolume(v) { if (master) master.gain.value = v; }

const SHOT = {
  ar: { f: 1400, dur: 0.16, body: 140, vol: 0.5 },
  smg: { f: 2000, dur: 0.1, body: 180, vol: 0.38 },
  pistol: { f: 1700, dur: 0.14, body: 160, vol: 0.42 },
  shotgun: { f: 700, dur: 0.38, body: 80, vol: 0.75 },
  sniper: { f: 900, dur: 0.6, body: 60, vol: 0.85 },
  pickaxe: { f: 3000, dur: 0.05, body: 400, vol: 0.2 },
};

// pan -1..1, dist metres
export function playShot(type, dist = 0, pan = 0) {
  if (!ctx) return;
  const s = SHOT[type] || SHOT.ar;
  const t = ctx.currentTime;
  const att = Math.max(0, 1 - dist / 260) ** 1.6;
  if (att < 0.01) return;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const filt = ctx.createBiquadFilter(); filt.type = 'lowpass';
  filt.frequency.setValueAtTime(s.f * (dist > 40 ? 0.5 : 1), t);
  filt.frequency.exponentialRampToValueAtTime(200, t + s.dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(s.vol * att, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + s.dur);
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  src.connect(filt); filt.connect(g);
  if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(master); } else g.connect(master);
  src.start(t, Math.random() * 0.2, s.dur + 0.05);
  // low thump
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(s.body, t); o.frequency.exponentialRampToValueAtTime(40, t + s.dur * 0.6);
  const og = ctx.createGain(); og.gain.setValueAtTime(s.vol * att * 0.8, t); og.gain.exponentialRampToValueAtTime(0.001, t + s.dur * 0.6);
  o.connect(og); og.connect(p || master); o.start(t); o.stop(t + s.dur);
}

function tone(freq, dur, type = 'sine', vol = 0.2, slide = 0) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur);
}

export const sfx = {
  hit: () => tone(1800, 0.06, 'square', 0.12),
  head: () => { tone(2600, 0.09, 'square', 0.14); tone(3400, 0.07, 'sine', 0.1); },
  shieldHit: () => tone(1200, 0.08, 'triangle', 0.14, 1.6),
  hurt: () => tone(160, 0.18, 'sawtooth', 0.18, 0.5),
  pickup: () => { tone(660, 0.08, 'triangle', 0.15); setTimeout(() => tone(990, 0.1, 'triangle', 0.15), 60); },
  chest: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'triangle', 0.14), i * 70)); },
  build: () => tone(300, 0.08, 'square', 0.12, 1.5),
  harvest: () => tone(420 + Math.random() * 80, 0.06, 'square', 0.1, 0.7),
  reload: () => { tone(500, 0.05, 'square', 0.08); setTimeout(() => tone(700, 0.05, 'square', 0.08), 120); },
  elim: () => { tone(880, 0.12, 'triangle', 0.2); setTimeout(() => tone(1320, 0.2, 'triangle', 0.2), 90); },
  click: () => tone(900, 0.03, 'square', 0.06),
  heal: () => tone(520, 0.3, 'sine', 0.12, 1.5),
  storm: () => tone(90, 0.8, 'sawtooth', 0.08, 0.7),
  victory: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.35, 'triangle', 0.18), i * 120)); },
};
