import * as THREE from 'three';
import { BOT_COUNT, BOT_NAMES, PLAYER, WEAPONS, MATS, HALF } from './config.js';
import { G } from './state.js';
import { buildTerrainMesh, renderMapImage, terrainHeight } from './terrain.js';
import { buildWorld, restoreNodes } from './world.js';
import { moveActor, rayWorld } from './physics.js';
import { Actor } from './actor.js';
import { Bot } from './bot.js';
import { SKINS } from './character.js';
import { fireWeapon } from './combat.js';
import { initFx, updateFx, clearFx } from './fx.js';
import { initAudio, sfx, setVolume } from './audio.js';
import { computePlacement, canPlace, placeBuild, showGhost, updateBuilds, clearBuilds } from './build.js';
import { initStormVisual, newStorm, updateStorm, inStorm, syncStormVisual, makeBusMesh, newBusPath, busPos } from './storm.js';
import { seedFloorLoot, seedChests, updateLoot, updateChests, nearestLoot, nearestChest, openChest, removeLoot, spawnLoot, clearLoot, dropInventory } from './loot.js';
import { initHud, updateHud, centerMsg, elimMsg, feed, clearFeed, hitMarker, hurtFlash, damageNumber, showBigMap, lootPrompt, showHud } from './hud.js';

const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ settings
try { Object.assign(G.settings, JSON.parse(localStorage.getItem('osr-settings') || '{}')); } catch (e) { /* private mode */ }
function saveSettings() { try { localStorage.setItem('osr-settings', JSON.stringify(G.settings)); } catch (e) { /* ignore */ } }

// ------------------------------------------------------------------ renderer
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
G.renderer = renderer;
const scene = new THREE.Scene();
G.scene = scene;
const camera = new THREE.PerspectiveCamera(G.settings.fov, innerWidth / innerHeight, 0.1, 2500);
G.camera = camera;
const FOG = 0xbcdcf2;
scene.fog = new THREE.Fog(FOG, 140, 520);
scene.background = new THREE.Color(0x8cc8f0);

const hemi = new THREE.HemisphereLight(0xd8efff, 0x5d7a45, 1.55);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d2, 2.3);
sun.position.set(60, 120, 40);
sun.shadow.camera.left = -70; sun.shadow.camera.right = 70; sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 320;
sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);

let dpr = 1, quality = 'medium';
function applyQuality() {
  const q = G.settings.quality;
  const dev = Math.min(window.devicePixelRatio || 1, 2);
  quality = q === 'auto' ? (dev > 1.5 && innerWidth * innerHeight > 2e6 ? 'medium' : 'high') : q;
  dpr = quality === 'low' ? Math.min(dev, 0.75) : quality === 'medium' ? Math.min(dev, 1) : Math.min(dev, 1.5);
  renderer.setPixelRatio(dpr);
  const sh = quality !== 'low';
  renderer.shadowMap.enabled = sh; sun.castShadow = sh;
  const ms = quality === 'high' ? 2048 : 1024;
  if (sun.shadow.mapSize.x !== ms) { sun.shadow.mapSize.set(ms, ms); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  scene.traverse((o) => { if (o.material) { const ms2 = Array.isArray(o.material) ? o.material : [o.material]; ms2.forEach((m) => { m.needsUpdate = true; }); } });
}
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

// ------------------------------------------------------------------ assets
const loader = new THREE.TextureLoader();
const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
function fallbackTex(color) {
  const c = document.createElement('canvas'); c.width = c.height = 4;
  const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, 4, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function loadTex(name, fallback, repeat = true) {
  return new Promise((res) => {
    loader.load(`assets/${name}.jpg`, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; }
      res(t);
    }, undefined, () => { const t = fallbackTex(fallback); if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; res(t); });
  });
}

