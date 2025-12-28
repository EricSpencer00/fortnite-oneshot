import * as THREE from 'three';
import { randomRange, randomFromArray } from '../utils/math.js';

// Building presets
const BUILDING_TYPES = {
    house: {
        width: { min: 8, max: 12 },
        depth: { min: 8, max: 12 },
        height: { min: 6, max: 10 },
        floors: 1,
        hasRoof: true
    },
    tower: {
        width: { min: 6, max: 8 },
        depth: { min: 6, max: 8 },
        height: { min: 15, max: 25 },
        floors: 3,
        hasRoof: true
    },
    warehouse: {
        width: { min: 15, max: 25 },
        depth: { min: 10, max: 15 },
        height: { min: 8, max: 12 },
        floors: 1,
        hasRoof: true
    },
    shed: {
        width: { min: 4, max: 6 },
        depth: { min: 4, max: 6 },
        height: { min: 3, max: 5 },
        floors: 1,
        hasRoof: true
    }
};

const BUILDING_COLORS = [
    0xECEFF1, // White-ish
    0xFFCDD2, // Pink
    0xC8E6C9, // Green
    0xBBDEFB, // Blue
    0xFFE0B2, // Orange
    0xE1BEE7, // Purple
    0xF5F5F5, // Grey
    0xFFF9C4  // Yellow
];

export class Buildings {
    constructor(scene, island) {
        this.scene = scene;
        this.island = island;
        this.buildings = [];
        this.colliders = [];
        
        this.createPOIs();
    }
    
    createPOIs() {
        // Define POI locations (named areas)
        const pois = [
            { name: 'Pleasant Park', x: 0, z: 0, buildings: 8 },
            { name: 'Tilted Towers', x: 100, z: 80, buildings: 12 },
            { name: 'Retail Row', x: -100, z: 60, buildings: 10 },
            { name: 'Salty Springs', x: 60, z: -80, buildings: 6 },
            { name: 'Lonely Lodge', x: -80, z: -100, buildings: 5 },
            { name: 'Fatal Fields', x: 120, z: -60, buildings: 4 },
            { name: 'Moisty Mire', x: -120, z: 100, buildings: 3 }
        ];
        
        for (const poi of pois) {
            this.createPOI(poi);
        }
    }
    
    createPOI(poi) {
        const buildingCount = poi.buildings;
        const spreadRadius = Math.sqrt(buildingCount) * 15;
        
        for (let i = 0; i < buildingCount; i++) {
            const angle = (i / buildingCount) * Math.PI * 2 + randomRange(-0.3, 0.3);
            const radius = randomRange(5, spreadRadius);
            const x = poi.x + Math.cos(angle) * radius;
            const z = poi.z + Math.sin(angle) * radius;
            const y = this.island.getHeightAt(x, z);
            
            if (y < 0) continue; // Skip if below water
            
            const typeKey = randomFromArray(Object.keys(BUILDING_TYPES));
            const building = this.createBuilding(typeKey);
            building.position.set(x, y, z);
            building.rotation.y = randomRange(0, Math.PI * 2);
            
            this.scene.add(building);
            this.buildings.push(building);
            
            // Add all mesh children as colliders
            building.traverse(child => {
                if (child.isMesh) {
                    this.colliders.push(child);
                }
            });
        }
    }
    
