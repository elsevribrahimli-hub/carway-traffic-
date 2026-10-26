// CARWAY TRAFFIC — SoundSystem: 100% synthesized WebAudio audio.
// SFX + road ambience + generative synthwave music loop. No audio assets.
// Independent Music / SFX volumes (persisted), master mute.

function loadVol(key, fallback) {
  try {
    const v = parseFloat(localStorage.getItem(key));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
  } catch (e) { return fallback; }
}
function saveVol(key, v) {
  try { localStorage.setItem(key, String(v)); } catch (e) {}
}

export class SoundSystem {
  constructor() {
    this.ctx = null;
    this.master = null;   // master gain (mute switch)
    this.sfxBus = null;   // sfx volume
    this.musicBus = null; // music volume
    this.muted = false;
    this.sfxVol = loadVol('carway_sfx_vol', 0.9);
    this.musicVol = loadVol('carway_mus_vol', 0.55);
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.roadSrc = null;
    this.roadGain = null;
    this.roadFilter = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.musicNextTime = 0;
  }

  // Must be called from a user-gesture handler at least once.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxVol;
      this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicVol * 0.5;
      this.musicBus.connect(this.master);
    } catch (e) {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  setSfxVolume(v) {
    this.sfxVol = Math.min(1, Math.max(0, v));
    saveVol('carway_sfx_vol', this.sfxVol);
    if (this.sfxBus && this.ctx) this.sfxBus.gain.setTargetAtTime(this.sfxVol, this.ctx.currentTime, 0.05);
  }

  setMusicVolume(v) {
    this.musicVol = Math.min(1, Math.max(0, v));
    saveVol('carway_mus_vol', this.musicVol);
    if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(this.musicVol * 0.5, this.ctx.currentTime, 0.05);
  }

  // ---------------- primitives ----------------
  _tone({ freq = 440, freqEnd = null, dur = 0.15, type = 'sine', vol = 0.2, delay = 0 }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  _noise({ dur = 0.3, vol = 0.3, lowpass = 1200, type = 'lowpass', delay = 0, sweepTo = null }) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(lowpass, t0);
    if (sweepTo !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + dur);
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.sfxBus);
    src.start(t0);
  }

  // ---------------- SFX ----------------
  click()  { this._tone({ freq: 700, freqEnd: 900, dur: 0.08, type: 'square', vol: 0.08 }); }
  lane() {
    this._tone({ freq: 320, freqEnd: 520, dur: 0.10, type: 'sine', vol: 0.10 });
    this._noise({ dur: 0.16, vol: 0.10, lowpass: 900, sweepTo: 3200, type: 'bandpass' }); // whoosh
  }
  jump()   { this._tone({ freq: 280, freqEnd: 900, dur: 0.22, type: 'sawtooth', vol: 0.10 }); }
  boost() {
    this._noise({ dur: 0.5, vol: 0.25, lowpass: 600, sweepTo: 5000, type: 'bandpass' });
    this._tone({ freq: 150, freqEnd: 900, dur: 0.45, type: 'sawtooth', vol: 0.12 });
  }
  land() {
    this._tone({ freq: 120, freqEnd: 45, dur: 0.16, type: 'sine', vol: 0.30 }); // thud
    this._noise({ dur: 0.10, vol: 0.12, lowpass: 500 });
  }
  nearMiss(){ this._tone({ freq: 1200, freqEnd: 2400, dur: 0.18, type: 'sine', vol: 0.14 }); }
  coin()   { this._tone({ freq: 988, dur: 0.09, type: 'square', vol: 0.08 });
             this._tone({ freq: 1319, dur: 0.18, type: 'square', vol: 0.08, delay: 0.08 }); }
  crash() {
    this._noise({ dur: 0.5, vol: 0.5, lowpass: 900 });
    this._noise({ dur: 0.25, vol: 0.3, lowpass: 4000, delay: 0.02 }); // glass/metal crunch
    this._tone({ freq: 160, freqEnd: 40, dur: 0.5, type: 'sawtooth', vol: 0.25 });
  }
  // Side-impact thump: brief bodywork bump for NON-FATAL side scrapes (the
  // full crash() sting stays reserved for run-ending impacts). Routed
  // through the sfx bus, so mute + SFX volume apply; silent headless.
  scrape() {
    this._noise({ dur: 0.12, vol: 0.30, lowpass: 700 }); // panel thud
    this._tone({ freq: 180, freqEnd: 70, dur: 0.16, type: 'sine', vol: 0.28 }); // low bump
  }
  pickup() {
    this._tone({ freq: 660, dur: 0.08, type: 'square', vol: 0.09 });
    this._tone({ freq: 990, dur: 0.14, type: 'square', vol: 0.09, delay: 0.07 });
  }
  // Brand-intro sting: subtle mechanical ignition — a soft servo rise, two
  // muted metal clunks, a low settle. Routed through the sfx bus, so mute +
  // SFX volume apply; silent until a tap unlocks audio (platform rule).
  introSweep() {
    this._tone({ freq: 110, freqEnd: 420, dur: 1.1, type: 'sawtooth', vol: 0.05 });
    this._noise({ dur: 0.9, vol: 0.06, lowpass: 500, sweepTo: 2600, type: 'bandpass' });
    this._noise({ dur: 0.07, vol: 0.16, lowpass: 900, delay: 0.55 }); // clunk 1
    this._noise({ dur: 0.07, vol: 0.13, lowpass: 700, delay: 0.8 });  // clunk 2
    this._tone({ freq: 140, freqEnd: 70, dur: 0.5, type: 'sine', vol: 0.16, delay: 0.9 }); // settle
  }
  shieldBreak() {
    this._noise({ dur: 0.3, vol: 0.35, lowpass: 5000, type: 'highpass' });
    this._tone({ freq: 900, freqEnd: 200, dur: 0.3, type: 'sawtooth', vol: 0.16 });
  }

  // Police siren: two-tone wail (osc + LFO), routed through the sfx bus so
  // mute + SFX volume apply. One instance max; stop on chase end/game over.
  startSiren() {
    this.unlock(); // safe no-op if already unlocked / headless
    if (!this.ctx || this.sirenOsc) return;
    try {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 750;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 0.7;
      const depth = this.ctx.createGain();
      depth.gain.value = 220;
      lfo.connect(depth).connect(osc.frequency);
      const g = this.ctx.createGain();
      g.gain.value = 0.05;
      osc.connect(g).connect(this.sfxBus);
      osc.start(); lfo.start();
      this.sirenOsc = osc; this.sirenLfo = lfo; this.sirenGain = g;
    } catch (e) { /* ignore */ }
  }
  stopSiren() {
    if (!this.sirenOsc || !this.ctx) { this.sirenOsc = null; return; }
    try {
      const o = this.sirenOsc, l = this.sirenLfo, g = this.sirenGain;
      g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.1);
      setTimeout(() => { try { o.stop(); l.stop(); } catch (e) {} }, 400);
    } catch (e) {}
    this.sirenOsc = null; this.sirenLfo = null; this.sirenGain = null;
  }

  // ---------------- engine + road ambience ----------------
  startEngine() {
    if (!this.ctx) return;
    this._startEngineOsc();
    this._startRoadLoop();
  }

  _startEngineOsc() {
    if (!this.ctx || this.engineOsc) return;
    try {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 60;
      // EV whine: second detuned osc for electric-motor feel
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineOsc2.type = 'sine';
      this.engineOsc2.frequency.value = 240;
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 400;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.045;
      this.engineOsc.connect(this.engineFilter);
      this.engineOsc2.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain).connect(this.sfxBus);
      this.engineOsc.start();
      this.engineOsc2.start();
    } catch (e) { /* ignore */ }
  }

  _startRoadLoop() {
    if (!this.ctx || this.roadSrc) return;
    try {
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.roadSrc = this.ctx.createBufferSource();
      this.roadSrc.buffer = buf;
      this.roadSrc.loop = true;
      this.roadFilter = this.ctx.createBiquadFilter();
      this.roadFilter.type = 'lowpass';
      this.roadFilter.frequency.value = 320;
      this.roadGain = this.ctx.createGain();
      this.roadGain.gain.value = 0.0;
      this.roadSrc.connect(this.roadFilter).connect(this.roadGain).connect(this.sfxBus);
      this.roadSrc.start();
    } catch (e) { /* ignore */ }
  }

  setEngineSpeed(speedNorm) {
    if (!this.ctx) return;
    const n = Math.min(1, Math.max(0, speedNorm));
    if (this.engineOsc) {
      this.engineOsc.frequency.setTargetAtTime(55 + n * 130, this.ctx.currentTime, 0.1);
      this.engineOsc2.frequency.setTargetAtTime(220 + n * 480, this.ctx.currentTime, 0.1);
      this.engineFilter.frequency.setTargetAtTime(300 + n * 900, this.ctx.currentTime, 0.1);
    }
    if (this.roadGain) {
      this.roadGain.gain.setTargetAtTime(0.02 + n * 0.10, this.ctx.currentTime, 0.2);
      this.roadFilter.frequency.setTargetAtTime(280 + n * 700, this.ctx.currentTime, 0.2);
    }
  }

  stopEngine() {
    if (this.engineOsc && this.ctx) {
      try {
        const o1 = this.engineOsc, o2 = this.engineOsc2, g = this.engineGain;
        g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.1);
        setTimeout(() => { try { o1.stop(); o2.stop(); } catch (e) {} }, 400);
      } catch (e) {}
    }
    this.engineOsc = null; this.engineOsc2 = null;
    this.engineGain = null; this.engineFilter = null;
    if (this.roadSrc && this.ctx) {
      try {
        const s = this.roadSrc, g = this.roadGain;
        g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.15);
        setTimeout(() => { try { s.stop(); } catch (e) {} }, 600);
      } catch (e) {}
    }
    this.roadSrc = null; this.roadGain = null; this.roadFilter = null;
  }

  // ---------------- generative music ----------------
  // 16-step synthwave-ish loop, scheduled with lookahead. Cheap: a few
  // short oscillators per step, all through the music bus.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.musicStep = 0;
    this.musicNextTime = this.ctx.currentTime + 0.1;
    this.musicTimer = setInterval(() => this._scheduleMusic(), 90);
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  _mtone({ freq, time, dur = 0.2, type = 'sawtooth', vol = 0.16, cutoff = 900 }) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(vol, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(filter).connect(gain).connect(this.musicBus);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  _mnoise({ time, dur = 0.05, vol = 0.10, highpass = 6000 }) {
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = highpass;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.musicBus);
    src.start(time);
  }

  _mkick(time) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.12);
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    osc.connect(gain).connect(this.musicBus);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  _scheduleMusic() {
    if (!this.ctx) return;
    const STEP = 60 / 126 / 2; // 126 bpm, 8th notes
    const BASS = [55, 0, 55, 55, 0, 65.41, 0, 55, 0, 49, 0, 49, 58.27, 0, 73.42, 0];
    const LEAD = [220, 0, 0, 261.63, 0, 0, 293.66, 0, 0, 329.63, 0, 0, 261.63, 0, 246.94, 0];
    while (this.musicNextTime < this.ctx.currentTime + 0.25) {
      const s = this.musicStep % 16;
      const t = this.musicNextTime;
      if (s % 4 === 0) this._mkick(t);                       // four-on-floor
      if (s % 2 === 0) this._mnoise({ time: t });            // hats
      if (BASS[s]) this._mtone({ freq: BASS[s], time: t, dur: 0.22, vol: 0.20, cutoff: 700 });
      if (LEAD[s]) this._mtone({ freq: LEAD[s], time: t, dur: 0.30, vol: 0.08, cutoff: 2400, type: 'square' });
      this.musicNextTime += STEP;
      this.musicStep++;
    }
  }
}
