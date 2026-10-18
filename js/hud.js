// DOM HUD. Writes are diffed so we don't thrash layout every frame.
import * as THREE from 'three';
import { WEAPONS, HEALS, RARITY_COLORS, RARITY_NAMES, WORLD_SIZE, MATS, POIS } from './config.js';
import { G } from './state.js';

const $ = (id) => document.getElementById(id);
const cache = new Map();
function setText(el, v) { if (cache.get(el) !== v) { cache.set(el, v); el.textContent = v; } }
function setStyle(el, k, v) { const st = el._st || (el._st = {}); if (st[k] !== v) { st[k] = v; el.style[k] = v; } }
function setClass(el, c, on) { el.classList.toggle(c, on); }

let els, mapImg, mini, miniCtx, big, bigCtx, dirCtx;
const dmgPool = [], dmgActive = [];
const hurtDirs = [];

export function initHud(mapCanvas) {
  mapImg = mapCanvas;
  els = {
    hud: $('hud'), alive: $('alive'), kills: $('kills'), stormtime: $('stormtime'), stormmsg: $('stormmsg'),
    feed: $('feed'), center: $('center-msg'), elim: $('elim-msg'), prompt: $('prompt'), progress: $('progress'),
    shieldBar: document.querySelector('.bar.shield i'), shieldTxt: document.querySelector('.bar.shield span'),
    hpBar: document.querySelector('.bar.health i'), hpTxt: document.querySelector('.bar.health span'),
    hotbar: $('hotbar'), buildbar: $('buildbar'), mag: $('mag'), reserve: $('reserve'), mats: $('mats'),
    cross: $('crosshair'), hit: $('hitmarker'), scope: $('scope'), stormtint: $('stormtint'), hurt: $('hurt'),
    dmgnums: $('dmgnums'), bigmap: $('bigmap'), bushint: $('bushint'),
  };
  mini = $('minimap'); miniCtx = mini.getContext('2d');
  big = els.bigmap.querySelector('canvas'); bigCtx = big.getContext('2d');
  dirCtx = $('dmgdir').getContext('2d');
  // hotbar: pickaxe + 5
  for (let i = 0; i < 6; i++) {
    const d = document.createElement('div');
    d.className = 'slot';
    d.innerHTML = `<span class="k">${i + 1}</span><img alt=""><span class="n"></span>`;
    els.hotbar.appendChild(d);
  }
  for (let i = 0; i < 30; i++) { const d = document.createElement('div'); d.style.display = 'none'; els.dmgnums.appendChild(d); dmgPool.push(d); }
}

const ICON = { ar: 'icon_ar', shotgun: 'icon_shotgun', smg: 'icon_smg', sniper: 'icon_sniper', pistol: 'icon_pistol', pickaxe: 'icon_pickaxe', bandage: 'icon_bandage', medkit: 'icon_medkit', shield: 'icon_shield' };
export const iconUrl = (t) => `assets/${ICON[t] || 'icon_ammo'}.png`;

let centerT = 0;
export function centerMsg(text, dur = 3) { els.center.innerHTML = text; els.center.classList.add('on'); centerT = dur; }
export function elimMsg(name) {
  els.elim.classList.remove('on'); void els.elim.offsetWidth;
  els.elim.innerHTML = `ELIMINATED <b>${name}</b>`; els.elim.classList.add('on');
}
export function feed(html, you = false) {
  const d = document.createElement('div');
  d.innerHTML = html; if (you) d.className = 'you';
  els.feed.prepend(d);
  while (els.feed.children.length > 6) els.feed.lastChild.remove();
  setTimeout(() => d.remove(), 7000);
}
export function clearFeed() { els.feed.innerHTML = ''; }

let hitT = 0, hurtT = 0;
export function hitMarker(head) { hitT = 0.12; els.hit.classList.add('on'); setClass(els.hit, 'head', head); }
export function hurtFlash(fromPos) {
  hurtT = 0.5;
  if (fromPos) hurtDirs.push({ x: fromPos.x, z: fromPos.z, t: 1.2 });
}

const proj = new THREE.Vector3();
export function damageNumber(pos, amount, head, shield) {
  const d = dmgPool.pop() || dmgActive.shift()?.el;
  if (!d) return;
  d.textContent = amount;
  d.className = head ? 'h' : shield ? 's' : '';
  d.style.display = 'block';
  dmgActive.push({ el: d, pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.3, 0)), t: 0.9 });
}

export function showBigMap(on) { setClass(els.bigmap, 'hidden', !on); }

function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

