import * as THREE from 'three';
import { rng } from '../core/util.js';

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

function speckle(ctx, w, h, n, colors, seed, size = 2) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    ctx.globalAlpha = 0.25 + r() * 0.35;
    ctx.fillRect(r() * w, r() * h, size * (0.5 + r()), size * (0.5 + r()));
  }
  ctx.globalAlpha = 1;
}

// Road texture: u runs across the road (0 = left edge), v runs along it.
export function roadTexture(road) {
  const key = 'road' + JSON.stringify(road);
  if (cache.has(key)) return cache.get(key);
  const W = 256, H = 512;
  const [c, x] = canvas(W, H);
  x.fillStyle = road.asphalt;
  x.fillRect(0, 0, W, H);
  if (road.dirt) {
    speckle(x, W, H, 5000, ['#7d6a52', '#5a4b3a', '#8a7658'], 3, 2);
    // tyre ruts
    x.fillStyle = 'rgba(40,30,20,0.25)';
    for (const u of [0.28, 0.36, 0.64, 0.72]) x.fillRect(W * u, 0, 10, H);
  } else {
    speckle(x, W, H, 9000, ['#000000', '#ffffff', '#777777'], 7, 1.1);
    // soften: a translucent wash keeps the grain subtle
    x.fillStyle = road.asphalt;
    x.globalAlpha = 0.55;
    x.fillRect(0, 0, W, H);
    x.globalAlpha = 1;
    // faint racing-line rubber
    const rg = x.createLinearGradient(0, 0, W, 0);
    rg.addColorStop(0.3, 'rgba(0,0,0,0)'); rg.addColorStop(0.42, 'rgba(0,0,0,0.12)');
    rg.addColorStop(0.58, 'rgba(0,0,0,0.12)'); rg.addColorStop(0.7, 'rgba(0,0,0,0)');
    x.fillStyle = rg; x.fillRect(0, 0, W, H);
  }
  if (road.grid) {
    x.strokeStyle = 'rgba(120,80,255,0.35)';
    x.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(i * W / 8, 0); x.lineTo(i * W / 8, H); x.stroke(); }
    for (let i = 0; i <= 16; i++) { x.beginPath(); x.moveTo(0, i * H / 16); x.lineTo(W, i * H / 16); x.stroke(); }
  }
  if (road.icy) {
    const r = rng(11);
    x.strokeStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 40; i++) {
      x.lineWidth = 0.5 + r() * 1.5;
      x.beginPath();
      let px = r() * W, py = r() * H;
      x.moveTo(px, py);
      for (let k = 0; k < 4; k++) { px += (r() - 0.5) * 60; py += (r() - 0.5) * 60; x.lineTo(px, py); }
      x.stroke();
    }
  }
  if (road.snowy) {
    const g = x.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.12, 'rgba(255,255,255,0)');
    g.addColorStop(0.88, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,0.55)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
  // curbs
  const cw = 14, seg = 32;
  for (let y = 0; y < H; y += seg) {
    x.fillStyle = (y / seg) % 2 ? road.curbA : road.curbB;
    x.fillRect(0, y, cw, seg);
    x.fillRect(W - cw, y, cw, seg);
  }
  // edge lines
  x.fillStyle = road.line;
  x.fillRect(cw + 4, 0, 5, H);
  x.fillRect(W - cw - 9, 0, 5, H);
  // centre dashes
  x.fillStyle = road.center;
  for (let y = 0; y < H; y += 128) x.fillRect(W / 2 - 3, y + 20, 6, 70);
  const t = tex(c);
  cache.set(key, t);
  return t;
}

export function noiseTexture(base, seed = 1, vary = 18) {
  const key = 'noise' + base + seed;
  if (cache.has(key)) return cache.get(key);
  const S = 256;
  const [c, x] = canvas(S, S);
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  const r = rng(seed);
  for (let i = 0; i < 2200; i++) {
    const v = Math.floor((r() - 0.5) * vary * 2);
    x.fillStyle = v > 0 ? `rgba(255,255,255,${v / 120})` : `rgba(0,0,0,${-v / 120})`;
    const s = 2 + r() * 6;
    x.fillRect(r() * S, r() * S, s, s);
  }
  const t = tex(c);
  cache.set(key, t);
  return t;
}

