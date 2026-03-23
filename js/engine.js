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
    this.maxShields = template.maxShields;
    this.shields = template.maxShields;
    this.shieldRate = template.shieldRate;
    this.shieldDelay = template.shieldDelay;
    this.shieldTimer = 0;
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
    this.isDestroyed = false;
    this.destroyTimer = 0;
    this.hitFlashTimer = 0;
    this.shieldHitTimer = 0;
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
  }

  setDepthTarget(d) {
    this.targetDepth = Math.max(0, Math.min(WORLD_DEPTH, d));
  }

  takeDamage(rawDmg, sdmg = 1.0, hdmg = 1.0, isDot = false) {
    if (this.isDestroyed) return 0;
    let remaining = rawDmg;

    // Hit shield first
    if (this.shields > 0) {
      const sdmgAmt = remaining * sdmg;
      const shieldDamage = Math.min(this.shields, sdmgAmt);
      this.shields -= shieldDamage;
      remaining -= shieldDamage / sdmg;
      if (!isDot) {
        this.shieldHitTimer = 0.25;
        this.shieldTimer = this.shieldDelay;
      }
      if (remaining <= 0) return rawDmg;
    }

    // Hull damage with armor reduction
    const hullDmg = Math.max(1, remaining * hdmg - this.armor);
    this.hull -= hullDmg;
    if (!isDot) this.hitFlashTimer = 0.1;
    if (this.hull <= 0) {
      this.hull = 0;
      this.isDestroyed = true;
      this.destroyTimer = 1.2;
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

    // Shield recharge
    if (this.shieldTimer > 0) {
      this.shieldTimer -= dt;
    } else if (this.shields < this.maxShields) {
      this.shields = Math.min(this.shields + this.shieldRate * dt, this.maxShields);
    }

    // Hull regen (from repair nanites module)
    if (this.hullRegen && this.hullRegen > 0) {
      this.hull = Math.min(this.hull + this.hullRegen * dt, this.maxHull);
    }

    // Hit flash
    if (this.hitFlashTimer > 0) this.hitFlashTimer -= dt;
    if (this.shieldHitTimer > 0) this.shieldHitTimer -= dt;

    // EW jamming decay
    if (this.ewJammedTimer > 0) this.ewJammedTimer -= dt;

    // Depth movement (ascent/descent)
    if (Math.abs(this.targetDepth - this.depth) > 0.5) {
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

    // Movement
    if (this.moveTargetX !== null && !this.atTarget) {
      const dx = this.moveTargetX - this.x;
      const dy = this.moveTargetY - this.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 20) {
        this.atTarget = true;
        this.speed = Math.max(0, this.speed - this.accel * dt * 2);
      } else {
        const targetAngle = Math.atan2(dx, -dy);
        let diff = normalizeAngle(targetAngle - this.angle);
        const turn = this.turnRate * dt;
        this.angle += Math.sign(diff) * Math.min(Math.abs(diff), turn);
        // Slow down if turning a lot
        const speedFactor = Math.max(0.3, 1 - Math.abs(diff) / Math.PI);
        const targetSpeed = this.maxSpeed * speedFactor;
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
    // Depth gap check: can't fire across more than 180 units of depth
    if (Math.abs(this.depth - target.depth) > 180) return false;
    // Torpedo ammo
    if (w.type === 'torpedo' && w.ammo !== undefined && w.ammo !== Infinity && w.ammo <= 0) return false;
    const d = dist(this.x, this.y, target.x, target.y);
    // EW jamming reduces effective range
    const jam = (this.ewJammedTimer > 0) ? (this.ewJammedStrength / 100) : 0;
    const effectiveRange = w.range * Math.max(0.4, 1 - jam * 0.5);
    if (d > effectiveRange) return false;
    // Firing arc: weapon can only fire within arc/2 radians of ship facing
    if (w.arc !== undefined) {
      const toTarget = angleToward(this.x, this.y, target.x, target.y);
      const diff = Math.abs(normalizeAngle(toTarget - this.angle));
      if (diff > w.arc) return false;
    }
    if (w.type === 'beam') return !w.beamActive && !w.recharging;
    if (w.type === 'melee' || w.type === 'aoe') return w.timer <= 0;
    return w.timer <= 0;
  }

  getSaveData() {
    return {
      templateId: this.templateId,
      name: this.name,
      isFlagship: this.isFlagship,
      hull: this.hull,
      maxHull: this.maxHull,
      shields: this.shields,
      maxShields: this.maxShields,
      shieldRate: this.shieldRate,
      armor: this.armor,
      maxSpeed: this.maxSpeed,
      upgrades: [...this.upgrades],
      xp: this.xp,
      level: this.level,
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
    const ship = new Ship(mergedTpl, true, data.name);
    ship.isFlagship  = data.isFlagship || false;
    ship.hull        = data.hull;
    ship.maxHull     = data.maxHull;
    ship.shields     = data.shields;
    ship.maxShields  = data.maxShields;
    ship.shieldRate  = data.shieldRate;
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
    return ship;
  }
}

// ── Projectile ────────────────────────────────────────────────────
class Projectile {
  constructor(owner, weapon, tx, ty, target) {
    this.id = uid();
    this.owner = owner;
    this.weapon = weapon;
    this.isPlayer = owner.isPlayer;
    this.x = owner.x;
    this.y = owner.y;
    this.depth = owner.depth || 0;
    this.target = target; // for homing
    this.exploded = false;
    this.isDestroyed = false;
    this.lifetime = 6;

    const ang = angleToward(owner.x, owner.y, tx, ty);
    this.vx = Math.sin(ang) * weapon.pSpeed;
    this.vy = -Math.cos(ang) * weapon.pSpeed;
    this.angle = ang;

    this.radius = weapon.pSize || 4;
    this.color = weapon.pColor || weapon.color;
    this.exRadius = weapon.exRadius || 0;
    this.trackRate = weapon.trackRate || 0;
    this.dot = weapon.dot || null;
    this.scatter = weapon.scatter || 0;
  }

  update(dt, ships) {
    if (this.isDestroyed) return;
    this.lifetime -= dt;
    if (this.lifetime <= 0) { this.isDestroyed = true; return; }

    // Homing
    if (this.trackRate > 0 && this.target && !this.target.isDestroyed) {
      const targetAng = angleToward(this.x, this.y, this.target.x, this.target.y);
      let diff = normalizeAngle(targetAng - this.angle);
      this.angle += Math.sign(diff) * Math.min(Math.abs(diff), this.trackRate * dt);
      const spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
      this.vx = Math.sin(this.angle) * spd;
      this.vy = -Math.cos(this.angle) * spd;
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

// ── AI ────────────────────────────────────────────────────────────
// State machine AI with flanking, depth tactics, retreat, and focus fire.
function updateAI(ship, playerShips, dt) {
  ship.aiTimer -= dt;

  const alive = playerShips.filter(s => !s.isDestroyed);
  if (alive.length === 0) return;

  const hullPct    = ship.hull / ship.maxHull;
  const shieldPct  = ship.maxShields > 0 ? ship.shields / ship.maxShields : 1;
  const tplData    = ENEMY_TEMPLATES[ship.templateId];
  const prefDepth  = tplData ? (tplData.preferredDepth || 100) : 100;

  // Get max weapon range (ignoring EW)
  const primaryRange = ship.weapons.reduce((best, w) =>
    (w.type !== 'ew' && w.range > best) ? w.range : best, 300);

  // Retarget: prefer weakest + flagship + nearby + similar depth
  if (!ship.attackTarget || ship.attackTarget.isDestroyed || ship.aiTimer <= 0) {
    let best = null, bestScore = -Infinity;
    for (const ps of alive) {
      const distScore   = -dist(ship.x, ship.y, ps.x, ps.y) * 0.002;
      const weakScore   = (1 - ps.hull / ps.maxHull) * 180;
      const depthScore  = -Math.abs(ship.depth - ps.depth) * 0.4;
      const flagScore   = ps.isFlagship ? 60 : 0;
      const s = distScore + weakScore + depthScore + flagScore;
      if (s > bestScore) { bestScore = s; best = ps; }
    }
    ship.attackTarget = best;
  }

  const target = ship.attackTarget;
  if (!target) return;
  const d = dist(ship.x, ship.y, target.x, target.y);
  const depthGap = Math.abs(ship.depth - target.depth);

  // Helper: clamp move to world bounds
  const clampedMove = (tx, ty) => {
    ship.setMoveTarget(
      Math.max(120, Math.min(WORLD_W - 120, tx)),
      Math.max(120, Math.min(WORLD_H - 120, ty))
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
        clampedMove(ship.x + Math.sin(ang + juke)*280, ship.y - Math.cos(ang + juke)*280);
        ship.setDepthTarget(prefDepth + 150 + Math.random() * 100);
        break;
      }
      if (ship.aiState === 'dive') {
        // Deep approach: descend and rush from below
        ship.setDepthTarget(prefDepth + 120 + Math.random() * 80);
        clampedMove(target.x + (Math.random()-0.5)*80, target.y + (Math.random()-0.5)*80);
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
          ship.setDepthTarget(prefDepth + (Math.random()-0.5) * 80);
        }
      }
      break;
    }

    // ── AGGRESSIVE (Keth hunters / Shard slicers) ────────────────
    case 'aggressive': {
      if (ship.aiState === 'retreat') {
        // Damaged aggressor backs off while still firing
        const ang = angleToward(target.x, target.y, ship.x, ship.y);
        clampedMove(ship.x + Math.sin(ang)*320, ship.y - Math.cos(ang)*320);
        ship.setDepthTarget(Math.min(WORLD_DEPTH - 30, prefDepth + 180));
        break;
      }
      if (ship.aiTimer <= 0) {
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
            ship.x + Math.sin(ang)*200 + Math.sin(perp)*70,
            ship.y - Math.cos(ang)*200 - Math.cos(perp)*70
          );
          ship.aiTimer = 1.8 + Math.random();
        } else {
          // Strafe at optimal range — orbit direction reverses unpredictably
          const orbitDir = (Math.floor(ship.aiTimer * 10) % 2 === 0) ? 1 : -1;
          const perpAng = angleToward(ship.x, ship.y, target.x, target.y) + Math.PI/2 * orbitDir;
          clampedMove(
            ship.x + Math.sin(perpAng) * 140,
            ship.y - Math.cos(perpAng) * 140
          );
          ship.aiTimer = 1.0 + Math.random() * 0.8;
        }
        // Dive when shields are low to break line of sight
        if (shieldPct < 0.3) {
          ship.setDepthTarget(prefDepth + 120 + Math.random() * 80);
        } else {
          ship.setDepthTarget(prefDepth + (Math.random()-0.5) * 60);
        }
      }
      break;
    }

    // ── DEFENSIVE (Shard Fortress / Behemoth) ────────────────────
    case 'defensive': {
      if (ship.aiState === 'retreat') {
        // Fortress pulls back to max range and continues to fire
        const ang = angleToward(target.x, target.y, ship.x, ship.y);
        clampedMove(ship.x + Math.sin(ang)*350, ship.y - Math.cos(ang)*350);
        ship.setDepthTarget(Math.min(WORLD_DEPTH - 30, prefDepth + 120));
        break;
      }
      if (ship.aiTimer <= 0) {
        if (d > primaryRange * 1.2) {
          // Slowly advance — lure player to charge
          clampedMove(
            target.x + (Math.random()-0.5)*120,
            target.y + (Math.random()-0.5)*120
          );
          ship.aiTimer = 3.5 + Math.random() * 2.0;
        } else if (d < primaryRange * 0.48) {
          // Push them back
          const ang = angleToward(target.x, target.y, ship.x, ship.y);
          clampedMove(ship.x + Math.sin(ang)*200, ship.y - Math.cos(ang)*200);
          ship.aiTimer = 2.0 + Math.random();
        } else {
          // Hold and rotate — punishing fire arc
          const side = Math.sin(Date.now() * 0.0003 + ship.id) > 0 ? 1 : -1;
          const perpAng = angleToward(ship.x, ship.y, target.x, target.y) + Math.PI/2 * side;
          clampedMove(
            ship.x + Math.sin(perpAng) * 80,
            ship.y - Math.cos(perpAng) * 80
          );
          ship.aiTimer = 4.0 + Math.random() * 2.0;
        }
        ship.setDepthTarget(prefDepth + (Math.random()-0.5) * 40);
      }
      break;
    }

    // ── LEVIATHAN (ancient predator) ─────────────────────────────
    case 'leviathan': {
      if (ship.aiState === 'retreat') {
        // Wounded leviathans dive to the abyss and circle — they never truly flee
        ship.setDepthTarget(WORLD_DEPTH * 0.85);
        const circleAng = angleToward(ship.x, ship.y, target.x, target.y) + Math.PI * 0.6;
        clampedMove(ship.x + Math.sin(circleAng)*350, ship.y - Math.cos(circleAng)*350);
        break;
      }
      // Always prioritise flagship
      const flagship = alive.find(s => s.isFlagship);
      if (flagship) ship.attackTarget = flagship;

      if (ship.aiTimer <= 0) {
        if (d > primaryRange * 1.4) {
          // Dive and close from depth — ambush run
          ship.setDepthTarget(WORLD_DEPTH * 0.65 + Math.random() * 60);
          clampedMove(target.x + (Math.random()-0.5)*100, target.y + (Math.random()-0.5)*100);
          ship.aiTimer = 3.0 + Math.random() * 1.5;
        } else if (depthGap > 160) {
          // Surface to match target depth — the "rise from below" moment
          ship.setDepthTarget(target.depth + 20 + Math.random() * 40);
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
    this.moveMarker = null;   // {x, y, timer}

    // Spawn terrain
    this._generateTerrain();

    // Spawn player ships
    const playerStartX = 300, playerStartY = WORLD_H / 2;
    playerShipData.forEach((sd, i) => {
      const ship = Ship.fromSaveData(sd);
      if (!ship) return;
      ship.x = playerStartX + (Math.random() - 0.5) * 180;
      ship.y = playerStartY + (i - playerShipData.length / 2) * 120;
      ship.moveTargetX = ship.x;
      ship.moveTargetY = ship.y;
      ship.atTarget = true;
      this.playerShips.push(ship);
    });

    // Spawn enemies
    const scale = CAMPAIGN_CONFIG.difficulty[sectorIndex] || 1.0;
    const enemyStartX = WORLD_W - 300, enemyStartY = WORLD_H / 2;
    enemyTemplateIds.forEach((tid, i) => {
      const tpl = ENEMY_TEMPLATES[tid];
      if (!tpl) return;
      const enemy = new Ship({
        ...tpl,
        maxHull: Math.round(tpl.maxHull * scale),
        maxShields: Math.round(tpl.maxShields * scale),
      }, false, tpl.name);
      enemy.hull = enemy.maxHull;
      enemy.shields = enemy.maxShields;
      enemy.x = enemyStartX + (Math.random() - 0.5) * 200;
      enemy.y = enemyStartY + (i - enemyTemplateIds.length / 2) * 130;
      enemy.moveTargetX = enemy.x;
      enemy.moveTargetY = enemy.y;
      enemy.atTarget = true;
      enemy.aiTimer = Math.random() * 2;
      this.enemyShips.push(enemy);
    });

    // Ensure selected ship starts as flagship
    this.selectedShip = this.playerShips.find(s => s.isFlagship) || this.playerShips[0] || null;
  }

  _generateTerrain() {
    const count = 3 + Math.floor(Math.random() * 4);
    const types = ['island', 'island', 'kelp', 'vent'];
    for (let i = 0; i < count; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const td = TERRAIN_TYPES[type];
      // Avoid spawn zones
      let x, y, attempts = 0;
      do {
        x = 500 + Math.random() * (WORLD_W - 1000);
        y = 200 + Math.random() * (WORLD_H - 400);
        attempts++;
      } while (attempts < 20 && (x < 600 || x > WORLD_W - 600));
      this.terrain.push({ ...td, type, x, y, radius: td.radius * (0.7 + Math.random() * 0.6) });
    }
  }

  addProjectile(p) { this.projectiles.push(p); }

  addEffect(type, x, y, opts) {
    this.effects.push(new Effect(type, x, y, opts));
  }

  _fireWeapon(ship, weapon, target) {
    const enemies = ship.isPlayer ? this.enemyShips : this.playerShips;
    const allShips = [...this.playerShips, ...this.enemyShips];

    switch (weapon.type) {
      case 'projectile': {
        if (weapon.scatter && weapon.scatter > 1) {
          for (let i = 0; i < weapon.scatter; i++) {
            const jitterX = target.x + (Math.random()-0.5)*40;
            const jitterY = target.y + (Math.random()-0.5)*40;
            const p = new Projectile(ship, weapon, jitterX, jitterY, null);
            p.depth = ship.depth;
            this.projectiles.push(p);
          }
        } else {
          const p = new Projectile(ship, weapon, target.x, target.y, null);
          p.depth = ship.depth;
          this.projectiles.push(p);
        }
        weapon.timer = weapon.cd;
        this.addEffect('muzzle', ship.x, ship.y, { color: weapon.color, radius: 8, maxRadius: 8, duration: 0.1 });
        audio.play('shoot_plasma', 0.4);
        break;
      }
      case 'torpedo': {
        const p = new Projectile(ship, weapon, target.x, target.y, target);
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
        // Beam hit is processed each frame
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
          const d = new Drone(ship, ship.x + (Math.random()-0.5)*40, ship.y + (Math.random()-0.5)*40);
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
        const target = w.beamTarget;
        if (target.isDestroyed) { w.beamActive = false; w.recharging = true; w.timer = w.rechargeDur; continue; }
        const d = dist(ship.x, ship.y, target.x, target.y);
        if (d > w.range) { w.beamActive = false; w.recharging = true; w.timer = w.rechargeDur; continue; }
        const dmgPerTick = w.dmg * dt;
        const dmg = target.takeDamage(dmgPerTick, w.sdmg, w.hdmg);
        if (ship.isPlayer) this.stats.damageDone += dmg;
        else this.stats.damageTaken += dmg;
        // Beam effect
        this.addEffect('beam', ship.x, ship.y, { x2: target.x, y2: target.y, color: w.color, width: w.bWidth, duration: 0.07 });
      }
    }
  }

  _processCollisions() {
    const allShips = [...this.playerShips, ...this.enemyShips];
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (p.isDestroyed) continue;

      // Targets: enemy projectiles hit player ships and vice versa
      const targets = p.isPlayer ? this.enemyShips : this.playerShips;

      for (const ship of targets) {
        if (ship.isDestroyed) continue;
        const d = dist(p.x, p.y, ship.x, ship.y);
        if (d < ship.size + p.radius) {
          // Hit!
          const dmg = ship.takeDamage(p.weapon.dmg, p.weapon.sdmg || 1, p.weapon.hdmg || 1);
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
          this.addEffect('explosion', ship.x, ship.y, { color: ship.color, radius: 10, maxRadius: ship.size * 3, duration: 1.0 });
          this.addEffect('shockwave', ship.x, ship.y, { color: '#ffffff', radius: 5, maxRadius: ship.size * 4, duration: 0.8 });
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
    const flagship = this.playerShips.find(s => s.isFlagship);

    if (aliveEnemies.length === 0 && this.enemyShips.length > 0) {
      this.complete = true;
      this.result = 'win';
    } else if (!flagship || flagship.isDestroyed) {
      this.complete = true;
      this.result = 'loss';
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
      ship.update(dt, this.terrain);
      if (ship.isDestroyed) continue;

      // Auto-fire
      if (ship.attackTarget && !ship.attackTarget.isDestroyed) {
        for (const w of ship.weapons) {
          if (ship.canFireWeapon(w, ship.attackTarget)) {
            this._fireWeapon(ship, w, ship.attackTarget);
          }
        }
      }
    }

    // ── Update enemy ships ─────────────────────────────────────────
    for (const ship of this.enemyShips) {
      if (!ship.isDestroyed) {
        updateAI(ship, this.playerShips, dt);
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
  }

  _updateDetection(dt) {
    const playerAlive = this.playerShips.filter(s => !s.isDestroyed);

    // Sonar ping timers on player ships (generate ping events for renderer)
    for (const ps of playerAlive) {
      ps.sonarPingTimer -= dt;
      if (ps.sonarPingTimer <= 0) {
        ps.sonarPingTimer = SONAR_PING_INTERVAL;
        // Notify renderer via a ping event
        this.sonarPings = this.sonarPings || [];
        this.sonarPings.push({ x: ps.x, y: ps.y, depth: ps.depth, range: ps.detectRange, timer: 1.0 });
      }
    }
    // Decay ping timer list
    if (this.sonarPings) this.sonarPings = this.sonarPings.filter(p => p.timer > 0);

    for (const enemy of this.enemyShips) {
      if (enemy.isDestroyed) { enemy.detectionLevel = 0; continue; }

      let bestContact = 0, bestIdentify = 0;

      for (const ps of playerAlive) {
        // Depth penalty: harder to detect when enemy is much deeper
        const depthDiff = Math.abs(ps.depth - enemy.depth);
        const depthFactor = 1 - DETECT_DEPTH_PENALTY * (depthDiff / WORLD_DEPTH);
        // EW jamming reduces player's effective detect range
        const ewPenalty = (ps.ewJammedTimer > 0) ? 0.6 : 1.0;
        // Enemy stealth reduces detection range
        const stealthFactor = 1 - (enemy.stealthRating || 0) / 100;

        const effectiveRange = ps.detectRange * depthFactor * ewPenalty * stealthFactor;
        const d = dist(ps.x, ps.y, enemy.x, enemy.y);

        if (d < effectiveRange * DETECT_RANGE_CONTACT)  bestContact  = 1;
        if (d < effectiveRange * DETECT_RANGE_IDENTIFY) bestIdentify = 1;
      }

      // Detection only goes UP (never lose identification mid-combat once seen)
      const newLevel = bestIdentify ? 2 : bestContact ? 1 : 0;
      if (newLevel > enemy.detectionLevel) enemy.detectionLevel = newLevel;

      // If identified, AI can properly target; if only contact, AI uses approximate position
      // (full targeting is already possible once identified)
    }
  }

  // Input from game
  selectShip(ship) {
    if (ship && ship.isPlayer && !ship.isDestroyed) {
      this.selectedShip = ship;
    }
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
    for (const s of this.playerShips) {
      if (!s.isDestroyed) {
        s.moveTargetX = s.x;
        s.moveTargetY = s.y;
        s.atTarget = true;
      }
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
}
