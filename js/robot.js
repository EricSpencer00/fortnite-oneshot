// Animated robot characters ("RobotExpressive" by Tomás Laulhé / Quaternius, CC0).
// At load the 19 rigid + skinned parts are baked into ONE skinned mesh (3 material
// groups) so 30 robots cost ~90 draw calls instead of ~570. Arms are aimed
// procedurally on top of the clip animations so robots hold their guns.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

let template = null, clips = null, baseMats = null;
const HEIGHT = 1.85;

export async function loadRobot(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);

  // shared bone list from one of the skinned hand meshes
  let skinned = null;
  scene.traverse((o) => { if (o.isSkinnedMesh && !skinned) skinned = o; });
  const bones = skinned.skeleton.bones;
  const boneIndex = new Map(bones.map((b, i) => [b, i]));
  const matOrder = ['Main', 'Grey', 'Black'];
  const parts = { Main: [], Grey: [], Black: [] };
  const v = new THREE.Vector3();

  const meshes = [];
  scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    const geo = m.geometry;
    const pos = geo.attributes.position, nrm = geo.attributes.normal;
    // rigid parts ride their nearest ancestor bone
    let bone = m.parent; while (bone && !boneIndex.has(bone)) bone = bone.parent;
    const groups = geo.groups.length ? geo.groups : [{ start: 0, count: geo.index ? geo.index.count : pos.count, materialIndex: 0 }];
    const nm = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
    // world-space (bind pose) positions
    const wp = new Float32Array(pos.count * 3), wn = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (m.isSkinnedMesh) m.applyBoneTransform(i, v);
      v.applyMatrix4(m.matrixWorld);
      wp.set([v.x, v.y, v.z], i * 3);
      v.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize();
      wn.set([v.x, v.y, v.z], i * 3);
    }
    const si = new Uint16Array(pos.count * 4), sw = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      if (m.isSkinnedMesh) {
        for (let k = 0; k < 4; k++) { si[i * 4 + k] = geo.attributes.skinIndex.getComponent(i, k); sw[i * 4 + k] = geo.attributes.skinWeight.getComponent(i, k); }
      } else { si[i * 4] = boneIndex.get(bone) ?? 0; sw[i * 4] = 1; }
    }
    for (const gr of groups) {
      const mat = mats[gr.materialIndex] || mats[0];
      const key = matOrder.includes(mat.name) ? mat.name : 'Grey';
      const idx = [];
      for (let k = gr.start; k < gr.start + gr.count; k++) idx.push(geo.index ? geo.index.getX(k) : k);
      parts[key].push({ wp, wn, si, sw, idx });
    }
    m.parent.remove(m);
  }

  // merge into one geometry with a group per material
  const P = [], N = [], SI = [], SW = [], I = [], groups = [];
  for (let gi = 0; gi < matOrder.length; gi++) {
    const start = I.length;
    for (const p of parts[matOrder[gi]]) {
      const remap = new Map();
      for (const old of p.idx) {
        if (!remap.has(old)) {
          remap.set(old, P.length / 3);
          P.push(p.wp[old * 3], p.wp[old * 3 + 1], p.wp[old * 3 + 2]);
          N.push(p.wn[old * 3], p.wn[old * 3 + 1], p.wn[old * 3 + 2]);
          for (let k = 0; k < 4; k++) { SI.push(p.si[old * 4 + k]); SW.push(p.sw[old * 4 + k]); }
        }
        I.push(remap.get(old));
      }
    }
    groups.push({ start, count: I.length - start, materialIndex: gi });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  geo.setIndex(I);
  for (const g of groups) geo.addGroup(g.start, g.count, g.materialIndex);
  geo.computeBoundingSphere();

  baseMats = [
    new THREE.MeshLambertMaterial({ color: 0xe8862a }),
    new THREE.MeshLambertMaterial({ color: 0x5e5d55 }),
    new THREE.MeshLambertMaterial({ color: 0x15151a }),
  ];
  const skel = new THREE.Skeleton(bones); // inverses from the current (bind) pose, world space
  const mesh = new THREE.SkinnedMesh(geo, baseMats);
  mesh.bind(skel, new THREE.Matrix4());
  mesh.castShadow = true;
  mesh.frustumCulled = false; // bounds don't follow the animation
  mesh.name = 'RobotBody';
  scene.add(mesh);

  const box = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
  const s = HEIGHT / (box.max.y - box.min.y);
  template = new THREE.Group();
  scene.scale.setScalar(s);
  scene.position.y = -box.min.y * s;
  template.add(scene);

  // drop tracks that pointed at the removed meshes (morphs etc.)
  const names = new Set(); scene.traverse((o) => names.add(o.name));
  clips = {};
  for (const c of gltf.animations) {
    c.tracks = c.tracks.filter((t) => names.has(t.name.split('.')[0]));
    clips[c.name] = c;
  }
  return true;
}

