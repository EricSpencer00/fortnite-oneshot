export class GameLoop {
    constructor() {
        this.lastTime = 0;
        this.running = false;
        this.callbacks = [];
        this.frameId = null;
    }
    
    addCallback(callback) {
        this.callbacks.push(callback);
    }
    
    removeCallback(callback) {
        const index = this.callbacks.indexOf(callback);
        if (index > -1) {
            this.callbacks.splice(index, 1);
        }
    }
    
    start() {
        if (this.running) return;
        this.running = true;
        this.lastTime = performance.now();
        this.loop();
    }
    
    stop() {
        this.running = false;
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
    }
    
    loop() {
        if (!this.running) return;
        
        const currentTime = performance.now();
        const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1); // Cap at 100ms
        this.lastTime = currentTime;
        
        for (const callback of this.callbacks) {
            callback(deltaTime, currentTime);
        }
        
        this.frameId = requestAnimationFrame(() => this.loop());
    }
}
