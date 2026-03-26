'use strict';
// ================================================================
// RENDER.JS — Three.js 3D renderer (procedural geometry, no assets)
// ================================================================

// ── Value Noise (multi-octave, used for terrain) ──────────────────
const Noise = {
  _h(a, b, s = 0) {
    let n = (a * 1619 ^ b * 31337 ^ s * 6791) | 0;
    n = ((n ^ (n << 13)) * 1664525 + 1013904223) | 0;
    n = ((n ^ (n >>> 17)) * 1664525 + 1013904223) | 0;
    return (n >>> 0) / 4294967296;
  },
  smooth(t) { return t * t * t * (t * (t * 6 - 15) + 10); }, // Perlin fade
  base(x, y, seed = 0) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = this.smooth(xf), v = this.smooth(yf);
    const a = this.lerp(this._h(xi, yi, seed),   this._h(xi+1, yi, seed),   u);
    const b = this.lerp(this._h(xi, yi+1, seed), this._h(xi+1, yi+1, seed), u);
    return this.lerp(a, b, v);
  },
  lerp(a, b, t) { return a + (b - a) * t; },
  fbm(x, y, octaves = 5, lacunarity = 2.1, gain = 0.48, seed = 0) {
    let v = 0, amp = 1, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
      v   += this.base(x * freq, y * freq, seed + i * 937) * amp;
      max += amp;
      amp  *= gain;
      freq *= lacunarity;
    }
    return v / max; // 0..1
  },
};