async function loadAssets() {
  const names = { grass: '#5cb83a', sand: '#e8d49a', rock: '#8a8a8a', wood: '#a0703c', brick: '#b5523b', metal: '#b8c2cc', roof: '#b4553a', leaves: '#3f9a35', bark: '#6b4423', chest: '#c48a2c', dirt: '#8b6a45' };
  const tex = {};
  await Promise.all(Object.entries(names).map(async ([k, c]) => { tex[k] = await loadTex(k, c); }));
  const sky = await loadTex('sky', '#8cc8f0', false);
  if (sky.image && sky.image.width > 8) {
    sky.mapping = THREE.EquirectangularReflectionMapping;
    scene.background = sky;
    // match fog to the sky just below the horizon so distant water melts into it
    try {
      const c = document.createElement('canvas'); c.width = 64; c.height = 32;
      const x = c.getContext('2d'); x.drawImage(sky.image, 0, 0, 64, 32);
      const d = x.getImageData(0, 17, 64, 2).data;
      let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4;
      scene.fog.color.setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace);
    } catch (e) { /* keep default fog */ }
  }
  return tex;
}

function makeMats(tex) {
  const L = (o) => new THREE.MeshLambertMaterial(o);
  return {
    brick: L({ map: tex.brick }), wood: L({ map: tex.wood }), roof: L({ map: tex.roof }),
    floor: L({ map: tex.wood, color: 0xc9a27a }), trim: L({ color: 0xf2efe6 }),
    bark: L({ map: tex.bark }), leaves: L({ map: tex.leaves, flatShading: true }), rock: L({ map: tex.rock, flatShading: true }),
    bush: L({ map: tex.leaves, color: 0xb8e09a, flatShading: true }),
    glass: L({ color: 0x9fd6ff, transparent: true, opacity: 0.6 }), tire: L({ color: 0x222222 }),
    build_wood: L({ map: tex.wood }), build_stone: L({ map: tex.brick, color: 0xd8d8d8 }), build_metal: L({ map: tex.metal }),
  };
}

// ------------------------------------------------------------------ input
function lockPointer() { try { const r = canvas.requestPointerLock?.(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* not allowed here */ } }
const keys = new Set();
const mouse = { l: false, r: false, dx: 0, dy: 0, lPressed: false, wheel: 0 };
let locked = false;
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  onKey(e.code);
  if (['Space', 'Tab', 'KeyQ'].includes(e.code) && G.phase !== 'menu') e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouse.l = mouse.r = false; });
