'use strict';
// ================================================================
// ENGINE.JS — Ship, Projectile, Drone, Effect classes + CombatEngine
// ================================================================

let _eid = 0;
const uid = () => ++_eid;

function normalizeAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function dist(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

function angleToward(fromX, fromY, toX, toY) {
  return Math.atan2(toX - fromX, -(toY - fromY));
}

// ── Ship ──────────────────────────────────────────────────────────
class Ship {
  constructor(template, isPlayer, name) {
    this.id = uid();
    this.name = name || template.name;
    this.templateId = template.id;
    this.isPlayer = isPlayer;
    this.isFlagship = false;
    this.faction = template.faction || 'player';

    // Stats
    this.maxHull = template.maxHull;
    this.hull = template.maxHull;
    this.armor = template.armor;
    this.maxSpeed = template.maxSpeed;
    this.accel = template.accel;
    this.turnRate = template.turnRate;
    this.size = template.size;
    this.color = template.color;
    this.glowColor = template.glowColor || template.color;
    // Reward values (enemies only)
    this.xpValue = template.xp || 0;
    this.creditValue = template.credits || 0;

    // Physics
    this.x = 0; this.y = 0;
    this.angle = 0;
    this.speed = 0;
    this.moveTargetX = null;
    this.moveTargetY = null;
    this.atTarget = true;

    // Combat state
    this.attackTarget = null;
    this.weapons = (template.weapons || []).map(wid => {
      const wd = Object.assign({}, WEAPON_DATA[wid]);
      if (!wd.type) return null; // skip unknown weapons
      wd.id = wid;
      wd.timer = 0;          // cooldown timer (counts down)
      wd.beamActive = false;
      wd.beamTimer = 0;
      wd.beamTarget = null;
      wd.recharging = false;
      wd.droneCount = 0;
      // Torpedo ammo tracking
      wd.ammo = (wd.maxAmmo !== undefined) ? wd.maxAmmo : Infinity;
      return wd;
    }).filter(Boolean);

    // ── Turret slots ───────────────────────────────────────────────
    // pos: ship-local 2D — +y=forward(bow), +x=starboard
    // facing: angle offset from ship heading; arc: half-angle of fire cone
    this.slots = [];
    if (template.slots && template.slots.length > 0) {
      for (const sDef of template.slots) {
        const slot = {
          id: sDef.id,
          label: sDef.label || sDef.id,
          pos: { x: sDef.pos.x, y: sDef.pos.y },
          facing: sDef.facing !== undefined ? sDef.facing : 0,
          arc:    sDef.arc    !== undefined ? sDef.arc    : Math.PI,
          health: 100,
          weaponId: sDef.weaponId,
        };
        // Link the matching weapon by id (first unlinked weapon with this id)
        const w = this.weapons.find(w => w.id === slot.weaponId && !w._slot);
        if (w) { w._slot = slot; slot.weapon = w; }
        this.slots.push(slot);
      }
    } else {
      // Auto-slots for ships without defined slot layout (enemies)
      // Center position, unrestricted arc — preserves existing firing behaviour
      for (const w of this.weapons) {
        const slot = {
          id: 'auto_' + w.id,
          label: w.name || w.id,
          pos: { x: 0, y: 0 },
          facing: 0,
          arc: Math.PI,
          health: 100,
          weaponId: w.id,
          weapon: w,
        };
        w._slot = slot;
        this.slots.push(slot);
      }
    }
    // Link module-added weapons to their player-selected turret slots
    this._extraWeaponSlotIds = template.extraWeaponSlotIds || null;
    if (this._extraWeaponSlotIds && this._extraWeaponSlotIds.length > 0) {
      const baseTpl = SHIP_TEMPLATES[template.id];
      const baseCount = baseTpl ? (baseTpl.weapons || []).length : 0;
      this._extraWeaponSlotIds.forEach((slotId, i) => {
        if (!slotId) return;
        const w = this.weapons[baseCount + i];
        const targetSlot = this.slots.find(s => s.id === slotId);
        if (w && targetSlot && !w._slot) { w._slot = targetSlot; }
      });
    }
    this.dotEffects = [];   // [{dmg, timer, tickTimer}]
    this.drones = [];

    // 3D position
    this.depth = 0;               // 0 = surface, WORLD_DEPTH = seafloor
    this.targetDepth = 0;
    this.depthRate = template.depthRate || 50;

    // Electronic warfare
    this.ewStrength    = template.ewStrength    || 0;
    this.ewDefense     = template.ewDefense     || 0;
    this.detectRange   = template.detectRange   || 400;
    this.stealthRating = template.stealthRating || 0;
    this.ewJammedTimer    = 0;
    this.ewJammedStrength = 0;

    // Visual / state
    this.isDestroyed  = false;
    this.isCrippled   = false;
    this.destroyTimer = 0;
    this.deathType    = 'sink';   // 'sink' | 'explode' | 'detonate'
    this.hitFlashTimer = 0;
    this.shape = template.shape || template.id;

    // Radar detection (enemies only): 0=unknown, 1=contact, 2=identified
    this.detectionLevel = isPlayer ? 2 : 0;
    this.sonarPingTimer = Math.random() * SONAR_PING_INTERVAL; // stagger pings

    // Campaign persistence
    this.xp = 0;
    this.level = 1;
    this.upgrades = [];

    // AI (set by CombatEngine for enemies)
    this.aiType = template.ai || null;
    this.aiTimer = 0;
    this.aiState = 'seek';

    // Damage systems (fire, flooding, repair crews)
    this.fires = [];              // [{severity:1-3, timer}]
    this.flooding = 0;            // 0-1 normalized flood level
    this.floodRate = 0;           // flood increase per second
    this.hullBreaches = 0;        // active breach count
    this.repairCrews = template.repairCrews || 2;
    this.crewBusy = [];           // [{task, timer}]
    this.isOnFire = false;        // quick flag for renderer
    this._floodSpeedPenalty = 0;  // speed multiplier reduction
    this._engineStallTimer = 0;   // seconds of engine stall remaining
    // Buoyancy damage: ship loses depth control and drifts
    this._buoyancyDamaged = false;
    this._buoyancyDriftRate = 0;  // depth units/s drift (+ = sinking, - = rising)

    // Sonar detection tracking (enemies only, but stored on all ships for simplicity)
    this._detGrace = 0;           // seconds before detection can degrade
    this._lastKnownX = null;      // last detected world position
    this._lastKnownY = null;
    this._lastKnownDepth = 0;
    this._lastKnownTimer = 0;     // countdown for ghost marker visibility
    this._activeSonarExposed = 0; // seconds this ship is more detectable after active ping

    // Active sonar (player ships)
    this.activeSonarCooldown = 0; // time until next active ping is available

    // Per-ship contact tracking
    this._contacts = {};          // id → {rx,ry,accuracy,via,pingCount,timer,shipRef}
    this.commsEnabled = true;
    this._commsPartners = [];     // set each frame by CombatEngine

    // Subsystem health (0-100 each). Damage applies gameplay penalties.
    this._subsystems = {
      engines:   100,   // <60%: speed penalty; 0%: immobilized
      sensors:   100,   // <60%: reduced detection range + sonar range
      shields:   100,   // <40%: shield recharge offline
      weapons:   100,   // <60%: all weapons on forced 2× cooldown
      targeting: 100,   // <60%: degraded lead; <25%: no lead (fires at current pos)
    };
    // What subsystem this ship is trying to damage on its attack target.
    // null = normal hull targeting; 'engines'|'sensors'|'shields'|'weapons'|'targeting' = aimed hit
    this.targetSubsystem = null;

    // Evasive maneuvering
    this._evadeMode  = false;
    this._jinkTimer  = 0;
    this._jinkDir    = 1;
  }

  setDepthTarget(d) {
    this.targetDepth = Math.max(0, Math.min(WORLD_DEPTH, d));
  }

  // Convert a slot's ship-local position to world 2D coordinates.
  // Local axes: +y = forward (bow), +x = starboard.
  _slotWorldPos(slot) {
    const ca = Math.cos(this.angle), sa = Math.sin(this.angle);
    return [
      this.x + slot.pos.x * ca + slot.pos.y * sa,
      this.y + slot.pos.x * sa - slot.pos.y * ca,
    ];
  }

  // targetSys: null = normal hull hit; 'engines'|'sensors'|'shields'|'weapons' = aimed subsystem hit
  // Subsystem-targeted shots deal 40% hull damage but deal direct subsystem damage.
  takeDamage(rawDmg, sdmg = 1.0, hdmg = 1.0, isDot = false, targetSys = null) {
    if (this.isDestroyed) return 0;
    let remaining = rawDmg;

    // Hull damage with armor reduction
    const hullDmg = Math.max(1, remaining * hdmg - this.armor);
    this.hull -= hullDmg;
    if (!isDot) this.hitFlashTimer = 0.1;
    // Any meaningful hit can start fires and cause hull breaches / flooding
    if (!isDot && hullDmg > this.maxHull * 0.04) {
      const severity = Math.ceil(hullDmg / (this.maxHull * 0.04));
      if (Math.random() < Math.min(0.70, severity * 0.28)) this.startFire(severity);
      if (Math.random() < Math.min(0.55, severity * 0.20)) this.addBreach();
    }
    // Critical system damage on heavy single hits (>10% max hull)
    if (!isDot && hullDmg > this.maxHull * 0.10) {
      // Weapon system damage: random weapon disabled
      if (Math.random() < 0.45 && this.weapons.length > 0) {
        const w = this.weapons[Math.floor(Math.random() * this.weapons.length)];
        w.timer = Math.max(w.timer, 5.0 + Math.random() * 6);
        w._critDisabled = true;
      }
      // Engine stall: loss of propulsion
      if (Math.random() < 0.38) {
        this._engineStallTimer = Math.max(this._engineStallTimer, 2.5 + Math.random() * 3.0);
        this.speed *= 0.10;
      }
      // Buoyancy damage: loss of depth control
      if (Math.random() < 0.30 && !this._buoyancyDamaged) {
        this._buoyancyDamaged = true;
        // Drift toward surface or seafloor randomly, faster on deeper hits
        this._buoyancyDriftRate = (Math.random() < 0.5 ? 1 : -1) * (20 + Math.random() * 40);
      }
      // Turret damage: 20% chance to damage a random armed slot
      if (this.slots && this.slots.length > 0 && Math.random() < 0.20) {
        const armedSlots = this.slots.filter(s => s.health > 0);
        if (armedSlots.length > 0) {
          const s = armedSlots[Math.floor(Math.random() * armedSlots.length)];
          s.health = Math.max(0, s.health - (25 + Math.random() * 25));
        }
      }
    }
    // Catastrophic hits (>20% max hull) — near-certain secondary cascade
    if (!isDot && hullDmg > this.maxHull * 0.20) {
      // Force engine stall
      this._engineStallTimer = Math.max(this._engineStallTimer, 4.0 + Math.random() * 4.0);
      this.speed *= 0.05;
      // Buoyancy loss almost guaranteed
      if (Math.random() < 0.75) {
        this._buoyancyDamaged = true;
        this._buoyancyDriftRate = (Math.random() < 0.5 ? 1 : -1) * (40 + Math.random() * 60);
      }
      // Subsystem cascade: damage a random subsystem heavily
      if (this._subsystems) {
        const sysKeys = Object.keys(this._subsystems);
        const rk = sysKeys[Math.floor(Math.random() * sysKeys.length)];
        this._subsystems[rk] = Math.max(0, this._subsystems[rk] - (25 + Math.random() * 35));
      }
    }

    // Subsystem-aimed hit: deal targeted subsystem damage
    if (!isDot && targetSys && this._subsystems && this._subsystems[targetSys] !== undefined) {
      const sysDmg = Math.min(this._subsystems[targetSys], rawDmg * 0.5 + 8);
      this._subsystems[targetSys] = Math.max(0, this._subsystems[targetSys] - sysDmg);
    } else if (!isDot && !targetSys) {
      // Random collateral subsystem damage on heavy hits (1-in-6 chance per heavy hit)
      if (hullDmg > this.maxHull * 0.08 && Math.random() < 0.17) {
        const sysKeys = Object.keys(this._subsystems || {});
        if (sysKeys.length > 0) {
          const rk = sysKeys[Math.floor(Math.random() * sysKeys.length)];
          this._subsystems[rk] = Math.max(0, this._subsystems[rk] - (5 + Math.random() * 12));
        }
      }
    }

    // Cripple threshold: hull drops to ≤20% — disabled but alive
    if (!this.isCrippled && this.hull > 0 && this.hull <= this.maxHull * 0.20) {
      this.isCrippled = true;
      this.hitFlashTimer = 0.4;
    }

    if (this.hull <= 0) {
      this.hull = 0;
      // Determine death type
      const hasTorpAmmo = this.weapons.some(w => w.type === 'torpedo' && w.ammo > 0);
      if (hasTorpAmmo && Math.random() < 0.72) {
        this.deathType = 'detonate';
        this.destroyTimer = 3.5;
      } else if (!isDot && hullDmg > this.maxHull * 0.30) {
        this.deathType = 'explode';
        this.destroyTimer = 2.5;
      } else {
        this.deathType = 'sink';
        this.destroyTimer = 5.0;
      }
      this.isDestroyed = true;
    }
    return rawDmg;
  }

  setMoveTarget(x, y) {
    this.moveTargetX = x;
    this.moveTargetY = y;
    this.atTarget = false;
  }

  update(dt, terrain) {
    if (this.isDestroyed) {
      this.destroyTimer -= dt;
      return;
    }

    // ── Subsystem damage effects ──────────────────────────────────
    if (this._subsystems) {
      const sys = this._subsystems;
      // Engines: speed penalty scales from 0% at 100 health to 65% at 0 health
      this._sysSpeedMult = sys.engines < 100 ? Math.max(0.35, sys.engines / 100) : 1.0;
      // Sensors: detection range penalty
      this._sysSensorMult = sys.sensors < 100 ? Math.max(0.35, sys.sensors / 100) : 1.0;
      // Weapons: forced 2× cooldown if weapons system < 60
      this._sysWeaponPenalty = sys.weapons < 60;

      // Slow subsystem self-repair (2 hp/s per system — minimal, like nanites)
      for (const k of Object.keys(sys)) {
        if (sys[k] < 100) sys[k] = Math.min(100, sys[k] + 1.5 * dt);
      }
    }

    // Slot passive self-repair (5 hp/s if health > 0; destroyed slots need DC crew)
    if (this.slots) {
      for (const slot of this.slots) {
        if (slot.health > 0 && slot.health < 100) {
          slot.health = Math.min(100, slot.health + 5 * dt);
        }
      }
    }

    // Hull regen (from repair nanites module)
    if (this.hullRegen && this.hullRegen > 0) {
      this.hull = Math.min(this.hull + this.hullRegen * dt, this.maxHull);
    }

    // Hit flash
    if (this.hitFlashTimer > 0) this.hitFlashTimer -= dt;

    // EW jamming decay
    if (this.ewJammedTimer > 0) this.ewJammedTimer -= dt;

    // Depth movement (ascent/descent)
    if (this._buoyancyDamaged) {
      // Uncontrolled depth drift — overrides normal depth control
      this.depth += this._buoyancyDriftRate * dt;
      this.depth = Math.max(0, Math.min(WORLD_DEPTH, this.depth));
      // Hitting the surface or floor stops the drift but damage persists
      if (this.depth <= 0 || this.depth >= WORLD_DEPTH) {
        this._buoyancyDriftRate = 0;
      }
    } else if (Math.abs(this.targetDepth - this.depth) > 0.5) {
      const diff = this.targetDepth - this.depth;
      this.depth += Math.sign(diff) * Math.min(Math.abs(diff), this.depthRate * dt);
      this.depth = Math.max(0, Math.min(WORLD_DEPTH, this.depth));
    }

    // DOT effects
    for (let i = this.dotEffects.length - 1; i >= 0; i--) {
      const dot = this.dotEffects[i];
      dot.timer -= dt;
      dot.tickTimer -= dt;
      if (dot.tickTimer <= 0) {
        this.takeDamage(dot.dmg, 0, 1, true);
        dot.tickTimer = dot.tick;
      }
      if (dot.timer <= 0) this.dotEffects.splice(i, 1);
    }

    // Damage control (fire, flooding, repair crews)
    this._updateDamageControl(dt);
    if (this.isDestroyed) return;  // may have just died from secondary damage

    // Engine stall timer
    if (this._engineStallTimer > 0) this._engineStallTimer -= dt;

    // ── Crippled state: limp away, no weapons ─────────────────────
    if (this.isCrippled) {
      // Exit crippled when repaired above 30%
      if (this.hull > this.maxHull * 0.30) {
        this.isCrippled = false;
      } else {
        // Auto-retreat: keep moving away from last known threat
        if (!this._crippledRetreatSet) {
          this._crippledRetreatSet = true;
          const ang = this.angle + Math.PI + (Math.random() - 0.5) * 1.2;
          this.moveTargetX = this.x + Math.sin(ang) * 3000;
          this.moveTargetY = this.y - Math.cos(ang) * 3000;
          this.atTarget = false;
          // Crew focuses on hull repair
          this._dcPriority = 'hull';
        }
        // Speed capped at 22% while crippled
        if (this.speed > this.maxSpeed * 0.22) this.speed = this.maxSpeed * 0.22;
      }
    } else {
      this._crippledRetreatSet = false;
    }

    // Exposure timer and sonar cooldown are now managed by CombatEngine._updateDetection

    // Formation following: follower tracks leader position + stored offset
    if (this._formationLeader) {
      if (this._formationLeader.isDestroyed || this._formationLeader.atTarget) {
        this._formationLeader = null;
        this._formationMaxSpeed = null;
      } else {
        this.moveTargetX = this._formationLeader.x + (this._formationOffX || 0);
        this.moveTargetY = this._formationLeader.y + (this._formationOffY || 0);
        this.atTarget = false;
      }
    }

    // Movement
    if (this.moveTargetX !== null && !this.atTarget) {
      const dx = this.moveTargetX - this.x;
      const dy = this.moveTargetY - this.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 20) {
        this.atTarget = true;
        this._formationMaxSpeed = null;
        this.speed = Math.max(0, this.speed - this.accel * dt * 2);
      } else {
        const targetAngle = Math.atan2(dx, -dy);
        let diff = normalizeAngle(targetAngle - this.angle);
        const turn = this.turnRate * dt;
        this.angle += Math.sign(diff) * Math.min(Math.abs(diff), turn);
        // Slow down if turning a lot
        const speedFactor = Math.max(0.3, 1 - Math.abs(diff) / Math.PI);
        const effectiveMaxSpeed = this._engineStallTimer > 0
          ? this.maxSpeed * 0.08
          : Math.min(this._formationMaxSpeed || this.maxSpeed, this.maxSpeed) *
            (1 - (this._floodSpeedPenalty || 0)) * (this._sysSpeedMult || 1.0);
        const targetSpeed = effectiveMaxSpeed * speedFactor;
        if (this.speed < targetSpeed) {
          this.speed = Math.min(this.speed + this.accel * dt, targetSpeed);
        } else {
          this.speed = Math.max(this.speed - this.accel * dt * 0.5, targetSpeed);
        }
      }
    } else if (this.atTarget) {
      this.speed = Math.max(0, this.speed - this.accel * dt * 1.5);
    }

    // Apply movement
    this.x += Math.sin(this.angle) * this.speed * dt;
    this.y -= Math.cos(this.angle) * this.speed * dt;

    // Evasive maneuvering: lateral jink perpendicular to heading
    if (this._evadeMode && !this.atTarget && this.speed > 5) {
      this._jinkTimer -= dt;
      if (this._jinkTimer <= 0) {
        this._jinkTimer = 1.1 + Math.random() * 1.9;
        this._jinkDir   = Math.random() < 0.5 ? 1 : -1;
      }
      const perpAngle = this.angle + Math.PI / 2;
      const jinkSpd   = this.speed * 0.40;
      this.x += Math.sin(perpAngle) * this._jinkDir * jinkSpd * dt;
      this.y -= Math.cos(perpAngle) * this._jinkDir * jinkSpd * dt;
    }

    // Terrain: kelp slows, vent damages
    if (terrain) {
      for (const t of terrain) {
        const d2 = dist(this.x, this.y, t.x, t.y);
        if (d2 < t.radius + this.size) {
          if (t.type === 'island') {
            // Push out of island
            const pushAng = angleToward(t.x, t.y, this.x, this.y);
            const push = (t.radius + this.size - d2) + 1;
            this.x += Math.sin(pushAng) * push;
            this.y -= Math.cos(pushAng) * push;
            this.speed *= 0.7;
          } else if (t.type === 'kelp') {
            this.speed *= (1 - 0.4 * dt);
          } else if (t.type === 'vent') {
            this.takeDamage(t.damageRate * dt, 0.5, 0.5, true);
          }
        }
      }
    }

    // Weapon cooldowns
    for (const w of this.weapons) {
      if (w.type === 'beam') {
        if (w.beamActive) {
          w.beamTimer -= dt;
          if (w.beamTimer <= 0) {
            w.beamActive = false;
            w.recharging = true;
            w.timer = w.rechargeDur;
          }
        } else if (w.recharging) {
          w.timer -= dt;
          if (w.timer <= 0) { w.recharging = false; }
        }
      } else {
        if (w.timer > 0) w.timer -= dt;
      }
    }
  }

  canFireWeapon(w, target) {
    if (!target || target.isDestroyed) return false;
    if (w.type === 'ew') return false; // EW is continuous, not fired
    // Depth gap check: can't fire across more than 450 units of depth
    if (Math.abs(this.depth - (target.depth || 0)) > 450) return false;
    // Torpedo ammo
    if (w.type === 'torpedo' && w.ammo !== undefined && w.ammo !== Infinity && w.ammo <= 0) return false;
    const d = dist(this.x, this.y, target.x, target.y);
    // EW jamming reduces effective range
    const jam = (this.ewJammedTimer > 0) ? (this.ewJammedStrength / 100) : 0;
    const effectiveRange = w.range * Math.max(0.4, 1 - jam * 0.5);
    if (d > effectiveRange) return false;
    // Island line-of-sight block (not for torpedoes which can go around)
    if (w.type !== 'torpedo' && this._terrain) {
      for (const t of this._terrain) {
        if (t.type === 'island' &&
            lineIntersectsCircle(this.x, this.y, target.x, target.y, t.x, t.y, t.radius * 0.8))
          return false;
      }
    }
    // Destroyed turret: cannot fire
    if (w._slot && w._slot.health <= 0) return false;
    // Firing arc: use slot facing+arc when available, else weapon-level arc vs ship heading
    const _slotFacing = w._slot ? this.angle + w._slot.facing : this.angle;
    const _slotArc    = w._slot ? w._slot.arc : w.arc;
    if (_slotArc !== undefined) {
      const toTarget = angleToward(this.x, this.y, target.x, target.y);
      if (Math.abs(normalizeAngle(toTarget - _slotFacing)) > _slotArc) return false;
    }
    if (w.type === 'beam') return !w.beamActive && !w.recharging;
    if (w.type === 'melee' || w.type === 'aoe') return w.timer <= 0;
    // Weapons subsystem damage: forced 2× cooldown check
    if (this._sysWeaponPenalty && w.timer > w.cd * 0.5) return false;
    return w.timer <= 0;
  }

  startFire(severity) {
    if (this.isDestroyed || this.fires.length >= 3) return;
    this.fires.push({ severity: Math.min(3, severity || 1), timer: 16 + Math.random() * 14 });
  }

  addBreach() {
    if (this.isDestroyed || this.hullBreaches >= 5) return;
    this.hullBreaches++;
    this.floodRate = this.hullBreaches * 0.022;
  }

  _updateDamageControl(dt) {
    // ── Fire damage ───────────────────────────────────────────────
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const fire = this.fires[i];
      fire.timer -= dt;
      // Fire deals direct hull damage (bypasses shields and armor)
      this.hull = Math.max(0, this.hull - fire.severity * 2.0 * dt);
      if (fire.timer <= 0) this.fires.splice(i, 1);
    }
    this.isOnFire = this.fires.length > 0;

    // ── Flooding ──────────────────────────────────────────────────
    if (this.hullBreaches > 0) {
      this.flooding = Math.min(1, this.flooding + this.floodRate * dt);
    }
    if (this.flooding > 0) {
      // Heavy flooding deals increasing hull damage
      const floodDmg = Math.max(0, this.flooding - 0.25) * 5.0 * dt;
      this.hull = Math.max(0, this.hull - floodDmg);
      // Speed penalty from drag/ballast (up to 55% at max flood)
      this._floodSpeedPenalty = this.flooding * 0.55;
    } else {
      this._floodSpeedPenalty = 0;
    }

    // ── Cripple from secondary damage ─────────────────────────────
    if (!this.isCrippled && this.hull > 0 && this.hull <= this.maxHull * 0.20) {
      this.isCrippled = true;
    }

    // ── Death from secondary damage ────────────────────────────────
    if (this.hull <= 0 && !this.isDestroyed) {
      this.hull = 0;
      const hasTorpAmmo = this.weapons.some(w => w.type === 'torpedo' && w.ammo > 0);
      if (hasTorpAmmo && Math.random() < 0.72) {
        this.deathType = 'detonate'; this.destroyTimer = 3.5;
      } else {
        this.deathType = 'sink'; this.destroyTimer = 5.0;
      }
      this.isDestroyed = true;
    }

    // ── Repair crew task completion ───────────────────────────────
    for (let i = this.crewBusy.length - 1; i >= 0; i--) {
      this.crewBusy[i].timer -= dt;
      if (this.crewBusy[i].timer <= 0) {
        const task = this.crewBusy[i].task;
        if (task === 'fire' && this.fires.length > 0) {
          // Extinguish least-severe fire first
          let minIdx = 0;
          for (let j = 1; j < this.fires.length; j++) {
            if (this.fires[j].severity < this.fires[minIdx].severity) minIdx = j;
          }
          this.fires.splice(minIdx, 1);
        } else if (task === 'breach' && this.hullBreaches > 0) {
          this.hullBreaches = Math.max(0, this.hullBreaches - 1);
          this.floodRate = this.hullBreaches * 0.022;
        } else if (task === 'pump') {
          this.flooding = Math.max(0, this.flooding - 0.38);
        } else if (task === 'buoyancy' && this._buoyancyDamaged) {
          // Crew restores depth control
          this._buoyancyDamaged = false;
          this._buoyancyDriftRate = 0;
        } else if (task === 'turret' && this.slots) {
          // Crew brings a destroyed turret back online (to 30 hp; passive repair takes over)
          const destroyed = this.slots.filter(s => s.health === 0);
          if (destroyed.length > 0) destroyed[0].health = 30;
        } else if (task === 'hull') {
          this.hull = Math.min(this.maxHull, this.hull + this.maxHull * 0.06);
        }
        this.crewBusy.splice(i, 1);
      }
    }

    // ── Assign idle crews to priority tasks ───────────────────────
    // Respect manual DC priority setting
    const prio = this._dcPriority || 'fire';
    const freeCrew = this.repairCrews - this.crewBusy.length;
    for (let c = 0; c < freeCrew; c++) {
      // Build ordered task list based on priority
      const taskOrder = prio === 'flood'
        ? ['flood', 'buoyancy', 'turret', 'fire', 'hull']
        : prio === 'hull'
        ? ['hull', 'fire', 'buoyancy', 'turret', 'flood']
        : ['fire', 'buoyancy', 'turret', 'flood', 'hull'];
      let assigned = false;
      for (const t of taskOrder) {
        if (t === 'fire' && this.fires.length > 0) {
          this.crewBusy.push({ task: 'fire', timer: 4.5 + Math.random() * 3 });
          assigned = true; break;
        } else if (t === 'buoyancy' && this._buoyancyDamaged) {
          this.crewBusy.push({ task: 'buoyancy', timer: 10 + Math.random() * 6 });
          assigned = true; break;
        } else if (t === 'turret' && this.slots && this.slots.some(s => s.health === 0)) {
          this.crewBusy.push({ task: 'turret', timer: 12 + Math.random() * 6 });
          assigned = true; break;
        } else if (t === 'flood' && this.hullBreaches > 0) {
          this.crewBusy.push({ task: 'breach', timer: 8 + Math.random() * 4 });
          assigned = true; break;
        } else if (t === 'flood' && this.flooding > 0.08) {
          this.crewBusy.push({ task: 'pump', timer: 4 + Math.random() * 2 });
          assigned = true; break;
        } else if (t === 'hull' && this.hull < this.maxHull * 0.72 && !this.hullRegen) {
          this.crewBusy.push({ task: 'hull', timer: 15 + Math.random() * 8 });
          assigned = true; break;
        }
      }
      if (!assigned) break;
    }
  }

  getSaveData() {
    return {
      templateId: this.templateId,
      name: this.name,
      isFlagship: this.isFlagship,
      hull: this.hull,
      maxHull: this.maxHull,
      armor: this.armor,
      maxSpeed: this.maxSpeed,
      upgrades: [...this.upgrades],
      xp: this.xp,
      level: this.level,
      slotHealths: this.slots ? this.slots.map(s => s.health) : undefined,
      extraWeaponSlotIds: this._extraWeaponSlotIds || undefined,
    };
  }

  static fromSaveData(data) {
    const tpl = SHIP_TEMPLATES[data.templateId];
    if (!tpl) return null;
    // Build a merged template that includes module-added weapons
    const mergedTpl = Object.assign({}, tpl);
    const baseWeaponIds = tpl.weapons || [];
    const extraWeaponIds = (data.weaponIds || []).slice(baseWeaponIds.length);
    mergedTpl.weapons = [...baseWeaponIds, ...extraWeaponIds];
    if (data.extraWeaponSlotIds) mergedTpl.extraWeaponSlotIds = data.extraWeaponSlotIds;
    const ship = new Ship(mergedTpl, true, data.name);
    ship.isFlagship  = data.isFlagship || false;
    ship.hull        = data.hull;
    ship.maxHull     = data.maxHull;
    ship.armor       = data.armor;
    ship.maxSpeed    = data.maxSpeed;
    ship.upgrades    = data.upgrades || [];
    ship.modules     = data.modules  || [];
    ship.xp          = data.xp      || 0;
    ship.level       = data.level   || 1;
    // Module-added stats
    if (data.depthRate  !== undefined) ship.depthRate  = data.depthRate;
    if (data.ewStrength !== undefined) ship.ewStrength = data.ewStrength;
    if (data.detectRange!== undefined) ship.detectRange= data.detectRange;
    if (data.stealthRating!==undefined)ship.stealthRating=data.stealthRating;
    if (data.hullRegen  !== undefined) ship.hullRegen  = data.hullRegen;
    if (data.slotHealths && ship.slots) {
      data.slotHealths.forEach((h, i) => { if (ship.slots[i]) ship.slots[i].health = h; });
    }
    return ship;
  }
}

