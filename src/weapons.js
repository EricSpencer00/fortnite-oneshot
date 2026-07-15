import * as THREE from 'three';
import { rand, choice } from './utils.js';

export const RARITIES = [
    { key: 'common', name: 'Common', color: '#9da5ad', hex: 0x9da5ad, mult: 1.0 },
    { key: 'uncommon', name: 'Uncommon', color: '#4caf50', hex: 0x4caf50, mult: 1.1 },
    { key: 'rare', name: 'Rare', color: '#2f9fe0', hex: 0x2f9fe0, mult: 1.2 },
    { key: 'epic', name: 'Epic', color: '#a44de0', hex: 0xa44de0, mult: 1.32 },
    { key: 'legendary', name: 'Legendary', color: '#e8912f', hex: 0xe8912f, mult: 1.45 },
];

export function rollRarity(luck = 0) {
    const r = Math.random() + luck;
    if (r > 0.97) return 4;
    if (r > 0.88) return 3;
    if (r > 0.70) return 2;
    if (r > 0.45) return 1;
    return 0;
}

// fireRate = seconds between shots. adsZoom = FOV multiplier when aiming.
export const WEAPONS = {
    PICKAXE: {
        name: 'Pickaxe', damage: 20, fireRate: 0.45, mag: Infinity, reload: 0,
        spread: 0, range: 3.5, auto: true, melee: true, adsZoom: 1,
    },
    AR: {
        name: 'Assault Rifle', damage: 30, fireRate: 0.135, mag: 30, reload: 2.2,
        spread: 0.025, adsSpread: 0.007, range: 250, auto: true, adsZoom: 0.72, recoil: 0.0035,
    },
    SHOTGUN: {
        name: 'Pump Shotgun', damage: 90, fireRate: 0.95, mag: 5, reload: 3.2,
        spread: 0.09, adsSpread: 0.06, range: 32, auto: false, pellets: 9, adsZoom: 0.85, recoil: 0.02,
    },
    SMG: {
        name: 'SMG', damage: 17, fireRate: 0.065, mag: 35, reload: 1.9,
        spread: 0.045, adsSpread: 0.02, range: 90, auto: true, adsZoom: 0.8, recoil: 0.002,
    },
    SNIPER: {
        name: 'Bolt Sniper', damage: 105, fireRate: 1.7, mag: 1, reload: 2.8,
        spread: 0.04, adsSpread: 0.0, range: 500, auto: false, adsZoom: 0.28, recoil: 0.03, scope: true,
        headshotMult: 2.0,
    },
    PISTOL: {
        name: 'Pistol', damage: 26, fireRate: 0.28, mag: 12, reload: 1.6,
        spread: 0.02, adsSpread: 0.008, range: 120, auto: false, adsZoom: 0.8, recoil: 0.004,
    },
};

export const LOOT_WEAPONS = ['AR', 'SHOTGUN', 'SMG', 'SNIPER', 'PISTOL'];

// One weapon instance in an inventory slot.
export class WeaponItem {
    constructor(type, rarity = 0) {
        this.type = type;
        this.cfg = WEAPONS[type];
        this.rarity = rarity;
        this.ammo = this.cfg.mag;
        this.reserve = this.cfg.melee ? 0 : this.cfg.mag * 4;
        this.lastFire = -Infinity;
        this.reloading = false;
        this.reloadStart = 0;
    }

    get damage() {
        return Math.round(this.cfg.damage * RARITIES[this.rarity].mult);
    }

    canFire(t) {
        return !this.reloading && this.ammo > 0 && (t - this.lastFire) >= this.cfg.fireRate;
    }

    // Returns array of {dir-offset applied} shot descriptors or null. `aimed` tightens spread.
    fire(t, origin, direction, aimed) {
        if (!this.canFire(t)) return null;
        this.lastFire = t;
        if (!this.cfg.melee) this.ammo--;
        const spread = aimed && this.cfg.adsSpread !== undefined ? this.cfg.adsSpread : this.cfg.spread;
        const pellets = this.cfg.pellets || 1;
        const shots = [];
        for (let i = 0; i < pellets; i++) {
            const dir = direction.clone();
            dir.x += rand(-spread, spread);
            dir.y += rand(-spread, spread);
            dir.z += rand(-spread, spread);
            dir.normalize();
            shots.push({
                origin: origin.clone(),
                direction: dir,
                damage: pellets > 1 ? Math.round(this.damage / pellets) : this.damage,
                range: this.cfg.range,
                headshotMult: this.cfg.headshotMult || 1.5,
            });
        }
        return shots;
    }

    startReload(t) {
        if (this.reloading || this.cfg.melee || this.reserve <= 0 || this.ammo === this.cfg.mag) return;
        this.reloading = true;
        this.reloadStart = t;
    }

    update(t) {
        if (this.reloading && t - this.reloadStart >= this.cfg.reload) {
            const need = this.cfg.mag - this.ammo;
            const take = Math.min(need, this.reserve);
            this.ammo += take;
            this.reserve -= take;
            this.reloading = false;
        }
    }