canvas.addEventListener('mousedown', (e) => {
  if (G.phase === 'menu' || G.phase === 'end') return;
  if (!locked) { lockPointer(); return; }
  if (e.button === 0) { mouse.l = true; mouse.lPressed = true; }
  if (e.button === 2) mouse.r = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => { if (locked) { mouse.dx += e.movementX; mouse.dy += e.movementY; } });
addEventListener('wheel', (e) => { if (locked) mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (!locked && (G.phase === 'play' || G.phase === 'bus')) pause(true);
});

// ------------------------------------------------------------------ player view state
const view = { building: null, prompt: null, progress: null, spread: 0, scoped: false, inStorm: false, camYaw: 0, hideCross: false };
const cam = { yaw: 0, pitch: -0.1, dist: 4, fov: G.settings.fov, shake: 0 };
let bloom = 0, lastPlaced = '', mapOpen = false;

function onKey(code) {
  if (code === 'Escape' && G.phase === 'paused') { /* browser handles unlock */ }
  if (G.phase !== 'play' && G.phase !== 'bus') return;
  const p = G.player;
  if (code === 'KeyM' || code === 'Tab') { mapOpen = !mapOpen; showBigMap(mapOpen); return; }
  if (!p.alive) return;
  if (code === 'Space' && G.phase === 'bus' && p.mode === 'bus') { jumpFromBus(p); return; }
  if (code.startsWith('Digit')) {
    const n = +code.slice(5);
    if (n >= 1 && n <= 6) { view.building = null; p.equip(n === 1 ? -1 : n - 2); sfx.click(); }
  }
  if (code === 'KeyQ') toggleBuild('wall');
  if (code === 'KeyX') toggleBuild('floor');
  if (code === 'KeyC') toggleBuild('ramp');
  if (code === 'KeyG') { p.matSel = (p.matSel + 1) % 3; sfx.click(); }
  if (code === 'KeyR') { if (p.startReload()) sfx.reload(); }
  if (code === 'KeyE') interact(p);
}
function toggleBuild(piece) {
  if (G.player.mode !== 'ground') return;
  view.building = view.building === piece ? null : piece;
  lastPlaced = '';
  sfx.click();
}

function interact(p) {
  const c = nearestChest(p.pos, 2.8);
  if (c) { openChest(c, p); sfx.chest(); return; }
  const l = nearestLoot(p.pos, 2.6, (l) => l.settled);
  if (!l) return;
  pickup(p, l);
}
function pickup(p, l) {
  const it = l.item;
  if (p.give(it)) { removeLoot(l); sfx.pickup(); if (p.active < 0 && it.kind === 'weapon' && !view.building) { const i = p.slots.findIndex((s) => s && s.type === it.type && s.rarity === it.rarity); if (i >= 0) p.equip(i); } return; }
  // full: swap with the active slot (or slot 0 if holding pickaxe)
  const idx = p.active >= 0 ? p.active : 0;
  const old = p.slots[idx];
  p.slots[idx] = { ...it };
  removeLoot(l);
  if (old) spawnLoot(old, p.pos.x, p.pos.y + 0.5, p.pos.z, true);
  p.equip(-2); p.equip(idx);
  sfx.pickup();
}

function jumpFromBus(p) {
  p.mode = 'sky';
  const b = G.bus;
  busPos(b, b.t, p.pos); p.pos.y -= 4;
  p.vel.set(Math.sin(b.yaw) * 10, 0, Math.cos(b.yaw) * 10);
  p.noGravity = true;
  G.phase = 'play';
  centerMsg('Dive! Look down to fall faster', 2.5);
}

// ------------------------------------------------------------------ player update
const fwd = new THREE.Vector3(), rightV = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const camFwd = new THREE.Vector3(), pivot = new THREE.Vector3(), muzzle = new THREE.Vector3();

function updatePlayer(dt) {
  const p = G.player;
  const sens = 0.0022 * G.settings.sens * (mouse.r && p.weapon && !p.weapon.melee ? p.weapon.zoom ** 0.6 : 1);
  cam.yaw -= mouse.dx * sens; cam.pitch -= mouse.dy * sens;
  mouse.dx = mouse.dy = 0;
  cam.pitch = Math.max(-1.45, Math.min(1.45, cam.pitch));
  if (mouse.wheel && p.alive && p.mode === 'ground') {
    const order = [-1, 0, 1, 2, 3, 4];
    let i = order.indexOf(p.active);
    i = (i + (mouse.wheel > 0 ? 1 : -1) + 6) % 6;
    view.building = null; p.equip(order[i]);
  }
  mouse.wheel = 0;
  view.prompt = null; view.progress = null;
  if (!p.alive) return;
  p.tickTimers(dt);

  fwd.set(Math.sin(cam.yaw), 0, Math.cos(cam.yaw));
  rightV.set(-Math.cos(cam.yaw), 0, Math.sin(cam.yaw));
  const ix = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const iz = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  tmp.set(0, 0, 0).addScaledVector(fwd, iz).addScaledVector(rightV, ix);
  if (tmp.lengthSq() > 0) tmp.normalize();

  if (p.mode === 'bus') {
    busPos(G.bus, G.bus.t, p.pos);
    p.yaw = cam.yaw;
    return;
  }
  if (p.mode === 'sky' || p.mode === 'glide') {
    const gy = terrainHeight(p.pos.x, p.pos.z);
    const above = p.pos.y - gy;
    if (p.mode === 'sky' && (above < 34 || (keys.has('Space') && above < 100 && p.skyT > 0.6))) { p.mode = 'glide'; sfx.click(); }
    p.skyT = (p.skyT || 0) + dt;
    const hs = p.mode === 'sky' ? 20 : 15;
    p.vel.x += (tmp.x * hs - p.vel.x) * Math.min(1, dt * 2.5);
    p.vel.z += (tmp.z * hs - p.vel.z) * Math.min(1, dt * 2.5);
    const vy = p.mode === 'sky' ? -(30 + Math.max(0, -cam.pitch) * 22) : -7.5;
    p.vel.y += (vy - p.vel.y) * Math.min(1, dt * 3);
    p.noGravity = true;
    p.yaw = cam.yaw; p.pitch = 0;
    moveActor(p, dt, PLAYER.radius, PLAYER.height);
    if (p.onGround) { p.mode = 'ground'; p.noGravity = false; p.vel.set(0, 0, 0); centerMsg('Find a weapon! <span style="color:#ffd23f">[E]</span> to pick up', 3); }
    return;
  }

  // ---- ground
  const ads = mouse.r && !view.building && p.weapon && !p.weapon.melee && p.reloadT <= 0;
  const sprint = keys.has('ShiftLeft') && iz > 0 && !ads && p.healT <= 0;
  let speed = sprint ? PLAYER.sprint : PLAYER.walk;
  if (ads) speed *= PLAYER.adsMul;
  if (p.healT > 0) speed *= 0.45;
  const accel = p.onGround ? 14 : 3;
  p.vel.x += (tmp.x * speed - p.vel.x) * Math.min(1, dt * accel);
  p.vel.z += (tmp.z * speed - p.vel.z) * Math.min(1, dt * accel);
  if (keys.has('Space') && p.onGround) { p.vel.y = PLAYER.jump; p.onGround = false; }
  if (p.pos.y < 0.3) { p.vel.x *= 0.92; p.vel.z *= 0.92; } // wading
  moveActor(p, dt, PLAYER.radius, PLAYER.height);
  p.yaw = cam.yaw; p.pitch = cam.pitch;

  // auto pickup ammo/mats
  for (const l of G.loot) {
    if (!l.settled || (l.item.kind !== 'ammo' && l.item.kind !== 'mat')) continue;
    const dx = l.x - p.pos.x, dz = l.z - p.pos.z, dy = l.y - p.pos.y;
    if (dx * dx + dz * dz < 2.2 && Math.abs(dy) < 1.5) { p.give(l.item); removeLoot(l); sfx.pickup(); break; }
  }

  // prompts
  const ch = nearestChest(p.pos, 2.8);
  if (ch) view.prompt = { html: '<kbd>E</kbd>Open chest', color: '#ffd23f' };
  else {
    const l = nearestLoot(p.pos, 2.6, (l) => l.settled);
    if (l) view.prompt = lootPrompt(l);
  }

  // ---- build mode
  if (view.building) {
    const pl = computePlacement(p, view.building, cam.pitch);
    const ok = canPlace(p, pl);
    showGhost(pl, ok);
    const k = `${pl.type}${pl.cx},${pl.cz},${pl.y.toFixed(1)},${pl.dir}`;
    if (mouse.l && ok && k !== lastPlaced && p.fireCd <= 0) { placeBuild(p, pl); lastPlaced = k; p.fireCd = 0.12; }
    if (!mouse.l) lastPlaced = '';
    view.spread = 0;
    return;
  }
  showGhost(null);

  // ---- weapons / heals
  const it = p.item, w = p.weapon;
  if (it.kind === 'heal') {
    if (mouse.lPressed && p.healT <= 0) { if (p.startHeal()) sfx.heal(); }
    if (p.healT > 0) { const tot = { bandage: 3, medkit: 7, shield: 4 }[it.type]; view.progress = { k: 1 - p.healT / tot, label: 'Using ' + it.type }; }
  } else if (w) {
    if (p.reloadT > 0) view.progress = { k: 1 - p.reloadT / w.reload, label: 'Reloading' };
    const want = w.auto ? mouse.l : mouse.lPressed;
    if (want && p.fireCd <= 0 && p.reloadT <= 0 && p.equipT <= 0) {
      if (!w.melee && it.mag <= 0) { if (!p.startReload()) { if (mouse.lPressed) sfx.click(); } else sfx.reload(); }
      else {
        p.fireCd = w.rate;
        camFwd.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
        const moveK = Math.hypot(p.vel.x, p.vel.z) / PLAYER.sprint;
        let spread = (ads ? w.adsSpread : w.spread) * (1 + moveK * 0.8) * (p.onGround ? 1 : 1.8) + bloom;
        if (w.scope && !scopedNow()) spread = w.spread * 1.5;
        // start the aim ray level with the player so nothing behind them blocks it
        const o = camera.position;
        const chest = p.chest;
        const skip = Math.max(0, tmp.subVectors(chest, o).dot(camFwd));
        tmp2.copy(o).addScaledVector(camFwd, skip);
        muzzle.copy(chest).addScaledVector(fwd, 0.7).addScaledVector(rightV, 0.28); muzzle.y += 0.25;
        const res = fireWeapon(p, tmp2, camFwd, muzzle, spread, w.melee ? chest : p.eye);
        if (!w.melee) {
          bloom = Math.min(w.spread * 1.6, bloom + w.spread * 0.18);
          cam.pitch += w.recoil * (ads ? 0.6 : 1) * (0.8 + Math.random() * 0.4);
          cam.yaw += (Math.random() - 0.5) * w.recoil * 0.6;
          cam.shake = Math.min(0.4, cam.shake + w.recoil * 6);
          if (it.mag <= 0 && p.ammo[w.ammo] > 0) setTimeout(() => { if (p.item === it && it.mag <= 0) p.startReload(); }, 250);
        }
        if (res.killed) { /* handled by onElim */ }
      }
    }
  }
  bloom = Math.max(0, bloom - dt * (w ? w.spread * 2.5 : 0.1));
  const moveK = Math.hypot(p.vel.x, p.vel.z) / PLAYER.sprint;
  view.spread = w && !w.melee ? (ads ? w.adsSpread : w.spread) * (1 + moveK * 0.8) * (p.onGround ? 1 : 1.8) + bloom : 0;
}

function scopedNow() {
  const p = G.player, w = p.weapon;
  return !!(w && w.scope && mouse.r && !view.building && p.mode === 'ground' && p.reloadT <= 0 && cam.fov < G.settings.fov * 0.5);
}

// ------------------------------------------------------------------ camera
function updateCamera(dt) {
  const p = G.player;
  let dist = 4.2, side = 0.95, up = 0.35, targetFov = G.settings.fov;
  const w = p.weapon;
  if (p.mode === 'bus') { dist = 34; side = 0; up = 14; }
  else if (p.mode === 'sky' || p.mode === 'glide') { dist = 8; side = 0; up = 1.2; }
  else if (!p.alive) { dist = 7; side = 0; up = 1.5; }
  else if (mouse.r && w && !w.melee && !view.building && p.reloadT <= 0) { dist = w.scope ? 0.5 : 1.7; side = w.scope ? 0 : 1.05; up = w.scope ? 0.35 : 0.2; targetFov = G.settings.fov * w.zoom; }
  if (keys.has('ShiftLeft') && p.mode === 'ground' && !mouse.r) targetFov += 6;
  cam.dist += (dist - cam.dist) * Math.min(1, dt * 12);
  cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 14);
  if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }

  pivot.copy(p.pos); pivot.y += p.mode === 'bus' ? 2 : 1.55;
  camFwd.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
  rightV.set(-Math.cos(cam.yaw), 0, Math.sin(cam.yaw));
  // shoulder point, then pull back along view — both collision checked
  tmp.copy(pivot).addScaledVector(rightV, side); tmp.y += up;
  tmp2.subVectors(tmp, pivot); let len = tmp2.length();
  if (len > 0.01) {
    tmp2.divideScalar(len);
    const h = rayWorld(pivot.x, pivot.y, pivot.z, tmp2.x, tmp2.y, tmp2.z, len + 0.2);
    if (h) tmp.copy(pivot).addScaledVector(tmp2, Math.max(0, h.t - 0.2));
  }
  const back = cam.dist;
  const h2 = rayWorld(tmp.x, tmp.y, tmp.z, -camFwd.x, -camFwd.y, -camFwd.z, back + 0.3);
  const d = h2 ? Math.max(0.2, h2.t - 0.25) : back;
  camera.position.copy(tmp).addScaledVector(camFwd, -d);
  const gy = terrainHeight(camera.position.x, camera.position.z) + 0.3;
  if (camera.position.y < gy) camera.position.y = gy;
  if (cam.shake > 0) {
    cam.shake = Math.max(0, cam.shake - dt * 2);
    camera.position.x += (Math.random() - 0.5) * cam.shake * 0.15;
    camera.position.y += (Math.random() - 0.5) * cam.shake * 0.15;
  }
  tmp.copy(camera.position).add(camFwd);
  camera.lookAt(tmp);
  view.camYaw = cam.yaw;
  view.scoped = scopedNow();
  // hide our own model if the camera is inside it
  p.ch.root.visible = p.alive && p.mode !== 'bus' && !view.scoped && d > 0.6;

  // shadows follow the player
  sun.target.position.copy(p.pos);
  sun.position.copy(p.pos).add(tmp.set(60, 120, 40));
}

