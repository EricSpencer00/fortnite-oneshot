// Tunables and data tables. Numbers ported from the original Rust build.

export const WORLD_SIZE = 480;
export const HALF = WORLD_SIZE / 2;
export const CELL = 4;            // build grid
export const GRAVITY = 26;
export const BOT_COUNT = 29;      // + player = 30
export const WATER_Y = 0;

export const BOT_NAMES = [
  'Raptor', 'Nomad', 'Wildcat', 'Drift', 'Hollow', 'Bonesy', 'Rook', 'Sledge', 'Vega', 'Onyx',
  'Kestrel', 'Mako', 'Fable', 'Torque', 'Ember', 'Grit', 'Pylon', 'Havoc', 'Lumen', 'Static',
  'Coil', 'Frost', 'Saber', 'Quill', 'Jinx', 'Nova', 'Brick', 'Ziggy', 'Moxie', 'Tango',
];

// ammo: which reserve pool a weapon draws from
export const WEAPONS = {
  pickaxe: { name: 'Pickaxe', damage: 20, rate: 0.45, mag: 0, reload: 0, spread: 0, adsSpread: 0, range: 3.2, auto: true, pellets: 1, zoom: 1, recoil: 0, melee: true, head: 1, ammo: null },
  ar:      { name: 'Assault Rifle', damage: 30, rate: 0.135, mag: 30, reload: 2.2, spread: 0.032, adsSpread: 0.008, range: 250, auto: true, pellets: 1, zoom: 0.72, recoil: 0.004, head: 1.5, ammo: 'medium' },
  shotgun: { name: 'Pump Shotgun', damage: 11, rate: 0.95, mag: 5, reload: 3.2, spread: 0.085, adsSpread: 0.06, range: 34, auto: false, pellets: 9, zoom: 0.85, recoil: 0.025, head: 1.6, ammo: 'shells' },
  smg:     { name: 'SMG', damage: 17, rate: 0.07, mag: 35, reload: 1.9, spread: 0.05, adsSpread: 0.025, range: 90, auto: true, pellets: 1, zoom: 0.8, recoil: 0.0025, head: 1.5, ammo: 'light' },
  sniper:  { name: 'Bolt Sniper', damage: 105, rate: 1.6, mag: 1, reload: 2.6, spread: 0.06, adsSpread: 0.0, range: 600, auto: false, pellets: 1, zoom: 0.25, recoil: 0.035, head: 2.0, scope: true, ammo: 'heavy' },
  pistol:  { name: 'Pistol', damage: 26, rate: 0.26, mag: 12, reload: 1.5, spread: 0.022, adsSpread: 0.008, range: 120, auto: false, pellets: 1, zoom: 0.8, recoil: 0.005, head: 1.5, ammo: 'light' },
};
export const LOOT_WEAPONS = ['ar', 'shotgun', 'smg', 'sniper', 'pistol'];
export const LOOT_WEIGHTS = [0.3, 0.24, 0.2, 0.08, 0.18];

export const HEALS = {
  bandage: { name: 'Bandage', time: 3.0, hp: 15, cap: 75, stack: 15, give: 5 },
  medkit:  { name: 'Med Kit', time: 7.0, hp: 100, cap: 100, stack: 3, give: 1 },
  shield:  { name: 'Shield Potion', time: 4.0, shield: 50, cap: 100, stack: 3, give: 1 },
};

export const AMMO_TYPES = ['light', 'medium', 'heavy', 'shells'];
export const AMMO_GIVE = { light: 36, medium: 30, heavy: 6, shells: 10 };

export const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
export const RARITY_MULT = [1.0, 1.1, 1.2, 1.32, 1.45];
export const RARITY_COLORS = ['#a7b0b9', '#56c05a', '#35a6ec', '#b35cf0', '#f5a033'];
export const RARITY_HEX = [0xa7b0b9, 0x56c05a, 0x35a6ec, 0xb35cf0, 0xf5a033];

export const MATS = ['wood', 'stone', 'metal'];
export const MAT_HP = [150, 300, 500];
export const MAT_COST = 10;
export const MAT_MAX = 999;

export const STORM_PHASES = [
  { wait: 50, shrink: 35, radius: 170, dps: 1 },
  { wait: 40, shrink: 30, radius: 110, dps: 2 },
  { wait: 32, shrink: 26, radius: 65, dps: 5 },
  { wait: 25, shrink: 22, radius: 34, dps: 8 },
  { wait: 20, shrink: 20, radius: 12, dps: 10 },
  { wait: 15, shrink: 25, radius: 0, dps: 14 },
];

export const POIS = [
  { name: 'Pleasant Plaza', x: -130, z: -100 },
  { name: 'Tilted Tiles', x: 0, z: 0 },
  { name: 'Salty Sands', x: 95, z: -135 },
  { name: 'Retail Rows', x: 140, z: 85 },
  { name: 'Lonely Lodge', x: -105, z: 125 },
  { name: 'Misty Meadow', x: 20, z: 150 },
  { name: 'Frenzy Farm', x: -175, z: 15 },
];

export const PLAYER = {
  walk: 6.2, sprint: 8.6, adsMul: 0.55, jump: 8.2, radius: 0.42, height: 1.8,
  maxHealth: 100, maxShield: 100,
};
