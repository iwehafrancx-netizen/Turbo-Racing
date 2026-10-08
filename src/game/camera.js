import * as THREE from 'three';
import { damp, clamp, lerp } from '../core/util.js';

const MODES = [
  { dist: 7.2, height: 2.5, look: 1.25, fov: 62 },
  { dist: 10.5, height: 3.6, look: 1.4, fov: 60 },
  { dist: 15, height: 7, look: 0.8, fov: 55 },
];

export class ChaseCam {
  constructor(camera, path) {
    this.cam = camera;
    this.path = path;
    this.mode = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.shakeAmt = 0;
    this.yaw = 0;
    this.fov = 62;
    this.state = 'chase';
    this.t = 0;
    this._p = { idx: 0, f: 0, lat: 0, s: 0 };
  }

  setMode(m) { this.mode = m % MODES.length; }
  shake(a) { this.shakeAmt = Math.max(this.shakeAmt, a); }

  snap(car) {
    this.yaw = car.heading;
    this._dt = 1;
    this._target(car, this.pos, this.look);
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
  }

  intro(car) { this.state = 'intro'; this.t = 0; this.introCar = car; }
  finish(car) { this.state = 'finish'; this.t = 0; this.finishCar = car; }
  chase() { this.state = 'chase'; }

  _target(car, outPos, outLook) {
    const m = MODES[this.mode];
    // follow mostly the car's heading, a bit of its velocity in drifts
    const vYaw = car.speed > 5 ? Math.atan2(car.vx, car.vz) : car.heading;
    let d = vYaw - car.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const want = car.heading + d * 0.35;
    let dy = want - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, this._dt * 7);
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const dist = m.dist + Math.min(2, car.speed * 0.02);
    outPos.set(car.pos.x - fx * dist, car.pos.y + m.height, car.pos.z - fz * dist);
    outLook.set(car.pos.x + fx * 6, car.pos.y + m.look, car.pos.z + fz * 6);
  }

  update(dt, car, time) {
    this._dt = dt;
    const cam = this.cam;
    if (this.state === 'intro') {
      this.t += dt;
      const k = clamp(this.t / 3.2, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      const ang = car.heading + Math.PI * (1.15 - e * 1.15) + 0.0001;
      const r = lerp(14, MODES[this.mode].dist, e);
      const h = lerp(5, MODES[this.mode].height, e);
      const tp = new THREE.Vector3(car.pos.x - Math.sin(ang) * r, car.pos.y + h, car.pos.z - Math.cos(ang) * r);
      cam.position.copy(tp);
      cam.lookAt(car.pos.x, car.pos.y + 1, car.pos.z);
      this.yaw = car.heading;
      this.fov = 60;
      if (k >= 1) { this.state = 'chase'; this.snap(car); }
    } else if (this.state === 'finish') {
      this.t += dt;
      const ang = car.heading + Math.PI * 0.75 + this.t * 0.35;
      const tp = new THREE.Vector3(car.pos.x - Math.sin(ang) * 9, car.pos.y + 2.6, car.pos.z - Math.cos(ang) * 9);
      cam.position.lerp(tp, Math.min(1, dt * 3));
      cam.lookAt(car.pos.x, car.pos.y + 0.9, car.pos.z);
      this.fov = damp(this.fov, 55, 3, dt);
    } else {
      const tp = this._tp || (this._tp = new THREE.Vector3());
      const tl = this._tl || (this._tl = new THREE.Vector3());
      this._target(car, tp, tl);
      this.pos.x = damp(this.pos.x, tp.x, 14, dt);
      this.pos.z = damp(this.pos.z, tp.z, 14, dt);
      this.pos.y = damp(this.pos.y, tp.y, car.onGround ? 8 : 4, dt);
      // keep the camera above the road surface
      const pr = this.path.project(this.pos.x, this.pos.y, this.pos.z, car.proj.idx, this._p, 20);
      const g = this.path.surfaceY(pr.idx, pr.f, Math.max(-this.path.wallDist, Math.min(this.path.wallDist, pr.lat)));
      if (this.pos.y < g + 1.2) this.pos.y = g + 1.2;
      this.look.lerp(tl, Math.min(1, dt * 18));
      cam.position.copy(this.pos);
      if (this.shakeAmt > 0.001) {
        const s = this.shakeAmt;
        cam.position.x += (Math.random() - 0.5) * s;
        cam.position.y += (Math.random() - 0.5) * s;
        cam.position.z += (Math.random() - 0.5) * s;
        this.shakeAmt *= Math.exp(-dt * 8);
      }
      cam.lookAt(this.look);
      const sf = clamp(car.speed / 70, 0, 1.3);
      const targetFov = MODES[this.mode].fov + sf * 12 + (car.boosting ? 9 : 0);
      this.fov = damp(this.fov, targetFov, 4, dt);
    }
    if (Math.abs(cam.fov - this.fov) > 0.05) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }
}
