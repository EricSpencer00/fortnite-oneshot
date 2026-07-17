// Oneshot Royale — a battle royale that compiles to WebAssembly.
// Rust + macroquad, static hosting only (one .wasm + a JS loader).

use macroquad::models::Vertex;
use macroquad::prelude::*;

// ============================================================ constants
const WORLD_SIZE: f32 = 480.0;
const HALF: f32 = WORLD_SIZE / 2.0;
const CELL: f32 = 4.0;
const BOT_COUNT: usize = 23;
const GRAVITY: f32 = 24.0;

const BOT_NAMES: [&str; 24] = [
    "Raptor", "Nomad", "Wildcat", "Drift", "Hollow", "Bonesy", "Rook", "Sledge", "Vega", "Onyx",
    "Kestrel", "Mako", "Fable", "Torque", "Ember", "Grit", "Pylon", "Havoc", "Lumen", "Static",
    "Coil", "Frost", "Saber", "Quill",
];

// ============================================================ small utils
fn clampf(v: f32, a: f32, b: f32) -> f32 {
    v.max(a).min(b)
}
fn lerpf(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}
/// Framerate-independent smoothing factor.
fn damp(rate: f32, dt: f32) -> f32 {
    1.0 - (-rate * dt).exp()
}
fn rng(a: f32, b: f32) -> f32 {
    macroquad::rand::gen_range(a, b)
}
fn wrap_angle(mut a: f32) -> f32 {
    while a > std::f32::consts::PI {
        a -= std::f32::consts::TAU;
    }
    while a < -std::f32::consts::PI {
        a += std::f32::consts::TAU;
    }
    a
}

// Deterministic value noise (terrain must be identical every frame).
fn hash2(ix: i32, iz: i32) -> f32 {
    let mut h = (ix.wrapping_mul(374761393))
        .wrapping_add(iz.wrapping_mul(668265263))
        .wrapping_add(1442695040);
    h = (h ^ (h >> 13)).wrapping_mul(1274126177);
    h ^= h >> 16;
    (h as u32) as f32 / u32::MAX as f32
}
fn smoothstep(t: f32) -> f32 {
    t * t * (3.0 - 2.0 * t)
}
fn vnoise(x: f32, z: f32) -> f32 {
    let ix = x.floor() as i32;
    let iz = z.floor() as i32;
    let fx = smoothstep(x - x.floor());
    let fz = smoothstep(z - z.floor());
    let a = hash2(ix, iz);
    let b = hash2(ix + 1, iz);
    let c = hash2(ix, iz + 1);
    let d = hash2(ix + 1, iz + 1);
    lerpf(lerpf(a, b, fx), lerpf(c, d, fx), fz)
}
fn fbm(x: f32, z: f32) -> f32 {
    let mut amp = 1.0;
    let mut freq = 1.0;
    let mut sum = 0.0;
    let mut norm = 0.0;
    for _ in 0..4 {
        sum += amp * vnoise(x * freq, z * freq);
        norm += amp;
        amp *= 0.5;
        freq *= 2.0;
    }
    sum / norm
}

/// Island height — analytic, the single source of truth for physics.
fn terrain_height(x: f32, z: f32) -> f32 {
    let d = (x * x + z * z).sqrt() / HALF;
    let falloff = clampf(1.0 - d.powf(3.2), 0.0, 1.0);
    let n = fbm(x * 0.008 + 50.0, z * 0.008 + 50.0);
    (2.5 + n.powf(1.4) * 26.0) * falloff - 1.5
}

// ============================================================ geometry helpers
#[derive(Clone, Copy)]
struct Aabb {
    min: Vec3,
    max: Vec3,
}
impl Aabb {
    fn new(center: Vec3, half: Vec3) -> Self {
        Self { min: center - half, max: center + half }
    }
    fn center(&self) -> Vec3 {
        (self.min + self.max) * 0.5
    }
    fn size(&self) -> Vec3 {
        self.max - self.min
    }
}

/// Slab-method ray vs AABB. Returns entry distance.
fn ray_aabb(origin: Vec3, inv_dir: Vec3, b: &Aabb) -> Option<f32> {
    let t1 = (b.min - origin) * inv_dir;
    let t2 = (b.max - origin) * inv_dir;
    let tmin = t1.min(t2);
    let tmax = t1.max(t2);
    let enter = tmin.x.max(tmin.y).max(tmin.z);
    let exit = tmax.x.min(tmax.y).min(tmax.z);
    if exit >= enter.max(0.0) {
        Some(enter.max(0.0))
    } else {
        None
    }
}

/// Ray-march the analytic terrain.
fn ray_terrain(origin: Vec3, dir: Vec3, max_dist: f32) -> Option<f32> {
    let mut t = 0.0;
    let mut prev = origin.y - terrain_height(origin.x, origin.z);
    if prev <= 0.0 {
        return Some(0.0);
    }
    while t < max_dist {
        t += 0.8;
        let p = origin + dir * t;
        let h = p.y - terrain_height(p.x, p.z);
        if h <= 0.0 {
            // refine by bisection
            let mut lo = t - 0.8;
            let mut hi = t;
            for _ in 0..6 {
                let mid = (lo + hi) * 0.5;
                let q = origin + dir * mid;
                if q.y - terrain_height(q.x, q.z) <= 0.0 {
                    hi = mid;
                } else {
                    lo = mid;
                }
            }
            return Some(hi);
        }
        prev = h;
        // big steps high above ground
        if prev > 8.0 {
            t += prev * 0.5;
        }
    }
    None
}

// ============================================================ world
struct House {
    body: Aabb,
    color: Color,
    roof_color: Color,
}
struct HarvestNode {
    pos: Vec3,
    scale: f32,
    hp: i32,
    kind: HarvestKind,
    alive: bool,
}
#[derive(Clone, Copy, PartialEq)]
enum HarvestKind {
    Tree,
    Rock,
    Car,
}
impl HarvestKind {
    fn gives(&self) -> (usize, i32) {
        match self {
            HarvestKind::Tree => (0, 30),
            HarvestKind::Rock => (1, 25),
            HarvestKind::Car => (2, 25),
        }
    }
    fn max_hp(&self) -> i32 {
        match self {
            HarvestKind::Tree => 3,
            HarvestKind::Rock => 4,
            HarvestKind::Car => 4,
        }
    }
}
struct Chest {
    pos: Vec3,
    opened: bool,
}
struct Poi {
    pos: Vec2,
}

struct World {
    terrain_meshes: Vec<Mesh>,
    houses: Vec<House>,
    nodes: Vec<HarvestNode>,
    chests: Vec<Chest>,
    pois: Vec<Poi>,
}

impl World {
    fn new() -> Self {
        let pois = vec![
            Poi { pos: vec2(-140.0, -110.0) },
            Poi { pos: vec2(90.0, -140.0) },
            Poi { pos: vec2(150.0, 90.0) },
            Poi { pos: vec2(-110.0, 130.0) },
            Poi { pos: vec2(0.0, 0.0) },
        ];

        let mut houses = Vec::new();
        let mut chests = Vec::new();
        let mut nodes = Vec::new();

        let house_colors = [
            Color::from_rgba(201, 184, 160, 255),
            Color::from_rgba(183, 196, 204, 255),
            Color::from_rgba(211, 194, 178, 255),
            Color::from_rgba(196, 204, 183, 255),
        ];

        for poi in &pois {
            let n = 6;
            for i in 0..n {
                let a = i as f32 / n as f32 * std::f32::consts::TAU + rng(-0.3, 0.3);
                let r = rng(12.0, 34.0);
                let x = poi.pos.x + a.cos() * r;
                let z = poi.pos.y + a.sin() * r;
                let y = terrain_height(x, z);
                if y < 1.0 {
                    continue;
                }
                let w = rng(7.0, 10.0);
                let d = rng(7.0, 10.0);
                let h = rng(4.0, 5.5);
                houses.push(House {
                    body: Aabb::new(vec3(x, y + h / 2.0, z), vec3(w / 2.0, h / 2.0, d / 2.0)),
                    color: house_colors[macroquad::rand::gen_range(0, house_colors.len())],
                    roof_color: Color::from_rgba(138, 74, 58, 255),
                });
                if rng(0.0, 1.0) < 0.45 {
                    let cx = x + rng(-3.0, 3.0);
                    let cz = z + d / 2.0 + 2.5;
                    let cy = terrain_height(cx, cz);
                    if cy > 1.0 {
                        chests.push(Chest { pos: vec3(cx, cy, cz), opened: false });
                    }
                }
            }
            // cars near towns
            for _ in 0..2 {
                let x = poi.pos.x + rng(-40.0, 40.0);
                let z = poi.pos.y + rng(-40.0, 40.0);
                let y = terrain_height(x, z);
                if y > 1.0 {
                    nodes.push(HarvestNode {
                        pos: vec3(x, y, z),
                        scale: 1.0,
                        hp: HarvestKind::Car.max_hp(),
                        kind: HarvestKind::Car,
                        alive: true,
                    });
                }
            }
            for _ in 0..2 {
                let x = poi.pos.x + rng(-25.0, 25.0);
                let z = poi.pos.y + rng(-25.0, 25.0);
                let y = terrain_height(x, z);
                if y > 1.0 {
                    chests.push(Chest { pos: vec3(x, y, z), opened: false });
                }
            }
        }

        // scatter trees + rocks away from POIs
        for _ in 0..170 {
            let x = rng(-HALF + 15.0, HALF - 15.0);
            let z = rng(-HALF + 15.0, HALF - 15.0);
            let y = terrain_height(x, z);
            if y < 1.2 || pois.iter().any(|p| (p.pos - vec2(x, z)).length() < 26.0) {
                continue;
            }
            nodes.push(HarvestNode {
                pos: vec3(x, y, z),
                scale: rng(0.8, 1.5),
                hp: HarvestKind::Tree.max_hp(),
                kind: HarvestKind::Tree,
                alive: true,
            });
        }
        for _ in 0..60 {
            let x = rng(-HALF + 15.0, HALF - 15.0);
            let z = rng(-HALF + 15.0, HALF - 15.0);
            let y = terrain_height(x, z);
            if y < 1.2 {
                continue;
            }
            nodes.push(HarvestNode {
                pos: vec3(x, y, z),
                scale: rng(0.8, 2.0),
                hp: HarvestKind::Rock.max_hp(),
                kind: HarvestKind::Rock,
                alive: true,
            });
        }

        World {
            terrain_meshes: build_terrain_meshes(),
            houses,
            nodes,
            chests,
            pois,
        }
    }

    fn node_aabb(n: &HarvestNode) -> Aabb {
        match n.kind {
            HarvestKind::Tree => Aabb::new(n.pos + vec3(0.0, 4.0 * n.scale, 0.0), vec3(1.6 * n.scale, 4.0 * n.scale, 1.6 * n.scale)),
            HarvestKind::Rock => Aabb::new(n.pos + vec3(0.0, 0.9 * n.scale, 0.0), Vec3::splat(1.1 * n.scale)),
            HarvestKind::Car => Aabb::new(n.pos + vec3(0.0, 1.1, 0.0), vec3(2.1, 1.1, 1.1)),
        }
    }
}

/// Terrain rendered as a grid of vertex-colored meshes (u16 index limit → chunks).
fn build_terrain_meshes() -> Vec<Mesh> {
    let mut meshes = Vec::new();
    let chunks = 4; // 4x4 chunks
    let span = WORLD_SIZE * 1.35;
    let seg_per_chunk = 26;
    let chunk_span = span / chunks as f32;

    for cz in 0..chunks {
        for cx in 0..chunks {
            let ox = -span / 2.0 + cx as f32 * chunk_span;
            let oz = -span / 2.0 + cz as f32 * chunk_span;
            let n = seg_per_chunk + 1;
            let mut vertices = Vec::with_capacity(n * n);
            let mut indices: Vec<u16> = Vec::with_capacity(seg_per_chunk * seg_per_chunk * 6);

            for iz in 0..n {
                for ix in 0..n {
                    let x = ox + ix as f32 / seg_per_chunk as f32 * chunk_span;
                    let z = oz + iz as f32 / seg_per_chunk as f32 * chunk_span;
                    let h = terrain_height(x, z);
                    // slope-based fake lighting
                    let e = 1.5;
                    let hx = terrain_height(x + e, z) - terrain_height(x - e, z);
                    let hz = terrain_height(x, z + e) - terrain_height(x, z - e);
                    let normal = vec3(-hx, 2.0 * e, -hz).normalize();
                    let light = clampf(normal.dot(vec3(0.35, 0.85, 0.4).normalize()), 0.0, 1.0) * 0.55 + 0.45;

                    let tint = vnoise(x * 0.05, z * 0.05);
                    let (r, g, b) = if h < 0.6 {
                        (0.85, 0.79, 0.54)
                    } else if h > 16.0 {
                        (0.54, 0.56, 0.59)
                    } else {
                        let gr = 0.31 + tint * 0.12;
                        (0.25 + tint * 0.10, 0.55 + gr * 0.15, 0.25)
                    };
                    let c = Color::new(r * light, g * light, b * light, 1.0);
                    vertices.push(Vertex::new(x, h, z, 0.0, 0.0, c));
                }
            }
            for iz in 0..seg_per_chunk {
                for ix in 0..seg_per_chunk {
                    let i = (iz * n + ix) as u16;
                    let nn = n as u16;
                    indices.extend_from_slice(&[i, i + 1, i + nn, i + 1, i + nn + 1, i + nn]);
                }
            }
            meshes.push(Mesh { vertices, indices, texture: None });
        }
    }
    meshes
}

// ============================================================ weapons
#[derive(Clone, Copy, PartialEq, Debug)]
enum WType {
    Pickaxe,
    Ar,
    Shotgun,
    Smg,
    Sniper,
    Pistol,
}
const LOOT_WEAPONS: [WType; 5] = [WType::Ar, WType::Shotgun, WType::Smg, WType::Sniper, WType::Pistol];

struct WCfg {
    name: &'static str,
    damage: f32,
    fire_rate: f32, // seconds between shots
    mag: i32,
    reload: f32,
    spread: f32,
    ads_spread: f32,
    range: f32,
    auto: bool,
    pellets: i32,
    ads_zoom: f32, // fov multiplier
    recoil: f32,
    scope: bool,
    melee: bool,
    headshot: f32,
}
fn wcfg(t: WType) -> WCfg {
    match t {
        WType::Pickaxe => WCfg { name: "Pickaxe", damage: 20.0, fire_rate: 0.45, mag: 0, reload: 0.0, spread: 0.0, ads_spread: 0.0, range: 3.5, auto: true, pellets: 1, ads_zoom: 1.0, recoil: 0.0, scope: false, melee: true, headshot: 1.0 },
        WType::Ar => WCfg { name: "Assault Rifle", damage: 30.0, fire_rate: 0.135, mag: 30, reload: 2.2, spread: 0.025, ads_spread: 0.007, range: 250.0, auto: true, pellets: 1, ads_zoom: 0.72, recoil: 0.0035, scope: false, melee: false, headshot: 1.5 },
        WType::Shotgun => WCfg { name: "Pump Shotgun", damage: 90.0, fire_rate: 0.95, mag: 5, reload: 3.2, spread: 0.09, ads_spread: 0.06, range: 32.0, auto: false, pellets: 9, ads_zoom: 0.85, recoil: 0.02, scope: false, melee: false, headshot: 1.5 },
        WType::Smg => WCfg { name: "SMG", damage: 17.0, fire_rate: 0.065, mag: 35, reload: 1.9, spread: 0.045, ads_spread: 0.02, range: 90.0, auto: true, pellets: 1, ads_zoom: 0.8, recoil: 0.002, scope: false, melee: false, headshot: 1.5 },
        WType::Sniper => WCfg { name: "Bolt Sniper", damage: 105.0, fire_rate: 1.7, mag: 1, reload: 2.8, spread: 0.04, ads_spread: 0.0, range: 500.0, auto: false, pellets: 1, ads_zoom: 0.28, recoil: 0.03, scope: true, melee: false, headshot: 2.0 },
        WType::Pistol => WCfg { name: "Pistol", damage: 26.0, fire_rate: 0.28, mag: 12, reload: 1.6, spread: 0.02, ads_spread: 0.008, range: 120.0, auto: false, pellets: 1, ads_zoom: 0.8, recoil: 0.004, scope: false, melee: false, headshot: 1.5 },
    }
}

