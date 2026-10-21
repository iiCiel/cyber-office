// Background music, synthesized in code like the sound effects: no audio files.
// A tiny step sequencer with a look-ahead scheduler (the standard Web Audio pattern: a timer wakes up
// every 25 ms and books every note that falls in the next ~120 ms on the audio clock, so timing stays
// tight even when the main thread is busy).
//
// Each mood is a short loop: a chord progression (one chord per bar), a bass line, a sparse arpeggio
// and soft hi-hats. Music has its own on/off switch (persisted) and sits under the master mute.

const MUSIC_KEY = 'cyber-office:music';

// MIDI note number -> Hz.
export const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Steps are 16th notes, 16 per bar. Chords are MIDI note lists. Patterns use step indexes.
// arp: steps where the arpeggio plays (it walks up the current chord). bass: steps where the root plays.
// hat: steps with a hi-hat tick. padGain / arpGain / bassGain are per-mood mix levels (0..0.2).
export const MOODS = {
  // Title / menus: slow, spacious, a bit mysterious.
  calm: {
    bpm: 72,
    chords: [
      [57, 60, 64, 67], // Am7
      [53, 57, 60, 64], // Fmaj7
      [48, 55, 59, 64], // Cmaj7
      [55, 59, 62, 66], // G6-ish
    ],
    bass: [0, 8],
    arp: [0, 3, 6, 10, 13],
    hat: [],
    wave: { pad: 'sine', arp: 'triangle', bass: 'triangle' },
    padGain: 0.05,
    arpGain: 0.035,
    bassGain: 0.07,
  },
  // A normal workday: lo-fi office groove.
  work: {
    bpm: 86,
    chords: [
      [50, 53, 57, 60], // Dm7
      [55, 59, 62, 65], // G7
      [48, 52, 55, 59], // Cmaj7
      [45, 48, 52, 55], // Am7
    ],
    bass: [0, 6, 8, 14],
    arp: [2, 5, 7, 10, 12, 15],
    hat: [2, 6, 10, 14],
    wave: { pad: 'sine', arp: 'square', bass: 'triangle' },
    padGain: 0.04,
    arpGain: 0.018,
    bassGain: 0.08,
  },
  // An alert or the Day 5 ransomware clock: driving minor pulse.
  tense: {
    bpm: 126,
    chords: [
      [50, 53, 57], // Dm
      [50, 53, 57], // Dm
      [46, 50, 53], // Bb
      [45, 49, 52], // A
    ],
    bass: [0, 2, 4, 6, 8, 10, 12, 14],
    arp: [0, 3, 6, 8, 11, 14],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
    wave: { pad: 'sawtooth', arp: 'square', bass: 'sawtooth' },
    padGain: 0.018,
    arpGain: 0.02,
    bassGain: 0.055,
  },
  // Report card: warm resolution.
  report: {
    bpm: 80,
    chords: [
      [48, 52, 55, 59], // Cmaj7
      [53, 57, 60, 64], // Fmaj7
      [45, 48, 52, 55], // Am7
      [55, 59, 62, 65], // G7
    ],
    bass: [0, 10],
    arp: [0, 4, 8, 12],
    hat: [4, 12],
    wave: { pad: 'sine', arp: 'triangle', bass: 'triangle' },
    padGain: 0.045,
    arpGain: 0.03,
    bassGain: 0.07,
  },
};

// Pure: every note a mood plays in one bar, as { step, kind, midi, durSteps }. Used by the scheduler and tests.
export function barNotes(mood, bar) {
  const m = MOODS[mood];
  if (!m) return [];
  const chord = m.chords[bar % m.chords.length];
  const notes = chord.map((midi) => ({ step: 0, kind: 'pad', midi, durSteps: 16 }));
  for (const s of m.bass) notes.push({ step: s, kind: 'bass', midi: chord[0] - 12, durSteps: m.bass.length > 4 ? 1.6 : 3 });
  m.arp.forEach((s, i) => notes.push({ step: s, kind: 'arp', midi: chord[i % chord.length] + 12, durSteps: 1.5 }));
  for (const s of m.hat) notes.push({ step: s, kind: 'hat', midi: 0, durSteps: 0.4 });
  return notes;
}

