export class Crosshair {
    constructor() {
        this.element = document.getElementById('crosshair');
        this.lines = {
            top: this.element.querySelector('.top'),
            bottom: this.element.querySelector('.bottom'),
            left: this.element.querySelector('.left'),
            right: this.element.querySelector('.right'),
            dot: this.element.querySelector('.crosshair-dot')
        };
        
        this.baseSpread = 20;
        this.currentSpread = 20;
        this.targetSpread = 20;
    }
    
    setSpread(spread) {
        this.targetSpread = this.baseSpread + spread * 50;
    }
    
    update(deltaTime, isMoving, isSprinting, isShooting, isAiming) {
        // Calculate target spread based on state
        let targetSpread = this.baseSpread;
        
        if (isShooting) {
            targetSpread += 15;
        }
        if (isSprinting) {
            targetSpread += 10;
        } else if (isMoving) {
            targetSpread += 5;
        }
        if (isAiming) {
            targetSpread -= 10;
        }
        
        targetSpread = Math.max(5, targetSpread);
        
        // Smooth interpolation
        this.currentSpread += (targetSpread - this.currentSpread) * Math.min(1, deltaTime * 10);
        
        // Apply to lines
        this.lines.top.style.top = `${-this.currentSpread}px`;
        this.lines.bottom.style.top = `${this.currentSpread - 4}px`;
        this.lines.left.style.left = `${-this.currentSpread}px`;
        this.lines.right.style.left = `${this.currentSpread - 4}px`;
        
        // Opacity based on aiming
        const opacity = isAiming ? 0.5 : 1;
        Object.values(this.lines).forEach(line => {
            line.style.opacity = opacity;
        });
    }
    
    show() {
        this.element.style.display = 'block';
    }
    
    hide() {
        this.element.style.display = 'none';
    }
    
    setColor(color) {
        Object.values(this.lines).forEach(line => {
            line.style.background = color;
        });
    }
    
    flash() {
        this.setColor('#ff0000');
        setTimeout(() => this.setColor('white'), 100);
    }
}
