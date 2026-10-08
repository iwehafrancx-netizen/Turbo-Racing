import * as THREE from 'three';
import { clamp, wrapAngle } from '../core/util.js';

const SPACING = 2; // metres between samples

// A closed race line sampled at even spacing. Everything that needs to know
// "where am I on the track" (physics, AI, laps, meshes) goes through this.
export class TrackPath {
  constructor(def) {
    this.def = def;
    this.halfWidth = def.width;
    this.shoulder = def.shoulder;
    this.wallDist = def.width + def.shoulder;
    this.grip = def.grip ?? 1;

    const pts = def.points.map(([x, z, y]) => new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const total = curve.getLength();
    const N = Math.round(total / SPACING);
    const sp = curve.getSpacedPoints(N);
    this.N = N;
    this.length = total;
    this.spacing = total / N;

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
      this.px[i] = sp[i].x; this.py[i] = sp[i].y; this.pz[i] = sp[i].z;
    }
    // rollercoaster hills: smooth bumps that launch you at speed
    for (const r of def.rollers || []) {
      const i0 = Math.round(r.u0 * N), i1 = Math.round(r.u1 * N);
      const bumps = Math.max(1, Math.round(((i1 - i0) * this.spacing) / r.len));
      const L = (i1 - i0) / bumps;
      for (let i = i0; i <= i1; i++) {
        this.py[((i % N) + N) % N] += r.amp * (1 - Math.cos(((i - i0) / L) * Math.PI * 2)) * 0.5;
      }
    }
    // Smooth elevation a little so crests don't kink.
    for (let pass = 0; pass < 3; pass++) {
      const y = Float32Array.from(this.py);
      for (let i = 0; i < N; i++) {
        this.py[i] = (y[(i - 2 + N) % N] + y[(i - 1 + N) % N] + y[i] + y[(i + 1) % N] + y[(i + 2) % N]) / 5;
      }
    }
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      let dx = this.px[b] - this.px[a], dy = this.py[b] - this.py[a], dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dy, dz) || 1;
      this.tx[i] = dx / l; this.ty[i] = dy / l; this.tz[i] = dz / l;
      const lh = Math.hypot(dx, dz) || 1;
      // right = forward x up
      this.rx[i] = -dz / lh; this.rz[i] = dx / lh;
      this.heading[i] = Math.atan2(dx, dz);
    }
    // Signed curvature (negative = right-hander), smoothed.
    const raw = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 2 + N) % N, b = (i + 2) % N;
      raw[i] = wrapAngle(this.heading[b] - this.heading[a]) / (4 * this.spacing);
    }
    const W = 6;
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = -W; k <= W; k++) s += raw[(i + k + N) % N];
      this.curv[i] = s / (2 * W + 1);
    }
    const bankK = def.bank ?? 0.35;
    for (let i = 0; i < N; i++) this.bank[i] = clamp(this.curv[i] * 18 * bankK, -0.3, 0.3);

    this._markGaps();
    for (const [u0, u1] of def.open || []) {
      for (let i = Math.round(u0 * N); i <= Math.round(u1 * N); i++) this.open[((i % N) + N) % N] = 1;
    }
    this._markBridges();
    this._computeSafeSpeed();
    this._buildFeatures();
  }

  idxAtU(u) {
    return ((Math.round(u * this.N) % this.N) + this.N) % this.N;
  }
  wrap(i) {
    return ((i % this.N) + this.N) % this.N;
  }

  _markGaps() {
    this.gapList = [];
    for (const g of this.def.gaps || []) {
      const i0 = this.idxAtU(g.u);
      const n = Math.ceil(g.len / this.spacing);
      for (let k = 0; k < n; k++) this.gap[this.wrap(i0 + k)] = 1;
      this.gapList.push({ i0, i1: this.wrap(i0 + n) });
    }
  }

  // Where the track passes over itself, flag the higher pass as a bridge
  // (no terrain fill under it, pillars instead).
  _markBridges() {
    const N = this.N, step = 2;
    const clear = this.wallDist * 2 + 6;
    this.crossings = [];
    for (let i = 0; i < N; i += step) {
      for (let j = i + 40; j < N; j += step) {
        if (N - (j - i) < 40) continue;
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
    // Braking pass: you must be able to slow down for what's coming.
    const brake = 20;
    for (let pass = 0; pass < 2; pass++) {
      for (let k = N - 1; k >= 0; k--) {
        const i = k, n = (k + 1) % N;
        const lim = Math.sqrt(this.safeSpeed[n] ** 2 + 2 * brake * this.spacing);
        if (lim < this.safeSpeed[i]) this.safeSpeed[i] = lim;
      }
    }
    // Never brake for a jump — carry speed over gaps.
    for (const g of this.gapList) {
      for (let k = -60; k < 20; k++) this.safeSpeed[this.wrap(g.i0 + k)] = 120;
    }
  }

  _buildFeatures() {
    const d = this.def;
    this.boosts = (d.boosts || []).map((b) => ({ i: this.idxAtU(b.u), lat: b.lat, len: 7, w: 4.2 }));
    this.ramps = [];
    for (const r of d.ramps || []) {
      this.ramps.push({ i: this.idxAtU(r.u), l0: r.lat[0], l1: r.lat[1], len: 12, h: 2.2, gapRamp: false });
    }
    for (const g of this.gapList) {
      const len = 14;
      this.ramps.push({ i: this.wrap(g.i0 - Math.round(len / this.spacing)), l0: -this.wallDist, l1: this.wallDist, len, h: 3.2, gapRamp: true });
    }
    // Coin lines spread around the lap, avoiding the start and the jumps.
    this.coins = [];
    const every = 150;
    const count = Math.floor(this.length / every);
    for (let c = 1; c < count; c++) {
      const i0 = Math.round((c * every) / this.spacing);
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
    const near = (j) => {
      const d = Math.abs(i - j);
      return Math.min(d, this.N - d) < range;
    };
    if (near(0)) return true;
    for (const g of this.gapList) if (near(g.i0)) return true;
    for (const r of this.ramps) if (near(r.i)) return true;
    for (const b of this.boosts) if (near(b.i)) return true;
    return false;
  }

  // Find the nearest sample to (x,y,z), searching near `hint`.
  // Returns into `out`: idx, f, lat, s (distance along lap)
  project(x, y, z, hint, out, window = 30) {
    const N = this.N;
    let best = hint, bestD = Infinity;
    for (let k = -window; k <= window; k++) {
      const i = (hint + k + N) % N;
      const dx = x - this.px[i], dz = z - this.pz[i], dy = (y - this.py[i]) * 0.5;
      const d = dx * dx + dz * dz + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    let i = best;
    let dx = x - this.px[i], dz = z - this.pz[i];
    const thx = this.tx[i], thz = this.tz[i];
    const hl = Math.hypot(thx, thz) || 1;
    let along = (dx * thx + dz * thz) / hl;
    if (along < 0) {
      i = (i - 1 + N) % N;
      dx = x - this.px[i]; dz = z - this.pz[i];
      along = (dx * this.tx[i] + dz * this.tz[i]) / (Math.hypot(this.tx[i], this.tz[i]) || 1);
    }
    const f = clamp(along / this.spacing, 0, 1);
    const j = (i + 1) % N;
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
    const j = (idx + 1) % this.N;
    const y = this.py[idx] + (this.py[j] - this.py[idx]) * f;
    const b = this.bank[idx] + (this.bank[j] - this.bank[idx]) * f;
    return y + lat * Math.tan(b);
  }

  rampHeight(idx, f, lat) {
    for (const r of this.ramps) {
      let d = (idx - r.i + this.N) % this.N + f;
      const len = r.len / this.spacing;
      if (d >= 0 && d < len && lat >= r.l0 && lat <= r.l1) return (d / len) * r.h;
    }
    return 0;
  }

  // Ground height under a point, or -Infinity over a gap.
  groundAt(p) {
    if (this.gap[p.idx]) return -Infinity;
    // no guard rails here: drive past the edge and you drop into the clouds
    if (this.open[p.idx] && Math.abs(p.lat) > this.wallDist + 0.6) return -Infinity;
    return this.surfaceY(p.idx, p.f, p.lat) + this.rampHeight(p.idx, p.f, p.lat);
  }

  // World position on the road surface at sample i with lateral offset.
  pointAt(i, lat, target = new THREE.Vector3()) {
    i = this.wrap(i);
    return target.set(
      this.px[i] + this.rx[i] * lat,
      this.surfaceY(i, 0, lat),
      this.pz[i] + this.rz[i] * lat,
    );
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
