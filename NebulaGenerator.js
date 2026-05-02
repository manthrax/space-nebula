import * as THREE from 'three';

/**
 * NebulaGenerator.js (Three.js Native)
 */

class MersenneTwister {
    constructor(seed = Date.now()) {
        this.MT = new Uint32Array(624);
        this.index = 0;
        this.MT[0] = seed >>> 0;
        for (let i = 1; i < 624; i++) {
            const s = this.MT[i - 1] ^ (this.MT[i - 1] >>> 30);
            this.MT[i] = (((((s & 0xffff0000) >>> 16) * 1812433253) << 16) + (s & 0x0000ffff) * 1812433253) + i;
            this.MT[i] >>>= 0;
        }
    }
    random() {
        if (this.index >= 624) this.twist();
        let y = this.MT[this.index++];
        y ^= (y >>> 11);
        y ^= (y << 7) & 0x9d2c5680;
        y ^= (y << 15) & 0xefc60000;
        y ^= (y >>> 18);
        return (y >>> 0) * (1.0 / 4294967296.0);
    }
    twist() {
        for (let i = 0; i < 624; i++) {
            const y = (this.MT[i] & 0x80000000) + (this.MT[(i + 1) % 624] & 0x7fffffff);
            this.MT[i] = this.MT[(i + 397) % 624] ^ (y >>> 1);
            if (y % 2 !== 0) this.MT[i] ^= 0x9908b0df;
        }
        this.index = 0;
    }
}

export default class NebulaGenerator {
    constructor(renderer) {
        this.renderer = renderer;

        this.initMaterials();
        this.initScene();
    }

    getStarColor(rng) {
        const r = rng.random();
        // Highly saturated colors to survive ACES Filmic desaturation
        if (r < 0.05) return new THREE.Color(0.1, 0.4, 1.0).multiplyScalar(1.5);  // Deep Blue (O)
        if (r < 0.15) return new THREE.Color(0.3, 0.6, 1.0).multiplyScalar(1.2);  // Electric Blue (B)
        if (r < 0.25) return new THREE.Color(1.0, 1.0, 1.0);                      // Pure White (A/F)
        if (r < 0.55) return new THREE.Color(1.0, 0.9, 0.4).multiplyScalar(1.1);   // Golden (G)
        if (r < 0.85) return new THREE.Color(1.0, 0.5, 0.05).multiplyScalar(1.3);  // Vivid Orange (K)
        return new THREE.Color(1.0, 0.2, 0.05).multiplyScalar(1.5);               // Vivid Red (M)
    }

