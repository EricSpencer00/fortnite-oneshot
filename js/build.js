// Fortnite-style building: walls, floors, ramps on a 4 m grid.
import * as THREE from 'three';
import { CELL, MATS, MAT_HP, MAT_COST } from './config.js';
import { addCollider, removeCollider, queryBox, rampHeightAt } from './physics.js';
import { G } from './state.js';
import { burst } from './fx.js';
import { sfx } from './audio.js';

export const PIECES = ['wall', 'floor', 'ramp'];
let geos = null, ghost = null, ghostMats = null;

function rampGeo() {
  // a slab rising along +z from y=0 to y=CELL
  const g = new THREE.BoxGeometry(CELL, 0.22, CELL * Math.SQRT2);
  g.rotateX(-Math.PI / 4);
  g.translate(0, CELL / 2, 0);
  // world-ish uv scale
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.5, uv.getY(i) * 1.5);
  return g;
}
function initGeos() {
  const s = (g, k) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k); return g; };
  geos = {
    wall: s(new THREE.BoxGeometry(CELL, CELL, 0.25).translate(0, CELL / 2, 0), 1.5),
    floor: s(new THREE.BoxGeometry(CELL, 0.25, CELL).translate(0, -0.105, 0), 1.5), // top 2cm proud: no z-fighting with floors it sits on
    ramp: rampGeo(),
  };
  ghostMats = [
    new THREE.MeshBasicMaterial({ color: 0x55c8ff, transparent: true, opacity: 0.35, depthWrite: false }),
    new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.35, depthWrite: false }),
  ];
  ghost = new THREE.Mesh(geos.wall, ghostMats[0]);
  ghost.visible = false;
  ghost.renderOrder = 5;
  G.scene.add(ghost);
}

const dirVec = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // 0:+z 1:+x 2:-z 3:-x
export function yawToDir(yaw) {
  const a = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.round(a / (Math.PI / 2)) % 4; // yaw 0 = +z, yaw pi/2 = +x
}

// Where would this actor place `type`? returns {type, cx, cz, y, dir}
export function computePlacement(actor, type, pitch = 0) {
  const dir = yawToDir(actor.yaw);
  const [fx, fz] = dirVec[dir];
  // base level: top of the build/house surface we're standing on, else feet
  let base = actor.pos.y;
  const under = queryBox(actor.pos.x - 0.2, actor.pos.z - 0.2, actor.pos.x + 0.2, actor.pos.z + 0.2);
  if (actor.onGround) {
    for (const c of under) {
      if (c.kind !== 'build') continue;
      const inside = actor.pos.x >= c.minX && actor.pos.x <= c.maxX && actor.pos.z >= c.minZ && actor.pos.z <= c.maxZ;
      if (c.ramp && inside && Math.abs(actor.pos.y - rampHeightAt(c, actor.pos.x, actor.pos.z)) < 0.35) {
        // continuing up a ramp: next piece goes in the next cell, starting at its top
        if (type !== 'wall' && c.ref.dir === dir) return { type, cx: c.ref.cx + fx, cz: c.ref.cz + fz, y: c.ref.y + CELL, dir };
        base = c.ref.y;
        break;
      }
      if (c.ref.type === 'floor' && Math.abs(actor.pos.y - c.maxY) < 0.3) { base = c.ref.y; break; }
    }
  }
  base = Math.round(base * 10) / 10;
  if (pitch > 0.55 && type !== 'ramp') base += CELL;
  let cx = Math.floor(actor.pos.x / CELL), cz = Math.floor(actor.pos.z / CELL);
  if (type === 'wall') {
    // wall on the far edge of the current cell
    const lx = actor.pos.x / CELL - cx, lz = actor.pos.z / CELL - cz;
    // if we're right against the edge, still use this cell; if far from it, also fine
    void lx; void lz;
    return { type, cx, cz, y: base, dir };
  }
  // floors/ramps go in the next cell over unless we're still near the back of this one
  const lx = actor.pos.x / CELL - cx, lz = actor.pos.z / CELL - cz;
  const along = fx ? (fx > 0 ? lx : 1 - lx) : (fz > 0 ? lz : 1 - lz);
  if (along > 0.35 || type === 'floor') { cx += fx; cz += fz; }
  if (type === 'floor' && pitch < -0.6) { cx -= fx; cz -= fz; }
  return { type, cx, cz, y: base, dir };
}

function pieceBox(p) {
  const x0 = p.cx * CELL, z0 = p.cz * CELL;
  if (p.type === 'floor') return { minX: x0, minY: p.y - 0.23, minZ: z0, maxX: x0 + CELL, maxY: p.y + 0.02, maxZ: z0 + CELL };
  if (p.type === 'ramp') return { minX: x0, minY: p.y, minZ: z0, maxX: x0 + CELL, maxY: p.y + CELL, maxZ: z0 + CELL };
  const t = 0.14;
  switch (p.dir) {
    case 0: return { minX: x0, minY: p.y, minZ: z0 + CELL - t, maxX: x0 + CELL, maxY: p.y + CELL, maxZ: z0 + CELL + t };
    case 2: return { minX: x0, minY: p.y, minZ: z0 - t, maxX: x0 + CELL, maxY: p.y + CELL, maxZ: z0 + t };
    case 1: return { minX: x0 + CELL - t, minY: p.y, minZ: z0, maxX: x0 + CELL + t, maxY: p.y + CELL, maxZ: z0 + CELL };
    default: return { minX: x0 - t, minY: p.y, minZ: z0, maxX: x0 + t, maxY: p.y + CELL, maxZ: z0 + CELL };
  }
}

