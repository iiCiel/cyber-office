// Difficulty: how much help the office gives you. It changes pace and guidance, never the scoring, so a grade
// means the same thing at every level (the report card says which level the day was played on).
//
//   minuteMs     real milliseconds per in-game minute (email, calls and the SIEM alert run on this clock)
//   marker       the yellow arrow over the next objective
//   hint         a "Stuck?" hint in the investigation write-up (the case's key line, in plain words)
//   crisisRate   how fast the Day 5 ransomware counter climbs, relative to normal

const KEY = 'cyber-office:difficulty';

export const DIFFICULTIES = {
  trainee: { id: 'trainee', label: 'Trainee', minuteMs: 6000, marker: true, hint: true, crisisRate: 0.6, blurb: 'Slower clock, a hint in the write-up, slower ransomware.' },
  analyst: { id: 'analyst', label: 'Analyst', minuteMs: 4000, marker: true, hint: false, crisisRate: 1, blurb: 'The intended pace.' },
  senior: { id: 'senior', label: 'Senior', minuteMs: 3000, marker: false, hint: false, crisisRate: 1.4, blurb: 'Faster clock, no guide arrow, faster ransomware.' },
};
export const ORDER = ['trainee', 'analyst', 'senior'];
export const DEFAULT_DIFFICULTY = 'analyst';

export function getDifficulty() {
  let id = DEFAULT_DIFFICULTY;
  try {
    id = globalThis.localStorage?.getItem(KEY) || DEFAULT_DIFFICULTY;
  } catch {
    /* private mode */
  }
  return DIFFICULTIES[id] || DIFFICULTIES[DEFAULT_DIFFICULTY];
}

export function setDifficulty(id) {
  const d = DIFFICULTIES[id] || DIFFICULTIES[DEFAULT_DIFFICULTY];
  try {
    globalThis.localStorage?.setItem(KEY, d.id);
  } catch {
    /* ignore */
  }
  return d;
}

/** Next level in ORDER (wraps around). */
export function cycleDifficulty() {
  const i = ORDER.indexOf(getDifficulty().id);
  return setDifficulty(ORDER[(i + 1) % ORDER.length]);
}
