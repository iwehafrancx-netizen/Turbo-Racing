import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../core/util.js';
import { windowsTexture, containerTexture } from './textures.js';

// ---------- geometry helpers ----------
let R = rng(1);
function col(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
function jitter(geo, amt) {
  const p = geo.attributes.position;
  const seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!seen.has(k)) seen.set(k, [(R() - 0.5) * amt, (R() - 0.5) * amt, (R() - 0.5) * amt]);
    const [a, b, c] = seen.get(k);
    p.setXYZ(i, p.getX(i) + a, p.getY(i) + b, p.getZ(i) + c);
  }
  geo.computeVertexNormals();
  return geo;
}
const T = (g, x, y, z) => { g.translate(x, y, z); return g; };
const cyl = (rt, rb, h, s = 6) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r, h, s = 6) => new THREE.ConeGeometry(r, h, s);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const ico = (r, d = 0) => new THREE.IcosahedronGeometry(r, d);
const sph = (r, w = 8, h = 6) => new THREE.SphereGeometry(r, w, h);

// A floating rock base: inverted craggy cone with a coloured top.
function isleBase(r, depth, rock, top) {
  const c = cone(r, depth, 8);
  c.rotateX(Math.PI);
  c.translate(0, -depth / 2, 0);
  const t = cyl(r, r * 0.96, 1.6, 8);
  t.translate(0, -0.4, 0);
  return [col(jitter(c, r * 0.18), rock), col(t, top)];
}
const moveAll = (parts, x, y, z, s = 1) => parts.map((g) => { g.scale(s, s, s); g.translate(x, y, z); return g; });

