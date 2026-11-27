// Player progress: plain data, saved to localStorage.
export const KEY = 'mistfall-save-v2'; // v2: quest stages 0-7, flasks, lit waystones

export const newState = () => ({
  level: 1, xp: 0, hp: 100, maxHp: 100, atk: 12, quest: 0, killed: [], lit: [], flasks: 3, pos: null,
});

export const MAX_STAGE = 7;
export const MAX_FLASKS = 3;
export const xpToNext = (level) => 40 * level;

// Returns how many levels were gained.
export function addXp(s, amount) {
  s.xp += amount;
  let ups = 0;
  while (s.xp >= xpToNext(s.level)) {
    s.xp -= xpToNext(s.level);
    s.level++;
    s.maxHp += 15;
    s.atk += 4;
    s.hp = s.maxHp;
    ups++;
  }
  return ups;
}

export function save(s, storage = globalThis.localStorage) {
  try { storage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked: play on unsaved */ }
}

export function clear(storage = globalThis.localStorage) {
  try { storage.removeItem(KEY); } catch { /* ignore */ }
}

// Saved data is untrusted (hand-edited, old versions): rebuild it field by field.
export function load(storage = globalThis.localStorage) {
  let d;
  try { d = JSON.parse(storage.getItem(KEY)); } catch { return null; }
  if (!d || typeof d !== 'object') return null;
  const num = (v, def, min = 0) => (Number.isFinite(v) && v >= min ? v : def);
  const s = newState();
  s.level = Math.floor(num(d.level, 1, 1));
  s.xp = num(d.xp, 0);
  s.maxHp = num(d.maxHp, 100, 1);
  s.hp = Math.min(s.maxHp, num(d.hp, s.maxHp, 1));
  s.atk = num(d.atk, 12, 1);
  s.quest = Math.min(MAX_STAGE, Math.floor(num(d.quest, 0)));
  const ids = (a) => (Array.isArray(a) ? a.filter((k) => typeof k === 'string') : []);
  s.killed = ids(d.killed);
  s.lit = ids(d.lit);
  s.flasks = Math.min(MAX_FLASKS, Math.floor(num(d.flasks, MAX_FLASKS)));
  s.pos = d.pos && Number.isFinite(d.pos.x) && Number.isFinite(d.pos.z) ? { x: d.pos.x, z: d.pos.z } : null;
  return s;
}
