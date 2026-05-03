import * as THREE from 'three';

/**
 * FlightController: Handles Newtonian-lite physics and input for the player ship.
 */
export default class FlightController {
    constructor(ship, camera, options = {}) {
        this.ship = ship;
        this.camera = camera;

        // Configuration
        this.thrustForce = options.thrustForce || 60.0;
        this.turnSpeed = options.turnSpeed || 2.5;
        this.drag = options.drag || 0.985;
        this.angularDrag = options.angularDrag || 0.90;

        // State
        this.velocity = new THREE.Vector3();
        this.rotationVelocity = new THREE.Vector3(); // x: pitch, y: yaw, z: roll
        this.thrustInput = 0; // Current normalized thrust [0, 1]

        // Input tracking
        this.keys = {};
        window.addEventListener('keydown', (e) => this.keys[e.code] = true);
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        // Camera follow parameters
        this.cameraOffset = new THREE.Vector3(0, 4, 12);
        this.cameraLookOffset = new THREE.Vector3(0, 1, -20);
        this.currentCameraPos = new THREE.Vector3().copy(camera.position);

        // Effects
        this.warpTime = 0;
        this.warpDuration = 2.0;
        this.baseFov = camera.fov;

        // Pre-allocated scratch vectors to avoid per-frame GC
        this._thrustScratch = new THREE.Vector3();
        this._rotScratch = new THREE.Vector3();
        this._quatScratch = new THREE.Quaternion();
        this._eulerScratch = new THREE.Euler();
        
        // Persistent engine state (Throttle)
        this.throttle = new THREE.Vector3(); // x: horizontal, y: vertical, z: forward

        // Power System
        this.maxCharge = 100;
        this.charge = 100;
        this.chargeRegen = 8.0; // Faster recovery
        this.hyperThrustCost = 10.0; // Much slower depletion
        this.isHyperThrusting = false;
    }

    update(delta, state = {}) {
        if (delta > 0.1) delta = 0.1; 

        // 0. Energy Regeneration
        this.charge = Math.min(this.maxCharge, this.charge + this.chargeRegen * delta);

        // 1. Gather Input & Update Throttle
        const rampSpeed = 2.0; 
        
        // Forward/Back Throttle
        const throttleSpeed = 0.5;
        if (this.keys['Equal']) this.throttle.z -= throttleSpeed * delta;
        if (this.keys['Minus']) this.throttle.z += throttleSpeed * delta;
        this.throttle.z = THREE.MathUtils.clamp(this.throttle.z, -1.0, 1.0);

        // Vertical/Lateral Throttle
        let targetY = 0;
        if (this.keys['ArrowUp']) targetY += 1;
        if (this.keys['ArrowDown']) targetY -= 1;
        this.throttle.y = THREE.MathUtils.lerp(this.throttle.y, targetY, delta * rampSpeed);

        let targetX = 0;
        if (this.keys['ArrowLeft']) targetX -= 1;
        if (this.keys['ArrowRight']) targetX += 1;
        this.throttle.x = THREE.MathUtils.lerp(this.throttle.x, targetX, delta * rampSpeed);


        // Hyperthrust (Spacebar)
        let manualHyper = this.keys['Space'] && this.charge > 5;
        this.isHyperThrusting = manualHyper;

        // --- Autopilot Logic ---
        this._rotScratch.set(0, 0, 0);
        if (this.autopilot && this.autopilotTarget) {
            const toTarget = this.autopilotTarget.clone().sub(this.ship.position);
            const dist = toTarget.length();
            const dir = toTarget.normalize();

            // 1. Orient to target (Slerp) - Match player's turn speed feel
            const targetQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
            this.ship.quaternion.slerp(targetQuat, delta * 1.2); 

            // 2. Automated Thrust - Neutralize lateral/vertical
            this.throttle.x = THREE.MathUtils.lerp(this.throttle.x, 0, delta * 2);
            this.throttle.y = THREE.MathUtils.lerp(this.throttle.y, 0, delta * 2);

            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.ship.quaternion);
            const alignment = forward.dot(dir);
            if (alignment > 0.8) {
                this.throttle.z = -1.0;
                // Hyperthrust check
                if (dist > 500 && this.charge > 10) {
                    this.isHyperThrusting = true;
                }
            } else {
                this.throttle.z = -0.3;
                this.isHyperThrusting = false;
            }

            // Manual Override (Break Autopilot)
            if (this.keys['KeyW'] || this.keys['KeyS'] || this.keys['KeyA'] || this.keys['KeyD'] || this.keys['KeyQ'] || this.keys['KeyE']) {
                this.autopilot = false;
            }
        } else {
            // Manual Rotation Input
            if (this.keys['KeyS']) this._rotScratch.x += 1; 
            if (this.keys['KeyW']) this._rotScratch.x -= 1; 
            if (this.keys['KeyA']) this._rotScratch.y += 1; 
            if (this.keys['KeyD']) this._rotScratch.y -= 1; 
            if (this.keys['KeyQ']) this._rotScratch.z += 1; 
            if (this.keys['KeyE']) this._rotScratch.z -= 1; 
        }

