import * as THREE from 'three';
import { Noise2D, rand, randInt, choice, clamp } from './utils.js';

// The island. Terrain height is analytic (noise-based) so physics never needs
// to raycast the terrain mesh — getHeight(x, z) is the single source of truth.

export const WORLD_SIZE = 480;          // playable square, centered on origin
const HALF = WORLD_SIZE / 2;
const SEG = 96;

export const HARVEST = {
    tree: { gives: 'wood', amount: 30, hp: 3 },
    rock: { gives: 'stone', amount: 25, hp: 4 },
    car: { gives: 'metal', amount: 25, hp: 4 },
    fence: { gives: 'wood', amount: 15, hp: 2 },
};

const POIS = [
    { name: 'Salty Shores', x: -140, z: -110, houses: 6 },
    { name: 'Tilted Rise', x: 90, z: -140, houses: 8 },
    { name: 'Dusty Flats', x: 150, z: 90, houses: 5 },
    { name: 'Lonely Pines', x: -110, z: 130, houses: 4 },
    { name: 'Middle Market', x: 0, z: 0, houses: 7 },
];

export class World {
    constructor(scene) {
        this.scene = scene;
        this.noise = new Noise2D(7331);
        this.colliders = [];      // structure meshes for raycasts (walls, roofs...)
        this.harvestables = [];   // trees / rocks / cars
        this.chests = [];         // { mesh, opened, position }
        this.pois = POIS;

        this.buildTerrain();
        this.buildWater();
        this.buildPOIs();
        this.scatterNature();
    }

    // Analytic island height: rolling noise hills faded to sea level at the coast.
    getHeight(x, z) {
        const d = Math.sqrt(x * x + z * z) / HALF;      // 0 center → 1 edge
        const falloff = clamp(1 - Math.pow(d, 3.2), 0, 1);
        const n = this.noise.fbm(x * 0.008 + 50, z * 0.008 + 50, 4);
        const hills = Math.pow(n, 1.4) * 26;
        const base = 2.5;
        return (base + hills) * falloff - 1.5;
    }

    buildTerrain() {
        const geo = new THREE.PlaneGeometry(WORLD_SIZE * 1.4, WORLD_SIZE * 1.4, SEG, SEG);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        const colors = new Float32Array(pos.count * 3);
        const grass = new THREE.Color(0x58a44c);
        const grassDark = new THREE.Color(0x3f7f3a);
        const sand = new THREE.Color(0xd9c98a);
        const rock = new THREE.Color(0x8a8f96);
        const c = new THREE.Color();

        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), z = pos.getZ(i);
            const h = this.getHeight(x, z);
            pos.setY(i, h);
            const tint = this.noise.value(x * 0.05, z * 0.05);
            if (h < 0.6) c.copy(sand);
            else if (h > 16) c.copy(rock);
            else c.lerpColors(grassDark, grass, tint);
            colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();

