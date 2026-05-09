import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import Nebularity from '../../src/Nebularity.js';
import FlightController from './FlightController.js';
import HUD from './HUD.js';
import PlanetGenerator from './PlanetGenerator.js';
import PersistenceManager from './PersistenceManager.js';
import NameGenerator from './NameGenerator.js';
import ShieldSystem from './ShieldSystem.js';
import Exporter from '../../src/Exporter.js';
import UniverseManager from './UniverseManager.js';
import StarMap from './StarMap.js';
import WarpPoint from './WarpPoint.js';
import EconomyManager from './EconomyManager.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import Starfield from './Starfield.js';
import TTSManager from './TTSManager.js';

const tts = new TTSManager();

// --- Setup ---
const urlParams = new URLSearchParams(window.location.search);
const renderer = new THREE.WebGLRenderer({
    antialias: true,
    //logarithmicDepthBuffer: true 
    reverseDepthBuffer: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000000);

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
sunLight.position.set(5, 3, 5);
scene.add(sunLight);

const timer = new THREE.Timer();
const thrusterMaterials = [];
let flightController = null;
let isStarted = false;

// --- Universe & Map ---
const universe = new UniverseManager("nebula-voyager-v1");
const starMap = new StarMap(renderer, universe);
let currentLatticePos = { ix: 0, iy: 0, iz: 0 };
let currentSector = universe.getSector(0, 0, 0);

starMap.onSectorSelected = (sector, path) => {
    const sidebar = document.getElementById('map-sidebar');
    const name = nameGen.getName(sector.seed, 'sector');
    sidebar.innerHTML = `
        <div style="font-size: 1.2rem; border-bottom: 1px solid #00ffaa; margin-bottom: 10px;">${name}</div>
        <div>GRID: [${sector.coords.ix}, ${sector.coords.iy}, ${sector.coords.iz}]</div>
        <div style="margin-top: 10px; color: #88ccff;">STATUS: ${universe.visitedSectors.has(sector.id) ? 'EXPLORED' : 'UNMAPPED'}</div>
        <div style="margin-top: 20px;">PATH STEPS: ${path.length > 0 ? path.length - 1 : 'N/A'}</div>
        ${path.length > 0 ? '<div style="color: #00ffaa; margin-top: 10px;">> COURSE PLOTTED</div>' : ''}
    `;
    sidebar.classList.remove('hidden');
};

// --- HUD & Generators ---
const hud = new HUD(scene, camera);
const planetGen = new PlanetGenerator(renderer);
const persistence = new PersistenceManager();
const nameGen = new NameGenerator();
const economy = new EconomyManager();
let shieldSystem = null;
let planets = [];
let lastSaveTime = 0;
let lastJumpTime = 0;
let lockedGateCoords = null; // Prevent immediate re-warp
const GATE_LOCKOUT_DIST = 1000;

let previewRenderer, previewScene, previewCamera, previewPlanet, previewClouds, uiPlanetGen;
function setupPlanetPreview() {
    const container = document.getElementById('planet-preview-container');
    if (!container || previewRenderer) return;

    previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    previewRenderer.setSize(200, 200);
    previewRenderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(previewRenderer.domElement);

    uiPlanetGen = new PlanetGenerator(previewRenderer);

    previewScene = new THREE.Scene();
    previewCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    previewCamera.position.z = 2.5;

    const light = new THREE.DirectionalLight(0xffffff, 2.5);
    light.position.set(5, 3, 5);
    previewScene.add(light);
    previewScene.add(new THREE.AmbientLight(0xffffff, 0.6));

    const geo = new THREE.SphereGeometry(1.2, 64, 64);
    const mat = new THREE.MeshBasicMaterial();
    previewPlanet = new THREE.Mesh(geo, mat);
    previewScene.add(previewPlanet);

    const cloudGeo = new THREE.SphereGeometry(1.23, 64, 64);
    const cloudMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95 });
    previewClouds = new THREE.Mesh(cloudGeo, cloudMat);
    previewScene.add(previewClouds);
}

// --- Cinematic Autopilot Camera ---
const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enabled = false;
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.05;
orbitControls.minDistance = 8;
orbitControls.maxDistance = 100;
orbitControls.enablePan = false;

const starfield = new Starfield(scene, 3000);

// --- Nebularity Background ---
const nebularity = new Nebularity({ THREE, renderer, scene });
let currentSeed = "game-init-seed";
nebularity.morph(currentSeed, { resolution: 1024 });

// --- Ship Loading ---
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

const loader = new GLTFLoader();
loader.setDRACOLoader(dracoLoader);


let shipLibrary = {}

