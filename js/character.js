// Procedural low-poly characters + held weapon models. Shared geometries keep
// memory low; per-skin materials are cached.
import * as THREE from 'three';
import { RARITY_HEX } from './config.js';

const G = {
  torso: new THREE.BoxGeometry(0.62, 0.7, 0.36),
  hips: new THREE.BoxGeometry(0.58, 0.22, 0.34),
  head: new THREE.BoxGeometry(0.42, 0.44, 0.42),
  hair: new THREE.BoxGeometry(0.46, 0.16, 0.46),
  visor: new THREE.BoxGeometry(0.34, 0.12, 0.05),
  upperArm: new THREE.BoxGeometry(0.18, 0.4, 0.18),
  lowerArm: new THREE.BoxGeometry(0.16, 0.38, 0.16),
  leg: new THREE.BoxGeometry(0.22, 0.44, 0.24),
  shin: new THREE.BoxGeometry(0.2, 0.44, 0.22),
  boot: new THREE.BoxGeometry(0.22, 0.12, 0.32),
  pack: new THREE.BoxGeometry(0.42, 0.46, 0.18),
};
for (const k in G) G[k].translate(0, k === 'upperArm' || k === 'lowerArm' || k === 'leg' || k === 'shin' ? -0.2 : 0, 0);

const matCache = new Map();
function lam(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}

export const SKINS = [
  { shirt: 0x3a7bd5, pants: 0x2d3142, skin: 0xf1c27d, hair: 0x4a2c17, pack: 0xffb400 },
  { shirt: 0xe94f37, pants: 0x393e41, skin: 0xc68642, hair: 0x111111, pack: 0x44bba4 },
  { shirt: 0x44bba4, pants: 0x3f3f37, skin: 0xe0ac69, hair: 0xd4a017, pack: 0xe94f37 },
  { shirt: 0x8e44ad, pants: 0x222222, skin: 0x8d5524, hair: 0x222222, pack: 0xf1c40f },
  { shirt: 0xf39c12, pants: 0x34495e, skin: 0xffdbac, hair: 0xa0522d, pack: 0x2980b9 },
  { shirt: 0x27ae60, pants: 0x5d4037, skin: 0xf1c27d, hair: 0x5d4037, pack: 0xecf0f1 },
  { shirt: 0xecf0f1, pants: 0xc0392b, skin: 0xc68642, hair: 0xecf0f1, pack: 0x2c3e50 },
  { shirt: 0x1abc9c, pants: 0x2c3e50, skin: 0xe0ac69, hair: 0xff6f91, pack: 0xff6f91 },
  { shirt: 0xd35400, pants: 0x1b1b1b, skin: 0xffdbac, hair: 0x1b1b1b, pack: 0x95a5a6 },
  { shirt: 0x2c3e50, pants: 0x7f8c8d, skin: 0x8d5524, hair: 0xe67e22, pack: 0xe74c3c },
];

function part(geo, mat, parent, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export function makeCharacter(skin) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const sm = lam(skin.shirt), pm = lam(skin.pants), km = lam(skin.skin), hm = lam(skin.hair);
  const hips = part(G.hips, pm, body, 0, 0.98, 0);
  const torso = new THREE.Group(); torso.position.set(0, 1.08, 0); body.add(torso);
  part(G.torso, sm, torso, 0, 0.35, 0);
  part(G.pack, lam(skin.pack), torso, 0, 0.38, -0.27);
  const head = new THREE.Group(); head.position.set(0, 0.72, 0); torso.add(head);
  part(G.head, km, head, 0, 0.22, 0);
  part(G.hair, hm, head, 0, 0.46, -0.01);
  part(G.visor, lam(0x1d1d27), head, 0, 0.27, 0.215);
  const mkArm = (side) => {
    const sh = new THREE.Group(); sh.position.set(side * 0.41, 0.62, 0); torso.add(sh);
    part(G.upperArm, sm, sh, 0, 0, 0);
    const el = new THREE.Group(); el.position.set(0, -0.4, 0); sh.add(el);
    part(G.lowerArm, km, el, 0, 0, 0);
    return { sh, el };
  };
  const mkLeg = (side) => {
    const hp = new THREE.Group(); hp.position.set(side * 0.15, 0.92, 0); body.add(hp);
    part(G.leg, pm, hp, 0, 0, 0);
    const kn = new THREE.Group(); kn.position.set(0, -0.44, 0); hp.add(kn);
    part(G.shin, pm, kn, 0, 0, 0);
    part(G.boot, lam(0x222222), kn, 0, -0.44, 0.04);
    return { hp, kn };
  };
  // facing +z, the character's right side is -x
  const armL = mkArm(1), armR = mkArm(-1), legL = mkLeg(1), legR = mkLeg(-1);
  const hand = new THREE.Group(); hand.position.set(0, -0.38, 0.04); armR.el.add(hand);

  // glider (hidden until deployed)
  const glider = new THREE.Group();
  const canopyGeo = new THREE.BufferGeometry();
  canopyGeo.setAttribute('position', new THREE.Float32BufferAttribute([-2.2, 0, -0.6, 2.2, 0, -0.6, 0, 0.3, 1.4, -2.2, 0, -0.6, 0, 0.3, 1.4, 2.2, 0, -0.6], 3));
  canopyGeo.computeVertexNormals();
  const canopy = new THREE.Mesh(canopyGeo, new THREE.MeshLambertMaterial({ color: skin.pack, side: THREE.DoubleSide }));
  canopy.position.y = 2.9; glider.add(canopy);
  const barGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.4, 4);
  for (const sx of [-0.5, 0.5]) { const b = new THREE.Mesh(barGeo, lam(0x333333)); b.position.set(sx, 2.25, 0.2); b.rotation.z = sx * 0.5; glider.add(b); }
  glider.visible = false;
  root.add(glider);

  return { root, body, torso, head, armL, armR, legL, legR, hand, glider, weapon: null, weaponKey: '', phase: 0 };
}