    reloadProgress(t) {
        return this.reloading ? (t - this.reloadStart) / this.cfg.reload : 1;
    }
}

// Five-slot hotbar; slot 0 is always the pickaxe.
export class Arsenal {
    constructor() {
        this.slots = [new WeaponItem('PICKAXE'), null, null, null, null];
        this.index = 0;
    }
    get current() { return this.slots[this.index]; }
    get isPickaxe() { return this.index === 0; }

    switchTo(i) {
        if (i >= 0 && i < this.slots.length && this.slots[i]) {
            if (this.current) this.current.reloading = false;
            this.index = i;
            return true;
        }
        return false;
    }

    // Adds a weapon to the first free slot (or replaces current non-pickaxe slot).
    add(item) {
        for (let i = 1; i < this.slots.length; i++) {
            if (!this.slots[i]) {
                this.slots[i] = item;
                if (this.isPickaxe) this.index = i;
                return true;
            }
        }
        const i = this.isPickaxe ? 1 : this.index;
        this.slots[i] = item;
        this.index = i;
        return true;
    }

    addAmmo(amount) {
        for (let i = 1; i < this.slots.length; i++) {
            if (this.slots[i]) this.slots[i].reserve += amount;
        }
    }

    update(t) {
        for (const w of this.slots) if (w) w.update(t);
    }
}

// Shared visual effects: tracers, impact sparks, muzzle flashes.
export class FXPool {
    constructor(scene) {
        this.scene = scene;
        this.items = []; // { mesh, life, ttl, velocity? }
    }

    tracer(from, to, color = 0xffe08a) {
        const dir = to.clone().sub(from);
        const len = dir.length();
        if (len < 0.5) return;
        const geo = new THREE.CylinderGeometry(0.025, 0.025, len, 4, 1, true);
        geo.translate(0, len / 2, 0);
        geo.rotateX(Math.PI / 2);
        const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.85,
        }));
        mesh.position.copy(from);
        mesh.lookAt(to);
        this.scene.add(mesh);
        this.items.push({ mesh, life: 0, ttl: 0.07 });
    }

    impact(point, isFlesh) {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(isFlesh ? 0.16 : 0.1, 6, 6),
            new THREE.MeshBasicMaterial({ color: isFlesh ? 0xff5544 : 0xffdd88, transparent: true, opacity: 0.95 })
        );
        mesh.position.copy(point);
        this.scene.add(mesh);
        this.items.push({ mesh, life: 0, ttl: 0.12 });
    }

    muzzle(point) {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.14, 6, 6),
            new THREE.MeshBasicMaterial({ color: 0xfff2aa, transparent: true, opacity: 0.9 })
        );
        mesh.position.copy(point);
        this.scene.add(mesh);
        this.items.push({ mesh, life: 0, ttl: 0.05 });
    }

    update(dt) {
        for (let i = this.items.length - 1; i >= 0; i--) {
            const it = this.items[i];
            it.life += dt;
            const k = 1 - it.life / it.ttl;
            if (k <= 0) {
                this.scene.remove(it.mesh);
                it.mesh.geometry.dispose();
                it.mesh.material.dispose();
                this.items.splice(i, 1);
            } else {
                it.mesh.material.opacity = k;
            }
        }
    }
}

// Simple blocky gun model tinted by rarity, attached to a character's hand.
export function buildGunMesh(type, rarity) {
    const g = new THREE.Group();
    if (type === 'PICKAXE') {
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6),
            new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.12),
            new THREE.MeshLambertMaterial({ color: 0x9aa0a8 }));
        head.position.y = 0.45;
        g.add(handle, head);
        g.rotation.z = -0.5;
        return g;
    }
    const tint = RARITIES[rarity].hex;
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x333a42 });
    const accentMat = new THREE.MeshLambertMaterial({ color: tint, emissive: tint, emissiveIntensity: 0.25 });
    const dims = {
        AR: [0.9, 0.14, 0.1], SHOTGUN: [0.8, 0.16, 0.12], SMG: [0.55, 0.14, 0.1],
        SNIPER: [1.2, 0.12, 0.09], PISTOL: [0.35, 0.14, 0.08],
    }[type] || [0.7, 0.14, 0.1];
    const body = new THREE.Mesh(new THREE.BoxGeometry(...dims), bodyMat);
    const accent = new THREE.Mesh(new THREE.BoxGeometry(dims[0] * 0.5, dims[1] * 0.6, dims[2] * 1.15), accentMat);
    accent.position.x = -dims[0] * 0.15;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), bodyMat);
    grip.position.set(-dims[0] * 0.3, -0.14, 0);
    g.add(body, accent, grip);
    if (type === 'SNIPER') {
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), bodyMat);
        scope.rotation.z = Math.PI / 2;
        scope.position.y = 0.1;
        g.add(scope);
    }
    return g;
}
