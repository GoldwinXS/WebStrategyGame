'use strict';
// ================================================================
// UI.JS — HTML overlay UI manager (all non-3D screens)
// ================================================================

// ── Fleet Builder Ship Preview (lightweight Three.js mini-renderer) ─
class ShipPreviewRenderer {
  constructor(canvas) {
    this._canvas  = canvas;
    this._scene   = new THREE.Scene();
    const w = canvas.clientWidth  || 260;
    const h = canvas.clientHeight || 200;
    this._camera  = new THREE.PerspectiveCamera(40, w / h, 1, 10000);
    this._renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this._renderer.setSize(w, h, false);
    this._renderer.setClearColor(0x000000, 0);
    // Lighting
    this._scene.add(new THREE.AmbientLight(0x1a2a40, 4.5));
    const key = new THREE.DirectionalLight(0x80c4ff, 3.0);
    key.position.set(2, 3, 1.5); this._scene.add(key);
    const fill = new THREE.DirectionalLight(0x002244, 1.2);
    fill.position.set(-1.5, 0.5, -1); this._scene.add(fill);
    const rim  = new THREE.DirectionalLight(0x003366, 0.8);
    rim.position.set(0, -1, -2); this._scene.add(rim);
    this._mesh    = null;
    this._angle   = 0;
    this._running = true;
    this._animate();
  }

  showShip(templateId) {
    if (this._mesh) { this._scene.remove(this._mesh); this._mesh = null; }
    const tpl = SHIP_TEMPLATES[templateId];
    if (!tpl || !ShipModels[templateId]) return;
    this._mesh = ShipModels[templateId](tpl.color, tpl.glowColor || tpl.color);
    this._mesh.rotation.x = -Math.PI * 0.1; // slight top-down tilt so ship faces viewer
    // Add turret meshes using template slot definitions
    const sf = (tpl.size || 20) / 20;
    for (const slotDef of (tpl.slots || [])) {
      if (!slotDef.weaponId) continue;
      const tGroup = ShipModels.buildTurretGroup(slotDef, sf);
      if (tGroup) this._mesh.add(tGroup);
    }
    this._scene.add(this._mesh);
    // Auto-fit camera distance to ship bounding box
    const box = new THREE.Box3().setFromObject(this._mesh);
    const sz  = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(sz.x, sz.y, sz.z);
    this._camera.position.set(0, maxDim * 0.25, maxDim * 1.55);
    this._camera.lookAt(ctr);
  }

  clear() {
    if (this._mesh) { this._scene.remove(this._mesh); this._mesh = null; }
  }

  _animate() {
    if (!this._running) return;
    requestAnimationFrame(() => this._animate());
    if (this._mesh) { this._angle += 0.007; this._mesh.rotation.y = this._angle; }
    this._renderer.render(this._scene, this._camera);
  }

  destroy() {
    this._running = false;
    if (this._mesh) this._scene.remove(this._mesh);
    this._renderer.dispose();
  }
}

// ── Damage Control Modal (3D ship visualization with damage effects) ─
class DamageControlModal {
  constructor() {
    this._modal    = document.getElementById('dc-modal');
    this._canvas   = document.getElementById('dc-preview-canvas');
    this._scene    = new THREE.Scene();
    const w = 300, h = 260;
    this._camera   = new THREE.PerspectiveCamera(42, w / h, 1, 10000);
    this._renderer = new THREE.WebGLRenderer({ canvas: this._canvas, antialias: true, alpha: true });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this._renderer.setSize(w, h, false);
    this._renderer.setClearColor(0x000810, 1);
    // Lighting
    this._scene.add(new THREE.AmbientLight(0x1a2a40, 4.0));
    const key = new THREE.DirectionalLight(0x80c4ff, 2.8);
    key.position.set(2, 3, 1.5); this._scene.add(key);
    const fill = new THREE.DirectionalLight(0x002244, 1.0);
    fill.position.set(-1.5, 0.5, -1); this._scene.add(fill);
    this._mesh      = null;
    this._fireMeshes = [];
    this._floodPlane = null;
    this._angle     = 0;
    this._running   = false;
    this._ship      = null;
    this._updateTimer = 0;
    // Close button
    document.getElementById('btn-dc-modal-close').onclick = () => this.close();
    // Priority buttons
    document.querySelectorAll('.dc-prio-btn').forEach(btn => {
      btn.onclick = () => {
        if (!this._ship) return;
        this._ship._dcPriority = btn.dataset.prio;
        this._refreshStatus();
      };
    });
  }

  open(ship) {
    this._ship = ship;
    this._modal.classList.remove('hidden');
    this._buildModel(ship);
    this._refreshStatus();
    if (!this._running) { this._running = true; this._animate(); }
  }

  close() {
    this._running = false;
    this._modal.classList.add('hidden');
    this._clearMeshes();
  }

  _buildModel(ship) {
    this._clearMeshes();
    if (!ShipModels[ship.templateId]) return;
    const tpl = SHIP_TEMPLATES[ship.templateId] || {};
    this._mesh = ShipModels[ship.templateId](tpl.color || '#4af', tpl.glowColor || tpl.color || '#4af');
    // Tint hull materials based on damage (lerp toward red at low HP)
    const hpFrac = ship.hull / ship.maxHull;
    this._mesh.traverse(child => {
      if (child.isMesh && child.material && child.material.color) {
        if (!child.userData._origColor) child.userData._origColor = child.material.color.clone();
        const dmgTint = new THREE.Color(1, hpFrac * 0.5, hpFrac * 0.5);
        child.material = child.material.clone();
        child.material.color.lerp(dmgTint, Math.max(0, (1 - hpFrac) * 0.55));
      }
    });
    this._scene.add(this._mesh);
    // Auto-fit camera
    const box = new THREE.Box3().setFromObject(this._mesh);
    const sz  = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(sz.x, sz.y, sz.z);
    this._camera.position.set(0, maxDim * 0.2, maxDim * 1.6);
    this._camera.lookAt(ctr);
    this._modelCenter = ctr;
    this._modelBox = box;
    // Add fire orbs
    this._lastFireCount = ship.fires ? ship.fires.length : 0;
    this._rebuildFireMeshes(ship);
    // Add flood plane
    this._rebuildFloodPlane(ship);
  }

  _rebuildFireMeshes(ship) {
    for (const m of this._fireMeshes) this._scene.remove(m);
    this._fireMeshes = [];
    if (!this._modelBox || !ship.fires || ship.fires.length === 0) return;
    const box = this._modelBox;
    const sz  = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    for (const fire of ship.fires) {
      // Place centered within hull bounds with some random spread
      const rx = ctr.x + (Math.random() - 0.5) * sz.x * 0.55;
      const rz = ctr.z + (Math.random() - 0.5) * sz.z * 0.6;
      const ry = ctr.y + (Math.random() - 0.3) * sz.y * 0.4;
      const geo = new THREE.SphereGeometry(sz.x * 0.04 * (fire.severity + 1), 7, 5);
      const col = new THREE.Color(1, 0.3 + Math.random() * 0.3, 0);
      const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(rx, ry, rz);
      m.userData.baseY = ry;
      m.userData.phase = Math.random() * Math.PI * 2;
      // Point light for fire glow
      const light = new THREE.PointLight(0xff4400, 1.5 * fire.severity, sz.x * 1.2);
      light.position.set(rx, ry, rz);
      this._scene.add(m, light);
      this._fireMeshes.push(m, light);
    }
  }

  _rebuildFloodPlane(ship) {
    if (this._floodPlane) { this._scene.remove(this._floodPlane); this._floodPlane = null; }
    if (!this._modelBox || !ship.flooding || ship.flooding <= 0.02) return;
    const box = this._modelBox;
    const sz  = box.getSize(new THREE.Vector3());
    const floodH = box.min.y + sz.y * ship.flooding;
    const geo = new THREE.BoxGeometry(sz.x * 0.95, 1, sz.z * 0.95);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x0d47a1, transparent: true, opacity: 0.38,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this._floodPlane = new THREE.Mesh(geo, mat);
    this._floodPlane.position.set(
      box.getCenter(new THREE.Vector3()).x,
      floodH,
      box.getCenter(new THREE.Vector3()).z
    );
    this._scene.add(this._floodPlane);
  }

  _clearMeshes() {
    if (this._mesh) { this._scene.remove(this._mesh); this._mesh = null; }
    for (const m of this._fireMeshes) this._scene.remove(m);
    this._fireMeshes = [];
    if (this._floodPlane) { this._scene.remove(this._floodPlane); this._floodPlane = null; }
  }

  _refreshStatus() {
    const ship = this._ship;
    if (!ship) return;
    // Header
    document.getElementById('dc-ship-name').textContent = ship.name;
    const tpl = SHIP_TEMPLATES[ship.templateId] || {};
    document.getElementById('dc-ship-class').textContent = tpl.shipClass || '';
    // Condition label
    const hpFrac = ship.hull / ship.maxHull;
    const condEl = document.getElementById('dc-condition-label');
    if (hpFrac > 0.75 && !ship.fires?.length && !ship.flooding) {
      condEl.textContent = 'CONDITION: NOMINAL'; condEl.style.color = '#4caf50';
    } else if (hpFrac > 0.4) {
      condEl.textContent = 'CONDITION: DAMAGED'; condEl.style.color = '#ff9800';
    } else {
      condEl.textContent = 'CONDITION: CRITICAL'; condEl.style.color = '#f44336';
    }
    // Hull bar
    const hpPct = (hpFrac * 100).toFixed(0);
    const hullFill = document.getElementById('dc-hull-bar-fill');
    hullFill.style.width = hpPct + '%';
    hullFill.style.background = hpFrac > 0.5 ? '#4caf50' : hpFrac > 0.25 ? '#ff9800' : '#f44336';
    document.getElementById('dc-hull-val').textContent = `${Math.round(ship.hull)}/${ship.maxHull}`;
    // Fires
    const firesEl = document.getElementById('dc-fires-list');
    if (!ship.fires || ship.fires.length === 0) {
      firesEl.innerHTML = '<div style="color:#4caf50;font:11px monospace">✓ No active fires</div>';
    } else {
      firesEl.innerHTML = ship.fires.map((f, i) => {
        const dots = [1,2,3].map(n =>
          `<div class="dc-fire-dot ${n <= f.severity ? 'high' : 'low'}"></div>`).join('');
        return `<div class="dc-fire-row"><div class="dc-fire-sev">${dots}</div>Fire ${i+1} — severity ${f.severity} · ${f.timer.toFixed(0)}s remaining</div>`;
      }).join('');
    }
    // Flooding
    const flood = ship.flooding || 0;
    const floodPct = Math.round(flood * 100);
    document.getElementById('dc-flood-bar-fill').style.width = floodPct + '%';
    document.getElementById('dc-flood-val').textContent = floodPct + '%';
    const breachEl = document.getElementById('dc-breach-status');
    const breaches = ship.hullBreaches || 0;
    breachEl.textContent = breaches > 0
      ? `⚠ ${breaches} active hull breach${breaches > 1 ? 'es' : ''} · Flood rate +${(ship.floodRate * 100).toFixed(1)}%/s`
      : (flood > 0 ? '⬇ Residual water — pump assigned' : '✓ Watertight');
    breachEl.style.color = breaches > 0 ? '#ff9800' : flood > 0 ? '#29b6f6' : '#4caf50';
    // Buoyancy status
    let buoyEl = document.getElementById('dc-buoyancy-status');
    if (!buoyEl) {
      buoyEl = document.createElement('div');
      buoyEl.id = 'dc-buoyancy-status';
      buoyEl.style.cssText = 'font:11px monospace;margin-top:4px;padding:3px 6px;border-radius:3px';
      breachEl.parentNode.insertBefore(buoyEl, breachEl.nextSibling);
    }
    if (ship._buoyancyDamaged) {
      const dir = ship._buoyancyDriftRate > 0 ? '▼ SINKING' : '▲ RISING';
      buoyEl.textContent = `⚠ BUOYANCY LOSS — ${dir} uncontrolled · ${Math.abs(ship._buoyancyDriftRate).toFixed(0)} u/s`;
      buoyEl.style.color = '#f44336';
    } else {
      buoyEl.textContent = '✓ Buoyancy nominal';
      buoyEl.style.color = '#4caf50';
    }
    // Turret slots
    let turretEl = document.getElementById('dc-turret-slots');
    if (!turretEl) {
      turretEl = document.createElement('div');
      turretEl.id = 'dc-turret-slots';
      turretEl.style.cssText = 'margin-top:8px;padding:6px 8px;background:rgba(0,10,25,0.5);border:1px solid #1a2a3a;border-radius:3px';
      buoyEl.parentNode.insertBefore(turretEl, buoyEl.nextSibling);
    }
    const armedSlots = ship.slots ? ship.slots.filter(sl => sl.weapon || sl.weaponId) : [];
    if (armedSlots.length > 0) {
      const slotRows = armedSlots.map(sl => {
        const hp = sl.health;
        const bar = hp <= 0 ? '#f44336' : hp < 50 ? '#ff9800' : '#4caf50';
        const status = hp <= 0 ? '<span style="color:#f44336;font-weight:bold">DESTROYED</span>'
          : hp < 100 ? `<span style="color:#ff9800">${hp.toFixed(0)}%</span>`
          : '<span style="color:#4caf50">OK</span>';
        const wName = sl.weapon ? sl.weapon.name : (sl.weaponId || '—');
        return `<div style="display:flex;align-items:center;gap:6px;font:10px monospace;margin-bottom:3px">
          <span style="flex:1;color:#789">${sl.label}</span>
          <span style="font-size:9px;color:#446">${wName}</span>
          <div style="width:40px;height:4px;background:#111;border-radius:2px"><div style="width:${hp.toFixed(0)}%;height:100%;background:${bar};border-radius:2px"></div></div>
          ${status}
        </div>`;
      }).join('');
      const destroyed = armedSlots.filter(s => s.health <= 0).length;
      turretEl.innerHTML = `<div style="font:9px var(--font-hd);color:#557;letter-spacing:1px;margin-bottom:4px">TURRET MOUNTS ${destroyed > 0 ? `<span style="color:#f44336">(${destroyed} DESTROYED)</span>` : ''}</div>${slotRows}`;
    } else {
      turretEl.innerHTML = '<div style="font:10px monospace;color:#446">No defined turret slots</div>';
    }
    // DC teams
    const busy = ship.crewBusy || [];
    const total = ship.repairCrews || 0;
    document.getElementById('dc-crew-count').textContent = `${busy.length}/${total} active`;
    const teamsEl = document.getElementById('dc-teams-list');
    if (busy.length === 0) {
      teamsEl.innerHTML = '<div style="color:#446;font:11px monospace">No teams currently assigned</div>';
    } else {
      teamsEl.innerHTML = busy.map((crew, i) => {
        const taskLabel = { fire:'Fighting Fire', breach:'Patching Breach', pump:'Pumping Flood', buoyancy:'Restoring Buoyancy', turret:'Repairing Turret', hull:'Repairing Hull' }[crew.task] || crew.task;
        const maxTimer = { fire:7.5, breach:12, pump:6, buoyancy:16, turret:18, hull:23 }[crew.task] || 8;
        const progPct = Math.round((1 - crew.timer / maxTimer) * 100);
        return `<div class="dc-team-row">
          <span style="min-width:26px;color:#446">T${i+1}</span>
          <span style="flex:1">${taskLabel}</span>
          <div class="dc-team-prog"><div class="dc-team-prog-fill" style="width:${progPct}%"></div></div>
          <span style="min-width:28px;text-align:right;color:#446">${crew.timer.toFixed(1)}s</span>
        </div>`;
      }).join('');
    }
    // Priority buttons
    const prio = ship._dcPriority || 'fire';
    document.querySelectorAll('.dc-prio-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.prio === prio);
    });
  }

  tick(dt) {
    if (!this._running || !this._ship) return;
    // Animate fire orbs
    const t = (this._angle * 0.5);
    for (const m of this._fireMeshes) {
      if (m.isMesh && m.userData.baseY !== undefined) {
        m.position.y = m.userData.baseY + Math.sin(t * 3 + m.userData.phase) * 1.5;
        m.material.opacity = 0.65 + 0.2 * Math.sin(t * 5 + m.userData.phase);
      }
    }
    // Refresh status every 0.5s
    this._updateTimer -= dt;
    if (this._updateTimer <= 0) {
      this._updateTimer = 0.5;
      this._refreshStatus();
      this._rebuildFloodPlane(this._ship);
      // Rebuild fire meshes when fire count changes (fires extinguished or new fires)
      const currentFireCount = this._ship.fires ? this._ship.fires.length : 0;
      if (currentFireCount !== this._lastFireCount) {
        this._lastFireCount = currentFireCount;
        this._rebuildFireMeshes(this._ship);
      }
    }
  }

  _animate() {
    if (!this._running) return;
    requestAnimationFrame(() => this._animate());
    this._angle += 0.007;
    if (this._mesh) this._mesh.rotation.y = this._angle;
    this.tick(1/60);
    this._renderer.render(this._scene, this._camera);
  }
}

