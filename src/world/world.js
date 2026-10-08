import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TRACKS } from '../data/tracks.js';
import { THEMES } from '../data/themes.js';
import { TrackPath } from './trackpath.js';
import { Terrain } from './terrain.js';
import { TrackMesh } from './trackmesh.js';
import { Scenery } from './scenery.js';
import { Atmosphere } from './sky.js';
import { SkyFX } from './skyfx.js';
import { Obstacles } from '../game/obstacles.js';

let envTex = null;
export function getEnvMap(renderer) {
  if (!envTex) {
    const pm = new THREE.PMREMGenerator(renderer);
    envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
  }
  return envTex;
}

// Cached track paths (cheap) for menus/minimaps.
const pathCache = new Map();
export function getPath(idx) {
  if (!pathCache.has(idx)) pathCache.set(idx, new TrackPath(TRACKS[idx]));
  return pathCache.get(idx);
}

export class World {
  constructor(renderer, trackIdx, quality) {
    const def = TRACKS[trackIdx];
    const path = getPath(trackIdx);
    // resolve the cloud sea altitude for this track
    const base = THEMES[def.theme];
    const theme = { ...base, clouds: base.clouds ? { ...base.clouds, level: path.bounds().minY - base.clouds.depth } : null };
    this.def = def;
    this.theme = theme;
    this.quality = quality;
    const scene = (this.scene = new THREE.Scene());
    scene.fog = new THREE.Fog(theme.fog[0], theme.fog[1], theme.fog[2] * (quality === 'low' ? 0.8 : 1));
    scene.environment = getEnvMap(renderer);
    scene.environmentIntensity = theme.night ? 0.5 : 0.85;

    const hemi = (this.hemi = new THREE.HemisphereLight(theme.hemi[0], theme.hemi[1], theme.hemi[2]));
    scene.add(hemi);
    const sun = (this.sun = new THREE.DirectionalLight(theme.sunColor, theme.sunIntensity));
    this.sunDir = new THREE.Vector3(...theme.sunDir).normalize();
    if (this.sunDir.y < 0.25) this.sunDir.y = 0.25;
    this.sunDir.normalize();
    if (quality !== 'low') {
      sun.castShadow = true;
      const s = quality === 'high' ? 2048 : 1024;
      sun.shadow.mapSize.set(s, s);
      const c = sun.shadow.camera;
      c.left = -60; c.right = 60; c.top = 60; c.bottom = -60; c.near = 10; c.far = 400;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.04;
    }
    scene.add(sun, sun.target);

    this.path = path;
    this.terrain = new Terrain(this.path, theme, trackIdx * 101 + 7, quality);
    this.track = new TrackMesh(this.path, theme, def.theme, this.terrain);
    this.scenery = new Scenery(this.path, theme, this.terrain, quality, trackIdx + 1);
    this.atmo = new Atmosphere(theme, quality, this.path);
    this.skyfx = new SkyFX(theme, this.path, quality, this.atmo);
    this.obstacles = new Obstacles(this.path, theme);
    scene.add(this.terrain.group, this.track.group, this.scenery.group, this.atmo.group, this.skyfx.group, this.obstacles.group);
    this._skyEnvironment(renderer);
  }

  // Reflections come from this track's own sky, so paint and wet roads
  // pick up the sunset / neon / aurora colours instead of a grey studio.
  _skyEnvironment(renderer) {
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), this.atmo.dome.material));
    const sun = new THREE.Mesh(new THREE.SphereGeometry(6, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(this.theme.sunColor).multiplyScalar(this.theme.night ? 2 : 5) }));
    sun.position.copy(this.sunDir).multiplyScalar(80);
    envScene.add(sun);
    // a soft overhead panel keeps car paint readable on dark tracks
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), new THREE.MeshBasicMaterial({ color: new THREE.Color(this.theme.hemi[0]).multiplyScalar(this.theme.night ? 1.3 : 0.9), side: THREE.DoubleSide }));
    panel.position.y = 60;
    panel.rotation.x = Math.PI / 2;
    envScene.add(panel);
    this.envRT = pm.fromScene(envScene, 0.03, 0.1, 1000);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = 1;
    pm.dispose();
    envScene.children.forEach((m) => { if (m.geometry) m.geometry.dispose(); if (m !== envScene.children[0]) m.material.dispose(); });
  }

  update(dt, camera, time, focus) {
    if (focus) {
      this.sun.position.copy(focus).addScaledVector(this.sunDir, 200);
      this.sun.target.position.copy(focus);
    }
    this.terrain.update(dt);
    // lightning flashes light up the whole scene
    this.hemi.intensity = this.theme.hemi[2] + this.atmo.flash * 4;
    this.track.update(dt, time);
    this.atmo.update(dt, camera, time);
    this.skyfx.update(dt, time, camera);
  }

  dispose() {
    this.envRT?.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => m.dispose());
      }
    });
  }
}
