// Hitscan shooting shared by player and bots.
import * as THREE from 'three';
import { WEAPONS, RARITY_MULT, MATS } from './config.js';
import { rayWorld, raySphere, rayActorBody } from './physics.js';
import { G } from './state.js';
import { addTracer, burst, muzzleFlash } from './fx.js';
import { playShot, sfx } from './audio.js';
import { damageBuild } from './build.js';
import { destroyNode } from './world.js';

const tmpDir = new THREE.Vector3(), tmpEnd = new THREE.Vector3(), tmpA = new THREE.Vector3();
const right = new THREE.Vector3(), up = new THREE.Vector3();

// cast one ray against world + actors. returns hit description
export function castShot(ox, oy, oz, dx, dy, dz, range, shooter) {
  let best = range, hit = { t: range, type: 'none' };
  const w = rayWorld(ox, oy, oz, dx, dy, dz, range);
  if (w) { best = w.t; hit = { t: w.t, type: w.collider ? 'collider' : 'terrain', collider: w.collider }; }
  for (const a of G.actors) {
    if (a === shooter || !a.alive || a.mode === 'bus') continue;
    // cheap reject
    const lx = a.pos.x - ox, lz = a.pos.z - oz;
    const along = lx * dx + lz * dz;
    if (along < -2 || along > best + 2) continue;
    const h = a.headPos;
    const th = raySphere(ox, oy, oz, dx, dy, dz, h.x, h.y, h.z, 0.3);
    if (th >= 0 && th < best) { best = th; hit = { t: th, type: 'actor', actor: a, head: true }; }
    const tb = rayActorBody(ox, oy, oz, dx, dy, dz, a, best);
    if (tb >= 0 && tb < best) { best = tb; hit = { t: tb, type: 'actor', actor: a, head: false }; }
  }
  return hit;
}

