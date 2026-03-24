'use strict';
// ================================================================
// DATA.JS — Game constants, ship templates, weapon stats, events
// ================================================================

const WORLD_W = 8000;
const WORLD_H = 6000;
const WORLD_DEPTH = 1200;  // max depth (seafloor)

// Radar/sonar detection
// DETECT_0: enemy becomes a CONTACT (blip visible, approximate position)
// DETECT_1: enemy is IDENTIFIED (full model visible, can be targeted by arc weapons)
// Depth penalty: deeper ships are harder to detect (halved at WORLD_DEPTH/2)
const DETECT_RANGE_CONTACT  = 1.6;  // multiplier on detectRange for contact
const DETECT_RANGE_IDENTIFY = 1.0;  // multiplier on detectRange for full ID
const DETECT_DEPTH_PENALTY  = 0.6;  // max range fraction lost when fully submerged
const SONAR_PING_INTERVAL   = 4.5;  // seconds between passive sonar pulses per ship
// Detection degradation
const DETECT_GRACE_PERIOD   = 4.0;  // seconds a contact stays visible after going out of range
const LAST_KNOWN_DURATION   = 10.0; // seconds a ghost marker persists after losing contact
const THERMAL_LAYER_DEPTH   = 480;  // meters — thermocline detection barrier
const THERMAL_LAYER_PENALTY = 0.55; // detection range multiplier when target is on other side
const VISUAL_RANGE         = 600;   // within this: always visible, accuracy 1.0
const COMMS_RANGE          = 3500;  // ship-to-ship datalink range
const PING_TRAVEL_SPEED    = 950;   // sonar ring expansion (units/s)
const PING_BASE_ACCURACY   = 0.55;  // base accuracy multiplier at mid-range
const CONTACT_DECAY_RATE   = 0.04;  // accuracy lost per second when no new data
// Active sonar pulse (player-triggered)
const ACTIVE_SONAR_RANGE    = 2050;  // detection radius for active ping
const ACTIVE_SONAR_COOLDOWN = 24;   // seconds between active pings
const ACTIVE_SONAR_EXPOSE   = 5.0;  // seconds pinging ship is easier to detect

// Hull polygon shapes (local space, pointing UP = forward, scaled by ship.size/20)
const HULL_SHAPES = {
  skiff:       [[0,-20],[8,10],[0,5],[-8,10]],
  cutter:      [[0,-20],[10,8],[7,18],[-7,18],[-10,8]],
  frigate:     [[0,-22],[11,-6],[14,12],[6,22],[-6,22],[-14,12],[-11,-6]],
  gunship:     [[0,-24],[16,-4],[16,16],[8,22],[-8,22],[-16,16],[-16,-4]],
  cruiser:     [[0,-26],[14,-12],[20,8],[14,22],[0,26],[-14,22],[-20,8],[-14,-12]],
  carrier:     [[0,-22],[20,-8],[26,14],[18,26],[-18,26],[-26,14],[-20,-8]],
  dreadnought: [[0,-32],[18,-18],[28,0],[26,18],[16,28],[0,32],[-16,28],[-26,18],[-28,0],[-18,-18]],
  // Starter-fleet unique shapes
  destroyer:[[0,-22],[9,-4],[11,10],[7,20],[-7,20],[-11,10],[-9,-4]], // escort destroyer
  recon:    [[0,-26],[5,4],[3,20],[-3,20],[-5,4]],            // needle-thin probe
  longbow:  [[0,-28],[7,-6],[10,8],[7,24],[-7,24],[-10,8],[-7,-6]], // lance hull
  spectre:  [[0,-22],[13,-5],[14,10],[0,20],[-14,10],[-13,-5]],      // wide delta
  // Enemy shapes
  keth_spore:  [[0,-14],[9,7],[0,12],[-9,7]],
  keth_hunter: [[0,-18],[11,4],[8,16],[-8,16],[-11,4]],
  keth_behemoth:[[0,-28],[18,0],[20,16],[10,24],[0,28],[-10,24],[-20,16],[-18,0]],
  shard_slicer:[[0,-18],[14,2],[10,18],[-10,18],[-14,2]],
  shard_fortress:[[0,-24],[18,-8],[22,10],[14,24],[0,26],[-14,24],[-22,10],[-18,-8]],
  leviathan_small:[[0,-34],[22,-12],[30,10],[24,30],[12,38],[0,40],[-12,38],[-24,30],[-30,10],[-22,-12]],
  leviathan_boss:[[0,-52],[32,-24],[46,8],[42,38],[22,56],[0,60],[-22,56],[-42,38],[-46,8],[-32,-24]],
};

