'use strict';
// ================================================================
// GAME.JS — Main game loop, state machine, input, networking hooks
//
// MULTIPLAYER ARCHITECTURE NOTE:
// The game is designed for future P2P (WebRTC) multiplayer.
// Key principles:
//  1. All player actions become serializable "Commands" pushed to a CommandQueue
//  2. Simulation is ticked deterministically (same commands → same state)
//  3. Commands can be sent to peers; peers replay them to stay in sync
//  4. No direct state mutation from input — always goes through the queue
//
// To add WebRTC multiplayer later:
//  - Replace CommandQueue with a NetworkedCommandQueue
//  - On local input: push command locally AND send via RTCDataChannel
//  - On peer message: decode and push to queue at the correct tick
//  - Use lock-step or client-side prediction as desired
// ================================================================

// ── Deterministic Random (seeded) ────────────────────────────────
// Using a seeded PRNG so simulation can be replicated on peers.
class SeededRandom {
  constructor(seed = 12345) { this.seed = seed; }
  next() {
    this.seed = (this.seed * 1664525 + 1013904223) & 0xffffffff;
    return (this.seed >>> 0) / 4294967296;
  }
  nextRange(min, max) { return min + this.next() * (max - min); }
}
// Global seeded RNG (replace Math.random in simulation for full determinism)
let simRand = new SeededRandom();

// ── Command System (multiplayer-ready) ────────────────────────────
// Each player action is a Command object that can be serialized and
// sent to peers. The simulation processes commands at the right tick.
const CmdType = {
  MOVE:   'MOVE',    // { shipId, x, y }
  ATTACK: 'ATTACK',  // { shipId, targetId }
  STOP:   'STOP',    // { shipId }
  PAUSE:  'PAUSE',   // { paused: bool }
  SELECT: 'SELECT',  // { shipId } (local only, not networked)
};

class CommandQueue {
  constructor() { this._cmds = []; }
  push(type, data, playerId = 0) {
    this._cmds.push({ type, data, playerId, ts: Date.now() });
  }
  drain() { const cmds = this._cmds.splice(0); return cmds; }
  // Hook for networking: override this to send to peers
  onCommand(cmd) { /* NetworkedCommandQueue.send(cmd) */ }
}

// ── Game States ───────────────────────────────────────────────────
const GS = {
  MENU:       'MENU',
  HELP:       'HELP',
  SETTINGS:   'SETTINGS',
  CAMPAIGN:   'CAMPAIGN',
  PRECOMBAT:  'PRECOMBAT',
  COMBAT:     'COMBAT',
  REWARDS:    'REWARDS',
  EVENT:      'EVENT',
  STORE:      'STORE',
  FLEET:      'FLEET',
  GAMEOVER:   'GAMEOVER',
  VICTORY:    'VICTORY',
};