    createBuilding(typeKey) {
        const type = BUILDING_TYPES[typeKey];
        const group = new THREE.Group();
        
        const width = randomRange(type.width.min, type.width.max);
        const depth = randomRange(type.depth.min, type.depth.max);
        const height = randomRange(type.height.min, type.height.max);
        const color = randomFromArray(BUILDING_COLORS);
        
        // Main structure
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.9,
            metalness: 0.0
        });
        
        const floorHeight = height / type.floors;
        
        for (let floor = 0; floor < type.floors; floor++) {
            const floorY = floor * floorHeight;
            
            // Walls
            this.createWalls(group, width, depth, floorHeight, floorY, wallMaterial);
            
            // Floor platform
            if (floor > 0) {
                const floorGeo = new THREE.BoxGeometry(width - 0.2, 0.3, depth - 0.2);
                const floorMesh = new THREE.Mesh(floorGeo, wallMaterial);
                floorMesh.position.set(0, floorY, 0);
                floorMesh.castShadow = true;
                floorMesh.receiveShadow = true;
                group.add(floorMesh);
            }
        }
        
        // Roof
        if (type.hasRoof) {
            this.createRoof(group, width, depth, height);
        }
        
        // Windows
        this.addWindows(group, width, depth, height, type.floors);
        
        // Door
        this.addDoor(group, width, depth);
        
        return group;
    }
    
    createWalls(group, width, depth, height, floorY, material) {
        const wallThickness = 0.3;
        
        // Front wall (with door hole on ground floor)
        const frontWall = new THREE.BoxGeometry(width, height, wallThickness);
        const front = new THREE.Mesh(frontWall, material);
        front.position.set(0, floorY + height / 2, depth / 2);
        front.castShadow = true;
        front.receiveShadow = true;
        group.add(front);
        
        // Back wall
        const back = new THREE.Mesh(frontWall, material);
        back.position.set(0, floorY + height / 2, -depth / 2);
        back.castShadow = true;
        back.receiveShadow = true;
        group.add(back);
        
        // Left wall
        const sideWall = new THREE.BoxGeometry(wallThickness, height, depth);
        const left = new THREE.Mesh(sideWall, material);
        left.position.set(-width / 2, floorY + height / 2, 0);
        left.castShadow = true;
        left.receiveShadow = true;
        group.add(left);
        
        // Right wall
        const right = new THREE.Mesh(sideWall, material);
        right.position.set(width / 2, floorY + height / 2, 0);
        right.castShadow = true;
        right.receiveShadow = true;
        group.add(right);
    }
    
    createRoof(group, width, depth, height) {
        const roofMaterial = new THREE.MeshStandardMaterial({
            color: 0x5D4037,
            roughness: 0.9
        });
        
        // Peaked roof
        const roofGeometry = new THREE.ConeGeometry(
            Math.max(width, depth) * 0.75,
            3,
            4
        );
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.position.set(0, height + 1.5, 0);
        roof.rotation.y = Math.PI / 4;
        roof.castShadow = true;
        roof.receiveShadow = true;
        group.add(roof);
    }
    
    addWindows(group, width, depth, height, floors) {
        const windowMaterial = new THREE.MeshStandardMaterial({
            color: 0x81D4FA,
            roughness: 0.1,
            metalness: 0.8,
            transparent: true,
            opacity: 0.7
        });
        
        const windowWidth = 1.5;
        const windowHeight = 2;
        const windowDepth = 0.1;
        const floorHeight = height / floors;
        
        for (let floor = 0; floor < floors; floor++) {
            const windowY = floor * floorHeight + floorHeight * 0.6;
            
            // Windows on each side
            const windowsPerSide = Math.floor(width / 4);
            for (let i = 0; i < windowsPerSide; i++) {
                const windowX = (i - (windowsPerSide - 1) / 2) * 3;
                
                // Front windows
                const frontWindow = new THREE.Mesh(
                    new THREE.BoxGeometry(windowWidth, windowHeight, windowDepth),
                    windowMaterial
                );
                frontWindow.position.set(windowX, windowY, depth / 2 + 0.1);
                group.add(frontWindow);
                
                // Back windows
                const backWindow = frontWindow.clone();
                backWindow.position.z = -depth / 2 - 0.1;
                group.add(backWindow);
            }
        }
    }
    
    addDoor(group, width, depth) {
        const doorMaterial = new THREE.MeshStandardMaterial({
            color: 0x4E342E,
            roughness: 0.9
        });
        
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(2, 3.5, 0.2),
            doorMaterial
        );
        door.position.set(0, 1.75, depth / 2 + 0.15);
        group.add(door);
    }
    
    getColliders() {
        return this.colliders;
    }
    
    getRandomBuildingPosition() {
        if (this.buildings.length === 0) return new THREE.Vector3(0, 0, 0);
        
        const building = randomFromArray(this.buildings);
        const offset = new THREE.Vector3(
            randomRange(-5, 5),
            0,
            randomRange(-5, 5)
        );
        return building.position.clone().add(offset);
    }
}