const SHIP_TEMPLATES = {
  // ── PLAYER SHIPS ──────────────────────────────────────────────
  // slots: [{id, label, pos:{x,y}, facing, arc, weaponId}]
  //   pos  — ship-local 2D: +y=forward(bow), +x=starboard
  //   facing — angle offset from ship heading (0=fwd, PI/2=stbd, -PI/2=port, PI=aft)
  //   arc  — half-angle of fire cone from facing direction (PI = unrestricted)
  skiff: {
    id:'skiff', name:'Skiff', shipClass:'Scout',
    maxHull:80,
    armor:0, maxSpeed:150, accel:75, turnRate:3.0, size:16,
    depthRate:90, ewStrength:0, detectRange:1200, stealthRating:30,
    color:'#00e5ff', glowColor:'#00bcd4',
    weapons:['pulse_cannon'],
    slots:[
      { id:'s0', label:'Bow Gun',      pos:{x:0,  y:11}, facing:0,            arc:Math.PI*0.75, weaponId:'pulse_cannon' },
    ],
    cost:120, tier:1,
    desc:'Lightning-fast scout. Thin hull but unmatched speed. High stealth rating.'
  },
  cutter: {
    id:'cutter', name:'Cutter', shipClass:'Light Warship',
    maxHull:145,
    armor:2, maxSpeed:115, accel:51, turnRate:2.5, size:22,
    depthRate:72, ewStrength:0, detectRange:900, stealthRating:15,
    color:'#29b6f6', glowColor:'#0288d1',
    weapons:['pulse_cannon','pulse_cannon'],
    slots:[
      { id:'s0', label:'Port Cannon',  pos:{x:-13, y:0},  facing:-Math.PI/2,   arc:Math.PI*0.55, weaponId:'pulse_cannon' },
      { id:'s1', label:'Stbd Cannon',  pos:{x:13,  y:0},  facing:Math.PI/2,    arc:Math.PI*0.55, weaponId:'pulse_cannon' },
    ],
    cost:240, tier:2,
    desc:'Versatile light warship. Reliable workhorse of any fleet.'
  },
  frigate: {
    id:'frigate', name:'Frigate', shipClass:'Torpedo Frigate',
    maxHull:260,
    armor:5, maxSpeed:90, accel:38, turnRate:2.0, size:28,
    depthRate:58, ewStrength:10, detectRange:1050, stealthRating:10,
    color:'#1976d2', glowColor:'#1565c0',
    weapons:['particle_lance','vortex_torpedo'],
    slots:[
      { id:'s0', label:'Bow Lance',    pos:{x:0,  y:17},  facing:0,            arc:Math.PI*0.6,  weaponId:'particle_lance' },
      { id:'s1', label:'Torp Bay',     pos:{x:0,  y:-8},  facing:0,            arc:Math.PI,      weaponId:'vortex_torpedo' },
    ],
    cost:380, tier:3,
    desc:'Torpedo specialist. Devastating at medium range. Limited torpedo reserves.'
  },
  gunship: {
    id:'gunship', name:'Gunship', shipClass:'Heavy Gunship',
    maxHull:285,
    armor:9, maxSpeed:75, accel:30, turnRate:1.8, size:31,
    depthRate:44, ewStrength:5, detectRange:950, stealthRating:5,
    color:'#0d47a1', glowColor:'#1a237e',
    weapons:['heavy_cannon','pulse_cannon','pulse_cannon'],
    slots:[
      { id:'s0', label:'Main Battery', pos:{x:0,   y:19}, facing:0,            arc:Math.PI*0.55, weaponId:'heavy_cannon' },
      { id:'s1', label:'Port Gun',     pos:{x:-15, y:4},  facing:-Math.PI*0.45,arc:Math.PI*0.65, weaponId:'pulse_cannon' },
      { id:'s2', label:'Stbd Gun',     pos:{x:15,  y:4},  facing:Math.PI*0.45, arc:Math.PI*0.65, weaponId:'pulse_cannon' },
    ],
    cost:430, tier:3,
    desc:'Triple weapon battery. Superior firepower over durability.'
  },
  cruiser: {
    id:'cruiser', name:'Cruiser', shipClass:'Heavy Cruiser',
    maxHull:520,
    armor:13, maxSpeed:62, accel:22, turnRate:1.4, size:39,
    depthRate:48, ewStrength:20, detectRange:1300, stealthRating:0,
    color:'#3f51b5', glowColor:'#303f9f',
    weapons:['particle_lance','heavy_cannon','heavy_cannon','vortex_torpedo'],
    slots:[
      { id:'s0', label:'Bow Lance',    pos:{x:0,   y:24}, facing:0,            arc:Math.PI*0.6,  weaponId:'particle_lance' },
      { id:'s1', label:'Port Battery', pos:{x:-22, y:0},  facing:-Math.PI/2,   arc:Math.PI*0.55, weaponId:'heavy_cannon' },
      { id:'s2', label:'Stbd Battery', pos:{x:22,  y:0},  facing:Math.PI/2,    arc:Math.PI*0.55, weaponId:'heavy_cannon' },
      { id:'s3', label:'Torp Bay',     pos:{x:0,   y:-16},facing:0,            arc:Math.PI,      weaponId:'vortex_torpedo' },
    ],
    cost:680, tier:4,
    desc:'The backbone of any serious fleet. Balanced and powerful. EW suite included.'
  },
  carrier: {
    id:'carrier', name:'Carrier', shipClass:'Fleet Carrier',
    maxHull:500,
    armor:8, maxSpeed:49, accel:17, turnRate:1.2, size:45,
    depthRate:34, ewStrength:35, detectRange:1500, stealthRating:0,
    color:'#5c6bc0', glowColor:'#3949ab',
    weapons:['pulse_cannon','pulse_cannon','drone_launcher','ew_jammer'],
    slots:[
      { id:'s0', label:'Port Defense', pos:{x:-25, y:0},  facing:-Math.PI/2,   arc:Math.PI*0.7,  weaponId:'pulse_cannon' },
      { id:'s1', label:'Stbd Defense', pos:{x:25,  y:0},  facing:Math.PI/2,    arc:Math.PI*0.7,  weaponId:'pulse_cannon' },
      { id:'s2', label:'Drone Bay',    pos:{x:0,   y:-4}, facing:0,            arc:Math.PI,      weaponId:'drone_launcher' },
      { id:'s3', label:'EW Array',     pos:{x:0,   y:0},  facing:0,            arc:Math.PI,      weaponId:'ew_jammer' },
    ],
    cost:780, tier:4,
    desc:'Fleet command ship. Launches combat drones and provides electronic warfare support.'
  },
  dreadnought: {
    id:'dreadnought', name:'Dreadnought', shipClass:'Capital Ship',
    maxHull:1050,
    armor:22, maxSpeed:36, accel:13, turnRate:0.75, size:60,
    depthRate:22, ewStrength:15, detectRange:1450, stealthRating:0,
    color:'#7c4dff', glowColor:'#651fff',
    weapons:['plasma_driver','particle_lance','particle_lance','vortex_torpedo','vortex_torpedo'],
    slots:[
      { id:'s0', label:'Spinal Driver',pos:{x:0,   y:38}, facing:0,            arc:Math.PI*0.45, weaponId:'plasma_driver' },
      { id:'s1', label:'Port Lance',   pos:{x:-22, y:12}, facing:-Math.PI*0.35,arc:Math.PI*0.55, weaponId:'particle_lance' },
      { id:'s2', label:'Stbd Lance',   pos:{x:22,  y:12}, facing:Math.PI*0.35, arc:Math.PI*0.55, weaponId:'particle_lance' },
      { id:'s3', label:'Port Tubes',   pos:{x:-20, y:-16},facing:-Math.PI*0.65,arc:Math.PI*0.65, weaponId:'vortex_torpedo' },
      { id:'s4', label:'Stbd Tubes',   pos:{x:20,  y:-16},facing:Math.PI*0.65, arc:Math.PI*0.65, weaponId:'vortex_torpedo' },
    ],
    cost:1200, tier:5,
    desc:'Near-invincible, but ponderous. A weapon of last resort.'
  },

  destroyer: {
    id:'destroyer', name:'Destroyer', shipClass:'Escort Destroyer',
    maxHull:200,
    armor:10, maxSpeed:130, accel:58, turnRate:2.4, size:24,
    depthRate:70, ewStrength:0, detectRange:950, stealthRating:10,
    color:'#80deea', glowColor:'#00acc1',
    weapons:['ciws','ciws','pulse_cannon'],
    slots:[
      { id:'s0', label:'Port CIWS',   pos:{x:-11, y:7},  facing:-Math.PI/2,   arc:Math.PI,      weaponId:'ciws' },
      { id:'s1', label:'Stbd CIWS',   pos:{x:11,  y:7},  facing:Math.PI/2,    arc:Math.PI,      weaponId:'ciws' },
      { id:'s2', label:'Bow Gun',     pos:{x:0,   y:14}, facing:0,            arc:Math.PI*0.65, weaponId:'pulse_cannon' },
    ],
    cost:360, tier:3,
    desc:'Fast escort with twin CIWS point-defense turrets. Automatically intercepts incoming torpedoes and drones within 640m. A force-multiplier for any fleet facing torpedo threats.'
  },

  // ── Starter-fleet specialist hulls ─────────────────────────────
  recon: {
    id:'recon', name:'Recon', shipClass:'Deep Recon Probe',
    maxHull:65,
    armor:0, maxSpeed:190, accel:95, turnRate:3.8, size:14,
    depthRate:105, ewStrength:0, detectRange:2400, stealthRating:65,
    color:'#00e5ff', glowColor:'#00bcd4',
    weapons:['pulse_cannon'],
    slots:[
      { id:'s0', label:'Bow Gun',      pos:{x:0,  y:9},  facing:0,            arc:Math.PI*0.8,  weaponId:'pulse_cannon' },
    ],
    cost:160, tier:2,
    desc:'Extreme-range sensors and near-perfect stealth — but extremely fragile. Your eyes in the deep. Keep it away from combat.'
  },
  longbow: {
    id:'longbow', name:'Longbow', shipClass:'Artillery Escort',
    maxHull:210,
    armor:6, maxSpeed:78, accel:30, turnRate:1.7, size:26,
    depthRate:48, ewStrength:0, detectRange:620, stealthRating:0,
    color:'#ff9800', glowColor:'#e65100',
    weapons:['rail_driver','pulse_cannon'],
    slots:[
      { id:'s0', label:'Spinal Rail',  pos:{x:0,  y:16}, facing:0,            arc:Math.PI*0.22, weaponId:'rail_driver' },
      { id:'s1', label:'Def Cannon',   pos:{x:0,  y:-9}, facing:Math.PI,      arc:Math.PI*0.75, weaponId:'pulse_cannon' },
    ],
    cost:360, tier:3,
    desc:'Long-range kinetic artillery. Hits hard at extreme distance but is nearly blind — needs a spotter to be effective.'
  },
  spectre: {
    id:'spectre', name:'Spectre', shipClass:'EW Platform',
    maxHull:155,
    armor:2, maxSpeed:100, accel:44, turnRate:2.3, size:19,
    depthRate:65, ewStrength:65, detectRange:1100, stealthRating:45,
    color:'#9c27b0', glowColor:'#6a1b9a',
    weapons:['pulse_cannon','ew_jammer'],
    slots:[
      { id:'s0', label:'Bow Gun',      pos:{x:0,  y:12}, facing:0,            arc:Math.PI*0.75, weaponId:'pulse_cannon' },
      { id:'s1', label:'EW Array',     pos:{x:0,  y:0},  facing:0,            arc:Math.PI,      weaponId:'ew_jammer' },
    ],
    cost:290, tier:3,
    desc:'Electronic warfare specialist. Jams enemy targeting and disrupts their sonar. Lightly armed but very hard to detect. Protect it — its value is in its disruptive field.'
  },
};

