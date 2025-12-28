import * as THREE from 'three';

// Procedurally generated textures (Minecraft-style pixelated)
class TextureGenerator {
    constructor() {
        this.textureSize = 64;
    }
    
    createCanvas() {
        const canvas = document.createElement('canvas');
        canvas.width = this.textureSize;
        canvas.height = this.textureSize;
        return canvas;
    }
    
    // Create grass texture
    createGrassTexture() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');
        const size = this.textureSize;
        const pixelSize = 4;
        
        // Base green
        ctx.fillStyle = '#4CAF50';
        ctx.fillRect(0, 0, size, size);
        
        // Random grass variation
        for (let x = 0; x < size; x += pixelSize) {
            for (let y = 0; y < size; y += pixelSize) {
                const variation = Math.random();
                if (variation < 0.3) {
                    ctx.fillStyle = '#388E3C';
                } else if (variation < 0.5) {
                    ctx.fillStyle = '#66BB6A';
                } else if (variation < 0.6) {
                    ctx.fillStyle = '#81C784';
                } else {
                    continue;
                }
                ctx.fillRect(x, y, pixelSize, pixelSize);
            }
        }
        
        // Some dirt spots
        for (let i = 0; i < 5; i++) {
            const x = Math.floor(Math.random() * (size / pixelSize)) * pixelSize;
            const y = Math.floor(Math.random() * (size / pixelSize)) * pixelSize;
            ctx.fillStyle = '#5D4037';
            ctx.fillRect(x, y, pixelSize, pixelSize);
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(50, 50);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    }
    
    // Create dirt texture
    createDirtTexture() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');
        const size = this.textureSize;
        const pixelSize = 4;
        
        // Base brown
        ctx.fillStyle = '#5D4037';
        ctx.fillRect(0, 0, size, size);
        
        // Random variation
        for (let x = 0; x < size; x += pixelSize) {
            for (let y = 0; y < size; y += pixelSize) {
                const variation = Math.random();
                if (variation < 0.2) {
                    ctx.fillStyle = '#4E342E';
                } else if (variation < 0.4) {
                    ctx.fillStyle = '#6D4C41';
                } else if (variation < 0.5) {
                    ctx.fillStyle = '#795548';
                } else {
                    continue;
                }
                ctx.fillRect(x, y, pixelSize, pixelSize);
            }
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.NearestFilter;
        return texture;
    }
    
    // Create stone texture
    createStoneTexture() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');
        const size = this.textureSize;
        const pixelSize = 4;
        
        // Base gray
        ctx.fillStyle = '#757575';
        ctx.fillRect(0, 0, size, size);
        
        // Random stone pattern
        for (let x = 0; x < size; x += pixelSize) {
            for (let y = 0; y < size; y += pixelSize) {
                const variation = Math.random();
                if (variation < 0.15) {
                    ctx.fillStyle = '#616161';
                } else if (variation < 0.3) {
                    ctx.fillStyle = '#9E9E9E';
                } else if (variation < 0.4) {
                    ctx.fillStyle = '#BDBDBD';
                } else if (variation < 0.45) {
                    ctx.fillStyle = '#424242';
                } else {
                    continue;
                }
                ctx.fillRect(x, y, pixelSize, pixelSize);
            }
        }
        
