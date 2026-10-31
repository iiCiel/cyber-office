// CCDC live scoring engine — the clock-driven layer that makes a round feel like the real competition.
//
// Real CCDC is not graded once at the end: a scoring engine polls each service on a fixed interval (~60 s),
// awards uptime points for every passing check, and records an SLA violation after several consecutive misses.
// The red team does not wait for the buzzer either — it probes in waves across the round. And a scored account
// whose password you rotate stops passing checks until you file a Password Change Request (PCR) with the white
// team. This module layers all of that on top of the hands-on ccdcLab state, ticking as the clock advances.
//
// It is intentionally a separate layer: ccdcLab.js stays a pure, end-state scorer (its unit tests are the spec),
// and the engine is attached to a game only when the scene drives a clock. Everything is simulated.

import { SERVICE_STATE } from './ccdcLab.js';

// One scored check every CHECK_INTERVAL game-seconds (CCDC engines poll ~60 s; we use 30 so a short practice
// round still shows the dynamic). SLA_FAILS consecutive misses = one SLA violation (the open-source CCDC engine
// uses 6; we use 3 to fit the shorter clock).
export const CHECK_INTERVAL = 30;
export const SLA_FAILS = 3;

const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

// Team communication: the captain / white team / Orange (user) chatter a real round is full of. Scenarios can
// override with their own `teamFeed`; this is the generic fallback. Pure flavour + a nudge to keep status moving.
const DEFAULT_TEAM_FEED = [
  { at: 60, who: 'Captain', text: 'Status check — post what you’ve each touched so we don’t double-work.' },
  { at: 240, who: 'Orange team (users)', text: 'A user reports the website felt slow a minute ago. Confirm it’s still serving.' },
  { at: 500, who: 'Captain', text: 'Halfway. Whoever owns the firewall, confirm default-deny is on and the scored ports are allowed.' },
  { at: 700, who: 'White team', text: 'Reminder: rotate scored-account passwords only with a submitted change request.' },
];

/** Attach the live engine to a ccdcLab game. Safe to call once; returns the game for chaining. */
export function attachEngine(state) {
  if (state.engine) return state;
  const sc = state.scenario;
  const eng = {
    clock: 0,
    lastCheckAt: 0,
    uptimePoints: 0,
    checks: {}, // svcId -> { ok, fail, consec, violations }
    slaViolations: 0,
    events: [], // { at, cls, text } — the live feed + debrief timeline
    waves: (sc.redWaves || []).map((w) => ({ ...w, fired: false })),
    probes: {}, // findingId -> 'probed' | 'compromised'
    injectTimers: {}, // injectId -> { releaseAt, dueAt, released, overdue }
    pcr: sc.pcr ? { ...sc.pcr, rotated: false, filed: false, breaking: false } : null,
    teamFeed: (sc.teamFeed || DEFAULT_TEAM_FEED).map((m) => ({ ...m, fired: false })),
  };
  for (const s of state.serviceList) eng.checks[s.id] = { ok: 0, fail: 0, consec: 0, violations: 0 };
  for (const i of state.injectList) {
    const t = i.releaseAt || 0;
    eng.injectTimers[i.id] = { releaseAt: t, dueAt: t + (i.window || sc.injectWindow || 300), released: t === 0, overdue: false };
  }
  state.engine = eng;
  return state;
}

const log = (eng, cls, text) => eng.events.push({ at: eng.clock, cls, text });
export const fmtClock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/**
 * A scored account's password was rotated at a terminal. Until a PCR is filed, the engine can no longer log in
 * as that account, so its service check fails — exactly the trap that catches real teams who reset passwords
 * without telling the white team.
 */
export function notePasswordRotated(state) {
  const eng = state.engine;
  if (!eng?.pcr || eng.pcr.rotated) return;
  eng.pcr.rotated = true;
  eng.pcr.breaking = true;
  log(eng, 'warn', `Scored account ${eng.pcr.account} rotated. The scoring engine can no longer authenticate — file the PCR (inject) or ${eng.pcr.service} checks will fail.`);
}

/** The PCR inject was submitted: scoring credentials are updated and the service recovers. */
export function notePcrFiled(state) {
  const eng = state.engine;
  if (!eng?.pcr) return;
  eng.pcr.filed = true;
  if (eng.pcr.breaking) { eng.pcr.breaking = false; log(eng, 'ok', `PCR accepted. The white team updated the scoring credential for ${eng.pcr.account}; ${eng.pcr.service} checks pass again.`); }
}

/** Is a given service currently failing its scored check (down, or broken by an unfiled PCR)? */
function serviceFailing(state, svc) {
  if (svc.state !== SERVICE_STATE.UP) return true;
  const eng = state.engine;
  if (eng?.pcr?.breaking && eng.pcr.service === svc.id) return true;
  return false;
}