const ENEMY_TEMPLATES = {
  keth_spore: {
    id:'keth_spore', name:"Keth'vari Spore", faction:'kethvari',
    maxHull:52,
    armor:0, maxSpeed:165, accel:87, turnRate:3.8, size:15,
    depthRate:100, preferredDepth:200, stealthRating:20,
    color:'#ff6d00', glowColor:'#ff3d00',
    weapons:['bio_sting'], ai:'swarm',
    xp:12, credits:18, shape:'keth_spore'
  },
  keth_hunter: {
    id:'keth_hunter', name:"Keth'vari Hunter", faction:'kethvari',
    maxHull:145,
    armor:2, maxSpeed:122, accel:59, turnRate:2.6, size:21,
    depthRate:82, preferredDepth:325, stealthRating:15,
    color:'#e64a19', glowColor:'#bf360c',
    weapons:['bio_sting','acid_torpedo'], ai:'aggressive',
    xp:28, credits:50, shape:'keth_hunter'
  },
  keth_behemoth: {
    id:'keth_behemoth', name:"Keth'vari Behemoth", faction:'kethvari',
    maxHull:490,
    armor:11, maxSpeed:49, accel:17, turnRate:1.0, size:51,
    depthRate:52, preferredDepth:250, stealthRating:0,
    color:'#c62828', glowColor:'#b71c1c',
    weapons:['bio_sting','bio_sting','acid_torpedo'], ai:'defensive',
    xp:110, credits:220, shape:'keth_behemoth'
  },
  shard_slicer: {
    id:'shard_slicer', name:'Shard Slicer', faction:'shard',
    maxHull:135,
    armor:5, maxSpeed:99, accel:43, turnRate:2.2, size:19,
    depthRate:58, preferredDepth:100, stealthRating:0, ewDefense:25,
    color:'#ce93d8', glowColor:'#ab47bc',
    weapons:['crystal_beam'], ai:'aggressive',
    xp:32, credits:65, shape:'shard_slicer'
  },
  shard_fortress: {
    id:'shard_fortress', name:'Shard Fortress', faction:'shard',
    maxHull:455,
    armor:16, maxSpeed:33, accel:13, turnRate:0.95, size:45,
    depthRate:28, preferredDepth:150, stealthRating:0, ewDefense:50,
    color:'#9c27b0', glowColor:'#7b1fa2',
    weapons:['crystal_beam','crystal_beam','prism_burst'], ai:'defensive',
    xp:130, credits:260, shape:'shard_fortress'
  },
  leviathan_young: {
    id:'leviathan_young', name:'Young Leviathan', faction:'leviathan',
    maxHull:585,
    armor:22, maxSpeed:67, accel:25, turnRate:1.4, size:57,
    depthRate:38, preferredDepth:800, stealthRating:0,
    color:'#00e676', glowColor:'#00c853',
    weapons:['tentacle_strike','sonic_pulse'], ai:'leviathan',
    xp:220, credits:0, shape:'leviathan_small'
  },
  leviathan_alpha: {
    id:'leviathan_alpha', name:'Alpha Leviathan', faction:'leviathan',
    maxHull:1430,
    armor:35, maxSpeed:49, accel:16, turnRate:0.9, size:93,
    depthRate:18, preferredDepth:1050, stealthRating:0,
    color:'#00e676', glowColor:'#69f0ae',
    weapons:['tentacle_strike','tentacle_strike','sonic_pulse','depth_charge'], ai:'leviathan',
    xp:600, credits:0, shape:'leviathan_boss'
  },
};

