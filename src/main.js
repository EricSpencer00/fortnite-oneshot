import * as THREE from 'three';

// Engine
import { Renderer } from './engine/renderer.js';
import { GameScene } from './engine/scene.js';
import { ThirdPersonCamera } from './engine/camera.js';
import { GameLoop } from './engine/loop.js';

// Utils
import { input } from './utils/input.js';

// World
import { Island, HARVEST_TYPES } from './world/island.js';
import { Buildings } from './world/buildings.js';
import { SpawnManager } from './world/spawn.js';

// Game
import { Player } from './game/player.js';
import { BotManager } from './game/bot.js';
import { ProjectileManager } from './game/projectile.js';
import { PickupManager } from './game/pickups.js';
import { Storm } from './game/storm.js';
import { Match } from './game/match.js';
import { BattleBus, PlayerDrop, DropState } from './game/battlebus.js';
import { BuildingSystem, MATERIAL_TYPES, BUILD_TYPES } from './game/building.js';

// UI
import { HUD } from './ui/hud.js';
import { Crosshair } from './ui/crosshair.js';
import { Menu } from './ui/menu.js';

// Game phases
const GamePhase = {
    MENU: 'menu',
    BUS: 'bus',
    DROPPING: 'dropping',
    PLAYING: 'playing',
    ENDED: 'ended'
};

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
        
        // New systems
        this.battleBus = null;
        this.playerDrop = null;
        this.buildingSystem = null;
        
        // Player materials
        this.materials = { wood: 50, stone: 20, metal: 10 }; // Start with some mats
        
        // UI
        this.hud = null;
        this.crosshair = null;
        this.menu = null;
        
        // Game state
        this.phase = GamePhase.MENU;
        this.isRunning = false;
        this.colliders = [];
        this.isBuildMode = false;
        
        // Bot count
        this.botCount = 15;
        
        // Fall damage
        this.lastGroundedY = 0;
        this.wasGrounded = true;
        
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
        
        // Reset materials
        this.materials = { wood: 50, stone: 20, metal: 10 };
        
        // Create battle bus
        this.battleBus = new BattleBus(this.gameScene.threeScene, this.island.size);
        this.battleBus.start();
        
        // Create player drop handler (starts on bus)
        this.playerDrop = new PlayerDrop(this.island);
        
        // Create building system
        this.buildingSystem = new BuildingSystem(this.gameScene.threeScene);
        this.colliders.push(...this.buildingSystem.getColliders());
        
        // Create player (but don't position yet - will drop from bus)
        this.player = new Player(
            this.gameScene.threeScene,
            this.camera,
            this.colliders
        );
        // Start player invisible until dropped
        this.player.mesh.visible = false;
        
        // Spawn bots (they drop at random times)
        const botSpawns = this.spawnManager.getBotSpawnPoints(this.botCount, new THREE.Vector3(0, 0, 0));
        this.botManager.spawnBots(botSpawns);
        
        // Spawn initial pickups
        const pickupSpawns = this.spawnManager.getPickupSpawnPoints(30);
        for (const pos of pickupSpawns) {
            this.pickupManager.spawnPickup(pos);
        }
        
        // Create match
        this.match = new Match(this);
        this.match.start(this.botCount);
        
        // Set phase to bus
        this.phase = GamePhase.BUS;
        this.isRunning = true;
        
        // Hide crosshair while on bus
        this.crosshair.hide();
        
        // Show bus UI
        this.hud.showBusUI(true);
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
        
        if (this.battleBus) {
            this.battleBus.dispose();
            this.battleBus = null;
        }
        
        if (this.buildingSystem) {
            this.buildingSystem.dispose();
            this.buildingSystem = null;
        }
        
        this.playerDrop = null;
        this.isBuildMode = false;
        this.isRunning = false;
        this.phase = GamePhase.MENU;
    }
    
    update(deltaTime, currentTime) {
        // Always update input
        const mouseDelta = input.getMouseDelta();
        
        // Handle different game phases
        if (this.phase === GamePhase.BUS) {
            this.updateBusPhase(deltaTime, currentTime);
        } else if (this.phase === GamePhase.DROPPING) {
            this.updateDroppingPhase(deltaTime, currentTime, mouseDelta);
        } else if (this.phase === GamePhase.PLAYING && this.player && this.player.alive) {
            this.updatePlayingPhase(deltaTime, currentTime, mouseDelta);
        }
        
        // Reset input state
        input.update();
        
        // Render
        this.renderer.render(this.gameScene.threeScene, this.camera.threeCamera);
    }
    
    updateBusPhase(deltaTime, currentTime) {
        // Update battle bus
        this.battleBus.update(deltaTime);
        
        // Position camera to follow bus
        const busPos = this.battleBus.getPosition();
        this.camera.threeCamera.position.set(busPos.x, busPos.y + 20, busPos.z + 30);
        this.camera.threeCamera.lookAt(busPos);
        
        // Check for jump input
        if (input.isJumping() && this.battleBus.canJump()) {
            // Jump from bus
            const dropPos = this.battleBus.getDropPosition();
            this.playerDrop.startDrop(dropPos);
            this.player.setPosition(dropPos);
            this.player.mesh.visible = true;
            this.phase = GamePhase.DROPPING;
            
            // Hide bus UI, show glider UI
            this.hud.showBusUI(false);
            this.hud.showGliderUI(true);
        }
        
        // Auto-drop at end of bus path
        if (this.battleBus.isComplete()) {
            const dropPos = this.battleBus.getDropPosition();
            this.playerDrop.startDrop(dropPos);
            this.player.setPosition(dropPos);
            this.player.mesh.visible = true;
            this.phase = GamePhase.DROPPING;
            
            this.hud.showBusUI(false);
            this.hud.showGliderUI(true);
        }
    }
    
    updateDroppingPhase(deltaTime, currentTime, mouseDelta) {
        // Handle glider deploy input
        if (input.isJumping() && this.playerDrop.state === DropState.SKYDIVING) {
            this.playerDrop.deployGlider();
        }
        
        // Update drop physics with input and camera yaw
        this.playerDrop.update(deltaTime, input, this.camera.yaw);
        
        // Update player position
        this.player.setPosition(this.playerDrop.position);
        
        // Update camera
        this.camera.handleMouseMove(mouseDelta.x, mouseDelta.y);
        this.camera.updateTarget(this.playerDrop.position);
        this.camera.update(this.gameScene.threeScene, this.colliders);
        
        // Update altitude display
        this.hud.updateAltitude(this.playerDrop.position.y);
        
        // Check if landed
        if (this.playerDrop.state === DropState.LANDED) {
            this.phase = GamePhase.PLAYING;
            this.hud.showGliderUI(false);
            this.crosshair.show();
            this.lastGroundedY = this.player.getPosition().y;
            this.wasGrounded = true;
        }
    }
    
    updatePlayingPhase(deltaTime, currentTime, mouseDelta) {
        // Update camera with mouse
        this.camera.handleMouseMove(mouseDelta.x, mouseDelta.y);
        
        // Handle build mode toggle
        if (input.isToggleBuildMode()) {
            this.isBuildMode = !this.isBuildMode;
            this.hud.showBuildMode(this.isBuildMode);
            if (this.isBuildMode) {
                this.buildingSystem.showPreview(true);
            } else {
                this.buildingSystem.showPreview(false);
            }
        }
        
        // Handle building mode
        if (this.isBuildMode) {
            this.updateBuildMode(deltaTime, currentTime);
        } else {
            // Normal combat/movement update
            this.updateCombatMode(deltaTime, currentTime);
        }
        
        // Update player
        this.player.update(deltaTime, input, currentTime);
        
        // Handle fall damage
        this.handleFallDamage();
        
        // Update camera
        this.camera.update(this.gameScene.threeScene, this.colliders);
        
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
        
        // Update building system preview position
        if (this.isBuildMode) {
            const playerPos = this.player.getPosition();
            const lookDir = this.camera.getLookDirection();
            this.buildingSystem.updatePreviewPosition(playerPos, lookDir, this.camera.yaw);
        }
        
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
    
    updateBuildMode(deltaTime, currentTime) {
        // Build piece selection
        const buildSwitch = input.getBuildPieceSwitch();
        if (buildSwitch >= 0) {
            this.buildingSystem.selectPiece(buildSwitch);
            this.hud.updateBuildSlot(buildSwitch);
        }
        
        // Rotate build
        if (input.isRotateBuild()) {
            this.buildingSystem.rotatePiece();
        }
        
        // Cycle material
        if (input.isCycleMaterial()) {
            this.buildingSystem.cycleMaterial();
            const mat = this.buildingSystem.getCurrentMaterial();
            this.hud.updateMaterialType(mat.name, mat.cost);
        }
        
        // Place build
        if (input.isShooting()) {
            const mat = this.buildingSystem.getCurrentMaterial();
            const matKey = mat.name.toLowerCase();
            
            if (this.materials[matKey] >= mat.cost) {
                const placed = this.buildingSystem.placePiece(this.player);
                if (placed) {
                    this.materials[matKey] -= mat.cost;
                    this.hud.updateMaterials(this.materials.wood, this.materials.stone, this.materials.metal);
                }
            }
        }
    }
    
    updateCombatMode(deltaTime, currentTime) {
        // Handle shooting
        if (input.isShooting()) {
            this.handlePlayerShoot(currentTime);
        }
    }
    
    handleFallDamage() {
        const pos = this.player.getPosition();
        const isGrounded = this.player.isGrounded;
        
        if (isGrounded && !this.wasGrounded) {
            // Just landed
            const fallHeight = this.lastGroundedY - pos.y;
            if (fallHeight > 3) { // Minimum fall height for damage
                const damage = Math.floor((fallHeight - 3) * 5); // 5 damage per meter over 3m
                if (damage > 0) {
                    this.player.takeDamage(damage);
                    this.hud.showDamageIndicator(damage, window.innerWidth / 2, window.innerHeight / 2);
                }
            }
        }
        
        if (isGrounded) {
            this.lastGroundedY = pos.y;
        }
        
        this.wasGrounded = isGrounded;
    }
    
    handlePlayerShoot(currentTime) {
        const shots = this.player.shoot(currentTime);
        if (!shots) return;
        
        // Check if using pickaxe
        const weapon = this.player.weaponManager.currentWeapon;
        const isPickaxe = weapon.config && weapon.config.isPickaxe;
        
        for (const shot of shots) {
            // Raycast for hit detection
            const raycaster = new THREE.Raycaster(
                shot.origin,
                shot.direction,
                0,
                shot.range
            );
            
            // Check against bots, world, and harvestables
            const botMeshes = this.botManager.getAliveBots().map(b => b.mesh);
            const harvestables = this.island.getHarvestables();
            const buildPieces = this.buildingSystem ? this.buildingSystem.getColliders() : [];
            const allTargets = [...this.colliders, ...botMeshes, ...harvestables, ...buildPieces];
            
            const intersects = raycaster.intersectObjects(allTargets, true);
            
            if (intersects.length > 0) {
                const hit = intersects[0];
                
                // Check if hit a harvestable with pickaxe
                if (isPickaxe) {
                    const harvested = this.tryHarvest(hit, weapon.config.harvestDamage || 50);
                    if (harvested) {
                        this.projectileManager.createImpact(hit.point, false);
                        this.hud.showHitmarker();
                        continue;
                    }
                }
                
                // Create tracer (skip for pickaxe)
                if (!isPickaxe) {
                    this.projectileManager.createTracer(shot.origin, hit.point);
                }
                
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
            } else if (!isPickaxe) {
                // Miss - create tracer to max range
                const endPoint = shot.origin.clone().add(
                    shot.direction.clone().multiplyScalar(shot.range)
                );
                this.projectileManager.createTracer(shot.origin, endPoint);
            }
        }
    }
    
    tryHarvest(hit, damage) {
        let obj = hit.object;
        
        // Walk up to find harvestable parent
        while (obj) {
            if (obj.userData && obj.userData.harvestable) {
                // Found harvestable
                obj.userData.health -= 1;
                
                if (obj.userData.health <= 0) {
                    // Destroyed - give materials
                    const harvestType = HARVEST_TYPES[obj.userData.harvestType];
                    if (harvestType) {
                        this.materials[harvestType.gives] += harvestType.amount;
                        this.hud.updateMaterials(this.materials.wood, this.materials.stone, this.materials.metal);
                        this.hud.showPickupNotification(`+${harvestType.amount} ${harvestType.gives.toUpperCase()}`);
                    }
                    
                    // Remove the harvestable
                    this.island.removeHarvestable(obj);
                }
                
                return true;
            }
            obj = obj.parent;
        }
        
        return false;
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
        if (weapon.config && weapon.config.isPickaxe) {
            this.hud.updateAmmo('∞', '');
        } else {
            this.hud.updateAmmo(weapon.ammo, weapon.reserveAmmo);
        }
        
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
        
        // Materials
        this.hud.updateMaterials(this.materials.wood, this.materials.stone, this.materials.metal);
        
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
