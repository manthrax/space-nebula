# Nebula Drifter: Technical Architecture & System Overview

This document provides a comprehensive overview of the **Nebula Drifter** codebase, a procedurally generated space exploration game built on the **Nebularity** engine.

---

## 1. Core Architecture
The game follows a modular ES6 module architecture, leveraging **Three.js** for rendering and **Vite** for the development environment.

### Key Directories
- `/src/`: Core engine files for the Nebularity nebula generator.
- `/game/src/`: Game-specific logic, systems, and UI.
- `/game/assets/`: Static assets (GLB models, etc.).

---

## 2. Primary Systems

### 🌌 Nebularity Engine (`src/Nebularity.js`)
The heart of the visual experience. It generates high-resolution 3D nebula textures using GPU shaders.
- **Mechanism**: Uses a `WebGLCubeRenderTarget` with a custom `ShaderMaterial`.
- **Morphing**: Supports smooth crossfading between two seeds via a `ping-pong` buffer strategy.
- **Integration**: The output `CubeTexture` is used as the `scene.background` and `scene.environment`.

### 🚀 Flight Controller (`game/src/FlightController.js`)
Manages ship physics and camera behavior.
- **Physics**: Newtonian-lite simulation with linear and angular drag.
- **Throttle**: Digitally mapped percentage-based throttle (0-100%).
- **Hyperthrust**: High-speed warp mechanic that consumes "Core Charge."
- **Autopilot**: Align-and-burn logic that steers the ship toward a target `WarpPoint`.
- **Cinematic Camera**: Smooth interpolation between cockpit view and external tracking view.

### 🪐 Planet Generator (`game/src/PlanetGenerator.js`)
An asynchronous pipeline for generating planetary textures.
- **Async Workflow**: Uses `readRenderTargetPixels` to force GPU synchronization, ensuring textures are fully uploaded before the player arrives in a new sector.
- **Layering**: Generates separate surface and cloud maps based on a single seed.

### 🗺️ Universe Manager (`game/src/UniverseManager.js`)
Governs the infinite grid-based galactic topology.
- **Lattice**: Sectors are mapped to an integer coordinate system `[x, y, z]`.
- **Deterministic Linking**: Links between sectors are generated on-demand but are deterministic based on the global seed.
- **Handshake Stability**: Uses an exhaustive neighbor-check to ensure that if Sector B links to A, A always knows about the link to B before spawning warp points.

### 📡 Star Map (`game/src/StarMap.js`)
Navigational interface for long-range planning.
- **Pathfinding**: Implements A* algorithm across the deterministic link graph.
- **Visualization**: Renders a 3D view of the local galactic cluster with pulsing highlights for the current path.

### 🎙️ TTS Manager (`game/src/TTSManager.js`)
Handles high-quality background narration.
- **Engine**: Uses `Kokoro-JS` (ONNX) for local, browser-based text-to-speech.
- **Threading**: Runs the heavy ONNX inference in a Web Worker to prevent main-thread stuttering during sector transitions.

---

## 3. The Game Loop (`game/src/Main.js`)
The orchestration layer that ties everything together.

1.  **Initialization**: Loads `ship_stack.glb`, initializes TTS, and restores saved state.
2.  **Sector Entry**:
    - `UniverseManager` provides neighbors.
    - `spawnPlanet` clears old assets and begins async generation of new ones.
    - `Nebularity` begins morphing to the new sector's nebula seed.
    - `TTSManager` announces sector entry and attributes.
3.  **Update Loop**:
    - Physics updates via `FlightController`.
    - HUD updates (throttled text updates for performance).
    - Trigger-check for `WarpPoint` proximity (12s transition duration).
4.  **Persistence**: Automatically saves state to `localStorage` every 2 seconds.

---

## 4. UI Layout System
The UI is built using **HTML/CSS Grid** to keep panels pinned to the edges of the 3D viewport.
- **Grid Structure**: A 3x3 master grid defined in `index.html` and `HUD.js`.
- **Readout Columns**: Left and Right flex-columns that stack panels (Propulsion, Navigation, Assets, Tactical) without overlapping.
- **Modal Logic**: Centered grid cells handle large interactive windows like the Trading Terminal.

---

## 5. Development Notes
- **HTTPS**: Required for WebGPU and certain TTS features. Managed via `@vitejs/plugin-basic-ssl`.
- **Ship Assets**: The `ship_stack.glb` contains multiple ship models prefixed with `ship_`. The loader selects one and extracts its hierarchy, including custom thruster meshes mapped to a specialized "energy pulse" shader.
- **Coordinate System**: Three.js units are roughly meters. Warp distances are ~5000 units. Planets are ~1000 units in radius.

---

## 6. Common Developer Commands
- `npm run dev`: Starts the HTTPS development server.
- `Tab`: Toggle Star Map.
- `P`: Toggle Autopilot.
- `B`: Open Trading/Market link (when near planets).
- `Dev Mode`: Append `?dev=1` to the URL to enable auto-resume and cluster-spawning features.



