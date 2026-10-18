import * as THREE from 'three';
import { HALF, WORLD_SIZE } from './config.js';

// Deterministic value noise — the analytic height function is the single source
// of truth for physics; the mesh is just a picture of it.
function hash2(ix, iz) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + 1442695040) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
const smooth = (t) => t * t * (3 - 2 * t);
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz;
}
function fbm(x, z) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < 4; i++) {
    sum += amp * vnoise(x * freq, z * freq);
    norm += amp; amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}

// flattened pads where towns sit, so houses don't float
let flatPads = [];
export function setFlatPads(p) { flatPads = p; }

function rawHeight(x, z) {
  const d = Math.sqrt(x * x + z * z) / HALF;
  const falloff = Math.min(1, Math.max(0, 1 - Math.pow(d, 3.2)));
  const n = fbm(x * 0.008 + 50, z * 0.008 + 50);
  const ridge = Math.pow(Math.abs(fbm(x * 0.02 + 9, z * 0.02 - 3) - 0.5) * 2, 2);
  return (2.5 + Math.pow(n, 1.4) * 30 + ridge * 4) * falloff - 1.5;
}

export function terrainHeight(x, z) {
  let h = rawHeight(x, z);
  for (let i = 0; i < flatPads.length; i++) {
    const p = flatPads[i];
    const dx = x - p.x, dz = z - p.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < p.r + 14) {
      const t = d <= p.r ? 1 : 1 - smooth((d - p.r) / 14);
      h = h + (p.y - h) * t;
    }
  }
  return h;
}

export function terrainNormal(x, z, out = new THREE.Vector3()) {
  const e = 0.8;
  const hx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
  const hz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
  return out.set(-hx, 2 * e, -hz).normalize();
}

export function padHeight(x, z) { return rawHeight(x, z); }

// Splat material: Lambert lighting/shadows/fog kept, map sampling replaced with
// a height/slope blend of three generated textures.
export function makeTerrainMaterial(tex) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tGrass = { value: tex.grass };
    shader.uniforms.tSand = { value: tex.sand };
    shader.uniforms.tRock = { value: tex.rock };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tGrass;\nuniform sampler2D tSand;\nuniform sampler2D tRock;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <map_fragment>', `
        vec2 uv1 = vWPos.xz * 0.11;
        vec2 uv2 = vWPos.xz * 0.023;
        vec3 g = mix(texture2D(tGrass, uv1).rgb, texture2D(tGrass, uv2).rgb, 0.45);
        vec3 s = texture2D(tSand, uv1 * 0.8).rgb;
        vec3 rk = mix(texture2D(tRock, uv1 * 0.7).rgb, texture2D(tRock, uv2).rgb, 0.3);
        float sandW = 1.0 - smoothstep(1.2, 2.6, vWPos.y);
        float rockW = smoothstep(0.78, 0.62, vWNrm.y);
        vec3 col = mix(g, s, sandW);
        col = mix(col, rk, rockW);
        col *= 0.92 + 0.16 * smoothstep(8.0, 26.0, vWPos.y);
        diffuseColor.rgb *= col;
      `);
  };
  return mat;
}

export function buildTerrainMesh(tex, segments = 200) {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE + 80, WORLD_SIZE + 80, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, makeTerrainMaterial(tex));
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// Top-down picture of the island for the minimap / big map.
export function renderMapImage(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = (px / size - 0.5) * WORLD_SIZE;
      const z = (py / size - 0.5) * WORLD_SIZE;
      const h = terrainHeight(x, z);
      let r, g, b;
      if (h < -0.2) { const t = Math.max(0, Math.min(1, -h / 2)); r = 60 - 20 * t; g = 160 - 40 * t; b = 215 - 20 * t; }
      else if (h < 2.2) { r = 236; g = 214; b = 150; }
      else {
        const t = Math.min(1, h / 30);
        r = 92 + 50 * t; g = 168 - 10 * t; b = 70 + 40 * t;
        const n = terrainNormal(x, z);
        if (n.y < 0.72) { r = 140; g = 136; b = 128; }
        const shade = 0.82 + 0.3 * (n.x * -0.5 + n.z * -0.5 + 0.5);
        r *= shade; g *= shade; b *= shade;
      }
      const i = (py * size + px) * 4;
      img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
