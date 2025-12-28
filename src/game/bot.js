import * as THREE from 'three';
import { Weapon, WEAPON_TYPES } from './weapon.js';
import { clamp, randomRange, randomFromArray, distance2D, angleBetween, hasLineOfSight } from '../utils/math.js';

// Bot names for kill feed
const BOT_NAMES = [
    'Ninja', 'DarkVoid', 'ShadowHunter', 'StormChaser', 'ThunderBolt',
    'IceQueen', 'FireLord', 'GhostRider', 'SkullTrooper', 'RavenWing',
    'BattleMaster', 'WarMachine', 'DeathDealer', 'SilentStrike', 'NightFury',
    'BlazeMaster', 'FrostBite', 'VenomFang', 'CyberPunk', 'NeonNinja'
];

// AI States
const BotState = {
    IDLE: 'idle',
    PATROL: 'patrol',
    ENGAGE: 'engage',
    RETREAT: 'retreat',
    RELOAD: 'reload',
    DEAD: 'dead'
};

export class Bot {
    constructor(scene, position, colliders, id) {
        this.scene = scene;
        this.colliders = colliders;
        this.id = id;
        this.name = randomFromArray(BOT_NAMES) + Math.floor(Math.random() * 100);
        
        // State
        this.health = 100;
        this.maxHealth = 100;
        this.shield = randomRange(0, 50);
        this.maxShield = 100;
        this.alive = true;
        
        // Movement
        this.position = position.clone();
        this.velocity = new THREE.Vector3();
        this.moveSpeed = 5;
        this.rotationSpeed = 5;
        this.targetRotation = 0;
        
        // AI
        this.state = BotState.IDLE;
        this.stateTimer = 0;
        this.target = null;
        this.sightRange = 80;
        this.attackRange = 50;
        this.patrolPoint = null;
        this.lastKnownPlayerPos = null;
        
        // Combat - balanced for fair gameplay
        this.weaponType = randomFromArray(['AR', 'SHOTGUN', 'SMG']);
        this.weapon = new Weapon(this.weaponType, scene);
        this.accuracy = randomRange(0.15, 0.45); // Reduced accuracy - was 0.3-0.7
        this.reactionTime = randomRange(0.8, 1.5); // Slower reactions - was 0.3-0.8
        this.reactionTimer = 0;
        this.shootCooldown = 0; // Extra delay between bursts
        this.burstCount = 0; // Limit burst fire
        
        // Create mesh
        this.createMesh();
    }
    
