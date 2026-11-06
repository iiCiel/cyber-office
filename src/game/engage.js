// Simulated engagement engine (pure logic, no DOM). A scripted "terminal": the player types (or picks) one of
// a fixed whitelist of commands; each maps to canned output from src/cases/halcyon-engagement.js. Nothing is
// ever executed. After the objective, buildSiem() writes the blue-team view of exactly the moves the player made
// (logkit.js formats + noise) and the debrief asks them to find the log line each move left.
import { logBuilder, finishLogs } from './logkit.js';
import { ENGAGEMENT } from '../cases/halcyon-engagement.js';

export const BASE_PROMPT = 'assessor@kali:~$';
const STEP_GAP = 7 * 60; // simulated minutes between moves

export const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();

export function newRun(eng = ENGAGEMENT) {
  return { eng, done: [], picks: {}, times: {}, clock: eng.start, prompt: eng.prompt || BASE_PROMPT, strikes: 0, refused: 0, finished: false };
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
  'Built-ins:  help  moves  roe  hint  clear   (plus whoami, id, pwd, hostname, date, uname -a, ip a, ls, history)',
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

  const idx = matchChoice(step, q);
  // Everyday shell commands (after the step's own moves, so a step that IS "ip addr" still advances).
  const amb = idx < 0 && ambient(run, q);
  if (amb) return { kind: 'builtin', lines: amb };
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

// --- a terminal, not a menu ----------------------------------------------------------------------------------
// Real operators retype commands their own way: sudo in front, flags in a different order, a trailing slash.
// Accept those as the same move, so the player is judged on WHAT they run, not on matching our exact string.
const canon = (q) => {
  const t = norm(q).replace(/^sudo\s+(-\S+\s+)*/, '').split(' ').map((w) => w.replace(/(.)\/$/, '$1'));
  return { head: t[0], bag: t.slice(1).sort().join(' ') };
};
export function matchChoice(step, input) {
  const q = norm(input);
  let i = step.choices.findIndex((c) => norm(c.cmd) === q);
  if (i >= 0) return i;
  const a = canon(q);
  i = step.choices.findIndex((c) => { const b = canon(c.cmd); return b.head === a.head && b.bag === a.bag; });
  return i;
}

const pad2 = (n) => String(n).padStart(2, '0');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Who/where the prompt says we are: "user@host:path$". Null for non-shell prompts (smb: \>). */
export function whereAmI(run) {
  const m = /^([\w.-]+)@([\w.-]+):([^$#\s]*)/.exec(run.prompt || '');
  if (!m) return null;
  const [, user, host, raw] = m;
  const home = user === 'root' ? '/root' : `/home/${user}`;
  return { user, host, cwd: raw.replace(/^~/, home) || home, root: /#/.test(run.prompt) };
}

/**
 * Everyday shell commands that work at any step and never advance the chain (whoami, id, ip a, history...).
 * Output follows the current prompt, so after a pivot "whoami" really says svc_portal on portal01.
 */
export function ambient(run, q) {
  const w = whereAmI(run);
  if (!w) return null;
  const kali = w.host === 'kali';
  const ip = kali ? run.eng.attacker?.ip || '198.51.100.66' : '192.0.2.15';
  const uid = w.root ? 0 : kali ? 1000 : 1001;
  const user = w.root && kali ? 'root' : w.user;
  const d = run.eng.date || { weekday: 'FRI', month: 'Oct', day: 30, year: 2026 };
  const t = run.clock;
  const hh = `${pad2(Math.floor(t / 3600) % 24)}:${pad2(Math.floor((t % 3600) / 60))}:${pad2(t % 60)}`;
  const wd = (d.weekday || 'FRI').slice(0, 1) + (d.weekday || 'FRI').slice(1, 3).toLowerCase();
  switch (q) {
    case 'whoami': return [user];
    case 'id': return [`uid=${uid}(${user}) gid=${uid}(${user}) groups=${uid}(${user})${kali && !w.root ? ',27(sudo),117(wireshark)' : ''}`];
    case 'pwd': return [w.cwd];
    case 'hostname': return [w.host];
    case 'date': return [`${wd} ${d.month || MON[9]} ${pad2(d.day)} ${hh} EDT ${d.year}`];
    case 'uname -a': return [kali ? `Linux kali 6.11.2-amd64 #1 SMP PREEMPT_DYNAMIC Kali 6.11.2-1kali1 (2026-10-02) x86_64 GNU/Linux` : `Linux ${w.host} 5.15.0-122-generic #132-Ubuntu SMP Thu Aug 29 13:45:52 UTC 2024 x86_64 x86_64 x86_64 GNU/Linux`];
    case 'ip a': case 'ip addr': case 'ifconfig': return [
      '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000',
      '    inet 127.0.0.1/8 scope host lo',
      `2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000`,
      `    link/ether 08:00:27:${kali ? '4e:1a:9c' : '7d:02:b1'} brd ff:ff:ff:ff:ff:ff`,
      `    inet ${ip}/24 brd ${ip.replace(/\.\d+$/, '.255')} scope global ${kali ? 'dynamic ' : ''}eth0`,
    ];
    case 'ls': case 'ls -la': case 'ls -l': return kali
      ? ['loot  notes.md  scans  scope.txt']
      : ['total 12', `drwxr-x--- 2 ${user} ${user} 4096 ${d.month || 'Oct'} ${pad2(d.day)} 09:12 .`, `-rw------- 1 ${user} ${user}  220 Jan  6  2024 .bash_logout`, `-rw------- 1 ${user} ${user} 3771 Jan  6  2024 .bashrc`];
    case 'cat scope.txt': return run.eng.roe.map((l) => `- ${l}`);
    case 'history': {
      const lines = history(run).map((h, i) => `  ${String(i + 1).padStart(3)}  ${h.choice.cmd}`);
      return lines.length ? lines : ['    1  history'];
    }
    default: return null;
  }
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
  const eng = run.eng;
  const b = logBuilder(eng.seed || 4207);
  const end = run.clock + 300;
  if (eng.noise) eng.noise(b, eng.start, end);
  for (const { step, choice, t } of history(run)) step.logs(b, t, { loud: !!choice.loud });
  return finishLogs(b.ev, { nowMinutes: Math.ceil(end / 60) + 1, date: eng.date });
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

/** Best grade per engagement id ({ pct, letter }), or {} if nothing saved / storage blocked. */
export function loadBests() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}