// Grey detail texture multiplied on top of terrain vertex colours.
export function detailTexture() {
  if (cache.has('detail')) return cache.get('detail');
  const S = 256;
  const [c, x] = canvas(S, S);
  x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, S, S);
  const r = rng(5);
  for (let i = 0; i < 4000; i++) {
    const v = 150 + Math.floor(r() * 105);
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.globalAlpha = 0.5;
    const s = 1 + r() * 4;
    x.fillRect(r() * S, r() * S, s, s);
  }
  x.globalAlpha = 1;
  const t = tex(c, { srgb: false });
  cache.set('detail', t);
  return t;
}

export function wallTexture(wall) {
  const key = 'wall' + JSON.stringify(wall);
  if (cache.has(key)) return cache.get(key);
  const W = 256, H = 64;
  const [c, x] = canvas(W, H);
  x.fillStyle = wall.b; x.fillRect(0, 0, W, H);
  switch (wall.style) {
    case 'tires':
      for (let i = 0; i < 8; i++) {
        x.fillStyle = i % 2 ? wall.a : wall.b;
        x.fillRect(i * 32, 0, 32, H);
        x.fillStyle = 'rgba(0,0,0,0.25)';
        x.fillRect(i * 32, 0, 32, 6);
        x.fillRect(i * 32, H - 6, 32, 6);
      }
      break;
    case 'stripes':
      x.save();
      for (let i = -4; i < 12; i++) {
        x.fillStyle = i % 2 ? wall.a : wall.b;
        x.beginPath();
        x.moveTo(i * 32, H); x.lineTo(i * 32 + 32, H); x.lineTo(i * 32 + 64, 0); x.lineTo(i * 32 + 32, 0);
        x.fill();
      }
      x.restore();
      x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(0, 0, W, 4);
      break;
    case 'stone': {
      const r = rng(9);
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 6; col++) {
          const v = 100 + Math.floor(r() * 60);
          x.fillStyle = `rgb(${v},${v},${v - 15})`;
          x.fillRect(col * 44 + (row % 2) * 22 - 22, row * 16, 42, 14);
        }
      }
      x.fillStyle = 'rgba(60,110,40,0.5)';
      for (let i = 0; i < 40; i++) x.fillRect(r() * W, r() * H * 0.5, 4 + r() * 10, 3 + r() * 6);
      break;
    }
    case 'neon':
    case 'rail':
      x.fillStyle = wall.a; x.fillRect(0, 0, W, H);
      x.fillStyle = wall.b;
      for (let i = 0; i < 4; i++) x.fillRect(i * 64 + 4, 12, 56, H - 24);
      break;
  }
  const t = tex(c);
  cache.set(key, t);
  return t;
}

export function checkerTexture() {
  if (cache.has('checker')) return cache.get('checker');
  const [c, x] = canvas(128, 32);
  for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) {
    x.fillStyle = (i + j) % 2 ? '#111' : '#fff';
    x.fillRect(i * 8, j * 8, 8, 8);
  }
  const t = tex(c);
  t.magFilter = THREE.NearestFilter;
  cache.set('checker', t);
  return t;
}

export function boostTexture() {
  if (cache.has('boost')) return cache.get('boost');
  const [c, x] = canvas(128, 256);
  const g = x.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, '#0a2a6a'); g.addColorStop(0.5, '#1240b0'); g.addColorStop(1, '#0a2a6a');
  x.fillStyle = g; x.fillRect(0, 0, 128, 256);
  x.lineWidth = 16; x.lineCap = 'round'; x.lineJoin = 'round';
  for (let i = 0; i < 2; i++) {
    const y = 40 + i * 128;
    x.strokeStyle = '#7df9ff';
    x.shadowColor = '#00e5ff'; x.shadowBlur = 16;
    x.beginPath(); x.moveTo(20, y + 50); x.lineTo(64, y); x.lineTo(108, y + 50); x.stroke();
  }
  const t = tex(c);
  cache.set('boost', t);
  return t;
}