loader.load('ship_stack.glb', async (gltf) => {
    // Find all potential ships in the stack
    const shipCandidates = [];
    gltf.scene.traverse(child => {
        if (child.name.startsWith('ship_')) {
            shipCandidates.push(child);
            child.position.set(0, 0, 0)
            child.updateMatrixWorld(true);
            child.userData.worldBounds = new THREE.Box3().setFromObject(child);
            shipLibrary[child.name.slice(5)] = child;
        }
    });

    if (shipCandidates.length === 0) {
        console.error("ShipStack: No meshes starting with 'ship_' found in ship_stack.glb");
        return;
    }

    // Pick a ship (for now we pick the first, or could pick based on a preference)
    const selectedShip = shipLibrary.freighter.clone(true);

    // Create a clean container for the player ship
    const ship = new THREE.Group();
    ship.add(selectedShip);

    ship.scale.multiplyScalar(0.3);
    ship.updateMatrixWorld(true);

    ship.traverse((child) => {
        if (child.isMesh && !child.name.startsWith('thruster')) {
            // PBR Shiny Metal for ship hull
            child.material.metalness = 1.0;
            child.material.roughness = 0.1;
            child.material.envMapIntensity = 20.5;
        }

        if (child.name.startsWith("thruster")) {
            const strength = (child.userData.strength && child.userData.strength.value !== undefined)
                ? child.userData.strength.value
                : 1.0;

            child.material = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: 0 },
                    uStrength: { value: strength },
                    uColor: { value: new THREE.Color(0x3366ff) }
                },
                vertexShader: `
                    uniform float uTime;
                    uniform float uStrength;
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        vec3 pos = position;
                        float noise = sin(uTime * 50.0 + vUv.x * 1230.0) * 0.1 * uStrength;
                        if (pos.y > 0.0) pos.y *= (uStrength + noise) * 20.;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                    }
                `,
                fragmentShader: `
                    varying vec2 vUv;
                    uniform vec3 uColor;
                    void main() {
                        float alpha = pow(1.0 - vUv.y, 2.0);
                        gl_FragColor = vec4(uColor * 5.0, alpha);
                    }
                `,
                transparent: true,
                blending: THREE.AdditiveBlending,
                side: THREE.DoubleSide,
                depthWrite: false,
            });
            thrusterMaterials.push(child.material);
            child.material.userData.baseStrength = strength;
        }
    });

    // Initial position before controller takes over
    ship.position.set(0, 0, 0);
    scene.add(ship);
    flightController = new FlightController(ship, camera);
    shieldSystem = new ShieldSystem(ship, scene);

    // Start lifecycle
    if (typeof initGame === 'function') {
        await initGame();
    }
    animate();
});

function trackTarget(pos, quaternion) {
    if (orbitControls && orbitControls.enabled) {
        camera.position.sub(orbitControls.target);
        orbitControls.target.copy(pos);
        camera.position.add(orbitControls.target);
        camera.up.set(0, 1, 0).applyQuaternion(quaternion);
        orbitControls.update();
    }
}

let warpPoints = [];

