'use strict';
// ================================================================
// CAMPAIGN.JS — Campaign state, map generation, save/load
// ================================================================

const SAVE_KEY = 'pelagos_save_v1';

class Campaign {
  constructor() {
    this.sector = 0;
    this.credits = CAMPAIGN_CONFIG.startCredits;
    this.playerFleetData = [];   // ship save data objects
    this.nodes = [];             // current sector's node graph
    this.currentNodeId = 0;
    this.visitedNodes = new Set();
    this.threat = 0;
    this.intel = 0;
    this.kethTruce = false;
    this.totalEnemiesKilled = 0;
    this.totalRunTime = 0;
    this.sectorsCleared = 0;
  }

  static newRun() {
    const c = new Campaign();
    c.sector = 0;
    c.credits = CAMPAIGN_CONFIG.startCredits;

    // Create starting fleet
    c.playerFleetData = STARTING_FLEET.map(s => {
      const tpl = SHIP_TEMPLATES[s.templateId];
      return {
        templateId: s.templateId,
        name: s.name,
        isFlagship: s.isFlagship || false,
        hull: tpl.maxHull,
        maxHull: tpl.maxHull,
        armor: tpl.armor,
        maxSpeed: tpl.maxSpeed,
        upgrades: [],
        xp: 0,
        level: 1,
      };
    });

    c.nodes = c._generateSectorMap(0);
    const startNode = c.nodes.find(n => n.type === 'START');
    c.currentNodeId = startNode.id;
    c.visitedNodes = new Set([c.currentNodeId]);
    startNode.visited = true;
    return c;
  }

  static newRunWithFleet(chosenFleet) {
    const c = new Campaign();
    c.sector = 0;
    c.credits = CAMPAIGN_CONFIG.startCredits;

    // Build fleet from the provided array of {templateId, name, modules, moduleSlotIds}
    c.playerFleetData = chosenFleet.map(s => {
      const tpl = SHIP_TEMPLATES[s.templateId];
      const sd = {
        templateId: s.templateId,
        name: s.name,
        hull: tpl.maxHull,
        maxHull: tpl.maxHull,
        armor: tpl.armor,
        maxSpeed: tpl.maxSpeed,
        upgrades: [],
        modules: [],
        xp: 0,
        level: 1,
      };
      // Apply pre-game modules from fleet builder
      const moduleSlotIds = s.moduleSlotIds || [];
      const extraWeaponSlotIds = [];
      for (let mi = 0; mi < (s.modules || []).length; mi++) {
        const modId = s.modules[mi];
        const slotId = moduleSlotIds[mi] || null;
        const mod = MODULE_DATA[modId];
        if (!mod) continue;
        const ship = Ship.fromSaveData(sd);
        if (!ship) continue;
        const wBefore = ship.weapons.length;
        mod.apply(ship);
        // Track slot IDs for each weapon added by this module
        const added = ship.weapons.length - wBefore;
        for (let j = 0; j < added; j++) extraWeaponSlotIds.push(slotId);
        sd.hull       = ship.hull;
        sd.maxHull    = ship.maxHull;
        sd.armor      = ship.armor;
        sd.maxSpeed   = ship.maxSpeed;
        sd.depthRate  = ship.depthRate;
        sd.ewStrength = ship.ewStrength;
        sd.detectRange= ship.detectRange;
        sd.stealthRating = ship.stealthRating;
        sd.hullRegen  = ship.hullRegen;
        sd.modules.push(modId);
        sd.weaponIds  = ship.weapons.map(w => w.id);
      }
      if (extraWeaponSlotIds.length > 0) sd.extraWeaponSlotIds = extraWeaponSlotIds;
      return sd;
    });

    c.nodes = c._generateSectorMap(0);
    const startNode2 = c.nodes.find(n => n.type === 'START');
    c.currentNodeId = startNode2.id;
    c.visitedNodes = new Set([c.currentNodeId]);
    startNode2.visited = true;
    return c;
  }