// ------------------------------------------------------------------ weapons
const wcache = new Map();
function weaponParts(type) {
  const dark = lam(0x2a2d34), mid = lam(0x4a4f5a), woodM = lam(0x8b5a2b);
  const parts = [];
  const add = (w, h, d, x, y, z, m) => parts.push({ g: new THREE.BoxGeometry(w, h, d), x, y, z, m });
  switch (type) {
    case 'ar': add(0.08, 0.12, 0.7, 0, 0, 0.2, dark); add(0.06, 0.06, 0.4, 0, 0.02, 0.7, mid); add(0.07, 0.18, 0.08, 0, -0.13, 0.15, mid); add(0.08, 0.12, 0.25, 0, -0.02, -0.25, 'accent'); break;
    case 'shotgun': add(0.09, 0.1, 0.55, 0, 0, 0.25, mid); add(0.07, 0.07, 0.5, 0, 0.03, 0.7, dark); add(0.09, 0.12, 0.3, 0, -0.03, -0.18, woodM); add(0.08, 0.06, 0.2, 0, -0.06, 0.55, 'accent'); break;
    case 'smg': add(0.08, 0.13, 0.45, 0, 0, 0.12, dark); add(0.05, 0.05, 0.18, 0, 0.02, 0.43, mid); add(0.06, 0.22, 0.07, 0, -0.16, 0.12, 'accent'); break;
    case 'sniper': add(0.08, 0.11, 0.9, 0, 0, 0.3, 'accent'); add(0.05, 0.05, 0.6, 0, 0.02, 0.95, dark); add(0.07, 0.07, 0.35, 0, 0.12, 0.25, dark); add(0.09, 0.14, 0.3, 0, -0.03, -0.25, woodM); break;
    case 'pistol': add(0.07, 0.1, 0.3, 0, 0, 0.1, 'accent'); add(0.06, 0.16, 0.07, 0, -0.1, 0, dark); break;
    case 'pickaxe': add(0.05, 0.05, 0.9, 0, 0, 0.3, woodM); add(0.06, 0.5, 0.08, 0, 0.0, 0.72, lam(0x8fd3ff)); break;
    case 'bandage': add(0.18, 0.18, 0.18, 0, 0, 0.1, lam(0xf5f0e1)); break;
    case 'medkit': add(0.3, 0.22, 0.12, 0, 0, 0.1, lam(0xffffff)); add(0.31, 0.06, 0.13, 0, 0, 0.1, lam(0xe53935)); break;
    case 'shield': add(0.14, 0.24, 0.14, 0, 0, 0.1, lam(0x3fa9ff)); break;
    default: add(0.1, 0.1, 0.1, 0, 0, 0, dark);
  }
  return parts;
}

