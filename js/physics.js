// Spatial hash of axis-aligned boxes + ramps, terrain/box/ramp raycasts and
// a simple swept-AABB character mover. No physics engine: everything here is
// cheap enough to run for 30 actors at 60 fps.
import { terrainHeight } from './terrain.js';
import { GRAVITY, HALF } from './config.js';

const GRID = 8;
const cells = new Map();
let stamp = 1;

const key = (cx, cz) => (cx + 512) * 4096 + (cz + 512);

// collider: {minX,minY,minZ,maxX,maxY,maxZ, kind, ref, ramp?: {dir, baseY}}
// ramp dir: 0:+z up,1:+x up,2:-z up,3:-x up (direction in which it rises)
export function addCollider(c) {
  c._s = 0;
  const x0 = Math.floor(c.minX / GRID), x1 = Math.floor(c.maxX / GRID);
  const z0 = Math.floor(c.minZ / GRID), z1 = Math.floor(c.maxZ / GRID);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const k = key(x, z);
    let arr = cells.get(k);
    if (!arr) cells.set(k, (arr = []));
    arr.push(c);
  }
  return c;
}

export function removeCollider(c) {
  const x0 = Math.floor(c.minX / GRID), x1 = Math.floor(c.maxX / GRID);
  const z0 = Math.floor(c.minZ / GRID), z1 = Math.floor(c.maxZ / GRID);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const arr = cells.get(key(x, z));
    if (!arr) continue;
    const i = arr.indexOf(c);
    if (i >= 0) arr.splice(i, 1);
  }
}

export function clearColliders(filter) {
  for (const arr of cells.values()) {
    for (let i = arr.length - 1; i >= 0; i--) if (filter(arr[i])) arr.splice(i, 1);
  }
}

const tmpList = [];
export function queryBox(minX, minZ, maxX, maxZ, out = tmpList) {
  out.length = 0;
  stamp++;
  const x0 = Math.floor(minX / GRID), x1 = Math.floor(maxX / GRID);
  const z0 = Math.floor(minZ / GRID), z1 = Math.floor(maxZ / GRID);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    const arr = cells.get(key(x, z));
    if (!arr) continue;
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      if (c._s === stamp) continue;
      c._s = stamp;
      if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
      out.push(c);
    }
  }
  return out;
}

// height of a ramp surface at (x,z); assumes point inside its footprint
export function rampHeightAt(c, x, z) {
  const r = c.ramp;
  let t;
  switch (r.dir) {
    case 0: t = (z - c.minZ) / (c.maxZ - c.minZ); break;
    case 1: t = (x - c.minX) / (c.maxX - c.minX); break;
    case 2: t = (c.maxZ - z) / (c.maxZ - c.minZ); break;
    default: t = (c.maxX - x) / (c.maxX - c.minX); break;
  }
  t = Math.min(1, Math.max(0, t));
  return c.minY + t * (c.maxY - c.minY);
}

// Highest walkable surface under a footprint that is no higher than feet+step.
export function groundHeight(x, z, feetY, r, step = 0.6) {
  let g = terrainHeight(x, z);
  const list = queryBox(x - r, z - r, x + r, z + r);
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    let top;
    if (c.ramp) {
      top = rampHeightAt(c, Math.min(c.maxX, Math.max(c.minX, x)), Math.min(c.maxZ, Math.max(c.minZ, z)));
      // only count the ramp if the actor center is over it
      if (x < c.minX || x > c.maxX || z < c.minZ || z > c.maxZ) continue;
    } else top = c.maxY;
    if (top <= feetY + step && top > g) g = top;
  }
  return g;
}

