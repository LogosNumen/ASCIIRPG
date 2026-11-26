import { fbm } from './noise.js';

// Valley layout and terrain height, shared by rendering, physics and AI.
// The valley runs north (-z): start in the south, shrine, path, waterfall and cave in the north cliff.
export const START = { x: 1, z: 38 };
export const SHRINE = { x: -13, z: 15, r: 5.2 };
export const NPC_POS = { x: -10.6, z: 12.4 };
export const POOL = { x: -12, z: -35, r: 6.5 };
export const FALLS = { x: -12, lipZ: -46.5 };
export const CAVE = { x: 14, z: -42 };
export const CAVE_TRIGGER = { x: 14, z: -40.5, r: 3 };
export const BOUNDS = { minX: -40, maxX: 40, minZ: -47, maxZ: 60 };
export const PATH = [[2, 52], [0, 36], [-4, 26], [-6, 16], [-2, 5], [4, -7], [9, -19], [12, -30], [14, -41]];

export const ENEMY_SPAWNS = [
  { id: 'shade1', type: 'shade', x: 1, z: -1 },
  { id: 'shade2', type: 'shade', x: 6, z: -6 },
  { id: 'golem1', type: 'golem', x: 8, z: -15 },
  { id: 'shade3', type: 'shade', x: 13, z: -22 },
  { id: 'shade4', type: 'shade', x: 6, z: -25 },
  { id: 'golem2', type: 'golem', x: 12, z: -32 },
];

export function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// Flat ledges with steep risers: reads as layered cliff strata once it's ASCII.
function terrace(h, step = 4) {
  const t = h / step, f = Math.floor(t);
  return (f + smooth(0.55, 1, t - f)) * step;
}

function rawHeight(x, z) {
  const bend = Math.sin(z * 0.045) * 4;
  const rough = fbm(x * 0.07, z * 0.07);
  const side = smooth(24, 34, Math.abs(x - bend) + rough * 7);
  const north = smooth(-40, -46, z + (rough - 0.5) * 2);
  const south = smooth(50, 64, z + rough * 4);
  let wall = Math.max(side * 40, north * 46, south * 26);
  wall *= smooth(2.6, 5.5, Math.hypot(x - CAVE.x, (z - CAVE.z) * 0.9)); // notch for the cave mouth
  wall = terrace(wall + fbm(x * 0.2, z * 0.2) * 5 * Math.min(1, wall / 6));
  return (fbm(x * 0.03 + 10, z * 0.03) - 0.5) * 3 + wall;
}

const SHRINE_Y = rawHeight(SHRINE.x, SHRINE.z);
export const SHRINE_TOP = SHRINE_Y + 0.55;
export const POOL_FLOOR = -1.8;
export const WATER_Y = -0.6;

export function heightAt(x, z) {
  let h = rawHeight(x, z);
  const ds = Math.hypot(x - SHRINE.x, z - SHRINE.z);
  h += (SHRINE_Y - h) * (1 - smooth(SHRINE.r + 1, SHRINE.r + 4, ds));
  const dp = Math.hypot(x - POOL.x, z - POOL.z);
  h += (POOL_FLOOR - h) * (1 - smooth(POOL.r - 2, POOL.r, dp));
  return h;
}

// What feet stand on: terrain plus the shrine platform.
export function groundAt(x, z) {
  const h = heightAt(x, z);
  return Math.hypot(x - SHRINE.x, z - SHRINE.z) < SHRINE.r ? Math.max(h, SHRINE_TOP) : h;
}

export function distToPath(x, z) {
  let best = Infinity;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

export const inBounds = (x, z) => x > BOUNDS.minX && x < BOUNDS.maxX && z > BOUNDS.minZ && z < BOUNDS.maxZ;
