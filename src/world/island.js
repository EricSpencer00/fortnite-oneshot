import * as THREE from 'three';
import { perlin, randomRange } from '../utils/math.js';
import { textureManager } from '../utils/textures.js';

// Harvestable resource types
export const HARVEST_TYPES = {
    TREE: { material: 'WOOD', gives: 'wood', amount: 30, maxHits: 3 },
    ROCK: { material: 'STONE', gives: 'stone', amount: 20, maxHits: 4 },
    METAL: { material: 'METAL', gives: 'metal', amount: 15, maxHits: 5 }
};

export class Island {
    constructor(scene) {
        this.scene = scene;
        this.size = 500;
        this.heightScale = 15;
        this.resolution = 128;
        this.colliders = [];
        
        // Harvestable resources
        this.harvestables = [];
        
        this.createTerrain();
        this.createOcean();
        this.createTrees();
        this.createRocks();
        this.createMetalObjects();
    }
    
    createTerrain() {
        // Create terrain geometry
        const geometry = new THREE.PlaneGeometry(
            this.size, 
            this.size, 
            this.resolution, 
            this.resolution
        );
        
        // Apply height map
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const y = positions[i + 1];
            
            // Perlin noise for terrain
            let height = perlin.octaveNoise2D(x * 0.01, y * 0.01, 4, 0.5) * this.heightScale;
            
            // Flatten center area for gameplay
            const distFromCenter = Math.sqrt(x * x + y * y);
            const flattenFactor = Math.max(0, 1 - distFromCenter / 100);
            height *= (1 - flattenFactor * 0.8);
            
            // Lower edges towards ocean
            const edgeFactor = Math.max(0, (distFromCenter - this.size * 0.4) / (this.size * 0.1));
            height -= edgeFactor * 10;
            
            positions[i + 2] = height;
        }
        
        geometry.computeVertexNormals();
        geometry.rotateX(-Math.PI / 2);
        
        // Grass material with texture
        const grassMat = textureManager.getMaterial('grass');
        const material = grassMat || new THREE.MeshStandardMaterial({
            color: 0x4CAF50,
            roughness: 0.9,
            metalness: 0.0,
            flatShading: false
        });
        
