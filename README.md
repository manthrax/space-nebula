# Space Nebula Generator (Modernized)

A high-fidelity, procedural 3D space nebula generator built with Three.js. 

This project is a modern refactor of the classic procedural nebula engine by **Joshua Hook (@wwwtyro)**. It replaces legacy WebGL boilerplate with a modular, native Three.js implementation featuring HDR rendering, PBR environment support, and a reactive glassmorphism UI.

🚀 **[Live Demo (Placeholder)](https://manthrax.github.io/space-nebula/)**

![Nebula Vista](placeholder_screenshot.png)

## Library Usage

You can import this generator directly into any Three.js project via CDN or raw GitHub link.

### 1. Import and Generate
```javascript
import * as THREE from 'three';
import NebulaGenerator from 'https://cdn.jsdelivr.net/gh/manthrax/space-nebula/NebulaGenerator.js';

// Setup your renderer...
const renderer = new THREE.WebGLRenderer();

// Generate a unique skybox in one line
const nebulaTexture = NebulaGenerator.create(renderer, "my-seed-123", {
    resolution: 1024,
    stars: true,
    nebulae: true
});

// Apply to your scene
scene.background = nebulaTexture;
scene.environment = nebulaTexture;
```

## Features
- **Procedural 4D Noise**: Generates unique, infinitely varied cosmic clouds and dust patterns.
- **Astronomical Realism**: Star colors follow the **Morgan-Keenan spectral classification** (OBAFGKM), ranging from hot blue-white to cool red-orange.
- **PBR Environment Mapping**: Generated nebulas act as real-time environment maps, providing high-dynamic-range (HDR) lighting to 3D objects.
- **Modern UI**: A minimalist, translucent glassmorphism control panel with real-time parameter updates.
- **High Precision**: Renders to `HalfFloatType` (16-bit) buffers to eliminate color banding and preserve star intensity.

## Technical Credits
- **Original Algorithm**: [Joshua Hook (@wwwtyro)](https://github.com/wwwtyro).
- **Noise Core**: Based on Stefan Gustavson's classic 4D simplex noise implementation.
- **Refactor**: Modernized for ES6 and Three.js native rendering.

## Development
This project uses **Vite** for a fast development experience.

```bash
# Install dependencies
npm install

# Run locally
npm run dev
```

## Exporting (Planned)
- **Equirectangular JPG**: Export 360-degree vistas for use in VR or traditional skyboxes.
- **HDR (EXR)**: High-bit-depth export for professional VFX and lighting workflows.

## License
Released under the **Unlicense** (Public Domain). Feel free to use, modify, and distribute for any purpose.
