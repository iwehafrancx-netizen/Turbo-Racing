import * as THREE from 'three';
import { TRACKS, POSITION_REWARD } from '../data/tracks.js';
import { CARS, carStats, AI_NAMES } from '../data/cars.js';
import { World } from '../world/world.js';
import { Vehicle, collideCars, DRIFT_COLORS } from './car.js';
import { AIDriver } from './ai.js';
import { ChaseCam } from './camera.js';
import { Effects } from './effects.js';
import { rng, clamp } from '../core/util.js';

const STEP = 1 / 120;
const COUNTDOWN = 3;

export class Race {
  constructor(game, trackIdx) {
    this.game = game;
    this.idx = trackIdx;
    this.def = TRACKS[trackIdx];
    const q = game.quality;
    this.world = new World(game.renderer, trackIdx, q);
    this.scene = this.world.scene;
    this.path = this.world.path;
    this.theme = this.world.theme;
    this.camera = game.camera;
    this.cam = new ChaseCam(this.camera, this.path);
    this.cam.setMode(game.save.data.settings.camera || 0);
    this.fx = new Effects(this.scene, this.theme);
    this.obstacles = this.world.obstacles;
    this.raceLen = this.path.finishS - this.path.startS;
    this.time = -COUNTDOWN; // race clock; negative during countdown
    this.state = 'intro';
    this.paused = false;
    this.acc = 0;
    this.clock = 0;
    this.stats = { coins: 0, drift: 0, overtakes: 0, wallHits: 0, airTime: 0, perfectStart: false, obstacleHits: 0 };
    this.milestone = 0;
    this.driftPts = 0;
    this._buildCars();
    this.lastPlace = 6;
    this.camera.far = 6000;
    this.camera.updateProjectionMatrix();
    this.cam.snap(this.player);
    this.cam.intro(this.player);
    this.introT = 0;
    this.throttleSince = -99;
  }

  _buildCars() {
    const g = this.game, p = this.path;
    const night = this.theme.night;
    const sv = g.save.data;
    const pdef = g.save.carDef();
    const r = rng(this.idx * 7 + 3);
    const names = [...AI_NAMES].sort(() => r() - 0.5);
    this.cars = [];
    this.ais = [];
    const slots = 6;
    const slotPos = (k) => {
      const row = Math.floor(k / 2);
      const start = Math.round(p.startS / p.spacing);
      return { i: p.wrap(start - 4 - row * 5 - (k % 2) * 2), lat: (k % 2 ? 1 : -1) * p.halfWidth * 0.42 };
    };
    // player starts at the back of the grid: overtaking is the fun part
    for (let k = 0; k < slots; k++) {
      const isPlayer = k === slots - 1;
      let car;
      if (isPlayer) {
        const st = carStats(pdef, sv.upgrades[pdef.id]);
        car = new Vehicle(g.models.get(pdef.id), st, p, { isPlayer: true, name: 'You', night });
        this.player = car;
      } else {
        const cid = this.def.aiCars[k % this.def.aiCars.length];
        const cdef = CARS.find((c) => c.id === cid);
        const lvl = Math.min(4, Math.floor(this.idx / 2.5));
        const st = carStats(cdef, { engine: lvl, turbo: lvl, grip: lvl });
        car = new Vehicle(g.models.get(cid), st, p, { name: names[k], night });
        const skill = this.def.aiSkill * (0.96 + k * 0.012);
        const ai = new AIDriver(car, p, skill, this.idx * 13 + k);
        ai.obstacles = this.world.obstacles;
        this.ais.push(ai);
      }
      const s = slotPos(k);
      car.initRace(s.i, s.lat);
      this.fx.attachFlames(car);
      this.scene.add(car.root);
      this.cars.push(car);
    }
  }

  start() {
    const a = this.game.audio;
    a.engineStopAll();
    a.engineStart('player', 1);
    this.ais.forEach((ai, k) => a.engineStart('ai' + k, 0.35));
    a.musicStart(this.theme.music, 0.6);
    a.setMusicIntensity(0.6);
  }

