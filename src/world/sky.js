import * as THREE from 'three';
import { glowTexture } from './textures.js';
import { rng } from '../core/util.js';

const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FS = /* glsl */ `
uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom;
uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunSize;
uniform float stars; uniform float time; uniform float aurora; uniform float nebula;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n2(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  float a = hash(vec3(i, 1.0)), b = hash(vec3(i + vec2(1,0), 1.0)), c = hash(vec3(i + vec2(0,1), 1.0)), d = hash(vec3(i + vec2(1,1), 1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += n2(p) * a; p *= 2.1; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = y > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.65, y), 0.8)) : mix(horizon, bottom, smoothstep(0.0, -0.25, y));
  // sun + glow
  float sd = max(dot(d, normalize(sunDir)), 0.0);
  col += sunColor * (pow(sd, 8.0) * 0.35 + pow(sd, 64.0) * 0.6);
  if (sunSize > 0.0) col += sunColor * smoothstep(1.0 - sunSize * 0.02, 1.0 - sunSize * 0.015, sd) * 2.0;
  // stars
  if (stars > 0.0 && y > -0.05) {
    vec3 c = floor(d * 320.0);
    float h = hash(c);
    float tw = 0.6 + 0.4 * sin(time * 2.0 + h * 50.0);
    col += vec3(smoothstep(0.9965, 1.0, h)) * stars * tw * smoothstep(-0.05, 0.25, y);
  }
  // nebula
  if (nebula > 0.0) {
    vec2 q = vec2(d.x * 2.4 + d.z * 1.3, d.y * 3.0 + d.z * 1.7); // seamless (no atan wrap)
    float n = fbm(q * 1.4 + vec2(time * 0.005, 0.0));
    float m = fbm(q * 2.3 - 3.0);
    col += vec3(0.55, 0.15, 0.75) * pow(n, 2.5) * 1.2 * nebula + vec3(0.1, 0.5, 0.8) * pow(m, 3.0) * 0.9 * nebula;
  }
  // aurora curtains
  if (aurora > 0.0 && y > 0.05) {
    float a = atan(d.z, d.x);
    float band = sin(a * 3.0 + time * 0.15 + sin(a * 7.0 + time * 0.3) * 0.6);
    float h = smoothstep(0.08, 0.25, y) * smoothstep(0.75, 0.3, y);
    float curtain = smoothstep(0.3, 1.0, band) * h;
    float rays = 0.6 + 0.4 * sin(a * 90.0 + time);
    vec3 ac = mix(vec3(0.1, 1.0, 0.6), vec3(0.6, 0.3, 1.0), smoothstep(0.2, 0.6, y));
    col += ac * curtain * rays * 0.9 * aurora;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const PARTICLES = {
  rain: { count: 1800, color: '#9ecbff', size: 0, fall: 38, drift: 0, box: 60, opacity: 0.45, lines: true },
  snow: { count: 1600, color: '#ffffff', size: 0.35, fall: 3.2, drift: 1.2, box: 70, opacity: 0.9 },
  embers: { count: 900, color: '#ff7a2a', size: 0.4, fall: -2.5, drift: 1.5, box: 80, opacity: 0.95, additive: true },
  fireflies: { count: 400, color: '#e8ff7a', size: 0.4, fall: 0.2, drift: 1.6, box: 70, opacity: 0.9, additive: true },
  dust: { count: 500, color: '#f2c890', size: 0.6, fall: 0.3, drift: 5, box: 80, opacity: 0.35 },
  stardust: { count: 1200, color: '#c9b6ff', size: 0.5, fall: 0, drift: 0.6, box: 120, opacity: 0.9, additive: true },
  sparkles: { count: 600, color: '#ffffff', size: 0.45, fall: 0.4, drift: 2, box: 80, opacity: 0.9, additive: true },
  goldDust: { count: 600, color: '#ffd86b', size: 0.35, fall: -0.3, drift: 1.5, box: 80, opacity: 0.9, additive: true },
  petals: { count: 900, color: '#ffb7d5', size: 0.55, fall: 1.6, drift: 3, box: 80, opacity: 0.95 },
  bubbles: { count: 600, color: '#c8ffff', size: 0.6, fall: -1.5, drift: 1.2, box: 80, opacity: 0.6, additive: true },
};

export class Atmosphere {
  constructor(theme, quality, path) {
    this.group = new THREE.Group();
    const s = theme.sky;
    this.theme0 = s;
    this.uniforms = {
      top: { value: new THREE.Color(s.top) },
      horizon: { value: new THREE.Color(s.horizon) },
      bottom: { value: new THREE.Color(s.bottom) },
      sunDir: { value: new THREE.Vector3(...theme.sunDir).normalize() },
      sunColor: { value: new THREE.Color(s.sun) },
      sunSize: { value: s.sunSize },
      stars: { value: s.stars },
      time: { value: 0 },
      aurora: { value: s.aurora ? 1 : 0 },
      nebula: { value: s.nebula ? 1 : 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: SKY_VS, fragmentShader: SKY_FS,
      side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    this.group.add(this.dome);

    if (theme.clouds) {
      this._cloudSea(theme, path);
      this._wisps(theme, quality);
    }
    this.flash = 0;
    this.lightning = !!theme.lightning;
    this.nextBolt = 4;

    const pc = PARTICLES[theme.particles];
    if (pc) this._particles(pc, quality);
  }

  _cloudSea(theme, path) {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(255,255,255,0)';
    x.fillRect(0, 0, 512, 512);
    const r = rng(42);
    for (let i = 0; i < 220; i++) {
      const px = r() * 512, py = r() * 512, rad = 20 + r() * 70;
      for (const [ox, oy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) {
        const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, rad);
        g.addColorStop(0, 'rgba(255,255,255,0.5)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = g;
        x.fillRect(px + ox - rad, py + oy - rad, rad * 2, rad * 2);
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10, 10);
    this.cloudTex = t;
    const b = path.bounds(0);
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const cl = theme.clouds;
    const base = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshBasicMaterial({ color: cl.base, fog: !cl.lava }));
    base.rotation.x = -Math.PI / 2;
    base.position.set(cx, theme.clouds.level - 12, cz);
    this.group.add(base);
    for (let k = 0; k < 2; k++) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(6000, 6000),
        new THREE.MeshBasicMaterial({ map: k ? t.clone() : t, transparent: true, depthWrite: false, color: new THREE.Color(cl.top).multiplyScalar(k ? 1 : 0.85) }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(cx, theme.clouds.level - 8 + k * 6, cz);
      if (k) { this.cloudTex2 = m.material.map; this.cloudTex2.repeat.set(7, 7); this.cloudTex2.needsUpdate = true; }
      this.group.add(m);
    }
  }

  // Big soft cloud puffs drifting around the camera: sells speed and height.
  _wisps(theme, quality) {
    const n = quality === 'low' ? 40 : 80;
    const r = rng(77);
    this.wBase = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.wBase[i * 3] = (r() - 0.5) * 600;
      this.wBase[i * 3 + 1] = (r() - 0.5) * 120;
      this.wBase[i * 3 + 2] = (r() - 0.5) * 600;
    }
    this.wPos = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.wPos, 3));
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.6)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.18)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this.wisps = new THREE.Points(g, new THREE.PointsMaterial({
      size: 70, map: tex, color: theme.clouds.top, transparent: true, opacity: 0.45, depthWrite: false, sizeAttenuation: true,
    }));
    this.wisps.frustumCulled = false;
    this.wn = n;
    this.group.add(this.wisps);
  }

  _particles(pc, quality) {
    const n = Math.round(pc.count * (quality === 'low' ? 0.4 : quality === 'medium' ? 0.7 : 1));
    this.pc = pc;
    this.pn = n;
    const r = rng(9);
    this.pBase = new Float32Array(n * 3);
    this.pPhase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.pBase[i * 3] = (r() - 0.5) * pc.box * 2;
      this.pBase[i * 3 + 1] = (r() - 0.5) * pc.box;
      this.pBase[i * 3 + 2] = (r() - 0.5) * pc.box * 2;
      this.pPhase[i] = r() * 100;
    }
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(n * 3 * (pc.lines ? 2 : 1));
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    let obj;
    if (pc.lines) {
      obj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: pc.color, transparent: true, opacity: pc.opacity }));
    } else {
      obj = new THREE.Points(geo, new THREE.PointsMaterial({
        color: pc.color, size: pc.size, map: glowTexture(), transparent: true, opacity: pc.opacity, toneMapped: false,
        depthWrite: false, blending: pc.additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true,
      }));
    }
    obj.frustumCulled = false;
    this.points = obj;
    this.group.add(obj);
    this.pTime = 0;
  }

  update(dt, camera, time) {
    this.uniforms.time.value = time;
    this.dome.position.copy(camera.position);
    if (this.cloudTex) { this.cloudTex.offset.x += dt * 0.003; }
    if (this.cloudTex2) { this.cloudTex2.offset.y += dt * 0.002; }
    if (this.wisps) {
      const W = this.wPos, B = this.wBase, cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
      const wrap = (v, size) => ((v % size) + size * 1.5) % size - size / 2;
      for (let i = 0; i < this.wn; i++) {
        W[i * 3] = wrap(B[i * 3] + time * 3 - cx, 600) + cx;
        W[i * 3 + 1] = wrap(B[i * 3 + 1] - cy + 20, 120) + cy - 20;
        W[i * 3 + 2] = wrap(B[i * 3 + 2] - cz, 600) + cz;
      }
      this.wisps.geometry.attributes.position.needsUpdate = true;
    }
    // lightning
    this.bolt = false;
    this.flash = Math.max(0, this.flash - dt * 3);
    if (this.lightning) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.flash = 1;
        this.bolt = true;
        this.nextBolt = 3 + Math.random() * 6;
      } else if (this.flash > 0.4 && this.flash < 0.5 && Math.random() < 0.3) this.flash = 0.9; // flicker
      this.uniforms.top.value.set(this.theme0.top).lerp(this._white || (this._white = new THREE.Color('#c8d4ff')), this.flash * 0.6);
      this.uniforms.horizon.value.set(this.theme0.horizon).lerp(this._white, this.flash * 0.7);
    }
    if (!this.pc) return;
    const pc = this.pc, n = this.pn, B = pc.box;
    this.pTime += dt;
    const t = this.pTime;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const P = this.pPos, base = this.pBase;
    const wrap = (v, size) => ((v % size) + size * 1.5) % size - size / 2;
    for (let i = 0; i < n; i++) {
      const ph = this.pPhase[i];
      let x = base[i * 3] + Math.sin(t * 0.5 + ph) * pc.drift;
      let y = base[i * 3 + 1] - t * pc.fall;
      let z = base[i * 3 + 2] + Math.cos(t * 0.4 + ph) * pc.drift;
      // keep particles in a box around the camera
      x = wrap(x - cx, B * 2) + cx;
      y = wrap(y - cy, B) + cy;
      z = wrap(z - cz, B * 2) + cz;
      // keep particles out of the camera's face (they'd fill the screen)
      const ddx = x - cx, ddy = y - cy, ddz = z - cz;
      if (ddx * ddx + ddy * ddy + ddz * ddz < 25) y += 10;
      if (pc.lines) {
        P[i * 6] = x; P[i * 6 + 1] = y; P[i * 6 + 2] = z;
        P[i * 6 + 3] = x + 0.05; P[i * 6 + 4] = y + 1.1; P[i * 6 + 5] = z;
      } else {
        P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
