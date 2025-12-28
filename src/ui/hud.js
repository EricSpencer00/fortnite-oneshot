import { formatTime } from '../utils/math.js';

export class HUD {
    constructor() {
        // Get DOM elements
        this.healthBar = document.getElementById('health-bar');
        this.healthText = document.getElementById('health-text');
        this.shieldBar = document.getElementById('shield-bar');
        this.shieldText = document.getElementById('shield-text');
        
        this.ammoCurrent = document.getElementById('ammo-current');
        this.ammoReserve = document.getElementById('ammo-reserve');
        
        this.weaponSlots = [
            document.getElementById('slot-0'),
            document.getElementById('slot-1'),
            document.getElementById('slot-2'),
            document.getElementById('slot-3')
        ];
        
        this.stormPhase = document.getElementById('storm-phase');
        this.stormTimer = document.getElementById('storm-timer');
        this.stormWarning = document.getElementById('storm-warning');
        
        this.aliveCount = document.getElementById('alive-count');
        
        this.killFeed = document.getElementById('kill-feed');
        
        this.reloadIndicator = document.getElementById('reload-indicator');
        
        this.pickupNotification = document.getElementById('pickup-notification');
        
        this.interactPrompt = document.getElementById('interact-prompt');
        
        this.hitmarker = document.getElementById('hitmarker');
        
        // Minimap
        this.minimapCanvas = document.getElementById('minimap');
        this.minimapCtx = this.minimapCanvas.getContext('2d');
        this.minimapCanvas.width = 180;
        this.minimapCanvas.height = 180;
        
        this.killFeedEntries = [];
        
        // Material displays
        this.woodCount = document.getElementById('wood-count');
        this.stoneCount = document.getElementById('stone-count');
        this.metalCount = document.getElementById('metal-count');
        
        // Build mode elements
        this.buildModeOverlay = document.getElementById('build-mode-overlay');
        this.buildSlots = [
            document.getElementById('build-wall'),
            document.getElementById('build-floor'),
            document.getElementById('build-stair'),
            document.getElementById('build-cone')
        ];
        this.materialTypeIndicator = document.getElementById('material-type-indicator');
        
        // Edit mode elements
        this.editModeOverlay = document.getElementById('edit-mode-overlay');
        this.editCells = document.querySelectorAll('.edit-cell');
        
        // Battle bus / glider
        this.busUI = document.getElementById('bus-ui');
        this.gliderUI = document.getElementById('glider-ui');
        this.altitudeDisplay = document.getElementById('altitude-display');
    }
    
    // Material updates
    updateMaterials(wood, stone, metal) {
        this.woodCount.textContent = wood;
        this.stoneCount.textContent = stone;
        this.metalCount.textContent = metal;
    }
    
    // Build mode UI
    showBuildMode(show) {
        this.buildModeOverlay.classList.toggle('show', show);
    }
    
    updateBuildSlot(index) {
        this.buildSlots.forEach((slot, i) => {
            slot.classList.toggle('active', i === index);
        });
    }
    
    updateMaterialType(materialName, cost) {
        this.materialTypeIndicator.textContent = `${materialName.toUpperCase()} (${cost})`;
    }
    
    // Edit mode UI
    showEditMode(show) {
        this.editModeOverlay.classList.toggle('show', show);
    }
    
    updateEditGrid(selectedCells) {
        this.editCells.forEach((cell, i) => {
            cell.classList.toggle('selected', selectedCells[i]);
        });
    }
    
    // Battle bus UI
    showBusUI(show) {
        this.busUI.classList.toggle('show', show);
    }
    
    // Glider UI
    showGliderUI(show) {
        this.gliderUI.classList.toggle('show', show);
    }
    
    updateAltitude(altitude) {
        this.altitudeDisplay.textContent = `${Math.round(altitude)}m`;
    }
    
    updateHealth(health, maxHealth) {
        const percent = (health / maxHealth) * 100;
        this.healthBar.style.width = `${percent}%`;
        this.healthText.textContent = Math.ceil(health);
        
        // Color based on health
        if (percent > 50) {
            this.healthBar.style.background = 'linear-gradient(to right, #2ecc71, #27ae60)';
        } else if (percent > 25) {
            this.healthBar.style.background = 'linear-gradient(to right, #f39c12, #e67e22)';
        } else {
            this.healthBar.style.background = 'linear-gradient(to right, #e74c3c, #c0392b)';
        }
    }
    
    updateShield(shield, maxShield) {
        const percent = (shield / maxShield) * 100;
        this.shieldBar.style.width = `${percent}%`;
        this.shieldText.textContent = Math.ceil(shield);
    }
    
    updateAmmo(current, reserve) {
        this.ammoCurrent.textContent = current;
        this.ammoReserve.textContent = reserve;
        
        // Flash when low
        if (current <= 5) {
            this.ammoCurrent.style.color = '#e74c3c';
        } else {
            this.ammoCurrent.style.color = 'white';
        }
    }
    