const RARITY_NAMES: [&str; 5] = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
const RARITY_MULT: [f32; 5] = [1.0, 1.1, 1.2, 1.32, 1.45];
fn rarity_color(r: usize) -> Color {
    match r {
        0 => Color::from_rgba(157, 165, 173, 255),
        1 => Color::from_rgba(76, 175, 80, 255),
        2 => Color::from_rgba(47, 159, 224, 255),
        3 => Color::from_rgba(164, 77, 224, 255),
        _ => Color::from_rgba(232, 145, 47, 255),
    }
}
fn roll_rarity(luck: f32) -> usize {
    let r = rng(0.0, 1.0) + luck;
    if r > 0.97 { 4 } else if r > 0.88 { 3 } else if r > 0.70 { 2 } else if r > 0.45 { 1 } else { 0 }
}

#[derive(Clone)]
struct Weapon {
    t: WType,
    rarity: usize,
    ammo: i32,
    reserve: i32,
    last_fire: f64,
    reloading: bool,
    reload_start: f64,
}
impl Weapon {
    fn new(t: WType, rarity: usize) -> Self {
        let cfg = wcfg(t);
        Weapon { t, rarity, ammo: cfg.mag, reserve: cfg.mag * 4, last_fire: -10.0, reloading: false, reload_start: 0.0 }
    }
    fn cfg(&self) -> WCfg {
        wcfg(self.t)
    }
    fn damage(&self) -> f32 {
        (self.cfg().damage * RARITY_MULT[self.rarity]).round()
    }
    fn can_fire(&self, t: f64) -> bool {
        let cfg = self.cfg();
        !self.reloading && (cfg.melee || self.ammo > 0) && t - self.last_fire >= cfg.fire_rate as f64
    }
    fn start_reload(&mut self, t: f64) {
        let cfg = self.cfg();
        if self.reloading || cfg.melee || self.reserve <= 0 || self.ammo == cfg.mag {
            return;
        }
        self.reloading = true;
        self.reload_start = t;
    }
    fn update(&mut self, t: f64) {
        let cfg = self.cfg();
        if self.reloading && t - self.reload_start >= cfg.reload as f64 {
            let take = (cfg.mag - self.ammo).min(self.reserve);
            self.ammo += take;
            self.reserve -= take;
            self.reloading = false;
        }
    }
}

// ============================================================ building
#[derive(Clone, Copy, PartialEq)]
enum Piece {
    Wall,
    Floor,
    Ramp,
    Roof,
}
const PIECES: [Piece; 4] = [Piece::Wall, Piece::Floor, Piece::Ramp, Piece::Roof];
fn piece_name(p: Piece) -> &'static str {
    match p {
        Piece::Wall => "Wall",
        Piece::Floor => "Floor",
        Piece::Ramp => "Ramp",
        Piece::Roof => "Roof",
    }
}
const MAT_NAMES: [&str; 3] = ["Wood", "Stone", "Metal"];
const MAT_HP: [f32; 3] = [150.0, 300.0, 500.0];
const MAT_COST: i32 = 10;
fn mat_color(m: usize) -> Color {
    match m {
        0 => Color::from_rgba(154, 107, 63, 255),
        1 => Color::from_rgba(138, 143, 150, 255),
        _ => Color::from_rgba(159, 178, 196, 255),
    }
}

struct Build {
    piece: Piece,
    /// grid cell center (x, z) and base height y
    pos: Vec3,
    /// facing, quarter-turns (0..4): forward = (sin, cos) of yaw
    yaw: f32,
    mat: usize,
    hp: f32,
    alive: bool,
}
impl Build {
    fn aabb(&self) -> Aabb {
        match self.piece {
            Piece::Wall => {
                let fwd = vec3(self.yaw.sin(), 0.0, self.yaw.cos());
                let center = self.pos + vec3(0.0, CELL / 2.0, 0.0) - fwd * (CELL / 2.0);
                let half = if fwd.x.abs() > 0.5 {
                    vec3(0.15, CELL / 2.0, CELL / 2.0)
                } else {
                    vec3(CELL / 2.0, CELL / 2.0, 0.15)
                };
                Aabb::new(center, half)
            }
            Piece::Floor => Aabb::new(self.pos + vec3(0.0, 0.12, 0.0), vec3(CELL / 2.0, 0.15, CELL / 2.0)),
            Piece::Ramp => Aabb::new(self.pos + vec3(0.0, CELL / 2.0, 0.0), vec3(CELL / 2.0, CELL / 2.0, CELL / 2.0)),
            Piece::Roof => Aabb::new(self.pos + vec3(0.0, CELL + 0.6, 0.0), vec3(CELL / 2.0, 0.7, CELL / 2.0)),
        }
    }
    /// Walkable height at (x,z) if this piece supports standing there.
    fn floor_height(&self, x: f32, z: f32) -> Option<f32> {
        let dx = x - self.pos.x;
        let dz = z - self.pos.z;
        if dx.abs() > CELL / 2.0 || dz.abs() > CELL / 2.0 || !self.alive {
            return None;
        }
        match self.piece {
            Piece::Floor => Some(self.pos.y + 0.27),
            Piece::Roof => Some(self.pos.y + CELL + 1.3),
            Piece::Ramp => {
                // rises along facing direction
                let fwd = vec2(self.yaw.sin(), self.yaw.cos());
                let along = vec2(dx, dz).dot(fwd) / CELL + 0.5; // 0..1
                Some(self.pos.y + clampf(along, 0.0, 1.0) * CELL)
            }
            Piece::Wall => None,
        }
    }
}

// ============================================================ storm
struct StormPhase {
    wait: f32,
    shrink: f32,
    radius: f32,
    dps: f32,
}
const STORM_PHASES: [StormPhase; 6] = [
    StormPhase { wait: 35.0, shrink: 30.0, radius: 190.0, dps: 1.0 },
    StormPhase { wait: 30.0, shrink: 28.0, radius: 130.0, dps: 2.0 },
    StormPhase { wait: 25.0, shrink: 25.0, radius: 80.0, dps: 4.0 },
    StormPhase { wait: 20.0, shrink: 22.0, radius: 42.0, dps: 6.0 },
    StormPhase { wait: 18.0, shrink: 20.0, radius: 14.0, dps: 8.0 },
    StormPhase { wait: 15.0, shrink: 30.0, radius: 2.0, dps: 10.0 },
];

struct Storm {
    center: Vec2,
    radius: f32,
    phase: usize,
    timer: f32,
    shrinking: bool,
    start_center: Vec2,
    target_center: Vec2,
    start_radius: f32,
    dps: f32,
}
impl Storm {
    fn new() -> Self {
        let mut s = Storm {
            center: vec2(0.0, 0.0),
            radius: WORLD_SIZE * 0.75,
            phase: 0,
            timer: STORM_PHASES[0].wait,
            shrinking: false,
            start_center: vec2(0.0, 0.0),
            target_center: vec2(0.0, 0.0),
            start_radius: WORLD_SIZE * 0.75,
            dps: STORM_PHASES[0].dps,
        };
        s.pick_next(STORM_PHASES[0].radius);
        s
    }
    fn pick_next(&mut self, next_radius: f32) {
        let max_off = ((self.radius - next_radius).max(0.0)) * 0.8;
        let a = rng(0.0, std::f32::consts::TAU);
        let r = rng(0.0, max_off);
        self.target_center = self.center + vec2(a.cos(), a.sin()) * r;
        self.start_center = self.center;
        self.start_radius = self.radius;
    }
    fn update(&mut self, dt: f32) {
        if self.phase >= STORM_PHASES.len() {
            return;
        }
        let p = &STORM_PHASES[self.phase];
        self.timer -= dt;
        if self.shrinking {
            let t = clampf(1.0 - self.timer / p.shrink, 0.0, 1.0);
            self.radius = lerpf(self.start_radius, p.radius, t);
            self.center = self.start_center.lerp(self.target_center, t);
            if self.timer <= 0.0 {
                self.shrinking = false;
                self.phase += 1;
                if self.phase < STORM_PHASES.len() {
                    self.timer = STORM_PHASES[self.phase].wait;
                    self.dps = STORM_PHASES[self.phase].dps;
                    let r = STORM_PHASES[self.phase].radius;
                    self.pick_next(r);
                }
            }
        } else if self.timer <= 0.0 {
            self.shrinking = true;
            self.timer = p.shrink;
        }
    }
    fn outside(&self, p: Vec3) -> bool {
        (vec2(p.x, p.z) - self.center).length() > self.radius
    }
}

// ============================================================ loot
#[derive(Clone)]
enum LootKind {
    Gun(Weapon),
    Ammo(i32),
    Medkit,
    Minis,
    BigPot,
}
struct Loot {
    pos: Vec3,
    kind: LootKind,
}
fn loot_label(l: &LootKind) -> String {
    match l {
        LootKind::Gun(w) => format!("{} {}", RARITY_NAMES[w.rarity], w.cfg().name),
        LootKind::Ammo(n) => format!("Ammo x{}", n),
        LootKind::Medkit => "Medkit".into(),
        LootKind::Minis => "Mini Shield".into(),
        LootKind::BigPot => "Shield Potion".into(),
    }
}
fn random_loot() -> LootKind {
    let r = rng(0.0, 1.0);
    if r < 0.5 {
        LootKind::Gun(Weapon::new(LOOT_WEAPONS[macroquad::rand::gen_range(0, 5)], roll_rarity(0.0)))
    } else if r < 0.7 {
        LootKind::Ammo(macroquad::rand::gen_range(20, 41))
    } else if r < 0.82 {
        LootKind::Medkit
    } else if r < 0.94 {
        LootKind::Minis
    } else {
        LootKind::BigPot
    }
}

// ============================================================ bots
#[derive(Clone, Copy, PartialEq)]
enum BotState {
    Drop,
    Roam,
    Engage,
}
struct Bot {
    name: &'static str,
    pos: Vec3,
    yaw: f32,
    health: f32,
    shield: f32,
    alive: bool,
    state: BotState,
    weapon: Weapon,
    accuracy: f32,
    reaction_until: f64,
    move_speed: f32,
    wander_target: Vec2,
    next_wander: f64,
    walk_phase: f32,
    color: Color,
}
impl Bot {
    fn body_aabb(&self) -> Aabb {
        Aabb::new(self.pos + vec3(0.0, 0.95, 0.0), vec3(0.45, 0.95, 0.45))
    }
    fn head_aabb(&self) -> Aabb {
        Aabb::new(self.pos + vec3(0.0, 1.68, 0.0), Vec3::splat(0.24))
    }
    fn take_damage(&mut self, mut amount: f32) {
        if self.shield > 0.0 {
            let s = self.shield.min(amount);
            self.shield -= s;
            amount -= s;
        }
        self.health -= amount;
        if self.health <= 0.0 {
            self.alive = false;
        }
    }
}

// ============================================================ fx / hud items
struct Tracer {
    from: Vec3,
    to: Vec3,
    life: f32,
    color: Color,
}
struct Impact {
    pos: Vec3,
    life: f32,
    flesh: bool,
}
struct DmgNum {
    text: String,
    life: f32,
    off: Vec2,
    head: bool,
}
struct FeedEntry {
    text: String,
    life: f32,
}
/// Lightweight 3D spark/debris particle. Cheap: a tiny fading cube.
struct Particle {
    pos: Vec3,
    vel: Vec3,
    life: f32,
    max_life: f32,
    size: f32,
    color: Color,
    gravity: f32,
}
/// Screen-space arrow marking the direction a recent hit came from.
struct DamageDir {
    dir: Vec2, // world XZ direction from player to attacker
    life: f32,
}

// ============================================================ player
struct Player {
    pos: Vec3,
    vel: Vec3,
    health: f32,
    shield: f32,
    alive: bool,
    grounded: bool,
    mats: [i32; 3],
    slots: [Option<Weapon>; 5],
    slot: usize,
    kills: i32,
    walk_phase: f32,
    body_yaw: f32,
}
impl Player {
    fn new() -> Self {
        Player {
            pos: vec3(0.0, 120.0, 0.0),
            vel: Vec3::ZERO,
            health: 100.0,
            shield: 0.0,
            alive: true,
            grounded: false,
            mats: [100, 50, 20],
            slots: [Some(Weapon::new(WType::Pickaxe, 0)), None, None, None, None],
            slot: 0,
            kills: 0,
            walk_phase: 0.0,
            body_yaw: 0.0,
        }
    }
    fn weapon(&self) -> &Weapon {
        self.slots[self.slot].as_ref().unwrap()
    }
    fn weapon_mut(&mut self) -> &mut Weapon {
        self.slots[self.slot].as_mut().unwrap()
    }
    fn add_weapon(&mut self, w: Weapon) {
        for i in 1..5 {
            if self.slots[i].is_none() {
                self.slots[i] = Some(w);
                if self.slot == 0 {
                    self.slot = i;
                }
                return;
            }
        }
        let i = if self.slot == 0 { 1 } else { self.slot };
        self.slots[i] = Some(w);
        self.slot = i;
    }
    fn add_ammo(&mut self, n: i32) {
        for s in self.slots.iter_mut().flatten() {
            if !s.cfg().melee {
                s.reserve += n;
            }
        }
    }
    fn take_damage(&mut self, mut amount: f32) {
        if !self.alive {
            return;
        }
        if self.shield > 0.0 {
            let s = self.shield.min(amount);
            self.shield -= s;
            amount -= s;
        }
        self.health -= amount;
        if self.health <= 0.0 {
            self.health = 0.0;
            self.alive = false;
        }
    }
}

