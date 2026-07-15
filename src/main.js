import * as THREE from 'three';
import { input } from './input.js';
import { World, WORLD_SIZE } from './world.js';
import { Player, ShoulderCamera } from './player.js';
import { BotManager } from './bots.js';
import { BuildSystem, BUILD_MATS } from './building.js';
import { Storm, BattleBus, SkyDrop, DropState } from './systems.js';
import { LootManager } from './systems.js';
import { FXPool } from './weapons.js';
import { HUD } from './hud.js';
import { lerp, damp, rand } from './utils.js';

const Phase = { MENU: 'menu', BUS: 'bus', DROPPING: 'dropping', PLAYING: 'playing', ENDED: 'ended' };
const BOT_COUNT = 23;

class Game {
    constructor() {
        this.container = document.getElementById('game-container');
        this.setupRenderer();
        this.setupScene();

        this.cam = new ShoulderCamera();
        this.hud = new HUD();
        this.world = new World(this.scene);
        this.fx = new FXPool(this.scene);

        this.phase = Phase.MENU;
        this.player = null;
        this.bots = null;
        this.storm = null;
        this.bus = null;
        this.drop = null;
        this.loot = null;
        this.builds = null;
        this.buildMode = false;
        this.matchStart = 0;
        this.raycaster = new THREE.Raycaster();
        this.crossSpread = 8;

        // Menu wiring
        document.getElementById('play-btn').addEventListener('click', () => this.startMatch());
        document.getElementById('restart-btn').addEventListener('click', () => {
            document.getElementById('end-screen').classList.add('hidden');
            this.startMatch();
        });
        // Re-lock pointer on click during play
        this.renderer.domElement.addEventListener('click', () => {
            if (this.phase !== Phase.MENU && this.phase !== Phase.ENDED) input.lock(this.renderer.domElement);
        });

        // Reveal play button once assets exist (everything is procedural, so: now)
        document.getElementById('loading-bar').style.width = '100%';
        setTimeout(() => document.getElementById('play-btn').classList.remove('hidden'), 300);

        this.clock = new THREE.Clock();
        this.renderer.setAnimationLoop(() => this.frame());
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);
        window.addEventListener('resize', () => {
            if (window.innerWidth === 0 || window.innerHeight === 0) return; // minimized/hidden
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87b5e0);
        this.scene.fog = new THREE.Fog(0x87b5e0, 250, 700);

        const sun = new THREE.DirectionalLight(0xfff2dd, 2.2);
        sun.position.set(120, 180, 80);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const d = 260;
        sun.shadow.camera.left = -d; sun.shadow.camera.right = d;
        sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d;
        sun.shadow.camera.far = 600;
        this.scene.add(sun);
        this.scene.add(new THREE.AmbientLight(0x8aa4c4, 1.1));
        this.scene.add(new THREE.HemisphereLight(0xbcd8ff, 0x3f6f3a, 0.6));
    }

    // ------------------------------------------------------------ match lifecycle
    startMatch() {
        this.cleanup();
        document.getElementById('menu-screen').classList.add('hidden');
        this.hud.show(true);
        input.lock(this.renderer.domElement);

        this.player = new Player(this.scene, this.cam);
        this.player.mesh.visible = false;
        this.bots = new BotManager(this.scene);
        this.bots.spawn(BOT_COUNT, this.world);
        this.storm = new Storm(this.scene);
        this.bus = new BattleBus(this.scene);
        this.drop = new SkyDrop(this.world);
        this.loot = new LootManager(this.scene);
        this.loot.spawnFloorLoot(this.world, 60);
        this.builds = new BuildSystem(this.scene);
        this.buildMode = false;
        this.kills = 0;
        this.matchStart = performance.now() / 1000;
        this.phase = Phase.BUS;
        this.hud.setPhaseUI('bus');
        this.hud.setControlsHint(true);
        // reset chests
        for (const c of this.world.chests) {
            if (c.opened) {
                c.opened = false;
                c.lid.rotation.x = 0;
                c.lid.position.z = 0;
                c.glow.intensity = 0.9;
            }
        }
    }

    cleanup() {
        if (this.player) this.player.dispose();
        if (this.bots) this.bots.dispose();
        if (this.bus) this.bus.dispose();
        if (this.loot) this.loot.dispose();
        if (this.storm) this.scene.remove(this.storm.wall);
        if (this.builds) {
            for (const p of this.builds.pieces) this.scene.remove(p);
            this.scene.remove(this.builds.preview);
        }
    }

    structures() {
        return [...this.world.colliders, ...this.builds.pieces];
    }

