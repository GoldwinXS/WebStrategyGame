'use strict';
// ================================================================
// AUDIO.JS — Procedural music + SFX using Web Audio API
//
// MUSIC THEORY NOTES:
//   Menu:   E Dorian (E-F#-G-A-B-C#-D) — melancholy with undertones
//           of hope. The raised 6th (C#) lifts what would otherwise
//           be pure Aeolian minor into something haunted but alive.
//   Combat: C# Phrygian (C#-D-E-F#-G#-A-B) — the flat 2nd (D)
//           creates maximum tonal tension against the root. Dark,
//           alien, inexorable. Classic choice for danger.
//   Stings: E major (victory) and chromatic descent (defeat).
// ================================================================

class AudioManager {
  constructor() {
    this._ctx = null;
    this._masterGain = null;
    this._musicGain  = null;
    this._fxGain     = null;
    this._reverb     = null;

    this.masterVol = 0.7;
    this.musicVol  = 0.55;
    this.fxVol     = 0.8;

    this._musicState   = null;  // 'menu' | 'combat' | null
    this._musicNodes   = [];    // refs for cleanup
    this._musicTimers  = [];    // setTimeout ids for cleanup
    this._initialized  = false;
  }

  // ── Lazy Init (browsers need user gesture before AudioContext) ──
  _init() {
    if (this._initialized) return;
    this._initialized = true;

    this._ctx = new (window.AudioContext || window.webkitAudioContext)();

    this._masterGain = this._ctx.createGain();
    this._masterGain.gain.value = this.masterVol;
    this._masterGain.connect(this._ctx.destination);

    this._musicGain = this._ctx.createGain();
    this._musicGain.gain.value = this.musicVol;
    this._musicGain.connect(this._masterGain);

    this._fxGain = this._ctx.createGain();
    this._fxGain.gain.value = this.fxVol;
    this._fxGain.connect(this._masterGain);

    // Reverb (synthesised impulse response)
    this._reverb = this._makeReverb(4.0, 0.22);
  }

  _makeReverb(duration, mix) {
    const ctx = this._ctx;
    const rate = ctx.sampleRate;
    const len  = Math.ceil(rate * duration);
    const buf  = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = buf;
    const mixGain = ctx.createGain();
    mixGain.gain.value = mix;
    conv.connect(mixGain);
    mixGain.connect(this._musicGain);
    this._reverbInput = conv;
    return conv;
  }

  // ── Volume Controls ────────────────────────────────────────────
  setMasterVol(v) {
    this.masterVol = v;
    if (this._masterGain) this._masterGain.gain.setTargetAtTime(v, this._ctx.currentTime, 0.05);
    this._savePrefs();
  }
  setMusicVol(v) {
    this.musicVol = v;
    if (this._musicGain) this._musicGain.gain.setTargetAtTime(v, this._ctx.currentTime, 0.05);
    this._savePrefs();
  }
  setFxVol(v) {
    this.fxVol = v;
    if (this._fxGain) this._fxGain.gain.setTargetAtTime(v, this._ctx.currentTime, 0.05);
    this._savePrefs();
  }

  _savePrefs() {
    try {
      localStorage.setItem('pelagos_audio', JSON.stringify({
        master: this.masterVol, music: this.musicVol, fx: this.fxVol,
      }));
    } catch (e) {}
  }

  loadPrefs() {
    try {
      const d = JSON.parse(localStorage.getItem('pelagos_audio'));
      if (!d) return;
      this.masterVol = d.master ?? 0.7;
      this.musicVol  = d.music  ?? 0.55;
      this.fxVol     = d.fx     ?? 0.8;
    } catch (e) {}
  }

  // ── Music Control ─────────────────────────────────────────────
  playMusic(state) {
    if (state === this._musicState) return;
    this._init();
    this._stopMusic();
    this._musicState = state;
    if (state === 'menu')   this._startMenuMusic();
    if (state === 'combat') {
      const pick = Math.floor(Math.random() * 3);
      if (pick === 0) this._startCombatMusic();
      else if (pick === 1) this._startCombatMusicB();
      else this._startCombatMusicC();
    }
  }

  stopMusic() { this._stopMusic(); }

  _stopMusic() {
    this._musicState = null;
    for (const tid of this._musicTimers) clearTimeout(tid);
    this._musicTimers = [];
    for (const n of this._musicNodes) {
      try { n.stop(this._ctx ? this._ctx.currentTime + 0.4 : 0); } catch (e) {}
    }
    this._musicNodes = [];
  }

  _after(ms, fn) {
    const tid = setTimeout(fn, ms);
    this._musicTimers.push(tid);
    return tid;
  }