// ------------------------------------------------------------------ match flow
let bots = [];
let busMesh = null;
let stormTick = 0;

function startMatch() {
  initAudio();
  const diff = $('difficulty').value;
  G.settings.difficulty = diff; saveSettings();
  clearLoot(); clearBuilds(); clearFx(); clearFeed();
  restoreNodes(G.world);
  seedChests(); seedFloorLoot();
  G.storm = newStorm();
  G.bus = newBusPath();
  G.time = 0; G.alive = BOT_COUNT + 1;
  G.player.reset();
  G.player.mode = 'bus';
  bots.forEach((b) => b.resetBot(diff));
  for (const a of G.actors) busPos(G.bus, 0, a.pos);
  cam.yaw = G.bus.yaw; cam.pitch = -0.25;
  busMesh.visible = true;
  view.building = null; mapOpen = false; showBigMap(false);
  G.phase = 'bus';
  $('menu').classList.add('hidden'); $('end').classList.add('hidden'); $('pause').classList.add('hidden');
  showHud(true);
  lockPointer();
  centerMsg('Battle Bus is flying over the island', 3);
  feed('Match started — 30 players');
}

function pause(on) {
  if (on) { G.prevPhase = G.phase; G.phase = 'paused'; $('pause').classList.remove('hidden'); }
  else { G.phase = G.prevPhase || 'play'; $('pause').classList.add('hidden'); lockPointer(); }
}

