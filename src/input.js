// Keyboard + mouse capture with per-frame edge detection.

class Input {
    constructor() {
        this.keys = {};
        this.justPressed = {};
        this.buttons = {};
        this.buttonsJust = {};
        this.dx = 0;
        this.dy = 0;
        this.wheel = 0;
        this.pointerLocked = false;

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Tab' || e.code === 'F1' || e.code === 'F2' || e.code === 'F3' || e.code === 'F4') e.preventDefault();
            if (!this.keys[e.code]) this.justPressed[e.code] = true;
            this.keys[e.code] = true;
        });
        window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
        window.addEventListener('mousemove', (e) => {
            if (this.pointerLocked) {
                this.dx += e.movementX;
                this.dy += e.movementY;
            }
        });
        window.addEventListener('mousedown', (e) => {
            if (!this.buttons[e.button]) this.buttonsJust[e.button] = true;
            this.buttons[e.button] = true;
        });
        window.addEventListener('mouseup', (e) => { this.buttons[e.button] = false; });
        window.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); });
        window.addEventListener('contextmenu', (e) => e.preventDefault());
        document.addEventListener('pointerlockchange', () => {
            this.pointerLocked = document.pointerLockElement !== null;
        });
    }

    lock(el) {
        if (!this.pointerLocked) el.requestPointerLock();
    }

    // Called at the END of each frame.
    endFrame() {
        this.dx = 0;
        this.dy = 0;
        this.wheel = 0;
        this.justPressed = {};
        this.buttonsJust = {};
    }

    down(code) { return this.keys[code] === true; }
    pressed(code) { return this.justPressed[code] === true; }

    move() {
        let x = 0, z = 0;
        if (this.down('KeyW') || this.down('ArrowUp')) z += 1;
        if (this.down('KeyS') || this.down('ArrowDown')) z -= 1;
        if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
        if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
        return { x, z };
    }

    sprint() { return this.down('ShiftLeft') || this.down('ShiftRight'); }
    jump() { return this.pressed('Space'); }
    crouch() { return this.down('ControlLeft') || this.down('KeyC'); }
    firing() { return this.buttons[0] === true; }
    fireJust() { return this.buttonsJust[0] === true; }
    aiming() { return this.buttons[2] === true; }
    reload() { return this.pressed('KeyR'); }
    interact() { return this.pressed('KeyE'); }
    toggleBuild() { return this.pressed('KeyQ'); }
    rotateBuild() { return this.pressed('KeyR'); }
    map() { return this.pressed('KeyM'); }

    slot() {
        for (let i = 1; i <= 5; i++) {
            if (this.pressed('Digit' + i)) return i - 1;
        }
        return -1;
    }

    buildPiece() {
        if (this.pressed('Digit1') || this.pressed('KeyZ')) return 0; // wall
        if (this.pressed('Digit2') || this.pressed('KeyX')) return 1; // floor
        if (this.pressed('Digit3') || this.pressed('KeyC')) return 2; // ramp
        if (this.pressed('Digit4') || this.pressed('KeyV')) return 3; // roof
        return -1;
    }
}

export const input = new Input();
