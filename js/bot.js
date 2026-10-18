// Bot brains. Decisions run a few times a second (staggered); steering and
// aiming run every frame.
import * as THREE from 'three';
import { WEAPONS, HALF, POIS } from './config.js';
import { Actor } from './actor.js';
import { G } from './state.js';
import { moveActor, rayWorld } from './physics.js';
import { terrainHeight } from './terrain.js';
import { fireWeapon } from './combat.js';
import { nearestLoot, removeLoot, nearestChest, openChest } from './loot.js';
import { inStorm, inNextCircle } from './storm.js';
import { computePlacement, placeBuild } from './build.js';

const DIFF = {
  easy: { acc: [0.15, 0.4], react: [0.7, 1.2], aggro: 0.5 },
  normal: { acc: [0.3, 0.6], react: [0.4, 0.8], aggro: 0.8 },
  hard: { acc: [0.55, 0.85], react: [0.2, 0.45], aggro: 1 },
};
const rr = (a, b) => a + (b - a) * Math.random();
const tmpV = new THREE.Vector3(), tmpO = new THREE.Vector3(), tmpM = new THREE.Vector3();

function angleDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

export class Bot extends Actor {
  constructor(name, skin) {
    super(name, skin, false);
    this.onDamaged = (dmg, attacker) => {
      if (attacker && attacker !== this && attacker.alive) {
        if (!this.target || Math.random() < 0.6) this.target = attacker;
        this.alertT = G.time;
      }
    };
  }
  resetBot(difficulty) {
    this.reset();
    const d = DIFF[difficulty] || DIFF.normal;
    this.acc = rr(d.acc[0], d.acc[1]);
    this.react = rr(d.react[0], d.react[1]);
    this.aggro = d.aggro;
    this.think = Math.random() * 0.3;
    this.target = null; this.seenT = 0; this.losOk = false; this.losT = 0;
    this.goal = null; this.goalKind = '';
    this.strafe = 1; this.strafeT = 0;
    this.stuckT = 0; this.detourT = 0; this.detourYaw = 0; this.lastPos = new THREE.Vector3();
    this.dropT = rr(0.1, 0.9); // fraction of bus route
    this.land = null;
    this.buildCd = 0; this.alertT = -99; this.burst = 0;
    this.aimYaw = 0; this.aimPitch = 0;
    this.mats.wood = Math.floor(rr(0, 60));
  }

  chooseLanding() {
    if (Math.random() < 0.75) {
      const p = POIS[Math.floor(Math.random() * POIS.length)];
      this.land = { x: p.x + rr(-35, 35), z: p.z + rr(-35, 35) };
    } else {
      const s = G.world.lootSpots[Math.floor(Math.random() * G.world.lootSpots.length)];
      this.land = { x: s.x, z: s.z };
    }
  }

