import * as THREE from 'three';
import { generateId } from '../utils/math.js';

// Material types with their properties
export const MATERIAL_TYPES = {
    WOOD: {
        name: 'Wood',
        color: 0x8B4513,
        maxHealth: 150,
        buildHealth: 100, // Starting health when placed
        harvestAmount: 10,
        icon: '🪵'
    },
    STONE: {
        name: 'Stone',
        color: 0x808080,
        maxHealth: 300,
        buildHealth: 200,
        harvestAmount: 7,
        icon: '🪨'
    },
    METAL: {
        name: 'Metal',
        color: 0x4A4A4A,
        maxHealth: 500,
        buildHealth: 350,
        harvestAmount: 5,
        icon: '🔩'
    }
};

// Build piece types
export const BUILD_TYPES = {
    WALL: {
        name: 'Wall',
        cost: 10,
        size: { x: 4, y: 4, z: 0.3 },
        key: 'wall'
    },
    FLOOR: {
        name: 'Floor',
        cost: 10,
        size: { x: 4, y: 0.3, z: 4 },
        key: 'floor'
    },
    STAIR: {
        name: 'Stairs',
        cost: 10,
        size: { x: 4, y: 4, z: 4 },
        key: 'stair'
    },
    CONE: {
        name: 'Cone',
        cost: 10,
        size: { x: 4, y: 2, z: 4 },
        key: 'cone'
    }
};

// Grid size for building
const GRID_SIZE = 4;

export class BuildPiece {
    constructor(scene, type, material, position, rotation = 0, ownerId = 'player') {
        this.scene = scene;
        this.id = generateId();
        this.type = type;
        this.materialType = material;
        this.ownerId = ownerId;
        
        this.config = BUILD_TYPES[type];
        this.matConfig = MATERIAL_TYPES[material];
        
        this.health = this.matConfig.buildHealth;
        this.maxHealth = this.matConfig.maxHealth;
        
        this.position = position.clone();
        this.rotation = rotation;
        
        // For editing
        this.editGrid = this.createDefaultEditGrid();
        this.isEdited = false;
        
        this.createMesh();
    }
    
    createDefaultEditGrid() {
        // 3x3 grid for editing (like Fortnite)
        // true = solid, false = empty
        return [
            [true, true, true],
            [true, true, true],
            [true, true, true]
        ];
    }
    
