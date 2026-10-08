// Garage. (three.js strips '.' from node names, so wheel patterns omit dots.)
// Display names are original nicknames so no brand names appear in the UI.
// speed: top speed (m/s), accel: m/s^2 off the line, handling: steering/grip,
// drift: how fast drifting charges turbo, nitro: nitro strength.

const DIR = 'Assets/assets/cars/';

export const CARS = [
  {
    id: 'gr86',
    name: 'Drift Ronin',
    tag: 'Born to slide. Charges turbo fastest when drifting.',
    file: DIR + '2022_toyota_team_toyotires_drift_gr86_66.glb',
    price: 0,
    stats: { speed: 55, accel: 20, handling: 1.08, drift: 1.3, nitro: 1.0 },
    wheels: /_WH_(front|rear)(001)?$/,
    accent: '#ff3b3b',
  },
  {
    id: 'cayman',
    name: 'Clubsport GT4',
    tag: 'Perfectly balanced track weapon.',
    file: DIR + 'porsche_718_cayman_gt4_clubsport.glb',
    price: 2500,
    stats: { speed: 59, accel: 22, handling: 1.04, drift: 1.05, nitro: 1.05 },
    wheels: /^wheel(FL|FR|BL|BR)$/,
    calipers: /^bone_caliper_(FL|FR|BL|BR)$/,
    accent: '#38bdf8',
  },
  {
    id: 'z06',
    name: 'Carbon Stingray',
    tag: 'Huge V8 muscle. Fastest in a straight line.',
    file: DIR + '2011_corvette_z06_carbon_limited_edition_nfs.glb',
    price: 6000,
    stats: { speed: 64, accel: 24, handling: 0.94, drift: 1.0, nitro: 1.15 },
    wheels: /^mesh_43(00[1-3])?$/,
    calipers: /^mesh_312(00[1-3])?$/,
    accent: '#fbbf24',
  },
  {
    id: 'gtr',
    name: 'Silhouette R',
    tag: 'Widebody legend. The ultimate all-rounder.',
    file: DIR + '2022_lb-silhouette_works_gt_nissan_35gt-rr_r35.glb',
    price: 12000,
    stats: { speed: 67, accel: 26, handling: 1.02, drift: 1.1, nitro: 1.2 },
    wheels: /^body_unref_unblend00[1-4]$/,
    accent: '#a855f7',
  },
];

export const UPGRADES = [
  { id: 'engine', name: 'Engine', desc: '+ top speed & acceleration' },
  { id: 'turbo', name: 'Turbo', desc: '+ nitro power & capacity' },
  { id: 'grip', name: 'Tires', desc: '+ grip & steering' },
];
export const MAX_UPGRADE = 5;

export function upgradeCost(car, level) {
  const tier = 1 + CARS.indexOf(car) * 0.5;
  return Math.round((250 + level * 300) * tier / 10) * 10;
}

// Final driving stats after upgrades.
export function carStats(car, up = { engine: 0, turbo: 0, grip: 0 }) {
  const s = car.stats;
  return {
    maxSpeed: s.speed + up.engine * 1.8,
    accel: s.accel + up.engine * 0.9,
    handling: s.handling * (1 + up.grip * 0.035),
    drift: s.drift,
    nitroPower: s.nitro * (1 + up.turbo * 0.06),
    nitroCap: 1 + up.turbo * 0.12,
  };
}

export const AI_NAMES = ['Blaze', 'Viper', 'Nova', 'Ghost', 'Rook', 'Kaito', 'Luna', 'Rex', 'Zara', 'Diesel'];
