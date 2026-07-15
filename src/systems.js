import * as THREE from 'three';
import { rand, randInt, choice, clamp, lerp } from './utils.js';
import { WORLD_SIZE } from './world.js';
import { WeaponItem, rollRarity, LOOT_WEAPONS, RARITIES, buildGunMesh } from './weapons.js';

// ---------------------------------------------------------------- Storm
// Phased shrinking circle: wait → shrink → wait → shrink ...
const STORM_PHASES = [
    { wait: 35, shrink: 30, radius: 190, dps: 1 },
    { wait: 30, shrink: 28, radius: 130, dps: 2 },
    { wait: 25, shrink: 25, radius: 80, dps: 4 },
    { wait: 20, shrink: 22, radius: 42, dps: 6 },
    { wait: 18, shrink: 20, radius: 14, dps: 8 },
    { wait: 15, shrink: 30, radius: 2, dps: 10 },
];

export class Storm {
    constructor(scene) {
        this.scene = scene;
        this.center = new THREE.Vector2(0, 0);
        this.targetCenter = new THREE.Vector2(0, 0);
        this.startCenter = new THREE.Vector2(0, 0);
        this.radius = WORLD_SIZE * 0.75;
        this.startRadius = this.radius;
        this.phase = 0;
        this.timer = STORM_PHASES[0].wait;
        this.shrinking = false;
        this.dps = STORM_PHASES[0].dps;

        this.pickNextCenter(STORM_PHASES[0].radius);

        const geo = new THREE.CylinderGeometry(1, 1, 220, 64, 1, true);
        this.wall = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
            color: 0xb44de8,
            transparent: true,
            opacity: 0.22,
            side: THREE.DoubleSide,
            depthWrite: false,
        }));
        this.wall.position.y = 100;
        scene.add(this.wall);
    }

    pickNextCenter(nextRadius) {
        // Next circle must fit inside the current one
        const maxOffset = Math.max(0, this.radius - nextRadius) * 0.8;
        const a = rand(0, Math.PI * 2);
        const r = rand(0, maxOffset);
        this.targetCenter.set(this.center.x + Math.cos(a) * r, this.center.y + Math.sin(a) * r);
        this.startCenter.copy(this.center);
        this.startRadius = this.radius;
    }

    get phaseInfo() {
        return {
            phase: this.phase + 1,
            total: STORM_PHASES.length,
            shrinking: this.shrinking,
            timer: Math.max(0, this.timer),
            done: this.phase >= STORM_PHASES.length,
        };
    }

    update(dt) {
        if (this.phase >= STORM_PHASES.length) {
            this.updateWall();
            return;
        }
        const p = STORM_PHASES[this.phase];
        this.timer -= dt;
        if (this.shrinking) {
            const t = clamp(1 - this.timer / p.shrink, 0, 1);
            this.radius = lerp(this.startRadius, p.radius, t);
            this.center.x = lerp(this.startCenter.x, this.targetCenter.x, t);
            this.center.y = lerp(this.startCenter.y, this.targetCenter.y, t);
            if (this.timer <= 0) {
                this.shrinking = false;
                this.phase++;
                if (this.phase < STORM_PHASES.length) {
                    this.timer = STORM_PHASES[this.phase].wait;
                    this.dps = STORM_PHASES[this.phase].dps;
                    this.pickNextCenter(STORM_PHASES[this.phase].radius);
                }
            }
        } else if (this.timer <= 0) {
            this.shrinking = true;
            this.timer = p.shrink;
        }
        this.updateWall();
    }

    updateWall() {
        this.wall.scale.set(this.radius, 1, this.radius);
        this.wall.position.x = this.center.x;
        this.wall.position.z = this.center.y;
        this.wall.material.opacity = 0.18 + 0.06 * Math.sin(performance.now() / 300);
    }

    isOutside(pos) {
        return Math.hypot(pos.x - this.center.x, pos.z - this.center.y) > this.radius;
    }
}

// ---------------------------------------------------------------- Battle bus + skydive
export const DropState = { BUS: 'bus', SKYDIVE: 'skydive', GLIDE: 'glide', LANDED: 'landed' };

export class BattleBus {
    constructor(scene) {
        this.scene = scene;
        const a = rand(0, Math.PI * 2);
        const R = WORLD_SIZE * 0.62;
        this.start = new THREE.Vector3(Math.cos(a) * R, 115, Math.sin(a) * R);
        this.end = new THREE.Vector3(-this.start.x, 115, -this.start.z);
        this.t = 0;
        this.duration = 24;

        this.mesh = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 3),
            new THREE.MeshLambertMaterial({ color: 0x3f6fd4 }));
        const balloon = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 10),
            new THREE.MeshLambertMaterial({ color: 0x7c4dff }));
        balloon.position.y = 6;
        this.mesh.add(body, balloon);
        this.mesh.position.copy(this.start);
        this.mesh.lookAt(this.end.x, 115, this.end.z);
        scene.add(this.mesh);
    }

    update(dt) {
        this.t += dt / this.duration;
        this.mesh.position.lerpVectors(this.start, this.end, Math.min(this.t, 1));
    }

    get done() { return this.t >= 1; }
    get position() { return this.mesh.position; }
    // can only drop while over the island
    get canDrop() {
        const p = this.mesh.position;
        return this.t > 0.12 && this.t < 0.9 && Math.hypot(p.x, p.z) < WORLD_SIZE * 0.55;
    }

    dispose() { this.scene.remove(this.mesh); }
}

export class SkyDrop {
    constructor(world) {
        this.world = world;
        this.state = DropState.BUS;
        this.position = new THREE.Vector3();
        this.velocityY = 0;
    }

