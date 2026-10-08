import * as THREE from 'three';
import { createPlatform } from './platform/platform.js';
import { Save } from './core/save.js';
import { AudioSystem } from './core/audio.js';
import { Input } from './core/input.js';
import { CARS } from './data/cars.js';
import { TRACKS } from './data/tracks.js';
import { loadCarModels } from './game/car.js';
import { Race } from './game/race.js';
import { UI } from './ui/ui.js';
import { Showroom } from './ui/showroom.js';

const MENU_MUSIC = { bpm: 104, root: 57, prog: [0, 8, 3, 10], mood: 'dreamy' };
const $ = (id) => document.getElementById(id);

class Game {
  async boot() {
    this.platform = await createPlatform();
    this.platform.loadingStart();
    this.save = new Save(this.platform);
    const st = this.save.data.settings;
    this.audio = new AudioSystem();
    this.audio.volume = st.volume;
    this.audio.musicOn = st.music;
    this.input = new Input();
    this.isMobile = this.platform.isMobile;
    if (this.isMobile) {
      document.body.classList.add('mobile');
      this.input.autoGas = true;
      this.input.bindTouch($('touch'));
    }

    const canvas = $('gl');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.isMobile, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 6000);
    this.applyQuality(false);

    this.ui = new UI(this);
    this.ui.setLoading(0.08, 'Loading cars…');
    this.models = await loadCarModels(CARS, (p) => this.ui.setLoading(0.1 + p * 0.8));
    this.ui.setLoading(0.95, 'Climbing above the clouds…');
    this.showroom = new Showroom(this.renderer, this.models);
    this.showroom.setCar(this.save.data.car);
    this._resize();
    window.addEventListener('resize', () => this._resize());

