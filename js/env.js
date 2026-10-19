// Environment shaders: wind-blown grass around the player, stylized water with
// shoreline foam, swaying foliage. All GPU-side; zero per-frame CPU work besides
// a few uniforms.
import * as THREE from 'three';
import { HF } from './terrain.js';

const U = {
  uTime: { value: 0 },
  uCenter: { value: new THREE.Vector2() },
  uHF: { value: null },
  uExtent: { value: 560 },
  uSunDir: { value: new THREE.Vector3(0.45, 0.8, 0.35).normalize() },
};

// colours below are authored in sRGB; convert to linear before fog + output transform
const FOG_CHUNK = `
  col = pow(col, vec3(2.2));
  #ifdef USE_FOG
    float fogDepth = length(vView);
    float fogF = smoothstep(fogNear, fogFar, fogDepth);
    col = mix(col, fogColor, fogF);
  #endif`;

// ---------------------------------------------------------------- grass
let grass = null;
const blockRects = Array.from({ length: 16 }, () => new THREE.Vector4(1e9, 1e9, -1e9, -1e9));
const blockY = new Array(16).fill(-1e9);
// tell the grass which ground-level build pieces to stay out of (nearest 16)
export function setGrassBlockers(builds, center) {
  const near = [];
  for (const b of builds) {
    if (b.type === 'wall') continue;
    const c = b.collider; const dx = (c.minX + c.maxX) / 2 - center.x, dz = (c.minZ + c.maxZ) / 2 - center.z;
    const d = dx * dx + dz * dz;
    if (d < 45 * 45) near.push([d, c]);
  }
  near.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < 16; i++) {
    const c = near[i] && near[i][1];
    if (c) { blockRects[i].set(c.minX, c.minZ, c.maxX, c.maxZ); blockY[i] = c.minY; }
    else { blockRects[i].set(1e9, 1e9, -1e9, -1e9); blockY[i] = -1e9; }
  }
}
export function makeGrass(scene, quality) {
  if (quality === 'low') return null;
  const spacing = quality === 'high' ? 0.55 : 0.75;
  const radius = quality === 'high' ? 34 : 26;
  const n = Math.ceil((radius * 2) / spacing);
  // one clump = 3 crossed tapered blades
  const P = [], H = [];
  for (let b = 0; b < 3; b++) {
    const a = (b / 3) * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
    const w = 0.07;
    const seg = [[-w, 0], [w, 0], [-w * 0.6, 0.5], [w * 0.6, 0.5], [0, 1]];
    const tri = [0, 1, 2, 1, 3, 2, 2, 3, 4];
    for (const t of tri) { const [x, y] = seg[t]; P.push(x * ca, y, x * sa); H.push(y); }
  }
  const blade = new THREE.InstancedBufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  blade.setAttribute('hgt', new THREE.Float32BufferAttribute(H, 1));
  const offs = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i - n / 2) * spacing, z = (j - n / 2) * spacing;
    if (x * x + z * z < radius * radius) offs.push(i - n / 2, j - n / 2);
  }
  blade.setAttribute('cell', new THREE.InstancedBufferAttribute(new Float32Array(offs), 2));
  blade.instanceCount = offs.length / 2;

  const mat = new THREE.ShaderMaterial({
    fog: true, side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uSpacing: { value: spacing }, uRadius: { value: radius } }]),
    vertexShader: `
      uniform float uTime, uSpacing, uRadius, uExtent; uniform vec2 uCenter; uniform sampler2D uHF;
      uniform vec4 uBlock[16]; uniform float uBlockY[16];
      attribute vec2 cell; attribute float hgt;
      varying float vH; varying vec3 vView; varying float vTint;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        vec2 c = floor(uCenter / uSpacing) + cell;           // stable world cell
        float r1 = hash(c), r2 = hash(c + 17.3), r3 = hash(c + 41.9);
        vec2 wxz = (c + vec2(r1, r2)) * uSpacing;
        vec2 uv = wxz / uExtent + 0.5;
        vec4 hf = texture2D(uHF, uv);
        float d = distance(wxz, uCenter);
        float s = hf.g * (0.75 + r3 * 0.6) * (1.0 - smoothstep(uRadius * 0.7, uRadius, d));
        // no blades poking through build floors/ramps resting on the ground
        for (int i = 0; i < 16; i++) {
          vec4 b = uBlock[i];
          if (wxz.x > b.x && wxz.x < b.z && wxz.y > b.y && wxz.y < b.w && hf.r < uBlockY[i] + 0.5) s = 0.0;
        }
        float ang = r1 * 6.2831;
        vec3 p = position;
        p = vec3(p.x * cos(ang) - p.z * sin(ang), p.y, p.x * sin(ang) + p.z * cos(ang));
        p *= vec3(1.25, 0.42 + r2 * 0.38, 1.25) * s;
        // wind: big rolling gusts + small flutter, stronger at the tip
        float gust = sin(wxz.x * 0.08 + uTime * 1.3) * 0.5 + sin(wxz.y * 0.11 + uTime * 0.9) * 0.5;
        float flutter = sin(uTime * 4.0 + r3 * 20.0) * 0.12;
        p.x += (gust * 0.28 + flutter) * hgt * hgt * s;
        p.z += (gust * 0.12) * hgt * hgt * s;
        vec4 world = vec4(wxz.x + p.x, hf.r + p.y - 0.03, wxz.y + p.z, 1.0);
        vec4 mv = viewMatrix * world;
        vView = mv.xyz;
        vH = hgt; vTint = r3 + gust * 0.15;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 fogColor; uniform float fogNear, fogFar;
      varying float vH; varying vec3 vView; varying float vTint;
      void main(){
        vec3 base = mix(vec3(0.24, 0.55, 0.10), vec3(0.34, 0.68, 0.14), vTint);
        vec3 tip = mix(vec3(0.52, 0.80, 0.22), vec3(0.66, 0.88, 0.30), vTint);
        vec3 col = mix(base, tip, vH);
        ${FOG_CHUNK}
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  mat.uniforms.uTime = U.uTime; mat.uniforms.uCenter = U.uCenter; mat.uniforms.uHF = U.uHF; mat.uniforms.uExtent = U.uExtent;
  mat.uniforms.uBlock = { value: blockRects }; mat.uniforms.uBlockY = { value: blockY };
  grass = new THREE.Mesh(blade, mat);
  grass.frustumCulled = false;
  scene.add(grass);
  return grass;
}

// ---------------------------------------------------------------- water
export function makeWater(scene) {
  const geo = new THREE.PlaneGeometry(5000, 5000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    fog: true, transparent: true, depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    vertexShader: `
      varying vec3 vW; varying vec3 vView;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vView = mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      uniform float uTime, uExtent; uniform sampler2D uHF; uniform vec3 uSunDir;
      uniform vec3 fogColor; uniform float fogNear, fogFar;
      varying vec3 vW; varying vec3 vView;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 uv = vW.xz / uExtent + 0.5;
        float ground = (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) ? texture2D(uHF, uv).r : -12.0;
        float depth = max(0.0, -ground);
        // animated ripple normal
        vec2 q = vW.xz * 0.12;
        float w1 = n(q + vec2(uTime * 0.35, uTime * 0.2));
        float w2 = n(q * 2.3 - vec2(uTime * 0.25, -uTime * 0.3));
        vec3 nrm = normalize(vec3((w1 - 0.5) * 0.6 + (w2 - 0.5) * 0.3, 1.0, (w2 - 0.5) * 0.6 - (w1 - 0.5) * 0.3));
        vec3 shallow = vec3(0.30, 0.86, 0.85), deep = vec3(0.05, 0.38, 0.72);
        vec3 col = mix(shallow, deep, smoothstep(0.2, 6.0, depth));
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(V, nrm), 0.0), 3.0);
        col = mix(col, vec3(0.75, 0.9, 1.0), fres * 0.5);
        vec3 R = reflect(-uSunDir, nrm);
        col += vec3(1.0, 0.95, 0.8) * pow(max(dot(R, V), 0.0), 120.0) * 1.3;
        // shoreline foam bands that lap in and out
        float band = sin(depth * 6.0 - uTime * 2.2 + n(vW.xz * 0.3) * 4.0);
        float foam = (1.0 - smoothstep(0.0, 0.9, depth)) * smoothstep(0.3, 0.9, band + n(vW.xz * 0.8) * 0.6);
        foam = max(foam, 1.0 - smoothstep(0.0, 0.18, depth));
        col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.85);
        float alpha = mix(0.55, 0.92, smoothstep(0.0, 3.0, depth));
        alpha = max(alpha, foam);
        ${FOG_CHUNK}
        gl_FragColor = vec4(col, alpha);
        #include <colorspace_fragment>
      }`,
  });
  mat.uniforms.uTime = U.uTime; mat.uniforms.uHF = U.uHF; mat.uniforms.uExtent = U.uExtent; mat.uniforms.uSunDir = U.uSunDir;
  const water = new THREE.Mesh(geo, mat);
  water.renderOrder = 1;
  scene.add(water);
  return water;
}

// ---------------------------------------------------------------- foliage sway
export function addSway(material, amount = 0.12, pivotY = 0) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = U.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 ip = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
        #else
          vec2 ip = vec2(0.0);
        #endif
        float sw = max(0.0, position.y - (${pivotY.toFixed(2)}));
        transformed.x += sin(uTime * 1.4 + ip.x * 0.25 + ip.y * 0.1) * ${amount.toFixed(3)} * sw;
        transformed.z += cos(uTime * 1.1 + ip.y * 0.25) * ${(amount * 0.6).toFixed(3)} * sw;`);
  };
}

export function initEnv(sunDir) {
  U.uHF.value = HF.texture;
  U.uExtent.value = HF.extent;
  if (sunDir) U.uSunDir.value.copy(sunDir).normalize();
}

export function updateEnv(time, center) {
  U.uTime.value = time;
  U.uCenter.value.set(center.x, center.z);
}