  // ── E DORIAN — Menu / Ambient ─────────────────────────────────
  // Scale: E2=82.4  F#=92.5  G=98  A=110  B=123.5  C#4=277.2  D=146.8
  // Freq reference (equal temperament):
  //   E2=82.4, B2=123.5, E3=164.8, G3=196, A3=220, B3=246.9
  //   C#4=277.2, D4=293.7, E4=329.6, G4=392
  _startMenuMusic() {
    const ctx = this._ctx;
    const out = this._musicGain;
    const rev = this._reverbInput;
    const BPM = 64;
    const beat = 60 / BPM; // seconds per beat

    // ── 1. Sub-bass drone: E1 (41.2 Hz) — breathes in/out rather than constant ──
    const droneOsc = ctx.createOscillator();
    droneOsc.type = 'sine';
    droneOsc.frequency.value = 41.2;
    const droneLFO = ctx.createOscillator();
    droneLFO.frequency.value = 0.12;
    const droneLFOGain = ctx.createGain();
    droneLFOGain.gain.value = 1.1;
    droneLFO.connect(droneLFOGain);
    droneLFOGain.connect(droneOsc.frequency);
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0;
    const droneLPF = ctx.createBiquadFilter();
    droneLPF.type = 'lowpass'; droneLPF.frequency.value = 180;
    droneOsc.connect(droneLPF); droneLPF.connect(droneGain);
    droneGain.connect(out);
    droneOsc.start(); droneLFO.start();
    this._musicNodes.push(droneOsc, droneLFO);
    // Breathing envelope: fade in over 6s, hold 8s, fade out 6s, rest 10s, repeat
    const scheduleDroneBreathe = (delay) => {
      if (this._musicState !== 'menu') return;
      const t = ctx.currentTime + delay / 1000;
      droneGain.gain.setValueAtTime(0, t);
      droneGain.gain.linearRampToValueAtTime(0.18, t + 6);
      droneGain.gain.setValueAtTime(0.18, t + 14);
      droneGain.gain.linearRampToValueAtTime(0, t + 20);
      this._after(delay + 30000, () => scheduleDroneBreathe(0));
    };
    scheduleDroneBreathe(1000);

    // ── 2. Slow chord pads (sawtooth + LPF) ──
    // Progression: Em7 → Cmaj7 → Gmaj7 → Bm7  (in E Dorian, chords I-VI-III-VII)
    // Voicings:
    //   Em7:   E3-G3-B3-D4   (164.8, 196, 246.9, 293.7)
    //   Cmaj7: C#3-E3-G#3-B3 (138.6, 164.8, 207.7, 246.9) ← C# Dorian raised 6th
    //   Gmaj7: G3-B3-D4-F#4  (196, 246.9, 293.7, 370)
    //   Bm7:   B2-D3-F#3-A3  (123.5, 146.8, 185, 220)
    const padChords = [
      [164.8, 196, 246.9, 293.7],   // Em7
      [138.6, 164.8, 207.7, 246.9], // C#m/E (Dorian vi)
      [196, 246.9, 293.7, 370],     // Gmaj7
      [123.5, 146.8, 185, 220],     // Bm7
    ];
    const padDur = beat * 8; // 8 beats per chord = 2 bars at 64 BPM
    let padIdx = 0;

    const schedulePad = () => {
      if (this._musicState !== 'menu') return;
      const freqs = padChords[padIdx % padChords.length];
      padIdx++;
      for (const f of freqs) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = (Math.random() - 0.5) * 6; // slight humanisation
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.045, ctx.currentTime + 1.2);
        g.gain.setValueAtTime(0.045, ctx.currentTime + padDur - 1.0);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + padDur + 0.1);
        const lpf = ctx.createBiquadFilter();
        lpf.type = 'lowpass'; lpf.frequency.value = 560; lpf.Q.value = 0.7;
        osc.connect(lpf); lpf.connect(g);
        g.connect(out); g.connect(rev);
        osc.start(); osc.stop(ctx.currentTime + padDur + 0.2);
        this._musicNodes.push(osc);
      }
      this._after(padDur * 1000, schedulePad);
    };
    schedulePad();

    // ── 3. Arpeggio melody: E Dorian scale ascending/descending ──
    //  E3-G3-A3-B3-D4-E4-D4-B3 then repeat, varying octave every 4 bars
    // Arpeggio plays in 8-note phrases with deliberate silence between phrases
    const arpPhrases = [
      [164.8, 196, 220, 246.9, 293.7, 329.6, 293.7, 246.9],  // ascending E Dorian
      [329.6, 246.9, 220, 196, 246.9, 220, 164.8, 196],       // descending variation
      [164.8, 220, 246.9, 329.6, 220, 164.8, 196, 246.9],     // leap pattern
    ];
    const arp8th = beat / 2;
    let phraseIdx = 0;

    const scheduleArpPhrase = () => {
      if (this._musicState !== 'menu') return;
      const phrase = arpPhrases[phraseIdx % arpPhrases.length];
      phraseIdx++;
      const octMod = phraseIdx % 3 === 0 ? 0.5 : 1;

      phrase.forEach((freq, i) => {
        // Occasional note skip for organic feel
        if (Math.random() < 0.15) return;
        this._after(i * arp8th * 1000, () => {
          if (this._musicState !== 'menu') return;
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = freq * octMod;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, ctx.currentTime);
          g.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 0.03);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + arp8th * 1.8);
          osc.connect(g); g.connect(out); g.connect(rev);
          osc.start(); osc.stop(ctx.currentTime + arp8th * 2.2);
          this._musicNodes.push(osc);
        });
      });

      // Rest between phrases: 1-3 bars of silence, then next phrase
      const restBars = 1 + Math.floor(Math.random() * 3);
      this._after((phrase.length * arp8th + beat * restBars) * 1000, scheduleArpPhrase);
    };
    this._after(beat * 2000, scheduleArpPhrase); // start after 2 beats

    // ── 4. Bioluminescent "plop" atmospheric sounds ──
    const scheduleAtmos = () => {
      if (this._musicState !== 'menu') return;
      // Bandpass noise burst — water drop / biolum flash
      const noise = this._makeNoise(0.15);
      const bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = 400 + Math.random() * 1200;
      bpf.Q.value = 10;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.06 * Math.random(), ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      noise.connect(bpf); bpf.connect(g); g.connect(out);
      this._after((2000 + Math.random() * 4000), scheduleAtmos);
    };
    this._after(500, scheduleAtmos);
  }

  // ── C# PHRYGIAN — Combat ──────────────────────────────────────
  // C#2=69.3  D2=73.4  E2=82.4  F#2=92.5  G#2=103.8  A2=110  B2=123.5
  // C#3=138.6  D3=146.8  E3=164.8  F#3=185  G#3=207.7  A3=220  B3=246.9
  // C#4=277.2  D4=293.7
  _startCombatMusic() {
    const ctx = this._ctx;
    const out = this._musicGain;
    const rev = this._reverbInput;
    const BPM  = 128;
    const beat  = 60 / BPM;
    const t16th = beat / 4;  // 16th note

    // ── 1. Distorted bass ostinato: C#–D–C#–G# (Phrygian signature move) ──
    // The C#→D half-step ascent is THE defining Phrygian tension gesture
    const bassSeq = [69.3, 73.4, 69.3, 103.8, 69.3, 73.4, 69.3, 55.0];
    let bassStep = 0;

    const distort = this._makeDistortCurve(20);
    const bassBus = ctx.createGain();
    bassBus.gain.value = 0.30;
    const bassWave = ctx.createWaveShaper();
    bassWave.curve = distort;
    const bassLP = ctx.createBiquadFilter();
    bassLP.type = 'lowpass'; bassLP.frequency.value = 350;
    bassWave.connect(bassLP); bassLP.connect(bassBus); bassBus.connect(out);

    const scheduleBass = () => {
      if (this._musicState !== 'combat') return;
      // Every 8 bars (~4s at 128BPM) take a 1-bar rest for breathing room
      const barNum = Math.floor(bassStep / bassSeq.length);
      if (bassStep % (bassSeq.length * 8) === 0 && bassStep > 0) {
        bassStep++;
        this._after(beat * 2 * 1000, scheduleBass); // 2-beat rest
        return;
      }
      const f = bassSeq[bassStep % bassSeq.length];
      bassStep++;
      const osc = ctx.createOscillator();
      osc.type = 'square'; osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + beat * 0.88);
      osc.connect(g); g.connect(bassWave);
      osc.start(); osc.stop(ctx.currentTime + beat);
      this._musicNodes.push(osc);
      this._after(beat * 1000, scheduleBass);
    };
    scheduleBass();

    // ── 2. Kick-like percussion (low-tuned noise) ──
    // 4-on-the-floor with accent on beat 3 (half-time feel)
    const kickPat = [1,0,0,0, 0,0,1,0, 1,0,0,0, 0,0,1,0];
    let kickStep = 0;

    const scheduleKick = () => {
      if (this._musicState !== 'combat') return;
      if (kickPat[kickStep % kickPat.length]) {
        const noise = this._makeNoise(0.08);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.55, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        const lpf = ctx.createBiquadFilter();
        lpf.type = 'lowpass'; lpf.frequency.value = 160;
        noise.connect(lpf); lpf.connect(g); g.connect(out);
        // Pitched click on top
        const osc = ctx.createOscillator();
        osc.type = 'sine'; osc.frequency.setValueAtTime(160, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.06);
        const og = ctx.createGain();
        og.gain.setValueAtTime(0.5, ctx.currentTime);
        og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
        osc.connect(og); og.connect(out);
        osc.start(); osc.stop(ctx.currentTime + 0.08);
        this._musicNodes.push(osc);
      }
      kickStep++;
      this._after(t16th * 1000, scheduleKick);
    };
    scheduleKick();

    // ── 3. Snare-like (mid-noise burst on beats 2 & 4) ──
    const snarePat = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0];
    let snareStep = 0;

    const scheduleSnare = () => {
      if (this._musicState !== 'combat') return;
      if (snarePat[snareStep % snarePat.length]) {
        const noise = this._makeNoise(0.12);
        const bpf = ctx.createBiquadFilter();
        bpf.type = 'bandpass'; bpf.frequency.value = 240; bpf.Q.value = 1.5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.35, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        noise.connect(bpf); bpf.connect(g); g.connect(out);
      }
      snareStep++;
      this._after(t16th * 1000, scheduleSnare);
    };
    scheduleSnare();

    // ── 4. Phrygian arpeggio (fast 16ths through scale) ──
    // Pattern: C#3–E3–G#3–C#4 (Phrygian tonic triad + octave)
    //          then D3–F#3–A3–D4 (flat-II chord — max Phrygian tension)
    const arpGroups = [
      [138.6, 164.8, 207.7, 277.2],  // C#m (tonic)
      [146.8, 185,   220,   293.7],  // D major (flat-II — the Phrygian chord)
      [138.6, 164.8, 207.7, 277.2],  // C#m
      [110,   138.6, 164.8, 207.7],  // Am (vi)
    ];
    let arpGroup = 0, arpNote = 0;
    const arpBus = ctx.createGain();
    arpBus.gain.value = 0.10;
    arpBus.connect(out); arpBus.connect(rev);

    const scheduleArp = () => {
      if (this._musicState !== 'combat') return;
      const group = arpGroups[arpGroup % arpGroups.length];
      const f = group[arpNote % group.length];
      arpNote++;
      if (arpNote % group.length === 0) arpGroup++;

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f * (arpNote % 8 < 2 ? 0.5 : 1); // drop to lower octave periodically
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.8, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t16th * 0.85);
      const filt = ctx.createBiquadFilter();
      filt.type = 'bandpass'; filt.frequency.value = f * 1.8; filt.Q.value = 1.5;
      osc.connect(filt); filt.connect(g); g.connect(arpBus);
      osc.start(); osc.stop(ctx.currentTime + t16th);
      this._musicNodes.push(osc);
      this._after(t16th * 1000, scheduleArp);
    };
    scheduleArp();

    // ── 5. Tension pad: C#m7 — swells in and out rather than droning ──
    // Cycles through two voicings for harmonic movement
    const padVoicings = [
      [69.3, 138.6, 164.8, 207.7, 246.9],  // C#m7: C#2-C#3-E3-G#3-B3
      [73.4, 146.8, 164.8, 220,   277.2],  // Dm7:  D2-D3-E3-A3-C#4 (flat-II swell)
    ];
    let padVoiceIdx = 0;
    const schedulePadSwell = () => {
      if (this._musicState !== 'combat') return;
      const freqs = padVoicings[padVoiceIdx % padVoicings.length];
      padVoiceIdx++;
      const swellDur = beat * 16; // 4 bars per swell
      for (const f of freqs) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = (Math.random() - 0.5) * 10;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.040, ctx.currentTime + swellDur * 0.35);
        g.gain.setValueAtTime(0.040, ctx.currentTime + swellDur * 0.65);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + swellDur);
        const lpf = ctx.createBiquadFilter();
        lpf.type = 'lowpass'; lpf.frequency.value = 650;
        osc.connect(lpf); lpf.connect(g);
        g.connect(out); g.connect(rev);
        osc.start(); osc.stop(ctx.currentTime + swellDur + 0.1);
        this._musicNodes.push(osc);
      }
      // Short gap between swells, then next voicing
      this._after((swellDur + beat * 2) * 1000, schedulePadSwell);
    };
    schedulePadSwell();
  }

  // ── F# LOCRIAN — Slow, oppressive combat (76 BPM) ────────────
  // Scale: F#2=92.5, G2=98, A2=110, B2=123.5, C#3=138.6, D3=146.8, E3=164.8
  // Locrian's tritone above root (C natural over F#) creates maximum dread.
  // At half-tempo this sounds slow and crushing — good for tense, grinding battles.
  _startCombatMusicB() {
    const ctx = this._ctx;
    const out = this._musicGain;
    const rev = this._reverbInput;
    const BPM  = 76;
    const beat  = 60 / BPM;
    const t16th = beat / 4;

    // 1. Sub-bass tremolo drone: F#1 (46.25 Hz) — slow wavering dread
    const droneOsc = ctx.createOscillator();
    droneOsc.type = 'sine';
    droneOsc.frequency.value = 46.25;
    const tremLFO = ctx.createOscillator();
    tremLFO.type = 'sine';
    tremLFO.frequency.value = 0.07; // very slow waver
    const tremGain = ctx.createGain();
    tremGain.gain.value = 1.4;
    tremLFO.connect(tremGain);
    tremGain.connect(droneOsc.frequency);
    const droneG = ctx.createGain();
    droneG.gain.value = 0.20;
    const droneLPF = ctx.createBiquadFilter();
    droneLPF.type = 'lowpass'; droneLPF.frequency.value = 200;
    droneOsc.connect(droneLPF); droneLPF.connect(droneG); droneG.connect(out);
    droneOsc.start(); tremLFO.start();
    this._musicNodes.push(droneOsc, tremLFO);

    // 2. Slow chord swells — tritone pairs (F#m and Cdim)
    const swellChords = [
      [92.5, 110, 138.6, 164.8],   // F#2-A2-C#3-E3  (F#m)
      [98,   123.5, 155.6, 196],   // G2-B2-Eb3-G3   (Gdim — tritone)
      [92.5, 123.5, 164.8, 185],   // F#2-B2-E3-F#3  (F#sus2 spread)
      [82.4, 110,   146.8, 185],   // E2-A2-D3-F#3   (Am/E)
    ];
    let swellIdx = 0;
    const scheduleSwellB = () => {
      if (this._musicState !== 'combat') return;
      const freqs = swellChords[swellIdx % swellChords.length];
      swellIdx++;
      const dur = beat * 12;
      for (const f of freqs) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        osc.detune.value = (Math.random() - 0.5) * 8;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.034, ctx.currentTime + dur * 0.28);
        g.gain.setValueAtTime(0.034, ctx.currentTime + dur * 0.72);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + dur);
        const lpf = ctx.createBiquadFilter();
        lpf.type = 'lowpass'; lpf.frequency.value = 480;
        osc.connect(lpf); lpf.connect(g);
        g.connect(out); g.connect(rev);
        osc.start(); osc.stop(ctx.currentTime + dur + 0.1);
        this._musicNodes.push(osc);
      }
      this._after((dur + beat) * 1000, scheduleSwellB);
    };
    scheduleSwellB();

    // 3. Half-time percussion — deep sub-kick on beats 1 & 3 only
    const kickPatB = [1,0,0,0, 0,0,0,0, 0,0,1,0, 0,0,0,0];
    let kickStepB = 0;
    const scheduleKickB = () => {
      if (this._musicState !== 'combat') return;
      if (kickPatB[kickStepB % kickPatB.length]) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(85, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(22, ctx.currentTime + 0.32);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.58, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.36);
        const noise = this._makeNoise(0.06);
        const nlpf = ctx.createBiquadFilter();
        nlpf.type = 'lowpass'; nlpf.frequency.value = 180;
        const ng = ctx.createGain();
        ng.gain.setValueAtTime(0.28, ctx.currentTime);
        ng.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
        osc.connect(g); g.connect(out);
        noise.connect(nlpf); nlpf.connect(ng); ng.connect(out);
        osc.start(); osc.stop(ctx.currentTime + 0.38);
      }
      kickStepB++;
      this._after(t16th * 1000, scheduleKickB);
    };
    scheduleKickB();

    // 4. Eerie high-register bell melody (sine, long decay) — sparse, haunting
    const bellNotes = [185, 164.8, 185, 207.7, 185, 155.6, 164.8, 185]; // F#3-E3-F#3-G#3-F#3-Eb3-E3-F#3
    let bellIdx = 0;
    const scheduleBellB = () => {
      if (this._musicState !== 'combat') return;
      const f = bellNotes[bellIdx % bellNotes.length] * 2; // upper octave
      bellIdx++;
      if (Math.random() > 0.28) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.065, ctx.currentTime + 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + beat * 3.0);
        osc.connect(g); g.connect(out); g.connect(rev);
        osc.start(); osc.stop(ctx.currentTime + beat * 3.2);
        this._musicNodes.push(osc);
      }
      this._after(beat * (1.5 + Math.random() * 2.5) * 1000, scheduleBellB);
    };
    this._after(beat * 4000, scheduleBellB);

    // 5. Occasional atmospheric noise gusts
    const scheduleAtmosB = () => {
      if (this._musicState !== 'combat') return;
      const noise = this._makeNoise(0.3);
      const bpf = ctx.createBiquadFilter();
      bpf.type = 'bandpass';
      bpf.frequency.value = 500 + Math.random() * 900;
      bpf.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.05 * Math.random(), ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      noise.connect(bpf); bpf.connect(g); g.connect(rev);
      this._after(2000 + Math.random() * 4500, scheduleAtmosB);
    };
    this._after(800, scheduleAtmosB);
  }

  // ── A PHRYGIAN — Fast, industrial combat (148 BPM) ───────────
  // Scale: A2=110, Bb2=116.5, C3=130.8, D3=146.8, E3=164.8, F3=174.6, G3=196, A3=220
  // The flat-2 (Bb against A root) is the most aggressive Phrygian tension interval.
  // At 148 BPM with off-beat kick accents it feels chaotic and relentless.
  _startCombatMusicC() {
    const ctx = this._ctx;
    const out = this._musicGain;
    const rev = this._reverbInput;
    const BPM  = 148;
    const beat  = 60 / BPM;
    const t16th = beat / 4;

    // 1. Distorted 8th-note bass: A1 with Phrygian Bb flat-II tension
    const bassSeqC = [55, 55, 58.3, 55, 55, 73.4, 55, 58.3]; // A1×2, Bb1, A1×2, D2, A1, Bb1
    let bassStepC = 0;
    const distC = this._makeDistortCurve(35);
    const bassBusC = ctx.createGain();
    bassBusC.gain.value = 0.26;
    const bassWaveC = ctx.createWaveShaper();
    bassWaveC.curve = distC;
    const bassLPC = ctx.createBiquadFilter();
    bassLPC.type = 'lowpass'; bassLPC.frequency.value = 320;
    bassWaveC.connect(bassLPC); bassLPC.connect(bassBusC); bassBusC.connect(out);

    const scheduleBassC = () => {
      if (this._musicState !== 'combat') return;
      const f = bassSeqC[bassStepC % bassSeqC.length];
      bassStepC++;
      // Occasional one-bar rest for breathing room
      if (bassStepC % (bassSeqC.length * 6) === 0) {
        this._after(beat * 2 * 1000, scheduleBassC);
        return;
      }
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth'; osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.95, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + beat * 0.88);
      osc.connect(g); g.connect(bassWaveC);
      osc.start(); osc.stop(ctx.currentTime + beat);
      this._musicNodes.push(osc);
      this._after(beat * 1000, scheduleBassC);
    };
    scheduleBassC();

    // 2. Driving kick — 4-on-floor + off-beat accents (syncopated)
    const kickPatC = [1,0,0,1, 0,0,1,0, 1,0,0,1, 0,1,0,0];
    let kickStepC = 0;
    const scheduleKickC = () => {
      if (this._musicState !== 'combat') return;
      if (kickPatC[kickStepC % kickPatC.length]) {
        const noise = this._makeNoise(0.06);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.58, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
        const lpf = ctx.createBiquadFilter();
        lpf.type = 'lowpass'; lpf.frequency.value = 145;
        noise.connect(lpf); lpf.connect(g); g.connect(out);
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(145, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(32, ctx.currentTime + 0.055);
        const og = ctx.createGain();
        og.gain.setValueAtTime(0.52, ctx.currentTime);
        og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.065);
        osc.connect(og); og.connect(out);
        osc.start(); osc.stop(ctx.currentTime + 0.07);
        this._musicNodes.push(osc);
      }
      kickStepC++;
      this._after(t16th * 1000, scheduleKickC);
    };
    scheduleKickC();

    // 3. Snare on 2 & 4 with occasional late-bar double
    const snarePatC = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,1,0];
    let snareStepC = 0;
    const scheduleSnareC = () => {
      if (this._musicState !== 'combat') return;
      if (snarePatC[snareStepC % snarePatC.length]) {
        const noise = this._makeNoise(0.11);
        const bpf = ctx.createBiquadFilter();
        bpf.type = 'bandpass'; bpf.frequency.value = 265; bpf.Q.value = 1.6;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.38, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.11);
        noise.connect(bpf); bpf.connect(g); g.connect(out);
      }
      snareStepC++;
      this._after(t16th * 1000, scheduleSnareC);
    };
    scheduleSnareC();

    // 4. Harsh square arpeggio — tritone-heavy Phrygian pattern
    const arpGroupsC = [
      [110,   155.6, 185,   220  ],  // A2-Eb3-F#3-A3  (tritone from A)
      [116.5, 164.8, 196,   233.1],  // Bb2-E3-G3-Bb3  (Phrygian flat-II)
      [110,   146.8, 185,   220  ],  // A2-D3-F#3-A3   (Am)
      [73.4,  110,   155.6, 207.7],  // D2-A2-Eb3-Ab3  (dim7 cloud)
    ];
    let arpGrpC = 0, arpNoteC = 0;
    const arpBusC = ctx.createGain();
    arpBusC.gain.value = 0.085;
    arpBusC.connect(out);

    const scheduleArpC = () => {
      if (this._musicState !== 'combat') return;
      const grp = arpGroupsC[arpGrpC % arpGroupsC.length];
      const f = grp[arpNoteC % grp.length];
      arpNoteC++;
      if (arpNoteC % grp.length === 0) arpGrpC++;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f * (arpNoteC % 8 < 2 ? 0.5 : 1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.85, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t16th * 0.72);
      const lpf = ctx.createBiquadFilter();
      lpf.type = 'bandpass'; lpf.frequency.value = f * 2.5; lpf.Q.value = 2.0;
      osc.connect(lpf); lpf.connect(g); g.connect(arpBusC);
      osc.start(); osc.stop(ctx.currentTime + t16th);
      this._musicNodes.push(osc);
      this._after(t16th * 1000, scheduleArpC);
    };
    scheduleArpC();

    // 5. Dark pad swells — heavily detuned sawtooth for dissonant mass
    const padVoicingsC = [
      [55,   110,   146.8, 196  ],  // A1-A2-D3-G3   (Am7sus4)
      [58.3, 116.5, 155.6, 207.7],  // Bb1-Bb2-Eb3-Ab3 (Bbm — flat-II swell)
    ];
    let padIdxC = 0;
    const schedulePadC = () => {
      if (this._musicState !== 'combat') return;
      const freqs = padVoicingsC[padIdxC % padVoicingsC.length];
      padIdxC++;
      const dur = beat * 12;
      for (const f of freqs) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        osc.detune.value = (Math.random() - 0.5) * 18; // heavy detune = more dissonant
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.030, ctx.currentTime + dur * 0.22);
        g.gain.setValueAtTime(0.030, ctx.currentTime + dur * 0.78);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + dur);
        const lpf = ctx.createBiquadFilter();
        lpf.type = 'lowpass'; lpf.frequency.value = 580;
        osc.connect(lpf); lpf.connect(g);
        g.connect(out); g.connect(rev);
        osc.start(); osc.stop(ctx.currentTime + dur + 0.1);
        this._musicNodes.push(osc);
      }
      this._after((dur + beat) * 1000, schedulePadC);
    };
    schedulePadC();
  }

  // ── Stings ────────────────────────────────────────────────────
  playVictorySting() {
    this._init();
    this._stopMusic();
    const ctx = this._ctx;
    // E major ascending arpeggio: E4–G#4–B4–E5 (bright, triumphant)
    const notes = [329.6, 415.3, 493.9, 659.3];
    notes.forEach((f, i) => {
      this._after(i * 220, () => {
        if (!ctx) return;
        const osc = ctx.createOscillator();
        osc.type = 'sine'; osc.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.28 * this.masterVol * this.musicVol, ctx.currentTime + 0.04);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.1);
        osc.connect(g); g.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 1.2);
      });
    });
  }

  playGameOverSting() {
    this._init();
    this._stopMusic();
    const ctx = this._ctx;
    // Chromatic descent: E3–D#3–D3–C#3 (each note slow, funereal)
    const notes = [164.8, 155.6, 146.8, 138.6];
    notes.forEach((f, i) => {
      this._after(i * 480, () => {
        if (!ctx) return;
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth'; osc.frequency.value = f;
        const lpf = ctx.createBiquadFilter();
        lpf.type = 'lowpass'; lpf.frequency.value = 400;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.22 * this.masterVol * this.musicVol, ctx.currentTime + 0.12);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.75);
        osc.connect(lpf); lpf.connect(g); g.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime + 0.8);
      });
    });
  }

  // ── Sound Effects ─────────────────────────────────────────────
  play(sfx, vol = 1.0) {
    this._init();
    if (!this._ctx) return;
    const v = vol * this.fxVol * this.masterVol;
    switch (sfx) {
      case 'shoot_plasma':  this._sfxPlasma(v); break;
      case 'shoot_torpedo': this._sfxTorpedo(v); break;
      case 'shoot_beam':    this._sfxBeam(v); break;
      case 'explosion':     this._sfxExplosion(v, false); break;
      case 'explosion_big': this._sfxExplosion(v, true); break;
      case 'shield_hit':    this._sfxShieldHit(v); break;
      case 'ui_click':      this._sfxClick(v); break;
      case 'select_ship':   this._sfxSelect(v); break;
      case 'order_move':    this._sfxOrder(v); break;
      case 'depth_change':  this._sfxBubbles(v); break;
    }
  }

  _sfxPlasma(v) {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(820, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(190, ctx.currentTime + 0.13);
    const g = ctx.createGain();
    g.gain.setValueAtTime(v * 0.28, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
    osc.connect(g); g.connect(this._fxGain);
    osc.start(); osc.stop(ctx.currentTime + 0.18);
  }

  _sfxTorpedo(v) {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(v * 0.45, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.26);
    const noise = this._makeNoise(0.3);
    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass'; hpf.frequency.value = 700;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0, ctx.currentTime);
    ng.gain.linearRampToValueAtTime(v * 0.14, ctx.currentTime + 0.06);
    ng.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
    osc.connect(g); g.connect(this._fxGain);
    noise.connect(hpf); hpf.connect(ng); ng.connect(this._fxGain);
    osc.start(); osc.stop(ctx.currentTime + 0.3);
  }

  _sfxBeam(v) {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth'; osc.frequency.value = 320;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square'; osc2.frequency.value = 160;
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass'; filt.frequency.value = 750; filt.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(v * 0.09, ctx.currentTime + 0.02);
    g.gain.setValueAtTime(v * 0.09, ctx.currentTime + 0.32);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.48);
    osc.connect(filt); osc2.connect(filt); filt.connect(g); g.connect(this._fxGain);
    osc.start(); osc.stop(ctx.currentTime + 0.5);
    osc2.start(); osc2.stop(ctx.currentTime + 0.5);
  }

  _sfxExplosion(v, big) {
    const ctx = this._ctx;
    const dur = big ? 0.95 : 0.55;
    const noise = this._makeNoise(dur);
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(big ? 2200 : 1500, ctx.currentTime);
    lpf.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(v * (big ? 0.75 : 0.42), ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    noise.connect(lpf); lpf.connect(g); g.connect(this._fxGain);
    // Sub thud
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(big ? 65 : 90, ctx.currentTime);
    sub.frequency.exponentialRampToValueAtTime(18, ctx.currentTime + dur * 0.75);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(v * (big ? 0.55 : 0.28), ctx.currentTime);
    sg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur * 0.7);
    sub.connect(sg); sg.connect(this._fxGain);
    sub.start(); sub.stop(ctx.currentTime + dur);
  }

  _sfxShieldHit(v) {
    const ctx = this._ctx;
    // FM synthesis: carrier at 880Hz, modulated by 1760Hz (harmonic ratio 1:2)
    const carrier = ctx.createOscillator();
    carrier.type = 'sine'; carrier.frequency.value = 880;
    const mod = ctx.createOscillator();
    mod.type = 'sine'; mod.frequency.value = 1760;
    const modGain = ctx.createGain();
    modGain.gain.value = 380;
    mod.connect(modGain); modGain.connect(carrier.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(v * 0.22, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    carrier.connect(g); g.connect(this._fxGain);
    carrier.start(); carrier.stop(ctx.currentTime + 0.25);
    mod.start(); mod.stop(ctx.currentTime + 0.25);
  }

  _sfxClick(v) {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v * 0.14, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.055);
    osc.connect(g); g.connect(this._fxGain);
    osc.start(); osc.stop(ctx.currentTime + 0.07);
  }

  _sfxSelect(v) {
    const ctx = this._ctx;
    // Two-note upward chirp (E4 → B4)
    for (const [f, t] of [[329.6, 0], [493.9, 0.06]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime + t);
      g.gain.linearRampToValueAtTime(v * 0.13, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.10);
      osc.connect(g); g.connect(this._fxGain);
      osc.start(ctx.currentTime + t); osc.stop(ctx.currentTime + t + 0.12);
    }
  }

  _sfxOrder(v) {
    const ctx = this._ctx;
    // Descending two-note acknowledgement (B4 → E4)
    for (const [f, t] of [[493.9, 0], [329.6, 0.07]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, ctx.currentTime + t);
      g.gain.linearRampToValueAtTime(v * 0.10, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.09);
      osc.connect(g); g.connect(this._fxGain);
      osc.start(ctx.currentTime + t); osc.stop(ctx.currentTime + t + 0.11);
    }
  }

  _sfxBubbles(v) {
    const ctx = this._ctx;
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const noise = this._makeNoise(0.07);
        const bpf = ctx.createBiquadFilter();
        bpf.type = 'bandpass';
        bpf.frequency.value = 500 + Math.random() * 1000;
        bpf.Q.value = 9;
        const g = ctx.createGain();
        g.gain.setValueAtTime(v * 0.12, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
        noise.connect(bpf); bpf.connect(g); g.connect(this._fxGain);
      }, i * 45 + Math.random() * 20);
    }
  }

  // ── Utilities ─────────────────────────────────────────────────
  _makeNoise(duration) {
    const ctx = this._ctx;
    const len = Math.ceil(ctx.sampleRate * Math.max(duration, 0.01));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.start();
    return src;
  }

  _makeDistortCurve(amount) {
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }
}

// Global singleton
const audio = new AudioManager();
