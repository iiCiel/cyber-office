// All sound is synthesized in code with the Web Audio API: no asset files, same spirit as the art.
// Each effect is a short list of "voices" (oscillator blips with an envelope). A tiny sequencer plays them.
// Muted state is persisted. Audio can only start after a user gesture (handled by resume()).

import { Music } from './music.js';

const MUTE_KEY = 'cyber-office:muted';

// A sound = array of voices. Voice: { type, freq, start, dur, gain, sweep, slide }
// freq in Hz; start/dur in seconds; gain 0..1; sweep = end freq for a glide; type = osc wave or 'noise'.
export const SOUNDS = {
  click: [{ type: 'square', freq: 420, start: 0, dur: 0.05, gain: 0.18 }],
  blip: [{ type: 'square', freq: 660, start: 0, dur: 0.02, gain: 0.08 }],
  step: [{ type: 'noise', freq: 220, start: 0, dur: 0.04, gain: 0.05 }],
  select: [
    { type: 'square', freq: 523, start: 0, dur: 0.06, gain: 0.16 },
    { type: 'square', freq: 784, start: 0.05, dur: 0.07, gain: 0.16 },
  ],
  back: [{ type: 'square', freq: 300, start: 0, dur: 0.07, gain: 0.14, sweep: 180 }],
  door: [
    { type: 'sine', freq: 880, start: 0, dur: 0.08, gain: 0.2 },
    { type: 'sine', freq: 1320, start: 0.09, dur: 0.1, gain: 0.2 },
  ],
  denied: [
    { type: 'square', freq: 200, start: 0, dur: 0.12, gain: 0.2 },
    { type: 'square', freq: 150, start: 0.13, dur: 0.16, gain: 0.2 },
  ],
  mail: [
    { type: 'triangle', freq: 1046, start: 0, dur: 0.07, gain: 0.14 },
    { type: 'triangle', freq: 1318, start: 0.08, dur: 0.1, gain: 0.14 },
  ],
  phone: [
    { type: 'sine', freq: 1000, start: 0, dur: 0.1, gain: 0.16 },
    { type: 'sine', freq: 1000, start: 0.14, dur: 0.1, gain: 0.16 },
  ],
  success: [
    { type: 'square', freq: 523, start: 0, dur: 0.08, gain: 0.16 },
    { type: 'square', freq: 659, start: 0.08, dur: 0.08, gain: 0.16 },
    { type: 'square', freq: 784, start: 0.16, dur: 0.14, gain: 0.16 },
  ],
  error: [
    { type: 'sawtooth', freq: 160, start: 0, dur: 0.22, gain: 0.18, sweep: 90 },
  ],
  alert: [
    { type: 'sawtooth', freq: 740, start: 0, dur: 0.16, gain: 0.2 },
    { type: 'sawtooth', freq: 587, start: 0.18, dur: 0.16, gain: 0.2 },
    { type: 'sawtooth', freq: 740, start: 0.36, dur: 0.16, gain: 0.2 },
  ],
  crisis: [
    { type: 'sawtooth', freq: 300, start: 0, dur: 0.3, gain: 0.22, sweep: 260 },
    { type: 'sawtooth', freq: 280, start: 0.3, dur: 0.3, gain: 0.22, sweep: 240 },
  ],
  chime: [
    { type: 'sine', freq: 784, start: 0, dur: 0.1, gain: 0.16 },
    { type: 'sine', freq: 1046, start: 0.1, dur: 0.18, gain: 0.16 },
  ],
};

// Validate a sound definition (used by tests and defensively at play time).
export function soundDuration(name) {
  const s = SOUNDS[name];
  if (!s) return 0;
  return Math.max(...s.map((v) => v.start + v.dur));
}

export class Sound {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = this.loadMuted();
    this.lastStep = 0;
    this.music = new Music(this);
  }

  loadMuted() {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  }

  // Must be called from a user gesture (click/keydown) before any sound plays.
  resume() {
    if (!this.ctx) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise();
      this.music.start();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  makeNoise() {
    const n = this.ctx.sampleRate * 0.4;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setMuted(m) {
    this.muted = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  toggleMute() {
    this.setMuted(!this.muted);
    if (!this.muted) this.play('click');
    return this.muted;
  }

  play(name) {
    if (!this.ctx || this.muted) return;
    const sound = SOUNDS[name];
    if (!sound) return;
    const t0 = this.ctx.currentTime;
    for (const v of sound) {
      const when = t0 + (v.start || 0);
      const g = this.ctx.createGain();
      g.connect(this.master);
      // Quick attack, linear-ish decay to silence.
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(v.gain, when + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, when + v.dur);

      let src;
      if (v.type === 'noise') {
        src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        const bp = this.ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = v.freq;
        src.connect(bp);
        bp.connect(g);
      } else {
        src = this.ctx.createOscillator();
        src.type = v.type;
        src.frequency.setValueAtTime(v.freq, when);
        if (v.sweep) src.frequency.exponentialRampToValueAtTime(v.sweep, when + v.dur);
        src.connect(g);
      }
      src.start(when);
      src.stop(when + v.dur + 0.02);
    }
  }

  // Footsteps are rate-limited so walking makes a soft patter, not a buzz.
  step(now) {
    if (now - this.lastStep < 260) return;
    this.lastStep = now;
    this.play('step');
  }
}
