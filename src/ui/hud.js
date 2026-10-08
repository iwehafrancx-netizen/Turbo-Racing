import { formatTime, ordinal, clamp } from '../core/util.js';
import { DRIFT_COLORS } from '../game/car.js';
import { RUNOFF, START_S } from '../world/trackpath.js';

const getLen = (def) => def.course.length - RUNOFF - START_S;

const $ = (id) => document.getElementById(id);

function arcPath(cx, cy, r, a0, a1) {
  const p = (a) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

const SP0 = Math.PI * 0.75, SP1 = Math.PI * 2.25; // speed arc 270°
const NI0 = Math.PI * 0.8, NI1 = Math.PI * 0.2 + Math.PI * 2; // nitro arc around the outside

export class Hud {
  constructor() {
    this.el = $('hud');
    this.pos = $('h-pos'); this.suf = $('h-suf'); this.posWrap = this.pos.parentElement;
    this.dist = $('h-dist');
    this.progFill = $('hp-fill'); this.progDots = $('hp-dots');
    this.timeEl = $('h-time'); this.best = $('h-best');
    this.board = $('h-board');
    this.speed = $('h-speed');
    this.speedo = this.speed.closest('.speedo');
    this.spArc = $('sp-arc'); this.niArc = $('ni-arc'); this.niLbl = $('h-nitro-lbl');
    $('sp-track').setAttribute('d', arcPath(100, 100, 74, SP0, SP1));
    $('ni-track').setAttribute('d', arcPath(100, 100, 92, NI0, NI1));
    this.count = $('h-count'); this.bannerEl = $('h-banner'); this.flashEl = $('h-flash'); this.wrong = $('h-wrong');
    this.driftEl = $('h-drift'); this.driftPts = $('h-drift-pts');
    this.slip = $('h-slip');
    this.intro = $('h-intro');
    this.help = $('h-help');
    this.map = $('h-map');
    this.mapCtx = this.map.getContext('2d');
    this.speedlines = $('speedlines');
    this._last = {};
  }

  show(on) { this.el.classList.toggle('hidden', !on); if (!on) this.speedlines.style.opacity = 0; }

  setup(race, isMobile) {
    this.raceKm = (race.raceLen / 1000).toFixed(1);
    this.progDots.innerHTML = race.cars.map((c) => `<i class="${c.isPlayer ? 'me' : ''}"></i>`).join('');
    const rec = race.game.save.data.best[race.def.id];
    this.best.textContent = rec?.race ? formatTime(rec.race) : '--';
    this._buildMap(race.path);
    this.wrong.classList.remove('on');
    this.driftEl.className = 'h-drift';
    this.help.innerHTML = race.idx < 2 && !isMobile
      ? '<kbd>SPACE</kbd> drift &nbsp;·&nbsp; <kbd>SHIFT</kbd> nitro &nbsp;·&nbsp; <kbd>C</kbd> camera &nbsp;·&nbsp; <kbd>R</kbd> reset'
      : '';
    this.help.style.opacity = 1;
    this._last = {};
    this.board.innerHTML = race.cars.map(() => '<li><i></i><span></span></li>').join('');
  }

  _buildMap(path) {
    const S = 180;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < path.N; i++) {
      minX = Math.min(minX, path.px[i]); maxX = Math.max(maxX, path.px[i]);
      minZ = Math.min(minZ, path.pz[i]); maxZ = Math.max(maxZ, path.pz[i]);
    }
    const sc = (S - 40) / Math.max(maxX - minX, maxZ - minZ);
    const ox = (S - (maxX - minX) * sc) / 2, oz = (S - (maxZ - minZ) * sc) / 2;
    // mirror X so the map matches the driver's left/right
    this.mx = (x) => S - (ox + (x - minX) * sc);
    this.mz = (z) => S - (oz + (z - minZ) * sc);
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d');
    x.lineJoin = 'round'; x.lineCap = 'round';
    const trace = () => {
      x.beginPath();
      path.legStart.forEach((a, l) => {
        x.moveTo(this.mx(path.px[a]), this.mz(path.pz[a]));
        for (let k = a; k <= path.legEnd[l]; k += 3) x.lineTo(this.mx(path.px[k]), this.mz(path.pz[k]));
      });
    };
    x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 9; trace(); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 4; trace(); x.stroke();
    // black hole portals and their exits
    for (const pt of path.portals) {
      x.fillStyle = '#b78cff';
      for (const k of [pt.idx, pt.exit]) { x.beginPath(); x.arc(this.mx(path.px[k]), this.mz(path.pz[k]), 6, 0, 7); x.fill(); }
      x.fillStyle = '#000';
      x.beginPath(); x.arc(this.mx(path.px[pt.idx]), this.mz(path.pz[pt.idx]), 3, 0, 7); x.fill();
    }
    // start and finish
    const si = Math.round(path.startS / path.spacing), fi = Math.round(path.finishS / path.spacing);
    x.fillStyle = '#7dff9a';
    x.beginPath(); x.arc(this.mx(path.px[si]), this.mz(path.pz[si]), 5, 0, 7); x.fill();
    x.fillStyle = '#ffffff'; x.fillRect(this.mx(path.px[fi]) - 5, this.mz(path.pz[fi]) - 5, 10, 10);
    x.fillStyle = '#111111'; x.fillRect(this.mx(path.px[fi]) - 5, this.mz(path.pz[fi]) - 5, 5, 5); x.fillRect(this.mx(path.px[fi]), this.mz(path.pz[fi]), 5, 5);
    this.mapBase = c;
  }

  showTrackIntro(def, idx) {
    if (this._introShown) return;
    this._introShown = true;
    $('hi-num').textContent = `TRACK ${idx + 1}`;
    $('hi-name').textContent = def.name;
    $('hi-tag').textContent = `${def.tagline} · ${(getLen(def) / 1000).toFixed(1)} km`;
    const hint = $('hi-hint');
    hint.style.display = '';
    const F = def.course.features;
    if (F.obstacles.length && idx < 4) hint.textContent = '⚠ Watch out for moving obstacles on the road!';
    else if (F.open.length) hint.textContent = '⚠ No guard rails on some sections. Don\'t fall!';
    else if (F.gaps.length && idx < 3) hint.textContent = 'Hit the ramps at full speed to clear the gaps!';
    else if (idx < 3) hint.innerHTML = 'Hold <kbd>GAS</kbd> right as the lights hit GO for a turbo start!';
    else hint.style.display = 'none';
    this.intro.classList.add('on');
  }
  hideTrackIntro() { this.intro.classList.remove('on'); this._introShown = false; }

  _anim(el, cls, text, color) {
    el.textContent = text;
    if (color) el.style.color = color;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
  countdown(t) {
    this._anim(this.count, 'go', t, t === 'GO!' ? '#7dff9a' : '#ffffff');
  }
  banner(text, color) { this._anim(this.bannerEl, 'go', text, color); }
  flash(text, color = '#fff', dur = 1.2, small = false) {
    this.flashEl.style.setProperty('--dur', dur + 's');
    this.flashEl.classList.toggle('small', !!small);
    this._anim(this.flashEl, 'go', text, color);
  }
  warp() {
    const w = document.getElementById('warpfx');
    w.classList.remove('go'); void w.offsetWidth; w.classList.add('go');
  }
  wrongWay(on) { this.wrong.classList.toggle('on', on); }
  drift(pts, tier) {
    this.driftEl.className = 'h-drift on';
    this.driftPts.textContent = pts;
    this.driftEl.style.color = tier ? DRIFT_COLORS[tier - 1] : '#ffffff';
  }
  driftEnd(pts) {
    if (pts > 0) {
      this.driftPts.textContent = '+' + pts;
      this.driftEl.className = 'h-drift';
      void this.driftEl.offsetWidth;
      this.driftEl.className = 'h-drift end';
    } else this.driftEl.className = 'h-drift';
  }
  finish(place) {
    this.banner(place === 1 ? 'YOU WIN!' : `FINISHED ${ordinal(place).toUpperCase()}`, place === 1 ? '#ffd23f' : place <= 3 ? '#7dff9a' : '#ffffff');
  }

  update(race) {
    const p = race.player;
    const L = this._last;
    const place = race.place || 6;
    if (L.place !== place) {
      L.place = place;
      this.pos.textContent = place;
      this.suf.textContent = ordinal(place).replace(/\d+/, '');
      this.posWrap.classList.toggle('p1', place === 1);
      this.posWrap.classList.remove('bump'); void this.posWrap.offsetWidth; this.posWrap.classList.add('bump');
    }
    const km = (clamp(p.progress, 0, race.raceLen) / 1000).toFixed(1);
    if (L.km !== km) { L.km = km; this.dist.textContent = `${km} / ${this.raceKm} KM`; }
    const fr = (c) => clamp(c.progress / race.raceLen, 0, 1) * 100;
    this.progFill.style.width = fr(p).toFixed(1) + '%';
    race.cars.forEach((c, k) => { const d = this.progDots.children[k]; if (d) d.style.left = fr(c).toFixed(1) + '%'; });
    const t = Math.max(0, race.time);
    this.timeEl.textContent = formatTime(t);
    if (race.time > 8 && this.help.style.opacity !== '0') this.help.style.opacity = 0;

    // leaderboard
    if (race.order) {
      const items = this.board.children;
      race.order.forEach((c, i) => {
        const li = items[i];
        if (!li) return;
        const key = c.name;
        if (li._k !== key) {
          li._k = key;
          li.children[0].textContent = i + 1;
          li.children[1].textContent = c.name;
          li.classList.toggle('me', c === p);
        }
      });
    }

    // speedometer
    const kmh = Math.round(p.speed * 3.6);
    if (L.kmh !== kmh) { L.kmh = kmh; this.speed.textContent = kmh; }
    const sf = clamp(p.speed / 95, 0, 1);
    const sfr = Math.round(sf * 200);
    if (L.sf !== sfr) { L.sf = sfr; this.spArc.setAttribute('d', sf > 0.005 ? arcPath(100, 100, 74, SP0, SP0 + (SP1 - SP0) * sf) : ''); }
    const nf = clamp(p.nitro / p.stats.nitroCap, 0, 1);
    const nfr = Math.round(nf * 200);
    if (L.nf !== nfr) { L.nf = nfr; this.niArc.setAttribute('d', nf > 0.005 ? arcPath(100, 100, 92, NI0, NI0 + (NI1 - NI0) * nf) : ''); }
    const ready = nf > 0.3;
    if (L.ready !== ready) { L.ready = ready; this.niLbl.classList.toggle('ready', ready); }
    const boost = p.boosting;
    if (L.boost !== boost) { L.boost = boost; this.speedo.classList.toggle('boost', boost); }
    const slip = p.slipstream > 0.5;
    if (L.slip !== slip) { L.slip = slip; this.slip.classList.toggle('on', slip); }

    // speed lines
    const sl = clamp((p.speed - 42) / 30, 0, 1) * 0.35 + (boost ? 0.35 : 0);
    const slr = Math.round(sl * 50) / 50;
    if (L.sl !== slr) { L.sl = slr; this.speedlines.style.opacity = slr; }

    // minimap
    const m = this.mapCtx;
    m.clearRect(0, 0, 180, 180);
    m.drawImage(this.mapBase, 0, 0);
    for (const c of race.cars) {
      if (c === p) continue;
      m.fillStyle = '#ffb347';
      m.beginPath(); m.arc(this.mx(c.pos.x), this.mz(c.pos.z), 4, 0, 7); m.fill();
    }
    const px = this.mx(p.pos.x), pz = this.mz(p.pos.z);
    m.save();
    m.translate(px, pz);
    m.rotate(-p.heading);
    m.fillStyle = '#5ef2ff';
    m.strokeStyle = '#000';
    m.lineWidth = 1.5;
    m.beginPath(); m.moveTo(0, -8); m.lineTo(6, 6); m.lineTo(0, 3); m.lineTo(-6, 6); m.closePath();
    m.fill(); m.stroke();
    m.restore();
  }
}
