// Static island content: towns (enterable houses), trees, rocks, cars, chests,
// loot spawn points. Built once per page load; match state resets separately.
import * as THREE from 'three';
import { POIS, HALF } from './config.js';
import { terrainHeight, setFlatPads, padHeight, terrainNormal } from './terrain.js';
import { addCollider, removeCollider } from './physics.js';
import { GeoBatch } from './geom.js';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildWorld(scene, tex, mats) {
  const R = mulberry32(1337);
  const rr = (a, b) => a + (b - a) * R();

  // flatten a pad under every town
  const pads = POIS.map((p) => ({ x: p.x, z: p.z, r: 40, y: Math.max(3, padHeight(p.x, p.z)) }));
  setFlatPads(pads);

  const world = {
    chests: [], lootSpots: [], nodes: [], pois: POIS, houses: [],
    treeMesh: null, foliageMesh: null, rockMesh: null,
  };

  // ------------------------------------------------------------ towns
  const houseRects = [];
  for (let pi = 0; pi < POIS.length; pi++) {
    const poi = POIS[pi], pad = pads[pi];
    const brick = new GeoBatch(), wood = new GeoBatch(), roof = new GeoBatch(), floor = new GeoBatch(), trim = new GeoBatch();
    const n = pi === 1 ? 9 : 6;
    let placed = 0;
    for (let attempt = 0; attempt < 60 && placed < n; attempt++) {
      const a = rr(0, Math.PI * 2), r = attempt === 0 && pi === 1 ? 0 : rr(8, 34);
      const w = Math.round(rr(8, 12) / 2) * 2, d = Math.round(rr(8, 12) / 2) * 2;
      const x = Math.round(poi.x + Math.cos(a) * r), z = Math.round(poi.z + Math.sin(a) * r);
      const rect = { x0: x - w / 2 - 3, z0: z - d / 2 - 3, x1: x + w / 2 + 3, z1: z + d / 2 + 3 };
      if (houseRects.some((o) => rect.x0 < o.x1 && rect.x1 > o.x0 && rect.z0 < o.z1 && rect.z1 > o.z0)) continue;
      houseRects.push(rect);
      placed++;
      const y = pad.y;
      const twoStory = R() < 0.3;
      const H = twoStory ? 7.6 : 4;
      const t = 0.3;
      const x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
      const batch = R() < 0.5 ? brick : wood;
      // two-storey stairs run along the east wall: never put the door there
      const doorSide = twoStory ? [0, 2, 3][Math.floor(R() * 3)] : Math.floor(R() * 4);
      const dw = 1.8, dh = 2.7;
      // foundation slab (also floor) — goes down into terrain
      floor.box(x0, y - 3, z0, x1, y + 0.15, z1, 0.25);
      addCollider({ minX: x0, minY: y - 3, minZ: z0, maxX: x1, maxY: y + 0.15, maxZ: z1, kind: 'house' });
      const wallSeg = (ax0, az0, ax1, az1, hasDoor, winY) => {
        // wall along x if az0==az1-t else along z
        const alongX = ax1 - ax0 > az1 - az0;
        const len = alongX ? ax1 - ax0 : az1 - az0;
        const mid = alongX ? (ax0 + ax1) / 2 : (az0 + az1) / 2;
        const parts = [];
        if (hasDoor) {
          parts.push([alongX ? ax0 : az0, mid - dw / 2, y + 0.15, y + H]);
          parts.push([mid + dw / 2, alongX ? ax1 : az1, y + 0.15, y + H]);
          parts.push([mid - dw / 2, mid + dw / 2, y + 0.15 + dh, y + H]);
        } else {
          // window opening on long walls
          if (len > 7) {
            const wy0 = y + 1.3, wy1 = y + 2.5;
            parts.push([alongX ? ax0 : az0, mid - 1, y + 0.15, y + H]);
            parts.push([mid + 1, alongX ? ax1 : az1, y + 0.15, y + H]);
            parts.push([mid - 1, mid + 1, y + 0.15, wy0]);
            parts.push([mid - 1, mid + 1, wy1, y + H]);
          } else parts.push([alongX ? ax0 : az0, alongX ? ax1 : az1, y + 0.15, y + H]);
        }
        for (const [s0, s1, py0, py1] of parts) {
          if (s1 - s0 < 0.01) continue;
          const b = alongX ? [s0, py0, az0, s1, py1, az1] : [ax0, py0, s0, ax1, py1, s1];
          batch.box(b[0], b[1], b[2], b[3], b[4], b[5], 0.3);
          addCollider({ minX: b[0], minY: b[1], minZ: b[2], maxX: b[3], maxY: b[4], maxZ: b[5], kind: 'house' });
        }
      };
      wallSeg(x0, z1 - t, x1, z1, doorSide === 0);
      wallSeg(x0, z0, x1, z0 + t, doorSide === 2);
      wallSeg(x1 - t, z0 + t, x1, z1 - t, doorSide === 1);
      wallSeg(x0, z0 + t, x0 + t, z1 - t, doorSide === 3);
      if (twoStory) {
        // upper floor with a stair hole + a solid ramp-stair
        const fy = y + 3.8;
        floor.box(x0 + t, fy, z0 + t, x1 - t - 2.4, fy + 0.2, z1 - t, 0.25);
        addCollider({ minX: x0 + t, minY: fy, minZ: z0 + t, maxX: x1 - t - 2.4, maxY: fy + 0.2, maxZ: z1 - t, kind: 'house' });
        // stair along +z on the x1 side
        const sx0 = x1 - t - 2.4, sx1 = x1 - t, sz0 = z0 + t + 0.5, sz1 = sz0 + 4.2;
        const steps = 12;
        for (let s = 0; s < steps; s++) {
          const sy = y + 0.15 + ((s + 1) / steps) * (fy + 0.2 - y - 0.15);
          trim.box(sx0, y + 0.15, sz0 + (s / steps) * (sz1 - sz0), sx1, sy, sz0 + ((s + 1) / steps) * (sz1 - sz0), 0.5); // solid steps
        }
        addCollider({ minX: sx0, minY: y + 0.15, minZ: sz0, maxX: sx1, maxY: fy + 0.2, maxZ: sz1, kind: 'house', ramp: { dir: 0 } });
      }
      // roof (flat collider on top so you can stand on it)
      roof.gable(x0, z0, x1, z1, y + H, Math.min(w, 10) * 0.32, 0.3);
      batch.gableEnds(x0, z0, x1, z1, y + H, Math.min(w, 10) * 0.32, 0.3);
      addCollider({ minX: x0, minY: y + H, minZ: z0, maxX: x1, maxY: y + H + 0.3, maxZ: z1, kind: 'house' });
      trim.box(x0 - 0.15, y + 0.15, z0 - 0.15, x0 + 0.15, y + H, z0 + 0.15, 0.5);
      trim.box(x1 - 0.15, y + 0.15, z0 - 0.15, x1 + 0.15, y + H, z0 + 0.15, 0.5);
      trim.box(x0 - 0.15, y + 0.15, z1 - 0.15, x0 + 0.15, y + H, z1 + 0.15, 0.5);
      trim.box(x1 - 0.15, y + 0.15, z1 - 0.15, x1 + 0.15, y + H, z1 + 0.15, 0.5);
      // navigation metadata for bots: door in/out points and the stair column
      const dn = [[0, 1], [1, 0], [0, -1], [-1, 0]][doorSide];
      const dc = { x: x + dn[0] * w / 2, z: z + dn[1] * d / 2 };
      const house = {
        x, z, w, d, y, H, x0, x1, z0, z1,
        doorOut: { x: dc.x + dn[0] * 1.6, z: dc.z + dn[1] * 1.6 },
        doorIn: { x: dc.x - dn[0] * 1.3, z: dc.z - dn[1] * 1.3 },
        stair: twoStory ? { x: x1 - t - 1.2, z0: z0 + t + 0.5, z1: z0 + t + 4.7, top: y + 4.0, floorX: x1 - t - 3.4 } : null,
      };
      world.houses.push(house);

      // chest + loot inside
      if (R() < 0.7) {
        const cx = rr(x0 + 1.2, x1 - 3), cz = rr(z0 + 1.2, z1 - 1.2);
        world.chests.push({ x: cx, y: y + 0.15, z: cz, rot: Math.floor(R() * 4) * Math.PI / 2 });
      }
      world.lootSpots.push({ x: rr(x0 + 1, x1 - 3), y: y + 0.15, z: rr(z0 + 1, z1 - 1) });
      if (twoStory) {
        world.lootSpots.push({ x: rr(x0 + 1, x1 - 4), y: y + 4.0, z: rr(z0 + 1, z1 - 1) });
        if (R() < 0.6) world.chests.push({ x: rr(x0 + 1, x1 - 4), y: y + 4.0, z: rr(z0 + 1.2, z1 - 1.2), rot: 0 });
      }
    }
    const add = (b, m, shadow = true) => {
      if (!b.pos.length) return;
      const mesh = new THREE.Mesh(b.build(), m);
      mesh.castShadow = shadow; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
      scene.add(mesh);
    };
    add(brick, mats.brick); add(wood, mats.wood); add(roof, mats.roof); add(floor, mats.floor, false); add(trim, mats.trim);
    // a few outdoor loot spots around town
    for (let i = 0; i < 6; i++) {
      const lx = poi.x + rr(-38, 38), lz = poi.z + rr(-38, 38);
      if (houseRects.some((o) => lx > o.x0 && lx < o.x1 && lz > o.z0 && lz < o.z1)) continue;
      world.lootSpots.push({ x: lx, y: terrainHeight(lx, lz), z: lz });
    }
  }
  const inHouse = (x, z, m = 0) => houseRects.some((o) => x > o.x0 - m && x < o.x1 + m && z > o.z0 - m && z < o.z1 + m);
  world.inHouse = inHouse;

  // ------------------------------------------------------------ trees (instanced)
  const trees = [];
  for (let i = 0; trees.length < 380 && i < 4000; i++) {
    const x = rr(-HALF, HALF), z = rr(-HALF, HALF);
    const h = terrainHeight(x, z);
    if (h < 2.6 || inHouse(x, z, 3)) continue;
    if (terrainNormal(x, z).y < 0.75) continue;
    // clustered forests
    const f = Math.sin(x * 0.021) * Math.cos(z * 0.017) + Math.sin((x + z) * 0.013);
    if (f < -0.2 && R() < 0.75) continue;
    trees.push({ x, z, y: h, s: rr(0.8, 1.35) });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 4, 7, 1, true); trunkGeo.translate(0, 2, 0);
  const folGeo = new THREE.IcosahedronGeometry(2.3, 1);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, mats.bark, trees.length);
  const folMesh = new THREE.InstancedMesh(folGeo, mats.leaves, trees.length * 2);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p3 = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  trees.forEach((t, i) => {
    q.setFromAxisAngle(up, rr(0, 6.28));
    m4.compose(p3.set(t.x, t.y - 0.2, t.z), q, sc.set(t.s, t.s, t.s)); trunkMesh.setMatrixAt(i, m4);
    m4.compose(p3.set(t.x, t.y + 4.4 * t.s, t.z), q, sc.set(t.s * 1.15, t.s * 1.0, t.s * 1.15)); folMesh.setMatrixAt(i * 2, m4);
    m4.compose(p3.set(t.x + 0.3 * t.s, t.y + 6.3 * t.s, t.z - 0.2 * t.s), q, sc.set(t.s * 0.78, t.s * 0.8, t.s * 0.78)); folMesh.setMatrixAt(i * 2 + 1, m4);
    const node = { kind: 'tree', mat: 0, hp: 160, maxHp: 160, x: t.x, y: t.y, z: t.z, s: t.s, idx: i, alive: true };
    node.collider = addCollider({ minX: t.x - 0.45 * t.s, minY: t.y - 1, minZ: t.z - 0.45 * t.s, maxX: t.x + 0.45 * t.s, maxY: t.y + 4 * t.s, maxZ: t.z + 0.45 * t.s, kind: 'node', ref: node });
    node.collider2 = addCollider({ minX: t.x - 1.6 * t.s, minY: t.y + 3 * t.s, minZ: t.z - 1.6 * t.s, maxX: t.x + 1.6 * t.s, maxY: t.y + 7 * t.s, maxZ: t.z + 1.6 * t.s, kind: 'node', ref: node, noBlock: true });
    world.nodes.push(node);
  });
  trunkMesh.castShadow = folMesh.castShadow = true;
  trunkMesh.receiveShadow = folMesh.receiveShadow = true;
  scene.add(trunkMesh, folMesh);
  world.treeMesh = trunkMesh; world.foliageMesh = folMesh;

  // ------------------------------------------------------------ rocks
  const rocks = [];
  for (let i = 0; rocks.length < 140 && i < 3000; i++) {
    const x = rr(-HALF, HALF), z = rr(-HALF, HALF);
    const h = terrainHeight(x, z);
    if (h < 1 || inHouse(x, z, 3)) continue;
    rocks.push({ x, z, y: h, s: rr(0.8, 2.1) });
  }
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMesh = new THREE.InstancedMesh(rockGeo, mats.rock, rocks.length);
  rocks.forEach((r, i) => {
    q.setFromEuler(new THREE.Euler(rr(0, 3), rr(0, 6), rr(0, 3)));
    m4.compose(p3.set(r.x, r.y + r.s * 0.3, r.z), q, sc.set(r.s * 1.3, r.s * 0.9, r.s * 1.1));
    rockMesh.setMatrixAt(i, m4);
    const node = { kind: 'rock', mat: 1, hp: 220, maxHp: 220, x: r.x, y: r.y, z: r.z, s: r.s, idx: i, alive: true };
    node.collider = addCollider({ minX: r.x - r.s, minY: r.y - 2, minZ: r.z - r.s, maxX: r.x + r.s, maxY: r.y + r.s * 1.1, maxZ: r.z + r.s, kind: 'node', ref: node });
    world.nodes.push(node);
  });
  rockMesh.castShadow = true; rockMesh.receiveShadow = true;
  scene.add(rockMesh);
  world.rockMesh = rockMesh;

  // ------------------------------------------------------------ cars (metal)
  const carColors = [0xd94343, 0x3b7dd8, 0xf2c14e, 0x5cbf73, 0xeeeeee];
  for (const poi of POIS) {
    for (let i = 0; i < 3; i++) {
      const x = poi.x + rr(-36, 36), z = poi.z + rr(-36, 36);
      if (inHouse(x, z, 2.5)) continue;
      const y = terrainHeight(x, z);
      const car = new THREE.Group();
      const paint = new THREE.MeshLambertMaterial({ color: carColors[Math.floor(R() * carColors.length)] });
      const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.9, 2), paint); body.position.y = 0.75;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 1.8), mats.glass); cab.position.set(-0.2, 1.6, 0);
      car.add(body, cab);
      for (const [wx, wz] of [[1.4, 1], [-1.4, 1], [1.4, -1], [-1.4, -1]]) {
        const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), mats.tire);
        wh.rotation.x = Math.PI / 2; wh.position.set(wx, 0.42, wz); car.add(wh);
      }
      const rot = R() < 0.5 ? 0 : Math.PI / 2;
      car.rotation.y = rot;
      car.position.set(x, y, z);
      car.traverse((o) => { o.castShadow = true; });
      scene.add(car);
      const hx = rot ? 1 : 2.1, hz = rot ? 2.1 : 1;
      const node = { kind: 'car', mat: 2, hp: 300, maxHp: 300, x, y, z, s: 1, mesh: car, alive: true };
      node.collider = addCollider({ minX: x - hx, minY: y - 0.5, minZ: z - hz, maxX: x + hx, maxY: y + 2, maxZ: z + hz, kind: 'node', ref: node });
      world.nodes.push(node);
    }
  }

  // ------------------------------------------------------------ bushes (decor only)
  const bushes = [];
  for (let i = 0; bushes.length < 220 && i < 3000; i++) {
    const x = rr(-HALF, HALF), z = rr(-HALF, HALF);
    const h = terrainHeight(x, z);
    if (h < 2.4 || inHouse(x, z, 2)) continue;
    bushes.push({ x, y: h, z, s: rr(0.6, 1.1) });
  }
  const bushMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mats.bush, bushes.length);
  bushes.forEach((b, i) => { m4.compose(p3.set(b.x, b.y + 0.4 * b.s, b.z), q.identity(), sc.set(b.s * 1.2, b.s * 0.8, b.s * 1.2)); bushMesh.setMatrixAt(i, m4); });
  bushMesh.receiveShadow = true;
  scene.add(bushMesh);

  // extra wilderness loot
  for (let i = 0; i < 40; i++) {
    const x = rr(-HALF * 0.8, HALF * 0.8), z = rr(-HALF * 0.8, HALF * 0.8);
    const h = terrainHeight(x, z);
    if (h < 1.5 || inHouse(x, z, 1)) { i--; continue; }
    world.lootSpots.push({ x, y: h, z });
  }
  for (let i = 0; i < 14; i++) {
    const x = rr(-HALF * 0.75, HALF * 0.75), z = rr(-HALF * 0.75, HALF * 0.75);
    const h = terrainHeight(x, z);
    if (h < 2 || inHouse(x, z, 2)) { i--; continue; }
    world.chests.push({ x, y: h, z, rot: rr(0, 6.28) });
  }
  world.saved = [trunkMesh, folMesh, rockMesh].map((m) => m.instanceMatrix.array.slice());
  return world;
}