const WEAPON_DATA = {
  // ── Player weapons ─────────────────────────────────────────────
  pulse_cannon:   { name:'Pulse Cannon',   type:'projectile', dmg:14, sdmg:1.0, hdmg:1.0, range:900,  cd:2.2, pSpeed:1150, pSize:10, pColor:'#00e5ff', color:'#00e5ff' },
  particle_lance: { name:'Particle Lance', type:'beam',       dmg:9,  sdmg:0.8, hdmg:1.3, range:1150, cd:0.08, beamDur:2.2, rechargeDur:4.5, bWidth:3, color:'#ff6e40', arc: Math.PI * 0.6 },
  heavy_cannon:   { name:'Heavy Cannon',   type:'projectile', dmg:40, sdmg:0.8, hdmg:1.5, range:1025, cd:5.0, pSpeed:850,  pSize:20, pColor:'#ffa726', color:'#ffa726', arc: Math.PI * 0.55 },
  vortex_torpedo: { name:'Vortex Torpedo', type:'torpedo',    dmg:90, sdmg:0.5, hdmg:2.2, range:1550, cd:13.0, pSpeed:300,  pSize:22, pColor:'#ff7043', exRadius:162, trackRate:1.6, maxAmmo:6, color:'#ff7043' },
  ciws:           { name:'CIWS',           type:'ciws',       dmg:22, sdmg:1.0, hdmg:1.0, range:640,  cd:0.45, pSpeed:1500, pSize:5,  pColor:'#ffee58', exRadius:90, trackRate:3.5, proximityFuze:60, color:'#ffee58' },
  plasma_driver:  { name:'Plasma Driver',  type:'projectile', dmg:110,sdmg:1.2, hdmg:1.2, range:1275, cd:8.5, pSpeed:725,  pSize:35, pColor:'#e040fb', exRadius:112, color:'#e040fb', arc: Math.PI * 0.45 },
  drone_launcher: { name:'Drone Bay',      type:'drone',      droneDmg:18, droneHull:35, droneSpeed:650, range:1300, cd:18.0, maxDrones:3, color:'#40c4ff' },
  // Electronic warfare — reduces enemy accuracy & weapon range
  rail_driver:    { name:'Rail Driver',    type:'projectile', dmg:72, sdmg:0.8, hdmg:1.8, range:3000, cd:8.0, pSpeed:1800, pSize:12, pColor:'#ff9800', color:'#ff9800', arc: Math.PI * 0.22 },
  ew_jammer:      { name:'EW Jammer',      type:'ew',         ewRadius:1250, ewStrength:40, cd:0, color:'#76ff03' },
  // ── Enemy weapons ──────────────────────────────────────────────
  bio_sting:      { name:"Bio-Sting",      type:'projectile', dmg:11, sdmg:1.6, hdmg:0.7, range:725,  cd:1.6, pSpeed:1300, pSize:10, pColor:'#ff9100', color:'#ff9100' },
  acid_torpedo:   { name:'Acid Torpedo',   type:'torpedo',    dmg:55, sdmg:0.3, hdmg:2.8, range:1150, cd:16.0, pSpeed:275,  pSize:17, pColor:'#aeea00', exRadius:0, trackRate:1.2, maxAmmo:5, dot:{dmg:5,dur:5,tick:1}, color:'#aeea00' },
  crystal_beam:   { name:'Crystal Beam',   type:'beam',       dmg:17, sdmg:1.6, hdmg:0.6, range:975,  cd:0.08, beamDur:1.4, rechargeDur:2.6, bWidth:2, color:'#ea80fc' },
  prism_burst:    { name:'Prism Burst',    type:'projectile', dmg:28, sdmg:2.2, hdmg:0.4, range:825,  cd:6.5, pSpeed:1550, pSize:15, pColor:'#ff4081', scatter:4, color:'#ff4081' },
  tentacle_strike:{ name:'Tentacle Strike',type:'melee',      dmg:65, sdmg:0.3, hdmg:3.2, range:275,  cd:2.2, color:'#69f0ae' },
  sonic_pulse:    { name:'Sonic Pulse',    type:'aoe',        dmg:35, sdmg:1.0, hdmg:1.0, range:775,  cd:5.5, exRadius:400, color:'#b9f6ca' },
  depth_charge:   { name:'Depth Charge',   type:'torpedo',    dmg:130,sdmg:0.8, hdmg:1.6, range:1050, cd:13.0, pSpeed:362, pSize:27, pColor:'#69f0ae', exRadius:262, trackRate:0.8, maxAmmo:4, color:'#69f0ae' },
};

