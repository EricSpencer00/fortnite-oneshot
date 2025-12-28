import * as THREE from 'three';

// Perlin noise implementation
class PerlinNoise {
    constructor(seed = Math.random()) {
        this.permutation = [];
        for (let i = 0; i < 256; i++) {
            this.permutation[i] = i;
        }
        
        // Shuffle with seed
        let random = this.seededRandom(seed);
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [this.permutation[i], this.permutation[j]] = [this.permutation[j], this.permutation[i]];
        }
        
        // Duplicate
        this.permutation = [...this.permutation, ...this.permutation];
    }
    
    seededRandom(seed) {
        return function() {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
        };
    }
    
    fade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }
    
    lerp(a, b, t) {
        return a + t * (b - a);
    }
    
    grad(hash, x, y) {
        const h = hash & 3;
        const u = h < 2 ? x : y;
        const v = h < 2 ? y : x;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
    
    noise2D(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        
        x -= Math.floor(x);
        y -= Math.floor(y);
        
        const u = this.fade(x);
        const v = this.fade(y);
        
        const A = this.permutation[X] + Y;
        const B = this.permutation[X + 1] + Y;
        
        return this.lerp(
            this.lerp(this.grad(this.permutation[A], x, y), this.grad(this.permutation[B], x - 1, y), u),
            this.lerp(this.grad(this.permutation[A + 1], x, y - 1), this.grad(this.permutation[B + 1], x - 1, y - 1), u),
            v
        );
    }
    
    octaveNoise2D(x, y, octaves, persistence) {
        let total = 0;
        let frequency = 1;
        let amplitude = 1;
        let maxValue = 0;
        
        for (let i = 0; i < octaves; i++) {
            total += this.noise2D(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= 2;
        }
        
        return total / maxValue;
    }
}

export const perlin = new PerlinNoise(42);

// Math utilities
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function randomRange(min, max) {
    return Math.random() * (max - min) + min;
}

export function randomInt(min, max) {
    return Math.floor(randomRange(min, max + 1));
}

export function randomFromArray(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function distance2D(x1, z1, x2, z2) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    return Math.sqrt(dx * dx + dz * dz);
}

export function distance3D(p1, p2) {
    return p1.distanceTo(p2);
}

export function angleBetween(x1, z1, x2, z2) {
    return Math.atan2(x2 - x1, z2 - z1);
}

export function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

export function smoothDamp(current, target, velocity, smoothTime, maxSpeed, deltaTime) {
    smoothTime = Math.max(0.0001, smoothTime);
    const omega = 2 / smoothTime;
    const x = omega * deltaTime;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    let change = current - target;
    const maxChange = maxSpeed * smoothTime;
    change = clamp(change, -maxChange, maxChange);
    const temp = (velocity + omega * change) * deltaTime;
    velocity = (velocity - omega * temp) * exp;
    let output = target + (change + temp) * exp;
    if ((target - current > 0) === (output > target)) {
        output = target;
        velocity = 0;
    }
    return { value: output, velocity };
}

// Raycast helper
export function raycast(origin, direction, objects, maxDistance = 1000) {
    const raycaster = new THREE.Raycaster(origin, direction.normalize(), 0, maxDistance);
    return raycaster.intersectObjects(objects, true);
}

// Check line of sight
export function hasLineOfSight(from, to, obstacles) {
    const direction = to.clone().sub(from).normalize();
    const distance = from.distanceTo(to);
    const raycaster = new THREE.Raycaster(from, direction, 0, distance);
    const intersects = raycaster.intersectObjects(obstacles, true);
    return intersects.length === 0;
}

// Format time
export function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// UUID generator
export function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

// Ease functions
export const ease = {
    linear: t => t,
    quadIn: t => t * t,
    quadOut: t => t * (2 - t),
    quadInOut: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    cubicIn: t => t * t * t,
    cubicOut: t => (--t) * t * t + 1,
    cubicInOut: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1
};
