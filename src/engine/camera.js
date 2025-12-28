import * as THREE from 'three';

export class ThirdPersonCamera {
    constructor() {
        this.camera = new THREE.PerspectiveCamera(
            70,
            window.innerWidth / window.innerHeight,
            0.1,
            2000
        );
        
        // Camera offset from player
        this.offset = new THREE.Vector3(1.5, 2.5, -5);
        this.aimOffset = new THREE.Vector3(1.0, 2.0, -2.5);
        this.currentOffset = this.offset.clone();
        
        // Mouse look
        this.yaw = 0;
        this.pitch = 0;
        this.sensitivity = 0.002;
        
        // Target to follow
        this.target = null;
        
        // For smooth camera
        this.lerpFactor = 0.15;
        
        // Raycaster for collision
        this.raycaster = new THREE.Raycaster();
        
        // Aiming state
        this.isAiming = false;
        
        window.addEventListener('resize', () => this.onResize());
    }
    
    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
    }
    
    setTarget(target) {
        this.target = target;
    }
    
    handleMouseMove(dx, dy) {
        this.yaw -= dx * this.sensitivity;
        this.pitch -= dy * this.sensitivity;
        
        // Clamp pitch
        this.pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.pitch));
    }
    
    setAiming(aiming) {
        this.isAiming = aiming;
    }
    
    update(scene, colliders = []) {
        if (!this.target) return;
        
        // Interpolate offset based on aiming
        const targetOffset = this.isAiming ? this.aimOffset : this.offset;
        this.currentOffset.lerp(targetOffset, 0.1);
        
        // Calculate desired camera position
        const targetPos = this.target.position.clone();
        targetPos.y += 1.5; // Head height
        
        // Rotate offset by yaw and pitch
        const rotatedOffset = this.currentOffset.clone();
        
        // Apply pitch rotation
        const pitchQuat = new THREE.Quaternion();
        pitchQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch);
        
        // Apply yaw rotation
        const yawQuat = new THREE.Quaternion();
        yawQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        
        rotatedOffset.applyQuaternion(pitchQuat);
        rotatedOffset.applyQuaternion(yawQuat);
        
        let desiredPos = targetPos.clone().add(rotatedOffset);
        
        // Camera collision check
        if (colliders.length > 0) {
            const direction = desiredPos.clone().sub(targetPos).normalize();
            const distance = targetPos.distanceTo(desiredPos);
            
            this.raycaster.set(targetPos, direction);
            const intersects = this.raycaster.intersectObjects(colliders, true);
            
            if (intersects.length > 0 && intersects[0].distance < distance) {
                desiredPos = targetPos.clone().add(direction.multiplyScalar(intersects[0].distance - 0.5));
            }
        }
        
        // Smooth camera movement
        this.camera.position.lerp(desiredPos, this.lerpFactor);
        
        // Look at target
        const lookTarget = targetPos.clone();
        lookTarget.y += 0.5;
        this.camera.lookAt(lookTarget);
    }
    
    getForwardDirection() {
        const direction = new THREE.Vector3(0, 0, 1);
        direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        return direction;
    }
    
    getRightDirection() {
        const direction = new THREE.Vector3(-1, 0, 0);
        direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        return direction;
    }
    
    getAimDirection() {
        const direction = new THREE.Vector3(0, 0, 1);
        direction.applyAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch);
        direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        return direction.normalize();
    }
    
    get threeCamera() {
        return this.camera;
    }
}
