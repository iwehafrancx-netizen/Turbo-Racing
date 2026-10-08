import * as THREE from 'three';
import { clamp, wrapAngle } from '../core/util.js';

const SPACING = 2; // metres between samples
export const START_S = 60; // start line distance from the beginning of the course
export const RUNOFF = 170; // road left after the finish line for braking

// A point-to-point race course sampled at even spacing. Everything that needs
// to know "where am I on the track" (physics, AI, progress, meshes) uses this.
export class TrackPath {
  constructor(def) {
    this.def = def;
    this.halfWidth = def.width;
    this.shoulder = def.shoulder;
    this.wallDist = def.width + def.shoulder;
    this.grip = def.grip ?? 1;

    const course = def.course;
    // Each leg is its own spline; legs are joined end-to-start by warp portals.
    const xs = [], ys = [], zs = [];
    this.legStart = []; this.legEnd = [];
    for (const leg of course.legs) {
      const curve = new THREE.CatmullRomCurve3(leg.map(([x, z, y]) => new THREE.Vector3(x, y, z)), false, 'centripetal');
      const n = Math.max(2, Math.round(curve.getLength() / SPACING));
      this.legStart.push(xs.length);
      for (const p of curve.getSpacedPoints(n)) { xs.push(p.x); ys.push(p.y); zs.push(p.z); }
      this.legEnd.push(xs.length - 1);
    }
    const N = xs.length;
    this.N = N;
    this.spacing = SPACING;
    this.length = (N - 1) * SPACING;
    this.sScale = this.length / course.length;
    this.startS = START_S;
    this.finishS = this.length - RUNOFF;
    // which leg each sample belongs to (neighbour lookups never cross a warp)
    this.lo = new Int32Array(N); this.hi = new Int32Array(N);
    this.brk = new Uint8Array(N);
    this.legStart.forEach((a, k) => {
      for (let i = a; i <= this.legEnd[k]; i++) { this.lo[i] = a; this.hi[i] = this.legEnd[k]; }
      if (k < this.legStart.length - 1) this.brk[this.legEnd[k]] = 1;
    });
    // portals: drive in near the end of one leg, come out at the start of the next
    this.portals = [];
    for (let k = 0; k < this.legStart.length - 1; k++) {
      this.portals.push({ idx: this.legEnd[k] - 5, exit: this.legStart[k + 1], to: this.legStart[k + 1] + 3 });
    }

    this.px = new Float32Array(N); this.py = new Float32Array(N); this.pz = new Float32Array(N);
    this.tx = new Float32Array(N); this.ty = new Float32Array(N); this.tz = new Float32Array(N);
    this.rx = new Float32Array(N); this.rz = new Float32Array(N);
    this.heading = new Float32Array(N);
    this.curv = new Float32Array(N);
    this.bank = new Float32Array(N);
    this.gap = new Uint8Array(N);
    this.open = new Uint8Array(N);
    this.bridge = new Uint8Array(N);
    this.safeSpeed = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      this.px[i] = xs[i]; this.py[i] = ys[i]; this.pz[i] = zs[i];
    }
    const F = course.features;
    // rollercoaster hills: smooth bumps that launch you at speed
    for (const r of F.rollers) {
      const i0 = this.idxAtS(r.s0), i1 = this.idxAtS(r.s1);
      const bumps = Math.max(1, Math.round(((i1 - i0) * this.spacing) / r.len));
      const L = (i1 - i0) / bumps;
      for (let i = i0; i <= i1; i++) this.py[i] += r.amp * (1 - Math.cos(((i - i0) / L) * Math.PI * 2)) * 0.5;
    }
    // smooth elevation a little so crests don't kink
    const at = (arr, i, c) => arr[clamp(i, this.lo[c], this.hi[c])];
    for (let pass = 0; pass < 3; pass++) {
      const y = Float32Array.from(this.py);
      for (let i = 0; i < N; i++) this.py[i] = (at(y, i - 2, i) + at(y, i - 1, i) + y[i] + at(y, i + 1, i) + at(y, i + 2, i)) / 5;
    }
    for (let i = 0; i < N; i++) {
      const a = Math.max(this.lo[i], i - 1), b = Math.min(this.hi[i], i + 1);
      const dx = this.px[b] - this.px[a], dy = this.py[b] - this.py[a], dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dy, dz) || 1;
      this.tx[i] = dx / l; this.ty[i] = dy / l; this.tz[i] = dz / l;
      const lh = Math.hypot(dx, dz) || 1;
      // right = forward x up
      this.rx[i] = -dz / lh; this.rz[i] = dx / lh;
      this.heading[i] = Math.atan2(dx, dz);
    }
    // signed curvature (negative = right-hander), smoothed
    const raw = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.max(this.lo[i], i - 2), b = Math.min(this.hi[i], i + 2);
      raw[i] = b > a ? wrapAngle(this.heading[b] - this.heading[a]) / ((b - a) * this.spacing) : 0;
    }
    const W = 6;
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = -W; k <= W; k++) s += at(raw, i + k, i);
      this.curv[i] = s / (2 * W + 1);
    }
    const bankK = def.bank ?? 0.45;
    for (let i = 0; i < N; i++) this.bank[i] = clamp(this.curv[i] * 18 * bankK, -0.3, 0.3);

    this.gapList = [];
    for (const g of F.gaps) {
      const i0 = this.idxAtS(g.s), n = Math.ceil(g.len / this.spacing);
      for (let k = 0; k < n; k++) this.gap[this.wrap(i0 + k)] = 1;
      this.gapList.push({ i0, i1: this.wrap(i0 + n) });
    }
    for (const o of F.open) for (let i = this.idxAtS(o.s0); i <= this.idxAtS(o.s1); i++) this.open[i] = 1;
    this._markBridges();
    this._computeSafeSpeed();
    this._buildFeatures(F);
  }

  idxAtS(s) { return clamp(Math.round((s * this.sScale) / this.spacing), 0, this.N - 1); }
  idxAtU(u) { return clamp(Math.round(u * (this.N - 1)), 0, this.N - 1); }
  // Open course: indices clamp at the ends instead of wrapping around.
  wrap(i) { return i < 0 ? 0 : i >= this.N ? this.N - 1 : i; }

  // Where the course passes over itself, flag the higher pass as a bridge.
  _markBridges() {
    const N = this.N, step = 2;
    const clear = this.wallDist * 2 + 6;
    this.crossings = [];
    for (let i = 0; i < N; i += step) {
      for (let j = i + 40; j < N; j += step) {
        const dx = this.px[i] - this.px[j], dz = this.pz[i] - this.pz[j];
        if (dx * dx + dz * dz < clear * clear) {
          const hi = this.py[i] > this.py[j] ? i : j;
          for (let k = -20; k <= 20; k++) this.bridge[this.wrap(hi + k)] = 1;
          this.crossings.push([i, j]);
        }
      }
    }
  }

  _computeSafeSpeed() {
    const N = this.N;
    const latG = 30 * this.grip;
    for (let i = 0; i < N; i++) {
      const c = Math.abs(this.curv[i]);
      this.safeSpeed[i] = c > 1e-4 ? Math.min(120, Math.sqrt(latG / c)) : 120;
    }
    // stop at the very end of the runoff
    this.safeSpeed[N - 1] = 0;
    // never brake for a jump: carry speed over gaps
    for (const g of this.gapList) for (let k = -60; k < 20; k++) this.safeSpeed[this.wrap(g.i0 + k)] = 120;
    // braking pass: you must be able to slow down for what's coming
    const brake = 20;
    for (let i = N - 2; i >= 0; i--) {
      const lim = Math.sqrt(this.safeSpeed[i + 1] ** 2 + 2 * brake * this.spacing);
      if (lim < this.safeSpeed[i]) this.safeSpeed[i] = lim;
    }
  }

  _buildFeatures(F) {
    this.boosts = F.boosts.map((b) => ({ i: this.idxAtS(b.s), lat: b.lat, len: 7, w: 4.2 }));
    this.ramps = F.ramps.map((r) => ({ i: this.idxAtS(r.s), l0: r.lat[0], l1: r.lat[1], len: 12, h: 2.2, gapRamp: false }));
    for (const g of this.gapList) {
      const len = 14;
      this.ramps.push({ i: this.wrap(g.i0 - Math.round(len / this.spacing)), l0: -this.wallDist, l1: this.wallDist, len, h: 3.2, gapRamp: true });
    }
    this.obstacles = F.obstacles.map((o) => ({ ...o, i: this.idxAtS(o.s) }));
    // coin trails between the start and the finish, away from jumps & hazards
    this.coins = [];
    const every = 130;
    for (let s = this.startS + 90, c = 0; s < this.finishS - 40; s += every, c++) {
      const i0 = Math.round(s / this.spacing);
      if (this._nearFeature(i0, 30)) continue;
      const pattern = c % 3;
      for (let k = 0; k < 5; k++) {
        const i = this.wrap(i0 + k * 3);
        let lat;
        if (pattern === 0) lat = 0;
        else if (pattern === 1) lat = (k - 2) * this.halfWidth * 0.3;
        else lat = Math.sin(k * 0.9) * this.halfWidth * 0.55;
        this.coins.push({ i, lat });
      }
    }
  }

  _nearFeature(i, range) {
    const near = (j) => Math.abs(i - j) < range;
    for (const g of this.gapList) if (near(g.i0)) return true;
    for (const r of this.ramps) if (near(r.i)) return true;
    for (const b of this.boosts) if (near(b.i)) return true;
    for (const o of this.obstacles) if (near(o.i)) return true;
    for (const p of this.portals) if (near(p.idx) || near(p.exit)) return true;
    return false;
  }

  // Find the nearest sample to (x,y,z), searching near `hint`.
  // Returns into `out`: idx, f, lat, s (distance along the course), over
  // (how far past either end of the course the point lies).
  project(x, y, z, hint, out, window = 30) {
    const N = this.N;
    let best = hint, bestD = Infinity;
    const k0 = Math.max(this.lo[hint], hint - window), k1 = Math.min(this.hi[hint], hint + window);
    for (let i = k0; i <= k1; i++) {
      const dx = x - this.px[i], dz = z - this.pz[i], dy = (y - this.py[i]) * 0.5;
      const d = dx * dx + dz * dz + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    let i = best;
    let dx = x - this.px[i], dz = z - this.pz[i];
    const hl = Math.hypot(this.tx[i], this.tz[i]) || 1;
    let along = (dx * this.tx[i] + dz * this.tz[i]) / hl;
    out.over = 0;
    const lo = this.lo[i], hi = this.hi[i];
    if (along < 0 && i > lo) {
      i--;
      dx = x - this.px[i]; dz = z - this.pz[i];
      along = (dx * this.tx[i] + dz * this.tz[i]) / (Math.hypot(this.tx[i], this.tz[i]) || 1);
    } else if (along < 0) out.over = along;
    if (i >= hi) { i = hi - 1; along = this.spacing + Math.max(0, along); }
    if (i === hi - 1 && along > this.spacing) out.over = along - this.spacing;
    out.end = out.over < 0 ? lo : hi;
    const f = clamp(along / this.spacing, 0, 1);
    const j = i + 1;
    const rx = this.rx[i] + (this.rx[j] - this.rx[i]) * f;
    const rz = this.rz[i] + (this.rz[j] - this.rz[i]) * f;
    const cx = this.px[i] + (this.px[j] - this.px[i]) * f;
    const cz = this.pz[i] + (this.pz[j] - this.pz[i]) * f;
    out.idx = i;
    out.f = f;
    out.lat = (x - cx) * rx + (z - cz) * rz;
    out.s = (i + f) * this.spacing;
    return out;
  }

  // Surface height at a projected location (ignores gaps; see groundAt).
  surfaceY(idx, f, lat) {
    const j = Math.min(this.hi[idx], idx + 1);
    const y = this.py[idx] + (this.py[j] - this.py[idx]) * f;
    const b = this.bank[idx] + (this.bank[j] - this.bank[idx]) * f;
    return y + lat * Math.tan(b);
  }

  rampHeight(idx, f, lat) {
    for (const r of this.ramps) {
      const d = idx - r.i + f;
      const len = r.len / this.spacing;
      if (d >= 0 && d < len && lat >= r.l0 && lat <= r.l1) return (d / len) * r.h;
    }
    return 0;
  }

  // Ground height under a point, or -Infinity over a gap / off an open edge.
  groundAt(p) {
    if (this.gap[p.idx]) return -Infinity;
    // no guard rails here: drive past the edge and you drop into the sky
    if (this.open[p.idx] && Math.abs(p.lat) > this.wallDist + 0.6) return -Infinity;
    return this.surfaceY(p.idx, p.f, p.lat) + this.rampHeight(p.idx, p.f, p.lat);
  }

  // World position on the road surface at sample i with lateral offset.
  pointAt(i, lat, target = new THREE.Vector3()) {
    i = this.wrap(i);
    return target.set(this.px[i] + this.rx[i] * lat, this.surfaceY(i, 0, lat), this.pz[i] + this.rz[i] * lat);
  }

  // Road surface normal at sample i (accounts for slope + banking).
  upAt(i, target = new THREE.Vector3()) {
    const b = this.bank[i];
    const R = new THREE.Vector3(this.rx[i] * Math.cos(b), Math.sin(b), this.rz[i] * Math.cos(b));
    const T = new THREE.Vector3(this.tx[i], this.ty[i], this.tz[i]);
    return target.crossVectors(R, T).normalize();
  }

  bounds(margin = 0) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < this.N; i++) {
      minX = Math.min(minX, this.px[i]); maxX = Math.max(maxX, this.px[i]);
      minZ = Math.min(minZ, this.pz[i]); maxZ = Math.max(maxZ, this.pz[i]);
      minY = Math.min(minY, this.py[i]); maxY = Math.max(maxY, this.py[i]);
    }
    return { minX: minX - margin, maxX: maxX + margin, minZ: minZ - margin, maxZ: maxZ + margin, minY, maxY };
  }
}
