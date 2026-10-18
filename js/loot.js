// Floor loot + chests.
import * as THREE from 'three';
import { LOOT_WEAPONS, LOOT_WEIGHTS, WEAPONS, RARITY_HEX, HEALS, AMMO_GIVE, MATS } from './config.js';
import { makeWeaponModel } from './character.js';
import { G } from './state.js';
import { terrainHeight } from './terrain.js';
import { groundHeight } from './physics.js';
import { burst } from './fx.js';

let ringGeo, ringMats, beamGeo, ammoGeo, matGeo;

function init() {
  ringGeo = new THREE.RingGeometry(0.35, 0.6, 24); ringGeo.rotateX(-Math.PI / 2);
  beamGeo = new THREE.CylinderGeometry(0.06, 0.18, 2.2, 6, 1, true); beamGeo.translate(0, 1.1, 0);
  ringMats = RARITY_HEX.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ammoGeo = new THREE.BoxGeometry(0.35, 0.22, 0.25);
  matGeo = new THREE.BoxGeometry(0.5, 0.18, 0.3);
}

export function rollRarity(luck = 0) {
  const r = Math.random() + luck;
  return r > 0.97 ? 4 : r > 0.87 ? 3 : r > 0.68 ? 2 : r > 0.42 ? 1 : 0;
}
export function randomWeapon(luck = 0) {
  let r = Math.random(), type = LOOT_WEAPONS[0];
  for (let i = 0; i < LOOT_WEAPONS.length; i++) { r -= LOOT_WEIGHTS[i]; if (r <= 0) { type = LOOT_WEAPONS[i]; break; } }
  return { kind: 'weapon', type, rarity: rollRarity(luck), mag: WEAPONS[type].mag };
}
export function randomHeal() {
  const r = Math.random();
  const type = r < 0.45 ? 'bandage' : r < 0.75 ? 'shield' : 'medkit';
  return { kind: 'heal', type, count: HEALS[type].give };
}

const AMMO_COL = { light: 0x9ec9ff, medium: 0x7ddc6d, heavy: 0xff9a5c, shells: 0xffd04d };
const MAT_COL = [0xa0703c, 0x9a9a9a, 0xd5dde5];

export function spawnLoot(item, x, y, z, toss = false) {
  if (!ringGeo) init();
  const g = new THREE.Group();
  let model;
  if (item.kind === 'weapon' || item.kind === 'heal') {
    model = makeWeaponModel(item.type, item.rarity || 0);
    model.scale.setScalar(item.kind === 'heal' ? 1.6 : 1.3);
    model.position.y = 0.55;
    model.rotation.z = item.kind === 'weapon' ? 0 : 0;
    g.add(model);
    const rar = item.kind === 'weapon' ? item.rarity : 1;
    const ring = new THREE.Mesh(ringGeo, ringMats[rar]); ring.position.y = 0.05; g.add(ring);
    if (item.kind === 'weapon' && item.rarity >= 2) { const beam = new THREE.Mesh(beamGeo, ringMats[rar]); g.add(beam); }
  } else if (item.kind === 'ammo') {
    model = new THREE.Mesh(ammoGeo, new THREE.MeshLambertMaterial({ color: AMMO_COL[item.type] }));
    model.position.y = 0.2; g.add(model);
  } else {
    model = new THREE.Mesh(matGeo, new THREE.MeshLambertMaterial({ color: MAT_COL[MATS.indexOf(item.type)] }));
    model.position.y = 0.2; g.add(model);
  }
  g.position.set(x, y, z);
  G.scene.add(g);
  const l = { item, mesh: g, model, x, y, z, vy: toss ? 5 : 0, vx: toss ? (Math.random() - 0.5) * 4 : 0, vz: toss ? (Math.random() - 0.5) * 4 : 0, settled: !toss, spin: Math.random() * 6 };
  G.loot.push(l);
  return l;
}

export function removeLoot(l) {
  G.scene.remove(l.mesh);
  const i = G.loot.indexOf(l);
  if (i >= 0) G.loot.splice(i, 1);
}

export function clearLoot() { for (const l of [...G.loot]) removeLoot(l); }

export function updateLoot(dt, time) {
  const px = G.player.pos.x, pz = G.player.pos.z;
  for (const l of G.loot) {
    if (!l.settled) {
      l.vy -= 20 * dt;
      l.x += l.vx * dt; l.z += l.vz * dt; l.y += l.vy * dt;
      const gy = groundHeight(l.x, l.z, l.y + 0.3, 0.1);
      if (l.y <= gy) { l.y = gy; l.settled = true; }
      l.mesh.position.set(l.x, l.y, l.z);
    }
    const dx = l.x - px, dz = l.z - pz;
    const near = dx * dx + dz * dz < 3600;
    l.mesh.visible = near;
    if (near && l.model) { l.model.rotation.y = time * 1.5 + l.spin; l.model.position.y = (l.item.kind === 'weapon' || l.item.kind === 'heal' ? 0.55 : 0.2) + Math.sin(time * 2 + l.spin) * 0.07; }
  }
}