export function rampTexture() {
  if (cache.has('ramp')) return cache.get('ramp');
  const [c, x] = canvas(128, 128);
  for (let i = 0; i < 8; i++) {
    x.fillStyle = i % 2 ? '#ffd23f' : '#1a1a1a';
    x.fillRect(0, i * 16, 128, 16);
  }
  x.fillStyle = 'rgba(255,255,255,0.15)';
  x.fillRect(0, 0, 128, 4);
  const t = tex(c);
  cache.set('ramp', t);
  return t;
}

export function windowsTexture(seed = 1, lit = true) {
  const key = 'win' + seed + lit;
  if (cache.has(key)) return cache.get(key);
  const [c, x] = canvas(128, 256);
  x.fillStyle = '#0e0e18'; x.fillRect(0, 0, 128, 256);
  const r = rng(seed);
  const palette = ['#ffd27a', '#7df9ff', '#ff7ae0', '#fff3c4', '#a0a8ff'];
  for (let row = 0; row < 32; row++) {
    for (let col = 0; col < 8; col++) {
      const on = r() < 0.45;
      x.fillStyle = on && lit ? palette[Math.floor(r() * palette.length)] : '#1b1d2c';
      x.globalAlpha = on ? 0.6 + r() * 0.4 : 1;
      x.fillRect(col * 16 + 3, row * 8 + 2, 10, 5);
    }
  }
  x.globalAlpha = 1;
  const t = tex(c);
  cache.set(key, t);
  return t;
}

export function containerTexture() {
  if (cache.has('container')) return cache.get('container');
  const [c, x] = canvas(128, 64);
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 64);
  for (let i = 0; i < 128; i += 6) {
    x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(i, 0, 2, 64);
    x.fillStyle = 'rgba(255,255,255,0.3)'; x.fillRect(i + 2, 0, 1, 64);
  }
  x.fillStyle = 'rgba(0,0,0,0.3)';
  x.fillRect(0, 0, 128, 3); x.fillRect(0, 61, 128, 3);
  const t = tex(c);
  cache.set('container', t);
  return t;
}

export function glowTexture() {
  if (cache.has('glow')) return cache.get('glow');
  const [c, x] = canvas(64, 64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = tex(c, { repeat: false, srgb: false });
  cache.set('glow', t);
  return t;
}

export function smokeTexture() {
  if (cache.has('smoke')) return cache.get('smoke');
  const [c, x] = canvas(64, 64);
  const r = rng(3);
  for (let i = 0; i < 14; i++) {
    const px = 18 + r() * 28, py = 18 + r() * 28, rad = 8 + r() * 14;
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  }
  const t = tex(c, { repeat: false, srgb: false });
  cache.set('smoke', t);
  return t;
}

export function bannerTexture(text, bg = '#111', fg = '#fff', accent = '#ff3b6b') {
  const key = 'banner' + text + bg + fg + accent;
  if (cache.has(key)) return cache.get(key);
  const [c, x] = canvas(1024, 128);
  x.fillStyle = bg; x.fillRect(0, 0, 1024, 128);
  x.fillStyle = accent; x.fillRect(0, 0, 1024, 10); x.fillRect(0, 118, 1024, 10);
  x.font = 'italic 76px "Russo One", Impact, sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = fg;
  x.fillText(text, 512, 68);
  const t = tex(c, { repeat: false });
  cache.set(key, t);
  return t;
}

export function coinTexture() {
  if (cache.has('coin')) return cache.get('coin');
  const [c, x] = canvas(128, 128);
  const g = x.createRadialGradient(54, 50, 6, 64, 64, 64);
  g.addColorStop(0, '#fff7c2'); g.addColorStop(0.5, '#ffcc33'); g.addColorStop(1, '#b97800');
  x.fillStyle = g; x.beginPath(); x.arc(64, 64, 64, 0, 7); x.fill();
  x.strokeStyle = '#a86a00'; x.lineWidth = 6; x.beginPath(); x.arc(64, 64, 50, 0, 7); x.stroke();
  x.fillStyle = '#c98a00';
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 15 : 34;
    x.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  x.closePath(); x.fill();
  const t = tex(c, { repeat: false });
  cache.set('coin', t);
  return t;
}
