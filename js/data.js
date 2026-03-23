'use strict';
// ================================================================
// DATA.JS — Game constants, ship templates, weapon stats, events
// ================================================================

const WORLD_W = 3200;
const WORLD_H = 2400;
const WORLD_DEPTH = 500;  // max depth (seafloor)

// Radar/sonar detection
// DETECT_0: enemy becomes a CONTACT (blip visible, approximate position)
// DETECT_1: enemy is IDENTIFIED (full model visible, can be targeted by arc weapons)
// Depth penalty: deeper ships are harder to detect (halved at WORLD_DEPTH/2)
const DETECT_RANGE_CONTACT  = 1.6;  // multiplier on detectRange for contact
const DETECT_RANGE_IDENTIFY = 1.0;  // multiplier on detectRange for full ID
const DETECT_DEPTH_PENALTY  = 0.6;  // max range fraction lost when fully submerged
const SONAR_PING_INTERVAL   = 4.5;  // seconds between sonar pulses per ship

// Hull polygon shapes (local space, pointing UP = forward, scaled by ship.size/20)
const HULL_SHAPES = {
  skiff:       [[0,-20],[8,10],[0,5],[-8,10]],
  cutter:      [[0,-20],[10,8],[7,18],[-7,18],[-10,8]],
  frigate:     [[0,-22],[11,-6],[14,12],[6,22],[-6,22],[-14,12],[-11,-6]],
  gunship:     [[0,-24],[16,-4],[16,16],[8,22],[-8,22],[-16,16],[-16,-4]],
  cruiser:     [[0,-26],[14,-12],[20,8],[14,22],[0,26],[-14,22],[-20,8],[-14,-12]],
  carrier:     [[0,-22],[20,-8],[26,14],[18,26],[-18,26],[-26,14],[-20,-8]],
  dreadnought: [[0,-32],[18,-18],[28,0],[26,18],[16,28],[0,32],[-16,28],[-26,18],[-28,0],[-18,-18]],
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
  skiff: {
    id:'skiff', name:'Skiff', shipClass:'Scout',
    maxHull:45, maxShields:25, shieldRate:6, shieldDelay:3,
    armor:0, maxSpeed:190, accel:95, turnRate:3.0, size:11,
    depthRate:90, ewStrength:0, detectRange:480, stealthRating:30,
    color:'#00e5ff', glowColor:'#00bcd4',
    weapons:['pulse_cannon'],
    cost:120, tier:1,
    desc:'Lightning-fast scout. Thin hull but unmatched speed. High stealth rating.'
  },
  cutter: {
    id:'cutter', name:'Cutter', shipClass:'Light Warship',
    maxHull:85, maxShields:45, shieldRate:9, shieldDelay:4,
    armor:2, maxSpeed:145, accel:65, turnRate:2.5, size:15,
    depthRate:70, ewStrength:0, detectRange:360, stealthRating:15,
    color:'#29b6f6', glowColor:'#0288d1',
    weapons:['pulse_cannon','pulse_cannon'],
    cost:240, tier:2,
    desc:'Versatile light warship. Reliable workhorse of any fleet.'
  },
  frigate: {
    id:'frigate', name:'Frigate', shipClass:'Torpedo Frigate',
    maxHull:155, maxShields:85, shieldRate:11, shieldDelay:5,
    armor:5, maxSpeed:115, accel:48, turnRate:2.0, size:19,
    depthRate:60, ewStrength:10, detectRange:420, stealthRating:10,
    color:'#1976d2', glowColor:'#1565c0',
    weapons:['particle_lance','vortex_torpedo'],
    cost:380, tier:3,
    desc:'Torpedo specialist. Devastating at medium range. Limited torpedo reserves.'
  },
  gunship: {
    id:'gunship', name:'Gunship', shipClass:'Heavy Gunship',
    maxHull:185, maxShields:65, shieldRate:8, shieldDelay:6,
    armor:9, maxSpeed:95, accel:38, turnRate:1.8, size:21,
    depthRate:45, ewStrength:5, detectRange:380, stealthRating:5,
    color:'#0d47a1', glowColor:'#1a237e',
    weapons:['heavy_cannon','pulse_cannon','pulse_cannon'],
    cost:430, tier:3,
    desc:'Triple weapon battery. Superior firepower over durability.'
  },
  cruiser: {
    id:'cruiser', name:'Cruiser', shipClass:'Heavy Cruiser',
    maxHull:310, maxShields:160, shieldRate:16, shieldDelay:6,
    armor:13, maxSpeed:78, accel:28, turnRate:1.4, size:26,
    depthRate:50, ewStrength:20, detectRange:520, stealthRating:0,
    color:'#3f51b5', glowColor:'#303f9f',
    weapons:['particle_lance','heavy_cannon','heavy_cannon','vortex_torpedo'],
    cost:680, tier:4,
    desc:'The backbone of any serious fleet. Balanced and powerful. EW suite included.'
  },
  carrier: {
    id:'carrier', name:'Carrier', shipClass:'Fleet Carrier',
    maxHull:260, maxShields:210, shieldRate:22, shieldDelay:5,
    armor:8, maxSpeed:62, accel:22, turnRate:1.2, size:30,
    depthRate:35, ewStrength:35, detectRange:600, stealthRating:0,
    color:'#5c6bc0', glowColor:'#3949ab',
    weapons:['pulse_cannon','pulse_cannon','drone_launcher','ew_jammer'],
    cost:780, tier:4,
    desc:'Fleet command ship. Launches combat drones and provides electronic warfare support.'
  },
  dreadnought: {
    id:'dreadnought', name:'Dreadnought', shipClass:'Capital Ship',
    maxHull:620, maxShields:320, shieldRate:28, shieldDelay:8,
    armor:22, maxSpeed:46, accel:16, turnRate:0.75, size:40,
    depthRate:25, ewStrength:15, detectRange:580, stealthRating:0,
    color:'#7c4dff', glowColor:'#651fff',
    weapons:['plasma_driver','particle_lance','particle_lance','vortex_torpedo','vortex_torpedo'],
    cost:1200, tier:5,
    desc:'Near-invincible, but ponderous. A weapon of last resort.'
  },
};

