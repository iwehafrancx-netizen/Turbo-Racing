// All game audio: engine/nitro samples + synthesized SFX + procedural music.

const MAJOR = { 0: 'M', 2: 'm', 3: 'M', 4: 'm', 5: 'M', 7: 'M', 8: 'M', 9: 'm', 10: 'M', 1: 'M' };
const MINOR = { 0: 'm', 1: 'M', 2: 'm', 3: 'M', 5: 'm', 7: 'm', 8: 'M', 9: 'm', 10: 'M' };
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.volume = 0.8;
    this.musicOn = true;
    this.muted = false;
    this.engines = new Map();
  }

  // Must be called from a user gesture.
  async unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 4;
      this.master.connect(this.comp).connect(c.destination);
      this.sfx = c.createGain(); this.sfx.connect(this.master);
      this.engineBus = c.createGain(); this.engineBus.connect(this.master);
      this.musicBus = c.createGain(); this.musicBus.gain.value = 0.32; this.musicBus.connect(this.master);
      this.musicFilter = c.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 20000;
      this.musicFilter.connect(this.musicBus);
      // echo for the arp
      this.delay = c.createDelay(1); this.delay.delayTime.value = 0.3;
      this.fb = c.createGain(); this.fb.gain.value = 0.32;
      this.delay.connect(this.fb).connect(this.delay);
      this.delay.connect(this.musicFilter);
      this.noise = this._noiseBuffer();
      this._applyVolume();
      await this._loadSamples();
    }
    if (this.ctx.state === 'suspended' && !this.muted) {
      try { await this.ctx.resume(); } catch { /* ignore */ }
    }
  }

  async _loadSamples() {
    const load = async (name, url) => {
      try {
        const res = await fetch(url);
        const arr = await res.arrayBuffer();
        this.buffers[name] = await this.ctx.decodeAudioData(arr);
      } catch (e) { console.warn('audio load failed', url, e); }
    };
    await Promise.all([load('engine', 'Assets/sounds/engine.mp3'), load('nitro', 'Assets/sounds/nitro.mp3')]);
  }

  _noiseBuffer() {
    const c = this.ctx, len = c.sampleRate * 1.5;
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  setVolume(v) { this.volume = v; this._applyVolume(); }
  setMusic(on) { this.musicOn = on; this._applyVolume(); }
  _applyVolume() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.musicOn ? 0.32 : 0, t, 0.1);
  }
  // Used for ads / tab hidden / platform mute.
  setMuted(m) {
    this.muted = m;
    if (!this.ctx) return;
    this._applyVolume();
    if (m) this.ctx.suspend().catch(() => {});
    else this.ctx.resume().catch(() => {});
  }

  // ---------- engine ----------
  engineStart(id, gain = 1) {
    if (!this.ctx || !this.buffers.engine || this.engines.has(id)) return;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.buffers.engine;
    src.loop = true;
    src.loopStart = 0.4;
    src.loopEnd = this.buffers.engine.duration - 0.4;
    const g = c.createGain(); g.gain.value = 0;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 4000;
    src.connect(f).connect(g).connect(this.engineBus);
    src.start(0, Math.random() * 3);
    // tyre screech loop
    const n = c.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 4;
    const ng = c.createGain(); ng.gain.value = 0;
    n.connect(bp).connect(ng).connect(this.sfx);
    n.start();
    this.engines.set(id, { src, g, f, n, ng, bp, base: gain, gear: 1 });
  }
  engineUpdate(id, speedFrac, throttle, boosting, skid, dist = 0) {
    const e = this.engines.get(id);
    if (!e || !Number.isFinite(speedFrac) || !Number.isFinite(throttle) || !Number.isFinite(dist)) return;
    const t = this.ctx.currentTime;
    // fake gearbox so the pitch climbs and drops like a real car
    const gears = [0, 0.16, 0.32, 0.5, 0.7, 0.88, 1.3];
    let g = 1;
    while (g < gears.length - 1 && speedFrac > gears[g]) g++;
    const lo = gears[g - 1], hi = gears[g];
    const rpm = 0.3 + 0.7 * Math.min(1, (speedFrac - lo) / (hi - lo));
    const pitch = 0.62 + rpm * 0.75 + (boosting ? 0.12 : 0) + g * 0.03;
    e.src.playbackRate.setTargetAtTime(pitch, t, 0.05);
    const att = 1 / (1 + dist * dist * 0.004);
    e.g.gain.setTargetAtTime((0.22 + throttle * 0.3 + (boosting ? 0.12 : 0)) * e.base * att, t, 0.08);
    e.f.frequency.setTargetAtTime(1500 + throttle * 4000, t, 0.1);
    e.ng.gain.setTargetAtTime(skid * 0.12 * e.base * att, t, 0.05);
    e.bp.frequency.setTargetAtTime(1400 + speedFrac * 900, t, 0.1);
  }
  engineStopAll() {
    for (const e of this.engines.values()) {
      try { e.src.stop(); e.n.stop(); } catch { /* already stopped */ }
    }
    this.engines.clear();
  }

  nitroStart() {
    if (!this.ctx || !this.buffers.nitro || this.nitroSrc) return;
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.buffers.nitro;
    const g = c.createGain(); g.gain.value = 0.75;
    s.connect(g).connect(this.sfx);
    s.start(0, 0.8);
    s.onended = () => { if (this.nitroSrc === s) this.nitroSrc = null; };
    this.nitroSrc = s; this.nitroGain = g;
  }
  nitroStop() {
    if (!this.nitroSrc) return;
    const t = this.ctx.currentTime;
    this.nitroGain.gain.setTargetAtTime(0, t, 0.12);
    const s = this.nitroSrc;
    setTimeout(() => { try { s.stop(); } catch { /* */ } }, 500);
    this.nitroSrc = null;
  }

  // ---------- synth SFX ----------
  _env(node, t, a, peak, d, end = 0.0001) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(end, t + a + d);
  }
  tone(freq, dur = 0.15, type = 'sine', vol = 0.3, slide = 0, delay = 0, dest = null) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = c.createGain();
    this._env(g, t, 0.005, vol, dur);
    o.connect(g).connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.05);
  }
  noiseHit(dur = 0.2, freq = 800, vol = 0.4, type = 'lowpass', delay = 0, dest = null) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain();
    this._env(g, t, 0.003, vol, dur);
    s.connect(f).connect(g).connect(dest || this.sfx);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  play(name, arg = 0) {
    if (!this.ctx) return;
    switch (name) {
      case 'click': this.tone(880, 0.06, 'square', 0.08); break;
      case 'hover': this.tone(1320, 0.03, 'sine', 0.04); break;
      case 'count': this.tone(440, 0.25, 'square', 0.18); break;
      case 'go': this.tone(880, 0.6, 'square', 0.2); this.tone(1320, 0.6, 'sine', 0.12); break;
      case 'coin': this.tone(1318, 0.08, 'square', 0.1); this.tone(1976, 0.18, 'square', 0.1, 0, 0.07); break;
      case 'boost': this.noiseHit(0.5, 600, 0.35, 'bandpass'); this.tone(200, 0.5, 'sawtooth', 0.12, 3); break;
      case 'miniturbo': this.tone(300 + arg * 150, 0.25, 'sawtooth', 0.15, 2.5); this.noiseHit(0.3, 2000, 0.2, 'highpass'); break;
      case 'tier': this.tone(600 + arg * 250, 0.12, 'triangle', 0.15); break;
      case 'wall': this.noiseHit(0.25, 500, Math.min(0.7, 0.15 + arg / 40)); this.tone(90, 0.2, 'square', 0.15, 0.5); break;
      case 'bump': this.noiseHit(0.15, 900, Math.min(0.5, 0.1 + arg / 40)); break;
      case 'land': this.noiseHit(0.3, 250, Math.min(0.6, 0.2 + arg / 30)); this.tone(70, 0.25, 'sine', 0.3, 0.6); break;
      case 'lap': [784, 988, 1175].forEach((f, i) => this.tone(f, 0.18, 'square', 0.12, 0, i * 0.09)); break;
      case 'finalLap': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.2, 'square', 0.12, 0, i * 0.1)); break;
      case 'overtake': this.tone(700, 0.08, 'triangle', 0.12); this.tone(1050, 0.12, 'triangle', 0.12, 0, 0.07); break;
      case 'win': [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.28, 'square', 0.13, 0, i * 0.12)); break;
      case 'lose': [392, 349, 330, 262].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.15, 0, i * 0.16)); break;
      case 'buy': [660, 880, 1320].forEach((f, i) => this.tone(f, 0.12, 'square', 0.12, 0, i * 0.06)); break;
      case 'error': this.tone(180, 0.2, 'square', 0.12); break;
      case 'whoosh': this.noiseHit(0.4, 1200, 0.25, 'bandpass'); break;
      case 'thunder': this.noiseHit(2.2, 160, 0.7, 'lowpass', 0.25); this.noiseHit(0.4, 900, 0.3, 'lowpass', 0.2); break;
      case 'fall': this.tone(600, 0.9, 'sawtooth', 0.12, 0.15); break;
      case 'star': this.tone(1568, 0.25, 'triangle', 0.18); this.tone(2093, 0.35, 'sine', 0.12, 0, 0.08); break;
    }
  }

  // ---------- procedural music ----------
  musicStart(cfg, intensity = 1) {
    if (!this.ctx) return;
    this.musicStop();
    this.music = { cfg, step: 0, next: this.ctx.currentTime + 0.1, intensity };
    const quality = cfg.mood === 'bright' ? MAJOR : MINOR;
    this.music.chords = cfg.prog.map((o) => {
      const q = quality[o] || 'm';
      return [o, o + (q === 'M' ? 4 : 3), o + 7];
    });
    this.musicTimer = setInterval(() => this._schedule(), 30);
  }
  musicStop() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.music = null;
  }
  setMusicIntensity(v) {
    if (!this.music || !this.ctx) return;
    this.music.intensity = v;
    this.musicFilter.frequency.setTargetAtTime(v < 1 ? 1400 : 20000, this.ctx.currentTime, 0.4);
  }
  _schedule() {
    const m = this.music;
    if (!m || !this.ctx) return;
    const spb = 60 / m.cfg.bpm / 4; // 16th note
    while (m.next < this.ctx.currentTime + 0.15) {
      this._playStep(m, m.step, m.next, spb);
      m.step++;
      m.next += spb;
    }
  }
  _playStep(m, step, t, spb) {
    const c = this.ctx, out = this.musicFilter;
    const s = step % 16, bar = Math.floor(step / 16) % 4;
    const chord = m.chords[bar % m.chords.length];
    const root = m.cfg.root;
    const mood = m.cfg.mood;
    const hi = m.intensity >= 1.5;
    // drums
    if (s % 4 === 0) {
      const o = c.createOscillator(); const g = c.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.3);
    }
    if (s === 4 || s === 12) this._drumNoise(t, 0.16, 1800, 0.35, 'bandpass', out);
    if (s % 2 === 1 || hi) this._drumNoise(t, s % 4 === 2 ? 0.09 : 0.03, 8000, s % 4 === 2 ? 0.16 : 0.07, 'highpass', out);
    if (mood === 'tribal' && (s === 3 || s === 7 || s === 14)) {
      const o = c.createOscillator(); const g = c.createGain();
      o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.15);
      g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.25);
    }
    // bass
    const bassPat = mood === 'funk' ? [0, 3, 6, 8, 10, 14] : mood === 'dark' ? [0, 2, 3, 6, 8, 10, 11, 14] : [0, 2, 4, 6, 8, 10, 12, 14];
    if (bassPat.includes(s)) {
      const n = root - 24 + chord[0] + (s % 4 === 2 && mood !== 'dark' ? 12 : 0);
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6;
      f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(180, t + spb * 1.8);
      const g = c.createGain(); g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + spb * 1.9);
      o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + spb * 2);
    }
    // arp
    const arpOn = mood === 'epic' || hi ? true : s % 2 === 0;
    if (arpOn && m.intensity > 0.5) {
      const seq = [0, 1, 2, 1, 2, 0, 1, 2];
      const k = seq[s % 8];
      const oct = (Math.floor(s / 8) % 2) * 12;
      const n = root + chord[k] + oct;
      const o = c.createOscillator(); o.type = mood === 'dreamy' ? 'sine' : mood === 'epic' ? 'sawtooth' : 'square';
      o.frequency.value = mtof(n);
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2600;
      const g = c.createGain(); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + spb * 1.5);
      o.connect(f).connect(g); g.connect(out); g.connect(this.delay);
      o.start(t); o.stop(t + spb * 1.6);
    }
    // pad on bar start
    if (s === 0) {
      for (const iv of chord) {
        for (const det of [-6, 6]) {
          const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(root - 12 + iv); o.detune.value = det;
          const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
          const g = c.createGain();
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.025, t + 0.4);
          g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 16);
          o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + spb * 16 + 0.05);
        }
      }
    }
  }
  _drumNoise(t, dur, freq, vol, type, out) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(out); s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
}