// ============================================================ camera
struct Cam {
    yaw: f32,
    pitch: f32,
    pos: Vec3,
    fov: f32,
    aiming: bool,
    recoil: f32,
    offset: Vec3, // current interp offset in camera space
    last_mouse: Vec2,
    trauma: f32,     // 0..1 screen-shake energy, decays every frame
    shake_off: Vec3, // per-frame positional jitter derived from trauma
    fov_kick: f32,   // transient additive fov punch (firing / sprinting)
}
const HIP_OFFSET: Vec3 = vec3(0.9, 1.9, -3.8); // camera-space: -z is behind player? we define forward below
const ADS_OFFSET: Vec3 = vec3(0.75, 1.7, -1.9);
impl Cam {
    fn new() -> Self {
        Cam { yaw: 0.0, pitch: -0.15, pos: Vec3::ZERO, fov: 1.15, aiming: false, recoil: 0.0, offset: HIP_OFFSET, last_mouse: Vec2::ZERO, trauma: 0.0, shake_off: Vec3::ZERO, fov_kick: 0.0 }
    }
    /// Add screen-shake energy (clamped). Bigger events pass bigger amounts.
    fn add_trauma(&mut self, amt: f32) {
        self.trauma = clampf(self.trauma + amt, 0.0, 1.0);
    }
    fn forward(&self) -> Vec3 {
        vec3(self.yaw.sin() * self.pitch.cos(), self.pitch.sin(), self.yaw.cos() * self.pitch.cos())
    }
    fn forward_flat(&self) -> Vec3 {
        vec3(self.yaw.sin(), 0.0, self.yaw.cos())
    }
    fn right_flat(&self) -> Vec3 {
        vec3(self.yaw.cos(), 0.0, -self.yaw.sin())
    }
    fn look(&mut self, dx: f32, dy: f32) {
        let sens = 0.0023 * if self.aiming { 0.55 } else { 1.0 };
        self.yaw -= dx * sens;
        self.pitch -= dy * sens;
        self.pitch = clampf(self.pitch, -1.35, 1.35);
    }
    /// Position camera behind the head with collision, return look target.
    fn update(&mut self, dt: f32, target: Vec3, game_colliders: &[Aabb], target_fov: f32) {
        self.pitch += self.recoil * damp(30.0, dt);
        self.recoil *= 1.0 - damp(12.0, dt);
        self.fov = lerpf(self.fov, target_fov, damp(10.0, dt));
        self.fov_kick *= 1.0 - damp(9.0, dt);

        // trauma^2 shake so small hits are subtle and big ones snap hard
        self.trauma = (self.trauma - dt * 1.6).max(0.0);
        let s = self.trauma * self.trauma;
        self.shake_off = vec3(rng(-1.0, 1.0), rng(-1.0, 1.0), rng(-1.0, 1.0)) * s * 0.35;

        let want = if self.aiming { ADS_OFFSET } else { HIP_OFFSET };
        self.offset = self.offset.lerp(want, damp(12.0, dt));

        let head = target + vec3(0.0, 1.5, 0.0);
        // offset: x=right, y=up, z=forward(+ = in front)
        let fwd = self.forward();
        let right = self.right_flat();
        let up = vec3(0.0, 1.0, 0.0);
        let desired = head + right * self.offset.x + up * (self.offset.y - 1.5) + fwd * self.offset.z;

        // pull in if blocked
        let dir = (desired - head).normalize_or_zero();
        let dist = (desired - head).length();
        let mut best = dist;
        if dir.length_squared() > 0.0 {
            let inv = Vec3::ONE / dir;
            for b in game_colliders {
                if let Some(t) = ray_aabb(head, inv, b) {
                    if t < best {
                        best = (t - 0.3).max(0.3);
                    }
                }
            }
            if let Some(t) = ray_terrain(head, dir, dist) {
                if t < best {
                    best = (t - 0.3).max(0.3);
                }
            }
        }
        let goal = head + dir * best;
        self.pos = self.pos.lerp(goal, damp(25.0, dt));
    }
    fn camera3d(&self) -> Camera3D {
        Camera3D {
            position: self.pos + self.shake_off,
            target: self.pos + self.shake_off + self.forward(),
            up: vec3(0.0, 1.0, 0.0),
            fovy: self.fov + self.fov_kick,
            ..Default::default()
        }
    }
    fn mouse_delta(&mut self) -> Vec2 {
        let (mx, my) = mouse_position();
        let m = vec2(mx, my);
        let d = m - self.last_mouse;
        self.last_mouse = m;
        d
    }
}

// ============================================================ input snapshot
/// One frame of player intent, gathered from the OS once per frame in `main`.
/// Keeping the raw device polling out of the update logic makes movement,
/// building, and weapon handling pure and unit-testable (see `mod tests`).
#[derive(Default, Clone, Copy)]
struct Input {
    move_x: f32,        // A = -1, D = +1
    move_y: f32,        // S = -1, W = +1
    sprint: bool,       // LeftShift held
    jump: bool,         // Space pressed this frame (edge)
    look: Vec2,         // mouse delta this frame
    fire_down: bool,    // LMB held
    fire_pressed: bool, // LMB pressed this frame (edge)
    aim: bool,          // RMB held
    alt_pressed: bool,  // RMB pressed this frame (edge) — cycle material in build
    r: bool,            // R pressed (edge): reload in combat, rotate in build
    q: bool,            // Q pressed (edge): toggle build mode
    num: [bool; 5],     // number keys 1-5 (edge): weapon slots / build pieces
    zxcv: [bool; 4],    // Z X C V (edge): build-piece shortcuts
}

/// Poll the OS for this frame's intent. Not called in tests (no GL context);
/// tests build `Input` values directly.
fn read_input() -> Input {
    let mut i = Input::default();
    if is_key_down(KeyCode::D) { i.move_x += 1.0; }
    if is_key_down(KeyCode::A) { i.move_x -= 1.0; }
    if is_key_down(KeyCode::W) { i.move_y += 1.0; }
    if is_key_down(KeyCode::S) { i.move_y -= 1.0; }
    i.sprint = is_key_down(KeyCode::LeftShift);
    i.jump = is_key_pressed(KeyCode::Space);
    i.fire_down = is_mouse_button_down(MouseButton::Left);
    i.fire_pressed = is_mouse_button_pressed(MouseButton::Left);
    i.aim = is_mouse_button_down(MouseButton::Right);
    i.alt_pressed = is_mouse_button_pressed(MouseButton::Right);
    i.r = is_key_pressed(KeyCode::R);
    i.q = is_key_pressed(KeyCode::Q);
    let nums = [KeyCode::Key1, KeyCode::Key2, KeyCode::Key3, KeyCode::Key4, KeyCode::Key5];
    for (n, k) in nums.iter().enumerate() { i.num[n] = is_key_pressed(*k); }
    let alt = [KeyCode::Z, KeyCode::X, KeyCode::C, KeyCode::V];
    for (n, k) in alt.iter().enumerate() { i.zxcv[n] = is_key_pressed(*k); }
    i
}

// ============================================================ game phases
#[derive(PartialEq, Clone, Copy)]
enum Phase {
    Menu,
    Bus,
    Skydive,
    Glide,
    Playing,
    Ended { victory: bool },
}

struct Game {
    phase: Phase,
    world: World,
    cam: Cam,
    player: Player,
    bots: Vec<Bot>,
    builds: Vec<Build>,
    loot: Vec<Loot>,
    storm: Storm,
    // battle bus
    bus_start: Vec3,
    bus_end: Vec3,
    bus_t: f32,
    // building mode
    build_mode: bool,
    piece_idx: usize,
    mat_idx: usize,
    build_rot: usize,
    // fx + hud
    tracers: Vec<Tracer>,
    impacts: Vec<Impact>,
    particles: Vec<Particle>,
    dmg_nums: Vec<DmgNum>,
    feed: Vec<FeedEntry>,
    notify: (String, f32),
    hitmarker: f32,
    hit_head: bool,
    hit_flash: f32,     // white pop when you land a hit
    elim_flash: f32,    // gold flash on elimination
    dmg_flash: f32,     // red flash + shake when you take damage
    dmg_dirs: Vec<DamageDir>,
    muzzle_flash: f32,
    muzzle_pos: Vec3,
    cross_spread: f32,
    match_time: f64,
    grabbed: bool,
}

impl Game {
    fn new() -> Self {
        macroquad::rand::srand(macroquad::miniquad::date::now() as u64);
        Game {
            phase: Phase::Menu,
            world: World::new(),
            cam: Cam::new(),
            player: Player::new(),
            bots: Vec::new(),
            builds: Vec::new(),
            loot: Vec::new(),
            storm: Storm::new(),
            bus_start: Vec3::ZERO,
            bus_end: Vec3::ZERO,
            bus_t: 0.0,
            build_mode: false,
            piece_idx: 0,
            mat_idx: 0,
            build_rot: 0,
            tracers: Vec::new(),
            impacts: Vec::new(),
            particles: Vec::new(),
            dmg_nums: Vec::new(),
            feed: Vec::new(),
            notify: (String::new(), 0.0),
            hitmarker: 0.0,
            hit_head: false,
            hit_flash: 0.0,
            elim_flash: 0.0,
            dmg_flash: 0.0,
            dmg_dirs: Vec::new(),
            muzzle_flash: 0.0,
            muzzle_pos: Vec3::ZERO,
            cross_spread: 8.0,
            match_time: 0.0,
            grabbed: false,
        }
    }

    /// Spawn a burst of particles fanning out from `pos`.
    fn burst(&mut self, pos: Vec3, base: Color, count: usize, speed: f32, up_bias: f32, size: f32, gravity: f32, life: f32) {
        if self.particles.len() > 700 {
            return; // hard cap so long fights don't pile up
        }
        for _ in 0..count {
            let dir = vec3(rng(-1.0, 1.0), rng(-1.0, 1.0) + up_bias, rng(-1.0, 1.0)).normalize_or_zero();
            let v = rng(0.4, 1.0);
            let jitter = 0.85 + rng(0.0, 0.3);
            self.particles.push(Particle {
                pos,
                vel: dir * speed * v,
                life: life * jitter,
                max_life: life * jitter,
                size: size * (0.7 + rng(0.0, 0.6)),
                color: base,
                gravity,
            });
        }
    }

    fn start_match(&mut self) {
        self.player = Player::new();
        self.builds.clear();
        self.loot.clear();
        self.tracers.clear();
        self.impacts.clear();
        self.particles.clear();
        self.dmg_nums.clear();
        self.dmg_dirs.clear();
        self.feed.clear();
        self.muzzle_flash = 0.0;
        self.hit_flash = 0.0;
        self.elim_flash = 0.0;
        self.dmg_flash = 0.0;
        self.cam.trauma = 0.0;
        self.cam.fov_kick = 0.0;
        self.storm = Storm::new();
        self.build_mode = false;
        self.match_time = 0.0;
        for c in self.world.chests.iter_mut() {
            c.opened = false;
        }
        for n in self.world.nodes.iter_mut() {
            n.alive = true;
            n.hp = n.kind.max_hp();
        }

        // bus path across the island
        let a = rng(0.0, std::f32::consts::TAU);
        let r = WORLD_SIZE * 0.62;
        self.bus_start = vec3(a.cos() * r, 115.0, a.sin() * r);
        self.bus_end = -self.bus_start + vec3(0.0, 230.0, 0.0);
        self.bus_t = 0.0;

        // bots drop near POIs
        self.bots.clear();
        for i in 0..BOT_COUNT {
            let poi = &self.world.pois[macroquad::rand::gen_range(0, self.world.pois.len())];
            let colors = [RED, GREEN, ORANGE, PURPLE, SKYBLUE, PINK, LIME];
            self.bots.push(Bot {
                name: BOT_NAMES[i % BOT_NAMES.len()],
                pos: vec3(poi.pos.x + rng(-30.0, 30.0), rng(80.0, 140.0), poi.pos.y + rng(-30.0, 30.0)),
                yaw: rng(0.0, std::f32::consts::TAU),
                health: 100.0,
                shield: (macroquad::rand::gen_range(0, 3) * 25) as f32,
                alive: true,
                state: BotState::Drop,
                weapon: Weapon::new(LOOT_WEAPONS[macroquad::rand::gen_range(0, 5)], roll_rarity(0.0)),
                accuracy: rng(0.05, 0.13),
                reaction_until: 0.0,
                move_speed: rng(5.0, 6.5),
                wander_target: vec2(0.0, 0.0),
                next_wander: 0.0,
                walk_phase: rng(0.0, 6.0),
                color: colors[macroquad::rand::gen_range(0, colors.len())],
            });
        }

        // floor loot around POIs
        for _ in 0..60 {
            let poi = &self.world.pois[macroquad::rand::gen_range(0, self.world.pois.len())];
            let x = poi.pos.x + rng(-35.0, 35.0);
            let z = poi.pos.y + rng(-35.0, 35.0);
            let y = terrain_height(x, z);
            if y > 1.0 {
                self.loot.push(Loot { pos: vec3(x, y, z), kind: random_loot() });
            }
        }

        self.phase = Phase::Bus;
    }

    /// AABBs bullets/camera collide with (houses + builds + harvest nodes).
    fn static_colliders(&self) -> Vec<Aabb> {
        let mut v: Vec<Aabb> = self.world.houses.iter().map(|h| h.body).collect();
        v.extend(self.builds.iter().filter(|b| b.alive).map(|b| b.aabb()));
        v.extend(self.world.nodes.iter().filter(|n| n.alive).map(World::node_aabb));
        v
    }

    /// Floor height under (x,z) considering terrain, houses, builds.
    fn floor_at(&self, x: f32, z: f32, feet_y: f32) -> f32 {
        let mut floor = terrain_height(x, z);
        for h in &self.world.houses {
            if x > h.body.min.x && x < h.body.max.x && z > h.body.min.z && z < h.body.max.z {
                let top = h.body.max.y;
                if top > floor && top <= feet_y + 0.6 {
                    floor = top;
                }
            }
        }
        for b in &self.builds {
            if let Some(hh) = b.floor_height(x, z) {
                if hh > floor && hh <= feet_y + 0.9 {
                    floor = hh;
                }
            }
        }
        floor
    }

    fn notify(&mut self, msg: impl Into<String>) {
        self.notify = (msg.into(), 1.8);
    }

    fn feed(&mut self, text: String) {
        self.feed.insert(0, FeedEntry { text, life: 6.0 });
        self.feed.truncate(5);
    }
}

// ============================================================ shooting
enum HitKind {
    Nothing,
    WorldHit(Vec3),
    BotHit { idx: usize, point: Vec3, head: bool },
    BuildHit { idx: usize, point: Vec3 },
    NodeHit { idx: usize, point: Vec3 },
}

impl Game {
    /// Cast one bullet ray against everything. `skip_player` excludes the player body.
    fn cast_shot(&self, origin: Vec3, dir: Vec3, range: f32, hit_player: bool) -> (HitKind, f32) {
        let inv = Vec3::ONE / dir;
        let mut best_t = range;
        let mut best = HitKind::Nothing;

        if let Some(t) = ray_terrain(origin, dir, range) {
            if t < best_t {
                best_t = t;
                best = HitKind::WorldHit(origin + dir * t);
            }
        }
        for h in &self.world.houses {
            if let Some(t) = ray_aabb(origin, inv, &h.body) {
                if t < best_t {
                    best_t = t;
                    best = HitKind::WorldHit(origin + dir * t);
                }
            }
        }
        for (i, b) in self.builds.iter().enumerate() {
            if !b.alive {
                continue;
            }
            if let Some(t) = ray_aabb(origin, inv, &b.aabb()) {
                if t < best_t {
                    best_t = t;
                    best = HitKind::BuildHit { idx: i, point: origin + dir * t };
                }
            }
        }
        for (i, n) in self.world.nodes.iter().enumerate() {
            if !n.alive {
                continue;
            }
            if let Some(t) = ray_aabb(origin, inv, &World::node_aabb(n)) {
                if t < best_t {
                    best_t = t;
                    best = HitKind::NodeHit { idx: i, point: origin + dir * t };
                }
            }
        }
        if !hit_player {
            for (i, bot) in self.bots.iter().enumerate() {
                if !bot.alive {
                    continue;
                }
                // head first
                if let Some(t) = ray_aabb(origin, inv, &bot.head_aabb()) {
                    if t < best_t {
                        best_t = t;
                        best = HitKind::BotHit { idx: i, point: origin + dir * t, head: true };
                        continue;
                    }
                }
                if let Some(t) = ray_aabb(origin, inv, &bot.body_aabb()) {
                    if t < best_t {
                        best_t = t;
                        best = HitKind::BotHit { idx: i, point: origin + dir * t, head: false };
                    }
                }
            }
        } else {
            // bot shooting: test the player capsule as AABB
            let pb = Aabb::new(self.player.pos + vec3(0.0, 0.95, 0.0), vec3(0.45, 0.95, 0.45));
            if let Some(t) = ray_aabb(origin, inv, &pb) {
                if t < best_t {
                    best_t = t;
                    best = HitKind::BotHit { idx: usize::MAX, point: origin + dir * t, head: false };
                }
            }
        }
        (best, best_t)
    }

