import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { clamp, damp, wrapAngle } from '../core/util.js';
import { glowTexture } from '../world/textures.js';

const G = 32; // gravity (arcade-strong for snappy jumps)
export const DRIFT_TIERS = [0.85, 1.9, 3.1];
export const DRIFT_COLORS = ['#4fc3ff', '#ff9a1f', '#d65cff'];

// ---------------- model loading ----------------
export async function loadCarModels(cars, onProgress) {
  const draco = new DRACOLoader();
  draco.setDecoderPath('lib/three/draco/');
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  const out = new Map();
  let done = 0;
  await Promise.all(cars.map(async (def) => {
    const gltf = await loader.loadAsync(def.file);
    out.set(def.id, prepareTemplate(gltf.scene, def));
    onProgress?.(++done / cars.length);
  }));
  draco.dispose();
  return out;
}

function prepareTemplate(scene, def) {
  scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = false;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      // Transmission re-renders the scene per material: far too slow for a racer.
      if (m.transmission > 0) {
        m.transmission = 0;
        m.transparent = true;
        m.opacity = 0.45;
        m.roughness = 0.05;
        m.metalness = 0.6;
        m.color?.multiplyScalar(0.25);
        m.depthWrite = false;
      }
      if (m.map) m.map.anisotropy = 4;
      m.envMapIntensity = 1.6;
    }
  });
  const holder = new THREE.Group();
  holder.add(scene);
  holder.updateMatrixWorld(true);
  // Centre on the wheels and put tyres on the ground.
  const wheels = [];
  scene.traverse((o) => { if (def.wheels.test(o.name)) wheels.push(o); });
  const box = new THREE.Box3().setFromObject(scene);
  const c = new THREE.Vector3();
  let minY = box.min.y;
  if (wheels.length) {
    const wb = new THREE.Box3();
    for (const w of wheels) wb.union(new THREE.Box3().setFromObject(w));
    wb.getCenter(c);
    minY = wb.min.y;
  } else {
    box.getCenter(c);
  }
  scene.position.set(-c.x, -minY, -c.z);
  holder.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(scene);
  if (wheels.length) {
    // some models carry invisible helper geometry: trust the wheelbase instead
    const wb = new THREE.Box3();
    for (const w of wheels) wb.union(new THREE.Box3().setFromObject(w));
    bb.max.z = Math.min(bb.max.z, wb.max.z + 1.3);
    bb.min.z = Math.max(bb.min.z, wb.min.z - 1.4);
  } else console.warn('[car] no wheels matched for', def.id);
  return { holder, def, box: bb, wheelCount: wheels.length };
}

// Build a drivable visual instance from a template (geometry/materials shared).
export function createCarVisual(tpl) {
  const model = tpl.holder.clone(true);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(model);
  root.updateMatrixWorld(true);
  const wheels = [];
  const calipers = [];
  model.traverse((o) => {
    if (tpl.def.wheels.test(o.name)) wheels.push(o);
    else if (tpl.def.calipers && tpl.def.calipers.test(o.name)) calipers.push(o);
  });
  const pivots = [];
  for (const w of wheels) {
    const b = new THREE.Box3().setFromObject(w);
    const ctr = b.getCenter(new THREE.Vector3());
    const steer = new THREE.Object3D();
    steer.position.copy(body.worldToLocal(ctr.clone()));
    body.add(steer);
    const spin = new THREE.Object3D();
    steer.add(spin);
    root.updateMatrixWorld(true);
    spin.attach(w);
    pivots.push({ steer, spin, front: ctr.z > 0, radius: Math.max(0.3, (b.max.y - b.min.y) / 2), ctr });
  }
  for (const cp of calipers) {
    const ctr = new THREE.Box3().setFromObject(cp).getCenter(new THREE.Vector3());
    let best = null, bd = Infinity;
    for (const p of pivots) { const d = p.ctr.distanceTo(ctr); if (d < bd) { bd = d; best = p; } }
    if (best) best.steer.attach(cp);
  }
  return { root, body, pivots };
}

