/**
 * HUD: Manages the 'Nostromo-style' retro HUD.
 * Combines DOM elements for terminal readouts and Three.js objects for in-world targeting.
 */
import * as THREE from 'three';

export default class HUD {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        
        // --- DOM Elements ---
        this.container = document.createElement('div');
        this.container.id = 'hud-container';
        this.container.innerHTML = `
            <style>
                #hud-container {
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 100%;
                    pointer-events: none;
                    font-family: 'Courier New', Courier, monospace;
                    color: #88ccff; /* Muted Light Blue */
                    text-shadow: 0 0 5px rgba(136, 204, 255, 0.7);
                    overflow: hidden;
                }
                .crt-overlay {
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), 
                                linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
                    background-size: 100% 4px, 3px 100%;
                    z-index: 100;
                    opacity: 0.15;
                    pointer-events: none;
                }
                .readout {
                    position: absolute;
                    padding: 10px;
                    background: none;
                    border: none;
                    /* Strong drop shadow for readability against bright nebulae */
                    text-shadow: 2px 2px 2px rgba(0, 0, 0, 0.9), 0 0 5px rgba(136, 204, 255, 0.3);
                }
                #top-left { top: 20px; left: 20px; width: 250px; }
                #top-right { top: 20px; right: 20px; text-align: right; }
                #bottom-left { bottom: 20px; left: 20px; font-size: 0.8rem; }
                #bottom-right { bottom: 20px; right: 20px; width: 300px; height: 120px; }
                
                .scanline {
                    width: 100%;
                    height: 100px;
                    background: linear-gradient(0deg, rgba(0,0,0,0) 0%, rgba(136, 204, 255, 0.05) 50%, rgba(0,0,0,0) 100%);
                    position: absolute;
                    top: -100px;
                    animation: scanline 8s linear infinite;
                }
                @keyframes scanline {
                    0% { top: -100px; }
                    100% { top: 100%; }
                }
                .glitch { animation: glitch 0.2s infinite; }
                @keyframes glitch {
                    0% { transform: translate(0); }
                    20% { transform: translate(-2px, 2px); }
                    40% { transform: translate(-2px, -2px); }
                    60% { transform: translate(2px, 2px); }
                    80% { transform: translate(2px, -2px); }
                    100% { transform: translate(0); }
                }
                .bar-container { width: 100%; height: 6px; background: rgba(136, 204, 255, 0.1); margin-top: 5px; position: relative; }
                .bar-fill { height: 100%; background: #88ccff; width: 50%; transition: width 0.1s; box-shadow: 0 0 10px rgba(136, 204, 255, 0.5); }
            </style>
            <div class="crt-overlay"></div>
            <div class="scanline"></div>
            
            <div id="top-left" class="readout">
                <div>SYSTEM STATUS: ONLINE</div>
                <div style="font-size: 0.7rem; opacity: 0.7; margin-bottom: 10px;">CORE OS v4.2 / NAV-INTERACTION</div>
                <div>THRUST: <span id="thrust-val">0</span>%</div>
                <div class="bar-container"><div id="thrust-bar" class="bar-fill"></div></div>
                <div style="margin-top: 10px;">VELOCITY: <span id="speed-val">0</span> m/s</div>
                <div style="margin-top: 5px;">ENERGY: <span id="charge-val">100</span>%</div>
                <div class="bar-container"><div id="charge-bar" class="bar-fill" style="background: #ffaa00; box-shadow: 0 0 10px rgba(255, 170, 0, 0.5);"></div></div>
            </div>

            <div id="top-right" class="readout">
                <div id="sector-id">SECTOR: UNKNOWN</div>
                <div id="coords">X: 0.00 Y: 0.00 Z: 0.00</div>
            </div>

            <div id="bottom-left" class="readout">
                <div>MSG LOG:</div>
                <div id="messages" style="height: 60px; overflow: hidden;">
                    > STANDBY FOR SECTOR ANALYSIS...<br>
                    > NO SIGNS OF LIFE DETECTED.<br>
                </div>
            </div>

            <div id="bottom-right" class="readout">
                <div style="font-size: 0.7rem; opacity: 0.7;">SCANNER</div>
                <canvas id="tracker-canvas" width="260" height="100" style="margin-top: 5px;"></canvas>
            </div>
        `;
        document.body.appendChild(this.container);
        
        // Cache DOM references
        this.thrustVal = this.container.querySelector('#thrust-val');
        this.thrustBar = this.container.querySelector('#thrust-bar');
        this.speedVal = this.container.querySelector('#speed-val');
        this.chargeVal = this.container.querySelector('#charge-val');
        this.chargeBar = this.container.querySelector('#charge-bar');
        this.sectorId = this.container.querySelector('#sector-id');
        this.coords = this.container.querySelector('#coords');
        this.messages = this.container.querySelector('#messages');
        this.trackerCanvas = this.container.querySelector('#tracker-canvas');
        this.trackerCtx = this.trackerCanvas.getContext('2d');
        
        // --- Three.js HUD elements ---
        this.pois = []; // { mesh, position, label }
        this.poiMaterial = new THREE.MeshBasicMaterial({ color: 0x88ccff, wireframe: true });

