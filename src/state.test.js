import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newState, addXp, xpToNext, save, load, KEY } from './state.js';

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

test('addXp levels up and raises stats', () => {
  const s = newState();
  assert.equal(addXp(s, 10), 0);
  assert.equal(s.level, 1);
  assert.equal(addXp(s, xpToNext(1)), 1); // 10 left over after level 2
  assert.deepEqual([s.level, s.xp, s.maxHp, s.atk, s.hp], [2, 10, 115, 16, 115]);
});

test('addXp can gain several levels at once', () => {
  const s = newState();
  assert.equal(addXp(s, 40 + 80 + 5), 2);
  assert.deepEqual([s.level, s.xp], [3, 5]);
});

test('save/load round-trips', () => {
  const st = memStorage();
  const s = newState();
  Object.assign(s, { level: 3, xp: 7, quest: 5, killed: ['shade1'], lit: ['east'], flasks: 1, pos: { x: 301, z: -3 } });
  save(s, st);
  assert.deepEqual(load(st), s);
});

test('load rejects or sanitises bad data', () => {
  const st = memStorage();
  assert.equal(load(st), null);
  st.setItem(KEY, '{not json');
  assert.equal(load(st), null);
  st.setItem(KEY, JSON.stringify({ level: -4, hp: 'x', quest: 99, killed: [1, 'golem1'], lit: 'east', flasks: 40, pos: { x: 'a' } }));
  const s = load(st);
  assert.deepEqual([s.level, s.hp, s.quest, s.killed, s.lit, s.flasks, s.pos], [1, 100, 7, ['golem1'], [], 3, null]);
});