    fn player_fire(&mut self, t: f64, aiming: bool) {
        let cfg = self.player.weapon().cfg();
        if !self.player.weapon().can_fire(t) {
            if self.player.weapon().ammo == 0 && !cfg.melee {
                self.player.weapon_mut().start_reload(t);
            }
            return;
        }
        self.player.weapon_mut().last_fire = t;
        if !cfg.melee {
            self.player.weapon_mut().ammo -= 1;
        }
        self.cam.recoil += cfg.recoil;

        let damage = self.player.weapon().damage();
        let spread = if aiming { cfg.ads_spread } else { cfg.spread };
        let origin = self.cam.pos + self.cam.forward() * 0.3;
        let muzzle = self.player.pos + vec3(0.0, 1.4, 0.0) + self.cam.forward_flat() * 0.7;

        // firing punch: muzzle flash, a snap of shake and a little fov kick
        if !cfg.melee {
            self.muzzle_flash = 1.0;
            self.muzzle_pos = muzzle;
            let kick = (cfg.damage / 90.0).min(1.0);
            self.cam.add_trauma(0.10 + 0.28 * kick);
            self.cam.fov_kick += 0.015 + 0.05 * kick;
            // a few sparks spat from the barrel
            let fwd = self.cam.forward();
            self.burst(muzzle + fwd * 0.4, Color::new(1.0, 0.85, 0.45, 1.0), 4, 6.0, 0.2, 0.07, 4.0, 0.14);
        } else {
            self.cam.add_trauma(0.08);
        }

        for _ in 0..cfg.pellets {
            let mut dir = self.cam.forward();
            dir += vec3(rng(-spread, spread), rng(-spread, spread), rng(-spread, spread));
            dir = dir.normalize();
            // start past the player so we can't hit ourselves
            let start = origin + dir * 2.2;
            let (hit, dist) = self.cast_shot(start, dir, cfg.range, false);
            let pellet_dmg = if cfg.pellets > 1 { (damage / cfg.pellets as f32).round() } else { damage };

            let end = start + dir * dist;
            if !cfg.melee {
                self.tracers.push(Tracer { from: muzzle, to: end, life: 0.07, color: Color::new(1.0, 0.88, 0.54, 0.9) });
            }

            match hit {
                HitKind::BotHit { idx, point, head } if idx != usize::MAX => {
                    let dmg = pellet_dmg * if head { cfg.headshot } else { 1.0 };
                    let (name, died) = {
                        let bot = &mut self.bots[idx];
                        bot.take_damage(dmg);
                        (bot.name, !bot.alive)
                    };
                    self.impacts.push(Impact { pos: point, life: 0.12, flesh: true });
                    self.hitmarker = 0.25;
                    self.hit_head = head;
                    self.hit_flash = if head { 0.5 } else { 0.32 };
                    let blood = Color::new(0.85, 0.12, 0.14, 1.0);
                    self.burst(point, blood, if head { 10 } else { 6 }, 5.0, 0.3, 0.09, 9.0, 0.45);
                    self.dmg_nums.push(DmgNum { text: format!("{}", dmg.round() as i32), life: 0.9, off: vec2(rng(-40.0, 40.0), rng(-20.0, 20.0)), head });
                    if died {
                        self.player.kills += 1;
                        let drop_pos = self.bots[idx].pos;
                        let w = self.bots[idx].weapon.clone();
                        self.elim_flash = 0.6;
                        self.cam.add_trauma(0.35);
                        // a bloom of confetti-ish debris where they fell
                        self.burst(drop_pos + vec3(0.0, 1.0, 0.0), Color::new(1.0, 0.82, 0.3, 1.0), 26, 7.0, 0.6, 0.13, 8.0, 0.9);
                        self.burst(drop_pos + vec3(0.0, 1.0, 0.0), blood, 14, 5.0, 0.4, 0.11, 10.0, 0.7);
                        self.feed(format!("You eliminated {}", name));
                        self.notify(format!("Eliminated {}!", name));
                        self.loot.push(Loot { pos: drop_pos, kind: LootKind::Gun(w) });
                        self.loot.push(Loot {
                            pos: drop_pos + vec3(rng(-1.0, 1.0), 0.0, rng(-1.0, 1.0)),
                            kind: if rng(0.0, 1.0) < 0.5 { LootKind::Ammo(30) } else { LootKind::Minis },
                        });
                    }
                }
                HitKind::BuildHit { idx, point } => {
                    let dmg = if cfg.melee { 50.0 } else { pellet_dmg };
                    let mat = self.builds[idx].mat;
                    self.builds[idx].hp -= dmg;
                    let broke = self.builds[idx].hp <= 0.0;
                    if broke {
                        self.builds[idx].alive = false;
                    }
                    self.impacts.push(Impact { pos: point, life: 0.12, flesh: false });
                    self.hitmarker = 0.18;
                    self.hit_head = false;
                    let mut c = mat_color(mat);
                    c.a = 1.0;
                    self.burst(point, c, if broke { 16 } else { 5 }, 4.5, 0.3, 0.1, 11.0, 0.5);
                }
                HitKind::NodeHit { idx, point } => {
                    let (mat, amount) = self.world.nodes[idx].kind.gives();
                    let kind = self.world.nodes[idx].kind;
                    if cfg.melee {
                        let node = &mut self.world.nodes[idx];
                        node.hp -= 1;
                        if node.hp <= 0 {
                            node.alive = false;
                            self.player.mats[mat] += amount;
                            self.notify(format!("+{} {}", amount, MAT_NAMES[mat]));
                        }
                        self.hitmarker = 0.18;
                        self.hit_head = false;
                        self.cam.add_trauma(0.12);
                    }
                    self.impacts.push(Impact { pos: point, life: 0.12, flesh: false });
                    let c = match kind {
                        HarvestKind::Tree => Color::new(0.42, 0.28, 0.15, 1.0),
                        HarvestKind::Rock => Color::new(0.55, 0.56, 0.59, 1.0),
                        HarvestKind::Car => Color::new(0.76, 0.23, 0.23, 1.0),
                    };
                    self.burst(point, c, 8, 4.0, 0.4, 0.1, 11.0, 0.5);
                }
                HitKind::WorldHit(point) => {
                    self.impacts.push(Impact { pos: point, life: 0.12, flesh: false });
                    self.burst(point, Color::new(0.75, 0.7, 0.6, 1.0), 5, 3.5, 0.5, 0.08, 12.0, 0.4);
                }
                _ => {}
            }
        }
    }

    // ============================================================ bots
    fn update_bots(&mut self, dt: f32, t: f64) {
        let player_pos = self.player.pos;
        let player_alive = self.player.alive && self.phase == Phase::Playing;
        let storm_center = self.storm.center;
        let storm_radius = self.storm.radius;
        let colliders = self.static_colliders();

        let mut shots: Vec<(Vec3, Vec3, f32, f32)> = Vec::new(); // origin, dir, damage, range

        for bi in 0..self.bots.len() {
            let bot = &mut self.bots[bi];
            if !bot.alive {
                continue;
            }

            // vertical
            let floor = {
                let mut f = terrain_height(bot.pos.x, bot.pos.z);
                for h in &self.world.houses {
                    if bot.pos.x > h.body.min.x && bot.pos.x < h.body.max.x && bot.pos.z > h.body.min.z && bot.pos.z < h.body.max.z {
                        if h.body.max.y <= bot.pos.y + 0.6 && h.body.max.y > f {
                            f = h.body.max.y;
                        }
                    }
                }
                f
            };
            if bot.state == BotState::Drop {
                bot.pos.y -= 22.0 * dt;
                if bot.pos.y <= floor {
                    bot.pos.y = floor;
                    bot.state = BotState::Roam;
                }
                continue;
            }
            bot.pos.y += (floor - bot.pos.y) * damp(20.0, dt);

            // storm avoidance
            let to_center = storm_center - vec2(bot.pos.x, bot.pos.z);
            let in_storm = to_center.length() > storm_radius - 8.0;

            // engage logic
            let dp = player_pos - bot.pos;
            let dist_player = vec2(dp.x, dp.z).length();
            let engage_range = bot.weapon.cfg().range * 0.6;
            let mut sees = false;
            if player_alive && dist_player < engage_range {
                // line of sight vs houses/builds
                let from = bot.pos + vec3(0.0, 1.5, 0.0);
                let to = player_pos + vec3(0.0, 1.2, 0.0);
                let d = to - from;
                let len = d.length();
                if len > 0.5 {
                    let dir = d / len;
                    let inv = Vec3::ONE / dir;
                    sees = !colliders.iter().any(|b| ray_aabb(from, inv, b).map_or(false, |hit| hit < len - 0.6));
                    if sees {
                        if let Some(ht) = ray_terrain(from, dir, len - 0.5) {
                            if ht < len - 0.5 {
                                sees = false;
                            }
                        }
                    }
                }
            }
            if sees && !in_storm {
                if bot.state != BotState::Engage {
                    bot.state = BotState::Engage;
                    bot.reaction_until = t + rng(0.35, 0.9) as f64;
                }
            } else if bot.state == BotState::Engage {
                bot.state = BotState::Roam;
            }

            // movement
            let mut move_dir: Option<Vec2> = None;
            if in_storm {
                move_dir = Some(to_center.normalize_or_zero());
            } else if bot.state == BotState::Engage {
                let dir = vec2(dp.x, dp.z).normalize_or_zero();
                if dist_player > engage_range * 0.55 {
                    move_dir = Some(dir);
                } else {
                    let side = if ((t * 1.3) as f32 + bot.walk_phase).sin() > 0.0 { 1.0 } else { -1.0 };
                    move_dir = Some(vec2(-dir.y * side, dir.x * side));
                }
                bot.yaw = dir.x.atan2(dir.y);
            } else {
                if t > bot.next_wander {
                    bot.next_wander = t + rng(3.0, 8.0) as f64;
                    bot.wander_target = if rng(0.0, 1.0) < 0.5 {
                        let poi = &self.world.pois[macroquad::rand::gen_range(0, self.world.pois.len())];
                        poi.pos + vec2(rng(-20.0, 20.0), rng(-20.0, 20.0))
                    } else {
                        vec2(bot.pos.x, bot.pos.z) + vec2(rng(-40.0, 40.0), rng(-40.0, 40.0))
                    };
                }
                let d = bot.wander_target - vec2(bot.pos.x, bot.pos.z);
                if d.length_squared() > 4.0 {
                    move_dir = Some(d.normalize_or_zero());
                }
            }

            if let Some(md) = move_dir {
                let speed = if bot.state == BotState::Engage { bot.move_speed } else { bot.move_speed * 0.75 };
                bot.pos.x += md.x * speed * dt;
                bot.pos.z += md.y * speed * dt;
                if bot.state != BotState::Engage {
                    bot.yaw = md.x.atan2(md.y);
                }
                bot.walk_phase += dt * speed * 1.6;
            }

            // shooting
            bot.weapon.update(t);
            if bot.weapon.ammo == 0 && !bot.weapon.reloading {
                bot.weapon.start_reload(t);
            }
            if bot.state == BotState::Engage && player_alive && t >= bot.reaction_until && bot.weapon.can_fire(t) {
                bot.weapon.last_fire = t;
                bot.weapon.ammo -= 1;
                let from = bot.pos + vec3(0.0, 1.5, 0.0);
                let to = player_pos + vec3(0.0, 1.1, 0.0);
                let mut dir = (to - from).normalize_or_zero();
                dir += vec3(rng(-bot.accuracy, bot.accuracy), rng(-bot.accuracy, bot.accuracy), rng(-bot.accuracy, bot.accuracy));
                dir = dir.normalize_or_zero();
                let cfg = bot.weapon.cfg();
                shots.push((from, dir, bot.weapon.damage(), cfg.range));
            }
        }

        // resolve bot shots
        for (origin, dir, damage, range) in shots {
            if dir.length_squared() < 0.5 {
                continue;
            }
            let (hit, dist) = self.cast_shot(origin, dir, range, true);
            let end = origin + dir * dist;
            self.tracers.push(Tracer { from: origin, to: end, life: 0.07, color: Color::new(1.0, 0.42, 0.35, 0.9) });
            match hit {
                HitKind::BotHit { idx, point, .. } if idx == usize::MAX => {
                    self.player.take_damage(damage);
                    self.impacts.push(Impact { pos: point, life: 0.12, flesh: true });
                    self.dmg_flash = clampf(self.dmg_flash + 0.35 + damage / 200.0, 0.0, 0.85);
                    self.cam.add_trauma(0.18 + damage / 180.0);
                    let from = vec2(origin.x - self.player.pos.x, origin.z - self.player.pos.z).normalize_or_zero();
                    self.dmg_dirs.push(DamageDir { dir: from, life: 1.1 });
                    self.burst(point, Color::new(0.85, 0.12, 0.14, 1.0), 6, 4.0, 0.3, 0.09, 9.0, 0.4);
                }
                HitKind::BuildHit { idx, point } => {
                    self.builds[idx].hp -= damage;
                    if self.builds[idx].hp <= 0.0 {
                        self.builds[idx].alive = false;
                    }
                    self.impacts.push(Impact { pos: point, life: 0.12, flesh: false });
                }
                HitKind::WorldHit(point) | HitKind::NodeHit { point, .. } => {
                    self.impacts.push(Impact { pos: point, life: 0.12, flesh: false });
                }
                _ => {}
            }
        }

        // storm damage + off-screen fights
        let mut feed_msgs: Vec<String> = Vec::new();
        for bot in self.bots.iter_mut() {
            if bot.alive && (vec2(bot.pos.x, bot.pos.z) - storm_center).length() > storm_radius {
                bot.health -= self.storm.dps * dt;
                if bot.health <= 0.0 {
                    bot.alive = false;
                    feed_msgs.push(format!("The Storm claimed {}", bot.name));
                }
            }
        }
        let alive_idx: Vec<usize> = (0..self.bots.len()).filter(|&i| self.bots[i].alive).collect();
        if alive_idx.len() >= 2 && rng(0.0, 1.0) < 0.0011 * alive_idx.len() as f32 {
            let a = alive_idx[macroquad::rand::gen_range(0, alive_idx.len())];
            let b = alive_idx[macroquad::rand::gen_range(0, alive_idx.len())];
            if a != b {
                let far = (self.bots[a].pos - self.bots[b].pos).length() > 60.0;
                let near_player = (self.bots[b].pos - player_pos).length() < 80.0;
                if far && !near_player {
                    self.bots[b].alive = false;
                    feed_msgs.push(format!("{} eliminated {}", self.bots[a].name, self.bots[b].name));
                }
            }
        }
        for m in feed_msgs {
            self.feed(m);
        }
    }