class UIManager {
  constructor(game) {
    this.game = game;
    this._campaign = null;

    this.screens = {
      menu:         document.getElementById('screen-menu'),
      help:         document.getElementById('screen-help'),
      settings:     document.getElementById('screen-settings'),
      fleetbuilder: document.getElementById('screen-fleetbuilder'),
      campaign:     document.getElementById('screen-campaign'),
      fleet:        document.getElementById('screen-fleet'),
      event:        document.getElementById('screen-event'),
      store:        document.getElementById('screen-store'),
      precombat:    document.getElementById('screen-precombat'),
      rewards:      document.getElementById('screen-rewards'),
      gameover:     document.getElementById('screen-gameover'),
      victory:      document.getElementById('screen-victory'),
    };
    this.combatHUD = document.getElementById('hud-combat');

    // Map canvas (2D, for campaign connection lines)
    this.mapCanvas  = document.getElementById('map-canvas');
    this.mapCtx     = this.mapCanvas ? this.mapCanvas.getContext('2d') : null;
    this.nodesEl    = document.getElementById('map-nodes');

    this._bindMenuEvents();
    this._bindCombatEvents();
    this._bindTacticalMapEvents();
    this._bindRewardEvents();
    this._bindGameOverEvents();
    this._bindFleetTabEvents();
    this._bindSettingsEvents();

    // Damage control modal (created lazily on first open)
    this._dcModal = null;
  }

  // ── Screen Management ─────────────────────────────────────────
  showScreen(name) {
    for (const [k, el] of Object.entries(this.screens)) {
      el.classList.toggle('active', k === name);
    }
    this.combatHUD.classList.add('hidden');
    const tacMap = document.getElementById('tactical-map');
    if (tacMap) tacMap.classList.add('hidden');
  }

  showCombatHUD() {
    for (const el of Object.values(this.screens)) el.classList.remove('active');
    this.combatHUD.classList.remove('hidden');
    // Single persistent delegated listener — icons are rebuilt every frame so
    // per-icon listeners die; this one survives on the stable container.
    if (!this._fleetIconListenerBound) {
      this._fleetIconListenerBound = true;
      const fleet = document.getElementById('hud-fleet-icons');
      fleet.addEventListener('mousedown', (e) => {
        const icon = e.target.closest('.hud-ship-icon');
        if (!icon || !this._currentCombat) return;
        e.stopPropagation();
        const idx = parseInt(icon.dataset.shipIdx, 10);
        const s = this._currentCombat.playerShips[idx];
        if (!s) return;
        audio.play('select_ship', 0.7);
        if (e.shiftKey) {
          const inGroup = this._currentCombat.selectedShips && this._currentCombat.selectedShips.includes(s);
          if (inGroup) {
            this._currentCombat.selectedShips = this._currentCombat.selectedShips.filter(x => x !== s);
            this._currentCombat.selectedShip = this._currentCombat.selectedShips[0] || null;
          } else {
            this._currentCombat.selectedShips = [...(this._currentCombat.selectedShips || []), s];
            this._currentCombat.selectedShip = s;
          }
        } else {
          this._currentCombat.selectedShip = s;
          this._currentCombat.selectedShips = [s];
          this.game.focusCamera(s);
        }
      });
    }
  }

  // ── Main Menu ─────────────────────────────────────────────────
  _bindMenuEvents() {
    document.getElementById('btn-new-run').addEventListener('click', () => { audio.play('ui_click'); this.game.startNewRun(); });
    document.getElementById('btn-continue').addEventListener('click', () => { audio.play('ui_click'); this.game.continueRun(); });
    document.getElementById('btn-how-to-play').addEventListener('click', () => { audio.play('ui_click'); this.showScreen('help'); });
    document.getElementById('btn-help-back').addEventListener('click', () => { audio.play('ui_click'); this.showScreen('menu'); });
    document.getElementById('btn-settings').addEventListener('click', () => { audio.play('ui_click'); this.showSettings(); });
  }

  // ── Settings ──────────────────────────────────────────────────
  _bindSettingsEvents() {
    const back = document.getElementById('btn-settings-back');
    if (back) back.addEventListener('click', () => { audio.play('ui_click'); this.showScreen('menu'); });

    const bindSlider = (id, valId, fn) => {
      const el    = document.getElementById(id);
      const valEl = document.getElementById(valId);
      if (!el) return;
      el.addEventListener('input', () => {
        const v = parseInt(el.value) / 100;
        fn(v);
        if (valEl) valEl.textContent = el.value + '%';
      });
    };
    bindSlider('vol-master', 'vol-master-val', v => audio.setMasterVol(v));
    bindSlider('vol-music',  'vol-music-val',  v => audio.setMusicVol(v));
    bindSlider('vol-fx',     'vol-fx-val',     v => audio.setFxVol(v));
  }

  showSettings() {
    // Sync sliders and labels to current audio prefs before showing
    const sync = (id, valId, val) => {
      const pct = Math.round(val * 100);
      const e = document.getElementById(id); if (e) e.value = pct;
      const v = document.getElementById(valId); if (v) v.textContent = pct + '%';
    };
    sync('vol-master', 'vol-master-val', audio.masterVol);
    sync('vol-music',  'vol-music-val',  audio.musicVol);
    sync('vol-fx',     'vol-fx-val',     audio.fxVol);
    this.showScreen('settings');
  }

  updateMainMenu() {
    const hasSave = Campaign.hasSave();
    document.getElementById('btn-continue').disabled = !hasSave;
    document.getElementById('save-info').textContent = hasSave ? 'Saved run found' : '';
  }

  // ── Campaign Map (2D Canvas + HTML Nodes) ─────────────────────
  setupCampaignMap(campaign) {
    this._campaign = campaign;
    this.updateCampaignHeader(campaign);
    this._renderMapNodes(campaign);

    document.getElementById('btn-view-fleet').onclick = () => {
      this.showFleetScreen(campaign);
    };
    document.getElementById('btn-fleet-back').onclick = () => {
      this.showScreen('campaign');
    };
  }

  updateCampaignHeader(campaign) {
    document.getElementById('sector-label').textContent = `SECTOR ${campaign.sector + 1}`;
    document.getElementById('sector-name').textContent = CAMPAIGN_CONFIG.sectorNames[campaign.sector] || '';
    document.getElementById('hdr-credits').textContent = campaign.credits;
    document.getElementById('hdr-threat').textContent = campaign.threat || 0;
    this._updateFleetMiniIcons(campaign);
  }

  _updateFleetMiniIcons(campaign) {
    const container = document.getElementById('fleet-mini-icons');
    container.innerHTML = '';
    for (const sd of campaign.playerFleetData) {
      const div = document.createElement('div');
      div.className = 'fleet-icon' + (sd.isFlagship ? ' flagship' : '');
      div.title = sd.name;
      const hullPct = (sd.hull / sd.maxHull * 100).toFixed(0);
      div.innerHTML = `<div class="fleet-icon-bar" style="width:${hullPct}%"></div>`;
      container.appendChild(div);
    }
  }

