import * as THREE from 'three';
import { Noise2D, smoothstep, clamp } from '../core/util.js';
import { detailTexture, noiseTexture } from './textures.js';

// Height-field terrain that bends itself around the race track:
// it is cut down under the road, filled up to meet it (embankments),
// and turns into hills/mountains further away.
export class Terrain {
  constructor(path, theme, seed, quality) {
    this.path = path;
    this.theme = theme;
    const cfg = theme.terrain;
    this.cfg = cfg;
    const b = path.bounds(cfg ? 420 : 300);
    this.minX = b.minX; this.minZ = b.minZ;
    const ex = b.maxX - b.minX, ez = b.maxZ - b.minZ;
    const res = quality === 'low' ? 110 : 160;
    this.cell = Math.max(ex, ez) / res;
    this.nx = Math.ceil(ex / this.cell) + 1;
    this.nz = Math.ceil(ez / this.cell) + 1;
    this.heights = new Float32Array(this.nx * this.nz);
    this.dist = new Float32Array(this.nx * this.nz);
    this.noise = new Noise2D(seed);
    this.group = new THREE.Group();
    this._compute();
    if (cfg) this._buildMesh();
    if (cfg && cfg.waterLevel !== undefined) this._buildWater();
  }

  _compute() {
    const p = this.path, cfg = this.cfg;
    const step = 3;
    const sx = [], sz = [], sy = [], sb = [];
    for (let i = 0; i < p.N; i += step) {
      if (p.gap[i]) continue;
      sx.push(p.px[i]); sz.push(p.pz[i]); sy.push(p.py[i]); sb.push(p.bridge[i]);
    }
    // Gaps get a deep ravine under them.
    const gx = [], gz = [], gy = [];
    for (let i = 0; i < p.N; i += 2) if (p.gap[i]) { gx.push(p.px[i]); gz.push(p.pz[i]); gy.push(p.py[i]); }

    const n = sx.length;
    const inner = p.wallDist + 3;
    const k = 0.6;
    const cx = (this.minX + this.nx * this.cell / 2), cz = (this.minZ + this.nz * this.cell / 2);
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const x = this.minX + i * this.cell, z = this.minZ + j * this.cell;
        let dMin = Infinity, cut = Infinity, fill = -Infinity, nearY = 0;
        for (let s = 0; s < n; s++) {
          const dx = x - sx[s], dz = z - sz[s];
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d < dMin) { dMin = d; nearY = sy[s]; }
          const off = Math.max(0, d - inner) * k;
          const c = sy[s] - 0.5 + off;
          if (c < cut) cut = c;
          if (!sb[s]) {
            const f = sy[s] - 0.5 - off;
            if (f > fill) fill = f;
          }
        }
        let h = -1000;
        if (cfg) {
          const far = smoothstep(40, 420, dMin);
          let nh = this.noise.fbm(x * cfg.freq, z * cfg.freq, 4) * cfg.amp * (0.35 + far * 1.4);
          if (cfg.terrace) nh = Math.round(nh / cfg.terrace) * cfg.terrace + (nh % cfg.terrace) * 0.25;
          nh += cfg.base + (x - cx) * cfg.tilt[0] + (z - cz) * cfg.tilt[1];
          if (cfg.flat) nh = cfg.base;
          // blend toward the road height near the road so it sits naturally
          const near = 1 - smoothstep(inner, inner + 60, dMin);
          nh = nh * (1 - near) + (nearY - 0.6) * near;
          h = Math.min(Math.max(nh, fill), cut);
          for (let g = 0; g < gx.length; g++) {
            const d = Math.hypot(x - gx[g], z - gz[g]);
            if (d < 70) h = Math.min(h, gy[g] - 40 + d * 0.45);
          }
        }
        this.heights[j * this.nx + i] = h;
        this.dist[j * this.nx + i] = dMin;
      }
    }
    let mn = Infinity, mx = -Infinity;
    for (const h of this.heights) { if (h < mn) mn = h; if (h > mx) mx = h; }
    this.hMin = mn; this.hMax = mx;
  }

  _buildMesh() {
    const { nx, nz, cell, cfg } = this;
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    const pal = cfg.palette.map((c) => new THREE.Color(c));
    const tmp = new THREE.Color();
    const range = Math.max(1, this.hMax - this.hMin);
    const water = cfg.waterLevel ?? -Infinity;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const id = j * nx + i;
        const h = this.heights[id];
        pos[id * 3] = this.minX + i * cell;
        pos[id * 3 + 1] = h;
        pos[id * 3 + 2] = this.minZ + j * cell;
        uv[id * 2] = i * cell / 9;
        uv[id * 2 + 1] = j * cell / 9;
        // slope from neighbours
        const hl = this.heights[j * nx + Math.max(0, i - 1)], hr = this.heights[j * nx + Math.min(nx - 1, i + 1)];
        const hd = this.heights[Math.max(0, j - 1) * nx + i], hu = this.heights[Math.min(nz - 1, j + 1) * nx + i];
        const slope = Math.hypot(hr - hl, hu - hd) / (2 * cell);
        let t = clamp((h - this.hMin) / range, 0, 1);
        if (h < water + 1.5) t = 0;
        else t = 0.15 + t * 0.85;
        const f = t * 3;
        const a = Math.min(3, Math.floor(f));
        tmp.copy(pal[a]).lerp(pal[Math.min(3, a + 1)], f - a);
        tmp.lerp(pal[4], smoothstep(0.45, 1.0, slope));
        const v = 0.92 + this.noise.noise(i * 0.35, j * 0.35) * 0.1;
        col[id * 3] = tmp.r * v; col[id * 3 + 1] = tmp.g * v; col[id * 3 + 2] = tmp.b * v;
      }
    }
    const idx = [];
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: detailTexture(),
      roughness: this.theme.road.icy ? 0.4 : 0.95,
      metalness: 0,
      flatShading: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  _buildWater() {
    const cfg = this.cfg;
    const size = Math.max(this.nx, this.nz) * this.cell * 3;
    const geo = new THREE.PlaneGeometry(size, size);
    geo.rotateX(-Math.PI / 2);
    let mat;
    if (cfg.lava) {
      const t = noiseTexture('#ff5a0a', 21, 60);
      t.repeat.set(size / 40, size / 40);
      mat = new THREE.MeshBasicMaterial({ color: '#ff6a1a', map: t });
      this.lavaTex = t;
    } else {
      mat = new THREE.MeshStandardMaterial({ color: cfg.water, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.9 });
    }
    const m = new THREE.Mesh(geo, mat);
    m.position.set(this.minX + this.nx * this.cell / 2, cfg.waterLevel, this.minZ + this.nz * this.cell / 2);
    m.receiveShadow = !cfg.lava;
    this.water = m;
    this.group.add(m);
  }

  _sample(arr, x, z) {
    const fx = (x - this.minX) / this.cell, fz = (z - this.minZ) / this.cell;
    const i = clamp(Math.floor(fx), 0, this.nx - 2), j = clamp(Math.floor(fz), 0, this.nz - 2);
    const u = clamp(fx - i, 0, 1), v = clamp(fz - j, 0, 1);
    const a = arr[j * this.nx + i], b = arr[j * this.nx + i + 1];
    const c = arr[(j + 1) * this.nx + i], d = arr[(j + 1) * this.nx + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  heightAt(x, z) { return this.cfg ? this._sample(this.heights, x, z) : -1000; }
  roadDist(x, z) { return this._sample(this.dist, x, z); }
  inBounds(x, z) {
    return x > this.minX && z > this.minZ && x < this.minX + (this.nx - 1) * this.cell && z < this.minZ + (this.nz - 1) * this.cell;
  }
  get extent() {
    return { minX: this.minX, minZ: this.minZ, maxX: this.minX + (this.nx - 1) * this.cell, maxZ: this.minZ + (this.nz - 1) * this.cell };
  }

  update(dt) {
    if (this.lavaTex) { this.lavaTex.offset.x += dt * 0.01; this.lavaTex.offset.y += dt * 0.006; }
  }
}
