import * as THREE from 'three';
import { createCarVisual } from '../game/car.js';
import { getEnvMap } from '../world/world.js';
import { Atmosphere } from '../world/sky.js';

function floorTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(256, 256, 0, 256, 256, 256);
  g.addColorStop(0, 'rgba(255,59,107,0.55)');
  g.addColorStop(0.35, 'rgba(120,40,160,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 512);
  x.strokeStyle = 'rgba(94,242,255,0.18)';
  x.lineWidth = 1;
  for (let i = 0; i <= 512; i += 32) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 512); x.stroke();
    x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Menu background: the selected car slowly spinning on a neon turntable.
export class Showroom {
  constructor(renderer, models) {
    this.models = models;
    this.renderer = renderer;
    const s = (this.scene = new THREE.Scene());
    s.environment = getEnvMap(renderer);
    s.environmentIntensity = 0.9;
    s.fog = new THREE.Fog('#120a26', 18, 60);
    this.atmo = new Atmosphere({
      sky: { top: '#06060f', horizon: '#2a1450', bottom: '#0a0718', sun: '#ff3b6b', sunSize: 0, stars: 0.6 },
      sunDir: [0, 0.15, -1], particles: 'stardust',
    }, 'low');
    s.add(this.atmo.group);
    s.add(new THREE.HemisphereLight('#8a7dff', '#1a0a20', 0.6));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(5, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    const sc = key.shadow.camera; sc.left = -6; sc.right = 6; sc.top = 6; sc.bottom = -6;
    s.add(key);
    const rimA = new THREE.PointLight('#ff3b6b', 60, 20); rimA.position.set(-5, 2.5, -4); s.add(rimA);
    const rimB = new THREE.PointLight('#5ef2ff', 50, 20); rimB.position.set(5, 2, -5); s.add(rimB);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshBasicMaterial({ map: floorTexture(), transparent: true, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    s.add(floor);
    const base = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#0b0a18', roughness: 0.35, metalness: 0.6 }));
    base.rotation.x = -Math.PI / 2;
    base.position.y = -0.02;
    base.receiveShadow = true;
    s.add(base);

    this.table = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.7, 0.18, 64), new THREE.MeshStandardMaterial({ color: '#16162a', metalness: 0.8, roughness: 0.25 }));
    disc.position.y = 0.09;
    disc.receiveShadow = true;
    this.table.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.65, 0.05, 8, 96), new THREE.MeshBasicMaterial({ color: '#ff3b6b', toneMapped: false }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.18;
    this.table.add(ring);
    this.ring = ring;
    s.add(this.table);

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 4000);
    this.camera.position.set(6.2, 2.3, 7.4);
    this.camera.lookAt(0, 0.7, 0);
    this.offset = 0.18;
    this.carId = null;
    this.angle = 0.6;
  }

  setCar(id) {
    if (this.carId === id) return;
    this.carId = id;
    if (this.car) this.table.remove(this.car.root);
    const tpl = this.models.get(id);
    this.car = createCarVisual(tpl);
    this.car.root.position.y = 0.18;
    this.table.add(this.car.root);
    this.ring.material.color.set(tpl.def.accent);
  }

  setFraming(mode) {
    // shift the car left/right of centre so the menu UI has room
    this.offset = mode === 'garage' ? 0.2 : -0.17;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.setViewOffset(w, h, w * this.offset, 0, w, h);
    this.camera.updateProjectionMatrix();
    this.w = w; this.h = h;
  }

  update(dt, time) {
    this.angle += dt * 0.3;
    this.table.rotation.y = this.angle;
    if (this.w && this._lastOff !== this.offset) {
      this._lastOff = this.offset;
      this.resize(this.w, this.h);
    }
    this.atmo.update(dt, this.camera, time);
  }

  render(r) { r.render(this.scene, this.camera); }
}
