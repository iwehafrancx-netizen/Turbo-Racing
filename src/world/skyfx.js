import * as THREE from 'three';
import { rng } from '../core/util.js';
import { glowTexture, bannerTexture } from './textures.js';

// Animated sky set pieces. Each theme lists the ones it wants in `skyfx`.
// They live far from the road, so they never affect driving.

const basic = (color, opts = {}) => new THREE.MeshBasicMaterial({ color, toneMapped: false, fog: false, ...opts });

export class SkyFX {
  constructor(theme, path, quality, atmo) {
    this.group = new THREE.Group();
    this.theme = theme;
    this.atmo = atmo;
    this.updaters = [];
    this.r = rng(99);
    const b = path.bounds(0);
    this.center = new THREE.Vector3((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
    this.radius = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) / 2;
    this.cloudY = theme.clouds?.level ?? b.minY - 60;
    this.lowQ = quality === 'low';
    this.path = path;
    // the way the race heads: big set pieces go here so you drive toward them
    const si = Math.round(path.startS / path.spacing), fi = Math.round(path.finishS / path.spacing);
    this.ahead = new THREE.Vector3(path.px[fi] - path.px[si], 0, path.pz[fi] - path.pz[si]).normalize();
    for (const fx of theme.skyfx || []) this[fx]?.();
  }

  // direction from the track centre toward the sun, flattened to the horizon
  _horizonDir() {
    return this.ahead.clone();
  }
  _far(dir, dist, y) {
    return this.center.clone().addScaledVector(dir, dist).setY(y);
  }

  shootingStars() {
    const n = 4;
    const stars = [];
    for (let k = 0; k < n; k++) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(-60, 8, 0)]);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, fog: false }));
      this.group.add(l);
      stars.push({ l, t0: this.r() * 8, dir: new THREE.Vector3() });
    }
    this.updaters.push((t) => {
      for (const s of stars) {
        const k = (t - s.t0) % 7;
        if (k < 0.016 || !s.started) {
          s.started = true;
          const a = this.r() * Math.PI * 2;
          s.l.position.set(this.center.x + Math.cos(a) * (this.radius + 400), this.center.y + 250 + this.r() * 200, this.center.z + Math.sin(a) * (this.radius + 400));
          s.l.rotation.y = this.r() * 6;
        }
        s.l.material.opacity = k < 1.2 ? Math.sin((k / 1.2) * Math.PI) : 0;
        s.l.position.y -= 1.2;
        s.l.translateX(14);
      }
    });
  }

  meteors() {
    const n = 6;
    const ms = [];
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(new THREE.ConeGeometry(4, 50, 8), basic('#ff8a3d', { transparent: true, opacity: 0.9 }));
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(5, 0), basic('#ffd36e'));
      head.position.y = -25;
      m.add(head);
      this.group.add(m);
      ms.push({ m, t0: this.r() * 10, a: this.r() * 6 });
    }
    this.updaters.push((t) => {
      for (const s of ms) {
        const k = ((t + s.t0) % 9) / 9;
        const r = this.radius + 300;
        s.m.position.set(this.center.x + Math.cos(s.a) * r + k * 300, this.center.y + 420 - k * 520, this.center.z + Math.sin(s.a) * r);
        s.m.rotation.z = 0.55;
        s.m.visible = k < 0.95;
        if (k > 0.98) s.a = this.r() * 6;
      }
    });
  }

  birds() {
    const flocks = [];
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.6, -1.6, 0.3, -0.3, 0, 0, -0.3, 0, 0, 0.6, 1.6, 0.3, -0.3, 0, 0, -0.3], 3));
    wing.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: '#3a2a20', side: THREE.DoubleSide });
    for (let f = 0; f < 4; f++) {
      const g = new THREE.Group();
      const birds = [];
      for (let k = 0; k < 9; k++) {
        const bird = new THREE.Mesh(wing, mat);
        const row = Math.ceil(k / 2), side = k % 2 ? 1 : -1;
        bird.position.set(side * row * 3, (this.r() - 0.5) * 2, -row * 3);
        bird.scale.setScalar(2);
        g.add(bird);
        birds.push(bird);
      }
      this.group.add(g);
      flocks.push({ g, birds, r: this.radius * (0.6 + this.r() * 0.6), y: this.center.y + 30 + this.r() * 60, sp: 0.04 + this.r() * 0.03, ph: this.r() * 6 });
    }
    this.updaters.push((t) => {
      for (const fl of flocks) {
        const a = t * fl.sp + fl.ph;
        fl.g.position.set(this.center.x + Math.cos(a) * fl.r, fl.y + Math.sin(t * 0.5) * 5, this.center.z + Math.sin(a) * fl.r);
        fl.g.rotation.y = -a;
        fl.birds.forEach((b, k) => { b.scale.y = 2 * (0.4 + 0.6 * Math.abs(Math.sin(t * 6 + k))); });
      }
    });
  }

  bolts() {
    const n = 2;
    const bolts = [];
    for (let k = 0; k < n; k++) {
      const l = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#e0ecff', transparent: true, opacity: 0, fog: false }));
      this.group.add(l);
      bolts.push(l);
    }
    this.updaters.push(() => {
      if (this.atmo?.bolt) {
        for (const l of bolts) {
          const a = this.r() * Math.PI * 2, r = this.radius * (0.3 + this.r());
          let x = this.center.x + Math.cos(a) * r, z = this.center.z + Math.sin(a) * r, y = this.center.y + 260;
          const pts = [new THREE.Vector3(x, y, z)];
          while (y > this.cloudY) { y -= 20 + this.r() * 25; x += (this.r() - 0.5) * 40; z += (this.r() - 0.5) * 40; pts.push(new THREE.Vector3(x, y, z)); }
          l.geometry.dispose();
          l.geometry = new THREE.BufferGeometry().setFromPoints(pts);
        }
      }
      for (const l of bolts) l.material.opacity = this.atmo ? Math.min(1, this.atmo.flash * 1.6) : 0;
    });
  }

  // A black hole: dark core, glowing photon ring and a swirling accretion disc.
  _blackHole(pos, size) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.scale.setScalar(size);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(110, 32, 20), basic('#000000')));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float time; varying vec2 vUv;
        void main(){
          vec2 p = vUv * 2.0 - 1.0; float r = length(p); float a = atan(p.y, p.x);
          float ring = smoothstep(0.3, 0.42, r) * smoothstep(1.0, 0.5, r);
          float swirl = 0.55 + 0.45 * sin(a * 7.0 - time * 1.8 + r * 22.0);
          vec3 col = mix(vec3(1.0, 0.85, 0.6), vec3(1.0, 0.35, 0.08), smoothstep(0.35, 0.9, r));
          gl_FragColor = vec4(col * ring * swirl * 1.8, ring * swirl);
        }`,
    });
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), mat);
    disc.rotation.x = -1.35;
    g.add(disc);
    // photon ring (the bright halo light bends around the hole)
    const halo = new THREE.Mesh(new THREE.TorusGeometry(128, 9, 12, 96), basic('#ffd9a8', { transparent: true, opacity: 0.85 }));
    g.add(halo);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ff9a3d', transparent: true, opacity: 0.5, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(900);
    g.add(glow);
    this.group.add(g);
    this.updaters.push((t) => { mat.uniforms.time.value = t; halo.lookAt(this.cam || this.center); disc.rotation.z = t * 0.03; });
    return g;
  }

  // A black hole looms behind every portal gate, so you can see where you're about to dive in.
  blackhole() {
    const p = this.path;
    if (p.portals.length) {
      for (const pt of p.portals) {
        const i = pt.idx;
        const fwd = new THREE.Vector3(p.tx[i], 0, p.tz[i]).normalize();
        const at = new THREE.Vector3(p.px[i], p.py[i], p.pz[i]);
        this._blackHole(this._clearSpot(at, fwd, 300, [700, 900, 1200, 1500]), 1.4);
      }
    } else {
      this._blackHole(this._far(this.ahead.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.4), this.radius + 1300, this.center.y + 200), 1.2);
    }
  }

  // A spot ahead of `at` (raised a little) that stays `clear` metres from every part of the road.
  _clearSpot(at, fwd, clear, dists) {
    const p = this.path, side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    let best = null, bestD = -1;
    for (const d of dists) {
      for (const sw of [0, 250, -250, 500, -500]) {
        for (const up of [120, 300]) {
          const c = at.clone().addScaledVector(fwd, d).addScaledVector(side, sw).setY(at.y + up);
          let m = Infinity;
          for (let k = 0; k < p.N; k += 5) m = Math.min(m, Math.hypot(p.px[k] - c.x, p.py[k] - c.y, p.pz[k] - c.z));
          if (m >= clear) return c;
          if (m > bestD) { bestD = m; best = c; }
        }
      }
    }
    return best;
  }

  blackholeGiant() {
    this.blackhole();
    this._blackHole(this._far(this.ahead.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5), this.radius + 1600, this.center.y + 250), 2.6);
  }

  _rockGeo(r, d = 1) {
    const g = new THREE.IcosahedronGeometry(r, d);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, k);
      v.multiplyScalar(0.75 + ((Math.sin(v.x * 3.1) + Math.sin(v.y * 2.3 + v.z * 1.7)) * 0.5 + 1) * 0.16);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }

  // True when a straight flight from base along dir (±half) never comes within `clear` of the road.
  _flightClear(base, dir, half, clear) {
    const p = this.path;
    for (let d = -half; d <= half; d += 25) {
      const x = base.x + dir.x * d, y = base.y + dir.y * d, z = base.z + dir.z * d;
      for (let k = 0; k < p.N; k += 3) {
        if (Math.abs(p.px[k] - x) < clear && Math.abs(p.pz[k] - z) < clear && Math.abs(p.py[k] - y) < clear) return false;
      }
    }
    return true;
  }

  // Asteroids flying past the road, big and small, some right over your head.
  asteroidStream() {
    const n = this.lowQ ? 110 : 200;
    const p = this.path;
    const im = new THREE.InstancedMesh(this._rockGeo(1, 1), new THREE.MeshStandardMaterial({ color: '#6a5f68', roughness: 0.95, flatShading: true }), n);
    const seeds = [];
    for (let i = 0; i < n; i++) {
      let seed;
      for (let tries = 0; tries < 12; tries++) {
        const k = Math.floor(this.r() * p.N);
        const side = this.r() < 0.5 ? -1 : 1, off = side * (12 + this.r() * 220);
        const dir = new THREE.Vector3(this.r() - 0.5, (this.r() - 0.5) * 0.08, this.r() - 0.5).normalize();
        const big = this.r() < 0.15;
        seed = {
          base: new THREE.Vector3(p.px[k] + p.rx[k] * off, p.py[k] + 16 + this.r() * 90, p.pz[k] + p.rz[k] * off),
          dir, v: 8 + this.r() * 30, ph: this.r() * 600, s: big ? 8 + this.r() * 10 : 0.8 + this.r() * 3.5,
          spin: new THREE.Vector3(this.r(), this.r(), this.r()).multiplyScalar(1.5),
        };
        if (this._flightClear(seed.base, dir, 300, seed.s + 12)) break;
        seed.s = 0; // could not find a clear lane: hide it
      }
      seeds.push(seed);
      im.setColorAt(i, new THREE.Color().setHSL(0.75 + this.r() * 0.1, 0.12, 0.35 + this.r() * 0.25));
    }
    const o = new THREE.Object3D();
    this.group.add(im);
    this.updaters.push((t) => {
      for (let i = 0; i < n; i++) {
        const a = seeds[i];
        const d = ((t * a.v + a.ph) % 600) - 300;
        o.position.copy(a.base).addScaledVector(a.dir, d);
        o.rotation.set(t * a.spin.x, t * a.spin.y, t * a.spin.z);
        o.scale.setScalar(a.s);
        o.updateMatrix();
        im.setMatrixAt(i, o.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
    });
  }

  bigAsteroids() {
    const p = this.path;
    for (let k = 0; k < 10; k++) {
      const m = new THREE.Mesh(this._rockGeo(1, 2), new THREE.MeshStandardMaterial({ color: '#5a5060', roughness: 1, flatShading: true }));
      const i = Math.floor(this.r() * p.N), side = this.r() < 0.5 ? -1 : 1, off = side * (260 + this.r() * 450);
      m.position.set(p.px[i] + p.rx[i] * off, p.py[i] + (this.r() - 0.3) * 200, p.pz[i] + p.rz[i] * off);
      m.scale.setScalar(35 + this.r() * 50);
      const s = new THREE.Vector3(this.r(), this.r(), this.r()).multiplyScalar(0.05);
      this.group.add(m);
      this.updaters.push((t) => { m.rotation.set(t * s.x, t * s.y, t * s.z); });
    }
  }

  // Hover-car traffic zooming along sky lanes around the megacity.
  flyingTraffic() {
    const n = this.lowQ ? 50 : 90;
    const p = this.path;
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, 1, 4.6), new THREE.MeshStandardMaterial({ color: '#2a2a3a', metalness: 0.7, roughness: 0.3 }), n);
    const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, 0.3, 4.8), new THREE.MeshBasicMaterial({ toneMapped: false }), n);
    const seeds = [];
    for (let i = 0; i < n; i++) {
      let seed;
      for (let tries = 0; tries < 12; tries++) {
        const k = Math.floor(this.r() * p.N), side = this.r() < 0.5 ? -1 : 1, off = side * (25 + this.r() * 140);
        const fwd = this.r() < 0.5 ? 1 : -1;
        seed = { base: new THREE.Vector3(p.px[k] + p.rx[k] * off, p.py[k] + 6 + this.r() * 60, p.pz[k] + p.rz[k] * off), dir: new THREE.Vector3(p.tx[k] * fwd, 0, p.tz[k] * fwd).normalize(), v: 25 + this.r() * 35, ph: this.r() * 900 };
        if (this._flightClear(seed.base, seed.dir, 450, 12)) break;
        seed.hide = true;
      }
      seeds.push(seed);
      lights.setColorAt(i, new THREE.Color(['#ff2bd6', '#00e5ff', '#ffd23f', '#ff3b3b'][i % 4]));
    }
    const o = new THREE.Object3D();
    this.group.add(body, lights);
    this.updaters.push((t) => {
      for (let i = 0; i < n; i++) {
        const a = seeds[i];
        o.position.copy(a.base).addScaledVector(a.dir, ((t * a.v + a.ph) % 900) - 450);
        o.rotation.set(0, Math.atan2(a.dir.x, a.dir.z), 0);
        o.scale.setScalar(a.hide ? 0 : 1);
        o.updateMatrix();
        body.setMatrixAt(i, o.matrix);
        o.position.y -= 0.6; o.updateMatrix();
        lights.setMatrixAt(i, o.matrix);
      }
      body.instanceMatrix.needsUpdate = true;
      lights.instanceMatrix.needsUpdate = true;
    });
  }

  // Sweeping searchlight beams from far below.
  searchlights() {
    const p = this.path;
    const geo = new THREE.ConeGeometry(28, 420, 20, 1, true);
    geo.translate(0, -210, 0);
    for (let k = 0; k < 9; k++) {
      const i = Math.floor(this.r() * p.N), side = this.r() < 0.5 ? -1 : 1, off = side * (60 + this.r() * 200);
      const beam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: k % 3 ? '#cfe6ff' : '#ff9ae8', transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      const pivot = new THREE.Group();
      pivot.position.set(p.px[i] + p.rx[i] * off, p.py[i] - 120, p.pz[i] + p.rz[i] * off);
      beam.rotation.x = Math.PI;
      pivot.add(beam);
      this.group.add(pivot);
      const ph = this.r() * 6, sp = 0.3 + this.r() * 0.3;
      this.updaters.push((t) => { pivot.rotation.set(Math.sin(t * sp + ph) * 0.45, 0, Math.cos(t * sp * 0.8 + ph) * 0.45); });
    }
  }

  // Holographic billboards floating beside the road.
  billboards() {
    const p = this.path;
    const words = ['TURBO', 'NITRO', 'NO LIMITS', 'MEGACITY', 'FULL THROTTLE', 'OVERDRIVE'];
    for (let k = 0; k < 12; k++) {
      const i = Math.floor((k + 0.5) / 12 * p.N), side = k % 2 ? 1 : -1, off = side * (p.wallDist + 22 + this.r() * 30);
      const c = ['#ff2bd6', '#00e5ff', '#ffd23f'][k % 3];
      const mat = new THREE.MeshBasicMaterial({ map: bannerTexture(words[k % words.length], '#0a0614', c, c), transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(36, 4.5), mat);
      m.position.set(p.px[i] + p.rx[i] * off, p.py[i] + 14 + this.r() * 14, p.pz[i] + p.rz[i] * off);
      m.rotation.y = p.heading[i] + Math.PI - side * 0.5;
      this.group.add(m);
      const ph = this.r() * 10;
      this.updaters.push((t) => { mat.opacity = 0.6 + 0.3 * (Math.sin(t * 9 + ph) > -0.9 ? 1 : 0); });
    }
  }

  // Fighter jets screaming overhead with afterburner trails.
  jets() {
    const p = this.path;
    const makeJet = () => {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: '#7a828c', metalness: 0.6, roughness: 0.4, flatShading: true });
      const body = new THREE.Mesh(new THREE.ConeGeometry(1.2, 14, 6), mat); body.rotation.x = Math.PI / 2; g.add(body);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(14, 0.3, 4), mat); wing.position.z = -2; g.add(wing);
      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.4, 2.6), mat); tail.position.set(0, 1.6, -5.5); g.add(tail);
      const burn = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5, 8), basic('#ffb36b', { transparent: true, opacity: 0.9 }));
      burn.rotation.x = -Math.PI / 2; burn.position.z = -9; g.add(burn);
      const trail = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 140), basic('#ffffff', { transparent: true, opacity: 0.25 }));
      trail.position.z = -80; g.add(trail);
      return g;
    };
    const jets = [];
    for (let k = 0; k < 3; k++) {
      const j = makeJet();
      this.group.add(j);
      jets.push({ j, t0: k * 3.3 + this.r() * 2 });
    }
    this.updaters.push((t) => {
      for (const a of jets) {
        const cyc = Math.floor((t + a.t0) / 10), k = ((t + a.t0) % 10) / 10;
        if (a.cyc !== cyc) {
          a.cyc = cyc;
          const i = Math.floor(this.r() * p.N);
          const ang = this.r() * Math.PI * 2;
          a.dir = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
          a.mid = new THREE.Vector3(p.px[i], p.py[i] + 35 + this.r() * 60, p.pz[i]);
        }
        a.j.position.copy(a.mid).addScaledVector(a.dir, (k - 0.5) * 2200);
        a.j.lookAt(a.j.position.clone().add(a.dir));
      }
    });
  }

  // A twisting tornado on the horizon, dragging debris around it.
  tornado() {
    const g = new THREE.Group();
    g.position.copy(this._far(this.ahead.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.35), this.radius + 500, this.cloudY - 20));
    const rings = [];
    for (let k = 0; k < 16; k++) {
      const r = 14 + k * k * 0.9;
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, 6 + k * 1.2, 6, 24), new THREE.MeshStandardMaterial({ color: '#4a5266', roughness: 1, transparent: true, opacity: 0.55, flatShading: true }));
      m.rotation.x = Math.PI / 2;
      m.position.y = k * 22;
      g.add(m);
      rings.push(m);
    }
    const debris = new THREE.InstancedMesh(this._rockGeo(1, 0), new THREE.MeshStandardMaterial({ color: '#3a3a44', flatShading: true }), 60);
    g.add(debris);
    this.group.add(g);
    const o = new THREE.Object3D();
    const x0 = g.position.x, z0 = g.position.z;
    this.updaters.push((t) => {
      rings.forEach((m, k) => { m.rotation.z = t * (2.4 - k * 0.1); m.position.x = Math.sin(t * 0.6 + k * 0.4) * k * 1.2; });
      for (let i = 0; i < 60; i++) {
        const h = (i * 7.3) % 330, a = t * (2 - h / 300) + i;
        o.position.set(Math.cos(a) * (20 + h * 0.6), h, Math.sin(a) * (20 + h * 0.6));
        o.rotation.set(t + i, t * 2, i);
        o.scale.setScalar(1 + (i % 5));
        o.updateMatrix();
        debris.setMatrixAt(i, o.matrix);
      }
      debris.instanceMatrix.needsUpdate = true;
      g.position.x = x0 + Math.sin(t * 0.05) * 120;
      g.position.z = z0 + Math.cos(t * 0.04) * 120;
    });
  }

  // Flying saucers drifting around the course, some with tractor beams.
  ufos() {
    const p = this.path;
    for (let k = 0; k < 7; k++) {
      const u = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.SphereGeometry(8, 24, 10), new THREE.MeshStandardMaterial({ color: '#8a96a8', metalness: 0.8, roughness: 0.3 }));
      hull.scale.set(1, 0.28, 1);
      u.add(hull);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#7dff9a', transparent: true, opacity: 0.7, emissive: '#2a8a4a' }));
      dome.position.y = 1.2;
      u.add(dome);
      for (let l = 0; l < 10; l++) {
        const a = (l / 10) * Math.PI * 2;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4), basic(l % 2 ? '#c06bff' : '#7dff9a'));
        bulb.position.set(Math.cos(a) * 7.2, -0.6, Math.sin(a) * 7.2);
        u.add(bulb);
      }
      if (k % 2 === 0) {
        const beam = new THREE.Mesh(new THREE.ConeGeometry(9, 60, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#9dff7a', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        beam.position.y = -30;
        u.add(beam);
      }
      const i = Math.floor(this.r() * p.N), side = this.r() < 0.5 ? -1 : 1, off = side * (40 + this.r() * 150);
      const base = new THREE.Vector3(p.px[i] + p.rx[i] * off, p.py[i] + 35 + this.r() * 50, p.pz[i] + p.rz[i] * off);
      this.group.add(u);
      const ph = this.r() * 6, rad = 20 + this.r() * 40;
      this.updaters.push((t) => {
        u.position.set(base.x + Math.cos(t * 0.3 + ph) * rad, base.y + Math.sin(t * 1.3 + ph) * 3, base.z + Math.sin(t * 0.3 + ph) * rad);
        u.rotation.y = t * 1.5;
        u.rotation.z = Math.sin(t + ph) * 0.1;
      });
    }
  }

  alienPlanet() {
    this._ringPlanet(this.ahead.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.5).setY(0.22).normalize(), 1500, 300, [380, 520], '#9dffb0', 120);
  }

  twinMoons() {
    const dir = this.ahead.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.6);
    [['#e0c8ff', 90, 0.32, 0], ['#ffd6a0', 55, 0.45, 0.25]].forEach(([c, r, up, rot]) => {
      const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rot).setY(up).normalize();
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), basic(c));
      m.position.copy(this.center).addScaledVector(d, 1600);
      this.group.add(m);
    });
  }

  // A giant rotating space station ring.
  stationRing() {
    const g = new THREE.Group();
    g.position.copy(this._far(this.ahead.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.7), this.radius + 900, this.center.y + 120));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(260, 16, 12, 96), new THREE.MeshStandardMaterial({ color: '#8a90a0', metalness: 0.7, roughness: 0.35 }));
    g.add(ring);
    const windows = new THREE.Mesh(new THREE.TorusGeometry(260, 16.5, 4, 96, Math.PI * 2), basic('#ffd9a8', { wireframe: true, transparent: true, opacity: 0.5 }));
    g.add(windows);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 60, 16), new THREE.MeshStandardMaterial({ color: '#6a7080', metalness: 0.7 }));
    hub.rotation.x = Math.PI / 2;
    g.add(hub);
    for (let k = 0; k < 4; k++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(8, 230, 8), new THREE.MeshStandardMaterial({ color: '#7a8090' }));
      spoke.rotation.z = (k / 4) * Math.PI;
      g.add(spoke);
    }
    g.rotation.set(0.5, 0.4, 0);
    this.group.add(g);
    this.updaters.push((t) => { ring.rotation.z = t * 0.05; windows.rotation.z = t * 0.05; });
  }

  ringPlanet() {
    this._ringPlanet(this._horizonDir().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.7).setY(0.3).normalize(), 1400, 220, [290, 420], '#ffc8f0', 280);
  }

  _ringPlanet(dir, dist, r, [ri, ro], ringColor, hue) {
    const g = new THREE.Group();
    g.position.copy(this.center).addScaledVector(dir, dist);
    const c = document.createElement('canvas');
    c.width = 16; c.height = 128;
    const x = c.getContext('2d');
    for (let i = 0; i < 128; i++) { x.fillStyle = `hsl(${hue + Math.sin(i * 0.3) * 30},70%,${45 + Math.sin(i * 0.7) * 15}%)`; x.fillRect(0, i, 16, 1); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const planet = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 24), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
    g.add(planet);
    const ring = new THREE.Mesh(new THREE.RingGeometry(ri, ro, 64), basic(ringColor, { transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
    ring.rotation.x = -1.25;
    g.add(ring);
    g.rotation.z = 0.3;
    this.group.add(g);
    this.updaters.push((t) => { planet.rotation.y = t * 0.03; });
  }

  update(dt, t, camera) {
    if (camera) this.cam = camera.position;
    for (const u of this.updaters) u(t, dt);
  }
}