    updateWeaponSlot(index, isActive) {
        for (let i = 0; i < this.weaponSlots.length; i++) {
            if (i === index) {
                this.weaponSlots[i].classList.add('active');
            } else {
                this.weaponSlots[i].classList.remove('active');
            }
        }
    }
    
    updateStorm(phaseInfo) {
        if (phaseInfo.isShrinking) {
            this.stormPhase.textContent = 'STORM MOVING';
            this.stormTimer.style.color = '#e74c3c';
        } else {
            this.stormPhase.textContent = `STORM PHASE ${phaseInfo.phase}`;
            this.stormTimer.style.color = 'white';
        }
        
        const mins = Math.floor(phaseInfo.timeRemaining / 60);
        const secs = phaseInfo.timeRemaining % 60;
        this.stormTimer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    showStormWarning(show) {
        this.stormWarning.style.display = show ? 'block' : 'none';
    }
    
    updateAliveCount(count) {
        this.aliveCount.textContent = count;
    }
    
    addKillFeedEntry(killer, victim, weapon) {
        const entry = document.createElement('div');
        entry.className = 'kill-entry';
        entry.innerHTML = `<span style="color: ${killer === 'You' ? '#2ecc71' : '#e74c3c'}">${killer}</span> eliminated <span style="color: #ccc">${victim}</span>`;
        
        this.killFeed.insertBefore(entry, this.killFeed.firstChild);
        
        // Keep only last 5 entries
        while (this.killFeed.children.length > 5) {
            this.killFeed.removeChild(this.killFeed.lastChild);
        }
        
        // Remove after 5 seconds
        setTimeout(() => {
            if (entry.parentNode) {
                entry.parentNode.removeChild(entry);
            }
        }, 5000);
    }
    
    showReloading(show) {
        this.reloadIndicator.classList.toggle('show', show);
    }
    
    showPickupNotification(text) {
        this.pickupNotification.textContent = text;
        this.pickupNotification.classList.remove('show');
        void this.pickupNotification.offsetWidth; // Force reflow
        this.pickupNotification.classList.add('show');
        
        setTimeout(() => {
            this.pickupNotification.classList.remove('show');
        }, 2000);
    }
    
    showInteractPrompt(show, text = 'Press E to pick up') {
        this.interactPrompt.textContent = text;
        this.interactPrompt.classList.toggle('show', show);
    }
    
    showHitmarker() {
        this.hitmarker.classList.remove('show');
        void this.hitmarker.offsetWidth;
        this.hitmarker.classList.add('show');
    }
    
    updateMinimap(playerPos, playerYaw, stormCenter, stormRadius, bots = []) {
        const ctx = this.minimapCtx;
        const w = this.minimapCanvas.width;
        const h = this.minimapCanvas.height;
        const scale = 0.35; // Scale factor for world to minimap
        
        // Clear
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, w, h);
        
        // Draw storm circle
        ctx.strokeStyle = 'rgba(128, 0, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const stormX = w / 2 + (stormCenter.x - playerPos.x) * scale;
        const stormY = h / 2 + (stormCenter.z - playerPos.z) * scale;
        const stormR = stormRadius * scale;
        ctx.arc(stormX, stormY, stormR, 0, Math.PI * 2);
        ctx.stroke();
        
        // Fill outside storm area
        ctx.fillStyle = 'rgba(128, 0, 255, 0.2)';
        ctx.beginPath();
        ctx.rect(0, 0, w, h);
        ctx.arc(stormX, stormY, stormR, 0, Math.PI * 2, true);
        ctx.fill();
        
        // Draw bots as red dots
        ctx.fillStyle = '#e74c3c';
        for (const bot of bots) {
            if (!bot.alive) continue;
            const bx = w / 2 + (bot.position.x - playerPos.x) * scale;
            const by = h / 2 + (bot.position.z - playerPos.z) * scale;
            
            // Only show if within minimap bounds
            if (bx > 0 && bx < w && by > 0 && by < h) {
                ctx.beginPath();
                ctx.arc(bx, by, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Draw player as arrow
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.rotate(-playerYaw + Math.PI);
        
        ctx.fillStyle = '#2ecc71';
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(-5, 5);
        ctx.lineTo(5, 5);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
        
        // Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, w, h);
    }
    
    showDamageIndicator(damage, x, y) {
        const indicator = document.createElement('div');
        indicator.className = 'damage-indicator';
        indicator.textContent = `-${Math.ceil(damage)}`;
        indicator.style.left = `${x}px`;
        indicator.style.top = `${y}px`;
        
        document.getElementById('hud').appendChild(indicator);
        
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.parentNode.removeChild(indicator);
            }
        }, 1000);
    }
}
