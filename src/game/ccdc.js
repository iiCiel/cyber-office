// CCDC blue-team engine (pure logic, no DOM, unit-tested).
//
// This is the DEFENCE competition: Collegiate Cyber Defense Competition. You inherit a small business's
// network full of default creds and misconfigurations, and your whole job is to HARDEN it without knocking
// over the services that score points — exactly the real-CCDC tension. There is no attacking here: every
// action is a fix a sysadmin would run on their own box. The engine models five things, the way the real
// scoring engine does:
//
//   1. SERVICE UPTIME  — four scored services (HTTP, DNS, SMTP/IMAP, MySQL). They start UP. A careless fix
//      can knock one or more DOWN. Each service tracks WHY it is down (which finding's trap caused it), and
//      it only comes back once every cause is fixed correctly — so recovery is real and honest: fix the
//      finding that broke it, the service returns; fix something unrelated, it stays down.
//   2. SLA VIOLATIONS  — every time a trap knocks a service over, the scoring engine logs an SLA violation
//      that is NOT refunded when you bring it back. Downtime you recover from still costs something.
//   3. REMEDIATION     — a backlog of findings. Each offers candidate actions; exactly one is right, the rest
//      are traps or no-ops. A correct fix closes the hole so the red team can't use it.
//   4. INJECTS         — management business tasks with a defensible best answer.
//   5. RED TEAM        — when the round ends (you end it, or the clock runs out), a scripted red team hits
//      every finding you left open. Each exploitable one becomes a COMPROMISE and subtracts points.
//
//   Score = service uptime  +  injects  −  SLA violations  −  compromises   (the real CCDC shape).
//
// Two modes:
//   guided      — option feedback after every pick, and you may correct a wrong pick (learn the playbook).
//   competition — every finding and inject is LOCKED after one pick, no feedback until the debrief, and the
//                 scene runs a real countdown; expire() ends the round and runs the red team at the buzzer.
//
// Option order is shuffled per game with a seed (see shuffle.js) so the right answer is never "always the top
// button", but stays stable within a round. Deterministic for a given seed.

import { rng, shuffled, freshSeed } from './shuffle.js';

export const SERVICE_STATE = { UP: 'up', DOWN: 'down' };
export const MODES = { GUIDED: 'guided', COMPETITION: 'competition' };

const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

// ---- new game -------------------------------------------------------------

export function newGame(scenario, opts = {}) {
  const seed = opts.seed ?? freshSeed();
  const mode = opts.mode === MODES.COMPETITION ? MODES.COMPETITION : MODES.GUIDED;
  const random = rng(seed);
  const services = {};
  for (const s of scenario.services) services[s.id] = { ...s, state: SERVICE_STATE.UP, note: '', downBy: {}, drops: 0 };
  const findings = {};
  const order = { findings: {}, injects: {} };
  for (const f of scenario.findings) {
    findings[f.id] = { status: 'open', chosen: null, picks: 0 };
    order.findings[f.id] = shuffled(f.actions.map((a) => a.id), random);
  }
  const injects = {};
  for (const i of scenario.injects) {
    injects[i.id] = { answer: null };
    order.injects[i.id] = shuffled(i.choices.map((c) => c.id), random);
  }
  return {
    scenario,
    seed,
    mode,
    timeLimitSec: mode === MODES.COMPETITION ? scenario.clockSeconds || 0 : 0,
    order, // per-game shuffled option ids: { findings: {id: [actionId]}, injects: {id: [choiceId]} }
    services,
    findings, // id -> { status: 'open'|'fixed'|'misfixed', chosen: actionId, picks }
    injects, // id -> { answer: choiceId }
    log: [], // player-visible action log, newest last
    redTeamRun: false,
    timedOut: false,
    compromises: [], // filled by runRedTeam()
    finished: false,
  };
}

/** The finding's actions in this game's shuffled display order. */
export function actionsFor(state, finding) {
  const ids = state.order?.findings?.[finding.id];
  return ids ? ids.map((id) => finding.actions.find((a) => a.id === id)) : finding.actions;
}

