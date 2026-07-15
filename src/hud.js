import { RARITIES } from './weapons.js';
import { WORLD_SIZE } from './world.js';
import { MAT_KEYS, PIECES } from './building.js';

const $ = (id) => document.getElementById(id);

export class HUD {
    constructor() {
        this.el = {
            hud: $('hud'),
            healthFill: $('health-fill'), healthText: $('health-text'),
            shieldFill: $('shield-fill'), shieldText: $('shield-text'),
            wood: $('mat-wood'), stone: $('mat-stone'), metal: $('mat-metal'),
            ammo: $('ammo-count'), reserve: $('ammo-reserve'), reload: $('reload-bar'),
            reloadWrap: $('reload-wrap'),
            hotbar: $('hotbar'),
            killfeed: $('killfeed'),
            stormTimer: $('storm-timer'), alive: $('alive-count'), killCount: $('kill-count'),
            interact: $('interact-prompt'),
            notify: $('notify'),
            busPrompt: $('bus-prompt'), gliderPrompt: $('glider-prompt'), altitude: $('altitude'),
            buildBar: $('build-bar'),
            crosshair: $('crosshair'),
            hitmarker: $('hitmarker'),
            damageNumbers: $('damage-numbers'),
            stormWarning: $('storm-warning'),
            vignette: $('vignette'),
            scope: $('scope-overlay'),
            minimap: $('minimap'),
            controlsHint: $('controls-hint'),
        };
        this.mapCtx = this.el.minimap.getContext('2d');
        this.notifyTimeout = null;
        this.hitTimeout = null;
    }

    show(on) { this.el.hud.style.display = on ? 'block' : 'none'; }

    setVitals(hp, maxHp, sh, maxSh) {
        this.el.healthFill.style.width = `${(hp / maxHp) * 100}%`;
        this.el.healthText.textContent = Math.ceil(hp);
        this.el.shieldFill.style.width = `${(sh / maxSh) * 100}%`;
        this.el.shieldText.textContent = Math.ceil(sh);
        this.el.vignette.style.opacity = hp < 35 ? (1 - hp / 35) * 0.7 : 0;
    }

    setMats(m) {
        this.el.wood.textContent = m.wood;
        this.el.stone.textContent = m.stone;
        this.el.metal.textContent = m.metal;
    }

    setAmmo(weapon, t) {
        if (weapon.cfg.melee) {
            this.el.ammo.textContent = '∞';
            this.el.reserve.textContent = '';
        } else {
            this.el.ammo.textContent = weapon.ammo;
            this.el.reserve.textContent = ` / ${weapon.reserve}`;
        }
        const reloading = weapon.reloading;
        this.el.reloadWrap.style.display = reloading ? 'block' : 'none';
        if (reloading) this.el.reload.style.width = `${weapon.reloadProgress(t) * 100}%`;
    }

    setHotbar(arsenal) {
        const cells = this.el.hotbar.children;
        for (let i = 0; i < cells.length; i++) {
            const w = arsenal.slots[i];
            const cell = cells[i];
            cell.className = 'hotbar-slot' + (i === arsenal.index ? ' active' : '');
            if (w) {
                cell.textContent = w.cfg.melee ? '⛏' : w.cfg.name.split(' ').map(s => s[0]).join('');
                cell.style.borderColor = i === arsenal.index ? '#fff' : RARITIES[w.rarity].color;
                cell.style.color = RARITIES[w.rarity].color;
            } else {
                cell.textContent = '';
                cell.style.borderColor = 'rgba(255,255,255,0.15)';
            }
        }
    }

    killFeed(killer, victim, weapon) {
        const div = document.createElement('div');
        div.className = 'kill-entry';
        div.innerHTML = `<b>${killer}</b> eliminated <b>${victim}</b>`;
        this.el.killfeed.prepend(div);
        while (this.el.killfeed.children.length > 5) this.el.killfeed.lastChild.remove();
        setTimeout(() => div.remove(), 6000);
    }

    setMatch(aliveN, kills, stormInfo) {
        this.el.alive.textContent = aliveN;
        this.el.killCount.textContent = kills;
        if (stormInfo.done) {
            this.el.stormTimer.textContent = 'FINAL STORM';
        } else {
            const m = Math.floor(stormInfo.timer / 60), s = Math.floor(stormInfo.timer % 60);
            this.el.stormTimer.textContent =
                (stormInfo.shrinking ? '⚠ ' : '') + `${m}:${s.toString().padStart(2, '0')}`;
            this.el.stormTimer.style.color = stormInfo.shrinking ? '#e879ff' : '#fff';
        }
    }