export function nearestLoot(pos, maxD, filter) {
  let best = null, bd = maxD * maxD;
  for (const l of G.loot) {
    if (filter && !filter(l)) continue;
    const dx = l.x - pos.x, dy = l.y - pos.y, dz = l.z - pos.z;
    const d = dx * dx + dz * dz + dy * dy * 0.5;
    if (d < bd) { bd = d; best = l; }
  }
  return best;
}

export function seedFloorLoot() {
  for (const s of G.world.lootSpots) {
    if (Math.random() < 0.15) continue;
    const r = Math.random();
    let item;
    if (r < 0.55) item = randomWeapon();
    else if (r < 0.8) item = randomHeal();
    else { const t = ['light', 'medium', 'heavy', 'shells'][Math.floor(Math.random() * 4)]; item = { kind: 'ammo', type: t, count: AMMO_GIVE[t] }; }
    spawnLoot(item, s.x, s.y, s.z);
    if (item.kind === 'weapon') {
      const a = WEAPONS[item.type].ammo;
      spawnLoot({ kind: 'ammo', type: a, count: AMMO_GIVE[a] }, s.x + 0.8, s.y, s.z + 0.3);
    }
  }
}

// ---------------------------------------------------------------- chests
let chestGeoBase, chestGeoLid, chestMats;
export function seedChests() {
  if (!chestGeoBase) {
    chestGeoBase = new THREE.BoxGeometry(1.2, 0.6, 0.75); chestGeoBase.translate(0, 0.3, 0);
    chestGeoLid = new THREE.BoxGeometry(1.2, 0.28, 0.75); chestGeoLid.translate(0, 0.14, 0.375);
    const tm = new THREE.MeshLambertMaterial({ map: G.tex.chest, emissive: 0x553300, emissiveIntensity: 0.4 });
    const side = new THREE.MeshLambertMaterial({ map: G.tex.wood, color: 0xcfa060, emissive: 0x553300, emissiveIntensity: 0.4 });
    chestMats = [side, side, side, side, tm, side];
  }
  for (const c of G.chests) G.scene.remove(c.mesh);
  G.chests.length = 0;
  for (const s of G.world.chests) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(chestGeoBase, chestMats);
    const lidPivot = new THREE.Group(); lidPivot.position.set(0, 0.6, -0.375);
    const lid = new THREE.Mesh(chestGeoLid, chestMats);
    lidPivot.add(lid);
    g.add(base, lidPivot);
    g.position.set(s.x, s.y, s.z); g.rotation.y = s.rot;
    base.castShadow = true;
    G.scene.add(g);
    G.chests.push({ x: s.x, y: s.y, z: s.z, mesh: g, lid: lidPivot, opened: false, openT: 0 });
  }
}

export function openChest(c, by) {
  if (c.opened) return;
  c.opened = true;
  const fx = Math.sin(c.mesh.rotation.y), fz = Math.cos(c.mesh.rotation.y);
  const w = randomWeapon(0.12);
  const drop = (item) => spawnLoot(item, c.x + fx * 0.9, c.y + 0.6, c.z + fz * 0.9, true);
  drop(w);
  drop({ kind: 'ammo', type: WEAPONS[w.type].ammo, count: AMMO_GIVE[WEAPONS[w.type].ammo] * 2 });
  drop(randomHeal());
  drop({ kind: 'mat', type: 'wood', count: 30 });
  burst(new THREE.Vector3(c.x, c.y + 1, c.z), 0xffd700, 24, 5, 0.8);
}

export function updateChests(dt, time) {
  for (const c of G.chests) {
    if (c.opened && c.openT < 1) { c.openT = Math.min(1, c.openT + dt * 3); c.lid.rotation.x = -c.openT * 1.9; }
  }
  // pulse glow
  if (chestMats) chestMats[4].emissiveIntensity = chestMats[0].emissiveIntensity = 0.35 + Math.sin(time * 4) * 0.2;
}

export function nearestChest(pos, maxD) {
  let best = null, bd = maxD * maxD;
  for (const c of G.chests) {
    if (c.opened) continue;
    const dx = c.x - pos.x, dy = c.y - pos.y, dz = c.z - pos.z;
    const d = dx * dx + dz * dz + dy * dy;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function dropInventory(a) {
  const drop = (item) => spawnLoot(item, a.pos.x, a.pos.y + 1, a.pos.z, true);
  for (const s of a.slots) if (s) drop({ ...s });
  for (const t in a.ammo) if (a.ammo[t] > 0) drop({ kind: 'ammo', type: t, count: a.ammo[t] });
  if (!a.isPlayer) {
    const gun = a.slots.find((s) => s && s.kind === 'weapon');
    if (gun) drop({ kind: 'ammo', type: WEAPONS[gun.type].ammo, count: AMMO_GIVE[WEAPONS[gun.type].ammo] });
  }
  MATS.forEach((m) => { const n = Math.min(a.mats[m], 60); if (n > 0) drop({ kind: 'mat', type: m, count: n }); });
}