function drawMap(ctx, size, cx, cz, scale, full) {
  // scale: pixels per metre; (cx,cz) world point at canvas centre
  ctx.save();
  ctx.fillStyle = '#3a8fd0'; ctx.fillRect(0, 0, size, size);
  const imgPx = mapImg.width / WORLD_SIZE;
  ctx.translate(size / 2, size / 2);
  ctx.scale(scale / imgPx, scale / imgPx);
  ctx.drawImage(mapImg, -mapImg.width / 2 - cx * imgPx, -mapImg.height / 2 - cz * imgPx);
  ctx.restore();
  const toS = (x, z) => [size / 2 + (x - cx) * scale, size / 2 + (z - cz) * scale];
  const s = G.storm;
  if (s) {
    // storm: purple everything outside current circle
    const [sx, sy] = toS(s.cx, s.cz);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, size, size); ctx.arc(sx, sy, Math.max(0, s.r * scale), 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(120, 40, 200, 0.45)'; ctx.fill();
    ctx.beginPath(); ctx.arc(sx, sy, Math.max(0, s.r * scale), 0, Math.PI * 2); ctx.strokeStyle = '#c58bff'; ctx.lineWidth = 2; ctx.stroke();
    const [nx, ny] = toS(s.toX, s.toZ);
    ctx.beginPath(); ctx.arc(nx, ny, Math.max(0, s.toR * scale), 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.stroke();
    ctx.restore();
  }
  if (full) {
    ctx.font = '700 15px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    for (const p of POIS) { const [x, y] = toS(p.x, p.z); ctx.fillText(p.name.toUpperCase(), x, y); }
    ctx.shadowBlur = 0;
    if (G.bus && G.phase === 'bus') {
      const b = G.bus; const [x0, y0] = toS(b.sx, b.sz); const [x1, y1] = toS(b.ex, b.ez);
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 3; ctx.setLineDash([10, 6]); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  // player arrow
  const p = G.player;
  const [px, py] = toS(p.pos.x, p.pos.z);
  ctx.save();
  ctx.translate(px, py); ctx.rotate(Math.PI - p.yaw);
  ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

let slotKey = '';
export function updateHud(dt, view) {
  const p = G.player;
  setText(els.alive, String(G.alive));
  setText(els.kills, String(p.kills));
  const s = G.storm;
  if (s) {
    setText(els.stormtime, s.done ? '0:00' : fmtTime(s.timer));
    setText(els.stormmsg, s.done ? 'Final circle' : s.state === 'wait' ? `Storm shrinks in ${fmtTime(s.timer)}` : 'Storm closing!');
  }
  setStyle(els.shieldBar, 'width', `${p.shield}%`); setText(els.shieldTxt, String(Math.ceil(p.shield)));
  setStyle(els.hpBar, 'width', `${p.health}%`); setText(els.hpTxt, String(Math.ceil(p.health)));

  // hotbar
  const key = p.active + '|' + p.slots.map((s) => s ? s.type + s.rarity + (s.count || '') + (s.kind === 'weapon' ? ':' + s.mag : '') : '-').join(',');
  if (key !== slotKey) {
    slotKey = key;
    const ch = els.hotbar.children;
    for (let i = 0; i < 6; i++) {
      const d = ch[i], it = i === 0 ? { kind: 'weapon', type: 'pickaxe', rarity: 0 } : p.slots[i - 1];
      d.className = 'slot' + ((i === 0 ? p.active === -1 : p.active === i - 1) && !view.building ? ' active' : '') + (it && it.kind === 'weapon' && i > 0 ? ' r' + it.rarity : '');
      const img = d.querySelector('img'), n = d.querySelector('.n');
      if (it) { const u = iconUrl(it.type); if (img.getAttribute('src') !== u) img.src = u; img.style.display = ''; }
      else { img.removeAttribute('src'); img.style.display = 'none'; }
      n.textContent = it ? (it.kind === 'heal' ? it.count : it.kind === 'weapon' && i > 0 ? it.mag : '') : '';
    }
  }
  setClass(els.buildbar, 'on', !!view.building);
  for (const d of els.buildbar.children) setClass(d, 'sel', d.dataset.p === view.building);

  // ammo
  const it = p.item, w = p.weapon;
  if (w && !w.melee) { setText(els.mag, String(it.mag)); setText(els.reserve, String(p.ammo[w.ammo])); }
  else if (it.kind === 'heal') { setText(els.mag, String(it.count)); setText(els.reserve, ''); }
  else { setText(els.mag, '∞'); setText(els.reserve, ''); }
  const mc = els.mats.children;
  for (let i = 0; i < 3; i++) { setText(mc[i].lastElementChild, String(p.mats[MATS[i]])); setClass(mc[i], 'sel', p.matSel === i); }

  // prompt / progress
  if (view.prompt) { els.prompt.style.display = 'block'; if (els.prompt._h !== view.prompt.html) { els.prompt.innerHTML = view.prompt.html; els.prompt._h = view.prompt.html; } els.prompt.style.borderLeftColor = view.prompt.color || '#fff'; }
  else els.prompt.style.display = 'none';
  if (view.progress) {
    els.progress.style.display = 'block';
    els.progress.querySelector('i').style.width = `${view.progress.k * 100}%`;
    setText(els.progress.querySelector('span'), view.progress.label);
  } else els.progress.style.display = 'none';

  // crosshair spread
  const gap = Math.min(60, 4 + view.spread * 420);
  const c = els.cross.children;
  setStyle(c[0], 'top', `${-gap - 8}px`); setStyle(c[1], 'top', `${gap}px`); setStyle(c[2], 'left', `${-gap - 8}px`); setStyle(c[3], 'left', `${gap}px`);
  setStyle(els.cross, 'display', view.scoped || view.hideCross ? 'none' : 'block');
  setClass(els.scope, 'on', !!view.scoped);
  setClass(els.stormtint, 'on', !!view.inStorm);
  els.bushint.style.display = G.phase === 'bus' ? 'block' : 'none';

  if (hitT > 0) { hitT -= dt; if (hitT <= 0) els.hit.classList.remove('on'); }
  if (hurtT > 0) hurtT -= dt;
  setStyle(els.hurt, 'opacity', String(Math.max(0, hurtT * 1.6 + (p.health < 30 && p.alive ? 0.25 + Math.sin(G.time * 5) * 0.1 : 0)).toFixed(2)));
  if (centerT > 0) { centerT -= dt; if (centerT <= 0) els.center.classList.remove('on'); }

  // damage numbers
  const cam = G.camera, W = innerWidth, H = innerHeight;
  for (let i = dmgActive.length - 1; i >= 0; i--) {
    const d = dmgActive[i];
    d.t -= dt; d.pos.y += dt * 1.2;
    proj.copy(d.pos).project(cam);
    if (d.t <= 0 || proj.z > 1) { d.el.style.display = 'none'; dmgPool.push(d.el); dmgActive.splice(i, 1); continue; }
    d.el.style.transform = `translate(${(proj.x * 0.5 + 0.5) * W}px, ${(-proj.y * 0.5 + 0.5) * H}px) translate(-50%,-50%) scale(${0.8 + d.t * 0.4})`;
    d.el.style.opacity = Math.min(1, d.t * 3).toFixed(2);
  }

  // damage direction arcs
  dirCtx.clearRect(0, 0, 300, 300);
  for (let i = hurtDirs.length - 1; i >= 0; i--) {
    const h = hurtDirs[i];
    h.t -= dt;
    if (h.t <= 0) { hurtDirs.splice(i, 1); continue; }
    const ang = Math.atan2(h.x - p.pos.x, h.z - p.pos.z) - view.camYaw;
    // screen: up = forward
    const a = -ang - Math.PI / 2;
    dirCtx.beginPath();
    dirCtx.arc(150, 150, 120, a - 0.35, a + 0.35);
    dirCtx.strokeStyle = `rgba(255,60,60,${Math.min(1, h.t)})`; dirCtx.lineWidth = 10; dirCtx.stroke();
  }

  // minimap (10 Hz is plenty)
  view.mapT = (view.mapT || 0) - dt;
  if (view.mapT <= 0) {
    view.mapT = 0.1;
    drawMap(miniCtx, 200, p.pos.x, p.pos.z, 200 / 140, false);
    if (!els.bigmap.classList.contains('hidden')) drawMap(bigCtx, 720, 0, 0, 720 / WORLD_SIZE, true);
  }
}

export function lootPrompt(l) {
  const it = l.item;
  if (it.kind === 'weapon') return { html: `<kbd>E</kbd>${RARITY_NAMES[it.rarity]} ${WEAPONS[it.type].name}`, color: RARITY_COLORS[it.rarity] };
  if (it.kind === 'heal') return { html: `<kbd>E</kbd>${HEALS[it.type].name} ×${it.count}`, color: RARITY_COLORS[1] };
  if (it.kind === 'ammo') return { html: `<kbd>E</kbd>${it.type} ammo ×${it.count}`, color: '#fff' };
  return { html: `<kbd>E</kbd>${it.type} ×${it.count}`, color: '#fff' };
}

export function showHud(on) { setClass(els.hud, 'hidden', !on); }