  // ------------------------------------------------------------------
  update(dt) {
    if (this.paused) return;
    dt = Math.min(dt, 0.05);
    this.clock += dt;
    const ui = this.game.ui, input = this.game.input, audio = this.game.audio;
    const acts = input.actions();
    if (acts.pause && this.state !== 'done') { this.game.pauseRace(); return; }
    if (acts.camera) {
      this.cam.setMode(this.cam.mode + 1);
      this.game.save.data.settings.camera = this.cam.mode;
    }

    // ----- intro flyby -> countdown -----
    if (this.state === 'intro') {
      this.introT += dt;
      ui.hud.showTrackIntro(this.def, this.idx);
      if (this.introT > 3.2 || (this.introT > 0.6 && acts.throttleTap)) {
        this.state = 'countdown';
        this.cam.chase();
        this.cam.snap(this.player);
        ui.hud.hideTrackIntro();
        this.lastCount = 4;
      }
    }
    if (this.state === 'countdown') {
      this.time += dt;
      const n = Math.ceil(-this.time);
      if (n !== this.lastCount && n >= 1) {
        this.lastCount = n;
        ui.hud.countdown(String(n));
        audio.play('count');
      }
      if (input.anyThrottle()) { if (this.throttleSince < -50) this.throttleSince = this.time; } else this.throttleSince = -99;
      if (this.time >= 0) {
        this.state = 'racing';
        ui.hud.countdown('GO!');
        audio.play('go');
        audio.setMusicIntensity(1);
        this.game.platform.gameplayStart();
        const held = this.time - this.throttleSince;
        if (this.throttleSince > -50 && held < 0.55) {
          this.player.boostTime = 1.6;
          this.player.nitro = Math.min(this.player.stats.nitroCap, this.player.nitro + 0.25);
          this.stats.perfectStart = true;
          ui.hud.flash('PERFECT START!', '#5ef2ff');
          audio.play('miniturbo', 3);
        } else if (this.throttleSince > -50 && held > 1.6) {
          ui.hud.flash('TOO EARLY!', '#ff6b6b', 1.0);
          this.player.vx *= 0; this.stallT = 0.6;
        }
      }
    } else if (this.state === 'racing' || this.state === 'done') {
      this.time += dt;
    }

    // ----- physics (fixed step) -----
    this.obstacles.update(this.clock);
    const ctrl = this._playerControls(dt, input);
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 8) {
      this.acc -= STEP;
      steps++;
      this._physicsStep(STEP, ctrl);
    }

    // ----- per-frame game logic -----
    this._frameLogic(dt, acts);