function placeTransform(obj, p) {
  const x0 = p.cx * CELL, z0 = p.cz * CELL;
  obj.position.set(x0 + CELL / 2, p.y, z0 + CELL / 2);
  obj.rotation.set(0, 0, 0);
  if (p.type === 'wall') {
    const [fx, fz] = dirVec[p.dir];
    obj.position.x += fx * CELL / 2; obj.position.z += fz * CELL / 2;
    obj.rotation.y = fx ? Math.PI / 2 : 0;
  } else if (p.type === 'ramp') {
    obj.rotation.y = [0, Math.PI / 2, Math.PI, -Math.PI / 2][p.dir];
  }
}

function sameSpot(a, b) {
  if (a.type !== b.type || Math.abs(a.y - b.y) > (a.type === 'floor' ? 0.6 : 2.5)) return false;
  if (a.type === 'wall') {
    // edges are shared between neighbouring cells
    const ea = edgeKey(a), eb = edgeKey(b);
    return ea === eb;
  }
  return a.cx === b.cx && a.cz === b.cz;
}
function edgeKey(p) {
  const [fx, fz] = dirVec[p.dir];
  if (fx) return 'x' + (p.cx + (fx > 0 ? 1 : 0)) + ',' + p.cz;
  return 'z' + p.cx + ',' + (p.cz + (fz > 0 ? 1 : 0));
}

export function canPlace(actor, p) {
  if (actor.mats[MATS[actor.matSel]] < MAT_COST) return false;
  for (const b of G.builds) if (sameSpot(b, p)) return false;
  // don't trap other actors inside walls/floors
  const box = pieceBox(p);
  if (p.type === 'ramp') {
    // never build a ramp slab through someone's body (walking on its low end is fine)
    const fake = { ...box, ramp: { dir: p.dir } };
    for (const a of G.actors) {
      if (!a.alive || a.mode === 'bus') continue;
      if (a.pos.x + 0.42 <= box.minX || a.pos.x - 0.42 >= box.maxX || a.pos.z + 0.42 <= box.minZ || a.pos.z - 0.42 >= box.maxZ) continue;
      const sh = rampHeightAt(fake, Math.min(box.maxX, Math.max(box.minX, a.pos.x)), Math.min(box.maxZ, Math.max(box.minZ, a.pos.z)));
      if (sh > a.pos.y + 0.45 && sh - 0.25 < a.pos.y + 1.8) return false;
    }
  }
  if (p.type !== 'ramp') {
    for (const a of G.actors) {
      if (!a.alive || a === actor && p.type === 'wall') continue;
      if (a.pos.x + 0.35 > box.minX && a.pos.x - 0.35 < box.maxX && a.pos.z + 0.35 > box.minZ && a.pos.z - 0.35 < box.maxZ &&
        a.pos.y + 1.7 > box.minY && a.pos.y < box.maxY - 0.3) return false;
    }
  }
  return true;
}

export function placeBuild(actor, p) {
  if (!geos) initGeos();
  if (!canPlace(actor, p)) return null;
  const matIdx = actor.matSel;
  actor.mats[MATS[matIdx]] -= MAT_COST;
  const mat = G.mats['build_' + MATS[matIdx]].clone();
  const mesh = new THREE.Mesh(geos[p.type], mat);
  placeTransform(mesh, p);
  mesh.castShadow = true; mesh.receiveShadow = true;
  G.scene.add(mesh);
  const piece = { ...p, mat: matIdx, maxHp: MAT_HP[matIdx], hp: MAT_HP[matIdx] * 0.35, grow: 1, mesh, owner: actor };
  const box = pieceBox(p);
  piece.collider = addCollider({ ...box, kind: 'build', ref: piece, ramp: p.type === 'ramp' ? { dir: p.dir } : null });
  G.builds.push(piece);
  if (actor.isPlayer || actor.pos.distanceTo(G.player.pos) < 40) sfx.build();
  return piece;
}

export function damageBuild(piece, dmg, by) {
  if (piece.hp <= 0) return;
  piece.hp -= dmg;
  const k = Math.max(0.35, piece.hp / piece.maxHp);
  piece.mesh.material.color.setScalar(0.55 + 0.45 * k);
  if (piece.hp <= 0) destroyBuild(piece);
}

export function destroyBuild(piece) {
  removeCollider(piece.collider);
  G.scene.remove(piece.mesh);
  piece.mesh.material.dispose();
  const i = G.builds.indexOf(piece);
  if (i >= 0) G.builds.splice(i, 1);
  burst(piece.mesh.position.clone().add(new THREE.Vector3(0, 2, 0)), [0xb08050, 0x999999, 0xcccccc][piece.mat], 14, 6, 0.6);
}

export function updateBuilds(dt) {
  for (const b of G.builds) {
    if (b.grow > 0) {
      b.grow -= dt / 3;
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.65 * dt / 3);
    }
  }
}

export function clearBuilds() {
  for (const b of [...G.builds]) { removeCollider(b.collider); G.scene.remove(b.mesh); b.mesh.material.dispose(); }
  G.builds.length = 0;
}

export function showGhost(p, ok) {
  if (!geos) initGeos();
  if (!p) { ghost.visible = false; return; }
  ghost.geometry = geos[p.type];
  ghost.material = ghostMats[ok ? 0 : 1];
  placeTransform(ghost, p);
  ghost.visible = true;
}
