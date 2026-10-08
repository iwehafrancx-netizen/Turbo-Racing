// The 10 Turbo Racing courses. Each one runs from a START gate to a FINISH
// gate: no laps, no loops.
//
// Courses are drawn like a turtle: a list of segments, each optionally
// carrying features that sit on that segment.
//   S(length, climb, opts)            straight
//   L(radius, degrees, climb, opts)   left curve
//   R(radius, degrees, climb, opts)   right curve
//   WARP(dx, dz, climb, turn)         a black hole / wormhole: the road ends in
//                                     a portal and the race continues on a new
//                                     stretch of track far away
// opts:
//   boost: lat | [lat...]   boost pads near the start of the segment
//   gap: metres             missing road (a ramp is added in front)
//   ramp: [latFrom, latTo]  kicker jump in the middle of the segment
//   roll: amp               rollercoaster hills along the segment
//   open: true              no guard rails on this segment
//   obs: [...]              moving obstacles, f = 0..1 along the segment
//     { t: 'slide',  n, gap, speed }  barriers sliding across the road
//     { t: 'roll',   n, gap, speed }  boulders / asteroids tumbling across
//     { t: 'sweep',  speed }          spinning bar
//     { t: 'hammer', n, gap, speed }  swinging wrecking ball
//     { t: 'piston', n, gap, speed }  crushers slamming down

const S = (len, climb = 0, o = {}) => ({ kind: 'S', len, climb, o });
const L = (r, deg, climb = 0, o = {}) => ({ kind: 'L', r, deg, climb, o });
const R = (r, deg, climb = 0, o = {}) => ({ kind: 'R', r, deg, climb, o });
const WARP = (dx, dz, climb = 0, turn = 0) => ({ kind: 'W', dx, dz, climb, turn });

const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function course(startY, segs) {
  // stretch the middle of every course (not the start grid / finish runoff)
  segs = segs.map((g, k) => (k === 0 || k === segs.length - 1 || g.kind === 'W' ? g
    : g.kind === 'S' ? { ...g, len: g.len * 1.4 } : { ...g, r: g.r * 1.15 }));
  let x = 0, z = 0, y = startY, h = 0, s = 0;
  const legs = [[[x, z, y]]];
  let points = legs[0];
  const F = { gaps: [], open: [], rollers: [], boosts: [], ramps: [], obstacles: [], warps: [] };
  const STEP = 10;
  for (const seg of segs) {
    if (seg.kind === 'W') {
      // jump through space: start a new, separate stretch of track
      const c = Math.cos(h), sn = Math.sin(h);
      x += seg.dx * c + seg.dz * sn;
      z += -seg.dx * sn + seg.dz * c;
      y += seg.climb;
      h += (seg.turn * Math.PI) / 180;
      F.warps.push({ s });
      points = [[x, z, y]];
      legs.push(points);
      continue;
    }
    const len = seg.kind === 'S' ? seg.len : (seg.r * seg.deg * Math.PI) / 180;
    const turn = seg.kind === 'S' ? 0 : ((seg.kind === 'L' ? 1 : -1) * seg.deg * Math.PI) / 180;
    const n = Math.max(1, Math.round(len / STEP));
    const y0 = y;
    for (let k = 1; k <= n; k++) {
      h += turn / n / 2;
      x += Math.sin(h) * (len / n);
      z += Math.cos(h) * (len / n);
      h += turn / n / 2;
      y = y0 + seg.climb * 2 * ease(k / n); // climbs are doubled for drama
      points.push([x, z, y]);
    }
    const o = seg.o, s0 = s;
    if (o.boost !== undefined) for (const lat of [].concat(o.boost)) F.boosts.push({ s: s0 + Math.min(25, len * 0.3), lat });
    if (o.gap) F.gaps.push({ s: s0 + len * 0.55, len: o.gap });
    if (o.ramp) F.ramps.push({ s: s0 + len * 0.5, lat: o.ramp });
    if (o.roll) F.rollers.push({ s0: s0 + 15, s1: s0 + len - 15, amp: o.roll, len: 50 });
    if (o.open) F.open.push({ s0: s0 + 5, s1: s0 + len - 5 });
    for (const ob of o.obs || []) {
      const count = ob.n || 1;
      for (let k = 0; k < count; k++) {
        F.obstacles.push({ type: ob.t, s: s0 + ob.f * len + k * (ob.gap || 25), speed: ob.speed || 1, phase: k * 1.9 + s0 * 0.01, side: k % 2 ? 1 : -1 });
      }
    }
    s += len;
  }
  return { legs, length: s, features: F };
}