        // Cracks
        ctx.strokeStyle = '#424242';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(Math.random() * size, Math.random() * size);
            ctx.lineTo(Math.random() * size, Math.random() * size);
            ctx.stroke();
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.NearestFilter;
        return texture;
    }
    
    // Create wood plank texture
    createWoodTexture() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');
        const size = this.textureSize;
        const pixelSize = 4;
        
        // Base wood color
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(0, 0, size, size);
        
        // Wood grain lines
        ctx.strokeStyle = '#6D3610';
        ctx.lineWidth = 2;
        for (let y = 0; y < size; y += 12) {
            ctx.beginPath();
            ctx.moveTo(0, y + Math.random() * 4);
            for (let x = 0; x < size; x += 8) {
                ctx.lineTo(x, y + Math.random() * 4);
            }
            ctx.stroke();
        }
        
        // Knots
        ctx.fillStyle = '#5D3A1A';
        for (let i = 0; i < 2; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Random darker spots
        for (let x = 0; x < size; x += pixelSize) {
            for (let y = 0; y < size; y += pixelSize) {
                if (Math.random() < 0.2) {
                    ctx.fillStyle = Math.random() < 0.5 ? '#7B3F0D' : '#A0522D';
                    ctx.fillRect(x, y, pixelSize, pixelSize);
                }
            }
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.NearestFilter;
        return texture;
    }
    
    // Create brick texture
    createBrickTexture() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');
        const size = this.textureSize;
        
        // Mortar color
        ctx.fillStyle = '#9E9E9E';
        ctx.fillRect(0, 0, size, size);
        
        // Brick dimensions
        const brickWidth = 16;
        const brickHeight = 8;
        const mortarWidth = 2;
        
        // Draw bricks
        for (let row = 0; row < size / brickHeight; row++) {
            const offset = (row % 2) * (brickWidth / 2);
            for (let col = -1; col < size / brickWidth + 1; col++) {
                const x = col * brickWidth + offset;
                const y = row * brickHeight;
                
                // Brick color with variation
                const colorVariation = Math.random() * 30 - 15;
                const r = Math.min(255, Math.max(0, 180 + colorVariation));
                const g = Math.min(255, Math.max(0, 80 + colorVariation));
                const b = Math.min(255, Math.max(0, 60 + colorVariation));
                
                ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                ctx.fillRect(
                    x + mortarWidth / 2,
                    y + mortarWidth / 2,
                    brickWidth - mortarWidth,
                    brickHeight - mortarWidth
                );
            }
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.NearestFilter;
        return texture;
    }
    
    // Create metal texture
    createMetalTexture() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');
        const size = this.textureSize;
        const pixelSize = 2;
        
        // Base metal color
        ctx.fillStyle = '#546E7A';
        ctx.fillRect(0, 0, size, size);
        
        // Metal pattern
        for (let x = 0; x < size; x += pixelSize) {
            for (let y = 0; y < size; y += pixelSize) {
                const variation = Math.random();
                if (variation < 0.2) {
                    ctx.fillStyle = '#455A64';
                } else if (variation < 0.35) {
                    ctx.fillStyle = '#607D8B';
                } else if (variation < 0.45) {
                    ctx.fillStyle = '#78909C';
                } else if (variation < 0.5) {
                    ctx.fillStyle = '#37474F';
                } else {
                    continue;
                }
                ctx.fillRect(x, y, pixelSize, pixelSize);
            }
        }
        
        // Rivets
        ctx.fillStyle = '#263238';
        const rivetSpacing = 16;
        for (let x = rivetSpacing / 2; x < size; x += rivetSpacing) {
            for (let y = rivetSpacing / 2; y < size; y += rivetSpacing) {
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        // Highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(0, 0, size, size / 3);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.NearestFilter;
        return texture;
    }
    
    // Create tree bark texture
    createBarkTexture() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');
        const size = this.textureSize;
        const pixelSize = 4;
        
        // Base bark color
        ctx.fillStyle = '#4E342E';
        ctx.fillRect(0, 0, size, size);
        
        // Bark pattern
        for (let y = 0; y < size; y += pixelSize * 2) {
            ctx.fillStyle = Math.random() < 0.5 ? '#3E2723' : '#5D4037';
            ctx.fillRect(0, y, size, pixelSize);
        }
        
        // Vertical lines
        ctx.strokeStyle = '#3E2723';
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
            const x = Math.random() * size;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + (Math.random() - 0.5) * 10, size);
            ctx.stroke();
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.NearestFilter;
        return texture;
    }
    
    // Create leaves texture
    createLeavesTexture() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');
        const size = this.textureSize;
        const pixelSize = 4;
        
        // Base green
        ctx.fillStyle = '#2E7D32';
        ctx.fillRect(0, 0, size, size);
        
        // Leaf pattern
        for (let x = 0; x < size; x += pixelSize) {
            for (let y = 0; y < size; y += pixelSize) {
                const variation = Math.random();
                if (variation < 0.25) {
                    ctx.fillStyle = '#1B5E20';
                } else if (variation < 0.45) {
                    ctx.fillStyle = '#388E3C';
                } else if (variation < 0.55) {
                    ctx.fillStyle = '#43A047';
                } else if (variation < 0.6) {
                    ctx.fillStyle = '#1B5E20';
                } else {
                    continue;
                }
                ctx.fillRect(x, y, pixelSize, pixelSize);
            }
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.NearestFilter;
        return texture;
    }
    
    // Create water texture
    createWaterTexture() {
        const canvas = this.createCanvas();
        const ctx = canvas.getContext('2d');
        const size = this.textureSize;
        const pixelSize = 4;
        
        // Base water color
        ctx.fillStyle = '#1565C0';
        ctx.fillRect(0, 0, size, size);
        
        // Wave pattern
        for (let x = 0; x < size; x += pixelSize) {
            for (let y = 0; y < size; y += pixelSize) {
                const wave = Math.sin(x * 0.2 + y * 0.1) * 0.5 + 0.5;
                if (wave > 0.6) {
                    ctx.fillStyle = '#1976D2';
                } else if (wave > 0.4) {
                    ctx.fillStyle = '#1E88E5';
                } else if (Math.random() < 0.1) {
                    ctx.fillStyle = '#42A5F5';
                } else {
                    continue;
                }
                ctx.fillRect(x, y, pixelSize, pixelSize);
            }
        }
        
        // Highlights
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        for (let i = 0; i < 10; i++) {
            const x = Math.random() * size;
            const y = Math.random() * size;
            ctx.fillRect(x, y, pixelSize * 2, pixelSize);
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(20, 20);
        texture.magFilter = THREE.NearestFilter;
        return texture;
    }
    
    // Create sky texture for skybox
    createSkyGradient() {
        const canvas = document.createElement('canvas');
        canvas.width = 2;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        
        const gradient = ctx.createLinearGradient(0, 0, 0, 256);
        gradient.addColorStop(0, '#1a237e');    // Dark blue at top
        gradient.addColorStop(0.3, '#3949ab');  // Medium blue
        gradient.addColorStop(0.5, '#5c6bc0');  // Light blue
        gradient.addColorStop(0.7, '#7986cb');  // Lighter
        gradient.addColorStop(0.85, '#9fa8da'); // Very light
        gradient.addColorStop(1, '#c5cae9');    // Horizon
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 2, 256);
        
        return new THREE.CanvasTexture(canvas);
    }
}