    // ============================================================ player tick
    fn update_player(&mut self, dt: f32, t: f64, input: &Input) {
        let aiming = self.cam.aiming;
        // movement input
        let mv = vec2(input.move_x, input.move_y);
        let sprinting = input.sprint && mv.y > 0.0 && !aiming;

        let fwd = self.cam.forward_flat();
        let right = self.cam.right_flat();
        let wish = fwd * mv.y + right * mv.x;
        if wish.length_squared() > 0.0 {
            let dir = wish.normalize();
            let speed = 6.5 * if sprinting { 1.55 } else { 1.0 } * if aiming { 0.55 } else { 1.0 };
            self.player.vel.x = dir.x * speed;
            self.player.vel.z = dir.z * speed;
        } else {
            let k = 1.0 - damp(14.0, dt);
            self.player.vel.x *= k;
            self.player.vel.z *= k;
        }

        if input.jump && self.player.grounded {
            self.player.vel.y = 8.5;
            self.player.grounded = false;
        }
        self.player.vel.y -= GRAVITY * dt;
        self.player.vel.y = self.player.vel.y.max(-55.0);

        // horizontal collision: push out of AABBs (walls/houses)
        let mut next = self.player.pos + self.player.vel * dt;
        let r = 0.45;
        for b in self.static_colliders() {
            // only collide if our capsule vertical range overlaps the box
            if next.y + 1.8 < b.min.y || next.y + 0.3 > b.max.y {
                continue;
            }
            let cx = clampf(next.x, b.min.x, b.max.x);
            let cz = clampf(next.z, b.min.z, b.max.z);
            let dx = next.x - cx;
            let dz = next.z - cz;
            let d2 = dx * dx + dz * dz;
            if d2 < r * r {
                if d2 > 1e-6 {
                    let d = d2.sqrt();
                    next.x = cx + dx / d * r;
                    next.z = cz + dz / d * r;
                } else {
                    // inside the box: push toward nearest face on x/z
                    let push_x = if (next.x - b.min.x) < (b.max.x - next.x) { b.min.x - r } else { b.max.x + r };
                    let push_z = if (next.z - b.min.z) < (b.max.z - next.z) { b.min.z - r } else { b.max.z + r };
                    if (next.x - push_x).abs() < (next.z - push_z).abs() {
                        next.x = push_x;
                    } else {
                        next.z = push_z;
                    }
                }
            }
        }

        // vertical
        let was_airborne = !self.player.grounded;
        let fall_speed = self.player.vel.y;
        let floor = self.floor_at(next.x, next.z, self.player.pos.y);
        if next.y <= floor {
            next.y = floor;
            if self.player.vel.y < 0.0 {
                self.player.vel.y = 0.0;
            }
            self.player.grounded = true;
            // landing thump: kick up dust and shake, scaled by impact speed
            if was_airborne && fall_speed < -6.0 {
                let hard = ((-fall_speed - 6.0) / 30.0).min(1.0);
                self.cam.add_trauma(0.08 + 0.22 * hard);
                self.burst(vec3(next.x, floor + 0.1, next.z), Color::new(0.72, 0.66, 0.55, 1.0), 6 + (hard * 10.0) as usize, 3.0 + 4.0 * hard, 0.7, 0.12, 10.0, 0.5);
            }
        } else {
            self.player.grounded = next.y - floor < 0.05;
        }

        // island bounds
        let d = vec2(next.x, next.z).length();
        if d > HALF - 6.0 {
            let s = (HALF - 6.0) / d;
            next.x *= s;
            next.z *= s;
        }
        self.player.pos = next;

        // body yaw: face camera when aiming/firing, else movement
        let moving = wish.length_squared() > 0.0;
        let target_yaw = if aiming || input.fire_down || !moving {
            self.cam.yaw
        } else {
            self.player.vel.x.atan2(self.player.vel.z)
        };
        let dy = wrap_angle(target_yaw - self.player.body_yaw);
        self.player.body_yaw += dy * damp(14.0, dt);
        self.player.walk_phase += dt * vec2(self.player.vel.x, self.player.vel.z).length() * 1.6;

        // weapon switching & reload — only in combat; build mode reuses these
        // keys (1-4 = piece, R = rotate), so routing them here too would fire
        // both actions on one press.
        if !self.build_mode {
            for i in 0..5 {
                if input.num[i] && self.player.slots[i].is_some() {
                    self.player.weapon_mut().reloading = false;
                    self.player.slot = i;
                }
            }
            if input.r {
                self.player.weapon_mut().start_reload(t);
            }
        }
        for s in self.player.slots.iter_mut().flatten() {
            s.update(t);
        }
    }

    // ============================================================ build mode
    fn build_preview(&self) -> (Build, bool) {
        let fwd = self.cam.forward_flat();
        let target = self.player.pos + fwd * CELL;
        let gx = (target.x / CELL).round() * CELL;
        let gz = (target.z / CELL).round() * CELL;
        let ground = terrain_height(gx, gz);
        let gy = (self.player.pos.y / CELL).round() * CELL;
        let base_y = gy.max((ground / CELL).round() * CELL);
        let snap_yaw = (fwd.x.atan2(fwd.z) / (std::f32::consts::PI / 2.0)).round() * (std::f32::consts::PI / 2.0)
            + self.build_rot as f32 * (std::f32::consts::PI / 2.0);

        let piece = PIECES[self.piece_idx];
        let pos = match piece {
            Piece::Floor => {
                let mut y = base_y;
                if y < ground + 0.2 {
                    y = base_y + CELL;
                }
                vec3(gx, y, gz)
            }
            _ => vec3(gx, base_y, gz),
        };
        let b = Build { piece, pos, yaw: snap_yaw, mat: self.mat_idx, hp: MAT_HP[self.mat_idx], alive: true };
        // invalid if overlapping an existing piece of same type/cell
        let valid = !self.builds.iter().any(|e| {
            e.alive && e.piece == b.piece && (e.pos - b.pos).length() < 0.5 && (e.piece != Piece::Wall || wrap_angle(e.yaw - b.yaw).abs() < 0.1)
        });
        (b, valid)
    }

    fn update_build_mode(&mut self, input: &Input) {
        if input.num[0] || input.zxcv[0] { self.piece_idx = 0; }
        if input.num[1] || input.zxcv[1] { self.piece_idx = 1; }
        if input.num[2] || input.zxcv[2] { self.piece_idx = 2; }
        if input.num[3] || input.zxcv[3] { self.piece_idx = 3; }
        if input.r { self.build_rot = (self.build_rot + 1) % 4; }
        if input.alt_pressed { self.mat_idx = (self.mat_idx + 1) % 3; }

        if input.fire_down {
            let (b, valid) = self.build_preview();
            if valid && self.player.mats[self.mat_idx] >= MAT_COST {
                self.player.mats[self.mat_idx] -= MAT_COST;
                self.builds.push(b);
            } else if input.fire_pressed && self.player.mats[self.mat_idx] < MAT_COST {
                self.notify(format!("Not enough {}!", MAT_NAMES[self.mat_idx]));
            }
        }
    }

    // ============================================================ loot & chests
    fn update_interactions(&mut self) -> Option<String> {
        // nearest unopened chest
        let ppos = self.player.pos;
        let mut prompt = None;
        let chest_idx = self
            .world
            .chests
            .iter()
            .enumerate()
            .filter(|(_, c)| !c.opened && (c.pos - ppos).length() < 2.8)
            .min_by(|a, b| (a.1.pos - ppos).length().partial_cmp(&(b.1.pos - ppos).length()).unwrap())
            .map(|(i, _)| i);

        if let Some(ci) = chest_idx {
            prompt = Some("[E] Open Chest".to_string());
            if is_key_pressed(KeyCode::E) {
                self.world.chests[ci].opened = true;
                let cp = self.world.chests[ci].pos;
                self.loot.push(Loot {
                    pos: cp + vec3(rng(-0.8, 0.8), 0.0, rng(-0.8, 0.8)),
                    kind: LootKind::Gun(Weapon::new(LOOT_WEAPONS[macroquad::rand::gen_range(0, 5)], roll_rarity(0.18))),
                });
                self.loot.push(Loot {
                    pos: cp + vec3(rng(-0.8, 0.8), 0.0, rng(-0.8, 0.8)),
                    kind: if rng(0.0, 1.0) < 0.5 { LootKind::Ammo(macroquad::rand::gen_range(30, 61)) } else { LootKind::BigPot },
                });
                self.notify("Chest opened!");
            }
            return prompt;
        }

        let loot_idx = self
            .loot
            .iter()
            .enumerate()
            .filter(|(_, l)| (l.pos - ppos).length() < 2.4)
            .min_by(|a, b| (a.1.pos - ppos).length().partial_cmp(&(b.1.pos - ppos).length()).unwrap())
            .map(|(i, _)| i);
        if let Some(li) = loot_idx {
            prompt = Some(format!("[E] {}", loot_label(&self.loot[li].kind)));
            if is_key_pressed(KeyCode::E) {
                let l = self.loot.remove(li);
                let msg = loot_label(&l.kind);
                match l.kind {
                    LootKind::Gun(w) => self.player.add_weapon(w),
                    LootKind::Ammo(n) => self.player.add_ammo(n),
                    LootKind::Medkit => self.player.health = 100.0,
                    LootKind::Minis => self.player.shield = clampf(self.player.shield + 25.0, 0.0, 100.0),
                    LootKind::BigPot => self.player.shield = clampf(self.player.shield + 50.0, 0.0, 100.0),
                }
                self.notify(msg);
            }
        }
        prompt
    }
}

// ============================================================ rendering
fn draw_character(pos: Vec3, yaw: f32, shirt: Color, walk_phase: f32, weapon: Option<(WType, usize)>, pitch: f32, aiming: bool) {
    let rot = |v: Vec3| -> Vec3 {
        vec3(v.x * yaw.cos() + v.z * yaw.sin(), v.y, -v.x * yaw.sin() + v.z * yaw.cos())
    };
    let at = |off: Vec3| pos + rot(off);
    let pants = Color::from_rgba(53, 64, 77, 255);
    let skin = Color::from_rgba(232, 185, 138, 255);

    let swing = walk_phase.sin() * 0.28;
    // legs
    draw_cube(at(vec3(-0.18, 0.35, swing * 0.6)), vec3(0.26, 0.7, 0.3), None, pants);
    draw_cube(at(vec3(0.18, 0.35, -swing * 0.6)), vec3(0.26, 0.7, 0.3), None, pants);
    // torso + head
    draw_cube(at(vec3(0.0, 1.05, 0.0)), vec3(0.7, 0.75, 0.4), None, shirt);
    draw_cube(at(vec3(0.0, 1.68, 0.0)), vec3(0.42, 0.42, 0.42), None, skin);
    // left arm
    draw_cube(at(vec3(-0.48, 1.1, -swing * 0.5)), vec3(0.2, 0.65, 0.25), None, shirt);
    // right arm + weapon: raise toward pitch when aiming
    let lift = if aiming { 0.55 + pitch * 0.5 } else { 0.15 };
    draw_cube(at(vec3(0.48, 1.1 + lift * 0.2, 0.25 * lift)), vec3(0.2, 0.65, 0.25), None, shirt);
    if let Some((t, rarity)) = weapon {
        let gp = at(vec3(0.48, 1.2 + lift * 0.3, 0.45));
        let len = match t {
            WType::Pickaxe => 0.7,
            WType::Sniper => 1.2,
            WType::Shotgun => 0.8,
            WType::Ar => 0.9,
            WType::Smg => 0.55,
            WType::Pistol => 0.35,
        };
        let body = Color::from_rgba(51, 58, 66, 255);
        // gun barrel points forward
        draw_cube(gp + rot(vec3(0.0, 0.0, len * 0.4)), rot_size(vec3(0.12, 0.14, len), yaw), None, body);
        if t != WType::Pickaxe {
            draw_cube(gp + rot(vec3(0.0, 0.03, len * 0.15)), rot_size(vec3(0.14, 0.1, len * 0.45), yaw), None, rarity_color(rarity));
        } else {
            draw_cube(gp + rot(vec3(0.0, 0.12, len * 0.55)), rot_size(vec3(0.3, 0.12, 0.12), yaw), None, Color::from_rgba(154, 160, 168, 255));
        }
    }
}

/// A tracer with visible girth: a bright core wrapped in a translucent glow,
/// faked by drawing the segment several times with small perpendicular offsets.
fn draw_tracer(from: Vec3, to: Vec3, color: Color, width: f32) {
    let dir = (to - from).normalize_or_zero();
    if dir.length_squared() < 0.5 {
        return;
    }
    let up = if dir.y.abs() > 0.9 { vec3(1.0, 0.0, 0.0) } else { vec3(0.0, 1.0, 0.0) };
    let p1 = dir.cross(up).normalize_or_zero() * width;
    let p2 = dir.cross(p1).normalize_or_zero() * width;
    let glow = Color::new(color.r, color.g, color.b, color.a * 0.28);
    for (o, w) in [(p1, 1.0), (-p1, 1.0), (p2, 1.0), (-p2, 1.0)] {
        let _ = w;
        draw_line_3d(from + o, to + o, glow);
    }
    // hot white-ish core
    let core = Color::new((color.r + 1.0) * 0.5, (color.g + 1.0) * 0.5, (color.b + 0.7) * 0.5, 1.0);
    draw_line_3d(from, to, core);
}

/// Cubes can't rotate in macroquad's immediate API — swap x/z extents on quarter turns.
fn rot_size(size: Vec3, yaw: f32) -> Vec3 {
    let quarter = ((yaw / (std::f32::consts::PI / 2.0)).round() as i32).rem_euclid(2);
    if quarter == 1 {
        vec3(size.z, size.y, size.x)
    } else {
        size
    }
}