    createMesh() {
        const color = this.matConfig.color;
        
        const material = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.8,
            metalness: this.materialType === 'METAL' ? 0.5 : 0.1,
            transparent: true,
            opacity: 0.95
        });
        
        switch (this.type) {
            case 'WALL':
                this.mesh = this.createWallMesh(material);
                break;
            case 'FLOOR':
                this.mesh = this.createFloorMesh(material);
                break;
            case 'STAIR':
                this.mesh = this.createStairMesh(material);
                break;
            case 'CONE':
                this.mesh = this.createConeMesh(material);
                break;
        }
        
        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.rotation;
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.mesh.userData.isBuildPiece = true;
        this.mesh.userData.buildId = this.id;
        this.mesh.userData.ownerId = this.ownerId;
        
        this.scene.add(this.mesh);
    }
    
    createWallMesh(material) {
        const group = new THREE.Group();
        
        // Main wall panel
        const wallGeo = new THREE.BoxGeometry(
            this.config.size.x,
            this.config.size.y,
            this.config.size.z
        );
        const wall = new THREE.Mesh(wallGeo, material);
        wall.position.y = this.config.size.y / 2;
        group.add(wall);
        
        // Frame
        const frameMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color(this.matConfig.color).multiplyScalar(0.7),
            roughness: 0.9
        });
        
        // Vertical frames
        const frameGeo = new THREE.BoxGeometry(0.2, this.config.size.y, 0.35);
        const leftFrame = new THREE.Mesh(frameGeo, frameMaterial);
        leftFrame.position.set(-this.config.size.x / 2 + 0.1, this.config.size.y / 2, 0);
        group.add(leftFrame);
        
        const rightFrame = leftFrame.clone();
        rightFrame.position.x = this.config.size.x / 2 - 0.1;
        group.add(rightFrame);
        
        // Horizontal frame
        const hFrameGeo = new THREE.BoxGeometry(this.config.size.x, 0.2, 0.35);
        const topFrame = new THREE.Mesh(hFrameGeo, frameMaterial);
        topFrame.position.y = this.config.size.y - 0.1;
        group.add(topFrame);
        
        return group;
    }
    
    createFloorMesh(material) {
        const group = new THREE.Group();
        
        const floorGeo = new THREE.BoxGeometry(
            this.config.size.x,
            this.config.size.y,
            this.config.size.z
        );
        const floor = new THREE.Mesh(floorGeo, material);
        floor.position.y = this.config.size.y / 2;
        group.add(floor);
        
        // Support beams
        const beamMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color(this.matConfig.color).multiplyScalar(0.7),
            roughness: 0.9
        });
        
        const beamGeo = new THREE.BoxGeometry(0.2, 0.4, this.config.size.z);
        for (let i = 0; i < 3; i++) {
            const beam = new THREE.Mesh(beamGeo, beamMaterial);
            beam.position.set(-1.5 + i * 1.5, -0.1, 0);
            group.add(beam);
        }
        
        return group;
    }
    
    createStairMesh(material) {
        const group = new THREE.Group();
        
        const stepCount = 4;
        const stepHeight = this.config.size.y / stepCount;
        const stepDepth = this.config.size.z / stepCount;
        
        for (let i = 0; i < stepCount; i++) {
            const stepGeo = new THREE.BoxGeometry(
                this.config.size.x,
                stepHeight,
                stepDepth
            );
            const step = new THREE.Mesh(stepGeo, material);
            step.position.set(
                0,
                stepHeight / 2 + i * stepHeight,
                -this.config.size.z / 2 + stepDepth / 2 + i * stepDepth
            );
            step.castShadow = true;
            step.receiveShadow = true;
            group.add(step);
        }
        
        // Side rails
        const railMaterial = new THREE.MeshStandardMaterial({
            color: new THREE.Color(this.matConfig.color).multiplyScalar(0.7),
            roughness: 0.9
        });
        
        const railGeo = new THREE.BoxGeometry(0.15, 0.3, this.config.size.z * 1.4);
        const leftRail = new THREE.Mesh(railGeo, railMaterial);
        leftRail.position.set(-this.config.size.x / 2 + 0.1, this.config.size.y / 2 + 0.3, 0);
        leftRail.rotation.x = -Math.PI / 4;
        group.add(leftRail);
        
        const rightRail = leftRail.clone();
        rightRail.position.x = this.config.size.x / 2 - 0.1;
        group.add(rightRail);
        
        return group;
    }
    
    createConeMesh(material) {
        const group = new THREE.Group();
        
        // Pyramid shape
        const coneGeo = new THREE.ConeGeometry(
            this.config.size.x * 0.7,
            this.config.size.y,
            4
        );
        const cone = new THREE.Mesh(coneGeo, material);
        cone.position.y = this.config.size.y / 2;
        cone.rotation.y = Math.PI / 4;
        group.add(cone);
        
        return group;
    }
    
    takeDamage(amount) {
        this.health -= amount;
        
        // Update opacity based on health
        const healthPercent = this.health / this.maxHealth;
        this.mesh.traverse(child => {
            if (child.material) {
                child.material.opacity = 0.5 + healthPercent * 0.5;
            }
        });
        
        if (this.health <= 0) {
            return true; // Destroyed
        }
        return false;
    }
    
    updateFromEditGrid() {
        // Recreate mesh based on edit grid
        this.scene.remove(this.mesh);
        this.mesh.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        
        this.createEditedMesh();
    }
    
    createEditedMesh() {
        const material = new THREE.MeshStandardMaterial({
            color: this.matConfig.color,
            roughness: 0.8,
            metalness: this.materialType === 'METAL' ? 0.5 : 0.1,
            transparent: true,
            opacity: 0.95
        });
        
        const group = new THREE.Group();
        const segmentSize = this.config.size.x / 3;
        
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                if (this.editGrid[row][col]) {
                    const segGeo = new THREE.BoxGeometry(
                        segmentSize - 0.05,
                        this.config.size.y / 3 - 0.05,
                        this.config.size.z
                    );
                    const segment = new THREE.Mesh(segGeo, material.clone());
                    segment.position.set(
                        (col - 1) * segmentSize,
                        (2 - row) * (this.config.size.y / 3) + this.config.size.y / 6,
                        0
                    );
                    segment.castShadow = true;
                    group.add(segment);
                }
            }
        }
        
        this.mesh = group;
        this.mesh.position.copy(this.position);
        this.mesh.rotation.y = this.rotation;
        this.mesh.userData.isBuildPiece = true;
        this.mesh.userData.buildId = this.id;
        this.mesh.userData.ownerId = this.ownerId;
        
        this.scene.add(this.mesh);
        this.isEdited = true;
    }
    
    getCollider() {
        return this.mesh;
    }
    
    dispose() {
        this.scene.remove(this.mesh);
        this.mesh.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }
}

