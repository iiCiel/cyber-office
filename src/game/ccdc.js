// CCDC blue-team engine (pure logic, no DOM, unit-tested).
//
// This is the DEFENCE competition: Collegiate Cyber Defense Competition. You inherit a small business's
// network full of default creds and misconfigurations, and your whole job is to HARDEN it without knocking
// over the services that score points — exactly the real-CCDC tension. There is no attacking here: every
// action is a fix a sysadmin would run on their own box. The engine models four things, the way the real
// scoring engine does:
//
//   1. SERVICE UPTIME  — four scored services (HTTP, DNS, SMTP/IMAP, MySQL). They start UP. A careless fix
//      can knock one DOWN; that bleeds uptime points for the rest of the round. This is the trap that sinks
//      most first-time competitors: they "harden" a box and drop a scored service.
//   2. REMEDIATION     — a backlog of findings (default creds, a rogue admin, a backdoor, an open firewall).
//      Each finding offers a few candidate actions; one or two are right, the rest are traps or no-ops. A
//      correct fix earns its points AND closes the hole so the red team can't use it.
//   3. INJECTS         — management business tasks (inventory memo, least-privilege user, vendor request,
//      incident report, change request). Each is a small decision with a defensible best answer.
//   4. RED TEAM        — when you end the round, a scripted red team hits every finding you left open. Each
//      unremediated finding that is "exploitable" becomes a COMPROMISE and subtracts points; a couple also
//      drop a service if they land.
//
//   Score = service uptime  +  injects  −  compromises   (the real CCDC shape).
//
// The engine is deterministic and pure: feed it a scenario + a list of actions and it returns the same state
// and score every time (a unit test plays a perfect round and an all-wrong round). All content lives in the
// scenario object (src/data/ccdcScenario.js); this file only applies moves, runs the red team and tallies.

export const SERVICE_STATE = { UP: 'up', DOWN: 'down' };

// ---- new game -------------------------------------------------------------

export function newGame(scenario) {
  const services = {};
  for (const s of scenario.services) services[s.id] = { ...s, state: SERVICE_STATE.UP, note: '' };
  const findings = {};
  for (const f of scenario.findings) findings[f.id] = { status: 'open', chosen: null };
  const injects = {};
  for (const i of scenario.injects) injects[i.id] = { answer: null };
  return {
    scenario,
    services,
    findings, // id -> { status: 'open'|'fixed'|'misfixed', chosen: actionId }
    injects, // id -> { answer: choiceId }
    log: [], // player-visible action log, newest last
    redTeamRun: false,
    compromises: [], // filled by runRedTeam()
    finished: false,
  };
}

function push(state, kind, text) {
  state.log.push({ kind, text, n: state.log.length + 1 });
}

// ---- remediation actions --------------------------------------------------

/**
 * Apply one candidate action to one finding.
 * Returns { ok, outcome: 'fixed'|'misfixed'|'noop', message, droppedService? }.
 * Mutates state (finding status, service state, log).
 */
export function applyAction(state, findingId, actionId) {
  if (state.redTeamRun) return { ok: false, outcome: 'noop', message: 'The round is over — the red team has already run.' };
  const finding = state.scenario.findings.find((f) => f.id === findingId);
  if (!finding) return { ok: false, outcome: 'noop', message: 'No such finding.' };
  const action = finding.actions.find((a) => a.id === actionId);
  if (!action) return { ok: false, outcome: 'noop', message: 'No such action.' };
  const rec = state.findings[findingId];

  // Re-applying an action to an already-fixed finding does nothing (idempotent).
  if (rec.status === 'fixed' && action.fixes) {
    return { ok: false, outcome: 'noop', message: 'Already remediated.' };
  }

  rec.chosen = actionId;

  // A trap that drops a scored service (e.g. block-all firewall, bind MySQL to localhost while the
  // monitor checks it remotely, rotate the DB password without updating the app config).
  let droppedService = null;
  if (action.dropsService && state.services[action.dropsService]?.state === SERVICE_STATE.UP) {
    state.services[action.dropsService].state = SERVICE_STATE.DOWN;
    state.services[action.dropsService].note = action.dropNote || 'Knocked offline by a fix.';
    droppedService = action.dropsService;
  }
  // Some recovery actions bring a service back (e.g. you dropped it, then corrected the config).
  if (action.restoresService && state.services[action.restoresService]) {
    state.services[action.restoresService].state = SERVICE_STATE.UP;
    state.services[action.restoresService].note = '';
  }

  if (action.fixes) {
    rec.status = 'fixed';
    push(state, 'fix', `${finding.host}: ${action.label}`);
    return { ok: true, outcome: 'fixed', message: action.result, droppedService };
  }
  if (action.misfix) {
    rec.status = 'misfixed';
    push(state, 'misfix', `${finding.host}: ${action.label}`);
    return { ok: true, outcome: 'misfixed', message: action.result, droppedService };
  }
  // A no-op / cosmetic action: logged, but the hole stays open.
  push(state, 'noop', `${finding.host}: ${action.label}`);
  return { ok: true, outcome: 'noop', message: action.result, droppedService };
}

// ---- injects --------------------------------------------------------------