/** The inject's choices in this game's shuffled display order. */
export function choicesFor(state, inject) {
  const ids = state.order?.injects?.[inject.id];
  return ids ? ids.map((id) => inject.choices.find((c) => c.id === id)) : inject.choices;
}

function push(state, kind, text) {
  state.log.push({ kind, text, n: state.log.length + 1 });
}

function refreshService(svc) {
  const causes = Object.values(svc.downBy);
  svc.state = causes.length ? SERVICE_STATE.DOWN : SERVICE_STATE.UP;
  svc.note = [...new Set(causes)].join(' Also: ');
}

/** Is this finding locked against further picks? (competition: after one pick; any mode: once fixed.) */
export function isLocked(state, findingId) {
  const rec = state.findings[findingId];
  if (!rec) return true;
  if (state.redTeamRun) return true;
  if (rec.status === 'fixed') return true;
  return state.mode === MODES.COMPETITION && rec.picks > 0;
}

export function isInjectLocked(state, injectId) {
  const rec = state.injects[injectId];
  if (!rec) return true;
  if (state.redTeamRun) return true;
  return state.mode === MODES.COMPETITION && rec.answer != null;
}

// ---- remediation actions --------------------------------------------------

/**
 * Apply one candidate action to one finding.
 * Returns { ok, outcome: 'fixed'|'misfixed'|'noop', message, droppedServices: [], restoredServices: [] }.
 * Mutates state (finding status, service state, log).
 */
export function applyAction(state, findingId, actionId) {
  const none = { droppedServices: [], restoredServices: [] };
  if (state.redTeamRun) return { ok: false, outcome: 'noop', message: 'The round is over — the red team has already run.', ...none };
  const finding = state.scenario.findings.find((f) => f.id === findingId);
  if (!finding) return { ok: false, outcome: 'noop', message: 'No such finding.', ...none };
  const action = finding.actions.find((a) => a.id === actionId);
  if (!action) return { ok: false, outcome: 'noop', message: 'No such action.', ...none };
  const rec = state.findings[findingId];

  if (rec.status === 'fixed') return { ok: false, outcome: 'noop', message: 'Already remediated.', ...none };
  if (isLocked(state, findingId)) return { ok: false, outcome: 'noop', message: 'Locked — in competition mode every call is final.', ...none };

  rec.chosen = actionId;
  rec.picks += 1;

  // A trap that drops one or more scored services (deny-all firewall, MySQL on localhost, DB password rotated
  // without the app config, scored account changed without a PCR, DC rebooted mid-round). The cause is
  // recorded per finding so only fixing THIS finding correctly brings the service back.
  const droppedServices = [];
  for (const sid of asList(action.dropsService)) {
    const svc = state.services[sid];
    if (!svc) continue;
    const wasUp = svc.state === SERVICE_STATE.UP;
    svc.downBy[findingId] = action.dropNote || 'Knocked offline by a fix.';
    refreshService(svc);
    if (wasUp) {
      svc.drops += 1; // SLA violation: logged by the scoring engine, not refunded on recovery
      droppedServices.push(sid);
    }
  }
  // The correct fix for a finding undoes the outage its own traps caused (restoresService lists every service
  // any of this finding's traps can drop). A service with another open cause stays down.
  const restoredServices = [];
  if (action.fixes) {
    for (const sid of asList(action.restoresService)) {
      const svc = state.services[sid];
      if (!svc || !(findingId in svc.downBy)) continue;
      delete svc.downBy[findingId];
      refreshService(svc);
      if (svc.state === SERVICE_STATE.UP) restoredServices.push(sid);
    }
  }

  if (action.fixes) {
    rec.status = 'fixed';
    push(state, 'fix', `${finding.host}: ${action.label}`);
    return { ok: true, outcome: 'fixed', message: action.result, droppedServices, restoredServices };
  }
  if (action.misfix) {
    rec.status = 'misfixed';
    push(state, 'misfix', `${finding.host}: ${action.label}`);
    return { ok: true, outcome: 'misfixed', message: action.result, droppedServices, restoredServices };
  }
  // A no-op / cosmetic action: logged, but the hole stays open.
  push(state, 'noop', `${finding.host}: ${action.label}`);
  return { ok: true, outcome: 'noop', message: action.result, droppedServices, restoredServices };
}

