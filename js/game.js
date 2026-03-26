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
  PING:   'PING',    // { shipId } — active sonar pulse
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

    // Drag state — promoted to instance so game loop can read them for move preview
    this._dragMode             = null;
    this._rightDragMode        = null;
    this._rightDragDepthDelta  = 0;
    this._lastCursorX          = -1000;
    this._lastCursorY          = -1000;

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
      this.renderer.updateMoveCursor(this.combat, this._lastCursorX, this._lastCursorY, this._buildMoveDragInfo());
      this.ui.updateCombatHUD(this.combat);
      this.ui.renderTacticalMap(this.combat);

      // Check combat completion
      if (this.combat.complete) this._onCombatComplete();
    } else {
      this.renderer.renderBackground(dtRaw);
    }

    // Camera keyboard controls — behaviour depends on camera mode
    if (this.state === GS.COMBAT) {
      if (this.renderer.camMode === 'follow') {
        // Follow mode: arrows/WASD orbit around the tracked ship, [ ] also orbit
        const orbitSpd = 0.025;
        if (this._keys['ArrowLeft']  || this._keys['a']) this.renderer.orbitCamera(-orbitSpd);
        if (this._keys['ArrowRight'] || this._keys['d']) this.renderer.orbitCamera( orbitSpd);
        if (this._keys['ArrowUp']    || this._keys['w']) this.renderer.tiltCamera( 0.018);
        if (this._keys['ArrowDown']  || this._keys['s']) this.renderer.tiltCamera(-0.018);
      } else {
        // Free mode: WASD/arrows pan the camera, [ ] orbit
        const panSpd = 8;
        if (this._keys['ArrowLeft']  || this._keys['a']) this.renderer.panCamera(-panSpd, 0);
        if (this._keys['ArrowRight'] || this._keys['d']) this.renderer.panCamera( panSpd, 0);
        if (this._keys['ArrowUp']    || this._keys['w']) this.renderer.panCamera(0,  panSpd);
        if (this._keys['ArrowDown']  || this._keys['s']) this.renderer.panCamera(0, -panSpd);
        if (this._keys['[']) this.renderer.orbitCamera(-0.025);
        if (this._keys[']']) this.renderer.orbitCamera( 0.025);
      }
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
        case CmdType.PING: {
          const ps = this.combat.playerShips.find(s => s.id === cmd.data.shipId);
          if (ps) this.combat.activeSonarPulse(ps);
          break;
        }
      }
    }
  }

  // ── New Run / Continue ────────────────────────────────────────
  startNewRun() {
    this.ui.showFleetBuilder();
  }

  confirmFleetAndStart(fleet) {
    this.campaign = Campaign.newRunWithFleet(fleet);
    this.campaign.save();
    this.ui.setupCampaignMap(this.campaign);
    this.ui.updateCampaignHeader(this.campaign);
    this.ui.showScreen('campaign');
    this.setState(GS.CAMPAIGN);
    audio.playMusic('menu');
  }

  continueRun() {
    const c = Campaign.load();
    if (!c) return;
    this.campaign = c;
    this.ui.setupCampaignMap(this.campaign);
    this.ui.updateCampaignHeader(this.campaign);
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
    // Pre-compile all shaders before first frame to prevent first-render lag spike
    this.renderer.renderer.compile(this.renderer.scene, this.renderer.camera);
    this.ui.showCombatTutorial();
  }

  // Adjust depth of ALL selected ships (positive = dive, negative = ascend)
  adjustDepth(delta) {
    if (!this.combat) return;
    const ships = (this.combat.selectedShips && this.combat.selectedShips.length > 0)
      ? this.combat.selectedShips
      : (this.combat.selectedShip ? [this.combat.selectedShip] : []);
    if (ships.length === 0) return;
    for (const s of ships) {
      if (s.isDestroyed) continue;
      s.setDepthTarget((s.targetDepth || 0) + delta);
      s._manualDepthOverride = true;
      setTimeout(() => { if (!s.isDestroyed) s._manualDepthOverride = false; }, 6000);
    }
    audio.play('depth_change', 0.6);
    const primary = this.combat.selectedShip;
    if (primary && !primary.isDestroyed) {
      if (this.combat.moveMarker) this.combat.moveMarker.depth = primary.targetDepth;
      this.renderer.clickPlaneY = -primary.targetDepth;
    }
  }

  focusCamera(ship) {
    if (!ship || !this.renderer) return;
    this.renderer.camTarget.set(
      this.renderer.wx(ship.x),
      -(ship.depth || 0),
      this.renderer.wz(ship.y)
    );
  }

  // Returns drag context for the move cursor preview.
  // false   = suppress (box-select or pan in progress)
  // null    = hovering (show ghost formation preview)
  // object  = active right-drag with mode details
  _buildMoveDragInfo() {
    if (this._dragMode === 'box' || this._dragMode === 'pan') return false;
    if (this._dragMode === 'right') {
      if (this._rightDragMode === 'orbit') return { mode: 'orbit' };
      if (this._rightDragMode === 'depth') return { mode: 'depth', depthDelta: this._rightDragDepthDelta };
      // Right button down but axis not yet locked — treat as hover
      return null;
    }
    return null; // hovering
  }

  activeSonar() {
    if (!this.combat || !this.combat.selectedShip) return;
    const ship = this.combat.selectedShip;
    if (ship.activeSonarCooldown > 0) return;
    this.cmdQueue.push(CmdType.PING, { shipId: ship.id });
    audio.play('shoot_plasma', 0.3);
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
        e.preventDefault(); this.renderer.toggleTacticalView();
      }
      if (e.key === 'Escape' && this.state === GS.COMBAT) {
        const c = this.combat;
        if (c && (c.selectedShip || (c.selectedShips && c.selectedShips.length > 0))) {
          c.selectedShip = null;
          c.selectedShips = [];
        } else {
          this.togglePause();
        }
      }
      if ((e.key === 'p' || e.key === 'P') && this.state === GS.COMBAT) {
        this.togglePause();
      }
      // Depth controls: Q = ascend, E = dive
      if (e.key === 'q' || e.key === 'Q') this.adjustDepth(-80);
      if (e.key === 'e' || e.key === 'E') this.adjustDepth(80);
      // Camera orbit: [ = rotate left, ] = rotate right
      if (e.key === '[') this.renderer.orbitCamera(-0.15);
      if (e.key === ']') this.renderer.orbitCamera( 0.15);
      // Camera tilt: PageUp = more overhead, PageDown = more side-on
      if (e.key === 'PageUp')   this.renderer.tiltCamera( 0.1);
      if (e.key === 'PageDown') this.renderer.tiltCamera(-0.1);
      // Active sonar ping: F key
      if ((e.key === 'f' || e.key === 'F') && this.state === GS.COMBAT) this.activeSonar();
      // Damage control view: V key
      if ((e.key === 'v' || e.key === 'V') && this.state === GS.COMBAT) {
        const sel = this.combat && this.combat.selectedShip;
        if (sel) this.ui.openDamageControl(sel);
      }
      // Arc overlay toggle: G key (only on initial press, not repeat)
      if ((e.key === 'g' || e.key === 'G') && this.state === GS.COMBAT && !e.repeat) {
        const on = this.renderer.toggleArcOverlay();
        this.ui && this.ui.setArcOverlayHint(on);
      }
      // Evasive mode toggle: X key
      if ((e.key === 'x' || e.key === 'X') && this.state === GS.COMBAT && this.combat) {
        const ships = this.combat.selectedShips?.length > 0
          ? this.combat.selectedShips : (this.combat.selectedShip ? [this.combat.selectedShip] : []);
        for (const s of ships) s._evadeMode = !s._evadeMode;
      }
      // Tactical view toggle: M key
      if ((e.key === 'm' || e.key === 'M') && this.state === GS.COMBAT) {
        this.renderer.toggleTacticalView();
      }
      // Ship groups: Ctrl+1-5 assign, 1-5 recall
      if (this.state === GS.COMBAT && this.combat) {
        const grpKey = ['Digit1','Digit2','Digit3','Digit4','Digit5'].indexOf(e.code);
        if (grpKey >= 0) {
          if (!this.combat._groups) this.combat._groups = {};
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const cur = this.combat.selectedShips.length > 0
              ? this.combat.selectedShips
              : (this.combat.selectedShip ? [this.combat.selectedShip] : []);
            this.combat._groups[grpKey] = [...cur];
          } else {
            const grp = (this.combat._groups || {})[grpKey];
            if (grp) {
              const alive = grp.filter(s => !s.isDestroyed);
              if (alive.length > 0) {
                this.combat.selectedShips = alive;
                this.combat.selectedShip = alive[0];
                this.focusCamera(alive[0]);
                audio.play('select_ship', 0.7);
              }
            }
          }
        }
      }
    });
    window.addEventListener('keyup', e => { this._keys[e.key] = false; });

    // Mouse click (combat) — suppress if a box-select drag just completed
    c.addEventListener('click', e => {
      if (this._boxSelectJustFinished) { this._boxSelectJustFinished = false; return; }
      if (this.state === GS.COMBAT && this.combat) {
        this._handleCombatClick(e.clientX, e.clientY, e.shiftKey);
      }
    });

    // Mouse wheel: scroll = zoom, Ctrl+scroll = tilt
    c.addEventListener('wheel', e => {
      e.preventDefault();
      if (e.ctrlKey) {
        this.renderer.tiltCamera(e.deltaY * -0.001);
      } else {
        this.renderer.zoomCamera(e.deltaY);
      }
    }, { passive: false });

    // Mouse drag — left=box-select/select, middle=pan, right=command+orbit/depth
    let dragX = 0, dragY = 0;
    let boxStartX = 0, boxStartY = 0;
    let rightStartX = 0, rightStartY = 0;

    // Box select overlay
    const boxEl = document.createElement('div');
    boxEl.id = 'box-select';
    boxEl.style.cssText = 'position:fixed;border:1px solid rgba(0,229,255,0.7);background:rgba(0,229,255,0.05);pointer-events:none;display:none;z-index:100';
    document.body.appendChild(boxEl);

    // Depth-drag indicator (shown when right-dragging vertically to set move depth)
    const depthDragEl = document.createElement('div');
    depthDragEl.style.cssText = 'position:fixed;background:rgba(0,15,35,0.9);border:1px solid #0af;color:#7ef;font:bold 11px/18px monospace;padding:4px 10px;border-radius:4px;pointer-events:none;display:none;z-index:101;letter-spacing:1px;';
    document.body.appendChild(depthDragEl);

    c.addEventListener('mousedown', e => {
      if (e.button === 0 && this.state === GS.COMBAT) {
        this._dragMode = 'box'; boxStartX = e.clientX; boxStartY = e.clientY;
        dragX = e.clientX; dragY = e.clientY;
      }
      if (e.button === 1) { this._dragMode = 'pan'; dragX = e.clientX; dragY = e.clientY; }
      if (e.button === 2) {
        this._dragMode = 'right';
        rightStartX = e.clientX; rightStartY = e.clientY;
        this._rightDragMode = null; this._rightDragDepthDelta = 0;
        dragX = e.clientX; dragY = e.clientY;
      }
    });
    c.addEventListener('mousemove', e => {
      // Always track cursor position for move preview
      this._lastCursorX = e.clientX;
      this._lastCursorY = e.clientY;
      if (!this._dragMode || this.state !== GS.COMBAT) return;
      const dx = dragX - e.clientX, dy = dragY - e.clientY;
      if (this._dragMode === 'box') {
        const moved = Math.hypot(e.clientX - boxStartX, e.clientY - boxStartY);
        if (moved > 8) {
          const x1 = Math.min(boxStartX, e.clientX), y1 = Math.min(boxStartY, e.clientY);
          const x2 = Math.max(boxStartX, e.clientX), y2 = Math.max(boxStartY, e.clientY);
          boxEl.style.display = 'block';
          boxEl.style.left = x1+'px'; boxEl.style.top = y1+'px';
          boxEl.style.width = (x2-x1)+'px'; boxEl.style.height = (y2-y1)+'px';
        }
      } else if (this._dragMode === 'pan') {
        // Middle-drag: orbit camera (both modes)
        this.renderer.orbitCamera(-dx * 0.004);
        this.renderer.tiltCamera(dy * 0.003);
      } else if (this._dragMode === 'right') {
        const totalDx = e.clientX - rightStartX, totalDy = e.clientY - rightStartY;
        const totalDist = Math.hypot(totalDx, totalDy);
        if (totalDist > 10 && this._rightDragMode === null) {
          // Lock to dominant axis: horizontal = orbit, vertical = depth-move
          this._rightDragMode = Math.abs(totalDy) > Math.abs(totalDx) ? 'depth' : 'orbit';
        }
        if (this._rightDragMode === 'orbit') {
          this.renderer.orbitCamera(-dx * 0.004);
          this.renderer.tiltCamera(dy * 0.003);
        } else if (this._rightDragMode === 'depth' && this.combat) {
          this._rightDragDepthDelta = totalDy * 2; // screen-down = dive deeper
          const ships = (this.combat.selectedShips && this.combat.selectedShips.length > 0)
            ? this.combat.selectedShips : (this.combat.selectedShip ? [this.combat.selectedShip] : []);
          const primary = ships[0];
          if (primary) {
            const planned = Math.max(0, Math.min(WORLD_DEPTH, (primary.targetDepth||0) + this._rightDragDepthDelta));
            depthDragEl.textContent = `DEPTH: ${Math.round(planned)}m`;
            depthDragEl.style.display = 'block';
            depthDragEl.style.left = (e.clientX + 14) + 'px';
            depthDragEl.style.top  = (e.clientY - 10) + 'px';
          }
        }
      }
      dragX = e.clientX; dragY = e.clientY;
    });
    c.addEventListener('mouseup', e => {
      depthDragEl.style.display = 'none';
      if (this._dragMode === 'box' && boxEl.style.display !== 'none') {
        const x1 = Math.min(boxStartX, e.clientX), y1 = Math.min(boxStartY, e.clientY);
        const x2 = Math.max(boxStartX, e.clientX), y2 = Math.max(boxStartY, e.clientY);
        if (this.combat && x2 - x1 > 8) {
          const inBox = this.combat.playerShips.filter(s => {
            if (s.isDestroyed) return false;
            const sc = this.renderer.worldToScreen(s.x, s.depth || 0, s.y);
            return sc && sc.x >= x1 && sc.x <= x2 && sc.y >= y1 && sc.y <= y2;
          });
          if (inBox.length > 0) {
            this.combat.selectedShips = inBox;
            this.combat.selectedShip = inBox[0];
            audio.play('select_ship', 0.7);
          }
          this._boxSelectJustFinished = true;
        }
        boxEl.style.display = 'none';
      }
      // Right-click release: issue command unless was an orbit drag
      if (e.button === 2 && this._dragMode === 'right' && this.state === GS.COMBAT && this.combat) {
        if (this._rightDragMode !== 'orbit') {
          this._handleCombatRightClick(rightStartX, rightStartY,
            this._rightDragMode === 'depth' ? this._rightDragDepthDelta : 0);
        }
      }
      this._dragMode = null;
    });
    c.addEventListener('contextmenu', e => e.preventDefault());

    // Touch events (mobile)
    c.addEventListener('touchstart', e => this._handleTouchStart(e), { passive: false });
    c.addEventListener('touchmove',  e => this._handleTouchMove(e),  { passive: false });
    c.addEventListener('touchend',   e => this._handleTouchEnd(e),   { passive: false });
  }

  _handleCanvasClick(cx, cy) {
    if (this.state === GS.COMBAT && this.combat) {
      this._handleCombatClick(cx, cy, false);
    }
  }

  // Left-click: selection only. Left-click empty space = deselect.
  _handleCombatClick(cx, cy, shiftHeld) {
    const combat = this.combat;
    const clickedShip = this.renderer.getShipFromScreen(cx, cy, combat);

    if (clickedShip && clickedShip.isPlayer) {
      audio.play('select_ship', 0.7);
      if (shiftHeld) {
        const idx = combat.selectedShips.indexOf(clickedShip);
        if (idx >= 0) {
          combat.selectedShips.splice(idx, 1);
          combat.selectedShip = combat.selectedShips[0] || null;
        } else {
          combat.selectedShips.push(clickedShip);
          combat.selectedShip = clickedShip;
        }
      } else {
        combat.selectedShip = clickedShip;
        combat.selectedShips = [clickedShip];
      }
      this.renderer.clickPlaneY = -(clickedShip.targetDepth || 0);
    } else if (!clickedShip) {
      // Left-click on empty space: deselect all
      if (!shiftHeld) {
        combat.selectedShip = null;
        combat.selectedShips = [];
      }
    }
    // Left-click on enemy with selection: attack (convenience shortcut)
    else if (!clickedShip.isPlayer) {
      const toAttack = combat.selectedShips.length > 0
        ? combat.selectedShips : (combat.selectedShip ? [combat.selectedShip] : []);
      if (toAttack.length > 0) {
        for (const ps of toAttack) {
          if (!ps.isDestroyed) {
            audio.play('shoot_plasma', 0.4);
            ps.attackTarget = clickedShip;
          }
        }
        // Selection is maintained — no deselect
      }
    }
  }

  // Right-click: move order (empty space) or attack order (enemy). depthDelta from vertical drag.
  _handleCombatRightClick(cx, cy, depthDelta = 0) {
    const combat = this.combat;
    const clickedShip = this.renderer.getShipFromScreen(cx, cy, combat);

    if (clickedShip && !clickedShip.isPlayer) {
      // Right-click enemy: attack with all selected ships (selection maintained)
      const toAttack = combat.selectedShips.length > 0
        ? combat.selectedShips : (combat.selectedShip ? [combat.selectedShip] : []);
      for (const ps of toAttack) {
        if (!ps.isDestroyed) {
          audio.play('shoot_plasma', 0.4);
          ps.attackTarget = clickedShip;
        }
      }
    } else if (!clickedShip) {
      // Right-click empty space: move order
      const wp = this.renderer.getWorldPosFromScreen(cx, cy);
      if (!wp) return;
      const selected = combat.selectedShips.length > 0
        ? combat.selectedShips : (combat.selectedShip ? [combat.selectedShip] : []);
      if (selected.length === 0) return;

      const toMove = selected.filter(s => !s.isDestroyed);
      if (toMove.length === 0) return;
      audio.play('order_move', 0.5);

      let gcx = 0, gcy = 0;
      for (const s of toMove) { gcx += s.x; gcy += s.y; }
      gcx /= toMove.length; gcy /= toMove.length;

      // Identify leader for formation ships (primary selected, or first ship)
      const formationShips = toMove.filter(s => !s._freeMove);
      const leader = (combat.selectedShip && formationShips.includes(combat.selectedShip))
        ? combat.selectedShip : formationShips[0];
      const formationMinSpeed = formationShips.length > 1
        ? Math.min(...formationShips.map(s => s.maxSpeed)) : null;

      for (const s of toMove) {
        // Clear any previous formation state
        s._formationLeader = null;
        s._formationMaxSpeed = null;

        let tx, ty;
        if (s._freeMove) {
          tx = Math.max(300, Math.min(WORLD_W - 300, wp.worldX));
          ty = Math.max(300, Math.min(WORLD_H - 300, wp.worldY));
        } else {
          tx = Math.max(300, Math.min(WORLD_W - 300, wp.worldX + (s.x - gcx)));
          ty = Math.max(300, Math.min(WORLD_H - 300, wp.worldY + (s.y - gcy)));
        }
        s.setMoveTarget(tx, ty);
        const newDepth = Math.max(0, Math.min(WORLD_DEPTH, (s.targetDepth || 0) + depthDelta));
        s.setDepthTarget(newDepth);
        if (depthDelta !== 0) s._manualDepthOverride = true;
      }

      // Set up formation: followers track leader, all capped to slowest speed
      if (leader && formationShips.length > 1) {
        leader._formationMaxSpeed = formationMinSpeed;
        for (const s of formationShips) {
          if (s === leader) continue;
          s._formationLeader = leader;
          s._formationOffX = s.x - leader.x;
          s._formationOffY = s.y - leader.y;
          s._formationMaxSpeed = formationMinSpeed;
        }
      }

      const primary = combat.selectedShip || toMove[0];
      combat.moveMarker = { x: wp.worldX, y: wp.worldY, depth: primary.targetDepth, timer: 1.5 };
      this.renderer.clickPlaneY = -primary.targetDepth;
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