export function answerInject(state, injectId, choiceId) {
  if (state.redTeamRun) return { ok: false, message: 'The round is over.' };
  const inject = state.scenario.injects.find((i) => i.id === injectId);
  if (!inject) return { ok: false, message: 'No such inject.' };
  const choice = inject.choices.find((c) => c.id === choiceId);
  if (!choice) return { ok: false, message: 'No such choice.' };
  state.injects[injectId].answer = choiceId;
  push(state, choice.correct ? 'inject-ok' : 'inject-miss', `Inject "${inject.title}": ${choice.label}`);
  return { ok: true, correct: !!choice.correct, message: choice.feedback };
}

// ---- red team -------------------------------------------------------------

/**
 * End the round: the red team hits every finding left open (status !== 'fixed'). Each open finding that is
 * `exploitable` becomes a compromise; findings that also `dropsOnCompromise` a service take it down for the
 * tally. Deterministic — no randomness — so the debrief can say exactly why each point was lost.
 */
export function runRedTeam(state) {
  if (state.redTeamRun) return state.compromises;
  state.compromises = [];
  for (const f of state.scenario.findings) {
    const rec = state.findings[f.id];
    const remediated = rec.status === 'fixed';
    if (!remediated && f.exploitable) {
      state.compromises.push({
        findingId: f.id,
        host: f.host,
        title: f.title,
        impact: f.compromiseImpact,
        penalty: f.compromisePenalty || 0,
        persistence: f.persistence || null,
      });
      if (f.dropsOnCompromise && state.services[f.dropsOnCompromise]?.state === SERVICE_STATE.UP) {
        state.services[f.dropsOnCompromise].state = SERVICE_STATE.DOWN;
        state.services[f.dropsOnCompromise].note = `Taken down by the red team via ${f.host}.`;
      }
    }
  }
  state.redTeamRun = true;
  state.finished = true;
  return state.compromises;
}

// ---- scoring --------------------------------------------------------------

// Uptime is scored as a share of the round: a service that is UP at the tally keeps all its points. (The game
// is turn-based, not wall-clock, so "uptime" here is "is it still serving at the end" — the thing the scoring
// engine would be polling.) This keeps the lesson sharp: drop a service and you lose a big, visible block.
export function score(state) {
  const sc = state.scenario;
  const services = Object.values(state.services);
  const up = services.filter((s) => s.state === SERVICE_STATE.UP);
  const servicePts = up.reduce((n, s) => n + (s.points || 0), 0);
  const serviceMax = sc.services.reduce((n, s) => n + (s.points || 0), 0);

  const injectResults = sc.injects.map((i) => {
    const ans = state.injects[i.id].answer;
    const choice = i.choices.find((c) => c.id === ans);
    const pts = choice?.correct ? i.points : choice ? Math.round((i.points || 0) * (choice.partial || 0)) : 0;
    return { id: i.id, title: i.title, answered: !!choice, correct: !!choice?.correct, points: pts, max: i.points };
  });
  const injectPts = injectResults.reduce((n, r) => n + r.points, 0);
  const injectMax = sc.injects.reduce((n, i) => n + (i.points || 0), 0);

  const compromisePenalty = state.compromises.reduce((n, c) => n + c.penalty, 0);

  const total = servicePts + injectPts - compromisePenalty;
  const max = serviceMax + injectMax;
  const pct = max ? Math.max(0, Math.round((total / max) * 100)) : 0;

  return {
    servicePts,
    serviceMax,
    injectPts,
    injectMax,
    compromisePenalty,
    compromiseCount: state.compromises.length,
    total,
    max,
    pct,
    letter: letterFor(pct),
    services: services.map((s) => ({ id: s.id, name: s.name, state: s.state, points: s.points, note: s.note })),
    injects: injectResults,
    compromises: state.compromises,
  };
}

function letterFor(pct) {
  if (pct >= 90) return 'A';
  if (pct >= 75) return 'B';
  if (pct >= 60) return 'C';
  if (pct >= 45) return 'D';
  return 'F';
}

// ---- progress helpers (for the UI header) ---------------------------------

export function progress(state) {
  const findings = state.scenario.findings;
  const fixed = findings.filter((f) => state.findings[f.id].status === 'fixed').length;
  const touched = findings.filter((f) => state.findings[f.id].status !== 'open').length;
  const injectsAnswered = state.scenario.injects.filter((i) => state.injects[i.id].answer != null).length;
  const servicesUp = Object.values(state.services).filter((s) => s.state === SERVICE_STATE.UP).length;
  return {
    fixed,
    findingsTotal: findings.length,
    touched,
    injectsAnswered,
    injectsTotal: state.scenario.injects.length,
    servicesUp,
    servicesTotal: state.scenario.services.length,
  };
}

// ---- best-grade persistence (same shape as engage.js / pentest.js) --------

const KEY = 'cyberoffice.ccdc.best';
function store() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
export function loadBests(s = store()) {
  if (!s) return {};
  try {
    return JSON.parse(s.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}
export function recordBest(scenarioId, grade, s = store()) {
  if (!s) return;
  const all = loadBests(s);
  const prev = all[scenarioId];
  if (!prev || grade.pct > prev.pct) {
    all[scenarioId] = { letter: grade.letter, pct: grade.pct };
    try {
      s.setItem(KEY, JSON.stringify(all));
    } catch {
      /* ignore quota/availability errors */
    }
  }
}
