import * as THREE from 'three';
import { rand, randInt, choice, clamp, damp, BOT_NAMES } from './utils.js';
import { buildCharacterMesh } from './player.js';
import { WeaponItem, rollRarity, buildGunMesh } from './weapons.js';

const SHIRT_COLORS = [0xe05a4c, 0x4caf50, 0xe0a44d, 0x8a4de0, 0x4dc4e0, 0xd44d92, 0x8a9a3f];

const State = { DROP: 'drop', ROAM: 'roam', ENGAGE: 'engage', BUILD: 'build' };

export class Bot {
    constructor(scene, name, spawnPos) {
        this.scene = scene;
        this.name = name;
        this.alive = true;
        this.health = 100;
        this.shield = randInt(0, 2) * 25;
        this.state = State.DROP;

        this.position = spawnPos.clone();
        this.velocity = new THREE.Vector3();
        this.moveSpeed = rand(5, 6.5);
        this.yaw = rand(0, Math.PI * 2);

        this.weapon = new WeaponItem(choice(['AR', 'SMG', 'PISTOL', 'SHOTGUN']), rollRarity());
        this.accuracy = rand(0.04, 0.12);       // radians of aim error
        this.reactionUntil = 0;                 // won't fire until this time
        this.engageRange = this.weapon.cfg.range * 0.6;
        this.nextWanderAt = 0;
        this.wanderTarget = new THREE.Vector3();
        this.lastBuildAt = 0;

        const body = buildCharacterMesh(choice(SHIRT_COLORS), 0x2a2f38);
        this.mesh = body.group;
        this.parts = body;
        this.mesh.position.copy(this.position);
        this.mesh.userData.bot = this;
        // Tag all child meshes so raycast hits resolve back to the bot
        this.mesh.traverse(m => { m.userData.bot = this; });
        const gun = buildGunMesh(this.weapon.type, this.weapon.rarity);
        gun.rotation.y = -Math.PI / 2;
        body.hand.add(gun);
        body.armR.rotation.x = -1.2;
        body.hand.rotation.x = -1.2 + Math.PI / 2 - 0.2;
        scene.add(this.mesh);

        this.walkPhase = rand(0, 6);
        this._ray = new THREE.Raycaster();
    }

    update(dt, t, ctx) {
        if (!this.alive) return;
        const { world, player, storm, structures, buildSystem } = ctx;

        // --- vertical / drop ---
        const floorY = this.groundY(world, structures);
        if (this.state === State.DROP) {
            this.position.y -= 22 * dt;
            if (this.position.y <= floorY) {
                this.position.y = floorY;
                this.state = State.ROAM;
            }
            this.mesh.position.copy(this.position);
            return;
        }
        // gravity snap
        this.position.y += (floorY - this.position.y) * damp(20, dt);

        // --- storm avoidance overrides everything ---
        const distToStormCenter = Math.hypot(this.position.x - storm.center.x, this.position.z - storm.center.z);
        const inStorm = distToStormCenter > storm.radius - 8;

        // --- target selection ---
        const toPlayer = player.alive
            ? Math.hypot(player.position.x - this.position.x, player.position.z - this.position.z)
            : Infinity;
        const seesPlayer = toPlayer < this.engageRange && this.hasLineOfSight(player.position, structures.concat(world.harvestables));

        if (seesPlayer && !inStorm) {
            if (this.state !== State.ENGAGE) {
                this.state = State.ENGAGE;
                this.reactionUntil = t + rand(0.35, 0.9); // human-ish reaction time
            }
        } else if (this.state === State.ENGAGE && (!seesPlayer || inStorm)) {
            this.state = State.ROAM;
        }

        // --- movement ---
        let moveDir = null;
        if (inStorm) {
            moveDir = new THREE.Vector3(storm.center.x - this.position.x, 0, storm.center.z - this.position.z).normalize();
        } else if (this.state === State.ENGAGE) {
            // strafe at mid range, close if far
            const dir = new THREE.Vector3(player.position.x - this.position.x, 0, player.position.z - this.position.z).normalize();
            if (toPlayer > this.engageRange * 0.55) {
                moveDir = dir;
            } else {
                const side = Math.sin(t * 1.3 + this.walkPhase) > 0 ? 1 : -1;
                moveDir = new THREE.Vector3(-dir.z * side, 0, dir.x * side);
            }
            this.yaw = Math.atan2(dir.x, dir.z);

            // Panic wall when hurt
            if (this.health < 45 && t - this.lastBuildAt > 4 && buildSystem) {
                const wallPos = this.position.clone().addScaledVector(dir, 2);
                buildSystem.botPlace('wall', wallPos, this.yaw);
                this.lastBuildAt = t;
            }
        } else {
            if (t > this.nextWanderAt) {
                this.nextWanderAt = t + rand(3, 8);
                const poi = choice(world.pois);
                const target = Math.random() < 0.5
                    ? new THREE.Vector3(poi.x + rand(-20, 20), 0, poi.z + rand(-20, 20))
                    : this.position.clone().add(new THREE.Vector3(rand(-40, 40), 0, rand(-40, 40)));
                this.wanderTarget.copy(target);
            }
            const d = new THREE.Vector3(this.wanderTarget.x - this.position.x, 0, this.wanderTarget.z - this.position.z);
            if (d.lengthSq() > 4) moveDir = d.normalize();
        }

        if (moveDir) {
            const speed = this.state === State.ENGAGE ? this.moveSpeed : this.moveSpeed * 0.75;
            this.position.x += moveDir.x * speed * dt;
            this.position.z += moveDir.z * speed * dt;
            if (this.state !== State.ENGAGE) this.yaw = Math.atan2(moveDir.x, moveDir.z);

            this.walkPhase += dt * speed * 1.6;
            const swing = Math.sin(this.walkPhase) * 0.5;
            this.parts.legL.rotation.x = swing;
            this.parts.legR.rotation.x = -swing;
            this.parts.armL.rotation.x = -swing * 0.6;
        } else {
            this.parts.legL.rotation.x *= 0.8;
            this.parts.legR.rotation.x *= 0.8;
        }

        this.mesh.position.copy(this.position);
        let dy = this.yaw - this.mesh.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.mesh.rotation.y += dy * damp(10, dt);

        this.weapon.update(t);
        if (this.weapon.ammo === 0 && !this.weapon.reloading) this.weapon.startReload(t);
    }

