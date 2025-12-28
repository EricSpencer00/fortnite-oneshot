import * as THREE from 'three';

export class GameScene {
    constructor() {
        this.scene = new THREE.Scene();
        
        // Sky color gradient
        this.scene.background = new THREE.Color(0x87CEEB);
        
        // Lighter fog for better visibility
        this.scene.fog = new THREE.FogExp2(0x88BBEE, 0.0015);
        
        this.setupLighting();
    }
    
    setupLighting() {
        // Hemisphere light for ambient
        const hemiLight = new THREE.HemisphereLight(0x88BBFF, 0x445522, 0.6);
        hemiLight.position.set(0, 100, 0);
        this.scene.add(hemiLight);
        
        // Main directional light (sun)
        const sunLight = new THREE.DirectionalLight(0xFFFFDD, 1.2);
        sunLight.position.set(100, 150, 50);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.width = 1024; // Reduced for performance
        sunLight.shadow.mapSize.height = 1024;
        sunLight.shadow.camera.near = 10;
        sunLight.shadow.camera.far = 300; // Reduced shadow distance
        sunLight.shadow.camera.left = -100;
        sunLight.shadow.camera.right = 100;
        sunLight.shadow.camera.top = 100;
        sunLight.shadow.camera.bottom = -100;
        sunLight.shadow.bias = -0.001;
        this.scene.add(sunLight);
        
        // Fill light
        const fillLight = new THREE.DirectionalLight(0x8888FF, 0.3);
        fillLight.position.set(-50, 50, -50);
        this.scene.add(fillLight);
    }
    
    add(object) {
        this.scene.add(object);
    }
    
    remove(object) {
        this.scene.remove(object);
    }
    
    get threeScene() {
        return this.scene;
    }
}
