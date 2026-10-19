// Shared actor model used by both the player and bots.
import * as THREE from 'three';
import { WEAPONS, HEALS, PLAYER, MAT_MAX, RARITY_MULT, AMMO_GIVE } from './config.js';
import { makeCharacter, setHeld, animateCharacter } from './character.js';
import { G } from './state.js';

const PICKAXE = { kind: 'weapon', type: 'pickaxe', rarity: 0, mag: 0 };

export class Actor {
  constructor(name, skin, isPlayer = false) {
    this.name = name;
    this.isPlayer = isPlayer;
    this.ch = makeCharacter(skin);
    G.scene.add(this.ch.root);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.reset();
  }
  reset() {
    this.pos.set(0, 120, 0); this.vel.set(0, 0, 0);
    this.yaw = 0; this.pitch = 0;
    this.health = PLAYER.maxHealth; this.shield = 0;
    this.alive = true; this.onGround = false; this.mode = 'bus';
    this.slots = [null, null, null, null, null];
    this.active = -1;
    this.ammo = { light: 0, medium: 0, heavy: 0, shells: 0 };
    this.mats = { wood: 0, stone: 0, metal: 0 };
    this.matSel = 0;
    this.fireCd = 0; this.reloadT = 0; this.healT = 0; this.healSlot = -1;
    this.kick = 0; this.swing = 0; this.equipT = 0;
    this.kills = 0; this.emote = false; this.deadT = undefined; this.lastAttacker = null; this.lastHurtT = -99;
    this.place = 0;
    this.ch.root.visible = false;
    this.noGravity = false;
  }
  get item() { return this.active < 0 ? PICKAXE : (this.slots[this.active] || PICKAXE); }
  get weapon() { const it = this.item; return it.kind === 'weapon' ? WEAPONS[it.type] : null; }
  get eye() { return this._eye || (this._eye = new THREE.Vector3()), this._eye.set(this.pos.x, this.pos.y + 1.55, this.pos.z); }
  get chest() { return this._chest || (this._chest = new THREE.Vector3()), this._chest.set(this.pos.x, this.pos.y + 1.15, this.pos.z); }
  get headPos() { return this._head || (this._head = new THREE.Vector3()), this._head.set(this.pos.x, this.pos.y + 1.72, this.pos.z); }
  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }

  hasGun() { return this.slots.some((s) => s && s.kind === 'weapon'); }
  bestGunSlot() {
    let best = -1, score = -1;
    this.slots.forEach((s, i) => {
      if (!s || s.kind !== 'weapon') return;
      const w = WEAPONS[s.type];
      const sc = w.damage * w.pellets / w.rate * RARITY_MULT[s.rarity] + (s.mag > 0 || this.ammo[w.ammo] > 0 ? 1000 : 0);
      if (sc > score) { score = sc; best = i; }
    });
    return best;
  }
  equip(i) {
    if (i === this.active) return;
    this.active = i;
    this.reloadT = 0; this.healT = 0; this.healSlot = -1;
    this.equipT = 0.25;
    this.fireCd = Math.max(this.fireCd, 0.2);
  }

  // returns true if fully taken
  give(item) {
    if (item.kind === 'ammo') { this.ammo[item.type] = Math.min(999, this.ammo[item.type] + item.count); return true; }
    if (item.kind === 'mat') { this.mats[item.type] = Math.min(MAT_MAX, this.mats[item.type] + item.count); return true; }
    if (item.kind === 'heal') {
      const h = HEALS[item.type];
      for (const s of this.slots) {
        if (s && s.kind === 'heal' && s.type === item.type && s.count < h.stack) {
          const add = Math.min(h.stack - s.count, item.count);
          s.count += add; item.count -= add;
          if (item.count <= 0) return true;
        }
      }
    }
    const empty = this.slots.indexOf(null);
    if (empty >= 0) {
      this.slots[empty] = { ...item };
      if (this.active < 0 && item.kind === 'weapon' && !this.isPlayer) this.equip(empty);
      return true;
    }
    return false;
  }

  takeDamage(amount, attacker, opts = {}) {
    if (!this.alive || this.mode === 'bus') return 0;
    let dealt = 0, toShield = 0;
    if (this.shield > 0 && !opts.storm) {
      toShield = Math.min(this.shield, amount);
      this.shield -= toShield; amount -= toShield; dealt += toShield;
    }
    const toHp = Math.min(this.health, amount);
    this.health -= toHp; dealt += toHp;
    this.lastHurtT = G.time;
    if (attacker && attacker !== this) this.lastAttacker = attacker;
    this.healT = 0; this.healSlot = -1;
    if (this.onDamaged) this.onDamaged(dealt, attacker, opts, toShield > 0 && toHp === 0);
    if (this.health <= 0) this.die(attacker, opts);
    return dealt;
  }

  die(attacker, opts) {
    this.alive = false;
    this.mode = 'dead';
    this.deadT = 0; // keep the body around briefly for the death animation
    if (attacker && attacker !== this) attacker.kills++;
    if (G.onElim) G.onElim(this, attacker, opts);
  }

  startReload() {
    const it = this.item, w = this.weapon;
    if (!w || w.melee || this.reloadT > 0) return false;
    if (it.mag >= w.mag) return false;
    if (!this.isPlayer) { this.reloadT = w.reload; return true; }
    if (this.ammo[w.ammo] <= 0) return false;
    this.reloadT = w.reload;
    return true;
  }
  finishReload() {
    const it = this.item, w = this.weapon;
    if (!w) return;
    const need = w.mag - it.mag;
    if (!this.isPlayer) { it.mag = w.mag; return; }
    const got = Math.min(need, this.ammo[w.ammo]);
    this.ammo[w.ammo] -= got; it.mag += got;
  }

  startHeal() {
    const it = this.item;
    if (it.kind !== 'heal' || this.healT > 0) return false;
    const h = HEALS[it.type];
    if (h.hp && this.health >= h.cap) return false;
    if (h.shield && this.shield >= h.cap) return false;
    this.healT = h.time; this.healSlot = this.active;
    return true;
  }
  finishHeal() {
    const s = this.slots[this.healSlot];
    if (!s) return;
    const h = HEALS[s.type];
    if (h.hp) this.health = Math.min(h.cap, Math.max(this.health, Math.min(h.cap, this.health + h.hp)));
    if (h.shield) this.shield = Math.min(h.cap, this.shield + h.shield);
    s.count--;
    if (s.count <= 0) this.slots[this.healSlot] = null;
    this.healSlot = -1;
  }

  // per-frame timers shared by everyone
  tickTimers(dt) {
    this.fireCd -= dt;
    this.equipT -= dt;
    this.kick = Math.max(0, this.kick - dt * 6);
    this.swing = Math.max(0, this.swing - dt * 2.6);
    if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) { this.reloadT = 0; this.finishReload(); } }
    if (this.healT > 0) {
      if (this.active !== this.healSlot) { this.healT = 0; this.healSlot = -1; }
      else { this.healT -= dt; if (this.healT <= 0) { this.healT = 0; this.finishHeal(); } }
    }
  }

  syncVisual(dt, visible = true) {
    const r = this.ch.root;
    const dying = !this.alive && this.deadT !== undefined && this.deadT < 1.6;
    if (!this.alive && this.deadT !== undefined) {
      const was = this.deadT; this.deadT += dt;
      if (was < 1.6 && this.deadT >= 1.6 && G.onBodyGone) G.onBodyGone(this);
    }
    r.visible = (this.alive || dying) && this.mode !== 'bus' && visible;
    if (!r.visible) return;
    r.position.copy(this.pos);
    r.rotation.y = this.yaw;
    const it = this.item;
    const holding = it.kind === 'heal' ? 'heal' : it.type;
    setHeld(this.ch, it.kind === 'heal' ? 'heal' + it.type : it.type + it.rarity, it.type, it.rarity || 0);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (!this.alive) { this.vel.set(0, 0, 0); }
    this.ch.lod = this.isPlayer ? 0 : (G.camera && G.camera.position.distanceToSquared(this.pos) > 70 * 70 ? 1 : 0);
    this.airT = this.onGround ? 0 : (this.airT || 0) + dt;
    const w = this.weapon;
    const lower = this.reloadT > 0 && w ? Math.sin(Math.PI * Math.min(1, 1 - this.reloadT / w.reload)) : this.equipT > 0 ? Math.min(1, this.equipT * 4) : 0;
    animateCharacter(this.ch, dt, { lower, airT: this.airT, vy: this.vel.y, moveYaw: Math.atan2(this.vel.x, this.vel.z), speed: this.alive ? sp : 0, onGround: this.onGround || !this.alive, pitch: this.pitch, yaw: this.yaw, mode: this.alive ? this.mode : 'ground', holding, kick: this.kick, swing: this.swing, emote: this.emote, dead: !this.alive });
  }
}

export function ammoFor(type) { return { kind: 'ammo', type, count: AMMO_GIVE[type] }; }
