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
                #hud-root {
                    position: absolute;
                    top: 0; left: 0; width: 100%; height: 100%;
                    pointer-events: none;
                    font-family: 'JetBrains Mono', 'Courier New', monospace;
                    color: #88ccff;
                    overflow: hidden;
                    user-select: none;
                    text-shadow: 0 0 5px rgba(136, 204, 255, 0.4);
                }

                #hud-root::before {
                    content: " ";
                    display: block;
                    position: absolute;
                    top: 0; left: 0; bottom: 0; right: 0;
                    background: 
                        linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.15) 50%), 
                        linear-gradient(90deg, rgba(255, 0, 0, 0.05), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.05));
                    z-index: 100;
                    background-size: 100% 3px, 4px 100%;
                    pointer-events: none;
                    opacity: 0.4;
                }

                .readout {
                    position: absolute;
                    padding: 12px;
                    background: rgba(0, 20, 30, 0.15);
                    border: 1px solid rgba(136, 204, 255, 0.1);
                    transition: all 0.3s ease;
                }

                .readout-left { border-left: 2px solid rgba(136, 204, 255, 0.5); }
                .readout-right { border-right: 2px solid rgba(136, 204, 255, 0.5); }

                .readout-header {
                    font-family: 'Outfit', sans-serif;
                    font-size: 0.6rem;
                    letter-spacing: 3px;
                    color: #88ccff;
                    margin-bottom: 10px;
                    text-transform: uppercase;
                    opacity: 0.7;
                    border-bottom: 1px solid rgba(136, 204, 255, 0.1);
                    padding-bottom: 4px;
                }

                #top-left { top: 30px; left: 30px; width: 300px; }
                #top-right { top: 30px; right: 30px; text-align: right; width: 300px; }
                #bottom-left { bottom: 30px; left: 30px; width: 320px; }
                #bottom-right { bottom: 30px; right: 30px; width: 320px; }
                #economy-panel { top: 450px; right: 30px; width: 240px; }
                
                .stat-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 6px;
                }

                .stat-label { opacity: 0.5; font-size: 0.7rem; font-weight: 300; }
                .stat-value { 
                    font-weight: 400; 
                    color: #fff; 
                    font-variant-numeric: tabular-nums;
                }

                .bar-container { 
                    width: 100%; 
                    height: 2px; 
                    background: rgba(136, 204, 255, 0.1); 
                    margin: 6px 0 10px 0; 
                    position: relative;
                }
                .bar-fill { 
                    height: 100%; 
                    background: #88ccff; 
                    width: 0%; 
                    transition: width 0.3s ease; 
                }

                #messages {
                    height: 90px;
                    font-size: 0.7rem;
                    line-height: 1.5;
                    display: flex;
                    flex-direction: column-reverse;
                    gap: 6px;
                    overflow: hidden;
                    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 20%);
                    mask-image: linear-gradient(to bottom, transparent 0%, black 20%);
                }
                .msg-entry {
                    border-left: 2px solid #88ccff;
                    padding-left: 10px;
                    animation: msgSlideIn 0.3s ease-out;
                    color: #88ccff;
                }
                @keyframes msgSlideIn {
                    from { transform: translateX(-10px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }

                .glitch-flash {
                    animation: glitchFlash 0.3s step-end;
                }
                @keyframes glitchFlash {
                    0% { background: rgba(0, 255, 170, 0.1); }
                    50% { background: rgba(0, 255, 170, 0.0); }
                    100% { background: rgba(0, 255, 170, 0.0); }
                }
                .coord-grid {
                    display: flex;
                    gap: 4px;
                    font-size: 0.85rem;
                }
                .coord-seg {
                    width: 80px;
                    text-align: right;
                    color: #fff;
                    white-space: nowrap;
                    font-variant-numeric: tabular-nums;
                }
            </style>
            
            <div id="top-left" class="readout readout-left">
                <div class="readout-header">Ship Systems // Propulsion</div>
                <div class="stat-row">
                    <span class="stat-label">THRUST OUTPUT</span>
                    <span class="stat-value"><span id="thrust-val">0</span>%</span>
                </div>
                <div class="bar-container"><div id="thrust-bar" class="bar-fill"></div></div>
                
                <div class="stat-row">
                    <span class="stat-label">CORE CHARGE</span>
                    <span class="stat-value"><span id="charge-val">100</span>%</span>
                </div>
                <div class="bar-container"><div id="charge-bar" class="bar-fill" style="background: #ffcc00; box-shadow: 0 0 15px rgba(255, 204, 0, 0.4);"></div></div>
                
                <div class="stat-row" style="margin-top: 10px;">
                    <span class="stat-label">REL. VELOCITY</span>
                    <span class="stat-value"><span id="speed-val">0.0</span> <span style="font-size: 0.6rem; opacity: 0.5;">m/s</span></span>
                </div>
            </div>

            <div id="top-right" class="readout readout-right">
                <div class="readout-header">Navigation // Sector Data</div>
                <div id="sector-id" style="font-family: 'Outfit', sans-serif; font-size: 1.1rem; color: #fff;">UNKNOWN SECTOR</div>
                <div class="stat-row" style="margin-top: 8px;">
                    <span class="stat-label">POS:</span>
                    <div class="coord-grid">
                        <span class="coord-seg" id="pos-x">0</span>
                        <span class="coord-seg" id="pos-y">0</span>
                        <span class="coord-seg" id="pos-z">0</span>
                    </div>
                </div>
            </div>

            <div id="bottom-left" class="readout readout-left">
                <div class="readout-header">Comm Link // Message Log</div>
                <div id="messages"></div>
            </div>

            <div id="economy-panel" class="readout readout-right" style="top: 480px; right: 30px; width: 240px;">
                <div class="readout-header">Wallet // Assets</div>
                <div class="stat-row">
                    <span class="stat-label">CREDITS</span>
                    <span class="stat-value" id="credits-val" style="color: #ffcc00;">0</span>
                </div>
                <div style="font-size: 0.7rem; margin-top: 10px; opacity: 0.8;">
                    <div class="readout-header" style="font-size: 0.6rem; color: #88ccff;">Cargo Bay</div>
                    <div id="inventory-list">EMPTY</div>
                </div>
            </div>

            <div id="bottom-right" class="readout readout-right">
                <div class="readout-header">Tactical // Local Scan</div>
                <canvas id="tracker-canvas" width="268" height="120" style="display: block;"></canvas>
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
        this.posX = this.container.querySelector('#pos-x');
        this.posY = this.container.querySelector('#pos-y');
        this.posZ = this.container.querySelector('#pos-z');
        this.messages = this.container.querySelector('#messages');
        this.creditsVal = this.container.querySelector('#credits-val');
        this.inventoryList = this.container.querySelector('#inventory-list');
        this.trackerCanvas = this.container.querySelector('#tracker-canvas');
        this.trackerCtx = this.trackerCanvas.getContext('2d');
        
        this.updateTimer = 0;
        this.updateInterval = 0.1; // 100ms throttle for text
        
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
        
        // High-frequency visual updates (Bars) - Keep smooth at 60fps
        this.thrustBar.style.width = `${thrust * 100}%`;
        this.chargeBar.style.width = `${charge}%`;

        // Throttled Text Updates (Reduces jitter and blurriness)
        this.updateTimer += delta;
        if (this.updateTimer >= this.updateInterval) {
            this.updateTimer = 0;
            
            this.thrustVal.innerText = Math.round(thrust * 100);
            this.speedVal.innerText = speed.toFixed(1);
            this.chargeVal.innerText = Math.round(charge);
            this.sectorId.innerText = seed.toUpperCase();
            
            if (position) {
                this.posX.innerText = Math.round(position.x);
                this.posY.innerText = Math.round(position.y);
                this.posZ.innerText = Math.round(position.z);
            }
            
            // Update Economy
            if (state.economy) {
                this.creditsVal.innerText = state.economy.credits.toLocaleString();
                const inv = state.economy.inventory;
                if (inv.length === 0) {
                    this.inventoryList.innerText = "EMPTY";
                } else {
                    this.inventoryList.innerHTML = inv.map(([id, qty]) => `
                        <div style="display: flex; justify-content: space-between;">
                            <span>${id.toUpperCase()}</span>
                            <span>${qty}</span>
                        </div>
                    `).join('');
                }
            }
        }
        
        // Draw Tracker (Always full FPS)
        this.drawTracker(delta, ship, targets);
    }

    drawTracker(delta, ship, targets = []) {
        const ctx = this.trackerCtx;
        const w = this.trackerCanvas.width;
        const h = this.trackerCanvas.height;
        
        ctx.clearRect(0, 0, w, h);
        
        // Center of tracker is ship
        const centerX = w / 2;
        const centerY = h / 2;
        const scale = 0.005;

        // Draw tactical rings
        ctx.strokeStyle = 'rgba(136, 204, 255, 0.15)';
        ctx.lineWidth = 1;
        [20, 40, 60].forEach(r => {
            ctx.beginPath();
            ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
            ctx.stroke();
        });

        // Draw crosshair
        ctx.beginPath();
        ctx.moveTo(centerX - 10, centerY); ctx.lineTo(centerX + 10, centerY);
        ctx.moveTo(centerX, centerY - 10); ctx.lineTo(centerX, centerY + 10);
        ctx.stroke();
        
        // Transform and Draw targets
        const shipPos = ship.position;
        const shipQuatInv = ship.quaternion.clone().invert();
        const relativePos = new THREE.Vector3();

        targets.forEach(target => {
            if (!target) return;
            relativePos.copy(target.position).sub(shipPos);
            relativePos.applyQuaternion(shipQuatInv);
            
            // X is side, Z is forward/back (-Z is forward in Three.js)
            let tx = centerX + relativePos.x * scale;
            let ty = centerY + relativePos.z * scale;
            
            const dist = relativePos.length();
            const isOutOfRange = (dist * scale > 60);
            
            if (isOutOfRange) {
                const dir = new THREE.Vector2(tx - centerX, ty - centerY).normalize();
                tx = centerX + dir.x * 62;
                ty = centerY + dir.y * 62;
            }

            const pulse = (Math.sin(Date.now() * 0.01) + 1) * 0.5;
            const isCourse = target.userData && target.userData.isCourseTarget;

            ctx.fillStyle = isCourse ? '#00ffaa' : (isOutOfRange ? '#ff4100' : '#88ccff');
            ctx.globalAlpha = isOutOfRange ? 0.4 : 0.8;

            // Draw target dot
            ctx.beginPath();
            ctx.arc(tx, ty, isCourse ? 4 : 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Altitude indicator line
            ctx.strokeStyle = ctx.fillStyle;
            ctx.globalAlpha = 0.2;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx, ty - relativePos.y * scale * 0.5);
            ctx.stroke();

            if (isCourse) {
                ctx.globalAlpha = pulse * 0.3;
                ctx.beginPath();
                ctx.arc(tx, ty, 8 + pulse * 4, 0, Math.PI * 2);
                ctx.stroke();
            }
        });

        // Ship Icon (Modernized)
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(centerX, centerY - 4);
        ctx.lineTo(centerX - 3, centerY + 4);
        ctx.lineTo(centerX + 3, centerY + 4);
        ctx.fill();
    }

    addMessage(msg) {
        const div = document.createElement('div');
        div.className = 'msg-entry';
        div.innerText = msg;
        this.messages.prepend(div);
        if (this.messages.children.length > 5) this.messages.lastChild.remove();
        
        // Add a flash effect to the log container
        this.messages.parentElement.classList.add('glitch-flash');
        setTimeout(() => this.messages.parentElement.classList.remove('glitch-flash'), 300);
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
