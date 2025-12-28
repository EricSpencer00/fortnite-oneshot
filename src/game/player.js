import * as THREE from 'three';
import { WeaponManager, WEAPON_TYPES } from './weapon.js';
import { clamp } from '../utils/math.js';

export class Player {
    constructor(scene, camera, colliders = []) {
        this.scene = scene;
        this.camera = camera;
        this.colliders = colliders;
        
        // State
        this.health = 100;
        this.maxHealth = 100;
        this.shield = 100;
        this.maxShield = 100;
        this.alive = true;
        this.kills = 0;
        
        // Movement - tuned for smooth gameplay
        this.position = new THREE.Vector3(0, 1, 0);
        this.velocity = new THREE.Vector3();
        this.moveSpeed = 7; // Slightly slower for control
        this.sprintMultiplier = 1.5;
        this.jumpForce = 10; // Lower jump
        this.gravity = 25; // Less floaty
        this.isGrounded = false;
        this.isSprinting = false;
        this.groundFriction = 0.88; // Smooth deceleration
        
        // Physics
        this.radius = 0.5;
        this.height = 2;
        
        // Combat
        this.weaponManager = new WeaponManager(scene);
        this.isAiming = false;
        
        // Create mesh
        this.createMesh();
        
        // Raycaster for ground check
        this.groundRaycaster = new THREE.Raycaster();
    }
    