function depenetrate(a, r, h, step) {
  const p = a.pos;
  const list = queryBox(p.x - r, p.z - r, p.x + r, p.z + r);
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c.noBlock) continue;
    if (c.ramp) {
      if (p.x + r <= c.minX || p.x - r >= c.maxX || p.z + r <= c.minZ || p.z - r >= c.maxZ) continue;
      const sh = rampHeightAt(c, Math.min(c.maxX, Math.max(c.minX, p.x)), Math.min(c.maxZ, Math.max(c.minZ, p.z)));
      if (sh <= p.y + 0.62 || sh - 0.25 >= p.y + h) continue;
      // out the side of the slab (perpendicular to its slope)
      const alongX = c.ramp.dir === 1 || c.ramp.dir === 3;
      if (alongX) { const a1 = p.z + r - c.minZ, a2 = c.maxZ - (p.z - r); p.z += a1 < a2 ? -(a1 + 0.001) : a2 + 0.001; }
      else { const a1 = p.x + r - c.minX, a2 = c.maxX - (p.x - r); p.x += a1 < a2 ? -(a1 + 0.001) : a2 + 0.001; }
      continue;
    }
    if (c.maxY <= p.y + step || c.minY >= p.y + h) continue;
    const ox1 = p.x + r - c.minX, ox2 = c.maxX - (p.x - r);
    const oz1 = p.z + r - c.minZ, oz2 = c.maxZ - (p.z - r);
    if (ox1 <= 0 || ox2 <= 0 || oz1 <= 0 || oz2 <= 0) continue;
    const m = Math.min(ox1, ox2, oz1, oz2);
    if (m === ox1) p.x -= ox1 + 0.001; else if (m === ox2) p.x += ox2 + 0.001;
    else if (m === oz1) p.z -= oz1 + 0.001; else p.z += oz2 + 0.001;
  }
}