  update(dt, near) {
    if (!this.alive) return;
    this.tickTimers(dt);
    if (this.mode === 'sky' || this.mode === 'glide') return this.updateAir(dt);
    if (this.mode !== 'ground') return;

    this.think -= dt;
    if (this.think <= 0) { this.think = near ? rr(0.18, 0.3) : rr(0.4, 0.7); this.decide(); }

    let moveYaw = null, speed = 0;
    const w = this.weapon;
    const t = this.target;
    if (t && (!t.alive || t.mode === 'bus')) this.target = null;

    if (this.target && this.losOk && w && !w.melee) {
      // ------------------------------------------- fight
      const d = this.pos.distanceTo(t.pos);
      const ideal = t.isPlayer ? { shotgun: 5, smg: 11, pistol: 15, ar: 24, sniper: 70 }[this.item.type] : 20;
      tmpV.subVectors(t.pos, this.pos);
      const toYaw = Math.atan2(tmpV.x, tmpV.z);
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeT = rr(0.6, 1.6); if (this.onGround && Math.random() < 0.25) this.vel.y = 8; }
      const adv = d > ideal + 4 ? 1 : d < ideal - 3 ? -1 : 0;
      moveYaw = toYaw + this.strafe * (adv === 0 ? Math.PI / 2 : adv > 0 ? Math.PI / 4 : Math.PI * 0.75);
      speed = 5.4;
      this.aimAt(t, dt);
      // shoot
      const it = this.item;
      if (this.reloadT <= 0 && it.mag <= 0) this.startReload();
      const ready = G.time - this.seenT > this.react && this.fireCd <= 0 && this.reloadT <= 0 && this.equipT <= 0 && it.mag > 0;
      if (ready && Math.abs(angleDiff(this.yaw, this.aimYaw)) < 0.25 && d < w.range) {
        this.shoot(t, d);
      }
      // panic build
      this.buildCd -= dt;
      if (this.buildCd <= 0 && G.time - this.lastHurtT < 0.6 && this.mats.wood >= 10 && Math.random() < 0.5 * this.aggro) {
        this.buildCd = rr(2.5, 5);
        const saveYaw = this.yaw; this.yaw = toYaw;
        const p = computePlacement(this, Math.random() < 0.7 ? 'wall' : 'ramp', 0);
        this.matSel = 0;
        placeBuild(this, p);
        this.yaw = saveYaw;
      }
    } else if (this.target && w && w.melee && this.pos.distanceTo(this.target.pos) < 14) {
      // pickaxe rush
      tmpV.subVectors(this.target.pos, this.pos);
      moveYaw = Math.atan2(tmpV.x, tmpV.z); speed = 7.5;
      this.aimAt(this.target, dt);
      if (tmpV.length() < 2.6 && this.fireCd <= 0) {
        this.fireCd = WEAPONS.pickaxe.rate;
        tmpO.copy(this.eye); tmpM.copy(this.target.chest).sub(tmpO).normalize();
        fireWeapon(this, tmpO, tmpM, tmpO, 0);
      }
    } else if (this.goal) {
      tmpV.set(this.goal.x - this.pos.x, 0, this.goal.z - this.pos.z);
      const d = tmpV.length();
      moveYaw = Math.atan2(tmpV.x, tmpV.z);
      speed = this.goalKind === 'storm' || d > 30 ? 7.8 : 6;
      this.yaw += angleDiff(this.yaw, moveYaw) * Math.min(1, dt * 6);
      this.pitch *= 0.9;
      if (d < 1.6) this.arrive();
    }

    // heal when calm
    if (!this.target && this.healT <= 0 && G.time - this.lastHurtT > 3) {
      const hs = this.slots.findIndex((s) => s && s.kind === 'heal' && ((s.type === 'shield' && this.shield < 60) || (s.type !== 'shield' && this.health < 70)));
      if (hs >= 0) { this.equip(hs); this.startHeal(); }
    }
    if (this.healT > 0) speed = Math.min(speed, 2.5);
    else if (this.item.kind === 'heal') { const g = this.bestGunSlot(); if (g >= 0) this.equip(g); }