export const robotReady = () => !!template;

export function makeRobot(skin) {
  const root = new THREE.Group();
  const model = SkeletonUtils.clone(template);
  root.add(model);
  let body = null; model.traverse((o) => { if (o.name === 'RobotBody') body = o; });
  const main = baseMats[0].clone(); main.color.setHex(skin.shirt);
  const grey = baseMats[1].clone(); grey.color.setHex(skin.pants).lerp(new THREE.Color(0x6a6a6a), 0.35);
  body.material = [main, grey, baseMats[2]];
  const bone = (n) => { let r = null; model.traverse((o) => { if (o.isBone && o.name === n) r = o; }); return r; };
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const k in clips) actions[k] = mixer.clipAction(clips[k]);
  for (const k of ['Death', 'Punch', 'Jump', 'WalkJump']) { actions[k].setLoop(THREE.LoopOnce, 1); actions[k].clampWhenFinished = true; }
  actions.Idle.play();

  // glider (hidden until deployed)
  const glider = new THREE.Group();
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.Float32BufferAttribute([-2.2, 0, -0.6, 2.2, 0, -0.6, 0, 0.35, 1.4, -2.2, 0, -0.6, 0, 0.35, 1.4, 2.2, 0, -0.6], 3));
  cg.computeVertexNormals();
  const canopy = new THREE.Mesh(cg, new THREE.MeshLambertMaterial({ color: skin.pack, side: THREE.DoubleSide }));
  canopy.position.y = 3.1; glider.add(canopy);
  glider.visible = false; root.add(glider);

  return {
    robot: true, root, model, body, mixer, actions, current: 'Idle', glider,
    bones: {
      armR: bone('UpperArmR'), foreR: bone('LowerArmR'), handR: bone('Palm2R'),
      armL: bone('UpperArmL'), foreL: bone('LowerArmL'), handL: bone('Palm2L'),
      torso: bone('Torso'), head: bone('Head'), abdomen: bone('Abdomen'),
    },
    weapon: null, weaponKey: '', lod: 0,
  };
}

function play(ch, name, fade = 0.18, timeScale = 1) {
  const a = ch.actions[name];
  if (!a) return;
  a.timeScale = timeScale;
  if (ch.current === name) return;
  const prev = ch.actions[ch.current];
  a.reset().play();
  if (prev) a.crossFadeFrom(prev, fade, false);
  ch.current = name;
}

// rotate `bone` so the direction bone→child points along `dirW` (world), blended by w
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _bq = new THREE.Quaternion();
function pointBone(bone, child, dirW, w = 1) {
  bone.getWorldPosition(_a);
  child.getWorldPosition(_b);
  _b.sub(_a).normalize();
  _q.setFromUnitVectors(_b, dirW);
  if (w < 1) _q.slerp(_pq.identity(), 1 - w);
  bone.getWorldQuaternion(_bq);
  _bq.premultiply(_q);
  bone.parent.getWorldQuaternion(_pq).invert();
  bone.quaternion.copy(_pq.multiply(_bq));
  bone.updateMatrixWorld(true);
}