// ── Ship module slots by template ─────────────────────────────────
// [weapon, defense, system] slot counts
const MODULE_SLOTS = {
  skiff:       { weapon:1, defense:1, system:1 },
  destroyer:   { weapon:1, defense:2, system:2 },
  cutter:      { weapon:2, defense:1, system:1 },
  frigate:     { weapon:2, defense:2, system:1 },
  gunship:     { weapon:3, defense:2, system:1 },
  cruiser:     { weapon:3, defense:2, system:2 },
  carrier:     { weapon:2, defense:2, system:3 },
  dreadnought: { weapon:4, defense:3, system:2 },
  recon:       { weapon:1, defense:1, system:2 },
  longbow:     { weapon:2, defense:1, system:1 },
  spectre:     { weapon:1, defense:2, system:2 },
};

// Max fleet size
const MAX_FLEET_SIZE = 5;

// ── Ship modules (equippable, permanent once bought) ───────────────
const MODULE_DATA = {
  // ── Weapon modules ─────────────────────────────────────────────
  railgun:      { id:'railgun',      category:'weapon',  name:'Railgun Battery',      desc:'Adds a heavy cannon with frontal firing arc.',             cost:280, icon:'⦿',
    apply(s){ s.weapons.push(Object.assign({}, WEAPON_DATA.heavy_cannon,  { timer:0, arc: Math.PI*0.55 })); } },
  torp_rack:    { id:'torp_rack',    category:'weapon',  name:'Torpedo Rack',          desc:'Adds 1 vortex torpedo launcher (6 shots).',               cost:320, icon:'⦾',
    apply(s){ s.weapons.push(Object.assign({}, WEAPON_DATA.vortex_torpedo,{ timer:0, ammo:6 })); } },
  pulse_array:  { id:'pulse_array',  category:'weapon',  name:'Pulse Array',           desc:'Adds 2 pulse cannons (free-rotating turrets).',            cost:180, icon:'◉',
    apply(s){ s.weapons.push(Object.assign({},WEAPON_DATA.pulse_cannon,{timer:0})); s.weapons.push(Object.assign({},WEAPON_DATA.pulse_cannon,{timer:0})); } },
  lance_emitter:{ id:'lance_emitter',category:'weapon',  name:'Particle Lance Emitter',desc:'Adds a particle lance beam with forward arc.',             cost:350, icon:'⟿',
    apply(s){ s.weapons.push(Object.assign({},WEAPON_DATA.particle_lance, { timer:0, beamActive:false, recharging:false, arc:Math.PI*0.6 })); } },
  drone_bay:    { id:'drone_bay',    category:'weapon',  name:'Combat Drone Bay',      desc:'Adds a drone launcher (3 combat drones).',                cost:380, icon:'⬡',
    apply(s){ s.weapons.push(Object.assign({},WEAPON_DATA.drone_launcher, { timer:0, droneCount:0 })); } },
  // ── Defense modules ────────────────────────────────────────────
  ciws_mount:   { id:'ciws_mount',   category:'weapon',  name:'CIWS Turret',            desc:'Adds automated point-defense: auto-intercepts torpedoes & drones within 640m.', cost:260, icon:'⊛',
    apply(s){ s.weapons.push(Object.assign({}, WEAPON_DATA.ciws, { timer:0 })); } },
  hull_refit:   { id:'hull_refit',   category:'defense', name:'Reinforced Hull',        desc:'+120 max hull, +8 armor.',                                cost:220, icon:'◈',
    apply(s){ s.maxHull+=120; s.hull=Math.min(s.hull+30, s.maxHull); s.armor+=8; } },
  reactive_plating:{ id:'reactive_plating',category:'defense',name:'Reactive Plating', desc:'+16 armor. Heavy — -10% speed.',                          cost:160, icon:'⧫',
    apply(s){ s.armor+=16; s.maxSpeed=Math.round(s.maxSpeed*0.9); } },
  ablative_coat:{ id:'ablative_coat',category:'defense', name:'Ablative Coating',       desc:'+50 hull, +6 armor.',                                     cost:190, icon:'◆',
    apply(s){ s.maxHull+=50; s.hull=Math.min(s.hull+50,s.maxHull); s.armor+=6; } },
  // ── System modules ─────────────────────────────────────────────
  sensor_suite: { id:'sensor_suite', category:'system',  name:'Advanced Sensor Suite',  desc:'+220 detection range, +20% sonar ping frequency.',        cost:260, icon:'◈',
    apply(s){ s.detectRange+=220; } },
  ew_disruptor: { id:'ew_disruptor', category:'system',  name:'EW Disruptor Pod',        desc:'+30 EW strength; jams enemy targeting at range.',         cost:280, icon:'⚡',
    apply(s){ s.ewStrength+=30; } },
  repair_nanites:{ id:'repair_nanites',category:'system',name:'Repair Nanites',          desc:'Regenerates 6 hull/s during combat.',                     cost:320, icon:'⊕',
    apply(s){ s.hullRegen=(s.hullRegen||0)+6; } },
  stealth_hull: { id:'stealth_hull', category:'system',  name:'Stealth Hull Coating',    desc:'+50 stealth — much harder for enemy sonar to detect.',    cost:200, icon:'◌',
    apply(s){ s.stealthRating=(s.stealthRating||0)+50; } },
  deep_dive:    { id:'deep_dive',    category:'system',  name:'Deep Dive Systems',       desc:'+100 depth rate, sonar effective at all depths.',          cost:180, icon:'▼',
    apply(s){ s.depthRate+=40; } },
};