    initMaterials() {
        const noise4D = `
            vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
            vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
            vec4 fade(vec4 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

            float cnoise(vec4 P) {
                vec4 Pi0 = floor(P);
                vec4 Pi1 = Pi0 + 1.0;
                Pi0 = mod289(Pi0);
                Pi1 = mod289(Pi1);
                vec4 Pf0 = fract(P);
                vec4 Pf1 = Pf0 - 1.0;
                vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
                vec4 iy = vec4(Pi0.yy, Pi1.yy);
                vec4 iz0 = vec4(Pi0.zzzz);
                vec4 iz1 = vec4(Pi1.zzzz);
                vec4 iw0 = vec4(Pi0.wwww);
                vec4 iw1 = vec4(Pi1.wwww);

                vec4 ixy = permute(permute(ix) + iy);
                vec4 ixy0 = permute(ixy + iz0);
                vec4 ixy1 = permute(ixy + iz1);
                vec4 ixy00 = permute(ixy0 + iw0);
                vec4 ixy01 = permute(ixy0 + iw1);
                vec4 ixy10 = permute(ixy1 + iw0);
                vec4 ixy11 = permute(ixy1 + iw1);

                vec4 gx00 = ixy00 * (1.0 / 7.0);
                vec4 gy00 = floor(gx00) * (1.0 / 7.0);
                vec4 gz00 = floor(gy00) * (1.0 / 6.0);
                gx00 = fract(gx00) - 0.5;
                gy00 = fract(gy00) - 0.5;
                gz00 = fract(gz00) - 0.5;
                vec4 gw00 = vec4(0.75) - abs(gx00) - abs(gy00) - abs(gz00);
                vec4 sw00 = step(gw00, vec4(0.0));
                gx00 -= sw00 * (step(0.0, gx00) - 0.5);
                gy00 -= sw00 * (step(0.0, gy00) - 0.5);

                vec4 gx01 = ixy01 * (1.0 / 7.0);
                vec4 gy01 = floor(gx01) * (1.0 / 7.0);
                vec4 gz01 = floor(gy01) * (1.0 / 6.0);
                gx01 = fract(gx01) - 0.5;
                gy01 = fract(gy01) - 0.5;
                gz01 = fract(gz01) - 0.5;
                vec4 gw01 = vec4(0.75) - abs(gx01) - abs(gy01) - abs(gz01);
                vec4 sw01 = step(gw01, vec4(0.0));
                gx01 -= sw01 * (step(0.0, gx01) - 0.5);
                gy01 -= sw01 * (step(0.0, gy01) - 0.5);

                vec4 gx10 = ixy10 * (1.0 / 7.0);
                vec4 gy10 = floor(gx10) * (1.0 / 7.0);
                vec4 gz10 = floor(gy10) * (1.0 / 6.0);
                gx10 = fract(gx10) - 0.5;
                gy10 = fract(gy10) - 0.5;
                gz10 = fract(gz10) - 0.5;
                vec4 gw10 = vec4(0.75) - abs(gx10) - abs(gy10) - abs(gz10);
                vec4 sw10 = step(gw10, vec4(0.0));
                gx10 -= sw10 * (step(0.0, gx10) - 0.5);
                gy10 -= sw10 * (step(0.0, gy10) - 0.5);

                vec4 gx11 = ixy11 * (1.0 / 7.0);
                vec4 gy11 = floor(gx11) * (1.0 / 7.0);
                vec4 gz11 = floor(gy11) * (1.0 / 6.0);
                gx11 = fract(gx11) - 0.5;
                gy11 = fract(gy11) - 0.5;
                gz11 = fract(gz11) - 0.5;
                vec4 gw11 = vec4(0.75) - abs(gx11) - abs(gy11) - abs(gz11);
                vec4 sw11 = step(gw11, vec4(0.0));
                gx11 -= sw11 * (step(0.0, gx11) - 0.5);
                gy11 -= sw11 * (step(0.0, gy11) - 0.5);

                vec4 g0000 = vec4(gx00.x,gy00.x,gz00.x,gw00.x);
                vec4 g1000 = vec4(gx00.y,gy00.y,gz00.y,gw00.y);
                vec4 g0100 = vec4(gx00.z,gy00.z,gz00.z,gw00.z);
                vec4 g1100 = vec4(gx00.w,gy00.w,gz00.w,gw00.w);
                vec4 g0010 = vec4(gx10.x,gy10.x,gz10.x,gw10.x);
                vec4 g1010 = vec4(gx10.y,gy10.y,gz10.y,gw10.y);
                vec4 g0110 = vec4(gx10.z,gy10.z,gz10.z,gw10.z);
                vec4 g1110 = vec4(gx10.w,gy10.w,gz10.w,gw10.w);
                vec4 g0001 = vec4(gx01.x,gy01.x,gz01.x,gw01.x);
                vec4 g1001 = vec4(gx01.y,gy01.y,gz01.y,gw01.y);
                vec4 g0101 = vec4(gx01.z,gy01.z,gz01.z,gw01.z);
                vec4 g1101 = vec4(gx01.w,gy01.w,gz01.w,gw01.w);
                vec4 g0011 = vec4(gx11.x,gy11.x,gz11.x,gw11.x);
                vec4 g1011 = vec4(gx11.y,gy11.y,gz11.y,gw11.y);
                vec4 g0111 = vec4(gx11.z,gy11.z,gz11.z,gw11.z);
                vec4 g1111 = vec4(gx11.w,gy11.w,gz11.w,gw11.w);

                vec4 norm00 = taylorInvSqrt(vec4(dot(g0000, g0000), dot(g0100, g0100), dot(g1000, g1000), dot(g1100, g1100)));
                g0000 *= norm00.x; g0100 *= norm00.y; g1000 *= norm00.z; g1100 *= norm00.w;
                vec4 norm01 = taylorInvSqrt(vec4(dot(g0001, g0001), dot(g0101, g0101), dot(g1001, g1001), dot(g1101, g1101)));
                g0001 *= norm01.x; g0101 *= norm01.y; g1001 *= norm01.z; g1101 *= norm01.w;
                vec4 norm10 = taylorInvSqrt(vec4(dot(g0010, g0010), dot(g0110, g0110), dot(g1010, g1010), dot(g1110, g1110)));
                g0010 *= norm10.x; g0110 *= norm10.y; g1010 *= norm10.z; g1110 *= norm10.w;
                vec4 norm11 = taylorInvSqrt(vec4(dot(g0011, g0011), dot(g0111, g0111), dot(g1011, g1011), dot(g1111, g1111)));
                g0011 *= norm11.x; g0111 *= norm11.y; g1011 *= norm11.z; g1111 *= norm11.w;

                float n0000 = dot(g0000, Pf0);
                float n1000 = dot(g1000, vec4(Pf1.x, Pf0.yzw));
                float n0100 = dot(g0100, vec4(Pf0.x, Pf1.y, Pf0.zw));
                float n1100 = dot(g1100, vec4(Pf1.xy, Pf0.zw));
                float n0010 = dot(g0010, vec4(Pf0.xy, Pf1.z, Pf0.w));
                float n1010 = dot(g1010, vec4(Pf1.x, Pf0.y, Pf1.z, Pf0.w));
                float n0110 = dot(g0110, vec4(Pf0.x, Pf1.yz, Pf0.w));
                float n1110 = dot(g1110, vec4(Pf1.xyz, Pf0.w));
                float n0001 = dot(g0001, vec4(Pf0.xyz, Pf1.w));
                float n1001 = dot(g1001, vec4(Pf1.x, Pf0.yz, Pf1.w));
                float n0101 = dot(g0101, vec4(Pf0.x, Pf1.y, Pf0.z, Pf1.w));
                float n1101 = dot(g1101, vec4(Pf1.xy, Pf0.z, Pf1.w));
                float n0011 = dot(g0011, vec4(Pf0.xy, Pf1.zw));
                float n1011 = dot(g1011, vec4(Pf1.x, Pf0.y, Pf1.zw));
                float n0111 = dot(g0111, vec4(Pf0.x, Pf1.yzw));
                float n1111 = dot(g1111, Pf1);

                vec4 fade_xyzw = fade(Pf0);
                vec4 n_0w = mix(vec4(n0000, n1000, n0100, n1100), vec4(n0001, n1001, n0101, n1101), fade_xyzw.w);
                vec4 n_1w = mix(vec4(n0010, n1010, n0110, n1110), vec4(n0011, n1011, n0111, n1111), fade_xyzw.w);
                vec4 n_zw = mix(n_0w, n_1w, fade_xyzw.z);
                vec2 n_yzw = mix(n_zw.xy, n_zw.zw, fade_xyzw.y);
                float n_xyzw = mix(n_yzw.x, n_yzw.y, fade_xyzw.x);
                return 2.2 * n_xyzw;
            }
        `;

        this.nebulaMaterial = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
            uniforms: {
                uColor: { value: new THREE.Color(1, 1, 1) },
                uOffset: { value: new THREE.Vector3(0, 0, 0) },
                uScale: { value: 1.0 },
                uIntensity: { value: 1.0 },
                uFalloff: { value: 1.0 }
            },
            vertexShader: `
                varying vec3 vPos;
                void main() {
                    vPos = (modelMatrix * vec4(position, 1.0)).xyz;
                    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform vec3 uColor;
                uniform vec3 uOffset;
                uniform float uScale;
                uniform float uIntensity;
                uniform float uFalloff;
                varying vec3 vPos;
                ${noise4D}
                float noise(vec3 p) { return 0.5 * cnoise(vec4(p, 0.0)) + 0.5; }
                float nebula(vec3 p) {
                    const int steps = 6;
                    float scale = pow(2.0, float(steps));
                    vec3 displace = vec3(0.0);
                    for (int i = 0; i < steps; i++) {
                        displace = vec3(
                            noise(p.xyz * scale + displace),
                            noise(p.yzx * scale + displace),
                            noise(p.zxy * scale + displace)
                        );
                        scale *= 0.5;
                    }
                    return noise(p * scale + displace);
                }
                float dither(vec2 uv) {
                    return (fract(sin(dot(uv, vec2(12.9898,78.233))) * 43758.5453) - 0.5) / 255.0;
                }
                void main() {
                    vec3 posn = normalize(vPos) * uScale;
                    float c = min(1.0, nebula(posn + uOffset) * uIntensity);
                    c = pow(c, uFalloff);
                    // Add subtle dithering to break up banding
                    float d = dither(gl_FragCoord.xy);
                    gl_FragColor = vec4(uColor + d, c + d);
                }
            `
        });

        this.starMaterial = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
            uniforms: {
                uPosition: { value: new THREE.Vector3(0, 0, 0) },
                uColor: { value: new THREE.Color(1, 1, 1) },
                uSize: { value: 1.0 },
                uIntensity: { value: 1.0 },
                uFalloff: { value: 1.0 }
            },
            vertexShader: `
                varying vec3 vPos;
                void main() {
                    vPos = (modelMatrix * vec4(position, 1.0)).xyz;
                    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform vec3 uPosition;
                uniform vec3 uColor;
                uniform float uSize;
                uniform float uIntensity;
                uniform float uFalloff;
                varying vec3 vPos;
                void main() {
                    vec3 posn = normalize(vPos);
                    float d = 1.0 - dot(posn, normalize(uPosition));
                    
                    float glow = exp(-d * uFalloff) * uIntensity;
                    float core = exp(-d * uFalloff * 10.0) * uIntensity * 15.0;
                    
                    vec3 col = mix(uColor, vec3(1.0), clamp(core * 0.1, 0.0, 0.5));
                    gl_FragColor = vec4(col * (glow + core), clamp(glow + core, 0.0, 1.0));
                }
            `
        });

        this.sunMaterial = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
            uniforms: {
                uPosition: { value: new THREE.Vector3(0, 0, 0) },
                uColor: { value: new THREE.Color(1, 1, 1) },
                uSize: { value: 1.0 },
                uIntensity: { value: 1.0 },
                uFalloff: { value: 1.0 }
            },
            vertexShader: `
                varying vec3 vPos;
                void main() {
                    vPos = (modelMatrix * vec4(position, 1.0)).xyz;
                    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform vec3 uPosition;
                uniform vec3 uColor;
                uniform float uSize;
                uniform float uIntensity;
                uniform float uFalloff;
                varying vec3 vPos;
                void main() {
                    vec3 posn = normalize(vPos);
                    float d = clamp(dot(posn, normalize(uPosition)), 0.0, 1.0);
                    float c = smoothstep(1.0 - uSize * 32.0, 1.0 - uSize, d);
                    c += pow(d, uFalloff) * 0.5;
                    c *= uIntensity; // Factor in intensity
                    vec3 color = mix(uColor, vec3(1,1,1), c * 0.7); // Reduced white mixing
                    gl_FragColor = vec4(color * uIntensity, c);
                }
            `
        });

        this.pointStarsMaterial = new THREE.ShaderMaterial({
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
            vertexShader: `
                attribute vec3 color;
                varying vec3 vColor;
                void main() {
                    vColor = color;
                    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                void main() {
                    gl_FragColor = vec4(vColor, 1.0);
                }
            `
        });
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.boxMesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2, 64, 64, 64), this.nebulaMaterial);
        this.boxMesh.frustumCulled = false;
        this.scene.add(this.boxMesh);

        // Pre-generate point stars as a Mesh
        const count = 100000;
        const positions = new Float32Array(count * 18);
        const colors = new Float32Array(count * 18);
        const rngPointInit = new MersenneTwister(12345);

        for (let i = 0; i < count; i++) {
            const size = 0.05;
            const pos = new THREE.Vector3().randomDirection();
            
            // Background point stars get subtle coloring too
            const starColor = this.getStarColor(rngPointInit);
            const brightness = Math.pow(rngPointInit.random(), 4.0);
            
            const star = this.buildStarGeometry(size, pos, 128.0, starColor, brightness);
            positions.set(star.position, i * 18);
            colors.set(star.color, i * 18);
        }

        const pointStarsGeometry = new THREE.BufferGeometry();
        pointStarsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        pointStarsGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.pointStarsMesh = new THREE.Mesh(pointStarsGeometry, this.pointStarsMaterial);
        this.pointStarsMesh.frustumCulled = false;
        this.scene.add(this.pointStarsMesh);
    }

    generate(seed = "nebula", params = {}) {
        const {
            resolution = 1024,
            nebulae = true,
            stars = true,
            sun = true,
            pointStars = true
        } = params;

        const hash = this.hashCode(seed);
        const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(resolution, {
            format: THREE.RGBAFormat,
            type: THREE.HalfFloatType,
            generateMipmaps: false,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter
        });

        // Near plane set to 0.01 to avoid any possible clipping of the generator box
        const cubeCamera = new THREE.CubeCamera(0.01, 2000, cubeRenderTarget);
        this.scene.add(cubeCamera);

        // --- Setup Parameters ---
        const rngPoint = new MersenneTwister(hash + 1000);
        const pStarRotations = [];
        if (pointStars) {
            while (true) {
                const rot = new THREE.Euler(
                    rngPoint.random() * Math.PI * 2,
                    rngPoint.random() * Math.PI * 2,
                    rngPoint.random() * Math.PI * 2
                );
                pStarRotations.push(rot);
                if (rngPoint.random() < 0.2) break;
            }
        }

        const rngStar = new MersenneTwister(hash + 3000);
        const starParams = [];
        if (stars) {
            while (true) {
                starParams.push({
                    pos: new THREE.Vector3(...this.randomVec3(rngStar)),
                    color: this.getStarColor(rngStar),
                    size: rngStar.random() * 0.5 + 0.1, 
                    intensity: rngStar.random() * 2.9 + 0.1, // Much more brightness variation
                    falloff: rngStar.random() * 160000.0 + 40000.0 // 50% smaller (radius)
                });
                if (rngStar.random() < 0.01) break;
            }
        }

        const rngNebula = new MersenneTwister(hash + 2000);
        const nebulaParams = [];
        if (nebulae) {
            while (true) {
                nebulaParams.push({
                    scale: rngNebula.random() * 0.5 + 0.25,
                    color: new THREE.Color(rngNebula.random(), rngNebula.random(), rngNebula.random()),
                    intensity: rngNebula.random() * 0.2 + 0.9,
                    falloff: rngNebula.random() * 3.0 + 3.0,
                    offset: new THREE.Vector3(rngNebula.random() * 2000 - 1000, rngNebula.random() * 2000 - 1000, rngNebula.random() * 2000 - 1000)
                });
                if (rngNebula.random() < 0.5) break;
            }
        }

        const rngSun = new MersenneTwister(hash + 4000);
        const sunParams = [];
        if (sun) {
            sunParams.push({
                pos: new THREE.Vector3(...this.randomVec3(rngSun)),
                color: this.getStarColor(rngSun),
                size: rngSun.random() * 0.0001 + 0.000025, // 50% smaller overall
                intensity: rngSun.random() * 2.5 + 0.5,     // More brightness range
                falloff: rngSun.random() * 24.0 + 4.0       // More halo variety
            });
        }

        // --- Render Loop ---
        const oldSize = new THREE.Vector2();
        this.renderer.getSize(oldSize);
        this.renderer.setSize(resolution, resolution);

        const oldAutoClear = this.renderer.autoClear;
        const oldColorSpace = this.renderer.outputColorSpace;
        const oldToneMapping = this.renderer.toneMapping;

        this.renderer.autoClear = false;
        this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
        this.renderer.toneMapping = THREE.NoToneMapping;

        // Hide everything first
        this.boxMesh.visible = false;
        this.pointStarsMesh.visible = false;

        // Clear target - Explicitly clear all 6 faces to ensure no stale data or face bias
        const oldTarget = this.renderer.getRenderTarget();
        this.renderer.setClearColor(0x000000, 1);
        for (let i = 0; i < 6; i++) {
            this.renderer.setRenderTarget(cubeRenderTarget, i);
            this.renderer.clear();
        }

        // 1. Point Stars
        if (pointStars) {
            this.pointStarsMesh.visible = true;
            for (const rot of pStarRotations) {
                this.pointStarsMesh.rotation.copy(rot);
                cubeCamera.update(this.renderer, this.scene);
            }
            this.pointStarsMesh.visible = false;
        }

        // 2. Bright Stars
        if (stars) {
            this.boxMesh.visible = true;
            this.boxMesh.material = this.starMaterial;
            for (const s of starParams) {
                this.starMaterial.uniforms.uPosition.value.copy(s.pos);
                this.starMaterial.uniforms.uColor.value.copy(s.color);
                this.starMaterial.uniforms.uSize.value = s.size;
                this.starMaterial.uniforms.uIntensity.value = s.intensity;
                this.starMaterial.uniforms.uFalloff.value = s.falloff;
                cubeCamera.update(this.renderer, this.scene);
            }
        }

        // 3. Nebulae
        if (nebulae) {
            this.boxMesh.visible = true;
            this.boxMesh.material = this.nebulaMaterial;
            for (const p of nebulaParams) {
                this.nebulaMaterial.uniforms.uScale.value = p.scale;
                this.nebulaMaterial.uniforms.uColor.value.copy(p.color);
                this.nebulaMaterial.uniforms.uIntensity.value = p.intensity;
                this.nebulaMaterial.uniforms.uFalloff.value = p.falloff;
                this.nebulaMaterial.uniforms.uOffset.value.copy(p.offset);
                cubeCamera.update(this.renderer, this.scene);
            }
        }

        // 4. Sun
        if (sun) {
            this.boxMesh.visible = true;
            this.boxMesh.material = this.sunMaterial;
            for (const s of sunParams) {
                this.sunMaterial.uniforms.uPosition.value.copy(s.pos);
                this.sunMaterial.uniforms.uColor.value.copy(s.color);
                this.sunMaterial.uniforms.uSize.value = s.size;
                this.sunMaterial.uniforms.uIntensity.value = s.intensity;
                this.sunMaterial.uniforms.uFalloff.value = s.falloff;
                cubeCamera.update(this.renderer, this.scene);
            }
        }

        // Restore renderer state
        this.renderer.autoClear = oldAutoClear;
        this.renderer.outputColorSpace = oldColorSpace;
        this.renderer.toneMapping = oldToneMapping;
        this.renderer.setRenderTarget(oldTarget);
        this.renderer.setSize(oldSize.x, oldSize.y);

        this.scene.remove(cubeCamera);

        return cubeRenderTarget.texture;
    }

    /**
     * Library Helper: Generates a nebula cubemap in a single call.
     */
    static create(renderer, seed = "cosmic", params = {}) {
        const gen = new NebulaGenerator(renderer);
        return gen.generate(seed, params);
    }

    // --- Helpers ---

    hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash += (i + 1) * str.charCodeAt(i);
        }
        return hash;
    }

    randomVec3(rng) {
        const y = rng.random() * 2 - 1;
        const r = Math.sqrt(1 - y * y);
        const phi = rng.random() * Math.PI * 2;
        return [r * Math.cos(phi), y, r * Math.sin(phi)];
    }

    buildStarGeometry(size, pos, dist, starColor, brightness) {
        const color = [];
        for (let i = 0; i < 6; i++) {
            color.push(starColor.r * brightness, starColor.g * brightness, starColor.b * brightness);
        }
        const vertices = [
            [-size, -size, 0], [size, -size, 0], [size, size, 0],
            [-size, -size, 0], [size, size, 0], [-size, size, 0]
        ];
        const position = [];
        const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), pos.clone().normalize());
        for (const v of vertices) {
            const rotV = new THREE.Vector3(...v).applyQuaternion(quat);
            position.push(rotV.x + pos.x * dist, rotV.y + pos.y * dist, rotV.z + pos.z * dist);
        }
        return { position, color };
    }
}
