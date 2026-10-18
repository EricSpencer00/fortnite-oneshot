// In-browser QA suite. Open the game, then in the console: await import('./tests/qa.js'); then read window.__qa
(async () => {
const o=__osr, G=o.G, R=[]; const errs=[]; addEventListener('error',e=>errs.push(e.message));
// automation can't hold pointer lock; don't let lock-loss pause the run
document.addEventListener('pointerlockchange', e => e.stopImmediatePropagation(), true);
const ok=(name,cond,info='')=>R.push((cond?'PASS ':'FAIL ')+name+(info?' — '+info:''));
const key=(c)=>{dispatchEvent(new KeyboardEvent('keydown',{code:c})); dispatchEvent(new KeyboardEvent('keyup',{code:c}));};
const click=()=>{o.mouse.l=true;o.mouse.lPressed=true;o.tick(1);o.mouse.l=false;};
const m = await import('../js/physics.js'); const L = await import('../js/loot.js');
const settle=()=>{ let i=0; do { o.tick(5); i++; } while(!P.onGround && i<100); o.tick(3); };
const openSpot=()=>{ for(let x=-60;x<60;x+=4) for(let z=-60;z<60;z+=4) if(m.queryBox(x-8,z-8,x+8,z+16).length===0) return [x,z]; };
const aimAt=(v)=>{ for(let i=0;i<4;i++){ const c=G.camera.position; o.cam.yaw=Math.atan2(v.x-c.x, v.z-c.z); o.cam.pitch=Math.atan2(v.y-c.y, Math.hypot(v.x-c.x, v.z-c.z)); o.tick(1);} };
const P=G.player;

o.startMatch();
ok('match starts in bus', G.phase==='bus' && P.mode==='bus' && G.alive===30);
o.tick(30); key('Space'); ok('space jumps from bus', P.mode==='sky' && G.phase==='play');
o.cam.pitch=-1.2; let t=0; while(P.mode!=='ground' && t<60){o.tick(5); t+=5/30;} ok('skydive → glide → land', P.mode==='ground', t.toFixed(1)+'s');

const real = G.bots.map(b=>b); G.bots.forEach(b=>{b.alive=false;b.mode='dead';}); G.alive=30;
const [sx,sz]=openSpot(); const home=()=>{ P.pos.set(sx + 2, 40, sz + 2); P.vel.set(0,0,0); settle(); };
home(); ok('player settles on ground', P.onGround);

L.spawnLoot({kind:'weapon',type:'ar',rarity:2,mag:30}, P.pos.x+1, P.pos.y, P.pos.z);
L.spawnLoot({kind:'ammo',type:'medium',count:60}, P.pos.x-0.5, P.pos.y, P.pos.z+0.5);
o.tick(3); key('KeyE'); o.tick(1);
ok('E picks up weapon & auto-equips', P.slots[0]&&P.slots[0].type==='ar' && P.active===0);
ok('ammo auto-picked', P.ammo.medium>=60, 'medium='+P.ammo.medium);

const ch=G.chests.find(c=>!c.opened); P.pos.set(ch.x+1.2, ch.y+0.5, ch.z); P.vel.set(0,0,0); settle();
const near=()=>G.loot.filter(l=>Math.hypot(l.x-ch.x,l.z-ch.z)<5).length; const n0=near(); const mats0=P.mats.wood; const ammo0=JSON.stringify(P.ammo);
key('KeyE'); o.tick(40);
ok('E opens chest & drops loot', ch.opened && near()+(P.mats.wood>mats0?1:0)+(JSON.stringify(P.ammo)!==ammo0?1:0) >= n0+4, 'opened='+ch.opened);
home();

key('Digit1'); ok('1 = pickaxe', P.active===-1); key('Digit2'); ok('2 = slot 1', P.active===0);
o.mouse.wheel=1; o.tick(1); ok('wheel cycles', P.active===1); key('Digit2'); o.tick(10);

const b=real[0]; b.resetBot('normal'); b.alive=true; b.mode='ground'; b.pos.set(P.pos.x, P.pos.y+0.5, P.pos.z+14); b.vel.set(0,0,0); G.alive=30;
const bu=b.update; b.update=function(dt){ this.tickTimers(dt); }; // stand still
o.tick(10); aimAt(b.chest);
o.mouse.l=true; o.mouse.r=true; let n=0; while(b.alive && n<150){ if(n%10===0) aimAt(b.chest); o.tick(1); n++; } o.mouse.l=false; o.mouse.r=false; o.tick(2);
delete b.update;
ok('shooting kills bot', !b.alive, 'ticks='+n+' kills='+P.kills+' dmg='+Math.round(G.stats.damage));
ok('alive count drops', G.alive===29);
ok('victim drops loot', G.loot.some(l=>Math.hypot(l.x-b.pos.x,l.z-b.pos.z)<5));
ok('HUD kill counter', document.getElementById('kills').textContent==='1');

P.item.mag=3; const res0=P.ammo.medium; key('KeyR'); o.tick(Math.ceil(2.4*30)); ok('R reloads from reserve', P.item.mag===30 && P.ammo.medium===res0-27, 'reserve '+res0+'→'+P.ammo.medium);
P.health=40; P.slots[2]={kind:'heal',type:'bandage',count:5}; key('Digit4'); o.tick(10); click(); o.tick(Math.ceil(3.2*30)); ok('bandage heals', P.health===55 && P.slots[2].count===4, 'hp='+P.health);
P.slots[3]={kind:'heal',type:'shield',count:1}; key('Digit5'); o.tick(10); click(); o.tick(Math.ceil(4.2*30)); ok('shield potion', P.shield===50 && P.slots[3]===null, 'shield='+P.shield);
key('Digit2');

home(); o.cam.yaw=0; o.cam.pitch=-0.1; P.mats.wood=100; P.mats.stone=0; const nb=G.builds.length;
key('KeyQ'); ok('Q enters wall mode', o.view.building==='wall'); click(); o.tick(5);
key('KeyX'); click(); o.tick(5); key('KeyC'); click(); o.tick(5);
ok('wall+floor+ramp placed (immediately after slot switch)', G.builds.length===nb+3, G.builds.slice(nb).map(x=>x.type).join(','));
ok('mats spent 10 each', P.mats.wood===70, 'wood='+P.mats.wood);
key('KeyX'); o.tick(5); click(); o.tick(5); ok('no duplicate floor in same spot', G.builds.length===nb+3);
key('KeyG'); ok('G cycles material', P.matSel===1); click(); o.tick(5); ok('cannot build without mats', G.builds.length===nb+3); key('KeyG'); key('KeyG');
key('Digit2'); ok('number key exits build mode', o.view.building===null);
const wall=G.builds.find(x=>x.type==='wall'); wall.grow=0; const hp0=wall.hp; key('Digit1'); o.tick(10);
aimAt(wall.mesh.position.clone().setY(wall.y+1.5)); o.mouse.l=true; o.tick(30); o.mouse.l=false;
ok('pickaxe damages builds', !G.builds.includes(wall) || wall.hp<hp0, hp0.toFixed(0)+'→'+wall.hp.toFixed(0));

const tree=G.world.nodes.find(n=>n.kind==='tree'&&n.alive&&Math.hypot(n.x,n.z)<150);
P.pos.set(tree.x, tree.y+3, tree.z-2.4); P.vel.set(0,0,0); settle(); key('Digit1'); o.tick(10);
const w0=P.mats.wood; aimAt({x:tree.x, y:tree.y+1.3, z:tree.z}); o.mouse.l=true; o.tick(30*4); o.mouse.l=false;
ok('pickaxe harvests tree', P.mats.wood>w0, w0+'→'+P.mats.wood+(tree.alive?'':' (tree felled)'));

home(); P.health=100; P.shield=50; const st={...G.storm}; G.storm.r=1; G.storm.cx=200; G.storm.cz=200; o.tick(70);
ok('storm hurts outside & bypasses shield', P.health<100 && P.shield===50, 'hp='+P.health);
ok('storm tint shown', document.getElementById('stormtint').classList.contains('on'));
Object.assign(G.storm, st);

key('KeyM'); const mapOn=!document.getElementById('bigmap').classList.contains('hidden'); key('KeyM'); ok('M toggles map', mapOn && document.getElementById('bigmap').classList.contains('hidden'));
P.slots[1]={kind:'weapon',type:'sniper',rarity:3,mag:1}; key('Digit3'); o.tick(10); o.mouse.r=true; o.tick(30); ok('sniper scope overlay', o.view.scoped && document.getElementById('scope').classList.contains('on')); o.mouse.r=false; o.tick(20);
await new Promise(r=>setTimeout(r,600));
ok('hotbar icons render', [...document.querySelectorAll('#hotbar img')].filter(i=>i.complete&&i.naturalWidth>0&&i.style.display!=='none').length>=4);

home(); P.mats.wood=300; o.cam.yaw=0; key('KeyC'); o.keys.add('KeyW'); o.mouse.l=true; const y0=P.pos.y; o.tick(30*3); o.mouse.l=false; o.keys.delete('KeyW'); key('Digit2');
ok('ramp rush climbs', P.pos.y > y0+6, 'climbed '+(P.pos.y-y0).toFixed(1)+'m');

P.takeDamage(500, real[1], {weapon:'ar'}); await new Promise(r=>setTimeout(r,2100));
ok('death → end screen', G.phase==='end' && !document.getElementById('end').classList.contains('hidden'), document.getElementById('end-place').textContent+' / '+document.getElementById('end-sub').textContent);
document.getElementById('again').click(); ok('play again fully resets', G.phase==='bus' && G.alive===30 && G.builds.length===0 && P.alive && P.slots.every(s=>!s) && P.mats.wood===0 && G.chests.every(c=>!c.opened) && G.bots.every(b=>b.mode==='bus'));
document.getElementById('quit').click(); ok('quit to menu', G.phase==='menu' && document.getElementById('hud').classList.contains('hidden'));

// ---- new: Magic Mouse input
o.startMatch(); G.bots.forEach(b=>{b.alive=false;b.mode='dead';b.deadT=9;}); P.mode='ground'; P.noGravity=false; G.phase='play'; home();
P.give({kind:'weapon',type:'ar',rarity:1,mag:30}); P.give({kind:'weapon',type:'smg',rarity:1,mag:30}); P.give({kind:'weapon',type:'pistol',rarity:1,mag:12});
o.setLocked(true); key('Digit1'); o.tick(1);
const wheel=(dy,mode=0)=>dispatchEvent(new WheelEvent('wheel',{deltaY:dy,deltaMode:mode}));
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
// a Magic Mouse swipe: ~30 small momentum events over ~350 ms
for(let i=0;i<30;i++){ wheel(Math.max(1, 14 - i*0.45)); await wait(12); } o.tick(1);
const afterSwipe=P.active;
ok('magic mouse swipe = one slot', afterSwipe===0, 'active='+afterSwipe);
await wait(250); key('Digit1'); o.tick(1);
for(let i=0;i<3;i++){ wheel(100); await wait(70); o.tick(1); } ok('notched wheel = one slot per click', P.active===2, 'active='+P.active);
await wait(250); key('Digit1'); o.tick(1); wheel(3,1); o.tick(1); ok('line-mode wheel steps', P.active===0);
G.settings.invertScroll=true; await wait(250); key('Digit3'); o.tick(1); wheel(100); o.tick(1); ok('invert scroll', P.active===0, 'active='+P.active); G.settings.invertScroll=false;
key('KeyQ'); await wait(250); wheel(100); o.tick(1); ok('wheel cycles build piece in build mode', o.view.building==='floor', o.view.building); key('Digit2');
const cv=document.getElementById('game');
cv.dispatchEvent(new MouseEvent('mousedown',{button:0,ctrlKey:true,bubbles:true})); o.tick(1); ok('ctrl+click aims (no right click)', o.mouse.r===true && !o.mouse.l);
dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true})); o.tick(1); ok('ctrl+click release stops aiming', o.mouse.r===false);
G.settings.aimToggle=true; cv.dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true})); dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true})); o.tick(1); const tog1=o.mouse.r;
cv.dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true})); dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true})); o.tick(1);
ok('toggle aim mode', tog1===true && o.mouse.r===false); G.settings.aimToggle=false; o.mouse.r=false; o.setLocked(false);

