// Shared mutable game state. Modules import G instead of passing it around.
export const G = {
  scene: null, camera: null, renderer: null,
  tex: null, mats: null, world: null,
  actors: [], player: null, bots: [],
  loot: [], chests: [], builds: [],
  storm: null, bus: null,
  time: 0, phase: 'menu', alive: 0,
  settings: { sens: 1, quality: 'auto', volume: 0.6, fov: 80 },
  stats: { kills: 0, damage: 0, place: 0 },
};
