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

import { MOODS, barNotes, hz, Music } from '../src/game/music.js';

test('music: every mood has a sane tempo, chords and patterns inside one bar', () => {
  const waves = new Set(['sine', 'square', 'triangle', 'sawtooth']);
  for (const [name, m] of Object.entries(MOODS)) {
    assert.ok(m.bpm >= 50 && m.bpm <= 160, `${name} bpm`);
    assert.ok(m.chords.length >= 2 && m.chords.every((c) => c.length >= 3), `${name} chords`);
    for (const k of ['bass', 'arp', 'hat']) assert.ok(m[k].every((s) => s >= 0 && s < 16), `${name} ${k} steps`);
    for (const k of ['pad', 'arp', 'bass']) assert.ok(waves.has(m.wave[k]), `${name} wave ${k}`);
    for (const k of ['padGain', 'arpGain', 'bassGain']) assert.ok(m[k] > 0 && m[k] <= 0.1, `${name} ${k} stays quiet under sound effects`);
  }
});

test('music: barNotes loops the progression and stays in audible range', () => {
  const a = barNotes('work', 0);
  const b = barNotes('work', MOODS.work.chords.length);
  assert.deepEqual(a, b, 'progression loops');
  for (const n of a) if (n.kind !== 'hat') assert.ok(hz(n.midi) > 40 && hz(n.midi) < 2000, `note ${n.midi}`);
  assert.equal(barNotes('nope', 0).length, 0);
  assert.equal(Math.round(hz(69)), 440);
});

test('music: safe without audio, remembers mood and persists its switch', () => {
  const store = {};
  global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)) };
  const s = new Sound();
  assert.ok(s.music instanceof Music);
  assert.doesNotThrow(() => s.music.play('calm'));
  assert.equal(s.music.mood, 'calm');
  assert.equal(s.music.timer, null, 'no timer without an AudioContext');
  s.music.toggle();
  assert.equal(store['cyber-office:music'], '0');
  assert.equal(new Sound().music.enabled, false);
  delete global.localStorage;
});