// Each builder returns { std: [geos], glow: [geos], ... } keyed by material.
const BUILD = {
  islandPalm() {
    const std = isleBase(14, 20, '#8a6a4a', '#ecd9a0');
    std.push(...moveAll(BUILD.palm().std, 3, 0.4, 2), ...moveAll(BUILD.palm().std, -4, 0.4, -3, 0.8));
    std.push(...moveAll(BUILD.hut().std, -2, 0.4, 5, 0.8));
    std.push(col(T(cyl(9, 9, 0.3, 8), 3, 0.45, -2), '#7fb24a'));
    return { std };
  },
  islandGrass() {
    return BUILD.floatIsland();
  },
  islandSnow() {
    const std = isleBase(13, 22, '#6f7c8f', '#f4f8fc');
    std.push(...moveAll(BUILD.snowPine().std, 3, 0.4, 2), ...moveAll(BUILD.snowPine().std, -4, 0.4, -2, 1.3), ...moveAll(BUILD.snowPine().std, 0, 0.4, -6, 0.9));
    return { std };
  },
  islandJungle() {
    const std = isleBase(14, 24, '#5a4a38', '#4c7a26');
    std.push(...moveAll(BUILD.jungleTree().std, 2, 0.4, 2, 0.8), ...moveAll(BUILD.fern().std, -4, 0.4, 3), ...moveAll(BUILD.fern().std, 5, 0.4, -4));
    // waterfall spilling off the edge into the void
    const fall = box(4, 40, 0.6);
    fall.translate(0, -20, 13.6);
    const pool = cyl(3, 3, 0.4, 10);
    pool.translate(0, 0.5, 9);
    return { std, glow: [col(fall, '#9fe8ff'), col(pool, '#7fd8ff')] };
  },
  islandIce() {
    const std = isleBase(12, 20, '#5d7fa6', '#d9efff');
    const ice = BUILD.iceCrystal().ice.map((g) => { g.scale(1.6, 1.6, 1.6); return g; });
    return { std, ice };
  },
  islandLava() {
    const std = isleBase(13, 22, '#2a2220', '#352a26');
    std.push(...moveAll(BUILD.lavaRock().std, 3, 1, 1, 1.4), ...moveAll(BUILD.deadTree().std, -4, 0.4, -2));
    const fall = box(3, 36, 0.6);
    fall.translate(0, -18, 12.8);
    const pool = cyl(4, 4, 0.4, 10);
    pool.translate(-2, 0.5, 4);
    return { std, glow: [col(fall, '#ff6a1a'), col(pool, '#ff8a1a'), ...BUILD.lavaRock().glow.map((g) => { g.translate(3, 1, 1); return g; })] };
  },
  islandMesa() {
    const std = isleBase(16, 26, '#9b4d2b', '#d9894e');
    std.push(col(jitter(T(cyl(10, 12, 14, 8), 0, 7, 0), 1.5), '#c4703c'), col(T(cyl(10.2, 10.2, 1, 8), 0, 14.4, 0), '#e2a46c'));
    std.push(...moveAll(BUILD.cactus().std, 11, 0.4, 3));
    return { std };
  },
  islandTemple() {
    const std = isleBase(30, 40, '#5a4a38', '#4c7a26');
    std.push(...moveAll(BUILD.pyramid().std, 0, 0.4, 0, 0.55));
    const fall = box(5, 50, 0.6);
    fall.translate(0, -25, 29.5);
    return { std, glow: [col(fall, '#9fe8ff')] };
  },
  iceSpireIsle() {
    const std = isleBase(40, 60, '#5d7fa6', '#f4f8fc');
    std.push(col(jitter(T(cone(30, 110, 7), 0, 55, 0), 6), '#e8f0fa'), col(jitter(T(cone(14, 60, 6), 22, 30, 8), 3), '#d9e6f4'));
    return { std };
  },
  volcanoIsle() {
    const v = BUILD.volcano();
    v.std.push(...isleBase(230, 140, '#1e1716', '#2b211f'));
    return v;
  },
  skyRock() {
    return { std: [col(jitter(ico(3, 0), 1.6), '#7a6a5a')] };
  },
  airship() {
    const env = sph(1, 16, 10);
    env.scale(7, 7, 22);
    env.translate(0, 12, 0);
    const std = [col(env, '#e8e2d6'), col(T(box(4, 2.5, 10), 0, 3.5, 0), '#5a3b25')];
    const finV = box(0.4, 7, 5); finV.translate(0, 18, -19);
    const finH = box(12, 0.4, 5); finH.translate(0, 12, -19);
    std.push(col(finV, '#d63c2f'), col(finH, '#d63c2f'));
    const band = cyl(7.1, 7.1, 2, 16); band.rotateX(Math.PI / 2); band.translate(0, 12, 6);
    std.push(col(band, '#d63c2f'));
    return { std, glow: [col(T(box(4.2, 0.6, 10.2), 0, 4.2, 0), '#ffd27a')] };
  },
  palm() {
    const std = [];
    const trunk = cyl(0.22, 0.42, 9, 6);
    trunk.translate(0, 4.5, 0); trunk.rotateZ(0.12);
    std.push(col(trunk, '#8b6b4a'));
    for (let k = 0; k < 7; k++) {
      const f = cone(0.9, 5.5, 4);
      f.scale(1, 1, 0.22);
      f.rotateZ(-(Math.PI / 2 - 0.45));
      f.translate(2.6, 8.4, 0);
      f.rotateY((k / 7) * Math.PI * 2 + R());
      f.translate(-1.05, 0, 0);
      std.push(col(f, k % 2 ? '#3f8f3a' : '#56a83f'));
    }
    std.push(col(T(sph(0.35, 5, 4), -0.7, 8.6, 0.3), '#5a3b1e'));
    return { std };
  },
  rock() {
    return { std: [col(jitter(new THREE.DodecahedronGeometry(1.6, 0), 0.8), '#8a8378')] };
  },
  hut() {
    const std = [col(T(box(4, 3, 4), 0, 1.5, 0), '#c49a6c')];
    const roof = cone(3.6, 2.4, 4); roof.rotateY(Math.PI / 4); roof.translate(0, 4.2, 0);
    std.push(col(roof, '#e0574a'));
    std.push(col(T(box(1.2, 2, 0.1), 0, 1, 2.02), '#5a3b1e'));
    return { std };
  },
  bush() {
    return { std: [col(T(ico(1.3), 0, 0.9, 0), '#4f8b37'), col(T(ico(1), 1, 0.7, 0.4), '#5fa040'), col(T(ico(0.9), -0.9, 0.6, -0.3), '#467d31')] };
  },
  streetlight() {
    const std = [col(T(cyl(0.12, 0.16, 8, 6), 0, 4, 0), '#3a3a44'), col(T(box(0.2, 0.2, 2.6), 0, 8, 1.2), '#3a3a44')];
    const glow = [col(T(box(0.6, 0.18, 1), 0, 7.85, 2.3), '#ffe9b0')];
    return { std, glow };
  },
  cactus() {
    const c = '#4a8a3a', std = [col(T(cyl(0.45, 0.5, 5.5, 7), 0, 2.75, 0), c)];
    std.push(col(T(cyl(0.3, 0.3, 2.2, 6), 1.1, 3.2, 0), c), col(T(box(1.1, 0.5, 0.5), 0.55, 2.3, 0), c));
    std.push(col(T(cyl(0.3, 0.3, 1.8, 6), -1, 3.8, 0), c), col(T(box(1, 0.5, 0.5), -0.5, 3, 0), c));
    std.push(col(T(sph(0.3, 6, 4), 0, 5.6, 0), '#f06292'));
    return { std };
  },
  mesa() {
    const std = [];
    std.push(col(jitter(T(cyl(26, 34, 30, 8), 0, 15, 0), 3), '#b85f32'));
    std.push(col(jitter(T(cyl(22, 26, 14, 8), 0, 37, 0), 2), '#c4703c'));
    std.push(col(T(cyl(22.5, 22.5, 1.2, 8), 0, 44.5, 0), '#d9894e'));
    return { std };
  },
  snowPine() {
    const std = [col(T(cyl(0.3, 0.4, 2.2, 5), 0, 1.1, 0), '#5a3b25')];
    for (let k = 0; k < 3; k++) {
      std.push(col(T(cone(2.6 - k * 0.7, 3.2, 7), 0, 3 + k * 2, 0), k % 2 ? '#2c5a3a' : '#25503a'));
      std.push(col(T(cone(1.4 - k * 0.35, 1.2, 7), 0, 4.2 + k * 2, 0), '#f4f8fc'));
    }
    return { std };
  },
  snowman() {
    const std = [col(T(sph(1.4, 10, 8), 0, 1.3, 0), '#ffffff'), col(T(sph(1, 10, 8), 0, 3.3, 0), '#ffffff'), col(T(sph(0.7, 10, 8), 0, 4.8, 0), '#ffffff')];
    const nose = cone(0.15, 0.8, 6); nose.rotateX(Math.PI / 2); nose.translate(0, 4.8, 0.95);
    std.push(col(nose, '#ff7a1a'), col(T(cyl(0.55, 0.55, 0.9, 10), 0, 5.7, 0), '#222'), col(T(cyl(0.85, 0.85, 0.08, 12), 0, 5.28, 0), '#222'));
    std.push(col(T(box(1.6, 0.3, 0.3), 0, 4.1, 0.2), '#e63946'));
    return { std };
  },
  jungleTree() {
    const std = [col(T(cyl(0.5, 0.9, 13, 6), 0, 6.5, 0), '#5a4330')];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      std.push(col(T(box(0.4, 2, 2.6), Math.cos(a) * 0.9, 0.8, Math.sin(a) * 0.9).rotateY(a), '#4a3828'));
    }
    std.push(col(jitter(T(ico(4.2, 1), 0, 14, 0), 1.2), '#2f6b25'));
    std.push(col(jitter(T(ico(3, 1), 2.6, 12.5, 1), 1), '#3a7d2c'));
    std.push(col(jitter(T(ico(2.8, 1), -2.4, 12.8, -1.2), 1), '#285c20'));
    return { std };
  },
  fern() {
    const std = [];
    for (let k = 0; k < 6; k++) {
      const f = cone(0.6, 3, 4); f.scale(1, 1, 0.2); f.rotateZ(-(Math.PI / 2 - 0.7)); f.translate(1.3, 1, 0); f.rotateY((k / 6) * Math.PI * 2);
      std.push(col(f, k % 2 ? '#3d8a2e' : '#4fa03a'));
    }
    return { std };
  },
  ruin() {
    const c = '#9a9580', std = [];
    std.push(col(T(cyl(1, 1.1, 7, 8), -3, 3.5, 0), c));
    std.push(col(T(cyl(1, 1.1, 3.5, 8), 3, 1.75, 0), c));
    std.push(col(T(box(3, 1, 3), -3, 7.4, 0), '#8a8570'));
    const fallen = cyl(1, 1, 5, 8); fallen.rotateZ(Math.PI / 2); fallen.translate(1, 1, 3);
    std.push(col(fallen, '#8f8a74'));
    std.push(col(jitter(T(box(2, 1.4, 2), 4, 0.7, -2.5), 0.4), '#7d7866'));
    std.push(col(T(box(0.3, 3, 0.3), -2.2, 5, 1), '#3f7a2a'));
    return { std };
  },
  pyramid() {
    const std = [];
    for (let k = 0; k < 6; k++) {
      const s = 44 - k * 7;
      std.push(col(T(box(s, 5, s), 0, 2.5 + k * 5, 0), k % 2 ? '#a39d84' : '#958f77'));
    }
    std.push(col(T(box(8, 6, 8), 0, 33, 0), '#8a8570'));
    std.push(col(T(box(7, 22, 1), 0, 11, 22), '#7a7462'));
    return { std };
  },
  lavaRock() {
    return {
      std: [col(jitter(new THREE.DodecahedronGeometry(1.8, 0), 1), '#2a2220')],
      glow: [col(T(box(0.2, 0.15, 3), 0.4, 1.1, 0).rotateY(0.6), '#ff5a0a'), col(T(box(2.4, 0.15, 0.2), -0.2, 1.3, 0.3), '#ff8a1a')],
    };
  },
  deadTree() {
    const c = '#2a2420', std = [col(T(cyl(0.2, 0.45, 7, 5), 0, 3.5, 0), c)];
    for (let k = 0; k < 4; k++) {
      const b = cyl(0.08, 0.16, 3, 4); b.rotateZ(0.9); b.translate(1, 4 + k, 0); b.rotateY(k * 1.7);
      std.push(col(b, c));
    }
    return { std };
  },
  volcano() {
    const std = [col(jitter(T(cyl(28, 230, 170, 14, 1), 0, 85, 0), 10), '#2b211f')];
    const glow = [col(T(cyl(26, 26, 2, 14), 0, 170, 0), '#ff6a1a')];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const stream = box(6, 120, 3); stream.rotateX(-0.95); stream.translate(0, 120, 72); stream.rotateY(a);
      glow.push(col(stream, '#ff4a0a'));
    }
    return { std, glow };
  },
  crane() {
    const y = '#f2b705', std = [];
    for (const [x, z] of [[-6, -4], [6, -4], [-6, 4], [6, 4]]) std.push(col(T(box(1, 30, 1), x, 15, z), y));
    std.push(col(T(box(14, 2, 10), 0, 30, 0), y));
    std.push(col(T(box(2, 2, 60), 0, 33, 14), '#d63c2f'));
    std.push(col(T(box(4, 4, 4), 0, 33, -8), '#333'));
    std.push(col(T(box(0.2, 14, 0.2), 0, 25, 38), '#222'));
    std.push(col(T(box(12.2, 2.6, 2.6), 0, 17, 38), '#2e86de'));
    return { std };
  },
  barrel() {
    return { std: [col(T(cyl(0.6, 0.6, 1.6, 10), 0, 0.8, 0), '#2e86de'), col(T(cyl(0.62, 0.62, 0.1, 10), 0, 1.1, 0), '#1b4f8a')] };
  },
  iceCrystal() {
    const g = new THREE.OctahedronGeometry(1.6, 0); g.scale(1, 2.6, 1); g.translate(0, 3.5, 0);
    const g2 = new THREE.OctahedronGeometry(0.9, 0); g2.scale(1, 2.4, 1); g2.rotateZ(0.5); g2.translate(1.4, 2, 0);
    return { ice: [col(g, '#9fe8ff'), col(g2, '#c4a8ff')] };
  },
  iceSpike() {
    return { std: [col(jitter(T(cone(2.2, 11, 5), 0, 5.5, 0), 0.6), '#bfe4ff'), col(jitter(T(cone(1.3, 6, 5), 2, 3, 1), 0.4), '#a8d8ff')] };
  },
  cloud() {
    const std = [];
    for (let k = 0; k < 6; k++) std.push(col(T(ico(4 + R() * 4, 1), (k - 2.5) * 5, R() * 3, (R() - 0.5) * 6), '#ffffff'));
    return { cloud: std };
  },
  balloon() {
    const env = sph(6, 10, 8); env.scale(1, 1.2, 1); env.translate(0, 10, 0);
    const std = [col(env, '#ffffff'), col(T(box(2, 1.6, 2), 0, 1, 0), '#7a5230')];
    std.push(col(T(cyl(3, 1.2, 3, 10), 0, 3.8, 0), '#ffffff'));
    return { std };
  },
  floatIsland() {
    const rock = cone(14, 22, 7); rock.rotateX(Math.PI); rock.translate(0, -11, 0);
    const std = [col(jitter(rock, 3), '#7a5a40'), col(T(cyl(14, 14, 2, 7), 0, 0, 0), '#5fa040')];
    std.push(col(T(cyl(0.6, 0.8, 5, 5), 3, 3.5, 2), '#5a3b25'), col(T(ico(3.4, 0), 3, 7, 2), '#3f8f3a'));
    std.push(col(T(cyl(0.5, 0.7, 4, 5), -5, 3, -3), '#5a3b25'), col(T(ico(2.6, 0), -5, 6, -3), '#56a83f'));
    return { std };
  },
  asteroid() {
    return { std: [col(jitter(ico(5, 1), 3), '#4a3f63')] };
  },
  planet() {
    const g = sph(1, 32, 20);
    const pos = g.attributes.position;
    const c = new Float32Array(pos.count * 3);
    const a = new THREE.Color(['#ff6ad5', '#4fe8ff', '#ffb347', '#8b5cf6', '#22d3ee', '#f472b6'][Math.floor(R() * 6)]);
    const b = new THREE.Color('#1a0838');
    const t = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      t.copy(a).lerp(b, 0.25 + 0.35 * Math.sin(y * 9) * Math.sin(y * 3));
      c[i * 3] = t.r; c[i * 3 + 1] = t.g; c[i * 3 + 2] = t.b;
    }
    g.deleteAttribute('uv');
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return { planet: [g.toNonIndexed()] };
  },
  ring() {
    const t = new THREE.TorusGeometry(16, 0.8, 8, 40);
    return { glow: [col(t, R() < 0.5 ? '#ff4fd8' : '#4fe8ff')] };
  },
};