    // stuck handling
    if (this.detourT > 0) { this.detourT -= dt; moveYaw = this.detourYaw; }
    if (moveYaw !== null && speed > 0) {
      const ax = Math.sin(moveYaw) * speed, az = Math.cos(moveYaw) * speed;
      const k = this.onGround ? Math.min(1, dt * 10) : Math.min(1, dt * 2);
      this.vel.x += (ax - this.vel.x) * k; this.vel.z += (az - this.vel.z) * k;
    } else {
      const k = Math.min(1, dt * 10);
      this.vel.x -= this.vel.x * k; this.vel.z -= this.vel.z * k;
    }
    this.bumped = false;
    moveActor(this, dt, 0.42, 1.8);
    if (this.bumped && this.onGround && moveYaw !== null) this.vel.y = 8.2;
    // water: slow + drift toward land
    if (this.pos.y < 0.2) { this.vel.x *= 0.96; this.vel.z *= 0.96; }
  }

  updateAir(dt) {
    if (!this.land) this.chooseLanding();
    tmpV.set(this.land.x - this.pos.x, 0, this.land.z - this.pos.z);
    const d = tmpV.length();
    const gy = terrainHeight(this.pos.x, this.pos.z);
    if (this.mode === 'sky' && this.pos.y - gy < 32 + Math.random() * 10) this.mode = 'glide';
    const hs = this.mode === 'sky' ? 22 : 15;
    if (d > 1) { tmpV.multiplyScalar(Math.min(hs, d * 2) / d); this.yaw = Math.atan2(tmpV.x, tmpV.z); }
    else tmpV.set(0, 0, 0);
    this.vel.x += (tmpV.x - this.vel.x) * Math.min(1, dt * 2);
    this.vel.z += (tmpV.z - this.vel.z) * Math.min(1, dt * 2);
    this.noGravity = true;
    this.vel.y = this.mode === 'sky' ? -40 : -7;
    moveActor(this, dt, 0.42, 1.8);
    if (this.onGround) { this.mode = 'ground'; this.noGravity = false; this.vel.set(0, 0, 0); }
  }

  aimAt(t, dt) {
    tmpV.subVectors(t.chest, this.eye);
    this.aimYaw = Math.atan2(tmpV.x, tmpV.z);
    this.aimPitch = Math.atan2(tmpV.y, Math.hypot(tmpV.x, tmpV.z));
    const turn = Math.min(1, dt * (4 + this.acc * 8));
    this.yaw += angleDiff(this.yaw, this.aimYaw) * turn;
    this.pitch += (this.aimPitch - this.pitch) * turn;
  }

  shoot(t, d) {
    const w = this.weapon, it = this.item;
    this.fireCd = w.rate * (w.auto ? rr(1.4, 2.0) : rr(1.2, 1.7));
    // bursts with pauses for automatic weapons
    if (w.auto) { this.burst++; if (this.burst > 6 + this.acc * 8) { this.burst = 0; this.fireCd = rr(0.5, 1.1); } }
    const eye = this.eye;
    tmpO.copy(eye);
    tmpM.copy(t.chest);
    // aim at head sometimes when skilled
    if (Math.random() < this.acc * 0.25) tmpM.y += 0.55;
    tmpM.sub(tmpO).normalize();
    const tSpeed = Math.hypot(t.vel.x, t.vel.z);
    // aim settles in over the first ~2 s of tracking a target
    const settle = 1 + 1.6 * Math.max(0, 1 - (G.time - this.seenT) / 2);
    const err = (w.spread * 0.6 + (1 - this.acc) * 0.06 + tSpeed * 0.004 + (t.isPlayer && t.mode !== 'ground' ? 0.03 : 0) + d * 0.00015) * settle;
    const muzzle = tmpV.copy(eye).addScaledVector(this.forward(new THREE.Vector3()), 0.6);
    muzzle.y -= 0.3;
    fireWeapon(this, tmpO, tmpM, muzzle, err);
    if (it.mag <= 0) this.startReload();
  }

  arrive() {
    if (this.goalKind === 'loot' && this.goal.ref && G.loot.includes(this.goal.ref)) {
      const l = this.goal.ref;
      if (this.give(l.item)) {
        removeLoot(l);
        const g = this.bestGunSlot(); if (g >= 0 && this.item.kind !== 'heal') this.equip(g);
      }
    } else if (this.goalKind === 'chest' && this.goal.ref && !this.goal.ref.opened) {
      openChest(this.goal.ref, this);
    }
    this.goal = null; this.goalKind = '';
  }

  decide() {
    // stuck detection
    const moved = this.lastPos.distanceTo(this.pos);
    if (this.goal && moved < 0.4 && this.detourT <= 0) {
      this.stuckT += 0.3;
      if (this.stuckT > 0.8) { this.detourT = rr(0.6, 1.4); this.detourYaw = this.yaw + (Math.random() < 0.5 ? 1 : -1) * rr(1.2, 2.2); this.stuckT = 0; if (Math.random() < 0.3) this.goal = null; }
    } else this.stuckT = 0;
    this.lastPos.copy(this.pos);

    const s = G.storm;
    const w = this.weapon;
    const hasGun = this.hasGun();
    if (this.item.kind === 'weapon' && this.item.type === 'pickaxe' && hasGun) this.equip(this.bestGunSlot());

    // targets
    const range = hasGun ? Math.min(140, Math.max(55, (w && !w.melee ? w.range : 60) * 0.8)) : 20;
    if (this.target) {
      const d = this.pos.distanceTo(this.target.pos);
      if (d > range * 1.4 || (!this.losOk && G.time - this.seenT > 4)) this.target = null;
    }
    if (!this.target) {
      let best = null, bd = range;
      for (const a of G.actors) {
        if (a === this || !a.alive || a.mode !== 'ground' && a.mode !== 'glide') continue;
        const d = this.pos.distanceTo(a.pos);
        if (d >= bd || (!a.isPlayer && d > 35 + G.time * 0.12)) continue;
        // freshly landed bots focus on looting unless someone is right there
        if (!a.isPlayer && G.time < 50 && d > 12) continue;
        if (!hasGun && !a.isPlayer) continue;
        // field of view check unless very close
        tmpV.subVectors(a.pos, this.pos);
        const fwdDot = (tmpV.x * Math.sin(this.yaw) + tmpV.z * Math.cos(this.yaw)) / (d || 1);
        if (d > 12 && fwdDot < -0.2) continue;
        if (!this.canSee(a)) continue;
        best = a; bd = d;
      }
      if (best) { this.target = best; this.seenT = G.time; this.losOk = true; this.burst = 0; }
    }
    if (this.target) {
      const was = this.losOk;
      this.losOk = this.canSee(this.target);
      if (this.losOk && !was) this.seenT = G.time - this.react * 0.5;
      if (!this.losOk) {
        // chase last known position
        this.goal = { x: this.target.pos.x, z: this.target.pos.z }; this.goalKind = 'chase';
      }
    }

    // storm overrides looting
    const outside = inStorm(s, this.pos.x, this.pos.z) || (s.state === 'shrink' || s.timer < 25) && !inNextCircle(s, this.pos.x, this.pos.z, 6);
    if (outside && (!this.target || !this.losOk)) {
      const tx = s.state === 'shrink' || s.timer < 25 ? s.toX : s.cx, tz = s.state === 'shrink' || s.timer < 25 ? s.toZ : s.cz;
      this.goal = { x: tx + rr(-6, 6), z: tz + rr(-6, 6) }; this.goalKind = 'storm';
      return;
    }
    if (this.target && this.losOk) return;

    // looting
    const wantGun = !hasGun || this.slots.filter((x) => x && x.kind === 'weapon').length < 2;
    if (!this.goal || this.goalKind === 'wander') {
      const l = nearestLoot(this.pos, wantGun ? 70 : 30, (l) => (l.item.kind === 'weapon' && wantGun) || (l.item.kind === 'heal' && this.slots.includes(null)) || l.item.kind === 'mat');
      if (l) { this.goal = { x: l.x, z: l.z, ref: l }; this.goalKind = 'loot'; return; }
      const c = nearestChest(this.pos, 45);
      if (c && (wantGun || Math.random() < 0.5)) { this.goal = { x: c.x, z: c.z, ref: c }; this.goalKind = 'chest'; return; }
    }
    if (!this.goal) {
      // wander inside the safe zone, drifting toward towns
      const cx = s.toX, cz = s.toZ, r = Math.max(10, s.toR * 0.8);
      const a = Math.random() * Math.PI * 2, d = Math.random() * r;
      let x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (Math.hypot(x, z) > HALF * 0.85) { x *= 0.7; z *= 0.7; }
      this.goal = { x, z }; this.goalKind = 'wander';
    }
  }

  canSee(a) {
    const e = this.eye;
    tmpV.subVectors(a.chest, e);
    const d = tmpV.length();
    if (d < 0.5) return true;
    tmpV.divideScalar(d);
    const h = rayWorld(e.x, e.y, e.z, tmpV.x, tmpV.y, tmpV.z, d - 0.4);
    return !h;
  }
}
