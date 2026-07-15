import * as THREE from 'three';

// Fortnite-style grid building: wall / floor / ramp / roof snapped to a 4m grid.

export const CELL = 4;

export const BUILD_MATS = {
    wood: { name: 'Wood', hp: 150, color: 0x9a6b3f, cost: 10 },
    stone: { name: 'Stone', hp: 300, color: 0x8a8f96, cost: 10 },
    metal: { name: 'Metal', hp: 500, color: 0x9fb2c4, cost: 10 },
};
export const MAT_KEYS = ['wood', 'stone', 'metal'];

export const PIECES = ['wall', 'floor', 'ramp', 'roof'];

function makePieceGeometry(piece) {
    switch (piece) {
        case 'wall': return new THREE.BoxGeometry(CELL, CELL, 0.25);
        case 'floor': return new THREE.BoxGeometry(CELL, 0.25, CELL);
        case 'ramp': {
            const geo = new THREE.BoxGeometry(CELL, 0.25, Math.sqrt(2) * CELL);
            geo.rotateX(-Math.PI / 4);
            return geo;
        }
        case 'roof': return new THREE.ConeGeometry(CELL * 0.72, CELL * 0.6, 4);
    }
}

export class BuildSystem {
    constructor(scene) {
        this.scene = scene;
        this.pieces = [];            // placed meshes (also the collider list)
        this.pieceIndex = 0;         // wall
        this.matIndex = 0;           // wood
        this.rotation = 0;           // quarter turns
        this.occupied = new Set();   // "x|y|z|piece|rot" keys to prevent stacking
        this.active = false;

        this.previewMats = {
            ok: new THREE.MeshBasicMaterial({ color: 0x44ccff, transparent: true, opacity: 0.35, depthWrite: false }),
            bad: new THREE.MeshBasicMaterial({ color: 0xff4444, transparent: true, opacity: 0.35, depthWrite: false }),
        };
        this.preview = new THREE.Mesh(makePieceGeometry('wall'), this.previewMats.ok);
        this.preview.visible = false;
        this.scene.add(this.preview);
        this.previewValid = false;
        this.previewTransform = null;
    }

    get piece() { return PIECES[this.pieceIndex]; }
    get material() { return BUILD_MATS[MAT_KEYS[this.matIndex]]; }
    get materialKey() { return MAT_KEYS[this.matIndex]; }

    setActive(on) {
        this.active = on;
        this.preview.visible = on;
    }

    selectPiece(i) {
        if (i === this.pieceIndex) return;
        this.pieceIndex = i;
        this.preview.geometry.dispose();
        this.preview.geometry = makePieceGeometry(this.piece);
    }

    cycleMaterial() {
        this.matIndex = (this.matIndex + 1) % MAT_KEYS.length;
    }

    rotate() {
        this.rotation = (this.rotation + 1) % 4;
    }

    // forward: normalized horizontal look direction (THREE.Vector3)
    updatePreviewDir(playerPos, forward, getGroundY) {
        const targetX = playerPos.x + forward.x * CELL;
        const targetZ = playerPos.z + forward.z * CELL;
        const gx = Math.round(targetX / CELL) * CELL;
        const gz = Math.round(targetZ / CELL) * CELL;
        const groundY = getGroundY(gx, gz);
        const gy = Math.round((playerPos.y) / CELL) * CELL;
        const baseY = Math.max(gy, Math.round(groundY / CELL) * CELL);

        // Face the piece toward the player's look direction, snapped to 90°
        const snapYaw = Math.round(Math.atan2(forward.x, forward.z) / (Math.PI / 2)) * (Math.PI / 2)
            + this.rotation * (Math.PI / 2);

        const p = this.piece;
        const pos = new THREE.Vector3(gx, 0, gz);
        const rot = new THREE.Euler(0, snapYaw, 0);
        if (p === 'wall') {
            pos.y = baseY + CELL / 2;
            // walls sit on the edge of the cell facing the player
            pos.x -= Math.sin(snapYaw) * CELL / 2;
            pos.z -= Math.cos(snapYaw) * CELL / 2;
        } else if (p === 'floor') {
            // Floors sit at the top of the player's current cell so you can
            // extend a platform from whatever level you're standing on.
            pos.y = baseY;
            if (pos.y < groundY + 0.2) pos.y = baseY + CELL;
        } else if (p === 'ramp') {
            pos.y = baseY + CELL / 2;
        } else if (p === 'roof') {
            pos.y = baseY + CELL + CELL * 0.3;
        }

        const key = `${pos.x}|${pos.y.toFixed(1)}|${pos.z}|${p}|${p === 'wall' || p === 'ramp' ? snapYaw.toFixed(2) : 0}`;
        this.previewValid = !this.occupied.has(key) && pos.y > groundY - CELL;
        this.previewTransform = { pos, rot, key };

        this.preview.position.copy(pos);
        this.preview.rotation.copy(rot);
        if (p === 'roof') this.preview.rotation.y += Math.PI / 4;
        this.preview.material = this.previewValid ? this.previewMats.ok : this.previewMats.bad;
    }

    place() {
        if (!this.previewValid || !this.previewTransform) return false;
        const mat = this.material;
        const mesh = new THREE.Mesh(
            makePieceGeometry(this.piece),
            new THREE.MeshLambertMaterial({ color: mat.color, transparent: true, opacity: 0.95 })
        );
        mesh.position.copy(this.previewTransform.pos);
        mesh.rotation.copy(this.previewTransform.rot);
        if (this.piece === 'roof') mesh.rotation.y += Math.PI / 4;
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.userData.build = { hp: mat.hp, maxHp: mat.hp, key: this.previewTransform.key };
        this.scene.add(mesh);
        this.pieces.push(mesh);
        this.occupied.add(this.previewTransform.key);
        this.previewValid = false; // force re-eval next frame
        return true;
    }

    // Bot helper: place an instant wall/ramp at a world position.
    botPlace(piece, pos, yaw) {
        const gx = Math.round(pos.x / CELL) * CELL;
        const gz = Math.round(pos.z / CELL) * CELL;
        const gy = Math.round(pos.y / CELL) * CELL;
        const snapYaw = Math.round(yaw / (Math.PI / 2)) * (Math.PI / 2);
        const key = `${gx}|${(gy + CELL / 2).toFixed(1)}|${gz}|${piece}|${snapYaw.toFixed(2)}`;
        if (this.occupied.has(key)) return false;
        const mat = BUILD_MATS.wood;
        const mesh = new THREE.Mesh(
            makePieceGeometry(piece),
            new THREE.MeshLambertMaterial({ color: mat.color })
        );
        mesh.position.set(gx, gy + CELL / 2, gz);
        mesh.rotation.y = snapYaw;
        mesh.castShadow = true;
        mesh.userData.build = { hp: mat.hp, maxHp: mat.hp, key };
        this.scene.add(mesh);
        this.pieces.push(mesh);
        this.occupied.add(key);
        return true;
    }

    // Apply damage to a placed piece; removes it when destroyed.
    damage(mesh, amount) {
        const b = mesh.userData.build;
        if (!b) return false;
        b.hp -= amount;
        if (b.hp <= 0) {
            this.scene.remove(mesh);
            this.occupied.delete(b.key);
            const i = this.pieces.indexOf(mesh);
            if (i >= 0) this.pieces.splice(i, 1);
            mesh.geometry.dispose();
            mesh.material.dispose();
        } else {
            mesh.material.opacity = 0.5 + 0.5 * (b.hp / b.maxHp);
            mesh.material.transparent = true;
        }
        return true;
    }
}
