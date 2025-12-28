import * as THREE from 'three';

// Engine
import { Renderer } from './engine/renderer.js';
import { GameScene } from './engine/scene.js';
import { ThirdPersonCamera } from './engine/camera.js';
import { GameLoop } from './engine/loop.js';

// Utils
import { input } from './utils/input.js';

// World
import { Island } from './world/island.js';
import { Buildings } from './world/buildings.js';
import { SpawnManager } from './world/spawn.js';

// Game
import { Player } from './game/player.js';
import { BotManager } from './game/bot.js';
import { ProjectileManager } from './game/projectile.js';
import { PickupManager } from './game/pickups.js';
import { Storm } from './game/storm.js';
import { Match } from './game/match.js';

// UI
import { HUD } from './ui/hud.js';
import { Crosshair } from './ui/crosshair.js';
import { Menu } from './ui/menu.js';

class Game {
    constructor() {
        this.container = document.getElementById('game-container');
        
        // Core systems
        this.renderer = null;
        this.gameScene = null;
        this.camera = null;
        this.gameLoop = null;
        
        // World
        this.island = null;
        this.buildings = null;
        this.spawnManager = null;
        
        // Game entities
        this.player = null;
        this.botManager = null;
        this.projectileManager = null;
        this.pickupManager = null;
        this.storm = null;
        this.match = null;
        
        // UI
        this.hud = null;
        this.crosshair = null;
        this.menu = null;
        
        // Game state
        this.isRunning = false;
        this.colliders = [];
        
        // Bot count
        this.botCount = 15;
        
        // Initialize
        this.init();
    }
    
    async init() {
        // Show loading
        const loadingBar = document.getElementById('loading-bar');
        
        // Create renderer
        loadingBar.style.width = '10%';
        this.renderer = new Renderer(this.container);
        
        // Create scene
        loadingBar.style.width = '20%';
        this.gameScene = new GameScene();
        
        // Create camera
        loadingBar.style.width = '30%';
        this.camera = new ThirdPersonCamera();
        
        // Create game loop
        this.gameLoop = new GameLoop();
        
        // Create world
        loadingBar.style.width = '40%';
        this.island = new Island(this.gameScene.threeScene);
        
        loadingBar.style.width = '60%';
        this.buildings = new Buildings(this.gameScene.threeScene, this.island);
        
        // Collect all colliders
        this.colliders = [
            this.island.terrain,
            ...this.island.getColliders(),
            ...this.buildings.getColliders()
        ];
        
        loadingBar.style.width = '70%';
        this.spawnManager = new SpawnManager(this.island);
        
        // Create managers
        loadingBar.style.width = '80%';
        this.projectileManager = new ProjectileManager(this.gameScene.threeScene);
        this.pickupManager = new PickupManager(this.gameScene.threeScene);
        this.botManager = new BotManager(this.gameScene.threeScene, this.colliders);
        
        // Create storm
        this.storm = new Storm(this.gameScene.threeScene);
        
        // Create UI
        loadingBar.style.width = '90%';
        this.hud = new HUD();
        this.crosshair = new Crosshair();
        this.menu = new Menu(
            () => this.startGame(),
            () => this.restartGame()
        );
        
        // Add game loop callback
        this.gameLoop.addCallback((dt, time) => this.update(dt, time));
        
        // Hide loading, show menu
        loadingBar.style.width = '100%';
        setTimeout(() => {
            document.getElementById('loading-screen').classList.add('hidden');
            this.menu.showMenu();
        }, 500);
        
        // Start render loop (but game logic paused)
        this.gameLoop.start();
    }
    
    startGame() {
        // Request pointer lock
        input.requestPointerLock(this.renderer.domElement);
        
        // Spawn player
        const playerSpawn = this.spawnManager.getPlayerSpawnPoint();
        this.player = new Player(
            this.gameScene.threeScene,
            this.camera,
            this.colliders
        );
        this.player.setPosition(playerSpawn);
        
        // Spawn bots
        const botSpawns = this.spawnManager.getBotSpawnPoints(this.botCount, playerSpawn);
        this.botManager.spawnBots(botSpawns);
        
        // Spawn initial pickups
        const pickupSpawns = this.spawnManager.getPickupSpawnPoints(30);
        for (const pos of pickupSpawns) {
            this.pickupManager.spawnPickup(pos);
        }
        
        // Create match
        this.match = new Match(this);
        this.match.start(this.botCount);
        
        // Start game
        this.isRunning = true;
        
        // Hide crosshair initially
        this.crosshair.show();
    }
    