        this.terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
        this.terrain.receiveShadow = true;
        this.scene.add(this.terrain);
    }

    buildWater() {
        const water = new THREE.Mesh(
            new THREE.PlaneGeometry(4000, 4000),
            new THREE.MeshLambertMaterial({ color: 0x2f7fc1, transparent: true, opacity: 0.92 })
        );
        water.rotation.x = -Math.PI / 2;
        water.position.y = -0.4;
        this.scene.add(water);
    }

    buildPOIs() {
        for (const poi of this.pois) {
            const n = poi.houses;
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3);
                const r = rand(10, 34);
                const x = poi.x + Math.cos(a) * r;
                const z = poi.z + Math.sin(a) * r;
                this.buildHouse(x, z, rand(0, Math.PI * 2));
            }
            // Cars near towns give metal
            for (let i = 0; i < 2; i++) {
                this.addCar(poi.x + rand(-40, 40), poi.z + rand(-40, 40));
            }
            // Chests: a couple per POI, plus houses add their own
            for (let i = 0; i < 2; i++) {
                const x = poi.x + rand(-25, 25), z = poi.z + rand(-25, 25);
                this.addChest(x, this.getHeight(x, z), z);
            }
        }
    }

    buildHouse(x, z, rotY) {
        const y = this.getHeight(x, z);
        if (y < 1) return;
        const w = rand(7, 10), d = rand(7, 10), h = rand(4, 5.5);
        const group = new THREE.Group();
        group.position.set(x, y, z);
        group.rotation.y = rotY;

        const wallMat = new THREE.MeshLambertMaterial({ color: choice([0xc9b8a0, 0xb7c4cc, 0xd3c2b2, 0xc4ccb7]) });
        const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
        body.position.y = h / 2;
        body.castShadow = body.receiveShadow = true;
        group.add(body);

        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(Math.max(w, d) * 0.78, 2.6, 4),
            new THREE.MeshLambertMaterial({ color: 0x8a4a3a })
        );
        roof.position.y = h + 1.3;
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        group.add(roof);

        const door = new THREE.Mesh(
            new THREE.BoxGeometry(1.4, 2.4, 0.2),
            new THREE.MeshLambertMaterial({ color: 0x5a3d28 })
        );
        door.position.set(0, 1.2, d / 2 + 0.05);
        group.add(door);

        this.scene.add(group);
        // The body + roof block bullets and walking
        this.colliders.push(body, roof);

        // ~40% of houses hide a chest on the doorstep side
        if (Math.random() < 0.4) {
            const cx = x + Math.sin(rotY) * (d / 2 + 2);
            const cz = z + Math.cos(rotY) * (d / 2 + 2);
            this.addChest(cx, this.getHeight(cx, cz), cz);
        }
    }

    addCar(x, z) {
        const y = this.getHeight(x, z);
        if (y < 1) return;
        const group = new THREE.Group();
        group.position.set(x, y, z);
        group.rotation.y = rand(0, Math.PI * 2);
        const bodyMat = new THREE.MeshLambertMaterial({ color: choice([0xc23b3b, 0x3b6fc2, 0xc2b23b, 0x777f88]) });
        const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.1, 2), bodyMat);
        body.position.y = 0.85;
        const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1.8), new THREE.MeshLambertMaterial({ color: 0x222a33 }));
        cab.position.y = 1.8;
        body.castShadow = cab.castShadow = true;
        group.add(body, cab);
        this.scene.add(group);
        this.registerHarvestable(group, 'car', [body, cab]);
    }

    scatterNature() {
        const treeCount = 160, rockCount = 60;
        for (let i = 0; i < treeCount; i++) {
            const x = rand(-HALF + 15, HALF - 15), z = rand(-HALF + 15, HALF - 15);
            const y = this.getHeight(x, z);
            if (y < 1.2 || this.nearPOI(x, z, 24)) continue;
            this.addTree(x, y, z);
        }
        for (let i = 0; i < rockCount; i++) {
            const x = rand(-HALF + 15, HALF - 15), z = rand(-HALF + 15, HALF - 15);
            const y = this.getHeight(x, z);
            if (y < 1.2) continue;
            this.addRock(x, y, z);
        }
    }

    nearPOI(x, z, dist) {
        return this.pois.some(p => (p.x - x) ** 2 + (p.z - z) ** 2 < dist * dist);
    }

    addTree(x, y, z) {
        const group = new THREE.Group();
        group.position.set(x, y, z);
        const s = rand(0.8, 1.5);
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.35 * s, 0.5 * s, 4 * s, 6),
            new THREE.MeshLambertMaterial({ color: 0x6b4a2f })
        );
        trunk.position.y = 2 * s;
        const crown = new THREE.Mesh(
            new THREE.ConeGeometry(2.4 * s, 5.5 * s, 7),
            new THREE.MeshLambertMaterial({ color: choice([0x2f7a3a, 0x39894a, 0x2a6e35]) })
        );
        crown.position.y = 6 * s;
        trunk.castShadow = crown.castShadow = true;
        group.add(trunk, crown);
        this.scene.add(group);
        this.registerHarvestable(group, 'tree', [trunk, crown]);
    }

    addRock(x, y, z) {
        const s = rand(0.8, 2.2);
        const rock = new THREE.Mesh(
            new THREE.DodecahedronGeometry(1.2 * s, 0),
            new THREE.MeshLambertMaterial({ color: choice([0x8a8f96, 0x767c85, 0x9aa0a8]) })
        );
        rock.position.set(x, y + 0.6 * s, z);
        rock.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
        rock.castShadow = true;
        this.scene.add(rock);
        const group = new THREE.Group();
        // rock is its own hit target; wrap in userData directly
        this.registerHarvestable(rock, 'rock', [rock]);
    }

    registerHarvestable(root, type, hitMeshes) {
        const info = HARVEST[type];
        root.userData.harvest = { type, hp: info.hp, gives: info.gives, amount: info.amount, root };
        for (const m of hitMeshes) {
            m.userData.harvestRoot = root;
        }
        this.harvestables.push(...hitMeshes);
    }

    // Returns { gives, amount } when the object breaks, 'hit' when damaged, null otherwise.
    harvestHit(mesh) {
        const root = mesh.userData.harvestRoot;
        if (!root || !root.userData.harvest) return null;
        const h = root.userData.harvest;
        h.hp -= 1;
        if (h.hp <= 0) {
            this.scene.remove(h.root);
            this.harvestables = this.harvestables.filter(m => m.userData.harvestRoot !== h.root);
            return { gives: h.gives, amount: h.amount };
        }
        // Wobble feedback
        h.root.rotation.z = rand(-0.05, 0.05);
        return 'hit';
    }

    addChest(x, y, z) {
        if (y < 1) return;
        const group = new THREE.Group();
        group.position.set(x, y, z);
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 0.9, 1),
            new THREE.MeshLambertMaterial({ color: 0x8a5a2a })
        );
        body.position.y = 0.45;
        const lid = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 0.45, 1),
            new THREE.MeshLambertMaterial({ color: 0xd9a12f, emissive: 0x3f2a00 })
        );
        lid.position.y = 1.1;
        const glow = new THREE.PointLight(0xffc94d, 0.9, 7);
        glow.position.y = 1.5;
        body.castShadow = true;
        group.add(body, lid, glow);
        this.scene.add(group);
        this.chests.push({ mesh: group, lid, glow, opened: false, position: group.position });
    }

    nearestChest(pos, maxDist = 2.6) {
        let best = null, bestD = maxDist * maxDist;
        for (const c of this.chests) {
            if (c.opened) continue;
            const d = c.position.distanceToSquared(pos);
            if (d < bestD) { bestD = d; best = c; }
        }
        return best;
    }

    openChest(chest) {
        chest.opened = true;
        chest.lid.rotation.x = -1.2;
        chest.lid.position.z = -0.45;
        chest.glow.intensity = 0;
    }
}
