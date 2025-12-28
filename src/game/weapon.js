import * as THREE from 'three';

// Weapon definitions
export const WEAPON_TYPES = {
    AR: {
        name: 'AR',
        damage: 30,
        fireRate: 0.12, // seconds between shots
        magazineSize: 30,
        reloadTime: 2.2,
        spread: 0.03,
        range: 200,
        automatic: true,
        color: 0x7C4DFF
    },
    SHOTGUN: {
        name: 'Shotgun',
        damage: 80,
        fireRate: 0.9,
        magazineSize: 5,
        reloadTime: 3.0,
        spread: 0.15,
        range: 30,
        automatic: false,
        pellets: 8,
        color: 0xFF5722
    },
    SMG: {
        name: 'SMG',
        damage: 20,
        fireRate: 0.06,
        magazineSize: 40,
        reloadTime: 2.0,
        spread: 0.06,
        range: 100,
        automatic: true,
        color: 0x4CAF50
    }
};

export class Weapon {
    constructor(type, scene) {
        this.type = type;
        this.config = WEAPON_TYPES[type];
        this.scene = scene;
        
        this.ammo = this.config.magazineSize;
        this.reserveAmmo = this.config.magazineSize * 3;
        
        this.lastFireTime = 0;
        this.isReloading = false;
        this.reloadStartTime = 0;
        
        this.muzzleFlash = null;
        this.muzzleFlashDuration = 0.05;
        this.muzzleFlashTimer = 0;
        
        this.createMuzzleFlash();
    }
    
    createMuzzleFlash() {
        const geometry = new THREE.SphereGeometry(0.3, 8, 8);
        const material = new THREE.MeshBasicMaterial({
            color: 0xFFFF00,
            transparent: true,
            opacity: 0.8
        });
        this.muzzleFlash = new THREE.Mesh(geometry, material);
        this.muzzleFlash.visible = false;
        this.scene.add(this.muzzleFlash);
    }
    
    canFire(currentTime) {
        if (this.isReloading) return false;
        if (this.ammo <= 0) return false;
        if (currentTime - this.lastFireTime < this.config.fireRate * 1000) return false;
        return true;
    }
    
    fire(currentTime, origin, direction) {
        if (!this.canFire(currentTime)) return null;
        
        this.lastFireTime = currentTime;
        this.ammo--;
        
        // Show muzzle flash
        this.showMuzzleFlash(origin, direction);
        
        // Calculate spread
        const shots = [];
        const pelletCount = this.config.pellets || 1;
        
        for (let i = 0; i < pelletCount; i++) {
            const spreadDir = direction.clone();
            spreadDir.x += (Math.random() - 0.5) * this.config.spread;
            spreadDir.y += (Math.random() - 0.5) * this.config.spread;
            spreadDir.z += (Math.random() - 0.5) * this.config.spread;
            spreadDir.normalize();
            
            shots.push({
                origin: origin.clone(),
                direction: spreadDir,
                damage: this.config.pellets ? this.config.damage / this.config.pellets : this.config.damage,
                range: this.config.range
            });
        }
        
        return shots;
    }
    
    showMuzzleFlash(origin, direction) {
        this.muzzleFlash.position.copy(origin).add(direction.clone().multiplyScalar(1));
        this.muzzleFlash.visible = true;
        this.muzzleFlashTimer = this.muzzleFlashDuration;
    }
    
    startReload(currentTime) {
        if (this.isReloading) return false;
        if (this.ammo === this.config.magazineSize) return false;
        if (this.reserveAmmo <= 0) return false;
        
        this.isReloading = true;
        this.reloadStartTime = currentTime;
        return true;
    }
    
    update(deltaTime, currentTime) {
        // Update muzzle flash
        if (this.muzzleFlashTimer > 0) {
            this.muzzleFlashTimer -= deltaTime;
            if (this.muzzleFlashTimer <= 0) {
                this.muzzleFlash.visible = false;
            }
        }
        
        // Update reload
        if (this.isReloading) {
            if (currentTime - this.reloadStartTime >= this.config.reloadTime * 1000) {
                const ammoNeeded = this.config.magazineSize - this.ammo;
                const ammoToAdd = Math.min(ammoNeeded, this.reserveAmmo);
                this.ammo += ammoToAdd;
                this.reserveAmmo -= ammoToAdd;
                this.isReloading = false;
            }
        }
    }
    
    getReloadProgress(currentTime) {
        if (!this.isReloading) return 1;
        return (currentTime - this.reloadStartTime) / (this.config.reloadTime * 1000);
    }
    
    addAmmo(amount) {
        this.reserveAmmo += amount;
    }
    
    dispose() {
        if (this.muzzleFlash) {
            this.scene.remove(this.muzzleFlash);
            this.muzzleFlash.geometry.dispose();
            this.muzzleFlash.material.dispose();
        }
    }
}

export class WeaponManager {
    constructor(scene) {
        this.scene = scene;
        this.weapons = [
            new Weapon('AR', scene),
            new Weapon('SHOTGUN', scene),
            new Weapon('SMG', scene)
        ];
        this.currentIndex = 0;
    }
    
    get currentWeapon() {
        return this.weapons[this.currentIndex];
    }
    
    switchTo(index) {
        if (index >= 0 && index < this.weapons.length) {
            // Cancel current reload
            if (this.currentWeapon.isReloading) {
                this.currentWeapon.isReloading = false;
            }
            this.currentIndex = index;
        }
    }
    
    update(deltaTime, currentTime) {
        for (const weapon of this.weapons) {
            weapon.update(deltaTime, currentTime);
        }
    }
    
    dispose() {
        for (const weapon of this.weapons) {
            weapon.dispose();
        }
    }
}
