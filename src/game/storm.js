import * as THREE from 'three';

export class Storm {
    constructor(scene) {
        this.scene = scene;
        
        // Storm configuration
        this.phases = [
            { delay: 60, shrinkTime: 30, radius: 250, damage: 1 },
            { delay: 45, shrinkTime: 25, radius: 180, damage: 2 },
            { delay: 40, shrinkTime: 20, radius: 120, damage: 5 },
            { delay: 30, shrinkTime: 15, radius: 60, damage: 8 },
            { delay: 20, shrinkTime: 10, radius: 20, damage: 10 },
            { delay: 10, shrinkTime: 5, radius: 0, damage: 15 }
        ];
        
        this.currentPhase = 0;
        this.phaseTimer = this.phases[0].delay;
        this.isShrinking = false;
        this.shrinkProgress = 0;
        
        this.currentRadius = 250;
        this.targetRadius = 250;
        this.startRadius = 250;
        
        this.center = new THREE.Vector3(0, 0, 0);
        this.targetCenter = new THREE.Vector3(0, 0, 0);
        this.startCenter = new THREE.Vector3(0, 0, 0);
        
        this.damageTimer = 0;
        this.damageInterval = 1; // damage per second
        
        this.createStormVisuals();
    }
    
    createStormVisuals() {
        // Storm wall cylinder
        const geometry = new THREE.CylinderGeometry(
            this.currentRadius,
            this.currentRadius,
            100,
            64,
            1,
            true
        );
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                color: { value: new THREE.Color(0x8B00FF) }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vPosition;
                void main() {
                    vUv = uv;
                    vPosition = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 color;
                varying vec2 vUv;
                varying vec3 vPosition;
                
                float noise(vec2 p) {
                    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
                }
                
                void main() {
                    float n = noise(vUv * 10.0 + time * 0.5);
                    float alpha = 0.4 + n * 0.2;
                    alpha *= smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
                    
                    vec3 finalColor = color + vec3(n * 0.2, 0.0, n * 0.3);
                    gl_FragColor = vec4(finalColor, alpha);
                }
            `,
            transparent: true,
            side: THREE.BackSide,
            depthWrite: false
        });
        
        this.stormMesh = new THREE.Mesh(geometry, material);
        this.stormMesh.position.y = 50;
        this.scene.add(this.stormMesh);
        
        // Safe zone indicator on ground
        const ringGeometry = new THREE.RingGeometry(
            this.currentRadius - 1,
            this.currentRadius + 1,
            64
        );
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0xFFFFFF,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        
        this.safeZoneRing = new THREE.Mesh(ringGeometry, ringMaterial);
        this.safeZoneRing.rotation.x = -Math.PI / 2;
        this.safeZoneRing.position.y = 0.5;
        this.scene.add(this.safeZoneRing);
        
        // Next zone indicator (when shrinking)
        const nextRingGeometry = new THREE.RingGeometry(0, 1, 64);
        const nextRingMaterial = new THREE.MeshBasicMaterial({
            color: 0xFFFF00,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        
        this.nextZoneRing = new THREE.Mesh(nextRingGeometry, nextRingMaterial);
        this.nextZoneRing.rotation.x = -Math.PI / 2;
        this.nextZoneRing.position.y = 0.6;
        this.nextZoneRing.visible = false;
        this.scene.add(this.nextZoneRing);
    }
    
    update(deltaTime, time, playerPosition) {
        // Update shader time
        this.stormMesh.material.uniforms.time.value = time;
        
        // Phase timer
        if (!this.isShrinking) {
            this.phaseTimer -= deltaTime;
            
            if (this.phaseTimer <= 0 && this.currentPhase < this.phases.length) {
                this.startShrinking();
            }
        } else {
            // Shrinking
            const phase = this.phases[this.currentPhase];
            this.shrinkProgress += deltaTime / phase.shrinkTime;
            
            if (this.shrinkProgress >= 1) {
                this.shrinkProgress = 1;
                this.finishShrinking();
            }
            
            // Interpolate radius and center
            this.currentRadius = THREE.MathUtils.lerp(
                this.startRadius,
                this.targetRadius,
                this.easeInOutQuad(this.shrinkProgress)
            );
            
            this.center.lerpVectors(
                this.startCenter,
                this.targetCenter,
                this.easeInOutQuad(this.shrinkProgress)
            );
            
            this.updateVisuals();
        }
        
        // Damage check
        const isOutside = this.isOutsideStorm(playerPosition);
        
        if (isOutside) {
            this.damageTimer += deltaTime;
            if (this.damageTimer >= this.damageInterval) {
                this.damageTimer = 0;
                return this.getCurrentDamage();
            }
        } else {
            this.damageTimer = 0;
        }
        
        return 0;
    }
    
    easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }
    
    startShrinking() {
        this.isShrinking = true;
        this.shrinkProgress = 0;
        this.startRadius = this.currentRadius;
        this.startCenter.copy(this.center);
        
        const phase = this.phases[this.currentPhase];
        this.targetRadius = phase.radius;
        
        // Random new center within current circle
        const angle = Math.random() * Math.PI * 2;
        const maxOffset = (this.currentRadius - phase.radius) * 0.5;
        const offset = Math.random() * maxOffset;
        
        this.targetCenter.set(
            this.center.x + Math.cos(angle) * offset,
            0,
            this.center.z + Math.sin(angle) * offset
        );
        
        // Show next zone indicator
        this.nextZoneRing.visible = true;
        this.nextZoneRing.position.x = this.targetCenter.x;
        this.nextZoneRing.position.z = this.targetCenter.z;
        this.nextZoneRing.geometry.dispose();
        this.nextZoneRing.geometry = new THREE.RingGeometry(
            phase.radius - 1,
            phase.radius + 1,
            64
        );
    }
    
    finishShrinking() {
        this.isShrinking = false;
        this.currentPhase++;
        this.nextZoneRing.visible = false;
        
        if (this.currentPhase < this.phases.length) {
            this.phaseTimer = this.phases[this.currentPhase].delay;
        }
    }
    
    updateVisuals() {
        // Update storm wall
        this.stormMesh.geometry.dispose();
        this.stormMesh.geometry = new THREE.CylinderGeometry(
            this.currentRadius,
            this.currentRadius,
            100,
            64,
            1,
            true
        );
        this.stormMesh.position.x = this.center.x;
        this.stormMesh.position.z = this.center.z;
        
        // Update safe zone ring
        this.safeZoneRing.geometry.dispose();
        this.safeZoneRing.geometry = new THREE.RingGeometry(
            this.currentRadius - 1,
            this.currentRadius + 1,
            64
        );
        this.safeZoneRing.position.x = this.center.x;
        this.safeZoneRing.position.z = this.center.z;
    }
    
    isOutsideStorm(position) {
        const dx = position.x - this.center.x;
        const dz = position.z - this.center.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        return distance > this.currentRadius;
    }
    
    getCurrentDamage() {
        if (this.currentPhase > 0) {
            return this.phases[this.currentPhase - 1].damage;
        }
        return this.phases[0].damage;
    }
    
    getTimeRemaining() {
        if (this.isShrinking) {
            const phase = this.phases[this.currentPhase];
            return Math.ceil(phase.shrinkTime * (1 - this.shrinkProgress));
        }
        return Math.ceil(this.phaseTimer);
    }
    
    getPhaseInfo() {
        return {
            phase: this.currentPhase + 1,
            totalPhases: this.phases.length,
            isShrinking: this.isShrinking,
            timeRemaining: this.getTimeRemaining(),
            radius: this.currentRadius,
            center: this.center.clone()
        };
    }
    
    getDistanceToSafety(position) {
        const dx = position.x - this.center.x;
        const dz = position.z - this.center.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        return Math.max(0, distance - this.currentRadius);
    }
    
    getSafeZoneDirection(position) {
        const dir = this.center.clone().sub(position);
        dir.y = 0;
        return dir.normalize();
    }
    
    dispose() {
        this.scene.remove(this.stormMesh);
        this.scene.remove(this.safeZoneRing);
        this.scene.remove(this.nextZoneRing);
        
        this.stormMesh.geometry.dispose();
        this.stormMesh.material.dispose();
        this.safeZoneRing.geometry.dispose();
        this.safeZoneRing.material.dispose();
        this.nextZoneRing.geometry.dispose();
        this.nextZoneRing.material.dispose();
    }
}