// Move an actor {pos, vel, onGround} with radius r and height h.
export function moveActor(a, dt, r, h) {
  if (!a.noGravity) a.vel.y -= GRAVITY * dt;
  if (a.vel.y < -55) a.vel.y = -55;
  const p = a.pos;
  const step = a.onGround ? 0.62 : 0.25;
  const px0 = p.x, pz0 = p.z;

  // horizontal, axis-separated
  for (let axis = 0; axis < 2; axis++) {
    const d = (axis === 0 ? a.vel.x : a.vel.z) * dt;
    if (d === 0) continue;
    if (axis === 0) p.x += d; else p.z += d;
    const list = queryBox(p.x - r, p.z - r, p.x + r, p.z + r);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.noBlock) continue;
      if (c.ramp) {
        // a ramp slab blocks where its surface is at body height (walk up it or under it, not through it)
        if (p.x + r <= c.minX || p.x - r >= c.maxX || p.z + r <= c.minZ || p.z - r >= c.maxZ) continue;
        const sh = rampHeightAt(c, Math.min(c.maxX, Math.max(c.minX, p.x)), Math.min(c.maxZ, Math.max(c.minZ, p.z)));
        if (sh <= p.y + step || sh - 0.25 >= p.y + h) continue;
        // already embedded before this step (a ramp was built on us)? let them walk out
        const ox = axis === 0 ? p.x - d : p.x, oz = axis === 1 ? p.z - d : p.z;
        if (!(ox + r <= c.minX || ox - r >= c.maxX || oz + r <= c.minZ || oz - r >= c.maxZ)) {
          const sh0 = rampHeightAt(c, Math.min(c.maxX, Math.max(c.minX, ox)), Math.min(c.maxZ, Math.max(c.minZ, oz)));
          if (sh0 > p.y + step && sh0 - 0.25 < p.y + h) continue;
        }
        if (axis === 0) p.x -= d; else p.z -= d; // refuse this axis step
        if (axis === 0) a.vel.x = 0; else a.vel.z = 0;
        a.bumped = true;
        continue;
      }
      if (c.maxY <= p.y + step || c.minY >= p.y + h) continue;
      if (p.x + r <= c.minX || p.x - r >= c.maxX || p.z + r <= c.minZ || p.z - r >= c.maxZ) continue;
      if (axis === 0) {
        p.x = d > 0 ? c.minX - r - 0.001 : c.maxX + r + 0.001;
        a.vel.x = 0;
      } else {
        p.z = d > 0 ? c.minZ - r - 0.001 : c.maxZ + r + 0.001;
        a.vel.z = 0;
      }
      a.bumped = true;
    }
  }

  // keep on the island (before depenetration so walls always win)
  const dist = Math.hypot(p.x, p.z);
  const lim = HALF - 4;
  if (dist > lim) { p.x *= lim / dist; p.z *= lim / dist; }

  // depenetrate: if something appeared inside us (fresh build, corner squeeze)
  depenetrate(a, r, h, step);



  // vertical
  const wasGround = a.onGround;
  const prevY = p.y;
  p.y += a.vel.y * dt;
  // ceiling
  if (a.vel.y > 0) {
    const list = queryBox(p.x - r * 0.7, p.z - r * 0.7, p.x + r * 0.7, p.z + r * 0.7);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.ramp || c.noBlock) continue;
      if (c.minY < p.y + h && c.minY > p.y + h - 0.6 && c.maxY > p.y + h) {
        p.y = c.minY - h; a.vel.y = 0;
      }
    }
  }
  // full footprint so feet never sink into low lips (house foundations, floor edges)
  // swept: any surface we passed through this tick counts (no tunnelling when falling fast)
  let g = groundHeight(p.x, p.z, Math.max(p.y, prevY), r * 0.95, step);
  // walking up a slope/ramp into a low ceiling: refuse the horizontal move
  if (g > prevY + 0.01) {
    const list = queryBox(p.x - r * 0.8, p.z - r * 0.8, p.x + r * 0.8, p.z + r * 0.8);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.ramp || c.noBlock || c.minY <= prevY + 0.5) continue;
      if (g + h > c.minY) { p.x = px0; p.z = pz0; a.vel.x = a.vel.z = 0; g = groundHeight(p.x, p.z, Math.max(p.y, prevY), r * 0.95, step); break; }
    }
  }
  a.groundY = g;
  // head inside a ceiling (low floor above, any cause): push down, or undo the step if there's no room
  {
    const list = queryBox(p.x - r * 0.95, p.z - r * 0.95, p.x + r * 0.95, p.z + r * 0.95);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.ramp || c.noBlock || c.minY <= p.y + 0.5 || c.minY >= p.y + h) continue;
      if (c.minY - h >= g - 0.01) { p.y = Math.min(p.y, c.minY - h - 0.001); if (a.vel.y > 0) a.vel.y = 0; }
      else { p.x = px0; p.z = pz0; a.vel.x = a.vel.z = 0; p.y = Math.min(p.y, Math.max(prevY, groundHeight(p.x, p.z, prevY, r * 0.95, step))); g = Math.min(g, p.y); }
      break;
    }
  }
  if (p.y <= g) {
    p.y = g; if (a.vel.y < 0) { a.landSpeed = -a.vel.y; a.vel.y = 0; }
    a.onGround = true;
  } else if (wasGround && a.vel.y <= 0 && p.y - g < 0.7) {
    p.y = g; a.vel.y = 0; a.onGround = true; // snap down slopes/ramps
  } else a.onGround = false;
  depenetrate(a, r, h, a.onGround ? 0.62 : 0.25); // last word: never end a tick inside geometry
}

// ---------------------------------------------------------------- raycasts
function rayBox(ox, oy, oz, ix, iy, iz, c, maxT) {
  let t1 = (c.minX - ox) * ix, t2 = (c.maxX - ox) * ix;
  let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
  t1 = (c.minY - oy) * iy; t2 = (c.maxY - oy) * iy;
  tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = (c.minZ - oz) * iz; t2 = (c.maxZ - oz) * iz;
  tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  if (tmax < Math.max(tmin, 0) || tmin > maxT) return -1;
  return tmin < 0 ? 0 : tmin;
}

function rayRamp(ox, oy, oz, dx, dy, dz, c, maxT) {
  // plane through the ramp surface
  const w = c.maxX - c.minX, hgt = c.maxY - c.minY;
  let nx = 0, ny = 0, nz = 0;
  switch (c.ramp.dir) {
    case 0: ny = w; nz = -hgt; break;
    case 1: ny = w; nx = -hgt; break;
    case 2: ny = w; nz = hgt; break;
    default: ny = w; nx = hgt; break;
  }
  const px = c.minX + w / 2, pz = (c.minZ + c.maxZ) / 2, py = c.minY + hgt / 2;
  const den = nx * dx + ny * dy + nz * dz;
  if (Math.abs(den) < 1e-6) return -1;
  const t = ((px - ox) * nx + (py - oy) * ny + (pz - oz) * nz) / den;
  if (t < 0 || t > maxT) return -1;
  const hx = ox + dx * t, hz = oz + dz * t;
  if (hx < c.minX || hx > c.maxX || hz < c.minZ || hz > c.maxZ) return -1;
  return t;
}