// ── Main Game Class ───────────────────────────────────────────────
class Game {
  constructor() {
    this.state = GS.MENU;
    this.combat = null;       // CombatEngine instance during combat
    this.campaign = null;     // Campaign instance
    this.encounter = null;    // Current encounter data

    this.cmdQueue = new CommandQueue();

    // Timing
    this._lastTs = 0;
    this._accum = 0;
    const TICK_HZ = 60;
    this.TICK_DT = 1 / TICK_HZ; // Fixed simulation timestep (determinism)

    // Input
    this._keys = {};
    this._touch = {};
    this._panStart = null;
    this._pinchStart = null;

    // Init
    this.canvas = document.getElementById('gameCanvas');
    this.renderer = new Renderer(this.canvas);
    this.ui = new UIManager(this);

    // Load saved audio prefs before anything plays
    audio.loadPrefs();

    this._bindInput();
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  setState(s) { this.state = s; }

  // ── Startup ───────────────────────────────────────────────────
  init() {
    window._game = this;
    this.ui.showScreen('menu');
    this.ui.updateMainMenu();
    audio.playMusic('menu');
    requestAnimationFrame(ts => this._loop(ts));
  }

  // ── Game Loop ─────────────────────────────────────────────────
  _loop(ts) {
    const dtRaw = Math.min((ts - this._lastTs) / 1000, 0.1);
    this._lastTs = ts;
    requestAnimationFrame(t => this._loop(t));

    // Always render 3D background
    if (this.state === GS.COMBAT && this.combat) {
      // Process commands
      this._processCommands(this.cmdQueue.drain());
      // Fixed-timestep simulation for determinism
      this._accum += dtRaw;
      while (this._accum >= this.TICK_DT) {
        this.combat.update(this.TICK_DT);
        this._accum -= this.TICK_DT;
      }
      // Render at display rate
      this.renderer.renderCombat(this.combat, dtRaw);
      this.ui.updateCombatHUD(this.combat);

      // Check combat completion
      if (this.combat.complete) this._onCombatComplete();
    } else {
      this.renderer.renderBackground(dtRaw);
    }

    // Camera pan from keyboard
    if (this.state === GS.COMBAT) {
      const panSpd = 8;
      if (this._keys['ArrowLeft']  || this._keys['a']) this.renderer.panCamera(-panSpd, 0);
      if (this._keys['ArrowRight'] || this._keys['d']) this.renderer.panCamera( panSpd, 0);
      if (this._keys['ArrowUp']    || this._keys['w']) this.renderer.panCamera(0, -panSpd);
      if (this._keys['ArrowDown']  || this._keys['s']) this.renderer.panCamera(0,  panSpd);
    }
  }

  // ── Command Processing ────────────────────────────────────────
  // This is where networked commands from peers would also be processed.
  _processCommands(cmds) {
    if (!this.combat) return;
    for (const cmd of cmds) {
      switch (cmd.type) {
        case CmdType.MOVE:
          const ms = this.combat.playerShips.find(s => s.id === cmd.data.shipId);
          if (ms) {
            ms.setMoveTarget(cmd.data.x, cmd.data.y);
            ms.setDepthTarget(cmd.data.depth);
          }
          this.combat.moveMarker = { x: cmd.data.x, y: cmd.data.y, depth: cmd.data.depth, timer: 1.5 };
          break;
        case CmdType.ATTACK:
          const as = this.combat.playerShips.find(s => s.id === cmd.data.shipId);
          const at = [...this.combat.enemyShips, ...this.combat.playerShips].find(s => s.id === cmd.data.targetId);
          if (as && at) as.attackTarget = at;
          break;
        case CmdType.STOP:
          const ss = this.combat.playerShips.find(s => s.id === cmd.data.shipId);
          if (ss) { ss.setMoveTarget(ss.x, ss.y); ss.atTarget = true; }
          break;
        case CmdType.PAUSE:
          this.combat.paused = cmd.data.paused;
          break;
        case CmdType.SELECT:
          const sel = this.combat.playerShips.find(s => s.id === cmd.data.shipId);
          if (sel) this.combat.selectedShip = sel;
          break;
      }
    }
  }

  // ── New Run / Continue ────────────────────────────────────────
  startNewRun() {
    this.campaign = Campaign.newRun();
    this.campaign.save();
    this.ui.setupCampaignMap(this.campaign);
    this.ui.showScreen('campaign');
    this.setState(GS.CAMPAIGN);
    audio.playMusic('menu');
  }

  continueRun() {
    const c = Campaign.load();
    if (!c) return;
    this.campaign = c;
    this.ui.setupCampaignMap(this.campaign);
    this.ui.showScreen('campaign');
    this.setState(GS.CAMPAIGN);
    audio.playMusic('menu');
  }

  // ── Campaign Navigation ───────────────────────────────────────
  navigateToNode(nodeId) {
    if (!this.campaign) return;
    const node = this.campaign.getNode(nodeId);
    if (!node) return;

    this.campaign.moveToNode(nodeId);

    switch (node.type) {
      case 'COMBAT':
      case 'ELITE':
      case 'BOSS':
        this.encounter = this.campaign.generateEncounter(node);
        this.ui.showPreCombat(this.encounter, this.campaign);
        this.setState(GS.PRECOMBAT);
        break;
      case 'EVENT':
        const eventData = EVENTS[node.eventId !== undefined ? node.eventId : Math.floor(Math.random() * EVENTS.length)];
        this.ui.showEvent(eventData, this.campaign, () => {
          this.ui.setupCampaignMap(this.campaign);
          this.ui.updateCampaignHeader(this.campaign);
          this.ui.showScreen('campaign');
          this.setState(GS.CAMPAIGN);
          this.campaign.save();
        });
        this.setState(GS.EVENT);
        break;
      case 'STORE':
        this.ui.showStore(this.campaign, () => {
          this.ui.setupCampaignMap(this.campaign);
          this.ui.updateCampaignHeader(this.campaign);
          this.ui.showScreen('campaign');
          this.setState(GS.CAMPAIGN);
        });
        this.setState(GS.STORE);
        break;
      case 'REST':
        this.campaign.rest();
        this.campaign.save();
        this.ui.setupCampaignMap(this.campaign);
        this.ui.updateCampaignHeader(this.campaign);
        this.ui.showScreen('campaign');
        this._showNotification('Fleet repaired — +40% hull for all ships.');
        break;
    }
  }

  _showNotification(msg) {
    const el = document.createElement('div');
    el.className = 'notification';
    el.textContent = msg;
    document.getElementById('ui').appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  // ── Combat ────────────────────────────────────────────────────
  beginCombat(encounter, campaign) {
    this.encounter = encounter;
    this.combat = new CombatEngine(campaign.playerFleetData, encounter.enemies, campaign.sector, encounter.isBoss);
    this.renderer.clearCombatEntities();
    this.renderer.buildTerrain(this.combat.terrain);
    this._accum = 0;

    // Snap camera to fleet center immediately (don't wait for lerp)
    const alive = this.combat.playerShips;
    if (alive.length > 0) {
      let cx = 0, cy = 0;
      for (const s of alive) { cx += s.x; cy += s.y; }
      cx /= alive.length; cy /= alive.length;
      this.renderer.camTarget.set(this.renderer.wx(cx), 0, this.renderer.wz(cy));
    }

    this.ui.showCombatHUD();
    this.setState(GS.COMBAT);
    this.combat.paused = true;
    audio.playMusic('combat');
    setTimeout(() => { if (this.combat) this.combat.paused = false; }, 1500);
  }

  // Adjust depth of selected ship (positive = dive, negative = ascend)
  adjustDepth(delta) {
    if (!this.combat || !this.combat.selectedShip) return;
    const sel = this.combat.selectedShip;
    if (sel.isDestroyed) return;
    sel.setDepthTarget((sel.targetDepth || 0) + delta);
    audio.play('depth_change', 0.6);
    // Also update the move marker depth for next move order
    if (this.combat.moveMarker) this.combat.moveMarker.depth = sel.targetDepth;
    // Update renderer click plane
    this.renderer.clickPlaneY = -sel.targetDepth;
  }

  focusCamera(ship) {
    if (!ship || !this.renderer) return;
    this.renderer.camTarget.set(
      this.renderer.wx(ship.x),
      -(ship.depth || 0),
      this.renderer.wz(ship.y)
    );
  }

  togglePause() {
    if (!this.combat) return;
    this.cmdQueue.push(CmdType.PAUSE, { paused: !this.combat.paused });
  }

  _onCombatComplete() {
    const result = this.combat.result;
    const stats = this.combat.stats;

    // 'loss' always means flagship was destroyed → game over
    if (result === 'loss') {
      this.renderer.clearCombatEntities();
      this.ui.showGameOver(this.campaign);
      this.setState(GS.GAMEOVER);
      return;
    }

    // Apply post-combat to campaign
    this.campaign.applyPostCombat(this.combat);
    this.campaign.save();

    // Check if just cleared a sector boss
    const clearedBoss = this.encounter && this.encounter.isBoss;
    if (clearedBoss && result === 'win') {
      const nextSector = this.campaign.sector + 1;
      if (nextSector >= CAMPAIGN_CONFIG.sectors) {
        // Victory!
        this.renderer.clearCombatEntities();
        this.ui.showVictory(this.campaign);
        this.setState(GS.VICTORY);
        return;
      } else {
        this.campaign.advanceSector();
        this.campaign.save();
      }
    }

    // Show rewards
    this.renderer.clearCombatEntities();
    this.ui.showRewards({ result, stats }, this.campaign);
    this.setState(GS.REWARDS);
  }

  continueFromRewards() {
    if (!this.campaign) return;
    this.campaign.save();
    this.ui.setupCampaignMap(this.campaign);
    this.ui.updateCampaignHeader(this.campaign);
    this.ui.showScreen('campaign');
    this.setState(GS.CAMPAIGN);
  }

  // ── Input Handling ────────────────────────────────────────────
  _bindInput() {
    const c = this.canvas;

    // Keyboard
    window.addEventListener('keydown', e => {
      this._keys[e.key] = true;
      if (e.key === ' ' && this.state === GS.COMBAT) {
        e.preventDefault(); this.togglePause();
      }
      if ((e.key === 'Escape' || e.key === 'p' || e.key === 'P') && this.state === GS.COMBAT) {
        this.togglePause();
      }
      // Depth controls: Q = ascend, E = dive
      if (e.key === 'q' || e.key === 'Q') this.adjustDepth(-60);
      if (e.key === 'e' || e.key === 'E') this.adjustDepth(60);
      // Camera orbit: [ = rotate left, ] = rotate right
      if (e.key === '[') this.renderer.orbitCamera(-0.15);
      if (e.key === ']') this.renderer.orbitCamera( 0.15);
    });
    window.addEventListener('keyup', e => { this._keys[e.key] = false; });

    // Mouse click (combat)
    c.addEventListener('click', e => this._handleCanvasClick(e.clientX, e.clientY));

    // Mouse wheel zoom
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.renderer.zoomCamera(e.deltaY);
    }, { passive: false });

    // Mouse drag — middle=pan, right=orbit
    let dragMode = null, dragX = 0, dragY = 0;
    c.addEventListener('mousedown', e => {
      if (e.button === 1) { dragMode = 'pan';   dragX = e.clientX; dragY = e.clientY; }
      if (e.button === 2) { dragMode = 'orbit'; dragX = e.clientX; dragY = e.clientY; }
    });
    c.addEventListener('mousemove', e => {
      if (!dragMode || this.state !== GS.COMBAT) return;
      const dx = dragX - e.clientX, dy = dragY - e.clientY;
      if (dragMode === 'pan')   this.renderer.panCamera(dx * 1.2, dy * 1.2);
      if (dragMode === 'orbit') this.renderer.orbitCamera(-dx * 0.004);
      dragX = e.clientX; dragY = e.clientY;
    });
    c.addEventListener('mouseup', () => { dragMode = null; });
    c.addEventListener('contextmenu', e => e.preventDefault());

    // Touch events (mobile)
    c.addEventListener('touchstart', e => this._handleTouchStart(e), { passive: false });
    c.addEventListener('touchmove',  e => this._handleTouchMove(e),  { passive: false });
    c.addEventListener('touchend',   e => this._handleTouchEnd(e),   { passive: false });
  }

