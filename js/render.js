'use strict';
// ================================================================
// RENDER.JS — Three.js 3D renderer (procedural geometry, no assets)
// ================================================================

// ── Ship Model Factory ────────────────────────────────────────────
const ShipModels = {
  _mat(color, glow, metal=0.7, rough=0.25, emissInt=0.25) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(glow || color),
      emissiveIntensity: emissInt,
      metalness: metal,
      roughness: rough,
    });
  },
  _glow(color) {
    return new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent:true, opacity:0.9 });
  },
  _addMesh(group, geo, mat, x=0,y=0,z=0, rx=0,ry=0,rz=0, sx=1,sy=1,sz=1) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x,y,z); m.rotation.set(rx,ry,rz); m.scale.set(sx,sy,sz);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m); return m;
  },

  // ── PLAYER SHIPS ─────────────────────────────────────────────
  skiff(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color,glow,0.7,0.2,0.3);
    const glowMat = this._glow(glow);
    // Hull
    this._addMesh(g, new THREE.BoxGeometry(16,5,55), mat, 0,0,0);
    // Bow cone
    this._addMesh(g, new THREE.ConeGeometry(8,18,6), mat, Math.PI/2,0,0, 0,0,-36);
    // Engine
    this._addMesh(g, new THREE.CylinderGeometry(3,5,8,8), glowMat, 0,0,25);
    // Wing fins
    this._addMesh(g, new THREE.BoxGeometry(28,3,16), mat, 0,0,8);
    g.userData.engineGlow = g.children[2];
    return g;
  },

  cutter(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color,glow);
    const glowMat = this._glow(glow);
    // Hull
    this._addMesh(g, new THREE.BoxGeometry(22,7,70), mat);
    // Bow
    this._addMesh(g, new THREE.ConeGeometry(11,20,8), mat, Math.PI/2,0,0, 0,0,-45);
    // Bridge
    this._addMesh(g, new THREE.BoxGeometry(12,8,20), mat, 0,7,-5);
    // Dual engines
    this._addMesh(g, new THREE.CylinderGeometry(3,5,10,8), glowMat, -6,-3,33);
    this._addMesh(g, new THREE.CylinderGeometry(3,5,10,8), glowMat,  6,-3,33);
    // Wing extensions
    this._addMesh(g, new THREE.BoxGeometry(38,4,24), mat, 0,0,10);
    g.userData.engineGlow = g.children[3];
    return g;
  },

  frigate(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color,glow);
    const glowMat = this._glow(glow);
    // Hull
    this._addMesh(g, new THREE.BoxGeometry(28,8,90), mat);
    // Bow
    this._addMesh(g, new THREE.ConeGeometry(14,24,8), mat, Math.PI/2,0,0, 0,0,-57);
    // Superstructure
    this._addMesh(g, new THREE.BoxGeometry(16,10,30), mat, 0,9,-10);
    // Torpedo launchers on sides
    this._addMesh(g, new THREE.CylinderGeometry(3,3,30,8), mat, 0,0,Math.PI/2, -18,0,-5);
    this._addMesh(g, new THREE.CylinderGeometry(3,3,30,8), mat, 0,0,Math.PI/2,  18,0,-5);
    // Engines
    this._addMesh(g, new THREE.CylinderGeometry(4,6,12,8), glowMat, -7,-3,42);
    this._addMesh(g, new THREE.CylinderGeometry(4,6,12,8), glowMat,  7,-3,42);
    // Gun turret (front)
    this._addMesh(g, new THREE.CylinderGeometry(5,5,5,8), mat, 0,14,-30);
    this._addMesh(g, new THREE.BoxGeometry(3,3,16), mat, 0,17,-30);
    g.userData.engineGlow = g.children[5];
    return g;
  },

  gunship(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color,glow);
    const glowMat = this._glow(glow);
    // Wide hull
    this._addMesh(g, new THREE.BoxGeometry(42,10,82), mat);
    // Bow
    this._addMesh(g, new THREE.ConeGeometry(21,22,8), mat, Math.PI/2,0,0, 0,0,-52);
    // Raised deck
    this._addMesh(g, new THREE.BoxGeometry(28,6,55), mat, 0,8,-5);
    // 3 turrets
    for (let i = -1; i <= 1; i++) {
      this._addMesh(g, new THREE.CylinderGeometry(6,6,6,8), mat, i*14,15,-10);
      this._addMesh(g, new THREE.BoxGeometry(4,4,18), mat, i*14,18,-15);
    }
    // 3 engines
    for (let i = -1; i <= 1; i++) {
      this._addMesh(g, new THREE.CylinderGeometry(4,7,12,8), glowMat, i*10,-3,39);
    }
    g.userData.engineGlow = g.children[9];
    return g;
  },

  cruiser(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color,glow,0.8,0.2,0.35);
    const glowMat = this._glow(glow);
    // Main hull
    this._addMesh(g, new THREE.BoxGeometry(50,12,115), mat);
    // Bow flare
    this._addMesh(g, new THREE.ConeGeometry(25,28,8), mat, Math.PI/2,0,0, 0,0,-71);
    // Central superstructure
    this._addMesh(g, new THREE.BoxGeometry(28,14,50), mat, 0,13,-15);
    // Bridge tower
    this._addMesh(g, new THREE.BoxGeometry(14,18,14), mat, 0,27,-20);
    // Radar dish
    this._addMesh(g, new THREE.TorusGeometry(6,1.2,6,12), mat, Math.PI/2,0,0, 0,38,-20);
    // Radar mast
    this._addMesh(g, new THREE.CylinderGeometry(0.8,0.8,10,6), mat, 0,34,-20);
    // Side wing pontoons
    this._addMesh(g, new THREE.BoxGeometry(12,6,70), mat, -32,0,5);
    this._addMesh(g, new THREE.BoxGeometry(12,6,70), mat,  32,0,5);
    // Main turrets (2 front)
    this._addMesh(g, new THREE.CylinderGeometry(7,7,7,8), mat, -14,19,-38);
    this._addMesh(g, new THREE.CylinderGeometry(7,7,7,8), mat,  14,19,-38);
    this._addMesh(g, new THREE.BoxGeometry(4,4,22), mat, -14,23,-44);
    this._addMesh(g, new THREE.BoxGeometry(4,4,22), mat,  14,23,-44);
    // Rear engines
    for (let i = -1; i <= 1; i++) {
      this._addMesh(g, new THREE.CylinderGeometry(5,8,14,8), glowMat, i*14,-4,55);
    }
    g.userData.engineGlow = g.children[12];
    return g;
  },

  carrier(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color,glow,0.6,0.4,0.2);
    const glowMat = this._glow(glow);
    // Flat wide hull
    this._addMesh(g, new THREE.BoxGeometry(70,8,128), mat);
    // Flight deck on top
    this._addMesh(g, new THREE.BoxGeometry(68,3,120), mat, 0,5,0);
    // Island superstructure (to starboard)
    this._addMesh(g, new THREE.BoxGeometry(14,25,30), mat, 28,16,-10);
    // Catapult rails (lines)
    for (let i = -1; i <= 1; i+=2) {
      this._addMesh(g, new THREE.BoxGeometry(2,1,90), mat, i*18,8,-10);
    }
    // Bow
    this._addMesh(g, new THREE.ConeGeometry(35,25,8), mat, Math.PI/2,0,0, 0,0,-76);
    // Engines
    for (let i = -2; i <= 2; i++) {
      this._addMesh(g, new THREE.CylinderGeometry(4,7,12,8), glowMat, i*12,-3,60);
    }
    g.userData.engineGlow = g.children[5];
    return g;
  },

  dreadnought(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color,glow,0.9,0.15,0.4);
    const glowMat = this._glow(glow);
    // Massive hull
    this._addMesh(g, new THREE.BoxGeometry(68,20,175), mat);
    // Armored bow
    this._addMesh(g, new THREE.ConeGeometry(34,35,8), mat, Math.PI/2,0,0, 0,0,-105);
    // Upper superstructure
    this._addMesh(g, new THREE.BoxGeometry(40,18,80), mat, 0,19,-20);
    // Bridge fortress
    this._addMesh(g, new THREE.BoxGeometry(22,22,22), mat, 0,37,-35);
    // Armor belts on sides
    this._addMesh(g, new THREE.BoxGeometry(8,25,120), mat, -38,0,5);
    this._addMesh(g, new THREE.BoxGeometry(8,25,120), mat,  38,0,5);
    // Massive main turrets (2 front, 2 rear)
    for (const [z,name] of [[-60,'A'],[-30,'B'],[30,'C'],[60,'D']]) {
      this._addMesh(g, new THREE.CylinderGeometry(10,10,10,8), mat, 0,25,z);
      this._addMesh(g, new THREE.BoxGeometry(6,6,30), mat, -9,30,z-5);
      this._addMesh(g, new THREE.BoxGeometry(6,6,30), mat,  9,30,z-5);
    }
    // Side gun mounts
    for (const x of [-34,34]) {
      for (const z of [-40,0,40]) {
        this._addMesh(g, new THREE.CylinderGeometry(5,5,5,6), mat, x,10,z);
        this._addMesh(g, new THREE.BoxGeometry(3,3,18), mat, x,13,z-5);
      }
    }
    // Engines
    for (let i = -2; i <= 2; i++) {
      this._addMesh(g, new THREE.CylinderGeometry(5,10,16,8), glowMat, i*12,-8,85);
    }
    g.userData.engineGlow = g.children[g.children.length-3];
    return g;
  },

  // ── KETH'VARI (organic, bioluminescent) ──────────────────────
  keth_spore(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color,glow,0.1,0.9,0.6);
    const glowMat = this._glow(glow);
    this._addMesh(g, new THREE.SphereGeometry(12,8,8), mat, 0,0,-2);
    this._addMesh(g, new THREE.ConeGeometry(8,18,6), mat, Math.PI/2,0,0, 0,0,-18);
    // Tendrils
    for (let i=0;i<4;i++) {
      const ang = (i/4)*Math.PI*2;
      this._addMesh(g,new THREE.CylinderGeometry(1.5,0.5,16,6),glowMat, Math.cos(ang)*10,Math.sin(ang)*10,6, ang,0,0);
    }
    return g;
  },

  keth_hunter(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color,glow,0.1,0.8,0.5);
    const glowMat = this._glow(glow);
    // Elongated organic body
    this._addMesh(g, new THREE.SphereGeometry(14,10,8), mat, 0,0,0, 0,0,0, 1,0.7,2.2);
    // Forward protrusion (stinger)
    this._addMesh(g, new THREE.ConeGeometry(6,25,6), mat, Math.PI/2,0,0, 0,0,-30);
    // Side fins
    this._addMesh(g, new THREE.BoxGeometry(42,3,18), mat, 0,0,5, 0,0,Math.PI/8);
    // Glow nodes
    for (let i=0;i<3;i++) {
      this._addMesh(g, new THREE.SphereGeometry(3,6,6), glowMat, (i-1)*12,8,0);
    }
    return g;
  },

  keth_behemoth(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color,glow,0.1,0.7,0.4);
    const glowMat = this._glow(glow);
    // Massive bulbous body
    this._addMesh(g, new THREE.SphereGeometry(32,12,10), mat, 0,0,0, 0,0,0, 1,0.7,1.5);
    // Jaw / forward section
    this._addMesh(g, new THREE.ConeGeometry(18,35,8), mat, Math.PI/2,0,0, 0,-5,-45);
    // Dorsal spines
    for (let i=0;i<5;i++) {
      const z = (i-2)*14;
      this._addMesh(g, new THREE.ConeGeometry(4,22,6), mat, 0,30,z, -0.4,0,0);
    }
    // Side appendages
    for (const x of [-30,30]) {
      this._addMesh(g, new THREE.CylinderGeometry(5,2,45,8), glowMat, x,0,10, 0,0,x>0?-0.5:0.5);
    }
    // Bio-glow patches
    for (let i=0;i<6;i++) {
      const ang=(i/6)*Math.PI*2;
      this._addMesh(g,new THREE.SphereGeometry(5,6,6),glowMat, Math.cos(ang)*25,Math.sin(ang)*15,0);
    }
    return g;
  },

  // ── SHARD COLLECTIVE (crystalline) ───────────────────────────
  shard_slicer(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color,glow,0.2,0.1,0.7);
    const glowMat = this._glow(glow);
    // Crystal core (octahedron)
    this._addMesh(g, new THREE.OctahedronGeometry(16), mat, 0,0,0, 0,Math.PI/4,0, 1,0.5,2);
    // Crystal spires front
    this._addMesh(g, new THREE.OctahedronGeometry(7), mat, 0,0,-28, 0,Math.PI/4,0, 0.5,0.5,1.5);
    // Wing crystals
    this._addMesh(g, new THREE.OctahedronGeometry(10), mat, -20,0,0, 0,Math.PI/4,0, 1.5,0.3,0.8);
    this._addMesh(g, new THREE.OctahedronGeometry(10), mat,  20,0,0, 0,Math.PI/4,0, 1.5,0.3,0.8);
    // Glow core
    this._addMesh(g, new THREE.SphereGeometry(6,6,6), glowMat, 0,0,0);
    return g;
  },

  shard_fortress(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color,glow,0.3,0.05,0.6);
    const glowMat = this._glow(glow);
    // Central crystal mass
    this._addMesh(g, new THREE.OctahedronGeometry(22), mat, 0,0,0, Math.PI/6,Math.PI/4,0);
    // Surrounding crystal pillars
    for (let i=0;i<6;i++) {
      const ang = (i/6)*Math.PI*2;
      const r = 28;
      this._addMesh(g, new THREE.OctahedronGeometry(10), mat, Math.cos(ang)*r,0,Math.sin(ang)*r, 0,ang,0, 0.8,1.5,0.8);
    }
    // Spires pointing outward
    for (let i=0;i<4;i++) {
      const ang = (i/4)*Math.PI*2;
      const r = 18;
      this._addMesh(g, new THREE.ConeGeometry(4,28,6), glowMat, Math.cos(ang)*r,20,Math.sin(ang)*r, Math.cos(ang)*0.4,0,Math.sin(ang)*(-0.4));
    }
    // Core glow
    this._addMesh(g, new THREE.SphereGeometry(10,8,8), glowMat, 0,0,0);
    return g;
  },

  // ── LEVIATHANS (creature-like) ────────────────────────────────
  leviathan_young(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color,glow,0.05,0.95,0.5);
    const glowMat = this._glow(glow);
    // Main body (elongated sphere)
    this._addMesh(g, new THREE.SphereGeometry(30,12,10), mat, 0,0,0, 0,0,0, 1,0.6,2.2);
    // Head lobe
    this._addMesh(g, new THREE.SphereGeometry(20,10,8), mat, 0,5,-52, 0,0,0, 1,0.7,0.9);
    // Tail fluke
    this._addMesh(g, new THREE.BoxGeometry(55,5,18), mat, 0,-5,55, -0.2,0,0);
    // Dorsal fin
    this._addMesh(g, new THREE.ConeGeometry(8,35,4), mat, 0,38,0, 0,Math.PI/4,0);
    // Tentacles
    for (let i=0;i<6;i++) {
      const ang=(i/6)*Math.PI*2;
      this._addMesh(g,new THREE.CylinderGeometry(3,1,55,6),glowMat, Math.cos(ang)*22,Math.sin(ang)*10,20, Math.cos(ang)*0.5,0,Math.sin(ang)*0.5);
    }
    // Eye glow
    this._addMesh(g, new THREE.SphereGeometry(5,6,6), glowMat, -8,6,-64);
    this._addMesh(g, new THREE.SphereGeometry(5,6,6), glowMat,  8,6,-64);
    return g;
  },

  leviathan_alpha(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color,glow,0.05,0.95,0.4);
    const glowMat = this._glow(glow);
    // Colossal body
    this._addMesh(g, new THREE.SphereGeometry(55,14,12), mat, 0,0,0, 0,0,0, 1,0.65,2.5);
    // Massive head
    this._addMesh(g, new THREE.SphereGeometry(38,12,10), mat, 0,10,-100, 0,0,0, 1,0.8,0.85);
    // Lower jaw
    this._addMesh(g, new THREE.BoxGeometry(55,12,50), mat, 0,-22,-90);
    // Dorsal fins
    for (let i=0;i<4;i++) {
      this._addMesh(g,new THREE.ConeGeometry(8,50,4),mat, (i-1.5)*20,60,i*15, -0.2,Math.PI/4,0);
    }
    // Tail fluke
    this._addMesh(g, new THREE.BoxGeometry(90,8,30), mat, 0,-10,95, -0.1,0,0);
    // Many tentacles
    for (let i=0;i<10;i++) {
      const ang=(i/10)*Math.PI*2;
      this._addMesh(g,new THREE.CylinderGeometry(5,2,90,8),glowMat, Math.cos(ang)*42,Math.sin(ang)*18,30, Math.cos(ang)*0.6,0,Math.sin(ang)*0.6);
    }
    // Glowing underbelly markings
    for (let i=0;i<8;i++) {
      this._addMesh(g,new THREE.SphereGeometry(8,6,6),glowMat, (i-3.5)*14,-(Math.abs(i-3.5)*3+30),-10);
    }
    // Massive eyes
    this._addMesh(g, new THREE.SphereGeometry(9,8,8), glowMat, -14,10,-118);
    this._addMesh(g, new THREE.SphereGeometry(9,8,8), glowMat,  14,10,-118);
    return g;
  },

  create(ship) {
    const tplId = ship.templateId;
    const color = ship.color;
    const glow = ship.glowColor;
    const fn = this[tplId];
    if (fn) return fn.call(this, color, glow);
    // Fallback
    return this.cutter.call(this, color, glow);
  },
};