    restartGame() {
        // Clean up old game
        this.cleanup();
        
        // Recreate systems that need reset
        this.projectileManager = new ProjectileManager(this.gameScene.threeScene);
        this.pickupManager = new PickupManager(this.gameScene.threeScene);
        this.botManager = new BotManager(this.gameScene.threeScene, this.colliders);
        
        // Reset storm
        this.storm.dispose();
        this.storm = new Storm(this.gameScene.threeScene);
        
        // Start new game
        this.startGame();
    }
    
    cleanup() {
        if (this.player) {
            this.player.dispose();
            this.player = null;
        }
        
        if (this.botManager) {
            this.botManager.dispose();
        }
        
        if (this.projectileManager) {
            this.projectileManager.dispose();
        }
        
        if (this.pickupManager) {
            this.pickupManager.dispose();
        }
        
        this.isRunning = false;
    }
    
    update(deltaTime, currentTime) {
        // Always update input
        const mouseDelta = input.getMouseDelta();
        
        // Handle camera when playing
        if (this.isRunning && this.player && this.player.alive) {
            // Update camera with mouse
            this.camera.handleMouseMove(mouseDelta.x, mouseDelta.y);
            
            // Update player
            this.player.update(deltaTime, input, currentTime);
            
            // Update camera
            this.camera.update(this.gameScene.threeScene, this.colliders);
            
            // Handle shooting
            if (input.isShooting()) {
                this.handlePlayerShoot(currentTime);
            }
            
            // Update bots
            this.botManager.update(deltaTime, currentTime, this.player, this.camera);
            
            // Handle bot shooting
            for (const bot of this.botManager.getAliveBots()) {
                if (bot.state === 'engage') {
                    const shots = bot.shoot(currentTime, this.player);
                    if (shots) {
                        this.handleBotShots(shots, bot);
                    }
                }
            }
            
            // Update storm
            const stormDamage = this.storm.update(deltaTime, currentTime / 1000, this.player.getPosition());
            if (stormDamage > 0) {
                this.player.takeDamage(stormDamage);
                this.hud.showDamageIndicator(stormDamage, window.innerWidth / 2, window.innerHeight / 2);
            }
            
            // Update pickups
            this.pickupManager.update(deltaTime, currentTime / 1000);
            
            // Check for nearby pickup
            const nearbyPickup = this.pickupManager.getNearbyPickup(this.player.getPosition());
            this.hud.showInteractPrompt(!!nearbyPickup);
            
            // Handle pickup collection
            if (input.isInteracting() && nearbyPickup) {
                const message = this.pickupManager.collectPickup(nearbyPickup, this.player);
                if (message) {
                    this.hud.showPickupNotification(message);
                }
            }
            
            // Update projectiles
            this.projectileManager.update(deltaTime);
            
            // Update match
            this.match.update(deltaTime, currentTime);
            
            // Update HUD
            this.updateHUD(currentTime);
            
            // Update crosshair
            const moveInput = input.getMovementInput();
            const isMoving = moveInput.x !== 0 || moveInput.z !== 0;
            this.crosshair.update(
                deltaTime,
                isMoving,
                input.isSprinting(),
                input.isShooting(),
                input.isAiming()
            );
        }
        
        // Reset input state
        input.update();
        
        // Render
        this.renderer.render(this.gameScene.threeScene, this.camera.threeCamera);
    }
    