const aim = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), side = new THREE.Vector3();
// s: {speed, onGround, pitch, mode, holding, kick, swing, emote, dead, yaw}
export function animateRobot(ch, dt, s) {
  ch.glider.visible = s.mode === 'glide';
  const m = ch.model;
  m.rotation.set(0, 0, 0); m.position.set(0, 0, 0);
  let anim = 'Idle', ts = 1;
  if (s.dead) anim = 'Death';
  else if (s.mode === 'sky') { anim = 'Jump'; m.rotation.x = 1.2; m.position.y = 1; }
  else if (s.mode === 'glide') anim = 'Idle';
  else if (s.emote && s.speed < 0.5) anim = 'Dance';
  else if (!s.onGround) anim = 'WalkJump';
  else if (s.swing > 0.6) anim = 'Punch';
  else if (s.speed > 4.5) { anim = 'Running'; ts = s.speed / 7; }
  else if (s.speed > 0.4) { anim = 'Walking'; ts = Math.max(0.6, s.speed / 3); }
  if (ch.current === 'Punch' && s.swing > 0.05 && !s.dead) anim = 'Punch';
  play(ch, anim, anim === 'Death' ? 0.1 : 0.18, ts);
  // far robots animate at a lower rate
  ch.lodT = (ch.lodT || 0) + dt;
  const step = ch.lod ? 0.1 : 0;
  if (ch.lodT >= step) { ch.mixer.update(ch.lodT); ch.lodT = 0; }
  ch.root.updateMatrixWorld(true);

  const b = ch.bones;
  const gun = s.holding && s.holding !== 'pickaxe' && s.holding !== 'heal';
  if (s.mode === 'glide') {
    tmp.set(0, 1, 0.15).normalize();
    pointBone(b.armR, b.foreR, tmp); pointBone(b.armL, b.foreL, tmp);
  } else if (gun && !s.dead && !(s.emote && s.speed < 0.5) && s.mode === 'ground') {
    // world aim direction from yaw/pitch, with a little kick
    const p = s.pitch + s.kick * 0.12;
    aim.set(Math.sin(s.yaw) * Math.cos(p), Math.sin(p), Math.cos(s.yaw) * Math.cos(p)).normalize();
    pointBone(b.armR, b.foreR, aim); pointBone(b.foreR, b.handR, aim);
    // support hand reaches for a point along the barrel
    b.handR.getWorldPosition(tmp).addScaledVector(aim, 0.32);
    side.set(Math.cos(s.yaw), 0, -Math.sin(s.yaw)); // character's left
    b.armL.getWorldPosition(tmp2);
    tmp.sub(tmp2).normalize();
    pointBone(b.armL, b.foreL, tmp);
    b.handL.getWorldPosition(tmp2);
    b.handR.getWorldPosition(_a).addScaledVector(aim, 0.32).sub(tmp2);
    if (_a.lengthSq() > 1e-6) pointBone(b.foreL, b.handL, _a.normalize());
    void side;
  }
  // weapon follows the right hand
  if (ch.weapon) {
    ch.weapon.visible = !s.dead && !(s.emote && s.speed < 0.5) && s.mode === 'ground';
    if (ch.weapon.visible) {
      b.handR.getWorldPosition(tmp);
      ch.root.worldToLocal(tmp);
      ch.weapon.position.copy(tmp);
      if (gun) {
        const p = s.pitch + s.kick * 0.12;
        ch.weapon.rotation.set(-p, 0, 0);
      } else {
        // pickaxe / heal item: follow the forearm
        b.foreR.getWorldQuaternion(_bq);
        ch.root.getWorldQuaternion(_pq).invert();
        ch.weapon.quaternion.copy(_pq.multiply(_bq)).multiply(_q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
      }
    }
  }
}

export function setRobotWeapon(ch, model) {
  if (ch.weapon) ch.root.remove(ch.weapon);
  ch.weapon = model;
  if (model) { model.scale.setScalar(ch.weaponKey.startsWith('pickaxe') ? 0.85 : 1.25); ch.root.add(model); }
}