function endMatch(win, killer) {
  const p = G.player;
  G.phase = 'end';
  if (document.pointerLockElement) document.exitPointerLock();
  const place = win ? 1 : G.alive + 1;
  $('end').classList.toggle('win', win);
  $('end-place').textContent = '#' + place;
  $('end-title').textContent = win ? 'VICTORY ROYALE' : place <= 5 ? 'SO CLOSE!' : 'ELIMINATED';
  $('end-sub').textContent = win ? 'You outlasted everyone on the island.' : killer ? `Eliminated by ${killer}` : 'The storm got you.';
  $('end-stats').innerHTML = `<div><b>${p.kills}</b>Elims</div><div><b>${Math.round(G.stats.damage)}</b>Damage</div><div><b>${fmt(G.time)}</b>Survived</div>`;
  setTimeout(() => { $('end').classList.remove('hidden'); if (win) sfx.victory(); }, win ? 600 : 1400);
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

G.onElim = (victim, attacker, opts) => {
  G.alive--;
  victim.place = G.alive + 1;
  dropInventory(victim);
  const how = opts && opts.storm ? 'was lost in the storm' : attacker ? `eliminated by <b>${attacker.name}</b>` : 'fell';
  const isYou = victim.isPlayer || (attacker && attacker.isPlayer);
  feed(`${victim.isPlayer ? 'You' : victim.name} ${how}${opts && opts.head ? ' (headshot)' : ''}`, isYou);
  if (attacker && attacker.isPlayer && !victim.isPlayer) { elimMsg(victim.name); sfx.elim(); }
  if (victim.isPlayer) { endMatch(false, attacker && attacker !== victim ? attacker.name : null); return; }
  if (G.alive <= 1 && G.player.alive) endMatch(true);
};
G.onHitConfirm = (pos, dmg, head, shield) => {
  damageNumber(pos, dmg, head, shield);
  hitMarker(head);
  head ? sfx.head() : shield ? sfx.shieldHit() : sfx.hit();
  G.stats.damage += dmg;
};
G.onHarvest = () => {};
G.onStormEvent = (e) => {
  if (e === 'shrink') { centerMsg('<span style="color:#d6a8ff">The storm is closing in!</span>', 3); sfx.storm(); }
  else centerMsg('Storm eye formed — get to the safe zone', 3);
};

function updateMatch(dt) {
  G.time += dt;
  const p = G.player;
  // bus
  if (busMesh.visible) {
    const b = G.bus;
    b.t += dt;
    busPos(b, b.t, busMesh.position);
    busMesh.rotation.y = b.yaw;
    const k = b.t / b.dur;
    for (const bot of bots) {
      if (bot.mode === 'bus') {
        busPos(b, b.t, bot.pos);
        if (k >= bot.dropT) { bot.mode = 'sky'; bot.pos.y -= 4; bot.vel.set(Math.sin(b.yaw) * 10, 0, Math.cos(b.yaw) * 10); }
      }
    }
    if (k >= 1) {
      if (p.mode === 'bus') jumpFromBus(p);
      busMesh.visible = false;
    }
  }
  updateStorm(G.storm, dt);
  stormTick -= dt;
  if (stormTick <= 0) {
    stormTick = 1;
    for (const a of G.actors) {
      if (a.alive && a.mode === 'ground' && inStorm(G.storm, a.pos.x, a.pos.z)) {
        a.takeDamage(G.storm.dps, null, { storm: true });
        if (a.isPlayer) hurtFlash(null);
      }
    }
  }
  view.inStorm = p.alive && inStorm(G.storm, p.pos.x, p.pos.z) && p.mode !== 'bus';

  updatePlayer(dt);
  for (const b of bots) {
    const d2 = (b.pos.x - p.pos.x) ** 2 + (b.pos.z - p.pos.z) ** 2;
    b.update(dt, d2 < 140 * 140);
  }
  updateBuilds(dt);
}

G.player = null;
function makePlayer() {
  const p = new Actor('You', SKINS[0], true);
  p.onDamaged = (dmg, attacker, opts, shieldOnly) => {
    if (dmg <= 0) return;
    hurtFlash(attacker ? attacker.pos : null);
    if (!opts.storm) sfx.hurt();
    cam.shake = Math.min(0.5, cam.shake + 0.15);
  };
  return p;
}

// ------------------------------------------------------------------ loop
let simNow = 0;
let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsCheckT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;
  tick(dt, now);
}
function tick(dt, now) {
  if (G.phase === 'play' || G.phase === 'bus' || G.phase === 'end') {
    if (G.phase !== 'end') updateMatch(dt);
    else { G.time += 0; for (const b of bots) b.update(dt, false); }
    updateLoot(dt, now / 1000);
    updateChests(dt, now / 1000);
    updateCamera(dt);
    syncStormVisual(G.storm, now / 1000);
    const px = G.player.pos.x, pz = G.player.pos.z;
    for (const a of G.actors) {
      if (a.isPlayer) { a.syncVisual(dt, true); a.ch.root.visible = a.ch.root.visible && camera.position.distanceTo(a.chest) > 0.7 && !view.scoped; continue; }
      const d2 = (a.pos.x - px) ** 2 + (a.pos.z - pz) ** 2;
      a.syncVisual(dt, d2 < 260 * 260);
    }
    updateFx(dt);
    updateHud(dt, view);
    mouse.lPressed = false;
    autoQuality(dt);
  } else if (G.phase === 'menu') {
    // slow orbit for the menu backdrop
    const t = now / 1000 * 0.05;
    camera.position.set(Math.cos(t) * 200, 90, Math.sin(t) * 200);
    camera.lookAt(0, 10, 0);
    if (G.storm) syncStormVisual(G.storm, now / 1000);
  }
  renderer.render(scene, camera);
}

