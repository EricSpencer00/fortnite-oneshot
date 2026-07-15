// Math + procedural helpers shared by every system.

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
// Framerate-independent exponential smoothing factor
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Deterministic value-noise with fBM, used for terrain and foliage placement.
export class Noise2D {
    constructor(seed = 1337) {
        this.seed = seed;
    }
    hash(ix, iz) {
        let h = ix * 374761393 + iz * 668265263 + this.seed * 1442695041;
        h = (h ^ (h >> 13)) * 1274126177;
        h = h ^ (h >> 16);
        return (h >>> 0) / 4294967295;
    }
    smooth(t) {
        return t * t * (3 - 2 * t);
    }
    value(x, z) {
        const ix = Math.floor(x), iz = Math.floor(z);
        const fx = this.smooth(x - ix), fz = this.smooth(z - iz);
        const a = this.hash(ix, iz), b = this.hash(ix + 1, iz);
        const c = this.hash(ix, iz + 1), d = this.hash(ix + 1, iz + 1);
        return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
    }
    fbm(x, z, octaves = 4, lacunarity = 2, gain = 0.5) {
        let amp = 1, freq = 1, sum = 0, norm = 0;
        for (let i = 0; i < octaves; i++) {
            sum += amp * this.value(x * freq, z * freq);
            norm += amp;
            amp *= gain;
            freq *= lacunarity;
        }
        return sum / norm;
    }
}

export const BOT_NAMES = [
    'Raptor', 'Nomad', 'Wildcat', 'Drift', 'Hollow', 'Bonesy', 'Rook', 'Sledge',
    'Vega', 'Onyx', 'Kestrel', 'Mako', 'Fable', 'Torque', 'Ember', 'Grit',
    'Pylon', 'Havoc', 'Lumen', 'Static', 'Coil', 'Frostbite', 'Saber', 'Quill'
];
