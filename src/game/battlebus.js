import * as THREE from 'three';

// Battle Bus states
const BusState = {
    WAITING: 'waiting',
    FLYING: 'flying',
    ENDED: 'ended'
};

// Player drop states
export const DropState = {
    ON_BUS: 'on_bus',
    SKYDIVING: 'skydiving',
    GLIDING: 'gliding',
    LANDED: 'landed'
};

export class BattleBus {
    constructor(scene, islandSize = 500) {
        this.scene = scene;
        this.islandSize = islandSize;
        
        // Bus properties
        this.state = BusState.WAITING;
        this.position = new THREE.Vector3();
        this.startPos = new THREE.Vector3();
        this.endPos = new THREE.Vector3();
        this.speed = 80; // Units per second
        this.altitude = 150;
        this.progress = 0;
        
        // Timing
        this.waitTime = 3; // Seconds before bus starts moving
        this.waitTimer = this.waitTime;
        
        this.createBusMesh();
        this.generatePath();
    }
    
    createBusMesh() {
        this.busGroup = new THREE.Group();
        
        // Bus body
        const bodyGeometry = new THREE.BoxGeometry(8, 4, 4);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0x2196F3,
            roughness: 0.7
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        this.busGroup.add(body);
        
        // Bus roof/balloon
        const balloonGeometry = new THREE.SphereGeometry(6, 16, 16);
        const balloonMaterial = new THREE.MeshStandardMaterial({
            color: 0x3F51B5,
            roughness: 0.6
        });
        const balloon = new THREE.Mesh(balloonGeometry, balloonMaterial);
        balloon.position.y = 6;
        balloon.scale.set(1, 0.7, 1);
        balloon.castShadow = true;
        this.busGroup.add(balloon);
        
        // Balloon stripes
        const stripeGeometry = new THREE.TorusGeometry(5.8, 0.3, 8, 32);
        const stripeMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFEB3B,
            roughness: 0.5
        });
        for (let i = 0; i < 3; i++) {
            const stripe = new THREE.Mesh(stripeGeometry, stripeMaterial);
            stripe.position.y = 5 + i * 1.5;
            stripe.rotation.x = Math.PI / 2;
            stripe.scale.set(1 - i * 0.15, 1 - i * 0.15, 1);
            this.busGroup.add(stripe);
        }
        
        // Windows
        const windowGeometry = new THREE.BoxGeometry(0.1, 1.5, 1.5);
        const windowMaterial = new THREE.MeshStandardMaterial({
            color: 0x81D4FA,
            roughness: 0.2,
            metalness: 0.5
        });
        for (let i = 0; i < 3; i++) {
            const windowL = new THREE.Mesh(windowGeometry, windowMaterial);
            windowL.position.set(-2 + i * 2, 0.5, 2.05);
            this.busGroup.add(windowL);
            
            const windowR = windowL.clone();
            windowR.position.z = -2.05;
            this.busGroup.add(windowR);
        }
        
        // Propeller at back
        const propGeometry = new THREE.BoxGeometry(0.5, 3, 0.3);
        const propMaterial = new THREE.MeshStandardMaterial({ color: 0x424242 });
        this.propeller = new THREE.Mesh(propGeometry, propMaterial);
        this.propeller.position.set(-4.5, 0, 0);
        this.busGroup.add(this.propeller);
        
        this.busGroup.position.copy(this.position);
        this.busGroup.visible = false;
        this.scene.add(this.busGroup);
    }
    
    generatePath() {
        // Random path across the island
        const mapSize = this.islandSize * 0.4;
        const angle = Math.random() * Math.PI * 2;
        
        this.startPos.set(
            Math.cos(angle) * mapSize,
            this.altitude,
            Math.sin(angle) * mapSize
        );
        
        this.endPos.set(
            Math.cos(angle + Math.PI) * mapSize,
            this.altitude,
            Math.sin(angle + Math.PI) * mapSize
        );
        
        this.position.copy(this.startPos);
        this.busGroup.position.copy(this.position);
        
        // Make bus face direction of travel
        const direction = this.endPos.clone().sub(this.startPos).normalize();
        this.busGroup.rotation.y = Math.atan2(direction.x, direction.z);
    }
    
    start() {
        this.state = BusState.WAITING;
        this.waitTimer = this.waitTime;
        this.progress = 0;
        this.position.copy(this.startPos);
        this.busGroup.position.copy(this.position);
        this.busGroup.visible = true;
    }
    
    update(deltaTime) {
        if (this.state === BusState.ENDED) return;
        
        // Spin propeller
        this.propeller.rotation.x += deltaTime * 20;
        
        if (this.state === BusState.WAITING) {
            this.waitTimer -= deltaTime;
            if (this.waitTimer <= 0) {
                this.state = BusState.FLYING;
            }
            return;
        }
        
        if (this.state === BusState.FLYING) {
            // Move along path
            const totalDistance = this.startPos.distanceTo(this.endPos);
            this.progress += (this.speed * deltaTime) / totalDistance;
            
            if (this.progress >= 1) {
                this.progress = 1;
                this.state = BusState.ENDED;
                this.busGroup.visible = false;
            }
            
            this.position.lerpVectors(this.startPos, this.endPos, this.progress);
            this.busGroup.position.copy(this.position);
        }
    }
    
    getPosition() {
        return this.position.clone();
    }
    
    isFlying() {
        return this.state === BusState.FLYING;
    }
    
    isWaiting() {
        return this.state === BusState.WAITING;
    }
    
    hasEnded() {
        return this.state === BusState.ENDED;
    }
    
    isComplete() {
        return this.state === BusState.ENDED;
    }
    
    canJump() {
        return this.state === BusState.FLYING;
    }
    
    getDropPosition() {
        return this.position.clone();
    }
    
    getWaitTime() {
        return Math.ceil(this.waitTimer);
    }
    
    getProgress() {
        return this.progress;
    }
    
    dispose() {
        this.scene.remove(this.busGroup);
        this.busGroup.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
    }
}