// Placement rules: [minRoadDist, maxRoadDist, scaleMin, scaleMax, yMode]
const RULES = {
  palm: [6, 260, 0.8, 1.4], rock: [5, 400, 0.6, 2.5], hut: [10, 60, 1, 1.2], bush: [5, 200, 0.7, 1.4],
  cactus: [5, 260, 0.7, 1.5], mesa: [90, 600, 0.6, 1.4], snowPine: [5, 320, 0.8, 1.8], snowman: [4, 14, 1, 1],
  jungleTree: [6, 220, 0.8, 1.5], fern: [3.5, 120, 0.8, 1.5], ruin: [8, 120, 0.8, 1.4], pyramid: [120, 320, 1, 1.5],
  lavaRock: [5, 300, 0.7, 2.6], deadTree: [6, 200, 0.8, 1.4], volcano: [400, 700, 1, 1],
  crane: [30, 120, 1, 1], barrel: [4, 40, 1, 1], iceCrystal: [5, 250, 0.8, 2.2], iceSpike: [6, 320, 1, 2.6],
  cloud: [45, 500, 1, 3.5, 'sky'], balloon: [40, 500, 1, 1.6, 'sky'], floatIsland: [60, 420, 0.7, 1.6, 'sky'],
  islandPalm: [35, 450, 0.7, 1.7, 'sky'], islandGrass: [40, 450, 0.7, 1.6, 'sky'], islandSnow: [35, 450, 0.7, 1.7, 'sky'],
  islandJungle: [35, 450, 0.7, 1.7, 'sky'], islandIce: [35, 450, 0.7, 1.7, 'sky'], islandLava: [35, 450, 0.7, 1.7, 'sky'],
  islandMesa: [40, 480, 0.7, 1.8, 'sky'], islandTemple: [90, 380, 1, 1.3, 'sky'], iceSpireIsle: [450, 650, 1, 1, 'sky'],
  volcanoIsle: [450, 700, 1, 1, 'sky'], skyRock: [20, 400, 0.5, 3, 'sky'], airship: [50, 500, 1, 1.5, 'sky'],
  asteroid: [20, 500, 0.4, 3, 'space'], planet: [700, 1300, 60, 190, 'space'], ring: [60, 400, 0.8, 2, 'space'],
};

