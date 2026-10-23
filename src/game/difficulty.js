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

// Own keys only: a stored "toString" must not resolve to Object.prototype.toString.
const pick = (id) => (Object.hasOwn(DIFFICULTIES, id) ? DIFFICULTIES[id] : DIFFICULTIES[DEFAULT_DIFFICULTY]);

// If saving fails (storage blocked or full), remember the choice in memory so it still sticks until reload.
let unsaved = null;

export function getDifficulty() {
  if (unsaved) return unsaved;
  let id = DEFAULT_DIFFICULTY;
  try {
    id = globalThis.localStorage?.getItem(KEY) || DEFAULT_DIFFICULTY;
  } catch {
    /* private mode */
  }
  return pick(id);
}

export function setDifficulty(id) {
  const d = pick(id);
  unsaved = null;
  try {
    const ls = globalThis.localStorage; // reading this can itself throw when site data is blocked
    if (!ls) throw new Error('no storage');
    ls.setItem(KEY, d.id);
  } catch {
    unsaved = d;
  }
  return d;
}

/** Next level in ORDER (wraps around). */
export function cycleDifficulty() {
  const i = ORDER.indexOf(getDifficulty().id);
  return setDifficulty(ORDER[(i + 1) % ORDER.length]);
}