        if (this.isHyperThrusting) {
            this.charge -= this.hyperThrustCost * delta;
        }

        // 2. Finalize Input & Apply Forces
        this.thrustInput = Math.min(this.throttle.length(), 1.0);
        
        if (this.throttle.lengthSq() > 0.001) {
            const multiplier = this.isHyperThrusting ? 10.0 : 1.0;
            this._thrustScratch.copy(this.throttle).normalize();
            this._thrustScratch.applyQuaternion(this.ship.quaternion);
            this.velocity.addScaledVector(this._thrustScratch, this.thrustForce * delta * this.throttle.length() * multiplier);
        }

        // 3. Apply Torque (Manual + Atmospheric Drag)
        this.rotationVelocity.x += this._rotScratch.x * this.turnSpeed * delta;
        this.rotationVelocity.y += this._rotScratch.y * this.turnSpeed * delta;
        this.rotationVelocity.z += this._rotScratch.z * this.turnSpeed * delta;

        // Atmospheric Alignment Torque
        if (state.nearestPlanetDist < state.atmosphereThreshold && state.nearestPlanetDir) {
            const targetNormal = state.nearestPlanetDir.clone().negate().normalize();
            const shipUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.ship.quaternion);
            
            // Create a torque to align ship UP with planet normal
            const alignmentTorque = new THREE.Vector3().crossVectors(shipUp, targetNormal);
            const intensity = 1.0 - (state.nearestPlanetDist / state.atmosphereThreshold);
            this.rotationVelocity.addScaledVector(alignmentTorque, delta * 2.5 * intensity);
        }

        // 4. Update Position & Orientation
        this.ship.position.addScaledVector(this.velocity, delta);
        this._eulerScratch.set(
            this.rotationVelocity.x * delta,
            this.rotationVelocity.y * delta,
            this.rotationVelocity.z * delta
        );
        this._quatScratch.setFromEuler(this._eulerScratch);
        this.ship.quaternion.multiply(this._quatScratch);

        // 5. Apply Drag
        const dragFactor = Math.pow(this.drag, delta * 60);
        const angularDragFactor = Math.pow(this.angularDrag, delta * 60);
        this.velocity.multiplyScalar(dragFactor);
        this.rotationVelocity.multiplyScalar(angularDragFactor);

        // 6. Camera Follow
        this._thrustScratch.copy(this.cameraOffset).applyQuaternion(this.ship.quaternion);
        this._rotScratch.copy(this.ship.position).add(this._thrustScratch);
        this.camera.position.lerp(this._rotScratch, 0.1);

        this._thrustScratch.copy(this.cameraLookOffset).applyQuaternion(this.ship.quaternion).add(this.ship.position);
        this._rotScratch.set(0, 1, 0).applyQuaternion(this.ship.quaternion);
        this.camera.up.copy(this._rotScratch);
        this.camera.lookAt(this._thrustScratch);

        // 7. Effects
        const speedVal = this.velocity.length();
        const speedFovOffset = Math.min(speedVal * 0.01, 10); // More subtle stretch
        const targetFov = this.baseFov + speedFovOffset + (this.isHyperThrusting ? 5 : 0);

        if (this.warpTime > 0) {
            this.warpTime -= delta;
            const progress = this.warpTime / this.warpDuration;
            const effect = Math.sin(progress * Math.PI);
            this.camera.fov = this.baseFov + effect * 30;
            this.camera.updateProjectionMatrix();

            const shake = effect * 0.15;
            this.camera.position.x += (Math.random() - 0.5) * shake;
            this.camera.position.y += (Math.random() - 0.5) * shake;
            this.camera.position.z += (Math.random() - 0.5) * shake;
        } else {
            if (Math.abs(this.camera.fov - targetFov) > 0.1) {
                this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, delta * 3.0);
                this.camera.updateProjectionMatrix();
            }
        }
    }

    triggerWarp(duration = 2.0) {
        this.warpTime = duration;
        this.warpDuration = duration;
    }

    /**
     * Helper to get current speed for HUD
     */
    get speed() {
        return this.velocity.length();
    }
}