export class Music {
  constructor(sound) {
    this.sound = sound; // owns ctx, master and noiseBuf
    this.enabled = this.loadEnabled();
    this.mood = null;
    this.bus = null;
    this.timer = null;
    this.step = 0;
    this.nextTime = 0;
  }

  loadEnabled() {
    try {
      return localStorage.getItem(MUSIC_KEY) !== '0';
    } catch {
      return true;
    }
  }

  setEnabled(on) {
    this.enabled = on;
    try {
      localStorage.setItem(MUSIC_KEY, on ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (on) this.start();
    else this.stopTimer(true);
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  // Ask for a mood. Safe to call any time (before audio is unlocked it just remembers the mood).
  play(mood) {
    if (!MOODS[mood]) return;
    if (mood === this.mood && this.timer) return;
    this.mood = mood;
    this.start();
  }

  // Called by Sound.resume() once the AudioContext exists.
  start() {
    const ctx = this.sound?.ctx;
    if (!ctx || !this.enabled || !this.mood) return;
    if (!this.bus) {
      this.bus = ctx.createGain();
      this.bus.connect(this.sound.master);
    }
    this.bus.gain.cancelScheduledValues(ctx.currentTime);
    this.bus.gain.setValueAtTime(this.bus.gain.value || 0.0001, ctx.currentTime);
    this.bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.6);
    if (this.timer) {
      // Mood change: restart on the next bar boundary of the new tempo.
      this.step = 0;
      this.nextTime = ctx.currentTime + 0.1;
      return;
    }
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.tick(), 25);
  }

  stopTimer(fade) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const ctx = this.sound?.ctx;
    if (fade && ctx && this.bus) {
      this.bus.gain.cancelScheduledValues(ctx.currentTime);
      this.bus.gain.setValueAtTime(this.bus.gain.value, ctx.currentTime);
      this.bus.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    }
  }

  tick() {
    const ctx = this.sound?.ctx;
    const m = MOODS[this.mood];
    if (!ctx || !m) return;
    const stepDur = 60 / m.bpm / 4;
    // Background tabs throttle timers to ~1 s; skip missed steps instead of firing them all at once.
    if (this.nextTime < ctx.currentTime - 0.05) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const bar = Math.floor(this.step / 16);
      const inBar = this.step % 16;
      for (const n of barNotes(this.mood, bar)) if (n.step === inBar) this.voice(n, m, this.nextTime, stepDur);
      this.step++;
      this.nextTime += stepDur;
    }
  }

  voice(n, m, when, stepDur) {
    const ctx = this.sound.ctx;
    const dur = n.durSteps * stepDur;
    const g = ctx.createGain();
    g.connect(this.bus);
    let src;
    if (n.kind === 'hat') {
      src = ctx.createBufferSource();
      src.buffer = this.sound.noiseBuf;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      src.connect(hp);
      hp.connect(g);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.02, when + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    } else {
      const peak = n.kind === 'pad' ? m.padGain : n.kind === 'arp' ? m.arpGain : m.bassGain;
      src = ctx.createOscillator();
      src.type = m.wave[n.kind];
      src.frequency.setValueAtTime(hz(n.midi), when);
      // Pads swell in and out; plucks and bass hit and decay.
      const attack = n.kind === 'pad' ? dur * 0.3 : 0.008;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(peak, when + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      if (m.wave[n.kind] !== 'sine' && m.wave[n.kind] !== 'triangle') {
        // Soften buzzy waves with a low-pass so the music sits under the sound effects.
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = n.kind === 'bass' ? 600 : 1800;
        src.connect(lp);
        lp.connect(g);
      } else src.connect(g);
    }
    src.start(when);
    src.stop(when + dur + 0.05);
  }
}