  // ── Map Generation ─────────────────────────────────────────────
  _generateSectorMap(sectorIndex) {
    const nodes = [];
    let nextId = 0;

    // Layout: columns left to right
    // Col 0: START (1 node)
    // Col 1-4: random nodes (3 rows each)
    // Col 5: BOSS (1 node)
    const numCols = 6;
    const rowsPerCol = 3;
    const mapW = 800, mapH = 500;
    const colW = mapW / (numCols - 1);
    const rowH = mapH / (rowsPerCol - 1);

    const weightsByType = sectorIndex === 0
      ? { COMBAT:3, EVENT:2, STORE:1, REST:2, ELITE:1 }
      : sectorIndex === 1
      ? { COMBAT:3, EVENT:1, STORE:1, REST:1, ELITE:2 }
      : { COMBAT:2, EVENT:1, STORE:1, REST:2, ELITE:3 };

    const typePool = [];
    for (const [type, weight] of Object.entries(weightsByType)) {
      for (let i = 0; i < weight; i++) typePool.push(type);
    }

    const grid = []; // grid[col][row] = node | null

    for (let col = 0; col < numCols; col++) {
      grid[col] = [];
      for (let row = 0; row < rowsPerCol; row++) {
        if (col === 0) {
          // Start node, middle row only
          if (row === 1) {
            const node = { id: nextId++, type: 'START', col, row, x: col * colW, y: row * rowH, connections: [], visited: false };
            grid[col][row] = node;
            nodes.push(node);
          } else {
            grid[col][row] = null;
          }
        } else if (col === numCols - 1) {
          // Boss node, middle row only
          if (row === 1) {
            const node = { id: nextId++, type: 'BOSS', col, row, x: col * colW, y: row * rowH, connections: [], visited: false };
            grid[col][row] = node;
            nodes.push(node);
          } else {
            grid[col][row] = null;
          }
        } else {
          // Random node, but some rows might be empty
          if (Math.random() < 0.8) {
            const type = typePool[Math.floor(Math.random() * typePool.length)];
            const node = { id: nextId++, type, col, row, x: col * colW, y: row * rowH, connections: [], visited: false };
            // Assign event data
            if (type === 'EVENT') {
              node.eventId = Math.floor(Math.random() * EVENTS.length);
            }
            grid[col][row] = node;
            nodes.push(node);
          } else {
            grid[col][row] = null;
          }
        }
      }
    }

    // Ensure at least one node per middle column
    for (let col = 1; col < numCols - 1; col++) {
      const hasAny = grid[col].some(n => n !== null);
      if (!hasAny) {
        const row = 1;
        const type = typePool[Math.floor(Math.random() * typePool.length)];
        const node = { id: nextId++, type, col, row, x: col * colW, y: row * rowH, connections: [], visited: false };
        grid[col][row] = node;
        nodes.push(node);
      }
    }

    // Build connections: each node connects to 1-2 nodes in the next column
    for (let col = 0; col < numCols - 1; col++) {
      const fromNodes = grid[col].filter(n => n !== null);
      const toNodes = grid[col + 1].filter(n => n !== null);
      if (toNodes.length === 0) continue;

      for (const fromNode of fromNodes) {
        // Find nearest in next col
        const sorted = [...toNodes].sort((a, b) => Math.abs(a.row - fromNode.row) - Math.abs(b.row - fromNode.row));
        fromNode.connections.push(sorted[0].id);
        // Maybe add a second connection
        if (sorted.length > 1 && Math.random() < 0.4) {
          fromNode.connections.push(sorted[1].id);
        }
      }

      // Ensure all toNodes are reachable
      for (const toNode of toNodes) {
        const hasIncoming = fromNodes.some(f => f.connections.includes(toNode.id));
        if (!hasIncoming && fromNodes.length > 0) {
          const nearest = fromNodes.reduce((a, b) => Math.abs(a.row - toNode.row) < Math.abs(b.row - toNode.row) ? a : b);
          if (!nearest.connections.includes(toNode.id)) {
            nearest.connections.push(toNode.id);
          }
        }
      }
    }

    return nodes;
  }

  // ── Navigation ─────────────────────────────────────────────────
  getNode(id) { return this.nodes.find(n => n.id === id) || null; }
  getCurrentNode() { return this.getNode(this.currentNodeId); }

  getAvailableNodes() {
    const current = this.getCurrentNode();
    if (!current) return [];
    return current.connections.map(id => this.getNode(id)).filter(n => n && !n.visited);
  }

  moveToNode(nodeId) {
    const node = this.getNode(nodeId);
    if (!node) return false;
    this.currentNodeId = nodeId;
    node.visited = true;
    this.visitedNodes.add(nodeId);
    return true;
  }