const ENEMY_TEMPLATES = {
  keth_spore: {
    id:'keth_spore', name:"Keth'vari Spore", faction:'kethvari',
    maxHull:32, maxShields:12, shieldRate:3, shieldDelay:3,
    armor:0, maxSpeed:210, accel:110, turnRate:3.8, size:10,
    depthRate:100, preferredDepth:80, stealthRating:20,
    color:'#ff6d00', glowColor:'#ff3d00',
    weapons:['bio_sting'], ai:'swarm',
    xp:12, credits:18, shape:'keth_spore'
  },
  keth_hunter: {
    id:'keth_hunter', name:"Keth'vari Hunter", faction:'kethvari',
    maxHull:90, maxShields:35, shieldRate:5, shieldDelay:4,
    armor:2, maxSpeed:155, accel:75, turnRate:2.6, size:14,
    depthRate:85, preferredDepth:130, stealthRating:15,
    color:'#e64a19', glowColor:'#bf360c',
    weapons:['bio_sting','acid_torpedo'], ai:'aggressive',
    xp:28, credits:50, shape:'keth_hunter'
  },
  keth_behemoth: {
    id:'keth_behemoth', name:"Keth'vari Behemoth", faction:'kethvari',
    maxHull:320, maxShields:90, shieldRate:11, shieldDelay:6,
    armor:11, maxSpeed:62, accel:22, turnRate:1.0, size:34,
    depthRate:55, preferredDepth:100, stealthRating:0,
    color:'#c62828', glowColor:'#b71c1c',
    weapons:['bio_sting','bio_sting','acid_torpedo'], ai:'defensive',
    xp:110, credits:220, shape:'keth_behemoth'
  },
  shard_slicer: {
    id:'shard_slicer', name:'Shard Slicer', faction:'shard',
    maxHull:65, maxShields:65, shieldRate:18, shieldDelay:2,
    armor:5, maxSpeed:125, accel:55, turnRate:2.2, size:13,
    depthRate:60, preferredDepth:40, stealthRating:0, ewDefense:25,
    color:'#ce93d8', glowColor:'#ab47bc',
    weapons:['crystal_beam'], ai:'aggressive',
    xp:32, credits:65, shape:'shard_slicer'
  },
  shard_fortress: {
    id:'shard_fortress', name:'Shard Fortress', faction:'shard',
    maxHull:220, maxShields:220, shieldRate:32, shieldDelay:3,
    armor:16, maxSpeed:42, accel:16, turnRate:0.95, size:30,
    depthRate:30, preferredDepth:60, stealthRating:0, ewDefense:50,
    color:'#9c27b0', glowColor:'#7b1fa2',
    weapons:['crystal_beam','crystal_beam','prism_burst'], ai:'defensive',
    xp:130, credits:260, shape:'shard_fortress'
  },
  leviathan_young: {
    id:'leviathan_young', name:'Young Leviathan', faction:'leviathan',
    maxHull:450, maxShields:0, shieldRate:0, shieldDelay:0,
    armor:22, maxSpeed:85, accel:32, turnRate:1.4, size:38,
    depthRate:40, preferredDepth:320, stealthRating:0,
    color:'#00e676', glowColor:'#00c853',
    weapons:['tentacle_strike','sonic_pulse'], ai:'leviathan',
    xp:220, credits:0, shape:'leviathan_small'
  },
  leviathan_alpha: {
    id:'leviathan_alpha', name:'Alpha Leviathan', faction:'leviathan',
    maxHull:1100, maxShields:0, shieldRate:0, shieldDelay:0,
    armor:35, maxSpeed:62, accel:20, turnRate:0.9, size:62,
    depthRate:20, preferredDepth:420, stealthRating:0,
    color:'#00e676', glowColor:'#69f0ae',
    weapons:['tentacle_strike','tentacle_strike','sonic_pulse','depth_charge'], ai:'leviathan',
    xp:600, credits:0, shape:'leviathan_boss'
  },
};

