// Soak test: simulate full matches and check world invariants every tick.
// Usage (console): await import('./tests/soak.js'); then read window.__soak
const o = window.__osr, G = o.G;
const phys = await import('../js/physics.js');
const T = await import('../js/terrain.js');
const issues = {}; const examples = {};
const flag = (k, ex) => { issues[k] = (issues[k] || 0) + 1; if (!examples[k] || examples[k].length < 4) (examples[k] ||= []).push(ex); };
const fmt = (v) => `${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}`;

function penetration(a) {
  const r = 0.42, list = phys.queryBox(a.pos.x - r, a.pos.z - r, a.pos.x + r, a.pos.z + r);
  let worst = 0, what = '';
  for (const c of list) {
    if (c.ramp || c.noBlock) continue;
    const ox = Math.min(a.pos.x + r, c.maxX) - Math.max(a.pos.x - r, c.minX);
    const oz = Math.min(a.pos.z + r, c.maxZ) - Math.max(a.pos.z - r, c.minZ);
    const oy = Math.min(a.pos.y + 1.7, c.maxY) - Math.max(a.pos.y + 0.05, c.minY);
    if (ox > 0 && oz > 0 && oy > 0) { const d = Math.min(ox, oz, oy); if (d > worst) { worst = d; what = c.kind + (c.ref && c.ref.type ? ':' + c.ref.type : c.ref && c.ref.kind ? ':' + c.ref.kind : '') + `[x${c.minX.toFixed(2)}..${c.maxX.toFixed(2)} y${c.minY.toFixed(2)}..${c.maxY.toFixed(2)} z${c.minZ.toFixed(2)}..${c.maxZ.toFixed(2)}] ox${ox.toFixed(2)} oy${oy.toFixed(2)} oz${oz.toFixed(2)}`; } }
  }
  return [worst, what];
}

const matches = +(new URLSearchParams(location.search).get('soak') || 3);
const step = 1 / 30;
const lastMove = new Map();
let ticks = 0;
const t0 = performance.now();
for (let m = 0; m < matches; m++) {
  o.startMatch();
  G.player.takeDamage = () => 0;
  let t = 0;
  while ((G.phase === 'play' || G.phase === 'bus') && t < 480) {
    o.sim(step); t += step; ticks++;
    for (const a of G.actors) {
      if (!a.alive || a.mode !== 'ground') continue;
      if (!Number.isFinite(a.pos.x + a.pos.y + a.pos.z)) flag('NaN position', a.name);
      const [pen, what] = penetration(a);
      if (pen > 0.06) flag('actor inside collider', `${a.name} ${what} depth ${pen.toFixed(2)} @${fmt(a.pos)} y=${a.pos.y.toFixed(2)} onG=${a.onGround}`);
      const th = T.terrainHeight(a.pos.x, a.pos.z);
      if (a.pos.y < th - 0.25) flag('actor below terrain', `${a.name} ${(th - a.pos.y).toFixed(2)}m @${fmt(a.pos)}`);
      if (!a.isPlayer) {
        const lm = lastMove.get(a) || { p: a.pos.clone(), t: G.time };
        if (a.pos.distanceTo(lm.p) > 1.5) { lm.p.copy(a.pos); lm.t = G.time; }
        else if (G.time - lm.t > 8 && a.goal && !a.target && !a.emote && a.healT <= 0) { { const wp = a.waypoint ? a.waypoint(a.goal) : a.goal; flag('bot stuck >8s', `${a.name} goal=${a.goalKind} @${fmt(a.pos)} → goal ${a.goal.x.toFixed(1)},${(a.goal.y ?? NaN).toFixed?.(1)},${a.goal.z.toFixed(1)} wp ${wp.x.toFixed(1)},${wp.z.toFixed(1)} near: ${phys.queryBox(a.pos.x - 1, a.pos.z - 1, a.pos.x + 1, a.pos.z + 1).map((c) => c.kind + (c.ref && (c.ref.type || c.ref.kind) ? ':' + (c.ref.type || c.ref.kind) : '') + '[' + c.minY.toFixed(1) + '-' + c.maxY.toFixed(1) + ']').join(' ')}`); } lm.t = G.time; }
        lastMove.set(a, lm);
      }
    }
    if (ticks % 30 === 0) {
      for (const l of G.loot) {
        if (!l.settled) continue;
        const gh = T.terrainHeight(l.x, l.z);
        if (l.y < gh - 0.15) flag('loot under ground', `${l.item.type} @${l.x.toFixed(1)},${l.y.toFixed(1)},${l.z.toFixed(1)}`);
        const inside = phys.queryBox(l.x - 0.1, l.z - 0.1, l.x + 0.1, l.z + 0.1).some((c) => !c.ramp && !c.noBlock && l.y + 0.3 > c.minY && l.y + 0.1 < c.maxY - 0.01 && c.kind === 'house');
        if (inside) flag('loot inside wall', `${l.item.type} @${l.x.toFixed(1)},${l.y.toFixed(1)},${l.z.toFixed(1)}`);
      }
    }
  }
  if (G.phase !== 'end') flag('match did not finish', `t=${t.toFixed(0)} alive=${G.alive}`);
  delete G.player.takeDamage;
}
// static world checks
for (const c of G.chests) {
  const inside = phys.queryBox(c.x - 0.5, c.z - 0.5, c.x + 0.5, c.z + 0.5).some((k) => k.kind === 'house' && c.y + 0.5 > k.minY && c.y + 0.1 < k.maxY - 0.01);
  if (inside) flag('chest inside wall', `${c.kind || 'chest'} @${c.x.toFixed(1)},${c.y.toFixed(1)},${c.z.toFixed(1)}`);
}
window.__soak = { ms: Math.round(performance.now() - t0), ticks, issues, examples };