// ---- injects --------------------------------------------------------------

export function answerInject(state, injectId, choiceId) {
  if (state.redTeamRun) return { ok: false, message: 'The round is over.' };
  const inject = state.scenario.injects.find((i) => i.id === injectId);
  if (!inject) return { ok: false, message: 'No such inject.' };
  const choice = inject.choices.find((c) => c.id === choiceId);
  if (!choice) return { ok: false, message: 'No such choice.' };
  if (isInjectLocked(state, injectId)) return { ok: false, message: 'Locked — this inject was already submitted.' };
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
      for (const sid of asList(f.dropsOnCompromise)) {
        const svc = state.services[sid];
        if (!svc) continue;
        svc.downBy[`redteam:${f.id}`] = `Taken down by the red team via ${f.host}.`;
        refreshService(svc);
      }
    }
  }
  state.redTeamRun = true;
  state.finished = true;
  return state.compromises;
}

/** The competition clock hit zero: the round ends where it stands and the red team runs at the buzzer. */
export function expire(state) {
  if (state.redTeamRun) return state.compromises;
  state.timedOut = true;
  push(state, 'clock', 'Time expired — round ended at the buzzer.');
  return runRedTeam(state);
}

// ---- scoring --------------------------------------------------------------

// Uptime is scored as "is it still serving at the tally" (the thing the scoring engine polls), and every time
// a trap knocked a service over costs a fixed SLA penalty on top, even if you brought it back. That keeps both
// lessons sharp: drop a service and you lose a big block; recover it and you still paid for the outage.
export function score(state) {
  const sc = state.scenario;
  const services = Object.values(state.services);
  const up = services.filter((s) => s.state === SERVICE_STATE.UP);
  const servicePts = up.reduce((n, s) => n + (s.points || 0), 0);
  const serviceMax = sc.services.reduce((n, s) => n + (s.points || 0), 0);

  const slaEach = sc.slaPenalty || 0;
  const slaCount = services.reduce((n, s) => n + (s.drops || 0), 0);
  const slaPenalty = slaCount * slaEach;

  const injectResults = sc.injects.map((i) => {
    const ans = state.injects[i.id].answer;
    const choice = i.choices.find((c) => c.id === ans);
    const pts = choice?.correct ? i.points : choice ? Math.round((i.points || 0) * (choice.partial || 0)) : 0;
    return { id: i.id, title: i.title, answered: !!choice, correct: !!choice?.correct, points: pts, max: i.points };
  });
  const injectPts = injectResults.reduce((n, r) => n + r.points, 0);
  const injectMax = sc.injects.reduce((n, i) => n + (i.points || 0), 0);

  const compromisePenalty = state.compromises.reduce((n, c) => n + c.penalty, 0);

  const total = servicePts + injectPts - slaPenalty - compromisePenalty;
  const max = serviceMax + injectMax;
  const pct = max ? Math.max(0, Math.round((total / max) * 100)) : 0;

  return {
    servicePts,
    serviceMax,
    injectPts,
    injectMax,
    slaCount,
    slaPenalty,
    compromisePenalty,
    compromiseCount: state.compromises.length,
    total,
    max,
    pct,
    letter: letterFor(pct),
    timedOut: !!state.timedOut,
    services: services.map((s) => ({ id: s.id, name: s.name, state: s.state, points: s.points, note: s.note, drops: s.drops || 0 })),
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
  const touched = findings.filter((f) => state.findings[f.id].picks > 0).length;
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