/**
 * Advance the engine to `sec` game-seconds elapsed. Runs every scored check that falls in the interval, releases
 * and times out injects, and fires red-team waves. Call it from the scene's per-frame clock tick. Pure w.r.t.
 * wall-clock: given the same state and `sec` it always produces the same result (unit-testable).
 */
export function tickTo(state, sec) {
  const eng = state.engine;
  if (!eng) return;
  if (sec < eng.clock) return;
  eng.clock = sec;

  // Inject release + deadline.
  for (const i of state.injectList) {
    const t = eng.injectTimers[i.id];
    if (!t.released && sec >= t.releaseAt) { t.released = true; log(eng, 'inject', `New inject from ${i.from}: "${i.title}" (due in ${Math.round((t.dueAt - t.releaseAt) / 60)} min).`); }
    if (!t.overdue && !state.injects[i.id].done && sec > t.dueAt) { t.overdue = true; log(eng, 'bad', `Inject overdue: "${i.title}" — the white team scores a late deliverable at zero.`); }
  }

  // Team / white / user chatter.
  for (const m of eng.teamFeed) {
    if (m.fired || sec < m.at) continue;
    m.fired = true;
    log(eng, 'team', `[${m.who}] ${m.text}`);
  }

  // Red-team waves.
  for (const w of eng.waves) {
    if (w.fired || sec < w.at) continue;
    w.fired = true;
    runWave(state, w);
  }

  // Scored checks on the interval.
  while (eng.lastCheckAt + CHECK_INTERVAL <= sec) {
    eng.lastCheckAt += CHECK_INTERVAL;
    runCheck(state);
  }
}

function runCheck(state) {
  const eng = state.engine;
  for (const svc of Object.values(state.services)) {
    const c = eng.checks[svc.id];
    if (serviceFailing(state, svc)) {
      c.fail += 1; c.consec += 1;
      if (c.consec === SLA_FAILS) {
        c.violations += 1; eng.slaViolations += 1; c.consec = 0;
        log(eng, 'bad', `SLA violation: ${svc.name} missed ${SLA_FAILS} checks in a row.`);
      }
    } else {
      c.ok += 1; c.consec = 0;
      eng.uptimePoints += svc.uptimeRate || 1;
    }
  }
}

// Red-team waves escalate: the first time a wave reaches an exploitable finding you left open, it is a PROBE (a
// foothold you can still catch and write up in an incident report). If it is STILL open at the next wave, that
// foothold becomes a confirmed compromise and can take the service down.
function runWave(state, wave) {
  const eng = state.engine;
  log(eng, 'red', `Red team wave ${wave.n || ''}: ${wave.label || 'probing exposed services'}.`);
  for (const f of state.findingList) {
    if (!f.exploitable) continue;
    if (wave.scope && !asList(wave.scope).includes(f.id)) continue;
    if (state.findings[f.id].status === 'fixed') continue;
    const prior = eng.probes[f.id];
    if (!prior) {
      eng.probes[f.id] = 'probed';
      log(eng, 'warn', `Foothold attempt against ${f.host}: ${f.title}. Catch it with an incident report, or fix it before the next wave.`);
    } else if (prior === 'probed') {
      eng.probes[f.id] = 'compromised';
      log(eng, 'bad', `Compromise confirmed on ${f.host}: ${f.title}.`);
      for (const s of asList(f.compromise?.drops)) {
        const svc = state.services[s];
        if (svc) svc.state = SERVICE_STATE.DOWN;
      }
    }
  }
}

/** Findings the red team has confirmed as compromised during the round (used by the end-of-round scorer). */
export function liveCompromises(state) {
  const eng = state.engine;
  if (!eng) return [];
  return state.findingList
    .filter((f) => eng.probes[f.id] === 'compromised' && state.findings[f.id].status !== 'fixed')
    .map((f) => ({ id: f.id, title: f.title, impact: f.compromise?.impact || 'Compromised.', penalty: f.compromise?.penalty || 40 }));
}

/** A compact live scoreboard for the HUD: per-service uptime %, current SLA count, red-team activity. */
export function scoreboard(state) {
  const eng = state.engine;
  if (!eng) return null;
  const rows = Object.values(state.services).map((svc) => {
    const c = eng.checks[svc.id];
    const total = c.ok + c.fail;
    return { id: svc.id, name: svc.name, up: !serviceFailing(state, svc), uptime: total ? Math.round((c.ok / total) * 100) : 100, violations: c.violations };
  });
  return {
    clock: eng.clock,
    rows,
    slaViolations: eng.slaViolations,
    uptimePoints: eng.uptimePoints,
    probes: Object.values(eng.probes).filter((p) => p === 'probed').length,
    compromised: Object.values(eng.probes).filter((p) => p === 'compromised').length,
    injectsOpen: state.injectList.filter((i) => eng.injectTimers[i.id].released && !state.injects[i.id].done && !eng.injectTimers[i.id].overdue).length,
    pcr: eng.pcr,
    events: eng.events,
  };
}