const WEAPON_DATA = {
  // ── Player weapons ─────────────────────────────────────────────
  // arc: half-angle in radians that weapon can fire within relative to ship facing.
  // No arc = full turret rotation. arc: Math.PI = forward hemisphere. arc: Math.PI*0.5 = ±90°.
  pulse_cannon:   { name:'Pulse Cannon',   type:'projectile', dmg:14, sdmg:1.0, hdmg:1.0, range:360, cd:1.1, pSpeed:460, pSize:4, pColor:'#00e5ff', color:'#00e5ff' },
  particle_lance: { name:'Particle Lance', type:'beam',       dmg:9,  sdmg:0.8, hdmg:1.3, range:460, cd:0.08, beamDur:2.2, rechargeDur:3.2, bWidth:3, color:'#ff6e40', arc: Math.PI * 0.6 },
  heavy_cannon:   { name:'Heavy Cannon',   type:'projectile', dmg:40, sdmg:0.8, hdmg:1.5, range:410, cd:2.8, pSpeed:340, pSize:8, pColor:'#ffa726', color:'#ffa726', arc: Math.PI * 0.55 },
  vortex_torpedo: { name:'Vortex Torpedo', type:'torpedo',    dmg:90, sdmg:0.5, hdmg:2.2, range:620, cd:8.5, pSpeed:195, pSize:9, pColor:'#ff7043', exRadius:65, trackRate:1.6, maxAmmo:6, color:'#ff7043' },
  plasma_driver:  { name:'Plasma Driver',  type:'projectile', dmg:110,sdmg:1.2, hdmg:1.2, range:510, cd:4.8, pSpeed:290, pSize:14,pColor:'#e040fb', exRadius:45, color:'#e040fb', arc: Math.PI * 0.45 },
  drone_launcher: { name:'Drone Bay',      type:'drone',      droneDmg:18, droneHull:35, droneSpeed:260, range:520, cd:18.0, maxDrones:3, color:'#40c4ff' },
  // Electronic warfare — reduces enemy accuracy & weapon range
  ew_jammer:      { name:'EW Jammer',      type:'ew',         ewRadius:500, ewStrength:40, cd:0, color:'#76ff03' },
  // ── Enemy weapons ──────────────────────────────────────────────
  bio_sting:      { name:"Bio-Sting",      type:'projectile', dmg:11, sdmg:1.6, hdmg:0.7, range:290, cd:0.75, pSpeed:520, pSize:4, pColor:'#ff9100', color:'#ff9100' },
  acid_torpedo:   { name:'Acid Torpedo',   type:'torpedo',    dmg:55, sdmg:0.3, hdmg:2.8, range:460, cd:10.0, pSpeed:175, pSize:7, pColor:'#aeea00', exRadius:0, trackRate:1.2, maxAmmo:5, dot:{dmg:5,dur:5,tick:1}, color:'#aeea00' },
  crystal_beam:   { name:'Crystal Beam',   type:'beam',       dmg:17, sdmg:1.6, hdmg:0.6, range:390, cd:0.08, beamDur:1.4, rechargeDur:2.6, bWidth:2, color:'#ea80fc' },
  prism_burst:    { name:'Prism Burst',    type:'projectile', dmg:28, sdmg:2.2, hdmg:0.4, range:330, cd:3.8, pSpeed:620, pSize:6, pColor:'#ff4081', scatter:4, color:'#ff4081' },
  tentacle_strike:{ name:'Tentacle Strike',type:'melee',      dmg:65, sdmg:0.3, hdmg:3.2, range:110, cd:2.2, color:'#69f0ae' },
  sonic_pulse:    { name:'Sonic Pulse',    type:'aoe',        dmg:35, sdmg:1.0, hdmg:1.0, range:310, cd:5.5, exRadius:160, color:'#b9f6ca' },
  depth_charge:   { name:'Depth Charge',   type:'torpedo',    dmg:130,sdmg:0.8, hdmg:1.6, range:420, cd:13.0,pSpeed:145, pSize:11,pColor:'#69f0ae', exRadius:105, trackRate:0.8, maxAmmo:4, color:'#69f0ae' },
};

