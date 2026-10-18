// World-space geometry builders with world-scaled UVs so textures tile at a
// constant density no matter the box size — and can be merged into one draw.
import * as THREE from 'three';

export class GeoBatch {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.idx = []; this.col = null; }
  quad(a, b, c, d, n, uvs) {
    const base = this.pos.length / 3;
    for (const v of [a, b, c, d]) this.pos.push(v[0], v[1], v[2]);
    for (let i = 0; i < 4; i++) this.nrm.push(n[0], n[1], n[2]);
    for (const u of uvs) this.uv.push(u[0], u[1]);
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  tri(a, b, c, n, uvs) {
    const base = this.pos.length / 3;
    for (const v of [a, b, c]) this.pos.push(v[0], v[1], v[2]);
    for (let i = 0; i < 3; i++) this.nrm.push(n[0], n[1], n[2]);
    for (const u of uvs) this.uv.push(u[0], u[1]);
    this.idx.push(base, base + 1, base + 2);
  }
  // axis-aligned box, s = texture repeat per metre
  box(x0, y0, z0, x1, y1, z1, s = 0.25, faces = 63) {
    if (faces & 1) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [[z1 * s, y0 * s], [z0 * s, y0 * s], [z0 * s, y1 * s], [z1 * s, y1 * s]]);
    if (faces & 2) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [[z0 * s, y0 * s], [z1 * s, y0 * s], [z1 * s, y1 * s], [z0 * s, y1 * s]]);
    if (faces & 4) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[x0 * s, z1 * s], [x1 * s, z1 * s], [x1 * s, z0 * s], [x0 * s, z0 * s]]);
    if (faces & 8) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[x0 * s, z0 * s], [x1 * s, z0 * s], [x1 * s, z1 * s], [x0 * s, z1 * s]]);
    if (faces & 16) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [[x0 * s, y0 * s], [x1 * s, y0 * s], [x1 * s, y1 * s], [x0 * s, y1 * s]]);
    if (faces & 32) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [[x1 * s, y0 * s], [x0 * s, y0 * s], [x0 * s, y1 * s], [x1 * s, y1 * s]]);
  }
  // gable roof spanning x0..x1 (ridge along z when alongZ)
  gable(x0, z0, x1, z1, y, rise, s = 0.25, over = 0.6) {
    x0 -= over; z0 -= over; x1 += over; z1 += over;
    const mx = (x0 + x1) / 2, top = y + rise;
    const half = (x1 - x0) / 2, slope = Math.hypot(half, rise);
    const nL = [-rise / slope, half / slope, 0], nR = [rise / slope, half / slope, 0];
    const L = slope * s;
    this.quad([x0, y, z1], [mx, top, z1], [mx, top, z0], [x0, y, z0], nL, [[z1 * s, 0], [z1 * s, L], [z0 * s, L], [z0 * s, 0]]);
    this.quad([mx, top, z1], [x1, y, z1], [x1, y, z0], [mx, top, z0], nR, [[z1 * s, L], [z1 * s, 0], [z0 * s, 0], [z0 * s, L]]);
    // underside
    this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }
  gableEnds(x0, z0, x1, z1, y, rise, s = 0.25) {
    const mx = (x0 + x1) / 2, top = y + rise;
    this.tri([x0, y, z1], [x1, y, z1], [mx, top, z1], [0, 0, 1], [[x0 * s, y * s], [x1 * s, y * s], [mx * s, top * s]]);
    this.tri([x1, y, z0], [x0, y, z0], [mx, top, z0], [0, 0, -1], [[x1 * s, y * s], [x0 * s, y * s], [mx * s, top * s]]);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