    createMesh() {
        // Body
        const bodyGeometry = new THREE.CapsuleGeometry(0.4, 1.2, 8, 16);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0x2196F3,
            roughness: 0.7
        });
        this.mesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.mesh.castShadow = true;
        this.mesh.position.copy(this.position);
        this.scene.add(this.mesh);
        
        // Head
        const headGeometry = new THREE.SphereGeometry(0.35, 16, 16);
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFE0B2,
            roughness: 0.8
        });
        this.head = new THREE.Mesh(headGeometry, headMaterial);
        this.head.position.y = 1.1;
        this.head.castShadow = true;
        this.mesh.add(this.head);
    }
    
    setPosition(pos) {
        this.position.copy(pos);
        this.mesh.position.copy(this.position);
    }
    
    update(deltaTime, input, currentTime) {
        if (!this.alive) return;
        
        // Get movement input
        const moveInput = input.getMovementInput();
        this.isSprinting = input.isSprinting() && moveInput.z > 0;
        this.isAiming = input.isAiming();
        
        // Calculate movement direction relative to camera
        const forward = this.camera.getForwardDirection();
        const right = this.camera.getRightDirection();
        
        const moveDirection = new THREE.Vector3();
        moveDirection.add(forward.multiplyScalar(moveInput.z));
        moveDirection.add(right.multiplyScalar(moveInput.x));
        
        if (moveDirection.lengthSq() > 0) {
            moveDirection.normalize();
            
            const speed = this.moveSpeed * (this.isSprinting ? this.sprintMultiplier : 1);
            const aimPenalty = this.isAiming ? 0.6 : 1;
            
            this.velocity.x = moveDirection.x * speed * aimPenalty;
            this.velocity.z = moveDirection.z * speed * aimPenalty;
            
            // Rotate mesh to face movement direction
            const targetRotation = Math.atan2(moveDirection.x, moveDirection.z);
            this.mesh.rotation.y = THREE.MathUtils.lerp(
                this.mesh.rotation.y,
                targetRotation,
                deltaTime * 10
            );
        } else {
            // Smooth deceleration using friction
            this.velocity.x *= this.groundFriction;
            this.velocity.z *= this.groundFriction;
        }
        
        // Jumping
        if (input.isJumping() && this.isGrounded) {
            this.velocity.y = this.jumpForce;
            this.isGrounded = false;
        }
        
        // Apply gravity
        this.velocity.y -= this.gravity * deltaTime;
        
        // Ground check
        this.checkGround();
        
        // Clamp falling speed
        this.velocity.y = Math.max(this.velocity.y, -50);
        
        // Apply velocity with collision
        this.applyMovement(deltaTime);
        
        // Update mesh position
        this.mesh.position.copy(this.position);
        
        // Update camera target
        this.camera.setTarget(this.mesh);
        this.camera.setAiming(this.isAiming);
        
        // Update weapons
        this.weaponManager.update(deltaTime, currentTime);
        
        // Handle weapon switch
        const weaponSwitch = input.getWeaponSwitch();
        if (weaponSwitch >= 0) {
            this.weaponManager.switchTo(weaponSwitch);
        }
        
        // Handle reload
        if (input.isReloading()) {
            this.weaponManager.currentWeapon.startReload(currentTime);
        }
    }
    
    checkGround() {
        const origin = this.position.clone();
        origin.y += 0.1;
        
        this.groundRaycaster.set(origin, new THREE.Vector3(0, -1, 0));
        
        // Check against terrain and buildings
        const intersects = this.groundRaycaster.intersectObjects(this.colliders, true);
        
        if (intersects.length > 0 && intersects[0].distance <= 0.15) {
            this.isGrounded = true;
            this.position.y = intersects[0].point.y;
            if (this.velocity.y < 0) {
                this.velocity.y = 0;
            }
        } else {
            // Simple ground plane fallback
            if (this.position.y <= 0.5) {
                this.position.y = 0.5;
                this.isGrounded = true;
                if (this.velocity.y < 0) {
                    this.velocity.y = 0;
                }
            } else {
                this.isGrounded = false;
            }
        }
    }
    
    applyMovement(deltaTime) {
        // Simple movement with basic collision
        const newPos = this.position.clone();
        newPos.x += this.velocity.x * deltaTime;
        newPos.z += this.velocity.z * deltaTime;
        newPos.y += this.velocity.y * deltaTime;
        
        // Basic collision check
        const horizontalRay = new THREE.Raycaster();
        const moveDir = new THREE.Vector3(
            this.velocity.x,
            0,
            this.velocity.z
        ).normalize();
        
        if (moveDir.lengthSq() > 0) {
            horizontalRay.set(
                this.position.clone().add(new THREE.Vector3(0, 1, 0)),
                moveDir
            );
            
            const hits = horizontalRay.intersectObjects(this.colliders, true);
            if (hits.length > 0 && hits[0].distance < this.radius + Math.abs(this.velocity.x + this.velocity.z) * deltaTime) {
                // Slide along wall
                const normal = hits[0].face.normal.clone();
                normal.y = 0;
                normal.normalize();
                
                const vel = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
                const dot = vel.dot(normal);
                vel.sub(normal.multiplyScalar(dot));
                
                newPos.x = this.position.x + vel.x * deltaTime;
                newPos.z = this.position.z + vel.z * deltaTime;
            }
        }
        
        // Keep player within island bounds
        const maxDist = 230;
        const dist = Math.sqrt(newPos.x * newPos.x + newPos.z * newPos.z);
        if (dist > maxDist) {
            const scale = maxDist / dist;
            newPos.x *= scale;
            newPos.z *= scale;
        }
        
        this.position.copy(newPos);
    }
    
    shoot(currentTime) {
        const origin = this.camera.threeCamera.position.clone();
        const direction = this.camera.getAimDirection();
        
        return this.weaponManager.currentWeapon.fire(currentTime, origin, direction);
    }
    
    takeDamage(amount) {
        if (!this.alive) return;
        
        // Shield absorbs damage first
        if (this.shield > 0) {
            const shieldDamage = Math.min(this.shield, amount);
            this.shield -= shieldDamage;
            amount -= shieldDamage;
        }
        
        // Remaining damage goes to health
        this.health -= amount;
        this.health = clamp(this.health, 0, this.maxHealth);
        
        if (this.health <= 0) {
            this.die();
        }
    }
    
    heal(amount) {
        this.health = clamp(this.health + amount, 0, this.maxHealth);
    }
    
    addShield(amount) {
        this.shield = clamp(this.shield + amount, 0, this.maxShield);
    }
    
    die() {
        this.alive = false;
        this.mesh.visible = false;
    }
    
    getPosition() {
        return this.position.clone();
    }
    
    getCollider() {
        return this.mesh;
    }
    
    dispose() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.head.geometry.dispose();
        this.head.material.dispose();
        this.weaponManager.dispose();
    }
}
