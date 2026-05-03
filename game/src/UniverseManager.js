import * as THREE from 'three';

/**
 * UniverseManager: Handles the procedural generation of the galactic lattice.
 * Each sector is a perturbed point in a 3D grid.
 */
export default class UniverseManager {
    constructor(globalSeed = "nebula-drift-v1") {
        this.globalSeed = globalSeed;
        this.sectors = new Map();
        this.visitedSectors = new Set();
        this.spacing = 10000; // Distance between lattice points in "Star Map Units"
    }

    /**
     * Get or generate a sector at lattice coordinates (ix, iy, iz)
     */
    getSector(ix, iy, iz) {
        const key = `${ix},${iy},${iz}`;
        if (this.sectors.has(key)) return this.sectors.get(key);

        const seedStr = `${this.globalSeed}-${key}`;
        const rng = this._getRNG(seedStr);

        // Perturb the position within the cell
        const pos = new THREE.Vector3(
            (ix + (rng() - 0.5) * 0.8) * this.spacing,
            (iy + (rng() - 0.5) * 0.8) * this.spacing,
            (iz + (rng() - 0.5) * 0.8) * this.spacing
        );

        const sector = {
            id: key,
            coords: { ix, iy, iz },
            pos: pos,
            seed: Math.floor(rng() * 0xFFFFFF).toString(16),
            name: "UNEXPLORED", // Will be filled by NameGenerator when visited
            links: [] // Connections to neighboring sectors
        };

        this.sectors.set(key, sector);
        return sector;
    }

    /**
     * Generate links between a sector and its immediate neighbors
     */
    generateLinks(sector) {
        if (sector.links.length > 0) return;

        const { ix, iy, iz } = sector.coords;
        // Check 6 cardinal neighbors
        const neighbors = [
            [1, 0, 0], [-1, 0, 0],
            [0, 1, 0], [0, -1, 0],
            [0, 0, 1], [0, 0, -1]
        ];

        neighbors.forEach(([dx, dy, dz]) => {
            // 70% chance of a link existing
            const rng = this._getRNG(`${this.globalSeed}-link-${ix},${iy},${iz}-${dx},${dy},${dz}`);
            if (rng() < 0.7) {
                const neighbor = this.getSector(ix + dx, iy + dy, iz + dz);
                sector.links.push(neighbor.id);
                // Bi-directional link
                if (!neighbor.links.includes(sector.id)) {
                    neighbor.links.push(sector.id);
                }
            }
        });
    }

    getNeighbors(sector) {
        this.generateLinks(sector);
        return sector.links.map(id => this.sectors.get(id));
    }

    _getRNG(seedStr) {
        let hash = 0;
        for (let i = 0; i < seedStr.length; i++) hash = (hash << 5) - hash + seedStr.charCodeAt(i);
        return () => {
            hash = (hash * 1664525 + 1013904223) % 4294967296;
            return Math.abs(hash / 4294967296);
        };
    }
}
