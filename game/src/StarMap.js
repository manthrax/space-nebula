import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

/**
 * StarMap: Renders a 3D navigational overlay of the discovered galaxy.
 */
export default class StarMap {
    constructor(renderer, universe) {
        this.renderer = renderer;
        this.universe = universe;
        this.visible = false;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100000);
        
        this.container = new THREE.Group();
        this.scene.add(this.container);

        // Map Materials (Retro Tactical Palette)
        this.nodeMat = new THREE.MeshBasicMaterial({ color: 0x224466, toneMapped: false, blending: THREE.AdditiveBlending }); // Dim Blue (Unvisited)
        this.visitedMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, toneMapped: false, blending: THREE.AdditiveBlending }); // Amber (Explored)
        this.currentMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, blending: THREE.AdditiveBlending }); // White (Current)
        this.selectedMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa, toneMapped: false, blending: THREE.AdditiveBlending }); // Lime (Selected/Path)
        this.lineMat = new THREE.LineBasicMaterial({ color: 0x224466, transparent: true, opacity: 0.5, toneMapped: false, blending: THREE.AdditiveBlending });
        this.pathMat = new THREE.LineBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 1.0, toneMapped: false, blending: THREE.AdditiveBlending });

        this.nodeGeo = new THREE.SphereGeometry(150, 8, 8);
        this.nodes = []; // Array for raycasting

        // Interaction
        this.controls = new OrbitControls(this.camera, renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.enabled = false;

        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        this.selectedSector = null;
        this.plannedPath = [];
        this.onSectorSelected = null; // Callback for UI

        // Dimming Background
        const dimGeo = new THREE.PlaneGeometry(1000, 1000);
        const dimMat = new THREE.MeshBasicMaterial({ color: 0x00050a, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false, toneMapped: false });
        this.dimmer = new THREE.Mesh(dimGeo, dimMat);
        this.dimmer.renderOrder = -1;
        this.scene.add(this.dimmer);

        this.container.renderOrder = 1;

        window.addEventListener('mousedown', (e) => this.onMouseDown(e));
    }

    onMouseDown(event) {
        if (!this.visible) return;
        
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.nodes);

        if (intersects.length > 0) {
            const sector = intersects[0].object.userData.sector;
            this.selectSector(sector);
        }
    }

    selectSector(sector) {
        this.selectedSector = sector;
        this.calculatePath();
        this.refresh(this.currentSectorOrigin);
        if (this.onSectorSelected) this.onSectorSelected(sector, this.plannedPath);
    }

    calculatePath() {
        if (!this.selectedSector || !this.currentSectorOrigin) {
            this.plannedPath = [];
            return;
        }

        // Simple BFS for pathfinding in the lattice
        const queue = [[this.currentSectorOrigin]];
        const visited = new Set([this.currentSectorOrigin.id]);

        while (queue.length > 0) {
            const path = queue.shift();
            const last = path[path.length - 1];

            if (last.id === this.selectedSector.id) {
                this.plannedPath = path;
                return;
            }

            const neighbors = this.universe.getNeighbors(last);
            for (let n of neighbors) {
                if (!visited.has(n.id)) {
                    visited.add(n.id);
                    queue.push([...path, n]);
                }
            }
            
            if (queue.length > 1000) break; // Limit search
        }
        this.plannedPath = [];
    }

    show(currentSector) {
        this.currentSectorOrigin = currentSector;
        this.visible = true;
        this.controls.enabled = true;
        this.refresh(currentSector);
        
        // Focus on current sector
        this.camera.position.copy(currentSector.pos).add(new THREE.Vector3(0, 5000, 10000));
        this.controls.target.copy(currentSector.pos);
        this.controls.update();

        // Position dimmer
        this.dimmer.scale.set(100, 100, 1);
    }

    hide() {
        this.visible = false;
        this.controls.enabled = false;
        document.getElementById('map-sidebar').classList.add('hidden');
    }

    refresh(currentSector) {
        this.currentSectorOrigin = currentSector;
        while (this.container.children.length > 0) {
            const child = this.container.children[0];
            if (child.geometry) child.geometry.dispose();
            this.container.remove(child);
        }
        this.nodes = [];

        const { ix, iy, iz } = currentSector.coords;
        const range = 5;

        const linePositions = [];
        const pathLinePositions = [];

        for (let x = ix - range; x <= ix + range; x++) {
            for (let y = iy - range; y <= iy + range; y++) {
                for (let z = iz - range; z <= iz + range; z++) {
                    const s = this.universe.getSector(x, y, z);
                    this.universe.generateLinks(s);

                    // Determine node material
                    let mat = this.nodeMat;
                    const isPartOfPath = this.plannedPath.some(p => p.id === s.id);

                    if (s.id === currentSector.id) mat = this.currentMat;
                    else if (isPartOfPath) mat = this.selectedMat;
                    else if (this.universe.visitedSectors.has(s.id)) mat = this.visitedMat;

                    const mesh = new THREE.Mesh(this.nodeGeo, mat);
                    mesh.position.copy(s.pos);
                    mesh.userData.sector = s;
                    this.container.add(mesh);
                    this.nodes.push(mesh);

                    s.links.forEach(neighborId => {
                        const neighbor = this.universe.sectors.get(neighborId);
                        if (neighbor) {
                            // Check if this link is part of the planned path
                            let isPath = false;
                            for (let i = 0; i < this.plannedPath.length - 1; i++) {
                                if ((this.plannedPath[i].id === s.id && this.plannedPath[i+1].id === neighbor.id) ||
                                    (this.plannedPath[i].id === neighbor.id && this.plannedPath[i+1].id === s.id)) {
                                    isPath = true;
                                    break;
                                }
                            }

                            if (isPath) {
                                pathLinePositions.push(s.pos.x, s.pos.y, s.pos.z);
                                pathLinePositions.push(neighbor.pos.x, neighbor.pos.y, neighbor.pos.z);
                            } else {
                                linePositions.push(s.pos.x, s.pos.y, s.pos.z);
                                linePositions.push(neighbor.pos.x, neighbor.pos.y, neighbor.pos.z);
                            }
                        }
                    });
                }
            }
        }

        if (linePositions.length > 0) {
            const lines = new THREE.LineSegments(
                new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3)),
                this.lineMat
            );
            this.container.add(lines);
        }

        if (pathLinePositions.length > 0) {
            const pathLines = new THREE.LineSegments(
                new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pathLinePositions, 3)),
                this.pathMat
            );
            this.container.add(pathLines);
        }
    }

    render(renderer) {
        if (!this.visible) return;
        renderer.clearDepth();
        renderer.render(this.scene, this.camera);
    }

    update(delta) {
        if (!this.visible) return;
        this.controls.update();

        // Keep dimmer in front of camera
        this.dimmer.position.copy(this.camera.position).add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(100));
        this.dimmer.lookAt(this.camera.position);
    }
}