    handlePlayerShoot(currentTime) {
        const shots = this.player.shoot(currentTime);
        if (!shots) return;
        
        for (const shot of shots) {
            // Raycast for hit detection
            const raycaster = new THREE.Raycaster(
                shot.origin,
                shot.direction,
                0,
                shot.range
            );
            
            // Check against bots and world
            const botMeshes = this.botManager.getAliveBots().map(b => b.mesh);
            const allTargets = [...this.colliders, ...botMeshes];
            
            const intersects = raycaster.intersectObjects(allTargets, true);
            
            if (intersects.length > 0) {
                const hit = intersects[0];
                
                // Create tracer
                this.projectileManager.createTracer(shot.origin, hit.point);
                
                // Check if hit a bot
                let hitBot = null;
                let obj = hit.object;
                while (obj) {
                    if (obj.userData && obj.userData.isBot) {
                        hitBot = this.botManager.getBotById(obj.userData.botId);
                        break;
                    }
                    obj = obj.parent;
                }
                
                if (hitBot && hitBot.alive) {
                    // Apply damage
                    hitBot.takeDamage(shot.damage);
                    this.projectileManager.createImpact(hit.point, true);
                    this.hud.showHitmarker();
                    
                    // Check if killed
                    if (!hitBot.alive) {
                        this.match.addKill();
                        this.hud.addKillFeedEntry('You', hitBot.name, this.player.weaponManager.currentWeapon.config.name);
                        
                        // Drop loot
                        this.pickupManager.spawnLootDrop(hitBot.getDropPosition());
                    }
                } else {
                    // Hit world
                    this.projectileManager.createImpact(hit.point, false);
                }
            } else {
                // Miss - create tracer to max range
                const endPoint = shot.origin.clone().add(
                    shot.direction.clone().multiplyScalar(shot.range)
                );
                this.projectileManager.createTracer(shot.origin, endPoint);
            }
        }
    }
    
    handleBotShots(shots, bot) {
        for (const shot of shots) {
            const raycaster = new THREE.Raycaster(
                shot.origin,
                shot.direction,
                0,
                shot.range
            );
            
            // Check against player and world
            const targets = [...this.colliders, this.player.mesh];
            const intersects = raycaster.intersectObjects(targets, true);
            
            if (intersects.length > 0) {
                const hit = intersects[0];
                
                // Create tracer
                this.projectileManager.createTracer(shot.origin, hit.point, 0xFF4444);
                
                // Check if hit player
                let hitPlayer = false;
                let obj = hit.object;
                while (obj) {
                    if (obj === this.player.mesh) {
                        hitPlayer = true;
                        break;
                    }
                    obj = obj.parent;
                }
                
                if (hitPlayer) {
                    this.player.takeDamage(shot.damage);
                    this.projectileManager.createImpact(hit.point, true);
                    
                    // Show damage indicator
                    this.hud.showDamageIndicator(
                        shot.damage,
                        window.innerWidth / 2 + (Math.random() - 0.5) * 100,
                        window.innerHeight / 2 + (Math.random() - 0.5) * 50
                    );
                } else {
                    this.projectileManager.createImpact(hit.point, false);
                }
            }
        }
    }
    
    updateHUD(currentTime) {
        // Health and shield
        this.hud.updateHealth(this.player.health, this.player.maxHealth);
        this.hud.updateShield(this.player.shield, this.player.maxShield);
        
        // Ammo
        const weapon = this.player.weaponManager.currentWeapon;
        this.hud.updateAmmo(weapon.ammo, weapon.reserveAmmo);
        
        // Weapon slot
        this.hud.updateWeaponSlot(this.player.weaponManager.currentIndex);
        
        // Reload indicator
        this.hud.showReloading(weapon.isReloading);
        
        // Storm
        this.hud.updateStorm(this.storm.getPhaseInfo());
        
        // Storm warning
        const isOutside = this.storm.isOutsideStorm(this.player.getPosition());
        this.hud.showStormWarning(isOutside);
        
        // Alive count
        this.hud.updateAliveCount(this.match.getAliveCount());
        
        // Minimap
        this.hud.updateMinimap(
            this.player.getPosition(),
            this.camera.yaw,
            this.storm.center,
            this.storm.currentRadius,
            this.botManager.bots
        );
    }
    
    onMatchEnd(result) {
        this.isRunning = false;
        
        // Exit pointer lock
        document.exitPointerLock();
        
        // Show game over screen
        this.menu.showGameover(result, this.match.getStats());
    }
}

// Start the game
const game = new Game();
