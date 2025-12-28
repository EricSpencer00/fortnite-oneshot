import * as THREE from 'three';
import { randomFromArray } from '../utils/math.js';

// Pickup types
const PICKUP_TYPES = {
    HEALTH: {
        name: 'Med Kit',
        color: 0x4CAF50,
        value: 50,
        effect: 'health'
    },
    SHIELD: {
        name: 'Shield Potion',
        color: 0x2196F3,
        value: 50,
        effect: 'shield'
    },
    SMALL_SHIELD: {
        name: 'Mini Shield',
        color: 0x03A9F4,
        value: 25,
        effect: 'shield'
    },
    AR_AMMO: {
        name: 'AR Ammo',
        color: 0x7C4DFF,
        value: 30,
        effect: 'ammo',
        weaponType: 'AR'
    },
    SHOTGUN_AMMO: {
        name: 'Shotgun Ammo',
        color: 0xFF5722,
        value: 10,
        effect: 'ammo',
        weaponType: 'SHOTGUN'
    },
    SMG_AMMO: {
        name: 'SMG Ammo',
        color: 0x8BC34A,
        value: 40,
        effect: 'ammo',
        weaponType: 'SMG'
    }
};

// Loot table for bot drops
const LOOT_TABLE = [
    { type: 'HEALTH', weight: 15 },
    { type: 'SHIELD', weight: 15 },
    { type: 'SMALL_SHIELD', weight: 20 },
    { type: 'AR_AMMO', weight: 15 },
    { type: 'SHOTGUN_AMMO', weight: 15 },
    { type: 'SMG_AMMO', weight: 20 }
];

export class Pickup {
    constructor(scene, position, type) {
        this.scene = scene;
        this.position = position.clone();
        this.type = type;
        this.config = PICKUP_TYPES[type];
        this.collected = false;
        this.lifetime = 60; // seconds before despawn
        
        this.createMesh();
    }
    
    createMesh() {
        // Main pickup body
        const geometry = new THREE.BoxGeometry(0.8, 0.5, 0.8);
        const material = new THREE.MeshStandardMaterial({
            color: this.config.color,
            roughness: 0.3,
            metalness: 0.5,
            emissive: this.config.color,
            emissiveIntensity: 0.3
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;
        this.mesh.userData.isPickup = true;
        this.mesh.userData.pickupType = this.type;
        
        // Glow effect
        const glowGeometry = new THREE.SphereGeometry(0.8, 16, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: this.config.color,
            transparent: true,
            opacity: 0.2
        });
        this.glow = new THREE.Mesh(glowGeometry, glowMaterial);
        this.mesh.add(this.glow);
        
        this.scene.add(this.mesh);
    }
    
    update(deltaTime, time) {
        if (this.collected) return;
        
        // Floating animation
        this.mesh.position.y = this.position.y + Math.sin(time * 2) * 0.2 + 0.5;
        
        // Rotation
        this.mesh.rotation.y += deltaTime * 2;
        
        // Pulse glow
        this.glow.scale.setScalar(1 + Math.sin(time * 3) * 0.1);
        
        // Lifetime
        this.lifetime -= deltaTime;
    }
    
    isExpired() {
        return this.lifetime <= 0;
    }
    
    collect() {
        this.collected = true;
        this.scene.remove(this.mesh);
    }
    
    getCollider() {
        return this.mesh;
    }
    
    dispose() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.glow.geometry.dispose();
        this.glow.material.dispose();
    }
}

export class PickupManager {
    constructor(scene) {
        this.scene = scene;
        this.pickups = [];
    }
    
    spawnPickup(position, type = null) {
        if (!type) {
            type = this.getRandomLoot();
        }
        
        const pickup = new Pickup(this.scene, position, type);
        this.pickups.push(pickup);
        return pickup;
    }
    
    spawnLootDrop(position, count = 2) {
        const drops = [];
        for (let i = 0; i < count; i++) {
            const offset = new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                0,
                (Math.random() - 0.5) * 2
            );
            const dropPos = position.clone().add(offset);
            drops.push(this.spawnPickup(dropPos));
        }
        return drops;
    }
    
    getRandomLoot() {
        const totalWeight = LOOT_TABLE.reduce((sum, item) => sum + item.weight, 0);
        let random = Math.random() * totalWeight;
        
        for (const item of LOOT_TABLE) {
            random -= item.weight;
            if (random <= 0) {
                return item.type;
            }
        }
        
        return LOOT_TABLE[0].type;
    }
    
    update(deltaTime, time) {
        for (let i = this.pickups.length - 1; i >= 0; i--) {
            const pickup = this.pickups[i];
            pickup.update(deltaTime, time);
            
            if (pickup.collected || pickup.isExpired()) {
                pickup.dispose();
                this.pickups.splice(i, 1);
            }
        }
    }
    
    checkCollection(playerPosition, range = 3) {
        const collected = [];
        
        for (const pickup of this.pickups) {
            if (pickup.collected) continue;
            
            const dist = pickup.position.distanceTo(playerPosition);
            if (dist < range) {
                collected.push(pickup);
            }
        }
        
        return collected;
    }
    
    getNearbyPickup(playerPosition, range = 3) {
        let closest = null;
        let closestDist = range;
        
        for (const pickup of this.pickups) {
            if (pickup.collected) continue;
            
            const dist = pickup.position.distanceTo(playerPosition);
            if (dist < closestDist) {
                closest = pickup;
                closestDist = dist;
            }
        }
        
        return closest;
    }
    
    collectPickup(pickup, player) {
        if (!pickup || pickup.collected) return null;
        
        const config = pickup.config;
        let message = null;
        
        switch (config.effect) {
            case 'health':
                if (player.health < player.maxHealth) {
                    player.heal(config.value);
                    pickup.collect();
                    message = `+${config.value} Health`;
                }
                break;
            case 'shield':
                if (player.shield < player.maxShield) {
                    player.addShield(config.value);
                    pickup.collect();
                    message = `+${config.value} Shield`;
                }
                break;
            case 'ammo':
                const weaponIndex = { AR: 0, SHOTGUN: 1, SMG: 2 }[config.weaponType];
                if (weaponIndex !== undefined) {
                    player.weaponManager.weapons[weaponIndex].addAmmo(config.value);
                    pickup.collect();
                    message = `+${config.value} ${config.weaponType} Ammo`;
                }
                break;
        }
        
        return message;
    }
    
    dispose() {
        for (const pickup of this.pickups) {
            pickup.dispose();
        }
        this.pickups = [];
    }
}