async function spawnPlanet(sector, fromWarp = false) {
    const seed = sector.seed;
    const rng = nameGen._getRNG(seed);

    // Clean up previous
    planets.forEach(p => {
        scene.remove(p);
        if (p.material.map) {
            if (p.material.map.userData.renderTarget) p.material.map.userData.renderTarget.dispose();
            p.material.map.dispose();
        }
        // Cleanup Clouds
        p.children.forEach(child => {
            if (child.material && child.material.map) {
                if (child.material.map.userData.renderTarget) child.material.map.userData.renderTarget.dispose();
                child.material.map.dispose();
            }
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        });
        p.geometry.dispose();
        p.material.dispose();
    });
    planets = [];

    warpPoints.forEach(wp => wp.dispose(scene));
    warpPoints = [];
    hud.pois = [];

    // 1. Generate Planets
    const isStartSystem = sector.coords.ix === 0 && sector.coords.iy === 0 && sector.coords.iz === 0;
    const planetCount = (isStartSystem && urlParams.get('dev') === '1') ? 10 : (rng() < 0.4 ? 1 : 0);

    for (let i = 0; i < planetCount; i++) {
        const pSeed = seed + "-" + i;
        const res = 2048;

        // 1. Surface
        const texture = await planetGen.generate(pSeed, { resolution: res });
        const radius = 500 + rng() * 1000;
        const geo = new THREE.SphereGeometry(radius, 64, 64);
        const mat = new THREE.MeshStandardMaterial({ map: texture, metalness: 0, roughness: 0.8 });
        const planet = new THREE.Mesh(geo, mat);

        // 2. Clouds
        const cloudTexture = await planetGen.generate(pSeed, { resolution: res / 2, mode: 'clouds', waterLevel: 0.2 });
        const cloudGeo = new THREE.SphereGeometry(radius * 1.015, 64, 64);
        const cloudMat = new THREE.MeshStandardMaterial({
            map: cloudTexture,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
        planet.add(cloudMesh);

        const dist = 5000 + rng() * 8000 + (i * 1000);
        const angle = rng() * Math.PI * 2;
        planet.position.set(Math.cos(angle) * dist, (rng() - 0.5) * 4000, Math.sin(angle) * dist);

        scene.add(planet);
        planets.push(planet);
        planet.userData.seed = pSeed;

        const planetName = nameGen.getName(pSeed, 'planet');
        hud.addTargetPOI(planet.position, planetName);
        if (i === 0 || planetCount < 5) {
            hud.addMessage(`SCANNER DETECTED: ${planetName}`);
        }
    }

    if (planetCount > 5) {
        hud.addMessage(`SCANNER DETECTED: ${planetCount} PLANETARY BODIES IN THIS CLUSTER.`);
    }

    // 2. Spawn Warp Points
    const neighbors = universe.getNeighbors(sector);
    const MIN_WP_DIST = 2000;
    const occupiedPositions = [];
    planets.forEach(p => occupiedPositions.push(p.position));

    neighbors.forEach((neighbor, i) => {
        let wpPos = new THREE.Vector3();
        let attempts = 0;
        let valid = false;

        while (attempts < 20 && !valid) {
            const dist = 4000 + rng() * 6000;
            const angle = (i / neighbors.length) * Math.PI * 2 + (rng() - 0.5) * 0.5;
            wpPos.set(Math.cos(angle) * dist, (rng() - 0.5) * 2000, Math.sin(angle) * dist);

            valid = true;
            for (const pos of occupiedPositions) {
                if (wpPos.distanceTo(pos) < MIN_WP_DIST) {
                    valid = false;
                    break;
                }
            }
            attempts++;
        }

        occupiedPositions.push(wpPos.clone());

        const wpName = `WARP NODE: ${nameGen.getName(neighbor.seed, 'sector')}`;
        const wp = new WarpPoint(scene, wpPos, seed, neighbor.seed, wpName, neighbor.coords);
        warpPoints.push(wp);
        hud.addTargetPOI(wpPos, wpName);

        // If emerging from this gate, position the ship here
        if (fromWarp && lockedGateCoords &&
            neighbor.coords.ix === lockedGateCoords.ix &&
            neighbor.coords.iy === lockedGateCoords.iy &&
            neighbor.coords.iz === lockedGateCoords.iz) {

            flightController.ship.position.copy(wpPos);
            // Point the ship away from the gate
            const dirAway = wpPos.clone().normalize().multiplyScalar(500);
            flightController.ship.position.add(dirAway);
            flightController.ship.lookAt(new THREE.Vector3(0, 0, 0));
            flightController.velocity.copy(dirAway.normalize().multiplyScalar(200));
        }
    });
}


// --- Game Lifecycle ---
async function initGame() {
    await tts.init(); // Initialize TTS model
    await persistence.init();
    const saved = await persistence.loadState();
    const resumeBtn = document.getElementById('resumeBtn');

    if (!saved) {
        resumeBtn.classList.add('disabled');
    }

    resumeBtn.addEventListener('click', async (e) => {
        e.target.blur();
        const savedData = await persistence.loadState();
        if (savedData) {
            await restoreState(savedData);
            isStarted = true;
            document.getElementById('overlay').classList.add('hidden');
            hud.show();
            hud.addMessage("MISSION RESUMED.");
            tts.speak("resumed.", { voice: 'af_river' });
            setupPlanetPreview();
        }
    });

    document.getElementById('startBtn').addEventListener('click', async (e) => {
        e.target.blur();
        const savedData = await persistence.loadState();
        if (savedData) {
            if (!confirm("Starting a new expedition will clear your existing save. Proceed?")) {
                return;
            }
            await persistence.clearState();
        }

        // Reset state for new game
        currentLatticePos = { ix: 0, iy: 0, iz: 0 };
        currentSector = universe.getSector(0, 0, 0);
        universe.visitedSectors.clear();
        universe.visitedSectors.add(currentSector.id);

        if (flightController) {
            flightController.ship.position.set(0, 0, 0);
            flightController.ship.quaternion.set(0, 0, 0, 1);
            flightController.velocity.set(0, 0, 0);
            flightController.charge = 100;
            flightController.autopilot = false;
            flightController.cameraLocked = false;
        }

        starMap.plannedPath = [];
        starMap.selectedSector = null;
        document.getElementById('map-sidebar').classList.add('hidden');

        spawnPlanet(currentSector);
        nebularity.morph(currentSector.seed, { resolution: 1024 });

        isStarted = true;
        document.getElementById('overlay').classList.add('hidden');
        resumeBtn.classList.remove('disabled');
        hud.show();
        hud.addMessage("SYSTEMS ONLINE. NEW EXPEDITION INITIALIZED.");
        tts.speak("...;", { voice: 'af_river' });
        tts.speak("Nebula Drift.", { voice: 'af_river' });
        setupPlanetPreview();
    });

    if (urlParams.get('dev') === '1') {
        const savedData = await persistence.loadState();
        if (savedData && savedData.latticePos) {
            await restoreState(savedData);
            isStarted = true;
            document.getElementById('overlay').classList.add('hidden');
            hud.show();
            hud.addMessage("DEV MODE: AUTO-RESUMING LAST SESSION...");
        } else {
            document.getElementById('startBtn').click();
        }
    }
}

// --- Market UI Logic ---
document.getElementById('closeMarket').addEventListener('click', () => {
    document.getElementById('market-ui').classList.remove('active');
    if (flightController) flightController.mouse.isLocked = false;
});

function openMarket() {
    // Disable mouse look when opening market
    if (flightController && flightController.mouseLookEnabled) {
        flightController.mouseLookEnabled = false;
        if (document.pointerLockElement) document.exitPointerLock();
    }

    const ui = document.getElementById('market-ui');
    const list = document.getElementById('market-list');
    const creditDisplay = document.getElementById('market-credits');

    const prices = economy.getMarketPrices(currentSector.seed);
    creditDisplay.innerText = `${economy.credits.toLocaleString()} CR`;

    list.innerHTML = economy.commodities.map(item => {
        const p = prices[item.id];
        const invQty = economy.inventory.get(item.id) || 0;
        return `
            <div class="market-row">
                <div>
                    <div style="color: #fff; font-size: 0.9rem;">${item.name}</div>
                    <div style="font-size: 0.7rem; opacity: 0.5;">IN CARGO: ${invQty}</div>
                </div>
                <div style="display: flex; gap: 10px; align-items: center;">
                    <div style="text-align: right; min-width: 80px;">
                        <div style="color: #ffcc00; font-size: 0.8rem;">${p.buyPrice} CR</div>
                        <button class="market-btn" onclick="window.marketAction('buy', '${item.id}', ${p.buyPrice})">BUY</button>
                    </div>
                    <div style="text-align: right; min-width: 80px;">
                        <div style="color: #00ffaa; font-size: 0.8rem;">${p.sellPrice} CR</div>
                        <button class="market-btn" onclick="window.marketAction('sell', '${item.id}', ${p.sellPrice})" ${invQty === 0 ? 'disabled' : ''}>SELL</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Update Preview
    let nearestPlanet = null;
    let minDist = 1000000;
    planets.forEach(p => {
        const d = flightController.ship.position.distanceTo(p.position);
        if (d < minDist) {
            minDist = d;
            nearestPlanet = p;
        }
    });

    if (!previewPlanet) setupPlanetPreview();

    if (nearestPlanet && previewPlanet && uiPlanetGen) {
        // We MUST generate it again in the UI renderer's context!
        const uiTexture = uiPlanetGen.generate(nearestPlanet.userData.seed, { resolution: 1024 });
        previewPlanet.material.map = uiTexture;
        previewPlanet.material.needsUpdate = true;

        if (previewClouds) {
            const uiCloudTexture = uiPlanetGen.generate(nearestPlanet.userData.seed, { resolution: 512, mode: 'clouds', waterLevel: 0.2 });
            previewClouds.material.map = uiCloudTexture;
            previewClouds.material.needsUpdate = true;
        }
    }

    ui.classList.add('active');
    if (document.pointerLockElement) document.exitPointerLock();
}

window.marketAction = (action, itemId, price) => {
    if (action === 'buy') {
        if (economy.buy(itemId, 1, price)) {
            hud.addMessage(`PURCHASED 1 UNIT OF ${itemId.toUpperCase()}.`);
        } else {
            hud.addMessage(`INSUFFICIENT CREDITS.`);
        }
    } else {
        if (economy.sell(itemId, 1, price)) {
            hud.addMessage(`SOLD 1 UNIT OF ${itemId.toUpperCase()}.`);
        }
    }
    openMarket(); // Refresh UI
};

async function restoreState(saved) {
    currentLatticePos = saved.latticePos || { ix: 0, iy: 0, iz: 0 };
    currentSector = universe.getSector(currentLatticePos.ix, currentLatticePos.iy, currentLatticePos.iz);

    if (saved.visitedSectors) {
        saved.visitedSectors.forEach(id => universe.visitedSectors.add(id));
    }
    universe.visitedSectors.add(currentSector.id);

    if (saved.position) flightController.ship.position.copy(saved.position);
    if (saved.quaternion) flightController.ship.quaternion.copy(saved.quaternion);
    if (saved.velocity) flightController.velocity.copy(saved.velocity);
    if (saved.rotationVelocity) flightController.rotationVelocity.copy(saved.rotationVelocity);
    if (saved.throttle) flightController.throttle.copy(saved.throttle);

    if (saved.plannedPath && saved.plannedPath.length > 0) {
        starMap.plannedPath = saved.plannedPath.map(coords => universe.getSector(coords.ix, coords.iy, coords.iz));
        if (saved.selectedSectorId) {
            starMap.selectedSector = universe.sectors.get(saved.selectedSectorId);
        }
        starMap.onSectorSelected(starMap.selectedSector, starMap.plannedPath);
    }

    if (saved.economy) economy.restoreState(saved.economy);

    nebularity.morph(currentSector.seed, { resolution: 1024 });
    await spawnPlanet(currentSector);

    if (saved.autopilot !== undefined) flightController.autopilot = saved.autopilot;
    if (saved.autopilotTarget) {
        flightController.autopilotTarget = new THREE.Vector3(saved.autopilotTarget.x, saved.autopilotTarget.y, saved.autopilotTarget.z);
    }
    if (saved.cameraLocked !== undefined) {
        flightController.cameraLocked = saved.cameraLocked;
        orbitControls.enabled = flightController.cameraLocked;
        if (saved.orbitTarget) orbitControls.target.set(saved.orbitTarget.x, saved.orbitTarget.y, saved.orbitTarget.z);
        if (saved.cameraPosition) camera.position.set(saved.cameraPosition.x, saved.cameraPosition.y, saved.cameraPosition.z);
        orbitControls.update();
    }
}

function followTarget(targetPoint) {
    orbitControls.target.copy(targetPoint);
    orbitControls.update();
}

function animate(time) {
    requestAnimationFrame(animate);
    renderer.clear(); // Manual clear to support multi-pass rendering

    timer.update(time);
    let delta = timer.getDelta();
    if (delta > 0.1) delta = 0.1; // Cap delta to prevent skips after long async loads
    const elapsed = timer.getElapsed();

    nebularity.update(delta);

    // Update Market Preview
    const marketUI = document.getElementById('market-ui');
    if (marketUI && marketUI.classList.contains('active') && previewRenderer) {
        previewPlanet.rotation.y += delta * 0.1;
        if (previewClouds) previewClouds.rotation.y += delta * 0.15;
        previewRenderer.render(previewScene, previewCamera);
    }

    // Rotate world planets and clouds
    planets.forEach(p => {
        p.rotation.y += delta * 0.05;
        p.children.forEach(child => {
            child.rotation.y += delta * 0.03;
        });
    });

    // Background Sim (Attract Mode / Map Unpaused)
    if (flightController) {
        // Dim controls if menu is up
        const menuUp = !document.getElementById('overlay').classList.contains('hidden');
        if (menuUp) {
            // Reduce or disable input processing while in menu if desired
        }

        let nearestP = null;
        let minDist = 1000000;
        planets.forEach(p => {
            const d = flightController.ship.position.distanceTo(p.position);
            if (d < minDist) {
                minDist = d;
                nearestP = p;
            }
        });

        flightController.update(delta, {
            nearestPlanetDist: minDist,
            atmosphereThreshold: 3000,
            nearestPlanetDir: nearestP ? nearestP.position.clone().sub(flightController.ship.position).normalize() : null
        });

        // 2. Update Camera AFTER all physics are settled
        if (flightController.cameraLocked) {
            trackTarget(flightController.ship.position, flightController.ship.quaternion);
        } else {
            flightController.updateCamera(delta);
        }

        // Update Warp Points
        warpPoints.forEach(async wp => {
            wp.isCourseTarget = false;
            if (starMap.plannedPath.length > 1) {
                const nextSector = starMap.plannedPath[1];
                if (wp.targetLatticePos.ix === nextSector.coords.ix &&
                    wp.targetLatticePos.iy === nextSector.coords.iy &&
                    wp.targetLatticePos.iz === nextSector.coords.iz) {
                    wp.isCourseTarget = true;
                }
            }
            wp.mesh.userData.isCourseTarget = wp.isCourseTarget;
            if (wp.isCourseTarget && flightController.autopilot) {
                flightController.autopilotTarget = wp.position;
            }

            wp.update(elapsed, camera);

            // Only trigger jumps if game has started and not in cooldown
            const distToWP = flightController.ship.position.distanceTo(wp.position);
            const isLocked = lockedGateCoords &&
                wp.targetLatticePos.ix === lockedGateCoords.ix &&
                wp.targetLatticePos.iy === lockedGateCoords.iy &&
                wp.targetLatticePos.iz === lockedGateCoords.iz &&
                distToWP < GATE_LOCKOUT_DIST;

            // Autopilot safety: If autopilot is ON, ONLY trigger if this is the correct target
            const canTrigger = !flightController.autopilot || wp.isCourseTarget;

            if (isStarted && (time - lastJumpTime > 3000) && distToWP < 400 && !isLocked && canTrigger) {
                lastJumpTime = time;
                const isCorrectTarget = wp.isCourseTarget;

                const oldLatticePos = { ...currentLatticePos };
                currentLatticePos = wp.targetLatticePos;
                lockedGateCoords = oldLatticePos; // Lock the return gate

                currentSector = universe.getSector(currentLatticePos.ix, currentLatticePos.iy, currentLatticePos.iz);
                universe.visitedSectors.add(currentSector.id);

                // Prevent double triggers by clearing immediately
                warpPoints.forEach(p => p.dispose(scene));
                warpPoints = [];
                hud.pois = [];

                if (starMap.plannedPath.length > 1 && isCorrectTarget) {
                    starMap.plannedPath.shift();
                    if (starMap.plannedPath.length <= 1) {
                        starMap.selectedSector = null;
                        starMap.plannedPath = [];
                        flightController.autopilot = false;
                        flightController.cameraLocked = false;
                        flightController.autopilotTarget = null;
                        flightController.throttle.set(0, 0, 0);
                        flightController.isHyperThrusting = false;
                        document.getElementById('map-sidebar').classList.add('hidden');
                        hud.addMessage("COURSE COMPLETE. DESTINATION REACHED.");
                    } else {
                        starMap.onSectorSelected(starMap.selectedSector, starMap.plannedPath);
                    }
                } else if (!isCorrectTarget) {
                    if (flightController.autopilot && starMap.selectedSector) {
                        hud.addMessage("OFF COURSE. RE-CALCULATING PATH TO DESTINATION...");
                        starMap.currentSectorOrigin = currentSector;
                        starMap.calculatePath(); // Re-calculate from new position

                        // If we couldn't find a path from here, then we give up
                        if (starMap.plannedPath.length <= 1) {
                            hud.addMessage("AUTOPILOT ERROR: DESTINATION UNREACHABLE FROM CURRENT NODE.");
                            flightController.autopilot = false;
                            flightController.cameraLocked = false;
                        }
                    } else {
                        starMap.plannedPath = [];
                        starMap.selectedSector = null;
                        flightController.autopilot = false;
                        flightController.cameraLocked = false;
                        document.getElementById('map-sidebar').classList.add('hidden');
                    }
                }

                const transDuration = 12.0;
                nebularity.morph(currentSector.seed, { duration: transDuration });
                flightController.triggerWarp(transDuration);
                hud.addMessage(`INITIATING HYPERSPACE JUMP...`);
                hud.addMessage(`TRANSITIONING TO NODE: ${currentSector.id.toUpperCase()}...`);

                const sectorName = nameGen.getName(currentSector.seed, 'sector');

                // Start voice-over in background to mask the journey
                (async () => {
                    await tts.speak(`Entering ${sectorName}.`, { voice: 'af_alloy', speed: 1 });
                    const attr = currentSector.attributes;
                    const summary = `Luminosity; ${attr.luminosity}. Stability; ${attr.stability}. Resource density; ${attr.resources}.`;
                    await tts.speak(summary, { voice: 'af_river', speed: 1 });
                })();

                await spawnPlanet(currentSector, true);

                if (flightController.autopilot) {
                    flightController.autopilotTarget = null;
                    if (starMap.plannedPath.length > 1) {
                        const nextSector = starMap.plannedPath[1];
                        const nextWP = warpPoints.find(wp =>
                            wp.targetLatticePos.ix === nextSector.coords.ix &&
                            wp.targetLatticePos.iy === nextSector.coords.iy &&
                            wp.targetLatticePos.iz === nextSector.coords.iz
                        );
                        if (nextWP) flightController.autopilotTarget = nextWP.position;
                    }
                }

                starMap.refresh(currentSector);
            }
        });

        const targets = [];
        planets.forEach(p => targets.push(p));
        warpPoints.forEach(wp => targets.push(wp.mesh));

        const sectorName = nameGen.getName(currentSector.seed, 'sector');

        hud.update(delta, {
            thrust: flightController.thrustInput,
            speed: flightController.velocity.length(),
            charge: flightController.charge,
            seed: sectorName,
            position: flightController.ship.position,
            ship: flightController.ship,
            targets: targets,
            economy: economy.getState()
        });

        if (starfield) {
            const warpFactor = flightController.warpTime > 0 ? Math.sin((flightController.warpTime / flightController.warpDuration) * Math.PI) : 0;
            starfield.update(delta, camera.position, flightController.velocity, warpFactor);
        }

        if (shieldSystem) {
            shieldSystem.update(delta, elapsed, {
                thrust: flightController.thrustInput,
                speed: flightController.velocity.length(),
                nearestPlanetDist: minDist - (nearestP ? nearestP.geometry.parameters.radius * 0.1 : 0),
                atmosphereThreshold: 2000,
                nearestPlanetPos: nearestP ? nearestP.position : null,
                planetRadius: nearestP ? nearestP.geometry.parameters.radius : 0
            });
        }

        const thrustVal = flightController.thrustInput;
        thrusterMaterials.forEach(m => {
            m.uniforms.uTime.value = elapsed;
            m.uniforms.uStrength.value = m.userData.baseStrength * (0.2 + thrustVal * 0.8);
        });

        if (isStarted && time - lastSaveTime > 2000) {
            lastSaveTime = time;
            persistence.saveState({
                latticePos: currentLatticePos,
                position: { x: flightController.ship.position.x, y: flightController.ship.position.y, z: flightController.ship.position.z },
                quaternion: { x: flightController.ship.quaternion.x, y: flightController.ship.quaternion.y, z: flightController.ship.quaternion.z, w: flightController.ship.quaternion.w },
                velocity: { x: flightController.velocity.x, y: flightController.velocity.y, z: flightController.velocity.z },
                rotationVelocity: { x: flightController.rotationVelocity.x, y: flightController.rotationVelocity.y, z: flightController.rotationVelocity.z },
                throttle: { x: flightController.throttle.x, y: flightController.throttle.y, z: flightController.throttle.z },
                plannedPath: starMap.plannedPath.map(s => s.coords),
                selectedSectorId: starMap.selectedSector ? starMap.selectedSector.id : null,
                visitedSectors: Array.from(universe.visitedSectors) || [],
                economy: economy.getState(),
                autopilot: flightController.autopilot,
                autopilotTarget: flightController.autopilotTarget ? { x: flightController.autopilotTarget.x, y: flightController.autopilotTarget.y, z: flightController.autopilotTarget.z } : null,
                cameraLocked: flightController.cameraLocked,
                cameraPosition: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
                orbitTarget: { x: orbitControls.target.x, y: orbitControls.target.y, z: orbitControls.target.z }
            });
        }
    }
    renderer.render(scene, camera);
    if (starMap.visible) {
        starMap.update(delta);
        starMap.render(renderer);
    }
}

window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (starMap && starMap.camera) {
        starMap.camera.aspect = w / h;
        starMap.camera.updateProjectionMatrix();
    }
    renderer.setSize(w, h);
    if (hud) hud.resize(w, h);
});

window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
        let handled = false;

        // Close Market if open
        const marketUI = document.getElementById('market-ui');
        if (marketUI && marketUI.classList.contains('active')) {
            marketUI.classList.remove('active');
            if (flightController) flightController.mouse.isLocked = false;
            handled = true;
        }

        // Close Star Map if open
        if (starMap && starMap.visible) {
            starMap.hide();
            handled = true;
        }

        // Only toggle main menu if nothing else was handled
        if (!handled) {
            document.getElementById('overlay').classList.toggle('hidden');
        }
        return;
    }

    if (!isStarted) return;

    if (e.code === 'KeyU') { // Universal Jump
        currentLatticePos = {
            ix: Math.floor((Math.random() - 0.5) * 100),
            iy: Math.floor((Math.random() - 0.5) * 100),
            iz: Math.floor((Math.random() - 0.5) * 100)
        };
        currentSector = universe.getSector(currentLatticePos.ix, currentLatticePos.iy, currentLatticePos.iz);
        universe.visitedSectors.add(currentSector.id);
        nebularity.morph(currentSector.seed, { duration: 2.0 });
        if (flightController) flightController.triggerWarp(2.0);
        hud.addMessage(`INITIATING BLIND JUMP...`);
        setTimeout(() => spawnPlanet(currentSector), 1000);
    }

    if (e.code === 'Tab') {
        e.preventDefault();
        if (starMap.visible) {
            starMap.hide();
            window.isStarMapVisible = false;
        } else {
            starMap.show(currentSector);
            window.isStarMapVisible = true;
            // Disable mouse look when opening map
            if (flightController && flightController.mouseLookEnabled) {
                flightController.mouseLookEnabled = false;
                if (document.pointerLockElement) document.exitPointerLock();
            }
        }
    }

    if (e.code === 'KeyP') { // Autopilot Toggle
        if (flightController) {
            // Re-path if current position doesn't match path start
            if (starMap.selectedSector && (!starMap.plannedPath[0] || starMap.plannedPath[0].id !== currentSector.id)) {
                console.log("Autopilot: Re-pathing from current sector...");
                starMap.currentSectorOrigin = currentSector;
                starMap.calculatePath();
            }

            if (starMap.plannedPath.length <= 1) {
                hud.addMessage("AUTOPILOT ERROR: NO COURSE PLOTTED.");
            } else {
                const nextSector = starMap.plannedPath[1];
                const targetWP = warpPoints.find(wp =>
                    wp.targetLatticePos.ix === nextSector.coords.ix &&
                    wp.targetLatticePos.iy === nextSector.coords.iy &&
                    wp.targetLatticePos.iz === nextSector.coords.iz
                );

                if (targetWP) {
                    flightController.autopilot = !flightController.autopilot;
                    flightController.autopilotTarget = targetWP.position;

                    // Toggle Cinematic Camera
                    flightController.cameraLocked = flightController.autopilot;
                    orbitControls.enabled = flightController.autopilot;
                    if (orbitControls.enabled) {
                        trackTarget(flightController.ship.position, flightController.ship.quaternion);
                        orbitControls.update();
                    }

                    hud.addMessage(flightController.autopilot ? "AUTOPILOT ENGAGED. ENTERING EXTERNAL VIEW." : "AUTOPILOT OFFLINE. MANUAL CONTROL.");
                } else {
                    // Try to re-path automatically
                    const destination = starMap.plannedPath[starMap.plannedPath.length - 1];
                    hud.addMessage("OFF COURSE. ATTEMPTING TO RE-PLOT DESTINATION...");

                    starMap.currentSectorOrigin = currentSector;
                    starMap.selectedSector = destination;
                    starMap.calculatePath();

                    if (starMap.plannedPath.length > 1) {
                        const newNext = starMap.plannedPath[1];
                        // Ensure links exist for the new current sector
                        universe.generateLinks(currentSector);

                        const newTargetWP = warpPoints.find(wp =>
                            wp.targetLatticePos.ix === newNext.coords.ix &&
                            wp.targetLatticePos.iy === newNext.coords.iy &&
                            wp.targetLatticePos.iz === newNext.coords.iz
                        );

                        if (newTargetWP) {
                            flightController.autopilot = true;
                            flightController.autopilotTarget = newTargetWP.position;
                            flightController.cameraLocked = true;
                            orbitControls.enabled = true;
                            trackTarget(flightController.ship.position, flightController.ship.quaternion);
                            orbitControls.update();
                            hud.addMessage("NEW COURSE PLOTTED. AUTOPILOT ENGAGED.");
                        } else {
                            hud.addMessage("AUTOPILOT ERROR: WARP POINT MISMATCH. MANUAL RECOVERY REQUIRED.");
                            flightController.autopilot = false;
                        }
                    } else {
                        hud.addMessage("AUTOPILOT ERROR: DESTINATION UNREACHABLE FROM CURRENT NODE.");
                        flightController.autopilot = false;
                    }
                }
            }
        }
    }

    if (e.code === 'KeyB') { // Docking / Market
        let nearestPlanet = null;
        let minDist = 1000000;

        planets.forEach(p => {
            const d = flightController.ship.position.distanceTo(p.position);
            if (d < minDist) {
                minDist = d;
                nearestPlanet = p;
            }
        });

        const planetRadius = nearestPlanet ? nearestPlanet.geometry.parameters.radius : 0;
        if (nearestPlanet && minDist < planetRadius + 1000) {
            openMarket();
        } else {
            hud.addMessage("DOCKING FAILED. TOO FAR FROM PLANET SURFACE.");
        }
    }

    if (e.code === 'KeyM') { // Mouse Look Toggle
        if (flightController) {
            flightController.mouseLookEnabled = !flightController.mouseLookEnabled;
            hud.addMessage(flightController.mouseLookEnabled ? "MOUSE LOOK ENABLED. CLICK TO ENGAGE." : "MOUSE LOOK DISABLED.");
            if (!flightController.mouseLookEnabled && document.pointerLockElement) {
                document.exitPointerLock();
            }
        }
    }
    if (e.code === 'KeyK' && urlParams.get('dev') === '1') { // Dev: Random Warp
        const neighbors = universe.getNeighbors(currentSector);
        const randomNeighbor = neighbors[Math.floor(Math.random() * neighbors.length)];

        currentLatticePos = randomNeighbor.coords;
        currentSector = randomNeighbor;
        universe.visitedSectors.add(currentSector.id);

        nebularity.morph(currentSector.seed, { duration: 1.0 });
        flightController.triggerWarp(1.0);
        spawnPlanet(currentSector, true);
        starMap.refresh(currentSector);
        hud.addMessage(`DEV: JUMPED TO ${currentSector.id}`);
    }
});