export class PlayerDrop {
    constructor(island) {
        this.island = island;
        this.state = DropState.ON_BUS;
        this.position = new THREE.Vector3();
        this.velocity = new THREE.Vector3();
        
        // Physics
        this.skydiveSpeed = 60; // Terminal velocity when diving
        this.glideSpeed = 20; // Slower descent when gliding
        this.horizontalSpeed = 30; // Forward movement speed
        this.glideHorizontalSpeed = 40; // Faster horizontal when gliding
        
        // Auto-deploy glider height
        this.autoDeployHeight = 20;
        
        // Visual
        this.gliderMesh = null;
    }
    
    createGliderMesh(scene) {
        // Glider mesh (umbrella style)
        const gliderGroup = new THREE.Group();
        
        const canopyGeometry = new THREE.ConeGeometry(3, 1.5, 8, 1, true);
        const canopyMaterial = new THREE.MeshStandardMaterial({
            color: 0x9C27B0,
            side: THREE.DoubleSide,
            roughness: 0.6
        });
        const canopy = new THREE.Mesh(canopyGeometry, canopyMaterial);
        canopy.rotation.x = Math.PI;
        canopy.position.y = 2;
        gliderGroup.add(canopy);
        
        // Handle
        const handleGeometry = new THREE.CylinderGeometry(0.05, 0.05, 2, 8);
        const handleMaterial = new THREE.MeshStandardMaterial({ color: 0x5D4037 });
        const handle = new THREE.Mesh(handleGeometry, handleMaterial);
        handle.position.y = 0.5;
        gliderGroup.add(handle);
        
        this.gliderMesh = gliderGroup;
        this.gliderMesh.visible = false;
        scene.add(this.gliderMesh);
    }
    