// ── Ship Model Factory ────────────────────────────────────────────
const ShipModels = {
  _mat(color, glow, metal=0.7, rough=0.25, emissInt=0.32) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(glow || color),
      emissiveIntensity: emissInt,
      metalness: metal,
      roughness: rough,
    });
  },
  // Accent material — vivid panel/stripe in faction color (emissive so it glows faintly)
  _accent(color) {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.65,
      metalness: 0.5,
      roughness: 0.3,
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
  // Forward = -Z, Aft = +Z. Engine nozzles: CylinderGeometry rx=PI/2 makes axis point +Z.
  // Bow cones: ConeGeometry rx=PI/2 makes apex point -Z (forward). Position at bow (negative Z).
  skiff(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color, glow, 0.75, 0.2, 0.28);
    const acc = this._accent(glow);
    const glowMat = this._glow(glow);
    // Hull — narrow knife shape
    this._addMesh(g, new THREE.BoxGeometry(14, 4, 52), mat);
    // Sensor fairing on top bow
    this._addMesh(g, new THREE.CylinderGeometry(2.5, 2.5, 10, 6), mat, 0, 4, -28, Math.PI/2, 0, 0);
    this._addMesh(g, new THREE.SphereGeometry(2.5, 6, 5), mat, 0, 4, -23);
    // Accent chine stripe along hull
    this._addMesh(g, new THREE.BoxGeometry(15, 1, 48), acc, 0, 3, 0);
    // Wing fins — delta swept
    this._addMesh(g, new THREE.BoxGeometry(30, 2, 18), mat, 0, -1, 8);
    this._addMesh(g, new THREE.BoxGeometry(14, 1.5, 10), acc, -15, -1, 12);
    this._addMesh(g, new THREE.BoxGeometry(14, 1.5, 10), acc,  15, -1, 12);
    // Engine nozzle (single, center aft)
    this._addMesh(g, new THREE.CylinderGeometry(3, 5, 10, 8), glowMat, 0, 0, 27, Math.PI/2, 0, 0);
    g.userData.engineGlow = g.children[g.children.length - 1];
    return g;
  },

  cutter(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color, glow, 0.72, 0.22, 0.28);
    const acc = this._accent(glow);
    const glowMat = this._glow(glow);
    // Hull
    this._addMesh(g, new THREE.BoxGeometry(20, 6, 68), mat);
    // Bridge superstructure
    this._addMesh(g, new THREE.BoxGeometry(12, 7, 18), mat, 0, 6.5, -8);
    this._addMesh(g, new THREE.BoxGeometry(7, 4, 8), mat, 0, 11, -10);
    // Sensor mast
    this._addMesh(g, new THREE.CylinderGeometry(0.8, 0.8, 9, 5), mat, 0, 16, -10);
    // Accent stripe
    this._addMesh(g, new THREE.BoxGeometry(21, 1, 60), acc, 0, 4, 0);
    // Wing sponsons
    this._addMesh(g, new THREE.BoxGeometry(36, 3, 22), mat, 0, -1, 8);
    this._addMesh(g, new THREE.BoxGeometry(14, 2, 14), acc, -17, -1, 10);
    this._addMesh(g, new THREE.BoxGeometry(14, 2, 14), acc,  17, -1, 10);
    // Dual engines
    this._addMesh(g, new THREE.CylinderGeometry(3, 5, 10, 8), glowMat, -7, -2, 35, Math.PI/2, 0, 0);
    this._addMesh(g, new THREE.CylinderGeometry(3, 5, 10, 8), glowMat,  7, -2, 35, Math.PI/2, 0, 0);
    g.userData.engineGlow = g.children[g.children.length - 2];
    return g;
  },

  frigate(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color, glow, 0.75, 0.22, 0.30);
    const acc = this._accent(glow);
    const glowMat = this._glow(glow);
    // Hull
    this._addMesh(g, new THREE.BoxGeometry(26, 8, 88), mat);
    // Superstructure
    this._addMesh(g, new THREE.BoxGeometry(15, 9, 28), mat, 0, 8.5, -12);
    this._addMesh(g, new THREE.BoxGeometry(9, 6, 14), mat, 0, 15, -15);
    // Radar mast + dish
    this._addMesh(g, new THREE.CylinderGeometry(0.7, 0.7, 10, 5), mat, 0, 22, -16);
    this._addMesh(g, new THREE.TorusGeometry(4, 0.9, 5, 10), mat, 0, 30, -16, Math.PI/2, 0, 0);
    // Accent chine stripes
    this._addMesh(g, new THREE.BoxGeometry(27, 1, 80), acc, 0, 5, 0);
    // Torpedo launcher tubes (corrected arg order: pos then rot)
    this._addMesh(g, new THREE.CylinderGeometry(2.5, 2.5, 32, 7), mat, -16, 0, -8, 0, 0, Math.PI/2);
    this._addMesh(g, new THREE.CylinderGeometry(2.5, 2.5, 32, 7), mat,  16, 0, -8, 0, 0, Math.PI/2);
    // Torpedo accent caps
    this._addMesh(g, new THREE.SphereGeometry(2.5, 6, 5), acc, -32, 0, -8);
    this._addMesh(g, new THREE.SphereGeometry(2.5, 6, 5), acc,  32, 0, -8);
    // Gun turret (front)
    this._addMesh(g, new THREE.CylinderGeometry(5, 5, 4, 8), mat, 0, 13, -32);
    this._addMesh(g, new THREE.BoxGeometry(3, 3, 18), mat, 0, 16, -36);
    // Engines
    this._addMesh(g, new THREE.CylinderGeometry(4, 6, 12, 8), glowMat, -8, -2, 43, Math.PI/2, 0, 0);
    this._addMesh(g, new THREE.CylinderGeometry(4, 6, 12, 8), glowMat,  8, -2, 43, Math.PI/2, 0, 0);
    g.userData.engineGlow = g.children[g.children.length - 2];
    return g;
  },

  gunship(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color, glow, 0.78, 0.2, 0.32);
    const acc = this._accent(glow);
    const glowMat = this._glow(glow);
    // Wide armored hull
    this._addMesh(g, new THREE.BoxGeometry(40, 10, 80), mat);
    // Raised armored deck
    this._addMesh(g, new THREE.BoxGeometry(26, 5, 52), mat, 0, 7.5, -5);
    // Accent hull band
    this._addMesh(g, new THREE.BoxGeometry(41, 2, 72), acc, 0, 3, 0);
    // 3 weapon turrets
    for (let i = -1; i <= 1; i++) {
      this._addMesh(g, new THREE.CylinderGeometry(5.5, 5.5, 5, 8), mat, i * 13, 14, -12);
      this._addMesh(g, new THREE.BoxGeometry(3.5, 3.5, 20), mat, i * 13, 17, -18);
      this._addMesh(g, new THREE.CylinderGeometry(1.2, 1.2, 14, 5), acc, i * 13, 17, -24);
    }
    // Side armor sponsons
    this._addMesh(g, new THREE.BoxGeometry(6, 8, 60), mat, -23, 0, 4);
    this._addMesh(g, new THREE.BoxGeometry(6, 8, 60), mat,  23, 0, 4);
    // Triple engines
    for (let i = -1; i <= 1; i++) {
      this._addMesh(g, new THREE.CylinderGeometry(4, 7, 12, 8), glowMat, i * 10, -3, 40, Math.PI/2, 0, 0);
    }
    g.userData.engineGlow = g.children[g.children.length - 2];
    return g;
  },

  cruiser(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color, glow, 0.80, 0.20, 0.32);
    const acc = this._accent(glow);
    const glowMat = this._glow(glow);
    // Main hull
    this._addMesh(g, new THREE.BoxGeometry(48, 12, 112), mat);
    // Central superstructure
    this._addMesh(g, new THREE.BoxGeometry(26, 13, 48), mat, 0, 12.5, -14);
    // Bridge tower
    this._addMesh(g, new THREE.BoxGeometry(13, 16, 13), mat, 0, 26, -20);
    this._addMesh(g, new THREE.BoxGeometry(8, 5, 9), mat, 0, 34, -22);
    // Radar mast + dish
    this._addMesh(g, new THREE.CylinderGeometry(0.8, 0.8, 12, 5), mat, 0, 38, -22);
    this._addMesh(g, new THREE.TorusGeometry(5.5, 1.1, 5, 12), mat, 0, 47, -22, Math.PI/2, 0, 0);
    // Accent hull stripes (port + starboard chines)
    this._addMesh(g, new THREE.BoxGeometry(49, 1.5, 100), acc, 0, 5, 0);
    this._addMesh(g, new THREE.BoxGeometry(3, 11, 90), acc, -24, 0, 6);
    this._addMesh(g, new THREE.BoxGeometry(3, 11, 90), acc,  24, 0, 6);
    // Side wing pontoons
    this._addMesh(g, new THREE.BoxGeometry(11, 5, 68), mat, -31, 0, 6);
    this._addMesh(g, new THREE.BoxGeometry(11, 5, 68), mat,  31, 0, 6);
    // Main turrets (2 forward)
    this._addMesh(g, new THREE.CylinderGeometry(7, 7, 6, 8), mat, -13, 18, -38);
    this._addMesh(g, new THREE.CylinderGeometry(7, 7, 6, 8), mat,  13, 18, -38);
    this._addMesh(g, new THREE.BoxGeometry(3.5, 3.5, 24), mat, -13, 22, -44);
    this._addMesh(g, new THREE.BoxGeometry(3.5, 3.5, 24), mat,  13, 22, -44);
    // Accent turret rings
    this._addMesh(g, new THREE.TorusGeometry(7.2, 0.7, 5, 12), acc, -13, 19, -38, Math.PI/2, 0, 0);
    this._addMesh(g, new THREE.TorusGeometry(7.2, 0.7, 5, 12), acc,  13, 19, -38, Math.PI/2, 0, 0);
    // Rear engines (triple)
    for (let i = -1; i <= 1; i++) {
      this._addMesh(g, new THREE.CylinderGeometry(5, 8, 14, 8), glowMat, i * 14, -4, 56, Math.PI/2, 0, 0);
    }
    g.userData.engineGlow = g.children[g.children.length - 2];
    return g;
  },

  carrier(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color, glow, 0.65, 0.35, 0.22);
    const acc = this._accent(glow);
    const glowMat = this._glow(glow);
    // Flat wide hull
    this._addMesh(g, new THREE.BoxGeometry(68, 8, 125), mat);
    // Flight deck on top
    this._addMesh(g, new THREE.BoxGeometry(66, 2.5, 116), mat, 0, 5.2, 0);
    // Deck accent markings
    this._addMesh(g, new THREE.BoxGeometry(66, 0.5, 4), acc, 0, 6.2, -40);
    this._addMesh(g, new THREE.BoxGeometry(66, 0.5, 4), acc, 0, 6.2,  10);
    // Island superstructure (to starboard)
    this._addMesh(g, new THREE.BoxGeometry(13, 24, 28), mat, 27, 16, -12);
    this._addMesh(g, new THREE.BoxGeometry(9, 5, 18), mat, 27, 26, -14);
    // Island antenna mast
    this._addMesh(g, new THREE.CylinderGeometry(0.7, 0.7, 14, 5), mat, 27, 38, -16);
    this._addMesh(g, new THREE.TorusGeometry(5, 0.9, 5, 10), mat, 27, 48, -16, Math.PI/2, 0, 0);
    // Catapult rails
    this._addMesh(g, new THREE.BoxGeometry(1.5, 0.8, 85), acc, -16, 6.5, -8);
    this._addMesh(g, new THREE.BoxGeometry(1.5, 0.8, 85), acc,   6, 6.5, -8);
    // Hull accent band
    this._addMesh(g, new THREE.BoxGeometry(69, 1.5, 112), acc, 0, 3, 0);
    // Engines (5 across)
    for (let i = -2; i <= 2; i++) {
      this._addMesh(g, new THREE.CylinderGeometry(4, 7, 12, 8), glowMat, i * 12, -3, 62, Math.PI/2, 0, 0);
    }
    g.userData.engineGlow = g.children[g.children.length - 3];
    return g;
  },

  dreadnought(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color, glow, 0.88, 0.15, 0.38);
    const acc = this._accent(glow);
    const glowMat = this._glow(glow);
    // Massive armored hull
    this._addMesh(g, new THREE.BoxGeometry(66, 20, 172), mat);
    // Upper superstructure
    this._addMesh(g, new THREE.BoxGeometry(38, 17, 78), mat, 0, 18.5, -18);
    // Bridge fortress
    this._addMesh(g, new THREE.BoxGeometry(20, 20, 20), mat, 0, 35.5, -32);
    this._addMesh(g, new THREE.BoxGeometry(12, 6, 12), mat, 0, 42, -34);
    // Sensor tower
    this._addMesh(g, new THREE.CylinderGeometry(1, 1, 14, 6), mat, 0, 52, -36);
    this._addMesh(g, new THREE.TorusGeometry(6, 1.1, 5, 12), mat, 0, 62, -36, Math.PI/2, 0, 0);
    // Armor belts (accent color on sides)
    this._addMesh(g, new THREE.BoxGeometry(8, 24, 118), mat, -37, 0, 6);
    this._addMesh(g, new THREE.BoxGeometry(8, 24, 118), mat,  37, 0, 6);
    // Accent hull stripes
    this._addMesh(g, new THREE.BoxGeometry(67, 2, 150), acc, 0, 4, 0);
    this._addMesh(g, new THREE.BoxGeometry(4, 18, 110), acc, -33, 0, 8);
    this._addMesh(g, new THREE.BoxGeometry(4, 18, 110), acc,  33, 0, 8);
    // Main turrets (4 pairs — A/B forward, C/D aft)
    for (const tz of [-62, -32, 22, 54]) {
      this._addMesh(g, new THREE.CylinderGeometry(9.5, 9.5, 9, 8), mat, 0, 24, tz);
      this._addMesh(g, new THREE.BoxGeometry(5.5, 5.5, 32), mat, -8, 29, tz - 4);
      this._addMesh(g, new THREE.BoxGeometry(5.5, 5.5, 32), mat,  8, 29, tz - 4);
      this._addMesh(g, new THREE.TorusGeometry(10, 0.8, 5, 12), acc, 0, 25, tz, Math.PI/2, 0, 0);
    }
    // Secondary side gun mounts
    for (const x of [-33, 33]) {
      for (const tz of [-42, 0, 42]) {
        this._addMesh(g, new THREE.CylinderGeometry(4.5, 4.5, 4.5, 6), mat, x, 10, tz);
        this._addMesh(g, new THREE.BoxGeometry(2.5, 2.5, 20), mat, x, 13, tz - 4);
      }
    }
    // Five engines
    for (let i = -2; i <= 2; i++) {
      this._addMesh(g, new THREE.CylinderGeometry(5, 10, 16, 8), glowMat, i * 12, -8, 86, Math.PI/2, 0, 0);
    }
    g.userData.engineGlow = g.children[g.children.length - 3];
    return g;
  },

  // ── SPECIALIST PLAYER HULLS ───────────────────────────────────
  recon(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color, glow, 0.5, 0.2, 0.35);
    const acc = this._accent(glow);
    const glowMat = this._glow(glow);
    // Needle hull — ultra-narrow
    this._addMesh(g, new THREE.BoxGeometry(6, 3, 55), mat);
    // Sensor sphere at bow
    this._addMesh(g, new THREE.SphereGeometry(3.5, 8, 6), mat, 0, 0, -30);
    // Sensor ring around bow sphere
    this._addMesh(g, new THREE.TorusGeometry(4.5, 0.6, 6, 16), acc, 0, 0, -30, Math.PI/2, 0, 0);
    // Passive array spine on top
    this._addMesh(g, new THREE.BoxGeometry(1, 1, 36), acc, 0, 2.5, -4);
    // Stubby delta fins
    this._addMesh(g, new THREE.BoxGeometry(22, 1, 14), mat, 0, -1, 8);
    this._addMesh(g, new THREE.BoxGeometry(8, 0.8, 8), acc, -10, -1, 12);
    this._addMesh(g, new THREE.BoxGeometry(8, 0.8, 8), acc,  10, -1, 12);
    // Micro engine
    this._addMesh(g, new THREE.CylinderGeometry(1.8, 3, 7, 7), glowMat, 0, 0, 29, Math.PI/2, 0, 0);
    g.userData.engineGlow = g.children[g.children.length - 1];
    return g;
  },

  spectre(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color, glow, 0.4, 0.35, 0.4);
    const acc = this._accent(glow);
    const glowMat = this._glow(glow);
    // Wide flat delta hull
    this._addMesh(g, new THREE.BoxGeometry(46, 4, 56), mat);
    // Raised center spine
    this._addMesh(g, new THREE.BoxGeometry(10, 5, 44), mat, 0, 4.5, 0);
    // Forward sensor dome
    this._addMesh(g, new THREE.SphereGeometry(6, 8, 6), mat, 0, 3, -25);
    // EW antenna arrays (port & starboard, angled out)
    this._addMesh(g, new THREE.CylinderGeometry(0.7, 0.7, 28, 6), acc, -20, 4, -4, 0, 0, 0.35);
    this._addMesh(g, new THREE.CylinderGeometry(0.7, 0.7, 28, 6), acc,  20, 4, -4, 0, 0, -0.35);
    // EW emitter spheres at antenna tips
    this._addMesh(g, new THREE.SphereGeometry(2, 6, 5), glowMat, -28, 10, -4);
    this._addMesh(g, new THREE.SphereGeometry(2, 6, 5), glowMat,  28, 10, -4);
    // Accent hull stripe
    this._addMesh(g, new THREE.BoxGeometry(47, 1, 50), acc, 0, 3, 0);
    // Swept wing edges
    this._addMesh(g, new THREE.BoxGeometry(4, 2, 40), mat, -23, 0, 5);
    this._addMesh(g, new THREE.BoxGeometry(4, 2, 40), mat,  23, 0, 5);
    // Twin engines
    this._addMesh(g, new THREE.CylinderGeometry(2.5, 4, 9, 7), glowMat, -8, -1, 29, Math.PI/2, 0, 0);
    this._addMesh(g, new THREE.CylinderGeometry(2.5, 4, 9, 7), glowMat,  8, -1, 29, Math.PI/2, 0, 0);
    g.userData.engineGlow = g.children[g.children.length - 2];
    return g;
  },

  longbow(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color, glow, 0.80, 0.18, 0.30);
    const acc = this._accent(glow);
    const glowMat = this._glow(glow);
    // Narrow lance hull
    this._addMesh(g, new THREE.BoxGeometry(18, 6, 82), mat);
    // Artillery barrel — long gun jutting forward
    this._addMesh(g, new THREE.CylinderGeometry(3.5, 3.5, 58, 7), mat, 0, 2, -62, Math.PI/2, 0, 0);
    this._addMesh(g, new THREE.SphereGeometry(3.5, 7, 6), mat, 0, 2, -91);
    // Gunbase / breech housing
    this._addMesh(g, new THREE.BoxGeometry(14, 9, 16), mat, 0, 5, -28);
    // Compact bridge amidships
    this._addMesh(g, new THREE.BoxGeometry(10, 7, 12), mat, 0, 6.5, 0);
    this._addMesh(g, new THREE.BoxGeometry(6, 4, 6),  mat, 0, 11.5, -2);
    // Accent hull stripe
    this._addMesh(g, new THREE.BoxGeometry(19, 1.5, 75), acc, 0, 4, 0);
    // Narrow wing fins
    this._addMesh(g, new THREE.BoxGeometry(30, 2, 16), mat, 0, -2, 14);
    this._addMesh(g, new THREE.BoxGeometry(10, 1.5, 10), acc, -14, -2, 18);
    this._addMesh(g, new THREE.BoxGeometry(10, 1.5, 10), acc,  14, -2, 18);
    // Single large engine
    this._addMesh(g, new THREE.CylinderGeometry(4.5, 7.5, 14, 8), glowMat, 0, -1, 42, Math.PI/2, 0, 0);
    g.userData.engineGlow = g.children[g.children.length - 1];
    return g;
  },

  // ── KETH'VARI (organic, bioluminescent) ──────────────────────
  keth_spore(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color,glow,0.1,0.9,0.6);
    const glowMat = this._glow(glow);
    this._addMesh(g, new THREE.SphereGeometry(12,8,8), mat, 0,0,-2);
    // Stinger pointing forward (-Z)
    this._addMesh(g, new THREE.ConeGeometry(6,16,6), mat, 0,0,-18, -Math.PI/2,0,0);
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
    this._addMesh(g, new THREE.ConeGeometry(6,25,6), mat, 0,0,-30, -Math.PI/2,0,0);
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
    this._addMesh(g, new THREE.ConeGeometry(18,35,8), mat, 0,-5,-45, -Math.PI/2,0,0);
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

  destroyer(color, glow) {
    const g = new THREE.Group();
    const mat = this._mat(color, glow, 0.72, 0.22, 0.28);
    const acc = this._accent(glow);
    const glowMat = this._glow(glow);
    // Sleek elongated hull
    this._addMesh(g, new THREE.BoxGeometry(18, 5, 70), mat);
    // Compact bridge
    this._addMesh(g, new THREE.BoxGeometry(10, 6, 15), mat, 0, 5.5, -8);
    this._addMesh(g, new THREE.BoxGeometry(6, 3, 7), mat, 0, 9.5, -10);
    // Accent chine
    this._addMesh(g, new THREE.BoxGeometry(19, 1, 64), acc, 0, 3.5, 0);
    // Fwd CIWS dome
    this._addMesh(g, new THREE.CylinderGeometry(5, 5.5, 3, 8), mat, 0, 5.5, -25);
    this._addMesh(g, new THREE.SphereGeometry(4.5, 8, 5), glowMat, 0, 8.5, -25);
    // Aft CIWS dome
    this._addMesh(g, new THREE.CylinderGeometry(5, 5.5, 3, 8), mat, 0, 5.5, 18);
    this._addMesh(g, new THREE.SphereGeometry(4.5, 8, 5), glowMat, 0, 8.5, 18);
    // Wing sponsons
    this._addMesh(g, new THREE.BoxGeometry(32, 2.5, 18), mat, 0, -1, 10);
    this._addMesh(g, new THREE.BoxGeometry(12, 1.5, 12), acc, -16, -1, 15);
    this._addMesh(g, new THREE.BoxGeometry(12, 1.5, 12), acc,  16, -1, 15);
    // Triple engine nozzles
    this._addMesh(g, new THREE.CylinderGeometry(2.5, 4, 9, 8), glowMat, -6, -1, 37, Math.PI/2, 0, 0);
    this._addMesh(g, new THREE.CylinderGeometry(2.5, 4, 9, 8), glowMat,  6, -1, 37, Math.PI/2, 0, 0);
    this._addMesh(g, new THREE.CylinderGeometry(2,   3.5, 8, 8), glowMat, 0, -2, 38, Math.PI/2, 0, 0);
    g.userData.engineGlow = g.children[g.children.length - 1];
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

  // Build a single turret group for a slot. sf = hull scale factor (ship.size/20).
  // slotDef: {pos, facing, weaponId or weapon}
  buildTurretGroup(slotDef, sf) {
    const weaponDef = slotDef.weapon || (slotDef.weaponId ? WEAPON_DATA[slotDef.weaponId] : null);
    if (!weaponDef) return null;
    const lx = slotDef.pos.x / sf;
    const lz = -slotDef.pos.y / sf;
    const ly = sf * 3 + 0.5;
    const tGroup = new THREE.Group();
    tGroup.position.set(lx, ly, lz);
    tGroup.rotation.y = -slotDef.facing;
    tGroup.userData.slot = slotDef;
    const wCol = new THREE.Color(weaponDef.pColor || weaponDef.color || '#aaaaaa');
    // Mount base
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1a2530, metalness: 0.85, roughness: 0.3 });
    tGroup.add(new THREE.Mesh(new THREE.BoxGeometry(4, 1.6, 4), baseMat));
    if (weaponDef.type === 'torpedo') {
      const tubeMat = new THREE.MeshStandardMaterial({ color: 0x2a3540, emissive: wCol, emissiveIntensity: 0.15, metalness: 0.8, roughness: 0.3 });
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 9, 7), tubeMat);
      tube.rotation.x = Math.PI / 2; tube.position.set(0, 1.2, -3.5);
      tGroup.add(tube);
      const capMat = new THREE.MeshBasicMaterial({ color: wCol, transparent: true, opacity: 0.7 });
      const cap = new THREE.Mesh(new THREE.CircleGeometry(1.1, 8), capMat);
      cap.rotation.x = Math.PI / 2; cap.position.set(0, 1.2, -8.2);
      tGroup.add(cap);
    } else if (weaponDef.type === 'beam') {
      const ringMat = new THREE.MeshStandardMaterial({ color: wCol, emissive: wCol, emissiveIntensity: 1.2, metalness: 0.4, roughness: 0.4 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.55, 6, 14), ringMat);
      ring.rotation.x = Math.PI / 2; ring.position.set(0, 1.5, -1.5);
      tGroup.add(ring);
      const lensMat = new THREE.MeshBasicMaterial({ color: wCol, transparent: true, opacity: 0.4 });
      const lens = new THREE.Mesh(new THREE.CircleGeometry(2.2, 12), lensMat);
      lens.rotation.x = Math.PI / 2; lens.position.set(0, 1.5, -1.5);
      tGroup.add(lens);
    } else if (weaponDef.type === 'ciws') {
      const domeMat = new THREE.MeshStandardMaterial({ color: 0x333a40, metalness: 0.9, roughness: 0.2 });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(2.5, 8, 5, 0, Math.PI*2, 0, Math.PI/2), domeMat);
      dome.position.y = 0.8; tGroup.add(dome);
      const muzzleMat = new THREE.MeshBasicMaterial({ color: wCol, transparent: true, opacity: 0.8 });
      const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3, 5), muzzleMat);
      muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 2.5, -3.2);
      tGroup.add(muzzle);
    } else if (weaponDef.type === 'drone' || weaponDef.type === 'ew') {
      const panelMat = new THREE.MeshStandardMaterial({ color: wCol, emissive: wCol, emissiveIntensity: 0.3, metalness: 0.5, roughness: 0.5 });
      const panel = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.8, 5.5), panelMat);
      panel.position.y = 1.2; tGroup.add(panel);
    } else {
      const heavy = weaponDef.dmg > 35;
      const br = heavy ? 1.0 : 0.65, bl = heavy ? 9 : 6;
      const barrelMat = new THREE.MeshStandardMaterial({ color: 0x1e2830, metalness: 0.92, roughness: 0.18 });
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(br*0.8, br, bl, 7), barrelMat);
      barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 1.4, -bl/2 - 1.2);
      tGroup.add(barrel);
      const muzzleMat = new THREE.MeshBasicMaterial({ color: wCol, transparent: true, opacity: 0.55 });
      const muzzle = new THREE.Mesh(new THREE.CircleGeometry(br*0.8, 7), muzzleMat);
      muzzle.rotation.x = Math.PI / 2; muzzle.position.set(0, 1.4, -(bl + 1.8));
      tGroup.add(muzzle);
    }
    return tGroup;
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
    this.renderer.setClearColor(0x091e2e);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x091e2e, 0.00035);

    // Camera — spherical coords: camDist = distance from target, camElevation = angle above horizontal
    this.camera = new THREE.PerspectiveCamera(55, this.W / this.H, 5, 30000);
    this.camTarget    = new THREE.Vector3(0, 0, 0);
    this.camDist      = 2000;                        // distance from camTarget
    this.camElevation = Math.atan2(1600, 1200);      // ~53° above horizontal (matches old defaults)
    this.camAzimuth   = 0;                           // horizontal orbit angle (radians)
    this.camMode      = 'free';                      // 'free' | 'follow' — set each frame in updateCamera
    this._applyCameraPosition();
    this.camera.lookAt(this.camTarget);

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
    this.scene.background = null;  // replaced by depth gradient sphere
    this.scene.fog = new THREE.FogExp2(0x091e2e, 0.00035);  // thick — hides world edges

    // Ambient — cold blue-teal, deep ocean
    const ambient = new THREE.AmbientLight(0x0b2a40, 2.6);
    this.scene.add(ambient);
    this._ambientLight = ambient;

    // Diffuse "surface light" from above — simulates sunlight filtered down
    const surfaceLight = new THREE.DirectionalLight(0x2a8ab0, 1.4);
    surfaceLight.position.set(0, 1, -0.3);  // coming from above, angled
    surfaceLight.castShadow = false;         // shadows disabled — too expensive
    this.scene.add(surfaceLight);
    this._surfaceLight = surfaceLight;

    // Bioluminescent accent lights — keep count low, each is a shader cost per mesh
    this.biolumLights = [];
    const blColors = [0x00cc77, 0x0077cc, 0x55ccaa, 0x007744, 0x0099bb];
    for (let i = 0; i < 2; i++) {
      const bl = new THREE.PointLight(blColors[i], 0.8, 1800);
      bl.position.set(
        (Math.random() - 0.5) * WORLD_W * 0.8,
        -80 - Math.random() * 400,
        (Math.random() - 0.5) * WORLD_H * 0.8
      );
      bl.userData.phase = Math.random() * Math.PI * 2;
      bl.userData.orbitR = 300 + Math.random() * 600;
      bl.userData.orbitY = -80 - Math.random() * 500;
      this.scene.add(bl);
      this.biolumLights.push(bl);
    }

    // Scene geometry
    this._createDepthBackground();
    this._createDepthAtmosphere();
    this._createWorldBorder();
    this._createSeafloor();
    this._createFloorAtmoPlanes();
    this._createWaterSurface();
    this._createLightShafts();
    this._createCaustics();
    this._createSandRidges();
    this._createBiolumParticles();
    this._createSeaGrass();
    this._createSeafloorRocks();
    this._createEdgeFog();

    // Terrain objects group
    this.terrainGroup = new THREE.Group();
    this.scene.add(this.terrainGroup);

    // Selection indicator (ring under selected ship)
    this._createSelectionRing();
  }

  // ── Biome visual themes ───────────────────────────────────────
  _applyBiomeTheme(biome) {
    const THEMES = {
      abyssal:      { fog: 0x091e2e, fogD: 0.00035, amb: 0x0b2a40, ambI: 2.4, surf: 0x2a8ab0, surfI: 1.6, bl: 0x00e5b0, blOp: 0.90, pts: [0x00cc77, 0x0077cc] },
      vent_field:   { fog: 0x1a1408, fogD: 0.00040, amb: 0x2a1508, ambI: 2.2, surf: 0xb06820, surfI: 1.4, bl: 0xff8800, blOp: 0.95, pts: [0xff6600, 0xff9900] },
      kelp_forest:  { fog: 0x081e10, fogD: 0.00042, amb: 0x0a2812, ambI: 2.6, surf: 0x3a9040, surfI: 1.7, bl: 0x44ff66, blOp: 0.95, pts: [0x00cc44, 0x44cc00] },
      seamount:     { fog: 0x0c1e30, fogD: 0.00030, amb: 0x0c1832, ambI: 2.2, surf: 0x4090d0, surfI: 1.8, bl: 0x66ccff, blOp: 0.85, pts: [0x4488cc, 0x0088ff] },
      wreck_field:  { fog: 0x141a0c, fogD: 0.00045, amb: 0x181a10, ambI: 2.0, surf: 0x709050, surfI: 1.3, bl: 0x99ee44, blOp: 0.80, pts: [0x88aa22, 0xaacc44] },
      crystal_caves:{ fog: 0x120822, fogD: 0.00038, amb: 0x1a0830, ambI: 2.8, surf: 0x9040e0, surfI: 1.5, bl: 0xcc66ff, blOp: 1.00, pts: [0xaa22ff, 0x6633cc] },
    };
    const t = THEMES[biome] || THEMES.abyssal;
    this.scene.fog.color.setHex(t.fog);
    this.scene.fog.density = t.fogD;
    this.renderer.setClearColor(t.fog);
    if (this._skyUniforms) this._skyUniforms.uFogColor.value.setHex(t.fog);
    if (this._edgeFogMeshes) {
      for (const m of this._edgeFogMeshes) m.material.color.setHex(t.fog);
    }
    if (this._ambientLight) {
      this._ambientLight.color.setHex(t.amb);
      this._ambientLight.intensity = t.ambI;
    }
    if (this._surfaceLight) {
      this._surfaceLight.color.setHex(t.surf);
      this._surfaceLight.intensity = t.surfI;
    }
    if (this.biolumPoints) {
      this.biolumPoints.material.color.setHex(t.bl);
      this.biolumPoints.material.opacity = t.blOp;
    }
    // Recolor the ambient biolum accent lights (only non-vent ones)
    let ptIdx = 0;
    for (const bl of this.biolumLights) {
      if (!bl.userData.isVent) {
        bl.color.setHex(t.pts[ptIdx % t.pts.length]);
        ptIdx++;
      }
    }
  }

  // ── Depth gradient sky sphere — ocean ceiling above, abyss below ──────────
  // The caustic pattern always appears in the upper hemisphere so the scene
  // always looks underwater regardless of camera height.
  _createDepthBackground() {
    this._skyUniforms = { uTime: { value: 0.0 }, uFogColor: { value: new THREE.Color(0x020c18) } };
    const geo = new THREE.SphereGeometry(14000, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: this._skyUniforms,
      vertexShader: /* glsl */`
        varying float vY;
        varying vec3  vPos;
        void main() {
          vPos = normalize(position);
          vY   = vPos.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform vec3  uFogColor;
        varying float vY;
        varying vec3  vPos;
        void main() {
          float up   = clamp(vY, 0.0, 1.0);
          float down = clamp(-vY, 0.0, 1.0);
          // Derive sky gradient from fog color so horizon blends seamlessly
          // Lower hemisphere = fog color (not darker) so looking past terrain shows fog, not void
          vec3 horizonColor = uFogColor;
          vec3 surfaceGlow  = uFogColor + vec3(0.02, 0.09, 0.18);
          vec3 col = mix(horizonColor, surfaceGlow, pow(up, 2.0));
          // Below horizon: stay at fog color (very gentle darken only at extreme down angles)
          col = mix(col, uFogColor * 0.85, pow(down, 3.0));
          // Caustic water-surface ceiling — always in upper hemisphere
          // Gives the "you are inside the ocean looking up" feeling at any camera height.
          float upFade = smoothstep(0.10, 0.55, vY);
          if (upFade > 0.001) {
            vec2 p = vPos.xz * 12.0;
            float r1 = sin(p.x * 2.8 + uTime * 0.52) * sin(p.y * 3.3 - uTime * 0.38);
            float r2 = sin((p.x - p.y) * 2.2 + uTime * 0.44);
            float r3 = sin(length(p * 0.5 - 2.0) * 2.6 - uTime * 0.68);
            float pattern = (r1 + r2 + r3) * 0.333 * 0.5 + 0.5;
            float caustic  = smoothstep(0.56, 0.90, pattern);
            col += vec3(0.15, 0.55, 0.72) * caustic * upFade * 0.45;
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.frustumCulled = false;
    this.scene.add(sphere);
    this._skyMesh = sphere;
  }

  // ── Seafloor scatter glow — soft animated scatter painted on the seafloor ──
  // Replaces the old mid-water floating planes.  Sits just above the terrain mesh
  // so the effect reads as light playing on the ground rather than floating layers.
  _createDepthAtmosphere() {
    this._atmosTimeRef = { value: 0.0 };
    const VS = /* glsl */`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
    const FS = /* glsl */`
      uniform float uTime; varying vec2 vUv;
      void main(){
        vec2 p = vUv * 5.0;
        float w = sin(p.x * 1.8 + uTime * 0.07) * cos(p.y * 2.3 - uTime * 0.05) * 0.35 + 0.65;
        float spot = sin(p.x * 3.4 - uTime * 0.11) * sin(p.y * 4.1 + uTime * 0.09) * 0.5 + 0.5;
        float a = w * (0.022 + spot * 0.018);
        gl_FragColor = vec4(0.02, 0.14, 0.28, a);
      }`;
    // Layered depth haze — multiple translucent planes at different depths
    // create a sense of water volume and light attenuation.
    this._atmosMeshes = [];
    const hazeFS = /* glsl */`
      uniform float uTime, uAlpha;
      uniform vec3  uColor;
      varying vec2 vUv;
      void main(){
        vec2 p = vUv * 3.5;
        float w = sin(p.x * 1.2 + uTime * 0.04) * cos(p.y * 1.5 - uTime * 0.03) * 0.3 + 0.7;
        float a = w * uAlpha;
        gl_FragColor = vec4(uColor, a);
      }`;
    const hazeLayers = [
      { y: -150,  alpha: 0.015, color: new THREE.Color(0x051828) },
      { y: -350,  alpha: 0.025, color: new THREE.Color(0x041420) },
      { y: -550,  alpha: 0.035, color: new THREE.Color(0x030e18) },
      { y: -750,  alpha: 0.045, color: new THREE.Color(0x020a14) },
      { y: -950,  alpha: 0.050, color: new THREE.Color(0x020810) },
    ];
    for (const layer of hazeLayers) {
      const hazeMat = new THREE.ShaderMaterial({
        uniforms: { uTime: this._atmosTimeRef, uAlpha: { value: layer.alpha }, uColor: { value: layer.color } },
        vertexShader: VS, fragmentShader: hazeFS,
        transparent: true, depthWrite: false,
        side: THREE.DoubleSide, blending: THREE.NormalBlending,
      });
      const hazeMesh = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W + 30000, WORLD_H + 30000), hazeMat);
      hazeMesh.rotation.x = -Math.PI / 2;
      hazeMesh.position.y = layer.y;
      hazeMesh.frustumCulled = false;
      this.scene.add(hazeMesh);
      this._atmosMeshes.push(hazeMesh);
    }
    // Two near-seafloor glow planes — created here but terrain-draped after _createSeafloor
    this._pendingFloorAtmo = { VS, FS };
  }

  _updateDepthAtmosphere() {
    if (this._atmosTimeRef)  this._atmosTimeRef.value  = this.time;
    if (this._skyUniforms)   this._skyUniforms.uTime.value = this.time;
    // Sky sphere follows camera so it never clips
    if (this._skyMesh) this._skyMesh.position.copy(this.camera.position);
  }

  // Create near-seafloor atmo glow planes AFTER _createSeafloor so they can drape over terrain
  _createFloorAtmoPlanes() {
    const p = this._pendingFloorAtmo;
    if (!p) return;
    const segs = this._floorSegs || 100;
    const W = this._floorW || (WORLD_W + 30000);
    const H = this._floorH || (WORLD_H + 30000);
    for (const dy of [10, 28]) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: this._atmosTimeRef },
        vertexShader: p.VS, fragmentShader: p.FS,
        transparent: true, depthWrite: false,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      });
      const geo = new THREE.PlaneGeometry(W, H, segs, segs);
      if (this._floorHeights) {
        const apos = geo.attributes.position;
        for (let i = 0; i < apos.count && i < this._floorHeights.length; i++) {
          apos.setZ(i, this._floorHeights[i] + dy);
        }
        apos.needsUpdate = true;
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = -WORLD_DEPTH;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this._atmosMeshes.push(mesh);
    }
    delete this._pendingFloorAtmo;
  }

  // ── World border — dark fog walls at play-zone edges ──────────
  // Appear as a looming barrier as the player approaches the edge.
  // The exponential scene fog makes them invisible from the center and
  // increasingly prominent near the boundary.
  // ── World boundary energy barrier ─────────────────────────────
  // Animated teal/cyan force-field planes sit at the movement clamp line (300 units
  // from the world edge).  Terrain and grass intentionally extend beyond the barrier
  // into fog so the world feels infinite — the barrier signals "you can't pass" without
  // looking like a solid wall.
  _createWorldBorder() {
    // Barrier sits at the movement clamp boundary in Three.js centred coords:
    //   world clamp = 300 … WORLD_W-300  →  Three.js ±(WORLD_W/2 - 300)
    const bx = WORLD_W / 2 - 300;   // ±3700 on X
    const bz = WORLD_H / 2 - 300;   // ±2700 on Z
    const barrierH = WORLD_DEPTH + 60;
    const cy       = -WORLD_DEPTH / 2 + 30;   // centred between surface and seafloor

    this._barrierTimeRef = { value: 0.0 };
    this._barrierWalls   = [];  // { mesh, axis:'x'|'z', wallCoord } for proximity update

    const VS = /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    const FS = /* glsl */`
      uniform float uTime;
      uniform float uProximity;  // 0 = hidden, 1 = fully visible
      varying vec2 vUv;
      void main() {
        if (uProximity < 0.01) discard;
        float u = vUv.x, v = vUv.y;
        float band1 = sin(u * 18.0 + uTime * 1.4) * 0.5 + 0.5;
        float band2 = sin(u * 31.0 - uTime * 0.9) * 0.5 + 0.5;
        float bands  = band1 * band2;
        float t2 = fract(v * 6.0 + u * 2.3 - uTime * 0.55);
        float spark = smoothstep(0.0, 0.12, t2) * smoothstep(0.45, 0.20, t2);
        float edgeU = smoothstep(0.0, 0.08, u) * smoothstep(1.0, 0.92, u);
        float edgeV = smoothstep(0.0, 0.04, v) * smoothstep(1.0, 0.96, v);
        float intensity = (bands * 0.55 + spark * 0.45) * edgeU * edgeV;
        vec3 teal   = vec3(0.00, 0.65, 0.78);
        vec3 cyan   = vec3(0.28, 0.90, 1.00);
        vec3 purple = vec3(0.50, 0.10, 0.90);
        vec3 col = mix(teal, cyan, band1);
        col = mix(col, purple, spark * 0.55);
        float a = intensity * 0.62 * uProximity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(col, a);
      }
    `;

    // [posX, posY, posZ, rotY, length, axis, wallCoord]
    // East/West walls run along Z → rotate Y by PI/2.
    // North/South walls run along X → no Y rotation.
    const sides = [
      [-bx, cy, 0,    Math.PI / 2,  WORLD_H + 1200, 'x', -bx],  // West
      [ bx, cy, 0,    Math.PI / 2,  WORLD_H + 1200, 'x',  bx],  // East
      [0,   cy, -bz,  0,            WORLD_W + 1200, 'z', -bz],  // North
      [0,   cy,  bz,  0,            WORLD_W + 1200, 'z',  bz],  // South
    ];
    for (const [px, py, pz, ry, len, axis, wallCoord] of sides) {
      const geo = new THREE.PlaneGeometry(len, barrierH, 32, 12);
      const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
        vertexShader: VS, fragmentShader: FS,
        uniforms: { uTime: this._barrierTimeRef, uProximity: { value: 0.0 } },
        transparent: true, depthWrite: false,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      }));
      m.position.set(px, py, pz);
      m.rotation.y = ry;
      m.frustumCulled = false;
      this.scene.add(m);
      this._barrierWalls.push({ mesh: m, axis, wallCoord });
    }
  }

  _updateWorldBorder() {
    if (!this._barrierTimeRef) return;
    this._barrierTimeRef.value = this.time;
    // Fade barrier in only when camera is within 2000 units of that wall.
    const cx = this.camera.position.x;
    const cz = this.camera.position.z;
    for (const { mesh, axis, wallCoord } of this._barrierWalls) {
      const camCoord = axis === 'x' ? cx : cz;
      const dist     = Math.abs(camCoord - wallCoord);
      // Fully visible within 600 units, invisible beyond 2000.
      const proximity = 1.0 - Math.min(1, Math.max(0, (dist - 600) / 1400));
      mesh.material.uniforms.uProximity.value = proximity;
    }
  }

  // ── Seafloor — FBM noise terrain with vertex colours ──────────
  _createSeafloor() {
    const segs = 128;
    const W    = WORLD_W + 30000;
    const H    = WORLD_H + 30000;
    const geo  = new THREE.PlaneGeometry(W, H, segs, segs);
    const pos  = geo.attributes.position;

    // Height map: continental shelves + ridges + fine detail
    const maxH = 700;  // dramatic height variation across the 1200-unit water column
    const heights = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) / W;
      const wy = pos.getY(i) / H;
      // Continental-scale features — broad plateaus and basins
      const continent = Noise.fbm(wx * 1.2 + 0.3, wy * 1.2 + 0.7, 3, 2.0, 0.55, 7);
      // Mid-scale ridges and trenches
      const ridge = Noise.fbm(wx * 3 + 0.5, wy * 3 + 0.5, 4, 2.2, 0.52, 42);
      // Domain-warped fine detail
      const wx2 = wx + 0.25 * Noise.fbm(wx * 5 + 3.7, wy * 5 + 1.9, 3, 2.0, 0.5, 77);
      const wy2 = wy + 0.25 * Noise.fbm(wx * 5 + 9.2, wy * 5 + 7.1, 3, 2.0, 0.5, 13);
      const detail = Noise.fbm(wx2 * 8, wy2 * 8, 5, 2.1, 0.45, 200);
      // Combine: continent shapes the broad elevation, ridges add mid-frequency,
      // detail adds fine texture. Deep trenches where continent is low.
      const combined = continent * 0.45 + ridge * 0.35 + detail * 0.20;
      let h = combined * maxH - maxH * 0.35;
      // Flatten terrain toward extreme edges (well beyond fog visibility)
      const ex = Math.abs(pos.getX(i)) / (W * 0.5);
      const ey = Math.abs(pos.getY(i)) / (H * 0.5);
      const eDist = Math.max(ex, ey);
      const eFade = Math.max(0, Math.min(1, (eDist - 0.85) / 0.12));
      h *= (1 - eFade);
      pos.setZ(i, h);
      heights[i] = h;
    }
    geo.computeVertexNormals();
    // Store height data so caustics/sand ridges can drape over terrain
    this._floorSegs = segs;
    this._floorW = W;
    this._floorH = H;
    this._floorHeights = heights;

    // Vertex colours: deep trenches are near-black, shallow plateaus are bright teal-green
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, Math.min(1, (heights[i] + maxH * 0.35) / maxH));
      const t2 = t * t;
      // Four-stop color ramp: abyss → deep → mid → ridge
      let cr, cg, cb;
      if (t < 0.25) {
        // Deep trenches — very dark blue-black
        const s = t / 0.25;
        cr = Noise.lerp(0.005, 0.01, s);
        cg = Noise.lerp(0.02,  0.04, s);
        cb = Noise.lerp(0.04,  0.08, s);
      } else if (t < 0.5) {
        // Mid-depth plains — dark teal
        const s = (t - 0.25) / 0.25;
        cr = Noise.lerp(0.01, 0.02, s);
        cg = Noise.lerp(0.04, 0.12, s);
        cb = Noise.lerp(0.08, 0.14, s);
      } else if (t < 0.75) {
        // Elevated terrain — medium green
        const s = (t - 0.5) / 0.25;
        cr = Noise.lerp(0.02, 0.04, s);
        cg = Noise.lerp(0.12, 0.28, s);
        cb = Noise.lerp(0.14, 0.18, s);
      } else {
        // Ridge peaks — bright teal-green
        const s = (t - 0.75) / 0.25;
        cr = Noise.lerp(0.04, 0.06, s);
        cg = Noise.lerp(0.28, 0.40, s);
        cb = Noise.lerp(0.18, 0.24, s);
      }
      // Subtle bioluminescent tint on high ridges
      const wx = pos.getX(i) / W, wy = pos.getY(i) / H;
      const biolum = Noise.fbm(wx * 12 + 5.3, wy * 12 + 2.7, 2, 2.0, 0.5, 99);
      if (biolum > 0.65 && t > 0.6) {
        const glow = (biolum - 0.65) / 0.35;
        cr += glow * 0.015;
        cg += glow * 0.08;
        cb += glow * 0.04;
      }
      // Warm mineral veins in deep trenches
      const vein = Noise.fbm(wx * 18 + 8.1, wy * 18 + 4.4, 2, 2.2, 0.5, 55);
      if (vein > 0.68 && t < 0.2) {
        const v = (vein - 0.68) / 0.32;
        cr += v * 0.05;
        cg += v * 0.015;
      }
      // Fade vertex colors to fog color near edges so terrain dissolves into fog
      const vx = pos.getX(i), vy = pos.getY(i);
      const edgeDistX = Math.abs(vx) / (W * 0.5);  // 0 at center, 1 at edge
      const edgeDistY = Math.abs(vy) / (H * 0.5);
      const edgeDist = Math.max(edgeDistX, edgeDistY);
      const edgeFade = Math.max(0, Math.min(1, (edgeDist - 0.85) / 0.12));  // fade at extreme edges only
      // Fog color: 0x020c18 = (0.008, 0.047, 0.094)
      cr = cr * (1 - edgeFade) + 0.008 * edgeFade;
      cg = cg * (1 - edgeFade) + 0.047 * edgeFade;
      cb = cb * (1 - edgeFade) + 0.094 * edgeFade;
      colors[i*3]   = Math.min(1, cr);
      colors[i*3+1] = Math.min(1, cg);
      colors[i*3+2] = Math.min(1, cb);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      emissive:     new THREE.Color(0x003318),
      emissiveIntensity: 0.5,
      roughness: 0.85, metalness: 0.08,
    });
    this.seafloor = new THREE.Mesh(geo, mat);
    this.seafloor.rotation.x = -Math.PI / 2;
    this.seafloor.position.y = -WORLD_DEPTH;
    this.seafloor.receiveShadow = true;
    this.scene.add(this.seafloor);

    // Hydrothermal vents: glowing lights + layered rock formations (not spikes)
    const ventPalette = [0x00ffaa, 0x00ccff, 0x55ffbb, 0x00ff77, 0x22ddff];
    for (let i = 0; i < 6; i++) {
      const vx = (Math.random() - 0.5) * WORLD_W * 0.85;
      const vz = (Math.random() - 0.5) * WORLD_H * 0.85;
      const col = ventPalette[i % ventPalette.length];

      const vl = new THREE.PointLight(col, 2.5, 900);
      vl.position.set(vx, -WORLD_DEPTH + 10, vz);
      vl.userData.phase = Math.random() * Math.PI * 2;
      vl.userData.isVent = true;
      this.scene.add(vl);
      this.biolumLights.push(vl);

      // Layered flat discs stacked to form a vent chimney (not a spike)
      const stackCount = 3 + Math.floor(Math.random() * 3);
      let stackH = 0;
      for (let j = 0; j < stackCount; j++) {
        const dr = 8 + Math.random() * 18 - j * 2;  // gets narrower toward top
        const dh = 12 + Math.random() * 20;
        const dg = new THREE.CylinderGeometry(dr * 0.7, dr, dh, 7 + j);
        const dm = new THREE.MeshStandardMaterial({
          color: new THREE.Color(col).multiplyScalar(0.2),
          emissive: new THREE.Color(col),
          emissiveIntensity: 0.8 + j * 0.4,
          roughness: 0.4, metalness: 0.6,
        });
        const d = new THREE.Mesh(dg, dm);
        d.position.set(
          vx + (Math.random()-0.5)*8,
          -WORLD_DEPTH + stackH + dh/2,
          vz + (Math.random()-0.5)*8
        );
        d.rotation.y = Math.random() * Math.PI * 2;
        stackH += dh * 0.85;
        this.scene.add(d);
      }
    }

    // Geological formations: boulders, ridge outcrops, flat rock shelves
    // (replaced random spike columns with varied rock masses)
    const rng = (a, b) => a + Math.random() * (b - a);
    const rockColors = [
      [0x0a1e12, 0x00aa55], [0x061424, 0x0055cc],
      [0x121212, 0x223344], [0x08180e, 0x00ff88],
    ];

    for (let i = 0; i < 28; i++) {
      const isLarge = i < 8;
      const rx = rng(-WORLD_W*0.45, WORLD_W*0.45);
      const rz = rng(-WORLD_H*0.45, WORLD_H*0.45);
      const rc = rockColors[i % rockColors.length];

      if (isLarge) {
        // Large ridge outcrop: squashed IcosahedronGeometry
        const detail = 1;
        const rg = new THREE.IcosahedronGeometry(rng(40, 90), detail);
        // Flatten and widen — looks like a rock outcrop, not a spike
        const rp = rg.attributes.position;
        for (let v = 0; v < rp.count; v++) {
          rp.setY(v, rp.getY(v) * rng(0.25, 0.55));
          rp.setX(v, rp.getX(v) * rng(0.9, 1.5));
          rp.setZ(v, rp.getZ(v) * rng(0.9, 1.5));
        }
        rg.computeVertexNormals();
        const rm = new THREE.MeshStandardMaterial({
          color: new THREE.Color(rc[0]),
          emissive: new THREE.Color(rc[1]),
          emissiveIntensity: 0.3,
          roughness: 0.9,
        });
        const mesh = new THREE.Mesh(rg, rm);
        const topH = rng(30, 90);
        mesh.position.set(rx, -WORLD_DEPTH + topH, rz);
        mesh.rotation.y = Math.random() * Math.PI * 2;
        mesh.castShadow = true;
        this.scene.add(mesh);

        // Small satellite rocks around large formation
        for (let k = 0; k < 3; k++) {
          const sg = new THREE.IcosahedronGeometry(rng(10, 28), 1);
          const sp = sg.attributes.position;
          for (let v = 0; v < sp.count; v++) sp.setY(v, sp.getY(v) * rng(0.3, 0.6));
          sg.computeVertexNormals();
          const sm2 = new THREE.Mesh(sg, rm);
          sm2.position.set(rx + rng(-60, 60), -WORLD_DEPTH + rng(8, 35), rz + rng(-60, 60));
          sm2.rotation.y = Math.random() * Math.PI * 2;
          this.scene.add(sm2);
        }
      } else {
        // Medium scattered boulder
        const bg = new THREE.DodecahedronGeometry(rng(12, 35), 0);
        const bp = bg.attributes.position;
        for (let v = 0; v < bp.count; v++) bp.setY(v, bp.getY(v) * rng(0.3, 0.7));
        bg.computeVertexNormals();
        const bm = new THREE.MeshStandardMaterial({
          color: new THREE.Color(rc[0]),
          emissive: new THREE.Color(rc[1]),
          emissiveIntensity: 0.15,
          roughness: 0.95,
        });
        const mesh = new THREE.Mesh(bg, bm);
        mesh.position.set(rx, -WORLD_DEPTH + rng(5, 20), rz);
        mesh.rotation.set(rng(-0.3,0.3), rng(0, Math.PI*2), rng(-0.3,0.3));
        this.scene.add(mesh);
      }
    }
  }

  // ── Seafloor rock clusters (instanced shader — scattered boulders/coral) ──
  _createSeafloorRocks() {
    const COUNT = 10000;
    // Cross-plane geometry for each rock cluster: 2 quads forming an X
    const posArr = [], uvArr = [], idxArr = [];
    const RW = 12, RH = 14;
    for (let pl = 0; pl < 2; pl++) {
      const ang = (pl / 2) * Math.PI;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const base = (posArr.length / 3);
      // 4 verts per quad
      for (let xi = -1; xi <= 1; xi += 2) {
        for (let yi = 0; yi <= 1; yi++) {
          posArr.push(xi * RW * ca, yi * RH, xi * RW * sa);
          uvArr.push((xi + 1) * 0.5, yi);
        }
      }
      idxArr.push(base, base+1, base+2, base+2, base+1, base+3);
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
    geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvArr,  2));
    geo.setIndex(idxArr);
    geo.instanceCount = COUNT;

    const iOffset = new Float32Array(COUNT * 3);
    const iScale  = new Float32Array(COUNT);
    const iRotY   = new Float32Array(COUNT);
    const iType   = new Float32Array(COUNT); // 0=rock, 1=coral
    let placed = 0;
    const MAX_TRIES = COUNT * 4;
    for (let t = 0; t < MAX_TRIES && placed < COUNT; t++) {
      const ix = (Math.random() - 0.5) * WORLD_W * 2.0;
      const iz = (Math.random() - 0.5) * WORLD_H * 2.0;
      // Scattered with mild noise clustering
      const n = Noise.fbm(ix * 0.002, iz * 0.002, 2, 2.0, 0.5, 77);
      if (n < 0.35) continue;
      // Terrain height
      const floorW = WORLD_W + 30000, floorH = WORLD_H + 30000;
      const twx = ix / floorW, twz = iz / floorH;
      const tRidge  = Noise.fbm(twx * 3 + 0.5, twz * 3 + 0.5, 4, 2.2, 0.52, 42);
      const tDetail = Noise.fbm(twx * 8,        twz * 8,        5, 2.1, 0.45, 200);
      const terrH   = (tRidge * 0.65 + tDetail * 0.35) * 320 - 320 * 0.3;
      iOffset[placed*3]     = ix;
      iOffset[placed*3 + 1] = -WORLD_DEPTH + terrH + 1;
      iOffset[placed*3 + 2] = iz;
      iScale[placed]  = 0.3 + n * 0.9 + Math.random() * 0.3;
      iRotY[placed]   = Math.random() * Math.PI * 2;
      iType[placed]   = Math.random() < 0.35 ? 1.0 : 0.0;
      placed++;
    }
    geo.instanceCount = placed;
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(iOffset, 3));
    geo.setAttribute('aScale',  new THREE.InstancedBufferAttribute(iScale,  1));
    geo.setAttribute('aRotY',   new THREE.InstancedBufferAttribute(iRotY,   1));
    geo.setAttribute('aType',   new THREE.InstancedBufferAttribute(iType,   1));

    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0.0 }, uRayMap: { value: this._godRayMap || null } },
      ]),
      vertexShader: /* glsl */`
        #include <fog_pars_vertex>
        attribute vec3  aOffset;
        attribute float aScale;
        attribute float aRotY;
        attribute float aType;
        varying float vHeight;
        varying float vType;
        varying vec2  vWorldXZ;
        varying vec2  vRayUV;
        void main() {
          vec3 pos = position * aScale;
          float cy = cos(aRotY), sy = sin(aRotY);
          pos = vec3(pos.x * cy - pos.z * sy, pos.y, pos.x * sy + pos.z * cy);
          pos += aOffset;
          vHeight = uv.y;
          vType   = aType;
          vWorldXZ = pos.xz * 0.00045;
          vRayUV = pos.xz / vec2(${(WORLD_W + 600).toFixed(1)}, ${(WORLD_H + 600).toFixed(1)}) + 0.5;
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */`
        #include <fog_pars_fragment>
        uniform float uTime;
        uniform sampler2D uRayMap;
        varying float vHeight;
        varying float vType;
        varying vec2  vWorldXZ;
        varying vec2  vRayUV;

        float causticLight(vec2 p, float t) {
          vec2 w1 = vec2(sin(p.y * 1.618 + t * 0.28 + p.x * 0.3),
                         cos(p.x * 1.414 - t * 0.22 + p.y * 0.4)) * 0.45;
          vec2 q = p + w1;
          float n1 = sin(q.x * 4.637 + t * 0.68) * cos(q.y * 5.179 - t * 0.57);
          float n2 = sin(q.x * 3.271 - q.y * 5.743 + t * 0.61);
          return (n1 + n2) * 0.5;
        }

        void main() {
          vec3 col;
          float a;
          if (vType < 0.5) {
            vec3 base = vec3(0.02, 0.05, 0.06);
            vec3 top  = vec3(0.04, 0.14, 0.10);
            col = mix(base, top, vHeight);
            a = 0.7 - vHeight * 0.25;
          } else {
            vec3 base = vec3(0.06, 0.02, 0.04);
            vec3 top  = vec3(0.28, 0.08, 0.14);
            col = mix(base, top, vHeight);
            a = 0.65 - vHeight * 0.15;
          }
          a *= smoothstep(1.0, 0.75, vHeight);
          // God ray + caustic lighting
          float rayLight = texture2D(uRayMap, vRayUV).r;
          float lightMod = 0.3 + rayLight * 1.3;
          vec2 cp = vWorldXZ * 15.5;
          float c = causticLight(cp, uTime) * 0.5 + 0.5;
          float caustic = pow(smoothstep(0.46, 0.76, c), 1.6);
          col += vec3(0.04, 0.15, 0.12) * caustic * lightMod;
          col *= (0.7 + 0.3 * lightMod);
          gl_FragColor = vec4(col, a);
          #include <fog_fragment>
        }
      `,
      transparent: true, alphaTest: 0.1, depthWrite: true,
      side: THREE.DoubleSide, fog: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this._rockMesh = mesh;
    this._rockTimeRef = mat.uniforms.uTime;
  }

  // ── Water surface — shader-animated, only visible near surface ──
  _createWaterSurface() {
    const segs = 32;
    const geo  = new THREE.PlaneGeometry(WORLD_W + 30000, WORLD_H + 30000, segs, segs);
    this.surfaceGeo = geo;
    this.surfacePositions = geo.attributes.position;

    // Shared time/camHeight uniforms — updated each frame in _updateWaterSurface
    this._surfaceUniforms = { uTime: { value: 0.0 }, uCamHeight: { value: 1600.0 } };

    const mat = new THREE.ShaderMaterial({
      uniforms: this._surfaceUniforms,
      vertexShader: /* glsl */`
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform float uCamHeight;
        varying vec2 vUv;

        void main() {
          vec2 p = vUv * 6.0;
          float r1 = sin(p.x * 2.8 + uTime * 0.52) * sin(p.y * 3.3 - uTime * 0.38);
          float r2 = sin((p.x - p.y) * 2.2 + uTime * 0.44);
          float r3 = sin(length(p - 3.5) * 2.6 - uTime * 0.68);
          float pattern = (r1 + r2 + r3) * 0.333 * 0.5 + 0.5;
          float caustic = smoothstep(0.52, 0.88, pattern);
          float ripple = (sin(p.x * 1.4 + uTime * 0.35) * 0.5 + 0.5)
                       * (sin(p.y * 1.8 - uTime * 0.28) * 0.5 + 0.5);

          vec3 base  = vec3(0.03, 0.14, 0.36);
          vec3 light = vec3(0.20, 0.62, 0.82);
          vec3 col = mix(base, light, caustic * 0.65 + ripple * 0.20);

          float alpha;
          if (uCamHeight >= 1250.0) {
            // Camera above surface: semi-transparent water layer
            alpha = 0.28 + caustic * 0.18 + ripple * 0.06;
          } else {
            // Camera below surface: ceiling (fades as you go deeper)
            float fade = clamp(1.0 - (1250.0 - uCamHeight) / 280.0, 0.0, 1.0);
            alpha = fade * (0.52 + caustic * 0.30);
          }
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    });

    this.surfaceMesh = new THREE.Mesh(geo, mat);
    this.surfaceMesh.rotation.x = -Math.PI / 2;
    this.surfaceMesh.position.y = 1250;  // raised to near camera level
    this.surfaceMesh.visible = true;
    this.scene.add(this.surfaceMesh);
  }

  _updateWaterSurface(dt) {
    // Shader uniforms every frame (cheap)
    this._surfaceUniforms.uTime.value = this.time;
    this._surfaceUniforms.uCamHeight.value = this.camera.position.y;
    // CPU vertex ripple — only on env frames to avoid per-frame computeVertexNormals
    if (this._envFrame === 0) {
      const pos = this.surfacePositions;
      const t   = this.time;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);
        const w = Math.sin(x * 0.003 + t * 0.4) * 10
                + Math.cos(y * 0.004 + t * 0.3) * 7
                + Math.sin((x+y) * 0.002 + t * 0.2) * 5;
        pos.setZ(i, w);
      }
      pos.needsUpdate = true;
      this.surfaceGeo.computeVertexNormals();
    }
  }

  // ── God rays — cross-plane light shafts with seafloor spotlights ──
  // Three crossing planes per shaft (0°/60°/120°) look solid from any angle.
  // A glowing disc on the seafloor below each shaft connects beam to floor.
  _createLightShafts() {
    this.lightShafts = [];   // { mesh, spot } pairs
    this._shaftTimeRef = { value: 0.0 };

    const VS = /* glsl */`
      varying float vDepth;  // 0 at surface entry, 1 at floor
      varying vec2  vUv;
      void main() {
        vUv    = uv;
        vDepth = 1.0 - uv.y;  // PlaneGeometry: uv.y=1 at top → 0 at surface
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    const FS = /* glsl */`
      uniform float uTime, uPhase, uBase;
      varying float vDepth;
      varying vec2  vUv;
      void main() {
        // Bright at surface entry, fade to black at depth
        float fade  = (1.0 - vDepth) * (1.0 - vDepth);
        float pulse = 0.55 + 0.45 * sin(uTime * 0.38 + uPhase);
        // Soft edges on horizontal axis
        float edge  = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        // Rising dust motes
        float mote  = pow(abs(sin(fract(vUv.y * 12.0 - uTime * 0.05 + uPhase) * 3.14159)), 24.0) * 0.4;
        float alpha = fade * pulse * edge * uBase + mote * fade * 0.022;
        gl_FragColor = vec4(0.14, 0.54, 0.80, clamp(alpha, 0.0, 0.36));
      }
    `;

    // Shared spotlight material (additive glow disc on seafloor)
    const spotMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.12, 0.48, 0.72),
      transparent: true, opacity: 0.12,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this._spotMat = spotMat;  // keep ref to animate opacity

    const shaftCount = 36;
    for (let i = 0; i < shaftCount; i++) {
      // Surface at Y=1250, seafloor at Y=-WORLD_DEPTH → total depth 1250+WORLD_DEPTH.
      // Shafts span 70-100 % of that so they reach or nearly reach the seafloor.
      const SURF_Y   = 1250;
      const h = (SURF_Y + WORLD_DEPTH) * (0.70 + Math.random() * 0.30);
      const r = 60 + Math.random() * 110;
      const sx = (Math.random() - 0.5) * WORLD_W * 1.8;
      const sz = (Math.random() - 0.5) * WORLD_H * 1.8;
      const phase = Math.random() * Math.PI * 2;

      // ── Single billboard plane (Y-axis billboard each frame, avoids cross pattern from top) ──
      const geo = new THREE.PlaneGeometry(r * 2, h, 2, 12);
      geo.translate(0, -h / 2, 0);  // top at Y=0 (surface entry), bottom at Y=-h

      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime:  this._shaftTimeRef,
          uPhase: { value: phase },
          uBase:  { value: 0.12 + Math.random() * 0.13 },
        },
        vertexShader: VS, fragmentShader: FS,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });

      const mesh = new THREE.Mesh(geo, mat);
      // Consistent sun angle — all shafts share the same direction.
      mesh.rotation.x = -0.32;
      mesh.rotation.z =  0.22;
      mesh.position.set(sx, 1250, sz);  // tops at surface Y=1250
      this.scene.add(mesh);

      // ── Seafloor spotlight disc — terrain-following ──
      const spotR = r * (0.35 + Math.random() * 0.4);
      const spot  = new THREE.Mesh(
        new THREE.CircleGeometry(spotR, 20),
        spotMat.clone()
      );
      spot.rotation.x = -Math.PI / 2;
      // Sample terrain height at spotlight position
      const _fw = WORLD_W + 30000, _fh = WORLD_H + 30000;
      const _twx = sx / _fw, _twz = sz / _fh;
      const _tRidge  = Noise.fbm(_twx * 3 + 0.5, _twz * 3 + 0.5, 4, 2.2, 0.52, 42);
      const _tDetail = Noise.fbm(_twx * 8, _twz * 8, 5, 2.1, 0.45, 200);
      const _terrH   = (_tRidge * 0.65 + _tDetail * 0.35) * 320 - 320 * 0.3;
      spot.position.set(sx, -WORLD_DEPTH + _terrH + 6, sz);
      spot.userData.phase = phase;
      this.scene.add(spot);

      this.lightShafts.push({ mesh, spot, wx: sx, wz: sz, radius: r });
    }

    // Build a god ray light map — 128×128 texture encoding combined ray brightness
    // across the world XZ plane. Shaders sample this to brighten areas under rays.
    this._buildGodRayLightMap();
  }

  _buildGodRayLightMap() {
    const RES = 128;
    const data = new Uint8Array(RES * RES * 4);
    const hw = WORLD_W * 0.5, hh = WORLD_H * 0.5;
    for (let iy = 0; iy < RES; iy++) {
      for (let ix = 0; ix < RES; ix++) {
        // Map texel to world XZ (Three.js coords: X = worldX - hw, Z = worldY - hh)
        const wx = (ix / (RES - 1) - 0.5) * (WORLD_W + 600);
        const wz = (iy / (RES - 1) - 0.5) * (WORLD_H + 600);
        let brightness = 0;
        for (const shaft of this.lightShafts) {
          const dx = wx - shaft.wx, dz = wz - shaft.wz;
          const d = Math.sqrt(dx * dx + dz * dz);
          const falloff = Math.max(0, 1 - d / (shaft.radius * 1.8));
          brightness += falloff * falloff;
        }
        brightness = Math.min(1, brightness);
        const idx = (iy * RES + ix) * 4;
        const v = Math.round(brightness * 255);
        data[idx] = v; data[idx + 1] = v; data[idx + 2] = v; data[idx + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, RES, RES, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this._godRayMap = tex;
    // Pre-compute world-to-UV transform for JS-side sampling
    this._godRayMapW = WORLD_W + 600;
    this._godRayMapH = WORLD_H + 600;
    this._godRayData = data;
    this._godRayRes = RES;
  }

  // Sample god ray brightness at a world position (returns 0-1)
  _sampleGodRay(worldX, worldY) {
    if (!this._godRayData) return 0.3;
    const RES = this._godRayRes;
    const u = (this.wx(worldX) / this._godRayMapW + 0.5);
    const v = (this.wz(worldY) / this._godRayMapH + 0.5);
    const ix = Math.min(RES - 1, Math.max(0, Math.round(u * (RES - 1))));
    const iy = Math.min(RES - 1, Math.max(0, Math.round(v * (RES - 1))));
    return this._godRayData[(iy * RES + ix) * 4] / 255;
  }

  _updateLightShafts() {
    if (this._shaftTimeRef) this._shaftTimeRef.value = this.time;
    for (const { mesh, spot } of this.lightShafts) {
      // Y-billboard: rotate plane to face camera in XZ plane (eliminates cross pattern from above)
      if (mesh) {
        const dx = this.camera.position.x - mesh.position.x;
        const dz = this.camera.position.z - mesh.position.z;
        mesh.rotation.y = Math.atan2(dx, dz);
      }
      if (spot) {
        spot.material.opacity = 0.06 + 0.10 * Math.abs(Math.sin(this.time * 0.38 + spot.userData.phase));
      }
    }
  }

  // ── Caustics — animated light projection on seafloor ───────────
  _createCaustics() {
    // Use same segment count and dimensions as seafloor so caustics drape over terrain
    const segs = this._floorSegs || 100;
    const W = this._floorW || (WORLD_W + 6000);
    const H = this._floorH || (WORLD_H + 6000);
    const geo = new THREE.PlaneGeometry(W, H, segs, segs);
    // Copy seafloor heights into caustic mesh vertices (offset slightly above terrain)
    if (this._floorHeights) {
      const cpos = geo.attributes.position;
      for (let i = 0; i < cpos.count && i < this._floorHeights.length; i++) {
        cpos.setZ(i, this._floorHeights[i] + 8);
      }
      cpos.needsUpdate = true;
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0.0 }, uRayMap: { value: this._godRayMap || null } },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform sampler2D uRayMap;
        varying vec2 vUv;

        // Smooth value noise — no grid artifacts
        float snoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);  // smoothstep interpolation
          float a = fract(sin(dot(i,              vec2(127.1, 311.7))) * 43758.5453);
          float b = fract(sin(dot(i + vec2(1, 0), vec2(127.1, 311.7))) * 43758.5453);
          float c = fract(sin(dot(i + vec2(0, 1), vec2(127.1, 311.7))) * 43758.5453);
          float d = fract(sin(dot(i + vec2(1, 1), vec2(127.1, 311.7))) * 43758.5453);
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        // Caustic cell — multi-layer warped sine with smooth noise breakup
        float causticCell(vec2 p, float t) {
          // Domain warp using smooth noise for organic distortion
          vec2 w1 = vec2(sin(p.y * 1.618 + t * 0.28 + p.x * 0.3),
                         cos(p.x * 1.414 - t * 0.22 + p.y * 0.4)) * 0.45;
          vec2 w2 = vec2(snoise(p * 0.8 + t * 0.12) - 0.5,
                         snoise(p * 0.7 + vec2(5.3, 2.1) + t * 0.09) - 0.5) * 0.55;
          vec2 q = p + w1 + w2;
          float n1 = sin(q.x * 4.637 + t * 0.68) * cos(q.y * 5.179 - t * 0.57);
          float n2 = sin(q.x * 3.271 - q.y * 5.743 + t * 0.61);
          float n3 = cos(length(q * 2.618 - vec2(1.309, 0.891)) * 4.327 - t * 0.88);
          return (n1 + n2 + n3) * 0.333;
        }

        void main() {
          vec2  p    = vUv * 5.5;
          float c1   = causticCell(p,                                uTime)        * 0.5 + 0.5;
          float c2   = causticCell(p * 0.618 + vec2(2.236, 1.732),  uTime * 0.73) * 0.5 + 0.5;
          float c3   = causticCell(p * 1.272 + vec2(0.866, 3.142),  uTime * 1.08) * 0.5 + 0.5;
          float avg  = (c1 * 0.40 + c2 * 0.35 + c3 * 0.25);
          float bright = pow(smoothstep(0.44, 0.74, avg), 1.7);
          float ambient = smoothstep(0.28, 0.50, avg) * 0.04;
          // God ray light map — caustics are much brighter under shafts, dim in shadow
          float rayLight = texture2D(uRayMap, vUv).r;
          float lightMod = 0.25 + rayLight * 1.5;
          vec3 coolCol = vec3(0.04, 0.52, 0.70);
          vec3 warmCol = vec3(0.12, 0.65, 0.55);
          vec3 col = mix(coolCol, warmCol, bright);
          gl_FragColor = vec4(col, (bright * 0.30 + ambient) * lightMod);
        }
      `,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
      side:           THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y  = -WORLD_DEPTH;   // base at seafloor; vertex heights drape over terrain
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this._causticsMesh = mesh;
  }

  _updateCaustics() {
    if (this._causticsMesh) this._causticsMesh.material.uniforms.uTime.value = this.time;
  }

  // ── Sand ridges — directional wave ripples on seafloor ─────────
  _createSandRidges() {
    // Use same segment count and dimensions as seafloor to drape over terrain
    const segs = this._floorSegs || 100;
    const W = this._floorW || (WORLD_W + 6000);
    const H = this._floorH || (WORLD_H + 6000);
    const geo = new THREE.PlaneGeometry(W, H, segs, segs);
    if (this._floorHeights) {
      const spos = geo.attributes.position;
      for (let i = 0; i < spos.count && i < this._floorHeights.length; i++) {
        spos.setZ(i, this._floorHeights[i] + 5);
      }
      spos.needsUpdate = true;
    }
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0.0 } },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform float uTime;
        varying vec2  vUv;

        void main() {
          // Subtle seafloor texture — gentle directional ripples, not bold stripes
          vec2  p   = vUv * 12.0;
          float dir = 0.38;
          float along = p.x * cos(dir) + p.y * sin(dir);
          float cross = p.x * -sin(dir) + p.y * cos(dir);

          // Layered low-contrast ripples
          float r1 = sin(along * 1.618 + cross * 0.3 + uTime * 0.012) * 0.5;
          float r2 = sin(along * 2.847 + cross * 0.7 + uTime * 0.018) * 0.3;
          float r3 = sin(cross * 3.236 + along * 0.5 + uTime * 0.015) * 0.2;
          float pattern = (r1 + r2 + r3) * 0.28 + 0.5;

          float crest = smoothstep(0.54, 0.72, pattern);
          float trough = smoothstep(0.54, 0.36, pattern);

          vec3 sandLight = vec3(0.04, 0.16, 0.12);
          vec3 sandDark  = vec3(0.01, 0.06, 0.04);
          vec3 col = mix(sandDark, sandLight, crest);

          float alpha = (crest * 0.14 + trough * 0.05);
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite:  false,
      side:        THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y  = -WORLD_DEPTH;   // base at seafloor; vertex heights drape over terrain
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this._sandRidgesMesh = mesh;
  }

  _updateSandRidges() {
    if (this._sandRidgesMesh) this._sandRidgesMesh.material.uniforms.uTime.value = this.time;
  }

  // ── Selection ring under selected ship ────────────────────────
  // ── Edge fog — concentric fog cylinders that hide the terrain boundaries ──
  _createEdgeFog() {
    const fogColor = this.scene.fog ? this.scene.fog.color : new THREE.Color(0x091e2e);
    const height = WORLD_DEPTH + 2800;
    const baseY = -WORLD_DEPTH - 200;
    this._edgeFogMeshes = [];

    // Concentric cylinders with increasing opacity — creates a smooth volumetric fade
    const layers = [
      { radius: 4800, opacity: 0.04 },
      { radius: 5400, opacity: 0.08 },
      { radius: 6000, opacity: 0.14 },
      { radius: 6800, opacity: 0.22 },
      { radius: 7600, opacity: 0.35 },
      { radius: 8500, opacity: 0.50 },
      { radius: 9500, opacity: 0.70 },
      { radius: 11000, opacity: 0.88 },
    ];

    for (const layer of layers) {
      const geo = new THREE.CylinderGeometry(layer.radius, layer.radius, height, 48, 1, true);
      const mat = new THREE.MeshBasicMaterial({
        color: fogColor.clone(),
        transparent: true,
        opacity: layer.opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = baseY + height * 0.5;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this._edgeFogMeshes.push(mesh);
    }
  }

  _createSelectionRing() {
    const geo  = new THREE.TorusGeometry(1, 3.5, 10, 36);
    const mat  = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 1.0 });
    this._selRing = new THREE.Mesh(geo, mat);
    this._selRing.rotation.x = Math.PI / 2;
    this._selRing.visible = false;
    this.scene.add(this._selRing);

    // Vertical beacon line above primary selected ship
    const beaconGeo = new THREE.BufferGeometry();
    beaconGeo.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,1,0], 3));
    const beaconMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.6, depthWrite: false });
    this._selBeacon = new THREE.Line(beaconGeo, beaconMat);
    this._selBeacon.visible = false;
    this.scene.add(this._selBeacon);

    // Per-slot firing arc fans
    this._slotArcGroups = [];
    this._lastSlotArcShip = null;
    this._showArcOverlay = true; // toggled with A key
  }

  toggleArcOverlay() {
    this._showArcOverlay = !this._showArcOverlay;
    if (!this._showArcOverlay) this._clearSlotArcs();
    return this._showArcOverlay;
  }

  _clearSlotArcs() {
    if (this._slotArcGroups) {
      for (const { group } of this._slotArcGroups) this.scene.remove(group);
    }
    this._slotArcGroups = [];
    this._lastSlotArcShip = null;
  }

  // Build per-slot arc fans for the selected ship.
  _updateSlotArcs(ship) {
    this._clearSlotArcs();
    if (!ship || !ship.slots || !this._showArcOverlay) return;
    this._lastSlotArcShip = ship;

    const colors = [0xff9800, 0x40c4ff, 0x69f0ae, 0xffeb3b, 0xce93d8, 0x80cbc4];
    const segs = 24;
    for (let i = 0; i < ship.slots.length; i++) {
      const slot = ship.slots[i];
      if (!slot.weapon) continue;
      if (slot.health <= 0) continue;
      const arcHalf = slot.arc;
      if (arcHalf >= Math.PI * 0.95) continue; // omni — skip visual clutter
      const range = slot.weapon.range;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      for (let j = 0; j <= segs; j++) {
        const a = -arcHalf + (2 * arcHalf * j / segs);
        shape.lineTo(Math.sin(a) * range, Math.cos(a) * range);
      }
      shape.closePath();
      const geo = new THREE.ShapeGeometry(shape);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[i % colors.length], transparent: true, opacity: 0.09,
        side: THREE.DoubleSide, depthWrite: false,
      });
      const fan = new THREE.Mesh(geo, mat);
      fan.rotation.x = -Math.PI / 2;
      const group = new THREE.Group();
      group.add(fan);
      this.scene.add(group);
      this._slotArcGroups.push({ group, fan, slot });
    }
  }

  _createOcean() {
    const segs = 32;
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
    const count = 1800;
    const positions = new Float32Array(count * 3);
    this.biolumData = new Float32Array(count * 5); // x, y (depth), z, phase, riseSpeed
    for (let i = 0; i < count; i++) {
      const bx = (Math.random() - 0.5) * WORLD_W * 1.8;
      const by = -(Math.random() * WORLD_DEPTH);
      const bz = (Math.random() - 0.5) * WORLD_H * 1.8;
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
      size:            7,
      sizeAttenuation: true,
      transparent:     true,
      opacity:         0.85,
    });
    this.biolumPoints = new THREE.Points(geo, mat);
    this.scene.add(this.biolumPoints);

    // Marine snow / sediment particles — larger, dimmer, slower, drifting downward
    const snowCount = 600;
    const snowPos = new Float32Array(snowCount * 3);
    this._snowData = new Float32Array(snowCount * 5);
    for (let i = 0; i < snowCount; i++) {
      const sx = (Math.random() - 0.5) * WORLD_W * 1.8;
      const sy = -(Math.random() * WORLD_DEPTH * 0.85);
      const sz = (Math.random() - 0.5) * WORLD_H * 1.8;
      snowPos[i*3] = sx; snowPos[i*3+1] = sy; snowPos[i*3+2] = sz;
      this._snowData[i*5] = sx;
      this._snowData[i*5+1] = sy;
      this._snowData[i*5+2] = sz;
      this._snowData[i*5+3] = Math.random() * Math.PI * 2;
      this._snowData[i*5+4] = 3 + Math.random() * 8;  // fall speed (slow)
    }
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
    this._snowPositions = snowGeo.attributes.position;
    const snowMat = new THREE.PointsMaterial({
      color: 0x88aacc, size: 4, sizeAttenuation: true,
      transparent: true, opacity: 0.35,
    });
    this._snowPoints = new THREE.Points(snowGeo, snowMat);
    this.scene.add(this._snowPoints);

    // Current streaks — thin elongated lines showing ambient water flow
    const streakCount = 200;
    const streakLen = 40;
    const streakPos = new Float32Array(streakCount * 6); // 2 verts per streak
    this._streakData = new Float32Array(streakCount * 6); // x, y, z, phase, speed, angle
    for (let i = 0; i < streakCount; i++) {
      const sx = (Math.random() - 0.5) * WORLD_W * 1.8;
      const sy = -(50 + Math.random() * (WORLD_DEPTH - 200));
      const sz = (Math.random() - 0.5) * WORLD_H * 1.8;
      const ang = 0.38 + (Math.random() - 0.5) * 0.4; // current direction ± variation
      const spd = 15 + Math.random() * 35;
      const dx = Math.cos(ang) * streakLen;
      const dz = Math.sin(ang) * streakLen;
      streakPos[i*6]   = sx;      streakPos[i*6+1] = sy; streakPos[i*6+2] = sz;
      streakPos[i*6+3] = sx + dx; streakPos[i*6+4] = sy; streakPos[i*6+5] = sz + dz;
      this._streakData[i*6]   = sx;
      this._streakData[i*6+1] = sy;
      this._streakData[i*6+2] = sz;
      this._streakData[i*6+3] = Math.random() * Math.PI * 2;
      this._streakData[i*6+4] = spd;
      this._streakData[i*6+5] = ang;
    }
    const streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
    this._streakPositions = streakGeo.attributes.position;
    const streakMat = new THREE.LineBasicMaterial({
      color: 0x44bbcc, transparent: true, opacity: 0.12, depthWrite: false,
    });
    this._streakLines = new THREE.LineSegments(streakGeo, streakMat);
    this.scene.add(this._streakLines);
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
        bx = (Math.random() - 0.5) * WORLD_W * 1.8;
        bz = (Math.random() - 0.5) * WORLD_H * 1.8;
      }

      this.biolumData[i*5]   = bx;
      this.biolumData[i*5+1] = by;
      this.biolumData[i*5+2] = bz;
      pos.setXYZ(i, bx, by, bz);
    }
    pos.needsUpdate = true;
    this.biolumPoints.material.opacity = 0.5 + 0.35 * Math.abs(Math.sin(t * 0.7));

    // Marine snow — slowly descend, lateral drift
    if (this._snowData && this._snowPositions) {
      const sp = this._snowPositions;
      const sn = this._snowData.length / 5;
      for (let i = 0; i < sn; i++) {
        let sx = this._snowData[i*5];
        let sy = this._snowData[i*5+1];
        let sz = this._snowData[i*5+2];
        const sph = this._snowData[i*5+3];
        const srs = this._snowData[i*5+4];
        sx += Math.sin(t * 0.1 + sph) * 6 * dt;
        sz += Math.cos(t * 0.08 + sph * 0.7) * 5 * dt;
        sy -= srs * dt;
        if (sy < -WORLD_DEPTH * 0.9) {
          sy = -(Math.random() * WORLD_DEPTH * 0.15);
          sx = (Math.random() - 0.5) * WORLD_W * 1.8;
          sz = (Math.random() - 0.5) * WORLD_H * 1.8;
        }
        this._snowData[i*5] = sx;
        this._snowData[i*5+1] = sy;
        this._snowData[i*5+2] = sz;
        sp.setXYZ(i, sx, sy, sz);
      }
      sp.needsUpdate = true;
    }

    // Current streaks — drift along water flow direction
    if (this._streakData && this._streakPositions) {
      const sp2 = this._streakPositions;
      const sn2 = this._streakData.length / 6;
      const streakLen = 40;
      for (let i = 0; i < sn2; i++) {
        let sx = this._streakData[i*6];
        let sy = this._streakData[i*6+1];
        let sz = this._streakData[i*6+2];
        const ang = this._streakData[i*6+5];
        const spd = this._streakData[i*6+4];
        sx += Math.cos(ang) * spd * dt;
        sz += Math.sin(ang) * spd * dt;
        // Wrap when out of bounds
        if (sx > WORLD_W * 1.0) sx -= WORLD_W * 1.8;
        if (sx < -WORLD_W * 1.0) sx += WORLD_W * 1.8;
        if (sz > WORLD_H * 1.0) sz -= WORLD_H * 1.8;
        if (sz < -WORLD_H * 1.0) sz += WORLD_H * 1.8;
        const dx = Math.cos(ang) * streakLen;
        const dz = Math.sin(ang) * streakLen;
        sp2.setXYZ(i*2, sx, sy, sz);
        sp2.setXYZ(i*2+1, sx + dx, sy, sz + dz);
        this._streakData[i*6] = sx;
        this._streakData[i*6+2] = sz;
      }
      sp2.needsUpdate = true;
    }
  }

  // ── Sea grass (shader-instanced, single draw call, zero per-blade lights) ─
  _createSeaGrass() {
    const BLADE_SEGS  = 5;
    const BLADE_H     = 95;
    const BLADE_W     = 9;
    const PLANES      = 3;    // cross-planes: visible from any horizontal angle
    const COUNT       = 30000; // max slots; actual placed count set by noise rejection

    // Each cluster = PLANES quads rotated 60° apart in XZ.
    // Blades lean outward in the shader so they're also visible from above.
    const posArr = [], uvArr = [], hFArr = [], idxArr = [];

    for (let pl = 0; pl < PLANES; pl++) {
      const ang = (pl / PLANES) * Math.PI;
      const ca  = Math.cos(ang), sa = Math.sin(ang);
      for (let seg = 0; seg <= BLADE_SEGS; seg++) {
        const t  = seg / BLADE_SEGS;
        const y  = t * BLADE_H;
        const hw = (BLADE_W * 0.5) * (1 - t * 0.68);
        posArr.push(-hw * ca, y, -hw * sa);  uvArr.push(0, t);  hFArr.push(t);
        posArr.push( hw * ca, y,  hw * sa);  uvArr.push(1, t);  hFArr.push(t);
      }
      const base = pl * (BLADE_SEGS + 1) * 2;
      for (let seg = 0; seg < BLADE_SEGS; seg++) {
        const b = base + seg * 2;
        idxArr.push(b, b+1, b+2,  b+1, b+3, b+2);
      }
    }

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position',      new THREE.Float32BufferAttribute(posArr, 3));
    geo.setAttribute('uv',            new THREE.Float32BufferAttribute(uvArr,  2));
    geo.setAttribute('aHeightFactor', new THREE.Float32BufferAttribute(hFArr,  1));
    geo.setIndex(idxArr);
    geo.instanceCount = COUNT;

    // Noise-rejection placement: dense patches, natural clearings
    // Two noise layers at different scales combine for organic-looking grass fields.
    const iPhase  = new Float32Array(COUNT);
    const iBend   = new Float32Array(COUNT);
    const iOffset = new Float32Array(COUNT * 3);
    const iScale  = new Float32Array(COUNT);
    const iRotY   = new Float32Array(COUNT);

    let placed = 0;
    const MAX_TRIES = COUNT * 5;
    for (let t = 0; t < MAX_TRIES && placed < COUNT; t++) {
      // Extend well beyond world boundary so grass fades into fog — infinite ocean feel.
      const ix = (Math.random() - 0.5) * WORLD_W * 2.2;
      const iz = (Math.random() - 0.5) * WORLD_H * 2.2;

      // Large-scale (~800 unit) patches control the broad shape of grass fields
      const nLarge = Noise.fbm(ix * 0.00125, iz * 0.00125, 3, 2.1, 0.5, 11);
      // Medium-scale (~250 unit) detail adds smaller clearings within patches
      const nMed   = Noise.fbm(ix * 0.004,  iz * 0.004,  2, 2.0, 0.5, 53);
      // Combine: large-scale dominates, medium adds texture
      const density = nLarge * 0.70 + nMed * 0.30;

      // Reject if below threshold — tune threshold to control overall coverage (~70%)
      if (density < 0.30) continue;

      // Match grass base to actual terrain height using the same noise as _createSeafloor.
      const floorW = WORLD_W + 30000, floorH = WORLD_H + 30000;
      const twx = ix / floorW, twz = iz / floorH;
      const tRidge  = Noise.fbm(twx * 3 + 0.5, twz * 3 + 0.5, 4, 2.2, 0.52, 42);
      const tDetail = Noise.fbm(twx * 8,        twz * 8,        5, 2.1, 0.45, 200);
      const terrH   = (tRidge * 0.65 + tDetail * 0.35) * 320 - 320 * 0.3;
      const iy = -WORLD_DEPTH + terrH + 2;  // 2 units above terrain surface
      iPhase[placed]        = Math.random() * Math.PI * 2;
      iBend[placed]         = 10 + Math.random() * 18;
      iOffset[placed*3]     = ix;
      iOffset[placed*3 + 1] = iy;
      iOffset[placed*3 + 2] = iz;
      // Scale proportional to local density so patch centres are taller/fuller
      iScale[placed]        = 0.5 + density * 1.0 + Math.random() * 0.4;
      iRotY[placed]         = Math.random() * Math.PI * 2;
      placed++;
    }
    geo.instanceCount = placed; // only render placed clusters

    geo.setAttribute('aPhase',  new THREE.InstancedBufferAttribute(iPhase,  1));
    geo.setAttribute('aBend',   new THREE.InstancedBufferAttribute(iBend,   1));
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(iOffset, 3));
    geo.setAttribute('aScale',  new THREE.InstancedBufferAttribute(iScale,  1));
    geo.setAttribute('aRotY',   new THREE.InstancedBufferAttribute(iRotY,   1));

    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uTime: { value: 0.0 }, uRayMap: { value: this._godRayMap || null } },
      ]),
      vertexShader: /* glsl */`
        #include <fog_pars_vertex>
        attribute float aHeightFactor;
        attribute float aPhase;
        attribute float aBend;
        attribute vec3  aOffset;
        attribute float aScale;
        attribute float aRotY;
        uniform   float uTime;
        varying   float vHeight;
        varying   vec2  vWorldXZ;
        varying   vec2  vRayUV;

        void main() {
          vec3 pos = position * aScale;

          // Per-instance Y-rotation for variety
          float cy = cos(aRotY), sy = sin(aRotY);
          pos = vec3(pos.x * cy - pos.z * sy,
                     pos.y,
                     pos.x * sy + pos.z * cy);

          // Lean outward so blades have visible surface area from above.
          float lean = aHeightFactor * 30.0 * aScale;
          pos.x += cos(aPhase) * lean;
          pos.z += sin(aPhase) * lean;

          // Undersea current: global slow-rotating drift + per-blade turbulence.
          float currAng = uTime * 0.075;
          float currStr = 0.5 + 0.35 * sin(uTime * 0.13);
          float h2      = aHeightFactor * aHeightFactor;
          pos.x += (cos(currAng) * currStr + sin(uTime * 1.85 + aPhase) * 0.35) * aBend * h2;
          pos.z += (sin(currAng) * currStr + cos(uTime * 1.50 + aPhase * 1.7) * 0.25) * aBend * h2;

          pos += aOffset;
          vHeight = aHeightFactor;
          vWorldXZ = pos.xz * 0.00045;
          // UV for god ray light map (world position → 0..1)
          vRayUV = pos.xz / vec2(${(WORLD_W + 600).toFixed(1)}, ${(WORLD_H + 600).toFixed(1)}) + 0.5;
          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */`
        #include <fog_pars_fragment>
        uniform float uTime;
        uniform sampler2D uRayMap;
        varying float vHeight;
        varying vec2  vWorldXZ;
        varying vec2  vRayUV;

        float causticLight(vec2 p, float t) {
          vec2 w1 = vec2(sin(p.y * 1.618 + t * 0.28 + p.x * 0.3),
                         cos(p.x * 1.414 - t * 0.22 + p.y * 0.4)) * 0.45;
          vec2 q = p + w1;
          float n1 = sin(q.x * 4.637 + t * 0.68) * cos(q.y * 5.179 - t * 0.57);
          float n2 = sin(q.x * 3.271 - q.y * 5.743 + t * 0.61);
          return (n1 + n2) * 0.5;
        }

        void main() {
          vec3 base = vec3(0.01, 0.10, 0.05);
          vec3 mid  = vec3(0.02, 0.42, 0.26);
          vec3 tip  = vec3(0.08, 0.82, 0.58);
          vec3 col  = vHeight < 0.5
            ? mix(base, mid, vHeight * 2.0)
            : mix(mid,  tip, (vHeight - 0.5) * 2.0);
          // Bioluminescent tip glow
          float tipGlow = smoothstep(0.7, 1.0, vHeight);
          float pulse = 0.6 + 0.4 * sin(uTime * 1.8 + vHeight * 6.0);
          col += vec3(0.02, 0.35, 0.25) * tipGlow * pulse;
          // Warm base accent
          float baseWarm = smoothstep(0.3, 0.0, vHeight);
          col += vec3(0.06, 0.03, 0.01) * baseWarm;
          // God ray light — grass under shafts is brighter, outside is dimmer
          float rayLight = texture2D(uRayMap, vRayUV).r;
          float lightMod = 0.35 + rayLight * 1.2;
          // Caustic dappling — scaled by god ray presence
          vec2 cp = vWorldXZ * 15.5;
          float c = causticLight(cp, uTime) * 0.5 + 0.5;
          float caustic = pow(smoothstep(0.46, 0.76, c), 1.6);
          col += vec3(0.05, 0.22, 0.16) * caustic * lightMod * (0.6 + 0.4 * vHeight);
          col *= (0.7 + 0.3 * lightMod);
          gl_FragColor = vec4(col, 0.55 + 0.42 * vHeight);
          #include <fog_fragment>
        }
      `,
      fog:        true,
      side:       THREE.DoubleSide,
      alphaTest:  0.15,
      transparent: false,
      depthWrite: true,
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this._seaGrassMesh = mesh;

    // Jellyfish — bell body + trailing tentacles, purely emissive
    this._jellyMeshes = [];
    const jCols = [0x00ffaa, 0x8844ff, 0xff44cc, 0x00ccff, 0x55ddaa, 0xff88ee,
                   0x44ffdd, 0xbb66ff, 0xff66aa, 0x22ddff, 0x88ffcc, 0xdd88ff];
    for (let i = 0; i < 14; i++) {
      const r    = 12 + Math.random() * 28;
      const col  = jCols[i % jCols.length];
      const group = new THREE.Group();
      // Bell (dome)
      const bellGeo = new THREE.SphereGeometry(r, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6);
      bellGeo.scale(1, 0.55, 1);
      const bellMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.42, depthWrite: false });
      group.add(new THREE.Mesh(bellGeo, bellMat));
      // Inner bell (brighter core)
      const innerGeo = new THREE.SphereGeometry(r * 0.55, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.5);
      innerGeo.scale(1, 0.45, 1);
      const innerMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.65, depthWrite: false });
      group.add(new THREE.Mesh(innerGeo, innerMat));
      // Tentacles — thin cylinders hanging below
      const tentCount = 4 + Math.floor(Math.random() * 5);
      for (let t = 0; t < tentCount; t++) {
        const tLen  = r * (1.5 + Math.random() * 2.5);
        const tRad  = 0.3 + Math.random() * 0.5;
        const tGeo  = new THREE.CylinderGeometry(tRad * 0.3, tRad, tLen, 4);
        const tMat  = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.28, depthWrite: false });
        const tMesh = new THREE.Mesh(tGeo, tMat);
        const tAng  = (t / tentCount) * Math.PI * 2;
        const tDist = r * 0.4 + Math.random() * r * 0.3;
        tMesh.position.set(Math.cos(tAng) * tDist, -tLen * 0.5 - r * 0.15, Math.sin(tAng) * tDist);
        tMesh.rotation.z = (Math.random() - 0.5) * 0.3;
        tMesh.userData.tentPhase = Math.random() * Math.PI * 2;
        group.add(tMesh);
      }
      const jx = (Math.random() - 0.5) * WORLD_W * 0.9;
      const jy = -60 - Math.random() * 700;
      const jz = (Math.random() - 0.5) * WORLD_H * 0.9;
      group.position.set(jx, jy, jz);
      group.userData = { baseY: jy, phase: Math.random() * Math.PI * 2, driftSpeed: 2 + Math.random() * 4,
                         driftX: (Math.random() - 0.5) * 12, driftZ: (Math.random() - 0.5) * 8 };
      this.scene.add(group);
      this._jellyMeshes.push(group);
    }
  }

  _updateSeaGrass(dt) {
    if (this._seaGrassMesh) {
      this._seaGrassMesh.material.uniforms.uTime.value = this.time;
    }
    if (this._rockTimeRef) {
      this._rockTimeRef.value = this.time;
    }
    for (const g of (this._jellyMeshes || [])) {
      const ph = g.userData.phase;
      const spd = g.userData.driftSpeed || 4;
      // Vertical bob
      const dy = Math.sin(this.time * spd * 0.1 + ph) * 22;
      g.position.y = g.userData.baseY + dy;
      // Lateral drift
      g.position.x += (g.userData.driftX || 0) * dt;
      g.position.z += (g.userData.driftZ || 0) * dt;
      // Bell pulsation
      const pulse = 0.5 + 0.12 * Math.abs(Math.sin(this.time * 2.5 + ph));
      g.scale.y = pulse;
      // Tentacle sway
      for (const child of g.children) {
        if (child.userData.tentPhase !== undefined) {
          child.rotation.x = Math.sin(this.time * 1.2 + child.userData.tentPhase) * 0.15;
          child.rotation.z = Math.cos(this.time * 0.9 + child.userData.tentPhase * 1.3) * 0.12;
        }
      }
    }
  }

  // ── Terrain ───────────────────────────────────────────────────
  buildTerrain(terrain) {
    this.terrainGroup.clear();
    // Thermal halocline layer — semi-transparent plane at THERMAL_LAYER_DEPTH
    if (!this._thermalLayer) {
      const tlGeo = new THREE.PlaneGeometry(WORLD_W + 30000, WORLD_H + 30000, 1, 1);
      const tlMat = new THREE.MeshBasicMaterial({
        color: 0x001a44,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this._thermalLayer = new THREE.Mesh(tlGeo, tlMat);
      this._thermalLayer.rotation.x = Math.PI / 2;
      this._thermalLayer.position.y = -THERMAL_LAYER_DEPTH;
      this.scene.add(this._thermalLayer);
      // Edge glow lines
      const edgeGeo = new THREE.BufferGeometry();
      const hw = (WORLD_W + 30000) / 2, hh = (WORLD_H + 30000) / 2;
      edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        -hw, -THERMAL_LAYER_DEPTH, -hh,
         hw, -THERMAL_LAYER_DEPTH, -hh,
         hw, -THERMAL_LAYER_DEPTH,  hh,
        -hw, -THERMAL_LAYER_DEPTH,  hh,
        -hw, -THERMAL_LAYER_DEPTH, -hh,
      ], 3));
      const edgeMat = new THREE.LineBasicMaterial({ color: 0x003388, transparent: true, opacity: 0.3, depthWrite: false });
      this._thermalLayerEdge = new THREE.Line(edgeGeo, edgeMat);
      this.scene.add(this._thermalLayerEdge);
    }
    for (const t of terrain) {
      const tx = this.wx(t.x), tz = this.wz(t.y);
      if (t.type === 'island') {
        // Rock cluster: icosahedron boulders sitting on the seafloor
        const rockCount = 4 + Math.floor(Math.random() * 6);
        const rockMats = [
          new THREE.MeshStandardMaterial({ color: 0x1a2a18, roughness: 0.96, metalness: 0.04, emissive: new THREE.Color(0x040c04), emissiveIntensity: 0.5 }),
          new THREE.MeshStandardMaterial({ color: 0x222e1e, roughness: 0.93, metalness: 0.07, emissive: new THREE.Color(0x060e06), emissiveIntensity: 0.4 }),
          new THREE.MeshStandardMaterial({ color: 0x0e1a0e, roughness: 0.98, metalness: 0.02, emissive: new THREE.Color(0x030803), emissiveIntensity: 0.6 }),
        ];
        for (let r = 0; r < rockCount; r++) {
          const rockSize = t.radius * (0.25 + Math.random() * 0.55);
          const geo = new THREE.IcosahedronGeometry(rockSize, 1);
          // Displace vertices to break up the perfect icosahedron shape
          const posAttr = geo.attributes.position;
          for (let v = 0; v < posAttr.count; v++) {
            const vx = posAttr.getX(v), vy = posAttr.getY(v), vz = posAttr.getZ(v);
            const jitter = 0.72 + Math.random() * 0.56;
            const flattenY = 0.45 + Math.random() * 0.40; // rocks are flatter than tall
            posAttr.setXYZ(v, vx * jitter, vy * flattenY, vz * jitter);
          }
          geo.computeVertexNormals();
          const mat = rockMats[r % rockMats.length];
          const mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = true;
          const ang   = Math.random() * Math.PI * 2;
          const rdist = Math.random() * t.radius * 0.7;
          const groundY = -WORLD_DEPTH + 2 + Noise.fbm(
            (tx + Math.cos(ang) * rdist) * 0.0005,
            (tz + Math.sin(ang) * rdist) * 0.0005, 4) * 260;
          mesh.position.set(
            tx + Math.cos(ang) * rdist,
            groundY + rockSize * 0.30,  // slightly embedded in ground
            tz + Math.sin(ang) * rdist
          );
          mesh.rotation.set(
            (Math.random() - 0.5) * 0.9,
            Math.random() * Math.PI * 2,
            (Math.random() - 0.5) * 0.7
          );
          this.terrainGroup.add(mesh);
        }
        // Tall central spine — one large vertical formation
        const spineH = 180 + Math.random() * 280;
        const spineGeo = new THREE.CylinderGeometry(t.radius * 0.15, t.radius * 0.45, spineH, 7);
        const spineMat = new THREE.MeshStandardMaterial({
          color: 0x152212, roughness: 0.97, metalness: 0.03,
          emissive: new THREE.Color(0x041004), emissiveIntensity: 0.5,
        });
        const spine = new THREE.Mesh(spineGeo, spineMat);
        spine.position.set(tx, -WORLD_DEPTH + spineH * 0.5, tz);
        spine.rotation.z = (Math.random() - 0.5) * 0.3;
        this.terrainGroup.add(spine);
      } else if (t.type === 'rock_pillar') {
        // Rock pillar: tall column rising from seafloor through mid-water, blocks LOS
        const pillarH = 400 + Math.random() * 500;
        const baseR   = t.radius * 0.35;
        const topR    = t.radius * 0.12;
        const pillarGeo = new THREE.CylinderGeometry(topR, baseR, pillarH, 8);
        const pillarMat = new THREE.MeshStandardMaterial({
          color: 0x1a2a28, emissive: new THREE.Color(0x041008), emissiveIntensity: 0.3,
          roughness: 0.92, metalness: 0.08,
        });
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(tx, -WORLD_DEPTH + pillarH * 0.5, tz);
        pillar.rotation.z = (Math.random() - 0.5) * 0.15;
        this.terrainGroup.add(pillar);
        // Scattered boulders at base
        for (let b = 0; b < 4; b++) {
          const bAng = Math.random() * Math.PI * 2;
          const bDist = baseR + Math.random() * t.radius * 0.4;
          const bSize = 15 + Math.random() * 25;
          const bGeo = new THREE.DodecahedronGeometry(bSize, 0);
          bGeo.scale(1, 0.4 + Math.random() * 0.3, 1);
          const bMat = new THREE.MeshStandardMaterial({
            color: 0x1a2a28, emissive: 0x030806, emissiveIntensity: 0.2,
            roughness: 0.95,
          });
          const bMesh = new THREE.Mesh(bGeo, bMat);
          bMesh.position.set(
            tx + Math.cos(bAng) * bDist,
            -WORLD_DEPTH + bSize * 0.3,
            tz + Math.sin(bAng) * bDist
          );
          bMesh.rotation.set(Math.random()*0.5, Math.random()*Math.PI*2, Math.random()*0.5);
          this.terrainGroup.add(bMesh);
        }
        // Subtle glow at pillar base
        const glowMat = new THREE.MeshBasicMaterial({ color: 0x00aa66, transparent: true, opacity: 0.08 });
        const glowDisc = new THREE.Mesh(new THREE.CircleGeometry(baseR * 1.5, 12), glowMat);
        glowDisc.rotation.x = -Math.PI / 2;
        glowDisc.position.set(tx, -WORLD_DEPTH + 3, tz);
        this.terrainGroup.add(glowDisc);
      } else if (t.type === 'kelp') {
        // Deep-water kelp: long ribbons rooted at seafloor, rising toward surface
        for (let k=0; k<18; k++) {
          const ang = Math.random()*Math.PI*2;
          const r = Math.random()*t.radius*0.8;
          const h = 350 + Math.random()*550;
          const geo = new THREE.CylinderGeometry(2,6,h,5);
          const mat = new THREE.MeshStandardMaterial({ color: 0x0b2a08, emissive: 0x051a03, emissiveIntensity: 0.5 });
          const m = new THREE.Mesh(geo, mat);
          const baseY = -WORLD_DEPTH + 5;
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
      } else if (t.type === 'algae_bloom') {
        // Algae bloom: large bioluminescent cloud spanning the water column
        const layers = 5;
        for (let k = 0; k < layers; k++) {
          const frac = k / (layers - 1);
          const ly = -(frac * WORLD_DEPTH * 0.85);
          const lr = t.radius * (0.7 + 0.5 * Math.sin(frac * Math.PI));
          const geo = new THREE.SphereGeometry(lr, 10, 8);
          const mat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(0x1a4d1a).lerpColors(new THREE.Color(0x1a4d1a), new THREE.Color(0x005500), frac),
            transparent: true,
            opacity: 0.12 + frac * 0.06,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(tx, ly, tz);
          this.terrainGroup.add(mesh);
        }
        // Bright green glow light inside bloom
        const bloomLight = new THREE.PointLight(0x44ff88, 1.2, t.radius * 1.8);
        bloomLight.position.set(tx, -WORLD_DEPTH * 0.4, tz);
        this.scene.add(bloomLight);
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

    // Rim-glow shell — slightly larger inverted-hull sphere with a biolum fresnel shader
    const rimGeo = new THREE.SphereGeometry(ship.size * 1.15, 10, 8);
    const rimCol = new THREE.Color(ship.glowColor);
    const rimMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: rimCol }, uTime: { value: 0.0 } },
      vertexShader: /* glsl */`
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vNormal  = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewDir = normalize(-mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3  uColor;
        uniform float uTime;
        varying vec3  vNormal;
        varying vec3  vViewDir;
        void main() {
          // Fresnel: bright at silhouette edges, dark head-on
          float rim = 1.0 - abs(dot(vNormal, vViewDir));
          rim = pow(rim, 1.8);
          // Slow pulse + secondary fast shimmer
          float pulse = 0.75 + 0.25 * sin(uTime * 1.4);
          float shimmer = 1.0 + 0.08 * sin(uTime * 7.0 + vNormal.x * 4.0);
          gl_FragColor = vec4(uColor * 1.6, rim * 0.65 * pulse * shimmer);
        }
      `,
      transparent: true,
      depthWrite:  false,
      side:        THREE.BackSide, // render inside-out so it shows behind the ship geometry
    });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.name = 'rim';

    // Main point light (ship glow) — illuminates nearby seafloor/creatures
    const light = new THREE.PointLight(new THREE.Color(ship.glowColor), 2.2, ship.size * 25);
    group.add(light);

    // Underside fill light — simulates bioluminescent ocean bounce
    const fillLight = new THREE.PointLight(0x002244, 1.0, ship.size * 12);
    fillLight.position.set(0, -ship.size * 0.4 / (ship.size / 20), 0);
    group.add(fillLight);

    // Forward spotlight — subtle directional accent on bow
    const bowLight = new THREE.PointLight(new THREE.Color(ship.glowColor), 0.6, ship.size * 8);
    bowLight.position.set(0, 2, -ship.size * 0.6 / (ship.size / 20));
    group.add(bowLight);

    const container = new THREE.Group();
    container.add(group);
    container.add(rimMesh);

    this.scene.add(container);
    // Cache hull mesh refs once to avoid traverse() every frame
    const hullMeshes = [];
    group.traverse(c => { if (c.isMesh && c.material && c.material.emissive !== undefined) hullMeshes.push(c); });

    // Collect engine nozzle meshes (MeshBasicMaterial glows) before adding RCS thrusters
    const engineGlows = [];
    group.traverse(c => { if (c.isMesh && c.material && c.material.isMeshBasicMaterial) engineGlows.push(c); });

    // Add side RCS thrusters — scaled to match ship model size
    const sf = ship.size / 20;
    const glowColor = new THREE.Color(ship.glowColor);
    const thrMat = new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.6 });
    const thrGeo = new THREE.CylinderGeometry(1.5 * sf, 2.2 * sf, 6 * sf, 6);
    const thrusterDefs = [
      { x: -15 * sf, z: -28 * sf, rz:  Math.PI/2  },   // port bow
      { x:  15 * sf, z: -28 * sf, rz: -Math.PI/2  },   // starboard bow
      { x: -15 * sf, z:  28 * sf, rz:  Math.PI/2  },   // port stern
      { x:  15 * sf, z:  28 * sf, rz: -Math.PI/2  },   // starboard stern
    ];
    const thrusters = thrusterDefs.map(td => {
      const m = new THREE.Mesh(thrGeo, thrMat.clone());
      m.position.set(td.x, 0, td.z);
      m.rotation.z = td.rz;
      group.add(m);
      return { mesh: m, x: td.x, z: td.z };
    });

    // Turret slot visual representations
    const turretMeshes = this._buildTurretMeshes(ship, group, sf);

    // Running lights — port red, starboard green, stern white, bow blue
    const navLights = [];
    const navDefs = [
      { x: -12 * sf, y: 2 * sf, z:  5 * sf, color: 0xff2200, phase: 0 },       // port
      { x:  12 * sf, y: 2 * sf, z:  5 * sf, color: 0x00ff44, phase: 0.5 },      // starboard
      { x:   0,      y: 3 * sf, z: 30 * sf, color: 0xffffff, phase: 1.0 },      // stern
      { x:   0,      y: 2 * sf, z:-32 * sf, color: new THREE.Color(ship.glowColor).getHex(), phase: 1.5 }, // bow
    ];
    for (const nd of navDefs) {
      const nlGeo = new THREE.SphereGeometry(0.8 * sf, 5, 4);
      const nlMat = new THREE.MeshBasicMaterial({ color: nd.color, transparent: true, opacity: 0.9 });
      const nlMesh = new THREE.Mesh(nlGeo, nlMat);
      nlMesh.position.set(nd.x, nd.y, nd.z);
      nlMesh.userData.phase = nd.phase;
      nlMesh.userData.baseOp = 0.9;
      group.add(nlMesh);
      navLights.push(nlMesh);
    }

    const data = { container, group, light, ship, hullMeshes, thrusters, engineGlows, turretMeshes, navLights };
    this.shipMeshes.set(ship.id, data);
    return data;
  }

  // Build turret meshes for each weapon slot and attach to the (scaled) hull group.
  _buildTurretMeshes(ship, group, sf) {
    if (!ship.slots || ship.slots.length === 0) return [];
    const turretMeshes = [];
    for (const slot of ship.slots) {
      if (!slot.weapon) continue;
      const tGroup = ShipModels.buildTurretGroup(slot, sf);
      if (!tGroup) continue;
      group.add(tGroup);
      turretMeshes.push({ mesh: tGroup, slot });
    }
    return turretMeshes;
  }

  updateShipMesh(ship) {
    if (ship.isDestroyed && ship.destroyTimer <= 0) {
      const data = this.shipMeshes.get(ship.id);
      if (data) {
        this.scene.remove(data.container);
        if (data.bubbles)    { for (const b of data.bubbles)    { this.scene.remove(b); b.geometry.dispose(); b.material.dispose(); } }
        if (data.rcsBubbles) { for (const b of data.rcsBubbles) { this.scene.remove(b); b.geometry.dispose(); b.material.dispose(); } }
        this.shipMeshes.delete(ship.id);
      }
      // Remove contact blip if present
      const blip = this._contactBlips && this._contactBlips.get(ship.id);
      if (blip) { this.scene.remove(blip); blip.geometry.dispose(); blip.material.dispose(); this._contactBlips.delete(ship.id); }
      return;
    }

    // ── Detection-based visibility ─────────────────────────────────
    const det = ship.detectionLevel; // 0=unknown, 1=contact, 2=identified
    // det=2 shows full model only when accuracy is high enough; otherwise blip
    const showBlip = det === 1 || (det === 2 && ship._displayAccuracy !== undefined && ship._displayAccuracy < 0.85);

    if (!this._contactBlips) this._contactBlips = new Map();

    // Unknown (det=0): nothing rendered
    if (det === 0) {
      const data = this.shipMeshes.get(ship.id);
      if (data) data.container.visible = false;
      const oldBlip = this._contactBlips.get(ship.id);
      if (oldBlip) { this.scene.remove(oldBlip); oldBlip.geometry.dispose(); oldBlip.material.dispose(); this._contactBlips.delete(ship.id); }
      const staleRing0 = this._revealedRings && this._revealedRings.get(ship.id);
      if (staleRing0) staleRing0.visible = false;
      return;
    }

    if (showBlip) {
      // Show contact blip, hide ship model
      const data = this.shipMeshes.get(ship.id);
      if (data) { data.container.visible = false; }
      if (!this._contactBlips.has(ship.id)) {
        const bg  = new THREE.SphereGeometry(14, 8, 6);
        const bm  = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.55, depthWrite: false });
        const blip = new THREE.Mesh(bg, bm);
        this._contactBlips.set(ship.id, blip);
        this.scene.add(blip);
      }
      const blip = this._contactBlips.get(ship.id);
      const bx = (ship._displayX !== null && ship._displayX !== undefined) ? ship._displayX : ship.x;
      const by = (ship._displayY !== null && ship._displayY !== undefined) ? ship._displayY : ship.y;
      blip.position.set(this.wx(bx), -(ship.depth || 0), this.wz(by));
      blip.material.opacity = 0.35 + 0.25 * Math.abs(Math.sin(this.time * 2.5));
      blip.scale.setScalar(1 + 0.18 * Math.sin(this.time * 3.0));
      const staleRingB = this._revealedRings && this._revealedRings.get(ship.id);
      if (staleRingB) staleRingB.visible = false;
      return;
    }

    // Full model: remove any lingering blip
    const lingBlip = this._contactBlips && this._contactBlips.get(ship.id);
    if (lingBlip) { this.scene.remove(lingBlip); lingBlip.geometry.dispose(); lingBlip.material.dispose(); this._contactBlips.delete(ship.id); }

    const data = this._getOrCreateShipMesh(ship);
    data.container.visible = true;
    const { container, group, light } = data;

    container.position.set(this.wx(ship.x), -(ship.depth || 0), this.wz(ship.y));
    group.rotation.y = -ship.angle;

    // Compute angular velocity once — shared by banking, pitch, and RCS
    if (data._lastAngle === undefined) data._lastAngle = ship.angle;
    const _dAngle = ship.angle - data._lastAngle;
    data._lastAngle = ship.angle;
    const _turn = (((_dAngle + Math.PI) % (Math.PI * 2)) - Math.PI);
    const _dt = this._dt || 0.016;

    // Speed delta — computed here so both pitch and RCS braking detection share it
    if (data._lastSpeed === undefined) data._lastSpeed = ship.speed;
    const _speedDelta = ship.speed - data._lastSpeed;
    data._lastSpeed = ship.speed;

    // Banking on turns + nose pitch on acceleration (alive ships only)
    if (!ship.isDestroyed) {
      if (data._bankAngle === undefined) data._bankAngle = 0;
      const angVel = _turn / Math.max(_dt, 0.001);
      const maxBank = 0.28;
      const targetBank = Math.max(-maxBank, Math.min(maxBank, angVel * 0.55));
      data._bankAngle += (targetBank - data._bankAngle) * Math.min(1, 4.5 * _dt);
      group.rotation.z = data._bankAngle;

      if (data._pitchAngle === undefined) data._pitchAngle = 0;
      const accel = _speedDelta / Math.max(_dt, 0.001);
      // Depth change drives the primary pitch (nose down = descending, nose up = ascending)
      const depthDiff  = ship.targetDepth - ship.depth;
      const depthPitch = Math.max(-0.24, Math.min(0.24, depthDiff * 0.0012));
      const accelPitch = Math.max(-0.07, Math.min(0.07, -accel * 0.06));
      const targetPitch = depthPitch + accelPitch;
      data._pitchAngle += (targetPitch - data._pitchAngle) * Math.min(1, 4.0 * _dt);
      group.rotation.x = data._pitchAngle;
    }

    // Turret tracking + slot health — rotate turrets toward attack target
    if (data.turretMeshes) {
      const atkTgt = ship.attackTarget && !ship.attackTarget.isDestroyed ? ship.attackTarget : null;
      for (const { mesh, slot } of data.turretMeshes) {
        if (slot.health <= 0) {
          mesh.visible = false;
          continue;
        }
        mesh.visible = true;
        // Rotate turret toward attack target (visual only — engine handles arc checks)
        if (atkTgt && slot.weapon) {
          const [wx, wy] = ship._slotWorldPos ? ship._slotWorldPos(slot) : [ship.x, ship.y];
          const toTarget = Math.atan2(atkTgt.x - wx, -(atkTgt.y - wy));
          const shipRelative = toTarget - ship.angle;
          // Clamp to slot arc
          let diff = ((shipRelative - slot.facing + Math.PI) % (Math.PI * 2)) - Math.PI;
          if (diff > Math.PI) diff -= Math.PI * 2;
          if (diff < -Math.PI) diff += Math.PI * 2;
          const clamped = Math.abs(diff) <= slot.arc
            ? slot.facing + diff
            : slot.facing + Math.sign(diff) * slot.arc;
          const targetRotY = -clamped;
          // Smooth lerp toward target rotation
          if (mesh._currentRotY === undefined) mesh._currentRotY = mesh.rotation.y;
          let rDiff = targetRotY - mesh._currentRotY;
          if (rDiff > Math.PI) rDiff -= Math.PI * 2;
          if (rDiff < -Math.PI) rDiff += Math.PI * 2;
          mesh._currentRotY += rDiff * Math.min(1, 4.5 * _dt);
          mesh.rotation.y = mesh._currentRotY;
        } else {
          // No target — return to default facing
          const restRotY = -slot.facing;
          if (mesh._currentRotY === undefined) mesh._currentRotY = restRotY;
          let rDiff = restRotY - mesh._currentRotY;
          if (rDiff > Math.PI) rDiff -= Math.PI * 2;
          if (rDiff < -Math.PI) rDiff += Math.PI * 2;
          mesh._currentRotY += rDiff * Math.min(1, 2.0 * _dt);
          mesh.rotation.y = mesh._currentRotY;
        }
        // Dim damaged turrets
        const dimmed = slot.health < 50;
        mesh.children.forEach(c => {
          if (c.material && c.material.emissive) {
            c.material.emissiveIntensity = dimmed ? (c.material._baseEI || 0.1) * 0.25 : (c.material._baseEI || c.material.emissiveIntensity);
          }
        });
      }
    }
    // Hit flash / destroyed fade — use cached hull mesh refs, no traverse()
    const hullMeshes = data.hullMeshes;
    if (ship.hitFlashTimer > 0) {
      for (const c of hullMeshes) c.material.emissiveIntensity = 1.5;
    } else {
      // God ray + caustic light on hull
      const _rayLight = this._sampleGodRay(ship.x, ship.y);
      const _lightMod = 0.3 + _rayLight * 1.3;
      const _cx = ship.x * 0.007, _cy = ship.y * 0.007, _ct = this.time;
      const _w1 = Math.sin(_cy * 1.618 + _ct * 0.28 + _cx * 0.3) * 0.45;
      const _w2 = Math.cos(_cx * 1.414 - _ct * 0.22 + _cy * 0.4) * 0.45;
      const _n1 = Math.sin((_cx + _w2) * 4.637 + _ct * 0.68) * Math.cos((_cy + _w1) * 5.179 - _ct * 0.57);
      const _n2 = Math.sin((_cx + _w2) * 3.271 - (_cy + _w1) * 5.743 + _ct * 0.61);
      const _caustic = Math.max(0, (_n1 + _n2) * 0.25 + 0.5);
      const _cBoost = _caustic * _caustic * 0.22 * _lightMod;
      const _baseEImod = _lightMod * 0.85 + 0.15;  // ships in shadow are dimmer overall
      for (const c of hullMeshes) c.material.emissiveIntensity = (c.material._baseEI || 0.32) * _baseEImod + _cBoost;
    }
    if (ship.isDestroyed) {
      const initT = ship.deathType === 'sink' ? 5.0 : ship.deathType === 'detonate' ? 3.5 : 2.5;
      const prog  = Math.max(0, 1 - ship.destroyTimer / initT);
      const sinkDir = (ship.id % 3 === 0) ? 1 : -1;

      if (ship.deathType === 'sink') {
        group.rotation.z = prog * Math.PI * 0.52 * sinkDir;
        container.position.y -= prog * ship.size * 2.2;
        const fadeAt = 0.5;
        const alpha = prog < fadeAt ? 1.0 : Math.max(0, 1 - (prog - fadeAt) / (1 - fadeAt));
        for (const c of hullMeshes) { c.material.transparent = true; c.material.opacity = alpha; }
      } else if (ship.deathType === 'explode') {
        group.rotation.z = prog * Math.PI * 1.6 * sinkDir;
        group.rotation.x = prog * Math.PI * 0.45;
        const alpha = Math.max(0, 1 - prog * 1.3);
        for (const c of hullMeshes) { c.material.transparent = true; c.material.opacity = alpha; }
      } else { // detonate — white flash then vanish
        const alpha  = Math.max(0, 1 - prog * 1.5);
        const ei     = Math.max(0, 2.5 - prog * 5.0);
        for (const c of hullMeshes) {
          c.material.transparent = true;
          c.material.opacity = alpha;
          c.material.emissiveIntensity = ei;
        }
        group.rotation.z = prog * Math.PI * 1.8 * sinkDir;
        container.position.y -= prog * ship.size * 0.8;
      }
    }

    // Engine glow intensity from speed + pulse
    const speedPct = ship.speed / ship.maxSpeed;
    const engPulse = 1.0 + 0.18 * Math.sin(this.time * 8.0 + ship.id);
    light.intensity = (0.3 + speedPct * 0.9) * engPulse;
    light.color.set(ship.glowColor);
    // Animate all engine nozzle meshes together
    if (data.engineGlows && data.engineGlows.length > 0) {
      const nozzleOp = (0.45 + speedPct * 0.55) * engPulse;
      for (const eg of data.engineGlows) eg.material.opacity = nozzleOp;
    } else if (group.userData.engineGlow) {
      group.userData.engineGlow.material.opacity = 0.45 + speedPct * 0.55;
    }
    // Rim glow time update
    const rimMesh = container.children.find(c => c.name === 'rim');
    if (rimMesh) rimMesh.material.uniforms.uTime.value = this.time;

    // Running lights — blink pattern
    if (data.navLights && !ship.isDestroyed) {
      for (const nl of data.navLights) {
        const blink = Math.sin(this.time * 3.5 + nl.userData.phase * Math.PI * 2);
        nl.material.opacity = blink > 0.2 ? 0.9 : 0.15;
      }
    } else if (data.navLights && ship.isDestroyed) {
      for (const nl of data.navLights) nl.material.opacity = 0;
    }

    // Depth-based hull tinting — deeper = bluer/darker ambient feel
    if (!ship.isDestroyed) {
      const depthFrac = Math.min(1, (ship.depth || 0) / (WORLD_DEPTH * 0.8));
      const depthDim = 1.0 - depthFrac * 0.3;  // up to 30% darker at max depth
      const depthBlue = depthFrac * 0.08;        // subtle blue shift
      for (const c of hullMeshes) {
        if (c.material._baseColor === undefined) c.material._baseColor = c.material.color.clone();
        c.material.color.copy(c.material._baseColor).multiplyScalar(depthDim);
        c.material.color.b = Math.min(1, c.material.color.b + depthBlue);
      }
    }

    // ── RCS thrusters — permanent dim fixtures that vent bubbles when firing ──
    if (data.thrusters) {
      const isTurningPort = _turn < -0.001;
      const isTurningStarboard = _turn > 0.001;
      if (!data.rcsBubbles) data.rcsBubbles = [];
      const rcsAng = ship.angle;

      for (const thr of data.thrusters) {
        const isPort = thr.x < 0;
        const isBow  = thr.z < 0;
        const active = !ship.isDestroyed && (
          (isTurningPort      && !isPort &&  isBow)  ||
          (isTurningPort      &&  isPort && !isBow)  ||
          (isTurningStarboard &&  isPort &&  isBow)  ||
          (isTurningStarboard && !isPort && !isBow)
        );
        // Mesh is invisible — kept only as a world-space anchor for bubble spawning
        thr.mesh.visible = false;

        // Spawn small bubble jets from active thruster world position
        if (active && Math.random() < 10 * _dt) {
          const thrPos = new THREE.Vector3();
          thr.mesh.getWorldPosition(thrPos);
          // Spray direction: perpendicular to heading, outward from ship center
          const sideX = isPort ? -Math.cos(rcsAng) : Math.cos(rcsAng);
          const sideZ = isPort ? -Math.sin(rcsAng) : Math.sin(rcsAng);
          const bg = new THREE.SphereGeometry(0.5 + Math.random() * 0.9, 4, 3);
          const bm = new THREE.MeshBasicMaterial({
            color: new THREE.Color(ship.glowColor).lerp(new THREE.Color(0xaaeeff), 0.55),
            transparent: true, opacity: 0.65, depthWrite: false,
          });
          const bub = new THREE.Mesh(bg, bm);
          bub.position.copy(thrPos);
          bub.userData.vel = new THREE.Vector3(
            sideX * (1.2 + Math.random() * 1.8) + (Math.random() - 0.5) * 0.5,
            0.2 + Math.random() * 0.5,
            sideZ * (1.2 + Math.random() * 1.8) + (Math.random() - 0.5) * 0.5
          );
          bub.userData.life = 0.2 + Math.random() * 0.25;
          bub.userData.maxLife = bub.userData.life;
          this.scene.add(bub);
          data.rcsBubbles.push(bub);
        }
      }
      // Animate RCS bubbles
      for (let i = data.rcsBubbles.length - 1; i >= 0; i--) {
        const b = data.rcsBubbles[i];
        b.userData.life -= _dt;
        if (b.userData.life <= 0) {
          this.scene.remove(b); b.geometry.dispose(); b.material.dispose();
          data.rcsBubbles.splice(i, 1);
          continue;
        }
        const t = b.userData.life / b.userData.maxLife;
        b.position.addScaledVector(b.userData.vel, _dt * 60);
        b.material.opacity = t * 0.55;
        b.scale.setScalar(1 + (1 - t) * 0.5);
      }
    }

    // ── Engine bubble particles ────────────────────────────────────
    if (!data.bubbles) data.bubbles = [];
    if (!ship.isDestroyed && speedPct > 0.05) {
      if (!data._bubbleTimer) data._bubbleTimer = 0;
      data._bubbleTimer += _dt;
      const spawnRate = 0.05 + speedPct * 0.07;
      const wakeAng = ship.angle;
      const aftX = -Math.sin(wakeAng);
      const aftZ =  Math.cos(wakeAng);
      const wakeSpd = 1.5 + speedPct * 2.5;
      while (data._bubbleTimer > spawnRate) {
        data._bubbleTimer -= spawnRate;
        const bg = new THREE.SphereGeometry(1.2 + Math.random() * 2.2, 4, 3);
        const bm = new THREE.MeshBasicMaterial({
          color: new THREE.Color(ship.glowColor).lerp(new THREE.Color(0x88ddff), 0.6),
          transparent: true, opacity: 0.5 + Math.random() * 0.3, depthWrite: false,
        });
        const bub = new THREE.Mesh(bg, bm);

        // Player ships: spawn from a random engine nozzle world position
        // Enemy ships: spawn from general stern area
        if (ship.isPlayer && data.engineGlows && data.engineGlows.length > 0) {
          const nozzle = data.engineGlows[Math.floor(Math.random() * data.engineGlows.length)];
          const np = new THREE.Vector3();
          nozzle.getWorldPosition(np);
          bub.position.set(
            np.x + (Math.random() - 0.5) * 4,
            np.y + (Math.random() - 0.5) * 3,
            np.z + (Math.random() - 0.5) * 4
          );
        } else {
          const bsf = ship.size / 20;
          const sternDist = bsf * ship.size * 1.4;
          bub.position.set(
            container.position.x + aftX * sternDist + (Math.random() - 0.5) * ship.size * 0.4,
            container.position.y + (Math.random() - 0.5) * ship.size * 0.3,
            container.position.z + aftZ * sternDist + (Math.random() - 0.5) * ship.size * 0.4
          );
        }

        bub.userData.vel = new THREE.Vector3(
          aftX * wakeSpd + (Math.random() - 0.5) * 0.5,
          0.8 + Math.random() * 1.2,
          aftZ * wakeSpd + (Math.random() - 0.5) * 0.5
        );
        bub.userData.life = 0.6 + Math.random() * 0.8;
        bub.userData.maxLife = bub.userData.life;
        this.scene.add(bub);
        data.bubbles.push(bub);
      }
    }
    // Animate existing bubbles
    for (let i = data.bubbles.length - 1; i >= 0; i--) {
      const b = data.bubbles[i];
      b.userData.life -= _dt;
      if (b.userData.life <= 0) {
        this.scene.remove(b); b.geometry.dispose(); b.material.dispose();
        data.bubbles.splice(i, 1);
        continue;
      }
      const t = b.userData.life / b.userData.maxLife;
      b.position.addScaledVector(b.userData.vel, _dt * 60);
      b.material.opacity = t * 0.6;
      b.scale.setScalar(1 + (1 - t) * 0.8);
    }

    // ── Fire visual: flickering orange/red point light ─────────────
    if (!data.fireLights) data.fireLights = [];
    if (ship.isOnFire) {
      if (data.fireLights.length === 0) {
        const fl = new THREE.PointLight(0xff3300, 2.5, ship.size * 7);
        fl.position.set(0, ship.size * 0.3, 0);
        container.add(fl);
        data.fireLights.push(fl);
      }
      const fl = data.fireLights[0];
      // Flicker intensity and hue
      fl.intensity = 1.0 + 2.2 * Math.abs(Math.sin(this.time * 11.0 + ship.id * 0.9));
      fl.color.setHex(Math.random() < 0.12 ? 0xff8800 : 0xff2200);
    } else if (data.fireLights.length > 0) {
      for (const fl of data.fireLights) container.remove(fl);
      data.fireLights.length = 0;
    }

    // ── Flooding visual: blue-shifted emissive tint ────────────────
    if (ship.flooding > 0.18) {
      const t = Math.min(1, (ship.flooding - 0.18) / 0.82);
      const floodBlue = new THREE.Color(0x001155);
      for (const c of hullMeshes) {
        const base = new THREE.Color(c.material._baseEmissive || ship.glowColor);
        c.material.emissive.lerpColors(base, floodBlue, t * 0.55);
      }
    }

    // ── Revealed lock indicator: pulsing gold ring ────────────────
    if (!this._revealedRings) this._revealedRings = new Map();
    if (ship._revealed && !ship.isDestroyed) {
      if (!this._revealedRings.has(ship.id)) {
        const segs = 20;
        const geo = new THREE.BufferGeometry();
        const verts = new Float32Array((segs + 1) * 3);
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * Math.PI * 2;
          verts[i * 3]     = Math.sin(a);
          verts[i * 3 + 1] = 0;
          verts[i * 3 + 2] = Math.cos(a);
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        const mat = new THREE.LineBasicMaterial({ color: 0xffd54f, transparent: true, opacity: 0.9, depthWrite: false });
        const ring = new THREE.Line(geo, mat);
        this.scene.add(ring);
        this._revealedRings.set(ship.id, ring);
      }
      const ring = this._revealedRings.get(ship.id);
      ring.visible = true;
      const r = ship.size * 1.6;
      ring.scale.setScalar(r);
      ring.position.set(this.wx(ship.x), -(ship.depth || 0) + r * 0.2, this.wz(ship.y));
      ring.material.opacity = 0.45 + 0.4 * Math.abs(Math.sin(this.time * 4));
    } else {
      const ring = this._revealedRings && this._revealedRings.get(ship.id);
      if (ring) ring.visible = false;
    }
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
        const isTorpedo = p.weapon && p.weapon.type === 'torpedo';
        const size = isTorpedo ? 6 : (p.radius || 4);
        const geo = isTorpedo
          ? new THREE.CylinderGeometry(size*0.35, size*0.7, size*3.2, 6)
          : new THREE.SphereGeometry(size, 6, 5);
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color) });
        const mesh = new THREE.Mesh(geo, mat);
        if (isTorpedo) {
          mesh.rotation.x = Math.PI / 2; // lay cylinder flat along local Z
          mesh.userData.isTorpedo = true;
        }
        this.scene.add(mesh);
        this.projMeshes.set(p.id, mesh);
      }
      const mesh = this.projMeshes.get(p.id);
      mesh.position.set(this.wx(p.x), -(p.depth || 0), this.wz(p.y));
      // Orient toward velocity direction
      if (p.vx !== undefined && p.vy !== undefined) {
        // Game coords: vx = sin(angle)*speed, vy = -cos(angle)*speed
        // Three.js XZ plane: travel direction = (vx, -vy) since game Y → Three.js -Z
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
      this.scene.add(mesh);
      this.activeEffects.push({ mesh, timer: 0, duration: effect.duration, maxR: effect.maxRadius, type: 'explosion' });

    } else if (effect.type === 'shockwave') {
      const geo = new THREE.TorusGeometry(1, 3, 8, 32);
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(effect.color), transparent: true, opacity: 0.7 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, ey, z);
      this.scene.add(mesh);
      this.activeEffects.push({ mesh, timer: 0, duration: effect.duration, maxR: effect.maxRadius, type: 'shockwave' });

    } else if (effect.type === 'beam') {
      const ey2   = -(effect.depth2 !== undefined ? effect.depth2 : (effect.depth || 0));
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
      this.scene.add(mesh);
      this.activeEffects.push({ mesh, timer: 0, duration: effect.duration, type: 'beam' });
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
      const geo = new THREE.SphereGeometry(1, 12, 8);
      const mat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.8 });
      this._moveMarkerMesh = new THREE.Mesh(geo, mat);
      this.scene.add(this._moveMarkerMesh);
    }
  }

  // ── Sonar Pings ───────────────────────────────────────────────
  _updateSonarPings(combat, dt) {
    if (!this._sonarRings) this._sonarRings = [];
    const pings = combat.sonarPings || [];

    // Create ring mesh for new pings
    for (const ping of pings) {
      if (!ping._ring3d) {
        const segs = 64;
        const verts = new Float32Array((segs + 1) * 3);
        for (let i = 0; i <= segs; i++) {
          const a = (i / segs) * Math.PI * 2;
          verts[i*3] = Math.sin(a); verts[i*3+1] = 0; verts[i*3+2] = Math.cos(a);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        const mat = new THREE.LineBasicMaterial({
          color: 0x00e5ff, transparent: true, opacity: 0.6, depthWrite: false,
        });
        const ring = new THREE.Line(geo, mat);
        ring.position.set(this.wx(ping.x), -(ping.depth || 0), this.wz(ping.y));
        this.scene.add(ring);
        ping._ring3d = ring;
        this._sonarRings.push({ ring, ping });
      }
      // Update radius and fade
      const progress = ping.radius / ping.maxRadius;
      ping._ring3d.scale.setScalar(ping.radius);
      ping._ring3d.material.opacity = Math.max(0, 0.7 * (1 - progress * 0.8));
    }

    // Remove rings for expired pings
    this._sonarRings = this._sonarRings.filter(({ ring, ping }) => {
      if (!pings.includes(ping)) {
        this.scene.remove(ring);
        return false;
      }
      return true;
    });

    // Decay radar flashes
    if (!this._radarFlashes) this._radarFlashes = [];
    this._radarFlashes = this._radarFlashes.filter(f => {
      f.timer -= dt;
      if (f.mesh) {
        f.mesh.material.opacity = Math.max(0, f.timer / 0.4);
        f.mesh.scale.setScalar(1 + (0.4 - f.timer) * 30);
      }
      if (f.timer <= 0 && f.mesh) { this.scene.remove(f.mesh); return false; }
      return true;
    });
  }

  addRadarReturnFlash(x, y, depth) {
    if (!this._radarFlashes) this._radarFlashes = [];
    const geo = new THREE.SphereGeometry(8, 6, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(this.wx(x), -(depth || 0), this.wz(y));
    this.scene.add(mesh);
    this._radarFlashes.push({ mesh, timer: 0.4 });
  }

  // Expanding red/orange warning ring shown on player ships detected by enemy sonar
  _addSonarDetectionWarning(x, y, depth) {
    if (!this._sonarDetectionWarnings) this._sonarDetectionWarnings = [];
    const DURATION = 1.8;
    const geo = new THREE.RingGeometry(1, 1.35, 48);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff4400, transparent: true, opacity: 1.0,
      side: THREE.DoubleSide, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    // Two rings: fast outer, slower inner
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(geo.clone(), mat.clone());
      m.rotation.x = -Math.PI / 2;
      m.position.set(this.wx(x), -(depth || 0) + 2, this.wz(y));
      this.scene.add(m);
      this._sonarDetectionWarnings.push({ mesh: m, timer: DURATION - i * 0.35, duration: DURATION - i * 0.35, maxRadius: 220 + i * 60 });
    }
  }

  _updateSonarDetectionWarnings(dt) {
    if (!this._sonarDetectionWarnings) return;
    this._sonarDetectionWarnings = this._sonarDetectionWarnings.filter(w => {
      w.timer -= dt;
      if (w.timer <= 0) { this.scene.remove(w.mesh); w.mesh.geometry.dispose(); w.mesh.material.dispose(); return false; }
      const t = 1 - (w.timer / w.duration);
      const r = w.maxRadius * t;
      w.mesh.scale.setScalar(r < 1 ? 1 : r);
      w.mesh.material.opacity = Math.max(0, 1 - t * t) * 0.85;
      return true;
    });
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

  // ── Move Cursor Guides (Homeworld-style preview) ───────────────
  _ensureMoveGuides() {
    if (this._moveGuides) return;

    // Outer cursor ring — follows cursor on click plane
    const ringGeo = new THREE.RingGeometry(18, 22, 48);
    ringGeo.rotateX(-Math.PI / 2);
    this._cursorRing = new THREE.Mesh(ringGeo,
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
    this._cursorRing.visible = false;
    this.scene.add(this._cursorRing);

    // Inner dot
    const dotGeo = new THREE.CircleGeometry(5, 24);
    dotGeo.rotateX(-Math.PI / 2);
    this._cursorDot = new THREE.Mesh(dotGeo,
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide }));
    this._cursorDot.visible = false;
    this.scene.add(this._cursorDot);

    // Depth pole — vertical line from surface to target depth
    const poleGeo = new THREE.BufferGeometry();
    poleGeo.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,1,0], 3));
    this._depthPole = new THREE.Line(poleGeo,
      new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.45, depthWrite: false }));
    this._depthPole.visible = false;
    this.scene.add(this._depthPole);

    // Depth ring at the target depth endpoint of the pole
    const depthRingGeo = new THREE.RingGeometry(10, 14, 32);
    depthRingGeo.rotateX(-Math.PI / 2);
    this._depthRingBottom = new THREE.Mesh(depthRingGeo,
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
    this._depthRingBottom.visible = false;
    this.scene.add(this._depthRingBottom);

    // Ghost marker + line pools (grown lazily)
    this._ghostMarkers = [];
    this._ghostLines   = [];

    this._moveGuides = true;
  }

  _ensureGhostMarkers(count) {
    while (this._ghostMarkers.length < count) {
      const geo = new THREE.SphereGeometry(1, 10, 8);
      const mat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.35, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      this.scene.add(m);
      this._ghostMarkers.push(m);

      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,0,0], 3));
      const lineMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.22, depthWrite: false });
      const line = new THREE.Line(lineGeo, lineMat);
      line.visible = false;
      this.scene.add(line);
      this._ghostLines.push(line);
    }
  }

  _hideMoveGuides() {
    if (!this._moveGuides) return;
    this._cursorRing.visible      = false;
    this._cursorDot.visible       = false;
    this._depthPole.visible       = false;
    this._depthRingBottom.visible = false;
    for (const m of this._ghostMarkers) m.visible = false;
    for (const l of this._ghostLines)   l.visible = false;
  }

  // Called every frame from the game loop with current cursor screen position and drag state.
  // dragInfo: null = hovering, { mode:'depth', depthDelta } = depth-drag,
  //           { mode:'orbit' } = orbit drag, false = box-select/pan (suppress all)
  updateMoveCursor(combat, screenX, screenY, dragInfo) {
    if (!combat) { this._hideMoveGuides(); return; }

    const selected = (combat.selectedShips && combat.selectedShips.length > 0)
      ? combat.selectedShips : (combat.selectedShip ? [combat.selectedShip] : []);
    const toMove = selected.filter(s => !s.isDestroyed);

    // Hide when nothing selected, box-selecting, or orbit-dragging
    if (toMove.length === 0 || dragInfo === false || (dragInfo && dragInfo.mode === 'orbit')) {
      this._hideMoveGuides(); return;
    }

    this._ensureMoveGuides();

    const wp = this.getWorldPosFromScreen(screenX, screenY);
    if (!wp) { this._hideMoveGuides(); return; }

    const wx      = this.wx(wp.worldX);
    const wz      = this.wz(wp.worldY);
    const planeY  = this.clickPlaneY;

    const primary     = combat.selectedShip || toMove[0];
    const depthDelta  = (dragInfo && dragInfo.mode === 'depth') ? dragInfo.depthDelta : 0;
    const targetDepth = Math.max(0, Math.min(WORLD_DEPTH, (primary.targetDepth || 0) + depthDelta));
    const targetY     = -targetDepth;

    // Cursor ring + dot at click plane
    const pulse = 0.88 + 0.12 * Math.sin(this.time * 7);
    this._cursorRing.position.set(wx, planeY, wz);
    this._cursorRing.scale.setScalar(pulse);
    this._cursorRing.material.opacity = 0.55;
    this._cursorRing.visible = true;

    this._cursorDot.position.set(wx, planeY + 0.5, wz);
    this._cursorDot.material.opacity = 0.28;
    this._cursorDot.visible = true;

    // Depth pole only during vertical right-drag
    if (dragInfo && dragInfo.mode === 'depth') {
      const lp = this._depthPole.geometry.attributes.position;
      lp.setXYZ(0, wx, 0, wz);
      lp.setXYZ(1, wx, targetY, wz);
      lp.needsUpdate = true;
      this._depthPole.geometry.computeBoundingSphere();
      this._depthPole.visible = true;

      this._depthRingBottom.position.set(wx, targetY, wz);
      this._depthRingBottom.visible = true;
    } else {
      this._depthPole.visible       = false;
      this._depthRingBottom.visible = false;
    }

    // Ghost destination markers for each ship (formation-aware)
    this._ensureGhostMarkers(toMove.length);

    let gcx = 0, gcy = 0;
    for (const s of toMove) { gcx += s.x; gcy += s.y; }
    gcx /= toMove.length; gcy /= toMove.length;

    for (let i = 0; i < this._ghostMarkers.length; i++) {
      const marker = this._ghostMarkers[i];
      const line   = this._ghostLines[i];
      if (i >= toMove.length) { marker.visible = false; line.visible = false; continue; }

      const s = toMove[i];
      let tx, ty;
      if (s._freeMove) {
        tx = Math.max(300, Math.min(WORLD_W - 300, wp.worldX));
        ty = Math.max(300, Math.min(WORLD_H - 300, wp.worldY));
      } else {
        tx = Math.max(300, Math.min(WORLD_W - 300, wp.worldX + (s.x - gcx)));
        ty = Math.max(300, Math.min(WORLD_H - 300, wp.worldY + (s.y - gcy)));
      }

      const destX = this.wx(tx);
      const destZ = this.wz(ty);

      marker.position.set(destX, targetY, destZ);
      marker.scale.setScalar(12);
      marker.material.opacity = 0.32 + 0.08 * Math.sin(this.time * 4 + i * 1.3);
      marker.visible = true;

      // Line from ship's current 3D position to ghost destination
      const lp = line.geometry.attributes.position;
      lp.setXYZ(0, this.wx(s.x), -(s.depth || 0), this.wz(s.y));
      lp.setXYZ(1, destX, targetY, destZ);
      lp.needsUpdate = true;
      line.geometry.computeBoundingSphere();
      line.visible = true;
    }
  }

  // ── Camera Control ────────────────────────────────────────────
  updateCamera(dt, combat) {
    if (combat) {
      const primary  = combat.selectedShip;
      const selCount = (combat.selectedShips && combat.selectedShips.length > 0)
        ? combat.selectedShips.length
        : (primary ? 1 : 0);

      if (selCount === 1 && primary && !primary.isDestroyed) {
        // ── Follow mode: camera tracks single selected ship ──────────
        this.camMode = 'follow';
        const lr = Math.min(1, 5 * dt);
        this.camTarget.x += (this.wx(primary.x)        - this.camTarget.x) * lr;
        this.camTarget.z += (this.wz(primary.y)        - this.camTarget.z) * lr;
        this.camTarget.y += (-(primary.depth || 0)     - this.camTarget.y) * lr;
        this.clickPlaneY      = -(primary.targetDepth  || 0);
        this.clickPlane.constant = primary.targetDepth || 0;
      } else {
        // ── Free camera mode: no auto-follow ─────────────────────────
        this.camMode = 'free';
        // Keep click plane synced to primary ship's depth for move orders
        if (primary && !primary.isDestroyed) {
          this.clickPlaneY      = -(primary.targetDepth  || 0);
          this.clickPlane.constant = primary.targetDepth || 0;
        }
      }

      // Show selection ring and firing arc under selected ship
      if (this._selRing) {
        const sel = combat.selectedShip;
        if (sel && !sel.isDestroyed) {
          const scale = sel.size * 0.095;
          const pulse = scale * 0.22 * Math.abs(Math.sin(this.time * 4));
          this._selRing.visible = true;
          this._selRing.position.set(this.wx(sel.x), -(sel.depth || 0) - 2, this.wz(sel.y));
          this._selRing.scale.setScalar(scale + pulse);
          this._selRing.material.opacity = 0.75 + 0.25 * Math.abs(Math.sin(this.time * 4));

          // Vertical beacon
          if (this._selBeacon) {
            this._selBeacon.visible = true;
            const beaconH = 150 + 60 * Math.abs(Math.sin(this.time * 2));
            const pos = this._selBeacon.geometry.attributes.position;
            const bx = this.wx(sel.x), by = -(sel.depth || 0), bz = this.wz(sel.y);
            pos.setXYZ(0, bx, by, bz);
            pos.setXYZ(1, bx, by + beaconH, bz);
            pos.needsUpdate = true;
            this._selBeacon.material.opacity = 0.35 + 0.3 * Math.abs(Math.sin(this.time * 2));
          }

          // Per-slot firing arc fans
          if (sel !== this._lastSlotArcShip) this._updateSlotArcs(sel);
          if (this._slotArcGroups.length > 0) {
            const ca = Math.cos(sel.angle), sa = Math.sin(sel.angle);
            for (const { group, fan, slot } of this._slotArcGroups) {
              const wx2d = sel.x + slot.pos.x * ca + slot.pos.y * sa;
              const wy2d = sel.y + slot.pos.x * sa - slot.pos.y * ca;
              group.position.set(this.wx(wx2d), -(sel.depth || 0) - 1, this.wz(wy2d));
              group.rotation.y = -(sel.angle + slot.facing);
              fan.material.opacity = 0.09;
            }
          }
        } else {
          this._selRing.visible = false;
          if (this._selBeacon) this._selBeacon.visible = false;
          this._clearSlotArcs();
        }
      }

      // Secondary selection rings for multi-selected ships
      if (!this._selRingsSecondary) this._selRingsSecondary = [];
      const secondaryShips = (combat.selectedShips || []).filter(s => s !== combat.selectedShip && !s.isDestroyed);
      // Ensure we have enough ring meshes
      while (this._selRingsSecondary.length < secondaryShips.length) {
        const geo = new THREE.TorusGeometry(1, 1.5, 8, 24);
        const mat = new THREE.MeshBasicMaterial({ color: 0x29b6f6, transparent: true, opacity: 0.55 });
        const ring = new THREE.Mesh(geo, mat);
        ring.rotation.x = Math.PI / 2;
        this.scene.add(ring);
        this._selRingsSecondary.push(ring);
      }
      for (let i = 0; i < this._selRingsSecondary.length; i++) {
        const ring = this._selRingsSecondary[i];
        if (i < secondaryShips.length) {
          const s = secondaryShips[i];
          ring.visible = true;
          const sc = s.size * 0.085;
          ring.scale.setScalar(sc);
          ring.position.set(this.wx(s.x), -(s.depth || 0) - 2, this.wz(s.y));
        } else {
          ring.visible = false;
        }
      }
    }
    // Tactical view camera lerp
    if (this._tacViewActive) {
      const lr = Math.min(1, 2.8 * dt);
      // Lerp dist toward player-adjustable zoom target; lerp elevation to fixed overhead angle
      this.camDist      += ((this._tacZoomTarget || 8500) - this.camDist)      * lr;
      this.camElevation += (Math.PI * 0.32               - this.camElevation) * lr;  // ~58° overhead
    } else if (this._tacExiting && this._tacSavedDist !== undefined) {
      const lr = Math.min(1, 9.0 * dt);  // fast snap back
      this.camDist      += (this._tacSavedDist - this.camDist)      * lr;
      this.camElevation += (this._tacSavedElev - this.camElevation) * lr;
      if (Math.abs(this.camDist - this._tacSavedDist) < 5) {
        this.camDist      = this._tacSavedDist;
        this.camElevation = this._tacSavedElev;
        this._tacExiting  = false;
      }
    }

    this._applyCameraPosition();
    this.camera.lookAt(this.camTarget);
  }

  _applyCameraPosition() {
    const hDist = Math.cos(this.camElevation) * this.camDist;
    const vDist = Math.sin(this.camElevation) * this.camDist;
    this.camera.position.set(
      this.camTarget.x + Math.sin(this.camAzimuth) * hDist,
      this.camTarget.y + vDist,
      this.camTarget.z + Math.cos(this.camAzimuth) * hDist
    );
  }

  panCamera(dx, dy) {
    const camH = Math.sin(this.camElevation) * this.camDist;
    const pan = 1.5 / (camH / 900);
    // Pan relative to camera azimuth so WASD feels correct after orbit
    const rightX =  Math.cos(this.camAzimuth);
    const rightZ = -Math.sin(this.camAzimuth);
    const fwdX   = -Math.sin(this.camAzimuth);
    const fwdZ   = -Math.cos(this.camAzimuth);
    this.camTarget.x += (dx * rightX + dy * fwdX) * pan;
    this.camTarget.z += (dx * rightZ + dy * fwdZ) * pan;
  }

  orbitCamera(dAngle) {
    this.camAzimuth += dAngle;
  }

  zoomCamera(delta) {
    if (this._tacViewActive) {
      // Tac zoom: 3500 min (can't get as close as normal view) to 12000 max
      this._tacZoomTarget = Math.max(3500, Math.min(12000, (this._tacZoomTarget || 8500) + delta * 3.0));
    } else {
      this.camDist = Math.max(100, Math.min(2800, this.camDist + delta * 0.8));
    }
  }

  tiltCamera(dAngle) {
    if (this._tacViewActive) return; // lock tilt while in tac view
    // Clamp: ~10° (nearly side-on) to ~85° (nearly top-down)
    this.camElevation = Math.max(0.18, Math.min(Math.PI * 0.47, this.camElevation + dAngle));
  }

  // ── Tactical View ─────────────────────────────────────────────
  _setOceanVisualsVisible(visible) {
    if (this._skyMesh)       this._skyMesh.visible = visible;
    if (this.surfaceMesh)    this.surfaceMesh.visible = visible;
    if (this._causticsMesh)  this._causticsMesh.visible = visible;
    if (this._sandRidgesMesh)this._sandRidgesMesh.visible = visible;
    if (this._seaGrassMesh)  this._seaGrassMesh.visible = visible;
    if (this._rockMesh)      this._rockMesh.visible = visible;
    if (this.biolumPoints)   this.biolumPoints.visible = visible;
    if (this._snowPoints)    this._snowPoints.visible = visible;
    if (this._streakLines)   this._streakLines.visible = visible;
    for (const m of (this._atmosMeshes || []))        m.visible = visible;
    for (const m of (this._jellyMeshes || []))        m.visible = visible;
    for (const { mesh, spot } of (this.lightShafts || [])) {
      if (mesh) mesh.visible = visible;
      if (spot) spot.visible = visible;
    }
    for (const bl of (this.biolumLights || [])) {
      if (!bl.userData.isVent) bl.visible = visible;
    }
    for (const w of (this._barrierWalls || [])) {
      if (w.mesh) w.mesh.visible = visible;
    }
    // Tac mode: disable fog (camera is too far for normal density) and set solid bg
    if (!visible) {
      this._savedFog = this.scene.fog;
      this.scene.fog = null;
      this.scene.background = new THREE.Color(0x000508);
    } else {
      this.scene.fog = this._savedFog || this.scene.fog;
      this.scene.background = null;
    }
  }

  toggleTacticalView() {
    this._tacViewActive = !this._tacViewActive;
    if (this._tacViewActive) {
      this._tacSavedDist = this.camDist;
      this._tacSavedElev = this.camElevation;
      this._tacExiting   = false;
      this._tacZoomTarget = 8500;   // start zoomed out; player can zoom in from here
      this._setOceanVisualsVisible(false);
    } else {
      this._tacExiting = true;
      this._setOceanVisualsVisible(true);
    }
    const ind = document.getElementById('tac-view-indicator');
    if (ind) ind.style.display = this._tacViewActive ? 'flex' : 'none';
  }

  _updateTacViewMarkers(allShips) {
    if (!this._tacMarkers) this._tacMarkers = new Map();
    // Remove dead
    for (const [id, m] of this._tacMarkers) {
      const ship = allShips.find(s => s.id === id);
      if (!ship || (ship.isDestroyed && ship.destroyTimer <= 0)) {
        this.scene.remove(m.disc);
        this.scene.remove(m.arrow);
        this._tacMarkers.delete(id);
      }
    }
    const show = this._tacViewActive || this._tacExiting;
    for (const ship of allShips) {
      if (ship.isDestroyed && ship.destroyTimer <= 0) continue;
      // Don't reveal undetected enemies in tac view
      if (!ship.isPlayer && ship.detectionLevel === 0) {
        const m = this._tacMarkers.get(ship.id);
        if (m) { m.disc.visible = false; m.arrow.visible = false; }
        continue;
      }
      if (!this._tacMarkers.has(ship.id)) {
        // Disc scaled to ship size
        const r       = ship.size * 5.5;
        const col     = ship.isPlayer ? 0x00aaff : 0xdd2200;
        const discGeo = new THREE.CylinderGeometry(r, r, 10, 20);
        const discMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.70, depthWrite: false });
        const disc    = new THREE.Mesh(discGeo, discMat);
        disc.renderOrder = 5;
        this.scene.add(disc);
        // Direction arrow — size also proportional
        const ar      = ship.size * 2.8;
        const ah      = ship.size * 8.5;
        const arrowGeo = new THREE.ConeGeometry(ar, ah, 5);
        const arrowMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.90, depthWrite: false });
        const arrow    = new THREE.Mesh(arrowGeo, arrowMat);
        arrow.renderOrder = 6;
        this.scene.add(arrow);
        this._tacMarkers.set(ship.id, { disc, arrow, col, r });
      }
      const { disc, arrow, r } = this._tacMarkers.get(ship.id);
      disc.visible  = show && !ship.isDestroyed;
      arrow.visible = show && !ship.isDestroyed;
      if (!disc.visible) continue;

      const wx = this.wx(ship.x), wy = -(ship.depth || 0), wz = this.wz(ship.y);
      disc.position.set(wx, wy + 6, wz);
      // Forward direction in Three.js space: (sin(angle), 0, -cos(angle))
      const fwdX = Math.sin(ship.angle), fwdZ = -Math.cos(ship.angle);
      const arrowOffset = r + ship.size * 3;
      arrow.position.set(wx + fwdX * arrowOffset, wy + 8, wz + fwdZ * arrowOffset);
      // Quaternion: rotate cone's Y-axis (default apex) to point in ship's heading
      if (!this._tacArrUp)  this._tacArrUp  = new THREE.Vector3(0, 1, 0);
      if (!this._tacArrFwd) this._tacArrFwd = new THREE.Vector3();
      this._tacArrFwd.set(fwdX, 0, fwdZ);
      arrow.quaternion.setFromUnitVectors(this._tacArrUp, this._tacArrFwd);
      // Color by hull health / detection level
      const hp = ship.maxHull > 0 ? ship.hull / ship.maxHull : 0;
      if (!ship.isPlayer && ship.detectionLevel === 1) {
        // Fuzzy contact — dim orange disc, no arrow
        disc.material.color.setHex(0xff8800);
        disc.material.opacity = 0.45 + 0.15 * Math.abs(Math.sin(this.time * 2.5));
        arrow.visible = false;
      } else if (ship.isPlayer) {
        disc.material.color.setHex(hp > 0.55 ? 0x00ccff : hp > 0.25 ? 0xffaa00 : 0xff2200);
        arrow.material.color.setHex(disc.material.color.getHex());
        // Crippled pulse
        if (ship.isCrippled) {
          const pulse = 0.4 + 0.5 * Math.abs(Math.sin(this.time * 4));
          disc.material.opacity  = pulse * 0.85;
          arrow.material.opacity = pulse * 0.90;
        } else {
          disc.material.opacity  = 0.70;
          arrow.material.opacity = 0.90;
        }
      } else {
        disc.material.opacity  = 0.70;
        arrow.material.opacity = 0.90;
      }
    }
  }

  _updateTacViewLabels(allShips) {
    if (!this._tacLabelContainer) {
      const div = document.createElement('div');
      div.id = 'tac-labels';
      div.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:50;';
      document.body.appendChild(div);
      this._tacLabelContainer = div;
      this._tacLabelEls = new Map();
    }
    const show = this._tacViewActive;
    // Remove stale labels
    for (const [id, el] of this._tacLabelEls) {
      const ship = allShips.find(s => s.id === id);
      if (!ship || (ship.isDestroyed && ship.destroyTimer <= 0)) {
        el.remove();
        this._tacLabelEls.delete(id);
      }
    }
    if (!show) {
      for (const el of this._tacLabelEls.values()) el.style.display = 'none';
      return;
    }
    for (const ship of allShips) {
      if (ship.isDestroyed) continue;
      // Hide labels for undetected enemies
      if (!ship.isPlayer && ship.detectionLevel === 0) {
        const el = this._tacLabelEls && this._tacLabelEls.get(ship.id);
        if (el) el.style.display = 'none';
        continue;
      }
      if (!this._tacLabelEls.has(ship.id)) {
        const el = document.createElement('div');
        el.style.cssText = [
          'position:absolute',
          'background:rgba(0,0,0,0.65)',
          'border:1px solid rgba(255,255,255,0.25)',
          'border-radius:3px',
          'padding:2px 6px',
          'font:bold 11px/14px monospace',
          'text-align:center',
          'white-space:nowrap',
          'transform:translate(-50%,-130%)',
          'pointer-events:none',
        ].join(';');
        el.style.color = ship.isPlayer ? '#7df' : '#f77';
        this._tacLabelContainer.appendChild(el);
        this._tacLabelEls.set(ship.id, el);
      }
      const el = this._tacLabelEls.get(ship.id);
      el.style.display = 'block';
      if (!ship.isPlayer && ship.detectionLevel === 1) {
        el.innerHTML = '<span style="color:#ff8800;font-size:10px">CONTACT</span>';
      } else {
        const hp  = Math.max(0, Math.round((ship.hull / ship.maxHull) * 100));
        const hpCol = hp > 55 ? '#7df' : hp > 25 ? '#ffa' : '#f77';
        const crip = ship.isCrippled ? '<span style="color:#f80"> ⚠ CRIPPLED</span>' : '';
        const cls = ship.shipClass ? `<br><span style="color:#888;font-size:9px">${ship.shipClass}</span>` : '';
        el.innerHTML = `<span style="color:#fff">${ship.name}</span>${crip}<br><span style="color:${hpCol};font-size:10px">HP ${hp}%</span>${cls}`;
      }
      const sc = this.worldToScreen(ship.x, ship.depth || 0, ship.y);
      if (sc) {
        el.style.left = sc.x + 'px';
        el.style.top  = sc.y + 'px';
        el.style.display = 'block';
      } else {
        el.style.display = 'none';
      }
    }
  }

  // ── Tactical View Overlays (comms / orders / attack lines) ────
  _updateTacViewOverlays(allShips) {
    // Create line buffers on first call
    if (!this._tacCommsLines) {
      const MAX = 1800; // max floats = 300 segments × 2 points × 3 floats
      const mk = (col, opacity) => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX), 3));
        geo.setDrawRange(0, 0);
        const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
          color: col, transparent: true, opacity, depthTest: false, depthWrite: false,
        }));
        line.renderOrder = 7;
        this.scene.add(line);
        return line;
      };
      this._tacCommsLines  = mk(0x005555, 0.30);  // faint teal comms network
      this._tacMoveLines   = mk(0x00aaff, 0.80);  // blue move orders
      this._tacAttackLines = mk(0xff4400, 0.85);  // orange attack orders
    }

    const show = this._tacViewActive;
    this._tacCommsLines.visible  = show;
    this._tacMoveLines.visible   = show;
    this._tacAttackLines.visible = show;
    if (!show) return;

    const Y = 20; // height above disc level
    const commsPts = [], movePts = [], attackPts = [];

    // ── Comms network: player ships in range of each other
    const alive = allShips.filter(s => s.isPlayer && !s.isDestroyed);
    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i], b = alive[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        if (dx*dx + dy*dy < COMMS_RANGE * COMMS_RANGE) {
          commsPts.push(this.wx(a.x), -(a.depth||0)+Y, this.wz(a.y));
          commsPts.push(this.wx(b.x), -(b.depth||0)+Y, this.wz(b.y));
        }
      }
    }

    // ── Move orders: dashed line from ship to move target
    for (const ship of alive) {
      if (!ship.moveTarget || ship.atTarget) continue;
      const x1 = this.wx(ship.x), y1 = -(ship.depth||0)+Y, z1 = this.wz(ship.y);
      const x2 = this.wx(ship.moveTarget.x), y2 = -(ship.targetDepth||0)+Y, z2 = this.wz(ship.moveTarget.y);
      const len = Math.sqrt((x2-x1)**2+(y2-y1)**2+(z2-z1)**2);
      if (len < 1) continue;
      const nx=(x2-x1)/len, ny=(y2-y1)/len, nz=(z2-z1)/len;
      const dash=160, gap=80, step=dash+gap;
      for (let d = 0; d < len; d += step) {
        const e = Math.min(d + dash, len);
        movePts.push(x1+nx*d, y1+ny*d, z1+nz*d, x1+nx*e, y1+ny*e, z1+nz*e);
      }
    }

    // ── Attack orders: line from attacker to target
    for (const ship of allShips) {
      if (ship.isDestroyed || !ship.attackTarget || ship.attackTarget.isDestroyed) continue;
      const tgt = ship.attackTarget;
      // Don't reveal undetected enemies
      if (!ship.isPlayer && tgt.detectionLevel === 0) continue;
      attackPts.push(this.wx(ship.x), -(ship.depth||0)+Y, this.wz(ship.y));
      attackPts.push(this.wx(tgt.x), -(tgt.depth||0)+Y, this.wz(tgt.y));
    }

    // Update geometry draw ranges
    const flush = (line, pts) => {
      const buf = line.geometry.attributes.position;
      const cap = buf.array.length;
      const cnt = Math.min(pts.length, cap);
      for (let i = 0; i < cnt; i++) buf.array[i] = pts[i];
      buf.needsUpdate = true;
      line.geometry.setDrawRange(0, cnt / 3);
    };
    flush(this._tacCommsLines,  commsPts);
    flush(this._tacMoveLines,   movePts);
    flush(this._tacAttackLines, attackPts);
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
      const sphere = new THREE.Sphere(shipPos, ship.size * 5.0);
      if (this.raycaster.ray.intersectsSphere(sphere)) {
        const d = this.raycaster.ray.origin.distanceTo(shipPos);
        if (d < closestDist) { closestDist = d; closest = ship; }
      }
    }
    return closest;
  }

  // Project a world position to screen coordinates (returns null if behind camera)
  worldToScreen(worldX, depthY, worldY) {
    const pos = new THREE.Vector3(this.wx(worldX), -(depthY || 0), this.wz(worldY));
    pos.project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    if (pos.z > 1) return null; // behind camera
    return {
      x: (pos.x * 0.5 + 0.5) * rect.width  + rect.left,
      y: (pos.y * -0.5 + 0.5) * rect.height + rect.top,
    };
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
    this._dt = dt;
    this._combat = combat; // stash so updateShipMesh can read selection

    // Apply biome-specific visual theme on first frame or when biome changes
    if (combat.biome && combat.biome !== this._currentBiome) {
      this._currentBiome = combat.biome;
      this._applyBiomeTheme(combat.biome);
    }

    // Underwater environment — throttle CPU-heavy vertex animation to every 3rd frame
    this._envFrame = ((this._envFrame || 0) + 1) % 3;
    this._updateDepthAtmosphere();
    this._updateWaterSurface(dt);   // updates shader uniforms every frame; CPU vertices every 3rd
    this._updateWorldBorder();
    this._updateBiolum(dt);
    if (this._envFrame === 0) {
      this._updateLightShafts();
      this._updateOcean(dt);
    }
    this._updateCaustics();
    this._updateSandRidges();
    this._updateSeaGrass(dt);

    // Biolum light drift
    for (const bl of this.biolumLights) {
      const ph = bl.userData.phase;
      const r  = bl.userData.orbitR;
      bl.position.x += Math.sin(this.time * 0.2 + ph) * r * dt * 0.5;
      bl.position.z += Math.cos(this.time * 0.15 + ph) * r * dt * 0.5;
      if (!bl.userData.isVent) {
        bl.intensity = 0.5 + 0.4 * Math.abs(Math.sin(this.time * 0.9 + ph));
      }
    }

    // Camera
    this.updateCamera(dt, combat);

    // Ships
    const allShips = [...combat.playerShips, ...combat.enemyShips];
    for (const s of allShips) this.updateShipMesh(s);

    // Tactical view markers + labels + overlays
    this._updateTacViewMarkers(allShips);
    this._updateTacViewLabels(allShips);
    this._updateTacViewOverlays(allShips);

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

    // Sonar pings (expanding rings + contact flashes)
    this._updateSonarPings(combat, dt);

    // Radar return flashes from new ping contacts
    if (combat.pendingRadarFlashes) {
      for (const f of combat.pendingRadarFlashes) {
        this.addRadarReturnFlash(f.rx, f.ry, f.depth);
      }
    }

    // Player ships detected by enemy sonar — warning rings
    if (combat.pendingPlayerSonarHits) {
      for (const f of combat.pendingPlayerSonarHits) {
        this._addSonarDetectionWarning(f.x, f.y, f.depth);
      }
    }
    this._updateSonarDetectionWarnings(dt);

    // Last-known position ghost markers for lost contacts
    this._updateLastKnownMarkers(combat, dt);

    // Active sonar pulse flash
    this._updateActiveSonarFlash(combat, dt);

    // Heading arrows + move path lines for selected ships
    this._updateShipOverlays(combat);

    // Attack target lines (player ships → their targets)
    this._updateTargetLines(combat);

    // Render
    this.renderer.render(this.scene, this.camera);
  }

  // ── Last-Known Position Ghost Markers ─────────────────────────
  // Shows a fading diamond marker where an enemy was last seen.
  _updateLastKnownMarkers(combat, dt) {
    if (!this._lkMarkers) this._lkMarkers = new Map();

    for (const enemy of combat.enemyShips) {
      const hasLK = enemy._lastKnownX !== null && enemy._lastKnownTimer > 0;
      const isLost = enemy.detectionLevel === 0;

      if (hasLK && isLost) {
        // Create marker if needed
        if (!this._lkMarkers.has(enemy.id)) {
          const geo = new THREE.RingGeometry(12, 19, 4);  // diamond shape (4-sided ring)
          const mat = new THREE.MeshBasicMaterial({
            color: 0xffaa33, transparent: true, opacity: 0.5,
            depthWrite: false, side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.rotation.x = -Math.PI / 2;
          mesh.rotation.z = Math.PI / 4;  // rotate diamond 45°
          this.scene.add(mesh);
          this._lkMarkers.set(enemy.id, mesh);
        }
        const marker = this._lkMarkers.get(enemy.id);
        marker.position.set(
          this.wx(enemy._lastKnownX),
          -(enemy._lastKnownDepth || 0) + 4,
          this.wz(enemy._lastKnownY)
        );
        // Fade as timer approaches 0; slow pulse to indicate uncertainty
        const fade = Math.min(1, enemy._lastKnownTimer / 4);
        const pulse = 0.85 + 0.15 * Math.sin(this.time * 1.8);
        marker.material.opacity = fade * 0.5 * pulse;
        marker.visible = true;
      } else {
        const marker = this._lkMarkers.get(enemy.id);
        if (marker) marker.visible = false;
      }
    }
  }

  // ── Active Sonar Flash ─────────────────────────────────────────
  // Brief expanding sphere at the ping source when PING is used.
  _updateActiveSonarFlash(combat, dt) {
    if (!this._activeSonarFlashes) this._activeSonarFlashes = [];

    // Spawn a flash when engine fires activeSonarEvent
    if (combat.activeSonarEvent && !combat.activeSonarEvent._rendered) {
      combat.activeSonarEvent._rendered = true;
      const ev = combat.activeSonarEvent;
      const geo = new THREE.SphereGeometry(ACTIVE_SONAR_RANGE * 0.01, 12, 8);
      const mat = new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.3, wireframe: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(this.wx(ev.x), -(ev.depth || 0), this.wz(ev.y));
      this.scene.add(mesh);
      this._activeSonarFlashes.push({ mesh, timer: 0, dur: 0.55, maxR: ACTIVE_SONAR_RANGE });
    }

    // Animate flashes
    for (let i = this._activeSonarFlashes.length - 1; i >= 0; i--) {
      const f = this._activeSonarFlashes[i];
      f.timer += dt;
      if (f.timer >= f.dur) {
        this.scene.remove(f.mesh);
        this._activeSonarFlashes.splice(i, 1);
        continue;
      }
      const pct = f.timer / f.dur;
      f.mesh.scale.setScalar(10 + pct * f.maxR * 0.009);
      f.mesh.material.opacity = (1 - pct) * 0.25;
    }
  }

  // ── Background-only render (for menus) ────────────────────────
  renderBackground(dt) {
    this.time += dt;
    this._updateDepthAtmosphere();
    this._updateWaterSurface(dt);
    this._updateWorldBorder();
    this._updateBiolum(dt);
    this._updateLightShafts();
    this._updateCaustics();
    this._updateSandRidges();
    this._updateSeaGrass(dt);
    for (const bl of this.biolumLights) {
      const ph = bl.userData.phase;
      bl.intensity = 0.3 + 0.2 * Math.sin(this.time * 0.9 + ph);
    }
    const lookAt = new THREE.Vector3(0, 0, 0);
    this._applyCameraPosition();
    this.camera.lookAt(lookAt);
    this.renderer.render(this.scene, this.camera);
  }

  // ── Ship Selection Overlays ────────────────────────────────────
  // Per-ship: heading arrow, move path line, range ring, velocity vector
  _updateShipOverlays(combat) {
    if (!this._shipOverlays) this._shipOverlays = new Map();

    const allPlayer = combat.playerShips.filter(s => !s.isDestroyed);
    const sel = combat.selectedShip;
    const selGroup = (combat.selectedShips || []).filter(s => !s.isDestroyed);
    const highlighted = new Set(selGroup.map(s => s.id));
    if (sel && !sel.isDestroyed) highlighted.add(sel.id);

    for (const ship of allPlayer) {
      const isHighlighted = highlighted.has(ship.id);
      const isPrimary = ship === sel;

      if (!this._shipOverlays.has(ship.id)) {
        const grp = new THREE.Group();
        // Heading arrow (two lines forming a chevron)
        const arrowPts = new THREE.Float32BufferAttribute(Float32Array.from([
          0, 0, 0,  0, 0, -ship.size * 2.5,          // forward shaft
          -ship.size * 0.7, 0, -ship.size * 1.5,    // left wing tip
          0, 0, -ship.size * 2.5,                   // tip
          ship.size * 0.7, 0, -ship.size * 1.5,     // right wing tip
          0, 0, -ship.size * 2.5,                   // tip again
        ]), 3);
        const arrowGeo = new THREE.BufferGeometry();
        arrowGeo.setAttribute('position', arrowPts);
        const arrowMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.7, depthWrite: false, depthTest: false });
        const arrowLine = new THREE.LineSegments(arrowGeo, arrowMat);
        arrowLine.userData.type = 'arrow';
        grp.add(arrowLine);
        grp.userData._arrow = arrowLine;

        // Move path line (2 points, updated each frame)
        const pathGeo = new THREE.BufferGeometry();
        pathGeo.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,0,0], 3));
        const pathMat = new THREE.LineDashedMaterial({ color: 0x00e5ff, dashSize: 28, gapSize: 18, transparent: true, opacity: 0.65, depthWrite: false, depthTest: false });
        const pathLine = new THREE.Line(pathGeo, pathMat);
        pathLine.userData.type = 'path';
        grp.add(pathLine);
        grp.userData._path = pathLine;

        // Destination marker — small diamond at move target
        const destGeo = new THREE.BufferGeometry();
        destGeo.setAttribute('position', new THREE.Float32BufferAttribute([
          0, 8, 0,   8, 0, 0,   0, -8, 0,  -8, 0, 0,  0, 8, 0,
        ], 3));
        const destMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.8, depthWrite: false, depthTest: false });
        const destMarker = new THREE.Line(destGeo, destMat);
        destMarker.userData.type = 'dest_marker';
        grp.add(destMarker);
        grp.userData._dest = destMarker;

        // Weapon range ring (flat circle in XZ plane)
        const rangeRingGeo = new THREE.BufferGeometry();
        const rangeSegs = 48;
        const rangeVerts = new Float32Array((rangeSegs + 1) * 3);
        for (let i = 0; i <= rangeSegs; i++) {
          const a = (i / rangeSegs) * Math.PI * 2;
          rangeVerts[i * 3]     = Math.sin(a);
          rangeVerts[i * 3 + 1] = 0;
          rangeVerts[i * 3 + 2] = Math.cos(a);
        }
        rangeRingGeo.setAttribute('position', new THREE.Float32BufferAttribute(rangeVerts, 3));
        const rangeRingMat = new THREE.LineBasicMaterial({ color: 0xffa726, transparent: true, opacity: 0.5, depthWrite: false, depthTest: false });
        const rangeRing = new THREE.Line(rangeRingGeo, rangeRingMat);
        rangeRing.userData.type = 'range';
        grp.add(rangeRing);
        grp.userData._range = rangeRing;

        // Sonar range ring (cyan, radius = ACTIVE_SONAR_RANGE)
        const sonarRingGeo = new THREE.BufferGeometry();
        const sonarVerts = new Float32Array((rangeSegs + 1) * 3);
        for (let i = 0; i <= rangeSegs; i++) {
          const a = (i / rangeSegs) * Math.PI * 2;
          sonarVerts[i * 3]     = Math.sin(a);
          sonarVerts[i * 3 + 1] = 0;
          sonarVerts[i * 3 + 2] = Math.cos(a);
        }
        sonarRingGeo.setAttribute('position', new THREE.Float32BufferAttribute(sonarVerts, 3));
        const sonarRingMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.45, depthWrite: false, depthTest: false });
        const sonarRing = new THREE.Line(sonarRingGeo, sonarRingMat);
        sonarRing.userData.type = 'sonar_range';
        grp.userData._sonar = sonarRing;
        sonarRing.scale.setScalar(ACTIVE_SONAR_RANGE);
        sonarRing.visible = false;
        grp.add(sonarRing);

        // Visual range ring (green, radius = VISUAL_RANGE)
        const visualRingGeo = new THREE.BufferGeometry();
        const visualVerts = new Float32Array((rangeSegs + 1) * 3);
        for (let i = 0; i <= rangeSegs; i++) {
          const a = (i / rangeSegs) * Math.PI * 2;
          visualVerts[i * 3]     = Math.sin(a);
          visualVerts[i * 3 + 1] = 0;
          visualVerts[i * 3 + 2] = Math.cos(a);
        }
        visualRingGeo.setAttribute('position', new THREE.Float32BufferAttribute(visualVerts, 3));
        const visualRingMat = new THREE.LineBasicMaterial({ color: 0x4caf50, transparent: true, opacity: 0.5, depthWrite: false, depthTest: false });
        const visualRing = new THREE.Line(visualRingGeo, visualRingMat);
        visualRing.userData.type = 'visual_range';
        visualRing.scale.setScalar(VISUAL_RANGE);
        visualRing.visible = false;
        grp.add(visualRing);
        grp.userData._visual = visualRing;

        this.scene.add(grp);
        this._shipOverlays.set(ship.id, grp);
      }

      const grp = this._shipOverlays.get(ship.id);
      const sx = this.wx(ship.x), sy = -(ship.depth || 0), sz = this.wz(ship.y);
      grp.position.set(sx, sy, sz);
      grp.rotation.y = -ship.angle;

      // Arrow: show for highlighted ships only
      const arrowLine = grp.userData._arrow;
      if (arrowLine) {
        arrowLine.visible = isHighlighted;
        arrowLine.material.color.setHex(isPrimary ? 0x00e5ff : 0x29b6f6);
        arrowLine.material.opacity = isPrimary ? 0.8 : 0.5;
      }

      // Path line: show when ship has a move order
      const pathLine = grp.userData._path;
      if (pathLine) {
        const hasMoveOrder = !ship.atTarget && ship.moveTargetX !== null;
        pathLine.visible = hasMoveOrder && isHighlighted;
        if (hasMoveOrder) {
          const pos = pathLine.geometry.attributes.position;
          const dx = this.wx(ship.moveTargetX) - sx;
          const dy = -(ship.targetDepth || 0) - sy;
          const dz = this.wz(ship.moveTargetY) - sz;
          // Inverse of group rotation.y = -ship.angle → rotate world delta by +ship.angle
          const ca = Math.cos(ship.angle), sa = Math.sin(ship.angle);
          const lx =  dx * ca + dz * sa;
          const lz = -dx * sa + dz * ca;
          pos.setXYZ(0, 0, 0, 0);
          pos.setXYZ(1, lx, dy, lz);
          pos.needsUpdate = true;
          pathLine.computeLineDistances();
        }
      }

      // Range ring: show for primary selected ship only when weapon-range overlay is active
      const rangeRing = grp.userData._range;
      if (rangeRing) {
        rangeRing.visible = isPrimary && !!this._ovr_weapon_range;
        if (isPrimary && ship.weapons.length > 0) {
          const maxRange = Math.max(...ship.weapons.map(w => w.range || 0));
          rangeRing.scale.setScalar(maxRange);
          rangeRing.position.set(0, 1, 0);
          const tgt = ship.attackTarget && !ship.attackTarget.isDestroyed ? ship.attackTarget : null;
          if (tgt) {
            const dxy = Math.hypot(ship.x - tgt.x, ship.y - tgt.y);
            const dz  = Math.abs(ship.depth - tgt.depth);
            const canReach = ship.weapons.some(w => w.type !== 'ew' && dxy <= w.range && dz <= 450);
            if (canReach) {
              rangeRing.material.color.setHex(0xff4444);
              rangeRing.material.opacity = 0.75;
            } else if (ship._autoApproaching) {
              rangeRing.material.color.setHex(0x29b6f6);
              rangeRing.material.opacity = 0.55;
            } else {
              rangeRing.material.color.setHex(0xffa726);
              rangeRing.material.opacity = 0.50;
            }
          } else {
            rangeRing.material.color.setHex(0xffa726);
            rangeRing.material.opacity = 0.45;
          }
        }
      }

      // Sonar / visual range rings
      const sonarRing = grp.userData._sonar;
      if (sonarRing) {
        sonarRing.visible = isHighlighted && !!this._ovr_sonar;
        if (sonarRing.visible) sonarRing.material.opacity = 0.35 + 0.15 * Math.abs(Math.sin(this.time * 1.5));
      }

      const visualRing = grp.userData._visual;
      if (visualRing) {
        visualRing.visible = isHighlighted && !!this._ovr_visual;
        if (visualRing.visible) visualRing.material.opacity = 0.4 + 0.15 * Math.abs(Math.sin(this.time * 1.2));
      }
    }

    // Hide overlays for destroyed ships or those not in player fleet
    const activeIds = new Set(allPlayer.map(s => s.id));
    for (const [id, grp] of this._shipOverlays) {
      if (!activeIds.has(id)) {
        grp.visible = false;
      }
    }

    // ── Comms link lines between ships within datalink range ────────
    if (!this._commsLines) this._commsLines = [];
    // Remove old lines
    for (const l of this._commsLines) this.scene.remove(l);
    this._commsLines = [];

    const commsMat = new THREE.LineBasicMaterial({
      color: 0x00ff88, transparent: true, opacity: 0.12, depthWrite: false,
    });
    const drawnPairs = new Set();
    for (const a of allPlayer) {
      for (const b of allPlayer) {
        if (a.id >= b.id) continue;
        const pairKey = `${Math.min(a.id,b.id)}_${Math.max(a.id,b.id)}`;
        if (drawnPairs.has(pairKey)) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > COMMS_RANGE) continue; // out of range — no link
        drawnPairs.add(pairKey);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([
          this.wx(a.x), -(a.depth||0), this.wz(a.y),
          this.wx(b.x), -(b.depth||0), this.wz(b.y),
        ], 3));
        const line = new THREE.Line(geo, commsMat);
        this.scene.add(line);
        this._commsLines.push(line);
      }
    }
  }

  // ── Attack Target Lines ────────────────────────────────────────
  // Draws a thin dashed line from each player ship to its attack target.
  _updateTargetLines(combat) {
    if (!this._targetLines) this._targetLines = new Map();

    const wanted = new Set();
    for (const ps of combat.playerShips) {
      if (ps.isDestroyed || !ps.attackTarget || ps.attackTarget.isDestroyed) continue;
      const tgt = ps.attackTarget;
      if (tgt.detectionLevel === 0) continue; // can't see it — no line
      wanted.add(ps.id);

      const sx = this.wx(ps.x),  sz = this.wz(ps.y),  sy = -(ps.depth || 0);
      const ex = this.wx(tgt.x), ez = this.wz(tgt.y), ey = -(tgt.depth || 0);

      // Color target line: red = in range, blue = approaching, grey = out of range
      const dxy = Math.hypot(ps.x - tgt.x, ps.y - tgt.y);
      const dz  = Math.abs(ps.depth - tgt.depth);
      const canReach = ps.weapons.some(w => w.type !== 'ew' && dxy <= w.range && dz <= 450);
      const lineColor = canReach ? 0xff2222 : (ps._autoApproaching ? 0x29b6f6 : 0x667788);
      const lineOpacity = canReach ? 0.7 : 0.35;

      if (!this._targetLines.has(ps.id)) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([sx,sy,sz, ex,ey,ez], 3));
        const mat = new THREE.LineBasicMaterial({
          color: lineColor, transparent: true, opacity: lineOpacity, depthWrite: false,
        });
        const line = new THREE.Line(geo, mat);
        this.scene.add(line);
        this._targetLines.set(ps.id, line);
      } else {
        const line = this._targetLines.get(ps.id);
        const pos = line.geometry.attributes.position;
        pos.setXYZ(0, sx, sy, sz);
        pos.setXYZ(1, ex, ey, ez);
        pos.needsUpdate = true;
        line.material.color.setHex(lineColor);
        line.material.opacity = lineOpacity;
        line.visible = true;
      }
    }

    // Hide lines for ships that no longer have valid targets
    for (const [id, line] of this._targetLines) {
      if (!wanted.has(id)) line.visible = false;
    }
  }

  // Clean up combat entities when combat ends
  clearCombatEntities() {
    for (const [id, data] of this.shipMeshes) {
      this.scene.remove(data.container);
      if (data.bubbles)    { for (const b of data.bubbles)    { this.scene.remove(b); b.geometry.dispose(); b.material.dispose(); } }
      if (data.rcsBubbles) { for (const b of data.rcsBubbles) { this.scene.remove(b); b.geometry.dispose(); b.material.dispose(); } }
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
    this._hideMoveGuides();
    this._clearSlotArcs();
    if (this._selRing) this._selRing.visible = false;
    // Contact blips
    if (this._contactBlips) {
      for (const [, mesh] of this._contactBlips) { this.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
      this._contactBlips.clear();
    }
    // Sonar rings
    if (this._sonarRings) {
      for (const { ring } of this._sonarRings) this.scene.remove(ring);
      this._sonarRings = [];
    }
    if (this._radarFlashes) {
      for (const f of this._radarFlashes) { if (f.mesh) this.scene.remove(f.mesh); }
      this._radarFlashes = [];
    }
    if (this._sonarDetectionWarnings) {
      for (const w of this._sonarDetectionWarnings) { this.scene.remove(w.mesh); }
      this._sonarDetectionWarnings = [];
    }
    // Last-known ghost markers
    if (this._lkMarkers) {
      for (const [, mesh] of this._lkMarkers) this.scene.remove(mesh);
      this._lkMarkers.clear();
    }
    // Active sonar flashes
    if (this._activeSonarFlashes) {
      for (const f of this._activeSonarFlashes) this.scene.remove(f.mesh);
      this._activeSonarFlashes = [];
    }
    // Target lines
    if (this._targetLines) {
      for (const [, line] of this._targetLines) this.scene.remove(line);
      this._targetLines.clear();
    }
    // Ship overlays
    if (this._shipOverlays) {
      for (const [, grp] of this._shipOverlays) this.scene.remove(grp);
      this._shipOverlays.clear();
    }
    // Comms lines
    if (this._commsLines) {
      for (const l of this._commsLines) this.scene.remove(l);
      this._commsLines = [];
    }
    // Revealed rings
    if (this._revealedRings) {
      for (const [, ring] of this._revealedRings) this.scene.remove(ring);
      this._revealedRings.clear();
    }
    // Tac view markers
    if (this._tacMarkers) {
      for (const [, m] of this._tacMarkers) { this.scene.remove(m.disc); this.scene.remove(m.arrow); }
      this._tacMarkers.clear();
    }
    // Tac view labels
    if (this._tacLabelContainer) {
      this._tacLabelContainer.remove();
      this._tacLabelContainer = null;
      this._tacLabelEls = null;
    }
    this._tacViewActive = false;
    this._tacExiting    = false;
    const ind = document.getElementById('tac-view-indicator');
    if (ind) ind.style.display = 'none';

    this.terrainGroup.clear();
    this._currentBiome = null;
    // Remove tac overlay lines
    for (const l of [this._tacCommsLines, this._tacMoveLines, this._tacAttackLines]) {
      if (l) this.scene.remove(l);
    }
    this._tacCommsLines = null;
    this._tacMoveLines  = null;
    this._tacAttackLines = null;
    // Restore ocean visuals and default theme
    this._setOceanVisualsVisible(true);
    this._applyBiomeTheme('abyssal');
  }
}