impl Game {
    fn draw_world_3d(&self, t: f64) {
        // terrain
        for m in &self.world.terrain_meshes {
            draw_mesh(m);
        }
        // water
        draw_plane(vec3(0.0, -0.4, 0.0), vec2(2000.0, 2000.0), None, Color::from_rgba(47, 127, 193, 235));

        // drifting clouds: big soft translucent slabs high above, slowly moving
        let drift = (t as f32) * 3.0;
        for i in 0..10 {
            let fi = i as f32;
            let bx = ((fi * 97.13).sin() * HALF * 1.1) + (drift + fi * 40.0) % (WORLD_SIZE * 1.4) - WORLD_SIZE * 0.7;
            let bz = (fi * 53.7).cos() * HALF * 1.1;
            let cy = 78.0 + (fi * 7.0) % 26.0;
            let w = 34.0 + (fi * 11.0) % 30.0;
            let d = 20.0 + (fi * 6.0) % 16.0;
            let cloud = Color::new(1.0, 1.0, 1.0, 0.5);
            draw_cube(vec3(bx, cy, bz), vec3(w, 3.5, d), None, cloud);
            draw_cube(vec3(bx + w * 0.2, cy + 2.5, bz - d * 0.15), vec3(w * 0.55, 3.0, d * 0.6), None, cloud);
        }

        // houses
        for h in &self.world.houses {
            let c = h.body.center();
            let s = h.body.size();
            draw_cube(c, s, None, h.color);
            draw_cube(vec3(c.x, h.body.max.y + 0.8, c.z), vec3(s.x * 1.15, 1.6, s.z * 1.15), None, h.roof_color);
            // door hint
            draw_cube(vec3(c.x, h.body.min.y + 1.2, h.body.max.z + 0.05), vec3(1.4, 2.4, 0.15), None, Color::from_rgba(90, 61, 40, 255));
        }

        // harvest nodes
        for n in &self.world.nodes {
            if !n.alive {
                continue;
            }
            match n.kind {
                HarvestKind::Tree => {
                    let s = n.scale;
                    draw_cube(n.pos + vec3(0.0, 2.0 * s, 0.0), vec3(0.7 * s, 4.0 * s, 0.7 * s), None, Color::from_rgba(107, 74, 47, 255));
                    draw_cube(n.pos + vec3(0.0, 5.2 * s, 0.0), vec3(3.0 * s, 2.6 * s, 3.0 * s), None, Color::from_rgba(47, 122, 58, 255));
                    draw_cube(n.pos + vec3(0.0, 7.0 * s, 0.0), vec3(1.9 * s, 1.6 * s, 1.9 * s), None, Color::from_rgba(57, 137, 74, 255));
                }
                HarvestKind::Rock => {
                    let s = n.scale;
                    draw_cube(n.pos + vec3(0.0, 0.8 * s, 0.0), Vec3::splat(1.7 * s), None, Color::from_rgba(138, 143, 150, 255));
                    draw_cube(n.pos + vec3(0.5 * s, 1.4 * s, 0.3 * s), Vec3::splat(0.9 * s), None, Color::from_rgba(118, 124, 133, 255));
                }
                HarvestKind::Car => {
                    draw_cube(n.pos + vec3(0.0, 0.85, 0.0), vec3(4.2, 1.1, 2.0), None, Color::from_rgba(194, 59, 59, 255));
                    draw_cube(n.pos + vec3(0.0, 1.75, 0.0), vec3(2.2, 0.8, 1.8), None, Color::from_rgba(34, 42, 51, 255));
                }
            }
        }

        // chests
        for c in &self.world.chests {
            if c.opened {
                draw_cube(c.pos + vec3(0.0, 0.35, 0.0), vec3(1.5, 0.7, 1.0), None, Color::from_rgba(110, 76, 40, 255));
            } else {
                let bob = ((t * 2.0).sin() as f32) * 0.05;
                draw_cube(c.pos + vec3(0.0, 0.45, 0.0), vec3(1.5, 0.9, 1.0), None, Color::from_rgba(138, 90, 42, 255));
                draw_cube(c.pos + vec3(0.0, 1.05 + bob, 0.0), vec3(1.5, 0.4, 1.0), None, Color::from_rgba(217, 161, 47, 255));
            }
        }

        // loot
        for l in &self.loot {
            let bob = (((t * 2.0) as f32) + l.pos.x).sin() * 0.1;
            let p = l.pos + vec3(0.0, 0.6 + bob, 0.0);
            match &l.kind {
                LootKind::Gun(w) => {
                    draw_cube(p, vec3(1.0, 0.22, 0.22), None, Color::from_rgba(51, 58, 66, 255));
                    draw_cube(p + vec3(0.0, 0.14, 0.0), vec3(0.5, 0.12, 0.26), None, rarity_color(w.rarity));
                }
                LootKind::Ammo(_) => draw_cube(p, vec3(0.5, 0.35, 0.35), None, Color::from_rgba(138, 154, 168, 255)),
                LootKind::Medkit => {
                    draw_cube(p, vec3(0.55, 0.3, 0.45), None, WHITE);
                    draw_cube(p + vec3(0.0, 0.05, 0.0), vec3(0.3, 0.32, 0.2), None, Color::from_rgba(212, 63, 63, 255));
                }
                LootKind::Minis => draw_cube(p, vec3(0.25, 0.4, 0.25), None, Color::from_rgba(77, 196, 224, 255)),
                LootKind::BigPot => draw_cube(p, vec3(0.35, 0.6, 0.35), None, Color::from_rgba(47, 95, 224, 255)),
            }
        }

        // builds
        for b in &self.builds {
            if !b.alive {
                continue;
            }
            let hp_frac = clampf(b.hp / MAT_HP[b.mat], 0.3, 1.0);
            let mut col = mat_color(b.mat);
            col.a = 0.35 + 0.65 * hp_frac;
            match b.piece {
                Piece::Ramp => {
                    // stepped ramp
                    let fwd = vec3(b.yaw.sin(), 0.0, b.yaw.cos());
                    for i in 0..4 {
                        let f = (i as f32 + 0.5) / 4.0;
                        let center = b.pos + fwd * (f - 0.5) * CELL + vec3(0.0, f * CELL - 0.15, 0.0);
                        draw_cube(center, rot_size(vec3(CELL, 0.3, CELL / 4.0 + 0.35), b.yaw), None, col);
                    }
                }
                _ => {
                    let bb = b.aabb();
                    draw_cube(bb.center(), bb.size(), None, col);
                }
            }
        }

        // bots
        for bot in &self.bots {
            if bot.alive {
                draw_character(bot.pos, bot.yaw, bot.color, bot.walk_phase, Some((bot.weapon.t, bot.weapon.rarity)), 0.0, bot.state == BotState::Engage);
            }
        }

        // fx
        for tr in &self.tracers {
            draw_tracer(tr.from, tr.to, tr.color, 0.04);
        }
        // particles: fading, shrinking cubes
        for p in &self.particles {
            let f = clampf(p.life / p.max_life, 0.0, 1.0);
            let mut c = p.color;
            c.a = f;
            draw_cube(p.pos, Vec3::splat(p.size * (0.35 + 0.65 * f)), None, c);
        }
        // muzzle flash: a bright star-ish burst at the barrel
        if self.muzzle_flash > 0.0 {
            let f = self.muzzle_flash;
            let core = Color::new(1.0, 0.95, 0.7, f);
            draw_cube(self.muzzle_pos, Vec3::splat(0.5 * f), None, core);
            let halo = Color::new(1.0, 0.78, 0.35, f * 0.5);
            draw_cube(self.muzzle_pos, Vec3::splat(0.9 * f), None, halo);
        }
        for im in &self.impacts {
            let c = if im.flesh { Color::new(1.0, 0.33, 0.27, 0.9) } else { Color::new(1.0, 0.87, 0.53, 0.9) };
            draw_cube(im.pos, Vec3::splat(if im.flesh { 0.3 } else { 0.2 }), None, c);
        }

        // storm wall (draw last: translucent)
        let seg = 48;
        let c2 = self.storm.center;
        for i in 0..seg {
            let a0 = i as f32 / seg as f32 * std::f32::consts::TAU;
            let a1 = (i + 1) as f32 / seg as f32 * std::f32::consts::TAU;
            let p0 = vec3(c2.x + a0.cos() * self.storm.radius, 0.0, c2.y + a0.sin() * self.storm.radius);
            let p1 = vec3(c2.x + a1.cos() * self.storm.radius, 0.0, c2.y + a1.sin() * self.storm.radius);
            let h = 160.0;
            let col = Color::new(0.71, 0.30, 0.91, 0.16);
            draw_affine_parallelogram(p0, p1 - p0, vec3(0.0, h, 0.0), None, col);
        }
    }
}

// ============================================================ HUD
fn hud_text(text: &str, x: f32, y: f32, size: f32, color: Color) {
    draw_text(text, x + 1.5, y + 1.5, size, Color::new(0.0, 0.0, 0.0, 0.6));
    draw_text(text, x, y, size, color);
}
fn hud_text_center(text: &str, cx: f32, y: f32, size: f32, color: Color) {
    let dim = measure_text(text, None, size as u16, 1.0);
    hud_text(text, cx - dim.width / 2.0, y, size, color);
}

impl Game {
    fn draw_hud(&self, dt: f32, prompt: &Option<String>, t: f64) {
        let sw = screen_width();
        let sh = screen_height();
        let gold = Color::from_rgba(255, 210, 77, 255);

        // crosshair
        let w = self.player.weapon();
        let scope = self.cam.aiming && w.cfg().scope;
        if scope {
            // scope overlay
            draw_rectangle(0.0, 0.0, sw, sh * 0.5 - 150.0, BLACK);
            draw_rectangle(0.0, sh * 0.5 + 150.0, sw, sh, BLACK);
            draw_rectangle(0.0, 0.0, sw * 0.5 - 150.0, sh, BLACK);
            draw_rectangle(sw * 0.5 + 150.0, 0.0, sw, sh, BLACK);
            draw_circle_lines(sw / 2.0, sh / 2.0, 150.0, 3.0, BLACK);
            draw_line(sw / 2.0 - 150.0, sh / 2.0, sw / 2.0 + 150.0, sh / 2.0, 1.0, BLACK);
            draw_line(sw / 2.0, sh / 2.0 - 150.0, sw / 2.0, sh / 2.0 + 150.0, 1.0, BLACK);
        } else if self.phase == Phase::Playing {
            let s = self.cross_spread;
            let c = if self.build_mode { Color::from_rgba(68, 204, 255, 255) } else { WHITE };
            draw_rectangle(sw / 2.0 - 1.0, sh / 2.0 - 8.0 - s, 2.0, 8.0, c);
            draw_rectangle(sw / 2.0 - 1.0, sh / 2.0 + s, 2.0, 8.0, c);
            draw_rectangle(sw / 2.0 - 8.0 - s, sh / 2.0 - 1.0, 8.0, 2.0, c);
            draw_rectangle(sw / 2.0 + s, sh / 2.0 - 1.0, 8.0, 2.0, c);
        }

        // hitmarker
        if self.hitmarker > 0.0 {
            let c = if self.hit_head { gold } else { WHITE };
            let a = self.hitmarker / 0.25;
            let col = Color::new(c.r, c.g, c.b, a);
            for (dx, dy) in [(-1.0, -1.0), (1.0, -1.0), (-1.0, 1.0), (1.0, 1.0f32)] {
                draw_line(sw / 2.0 + dx * 6.0, sh / 2.0 + dy * 6.0, sw / 2.0 + dx * 14.0, sh / 2.0 + dy * 14.0, 3.0, col);
            }
        }

        // damage numbers
        for d in &self.dmg_nums {
            let a = clampf(d.life / 0.9, 0.0, 1.0);
            let rise = (1.0 - a) * 60.0;
            let c = if d.head { gold } else { WHITE };
            hud_text(&d.text, sw / 2.0 + d.off.x, sh * 0.42 + d.off.y - rise, if d.head { 34.0 } else { 27.0 }, Color::new(c.r, c.g, c.b, a));
        }

        // vitals
        let bar_w = 380.0;
        let bx = sw / 2.0 - bar_w / 2.0;
        let by = sh - 64.0;
        draw_rectangle(bx, by, bar_w, 15.0, Color::new(0.0, 0.0, 0.0, 0.55));
        draw_rectangle(bx, by, bar_w * self.player.shield / 100.0, 15.0, Color::from_rgba(78, 178, 236, 255));
        draw_rectangle(bx, by + 19.0, bar_w, 15.0, Color::new(0.0, 0.0, 0.0, 0.55));
        draw_rectangle(bx, by + 19.0, bar_w * self.player.health / 100.0, 15.0, Color::from_rgba(118, 202, 88, 255));
        hud_text(&format!("{}", self.player.shield.ceil() as i32), bx + bar_w + 10.0, by + 13.0, 20.0, WHITE);
        hud_text(&format!("{}", self.player.health.ceil() as i32), bx + bar_w + 10.0, by + 32.0, 20.0, WHITE);

        // materials
        for i in 0..3 {
            let x = sw - 250.0 + i as f32 * 80.0;
            draw_rectangle(x, sh - 130.0, 72.0, 30.0, Color::new(0.0, 0.0, 0.0, 0.5));
            let mut c = mat_color(i);
            c.a = 1.0;
            draw_rectangle(x + 5.0, sh - 124.0, 18.0, 18.0, c);
            hud_text(&format!("{}", self.player.mats[i]), x + 30.0, sh - 108.0, 20.0, WHITE);
        }

        // ammo
        if !w.cfg().melee {
            hud_text(&format!("{} / {}", w.ammo, w.reserve), sw - 170.0, sh - 40.0, 36.0, WHITE);
            if w.reloading {
                let p = clampf(((t - w.reload_start) / w.cfg().reload as f64) as f32, 0.0, 1.0);
                draw_rectangle(sw - 170.0, sh - 30.0, 120.0, 6.0, Color::new(0.0, 0.0, 0.0, 0.6));
                draw_rectangle(sw - 170.0, sh - 30.0, 120.0 * p, 6.0, gold);
                hud_text_center("RELOADING", sw / 2.0, sh / 2.0 + 60.0, 22.0, gold);
            }
        } else {
            hud_text("--", sw - 120.0, sh - 40.0, 40.0, WHITE);
        }

        // hotbar
        for i in 0..5 {
            let x = 24.0 + i as f32 * 60.0;
            let y = sh - 80.0;
            let active = i == self.player.slot;
            draw_rectangle(x, y, 52.0, 52.0, Color::new(0.0, 0.0, 0.0, if active { 0.75 } else { 0.5 }));
            if let Some(wp) = &self.player.slots[i] {
                let rc = rarity_color(wp.rarity);
                draw_rectangle_lines(x, y, 52.0, 52.0, if active { 4.0 } else { 2.0 }, if active { WHITE } else { rc });
                let label = match wp.t {
                    WType::Pickaxe => "P",
                    WType::Ar => "AR",
                    WType::Shotgun => "SG",
                    WType::Smg => "SMG",
                    WType::Sniper => "SNP",
                    WType::Pistol => "PST",
                };
                hud_text(label, x + 8.0, y + 33.0, 22.0, rc);
            } else {
                draw_rectangle_lines(x, y, 52.0, 52.0, 2.0, Color::new(1.0, 1.0, 1.0, 0.2));
            }
        }

        // build bar
        if self.build_mode {
            for i in 0..4 {
                let x = 24.0 + i as f32 * 92.0;
                let y = sh - 145.0;
                let active = i == self.piece_idx;
                draw_rectangle(x, y, 86.0, 32.0, Color::new(0.0, 0.12, 0.2, if active { 0.9 } else { 0.55 }));
                draw_rectangle_lines(x, y, 86.0, 32.0, 2.0, if active { Color::from_rgba(68, 204, 255, 255) } else { Color::new(0.3, 0.7, 1.0, 0.35) });
                hud_text(piece_name(PIECES[i]), x + 10.0, y + 22.0, 20.0, WHITE);
            }
            let x = 24.0 + 4.0 * 92.0;
            draw_rectangle(x, sh - 145.0, 120.0, 32.0, Color::new(0.0, 0.0, 0.0, 0.6));
            hud_text(&format!("{} ({})", MAT_NAMES[self.mat_idx], self.player.mats[self.mat_idx]), x + 8.0, sh - 123.0, 20.0, gold);
        }

        // top bar: alive / kills / storm
        let alive = self.bots.iter().filter(|b| b.alive).count() + if self.player.alive { 1 } else { 0 };
        draw_rectangle(sw / 2.0 - 130.0, 14.0, 260.0, 44.0, Color::new(0.0, 0.0, 0.0, 0.5));
        hud_text_center(&format!("{}", alive), sw / 2.0 - 85.0, 44.0, 30.0, WHITE);
        hud_text_center("ALIVE", sw / 2.0 - 85.0, 55.0, 13.0, GRAY);
        hud_text_center(&format!("{}", self.player.kills), sw / 2.0, 44.0, 30.0, WHITE);
        hud_text_center("ELIMS", sw / 2.0, 55.0, 13.0, GRAY);
        let storm_txt = if self.storm.phase >= STORM_PHASES.len() {
            "FINAL".to_string()
        } else {
            format!("{}:{:02}", self.storm.timer.max(0.0) as i32 / 60, self.storm.timer.max(0.0) as i32 % 60)
        };
        let sc = if self.storm.shrinking { Color::from_rgba(232, 121, 255, 255) } else { WHITE };
        hud_text_center(&storm_txt, sw / 2.0 + 85.0, 44.0, 30.0, sc);
        hud_text_center("STORM", sw / 2.0 + 85.0, 55.0, 13.0, GRAY);

        // storm warning
        if self.phase == Phase::Playing && self.storm.outside(self.player.pos) {
            let pulse = (((t * 4.0).sin() as f32) * 0.5 + 0.5) * 0.6 + 0.4;
            hud_text_center("! GET INSIDE THE STORM !", sw / 2.0, sh * 0.16, 28.0, Color::new(0.91, 0.47, 1.0, pulse));
        }

        // kill feed
        for (i, f) in self.feed.iter().enumerate() {
            let a = clampf(f.life, 0.0, 1.0);
            hud_text(&f.text, sw - 320.0, 220.0 + i as f32 * 26.0, 18.0, Color::new(1.0, 1.0, 1.0, a));
        }

        // notify
        if self.notify.1 > 0.0 {
            let a = clampf(self.notify.1 / 0.4, 0.0, 1.0);
            hud_text_center(&self.notify.0, sw / 2.0, sh * 0.26, 26.0, Color::new(1.0, 0.82, 0.3, a));
        }

        // interact prompt
        if let Some(p) = prompt {
            let dim = measure_text(p, None, 22, 1.0);
            draw_rectangle(sw / 2.0 - dim.width / 2.0 - 14.0, sh * 0.6 - 24.0, dim.width + 28.0, 36.0, Color::new(0.0, 0.0, 0.0, 0.65));
            hud_text_center(p, sw / 2.0, sh * 0.6, 22.0, WHITE);
        }

        // minimap
        self.draw_minimap(sw, t);

        // hit-confirm pop: an expanding ring the moment you connect
        if self.hit_flash > 0.0 {
            let f = self.hit_flash / 0.5;
            let r = 10.0 + (1.0 - f) * 26.0;
            let c = if self.hit_head { gold } else { WHITE };
            draw_circle_lines(sw / 2.0, sh / 2.0, r, 2.5, Color::new(c.r, c.g, c.b, f * 0.9));
        }

        // directional damage indicators around the crosshair
        for d in &self.dmg_dirs {
            let a = clampf(d.life / 1.1, 0.0, 1.0);
            let fwd = vec2(self.cam.yaw.sin(), self.cam.yaw.cos());
            let right = vec2(self.cam.yaw.cos(), -self.cam.yaw.sin());
            let theta = (d.dir.dot(right)).atan2(d.dir.dot(fwd));
            let (cx, cy) = (sw / 2.0, sh / 2.0);
            let radius = 110.0;
            let dirv = vec2(theta.sin(), -theta.cos());
            let base = vec2(cx, cy) + dirv * radius;
            let tang = vec2(-dirv.y, dirv.x);
            let col = Color::new(1.0, 0.25, 0.2, a * 0.85);
            draw_triangle(base + dirv * 14.0, base - dirv * 6.0 + tang * 16.0, base - dirv * 6.0 - tang * 16.0, col);
        }

        // damage tint (recent hits) + low-health vignette, combined
        let low = if self.player.health < 35.0 { (1.0 - self.player.health / 35.0) * 0.4 } else { 0.0 };
        let red = (self.dmg_flash * 0.5).max(low);
        if red > 0.0 {
            draw_rectangle(0.0, 0.0, sw, sh, Color::new(0.65, 0.0, 0.0, red));
        }
        // elimination flash: warm edge glow
        if self.elim_flash > 0.0 {
            let a = self.elim_flash * 0.28;
            let band = sh * 0.18;
            draw_rectangle(0.0, 0.0, sw, band, Color::new(1.0, 0.8, 0.3, a));
            draw_rectangle(0.0, sh - band, sw, band, Color::new(1.0, 0.8, 0.3, a));
        }
        let _ = dt;
    }

