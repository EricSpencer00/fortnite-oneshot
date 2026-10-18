// The Fortnite-flavoured extras: loot llamas, supply drops, XP popups,
// confetti and juicy little effects.
import * as THREE from 'three';
import { G } from './state.js';
import { terrainHeight } from './terrain.js';
import { burst } from './fx.js';
import { sfx } from './audio.js';
import { HALF } from './config.js';

// ---------------------------------------------------------------- XP
let xpEl = null;
export function xp(label, amount) {
  G.stats.xp = (G.stats.xp || 0) + amount;
  if (!xpEl) xpEl = document.getElementById('xpfeed');
  if (!xpEl) return;
  const d = document.createElement('div');
  d.innerHTML = `<b>+${amount}</b> ${label}`;
  xpEl.prepend(d);
  while (xpEl.children.length > 5) xpEl.lastChild.remove();
  setTimeout(() => d.classList.add('out'), 2200);
  setTimeout(() => d.remove(), 2700);
}

// ---------------------------------------------------------------- llamas
const L = (c) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.25 });
function llamaMesh() {
  const g = new THREE.Group();
  const purple = L(0x9b4dff), light = L(0xd7b6ff), pink = L(0xff6fb5);
  const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
  box(1.0, 0.8, 1.6, 0, 1.2, 0, purple);          // body
  box(1.02, 0.2, 1.62, 0, 1.25, 0, light);         // stripe
  box(0.4, 1.0, 0.4, 0, 1.9, 0.65, purple);        // neck
  box(0.5, 0.45, 0.7, 0, 2.5, 0.8, purple);        // head
  box(0.36, 0.2, 0.3, 0, 2.38, 1.2, light);        // snout
  box(0.12, 0.35, 0.12, 0.16, 2.9, 0.68, pink);    // ears
  box(0.12, 0.35, 0.12, -0.16, 2.9, 0.68, pink);
  for (const [x, z] of [[0.35, 0.6], [-0.35, 0.6], [0.35, -0.6], [-0.35, -0.6]]) box(0.22, 0.85, 0.22, x, 0.42, z, purple);
  box(0.25, 0.25, 0.4, 0, 1.45, -0.95, pink);      // tail
  return g;
}

function dropMesh() {
  const g = new THREE.Group();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 1.5), new THREE.MeshLambertMaterial({ map: G.tex.metal, color: 0x7fb8ff, emissive: 0x1a4a99, emissiveIntensity: 0.35 }));
  crate.position.y = 0.6; crate.castShadow = true; g.add(crate);
  const balloons = new THREE.Group();
  const bm = [0x4fc3ff, 0xffffff, 0x4fc3ff].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  [[-0.7, 0], [0.7, 0], [0, 0.6]].forEach(([x, z], i) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), bm[i]); b.scale.y = 1.2; b.position.set(x, 4.2 + i * 0.3, z); balloons.add(b);
  });
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 3, 4), new THREE.MeshBasicMaterial({ color: 0xdddddd }));
  rope.position.y = 2.6; balloons.add(rope);
  g.add(balloons);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.6, 60, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x55aaff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 30; g.add(beam);
  g.userData = { balloons, beam };
  return g;
}

export function seedLlamas(n = 3) {
  for (let i = 0; i < n; i++) {
    let x, z, y, tries = 0;
    do { const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * (HALF * 0.7); x = Math.cos(a) * r; z = Math.sin(a) * r; y = terrainHeight(x, z); tries++; }
    while ((y < 2.5 || G.world.inHouse(x, z, 3)) && tries < 50);
    const m = llamaMesh();
    m.position.set(x, y, z); m.rotation.y = Math.random() * 6.28;
    G.scene.add(m);
    G.chests.push({ kind: 'llama', x, y, z, mesh: m, opened: false, openT: 0 });
  }
}

export function spawnSupplyDrop() {
  const s = G.storm;
  let x, z, y, tries = 0;
  do { const a = Math.random() * Math.PI * 2, r = Math.random() * s.toR * 0.8; x = s.toX + Math.cos(a) * r; z = s.toZ + Math.sin(a) * r; y = terrainHeight(x, z); tries++; }
  while ((y < 1.5 || G.world.inHouse(x, z, 2)) && tries < 50);
  const m = dropMesh();
  m.position.set(x, y + 90, z);
  G.scene.add(m);
  G.chests.push({ kind: 'drop', x, y, z, mesh: m, opened: false, locked: true, openT: 0 });
  return { x, z };
}

export function updateSpecials(dt, time) {
  for (const c of G.chests) {
    if (c.kind === 'llama' && !c.opened) {
      c.mesh.position.y = c.y + 0.25 + Math.sin(time * 2 + c.x) * 0.2;
      c.mesh.rotation.y += dt * 0.8;
    } else if (c.kind === 'drop') {
      const ud = c.mesh.userData;
      if (c.locked) {
        c.mesh.position.y = Math.max(c.y, c.mesh.position.y - dt * 7);
        c.mesh.rotation.y += dt * 0.3;
        if (c.mesh.position.y <= c.y) {
          c.locked = false;
          burst(new THREE.Vector3(c.x, c.y + 0.5, c.z), 0xd9c7a0, 30, 7, 0.9);
          if (G.player.pos.distanceTo(c.mesh.position) < 80) sfx.dropLand();
        }
      }
      ud.beam.material.opacity = c.opened ? 0 : 0.18 + Math.sin(time * 3) * 0.06;
      if (!c.locked) ud.balloons.position.y = Math.min(40, ud.balloons.position.y + dt * (c.opened ? 8 : 0.6));
    }
  }
}

// ---------------------------------------------------------------- confetti
let confettiT = 0;
export function confetti(pos) {
  const cols = [0xff4d6d, 0xffd23f, 0x3fb8ff, 0x5ee05e, 0xb35cf0];
  for (const c of cols) burst(pos, c, 10, 9, 1.6, 9);
}
export function updateConfetti(dt, pos, on) {
  if (!on) return;
  confettiT -= dt;
  if (confettiT <= 0) { confettiT = 0.35; confetti(new THREE.Vector3(pos.x + (Math.random() - 0.5) * 4, pos.y + 2.5, pos.z + (Math.random() - 0.5) * 4)); }
}

// ---------------------------------------------------------------- small effects
export function landingPuff(pos) { burst(new THREE.Vector3(pos.x, pos.y + 0.1, pos.z), 0xd8c9a3, 22, 6, 0.6, 1); }
export function shieldBreakFx(pos) { burst(pos, 0x7fd4ff, 26, 7, 0.6, 2); burst(pos, 0xffffff, 10, 5, 0.4, 2); }
export function bodyGoneFx(a) {
  const p = new THREE.Vector3(a.pos.x, a.pos.y + 0.8, a.pos.z);
  burst(p, 0x6fe3ff, 30, 2.5, 1.2, 6);
  burst(p, 0xffffff, 12, 2, 0.9, 7);
}
export function contrail(pos) { burst(pos, 0xffffff, 1, 0.5, 0.5, 0.5); }
