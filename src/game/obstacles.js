import * as THREE from 'three';
import { clamp } from '../core/util.js';

// Moving hazards on the track. Each obstacle is one or more oriented boxes
// whose pose is a pure function of time, so physics, visuals and the AI's
// look-ahead all agree on where things are.
//   slide  - block sliding from side to side
//   sweep  - spinning bar around a centre post
//   hammer - pendulum swinging across the road from an overhead gantry
//   piston - crusher slamming down on one half of the road

function stripeTexture(a, b) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = a; x.fillRect(0, 0, 64, 64);
  x.fillStyle = b;
  for (let i = -2; i < 4; i++) {
    x.beginPath();
    x.moveTo(i * 32, 64); x.lineTo(i * 32 + 16, 64); x.lineTo(i * 32 + 48, 0); x.lineTo(i * 32 + 32, 0);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export class Obstacles {
  constructor(path, theme) {
    this.path = path;
    this.group = new THREE.Group();
    this.list = [];
    const col = theme.obstacle || { a: '#222', b: '#ffd23f', glow: '#ff3b3b' };
    const stripes = stripeTexture(col.a, col.b);
    this.mats = {
      stripe: new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.4, metalness: 0.3, emissive: col.b, emissiveIntensity: 0.15 }),
      dark: new THREE.MeshStandardMaterial({ color: col.a, roughness: 0.4, metalness: 0.6 }),
      glow: new THREE.MeshBasicMaterial({ color: col.glow, toneMapped: false }),
      warn: new THREE.MeshBasicMaterial({ color: '#ff2a2a', toneMapped: false }),
    };
    for (const spec of path.obstacles) this._make(spec);
    this.update(0);
  }

  _frame(i) {
    const p = this.path;
    return {
      x: p.px[i], y: p.py[i], z: p.pz[i], rx: p.rx[i], rz: p.rz[i], yaw: p.heading[i],
    };
  }

  _make(spec) {
    const p = this.path, W = p.halfWidth, m = this.mats;
    const f = this._frame(spec.i);
    const root = new THREE.Group();
    root.position.set(f.x, f.y, f.z);
    root.rotation.y = f.yaw;
    this.group.add(root);
    const o = { ...spec, f, root, boxes: [], omega: spec.speed };
    const box = (w, h, d, mat) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    const gantry = (height) => {
      for (const s of [-1, 1]) {
        const post = box(1, height, 1, m.dark);
        post.position.set(s * (p.wallDist + 0.8), height / 2 - 1, 0);
        root.add(post);
      }
      const beam = box((p.wallDist + 1.3) * 2, 1, 1.2, m.stripe);
      beam.position.y = height - 1;
      root.add(beam);
      const light = box((p.wallDist + 1.3) * 2, 0.2, 1.3, m.glow);
      light.position.y = height - 1.6;
      root.add(light);
    };
    switch (spec.type) {
      case 'slide': {
        o.w = 4.6; o.h = 3; o.d = 3;
        o.mesh = box(o.w, o.h, o.d, m.stripe);
        const trim = box(o.w + 0.2, 0.25, o.d + 0.2, m.glow);
        trim.position.y = o.h / 2;
        o.mesh.add(trim);
        o.amp = W - o.w / 2 - 0.4;
        o.omega = 0.85 * spec.speed;
        root.add(o.mesh);
        break;
      }
      case 'sweep': {
        o.len = (W - 1.2) * 2;
        o.post = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 2.6, 16), m.dark);
        o.post.position.y = 1.3;
        root.add(o.post);
        o.mesh = new THREE.Group();
        const bar = box(o.len, 1.1, 0.9, m.stripe);
        o.mesh.add(bar);
        for (const s of [-1, 1]) {
          const cap = box(0.5, 1.3, 1.1, m.glow);
          cap.position.x = s * o.len / 2;
          o.mesh.add(cap);
        }
        o.mesh.position.y = 1.2;
        root.add(o.mesh);
        o.omega = 1.0 * spec.speed;
        break;
      }
      case 'hammer': {
        o.pivot = 15; o.arm = 11.5; o.head = 3.6;
        gantry(16.5);
        o.mesh = new THREE.Group();
        o.mesh.position.y = o.pivot;
        const arm = box(0.5, o.arm, 0.5, m.dark);
        arm.position.y = -o.arm / 2;
        o.mesh.add(arm);
        const head = box(o.head, o.head, o.head + 0.6, m.stripe);
        head.position.y = -o.arm;
        o.mesh.add(head);
        const core = box(o.head + 0.1, 0.4, o.head + 0.7, m.glow);
        core.position.y = -o.arm;
        o.mesh.add(core);
        root.add(o.mesh);
        o.omega = 1.35 * spec.speed;
        break;
      }
      case 'piston': {
        o.w = W - 0.6; o.d = 4; o.h = 3.4;
        o.lat = spec.side * (W / 2 + 0.2);
        gantry(12);
        o.mesh = box(o.w, o.h, o.d, m.stripe);
        o.rod = box(0.8, 1, 0.8, m.dark);
        o.light = box(o.w + 0.1, 0.3, o.d + 0.1, m.warn);
        o.mesh.add(o.light);
        o.light.position.y = -o.h / 2 + 0.1;
        root.add(o.mesh, o.rod);
        o.mesh.position.x = -o.lat; // local x points left
        o.rod.position.x = -o.lat;
        o.period = 3.2 / spec.speed;
        break;
      }
    }
    this.list.push(o);
  }

  // Pose helpers (pure functions of time) ----------------------------------
  slideLat(o, t) { return o.amp * Math.sin(t * o.omega + o.phase); }
  sweepAngle(o, t) { return t * o.omega + o.phase; }
  hammerTheta(o, t) { return 1.15 * Math.sin(t * o.omega + o.phase); }
  // piston height above the road: slams down fast, waits, rises slowly
  pistonLift(o, t) {
    const k = (((t + o.phase) / o.period) % 1 + 1) % 1;
    if (k < 0.08) return 7 * (1 - k / 0.08) ** 2;    // slam
    if (k < 0.26) return 0;                           // crushed
    if (k < 0.46) return 7 * ((k - 0.26) / 0.2);      // rise
    return 7;                                         // up: safe to pass
  }

  update(t) {
    this.t = t;
    for (const o of this.list) {
      switch (o.type) {
        case 'slide': o.mesh.position.set(-this.slideLat(o, t), o.h / 2, 0); break;
        case 'sweep': o.mesh.rotation.y = this.sweepAngle(o, t); break;
        case 'hammer': o.mesh.rotation.z = this.hammerTheta(o, t); break;
        case 'piston': {
          const lift = this.pistonLift(o, t);
          o.mesh.position.y = lift + o.h / 2;
          const top = lift + o.h, beam = 10.4;
          o.rod.scale.y = Math.max(0.1, beam - top);
          o.rod.position.y = (beam + top) / 2;
          const k = (((t + o.phase) / o.period) % 1 + 1) % 1;
          o.light.visible = k > 0.85 || k < 0.26 ? Math.floor(t * 10) % 2 === 0 : false;
          break;
        }
      }
    }
  }

  // Oriented boxes in world space at time t: [cx, cy, cz, yaw, hx, hy, hz, vLat]
  boxes(o, t, out) {
    out.length = 0;
    const f = o.f, rx = f.rx, rz = f.rz;
    const at = (lat, y) => [f.x + rx * lat, f.y + y, f.z + rz * lat];
    switch (o.type) {
      case 'slide': {
        const lat = this.slideLat(o, t);
        const [x, y, z] = at(lat, o.h / 2);
        out.push([x, y, z, f.yaw, o.w / 2, o.h / 2, o.d / 2, o.amp * o.omega * Math.cos(t * o.omega + o.phase)]);
        break;
      }
      case 'sweep': {
        const a = this.sweepAngle(o, t);
        out.push([f.x, f.y + 1.2, f.z, f.yaw + a, o.len / 2, 0.55, 0.45, 0]);
        out.push([f.x, f.y + 1.3, f.z, f.yaw, 1.2, 1.3, 1.2, 0]);
        break;
      }
      case 'hammer': {
        const th = this.hammerTheta(o, t);
        const lat = -Math.sin(th) * o.arm; // rotation.z swings toward local -x = road right
        const y = o.pivot - Math.cos(th) * o.arm;
        const [x, yy, z] = at(lat, y);
        out.push([x, yy, z, f.yaw, o.head / 2, o.head / 2, o.head / 2 + 0.3, 0]);
        break;
      }
      case 'piston': {
        const lift = this.pistonLift(o, t);
        const [x, y, z] = at(o.lat, lift + o.h / 2);
        out.push([x, y, z, f.yaw, o.w / 2, o.h / 2, o.d / 2, 0]);
        break;
      }
    }
    return out;
  }

  // Push a car out of any obstacle it touches. Returns impact speed.
  collide(car, t) {
    let impact = 0;
    const tmp = this._tmp || (this._tmp = []);
    for (const o of this.list) {
      if (Math.abs(o.i - car.proj.idx) > 14) continue;
      for (const b of this.boxes(o, t, tmp)) {
        const [cx, cy, cz, yaw, hx, hy, hz, vLat] = b;
        if (car.pos.y > cy + hy || car.pos.y + 1.5 < cy - hy) continue;
        const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
        for (const k of [-1.1, 1.1]) {
          const px = car.pos.x + Math.sin(car.heading) * k, pz = car.pos.z + Math.cos(car.heading) * k;
          const dx = px - cx, dz = pz - cz;
          const lx = dx * rx + dz * rz, lz = dx * fx + dz * fz;
          const qx = clamp(lx, -hx, hx), qz = clamp(lz, -hz, hz);
          let ex = lx - qx, ez = lz - qz;
          let dist = Math.hypot(ex, ez);
          const R = 1.15;
          if (dist >= R) continue;
          if (dist < 1e-4) {
            // centre inside the box: leave by the nearest face
            const ox = hx - Math.abs(lx), oz = hz - Math.abs(lz);
            if (ox < oz) { ex = Math.sign(lx) || 1; ez = 0; dist = -ox; } else { ex = 0; ez = Math.sign(lz) || 1; dist = -oz; }
          } else { ex /= dist; ez /= dist; }
          const nx = ex * rx + ez * fx, nz = ex * rz + ez * fz;
          const pen = R - dist;
          car.pos.x += nx * pen; car.pos.z += nz * pen;
          // obstacle's own motion (sliders shove you sideways)
          const ovx = rx * vLat, ovz = rz * vLat;
          const rvx = car.vx - ovx, rvz = car.vz - ovz;
          const vn = rvx * nx + rvz * nz;
          if (vn < 0) {
            car.vx -= nx * vn * 1.5; car.vz -= nz * vn * 1.5;
            car.vx *= 0.82; car.vz *= 0.82;
            impact = Math.max(impact, -vn);
          }
        }
      }
    }
    if (impact > 0) {
      car.drift.active = false; car.drift.tier = 0;
      car.wallHit = Math.max(car.wallHit, impact);
      car.obstacleHit = impact;
    }
    return impact;
  }

  // For the AI: where should a car at lateral `lat`, `ds` metres before the
  // obstacle and moving at `v`, steer to? Returns a lateral target or null.
  dodge(o, ds, v, lat) {
    const W = this.path.halfWidth;
    const t = this.t + ds / Math.max(8, v);
    switch (o.type) {
      case 'slide': {
        const ol = this.slideLat(o, t);
        if (Math.abs(ol - lat) > o.w / 2 + 2) return null;
        return ol > 0 ? Math.max(-W + 1.6, ol - o.w / 2 - 2.4) : Math.min(W - 1.6, ol + o.w / 2 + 2.4);
      }
      case 'sweep': return Math.abs(lat) < 3.5 ? (lat >= 0 ? W * 0.6 : -W * 0.6) : null;
      case 'hammer': {
        const th = this.hammerTheta(o, t);
        if (o.pivot - Math.cos(th) * o.arm - o.head / 2 > 1.6) return null;
        const hl = -Math.sin(th) * o.arm;
        if (Math.abs(hl - lat) > o.head / 2 + 2) return null;
        return hl > 0 ? -W * 0.65 : W * 0.65;
      }
      case 'piston': {
        if (this.pistonLift(o, t) > 2.2) return null;
        return o.lat > 0 ? -W * 0.5 : W * 0.5;
      }
    }
    return null;
  }
}
