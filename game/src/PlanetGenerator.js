/**
 * PlanetGenerator: Procedural planet texture generator using 3D noise.
 */
import * as THREE from 'three';

export default class PlanetGenerator {
    constructor(renderer) {
        this.renderer = renderer;
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        const Snoise3D = `
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
            vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
            float snoise(vec3 v) { 
                const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
                const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
                vec3 i  = floor(v + dot(v, C.yyy) );
                vec3 x0 =   v - i + dot(i, C.xxx) ;
                vec3 g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min( g.xyz, l.zxy );
                vec3 i2 = max( g.xyz, l.zxy );
                vec3 x1 = x0 - i1 + C.xxx;
                vec3 x2 = x0 - i2 + C.yyy;
                vec3 x3 = x0 - D.yyy;
                i = mod289(i); 
                vec4 p = permute( permute( permute( i.z + vec4(0.0, i1.z, i2.z, 1.0 )) + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
                float n_ = 0.142857142857;
                vec3  ns = n_ * D.wyz - D.xzx;
                vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
                vec4 x_ = floor(j * ns.z);
                vec4 y_ = floor(j - 7.0 * x_ );
                vec4 x = x_ *ns.x + ns.yyyy;
                vec4 y = y_ *ns.x + ns.yyyy;
                vec4 h = 1.0 - abs(x) - abs(y);
                vec4 b0 = vec4( x.xy, y.xy );
                vec4 b1 = vec4( x.zw, y.zw );
                vec4 s0 = floor(b0)*2.0 + 1.0;
                vec4 s1 = floor(b1)*2.0 + 1.0;
                vec4 sh = -step(h, vec4(0.0));
                vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
                vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
                vec3 p0 = vec3(a0.xy,h.x);
                vec3 p1 = vec3(a0.zw,h.y);
                vec3 p2 = vec3(a1.xy,h.z);
                vec3 p3 = vec3(a1.zw,h.w);
                vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
                p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
                vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                m = m * m;
                return 105.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
            }
        `;

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uSeed: { value: 0 },
                uColorWater: { value: new THREE.Color(0x1a237e) },
                uColorLand: { value: new THREE.Color(0x1b5e20) },
                uColorMountain: { value: new THREE.Color(0x4e342e) },
                uFrequency: { value: 2.0 },
                uPersistence: { value: 0.5 },
                uWaterLevel: { value: 0.0 },
                uMtnLevel: { value: 0.4 },
                uMode: { value: 0.0 } // 0 = Terrain, 1 = Clouds
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec2 vUv;
                uniform float uSeed;
                uniform vec3 uColorWater;
                uniform vec3 uColorLand;
                uniform vec3 uColorMountain;
                uniform float uFrequency;
                uniform float uPersistence;
                uniform float uWaterLevel;
                uniform float uMtnLevel;
                uniform float uMode;
                ${Snoise3D}
                
                void main() {
                    float theta = vUv.x * 2.0 * 3.14159;
                    float phi = (vUv.y - 0.5) * 3.14159;
                    vec3 spherePos = vec3(cos(phi)*cos(theta), sin(phi), cos(phi)*sin(theta));
                    
                    // Use fract to keep coordinates in high precision range
                    vec3 offset = fract(vec3(uSeed * 0.123, uSeed * 0.456, uSeed * 0.789)) * 100.0;
                    vec3 p = spherePos + offset;
                    float h = 0.0;
                    
                    if (uMode > 0.5) {
                        // Cloud Mode: High frequency, whispy
                        float amp = 0.5;
                        float freq = uFrequency * 2.0;
                        for(int i=0; i<6; i++) {
                            h += snoise(p * freq) * amp;
                            // Rotate coordinates to break up artifacts
                            p = p.yzx * 1.1; 
                            amp *= 0.6;
                            freq *= 2.1;
                        }
                        float density = smoothstep(uWaterLevel - 0.2, uWaterLevel + 0.3, h);
                        gl_FragColor = vec4(uColorLand, clamp(density * 1.5, 0.0, 1.0));
                    } else {
                        // Terrain Mode
                        float amp = 0.5;
                        float freq = uFrequency;
                        for(int i=0; i<6; i++) {
                            h += snoise(p * freq) * amp;
                            p = p.yzx * 1.1; // Rotate
                            amp *= uPersistence;
                            freq *= 2.0;
                        }
                        
                        float waterLand = smoothstep(uWaterLevel - 0.05, uWaterLevel + 0.05, h);
                        float landMtn = smoothstep(uMtnLevel - 0.1, uMtnLevel + 0.2, h);
                        
                        vec3 waterCol = mix(uColorWater * 0.5, uColorWater, clamp(h - (uWaterLevel - 1.0), 0.0, 1.0));
                        vec3 landCol = mix(uColorLand, uColorLand * 1.2, clamp((h - uWaterLevel) / (uMtnLevel - uWaterLevel), 0.0, 1.0));
                        vec3 mtnCol = mix(uColorLand * 1.2, uColorMountain, clamp((h - uMtnLevel) / (1.0 - uMtnLevel), 0.0, 1.0));
                        
                        vec3 col = mix(waterCol, landCol, waterLand);
                        col = mix(col, mtnCol, landMtn);
                        
                        col += snoise(p * 50.0) * 0.02;
                        gl_FragColor = vec4(col, 1.0);
                    }
                }
            `,
            depthTest: false,
            depthWrite: false
        });


        this.BIOMES = {
            TERRAN: { water: 0x1a237e, land: 0x1b5e20, mtn: 0x4e342e, freq: 2.0, persistence: 0.5, waterLevel: 0.0, mtnLevel: 0.4 },
            DESERT: { water: 0x3e2723, land: 0xbf360c, mtn: 0x5d4037, freq: 3.5, persistence: 0.45, waterLevel: -0.2, mtnLevel: 0.3 },
            ICE: { water: 0x01579b, land: 0xbbdefb, mtn: 0xffffff, freq: 1.5, persistence: 0.6, waterLevel: 0.1, mtnLevel: 0.5 },
            VOLCANIC: { water: 0x000000, land: 0x212121, mtn: 0xff3d00, freq: 4.0, persistence: 0.55, waterLevel: -0.1, mtnLevel: 0.2 },
            ALIEN: { water: 0x311b92, land: 0xce93d8, mtn: 0x00ffaa, freq: 2.5, persistence: 0.7, waterLevel: 0.0, mtnLevel: 0.5 },
            JUNGLE: { water: 0x004d40, land: 0x00c853, mtn: 0x1b5e20, freq: 5.0, persistence: 0.4, waterLevel: 0.1, mtnLevel: 0.6 },
            OCEAN: { water: 0x0d47a1, land: 0x0288d1, mtn: 0x81d4fa, freq: 1.2, persistence: 0.5, waterLevel: 0.4, mtnLevel: 0.8 },
            BARREN: { water: 0x212121, land: 0x424242, mtn: 0x9e9e9e, freq: 6.0, persistence: 0.3, waterLevel: -1.0, mtnLevel: 0.1 },
            TOXIC: { water: 0x1b5e20, land: 0xc6ff00, mtn: 0x33691e, freq: 3.0, persistence: 0.65, waterLevel: 0.2, mtnLevel: 0.4 },
            CRYSTALLINE: { water: 0x006064, land: 0x00bcd4, mtn: 0xe1f5fe, freq: 8.0, persistence: 0.8, waterLevel: -0.1, mtnLevel: 0.3 }
        };

        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
        this.scene.add(mesh);
    }

    generate(seedInput = Math.random(), options = {}) {
        const resolution = options.resolution || 2048;

        // Convert hex seed to float for the shader
        let seed = 0;
        if (typeof seedInput === 'string') {
            // Use a simple hash for string seeds to get better variety
            let hash = 0;
            for (let i = 0; i < seedInput.length; i++) {
                hash = ((hash << 5) - hash) + seedInput.charCodeAt(i);
                hash |= 0;
            }
            seed = Math.abs(hash) % 1000000;
        } else {
            seed = seedInput;
        }

        const rt = new THREE.WebGLRenderTarget(resolution, resolution * 0.5, {
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            generateMipmaps: true
        });

        // Pick Biome from config
        const pRng = (s) => {
            let x = Math.sin(s) * 10000;
            return x - Math.floor(x);
        };
        const r = pRng(seed);

        const biomeKeys = Object.keys(this.BIOMES);
        const biomeKey = biomeKeys[Math.floor(r * biomeKeys.length)];
        const biome = this.BIOMES[biomeKey] || this.BIOMES.TERRAN;

        this.material.uniforms.uColorWater.value.set(options.colorWater || biome.water);
        this.material.uniforms.uColorLand.value.set(options.colorLand || (options.mode === 'clouds' ? 0xffffff : biome.land));
        this.material.uniforms.uColorMountain.value.set(options.colorMountain || biome.mtn);

        this.material.uniforms.uFrequency.value = options.freq || biome.freq;
        this.material.uniforms.uPersistence.value = options.persistence || biome.persistence;
        this.material.uniforms.uWaterLevel.value = options.waterLevel !== undefined ? options.waterLevel : biome.waterLevel;
        this.material.uniforms.uMtnLevel.value = options.mtnLevel !== undefined ? options.mtnLevel : biome.mtnLevel;
        this.material.uniforms.uMode.value = options.mode === 'clouds' ? 1.0 : 0.0;

        this.material.uniforms.uSeed.value = parseFloat(seed);

        const oldTarget = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(rt);
        this.renderer.clear();
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(oldTarget);

        const tex = rt.texture;
        tex.userData.renderTarget = rt; // Store for disposal

        // Force a GPU sync by reading a single pixel (blocks until render is complete)
        const pixel = new Uint8Array(4);
        this.renderer.readRenderTargetPixels(rt, 0, 0, 1, 1, pixel);

        // Artificial delay to make the warp feel like a journey and mask asset prep
        //await new Promise(r => setTimeout(r, 600 + Math.random() * 400));

        return tex;
    }
}
