import { TRACKS } from '../data/tracks.js';
import { THEMES } from '../data/themes.js';
import { CARS, UPGRADES, MAX_UPGRADE, upgradeCost, carStats } from '../data/cars.js';
import { getPath } from '../world/world.js';
import { formatTime, ordinal } from '../core/util.js';
import { Hud } from './hud.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.hud = new Hud();
    this.screen = 'loading';
    this.garageIdx = CARS.findIndex((c) => c.id === game.save.data.car);
    document.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => this.nav(b.dataset.nav)));
    document.addEventListener('pointerover', (e) => { if (e.target.closest?.('.btn, .tcard, .arrow')) game.audio.play('hover'); });
    document.addEventListener('click', (e) => { if (e.target.closest?.('button, .tcard')) game.audio.play('click'); }, true);
    this._bindModals();
    this._bindGarage();
    this._bindResults();
  }

  // ---------- navigation ----------
  nav(to) {
    if (to === 'settings') return this.openSettings();
    if (to === 'howto') return this.modal('howto', true);
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('show', s.id === to);
    this.screen = to;
    this.refresh();
    if (to === 'tracks') this.buildTracks();
    if (to === 'garage') this.showGarageCar();
    if (to === 'title') this.game.showroom.setCar(this.game.save.data.car);
    this.game.showroom.setFraming(to === 'garage' ? 'garage' : 'title');
    this.game.onScreen(to);
  }
  hideScreens() {
    for (const s of document.querySelectorAll('.screen')) s.classList.remove('show');
    this.screen = 'race';
  }
  modal(name, on) { $('modal-' + name).classList.toggle('show', on); }

  toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('show'), 2200);
  }

  refresh() {
    const d = this.game.save.data;
    document.querySelectorAll('[data-bind=coins]').forEach((e) => { e.textContent = d.coins.toLocaleString(); });
    document.querySelectorAll('[data-bind=stars]').forEach((e) => { e.textContent = this.game.save.totalStars; });
    const car = this.game.save.carDef();
    document.querySelectorAll('[data-bind=carName]').forEach((e) => { e.textContent = car.name; });
    document.querySelectorAll('[data-bind=carTag]').forEach((e) => { e.textContent = car.tag; });
    // nudge the player toward the garage when they can afford something
    const afford = CARS.some((c) => (d.owned.includes(c.id)
      ? UPGRADES.some((u) => d.upgrades[c.id][u.id] < MAX_UPGRADE && upgradeCost(c, d.upgrades[c.id][u.id]) <= d.coins)
      : c.price <= d.coins));
    document.querySelectorAll('[data-nav=garage]').forEach((b) => b.classList.toggle('notify', afford));
  }

  setLoading(p, txt) {
    $('loadfill').style.width = Math.round(p * 100) + '%';
    if (txt) $('loadtxt').textContent = txt;
  }

  // ---------- track select ----------
  buildTracks() {
    const grid = $('track-grid');
    const d = this.game.save.data;
    grid.innerHTML = '';
    TRACKS.forEach((t, i) => {
      const th = THEMES[t.theme];
      const locked = i >= d.unlocked;
      const stars = d.stars[t.id] || 0;
      const best = d.best[t.id];
      const card = document.createElement('div');
      card.className = 'tcard' + (locked ? ' locked' : '') + (!locked && i === d.unlocked - 1 && !stars ? ' new' : '');
      const cv = document.createElement('canvas');
      cv.width = 320; cv.height = 240;
      this._drawThumb(cv, i, th);
      card.appendChild(cv);
      const diff = Array.from({ length: 5 }, (_, k) => `<i class="${k < Math.ceil(t.difficulty / 2) ? 'on' : ''}"></i>`).join('');
      card.insertAdjacentHTML('beforeend', `
        <div class="tc-num">${i + 1}</div>
        <div class="tc-diff">${diff}</div>
        <div class="tc-info">
          <div class="tc-name">${t.name}</div>
          <div class="tc-tag">${t.tagline}</div>
          <div class="tc-meta"><span class="tc-stars">${[0, 1, 2].map((k) => `<span class="${k < stars ? '' : 'off'}">★</span>`).join('')}</span>
          <span>${best?.race ? formatTime(best.race) : ''}</span></div>
        </div>
        ${locked ? `<div class="lock"><b>🔒</b>Finish top 3 on<br>${TRACKS[i - 1].name}</div>` : ''}`);
      card.addEventListener('click', () => {
        if (locked) { this.game.audio.play('error'); this.toast(`Finish in the top 3 on ${TRACKS[i - 1].name} to unlock!`); return; }
        this.game.startRace(i);
      });
      grid.appendChild(card);
    });
  }

  _drawThumb(cv, i, th) {
    const x = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, th.sky.top);
    g.addColorStop(0.55, th.sky.horizon);
    g.addColorStop(1, th.terrain ? th.terrain.palette[2] : th.sky.bottom);
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    if (th.sky.stars) {
      x.fillStyle = '#fff';
      for (let k = 0; k < 60; k++) { x.globalAlpha = Math.random(); x.fillRect(Math.random() * W, Math.random() * H * 0.6, 1.5, 1.5); }
      x.globalAlpha = 1;
    }
    const p = getPath(i);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let k = 0; k < p.N; k++) { minX = Math.min(minX, p.px[k]); maxX = Math.max(maxX, p.px[k]); minZ = Math.min(minZ, p.pz[k]); maxZ = Math.max(maxZ, p.pz[k]); }
    const Ah = H - 96;
    const sc = Math.min((W - 50) / (maxX - minX), Ah / (maxZ - minZ));
    const left = (W - (maxX - minX) * sc) / 2, top = 14 + (Ah - (maxZ - minZ) * sc) / 2;
    // mirrored X so the shape matches the in-race minimap
    const tx = (v) => left + (maxX - v) * sc, tz = (v) => top + (maxZ - v) * sc;
    x.lineJoin = 'round'; x.lineCap = 'round';
    const trace = () => { x.beginPath(); for (let k = 0; k <= p.N; k += 4) { const j = k % p.N; k ? x.lineTo(tx(p.px[j]), tz(p.pz[j])) : x.moveTo(tx(p.px[j]), tz(p.pz[j])); } x.closePath(); };
    x.strokeStyle = 'rgba(0,0,0,0.45)'; x.lineWidth = 12; trace(); x.stroke();
    x.strokeStyle = th.wall.glow || th.road.curbA; x.lineWidth = 7; x.shadowColor = x.strokeStyle; x.shadowBlur = 12; trace(); x.stroke();
    x.shadowBlur = 0;
    x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 2.5; trace(); x.stroke();
    x.fillStyle = '#fff';
    x.beginPath(); x.arc(tx(p.px[0]), tz(p.pz[0]), 5, 0, 7); x.fill();
  }

  // ---------- garage ----------
  _bindGarage() {
    $('g-prev').onclick = () => { this.garageIdx = (this.garageIdx + CARS.length - 1) % CARS.length; this.showGarageCar(); };
    $('g-next').onclick = () => { this.garageIdx = (this.garageIdx + 1) % CARS.length; this.showGarageCar(); };
    $('g-action').onclick = () => this._garageAction();
    $('g-ad').onclick = async () => {
      $('g-ad').disabled = true;
      const ok = await this.game.rewarded();
      if (ok) {
        this.game.save.data.coins += 250;
        this.game.save.write();
        this.game.audio.play('buy');
        this.toast('+250 coins!');
        this.refresh();
      } else this.toast('No ad available right now — try again later.');
      setTimeout(() => { $('g-ad').disabled = false; }, 2500);
    };
  }

  showGarageCar() {
    const car = CARS[this.garageIdx];
    const d = this.game.save.data;
    const owned = d.owned.includes(car.id);
    const up = d.upgrades[car.id];
    this.game.showroom.setCar(car.id);
    $('g-name').textContent = car.name;
    $('g-idx').textContent = `${this.garageIdx + 1}/${CARS.length}`;
    $('g-tag').textContent = car.tag;
    const base = carStats(car);
    const cur = carStats(car, up);
    const rows = [
      ['Speed', base.maxSpeed, cur.maxSpeed, 50, 78],
      ['Accel', base.accel, cur.accel, 18, 32],
      ['Handling', base.handling, cur.handling, 0.85, 1.3],
      ['Drift', base.drift, base.drift, 0.8, 1.4],
      ['Nitro', base.nitroPower, cur.nitroPower, 0.9, 1.65],
    ];
    $('g-stats').innerHTML = rows.map(([n, b, c, lo, hi]) => {
      const pb = Math.max(4, Math.min(100, ((b - lo) / (hi - lo)) * 100));
      const pc = Math.max(4, Math.min(100, ((c - lo) / (hi - lo)) * 100));
      return `<div class="stat">${n}<div class="bar"><i class="up" style="width:${pc}%"></i><i style="width:${pb}%"></i></div></div>`;
    }).join('');
    $('g-upgrades').innerHTML = owned ? UPGRADES.map((u) => {
      const lvl = up[u.id];
      const cost = upgradeCost(car, lvl);
      const max = lvl >= MAX_UPGRADE;
      return `<div class="upg"><div><div class="u-name">${u.name}</div><div class="u-desc">${u.desc}</div>
        <div class="pips">${Array.from({ length: MAX_UPGRADE }, (_, k) => `<i class="${k < lvl ? 'on' : ''}"></i>`).join('')}</div></div>
        <button class="btn ${max ? '' : 'primary'}" data-up="${u.id}" ${max || d.coins < cost ? 'disabled' : ''}>${max ? 'MAX' : `<span class="coin-ico sm"></span> ${cost}`}</button></div>`;
    }).join('') : `<div class="upg"><div><div class="u-name">Locked</div><div class="u-desc">Buy this car to unlock upgrades.</div></div></div>`;
    $('g-upgrades').querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => this._upgrade(car, b.dataset.up)));
    const btn = $('g-action');
    if (!owned) {
      btn.innerHTML = `BUY <span class="coin-ico sm"></span> ${car.price.toLocaleString()}`;
      btn.disabled = d.coins < car.price;
    } else if (d.car === car.id) {
      btn.textContent = 'SELECTED ✓';
      btn.disabled = true;
    } else {
      btn.textContent = 'SELECT';
      btn.disabled = false;
    }
    this.refresh();
  }

  _garageAction() {
    const car = CARS[this.garageIdx];
    const d = this.game.save.data;
    if (!d.owned.includes(car.id)) {
      if (d.coins < car.price) { this.game.audio.play('error'); return; }
      d.coins -= car.price;
      d.owned.push(car.id);
      d.car = car.id;
      this.game.audio.play('buy');
      this.toast(`${car.name} is yours!`);
    } else {
      d.car = car.id;
    }
    this.game.save.write();
    this.showGarageCar();
  }

  _upgrade(car, id) {
    const d = this.game.save.data;
    const lvl = d.upgrades[car.id][id];
    const cost = upgradeCost(car, lvl);
    if (lvl >= MAX_UPGRADE || d.coins < cost) { this.game.audio.play('error'); return; }
    d.coins -= cost;
    d.upgrades[car.id][id]++;
    this.game.save.write();
    this.game.audio.play('buy');
    this.showGarageCar();
  }

  // ---------- modals ----------
  _bindModals() {
    const g = this.game;
    $('p-resume').onclick = () => g.resumeRace();
    $('p-restart').onclick = () => { this.modal('pause', false); g.restartRace(); };
    $('p-settings').onclick = () => this.openSettings();
    $('p-quit').onclick = () => { this.modal('pause', false); g.quitRace(); };
    $('h-pause').addEventListener('pointerdown', (e) => { e.preventDefault(); g.pauseRace(); });
    $('h-close').onclick = () => {
      this.modal('howto', false);
      g.save.data.tutorialDone = true;
      g.save.write();
      if (g.pendingRace != null) { const i = g.pendingRace; g.pendingRace = null; g.startRace(i); }
    };
    $('d-ok').onclick = () => { this.modal('daily', false); this.refresh(); this.game.audio.play('buy'); };
    const s = g.save.data.settings;
    $('s-volume').oninput = (e) => { s.volume = +e.target.value; g.audio.setVolume(s.volume); };
    $('s-music').onchange = (e) => { s.music = e.target.checked; g.audio.setMusic(s.music); };
    $('s-quality').onchange = (e) => { s.quality = e.target.value; g.applyQuality(); };
    $('s-camera').onchange = (e) => { s.camera = +e.target.value; if (g.race) g.race.cam.setMode(s.camera); };
    $('s-close').onclick = () => { this.modal('settings', false); g.save.write(); };
  }
  openSettings() {
    const s = this.game.save.data.settings;
    $('s-volume').value = s.volume;
    $('s-music').checked = s.music;
    $('s-quality').value = s.quality;
    $('s-camera').value = s.camera || 0;
    this.modal('settings', true);
  }
  showDaily(r) {
    $('d-amt').textContent = r.amount;
    $('d-streak').textContent = r.streak > 1 ? `${r.streak}-day streak! Come back tomorrow for more.` : 'Come back tomorrow to build a streak!';
    this.modal('daily', true);
  }

  // ---------- results ----------
  _bindResults() {
    const g = this.game;
    $('res-menu').onclick = () => g.afterResults('menu');
    $('res-garage').onclick = () => g.afterResults('garage');
    $('res-retry').onclick = () => g.afterResults('retry');
    $('res-next').onclick = () => g.afterResults('next');
    $('res-double').onclick = async () => {
      const r = this.results;
      if (!r || r.doubled) return;
      $('res-double').disabled = true;
      const ok = await g.rewarded();
      if (ok) {
        r.doubled = true;
        g.save.data.coins += r.total;
        g.save.write();
        this._countTo($('res-total'), r.total, r.total * 2);
        g.audio.play('buy');
        $('res-double').textContent = 'COINS DOUBLED ✓';
        this.refresh();
      } else {
        this.toast('No ad available right now.');
        $('res-double').disabled = false;
      }
    };
  }

  _countTo(el, from, to, ms = 900) {
    const t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      el.textContent = Math.round(from + (to - from) * k).toLocaleString();
      if (k < 1) requestAnimationFrame(tick);
    };
    tick();
  }

  showResults(r) {
    this.results = r;
    const g = this.game;
    const t = TRACKS[r.trackIdx];
    const place = $('res-place');
    place.innerHTML = `${r.place}<sup>${ordinal(r.place).replace(/\d+/, '')}</sup>`;
    place.className = 'res-place' + (r.place === 1 ? ' p1' : '');
    $('res-track').textContent = t.name;
    $('res-time').textContent = `Time ${formatTime(r.time)}  ·  Best lap ${formatTime(r.bestLap)}`;
    const st = $('res-stars');
    st.innerHTML = '<span>★</span><span>★</span><span>★</span>';
    [...st.children].forEach((s, k) => {
      if (k < r.stars) setTimeout(() => { s.classList.add('on'); g.audio.play('star'); }, 500 + k * 350);
    });
    const badges = [];
    if (r.newRecord) badges.push('<span class="badge hot">NEW RECORD</span>');
    if (r.unlockedNew) badges.push(`<span class="badge">TRACK ${r.trackIdx + 2} UNLOCKED</span>`);
    if (r.newStars) badges.push(`<span class="badge">+${r.newStars} ★</span>`);
    if (r.place > 3 && r.trackIdx + 1 >= g.save.data.unlocked) badges.push('<span class="badge hot">TOP 3 NEEDED TO UNLOCK NEXT TRACK</span>');
    $('res-badges').innerHTML = badges.join('');
    $('res-board').innerHTML = r.board.map((b) => `<li class="${b.isPlayer ? 'me' : ''}"><span>${b.name} <small>${b.car}</small></span><span>${formatTime(b.time)}</span></li>`).join('');
    const list = $('res-rewards');
    list.innerHTML = r.rewards.map((w) => `<li><span>${w.label}</span><b>+${w.coins}</b></li>`).join('');
    [...list.children].forEach((li, k) => setTimeout(() => { li.classList.add('in'); g.audio.play('coin'); }, 300 + k * 160));
    this._countTo($('res-total'), 0, r.total, 300 + r.rewards.length * 160);
    const dbl = $('res-double');
    dbl.disabled = false;
    dbl.innerHTML = '<span class="ad-ico">▶</span> DOUBLE COINS';
    const next = r.trackIdx + 1;
    const canNext = next < TRACKS.length && next < g.save.data.unlocked;
    $('res-next').style.display = canNext ? '' : 'none';
    $('res-retry').classList.toggle('primary', !canNext);
    for (const s of document.querySelectorAll('.screen')) s.classList.toggle('show', s.id === 'results');
    this.screen = 'results';
    this.refresh();
  }
}