// Global texture manager
export class TextureManager {
    constructor() {
        this.generator = new TextureGenerator();
        this.textures = {};
        this.materials = {};
        
        this.loadTextures();
    }
    
    loadTextures() {
        // Generate all textures
        this.textures.grass = this.generator.createGrassTexture();
        this.textures.dirt = this.generator.createDirtTexture();
        this.textures.stone = this.generator.createStoneTexture();
        this.textures.wood = this.generator.createWoodTexture();
        this.textures.brick = this.generator.createBrickTexture();
        this.textures.metal = this.generator.createMetalTexture();
        this.textures.bark = this.generator.createBarkTexture();
        this.textures.leaves = this.generator.createLeavesTexture();
        this.textures.water = this.generator.createWaterTexture();
        this.textures.sky = this.generator.createSkyGradient();
        
        // Create materials
        this.materials.grass = new THREE.MeshStandardMaterial({
            map: this.textures.grass,
            roughness: 0.9,
            metalness: 0
        });
        
        this.materials.stone = new THREE.MeshStandardMaterial({
            map: this.textures.stone,
            roughness: 0.9,
            metalness: 0.1
        });
        
        this.materials.wood = new THREE.MeshStandardMaterial({
            map: this.textures.wood,
            roughness: 0.85,
            metalness: 0
        });
        
        this.materials.brick = new THREE.MeshStandardMaterial({
            map: this.textures.brick,
            roughness: 0.9,
            metalness: 0
        });
        
        this.materials.metal = new THREE.MeshStandardMaterial({
            map: this.textures.metal,
            roughness: 0.5,
            metalness: 0.7
        });
        
        this.materials.bark = new THREE.MeshStandardMaterial({
            map: this.textures.bark,
            roughness: 1.0,
            metalness: 0
        });
        
        this.materials.leaves = new THREE.MeshStandardMaterial({
            map: this.textures.leaves,
            roughness: 0.8,
            metalness: 0,
            side: THREE.DoubleSide
        });
        
        this.materials.water = new THREE.MeshStandardMaterial({
            map: this.textures.water,
            roughness: 0.2,
            metalness: 0.1,
            transparent: true,
            opacity: 0.85
        });
    }
    
    getTexture(name) {
        return this.textures[name];
    }
    
    getMaterial(name) {
        return this.materials[name]?.clone() || null;
    }
    
    dispose() {
        Object.values(this.textures).forEach(tex => tex.dispose());
        Object.values(this.materials).forEach(mat => mat.dispose());
    }
}

// Singleton instance
export const textureManager = new TextureManager();