// ── Ship module slots by template ─────────────────────────────────
// [weapon, defense, system] slot counts
const MODULE_SLOTS = {
  skiff:       { weapon:1, defense:1, system:1 },
  cutter:      { weapon:2, defense:1, system:1 },
  frigate:     { weapon:2, defense:2, system:1 },
  gunship:     { weapon:3, defense:2, system:1 },
  cruiser:     { weapon:3, defense:2, system:2 },
  carrier:     { weapon:2, defense:2, system:3 },
  dreadnought: { weapon:4, defense:3, system:2 },
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
  hull_refit:   { id:'hull_refit',   category:'defense', name:'Reinforced Hull',        desc:'+120 max hull, +8 armor.',                                cost:220, icon:'◈',
    apply(s){ s.maxHull+=120; s.hull=Math.min(s.hull+30, s.maxHull); s.armor+=8; } },
  shield_emitter:{ id:'shield_emitter',category:'defense',name:'Shield Emitter Array',  desc:'+80 shields, +12 recharge/s, -3s recharge delay.',        cost:240, icon:'◎',
    apply(s){ s.maxShields+=80; s.shields=Math.min(s.shields+40, s.maxShields); s.shieldRate+=12; s.shieldDelay=Math.max(1, (s.shieldDelay||4)-3); } },
  reactive_plating:{ id:'reactive_plating',category:'defense',name:'Reactive Plating', desc:'+16 armor. Heavy — -10% speed.',                          cost:160, icon:'⧫',
    apply(s){ s.armor+=16; s.maxSpeed=Math.round(s.maxSpeed*0.9); } },
  ablative_coat:{ id:'ablative_coat',category:'defense', name:'Ablative Coating',       desc:'+50 hull, +6 armor, better shield absorption.',           cost:190, icon:'◆',
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
    apply(s){ s.depthRate+=100; } },
};

// ── Recruitable ships (available in store) ────────────────────────
const RECRUITABLE_SHIPS = [
  { templateId:'cutter',      baseName:'INS', cost:260 },
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
  { id:'shield_amp',    name:'Shield Amplifier',   desc:'+35 max shields',                   cost:95,  apply:(s)=>{ s.maxShields+=35; } },
  { id:'fast_charge',   name:'Quick Recharger',    desc:'+6 shield recharge rate',           cost:130, apply:(s)=>{ s.shieldRate+=6; } },
  { id:'engine_boost',  name:'Engine Overcharge',  desc:'+25% max speed',                    cost:170, apply:(s)=>{ s.maxSpeed=Math.round(s.maxSpeed*1.25); } },
  { id:'armor_weave',   name:'Nano-Armor Weave',   desc:'+6 armor (reduces all damage)',     cost:125, apply:(s)=>{ s.armor+=6; } },
  { id:'targeting_sys', name:'Targeting System',   desc:'+25% weapon range',                 cost:185, apply:(s)=>{ s.weapons.forEach(w=>{ w.range*=1.25; }); } },
  { id:'reload_mech',   name:'Rapid Reload',       desc:'-20% weapon cooldown',              cost:200, apply:(s)=>{ s.weapons.forEach(w=>{ w.cd*=0.80; }); } },
  { id:'patch_kit',     name:'Field Repair',       desc:'Restore 80 hull',                   cost:70,  apply:(s)=>{ s.hull=Math.min(s.hull+80,s.maxHull); }, consumable:true },
  { id:'shield_patch',  name:'Shield Reboot',      desc:'Fully restore shields',             cost:60,  apply:(s)=>{ s.shields=s.maxShields; }, consumable:true },
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
  { templateId:'cruiser',  name:'INS Heraklion', isFlagship:true },
  { templateId:'cutter',   name:'INS Swift' },
  { templateId:'cutter',   name:'INS Valiant' },
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
  island:  { radius:80,  color:'#263238', borderColor:'#455a64', slow:false, damage:false, blocking:true },
  kelp:    { radius:60,  color:'rgba(27,94,32,0.4)', borderColor:'rgba(46,125,50,0.6)', slow:true, damage:false, blocking:false },
  vent:    { radius:40,  color:'rgba(183,28,28,0.3)', borderColor:'rgba(229,57,53,0.6)', slow:false, damage:true, damageRate:8, blocking:false },
};
