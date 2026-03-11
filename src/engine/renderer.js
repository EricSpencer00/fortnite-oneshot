import * as THREE from 'three';

export class Renderer {
    constructor(container) {
        this.renderer = new THREE.WebGLRenderer({
            antialias: false, // Disable for performance
            powerPreference: 'high-performance'
        });
        
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Cap at 1.5 for performance
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.BasicShadowMap; // Faster shadows
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        
        container.appendChild(this.renderer.domElement);
        
        // Render distance settings
        this.renderDistance = 150; // Objects beyond this are hidden
        this.lodDistances = { high: 30, medium: 80, low: 150 };
        this.frustum = new THREE.Frustum();
        this.projScreenMatrix = new THREE.Matrix4();
        
        // Throttle culling: scene.traverse is O(scene_size) - skip most frames
        this._cullFrame = 0;
        this._cullInterval = 3; // Re-cull every 3 rendered frames
        
        window.addEventListener('resize', () => this.onResize());
    }
    
    onResize() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    render(scene, camera) {
        // Update frustum culling every N frames instead of every frame
        this._cullFrame++;
        if (this._cullFrame >= this._cullInterval) {
            this._cullFrame = 0;
            
            // Update frustum for culling
            this.projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
            this.frustum.setFromProjectionMatrix(this.projScreenMatrix);
            
            const cameraPos = camera.position;
            
            // Apply distance-based visibility culling
            scene.traverse((object) => {
                if (object.isMesh && object.userData.cullable !== false) {
                    const distance = cameraPos.distanceTo(object.position);
                    
                    // Hide objects beyond render distance
                    if (distance > this.renderDistance) {
                        object.visible = false;
                    } else {
                        object.visible = true;
                        
                        // Disable shadows for distant objects
                        object.castShadow = distance < 60;
                    }
                }
            });
        }
        
        this.renderer.render(scene, camera);
    }
    
    get domElement() {
        return this.renderer.domElement;
    }
}