    // ----- visuals -----
    for (const c of this.cars) {
      c.updateVisual(dt, this.clock);
      const close = c === this.player || c.pos.distanceToSquared(this.player.pos) < 90 * 90;
      this.fx.updateCar(c, dt, this.clock, close);
    }
    this.fx.update(dt);
    this.cam.update(dt, this.player, this.clock);
    this.world.update(dt, this.camera, this.clock, this.player.pos);
    if (this.world.atmo.bolt) { audio.play('thunder'); this.cam.shake(0.12); }
    this._audio();
    ui.hud.update(this);
  }

  _playerControls(dt, input) {
    const p = this.player;
    if (this.state === 'done' && this.autopilot) return this.autopilot.update(dt, this.cars, this.player, this.time);
    if (this.state !== 'racing') {
      const c = input.read(dt);
      return { throttle: 0, brake: 0, steer: c.steer * 0, drift: false, nitro: false };
    }
    const c = input.read(dt);
    if (this.stallT > 0) { this.stallT -= dt; c.throttle = 0; }
    void p;
    return c;
  }

  _physicsStep(dt, ctrl) {
    const racing = this.state === 'racing' || this.state === 'done';
    for (let k = 0; k < this.ais.length; k++) {
      const ai = this.ais[k];
      const car = ai.car;
      const c = racing ? ai.update(dt, this.cars, this.player, this.time) : { throttle: 0, brake: 0, steer: 0, drift: false, nitro: false };
      car.step(dt, c);
      this.obstacles.collide(car, this.clock);
      this._warp(car);
      if (racing) car.updateProgress(this.time);
      if (car.fallen) car.respawn();
    }
    const ev = this.player.step(dt, ctrl);
    const hit = this.obstacles.collide(this.player, this.clock);
    if (this._warp(this.player)) this._playerWarped();
    if (hit > 3 && this.state === 'racing') {
      this.stats.obstacleHits++;
      this.game.ui.hud.flash('BONK!', '#ff6b6b', 0.6, true);
      if (this.autopilot === undefined) this.player.hitT = 0.6;
    }
    this._playerEvents(ev);
    if (racing) this.player.updateProgress(this.time);
    collideCars(this.cars, (a, b, imp) => {
      if (a === this.player || b === this.player) {
        if (imp > 4) {
          this.game.audio.play('bump', imp);
          this.cam.shake(Math.min(0.5, imp * 0.03));
          const o = a === this.player ? b : a;
          this.fx.sparks((a.pos.x + b.pos.x) / 2, a.pos.y + 0.6, (a.pos.z + b.pos.z) / 2, 8);
          void o;
        }
      }
    });
  }

  _playerEvents(ev) {
    const p = this.player, a = this.game.audio, ui = this.game.ui;
    if (ev.boostPad) { a.play('boost'); ui.hud.flash('BOOST!', '#5ef2ff', 0.6, true); this.cam.shake(0.15); }
    if (ev.miniTurbo) {
      a.play('miniturbo', ev.miniTurbo);
      const name = ['', 'MINI TURBO', 'SUPER TURBO', 'ULTRA TURBO'][ev.miniTurbo];
      ui.hud.flash(name, DRIFT_COLORS[ev.miniTurbo - 1], 0.8, true);
      this.fx.burst(p.pos, DRIFT_COLORS[ev.miniTurbo - 1], 18);
    }
    if (p.wallHit > 5) {
      a.play('wall', p.wallHit);
      this.cam.shake(Math.min(0.6, p.wallHit * 0.03));
      const s = Math.sign(p.proj.lat);
      this.fx.sparks(p.pos.x + this.path.rx[p.proj.idx] * s * p.halfW, p.pos.y + 0.5, p.pos.z + this.path.rz[p.proj.idx] * s * p.halfW, 16);
      if (this.state === 'racing') this.stats.wallHits++;
    }
    if (!p.onGround && p.pos.y < p.path.py[p.proj.idx] - 4 && !this._fallCue) { this._fallCue = true; a.play('fall'); }
    if (p.onGround) this._fallCue = false;
    if (p.landed) {
      a.play('land', p.landed);
      this.cam.shake(Math.min(0.5, p.landed * 0.03));
      this.fx.landing(p.pos);
    }
  }

  // Black holes / wormholes: entering one carries the car to the next leg.
  _warp(car) {
    for (const pt of this.path.portals) {
      if (car.proj.idx >= pt.idx && car.proj.idx <= this.path.hi[pt.idx]) {
        car.warpTo(pt.to);
        return true;
      }
    }
    return false;
  }

  _playerWarped() {
    const p = this.player, ui = this.game.ui, a = this.game.audio;
    p.boostTime = Math.max(p.boostTime, 1.4);
    this.cam.snap(p);
    this.cam.shake(0.4);
    ui.hud.warp();
    ui.hud.flash('WARP SPEED!', '#b78cff', 1.2);
    a.play('warp');
  }

  // Progress call-outs on the way to the finish.
  _milestones() {
    const p = this.player, ui = this.game.ui, a = this.game.audio;
    const f = p.progress / this.raceLen;
    if (this.milestone === 0 && f > 0.5) { this.milestone = 1; ui.hud.banner('HALFWAY!', '#ffffff'); a.play('lap'); }
    if (this.milestone === 1 && f > 0.85) { this.milestone = 2; ui.hud.banner('FINAL STRETCH', '#ffd23f'); a.play('finalLap'); a.setMusicIntensity(1.5); }
  }

  _frameLogic(dt, acts) {
    const p = this.player, ui = this.game.ui, a = this.game.audio, path = this.path;

    // drift scoring & tier feedback
    if (p.drift.active) {
      this.driftPts += dt * Math.max(0, p.vF) * 2;
      if (p.drift.tier !== this.lastTier && p.drift.tier > 0) a.play('tier', p.drift.tier);
      this.lastTier = p.drift.tier;
      ui.hud.drift(Math.floor(this.driftPts), p.drift.tier);
    } else if (this.driftPts > 0) {
      const pts = Math.floor(this.driftPts);
      if (pts > 30 && this.state === 'racing') {
        this.stats.drift += pts;
        ui.hud.driftEnd(pts);
      } else ui.hud.driftEnd(0);
      this.driftPts = 0;
      this.lastTier = 0;
    }

    // coins
    const tm = this.world.track;
    for (let k = 0; k < tm.coinPos.length; k++) {
      if (tm.coinTaken[k]) continue;
      if (tm.coinPos[k].distanceToSquared(p.pos) < 6.5) {
        tm.coinTaken[k] = 1;
        this.stats.coins++;
        p.nitro = Math.min(p.stats.nitroCap, p.nitro + 0.04);
        a.play('coin');
        this.fx.coinBurst(tm.coinPos[k]);
      }
    }
    if (this.state === 'racing') this._milestones();

    // slipstream
    let slip = false;
    if (this.state === 'racing' && p.vF > 25) {
      for (const o of this.cars) {
        if (o === p) continue;
        const ds = o.proj.s - p.proj.s;
        if (ds > 3 && ds < 20 && Math.abs(o.proj.lat - p.proj.lat) < 2.4) { slip = true; break; }
      }
    }
    p.slipstream = slip ? Math.min(1, p.slipstream + dt * 2) : Math.max(0, p.slipstream - dt * 2);
    if (slip) p.nitro = Math.min(p.stats.nitroCap, p.nitro + dt * 0.14);
    p.topMul = 1 + p.slipstream * 0.04;

    // air time bonus
    if (!p.onGround && p.airTime > 0.5 && this.state === 'racing') this.stats.airTime += dt;

    // positions + overtakes
    const order = this._order();
    const place = order.indexOf(p) + 1;
    if (this.state === 'racing' && place !== this.lastPlace && this.time > 1) {
      if (place < this.lastPlace) {
        this.stats.overtakes += this.lastPlace - place;
        a.play('overtake');
        ui.hud.flash(place === 1 ? 'TAKE THE LEAD!' : 'OVERTAKE!', place === 1 ? '#ffd23f' : '#ffffff', 0.7, true);
      }
      this.lastPlace = place;
    }
    this.place = place;
    this.order = order;

    // wrong way / respawn
    if (this.state === 'racing') {
      const th = path.heading[p.proj.idx];
      const moving = Math.atan2(p.vx, p.vz);
      let d = moving - th; d = Math.atan2(Math.sin(d), Math.cos(d));
      if (p.speed > 6 && Math.abs(d) > 2.2) p.wrongWay += dt; else p.wrongWay = Math.max(0, p.wrongWay - dt * 2);
      ui.hud.wrongWay(p.wrongWay > 1.2);
      if (p.speed < 2 && this.game.input.anyThrottle()) p.stuckTime += dt; else p.stuckTime = 0;
      if (acts.respawn || p.fallen || p.stuckTime > 3) {
        if (p.fallen) { ui.hud.flash('WHOOPS!', '#ff6b6b', 0.8); this.stats.falls = (this.stats.falls || 0) + 1; }
        p.respawn();
        p.stuckTime = 0;
        this.cam.snap(p);
      }
    }

    // finish
    if (p.finished && this.state === 'racing') this._finish();
    if (this.state === 'done') {
      this.doneT += dt;
      if (this.doneT > 3.6 && !this.resultsShown) {
        this.resultsShown = true;
        this.game.showResults(this.results);
      }
    }
  }

  _order() {
    const list = [...this.cars];
    list.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    return list;
  }

  _finish() {
    const p = this.player, a = this.game.audio, ui = this.game.ui;
    this.state = 'done';
    this.doneT = 0;
    this.game.platform.gameplayStop();
    const order = this._order();
    const place = order.indexOf(p) + 1;
    this.cam.finish(p);
    this.autopilot = new AIDriver(p, this.path, 0.85, 99);
    this.autopilot.obstacles = this.obstacles;
    a.nitroStop();
    if (place === 1) { a.play('win'); this.game.platform.happytime(); } else if (place <= 3) a.play('win'); else a.play('lose');
    ui.hud.finish(place);
    a.setMusicIntensity(0.6);

    // estimate unfinished rivals' times from their pace so far
    const L = this.raceLen;
    const board = order.map((c) => {
      let t = c.finishTime;
      if (!c.finished) {
        const done = Math.max(1, c.progress);
        t = this.time * (L / done) + 0.5 + Math.random();
        t = Math.max(t, p.finishTime + 0.3);
      }
      return { name: c.name, car: c.def.name, time: t, isPlayer: c === p };
    });
    board.sort((x, y) => x.time - y.time);
    const truePlace = board.findIndex((b) => b.isPlayer) + 1;
    const mult = 1 + this.idx * 0.15;
    const rewards = [];
    rewards.push({ label: `${['1st', '2nd', '3rd', '4th', '5th', '6th'][truePlace - 1]} place`, coins: Math.round(POSITION_REWARD[truePlace - 1] * mult) });
    if (this.stats.coins) rewards.push({ label: `Coins collected ×${this.stats.coins}`, coins: this.stats.coins * 5 });
    const driftCoins = Math.floor(this.stats.drift / 25);
    if (driftCoins) rewards.push({ label: `Drift score ${this.stats.drift}`, coins: driftCoins });
    if (this.stats.overtakes) rewards.push({ label: `Overtakes ×${this.stats.overtakes}`, coins: this.stats.overtakes * 15 });
    if (this.stats.airTime > 1) rewards.push({ label: `Air time ${this.stats.airTime.toFixed(1)}s`, coins: Math.round(this.stats.airTime * 10) });
    if (this.stats.perfectStart) rewards.push({ label: 'Perfect start', coins: 50 });
    if (this.stats.wallHits === 0) rewards.push({ label: 'Clean race (no wall hits)', coins: 150 });
    if (this.obstacles.list.length && this.stats.obstacleHits === 0) rewards.push({ label: 'Untouchable (dodged every obstacle)', coins: 120 });
    const total = rewards.reduce((s, r) => s + r.coins, 0);
    const rec = this.game.save.recordRace(this.idx, truePlace, p.finishTime, Infinity, total);
    this.results = { trackIdx: this.idx, place: truePlace, time: p.finishTime, board, rewards, total, ...rec };
  }

  _audio() {
    const a = this.game.audio, p = this.player;
    const skid = p.drift.active && p.onGround ? 1 : (p.onGround && p.sliding && p.speed > 12 ? 0.55 : 0);
    const thr = this.state === 'countdown' ? (this.game.input.anyThrottle() ? 1 : 0) : 1;
    const sf = this.state === 'countdown' && thr ? 0.45 + Math.random() * 0.05 : clamp(p.speed / (p.stats.maxSpeed * 1.25), 0, 1.1);
    a.engineUpdate('player', sf, thr, p.boosting, skid);
    if (p.nitroActive) a.nitroStart(); else a.nitroStop();
    this.ais.forEach((ai, k) => {
      const c = ai.car;
      const d = c.pos.distanceTo(p.pos);
      a.engineUpdate('ai' + k, clamp(c.speed / (c.stats.maxSpeed * 1.25), 0, 1.1), ai.controls.throttle, c.boosting, 0, d);
    });
  }

  render(renderer) {
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    const a = this.game.audio;
    a.engineStopAll();
    a.nitroStop();
    for (const c of this.cars) { this.scene.remove(c.root); c.dispose(); }
    this.fx.dispose(this.scene);
    this.world.dispose();
  }
}

export { THREE };