  _renderMapNodes(campaign) {
    if (!this.nodesEl || !this.mapCanvas) return;
    this.nodesEl.innerHTML = '';

    const container = document.getElementById('campaign-map-container');
    const cW = container.clientWidth  || window.innerWidth;
    const cH = container.clientHeight || (window.innerHeight - 120);

    // Resize the map canvas to match
    this.mapCanvas.width  = cW;
    this.mapCanvas.height = cH;

    const nodes = campaign.nodes;
    if (!nodes || nodes.length === 0) return;

    const maxCol = Math.max(...nodes.map(n => n.col));
    const maxRow = Math.max(...nodes.map(n => n.row));
    const padX = 70, padY = 60;
    const mapW = cW - padX * 2;
    const mapH = cH - padY * 2;
    const colW = maxCol > 0 ? mapW / maxCol : mapW;
    const rowH = maxRow > 0 ? mapH / maxRow : mapH;

    const nodePos = {};
    for (const n of nodes) {
      nodePos[n.id] = {
        x: padX + n.col * colW,
        y: padY + n.row * rowH,
      };
    }

    const available = campaign.getAvailableNodes().map(n => n.id);
    const ctx = this.mapCtx;
    ctx.clearRect(0, 0, cW, cH);

    // Draw connection lines
    for (const n of nodes) {
      const from = nodePos[n.id];
      for (const connId of n.connections) {
        const to = nodePos[connId];
        if (!to) continue;
        const toNode = campaign.getNode(connId);
        const isPath = n.visited && toNode && !toNode.visited;
        const bothVisited = n.visited && toNode && toNode.visited;
        ctx.save();
        ctx.strokeStyle = isPath ? 'rgba(0,229,255,0.65)' : (bothVisited ? 'rgba(30,90,160,0.45)' : 'rgba(30,80,140,0.55)');
        ctx.lineWidth = isPath ? 2.5 : 1.5;
        ctx.setLineDash(isPath ? [] : [5, 7]);
        ctx.shadowColor = isPath ? '#00e5ff' : 'rgba(0,120,255,0.3)';
        ctx.shadowBlur  = isPath ? 10 : 4;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Create HTML node elements
    for (const n of nodes) {
      const pos   = nodePos[n.id];
      const nt    = NODE_TYPES[n.type] || NODE_TYPES.COMBAT;
      const isAvail   = available.includes(n.id);
      const isCurrent = n.id === campaign.currentNodeId;
      const isVisited = n.visited;

      const wrap = document.createElement('div');
      wrap.className = 'map-node' +
        (isCurrent ? ' current' : '') +
        (isAvail   ? ' available' : '') +
        (isVisited && !isCurrent ? ' visited' : '');
      wrap.style.left = pos.x + 'px';
      wrap.style.top  = pos.y + 'px';
      wrap.style.color = nt.color;

      const size = n.type === 'BOSS' ? 50 : n.type === 'START' ? 44 : 40;
      const circle = document.createElement('div');
      circle.className = 'map-node-circle';
      circle.style.width  = size + 'px';
      circle.style.height = size + 'px';
      circle.style.fontSize = (n.type === 'BOSS' ? 20 : 15) + 'px';
      circle.textContent = nt.label;
      if (isAvail)   { circle.style.borderColor = nt.color; circle.style.boxShadow = `0 0 14px ${nt.color}66`; }
      if (isCurrent) { circle.style.borderColor = nt.color; circle.style.background = nt.color + '22'; }

      const label = document.createElement('div');
      label.className = 'map-node-label';
      label.textContent = nt.name;

      // Boss gets an extra pulse ring
      if (n.type === 'BOSS') {
        circle.style.borderColor = '#ff1744';
        circle.style.boxShadow = `0 0 18px rgba(255,23,68,0.5)`;
        circle.style.animation = isAvail ? 'bossRing 1.5s ease-in-out infinite' : '';
      }

      wrap.appendChild(circle);
      wrap.appendChild(label);

      if (isAvail) {
        circle.style.cursor = 'pointer';
        circle.addEventListener('click', () => this.game.navigateToNode(n.id));
        // Tooltip
        circle.title = `${nt.name}: ${nt.desc}`;
      }

      this.nodesEl.appendChild(wrap);
    }

    // Add boss keyframe animation
    if (!document.getElementById('boss-anim-style')) {
      const style = document.createElement('style');
      style.id = 'boss-anim-style';
      style.textContent = `@keyframes bossRing {
        0%, 100% { box-shadow: 0 0 18px rgba(255,23,68,0.4); }
        50%       { box-shadow: 0 0 32px rgba(255,23,68,0.8), 0 0 50px rgba(255,23,68,0.3); }
      }`;
      document.head.appendChild(style);
    }
  }

  // ── Pre-Combat ────────────────────────────────────────────────
  showPreCombat(encounter, campaign) {
    this.showScreen('precombat');
    document.getElementById('precombat-title').textContent = encounter.name;
    document.getElementById('precombat-desc').textContent   = encounter.desc;
    document.getElementById('precombat-credits').textContent = campaign.credits;

    // Enemy list
    const ec = document.getElementById('precombat-enemies');
    ec.innerHTML = '';
    const counted = {};
    for (const tid of encounter.enemies) counted[tid] = (counted[tid] || 0) + 1;
    for (const [tid, cnt] of Object.entries(counted)) {
      const tpl = ENEMY_TEMPLATES[tid];
      if (!tpl) continue;
      const div = document.createElement('div');
      div.className = 'enemy-entry';
      div.innerHTML = `<span class="enemy-name" style="color:${tpl.color}">${tpl.name}</span><span class="enemy-count">×${cnt}</span>`;
      ec.appendChild(div);
    }

    // Player fleet
    const fc = document.getElementById('precombat-fleet-list');
    fc.innerHTML = '';
    for (const sd of campaign.playerFleetData) {
      const tpl = SHIP_TEMPLATES[sd.templateId] || {};
      const div = document.createElement('div');
      div.className = 'fleet-entry';
      const hp = (sd.hull / sd.maxHull * 100).toFixed(0);
      div.innerHTML = `
        <span class="ship-name${sd.isFlagship ? ' flagship' : ''}">${sd.name}</span>
        <span class="ship-class">${tpl.shipClass || ''}</span>
        <div class="ship-hull-bar"><div style="width:${hp}%"></div></div>
        <span class="ship-hull-pct">${hp}%</span>`;
      fc.appendChild(div);
    }

    document.getElementById('btn-engage').onclick = () => this.game.beginCombat(encounter, campaign);
  }

  // ── Combat HUD ────────────────────────────────────────────────
  _bindCombatEvents() {
    document.getElementById('btn-pause-combat').addEventListener('click', () => {
      audio.play('ui_click'); this.game.togglePause();
    });
    document.getElementById('btn-all-stop').addEventListener('click', () => {
      if (this.game.combat) { audio.play('ui_click'); this.game.combat.allStop(); }
    });
    document.getElementById('btn-select-all').addEventListener('click', () => {
      if (this.game.combat) {
        const alive = this.game.combat.playerShips.filter(s => !s.isDestroyed);
        if (alive.length > 0) {
          audio.play('ui_click');
          this.game.combat.selectedShip = alive[0];
          this.game.combat.selectedShips = alive.slice();
        }
      }
    });
    // Depth controls (mobile buttons)
    document.getElementById('btn-depth-up').addEventListener('click', () => this.game.adjustDepth(-200));
    document.getElementById('btn-depth-dn').addEventListener('click', () => this.game.adjustDepth(200));
    // Active sonar PING button
    document.getElementById('btn-active-sonar').addEventListener('click', () => { audio.play('ui_click'); this.game.activeSonar(); });
    const tacmapBtn = document.getElementById('btn-tacmap');
    if (tacmapBtn) tacmapBtn.addEventListener('click', () => {
      audio.play('ui_click');
      this.game.renderer.toggleTacticalView();
    });
    const arcBtn = document.getElementById('btn-arc-overlay');
    if (arcBtn) arcBtn.addEventListener('click', () => {
      audio.play('ui_click');
      const on = this.game.renderer.toggleArcOverlay();
      this.setArcOverlayHint(on);
    });
    // Combat tutorial dismiss
    const tutDismiss = document.getElementById('btn-tut-dismiss');
    if (tutDismiss) tutDismiss.addEventListener('click', () => {
      audio.play('ui_click');
      document.getElementById('combat-tutorial').classList.add('hidden');
      if (this.game.combat) this.game.combat.paused = false;
      this._tutorialShown = true;
    });
    // Ship detail panel close button
    const sdpClose = document.getElementById('btn-sdp-close');
    if (sdpClose) sdpClose.addEventListener('click', () => {
      document.getElementById('ship-detail-panel').classList.add('hidden');
      this._sdpPinned = false;
    });
    // DC priority buttons
    const dcFire  = document.getElementById('btn-dc-fire');
    const dcFlood = document.getElementById('btn-dc-flood');
    const dcHull  = document.getElementById('btn-dc-hull');
    if (dcFire)  dcFire.addEventListener('click',  () => this._setDCPriority('fire'));
    if (dcFlood) dcFlood.addEventListener('click', () => this._setDCPriority('flood'));
    if (dcHull)  dcHull.addEventListener('click',  () => this._setDCPriority('hull'));

    // DC modal open button
    const btnOpenDC = document.getElementById('btn-open-dc-modal');
    if (btnOpenDC) {
      btnOpenDC.addEventListener('click', () => {
        audio.play('ui_click', 0.5);
        const sel = this.game.combat && this.game.combat.selectedShip;
        this.openDamageControl(sel);
      });
    }

    // Overlay toggle buttons
    const ovrKeys = ['weapon-range', 'sonar', 'visual'];
    for (const key of ovrKeys) {
      const btn = document.getElementById(`ovr-${key}`);
      if (!btn) continue;
      btn.addEventListener('click', () => {
        audio.play('ui_click', 0.5);
        const r = this.game.renderer;
        const prop = `_ovr_${key.replace('-','_')}`;
        r[prop] = !r[prop];
        btn.classList.toggle('active', r[prop]);
      });
    }

    // Free move toggle — ship breaks from fleet formation
    const freeMoveBtn = document.getElementById('btn-free-move');
    if (freeMoveBtn) {
      freeMoveBtn.addEventListener('click', () => {
        audio.play('ui_click', 0.5);
        const sel = this.game.combat && this.game.combat.selectedShip;
        if (!sel) return;
        sel._freeMove = !sel._freeMove;
        freeMoveBtn.classList.toggle('active', sel._freeMove);
        freeMoveBtn.textContent = sel._freeMove ? '⇄ FREE MOVE: ON' : '⇄ FREE MOVE: OFF';
      });
    }

    // Evasive mode toggle — lateral jinking while moving
    const evadeBtn = document.getElementById('btn-evade-mode');
    if (evadeBtn) {
      evadeBtn.addEventListener('click', () => {
        audio.play('ui_click', 0.5);
        const sel = this.game.combat && this.game.combat.selectedShip;
        if (!sel) return;
        sel._evadeMode = !sel._evadeMode;
        evadeBtn.classList.toggle('active', sel._evadeMode);
        evadeBtn.textContent = sel._evadeMode ? '↯ EVASIVE: ON' : '↯ EVASIVE: OFF';
      });
    }

    // Blind fire toggle — fires at unresolved contacts with positional noise
    const blindFireBtn = document.getElementById('btn-blind-fire');
    if (blindFireBtn) {
      blindFireBtn.addEventListener('click', () => {
        audio.play('ui_click', 0.5);
        const sel = this.game.combat && this.game.combat.selectedShip;
        if (!sel) return;
        sel._fireAtContacts = !sel._fireAtContacts;
        blindFireBtn.classList.toggle('active', sel._fireAtContacts);
        blindFireBtn.textContent = sel._fireAtContacts
          ? '◉ BLIND FIRE: ON'
          : '◉ BLIND FIRE: OFF';
      });
    }

    // Fleet-level free move toggle — applies to all selected ships
    const fleetFreeMoveBtn = document.getElementById('btn-fleet-free-move');
    if (fleetFreeMoveBtn) {
      fleetFreeMoveBtn.addEventListener('click', () => {
        audio.play('ui_click', 0.5);
        const c = this.game.combat;
        if (!c) return;
        const ships = (c.selectedShips && c.selectedShips.length > 0) ? c.selectedShips : (c.selectedShip ? [c.selectedShip] : []);
        if (ships.length === 0) return;
        const anyOff = ships.some(s => !s._freeMove);
        ships.forEach(s => { s._freeMove = anyOff; });
      });
    }

    // Fleet-level blind fire toggle — applies to all selected ships
    const fleetBlindFireBtn = document.getElementById('btn-fleet-blind-fire');
    if (fleetBlindFireBtn) {
      fleetBlindFireBtn.addEventListener('click', () => {
        audio.play('ui_click', 0.5);
        const c = this.game.combat;
        if (!c) return;
        const ships = (c.selectedShips && c.selectedShips.length > 0) ? c.selectedShips : (c.selectedShip ? [c.selectedShip] : []);
        if (ships.length === 0) return;
        const anyOff = ships.some(s => !s._fireAtContacts);
        ships.forEach(s => { s._fireAtContacts = anyOff; });
      });
    }
  }

  // ── Tactical Map ──────────────────────────────────────────────
  _bindTacticalMapEvents() {
    const canvas = document.getElementById('tac-canvas');
    if (!canvas) return;
    const coordsEl = document.getElementById('tac-coords');

    // Helper: canvas pixel → world coordinate
    const toWorld = (e) => {
      const rect = canvas.getBoundingClientRect();
      return {
        wx: (e.clientX - rect.left) / canvas.width  * WORLD_W,
        wy: (e.clientY - rect.top)  / canvas.height * WORLD_H,
      };
    };
    // Helper: find nearest ship within world-unit threshold; useDisplay uses contact positions for enemies
    const nearestShip = (ships, wx, wy, threshWorld, useDisplay = false) =>
      ships.filter(s => !s.isDestroyed)
           .reduce((best, s) => {
             const sx2 = useDisplay && s._displayX != null ? s._displayX : s.x;
             const sy2 = useDisplay && s._displayY != null ? s._displayY : s.y;
             const d = Math.hypot(wx - sx2, wy - sy2);
             return d < threshWorld && d < (best._d || Infinity) ? (s._d = d, s) : best;
           }, null);

    // Hover: update coords label and change cursor to pointer over ships
    canvas.addEventListener('mousemove', (e) => {
      const { wx, wy } = toWorld(e);
      if (coordsEl) coordsEl.textContent = `${Math.round(wx)}, ${Math.round(wy)}`;
      const combat = this.game.combat;
      if (!combat) return;
      const thresh = WORLD_W * 0.03;
      const hoverFriendly = nearestShip(combat.playerShips, wx, wy, thresh);
      const hoverEnemy = nearestShip(combat.enemyShips.filter(s => s.detectionLevel > 0), wx, wy, thresh, true);
      canvas.style.cursor = (hoverFriendly || hoverEnemy) ? 'pointer' : 'crosshair';
      this._tacmapHoverShip = hoverFriendly || hoverEnemy || null;
    });

    canvas.addEventListener('click', (e) => {
      const combat = this.game.combat;
      if (!combat) return;
      const { wx, wy } = toWorld(e);
      const thresh = WORLD_W * 0.04;

      // Priority 1: click on a friendly ship → select it
      const clickedFriendly = nearestShip(combat.playerShips, wx, wy, thresh);
      if (clickedFriendly) {
        combat.selectedShip  = clickedFriendly;
        combat.selectedShips = [clickedFriendly];
        this.game.focusCamera(clickedFriendly);
        audio.play('select_ship', 0.7);
        return;
      }

      // Priority 2: click on a visible enemy → attack with selected ship
      const visibleEnemies = combat.enemyShips.filter(s => s.detectionLevel > 0);
      const clickedEnemy = nearestShip(visibleEnemies, wx, wy, thresh, true);
      if (clickedEnemy && combat.selectedShip && !combat.selectedShip.isDestroyed) {
        combat.selectedShip.attackTarget = clickedEnemy;
        audio.play('shoot_plasma', 0.5);
        return;
      }

      // Priority 3: move selected ship to clicked ocean position
      if (combat.selectedShip && !combat.selectedShip.isDestroyed) {
        combat.selectedShip.setMoveTarget(
          Math.max(300, Math.min(WORLD_W - 300, wx)),
          Math.max(300, Math.min(WORLD_H - 300, wy))
        );
        audio.play('move_order', 0.5);
      }
    });
  }

  renderTacticalMap(combat) {
    const mapEl = document.getElementById('tactical-map');
    if (!mapEl || mapEl.classList.contains('hidden')) return;
    const canvas = document.getElementById('tac-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const sx = W / WORLD_W, sy = H / WORLD_H;

    // Background
    ctx.fillStyle = '#040f20';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(0,229,255,0.1)';
    ctx.lineWidth = 1;
    const gridN = 10;
    for (let i = 0; i <= gridN; i++) {
      const x = i * W / gridN, y = i * H / gridN;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Terrain — distinct icons per type
    for (const t of combat.terrain) {
      const tx = t.x * sx, ty = t.y * sy, tr = Math.max(4, t.radius * Math.min(sx, sy));
      ctx.save();
      if (t.type === 'island') {
        // Rocky polygon (irregular hexagon)
        ctx.fillStyle = 'rgba(38,50,56,0.85)';
        ctx.strokeStyle = '#546e7a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const sides = 6;
        for (let k = 0; k < sides; k++) {
          const jitter = 1 + (Math.sin(t.x * 0.01 + k * 5.7) * 0.22);
          const a = (k / sides) * Math.PI * 2 - Math.PI / 6;
          const r = tr * jitter;
          k === 0 ? ctx.moveTo(tx + Math.cos(a)*r, ty + Math.sin(a)*r)
                  : ctx.lineTo(tx + Math.cos(a)*r, ty + Math.sin(a)*r);
        }
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        // 'R' label
        ctx.fillStyle = '#78909c'; ctx.font = '7px monospace'; ctx.textAlign = 'center';
        ctx.fillText('ROCK', tx, ty + 3);
      } else if (t.type === 'rock_pillar') {
        // Grey pentagon (rock column)
        ctx.fillStyle = 'rgba(55,71,79,0.8)';
        ctx.strokeStyle = '#78909c';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const pSides = 5;
        for (let k = 0; k < pSides; k++) {
          const a = (k / pSides) * Math.PI * 2 - Math.PI / 2;
          const r = tr * 0.85;
          k === 0 ? ctx.moveTo(tx + Math.cos(a)*r, ty + Math.sin(a)*r)
                  : ctx.lineTo(tx + Math.cos(a)*r, ty + Math.sin(a)*r);
        }
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#90a4ae'; ctx.font = '7px monospace'; ctx.textAlign = 'center';
        ctx.fillText('PILLAR', tx, ty + 3);
      } else if (t.type === 'kelp') {
        // Green hatched oval
        ctx.fillStyle = 'rgba(27,94,32,0.35)';
        ctx.strokeStyle = 'rgba(76,175,80,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(tx, ty, tr * 1.1, tr * 0.75, 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(76,175,80,0.7)'; ctx.font = '7px monospace'; ctx.textAlign = 'center';
        ctx.fillText('KELP', tx, ty + 3);
      } else if (t.type === 'vent') {
        // Orange upward triangle
        ctx.fillStyle = 'rgba(183,28,28,0.5)';
        ctx.strokeStyle = 'rgba(255,87,34,0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx, ty - tr * 0.9);
        ctx.lineTo(tx + tr * 0.7, ty + tr * 0.5);
        ctx.lineTo(tx - tr * 0.7, ty + tr * 0.5);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,87,34,0.9)'; ctx.font = '7px monospace'; ctx.textAlign = 'center';
        ctx.fillText('VENT', tx, ty + tr * 0.5 + 8);
      } else if (t.type === 'algae_bloom') {
        // Soft green cloud
        const grad = ctx.createRadialGradient(tx, ty, 0, tx, ty, tr);
        grad.addColorStop(0, 'rgba(100,180,80,0.35)');
        grad.addColorStop(1, 'rgba(50,120,40,0.05)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(tx, ty, tr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(100,200,80,0.7)'; ctx.font = '7px monospace'; ctx.textAlign = 'center';
        ctx.fillText('ALGAE', tx, ty + 3);
      }
      ctx.restore();
    }

    // Last-known position ghost markers
    for (const en of combat.enemyShips) {
      if (en.isDestroyed || en.detectionLevel > 0) continue;
      if (en._lastKnownX === null || en._lastKnownTimer <= 0) continue;
      const alpha = en._lastKnownTimer / 10.0;
      const lx = en._lastKnownX * sx, ly = en._lastKnownY * sy;
      ctx.save();
      ctx.globalAlpha = alpha * 0.7;
      ctx.strokeStyle = '#ff9100';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx, ly - 5); ctx.lineTo(lx + 5, ly); ctx.lineTo(lx, ly + 5); ctx.lineTo(lx - 5, ly); ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // Comms datalink links between friendly ships
    const drawnPairs = new Set();
    for (const a of combat.playerShips) {
      if (a.isDestroyed) continue;
      for (const b of combat.playerShips) {
        if (b.isDestroyed || a.id >= b.id) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) > COMMS_RANGE) continue;
        const pk = `${Math.min(a.id,b.id)}_${Math.max(a.id,b.id)}`;
        if (drawnPairs.has(pk)) continue;
        drawnPairs.add(pk);
        ctx.save();
        ctx.strokeStyle = 'rgba(0,255,136,0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 8]);
        ctx.beginPath();
        ctx.moveTo(a.x * sx, a.y * sy);
        ctx.lineTo(b.x * sx, b.y * sy);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // Move target lines for ALL player ships
    const sel = combat.selectedShip;
    for (const ps of combat.playerShips) {
      if (ps.isDestroyed || ps.atTarget || ps.moveTargetX === null) continue;
      ctx.save();
      ctx.strokeStyle = ps === sel ? 'rgba(0,229,255,0.7)' : 'rgba(0,229,255,0.3)';
      ctx.setLineDash([3, 5]);
      ctx.lineWidth = ps === sel ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(ps.x * sx, ps.y * sy);
      ctx.lineTo(ps.moveTargetX * sx, ps.moveTargetY * sy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Attack target lines (player ships)
    for (const ps of combat.playerShips) {
      if (ps.isDestroyed || !ps.attackTarget || ps.attackTarget.isDestroyed) continue;
      const tgt = ps.attackTarget;
      if (tgt.detectionLevel === 0) continue;
      const tdx = (tgt._displayX !== null && tgt._displayX !== undefined) ? tgt._displayX : tgt.x;
      const tdy = (tgt._displayY !== null && tgt._displayY !== undefined) ? tgt._displayY : tgt.y;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,68,68,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ps.x * sx, ps.y * sy);
      ctx.lineTo(tdx * sx, tdy * sy);
      ctx.stroke();
      ctx.restore();
    }

    // Enemy contacts (use _displayX/Y for fog-of-war accuracy)
    for (const en of combat.enemyShips) {
      if (en.isDestroyed || en.detectionLevel === 0) continue;
      const dx = (en._displayX !== null && en._displayX !== undefined) ? en._displayX : en.x;
      const dy = (en._displayY !== null && en._displayY !== undefined) ? en._displayY : en.y;
      const ex = dx * sx, ey = dy * sy;
      if (en.detectionLevel === 2 && (en._displayAccuracy === undefined || en._displayAccuracy >= 0.85)) {
        // Fully identified — filled triangle
        ctx.fillStyle = en._revealed ? '#ffd54f' : '#ff4444';
        ctx.beginPath();
        ctx.moveTo(ex, ey - 5); ctx.lineTo(ex + 4, ey + 3); ctx.lineTo(ex - 4, ey + 3); ctx.closePath();
        ctx.fill();
        if (en._revealed) {
          // Gold lock bracket around revealed ships
          const pulse = 0.55 + 0.35 * Math.abs(Math.sin(Date.now() * 0.004));
          ctx.strokeStyle = `rgba(255,213,79,${pulse})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(ex, ey, 7, 0, Math.PI * 2); ctx.stroke();
        }
      } else {
        // Contact blip (det=1 or low-accuracy det=2) — circle, size based on accuracy
        const acc = en._displayAccuracy || 0.3;
        ctx.fillStyle = acc >= 0.5 ? '#ff8800' : '#996600';
        ctx.beginPath(); ctx.arc(ex, ey, 3 + (1 - acc) * 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Player ships
    for (const ps of combat.playerShips) {
      if (ps.isDestroyed) continue;
      const px = ps.x * sx, py = ps.y * sy;
      const isSelected = ps === sel;
      const isHovered = ps === this._tacmapHoverShip;
      // Selection ring
      if (isSelected) {
        const pulse = 0.6 + 0.35 * Math.abs(Math.sin(Date.now() * 0.004));
        ctx.strokeStyle = `rgba(0,229,255,${pulse})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(px, py, 12, 0, Math.PI * 2); ctx.stroke();
        // Inner ring
        ctx.strokeStyle = `rgba(0,229,255,${pulse * 0.5})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.stroke();
      } else if (isHovered) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.stroke();
      }
      // Ship triangle pointing in heading direction
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(-ps.angle);
      ctx.fillStyle = ps.isFlagship ? '#00e5ff' : '#4fc3f7';
      if (isSelected) ctx.fillStyle = '#ffffff';
      // Evasive mode: orange tint
      if (ps._evadeMode) ctx.fillStyle = isSelected ? '#ffe082' : '#ffa726';
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath();
      ctx.fill();
      ctx.restore();

      // HP bar
      const hpPct = ps.hull / ps.maxHull;
      const barW = 16, barH = 3;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(px - barW/2, py + 8, barW, barH);
      ctx.fillStyle = hpPct > 0.5 ? '#66bb6a' : hpPct > 0.25 ? '#ffa726' : '#ef5350';
      ctx.fillRect(px - barW/2, py + 8, barW * hpPct, barH);

      // Ship name label (selected or hovered)
      if (isSelected || isHovered) {
        ctx.font = isSelected ? 'bold 8px monospace' : '8px monospace';
        ctx.fillStyle = isSelected ? '#00e5ff' : 'rgba(255,255,255,0.7)';
        ctx.textAlign = 'center';
        ctx.fillText(ps.name.replace('INS ', ''), px, py - 9);
        ctx.textAlign = 'left';
      }
    }

    // Overlay range rings — mirror 3D overlays if active
    const r3d = this.game.renderer;
    if (r3d) {
      const selectedSet = new Set();
      if (sel && !sel.isDestroyed) selectedSet.add(sel);
      for (const ps of (combat.selectedShips || [])) {
        if (!ps.isDestroyed) selectedSet.add(ps);
      }

      for (const ps of selectedSet) {
        const px = ps.x * sx, py = ps.y * sy;
        ctx.save();

        // Weapon range ring (amber, primary selected only)
        if (r3d._ovr_weapon_range && ps === sel && ps.weapons && ps.weapons.length > 0) {
          const maxR = Math.max(...ps.weapons.filter(w => w.type !== 'ew').map(w => w.range || 0));
          if (maxR > 0) {
            const rr = maxR * sx;
            const pulse = 0.5 + 0.35 * Math.abs(Math.sin(Date.now() * 0.003));
            ctx.strokeStyle = `rgba(255,180,0,${pulse})`;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        // Sonar range ring (cyan)
        if (r3d._ovr_sonar) {
          const rr = ACTIVE_SONAR_RANGE * sx;
          const pulse = 0.4 + 0.2 * Math.abs(Math.sin(Date.now() * 0.0025));
          ctx.strokeStyle = `rgba(0,229,255,${pulse})`;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 6]);
          ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
        }

        // Visual range ring (green)
        if (r3d._ovr_visual) {
          const rr = VISUAL_RANGE * sx;
          const pulse = 0.45 + 0.2 * Math.abs(Math.sin(Date.now() * 0.003));
          ctx.strokeStyle = `rgba(76,175,80,${pulse})`;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 5]);
          ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.restore();
      }
    }

    // Depth scale indicator (right side)
    ctx.fillStyle = 'rgba(0,229,255,0.06)';
    ctx.fillRect(W - 14, 0, 14, H);
    if (sel && !sel.isDestroyed) {
      const depthY = (sel.depth / WORLD_DEPTH) * H;
      ctx.fillStyle = '#00e5ff';
      ctx.fillRect(W - 12, depthY - 2, 10, 4);
    }
    // Depth label
    ctx.fillStyle = 'rgba(0,229,255,0.4)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('DEPTH', W - 16, 10);

    ctx.textAlign = 'left';
  }

  _setDCPriority(task) {
    const combat = this.game.combat;
    const sel = combat && combat.selectedShip;
    if (!sel) return;
    sel._dcPriority = task;
    audio.play('ui_click');
    // Update button active states
    ['fire','flood','hull'].forEach(t => {
      const btn = document.getElementById(`btn-dc-${t}`);
      if (btn) btn.classList.toggle('active', t === task);
    });
  }

  openShipDetail(ship) {
    this._sdpPinned = true;
    const panel = document.getElementById('ship-detail-panel');
    if (panel) panel.classList.remove('hidden');
  }

  updateShipDetailPanel(combat) {
    const panel = document.getElementById('ship-detail-panel');
    if (!panel) return;
    const sel = combat && combat.selectedShip;
    if (!sel || sel.isDestroyed) {
      if (!this._sdpPinned) panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');

    // Header
    document.getElementById('sdp-name').textContent = sel.name;
    const tpl = (typeof SHIP_TEMPLATES !== 'undefined' && SHIP_TEMPLATES[sel.templateId]) || {};
    const classEl = document.getElementById('sdp-class');
    classEl.textContent = tpl.shipClass || '';
    if (sel.isCrippled) {
      classEl.textContent += '  ⚠ CRIPPLED';
      classEl.style.color = '#ff8800';
    } else {
      classEl.style.color = '';
    }

    // HP bar
    const hpPct = (sel.hull / sel.maxHull * 100).toFixed(0);
    document.getElementById('sdp-hull-fill').style.width = hpPct + '%';
    const hullFill = document.getElementById('sdp-hull-fill');
    hullFill.style.background = hpPct > 50 ? '#4caf50' : hpPct > 25 ? '#ff9800' : '#f44336';
    document.getElementById('sdp-hull-val').textContent = `${Math.round(sel.hull)}/${sel.maxHull}`;

    // Stats row
    const spd = Math.round(sel.speed);
    const maxSpd = Math.round(sel.maxSpeed);
    const hdg = Math.round(((-sel.angle * 180 / Math.PI) + 360) % 360);
    document.getElementById('sdp-speed').textContent  = `SPD ${spd}/${maxSpd}`;
    document.getElementById('sdp-depth').textContent  = `${Math.round(sel.depth || 0)}m`;
    document.getElementById('sdp-heading').textContent = `HDG ${hdg}°`;

    // Subsystem health
    const sysEl = document.getElementById('sdp-subsystems');
    if (sysEl && sel._subsystems) {
      const sys = sel._subsystems;
      const sysItems = [
        { key: 'engines',   label: 'ENGINES',   icon: '⚙' },
        { key: 'weapons',   label: 'WEAPONS',   icon: '⬤' },
        { key: 'sensors',   label: 'SENSORS',   icon: '◎' },
        { key: 'targeting', label: 'TARGETING', icon: '⊕' },
      ];
      sysEl.innerHTML = sysItems.map(s => {
        const pct = Math.round(sys[s.key] || 100);
        const col = pct > 70 ? '#4caf50' : pct > 35 ? '#ff9800' : '#f44336';
        const isTgt = sel.targetSubsystem === s.key;
        return `<div class="sdp-sys-row${isTgt ? ' sdp-sys-targeted' : ''}" data-sys="${s.key}" title="Target ${s.label}">
          <span class="sdp-sys-icon">${s.icon}</span>
          <span class="sdp-sys-name">${s.label}</span>
          <div class="sdp-sys-bar"><div class="sdp-sys-fill" style="width:${pct}%;background:${col}"></div></div>
          <span class="sdp-sys-pct">${pct}%</span>
        </div>`;
      }).join('');

      // Bind click-to-target on subsystem rows (for the selected ship's attack target)
      sysEl.querySelectorAll('.sdp-sys-row[data-sys]').forEach(row => {
        row.onclick = () => {
          const k = row.dataset.sys;
          sel.targetSubsystem = (sel.targetSubsystem === k) ? null : k;
        };
      });
    }

    // Weapons
    const wepEl = document.getElementById('sdp-weapons');
    wepEl.innerHTML = '';
    for (const w of sel.weapons) {
      if (w.type === 'ew') continue;
      const isReady = w.timer <= 0;
      const cdPct = isReady ? 100 : (1 - w.timer / w.cd) * 100;
      const ammoStr = w.maxAmmo !== undefined ? `×${w.ammo === Infinity ? '∞' : w.ammo}` : '';
      // Slot health indicator
      const slot = w._slot;
      const slotHp = slot ? Math.round(slot.health) : null;
      const isDestroyed = slotHp !== null && slotHp <= 0;
      const slotColor = slotHp === null ? '' : slotHp <= 0 ? '#f44336' : slotHp < 50 ? '#ff9800' : '#4caf50';
      const slotLabel = slot ? (isDestroyed ? 'DEST' : slotHp < 100 ? slotHp+'%' : '') : '';
      const slotStr = slotLabel ? ` <span style="font-size:10px;color:${slotColor}">[${slotLabel}]</span>` : '';
      const row = document.createElement('div');
      row.className = `sdp-weapon-row${isDestroyed ? ' slot-destroyed' : ''}`;
      row.innerHTML = `
        <span class="sdp-wep-name">${w.name}${slot ? `<span style="font-size:9px;color:#446;margin-left:3px">${slot.label}</span>` : ''}</span>
        <div class="sdp-wep-cd"><div class="sdp-wep-cd-fill ${isReady && !isDestroyed ? 'ready' : ''}" style="width:${isDestroyed ? 0 : cdPct.toFixed(0)}%"></div></div>
        <span class="sdp-wep-ammo">${isDestroyed ? '<span style="color:#f44336">DEST</span>' : (isReady ? 'RDY' : w.timer.toFixed(1)+'s')}${ammoStr ? ' '+ammoStr : ''}${slotStr}</span>`;
      wepEl.appendChild(row);
    }

    // Damage control
    const dcEl = document.getElementById('sdp-dc-status');
    const fires = sel.fires ? sel.fires.length : 0;
    const flood = sel.flooding ? Math.round(sel.flooding * 100) : 0;
    const breach = sel.hullBreaches || 0;
    const busyCrew = sel.crewBusy ? sel.crewBusy.length : 0;
    const totalCrew = sel.repairCrews || 0;
    const buoyancyLost = sel._buoyancyDamaged;
    let dcHtml = '';
    if (fires > 0)       dcHtml += `<div style="color:#ff5722">🔥 ${fires} ACTIVE FIRE${fires>1?'S':''}</div>`;
    if (breach > 0)      dcHtml += `<div style="color:#ff9800">⚠ ${breach} HULL BREACH${breach>1?'ES':''}</div>`;
    if (flood > 0)       dcHtml += `<div style="color:#29b6f6">💧 FLOODING ${flood}%</div>`;
    if (buoyancyLost)    dcHtml += `<div style="color:#f44336">↕ BUOYANCY LOSS</div>`;
    if (fires===0 && breach===0 && flood===0 && !buoyancyLost) dcHtml = '<div style="color:#4caf50">✓ NO DAMAGE</div>';
    dcHtml += `<div style="color:#667;margin-top:3px">DC CREW: ${busyCrew}/${totalCrew} BUSY</div>`;
    dcEl.innerHTML = dcHtml;
    // Sync DC priority buttons
    const prio = sel._dcPriority || 'fire';
    ['fire','flood','hull'].forEach(t => {
      const btn = document.getElementById(`btn-dc-${t}`);
      if (btn) btn.classList.toggle('active', t === prio);
    });

    // Sync blind fire button
    const blindFireBtn = document.getElementById('btn-blind-fire');
    if (blindFireBtn) {
      blindFireBtn.classList.toggle('active', !!sel._fireAtContacts);
      blindFireBtn.textContent = sel._fireAtContacts ? '◉ BLIND FIRE: ON' : '◉ BLIND FIRE: OFF';
    }

    // Sync free move button
    const freeMoveBtn = document.getElementById('btn-free-move');
    if (freeMoveBtn) {
      freeMoveBtn.classList.toggle('active', !!sel._freeMove);
      freeMoveBtn.textContent = sel._freeMove ? '⇄ FREE MOVE: ON' : '⇄ FREE MOVE: OFF';
    }

    // Sync evasive mode button
    const evadeBtn = document.getElementById('btn-evade-mode');
    if (evadeBtn) {
      evadeBtn.classList.toggle('active', !!sel._evadeMode);
      evadeBtn.textContent = sel._evadeMode ? '↯ EVASIVE: ON' : '↯ EVASIVE: OFF';
    }

    // Orders + engagement status
    const ordEl = document.getElementById('sdp-orders');
    const tgt = sel.attackTarget && !sel.attackTarget.isDestroyed ? sel.attackTarget : null;
    const tgtName = tgt ? tgt.name : '—';
    const mvDist = (sel.moveTargetX !== null && !sel.atTarget)
      ? Math.round(Math.hypot(sel.x - sel.moveTargetX, sel.y - sel.moveTargetY)) + 'u'
      : 'HOLDING';

    // Determine engagement status
    let engStatus = '', engColor = '#667';
    if (tgt) {
      const dxy = Math.hypot(sel.x - tgt.x, sel.y - tgt.y);
      const dz  = Math.abs(sel.depth - tgt.depth);
      const maxRange = sel.weapons.reduce((best, w) =>
        (w.type !== 'ew' && w.range > best) ? w.range : best, 600);
      const anyReady = sel.weapons.some(w => w.type !== 'ew' && w.timer <= 0);
      const canReach = sel.weapons.some(w =>
        w.type !== 'ew' && dxy <= w.range && dz <= 450);

      if (canReach && anyReady) {
        engStatus = '⬤ FIRING'; engColor = '#f44336';
      } else if (canReach && !anyReady) {
        engStatus = '◎ RELOADING'; engColor = '#ff9800';
      } else if (dz > 450) {
        engStatus = '⬇ WRONG DEPTH'; engColor = '#ff9800';
      } else if (dxy > maxRange) {
        const closingStr = sel._autoApproaching ? ' · CLOSING' : ' · OUT OF RANGE';
        engStatus = `◇${closingStr}`; engColor = sel._autoApproaching ? '#29b6f6' : '#ff9800';
      } else {
        engStatus = '◇ BEARING'; engColor = '#ffeb3b';
      }
    }

    ordEl.innerHTML = `
      <div class="sdp-orders-row">TARGET: <span style="color:${tgt ? '#ff8a80' : '#667'}">${tgtName}</span>
        ${engStatus ? `<span style="color:${engColor};font-size:9px;margin-left:4px">${engStatus}</span>` : ''}
      </div>
      <div class="sdp-orders-row">MOVING: <span>${mvDist}</span></div>`;
  }

  openDamageControl(ship) {
    if (!ship || ship.isDestroyed) return;
    if (!this._dcModal) this._dcModal = new DamageControlModal();
    this._dcModal.open(ship);
  }

  setArcOverlayHint(on) {
    const btn = document.getElementById('btn-arc-overlay');
    if (btn) btn.textContent = `ARCS [G]: ${on ? 'ON' : 'OFF'}`;
  }

  showCombatTutorial() {
    if (this._tutorialShown) {
      if (this.game.combat) this.game.combat.paused = false;
      return;
    }
    const tut = document.getElementById('combat-tutorial');
    if (tut) tut.classList.remove('hidden');
    // combat stays paused until the player dismisses
  }

  updateCombatHUD(combat) {
    if (!combat) return;
    this._currentCombat = combat;

    // Pause
    const pauseBtn = document.getElementById('btn-pause-combat');
    const pauseSt  = document.getElementById('pause-status');
    if (combat.paused) {
      pauseBtn.textContent = '▶ RESUME';
      pauseBtn.classList.add('paused');
      pauseSt.textContent = '⏸ TACTICAL PAUSE';
      pauseSt.classList.add('active');
    } else {
      pauseBtn.textContent = '⏸ PAUSE';
      pauseBtn.classList.remove('paused');
      pauseSt.textContent = '';
      pauseSt.classList.remove('active');
    }

    // Fleet icons
    const hudFleet = document.getElementById('hud-fleet-icons');
    hudFleet.innerHTML = '';
    combat.playerShips.forEach((s, idx) => {
      const isSelected = s === combat.selectedShip;
      const isInGroup  = combat.selectedShips && combat.selectedShips.includes(s);
      const isPinged   = this._detectedShipTimers && this._detectedShipTimers[s.id] > 0;
      const div = document.createElement('div');
      div.dataset.shipIdx = idx;
      div.className = [
        'hud-ship-icon',
        s.isDestroyed ? 'dead' : '',
        isSelected ? 'selected' : (isInGroup ? 'in-group' : ''),
        s.isFlagship ? 'flagship' : '',
        isPinged ? 'sonar-ping' : '',
        s.isCrippled ? 'crippled' : '',
      ].filter(Boolean).join(' ');
      div.title = s.name + (isInGroup && !isSelected ? ' [grouped — shift+click to remove]' : ' [click to select · shift+click to group]');
      const hp = s.isDestroyed ? 0 : s.hull / s.maxHull;
      const modes = (s._freeMove ? '<span class="icon-mode fm" title="Free Move">F</span>' : '') +
                    (s._fireAtContacts ? '<span class="icon-mode bf" title="Blind Fire">B</span>' : '') +
                    (s._evadeMode ? '<span class="icon-mode ev" title="Evasive">EV</span>' : '');
      div.innerHTML = `
        <div class="icon-header"><span class="icon-name">${s.name.replace('INS ','')}</span>${modes}</div>
        <div class="icon-bars">
          <div class="icon-bar hull" style="width:${(hp*100).toFixed(0)}%"></div>
        </div>`;
      hudFleet.appendChild(div);
    });

    // Selected ship info
    const selInfo = document.getElementById('hud-selected-info');
    const sel = combat.selectedShip;
    if (sel && !sel.isDestroyed) {
      const hp  = (sel.hull / sel.maxHull * 100).toFixed(0);
      const tpl = SHIP_TEMPLATES[sel.templateId] || {};
      const depthPct = Math.round((sel.depth || 0) / WORLD_DEPTH * 100);
      const depthM   = Math.round(sel.depth || 0);
      const isJammed = sel.ewJammedTimer > 0;
      // Torpedo ammo
      const torpWeapons = sel.weapons.filter(w => w.type === 'torpedo' && w.maxAmmo !== undefined);
      const torpInfo = torpWeapons.map(w =>
        `<span class="ammo-badge ${w.ammo === 0 ? 'empty' : ''}" title="${w.name}">⦿${w.ammo === Infinity ? '∞' : w.ammo}</span>`
      ).join('');
      // EW status
      const ewInfo = sel.ewStrength > 0 ? `<span class="ew-badge" title="EW Jamming active">⚡EW</span>` : '';

      // Damage control status
      const fireCount = sel.fires ? sel.fires.length : 0;
      const floodPct  = sel.flooding ? Math.round(sel.flooding * 100) : 0;
      const breaches  = sel.hullBreaches || 0;
      const busyCrew  = sel.crewBusy ? sel.crewBusy.length : 0;
      const totalCrew = sel.repairCrews || 0;
      let dcStatus = '';
      if (fireCount > 0)       dcStatus += `<span class="dc-fire">🔥×${fireCount}</span>`;
      if (breaches > 0)        dcStatus += `<span class="dc-breach">⚠ ${breaches} BREACH${breaches > 1 ? 'ES' : ''}</span>`;
      if (floodPct > 0)        dcStatus += `<span class="dc-flood">💧${floodPct}%</span>`;
      if (sel._buoyancyDamaged) dcStatus += `<span class="dc-breach">↕ BUOYANCY</span>`;
      if (dcStatus)            dcStatus += `<span class="dc-crew">DC ${busyCrew}/${totalCrew}</span>`;

      selInfo.innerHTML = `
        <div class="sel-name">${sel.name}</div>
        <div class="sel-class">${tpl.shipClass || ''} ${sel.level > 1 ? `<span class="lv">Lv${sel.level}</span>` : ''}${ewInfo}</div>
        <div class="sel-bars">
          <div class="sel-bar-row"><span>HULL</span><div class="sel-bar"><div class="fill hull" style="width:${hp}%"></div></div><span>${Math.round(sel.hull)}/${sel.maxHull}</span></div>
          <div class="sel-bar-row depth-row">
            <span>DEPTH</span>
            <div class="sel-bar depth-bar"><div class="fill depth" style="width:${depthPct}%"></div></div>
            <span>${depthM}m ${isJammed ? '<span class="jammed-tag">JAMMED</span>': ''}</span>
          </div>
        </div>
        ${dcStatus ? `<div class="sel-dc">${dcStatus}</div>` : ''}
        <div class="sel-weapons">
          ${torpInfo}
        </div>
        <div class="sel-target">${sel.attackTarget && !sel.attackTarget.isDestroyed ? `⇒ ${sel.attackTarget.name}` : 'No target'}</div>`;
    } else {
      selInfo.innerHTML = '<div class="sel-hint">Tap/click a ship to select</div>';
    }

    // Depth gauge on right side
    const gaugeFill   = document.getElementById('depth-gauge-fill');
    const gaugeMarker = document.getElementById('depth-gauge-marker');
    const gaugeVal    = document.getElementById('depth-gauge-val');
    if (sel && !sel.isDestroyed) {
      const pct = ((sel.depth || 0) / WORLD_DEPTH * 100).toFixed(1);
      if (gaugeFill)   gaugeFill.style.height = pct + '%';
      if (gaugeMarker) gaugeMarker.style.top   = pct + '%';
      if (gaugeVal)    gaugeVal.textContent = Math.round(sel.depth || 0) + 'm';
    }

    // Order hint — guides new players through the interaction loop
    const hint = document.getElementById('order-hint');
    if (combat.paused) {
      if (!sel || sel.isDestroyed) {
        hint.textContent = 'PAUSED — Left-click YOUR ship to select · Drag to box-select';
      } else if (!sel.attackTarget || sel.attackTarget.isDestroyed) {
        hint.textContent = 'PAUSED — Right-click: move/attack · Right-drag ↕: move+depth · Q/E: depth (all selected)';
      } else {
        hint.textContent = 'PAUSED — ▶ RESUME · Right-drag ↔: orbit · Ctrl+scroll: tilt · Q/E: depth · M: tacmap';
      }
      hint.classList.add('active');
    } else {
      if (!sel || sel.isDestroyed) {
        hint.textContent = 'Left-click ship to select · Drag to box-select · Left-click empty: deselect';
      } else if (!sel.attackTarget || sel.attackTarget.isDestroyed) {
        hint.textContent = 'Right-click: move (empty) / attack (enemy) · Right-drag ↕: set depth · Q/E: depth all';
      } else {
        hint.textContent = `→ ${sel.attackTarget.name} · Right-click: move/attack · Q/E: depth all · Esc: deselect`;
      }
      hint.classList.remove('active');
    }

    // Timer
    const t = Math.floor(combat.time);
    document.getElementById('combat-timer').textContent =
      `${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toString().padStart(2,'0')}`;

    // Radar contact summary
    const alive    = combat.enemyShips.filter(s => !s.isDestroyed);
    const contacts = alive.filter(s => s.detectionLevel === 1).length;
    const unknown  = alive.filter(s => s.detectionLevel === 0).length;
    const identified = alive.filter(s => s.detectionLevel === 2).length;
    const radarEl = document.getElementById('radar-status');
    if (radarEl) {
      const viewNet = sel ? [sel, ...(sel._commsPartners || [])] : combat.playerShips;
      const contactMap = {};
      for (const vs of viewNet) {
        for (const [eid, c] of Object.entries(vs._contacts || {})) {
          if (!contactMap[eid] || c.accuracy > contactMap[eid].accuracy) contactMap[eid] = c;
        }
      }
      const allContacts = Object.values(contactMap);
      const visual  = allContacts.filter(c => c.via === 'visual').length;
      const pingC   = allContacts.filter(c => c.via === 'ping' || c.accuracy >= 0.5).length;
      const rough   = allContacts.filter(c => c.accuracy < 0.5).length;
      const partners = sel ? (sel._commsPartners || []).length : 0;
      const commsStr = partners > 0 ? ` · DATALINK ×${partners}` : ' · NO DATALINK';
      radarEl.textContent = allContacts.length > 0
        ? `CONTACTS: ${visual} VIS · ${pingC} RADAR · ${rough} ROUGH${commsStr}`
        : `NO CONTACTS${commsStr}`;
    }

    // Fleet command button states — reflect current selected ships
    const fleetShips = (combat.selectedShips && combat.selectedShips.length > 0)
      ? combat.selectedShips
      : (combat.selectedShip ? [combat.selectedShip] : []);
    const fmBtn  = document.getElementById('btn-fleet-free-move');
    const bfBtn  = document.getElementById('btn-fleet-blind-fire');
    if (fmBtn) {
      const allFM  = fleetShips.length > 0 && fleetShips.every(s => s._freeMove);
      const someFM = fleetShips.some(s => s._freeMove);
      fmBtn.textContent = allFM ? '⇄ FREE MOVE: ON' : someFM ? '⇄ FREE MOVE: MIX' : '⇄ FREE MOVE: OFF';
      fmBtn.classList.toggle('active', allFM);
      fmBtn.classList.toggle('partial', someFM && !allFM);
    }
    if (bfBtn) {
      const allBF  = fleetShips.length > 0 && fleetShips.every(s => s._fireAtContacts);
      const someBF = fleetShips.some(s => s._fireAtContacts);
      bfBtn.textContent = allBF ? '◉ BLIND FIRE: ON' : someBF ? '◉ BLIND FIRE: MIX' : '◉ BLIND FIRE: OFF';
      bfBtn.classList.toggle('active', allBF);
      bfBtn.classList.toggle('partial', someBF && !allBF);
    }

    // Active sonar PING button cooldown
    const pingBtn = document.getElementById('btn-active-sonar');
    if (pingBtn && sel && !sel.isDestroyed) {
      const cd = sel.activeSonarCooldown || 0;
      if (cd > 0) {
        pingBtn.textContent = `PING [F] ${Math.ceil(cd)}s`;
        pingBtn.classList.add('on-cooldown');
      } else {
        pingBtn.textContent = 'PING [F]';
        pingBtn.classList.remove('on-cooldown');
      }
    }

    // Engine stall indicator
    if (sel && !sel.isDestroyed && sel._engineStallTimer > 0) {
      selInfo.innerHTML += `<div class="engine-stall-tag">⚙ ENGINES STALLED ${sel._engineStallTimer.toFixed(1)}s</div>`;
    }

    // Sonar detection warning (player ship pinged by enemy)
    if (combat.pendingPlayerSonarHits && combat.pendingPlayerSonarHits.length > 0) {
      if (!this._detectedShipTimers) this._detectedShipTimers = {};
      const names = combat.pendingPlayerSonarHits.map(h => {
        const ship = combat.playerShips.find(s => s.id === h.shipId);
        if (ship) this._detectedShipTimers[h.shipId] = 3.5;
        return ship ? ship.name.replace('INS ', '') : '?';
      }).join(', ');
      this._sonarDetectWarningTimer = 3.0;
      this._sonarDetectWarningText = `SONAR CONTACT — ${names} DETECTED`;
    }
    if (this._sonarDetectWarningTimer > 0) {
      this._sonarDetectWarningTimer -= 0.016;
    }
    if (this._detectedShipTimers) {
      for (const id of Object.keys(this._detectedShipTimers)) {
        this._detectedShipTimers[id] -= 0.016;
        if (this._detectedShipTimers[id] <= 0) delete this._detectedShipTimers[id];
      }
    }

    // Reinforcement alert / sonar detect alert
    const alertEl = document.getElementById('combat-alert');
    if (alertEl) {
      if (this._sonarDetectWarningTimer > 0) {
        alertEl.textContent = `\u26a0 ${this._sonarDetectWarningText}`;
        alertEl.classList.remove('hidden');
        alertEl.style.color = '#ff6600';
        alertEl.style.borderColor = '#ff6600';
        alertEl.style.background = 'rgba(255,102,0,0.12)';
        alertEl.style.opacity = Math.min(1, this._sonarDetectWarningTimer);
      } else if (combat.reinforcementAlert && combat.reinforcementAlert.timer > 0) {
        alertEl.textContent = '⚠ REINFORCEMENTS INBOUND';
        alertEl.classList.remove('hidden');
        alertEl.style.color = '';
        alertEl.style.borderColor = '';
        alertEl.style.background = '';
        alertEl.style.opacity = Math.min(1, combat.reinforcementAlert.timer);
      } else {
        alertEl.classList.add('hidden');
      }
    }

    // Objective counter
    const objEl = document.getElementById('hud-objective');
    if (objEl) {
      const enemiesLeft = combat.enemyShips.filter(s => !s.isDestroyed).length;
      objEl.textContent = enemiesLeft > 0
        ? `OBJECTIVE: ${enemiesLeft} ENEM${enemiesLeft === 1 ? 'Y' : 'IES'} REMAINING`
        : 'ALL CONTACTS ELIMINATED';
    }

    this.updateShipDetailPanel(combat);
  }

  // ── Post-Combat Rewards ───────────────────────────────────────
  showRewards(combatResult, campaign) {
    this.showScreen('rewards');
    const win = combatResult.result === 'win';
    document.getElementById('rewards-title').textContent = win ? 'VICTORY' : 'FLAGSHIP SURVIVED';
    document.getElementById('rewards-subtitle').textContent = win ? 'All enemy contacts eliminated.' : 'The fleet took heavy losses.';
    document.getElementById('rewards-credits').textContent = campaign.credits;

    // Stats
    const stats = combatResult.stats;
    document.getElementById('battle-stats').innerHTML = `
      <div class="stat-row"><span>Enemies Destroyed</span><span>${stats.enemiesDestroyed}</span></div>
      <div class="stat-row"><span>Ships Lost</span><span class="${stats.shipsLost > 0 ? 'danger' : ''}">${stats.shipsLost}</span></div>
      <div class="stat-row"><span>Damage Dealt</span><span>${Math.round(stats.damageDone)}</span></div>
      <div class="stat-row"><span>Credits Earned</span><span>+${stats.creditsEarned}</span></div>`;

    // Upgrade choices
    const upgSec = document.getElementById('upgrade-section');
    const upgChoices = document.getElementById('upgrade-choices');
    if (win && campaign.playerFleetData.length > 0) {
      const picks = [...UPGRADE_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
      upgChoices.innerHTML = '';
      for (const upg of picks) {
        const div = document.createElement('div');
        div.className = 'upgrade-card';
        div.innerHTML = `
          <div class="upg-name">${upg.name}</div>
          <div class="upg-desc">${upg.desc}</div>
          <div class="upg-cost">⬡ ${upg.cost}</div>
          <div class="upg-ships"></div>`;
        const shipArea = div.querySelector('.upg-ships');
        for (const sd of campaign.playerFleetData) {
          const btn = document.createElement('button');
          btn.className = 'btn-sm-ship';
          btn.textContent = sd.name.replace('INS ', '');
          btn.disabled = campaign.credits < upg.cost;
          btn.onclick = () => {
            if (campaign.buyUpgrade(upg, sd.name)) {
              document.getElementById('rewards-credits').textContent = campaign.credits;
              btn.textContent = '✓';
              div.classList.add('applied');
              div.querySelectorAll('.btn-sm-ship').forEach(b => b.disabled = true);
            }
          };
          shipArea.appendChild(btn);
        }
        upgChoices.appendChild(div);
      }
      upgSec.style.display = '';
    } else {
      upgSec.style.display = 'none';
    }
  }

  _bindRewardEvents() {
    document.getElementById('btn-rewards-continue').addEventListener('click', () => this.game.continueFromRewards());
  }

  // ── Event Screen ──────────────────────────────────────────────
  showEvent(eventData, campaign, onDone) {
    this.showScreen('event');
    document.getElementById('event-title').textContent = eventData.title;
    document.getElementById('event-description').textContent = eventData.desc;
    const resultEl  = document.getElementById('event-result');
    const contBtn   = document.getElementById('btn-event-continue');
    const choicesEl = document.getElementById('event-choices');
    resultEl.classList.add('hidden');
    contBtn.classList.add('hidden');
    choicesEl.innerHTML = '';

    for (const choice of eventData.choices) {
      const btn = document.createElement('button');
      btn.className = 'btn-choice';
      btn.textContent = choice.text;
      btn.onclick = () => {
        const result = choice.outcome(campaign);
        campaign.save();
        choicesEl.innerHTML = '';
        resultEl.textContent = result;
        resultEl.classList.remove('hidden');
        contBtn.classList.remove('hidden');
        contBtn.onclick = onDone;
      };
      choicesEl.appendChild(btn);
    }
  }

  // ── Store Screen ──────────────────────────────────────────────
  showStore(campaign, onDone) {
    this.showScreen('store');
    const refreshCredits = () => document.getElementById('store-credits').textContent = campaign.credits;
    refreshCredits();

    // Inventory rolls once per visit
    if (!this._storeInventory) {
      this._storeInventory = {
        upgrades: [...UPGRADE_POOL].sort(() => Math.random() - 0.5).slice(0, 5),
        modules:  Object.values(MODULE_DATA).sort(() => Math.random() - 0.5).slice(0, 8),
      };
    }

    const renderStore = (tab) => {
      const container = document.getElementById('store-items');
      container.innerHTML = '';
      // Tab buttons
      const tabs = document.getElementById('store-tabs');
      if (tabs) tabs.querySelectorAll('.store-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));

      if (tab === 'upgrades') {
        for (const item of this._storeInventory.upgrades) {
          container.appendChild(this._makeStoreItem(item, campaign, refreshCredits));
        }
      } else if (tab === 'modules') {
        for (const mod of this._storeInventory.modules) {
          container.appendChild(this._makeModuleItem(mod, campaign, refreshCredits));
        }
      } else if (tab === 'recruit') {
        this._renderRecruitTab(container, campaign, refreshCredits);
      }
    };

    const tabs = document.getElementById('store-tabs');
    if (tabs) {
      tabs.querySelectorAll('.store-tab').forEach(btn => {
        btn.onclick = () => renderStore(btn.dataset.tab);
      });
    }
    renderStore('upgrades');

    document.getElementById('btn-store-leave').onclick = () => {
      this._storeInventory = null; // reset for next visit
      campaign.save();
      onDone();
    };
  }

  _makeStoreItem(item, campaign, refresh) {
    const div = document.createElement('div');
    div.className = 'store-item';
    const canAfford = campaign.credits >= item.cost;
    div.innerHTML = `
      <div class="item-name">${item.name}</div>
      <div class="item-desc">${item.desc}</div>
      <div class="item-cost ${canAfford ? '' : 'cant-afford'}">⬡ ${item.cost}</div>
      <div class="item-ships"></div>`;
    const shipArea = div.querySelector('.item-ships');
    for (const sd of campaign.playerFleetData) {
      const btn = document.createElement('button');
      btn.className = 'btn-sm-ship';
      btn.textContent = sd.name.replace('INS ', '');
      btn.disabled = !canAfford;
      btn.onclick = () => {
        if (campaign.buyUpgrade(item, sd.name)) {
          refresh();
          btn.textContent = '✓'; btn.disabled = true;
          div.querySelectorAll('.btn-sm-ship').forEach(b => { if (campaign.credits < item.cost) b.disabled = true; });
        }
      };
      shipArea.appendChild(btn);
    }
    return div;
  }

  _makeModuleItem(mod, campaign, refresh) {
    const div = document.createElement('div');
    div.className = 'store-item module-item';
    const catColor = { weapon:'#ff6e40', defense:'#40c4ff', system:'#69f0ae' }[mod.category] || '#aaa';
    div.innerHTML = `
      <div class="item-name"><span style="color:${catColor}">${mod.icon || ''} ${mod.name}</span></div>
      <div class="item-cat" style="color:${catColor};font-size:10px;text-transform:uppercase;letter-spacing:1px">${mod.category}</div>
      <div class="item-desc">${mod.desc}</div>
      <div class="item-cost ${campaign.credits >= mod.cost ? '' : 'cant-afford'}">⬡ ${mod.cost}</div>
      <div class="item-ships module-ships"></div>`;
    const shipArea = div.querySelector('.item-ships');
    for (const sd of campaign.playerFleetData) {
      const { slots, used } = campaign.getShipModuleSlots(sd);
      const slotsLeft = (slots[mod.category] || 0) - (used[mod.category] || 0);
      const btn = document.createElement('button');
      btn.className = 'btn-sm-ship';
      btn.textContent = sd.name.replace('INS ', '');
      btn.title = `${slotsLeft} ${mod.category} slot${slotsLeft !== 1 ? 's' : ''} free`;
      btn.disabled = campaign.credits < mod.cost || slotsLeft <= 0;
      if (slotsLeft <= 0) btn.style.opacity = '0.4';
      btn.onclick = () => {
        const result = campaign.buyModule(mod, sd.name);
        if (result.ok) {
          refresh();
          btn.textContent = '✓'; btn.disabled = true;
        } else {
          btn.title = result.reason;
          btn.style.borderColor = '#ff1744';
        }
      };
      shipArea.appendChild(btn);
    }
    return div;
  }

  _renderRecruitTab(container, campaign, refresh) {
    // Fleet size indicator
    const sizeDiv = document.createElement('div');
    sizeDiv.className = 'store-fleet-size';
    sizeDiv.textContent = `Fleet: ${campaign.playerFleetData.length} / ${MAX_FLEET_SIZE} ships`;
    container.appendChild(sizeDiv);

    for (const rec of RECRUITABLE_SHIPS) {
      const tpl = SHIP_TEMPLATES[rec.templateId];
      if (!tpl) continue;
      const slots = MODULE_SLOTS[rec.templateId] || {};
      const canAfford = campaign.credits >= rec.cost;
      const atMax = campaign.playerFleetData.length >= MAX_FLEET_SIZE;
      const div = document.createElement('div');
      div.className = 'store-item recruit-item';
      div.innerHTML = `
        <div class="item-name">${tpl.name} <span class="ship-class-tag">${tpl.shipClass}</span></div>
        <div class="item-desc">${tpl.desc}</div>
        <div class="recruit-slots">
          <span title="Weapon slots">⦿ ×${slots.weapon||0}</span>
          <span title="Defense slots">◈ ×${slots.defense||0}</span>
          <span title="System slots">⚡ ×${slots.system||0}</span>
        </div>
        <div class="item-cost ${canAfford ? '' : 'cant-afford'}">⬡ ${rec.cost}</div>
        <button class="btn-recruit" ${(!canAfford || atMax) ? 'disabled' : ''}>${atMax ? 'FLEET FULL' : 'RECRUIT'}</button>`;
      div.querySelector('.btn-recruit').onclick = () => {
        const result = campaign.recruitShip(rec.templateId, rec.cost);
        if (result.ok) {
          refresh();
          sizeDiv.textContent = `Fleet: ${campaign.playerFleetData.length} / ${MAX_FLEET_SIZE} ships`;
          div.querySelector('.btn-recruit').textContent = `✓ ${result.name}`;
          div.querySelector('.btn-recruit').disabled = true;
        }
      };
      container.appendChild(div);
    }
  }

  // ── Fleet Screen ──────────────────────────────────────────────
  showFleetScreen(campaign) {
    this.showScreen('fleet');
    document.getElementById('fleet-credits').textContent = campaign.credits;
    const list   = document.getElementById('fleet-ship-list');
    const detail = document.getElementById('fleet-ship-detail');
    list.innerHTML = ''; detail.innerHTML = '';

    for (const sd of campaign.playerFleetData) {
      const tpl = SHIP_TEMPLATES[sd.templateId] || {};
      const div = document.createElement('div');
      div.className = 'fleet-ship-card';
      const hp = (sd.hull / sd.maxHull * 100).toFixed(0);
      const { slots, used } = campaign.getShipModuleSlots(sd);
      const slotSummary = Object.entries(slots).map(([cat, n]) => {
        const u = used[cat] || 0;
        return `<span title="${cat}">${cat[0].toUpperCase()} ${u}/${n}</span>`;
      }).join(' · ');
      const moduleTags = (sd.modules || []).map(mid => {
        const mod = MODULE_DATA[mid];
        return mod ? `<span class="module-tag">${mod.icon || ''} ${mod.name}</span>` : '';
      }).join('');
      div.innerHTML = `
        <div class="fc-name${sd.isFlagship ? ' flagship' : ''}">${sd.name}${sd.isFlagship ? ' ★' : ''}</div>
        <div class="fc-class">${tpl.shipClass || ''} · Lv ${sd.level || 1}</div>
        <div class="fc-bars">
          <div class="fc-bar-row"><span>HULL</span><div class="fc-bar"><div class="fill hull" style="width:${hp}%"></div></div><span>${sd.hull}/${sd.maxHull}</span></div>
        </div>
        <div class="fc-stats"><span>SPD ${sd.maxSpeed}</span><span>ARM ${sd.armor}</span><span>DET ${sd.detectRange||400}</span></div>
        <div class="module-slots-row">SLOTS: ${slotSummary}</div>
        <div class="fc-upgrades">${moduleTags}${(sd.upgrades||[]).map(u=>`<span class="upg-tag">${u.replace(/_/g,' ')}</span>`).join('')}</div>`;
      div.onclick = () => {
        list.querySelectorAll('.fleet-ship-card').forEach(c => c.classList.remove('selected'));
        div.classList.add('selected');
        detail.innerHTML = `<p style="margin-top:12px;font-size:13px;color:#7aa0c0;">${tpl.desc || ''}</p>
          <div style="font-size:11px;color:#556;margin-top:8px">Weapons: ${tpl.weapons?.join(', ') || 'none'}</div>`;
      };
      list.appendChild(div);
    }
  }

  // ── Game Over / Victory ───────────────────────────────────────
  showGameOver(campaign) {
    Campaign.deleteSave();
    audio.playGameOverSting();
    this.showScreen('gameover');
    document.getElementById('gameover-stats').innerHTML = `
      <div class="stat-row"><span>Sector Reached</span><span>${campaign.sector + 1}</span></div>
      <div class="stat-row"><span>Enemies Killed</span><span>${campaign.totalEnemiesKilled}</span></div>`;
  }

  showVictory(campaign) {
    Campaign.deleteSave();
    audio.playVictorySting();
    this.showScreen('victory');
    document.getElementById('victory-stats').innerHTML = `
      <div class="stat-row"><span>Enemies Destroyed</span><span>${campaign.totalEnemiesKilled}</span></div>
      <div class="stat-row"><span>Ships Remaining</span><span>${campaign.playerFleetData.length}</span></div>
      <div class="stat-row"><span>Credits</span><span>⬡ ${campaign.credits}</span></div>`;
  }

  _bindGameOverEvents() {
    document.getElementById('btn-gameover-menu').addEventListener('click', () => {
      this.game.setState('menu');
      this.showScreen('menu');
      this.updateMainMenu();
    });
    document.getElementById('btn-victory-menu').addEventListener('click', () => {
      Campaign.deleteSave();
      this.game.setState('menu');
      this.showScreen('menu');
      this.updateMainMenu();
    });
  }

  _bindFleetTabEvents() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.fleet-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const panel = document.getElementById(`fleet-${btn.dataset.tab}-panel`);
        if (panel) panel.classList.add('active');
      });
    });
  }

  // ── Fleet Builder ─────────────────────────────────────────────
  showFleetBuilder() {
    this.showScreen('fleetbuilder');

    const SHIP_NAMES = [
      'INS Lethe','INS Styx','INS Charon','INS Argo','INS Hermes',
      'INS Athena','INS Poseidon','INS Triton','INS Nereid','INS Thetis',
      'INS Proteus','INS Glaucus','INS Scylla','INS Charybdis','INS Circe',
    ];

    // Fleet builder state
    // Each entry: { templateId, name, _uid, modules:[], moduleSlotIds:[] }
    const roster = [];
    let namePool = [...SHIP_NAMES];
    let uidCounter = 0;

    const budgetUsedEl  = document.getElementById('fb-budget-used');
    const budgetFillEl  = document.getElementById('fb-budget-fill');
    const rosterCountEl = document.getElementById('fb-roster-count');
    const rosterListEl  = document.getElementById('fb-roster-list');
    const constraintEl  = document.getElementById('fb-constraint-msg');
    const deployBtn     = document.getElementById('fb-deploy');
    const cancelBtn     = document.getElementById('fb-cancel');
    const shipGridEl    = document.getElementById('fb-ship-grid');
    const previewInfoEl    = document.getElementById('fb-preview-info');
    const upgradesPanelEl  = document.getElementById('fb-upgrades-panel');
    let selectedRosterUid  = null;
    let previewRenderer    = null;
    const slotPickerEl         = document.getElementById('fb-slot-picker');
    const slotPickerSubtitleEl = document.getElementById('fb-slot-picker-subtitle');
    const slotPickerListEl     = document.getElementById('fb-slot-picker-list');
    const slotPickerCancelBtn  = document.getElementById('fb-slot-picker-cancel');
    slotPickerCancelBtn.addEventListener('click', () => { slotPickerEl.style.display = 'none'; });

    // Draw top-down ship diagram with slot positions on the picker canvas
    const _drawSlotDiagram = (tpl, templateSlots, highlightIdx) => {
      const cvs = document.getElementById('fb-slot-picker-diagram');
      if (!cvs) return;
      const ctx = cvs.getContext('2d');
      const W = cvs.width, H = cvs.height;
      ctx.clearRect(0, 0, W, H);
      // Compute extent of slot positions to scale the diagram
      let maxExtent = Math.max(tpl.size || 20, 20);
      for (const s of templateSlots) {
        maxExtent = Math.max(maxExtent, Math.abs(s.pos.x) * 1.4, Math.abs(s.pos.y) * 1.1);
      }
      const scale = Math.min(W, H) * 0.38 / maxExtent;
      const cx = W / 2, cy = H / 2;
      // Ship outline (elongated hull, bow at top)
      const hullW = (tpl.size || 20) * 0.55 * scale;
      const hullH = (tpl.size || 20) * 1.6 * scale;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath();
      // Tapered hull shape: bow (top) is narrow, stern (bottom) is wider
      ctx.moveTo(0, -hullH / 2);                          // bow tip
      ctx.quadraticCurveTo(hullW * 0.9, -hullH * 0.25, hullW, hullH * 0.1);  // starboard bow curve
      ctx.lineTo(hullW * 0.85, hullH / 2);                // starboard stern
      ctx.quadraticCurveTo(0, hullH * 0.55, -hullW * 0.85, hullH / 2);       // stern curve
      ctx.lineTo(-hullW, hullH * 0.1);                    // port stern
      ctx.quadraticCurveTo(-hullW * 0.9, -hullH * 0.25, 0, -hullH / 2);      // port bow curve
      ctx.closePath();
      ctx.fillStyle = 'rgba(20, 50, 80, 0.5)';
      ctx.fill();
      ctx.strokeStyle = tpl.color || '#446';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // Center line
      ctx.beginPath();
      ctx.moveTo(0, -hullH / 2 + 4);
      ctx.lineTo(0, hullH / 2 - 4);
      ctx.strokeStyle = 'rgba(100,140,180,0.15)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.restore();
      // "BOW" / "STERN" labels
      ctx.fillStyle = 'rgba(100,140,180,0.3)';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('BOW', cx, 10);
      ctx.fillText('STERN', cx, H - 4);
      // Slot markers — ship-local coords: +y=forward(bow)=up on screen, +x=starboard=right
      const slotColors = ['#ff9800','#40c4ff','#69f0ae','#ffeb3b','#ce93d8','#80cbc4'];
      for (let i = 0; i < templateSlots.length; i++) {
        const s = templateSlots[i];
        const sx = cx + s.pos.x * scale;
        const sy = cy - s.pos.y * scale;  // y inverted: +y = up
        const r = i === highlightIdx ? 6 : 4;
        const col = slotColors[i % slotColors.length];
        // Arc fan preview
        if (s.arc < Math.PI * 0.95) {
          const fanR = 18;
          const facing = -s.facing - Math.PI / 2; // convert to canvas angle (0=right, CCW)
          ctx.save();
          ctx.translate(sx, sy);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, fanR, facing - s.arc, facing + s.arc);
          ctx.closePath();
          ctx.fillStyle = i === highlightIdx ? col + '44' : col + '1a';
          ctx.fill();
          ctx.restore();
        }
        // Dot
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fillStyle = i === highlightIdx ? col : col + '99';
        ctx.fill();
        if (i === highlightIdx) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        // Slot index label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(s.id.replace('s',''), sx, sy + 2.5);
      }
    };

    // Show a slot picker for weapon modules; calls callback(slotId) on selection
    const showSlotPicker = (entry, modName, callback) => {
      const tpl = SHIP_TEMPLATES[entry.templateId];
      const templateSlots = tpl && tpl.slots ? tpl.slots : [];
      slotPickerSubtitleEl.textContent = `Installing: ${modName}`;
      slotPickerListEl.innerHTML = '';
      if (templateSlots.length === 0) {
        // No defined slots — auto-assign
        callback(null);
        return;
      }
      _drawSlotDiagram(tpl, templateSlots, -1);
      for (let si = 0; si < templateSlots.length; si++) {
        const slot = templateSlots[si];
        const arcDeg = Math.round(slot.arc * (180/Math.PI) * 2);
        const wName = slot.weaponId ? (WEAPON_DATA[slot.weaponId]?.name || '') : '';
        const occupied = wName ? `<span class="spl-weapon">${wName}</span>` : '<span class="spl-empty">— empty —</span>';
        const btn = document.createElement('button');
        btn.className = 'fb-slot-picker-btn';
        btn.innerHTML = `<span class="spl-label">${slot.label}</span>${occupied}<span class="spl-pos">arc ${arcDeg}°</span>`;
        const idx = si;
        btn.addEventListener('mouseenter', () => _drawSlotDiagram(tpl, templateSlots, idx));
        btn.addEventListener('mouseleave', () => _drawSlotDiagram(tpl, templateSlots, -1));
        btn.addEventListener('click', () => {
          slotPickerEl.style.display = 'none';
          callback(slot.id);
        });
        slotPickerListEl.appendChild(btn);
      }
      slotPickerEl.style.display = 'flex';
    };

    document.getElementById('fb-budget-total').textContent = FLEET_BUILDER_BUDGET;

    // ── Helpers ────────────────────────────────────────────────
    const getBudgetUsed = () => roster.reduce((sum, e) => {
      const cfg = FLEET_BUILDER_SHIPS.find(s => s.templateId === e.templateId);
      const modCost = (e.modules || []).reduce((ms, mid) => ms + (MODULE_DATA[mid]?.cost || 0), 0);
      return sum + (cfg ? cfg.cost : 0) + modCost;
    }, 0);

    const getCountForTemplate = (templateId) =>
      roster.filter(e => e.templateId === templateId).length;

    const getNextName = () => {
      const used = new Set(roster.map(e => e.name));
      for (const n of namePool) {
        if (!used.has(n)) return n;
      }
      return `INS Ship-${Date.now() % 9999}`;
    };

    // ── Ship Preview ────────────────────────────────────────────
    const showPreviewForTemplate = (templateId) => {
      if (!previewRenderer) return;
      const tpl = SHIP_TEMPLATES[templateId];
      if (!tpl) return;
      previewRenderer.showShip(templateId);
      const hullBar = Math.round((tpl.maxHull / 1100) * 100);
      const spdBar  = Math.round((tpl.maxSpeed / 190) * 100);
      const armBar  = Math.min(100, Math.round((tpl.armor / 45) * 100));
      // Turret slot layout for this template
      const slots = tpl.slots || [];
      const slotListHtml = slots.length > 0
        ? `<div class="fb-preview-slots">
            <div class="fb-prev-slots-label">TURRET MOUNTS</div>
            ${slots.map(s => {
              const arcDeg = Math.round(s.arc * (180/Math.PI) * 2);
              const wName = s.weaponId ? (WEAPON_DATA[s.weaponId]?.name || s.weaponId) : null;
              const wClass = wName ? 'fb-prev-slot-wep' : 'fb-prev-slot-empty';
              return `<div class="fb-prev-slot-row${wName ? '' : ' empty-slot'}">
                <span class="fb-prev-slot-lbl">${s.label}</span>
                <span class="${wClass}">${wName || 'UPGRADE SLOT'}</span>
                <span class="fb-prev-slot-arc">${arcDeg}°</span>
              </div>`;
            }).join('')}
          </div>`
        : '';
      const dcCrews = tpl.repairCrews || 2;
      const detectR = tpl.detectRange || 0;
      previewInfoEl.innerHTML = `
        <div class="fb-preview-name" style="color:${tpl.color}">${tpl.name}</div>
        <div class="fb-preview-class">${tpl.shipClass}</div>
        <div class="fb-preview-desc">${tpl.desc}</div>
        <div class="fb-preview-stats">
          <div class="fb-prev-stat"><span>HULL</span><div class="fb-prev-bar"><div class="fb-prev-fill hull" style="width:${hullBar}%"></div></div><span class="fb-prev-val">${tpl.maxHull}</span></div>
          <div class="fb-prev-stat"><span>SPD</span><div class="fb-prev-bar"><div class="fb-prev-fill spd" style="width:${spdBar}%"></div></div><span class="fb-prev-val">${tpl.maxSpeed}</span></div>
          <div class="fb-prev-stat"><span>ARM</span><div class="fb-prev-bar"><div class="fb-prev-fill arm" style="width:${armBar}%"></div></div><span class="fb-prev-val">${tpl.armor}</span></div>
        </div>
        <div class="fb-prev-extras">
          <span class="fb-prev-extra">DC CREWS: ${dcCrews}</span>
          <span class="fb-prev-extra">SENSORS: ${detectR}m</span>
          ${tpl.stealthRating ? `<span class="fb-prev-extra">STEALTH: ${tpl.stealthRating}</span>` : ''}
          ${tpl.ewStrength ? `<span class="fb-prev-extra">EW: ${tpl.ewStrength}</span>` : ''}
        </div>
        ${slotListHtml}`;
    };

    // ── Upgrade Panel ───────────────────────────────────────────
    const renderUpgradesPanel = (uid) => {
      const entry = roster.find(e => e._uid === uid);
      if (!entry) { upgradesPanelEl.innerHTML = '<div class="fb-upg-empty">Select a ship in your fleet to equip modules</div>'; return; }
      if (!entry.modules) entry.modules = [];
      const slots = MODULE_SLOTS[entry.templateId] || { weapon:1, defense:1, system:1 };
      const used  = { weapon:0, defense:0, system:0 };
      for (const mid of entry.modules) {
        const mod = MODULE_DATA[mid];
        if (mod) used[mod.category] = (used[mod.category] || 0) + 1;
      }
      const remaining = FLEET_BUILDER_BUDGET - getBudgetUsed();
      const slotHtml = Object.entries(slots).map(([cat, n]) => {
        const u = used[cat] || 0;
        return `<span class="fb-upg-slot ${u >= n ? 'full' : (u > 0 ? 'used' : '')}">${cat[0].toUpperCase()} ${u}/${n}</span>`;
      }).join('');
      const catColors = { weapon:'#ff6e40', defense:'#40c4ff', system:'#69f0ae' };
      const catNames  = { weapon:'WEAPONS', defense:'DEFENSE', system:'SYSTEMS' };
      let html = `<div class="fb-upg-header">MODULES — ${entry.name.replace('INS ','')}<div class="fb-upg-slots">${slotHtml}</div></div>`;
      for (const cat of ['weapon','defense','system']) {
        html += `<div class="fb-upg-section"><div class="fb-upg-cat" style="color:${catColors[cat]}">${catNames[cat]}</div>`;
        for (const mod of Object.values(MODULE_DATA).filter(m => m.category === cat)) {
          const isEquipped = entry.modules.includes(mod.id);
          const slotFull   = !isEquipped && (used[cat]||0) >= (slots[cat]||0);
          const cantAfford = !isEquipped && mod.cost > remaining + (isEquipped ? mod.cost : 0);
          let cls = isEquipped ? 'equipped' : (slotFull ? 'slot-full' : (cantAfford ? 'cant-afford' : ''));
          // Show assigned turret slot for equipped weapon modules
          let slotTag = '';
          if (isEquipped && mod.category === 'weapon') {
            const modIdx = entry.modules.indexOf(mod.id);
            const assignedSlotId = entry.moduleSlotIds && entry.moduleSlotIds[modIdx];
            if (assignedSlotId) {
              const tpl = SHIP_TEMPLATES[entry.templateId];
              const tplSlot = tpl && tpl.slots ? tpl.slots.find(s => s.id === assignedSlotId) : null;
              if (tplSlot) slotTag = `<span class="fb-upg-equipped-slot">[${tplSlot.label}]</span>`;
            }
          }
          const badge = isEquipped
            ? `<span class="fb-upg-equipped-badge">✓ REMOVE</span>`
            : `<span class="fb-upg-cost">${mod.cost}pts</span>`;
          html += `<div class="fb-upg-item ${cls}" data-mod-id="${mod.id}">
            <span class="fb-upg-icon">${mod.icon||'·'}</span>
            <div class="fb-upg-body"><div class="fb-upg-name">${mod.name}${slotTag}</div><div class="fb-upg-desc">${mod.desc}</div></div>
            ${badge}</div>`;
        }
        html += '</div>';
      }
      upgradesPanelEl.innerHTML = html;
      upgradesPanelEl.querySelectorAll('.fb-upg-item').forEach(el => {
        const modId = el.dataset.modId;
        const mod = MODULE_DATA[modId];
        if (!mod) return;
        el.addEventListener('click', () => {
          if (el.classList.contains('equipped')) {
            const idx = entry.modules.indexOf(modId);
            if (idx >= 0) {
              entry.modules.splice(idx, 1);
              if (entry.moduleSlotIds) entry.moduleSlotIds.splice(idx, 1);
              refresh(); renderUpgradesPanel(uid);
            }
          } else if (!el.classList.contains('slot-full') && !el.classList.contains('cant-afford')) {
            if (mod.category === 'weapon') {
              // Show slot picker before adding
              showSlotPicker(entry, mod.name, (slotId) => {
                if (!entry.moduleSlotIds) entry.moduleSlotIds = [];
                entry.modules.push(modId);
                entry.moduleSlotIds.push(slotId);
                refresh(); renderUpgradesPanel(uid);
              });
            } else {
              if (!entry.moduleSlotIds) entry.moduleSlotIds = [];
              entry.modules.push(modId);
              entry.moduleSlotIds.push(null);
              refresh(); renderUpgradesPanel(uid);
            }
          }
        });
      });
    };

    // ── Refresh UI ─────────────────────────────────────────────
    const refresh = () => {
      const used = getBudgetUsed();
      const pct  = Math.min(100, (used / FLEET_BUILDER_BUDGET) * 100);

      budgetUsedEl.textContent = used;
      budgetFillEl.style.width = pct + '%';

      // Budget bar color
      if (pct >= 90) {
        budgetFillEl.className = 'fleet-budget-fill budget-danger';
      } else if (pct >= 70) {
        budgetFillEl.className = 'fleet-budget-fill budget-warning';
      } else {
        budgetFillEl.className = 'fleet-budget-fill budget-ok';
      }

      rosterCountEl.textContent = `${roster.length}/6`;

      // Update ship card states
      shipGridEl.querySelectorAll('.fb-ship-card').forEach(card => {
        const tid  = card.dataset.templateId;
        const cfg  = FLEET_BUILDER_SHIPS.find(s => s.templateId === tid);
        if (!cfg) return;
        const cnt  = getCountForTemplate(tid);
        const remainingBudget = FLEET_BUILDER_BUDGET - used;
        const fleetFull = roster.length >= 6;
        const atMax = cnt >= cfg.maxCount;
        const cantAfford = cfg.cost > remainingBudget;

        card.classList.toggle('maxed', atMax || fleetFull || cantAfford);
        card.querySelector('.fb-card-count').textContent =
          `${cnt}/${cfg.maxCount}`;

        const addable = !atMax && !fleetFull && !cantAfford;
        card.querySelector('.fb-card-add').disabled = !addable;
        card.querySelector('.fb-card-add').textContent = atMax ? 'MAX' : (fleetFull ? 'FULL' : (cantAfford ? 'COST' : '+ ADD'));
      });

      // Rebuild roster list
      rosterListEl.innerHTML = '';
      for (const entry of roster) {
        const tpl = SHIP_TEMPLATES[entry.templateId] || {};
        const cfg = FLEET_BUILDER_SHIPS.find(s => s.templateId === entry.templateId);
        const item = document.createElement('div');
        const modCount = (entry.modules || []).length;
        const modCost  = (entry.modules || []).reduce((s, mid) => s + (MODULE_DATA[mid]?.cost || 0), 0);
        item.className = 'fb-roster-item' + (entry._uid === selectedRosterUid ? ' preview-selected' : '');
        item.dataset.uid = entry._uid;

        item.innerHTML = `
          <div class="fb-ri-left">
            <div class="fb-ri-info">
              <span class="fb-ri-name" title="Click to rename">${entry.name}</span>
              <span class="fb-ri-class">${tpl.shipClass || tpl.name || entry.templateId}${modCount > 0 ? ` · <span style="color:#00bcd4">${modCount} mod${modCount>1?'s':''}</span>` : ''}</span>
            </div>
          </div>
          <div class="fb-ri-right">
            <span class="fb-ri-cost">${(cfg ? cfg.cost : 0) + modCost} pts</span>
            <button class="fb-ri-remove" title="Remove ship" data-uid="${entry._uid}">✕</button>
          </div>`;

        // Click to select for upgrades (not on rename name span)
        item.addEventListener('click', (e) => {
          if (e.target.tagName === 'INPUT' || e.target.classList.contains('fb-ri-remove')) return;
          selectedRosterUid = entry._uid;
          showPreviewForTemplate(entry.templateId);
          renderUpgradesPanel(entry._uid);
          rosterListEl.querySelectorAll('.fb-roster-item').forEach(it =>
            it.classList.toggle('preview-selected', it.dataset.uid === String(entry._uid)));
        });

        // Inline rename on name click
        const nameSpan = item.querySelector('.fb-ri-name');
        nameSpan.addEventListener('click', () => {
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'fb-ri-name-input';
          input.value = entry.name;
          input.maxLength = 32;
          nameSpan.replaceWith(input);
          input.focus();
          input.select();
          const commit = () => {
            const v = input.value.trim();
            if (v) entry.name = v;
            refresh();
          };
          input.addEventListener('blur', commit);
          input.addEventListener('keydown', e => {
            if (e.key === 'Enter') { input.blur(); }
            if (e.key === 'Escape') { input.value = entry.name; input.blur(); }
          });
        });

        // Remove button
        item.querySelector('.fb-ri-remove').addEventListener('click', () => {
          const idx = roster.findIndex(e => e._uid === entry._uid);
          if (idx !== -1) roster.splice(idx, 1);
          refresh();
        });

        rosterListEl.appendChild(item);
      }

      // Constraint validation
      const count = roster.length;
      let msg = '';
      if (count < 1) msg = 'Need at least 1 ship.';
      else if (count > 6) msg = 'Maximum 6 ships.';
      else if (used > FLEET_BUILDER_BUDGET) msg = 'Over budget!';

      constraintEl.textContent = msg;
      deployBtn.disabled = msg !== '';
    };

    // ── Build Ship Cards ────────────────────────────────────────
    shipGridEl.innerHTML = '';
    for (const cfg of FLEET_BUILDER_SHIPS) {
      const tpl = SHIP_TEMPLATES[cfg.templateId];
      if (!tpl) continue;

      const card = document.createElement('div');
      card.className = 'fb-ship-card';
      card.dataset.templateId = cfg.templateId;
      card.style.setProperty('--ship-glow', tpl.glowColor || tpl.color || '#00e5ff');

      // Stat display helpers
      const hullBar  = Math.round((tpl.maxHull / 1050) * 100);
      const spdBar   = Math.round((tpl.maxSpeed / 190) * 100);

      card.innerHTML = `
        <div class="fb-card-header">
          <div class="fb-card-title-block">
            <span class="fb-card-name" style="color:${tpl.color}">${tpl.name}</span>
            <span class="fb-card-class">${tpl.shipClass}</span>
          </div>
          <div class="fb-card-cost-block">
            <span class="fb-card-cost">${cfg.cost}</span>
            <span class="fb-card-pts">pts</span>
          </div>
        </div>
        <div class="fb-card-stats">
          <div class="fb-stat-row"><span class="fb-stat-label">HULL</span><div class="fb-stat-bar"><div class="fb-stat-fill hull-fill" style="width:${hullBar}%"></div></div><span class="fb-stat-val">${tpl.maxHull}</span></div>
          <div class="fb-stat-row"><span class="fb-stat-label">SPD</span><div class="fb-stat-bar"><div class="fb-stat-fill spd-fill" style="width:${spdBar}%"></div></div><span class="fb-stat-val">${tpl.maxSpeed}</span></div>
        </div>
        <p class="fb-card-desc">${tpl.desc}</p>
        <div class="fb-card-footer">
          <span class="fb-card-count">0/${cfg.maxCount}</span>
          <button class="fb-card-add" data-template-id="${cfg.templateId}">+ ADD</button>
        </div>`;

      // Add button
      card.querySelector('.fb-card-add').addEventListener('click', () => {
        const cnt = getCountForTemplate(cfg.templateId);
        const used = getBudgetUsed();
        if (cnt >= cfg.maxCount) return;
        if (roster.length >= 6) return;
        if (used + cfg.cost > FLEET_BUILDER_BUDGET) return;
        const name = getNextName();
        roster.push({ templateId: cfg.templateId, name, _uid: ++uidCounter, modules: [], moduleSlotIds: [] });
        refresh();
      });

      // Hover card: show preview (if no roster ship locked)
      card.addEventListener('mouseenter', () => {
        if (selectedRosterUid === null) showPreviewForTemplate(cfg.templateId);
      });
      // Click card name/stats area: show preview and lock to this template
      card.addEventListener('click', (e) => {
        if (e.target.classList.contains('fb-card-add')) return;
        showPreviewForTemplate(cfg.templateId);
        upgradesPanelEl.innerHTML = '<div class="fb-upg-empty">Add this ship to your fleet, then click it in the roster to equip modules</div>';
      });

      shipGridEl.appendChild(card);
    }

    // ── Initialize Preview Renderer ────────────────────────────
    const previewCanvas = document.getElementById('fb-preview-canvas');
    if (previewRenderer) previewRenderer.destroy();
    previewRenderer = new ShipPreviewRenderer(previewCanvas);

    // ── Deploy & Cancel ─────────────────────────────────────────
    deployBtn.onclick = () => {
      if (previewRenderer) { previewRenderer.destroy(); previewRenderer = null; }
      const fleet = roster.map(e => ({
        templateId: e.templateId,
        name: e.name,
        modules: e.modules || [],
        moduleSlotIds: e.moduleSlotIds || [],
      }));
      this.game.confirmFleetAndStart(fleet);
    };

    cancelBtn.onclick = () => {
      if (previewRenderer) { previewRenderer.destroy(); previewRenderer = null; }
      this.showScreen('menu');
    };

    refresh();
  }
}