  _handleCanvasClick(cx, cy) {
    if (this.state === GS.COMBAT && this.combat) {
      this._handleCombatClick(cx, cy);
    }
    // Campaign clicks are handled via HTML node element listeners
  }

  _handleCombatClick(cx, cy) {
    const combat = this.combat;

    // Check if clicked on a ship
    const clickedShip = this.renderer.getShipFromScreen(cx, cy, combat);

    if (clickedShip) {
      if (clickedShip.isPlayer) {
        audio.play('select_ship', 0.7);
        this.cmdQueue.push(CmdType.SELECT, { shipId: clickedShip.id });
        // Sync renderer click plane to this ship's depth
        this.renderer.clickPlaneY = -(clickedShip.targetDepth || 0);
      } else {
        // Attack enemy
        if (combat.selectedShip && !combat.selectedShip.isDestroyed) {
          audio.play('shoot_plasma', 0.5);
          this.cmdQueue.push(CmdType.ATTACK, {
            shipId: combat.selectedShip.id,
            targetId: clickedShip.id,
          });
        }
      }
    } else {
      // Move selected ship to clicked ocean position
      const wp = this.renderer.getWorldPosFromScreen(cx, cy);
      if (wp && combat.selectedShip && !combat.selectedShip.isDestroyed) {
        audio.play('order_move', 0.5);
        this.cmdQueue.push(CmdType.MOVE, {
          shipId: combat.selectedShip.id,
          x: Math.max(50, Math.min(WORLD_W - 50, wp.worldX)),
          y: Math.max(50, Math.min(WORLD_H - 50, wp.worldY)),
          depth: combat.selectedShip.targetDepth,
        });
      }
    }
  }