        this.terrain = new THREE.Mesh(geometry, material);
        this.terrain.receiveShadow = true;
        this.terrain.name = 'terrain';
        this.scene.add(this.terrain);
    }
    
    createOcean() {
        const oceanGeometry = new THREE.PlaneGeometry(2000, 2000);
        const waterMat = textureManager.getMaterial('water');
        const oceanMaterial = waterMat || new THREE.MeshStandardMaterial({
            color: 0x1E88E5,
            roughness: 0.3,
            metalness: 0.1,
            transparent: true,
            opacity: 0.8
        });
        
        this.ocean = new THREE.Mesh(oceanGeometry, oceanMaterial);
        this.ocean.rotation.x = -Math.PI / 2;
        this.ocean.position.y = -5;
        this.ocean.name = 'ocean';
        this.scene.add(this.ocean);
    }
    
    createTrees() {
        const treeCount = 150;
        
        for (let i = 0; i < treeCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = randomRange(50, this.size * 0.45);
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const y = this.getHeightAt(x, z);
            
            if (y < 0) continue; // Skip if below water
            
            const tree = this.createTree();
            tree.position.set(x, y, z);
            tree.rotation.y = Math.random() * Math.PI * 2;
            const scale = randomRange(0.8, 1.3);
            tree.scale.set(scale, scale, scale);
            
            // Mark as harvestable
            tree.userData.harvestable = true;
            tree.userData.harvestType = 'TREE';
            tree.userData.health = HARVEST_TYPES.TREE.maxHits;
            
            this.scene.add(tree);
            this.harvestables.push(tree);
            
            // Add trunk as collider
            this.colliders.push(tree.children[0]);
        }
    }
    
    createTree() {
        const group = new THREE.Group();
        
        // Trunk with bark texture
        const trunkGeometry = new THREE.CylinderGeometry(0.3, 0.5, 4, 8);
        const barkMat = textureManager.getMaterial('bark');
        const trunkMaterial = barkMat || new THREE.MeshStandardMaterial({
            color: 0x5D4037,
            roughness: 1.0
        });
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.y = 2;
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        group.add(trunk);
        
        // Foliage (low-poly cone style) with leaves texture
        const foliageGeometry = new THREE.ConeGeometry(3, 6, 6);
        const leavesMat = textureManager.getMaterial('leaves');
        const foliageMaterial = leavesMat || new THREE.MeshStandardMaterial({
            color: 0x2E7D32,
            roughness: 0.8,
            flatShading: true
        });
        const foliage = new THREE.Mesh(foliageGeometry, foliageMaterial);
        foliage.position.y = 6;
        foliage.castShadow = true;
        foliage.receiveShadow = true;
        group.add(foliage);
        
        // Second layer
        const foliage2 = new THREE.Mesh(
            new THREE.ConeGeometry(2.2, 4, 6),
            foliageMaterial
        );
        foliage2.position.y = 9;
        foliage2.castShadow = true;
        group.add(foliage2);
        
        return group;
    }
    
    createRocks() {
        const rockCount = 80;
        
        for (let i = 0; i < rockCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = randomRange(20, this.size * 0.45);
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const y = this.getHeightAt(x, z);
            
            if (y < 0) continue;
            
            const rock = this.createRock();
            rock.position.set(x, y, z);
            rock.rotation.y = Math.random() * Math.PI * 2;
            const scale = randomRange(0.5, 2);
            rock.scale.set(scale, scale * randomRange(0.5, 1), scale);
            
            // Mark as harvestable
            rock.userData.harvestable = true;
            rock.userData.harvestType = 'ROCK';
            rock.userData.health = HARVEST_TYPES.ROCK.maxHits;
            
            this.scene.add(rock);
            this.colliders.push(rock);
            this.harvestables.push(rock);
        }
    }
    
    createRock() {
        const geometry = new THREE.DodecahedronGeometry(1, 0);
        const stoneMat = textureManager.getMaterial('stone');
        const material = stoneMat || new THREE.MeshStandardMaterial({
            color: 0x757575,
            roughness: 1.0,
            flatShading: true
        });
        
        const rock = new THREE.Mesh(geometry, material);
        rock.castShadow = true;
        rock.receiveShadow = true;
        return rock;
    }
    
    createMetalObjects() {
        // Create cars and containers for metal
        const metalCount = 20;
        
        for (let i = 0; i < metalCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = randomRange(30, this.size * 0.4);
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const y = this.getHeightAt(x, z);
            
            if (y < 0) continue;
            
            const metalObj = this.createCar();
            metalObj.position.set(x, y, z);
            metalObj.rotation.y = Math.random() * Math.PI * 2;
            
            // Mark as harvestable
            metalObj.userData.harvestable = true;
            metalObj.userData.harvestType = 'METAL';
            metalObj.userData.health = HARVEST_TYPES.METAL.maxHits;
            
            this.scene.add(metalObj);
            this.colliders.push(metalObj);
            this.harvestables.push(metalObj);
        }
    }
    
    createCar() {
        const group = new THREE.Group();
        
        // Car body with metal texture
        const metalMat = textureManager.getMaterial('metal');
        const bodyMaterial = metalMat || new THREE.MeshStandardMaterial({
            color: 0x4a4a4a,
            roughness: 0.4,
            metalness: 0.6
        });
        
        // Main body
        const bodyGeometry = new THREE.BoxGeometry(3, 1, 1.5);
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.position.y = 0.8;
        body.castShadow = true;
        group.add(body);
        
        // Roof
        const roofGeometry = new THREE.BoxGeometry(1.5, 0.6, 1.4);
        const roof = new THREE.Mesh(roofGeometry, bodyMaterial);
        roof.position.y = 1.5;
        roof.castShadow = true;
        group.add(roof);
        
        // Wheels
        const wheelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8);
        const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
        
        const wheelPositions = [
            { x: -0.9, z: 0.7 },
            { x: -0.9, z: -0.7 },
            { x: 0.9, z: 0.7 },
            { x: 0.9, z: -0.7 }
        ];
        
        wheelPositions.forEach(pos => {
            const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
            wheel.rotation.x = Math.PI / 2;
            wheel.position.set(pos.x, 0.3, pos.z);
            group.add(wheel);
        });
        
        return group;
    }
    
    // Get harvestables for pickaxe interaction
    getHarvestables() {
        return this.harvestables;
    }
    
    // Remove a harvestable after it's been fully harvested
    removeHarvestable(obj) {
        const idx = this.harvestables.indexOf(obj);
        if (idx > -1) {
            this.harvestables.splice(idx, 1);
        }
        const collIdx = this.colliders.indexOf(obj);
        if (collIdx > -1) {
            this.colliders.splice(collIdx, 1);
        }
        this.scene.remove(obj);
    }
    
    getHeightAt(x, z) {
        // Use raycasting to get precise height
        const raycaster = new THREE.Raycaster(
            new THREE.Vector3(x, 100, z),
            new THREE.Vector3(0, -1, 0)
        );
        
        const intersects = raycaster.intersectObject(this.terrain);
        if (intersects.length > 0) {
            return intersects[0].point.y;
        }
        
        // Fallback to noise calculation
        return perlin.octaveNoise2D(x * 0.01, z * 0.01, 4, 0.5) * this.heightScale;
    }
    
    getColliders() {
        return this.colliders;
    }
}