    this.platform.onMute((m) => { this.platformMute = m; this.audio.setMuted(m || document.hidden); });
    this.platform.onPause((p) => {
      this.adPlaying = p;
      this.audio.setMuted(p || this.platformMute || false);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.race && this.race.state === 'racing' && !this.race.paused) this.pauseRace();
      this.audio.setMuted(document.hidden || this.platformMute || this.adPlaying || false);
    });
    const unlock = () => {
      this.audio.unlock().then(() => {
        if (!this.race && !this.audio.music) this.audio.musicStart(MENU_MUSIC, 0.7);
      });
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    this.ui.setLoading(1, 'Ready!');
    this.platform.loadingStop();
    this.ui.nav('title');
    const daily = this.save.claimDaily();
    if (daily && this.save.data.stats.races > 0) this.ui.showDaily(daily);

    this.last = performance.now();
    this.time = 0;
    this.fps = { acc: 0, frames: 0, low: 0 };
    this.renderer.setAnimationLoop((t) => this._frame(t));
  }

  // ---------- quality ----------
  get resolvedQuality() {
    const q = this.save.data.settings.quality;
    if (q !== 'auto') return q;
    return this.isMobile ? 'low' : 'high';
  }
  applyQuality(resize = true) {
    this.quality = this.resolvedQuality;
    const dpr = window.devicePixelRatio || 1;
    this.basePR = { low: Math.min(dpr, 1), medium: Math.min(dpr, 1.25), high: Math.min(dpr, 1.75) }[this.quality];
    this.pixelRatio = this.basePR;
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    if (resize) {
      this._resize();
      if (this.race) this.ui.toast('Graphics change applies fully from the next race.');
    }
  }
  _resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.showroom?.resize(w, h);
    this.race?.fx.setScale(this.renderer.domElement.height);
  }

  // Lower the render resolution on slow devices (auto quality only).
  _adapt(dt) {
    const f = this.fps;
    f.acc += dt; f.frames++;
    if (f.acc < 2) return;
    const fps = f.frames / f.acc;
    f.acc = 0; f.frames = 0;
    if (this.save.data.settings.quality !== 'auto' || !this.race) return;
    if (fps < 42 && this.pixelRatio > 0.7) {
      f.low++;
      if (f.low >= 2) { this.pixelRatio = Math.max(0.7, this.pixelRatio - 0.2); this._resize(); f.low = 0; }
    } else f.low = 0;
  }

  // ---------- main loop ----------
  _frame(t) {
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (dt > 0.1) dt = 0.1;
    if (this.adPlaying) return;
    this.time += dt;
    if (this.race?.paused) {
      if (this.input.actions().pause) this.resumeRace();
    }
    if (this.race) {
      this.race.update(dt);
      this.race.render(this.renderer);
      this._adapt(dt);
    } else {
      this.input.actions();
      this.showroom.update(dt, this.time);
      this.showroom.render(this.renderer);
    }
  }

  onScreen() {
    if (!this.race && this.audio.ctx && !this.audio.music) this.audio.musicStart(MENU_MUSIC, 0.7);
  }

  // ---------- race lifecycle ----------
  startRace(idx) {
    if (!this.save.data.tutorialDone) {
      this.pendingRace = idx;
      this.ui.modal('howto', true);
      return;
    }
    this.ui.hideScreens();
    $('loading').classList.add('show');
    this.ui.setLoading(0.5, `Building ${TRACKS[idx].name}…`);
    this.platform.loadingStart();
    setTimeout(() => {
      this._disposeRace();
      this.camera.fov = 62;
      this.race = new Race(this, idx);
      this.ui.setLoading(1);
      $('loading').classList.remove('show');
      this.platform.loadingStop();
      this.ui.hud.setup(this.race, this.isMobile);
      this.ui.hud.show(true);
      $('touch').classList.toggle('hidden', !this.isMobile);
      this.pixelRatio = this.basePR;
      this._resize();
      this.audio.unlock().then(() => this.race?.start());
    }, 40);
  }

  pauseRace() {
    const r = this.race;
    if (!r || r.paused || r.state === 'done') return;
    r.paused = true;
    this.platform.gameplayStop();
    this.audio.engineStopAll();
    this.audio.nitroStop();
    this.ui.modal('pause', true);
  }
  resumeRace() {
    const r = this.race;
    if (!r) return;
    this.ui.modal('pause', false);
    this.ui.modal('settings', false);
    r.paused = false;
    r.start();
    if (r.state === 'racing') {
      this.platform.gameplayStart();
      this.audio.setMusicIntensity(r.player.lap >= r.totalLaps ? 1.5 : 1);
    }
  }
  restartRace() {
    const idx = this.race.idx;
    this.startRace(idx);
  }
  quitRace() {
    this._disposeRace();
    this.audio.musicStart(MENU_MUSIC, 0.7);
    this.ui.nav('title');
  }
  _disposeRace() {
    if (!this.race) return;
    this.platform.gameplayStop();
    this.race.dispose();
    this.race = null;
    this.ui.hud.show(false);
    $('touch').classList.add('hidden');
  }

  showResults(r) {
    this.ui.hud.show(false);
    $('touch').classList.add('hidden');
    this.audio.engineStopAll();
    this.ui.showResults(r);
  }

  async afterResults(action) {
    const idx = this.race ? this.race.idx : 0;
    // interstitial between races (the portal rate-limits these itself)
    await this.platform.midgameAd();
    this._disposeRace();
    if (action === 'next') this.startRace(Math.min(idx + 1, TRACKS.length - 1));
    else if (action === 'retry') this.startRace(idx);
    else {
      this.audio.musicStart(MENU_MUSIC, 0.7);
      this.ui.nav(action === 'garage' ? 'garage' : 'title');
    }
  }

  async rewarded() {
    return this.platform.rewardedAd();
  }
}

const game = new Game();
window.__game = game;
game.boot().catch((e) => {
  console.error(e);
  const t = document.getElementById('loadtxt');
  if (t) t.textContent = 'Something went wrong while loading. Please refresh.';
});
