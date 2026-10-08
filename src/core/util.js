// Small math / random helpers shared across the game.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

// Deterministic PRNG so every track looks the same on every play.
export function rng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth 2D value noise + fBm.
export class Noise2D {
  constructor(seed = 1) {
    const r = rng(seed);
    this.p = new Uint8Array(512);
    const perm = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
    this.v = new Float32Array(256);
    for (let i = 0; i < 256; i++) this.v[i] = r() * 2 - 1;
  }
  noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const p = this.p, X = xi & 255, Y = yi & 255;
    const a = this.v[p[p[X] + Y]], b = this.v[p[p[X + 1] + Y]];
    const c = this.v[p[p[X] + Y + 1]], d = this.v[p[p[X + 1] + Y + 1]];
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  fbm(x, y, oct = 4) {
    let sum = 0, amp = 1, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += this.noise(x * f, y * f) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  }
}

export function formatTime(t) {
  if (!isFinite(t) || t <= 0) return '--:--.---';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t * 1000) % 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
