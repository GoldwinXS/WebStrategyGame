'use strict';
// ================================================================
// UI.JS — HTML overlay UI manager (all non-3D screens)
// ================================================================

class UIManager {
  constructor(game) {
    this.game = game;
    this._campaign = null;

    this.screens = {
      menu:      document.getElementById('screen-menu'),
      help:      document.getElementById('screen-help'),
      settings:  document.getElementById('screen-settings'),
      campaign:  document.getElementById('screen-campaign'),
      fleet:     document.getElementById('screen-fleet'),
      event:     document.getElementById('screen-event'),
      store:     document.getElementById('screen-store'),
      precombat: document.getElementById('screen-precombat'),
      rewards:   document.getElementById('screen-rewards'),
      gameover:  document.getElementById('screen-gameover'),
      victory:   document.getElementById('screen-victory'),
    };
    this.combatHUD = document.getElementById('hud-combat');

    // Map canvas (2D, for campaign connection lines)
    this.mapCanvas  = document.getElementById('map-canvas');
    this.mapCtx     = this.mapCanvas ? this.mapCanvas.getContext('2d') : null;
    this.nodesEl    = document.getElementById('map-nodes');

    this._bindMenuEvents();
    this._bindCombatEvents();
    this._bindRewardEvents();
    this._bindGameOverEvents();
    this._bindFleetTabEvents();
    this._bindSettingsEvents();
  }

  // ── Screen Management ─────────────────────────────────────────
  showScreen(name) {
    for (const [k, el] of Object.entries(this.screens)) {
      el.classList.toggle('active', k === name);
    }
    this.combatHUD.classList.add('hidden');
  }