// ── Recruitable ships (available in store) ────────────────────────
const RECRUITABLE_SHIPS = [
  { templateId:'skiff',       baseName:'INS', cost:140 },
  { templateId:'recon',       baseName:'INS', cost:180 },
  { templateId:'cutter',      baseName:'INS', cost:260 },
  { templateId:'spectre',     baseName:'INS', cost:310 },
  { templateId:'destroyer',   baseName:'INS', cost:380 },
  { templateId:'longbow',     baseName:'INS', cost:380 },
  { templateId:'frigate',     baseName:'INS', cost:400 },
  { templateId:'gunship',     baseName:'INS', cost:460 },
  { templateId:'cruiser',     baseName:'INS', cost:720 },
];
// Ship name pools for recruited ships
const SHIP_NAME_POOL = [
  'Ardent','Valor','Defiant','Resolute','Stalwart','Tempest','Vanguard',
  'Intrepid','Dauntless','Invictus','Ironclad','Relentless','Vigilance',
  'Bastion','Harbinger','Nemesis','Rampart','Sentinel','Spectre','Typhoon',
];

const UPGRADE_POOL = [
  { id:'hull_plate',    name:'Hull Plating',       desc:'+60 max hull, +5 hull restored',   cost:110, apply:(s)=>{ s.maxHull+=60; s.hull=Math.min(s.hull+5,s.maxHull); } },
  { id:'engine_boost',  name:'Engine Overcharge',  desc:'+25% max speed',                    cost:170, apply:(s)=>{ s.maxSpeed=Math.round(s.maxSpeed*1.25); } },
  { id:'armor_weave',   name:'Nano-Armor Weave',   desc:'+6 armor (reduces all damage)',     cost:125, apply:(s)=>{ s.armor+=6; } },
  { id:'targeting_sys', name:'Targeting System',   desc:'+25% weapon range',                 cost:185, apply:(s)=>{ s.weapons.forEach(w=>{ w.range*=1.25; }); } },
  { id:'reload_mech',   name:'Rapid Reload',       desc:'-20% weapon cooldown',              cost:200, apply:(s)=>{ s.weapons.forEach(w=>{ w.cd*=0.80; }); } },
  { id:'patch_kit',     name:'Field Repair',       desc:'Restore 80 hull',                   cost:70,  apply:(s)=>{ s.hull=Math.min(s.hull+80,s.maxHull); }, consumable:true },
];