    startDrop(busPosition) {
        this.state = DropState.SKYDIVING;
        this.position.copy(busPosition);
        this.velocity.set(0, 0, 0);
    }
    
    deployGlider() {
        if (this.state === DropState.SKYDIVING) {
            this.state = DropState.GLIDING;
            if (this.gliderMesh) {
                this.gliderMesh.visible = true;
            }
        }
    }
    
    update(deltaTime, inputManager = null, cameraYaw = 0) {
        if (this.state === DropState.ON_BUS || this.state === DropState.LANDED) {
            return;
        }
        
        // Get ground height at current position
        const groundHeight = this.island ? this.island.getHeightAt(this.position.x, this.position.z) : 0;
        
        // Get movement input
        let moveInput = { x: 0, z: 0 };
        if (inputManager) {
            moveInput = inputManager.getMovementInput();
        }
        
        // Calculate horizontal movement direction
        const forward = new THREE.Vector3(
            Math.sin(cameraYaw),
            0,
            Math.cos(cameraYaw)
        );
        const right = new THREE.Vector3(
            Math.sin(cameraYaw + Math.PI / 2),
            0,
            Math.cos(cameraYaw + Math.PI / 2)
        );
        
        const moveDir = new THREE.Vector3();
        moveDir.add(forward.clone().multiplyScalar(moveInput.z));
        moveDir.add(right.clone().multiplyScalar(moveInput.x));
        
        if (this.state === DropState.SKYDIVING) {
            // Fast fall
            this.velocity.y = -this.skydiveSpeed;
            
            // Horizontal movement
            if (moveDir.lengthSq() > 0) {
                moveDir.normalize();
                this.velocity.x = moveDir.x * this.horizontalSpeed;
                this.velocity.z = moveDir.z * this.horizontalSpeed;
            } else {
                this.velocity.x *= 0.95;
                this.velocity.z *= 0.95;
            }
            
            // Dive faster when pressing forward
            if (moveInput.z > 0) {
                this.velocity.y = -this.skydiveSpeed * 1.5;
            }
            
            // Auto-deploy glider near ground
            if (this.position.y - groundHeight <= this.autoDeployHeight) {
                this.deployGlider();
            }
        } else if (this.state === DropState.GLIDING) {
            // Slow descent
            this.velocity.y = -this.glideSpeed;
            
            // Better horizontal control
            if (moveDir.lengthSq() > 0) {
                moveDir.normalize();
                this.velocity.x = moveDir.x * this.glideHorizontalSpeed;
                this.velocity.z = moveDir.z * this.glideHorizontalSpeed;
            } else {
                this.velocity.x *= 0.98;
                this.velocity.z *= 0.98;
            }
        }
        
        // Apply velocity
        this.position.add(this.velocity.clone().multiplyScalar(deltaTime));
        
        // Update glider position
        if (this.gliderMesh && this.state === DropState.GLIDING) {
            this.gliderMesh.position.copy(this.position);
            this.gliderMesh.position.y += 3;
            this.gliderMesh.rotation.y = cameraYaw;
        }
        
        // Check for landing
        if (this.position.y <= groundHeight + 1) {
            this.position.y = groundHeight + 1;
            this.land();
        }
    }
    
    land() {
        this.state = DropState.LANDED;
        this.velocity.set(0, 0, 0);
        if (this.gliderMesh) {
            this.gliderMesh.visible = false;
        }
    }
    
    isOnBus() {
        return this.state === DropState.ON_BUS;
    }
    
    isDropping() {
        return this.state === DropState.SKYDIVING || this.state === DropState.GLIDING;
    }
    
    hasLanded() {
        return this.state === DropState.LANDED;
    }
    
    isGliding() {
        return this.state === DropState.GLIDING;
    }
    
    getPosition() {
        return this.position.clone();
    }
    
    dispose(scene) {
        if (this.gliderMesh) {
            scene.remove(this.gliderMesh);
            this.gliderMesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) child.material.dispose();
            });
        }
    }
}
