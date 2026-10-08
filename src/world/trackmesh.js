import * as THREE from 'three';
import { roadTexture, noiseTexture, wallTexture, checkerTexture, boostTexture, rampTexture, bannerTexture, coinTexture } from './textures.js';

const OVERHEAD = {
  sunrise: { type: 'banner', every: 420 },
  city: { type: 'neonArch', every: 140 },
  canyon: { type: 'banner', every: 600 },
  snow: { type: 'banner', every: 500 },
  jungle: { type: 'stoneGate', every: 260 },
  volcano: { type: 'neonArch', every: 320 },
  harbor: { type: 'banner', every: 480 },
  glacier: { type: 'neonArch', every: 300 },
  storm: { type: 'ring', every: 220 },
  space: { type: 'ring', every: 160 },
};

// Build a triangle strip along the track. `section(i)` returns the cross
// section for sample i as [[x,y,z,u], ...]. Quads over gaps are skipped.
function strip(path, section, vScale, { skipGap = true, skipOpen = false, from = 0, count = path.N, closed = true } = {}) {
  const pos = [], uv = [], idx = [];
  let M = 0;
  const rows = closed ? count + 1 : count;
  for (let r = 0; r < rows; r++) {
    const i = path.wrap(from + r);
    const sec = section(i, r);
    M = sec.length;
    const v = ((from + r) * path.spacing) / vScale;
    for (const [x, y, z, u, vv] of sec) {
      pos.push(x, y, z);
      uv.push(u, vv ?? v);
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    const i = path.wrap(from + r);
    if (skipGap && path.gap[i]) continue;
    if (skipOpen && (path.open[i] || path.open[path.wrap(i + 1)])) continue;
    for (let m = 0; m < M - 1; m++) {
      const a = r * M + m, b = a + 1, c = a + M, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class TrackMesh {
  constructor(path, theme, themeKey, terrain) {
    this.path = path;
    this.theme = theme;
    this.themeKey = themeKey;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.animated = [];
    this._road();
    this._walls();
    this._slab();
    this._pillars();
    this._edgeLights();
    this._start();
    this._boosts();
    this._ramps();
    this._coins();
    this._overheads();
  }

  _pt(i, lat, yAdd = 0) {
    const p = this.path;
    return [p.px[i] + p.rx[i] * lat, p.surfaceY(i, 0, lat) + yAdd, p.pz[i] + p.rz[i] * lat];
  }

  _road() {
    const p = this.path, W = p.halfWidth, S = p.shoulder, road = this.theme.road;
    const geo = strip(p, (i) => [
      [...this._pt(i, -W), 0],
      [...this._pt(i, W), 1],
    ], 24);
    const map = roadTexture(road);
    const mat = new THREE.MeshStandardMaterial({
      map,
      roughness: road.rough,
      metalness: road.wet || road.icy ? 0.35 : 0.05,
      color: '#ffffff',
    });
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    this.group.add(m);

    if (S > 0.5) {
      const sh = noiseTexture(this.theme.shoulder, 4, 22);
      const smat = new THREE.MeshStandardMaterial({ map: sh, roughness: 0.95 });
      for (const side of [-1, 1]) {
        const g = strip(p, (i) => side < 0
          ? [[...this._pt(i, -W - S, -0.02), 0], [...this._pt(i, -W, -0.02), S / 6]]
          : [[...this._pt(i, W, -0.02), 0], [...this._pt(i, W + S, -0.02), S / 6]], 6);
        const sm = new THREE.Mesh(g, smat);
        sm.receiveShadow = true;
        this.group.add(sm);
      }
    }
  }

  _walls() {
    const p = this.path, wall = this.theme.wall, D = p.wallDist, h = wall.h;
    const mat = new THREE.MeshStandardMaterial({
      map: wallTexture(wall),
      roughness: wall.ice ? 0.2 : 0.7,
      metalness: wall.style === 'rail' ? 0.5 : 0.05,
      side: THREE.DoubleSide,
      transparent: !!wall.ice,
      opacity: wall.ice ? 0.75 : 1,
    });
    for (const side of [-1, 1]) {
      const g = strip(p, (i) => [
        [...this._pt(i, side * D, -0.3), 0, 0],
        [...this._pt(i, side * D, h), 0, 1],
      ].map((v, k) => { v[3] = (i * p.spacing) / 8; v[4] = k; return v; }), 8, { skipOpen: true });
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      if (wall.glow) {
        const gmat = new THREE.MeshBasicMaterial({ color: side < 0 ? wall.glow : wall.glow2 || wall.glow, toneMapped: false });
        const gg = strip(p, (i) => [
          [...this._pt(i, side * (D + 0.18), h), 0],
          [...this._pt(i, side * (D - 0.18), h), 1],
        ], 8, { skipOpen: true });
        this.group.add(new THREE.Mesh(gg, gmat));
        if (this.theme.night || wall.style === 'rail') {
          const eg = strip(p, (i) => [
            [...this._pt(i, side * (p.halfWidth + 0.15), 0.03), 0],
            [...this._pt(i, side * (p.halfWidth - 0.15), 0.03), 1],
          ], 8);
          const em = new THREE.MeshBasicMaterial({ color: side < 0 ? wall.glow : wall.glow2 || wall.glow, toneMapped: false, transparent: true, opacity: 0.8 });
          this.group.add(new THREE.Mesh(eg, em));
        }
      }
    }
  }

  // Thickness under the road so edges never look paper-thin.
  _slab() {
    const p = this.path, D = p.wallDist + 0.05, T = 1.6;
    const mat = new THREE.MeshStandardMaterial({ color: this.theme.terrain ? '#5a5650' : '#2a2f3a', roughness: 0.9, side: THREE.DoubleSide });
    const g = strip(p, (i) => [
      [...this._pt(i, -D, -0.3), 0],
      [...this._pt(i, -D, -T), 0.25],
      [...this._pt(i, D, -T), 0.75],
      [...this._pt(i, D, -0.3), 1],
    ], 10);
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    this.group.add(m);
  }

  _pillars() {
    const p = this.path, t = this.terrain;
    const floating = !this.theme.terrain;
    if (!this.theme.pillars) return this._hoverPods();
    const spots = [];
    for (let i = 0; i < p.N; i += 9) {
      if (p.gap[i]) continue;
      const top = p.py[i] - 1.6;
      const ground = floating ? (this.theme.clouds ? this.theme.clouds.level - 10 : top - 60) : t.heightAt(p.px[i], p.pz[i]);
      if (top - ground > 2.5) spots.push([p.px[i], ground, p.pz[i], top - ground, p.heading[i]]);
    }
    if (!spots.length) return;
    const geo = new THREE.BoxGeometry(2.2, 1, 2.2);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: floating ? '#cbd5e1' : '#8a8378', roughness: 0.8 });
    const im = new THREE.InstancedMesh(geo, mat, spots.length * 2);
    const o = new THREE.Object3D();
    let n = 0;
    for (const [x, y, z, h, hd] of spots) {
      for (const side of [-1, 1]) {
        const rx = Math.cos(hd) * side * (p.halfWidth * 0.6), rz = -Math.sin(hd) * side * (p.halfWidth * 0.6);
        o.position.set(x + rx, y, z + rz);
        o.rotation.set(0, hd, 0);
        o.scale.set(1, h, 1);
        o.updateMatrix();
        im.setMatrixAt(n++, o.matrix);
      }
    }
    im.count = n;
    im.castShadow = true;
    this.group.add(im);
  }

  // Glowing anti-gravity pods under floating roads.
  _hoverPods() {
    const p = this.path, spots = [];
    for (let i = 0; i < p.N; i += 18) if (!p.gap[i]) spots.push(i);
    const col = this.theme.wall.glow || '#7df9ff';
    const body = new THREE.InstancedMesh(new THREE.CylinderGeometry(2.4, 1.2, 1.6, 10), new THREE.MeshStandardMaterial({ color: '#2a2f3a', metalness: 0.7, roughness: 0.35 }), spots.length * 2);
    const glow = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.1, 0.2, 0.6, 10), new THREE.MeshBasicMaterial({ color: col, toneMapped: false }), spots.length * 2);
    const o = new THREE.Object3D();
    let n = 0;
    for (const i of spots) {
      for (const side of [-1, 1]) {
        const [x, y, z] = this._pt(i, side * p.halfWidth * 0.55, -2.3);
        o.position.set(x, y, z);
        o.rotation.set(0, p.heading[i], 0);
        o.updateMatrix();
        body.setMatrixAt(n, o.matrix);
        o.position.y -= 1.1;
        o.updateMatrix();
        glow.setMatrixAt(n++, o.matrix);
      }
    }
    body.count = glow.count = n;
    this.group.add(body, glow);
  }

  // Blinking edge lights where there are no guard rails.
  _edgeLights() {
    const p = this.path, spots = [];
    for (let i = 0; i < p.N; i += 3) if (p.open[i] && !p.gap[i]) spots.push(i);
    if (!spots.length) return;
    const geo = new THREE.BoxGeometry(0.35, 0.25, 0.9);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const im = new THREE.InstancedMesh(geo, mat, spots.length * 2);
    const o = new THREE.Object3D();
    const ca = new THREE.Color('#ff3b3b'), cb = new THREE.Color('#ffd23f');
    let n = 0;
    for (const i of spots) {
      for (const side of [-1, 1]) {
        const [x, y, z] = this._pt(i, side * (p.wallDist - 0.2), 0.12);
        o.position.set(x, y, z);
        o.rotation.set(0, p.heading[i], 0);
        o.updateMatrix();
        im.setMatrixAt(n, o.matrix);
        im.setColorAt(n++, (i / 3) % 2 ? ca : cb);
      }
    }
    this.edgeMesh = im;
    this.group.add(im);
    this.animated.push((t) => { mat.color.setScalar(0.55 + 0.45 * Math.sin(t * 8)); });
  }

  _start() {
    const p = this.path, D = p.wallDist;
    // checkered line
    const g = strip(p, (i) => [
      [...this._pt(i, -p.halfWidth, 0.03), 0],
      [...this._pt(i, p.halfWidth, 0.03), 1],
    ], 4, { from: 0, count: 2, closed: false });
    const cm = new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.8 });
    this.group.add(new THREE.Mesh(g, cm));
    this.group.add(this._gantry(0, 'TURBO RACING', 7.5));
  }

  _gantry(i, text, height) {
    const p = this.path, D = p.wallDist;
    const grp = new THREE.Group();
    const y = p.py[i];
    grp.position.set(p.px[i], y, p.pz[i]);
    grp.rotation.y = p.heading[i];
    const postMat = new THREE.MeshStandardMaterial({ color: '#2b2b33', metalness: 0.6, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, height + 1.6, 0.8), postMat);
      post.position.set(s * (D + 0.8), height / 2 - 0.8, 0);
      post.castShadow = true;
      grp.add(post);
    }
    const accent = this.theme.wall.glow || this.theme.road.curbA;
    const beamMat = new THREE.MeshStandardMaterial({ map: bannerTexture(text, '#101018', '#ffffff', accent), emissive: '#ffffff', emissiveIntensity: this.theme.night ? 0.6 : 0.15 });
    beamMat.emissiveMap = beamMat.map;
    const beam = new THREE.Mesh(new THREE.BoxGeometry((D + 1.2) * 2, 2.4, 0.6), [postMat, postMat, postMat, postMat, beamMat, beamMat]);
    beam.position.y = height;
    beam.castShadow = true;
    grp.add(beam);
    return grp;
  }

  _boosts() {
    const p = this.path;
    const tex = boostTexture();
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true, opacity: 0.95 });
    this.boostTex = tex;
    for (const b of p.boosts) {
      const n = Math.round(b.len / p.spacing);
      const g = strip(p, (i, r) => [
        [...this._pt(i, b.lat - b.w / 2, 0.04), 0, r / n],
        [...this._pt(i, b.lat + b.w / 2, 0.04), 1, r / n],
      ], 1, { from: b.i, count: n + 1, closed: false });
      this.group.add(new THREE.Mesh(g, mat));
    }
  }

  _ramps() {
    const p = this.path;
    const mat = new THREE.MeshStandardMaterial({ map: rampTexture(), roughness: 0.6, side: THREE.DoubleSide });
    for (const r of p.ramps) {
      const n = Math.round(r.len / p.spacing);
      const h = (k) => (k / n) * r.h + 0.02;
      const l0 = Math.max(r.l0, -p.wallDist + 0.2), l1 = Math.min(r.l1, p.wallDist - 0.2);
      const top = strip(p, (i, k) => [
        [...this._pt(i, l0, h(k)), 0, k / 2],
        [...this._pt(i, l1, h(k)), 1, k / 2],
      ], 1, { from: r.i, count: n + 1, closed: false });
      this.group.add(new THREE.Mesh(top, mat));
      // sides + back face
      const sides = strip(p, (i, k) => [
        [...this._pt(i, l0, 0), 0, 0], [...this._pt(i, l0, h(k)), 0, 0.3],
      ], 1, { from: r.i, count: n + 1, closed: false });
      const sides2 = strip(p, (i, k) => [
        [...this._pt(i, l1, 0), 0, 0], [...this._pt(i, l1, h(k)), 0, 0.3],
      ], 1, { from: r.i, count: n + 1, closed: false });
      const e = p.wrap(r.i + n);
      const back = new THREE.BufferGeometry();
      const a = this._pt(e, l0, -0.5), b = this._pt(e, l1, -0.5), c = this._pt(e, l0, h(n)), d = this._pt(e, l1, h(n));
      back.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3));
      back.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 0.3, 1, 0.3], 2));
      back.setIndex([0, 1, 2, 1, 3, 2]);
      back.computeVertexNormals();
      for (const g of [sides, sides2, back]) this.group.add(new THREE.Mesh(g, mat));
      // warning chevrons on the walls before big gap jumps
      if (r.gapRamp) this._gapSigns(r.i);
    }
  }

  _gapSigns(i0) {
    const p = this.path;
    const mat = new THREE.MeshBasicMaterial({ map: bannerTexture('JUMP!', '#111', '#ffd23f', '#ffd23f'), toneMapped: false, side: THREE.DoubleSide });
    for (const k of [-40, -20]) {
      const i = p.wrap(i0 + k);
      for (const s of [-1, 1]) {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.75), mat);
        const [x, y, z] = this._pt(i, s * (p.wallDist + 0.05), this.theme.wall.h + 0.6);
        sign.position.set(x, y, z);
        sign.rotation.y = p.heading[i] + Math.PI / 2;
        this.group.add(sign);
      }
    }
  }

  _coins() {
    const p = this.path;
    const geo = new THREE.CylinderGeometry(0.6, 0.6, 0.12, 24);
    geo.rotateX(Math.PI / 2);
    const face = coinTexture();
    const side = new THREE.MeshStandardMaterial({ color: '#e0a000', metalness: 0.8, roughness: 0.3, emissive: '#ff9900', emissiveIntensity: 0.25 });
    const cap = new THREE.MeshStandardMaterial({ map: face, metalness: 0.5, roughness: 0.35, emissive: '#ffb000', emissiveIntensity: 0.3, emissiveMap: face });
    const im = new THREE.InstancedMesh(geo, [side, cap, cap], p.coins.length);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.coinMesh = im;
    this.coinPos = p.coins.map((c) => {
      const [x, y, z] = this._pt(c.i, c.lat, 1.05);
      return new THREE.Vector3(x, y, z);
    });
    this.coinTaken = new Uint8Array(p.coins.length);
    this.group.add(im);
    this._coinObj = new THREE.Object3D();
    this._updateCoins(0);
  }

  _updateCoins(time) {
    const o = this._coinObj;
    for (let k = 0; k < this.coinPos.length; k++) {
      o.position.copy(this.coinPos[k]);
      o.position.y += Math.sin(time * 3 + k) * 0.15;
      o.rotation.set(0, time * 3 + k * 0.4, 0);
      const s = this.coinTaken[k] ? 0 : 1;
      o.scale.set(s, s, s);
      o.updateMatrix();
      this.coinMesh.setMatrixAt(k, o.matrix);
    }
    this.coinMesh.instanceMatrix.needsUpdate = true;
  }

  resetCoins() {
    this.coinTaken.fill(0);
  }

  _overheads() {
    const p = this.path;
    const spec = OVERHEAD[this.themeKey];
    if (!spec) return;
    const count = Math.floor(p.length / spec.every);
    for (let c = 1; c < count; c++) {
      const i = p.wrap(Math.round((c * spec.every) / p.spacing));
      if (p.gap[i] || p._nearFeature(i, 12)) continue;
      const obj = this._overhead(spec.type, i, c);
      if (obj) this.group.add(obj);
    }
  }

  _overhead(type, i, c) {
    const p = this.path, D = p.wallDist;
    const grp = new THREE.Group();
    grp.position.set(p.px[i], p.py[i], p.pz[i]);
    grp.rotation.y = p.heading[i];
    const glowA = this.theme.wall.glow || '#ff3b6b', glowB = this.theme.wall.glow2 || glowA;
    if (type === 'banner') {
      return this._gantry(i, c % 2 ? 'TURBO' : 'FULL THROTTLE', 7);
    } else if (type === 'neonArch') {
      const t = new THREE.Mesh(
        new THREE.TorusGeometry(D + 1, 0.35, 8, 40, Math.PI),
        new THREE.MeshBasicMaterial({ color: c % 2 ? glowA : glowB, toneMapped: false }),
      );
      grp.add(t);
      const t2 = new THREE.Mesh(
        new THREE.TorusGeometry(D + 1.8, 0.18, 6, 40, Math.PI),
        new THREE.MeshBasicMaterial({ color: c % 2 ? glowB : glowA, toneMapped: false }),
      );
      grp.add(t2);
    } else if (type === 'stoneGate') {
      const m = new THREE.MeshStandardMaterial({ color: '#9a9580', roughness: 1, flatShading: true });
      for (const s of [-1, 1]) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(2.2, 10, 2.2), m);
        col.position.set(s * (D + 1.4), 4.5, 0);
        col.castShadow = true;
        grp.add(col);
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry((D + 3) * 2, 1.8, 2.8), m);
      top.position.y = 10;
      top.castShadow = true;
      grp.add(top);
      const top2 = new THREE.Mesh(new THREE.BoxGeometry((D + 1.5) * 2, 1, 2.2), m);
      top2.position.y = 11.4;
      grp.add(top2);
      const vine = new THREE.MeshStandardMaterial({ color: '#3f7a2a', roughness: 1 });
      for (let k = 0; k < 6; k++) {
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2 + (k % 3), 0.3), vine);
        v.position.set(-D + k * (D / 3), 8.5 - (k % 3) * 0.5, 1.2);
        grp.add(v);
      }
    } else if (type === 'ring') {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(D + 2.5, 0.5, 10, 48),
        new THREE.MeshBasicMaterial({ color: c % 2 ? glowA : glowB, toneMapped: false }),
      );
      ring.position.y = 2.5;
      grp.add(ring);
      this.animated.push((t) => { ring.rotation.z = t * 0.5 + c; });
    }
    return grp;
  }

  update(dt, time) {
    if (this.boostTex) this.boostTex.offset.y = (this.boostTex.offset.y - dt * 1.6) % 1;
    this._updateCoins(time);
    for (const f of this.animated) f(time);
  }
}