const EVENTS = [
  {
    id:'derelict', title:'Derelict Vessel',
    desc:"Your sensors sweep an abandoned colony-era ship, half-submerged and barnacled with alien growth. Its drive core might still be intact.",
    choices:[
      { text:'Board and salvage',       outcome:(c)=>{ const g=80+Math.floor(Math.random()*100); c.credits+=g; return `Salvage yields ${g} credits worth of rare alloys.`; } },
      { text:'Scan remotely',           outcome:(c)=>{ c.intel=(c.intel||0)+1; return 'Scan data reveals patrol routes for this sector. Combat intel upgraded.'; } },
      { text:'Leave it',                outcome:()=>'You press on. Someone else can have the scraps.' },
    ]
  },
  {
    id:'thermal', title:'Thermal Vent Field',
    desc:"The ocean boils with superheated vents. Crystalline formations rise from the water, humming with geothermal energy.",
    choices:[
      { text:'Tap the energy',  outcome:(c)=>{ if(Math.random()<0.65){ c.credits+=55; return 'Energy harvesters fill the capacitors. +55 credits.'; } const s=c.playerFleet[0]; if(s)s.hull=Math.max(1,s.hull-25); return 'A vent erupts! Flagship takes 25 hull damage.'; } },
      { text:'Harvest crystals',outcome:(c)=>{ const r=Math.random(); if(r<0.35){ c.credits+=180; return 'Rare crystals! +180 credits.'; } return 'The crystals are inert. Not worth the risk.'; } },
      { text:'Navigate around', outcome:(c)=>{ c.threat=(c.threat||0)+1; return 'You detour safely but lose time. Enemy threat increases.'; } },
    ]
  },
  {
    id:'survivor', title:"Keth'vari Signal",
    desc:"A lone Keth'vari ship broadcasts a repeating signal — different from the usual attack patterns. Its bio-lights pulse in unfamiliar colors.",
    choices:[
      { text:'Hail it',        outcome:(c)=>{ if(Math.random()<0.5){ c.kethTruce=true; return "It responds! The Keth'vari grant safe passage for this sector."; } return "No response. The ship drifts away."; } },
      { text:'Destroy it',     outcome:(c)=>{ c.credits+=35; return 'You harvest its bio-matter. +35 credits.'; } },
      { text:'Ignore it',      outcome:()=>'It fades from sensors. A mystery for another day.' },
    ]
  },
  {
    id:'storm', title:'Electromagnetic Storm',
    desc:"A massive storm cell crackles with alien lightning. Your sensors go haywire. Through the interference you see three possible choices.",
    choices:[
      { text:'Push through',   outcome:(c)=>{ const hits=1+Math.floor(Math.random()*2); c.playerFleet.slice(0,hits).forEach(s=>{ s.hull=Math.max(1,s.hull-20); }); return `Storm batters ${hits} ship(s) for 20 hull each.`; } },
      { text:'Wait it out',    outcome:(c)=>{ c.playerFleet.forEach(s=>s.hull=Math.min(s.hull+25,s.maxHull)); return 'Crews perform maintenance while waiting. All ships +25 hull.'; } },
      { text:'Find a route',   outcome:(c)=>{ c.threat=(c.threat||0)+1; return 'Safe route costs time. Enemy patrols advance. Threat +1.'; } },
    ]
  },
  {
    id:'trader', title:'Independent Trader',
    desc:"A weathered freighter hails you on a civilian frequency. 'Got goods, captain. No questions asked.'",
    choices:[
      { text:'Trade openly',   outcome:(c)=>{ c.shopBonus=true; return 'They offer their full inventory. Store access granted next node.'; } },
      { text:'Demand tribute', outcome:(c)=>{ if(Math.random()<0.6){ c.credits+=160; return 'They comply. +160 credits.'; } return 'They dive into the depths before you can act.'; } },
      { text:'Ignore them',    outcome:()=>"You don't trust traders in deep water." },
    ]
  },
  {
    id:'ruins', title:'Sunken Ruins',
    desc:"Sonar reveals vast pre-collapse structures below — far older than any human settlement. Lights still glow in the deep.",
    choices:[
      { text:'Send a probe',   outcome:(c)=>{ if(Math.random()<0.7){ c.credits+=130; return 'The probe retrieves ancient tech schematics. +130 credits.'; } return 'The probe goes dark. Lost to the deep.'; } },
      { text:'Mark for later', outcome:(c)=>{ c.intel=(c.intel||0)+2; return 'Coordinates logged. Intel +2.'; } },
      { text:'Leave it',       outcome:()=>'Some things should stay buried.' },
    ]
  },
];