    endMatch(victory, cause = '') {
        this.phase = Phase.ENDED;
        document.exitPointerLock();
        this.hud.show(false);
        const title = document.getElementById('end-title');
        const mins = ((performance.now() / 1000 - this.matchStart) / 60);
        title.textContent = victory ? '👑 VICTORY ROYALE' : 'ELIMINATED';
        title.className = victory ? 'victory' : 'defeat';
        const place = victory ? 1 : this.bots.alive.length + 2 - 1;
        document.getElementById('end-stats').innerHTML =
            `${victory ? '' : `#${place} of ${BOT_COUNT + 1} &middot; ${cause}<br>`}` +
            `${this.kills} elimination${this.kills === 1 ? '' : 's'} &middot; survived ${mins.toFixed(1)} min`;
        document.getElementById('end-screen').classList.remove('hidden');
    }

    // ------------------------------------------------------------ frame
    frame() {
        const dt = Math.min(this.clock.getDelta(), 0.05);
        const t = performance.now() / 1000;

        switch (this.phase) {
            case Phase.BUS: this.tickBus(dt, t); break;
            case Phase.DROPPING: this.tickDrop(dt, t); break;
            case Phase.PLAYING: this.tickPlaying(dt, t); break;
        }

        this.fx.update(dt);
        input.endFrame();

        // Self-heal canvas/camera if the window was 0-sized at load (hidden tab)
        const w = window.innerWidth, h = window.innerHeight;
        if (w > 0 && h > 0) {
            const size = this.renderer.getSize(new THREE.Vector2());
            if (size.x !== w || size.y !== h) {
                this.renderer.setSize(w, h);
                this.cam.camera.aspect = w / h;
                this.cam.camera.updateProjectionMatrix();
            }
        }
        this.renderer.render(this.scene, this.cam.camera);
    }

    tickBus(dt, t) {
        this.bus.update(dt);
        const p = this.bus.position;
        this.cam.camera.position.set(p.x - 18, p.y + 12, p.z + 18);
        this.cam.camera.lookAt(p);

        this.hud.drawMinimap(p, this.cam.yaw, this.storm, this.bus);
        this.storm.update(dt);
        this.hud.setMatch(this.bots.alive.length + 1, this.kills, this.storm.phaseInfo);

        if ((input.jump() && this.bus.canDrop) || this.bus.done) {
            const dropPos = this.bus.done
                ? new THREE.Vector3(rand(-80, 80), 110, rand(-80, 80))
                : this.bus.position.clone();
            this.drop.start(dropPos);
            this.player.setPosition(dropPos);
            this.player.mesh.visible = true;
            this.phase = Phase.DROPPING;
            this.hud.setPhaseUI('dropping', dropPos.y);
            this.bus.dispose();
        }
    }

    tickDrop(dt, t) {
        if (input.jump()) this.drop.deployGlider();
        this.cam.look(input.dx, input.dy);
        this.drop.update(dt, input, this.cam.forwardFlat(), this.cam.rightFlat());
        this.player.setPosition(this.drop.position);
        this.player.mesh.rotation.y = this.cam.yaw;
        this.cam.update(dt, this.drop.position, this.structures());

        const alt = this.drop.position.y - this.world.getHeight(this.drop.position.x, this.drop.position.z);
        this.hud.setPhaseUI('dropping', alt);
        this.hud.drawMinimap(this.drop.position, this.cam.yaw, this.storm, null);
        this.storm.update(dt);
        this.bots.update(dt, t, this.botCtx());
        this.hud.setMatch(this.bots.alive.length + 1, this.kills, this.storm.phaseInfo);

        if (this.drop.state === DropState.LANDED) {
            this.phase = Phase.PLAYING;
            this.hud.setPhaseUI('playing');
            this.hud.notifyMsg('Good luck!');
        }
    }

    botCtx() {
        return {
            world: this.world,
            player: this.player,
            // bots work in x/z; storm center is a Vector2 (x, y=z-in-world)
            storm: { center: { x: this.storm.center.x, z: this.storm.center.y }, radius: this.storm.radius, dps: this.storm.dps },
            structures: this.structures(),
            buildSystem: this.builds,
        };
    }