    start(pos) {
        this.state = DropState.SKYDIVE;
        this.position.copy(pos);
        this.velocityY = -5;
    }

    deployGlider() {
        if (this.state === DropState.SKYDIVE) this.state = DropState.GLIDE;
    }

    update(dt, input, camForward, camRight) {
        if (this.state !== DropState.SKYDIVE && this.state !== DropState.GLIDE) return;

        const targetFall = this.state === DropState.SKYDIVE ? -38 : -7;
        this.velocityY += (targetFall - this.velocityY) * Math.min(1, dt * 2.2);
        this.position.y += this.velocityY * dt;

        const mv = input.move();
        const speed = this.state === DropState.SKYDIVE ? 14 : 11;
        this.position.addScaledVector(camForward, mv.z * speed * dt);
        this.position.addScaledVector(camRight, mv.x * speed * dt);

        const ground = this.world.getHeight(this.position.x, this.position.z);
        // Auto-deploy near the ground, like the real game
        if (this.state === DropState.SKYDIVE && this.position.y - ground < 30) {
            this.state = DropState.GLIDE;
        }
        if (this.position.y <= ground) {
            this.position.y = ground;
            this.state = DropState.LANDED;
        }
    }
}

// ---------------------------------------------------------------- Loot
// Kinds: weapon, ammo, medkit, minis, bigpot
export class LootManager {
    constructor(scene) {
        this.scene = scene;
        this.items = []; // { mesh, kind, data, position }
    }

    spawnFloorLoot(world, count) {
        for (let i = 0; i < count; i++) {
            const poi = choice(world.pois);
            const x = poi.x + rand(-35, 35), z = poi.z + rand(-35, 35);
            const y = world.getHeight(x, z);
            if (y < 1) continue;
            this.spawnAt(new THREE.Vector3(x, y, z), this.randomKind());
        }
    }

    randomKind() {
        const r = Math.random();
        if (r < 0.5) return { kind: 'weapon', item: new WeaponItem(choice(LOOT_WEAPONS), rollRarity()) };
        if (r < 0.7) return { kind: 'ammo', amount: randInt(20, 40) };
        if (r < 0.82) return { kind: 'medkit' };
        if (r < 0.94) return { kind: 'minis' };
        return { kind: 'bigpot' };
    }

    chestLoot() {
        // Chests always give a weapon (better odds) + a bonus
        return [
            { kind: 'weapon', item: new WeaponItem(choice(LOOT_WEAPONS), rollRarity(0.18)) },
            Math.random() < 0.5 ? { kind: 'ammo', amount: randInt(30, 60) } : { kind: choice(['minis', 'medkit', 'bigpot']) },
        ];
    }

    spawnAt(pos, data) {
        let mesh;
        if (data.kind === 'weapon') {
            mesh = buildGunMesh(data.item.type, data.item.rarity);
            mesh.scale.setScalar(1.4);
        } else {
            const colors = { ammo: 0x8a9aa8, medkit: 0xe8e8e8, minis: 0x4dc4e0, bigpot: 0x2f5fe0 };
            const geos = {
                ammo: new THREE.BoxGeometry(0.5, 0.35, 0.35),
                medkit: new THREE.BoxGeometry(0.55, 0.3, 0.45),
                minis: new THREE.CylinderGeometry(0.12, 0.15, 0.35, 8),
                bigpot: new THREE.CylinderGeometry(0.18, 0.22, 0.55, 8),
            };
            mesh = new THREE.Mesh(geos[data.kind], new THREE.MeshLambertMaterial({
                color: colors[data.kind],
                emissive: colors[data.kind],
                emissiveIntensity: 0.2,
            }));
            if (data.kind === 'medkit') {
                const cross = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.1),
                    new THREE.MeshLambertMaterial({ color: 0xd43f3f }));
                cross.position.z = 0.2;
                mesh.add(cross);
            }
        }
        mesh.position.copy(pos);
        mesh.position.y += 0.5;
        this.scene.add(mesh);
        this.items.push({ mesh, data, position: mesh.position, baseY: mesh.position.y });
    }

    update(t) {
        for (const it of this.items) {
            it.mesh.rotation.y = t * 1.5;
            it.mesh.position.y = it.baseY + Math.sin(t * 2 + it.baseY) * 0.12;
        }
    }

    nearest(pos, maxDist = 2.2) {
        let best = null, bestD = maxDist * maxDist;
        for (const it of this.items) {
            const d = (it.position.x - pos.x) ** 2 + (it.position.z - pos.z) ** 2;
            if (d < bestD) { bestD = d; best = it; }
        }
        return best;
    }

    label(it) {
        const d = it.data;
        if (d.kind === 'weapon') return `${RARITIES[d.item.rarity].name} ${d.item.cfg.name}`;
        return { ammo: `Ammo x${d.amount}`, medkit: 'Medkit', minis: 'Mini Shield', bigpot: 'Shield Potion' }[d.kind];
    }

    // Applies the pickup to the player. Returns a HUD message.
    collect(it, player) {
        const d = it.data;
        let msg = this.label(it);
        if (d.kind === 'weapon') {
            player.arsenal.add(d.item);
            player.refreshGunMesh();
        } else if (d.kind === 'ammo') {
            player.arsenal.addAmmo(d.amount);
        } else if (d.kind === 'medkit') {
            player.heal(100);
        } else if (d.kind === 'minis') {
            player.addShield(25);
        } else if (d.kind === 'bigpot') {
            player.addShield(50);
        }
        this.remove(it);
        return msg;
    }

    remove(it) {
        this.scene.remove(it.mesh);
        this.items = this.items.filter(x => x !== it);
    }

    dispose() {
        for (const it of this.items) this.scene.remove(it.mesh);
        this.items = [];
    }
}