// ---------------- vehicle ----------------
export class Vehicle {
  constructor(tpl, stats, path, { isPlayer = false, name = 'You', night = false } = {}) {
    const inst = createCarVisual(tpl);
    this.root = inst.root;
    this.body = inst.body;
    this.pivots = inst.pivots;
    this.box = tpl.box;
    this.def = tpl.def;
    this.stats = stats;
    this.path = path;
    this.isPlayer = isPlayer;
    this.name = name;
    this.length = this.box.max.z - this.box.min.z;
    this.halfW = (this.box.max.x - this.box.min.x) / 2;
    this.exhaust = [
      new THREE.Vector3(0.45, 0.42, this.box.min.z + 0.15),
      new THREE.Vector3(-0.45, 0.42, this.box.min.z + 0.15),
    ];
    this.rearWheels = [
      new THREE.Vector3(this.halfW - 0.25, 0.05, this.box.min.z + 0.95),
      new THREE.Vector3(-this.halfW + 0.25, 0.05, this.box.min.z + 0.95),
    ];
    this._addLights(night);
    this.reset(0, 0);
  }

  _addLights(night) {
    const tex = glowTexture();
    const mk = (color, size, x, y, z, op) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.scale.setScalar(size);
      s.position.set(x, y, z);
      s.userData.own = true;
      this.body.add(s);
      return s;
    };
    const f = this.box.max.z - 0.15, r = this.box.min.z + 0.1, w = this.halfW - 0.3;
    this.tail = [mk('#ff2020', night ? 0.7 : 0.35, w, 0.78, r, night ? 0.8 : 0.25), mk('#ff2020', night ? 0.7 : 0.35, -w, 0.78, r, night ? 0.8 : 0.25)];
    if (night) {
      mk('#fff6d8', 0.9, w, 0.7, f, 0.85);
      mk('#fff6d8', 0.9, -w, 0.7, f, 0.85);
      if (this.isPlayer) {
        const beam = new THREE.Mesh(
          new THREE.ConeGeometry(5, 26, 20, 1, true),
          new THREE.MeshBasicMaterial({ color: '#fff3c8', transparent: true, opacity: 0.035, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
        );
        beam.rotation.x = -Math.PI / 2;
        beam.userData.own = true;
        beam.position.set(0, 0.8, f + 13);
        this.body.add(beam);
      }
    }
  }

  reset(i, lat) {
    const p = this.path;
    i = p.wrap(i);
    this.pos = p.pointAt(i, lat);
    this.heading = p.heading[i];
    this.vx = 0; this.vz = 0; this.vy = 0;
    this.vF = 0;
    this.onGround = true;
    this.airTime = 0;
    this.proj = { idx: i, f: 0, lat, s: i * p.spacing };
    this.lastGround = this.pos.y;
    this.steerVis = 0;
    this.drift = { active: false, dir: 0, time: 0, tier: 0 };
    this.boostTime = 0;
    this.nitroActive = false;
    this.ghost = 0;
    this.topMul = 1;
    this.wallHit = 0;
    this.landed = 0;
    this.fallen = false;
    this.slipstream = 0;
    this.bodyRoll = 0;
    this.bodyPitch = 0;
    this.upVec = new THREE.Vector3(0, 1, 0);
    this.quat = new THREE.Quaternion();
    this._syncVisual(1);
  }

  // Race-level state lives here too so AI and player share it.
  initRace(i, lat) {
    this.reset(i, lat);
    this.lap = 0;
    this.lastS = this.proj.s;
    this.progress = this.proj.s - this.path.length;
    this.finished = false;
    this.finishTime = 0;
    this.nitro = 0.25;
    this.lapStart = 0;
    this.bestLap = Infinity;
    this.stuckTime = 0;
    this.wrongWay = 0;
    this.lastSafeIdx = i;
  }

  get speed() { return Math.hypot(this.vx, this.vz); }
  get boosting() { return this.boostTime > 0 || this.nitroActive; }

  step(dt, c) {
    const st = this.stats, path = this.path;
    this.wallHit = 0;
    this.landed = 0;
    const events = this.events || (this.events = {});
    events.boostPad = false; events.miniTurbo = 0; events.driftStart = false;

    // ---- nitro ----
    if (c.nitro && this.nitro > 0.02) {
      this.nitroActive = true;
      this.nitro = Math.max(0, this.nitro - dt * 0.38 / st.nitroCap);
    } else this.nitroActive = false;
    if (this.boostTime > 0) this.boostTime -= dt;
    const boosting = this.boosting;

    const sinH = Math.sin(this.heading), cosH = Math.cos(this.heading);
    let vF = this.vx * sinH + this.vz * cosH;
    let vR = -this.vx * cosH + this.vz * sinH;
    const grip = path.grip * st.handling;
    const offroad = Math.abs(this.proj.lat) > path.halfWidth + 0.6 && path.shoulder > 1.5;
    const top = st.maxSpeed * this.topMul * (boosting ? 1.3 : 1) * (offroad ? 0.72 : 1);
    const spd = Math.abs(vF);
    const total = Math.hypot(vF, vR);

    // ---- steering input smoothing ----
    this.steerVis = damp(this.steerVis, c.steer, 12, dt);

    if (this.onGround) {
      const d = this.drift;
      let a = 0;
      // the speed limiter works on total speed so sliding never adds speed
      if (c.throttle > 0) {
        if (total < top) {
          const r = total / top;
          a += st.accel * c.throttle * (1 - r * r * 0.82);
          if (boosting) a += 16 * st.nitroPower;
        } else a -= (total - top) * 1.4;
      } else {
        a -= vF > 0 ? 3.5 : vF < 0 ? -3.5 : 0;
        if (total > top) a -= (total - top) * 1.4;
      }
      if (c.brake > 0) {
        if (vF > 1) a -= 34 * c.brake;
        else if (vF > -15) a -= 13 * c.brake;
      }
      a -= 0.0006 * vF * Math.abs(vF);
      if (offroad) a -= 0.25 * vF;
      // tyre scrub while sliding sideways
      a -= Math.sign(vF) * Math.abs(vR) * (d.active ? 0.12 : 0.5);
      vF += a * dt;
      if (!c.throttle && !c.brake && Math.abs(vF) < 0.6) vF = 0;

      // ---- drift state ----
      if (!d.active && c.drift && Math.abs(c.steer) > 0.25 && vF > 13) {
        d.active = true; d.dir = Math.sign(c.steer); d.time = 0; d.tier = 0;
        this.hopT = 0.28; // little visual hop into the drift
        events.driftStart = true;
      }
      if (d.active && (!c.drift || vF < 9 || this.wallHitRecent > 0.6)) {
        if (d.tier > 0) {
          const t = [0, 0.75, 1.25, 1.9][d.tier];
          this.boostTime = Math.max(this.boostTime, t);
          events.miniTurbo = d.tier;
        }
        d.active = false; d.time = 0; d.tier = 0;
      }

      // ---- yaw ----
      const auth = Math.min(1, spd / 7) * (1 - 0.45 * Math.min(1, spd / 75));
      let yaw;
      if (d.active) {
        yaw = (d.dir * 0.95 + c.steer * 0.6) * 1.75 * Math.min(1, spd / 10);
        const into = c.steer * d.dir;
        d.time += dt * (0.75 + 0.35 * Math.max(0, into)) * st.drift;
        d.tier = d.time > DRIFT_TIERS[2] ? 3 : d.time > DRIFT_TIERS[1] ? 2 : d.time > DRIFT_TIERS[0] ? 1 : 0;
        this.nitro = Math.min(st.nitroCap, this.nitro + dt * 0.1 * st.drift);
      } else {
        // grip driving: the tyres decide how hard you can turn (understeer, never spin)
        const cap = (1.15 * 40 * grip) / Math.max(8, spd);
        yaw = clamp(this.steerVis * 2.05 * grip * auth, -cap, cap);
      }
      this.heading -= yaw * dt * (vF < -0.5 ? -1 : 1);

      // ---- lateral grip ----
      // tyres can only pull so hard: overcook a corner and you slide wide,
      // drift through it and you hold a tighter line at speed
      const before = Math.hypot(vF, vR);
      const latGrip = d.active ? 2.6 : 10 * grip;
      let dR = vR * (1 - Math.exp(-latGrip * dt));
      const maxLat = (d.active ? 56 : 40) * grip * dt;
      if (Math.abs(dR) > maxLat) dR = Math.sign(dR) * maxLat;
      vR -= dR;
      this.sliding = Math.abs(vR) > 4 && !d.active;
      const keep = Math.sqrt(Math.max(0, before * before - vR * vR));
      if (Math.abs(vF) > 0.5) vF = Math.sign(vF) * keep;

      this.vx = sinH * vF - cosH * vR;
      this.vz = cosH * vF + sinH * vR;

      // ---- slip-angle limit: big slides, but never a spin-out ----
      if (vF > 5) {
        const vd = Math.atan2(this.vx, this.vz);
        const maxSlip = d.active ? 0.7 : 0.26;
        const diff = wrapAngle(this.heading - vd);
        if (Math.abs(diff) > maxSlip) this.heading = vd + Math.sign(diff) * maxSlip;
      }

      // boost pads
      for (const b of path.boosts) {
        const di = (this.proj.idx - b.i + path.N) % path.N;
        if (di * path.spacing < b.len && Math.abs(this.proj.lat - b.lat) < b.w / 2 + 0.6) {
          if (this.boostTime < 0.9) events.boostPad = true;
          this.boostTime = Math.max(this.boostTime, 1.2);
        }
      }
    } else {
      // airborne: gentle air steering, no traction
      this.heading -= this.steerVis * 0.9 * dt;
      this.airTime += dt;
      this.nitro = Math.min(st.nitroCap, this.nitro + dt * 0.12);
      if (boosting) {
        this.vx += sinH * 6 * dt; this.vz += cosH * 6 * dt;
      }
      if (this.drift.active && this.airTime > 0.6) { this.drift.active = false; this.drift.tier = 0; }
    }
    this.vF = vF;
    this.wallHitRecent = Math.max(0, (this.wallHitRecent || 0) - dt);

    // ---- integrate ----
    this.pos.x += this.vx * dt;
    this.pos.z += this.vz * dt;
    this.vy -= G * dt;
    this.pos.y += this.vy * dt;

    const pr = path.project(this.pos.x, this.pos.y, this.pos.z, this.proj.idx, this.proj);

    // ---- walls ----
    const lim = path.wallDist - this.halfW - 0.05;
    if (Math.abs(pr.lat) > lim && !path.open[pr.idx]) {
      const side = Math.sign(pr.lat);
      const nx = path.rx[pr.idx] * side, nz = path.rz[pr.idx] * side;
      const over = Math.abs(pr.lat) - lim;
      this.pos.x -= nx * over; this.pos.z -= nz * over;
      pr.lat = side * lim;
      const vn = this.vx * nx + this.vz * nz;
      if (vn > 0) {
        this.vx -= nx * vn * 1.35; this.vz -= nz * vn * 1.35;
        const loss = 1 - Math.min(0.35, vn / 60);
        this.vx *= loss; this.vz *= loss;
        this.wallHit = vn;
        if (vn > 6) this.wallHitRecent = 1;
        // steer the nose back along the track (arcade forgiveness)
        const th = path.heading[pr.idx];
        const fwd = Math.cos(wrapAngle(this.heading - th)) > 0 ? th : th + Math.PI;
        this.heading += wrapAngle(fwd - this.heading) * Math.min(0.5, vn / 30);
      }
    }

    // ---- ground ----
    const ground = path.groundAt(pr);
    const stick = this.onGround ? 0.25 : 0.03;
    if (ground > -Infinity && this.pos.y <= ground + stick && this.pos.y > ground - 2.5) {
      if (!this.onGround && this.airTime > 0.2) this.landed = Math.max(1, -this.vy);
      const gv = clamp((ground - this.lastGround) / dt, -30, 30);
      this.pos.y = ground;
      this.vy = this.onGround ? gv : Math.max(gv, 0);
      this.onGround = true;
      this.airTime = 0;
    } else {
      this.onGround = false;
    }
    this.lastGround = ground > -Infinity ? ground : this.pos.y;
    if (this.pos.y < path.py[pr.idx] - 14) this.fallen = true;
    if (this.onGround && !path.gap[pr.idx]) this.lastSafeIdx = pr.idx;
    if (this.ghost > 0) this.ghost -= dt;
    return events;
  }

  // Lap bookkeeping, called after step.
  updateProgress(raceTime, totalLaps) {
    const L = this.path.length;
    const s = this.proj.s;
    const ds = s - this.lastS;
    let crossed = 0;
    if (ds < -L / 2) { this.lap++; crossed = 1; }
    else if (ds > L / 2) { this.lap--; crossed = -1; }
    this.lastS = s;
    this.progress = (this.lap - 1) * L + s;
    let lapDone = null;
    if (crossed === 1 && this.lap >= 2) {
      const t = raceTime - this.lapStart;
      lapDone = t;
      if (t < this.bestLap) this.bestLap = t;
      this.lapStart = raceTime;
    } else if (crossed === 1 && this.lap === 1) {
      this.lapStart = raceTime;
    }
    if (!this.finished && this.lap > totalLaps) {
      this.finished = true;
      this.finishTime = raceTime;
    }
    return lapDone;
  }

  respawn() {
    const p = this.path;
    const i = p.wrap(this.lastSafeIdx - 12);
    let k = i;
    for (let n = 0; n < 60 && p.gap[k]; n++) k = p.wrap(k - 1);
    const keepLap = this.lap, keepLast = this.lastS;
    this.reset(k, 0);
    this.lap = keepLap; this.lastS = keepLast;
    const s = this.proj.s;
    if (s - keepLast > p.length / 2) this.lap--; else if (s - keepLast < -p.length / 2) this.lap++;
    this.lastS = s;
    this.vF = 18;
    this.vx = Math.sin(this.heading) * 18;
    this.vz = Math.cos(this.heading) * 18;
    this.ghost = 2;
  }

  _syncVisual(t) {
    const p = this.path;
    const target = this.onGround ? p.upAt(this.proj.idx, this._up || (this._up = new THREE.Vector3())) : this.upVec;
    this.upVec.lerp(target, t).normalize();
    const f = this._f || (this._f = new THREE.Vector3());
    f.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    // pitch with vertical velocity in the air
    if (!this.onGround) f.y = clamp(this.vy * 0.012, -0.35, 0.3);
    f.addScaledVector(this.upVec, -f.dot(this.upVec)).normalize();
    const x = this._x || (this._x = new THREE.Vector3());
    x.crossVectors(this.upVec, f).normalize();
    const m = this._m || (this._m = new THREE.Matrix4());
    m.makeBasis(x, this.upVec, f);
    const q = this._q || (this._q = new THREE.Quaternion());
    q.setFromRotationMatrix(m);
    this.root.quaternion.copy(q);
    this.root.position.copy(this.pos);
  }

  updateVisual(dt, time) {
    this._syncVisual(Math.min(1, dt * 10));
    // body roll / pitch for weight transfer
    const latA = this.steerVis * Math.min(1, Math.abs(this.vF) / 30);
    this.bodyRoll = damp(this.bodyRoll, latA * 0.05 + (this.drift.active ? this.drift.dir * 0.03 : 0), 6, dt);
    this.bodyPitch = damp(this.bodyPitch, this.boosting ? -0.025 : 0, 5, dt);
    this.body.rotation.set(this.bodyPitch, 0, this.bodyRoll);
    this.hopT = Math.max(0, (this.hopT || 0) - dt);
    this.body.position.y = Math.sin((this.hopT / 0.28) * Math.PI) * 0.22;
    for (const w of this.pivots) {
      w.spin.rotation.x += (this.vF * dt) / w.radius;
      if (w.front) w.steer.rotation.y = -this.steerVis * 0.42;
    }
    // blink while ghosted after respawn
    this.root.visible = this.ghost > 0 ? Math.floor(time * 12) % 2 === 0 : true;
  }

  // Free the per-car extras (lights, flames); the model itself is shared.
  dispose() {
    this.root.traverse((o) => {
      if (!o.userData.own) return;
      o.geometry?.dispose();
      o.material?.dispose();
    });
  }

  worldPoint(local, target) {
    return target.copy(local).applyMatrix4(this.body.matrixWorld);
  }
}

// Simple two-circle car-vs-car collisions.
export function collideCars(cars, onHit) {
  const R = 1.15;
  for (let a = 0; a < cars.length; a++) {
    const A = cars[a];
    if (A.ghost > 0) continue;
    for (let b = a + 1; b < cars.length; b++) {
      const B = cars[b];
      if (B.ghost > 0) continue;
      const dx0 = B.pos.x - A.pos.x, dz0 = B.pos.z - A.pos.z;
      if (dx0 * dx0 + dz0 * dz0 > 49 || Math.abs(B.pos.y - A.pos.y) > 2.5) continue;
      for (const ka of [-1.1, 1.1]) {
        for (const kb of [-1.1, 1.1]) {
          const ax = A.pos.x + Math.sin(A.heading) * ka, az = A.pos.z + Math.cos(A.heading) * ka;
          const bx = B.pos.x + Math.sin(B.heading) * kb, bz = B.pos.z + Math.cos(B.heading) * kb;
          const dx = bx - ax, dz = bz - az;
          const d2 = dx * dx + dz * dz;
          if (d2 > 4 * R * R || d2 < 1e-6) continue;
          const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, over = 2 * R - d;
          A.pos.x -= nx * over * 0.5; A.pos.z -= nz * over * 0.5;
          B.pos.x += nx * over * 0.5; B.pos.z += nz * over * 0.5;
          const rv = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
          if (rv < 0) {
            const j = -rv * 0.6;
            A.vx -= nx * j; A.vz -= nz * j;
            B.vx += nx * j; B.vz += nz * j;
            onHit?.(A, B, -rv);
          }
        }
      }
    }
  }
}