export function makeWeaponModel(type, rarity = 0) {
  const k = type + rarity;
  const g = new THREE.Group();
  if (!wcache.has(k)) wcache.set(k, weaponParts(type));
  for (const p of wcache.get(k)) {
    const m = new THREE.Mesh(p.g, p.m === 'accent' ? lam(RARITY_HEX[rarity]) : p.m);
    m.position.set(p.x, p.y, p.z);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

export function setHeld(ch, key, type, rarity) {
  if (ch.weaponKey === key) return;
  if (ch.weapon) ch.hand.remove(ch.weapon);
  ch.weapon = type ? makeWeaponModel(type, rarity) : null;
  if (ch.weapon) {
    ch.weapon.rotation.x = Math.PI / 2;
    ch.weapon.scale.setScalar(1.4);
    ch.hand.add(ch.weapon);
  }
  ch.weaponKey = key;
}

// pose: speed (m/s), onGround, pitch, mode ('ground'|'sky'|'glide'|'bus'), aiming, firing kick, swing (melee 0..1)
export function animateCharacter(ch, dt, s) {
  const run = Math.min(1, s.speed / 7);
  if (s.onGround) ch.phase += dt * (4 + s.speed * 1.4);
  const ph = ch.phase;
  const sw = Math.sin(ph) * 0.9 * run;
  ch.glider.visible = s.mode === 'glide';
  ch.body.rotation.set(0, 0, 0);
  ch.body.position.y = 0;
  if (s.mode === 'sky') {
    ch.body.rotation.x = 1.25;
    ch.body.position.y = 0.9;
    ch.legL.hp.rotation.x = 0.4; ch.legR.hp.rotation.x = 0.4;
    ch.legL.kn.rotation.x = 0.7; ch.legR.kn.rotation.x = 0.7;
    ch.armL.sh.rotation.set(-0.3, 0, 1.3); ch.armR.sh.rotation.set(-0.3, 0, -1.3);
    ch.armL.el.rotation.x = 0; ch.armR.el.rotation.x = 0;
    ch.torso.rotation.set(0, 0, 0); ch.head.rotation.x = -0.9;
    return;
  }
  if (s.mode === 'glide') {
    ch.legL.hp.rotation.x = 0.25; ch.legR.hp.rotation.x = -0.1; ch.legL.kn.rotation.x = 0.4; ch.legR.kn.rotation.x = 0.3;
    ch.armL.sh.rotation.set(0, 0, 2.6); ch.armR.sh.rotation.set(0, 0, -2.6);
    ch.armL.el.rotation.x = 0; ch.armR.el.rotation.x = 0;
    ch.torso.rotation.set(0, 0, 0); ch.head.rotation.x = 0;
    return;
  }
  const air = !s.onGround;
  ch.legL.hp.rotation.x = air ? -0.6 : sw;
  ch.legR.hp.rotation.x = air ? 0.3 : -sw;
  ch.legL.kn.rotation.x = air ? 0.9 : Math.max(0, -Math.sin(ph)) * 1.1 * run + 0.05;
  ch.legR.kn.rotation.x = air ? 0.5 : Math.max(0, Math.sin(ph)) * 1.1 * run + 0.05;
  ch.body.position.y = s.onGround ? Math.abs(Math.cos(ph)) * 0.06 * run : 0;
  const pitch = Math.max(-1.1, Math.min(1.1, s.pitch));
  ch.torso.rotation.set(-pitch * 0.35, 0, 0);
  ch.head.rotation.x = -pitch * 0.4;
  if (s.holding === 'pickaxe' || s.holding === 'heal') {
    const swing = s.swing || 0;
    ch.armR.sh.rotation.set(-0.6 - Math.sin(swing * Math.PI) * 1.9, 0, -0.1);
    ch.armR.el.rotation.x = -0.6;
    ch.armL.sh.rotation.set(-sw * 0.6, 0, 0.1);
    ch.armL.el.rotation.x = -0.3;
  } else if (s.holding) {
    const kick = s.kick || 0;
    const aimP = -1.45 - pitch * 0.6 + kick * 0.25;
    ch.armR.sh.rotation.set(aimP, 0, 0);
    ch.armR.el.rotation.x = -0.1;
    ch.armL.sh.rotation.set(aimP + 0.1, -0.6, 0);
    ch.armL.el.rotation.x = -0.75;
  } else {
    ch.armR.sh.rotation.set(-sw * 0.7, 0, -0.1);
    ch.armL.sh.rotation.set(sw * 0.7, 0, 0.1);
    ch.armR.el.rotation.x = -0.4; ch.armL.el.rotation.x = -0.4;
  }
}
