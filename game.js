(() => {
  'use strict';

  // ==================== CONSTANTS ====================
  const CANVAS_W = 900;
  const CANVAS_H = 660;
  const TILE = 20;
  const GRID_W = CANVAS_W / TILE; // 45
  const GRID_H = CANVAS_H / TILE; // 33
  const MACRO_W = 11;
  const MACRO_H = 8;

  const BOT_RADIUS = 14;
  const BULLET_RADIUS = 4;
  const REGEN_AMMO_COST = 3;
  const REGEN_HP_PCT = 0.10;
  const REGEN_COOLDOWN = 10.0;

  // Special Bullet-Triggered Wall Tiles (embedded in interior maze walls)
  const SPECIAL_TILE_TYPES = {
    3: { id: 3, type: 'range', name: 'Range Booster Wall', short: '+R', color: '#06b6d4', soft: '#cffafe', border: '#0891b2' },
    4: { id: 4, type: 'speed', name: 'Turbo Accelerator Wall', short: '»', color: '#f59e0b', soft: '#fef3c7', border: '#d97706' },
    5: { id: 5, type: 'spread', name: '3-Way Splitter Wall', short: '3×', color: '#a855f7', soft: '#f3e8ff', border: '#7e22ce' }
  };

  // Dynamic Arena Rules (configurable in Pre-Match Setup & injected into AI Prompt)
  const DEFAULT_RULES = {
    aiAmmo: 3,
    playerAmmo: 20,
    reloadPerBullet: 1.5,
    maxHp: 100,
    playerHp: 300,
    bulletDamage: 18,
    bulletSpeed: 225,
    maxRange: 550,
    maxBounces: 3,
    fogOfWar: false,
    seed: ''
  };

  let arenaRules = { ...DEFAULT_RULES };
  let MAX_HP = arenaRules.maxHp;
  let PLAYER_MAX_HP = arenaRules.playerHp;
  let AI_MAG_SIZE = arenaRules.aiAmmo;
  let PLAYER_MAG_SIZE = arenaRules.playerAmmo;
  let RELOAD_PER_BULLET = arenaRules.reloadPerBullet;
  let BULLET_SPEED = arenaRules.bulletSpeed;
  let BULLET_MAX_RANGE = arenaRules.maxRange;
  let BULLET_MAX_BOUNCES = arenaRules.maxBounces;
  let BULLET_DAMAGE = arenaRules.bulletDamage;

  // ==================== AI PRESETS ====================
  const AI_PRESETS = {
    rusher: {
      id: 'rusher',
      name: 'Aggressive Rusher',
      shortName: 'Rusher',
      desc: 'Charges enemies at full speed, overwhelms at close range with rapid fire.',
      defaults: { aggression: 92, caution: 18, ricochet: 22 }
    },
    sniper: {
      id: 'sniper',
      name: 'Tactical Sniper',
      shortName: 'Sniper',
      desc: 'Holds long corridors, maintains standoff distance, leads shots accurately, retreats on reload.',
      defaults: { aggression: 52, caution: 78, ricochet: 35 }
    },
    flanker: {
      id: 'flanker',
      name: 'Wall-Hugging Flanker',
      shortName: 'Flanker',
      desc: 'Uses LiDAR wall-following to circle maze corridors and ambush enemies from the side or rear.',
      defaults: { aggression: 72, caution: 55, ricochet: 30 }
    },
    trickshotter: {
      id: 'trickshotter',
      name: 'Ricochet Trickshotter',
      shortName: 'Trickshotter',
      desc: 'Actively calculates 1- and 2-bounce bank shots off walls to hit enemies around corners.',
      defaults: { aggression: 66, caution: 58, ricochet: 95 }
    },
    coward: {
      id: 'coward',
      name: 'Evasive Coward',
      shortName: 'Coward',
      desc: 'Prioritizes dodging incoming bullets and hiding behind cover while rivals weaken each other.',
      defaults: { aggression: 22, caution: 95, ricochet: 40 }
    }
  };

  const PRESET_LIST = Object.values(AI_PRESETS);

  const BOT_SLOTS = [
    {
      id: 0,
      slotLabel: 'BOT 01 · RED',
      colorName: 'Red',
      color: '#e53935',
      soft: '#fdecec',
      dark: '#b71c1c',
      defaultName: 'Crimson-1',
      defaultPreset: 'rusher',
      spawn: { mx: 0, my: 0, angle: Math.PI * 0.25 }
    },
    {
      id: 1,
      slotLabel: 'BOT 02 · BLUE',
      colorName: 'Blue',
      color: '#1e88e5',
      soft: '#e8f3fd',
      dark: '#0d47a1',
      defaultName: 'Optic-2',
      defaultPreset: 'sniper',
      spawn: { mx: MACRO_W - 1, my: 0, angle: Math.PI * 0.75 }
    },
    {
      id: 2,
      slotLabel: 'BOT 03 · GREEN',
      colorName: 'Green',
      color: '#229a56',
      soft: '#e7f6ee',
      dark: '#166534',
      defaultName: 'Viper-3',
      defaultPreset: 'flanker',
      spawn: { mx: 0, my: MACRO_H - 1, angle: -Math.PI * 0.25 }
    },
    {
      id: 3,
      slotLabel: 'BOT 04 · AMBER',
      colorName: 'Amber',
      color: '#e2860b',
      soft: '#fef4e4',
      dark: '#9a5600',
      defaultName: 'Bankshot-4',
      defaultPreset: 'trickshotter',
      spawn: { mx: MACRO_W - 1, my: MACRO_H - 1, angle: -Math.PI * 0.75 }
    }
  ];

  const RANDOM_NAMES = [
    ['Blaze-1', 'Fury-1', 'Apex-1', 'Valkyrie-1', 'Striker-1'],
    ['Cobalt-2', 'Vector-2', 'Optic-2', 'Prism-2', 'Horizon-2'],
    ['Phantom-3', 'Viper-3', 'Mantis-3', 'Ghost-3', 'Prowler-3'],
    ['Solar-4', 'Ricochet-4', 'Angle-4', 'Spark-4', 'Mirage-4']
  ];

  // ==================== RANDOM MAZE THEMES ====================
  const MAZE_THEMES = [
    {
      id: 'blueprint',
      name: 'Blueprint Lab',
      floor: '#f8fafc',
      plaza: '#eef4fb',
      plazaBorder: '#d7e3f4',
      gridLine: 'rgba(100, 116, 139, 0.14)',
      wallFill: '#d3dce8',
      wallHighlight: '#e4ebf5',
      wallLip: '#b1c0d4',
      wallOutline: '#8fa1b9',
      pillarFill: '#bcc8d9',
      pillarInner: '#dbe4f0',
      pillarOutline: '#7387a3',
      pillarDot: '#475569',
      shadow: 'rgba(15, 23, 42, 0.08)',
      accent: '#2563eb',
      moteColor: 'rgba(59, 130, 246, 0.24)',
      moteStyle: 'dot',
      // C-minor crisp tech groove
      scale: [261.63, 311.13, 349.23, 392.0, 466.16, 523.25],
      bass: [130.81, 130.81, 155.56, 116.54]
    },
    {
      id: 'sandstone',
      name: 'Sandstone Oasis',
      floor: '#faf6ee',
      plaza: '#f3ead9',
      plazaBorder: '#e2d2b5',
      gridLine: 'rgba(161, 128, 84, 0.14)',
      wallFill: '#dfc8a7',
      wallHighlight: '#ecdcc3',
      wallLip: '#c2a37a',
      wallOutline: '#9e7e56',
      pillarFill: '#cca97c',
      pillarInner: '#e7d3b5',
      pillarOutline: '#8c6940',
      pillarDot: '#7c5329',
      shadow: 'rgba(92, 61, 28, 0.10)',
      accent: '#d97706',
      moteColor: 'rgba(217, 119, 6, 0.22)',
      moteStyle: 'dust',
      // D Phrygian warm desert pulse
      scale: [293.66, 311.13, 392.0, 440.0, 466.16, 587.33],
      bass: [146.83, 155.56, 146.83, 130.81]
    },
    {
      id: 'botanical',
      name: 'Botanical Zen',
      floor: '#f3f9f5',
      plaza: '#e5f3ea',
      plazaBorder: '#c9e4d2',
      gridLine: 'rgba(52, 120, 82, 0.13)',
      wallFill: '#c3dbc9',
      wallHighlight: '#d9ebdd',
      wallLip: '#9ec0a8',
      wallOutline: '#739a7f',
      pillarFill: '#a8cab2',
      pillarInner: '#d2e7d8',
      pillarOutline: '#5d866b',
      pillarDot: '#2f6b47',
      shadow: 'rgba(20, 62, 38, 0.08)',
      accent: '#16a34a',
      moteColor: 'rgba(34, 154, 86, 0.28)',
      moteStyle: 'leaf',
      // G major pentatonic lively zen
      scale: [392.0, 440.0, 493.88, 587.33, 659.25, 783.99],
      bass: [196.0, 164.81, 146.83, 164.81]
    },
    {
      id: 'arctic',
      name: 'Arctic Frost',
      floor: '#f0f7fd',
      plaza: '#e1f0fb',
      plazaBorder: '#c0dff5',
      gridLine: 'rgba(56, 132, 189, 0.15)',
      wallFill: '#bddbf0',
      wallHighlight: '#daeefb',
      wallLip: '#95bee0',
      wallOutline: '#6799c4',
      pillarFill: '#9ec7e5',
      pillarInner: '#d3e9f8',
      pillarOutline: '#4f86b5',
      pillarDot: '#1d6fa5',
      shadow: 'rgba(14, 65, 107, 0.09)',
      accent: '#0284c7',
      moteColor: 'rgba(14, 165, 233, 0.30)',
      moteStyle: 'crystal',
      // A minor crystalline arpeggio
      scale: [329.63, 392.0, 440.0, 523.25, 659.25, 783.99],
      bass: [110.0, 130.81, 146.83, 164.81]
    },
    {
      id: 'sakura',
      name: 'Sakura Courtyard',
      floor: '#fdf5f7',
      plaza: '#f9e8ee',
      plazaBorder: '#ecccd7',
      gridLine: 'rgba(176, 98, 126, 0.13)',
      wallFill: '#e6cad3',
      wallHighlight: '#f2dfe5',
      wallLip: '#cda6b3',
      wallOutline: '#ab7e8d',
      pillarFill: '#d8b4c0',
      pillarInner: '#f0dae2',
      pillarOutline: '#9a6879',
      pillarDot: '#9d174d',
      shadow: 'rgba(107, 33, 62, 0.08)',
      accent: '#db2777',
      moteColor: 'rgba(236, 72, 153, 0.32)',
      moteStyle: 'petal',
      // Japanese Yo pentatonic melody
      scale: [293.66, 329.63, 392.0, 440.0, 523.25, 587.33],
      bass: [146.83, 164.81, 196.0, 130.81]
    },
    {
      id: 'foundry',
      name: 'Solar Foundry',
      floor: '#f7f6f2',
      plaza: '#edeae0',
      plazaBorder: '#dad3c1',
      gridLine: 'rgba(120, 113, 98, 0.15)',
      wallFill: '#d4cec2',
      wallHighlight: '#e4dfd5',
      wallLip: '#b3aa99',
      wallOutline: '#8c8270',
      pillarFill: '#e6b85c',
      pillarInner: '#f7de9c',
      pillarOutline: '#b47812',
      pillarDot: '#78350f',
      shadow: 'rgba(54, 48, 36, 0.10)',
      accent: '#ea580c',
      moteColor: 'rgba(234, 88, 12, 0.26)',
      moteStyle: 'ember',
      // E minor punchy industrial synth
      scale: [329.63, 392.0, 440.0, 493.88, 587.33, 659.25],
      bass: [164.81, 164.81, 196.0, 146.83]
    }
  ];

  // ==================== PROCEDURAL WEB AUDIO ENGINE ====================
  const SoundEngine = (() => {
    let audioCtx = null;
    let masterGain = null;
    let bgmGain = null;
    let sfxGain = null;
    let noiseBuffer = null;

    let bgmEnabled = true;
    let sfxEnabled = true;
    let bgmInterval = null;
    let bgmStep = 0;
    let lastAccelTime = new Map();
    let lastDodgeTime = 0;

    function ensureContext() {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.72;
        masterGain.connect(audioCtx.destination);

        bgmGain = audioCtx.createGain();
        bgmGain.gain.value = bgmEnabled ? 0.15 : 0;
        bgmGain.connect(masterGain);

        sfxGain = audioCtx.createGain();
        sfxGain.gain.value = sfxEnabled ? 0.52 : 0;
        sfxGain.connect(masterGain);

        // Pre-build reusable 1s white noise buffer for explosions, dodges, hi-hats
        const sampleRate = audioCtx.sampleRate;
        noiseBuffer = audioCtx.createBuffer(1, sampleRate, sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < sampleRate; i++) {
          data[i] = Math.random() * 2 - 1;
        }
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      return audioCtx;
    }

    function unlock() {
      const c = ensureContext();
      if (c && screenMode === 'arena' && !isPaused && !matchOver && bgmEnabled && !bgmInterval) {
        startBgm();
      }
    }

    function setBgmEnabled(val) {
      bgmEnabled = val;
      if (bgmGain && audioCtx) {
        bgmGain.gain.setTargetAtTime(val ? 0.15 : 0, audioCtx.currentTime, 0.04);
      }
      if (val && screenMode === 'arena' && !isPaused && !matchOver) {
        startBgm();
      } else if (!val) {
        stopBgm();
      }
    }

    function setSfxEnabled(val) {
      sfxEnabled = val;
      if (sfxGain && audioCtx) {
        sfxGain.gain.setTargetAtTime(val ? 0.52 : 0, audioCtx.currentTime, 0.02);
      }
    }

    function scheduleBgmStep() {
      if (!bgmEnabled || !audioCtx || audioCtx.state !== 'running') return;
      if (screenMode !== 'arena' || isPaused || matchOver) return;

      const t = audioCtx.currentTime + 0.03;
      const theme = currentTheme || MAZE_THEMES[0];
      const step = bgmStep % 16;
      const bar = Math.floor(bgmStep / 16) % 4;
      const bassFreq = theme.bass[bar % theme.bass.length];

      // 1. Soft punchy kick on beats 0, 4, 8, 12
      if (step % 4 === 0) {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(118, t);
        osc.frequency.exponentialRampToValueAtTime(42, t + 0.11);
        g.gain.setValueAtTime(0.42, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        osc.connect(g).connect(bgmGain);
        osc.start(t);
        osc.stop(t + 0.15);
      }

      // 2. Crisp light hi-hat on off-beats
      if (step % 2 === 1 && noiseBuffer) {
        const src = audioCtx.createBufferSource();
        src.buffer = noiseBuffer;
        const hp = audioCtx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 6800;
        const g = audioCtx.createGain();
        g.gain.setValueAtTime(step % 4 === 3 ? 0.11 : 0.06, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
        src.connect(hp).connect(g).connect(bgmGain);
        src.start(t);
        src.stop(t + 0.05);
      }

      // 3. Driving synth bassline on steps 0, 3, 6, 8, 11, 14
      if (step === 0 || step === 3 || step === 6 || step === 8 || step === 11 || step === 14) {
        const osc = audioCtx.createOscillator();
        const lp = audioCtx.createBiquadFilter();
        const g = audioCtx.createGain();
        osc.type = 'triangle';
        const oct = step === 6 || step === 14 ? 1.5 : 1;
        osc.frequency.setValueAtTime(bassFreq * oct, t);
        lp.type = 'lowpass';
        lp.frequency.value = 520;
        g.gain.setValueAtTime(0.28, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
        osc.connect(lp).connect(g).connect(bgmGain);
        osc.start(t);
        osc.stop(t + 0.18);
      }

      // 4. Melodic themed arpeggio pluck
      const arpPattern = [0, -1, 2, 1, 3, -1, 4, 2, 5, -1, 3, 4, 2, -1, 1, 0];
      const noteIdx = arpPattern[step];
      if (noteIdx >= 0) {
        const freq = theme.scale[(noteIdx + bar) % theme.scale.length];
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = theme.id === 'arctic' || theme.id === 'sakura' ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.14, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
        osc.connect(g).connect(bgmGain);
        osc.start(t);
        osc.stop(t + 0.2);
      }

      bgmStep++;
    }

    function startBgm() {
      if (!bgmEnabled) return;
      ensureContext();
      stopBgm();
      const baseMs = 155; // ~97 BPM sixteenth-note feel
      const speedFactor = clamp(0.82 + matchSpeed * 0.18, 0.78, 1.25);
      bgmInterval = setInterval(scheduleBgmStep, Math.round(baseMs / speedFactor));
    }

    function stopBgm() {
      if (bgmInterval) {
        clearInterval(bgmInterval);
        bgmInterval = null;
      }
    }

    function refreshBgmTempo() {
      if (bgmInterval && bgmEnabled) {
        startBgm();
      }
    }

    // ---- SOUND EFFECTS ----
    function playShoot(isPlayer, skinId = 'default') {
      if (!sfxEnabled) return;
      const c = ensureContext();
      if (!c) return;
      const t = c.currentTime;

      const skin = isPlayer ? 'player' : (skinId || 'default');
      const profiles = {
        player: { wave: 'sawtooth', fStart: 420, fEnd: 105, lpStart: 2200, lpEnd: 300, vol: 0.34, dur: 0.13, harm: 0 },
        gemini: { wave: 'sine', fStart: 620, fEnd: 240, lpStart: 2800, lpEnd: 520, vol: 0.24, dur: 0.13, harm: 1.5 },
        claude: { wave: 'triangle', fStart: 480, fEnd: 190, lpStart: 1900, lpEnd: 380, vol: 0.26, dur: 0.12, harm: 0 },
        chatgpt: { wave: 'square', fStart: 560, fEnd: 210, lpStart: 1550, lpEnd: 360, vol: 0.17, dur: 0.11, harm: 0 },
        grok: { wave: 'sawtooth', fStart: 700, fEnd: 140, lpStart: 2400, lpEnd: 340, vol: 0.21, dur: 0.10, harm: 0 },
        deepseek: { wave: 'triangle', fStart: 360, fEnd: 120, lpStart: 1450, lpEnd: 260, vol: 0.26, dur: 0.14, harm: 0.5 },
        default: { wave: 'triangle', fStart: 540, fEnd: 160, lpStart: 1700, lpEnd: 320, vol: 0.22, dur: 0.12, harm: 0 }
      };
      const pr = profiles[skin] || profiles.default;

      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = pr.wave;
      osc.frequency.setValueAtTime(pr.fStart, t);
      osc.frequency.exponentialRampToValueAtTime(pr.fEnd, t + pr.dur);

      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(pr.lpStart, t);
      lp.frequency.exponentialRampToValueAtTime(pr.lpEnd, t + pr.dur);

      g.gain.setValueAtTime(pr.vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + pr.dur);

      osc.connect(lp).connect(g).connect(sfxGain);
      osc.start(t);
      osc.stop(t + pr.dur + 0.015);

      if (pr.harm > 0) {
        const ho = c.createOscillator();
        const hg = c.createGain();
        ho.type = 'sine';
        ho.frequency.setValueAtTime(pr.fStart * pr.harm, t);
        ho.frequency.exponentialRampToValueAtTime(pr.fEnd * pr.harm, t + pr.dur * 0.9);
        hg.gain.setValueAtTime(0.11, t);
        hg.gain.exponentialRampToValueAtTime(0.001, t + pr.dur * 0.9);
        ho.connect(hg).connect(sfxGain);
        ho.start(t);
        ho.stop(t + pr.dur);
      }

      // Mechanical crisp pop transient
      if (noiseBuffer) {
        const n = c.createBufferSource();
        n.buffer = noiseBuffer;
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = isPlayer ? 1600 : 2100;
        const ng = c.createGain();
        ng.gain.setValueAtTime(isPlayer ? 0.22 : 0.14, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
        n.connect(bp).connect(ng).connect(sfxGain);
        n.start(t);
        n.stop(t + 0.05);
      }
    }

    function playBounce(bounceNum, isPillar = false) {
      if (!sfxEnabled) return;
      const c = ensureContext();
      if (!c) return;
      const t = c.currentTime;

      // Ascending resonant ricochet pitch for Bounce 1, 2, 3!
      const pitches = [587.33, 739.99, 880.0, 1046.5];
      const baseFreq = pitches[clamp(bounceNum - 1, 0, pitches.length - 1)] * (isPillar ? 1.18 : 1);

      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = isPillar ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.24, t + 0.075);

      g.gain.setValueAtTime(isPillar ? 0.30 : 0.22, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (isPillar ? 0.18 : 0.11));

      osc.connect(g).connect(sfxGain);
      osc.start(t);
      osc.stop(t + (isPillar ? 0.19 : 0.12));

      // Sparkling overtone on reinforced pillar bounce
      if (isPillar) {
        const o2 = c.createOscillator();
        const g2 = c.createGain();
        o2.type = 'sine';
        o2.frequency.setValueAtTime(baseFreq * 1.5, t);
        g2.gain.setValueAtTime(0.18, t);
        g2.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o2.connect(g2).connect(sfxGain);
        o2.start(t);
        o2.stop(t + 0.23);
      }
    }

    function playWallThud() {
      if (!sfxEnabled) return;
      const c = ensureContext();
      if (!c) return;
      const t = c.currentTime;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.06);
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      osc.connect(g).connect(sfxGain);
      osc.start(t);
      osc.stop(t + 0.08);
    }

    function playAccel(botId, reverse = false) {
      if (!sfxEnabled) return;
      const c = ensureContext();
      if (!c) return;
      const now = c.currentTime;
      const prev = lastAccelTime.get(botId) || 0;
      if (now - prev < 0.38) return; // keep engine rev tactile, never noisy
      lastAccelTime.set(botId, now);

      const osc = c.createOscillator();
      const lp = c.createBiquadFilter();
      const g = c.createGain();

      osc.type = 'sawtooth';
      const f1 = reverse ? 92 : 74;
      const f2 = reverse ? 70 : 138;
      osc.frequency.setValueAtTime(f1, now);
      osc.frequency.exponentialRampToValueAtTime(f2, now + 0.14);

      lp.type = 'lowpass';
      lp.frequency.value = 340;

      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.13, now + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

      osc.connect(lp).connect(g).connect(sfxGain);
      osc.start(now);
      osc.stop(now + 0.18);
    }

    function playDodge() {
      if (!sfxEnabled) return;
      const c = ensureContext();
      if (!c) return;
      const now = c.currentTime;
      if (now - lastDodgeTime < 0.32) return;
      lastDodgeTime = now;

      // Crisp dash-zip + air whoosh
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(270, now);
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.11);
      g.gain.setValueAtTime(0.15, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
      osc.connect(g).connect(sfxGain);
      osc.start(now);
      osc.stop(now + 0.14);

      if (noiseBuffer) {
        const n = c.createBufferSource();
        n.buffer = noiseBuffer;
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(900, now);
        bp.frequency.exponentialRampToValueAtTime(2400, now + 0.12);
        const ng = c.createGain();
        ng.gain.setValueAtTime(0.14, now);
        ng.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        n.connect(bp).connect(ng).connect(sfxGain);
        n.start(now);
        n.stop(now + 0.13);
      }
    }

    function playHit() {
      if (!sfxEnabled) return;
      const c = ensureContext();
      if (!c) return;
      const t = c.currentTime;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(210, t);
      osc.frequency.exponentialRampToValueAtTime(68, t + 0.11);
      g.gain.setValueAtTime(0.24, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(g).connect(sfxGain);
      osc.start(t);
      osc.stop(t + 0.13);
    }

    function playEliminate() {
      if (!sfxEnabled) return;
      const c = ensureContext();
      if (!c) return;
      const t = c.currentTime;

      // 1. Deep sub-bass boom
      const sub = c.createOscillator();
      const subG = c.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(145, t);
      sub.frequency.exponentialRampToValueAtTime(28, t + 0.48);
      subG.gain.setValueAtTime(0.55, t);
      subG.gain.exponentialRampToValueAtTime(0.001, t + 0.52);
      sub.connect(subG).connect(sfxGain);
      sub.start(t);
      sub.stop(t + 0.54);

      // 2. Filtered explosion roar
      if (noiseBuffer) {
        const n = c.createBufferSource();
        n.buffer = noiseBuffer;
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1800, t);
        lp.frequency.exponentialRampToValueAtTime(160, t + 0.45);
        const ng = c.createGain();
        ng.gain.setValueAtTime(0.42, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.46);
        n.connect(lp).connect(ng).connect(sfxGain);
        n.start(t);
        n.stop(t + 0.48);
      }

      // 3. Descending robotic shutdown sweep
      const down = c.createOscillator();
      const downG = c.createGain();
      down.type = 'sawtooth';
      down.frequency.setValueAtTime(480, t + 0.04);
      down.frequency.exponentialRampToValueAtTime(85, t + 0.42);
      downG.gain.setValueAtTime(0.18, t + 0.04);
      downG.gain.exponentialRampToValueAtTime(0.001, t + 0.44);
      down.connect(downG).connect(sfxGain);
      down.start(t + 0.04);
      down.stop(t + 0.45);
    }

    function playReloadTick() {
      if (!sfxEnabled) return;
      const c = ensureContext();
      if (!c) return;
      const t = c.currentTime;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(860, t);
      osc.frequency.exponentialRampToValueAtTime(1180, t + 0.045);
      g.gain.setValueAtTime(0.11, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
      osc.connect(g).connect(sfxGain);
      osc.start(t);
      osc.stop(t + 0.06);
    }

    function playVictory() {
      if (!sfxEnabled) return;
      const c = ensureContext();
      if (!c) return;
      const t = c.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'triangle';
        const st = t + i * 0.11;
        osc.frequency.setValueAtTime(freq, st);
        g.gain.setValueAtTime(0.24, st);
        g.gain.exponentialRampToValueAtTime(0.001, st + 0.34);
        osc.connect(g).connect(sfxGain);
        osc.start(st);
        osc.stop(st + 0.36);
      });
    }

    function playPowerupSpawn() {
      if (!sfxEnabled) return;
      const c = ensureContext();
      if (!c) return;
      const t = c.currentTime;
      [659.25, 987.77].forEach((freq, i) => {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'sine';
        const st = t + i * 0.065;
        osc.frequency.setValueAtTime(freq, st);
        g.gain.setValueAtTime(0.14, st);
        g.gain.exponentialRampToValueAtTime(0.001, st + 0.18);
        osc.connect(g).connect(sfxGain);
        osc.start(st);
        osc.stop(st + 0.2);
      });
    }

    function playPowerupPickup() {
      if (!sfxEnabled) return;
      const c = ensureContext();
      if (!c) return;
      const t = c.currentTime;
      [523.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'triangle';
        const st = t + i * 0.055;
        osc.frequency.setValueAtTime(freq, st);
        g.gain.setValueAtTime(0.22, st);
        g.gain.exponentialRampToValueAtTime(0.001, st + 0.16);
        osc.connect(g).connect(sfxGain);
        osc.start(st);
        osc.stop(st + 0.18);
      });
    }

    function playLaser() {
      if (!sfxEnabled) return;
      const c = ensureContext();
      if (!c) return;
      const t = c.currentTime;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(1480, t);
      osc.frequency.exponentialRampToValueAtTime(190, t + 0.32);
      g.gain.setValueAtTime(0.32, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
      osc.connect(g).connect(sfxGain);
      osc.start(t);
      osc.stop(t + 0.36);

      const o2 = c.createOscillator();
      const g2 = c.createGain();
      o2.type = 'sine';
      o2.frequency.setValueAtTime(2200, t);
      o2.frequency.exponentialRampToValueAtTime(420, t + 0.22);
      g2.gain.setValueAtTime(0.2, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      o2.connect(g2).connect(sfxGain);
      o2.start(t);
      o2.stop(t + 0.25);
    }

    function playShieldBlock() {
      if (!sfxEnabled) return;
      const c = ensureContext();
      if (!c) return;
      const t = c.currentTime;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, t);
      osc.frequency.exponentialRampToValueAtTime(340, t + 0.14);
      g.gain.setValueAtTime(0.24, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(g).connect(sfxGain);
      osc.start(t);
      osc.stop(t + 0.17);
    }

    function playReflect() {
      if (!sfxEnabled) return;
      const c = ensureContext();
      if (!c) return;
      const t = c.currentTime;
      [880, 1318.5].forEach((freq, i) => {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + i * 0.025);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.35, t + 0.16);
        g.gain.setValueAtTime(0.24, t + i * 0.025);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.connect(g).connect(sfxGain);
        osc.start(t + i * 0.025);
        osc.stop(t + 0.22);
      });
    }

    function playTrapTrigger() {
      if (!sfxEnabled) return;
      const c = ensureContext();
      if (!c) return;
      const t = c.currentTime;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(340, t);
      osc.frequency.exponentialRampToValueAtTime(58, t + 0.28);
      g.gain.setValueAtTime(0.36, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(g).connect(sfxGain);
      osc.start(t);
      osc.stop(t + 0.32);

      if (noiseBuffer) {
        const n = c.createBufferSource();
        n.buffer = noiseBuffer;
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1100;
        const ng = c.createGain();
        ng.gain.setValueAtTime(0.28, t);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        n.connect(bp).connect(ng).connect(sfxGain);
        n.start(t);
        n.stop(t + 0.24);
      }
    }

    function playAimbotLock() {
      if (!sfxEnabled) return;
      const c = ensureContext();
      if (!c) return;
      const t = c.currentTime;
      [987.77, 1479.98].forEach((freq, i) => {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'sine';
        const st = t + i * 0.032;
        osc.frequency.setValueAtTime(freq, st);
        g.gain.setValueAtTime(0.18, st);
        g.gain.exponentialRampToValueAtTime(0.001, st + 0.11);
        osc.connect(g).connect(sfxGain);
        osc.start(st);
        osc.stop(st + 0.12);
      });
    }

    function playRegen() {
      if (!sfxEnabled) return;
      const c = ensureContext();
      if (!c) return;
      const t = c.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'triangle';
        const st = t + i * 0.045;
        osc.frequency.setValueAtTime(freq, st);
        g.gain.setValueAtTime(0.20, st);
        g.gain.exponentialRampToValueAtTime(0.001, st + 0.22);
        osc.connect(g).connect(sfxGain);
        osc.start(st);
        osc.stop(st + 0.24);
      });
    }

    function playSpecialWall(tileType) {
      if (!sfxEnabled) return;
      const c = ensureContext();
      if (!c) return;
      const t = c.currentTime;
      const notes = tileType === 3
        ? [587.33, 880, 1174.66]     // cyan range chime
        : tileType === 4
        ? [440, 659.25, 1318.5]      // amber turbo zip
        : [523.25, 783.99, 987.77];  // violet 3-way split triad
      notes.forEach((freq, i) => {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = tileType === 4 ? 'sawtooth' : 'sine';
        const st = t + i * 0.025;
        osc.frequency.setValueAtTime(freq, st);
        if (tileType === 4) osc.frequency.exponentialRampToValueAtTime(freq * 1.35, st + 0.12);
        g.gain.setValueAtTime(tileType === 4 ? 0.12 : 0.19, st);
        g.gain.exponentialRampToValueAtTime(0.001, st + 0.15);
        osc.connect(g).connect(sfxGain);
        osc.start(st);
        osc.stop(st + 0.16);
      });
    }

    function playBankKill() {
      if (!sfxEnabled) return;
      const c = ensureContext();
      if (!c) return;
      const t = c.currentTime;
      [659.25, 987.77, 1318.5].forEach((freq, i) => {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'triangle';
        const st = t + i * 0.055;
        osc.frequency.setValueAtTime(freq, st);
        g.gain.setValueAtTime(0.22, st);
        g.gain.exponentialRampToValueAtTime(0.001, st + 0.22);
        osc.connect(g).connect(sfxGain);
        osc.start(st);
        osc.stop(st + 0.24);
      });
    }

    return {
      unlock,
      startBgm,
      stopBgm,
      refreshBgmTempo,
      setBgmEnabled,
      setSfxEnabled,
      isBgmEnabled: () => bgmEnabled,
      isSfxEnabled: () => sfxEnabled,
      playShoot,
      playBounce,
      playWallThud,
      playAccel,
      playDodge,
      playHit,
      playEliminate,
      playReloadTick,
      playVictory,
      playPowerupSpawn,
      playPowerupPickup,
      playLaser,
      playShieldBlock,
      playReflect,
      playTrapTrigger,
      playAimbotLock,
      playRegen,
      playSpecialWall,
      playBankKill
    };
  })();

  // ==================== RANDOM ARENA POWER-UPS (SPAWN EVERY 5-10s) ====================
  const POWERUP_TYPES = {
    piercing: {
      id: 'piercing',
      name: 'Piercing Shot',
      label: 'PIERCE',
      color: '#7c3aed',
      soft: '#f3e8ff',
      charges: 2,
      speech: 'PIERCING LOADED!'
    },
    penetrate: {
      id: 'penetrate',
      name: 'Wall Penetrate',
      label: 'PENETRATE',
      color: '#ea580c',
      soft: '#ffedd5',
      charges: 2,
      speech: 'WALL BREAKER!'
    },
    speed: {
      id: 'speed',
      name: 'Speed Up',
      label: 'SPEED+',
      color: '#0284c7',
      soft: '#e0f2fe',
      duration: 7.0,
      speech: 'TURBO BOOST!'
    },
    ultra_ricochet: {
      id: 'ultra_ricochet',
      name: 'Ultra Long Ricochet',
      label: 'ULTRA RICOCHET',
      color: '#d97706',
      soft: '#fef3c7',
      charges: 2,
      speech: 'ULTRA RICOCHET!'
    },
    laser: {
      id: 'laser',
      name: 'Laser Beam',
      label: 'LASER',
      color: '#e11d48',
      soft: '#ffe4e6',
      charges: 1,
      speech: 'LASER CHARGED!'
    },
    shield: {
      id: 'shield',
      name: 'Energy Shield',
      label: 'SHIELD',
      color: '#0d9488',
      soft: '#ccfbf1',
      duration: 10.0,
      shieldHp: 45,
      speech: 'SHIELD UP!'
    },
    trap: {
      id: 'trap',
      name: 'Shock Trap',
      label: 'TRAP',
      color: '#65a30d',
      soft: '#ecfccb',
      speech: 'TRAP DEPLOYED!'
    },
    reflect_shield: {
      id: 'reflect_shield',
      name: 'Reflective Shield',
      label: 'REFLECT',
      color: '#6366f1',
      soft: '#e0e7ff',
      duration: 6.0,
      speech: 'MIRROR SHIELD!'
    }
  };
  const POWERUP_LIST = Object.values(POWERUP_TYPES);

  // ==================== AI MODEL ROSTER & SAMPLE BOTS ====================
  const AI_MODEL_NAMES = ['Gemini', 'Grok', 'ChatGPT', 'Claude', 'DeepSeek'];

  const SAMPLE_CODE_BOTS = [
    {
      id: 'sample-hunter',
      label: 'Example 1: Apex Interceptor (Lead Hunter)',
      source: `const BOT = {
  name: "Apex-JS",
  author: "Sample · Lead Hunter",
  algorithm: "1. Threat Scan & Dodge: Inspects all incoming enemy bullets within 170px using perpendicular miss distance and closing time; if a bullet will hit within 1.1s, reverses or turns perpendicular with LiDAR clearance check.\\n2. Pathfinding Pursuit: Uses state.maze.findPath() to navigate corridor centers toward the lowest-HP / closest enemy while avoiding wall snags.\\n3. Fixed-Forward Lead Aiming: Predicts enemy position (pos + vel * flightTime), verifies clear line of sight, slows down slightly to align chassis tightly (< 0.08 rad), and conserves the last bullet unless within 270px or enemy is low HP.",
  thoughts: "Because every bot has a fixed-forward cannon and only 3 bullets reloading at 1.5s each, spraying shots is fatal — you get caught empty while reloading. I designed Apex-JS to treat ammo as a scarce resource: navigate aggressively with A*, align the chassis smoothly onto a velocity-predicted lead point, and only pull the trigger when hit probability is high.",
  think(state) {
    const { me, enemies, bullets, maze, rules, memory } = state;
    const norm = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
    const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

    // 1. Dodge incoming bullets
    for (const b of bullets) {
      if (b.ownerId === me.id) continue;
      const rx = me.x - b.x, ry = me.y - b.y;
      const d = Math.hypot(rx, ry);
      if (d > 175 || d < 1) continue;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const dx = b.vx / sp, dy = b.vy / sp;
      const along = rx * dx + ry * dy;
      if (along < 0 || along / sp > 1.15) continue;
      const perp = rx * (-dy) + ry * dx;
      if (Math.abs(perp) < me.radius + 20 && maze.hasLineOfSight(b.x, b.y, me.x, me.y)) {
        const escapeAngle = Math.atan2(dx * (perp >= 0 ? 1 : -1), -dy * (perp >= 0 ? 1 : -1));
        const diff = norm(escapeAngle - me.angle);
        return { throttle: Math.abs(diff) > 1.6 ? -1 : 1, turn: Math.max(-1, Math.min(1, diff * 2.5)), fire: false, say: "DODGING!" };
      }
    }

    if (!enemies.length) return { throttle: 0.4, turn: 0.5, fire: false };

    // 2. Pick best target (visible + low HP weighted)
    let target = enemies[0];
    let bestScore = -1e9;
    for (const e of enemies) {
      const s = (e.visible ? 160 : 0) - e.dist + (rules.maxHp - e.hp) * 2.2;
      if (s > bestScore) { bestScore = s; target = e; }
    }

    // 3. If empty ammo, back off cleanly
    if (me.ammo === 0) {
      const away = Math.atan2(me.y - target.y, me.x - target.x);
      const diff = norm(away - me.angle);
      return { throttle: 0.9, turn: Math.max(-1, Math.min(1, diff * 2.2)), fire: false };
    }

    // 4. Direct LOS lead shot
    if (target.visible) {
      const flight = Math.min(1.4, target.dist / rules.bulletSpeed);
      const px = target.x + target.vx * flight * 0.82;
      const py = target.y + target.vy * flight * 0.82;
      const aimAngle = Math.atan2(py - me.y, px - me.x);
      const err = norm(aimAngle - me.angle);
      const clear = maze.hasLineOfSight(me.x, me.y, px, py);
      const maxShootDist = me.ammo === 1 ? (target.hp <= rules.bulletDamage * 2 ? 430 : 270) : 390;

      if (clear && target.dist <= maxShootDist && me.fireCooldown <= 0.35) {
        const readyToFire = Math.abs(err) < 0.08 && me.fireCooldown <= 0;
        return {
          throttle: target.dist < 105 ? -0.4 : (Math.abs(err) < 0.35 ? 0.65 : 0.15),
          turn: Math.max(-1, Math.min(1, err * 3.2)),
          fire: readyToFire,
          say: readyToFire && me.ammo === 1 ? "LAST SHOT!" : undefined
        };
      }
    }

    // 5. Navigate via built-in A* pathfinder
    if (!memory.path || !memory.path.length || state.time - (memory.pathAt || 0) > 0.45) {
      memory.path = maze.findPath(me.x, me.y, target.x, target.y);
      memory.pathAt = state.time;
    }
    while (memory.path.length > 1 && dist(me.x, me.y, memory.path[0].x, memory.path[0].y) < 22) {
      memory.path.shift();
    }
    const wp = memory.path[0] || target;
    const steer = norm(Math.atan2(wp.y - me.y, wp.x - me.x) - me.angle);
    return {
      throttle: Math.abs(steer) > 1.3 ? 0.2 : 1.0,
      turn: Math.max(-1, Math.min(1, steer * 2.6)),
      fire: false
    };
  }
};`
    },
    {
      id: 'sample-ricochet',
      label: 'Example 2: Prism Angle (Ricochet Mathematician)',
      source: `const BOT = {
  name: "Prism-JS",
  author: "Sample · Ricochet Math",
  algorithm: "1. 1-Bounce Ray Solver: Sweeps 36 angles using state.maze.castRay() and mirrors each wall hit across the wall normal to find real bank shots around corners — prioritizing bounces off central reinforced pillars (isPillar) for the +15% damage & +8% speed boost!\\n2. Safe Corner Holding: When a bank shot is found while out of enemy line of sight, brakes and rotates the chassis cleanly onto the reflection angle to strike without taking return fire.\\n3. Fallback A* Hunting: Advances toward mid-range corners around enemies when no bank shot is available.",
  thoughts: "Direct corridor duels trade HP 1-for-1, which is risky in a 4-bot battle. By exploiting the arena's up-to-3 wall bounce physics and reinforced central pillar supercharge, Prism-JS can deal damage around cover while staying completely shielded from direct enemy sightlines.",
  think(state) {
    const { me, enemies, maze, rules, memory } = state;
    const norm = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
    if (!enemies.length) return { throttle: 0.3, turn: 0.4, fire: false };

    const target = enemies.reduce((a, b) => (a.dist < b.dist ? a : b));

    // Probe for a 1-bounce bank shot every 0.18s
    if (me.ammo > 0 && state.time - (memory.probeAt || 0) > 0.18) {
      memory.probeAt = state.time;
      memory.bankAngle = null;
      memory.bankPillar = false;
      const steps = 36;
      let bestScore = -1e9;
      for (let i = 0; i < steps; i++) {
        const ang = (i / steps) * Math.PI * 2;
        const h1 = maze.castRay(me.x, me.y, ang, Math.min(340, rules.maxRange - 60));
        if (!h1.hit || h1.dist < 22) continue;
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const rdx = h1.nx !== 0 ? -dx : dx;
        const rdy = h1.ny !== 0 ? -dy : dy;
        const rAng = Math.atan2(rdy, rdx);
        const rem = rules.maxRange - h1.dist - 20;
        const h2 = maze.castRay(h1.x + h1.nx, h1.y + h1.ny, rAng, rem);

        for (const e of enemies) {
          const ex = e.x - h1.x, ey = e.y - h1.y;
          const proj = ex * rdx + ey * rdy;
          if (proj < 10 || proj > h2.dist) continue;
          const perp = Math.abs(ex * (-rdy) + ey * rdx);
          if (perp < me.radius + 7) {
            const sc = (h1.isPillar ? 220 : 120) - (h1.dist + proj) * 0.25 + (!e.visible ? 90 : 0);
            if (sc > bestScore) {
              bestScore = sc;
              memory.bankAngle = ang;
              memory.bankPillar = h1.isPillar;
            }
          }
        }
      }
    }

    // Execute bank shot if found!
    if (me.ammo > 0 && memory.bankAngle !== null && (!target.visible || memory.bankPillar)) {
      const err = norm(memory.bankAngle - me.angle);
      const fire = Math.abs(err) < 0.065 && me.fireCooldown <= 0;
      return {
        throttle: 0.05,
        turn: Math.max(-1, Math.min(1, err * 3.5)),
        fire,
        say: fire ? (memory.bankPillar ? "PILLAR BOOST!" : "CALCULATED!") : undefined
      };
    }

    // Direct shot if visible & in safe range
    if (me.ammo > 0 && target.visible && target.dist < 380) {
      const aim = Math.atan2(target.y - me.y, target.x - me.x);
      const err = norm(aim - me.angle);
      const fire = Math.abs(err) < 0.075 && me.fireCooldown <= 0 && (me.ammo >= 2 || target.dist < 250);
      return {
        throttle: target.dist < 140 ? -0.6 : 0.35,
        turn: Math.max(-1, Math.min(1, err * 3.0)),
        fire
      };
    }

    // Move toward target via A*
    if (!memory.path || !memory.path.length || state.time - (memory.pathAt || 0) > 0.5) {
      memory.path = maze.findPath(me.x, me.y, target.x, target.y);
      memory.pathAt = state.time;
    }
    while (memory.path.length > 1 && Math.hypot(memory.path[0].x - me.x, memory.path[0].y - me.y) < 22) {
      memory.path.shift();
    }
    const wp = memory.path[0] || target;
    const steer = norm(Math.atan2(wp.y - me.y, wp.x - me.x) - me.angle);
    return {
      throttle: Math.abs(steer) > 1.2 ? 0.2 : 0.9,
      turn: Math.max(-1, Math.min(1, steer * 2.5)),
      fire: false
    };
  }
};`
    },
    {
      id: 'sample-evader',
      label: 'Example 3: Ghost Sentinel (Kiting Counter-Sniper)',
      source: `const BOT = {
  name: "Ghost-JS",
  author: "Sample · Counter-Sniper",
  algorithm: "1. High-Sensitivity Evasion: Scans all enemy bullets within 220px and dashes perpendicular to any threat vector before it arrives.\\n2. Reverse Kiting: When an enemy gets within 220px in direct line of sight, drives in reverse while keeping its fixed-forward nose locked onto the enemy — forcing pursuers to chase straight into incoming shots!\\n3. Patience Discipline: Holds fire when ammo is 1 unless enemy HP <= 36 or range < 230px.",
  thoughts: "With fixed-forward cannons, reversing while facing an aggressive rusher is a massive tactical advantage: you maintain full aiming alignment while opening distance and avoiding close-quarters trades. Surviving early skirmishes with high HP gives Ghost-JS a huge edge in the final 1v1.",
  think(state) {
    const { me, enemies, bullets, maze, rules, memory } = state;
    const norm = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

    // 1. High-priority bullet evasion
    for (const b of bullets) {
      if (b.ownerId === me.id) continue;
      const rx = me.x - b.x, ry = me.y - b.y;
      const d = Math.hypot(rx, ry);
      if (d > 220 || d < 1) continue;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const dx = b.vx / sp, dy = b.vy / sp;
      const along = rx * dx + ry * dy;
      if (along < 0 || along / sp > 1.35) continue;
      const perp = rx * (-dy) + ry * dx;
      if (Math.abs(perp) < me.radius + 26 && maze.hasLineOfSight(b.x, b.y, me.x, me.y)) {
        const side = perp >= 0 ? 1 : -1;
        const esc = Math.atan2(dx * side, -dy * side);
        const diff = norm(esc - me.angle);
        return { throttle: Math.abs(diff) > 1.57 ? -1 : 1, turn: Math.max(-1, Math.min(1, diff * 2.8)), fire: false, say: "SLIPPED!" };
      }
    }

    if (!enemies.length) return { throttle: 0, turn: 0.3, fire: false };

    const visible = enemies.filter(e => e.visible);
    const target = (visible.length ? visible : enemies).reduce((a, b) => (a.dist < b.dist ? a : b));

    // 2. Reverse-kite while facing visible enemy!
    if (target.visible) {
      const flight = Math.min(1.4, target.dist / rules.bulletSpeed);
      const px = target.x + target.vx * flight * 0.9;
      const py = target.y + target.vy * flight * 0.9;
      const aim = Math.atan2(py - me.y, px - me.x);
      const err = norm(aim - me.angle);

      const canFire =
        me.ammo > 0 &&
        me.fireCooldown <= 0 &&
        Math.abs(err) < 0.065 &&
        maze.hasLineOfSight(me.x, me.y, px, py) &&
        (me.ammo >= 2 ? target.dist < 470 : (target.hp <= 36 || target.dist < 240));

      let throttle = 0;
      if (target.dist < 230 || me.ammo === 0) throttle = -0.95; // reverse kite!
      else if (target.dist > 390) throttle = 0.7;

      return {
        throttle,
        turn: Math.max(-1, Math.min(1, err * 3.4)),
        fire: canFire,
        say: canFire ? "SNIPED!" : undefined
      };
    }

    // 3. Patrol toward center / enemy lane
    if (!memory.path || !memory.path.length || state.time - (memory.pathAt || 0) > 0.6) {
      memory.path = maze.findPath(me.x, me.y, target.x, target.y);
      memory.pathAt = state.time;
    }
    while (memory.path.length > 1 && Math.hypot(memory.path[0].x - me.x, memory.path[0].y - me.y) < 22) {
      memory.path.shift();
    }
    const wp = memory.path[0] || target;
    const steer = norm(Math.atan2(wp.y - me.y, wp.x - me.x) - me.angle);
    return {
      throttle: Math.abs(steer) > 1.25 ? 0.2 : 0.85,
      turn: Math.max(-1, Math.min(1, steer * 2.5)),
      fire: false
    };
  }
};`
    },
    {
      id: 'rl_evobot',
      label: 'Self-Learning RL EvoBot (Adaptive Bandit + Weights)',
      source: `const BOT = {
  name: "Gemini",
  author: "Self-Learning RL EvoBot",
  algorithm: "1. Persistent Evolutionary Brain (state.brain): Maintains tunable policy parameters (aimTolerance, leadFactor, dodgeDist, preferredRange, powerupGreed, bankBias, regenHpFrac) plus a 3-arm UCB1 Strategy Bandit (hunter, ricochet, powerup_control) persisted across matches.\\n2. Real-Time Online Learning (state.events): Every tick processes live combat events — tightening aim tolerance after misses, widening dodge radius after taking hits, and adapting to bank shots.\\n3. Cross-Match Evolution (onMatchEnd): Evaluates fitness (wins, kills, damage, accuracy, survival), reinforces the best policy, applies diagnostic mutations when losing, and logs brain.summary every generation.",
  thoughts: "Static scripts plateau quickly against evolving rivals. By pairing a UCB1 multi-armed strategy bandit with live event-driven micro-calibration and evolutionary hill-climbing in onMatchEnd(report, brain), this robot continuously adapts its shooting discipline, dodging distance, regen timing, and ricochet aggression match after match.",
  think(state) {
    const { me, enemies, bullets, powerups, traps, maze, rules, memory, brain, events } = state;
    const norm = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
    const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

    // 1. Initialize persistent self-learning brain on Generation 1
    if (!brain.initialized) {
      brain.initialized = true;
      brain.gen = 1;
      brain.weights = {
        aimTolerance: 0.10,
        leadFactor: 0.90,
        dodgeDist: 175,
        preferredRange: 245,
        powerupGreed: 0.70,
        bankBias: 0.55,
        regenHpFrac: 0.72
      };
      brain.bestFitness = -1e9;
      brain.bestWeights = { ...brain.weights };
      brain.arms = {
        hunter: { n: 0, reward: 0 },
        ricochet: { n: 0, reward: 0 },
        powerup_control: { n: 0, reward: 0 }
      };
      brain.summary = "Gen 1 initialized: baseline UCB1 bandit & tunable weights.";
    }

    // Choose strategy arm once per match using UCB1 bandit
    if (!memory.arm) {
      const names = Object.keys(brain.arms);
      const totalPlays = names.reduce((s, k) => s + brain.arms[k].n, 0) + 1;
      let bestArm = names[0], bestScore = -1e9;
      for (const k of names) {
        const a = brain.arms[k];
        const score = a.n === 0 ? 1e6 + Math.random() : (a.reward / a.n) + 0.9 * Math.sqrt(Math.log(totalPlays) / a.n);
        if (score > bestScore) { bestScore = score; bestArm = k; }
      }
      memory.arm = bestArm;
      brain.activeArm = bestArm;
      memory.liveMisses = 0;
      memory.liveHits = 0;
    }

    const w = brain.weights;

    // 2. Real-time online adaptation from live combat events!
    if (events && events.length) {
      for (const ev of events) {
        if (ev.type === 'shot_missed') {
          memory.liveMisses++;
          w.aimTolerance = Math.max(0.055, w.aimTolerance - 0.004);
        } else if (ev.type === 'hit_dealt') {
          memory.liveHits++;
          w.aimTolerance = Math.min(0.14, w.aimTolerance + 0.002);
        } else if (ev.type === 'hit_taken') {
          w.dodgeDist = Math.min(235, w.dodgeDist + 6);
          if (ev.bounces > 0) w.bankBias = Math.min(0.95, w.bankBias + 0.04);
        }
      }
    }

    // 3. Smart Regen: consume 3 ammo -> +10% current HP when safely behind cover
    const visibleEnemies = enemies.filter(e => e.visible);
    if (
      me.regenCooldown <= 0 &&
      me.ammo >= (rules.regenCost || 3) &&
      me.hp < me.maxHp * w.regenHpFrac &&
      (visibleEnemies.length === 0 || me.hp < me.maxHp * 0.42)
    ) {
      return { throttle: -0.6, turn: 0.4, fire: false, regen: true, say: "ADAPTIVE REGEN!" };
    }

    // 4. Proactive bullet dodging + enemy trap avoidance
    for (const b of bullets) {
      if (b.ownerId === me.id) continue;
      const rx = me.x - b.x, ry = me.y - b.y;
      const d = Math.hypot(rx, ry);
      if (d > w.dodgeDist || d < 1) continue;
      const bspd = Math.hypot(b.vx, b.vy) || rules.bulletSpeed;
      const bdx = b.vx / bspd, bdy = b.vy / bspd;
      const proj = rx * bdx + ry * bdy;
      if (proj < 0 || proj > w.dodgeDist) continue;
      const perp = Math.abs(rx * (-bdy) + ry * bdx);
      if (perp < 28 && proj / bspd < 1.15) {
        const side = (rx * (-bdy) + ry * bdx) >= 0 ? 1 : -1;
        const dodgeAng = Math.atan2(bdy, bdx) + side * Math.PI * 0.5;
        const err = norm(dodgeAng - me.angle);
        return {
          throttle: Math.abs(err) > 1.7 ? -0.95 : 1.0,
          turn: Math.max(-1, Math.min(1, err * 3.0)),
          fire: false
        };
      }
    }

    for (const tr of traps) {
      if (tr.ownerId === me.id || tr.dist > 54) continue;
      const away = Math.atan2(me.y - tr.y, me.x - tr.x);
      const err = norm(away - me.angle);
      return { throttle: 0.9, turn: Math.max(-1, Math.min(1, err * 2.8)), fire: false };
    }

    if (!enemies.length) return { throttle: 0.4, turn: 0.4, fire: false };

    // 5. Select target (prefer vulnerable/low-HP or visible enemy)
    const target = enemies.slice().sort((a, b) => {
      const sa = (a.visible ? 180 : 0) + (a.reloading || a.stunned ? 75 : 0) - a.dist + (1 - a.hp / (a.maxHp || 100)) * 160;
      const sb = (b.visible ? 180 : 0) + (b.reloading || b.stunned ? 75 : 0) - b.dist + (1 - b.hp / (b.maxHp || 100)) * 160;
      return sb - sa;
    })[0];

    const hasPenetrate = me.buffs.weaponType === 'penetrate' && me.buffs.weaponCharges > 0;
    const hasLaser = me.buffs.weaponType === 'laser' && me.buffs.weaponCharges > 0;
    const hasUltra = me.buffs.weaponType === 'ultra_ricochet' && me.buffs.weaponCharges > 0;
    const muzzleOk = ang => hasPenetrate || !maze.isWall(Math.floor((me.x + Math.cos(ang) * 19) / 20), Math.floor((me.y + Math.sin(ang) * 19) / 20));

    // 6. Direct Lead Aiming (or Penetrate through walls!)
    if ((target.visible || hasPenetrate) && !target.reflecting) {
      const projSpd = hasLaser ? 1e6 : hasUltra ? rules.bulletSpeed * 1.2 : rules.bulletSpeed;
      const flight = hasLaser ? 0 : Math.min(1.3, target.dist / projSpd);
      let px = target.x + target.vx * flight * w.leadFactor;
      let py = target.y + target.vy * flight * w.leadFactor;
      if (!hasPenetrate && !maze.hasLineOfSight(me.x, me.y, px, py)) { px = target.x; py = target.y; }

      const aimAng = Math.atan2(py - me.y, px - me.x);
      const err = norm(aimAng - me.angle);
      const maxRange = hasLaser ? 640 : hasUltra ? 1300 : rules.maxRange - 25;
      const readyShot =
        me.ammo > 0 && !me.reloading && me.fireCooldown <= 0 &&
        Math.abs(err) <= w.aimTolerance &&
        target.dist <= maxRange &&
        muzzleOk(me.angle);

      let throttle = 0.75;
      if (target.dist < w.preferredRange * 0.7) throttle = -0.6;
      else if (Math.abs(err) > 0.45) throttle = 0.2;

      return {
        throttle,
        turn: Math.max(-1, Math.min(1, err * 3.1)),
        fire: readyShot,
        say: readyShot && hasLaser ? "LASER!" : undefined
      };
    }

    // 7. Ricochet & Special Wall Bank Shot solver (using maze.traceShot!)
    if (me.ammo > 0 && !me.reloading && !target.reflecting && (memory.arm === 'ricochet' || w.bankBias > 0.45) && target.dist < 490) {
      if (!memory.bankAt || state.time - memory.bankAt > 0.22) {
        memory.bankAt = state.time;
        memory.bankAng = null;
        const shotRange = hasLaser ? 650 : hasUltra ? 1350 : rules.maxRange - 20;
        const shotBounces = hasLaser ? 2 : hasUltra ? 5 : Math.min(2, rules.maxBounces);
        const samples = 24;
        for (let i = 0; i < samples; i++) {
          const ang = -Math.PI + ((i + Math.random()) / samples) * Math.PI * 2;
          if (!muzzleOk(ang)) continue;
          const mx = me.x + Math.cos(ang) * 19, my = me.y + Math.sin(ang) * 19;
          const tr = maze.traceShot(mx, my, ang, shotRange, shotBounces);
          for (const seg of tr.segments) {
            if (seg.bounceIndex >= 1 && maze.segmentCircleHit(seg.x1, seg.y1, seg.x2, seg.y2, target.x, target.y, 17) !== null) {
              memory.bankAng = ang;
              break;
            }
          }
          if (memory.bankAng !== null) break;
        }
      }
      if (memory.bankAng !== null) {
        const err = norm(memory.bankAng - me.angle);
        const fireBank = Math.abs(err) < 0.08 && me.fireCooldown <= 0 && muzzleOk(me.angle);
        return {
          throttle: 0.1,
          turn: Math.max(-1, Math.min(1, err * 3.2)),
          fire: fireBank,
          say: fireBank ? "RL BANK!" : undefined
        };
      }
    }

    // 8. Objective selection: Power-Up contest vs Target pursuit
    let goal = target;
    const pMult = memory.arm === 'powerup_control' ? 1.45 : w.powerupGreed;
    if (powerups.length > 0) {
      const nearP = powerups.slice().sort((a, b) => a.dist - b.dist)[0];
      if (nearP && nearP.dist < 290 * pMult) goal = nearP;
    }

    if (!memory.path || !memory.path.length || state.time - (memory.pathAt || 0) > 0.35) {
      memory.path = maze.findPath(me.x, me.y, goal.x, goal.y);
      memory.pathAt = state.time;
    }
    while (memory.path.length > 1 && dist(me.x, me.y, memory.path[0].x, memory.path[0].y) < 22) {
      memory.path.shift();
    }
    const wp = memory.path[0] || goal;
    const steer = norm(Math.atan2(wp.y - me.y, wp.x - me.x) - me.angle);

    // Anti-stuck check
    if (!memory.lastPos || state.time - (memory.stuckAt || 0) > 0.85) {
      const moved = memory.lastPos ? dist(me.x, me.y, memory.lastPos.x, memory.lastPos.y) : 99;
      memory.lastPos = { x: me.x, y: me.y };
      memory.stuckAt = state.time;
      if (moved < 10) memory.unstuckUntil = state.time + 0.45;
    }
    if (memory.unstuckUntil && state.time < memory.unstuckUntil) {
      return { throttle: -0.9, turn: 0.9, fire: false };
    }

    return {
      throttle: Math.abs(steer) > 1.3 ? 0.15 : 0.95,
      turn: Math.max(-1, Math.min(1, steer * 2.7)),
      fire: false
    };
  },
  onMatchEnd(report, brain) {
    if (!brain.initialized) return brain;
    const armName = brain.activeArm || 'hunter';
    const arm = brain.arms[armName] || { n: 0, reward: 0 };

    // Compute match fitness reward
    const fitness =
      (report.won ? 120 : 0) +
      report.kills * 45 +
      report.damageDealt * 0.45 +
      report.accuracy * 0.6 +
      report.bankHits * 15 +
      report.powerupsCollected * 8 -
      report.damageTaken * 0.25;

    arm.n += 1;
    arm.reward += fitness;
    brain.arms[armName] = arm;

    const changes = [];
    const w = brain.weights;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

    if (fitness >= (brain.bestFitness || -1e9)) {
      brain.bestFitness = Math.round(fitness);
      brain.bestWeights = { ...w };
      changes.push("new best policy (" + armName + ", fit " + Math.round(fitness) + ")");
    } else {
      for (const k of Object.keys(w)) {
        w[k] = w[k] * 0.35 + brain.bestWeights[k] * 0.65;
      }
      if (report.accuracy < 38 && report.shotsFired >= 3) {
        w.aimTolerance = clamp(w.aimTolerance - 0.012, 0.055, 0.14);
        w.leadFactor = clamp(w.leadFactor + (Math.random() - 0.5) * 0.14, 0.72, 1.08);
        changes.push("tightened aimTol=" + w.aimTolerance.toFixed(3));
      }
      if (report.directHitsTaken >= 3 && report.closeDodges < 3) {
        w.dodgeDist = clamp(Math.round(w.dodgeDist + 16), 150, 240);
        w.preferredRange = clamp(Math.round(w.preferredRange + 22), 180, 340);
        changes.push("raised dodgeDist=" + w.dodgeDist);
      }
      if (report.powerupsCollected === 0) {
        w.powerupGreed = clamp(w.powerupGreed + 0.12, 0.4, 1.25);
        changes.push("boosted powerupGreed=" + w.powerupGreed.toFixed(2));
      }
      if (report.regenUses === 0 && report.damageTaken >= 35) {
        w.regenHpFrac = clamp(w.regenHpFrac + 0.07, 0.55, 0.88);
        changes.push("earlier regen=" + Math.round(w.regenHpFrac * 100) + "%");
      }
      if (!changes.length) {
        w.bankBias = clamp(w.bankBias + (Math.random() - 0.5) * 0.18, 0.25, 0.95);
        changes.push("explored bankBias=" + w.bankBias.toFixed(2));
      }
    }

    brain.gen = (brain.gen || 1) + 1;
    brain.summary = "Gen " + brain.gen + " [" + armName + "]: " + changes.join(", ");
    return brain;
  }
};`
    }
  ];

  // ==================== DYNAMIC COPYABLE AI PROMPT GENERATOR ====================
  function generateAIPrompt() {
    const r = arenaRules;
    const fogLine = r.fogOfWar
      ? 'ON — `state.enemies` ONLY contains enemies currently within 580px AND in direct Line-of-Sight. Use `state.memory` to remember last-seen positions & patrol corridors when no enemy is visible!'
      : 'OFF — `state.enemies` contains ALL living enemies on the map (each has a boolean `visible` Line-of-Sight flag within 580px).';
    const pillarDmg = Math.round(r.bulletDamage * 1.15);
    const ultraSpeed = Math.round(r.bulletSpeed * 1.2);
    const ultraRange = Math.max(1450, Math.round(r.maxRange * 2.5));
    const ultraBounces = Math.max(8, r.maxBounces + 5);

    return `You are competing in **Maze Bots**, a top-down 2D autonomous robot maze battle arena!
Your mission is to engineer a championship-grade JavaScript robot that fully exploits the physics, geometry helpers, ricochet mechanics, power-ups, and tactical telemetry to defeat rival AI models (and optionally human players).

================================================================
1. ARENA GEOMETRY, COORDINATES & EXACT PHYSICS (STRICTLY ENFORCED)
================================================================
- **Arena & Grid**: 900x660 px canvas (45x33 tiles, \`TILE = 20px\`). Corridors are 3 tiles (60px) wide; robot radius = \`14px\` (leaving 16px clearance per side when centered — hugging walls risks corner snags!).
- **FULLY RANDOMIZED SPAWNS EVERY MATCH**: Every robot spawns at a freshly randomized open maze location with randomized facing angle! NEVER hardcode corner spawn coordinates — always read \`state.me.x, state.me.y, state.me.angle\` and \`state.enemies\`.
- **Coordinate System**: \`x\` increases right (0..900), \`y\` increases down (0..660). \`angle = 0\` faces East (+X), \`+PI/2\` faces South (+Y). Positive \`turn\` rotates clockwise (\`+angle\`), negative \`turn\` rotates counter-clockwise (\`-angle\`).
- **FIXED-FORWARD CANNON (CRITICAL RULE)**: There is NO independent turret! Your robot ONLY fires straight ahead along \`state.me.angle\` (with tiny \`±0.032 rad\` / ~1.8° spread). You MUST rotate your chassis with \`turn\` to aim.
- **CRITICAL MUZZLE WALL-CHECK**: Bullets spawn \`19px\` ahead of your center (\`BOT_RADIUS + 5\`). If that muzzle point is inside a solid wall tile, the engine **silently blocks firing** (EXCEPT when \`weaponType === 'penetrate'\`)! Always leave >= 20px clearance in front of your nose before shooting.
- **Tank Movement & Controls**:
  - \`throttle\`: \`-1.0\` (reverse at 72% speed = \`-51.8 px/s\`) to \`+1.0\` (forward at \`72 px/s\` base speed).
  - \`turn\`: \`-1.0\` to \`+1.0\` (up to \`2.75 rad/s\` ≈ 158°/s). You can pivot in place (\`throttle: 0, turn: ±1\`) or arc-turn while driving.
  - Velocity uses smooth damping (\`accel = 9.0/s\`), NOT instant velocity snapping.
  - \`fire\`: boolean — fires when \`fireCooldown <= 0 && !me.reloading && me.ammo > 0\`.
  - \`regen\`: boolean — activates your **Regen Ability** (see below!).
  - \`say\`: optional short string (<= 22 chars) for a floating tactical speech bubble.
- **REGEN ABILITY (ALL ROBOTS)**:
  - Return \`regen: true\` to **consume \`3\` ammo at once** and instantly **heal \`10%\` of your CURRENT HP** (\`Math.max(1, Math.round(me.hp * 0.10))\`, capped at \`me.maxHp\`).
  - **Cooldown**: \`10.0s\` (\`state.me.regenCooldown\`). Only activates when \`me.hp < me.maxHp && me.ammo >= 3 && me.regenCooldown <= 0\`.
  - *Strategic Note*: Because Regen heals \`10%\` of **current** HP (not max HP) and consumes 3 ammo (putting a 3-ammo AI bot into a \`${r.reloadPerBullet}s\` reload!), it heals MORE HP when used at 60–85% HP behind wall cover rather than waiting until 10 HP in open combat!
- **Combat, Hitboxes & Reload Rules**:
  - **Your Stats (AI/Code)**: Max HP = \`${r.maxHp}\` | Magazine = \`${r.aiAmmo}\` bullet(s) | Fire cooldown = \`~0.36s\`.
  - **Human Player Opponents** (if any have \`e.isPlayer === true\`): Max HP = \`${r.playerHp}\`, Magazine = \`${r.playerAmmo}\`, Regen ability, and automatic Aimbot lock on every 2nd shot — fight them using cover, corner bank shots, special wall tiles, shields, and traps!
  - **Incremental Auto-Reload**: Whenever \`ammo < maxAmmo\`, you automatically reload \`1\` bullet every \`${r.reloadPerBullet}s\` (even while moving/fighting). Hitting \`0\` ammo triggers a lockout (\`me.reloading === true\`) for \`${r.reloadPerBullet}s\` until 1 bullet loads. *Tip: Picking up any weapon power-up while empty instantly grants 1 bullet!*
  - **Standard Bullets**: \`${r.bulletDamage}\` HP dmg | \`${r.bulletSpeed} px/s\` speed | \`${r.maxRange}px\` max range | up to \`${r.maxBounces}\` wall bounces (expires on the next wall hit or at max range).
  - **Hitbox & Self-Damage**: Bullet hit radius = \`16.6px\` (\`BOT_RADIUS + 2.6\`); Laser hit radius = \`18px\`. **Your own bullets NEVER hurt you** (even after bouncing or splitting!) — UNLESS an enemy with \`reflect_shield\` reflects them back (which flips \`ownerId\` to them!).
- **SPECIAL BULLET-TRIGGERED WALL TILES (EMBEDDED IN INTERIOR WALLS)**:
  Bouncing a bullet off these special tiles triggers powerful projectile upgrades (visible via \`state.maze.getTile(tx, ty)\`, \`state.maze.getSpecialTiles()\`, \`state.maze.getPillars()\`, \`castRay()\`, and \`state.lidar\`):
  - **\`tile === 2\` — Central Reinforced Pillar**: Supercharges the bullet (**\`+8%\` speed** per pillar bounce & **\`+15%\` damage** = \`${pillarDmg}\` HP)!
  - **\`tile === 3\` — Range Booster Wall (\`type: 'range'\`, Cyan \`+R\`)**: Instantly **expands bouncing range (\`+350px\` maxRange) AND adds \`+2\` extra max bounces** (even saves a bullet on its final bounce!).
  - **\`tile === 4\` — Turbo Accelerator Wall (\`type: 'speed'\`, Amber \`»\`)**: Boosts **projectile speed by \`+45%\`** (up to \`2.4x\` base speed) — turns bank shots into near-instant railgun rounds!
  - **\`tile === 5\` — 3-Way Splitter Wall (\`type: 'spread'\`, Violet \`3×\`)**: **Splits the reflected bullet into a 3-way fan spread** (center shot + 2 child bullets at \`±16°\` / \`±0.28 rad\`, up to 2 split generations per shot) — devastating for flooding corridors and corners!
- **Fog of War**: ${fogLine}

================================================================
2. ALL 8 RANDOM POWER-UPS (FIRST DROP AT 2s, THEN EVERY 5–10s, MAX 5 ON MAP)
================================================================
Power-ups spawn anywhere on open floor (pickup radius = \`28px\`). Grabbing a new weapon power-up replaces your current special weapon charges:
1. \`piercing\` (2 shots): Passes straight THROUGH multiple enemies AND **completely bypasses Energy Shields**!
2. \`penetrate\` (2 shots): Drills straight THROUGH up to 2 interior maze walls (stops at outer border)! **Can shoot enemies through walls without Line-of-Sight and ignores muzzle-wall blocking!**
3. \`speed\` (7.0s): \`+55%\` movement speed (\`111.6 px/s\`) & \`+35%\` turn rate (\`3.71 rad/s\`). Huge advantage for dodging, chasing, and grabbing more power-ups.
4. \`ultra_ricochet\` (2 shots): \`${ultraBounces}\` wall bounces, \`${ultraRange}px\` range, and \`+20%\` speed (\`${ultraSpeed} px/s\`). Insane for multi-bounce corner sniping!
5. \`laser\` (1 shot): Instant hitscan beam with **2 wall bounces**, \`650px\` total range, **\`28\` HP damage** to ALL enemies along the beam! (Zero travel time — aim directly at target or bounce off wall, no velocity lead needed; blocked/reflected if enemy has \`reflecting === true\`.)
6. \`shield\` (10.0s): \`45 HP\` energy barrier absorbing incoming bullets/lasers/traps (bypassed ONLY by \`piercing\` shots).
7. \`trap\` (instant): Drops a proximity shock mine at your position. Arms after \`1.25s\`, lasts \`24s\`, triggers on any enemy within \`27px\` for **\`30\` HP damage + \`1.5s\` stun** (cuts enemy move speed to \`38%\` and turn speed to \`45%\`). Never triggers on its owner!
8. \`reflect_shield\` (6.0s): Mirror barrier that **reflects incoming enemy bullets straight back at them** (flipping ownership & refreshing range) and completely blocks laser beams! **NEVER shoot directly at an enemy with \`e.reflecting === true\`!**

================================================================
3. COMPLETE BOT API — \`think(state)\` (~30Hz SANDBOXED WEB WORKER)
================================================================
- **Runtime Budget**: Runs in an isolated Web Worker every ~32ms. Keep \`think(state)\` fast (**< 2ms/tick**). Any tick exceeding **250ms** terminates your bot! Your last returned action persists smoothly between ticks.
- **\`state.time\`**: Elapsed match seconds.
- **\`state.me\`**:
  \`{ id, x, y, vx, vy, angle, hp, maxHp, ammo, maxAmmo, reloading, reloadTimer, fireCooldown, regenCooldown, radius, buffs: { shieldHp, shieldTimer, reflectTimer, speedTimer, stunTimer, weaponType, weaponCharges } }\`
- **\`state.lidar\`**: Array of 15 forward raycasts evenly spread from \`-117°\` to \`+117°\` around \`me.angle\` (max range \`215px\`):
  \`{ relAngle, worldAngle, dist, x, y, hitWall, hitPillar, tileType, specialTile, hitEnemy }\`
- **\`state.enemies\`**: Array of living enemies:
  \`{ id, name, x, y, vx, vy, angle, hp, maxHp, isPlayer, dist, visible, shieldHp, reflecting, reloading, stunned, speedBoost, weaponType }\`
- **\`state.bullets\`**: All active bullets in the arena:
  \`{ ownerId, x, y, vx, vy, bounces, maxBounces, supercharged, piercing, penetrate, penetrateLeft, ultraRicochet, splitCount, remainingRange }\`
- **\`state.powerups\`**: All active pickups on the floor:
  \`{ id, type, x, y, dist }\`
- **\`state.traps\`**: All deployed traps on the floor:
  \`{ x, y, ownerId, armed, armTimer, life, dist }\`
- **\`state.maze\`** (Built-in high-speed geometry, ricochet & A* pathfinding toolkit):
  - Constants: \`tileSize\` (20), \`gridW\` (45), \`gridH\` (33), \`width\` (900), \`height\` (660).
  - \`getTile(tx, ty)\` -> \`0\` (open), \`1\` (wall), \`2\` (central boost pillar), \`3\` (range booster wall), \`4\` (turbo speed wall), \`5\` (3-way splitter wall).
  - \`isWall(tx, ty)\` -> boolean (\`tile !== 0\`).
  - \`castRay(x, y, angle, maxDist)\` -> \`{ hit, x, y, dist, nx, ny, tileX, tileY, tileType, isPillar, specialTile }\` (\`specialTile\` is \`null | 'range' | 'speed' | 'spread'\`).
  - \`hasLineOfSight(x1, y1, x2, y2)\` -> boolean (fast unobstructed sightline check).
  - \`findPath(x1, y1, x2, y2)\` -> array of \`{ x, y }\` smoothed corridor-centered A* waypoints (cache every ~0.3s for speed!).
  - \`traceShot(x, y, angle, maxRange, maxBounces)\` -> simulates exact engine wall bounces (including \`tile === 3\` +350px range & +2 bounce expansion)! Returns:
    \`{ points: [{x, y}, ...], segments: [{x1, y1, x2, y2, len, bounceIndex, supercharged, tileType}], bounces, hitPillar, specialTilesHit, totalDist }\`.
  - \`segmentCircleHit(x1, y1, x2, y2, cx, cy, radius)\` -> returns distance \`t\` along segment where it intersects circle \`(cx, cy, radius)\`, or \`null\` if miss. Combine with \`traceShot()\` to solve 1-, 2-, 3-, or 8-bounce bank shots & laser corner shots!
  - \`getPillars()\` -> array of \`{ tx, ty, x, y }\` center coordinates of all supercharge pillar tiles (\`tile === 2\`).
  - \`getSpecialTiles()\` -> array of \`{ tx, ty, x, y, tileType, type }\` (\`'range' | 'speed' | 'spread'\`) for all special wall tiles (\`tile === 3, 4, 5\`).
- **\`state.rules\`**:
  \`{ maxAmmo, reloadPerBullet, maxHp, playerMaxHp, playerMaxAmmo, bulletDamage, bulletSpeed, maxRange, maxBounces, fogOfWar, regenCost, regenPct, regenCooldown, codeBotSpeed, maxTurnRate, fireCooldown, muzzleOffset, botRadius, bulletRadius, pickupRadius, trapTriggerRadius }\`
- **\`state.memory\`**: Ephemeral per-match \`{}\` object (resets every match — use for path caches, stuck timers, burst timers).
- **\`state.brain\` (PERSISTENT SELF-LEARNING MEMORY!)**: JSON-serializable \`{}\` object **automatically persisted in \`localStorage\` across matches** for your robot! Store learned weights, Q-tables, UCB1 strategy bandits, opponent habit profiles, aim calibration, and win/loss stats here so your bot **genuinely self-improves every match**!
- **\`state.events\` (LIVE COMBAT FEEDBACK FOR ONLINE LEARNING!)**: Array of combat events that happened to your bot since the previous tick:
  - \`{ type: 'hit_dealt', targetId, targetName, dmg, bounces, supercharged }\`
  - \`{ type: 'hit_taken', fromId, fromName, dmg, bounces, supercharged }\`
  - \`{ type: 'kill', targetId, targetName }\`
  - \`{ type: 'dodge_close', bulletDist }\`
  - \`{ type: 'shot_missed', reason: 'range' | 'wall' }\`
  - \`{ type: 'powerup', powerupType }\`
  - \`{ type: 'regen', heal }\`
  - \`{ type: 'special_wall', tileType, wallType }\`

================================================================
4. SELF-LEARNING ENGINE — \`onMatchEnd(report, brain)\` (HUGE ADVANTAGE!)
================================================================
Your robot can **self-learn both MID-MATCH (via \`state.events\` + \`state.brain\`) AND ACROSS MATCHES (via \`onMatchEnd(report, brain)\`)**!
- When each match finishes, the engine automatically invokes \`BOT.onMatchEnd(report, brain)\` with structured match telemetry:
  \`report = { won, rank, totalBots, matchTime, hp, maxHp, kills, damageDealt, damageTaken, shotsFired, shotsHit, accuracy, shotsMissedRange, shotsMissedWall, bankHits, pillarHits, powerupsCollected, regenUses, hpRegened, directHitsTaken, bankHitsTaken, closeDodges, timeInLOS, timeStuck, wallBumps, timeEmptyAmmo, killedBy, deathDetails, opponents: [{ id, name, isPlayer, alive, hp, maxHp, kills, damageDealt, accuracy }] }\`
- Inside \`onMatchEnd(report, brain)\`:
  - Update your persistent \`brain\` (e.g., UCB1 multi-armed strategy bandit, evolutionary hill-climbing weights, Q-learning / TD updates, aim-lead & dodge-radius calibration, opponent counter-modeling) and return \`brain\` (must remain JSON-serializable, < 64KB).
  - **Set \`brain.summary = "Gen X: ..."\`** (a crisp 1-line note explaining what you just learned/tuned) — the Arena displays this live in the Battle Feed and Self-Learning Brain Inspector!

================================================================
5. HIGH-POTENTIAL TACTICS TO MAKE YOUR BOT UNSTOPPABLE
================================================================
- **Velocity-Lead Aiming**: Predict enemy position \`(e.x + e.vx * t, e.y + e.vy * t)\` where \`t = dist / projSpeed\` (\`bulletSpeed * 1.2\` for \`ultra_ricochet\`, \`t = 0\` for instant \`laser\`), verify \`hasLineOfSight\` to the lead point, and check muzzle clearance (\`!maze.isWall(floor((me.x+cos(a)*19)/20), floor((me.y+sin(a)*19)/20))\`).
- **Wall, Pillar & Special Tile Bank Shots**: When you lack direct LOS (or want lethal boosted shots), sweep candidate angles using \`maze.traceShot(mx, my, ang, range, bounces)\` + \`maze.segmentCircleHit(...)\`! Prefer shots that bounce off \`tile === 5\` (**3-way spread fan** to flood corridors), \`tile === 4\` (**+45% turbo speed**), \`tile === 3\` (**+350px range & +2 bounces**), or \`tile === 2\` (**+15% pillar dmg**). Use \`maze.getSpecialTiles()\` to spot nearby trigger walls!
- **Smart Regen Timing**: If injured (\`me.hp < me.maxHp * 0.85\`), \`me.ammo >= 3\`, \`me.regenCooldown <= 0\`, and you are safely out of immediate enemy LOS/fire, trigger \`regen: true\` to bank \`+10%\` current HP and immediately duck behind cover while reloading!
- **Special Weapon Exploitation**:
  - With \`penetrate\`: aim straight at enemies BEHIND interior walls — no LOS required!
  - With \`laser\`: use \`traceShot(mx, my, ang, 650, 2)\` for instant undodgeable corner hits (skip if enemy is \`reflecting\`).
  - With \`piercing\`: prioritize shielded enemies (\`e.shieldHp > 0\`) to ignore their shield.
  - Against \`e.reflecting === true\`: hold fire, reposition, or drop a \`trap\` / wait out their 6s mirror!
- **Predictive Bullet Dodging & Trap Avoidance**: Check every enemy bullet (\`b.ownerId !== me.id\`); compute closest point of approach (and 1st wall bounce if near a wall!) — if it will pass within \`24px\` in \`< 1.0s\`, dodge perpendicular or reverse with LiDAR clearance! Also steer clear of enemy traps (\`tr.ownerId !== me.id && tr.dist < 48\`).
- **Power-Up Contests**: Power-ups swing matches dramatically — detour via \`findPath\` to grab nearby high-value drops (\`laser\`, \`reflect_shield\`, \`shield\`, \`speed\`, \`ultra_ricochet\`, \`penetrate\`, \`piercing\`, \`trap\`), especially when you're low on ammo or HP!
- **Ammo & Cover Discipline**: Exploit vulnerable enemies (\`e.reloading\` or \`e.stunned\`). Conserve your last bullet for high-confidence kills, and break enemy LOS behind a corner while reloading. Include an anti-stuck detector (if moved < 10px in 0.8s, reverse + turn using LiDAR).

================================================================
6. REQUIRED OUTPUT FORMAT
================================================================
Respond with ONE single self-contained JavaScript code block defining \`const BOT = { ... };\` with ALL 6 fields below:
1. \`name\`: **MUST be your AI model name** from: \`"Gemini"\`, \`"Grok"\`, \`"ChatGPT"\`, \`"Claude"\`, or \`"DeepSeek"\` (so viewers see which AI model is fighting on the arena & leaderboard!).
2. \`author\`: Your exact model version (e.g., "Gemini 2.5 Pro", "Grok 3", "ChatGPT o3", "Claude 3.7 Sonnet", "DeepSeek R1").
3. \`algorithm\`: A clear, detailed explanation of your working algorithm (navigation, fixed-forward lead/bank-shot aiming, dodging, trap avoidance, power-up logic, ${r.aiAmmo}-bullet ammo / ${r.reloadPerBullet}s reload discipline, Regen, Special Wall Tiles, and **how your self-learning engine adapts via \`state.brain\`, \`state.events\`, and \`onMatchEnd\`**).
4. \`thoughts\`: Your personal design thoughts — WHY you built this exact combat + self-learning architecture for these arena rules, trade-offs you weighed, and how you expect your bot to out-evolve rival AI models over multiple generations.
5. \`think(state)\`: Pure, fast (< 2ms/tick), zero-dependency JavaScript function returning \`{ throttle, turn, fire, regen, say }\`.
6. \`onMatchEnd(report, brain)\`: Self-learning update hook that evolves \`brain\` after every match (keep JSON-serializable & set \`brain.summary\`).

Template to follow strictly:
\`\`\`javascript
const BOT = {
  name: "Gemini", // Use your model name: Gemini, Grok, ChatGPT, Claude, or DeepSeek
  author: "Gemini 2.5 Pro",
  algorithm: "Step-by-step explanation of combat + self-learning algorithm...",
  thoughts: "Your reasoning and design thoughts on creating this self-learning robot...",
  think(state) {
    // Initialize state.brain if empty, adapt from state.events, return tank controls
    return { throttle: 0.8, turn: 0, fire: false, regen: false };
  },
  onMatchEnd(report, brain) {
    // Reinforce what worked, mutate/adjust weights from report, set brain.summary
    brain.gen = (brain.gen || 1) + 1;
    brain.summary = "Gen " + brain.gen + ": tuned policy from match telemetry";
    return brain;
  }
};
\`\`\`

Constraints: No external imports, no DOM/window/fetch access, handle empty arrays (\`enemies\`, \`powerups\`, \`findPath\`) safely, avoid \`NaN\` outputs, cache \`findPath()\` every ~0.3s, and never infinite-loop.`;
  }

  // ==================== SANDBOXED BOT CODE COMPILER & WORKER ====================
  function stripCodeFences(raw) {
    let s = String(raw || '').trim();
    // Extract first fenced JS block if user pasted full AI reply containing prose + code block!
    const fenceMatch = s.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
    if (fenceMatch && fenceMatch[1]) {
      s = fenceMatch[1].trim();
    }
    // Normalize `export default` or `module.exports =` into `const BOT =`
    s = s.replace(/^\s*export\s+default\s+/m, 'const BOT = ');
    s = s.replace(/^\s*module\.exports\s*=\s*/m, 'const BOT = ');
    return s;
  }

  // ==================== PERSISTENT SELF-LEARNING BRAIN STORAGE ====================
  const MAX_BRAIN_BYTES = 64000;

  function getBrainKey(slotId, botName) {
    const cleanName = String(botName || 'bot').toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 24);
    return `mazebots_brain_v1_s${slotId}_${cleanName}`;
  }

  function sanitizeBrainData(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    try {
      const json = JSON.stringify(raw);
      if (json.length > MAX_BRAIN_BYTES) {
        return { _truncated: true, summary: typeof raw.summary === 'string' ? raw.summary.slice(0, 140) : 'Brain exceeded 64KB cap' };
      }
      return JSON.parse(json);
    } catch (_) {
      return {};
    }
  }

  function loadBotBrainRecord(slotId, botName) {
    const empty = {
      meta: { matches: 0, wins: 0, totalKills: 0, totalDamage: 0, logs: [] },
      data: {}
    };
    try {
      const raw = localStorage.getItem(getBrainKey(slotId, botName));
      if (!raw) return empty;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return empty;
      return {
        meta: {
          matches: Number(parsed.meta?.matches) || 0,
          wins: Number(parsed.meta?.wins) || 0,
          totalKills: Number(parsed.meta?.totalKills) || 0,
          totalDamage: Number(parsed.meta?.totalDamage) || 0,
          logs: Array.isArray(parsed.meta?.logs) ? parsed.meta.logs.slice(0, 14) : []
        },
        data: sanitizeBrainData(parsed.data)
      };
    } catch (_) {
      return empty;
    }
  }

  function saveBotBrainRecord(slotId, botName, newBrainData, matchReport) {
    const rec = loadBotBrainRecord(slotId, botName);
    const cleanData = sanitizeBrainData(newBrainData);
    rec.data = cleanData;
    if (matchReport) {
      rec.meta.matches += 1;
      if (matchReport.won) rec.meta.wins += 1;
      rec.meta.totalKills += matchReport.kills || 0;
      rec.meta.totalDamage += matchReport.damageDealt || 0;
      const summary =
        (typeof cleanData.summary === 'string' && cleanData.summary.trim()) ||
        (typeof cleanData.lastLesson === 'string' && cleanData.lastLesson.trim()) ||
        `Completed match #${rec.meta.matches} (${matchReport.won ? 'WIN' : `#${matchReport.rank}`}, ${matchReport.accuracy}% acc)`;
      rec.meta.logs.unshift({
        match: rec.meta.matches,
        won: Boolean(matchReport.won),
        rank: matchReport.rank,
        kills: matchReport.kills,
        acc: matchReport.accuracy,
        summary: summary.slice(0, 180)
      });
      if (rec.meta.logs.length > 14) rec.meta.logs.length = 14;
    }
    try {
      localStorage.setItem(getBrainKey(slotId, botName), JSON.stringify(rec));
    } catch (_) {
      // Ignore storage quota errors gracefully
    }
    return rec;
  }

  function resetBotBrainRecord(slotId, botName) {
    try {
      localStorage.removeItem(getBrainKey(slotId, botName));
    } catch (_) {}
  }

  // Shared Worker bootstrap script containing maze helpers + safe BOT execution + self-learning brain
  const WORKER_BOOTSTRAP_SRC = `
    'use strict';
    const TILE = 20, GRID_W = 45, GRID_H = 33;
    let grid = null, walkableCenter = null, pillarsCache = [], specialTilesCache = [], botThink = null, botOnMatchEnd = null, memory = {}, brain = {};

    function getTile(tx, ty) {
      if (!grid || tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return 1;
      return grid[ty][tx];
    }
    function isWall(tx, ty) { return getTile(tx, ty) !== 0; }
    function specialName(t) { return t === 3 ? 'range' : t === 4 ? 'speed' : t === 5 ? 'spread' : null; }

    function castRay(ox, oy, angle, maxDist) {
      const dx = Math.cos(angle), dy = Math.sin(angle);
      let mapX = Math.floor(ox / TILE), mapY = Math.floor(oy / TILE);
      if (isWall(mapX, mapY)) {
        const tt = getTile(mapX, mapY);
        return { hit: true, x: ox, y: oy, dist: 0, nx: -Math.sign(dx), ny: -Math.sign(dy), tileX: mapX, tileY: mapY, tileType: tt, isPillar: tt === 2, specialTile: specialName(tt) };
      }
      const deltaDistX = dx === 0 ? 1e30 : Math.abs(TILE / dx);
      const deltaDistY = dy === 0 ? 1e30 : Math.abs(TILE / dy);
      let stepX = dx < 0 ? -1 : 1;
      let sideDistX = dx < 0 ? ((ox / TILE) - mapX) * deltaDistX : (mapX + 1 - (ox / TILE)) * deltaDistX;
      let stepY = dy < 0 ? -1 : 1;
      let sideDistY = dy < 0 ? ((oy / TILE) - mapY) * deltaDistY : (mapY + 1 - (oy / TILE)) * deltaDistY;
      let dist = 0, side = 0;
      for (let i = 0; i < 120; i++) {
        if (sideDistX < sideDistY) { dist = sideDistX; sideDistX += deltaDistX; mapX += stepX; side = 0; }
        else { dist = sideDistY; sideDistY += deltaDistY; mapY += stepY; side = 1; }
        if (dist > maxDist) return { hit: false, x: ox + dx * maxDist, y: oy + dy * maxDist, dist: maxDist, nx: 0, ny: 0, tileX: mapX, tileY: mapY, tileType: 0, isPillar: false, specialTile: null };
        if (isWall(mapX, mapY)) {
          const tt = getTile(mapX, mapY);
          return {
            hit: true, x: ox + dx * dist, y: oy + dy * dist, dist,
            nx: side === 0 ? -stepX : 0, ny: side === 1 ? -stepY : 0,
            tileX: mapX, tileY: mapY, tileType: tt, isPillar: tt === 2, specialTile: specialName(tt)
          };
        }
      }
      return { hit: false, x: ox + dx * maxDist, y: oy + dy * maxDist, dist: maxDist, nx: 0, ny: 0, tileX: mapX, tileY: mapY, tileType: 0, isPillar: false, specialTile: null };
    }

    function hasLineOfSight(x1, y1, x2, y2) {
      const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy);
      if (d < 1) return true;
      const r = castRay(x1, y1, Math.atan2(dy, dx), d);
      return !r.hit || r.dist >= d - 2;
    }

    function nearestWalkable(x, y) {
      const cx = Math.max(1, Math.min(GRID_W - 2, Math.floor(x / TILE)));
      const cy = Math.max(1, Math.min(GRID_H - 2, Math.floor(y / TILE)));
      if (walkableCenter && walkableCenter[cy][cx]) return { tx: cx, ty: cy };
      let best = null, bestD = 1e9;
      for (let r = 1; r <= 4; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx > 0 && ny > 0 && nx < GRID_W - 1 && ny < GRID_H - 1 && walkableCenter && walkableCenter[ny][nx]) {
              const d = dx * dx + dy * dy;
              if (d < bestD) { bestD = d; best = { tx: nx, ty: ny }; }
            }
          }
        }
        if (best) return best;
      }
      return { tx: 2, ty: 2 };
    }

    function findPath(sx, sy, gx, gy) {
      if (!walkableCenter) return [];
      const start = nearestWalkable(sx, sy), goal = nearestWalkable(gx, gy);
      if (start.tx === goal.tx && start.ty === goal.ty) return [{ x: goal.tx * TILE + 10, y: goal.ty * TILE + 10 }];
      const total = GRID_W * GRID_H;
      const gScore = new Float32Array(total).fill(1e9);
      const cameFrom = new Int32Array(total).fill(-1);
      const closed = new Uint8Array(total);
      const sIdx = start.ty * GRID_W + start.tx, gIdx = goal.ty * GRID_W + goal.tx;
      gScore[sIdx] = 0;
      const open = [{ idx: sIdx, f: Math.abs(goal.tx - start.tx) + Math.abs(goal.ty - start.ty) }];
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      while (open.length > 0) {
        let bp = 0;
        for (let i = 1; i < open.length; i++) if (open[i].f < open[bp].f) bp = i;
        const cur = open.splice(bp, 1)[0];
        if (cur.idx === gIdx) break;
        if (closed[cur.idx]) continue;
        closed[cur.idx] = 1;
        const cx = cur.idx % GRID_W, cy = (cur.idx - cx) / GRID_W, cg = gScore[cur.idx];
        for (const [dx, dy] of dirs) {
          const nx = cx + dx, ny = cy + dy;
          if (nx <= 0 || ny <= 0 || nx >= GRID_W - 1 || ny >= GRID_H - 1 || !walkableCenter[ny][nx]) continue;
          const nIdx = ny * GRID_W + nx;
          if (closed[nIdx]) continue;
          const tg = cg + 1;
          if (tg < gScore[nIdx]) {
            gScore[nIdx] = tg; cameFrom[nIdx] = cur.idx;
            open.push({ idx: nIdx, f: tg + Math.abs(goal.tx - nx) + Math.abs(goal.ty - ny) });
          }
        }
      }
      if (cameFrom[gIdx] === -1) return [];
      const raw = [];
      let cur = gIdx;
      while (cur !== -1 && cur !== sIdx) {
        const tx = cur % GRID_W, ty = (cur - tx) / GRID_W;
        raw.push({ x: tx * TILE + 10, y: ty * TILE + 10 });
        cur = cameFrom[cur];
      }
      raw.reverse();
      const smooth = [];
      for (let i = 0; i < raw.length; i++) {
        if (i === 0 || i === raw.length - 1) smooth.push(raw[i]);
        else if (!(raw[i-1].x === raw[i].x && raw[i].x === raw[i+1].x) && !(raw[i-1].y === raw[i].y && raw[i].y === raw[i+1].y)) smooth.push(raw[i]);
      }
      return smooth;
    }

    function segmentCircleHit(x1, y1, x2, y2, cx, cy, r) {
      const sx = x2 - x1, sy = y2 - y1;
      const len = Math.hypot(sx, sy);
      if (len < 1e-6) return Math.hypot(cx - x1, cy - y1) <= r ? 0 : null;
      const dx = sx / len, dy = sy / len;
      const fx = x1 - cx, fy = y1 - cy;
      const b = 2 * (fx * dx + fy * dy);
      const c = fx * fx + fy * fy - r * r;
      const disc = b * b - 4 * c;
      if (disc < 0) return null;
      const sqrtD = Math.sqrt(disc);
      const t1 = (-b - sqrtD) * 0.5;
      if (t1 >= 0 && t1 <= len) return t1;
      const t2 = (-b + sqrtD) * 0.5;
      if (t2 >= 0 && t2 <= len) return t2;
      return null;
    }

    function traceShot(ox, oy, angle, maxRange = 550, maxBounces = 3) {
      let capBounces = Math.max(0, Math.min(8, Math.floor(maxBounces)));
      let x = ox, y = oy;
      let dx = Math.cos(angle), dy = Math.sin(angle);
      let remaining = Math.max(1, Number(maxRange) || 550);
      let bounces = 0, totalDist = 0, hitPillar = false, supercharged = false;
      const points = [{ x, y }];
      const segments = [];
      const specialTilesHit = [];
      for (let seg = 0; seg <= capBounces && remaining > 1; seg++) {
        const r = castRay(x, y, Math.atan2(dy, dx), remaining);
        const len = r.dist;
        segments.push({ x1: x, y1: y, x2: r.x, y2: r.y, len, bounceIndex: bounces, supercharged, tileType: r.tileType });
        points.push({ x: r.x, y: r.y });
        totalDist += len;
        remaining -= len;
        if (!r.hit) break;
        if (r.tileType === 3) {
          remaining += 350;
          capBounces = Math.min(10, capBounces + 2);
        }
        if (r.specialTile) specialTilesHit.push(r.specialTile);
        if (bounces >= capBounces) break;
        if (r.isPillar) { hitPillar = true; supercharged = true; }
        if (r.nx !== 0) dx = -dx;
        if (r.ny !== 0) dy = -dy;
        x = r.x + r.nx * 0.75;
        y = r.y + r.ny * 0.75;
        bounces++;
      }
      return { points, segments, bounces, hitPillar, specialTilesHit, totalDist };
    }

    function getPillars() {
      return pillarsCache.map(p => ({ tx: p.tx, ty: p.ty, x: p.x, y: p.y }));
    }

    function getSpecialTiles() {
      return specialTilesCache.map(s => ({ tx: s.tx, ty: s.ty, x: s.x, y: s.y, tileType: s.tileType, type: s.type }));
    }

    const mazeApi = { tileSize: TILE, gridW: GRID_W, gridH: GRID_H, width: 900, height: 660, getTile, isWall, castRay, hasLineOfSight, findPath, traceShot, segmentCircleHit, getPillars, getSpecialTiles };

    self.onmessage = function(ev) {
      const msg = ev.data;
      if (msg.type === 'init') {
        grid = msg.grid;
        walkableCenter = msg.walkableCenter;
        pillarsCache = [];
        specialTilesCache = [];
        if (grid) {
          for (let ty = 0; ty < GRID_H; ty++) {
            for (let tx = 0; tx < GRID_W; tx++) {
              const cell = grid[ty][tx];
              if (cell === 2) pillarsCache.push({ tx, ty, x: tx * TILE + 10, y: ty * TILE + 10 });
              else if (cell >= 3 && cell <= 5) specialTilesCache.push({ tx, ty, x: tx * TILE + 10, y: ty * TILE + 10, tileType: cell, type: specialName(cell) });
            }
          }
        }
        memory = {};
        brain = (msg.brain && typeof msg.brain === 'object') ? msg.brain : {};
        try {
          const factory = new Function(msg.source + '\\n; if (typeof BOT !== "undefined") return BOT; if (typeof think === "function") return { think }; throw new Error("Code must define const BOT = { name, author, algorithm, thoughts, think(state) { ... } }");');
          const obj = factory();
          if (!obj || typeof obj.think !== 'function') throw new Error('BOT.think must be a function(state)');
          botThink = obj.think;
          botOnMatchEnd = typeof obj.onMatchEnd === 'function' ? obj.onMatchEnd : (typeof obj.learn === 'function' ? obj.learn : null);
          self.postMessage({
            type: 'ready',
            hasLearner: Boolean(botOnMatchEnd),
            meta: {
              name: typeof obj.name === 'string' ? obj.name.trim().slice(0, 18) : '',
              author: typeof obj.author === 'string' ? obj.author.trim().slice(0, 28) : 'Custom AI',
              algorithm: typeof obj.algorithm === 'string' ? obj.algorithm.trim() : '',
              thoughts: typeof obj.thoughts === 'string' ? obj.thoughts.trim() : ''
            }
          });
        } catch (err) {
          self.postMessage({ type: 'error', error: err.message || String(err) });
        }
      } else if (msg.type === 'tick') {
        if (!botThink) return;
        const t0 = performance.now();
        try {
          const state = msg.state;
          state.maze = mazeApi;
          state.memory = memory;
          state.brain = brain;
          state.events = Array.isArray(state.events) ? state.events : [];
          const act = botThink(state) || {};
          self.postMessage({
            type: 'action',
            reqId: msg.reqId,
            elapsedMs: performance.now() - t0,
            action: {
              throttle: Number.isFinite(act.throttle) ? Math.max(-1, Math.min(1, act.throttle)) : 0,
              turn: Number.isFinite(act.turn) ? Math.max(-1, Math.min(1, act.turn)) : 0,
              fire: Boolean(act.fire),
              regen: Boolean(act.regen),
              say: typeof act.say === 'string' ? act.say.trim().slice(0, 22) : ''
            }
          });
        } catch (err) {
          self.postMessage({ type: 'error', error: err.message || String(err) });
        }
      } else if (msg.type === 'match_end') {
        try {
          if (botOnMatchEnd) {
            const ret = botOnMatchEnd(msg.report, brain);
            if (ret && typeof ret === 'object' && !Array.isArray(ret)) {
              brain = ret;
            }
          }
          const clean = JSON.parse(JSON.stringify(brain || {}));
          self.postMessage({
            type: 'brain_saved',
            brain: clean,
            summary: typeof clean.summary === 'string' ? clean.summary.slice(0, 180) : ''
          });
        } catch (err) {
          self.postMessage({ type: 'brain_saved', brain: {}, summary: 'Learning error: ' + (err.message || String(err)) });
        }
      }
    };
  `;

  let workerBlobUrl = null;
  function getWorkerUrl() {
    if (!workerBlobUrl) {
      const blob = new Blob([WORKER_BOOTSTRAP_SRC], { type: 'application/javascript' });
      workerBlobUrl = URL.createObjectURL(blob);
    }
    return workerBlobUrl;
  }

  function specialTileName(t) {
    return t === 3 ? 'range' : t === 4 ? 'speed' : t === 5 ? 'spread' : null;
  }

  function buildSyncMazeApi() {
    const cast = (ox, oy, ang, md) => {
      const r = castRay(ox, oy, Math.cos(ang), Math.sin(ang), md);
      const tt = r.hit && r.tileX >= 0 && r.tileY >= 0 && r.tileX < GRID_W && r.tileY < GRID_H ? grid[r.tileY][r.tileX] : 0;
      return {
        ...r,
        tileType: tt,
        isPillar: tt === 2,
        specialTile: specialTileName(tt)
      };
    };
    const segHit = (x1, y1, x2, y2, cx, cy, rad) => {
      const sx = x2 - x1, sy = y2 - y1;
      const len = hypot(sx, sy);
      if (len < 1e-6) return hypot(cx - x1, cy - y1) <= rad ? 0 : null;
      return segmentCircleHit(x1, y1, sx / len, sy / len, len, cx, cy, rad);
    };
    const trace = (ox, oy, angle, maxRange = 550, maxBounces = 3) => {
      let capBounces = Math.max(0, Math.min(8, Math.floor(maxBounces)));
      let x = ox, y = oy;
      let dx = Math.cos(angle), dy = Math.sin(angle);
      let remaining = Math.max(1, Number(maxRange) || 550);
      let bounces = 0, totalDist = 0, hitPillar = false, supercharged = false;
      const points = [{ x, y }];
      const segments = [];
      const specialTilesHit = [];
      for (let seg = 0; seg <= capBounces && remaining > 1; seg++) {
        const r = cast(x, y, Math.atan2(dy, dx), remaining);
        const len = r.dist;
        segments.push({ x1: x, y1: y, x2: r.x, y2: r.y, len, bounceIndex: bounces, supercharged, tileType: r.tileType });
        points.push({ x: r.x, y: r.y });
        totalDist += len;
        remaining -= len;
        if (!r.hit) break;
        if (r.tileType === 3) {
          remaining += 350;
          capBounces = Math.min(10, capBounces + 2);
        }
        if (r.specialTile) specialTilesHit.push(r.specialTile);
        if (bounces >= capBounces) break;
        if (r.isPillar) { hitPillar = true; supercharged = true; }
        if (r.nx !== 0) dx = -dx;
        if (r.ny !== 0) dy = -dy;
        x = r.x + r.nx * 0.75;
        y = r.y + r.ny * 0.75;
        bounces++;
      }
      return { points, segments, bounces, hitPillar, specialTilesHit, totalDist };
    };
    const getPillars = () => {
      const list = [];
      for (let ty = 0; ty < GRID_H; ty++) {
        for (let tx = 0; tx < GRID_W; tx++) {
          if (grid[ty][tx] === 2) list.push({ tx, ty, x: tx * TILE + 10, y: ty * TILE + 10 });
        }
      }
      return list;
    };
    const getSpecialTiles = () => {
      const list = [];
      for (let ty = 0; ty < GRID_H; ty++) {
        for (let tx = 0; tx < GRID_W; tx++) {
          const cell = grid[ty][tx];
          if (cell >= 3 && cell <= 5) {
            list.push({ tx, ty, x: tx * TILE + 10, y: ty * TILE + 10, tileType: cell, type: specialTileName(cell) });
          }
        }
      }
      return list;
    };
    return {
      tileSize: TILE, gridW: GRID_W, gridH: GRID_H, width: CANVAS_W, height: CANVAS_H,
      getTile: (tx, ty) => (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H ? 1 : grid[ty][tx]),
      isWall: (tx, ty) => isSolidTile(tx, ty),
      castRay: cast,
      hasLineOfSight,
      findPath,
      traceShot: trace,
      segmentCircleHit: segHit,
      getPillars,
      getSpecialTiles
    };
  }

  // Validate bot source cleanly (runs init + 1 dry-run test tick!)
  function validateBotCode(rawSource) {
    const cleaned = stripCodeFences(rawSource);
    if (!cleaned) {
      return Promise.resolve({ ok: false, error: 'Code is empty. Paste a const BOT = { ... } script.' });
    }

    // Build minimal dummy maze if none generated yet
    if (!grid || !grid.length) generateMaze();
    const dummyState = {
      time: 0.1,
      me: {
        id: 0, x: 50, y: 50, vx: 0, vy: 0, angle: 0.5, hp: MAX_HP, maxHp: MAX_HP,
        ammo: AI_MAG_SIZE, maxAmmo: AI_MAG_SIZE, reloading: false, reloadTimer: 0, fireCooldown: 0, regenCooldown: 0, radius: BOT_RADIUS,
        buffs: { shieldHp: 0, shieldTimer: 0, reflectTimer: 0, speedTimer: 0, stunTimer: 0, weaponType: null, weaponCharges: 0 }
      },
      lidar: Array.from({ length: 15 }, (_, i) => ({ relAngle: -2 + i * 0.28, worldAngle: -1.5 + i * 0.28, dist: 100, x: 100, y: 100, hitWall: true, hitPillar: false, tileType: 1, specialTile: null, hitEnemy: false })),
      enemies: [{
        id: 1, name: 'Dummy', x: 300, y: 200, vx: 0, vy: 0, angle: 0, hp: MAX_HP, maxHp: MAX_HP,
        isPlayer: false, dist: 290, visible: false, shieldHp: 0, reflecting: false,
        reloading: false, stunned: false, speedBoost: false, weaponType: null
      }],
      bullets: [],
      powerups: [],
      traps: [],
      events: [],
      rules: {
        maxAmmo: AI_MAG_SIZE,
        reloadPerBullet: RELOAD_PER_BULLET,
        maxHp: MAX_HP,
        playerMaxHp: PLAYER_MAX_HP,
        playerMaxAmmo: PLAYER_MAG_SIZE,
        bulletDamage: BULLET_DAMAGE,
        bulletSpeed: BULLET_SPEED,
        maxRange: BULLET_MAX_RANGE,
        maxBounces: BULLET_MAX_BOUNCES,
        fogOfWar: arenaRules.fogOfWar,
        regenCost: REGEN_AMMO_COST,
        regenPct: REGEN_HP_PCT,
        regenCooldown: REGEN_COOLDOWN,
        codeBotSpeed: 72,
        maxTurnRate: 2.75,
        fireCooldown: 0.36,
        muzzleOffset: BOT_RADIUS + 5,
        botRadius: BOT_RADIUS,
        bulletRadius: BULLET_RADIUS,
        pickupRadius: BOT_RADIUS + 14,
        trapTriggerRadius: BOT_RADIUS + 13
      }
    };

    return new Promise(resolve => {
      try {
        const w = new Worker(getWorkerUrl());
        let meta = null;
        const timer = setTimeout(() => {
          w.terminate();
          resolve({ ok: false, error: 'Validation timed out (>600ms) — possible infinite loop.' });
        }, 600);

        w.onmessage = ev => {
          const d = ev.data;
          if (d.type === 'ready') {
            meta = d.meta;
            w.postMessage({ type: 'tick', reqId: 1, state: dummyState });
          } else if (d.type === 'action') {
            clearTimeout(timer);
            w.terminate();
            resolve({ ok: true, cleaned, meta, elapsedMs: d.elapsedMs });
          } else if (d.type === 'error') {
            clearTimeout(timer);
            w.terminate();
            resolve({ ok: false, error: d.error });
          }
        };

        w.onerror = err => {
          clearTimeout(timer);
          w.terminate();
          resolve({ ok: false, error: err.message || 'Worker syntax/runtime error' });
        };

        w.postMessage({ type: 'init', source: cleaned, grid, walkableCenter, brain: {} });
      } catch (e) {
        // Fallback synchronous validation (e.g. if opened via file://)
        try {
          const factory = new Function(cleaned + '\n; if (typeof BOT !== "undefined") return BOT; if (typeof think === "function") return { think }; throw new Error("Missing BOT object or think(state)");');
          const obj = factory();
          if (!obj || typeof obj.think !== 'function') throw new Error('BOT.think must be a function');
          const t0 = performance.now();
          obj.think({
            ...dummyState,
            memory: {},
            brain: {},
            maze: buildSyncMazeApi()
          });
          resolve({
            ok: true,
            cleaned,
            elapsedMs: performance.now() - t0,
            meta: {
              name: typeof obj.name === 'string' ? obj.name.trim().slice(0, 18) : '',
              author: typeof obj.author === 'string' ? obj.author.trim().slice(0, 28) : 'Custom AI',
              algorithm: typeof obj.algorithm === 'string' ? obj.algorithm.trim() : '',
              thoughts: typeof obj.thoughts === 'string' ? obj.thoughts.trim() : ''
            }
          });
        } catch (syncErr) {
          resolve({ ok: false, error: syncErr.message || String(syncErr) });
        }
      }
    });
  }

  let activeCodeWorkers = [];

  function terminateAllCodeWorkers() {
    for (const w of activeCodeWorkers) {
      try { w.terminate(); } catch (_) {}
    }
    activeCodeWorkers = [];
  }

  function createCodeBotRunner(bot, rawSource) {
    const cleaned = stripCodeFences(rawSource);
    const savedRecord = loadBotBrainRecord(bot.slotId, bot.name);
    const runner = {
      worker: null,
      syncThink: null,
      syncOnMatchEnd: null,
      syncMemory: {},
      syncBrain: savedRecord.data,
      hasLearner: false,
      onBrainSaved: null,
      ready: false,
      pending: false,
      pendingSince: 0,
      pendingSimTime: 0,
      reqId: 0,
      lastAction: { throttle: 0, turn: 0, fire: false, regen: false, say: '' },
      error: null
    };

    try {
      const w = new Worker(getWorkerUrl());
      runner.worker = w;
      activeCodeWorkers.push(w);

      w.onmessage = ev => {
        const d = ev.data;
        if (d.type === 'ready') {
          runner.ready = true;
          runner.hasLearner = Boolean(d.hasLearner);
        } else if (d.type === 'action') {
          runner.pending = false;
          runner.pendingSimTime = 0;
          runner.lastAction = d.action;
          if (Number.isFinite(d.elapsedMs)) {
            bot.thinkTotalMs += d.elapsedMs;
            bot.thinkTicks++;
            if (d.elapsedMs > bot.thinkMaxMs) bot.thinkMaxMs = d.elapsedMs;
          }
        } else if (d.type === 'brain_saved') {
          if (typeof runner.onBrainSaved === 'function') {
            const cb = runner.onBrainSaved;
            runner.onBrainSaved = null;
            cb(d.brain, d.summary);
          }
        } else if (d.type === 'error') {
          runner.pending = false;
          runner.pendingSimTime = 0;
          runner.error = d.error;
          bot.codeError = d.error;
          pushFeed(`${bot.name} code error: ${d.error}`, '#b71c1c');
        }
      };

      w.onerror = err => {
        runner.pending = false;
        runner.error = err.message || 'Worker error';
        bot.codeError = runner.error;
      };

      w.postMessage({ type: 'init', source: cleaned, grid, walkableCenter, brain: savedRecord.data });
    } catch (_) {
      // Fallback synchronous sandbox for file://
      try {
        const factory = new Function(cleaned + '\n; if (typeof BOT !== "undefined") return BOT; if (typeof think === "function") return { think }; throw new Error("Missing BOT.think");');
        const obj = factory();
        runner.syncThink = obj.think;
        runner.syncOnMatchEnd = typeof obj.onMatchEnd === 'function' ? obj.onMatchEnd : (typeof obj.learn === 'function' ? obj.learn : null);
        runner.hasLearner = Boolean(runner.syncOnMatchEnd);
        runner.ready = true;
      } catch (err) {
        runner.error = err.message || String(err);
        bot.codeError = runner.error;
      }
    }

    return runner;
  }

  // ==================== APP STATE ====================
  const botConfigs = BOT_SLOTS.map((slot, idx) => {
    const preset = AI_PRESETS[slot.defaultPreset];
    const sample = SAMPLE_CODE_BOTS[idx % SAMPLE_CODE_BOTS.length];
    return {
      id: slot.id,
      role: idx === 0 ? 'p1' : 'ai', // 'ai' | 'code' | 'p1' | 'p2'
      name: slot.defaultName,
      presetId: preset.id,
      aggression: preset.defaults.aggression,
      caution: preset.defaults.caution,
      ricochet: preset.defaults.ricochet,
      // Custom AI-coded robot fields
      codeSource: sample.source,
      codeAuthor: sample.label.split(':')[1]?.trim() || 'Sample AI',
      codeAlgorithm: '',
      codeThoughts: '',
      codeValid: true,
      codeError: ''
    };
  });

  // Extract initial metadata for preloaded sample bots cleanly
  botConfigs.forEach(cfg => {
    const mAlg = cfg.codeSource.match(/algorithm:\s*"((?:[^"\\]|\\.)*)"/);
    const mTh = cfg.codeSource.match(/thoughts:\s*"((?:[^"\\]|\\.)*)"/);
    const mAuth = cfg.codeSource.match(/author:\s*"((?:[^"\\]|\\.)*)"/);
    if (mAlg) cfg.codeAlgorithm = mAlg[1].replace(/\\n/g, '\n');
    if (mTh) cfg.codeThoughts = mTh[1].replace(/\\n/g, '\n');
    if (mAuth) cfg.codeAuthor = mAuth[1];
  });

  let screenMode = 'setup'; // 'setup' | 'arena'
  let activeBotCount = 4; // Min 2, Max 4
  let currentTheme = MAZE_THEMES[0];
  let matchSpeed = 1;
  let showLidar = true;
  let isPaused = false;
  let matchOver = false;
  let matchTime = 0;
  let timeSinceLastDamage = 0;
  let eliminationCounter = 0;
  let shakeMag = 0;
  let editingCodeSlotIdx = 0;
  let codeModalReadOnly = false;

  // Player Input State
  const keysDown = new Set();
  const mouseState = {
    x: CANVAS_W * 0.5,
    y: CANVAS_H * 0.5,
    inside: false,
    down: false
  };

  // Arena structures
  let grid = []; // [ty][tx] -> 0 open, 1 wall, 2 pillar, 3 range, 4 speed, 5 spread
  let walkableCenter = []; // [ty][tx] -> boolean (3x3 clear)
  let corridorIntersections = []; // list of {tx, ty, x, y}
  let specialWallTiles = []; // list of {tx, ty, x, y, tileType, type}
  let matchSpawnPads = []; // randomized spawn pads for current match
  let mazeOffscreen = null;

  let bots = [];
  let bullets = [];
  let powerups = [];
  let traps = [];
  let laserBeams = [];
  let speedTrails = [];
  let treadMarks = []; // fading tank track impressions
  let muzzleFlashes = []; // brief directional cannon muzzle flash bursts
  let killSlowMoTimer = 0; // tactile micro slow-motion pulse on eliminations
  let floatingTexts = []; // brief floating labels (+HP, +RANGE!, SPEED+!, 3× SPREAD!)
  let powerupBanner = null; // Top-center drop alert banner { text, color, life, maxLife }
  let powerupSpawnTimer = 2.0;
  let powerupUidCounter = 1;
  let particles = [];
  let scorchMarks = [];
  let wallFlashes = []; // reactive wall glow pulses on bullet impact
  let wallDecals = []; // persistent chip/scorch marks on wall faces
  let ambientMotes = []; // subtle drifting themed particles
  let bankShotFlashes = []; // brief ricochet trajectory preview lines
  let speechBubbles = [];
  let feedLog = [];
  let matchTimeline = [];
  let bulletUidCounter = 1;
  let lastRankedBots = [];
  let selectedAnalysisBotId = 0;

  // Auto-Train Multi-Match Evolution State
  let autoTrainRemaining = 0;
  let autoTrainTotal = 5;
  let autoTrainTimerId = null;
  let prevSpeedBeforeTrain = 1;

  let matchStats = {
    totalShots: 0,
    totalBounces: 0
  };

  // ==================== DOM REFERENCES ====================
  const setupScreen = document.getElementById('setup-screen');
  const arenaScreen = document.getElementById('arena-screen');
  const battleControls = document.getElementById('battle-controls');
  const botConfigGrid = document.getElementById('bot-config-grid');

  const btnBgm = document.getElementById('btn-bgm');
  const btnSfx = document.getElementById('btn-sfx');
  const themePill = document.getElementById('theme-pill');
  const telemetryThemeEl = document.getElementById('telemetry-theme');

  const btnCountMinus = document.getElementById('btn-count-minus');
  const btnCountPlus = document.getElementById('btn-count-plus');
  const botCountDisplay = document.getElementById('bot-count-display');
  const btnQuickPvp = document.getElementById('btn-quick-pvp');
  const btnQuickCode = document.getElementById('btn-quick-code');
  const btnRandomize = document.getElementById('btn-randomize');
  const btnStartBattle = document.getElementById('btn-start-battle');
  const speedControls = document.getElementById('speed-controls');
  const btnLidar = document.getElementById('btn-lidar');
  const btnPause = document.getElementById('btn-pause');
  const btnAutoTrain = document.getElementById('btn-auto-train');
  const btnReset = document.getElementById('btn-reset');
  const btnBackSetup = document.getElementById('btn-back-setup');

  // Rules Studio & Modals DOM
  const btnToggleRules = document.getElementById('btn-toggle-rules');
  const rulesEditorBody = document.getElementById('rules-editor-body');
  const btnViewPrompt = document.getElementById('btn-view-prompt');
  const btnCopyPrompt = document.getElementById('btn-copy-prompt');
  const btnResetRules = document.getElementById('btn-reset-rules');
  const ruleAiAmmo = document.getElementById('rule-ai-ammo');
  const rulePlayerAmmo = document.getElementById('rule-player-ammo');
  const ruleReload = document.getElementById('rule-reload');
  const ruleHp = document.getElementById('rule-hp');
  const rulePlayerHp = document.getElementById('rule-player-hp');
  const ruleDamage = document.getElementById('rule-damage');
  const ruleBspeed = document.getElementById('rule-bspeed');
  const ruleRange = document.getElementById('rule-range');
  const ruleBounces = document.getElementById('rule-bounces');
  const ruleFog = document.getElementById('rule-fog');
  const ruleSeed = document.getElementById('rule-seed');

  const promptModal = document.getElementById('prompt-modal');
  const promptPreviewText = document.getElementById('prompt-preview-text');
  const promptCopyStatus = document.getElementById('prompt-copy-status');
  const btnClosePrompt = document.getElementById('btn-close-prompt');
  const btnClosePrompt2 = document.getElementById('btn-close-prompt-2');
  const btnModalCopyPrompt = document.getElementById('btn-modal-copy-prompt');

  const codeModal = document.getElementById('code-modal');
  const codeModalDot = document.getElementById('code-modal-dot');
  const codeModalTitle = document.getElementById('code-modal-title');
  const codeModalAuthor = document.getElementById('code-modal-author');
  const codeModalSub = document.getElementById('code-modal-sub');
  const tabBtnCode = document.getElementById('tab-btn-code');
  const tabBtnMind = document.getElementById('tab-btn-mind');
  const tabBtnBrain = document.getElementById('tab-btn-brain');
  const tabPanelCode = document.getElementById('tab-panel-code');
  const tabPanelMind = document.getElementById('tab-panel-mind');
  const tabPanelBrain = document.getElementById('tab-panel-brain');
  const brainStatsRow = document.getElementById('brain-stats-row');
  const brainLogList = document.getElementById('brain-log-list');
  const brainJsonView = document.getElementById('brain-json-view');
  const btnResetBrain = document.getElementById('btn-reset-brain');
  const codeEditorTools = document.getElementById('code-editor-tools');
  const sampleBotSelect = document.getElementById('sample-bot-select');
  const inputUploadJs = document.getElementById('input-upload-js');
  const btnDownloadJs = document.getElementById('btn-download-js');
  const botCodeTextarea = document.getElementById('bot-code-textarea');
  const mindAlgorithmView = document.getElementById('mind-algorithm-view');
  const mindThoughtsView = document.getElementById('mind-thoughts-view');
  const codeValidationStatus = document.getElementById('code-validation-status');
  const btnCloseCode = document.getElementById('btn-close-code');
  const btnCancelCode = document.getElementById('btn-cancel-code');
  const btnSaveCode = document.getElementById('btn-save-code');

  // Post-Match Analysis Modal DOM
  const btnOpenAnalysis = document.getElementById('btn-open-analysis');
  const analysisModal = document.getElementById('analysis-modal');
  const analysisBotTabs = document.getElementById('analysis-bot-tabs');
  const analysisMetricsGrid = document.getElementById('analysis-metrics-grid');
  const analysisInsightsList = document.getElementById('analysis-insights-list');
  const analysisPromptHeading = document.getElementById('analysis-prompt-heading');
  const analysisFeedbackText = document.getElementById('analysis-feedback-text');
  const analysisCopyStatus = document.getElementById('analysis-copy-status');
  const btnCloseAnalysis = document.getElementById('btn-close-analysis');
  const btnCloseAnalysis2 = document.getElementById('btn-close-analysis-2');
  const btnCopyAnalysis = document.getElementById('btn-copy-analysis');

  const canvas = document.getElementById('arena-canvas');
  const ctx = canvas.getContext('2d');
  const pauseOverlay = document.getElementById('pause-overlay');
  const victoryOverlay = document.getElementById('victory-overlay');
  const victoryBadge = document.getElementById('victory-badge');
  const winnerSwatch = document.getElementById('winner-swatch');
  const winnerNameEl = document.getElementById('winner-name');
  const winnerMetaEl = document.getElementById('winner-meta');
  const podiumTbody = document.getElementById('podium-tbody');
  const btnRematchNew = document.getElementById('btn-rematch-new');
  const btnVictoryAutoTrain = document.getElementById('btn-victory-autotrain');
  const btnRematchSame = document.getElementById('btn-rematch-same');
  const btnVictorySetup = document.getElementById('btn-victory-setup');

  const hudCardsContainer = document.getElementById('hud-cards');
  const matchTimerEl = document.getElementById('match-timer');
  const statShotsEl = document.getElementById('stat-shots');
  const statBouncesEl = document.getElementById('stat-bounces');
  const statDropEl = document.getElementById('stat-drop');
  const battleFeedEl = document.getElementById('battle-feed');

  // HiDPI canvas setup
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = CANVAS_W * DPR;
  canvas.height = CANVAS_H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

  // ==================== UTILITY FUNCTIONS ====================
  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function hypot(dx, dy) {
    return Math.sqrt(dx * dx + dy * dy);
  }

  function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function turnToward(current, target, maxStep) {
    const diff = normalizeAngle(target - current);
    if (Math.abs(diff) <= maxStep) return target;
    return normalizeAngle(current + Math.sign(diff) * maxStep);
  }

  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function randChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function formatTime(sec) {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  function macroToWorldCenter(mx, my) {
    return {
      x: (2 + mx * 4) * TILE + TILE * 0.5,
      y: (2 + my * 4) * TILE + TILE * 0.5
    };
  }

  function isSolidTile(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return true;
    return grid[ty][tx] !== 0;
  }

  // ==================== ARENA RULES & SEEDED PRNG ====================
  function syncRulesFromInputs() {
    arenaRules.aiAmmo = clamp(Math.round(Number(ruleAiAmmo.value) || DEFAULT_RULES.aiAmmo), 1, 15);
    arenaRules.playerAmmo = clamp(Math.round(Number(rulePlayerAmmo.value) || DEFAULT_RULES.playerAmmo), 1, 30);
    arenaRules.reloadPerBullet = clamp(Number(ruleReload.value) || DEFAULT_RULES.reloadPerBullet, 0.3, 5);
    arenaRules.maxHp = clamp(Math.round(Number(ruleHp.value) || DEFAULT_RULES.maxHp), 40, 200);
    arenaRules.playerHp = clamp(Math.round(Number(rulePlayerHp.value) || DEFAULT_RULES.playerHp), 40, 1000);
    arenaRules.bulletDamage = clamp(Math.round(Number(ruleDamage.value) || DEFAULT_RULES.bulletDamage), 5, 50);
    arenaRules.bulletSpeed = clamp(Math.round(Number(ruleBspeed.value) || DEFAULT_RULES.bulletSpeed), 120, 450);
    arenaRules.maxRange = clamp(Math.round(Number(ruleRange.value) || DEFAULT_RULES.maxRange), 250, 900);
    arenaRules.maxBounces = clamp(Math.round(Number(ruleBounces.value) || DEFAULT_RULES.maxBounces), 0, 6);
    arenaRules.fogOfWar = ruleFog.value === 'on';
    arenaRules.seed = (ruleSeed.value || '').trim();

    MAX_HP = arenaRules.maxHp;
    PLAYER_MAX_HP = arenaRules.playerHp;
    AI_MAG_SIZE = arenaRules.aiAmmo;
    PLAYER_MAG_SIZE = arenaRules.playerAmmo;
    RELOAD_PER_BULLET = arenaRules.reloadPerBullet;
    BULLET_SPEED = arenaRules.bulletSpeed;
    BULLET_MAX_RANGE = arenaRules.maxRange;
    BULLET_MAX_BOUNCES = arenaRules.maxBounces;
    BULLET_DAMAGE = arenaRules.bulletDamage;
  }

  function populateRulesInputs() {
    ruleAiAmmo.value = arenaRules.aiAmmo;
    rulePlayerAmmo.value = arenaRules.playerAmmo;
    ruleReload.value = arenaRules.reloadPerBullet;
    ruleHp.value = arenaRules.maxHp;
    rulePlayerHp.value = arenaRules.playerHp;
    ruleDamage.value = arenaRules.bulletDamage;
    ruleBspeed.value = arenaRules.bulletSpeed;
    ruleRange.value = arenaRules.maxRange;
    ruleBounces.value = arenaRules.maxBounces;
    ruleFog.value = arenaRules.fogOfWar ? 'on' : 'off';
    ruleSeed.value = arenaRules.seed;
  }

  function makeSeededRng(seedStr) {
    if (!seedStr) return Math.random;
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seedStr.length; i++) {
      h ^= seedStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    let a = h >>> 0;
    return function mulberry32() {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ==================== SETUP UI ====================
  function getActiveSpawnForIndex(idx, total) {
    if (total === 2) {
      // Opposite diagonal corners for balanced 1v1
      return idx === 0 ? BOT_SLOTS[0].spawn : BOT_SLOTS[3].spawn;
    }
    return BOT_SLOTS[idx].spawn;
  }

  function hasRoleInActive(role) {
    for (let i = 0; i < activeBotCount; i++) {
      if (botConfigs[i].role === role) return true;
    }
    return false;
  }

  function assignRole(slotIdx, newRole) {
    if (newRole === 'p1' || newRole === 'p2') {
      // Ensure P1 and P2 are each assigned to at most one active robot
      botConfigs.forEach((c, i) => {
        if (i !== slotIdx && c.role === newRole) c.role = 'ai';
      });
    }
    botConfigs[slotIdx].role = newRole;
    renderSetupCards();
  }

  function setBotCount(nextCount) {
    activeBotCount = clamp(nextCount, 2, 4);
    // Clear human role from inactive slots so they don't hide P1/P2
    for (let i = activeBotCount; i < BOT_SLOTS.length; i++) {
      if (botConfigs[i].role !== 'ai') botConfigs[i].role = 'ai';
    }
    renderSetupCards();
  }

  function renderSetupCards() {
    botCountDisplay.textContent = String(activeBotCount);
    btnCountMinus.disabled = activeBotCount <= 2;
    btnCountPlus.disabled = activeBotCount >= 4;

    botConfigGrid.className = `bot-config-grid count-${activeBotCount}`;
    botConfigGrid.innerHTML = '';

    const bothHuman = hasRoleInActive('p1') && hasRoleInActive('p2');

    for (let idx = 0; idx < activeBotCount; idx++) {
      const slot = BOT_SLOTS[idx];
      const cfg = botConfigs[idx];
      const preset = AI_PRESETS[cfg.presetId];
      const isHuman = cfg.role === 'p1' || cfg.role === 'p2';
      const isCode = cfg.role === 'code';

      const card = document.createElement('div');
      card.className = `bot-card${isHuman || isCode ? ' player-card-active' : ''}`;
      card.style.setProperty('--bot-color', slot.color);

      const optionsHtml = PRESET_LIST.map(p =>
        `<option value="${p.id}" ${p.id === cfg.presetId ? 'selected' : ''}>${p.name}</option>`
      ).join('');

      let driveKeys = 'W S / ↑ ↓';
      let turnKeys = 'A D / ← →';
      let fireKeys = 'Space / Click';
      let regenKeys = 'E / Q';
      if (cfg.role === 'p1' && bothHuman) {
        driveKeys = 'W / S';
        turnKeys = 'A / D';
        fireKeys = 'Space / F';
        regenKeys = 'E / Q';
      } else if (cfg.role === 'p2') {
        driveKeys = '↑ / ↓';
        turnKeys = '← / →';
        fireKeys = 'Enter / / / RShift';
        regenKeys = '. / Num0';
      }

      let roleContentHtml = '';
      if (isHuman) {
        roleContentHtml = `
          <div class="player-controls-box">
            <div class="player-controls-title">
              <span>${cfg.role === 'p1' ? 'Player 1' : 'Player 2'} Tank Controls</span>
              <span class="player-ammo-badge">${arenaRules.playerHp} HP · ${arenaRules.playerAmmo} Bullets</span>
            </div>
            <div class="control-keys-list">
              <div class="control-key-row"><span>Forward / Reverse</span><span class="kbd-chip">${driveKeys}</span></div>
              <div class="control-key-row"><span>Rotate Facing</span><span class="kbd-chip">${turnKeys}</span></div>
              <div class="control-key-row"><span>Fire Forward</span><span class="kbd-chip">${fireKeys}</span></div>
              <div class="control-key-row"><span>Regen (+10% HP)</span><span class="kbd-chip">${regenKeys}</span></div>
              <div class="control-key-row"><span>Pause / LiDAR</span><span class="kbd-chip">P / L</span></div>
            </div>
            <p class="player-reload-note">
              <strong>Aimbot every 2nd shot</strong> · <strong>Regen</strong> costs <strong>3 ammo</strong> (10s CD). Reloads <strong>1/${arenaRules.reloadPerBullet}s</strong>.
            </p>
          </div>
        `;
      } else if (isCode) {
        const previewText = cfg.codeAlgorithm
          ? cfg.codeAlgorithm
          : 'Click "Edit / Paste Code" to paste code generated by Gemini, Grok, ChatGPT, Claude, or DeepSeek.';
        const modelChipsHtml = AI_MODEL_NAMES.map(m =>
          `<button type="button" class="model-chip ${cfg.name.toLowerCase() === m.toLowerCase() ? 'active' : ''}" data-model="${m}">${m}</button>`
        ).join('');
        const brainRec = loadBotBrainRecord(slot.id, cfg.name);
        const brainPillHtml = brainRec.meta.matches > 0
          ? `<span class="brain-gen-pill" title="Self-learning brain persisted across ${brainRec.meta.matches} matches">Gen #${brainRec.meta.matches + 1} · ${brainRec.meta.wins}W</span>`
          : `<span class="brain-gen-pill" title="Self-learning brain ready (Gen 1)">Gen #1</span>`;
        roleContentHtml = `
          <div class="code-bot-box">
            <div class="code-bot-meta">
              <span class="code-author-tag" title="${escapeHtml(cfg.codeAuthor || 'Custom AI')}">${escapeHtml(cfg.codeAuthor || 'Custom AI')}</span>
              <div style="display:flex;align-items:center;gap:5px;">
                ${brainPillHtml}
                <span class="code-status-pill ${cfg.codeValid ? 'ok' : 'err'}">${cfg.codeValid ? 'Ready ✓' : 'Error'}</span>
              </div>
            </div>
            <div class="model-chips-row" title="Quick-name robot by AI model">${modelChipsHtml}</div>
            <div class="code-summary-preview">${escapeHtml(previewText)}</div>
            <div class="code-card-actions">
              <button type="button" class="ctrl-btn" id="btn-edit-code-${idx}">Code</button>
              <button type="button" class="ctrl-btn" id="btn-view-mind-${idx}">Thoughts</button>
              <button type="button" class="ctrl-btn" id="btn-view-brain-${idx}">Brain</button>
            </div>
          </div>
        `;
      } else {
        roleContentHtml = `
          <div class="field-group">
            <label class="field-label" for="bot-preset-${idx}">AI Characteristic Preset · ${arenaRules.aiAmmo} Bullets</label>
            <select id="bot-preset-${idx}" class="select-input">
              ${optionsHtml}
            </select>
          </div>

          <div class="preset-desc" id="bot-desc-${idx}">${preset.desc}</div>

          <div class="sliders-section">
            <div class="slider-row">
              <div class="slider-head">
                <span>Aggression</span>
                <span class="slider-val" id="val-agg-${idx}">${cfg.aggression}</span>
              </div>
              <input id="sl-agg-${idx}" class="range-input" type="range" min="0" max="100" value="${cfg.aggression}" />
            </div>

            <div class="slider-row">
              <div class="slider-head">
                <span>Caution / Cover</span>
                <span class="slider-val" id="val-cau-${idx}">${cfg.caution}</span>
              </div>
              <input id="sl-cau-${idx}" class="range-input" type="range" min="0" max="100" value="${cfg.caution}" />
            </div>

            <div class="slider-row">
              <div class="slider-head">
                <span>Ricochet Tendency</span>
                <span class="slider-val" id="val-ric-${idx}">${cfg.ricochet}</span>
              </div>
              <input id="sl-ric-${idx}" class="range-input" type="range" min="0" max="100" value="${cfg.ricochet}" />
            </div>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="bot-card-accent" style="background: ${slot.color};"></div>
        <div class="bot-card-body">
          <div class="bot-card-head">
            <span class="bot-slot-badge" style="background: ${slot.soft}; color: ${slot.dark};">
              ${slot.slotLabel}
            </span>
            <div class="bot-avatar" style="background: ${slot.soft}; color: ${slot.color};">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="7" fill="currentColor" opacity="0.22"/>
                <circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="2"/>
                <line x1="12" y1="12" x2="20" y2="12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
              </svg>
            </div>
          </div>

          <div class="role-segmented" role="group" aria-label="Control mode for ${slot.slotLabel}">
            <button type="button" class="role-btn ${cfg.role === 'ai' ? 'active' : ''}" data-role="ai">AI</button>
            <button type="button" class="role-btn ${cfg.role === 'code' ? 'active role-code' : ''}" data-role="code">Code</button>
            <button type="button" class="role-btn ${cfg.role === 'p1' ? 'active role-human' : ''}" data-role="p1">P1</button>
            <button type="button" class="role-btn ${cfg.role === 'p2' ? 'active role-human' : ''}" data-role="p2">P2</button>
          </div>

          <div class="field-group">
            <label class="field-label" for="bot-name-${idx}">${isHuman ? 'Player Callsign' : isCode ? 'Coded Robot Name' : 'Robot Name'}</label>
            <input id="bot-name-${idx}" class="text-input" type="text" maxlength="18" value="${escapeHtml(cfg.name)}" />
          </div>

          ${roleContentHtml}
        </div>
      `;

      botConfigGrid.appendChild(card);

      // Role selector listeners
      card.querySelectorAll('.role-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          SoundEngine.unlock();
          assignRole(idx, btn.dataset.role);
        });
      });

      const nameInput = card.querySelector(`#bot-name-${idx}`);
      nameInput.addEventListener('input', () => {
        cfg.name = nameInput.value.trim() || slot.defaultName;
      });

      if (isCode) {
        card.querySelectorAll('.model-chip').forEach(chip => {
          chip.addEventListener('click', () => {
            cfg.name = chip.dataset.model;
            if (!cfg.codeAuthor || cfg.codeAuthor.startsWith('Sample')) {
              cfg.codeAuthor = chip.dataset.model;
            }
            renderSetupCards();
          });
        });
        card.querySelector(`#btn-edit-code-${idx}`).addEventListener('click', () => {
          openCodeModal(idx, 'code', false);
        });
        card.querySelector(`#btn-view-mind-${idx}`).addEventListener('click', () => {
          openCodeModal(idx, 'mind', false);
        });
        card.querySelector(`#btn-view-brain-${idx}`).addEventListener('click', () => {
          openCodeModal(idx, 'brain', false);
        });
      } else if (!isHuman) {
        const presetSelect = card.querySelector(`#bot-preset-${idx}`);
        const descEl = card.querySelector(`#bot-desc-${idx}`);
        const slAgg = card.querySelector(`#sl-agg-${idx}`);
        const slCau = card.querySelector(`#sl-cau-${idx}`);
        const slRic = card.querySelector(`#sl-ric-${idx}`);
        const valAgg = card.querySelector(`#val-agg-${idx}`);
        const valCau = card.querySelector(`#val-cau-${idx}`);
        const valRic = card.querySelector(`#val-ric-${idx}`);

        presetSelect.addEventListener('change', () => {
          const chosen = AI_PRESETS[presetSelect.value];
          cfg.presetId = chosen.id;
          cfg.aggression = chosen.defaults.aggression;
          cfg.caution = chosen.defaults.caution;
          cfg.ricochet = chosen.defaults.ricochet;

          descEl.textContent = chosen.desc;
          slAgg.value = cfg.aggression;
          slCau.value = cfg.caution;
          slRic.value = cfg.ricochet;
          valAgg.textContent = cfg.aggression;
          valCau.textContent = cfg.caution;
          valRic.textContent = cfg.ricochet;
        });

        slAgg.addEventListener('input', () => {
          cfg.aggression = Number(slAgg.value);
          valAgg.textContent = cfg.aggression;
        });

        slCau.addEventListener('input', () => {
          cfg.caution = Number(slCau.value);
          valCau.textContent = cfg.caution;
        });

        slRic.addEventListener('input', () => {
          cfg.ricochet = Number(slRic.value);
          valRic.textContent = cfg.ricochet;
        });
      }
    }
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function randomizeAllConfigs() {
    // Shuffle presets so all 4 bots get distinct exciting personalities
    const shuffled = [...PRESET_LIST].sort(() => Math.random() - 0.5);
    botConfigs.forEach((cfg, idx) => {
      const preset = shuffled[idx % shuffled.length];
      cfg.presetId = preset.id;
      cfg.name = randChoice(RANDOM_NAMES[idx]);
      cfg.aggression = clamp(Math.round(preset.defaults.aggression + randRange(-12, 12)), 5, 100);
      cfg.caution = clamp(Math.round(preset.defaults.caution + randRange(-12, 12)), 5, 100);
      cfg.ricochet = clamp(Math.round(preset.defaults.ricochet + randRange(-12, 12)), 5, 100);
    });
    renderSetupCards();
  }

  // ==================== MAZE GENERATION ====================
  function generateMaze() {
    const rng = makeSeededRng(arenaRules.seed);
    const pick = arr => arr[Math.floor(rng() * arr.length)];

    // 1. Macro-cell connectivity via Randomized DFS spanning tree (guaranteed 100% connected)
    const visited = Array.from({ length: MACRO_H }, () => Array(MACRO_W).fill(false));
    const wallsRight = Array.from({ length: MACRO_H }, () => Array(MACRO_W).fill(true));
    const wallsDown = Array.from({ length: MACRO_H }, () => Array(MACRO_W).fill(true));

    const dirs = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 }
    ];

    function openBetween(x1, y1, x2, y2) {
      if (x2 === x1 + 1) wallsRight[y1][x1] = false;
      else if (x2 === x1 - 1) wallsRight[y1][x2] = false;
      else if (y2 === y1 + 1) wallsDown[y1][x1] = false;
      else if (y2 === y1 - 1) wallsDown[y2][x1] = false;
    }

    function isConnected(x1, y1, x2, y2) {
      if (x2 < 0 || y2 < 0 || x2 >= MACRO_W || y2 >= MACRO_H) return false;
      if (x2 === x1 + 1) return !wallsRight[y1][x1];
      if (x2 === x1 - 1) return !wallsRight[y1][x2];
      if (y2 === y1 + 1) return !wallsDown[y1][x1];
      if (y2 === y1 - 1) return !wallsDown[y2][x1];
      return false;
    }

    // Randomized DFS from center
    const stack = [{ x: 5, y: 3 }];
    visited[3][5] = true;
    while (stack.length > 0) {
      const cur = stack[stack.length - 1];
      const neighbors = dirs
        .map(d => ({ x: cur.x + d.dx, y: cur.y + d.dy }))
        .filter(n => n.x >= 0 && n.y >= 0 && n.x < MACRO_W && n.y < MACRO_H && !visited[n.y][n.x]);

      if (neighbors.length === 0) {
        stack.pop();
      } else {
        const next = pick(neighbors);
        openBetween(cur.x, cur.y, next.x, next.y);
        visited[next.y][next.x] = true;
        stack.push(next);
      }
    }

    // 2. Carve Central Arena Plaza (mx: 4..6, my: 3..4) and open cardinal entrances
    for (let my = 3; my <= 4; my++) {
      for (let mx = 4; mx <= 6; mx++) {
        if (mx < 6) wallsRight[my][mx] = false;
        if (my < 4) wallsDown[my][mx] = false;
      }
    }
    // Cardinal & flank entrances into central plaza
    wallsDown[2][5] = false; // North entrance
    wallsDown[4][5] = false; // South entrance
    wallsRight[3][3] = false; // West upper
    wallsRight[4][3] = false; // West lower
    wallsRight[3][6] = false; // East upper
    wallsRight[4][6] = false; // East lower

    // 3. Ensure all 4 spawn corners have BOTH exits open (never trapped!)
    wallsRight[0][0] = false;
    wallsDown[0][0] = false;
    wallsRight[0][MACRO_W - 2] = false;
    wallsDown[0][MACRO_W - 1] = false;
    wallsRight[MACRO_H - 1][0] = false;
    wallsDown[MACRO_H - 2][0] = false;
    wallsRight[MACRO_H - 1][MACRO_W - 2] = false;
    wallsDown[MACRO_H - 2][MACRO_W - 1] = false;

    // 4. Eliminate ALL dead ends (braid the maze so bots flow smoothly with zero traps)
    for (let my = 0; my < MACRO_H; my++) {
      for (let mx = 0; mx < MACRO_W; mx++) {
        let openCount = 0;
        const closedNeighbors = [];
        for (const d of dirs) {
          const nx = mx + d.dx;
          const ny = my + d.dy;
          if (nx < 0 || ny < 0 || nx >= MACRO_W || ny >= MACRO_H) continue;
          if (isConnected(mx, my, nx, ny)) {
            openCount++;
          } else {
            closedNeighbors.push({ x: nx, y: ny });
          }
        }
        if (openCount <= 1 && closedNeighbors.length > 0) {
          const chosen = pick(closedNeighbors);
          openBetween(mx, my, chosen.x, chosen.y);
        }
      }
    }

    // 5. Open extra strategic corridor loops (~26%) to create sniper lanes & flank circuits
    for (let my = 0; my < MACRO_H; my++) {
      for (let mx = 0; mx < MACRO_W; mx++) {
        if (mx < MACRO_W - 1 && wallsRight[my][mx] && rng() < 0.25) {
          wallsRight[my][mx] = false;
        }
        if (my < MACRO_H - 1 && wallsDown[my][mx] && rng() < 0.25) {
          wallsDown[my][mx] = false;
        }
      }
    }

    // 6. Convert macro structure to 45x33 tile grid (0=open, 1=wall, 2=pillar)
    grid = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(1));

    // Carve macro cell interiors (each 3x3 tiles = 60x60px)
    for (let my = 0; my < MACRO_H; my++) {
      for (let mx = 0; mx < MACRO_W; mx++) {
        const bx = 1 + mx * 4;
        const by = 1 + my * 4;
        for (let dy = 0; dy < 3; dy++) {
          for (let dx = 0; dx < 3; dx++) {
            grid[by + dy][bx + dx] = 0;
          }
        }
        // Carve right passage
        if (mx < MACRO_W - 1 && !wallsRight[my][mx]) {
          for (let dy = 0; dy < 3; dy++) {
            grid[by + dy][bx + 3] = 0;
          }
        }
        // Carve bottom passage
        if (my < MACRO_H - 1 && !wallsDown[my][mx]) {
          for (let dx = 0; dx < 3; dx++) {
            grid[by + 3][bx + dx] = 0;
          }
        }
      }
    }

    // Style central cover pillars distinctly (value = 2)
    // Inside central plaza (tx: 17..27, ty: 13..19), posts (20,16) and (24,16) stand cleanly
    // with 60px (3-tile) corridors on every side! Also check gateway posts (16,16) and (28,16).
    const centralPillars = [
      [20, 16],
      [24, 16],
      [16, 16],
      [28, 16]
    ];
    for (const [px, py] of centralPillars) {
      grid[py][px] = 2;
    }

    // Also mark any isolated freestanding 1x1 interior corner posts as cover pillars (type 2)
    for (let ty = 1; ty < GRID_H - 1; ty++) {
      for (let tx = 1; tx < GRID_W - 1; tx++) {
        if (grid[ty][tx] === 1) {
          const adjSolid =
            (grid[ty - 1][tx] !== 0 ? 1 : 0) +
            (grid[ty + 1][tx] !== 0 ? 1 : 0) +
            (grid[ty][tx - 1] !== 0 ? 1 : 0) +
            (grid[ty][tx + 1] !== 0 ? 1 : 0);
          if (adjSolid === 0) {
            grid[ty][tx] = 2;
          }
        }
      }
    }

    // 6b. Embed 12 Special Bullet-Triggered Wall Tiles (4 Range +R, 4 Speed », 4 Spread 3×) on exposed interior walls
    specialWallTiles = [];
    const exposedInteriorWalls = [];
    for (let ty = 2; ty < GRID_H - 2; ty++) {
      for (let tx = 2; tx < GRID_W - 2; tx++) {
        if (grid[ty][tx] !== 1) continue;
        const touchesOpen =
          grid[ty - 1][tx] === 0 ||
          grid[ty + 1][tx] === 0 ||
          grid[ty][tx - 1] === 0 ||
          grid[ty][tx + 1] === 0;
        if (touchesOpen) {
          exposedInteriorWalls.push({ tx, ty });
        }
      }
    }
    // Fisher-Yates shuffle with seeded rng
    for (let i = exposedInteriorWalls.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = exposedInteriorWalls[i];
      exposedInteriorWalls[i] = exposedInteriorWalls[j];
      exposedInteriorWalls[j] = tmp;
    }
    const specialPlan = [3, 4, 5, 3, 4, 5, 3, 4, 5, 3, 4, 5];
    for (const tileType of specialPlan) {
      let chosen = null;
      for (const cand of exposedInteriorWalls) {
        if (grid[cand.ty][cand.tx] !== 1) continue;
        const tooClose = specialWallTiles.some(
          s => Math.abs(s.tx - cand.tx) + Math.abs(s.ty - cand.ty) < 5
        );
        if (!tooClose) {
          chosen = cand;
          break;
        }
      }
      if (chosen) {
        grid[chosen.ty][chosen.tx] = tileType;
        specialWallTiles.push({
          tx: chosen.tx,
          ty: chosen.ty,
          x: chosen.tx * TILE + TILE * 0.5,
          y: chosen.ty * TILE + TILE * 0.5,
          tileType,
          type: SPECIAL_TILE_TYPES[tileType].type
        });
      }
    }

    // 7. Compute 3x3 clearance spine (walkableCenter) & intersections
    walkableCenter = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(false));
    corridorIntersections = [];

    for (let ty = 1; ty < GRID_H - 1; ty++) {
      for (let tx = 1; tx < GRID_W - 1; tx++) {
        let clear = true;
        for (let dy = -1; dy <= 1 && clear; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (grid[ty + dy][tx + dx] !== 0) {
              clear = false;
              break;
            }
          }
        }
        walkableCenter[ty][tx] = clear;
      }
    }

    for (let my = 0; my < MACRO_H; my++) {
      for (let mx = 0; mx < MACRO_W; mx++) {
        const tx = 2 + mx * 4;
        const ty = 2 + my * 4;
        if (walkableCenter[ty][tx]) {
          corridorIntersections.push({
            tx,
            ty,
            x: tx * TILE + TILE * 0.5,
            y: ty * TILE + TILE * 0.5
          });
        }
      }
    }

    // 8. Verify 100% flood-fill connectivity across walkableCenter from spawn 0
    const reachable = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(false));
    const q = [{ tx: 2, ty: 2 }];
    reachable[2][2] = true;
    let head = 0;
    while (head < q.length) {
      const { tx, ty } = q[head++];
      for (const d of dirs) {
        const nx = tx + d.dx;
        const ny = ty + d.dy;
        if (nx > 0 && ny > 0 && nx < GRID_W - 1 && ny < GRID_H - 1 && walkableCenter[ny][nx] && !reachable[ny][nx]) {
          reachable[ny][nx] = true;
          q.push({ tx: nx, ty: ny });
        }
      }
    }

    // Sanity check all 4 spawns are connected (should always pass due to spanning tree)
    for (const slot of BOT_SLOTS) {
      const stx = 2 + slot.spawn.mx * 4;
      const sty = 2 + slot.spawn.my * 4;
      if (!reachable[sty][stx]) {
        return generateMaze();
      }
    }

    // Pick a fresh random maze theme (avoid repeating same theme twice in a row)
    const candidates = MAZE_THEMES.filter(t => !currentTheme || t.id !== currentTheme.id);
    currentTheme = randChoice(candidates);
    themePill.textContent = `Theme: ${currentTheme.name}`;
    if (telemetryThemeEl) telemetryThemeEl.textContent = currentTheme.name;

    initAmbientMotes();
    bakeMazeCanvas();
  }

  function initAmbientMotes() {
    ambientMotes = [];
    for (let i = 0; i < 22; i++) {
      ambientMotes.push({
        x: randRange(TILE, CANVAS_W - TILE),
        y: randRange(TILE, CANVAS_H - TILE),
        vx: randRange(-9, 12),
        vy: randRange(4, 14),
        size: randRange(2, 4.5),
        angle: randRange(0, Math.PI * 2),
        spin: randRange(-1.4, 1.4),
        phase: randRange(0, Math.PI * 2)
      });
    }
  }

  // Pre-render the static light-mode themed maze onto an offscreen canvas
  function bakeMazeCanvas() {
    const th = currentTheme || MAZE_THEMES[0];
    mazeOffscreen = document.createElement('canvas');
    mazeOffscreen.width = CANVAS_W * DPR;
    mazeOffscreen.height = CANVAS_H * DPR;
    const mctx = mazeOffscreen.getContext('2d');
    mctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // 1. Clean themed light-mode floor
    mctx.fillStyle = th.floor;
    mctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Subtle central arena plaza tint + thematic floor centerpiece
    mctx.fillStyle = th.plaza;
    mctx.fillRect(17 * TILE, 13 * TILE, 11 * TILE, 7 * TILE);
    mctx.strokeStyle = th.plazaBorder;
    mctx.lineWidth = 1.25;
    mctx.strokeRect(17 * TILE + 0.5, 13 * TILE + 0.5, 11 * TILE - 1, 7 * TILE - 1);

    // Subtle central ring emblem
    mctx.save();
    mctx.strokeStyle = th.plazaBorder;
    mctx.lineWidth = 1.25;
    mctx.beginPath();
    mctx.arc(CANVAS_W * 0.5, CANVAS_H * 0.5, 44, 0, Math.PI * 2);
    mctx.stroke();
    mctx.setLineDash([4, 4]);
    mctx.beginPath();
    mctx.arc(CANVAS_W * 0.5, CANVAS_H * 0.5, 26, 0, Math.PI * 2);
    mctx.stroke();
    mctx.restore();

    // Subtle tile grid lines
    mctx.strokeStyle = th.gridLine;
    mctx.lineWidth = 1;
    mctx.beginPath();
    for (let x = TILE; x < CANVAS_W; x += TILE) {
      mctx.moveTo(x + 0.5, 0);
      mctx.lineTo(x + 0.5, CANVAS_H);
    }
    for (let y = TILE; y < CANVAS_H; y += TILE) {
      mctx.moveTo(0, y + 0.5);
      mctx.lineTo(CANVAS_W, y + 0.5);
    }
    mctx.stroke();

    // 2. Soft architectural wall drop shadows
    mctx.fillStyle = th.shadow;
    for (let ty = 0; ty < GRID_H; ty++) {
      for (let tx = 0; tx < GRID_W; tx++) {
        if (grid[ty][tx] !== 0) {
          mctx.fillRect(tx * TILE + 3, ty * TILE + 4, TILE, TILE);
        }
      }
    }

    // 3. Draw walls & central pillars with crisp 2.5D bevel feel
    for (let ty = 0; ty < GRID_H; ty++) {
      for (let tx = 0; tx < GRID_W; tx++) {
        const cell = grid[ty][tx];
        if (cell === 0) continue;
        const x = tx * TILE;
        const y = ty * TILE;

        if (cell === 1) {
          mctx.fillStyle = th.wallFill;
          mctx.fillRect(x, y, TILE, TILE);

          mctx.fillStyle = th.wallHighlight;
          mctx.fillRect(x, y, TILE, 3);

          if (ty + 1 < GRID_H && grid[ty + 1][tx] === 0) {
            mctx.fillStyle = th.wallLip;
            mctx.fillRect(x, y + TILE - 4, TILE, 4);
          }
        } else if (cell === 2) {
          // Reinforced Booster Cover Pillar (bouncing here supercharges shots!)
          mctx.fillStyle = th.pillarFill;
          mctx.fillRect(x, y, TILE, TILE);

          mctx.fillStyle = th.pillarInner;
          mctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 5);

          mctx.strokeStyle = th.pillarOutline;
          mctx.lineWidth = 1.3;
          mctx.strokeRect(x + 0.75, y + 0.75, TILE - 1.5, TILE - 1.5);

          // Center diamond energy core on pillars
          mctx.fillStyle = th.pillarDot;
          mctx.beginPath();
          mctx.moveTo(x + TILE * 0.5, y + 5);
          mctx.lineTo(x + TILE - 5, y + TILE * 0.5);
          mctx.lineTo(x + TILE * 0.5, y + TILE - 5);
          mctx.lineTo(x + 5, y + TILE * 0.5);
          mctx.closePath();
          mctx.fill();
        } else if (cell >= 3 && cell <= 5) {
          // Special Bullet-Triggered Wall Tiles (3=Range +R, 4=Speed », 5=Spread 3×)
          const st = SPECIAL_TILE_TYPES[cell];
          mctx.fillStyle = st.soft;
          mctx.fillRect(x, y, TILE, TILE);

          mctx.strokeStyle = st.border;
          mctx.lineWidth = 2;
          mctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);

          mctx.fillStyle = st.color;
          mctx.fillRect(x + 2, y + 2, TILE - 4, 3);

          mctx.font = '800 9px "JetBrains Mono", Consolas, monospace';
          mctx.textAlign = 'center';
          mctx.textBaseline = 'middle';
          mctx.fillStyle = st.border;
          mctx.fillText(st.short, x + TILE * 0.5, y + TILE * 0.55);
        }
      }
    }

    // 4. Crisp outer outlines on wall edges touching open floor
    mctx.strokeStyle = th.wallOutline;
    mctx.lineWidth = 1.25;
    mctx.beginPath();
    for (let ty = 0; ty < GRID_H; ty++) {
      for (let tx = 0; tx < GRID_W; tx++) {
        if (grid[ty][tx] !== 1) continue;
        const x = tx * TILE;
        const y = ty * TILE;
        if (ty > 0 && grid[ty - 1][tx] === 0) {
          mctx.moveTo(x, y + 0.5);
          mctx.lineTo(x + TILE, y + 0.5);
        }
        if (ty < GRID_H - 1 && grid[ty + 1][tx] === 0) {
          mctx.moveTo(x, y + TILE - 0.5);
          mctx.lineTo(x + TILE, y + TILE - 0.5);
        }
        if (tx > 0 && grid[ty][tx - 1] === 0) {
          mctx.moveTo(x + 0.5, y);
          mctx.lineTo(x + 0.5, y + TILE);
        }
        if (tx < GRID_W - 1 && grid[ty][tx + 1] === 0) {
          mctx.moveTo(x + TILE - 0.5, y);
          mctx.lineTo(x + TILE - 0.5, y + TILE);
        }
      }
    }
    mctx.stroke();
  }

  // ==================== GEOMETRY, DDA RAYCAST & PATHFINDING ====================
  // Exact Amanatides-Woo DDA raycast against tile grid
  function castRay(ox, oy, dx, dy, maxDist) {
    let mapX = Math.floor(ox / TILE);
    let mapY = Math.floor(oy / TILE);

    if (isSolidTile(mapX, mapY)) {
      return { hit: true, x: ox, y: oy, dist: 0, nx: -Math.sign(dx), ny: -Math.sign(dy), tileX: mapX, tileY: mapY };
    }

    const deltaDistX = dx === 0 ? 1e30 : Math.abs(TILE / dx);
    const deltaDistY = dy === 0 ? 1e30 : Math.abs(TILE / dy);

    let stepX, stepY;
    let sideDistX, sideDistY;

    if (dx < 0) {
      stepX = -1;
      sideDistX = ((ox / TILE) - mapX) * deltaDistX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1 - (ox / TILE)) * deltaDistX;
    }

    if (dy < 0) {
      stepY = -1;
      sideDistY = ((oy / TILE) - mapY) * deltaDistY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1 - (oy / TILE)) * deltaDistY;
    }

    let dist = 0;
    let side = 0; // 0 = hit X face (vertical wall), 1 = hit Y face (horizontal wall)

    for (let iter = 0; iter < 120; iter++) {
      if (sideDistX < sideDistY) {
        dist = sideDistX;
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0;
      } else {
        dist = sideDistY;
        sideDistY += deltaDistY;
        mapY += stepY;
        side = 1;
      }

      if (dist > maxDist) {
        return {
          hit: false,
          x: ox + dx * maxDist,
          y: oy + dy * maxDist,
          dist: maxDist,
          nx: 0,
          ny: 0
        };
      }

      if (isSolidTile(mapX, mapY)) {
        const hx = ox + dx * dist;
        const hy = oy + dy * dist;
        const nx = side === 0 ? -stepX : 0;
        const ny = side === 1 ? -stepY : 0;
        return { hit: true, x: hx, y: hy, dist, nx, ny, tileX: mapX, tileY: mapY };
      }
    }

    return {
      hit: false,
      x: ox + dx * maxDist,
      y: oy + dy * maxDist,
      dist: maxDist,
      nx: 0,
      ny: 0
    };
  }

  function hasLineOfSight(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const d = hypot(dx, dy);
    if (d < 1) return true;
    const res = castRay(x1, y1, dx / d, dy / d, d);
    return !res.hit || res.dist >= d - 2;
  }

  // Segment-to-circle hit test returning distance along segment if hit, else null
  function segmentCircleHit(x1, y1, dx, dy, segLen, cx, cy, r) {
    const fx = x1 - cx;
    const fy = y1 - cy;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    let disc = b * b - 4 * c;
    if (disc < 0) return null;
    disc = Math.sqrt(disc);
    const t1 = (-b - disc) * 0.5;
    if (t1 >= 0 && t1 <= segLen) return t1;
    const t2 = (-b + disc) * 0.5;
    if (t2 >= 0 && t2 <= segLen) return t2;
    return null;
  }

  // Trace a bouncing ray up to maxBounces to see if it hits a living enemy bot
  function traceRicochetShot(ox, oy, angle, maxRange, maxBounces, shooterId) {
    let x = ox;
    let y = oy;
    let dx = Math.cos(angle);
    let dy = Math.sin(angle);
    let remaining = maxRange;
    let bounces = 0;
    const points = [{ x, y }];

    for (let seg = 0; seg <= maxBounces && remaining > 5; seg++) {
      const wallHit = castRay(x, y, dx, dy, remaining);
      const segLen = wallHit.dist;

      // Check enemy bots along this segment (only consider actual bounces when seg >= 1 for bank shots, or any)
      let bestBot = null;
      let bestT = Infinity;
      for (const b of bots) {
        if (!b.alive || b.id === shooterId) continue;
        const t = segmentCircleHit(x, y, dx, dy, segLen, b.x, b.y, BOT_RADIUS + 4);
        if (t !== null && t < bestT) {
          bestT = t;
          bestBot = b;
        }
      }

      if (bestBot) {
        const hitX = x + dx * bestT;
        const hitY = y + dy * bestT;
        points.push({ x: hitX, y: hitY });
        return {
          hit: true,
          target: bestBot,
          bounces,
          totalDist: maxRange - remaining + bestT,
          points
        };
      }

      if (!wallHit.hit) {
        points.push({ x: wallHit.x, y: wallHit.y });
        break;
      }

      points.push({ x: wallHit.x, y: wallHit.y });
      remaining -= segLen;
      if (bounces >= maxBounces) break;

      // Reflect
      if (wallHit.nx !== 0) dx = -dx;
      if (wallHit.ny !== 0) dy = -dy;
      x = wallHit.x + wallHit.nx * 0.8;
      y = wallHit.y + wallHit.ny * 0.8;
      bounces++;
    }

    return { hit: false, target: null, bounces, totalDist: maxRange, points };
  }

  // Snap any world coordinate to nearest center-walkable tile
  function nearestWalkableTile(x, y) {
    const cx = clamp(Math.floor(x / TILE), 1, GRID_W - 2);
    const cy = clamp(Math.floor(y / TILE), 1, GRID_H - 2);
    if (walkableCenter[cy][cx]) return { tx: cx, ty: cy };

    let best = null;
    let bestD = Infinity;
    for (let r = 1; r <= 4; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx > 0 && ny > 0 && nx < GRID_W - 1 && ny < GRID_H - 1 && walkableCenter[ny][nx]) {
            const d = dx * dx + dy * dy;
            if (d < bestD) {
              bestD = d;
              best = { tx: nx, ty: ny };
            }
          }
        }
      }
      if (best) return best;
    }
    return { tx: 2, ty: 2 };
  }

  // Fast A* on the 45x33 center-walkable spine (zero corner snagging!)
  function findPath(startX, startY, goalX, goalY) {
    const start = nearestWalkableTile(startX, startY);
    const goal = nearestWalkableTile(goalX, goalY);
    if (start.tx === goal.tx && start.ty === goal.ty) {
      return [{ x: goal.tx * TILE + TILE * 0.5, y: goal.ty * TILE + TILE * 0.5 }];
    }

    const totalNodes = GRID_W * GRID_H;
    const gScore = new Float32Array(totalNodes).fill(1e9);
    const cameFrom = new Int32Array(totalNodes).fill(-1);
    const closed = new Uint8Array(totalNodes);

    const startIdx = start.ty * GRID_W + start.tx;
    const goalIdx = goal.ty * GRID_W + goal.tx;
    gScore[startIdx] = 0;

    // Simple binary-free small open list (grid is small, max ~600 center tiles -> <0.15ms)
    const open = [{ idx: startIdx, f: Math.abs(goal.tx - start.tx) + Math.abs(goal.ty - start.ty) }];

    const dirs = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1]
    ];

    while (open.length > 0) {
      let bestPos = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestPos].f) bestPos = i;
      }
      const cur = open.splice(bestPos, 1)[0];
      if (cur.idx === goalIdx) break;
      if (closed[cur.idx]) continue;
      closed[cur.idx] = 1;

      const cx = cur.idx % GRID_W;
      const cy = (cur.idx - cx) / GRID_W;
      const curG = gScore[cur.idx];

      for (const [dx, dy, cost] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx <= 0 || ny <= 0 || nx >= GRID_W - 1 || ny >= GRID_H - 1) continue;
        if (!walkableCenter[ny][nx]) continue;
        const nIdx = ny * GRID_W + nx;
        if (closed[nIdx]) continue;
        const tentativeG = curG + cost;
        if (tentativeG < gScore[nIdx]) {
          gScore[nIdx] = tentativeG;
          cameFrom[nIdx] = cur.idx;
          const h = Math.abs(goal.tx - nx) + Math.abs(goal.ty - ny);
          open.push({ idx: nIdx, f: tentativeG + h });
        }
      }
    }

    if (cameFrom[goalIdx] === -1) return [];

    // Reconstruct path and thin consecutive collinear tiles
    const raw = [];
    let cur = goalIdx;
    while (cur !== -1 && cur !== startIdx) {
      const tx = cur % GRID_W;
      const ty = (cur - tx) / GRID_W;
      raw.push({ x: tx * TILE + TILE * 0.5, y: ty * TILE + TILE * 0.5 });
      cur = cameFrom[cur];
    }
    raw.reverse();

    // Keep every 2nd node or turning corners for smooth steering
    const smooth = [];
    for (let i = 0; i < raw.length; i++) {
      if (i === 0 || i === raw.length - 1) {
        smooth.push(raw[i]);
      } else {
        const prev = raw[i - 1];
        const next = raw[i + 1];
        const sameX = prev.x === raw[i].x && raw[i].x === next.x;
        const sameY = prev.y === raw[i].y && raw[i].y === next.y;
        if (!sameX && !sameY) smooth.push(raw[i]);
      }
    }
    return smooth;
  }

  // Resolve circle vs solid grid tiles cleanly
  function resolveWallCollisions(bot) {
    let totalPush = 0;
    for (let iter = 0; iter < 3; iter++) {
      const minTx = clamp(Math.floor((bot.x - BOT_RADIUS) / TILE), 0, GRID_W - 1);
      const maxTx = clamp(Math.floor((bot.x + BOT_RADIUS) / TILE), 0, GRID_W - 1);
      const minTy = clamp(Math.floor((bot.y - BOT_RADIUS) / TILE), 0, GRID_H - 1);
      const maxTy = clamp(Math.floor((bot.y + BOT_RADIUS) / TILE), 0, GRID_H - 1);

      for (let ty = minTy; ty <= maxTy; ty++) {
        for (let tx = minTx; tx <= maxTx; tx++) {
          if (grid[ty][tx] === 0) continue;
          const rx1 = tx * TILE;
          const ry1 = ty * TILE;
          const rx2 = rx1 + TILE;
          const ry2 = ry1 + TILE;

          const closestX = clamp(bot.x, rx1, rx2);
          const closestY = clamp(bot.y, ry1, ry2);
          const dx = bot.x - closestX;
          const dy = bot.y - closestY;
          const distSq = dx * dx + dy * dy;

          if (distSq < BOT_RADIUS * BOT_RADIUS) {
            const dist = Math.sqrt(distSq);
            if (dist > 0.0001) {
              const overlap = BOT_RADIUS - dist;
              bot.x += (dx / dist) * overlap;
              bot.y += (dy / dist) * overlap;
              totalPush += overlap;
            } else {
              // Deep inside corner fallback
              bot.x += 1;
              bot.y += 1;
              totalPush += 1;
            }
          }
        }
      }
    }
    if (totalPush > 1.2 && bot.wallBumpCooldown <= 0) {
      bot.wallBumps++;
      bot.wallBumpCooldown = 0.45;
    }
    bot.x = clamp(bot.x, TILE + BOT_RADIUS, CANVAS_W - TILE - BOT_RADIUS);
    bot.y = clamp(bot.y, TILE + BOT_RADIUS, CANVAS_H - TILE - BOT_RADIUS);
  }

  // ==================== SPEECH BUBBLES & FEED ====================
  function say(bot, text, priority = false) {
    if (!bot.alive && !priority) return;
    if (!priority && bot.speechCooldown > 0) return;
    // Remove older bubble from same bot
    speechBubbles = speechBubbles.filter(b => b.botId !== bot.id);
    speechBubbles.push({
      botId: bot.id,
      x: bot.x,
      y: bot.y,
      text,
      color: bot.color,
      life: 2.4,
      maxLife: 2.4
    });
    bot.speechCooldown = priority ? 1.4 : 3.2;
  }

  function pushFeed(text, color) {
    feedLog.unshift({ text, color, time: formatTime(matchTime) });
    if (feedLog.length > 24) feedLog.pop();
    renderBattleFeed();
  }

  function renderBattleFeed() {
    battleFeedEl.innerHTML = feedLog.slice(0, 6).map(item =>
      `<li style="border-left-color: ${item.color};"><strong>[${item.time}]</strong> ${escapeHtml(item.text)}</li>`
    ).join('');
  }

  // ==================== BOT CREATION (FULLY RANDOMIZED SPAWNS) ====================
  function pickRandomizedSpawns(count) {
    const candidates = [];
    for (let ty = 2; ty < GRID_H - 2; ty++) {
      for (let tx = 2; tx < GRID_W - 2; tx++) {
        if (!walkableCenter[ty][tx]) continue;
        candidates.push({
          x: tx * TILE + TILE * 0.5,
          y: ty * TILE + TILE * 0.5
        });
      }
    }

    // Fisher-Yates shuffle using fresh Math.random() so every match spawns randomly!
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = candidates[i];
      candidates[i] = candidates[j];
      candidates[j] = tmp;
    }

    const chosen = [];
    const minDists = [270, 220, 170, 120, 75, 0];
    for (let i = 0; i < count; i++) {
      let picked = null;
      for (const minD of minDists) {
        // First pass: enforce separation AND no immediate Line-of-Sight spawn kill
        picked = candidates.find(c =>
          chosen.every(o => hypot(c.x - o.x, c.y - o.y) >= minD && !hasLineOfSight(c.x, c.y, o.x, o.y))
        );
        if (picked) break;
        // Second pass: enforce separation even if LOS exists
        picked = candidates.find(c =>
          chosen.every(o => hypot(c.x - o.x, c.y - o.y) >= minD)
        );
        if (picked) break;
      }
      if (!picked) {
        const fb = getActiveSpawnForIndex(i, count);
        picked = macroToWorldCenter(fb.mx, fb.my);
      }

      // Face toward the longest open corridor direction (with slight random jitter)
      let bestAngle = randRange(-Math.PI, Math.PI);
      let bestClear = -1;
      for (let k = 0; k < 8; k++) {
        const ang = -Math.PI + (k / 8) * Math.PI * 2 + randRange(-0.18, 0.18);
        const r = castRay(picked.x, picked.y, Math.cos(ang), Math.sin(ang), 220);
        if (r.dist > bestClear) {
          bestClear = r.dist;
          bestAngle = ang;
        }
      }
      chosen.push({ x: picked.x, y: picked.y, angle: normalizeAngle(bestAngle) });
    }
    return chosen;
  }

  function createBots() {
    terminateAllCodeWorkers();
    bots = [];
    const randomSpawns = pickRandomizedSpawns(activeBotCount);
    matchSpawnPads = [];

    for (let idx = 0; idx < activeBotCount; idx++) {
      const slot = BOT_SLOTS[idx];
      const cfg = botConfigs[idx];
      const spawn = randomSpawns[idx];
      const pos = { x: spawn.x, y: spawn.y };
      matchSpawnPads.push({ x: pos.x, y: pos.y, color: slot.color, soft: slot.soft });
      const role = cfg.role; // 'ai' | 'code' | 'p1' | 'p2'
      const isPlayer = role === 'p1' || role === 'p2';
      const isCode = role === 'code';
      const preset = AI_PRESETS[cfg.presetId];
      const agg = cfg.aggression / 100;
      const cau = cfg.caution / 100;
      const ric = cfg.ricochet / 100;
      const maxAmmo = isPlayer ? PLAYER_MAG_SIZE : AI_MAG_SIZE;
      const maxHp = isPlayer ? PLAYER_MAX_HP : MAX_HP;

      // Movement speed tuned fairly across modes (0.5x tactical pace)
      let baseSpeed = isPlayer ? 76 : isCode ? 72 : (64 + agg * 14 - cau * 5);
      if (!isPlayer && !isCode) {
        if (preset.id === 'rusher') baseSpeed += 6;
        if (preset.id === 'flanker') baseSpeed += 4;
        if (preset.id === 'coward') baseSpeed += 5;
      }

      // Fire cooldown tuned fairly across modes
      let fireRate = isPlayer ? 0.28 : isCode ? 0.36 : (0.76 - agg * 0.24);
      if (!isPlayer && !isCode) {
        if (preset.id === 'rusher') fireRate = Math.max(0.42, fireRate - 0.06);
        if (preset.id === 'sniper') fireRate += 0.16;
      }

      const bot = {
        id: idx,
        slotId: slot.id,
        role,
        isPlayer,
        isCode,
        name: cfg.name.trim() || slot.defaultName,
        presetId: isPlayer ? role : isCode ? 'code' : preset.id,
        presetName: role === 'p1' ? 'Player 1' : role === 'p2' ? 'Player 2' : isCode ? (cfg.codeAuthor || 'Custom AI Code') : preset.name,
        presetShort: role === 'p1' ? 'P1' : role === 'p2' ? 'P2' : isCode ? 'CODE' : preset.shortName,
        color: slot.color,
        soft: slot.soft,
        dark: slot.dark,

        // Tunable AI weights (0..1)
        agg,
        cau,
        ric,

        // Custom AI Code metadata & runner
        codeAuthor: cfg.codeAuthor || 'Custom AI',
        codeAlgorithm: cfg.codeAlgorithm || '',
        codeThoughts: cfg.codeThoughts || '',
        codeSource: cfg.codeSource || '',
        codeRunner: null,
        codeError: null,
        codeTickAccum: 0,
        eventQueue: [],

        // Physics
        x: pos.x,
        y: pos.y,
        vx: 0,
        vy: 0,
        prevThrottle: 0,
        wasDodging: false,
        bodyAngle: spawn.angle,
        turretAngle: spawn.angle,
        baseSpeed,
        fireRate,

        // Combat state
        hp: maxHp,
        maxHp,
        alive: true,
        maxAmmo,
        ammo: maxAmmo,
        reloading: false,
        reloadTimer: 0,
        fireCooldown: isPlayer ? 0 : randRange(0.25, 0.55),
        regenCooldown: 0,
        regenUses: 0,
        hpRegened: 0,
        hitFlash: 0,
        recoil: 0,

        // Power-Up Buffs & Active Special Ammo
        speedTimer: 0,
        shieldHp: 0,
        shieldTimer: 0,
        reflectTimer: 0,
        stunTimer: 0,
        weaponType: null, // 'piercing' | 'penetrate' | 'ultra_ricochet' | 'laser'
        weaponCharges: 0,
        powerupsCollected: 0,
        speedTrailAccum: 0,
        aimbotReady: false,
        aimbotLock: null,
        aimbotProbeTimer: 0,

        // Stats & Post-Match Analysis Telemetry
        kills: 0,
        damageDealt: 0,
        damageTaken: 0,
        damageBySource: {},
        bankHits: 0,
        pillarBoostShots: 0,
        pillarHits: 0,
        shotsFired: 0,
        shotsHit: 0,
        shotsMissedRange: 0,
        shotsMissedWall: 0,
        directHitsTaken: 0,
        bankHitsTaken: 0,
        closeDodges: 0,
        dodgedBulletIds: new Set(),
        distanceTraveled: 0,
        treadDistAccum: 0,
        timeStuck: 0,
        timeEmptyAmmo: 0,
        timeInLOS: 0,
        wallBumps: 0,
        wallBumpCooldown: 0,
        killedBy: null,
        deathDetails: '',
        thinkTotalMs: 0,
        thinkMaxMs: 0,
        thinkTicks: 0,
        eliminatedOrder: 0,
        survivalTime: 0,

        // AI memory & navigation
        stateLabel: role === 'p1' ? 'P1 · READY' : role === 'p2' ? 'P2 · READY' : isCode ? 'CODE AI' : 'SCANNING',
        path: [],
        pathTimer: randRange(0, 0.25),
        trickshotTimer: randRange(0, 0.2),
        cachedBankShot: null,
        wallSide: idx % 2 === 0 ? 1 : -1,
        wallSwitchTimer: randRange(7, 12),
        strafeDir: idx % 2 === 0 ? 1 : -1,
        strafeTimer: randRange(1.2, 2.5),
        speechCooldown: randRange(0.5, 1.5),

        // Anti-stuck tracking
        stuckCheckTimer: 0.6,
        lastCheckX: pos.x,
        lastCheckY: pos.y,
        unstuckTimer: 0,
        unstuckAngle: 0,

        // LiDAR data for rendering + AI
        lidarRays: []
      };

      if (isCode) {
        bot.codeRunner = createCodeBotRunner(bot, cfg.codeSource);
      }

      bots.push(bot);
    }
  }

  // ==================== AI SENSORS & BEHAVIOR ====================
  function updateBotLidar(bot) {
    const rays = [];
    const numForward = 15;
    const halfCone = Math.PI * 0.65; // ±117° forward LiDAR cone
    const maxDist = 215;

    for (let i = 0; i < numForward; i++) {
      const frac = i / (numForward - 1);
      const relAngle = -halfCone + frac * (halfCone * 2);
      const worldAngle = bot.bodyAngle + relAngle;
      const dx = Math.cos(worldAngle);
      const dy = Math.sin(worldAngle);
      const hit = castRay(bot.x, bot.y, dx, dy, maxDist);

      // Check if an enemy bot intercepts this ray before wall
      let hitEnemy = null;
      let hitDist = hit.dist;
      for (const other of bots) {
        if (!other.alive || other.id === bot.id) continue;
        const t = segmentCircleHit(bot.x, bot.y, dx, dy, hitDist, other.x, other.y, BOT_RADIUS + 2);
        if (t !== null && t < hitDist) {
          hitDist = t;
          hitEnemy = other;
        }
      }

      const hitTileType =
        hit.hit && !hitEnemy &&
        hit.tileX >= 0 && hit.tileY >= 0 && hit.tileX < GRID_W && hit.tileY < GRID_H
          ? grid[hit.tileY][hit.tileX]
          : 0;
      const hitPillar = hitTileType === 2;

      rays.push({
        relAngle,
        worldAngle,
        dx,
        dy,
        dist: hitDist,
        x: bot.x + dx * hitDist,
        y: bot.y + dy * hitDist,
        hitWall: hit.hit && !hitEnemy,
        hitPillar,
        tileType: hitTileType,
        specialTile: specialTileName(hitTileType),
        hitEnemy
      });
    }
    bot.lidarRays = rays;
  }

  // Detect dangerous incoming bullets heading toward this bot
  function computeBulletDodgeVector(bot) {
    let dodgeX = 0;
    let dodgeY = 0;
    let urgentThreat = false;

    const awarenessRange = 170 + bot.cau * 110;
    for (const b of bullets) {
      if (b.ownerId === bot.id) continue;
      const rx = bot.x - b.x;
      const ry = bot.y - b.y;
      const dist = hypot(rx, ry);
      if (dist > awarenessRange || dist < 1) continue;

      const bSpeed = hypot(b.vx, b.vy);
      const bdx = b.vx / bSpeed;
      const bdy = b.vy / bSpeed;

      // Projection along bullet velocity
      const along = rx * bdx + ry * bdy;
      if (along < -10) continue; // moving away

      const tClosest = along / bSpeed;
      if (tClosest > 1.25) continue;

      // Perpendicular signed distance
      const perp = rx * (-bdy) + ry * bdx;
      const dangerRadius = BOT_RADIUS + 22 + bot.cau * 14;
      if (Math.abs(perp) < dangerRadius) {
        // Verify bullet actually has clear path toward us (not behind wall)
        if (!hasLineOfSight(b.x, b.y, bot.x, bot.y)) continue;

        urgentThreat = true;
        // Choose perpendicular escape direction with more wall clearance
        let side = perp >= 0 ? 1 : -1;
        const leftX = -bdy;
        const leftY = bdx;
        const clearPos = castRay(bot.x, bot.y, leftX, leftY, 70).dist;
        const clearNeg = castRay(bot.x, bot.y, -leftX, -leftY, 70).dist;
        if (side > 0 && clearPos < 26 && clearNeg > clearPos + 12) side = -1;
        if (side < 0 && clearNeg < 26 && clearPos > clearNeg + 12) side = 1;

        const urgency = (1 - dist / awarenessRange) * (1.4 - tClosest * 0.6);
        dodgeX += leftX * side * urgency;
        dodgeY += leftY * side * urgency;
      }
    }

    const mag = hypot(dodgeX, dodgeY);
    if (mag > 0.01) {
      return { x: dodgeX / mag, y: dodgeY / mag, urgent: urgentThreat };
    }
    return { x: 0, y: 0, urgent: false };
  }

  // Find a safe cover intersection with NO line of sight to active enemies
  function findCoverPoint(bot, enemies, preferFar = false) {
    let best = null;
    let bestScore = -1e9;

    for (const pt of corridorIntersections) {
      const distFromMe = hypot(pt.x - bot.x, pt.y - bot.y);
      if (distFromMe < 24) continue;

      let hiddenCount = 0;
      let minEnemyDist = 1e9;
      for (const e of enemies) {
        const ed = hypot(pt.x - e.x, pt.y - e.y);
        if (ed < minEnemyDist) minEnemyDist = ed;
        if (!hasLineOfSight(pt.x, pt.y, e.x, e.y)) hiddenCount++;
      }

      let score = hiddenCount * 140;
      if (preferFar) {
        score += minEnemyDist * 0.55 - distFromMe * 0.35;
      } else {
        score += Math.min(minEnemyDist, 300) * 0.3 - distFromMe * 0.7;
      }

      if (score > bestScore) {
        bestScore = score;
        best = pt;
      }
    }
    return best || corridorIntersections[0];
  }

  // Find a good sniper corridor intersection with long LOS at standoff distance
  function findSniperVantage(bot, target) {
    let best = null;
    let bestScore = -1e9;

    for (const pt of corridorIntersections) {
      const dTarget = hypot(pt.x - target.x, pt.y - target.y);
      if (dTarget < 160 || dTarget > 480) continue;
      const dMe = hypot(pt.x - bot.x, pt.y - bot.y);
      const los = hasLineOfSight(pt.x, pt.y, target.x, target.y);
      // Prefer ~310px standoff with LOS and minimal travel
      const idealDistScore = 180 - Math.abs(dTarget - 310) * 0.75;
      const score = (los ? 180 : 0) + idealDistScore - dMe * 0.45;
      if (score > bestScore) {
        bestScore = score;
        best = pt;
      }
    }
    return best;
  }

  // Find a bank-shot angle that bounces 1 or 2 times off walls to hit an enemy
  function findBankShotSolution(bot, enemies) {
    const nearbyEnemies = enemies.filter(e => hypot(e.x - bot.x, e.y - bot.y) < 510);
    if (nearbyEnemies.length === 0) return null;

    const muzzleOffset = BOT_RADIUS + 5;
    let bestSolution = null;
    let bestScore = -1e9;

    // 1. Test 48 evenly-spaced angles around 360° (plus jitter so bots probe new angles)
    const steps = 48;
    const jitter = Math.random() * ((Math.PI * 2) / steps);
    for (let i = 0; i < steps; i++) {
      const angle = jitter + (i / steps) * Math.PI * 2;
      const ox = bot.x + Math.cos(angle) * muzzleOffset;
      const oy = bot.y + Math.sin(angle) * muzzleOffset;
      if (isSolidTile(Math.floor(ox / TILE), Math.floor(oy / TILE))) continue;

      const res = traceRicochetShot(ox, oy, angle, BULLET_MAX_RANGE - 20, 2, bot.id);
      if (res.hit && res.bounces >= 1) {
        // Score prefers 1-bounce over 2-bounce and shorter distance / weaker enemy
        const missingPct = (1 - res.target.hp / (res.target.maxHp || MAX_HP)) * 100;
        const score = 300 - res.bounces * 45 - res.totalDist * 0.25 + missingPct * 1.2;
        if (score > bestScore) {
          bestScore = score;
          bestSolution = { angle, ...res };
        }
      }
    }

    // 2. Also test exact specular mirror reflections off nearby corridor walls!
    if (!bestSolution) {
      for (const e of nearbyEnemies) {
        const candidates = [];
        // Nearby horizontal wall planes (above/below)
        const baseTy = Math.floor(bot.y / TILE);
        for (let dy = -6; dy <= 6; dy++) {
          const ty = baseTy + dy;
          if (ty >= 0 && ty < GRID_H) {
            const wallY = ty * TILE + (dy < 0 ? TILE : 0);
            const mirY = 2 * wallY - e.y;
            candidates.push(Math.atan2(mirY - bot.y, e.x - bot.x));
          }
        }
        // Nearby vertical wall planes (left/right)
        const baseTx = Math.floor(bot.x / TILE);
        for (let dx = -6; dx <= 6; dx++) {
          const tx = baseTx + dx;
          if (tx >= 0 && tx < GRID_W) {
            const wallX = tx * TILE + (dx < 0 ? TILE : 0);
            const mirX = 2 * wallX - e.x;
            candidates.push(Math.atan2(e.y - bot.y, mirX - bot.x));
          }
        }

        for (const angle of candidates) {
          const ox = bot.x + Math.cos(angle) * muzzleOffset;
          const oy = bot.y + Math.sin(angle) * muzzleOffset;
          if (isSolidTile(Math.floor(ox / TILE), Math.floor(oy / TILE))) continue;
          const res = traceRicochetShot(ox, oy, angle, BULLET_MAX_RANGE - 20, 2, bot.id);
          if (res.hit && res.bounces >= 1) {
            const score = 320 - res.bounces * 45 - res.totalDist * 0.25;
            if (score > bestScore) {
              bestScore = score;
              bestSolution = { angle, ...res };
            }
          }
        }
      }
    }

    return bestSolution;
  }

  // LiDAR wall-following vector for Wall-Hugging Flanker
  function computeWallFollowSteering(bot) {
    // Sample left or right side LiDAR rays relative to body heading
    const side = bot.wallSide; // +1 = hug right wall, -1 = hug left wall
    const forwardRay = castRay(bot.x, bot.y, Math.cos(bot.bodyAngle), Math.sin(bot.bodyAngle), 140);
    const diagAngle = bot.bodyAngle + side * (Math.PI * 0.28);
    const sideAngle = bot.bodyAngle + side * (Math.PI * 0.52);
    const diagRay = castRay(bot.x, bot.y, Math.cos(diagAngle), Math.sin(diagAngle), 110);
    const sideRay = castRay(bot.x, bot.y, Math.cos(sideAngle), Math.sin(sideAngle), 110);

    const desiredWallDist = 36;
    let targetHeading = bot.bodyAngle;

    if (forwardRay.dist < 42) {
      // Wall ahead -> turn away from hugged wall
      targetHeading = bot.bodyAngle - side * 1.15;
    } else if (sideRay.dist > 64 && diagRay.dist > 58) {
      // Lost wall on hugged side -> curve around corner toward wall
      targetHeading = bot.bodyAngle + side * 0.65;
    } else {
      // Maintain smooth wall distance
      const err = clamp((sideRay.dist - desiredWallDist) / 40, -1, 1);
      targetHeading = bot.bodyAngle + side * err * 0.45;
    }

    return { x: Math.cos(targetHeading), y: Math.sin(targetHeading) };
  }

  // LiDAR obstacle avoidance steering blending
  function applyLidarWallAvoidance(bot, moveX, moveY) {
    let repX = 0;
    let repY = 0;
    const safeDist = 34;

    for (const ray of bot.lidarRays) {
      if (ray.hitWall && ray.dist < safeDist) {
        const push = (safeDist - ray.dist) / safeDist;
        repX -= ray.dx * push * 0.85;
        repY -= ray.dy * push * 0.85;
      }
    }

    const fx = moveX + repX;
    const fy = moveY + repY;
    const mag = hypot(fx, fy);
    if (mag < 0.001) return { x: moveX, y: moveY };
    return { x: fx / mag, y: fy / mag };
  }

  // Incremental per-bullet reloading: 1.5s per bullet whenever ammo < maxAmmo
  function updateBotReload(bot, dt) {
    if (bot.ammo < bot.maxAmmo) {
      if (bot.reloadTimer <= 0) bot.reloadTimer = RELOAD_PER_BULLET;
      bot.reloadTimer -= dt;
      if (bot.reloadTimer <= 0) {
        bot.ammo++;
        if (bot.ammo < bot.maxAmmo) {
          bot.reloadTimer = RELOAD_PER_BULLET;
        } else {
          bot.reloadTimer = 0;
        }
        // Exit empty-mag lockout as soon as 1 bullet is loaded (cautious AI may keep taking cover for 2nd)
        if (bot.reloading && bot.ammo >= 1) {
          bot.reloading = false;
        }
        if (bot.isPlayer) {
          SoundEngine.playReloadTick();
        } else if (bot.ammo === bot.maxAmmo) {
          say(bot, 'MAG FULL!');
        }
      }
    } else {
      bot.reloadTimer = 0;
      bot.reloading = false;
    }
  }

  function getSpeedMultiplier(bot) {
    let m = 1;
    if (bot.speedTimer > 0) m *= 1.55;
    if (bot.stunTimer > 0) m *= 0.38;
    return m;
  }

  function getTurnMultiplier(bot) {
    let m = 1;
    if (bot.speedTimer > 0) m *= 1.35;
    if (bot.stunTimer > 0) m *= 0.45;
    return m;
  }

  function pushBotEvent(bot, ev) {
    if (!bot || !bot.isCode || !bot.eventQueue) return;
    bot.eventQueue.push(ev);
    if (bot.eventQueue.length > 24) bot.eventQueue.shift();
  }

  function spawnFloatingText(x, y, text, color) {
    floatingTexts.push({
      x,
      y,
      text,
      color,
      life: 0.95,
      maxLife: 0.95
    });
  }

  // Regen Ability: consume 3 ammo at once -> heal 10% of CURRENT HP, 10s cooldown
  function triggerRegen(bot) {
    if (!bot || !bot.alive) return false;
    if (bot.regenCooldown > 0) return false;
    if (bot.ammo < REGEN_AMMO_COST) return false;
    if (bot.hp >= bot.maxHp) return false;

    const wasFull = bot.ammo === bot.maxAmmo;
    bot.ammo -= REGEN_AMMO_COST;
    if (wasFull && bot.ammo < bot.maxAmmo) {
      bot.reloadTimer = RELOAD_PER_BULLET;
    }
    if (bot.ammo <= 0) {
      bot.ammo = 0;
      bot.reloading = true;
      if (bot.reloadTimer <= 0) bot.reloadTimer = RELOAD_PER_BULLET;
    }

    const rawHeal = Math.max(1, Math.round(bot.hp * REGEN_HP_PCT));
    const actualHeal = Math.min(bot.maxHp - bot.hp, rawHeal);
    bot.hp += actualHeal;
    bot.regenCooldown = REGEN_COOLDOWN;
    bot.regenUses++;
    bot.hpRegened += actualHeal;
    pushBotEvent(bot, { type: 'regen', heal: actualHeal });

    SoundEngine.playRegen();
    spawnParticles(bot.x, bot.y, '#10b981', 16, 120, 0.42);
    particles.push({
      type: 'ring',
      x: bot.x,
      y: bot.y,
      r: BOT_RADIUS,
      maxR: BOT_RADIUS + 26,
      color: '#10b981',
      life: 0.42,
      maxLife: 0.42
    });
    spawnFloatingText(bot.x, bot.y - BOT_RADIUS - 14, `+${actualHeal} HP`, '#059669');
    say(bot, `REGEN +${actualHeal} HP!`, true);
    const msg = `${bot.name} used Regen (+${actualHeal} HP, -${REGEN_AMMO_COST} ammo)`;
    pushFeed(msg, '#059669');
    recordTimeline(msg);
    return true;
  }

  // Compute smart Aimbot lock for human players on every 2nd shot (direct lead OR ricochet bank shot!)
  function computePlayerAimbotLock(bot) {
    const enemies = bots.filter(b => b.alive && b.id !== bot.id);
    if (enemies.length === 0) return null;

    // 1. Prefer closest enemy with direct Line-of-Sight + velocity lead prediction
    const visible = enemies
      .filter(e => hypot(e.x - bot.x, e.y - bot.y) < Math.max(580, BULLET_MAX_RANGE) && hasLineOfSight(bot.x, bot.y, e.x, e.y))
      .sort((a, b) => hypot(a.x - bot.x, a.y - bot.y) - hypot(b.x - bot.x, b.y - bot.y));

    if (visible.length > 0) {
      const target = visible[0];
      const dist = hypot(target.x - bot.x, target.y - bot.y);
      const isLaser = bot.weaponType === 'laser' && bot.weaponCharges > 0;
      const bSpeed = bot.weaponType === 'ultra_ricochet' && bot.weaponCharges > 0 ? BULLET_SPEED * 1.2 : BULLET_SPEED;
      const flightTime = isLaser ? 0 : clamp(dist / bSpeed, 0, 1.5);
      let predX = target.x + target.vx * flightTime * 0.92;
      let predY = target.y + target.vy * flightTime * 0.92;
      if (!hasLineOfSight(bot.x, bot.y, predX, predY)) {
        predX = target.x;
        predY = target.y;
      }
      return {
        mode: 'direct',
        target,
        angle: Math.atan2(predY - bot.y, predX - bot.x),
        predX,
        predY,
        points: [{ x: bot.x, y: bot.y }, { x: predX, y: predY }],
        bankData: null
      };
    }

    // 2. If no direct LOS, solve a smart 1- or 2-bounce bank shot around corners!
    const bank = findBankShotSolution(bot, enemies);
    if (bank && bank.hit && bank.target) {
      return {
        mode: 'bank',
        target: bank.target,
        angle: bank.angle,
        predX: bank.target.x,
        predY: bank.target.y,
        points: bank.points,
        bankData: bank
      };
    }

    // 3. Fallback: snap toward nearest enemy (useful with Wall Penetrate too!)
    const nearest = enemies.sort((a, b) => hypot(a.x - bot.x, a.y - bot.y) - hypot(b.x - bot.x, b.y - bot.y))[0];
    return {
      mode: 'track',
      target: nearest,
      angle: Math.atan2(nearest.y - bot.y, nearest.x - bot.x),
      predX: nearest.x,
      predY: nearest.y,
      points: [{ x: bot.x, y: bot.y }, { x: nearest.x, y: nearest.y }],
      bankData: null
    };
  }

  // Player-controlled robot update (supports simultaneous P1 & P2 local PvP + Aimbot every 2nd shot!)
  function updatePlayerBot(bot, dt) {
    if (!bot.alive) return;

    bot.survivalTime = matchTime;
    bot.speechCooldown = Math.max(0, bot.speechCooldown - dt);
    bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);
    bot.regenCooldown = Math.max(0, bot.regenCooldown - dt);
    bot.hitFlash = Math.max(0, bot.hitFlash - dt * 4);
    bot.recoil = Math.max(0, bot.recoil - dt * 28);
    bot.aimbotProbeTimer -= dt;

    updateBotReload(bot, dt);

    // Every 2nd shot (Shot #2, #4, #6...) arms automatic Aimbot lock-on!
    bot.aimbotReady = bot.shotsFired % 2 === 1;
    if (bot.aimbotReady) {
      if (bot.aimbotProbeTimer <= 0 || !bot.aimbotLock || !bot.aimbotLock.target || !bot.aimbotLock.target.alive) {
        bot.aimbotLock = computePlayerAimbotLock(bot);
        bot.aimbotProbeTimer = 0.08;
      }
    } else {
      bot.aimbotLock = null;
    }

    const hasP1 = bots.some(b => b.role === 'p1');
    const hasP2 = bots.some(b => b.role === 'p2');
    const bothHumans = hasP1 && hasP2;

    let turnInput = 0;
    let throttle = 0;
    let wantFire = false;
    let wantRegen = false;

    if (bot.role === 'p1') {
      if (keysDown.has('KeyA') || (!bothHumans && keysDown.has('ArrowLeft'))) turnInput -= 1;
      if (keysDown.has('KeyD') || (!bothHumans && keysDown.has('ArrowRight'))) turnInput += 1;
      if (keysDown.has('KeyW') || (!bothHumans && keysDown.has('ArrowUp'))) throttle += 1;
      if (keysDown.has('KeyS') || (!bothHumans && keysDown.has('ArrowDown'))) throttle -= 0.72;
      wantFire = keysDown.has('Space') || keysDown.has('KeyF') || (!bothHumans && mouseState.down);
      wantRegen = keysDown.has('KeyE') || keysDown.has('KeyQ');
    } else if (bot.role === 'p2') {
      if (keysDown.has('ArrowLeft')) turnInput -= 1;
      if (keysDown.has('ArrowRight')) turnInput += 1;
      if (keysDown.has('ArrowUp')) throttle += 1;
      if (keysDown.has('ArrowDown')) throttle -= 0.72;
      wantFire =
        keysDown.has('Enter') ||
        keysDown.has('Slash') ||
        keysDown.has('ShiftRight') ||
        (!bothHumans && (keysDown.has('Space') || mouseState.down));
      wantRegen = keysDown.has('Period') || keysDown.has('Numpad0') || (!bothHumans && (keysDown.has('KeyE') || keysDown.has('KeyQ')));
    }

    if (wantRegen) {
      triggerRegen(bot);
    }

    // Play accelerating engine rev SFX when initiating acceleration
    if (throttle !== 0 && bot.prevThrottle === 0) {
      SoundEngine.playAccel(bot.id, throttle < 0);
    }
    bot.prevThrottle = throttle;

    const turnRate = 2.75 * getTurnMultiplier(bot); // rad/s
    if (turnInput !== 0) {
      bot.bodyAngle = normalizeAngle(bot.bodyAngle + turnInput * turnRate * dt);
    }

    const effSpeed = bot.baseSpeed * getSpeedMultiplier(bot);
    const desiredVx = Math.cos(bot.bodyAngle) * effSpeed * throttle;
    const desiredVy = Math.sin(bot.bodyAngle) * effSpeed * throttle;
    const accel = 11.5;
    bot.vx += (desiredVx - bot.vx) * Math.min(1, accel * dt);
    bot.vy += (desiredVy - bot.vy) * Math.min(1, accel * dt);

    bot.x += bot.vx * dt;
    bot.y += bot.vy * dt;
    resolveWallCollisions(bot);

    // Cannon is rigidly locked to robot facing direction
    bot.turretAngle = bot.bodyAngle;
    updateBotLidar(bot);

    if (wantFire && bot.fireCooldown <= 0 && bot.ammo > 0) {
      if (bot.aimbotReady) {
        // Re-solve exact fresh lock at fire instant & snap chassis onto target!
        const lock = computePlayerAimbotLock(bot);
        if (lock) {
          bot.bodyAngle = lock.angle;
          bot.turretAngle = lock.angle;
          SoundEngine.playAimbotLock();
          fireBullet(bot, lock.bankData || null);
          if (!lock.bankData) {
            say(bot, lock.mode === 'direct' ? 'AIMBOT LOCK!' : 'AIMBOT SNAP!', true);
          }
          bot.aimbotReady = false;
          bot.aimbotLock = null;
        } else {
          fireBullet(bot, null);
        }
      } else {
        fireBullet(bot, null);
      }
    }

    const tag = bot.role === 'p1' ? 'P1' : 'P2';
    if (bot.ammo === 0) {
      bot.stateLabel = `RELOAD ${bot.reloadTimer.toFixed(1)}s`;
    } else if (bot.aimbotReady) {
      bot.stateLabel = `${tag} · AIMBOT`;
    } else if (bot.ammo < bot.maxAmmo) {
      bot.stateLabel = `${tag} · +1 (${bot.reloadTimer.toFixed(1)}s)`;
    } else {
      bot.stateLabel = `${tag} · READY`;
    }
  }

  // Sandboxed Custom AI-Coded Robot Controller (enforces all arena physics & rules strictly!)
  function updateCodeBot(bot, dt) {
    if (!bot.alive) return;

    bot.survivalTime = matchTime;
    bot.speechCooldown = Math.max(0, bot.speechCooldown - dt);
    bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);
    bot.regenCooldown = Math.max(0, bot.regenCooldown - dt);
    bot.hitFlash = Math.max(0, bot.hitFlash - dt * 4);
    bot.recoil = Math.max(0, bot.recoil - dt * 28);

    updateBotReload(bot, dt);
    updateBotLidar(bot);

    const runner = bot.codeRunner;
    if (!runner || runner.error) {
      bot.vx *= 0.85;
      bot.vy *= 0.85;
      bot.stateLabel = 'CODE ERR';
      return;
    }

    // Timeout guard for genuinely hung Web Workers (resists tab-switch & screenshot stalls)
    if (runner.worker && runner.pending) {
      runner.pendingSimTime += dt;
      if (runner.pendingSimTime > 0.65 && performance.now() - runner.pendingSince > 650) {
        try { runner.worker.terminate(); } catch (_) {}
        runner.worker = null;
        runner.pending = false;
        runner.pendingSimTime = 0;
        runner.error = 'Timeout (>650ms)';
        bot.codeError = runner.error;
        bot.stateLabel = 'TIMEOUT';
        pushFeed(`${bot.name} timed out (>650ms) and was halted!`, '#b71c1c');
        return;
      }
    } else {
      runner.pendingSimTime = 0;
    }

    // Dispatch state snapshot to sandbox at ~30Hz
    bot.codeTickAccum += dt;
    if (runner.ready && !runner.pending && bot.codeTickAccum >= 0.032) {
      bot.codeTickAccum = 0;

      const enemiesSnap = [];
      for (const e of bots) {
        if (!e.alive || e.id === bot.id) continue;
        const d = hypot(e.x - bot.x, e.y - bot.y);
        const visible = d < 580 && hasLineOfSight(bot.x, bot.y, e.x, e.y);
        if (arenaRules.fogOfWar && !visible) continue;
        enemiesSnap.push({
          id: e.id,
          name: e.name,
          x: e.x,
          y: e.y,
          vx: e.vx,
          vy: e.vy,
          angle: e.bodyAngle,
          hp: e.hp,
          maxHp: e.maxHp,
          isPlayer: e.isPlayer,
          dist: d,
          visible,
          shieldHp: e.shieldHp,
          reflecting: e.reflectTimer > 0,
          reloading: e.reloading,
          stunned: e.stunTimer > 0,
          speedBoost: e.speedTimer > 0,
          weaponType: e.weaponCharges > 0 ? e.weaponType : null
        });
      }

      const eventsSnap = bot.eventQueue.length ? bot.eventQueue.splice(0, bot.eventQueue.length) : [];
      const snapshot = {
        time: matchTime,
        events: eventsSnap,
        me: {
          id: bot.id,
          x: bot.x,
          y: bot.y,
          vx: bot.vx,
          vy: bot.vy,
          angle: bot.bodyAngle,
          hp: bot.hp,
          maxHp: bot.maxHp,
          ammo: bot.ammo,
          maxAmmo: bot.maxAmmo,
          reloading: bot.reloading,
          reloadTimer: bot.reloadTimer,
          fireCooldown: bot.fireCooldown,
          regenCooldown: bot.regenCooldown,
          radius: BOT_RADIUS,
          buffs: {
            shieldHp: bot.shieldHp,
            shieldTimer: bot.shieldTimer,
            reflectTimer: bot.reflectTimer,
            speedTimer: bot.speedTimer,
            stunTimer: bot.stunTimer,
            weaponType: bot.weaponType,
            weaponCharges: bot.weaponCharges
          }
        },
        lidar: bot.lidarRays.map(r => ({
          relAngle: r.relAngle,
          worldAngle: r.worldAngle,
          dist: r.dist,
          x: r.x,
          y: r.y,
          hitWall: r.hitWall,
          hitPillar: Boolean(r.hitPillar),
          tileType: r.tileType || 0,
          specialTile: r.specialTile || null,
          hitEnemy: Boolean(r.hitEnemy)
        })),
        enemies: enemiesSnap,
        bullets: bullets.map(b => ({
          ownerId: b.ownerId,
          x: b.x,
          y: b.y,
          vx: b.vx,
          vy: b.vy,
          bounces: b.bounces,
          maxBounces: b.maxBounces !== undefined ? b.maxBounces : BULLET_MAX_BOUNCES,
          supercharged: Boolean(b.supercharged),
          piercing: Boolean(b.piercing),
          penetrate: b.penetrateLeft > 0,
          penetrateLeft: b.penetrateLeft || 0,
          ultraRicochet: Boolean(b.ultraRicochet),
          splitCount: b.splitCount || 0,
          remainingRange: Math.max(0, b.maxRange - b.distance)
        })),
        powerups: powerups.map(p => ({
          id: p.id,
          type: p.type,
          x: p.x,
          y: p.y,
          dist: hypot(p.x - bot.x, p.y - bot.y)
        })),
        traps: traps.map(tr => ({
          x: tr.x,
          y: tr.y,
          ownerId: tr.ownerId,
          armed: tr.armTimer <= 0,
          armTimer: tr.armTimer,
          life: tr.life,
          dist: hypot(tr.x - bot.x, tr.y - bot.y)
        })),
        rules: {
          maxAmmo: bot.maxAmmo,
          reloadPerBullet: RELOAD_PER_BULLET,
          maxHp: MAX_HP,
          playerMaxHp: PLAYER_MAX_HP,
          playerMaxAmmo: PLAYER_MAG_SIZE,
          bulletDamage: BULLET_DAMAGE,
          bulletSpeed: BULLET_SPEED,
          maxRange: BULLET_MAX_RANGE,
          maxBounces: BULLET_MAX_BOUNCES,
          fogOfWar: arenaRules.fogOfWar,
          regenCost: REGEN_AMMO_COST,
          regenPct: REGEN_HP_PCT,
          regenCooldown: REGEN_COOLDOWN,
          codeBotSpeed: 72,
          maxTurnRate: 2.75,
          fireCooldown: 0.36,
          muzzleOffset: BOT_RADIUS + 5,
          botRadius: BOT_RADIUS,
          bulletRadius: BULLET_RADIUS,
          pickupRadius: BOT_RADIUS + 14,
          trapTriggerRadius: BOT_RADIUS + 13
        }
      };

      if (runner.worker) {
        runner.pending = true;
        runner.pendingSince = performance.now();
        runner.pendingSimTime = 0;
        runner.reqId++;
        runner.worker.postMessage({ type: 'tick', reqId: runner.reqId, state: snapshot });
      } else if (runner.syncThink) {
        try {
          snapshot.memory = runner.syncMemory;
          snapshot.brain = runner.syncBrain;
          snapshot.maze = buildSyncMazeApi();
          const act = runner.syncThink(snapshot) || {};
          runner.lastAction = {
            throttle: Number.isFinite(act.throttle) ? clamp(act.throttle, -1, 1) : 0,
            turn: Number.isFinite(act.turn) ? clamp(act.turn, -1, 1) : 0,
            fire: Boolean(act.fire),
            regen: Boolean(act.regen),
            say: typeof act.say === 'string' ? act.say.trim().slice(0, 22) : ''
          };
        } catch (err) {
          runner.error = err.message || String(err);
          bot.codeError = runner.error;
          pushFeed(`${bot.name} code error: ${runner.error}`, '#b71c1c');
          return;
        }
      }
    }

    // Apply legally clamped tank action returned by the AI's code
    const act = runner.lastAction;
    const turnRate = 2.75 * getTurnMultiplier(bot); // strictly enforced equal to player/AI max turn rate
    if (act.turn !== 0) {
      bot.bodyAngle = normalizeAngle(bot.bodyAngle + clamp(act.turn, -1, 1) * turnRate * dt);
    }

    const rawThrottle = clamp(act.throttle, -1, 1);
    const scaledThrottle = rawThrottle < 0 ? rawThrottle * 0.72 : rawThrottle;
    const effSpeed = bot.baseSpeed * getSpeedMultiplier(bot);
    const desiredVx = Math.cos(bot.bodyAngle) * effSpeed * scaledThrottle;
    const desiredVy = Math.sin(bot.bodyAngle) * effSpeed * scaledThrottle;
    const accel = 9.0;
    bot.vx += (desiredVx - bot.vx) * Math.min(1, accel * dt);
    bot.vy += (desiredVy - bot.vy) * Math.min(1, accel * dt);

    bot.x += bot.vx * dt;
    bot.y += bot.vy * dt;
    resolveWallCollisions(bot);

    bot.turretAngle = bot.bodyAngle;

    if (act.say) {
      say(bot, act.say);
      act.say = '';
    }

    if (act.regen) {
      triggerRegen(bot);
      act.regen = false;
    }

    if (act.fire && bot.fireCooldown <= 0 && !bot.reloading && bot.ammo > 0) {
      fireBullet(bot, null);
    }

    if (bot.ammo === 0) {
      bot.stateLabel = `RELOAD ${bot.reloadTimer.toFixed(1)}s`;
    } else {
      bot.stateLabel = 'CODE AI';
    }
  }

  function updateBotAI(bot, dt) {
    if (!bot.alive) return;
    if (bot.isPlayer) {
      updatePlayerBot(bot, dt);
      return;
    }
    if (bot.isCode) {
      updateCodeBot(bot, dt);
      return;
    }

    bot.survivalTime = matchTime;
    bot.speechCooldown = Math.max(0, bot.speechCooldown - dt);
    bot.fireCooldown = Math.max(0, bot.fireCooldown - dt);
    bot.regenCooldown = Math.max(0, bot.regenCooldown - dt);
    bot.hitFlash = Math.max(0, bot.hitFlash - dt * 4);
    bot.recoil = Math.max(0, bot.recoil - dt * 28);
    bot.pathTimer -= dt;
    bot.trickshotTimer -= dt;
    bot.strafeTimer -= dt;
    bot.wallSwitchTimer -= dt;

    if (bot.strafeTimer <= 0) {
      bot.strafeDir = -bot.strafeDir;
      bot.strafeTimer = randRange(1.0, 2.2);
    }
    if (bot.wallSwitchTimer <= 0) {
      bot.wallSide = -bot.wallSide;
      bot.wallSwitchTimer = randRange(8, 14);
    }

    // Incremental 1.5s-per-bullet reload
    updateBotReload(bot, dt);

    // 1. Update LiDAR
    updateBotLidar(bot);

    // 2. Gather living enemies & visibility
    const enemies = bots.filter(b => b.alive && b.id !== bot.id);
    if (enemies.length === 0) {
      bot.vx *= 0.85;
      bot.vy *= 0.85;
      bot.stateLabel = 'VICTORY';
      return;
    }

    const visibleEnemies = enemies.filter(e =>
      hypot(e.x - bot.x, e.y - bot.y) < 560 && hasLineOfSight(bot.x, bot.y, e.x, e.y)
    );

    // Built-in AI Regen: consume 3 ammo for +10% current HP (10s CD) when injured and safely out of LOS (or critically low)
    if (
      bot.regenCooldown <= 0 &&
      bot.ammo >= REGEN_AMMO_COST &&
      bot.hp < bot.maxHp * 0.80 &&
      (visibleEnemies.length === 0 || bot.hp < bot.maxHp * 0.48)
    ) {
      triggerRegen(bot);
    }

    // Anti-stalemate pressure: gradually increase combat drive if >8s without damage or final 1v1
    const stalemateBoost = clamp((timeSinceLastDamage - 7) / 14, 0, 0.75);
    const isFinalDuel = enemies.length === 1;
    const effectiveAgg = clamp(bot.agg + stalemateBoost * 0.45 + (isFinalDuel ? 0.25 : 0), 0, 1);

    // Select primary target based on AI personality
    let primaryTarget = null;
    if (visibleEnemies.length > 0) {
      primaryTarget = selectTarget(bot, visibleEnemies);
    } else {
      primaryTarget = selectTarget(bot, enemies);
    }

    const distToTarget = hypot(primaryTarget.x - bot.x, primaryTarget.y - bot.y);
    const hasDirectLOS = visibleEnemies.includes(primaryTarget);

    // 3. Incoming bullet evasion check
    const dodge = computeBulletDodgeVector(bot);
    const dodgeWeight = bot.presetId === 'coward' ? 1.55 : (0.55 + bot.cau * 0.85);

    // 4. Ricochet Trickshot computation (periodic for speed)
    if (bot.trickshotTimer <= 0) {
      const shouldProbeBank =
        !bot.reloading &&
        (bot.ric >= 0.45 || (!hasDirectLOS && bot.ric >= 0.2));
      if (shouldProbeBank) {
        bot.cachedBankShot = findBankShotSolution(bot, enemies);
      } else {
        bot.cachedBankShot = null;
      }
      bot.trickshotTimer = bot.presetId === 'trickshotter' ? 0.14 : 0.28;
    }

    // 5. Movement Decision Tree
    let moveX = 0;
    let moveY = 0;
    let desiredSpeed = bot.baseSpeed;
    let newState = 'PATROL';

    // Anti-stuck override (calibrated for 0.5x movement pace)
    bot.stuckCheckTimer -= dt;
    if (bot.stuckCheckTimer <= 0) {
      const moved = hypot(bot.x - bot.lastCheckX, bot.y - bot.lastCheckY);
      bot.lastCheckX = bot.x;
      bot.lastCheckY = bot.y;
      bot.stuckCheckTimer = 1.1;
      if (moved < 10 && bot.stateLabel !== 'HOLDING LANE') {
        bot.unstuckTimer = 0.85;
        const openPt = randChoice(corridorIntersections);
        bot.path = findPath(bot.x, bot.y, openPt.x, openPt.y);
        bot.wallSide = -bot.wallSide;
      }
    }

    if (bot.unstuckTimer > 0) {
      bot.unstuckTimer -= dt;
      const steer = followPath(bot);
      moveX = steer.x;
      moveY = steer.y;
      newState = 'REPOSITIONING';
    } else if (dodge.urgent && (bot.cau > 0.25 || bot.reloading)) {
      // High-priority bullet dodge
      moveX = dodge.x;
      moveY = dodge.y;
      desiredSpeed = bot.baseSpeed * 1.18;
      newState = 'DODGING';
      if (!bot.wasDodging) {
        SoundEngine.playDodge();
        // Quick dash trail particles
        spawnParticles(bot.x, bot.y, bot.color, 5, 85, 0.22);
      }
      if (bot.presetId === 'coward' && Math.random() < 0.04) {
        say(bot, randChoice(['TOO CLOSE!', 'DODGED!', 'WHOA!']));
      }
    } else if (bot.ammo === 0 || (bot.ammo === 1 && bot.cau >= 0.72 && distToTarget > 200 && bot.reloadTimer < 0.85)) {
      // Tactical cover-seeking when empty (or cautious bot topping off 2nd bullet!)
      newState = bot.ammo === 0 ? 'RELOADING...' : 'CONSERVING AMMO';
      if (bot.cau >= 0.32 || bot.presetId === 'sniper' || bot.presetId === 'coward' || bot.presetId === 'trickshotter') {
        if (bot.pathTimer <= 0 || bot.path.length === 0) {
          const cover = findCoverPoint(bot, enemies, bot.presetId === 'coward' || bot.presetId === 'sniper');
          bot.path = findPath(bot.x, bot.y, cover.x, cover.y);
          bot.pathTimer = 0.45;
        }
        const steer = followPath(bot);
        moveX = steer.x;
        moveY = steer.y;
        desiredSpeed = bot.baseSpeed * 1.05;
      } else {
        // Low-caution rusher: weave aggressively while waiting for next bullet
        const toT = Math.atan2(primaryTarget.y - bot.y, primaryTarget.x - bot.x);
        const strafeAngle = toT + bot.strafeDir * Math.PI * 0.55;
        moveX = Math.cos(strafeAngle);
        moveY = Math.sin(strafeAngle);
      }
    } else if (bot.presetId === 'coward') {
      // EVASIVE COWARD: Hide behind cover while others weaken each other; ambush weakened bots or engage in 1v1
      const weakenedTarget = enemies.find(e => e.hp <= 54);
      const shouldEngage = isFinalDuel || stalemateBoost > 0.35 || (weakenedTarget && visibleEnemies.includes(weakenedTarget));

      if (!shouldEngage) {
        newState = 'HIDING';
        const nearestThreatDist = Math.min(...enemies.map(e => hypot(e.x - bot.x, e.y - bot.y)));
        if (nearestThreatDist < 240 || visibleEnemies.length > 0) {
          if (bot.pathTimer <= 0 || bot.path.length === 0) {
            const safePt = findCoverPoint(bot, enemies, true);
            bot.path = findPath(bot.x, bot.y, safePt.x, safePt.y);
            bot.pathTimer = 0.45;
          }
          const steer = followPath(bot);
          moveX = steer.x;
          moveY = steer.y;
          desiredSpeed = bot.baseSpeed * 1.08;
          if (nearestThreatDist < 145) say(bot, randChoice(['STAY BACK!', 'NOPE! RUN!', 'HIDING...']));
        } else {
          // Creep along cover quietly
          const steer = followPath(bot);
          moveX = steer.x * 0.5;
          moveY = steer.y * 0.5;
          desiredSpeed = bot.baseSpeed * 0.6;
        }
      } else {
        // Opportunistic finish or final duel
        const t = weakenedTarget || primaryTarget;
        newState = isFinalDuel ? 'DUELING' : 'AMBUSHING LOW HP';
        if (hasDirectLOS && distToTarget < 280) {
          const away = Math.atan2(bot.y - t.y, bot.x - t.x) + bot.strafeDir * 0.7;
          moveX = Math.cos(away);
          moveY = Math.sin(away);
        } else {
          if (bot.pathTimer <= 0 || bot.path.length === 0) {
            bot.path = findPath(bot.x, bot.y, t.x, t.y);
            bot.pathTimer = 0.4;
          }
          const steer = followPath(bot);
          moveX = steer.x;
          moveY = steer.y;
        }
      }
    } else if (bot.presetId === 'sniper') {
      // TACTICAL SNIPER: Hold long corridors, keep standoff distance (230..390px)
      if (hasDirectLOS) {
        if (distToTarget < 210) {
          // Back up to keep sniper spacing
          newState = 'SPACING';
          const away = Math.atan2(bot.y - primaryTarget.y, bot.x - primaryTarget.x);
          const strafe = away + bot.strafeDir * 0.35;
          moveX = Math.cos(strafe);
          moveY = Math.sin(strafe);
        } else if (distToTarget <= 430) {
          // Hold corridor lane with subtle micro-strafe
          newState = 'HOLDING LANE';
          const perp = Math.atan2(primaryTarget.y - bot.y, primaryTarget.x - bot.x) + bot.strafeDir * Math.PI * 0.5;
          moveX = Math.cos(perp);
          moveY = Math.sin(perp);
          desiredSpeed = bot.baseSpeed * 0.42;
        } else {
          newState = 'CLOSING LANE';
          if (bot.pathTimer <= 0 || bot.path.length === 0) {
            const vantage = findSniperVantage(bot, primaryTarget) || primaryTarget;
            bot.path = findPath(bot.x, bot.y, vantage.x, vantage.y);
            bot.pathTimer = 0.5;
          }
          const steer = followPath(bot);
          moveX = steer.x;
          moveY = steer.y;
        }
      } else {
        newState = 'SEEKING LANE';
        if (bot.pathTimer <= 0 || bot.path.length === 0) {
          const vantage = findSniperVantage(bot, primaryTarget) || primaryTarget;
          bot.path = findPath(bot.x, bot.y, vantage.x, vantage.y);
          bot.pathTimer = 0.5;
        }
        const steer = followPath(bot);
        moveX = steer.x;
        moveY = steer.y;
      }
    } else if (bot.presetId === 'flanker') {
      // WALL-HUGGING FLANKER: LiDAR wall-following around maze to ambush from behind/side
      const enemyLookingAtMe =
        Math.abs(normalizeAngle(Math.atan2(bot.y - primaryTarget.y, bot.x - primaryTarget.x) - primaryTarget.turretAngle)) < 0.7;

      if (hasDirectLOS && (distToTarget < 190 || !enemyLookingAtMe)) {
        // Ambush burst! Circle-strafe behind target
        newState = 'AMBUSHING';
        const toTarget = Math.atan2(primaryTarget.y - bot.y, primaryTarget.x - bot.x);
        const circleAngle = toTarget + bot.wallSide * (distToTarget > 110 ? 0.65 : 1.35);
        moveX = Math.cos(circleAngle);
        moveY = Math.sin(circleAngle);
        desiredSpeed = bot.baseSpeed * 1.06;
        if (!enemyLookingAtMe && distToTarget < 210) {
          say(bot, randChoice(['SURPRISE!', 'BEHIND YOU!', 'FLANKED!']));
        }
      } else if (stalemateBoost > 0.3) {
        // Navigate toward flank of target when arena is quiet
        newState = 'FLANK ROUTE';
        if (bot.pathTimer <= 0 || bot.path.length === 0) {
          bot.path = findPath(bot.x, bot.y, primaryTarget.x, primaryTarget.y);
          bot.pathTimer = 0.45;
        }
        const steer = followPath(bot);
        moveX = steer.x;
        moveY = steer.y;
      } else {
        // Pure LiDAR wall-hugging patrol
        newState = 'WALL-HUGGING';
        const wf = computeWallFollowSteering(bot);
        moveX = wf.x;
        moveY = wf.y;
        if (Math.random() < 0.004) say(bot, 'FLANKING...');
      }
    } else if (bot.presetId === 'trickshotter') {
      // RICOCHET TRICKSHOTTER: Position around corners for bank shots!
      if (bot.cachedBankShot && !hasDirectLOS) {
        // Hold corner angle and unleash ricochets!
        newState = 'BANK SHOT';
        const perp = bot.cachedBankShot.angle + bot.strafeDir * Math.PI * 0.5;
        moveX = Math.cos(perp) * 0.35;
        moveY = Math.sin(perp) * 0.35;
        desiredSpeed = bot.baseSpeed * 0.45;
      } else if (hasDirectLOS && distToTarget < 165) {
        // Slip back around a corner to stay clever
        newState = 'CORNERING';
        const away = Math.atan2(bot.y - primaryTarget.y, bot.x - primaryTarget.x) + bot.strafeDir * 0.6;
        moveX = Math.cos(away);
        moveY = Math.sin(away);
      } else {
        newState = 'ANGLE HUNTING';
        if (bot.pathTimer <= 0 || bot.path.length === 0) {
          // Move to an intersection near the enemy (140-260px away) for juicy bounce angles
          let bestPt = primaryTarget;
          let bestScore = -1e9;
          for (const pt of corridorIntersections) {
            const de = hypot(pt.x - primaryTarget.x, pt.y - primaryTarget.y);
            if (de < 110 || de > 320) continue;
            const dm = hypot(pt.x - bot.x, pt.y - bot.y);
            const hiddenBonus = !hasLineOfSight(pt.x, pt.y, primaryTarget.x, primaryTarget.y) ? 95 : 0;
            const score = hiddenBonus + (240 - Math.abs(de - 200)) - dm * 0.45;
            if (score > bestScore) {
              bestScore = score;
              bestPt = pt;
            }
          }
          bot.path = findPath(bot.x, bot.y, bestPt.x, bestPt.y);
          bot.pathTimer = 0.45;
        }
        const steer = followPath(bot);
        moveX = steer.x;
        moveY = steer.y;
      }
    } else {
      // AGGRESSIVE RUSHER: Charge enemies at full speed!
      newState = hasDirectLOS ? 'CHARGING' : 'HUNTING';
      if (hasDirectLOS && distToTarget < 120) {
        // Close-quarters aggressive circle-push
        const toT = Math.atan2(primaryTarget.y - bot.y, primaryTarget.x - bot.x);
        const angle = toT + bot.strafeDir * (distToTarget < 72 ? 1.25 : 0.45);
        moveX = Math.cos(angle);
        moveY = Math.sin(angle);
        desiredSpeed = bot.baseSpeed * 1.05;
      } else {
        if (bot.pathTimer <= 0 || bot.path.length === 0) {
          bot.path = findPath(bot.x, bot.y, primaryTarget.x, primaryTarget.y);
          bot.pathTimer = 0.32;
        }
        const steer = followPath(bot);
        moveX = steer.x;
        moveY = steer.y;
        desiredSpeed = bot.baseSpeed * 1.08;
      }
      if (hasDirectLOS && distToTarget < 190 && Math.random() < 0.007) {
        say(bot, randChoice(['CHARGING!', 'NO MERCY!', 'COMING THROUGH!']));
      }
    }

    // Opportunistic power-up grab for built-in AI when a pickup is nearby & safe
    let nearbyPowerup = null;
    if (powerups.length > 0 && newState !== 'DODGING' && newState !== 'REPOSITIONING') {
      let bestPDist = 235;
      for (const p of powerups) {
        const pd = hypot(p.x - bot.x, p.y - bot.y);
        if (pd < bestPDist) {
          bestPDist = pd;
          nearbyPowerup = p;
        }
      }
      if (nearbyPowerup && !dodge.urgent && (bot.ammo > 0 || bestPDist < 140)) {
        if (bot.pathTimer <= 0 || bot.path.length === 0) {
          bot.path = findPath(bot.x, bot.y, nearbyPowerup.x, nearbyPowerup.y);
          bot.pathTimer = 0.4;
        }
        const steer = followPath(bot);
        moveX = steer.x;
        moveY = steer.y;
        desiredSpeed = bot.baseSpeed * 1.06;
        newState = 'POWERUP RUN';
      }
    }

    // Avoid armed enemy shock traps nearby
    for (const tr of traps) {
      if (tr.ownerId === bot.id) continue;
      const dx = bot.x - tr.x;
      const dy = bot.y - tr.y;
      const d = hypot(dx, dy);
      if (d < 54 && d > 0.1) {
        moveX += (dx / d) * 1.3;
        moveY += (dy / d) * 1.3;
      }
    }

    // Blend subtle bullet dodge even when not urgent
    if (dodge.x !== 0 || dodge.y !== 0) {
      moveX += dodge.x * dodgeWeight * 0.7;
      moveY += dodge.y * dodgeWeight * 0.7;
    }

    // Apply LiDAR wall avoidance
    if (hypot(moveX, moveY) > 0.05) {
      const safe = applyLidarWallAvoidance(bot, moveX, moveY);
      moveX = safe.x;
      moveY = safe.y;
    }

    // 6. Evaluate Wise 3-Bullet Shot Decision BEFORE finalizing chassis rotation
    // Robots CANNOT aim independently — they must turn their whole body to face the shot!
    let desiredFireAngle = bot.bodyAngle;
    let shouldFire = false;
    let isBankShotAttempt = false;
    let aimTolerance =
      bot.ammo === 1 ? 0.06 :
      bot.presetId === 'sniper' ? 0.06 :
      bot.presetId === 'rusher' ? 0.11 : 0.085;

    const preferBankOverDirect =
      bot.cachedBankShot &&
      (!hasDirectLOS || (bot.ric > 0.8 && distToTarget > 210 && Math.random() < 0.35));

    if (!bot.reloading && bot.ammo > 0) {
      if (preferBankOverDirect) {
        desiredFireAngle = bot.cachedBankShot.angle;
        isBankShotAttempt = true;
        aimTolerance = 0.055;
        const bankGood =
          bot.ammo >= 2 ||
          (bot.cachedBankShot.bounces === 1 && bot.cachedBankShot.totalDist < 420) ||
          bot.cachedBankShot.target.hp <= 36;
        if (bankGood) {
          shouldFire = true;
        }
      } else if (hasDirectLOS) {
        // Predictive lead targeting
        const leadFactor = bot.presetId === 'sniper' ? 0.94 : (0.65 + effectiveAgg * 0.25);
        const flightTime = clamp(distToTarget / BULLET_SPEED, 0, 1.5);
        const predX = primaryTarget.x + primaryTarget.vx * flightTime * leadFactor;
        const predY = primaryTarget.y + primaryTarget.vy * flightTime * leadFactor;
        const predDist = hypot(predX - bot.x, predY - bot.y);
        desiredFireAngle = Math.atan2(predY - bot.y, predX - bot.x);

        const leadClear = hasLineOfSight(bot.x, bot.y, predX, predY);
        const withinBulletRange = predDist <= BULLET_MAX_RANGE - 30;

        let maxWiseRange =
          bot.presetId === 'sniper' ? 500 :
          bot.presetId === 'rusher' ? 330 :
          bot.presetId === 'coward' ? (isFinalDuel ? 420 : 280) : 390;

        if (bot.ammo === 2) {
          maxWiseRange *= 0.88;
        } else if (bot.ammo === 1) {
          maxWiseRange =
            primaryTarget.hp <= 36 ? 460 :
            bot.presetId === 'sniper' ? 360 :
            bot.presetId === 'rusher' ? 270 : 240;
        }

        if (leadClear && withinBulletRange && distToTarget <= maxWiseRange) {
          shouldFire = true;
        } else if (bot.ammo === 1 && distToTarget <= 420 && Math.random() < 0.008) {
          say(bot, 'HOLDING LAST SHOT...');
        }
      } else if (bot.cachedBankShot && bot.ric >= 0.35) {
        desiredFireAngle = bot.cachedBankShot.angle;
        isBankShotAttempt = true;
        aimTolerance = 0.055;
        if (bot.ammo >= 2 || (bot.cachedBankShot.bounces === 1 && bot.cachedBankShot.totalDist < 400)) {
          shouldFire = true;
        }
      }
    }

    // Align chassis to fire if ready to shoot and not urgently dodging/unstucking
    const liningUpShot = shouldFire && bot.fireCooldown <= 0.4 && newState !== 'DODGING' && newState !== 'REPOSITIONING';

    if (liningUpShot) {
      const turnError = Math.abs(normalizeAngle(desiredFireAngle - bot.bodyAngle));
      // Slow chassis smoothly while pivoting to face the shot (Snipers can still reverse while facing target)
      if (isBankShotAttempt || turnError > 0.35) {
        desiredSpeed *= bot.presetId === 'sniper' ? 0.35 : 0.22;
      }
    }

    // Smooth acceleration & movement (0.5x tactical pace, boosted by Speed Up / slowed by Trap Stun)
    const speedMult = getSpeedMultiplier(bot);
    const turnMult = getTurnMultiplier(bot);
    const desiredVx = moveX * desiredSpeed * speedMult;
    const desiredVy = moveY * desiredSpeed * speedMult;
    const accel = 5.2;
    bot.vx += (desiredVx - bot.vx) * Math.min(1, accel * dt);
    bot.vy += (desiredVy - bot.vy) * Math.min(1, accel * dt);

    bot.x += bot.vx * dt;
    bot.y += bot.vy * dt;
    resolveWallCollisions(bot);

    // Rotate whole chassis: toward firing line when lining up a shot, otherwise toward velocity
    if (liningUpShot) {
      const bodyTurnSpeed = (bot.presetId === 'sniper' ? 3.8 : 4.2) * turnMult;
      bot.bodyAngle = turnToward(bot.bodyAngle, desiredFireAngle, bodyTurnSpeed * dt);
    } else {
      const speedNow = hypot(bot.vx, bot.vy);
      if (speedNow > 7) {
        const velAngle = Math.atan2(bot.vy, bot.vx);
        bot.bodyAngle = turnToward(bot.bodyAngle, velAngle, 3.4 * turnMult * dt);
      }
    }

    // Cannon is strictly locked to robot facing direction (no independent turret aim!)
    bot.wasDodging = newState === 'DODGING';
    bot.turretAngle = bot.bodyAngle;
    bot.stateLabel = liningUpShot && isBankShotAttempt ? 'BANK SHOT' : newState;

    if (shouldFire && bot.fireCooldown <= 0 && !bot.reloading && bot.ammo > 0) {
      const facingError = Math.abs(normalizeAngle(bot.bodyAngle - desiredFireAngle));
      if (facingError <= aimTolerance) {
        fireBullet(bot, isBankShotAttempt ? bot.cachedBankShot : null);
      }
    }
  }

  function selectTarget(bot, list) {
    let best = list[0];
    let bestScore = -1e9;
    for (const e of list) {
      const d = hypot(e.x - bot.x, e.y - bot.y);
      const missingPct = (1 - e.hp / (e.maxHp || MAX_HP)) * 100;
      let score = -d;
      if (bot.presetId === 'coward') {
        score = missingPct * 4 - d * 0.4;
      } else if (bot.presetId === 'sniper') {
        score = missingPct * 2.2 - Math.abs(d - 310) * 0.6;
      } else if (bot.presetId === 'flanker') {
        // Prefer targets facing away
        const angleToMe = Math.atan2(bot.y - e.y, bot.x - e.x);
        const facingAway = Math.abs(normalizeAngle(angleToMe - e.turretAngle));
        score = facingAway * 90 - d * 0.7;
      } else {
        score = -d + missingPct * 1.1;
      }
      if (score > bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  function followPath(bot) {
    while (bot.path.length > 0) {
      const wp = bot.path[0];
      if (hypot(wp.x - bot.x, wp.y - bot.y) < 18) {
        bot.path.shift();
      } else {
        const dx = wp.x - bot.x;
        const dy = wp.y - bot.y;
        const d = hypot(dx, dy);
        return { x: dx / d, y: dy / d };
      }
    }
    return { x: Math.cos(bot.bodyAngle), y: Math.sin(bot.bodyAngle) };
  }

  // ==================== POWER-UPS & PROXIMITY TRAPS (EVERY 5-10s ANYWHERE ON MAP) ====================
  function spawnRandomPowerup() {
    if (powerups.length >= 5) return;

    // Gather EVERY open center-walkable tile across the entire 900x660 maze!
    const allOpenSpots = [];
    for (let ty = 1; ty < GRID_H - 1; ty++) {
      for (let tx = 1; tx < GRID_W - 1; tx++) {
        if (!walkableCenter[ty][tx]) continue;
        allOpenSpots.push({
          x: tx * TILE + TILE * 0.5 + randRange(-5, 5),
          y: ty * TILE + TILE * 0.5 + randRange(-5, 5)
        });
      }
    }
    if (allOpenSpots.length === 0) return;

    const validSpots = allOpenSpots.filter(pt => {
      for (const b of bots) {
        if (b.alive && hypot(b.x - pt.x, b.y - pt.y) < 58) return false;
      }
      for (const p of powerups) {
        if (hypot(p.x - pt.x, p.y - pt.y) < 62) return false;
      }
      return true;
    });

    const spot = validSpots.length > 0 ? randChoice(validSpots) : randChoice(allOpenSpots);
    const def = randChoice(POWERUP_LIST);

    powerups.push({
      id: powerupUidCounter++,
      type: def.id,
      x: spot.x,
      y: spot.y,
      age: 0,
      color: def.color,
      soft: def.soft,
      label: def.label,
      name: def.name
    });

    // Dramatic double-ring spawn beacon + burst sparkles + top-center banner indicator!
    spawnParticles(spot.x, spot.y, def.color, 16, 125, 0.48);
    particles.push({
      type: 'ring',
      x: spot.x,
      y: spot.y,
      r: 8,
      maxR: 68,
      color: def.color,
      life: 0.72,
      maxLife: 0.72
    });
    particles.push({
      type: 'ring',
      x: spot.x,
      y: spot.y,
      r: 4,
      maxR: 42,
      color: def.color,
      life: 0.5,
      maxLife: 0.5,
      dashed: true
    });

    powerupBanner = {
      text: `POWER-UP DROPPED: ${def.name.toUpperCase()}`,
      color: def.color,
      life: 2.6,
      maxLife: 2.6
    };

    SoundEngine.playPowerupSpawn();
    pushFeed(`Power-Up dropped: ${def.name}!`, def.color);
  }

  function applyPowerupToBot(bot, p) {
    const def = POWERUP_TYPES[p.type];
    if (!def) return;

    bot.powerupsCollected++;
    pushBotEvent(bot, { type: 'powerup', powerupType: p.type });
    SoundEngine.playPowerupPickup();
    say(bot, def.speech, true);
    spawnParticles(p.x, p.y, def.color, 14, 130, 0.36);
    particles.push({
      type: 'ring',
      x: bot.x,
      y: bot.y,
      r: 8,
      maxR: 36,
      color: def.color,
      life: 0.38,
      maxLife: 0.38
    });

    if (p.type === 'speed') {
      bot.speedTimer = def.duration;
    } else if (p.type === 'shield') {
      bot.shieldHp = def.shieldHp;
      bot.shieldTimer = def.duration;
    } else if (p.type === 'reflect_shield') {
      bot.reflectTimer = def.duration;
    } else if (p.type === 'trap') {
      // Deploy an armed proximity shock mine behind the bot
      traps.push({
        ownerId: bot.id,
        color: bot.color,
        x: bot.x,
        y: bot.y,
        armTimer: 1.25,
        life: 24.0,
        pulse: 0
      });
    } else if (p.type === 'piercing' || p.type === 'penetrate' || p.type === 'ultra_ricochet' || p.type === 'laser') {
      bot.weaponType = p.type;
      bot.weaponCharges = def.charges;
      // Ensure at least 1 round ready so picking up a weapon power-up feels instantly rewarding!
      if (bot.ammo < 1) {
        bot.ammo = 1;
        bot.reloading = false;
      }
    }

    const msg = `${bot.name} picked up ${def.name}!`;
    pushFeed(msg, def.color);
    recordTimeline(msg);
  }

  function updatePowerupsAndTraps(dt) {
    // 1. Spawn a fully random power-up every 5 to 10 seconds
    powerupSpawnTimer -= dt;
    if (powerupSpawnTimer <= 0) {
      spawnRandomPowerup();
      powerupSpawnTimer = randRange(5.0, 10.0);
    }

    // 2. Update pickups & check bot collection
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.age += dt;
      let picked = false;
      for (const bot of bots) {
        if (!bot.alive) continue;
        if (hypot(bot.x - p.x, bot.y - p.y) < BOT_RADIUS + 14) {
          applyPowerupToBot(bot, p);
          picked = true;
          break;
        }
      }
      if (picked) powerups.splice(i, 1);
    }

    // 3. Tick active buff timers & speed afterimages on robots
    for (const bot of bots) {
      if (!bot.alive) continue;
      if (bot.speedTimer > 0) {
        bot.speedTimer = Math.max(0, bot.speedTimer - dt);
        bot.speedTrailAccum += dt;
        if (bot.speedTrailAccum >= 0.055 && hypot(bot.vx, bot.vy) > 20) {
          bot.speedTrailAccum = 0;
          speedTrails.push({
            x: bot.x,
            y: bot.y,
            angle: bot.bodyAngle,
            color: POWERUP_TYPES.speed.color,
            life: 0.24,
            maxLife: 0.24
          });
        }
      }
      if (bot.shieldTimer > 0) {
        bot.shieldTimer = Math.max(0, bot.shieldTimer - dt);
        if (bot.shieldTimer <= 0) bot.shieldHp = 0;
      }
      if (bot.reflectTimer > 0) {
        bot.reflectTimer = Math.max(0, bot.reflectTimer - dt);
      }
      if (bot.stunTimer > 0) {
        bot.stunTimer = Math.max(0, bot.stunTimer - dt);
      }
    }

    // 4. Update deployed proximity shock traps
    for (let i = traps.length - 1; i >= 0; i--) {
      const tr = traps[i];
      tr.pulse += dt * 5;
      tr.life -= dt;
      if (tr.armTimer > 0) {
        tr.armTimer = Math.max(0, tr.armTimer - dt);
        continue;
      }
      if (tr.life <= 0) {
        traps.splice(i, 1);
        continue;
      }

      let triggered = false;
      for (const bot of bots) {
        if (!bot.alive || bot.id === tr.ownerId) continue;
        if (hypot(bot.x - tr.x, bot.y - tr.y) < BOT_RADIUS + 13) {
          triggered = true;
          const owner = bots[tr.ownerId];
          SoundEngine.playTrapTrigger();
          addScreenShake(5.0);
          spawnParticles(tr.x, tr.y, POWERUP_TYPES.trap.color, 18, 165, 0.42);
          particles.push({
            type: 'ring',
            x: tr.x,
            y: tr.y,
            r: 6,
            maxR: 42,
            color: POWERUP_TYPES.trap.color,
            life: 0.36,
            maxLife: 0.36
          });
          bot.stunTimer = 1.5;
          say(bot, 'TRAPPED!', true);
          applyDirectDamage(owner, bot, 30, 'shock trap', false, 0, false);
          break;
        }
      }
      if (triggered) traps.splice(i, 1);
    }

    // 5. Decay laser beam flashes & speed afterimages
    for (let i = laserBeams.length - 1; i >= 0; i--) {
      laserBeams[i].life -= dt;
      if (laserBeams[i].life <= 0) laserBeams.splice(i, 1);
    }
    for (let i = speedTrails.length - 1; i >= 0; i--) {
      speedTrails[i].life -= dt;
      if (speedTrails[i].life <= 0) speedTrails.splice(i, 1);
    }
    if (powerupBanner) {
      powerupBanner.life -= dt;
      if (powerupBanner.life <= 0) powerupBanner = null;
    }
  }

  // ==================== WEAPONS, BULLETS & RELOAD ====================
  function fireLaserBeam(bot, fireAngle, mx, my) {
    let x = mx;
    let y = my;
    let dx = Math.cos(fireAngle);
    let dy = Math.sin(fireAngle);
    let remaining = 650;
    let bounces = 0;
    const maxBounces = 2;
    const points = [{ x, y }];
    const hitBots = new Set();

    for (let seg = 0; seg <= maxBounces && remaining > 5; seg++) {
      const wallHit = castRay(x, y, dx, dy, remaining);
      const segLen = wallHit.dist;

      // Check all living enemies along this beam segment
      for (const other of bots) {
        if (!other.alive || other.id === bot.id || hitBots.has(other.id)) continue;
        const t = segmentCircleHit(x, y, dx, dy, segLen, other.x, other.y, BOT_RADIUS + 4);
        if (t !== null) {
          hitBots.add(other.id);
          const hx = x + dx * t;
          const hy = y + dy * t;
          if (other.reflectTimer > 0) {
            SoundEngine.playReflect();
            say(other, 'LASER REFLECTED!', true);
            spawnParticles(hx, hy, POWERUP_TYPES.reflect_shield.color, 12, 130, 0.3);
          } else {
            bot.shotsHit++;
            applyDirectDamage(bot, other, 28, bounces > 0 ? `${bounces}-bounce laser beam` : 'laser beam', false, bounces, false);
          }
        }
      }

      points.push({ x: wallHit.x, y: wallHit.y });
      if (!wallHit.hit) break;

      const isPillar =
        wallHit.tileX >= 0 && wallHit.tileY >= 0 && wallHit.tileX < GRID_W && wallHit.tileY < GRID_H &&
        grid[wallHit.tileY][wallHit.tileX] === 2;
      triggerWallInteraction(wallHit, { color: POWERUP_TYPES.laser.color }, bounces < maxBounces, isPillar);

      remaining -= segLen;
      if (bounces >= maxBounces) break;
      if (wallHit.nx !== 0) dx = -dx;
      if (wallHit.ny !== 0) dy = -dy;
      x = wallHit.x + wallHit.nx * 0.8;
      y = wallHit.y + wallHit.ny * 0.8;
      bounces++;
    }

    laserBeams.push({
      points,
      color: POWERUP_TYPES.laser.color,
      coreColor: '#ffffff',
      life: 0.48,
      maxLife: 0.48
    });

    SoundEngine.playLaser();
    addScreenShake(4.2);
    muzzleFlashes.push({
      x: mx,
      y: my,
      angle: fireAngle,
      color: POWERUP_TYPES.laser.color,
      life: 0.11,
      maxLife: 0.11
    });
    say(bot, 'LASER BEAM!', true);
  }

  function fireBullet(bot, bankShotData) {
    const spread =
      bot.isPlayer ? 0 :
      bankShotData ? 0.01 :
      bot.presetId === 'sniper' ? 0.018 :
      bot.presetId === 'rusher' ? 0.045 : 0.032;

    const fireAngle = bot.bodyAngle + randRange(-spread, spread);
    const muzzleDist = BOT_RADIUS + 5;
    const mx = bot.x + Math.cos(fireAngle) * muzzleDist;
    const my = bot.y + Math.sin(fireAngle) * muzzleDist;

    // Check active special weapon charge
    const activeWeapon = bot.weaponCharges > 0 ? bot.weaponType : null;

    // Prevent firing directly into a solid wall touching muzzle (unless Wall Penetrate!)
    if (activeWeapon !== 'penetrate' && isSolidTile(Math.floor(mx / TILE), Math.floor(my / TILE))) {
      return;
    }

    const wasFull = bot.ammo === bot.maxAmmo;
    bot.ammo--;
    if (wasFull && bot.ammo < bot.maxAmmo) {
      bot.reloadTimer = RELOAD_PER_BULLET;
    }
    bot.shotsFired++;
    bot.fireCooldown = bot.isPlayer ? bot.fireRate : bot.fireRate * randRange(0.92, 1.08);
    bot.recoil = 4.5;
    matchStats.totalShots++;

    if (activeWeapon) {
      bot.weaponCharges--;
      if (bot.weaponCharges <= 0) {
        bot.weaponCharges = 0;
        bot.weaponType = null;
      }
    }

    if (activeWeapon === 'laser') {
      fireLaserBeam(bot, fireAngle, mx, my);
    } else {
      const isUltra = activeWeapon === 'ultra_ricochet';
      const isPierce = activeWeapon === 'piercing';
      const isPenetrate = activeWeapon === 'penetrate';
      const bSpeed = isUltra ? BULLET_SPEED * 1.2 : BULLET_SPEED;
      const bRange = isUltra ? Math.max(1450, BULLET_MAX_RANGE * 2.5) : BULLET_MAX_RANGE;
      const bMaxBounces = isUltra ? Math.max(8, BULLET_MAX_BOUNCES + 5) : BULLET_MAX_BOUNCES;
      const bColor = activeWeapon ? POWERUP_TYPES[activeWeapon].color : bot.color;

      bullets.push({
        uid: bulletUidCounter++,
        ownerId: bot.id,
        color: bColor,
        x: mx,
        y: my,
        vx: Math.cos(fireAngle) * bSpeed,
        vy: Math.sin(fireAngle) * bSpeed,
        bounces: 0,
        maxBounces: bMaxBounces,
        supercharged: false,
        piercing: isPierce,
        penetrateLeft: isPenetrate ? 2 : 0,
        ultraRicochet: isUltra,
        splitCount: 0,
        hitBotIds: new Set(),
        distance: 0,
        maxRange: bRange,
        trail: [{ x: mx, y: my }],
        isIntentionalBank: Boolean(bankShotData)
      });

      // Shooting sound effect + signature muzzle flash + directional sparks
      SoundEngine.playShoot(bot.isPlayer, getBotSkin(bot));
      muzzleFlashes.push({
        x: mx,
        y: my,
        angle: fireAngle,
        color: bColor,
        life: 0.09,
        maxLife: 0.09
      });
      spawnDirectionalSparks(mx, my, Math.cos(fireAngle), Math.sin(fireAngle), bColor, 5, 95, 0.18);

      // If bank shot, show brief subtle ricochet preview flash + shout!
      if (bankShotData && bankShotData.points && bankShotData.points.length >= 3) {
        bankShotFlashes.push({
          points: bankShotData.points,
          color: bColor,
          life: 0.42,
          maxLife: 0.42
        });
        say(bot, randChoice(['BANK SHOT!', 'TRICKSHOT!', 'OFF THE WALL!']), true);
      }
    }

    // Trigger empty-mag reload lockout -> 1.5s until first bullet loads
    if (bot.ammo <= 0) {
      bot.ammo = 0;
      bot.reloading = true;
      if (bot.reloadTimer <= 0) bot.reloadTimer = RELOAD_PER_BULLET;
      bot.cachedBankShot = null;
      bot.pathTimer = 0; // immediately compute cover path

      if (!bot.isPlayer) {
        const reloadLine =
          bot.presetId === 'coward' ? 'NO AMMO! RUN!' :
          bot.presetId === 'sniper' ? 'EMPTY! FALLING BACK!' :
          bot.presetId === 'rusher' ? 'RELOADING! COVER ME!' :
          bot.presetId === 'flanker' ? 'EMPTY! SLIPPING AWAY!' :
          'RELOADING! COVER ME!';
        say(bot, reloadLine, true);
      } else {
        say(bot, 'RELOADING...', true);
      }
    }
  }

  function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      const curSpeed = hypot(b.vx, b.vy) || BULLET_SPEED;
      let remaining = curSpeed * dt;
      let alive = true;

      for (let step = 0; step < 6 && remaining > 0.01 && alive; step++) {
        const speed = hypot(b.vx, b.vy) || BULLET_SPEED;
        const dx = b.vx / speed;
        const dy = b.vy / speed;

        // Clamp step to remaining max range
        const rangeLeft = b.maxRange - b.distance;
        const moveDist = Math.min(remaining, rangeLeft);
        if (moveDist <= 0.01) {
          const owner = bots[b.ownerId];
          if (owner) owner.shotsMissedRange++;
          spawnRangeExpirePuff(b.x, b.y, b.color);
          alive = false;
          break;
        }

        const wallHit = castRay(b.x, b.y, dx, dy, moveDist);
        const segLen = wallHit.dist;

        // Check living robot hits along segment before wall
        let hitBot = null;
        let hitT = Infinity;
        for (const bot of bots) {
          if (!bot.alive || bot.id === b.ownerId) continue;
          if (b.hitBotIds && b.hitBotIds.has(bot.id)) continue;
          const t = segmentCircleHit(b.x, b.y, dx, dy, segLen, bot.x, bot.y, BOT_RADIUS + BULLET_RADIUS * 0.65);
          if (t !== null && t < hitT) {
            hitT = t;
            hitBot = bot;
          }
        }

        if (hitBot) {
          const hx = b.x + dx * hitT;
          const hy = b.y + dy * hitT;
          b.x = hx;
          b.y = hy;
          b.distance += hitT;
          remaining -= hitT;
          b.trail.push({ x: hx, y: hy });

          // REFLECTIVE SHIELD: bounce enemy bullet straight back with flipped ownership!
          if (hitBot.reflectTimer > 0) {
            b.vx = -b.vx;
            b.vy = -b.vy;
            b.x += -dx * 3.5;
            b.y += -dy * 3.5;
            b.ownerId = hitBot.id;
            b.color = POWERUP_TYPES.reflect_shield.color;
            b.bounces++;
            b.distance = Math.min(b.distance, b.maxRange * 0.35);
            if (b.hitBotIds) b.hitBotIds.clear();
            matchStats.totalBounces++;
            SoundEngine.playReflect();
            addScreenShake(2.6);
            say(hitBot, 'REFLECTED!', true);
            spawnParticles(hx, hy, POWERUP_TYPES.reflect_shield.color, 12, 145, 0.32);
            particles.push({
              type: 'ring',
              x: hitBot.x,
              y: hitBot.y,
              r: BOT_RADIUS,
              maxR: BOT_RADIUS + 18,
              color: POWERUP_TYPES.reflect_shield.color,
              life: 0.28,
              maxLife: 0.28
            });
            continue;
          }

          applyBulletHit(b, hitBot);

          // PIERCING SHOT: passes straight through enemy robots!
          if (b.piercing) {
            if (!b.hitBotIds) b.hitBotIds = new Set();
            b.hitBotIds.add(hitBot.id);
            b.x += dx * 4;
            b.y += dy * 4;
            continue;
          }

          alive = false;
          break;
        }

        if (wallHit.hit) {
          b.x = wallHit.x;
          b.y = wallHit.y;
          b.distance += segLen;
          remaining -= segLen;
          b.trail.push({ x: b.x, y: b.y });

          const hitTx = wallHit.tileX;
          const hitTy = wallHit.tileY;
          const isOuterBorder = hitTx <= 0 || hitTy <= 0 || hitTx >= GRID_W - 1 || hitTy >= GRID_H - 1;
          const isPillar =
            hitTx >= 0 && hitTy >= 0 && hitTx < GRID_W && hitTy < GRID_H && grid[hitTy][hitTx] === 2;

          // WALL PENETRATE: drill straight through interior maze walls!
          if (b.penetrateLeft > 0 && !isOuterBorder) {
            b.penetrateLeft--;
            triggerWallInteraction(wallHit, b, true, false);
            SoundEngine.playWallThud();
            // Step across the solid wall block into open space on the other side
            let px = wallHit.x + dx * 2;
            let py = wallHit.y + dy * 2;
            let exited = false;
            for (let s = 0; s < 26; s++) {
              px += dx * 4;
              py += dy * 4;
              b.distance += 4;
              const tx = Math.floor(px / TILE);
              const ty = Math.floor(py / TILE);
              if (tx <= 0 || ty <= 0 || tx >= GRID_W - 1 || ty >= GRID_H - 1) break;
              if (!isSolidTile(tx, ty)) {
                exited = true;
                break;
              }
            }
            if (exited) {
              b.x = px;
              b.y = py;
              b.trail.push({ x: b.x, y: b.y });
              spawnDirectionalSparks(b.x, b.y, dx, dy, POWERUP_TYPES.penetrate.color, 7, 110, 0.24);
              continue;
            }
          }

          const hitTileType =
            hitTx >= 0 && hitTy >= 0 && hitTx < GRID_W && hitTy < GRID_H ? grid[hitTy][hitTx] : 1;
          const isSpecialWall = hitTileType >= 3 && hitTileType <= 5;

          // SPECIAL TILE 3 (Range Booster Wall): expands remaining bouncing range & +2 bounces even on final bounce!
          if (hitTileType === 3) {
            b.maxRange += 350;
            b.maxBounces = Math.min(12, (b.maxBounces !== undefined ? b.maxBounces : BULLET_MAX_BOUNCES) + 2);
            b.color = SPECIAL_TILE_TYPES[3].color;
          }

          const maxB = b.maxBounces !== undefined ? b.maxBounces : BULLET_MAX_BOUNCES;
          if (b.bounces < maxB) {
            // Reflect off wall!
            if (wallHit.nx !== 0) b.vx = -b.vx;
            if (wallHit.ny !== 0) b.vy = -b.vy;
            b.x += wallHit.nx * 0.75;
            b.y += wallHit.ny * 0.75;
            b.bounces++;
            matchStats.totalBounces++;

            // Interactive Pillar Boost: bouncing off central reinforced pillars supercharges the shot!
            if (isPillar) {
              b.vx *= 1.08;
              b.vy *= 1.08;
              if (!b.supercharged) {
                const owner = bots[b.ownerId];
                if (owner) owner.pillarBoostShots++;
              }
              b.supercharged = true;
            }

            if (isSpecialWall) {
              const st = SPECIAL_TILE_TYPES[hitTileType];
              pushBotEvent(bots[b.ownerId], { type: 'special_wall', tileType: hitTileType, wallType: st.type });
              if (hitTileType === 3) {
                spawnFloatingText(wallHit.x, wallHit.y - 8, '+RANGE!', st.color);
              } else if (hitTileType === 4) {
                // SPECIAL TILE 4 (Turbo Accelerator Wall): +45% projectile speed (capped at 2.4x base speed)
                const curSpd = hypot(b.vx, b.vy) || BULLET_SPEED;
                const maxSpd = BULLET_SPEED * 2.4;
                const newSpd = Math.min(maxSpd, curSpd * 1.45);
                const mul = newSpd / curSpd;
                b.vx *= mul;
                b.vy *= mul;
                b.color = st.color;
                spawnFloatingText(wallHit.x, wallHit.y - 8, 'SPEED+!', st.color);
              } else if (hitTileType === 5) {
                // SPECIAL TILE 5 (3-Way Splitter Wall): splits reflected bullet into 3-way spread (±16°)
                const curSplits = b.splitCount || 0;
                if (curSplits < 2 && bullets.length < 56) {
                  b.splitCount = curSplits + 1;
                  b.color = st.color;
                  const baseAng = Math.atan2(b.vy, b.vx);
                  const spd = hypot(b.vx, b.vy) || BULLET_SPEED;
                  const offsets = [-0.28, 0.28];
                  for (const off of offsets) {
                    const ang = baseAng + off;
                    bullets.push({
                      uid: bulletUidCounter++,
                      ownerId: b.ownerId,
                      color: st.color,
                      x: b.x + Math.cos(ang) * 2.5,
                      y: b.y + Math.sin(ang) * 2.5,
                      vx: Math.cos(ang) * spd,
                      vy: Math.sin(ang) * spd,
                      bounces: b.bounces,
                      maxBounces: maxB,
                      supercharged: b.supercharged,
                      piercing: b.piercing,
                      penetrateLeft: b.penetrateLeft,
                      ultraRicochet: b.ultraRicochet,
                      splitCount: b.splitCount,
                      hitBotIds: new Set(),
                      distance: b.distance,
                      maxRange: b.maxRange,
                      trail: [{ x: b.x, y: b.y }],
                      isIntentionalBank: b.isIntentionalBank
                    });
                  }
                  spawnFloatingText(wallHit.x, wallHit.y - 8, '3× SPREAD!', st.color);
                }
              }

              wallFlashes.push({
                tx: hitTx,
                ty: hitTy,
                color: st.color,
                life: 0.52,
                maxLife: 0.52,
                isPillar: true
              });
              spawnDirectionalSparks(wallHit.x + wallHit.nx * 2, wallHit.y + wallHit.ny * 2, wallHit.nx, wallHit.ny, st.color, 12, 160, 0.34);
              particles.push({
                type: 'ring',
                x: wallHit.x,
                y: wallHit.y,
                r: 4,
                maxR: 28,
                color: st.color,
                life: 0.36,
                maxLife: 0.36
              });
              addScreenShake(2.8);
              SoundEngine.playSpecialWall(hitTileType);
            } else {
              triggerWallInteraction(wallHit, b, true, isPillar);
              SoundEngine.playBounce(b.bounces, isPillar);
            }
          } else {
            // Exceeded max bounces -> expire on next wall impact
            const owner = bots[b.ownerId];
            if (owner) {
              owner.shotsMissedWall++;
              pushBotEvent(owner, { type: 'shot_missed', reason: 'wall' });
            }
            triggerWallInteraction(wallHit, b, false, isPillar);
            SoundEngine.playWallThud();
            alive = false;
            break;
          }
        } else {
          b.x += dx * moveDist;
          b.y += dy * moveDist;
          b.distance += moveDist;
          remaining -= moveDist;
          b.trail.push({ x: b.x, y: b.y });
        }

        if (b.distance >= b.maxRange) {
          const owner = bots[b.ownerId];
          if (owner) {
            owner.shotsMissedRange++;
            pushBotEvent(owner, { type: 'shot_missed', reason: 'range' });
          }
          spawnRangeExpirePuff(b.x, b.y, b.color);
          alive = false;
          break;
        }
      }

      // Trim trail length (Ultra Ricochet gets a slightly longer dazzling tail!)
      const maxTrail = b.ultraRicochet ? 18 : 10;
      while (b.trail.length > maxTrail) {
        b.trail.shift();
      }

      if (!alive) {
        bullets.splice(i, 1);
      }
    }
  }

  function recordTimeline(text) {
    matchTimeline.push({ time: formatTime(matchTime), text });
    if (matchTimeline.length > 36) matchTimeline.shift();
  }

  function applyDirectDamage(shooter, target, rawDmg, shotLabel, bypassShield, bounces, supercharged) {
    let dmg = rawDmg;
    timeSinceLastDamage = 0;

    // Energy Shield absorption (unless Piercing bypasses shield!)
    if (!bypassShield && target.shieldHp > 0) {
      const absorbed = Math.min(target.shieldHp, dmg);
      target.shieldHp -= absorbed;
      dmg -= absorbed;
      SoundEngine.playShieldBlock();
      particles.push({
        type: 'ring',
        x: target.x,
        y: target.y,
        r: BOT_RADIUS + 2,
        maxR: BOT_RADIUS + 14,
        color: POWERUP_TYPES.shield.color,
        life: 0.25,
        maxLife: 0.25
      });
      if (target.shieldHp <= 0) {
        target.shieldHp = 0;
        target.shieldTimer = 0;
        say(target, 'SHIELD BROKEN!', true);
      }
    } else if (bypassShield && target.shieldHp > 0) {
      say(target, 'SHIELD PIERCED!', true);
    }

    if (dmg > 0) {
      target.hp = Math.max(0, target.hp - dmg);
      target.hitFlash = 1.0;
      target.damageTaken += dmg;
      if (bounces > 0) target.bankHitsTaken++;
      else target.directHitsTaken++;
      pushBotEvent(target, {
        type: 'hit_taken',
        fromId: shooter ? shooter.id : -1,
        fromName: shooter ? shooter.name : 'Arena',
        dmg,
        bounces,
        supercharged: Boolean(supercharged)
      });
    }

    if (shooter && shooter.id !== target.id) {
      shooter.damageDealt += rawDmg;
      target.damageBySource[shooter.name] = (target.damageBySource[shooter.name] || 0) + dmg;
      if (supercharged) shooter.pillarHits++;
      pushBotEvent(shooter, {
        type: 'hit_dealt',
        targetId: target.id,
        targetName: target.name,
        dmg: rawDmg,
        bounces,
        supercharged: Boolean(supercharged)
      });
      if (bounces > 0) {
        shooter.bankHits++;
        say(shooter, supercharged ? 'PILLAR BANK HIT!' : `${bounces}× BANK HIT!`, true);
        const msg = `${shooter.name} landed a ${shotLabel} on ${target.name} (-${rawDmg} HP)`;
        pushFeed(msg, shooter.color);
        recordTimeline(msg);
      }
    }

    spawnParticles(target.x, target.y, target.color, 12, 155, 0.34);

    if (target.hp > 0) {
      if (dmg > 0) {
        SoundEngine.playHit();
        addScreenShake(2.8);
      }
      if (target.hp <= 36) {
        say(target, randChoice(['CRITICAL HP!', 'TAKING FIRE!', 'NEED COVER!']));
      }
    }

    if (target.hp <= 0) {
      target.alive = false;
      eliminationCounter++;
      target.eliminatedOrder = eliminationCounter;
      target.survivalTime = matchTime;
      target.killedBy = shooter ? shooter.name : 'Arena';
      target.deathDetails = `${shotLabel} from ${target.killedBy} at ${formatTime(matchTime)}`;
      SoundEngine.playEliminate();
      if (bounces > 0) SoundEngine.playBankKill();
      addScreenShake(7.5);
      if (autoTrainRemaining === 0 && matchSpeed < 4) {
        killSlowMoTimer = 0.18;
      }

      if (shooter && shooter.id !== target.id) {
        shooter.kills++;
        pushBotEvent(shooter, { type: 'kill', targetId: target.id, targetName: target.name });
        say(shooter, randChoice(['TARGET DOWN!', 'ELIMINATED!', 'GOTCHA!']), true);
        const elimMsg = `${shooter.name} eliminated ${target.name} via ${shotLabel}!`;
        pushFeed(elimMsg, shooter.color);
        recordTimeline(elimMsg);
      }

      // Dramatic light-mode elimination burst + floor scorch mark
      scorchMarks.push({ x: target.x, y: target.y, color: target.color, name: target.name });
      spawnParticles(target.x, target.y, target.color, 26, 210, 0.58);
      particles.push({
        type: 'ring',
        x: target.x,
        y: target.y,
        r: 8,
        maxR: 46,
        color: target.color,
        life: 0.45,
        maxLife: 0.45
      });

      checkMatchEnd();
    }
  }

  function applyBulletHit(bullet, target) {
    const shooter = bots[bullet.ownerId];
    const dmg = bullet.supercharged ? Math.round(BULLET_DAMAGE * 1.15) : BULLET_DAMAGE;
    if (shooter) shooter.shotsHit++;

    const tagParts = [];
    if (bullet.piercing) tagParts.push('piercing');
    if (bullet.ultraRicochet) tagParts.push('ultra-ricochet');
    if (bullet.supercharged) tagParts.push('supercharged pillar');
    const prefix = tagParts.length ? `${tagParts.join(' ')} ` : '';
    const shotLabel = bullet.bounces > 0
      ? `${bullet.bounces}-bounce ${prefix}bank shot`
      : `${prefix}direct shot`;

    applyDirectDamage(shooter, target, dmg, shotLabel, Boolean(bullet.piercing), bullet.bounces, Boolean(bullet.supercharged));
  }

  function resolveBotBotCollisions() {
    for (let i = 0; i < bots.length; i++) {
      const a = bots[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < bots.length; j++) {
        const b = bots[j];
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = hypot(dx, dy);
        const minDist = BOT_RADIUS * 2 + 1;
        if (d > 0.001 && d < minDist) {
          const push = (minDist - d) * 0.5;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
          resolveWallCollisions(a);
          resolveWallCollisions(b);
        }
      }
    }
  }

  // ==================== PARTICLES & EFFECTS ====================
  function spawnParticles(x, y, color, count, speed, life) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * randRange(0.35, 1.0);
      particles.push({
        type: 'spark',
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        size: randRange(2, 4.2),
        color,
        life: life * randRange(0.7, 1.15),
        maxLife: life
      });
    }
  }

  function addScreenShake(amount) {
    shakeMag = Math.min(10, Math.max(shakeMag, amount));
  }

  function spawnDirectionalSparks(x, y, nx, ny, color, count, speed, life) {
    const baseAngle = Math.atan2(ny, nx);
    for (let i = 0; i < count; i++) {
      const a = baseAngle + randRange(-1.05, 1.05);
      const s = speed * randRange(0.4, 1.15);
      particles.push({
        type: 'spark',
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        size: randRange(2, 4.2),
        color,
        life: life * randRange(0.7, 1.15),
        maxLife: life
      });
    }
  }

  // Reactive visual + tactile wall interaction on every bullet-wall collision
  function triggerWallInteraction(wallHit, bullet, didBounce, isPillar) {
    const { x, y, nx, ny, tileX, tileY } = wallHit;

    // 1. Illuminate the exact wall/pillar tile struck
    if (tileX >= 0 && tileY >= 0 && tileX < GRID_W && tileY < GRID_H) {
      wallFlashes.push({
        tx: tileX,
        ty: tileY,
        color: isPillar ? '#f59e0b' : bullet.color,
        life: isPillar ? 0.45 : 0.28,
        maxLife: isPillar ? 0.45 : 0.28,
        isPillar
      });
    }

    // 2. Leave a persistent subtle scorch/chip impact decal along the wall face
    wallDecals.push({
      x: x - nx * 0.8,
      y: y - ny * 0.8,
      nx,
      ny,
      color: bullet.color,
      size: didBounce ? (isPillar ? 6.5 : 4.8) : 5.5
    });
    if (wallDecals.length > 90) wallDecals.shift();

    // 3. Spray directional sparks & shockwave ring off the wall normal
    const sparkColor = isPillar ? '#f59e0b' : bullet.color;
    spawnDirectionalSparks(x + nx * 1.5, y + ny * 1.5, nx, ny, sparkColor, isPillar ? 10 : 6, isPillar ? 145 : 110, 0.26);

    particles.push({
      type: 'ring',
      x: x + nx * 1.2,
      y: y + ny * 1.2,
      r: 3,
      maxR: isPillar ? 24 : didBounce ? 17 : 13,
      color: sparkColor,
      life: isPillar ? 0.34 : 0.24,
      maxLife: isPillar ? 0.34 : 0.24
    });

    // 4. Subtle camera shake tap
    addScreenShake(isPillar ? 3.0 : didBounce ? 1.5 : 1.1);
  }

  function spawnRangeExpirePuff(x, y, color) {
    particles.push({
      type: 'ring',
      x,
      y,
      r: 4,
      maxR: 14,
      color,
      life: 0.24,
      maxLife: 0.24,
      dashed: true
    });
  }

  function updateEffects(dt) {
    shakeMag = Math.max(0, shakeMag - dt * 26);

    for (let i = wallFlashes.length - 1; i >= 0; i--) {
      wallFlashes[i].life -= dt;
      if (wallFlashes[i].life <= 0) wallFlashes.splice(i, 1);
    }

    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      const ft = floatingTexts[i];
      ft.life -= dt;
      ft.y -= 26 * dt;
      if (ft.life <= 0) floatingTexts.splice(i, 1);
    }

    for (let i = treadMarks.length - 1; i >= 0; i--) {
      treadMarks[i].life -= dt;
      if (treadMarks[i].life <= 0) treadMarks.splice(i, 1);
    }

    for (let i = muzzleFlashes.length - 1; i >= 0; i--) {
      muzzleFlashes[i].life -= dt;
      if (muzzleFlashes[i].life <= 0) muzzleFlashes.splice(i, 1);
    }

    // Gentle themed ambient motes drifting across the maze
    for (const m of ambientMotes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.angle += m.spin * dt;
      if (m.x < TILE) m.x = CANVAS_W - TILE;
      if (m.x > CANVAS_W - TILE) m.x = TILE;
      if (m.y < TILE) m.y = CANVAS_H - TILE;
      if (m.y > CANVAS_H - TILE) m.y = TILE;
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      if (p.type === 'spark') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
      } else if (p.type === 'ring') {
        const t = 1 - p.life / p.maxLife;
        p.r = p.maxR * (0.2 + 0.8 * t);
      }
    }

    for (let i = bankShotFlashes.length - 1; i >= 0; i--) {
      bankShotFlashes[i].life -= dt;
      if (bankShotFlashes[i].life <= 0) bankShotFlashes.splice(i, 1);
    }

    for (let i = speechBubbles.length - 1; i >= 0; i--) {
      const sb = speechBubbles[i];
      sb.life -= dt;
      const owner = bots[sb.botId];
      if (owner && owner.alive) {
        sb.x = owner.x;
        sb.y = owner.y;
      }
      if (sb.life <= 0) speechBubbles.splice(i, 1);
    }
  }

  // ==================== POST-MATCH SELF-LEARNING & AUTO-TRAIN ====================
  function setMatchSpeedUI(spd) {
    matchSpeed = spd;
    speedControls.querySelectorAll('.seg-btn').forEach(b => {
      b.classList.toggle('active', Number(b.dataset.speed) === spd);
    });
    SoundEngine.refreshBgmTempo();
  }

  function updateAutoTrainButtonUI() {
    if (!btnAutoTrain) return;
    if (autoTrainRemaining > 0) {
      const done = autoTrainTotal - autoTrainRemaining + 1;
      btnAutoTrain.textContent = `Training ${done}/${autoTrainTotal} (Stop)`;
      btnAutoTrain.classList.add('train-active');
    } else {
      btnAutoTrain.textContent = 'Auto-Train ×5';
      btnAutoTrain.classList.remove('train-active');
    }
  }

  function stopAutoTrain(restoreSpeed = true) {
    if (autoTrainTimerId) {
      clearTimeout(autoTrainTimerId);
      autoTrainTimerId = null;
    }
    const wasRunning = autoTrainRemaining > 0;
    autoTrainRemaining = 0;
    updateAutoTrainButtonUI();
    if (wasRunning && restoreSpeed) {
      setMatchSpeedUI(prevSpeedBeforeTrain || 1);
    }
  }

  function startAutoTrain(rounds = 5) {
    stopAutoTrain(false);
    prevSpeedBeforeTrain = matchSpeed === 4 ? 1 : matchSpeed;
    autoTrainTotal = rounds;
    autoTrainRemaining = rounds;
    setMatchSpeedUI(4);
    updateAutoTrainButtonUI();
    pushFeed(`Auto-Train started: running ${rounds} fast matches at 4× speed so AIs evolve!`, '#7c3aed');
    if (matchOver || screenMode !== 'arena') {
      startMatch(true);
    }
  }

  function buildMatchReportForBot(bot, ranked) {
    const rank = ranked.findIndex(b => b.id === bot.id) + 1;
    const accuracy = bot.shotsFired > 0 ? Math.round((bot.shotsHit / bot.shotsFired) * 100) : 0;
    return {
      won: rank === 1 && bot.alive,
      rank,
      totalBots: ranked.length,
      matchTime: Number(matchTime.toFixed(2)),
      hp: Math.round(bot.hp),
      maxHp: bot.maxHp,
      kills: bot.kills,
      damageDealt: Math.round(bot.damageDealt),
      damageTaken: Math.round(bot.damageTaken),
      shotsFired: bot.shotsFired,
      shotsHit: bot.shotsHit,
      accuracy,
      shotsMissedRange: bot.shotsMissedRange,
      shotsMissedWall: bot.shotsMissedWall,
      bankHits: bot.bankHits,
      pillarBoostShots: bot.pillarBoostShots,
      pillarHits: bot.pillarHits,
      powerupsCollected: bot.powerupsCollected,
      regenUses: bot.regenUses,
      hpRegened: bot.hpRegened,
      directHitsTaken: bot.directHitsTaken,
      bankHitsTaken: bot.bankHitsTaken,
      closeDodges: bot.closeDodges,
      timeInLOS: Number(bot.timeInLOS.toFixed(2)),
      timeStuck: Number(bot.timeStuck.toFixed(2)),
      wallBumps: bot.wallBumps,
      timeEmptyAmmo: Number(bot.timeEmptyAmmo.toFixed(2)),
      killedBy: bot.killedBy || null,
      deathDetails: bot.deathDetails || null,
      opponents: ranked
        .filter(o => o.id !== bot.id)
        .map(o => ({
          id: o.id,
          name: o.name,
          isPlayer: o.isPlayer,
          alive: o.alive,
          hp: Math.round(o.hp),
          maxHp: o.maxHp,
          kills: o.kills,
          damageDealt: Math.round(o.damageDealt),
          accuracy: o.shotsFired > 0 ? Math.round((o.shotsHit / o.shotsFired) * 100) : 0
        }))
    };
  }

  function runPostMatchSelfLearning(ranked) {
    const tasks = [];
    for (const bot of ranked) {
      if (!bot.isCode || !bot.codeRunner || bot.codeRunner.error) continue;
      const runner = bot.codeRunner;
      const report = buildMatchReportForBot(bot, ranked);

      if (runner.worker) {
        tasks.push(
          new Promise(resolve => {
            let settled = false;
            const finish = (newBrain, summary) => {
              if (settled) return;
              settled = true;
              const rec = saveBotBrainRecord(bot.slotId, bot.name, newBrain, report);
              const note = summary || (rec.meta.logs[0] ? rec.meta.logs[0].summary : '');
              if (note) {
                pushFeed(`${bot.name} learned (Gen #${rec.meta.matches + 1}): ${note}`, '#7c3aed');
              }
              resolve();
            };
            const timer = setTimeout(() => finish(loadBotBrainRecord(bot.slotId, bot.name).data, ''), 320);
            runner.onBrainSaved = (bData, summary) => {
              clearTimeout(timer);
              finish(bData, summary);
            };
            try {
              runner.worker.postMessage({ type: 'match_end', report });
            } catch (_) {
              clearTimeout(timer);
              finish(loadBotBrainRecord(bot.slotId, bot.name).data, '');
            }
          })
        );
      } else if (runner.syncThink) {
        try {
          let bData = runner.syncBrain || {};
          if (runner.syncOnMatchEnd) {
            const ret = runner.syncOnMatchEnd(report, bData);
            if (ret && typeof ret === 'object' && !Array.isArray(ret)) bData = ret;
          }
          const rec = saveBotBrainRecord(bot.slotId, bot.name, bData, report);
          if (rec.meta.logs[0]) {
            pushFeed(`${bot.name} learned (Gen #${rec.meta.matches + 1}): ${rec.meta.logs[0].summary}`, '#7c3aed');
          }
        } catch (_) {}
      }
    }
    return Promise.all(tasks);
  }

  // ==================== MATCH LIFECYCLE & VICTORY ====================
  function checkMatchEnd() {
    const alive = bots.filter(b => b.alive);
    if (alive.length <= 1 && !matchOver) {
      matchOver = true;
      showVictoryPodium(alive[0] || null);
    }
  }

  function showVictoryPodium(winner) {
    SoundEngine.stopBgm();
    if (autoTrainRemaining <= 1) {
      SoundEngine.playVictory();
    }

    const ranked = [...bots].sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      if (a.eliminatedOrder !== b.eliminatedOrder) return b.eliminatedOrder - a.eliminatedOrder;
      if (a.kills !== b.kills) return b.kills - a.kills;
      return b.damageDealt - a.damageDealt;
    });
    lastRankedBots = ranked;

    if (winner) {
      victoryBadge.textContent = winner.isPlayer
        ? `${winner.presetShort} WINS! · ${formatTime(matchTime)}`
        : `VICTORY · ${formatTime(matchTime)}`;
      winnerSwatch.style.background = winner.color;
      winnerSwatch.textContent = winner.isPlayer ? '★' : '1';
      winnerNameEl.textContent = winner.name;
      winnerMetaEl.textContent = `${winner.presetName} · ${winner.hp} HP remaining · ${winner.kills} kill${winner.kills === 1 ? '' : 's'}`;
    } else {
      victoryBadge.textContent = `MUTUAL ELIMINATION · ${formatTime(matchTime)}`;
      winnerSwatch.style.background = '#64748b';
      winnerSwatch.textContent = '=';
      winnerNameEl.textContent = 'Draw Match';
      winnerMetaEl.textContent = 'All robots were eliminated simultaneously';
    }

    const medals = ['#1', '#2', '#3', '#4'];
    podiumTbody.innerHTML = ranked.map((b, i) => {
      const acc = b.shotsFired > 0 ? Math.round((b.shotsHit / b.shotsFired) * 100) : 0;
      const mindBtn = b.isCode
        ? `<button type="button" class="podium-mind-btn" data-inspect-slot="${b.slotId}">Thoughts</button><button type="button" class="podium-mind-btn" data-brain-slot="${b.slotId}">Brain</button>`
        : '';
      return `
        <tr>
          <td class="podium-rank">${medals[i]}</td>
          <td>
            <div class="podium-bot-cell">
              <span class="podium-dot" style="background: ${b.color};"></span>
              <span>${escapeHtml(b.name)}</span>
            </div>
          </td>
          <td>${escapeHtml(b.isCode ? b.codeAuthor : b.presetShort)}</td>
          <td><strong>${b.kills}</strong></td>
          <td>${acc}%</td>
          <td>${b.damageDealt}</td>
          <td>
            <div class="podium-actions-cell">
              <button type="button" class="podium-analyze-btn" data-analyze-id="${b.id}">Analyze</button>
              ${mindBtn}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    podiumTbody.querySelectorAll('.podium-mind-btn[data-inspect-slot]').forEach(btn => {
      btn.addEventListener('click', () => {
        openCodeModal(Number(btn.dataset.inspectSlot), 'mind', true);
      });
    });

    podiumTbody.querySelectorAll('.podium-mind-btn[data-brain-slot]').forEach(btn => {
      btn.addEventListener('click', () => {
        openCodeModal(Number(btn.dataset.brainSlot), 'brain', true);
      });
    });

    podiumTbody.querySelectorAll('.podium-analyze-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openAnalysisModal(Number(btn.dataset.analyzeId));
      });
    });

    victoryOverlay.classList.remove('hidden');
    updateHudDom();

    // Run self-learning onMatchEnd(report, brain) hooks & advance Auto-Train if active!
    runPostMatchSelfLearning(ranked).then(() => {
      if (autoTrainRemaining > 0) {
        autoTrainRemaining--;
        if (autoTrainRemaining > 0) {
          updateAutoTrainButtonUI();
          autoTrainTimerId = setTimeout(() => {
            autoTrainTimerId = null;
            if (screenMode === 'arena' && autoTrainRemaining > 0) {
              startMatch(true);
            }
          }, 1150);
        } else {
          stopAutoTrain(true);
          pushFeed(`Auto-Train complete (${autoTrainTotal} matches)! Inspect each bot's Brain to see its evolution.`, '#059669');
        }
      }
    });
  }

  function startMatch(regenerateMaze = true) {
    SoundEngine.unlock();
    syncRulesFromInputs();
    if (regenerateMaze || !mazeOffscreen) {
      generateMaze();
    }

    matchTime = 0;
    timeSinceLastDamage = 0;
    eliminationCounter = 0;
    matchOver = false;
    isPaused = false;
    shakeMag = 0;
    bullets = [];
    powerups = [];
    traps = [];
    laserBeams = [];
    speedTrails = [];
    treadMarks = [];
    muzzleFlashes = [];
    killSlowMoTimer = 0;
    floatingTexts = [];
    powerupBanner = null;
    powerupSpawnTimer = 2.0; // First power-up drops quickly at 2s, then randomly every 5-10s!
    powerupUidCounter = 1;
    particles = [];
    scorchMarks = [];
    wallFlashes = [];
    wallDecals = [];
    bankShotFlashes = [];
    speechBubbles = [];
    feedLog = [];
    matchTimeline = [];
    bulletUidCounter = 1;
    lastRankedBots = [];
    keysDown.clear();
    mouseState.down = false;
    matchStats = { totalShots: 0, totalBounces: 0 };

    createBots();
    buildHudDom();

    const humans = bots.filter(b => b.isPlayer);
    const aiCount = bots.length - humans.length;
    if (humans.length === 2) {
      pushFeed(`${currentTheme.name} — 2P Battle! ${humans[0].name} (WASD+Space) vs ${humans[1].name} (Arrows+Enter)${aiCount > 0 ? ` + ${aiCount} AI` : ''}!`, currentTheme.accent);
    } else if (humans.length === 1) {
      pushFeed(`${currentTheme.name} — ${humans[0].name} (${humans[0].presetShort}) vs ${aiCount} tactical AI bots!`, currentTheme.accent);
    } else {
      pushFeed(`${currentTheme.name} — ${bots.length} autonomous AI units deployed!`, currentTheme.accent);
    }

    // Switch screen visibility
    screenMode = 'arena';
    setupScreen.classList.add('hidden');
    arenaScreen.classList.remove('hidden');
    battleControls.classList.remove('hidden');
    victoryOverlay.classList.add('hidden');
    pauseOverlay.classList.add('hidden');
    btnPause.textContent = 'Pause';
    btnPause.classList.remove('paused');

    updateHudDom();
    SoundEngine.startBgm();
  }

  // ==================== LIVE HUD DOM ====================
  function buildHudDom() {
    hudCardsContainer.innerHTML = bots.map(bot => {
      const pipClass = bot.maxAmmo > 12 ? 'ammo-pip compact-pip' : bot.maxAmmo > 5 ? 'ammo-pip' : 'ammo-pip ai-pip';
      const pipsWrapClass = bot.maxAmmo > 12 ? 'ammo-pips compact-pips' : 'ammo-pips';
      const pips = Array.from({ length: bot.maxAmmo }, (_, i) =>
        `<span class="${pipClass}" data-pip="${i}"></span>`
      ).join('');
      const brainRec = bot.isCode ? loadBotBrainRecord(bot.slotId, bot.name) : null;
      const genTagHtml = brainRec ? `<span class="hud-gen-tag" title="Self-learning generation">G${brainRec.meta.matches + 1}</span>` : '';
      const mindBtnHtml = bot.isCode
        ? `<button type="button" class="hud-mind-btn" data-inspect-slot="${bot.slotId}" title="Read AI's Algorithm & Thoughts">Mind</button><button type="button" class="hud-mind-btn" data-brain-slot="${bot.slotId}" title="Inspect Self-Learning Brain">Brain</button>`
        : '';
      return `
        <div class="hud-card" id="hud-card-${bot.id}" style="--bot-color: ${bot.color};">
          <div class="hud-row-top">
            <div class="hud-identity">
              <span class="hud-name">${escapeHtml(bot.name)}</span>
              <span class="hud-preset-tag${bot.isPlayer ? ' you-tag' : ''}">${escapeHtml(bot.isCode ? bot.codeAuthor : bot.presetShort)}</span>
              ${genTagHtml}
              ${mindBtnHtml}
            </div>
            <span class="hud-kills" id="hud-kills-${bot.id}">0 Kills</span>
          </div>
          <div class="hp-row">
            <div class="hp-track">
              <div class="hp-fill" id="hud-hp-fill-${bot.id}" style="width: 100%;"></div>
            </div>
            <span class="hp-text" id="hud-hp-text-${bot.id}">${bot.maxHp} HP</span>
          </div>
          <div class="ammo-row">
            <div class="${pipsWrapClass}" id="hud-pips-${bot.id}">${pips}</div>
            <span class="hud-status-badge" id="hud-status-${bot.id}">READY</span>
          </div>
          <div class="hud-buffs-row" id="hud-buffs-${bot.id}"></div>
        </div>
      `;
    }).join('');

    hudCardsContainer.querySelectorAll('.hud-mind-btn[data-inspect-slot]').forEach(btn => {
      btn.addEventListener('click', () => {
        openCodeModal(Number(btn.dataset.inspectSlot), 'mind', true);
      });
    });
    hudCardsContainer.querySelectorAll('.hud-mind-btn[data-brain-slot]').forEach(btn => {
      btn.addEventListener('click', () => {
        openCodeModal(Number(btn.dataset.brainSlot), 'brain', true);
      });
    });
  }

  function updateHudDom() {
    let aliveCount = 0;

    for (const bot of bots) {
      if (bot.alive) aliveCount++;
      const card = document.getElementById(`hud-card-${bot.id}`);
      const killsEl = document.getElementById(`hud-kills-${bot.id}`);
      const hpFill = document.getElementById(`hud-hp-fill-${bot.id}`);
      const hpText = document.getElementById(`hud-hp-text-${bot.id}`);
      const pipsEl = document.getElementById(`hud-pips-${bot.id}`);
      const statusEl = document.getElementById(`hud-status-${bot.id}`);

      if (!card) continue;

      card.classList.toggle('eliminated', !bot.alive);
      killsEl.textContent = `${bot.kills} ${bot.kills === 1 ? 'Kill' : 'Kills'}`;
      hpFill.style.width = `${clamp((bot.hp / bot.maxHp) * 100, 0, 100)}%`;
      hpText.textContent = `${Math.ceil(bot.hp)} HP`;

      const pipNodes = pipsEl.children;
      const basePipClass = bot.maxAmmo > 12 ? 'ammo-pip compact-pip' : bot.maxAmmo > 5 ? 'ammo-pip' : 'ammo-pip ai-pip';
      const loadingPct = bot.ammo < bot.maxAmmo
        ? clamp(((RELOAD_PER_BULLET - bot.reloadTimer) / RELOAD_PER_BULLET) * 100, 0, 100)
        : 0;

      if (!bot.alive) {
        for (let i = 0; i < bot.maxAmmo; i++) {
          pipNodes[i].className = `${basePipClass} empty`;
        }
        statusEl.textContent = bot.isPlayer ? 'SPECTATING' : 'ELIMINATED';
        statusEl.className = 'hud-status-badge dead';
      } else {
        for (let i = 0; i < bot.maxAmmo; i++) {
          if (i < bot.ammo) {
            pipNodes[i].className = basePipClass;
          } else if (i === bot.ammo) {
            pipNodes[i].className = `${basePipClass} loading`;
            pipNodes[i].style.setProperty('--fill-pct', `${loadingPct.toFixed(1)}%`);
          } else {
            pipNodes[i].className = `${basePipClass} empty`;
          }
        }
        if (bot.codeError) {
          statusEl.textContent = 'CODE ERR';
          statusEl.title = bot.codeError;
          statusEl.className = 'hud-status-badge error';
        } else if (bot.stunTimer > 0) {
          statusEl.textContent = `STUNNED ${bot.stunTimer.toFixed(1)}s`;
          statusEl.className = 'hud-status-badge reloading';
        } else if (bot.ammo === 0) {
          statusEl.textContent = `RELOAD ${bot.reloadTimer.toFixed(1)}s`;
          statusEl.className = 'hud-status-badge reloading';
        } else {
          statusEl.textContent = bot.stateLabel;
          statusEl.className = bot.ammo < bot.maxAmmo && bot.isPlayer
            ? 'hud-status-badge reloading'
            : 'hud-status-badge';
        }
      }

      // Render active power-up buff pills
      const buffsEl = document.getElementById(`hud-buffs-${bot.id}`);
      if (buffsEl) {
        if (!bot.alive) {
          buffsEl.innerHTML = '';
        } else {
          const pills = [];
          if (bot.isPlayer && bot.aimbotReady) {
            pills.push(`<span class="hud-buff-pill" style="--buff-color: #db2777;">AIMBOT READY</span>`);
          }
          if (bot.regenCooldown > 0) {
            pills.push(`<span class="hud-buff-pill" style="--buff-color: #64748b;">REGEN ${bot.regenCooldown.toFixed(1)}s</span>`);
          } else if (bot.isPlayer && bot.hp < bot.maxHp && bot.ammo >= REGEN_AMMO_COST) {
            const rk = bot.role === 'p2' ? '.' : 'E';
            pills.push(`<span class="hud-buff-pill" style="--buff-color: #10b981;">REGEN [${rk}]</span>`);
          }
          if (bot.weaponType && bot.weaponCharges > 0) {
            const def = POWERUP_TYPES[bot.weaponType];
            pills.push(`<span class="hud-buff-pill" style="--buff-color: ${def.color};">${def.label} ×${bot.weaponCharges}</span>`);
          }
          if (bot.speedTimer > 0) {
            pills.push(`<span class="hud-buff-pill" style="--buff-color: ${POWERUP_TYPES.speed.color};">SPEED ${bot.speedTimer.toFixed(1)}s</span>`);
          }
          if (bot.shieldHp > 0) {
            pills.push(`<span class="hud-buff-pill" style="--buff-color: ${POWERUP_TYPES.shield.color};">SHIELD ${Math.ceil(bot.shieldHp)}</span>`);
          }
          if (bot.reflectTimer > 0) {
            pills.push(`<span class="hud-buff-pill" style="--buff-color: ${POWERUP_TYPES.reflect_shield.color};">REFLECT ${bot.reflectTimer.toFixed(1)}s</span>`);
          }
          buffsEl.innerHTML = pills.join('');
        }
      }
    }

    matchTimerEl.textContent = formatTime(matchTime);
    statShotsEl.textContent = String(matchStats.totalShots);
    statBouncesEl.textContent = String(matchStats.totalBounces);
    if (statDropEl) {
      statDropEl.textContent = powerups.length >= 5
        ? 'MAX (5)'
        : `${Math.max(0, powerupSpawnTimer).toFixed(1)}s`;
    }
  }

  // ==================== RENDERING ====================
  function renderArena() {
    ctx.save();
    // Apply subtle tactile camera shake on impacts & eliminations
    if (shakeMag > 0.15) {
      const sx = (Math.random() - 0.5) * 2 * shakeMag;
      const sy = (Math.random() - 0.5) * 2 * shakeMag;
      ctx.translate(sx, sy);
    }

    // 1. Draw pre-baked crisp themed maze
    if (mazeOffscreen) {
      ctx.drawImage(mazeOffscreen, 0, 0, CANVAS_W, CANVAS_H);
    } else {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    }

    // 1a. Dynamic randomized spawn pads + subtle animated pulse on special wall tiles
    for (const sp of matchSpawnPads) {
      ctx.save();
      ctx.fillStyle = sp.soft;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = sp.color;
      ctx.globalAlpha = 0.28;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.restore();
    }

    // Fading tread track impressions from moving robots
    for (const tm of treadMarks) {
      const ta = clamp(tm.life / tm.maxLife, 0, 1) * 0.16;
      ctx.save();
      ctx.translate(tm.x, tm.y);
      ctx.rotate(tm.angle);
      ctx.fillStyle = tm.color;
      ctx.globalAlpha = ta;
      ctx.fillRect(-3, -12, 5, 2.5);
      ctx.fillRect(-3, 9.5, 5, 2.5);
      ctx.restore();
    }

    if (specialWallTiles.length > 0) {
      const shimmer = 0.22 + 0.16 * Math.sin(matchTime * 4.2);
      for (const s of specialWallTiles) {
        const def = SPECIAL_TILE_TYPES[s.tileType];
        if (!def) continue;
        ctx.save();
        ctx.strokeStyle = def.color;
        ctx.globalAlpha = shimmer;
        ctx.lineWidth = 2;
        ctx.strokeRect(s.tx * TILE - 1, s.ty * TILE - 1, TILE + 2, TILE + 2);
        ctx.restore();
      }
    }

    // 1b. Persistent wall-impact chip/scorch decals
    for (const d of wallDecals) {
      ctx.save();
      ctx.fillStyle = d.color;
      ctx.globalAlpha = 0.24;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1e293b';
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 1c. Reactive wall/pillar impact glow pulses
    for (const wf of wallFlashes) {
      const a = clamp(wf.life / wf.maxLife, 0, 1);
      const wx = wf.tx * TILE;
      const wy = wf.ty * TILE;
      ctx.save();
      ctx.fillStyle = wf.color;
      ctx.globalAlpha = a * (wf.isPillar ? 0.58 : 0.38);
      ctx.fillRect(wx, wy, TILE, TILE);
      ctx.strokeStyle = wf.color;
      ctx.globalAlpha = a * 0.85;
      ctx.lineWidth = wf.isPillar ? 2.4 : 1.6;
      ctx.strokeRect(wx + 1, wy + 1, TILE - 2, TILE - 2);
      ctx.restore();
    }

    // 1d. Gentle ambient theme motes (petals, crystals, embers, leaves, dust)
    drawAmbientMotes();

    // 2. Scorch marks of eliminated bots
    for (const sm of scorchMarks) {
      ctx.save();
      ctx.fillStyle = 'rgba(30, 41, 59, 0.08)';
      ctx.beginPath();
      ctx.arc(sm.x, sm.y, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = sm.color;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sm.x - 6, sm.y - 6);
      ctx.lineTo(sm.x + 6, sm.y + 6);
      ctx.moveTo(sm.x + 6, sm.y - 6);
      ctx.lineTo(sm.x - 6, sm.y + 6);
      ctx.stroke();
      ctx.restore();
    }

    // 3. LiDAR Cones & Wall-Hit Pips (when toggled ON)
    if (showLidar) {
      for (const bot of bots) {
        if (!bot.alive || bot.lidarRays.length < 2) continue;
        drawLidarCone(bot);
      }
    }

    // 4. Brief Bank-Shot Ricochet Trajectory Flashes
    for (const bf of bankShotFlashes) {
      const alpha = (bf.life / bf.maxLife) * 0.55;
      ctx.save();
      ctx.strokeStyle = bf.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(bf.points[0].x, bf.points[0].y);
      for (let i = 1; i < bf.points.length; i++) {
        ctx.lineTo(bf.points[i].x, bf.points[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 4b. Fixed-forward aim guides for ALL active human players (P1 & P2)
    if (!matchOver) {
      for (const bot of bots) {
        if (bot.isPlayer && bot.alive) drawPlayerAimGuide(bot);
      }
    }

    // 4c. Deployed Proximity Shock Traps & Random Arena Power-Ups
    drawTraps();
    drawPowerups();
    drawSpeedTrails();

    // 5. Bouncing Bullets + Range Fade Indicator & Instant Laser Beams
    for (const b of bullets) {
      drawBullet(b);
    }
    drawLaserBeams();

    // 6. Robots & Crisp Directional Muzzle Flashes
    for (const bot of bots) {
      if (bot.alive) drawRobot(bot);
    }

    for (const mf of muzzleFlashes) {
      const ma = clamp(mf.life / mf.maxLife, 0, 1);
      ctx.save();
      ctx.translate(mf.x, mf.y);
      ctx.rotate(mf.angle);
      ctx.globalAlpha = ma * 0.85;
      ctx.fillStyle = mf.color;
      ctx.beginPath();
      ctx.moveTo(0, -5 * ma);
      ctx.lineTo(14 * ma + 4, 0);
      ctx.lineTo(0, 5 * ma);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(2, 0, 3.2 * ma, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 7. Particles & Impact Rings
    drawParticles();

    // 7b. Floating Tactical Callouts (+HP Regen, +RANGE!, SPEED+!, 3× SPREAD!)
    for (const ft of floatingTexts) {
      const alpha = clamp(ft.life / ft.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '800 11px "JetBrains Mono", Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.92)';
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }

    // 8. Floating Speech Bubbles & Power-Up Drop Banner (drawn last on top)
    for (const sb of speechBubbles) {
      drawSpeechBubble(sb);
    }
    drawPowerupBanner();

    ctx.restore();
  }

  function drawAmbientMotes() {
    const th = currentTheme || MAZE_THEMES[0];
    ctx.save();
    ctx.fillStyle = th.moteColor;
    for (const m of ambientMotes) {
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.angle);
      if (th.moteStyle === 'petal' || th.moteStyle === 'leaf') {
        ctx.beginPath();
        ctx.ellipse(0, 0, m.size * 1.35, m.size * 0.65, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (th.moteStyle === 'crystal') {
        ctx.beginPath();
        ctx.moveTo(0, -m.size);
        ctx.lineTo(m.size * 0.75, 0);
        ctx.lineTo(0, m.size);
        ctx.lineTo(-m.size * 0.75, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, m.size * 0.65, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawPowerups() {
    for (const p of powerups) {
      const bob = Math.sin(p.age * 4.5) * 3.0;
      const pulse = 0.5 + 0.5 * Math.sin(p.age * 5.5);
      // Elastic pop-in drop animation during first 0.55s
      const spawnT = clamp(p.age / 0.55, 0, 1);
      const scale = spawnT < 1
        ? (spawnT < 0.7 ? (spawnT / 0.7) * 1.28 : 1.28 - ((spawnT - 0.7) / 0.3) * 0.28)
        : 1;
      const dropOffsetY = spawnT < 1 ? -(1 - spawnT) * (1 - spawnT) * 38 : 0;

      const px = p.x;
      const py = p.y + bob + dropOffsetY;

      ctx.save();

      // 1. Sky-drop vertical beacon beam during first 0.85s so spawn location is unmistakable!
      if (p.age < 0.85) {
        const beamAlpha = (1 - p.age / 0.85) * 0.42;
        const grad = ctx.createLinearGradient(p.x, Math.max(0, p.y - 160), p.x, p.y + 10);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, p.color);
        ctx.fillStyle = grad;
        ctx.globalAlpha = beamAlpha;
        ctx.fillRect(p.x - 11, Math.max(0, p.y - 160), 22, Math.min(170, p.y + 10));
        ctx.globalAlpha = 1;
      }

      // 2. Continuous radar sonar ping ring every 1.6s so active power-ups stand out across the map!
      const sonarCycle = (p.age % 1.6) / 1.6;
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = (1 - sonarCycle) * 0.52;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 15 + sonarCycle * 26, 0, Math.PI * 2);
      ctx.stroke();

      // Ground shadow under bobbing medallion
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 14, 11 * scale, 4 * scale, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.translate(px, py);
      ctx.scale(scale, scale);

      // 3. Rotating dashed energy ring around the medallion
      ctx.save();
      ctx.rotate(p.age * 2.2);
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 0.45 + pulse * 0.3;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, 17.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 4. Crisp high-contrast medallion (bigger 14.5px radius!)
      ctx.globalAlpha = 1;
      ctx.shadowColor = 'rgba(15, 23, 42, 0.2)';
      ctx.shadowBlur = 9;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.arc(0, 0, 14.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.stroke();

      // Vibrant inner tint
      ctx.fillStyle = p.soft;
      ctx.beginPath();
      ctx.arc(0, 0, 11.2, 0, Math.PI * 2);
      ctx.fill();

      // Crisp vector icon per power-up type
      ctx.strokeStyle = p.color;
      ctx.fillStyle = p.color;
      ctx.lineWidth = 2.1;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (p.type === 'piercing') {
        ctx.beginPath();
        ctx.moveTo(-7, 0); ctx.lineTo(7, 0);
        ctx.moveTo(3, -4); ctx.lineTo(7, 0); ctx.lineTo(3, 4);
        ctx.moveTo(0, -6); ctx.lineTo(0, 6);
        ctx.stroke();
      } else if (p.type === 'penetrate') {
        ctx.beginPath();
        ctx.moveTo(-6, -4.5); ctx.lineTo(-1.5, 0); ctx.lineTo(-6, 4.5);
        ctx.moveTo(0, -4.5); ctx.lineTo(4.5, 0); ctx.lineTo(0, 4.5);
        ctx.moveTo(6.5, -5.5); ctx.lineTo(6.5, 5.5);
        ctx.stroke();
      } else if (p.type === 'speed') {
        ctx.beginPath();
        ctx.moveTo(1.5, -7.5); ctx.lineTo(-4.5, 0.5); ctx.lineTo(0.5, 0.5);
        ctx.lineTo(-2, 7.5); ctx.lineTo(5.5, -1); ctx.lineTo(0.5, -1);
        ctx.closePath();
        ctx.fill();
      } else if (p.type === 'ultra_ricochet') {
        ctx.beginPath();
        ctx.moveTo(-7, 4.5); ctx.lineTo(-2.5, -4.5); ctx.lineTo(2.5, 4); ctx.lineTo(7, -4.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(7, -4.5, 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'laser') {
        ctx.beginPath();
        ctx.moveTo(-7.5, 0); ctx.lineTo(7.5, 0);
        ctx.moveTo(0, -6.5); ctx.lineTo(0, 6.5);
        ctx.moveTo(-4.8, -4.8); ctx.lineTo(4.8, 4.8);
        ctx.moveTo(4.8, -4.8); ctx.lineTo(-4.8, 4.8);
        ctx.stroke();
      } else if (p.type === 'shield') {
        ctx.beginPath();
        ctx.moveTo(0, -7); ctx.lineTo(6.5, -4); ctx.lineTo(5.8, 2);
        ctx.lineTo(0, 7); ctx.lineTo(-5.8, 2); ctx.lineTo(-6.5, -4);
        ctx.closePath();
        ctx.stroke();
      } else if (p.type === 'trap') {
        ctx.beginPath();
        ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
        ctx.fill();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 4, Math.sin(a) * 4);
          ctx.lineTo(Math.cos(a) * 7.5, Math.sin(a) * 7.5);
          ctx.stroke();
        }
      } else if (p.type === 'reflect_shield') {
        ctx.beginPath();
        ctx.moveTo(0, -7); ctx.lineTo(7, 0); ctx.lineTo(0, 7); ctx.lineTo(-7, 0);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. High-contrast white pill label badge underneath so text is crystal clear!
      ctx.font = '800 8px "JetBrains Mono", Consolas, monospace';
      const lw = ctx.measureText(p.label).width + 10;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.2;
      roundRect(ctx, -lw * 0.5, 16, lw, 13, 6);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = p.color;
      ctx.fillText(p.label, 0, 22.8);

      ctx.restore();
    }
  }

  function drawPowerupBanner() {
    if (!powerupBanner) return;
    const b = powerupBanner;
    const fadeIn = clamp((b.maxLife - b.life) / 0.22, 0, 1);
    const fadeOut = clamp(b.life / 0.4, 0, 1);
    const alpha = Math.min(fadeIn, fadeOut);
    const slideY = 16 + (1 - fadeIn) * -12;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '800 11.5px "JetBrains Mono", Consolas, monospace';
    const textW = ctx.measureText(b.text).width;
    const boxW = textW + 34;
    const boxH = 28;
    const bx = (CANVAS_W - boxW) * 0.5;
    const by = slideY;

    ctx.shadowColor = 'rgba(15, 23, 42, 0.16)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 2;
    roundRect(ctx, bx, by, boxW, boxH, 14);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.stroke();

    // Pulsing colored beacon dot
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(bx + 14, by + boxH * 0.5, 4.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.text, bx + 24, by + boxH * 0.5 + 0.5);
    ctx.restore();
  }

  function drawTraps() {
    for (const tr of traps) {
      const armed = tr.armTimer <= 0;
      const pulse = 0.5 + 0.5 * Math.sin(tr.pulse);
      ctx.save();
      ctx.translate(tr.x, tr.y);

      // Subtle proximity trigger radius ring
      ctx.strokeStyle = armed ? POWERUP_TYPES.trap.color : '#94a3b8';
      ctx.globalAlpha = armed ? (0.25 + pulse * 0.25) : 0.2;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, Math.PI * 2);
      ctx.stroke();

      // Mine body
      ctx.setLineDash([]);
      ctx.globalAlpha = armed ? 0.9 : 0.45;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = tr.color;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Blinking armed core
      ctx.fillStyle = armed ? (pulse > 0.5 ? '#ef4444' : POWERUP_TYPES.trap.color) : '#94a3b8';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  function drawSpeedTrails() {
    for (const st of speedTrails) {
      const alpha = (st.life / st.maxLife) * 0.3;
      ctx.save();
      ctx.translate(st.x, st.y);
      ctx.rotate(st.angle);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = st.color;
      roundRect(ctx, -11, -9, 22, 18, 5);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawLaserBeams() {
    for (const lb of laserBeams) {
      if (lb.points.length < 2) continue;
      const ratio = clamp(lb.life / lb.maxLife, 0, 1);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Outer crimson glow
      ctx.strokeStyle = lb.color;
      ctx.globalAlpha = ratio * 0.45;
      ctx.lineWidth = 11 * ratio + 2;
      ctx.beginPath();
      ctx.moveTo(lb.points[0].x, lb.points[0].y);
      for (let i = 1; i < lb.points.length; i++) ctx.lineTo(lb.points[i].x, lb.points[i].y);
      ctx.stroke();

      // Bright mid beam
      ctx.globalAlpha = ratio * 0.92;
      ctx.lineWidth = 4.5 * ratio + 1;
      ctx.stroke();

      // Razor white core
      ctx.strokeStyle = lb.coreColor;
      ctx.globalAlpha = ratio;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawLidarCone(bot) {
    const rays = bot.lidarRays;
    ctx.save();

    // Translucent fan polygon
    ctx.beginPath();
    ctx.moveTo(bot.x, bot.y);
    for (const r of rays) {
      ctx.lineTo(r.x, r.y);
    }
    ctx.closePath();
    ctx.fillStyle = bot.color;
    ctx.globalAlpha = 0.08;
    ctx.fill();

    // Individual LiDAR beams
    for (const r of rays) {
      ctx.beginPath();
      ctx.moveTo(bot.x, bot.y);
      ctx.lineTo(r.x, r.y);
      ctx.strokeStyle = bot.color;
      ctx.globalAlpha = r.hitEnemy ? 0.55 : 0.18;
      ctx.lineWidth = r.hitEnemy ? 1.5 : 0.85;
      ctx.stroke();

      // Hit pips
      if (r.hitWall || r.hitEnemy) {
        ctx.fillStyle = bot.color;
        ctx.globalAlpha = r.hitEnemy ? 0.85 : 0.42;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.hitEnemy ? 2.8 : 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawBullet(b) {
    const ratio = clamp(b.distance / b.maxRange, 0, 1);
    const remainingRatio = 1 - ratio;
    // Smooth fade as bullet approaches 550px max range
    const alpha = ratio < 0.45 ? 1 : clamp(1 - ((ratio - 0.45) / 0.55) * 0.78, 0.22, 1);

    ctx.save();

    // Velocity trail with fade
    if (b.trail.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(b.trail[0].x, b.trail[0].y);
      for (let i = 1; i < b.trail.length; i++) {
        ctx.lineTo(b.trail[i].x, b.trail[i].y);
      }
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = alpha * 0.35;
      ctx.lineWidth = 3.2 * (0.45 + 0.55 * remainingRatio);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    // Subtle visual range-remaining halo arc around aging bullets
    if (ratio > 0.25) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, BULLET_RADIUS + 3.5, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * remainingRatio);
      ctx.strokeStyle = b.color;
      ctx.globalAlpha = alpha * 0.55;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    // Bullet core (distinct visual halos for supercharged, piercing, penetrate, and ultra-ricochet!)
    ctx.globalAlpha = alpha;
    if (b.supercharged || b.ultraRicochet || b.piercing || b.penetrateLeft > 0) {
      ctx.strokeStyle = b.supercharged ? '#f59e0b' : b.color;
      ctx.lineWidth = 2;
      if (b.penetrateLeft > 0) ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.arc(b.x, b.y, BULLET_RADIUS + (b.ultraRicochet ? 3.2 : 2.6), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BULLET_RADIUS * (0.72 + 0.28 * remainingRatio), 0, Math.PI * 2);
    ctx.fill();

    // Crisp white specular center (highlights bounced shots with bright ring)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.bounces > 0 ? 2.1 : 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawPlayerAimGuide(bot) {
    // Fixed-forward firing line strictly along robot facing direction (no mouse aim)
    const dx = Math.cos(bot.bodyAngle);
    const dy = Math.sin(bot.bodyAngle);
    const startX = bot.x + dx * (BOT_RADIUS + 6);
    const startY = bot.y + dy * (BOT_RADIUS + 6);
    const aimHit = castRay(startX, startY, dx, dy, Math.min(300, BULLET_MAX_RANGE));

    ctx.save();
    ctx.strokeStyle = bot.color;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(aimHit.x, aimHit.y);
    ctx.stroke();

    // Enhanced 1st wall-bounce preview stub (highlights Special Wall Tiles & 3-Way Spread fan!)
    if (aimHit.hit && aimHit.dist < 280) {
      const hitTileType =
        aimHit.tileX >= 0 && aimHit.tileY >= 0 && aimHit.tileX < GRID_W && aimHit.tileY < GRID_H
          ? grid[aimHit.tileY][aimHit.tileX]
          : 1;
      const rdx = aimHit.nx !== 0 ? -dx : dx;
      const rdy = aimHit.ny !== 0 ? -dy : dy;
      const baseBounceAngle = Math.atan2(rdy, rdx);
      const bx = aimHit.x + aimHit.nx * 0.8;
      const by = aimHit.y + aimHit.ny * 0.8;

      if (hitTileType === 5) {
        // 3× Spread Wall: preview all 3 fan paths!
        ctx.strokeStyle = SPECIAL_TILE_TYPES[5].color;
        ctx.globalAlpha = 0.42;
        ctx.lineWidth = 1.6;
        for (const off of [0, -0.28, 0.28]) {
          const sa = baseBounceAngle + off;
          const bh = castRay(bx, by, Math.cos(sa), Math.sin(sa), 145);
          ctx.beginPath();
          ctx.moveTo(aimHit.x, aimHit.y);
          ctx.lineTo(bh.x, bh.y);
          ctx.stroke();
        }
      } else {
        const isSpecial = hitTileType >= 2 && hitTileType <= 4;
        const previewLen = hitTileType === 3 ? 200 : isSpecial ? 150 : 110;
        const previewColor = hitTileType === 3 || hitTileType === 4
          ? SPECIAL_TILE_TYPES[hitTileType].color
          : hitTileType === 2
          ? '#f59e0b'
          : bot.color;
        const bounceHit = castRay(bx, by, rdx, rdy, previewLen);
        ctx.strokeStyle = previewColor;
        ctx.globalAlpha = isSpecial ? 0.42 : 0.16;
        ctx.lineWidth = isSpecial ? 1.7 : 1.5;
        ctx.beginPath();
        ctx.moveTo(aimHit.x, aimHit.y);
        ctx.lineTo(bounceHit.x, bounceHit.y);
        ctx.stroke();
      }
      ctx.strokeStyle = bot.color;
      ctx.lineWidth = 1.5;
    }

    // AIMBOT LOCK-ON VISUAL (Every 2nd Shot!)
    if (bot.aimbotReady && bot.aimbotLock && bot.aimbotLock.target && bot.aimbotLock.target.alive) {
      const lock = bot.aimbotLock;
      const lockColor = '#db2777';
      const pulse = 0.5 + 0.5 * Math.sin(matchTime * 10);

      // Dashed magenta lock trajectory line (direct lead OR bank-shot bounce path!)
      if (lock.points && lock.points.length >= 2) {
        ctx.strokeStyle = lockColor;
        ctx.globalAlpha = 0.35 + pulse * 0.25;
        ctx.lineWidth = 1.8;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(lock.points[0].x, lock.points[0].y);
        for (let i = 1; i < lock.points.length; i++) {
          ctx.lineTo(lock.points[i].x, lock.points[i].y);
        }
        ctx.stroke();
      }

      // Target-lock diamond brackets around locked enemy
      const tx = lock.target.x;
      const ty = lock.target.y;
      const br = BOT_RADIUS + 7 + pulse * 2.5;
      ctx.setLineDash([]);
      ctx.strokeStyle = lockColor;
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 2;

      // 4 crisp corner lock brackets
      const len = 6;
      ctx.beginPath();
      ctx.moveTo(tx - br, ty - br + len); ctx.lineTo(tx - br, ty - br); ctx.lineTo(tx - br + len, ty - br);
      ctx.moveTo(tx + br - len, ty - br); ctx.lineTo(tx + br, ty - br); ctx.lineTo(tx + br, ty - br + len);
      ctx.moveTo(tx + br, ty + br - len); ctx.lineTo(tx + br, ty + br); ctx.lineTo(tx + br - len, ty + br);
      ctx.moveTo(tx - br + len, ty + br); ctx.lineTo(tx - br, ty + br); ctx.lineTo(tx - br, ty + br - len);
      ctx.stroke();

      // Tiny lock label above target
      ctx.font = '800 8px "JetBrains Mono", Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = lockColor;
      ctx.fillText(lock.mode === 'bank' ? 'AIMBOT BANK' : 'AIMBOT LOCK', tx, ty - br - 5);
    }

    ctx.restore();
  }

  function getBotSkin(bot) {
    if (!bot) return 'default';
    if (bot.isPlayer) return 'player';
    const n = String(bot.name || '').toLowerCase();
    if (n.includes('gemini')) return 'gemini';
    if (n.includes('claude')) return 'claude';
    if (n.includes('chatgpt') || n.includes('gpt') || n.includes('openai')) return 'chatgpt';
    if (n.includes('grok')) return 'grok';
    if (n.includes('deepseek')) return 'deepseek';
    return 'default';
  }

  function drawSkinEmblem(skin) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffffff';
    if (skin === 'player') {
      // 5-point Commander star
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 4.3 : 1.8;
        const a = -Math.PI * 0.5 + (i / 10) * Math.PI * 2;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    } else if (skin === 'gemini') {
      // 4-point crisp star
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 === 0 ? 4.5 : 1.5;
        const a = (i / 8) * Math.PI * 2;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    } else if (skin === 'claude') {
      // 6-ray sunburst
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 1.2, Math.sin(a) * 1.2);
        ctx.lineTo(Math.cos(a) * 4.2, Math.sin(a) * 4.2);
        ctx.stroke();
      }
    } else if (skin === 'chatgpt') {
      // Crisp hollow hex-ring knot
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 1.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (skin === 'grok') {
      // Bold diagonal slash inside ring
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, 3.8, 0.3, Math.PI * 2 - 0.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-3.2, 3.2);
      ctx.lineTo(3.2, -3.2);
      ctx.stroke();
    } else if (skin === 'deepseek') {
      // Forward sonar wave arcs
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(-1, 0, 2.8, -0.95, 0.95);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-1, 0, 4.6, -0.75, 0.75);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(2.5, 0, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRobot(bot) {
    const skin = getBotSkin(bot);
    ctx.save();
    ctx.translate(bot.x, bot.y);

    // Subtle halo ring highlighting the player-controlled robot
    if (bot.isPlayer) {
      ctx.save();
      ctx.strokeStyle = bot.color;
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, BOT_RADIUS + 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Soft ground shadow
    ctx.fillStyle = 'rgba(15, 23, 42, 0.14)';
    ctx.beginPath();
    ctx.arc(1.5, 3, BOT_RADIUS + 1, 0, Math.PI * 2);
    ctx.fill();

    // Chassis + Treads rotated to bodyAngle (distinct hull silhouettes per identity)
    ctx.save();
    ctx.rotate(bot.bodyAngle);

    // Side treads with animated travel ticks
    ctx.fillStyle = '#334155';
    roundRect(ctx, -12, -14.5, 24, 5, 2);
    ctx.fill();
    roundRect(ctx, -12, 9.5, 24, 5, 2);
    ctx.fill();

    const treadPhase = (bot.distanceTraveled || 0) % 6;
    ctx.fillStyle = 'rgba(248, 250, 252, 0.38)';
    for (let tx = -10 + treadPhase; tx <= 9; tx += 6) {
      ctx.fillRect(tx, -14.2, 1.6, 4.4);
      ctx.fillRect(tx, 9.8, 1.6, 4.4);
    }

    // Distinct armored rover hull silhouette
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = bot.hitFlash > 0.2 ? '#0f172a' : bot.color;
    ctx.lineWidth = skin === 'player' ? 2.6 : 2.4;

    if (skin === 'grok') {
      // Swept angular delta hull
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(4, -10.5);
      ctx.lineTo(-12, -9);
      ctx.lineTo(-9, 0);
      ctx.lineTo(-12, 9);
      ctx.lineTo(4, 10.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (skin === 'gemini') {
      // Crisp octagonal faceted hull
      ctx.beginPath();
      ctx.moveTo(12, -4);
      ctx.lineTo(12, 4);
      ctx.lineTo(4, 10.5);
      ctx.lineTo(-6, 10.5);
      ctx.lineTo(-12, 5);
      ctx.lineTo(-12, -5);
      ctx.lineTo(-6, -10.5);
      ctx.lineTo(4, -10.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (skin === 'deepseek') {
      // Tapered hydro-finned hull
      ctx.beginPath();
      ctx.moveTo(13, -3);
      ctx.lineTo(13, 3);
      ctx.lineTo(2, 11);
      ctx.lineTo(-11, 8.5);
      ctx.lineTo(-13, 4);
      ctx.lineTo(-13, -4);
      ctx.lineTo(-11, -8.5);
      ctx.lineTo(2, -11);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (skin === 'claude') {
      // Soft rounded-pill armored hull
      roundRect(ctx, -12, -10.5, 24, 21, 9);
      ctx.fill();
      ctx.stroke();
    } else {
      roundRect(ctx, -12, -10.5, 24, 21, 6);
      ctx.fill();
      ctx.stroke();
    }

    // Colored inner core plate
    ctx.fillStyle = bot.hitFlash > 0.35 ? '#fecaca' : bot.soft;
    roundRect(ctx, -8.5, -7, 17, 14, skin === 'claude' ? 6 : 4);
    ctx.fill();

    // Forward direction chevron / Commander dual nose plates
    ctx.fillStyle = bot.color;
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(6.5, -3.6);
    ctx.lineTo(6.5, 3.6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Fixed Forward Cannon rigidly locked to chassis facing direction
    ctx.save();
    ctx.rotate(bot.bodyAngle);

    // Barrel with subtle firing recoil
    const barrelLen = 18 - bot.recoil * 0.7;
    ctx.fillStyle = '#1e293b';
    roundRect(ctx, 2, -2.5, barrelLen, 5, 2);
    ctx.fill();

    // Colored muzzle tip (glows with special power-up weapon color when charged!)
    ctx.fillStyle = (bot.weaponType && bot.weaponCharges > 0) ? POWERUP_TYPES[bot.weaponType].color : bot.color;
    ctx.fillRect(barrelLen - 1.5, -2.8, 4.2, 5.6);

    // Turret dome
    ctx.fillStyle = bot.color;
    ctx.beginPath();
    ctx.arc(0, 0, skin === 'player' ? 7.4 : 6.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Custom identity emblem on turret dome
    drawSkinEmblem(skin);

    ctx.restore();

    // Active Power-Up Auras around Robot (Shield, Reflective Shield, Speed, Stun)
    if (bot.shieldHp > 0) {
      ctx.save();
      ctx.fillStyle = POWERUP_TYPES.shield.color;
      ctx.globalAlpha = 0.14;
      ctx.beginPath();
      ctx.arc(0, 0, BOT_RADIUS + 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = POWERUP_TYPES.shield.color;
      ctx.lineWidth = 2.4;
      const sFrac = clamp(bot.shieldHp / POWERUP_TYPES.shield.shieldHp, 0, 1);
      ctx.beginPath();
      ctx.arc(0, 0, BOT_RADIUS + 6, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * sFrac);
      ctx.stroke();
      ctx.restore();
    }

    if (bot.reflectTimer > 0) {
      ctx.save();
      ctx.rotate(matchTime * 3.2);
      ctx.strokeStyle = POWERUP_TYPES.reflect_shield.color;
      ctx.fillStyle = POWERUP_TYPES.reflect_shield.color;
      ctx.globalAlpha = 0.14;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      const sides = 8;
      const rad = BOT_RADIUS + 8.5;
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * Math.PI * 2;
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.88;
      ctx.stroke();
      ctx.restore();
    }

    if (bot.stunTimer > 0) {
      ctx.save();
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, BOT_RADIUS + 3, matchTime * 6, matchTime * 6 + Math.PI * 1.5);
      ctx.stroke();
      ctx.restore();
    }

    // Overhead Mini HP Bar + Nameplate
    const isTankPlayer = bot.maxHp > MAX_HP;
    const barW = isTankPlayer ? 46 : 34;
    const barH = isTankPlayer ? 5 : 4;
    const barY = -BOT_RADIUS - 11;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    roundRect(ctx, -barW / 2 - 1, barY - 1, barW + 2, barH + 2, 3);
    ctx.fill();

    ctx.fillStyle = '#e2e8f0';
    roundRect(ctx, -barW / 2, barY, barW, barH, 2);
    ctx.fill();

    const hpRatio = clamp(bot.hp / bot.maxHp, 0, 1);
    ctx.fillStyle = bot.color;
    if (hpRatio > 0) {
      roundRect(ctx, -barW / 2, barY, barW * hpRatio, barH, 2);
      ctx.fill();
    }

    // Segment ticks (every 100 HP) for high-HP player tanks
    if (isTankPlayer) {
      const segs = Math.floor(bot.maxHp / 100);
      if (segs > 1) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        for (let s = 1; s < segs; s++) {
          const sx = -barW / 2 + (barW * (s * 100)) / bot.maxHp;
          ctx.fillRect(sx - 0.5, barY, 1, barH);
        }
      }
    }

    // Overhead Per-Bullet Reload Progress Bar (1.5s per bullet)
    if (bot.ammo < bot.maxAmmo) {
      const rProgress = clamp(1 - bot.reloadTimer / RELOAD_PER_BULLET, 0, 1);
      const isEmpty = bot.ammo === 0;
      const rW = isEmpty ? 40 : 34;
      const rH = isEmpty ? 5 : 3;
      const rY = barY - (isEmpty ? 10 : 6);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      roundRect(ctx, -rW / 2 - 1, rY - 1, rW + 2, rH + 2, 3);
      ctx.fill();

      ctx.fillStyle = '#fef3c7';
      roundRect(ctx, -rW / 2, rY, rW, rH, 2);
      ctx.fill();

      ctx.fillStyle = '#f59e0b';
      roundRect(ctx, -rW / 2, rY, rW * rProgress, rH, 2);
      ctx.fill();

      if (isEmpty) {
        ctx.font = '700 8.5px "JetBrains Mono", Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#b45309';
        ctx.fillText(`RELOAD ${bot.reloadTimer.toFixed(1)}s`, 0, rY - 3);
      }
    }

    // Clean crisp model / player nameplate below robot
    ctx.font = '800 8.5px "JetBrains Mono", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = bot.isPlayer ? bot.dark : '#334155';
    const labelText = bot.isPlayer ? `${bot.presetShort} · ${bot.name}` : bot.name;
    ctx.fillText(labelText.slice(0, 14), 0, BOT_RADIUS + 11);

    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (p.type === 'spark') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * alpha), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'ring') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.dashed ? 1.5 : 2;
        if (p.dashed) ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawSpeechBubble(sb) {
    const fade = sb.life < 0.35 ? sb.life / 0.35 : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.font = '700 10.5px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const textW = ctx.measureText(sb.text).width;
    const padX = 9;
    const boxW = textW + padX * 2 + 8;
    const boxH = 22;

    const owner = bots[sb.botId];
    const extraOffset = owner && owner.reloading ? 42 : 30;
    const bx = clamp(sb.x - boxW * 0.5, 8, CANVAS_W - boxW - 8);
    const by = clamp(sb.y - extraOffset - boxH, 8, CANVAS_H - boxH - 12);

    // Bubble shadow + white pill
    ctx.shadowColor = 'rgba(15, 23, 42, 0.14)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = sb.color;
    ctx.lineWidth = 1.5;
    roundRect(ctx, bx, by, boxW, boxH, 11);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.stroke();

    // Pointer triangle
    const tipX = clamp(sb.x, bx + 10, bx + boxW - 10);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(tipX - 4, by + boxH - 1);
    ctx.lineTo(tipX + 4, by + boxH - 1);
    ctx.lineTo(tipX, by + boxH + 5);
    ctx.closePath();
    ctx.fill();

    // Colored dot + text
    ctx.fillStyle = sb.color;
    ctx.beginPath();
    ctx.arc(bx + 10, by + boxH * 0.5, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#161e2e';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(sb.text, bx + 17, by + boxH * 0.5 + 0.5);

    ctx.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  // ==================== MAIN SIMULATION LOOP ====================
  let lastFrameTs = 0;
  let hudAccum = 0;

  function sampleMatchTelemetry(dt) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      bot.wallBumpCooldown = Math.max(0, bot.wallBumpCooldown - dt);
      const speed = hypot(bot.vx, bot.vy);
      const stepDist = speed * dt;
      bot.distanceTraveled += stepDist;
      bot.treadDistAccum += stepDist;
      if (bot.treadDistAccum >= 11 && speed > 18) {
        bot.treadDistAccum = 0;
        treadMarks.push({
          x: bot.x,
          y: bot.y,
          angle: bot.bodyAngle,
          color: bot.color,
          life: 2.6,
          maxLife: 2.6
        });
        if (treadMarks.length > 140) treadMarks.shift();
      }
      if (speed < 6) bot.timeStuck += dt;
      if (bot.ammo === 0) bot.timeEmptyAmmo += dt;

      // Track exposure to enemy direct line-of-sight
      for (const other of bots) {
        if (!other.alive || other.id === bot.id) continue;
        if (hypot(other.x - bot.x, other.y - bot.y) < 560 && hasLineOfSight(bot.x, bot.y, other.x, other.y)) {
          bot.timeInLOS += dt;
          break;
        }
      }

      // Track close-call bullet dodges (enemy bullet passing within radius + 24px without hitting)
      for (const b of bullets) {
        if (b.ownerId === bot.id || bot.dodgedBulletIds.has(b.uid)) continue;
        const d = hypot(bot.x - b.x, bot.y - b.y);
        if (d < BOT_RADIUS + 26 && d > BOT_RADIUS + 2) {
          bot.dodgedBulletIds.add(b.uid);
          bot.closeDodges++;
          pushBotEvent(bot, { type: 'dodge_close', bulletDist: Math.round(d) });
        }
      }
    }
  }

  function stepSimulation(dt) {
    if (matchOver) {
      // Keep lingering explosion particles animating gently after match ends
      updateEffects(dt * 0.5);
      return;
    }

    matchTime += dt;
    timeSinceLastDamage += dt;

    for (const bot of bots) {
      updateBotAI(bot, dt);
    }
    resolveBotBotCollisions();
    updatePowerupsAndTraps(dt);
    updateBullets(dt);
    sampleMatchTelemetry(dt);
    updateEffects(dt);
  }

  function loop(ts) {
    requestAnimationFrame(loop);
    if (!lastFrameTs) lastFrameTs = ts;
    const rawDt = Math.min((ts - lastFrameTs) / 1000, 0.05);
    lastFrameTs = ts;

    if (screenMode !== 'arena') return;

    if (!isPaused) {
      if (killSlowMoTimer > 0) {
        killSlowMoTimer = Math.max(0, killSlowMoTimer - rawDt);
      }
      // Sub-step fixed physics cleanly for 0.25x to 4x speed (with crisp micro slow-mo on kills)
      const slowMul = killSlowMoTimer > 0 ? 0.35 : 1;
      const totalSimDt = rawDt * matchSpeed * slowMul;
      const maxStep = 1 / 60;
      let rem = totalSimDt;
      while (rem > 0.0001) {
        const step = Math.min(rem, maxStep);
        stepSimulation(step);
        rem -= step;
      }

      hudAccum += rawDt;
      if (hudAccum >= 0.08) {
        hudAccum = 0;
        updateHudDom();
      }
    }

    renderArena();
  }

  // ==================== UI EVENT WIRING ====================
  btnBgm.addEventListener('click', () => {
    SoundEngine.unlock();
    const next = !SoundEngine.isBgmEnabled();
    SoundEngine.setBgmEnabled(next);
    btnBgm.classList.toggle('toggle-on', next);
    btnBgm.innerHTML = `<span class="dot"></span>BGM: ${next ? 'ON' : 'OFF'}`;
  });

  btnSfx.addEventListener('click', () => {
    SoundEngine.unlock();
    const next = !SoundEngine.isSfxEnabled();
    SoundEngine.setSfxEnabled(next);
    btnSfx.classList.toggle('toggle-on', next);
    btnSfx.innerHTML = `<span class="dot"></span>SFX: ${next ? 'ON' : 'OFF'}`;
  });

  btnCountMinus.addEventListener('click', () => {
    SoundEngine.unlock();
    setBotCount(activeBotCount - 1);
  });

  btnCountPlus.addEventListener('click', () => {
    SoundEngine.unlock();
    setBotCount(activeBotCount + 1);
  });

  btnQuickPvp.addEventListener('click', () => {
    SoundEngine.unlock();
    activeBotCount = 2;
    botConfigs[0].role = 'p1';
    botConfigs[1].role = 'p2';
    botConfigs[2].role = 'ai';
    botConfigs[3].role = 'ai';
    renderSetupCards();
  });

  btnRandomize.addEventListener('click', () => {
    SoundEngine.unlock();
    randomizeAllConfigs();
  });

  btnStartBattle.addEventListener('click', () => {
    startMatch(true);
  });

  speedControls.addEventListener('click', e => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    matchSpeed = Number(btn.dataset.speed) || 1;
    speedControls.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b === btn));
    SoundEngine.refreshBgmTempo();
  });

  btnLidar.addEventListener('click', () => {
    showLidar = !showLidar;
    btnLidar.classList.toggle('toggle-on', showLidar);
    btnLidar.innerHTML = `<span class="dot"></span>LiDAR: ${showLidar ? 'ON' : 'OFF'}`;
  });

  btnPause.addEventListener('click', () => {
    if (matchOver) return;
    isPaused = !isPaused;
    btnPause.textContent = isPaused ? 'Resume' : 'Pause';
    btnPause.classList.toggle('paused', isPaused);
    pauseOverlay.classList.toggle('hidden', !isPaused);
    if (isPaused) SoundEngine.stopBgm();
    else SoundEngine.startBgm();
  });

  btnReset.addEventListener('click', () => {
    startMatch(true);
  });

  function returnToSetup() {
    stopAutoTrain(true);
    SoundEngine.stopBgm();
    terminateAllCodeWorkers();
    screenMode = 'setup';
    isPaused = false;
    arenaScreen.classList.add('hidden');
    battleControls.classList.add('hidden');
    victoryOverlay.classList.add('hidden');
    pauseOverlay.classList.add('hidden');
    setupScreen.classList.remove('hidden');
    renderSetupCards();
  }

  // ==================== RULES, PROMPT & CODE MODAL CONTROLLERS ====================
  function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    }
    return fallbackCopy(text);
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function openPromptModal() {
    syncRulesFromInputs();
    promptPreviewText.value = generateAIPrompt();
    promptCopyStatus.textContent = 'Reflects your current Arena Rules';
    promptCopyStatus.className = 'modal-status';
    promptModal.classList.remove('hidden');
  }

  function closePromptModal() {
    promptModal.classList.add('hidden');
  }

  function setCodeModalTab(tab) {
    tabBtnCode.classList.toggle('active', tab === 'code');
    tabBtnMind.classList.toggle('active', tab === 'mind');
    tabBtnBrain.classList.toggle('active', tab === 'brain');
    tabPanelCode.classList.toggle('hidden', tab !== 'code');
    tabPanelMind.classList.toggle('hidden', tab !== 'mind');
    tabPanelBrain.classList.toggle('hidden', tab !== 'brain');
    if (tab === 'brain') {
      refreshBrainViews(editingCodeSlotIdx);
    }
  }

  function refreshBrainViews(slotIdx) {
    const slot = BOT_SLOTS[slotIdx];
    const cfg = botConfigs[slotIdx];
    if (!slot || !cfg) return;
    const rec = loadBotBrainRecord(slot.id, cfg.name);
    const jsonStr = JSON.stringify(rec.data, null, 2);
    const sizeKb = (jsonStr.length / 1024).toFixed(1);
    const winPct = rec.meta.matches > 0 ? Math.round((rec.meta.wins / rec.meta.matches) * 100) : 0;

    brainStatsRow.innerHTML = `
      <div class="brain-stat-chip"><span>Generation</span><strong>Gen #${rec.meta.matches + 1}</strong></div>
      <div class="brain-stat-chip"><span>Record</span><strong>${rec.meta.wins}W - ${Math.max(0, rec.meta.matches - rec.meta.wins)}L (${winPct}%)</strong></div>
      <div class="brain-stat-chip"><span>Total Kills</span><strong>${rec.meta.totalKills}</strong></div>
      <div class="brain-stat-chip"><span>Brain Size</span><strong>${sizeKb} KB</strong></div>
    `;

    if (rec.meta.logs.length === 0) {
      brainLogList.innerHTML = `<li class="brain-log-item">No matches learned yet. Run a match or click <strong>Auto-Train ×5</strong> to watch this robot's <code>state.brain</code> &amp; <code>onMatchEnd()</code> evolve across generations!</li>`;
    } else {
      brainLogList.innerHTML = rec.meta.logs.map(item => `
        <li class="brain-log-item ${item.won ? 'win' : ''}">
          <div class="brain-log-meta">Match #${item.match} · ${item.won ? 'WIN #1' : `Rank #${item.rank}`} · ${item.kills} Kills · ${item.acc}% Acc</div>
          <div>${escapeHtml(item.summary)}</div>
        </li>
      `).join('');
    }

    brainJsonView.textContent = Object.keys(rec.data).length > 0
      ? jsonStr
      : '{\n  // Empty brain (Gen 1) — will populate automatically during & after matches\n}';
  }

  function refreshMindViews(cfg) {
    mindAlgorithmView.textContent =
      cfg.codeAlgorithm ||
      'No algorithm explanation found in this bot code yet. Ask the AI to include an `algorithm: "..."` field in `const BOT = { ... };`.';
    mindThoughtsView.textContent =
      cfg.codeThoughts ||
      'No design thoughts found in this bot code yet. Ask the AI to include a `thoughts: "..."` field explaining why it designed this strategy.';
  }

  function openCodeModal(slotIdx, initialTab = 'code', readOnly = false) {
    editingCodeSlotIdx = slotIdx;
    codeModalReadOnly = readOnly;
    const slot = BOT_SLOTS[slotIdx];
    const cfg = botConfigs[slotIdx];

    codeModalDot.style.background = slot.color;
    codeModalTitle.textContent = `${cfg.name} (${slot.slotLabel})`;
    codeModalAuthor.textContent = cfg.codeAuthor || 'Custom AI';
    botCodeTextarea.value = cfg.codeSource || '';
    botCodeTextarea.readOnly = readOnly;
    codeEditorTools.classList.toggle('hidden', readOnly);
    btnSaveCode.classList.toggle('hidden', readOnly);
    codeModalSub.innerHTML = readOnly
      ? 'Inspecting this AI robot\'s code, working algorithm explanation, and design thoughts.'
      : 'Paste the AI\'s generated <code>const BOT = { name, author, algorithm, thoughts, think(state) }</code> block below and click <strong>Save &amp; Validate</strong>.';

    refreshMindViews(cfg);
    refreshBrainViews(slotIdx);
    codeValidationStatus.textContent = cfg.codeValid
      ? (readOnly ? 'Read-only inspection view' : 'Validated ✓ — ready for battle')
      : `Error: ${cfg.codeError || 'Needs valid code'}`;
    codeValidationStatus.className = `modal-status ${cfg.codeValid ? 'ok' : 'err'}`;

    setCodeModalTab(initialTab);
    codeModal.classList.remove('hidden');
  }

  function closeCodeModal() {
    codeModal.classList.add('hidden');
  }

  // Populate Sample Bot Dropdown
  SAMPLE_CODE_BOTS.forEach(sb => {
    const opt = document.createElement('option');
    opt.value = sb.id;
    opt.textContent = sb.label;
    sampleBotSelect.appendChild(opt);
  });

  // Rules Studio listeners
  btnToggleRules.addEventListener('click', () => {
    const open = rulesEditorBody.classList.toggle('hidden') === false;
    btnToggleRules.textContent = open ? 'Hide Rules' : 'Customize Rules';
  });

  [ruleAiAmmo, rulePlayerAmmo, ruleReload, ruleHp, rulePlayerHp, ruleDamage, ruleBspeed, ruleRange, ruleBounces, ruleFog, ruleSeed].forEach(el => {
    el.addEventListener('change', () => {
      syncRulesFromInputs();
      renderSetupCards();
    });
  });

  btnResetRules.addEventListener('click', () => {
    arenaRules = { ...DEFAULT_RULES };
    populateRulesInputs();
    syncRulesFromInputs();
    renderSetupCards();
  });

  btnViewPrompt.addEventListener('click', openPromptModal);
  btnClosePrompt.addEventListener('click', closePromptModal);
  btnClosePrompt2.addEventListener('click', closePromptModal);
  promptModal.addEventListener('click', e => {
    if (e.target === promptModal) closePromptModal();
  });

  btnCopyPrompt.addEventListener('click', () => {
    syncRulesFromInputs();
    copyTextToClipboard(generateAIPrompt()).then(() => {
      const orig = btnCopyPrompt.innerHTML;
      btnCopyPrompt.textContent = 'Copied Prompt! ✓';
      setTimeout(() => { btnCopyPrompt.innerHTML = orig; }, 1800);
    });
  });

  btnModalCopyPrompt.addEventListener('click', () => {
    copyTextToClipboard(promptPreviewText.value).then(() => {
      promptCopyStatus.textContent = 'Copied to clipboard! Paste into any AI chat ✓';
      promptCopyStatus.className = 'modal-status ok';
    });
  });

  // Quick Code Arena Setup Button (loads AI-model named coded bots including Self-Learning RL EvoBots!)
  btnQuickCode.addEventListener('click', () => {
    SoundEngine.unlock();
    activeBotCount = Math.max(activeBotCount, 4);
    const defaultModels = ['Gemini', 'Claude', 'ChatGPT', 'DeepSeek'];
    const rlSample = SAMPLE_CODE_BOTS.find(s => s.id === 'rl_evobot') || SAMPLE_CODE_BOTS[0];
    const order = [rlSample, SAMPLE_CODE_BOTS[1] || rlSample, SAMPLE_CODE_BOTS[2] || rlSample, rlSample];
    for (let i = 0; i < activeBotCount; i++) {
      const sample = order[i % order.length];
      const modelName = defaultModels[i % defaultModels.length];
      const cfg = botConfigs[i];
      cfg.role = 'code';
      cfg.name = modelName;
      cfg.codeAuthor = sample.id === 'rl_evobot' ? `${modelName} (Self-Learning RL)` : `${modelName} (Sample)`;
      cfg.codeSource = sample.source
        .replace(/name:\s*"[^"]*"/, `name: "${modelName}"`)
        .replace(/author:\s*"[^"]*"/, `author: "${cfg.codeAuthor}"`);
      const mAlg = sample.source.match(/algorithm:\s*"((?:[^"\\]|\\.)*)"/);
      const mTh = sample.source.match(/thoughts:\s*"((?:[^"\\]|\\.)*)"/);
      if (mAlg) cfg.codeAlgorithm = mAlg[1].replace(/\\n/g, '\n');
      if (mTh) cfg.codeThoughts = mTh[1].replace(/\\n/g, '\n');
      cfg.codeValid = true;
      cfg.codeError = '';
    }
    renderSetupCards();
  });

  // ==================== POST-MATCH ANALYSIS & AI COACHING FEEDBACK ====================
  function analyzeBotPerformance(bot, ranked) {
    const rank = ranked.findIndex(b => b.id === bot.id) + 1;
    const accuracy = bot.shotsFired > 0 ? Math.round((bot.shotsHit / bot.shotsFired) * 100) : 0;
    const survival = Math.max(0.1, bot.survivalTime);
    const avgSpeed = Math.round(bot.distanceTraveled / survival);
    const stuckPct = Math.round((bot.timeStuck / survival) * 100);
    const emptyPct = Math.round((bot.timeEmptyAmmo / survival) * 100);
    const losPct = Math.round((bot.timeInLOS / survival) * 100);
    const avgThinkMs = bot.thinkTicks > 0 ? (bot.thinkTotalMs / bot.thinkTicks) : 0;

    const insights = [];

    if (bot.codeError) {
      insights.push({
        good: false,
        text: `CRITICAL RUNTIME ERROR: "${bot.codeError}" halted your bot mid-match. Fix this exception/timeout first and guard against empty arrays or NaN values.`
      });
    }

    if (rank === 1 && bot.alive) {
      insights.push({
        good: true,
        text: `Won the match with ${bot.hp}/${bot.maxHp} HP remaining and ${bot.kills} kill${bot.kills === 1 ? '' : 's'}!`
      });
    } else if (bot.deathDetails) {
      insights.push({
        good: false,
        text: `Eliminated (#${rank} of ${ranked.length}) by ${bot.deathDetails}.`
      });
    }

    if (bot.shotsFired === 0) {
      insights.push({
        good: false,
        text: `Fired 0 shots all match — verify your fixed-forward chassis alignment check (|angleError| <= tolerance) and ensure \`fire: true\` is actually being returned.`
      });
    } else if (accuracy < 30 && bot.shotsFired >= 4) {
      insights.push({
        good: false,
        text: `Low shot accuracy (${accuracy}% — ${bot.shotsHit}/${bot.shotsFired} hits; ${bot.shotsMissedRange} expired at max range, ${bot.shotsMissedWall} died on walls). Tighten turning alignment before firing, add enemy velocity lead prediction, and avoid long low-probability shots.`
      });
    } else if (accuracy >= 50 && bot.shotsFired >= 3) {
      insights.push({
        good: true,
        text: `Strong shooting discipline (${accuracy}% accuracy across ${bot.shotsFired} shots, dealing ${bot.damageDealt} total damage).`
      });
    }

    if (bot.timeEmptyAmmo >= 4.0 || emptyPct >= 18) {
      insights.push({
        good: false,
        text: `Spent ${bot.timeEmptyAmmo.toFixed(1)}s (${emptyPct}% of survival) completely out of ammo (0/${bot.maxAmmo}). Conserve your last bullet for high-confidence kills and retreat behind wall cover while recharging (${RELOAD_PER_BULLET}s/bullet).`
      });
    }

    if (bot.timeStuck >= 4.5 || stuckPct >= 26) {
      insights.push({
        good: false,
        text: `Stalled/slow for ${bot.timeStuck.toFixed(1)}s (${stuckPct}% of match, ${bot.wallBumps} wall bumps, avg speed ${avgSpeed} px/s). Improve waypoint advancement with \`state.maze.findPath()\` and add a LiDAR anti-stuck maneuver when blocked.`
      });
    } else if (bot.wallBumps >= 10) {
      insights.push({
        good: false,
        text: `Bumped walls ${bot.wallBumps} times — blend front/side LiDAR rays to steer smoothly through 60px corridors without scraping corners.`
      });
    }

    if (bot.bankHitsTaken >= 2) {
      insights.push({
        good: false,
        text: `Hit ${bot.bankHitsTaken} times by ricochet bank shots — avoid camping stationary in predictable corners or narrow straight alleys when enemies are nearby.`
      });
    }

    if (bot.directHitsTaken >= 3 && bot.closeDodges < 3) {
      insights.push({
        good: false,
        text: `Took ${bot.directHitsTaken} direct hits with only ${bot.closeDodges} close dodges (exposed in enemy LOS ${losPct}% of survival). Add proactive perpendicular bullet dodging using \`state.bullets\` and break sightlines when reloading.`
      });
    } else if (bot.closeDodges >= 5) {
      insights.push({
        good: true,
        text: `Impressive evasion — narrowly dodged ${bot.closeDodges} incoming bullets!`
      });
    }

    if (bot.bankHits > 0) {
      insights.push({
        good: true,
        text: `Landed ${bot.bankHits} ricochet bank hit${bot.bankHits === 1 ? '' : 's'}${bot.pillarHits > 0 ? ` (including ${bot.pillarHits} supercharged pillar boost hit${bot.pillarHits === 1 ? '' : 's'}!)` : ''}.`
      });
    } else if (BULLET_MAX_BOUNCES > 0) {
      insights.push({
        good: false,
        text: `Landed 0 ricochet/pillar bank hits — use \`state.maze.traceShot(mx, my, angle, range, bounces)\` + \`state.maze.segmentCircleHit()\` to bounce off Special Wall Tiles (\`state.maze.getSpecialTiles()\`: Range \`+R\`, Speed \`»\`, 3-Way Spread \`3×\`) or pillars (\`getPillars()\`).`
      });
    }

    if (bot.regenUses === 0 && bot.damageTaken >= 25) {
      insights.push({
        good: false,
        text: `Never used Regen despite taking ${bot.damageTaken} damage — return \`regen: true\` when injured with \`ammo >= 3\` & \`me.regenCooldown <= 0\` behind cover to heal 10% of current HP (10s CD).`
      });
    } else if (bot.regenUses > 0) {
      insights.push({
        good: true,
        text: `Used Regen ${bot.regenUses} time${bot.regenUses === 1 ? '' : 's'} to recover +${bot.hpRegened} HP!`
      });
    }

    if (bot.powerupsCollected === 0 && matchTime >= 8) {
      insights.push({
        good: false,
        text: `Collected 0 power-ups all match — monitor \`state.powerups\` and detour via \`state.maze.findPath()\` to grab game-changing drops (\`laser\`, \`reflect_shield\`, \`shield\`, \`speed\`, \`ultra_ricochet\`, \`penetrate\`, \`piercing\`, \`trap\`).`
      });
    } else if (bot.powerupsCollected >= 2) {
      insights.push({
        good: true,
        text: `Great map control — secured ${bot.powerupsCollected} arena power-ups during the match!`
      });
    }

    if (bot.isCode && bot.thinkMaxMs > 12) {
      insights.push({
        good: false,
        text: `Slow tick spike detected (max ${bot.thinkMaxMs.toFixed(1)}ms, avg ${avgThinkMs.toFixed(2)}ms) — cache \`findPath()\` every 0.4s and limit ray sweeps so ticks stay under 2ms.`
      });
    }

    return { rank, accuracy, avgSpeed, stuckPct, emptyPct, losPct, avgThinkMs, insights };
  }

  function generatePostMatchFeedbackPrompt(bot, ranked) {
    const a = analyzeBotPerformance(bot, ranked);
    const standingsText = ranked.map((b, i) => {
      const bAcc = b.shotsFired > 0 ? Math.round((b.shotsHit / b.shotsFired) * 100) : 0;
      const status = b.alive ? `ALIVE (${b.hp} HP)` : `OUT at ${formatTime(b.survivalTime)}`;
      return `  #${i + 1} ${b.name} (${b.isCode ? b.codeAuthor : b.presetName}) — ${status} | Kills: ${b.kills} | Dmg: ${b.damageDealt} | Acc: ${bAcc}% (${b.shotsHit}/${b.shotsFired}) | Banks: ${b.bankHits}`;
    }).join('\n');

    const damageSources = Object.entries(bot.damageBySource || {})
      .sort((x, y) => y[1] - x[1])
      .map(([who, dmg]) => `${who}: -${dmg} HP`)
      .join(', ') || 'None';

    const timelineText = matchTimeline.length
      ? matchTimeline.slice(-14).map(ev => `  [${ev.time}] ${ev.text}`).join('\n')
      : '  (No major combat events logged)';

    const diagText = a.insights
      .map(item => `  ${item.good ? '[+]' : '[!]'} ${item.text}`)
      .join('\n');

    return `POST-MATCH BATTLE ANALYSIS FOR: **${bot.name}**
================================================================
1. MATCH SUMMARY
================================================================
- Arena Theme: ${currentTheme ? currentTheme.name : 'Standard'} | Duration: ${formatTime(matchTime)}
- Rules: ${arenaRules.aiAmmo} bullets (AI/Code), ${arenaRules.reloadPerBullet}s/bullet reload, ${arenaRules.maxHp} HP (AI) / ${arenaRules.playerHp} HP (Player), ${arenaRules.bulletDamage} dmg, ${arenaRules.bulletSpeed} px/s bullets, ${arenaRules.maxRange}px range, ${arenaRules.maxBounces} max bounces, Fog of War: ${arenaRules.fogOfWar ? 'ON' : 'OFF'}
- Final Standings:
${standingsText}

================================================================
2. YOUR PERFORMANCE TELEMETRY (${bot.name})
================================================================
- Final Rank: #${a.rank} of ${ranked.length} (${bot.alive ? `SURVIVED with ${bot.hp}/${bot.maxHp} HP` : `ELIMINATED — ${bot.deathDetails}`})
- Combat: ${bot.kills} kills | ${bot.damageDealt} damage dealt | ${bot.damageTaken} damage taken (by: ${damageSources})
- Shooting: ${bot.shotsHit}/${bot.shotsFired} hits (${a.accuracy}% accuracy) | Missed (range expired): ${bot.shotsMissedRange} | Missed (max bounces): ${bot.shotsMissedWall}
- Ricochets, Power-Ups & Regen: ${bot.bankHits} bank hits landed | ${bot.pillarBoostShots} pillar-boosted shots (${bot.pillarHits} hit) | Power-Ups collected: ${bot.powerupsCollected} | Regen used: ${bot.regenUses}x (+${bot.hpRegened} HP)
- Defense: ${bot.directHitsTaken} direct hits taken | ${bot.bankHitsTaken} bank hits taken | ${bot.closeDodges} close-call dodges | Exposed in enemy LOS: ${bot.timeInLOS.toFixed(1)}s (${a.losPct}%)
- Mobility & Ammo: ${Math.round(bot.distanceTraveled)}px traveled (avg ${a.avgSpeed} px/s) | Stalled/stuck: ${bot.timeStuck.toFixed(1)}s (${a.stuckPct}%) | Wall bumps: ${bot.wallBumps} | Empty (0 ammo): ${bot.timeEmptyAmmo.toFixed(1)}s (${a.emptyPct}%)${bot.isCode ? `\n- Code Runtime: avg ${a.avgThinkMs.toFixed(2)}ms/tick, max ${bot.thinkMaxMs.toFixed(2)}ms/tick${bot.codeError ? ` | ERROR: ${bot.codeError}` : ' (no errors)'}` : ''}

================================================================
3. KEY BATTLE TIMELINE
================================================================
${timelineText}

================================================================
4. AUTOMATED COACHING DIAGNOSIS (WHAT WENT ON & HOW TO IMPROVE)
================================================================
${diagText}

================================================================
5. YOUR TASK — UPGRADE YOUR ROBOT FOR THE REMATCH
================================================================
Based on this exact match telemetry and diagnosis:
1. Briefly analyze why you won or lost and what specific flaw(s) hurt you most.
2. Output an improved, self-contained \`const BOT = { name, author, algorithm, thoughts, think(state) { ... } };\` block:
   - Keep \`name\` set to your AI model name (\`Gemini\`, \`Grok\`, \`ChatGPT\`, \`Claude\`, or \`DeepSeek\`).
   - Update \`algorithm\` to clearly explain your upgraded v2 working algorithm.
   - Update \`thoughts\` to explain what you learned from this match and why you made these changes.
   - Remember: FIXED-FORWARD CANNON (no independent turret aim), ${arenaRules.aiAmmo} bullets, ${arenaRules.reloadPerBullet}s/bullet reload, and pillar bounces give +15% dmg & +8% speed!`;
  }

  function renderAnalysisModal(botId) {
    const ranked = lastRankedBots.length ? lastRankedBots : bots;
    if (!ranked.length) return;
    const bot = ranked.find(b => b.id === botId) || ranked[0];
    selectedAnalysisBotId = bot.id;

    // Bot selector tabs
    analysisBotTabs.innerHTML = ranked.map((b, i) => `
      <button type="button" class="analysis-bot-pill ${b.id === bot.id ? 'active' : ''}" data-aid="${b.id}" style="--pill-color: ${b.color};">
        <span class="podium-dot" style="background: ${b.color};"></span>
        <span>#${i + 1} ${escapeHtml(b.name)}</span>
      </button>
    `).join('');

    analysisBotTabs.querySelectorAll('.analysis-bot-pill').forEach(btn => {
      btn.addEventListener('click', () => renderAnalysisModal(Number(btn.dataset.aid)));
    });

    const a = analyzeBotPerformance(bot, ranked);

    // Telemetry metric cards
    const tiles = [
      { label: 'Rank & Status', val: `#${a.rank} / ${ranked.length}`, sub: bot.alive ? `${bot.hp} HP left` : `Out @ ${formatTime(bot.survivalTime)}` },
      { label: 'Accuracy', val: `${a.accuracy}%`, sub: `${bot.shotsHit}/${bot.shotsFired} hits · ${bot.bankHits} banks` },
      { label: 'Damage Ratio', val: `${bot.damageDealt} / ${bot.damageTaken}`, sub: `Dealt vs Taken (${bot.kills} kills)` },
      { label: 'Ammo Empty', val: `${bot.timeEmptyAmmo.toFixed(1)}s`, sub: `${a.emptyPct}% at 0/${bot.maxAmmo} bullets` },
      { label: 'Stalled / Stuck', val: `${bot.timeStuck.toFixed(1)}s`, sub: `${a.stuckPct}% · ${bot.wallBumps} wall bumps` },
      { label: 'Defense / Dodges', val: `${bot.closeDodges}`, sub: `${bot.directHitsTaken} direct · ${bot.bankHitsTaken} bank hits` },
      { label: 'Pillar Boosts', val: `${bot.pillarBoostShots}`, sub: `${bot.pillarHits} boosted hits landed` },
      { label: 'Avg Speed / LOS', val: `${a.avgSpeed} px/s`, sub: `In enemy LOS ${a.losPct}%` }
    ];

    analysisMetricsGrid.innerHTML = tiles.map(t => `
      <div class="metric-tile">
        <span class="metric-label">${t.label}</span>
        <strong class="metric-val">${t.val}</strong>
        <span class="metric-sub">${t.sub}</span>
      </div>
    `).join('');

    analysisInsightsList.innerHTML = a.insights.map(item =>
      `<li class="${item.good ? 'good' : ''}">${escapeHtml(item.text)}</li>`
    ).join('');

    analysisPromptHeading.textContent = `Copy & Send Back to ${bot.name} for v2 Upgrade`;
    analysisFeedbackText.value = generatePostMatchFeedbackPrompt(bot, ranked);
    btnCopyAnalysis.textContent = `Copy Feedback for ${bot.name}`;
    analysisCopyStatus.textContent = `Ready to paste into ${bot.name}'s chat`;
    analysisCopyStatus.className = 'modal-status';
  }

  function openAnalysisModal(botId = null) {
    const ranked = lastRankedBots.length ? lastRankedBots : bots;
    if (!ranked.length) return;
    const initialId = botId !== null ? botId : ranked[0].id;
    renderAnalysisModal(initialId);
    analysisModal.classList.remove('hidden');
  }

  function closeAnalysisModal() {
    analysisModal.classList.add('hidden');
  }

  btnOpenAnalysis.addEventListener('click', () => openAnalysisModal());
  btnCloseAnalysis.addEventListener('click', closeAnalysisModal);
  btnCloseAnalysis2.addEventListener('click', closeAnalysisModal);
  analysisModal.addEventListener('click', e => {
    if (e.target === analysisModal) closeAnalysisModal();
  });

  btnCopyAnalysis.addEventListener('click', () => {
    copyTextToClipboard(analysisFeedbackText.value).then(() => {
      const bot = bots.find(b => b.id === selectedAnalysisBotId);
      analysisCopyStatus.textContent = `Copied coaching report for ${bot ? bot.name : 'AI'}! ✓`;
      analysisCopyStatus.className = 'modal-status ok';
    });
  });

  // Code Modal listeners
  tabBtnCode.addEventListener('click', () => setCodeModalTab('code'));
  tabBtnMind.addEventListener('click', () => setCodeModalTab('mind'));
  tabBtnBrain.addEventListener('click', () => setCodeModalTab('brain'));
  btnResetBrain.addEventListener('click', () => {
    const slot = BOT_SLOTS[editingCodeSlotIdx];
    const cfg = botConfigs[editingCodeSlotIdx];
    if (!slot || !cfg) return;
    resetBotBrainRecord(slot.id, cfg.name);
    refreshBrainViews(editingCodeSlotIdx);
    renderSetupCards();
    pushFeed(`${cfg.name}'s self-learning brain was reset to Gen #1.`, '#64748b');
  });
  btnCloseCode.addEventListener('click', closeCodeModal);
  btnCancelCode.addEventListener('click', closeCodeModal);
  codeModal.addEventListener('click', e => {
    if (e.target === codeModal) closeCodeModal();
  });

  sampleBotSelect.addEventListener('change', () => {
    const found = SAMPLE_CODE_BOTS.find(s => s.id === sampleBotSelect.value);
    if (!found) return;
    botCodeTextarea.value = found.source;
    codeValidationStatus.textContent = 'Example loaded — click Save & Validate Bot';
    codeValidationStatus.className = 'modal-status';
    sampleBotSelect.value = '';
  });

  inputUploadJs.addEventListener('change', () => {
    const file = inputUploadJs.files && inputUploadJs.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      botCodeTextarea.value = String(reader.result || '');
      codeValidationStatus.textContent = `Loaded ${file.name} — click Save & Validate Bot`;
      codeValidationStatus.className = 'modal-status';
    };
    reader.readAsText(file);
    inputUploadJs.value = '';
  });

  btnDownloadJs.addEventListener('click', () => {
    const cfg = botConfigs[editingCodeSlotIdx];
    const blob = new Blob([botCodeTextarea.value], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(cfg.name || 'robot').replace(/[^a-z0-9_-]/gi, '_').toLowerCase()}.js`;
    a.click();
    URL.revokeObjectURL(url);
  });

  btnSaveCode.addEventListener('click', async () => {
    if (codeModalReadOnly) return;
    syncRulesFromInputs();
    codeValidationStatus.textContent = 'Validating in sandbox...';
    codeValidationStatus.className = 'modal-status';

    const res = await validateBotCode(botCodeTextarea.value);
    const cfg = botConfigs[editingCodeSlotIdx];
    if (!res.ok) {
      cfg.codeValid = false;
      cfg.codeError = res.error;
      codeValidationStatus.textContent = `Error: ${res.error}`;
      codeValidationStatus.className = 'modal-status err';
      renderSetupCards();
      return;
    }

    cfg.codeSource = res.cleaned;
    cfg.codeValid = true;
    cfg.codeError = '';
    if (res.meta) {
      if (res.meta.name) cfg.name = res.meta.name;
      if (res.meta.author) cfg.codeAuthor = res.meta.author;
      cfg.codeAlgorithm = res.meta.algorithm || '';
      cfg.codeThoughts = res.meta.thoughts || '';
    }

    botCodeTextarea.value = res.cleaned;
    codeModalTitle.textContent = `${cfg.name} (${BOT_SLOTS[editingCodeSlotIdx].slotLabel})`;
    codeModalAuthor.textContent = cfg.codeAuthor || 'Custom AI';
    refreshMindViews(cfg);

    codeValidationStatus.textContent = `Validated ✓ (${res.elapsedMs.toFixed(2)}ms test tick) — Saved!`;
    codeValidationStatus.className = 'modal-status ok';
    renderSetupCards();
  });

  btnBackSetup.addEventListener('click', returnToSetup);
  btnVictorySetup.addEventListener('click', returnToSetup);
  btnRematchNew.addEventListener('click', () => { stopAutoTrain(false); startMatch(true); });
  btnRematchSame.addEventListener('click', () => { stopAutoTrain(false); startMatch(false); });
  if (btnAutoTrain) {
    btnAutoTrain.addEventListener('click', () => {
      SoundEngine.unlock();
      if (autoTrainRemaining > 0) stopAutoTrain(true);
      else startAutoTrain(5);
    });
  }
  if (btnVictoryAutoTrain) {
    btnVictoryAutoTrain.addEventListener('click', () => {
      SoundEngine.unlock();
      startAutoTrain(5);
    });
  }

  // Player Input Listeners (Optional Left-Click to fire forward in 1P; no mouse aiming)
  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    SoundEngine.unlock();
    mouseState.down = true;
  });

  window.addEventListener('mouseup', e => {
    if (e.button === 0) mouseState.down = false;
  });

  window.addEventListener('blur', () => {
    keysDown.clear();
    mouseState.down = false;
  });

  // Keyboard controls (P1: WASD + Space/F, P2: Arrows + Enter/Slash/RShift, P pause, L LiDAR, Esc closes modals)
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape') {
      if (!promptModal.classList.contains('hidden')) { closePromptModal(); return; }
      if (!codeModal.classList.contains('hidden')) { closeCodeModal(); return; }
      if (!analysisModal.classList.contains('hidden')) { closeAnalysisModal(); return; }
    }
    if (
      !promptModal.classList.contains('hidden') ||
      !codeModal.classList.contains('hidden') ||
      !analysisModal.classList.contains('hidden')
    ) return;
    if (screenMode !== 'arena') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    SoundEngine.unlock();

    if (
      e.code === 'KeyW' || e.code === 'KeyA' || e.code === 'KeyS' || e.code === 'KeyD' ||
      e.code === 'KeyF' || e.code === 'KeyE' || e.code === 'KeyQ' || e.code === 'Space' ||
      e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight' ||
      e.code === 'Enter' || e.code === 'Slash' || e.code === 'ShiftRight' ||
      e.code === 'Period' || e.code === 'Numpad0'
    ) {
      e.preventDefault();
      keysDown.add(e.code);
      return;
    }

    if (e.key.toLowerCase() === 'p') {
      btnPause.click();
    } else if (e.key.toLowerCase() === 'l') {
      btnLidar.click();
    }
  });

  window.addEventListener('keyup', e => {
    keysDown.delete(e.code);
  });

  // Expose light debugging hook for inspection if needed
  window.__MAZE_BOTS__ = {
    getState: () => ({
      screenMode,
      activeBotCount,
      rules: { ...arenaRules },
      theme: currentTheme ? currentTheme.name : null,
      matchTime,
      matchOver,
      matchSpeed,
      showLidar,
      bgmEnabled: SoundEngine.isBgmEnabled(),
      sfxEnabled: SoundEngine.isSfxEnabled(),
      stats: matchStats,
      bots: bots.map(b => ({
        id: b.id,
        role: b.role,
        isPlayer: b.isPlayer,
        isCode: b.isCode,
        name: b.name,
        preset: b.presetName,
        hp: b.hp,
        ammo: b.ammo,
        maxAmmo: b.maxAmmo,
        reloading: b.reloading,
        reloadTimer: b.reloadTimer,
        kills: b.kills,
        bankHits: b.bankHits,
        alive: b.alive,
        state: b.stateLabel,
        codeError: b.codeError
      })),
      activeBullets: bullets.length,
      activePowerups: powerups.map(p => p.type),
      activeTraps: traps.length
    }),
    getAIPrompt: generateAIPrompt
  };

  // ==================== INITIALIZE ====================
  populateRulesInputs();
  syncRulesFromInputs();
  renderSetupCards();
  requestAnimationFrame(loop);
})();