// ---- new: emote, llamas, supply drop, XP, robots
key('KeyB'); o.tick(20); ok('B starts dance emote', P.emote && P.ch.current==='Dance', P.ch.current);
o.keys.add('KeyW'); o.tick(2); o.keys.delete('KeyW'); ok('moving cancels emote', !P.emote);
const llamas=G.chests.filter(c=>c.kind==='llama'); ok('3 loot llamas spawned', llamas.length===3);
const lm=llamas[0]; P.pos.set(lm.x+1.5, lm.y+2, lm.z); P.vel.set(0,0,0); settle(); const xp0=G.stats.xp, l0=G.loot.length; key('KeyE'); o.tick(40);
ok('llama smashes into loot + XP', lm.opened && !lm.mesh.visible && G.stats.xp>=xp0+50 && G.loot.length - l0 >= 6, 'loot+'+(G.loot.length-l0)+' xp+'+(G.stats.xp-xp0));
G.storm.phase=1; G.storm.state='wait'; G.onStormEvent('wait'); const dr=G.chests.find(c=>c.kind==='drop'); ok('supply drop spawns in the safe zone', !!dr && Math.hypot(dr.x-G.storm.toX, dr.z-G.storm.toZ) <= G.storm.toR);
P.pos.set(dr.x+1.6, dr.y+3, dr.z); P.vel.set(0,0,0); settle(); key('KeyE'); o.tick(2); ok('drop locked while falling', !dr.opened);
o.tick(30*14); key('KeyE'); o.tick(20); ok('drop lands and opens', !dr.locked && dr.opened);
ok('robots in use', !!P.ch.robot && G.bots.every(b=>b.ch.robot));
const hb=G.bots[3]; hb.resetBot('normal'); hb.alive=true; hb.mode='ground'; hb.pos.set(P.pos.x+3,P.pos.y,P.pos.z); hb.shield=20; hb.health=100; o.tick(2);
let broke=false; const ob=G.onShieldBreak; G.onShieldBreak=(v,s)=>{broke=true; ob(v,s);}; hb.takeDamage(30, P, {}); G.onShieldBreak=ob;
hb.takeDamage(200, P, {}); for(let i=0;i<60;i++) o.tick(1);
ok('dead robot plays death then vanishes', !hb.ch.root.visible && hb.deadT>=1.6);
const killer=G.bots[4]; killer.resetBot('normal'); killer.alive=true; killer.mode='ground'; killer.pos.set(P.pos.x+20,P.pos.y,P.pos.z); const vict=G.bots[5]; vict.resetBot('normal'); vict.alive=true; vict.mode='ground'; vict.pos.set(P.pos.x+22,P.pos.y,P.pos.z);
let danced=false; for(let k=0;k<6 && !danced;k++){ vict.alive=true; vict.health=100; vict.mode='ground'; vict.takeDamage(500, killer, {weapon:'ar'}); killer.lastHurtT=-99; o.tick(5); danced=killer.emote; }
ok('bots dance after an elimination (sometimes)', danced);
o.startMatch(); P.takeDamage=()=>0; o.sim(450); await wait(300);
ok('victory: dance + confetti, results card waits', G.won && P.emote && document.getElementById('end').classList.contains('hidden'));
o.tick(30); ok('victory dance animation', P.ch.current==='Dance', P.ch.current);
await wait(4300); ok('results card shows XP', !document.getElementById('end').classList.contains('hidden') && /XP/.test(document.getElementById('end-stats').textContent), document.getElementById('end-stats').textContent);
delete P.takeDamage;

const times=[]; for(let k=0;k<3;k++){ o.startMatch(); P.takeDamage=()=>0; o.sim(450); times.push(G.phase==='end'?Math.round(G.time)+'s':'STUCK('+G.phase+','+G.alive+')'); delete P.takeDamage; }
await new Promise(r=>setTimeout(r,800));
ok('3 full matches end in victory', times.every(x=>x.endsWith('s')) && document.getElementById('end-title').textContent==='VICTORY ROYALE', times.join(', '));
ok('no JS errors', errs.length===0, errs.join(' | '));
window.__qa = R.join('\n');
})();
