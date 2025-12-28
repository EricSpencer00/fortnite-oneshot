import * as THREE from 'three';

export class ProjectileManager {
    constructor(scene) {
        this.scene = scene;
        this.tracers = [];
        this.impacts = [];
    }
    
    createTracer(origin, end, color = 0xFFFF00) {
        const points = [origin.clone(), end.clone()];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.8
        });
        
        const tracer = new THREE.Line(geometry, material);
        this.scene.add(tracer);
        
        this.tracers.push({
            mesh: tracer,
            lifetime: 0.1,
            maxLifetime: 0.1
        });
    }
    
    createImpact(position, isHit = false) {
        const geometry = new THREE.SphereGeometry(0.2, 8, 8);
        const material = new THREE.MeshBasicMaterial({
            color: isHit ? 0xFF0000 : 0xFFFFFF,
            transparent: true,
            opacity: 0.8
        });
        
        const impact = new THREE.Mesh(geometry, material);
        impact.position.copy(position);
        this.scene.add(impact);
        
        this.impacts.push({
            mesh: impact,
            lifetime: 0.3,
            maxLifetime: 0.3
        });
    }
    
    update(deltaTime) {
        // Update tracers
        for (let i = this.tracers.length - 1; i >= 0; i--) {
            const tracer = this.tracers[i];
            tracer.lifetime -= deltaTime;
            tracer.mesh.material.opacity = tracer.lifetime / tracer.maxLifetime;
            
            if (tracer.lifetime <= 0) {
                this.scene.remove(tracer.mesh);
                tracer.mesh.geometry.dispose();
                tracer.mesh.material.dispose();
                this.tracers.splice(i, 1);
            }
        }
        
        // Update impacts
        for (let i = this.impacts.length - 1; i >= 0; i--) {
            const impact = this.impacts[i];
            impact.lifetime -= deltaTime;
            impact.mesh.material.opacity = impact.lifetime / impact.maxLifetime;
            impact.mesh.scale.multiplyScalar(1.05);
            
            if (impact.lifetime <= 0) {
                this.scene.remove(impact.mesh);
                impact.mesh.geometry.dispose();
                impact.mesh.material.dispose();
                this.impacts.splice(i, 1);
            }
        }
    }
    
    dispose() {
        for (const tracer of this.tracers) {
            this.scene.remove(tracer.mesh);
            tracer.mesh.geometry.dispose();
            tracer.mesh.material.dispose();
        }
        
        for (const impact of this.impacts) {
            this.scene.remove(impact.mesh);
            impact.mesh.geometry.dispose();
            impact.mesh.material.dispose();
        }
        
        this.tracers = [];
        this.impacts = [];
    }
}
