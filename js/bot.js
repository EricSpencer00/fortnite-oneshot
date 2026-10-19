// Bot brains. Decisions run a few times a second (staggered); steering and
// aiming run every frame.
import * as THREE from 'three';
import { WEAPONS, HALF, POIS } from './config.js';
import { Actor } from './actor.js';
import { G } from './state.js';
import { moveActor, rayWorld, queryBox } from './physics.js';
import { terrainHeight } from './terrain.js';
import { fireWeapon } from './combat.js';
import { nearestLoot, removeLoot, nearestChest, openChest } from './loot.js';
import { inStorm, inNextCircle } from './storm.js';
import { computePlacement, placeBuild, damageBuild } from './build.js';

const DIFF = {
  easy: { acc: [0.15, 0.4], react: [0.7, 1.2], aggro: 0.5 },
  normal: { acc: [0.3, 0.6], react: [0.4, 0.8], aggro: 0.8 },
  hard: { acc: [0.55, 0.85], react: [0.2, 0.45], aggro: 1 },
};
const rr = (a, b) => a + (b - a) * Math.random();
const tmpV = new THREE.Vector3(), tmpO = new THREE.Vector3(), tmpM = new THREE.Vector3();

// does segment (ax,az)-(bx,bz) cross house rect h grown by m?
function segHitsRect(ax, az, bx, bz, h, m) {
  const x0 = h.x0 - m, x1 = h.x1 + m, z0 = h.z0 - m, z1 = h.z1 + m;
  let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
  for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dz, az - z0], [dz, z1 - az]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t0 <= t1;
}

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
    this.aimYaw = 0; this.aimPitch = 0; this.emoteT = 0; this.transit = null; this.ignore = new Set(); this.prog = null;
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
    // victory dance after an elimination, unless someone's shooting at us
    if (this.emoteT > 0) {
      this.emoteT -= dt;
      if (G.time - this.lastHurtT < 0.5) this.emoteT = 0;
      this.emote = this.emoteT > 0;
      this.vel.x *= 0.8; this.vel.z *= 0.8;
      moveActor(this, dt, 0.42, 1.8);
      if (this.emote) return;
    }

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
      const wp = this.waypoint(this.goal);
      tmpV.set(wp.x - this.pos.x, 0, wp.z - this.pos.z);
      const d = Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z);
      moveYaw = Math.atan2(tmpV.x, tmpV.z);
      speed = this.goalKind === 'storm' || d > 30 ? 7.8 : wp === this.goal ? 6 : 4.5;
      this.yaw += angleDiff(this.yaw, moveYaw) * Math.min(1, dt * 6);
      this.pitch *= 0.9;
      const dy = this.goal.y === undefined ? 0 : Math.abs(this.goal.y - this.pos.y);
      if (d < 1.6 && dy < 1.6) this.arrive();
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
    if (moveYaw !== null) this.moveYawLast = moveYaw;
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
    // give up on goals we can't make progress on (and don't pick that item again)
    if (this.goal && this.goal.ref && this.goalKind !== 'storm') {
      if (!this.prog || this.prog.ref !== this.goal.ref) this.prog = { ref: this.goal.ref, p: this.pos.clone(), t: G.time };
      else if (this.pos.distanceTo(this.prog.p) > 2) { this.prog.p.copy(this.pos); this.prog.t = G.time; }
      else if (G.time - this.prog.t > 6) { this.ignore.add(this.goal.ref); this.goal = null; this.goalKind = ''; this.prog = null; }
    }
    // stuck detection
    const moved = this.lastPos.distanceTo(this.pos);
    if (this.goal && moved < 0.4) {
      // a build piece in the way? pickaxe through it like a player would
      const my = this.moveYawLast ?? this.yaw;
      const fx = Math.sin(my), fz = Math.cos(my);
      const ahead = queryBox(this.pos.x + fx * 0.9 - 0.6, this.pos.z + fz * 0.9 - 0.6, this.pos.x + fx * 0.9 + 0.6, this.pos.z + fz * 0.9 + 0.6)
        .find((c) => c.kind === 'build' && c.maxY > this.pos.y + 0.6 && c.minY < this.pos.y + 1.7 && (!c.ramp || this.bumped || this.stuckT > 0.3));
      if (ahead) {
        if (this.active !== -1 && this.item.kind !== 'heal') this.equip(-1);
        this.swing = 1; damageBuild(ahead.ref, 60, this);
        this.stuckT = 0; this.lastPos.copy(this.pos); return;
      }
    }
    if (this.goal && moved < 0.4 && this.detourT <= 0) {
      this.stuckT += 0.3;
      if (this.stuckT > 0.8) {
        // probe for an open direction (trees, rocks, cars) instead of guessing
        const base = this.moveYawLast ?? this.yaw, e = this.eye, side = Math.random() < 0.5 ? 1 : -1;
        let pick = base + side * 1.6;
        for (const off of [1.2, -1.2, 1.9, -1.9, 2.6, -2.6].map((v) => v * side)) {
          const yy = base + off, dx = Math.sin(yy), dz = Math.cos(yy);
          if (!rayWorld(e.x, this.pos.y + 0.7, e.z, dx, 0, dz, 3.2)) { pick = yy; break; }
        }
        this.detourT = rr(0.8, 1.5); this.detourYaw = pick; this.stuckT = 0;
        if (Math.random() < 0.2) this.goal = null;
      }
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
        // chase last known position; if they're right there but hidden behind cover, circle around it
        const dd = this.pos.distanceTo(this.target.pos);
        if (dd < 4 && this.detourT <= 0) { this.detourT = rr(0.8, 1.4); this.detourYaw = Math.atan2(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z) + (Math.random() < 0.5 ? 1.3 : -1.3); }
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
      const l = nearestLoot(this.pos, wantGun ? 70 : 30, (l) => !this.ignore.has(l) && ((l.item.kind === 'weapon' && wantGun) || (l.item.kind === 'heal' && this.slots.includes(null)) || l.item.kind === 'mat'));
      if (l) { this.goal = { x: l.x, y: l.y, z: l.z, ref: l }; this.goalKind = 'loot'; return; }
      let c = nearestChest(this.pos, 45); if (c && this.ignore.has(c)) c = null;
      if (c && (wantGun || Math.random() < 0.5)) { this.goal = { x: c.x, y: c.y, z: c.z, ref: c }; this.goalKind = 'chest'; return; }
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

  // Route through doors (and up stairs) instead of walking into walls.
  waypoint(goal) {
    const H = G.world.houses;
    const inside = (h, x, z) => x > h.x0 + 0.1 && x < h.x1 - 0.1 && z > h.z0 + 0.1 && z < h.z1 - 0.1;
    let hFrom = null, hGoal = null;
    for (const h of H) {
      if (!hFrom && inside(h, this.pos.x, this.pos.z) && this.pos.y < h.y + h.H) hFrom = h;
      if (!hGoal && inside(h, goal.x, goal.z) && (goal.y === undefined || goal.y < h.y + h.H)) hGoal = h;
    }
    const near = (p, r) => Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < r;
    const upstairs = (h) => this.pos.y > h.y + 2.5;
    // standing anywhere on the staircase above floor level counts as "not done with the stairs"
    const onStairs = (h) => h.stair && Math.abs(this.pos.x - h.stair.x) < 1.25 && this.pos.z > h.stair.z0 - 0.3 && this.pos.z < h.stair.z1 + 0.3 && this.pos.y > h.y + 0.6;
    // committed door transit: keep walking through until we're clear (no dithering in doorways)
    if (this.transit && G.time - this.transit.t < 4) {
      const tr = this.transit;
      if (!near(tr.to, 0.7)) return tr.to;
      this.transit = null;
    }
    if (hFrom && hFrom !== hGoal) {
      if ((upstairs(hFrom) || onStairs(hFrom)) && hFrom.stair) return this.stairRoute(hFrom, false);
      if (near(hFrom.doorIn, 0.9)) { this.transit = { to: hFrom.doorOut, t: G.time }; return hFrom.doorOut; }
      return hFrom.doorIn;
    }
    // outside: detour around the nearest house standing between us and where we're going
    if (!hFrom && !hGoal) return this.avoidHouses(goal, null);
    if (hGoal && hFrom !== hGoal) {
      if (near(hGoal.doorOut, 1.1)) { this.transit = { to: hGoal.doorIn, t: G.time }; return hGoal.doorIn; }
      const t = this.avoidHouses(hGoal.doorOut, hGoal);
      return t !== hGoal.doorOut ? t : this.around(hGoal, hGoal.doorOut);
    }
    if (hGoal && hGoal.stair) {
      const wantUp = goal.y !== undefined && goal.y > hGoal.y + 2.5;
      if (wantUp !== upstairs(hGoal) || (!wantUp && onStairs(hGoal))) return this.stairRoute(hGoal, wantUp);
    }
    return goal;
  }

  // Stairs run along +z against the east wall, starting 0.5 m from the south wall,
  // so they're entered from the west at the low end and left to the west at the top.
  stairRoute(h, up) {
    const st = h.stair, x = this.pos.x, z = this.pos.z;
    const near = (px, pz, r) => Math.hypot(px - x, pz - z) < r;
    const onStair = Math.abs(x - st.x) < 1.25 && z > st.z0 - 0.3 && z < st.z1 + 0.3;
    // step on/off at the first tread only (higher up, the solid steps block a side entry)
    const foot = { x: st.x - 1.9, z: st.z0 + 0.12 }, low = { x: st.x, z: st.z0 + 0.12 };
    const topIn = { x: st.x, z: st.z1 - 0.6 }, landing = { x: st.floorX, z: st.z1 - 0.6 };
    const go = (p) => { this.transit = { to: p, t: G.time }; return p; };
    if (up) {
      if (onStair) return this.pos.y > st.top - 0.5 ? go(landing) : { x: st.x, z: st.z1 - 0.2 };
      return near(foot.x, foot.z, 0.8) ? go(low) : foot;
    }
    if (onStair) return this.pos.y < h.y + 0.8 ? go(foot) : low;
    return near(landing.x, landing.z, 0.8) ? go(topIn) : landing;
  }

  avoidHouses(target, exclude) {
    let best = null, bd = Infinity;
    for (const h of G.world.houses) {
      if (h === exclude) continue;
      const d = Math.hypot(h.x - this.pos.x, h.z - this.pos.z);
      if (d > 60 || d >= bd) continue;
      if (segHitsRect(this.pos.x, this.pos.z, target.x, target.z, h, 0.6)) { best = h; bd = d; }
    }
    return best ? this.around(best, target) : target;
  }

  // walk to the best corner of house h (expanded) when the straight line to target crosses it
  around(h, target) {
    if (!segHitsRect(this.pos.x, this.pos.z, target.x, target.z, h, 0.5)) return target;
    const m = 1.6;
    let best = target, bd = Infinity;
    for (const [cx, cz] of [[h.x0 - m, h.z0 - m], [h.x1 + m, h.z0 - m], [h.x0 - m, h.z1 + m], [h.x1 + m, h.z1 + m]]) {
      if (Math.hypot(cx - this.pos.x, cz - this.pos.z) < 0.6) continue; // reached this corner, take the next
      if (segHitsRect(this.pos.x, this.pos.z, cx, cz, h, 0.25)) continue;
      // a corner whose onward leg still cuts through the house needs another hop: penalise it
      const d = Math.hypot(cx - this.pos.x, cz - this.pos.z) + Math.hypot(target.x - cx, target.z - cz) + (segHitsRect(cx, cz, target.x, target.z, h, 0.5) ? 25 : 0);
      if (d < bd) { bd = d; best = { x: cx, z: cz }; }
    }
    return best;
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
