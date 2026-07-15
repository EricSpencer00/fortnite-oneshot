import * as THREE from 'three';
import { clamp, damp, lerp } from './utils.js';
import { Arsenal, buildGunMesh } from './weapons.js';

// Over-the-shoulder third-person camera with proper ADS:
// - shoulder offset lerps in when aiming
// - FOV zooms per-weapon
// - shots are fired along the exact camera ray through the crosshair,
//   so bullets land where the crosshair points.
export class ShoulderCamera {
    constructor() {
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2500);
        this.yaw = 0;
        this.pitch = -0.15;
        this.sensitivity = 0.0021;

        this.hipOffset = new THREE.Vector3(0.9, 1.9, 3.8);   // +z is behind (camera space)
        this.adsOffset = new THREE.Vector3(0.75, 1.7, 1.9);
        this.currentOffset = this.hipOffset.clone();
        this.baseFov = 75;
        this.targetFov = 75;
        this.aiming = false;
        this.recoilPitch = 0;

        this.ray = new THREE.Raycaster();
        this._q = new THREE.Quaternion();
        this._e = new THREE.Euler(0, 0, 0, 'YXZ');
        this._off = new THREE.Vector3();
        this._head = new THREE.Vector3();
        this._desired = new THREE.Vector3();
        this._dir = new THREE.Vector3();

        window.addEventListener('resize', () => {
            if (window.innerWidth === 0 || window.innerHeight === 0) return; // minimized/hidden
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
        });
    }

    look(dx, dy) {
        const sens = this.sensitivity * (this.aiming ? 0.55 : 1);
        this.yaw -= dx * sens;
        this.pitch -= dy * sens;
        this.pitch = clamp(this.pitch, -1.35, 1.35);
    }

    kick(amount) {
        this.recoilPitch += amount;
    }

    setAim(aiming, zoomMult) {
        this.aiming = aiming;
        this.targetFov = this.baseFov * (aiming ? zoomMult : 1);
    }

    update(dt, targetPos, colliders) {
        // Recoil recovers smoothly
        this.pitch += this.recoilPitch * damp(30, dt);
        this.recoilPitch *= 1 - damp(12, dt);

        const k = damp(12, dt);
        this.currentOffset.lerp(this.aiming ? this.adsOffset : this.hipOffset, k);
        this.camera.fov = lerp(this.camera.fov, this.targetFov, damp(10, dt));
        this.camera.updateProjectionMatrix();

        this._e.set(this.pitch, this.yaw, 0);
        this._q.setFromEuler(this._e);

        this._head.copy(targetPos);
        this._head.y += 1.5;

        this._off.copy(this.currentOffset).applyQuaternion(this._q);
        this._desired.copy(this._head).add(this._off);

        // Pull camera in front of anything between head and camera
        this._dir.copy(this._desired).sub(this._head);
        const dist = this._dir.length();
        this._dir.normalize();
        this.ray.set(this._head, this._dir);
        this.ray.far = dist;
        const hits = this.ray.intersectObjects(colliders, true);
        if (hits.length > 0 && hits[0].distance < dist) {
            this._desired.copy(this._head).addScaledVector(this._dir, Math.max(0.3, hits[0].distance - 0.3));
        }

        this.camera.position.lerp(this._desired, damp(25, dt));
        this.camera.quaternion.copy(this._q);
    }

    // Ray through the crosshair (screen center)
    aimRay() {
        this.ray.far = Infinity;
        this.ray.setFromCamera({ x: 0, y: 0 }, this.camera);
        return { origin: this.ray.ray.origin.clone(), direction: this.ray.ray.direction.clone() };
    }

    forwardFlat() {
        const d = new THREE.Vector3(0, 0, -1).applyQuaternion(this._q);
        d.y = 0;
        return d.normalize();
    }

    rightFlat() {
        const d = new THREE.Vector3(1, 0, 0).applyQuaternion(this._q);
        d.y = 0;
        return d.normalize();
    }
}

// Blocky humanoid used by both the player and bots.
export function buildCharacterMesh(shirtColor, pantsColor = 0x35404d) {
    const g = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
    const pants = new THREE.MeshLambertMaterial({ color: pantsColor });
    const skin = new THREE.MeshLambertMaterial({ color: 0xe8b98a });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.75, 0.4), shirt);
    torso.position.y = 1.05;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
    head.position.y = 1.68;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.3), pants);
    legL.position.set(-0.18, 0.35, 0);
    const legR = legL.clone();
    legR.position.x = 0.18;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.65, 0.25), shirt);
    armL.position.set(-0.48, 1.1, 0);
    const armR = armL.clone();
    armR.position.x = 0.48;

    for (const m of [torso, head, legL, legR, armL, armR]) m.castShadow = true;
    g.add(torso, head, legL, legR, armL, armR);

    // Hand anchor for the weapon
    const hand = new THREE.Group();
    hand.position.set(0.48, 1.15, -0.35);
    g.add(hand);

    head.userData.isHead = true;
    return { group: g, head, hand, legL, legR, armL, armR };
}

export class Player {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        this.health = 100;
        this.maxHealth = 100;
        this.shield = 0;
        this.maxShield = 100;
        this.alive = true;
        this.kills = 0;
        this.materials = { wood: 100, stone: 50, metal: 20 };
        this.arsenal = new Arsenal();

        this.position = new THREE.Vector3(0, 40, 0);
        this.velocity = new THREE.Vector3();
        this.moveSpeed = 6.5;
        this.sprintMult = 1.55;
        this.jumpForce = 8.5;
        this.gravity = 24;
        this.grounded = false;
        this.radius = 0.45;

        const body = buildCharacterMesh(0x2f9fe0);
        this.mesh = body.group;
        this.parts = body;
        this.mesh.position.copy(this.position);
        scene.add(this.mesh);

