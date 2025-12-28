import * as THREE from 'three';
import { randomRange, randomFromArray } from '../utils/math.js';

// Named spawn locations
const SPAWN_POINTS = [
    { name: 'Pleasant Park', x: 0, z: 0, radius: 30 },
    { name: 'Tilted Towers', x: 100, z: 80, radius: 40 },
    { name: 'Retail Row', x: -100, z: 60, radius: 35 },
    { name: 'Salty Springs', x: 60, z: -80, radius: 25 },
    { name: 'Lonely Lodge', x: -80, z: -100, radius: 25 },
    { name: 'Fatal Fields', x: 120, z: -60, radius: 30 },
    { name: 'Moisty Mire', x: -120, z: 100, radius: 25 }
];

export class SpawnManager {
    constructor(island) {
        this.island = island;
        this.usedSpawnPoints = new Set();
    }
    
    getPlayerSpawnPoint() {
        // Player spawns at a random POI
        const poi = randomFromArray(SPAWN_POINTS);
        const angle = Math.random() * Math.PI * 2;
        const radius = randomRange(0, poi.radius * 0.5);
        
        const x = poi.x + Math.cos(angle) * radius;
        const z = poi.z + Math.sin(angle) * radius;
        const y = this.island.getHeightAt(x, z) + 1;
        
        this.usedSpawnPoints.add(poi.name);
        
        return new THREE.Vector3(x, Math.max(y, 1), z);
    }
    
    getBotSpawnPoints(count, playerPosition) {
        const spawns = [];
        const minDistanceFromPlayer = 50;
        const minDistanceBetweenBots = 20;
        
        const availablePOIs = SPAWN_POINTS.filter(poi => {
            const dist = Math.sqrt(
                Math.pow(poi.x - playerPosition.x, 2) + 
                Math.pow(poi.z - playerPosition.z, 2)
            );
            return dist > minDistanceFromPlayer;
        });
        
        for (let i = 0; i < count; i++) {
            let attempts = 0;
            let validSpawn = null;
            
            while (attempts < 50 && !validSpawn) {
                // Random position within island bounds
                const angle = Math.random() * Math.PI * 2;
                const radius = randomRange(30, 200);
                const x = Math.cos(angle) * radius;
                const z = Math.sin(angle) * radius;
                const y = this.island.getHeightAt(x, z);
                
                if (y < 0) {
                    attempts++;
                    continue;
                }
                
                const pos = new THREE.Vector3(x, y + 1, z);
                
                // Check distance from player
                if (pos.distanceTo(playerPosition) < minDistanceFromPlayer) {
                    attempts++;
                    continue;
                }
                
                // Check distance from other bots
                let tooClose = false;
                for (const spawn of spawns) {
                    if (pos.distanceTo(spawn) < minDistanceBetweenBots) {
                        tooClose = true;
                        break;
                    }
                }
                
                if (tooClose) {
                    attempts++;
                    continue;
                }
                
                validSpawn = pos;
            }
            
            if (validSpawn) {
                spawns.push(validSpawn);
            } else {
                // Fallback: spawn at random POI
                const poi = randomFromArray(availablePOIs.length > 0 ? availablePOIs : SPAWN_POINTS);
                const angle = Math.random() * Math.PI * 2;
                const radius = randomRange(0, poi.radius);
                const x = poi.x + Math.cos(angle) * radius;
                const z = poi.z + Math.sin(angle) * radius;
                const y = Math.max(this.island.getHeightAt(x, z), 0) + 1;
                spawns.push(new THREE.Vector3(x, y, z));
            }
        }
        
        return spawns;
    }
    
    getPickupSpawnPoints(count) {
        const spawns = [];
        
        for (let i = 0; i < count; i++) {
            const poi = randomFromArray(SPAWN_POINTS);
            const angle = Math.random() * Math.PI * 2;
            const radius = randomRange(0, poi.radius);
            const x = poi.x + Math.cos(angle) * radius;
            const z = poi.z + Math.sin(angle) * radius;
            const y = Math.max(this.island.getHeightAt(x, z), 0) + 0.5;
            
            spawns.push(new THREE.Vector3(x, y, z));
        }
        
        return spawns;
    }
    
    getRandomPosition(minRadius = 20, maxRadius = 200) {
        const angle = Math.random() * Math.PI * 2;
        const radius = randomRange(minRadius, maxRadius);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = Math.max(this.island.getHeightAt(x, z), 0) + 1;
        
        return new THREE.Vector3(x, y, z);
    }
}
