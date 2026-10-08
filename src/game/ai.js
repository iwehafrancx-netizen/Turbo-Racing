import { clamp, wrapAngle, rng } from '../core/util.js';

// Rival driver. Follows the track with a look-ahead target, plans corner
// speed from the track's precomputed safe-speed profile, weaves around
// traffic, uses nitro on straights and rubber-bands to keep races close.
export class AIDriver {
  constructor(car, path, skill, seed) {
    this.car = car;
    this.path = path;
    this.skill = skill;
    this.r = rng(seed);
    this.lane = (this.r() - 0.5) * path.halfWidth;
    this.laneTarget = this.lane;
    this.laneTimer = 0;
    this.avoid = 0;
    this.nitroCooldown = 2 + this.r() * 4;
    this.mistake = 0;
    this.personality = 0.97 + this.r() * 0.06; // some rivals are a touch quicker
    this.controls = { throttle: 0, brake: 0, steer: 0, drift: false, nitro: false };
  }

  update(dt, cars, player, raceTime) {
    const car = this.car, p = this.path, c = this.controls;
    const idx = car.proj.idx;
    const speed = Math.max(0, car.vF);

    // --- rubber band: close the gap when behind, ease off when far ahead ---
    const gap = car.progress - player.progress;
    let band = 1;
    if (gap < -40) band = 1 + Math.min(0.08, (-gap - 40) / 1000);
    else if (gap > 60) band = 1 - Math.min(0.12, (gap - 60) / 1000);
    if (player.finished) band = 1;
    car.topMul = this.skill * this.personality * band;

    // --- lane choice ---
    this.laneTimer -= dt;
    if (this.laneTimer <= 0) {
      this.laneTimer = 2 + this.r() * 3;
      // prefer the inside of the next corner a little
      const ahead = p.wrap(idx + 30);
      const inside = -Math.sign(p.curv[ahead]) * p.halfWidth * 0.35;
      this.laneTarget = clamp(inside + (this.r() - 0.5) * p.halfWidth * 0.9, -p.halfWidth * 0.75, p.halfWidth * 0.75);
    }
    // --- avoid cars just ahead ---
    let avoid = 0;
    for (const o of cars) {
      if (o === car) continue;
      let ds = o.proj.s - car.proj.s;
      if (ds < -p.length / 2) ds += p.length;
      if (ds > p.length / 2) ds -= p.length;
      if (ds > 0 && ds < 16 + speed * 0.25) {
        const dl = o.proj.lat - (car.proj.lat);
        if (Math.abs(dl) < 3.2) {
          const dir = o.proj.lat > 0 ? -1 : 1;
          avoid += dir * (3.6 - Math.abs(dl)) * 1.4;
        }
      }
    }
    this.avoid = this.avoid + (avoid - this.avoid) * Math.min(1, dt * 4);
    this.lane += (this.laneTarget - this.lane) * Math.min(1, dt * 0.8);
    const lat = clamp(this.lane + this.avoid, -p.halfWidth * 0.85, p.halfWidth * 0.85);

    // --- steering toward a look-ahead point ---
    const look = Math.round((8 + speed * 0.42) / p.spacing);
    const ti = p.wrap(idx + look);
    const tx = p.px[ti] + p.rx[ti] * lat, tz = p.pz[ti] + p.rz[ti] * lat;
    const want = Math.atan2(tx - car.pos.x, tz - car.pos.z);
    const err = wrapAngle(want - car.heading);
    c.steer = clamp(-err * 2.6, -1, 1);

    // --- speed planning ---
    let safe = Infinity;
    const scan = Math.round((20 + speed * 1.2) / p.spacing);
    for (let k = 0; k < scan; k += 2) {
      const v = p.safeSpeed[p.wrap(idx + k)];
      if (v < safe) safe = v;
    }
    const corner = 0.9 + this.skill * 0.18;
    const target = Math.min(car.stats.maxSpeed * car.topMul * 1.3, safe * corner);
    if (this.mistake > 0) this.mistake -= dt;
    else if (this.r() < dt * 0.02 * (1.1 - this.skill)) this.mistake = 0.4 + this.r() * 0.5;

    c.throttle = speed < target - 1 && this.mistake <= 0 ? 1 : speed < target ? 0.4 : 0;
    c.brake = speed > target + 4 ? clamp((speed - target) / 10, 0.2, 1) : 0;
    if (raceTime < 0) { c.throttle = 0; c.brake = 0; }

    // --- nitro on straights ---
    this.nitroCooldown -= dt;
    c.nitro = false;
    if (car.nitro > 0.3 && this.nitroCooldown <= 0 && safe > speed * 1.25 && Math.abs(err) < 0.1) {
      this.nitroBurst = 1 + this.r() * 1.2;
      this.nitroCooldown = 5 + this.r() * 6;
    }
    if (this.nitroBurst > 0) { this.nitroBurst -= dt; c.nitro = true; }

    // AI gains nitro steadily (stands in for its drifting)
    car.nitro = Math.min(car.stats.nitroCap, car.nitro + dt * 0.035);
    c.drift = false;

    // stuck recovery
    if (speed < 2 && raceTime > 2) {
      this.stuck = (this.stuck || 0) + dt;
      if (this.stuck > 2.5) { car.respawn(); this.stuck = 0; }
    } else this.stuck = 0;
    return c;
  }
}