function autoQuality(dt) {
  if (G.settings.quality !== 'auto' || G.phase !== 'play') return;
  fpsAcc += dt; fpsN++;
  fpsCheckT += dt;
  if (fpsCheckT < 3) return;
  const fps = fpsN / fpsAcc;
  fpsAcc = 0; fpsN = 0; fpsCheckT = 0;
  if (fps < 48 && dpr > 0.6) {
    if (dpr > 1) dpr = Math.max(1, dpr - 0.25);
    else if (renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; sun.castShadow = false; scene.traverse((o) => { if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; }); }
    else dpr = Math.max(0.6, dpr - 0.15);
    renderer.setPixelRatio(dpr); resize();
  }
}

// ------------------------------------------------------------------ boot
async function boot() {
  applyQuality(); resize();
  const tex = await loadAssets();
  G.tex = tex;
  G.mats = makeMats(tex);
  G.world = buildWorld(scene, tex, G.mats);
  scene.add(buildTerrainMesh(tex));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshPhongMaterial({ color: 0x1f8fd6, specular: 0x9fd8ff, shininess: 80, transparent: true, opacity: 0.85 }));
  water.rotation.x = -Math.PI / 2; water.position.y = 0;
  scene.add(water);
  initFx(scene);
  initStormVisual(scene);
  busMesh = makeBusMesh(scene, G.mats);
  initHud(renderMapImage(512));

  G.player = makePlayer();
  G.actors.push(G.player);
  const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  for (let i = 0; i < BOT_COUNT; i++) {
    const b = new Bot(names[i % names.length], SKINS[(i + 1) % SKINS.length]);
    bots.push(b); G.actors.push(b);
  }
  G.bots = bots;
  G.storm = newStorm();
  applyQuality();
  // warm up shaders so the first frame of the match doesn't hitch
  renderer.compile(scene, camera);

  $('loading').textContent = '';
  $('play').disabled = false;
  requestAnimationFrame(frame);
}

