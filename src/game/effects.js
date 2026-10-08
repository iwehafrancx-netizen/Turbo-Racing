import * as THREE from 'three';
import { glowTexture, smokeTexture } from '../world/textures.js';
import { DRIFT_COLORS } from './car.js';

const PVS = /* glsl */ `
attribute float size; attribute vec4 rgba;
varying vec4 vC;
uniform float scale;
void main() {
  vC = rgba;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const PFS = /* glsl */ `
uniform sampler2D map; varying vec4 vC;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vC.rgb * t.rgb, vC.a * t.a);
  if (gl_FragColor.a < 0.01) discard;
}`;

class Particles {
  constructor(max, tex, additive) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('rgba', this.aCol);
    g.setAttribute('size', this.aSize);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 600 } },
      vertexShader: PVS, fragmentShader: PFS,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }
  spawn(x, y, z, vx, vy, vz, life, s0, s1, color, alpha, drag = 1, grav = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = alpha;
    this.col[i * 4] = color.r; this.col[i * 4 + 1] = color.g; this.col[i * 4 + 2] = color.b;
    this.drag[i] = drag; this.grav[i] = grav;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const t = 1 - this.life[i] / this.maxLife[i];
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.col[i * 4 + 3] = this.a0[i] * (1 - t) * Math.min(1, t * 8);
    }
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.aSize.needsUpdate = true;
  }
  clear() { this.life.fill(0); }
}

class SkidMarks {
  constructor(max = 1400) {
    this.max = max;
    this.pos = new Float32Array(max * 4 * 3);
    this.col = new Float32Array(max * 4 * 4);
    const idx = [];
    for (let i = 0; i < max; i++) { const b = i * 4; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('color', this.aCol);
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    this.mesh.frustumCulled = false;
    this.cursor = 0;
    this.last = new Map();
  }
  add(key, x, y, z, rx, rz, alpha, tint) {
    const prev = this.last.get(key);
    this.last.set(key, [x, y, z]);
    if (!prev) return;
    const dx = x - prev[0], dz = z - prev[2];
    if (dx * dx + dz * dz < 0.25) { this.last.set(key, prev); return; }
    if (dx * dx + dz * dz > 25) return;
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const w = 0.16;
    const p = this.pos, b = i * 12;
    p[b] = prev[0] - rx * w; p[b + 1] = prev[1] + 0.04; p[b + 2] = prev[2] - rz * w;
    p[b + 3] = prev[0] + rx * w; p[b + 4] = prev[1] + 0.04; p[b + 5] = prev[2] + rz * w;
    p[b + 6] = x - rx * w; p[b + 7] = y + 0.04; p[b + 8] = z - rz * w;
    p[b + 9] = x + rx * w; p[b + 10] = y + 0.04; p[b + 11] = z + rz * w;
    for (let v = 0; v < 4; v++) {
      const c = i * 16 + v * 4;
      this.col[c] = tint.r; this.col[c + 1] = tint.g; this.col[c + 2] = tint.b; this.col[c + 3] = alpha;
    }
    this.dirty = true;
  }
  lift(key) { this.last.delete(key); }
  flush() {
    if (!this.dirty) return;
    this.aPos.needsUpdate = true; this.aCol.needsUpdate = true;
    this.dirty = false;
  }
  clear() { this.col.fill(0); this.aCol.needsUpdate = true; this.last.clear(); }
}

const C = (h) => new THREE.Color(h);
const SMOKE = C('#d8d8d8'), SPARK = C('#ffb347'), NITRO = C('#5ad8ff'), WHITE = C('#ffffff'), GOLD = C('#ffd23f');
const TIER = DRIFT_COLORS.map(C);

export class Effects {
  constructor(scene, theme) {
    this.smoke = new Particles(700, smokeTexture(), false);
    this.glow = new Particles(900, glowTexture(), true);
    this.skids = new SkidMarks();
    const dark = theme.road.icy || theme.road.snowy ? C('#6a7a8a') : C('#0a0a0a');
    this.skidTint = dark;
    this.smokeColor = theme.road.snowy || theme.road.icy ? C('#e4eef8') : theme.road.dirt ? C('#b89a70') : SMOKE;
    this.smokeAlpha = theme.road.snowy || theme.road.icy ? 0.6 : 1;
    scene.add(this.smoke.points, this.glow.points, this.skids.mesh);
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
  }

  attachFlames(car) {
    const mk = () => {
      const g = new THREE.ConeGeometry(0.16, 1.2, 10, 1, true);
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0, -0.6);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      m.visible = false;
      m.userData.own = true;
      return m;
    };
    car.flames = car.exhaust.map((p) => {
      const f = mk();
      f.position.copy(p);
      car.body.add(f);
      const inner = mk();
      inner.scale.set(0.5, 0.5, 0.6);
      inner.material = inner.material.clone();
      inner.material.color.set('#ffffff');
      f.add(inner);
      return f;
    });
  }

  updateCar(car, dt, time, isClose) {
    // flames
    if (car.flames) {
      const on = car.boosting;
      const tier = car.boostTime > 0 && !car.nitroActive ? '#ffb347' : '#7fe8ff';
      for (const f of car.flames) {
        f.visible = on;
        if (on) {
          const s = 0.8 + Math.random() * 0.6;
          f.scale.set(1 + Math.random() * 0.3, 1 + Math.random() * 0.3, s * (car.nitroActive ? 1.5 : 1));
          f.material.color.set(tier);
        }
      }
    }
    if (!isClose) return;
    const speed = car.speed;
    const drifting = car.drift.active && car.onGround;
    const rx = Math.cos(car.heading), rz = -Math.sin(car.heading);
    // tyre smoke + skids
    for (let k = 0; k < 2; k++) {
      const w = car.worldPoint(car.rearWheels[k], this.tmp);
      const key = car.name + k;
      if (drifting || (car.onGround && car.sliding && speed > 12)) {
        this.skids.add(key, w.x, w.y, w.z, rx, rz, drifting ? 0.55 : 0.3, this.skidTint);
        if (Math.random() < (drifting ? 0.9 : 0.25)) {
          this.smoke.spawn(w.x, w.y + 0.3, w.z, (Math.random() - 0.5) * 2 - car.vx * 0.05, 1 + Math.random(), (Math.random() - 0.5) * 2 - car.vz * 0.05,
            1.0 + Math.random() * 0.5, 1.0, 3.6, this.smokeColor, (drifting ? 0.35 : 0.15) * this.smokeAlpha, 1.2, -0.6);
        }
        if (drifting && car.drift.tier > 0 && Math.random() < 0.8) {
          const c = TIER[car.drift.tier - 1];
          this.glow.spawn(w.x, w.y + 0.15, w.z, car.vx * 0.7 + (Math.random() - 0.5) * 6, 2 + Math.random() * 3, car.vz * 0.7 + (Math.random() - 0.5) * 6, 0.3, 0.32, 0.06, c, 1, 2, 12);
        }
      } else this.skids.lift(key);
    }
    // exhaust sparks while boosting
    if (car.boosting) {
      for (const e of car.exhaust) {
        const p = car.worldPoint(e, this.tmp);
        const col = car.nitroActive ? NITRO : SPARK;
        if (Math.random() < 0.6) this.glow.spawn(p.x, p.y, p.z, car.vx * 0.6 - Math.sin(car.heading) * 6 + (Math.random() - 0.5) * 2, Math.random(), car.vz * 0.6 - Math.cos(car.heading) * 6 + (Math.random() - 0.5) * 2,
          0.14, 0.22, 0.04, col, 0.55, 3, 0);
      }
    }
    // dust when off the tarmac
    if (car.onGround && Math.abs(car.proj.lat) > car.path.halfWidth + 0.6 && speed > 10 && Math.random() < 0.6) {
      const p = car.worldPoint(car.rearWheels[Math.random() < 0.5 ? 0 : 1], this.tmp);
      this.smoke.spawn(p.x, p.y + 0.3, p.z, 0, 1.5, 0, 1, 1, 3.5, this.smokeColor, 0.35, 1, -0.3);
    }
  }

  sparks(x, y, z, n = 14, color = SPARK) {
    for (let i = 0; i < n; i++) {
      this.glow.spawn(x, y, z, (Math.random() - 0.5) * 14, Math.random() * 7, (Math.random() - 0.5) * 14, 0.4 + Math.random() * 0.3, 0.28, 0.05, color, 1, 1.5, 18);
    }
  }
  coinBurst(p) {
    for (let i = 0; i < 12; i++) this.glow.spawn(p.x, p.y, p.z, (Math.random() - 0.5) * 8, Math.random() * 6, (Math.random() - 0.5) * 8, 0.5, 0.5, 0.05, GOLD, 1, 2, 6);
  }
  burst(p, colorHex, n = 24) {
    const c = C(colorHex);
    for (let i = 0; i < n; i++) this.glow.spawn(p.x, p.y + 0.5, p.z, (Math.random() - 0.5) * 12, Math.random() * 8, (Math.random() - 0.5) * 12, 0.6, 0.6, 0.05, c, 1, 2, 8);
  }
  landing(p) {
    for (let i = 0; i < 16; i++) this.smoke.spawn(p.x, p.y + 0.2, p.z, (Math.random() - 0.5) * 10, Math.random() * 2, (Math.random() - 0.5) * 10, 0.8, 1, 4, this.smokeColor, 0.4, 3, 0);
  }

  update(dt) {
    this.smoke.update(dt);
    this.glow.update(dt);
    this.skids.flush();
  }

  setScale(h) { this.smoke.mat.uniforms.scale.value = h * 0.9; this.glow.mat.uniforms.scale.value = h * 0.9; }

  dispose(scene) {
    scene.remove(this.smoke.points, this.glow.points, this.skids.mesh);
  }
}

export { WHITE };