const CAMPAIGN_CONFIG = {
  sectors: 3,
  startCredits: 400,
  sectorNames: ['The Shallows', 'The Meridian Drift', 'The Abyssal Gate'],
  sectorFactions: ['kethvari', 'shard', 'leviathan'],
  difficulty: [1.0, 1.55, 2.3],
  enemyCounts: [[2,4],[3,6],[4,7]],
  bosses: [
    { name:"The Spawning Tide", desc:"A Keth'vari Behemoth surrounded by its spawn.", faction:'kethvari',
      enemies:['keth_behemoth','keth_hunter','keth_hunter','keth_spore','keth_spore','keth_spore'] },
    { name:"The Crystal Cathedral", desc:"A Shard Collective fortress node with devastating shields.", faction:'shard',
      enemies:['shard_fortress','shard_fortress','shard_slicer','shard_slicer','shard_slicer'] },
    { name:"The Abyssal God", desc:"An Alpha Leviathan of incomprehensible scale awakened by your passage.", faction:'leviathan',
      enemies:['leviathan_alpha','leviathan_young','leviathan_young'] },
  ],
};

const STARTING_FLEET = [
  // Role is visible in shipClass — each ship fills a distinct niche
  { templateId:'cruiser', name:'INS Heraklion', isFlagship:true },  // Capital — backbone
  { templateId:'recon',   name:'INS Argos'   },                     // Recon   — eyes of the fleet
  { templateId:'longbow', name:'INS Hades'   },                     // Sniper  — hits hard, can't see
  { templateId:'frigate', name:'INS Harpoon' },                     // Torpedo — close-range finisher
  { templateId:'spectre', name:'INS Ghost'   },                     // EW      — jams and hides
];

const NODE_TYPES = {
  COMBAT:  { label:'⚔',  name:'Combat',     color:'#ef5350', desc:'Enemy encounter' },
  ELITE:   { label:'☠',  name:'Elite',      color:'#ff7043', desc:'Powerful enemy — greater rewards' },
  EVENT:   { label:'?',  name:'Event',      color:'#ffa726', desc:'Random event with choices' },
  STORE:   { label:'$',  name:'Supply',     color:'#66bb6a', desc:'Spend credits on upgrades' },
  REST:    { label:'✚',  name:'Rest Buoy',  color:'#42a5f5', desc:'Repair your fleet' },
  BOSS:    { label:'★',  name:'Sector Boss',color:'#ff1744', desc:'Defeat to advance' },
  START:   { label:'▶',  name:'Start',      color:'#00e5ff', desc:'Sector entry point' },
};

// Terrain obstacle definitions (generated per combat)
const TERRAIN_TYPES = {
  island:       { radius:200, color:'#263238', borderColor:'#455a64', slow:false, damage:false, blocking:true },
  kelp:         { radius:150, color:'rgba(27,94,32,0.4)', borderColor:'rgba(46,125,50,0.6)', slow:true, damage:false, blocking:false },
  vent:         { radius:100, color:'rgba(183,28,28,0.3)', borderColor:'rgba(229,57,53,0.6)', slow:false, damage:true, damageRate:8, blocking:false },
  algae_bloom:  { radius:380, slow:false, damage:false, blocking:false, sensorMult:0.38 }, // heavily reduces sensor range
};

// ── Fleet Builder ─────────────────────────────────────────────────
const FLEET_BUILDER_BUDGET = 1600; // total points to spend

// Ships available in fleet builder (subset with costs + descriptions)
const FLEET_BUILDER_SHIPS = [
  { templateId:'skiff',       cost:120,  minCount:0, maxCount:3 },
  { templateId:'recon',       cost:160,  minCount:0, maxCount:2 },
  { templateId:'cutter',      cost:240,  minCount:0, maxCount:3 },
  { templateId:'spectre',     cost:290,  minCount:0, maxCount:2 },
  { templateId:'destroyer',   cost:360,  minCount:0, maxCount:2 },
  { templateId:'longbow',     cost:360,  minCount:0, maxCount:2 },
  { templateId:'frigate',     cost:380,  minCount:0, maxCount:2 },
  { templateId:'gunship',     cost:430,  minCount:0, maxCount:2 },
  { templateId:'cruiser',     cost:680,  minCount:0, maxCount:1 },
  { templateId:'carrier',     cost:780,  minCount:0, maxCount:1 },
  { templateId:'dreadnought', cost:1200, minCount:0, maxCount:1 },
];
