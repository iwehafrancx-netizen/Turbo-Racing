// The 10 Turbo Racing sky tracks. Every road floats high above the clouds.
// Control points are authored as [x, z, y] in metres (y = altitude).
// Feature positions (u) are fractions of the lap length, 0 = start line.
//   gaps    - missing road: hit the ramp and fly across
//   open    - sections with no guard rails: steer carefully or fall
//   rollers - rollercoaster hills that throw you into the air
//   ramps   - kicker jumps (lat = which part of the road they cover)
//   boosts  - glowing boost pads

// Lift a 2D layout into the sky: altitude = base + y * scale.
const sky = (pts, base, scale = 1) => pts.map(([x, z, y]) => [x, z, base + y * scale]);

// Turn polygon corners into spline points with rounded corners.
function roundPoly(corners, r) {
  const out = [];
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const p = corners[(i - 1 + n) % n], c = corners[i], q = corners[(i + 1) % n];
    const dpx = p[0] - c[0], dpz = p[1] - c[1];
    const dqx = q[0] - c[0], dqz = q[1] - c[1];
    const lp = Math.hypot(dpx, dpz), lq = Math.hypot(dqx, dqz);
    const rr = Math.min(r, lp * 0.45, lq * 0.45);
    const ax = dpx / lp, az = dpz / lp, bx = dqx / lq, bz = dqz / lq;
    const yIn = c[2] + (p[2] - c[2]) * (rr / lp);
    const yOut = c[2] + (q[2] - c[2]) * (rr / lq);
    out.push([c[0] + ax * rr, c[1] + az * rr, yIn]);
    out.push([c[0] + (ax + bx) * rr * 0.293, c[1] + (az + bz) * rr * 0.293, c[2]]);
    out.push([c[0] + bx * rr, c[1] + bz * rr, yOut]);
  }
  return out;
}

// Figure-8: the two passes through the middle sit at different heights,
// so one road flies over the other.
function figure8({ ax, az, n, y0, yAmp, wob = 0, wobF = 3, yWob = 0, phase = 0.32 * Math.PI }) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = phase + (i / n) * Math.PI * 2;
    pts.push([ax * Math.cos(t) + wob * Math.cos(t * wobF), az * Math.sin(2 * t), y0 + yAmp * Math.sin(t) + yWob * Math.sin(t * 4)]);
  }
  return pts;
}

// Spiral Summit: a straight run-up, a 1.5-turn climbing helix around a
// floating ice peak, then a long plunge back to the start.
function spiralSummit() {
  const pts = [[0, -90, 100], [0, 40, 101], [6, 120, 103]];
  const cx = 95, cz = 190, R = 80, turns = 1.5, n = 20;
  for (let k = 0; k <= n; k++) {
    const a = Math.PI - (k / n) * turns * Math.PI * 2;
    pts.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R, 108 + (k / n) * 44]);
  }
  pts.push([196, 110, 148], [214, 10, 136], [214, -90, 120], [180, -170, 108], [100, -200, 101], [26, -160, 100]);
  return pts;
}

