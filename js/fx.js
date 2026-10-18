// Pooled visual effects: tracers (one LineSegments draw), particles (one Points
// draw), muzzle flashes. No per-shot allocations.
import * as THREE from 'three';
import { G } from './state.js';

const MAX_TRACERS = 128;
const MAX_PARTS = 800;
let tracerGeo, tracerPos, tracerCol, tracers = [];
let partGeo, partPos, partCol, parts = [];
let flash;

export function initFx(scene) {
  tracerGeo = new THREE.BufferGeometry();
  tracerPos = new Float32Array(MAX_TRACERS * 6);
  tracerCol = new Float32Array(MAX_TRACERS * 6);
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3).setUsage(THREE.DynamicDrawUsage));
  tracerGeo.setAttribute('color', new THREE.BufferAttribute(tracerCol, 3).setUsage(THREE.DynamicDrawUsage));
  const tl = new THREE.LineSegments(tracerGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  tl.frustumCulled = false;
  scene.add(tl);

  partGeo = new THREE.BufferGeometry();
  partPos = new Float32Array(MAX_PARTS * 3);
  partCol = new Float32Array(MAX_PARTS * 3);
  partGeo.setAttribute('position', new THREE.BufferAttribute(partPos, 3).setUsage(THREE.DynamicDrawUsage));
  partGeo.setAttribute('color', new THREE.BufferAttribute(partCol, 3).setUsage(THREE.DynamicDrawUsage));
  const pm = new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true });
  const pts = new THREE.Points(partGeo, pm);
  pts.frustumCulled = false;
  scene.add(pts);

  flash = new THREE.PointLight(0xffc066, 0, 9, 2);
  scene.add(flash);
}

const c3 = new THREE.Color();
export function addTracer(from, to, color = 0xfff2a8, life = 0.07) {
  if (tracers.length >= MAX_TRACERS) tracers.shift();
  tracers.push({ a: from.clone(), b: to.clone(), color: c3.set(color).clone(), life, max: life });
}

export function burst(pos, color, n = 8, speed = 4, life = 0.5, up = 2) {
  const col = c3.set(color);
  for (let i = 0; i < n; i++) {
    if (parts.length >= MAX_PARTS) parts.shift();
    parts.push({
      x: pos.x, y: pos.y, z: pos.z,
      vx: (Math.random() - 0.5) * speed, vy: Math.random() * speed * 0.5 + up, vz: (Math.random() - 0.5) * speed,
      r: col.r, g: col.g, b: col.b, life: life * (0.6 + Math.random() * 0.6),
    });
  }
}

let flashT = 0;
export function muzzleFlash(pos) {
  flash.position.copy(pos);
  flash.intensity = 6;
  flashT = 0.05;
}

export function updateFx(dt) {
  // tracers
  let n = 0;
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.life -= dt;
    if (t.life <= 0) { tracers.splice(i, 1); continue; }
  }
  for (const t of tracers) {
    const k = t.life / t.max;
    const o = n * 6;
    tracerPos[o] = t.a.x; tracerPos[o + 1] = t.a.y; tracerPos[o + 2] = t.a.z;
    tracerPos[o + 3] = t.b.x; tracerPos[o + 4] = t.b.y; tracerPos[o + 5] = t.b.z;
    tracerCol[o] = t.color.r * k * 0.4; tracerCol[o + 1] = t.color.g * k * 0.4; tracerCol[o + 2] = t.color.b * k * 0.4;
    tracerCol[o + 3] = t.color.r * k; tracerCol[o + 4] = t.color.g * k; tracerCol[o + 5] = t.color.b * k;
    n++;
  }
  tracerGeo.setDrawRange(0, n * 2);
  tracerGeo.attributes.position.needsUpdate = true;
  tracerGeo.attributes.color.needsUpdate = true;

  // particles
  let m = 0;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vy -= 14 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  }
  for (const p of parts) {
    partPos[m * 3] = p.x; partPos[m * 3 + 1] = p.y; partPos[m * 3 + 2] = p.z;
    const k = Math.min(1, p.life * 3);
    partCol[m * 3] = p.r * k; partCol[m * 3 + 1] = p.g * k; partCol[m * 3 + 2] = p.b * k;
    m++;
  }
  partGeo.setDrawRange(0, m);
  partGeo.attributes.position.needsUpdate = true;
  partGeo.attributes.color.needsUpdate = true;

  if (flashT > 0) { flashT -= dt; if (flashT <= 0) flash.intensity = 0; }
}

export function clearFx() { tracers.length = 0; parts.length = 0; }
