import * as THREE from 'three';

/**
 * WarpPoint: A gateway to another sector.
 * Features a procedural shader-based visual effect.
 */
export default class WarpPoint {
    constructor(scene, position, originSeed, targetSeed, label, targetLatticePos) {
        this.position = position.clone();
        this.targetSeed = targetSeed;
        this.targetLatticePos = targetLatticePos;
        this.label = label;
        this.mesh = null;
        
        const colorA = this._seedToColor(originSeed);
        const colorB = this._seedToColor(targetSeed);
        const mixedColor = colorA.lerp(colorB, 0.5);

        const material = new THREE.ShaderMaterial({
            transparent: true,
            uniforms: { 
                uTime: { value: 0 }, 
                uColor: { value: mixedColor },
                uIsCourseTarget: { value: 0.0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform vec3 uColor;
                uniform float uIsCourseTarget;
                varying vec2 vUv;
                void main() {
                    vec2 uv = vUv - 0.5;
                    float dist = length(uv);
                    if (dist > 0.5) discard;
                    
                    vec3 col = mix(uColor, vec3(0.1, 1.0, 0.5), uIsCourseTarget);

                    float ring = sin(dist * 30.0 - uTime * 8.0);
                    ring = smoothstep(0.4, 0.5, ring) * (0.5 - dist);
                    float swirl = atan(uv.y, uv.x) + dist * 15.0 - uTime * 4.0;
                    float spiral = sin(swirl * 4.0);
                    spiral = smoothstep(0.5, 1.0, spiral) * (0.5 - dist);
                    float core = smoothstep(0.1, 0.0, dist);
                    gl_FragColor = vec4(col * (ring * 2.0 + spiral + core), (ring + spiral + core) * 0.9);
                }
            `
        });

        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), material);
        this.mesh.position.copy(this.position);
        this.isCourseTarget = false;
        scene.add(this.mesh);
    }

    _seedToColor(seed) {
        let hash = 0;
        for (let i = 0; i < seed.length; i++) hash = (hash << 5) - hash + seed.charCodeAt(i);
        const h = Math.abs(hash % 360) / 360;
        return new THREE.Color().setHSL(h, 0.7, 0.6);
    }

    update(time, camera) {
        if (!this.mesh) return;
        this.mesh.material.uniforms.uTime.value = time;
        this.mesh.material.uniforms.uIsCourseTarget.value = this.isCourseTarget ? 1.0 : 0.0;
        this.mesh.lookAt(camera.position);
    }

    dispose(scene) {
        if (this.mesh) {
            scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
    }
}