export const TRACKS = [
  {
    id: 'sunset-skyway',
    name: 'Sunset Skyway',
    tagline: 'Full throttle above a city buried in clouds',
    theme: 'sunset',
    width: 10,
    shoulder: 2.5,
    difficulty: 1,
    aiSkill: 0.79,
    aiCars: ['gr86', 'gr86', 'cayman', 'gr86', 'cayman'],
    course: course(120, [
      S(90), L(140, 40, 4), S(150, 0, { boost: 0 }), R(120, 70, 6), S(130, -4, { roll: 2 }),
      L(110, 80), S(170, 0, { gap: 12 }), R(140, 60, -4),
      S(130, 0, { obs: [{ t: 'slide', f: 0.45, n: 2, gap: 34, speed: 0.7 }] }),
      L(130, 80, 6), S(150, 0, { boost: [-3, 3] }), R(110, 70), S(150, -8, { roll: 2.2 }), L(150, 40), S(200),
    ]),
  },
  {
    id: 'neon-megacity',
    name: 'Neon Megacity',
    tagline: 'Midnight rooftops, flying traffic, searchlights',
    theme: 'city',
    width: 10,
    shoulder: 2,
    difficulty: 2,
    aiSkill: 0.84,
    aiCars: ['gr86', 'cayman', 'cayman', 'gr86', 'z06'],
    course: course(150, [
      S(90), S(160, 0, { boost: 0 }), R(120, 70),
      S(140, 0, { obs: [{ t: 'slide', f: 0.3, n: 3, gap: 28, speed: 0.9 }] }),
      L(90, 90, 8), S(120, 0, { gap: 14 }), R(160, 45), S(160, 0, { roll: 2 }), L(110, 80, -6),
      S(150, 0, { boost: 0, obs: [{ t: 'slide', f: 0.45, n: 2, gap: 35, speed: 1.2 }] }),
      R(80, 110), S(120), L(130, 60, 4), S(160, 0, { ramp: [-10, 0] }), R(140, 40), S(200),
    ]),
  },
  {
    id: 'galaxy-ways',
    name: 'Galaxy Ways',
    tagline: 'Dodge asteroids, then dive into the black hole',
    theme: 'galaxy',
    width: 10.5,
    shoulder: 1.5,
    bank: 0.9,
    difficulty: 3,
    aiSkill: 0.86,
    aiCars: ['cayman', 'gr86', 'cayman', 'z06', 'cayman'],
    course: course(150, [
      S(90), R(140, 45), S(150, 0, { boost: 0 }), L(110, 80, 8),
      S(150, 0, { obs: [{ t: 'roll', f: 0.3, n: 3, gap: 36, speed: 0.8 }] }),
      R(120, 60, -6), S(160, 0, { gap: 16 }), L(100, 70), S(140, 0, { boost: 0 }),
      WARP(1600, 900, 40, 110),
      S(80, 0, { boost: [-3, 3] }), R(130, 70, -8), S(150, 0, { roll: 2.4 }), L(120, 90),
      S(160, 0, { open: true, obs: [{ t: 'roll', f: 0.25, n: 3, gap: 34, speed: 1 }] }),
      R(140, 60, 6), S(150, 0, { boost: [-3, 3] }), L(140, 40), S(200),
    ]),
  },
  {
    id: 'canyon-blitz',
    name: 'Canyon Blitz',
    tagline: 'Wrecking balls over a dust-storm canyon',
    theme: 'canyon',
    width: 10,
    shoulder: 2.5,
    difficulty: 4,
    aiSkill: 0.88,
    aiCars: ['cayman', 'z06', 'gr86', 'cayman', 'z06'],
    course: course(130, [
      S(90), R(140, 50, 4), S(150, 0, { boost: 0 }), L(110, 80),
      S(170, 0, { obs: [{ t: 'hammer', f: 0.35, n: 2, gap: 45, speed: 1 }] }),
      R(90, 100, 8), S(130, 0, { gap: 16 }), L(150, 60, -8), S(140, -6, { roll: 2.4 }), R(110, 70),
      S(170, 0, { boost: 0, obs: [{ t: 'roll', f: 0.35, n: 2, gap: 40, speed: 1 }, { t: 'hammer', f: 0.8, speed: 1.2 }] }),
      L(100, 90, 6), S(130, 0, { open: true }), R(140, 50), S(200),
    ]),
  },
  {
    id: 'frozen-fortress',
    name: 'Frozen Fortress',
    tagline: 'Ice crushers and black ice in a blizzard',
    theme: 'frozen',
    width: 11,
    shoulder: 2.5,
    grip: 0.8,
    difficulty: 5,
    aiSkill: 0.895,
    aiCars: ['z06', 'cayman', 'gr86', 'z06', 'cayman'],
    course: course(145, [
      S(90), R(160, 40), S(170, 0, { boost: 0 }), L(120, 80, 6),
      S(160, 0, { obs: [{ t: 'piston', f: 0.25, n: 3, gap: 32, speed: 0.9 }] }),
      R(100, 100), S(160, 0, { gap: 18 }), L(140, 60, -8), S(160, -6, { roll: 2.6 }), R(120, 80),
      S(160, 0, { obs: [{ t: 'slide', f: 0.3, n: 3, gap: 32, speed: 1.1 }] }),
      L(110, 90, 6), S(150, 0, { boost: [-3, 3], open: true }), R(150, 50), S(200),
    ]),
  },
  {
    id: 'volcano-fury',
    name: 'Volcano Fury',
    tagline: 'Meteors rain down on the lava highway',
    theme: 'volcano',
    width: 10,
    shoulder: 2.5,
    difficulty: 6,
    aiSkill: 0.89,
    aiCars: ['z06', 'z06', 'cayman', 'gtr', 'cayman'],
    course: course(125, [
      S(90), R(120, 60), S(170, 0, { obs: [{ t: 'piston', f: 0.3, n: 4, gap: 30, speed: 0.9 }] }),
      L(110, 80, 8), S(130, 0, { gap: 16 }), R(80, 120), S(150, -8, { roll: 2.5 }), L(120, 70),
      S(170, 0, { obs: [{ t: 'roll', f: 0.2, n: 3, gap: 34, speed: 1.2 }] }),
      R(130, 60, 6), S(140, 0, { boost: 0, open: true }), L(90, 100, -6), S(150, 0, { ramp: [0, 10] }), R(140, 40), S(200),
    ]),
  },
  {
    id: 'storm-chaser',
    name: 'Storm Chaser',
    tagline: 'Race the tornado. No rails. Lightning.',
    theme: 'storm',
    width: 10,
    shoulder: 1.5,
    bank: 1,
    difficulty: 7,
    aiSkill: 0.89,
    aiCars: ['gtr', 'z06', 'cayman', 'z06', 'gr86'],
    course: course(160, [
      S(90), L(130, 60), S(160, 0, { boost: 0, open: true }), R(100, 90, 8), S(150, 0, { gap: 20 }), L(110, 80),
      S(170, 0, { obs: [{ t: 'sweep', f: 0.3, speed: 1 }, { t: 'sweep', f: 0.75, speed: -1.1 }] }),
      R(80, 110, -8), S(150, 0, { roll: 2.6, open: true }), L(140, 60),
      S(180, 0, { obs: [{ t: 'hammer', f: 0.25, n: 3, gap: 36, speed: 1.2 }] }),
      R(120, 80, 6), S(160, 0, { gap: 20 }), L(120, 70), S(140, 0, { boost: [-3, 3], open: true }), R(150, 40), S(200),
    ]),
  },
  {
    id: 'air-strike',
    name: 'Air Strike',
    tagline: 'Sky carriers, fighter jets and blast doors',
    theme: 'military',
    width: 10,
    shoulder: 2,
    difficulty: 8,
    aiSkill: 0.9,
    aiCars: ['gtr', 'z06', 'gtr', 'cayman', 'z06'],
    course: course(140, [
      S(90), L(120, 60), S(150, 0, { obs: [{ t: 'slide', f: 0.35, n: 3, gap: 28, speed: 1 }] }),
      R(100, 90, 6), S(120, 0, { boost: 0 }), L(70, 130), S(150, 0, { roll: 2.4 }), R(120, 70, -8),
      S(140, 0, { gap: 16 }), L(140, 50),
      S(170, 0, { obs: [{ t: 'piston', f: 0.25, n: 3, gap: 32, speed: 1.1 }, { t: 'hammer', f: 0.85, speed: 1.2 }] }),
      R(90, 100, 6), S(140, 0, { boost: [-3, 3], open: true }), L(130, 40), S(200),
    ]),
  },
  {
    id: 'alien-frontier',
    name: 'Alien Frontier',
    tagline: 'UFO skies and a wormhole to the far side',
    theme: 'alien',
    width: 10,
    shoulder: 2,
    difficulty: 9,
    aiSkill: 0.9,
    aiCars: ['gtr', 'gtr', 'z06', 'z06', 'gtr'],
    course: course(120, [
      S(90), L(130, 40), S(130, 0, { boost: 0 }), R(120, 60, 6),
      S(130, 0, { obs: [{ t: 'sweep', f: 0.5, speed: 0.9 }] }),
      L(58, 420, 32), S(140, 0, { gap: 16 }), R(110, 80, -10), S(120, 0, { boost: 0 }),
      WARP(-1500, 1100, -30, -100),
      S(80, 0, { boost: [-3, 3] }), L(90, 90),
      S(160, 0, { open: true, obs: [{ t: 'piston', f: 0.25, n: 3, gap: 32, speed: 1.1 }] }),
      R(130, 70, -6), S(150, -10, { roll: 2.5 }), L(120, 50),
      S(150, 0, { obs: [{ t: 'roll', f: 0.3, n: 2, gap: 40, speed: 1.2 }] }), R(140, 40), S(200),
    ]),
  },
  {
    id: 'event-horizon',
    name: 'Event Horizon',
    tagline: 'Two black holes. One finish line. Final race.',
    theme: 'horizon',
    width: 10.5,
    shoulder: 1.5,
    bank: 1.1,
    difficulty: 10,
    aiSkill: 0.915,
    aiCars: ['gtr', 'gtr', 'gtr', 'z06', 'z06'],
    course: course(150, [
      S(90), R(140, 50), S(160, 0, { boost: 0 }), L(100, 90, 10),
      S(160, 0, { obs: [{ t: 'roll', f: 0.3, n: 3, gap: 30, speed: 1.2 }] }),
      R(62, 400, -30), S(140, 0, { boost: 0 }),
      WARP(1700, 1200, 60, 140),
      S(80, 0, { boost: [-3, 3] }), L(120, 80),
      S(170, 0, { obs: [{ t: 'sweep', f: 0.3, speed: 1.2 }, { t: 'hammer', f: 0.78, speed: 1.3 }] }),
      R(90, 100, 8), S(150, 0, { gap: 20 }), L(130, 70), S(140, 0, { boost: 0 }),
      WARP(-1800, 1300, -50, -120),
      S(80, 0, { boost: [-3, 3] }), R(110, 90, -6),
      S(180, 0, { obs: [{ t: 'piston', f: 0.25, n: 4, gap: 30, speed: 1.3 }] }),
      L(140, 60), S(150, 0, { roll: 2.8, open: true }), R(120, 40), S(200),
    ]),
  },
];

export const POSITION_REWARD = [600, 420, 300, 180, 120, 80];
export const POSITION_STARS = [3, 2, 1, 0, 0, 0];