export const TRACKS = [
  {
    id: 'sunrise-skyway',
    name: 'Sunrise Skyway',
    tagline: 'First light above a sea of clouds',
    theme: 'sunrise',
    laps: 3,
    width: 9.5,
    shoulder: 4,
    difficulty: 1,
    aiSkill: 0.79,
    aiCars: ['gr86', 'gr86', 'cayman', 'gr86', 'cayman'],
    points: sky([
      [0, -40, 0], [0, 120, 0], [12, 220, 3], [60, 290, 6], [140, 312, 8], [210, 282, 8],
      [238, 212, 6], [212, 150, 4], [232, 90, 3], [292, 62, 2], [322, -10, 1], [292, -90, 0],
      [200, -122, 0], [110, -104, 0], [40, -84, 0],
    ], 120, 1.5),
    boosts: [{ u: 0.135, lat: 0 }, { u: 0.52, lat: -3 }, { u: 0.78, lat: 3 }],
    ramps: [{ u: 0.68, lat: [-9, 0] }],
    gaps: [{ u: 0.09, len: 12 }],
    rollers: [{ u0: 0.82, u1: 0.95, amp: 2.2, len: 52 }],
    open: [],
  },
  {
    id: 'neon-sky-city',
    name: 'Neon Sky City',
    tagline: 'Midnight rooftops of a floating metropolis',
    theme: 'city',
    laps: 3,
    width: 9.5,
    shoulder: 2,
    difficulty: 2,
    aiSkill: 0.84,
    aiCars: ['gr86', 'cayman', 'cayman', 'gr86', 'z06'],
    points: sky(roundPoly([
      [0, -90, 0], [0, 300, 0], [170, 300, 8], [170, 170, 12], [320, 170, 12], [320, -90, 4],
      [215, -90, 0], [215, 40, -4], [105, 40, -4], [105, -90, 0],
    ], 30), 150),
    boosts: [{ u: 0.165, lat: 0 }, { u: 0.4, lat: 0 }, { u: 0.62, lat: 0 }, { u: 0.86, lat: 0 }],
    ramps: [],
    gaps: [{ u: 0.12, len: 14 }],
    rollers: [{ u0: 0.66, u1: 0.74, amp: 2, len: 45 }],
    open: [],
  },
  {
    id: 'mirage-mesas',
    name: 'Mirage Mesas',
    tagline: 'Floating desert rocks at golden sunset',
    theme: 'canyon',
    laps: 3,
    width: 9.5,
    shoulder: 3,
    difficulty: 3,
    aiSkill: 0.87,
    aiCars: ['cayman', 'gr86', 'cayman', 'z06', 'cayman'],
    points: sky([
      [0, -40, 2], [0, 150, 6], [-40, 250, 14], [-130, 292, 20], [-222, 252, 24], [-242, 160, 22],
      [-182, 92, 16], [-200, 0, 12], [-282, -62, 14], [-262, -172, 18], [-160, -222, 14],
      [-60, -200, 8], [-6, -124, 3],
    ], 110, 2),
    boosts: [{ u: 0.15, lat: 0 }, { u: 0.3, lat: 0 }, { u: 0.55, lat: -3 }],
    ramps: [{ u: 0.45, lat: [0, 9] }],
    gaps: [{ u: 0.115, len: 18 }],
    rollers: [{ u0: 0.87, u1: 0.98, amp: 2.8, len: 55 }],
    open: [[0.72, 0.8]],
  },
  {
    id: 'spiral-summit',
    name: 'Spiral Summit',
    tagline: 'Climb the ice helix, then plunge',
    theme: 'snow',
    laps: 3,
    width: 9,
    shoulder: 3,
    grip: 0.84,
    bank: 0.7,
    difficulty: 4,
    aiSkill: 0.89,
    aiCars: ['cayman', 'z06', 'gr86', 'cayman', 'z06'],
    points: spiralSummit(),
    boosts: [{ u: 0.05, lat: 0 }, { u: 0.74, lat: 0 }, { u: 0.86, lat: -2 }],
    ramps: [{ u: 0.93, lat: [-9, 9] }],
    gaps: [{ u: 0.8, len: 16 }],
    rollers: [],
    open: [[0.66, 0.74]],
  },
  {
    id: 'jungle-sky-isles',
    name: 'Jungle Sky Isles',
    tagline: 'Vine hills between waterfall islands',
    theme: 'jungle',
    laps: 3,
    width: 8,
    shoulder: 2.5,
    difficulty: 5,
    aiSkill: 0.91,
    aiCars: ['z06', 'cayman', 'gr86', 'z06', 'cayman'],
    points: sky([
      [0, -20, 0], [0, 100, 2], [30, 170, 4], [90, 192, 6], [132, 150, 6], [120, 90, 4],
      [160, 40, 3], [230, 50, 5], [262, 120, 8], [242, 200, 10], [282, 272, 10], [362, 262, 8],
      [392, 182, 6], [372, 92, 4], [392, 10, 3], [352, -72, 2], [262, -92, 1], [182, -52, 0],
      [102, -92, 0], [32, -74, 0],
    ], 130, 2.5),
    boosts: [{ u: 0.12, lat: 0 }, { u: 0.36, lat: 2 }, { u: 0.74, lat: 0 }],
    ramps: [{ u: 0.88, lat: [-8, 8] }],
    gaps: [{ u: 0.765, len: 14 }],
    rollers: [{ u0: 0.59, u1: 0.69, amp: 2.6, len: 46 }],
    open: [[0.015, 0.09]],
  },
  {
    id: 'volcano-inferno',
    name: 'Volcano Inferno',
    tagline: 'Figure-8 through burning ash skies',
    theme: 'volcano',
    laps: 3,
    width: 9.5,
    shoulder: 2.5,
    bank: 0.6,
    difficulty: 6,
    aiSkill: 0.915,
    aiCars: ['z06', 'z06', 'cayman', 'gtr', 'cayman'],
    points: figure8({ ax: 270, az: 165, n: 28, y0: 125, yAmp: 15, wob: 30, wobF: 3 }),
    boosts: [{ u: 0.1, lat: 0 }, { u: 0.43, lat: 0 }, { u: 0.68, lat: 0 }, { u: 0.93, lat: 0 }],
    ramps: [{ u: 0.45, lat: [-9.5, 9.5] }, { u: 0.86, lat: [-9.5, 0] }],
    gaps: [{ u: 0.06, len: 18 }],
    rollers: [{ u0: 0.63, u1: 0.71, amp: 2.4, len: 48 }],
    open: [[0.2, 0.3], [0.75, 0.82]],
  },
  {
    id: 'airship-harbor',
    name: 'Airship Harbor',
    tagline: 'Drift the docks where airships moor',
    theme: 'harbor',
    laps: 3,
    width: 9.5,
    shoulder: 2,
    difficulty: 7,
    aiSkill: 0.925,
    aiCars: ['gtr', 'z06', 'cayman', 'z06', 'gr86'],
    points: sky(roundPoly([
      [0, -60, 0], [0, 210, 0], [90, 210, 6], [90, 280, 10], [240, 280, 14], [240, 150, 10],
      [150, 150, 6], [150, 70, 6], [270, 70, 2], [270, -70, -6], [175, -70, -6], [175, -150, -2],
      [70, -150, 0], [70, -60, 0],
    ], 24), 115),
    boosts: [{ u: 0.12, lat: 0 }, { u: 0.5, lat: 0 }, { u: 0.75, lat: 0 }],
    ramps: [{ u: 0.31, lat: [-9.5, 9.5] }],
    gaps: [{ u: 0.06, len: 16 }],
    rollers: [{ u0: 0.6, u1: 0.68, amp: 2, len: 44 }],
    open: [[0.33, 0.4]],
  },
  {
    id: 'aurora-glacier',
    name: 'Aurora Glacier',
    tagline: 'Ice-slick sky roads under the northern lights',
    theme: 'glacier',
    laps: 3,
    width: 11,
    shoulder: 3,
    grip: 0.74,
    difficulty: 8,
    aiSkill: 0.93,
    aiCars: ['gtr', 'z06', 'gtr', 'cayman', 'z06'],
    points: sky([
      [0, -20, 0], [0, 200, 4], [60, 360, 10], [200, 422, 14], [350, 382, 10], [422, 262, 6],
      [382, 142, 4], [442, 40, 8], [542, 0, 12], [602, -120, 10], [542, -242, 6], [400, -262, 2],
      [262, -202, 0], [162, -242, 2], [62, -202, 1], [0, -110, 0],
    ], 140, 3),
    boosts: [{ u: 0.03, lat: -3 }, { u: 0.03, lat: 3 }, { u: 0.14, lat: 0 }, { u: 0.4, lat: 0 }, { u: 0.71, lat: 0 }],
    ramps: [{ u: 0.22, lat: [-11, 11] }, { u: 0.9, lat: [0, 11] }],
    gaps: [{ u: 0.1, len: 18 }],
    rollers: [{ u0: 0.62, u1: 0.69, amp: 2.5, len: 55 }],
    open: [[0.43, 0.5], [0.8, 0.86]],
  },
  {
    id: 'storm-runner',
    name: 'Storm Runner',
    tagline: 'No rails. Lightning. Keep it on the road.',
    theme: 'storm',
    laps: 3,
    width: 10,
    shoulder: 1.5,
    bank: 1,
    difficulty: 9,
    aiSkill: 0.945,
    aiCars: ['gtr', 'gtr', 'z06', 'z06', 'gtr'],
    points: sky([
      [0, -40, 80], [0, 220, 86], [60, 340, 95], [180, 382, 105], [300, 332, 110], [342, 222, 100],
      [302, 122, 92], [362, 20, 96], [482, 0, 104], [562, -100, 100], [522, -232, 90],
      [382, -262, 82], [242, -202, 78], [122, -232, 80], [22, -162, 80],
    ].map(([x, z, y]) => [x, z, (y - 80) * 2]), 150),
    boosts: [{ u: 0.115, lat: 0 }, { u: 0.33, lat: 0 }, { u: 0.55, lat: -3 }, { u: 0.55, lat: 3 }, { u: 0.735, lat: 0 }],
    ramps: [],
    gaps: [{ u: 0.1, len: 20 }, { u: 0.72, len: 22 }],
    rollers: [{ u0: 0.91, u1: 0.985, amp: 2.4, len: 50 }],
    open: [[0.24, 0.32], [0.48, 0.6], [0.8, 0.88]],
  },
  {
    id: 'galaxy-gp',
    name: 'Galaxy Grand Prix',
    tagline: 'The final race among the stars',
    theme: 'space',
    laps: 3,
    width: 10,
    shoulder: 1,
    bank: 1.2,
    difficulty: 10,
    aiSkill: 0.96,
    aiCars: ['gtr', 'gtr', 'gtr', 'z06', 'z06'],
    points: figure8({ ax: 360, az: 230, n: 48, y0: 130, yAmp: 16, wob: 22, wobF: 5, yWob: 7 }),
    boosts: [{ u: 0.065, lat: 0 }, { u: 0.2, lat: 0 }, { u: 0.45, lat: -3 }, { u: 0.45, lat: 3 }, { u: 0.555, lat: 0 }, { u: 0.95, lat: 0 }],
    ramps: [],
    gaps: [{ u: 0.05, len: 22 }, { u: 0.54, len: 20 }],
    rollers: [{ u0: 0.84, u1: 0.93, amp: 2.4, len: 50 }],
    open: [[0.13, 0.27], [0.62, 0.76]],
  },
];

export const POSITION_REWARD = [600, 420, 300, 180, 120, 80];
export const POSITION_STARS = [3, 2, 1, 0, 0, 0];