    tickPlaying(dt, t) {
        this.cam.look(input.dx, input.dy);

        // ---- build mode toggle ----
        if (input.toggleBuild()) {
            this.buildMode = !this.buildMode;
            this.builds.setActive(this.buildMode);
        }

        const w = this.player.arsenal.current;
        const aiming = input.aiming() && !this.buildMode && !w.cfg.melee;
        this.cam.setAim(aiming, aiming ? w.cfg.adsZoom : 1);
        this.hud.setScope(aiming && !!w.cfg.scope);

        if (this.buildMode) {
            this.tickBuildMode(t);
        } else {
            this.tickCombat(t, aiming);
        }

        // ---- player + camera ----
        const structures = this.structures();
        this.player.update(dt, input, this.world, structures);
        this.cam.update(dt, this.player.position, structures);

        // ---- bots ----
        this.bots.update(dt, t, this.botCtx());
        for (const bot of this.bots.alive) {
            const shots = bot.tryShoot(t, this.player);
            if (shots) this.resolveBotShots(shots, bot);
        }
        this.bots.simulateFights(t, (k, v) => this.hud.killFeed(k, v));
        this.bots.applyStormDamage(dt, { center: { x: this.storm.center.x, z: this.storm.center.y }, radius: this.storm.radius, dps: this.storm.dps },
            (k, v) => this.hud.killFeed(k, v));

        // ---- storm ----
        this.storm.update(dt);
        const outside = this.storm.isOutside(this.player.position);
        this.hud.setStormWarning(outside);
        if (outside) this.player.takeDamage(this.storm.dps * dt);

        // ---- loot & chests ----
        this.loot.update(t);
        const chest = this.world.nearestChest(this.player.position);
        const item = chest ? null : this.loot.nearest(this.player.position);
        this.hud.setInteract(chest ? '[E] Open Chest' : item ? `[E] ${this.loot.label(item)}` : null);
        if (input.interact()) {
            if (chest) {
                this.world.openChest(chest);
                for (const drop of this.loot.chestLoot()) {
                    const p = chest.position.clone();
                    p.x += rand(-0.8, 0.8); p.z += rand(-0.8, 0.8);
                    this.loot.spawnAt(p, drop);
                }
                this.hud.notifyMsg('Chest opened!');
            } else if (item) {
                this.hud.notifyMsg(this.loot.collect(item, this.player));
            }
        }

        // ---- weapon switching ----
        if (!this.buildMode) {
            const slot = input.slot();
            if (slot >= 0 && this.player.arsenal.switchTo(slot)) this.player.refreshGunMesh();
            if (input.reload()) w.startReload(t);
        }

        // ---- crosshair spread ----
        const moving = Math.hypot(this.player.velocity.x, this.player.velocity.z) > 1;
        const target = aiming ? 3 : moving ? 14 : 8;
        this.crossSpread = lerp(this.crossSpread, target, damp(10, dt));
        this.hud.setCrosshairSpread(this.crossSpread);

        // ---- HUD ----
        this.hud.setVitals(this.player.health, this.player.maxHealth, this.player.shield, this.player.maxShield);
        this.hud.setMats(this.player.materials);
        this.hud.setAmmo(this.player.arsenal.current, t);
        this.hud.setHotbar(this.player.arsenal);
        this.hud.setMatch(this.bots.alive.length + 1, this.kills, this.storm.phaseInfo);
        this.hud.setBuildMode(this.buildMode, this.builds, this.player.materials);
        this.hud.drawMinimap(this.player.position, this.cam.yaw, this.storm, null);

        // ---- end conditions ----
        if (!this.player.alive) {
            this.endMatch(false, outside ? 'Lost to the storm' : 'Eliminated');
        } else if (this.bots.alive.length === 0) {
            this.endMatch(true);
        }
    }

    tickBuildMode(t) {
        const piece = input.buildPiece();
        if (piece >= 0) this.builds.selectPiece(piece);
        if (input.buttonsJust[2]) this.builds.cycleMaterial();
        if (input.rotateBuild()) this.builds.rotate();

        this.builds.updatePreviewDir(
            this.player.position,
            this.cam.forwardFlat(),
            (x, z) => this.world.getHeight(x, z)
        );

        if (input.firing()) {
            const mat = this.builds.material;
            const key = this.builds.materialKey;
            if (this.player.materials[key] >= mat.cost) {
                if (this.builds.place()) {
                    this.player.materials[key] -= mat.cost;
                }
            } else if (input.fireJust()) {
                this.hud.notifyMsg(`Not enough ${mat.name.toLowerCase()}!`);
            }
        }
    }