export function restoreNodes(world) {
  [world.treeMesh, world.foliageMesh, world.rockMesh].forEach((m, i) => {
    m.instanceMatrix.array.set(world.saved[i]);
    m.instanceMatrix.needsUpdate = true;
  });
  for (const n of world.nodes) {
    if (!n.alive) {
      addCollider(n.collider);
      if (n.collider2) addCollider(n.collider2);
      if (n.mesh) n.mesh.visible = true;
    }
    n.alive = true; n.hp = n.maxHp;
  }
}

const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
export function destroyNode(world, node) {
  node.alive = false;
  removeCollider(node.collider);
  if (node.collider2) removeCollider(node.collider2);
  if (node.kind === 'tree') {
    world.treeMesh.setMatrixAt(node.idx, hidden);
    world.foliageMesh.setMatrixAt(node.idx * 2, hidden);
    world.foliageMesh.setMatrixAt(node.idx * 2 + 1, hidden);
    world.treeMesh.instanceMatrix.needsUpdate = true;
    world.foliageMesh.instanceMatrix.needsUpdate = true;
  } else if (node.kind === 'rock') {
    world.rockMesh.setMatrixAt(node.idx, hidden);
    world.rockMesh.instanceMatrix.needsUpdate = true;
  } else if (node.mesh) node.mesh.visible = false;
}