  // ── Touch Input ───────────────────────────────────────────────
  _handleTouchStart(e) {
    e.preventDefault();
    const touches = e.changedTouches;

    if (e.touches.length === 2) {
      // Pinch start
      const t1 = e.touches[0], t2 = e.touches[1];
      this._pinchStart = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      this._pinchZoomStart = this.renderer.camHeight;
      return;
    }

    if (e.touches.length === 1) {
      this._touchStartX = touches[0].clientX;
      this._touchStartY = touches[0].clientY;
      this._touchMoved = false;
      this._touchStartTime = Date.now();
    }
  }

  _handleTouchMove(e) {
    e.preventDefault();

    if (e.touches.length === 2 && this._pinchStart !== null) {
      const t1 = e.touches[0], t2 = e.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const scale = this._pinchStart / dist;
      this.renderer.camHeight = Math.max(300, Math.min(2200, this._pinchZoomStart * scale));
      this.renderer.camTilt = this.renderer.camHeight * 0.75;
      return;
    }

    if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - this._touchStartX;
      const dy = e.touches[0].clientY - this._touchStartY;
      if (Math.hypot(dx, dy) > 8) {
        this._touchMoved = true;
        // Pan camera
        if (this.state === GS.COMBAT) {
          this.renderer.panCamera(dx * -1.2, dy * -1.2);
        }
        this._touchStartX = e.touches[0].clientX;
        this._touchStartY = e.touches[0].clientY;
      }
    }
  }

  _handleTouchEnd(e) {
    e.preventDefault();
    this._pinchStart = null;

    if (!this._touchMoved && e.changedTouches.length === 1) {
      const touch = e.changedTouches[0];
      // Check if tap was on a UI element (not canvas)
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      if (target !== this.canvas) return;
      this._handleCanvasClick(touch.clientX, touch.clientY);
    }
    this._touchMoved = false;
  }

  _resize() {
    const W = window.innerWidth, H = window.innerHeight;
    this.renderer.resize(W, H);
    this.canvas.style.width = W + 'px';
    this.canvas.style.height = H + 'px';
  }
}

// ── Boot ──────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  game.init();
});