// menu wiring
$('play').disabled = true;
$('difficulty').value = G.settings.difficulty || 'normal';
$('quality').value = G.settings.quality;
$('sens').value = G.settings.sens;
$('vol').value = G.settings.volume;
$('play').onclick = startMatch;
$('again').onclick = startMatch;
$('resume').onclick = () => pause(false);
$('quit').onclick = $('tomenu').onclick = () => {
  G.phase = 'menu'; showHud(false); showGhost(null);
  $('pause').classList.add('hidden'); $('end').classList.add('hidden'); $('menu').classList.remove('hidden');
};
$('quality').onchange = (e) => { G.settings.quality = e.target.value; saveSettings(); applyQuality(); resize(); };
$('sens').oninput = (e) => { G.settings.sens = +e.target.value; saveSettings(); };
$('vol').oninput = (e) => { G.settings.volume = +e.target.value; saveSettings(); setVolume(G.settings.volume); };

// debug/test hook
window.__osr = {
  G, startMatch, keys, mouse, cam, view,
  // fast-forward the simulation (testing aid)
  tick(n = 1) { for (let i = 0; i < n; i++) { simNow += 33; tick(1 / 30, simNow); } },
  sim(seconds, step = 1 / 30) { const t0 = performance.now(); for (let t = 0; t < seconds && (G.phase === 'play' || G.phase === 'bus'); t += step) updateMatch(step); return performance.now() - t0; },
};

boot().catch((e) => { console.error(e); $('loading').textContent = 'Failed to load: ' + e.message; });