        this.hide(); // Hide by default
    }

    hide() {
        this.container.style.display = 'none';
        this.pois.forEach(p => p.group.visible = false);
    }

    show() {
        this.container.style.display = 'block';
        this.pois.forEach(p => p.group.visible = true);
    }

    update(delta, state) {
        const { thrust, speed, charge, seed, position, ship, targets } = state;
        
        // Update Readouts
        this.thrustVal.innerText = Math.round(thrust * 100);
        this.thrustBar.style.width = `${thrust * 100}%`;
        this.speedVal.innerText = speed.toFixed(1);
        
        this.chargeVal.innerText = Math.round(charge);
        this.chargeBar.style.width = `${charge}%`;

        this.sectorId.innerText = `SECTOR: ${seed.toUpperCase()}`;
        this.coords.innerText = `X:${position.x.toFixed(1)} Y:${position.y.toFixed(1)} Z:${position.z.toFixed(1)}`;
        
        // Draw Tracker
        this.drawTracker(delta, ship, targets);
    }

    drawTracker(delta, ship, targets = []) {
        const ctx = this.trackerCtx;
        const w = this.trackerCanvas.width;
        const h = this.trackerCanvas.height;
        
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = '#88ccff';
        ctx.lineWidth = 1;
        
        // Draw grid
        ctx.globalAlpha = 0.2;
        for(let i=0; i<w; i+=20) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
        for(let i=0; i<h; i+=20) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }
        
        // Center of tracker is ship
        const centerX = w / 2;
        const centerY = h / 2;
        const scale = 0.005; // 1 unit = 0.005 pixels. 10,000 units = 50 pixels.

        // Draw targets
        const shipPos = ship.position;
        // Correcting quat usage: we want to transform target to ship-local space
        const shipQuatInv = ship.quaternion.clone().invert();
        const relativePos = new THREE.Vector3();

        targets.forEach(target => {
            if (!target) return;
            
            // Calculate relative position to ship
            relativePos.copy(target.position).sub(shipPos);
            // Rotate by inverse ship orientation to get "ship-local" coords
            relativePos.applyQuaternion(shipQuatInv);
            
            // X is side, Z is forward/back
            // Note: In Three.js, -Z is forward. On our tracker, up (negative ty) should be forward.
            let tx = centerX + relativePos.x * scale;
            let ty = centerY + relativePos.z * scale;
            
            // Detection range logic
            const isOutOfRange = (tx < 5 || tx > w - 5 || ty < 5 || ty > h - 5);
            
            // Clamp to edge if out of range
            tx = Math.max(5, Math.min(w - 5, tx));
            ty = Math.max(5, Math.min(h - 5, ty));

            // Pulse animation
            const pulse = (Math.sin(Date.now() * 0.005) + 1) * 0.5;

            // Shape based on relative altitude
            const altThreshold = 500;
            ctx.fillStyle = isOutOfRange ? '#ff4100' : '#88ccff'; 
            ctx.globalAlpha = isOutOfRange ? (0.2 + pulse * 0.2) : (0.5 + pulse * 0.5);

            if (relativePos.y > altThreshold) {
                // Above: Triangle up
                ctx.beginPath();
                ctx.moveTo(tx, ty - 5);
                ctx.lineTo(tx - 4, ty + 3);
                ctx.lineTo(tx + 4, ty + 3);
                ctx.closePath();
                ctx.fill();
            } else if (relativePos.y < -altThreshold) {
                // Below: Triangle down
                ctx.beginPath();
                ctx.moveTo(tx, ty + 5);
                ctx.lineTo(tx - 4, ty - 3);
                ctx.lineTo(tx + 4, ty - 3);
                ctx.closePath();
                ctx.fill();
            } else {
                // Level: Circle
                ctx.beginPath();
                ctx.arc(tx, ty, isOutOfRange ? 2 : 4, 0, Math.PI * 2);
                ctx.fill();
            }

            // Course Highlight (Square)
            if (target.userData && target.userData.isCourseTarget) {
                ctx.strokeStyle = '#00ffaa';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(tx - 7, ty - 7, 14, 14);
            }
            
            // Distance label
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = '#88ccff';
            ctx.font = '8px monospace';
            const dist = Math.round(relativePos.length());
            ctx.fillText(dist + "m", tx + 5, ty);
        });

        // Draw Ship "icon" in center
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - 5);
        ctx.lineTo(centerX - 3, centerY + 3);
        ctx.lineTo(centerX + 3, centerY + 3);
        ctx.fill();
    }

    addMessage(msg) {
        const div = document.createElement('div');
        div.innerText = `> ${msg}`;
        this.messages.prepend(div);
        if (this.messages.children.length > 5) this.messages.lastChild.remove();
        
        // Add a glitch effect when a message arrives
        this.messages.parentElement.classList.add('glitch');
        setTimeout(() => this.messages.parentElement.classList.remove('glitch'), 500);
    }

    /**
     * Add a POI marker in the 3D world
     */
    addTargetPOI(position, label = "UNKNOWN") {
        const group = new THREE.Group();
        
        // Retro diamond marker
        const geometry = new THREE.OctahedronGeometry(1, 0);
        const mesh = new THREE.Mesh(geometry, this.poiMaterial);
        group.add(mesh);
        
        group.position.copy(position);
        this.scene.add(group);
        
        this.pois.push({ group, position, label });
    }

    /**
     * Handle window resizing
     */
    resize(w, h) {
        // Tracker canvas doesn't necessarily need to change pixel size 
        // unless you want it to scale with the window. 
        // Let's keep it fixed at 300x120 for the layout, 
        // but ensuring the parent container is correct.
    }
}