// ── Projectile ────────────────────────────────────────────────────
class Projectile {
  // ox, oy: optional turret world-space origin (defaults to owner center)
  constructor(owner, weapon, tx, ty, target, ox, oy) {
    this.id = uid();
    this.owner = owner;
    this.weapon = weapon;
    this.isPlayer = owner.isPlayer;
    this.x = (ox !== undefined) ? ox : owner.x;
    this.y = (oy !== undefined) ? oy : owner.y;
    this.depth = owner.depth || 0;
    this.target = target; // for homing
    this.exploded = false;
    this.isDestroyed = false;
    this.lifetime = 6;

    const ang = angleToward(this.x, this.y, tx, ty);
    this.vx = Math.sin(ang) * weapon.pSpeed;
    this.vy = -Math.cos(ang) * weapon.pSpeed;
    this.angle = ang;

    this.radius = weapon.pSize || 4;
    this.color = weapon.pColor || weapon.color;
    this.exRadius = weapon.exRadius || 0;
    this.trackRate = weapon.trackRate || 0;
    this.dot = weapon.dot || null;
    this.scatter = weapon.scatter || 0;
    this.targetProjectile = null; // for CIWS shells homing on torpedoes
    this.isCIWS = weapon && weapon.type === 'ciws';
  }

  update(dt, ships) {
    if (this.isDestroyed) return;
    this.lifetime -= dt;
    if (this.lifetime <= 0) { this.isDestroyed = true; return; }

    const spd2d = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    // Homing toward ship target
    if (this.trackRate > 0 && this.target && !this.target.isDestroyed) {
      const targetAng = angleToward(this.x, this.y, this.target.x, this.target.y);
      let diff = normalizeAngle(targetAng - this.angle);
      this.angle += Math.sign(diff) * Math.min(Math.abs(diff), this.trackRate * dt);
      this.vx = Math.sin(this.angle) * spd2d;
      this.vy = -Math.cos(this.angle) * spd2d;
      // Also home toward target's depth so torpedoes track in 3D
      const tDepth = this.target.depth || 0;
      const dDiff = tDepth - this.depth;
      const depthStep = spd2d * 0.35 * dt;
      this.depth += Math.sign(dDiff) * Math.min(Math.abs(dDiff), depthStep);
    }
    // CIWS: home toward a target projectile (torpedo)
    if (this.targetProjectile && !this.targetProjectile.isDestroyed) {
      const targetAng = angleToward(this.x, this.y, this.targetProjectile.x, this.targetProjectile.y);
      let diff = normalizeAngle(targetAng - this.angle);
      this.angle += Math.sign(diff) * Math.min(Math.abs(diff), (this.weapon.trackRate || 3) * dt);
      this.vx = Math.sin(this.angle) * spd2d;
      this.vy = -Math.cos(this.angle) * spd2d;
      // Home toward torpedo depth
      const tpDepth = this.targetProjectile.depth || 0;
      const dpDiff = tpDepth - this.depth;
      this.depth += Math.sign(dpDiff) * Math.min(Math.abs(dpDiff), spd2d * 0.5 * dt);
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}

// ── Drone ─────────────────────────────────────────────────────────
class Drone {
  constructor(owner, x, y) {
    this.id = uid();
    this.owner = owner;
    this.isPlayer = owner.isPlayer;
    this.x = x; this.y = y;
    this.angle = 0;
    this.speed = 0;
    this.maxSpeed = WEAPON_DATA.drone_launcher.droneSpeed;
    this.hull = WEAPON_DATA.drone_launcher.droneHull;
    this.maxHull = this.hull;
    this.size = 8;
    this.color = owner.color;
    this.isDestroyed = false;
    this.attackTarget = null;
    this.fireCd = 0;
    this.fireCdMax = 1.0;
    this.damage = WEAPON_DATA.drone_launcher.droneDmg;
    this.range = 280;
  }

  update(dt, enemies, addProjectile) {
    if (this.isDestroyed) return;

    // Find closest enemy if no target
    if (!this.attackTarget || this.attackTarget.isDestroyed) {
      let closest = null, bestD = Infinity;
      for (const e of enemies) {
        if (e.isDestroyed) continue;
        const d = dist(this.x, this.y, e.x, e.y);
        if (d < bestD) { bestD = d; closest = e; }
      }
      this.attackTarget = closest;
    }

    if (this.attackTarget) {
      const d = dist(this.x, this.y, this.attackTarget.x, this.attackTarget.y);
      const targetAng = angleToward(this.x, this.y, this.attackTarget.x, this.attackTarget.y);
      let diff = normalizeAngle(targetAng - this.angle);
      this.angle += Math.sign(diff) * Math.min(Math.abs(diff), 3.5 * dt);
      const desiredDist = 180;
      if (d > desiredDist + 30) {
        this.speed = Math.min(this.speed + 200 * dt, this.maxSpeed);
      } else if (d < desiredDist - 30) {
        this.speed = Math.max(this.speed - 200 * dt, 0);
      }

      this.fireCd -= dt;
      if (this.fireCd <= 0 && d < this.range) {
        const fakeWeapon = { pSpeed: 500, pSize: 3, pColor: this.color, exRadius: 0, trackRate: 0 };
        const p = new Projectile(this, fakeWeapon, this.attackTarget.x, this.attackTarget.y, null);
        p.owner = this;
        p.weapon = { dmg: this.damage, sdmg: 1.0, hdmg: 1.0, dot: null };
        addProjectile(p);
        this.fireCd = this.fireCdMax;
      }
    }

    this.x += Math.sin(this.angle) * this.speed * dt;
    this.y -= Math.cos(this.angle) * this.speed * dt;
  }
}

// ── Effect ────────────────────────────────────────────────────────
class Effect {
  constructor(type, x, y, opts = {}) {
    this.id = uid();
    this.type = type;
    this.x = x; this.y = y;
    this.radius = opts.radius || 10;
    this.maxRadius = opts.maxRadius || opts.radius || 10;
    this.color = opts.color || '#ff6600';
    this.color2 = opts.color2 || null;
    this.alpha = 1;
    this.duration = opts.duration || 0.6;
    this.timer = 0;
    this.done = false;
    // Beam
    this.x2 = opts.x2;
    this.y2 = opts.y2;
    this.depth = opts.depth || 0;
    this.depth2 = opts.depth2 || opts.depth || 0;
    this.width = opts.width || 2;
    // Particles
    this.particles = opts.particles || null;
  }

  update(dt) {
    this.timer += dt;
    const t = this.timer / this.duration;
    if (t >= 1) { this.done = true; return; }
    if (this.type === 'explosion') {
      this.radius = this.maxRadius * Math.sqrt(t);
      this.alpha = 1 - t;
    } else if (this.type === 'shockwave') {
      this.radius = this.maxRadius * t;
      this.alpha = (1 - t) * 0.7;
    } else if (this.type === 'shield_hit') {
      this.alpha = (1 - t) * 0.9;
    } else if (this.type === 'beam') {
      this.alpha = 1 - t;
    } else {
      this.alpha = 1 - t;
    }
  }
}

// ── Geometry helpers ──────────────────────────────────────────────
// Line-segment vs circle — used for terrain cover / projectile blocking
function lineIntersectsCircle(ax, ay, bx, by, cx, cy, r) {
  const dx = bx - ax, dy = by - ay;
  const fx = ax - cx, fy = ay - cy;
  const a = dx * dx + dy * dy;
  if (a === 0) return dist(ax, ay, cx, cy) < r;
  const b = 2 * (fx * dx + fy * dy);
  const c2 = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c2;
  if (disc < 0) return false;
  const sqrtD = Math.sqrt(disc);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

// ── Group AI coordinator ──────────────────────────────────────────
// Run once per frame before per-ship AI — sets coordinated focus target and group tactic.
// Tactics rotate every 25-45 seconds to keep play feeling fresh.
function updateAIGroup(enemyShips, playerShips, combatTime) {
  const alive = playerShips.filter(s => !s.isDestroyed);
  if (alive.length === 0) { for (const e of enemyShips) e._groupTarget = null; return; }

  // Rotate group tactic on a timer so enemy strategy evolves mid-combat
  if (!updateAIGroup._tacticTimer || updateAIGroup._tacticTimer <= 0) {
    updateAIGroup._tacticTimer = 25 + Math.random() * 20;
    const tactics = ['focus_fire', 'flank', 'subsystem_hunt', 'depth_dive', 'scatter'];
    const prev = updateAIGroup._tactic;
    let next;
    do { next = tactics[Math.floor(Math.random() * tactics.length)]; } while (next === prev);
    updateAIGroup._tactic = next;
    // Apply subsystem targeting tactic to all non-leviathan enemies
    const sysTgt = next === 'subsystem_hunt'
      ? ['engines','sensors','shields','weapons'][Math.floor(Math.random()*4)]
      : null;
    for (const e of enemyShips) {
      if (!e.isDestroyed && e.aiType !== 'leviathan') {
        e.targetSubsystem = sysTgt;
        if (next === 'depth_dive') e.setDepthTarget(300 + Math.random() * 400);
        else if (next === 'scatter') e.setDepthTarget((e._tplPrefDepth || 200) + (Math.random()-0.5)*200);
      }
    }
  } else {
    updateAIGroup._tacticTimer -= (1/60); // approximate; called each frame
  }

  const tactic = updateAIGroup._tactic || 'focus_fire';

  // Find the most wounded player ship for coordinated focus fire
  const mostWounded = alive.reduce((w, s) =>
    (s.hull / s.maxHull) < (w.hull / w.maxHull) ? s : w, alive[0]);
  const woundedPct = mostWounded.hull / mostWounded.maxHull;

  // Tactic-specific focus target
  let focusTarget = null;
  if (tactic === 'focus_fire' && woundedPct < 0.45) {
    focusTarget = mostWounded; // finish off weakened ships
  } else if (tactic === 'flank') {
    // Target the flagship to force player to protect it
    focusTarget = alive.find(s => s.isFlagship) || null;
  } else if (tactic === 'subsystem_hunt' || tactic === 'scatter' || tactic === 'depth_dive') {
    focusTarget = null; // individual targeting
  }

  for (const e of enemyShips) {
    if (e.isDestroyed) continue;
    if (e.aiType !== 'leviathan') e._groupTarget = focusTarget;
    // Store preferred depth from template for tactic use
    const tplD = ENEMY_TEMPLATES[e.templateId];
    if (tplD && !e._tplPrefDepth) e._tplPrefDepth = tplD.preferredDepth || 200;
  }
}

// ── AI ────────────────────────────────────────────────────────────
// State machine AI with flanking, depth tactics, retreat, and focus fire.
function updateAI(ship, playerShips, dt, terrain) {
  ship.aiTimer -= dt;

  const alive = playerShips.filter(s => !s.isDestroyed);
  if (alive.length === 0) return;

  const hullPct    = ship.hull / ship.maxHull;
  const tplData    = ENEMY_TEMPLATES[ship.templateId];
  const prefDepth  = tplData ? (tplData.preferredDepth || 100) : 100;

  // Get max weapon range (ignoring EW)
  const primaryRange = ship.weapons.reduce((best, w) =>
    (w.type !== 'ew' && w.range > best) ? w.range : best, 300);

  // Only target player ships this enemy has detected
  const knownPlayers = alive.filter(ps =>
    ship._contacts && ship._contacts[ps.id] &&
    (ship._contacts[ps.id].accuracy > 0.3 || dist(ship.x, ship.y, ps.x, ps.y) < VISUAL_RANGE * 1.2)
  );
  const targetPool = knownPlayers.length > 0 ? knownPlayers : [];
  if (targetPool.length === 0) {
    // No live contacts — patrol or hunt toward last known position
    ship._patrolTimer = (ship._patrolTimer || 0) - dt;

    // Hunt: if we have any stale shared contact, head toward it
    const staleContacts = Object.values(ship._contacts || {});
    if (staleContacts.length > 0) {
      if (ship._patrolTimer <= 0 || ship.atTarget) {
        // Pick the freshest/most-accurate shared contact and hunt toward it
        const best = staleContacts.reduce((a, b) => (b.accuracy > a.accuracy ? b : a));
        ship.setMoveTarget(
          Math.max(300, Math.min(WORLD_W - 300, best.rx + (Math.random()-0.5)*600)),
          Math.max(300, Math.min(WORLD_H - 300, best.ry + (Math.random()-0.5)*600))
        );
        ship.setDepthTarget(prefDepth + (Math.random()-0.5)*200);
        ship._patrolTimer = 8 + Math.random() * 6;
      }
      return;
    }

    // No contacts at all — random patrol across the whole map
    if (ship._patrolTimer <= 0 || ship.atTarget) {
      ship.setMoveTarget(
        300 + Math.random() * (WORLD_W - 600),
        300 + Math.random() * (WORLD_H - 600)
      );
      ship.setDepthTarget(prefDepth + (Math.random()-0.5)*300);
      ship._patrolTimer = 12 + Math.random() * 10;
    }
    return;
  }

  // Retarget: use group focus target if set, otherwise score individually
  if (!ship.attackTarget || ship.attackTarget.isDestroyed || ship.aiTimer <= 0) {
    if (ship._groupTarget && !ship._groupTarget.isDestroyed && targetPool.includes(ship._groupTarget)) {
      ship.attackTarget = ship._groupTarget;
    } else {
      let best = null, bestScore = -Infinity;
      for (const ps of targetPool) {
        const distScore  = -dist(ship.x, ship.y, ps.x, ps.y) * 0.002;
        const weakScore  = (1 - ps.hull / ps.maxHull) * 180;
        const depthScore = -Math.abs(ship.depth - ps.depth) * 0.4;
        const s = distScore + weakScore + depthScore;
        if (s > bestScore) { bestScore = s; best = ps; }
      }
      ship.attackTarget = best;
    }
  }

  const target = ship.attackTarget;
  if (!target) return;
  const d = dist(ship.x, ship.y, target.x, target.y);
  const depthGap = Math.abs(ship.depth - target.depth);

  // Helper: clamp move to world bounds
  const clampedMove = (tx, ty) => {
    ship.setMoveTarget(
      Math.max(300, Math.min(WORLD_W - 300, tx)),
      Math.max(300, Math.min(WORLD_H - 300, ty))
    );
  };

  // Retreat trigger: once badly damaged, permanently flee (creates chase gameplay)
  if (hullPct < 0.28 && ship.aiState !== 'retreat') {
    ship.aiState = 'retreat';
    ship.aiTimer = 0;
  }

  switch (ship.aiType) {

    // ── SWARM (Keth'vari fast scouts) ────────────────────────────
    case 'swarm': {
      if (ship.aiState === 'retreat') {
        // Wounded swarmers scatter deep and zigzag to survive
        const ang = angleToward(target.x, target.y, ship.x, ship.y);
        const juke = Math.sin(Date.now() * 0.002 + ship.id) * 0.8;
        clampedMove(ship.x + Math.sin(ang + juke)*700, ship.y - Math.cos(ang + juke)*700);
        ship.setDepthTarget(prefDepth + 375 + Math.random() * 250);
        break;
      }
      if (ship.aiState === 'dive') {
        // Deep approach: descend and rush from below
        ship.setDepthTarget(prefDepth + 300 + Math.random() * 200);
        clampedMove(target.x + (Math.random()-0.5)*200, target.y + (Math.random()-0.5)*200);
        if (ship.aiTimer <= 0) { ship.aiState = 'seek'; ship.setDepthTarget(prefDepth); }
        break;
      }
      // Seek: flanking swarm approach from random arcs
      if (ship.aiTimer <= 0) {
        if (Math.random() < 0.25) {
          // Occasionally dive-bomb
          ship.aiState = 'dive';
          ship.aiTimer = 2.5 + Math.random();
        } else {
          // Flank from a random arc
          const baseAng = angleToward(ship.x, ship.y, target.x, target.y);
          const flankAng = baseAng + (Math.random() - 0.5) * 1.4;
          clampedMove(
            target.x - Math.sin(flankAng) * primaryRange * 0.6,
            target.y + Math.cos(flankAng) * primaryRange * 0.6
          );
          ship.aiTimer = 0.8 + Math.random() * 0.8;
          ship.setDepthTarget(prefDepth + (Math.random()-0.5) * 200);
        }
      }
      break;
    }

    // ── AGGRESSIVE (Keth hunters / Shard slicers) ────────────────
    case 'aggressive': {
      if (ship.aiState === 'retreat') {
        // Damaged aggressor backs off while still firing
        const ang = angleToward(target.x, target.y, ship.x, ship.y);
        clampedMove(ship.x + Math.sin(ang)*800, ship.y - Math.cos(ang)*800);
        ship.setDepthTarget(Math.min(WORLD_DEPTH - 30, prefDepth + 450));
        break;
      }
      if (ship.aiTimer <= 0) {
        // Use island terrain as cover when hull is low
        let usedCover = false;
        if (hullPct < 0.45 && terrain && terrain.length > 0) {
          const cover = terrain.find(t => t.type === 'island' && dist(ship.x, ship.y, t.x, t.y) < 1400);
          if (cover) {
            // Move to position behind island relative to the target
            const coverAng = angleToward(target.x, target.y, cover.x, cover.y);
            clampedMove(
              cover.x + Math.sin(coverAng) * (cover.radius + ship.size + 125),
              cover.y - Math.cos(coverAng) * (cover.radius + ship.size + 125)
            );
            ship.setDepthTarget(prefDepth + 150 + Math.random() * 200);
            ship.aiTimer = 2.8 + Math.random();
            usedCover = true;
          }
        }
        if (!usedCover) {
          if (d > primaryRange * 0.9) {
            // Angled approach — never charge straight on
            const baseAng = angleToward(ship.x, ship.y, target.x, target.y);
            const offset = (Math.random() - 0.5) * 0.9;
            clampedMove(
              target.x - Math.sin(baseAng + offset) * primaryRange * 0.62,
              target.y + Math.cos(baseAng + offset) * primaryRange * 0.62
            );
            ship.aiState = 'approach';
            ship.aiTimer = 1.4 + Math.random();
          } else if (d < primaryRange * 0.32) {
            // Back off while firing — don't let player get close
            const ang = angleToward(target.x, target.y, ship.x, ship.y);
            const perp = ang + Math.PI/2 * (Math.random() > 0.5 ? 1 : -1);
            clampedMove(
              ship.x + Math.sin(ang)*500 + Math.sin(perp)*175,
              ship.y - Math.cos(ang)*500 - Math.cos(perp)*175
            );
            ship.aiTimer = 1.8 + Math.random();
          } else {
            // Strafe at optimal range — orbit direction reverses unpredictably
            const orbitDir = (Math.floor(ship.aiTimer * 10) % 2 === 0) ? 1 : -1;
            const perpAng = angleToward(ship.x, ship.y, target.x, target.y) + Math.PI/2 * orbitDir;
            clampedMove(
              ship.x + Math.sin(perpAng) * 350,
              ship.y - Math.cos(perpAng) * 350
            );
            ship.aiTimer = 1.0 + Math.random() * 0.8;
          }
          // Dive when hull is low to break line of sight
          if (hullPct < 0.35) {
            ship.setDepthTarget(prefDepth + 300 + Math.random() * 200);
          } else {
            ship.setDepthTarget(prefDepth + (Math.random()-0.5) * 150);
          }
        }
      }
      break;
    }

    // ── DEFENSIVE (Shard Fortress / Behemoth) ────────────────────
    case 'defensive': {
      if (ship.aiState === 'retreat') {
        // Fortress pulls back to max range and continues to fire
        const ang = angleToward(target.x, target.y, ship.x, ship.y);
        clampedMove(ship.x + Math.sin(ang)*875, ship.y - Math.cos(ang)*875);
        ship.setDepthTarget(Math.min(WORLD_DEPTH - 30, prefDepth + 300));
        break;
      }
      if (ship.aiTimer <= 0) {
        if (d > primaryRange * 1.2) {
          // Slowly advance — lure player to charge
          clampedMove(
            target.x + (Math.random()-0.5)*300,
            target.y + (Math.random()-0.5)*300
          );
          ship.aiTimer = 3.5 + Math.random() * 2.0;
        } else if (d < primaryRange * 0.48) {
          // Push them back
          const ang = angleToward(target.x, target.y, ship.x, ship.y);
          clampedMove(ship.x + Math.sin(ang)*500, ship.y - Math.cos(ang)*500);
          ship.aiTimer = 2.0 + Math.random();
        } else {
          // Hold and rotate — punishing fire arc
          const side = Math.sin(Date.now() * 0.0003 + ship.id) > 0 ? 1 : -1;
          const perpAng = angleToward(ship.x, ship.y, target.x, target.y) + Math.PI/2 * side;
          clampedMove(
            ship.x + Math.sin(perpAng) * 200,
            ship.y - Math.cos(perpAng) * 200
          );
          ship.aiTimer = 4.0 + Math.random() * 2.0;
        }
        ship.setDepthTarget(prefDepth + (Math.random()-0.5) * 100);
      }
      break;
    }

    // ── LEVIATHAN (ancient predator) ─────────────────────────────
    case 'leviathan': {
      if (ship.aiState === 'retreat') {
        // Wounded leviathans dive to the abyss and circle — they never truly flee
        ship.setDepthTarget(WORLD_DEPTH * 0.85);
        const circleAng = angleToward(ship.x, ship.y, target.x, target.y) + Math.PI * 0.6;
        clampedMove(ship.x + Math.sin(circleAng)*875, ship.y - Math.cos(circleAng)*875);
        break;
      }
      // Always prioritise flagship
      const flagship = alive.find(s => s.isFlagship);
      if (flagship) ship.attackTarget = flagship;

      if (ship.aiTimer <= 0) {
        if (d > primaryRange * 1.4) {
          // Dive and close from depth — ambush run
          ship.setDepthTarget(WORLD_DEPTH * 0.65 + Math.random() * 60);
          clampedMove(target.x + (Math.random()-0.5)*250, target.y + (Math.random()-0.5)*250);
          ship.aiTimer = 3.0 + Math.random() * 1.5;
        } else if (depthGap > 400) {
          // Surface to match target depth — the "rise from below" moment
          ship.setDepthTarget(target.depth + 50 + Math.random() * 100);
          ship.aiTimer = 2.0;
        } else {
          // Slow powerful arc — circle around at attack range
          const baseAng = angleToward(ship.x, ship.y, target.x, target.y);
          const orbitAng = baseAng + Math.PI/3;
          clampedMove(
            target.x - Math.sin(orbitAng) * primaryRange * 0.8,
            target.y + Math.cos(orbitAng) * primaryRange * 0.8
          );
          ship.aiTimer = 3.5 + Math.random() * 2.0;
        }
      }
      break;
    }
  }
}

// ── CombatEngine ──────────────────────────────────────────────────
class CombatEngine {
  constructor(playerShipData, enemyTemplateIds, sectorIndex, encounterType) {
    this.playerShips = [];
    this.enemyShips = [];
    this.projectiles = [];
    this.drones = [];
    this.effects = [];
    this.terrain = [];
    this.paused = false;
    this.time = 0;
    this.complete = false;
    this.result = null; // 'win' | 'loss'
    this.stats = { damageDone: 0, damageTaken: 0, shipsLost: 0, enemiesDestroyed: 0, creditsEarned: 0, xpEarned: 0 };
    this.selectedShip = null;
    this.selectedShips = [];
    this.moveMarker = null;   // {x, y, timer}

    // Pick a biome for this combat (drives terrain + render mood)
    const biomes = ['abyssal', 'vent_field', 'kelp_forest', 'seamount', 'wreck_field', 'crystal_caves'];
    this.biome = biomes[(sectorIndex || 0) + Math.floor(Math.random() * biomes.length)] || biomes[Math.floor(Math.random() * biomes.length)];
    this.biome = biomes[Math.floor(Math.random() * biomes.length)];  // fully random for now

    // Spawn terrain
    this._generateTerrain();

    // Spawn player ships — start submerged below the surface
    const playerStartX = 750, playerStartY = WORLD_H / 2;
    playerShipData.forEach((sd, i) => {
      const ship = Ship.fromSaveData(sd);
      if (!ship) return;
      ship.x = playerStartX + (Math.random() - 0.5) * 450;
      ship.y = playerStartY + (i - playerShipData.length / 2) * 300;
      ship.angle = Math.PI / 2; // face right toward enemies
      ship.depth = 120 + Math.random() * 80;
      ship.targetDepth = ship.depth;
      ship.moveTargetX = ship.x;
      ship.moveTargetY = ship.y;
      ship.atTarget = true;
      this.playerShips.push(ship);
    });

    // Spawn enemies
    const scale = CAMPAIGN_CONFIG.difficulty[sectorIndex] || 1.0;
    const enemyStartX = WORLD_W - 750, enemyStartY = WORLD_H / 2;
    enemyTemplateIds.forEach((tid, i) => {
      const tpl = ENEMY_TEMPLATES[tid];
      if (!tpl) return;
      const enemy = new Ship({
        ...tpl,
        maxHull: Math.round(tpl.maxHull * scale),
      }, false, tpl.name);
      enemy.hull = enemy.maxHull;
      enemy.x = enemyStartX + (Math.random() - 0.5) * 500;
      enemy.y = enemyStartY + (i - enemyTemplateIds.length / 2) * 325;
      enemy.depth = 100 + Math.random() * 80;
      enemy.targetDepth = enemy.depth;
      enemy.moveTargetX = enemy.x;
      enemy.moveTargetY = enemy.y;
      enemy.atTarget = true;
      enemy.aiTimer = Math.random() * 2;
      // Agile enemy types start in evasive mode; heavier ones adopt it when damaged
      if (tpl.maxSpeed > 120) enemy._evadeMode = true;
      this.enemyShips.push(enemy);
    });

    // Ensure selected ship starts as flagship
    this.selectedShip = this.playerShips.find(s => s.isFlagship) || this.playerShips[0] || null;
  }

  _generateTerrain() {
    const add = (type, x, y, radiusMult = 1) => {
      const td = TERRAIN_TYPES[type];
      if (!td) return;
      this.terrain.push({ ...td, type, x, y, radius: td.radius * radiusMult });
    };
    const rand = (min, max) => min + Math.random() * (max - min);
    const midX = rand(WORLD_W * 0.35, WORLD_W * 0.65);
    const midY = rand(WORLD_H * 0.30, WORLD_H * 0.70);

    switch (this.biome) {
      case 'abyssal':
        // Open abyss: sparse islands, deep algae, very open
        for (let i = 0; i < 2; i++) add('island', rand(2000,6000), rand(800,5200), rand(0.5,0.9));
        add('algae_bloom', midX, midY, rand(1.0, 1.6));
        if (Math.random() < 0.5) add('vent', rand(3000,5000), rand(1000,4500), rand(0.8,1.2));
        break;

      case 'vent_field':
        // Clustered vents + narrow island lanes
        for (let i = 0; i < 5; i++)
          add('vent', midX + rand(-900,900), midY + rand(-700,700), rand(0.7,1.3));
        add('island', rand(1800,3500), rand(1000,5000), rand(0.6,1.0));
        add('island', rand(4500,6500), rand(1000,5000), rand(0.6,1.0));
        add('algae_bloom', midX + rand(-600,600), midY + rand(-400,400), rand(0.8,1.2));
        break;

      case 'kelp_forest':
        // Dense kelp flanks, limited sightlines
        for (let k = 0; k < 4; k++)
          add('kelp', WORLD_W*(0.3+k*0.12) + rand(-300,300), rand(600,5400), rand(0.9,1.4));
        for (let k = 0; k < 2; k++)
          add('algae_bloom', rand(2500,5500), rand(1200,4800), rand(0.7,1.1));
        add('island', midX, midY, rand(0.5,0.8));
        break;

      case 'seamount':
        // Central mountain chain — hard cover, flanking required
        for (let k = 0; k < 4; k++) {
          const angle = (k / 4) * Math.PI * 2 + rand(-0.3, 0.3);
          add('island', midX + Math.sin(angle)*rand(300,600), midY + Math.cos(angle)*rand(200,500), rand(0.7,1.2));
        }
        add('island', midX, midY, rand(1.0, 1.5)); // big central peak
        add('kelp', rand(1500,3500), rand(1500,4500), rand(0.9,1.2));
        add('kelp', rand(4500,6500), rand(1500,4500), rand(0.9,1.2));
        break;

      case 'wreck_field':
        // Many small islands scattered everywhere — tight corridors
        for (let i = 0; i < 7; i++)
          add('island', rand(1800,6200), rand(700,5300), rand(0.35,0.65));
        for (let i = 0; i < 2; i++)
          add('algae_bloom', rand(2000,6000), rand(1000,5000), rand(0.6,1.0));
        break;

      case 'crystal_caves':
        // Dense algae blackout zones, small vent clusters
        for (let i = 0; i < 3; i++)
          add('algae_bloom', rand(2000,6000), rand(800,5200), rand(0.8,1.3));
        for (let i = 0; i < 3; i++)
          add('vent', rand(2500,5500), rand(1000,5000), rand(0.7,1.0));
        add('island', rand(2500,3500), rand(1000,5000), rand(0.5,0.8));
        add('island', rand(4500,5500), rand(1000,5000), rand(0.5,0.8));
        break;

      default:
        // Generic fallback
        for (let i = 0; i < 3; i++) add('island', rand(2000,6000), rand(800,5200), rand(0.6,1.0));
        add('kelp', midX, midY, rand(0.8,1.2));
    }
  }

  addProjectile(p) { this.projectiles.push(p); }

  addEffect(type, x, y, opts) {
    this.effects.push(new Effect(type, x, y, opts));
  }

  // Predict where `target` will be when a projectile at `pSpeed` from `shooter` arrives.
  // Returns {x, y} lead point, scaled by leadQuality (0 = no lead, 1 = full lead).
  _computeLead(shooter, target, pSpeed, leadQuality) {
    if (leadQuality <= 0 || !pSpeed) return { x: target.x, y: target.y };
    const tvx = Math.sin(target.angle) * (target.speed || 0);
    const tvy = -Math.cos(target.angle) * (target.speed || 0);
    let d = Math.hypot(target.x - shooter.x, target.y - shooter.y);
    let tof = d / Math.max(1, pSpeed);
    // One refinement pass for better accuracy
    d = Math.hypot(target.x + tvx * tof - shooter.x, target.y + tvy * tof - shooter.y);
    tof = d / Math.max(1, pSpeed);
    return {
      x: target.x + tvx * tof * leadQuality,
      y: target.y + tvy * tof * leadQuality,
    };
  }

  _fireWeapon(ship, weapon, target) {
    const enemies = ship.isPlayer ? this.enemyShips : this.playerShips;
    const allShips = [...this.playerShips, ...this.enemyShips];

    // Lead quality based on targeting computer health (0 = no lead, 1 = perfect lead)
    const targetingSys = ship._subsystems?.targeting ?? 100;
    const leadQuality = target._isContactProxy ? 0
      : Math.max(0, Math.min(1, (targetingSys - 25) / 75));

    // Turret world-space origin (falls back to ship center if no slot)
    const [ox, oy] = weapon._slot ? ship._slotWorldPos(weapon._slot) : [ship.x, ship.y];

    switch (weapon.type) {
      case 'projectile': {
        if (weapon.scatter && weapon.scatter > 1) {
          for (let i = 0; i < weapon.scatter; i++) {
            const lead = this._computeLead(ship, target, weapon.pSpeed, leadQuality);
            const jitterX = lead.x + (Math.random()-0.5)*40;
            const jitterY = lead.y + (Math.random()-0.5)*40;
            const p = new Projectile(ship, weapon, jitterX, jitterY, null, ox, oy);
            p.depth = ship.depth;
            this.projectiles.push(p);
          }
        } else {
          const lead = this._computeLead(ship, target, weapon.pSpeed, leadQuality);
          const p = new Projectile(ship, weapon, lead.x, lead.y, null, ox, oy);
          p.depth = ship.depth;
          this.projectiles.push(p);
        }
        weapon.timer = weapon.cd;
        this.addEffect('muzzle', ox, oy, { color: weapon.color, radius: 8, maxRadius: 8, duration: 0.1 });
        audio.play('shoot_plasma', 0.4);
        break;
      }
      case 'torpedo': {
        // Contact-proxy targets: torpedo flies to contact position unguided (no homing)
        const homingTarget = target._isContactProxy ? null : target;
        // Torpedoes use reduced lead (they home anyway; lead gives a better initial bearing)
        const torpLead = this._computeLead(ship, target, weapon.pSpeed * 0.5, leadQuality * 0.6);
        const p = new Projectile(ship, weapon, torpLead.x, torpLead.y, homingTarget, ox, oy);
        p.depth = ship.depth;
        this.projectiles.push(p);
        weapon.timer = weapon.cd;
        if (weapon.ammo !== undefined && weapon.ammo !== Infinity) weapon.ammo--;
        audio.play('shoot_torpedo', 0.7);
        break;
      }
      case 'ew': {
        // Handled continuously in update(), not as a discrete fire event
        break;
      }
      case 'beam': {
        weapon.beamActive = true;
        weapon.beamTimer = weapon.beamDur;
        weapon.beamTarget = target;
        // Beam hit is processed each frame in _processBeams
        break;
      }
      case 'melee': {
        // Instant damage
        const dmg = target.takeDamage(weapon.dmg, weapon.sdmg, weapon.hdmg);
        this.stats.damageDone += dmg;
        weapon.timer = weapon.cd;
        this.addEffect('explosion', target.x, target.y, { color: weapon.color, radius: 5, maxRadius: 40, duration: 0.5 });
        break;
      }
      case 'aoe': {
        // Damage all enemies in radius
        const targets = ship.isPlayer ? this.enemyShips : this.playerShips;
        for (const t of targets) {
          if (t.isDestroyed) continue;
          if (dist(ship.x, ship.y, t.x, t.y) < weapon.exRadius) {
            const dmg = t.takeDamage(weapon.dmg, weapon.sdmg, weapon.hdmg);
            this.stats.damageDone += dmg;
          }
        }
        weapon.timer = weapon.cd;
        this.addEffect('shockwave', ship.x, ship.y, { color: weapon.color, radius: 10, maxRadius: weapon.exRadius, duration: 0.6 });
        break;
      }
      case 'drone': {
        if (ship.drones.length < (weapon.maxDrones || 3)) {
          const d = new Drone(ship, ox + (Math.random()-0.5)*40, oy + (Math.random()-0.5)*40);
          ship.drones.push(d);
          this.drones.push(d);
          weapon.timer = weapon.cd;
        }
        break;
      }
    }
  }

  _processBeams(dt) {
    const allShips = [...this.playerShips, ...this.enemyShips];
    for (const ship of allShips) {
      if (ship.isDestroyed) continue;
      for (const w of ship.weapons) {
        if (w.type !== 'beam' || !w.beamActive || !w.beamTarget) continue;
        // Cancel beam if slot is destroyed
        if (w._slot && w._slot.health <= 0) {
          w.beamActive = false; w.recharging = true; w.timer = w.rechargeDur; continue;
        }
        const target = w.beamTarget;
        if (target.isDestroyed) { w.beamActive = false; w.recharging = true; w.timer = w.rechargeDur; continue; }
        const d = dist(ship.x, ship.y, target.x, target.y);
        if (d > w.range) { w.beamActive = false; w.recharging = true; w.timer = w.rechargeDur; continue; }
        const dmgPerTick = w.dmg * dt;
        const dmg = target.takeDamage(dmgPerTick, w.sdmg, w.hdmg);
        if (ship.isPlayer) this.stats.damageDone += dmg;
        else this.stats.damageTaken += dmg;
        // Beam effect originates from turret world position
        const [bx, by] = w._slot ? ship._slotWorldPos(w._slot) : [ship.x, ship.y];
        this.addEffect('beam', bx, by, { x2: target.x, y2: target.y, depth: ship.depth || 0, depth2: target.depth || 0, color: w.color, width: w.bWidth, duration: 0.07 });
      }
    }
  }

  _processCollisions() {
    const allShips = [...this.playerShips, ...this.enemyShips];
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.isDestroyed) continue;

      // Island terrain blocks projectiles (cover mechanic)
      let terrainBlocked = false;
      for (const t of this.terrain) {
        if (t.type === 'island' && dist(p.x, p.y, t.x, t.y) < t.radius * 0.68) {
          terrainBlocked = true;
          break;
        }
      }
      if (terrainBlocked) {
        p.isDestroyed = true;
        this.addEffect('explosion', p.x, p.y, { color: '#556677', radius: 3, maxRadius: 14, duration: 0.3 });
        continue;
      }

      // Targets: enemy projectiles hit player ships and vice versa
      const targets = p.isPlayer ? this.enemyShips : this.playerShips;

      for (const ship of targets) {
        if (ship.isDestroyed) continue;
        // Depth proximity check — projectile must be within vertical range
        if (Math.abs(p.depth - (ship.depth || 0)) > ship.size + 120) continue;
        const d = dist(p.x, p.y, ship.x, ship.y);
        if (d < ship.size + p.radius) {
          // Hit! Pass attacker's subsystem targeting to takeDamage
          const atkSys = p.owner && p.owner.targetSubsystem ? p.owner.targetSubsystem : null;
          const hullMult = atkSys ? 0.4 : 1.0; // subsystem-aimed shots deal less hull damage
          const dmg = ship.takeDamage(p.weapon.dmg * hullMult, p.weapon.sdmg || 1, p.weapon.hdmg || 1, false, atkSys);
          if (p.isPlayer) this.stats.damageDone += dmg;
          else this.stats.damageTaken += dmg;

          // DOT effect
          if (p.dot) {
            ship.dotEffects.push({ dmg: p.dot.dmg, timer: p.dot.dur, tickTimer: p.dot.tick, tick: p.dot.tick });
          }

          // Explosion
          if (p.exRadius > 0) {
            const aoetargets = p.isPlayer ? this.enemyShips : this.playerShips;
            for (const t of aoetargets) {
              if (t === ship || t.isDestroyed) continue;
              if (dist(p.x, p.y, t.x, t.y) < p.exRadius) {
                const aoed = t.takeDamage(p.weapon.dmg * 0.5, p.weapon.sdmg, p.weapon.hdmg);
                if (p.isPlayer) this.stats.damageDone += aoed;
              }
            }
            this.addEffect('explosion', p.x, p.y, { color: p.color, radius: 5, maxRadius: p.exRadius, duration: 0.7 });
          } else {
            this.addEffect('explosion', p.x, p.y, { color: p.color, radius: 4, maxRadius: 20, duration: 0.4 });
          }

          p.isDestroyed = true;
          break;
        }
      }

      // CIWS proximity fuze: detonate near tracked torpedo
      if (!p.isDestroyed && p.isCIWS && p.targetProjectile && !p.targetProjectile.isDestroyed) {
        const prox = dist(p.x, p.y, p.targetProjectile.x, p.targetProjectile.y);
        if (prox < (p.weapon.proximityFuze || 60)) {
          // Destroy CIWS shell and target torpedo
          p.targetProjectile.isDestroyed = true;
          p.isDestroyed = true;
          // Area blast: also destroy other nearby enemy torpedoes within exRadius
          const blastR = p.weapon.exRadius || 90;
          for (const ep of this.projectiles) {
            if (ep === p || ep.isDestroyed || ep.isPlayer || ep.weapon.type !== 'torpedo') continue;
            if (dist(p.x, p.y, ep.x, ep.y) < blastR) ep.isDestroyed = true;
          }
          this.addEffect('explosion', p.x, p.y, { color: p.color, radius: 6, maxRadius: blastR, duration: 0.45 });
          continue;
        }
      }

      // Out of bounds
      if (!p.isDestroyed && (p.x < -100 || p.x > WORLD_W + 100 || p.y < -100 || p.y > WORLD_H + 100)) {
        p.isDestroyed = true;
      }
    }

    // Drone collisions (drones fire projectiles, but also collide)
    for (const drone of this.drones) {
      if (drone.isDestroyed) continue;
      const targets = drone.isPlayer ? this.enemyShips : this.playerShips;
      for (const t of targets) {
        if (t.isDestroyed) continue;
        if (dist(drone.x, drone.y, t.x, t.y) < drone.size + t.size * 0.5) {
          t.takeDamage(drone.damage * 2, 1, 1);
          drone.isDestroyed = true;
          this.addEffect('explosion', drone.x, drone.y, { color: drone.color, radius: 4, maxRadius: 22, duration: 0.4 });
          break;
        }
      }
    }
  }

  // ── CIWS auto-targeting of incoming torpedoes ─────────────────
  _processCIWS(dt) {
    const allShips = [...this.playerShips, ...this.enemyShips];
    for (const ship of allShips) {
      if (ship.isDestroyed) continue;
      for (const w of ship.weapons) {
        if (w.type !== 'ciws' || w.timer > 0) continue;
        // Skip if slot is destroyed
        if (w._slot && w._slot.health <= 0) continue;
        // Find nearest enemy torpedo within range
        const enemyProjectiles = this.projectiles.filter(p =>
          p.isPlayer !== ship.isPlayer && !p.isDestroyed && !p.isCIWS && p.weapon.type === 'torpedo'
        );
        let best = null, bestD = w.range;
        for (const p of enemyProjectiles) {
          const d = dist(ship.x, ship.y, p.x, p.y);
          if (d < bestD) { bestD = d; best = p; }
        }
        // If no torpedo, try enemy drones
        if (!best) {
          const enemyDrones = this.drones.filter(d => d.isPlayer !== ship.isPlayer && !d.isDestroyed);
          for (const d of enemyDrones) {
            const dd = dist(ship.x, ship.y, d.x, d.y);
            if (dd < w.range) { best = d; bestD = dd; break; }
          }
        }
        if (!best) continue;
        // Fire CIWS shell from turret world position
        const [cx, cy] = w._slot ? ship._slotWorldPos(w._slot) : [ship.x, ship.y];
        const shell = new Projectile(ship, w, best.x, best.y, null, cx, cy);
        shell.isCIWS = true;
        if (best.weapon) shell.targetProjectile = best; // torpedo target
        this.addProjectile(shell);
        w.timer = w.cd;
        audio.play('shoot_plasma', 0.1);
      }
    }
  }

  _checkDeaths() {
    const allShips = [...this.playerShips, ...this.enemyShips];
    for (const ship of allShips) {
      if (ship.isDestroyed && !ship._deathRecorded) {
        ship._deathRecorded = true;
        if (ship.isPlayer) {
          this.stats.shipsLost++;
        } else {
          this.stats.enemiesDestroyed++;
          this.stats.creditsEarned += ship.creditValue || 0;
          this.stats.xpEarned += ship.xpValue || 0;
        }
        // Death effects vary by type
        if (ship.deathType === 'detonate') {
          // Magazine detonation: massive blast + AoE damage (hits both sides)
          const blastRadius = ship.size * 6 + 120;
          const blastDmg   = ship.maxHull * 0.55;
          this.addEffect('explosion', ship.x, ship.y, { color: '#ff8800', radius: 20, maxRadius: blastRadius, duration: 1.4 });
          this.addEffect('shockwave', ship.x, ship.y, { color: '#ffcc00', radius: 10, maxRadius: blastRadius * 1.3, duration: 1.1 });
          this.addEffect('explosion', ship.x, ship.y, { color: '#ffffff', radius: 8,  maxRadius: ship.size * 4, duration: 0.6 });
          for (const t of allShips) {
            if (t === ship || t.isDestroyed) continue;
            const d = dist(ship.x, ship.y, t.x, t.y);
            if (d < blastRadius) {
              const falloff = 1 - d / blastRadius;
              t.takeDamage(blastDmg * falloff, 1.2, 1.2);
            }
          }
        } else if (ship.deathType === 'explode') {
          this.addEffect('explosion', ship.x, ship.y, { color: '#ff4400', radius: 14, maxRadius: ship.size * 4, duration: 1.1 });
          this.addEffect('shockwave', ship.x, ship.y, { color: '#ffffff', radius: 5,  maxRadius: ship.size * 3.5, duration: 0.9 });
        } else {
          // Sink
          this.addEffect('explosion', ship.x, ship.y, { color: ship.color, radius: 8,  maxRadius: ship.size * 2.5, duration: 0.9 });
        }
      }
    }

    // Remove fully-dead enemies (destroyTimer expired)
    for (let i = this.enemyShips.length - 1; i >= 0; i--) {
      if (this.enemyShips[i].isDestroyed && this.enemyShips[i].destroyTimer <= 0) {
        this.enemyShips.splice(i, 1);
      }
    }

    // Clean up destroyed drones
    for (let i = this.drones.length - 1; i >= 0; i--) {
      if (this.drones[i].isDestroyed) this.drones.splice(i, 1);
    }
    for (const ship of this.playerShips) {
      ship.drones = ship.drones.filter(d => !d.isDestroyed);
    }
  }

  _checkCompletion() {
    const aliveEnemies = this.enemyShips.filter(s => !s.isDestroyed);
    const alivePlayerShips = this.playerShips.filter(s => !s.isDestroyed);

    if (aliveEnemies.length === 0 && this.enemyShips.length > 0) {
      this.complete = true;
      this.result = 'win';
    } else if (alivePlayerShips.length === 0) {
      this.complete = true;
      this.result = 'loss';
    }
  }

  update(dt) {
    if (this.paused || this.complete) return;
    this.time += dt;

    // Update move marker
    if (this.moveMarker) {
      this.moveMarker.timer -= dt;
      if (this.moveMarker.timer <= 0) this.moveMarker = null;
    }

    // ── EW Jammer processing ──────────────────────────────────────
    for (const playerShip of this.playerShips) {
      if (playerShip.isDestroyed) continue;
      for (const w of playerShip.weapons) {
        if (w.type !== 'ew') continue;
        for (const enemy of this.enemyShips) {
          if (enemy.isDestroyed) continue;
          if (dist(playerShip.x, playerShip.y, enemy.x, enemy.y) < w.ewRadius) {
            const effectiveness = w.ewStrength * (1 - (enemy.ewDefense || 0) / 100);
            if (effectiveness > enemy.ewJammedStrength || enemy.ewJammedTimer <= 0) {
              enemy.ewJammedStrength = effectiveness;
            }
            enemy.ewJammedTimer = 0.5; // refresh each frame
          }
        }
      }
    }

    // ── Update player ships ────────────────────────────────────────
    for (const ship of this.playerShips) {
      ship._terrain = this.terrain; // for canFireWeapon LOS checks
      ship.update(dt, this.terrain);
      if (ship.isDestroyed) continue;

      // Auto-engage: if no active attack target, pick the closest revealed enemy in weapon range
      if (!ship.attackTarget || ship.attackTarget.isDestroyed) {
        const maxRange = ship.weapons.reduce((b, w) =>
          (w.type !== 'ew' && w.range > b) ? w.range : b, 600);
        let closest = null, closestD = Infinity;
        for (const en of this.enemyShips) {
          if (en.isDestroyed || !en._revealed) continue;
          const d = dist(ship.x, ship.y, en._displayX || en.x, en._displayY || en.y);
          if (d < maxRange * 1.1 && d < closestD) { closest = en; closestD = d; }
        }
        if (closest) ship.attackTarget = closest;
      }

      // Auto-approach + auto-fire when attack target is set
      if (ship.isCrippled) {
        ship.attackTarget = null; // crippled ships don't fight
      } else if (ship.attackTarget && !ship.attackTarget.isDestroyed) {
        const tgt = ship.attackTarget;
        const dxy = dist(ship.x, ship.y, tgt.x, tgt.y);
        const dz  = Math.abs(ship.depth - tgt.depth);

        // Get max non-EW weapon range for approach distance
        const maxRange = ship.weapons.reduce((best, w) =>
          (w.type !== 'ew' && w.range > best) ? w.range : best, 600);

        // Auto-approach: move within 80% of best weapon range if too far or holding
        if (dxy > maxRange * 0.88 && (ship.atTarget || ship._autoApproaching)) {
          const approachX = tgt.x + (ship.x - tgt.x) / dxy * maxRange * 0.75;
          const approachY = tgt.y + (ship.y - tgt.y) / dxy * maxRange * 0.75;
          ship.setMoveTarget(
            Math.max(300, Math.min(WORLD_W - 300, approachX)),
            Math.max(300, Math.min(WORLD_H - 300, approachY))
          );
          ship._autoApproaching = true;
        } else if (dxy <= maxRange * 0.88) {
          ship._autoApproaching = false; // in range, stop auto-approach
        }

        // Auto-depth: move toward target's depth if gap would prevent firing
        // Only override if player hasn't manually set a different target depth recently
        if (dz > 400 && dxy < maxRange * 1.4 && !ship._manualDepthOverride) {
          const desiredDepth = tgt.depth * 0.7 + ship.depth * 0.3; // approach target depth gradually
          ship.setDepthTarget(Math.max(0, Math.min(WORLD_DEPTH, desiredDepth)));
        }

        // Fire — use contact position (with noise) when blind fire mode is on and target not revealed
        let fireProxy = tgt;
        if (ship._fireAtContacts && !tgt._revealed) {
          // Find best contact among this ship and its comms partners
          const allViews = [ship, ...(ship._commsPartners || [])];
          let bestContact = null;
          for (const vs of allViews) {
            const c = (vs._contacts || {})[tgt.id];
            if (c && (!bestContact || c.accuracy > bestContact.accuracy)) bestContact = c;
          }
          if (bestContact) {
            // Add positional error inversely proportional to accuracy
            const err = (1 - bestContact.accuracy) * 480;
            fireProxy = {
              x: bestContact.rx + (Math.random() - 0.5) * err,
              y: bestContact.ry + (Math.random() - 0.5) * err,
              depth: tgt._lastKnownDepth || tgt.depth,
              isDestroyed: false,
              _isContactProxy: true,
            };
          }
        }
        for (const w of ship.weapons) {
          if (ship.canFireWeapon(w, fireProxy)) {
            this._fireWeapon(ship, w, fireProxy);
          }
        }
      } else {
        ship._autoApproaching = false;
      }
    }

    // ── Enemy reinforcement wave (triggered after 50s) ─────────────
    if (!this._reinforcementsSpawned && this.time > 50) {
      this._reinforcementsSpawned = true;
      if (this.enemyShips.filter(s => !s.isDestroyed).length > 0) {
        this._spawnReinforcements();
      }
    }
    // Decay active sonar event
    if (this.activeSonarEvent) {
      this.activeSonarEvent.timer -= dt;
      if (this.activeSonarEvent.timer <= 0) this.activeSonarEvent = null;
    }
    // Decay reinforcement alert
    if (this.reinforcementAlert) {
      this.reinforcementAlert.timer -= dt;
      if (this.reinforcementAlert.timer <= 0) this.reinforcementAlert = null;
    }

    // ── Coordinate enemy group tactics (focus fire, etc.) ──────────
    updateAIGroup(this.enemyShips, this.playerShips, this.time);

    // ── Update enemy ships ─────────────────────────────────────────
    for (const ship of this.enemyShips) {
      if (!ship.isDestroyed) {
        ship._terrain = this.terrain; // for canFireWeapon LOS checks
        // Auto-enable evasion when damaged or under fire
        if (!ship._evadeMode && ship.hull < ship.maxHull * 0.65 && ship.maxSpeed > 80) {
          ship._evadeMode = true;
        }
        updateAI(ship, this.playerShips, dt, this.terrain);
        ship.update(dt, this.terrain);
        if (!ship.isDestroyed && ship.attackTarget) {
          for (const w of ship.weapons) {
            if (ship.canFireWeapon(w, ship.attackTarget)) {
              this._fireWeapon(ship, w, ship.attackTarget);
            }
          }
        }
      }
    }

    // Update projectiles
    for (const p of this.projectiles) p.update(dt, this.playerShips);

    // Update drones
    const droneEnemies = this.drones.length > 0 ? (this.drones[0].isPlayer ? this.enemyShips : this.playerShips) : [];
    for (const d of this.drones) d.update(dt, droneEnemies, p => this.projectiles.push(p));

    // Process beams
    this._processBeams(dt);

    // CIWS auto-targeting
    this._processCIWS(dt);

    // Collisions
    this._processCollisions();

    // Deaths
    this._checkDeaths();

    // Effects
    for (const e of this.effects) e.update(dt);
    this.effects = this.effects.filter(e => !e.done);
    this.projectiles = this.projectiles.filter(p => !p.isDestroyed);

    // Completion check
    this._checkCompletion();

    // ── Radar/sonar detection update ───────────────────────────────
    this._updateDetection(dt);

    // Process pending radar flashes (renderer picks these up)
    if (this._pendingRadarFlashes && this._pendingRadarFlashes.length > 0) {
      this.pendingRadarFlashes = this._pendingRadarFlashes;
      this._pendingRadarFlashes = [];
    } else {
      this.pendingRadarFlashes = null;
    }

    // Process pending player sonar hits (renderer picks these up)
    if (this._pendingPlayerSonarHits && this._pendingPlayerSonarHits.length > 0) {
      this.pendingPlayerSonarHits = this._pendingPlayerSonarHits;
      this._pendingPlayerSonarHits = [];
    } else {
      this.pendingPlayerSonarHits = null;
    }
  }

  _updateDetection(dt) {
    const playerShips = this.playerShips.filter(s => !s.isDestroyed);
    const enemyShips  = this.enemyShips.filter(s => !s.isDestroyed);

    // ── Update expanding active-sonar pings ───────────────────────
    const pings = this.sonarPings || [];
    for (const ping of pings) {
      const prevRadius = ping.radius;
      ping.radius += ping.speed * dt;
      ping.timer  -= dt;
      const source = playerShips.find(s => s.id === ping.shipId);
      if (!source) continue;
      for (const enemy of enemyShips) {
        if (ping._hitEnemies.has(enemy.id)) continue;
        const d = dist(ping.x, ping.y, enemy.x, enemy.y);
        if (d <= ping.radius && d > prevRadius - ping.speed * dt * 0.5) {
          ping._hitEnemies.add(enemy.id);
          // Check if an island blocks the ping path
          const blocked = this.terrain.some(t =>
            t.type === 'island' &&
            lineIntersectsCircle(ping.x, ping.y, enemy.x, enemy.y, t.x, t.y, t.radius * 0.8)
          );
          if (!blocked) this._pingHitEnemy(source, enemy, d, ping.maxRadius);
        }
      }
    }
    this.sonarPings = pings.filter(p => p.timer > 0);

    // ── Per-player-ship passive sonar + visual detection ──────────
    for (const ps of playerShips) {
      ps._contacts = ps._contacts || {};
      ps._commsPartners = playerShips.filter(other =>
        other !== ps && other.commsEnabled && ps.commsEnabled &&
        dist(ps.x, ps.y, other.x, other.y) < COMMS_RANGE
      );

      for (const enemy of enemyShips) {
        const d = dist(ps.x, ps.y, enemy.x, enemy.y);

        // ── Visual range: always full accuracy ──────────────────
        if (d < VISUAL_RANGE) {
          ps._contacts[enemy.id] = {
            rx: enemy.x, ry: enemy.y, accuracy: 1.0,
            via: 'visual', pingCount: 0,
            timer: DETECT_GRACE_PERIOD,
            shipRef: enemy,
          };
          continue;
        }

        // ── Passive sonar ────────────────────────────────────────
        const depthFactor = 1 - DETECT_DEPTH_PENALTY *
          Math.min(1, (enemy.depth || 0) / (WORLD_DEPTH * 0.6));
        const ewPenalty    = (ps.ewJammedTimer > 0)
          ? Math.max(0.3, 1 - ps.ewJammedStrength / 100) : 1.0;
        const stealthFactor= 1 - Math.min(0.85, (enemy.stealthRating || 0) / 100 * 0.9);
        const deepBonus    = (enemy.depth || 0) > WORLD_DEPTH * 0.68 ? 0.58 : 1.0;
        const thermalCross = ((ps.depth || 0) < THERMAL_LAYER_DEPTH) !==
                             ((enemy.depth || 0) < THERMAL_LAYER_DEPTH);
        const thermalFactor= thermalCross ? THERMAL_LAYER_PENALTY : 1.0;
        const coverFactor  = (() => {
          let f = 1.0;
          for (const t of this.terrain) {
            if (t.type === 'island' &&
                lineIntersectsCircle(ps.x, ps.y, enemy.x, enemy.y, t.x, t.y, t.radius * 0.8))
              return 0;  // fully blocked — island in line of sonar
            if (t.type === 'algae_bloom') {
              // Bloom attenuates if ship is inside it OR path passes through it
              const shipInBloom = dist(ps.x, ps.y, t.x, t.y) < t.radius;
              const enemyInBloom = dist(enemy.x, enemy.y, t.x, t.y) < t.radius;
              const pathThrough = lineIntersectsCircle(ps.x, ps.y, enemy.x, enemy.y, t.x, t.y, t.radius);
              if (shipInBloom || enemyInBloom || pathThrough) f *= (t.sensorMult || 0.4);
            }
          }
          return f;
        })();
        const sensorSpeed  = (ps.speed < ps.maxSpeed * 0.05) ? 1.3
          : (ps.speed > ps.maxSpeed * 0.75) ? 0.82 : 1.0;
        const targetMotion = enemy.speed > enemy.maxSpeed * 0.65 ? 0.88 : 1.0;
        const activeSonarExposed = (enemy._activeSonarExposed > 0) ? 1.4 : 1.0;

        const sysSensorMult = ps._sysSensorMult || 1.0;
        const effectiveRange = ps.detectRange * depthFactor * ewPenalty * stealthFactor
          * deepBonus * coverFactor * sensorSpeed * targetMotion * thermalFactor * activeSonarExposed * sysSensorMult;

        if (d < effectiveRange * DETECT_RANGE_CONTACT) {
          // Passive detection: accuracy scales with how well we can hear it
          const passiveAccuracy = Math.min(0.75,
            (1 - d / (effectiveRange * DETECT_RANGE_CONTACT)) * 0.6 + 0.15);
          const existing = ps._contacts[enemy.id];
          if (!existing || existing.via !== 'visual') {
            const maxError = (1 - passiveAccuracy) * 500;
            const errAng = Math.random() * Math.PI * 2;
            const errR   = Math.random() * maxError * dt * 8;  // gradual improvement
            ps._contacts[enemy.id] = {
              rx: existing
                ? existing.rx + (enemy.x - existing.rx) * 0.08 * dt * 10
                : enemy.x + Math.cos(errAng) * maxError,
              ry: existing
                ? existing.ry + (enemy.y - existing.ry) * 0.08 * dt * 10
                : enemy.y + Math.sin(errAng) * maxError,
              accuracy: existing
                ? Math.min(0.75, existing.accuracy + CONTACT_DECAY_RATE * dt * 2)
                : passiveAccuracy,
              via: 'passive',
              pingCount: existing ? existing.pingCount : 0,
              timer: DETECT_GRACE_PERIOD * 2,
              shipRef: enemy,
            };
          }
        }

        // Decay contacts not being actively reinforced
        const contact = ps._contacts[enemy.id];
        if (contact && contact.via !== 'visual' && d >= effectiveRange * DETECT_RANGE_CONTACT) {
          contact.timer -= dt;
          contact.accuracy = Math.max(0, contact.accuracy - CONTACT_DECAY_RATE * dt);
          if (contact.timer <= 0 || contact.accuracy <= 0) {
            delete ps._contacts[enemy.id];
          }
        }
      }
    }

    // ── Combined accuracy: triangulate independent contacts BEFORE sharing ──
    // Uses product rule: each independent sensor source reduces uncertainty independently
    const _fleetAccuracy = new Map(); // enemyId → combined accuracy
    for (const enemy of enemyShips) {
      let miss = 1.0, hasAny = false;
      for (const ps of playerShips) {
        const c = (ps._contacts || {})[enemy.id];
        // Only count direct (non-shared) contacts to avoid double-counting
        if (c && c.via !== 'shared') {
          miss *= (1 - Math.max(0, c.accuracy));
          hasAny = true;
        }
      }
      _fleetAccuracy.set(enemy.id, hasAny ? Math.min(0.98, 1 - miss) : 0);
    }

    // ── Comms: share contacts between linked ships ────────────────
    for (const ps of playerShips) {
      for (const partner of (ps._commsPartners || [])) {
        for (const [enemyId, contact] of Object.entries(partner._contacts || {})) {
          const mine = ps._contacts[enemyId];
          const sharedAccuracy = contact.accuracy * 0.75;  // data loses fidelity in transit
          if (!mine || mine.accuracy < sharedAccuracy) {
            ps._contacts[enemyId] = {
              rx: contact.rx,
              ry: contact.ry,
              accuracy: sharedAccuracy,
              via: 'shared',
              pingCount: contact.pingCount,
              timer: contact.timer * 0.7,
              shipRef: contact.shipRef,
            };
          }
        }
      }
    }

    // ── Update enemy.detectionLevel from selected-ship perspective ─
    const selShip = this.selectedShip;
    const viewShips = selShip ? [selShip, ...(selShip._commsPartners || [])]
                               : playerShips;

    for (const enemy of enemyShips) {
      const combinedAcc = _fleetAccuracy.get(enemy.id) || 0;
      let best = null;
      for (const vs of viewShips) {
        const c = (vs._contacts || {})[enemy.id];
        if (c && (!best || c.accuracy > best.accuracy)) best = c;
      }
      if (!best) {
        enemy.detectionLevel = 0;
        enemy._revealed = false;
        enemy._displayX = null; enemy._displayY = null;
        enemy._displayAccuracy = 0;
        // Update last-known from contacts across ALL player ships
        for (const ps of playerShips) {
          const old = (ps._contacts || {})[enemy.id];
          if (old) {
            enemy._lastKnownX = old.rx;
            enemy._lastKnownY = old.ry;
            enemy._lastKnownTimer = Math.max(enemy._lastKnownTimer || 0, old.timer);
          }
        }
        // Decay ghost marker timer
        if (enemy._lastKnownTimer > 0) enemy._lastKnownTimer -= dt;
      } else {
        enemy._displayX = best.rx;
        enemy._displayY = best.ry;
        // Combined accuracy drives display and reveal; individual best drives display position
        enemy._displayAccuracy = combinedAcc;
        enemy.detectionLevel = combinedAcc >= 0.80 ? 2 : 1;
        // _revealed: full sensor lock — shows model + gold indicator; auto-targeted by fleet
        enemy._revealed = combinedAcc >= 0.85;
        enemy._lastKnownX = best.rx;
        enemy._lastKnownY = best.ry;
        enemy._lastKnownDepth = enemy.depth;
        enemy._lastKnownTimer = LAST_KNOWN_DURATION;
      }
    }

    // Handle destroyed enemies
    for (const enemy of this.enemyShips) {
      if (enemy.isDestroyed) enemy.detectionLevel = 0;
    }

    // ── Enemy ships detect player ships (for AI) ──────────────────
    for (const es of enemyShips) {
      es._contacts = es._contacts || {};
      for (const ps of playerShips) {
        const d = dist(es.x, es.y, ps.x, ps.y);
        const visRange = VISUAL_RANGE * 1.1;
        // Enemies have simpler detection (no active sonar, just passive + visual)
        const depthFactor2 = 1 - DETECT_DEPTH_PENALTY * Math.min(1, (ps.depth||0) / (WORLD_DEPTH * 0.6));
        const stealthFact2 = 1 - Math.min(0.85, (ps.stealthRating||0) / 100 * 0.9);
        const effectiveR2  = (es.detectRange || 800) * depthFactor2 * stealthFact2;
        if (d < visRange || d < effectiveR2) {
          es._contacts[ps.id] = {
            rx: ps.x, ry: ps.y,
            accuracy: d < visRange ? 1.0 : Math.max(0.4, 1 - d / effectiveR2),
            via: d < visRange ? 'visual' : 'passive',
            timer: DETECT_GRACE_PERIOD * 2,
            shipRef: ps,
          };
        } else if (es._contacts[ps.id]) {
          es._contacts[ps.id].timer -= dt;
          if (es._contacts[ps.id].timer <= 0) delete es._contacts[ps.id];
        }
      }
      // Enemy comms: share between enemies within COMMS_RANGE * 0.7
      for (const other of enemyShips) {
        if (other === es || other.isDestroyed) continue;
        if (dist(es.x, es.y, other.x, other.y) > COMMS_RANGE * 0.7) continue;
        if (!other._contacts) continue;
        for (const [pid, c] of Object.entries(other._contacts)) {
          const mine = es._contacts[pid];
          if (!mine || mine.accuracy < c.accuracy * 0.8) {
            es._contacts[pid] = { ...c, accuracy: c.accuracy * 0.8, via: 'shared' };
          }
        }
      }
    }

    // Decay active sonar exposure
    for (const s of [...playerShips, ...enemyShips]) {
      if (s._activeSonarExposed > 0) s._activeSonarExposed -= dt;
      if (s.activeSonarCooldown > 0) s.activeSonarCooldown -= dt;
    }
  }

  // Input from game
  selectShip(ship) {
    this.selectedShip = ship;
    if (ship && !this.selectedShips.includes(ship)) this.selectedShips = [ship];
  }

  issueMove(x, y) {
    if (this.selectedShip && !this.selectedShip.isDestroyed) {
      this.selectedShip.setMoveTarget(x, y);
      this.moveMarker = { x, y, timer: 1.5 };
    }
  }

  issueAttack(target) {
    if (this.selectedShip && !this.selectedShip.isDestroyed && target && !target.isDestroyed) {
      this.selectedShip.attackTarget = target;
    }
  }

  allStop() {
    for (const s of this.selectedShips.length > 0 ? this.selectedShips : (this.selectedShip ? [this.selectedShip] : [])) {
      s.setMoveTarget(s.x, s.y);
      s.atTarget = true;
    }
  }

  getShipAt(wx, wy, radius = 30) {
    let best = null, bestD = radius;
    const all = [...this.playerShips, ...this.enemyShips];
    for (const s of all) {
      if (s.isDestroyed) continue;
      const d = dist(wx, wy, s.x, s.y);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  // ── Active Sonar Pulse ────────────────────────────────────────
  activeSonarPulse(sourceShip) {
    if (sourceShip.activeSonarCooldown > 0) return false;
    sourceShip.activeSonarCooldown = ACTIVE_SONAR_COOLDOWN;
    sourceShip._activeSonarExposed = ACTIVE_SONAR_EXPOSE;
    // Create expanding ping wavefront
    this.sonarPings = this.sonarPings || [];
    this.sonarPings.push({
      id: ++_eid,
      x: sourceShip.x,
      y: sourceShip.y,
      depth: sourceShip.depth || 0,
      radius: 0,
      maxRadius: ACTIVE_SONAR_RANGE,
      speed: PING_TRAVEL_SPEED,
      shipId: sourceShip.id,
      _hitEnemies: new Set(),
      timer: ACTIVE_SONAR_RANGE / PING_TRAVEL_SPEED + 0.8,
    });
    this.activeSonarEvent = { x: sourceShip.x, y: sourceShip.y, depth: sourceShip.depth || 0, timer: 0.4 };
    return true;
  }

  // ── Ping hit helper: update contact accuracy on source ship ──
  _pingHitEnemy(sourceShip, enemy, pingDist, maxRadius) {
    // Accuracy falls off with distance; stealth and EW reduce it further
    const distFactor = 1 - (pingDist / maxRadius) * 0.72;
    const stealthPenalty = 1 - (enemy.stealthRating || 0) / 100 * 0.6;
    const ewPenalty = (sourceShip.ewJammedTimer > 0)
      ? 0.5 : (enemy.ewStrength > 0 ? Math.max(0.35, 1 - enemy.ewStrength / 120) : 1.0);
    const sensorBonus = Math.min(1.5, sourceShip.detectRange / 1000);
    const rawAccuracy = Math.max(0.08,
      distFactor * stealthPenalty * ewPenalty * PING_BASE_ACCURACY * sensorBonus
    );

    const existing = sourceShip._contacts[enemy.id];
    const pingCount = existing ? (existing.pingCount || 0) + 1 : 1;
    // Each successive ping improves accuracy (diminishing returns)
    const accuracy = existing
      ? Math.min(0.98, existing.accuracy + rawAccuracy * (0.5 / pingCount) + 0.08)
      : rawAccuracy;

    // Position error proportional to inaccuracy
    const maxError = Math.max(0, (1 - accuracy) * 600);
    const errAng = Math.random() * Math.PI * 2;
    const errR   = Math.random() * maxError;

    sourceShip._contacts[enemy.id] = {
      rx: enemy.x + Math.cos(errAng) * errR,
      ry: enemy.y + Math.sin(errAng) * errR,
      accuracy,
      via: 'ping',
      pingCount,
      timer: LAST_KNOWN_DURATION * (0.8 + accuracy * 1.2),
      shipRef: enemy,
    };

    // Mark for renderer to show a radar return flash
    if (!this._pendingRadarFlashes) this._pendingRadarFlashes = [];
    const c = sourceShip._contacts[enemy.id];
    this._pendingRadarFlashes.push({ rx: c.rx, ry: c.ry, depth: enemy.depth || 0 });

    // ── Sonar is bidirectional: the pinged enemy now knows where the ping came FROM ──
    // The ping origin (sourceShip position) is loud — reduced only by pinger's stealth.
    const backAccuracy = Math.max(0.45, distFactor * (1 - (sourceShip.stealthRating || 0) / 100 * 0.7));
    const backErr = (1 - backAccuracy) * 400;
    const bAng = Math.random() * Math.PI * 2;
    enemy._contacts = enemy._contacts || {};
    enemy._contacts[sourceShip.id] = {
      rx: sourceShip.x + Math.cos(bAng) * backErr * Math.random(),
      ry: sourceShip.y + Math.sin(bAng) * backErr * Math.random(),
      accuracy: backAccuracy,
      via: 'ping_return',
      pingCount: 1,
      timer: LAST_KNOWN_DURATION,
      shipRef: sourceShip,
    };
    // Tell renderer to show a warning on the SOURCE ship (it just revealed itself)
    if (!this._pendingPlayerSonarHits) this._pendingPlayerSonarHits = [];
    if (!this._pendingPlayerSonarHits.some(h => h.shipId === sourceShip.id)) {
      this._pendingPlayerSonarHits.push({ shipId: sourceShip.id, x: sourceShip.x, y: sourceShip.y, depth: sourceShip.depth || 0 });
    }
  }

  // ── Enemy Reinforcement Wave ──────────────────────────────────
  _spawnReinforcements() {
    const aliveEnemies = this.enemyShips.filter(s => !s.isDestroyed);
    if (aliveEnemies.length === 0) return;

    // Choose spawn edge (avoid left side = player spawn zone)
    const angle = Math.PI * (0.1 + Math.random() * 0.8); // top or right arc
    const spawnX = WORLD_W / 2 + Math.cos(angle) * (WORLD_W * 0.48);
    const spawnY = WORLD_H / 2 + Math.sin(angle) * (WORLD_H * 0.48);

    // Pick faction from existing enemies
    const faction = aliveEnemies[0].faction || 'kethvari';
    const pool = faction === 'kethvari' ? ['keth_spore','keth_hunter'] :
                 faction === 'shard'    ? ['shard_slicer','shard_slicer'] :
                                          ['leviathan_young'];
    const count = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < Math.min(count, pool.length); i++) {
      const tpl = ENEMY_TEMPLATES[pool[i]];
      if (!tpl) continue;
      const ship = new Ship({ ...tpl }, false, tpl.name);
      ship.hull = ship.maxHull;
      ship.x = Math.max(300, Math.min(WORLD_W - 300, spawnX + (Math.random() - 0.5) * 450));
      ship.y = Math.max(300, Math.min(WORLD_H - 300, spawnY + (Math.random() - 0.5) * 450));
      ship.setDepthTarget(tpl.preferredDepth || 100);
      ship.moveTargetX = ship.x; ship.moveTargetY = ship.y; ship.atTarget = true;
      ship.aiTimer = Math.random() * 2;
      this.enemyShips.push(ship);
    }
    // Signal game to show alert
    this.reinforcementAlert = { timer: 3.5 };
  }
}