    createMesh() {
        // Body - slightly different from player
        const bodyGeometry = new THREE.CapsuleGeometry(0.4, 1.2, 8, 16);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0xE53935,
            roughness: 0.7
        });
        this.mesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
        this.mesh.castShadow = true;
        this.mesh.position.copy(this.position);
        this.mesh.userData.isBot = true;
        this.mesh.userData.botId = this.id;
        this.scene.add(this.mesh);
        
        // Head
        const headGeometry = new THREE.SphereGeometry(0.35, 16, 16);
        const headMaterial = new THREE.MeshStandardMaterial({
            color: 0xFFCDD2,
            roughness: 0.8
        });
        this.head = new THREE.Mesh(headGeometry, headMaterial);
        this.head.position.y = 1.1;
        this.head.castShadow = true;
        this.head.userData.isBot = true;
        this.head.userData.botId = this.id;
        this.mesh.add(this.head);
        
        // Health bar above head
        this.createHealthBar();
    }
    
    createHealthBar() {
        const bgGeometry = new THREE.PlaneGeometry(1.2, 0.15);
        const bgMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 });
        this.healthBarBg = new THREE.Mesh(bgGeometry, bgMaterial);
        this.healthBarBg.position.y = 1.8;
        this.mesh.add(this.healthBarBg);
        
        const fgGeometry = new THREE.PlaneGeometry(1.1, 0.1);
        const fgMaterial = new THREE.MeshBasicMaterial({ color: 0x4CAF50 });
        this.healthBarFg = new THREE.Mesh(fgGeometry, fgMaterial);
        this.healthBarFg.position.y = 1.8;
        this.healthBarFg.position.z = 0.01;
        this.mesh.add(this.healthBarFg);
    }
    
    updateHealthBar(camera) {
        const healthPercent = (this.health + this.shield) / (this.maxHealth + this.maxShield);
        this.healthBarFg.scale.x = healthPercent;
        this.healthBarFg.position.x = -(1 - healthPercent) * 0.55;
        
        // Color based on health
        if (this.shield > 0) {
            this.healthBarFg.material.color.setHex(0x2196F3);
        } else if (healthPercent > 0.5) {
            this.healthBarFg.material.color.setHex(0x4CAF50);
        } else if (healthPercent > 0.25) {
            this.healthBarFg.material.color.setHex(0xFFC107);
        } else {
            this.healthBarFg.material.color.setHex(0xF44336);
        }
        
        // Face camera (billboard)
        this.healthBarBg.lookAt(camera.position);
        this.healthBarFg.lookAt(camera.position);
    }
    
    update(deltaTime, currentTime, player, otherBots, camera) {
        if (!this.alive) return;
        
        this.stateTimer -= deltaTime;
        this.reactionTimer -= deltaTime;
        if (this.shootCooldown > 0) this.shootCooldown -= deltaTime;
        
        // Update weapon
        this.weapon.update(deltaTime, currentTime);
        
        // Check if player is visible
        const canSeePlayer = this.checkLineOfSight(player);
        const distToPlayer = this.position.distanceTo(player.getPosition());
        
        // State machine
        switch (this.state) {
            case BotState.IDLE:
                this.updateIdle(deltaTime, canSeePlayer, distToPlayer);
                break;
            case BotState.PATROL:
                this.updatePatrol(deltaTime, canSeePlayer, distToPlayer);
                break;
            case BotState.ENGAGE:
                this.updateEngage(deltaTime, currentTime, player, canSeePlayer, distToPlayer);
                break;
            case BotState.RETREAT:
                this.updateRetreat(deltaTime, canSeePlayer, distToPlayer);
                break;
            case BotState.RELOAD:
                this.updateReload(deltaTime, canSeePlayer, distToPlayer);
                break;
        }
        
        // Apply movement
        this.applyMovement(deltaTime);
        
        // Update mesh
        this.mesh.position.copy(this.position);
        
        // Smooth rotation
        const rotDiff = this.targetRotation - this.mesh.rotation.y;
        this.mesh.rotation.y += rotDiff * Math.min(1, deltaTime * this.rotationSpeed);
        
        // Update health bar
        this.updateHealthBar(camera);
    }
    
    checkLineOfSight(player) {
        if (!player.alive) return false;
        
        const playerPos = player.getPosition();
        const dist = this.position.distanceTo(playerPos);
        
        if (dist > this.sightRange) return false;
        
        const myEyePos = this.position.clone();
        myEyePos.y += 1.5;
        
        const playerCenter = playerPos.clone();
        playerCenter.y += 1;
        
        return hasLineOfSight(myEyePos, playerCenter, this.colliders);
    }
    
    updateIdle(deltaTime, canSeePlayer, distToPlayer) {
        if (canSeePlayer && distToPlayer < this.sightRange) {
            this.reactionTimer = this.reactionTime;
            this.state = BotState.ENGAGE;
            return;
        }
        
        if (this.stateTimer <= 0) {
            // Start patrolling
            this.patrolPoint = this.getRandomPatrolPoint();
            this.state = BotState.PATROL;
            this.stateTimer = randomRange(5, 10);
        }
    }
    
    updatePatrol(deltaTime, canSeePlayer, distToPlayer) {
        if (canSeePlayer && distToPlayer < this.sightRange) {
            this.reactionTimer = this.reactionTime;
            this.state = BotState.ENGAGE;
            return;
        }
        
        if (!this.patrolPoint || this.stateTimer <= 0) {
            this.state = BotState.IDLE;
            this.stateTimer = randomRange(2, 5);
            return;
        }
        
        // Move towards patrol point
        const dir = this.patrolPoint.clone().sub(this.position);
        dir.y = 0;
        const dist = dir.length();
        
        if (dist < 2) {
            this.state = BotState.IDLE;
            this.stateTimer = randomRange(2, 5);
            return;
        }
        
        dir.normalize();
        this.velocity.x = dir.x * this.moveSpeed * 0.5;
        this.velocity.z = dir.z * this.moveSpeed * 0.5;
        this.targetRotation = Math.atan2(dir.x, dir.z);
    }
    
    updateEngage(deltaTime, currentTime, player, canSeePlayer, distToPlayer) {
        if (!player.alive) {
            this.state = BotState.IDLE;
            this.stateTimer = randomRange(2, 5);
            return;
        }
        
        // Check ammo
        if (this.weapon.ammo <= 0) {
            this.weapon.startReload(currentTime);
            this.state = BotState.RELOAD;
            return;
        }
        
        // Low health retreat
        if (this.health < 30 && Math.random() < 0.3) {
            this.state = BotState.RETREAT;
            this.stateTimer = randomRange(3, 5);
            return;
        }
        
        const playerPos = player.getPosition();
        
        if (canSeePlayer) {
            this.lastKnownPlayerPos = playerPos.clone();
            
            // Face player
            const dir = playerPos.clone().sub(this.position);
            dir.y = 0;
            dir.normalize();
            this.targetRotation = Math.atan2(dir.x, dir.z);
            
            // Strafe while fighting
            const strafeDir = new THREE.Vector3(-dir.z, 0, dir.x);
            const strafeAmount = Math.sin(currentTime * 0.002) * 0.5;
            
            if (distToPlayer > this.attackRange) {
                // Move closer
                this.velocity.x = dir.x * this.moveSpeed + strafeDir.x * strafeAmount * this.moveSpeed;
                this.velocity.z = dir.z * this.moveSpeed + strafeDir.z * strafeAmount * this.moveSpeed;
            } else if (distToPlayer < 10) {
                // Too close, back up
                this.velocity.x = -dir.x * this.moveSpeed * 0.5 + strafeDir.x * strafeAmount * this.moveSpeed;
                this.velocity.z = -dir.z * this.moveSpeed * 0.5 + strafeDir.z * strafeAmount * this.moveSpeed;
            } else {
                // Strafe only
                this.velocity.x = strafeDir.x * strafeAmount * this.moveSpeed;
                this.velocity.z = strafeDir.z * strafeAmount * this.moveSpeed;
            }
        } else if (this.lastKnownPlayerPos) {
            // Move to last known position
            const dir = this.lastKnownPlayerPos.clone().sub(this.position);
            dir.y = 0;
            const dist = dir.length();
            
            if (dist < 5) {
                this.lastKnownPlayerPos = null;
                this.state = BotState.PATROL;
                this.patrolPoint = this.getRandomPatrolPoint();
                this.stateTimer = randomRange(5, 10);
                return;
            }
            
            dir.normalize();
            this.velocity.x = dir.x * this.moveSpeed;
            this.velocity.z = dir.z * this.moveSpeed;
            this.targetRotation = Math.atan2(dir.x, dir.z);
        } else {
            this.state = BotState.PATROL;
            this.patrolPoint = this.getRandomPatrolPoint();
            this.stateTimer = randomRange(5, 10);
        }
    }
    
    shoot(currentTime, player) {
        if (!this.alive || this.reactionTimer > 0) return null;
        if (!this.weapon.canFire(currentTime)) return null;
        if (this.shootCooldown > 0) return null;
        
        const playerPos = player.getPosition();
        const dist = this.position.distanceTo(playerPos);
        
        // Don't shoot if too far for weapon
        if (dist > this.weapon.config.range) return null;
        
        // Random chance to not shoot (hesitation)
        if (Math.random() < 0.3) return null;
        
        // Add inaccuracy - more at distance
        const origin = this.position.clone();
        origin.y += 1.5;
        
        const direction = playerPos.clone().add(new THREE.Vector3(0, 1, 0)).sub(origin).normalize();
        
        // Apply bot accuracy with distance falloff
        const distancePenalty = Math.min(1, dist / 50) * 0.15;
        const inaccuracy = (1 - this.accuracy) * 0.25 + distancePenalty;
        direction.x += (Math.random() - 0.5) * inaccuracy;
        direction.y += (Math.random() - 0.5) * inaccuracy;
        direction.z += (Math.random() - 0.5) * inaccuracy;
        direction.normalize();
        
        // Burst fire limiter
        this.burstCount++;
        if (this.burstCount >= 3 + Math.floor(Math.random() * 4)) {
            this.shootCooldown = randomRange(0.5, 1.5); // Pause between bursts
            this.burstCount = 0;
        }
        
        return this.weapon.fire(currentTime, origin, direction);
    }
    
    updateRetreat(deltaTime, canSeePlayer, distToPlayer) {
        if (this.stateTimer <= 0 || distToPlayer > 60) {
            this.state = BotState.PATROL;
            this.patrolPoint = this.getRandomPatrolPoint();
            this.stateTimer = randomRange(5, 10);
            return;
        }
        
        // Run away from player
        if (this.lastKnownPlayerPos) {
            const dir = this.position.clone().sub(this.lastKnownPlayerPos);
            dir.y = 0;
            dir.normalize();
            this.velocity.x = dir.x * this.moveSpeed;
            this.velocity.z = dir.z * this.moveSpeed;
            this.targetRotation = Math.atan2(dir.x, dir.z);
        }
    }
    
    updateReload(deltaTime, canSeePlayer, distToPlayer) {
        // Wait for reload to complete
        if (!this.weapon.isReloading) {
            if (canSeePlayer) {
                this.state = BotState.ENGAGE;
            } else {
                this.state = BotState.PATROL;
                this.patrolPoint = this.getRandomPatrolPoint();
                this.stateTimer = randomRange(5, 10);
            }
        }
        
        // Stop moving while reloading
        this.velocity.x *= 0.9;
        this.velocity.z *= 0.9;
    }
    
    getRandomPatrolPoint() {
        const angle = Math.random() * Math.PI * 2;
        const dist = randomRange(10, 30);
        return new THREE.Vector3(
            this.position.x + Math.cos(angle) * dist,
            this.position.y,
            this.position.z + Math.sin(angle) * dist
        );
    }
    
    applyMovement(deltaTime) {
        // Simple ground check using terrain
        const raycaster = new THREE.Raycaster(
            new THREE.Vector3(this.position.x, 100, this.position.z),
            new THREE.Vector3(0, -1, 0)
        );
        
        const hits = raycaster.intersectObjects(this.colliders.filter(c => c.name === 'terrain'), true);
        const groundY = hits.length > 0 ? hits[0].point.y + 0.5 : 0.5;
        
        // Apply velocity
        this.position.x += this.velocity.x * deltaTime;
        this.position.z += this.velocity.z * deltaTime;
        this.position.y = groundY;
        
        // Boundary
        const maxDist = 230;
        const dist = Math.sqrt(this.position.x * this.position.x + this.position.z * this.position.z);
        if (dist > maxDist) {
            const scale = maxDist / dist;
            this.position.x *= scale;
            this.position.z *= scale;
        }
        
        // Decelerate
        this.velocity.x *= 0.95;
        this.velocity.z *= 0.95;
    }
    
    takeDamage(amount) {
        if (!this.alive) return;
        
        // Shield first
        if (this.shield > 0) {
            const shieldDamage = Math.min(this.shield, amount);
            this.shield -= shieldDamage;
            amount -= shieldDamage;
        }
        
        this.health -= amount;
        this.health = clamp(this.health, 0, this.maxHealth);
        
        // Alert the bot
        if (this.state !== BotState.ENGAGE && this.state !== BotState.RETREAT) {
            this.state = BotState.ENGAGE;
        }
        
        if (this.health <= 0) {
            this.die();
        }
    }
    
    die() {
        this.alive = false;
        this.state = BotState.DEAD;
        this.mesh.visible = false;
        this.weapon.dispose();
    }
    
    getPosition() {
        return this.position.clone();
    }
    
    getDropPosition() {
        return this.position.clone().add(new THREE.Vector3(0, 0.5, 0));
    }
    
    dispose() {
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        this.head.geometry.dispose();
        this.head.material.dispose();
        this.healthBarBg.geometry.dispose();
        this.healthBarBg.material.dispose();
        this.healthBarFg.geometry.dispose();
        this.healthBarFg.material.dispose();
        this.weapon.dispose();
    }
}

export class BotManager {
    constructor(scene, colliders) {
        this.scene = scene;
        this.colliders = colliders;
        this.bots = [];
        this.nextId = 0;
    }
    
    spawnBot(position) {
        const bot = new Bot(this.scene, position, this.colliders, this.nextId++);
        this.bots.push(bot);
        return bot;
    }
    
    spawnBots(positions) {
        for (const pos of positions) {
            this.spawnBot(pos);
        }
    }
    
    update(deltaTime, currentTime, player, camera) {
        for (const bot of this.bots) {
            bot.update(deltaTime, currentTime, player, this.bots, camera.threeCamera);
        }
    }
    
    getAliveBots() {
        return this.bots.filter(bot => bot.alive);
    }
    
    getAliveCount() {
        return this.bots.filter(bot => bot.alive).length;
    }
    
    getBotById(id) {
        return this.bots.find(bot => bot.id === id);
    }
    
    dispose() {
        for (const bot of this.bots) {
            bot.dispose();
        }
        this.bots = [];
    }
}