  // ── Enemy generation for combat ────────────────────────────────
  generateEncounter(node) {
    const faction = CAMPAIGN_CONFIG.sectorFactions[this.sector];
    const cfg = CAMPAIGN_CONFIG;
    if (node.type === 'BOSS') {
      return { ...cfg.bosses[this.sector], isBoss: true };
    }
    const [minE, maxE] = cfg.enemyCounts[this.sector];
    const count = minE + Math.floor(Math.random() * (maxE - minE + 1));
    const isElite = node.type === 'ELITE';

    const factionEnemies = Object.entries(ENEMY_TEMPLATES)
      .filter(([k, v]) => v.faction === faction)
      .map(([k]) => k);

    const enemies = [];
    for (let i = 0; i < count; i++) {
      let pick = factionEnemies[Math.floor(Math.random() * factionEnemies.length)];
      // Elites get heavier ships
      if (isElite && Math.random() < 0.5) {
        const heavies = factionEnemies.filter(k => ENEMY_TEMPLATES[k].maxHull > 100);
        if (heavies.length) pick = heavies[Math.floor(Math.random() * heavies.length)];
      }
      enemies.push(pick);
    }

    return {
      name: isElite ? 'Elite Patrol' : 'Enemy Contact',
      desc: isElite ? 'A heavily armed patrol engages you.' : 'Enemy vessels detected on approach.',
      enemies,
      isBoss: false,
      faction,
    };
  }

  // ── Post-combat ────────────────────────────────────────────────
  applyPostCombat(combatEngine) {
    const stats = combatEngine.stats;
    this.credits += stats.creditsEarned;
    this.totalEnemiesKilled += stats.enemiesDestroyed;

    // Update fleet with surviving ships (sync damage)
    for (const ps of combatEngine.playerShips) {
      const sd = this.playerFleetData.find(d => d.name === ps.name);
      if (!sd) continue;
      if (ps.isDestroyed) {
        const idx = this.playerFleetData.indexOf(sd);
        if (idx !== -1) this.playerFleetData.splice(idx, 1);
      } else {
        sd.hull = ps.hull;
        sd.xp = (sd.xp || 0) + Math.floor(stats.xpEarned / combatEngine.playerShips.length);
        // Level up check
        const xpNeeded = sd.level * 100;
        if (sd.xp >= xpNeeded) { sd.level++; sd.xp -= xpNeeded; }
      }
    }
  }

  advanceSector() {
    this.sector++;
    this.sectorsCleared++;
    this.kethTruce = false;
    if (this.sector < CAMPAIGN_CONFIG.sectors) {
      this.nodes = this._generateSectorMap(this.sector);
      const startNode = this.nodes.find(n => n.type === 'START');
      if (!startNode) { this.nodes = this._generateSectorMap(this.sector); }
      const sn = this.nodes.find(n => n.type === 'START');
      if (sn) {
        this.currentNodeId = sn.id;
        this.visitedNodes = new Set([sn.id]);
        sn.visited = true;
      }
    }
  }

  rest() {
    // Repair all ships
    for (const sd of this.playerFleetData) {
      sd.hull = Math.min(sd.hull + Math.round(sd.maxHull * 0.4), sd.maxHull);
    }
  }

  buyUpgrade(upgrade, targetShipName) {
    if (this.credits < upgrade.cost) return false;
    const sd = this.playerFleetData.find(d => d.name === targetShipName);
    if (!sd) return false;
    // Apply via temporary ship object
    const ship = Ship.fromSaveData(sd);
    if (!ship) return false;
    upgrade.apply(ship);
    // Sync back
    sd.hull = ship.hull;
    sd.maxHull = ship.maxHull;
    sd.armor = ship.armor;
    sd.maxSpeed = ship.maxSpeed;
    if (!upgrade.consumable) sd.upgrades.push(upgrade.id);
    this.credits -= upgrade.cost;
    return true;
  }

  // ── Module system ─────────────────────────────────────────────
  getShipModuleSlots(sd) {
    const slots = MODULE_SLOTS[sd.templateId] || { weapon:1, defense:1, system:1 };
    const used  = { weapon:0, defense:0, system:0 };
    for (const modId of (sd.modules || [])) {
      const mod = MODULE_DATA[modId];
      if (mod) used[mod.category] = (used[mod.category] || 0) + 1;
    }
    return { slots, used };
  }