    groundY(world, structures) {
        let y = world.getHeight(this.position.x, this.position.z);
        this._ray.set(new THREE.Vector3(this.position.x, this.position.y + 1.5, this.position.z), new THREE.Vector3(0, -1, 0));
        this._ray.far = 25;
        const hits = this._ray.intersectObjects(structures, true);
        if (hits.length > 0 && hits[0].point.y > y && hits[0].point.y <= this.position.y + 0.6) {
            y = hits[0].point.y;
        }
        return y;
    }

    hasLineOfSight(targetPos, blockers) {
        const from = this.position.clone();
        from.y += 1.5;
        const to = targetPos.clone();
        to.y += 1.2;
        const dir = to.sub(from);
        const dist = dir.length();
        dir.normalize();
        this._ray.set(from, dir);
        this._ray.far = dist - 0.5;
        return this._ray.intersectObjects(blockers, true).length === 0;
    }

    // Returns shot descriptors when the bot decides to fire this frame.
    tryShoot(t, player) {
        if (this.state !== State.ENGAGE || !player.alive) return null;
        if (t < this.reactionUntil) return null;
        if (!this.weapon.canFire(t)) return null;

        const origin = this.position.clone();
        origin.y += 1.5;
        const target = player.position.clone();
        target.y += 1.1;
        // lead is ignored; error makes bots beatable
        const dir = target.sub(origin).normalize();
        dir.x += rand(-this.accuracy, this.accuracy);
        dir.y += rand(-this.accuracy, this.accuracy);
        dir.z += rand(-this.accuracy, this.accuracy);
        dir.normalize();
        return this.weapon.fire(t, origin, dir, false);
    }

    takeDamage(amount) {
        if (!this.alive) return;
        if (this.shield > 0) {
            const s = Math.min(this.shield, amount);
            this.shield -= s;
            amount -= s;
        }
        this.health -= amount;
        if (this.health <= 0) this.die();
    }

    die() {
        this.alive = false;
        this.scene.remove(this.mesh);
    }

    dispose() {
        this.scene.remove(this.mesh);
    }
}

export class BotManager {
    constructor(scene) {
        this.scene = scene;
        this.bots = [];
    }

    spawn(count, world) {
        const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
        for (let i = 0; i < count; i++) {
            const poi = choice(world.pois);
            const pos = new THREE.Vector3(
                poi.x + rand(-30, 30),
                rand(80, 140),           // falls from the sky like a real drop
                poi.z + rand(-30, 30)
            );
            this.bots.push(new Bot(this.scene, names[i % names.length] + (i >= names.length ? `_${i}` : ''), pos));
        }
    }

    get alive() { return this.bots.filter(b => b.alive); }

    update(dt, t, ctx) {
        for (const b of this.bots) b.update(dt, t, ctx);
    }

    // Simulated off-screen bot fights keep the alive counter moving like a real match.
    simulateFights(t, onKill) {
        const alive = this.alive;
        if (alive.length < 2) return;
        // Roughly one off-screen elimination every ~14s early game
        if (Math.random() < 0.0011 * alive.length) {
            const [a, b] = [choice(alive), choice(alive)];
            if (a !== b) {
                const far = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) > 60;
                if (far) {
                    b.die();
                    onKill(a.name, b.name, a.weapon.cfg.name);
                }
            }
        }
    }

    applyStormDamage(dt, storm, onKill) {
        for (const b of this.alive) {
            const d = Math.hypot(b.position.x - storm.center.x, b.position.z - storm.center.z);
            if (d > storm.radius) {
                b.health -= storm.dps * dt;
                if (b.health <= 0) {
                    b.die();
                    onKill('The Storm', b.name, 'storm');
                }
            }
        }
    }

    dispose() {
        for (const b of this.bots) b.dispose();
        this.bots = [];
    }
}
