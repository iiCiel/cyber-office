import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOUNDS, soundDuration, Sound } from '../src/game/sound.js';

test('every sound is a non-empty list of valid voices', () => {
  const waves = new Set(['sine', 'square', 'triangle', 'sawtooth', 'noise']);
  for (const [name, voices] of Object.entries(SOUNDS)) {
    assert.ok(Array.isArray(voices) && voices.length, `${name} empty`);
    for (const v of voices) {
      assert.ok(waves.has(v.type), `${name}: bad type ${v.type}`);
      assert.ok(v.freq > 0 && v.freq < 20000, `${name}: freq ${v.freq}`);
      assert.ok(v.dur > 0 && v.dur < 2, `${name}: dur ${v.dur}`);
      assert.ok(v.gain > 0 && v.gain <= 0.5, `${name}: gain ${v.gain}`);
    }
  }
});

test('soundDuration returns the end of the last voice', () => {
  assert.equal(soundDuration('click'), 0.05);
  assert.ok(soundDuration('success') > 0.2);
  assert.equal(soundDuration('nope'), 0);
});

test('Sound is safe with no AudioContext (headless / server)', () => {
  const s = new Sound();
  assert.doesNotThrow(() => s.resume()); // no window.AudioContext here
  assert.doesNotThrow(() => s.play('click'));
  assert.doesNotThrow(() => s.step(1000));
});

test('mute persists through a fake localStorage', () => {
  const store = {};
  global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)) };
  const a = new Sound();
  assert.equal(a.muted, false);
  a.setMuted(true);
  assert.equal(store['cyber-office:muted'], '1');
  const b = new Sound();
  assert.equal(b.muted, true, 'a new Sound reads the saved mute');
  delete global.localStorage;
});
