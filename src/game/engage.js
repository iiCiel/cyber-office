// Simulated engagement engine (pure logic, no DOM). A scripted "terminal": the player types (or picks) one of
// a fixed whitelist of commands; each maps to canned output from src/cases/halcyon-engagement.js. Nothing is
// ever executed. After the objective, buildSiem() writes the blue-team view of exactly the moves the player made
// (logkit.js formats + noise) and the debrief asks them to find the log line each move left.
import { logBuilder, finishLogs } from './logkit.js';
import { ENGAGEMENT, DATE, ATTACKER, engagementNoise } from '../cases/halcyon-engagement.js';

export const BASE_PROMPT = `${ATTACKER.host}@kali:~$`;
const STEP_GAP = 7 * 60; // simulated minutes between moves

export const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

export function newRun(eng = ENGAGEMENT) {
  return { eng, done: [], picks: {}, times: {}, clock: eng.start, prompt: BASE_PROMPT, strikes: 0, refused: 0, finished: false };
}

/** Steps run so far as { step, choice, t }. */
export const history = (run) => run.done.map((id) => {
  const step = run.eng.steps.find((s) => s.id === id);
  return { step, choice: step.choices[run.picks[id]], t: run.times[id] };
});

/** The next move (steps are a chain: one is open at a time). */
export const nextStep = (run) => (run.finished ? null : run.eng.steps.find((s) => !run.done.includes(s.id)) || null);

const HELP = [
  'This is a simulation. Only the moves of this engagement work; nothing is executed anywhere.',
  'Built-ins:  help  moves  roe  hint  clear',
  'Type a command from the MOVES list (or click it) to run it.',
];

/**
 * Run one line of input. Returns { lines: string[], kind: 'ok'|'builtin'|'refused'|'violation'|'choose', step?, choice?, clear? }.
 * Mutates `run` only for accepted moves and rules-of-engagement strikes.
 */
export function runCommand(run, input) {
  const q = norm(input);
  const step = nextStep(run);
  if (!q) return { kind: 'builtin', lines: [] };
  if (q === 'help' || q === '?') return { kind: 'builtin', lines: HELP };
  if (q === 'clear' || q === 'cls') return { kind: 'builtin', lines: [], clear: true };
  if (q === 'roe') return { kind: 'builtin', lines: run.eng.roe.map((l) => `- ${l}`) };
  if (q === 'moves' || q === 'hint') {
    if (!step) return { kind: 'builtin', lines: ['Objective reached. Open the SOC debrief.'] };
    return { kind: 'builtin', lines: [`Next: ${step.goal}  [${step.tactic} · ${step.tid}]`, ...step.choices.map((c) => `  ${c.cmd}    # ${c.label}`)] };
  }
  if (!step) return { kind: 'refused', lines: ['Engagement complete. Nothing left to run; open the SOC debrief.'] };

  const idx = step.choices.findIndex((c) => norm(c.cmd) === q);
  if (idx >= 0) {
    const choice = step.choices[idx];
    if (choice.violation) {
      run.strikes += 1;
      return { kind: 'violation', lines: choice.output, step, choice };
    }
    run.done.push(step.id);
    run.picks[step.id] = idx;
    run.times[step.id] = run.clock;
    run.clock += STEP_GAP + ((run.done.length * 37) % 53) + (choice.loud ? 4 * 60 : 0); // uneven seconds, like real logs
    if (choice.prompt) run.prompt = choice.prompt;
    if (step.objective) run.finished = true;
    return { kind: 'ok', lines: choice.output, step, choice };
  }
  // Right tool, wrong arguments: show the options instead of a dead end.
  const first = q.split(' ')[0];
  const same = step.choices.filter((c) => norm(c.cmd).split(' ')[0] === first);
  if (same.length) return { kind: 'choose', lines: [`${first}: in this simulation the options for this step are:`, ...same.map((c) => `  ${c.cmd}    # ${c.label}`)] };
  // A command from a later step: you don't know enough yet.
  const later = run.eng.steps.some((s) => s.choices.some((c) => norm(c.cmd) === q || norm(c.cmd).split(' ')[0] === first));
  run.refused += 1;
  if (later) return { kind: 'refused', lines: [`Not yet: you have not found what that needs. Next goal: ${step.goal}`] };
  return { kind: 'refused', lines: [`${first}: not available in this simulation. Type "moves" for what you can do next.`] };
}

/** Run a full chain automatically (tests / verify): `prefer` = 'quiet' | 'loud'. */
export function autoplay(prefer = 'quiet', eng = ENGAGEMENT) {
  const run = newRun(eng);
  let step;
  while ((step = nextStep(run))) {
    const ok = step.choices.filter((c) => !c.violation);
    const c = (prefer === 'loud' ? ok.find((x) => x.loud) : ok.find((x) => !x.loud)) || ok[0];
    runCommand(run, c.cmd);
  }
  return run;
}

/** The blue-team view of this run: noise + every event the player's moves left, in the SIEM's display format. */
export function buildSiem(run) {
  const b = logBuilder(4207);
  const end = run.clock + 300;
  engagementNoise(b, run.eng.start, end);
  for (const { step, choice, t } of history(run)) step.logs(b, t, { loud: !!choice.loud });
  return finishLogs(b.ev, { nowMinutes: Math.ceil(end / 60) + 1, date: DATE });
}

/** Alerts the SOC actually got from this run (events carrying `detection`). */
export const detections = (events) => events.filter((e) => e.detection).map((e) => ({ id: e.id, key: e.key, text: e.detection, time: e.time }));

/** Did the picked event belong to this step? */
export const isEvidence = (events, stepId, eventId) => !!events.find((e) => e.id === eventId && e.key === stepId);

/**
 * Grade: 70% the hunt (found the log line for each move; half credit if it took more than one try),
 * 30% stealth (each loud move -15, out of 30), minus 15 per rules-of-engagement strike.
 */
export function scoreRun(run, events, answers, misses = {}) {
  const hist = history(run);
  const hits = hist.filter(({ step }) => isEvidence(events, step.id, answers[step.id]));
  const found = hits.length;
  const credit = hits.reduce((a, { step }) => a + (misses[step.id] ? 0.5 : 1), 0);
  const loud = hist.filter(({ choice }) => choice.loud).length;
  const hunt = hist.length ? (credit / hist.length) * 70 : 0;
  const stealth = Math.max(0, 30 - loud * 15);
  const pct = Math.max(0, Math.round(hunt + stealth - run.strikes * 15));
  const letter = pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';
  return { found, total: hist.length, loud, strikes: run.strikes, pct, letter, alerts: detections(events).length };
}

const KEY = 'cyber-office.engage.best';
export function recordBest(id, grade) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}');
    if (!all[id] || grade.pct > all[id].pct) all[id] = { pct: grade.pct, letter: grade.letter };
    localStorage.setItem(KEY, JSON.stringify(all));
    return all[id];
  } catch {
    return null;
  }
}