  buyModule(mod, targetShipName) {
    if (this.credits < mod.cost) return { ok:false, reason:'Not enough credits' };
    if (this.playerFleetData.length === 0) return { ok:false, reason:'No ships' };
    const sd = this.playerFleetData.find(d => d.name === targetShipName);
    if (!sd) return { ok:false, reason:'Ship not found' };
    const { slots, used } = this.getShipModuleSlots(sd);
    if ((used[mod.category] || 0) >= (slots[mod.category] || 0))
      return { ok:false, reason:`No ${mod.category} slots remaining` };

    // Apply module effects
    const ship = Ship.fromSaveData(sd);
    if (!ship) return { ok:false, reason:'Cannot load ship' };
    const wBefore = ship.weapons.length;
    mod.apply(ship);
    // Sync stats back
    sd.hull       = ship.hull;
    sd.maxHull    = ship.maxHull;
    sd.armor      = ship.armor;
    sd.maxSpeed   = ship.maxSpeed;
    sd.depthRate  = ship.depthRate;
    sd.ewStrength = ship.ewStrength;
    sd.detectRange= ship.detectRange;
    sd.stealthRating = ship.stealthRating;
    sd.hullRegen  = ship.hullRegen;
    sd.modules    = sd.modules || [];
    sd.modules.push(mod.id);
    // Track slot IDs for new weapons (null = auto/unassigned for in-game purchases)
    if (ship.weapons.length > wBefore) {
      if (!sd.extraWeaponSlotIds) sd.extraWeaponSlotIds = [];
      for (let i = wBefore; i < ship.weapons.length; i++) sd.extraWeaponSlotIds.push(null);
    }
    // Persist weapon changes via weaponIds list
    sd.weaponIds  = ship.weapons.map(w => w.id);

    this.credits -= mod.cost;
    return { ok:true };
  }

  // ── Recruit new ships ──────────────────────────────────────────
  recruitShip(templateId, cost) {
    if (this.credits < cost) return { ok:false, reason:'Not enough credits' };
    if (this.playerFleetData.length >= MAX_FLEET_SIZE)
      return { ok:false, reason:`Fleet at max size (${MAX_FLEET_SIZE})` };
    const tpl = SHIP_TEMPLATES[templateId];
    if (!tpl) return { ok:false, reason:'Unknown ship type' };

    // Pick a unique name
    const usedNames = new Set(this.playerFleetData.map(s => s.name));
    let shipName = '';
    for (const n of SHIP_NAME_POOL) {
      const candidate = `INS ${n}`;
      if (!usedNames.has(candidate)) { shipName = candidate; break; }
    }
    if (!shipName) shipName = `INS ${templateId.toUpperCase()}-${Date.now() % 1000}`;

    this.playerFleetData.push({
      templateId,
      name: shipName,
      isFlagship: false,
      hull: tpl.maxHull,
      maxHull: tpl.maxHull,
      armor: tpl.armor,
      maxSpeed: tpl.maxSpeed,
      upgrades: [],
      modules: [],
      xp: 0,
      level: 1,
    });
    this.credits -= cost;
    return { ok:true, name: shipName };
  }

  isFlagshipAlive() {
    return this.playerFleetData.some(d => d.isFlagship && d.hull > 0);
  }

  // ── Save / Load ────────────────────────────────────────────────
  save() {
    const data = {
      sector: this.sector,
      credits: this.credits,
      playerFleetData: this.playerFleetData,
      nodes: this.nodes.map(n => ({ ...n, visited: n.visited })),
      currentNodeId: this.currentNodeId,
      visitedNodes: [...this.visitedNodes],
      threat: this.threat,
      intel: this.intel,
      totalEnemiesKilled: this.totalEnemiesKilled,
      sectorsCleared: this.sectorsCleared,
      kethTruce: this.kethTruce,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  static load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      const c = new Campaign();
      c.sector = data.sector;
      c.credits = data.credits;
      c.playerFleetData = data.playerFleetData;
      c.nodes = data.nodes;
      c.currentNodeId = data.currentNodeId;
      c.visitedNodes = new Set(data.visitedNodes);
      c.threat = data.threat || 0;
      c.intel = data.intel || 0;
      c.totalEnemiesKilled = data.totalEnemiesKilled || 0;
      c.sectorsCleared = data.sectorsCleared || 0;
      c.kethTruce = data.kethTruce || false;
      return c;
    } catch (e) {
      return null;
    }
  }

  static hasSave() {
    return !!localStorage.getItem(SAVE_KEY);
  }

  static deleteSave() {
    localStorage.removeItem(SAVE_KEY);
  }
}
