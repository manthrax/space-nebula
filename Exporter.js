import * as THREE from 'three';
import { EXRExporter } from 'three/examples/jsm/exporters/EXRExporter.js';

export default class Exporter {
    constructor(renderer) {
        this.renderer = renderer;
        this.initEquirectShader();
    }

    initEquirectShader() {
        this.equirectMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tCube: { value: null }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform samplerCube tCube;
                varying vec2 vUv;
                const float PI = 3.14159265359;
                void main() {
                    float phi = vUv.x * 2.0 * PI;
                    float theta = (1.0 - vUv.y) * PI;
                    vec3 dir = vec3(
                        -sin(theta) * sin(phi),
                        cos(theta),
                        -sin(theta) * cos(phi)
                    );
                    gl_FragColor = textureCube(tCube, dir);
                }
            `,
            side: THREE.DoubleSide
        });

        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.equirectMaterial);
        this.scene.add(this.quad);
    }

    async exportEquirect(cubeTexture, resolution = 2048, format = 'jpg') {
        const width = resolution;
        const height = resolution / 2;

        const renderTarget = new THREE.WebGLRenderTarget(width, height, {
            format: THREE.RGBAFormat,
            type: format === 'exr' ? THREE.HalfFloatType : THREE.UnsignedByteType,
            colorSpace: THREE.LinearSRGBColorSpace
        });

        this.equirectMaterial.uniforms.tCube.value = cubeTexture;
        
        const oldTarget = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(renderTarget);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(oldTarget);

        if (format === 'exr') {
            await this.downloadEXR(renderTarget, width, height);
        } else {
            this.downloadJPG(renderTarget, width, height);
        }

        renderTarget.dispose();
    }

    async downloadEXR(renderTarget, width, height) {
        const exporter = new EXRExporter();
        // Read pixels to a typed array
        const pixels = new Float16Array(width * height * 4);
        this.renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);
        
        // Wait, EXRExporter.parse usually takes the renderTarget or DataTexture
        const result = await exporter.parse(this.renderer, renderTarget);
        this.saveBlob(new Blob([result], { type: 'image/x-exr' }), 'nebula_vista.exr');
    }

    downloadJPG(renderTarget, width, height) {
        const pixels = new Uint8Array(width * height * 4);
        this.renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);

        // We need to flip Y for the canvas export
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(width, height);
        
        // Copy and flip
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                const flippedI = ((height - 1 - y) * width + x) * 4;
                imageData.data[flippedI] = pixels[i];
                imageData.data[flippedI + 1] = pixels[i + 1];
                imageData.data[flippedI + 2] = pixels[i + 2];
                imageData.data[flippedI + 3] = 255;
            }
        }
        ctx.putImageData(imageData, 0, 0);
        
        canvas.toBlob((blob) => {
            this.saveBlob(blob, 'nebula_vista.jpg');
        }, 'image/jpeg', 0.95);
    }

    saveBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    }
}