export function rayTerrain(ox, oy, oz, dx, dy, dz, maxT) {
  let prevT = 0;
  const stepLen = 1.5;
  for (let t = stepLen; t <= maxT + stepLen; t += stepLen) {
    const tt = Math.min(t, maxT);
    const y = oy + dy * tt;
    if (y < terrainHeight(ox + dx * tt, oz + dz * tt)) {
      let a = prevT, b = tt;
      for (let i = 0; i < 8; i++) {
        const m = (a + b) / 2;
        if (oy + dy * m < terrainHeight(ox + dx * m, oz + dz * m)) b = m; else a = m;
      }
      return b;
    }
    if (y > 60 && dy >= 0) return -1;
    prevT = tt;
    if (tt === maxT) break;
  }
  return -1;
}

// Ray vs world geometry. Returns {t, collider|null} or null. DDA over the grid.
const hitOut = { t: 0, collider: null };
export function rayWorld(ox, oy, oz, dx, dy, dz, maxT, ignore = null) {
  let best = maxT, bestC = null;
  const ix = 1 / (dx || 1e-9), iy = 1 / (dy || 1e-9), iz = 1 / (dz || 1e-9);
  stamp++;
  let cx = Math.floor(ox / GRID), cz = Math.floor(oz / GRID);
  const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  let tMaxX = dx !== 0 ? ((cx + (sx > 0 ? 1 : 0)) * GRID - ox) / dx : Infinity;
  let tMaxZ = dz !== 0 ? ((cz + (sz > 0 ? 1 : 0)) * GRID - oz) / dz : Infinity;
  const tdX = dx !== 0 ? GRID / Math.abs(dx) : Infinity;
  const tdZ = dz !== 0 ? GRID / Math.abs(dz) : Infinity;
  let tCell = 0;
  for (let guard = 0; guard < 200 && tCell <= best; guard++) {
    const arr = cells.get(key(cx, cz));
    if (arr) {
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        if (c._s === stamp || c === ignore || c.noRay) continue;
        c._s = stamp;
        const t = c.ramp ? rayRamp(ox, oy, oz, dx, dy, dz, c, best) : rayBox(ox, oy, oz, ix, iy, iz, c, best);
        if (t >= 0 && t < best) { best = t; bestC = c; }
      }
    }
    if (tMaxX < tMaxZ) { tCell = tMaxX; tMaxX += tdX; cx += sx; }
    else { tCell = tMaxZ; tMaxZ += tdZ; cz += sz; }
  }
  const tt = rayTerrain(ox, oy, oz, dx, dy, dz, best);
  if (tt >= 0 && tt < best) { best = tt; bestC = null; hitOut.t = best; hitOut.collider = null; hitOut.terrain = true; return hitOut; }
  if (bestC) { hitOut.t = best; hitOut.collider = bestC; hitOut.terrain = false; return hitOut; }
  return null;
}

// ray vs sphere, returns t or -1
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return -1;
  const thc = Math.sqrt(r * r - d2);
  const t = tca - thc;
  return t >= 0 ? t : (tca + thc >= 0 ? 0 : -1);
}

// ray vs vertical capsule-ish box
export function rayActorBody(ox, oy, oz, dx, dy, dz, a, maxT) {
  const c = { minX: a.pos.x - 0.42, maxX: a.pos.x + 0.42, minY: a.pos.y, maxY: a.pos.y + 1.45, minZ: a.pos.z - 0.42, maxZ: a.pos.z + 0.42 };
  return rayBox(ox, oy, oz, 1 / (dx || 1e-9), 1 / (dy || 1e-9), 1 / (dz || 1e-9), c, maxT);
}