  showCombatHUD() {
    for (const el of Object.values(this.screens)) el.classList.remove('active');
    this.combatHUD.classList.remove('hidden');
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

    const bindSlider = (id, fn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => fn(parseInt(el.value) / 100));
    };
    bindSlider('vol-master', v => audio.setMasterVol(v));
    bindSlider('vol-music',  v => audio.setMusicVol(v));
    bindSlider('vol-fx',     v => audio.setFxVol(v));
  }

  showSettings() {
    // Sync sliders to current audio prefs before showing
    const sync = (id, val) => { const e = document.getElementById(id); if (e) e.value = Math.round(val * 100); };
    sync('vol-master', audio.masterVol);
    sync('vol-music',  audio.musicVol);
    sync('vol-fx',     audio.fxVol);
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
        ctx.save();
        ctx.strokeStyle = isPath ? 'rgba(0,229,255,0.25)' : 'rgba(20,50,80,0.4)';
        ctx.lineWidth = isPath ? 2 : 1;
        ctx.setLineDash(isPath ? [] : [6, 8]);
        ctx.shadowColor = isPath ? '#00e5ff' : 'transparent';
        ctx.shadowBlur  = isPath ? 6 : 0;
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
        const first = this.game.combat.playerShips.find(s => !s.isDestroyed);
        if (first) { audio.play('ui_click'); this.game.combat.selectedShip = first; }
      }
    });
    // Depth controls (mobile buttons)
    document.getElementById('btn-depth-up').addEventListener('click', () => this.game.adjustDepth(-80));
    document.getElementById('btn-depth-dn').addEventListener('click', () => this.game.adjustDepth(80));
  }

  updateCombatHUD(combat) {
    if (!combat) return;

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
    for (const s of combat.playerShips) {
      const div = document.createElement('div');
      div.className = `hud-ship-icon${s.isDestroyed ? ' dead' : ''}${s === combat.selectedShip ? ' selected' : ''}${s.isFlagship ? ' flagship' : ''}`;
      div.title = s.name;
      const hp = s.isDestroyed ? 0 : s.hull / s.maxHull;
      const sp = s.isDestroyed || !s.maxShields ? 0 : s.shields / s.maxShields;
      div.innerHTML = `
        <span class="icon-name">${s.name.replace('INS ','')}</span>
        <div class="icon-bars">
          ${s.maxShields > 0 ? `<div class="icon-bar shield" style="width:${(sp*100).toFixed(0)}%"></div>` : ''}
          <div class="icon-bar hull" style="width:${(hp*100).toFixed(0)}%"></div>
        </div>`;
      div.addEventListener('click', () => combat.selectShip(s));
      hudFleet.appendChild(div);
    }

    // Selected ship info
    const selInfo = document.getElementById('hud-selected-info');
    const sel = combat.selectedShip;
    if (sel && !sel.isDestroyed) {
      const hp  = (sel.hull / sel.maxHull * 100).toFixed(0);
      const sp  = sel.maxShields > 0 ? (sel.shields / sel.maxShields * 100).toFixed(0) : null;
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

      selInfo.innerHTML = `
        <div class="sel-name">${sel.name}</div>
        <div class="sel-class">${tpl.shipClass || ''} ${sel.level > 1 ? `<span class="lv">Lv${sel.level}</span>` : ''}${ewInfo}</div>
        <div class="sel-bars">
          <div class="sel-bar-row"><span>HULL</span><div class="sel-bar"><div class="fill hull" style="width:${hp}%"></div></div><span>${sel.hull}/${sel.maxHull}</span></div>
          ${sp !== null ? `<div class="sel-bar-row"><span>SHLD</span><div class="sel-bar"><div class="fill shield" style="width:${sp}%"></div></div><span>${Math.round(sel.shields)}/${sel.maxShields}</span></div>` : ''}
          <div class="sel-bar-row depth-row">
            <span>DEPTH</span>
            <div class="sel-bar depth-bar"><div class="fill depth" style="width:${depthPct}%"></div></div>
            <span>${depthM}m ${isJammed ? '<span class="jammed-tag">JAMMED</span>': ''}</span>
          </div>
        </div>
        <div class="sel-weapons">
          ${torpInfo}
        </div>
        <div class="sel-target">${sel.attackTarget && !sel.attackTarget.isDestroyed ? `⇒ ${sel.attackTarget.name}` : 'No target'}</div>`;
    } else {
      selInfo.innerHTML = '<div class="sel-hint">Tap/click a ship to select</div>';
    }

    // Depth gauge on right side
    const depthGauge = document.getElementById('depth-gauge-fill');
    if (depthGauge && sel && !sel.isDestroyed) {
      const pct = ((sel.depth || 0) / WORLD_DEPTH * 100).toFixed(1);
      depthGauge.style.height = pct + '%';
    }

    // Order hint
    const hint = document.getElementById('order-hint');
    if (combat.paused) {
      hint.textContent = sel && !sel.isDestroyed
        ? 'PAUSED — Click ocean: move · Click enemy: attack · Q/E: depth'
        : 'PAUSED — Select a ship to issue orders';
      hint.classList.add('active');
    } else {
      hint.textContent = sel && !sel.isDestroyed
        ? 'Click ocean: move · Click enemy: attack · Q/E: depth · SPACE: pause'
        : 'Select a ship · SPACE to pause';
      hint.classList.remove('active');
    }

    // Timer
    const t = Math.floor(combat.time);
    document.getElementById('combat-timer').textContent =
      `${Math.floor(t/60).toString().padStart(2,'0')}:${(t%60).toString().padStart(2,'0')}`;
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
    document.getElementById('store-credits').textContent = campaign.credits;

    const inventory = [...UPGRADE_POOL].sort(() => Math.random() - 0.5).slice(0, 6);
    const container = document.getElementById('store-items');
    container.innerHTML = '';

    for (const item of inventory) {
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
            document.getElementById('store-credits').textContent = campaign.credits;
            btn.textContent = '✓';
            btn.disabled = true;
            div.querySelectorAll('.btn-sm-ship').forEach(b => {
              if (campaign.credits < item.cost) b.disabled = true;
            });
          }
        };
        shipArea.appendChild(btn);
      }
      container.appendChild(div);
    }

    document.getElementById('btn-store-leave').onclick = () => { campaign.save(); onDone(); };
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
      const sp = sd.maxShields > 0 ? (sd.shields / sd.maxShields * 100).toFixed(0) : 0;
      div.innerHTML = `
        <div class="fc-name${sd.isFlagship ? ' flagship' : ''}">${sd.name}${sd.isFlagship ? ' ★' : ''}</div>
        <div class="fc-class">${tpl.shipClass || ''} · Lv ${sd.level || 1}</div>
        <div class="fc-bars">
          <div class="fc-bar-row"><span>HULL</span><div class="fc-bar"><div class="fill hull" style="width:${hp}%"></div></div><span>${sd.hull}/${sd.maxHull}</span></div>
          ${sd.maxShields > 0 ? `<div class="fc-bar-row"><span>SHLD</span><div class="fc-bar"><div class="fill shield" style="width:${sp}%"></div></div><span>${sd.shields}/${sd.maxShields}</span></div>` : ''}
        </div>
        <div class="fc-stats"><span>SPD ${sd.maxSpeed}</span><span>ARM ${sd.armor}</span><span>XP ${sd.xp || 0}</span></div>
        <div class="fc-upgrades">${(sd.upgrades||[]).map(u=>`<span class="upg-tag">${u.replace(/_/g,' ')}</span>`).join('')}</div>`;
      div.onclick = () => {
        list.querySelectorAll('.fleet-ship-card').forEach(c => c.classList.remove('selected'));
        div.classList.add('selected');
        detail.innerHTML = `<p style="margin-top:12px;font-size:13px;color:#7aa0c0;">${tpl.desc || ''}</p>`;
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
}