    fn draw_minimap(&self, sw: f32, _t: f64) {
        let size = 150.0;
        let mx = sw - size - 18.0;
        let my = 18.0;
        let scale = size / (WORLD_SIZE * 1.15);
        let to_map = |x: f32, z: f32| -> Vec2 { vec2(mx + size / 2.0 + x * scale, my + size / 2.0 + z * scale) };

        draw_rectangle(mx, my, size, size, Color::from_rgba(15, 35, 60, 220));
        draw_circle(mx + size / 2.0, my + size / 2.0, HALF * scale, Color::from_rgba(77, 138, 69, 255));
        // storm
        let sc = to_map(self.storm.center.x, self.storm.center.y);
        draw_circle_lines(sc.x, sc.y, self.storm.radius * scale, 2.0, Color::from_rgba(196, 77, 232, 255));
        // bus
        if self.phase == Phase::Bus {
            let bp = self.bus_start.lerp(self.bus_end, self.bus_t);
            let m = to_map(bp.x, bp.z);
            draw_circle(m.x, m.y, 4.0, Color::from_rgba(255, 210, 77, 255));
        }
        // player
        let pm = to_map(self.player.pos.x, self.player.pos.z);
        let fwd = vec2(self.cam.yaw.sin(), self.cam.yaw.cos()) * 7.0;
        let side = vec2(fwd.y, -fwd.x) * 0.45;
        draw_triangle(pm + fwd, pm - fwd * 0.4 + side, pm - fwd * 0.4 - side, WHITE);
    }
}

/// 2D gradient sky with a soft sun, drawn before the 3D pass each frame.
fn draw_sky() {
    let sw = screen_width();
    let sh = screen_height();
    let top = vec3(0.24, 0.42, 0.72);
    let horizon = vec3(0.74, 0.83, 0.90);
    let strips = 40usize;
    for i in 0..strips {
        let f0 = i as f32 / strips as f32;
        let y = f0 * sh;
        let hh = sh / strips as f32 + 1.0;
        let f = clampf(f0 / 0.66, 0.0, 1.0);
        let c = top.lerp(horizon, f);
        draw_rectangle(0.0, y, sw, hh, Color::new(c.x, c.y, c.z, 1.0));
    }
    // soft sun: stacked translucent discs plus a bright core
    let sx = sw * 0.74;
    let sy = sh * 0.20;
    for r in (0..7).rev() {
        let rad = 30.0 + r as f32 * 30.0;
        draw_circle(sx, sy, rad, Color::new(1.0, 0.94, 0.78, 0.06));
    }
    draw_circle(sx, sy, 30.0, Color::new(1.0, 0.98, 0.9, 0.95));
}

// ============================================================ main
fn window_conf() -> Conf {
    Conf {
        window_title: "Oneshot Royale".to_string(),
        window_width: 1280,
        window_height: 720,
        high_dpi: true,
        ..Default::default()
    }
}

#[macroquad::main(window_conf)]
async fn main() {
    let mut game = Game::new();
    let sky = Color::from_rgba(135, 181, 224, 255);

    loop {
        let dt = get_frame_time().min(0.05);
        let t = get_time();
        game.match_time += dt as f64;

        clear_background(sky);

        match game.phase {
            Phase::Menu => {
                if game.grabbed {
                    set_cursor_grab(false);
                    show_mouse(true);
                    game.grabbed = false;
                }
                draw_menu(&mut game);
            }
            Phase::Bus => {
                if !game.grabbed {
                    set_cursor_grab(true);
                    show_mouse(false);
                    game.grabbed = true;
                    game.cam.last_mouse = vec2(mouse_position().0, mouse_position().1);
                }
                let _ = game.cam.mouse_delta(); // swallow deltas on the bus
                game.bus_t += dt / 24.0;
                game.storm.update(dt);
                let bus_pos = game.bus_start.lerp(game.bus_end, game.bus_t.min(1.0));
                let over_island = vec2(bus_pos.x, bus_pos.z).length() < WORLD_SIZE * 0.55;
                let can_drop = game.bus_t > 0.10 && over_island;

                if (is_key_pressed(KeyCode::Space) && can_drop) || game.bus_t >= 0.92 {
                    game.player.pos = if game.bus_t >= 0.92 { vec3(rng(-80.0, 80.0), 110.0, rng(-80.0, 80.0)) } else { bus_pos };
                    game.player.vel = vec3(0.0, -5.0, 0.0);
                    game.phase = Phase::Skydive;
                }

                // camera follows bus
                let cam = Camera3D {
                    position: bus_pos + vec3(-18.0, 12.0, 18.0),
                    target: bus_pos,
                    up: vec3(0.0, 1.0, 0.0),
                    fovy: 1.15,
                    ..Default::default()
                };
                draw_sky();
                set_camera(&cam);
                game.draw_world_3d(t);
                // the bus
                draw_cube(bus_pos, vec3(7.0, 3.0, 3.0), None, Color::from_rgba(63, 111, 212, 255));
                draw_sphere(bus_pos + vec3(0.0, 6.5, 0.0), 4.0, None, Color::from_rgba(124, 77, 255, 255));
                game.update_bots(dt, t);

                set_default_camera();
                game.draw_hud(dt, &None, t);
                let msg = if can_drop { "Press SPACE to drop" } else { "Approaching the island..." };
                hud_text_center("BATTLE BUS", screen_width() / 2.0, screen_height() * 0.3, 34.0, WHITE);
                hud_text_center(msg, screen_width() / 2.0, screen_height() * 0.3 + 34.0, 22.0, Color::from_rgba(255, 210, 77, 255));
            }
            Phase::Skydive | Phase::Glide => {
                let d = game.cam.mouse_delta();
                game.cam.look(d.x, d.y);

                let gliding = game.phase == Phase::Glide;
                if is_key_pressed(KeyCode::Space) && !gliding {
                    game.phase = Phase::Glide;
                }
                let target_fall = if gliding { -7.0 } else { -38.0 };
                game.player.vel.y += (target_fall - game.player.vel.y) * (dt * 2.2).min(1.0);

                let mut mv = vec2(0.0, 0.0);
                if is_key_down(KeyCode::W) { mv.y += 1.0; }
                if is_key_down(KeyCode::S) { mv.y -= 1.0; }
                if is_key_down(KeyCode::D) { mv.x += 1.0; }
                if is_key_down(KeyCode::A) { mv.x -= 1.0; }
                let speed = if gliding { 11.0 } else { 14.0 };
                let move3 = game.cam.forward_flat() * mv.y + game.cam.right_flat() * mv.x;
                game.player.pos += move3 * speed * dt;
                game.player.pos.y += game.player.vel.y * dt;
                game.player.body_yaw = game.cam.yaw;

                let ground = terrain_height(game.player.pos.x, game.player.pos.z);
                if game.phase == Phase::Skydive && game.player.pos.y - ground < 30.0 {
                    game.phase = Phase::Glide;
                }
                if game.player.pos.y <= ground {
                    game.player.pos.y = ground;
                    game.player.vel = Vec3::ZERO;
                    game.phase = Phase::Playing;
                    game.cam.add_trauma(0.25);
                    game.burst(vec3(game.player.pos.x, ground + 0.1, game.player.pos.z), Color::new(0.72, 0.66, 0.55, 1.0), 16, 5.0, 0.7, 0.13, 10.0, 0.6);
                    game.notify("Good luck!");
                }

                game.storm.update(dt);
                game.update_bots(dt, t);
                game.cam.update(dt, game.player.pos, &game.static_colliders(), 1.15);

                draw_sky();
                set_camera(&game.cam.camera3d());
                game.draw_world_3d(t);
                draw_character(game.player.pos, game.player.body_yaw, Color::from_rgba(47, 159, 224, 255), 0.0, None, 0.0, false);
                if gliding {
                    draw_cube(game.player.pos + vec3(0.0, 2.6, 0.0), vec3(3.4, 0.15, 1.2), None, Color::from_rgba(255, 210, 77, 255));
                }

                set_default_camera();
                game.draw_hud(dt, &None, t);
                let alt = (game.player.pos.y - ground).max(0.0) as i32;
                hud_text_center(&format!("{}m", alt), screen_width() / 2.0, screen_height() * 0.3, 40.0, Color::from_rgba(255, 210, 77, 255));
                if !gliding {
                    hud_text_center("SPACE to deploy glider", screen_width() / 2.0, screen_height() * 0.3 + 30.0, 20.0, WHITE);
                }
            }
            Phase::Playing => {
                let mut input = read_input();
                input.look = game.cam.mouse_delta();
                game.cam.look(input.look.x, input.look.y);

                // build mode toggle
                if input.q {
                    game.build_mode = !game.build_mode;
                }

                let w_cfg = game.player.weapon().cfg();
                let aiming = input.aim && !game.build_mode && !w_cfg.melee;
                game.cam.aiming = aiming;
                let sprinting = input.sprint && input.move_y > 0.0 && !aiming && !game.build_mode;
                let target_fov = 1.15 * if aiming { w_cfg.ads_zoom } else if sprinting { 1.09 } else { 1.0 };

                if game.build_mode {
                    game.update_build_mode(&input);
                } else {
                    let want_fire = if w_cfg.auto { input.fire_down } else { input.fire_pressed };
                    if want_fire {
                        game.player_fire(t, aiming);
                    }
                }

                game.update_player(dt, t, &input);
                game.update_bots(dt, t);
                game.storm.update(dt);
                if game.storm.outside(game.player.pos) {
                    game.player.take_damage(game.storm.dps * dt);
                }
                let prompt = game.update_interactions();

                game.cam.update(dt, game.player.pos, &game.static_colliders(), target_fov);

                // crosshair spread
                let moving = vec2(game.player.vel.x, game.player.vel.z).length() > 1.0;
                let spread_target = if aiming { 3.0 } else if moving { 14.0 } else { 8.0 };
                game.cross_spread = lerpf(game.cross_spread, spread_target, damp(10.0, dt));

                draw_sky();
                set_camera(&game.cam.camera3d());
                game.draw_world_3d(t);
                let scope = aiming && w_cfg.scope;
                if !scope {
                    draw_character(
                        game.player.pos,
                        game.player.body_yaw,
                        Color::from_rgba(47, 159, 224, 255),
                        game.player.walk_phase,
                        Some((game.player.weapon().t, game.player.weapon().rarity)),
                        game.cam.pitch,
                        aiming || input.fire_down,
                    );
                }
                // build preview ghost
                if game.build_mode {
                    let (b, valid) = game.build_preview();
                    let bb = b.aabb();
                    let col = if valid && game.player.mats[game.mat_idx] >= MAT_COST {
                        Color::new(0.27, 0.8, 1.0, 0.35)
                    } else {
                        Color::new(1.0, 0.27, 0.27, 0.35)
                    };
                    draw_cube(bb.center(), bb.size(), None, col);
                    draw_cube_wires(bb.center(), bb.size(), Color::new(0.5, 0.9, 1.0, 0.8));
                }

                set_default_camera();
                game.draw_hud(dt, &prompt, t);

                // end conditions
                if !game.player.alive {
                    game.phase = Phase::Ended { victory: false };
                } else if game.bots.iter().all(|b| !b.alive) {
                    game.phase = Phase::Ended { victory: true };
                }
            }
            Phase::Ended { victory } => {
                if game.grabbed {
                    set_cursor_grab(false);
                    show_mouse(true);
                    game.grabbed = false;
                }
                draw_end_screen(&mut game, victory);
            }
        }

        // decay fx + hud timers
        for tr in game.tracers.iter_mut() { tr.life -= dt; }
        game.tracers.retain(|x| x.life > 0.0);
        for im in game.impacts.iter_mut() { im.life -= dt; }
        game.impacts.retain(|x| x.life > 0.0);
        for p in game.particles.iter_mut() {
            p.vel.y -= p.gravity * dt;
            p.vel *= 1.0 - damp(2.0, dt); // mild air drag
            p.pos += p.vel * dt;
            p.life -= dt;
        }
        game.particles.retain(|x| x.life > 0.0);
        for dn in game.dmg_nums.iter_mut() { dn.life -= dt; }
        game.dmg_nums.retain(|x| x.life > 0.0);
        for d in game.dmg_dirs.iter_mut() { d.life -= dt; }
        game.dmg_dirs.retain(|x| x.life > 0.0);
        for f in game.feed.iter_mut() { f.life -= dt; }
        game.feed.retain(|x| x.life > 0.0);
        game.notify.1 -= dt;
        game.hitmarker -= dt;
        game.muzzle_flash = (game.muzzle_flash - dt * 14.0).max(0.0);
        game.hit_flash = (game.hit_flash - dt * 4.0).max(0.0);
        game.elim_flash = (game.elim_flash - dt * 2.0).max(0.0);
        game.dmg_flash = (game.dmg_flash - dt * 2.5).max(0.0);

        next_frame().await;
    }
}