function spreadDir(base, amount, out) {
  if (amount <= 0) return out.copy(base);
  right.crossVectors(base, Math.abs(base.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : THREE.Object3D.DEFAULT_UP).normalize();
  up.crossVectors(right, base).normalize();
  const r = Math.sqrt(Math.random()) * amount, a = Math.random() * Math.PI * 2;
  return out.copy(base).addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
}

// Fire the shooter's current weapon.
// origin/dir: aim ray (camera for player, eye for bots). muzzle: tracer start.
// verifyFrom: optional point; if the aim-ray hit is not visible from there the shot hits the obstruction.
export function fireWeapon(shooter, origin, dir, muzzle, spread, verifyFrom = null) {
  const it = shooter.item, w = WEAPONS[it.type];
  const mult = RARITY_MULT[it.rarity || 0];
  let anyHit = false, headHit = false, total = 0, killed = false;
  if (w.melee) {
    shooter.swing = 1;
    const hit = castShot(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, w.range + (verifyFrom ? origin.distanceTo(verifyFrom) : 0), shooter);
    if (hit.type !== 'none') {
      tmpEnd.copy(origin).addScaledVector(dir, hit.t);
      if (verifyFrom && tmpEnd.distanceTo(verifyFrom) > w.range + 0.8) return { hit: false };
      if (hit.type === 'actor') {
        total += hit.actor.takeDamage(w.damage * (!shooter.isPlayer && !hit.actor.isPlayer ? 0.5 : 1), shooter, { weapon: 'pickaxe' });
        anyHit = true; killed = !hit.actor.alive;
        burst(tmpEnd, 0xff5a5a, 6, 3, 0.4);
        if (shooter.isPlayer && G.onHitConfirm) G.onHitConfirm(tmpEnd, Math.round(total), false, false);
      } else if (hit.type === 'collider' && hit.collider.kind === 'node') {
        const node = hit.collider.ref;
        harvest(shooter, node, tmpEnd);
      } else if (hit.type === 'collider' && hit.collider.kind === 'build') {
        damageBuild(hit.collider.ref, 50, shooter);
        burst(tmpEnd, 0xd2b48c, 6, 3, 0.4);
      } else burst(tmpEnd, 0x9a8a70, 4, 2, 0.3);
      if (shooter.isPlayer) sfx.harvest();
    }
    return { hit: anyHit, total, killed };
  }

  it.mag--;
  shooter.kick = 1;
  const d = shooter.isPlayer ? 0 : G.player.pos.distanceTo(shooter.pos);
  if (shooter.isPlayer) playShot(it.type, 0, 0);
  else {
    tmpA.subVectors(shooter.pos, G.camera.position).normalize();
    const camRight = right.set(1, 0, 0).applyQuaternion(G.camera.quaternion);
    playShot(it.type, d, tmpA.dot(camRight));
  }
  if (shooter.isPlayer || d < 80) muzzleFlash(muzzle);

  for (let p = 0; p < w.pellets; p++) {
    spreadDir(dir, spread, tmpDir);
    let hit = castShot(origin.x, origin.y, origin.z, tmpDir.x, tmpDir.y, tmpDir.z, w.range, shooter);
    tmpEnd.copy(origin).addScaledVector(tmpDir, hit.t);
    if (verifyFrom && hit.t > 0.5) {
      // make sure the muzzle side can actually see the aim point
      tmpA.subVectors(tmpEnd, verifyFrom);
      const len = tmpA.length();
      if (len > 0.6) {
        tmpA.divideScalar(len);
        const h2 = castShot(verifyFrom.x, verifyFrom.y, verifyFrom.z, tmpA.x, tmpA.y, tmpA.z, len - 0.3, shooter);
        if (h2.type !== 'none') { hit = h2; tmpEnd.copy(verifyFrom).addScaledVector(tmpA, h2.t); }
      }
    }
    if (p < 3 || Math.random() < 0.3) addTracer(muzzle, tmpEnd, shooter.isPlayer ? 0xfff0a0 : 0xffb070, 0.06);
    if (hit.type === 'actor') {
      let dmg = w.damage * mult;
      const dist = hit.t;
      if (it.type === 'shotgun') dmg *= dist < 8 ? 1 : Math.max(0.25, 1 - (dist - 8) / 26);
      else if (it.type !== 'sniper') dmg *= dist < 50 ? 1 : Math.max(0.65, 1 - (dist - 50) / 300);
      if (hit.head) { dmg *= w.head; headHit = true; }
      if (!shooter.isPlayer && !hit.actor.isPlayer) dmg *= 0.35; // keep the bot-vs-bot pace sane
      const wasShield = hit.actor.shield > 0;
      const dealt = hit.actor.takeDamage(Math.round(dmg), shooter, { weapon: it.type, head: hit.head });
      total += dealt; anyHit = true;
      if (!hit.actor.alive) killed = true;
      burst(tmpEnd, wasShield ? 0x5ac8ff : 0xff4d4d, 5, 3, 0.35, 1);
      if (shooter.isPlayer && G.onHitConfirm) G.onHitConfirm(tmpEnd, Math.round(dealt), hit.head, wasShield);
    } else if (hit.type === 'collider') {
      if (hit.collider.kind === 'build') damageBuild(hit.collider.ref, w.damage * mult * 0.9, shooter);
      if (p < 4) burst(tmpEnd, 0xcfc2a0, 3, 2.5, 0.3, 1);
    } else if (hit.type === 'terrain') {
      if (p < 4) burst(tmpEnd, 0x8c7a5a, 3, 2, 0.3, 1);
    }
  }
  return { hit: anyHit, head: headHit, total, killed };
}

export function harvest(actor, node, at) {
  if (!node.alive) return;
  const dmg = 50;
  node.hp -= dmg;
  const mat = MATS[node.mat];
  const gain = node.kind === 'car' ? 12 : node.kind === 'rock' ? 10 : 12;
  actor.mats[mat] = Math.min(999, actor.mats[mat] + gain);
  burst(at, node.kind === 'tree' ? 0x8b5a2b : node.kind === 'rock' ? 0x999999 : 0xcccccc, 7, 3, 0.45);
  if (actor.isPlayer && G.onHarvest) G.onHarvest(mat, gain, at);
  if (node.hp <= 0) destroyNode(G.world, node);
}
