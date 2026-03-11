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
        
        // Cached temp objects to avoid per-frame heap allocations in update()
        this._tempTargetPos = new THREE.Vector3();
        this._tempRotatedOffset = new THREE.Vector3();
        this._pitchQuat = new THREE.Quaternion();
        this._yawQuat = new THREE.Quaternion();
        this._pitchAxis = new THREE.Vector3(1, 0, 0);
        this._yawAxis = new THREE.Vector3(0, 1, 0);
        this._desiredPos = new THREE.Vector3();
        this._camDir = new THREE.Vector3();
        this._lookTarget = new THREE.Vector3();
        
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
        this.pitch += dy * this.sensitivity; // Fixed: was inverted
        
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
        
        // Calculate desired camera position (reuse cached vectors, no heap allocs)
        this._tempTargetPos.copy(this.target.position);
        this._tempTargetPos.y += 1.5; // Head height
        
        // Rotate offset by yaw and pitch
        this._tempRotatedOffset.copy(this.currentOffset);
        
        // Apply pitch then yaw rotation
        this._pitchQuat.setFromAxisAngle(this._pitchAxis, this.pitch);
        this._yawQuat.setFromAxisAngle(this._yawAxis, this.yaw);
        
        this._tempRotatedOffset.applyQuaternion(this._pitchQuat);
        this._tempRotatedOffset.applyQuaternion(this._yawQuat);
        
        this._desiredPos.copy(this._tempTargetPos).add(this._tempRotatedOffset);
        
        // Camera collision check
        if (colliders.length > 0) {
            this._camDir.copy(this._desiredPos).sub(this._tempTargetPos).normalize();
            const distance = this._tempTargetPos.distanceTo(this._desiredPos);
            
            this.raycaster.set(this._tempTargetPos, this._camDir);
            const intersects = this.raycaster.intersectObjects(colliders, true);
            
            if (intersects.length > 0 && intersects[0].distance < distance) {
                this._desiredPos.copy(this._tempTargetPos).add(
                    this._camDir.multiplyScalar(intersects[0].distance - 0.5)
                );
            }
        }
        
        // Smooth camera movement
        this.camera.position.lerp(this._desiredPos, this.lerpFactor);
        
        // Look at target
        this._lookTarget.copy(this._tempTargetPos);
        this._lookTarget.y += 0.5;
        this.camera.lookAt(this._lookTarget);
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
    
    getLookDirection() {
        return this.getAimDirection();
    }
    
    updateTarget(position) {
        if (!this.target) {
            this.target = { position: position.clone() };
        } else {
            this.target.position.copy(position);
        }
    }
    
    get threeCamera() {
        return this.camera;
    }
}