    setInteract(text) {
        this.el.interact.style.display = text ? 'block' : 'none';
        if (text) this.el.interact.textContent = text;
    }

    notifyMsg(msg) {
        this.el.notify.textContent = msg;
        this.el.notify.style.opacity = 1;
        clearTimeout(this.notifyTimeout);
        this.notifyTimeout = setTimeout(() => { this.el.notify.style.opacity = 0; }, 1800);
    }

    setPhaseUI(phase, altitude = 0) {
        this.el.busPrompt.style.display = phase === 'bus' ? 'block' : 'none';
        this.el.gliderPrompt.style.display = phase === 'dropping' ? 'block' : 'none';
        if (phase === 'dropping') this.el.altitude.textContent = `${Math.max(0, Math.round(altitude))}m`;
    }

    setBuildMode(active, buildSystem, mats) {
        this.el.buildBar.style.display = active ? 'flex' : 'none';
        this.el.crosshair.classList.toggle('build', active);
        if (!active) return;
        const cells = this.el.buildBar.children;
        const icons = ['▯', '▬', '◢', '⌂'];
        for (let i = 0; i < 4; i++) {
            cells[i].className = 'build-slot' + (i === buildSystem.pieceIndex ? ' active' : '');
            cells[i].textContent = `${icons[i]} ${PIECES[i]}`;
        }
        const matCell = cells[4];
        const key = buildSystem.materialKey;
        matCell.className = 'build-slot mat';
        matCell.textContent = `${buildSystem.material.name} (${mats[key]})`;
    }

    hitmarker(headshot) {
        this.el.hitmarker.style.color = headshot ? '#ffd24d' : '#fff';
        this.el.hitmarker.classList.remove('pop');
        void this.el.hitmarker.offsetWidth;
        this.el.hitmarker.classList.add('pop');
    }

    damageNumber(amount, headshot) {
        const div = document.createElement('div');
        div.className = 'dmg-num' + (headshot ? ' head' : '');
        div.textContent = Math.round(amount);
        div.style.left = `${50 + (Math.random() - 0.5) * 12}%`;
        div.style.top = `${42 + (Math.random() - 0.5) * 8}%`;
        this.el.damageNumbers.appendChild(div);
        setTimeout(() => div.remove(), 900);
    }

    setStormWarning(outside) {
        this.el.stormWarning.style.display = outside ? 'block' : 'none';
    }

    setScope(on) {
        this.el.scope.style.display = on ? 'block' : 'none';
        this.el.crosshair.style.display = on ? 'none' : 'block';
    }

    setCrosshairSpread(px) {
        this.el.crosshair.style.setProperty('--spread', `${px}px`);
    }

    setControlsHint(on) {
        this.el.controlsHint.style.display = on ? 'block' : 'none';
    }

    drawMinimap(playerPos, yaw, storm, bus) {
        const ctx = this.mapCtx;
        const S = this.el.minimap.width;
        const scale = S / (WORLD_SIZE * 1.15);
        const toMap = (x, z) => [S / 2 + x * scale, S / 2 + z * scale];

        ctx.clearRect(0, 0, S, S);
        // island
        ctx.fillStyle = 'rgba(20,50,80,0.85)';
        ctx.fillRect(0, 0, S, S);
        ctx.fillStyle = '#4d8a45';
        ctx.beginPath();
        ctx.arc(S / 2, S / 2, (WORLD_SIZE / 2) * scale, 0, Math.PI * 2);
        ctx.fill();

        // storm circle
        ctx.strokeStyle = '#c44de8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const [sx, sy] = toMap(storm.center.x, storm.center.y);
        ctx.arc(sx, sy, storm.radius * scale, 0, Math.PI * 2);
        ctx.stroke();

        // bus line
        if (bus && !bus.done) {
            const [bx, by] = toMap(bus.position.x, bus.position.z);
            ctx.fillStyle = '#ffd24d';
            ctx.beginPath();
            ctx.arc(bx, by, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        // player arrow
        const [px, py] = toMap(playerPos.x, playerPos.z);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(-yaw);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(4, 5);
        ctx.lineTo(-4, 5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}