export class BuildingSystem {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        
        this.pieces = [];
        this.previewMesh = null;
        
        // Current build mode state
        this.isBuilding = false;
        this.currentBuildType = 'WALL';
        this.currentMaterial = 'WOOD';
        this.currentRotation = 0;
        
        // Materials inventory
        this.materials = {
            WOOD: 500, // Start with some mats for testing
            STONE: 300,
            METAL: 200
        };
        
        // Placement
        this.placementRange = 8;
        this.gridSize = GRID_SIZE;
        
        // For edit mode
        this.isEditing = false;
        this.editingPiece = null;
        this.editPreview = null;
        
        this.createPreviewMesh();
    }
    
    createPreviewMesh() {
        const geometry = new THREE.BoxGeometry(4, 4, 0.3);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00FF00,
            transparent: true,
            opacity: 0.5,
            wireframe: false
        });
        
        this.previewMesh = new THREE.Mesh(geometry, material);
        this.previewMesh.visible = false;
        this.scene.add(this.previewMesh);
    }
    
    updatePreviewGeometry() {
        const config = BUILD_TYPES[this.currentBuildType];
        
        this.scene.remove(this.previewMesh);
        this.previewMesh.geometry.dispose();
        
        let geometry;
        switch (this.currentBuildType) {
            case 'WALL':
                geometry = new THREE.BoxGeometry(config.size.x, config.size.y, config.size.z);
                break;
            case 'FLOOR':
                geometry = new THREE.BoxGeometry(config.size.x, config.size.y, config.size.z);
                break;
            case 'STAIR':
                geometry = new THREE.BoxGeometry(config.size.x, config.size.y, config.size.z);
                break;
            case 'CONE':
                geometry = new THREE.ConeGeometry(config.size.x * 0.7, config.size.y, 4);
                break;
            default:
                geometry = new THREE.BoxGeometry(4, 4, 0.3);
        }
        
        this.previewMesh.geometry = geometry;
        this.scene.add(this.previewMesh);
    }
    
    enterBuildMode() {
        this.isBuilding = true;
        this.previewMesh.visible = true;
        this.updatePreviewGeometry();
    }
    
    exitBuildMode() {
        this.isBuilding = false;
        this.previewMesh.visible = false;
    }
    
    toggleBuildMode() {
        if (this.isBuilding) {
            this.exitBuildMode();
        } else {
            this.enterBuildMode();
        }
        return this.isBuilding;
    }
    
    selectBuildType(type) {
        if (BUILD_TYPES[type]) {
            this.currentBuildType = type;
            this.updatePreviewGeometry();
        }
    }
    
    selectMaterial(material) {
        if (MATERIAL_TYPES[material]) {
            this.currentMaterial = material;
        }
    }
    
    cycleMaterial() {
        const materials = Object.keys(MATERIAL_TYPES);
        const currentIndex = materials.indexOf(this.currentMaterial);
        this.currentMaterial = materials[(currentIndex + 1) % materials.length];
    }
    
    rotateBuild() {
        this.currentRotation += Math.PI / 2;
        if (this.currentRotation >= Math.PI * 2) {
            this.currentRotation = 0;
        }
    }
    
    update(playerPosition, cameraDirection) {
        if (!this.isBuilding) return;
        
        // Calculate placement position
        const placementPos = this.calculatePlacementPosition(playerPosition, cameraDirection);
        
        // Snap to grid
        const snappedPos = this.snapToGrid(placementPos);
        
        // Adjust Y based on build type
        const config = BUILD_TYPES[this.currentBuildType];
        if (this.currentBuildType === 'FLOOR') {
            // Floor goes at feet level or stacks on existing floors
            snappedPos.y = Math.floor(playerPosition.y / this.gridSize) * this.gridSize;
        } else if (this.currentBuildType === 'CONE') {
            snappedPos.y = Math.floor(playerPosition.y / this.gridSize) * this.gridSize + config.size.y / 2;
        } else {
            snappedPos.y = Math.floor(playerPosition.y / this.gridSize) * this.gridSize;
        }
        
        // Update preview
        this.previewMesh.position.copy(snappedPos);
        if (this.currentBuildType !== 'CONE') {
            this.previewMesh.position.y += config.size.y / 2;
        }
        this.previewMesh.rotation.y = this.currentRotation;
        
        // Check if can place
        const canPlace = this.canPlace(snappedPos);
        this.previewMesh.material.color.setHex(canPlace ? 0x00FF00 : 0xFF0000);
    }
    
    calculatePlacementPosition(playerPosition, cameraDirection) {
        const forward = cameraDirection.clone();
        forward.y = 0;
        forward.normalize();
        
        return playerPosition.clone().add(forward.multiplyScalar(this.placementRange));
    }
    
    snapToGrid(position) {
        return new THREE.Vector3(
            Math.round(position.x / this.gridSize) * this.gridSize,
            Math.round(position.y / this.gridSize) * this.gridSize,
            Math.round(position.z / this.gridSize) * this.gridSize
        );
    }
    
    canPlace(position) {
        const cost = BUILD_TYPES[this.currentBuildType].cost;
        
        // Check if have enough materials
        if (this.materials[this.currentMaterial] < cost) {
            return false;
        }
        
        // Check for overlapping builds (simplified)
        for (const piece of this.pieces) {
            if (piece.position.distanceTo(position) < 1) {
                return false;
            }
        }
        
        return true;
    }
    
    place() {
        if (!this.isBuilding) return null;
        
        const position = this.snapToGrid(this.previewMesh.position.clone());
        const config = BUILD_TYPES[this.currentBuildType];
        
        // Adjust position for the actual piece
        if (this.currentBuildType !== 'CONE') {
            position.y -= config.size.y / 2;
        }
        
        if (!this.canPlace(position)) {
            return null;
        }
        
        // Deduct materials
        const cost = config.cost;
        this.materials[this.currentMaterial] -= cost;
        
        // Create piece
        const piece = new BuildPiece(
            this.scene,
            this.currentBuildType,
            this.currentMaterial,
            position,
            this.currentRotation
        );
        
        this.pieces.push(piece);
        
        return piece;
    }
    
    addMaterials(type, amount) {
        if (MATERIAL_TYPES[type]) {
            this.materials[type] = Math.min(999, this.materials[type] + amount);
        }
    }
    
    getPieceById(id) {
        return this.pieces.find(p => p.id === id);
    }
    
    getPieceAtPosition(position, maxDist = 2) {
        for (const piece of this.pieces) {
            if (piece.position.distanceTo(position) < maxDist) {
                return piece;
            }
        }
        return null;
    }
    
    destroyPiece(piece) {
        const index = this.pieces.indexOf(piece);
        if (index > -1) {
            piece.dispose();
            this.pieces.splice(index, 1);
            return true;
        }
        return false;
    }
    
    damagePiece(piece, amount) {
        if (piece.takeDamage(amount)) {
            this.destroyPiece(piece);
            return true; // Destroyed
        }
        return false;
    }
    
    // Edit mode
    enterEditMode(piece) {
        if (piece.ownerId !== 'player') return false;
        
        this.isEditing = true;
        this.editingPiece = piece;
        this.exitBuildMode();
        
        this.createEditPreview(piece);
        return true;
    }
    
    exitEditMode(confirm = false) {
        if (!this.isEditing) return;
        
        if (confirm && this.editingPiece) {
            this.editingPiece.editGrid = JSON.parse(JSON.stringify(this.tempEditGrid));
            this.editingPiece.updateFromEditGrid();
        }
        
        this.isEditing = false;
        this.editingPiece = null;
        
        if (this.editPreview) {
            this.scene.remove(this.editPreview);
            this.editPreview.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
            this.editPreview = null;
        }
    }
    
    createEditPreview(piece) {
        // Clone the edit grid
        this.tempEditGrid = JSON.parse(JSON.stringify(piece.editGrid));
        
        this.updateEditPreview();
    }
    
    updateEditPreview() {
        if (this.editPreview) {
            this.scene.remove(this.editPreview);
            this.editPreview.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }
        
        const group = new THREE.Group();
        const config = BUILD_TYPES[this.editingPiece.type];
        const segmentSize = config.size.x / 3;
        
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const isActive = this.tempEditGrid[row][col];
                
                const segGeo = new THREE.BoxGeometry(
                    segmentSize - 0.1,
                    config.size.y / 3 - 0.1,
                    config.size.z + 0.1
                );
                const segMat = new THREE.MeshBasicMaterial({
                    color: isActive ? 0x0088FF : 0x333333,
                    transparent: true,
                    opacity: isActive ? 0.7 : 0.3
                });
                
                const segment = new THREE.Mesh(segGeo, segMat);
                segment.position.set(
                    (col - 1) * segmentSize,
                    (2 - row) * (config.size.y / 3) + config.size.y / 6,
                    0
                );
                segment.userData.editRow = row;
                segment.userData.editCol = col;
                group.add(segment);
            }
        }
        
        group.position.copy(this.editingPiece.position);
        group.position.y += 0.01; // Slight offset to prevent z-fighting
        group.rotation.y = this.editingPiece.rotation;
        
        this.editPreview = group;
        this.scene.add(this.editPreview);
    }
    
    toggleEditCell(row, col) {
        if (!this.isEditing || row < 0 || row > 2 || col < 0 || col > 2) return;
        
        this.tempEditGrid[row][col] = !this.tempEditGrid[row][col];
        this.updateEditPreview();
    }
    
    getColliders() {
        return this.pieces.map(p => p.getCollider());
    }
    
    // Methods called by main.js
    showPreview(show) {
        this.previewMesh.visible = show;
        if (show) {
            this.updatePreviewGeometry();
        }
    }
    
    selectPiece(index) {
        const types = Object.keys(BUILD_TYPES);
        if (index >= 0 && index < types.length) {
            this.currentBuildType = types[index];
            this.updatePreviewGeometry();
        }
    }
    
    rotatePiece() {
        this.rotateBuild();
        this.previewMesh.rotation.y = this.currentRotation;
    }
    
    getCurrentMaterial() {
        return {
            name: MATERIAL_TYPES[this.currentMaterial].name,
            cost: BUILD_TYPES[this.currentBuildType].cost
        };
    }
    
    updatePreviewPosition(playerPosition, lookDirection, yaw) {
        if (!this.previewMesh.visible) return;
        
        // Calculate placement position
        const forward = lookDirection.clone();
        forward.y = 0;
        forward.normalize();
        
        const placementPos = playerPosition.clone().add(forward.multiplyScalar(this.placementRange));
        const snappedPos = this.snapToGrid(placementPos);
        
        const config = BUILD_TYPES[this.currentBuildType];
        
        // Adjust Y position based on build type
        if (this.currentBuildType === 'FLOOR') {
            snappedPos.y = Math.floor(playerPosition.y / this.gridSize) * this.gridSize;
        } else {
            snappedPos.y = Math.floor(playerPosition.y / this.gridSize) * this.gridSize;
        }
        
        this.previewMesh.position.copy(snappedPos);
        
        // Adjust for geometry center
        if (this.currentBuildType !== 'CONE') {
            this.previewMesh.position.y += config.size.y / 2;
        }
        
        // Check if can place and color accordingly
        const canPlace = this.canPlaceAt(snappedPos);
        this.previewMesh.material.color.setHex(canPlace ? 0x00FF00 : 0xFF0000);
    }
    
    canPlaceAt(position) {
        // Check for overlapping builds
        for (const piece of this.pieces) {
            if (piece.position.distanceTo(position) < 2) {
                return false;
            }
        }
        return true;
    }
    
    placePiece(player) {
        if (!this.previewMesh.visible) return null;
        
        const position = this.previewMesh.position.clone();
        const config = BUILD_TYPES[this.currentBuildType];
        
        // Adjust position for the actual piece
        if (this.currentBuildType !== 'CONE') {
            position.y -= config.size.y / 2;
        }
        
        if (!this.canPlaceAt(position)) {
            return null;
        }
        
        // Create piece
        const piece = new BuildPiece(
            this.scene,
            this.currentBuildType,
            this.currentMaterial,
            position,
            this.currentRotation,
            'player'
        );
        
        this.pieces.push(piece);
        
        return piece;
    }
    
    dispose() {
        for (const piece of this.pieces) {
            piece.dispose();
        }
        this.pieces = [];
        
        if (this.previewMesh) {
            this.scene.remove(this.previewMesh);
            this.previewMesh.geometry.dispose();
            this.previewMesh.material.dispose();
        }
        
        this.exitEditMode();
    }
}
