import { CARS } from '../data/cars.js';
import { TRACKS } from '../data/tracks.js';

const KEY = 'turbo-racing-save-v1';

function fresh() {
  return {
    coins: 300,
    stars: {},       // trackId -> best stars (0..3)
    best: {},        // trackId -> { race, lap }
    unlocked: 1,     // number of tracks unlocked
    owned: ['gr86'],
    car: 'gr86',
    upgrades: Object.fromEntries(CARS.map((c) => [c.id, { engine: 0, turbo: 0, grip: 0 }])),
    settings: { volume: 0.8, music: true, quality: 'auto', camera: 0 },
    daily: { last: '', streak: 0 },
    stats: { races: 0, wins: 0 },
    tutorialDone: false,
  };
}

export class Save {
  constructor(platform) {
    this.platform = platform;
    this.data = fresh();
    try {
      const raw = platform.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        const f = fresh();
        this.data = { ...f, ...d, settings: { ...f.settings, ...(d.settings || {}) }, upgrades: { ...f.upgrades, ...(d.upgrades || {}) } };
      }
    } catch (e) { console.warn('save load failed', e); }
  }
  write() {
    try { this.platform.setItem(KEY, JSON.stringify(this.data)); } catch (e) { console.warn('save failed', e); }
  }
  get totalStars() {
    return Object.values(this.data.stars).reduce((a, b) => a + b, 0);
  }
  carDef() { return CARS.find((c) => c.id === this.data.car) || CARS[0]; }

  // Returns reward info if a daily bonus is due today.
  claimDaily() {
    const today = new Date().toISOString().slice(0, 10);
    const d = this.data.daily;
    if (d.last === today) return null;
    const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    d.streak = d.last === yest ? Math.min(7, d.streak + 1) : 1;
    d.last = today;
    const amount = 100 + d.streak * 50;
    this.data.coins += amount;
    this.write();
    return { amount, streak: d.streak };
  }

  recordRace(trackIdx, place, raceTime, bestLap, coinsEarned) {
    const t = TRACKS[trackIdx];
    const d = this.data;
    const stars = [3, 2, 1, 0, 0, 0][place - 1] || 0;
    const prevStars = d.stars[t.id] || 0;
    if (stars > prevStars) d.stars[t.id] = stars;
    const b = d.best[t.id] || { race: 0, lap: 0 };
    let newRecord = false;
    if (b.race === 0 || raceTime < b.race) { newRecord = b.race !== 0; b.race = raceTime; }
    if (isFinite(bestLap) && (b.lap === 0 || bestLap < b.lap)) b.lap = bestLap;
    d.best[t.id] = b;
    let unlockedNew = false;
    if (place <= 3 && d.unlocked === trackIdx + 1 && trackIdx + 1 < TRACKS.length) { d.unlocked++; unlockedNew = true; }
    d.coins += coinsEarned;
    d.stats.races++;
    if (place === 1) d.stats.wins++;
    this.write();
    return { stars, newStars: Math.max(0, stars - prevStars), unlockedNew, newRecord };
  }
}
