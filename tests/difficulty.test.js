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
  for (const junk of ['toString', 'constructor', '__proto__']) {
    store.set('cyber-office:difficulty', junk);
    assert.equal(getDifficulty().id, 'analyst', junk);
  }
  assert.equal(setDifficulty('trainee').id, 'trainee');
});

test('a choice still sticks when storage is blocked or full (until reload)', () => {
  const real = globalThis.localStorage;
  try {
    // Full: setItem throws, getItem still returns the old saved value.
    store.set('cyber-office:difficulty', 'analyst');
    globalThis.localStorage = { getItem: real.getItem, setItem: () => { throw new Error('QuotaExceededError'); } };
    assert.equal(setDifficulty('senior').id, 'senior');
    assert.equal(getDifficulty().id, 'senior');
    assert.equal(cycleDifficulty().id, 'trainee');
    assert.equal(getDifficulty().id, 'trainee');
    // Blocked: both throw.
    globalThis.localStorage = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } };
    assert.equal(cycleDifficulty().id, 'analyst');
    assert.equal(cycleDifficulty().id, 'senior');
    assert.equal(getDifficulty().id, 'senior');
  } finally {
    globalThis.localStorage = real;
  }
  // Once saving works again, storage is the source of truth again.
  setDifficulty('trainee');
  assert.equal(store.get('cyber-office:difficulty'), 'trainee');
  store.set('cyber-office:difficulty', 'analyst');
  assert.equal(getDifficulty().id, 'analyst');
});

test('levels get harder in order', () => {
  const [a, b, c] = ORDER.map((k) => DIFFICULTIES[k]);
  assert.ok(a.minuteMs > b.minuteMs && b.minuteMs > c.minuteMs);
  assert.ok(a.crisisRate < b.crisisRate && b.crisisRate < c.crisisRate);
  assert.ok(a.hint && !c.hint && !c.marker);
});
