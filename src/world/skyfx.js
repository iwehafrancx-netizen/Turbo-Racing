import * as THREE from 'three';
import { rng } from '../core/util.js';
import { glowTexture } from './textures.js';

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

  rainbow() {
    const dir = this._horizonDir().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.5);
    const pos = this._far(dir, this.radius + 700, this.cloudY - 40);
    const g = new THREE.Group();
    ['#ff4f6b', '#ff9f3f', '#ffe14f', '#5fe39a', '#4fb3ff', '#9b7bff'].forEach((c, k) => {
      const t = new THREE.Mesh(new THREE.TorusGeometry(520 - k * 26, 13, 8, 96, Math.PI), basic(c, { transparent: true, opacity: 0.55 }));
      g.add(t);
    });
    g.position.copy(pos);
    g.lookAt(this.center.x, pos.y, this.center.z);
    this.group.add(g);
  }

  donuts() {
    const icing = ['#ff8fc7', '#8fd3ff', '#ffd36e', '#c9a2ff'];
    for (let k = 0; k < 8; k++) {
      const d = new THREE.Group();
      d.add(new THREE.Mesh(new THREE.TorusGeometry(14, 6, 12, 32), new THREE.MeshStandardMaterial({ color: '#e0a86a', roughness: 0.7 })));
      const top = new THREE.Mesh(new THREE.TorusGeometry(14, 6.3, 12, 32, Math.PI * 2), new THREE.MeshStandardMaterial({ color: icing[k % 4], roughness: 0.4 }));
      top.scale.set(1, 1, 0.55);
      top.position.z = 1.8;
      d.add(top);
      const a = (k / 8) * Math.PI * 2;
      const r = this.radius + 120 + this.r() * 200;
      d.position.set(this.center.x + Math.cos(a) * r, this.center.y + 20 + this.r() * 70, this.center.z + Math.sin(a) * r);
      const spin = 0.1 + this.r() * 0.2, y0 = d.position.y, ph = this.r() * 6;
      this.group.add(d);
      this.updaters.push((t) => { d.rotation.set(t * spin, t * spin * 0.7, 0.4); d.position.y = y0 + Math.sin(t * 0.4 + ph) * 6; });
    }
  }

  balloons() {
    const n = 40;
    const geo = new THREE.SphereGeometry(2.2, 12, 10);
    geo.scale(1, 1.2, 1);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.1 }), n);
    const seeds = [];
    for (let i = 0; i < n; i++) {
      im.setColorAt(i, new THREE.Color().setHSL(this.r(), 0.8, 0.65));
      seeds.push([this.center.x + (this.r() - 0.5) * this.radius * 2.4, this.r() * 200, this.center.z + (this.r() - 0.5) * this.radius * 2.4, this.r() * 6]);
    }
    const o = new THREE.Object3D();
    this.group.add(im);
    this.updaters.push((t) => {
      for (let i = 0; i < n; i++) {
        const [x, y, z, ph] = seeds[i];
        o.position.set(x + Math.sin(t * 0.3 + ph) * 6, this.cloudY + ((y + t * 4) % 200), z);
        o.updateMatrix();
        im.setMatrixAt(i, o.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
    });
  }

  synthSun() {
    const dir = this._horizonDir();
    const pos = this._far(dir, this.radius + 1300, this.center.y + 140);
    const mat = new THREE.ShaderMaterial({
      transparent: true, fog: false, depthWrite: false,
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float time; varying vec2 vUv;
        void main(){
          vec2 p = vUv * 2.0 - 1.0; float r = length(p);
          if (r > 1.0) discard;
          vec3 col = mix(vec3(1.0,0.2,0.6), vec3(1.0,0.85,0.3), smoothstep(-0.8, 0.8, p.y));
          float band = step(0.0, -p.y) * step(0.5, fract((p.y * 7.0) - time * 0.25));
          if (p.y < 0.0 && band > 0.5 && p.y < -0.05) discard;
          gl_FragColor = vec4(col * 1.4, 1.0);
        }`,
    });
    const sun = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), mat);
    sun.position.copy(pos);
    sun.lookAt(this.center);
    this.group.add(sun);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ff3f8e', transparent: true, opacity: 0.6, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(1500);
    halo.position.copy(pos).addScaledVector(dir, 10);
    this.group.add(halo);
    this.updaters.push((t) => { mat.uniforms.time.value = t; });
  }

  gridFloor() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#0b0221'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = '#ff2bd6'; x.lineWidth = 4;
    x.strokeRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(200, 200);
    t.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(this.center.x, this.cloudY, this.center.z);
    this.group.add(floor);
    this.updaters.push((tt) => { t.offset.y = -tt * 0.05; });
  }

  neonShapes() {
    const geos = [new THREE.IcosahedronGeometry(30, 0), new THREE.OctahedronGeometry(34, 0), new THREE.TorusGeometry(28, 6, 6, 12), new THREE.BoxGeometry(40, 40, 40)];
    for (let k = 0; k < 12; k++) {
      const m = new THREE.Mesh(geos[k % 4], basic(k % 2 ? '#00f0ff' : '#ff2bd6', { wireframe: true }));
      const a = this.r() * Math.PI * 2, r = this.radius + 150 + this.r() * 350;
      m.position.set(this.center.x + Math.cos(a) * r, this.center.y + (this.r() - 0.3) * 160, this.center.z + Math.sin(a) * r);
      const s = 0.1 + this.r() * 0.2;
      this.group.add(m);
      this.updaters.push((t) => { m.rotation.set(t * s, t * s * 1.3, 0); });
    }
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

  bigCrystals() {
    const cols = ['#b48cff', '#7df9ff', '#ff9ff3', '#ffffff'];
    for (let k = 0; k < 10; k++) {
      const g = new THREE.OctahedronGeometry(18 + this.r() * 22, 0);
      g.scale(1, 2.4, 1);
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: cols[k % 4], roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.8, emissive: cols[k % 4], emissiveIntensity: 0.35, flatShading: true }));
      const a = (k / 10) * Math.PI * 2 + this.r(), r = this.radius + 140 + this.r() * 260;
      m.position.set(this.center.x + Math.cos(a) * r, this.center.y + (this.r() - 0.2) * 140, this.center.z + Math.sin(a) * r);
      const y0 = m.position.y, s = 0.08 + this.r() * 0.15, ph = this.r() * 6;
      this.group.add(m);
      this.updaters.push((t) => { m.rotation.y = t * s; m.position.y = y0 + Math.sin(t * 0.3 + ph) * 10; });
    }
  }

  sunHalo() {
    const dir = this._horizonDir().setY(0.3).normalize();
    const pos = this.center.clone().addScaledVector(dir, 1700);
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(140 + k * 55, 3 - k * 0.6, 6, 96), basic('#ffd86b', { transparent: true, opacity: 0.5 - k * 0.12 }));
      g.add(ring);
      this.updaters.push((t) => { ring.rotation.z = t * (0.05 + k * 0.03) * (k % 2 ? -1 : 1); });
    }
    g.position.copy(pos);
    g.lookAt(this.center);
    this.group.add(g);
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

  moon() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#f4ecd6'; x.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 40; k++) {
      x.fillStyle = `rgba(150,140,120,${0.15 + this.r() * 0.3})`;
      x.beginPath(); x.arc(this.r() * 256, this.r() * 256, 4 + this.r() * 22, 0, 7); x.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const dir = this._horizonDir().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.35).setY(0.33).normalize();
    const pos = this.center.clone().addScaledVector(dir, 1600);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(170, 32, 20), new THREE.MeshBasicMaterial({ map: tex, fog: false, color: '#fff6e0' }));
    moon.position.copy(pos);
    this.group.add(moon);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: '#ffe9b0', transparent: true, opacity: 0.55, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(900);
    halo.position.copy(pos);
    this.group.add(halo);
    this.updaters.push((t) => { moon.rotation.y = t * 0.01; });
  }

  lanterns() {
    const n = this.lowQ ? 220 : 450;
    const geo = new THREE.CylinderGeometry(1, 0.8, 1.6, 8);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false, fog: true }), n);
    const seeds = [];
    const span = this.radius * 2.6;
    for (let i = 0; i < n; i++) {
      im.setColorAt(i, new THREE.Color().setHSL(0.04 + this.r() * 0.07, 1, 0.55 + this.r() * 0.1));
      const k = Math.floor(this.r() * this.path.N), off = 25 + this.r() * 160, side = this.r() < 0.5 ? -1 : 1;
      seeds.push([this.path.px[k] + this.path.rx[k] * off * side, this.r() * 260, this.path.pz[k] + this.path.rz[k] * off * side, this.r() * 6, 1 + this.r() * 1.8]);
    }
    const o = new THREE.Object3D();
    this.group.add(im);
    this.updaters.push((t) => {
      for (let i = 0; i < n; i++) {
        const [x, y, z, ph, s] = seeds[i];
        o.position.set(x + Math.sin(t * 0.25 + ph) * 4, this.cloudY + ((y + t * 2.2) % 260), z + Math.cos(t * 0.2 + ph) * 4);
        o.rotation.set(0, t * 0.3 + ph, Math.sin(t + ph) * 0.1);
        o.scale.setScalar(s);
        o.updateMatrix();
        im.setMatrixAt(i, o.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
    });
  }

  whales() {
    const skin = new THREE.MeshStandardMaterial({ color: '#4a7fb8', roughness: 0.6, flatShading: true });
    const belly = new THREE.MeshStandardMaterial({ color: '#e8f4ff', roughness: 0.6, flatShading: true });
    for (let k = 0; k < 4; k++) {
      const w = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), skin);
      body.scale.set(9, 7, 26);
      w.add(body);
      const under = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), belly);
      under.scale.set(8.6, 6.6, 25);
      w.add(under);
      const tail = new THREE.Group();
      tail.position.z = -24;
      const fluke = new THREE.Mesh(new THREE.ConeGeometry(9, 12, 4), skin);
      fluke.scale.set(1.6, 1, 0.25);
      fluke.rotation.x = Math.PI / 2;
      fluke.position.z = -6;
      tail.add(fluke);
      w.add(tail);
      for (const s of [-1, 1]) {
        const fin = new THREE.Mesh(new THREE.ConeGeometry(3, 12, 4), skin);
        fin.scale.set(1, 1, 0.3);
        fin.rotation.set(0, 0, s * 2.1);
        fin.position.set(s * 9, -3, 6);
        w.add(fin);
      }
      for (const s of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), basic('#111111'));
        eye.position.set(s * 7.6, 0.5, 17);
        w.add(eye);
      }
      w.scale.setScalar(1.6 + this.r() * 0.8);
      this.group.add(w);
      const r = this.radius * (0.5 + this.r() * 0.7) + 80, y = this.center.y + 40 + this.r() * 80, sp = 0.025 + this.r() * 0.02, ph = this.r() * 6, dirn = k % 2 ? 1 : -1;
      this.updaters.push((t) => {
        const a = (t * sp + ph) * dirn;
        w.position.set(this.center.x + Math.cos(a) * r, y + Math.sin(t * 0.3 + ph) * 10, this.center.z + Math.sin(a) * r);
        w.rotation.y = -a + (dirn > 0 ? Math.PI : 0);
        tail.rotation.x = Math.sin(t * 1.5 + ph) * 0.35;
      });
    }
  }

  jellyfish() {
    const cols = ['#ff7fd6', '#7fe8ff', '#b48cff', '#ffd36e'];
    for (let k = 0; k < 14; k++) {
      const j = new THREE.Group();
      const c = cols[k % 4];
      const bell = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.6, toneMapped: false, side: THREE.DoubleSide }));
      j.add(bell);
      const core = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 8), basic(c));
      core.position.y = 1.5;
      j.add(core);
      const pts = [];
      for (let t = 0; t < 8; t++) {
        const a = (t / 8) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * 4, 0, Math.sin(a) * 4), new THREE.Vector3(Math.cos(a) * 3, -16, Math.sin(a) * 3));
      }
      j.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.7 })));
      const a = this.r() * Math.PI * 2, r = this.radius * (0.4 + this.r() * 0.9) + 60;
      j.position.set(this.center.x + Math.cos(a) * r, this.center.y + (this.r() - 0.3) * 120, this.center.z + Math.sin(a) * r);
      const y0 = j.position.y, ph = this.r() * 6;
      this.group.add(j);
      this.updaters.push((t) => { j.position.y = y0 + Math.sin(t * 0.5 + ph) * 12; bell.scale.set(1 + Math.sin(t * 2 + ph) * 0.12, 1 - Math.sin(t * 2 + ph) * 0.1, 1 + Math.sin(t * 2 + ph) * 0.12); });
    }
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

  blackhole() {
    const dir = this._horizonDir().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.4).setY(0.25).normalize();
    const pos = this.center.clone().addScaledVector(dir, 1500);
    const g = new THREE.Group();
    g.position.copy(pos);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(110, 32, 20), basic('#000000')));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float time; varying vec2 vUv;
        void main(){
          vec2 p = vUv * 2.0 - 1.0; float r = length(p); float a = atan(p.y, p.x);
          float ring = smoothstep(0.35, 0.45, r) * smoothstep(1.0, 0.55, r);
          float swirl = 0.6 + 0.4 * sin(a * 6.0 - time * 1.5 + r * 18.0);
          vec3 col = mix(vec3(1.0, 0.55, 0.15), vec3(0.6, 0.3, 1.0), r);
          gl_FragColor = vec4(col * ring * swirl * 1.6, ring * swirl);
        }`,
    });
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), mat);
    disc.rotation.x = -1.2;
    g.add(disc);
    this.group.add(g);
    this.updaters.push((t) => { mat.uniforms.time.value = t; g.rotation.y = t * 0.02; });
  }

  ringPlanet() {
    const dir = this._horizonDir().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.7).setY(0.3).normalize();
    const pos = this.center.clone().addScaledVector(dir, 1400);
    const g = new THREE.Group();
    g.position.copy(pos);
    const c = document.createElement('canvas');
    c.width = 16; c.height = 128;
    const x = c.getContext('2d');
    for (let i = 0; i < 128; i++) { x.fillStyle = `hsl(${280 + Math.sin(i * 0.3) * 30},70%,${45 + Math.sin(i * 0.7) * 15}%)`; x.fillRect(0, i, 16, 1); }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const planet = new THREE.Mesh(new THREE.SphereGeometry(220, 40, 24), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
    g.add(planet);
    const ring = new THREE.Mesh(new THREE.RingGeometry(290, 420, 64), basic('#ffc8f0', { transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
    ring.rotation.x = -1.25;
    g.add(ring);
    g.rotation.z = 0.3;
    this.group.add(g);
    this.updaters.push((t) => { planet.rotation.y = t * 0.03; });
  }

  update(dt, t) {
    for (const u of this.updaters) u(t, dt);
  }
}