fn draw_menu(game: &mut Game) {
    let sw = screen_width();
    let sh = screen_height();
    draw_rectangle(0.0, 0.0, sw, sh, Color::from_rgba(10, 16, 32, 255));
    let gold = Color::from_rgba(255, 210, 77, 255);
    hud_text_center("ONESHOT ROYALE", sw / 2.0, sh * 0.28, 72.0, gold);
    hud_text_center("BATTLE ROYALE  ·  RUST + WASM  ·  RUNS IN YOUR BROWSER", sw / 2.0, sh * 0.28 + 34.0, 18.0, GRAY);

    // button
    let bw = 260.0;
    let bh = 64.0;
    let bx = sw / 2.0 - bw / 2.0;
    let by = sh * 0.42;
    let (mx, my) = mouse_position();
    let hover = mx > bx && mx < bx + bw && my > by && my < by + bh;
    draw_rectangle(bx, by, bw, bh, if hover { Color::from_rgba(255, 226, 122, 255) } else { gold });
    let dim = measure_text("DROP IN", None, 32, 1.0);
    draw_text("DROP IN", sw / 2.0 - dim.width / 2.0, by + 42.0, 32.0, Color::from_rgba(16, 24, 32, 255));
    if hover && is_mouse_button_pressed(MouseButton::Left) {
        game.start_match();
    }

    let controls = [
        "WASD move · Shift sprint · Space jump / drop / glider",
        "Mouse look · LMB fire · RMB aim · R reload · 1-5 weapons",
        "E open chests & pick up loot · Pickaxe harvests trees/rocks/cars",
        "Q build mode · 1-4 wall/floor/ramp/roof · RMB cycle material",
    ];
    for (i, c) in controls.iter().enumerate() {
        hud_text_center(c, sw / 2.0, sh * 0.62 + i as f32 * 30.0, 19.0, Color::new(1.0, 1.0, 1.0, 0.75));
    }
}

fn draw_end_screen(game: &mut Game, victory: bool) {
    let sw = screen_width();
    let sh = screen_height();
    draw_rectangle(0.0, 0.0, sw, sh, Color::from_rgba(10, 16, 32, 255));
    let gold = Color::from_rgba(255, 210, 77, 255);
    let title = if victory { "VICTORY ROYALE" } else { "ELIMINATED" };
    let tc = if victory { gold } else { Color::from_rgba(255, 90, 76, 255) };
    hud_text_center(title, sw / 2.0, sh * 0.32, 64.0, tc);
    let place = game.bots.iter().filter(|b| b.alive).count() + 1;
    let stats = if victory {
        format!("{} eliminations · survived {:.1} min", game.player.kills, game.match_time / 60.0)
    } else {
        format!("#{} of {} · {} eliminations · survived {:.1} min", place + 1, BOT_COUNT + 1, game.player.kills, game.match_time / 60.0)
    };
    hud_text_center(&stats, sw / 2.0, sh * 0.32 + 44.0, 24.0, Color::new(1.0, 1.0, 1.0, 0.85));

    let bw = 280.0;
    let bh = 60.0;
    let bx = sw / 2.0 - bw / 2.0;
    let by = sh * 0.52;
    let (mx, my) = mouse_position();
    let hover = mx > bx && mx < bx + bw && my > by && my < by + bh;
    draw_rectangle(bx, by, bw, bh, if hover { Color::from_rgba(255, 226, 122, 255) } else { gold });
    let dim = measure_text("PLAY AGAIN", None, 30, 1.0);
    draw_text("PLAY AGAIN", sw / 2.0 - dim.width / 2.0, by + 40.0, 30.0, Color::from_rgba(16, 24, 32, 255));
    if hover && is_mouse_button_pressed(MouseButton::Left) {
        game.start_match();
    }
}

// ============================================================ tests (native: `cargo test`)
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terrain_is_finite_and_island_shaped() {
        let mut land = 0;
        for iz in -24..24 {
            for ix in -24..24 {
                let (x, z) = (ix as f32 * 10.0, iz as f32 * 10.0);
                let h = terrain_height(x, z);
                assert!(h.is_finite(), "NaN height at {x},{z}");
                if h > 1.0 {
                    land += 1;
                }
            }
        }
        assert!(land > 200, "island too small: {land}");
        // edges are underwater
        assert!(terrain_height(HALF, HALF) < 0.5);
        assert!(terrain_height(0.0, 0.0) > 0.5);
    }

    #[test]
    fn ray_aabb_hits_and_misses() {
        let b = Aabb::new(vec3(0.0, 0.0, 10.0), Vec3::splat(1.0));
        let dir = vec3(0.0, 0.0, 1.0);
        let inv = Vec3::ONE / dir;
        let t = ray_aabb(vec3(0.0, 0.0, 0.0), inv, &b).expect("should hit");
        assert!((t - 9.0).abs() < 0.01, "t={t}");
        // miss to the side
        assert!(ray_aabb(vec3(5.0, 0.0, 0.0), inv, &b).is_none());
        // behind the origin
        let inv_back = Vec3::ONE / vec3(0.0, 0.0, -1.0);
        assert!(ray_aabb(vec3(0.0, 0.0, 0.0), inv_back, &b).is_none());
    }

    #[test]
    fn ray_terrain_hits_ground() {
        let origin = vec3(0.0, 50.0, 0.0);
        let t = ray_terrain(origin, vec3(0.0, -1.0, 0.0), 200.0).expect("should hit ground");
        let p = origin + vec3(0.0, -1.0, 0.0) * t;
        assert!((p.y - terrain_height(p.x, p.z)).abs() < 0.5, "landed at {} vs {}", p.y, terrain_height(p.x, p.z));
        // shooting up never hits
        assert!(ray_terrain(vec3(0.0, 50.0, 0.0), vec3(0.0, 1.0, 0.0), 200.0).is_none());
    }

    #[test]
    fn storm_shrinks_through_all_phases() {
        let mut s = Storm::new();
        let r0 = s.radius;
        for _ in 0..(60 * 60 * 10) {
            s.update(1.0 / 60.0);
        }
        assert!(s.phase >= STORM_PHASES.len(), "storm never finished: phase {}", s.phase);
        assert!(s.radius < 3.0, "final radius {}", s.radius);
        assert!(s.radius < r0);
        assert!(s.center.is_finite());
    }

    #[test]
    fn weapon_fire_cadence_and_reload() {
        let mut w = Weapon::new(WType::Ar, 2);
        assert_eq!(w.ammo, 30);
        assert!(w.can_fire(0.0));
        w.last_fire = 0.0;
        w.ammo -= 1;
        assert!(!w.can_fire(0.05), "fired faster than fire_rate");
        assert!(w.can_fire(0.2));
        // reload refills from reserve
        w.ammo = 0;
        w.start_reload(1.0);
        assert!(w.reloading);
        w.update(1.0 + wcfg(WType::Ar).reload as f64 + 0.01);
        assert_eq!(w.ammo, 30);
        assert!(!w.reloading);
        // rarity scales damage
        assert!(Weapon::new(WType::Ar, 4).damage() > Weapon::new(WType::Ar, 0).damage());
    }

    #[test]
    fn ramp_floor_height_rises_along_facing() {
        let b = Build { piece: Piece::Ramp, pos: vec3(0.0, 0.0, 0.0), yaw: 0.0, mat: 0, hp: 150.0, alive: true };
        // yaw 0 → rises toward +z
        let low = b.floor_height(0.0, -1.9).unwrap();
        let high = b.floor_height(0.0, 1.9).unwrap();
        assert!(low < 0.5, "low end {low}");
        assert!(high > 3.0, "high end {high}");
        assert!(b.floor_height(10.0, 0.0).is_none(), "outside the cell");
    }

    #[test]
    fn bot_shield_absorbs_before_health() {
        let mut b = Bot {
            name: "T", pos: Vec3::ZERO, yaw: 0.0, health: 100.0, shield: 25.0, alive: true,
            state: BotState::Roam, weapon: Weapon::new(WType::Ar, 0), accuracy: 0.1,
            reaction_until: 0.0, move_speed: 5.0, wander_target: vec2(0.0, 0.0),
            next_wander: 0.0, walk_phase: 0.0, color: WHITE,
        };
        b.take_damage(30.0);
        assert_eq!(b.shield, 0.0);
        assert!((b.health - 95.0).abs() < 0.01);
        b.take_damage(200.0);
        assert!(!b.alive);
    }

    #[test]
    fn player_slots_fill_and_replace() {
        let mut p = Player::new();
        assert_eq!(p.slot, 0);
        p.add_weapon(Weapon::new(WType::Ar, 0));
        assert_eq!(p.slot, 1, "auto-equip first pickup");
        for _ in 0..3 {
            p.add_weapon(Weapon::new(WType::Smg, 0));
        }
        assert!(p.slots.iter().all(|s| s.is_some()), "all slots filled");
        // next pickup replaces current slot
        p.add_weapon(Weapon::new(WType::Sniper, 3));
        assert_eq!(p.weapon().t, WType::Sniper);
    }

    #[test]
    fn hitscan_prefers_headshot_box() {
        // bot at origin; ray at head height should return head=true via head-first ordering
        let bot_head = Aabb::new(vec3(0.0, 1.68, 0.0), Vec3::splat(0.24));
        let dir = vec3(0.0, 0.0, 1.0);
        let inv = Vec3::ONE / dir;
        assert!(ray_aabb(vec3(0.0, 1.68, -5.0), inv, &bot_head).is_some());
        let bot_body = Aabb::new(vec3(0.0, 0.95, 0.0), vec3(0.45, 0.95, 0.45));
        assert!(ray_aabb(vec3(0.0, 0.9, -5.0), inv, &bot_body).is_some());
    }

    // ---------------------------------------------------------- controls
    fn game_with_two_guns() -> Game {
        let mut g = Game::new();
        g.player.slots[1] = Some(Weapon::new(WType::Ar, 0));
        g.player.slots[2] = Some(Weapon::new(WType::Smg, 0));
        g.player.slot = 1; // AR equipped
        g
    }

    #[test]
    fn build_mode_number_key_selects_piece_not_weapon() {
        let mut g = game_with_two_guns();
        g.build_mode = true;
        let mut input = Input::default();
        input.num[2] = true; // "3": pick build piece, must NOT switch to weapon slot 2
        g.update_build_mode(&input);
        g.update_player(0.016, 1.0, &input);
        assert_eq!(g.piece_idx, 2, "number key should select build piece");
        assert_eq!(g.player.slot, 1, "number keys must not switch weapon while building");
    }

    #[test]
    fn build_mode_r_rotates_without_reloading() {
        let mut g = game_with_two_guns();
        g.build_mode = true;
        g.player.weapon_mut().ammo = 0; // an empty mag *could* reload — it must not, mid-build
        let rot0 = g.build_rot;
        let mut input = Input::default();
        input.r = true;
        g.update_build_mode(&input);
        g.update_player(0.016, 1.0, &input);
        assert_ne!(g.build_rot, rot0, "R should rotate the build piece");
        assert!(!g.player.weapon().reloading, "R must not reload while building");
    }

    #[test]
    fn combat_number_key_switches_weapon() {
        let mut g = game_with_two_guns();
        g.build_mode = false;
        let mut input = Input::default();
        input.num[2] = true;
        g.update_player(0.016, 1.0, &input);
        assert_eq!(g.player.slot, 2, "number key switches weapon in combat");
    }

    #[test]
    fn combat_r_reloads() {
        let mut g = game_with_two_guns();
        g.build_mode = false;
        g.player.weapon_mut().ammo = 0;
        let mut input = Input::default();
        input.r = true;
        g.update_player(0.016, 1.0, &input);
        assert!(g.player.weapon().reloading, "R reloads in combat");
    }

    #[test]
    fn forward_moves_along_camera_facing() {
        let mut g = Game::new();
        g.cam.yaw = 0.0; // forward_flat = +z
        g.player.grounded = true;
        let mut input = Input::default();
        input.move_y = 1.0; // W
        g.update_player(0.016, 1.0, &input);
        assert!(g.player.vel.z > 1.0, "W moves along camera forward (+z): {:?}", g.player.vel);
        assert!(g.player.vel.x.abs() < 0.5, "no lateral drift: {:?}", g.player.vel);
    }

    #[test]
    fn strafe_moves_along_camera_right() {
        let mut g = Game::new();
        g.cam.yaw = 0.0; // right_flat = +x
        g.player.grounded = true;
        let mut input = Input::default();
        input.move_x = 1.0; // D
        g.update_player(0.016, 1.0, &input);
        assert!(g.player.vel.x > 1.0, "D strafes right (+x): {:?}", g.player.vel);
    }

    #[test]
    fn jump_only_launches_when_grounded() {
        let mut g = Game::new();
        g.player.pos = vec3(0.0, terrain_height(0.0, 0.0), 0.0);
        g.player.grounded = true;
        let mut input = Input::default();
        input.jump = true;
        g.update_player(0.016, 1.0, &input);
        assert!(g.player.vel.y > 0.0, "jump launches upward when grounded");
        assert!(!g.player.grounded, "airborne after jump");
        let vy = g.player.vel.y;
        g.update_player(0.016, 1.0, &input); // still holding jump, now airborne
        assert!(g.player.vel.y < vy, "no double-jump: only gravity applies mid-air");
    }
}