// ── Renderer ──────────────────────────────────────────────────────
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.time = 0;

    // Three.js core
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x030810, 0.00012);

    // Camera — angled to show the 3D water column (depth axis visible)
    this.camera = new THREE.PerspectiveCamera(58, this.W / this.H, 5, 12000);
    this.camTarget = new THREE.Vector3(0, -80, 0);
    this.camHeight = 580;
    this.camTilt   = 900;
    this.camera.position.set(0, this.camHeight - 80, this.camTilt);
    this.camera.lookAt(0, -80, 0);

    // Raycasting — plane at y=0 by default; updated per-click to match selected ship depth
    this.raycaster   = new THREE.Raycaster();
    this.clickPlaneY = 0;  // set by game to selected ship's depth
    this.clickPlane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // World → Three.js coordinate conversion
    // worldX → three.X - WORLD_W/2
    // worldY → three.Z - WORLD_H/2

    this._setupScene();

    // Entity mesh maps
    this.shipMeshes = new Map();  // ship.id → {group, shield, engineGlow}
    this.projMeshes = new Map();  // proj.id → mesh
    this.activeEffects = [];      // [{mesh, timer, duration, type, ...}]
    this.droneMeshes = new Map();
  }

  // ── World ↔ Scene Coordinates ─────────────────────────────────
  wx(worldX) { return worldX - WORLD_W / 2; }
  wz(worldY) { return worldY - WORLD_H / 2; }
  tw(threeX) { return threeX + WORLD_W / 2; }
  tz(threeZ) { return threeZ + WORLD_H / 2; }

  // ── Scene Setup ───────────────────────────────────────────────
  _setupScene() {
    // ── Deep ocean darkness ────────────────────────────────────────
    this.scene.background = new THREE.Color(0x000508);
    this.scene.fog = new THREE.FogExp2(0x010a14, 0.00022);

    // Ambient — very dim, cold blue-teal (deep water filters almost all light)
    const ambient = new THREE.AmbientLight(0x061825, 1.0);
    this.scene.add(ambient);

    // Diffuse "surface light" from above — simulates sunlight filtered down
    const surfaceLight = new THREE.DirectionalLight(0x1a5f8a, 0.7);
    surfaceLight.position.set(0, 1, -0.3);  // coming from above, angled
    surfaceLight.castShadow = true;
    surfaceLight.shadow.mapSize.width  = 2048;
    surfaceLight.shadow.mapSize.height = 2048;
    surfaceLight.shadow.camera.near = 10;
    surfaceLight.shadow.camera.far  = 3000;
    surfaceLight.shadow.camera.left = surfaceLight.shadow.camera.bottom = -2000;
    surfaceLight.shadow.camera.right = surfaceLight.shadow.camera.top   =  2000;
    this.scene.add(surfaceLight);

    // Bioluminescent accent lights — drift slowly through scene
    this.biolumLights = [];
    const blColors = [0x00aa66, 0x0055aa, 0x44aaaa, 0x006633];
    for (let i = 0; i < 4; i++) {
      const bl = new THREE.PointLight(blColors[i], 0.45, 1200);
      bl.position.set(
        (Math.random() - 0.5) * 1200,
        -100 - Math.random() * 300,
        (Math.random() - 0.5) * 1200
      );
      bl.userData.phase = Math.random() * Math.PI * 2;
      bl.userData.orbitR = 200 + Math.random() * 400;
      this.scene.add(bl);
      this.biolumLights.push(bl);
    }

    // Scene geometry
    this._createSeafloor();
    this._createWaterSurface();
    this._createLightShafts();
    this._createBiolumParticles();

    // Terrain objects group
    this.terrainGroup = new THREE.Group();
    this.scene.add(this.terrainGroup);

    // Selection indicator (ring under selected ship)
    this._createSelectionRing();
  }

  // ── Seafloor (bottom of the water column) ─────────────────────
  _createSeafloor() {
    const segs = 60;
    const geo = new THREE.PlaneGeometry(WORLD_W + 2000, WORLD_H + 2000, segs, segs);
    // Gently displace vertices for rocky terrain feel
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const h = Math.sin(x * 0.008) * 18 + Math.cos(y * 0.011) * 14
              + Math.sin((x+y)*0.005) * 10;
      pos.setZ(i, h);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color:    new THREE.Color(0x0a1208),
      emissive: new THREE.Color(0x030805),
      emissiveIntensity: 0.4,
      roughness: 0.95,
      metalness: 0.05,
    });
    this.seafloor = new THREE.Mesh(geo, mat);
    this.seafloor.rotation.x = -Math.PI / 2;
    this.seafloor.position.y = -WORLD_DEPTH;
    this.seafloor.receiveShadow = true;
    this.scene.add(this.seafloor);

    // Alien coral/rock spires on the seafloor
    for (let i = 0; i < 35; i++) {
      const h  = 30 + Math.random() * 120;
      const r  = 6  + Math.random() * 18;
      const geo2 = new THREE.CylinderGeometry(r * 0.1, r, h, 5 + Math.floor(Math.random()*4));
      const hue  = Math.random() < 0.6 ? 0x0a1a08 : 0x062010;
      const mat2 = new THREE.MeshStandardMaterial({
        color: new THREE.Color(hue),
        emissive: new THREE.Color(Math.random() < 0.35 ? 0x003308 : 0x000000),
        emissiveIntensity: 0.6,
        roughness: 0.8,
      });
      const mesh = new THREE.Mesh(geo2, mat2);
      mesh.position.set(
        (Math.random() - 0.5) * WORLD_W,
        -WORLD_DEPTH + h / 2,
        (Math.random() - 0.5) * WORLD_H
      );
      mesh.rotation.y = Math.random() * Math.PI * 2;
      mesh.rotation.z = (Math.random() - 0.5) * 0.25;
      mesh.castShadow = true;
      this.scene.add(mesh);
    }
  }

  // ── Water surface (translucent, viewed from below) ─────────────
  _createWaterSurface() {
    const segs = 80;
    const geo  = new THREE.PlaneGeometry(WORLD_W + 2000, WORLD_H + 2000, segs, segs);
    this.surfaceGeo = geo;
    this.surfacePositions = geo.attributes.position;
    this.surfaceBaseZ = new Float32Array(this.surfacePositions.count).fill(0);

    const mat = new THREE.MeshStandardMaterial({
      color:       new THREE.Color(0x061828),
      emissive:    new THREE.Color(0x030d18),
      emissiveIntensity: 0.5,
      metalness:   0.1,
      roughness:   0.3,
      transparent: true,
      opacity:     0.55,
      side:        THREE.DoubleSide,
    });
    this.surfaceMesh = new THREE.Mesh(geo, mat);
    this.surfaceMesh.rotation.x = -Math.PI / 2;
    this.surfaceMesh.position.y = 0;
    this.surfaceMesh.receiveShadow = false;
    this.scene.add(this.surfaceMesh);
  }

  _updateWaterSurface(dt) {
    const pos = this.surfacePositions;
    const t   = this.time;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const w = Math.sin(x * 0.003 + t * 0.4) * 12
              + Math.cos(y * 0.004 + t * 0.3) * 9
              + Math.sin((x+y) * 0.002 + t * 0.2) * 6;
      pos.setZ(i, w);
    }
    pos.needsUpdate = true;
    this.surfaceGeo.computeVertexNormals();
  }

  // ── Light shafts filtering from surface ───────────────────────
  _createLightShafts() {
    this.lightShafts = [];
    const shaftCount = 18;
    for (let i = 0; i < shaftCount; i++) {
      const h    = WORLD_DEPTH * (0.5 + Math.random() * 0.5);
      const r    = 35 + Math.random() * 80;
      const geo  = new THREE.CylinderGeometry(r * 0.3, r, h, 8, 1, true);
      const mat  = new THREE.MeshBasicMaterial({
        color:       new THREE.Color(0x103a5a),
        transparent: true,
        opacity:     0.04 + Math.random() * 0.04,
        side:        THREE.DoubleSide,
        depthWrite:  false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * WORLD_W,
        -h / 2,
        (Math.random() - 0.5) * WORLD_H
      );
      mesh.rotation.y = Math.random() * Math.PI * 2;
      mesh.userData.phase = Math.random() * Math.PI * 2;
      mesh.userData.baseOpacity = mat.opacity;
      this.scene.add(mesh);
      this.lightShafts.push(mesh);
    }
  }

  _updateLightShafts(dt) {
    const t = this.time;
    for (const shaft of this.lightShafts) {
      const ph = shaft.userData.phase;
      shaft.material.opacity = shaft.userData.baseOpacity * (0.6 + 0.4 * Math.sin(t * 0.4 + ph));
      shaft.rotation.y += dt * 0.008;
    }
  }

  // ── Selection ring under selected ship ────────────────────────
  _createSelectionRing() {
    const geo  = new THREE.TorusGeometry(1, 2.5, 8, 32);
    const mat  = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.85 });
    this._selRing = new THREE.Mesh(geo, mat);
    this._selRing.rotation.x = Math.PI / 2;
    this._selRing.visible = false;
    this.scene.add(this._selRing);
  }

  _createOcean() {
    const segs = 80;
    const geo = new THREE.PlaneGeometry(WORLD_W + 2000, WORLD_H + 2000, segs, segs);
    this.oceanGeo = geo;
    this.oceanPositions = geo.attributes.position;
    // Store initial Z for wave animation (plane lies in XY, Z = wave height)
    this.oceanBaseZ = new Float32Array(this.oceanPositions.count).fill(0);

    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x071528),
      emissive: new THREE.Color(0x000814),
      emissiveIntensity: 0.3,
      metalness: 0.15,
      roughness: 0.75,
      side: THREE.FrontSide,
    });
    this.oceanMesh = new THREE.Mesh(geo, mat);
    this.oceanMesh.rotation.x = -Math.PI / 2;
    this.oceanMesh.receiveShadow = true;
    this.oceanMesh.position.y = 0;
    this.scene.add(this.oceanMesh);
  }

  _updateOcean(dt) {
    const pos = this.oceanPositions;
    const count = pos.count;
    const t = this.time;
    for (let i = 0; i < count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      // Wave height via overlapping sine waves
      const w = Math.sin(x * 0.0030 + t * 0.45) * 14
              + Math.cos(y * 0.0038 + t * 0.33) * 10
              + Math.sin((x + y) * 0.0018 + t * 0.22) * 7
              + Math.cos((x - y) * 0.0025 + t * 0.55) * 5;
      pos.setZ(i, w);
    }
    pos.needsUpdate = true;
    this.oceanGeo.computeVertexNormals();
  }

  _createStarfield() {
    const count = 2000;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i*3]   = (Math.random() - 0.5) * 20000;
      positions[i*3+1] = 1000 + Math.random() * 8000;
      positions[i*3+2] = (Math.random() - 0.5) * 20000;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xaaccff, size: 3, sizeAttenuation: true });
    this.scene.add(new THREE.Points(geo, mat));

    // Alien aurora (large glowing plane high up)
    const auroraGeo = new THREE.PlaneGeometry(8000, 4000, 1, 1);
    const auroraMat = new THREE.MeshBasicMaterial({
      color: 0x004433,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
    });
    const aurora = new THREE.Mesh(auroraGeo, auroraMat);
    aurora.position.y = 3500;
    aurora.rotation.x = 0.3;
    this.aurora = aurora;
    this.scene.add(aurora);
  }

  _createBiolumParticles() {
    // 3D particles distributed throughout the water column
    const count = 900;
    const positions = new Float32Array(count * 3);
    this.biolumData = new Float32Array(count * 5); // x, y (depth), z, phase, riseSpeed
    for (let i = 0; i < count; i++) {
      const bx = (Math.random() - 0.5) * WORLD_W;
      const by = -(Math.random() * WORLD_DEPTH);       // 0 (surface) to -WORLD_DEPTH
      const bz = (Math.random() - 0.5) * WORLD_H;
      positions[i*3]   = bx;
      positions[i*3+1] = by;
      positions[i*3+2] = bz;
      this.biolumData[i*5]   = bx;
      this.biolumData[i*5+1] = by;
      this.biolumData[i*5+2] = bz;
      this.biolumData[i*5+3] = Math.random() * Math.PI * 2;   // phase
      this.biolumData[i*5+4] = 8 + Math.random() * 22;        // rise speed
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.biolumPositions = geo.attributes.position;
    const mat = new THREE.PointsMaterial({
      color:           0x00e5b0,
      size:            5,
      sizeAttenuation: true,
      transparent:     true,
      opacity:         0.65,
    });
    this.biolumPoints = new THREE.Points(geo, mat);
    this.scene.add(this.biolumPoints);
  }

  _updateBiolum(dt) {
    const t   = this.time;
    const pos = this.biolumPositions;
    const n   = this.biolumData.length / 5;
    for (let i = 0; i < n; i++) {
      let bx = this.biolumData[i*5];
      let by = this.biolumData[i*5+1];
      let bz = this.biolumData[i*5+2];
      const ph = this.biolumData[i*5+3];
      const rs = this.biolumData[i*5+4];

      // Drift sideways + rise upward
      bx += Math.sin(t * 0.25 + ph) * 12 * dt;
      bz += Math.cos(t * 0.18 + ph * 1.3) * 8 * dt;
      by += rs * dt;  // rise toward surface

      // Wrap: when reaching surface, teleport to deep
      if (by > 5) {
        by = -(WORLD_DEPTH * 0.8 + Math.random() * WORLD_DEPTH * 0.2);
        bx = (Math.random() - 0.5) * WORLD_W;
        bz = (Math.random() - 0.5) * WORLD_H;
      }

      this.biolumData[i*5]   = bx;
      this.biolumData[i*5+1] = by;
      this.biolumData[i*5+2] = bz;
      pos.setXYZ(i, bx, by, bz);
    }
    pos.needsUpdate = true;
    this.biolumPoints.material.opacity = 0.35 + 0.3 * Math.abs(Math.sin(t * 0.7));
  }

  // ── Terrain ───────────────────────────────────────────────────
  buildTerrain(terrain) {
    this.terrainGroup.clear();
    for (const t of terrain) {
      const tx = this.wx(t.x), tz = this.wz(t.y);
      if (t.type === 'island') {
        // "Island" underwater = large rock formation spanning near surface to mid-depth
        const h = 80 + Math.random() * 120;
        const geo = new THREE.CylinderGeometry(t.radius * 0.3, t.radius, h, 9);
        const mat = new THREE.MeshStandardMaterial({ color: 0x0e1a10, roughness: 0.95, metalness: 0.05,
          emissive: new THREE.Color(0x030803), emissiveIntensity: 0.4 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(tx, -h / 2, tz);   // base at seafloor direction, sits near surface
        mesh.castShadow = true;
        // Glowing biolum cap
        const capGeo = new THREE.SphereGeometry(t.radius * 0.5, 8, 6);
        const capMat = new THREE.MeshBasicMaterial({ color: 0x003311, transparent:true, opacity:0.6 });
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.set(tx, 0, tz);
        this.terrainGroup.add(mesh, cap);
      } else if (t.type === 'kelp') {
        // Deep-water kelp: long ribbons rising from mid-depth toward surface
        for (let k=0; k<14; k++) {
          const ang = Math.random()*Math.PI*2;
          const r = Math.random()*t.radius*0.8;
          const h = 80 + Math.random()*180;
          const geo = new THREE.CylinderGeometry(1,2.5,h,5);
          const mat = new THREE.MeshStandardMaterial({ color: 0x0b2a08, emissive: 0x051a03, emissiveIntensity: 0.5 });
          const m = new THREE.Mesh(geo, mat);
          const baseY = -180 - Math.random() * 100;
          m.position.set(tx + Math.cos(ang)*r, baseY + h/2, tz + Math.sin(ang)*r);
          m.rotation.z = (Math.random()-0.5)*0.25;
          this.terrainGroup.add(m);
        }
      } else if (t.type === 'vent') {
        // Thermal vent: at seafloor, glowing upward plume
        const geo = new THREE.TorusGeometry(t.radius, 10, 8, 20);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 0.45 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = Math.PI/2;
        mesh.position.set(tx, -WORLD_DEPTH + 5, tz);
        this.terrainGroup.add(mesh);
        // Rising plume
        const coreGeo = new THREE.CylinderGeometry(t.radius*0.2, t.radius*0.6, WORLD_DEPTH, 8, 1, true);
        const coreMat = new THREE.MeshBasicMaterial({ color: 0xff7700, transparent:true, opacity:0.08, side: THREE.DoubleSide });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.position.set(tx, -WORLD_DEPTH/2, tz);
        this.terrainGroup.add(core);
      }
    }
  }

  // ── Ship Meshes ───────────────────────────────────────────────
  _getOrCreateShipMesh(ship) {
    if (this.shipMeshes.has(ship.id)) return this.shipMeshes.get(ship.id);

    const group = ShipModels.create(ship);

    // Scale: ship.size is collision radius (~10-62), meshes designed for size≈20
    const scaleFactor = ship.size / 20;
    group.scale.setScalar(scaleFactor);

    // Shield sphere
    const shieldGeo = new THREE.SphereGeometry(ship.size * 1.4, 12, 10);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: ship.isPlayer ? 0x40c4ff : (ship.faction === 'shard' ? 0xea80fc : 0xff6d00),
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      wireframe: false,
    });
    const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    shieldMesh.name = 'shield';

    // Point light (ship glow)
    const light = new THREE.PointLight(new THREE.Color(ship.glowColor), 0.5, ship.size * 8);
    group.add(light);

    const container = new THREE.Group();
    container.add(group);
    container.add(shieldMesh);

    this.scene.add(container);
    const data = { container, group, shieldMesh, light, ship };
    this.shipMeshes.set(ship.id, data);
    return data;
  }

  updateShipMesh(ship) {
    if (ship.isDestroyed && ship.destroyTimer <= 0) {
      const data = this.shipMeshes.get(ship.id);
      if (data) { this.scene.remove(data.container); this.shipMeshes.delete(ship.id); }
      return;
    }
    const data = this._getOrCreateShipMesh(ship);
    const { container, group, shieldMesh, light } = data;

    container.position.set(this.wx(ship.x), -(ship.depth || 0), this.wz(ship.y));
    group.rotation.y = -ship.angle;

    // Shield
    if (ship.maxShields > 0 && ship.shields > 0) {
      const spct = ship.shields / ship.maxShields;
      shieldMesh.visible = true;
      shieldMesh.material.opacity = ship.shieldHitTimer > 0 ? 0.45 : 0.08 + spct * 0.07;
    } else {
      shieldMesh.visible = false;
    }

    // Hit flash
    if (ship.hitFlashTimer > 0) {
      group.traverse(c => { if (c.isMesh && c.material.emissive) c.material.emissiveIntensity = 1.5; });
    } else {
      group.traverse(c => { if (c.isMesh && c.material.emissive && !c.material.isBasicMaterial) {
        c.material.emissiveIntensity = c.material._baseEI || 0.25;
      }});
    }

    // Destroyed fade
    if (ship.isDestroyed) {
      const alpha = ship.destroyTimer / 1.2;
      group.traverse(c => { if (c.isMesh) { c.material.transparent = true; c.material.opacity = alpha; }});
    }

    // Engine glow intensity from speed
    light.intensity = 0.3 + (ship.speed / ship.maxSpeed) * 0.8;
    light.color.set(ship.glowColor);
  }

  // ── Projectile Meshes ─────────────────────────────────────────
  updateProjectileMeshes(projectiles) {
    const active = new Set(projectiles.map(p => p.id));

    // Remove old
    for (const [id, mesh] of this.projMeshes) {
      if (!active.has(id)) { this.scene.remove(mesh); this.projMeshes.delete(id); }
    }

    // Update or create
    for (const p of projectiles) {
      if (p.isDestroyed) continue;
      if (!this.projMeshes.has(p.id)) {
        const isTorpedo = p.weapon && (p.weapon.trackRate > 0);
        const size = isTorpedo ? 6 : (p.radius || 4);
        const geo = isTorpedo
          ? new THREE.CylinderGeometry(size*0.4, size*0.8, size*3, 6)
          : new THREE.SphereGeometry(size, 6, 5);
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color) });
        const mesh = new THREE.Mesh(geo, mat);

        // Glow light
        const light = new THREE.PointLight(new THREE.Color(p.color), 0.8, size * 12);
        mesh.add(light);

        this.scene.add(mesh);
        this.projMeshes.set(p.id, mesh);
      }
      const mesh = this.projMeshes.get(p.id);
      mesh.position.set(this.wx(p.x), -(p.depth || 0), this.wz(p.y));
      // Orient torpedo toward velocity
      if (p.vx !== undefined && p.vy !== undefined) {
        mesh.rotation.y = -Math.atan2(p.vx, -p.vy);
      }
    }
  }

  // ── Drone Meshes ──────────────────────────────────────────────
  updateDroneMeshes(drones) {
    const active = new Set(drones.map(d => d.id));
    for (const [id, mesh] of this.droneMeshes) {
      if (!active.has(id)) { this.scene.remove(mesh); this.droneMeshes.delete(id); }
    }
    for (const d of drones) {
      if (d.isDestroyed) continue;
      if (!this.droneMeshes.has(d.id)) {
        const geo = new THREE.OctahedronGeometry(8);
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(d.color) });
        const mesh = new THREE.Mesh(geo, mat);
        const light = new THREE.PointLight(new THREE.Color(d.color), 0.4, 80);
        mesh.add(light);
        this.scene.add(mesh);
        this.droneMeshes.set(d.id, mesh);
      }
      const mesh = this.droneMeshes.get(d.id);
      mesh.position.set(this.wx(d.x), -(d.depth || 0) - 5, this.wz(d.y));
      mesh.rotation.y -= 0.03;
    }
  }

  // ── Effects ───────────────────────────────────────────────────
  addEffect(effect) {
    const x  = this.wx(effect.x), z = this.wz(effect.y);
    const ey = -(effect.depth || 0);  // use effect depth if available

    if (effect.type === 'explosion' || effect.type === 'muzzle') {
      const geo = new THREE.SphereGeometry(effect.maxRadius * 0.15, 8, 6);
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(effect.color), transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, ey, z);
      const light = new THREE.PointLight(new THREE.Color(effect.color), 3, effect.maxRadius * 5);
      light.position.copy(mesh.position);
      this.scene.add(mesh, light);
      this.activeEffects.push({ mesh, light, timer: 0, duration: effect.duration, maxR: effect.maxRadius, type: 'explosion' });

    } else if (effect.type === 'shockwave') {
      const geo = new THREE.TorusGeometry(1, 3, 8, 32);
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(effect.color), transparent: true, opacity: 0.7 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, ey, z);
      this.scene.add(mesh);
      this.activeEffects.push({ mesh, timer: 0, duration: effect.duration, maxR: effect.maxRadius, type: 'shockwave' });

    } else if (effect.type === 'beam') {
      const ey2   = -(effect.depth || 0);
      const start = new THREE.Vector3(x, ey, z);
      const end   = new THREE.Vector3(this.wx(effect.x2), ey2, this.wz(effect.y2));
      const dir = end.clone().sub(start);
      const len = dir.length();
      const geo = new THREE.CylinderGeometry(effect.width * 0.5, effect.width * 0.5, len, 4, 1);
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(effect.color), transparent: true, opacity: 0.85 });
      const mesh = new THREE.Mesh(geo, mat);
      const mid  = start.clone().add(end).multiplyScalar(0.5);
      mesh.position.copy(mid);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      const light = new THREE.PointLight(new THREE.Color(effect.color), 1.5, 150);
      light.position.copy(mid);
      this.scene.add(mesh, light);
      this.activeEffects.push({ mesh, light, timer: 0, duration: effect.duration, type: 'beam' });
    }
  }

  _updateEffects(dt) {
    for (let i = this.activeEffects.length - 1; i >= 0; i--) {
      const e = this.activeEffects[i];
      e.timer += dt;
      const t = e.timer / e.duration;
      if (t >= 1) {
        this.scene.remove(e.mesh);
        if (e.light) this.scene.remove(e.light);
        this.activeEffects.splice(i, 1);
        continue;
      }
      if (e.type === 'explosion') {
        const scale = e.maxRadius * Math.sqrt(t) * 0.03;
        e.mesh.scale.setScalar(Math.max(0.01, scale));
        e.mesh.material.opacity = 1 - t;
        if (e.light) e.light.intensity = 3 * (1 - t);
      } else if (e.type === 'shockwave') {
        const scale = e.maxRadius * t * 0.02;
        e.mesh.scale.setScalar(Math.max(0.01, scale));
        e.mesh.material.opacity = 0.7 * (1 - t);
      } else if (e.type === 'beam') {
        e.mesh.material.opacity = 0.85 * (1 - t);
        if (e.light) e.light.intensity = 1.5 * (1 - t);
      }
    }
  }

  // ── Move Marker ───────────────────────────────────────────────
  _ensureMoveMarker() {
    if (!this._moveMarkerMesh) {
      const geo = new THREE.TorusGeometry(1, 2, 8, 32);
      const mat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.8 });
      this._moveMarkerMesh = new THREE.Mesh(geo, mat);
      this._moveMarkerMesh.rotation.x = Math.PI/2;
      this.scene.add(this._moveMarkerMesh);
    }
  }

  updateMoveMarker(marker) {
    this._ensureMoveMarker();
    if (!marker) { this._moveMarkerMesh.visible = false; return; }
    this._moveMarkerMesh.visible = true;
    this._moveMarkerMesh.position.set(this.wx(marker.x), -(marker.depth || 0), this.wz(marker.y));
    const pulse = 0.7 + 0.3 * Math.abs(Math.sin(this.time * 8));
    this._moveMarkerMesh.scale.setScalar(14 * pulse);
    this._moveMarkerMesh.material.opacity = Math.min(1, marker.timer) * 0.8;
  }

  // ── Camera Control ────────────────────────────────────────────
  updateCamera(dt, combat) {
    if (combat) {
      const alive = combat.playerShips.filter(s => !s.isDestroyed);
      if (alive.length > 0) {
        let cx = 0, cy = 0, cDepth = 0;
        for (const s of alive) { cx += s.x; cy += s.y; cDepth += (s.depth || 0); }
        cx /= alive.length; cy /= alive.length; cDepth /= alive.length;
        const sel = combat.selectedShip;
        if (sel && !sel.isDestroyed) {
          cx = cx * 0.4 + sel.x * 0.6;
          cy = cy * 0.4 + sel.y * 0.6;
          cDepth = cDepth * 0.5 + sel.depth * 0.5;
        }
        const lr = 2.5 * dt;
        this.camTarget.x += (this.wx(cx) - this.camTarget.x) * lr;
        this.camTarget.z += (this.wz(cy) - this.camTarget.z) * lr;
        this.camTarget.y += (-cDepth - this.camTarget.y) * lr;  // follow depth

        // Update click plane depth for world-position raycasting
        this.clickPlaneY = -cDepth;
        this.clickPlane.constant = cDepth;
      }

      // Show selection ring under selected ship
      if (this._selRing) {
        const sel = combat.selectedShip;
        if (sel && !sel.isDestroyed) {
          const scale = sel.size * 0.085;
          this._selRing.visible = true;
          this._selRing.position.set(this.wx(sel.x), -(sel.depth || 0) - 2, this.wz(sel.y));
          this._selRing.scale.setScalar(scale + scale * 0.25 * Math.sin(this.time * 5));
        } else {
          this._selRing.visible = false;
        }
      }
    }
    this.camera.position.set(
      this.camTarget.x,
      this.camTarget.y + this.camHeight,
      this.camTarget.z + this.camTilt
    );
    this.camera.lookAt(this.camTarget);
  }

  panCamera(dx, dy) {
    const pan = 1.5 / (this.camHeight / 900);
    this.camTarget.x += dx * pan;
    this.camTarget.z += dy * pan;
  }

  zoomCamera(delta) {
    this.camHeight = Math.max(300, Math.min(2200, this.camHeight + delta * 0.8));
    this.camTilt = this.camHeight * 0.75;
  }

  // ── Input Raycasting ──────────────────────────────────────────
  getWorldPosFromScreen(screenX, screenY) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((screenX - rect.left) / rect.width)  * 2 - 1;
    const ny = -((screenY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    // Intersect plane at selected ship's depth
    const target = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.clickPlaneY);
    const hit = this.raycaster.ray.intersectPlane(plane, target);
    if (!hit) return null;
    return { worldX: this.tw(target.x), worldY: this.tz(target.z) };
  }

  getShipFromScreen(screenX, screenY, combat) {
    const rect = this.canvas.getBoundingClientRect();
    const nx = ((screenX - rect.left) / rect.width)  * 2 - 1;
    const ny = -((screenY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);

    const allShips = [...combat.playerShips, ...combat.enemyShips];
    let closest = null, closestDist = Infinity;

    for (const ship of allShips) {
      if (ship.isDestroyed) continue;
      const data = this.shipMeshes.get(ship.id);
      if (!data) continue;
      const shipPos = new THREE.Vector3(this.wx(ship.x), -(ship.depth || 0), this.wz(ship.y));
      const sphere = new THREE.Sphere(shipPos, ship.size * 2.8);
      if (this.raycaster.ray.intersectsSphere(sphere)) {
        const d = this.raycaster.ray.origin.distanceTo(shipPos);
        if (d < closestDist) { closestDist = d; closest = ship; }
      }
    }
    return closest;
  }

  // ── Resize ────────────────────────────────────────────────────
  resize(w, h) {
    this.W = w; this.H = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // ── Main Render ───────────────────────────────────────────────
  renderCombat(combat, dt) {
    this.time += dt;

    // Underwater environment animation
    this._updateWaterSurface(dt);
    this._updateBiolum(dt);
    this._updateLightShafts(dt);

    // Biolum light drift
    for (const bl of this.biolumLights) {
      const ph = bl.userData.phase;
      const r  = bl.userData.orbitR;
      bl.position.x += Math.sin(this.time * 0.2 + ph) * r * dt * 0.5;
      bl.position.z += Math.cos(this.time * 0.15 + ph) * r * dt * 0.5;
      bl.intensity = 0.3 + 0.2 * Math.sin(this.time * 0.9 + ph);
    }

    // Camera
    this.updateCamera(dt, combat);

    // Ships
    const allShips = [...combat.playerShips, ...combat.enemyShips];
    for (const s of allShips) this.updateShipMesh(s);

    // Projectiles
    this.updateProjectileMeshes(combat.projectiles);

    // Drones
    this.updateDroneMeshes(combat.drones);

    // Effects (sync from engine effects)
    for (const e of combat.effects) {
      if (!e._3dAdded) { e._3dAdded = true; this.addEffect(e); }
    }
    this._updateEffects(dt);

    // Move marker
    this.updateMoveMarker(combat.moveMarker);

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  // ── Background-only render (for menus) ────────────────────────
  renderBackground(dt) {
    this.time += dt;
    this._updateWaterSurface(dt);
    this._updateBiolum(dt);
    this._updateLightShafts(dt);
    for (const bl of this.biolumLights) {
      const ph = bl.userData.phase;
      bl.intensity = 0.3 + 0.2 * Math.sin(this.time * 0.9 + ph);
    }
    const lookAt = new THREE.Vector3(0, -60, 0);
    this.camera.position.set(0, this.camHeight - 60, this.camTilt);
    this.camera.lookAt(lookAt);
    this.renderer.render(this.scene, this.camera);
  }

  // Clean up combat entities when combat ends
  clearCombatEntities() {
    for (const [id, data] of this.shipMeshes) {
      this.scene.remove(data.container);
    }
    this.shipMeshes.clear();
    for (const [id, mesh] of this.projMeshes) {
      this.scene.remove(mesh);
    }
    this.projMeshes.clear();
    for (const [id, mesh] of this.droneMeshes) {
      this.scene.remove(mesh);
    }
    this.droneMeshes.clear();
    for (const e of this.activeEffects) {
      this.scene.remove(e.mesh);
      if (e.light) this.scene.remove(e.light);
    }
    this.activeEffects = [];
    if (this._moveMarkerMesh) this._moveMarkerMesh.visible = false;
    this.terrainGroup.clear();
  }
}