    tickCombat(t, aiming) {
        const w = this.player.arsenal.current;
        const wantFire = w.cfg.auto ? input.firing() : input.fireJust();
        if (!wantFire) return;

        // Fire along the exact crosshair ray so shots land where you aim.
        const { origin, direction } = this.cam.aimRay();
        // Push origin forward past the player so you can't shoot yourself
        const shotOrigin = origin.clone().addScaledVector(direction, w.cfg.melee ? 1.2 : 2.6);
        const shots = w.fire(t, shotOrigin, direction, aiming);
        if (!shots) {
            if (w.ammo === 0 && !w.reloading && !w.cfg.melee) w.startReload(t);
            return;
        }

        this.cam.kick(w.cfg.recoil || 0);
        // Muzzle flash near the player's gun
        if (!w.cfg.melee) {
            const muzzle = this.player.position.clone();
            muzzle.y += 1.4;
            muzzle.addScaledVector(direction, 0.9);
            this.fx.muzzle(muzzle);
        }

        for (const shot of shots) this.resolvePlayerShot(shot, w, t);
    }

    resolvePlayerShot(shot, weapon, t) {
        this.raycaster.set(shot.origin, shot.direction);
        this.raycaster.far = shot.range;

        const targets = [
            this.world.terrain,
            ...this.world.colliders,
            ...this.world.harvestables,
            ...this.builds.pieces,
            ...this.bots.alive.map(b => b.mesh),
        ];
        const hits = this.raycaster.intersectObjects(targets, true);
        const hit = hits.find(h => h.object.visible);

        const tracerFrom = this.player.position.clone();
        tracerFrom.y += 1.4;

        if (!hit) {
            if (!weapon.cfg.melee) {
                this.fx.tracer(tracerFrom, shot.origin.clone().addScaledVector(shot.direction, shot.range));
            }
            return;
        }

        if (!weapon.cfg.melee) this.fx.tracer(tracerFrom, hit.point);

        // 1) bot?
        const bot = hit.object.userData.bot;
        if (bot && bot.alive) {
            const headshot = hit.object.userData.isHead === true;
            const dmg = Math.round(shot.damage * (headshot ? shot.headshotMult : 1));
            bot.takeDamage(dmg);
            this.fx.impact(hit.point, true);
            this.hud.hitmarker(headshot);
            this.hud.damageNumber(dmg, headshot);
            if (!bot.alive) {
                this.kills++;
                this.hud.killFeed('You', bot.name);
                this.hud.notifyMsg(`Eliminated ${bot.name}!`);
                // Bots drop their weapon + a consumable
                this.loot.spawnAt(bot.position.clone(), { kind: 'weapon', item: bot.weapon });
                this.loot.spawnAt(bot.position.clone().add(new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1))),
                    Math.random() < 0.5 ? { kind: 'ammo', amount: 30 } : { kind: 'minis' });
            }
            return;
        }

        // 2) harvestable (pickaxe farms, guns just damage-impact)
        if (hit.object.userData.harvestRoot) {
            if (weapon.cfg.melee) {
                const result = this.world.harvestHit(hit.object);
                if (result && result !== 'hit') {
                    this.player.materials[result.gives] += result.amount;
                    this.hud.notifyMsg(`+${result.amount} ${result.gives}`);
                }
                this.hud.hitmarker(false);
            }
            this.fx.impact(hit.point, false);
            return;
        }

        // 3) placed build piece — damage it
        if (hit.object.userData.build) {
            const dmg = weapon.cfg.melee ? 50 : shot.damage;
            this.builds.damage(hit.object, dmg);
            this.fx.impact(hit.point, false);
            this.hud.hitmarker(false);
            return;
        }

        // 4) world
        this.fx.impact(hit.point, false);
    }

    resolveBotShots(shots, bot) {
        for (const shot of shots) {
            this.raycaster.set(shot.origin, shot.direction);
            this.raycaster.far = shot.range;
            const targets = [this.world.terrain, ...this.world.colliders, ...this.builds.pieces, this.player.mesh];
            const hits = this.raycaster.intersectObjects(targets, true);
            if (!hits.length) {
                this.fx.tracer(shot.origin, shot.origin.clone().addScaledVector(shot.direction, Math.min(shot.range, 60)), 0xff6655);
                continue;
            }
            const hit = hits[0];
            this.fx.tracer(shot.origin, hit.point, 0xff6655);

            let node = hit.object, hitPlayer = false;
            while (node) {
                if (node === this.player.mesh) { hitPlayer = true; break; }
                node = node.parent;
            }
            if (hitPlayer) {
                this.player.takeDamage(shot.damage);
                this.fx.impact(hit.point, true);
            } else if (hit.object.userData.build) {
                this.builds.damage(hit.object, shot.damage);
                this.fx.impact(hit.point, false);
            } else {
                this.fx.impact(hit.point, false);
            }
        }
    }
}

// Exposed for debugging/automation
window.game = new Game();
