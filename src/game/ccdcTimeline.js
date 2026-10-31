// CCDC live round: the parts of a real competition that happen OVER TIME, layered on the hands-on engine.
// (Shape and numbers from docs/competition-research.md.)
//
//   - Scoring engine: every `checkIntervalSec` it polls each scored service. A passed check earns that
//     service's share of points; a failed one earns nothing.
//   - SLA: `slaChecks` consecutive failed checks on one service = one SLA violation (a penalty).
//   - Password change requests (PCR): the scoring engine logs in with scored accounts. Rotate one at the
//     terminal without filing a PCR (`user,password` lines) and that service's check fails.
//   - Injects arrive on a schedule with a deadline. Late = no credit, as in real CCDC.
//   - Red team waves: at set times the red team tries the weaknesses still open. A hit costs points now.
//   - Incident reports: a timely, evidence-based report on a hit wins back up to half its penalty.
//   - Team chat: teammates and the white team post updates; the scoreboard ranks you against other teams.
//
// Pure and deterministic (time is passed in), so it is unit tested. Everything is fiction.

import { rng } from './shuffle.js';

export const LIVE_DEFAULTS = { checkIntervalSec: 60, slaChecks: 3, injectWindowSec: 300, irWindowSec: 300, irRecovery: 0.5 };

const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
export const fmtT = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
/** The competition wall clock (the round starts at 9:00 AM). */
export function wallClock(sec, start = 9 * 60) {
  const m = start + Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Attach the live-round state to a fresh game (ccdcLab.newGame calls this when opts.live is set). */
export function initLive(state) {
  const sc = state.scenario;
  const live = { ...LIVE_DEFAULTS, ...(sc.live || {}) };
  state.live = {
    cfg: live,
    t: 0,
    nextCheck: live.checkIntervalSec,
    checks: [], // [{ n, t, results: { svcId: { ok, reason } } }]
    svc: {}, // svcId -> { up, total, streak, sla }
    wavesFired: {},
    chat: [],
    pcr: [], // [{ t, service, lines, accepted:[user], rejected:[line] }]
    incidents: {}, // compromise id -> { text, grade, t }
  };
  for (const id of Object.keys(state.services)) state.live.svc[id] = { up: 0, total: 0, streak: 0, sla: 0 };

  // Scored accounts the scoring engine logs in with. `known` is what the white team has on file.
  state.accounts = {};
  for (const a of sc.scoredAccounts || []) {
    if (!state.services[a.service]) continue;
    state.accounts[a.id] = { ...a, current: a.password, known: a.password };
  }

  // Injects: scheduled release + deadline.
  for (const i of state.injectList) {
    const rec = state.injects