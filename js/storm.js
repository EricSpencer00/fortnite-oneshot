// Storm circle + battle bus.
import * as THREE from 'three';
import { STORM_PHASES, HALF } from './config.js';
import { terrainHeight } from './terrain.js';
import { G } from './state.js';

let wall = null;

export function initStormVisual(scene) {
  const geo = new THREE.CylinderGeometry(1, 1, 260, 96, 1, true);
  geo.translate(0, 100, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() } },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float uTime; uniform vec3 uCam; varying vec2 vUv; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){
        float a = atan(vW.z, vW.x);
        vec2 p = vec2(a*40.0, vW.y*0.08 - uTime*0.6);
        float c = n(p) * 0.6 + n(p*2.3 + uTime*0.2) * 0.4;
        float bolt = smoothstep(0.97, 1.0, n(vec2(a*90.0, uTime*3.0)));
        vec3 col = mix(vec3(0.35,0.1,0.65), vec3(0.75,0.4,1.0), c) + bolt*vec3(0.8,0.7,1.0);
        float dist = length(vW.xz - uCam.xz);
        float alpha = (0.38 + c*0.25) * mix(1.0, 0.12, smoothstep(40.0, 320.0, dist));
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  wall = new THREE.Mesh(geo, mat);
  wall.renderOrder = 3;
  wall.frustumCulled = false;
  scene.add(wall);
}

export function newStorm() {
  const s = {
    phase: 0, state: 'wait', timer: STORM_PHASES[0].wait,
    cx: 0, cz: 0, r: HALF * 1.6,
    fromX: 0, fromZ: 0, fromR: HALF * 1.6,
    toX: 0, toZ: 0, toR: STORM_PHASES[0].radius,
    dps: 1, done: false,
  };
  pickNext(s);
  return s;
}

function pickNext(s) {
  const target = STORM_PHASES[s.phase].radius;
  for (let i = 0; i < 40; i++) {
    const maxOff = Math.max(0, s.r - target) * 0.85;
    const a = Math.random() * Math.PI * 2, d = Math.random() * maxOff;
    const x = s.cx + Math.cos(a) * d, z = s.cz + Math.sin(a) * d;
    if (Math.hypot(x, z) > HALF * 0.8 - target * 0.5) continue;
    if (terrainHeight(x, z) < 1.5) continue;
    s.toX = x; s.toZ = z; s.toR = target; return;
  }
  s.toX = s.cx; s.toZ = s.cz; s.toR = target;
}

export function updateStorm(s, dt) {
  if (s.done) return;
  s.timer -= dt;
  const p = STORM_PHASES[s.phase];
  if (s.state === 'wait') {
    if (s.timer <= 0) {
      s.state = 'shrink'; s.timer = p.shrink;
      s.fromX = s.cx; s.fromZ = s.cz; s.fromR = s.r;
      if (G.onStormEvent) G.onStormEvent('shrink');
    }
  } else {
    const t = 1 - Math.max(0, s.timer) / p.shrink;
    s.cx = s.fromX + (s.toX - s.fromX) * t;
    s.cz = s.fromZ + (s.toZ - s.fromZ) * t;
    s.r = s.fromR + (s.toR - s.fromR) * t;
    s.dps = p.dps;
    if (s.timer <= 0) {
      s.phase++;
      if (s.phase >= STORM_PHASES.length) { s.done = true; s.r = Math.max(0, s.toR); return; }
      s.state = 'wait'; s.timer = STORM_PHASES[s.phase].wait;
      pickNext(s);
      if (G.onStormEvent) G.onStormEvent('wait');
    }
  }
}

export function inStorm(s, x, z) { return Math.hypot(x - s.cx, z - s.cz) > s.r; }
export function inNextCircle(s, x, z, margin = 0) { return Math.hypot(x - s.toX, z - s.toZ) < s.toR - margin; }

export function syncStormVisual(s, time) {
  wall.position.set(s.cx, -40, s.cz);
  const r = Math.max(0.5, s.r);
  wall.scale.set(r, 1, r);
  wall.material.uniforms.uTime.value = time;
  wall.material.uniforms.uCam.value.copy(G.camera.position);
}

// ---------------------------------------------------------------- battle bus
export function makeBusMesh(scene, mats) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3, 9), new THREE.MeshLambertMaterial({ color: 0x2f7de1 }));
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.45, 0.5, 9.05), new THREE.MeshLambertMaterial({ color: 0xffd23f }));
  stripe.position.y = -0.4;
  const win = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.9, 7), mats.glass);
  win.position.set(0, 0.6, 0.3);
  const balloon = new THREE.Mesh(new THREE.SphereGeometry(5.5, 20, 14), new THREE.MeshLambertMaterial({ color: 0xff5d8f }));
  balloon.scale.y = 1.15; balloon.position.y = 10;
  const ropeGeo = new THREE.CylinderGeometry(0.05, 0.05, 6, 4);
  for (const [x, z] of [[1.5, 3.5], [-1.5, 3.5], [1.5, -3.5], [-1.5, -3.5]]) {
    const r = new THREE.Mesh(ropeGeo, mats.tire); r.position.set(x * 0.8, 4.5, z * 0.6); g.add(r);
  }
  g.add(body, stripe, win, balloon);
  g.visible = false;
  scene.add(g);
  return g;
}

export function newBusPath() {
  const a = Math.random() * Math.PI * 2;
  const off = (Math.random() - 0.5) * 120;
  const nx = -Math.sin(a), nz = Math.cos(a);
  const L = HALF * 1.05;
  const sx = Math.cos(a) * -L + nx * off, sz = Math.sin(a) * -L + nz * off;
  const ex = Math.cos(a) * L + nx * off, ez = Math.sin(a) * L + nz * off;
  return { sx, sz, ex, ez, y: 115, t: 0, dur: Math.hypot(ex - sx, ez - sz) / 32, yaw: Math.atan2(ex - sx, ez - sz) };
}

export function busPos(bus, t, out) {
  const k = Math.min(1, t / bus.dur);
  return out.set(bus.sx + (bus.ex - bus.sx) * k, bus.y, bus.sz + (bus.ez - bus.sz) * k);
}
