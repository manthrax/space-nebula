import * as THREE from 'three';
import WarpPoint from './WarpPoint.js';

export default class SectorManager {
    constructor(deps) {
        this.scene = deps.scene;
        this.universe = deps.universe;
        this.hud = deps.hud;
        this.planetGen = deps.planetGen;
        this.nameGen = deps.nameGen;
        
        this.planets = [];
        this.warpPoints = [];
        this.lockedGateCoords = null;
        this.GATE_LOCKOUT_DIST = 300; // Smaller than spawn distance (500) to allow immediate return
        this.urlParams = new URLSearchParams(window.location.search);
        
        this.flightController = null; // Set later after ship is loaded
    }

    setFlightController(fc) {
        this.flightController = fc;
    }

    async spawn(sector, fromWarp = false) {
        const seed = sector.seed;
        const rng = this.nameGen._getRNG(seed);

        // Clean up previous
        this.planets.forEach(p => {
            this.scene.remove(p);
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
        this.planets = [];

        this.warpPoints.forEach(wp => wp.dispose(this.scene));
        this.warpPoints = [];
        this.hud.pois = [];

        // 1. Generate Planets
        const isStartSystem = sector.coords.ix === 0 && sector.coords.iy === 0 && sector.coords.iz === 0;
        const planetCount = (isStartSystem && this.urlParams.get('dev') === '1') ? 10 : sector.planetCount;

        for (let i = 0; i < planetCount; i++) {
            const pSeed = seed + "-" + i;
            const res = 2048;

            // 1. Surface
            const texture = await this.planetGen.generate(pSeed, { resolution: res });
            const radius = 500 + rng() * 1000;
            const geo = new THREE.SphereGeometry(radius, 64, 64);
            const mat = new THREE.MeshStandardMaterial({ map: texture, metalness: 0, roughness: 0.8 });
            const planet = new THREE.Mesh(geo, mat);

            // 2. Clouds
            const cloudTexture = await this.planetGen.generate(pSeed, { resolution: res / 2, mode: 'clouds', waterLevel: 0.2 });
            const cloudGeo = new THREE.SphereGeometry(radius * 1.015, 64, 64);
            const cloudMat = new THREE.MeshStandardMaterial({
                map: cloudTexture,
                transparent: true,
                opacity: 0.9,
                depthWrite: false,
                side: THREE.DoubleSide,
                polygonOffset: true,
                polygonOffsetFactor: -4,
                polygonOffsetUnits: -4
            });
            const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
            planet.add(cloudMesh);

            const dist = 5000 + rng() * 8000 + (i * 1000);
            const angle = rng() * Math.PI * 2;
            planet.position.set(Math.cos(angle) * dist, (rng() - 0.5) * 4000, Math.sin(angle) * dist);

            this.scene.add(planet);
            this.planets.push(planet);
            planet.userData.seed = pSeed;
            planet.userData.type = 'planet';

            const planetName = this.nameGen.getName(pSeed, 'planet');
            this.hud.addTargetPOI(planet.position, planetName);
            if (i === 0 || planetCount < 5) {
                this.hud.addMessage(`SCANNER DETECTED: ${planetName}`);
            }
        }

        if (planetCount > 5) {
            this.hud.addMessage(`SCANNER DETECTED: ${planetCount} PLANETARY BODIES IN THIS CLUSTER.`);
        }

        // 2. Spawn Warp Points
        const neighbors = this.universe.getNeighbors(sector);
        const MIN_WP_DIST = 2000;
        const occupiedPositions = [];
        this.planets.forEach(p => occupiedPositions.push(p.position));

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

            const wpName = `WARP NODE: ${this.nameGen.getName(neighbor.seed, 'sector')}`;
            const wp = new WarpPoint(this.scene, wpPos, seed, neighbor.seed, wpName, neighbor.coords);
            this.warpPoints.push(wp);
            this.hud.addTargetPOI(wpPos, wpName);

            // If emerging from this gate, position the ship here
            if (fromWarp && this.lockedGateCoords && this.flightController &&
                neighbor.coords.ix === this.lockedGateCoords.ix &&
                neighbor.coords.iy === this.lockedGateCoords.iy &&
                neighbor.coords.iz === this.lockedGateCoords.iz) {

                this.flightController.ship.position.copy(wpPos);
                // Point the ship away from the gate
                const dirAway = wpPos.clone().normalize().multiplyScalar(500);
                this.flightController.ship.position.add(dirAway);
                this.flightController.ship.lookAt(new THREE.Vector3(0, 0, 0));
                this.flightController.velocity.copy(dirAway.normalize().multiplyScalar(200));
            }
        });

        // 3. Spawn Ambient NPC Ships
        const shipCount = 2 + Math.floor(rng() * 3);
        for (let i = 0; i < shipCount; i++) {
            // Clone the ship mesh if possible, or create a simple proxy
            if (this.flightController && this.flightController.ship) {
                const shipMesh = this.flightController.ship.children[0].clone(true);
                const dist = 3000 + rng() * 5000;
                const angle = rng() * Math.PI * 2;
                shipMesh.position.set(Math.cos(angle) * dist, (rng() - 0.5) * 3000, Math.sin(angle) * dist);
                shipMesh.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
                shipMesh.userData.type = 'ship';
                this.scene.add(shipMesh);
                this.planets.push(shipMesh); // Add to planets array for cleanup convenience

                // Randomly name some of them
                if (rng() < 0.3) {
                    const npcName = "VESSEL: " + this.nameGen.getName(seed + "-npc-" + i, 'sector');
                    this.hud.addTargetPOI(shipMesh.position, npcName);
                }
            }
        }
    }

    updateRotations(delta) {
        this.planets.forEach(p => {
            if (p.userData.type !== 'planet') return;
            p.rotation.y += delta * 0.05;
            p.children.forEach(child => {
                if (child.isMesh) child.rotation.y += delta * 0.03;
            });
        });
    }
}
