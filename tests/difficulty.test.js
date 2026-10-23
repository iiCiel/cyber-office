import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const { getDifficulty, setDifficulty, cycleDifficulty, DIFFICULTIES, ORDER } = await import('../src/game/difficulty.js');

beforeEach(() => store.clear());

test('difficulty defaults to Analyst, the original pace (4 s per game minute, arrow on, no hint)', () => {
  const d = getDifficulty();
  assert.equal(d.id, 'analyst');
  assert.equal(d.minuteMs, 4000);
  assert.equal(d.marker, true);
  assert.equal(d.hint, false);
  assert.equal(d.crisisRate, 1);
});

test('difficulty is saved, cycles in order and ignores junk', () => {
  assert.equal(cycleDifficulty().id, 'senior');
  assert.equal(getDifficulty().id, 'senior');
  assert.equal(cycleDifficulty().id, 'trainee');
  assert.equal(cycleDifficulty().id, 'analyst');
  store.set('cyber-office:difficulty', 'nightmare');
  assert.equal(getDifficulty().id, 'analyst');
  assert.equal(setDifficulty('trainee').id, 'trainee');
});

test('levels get harder in order', () => {
  const [a, b, c] = ORDER.map((k) => DIFFICULTIES[k]);
  assert.ok(a.minuteMs > b.minuteMs && b.minuteMs > c.minuteMs);
  assert.ok(a.crisisRate < b.crisisRate && b.crisisRate < c.crisisRate);
  assert.ok(a.hint && !c.hint && !c.marker);
});