        this.gunMesh = null;
        this.refreshGunMesh();

        this.walkPhase = 0;

        this._ray = new THREE.Raycaster();
        this._down = new THREE.Vector3(0, -1, 0);
        this._tmp = new THREE.Vector3();
    }

    refreshGunMesh() {
        if (this.gunMesh) this.parts.hand.remove(this.gunMesh);
        const w = this.arsenal.current;
        this.gunMesh = buildGunMesh(w.type, w.rarity);
        this.gunMesh.rotation.y = -Math.PI / 2;
        this.parts.hand.add(this.gunMesh);
    }

    setPosition(p) {
        this.position.copy(p);
        this.mesh.position.copy(p);
    }

    // groundY(x,z): terrain height. structures: meshes to raycast (buildings + builds).
    update(dt, input, world, structures) {
        if (!this.alive) return;

        const mv = input.move();
        const aiming = input.aiming();
        const sprinting = input.sprint() && mv.z > 0 && !aiming;

        const fwd = this.camera.forwardFlat();
        const right = this.camera.rightFlat();
        this._tmp.set(0, 0, 0)
            .addScaledVector(fwd, mv.z)
            .addScaledVector(right, mv.x);

        const moving = this._tmp.lengthSq() > 0;
        if (moving) {
            this._tmp.normalize();
            const speed = this.moveSpeed * (sprinting ? this.sprintMult : 1) * (aiming ? 0.55 : 1);
            this.velocity.x = this._tmp.x * speed;
            this.velocity.z = this._tmp.z * speed;
        } else {
            this.velocity.x *= 1 - damp(14, dt);
            this.velocity.z *= 1 - damp(14, dt);
        }

        if (input.jump() && this.grounded) {
            this.velocity.y = this.jumpForce;
            this.grounded = false;
        }
        this.velocity.y -= this.gravity * dt;
        this.velocity.y = Math.max(this.velocity.y, -55);

        this.integrate(dt, world, structures);

        // Character faces camera yaw while aiming/firing, else movement direction
        let targetYaw;
        if (aiming || input.firing() || !moving) {
            targetYaw = this.camera.yaw;
        } else {
            targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
        }
        let dy = targetYaw - this.mesh.rotation.y;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.mesh.rotation.y += dy * damp(14, dt);

        // Simple walk/aim animation
        const speed2 = Math.hypot(this.velocity.x, this.velocity.z);
        this.walkPhase += dt * speed2 * 1.6;
        const swing = speed2 > 0.5 ? Math.sin(this.walkPhase) * 0.5 : 0;
        this.parts.legL.rotation.x = swing;
        this.parts.legR.rotation.x = -swing;
        this.parts.armL.rotation.x = -swing * 0.7;
        // Right arm raises the gun toward camera pitch when aiming
        const aimLift = aiming ? -Math.PI / 2 - this.camera.pitch : (this.arsenal.isPickaxe ? swing * 0.7 : -1.1);
        this.parts.armR.rotation.x += (aimLift - this.parts.armR.rotation.x) * damp(14, dt);
        this.parts.hand.rotation.x = this.parts.armR.rotation.x + Math.PI / 2 - 0.2;

        this.arsenal.update(performance.now() / 1000);
    }

    integrate(dt, world, structures) {
        const next = this._tmp.set(
            this.position.x + this.velocity.x * dt,
            this.position.y + this.velocity.y * dt,
            this.position.z + this.velocity.z * dt
        );

        // Horizontal blocking against structures
        const hv = Math.hypot(this.velocity.x, this.velocity.z);
        if (hv > 0.1 && structures.length) {
            const dir = new THREE.Vector3(this.velocity.x / hv, 0, this.velocity.z / hv);
            const origin = this.position.clone();
            origin.y += 1.0;
            this._ray.set(origin, dir);
            this._ray.far = this.radius + hv * dt + 0.1;
            const hits = this._ray.intersectObjects(structures, true);
            if (hits.length > 0) {
                // Slide along the surface
                const n = hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld);
                n.y = 0;
                if (n.lengthSq() > 0.001) {
                    n.normalize();
                    const vel = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
                    vel.addScaledVector(n, -vel.dot(n));
                    next.x = this.position.x + vel.x * dt;
                    next.z = this.position.z + vel.z * dt;
                }
            }
        }

        // Vertical: floor = max(terrain, structure under feet)
        let floorY = world.getHeight(next.x, next.z);
        if (structures.length) {
            const origin = new THREE.Vector3(next.x, this.position.y + 1.4, next.z);
            this._ray.set(origin, this._down);
            this._ray.far = 30;
            const hits = this._ray.intersectObjects(structures, true);
            if (hits.length > 0) {
                const sy = hits[0].point.y;
                if (sy > floorY && sy <= this.position.y + 0.6) floorY = sy;
            }
        }

        if (next.y <= floorY) {
            next.y = floorY;
            if (this.velocity.y < 0) this.velocity.y = 0;
            this.grounded = true;
        } else {
            this.grounded = next.y - floorY < 0.05;
        }

        this.position.copy(next);
        this.mesh.position.copy(this.position);
    }

    takeDamage(amount) {
        if (!this.alive) return;
        if (this.shield > 0) {
            const s = Math.min(this.shield, amount);
            this.shield -= s;
            amount -= s;
        }
        this.health = clamp(this.health - amount, 0, this.maxHealth);
        if (this.health <= 0) this.die();
    }

    heal(hp) { this.health = clamp(this.health + hp, 0, this.maxHealth); }
    addShield(s) { this.shield = clamp(this.shield + s, 0, this.maxShield); }

    die() {
        this.alive = false;
        this.mesh.visible = false;
    }

    dispose() {
        this.scene.remove(this.mesh);
    }
}
