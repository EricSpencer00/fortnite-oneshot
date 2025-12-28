export class InputManager {
    constructor() {
        this.keys = {};
        this.keysJustPressed = {};
        this.mouse = {
            x: 0,
            y: 0,
            dx: 0,
            dy: 0,
            buttons: {},
            buttonsJustPressed: {}
        };
        
        this.isPointerLocked = false;
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Keyboard
        window.addEventListener('keydown', (e) => {
            if (!this.keys[e.code]) {
                this.keysJustPressed[e.code] = true;
            }
            this.keys[e.code] = true;
        });
        
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });
        
        // Mouse movement
        window.addEventListener('mousemove', (e) => {
            if (this.isPointerLocked) {
                this.mouse.dx += e.movementX;
                this.mouse.dy += e.movementY;
            }
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });
        
        // Mouse buttons
        window.addEventListener('mousedown', (e) => {
            if (!this.mouse.buttons[e.button]) {
                this.mouse.buttonsJustPressed[e.button] = true;
            }
            this.mouse.buttons[e.button] = true;
        });
        
        window.addEventListener('mouseup', (e) => {
            this.mouse.buttons[e.button] = false;
        });
        
        // Pointer lock
        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = document.pointerLockElement !== null;
        });
    }
    
    requestPointerLock(element) {
        element.requestPointerLock();
    }
    
    isKeyDown(code) {
        return this.keys[code] === true;
    }
    
    isKeyJustPressed(code) {
        return this.keysJustPressed[code] === true;
    }
    
    isMouseButtonDown(button) {
        return this.mouse.buttons[button] === true;
    }
    
    isMouseButtonJustPressed(button) {
        return this.mouse.buttonsJustPressed[button] === true;
    }
    
    getMouseDelta() {
        return { x: this.mouse.dx, y: this.mouse.dy };
    }
    
    update() {
        // Reset deltas and just-pressed states
        this.mouse.dx = 0;
        this.mouse.dy = 0;
        this.keysJustPressed = {};
        this.mouse.buttonsJustPressed = {};
    }
    
    // Movement input helpers
    getMovementInput() {
        let x = 0;
        let z = 0;
        
        if (this.isKeyDown('KeyW') || this.isKeyDown('ArrowUp')) z += 1;
        if (this.isKeyDown('KeyS') || this.isKeyDown('ArrowDown')) z -= 1;
        if (this.isKeyDown('KeyA') || this.isKeyDown('ArrowLeft')) x -= 1;
        if (this.isKeyDown('KeyD') || this.isKeyDown('ArrowRight')) x += 1;
        
        return { x, z };
    }
    
    isSprinting() {
        return this.isKeyDown('ShiftLeft') || this.isKeyDown('ShiftRight');
    }
    
    isJumping() {
        return this.isKeyJustPressed('Space');
    }
    
    isReloading() {
        return this.isKeyJustPressed('KeyR');
    }
    
    isShooting() {
        return this.isMouseButtonDown(0); // Left mouse button
    }
    
    isAiming() {
        return this.isMouseButtonDown(2); // Right mouse button
    }
    
    isInteracting() {
        return this.isKeyJustPressed('KeyE');
    }
    
    getWeaponSwitch() {
        if (this.isKeyJustPressed('Digit1')) return 0;
        if (this.isKeyJustPressed('Digit2')) return 1;
        if (this.isKeyJustPressed('Digit3')) return 2;
        return -1;
    }
}

export const input = new InputManager();