export class Scenery {
  constructor(path, theme, terrain, quality, seed) {
    this.group = new THREE.Group();
    this.path = path;
    this.theme = theme;
    this.terrain = terrain;
    this.quality = quality;
    R = rng(seed * 31 + 7);
    this.rand = rng(seed * 17 + 3);
    this.mats = {
      std: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
      ice: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.82, emissive: '#3aa8ff', emissiveIntensity: 0.35 }),
      cloud: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, emissive: '#ffffff', emissiveIntensity: 0.35 }),
      planet: new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }),
    };
    if (theme.clouds) this.mats.cloud.emissive.set(theme.clouds.top);
    if (theme.night) this.mats.cloud.emissiveIntensity = 0.2;
    const mult = quality === 'low' ? 0.45 : quality === 'medium' ? 0.75 : 1;
    for (const [type, count] of theme.props) {
      if (type === 'building') this._buildings(Math.round(count * mult));
      else if (type === 'container') this._containers(Math.round(count * mult));
      else if (type === 'dock') this._docks(Math.round(count * Math.max(0.6, mult)));
      else if (type === 'streetlight') this._streetlights();
      else if (type === 'neonArch') continue;
      else this._scatter(type, type === 'volcano' || type === 'planet' ? count : Math.max(1, Math.round(count * mult)));
    }
    this._backdrop(theme.backdrop);
  }

  _instanced(type, matrices, colors) {
    const parts = BUILD[type]();
    for (const [mk, geos] of Object.entries(parts)) {
      const geo = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
      const im = new THREE.InstancedMesh(geo, this.mats[mk], matrices.length);
      matrices.forEach((m, k) => {
        im.setMatrixAt(k, m);
        if (colors) im.setColorAt(k, colors[k]);
      });
      im.castShadow = this.quality === 'high' && mk === 'std' && !['cloud', 'mesa', 'pyramid', 'volcano'].includes(type);
      im.receiveShadow = false;
      im.computeBoundingSphere();
      this.group.add(im);
    }
  }

  _yFor(mode, x, z, s) {
    const avg = (this.path.bounds().minY + this.path.bounds().maxY) / 2;
    if (mode === 'sky') {
      const lvl = this.theme.clouds?.level ?? avg - 80;
      return lvl + 8 + this.rand() * (avg - lvl + 50);
    }
    if (mode === 'space') return avg + (this.rand() - 0.5) * 220 * (s > 50 ? 3 : 1);
    return this.terrain.heightAt(x, z) - 0.3;
  }

  _scatter(type, count) {
    const [dMin, dMax, sMin, sMax, mode] = RULES[type];
    const ext = this.terrain.extent;
    const mats = [], cols = [];
    const o = new THREE.Object3D();
    const water = this.theme.terrain?.waterLevel ?? -Infinity;
    const cx = (ext.minX + ext.maxX) / 2, cz = (ext.minZ + ext.maxZ) / 2;
    let tries = 0;
    while (mats.length < count && tries++ < count * 40) {
      let x, z;
      if (dMin > 300) {
        // far objects: ring around the play area
        const a = this.rand() * Math.PI * 2;
        const r = Math.max(ext.maxX - ext.minX, ext.maxZ - ext.minZ) * 0.5 + dMin * (0.6 + this.rand() * 0.6);
        x = cx + Math.cos(a) * r; z = cz + Math.sin(a) * r;
      } else {
        x = ext.minX + this.rand() * (ext.maxX - ext.minX);
        z = ext.minZ + this.rand() * (ext.maxZ - ext.minZ);
        const d = this.terrain.roadDist(x, z) - this.path.wallDist;
        if (d < dMin || d > dMax) continue;
      }
      const s = sMin + this.rand() * (sMax - sMin);
      let y = this._yFor(mode, x, z, s);
      if (mode === 'sky' && dMin > 300) y = (this.theme.clouds?.level ?? y) - 30;
      if (!mode && y < water + 0.4) continue;
      o.position.set(x, y, z);
      o.rotation.set(mode === 'space' ? this.rand() * 6 : 0, this.rand() * Math.PI * 2, mode === 'space' ? this.rand() * 6 : 0);
      if (type === 'ring') o.rotation.set(this.rand() * 0.6, this.rand() * Math.PI * 2, 0);
      o.scale.setScalar(s);
      o.updateMatrix();
      mats.push(o.matrix.clone());
      const v = 0.85 + this.rand() * 0.25;
      const c = new THREE.Color(v, v, v);
      if (type === 'balloon') c.setHSL(this.rand(), 0.75, 0.6);
      if (type === 'cloud' && this.theme.clouds) c.set(this.theme.clouds.top).multiplyScalar(0.9 + this.rand() * 0.2);
      if (type === 'airship' && this.rand() < 0.5) c.setHSL(this.rand(), 0.4, 0.75);
      cols.push(c);
    }
    if (mats.length) this._instanced(type, mats, cols);
  }

  _buildings(count) {
    const ext = this.terrain.extent;
    const classes = [[14, 24], [16, 40], [18, 62], [22, 90]];
    const lists = classes.map(() => []);
    const bases = [];
    const o = new THREE.Object3D();
    let tries = 0, placed = 0;
    const taken = [];
    while (placed < count && tries++ < count * 50) {
      const x = ext.minX + this.rand() * (ext.maxX - ext.minX);
      const z = ext.minZ + this.rand() * (ext.maxZ - ext.minZ);
      const d = this.terrain.roadDist(x, z) - this.path.wallDist;
      const k = Math.min(3, Math.floor(this.rand() * 4 * Math.min(1, d / 60 + 0.4)));
      const w = classes[k][0];
      if (d < w * 0.75 + 4 || d > 260) continue;
      if (taken.some(([tx, tz, tw]) => Math.abs(tx - x) < (tw + w) / 2 + 2 && Math.abs(tz - z) < (tw + w) / 2 + 2)) continue;
      taken.push([x, z, w]);
      let y = this.terrain.heightAt(x, z) - 0.5;
      if (!this.theme.terrain) {
        // floating towers: tops scattered around road level, on rock bases
        const b = this.path.bounds();
        y = (b.minY + b.maxY) / 2 + 20 - classes[k][1] * (0.4 + this.rand() * 0.9);
        o.position.set(x, y, z); o.rotation.set(0, 0, 0); o.scale.setScalar(w / 14); o.updateMatrix();
        bases.push(o.matrix.clone());
        o.scale.setScalar(1);
      }
      o.position.set(x, y, z);
      o.rotation.set(0, Math.round(this.rand() * 4) * (Math.PI / 2), 0);
      o.updateMatrix();
      lists[k].push(o.matrix.clone());
      placed++;
    }
    classes.forEach(([w, h], k) => {
      if (!lists[k].length) return;
      const g = new THREE.BoxGeometry(w, h, w);
      g.translate(0, h / 2, 0);
      const uv = g.attributes.uv;
      const nrm = g.attributes.normal;
      for (let i = 0; i < uv.count; i++) {
        const top = Math.abs(nrm.getY(i)) > 0.5;
        uv.setXY(i, top ? 0.02 : uv.getX(i) * (w / 16), top ? 0.02 : uv.getY(i) * (h / 16));
      }
      const tex = windowsTexture(k + 1);
      const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 1.1, roughness: 0.6, metalness: 0.3 });
      const im = new THREE.InstancedMesh(g, mat, lists[k].length);
      lists[k].forEach((m, n) => im.setMatrixAt(n, m));
      im.computeBoundingSphere();
      this.group.add(im);
      // neon roof trims
      const trim = new THREE.BoxGeometry(w + 0.6, 0.6, w + 0.6);
      trim.translate(0, h, 0);
      const tim = new THREE.InstancedMesh(trim, new THREE.MeshBasicMaterial({ toneMapped: false }), lists[k].length);
      lists[k].forEach((m, n) => {
        tim.setMatrixAt(n, m);
        tim.setColorAt(n, new THREE.Color(['#ff2bd6', '#00e5ff', '#ffd23f', '#7c4dff'][(n + k) % 4]));
      });
      this.group.add(tim);
    });
    if (bases.length) {
      const geo = mergeGeometries([...isleBase(11, 26, '#2a2238', '#3a3050')]);
      const im = new THREE.InstancedMesh(geo, this.mats.std, bases.length);
      bases.forEach((m, n) => im.setMatrixAt(n, m));
      im.computeBoundingSphere();
      this.group.add(im);
    }
  }

  // Floating airship docks stacked with containers.
  _docks(count) {
    const ext = this.terrain.extent;
    const b = this.path.bounds();
    const palette = ['#d64541', '#2e86de', '#f39c12', '#27ae60', '#8e44ad', '#e67e22', '#16a085', '#c0392b'];
    const plats = [], conts = [], cols = [], cranes = [];
    const o = new THREE.Object3D();
    let tries = 0;
    while (plats.length < count && tries++ < count * 60) {
      const x = ext.minX + this.rand() * (ext.maxX - ext.minX);
      const z = ext.minZ + this.rand() * (ext.maxZ - ext.minZ);
      const d = this.terrain.roadDist(x, z) - this.path.wallDist;
      if (d < 26 || d > 200) continue;
      const y = (b.minY + b.maxY) / 2 - 6 - this.rand() * 34;
      const rot = this.rand() * Math.PI;
      o.position.set(x, y, z); o.rotation.set(0, rot, 0); o.scale.setScalar(1); o.updateMatrix();
      plats.push(o.matrix.clone());
      const n = 2 + Math.floor(this.rand() * 6);
      for (let k = 0; k < n; k++) {
        const lx = (this.rand() - 0.5) * 22, lz = (this.rand() - 0.5) * 14;
        const stack = 1 + Math.floor(this.rand() * 3);
        for (let s2 = 0; s2 < stack; s2++) {
          const v = new THREE.Vector3(lx, 1.5 + s2 * 2.6, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
          o.position.set(x + v.x, y + v.y, z + v.z); o.rotation.set(0, rot + (this.rand() < 0.3 ? Math.PI / 2 : 0), 0); o.updateMatrix();
          conts.push(o.matrix.clone());
          cols.push(new THREE.Color(palette[Math.floor(this.rand() * palette.length)]));
        }
      }
      if (this.rand() < 0.35) {
        o.position.set(x, y + 1.5, z); o.rotation.set(0, rot, 0); o.scale.setScalar(0.6); o.updateMatrix();
        cranes.push(o.matrix.clone());
        o.scale.setScalar(1);
      }
    }
    if (!plats.length) return;
    const pg = mergeGeometries([
      col(T(box(36, 3, 26), 0, 0, 0), '#4a4f5a'),
      col(T(box(36.4, 0.4, 26.4), 0, 1.6, 0), '#ffd23f'),
      ...[[-14, -10], [14, -10], [-14, 10], [14, 10]].map(([px, pz]) => col(T(cyl(2.4, 1.2, 3, 8), px, -3, pz), '#2a2f3a')),
    ]);
    const pm = new THREE.InstancedMesh(pg, this.mats.std, plats.length);
    plats.forEach((m, k) => pm.setMatrixAt(k, m));
    pm.computeBoundingSphere();
    const glowG = mergeGeometries([[-14, -10], [14, -10], [-14, 10], [14, 10]].map(([px, pz]) => col(T(cyl(1.1, 0.2, 0.6, 8), px, -4.8, pz), '#7df9ff')));
    const gm = new THREE.InstancedMesh(glowG, this.mats.glow, plats.length);
    plats.forEach((m, k) => gm.setMatrixAt(k, m));
    gm.computeBoundingSphere();
    this.group.add(pm, gm);
    const g = new THREE.BoxGeometry(12.2, 2.6, 2.6);
    g.translate(0, 1.3 - 1.3, 0);
    const im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ map: containerTexture(), roughness: 0.7, metalness: 0.2 }), conts.length);
    conts.forEach((m, k) => { im.setMatrixAt(k, m); im.setColorAt(k, cols[k]); });
    im.castShadow = this.quality !== 'low';
    im.computeBoundingSphere();
    this.group.add(im);
    if (cranes.length) this._instanced('crane', cranes);
  }

  _containers(count) {
    const ext = this.terrain.extent;
    const palette = ['#d64541', '#2e86de', '#f39c12', '#27ae60', '#8e44ad', '#e67e22', '#16a085', '#c0392b'];
    const mats = [], cols = [];
    const o = new THREE.Object3D();
    let tries = 0;
    while (mats.length < count && tries++ < count * 30) {
      const x = ext.minX + this.rand() * (ext.maxX - ext.minX);
      const z = ext.minZ + this.rand() * (ext.maxZ - ext.minZ);
      const d = this.terrain.roadDist(x, z) - this.path.wallDist;
      if (d < 8 || d > 130) continue;
      const stack = 1 + Math.floor(this.rand() * 3);
      const rot = this.rand() < 0.5 ? 0 : Math.PI / 2;
      for (let s = 0; s < stack; s++) {
        o.position.set(x, this.terrain.heightAt(x, z) + s * 2.6, z);
        o.rotation.set(0, rot + (this.rand() - 0.5) * 0.06, 0);
        o.updateMatrix();
        mats.push(o.matrix.clone());
        cols.push(new THREE.Color(palette[Math.floor(this.rand() * palette.length)]));
      }
    }
    const g = new THREE.BoxGeometry(12.2, 2.6, 2.6);
    g.translate(0, 1.3, 0);
    const mat = new THREE.MeshStandardMaterial({ map: containerTexture(), roughness: 0.7, metalness: 0.2 });
    const im = new THREE.InstancedMesh(g, mat, mats.length);
    mats.forEach((m, k) => { im.setMatrixAt(k, m); im.setColorAt(k, cols[k]); });
    im.castShadow = this.quality !== 'low';
    im.receiveShadow = true;
    im.computeBoundingSphere();
    this.group.add(im);
  }

  _streetlights() {
    const p = this.path, mats = [];
    const o = new THREE.Object3D();
    for (let i = 0; i < p.N; i += 22) {
      if (p.gap[i]) continue;
      for (const side of [-1, 1]) {
        const lat = side * (p.wallDist + 1.2);
        o.position.set(p.px[i] + p.rx[i] * lat, p.surfaceY(i, 0, lat) - 0.3, p.pz[i] + p.rz[i] * lat);
        o.rotation.set(0, p.heading[i] + (side > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
        o.scale.setScalar(1);
        o.updateMatrix();
        mats.push(o.matrix.clone());
      }
    }
    this._instanced('streetlight', mats);
  }

  // Big silhouettes on the horizon to give each world depth.
  _backdrop(kind) {
    if (!kind) return;
    const ext = this.terrain.extent;
    const cx = (ext.minX + ext.maxX) / 2, cz = (ext.minZ + ext.maxZ) / 2;
    const rad = Math.max(ext.maxX - ext.minX, ext.maxZ - ext.minZ) * 0.55 + 250;
    const fogCol = new THREE.Color(this.theme.fog[0]);
    const n = kind === 'skyline' ? 70 : 28;
    const geos = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + this.rand() * 0.2;
      const r = rad + this.rand() * 250;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      let g, c;
      switch (kind) {
        case 'hills': g = jitter(cone(180 + this.rand() * 120, 90 + this.rand() * 80, 7), 20); c = this.theme.terrain.palette[3]; break;
        case 'mesas': g = jitter(cyl(90 + this.rand() * 60, 120 + this.rand() * 60, 60 + this.rand() * 90, 7), 12); c = '#b85f32'; break;
        case 'peaks': g = jitter(cone(160 + this.rand() * 100, 240 + this.rand() * 180, 6), 25); c = '#d7e2ee'; break;
        case 'volcanoes': g = jitter(cyl(30, 200, 140 + this.rand() * 100, 8), 15); c = '#1e1716'; break;
        case 'skyline': { const w = 30 + this.rand() * 40, h = 80 + this.rand() * 220; g = box(w, h, w); c = '#1a1430'; break; }
        case 'ships': g = box(140, 40, 26); c = '#5a6a7a'; break;
        case 'cloudTowers': {
          const parts = [];
          const h = 3 + Math.floor(this.rand() * 4), base = 70 + this.rand() * 60;
          for (let j = 0; j < h; j++) {
            const rr = base * (1 - j * 0.15);
            for (let q = 0; q < 3; q++) parts.push(T(ico(rr * (0.6 + this.rand() * 0.4), 1), (this.rand() - 0.5) * rr, j * base * 0.55, (this.rand() - 0.5) * rr));
          }
          g = mergeGeometries(parts.map((pg) => { pg.deleteAttribute('uv'); return pg.index ? pg.toNonIndexed() : pg; }));
          c = this.theme.clouds?.top || '#ffffff';
          break;
        }
        default: continue;
      }
      g.computeBoundingBox();
      const floor = this.theme.terrain ? -20 : (this.theme.clouds?.level ?? 0) - 40;
      g.translate(x, floor - g.boundingBox.min.y, z);
      const cc = new THREE.Color(c).lerp(fogCol, kind === 'cloudTowers' ? 0.15 : 0.35);
      geos.push(col(g, cc));
    }
    const geo = mergeGeometries(geos);
    const m = new THREE.Mesh(geo, this.mats.std);
    this.group.add(m);
  }
}
