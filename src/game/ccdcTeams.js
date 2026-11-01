// Simulated OTHER teams for the CCDC scoreboard. Pure and deterministic: everything is a function of
// (state.seed, scenario, clock), so teamsAt(state, sec) can be recomputed at any time and always agrees.
//
// Each rival has a hidden skill. At every scored check (CHECK_INTERVAL game-seconds, same cadence as the
// player's engine) each of their services is up or down. Services go down when a red-team wave (scenario.redWaves)
// lands on them (probability falls with skill, recovery is faster with skill) and on the odd random flap. Three
// consecutive misses = an SLA violation (SLA_FAILS, same as the engine). Rivals also finish injects at
// skill-dependent times, and a wave hit can cost a compromise penalty.
//
// The player's row is computed from state.engine with the SAME formula score() uses, so the live number ends at
// the final scorecard: service points = points * passedChecks / totalChecksInRound.

import { CHECK_INTERVAL, SLA_FAILS, liveCompromises, scoreboard } from './ccdcEngine.js';
import { score } from './ccdcLab.js';

function seedNum(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return seed | 0;
  let x = 2166136261;
  for (const ch of String(seed)) x = Math.imul(x ^ ch.charCodeAt(0), 16777619);
  return x | 0;
}

/** Deterministic hash of integers -> [0,1). */
export function hash01(...vals) {
  let x = 2166136261;
  for (const v of vals) {
    x = Math.imul(x ^ (v | 0), 16777619);
    x ^= x >>> 15;
    x = Math.imul(x, 2246822519);
    x ^= x >>> 13;
  }
  x = Math.imul(x ^ (x >>> 16), 3266489917);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

const pad2 = (n) => String(n).padStart(2, '0');

/** Roster for this game: 9-11 rivals plus the player, numbered like the real event. */
export function roster(state) {
  const sd = seedNum(state.seed);
  const others = 9 + Math.floor(hash01(sd, 1) * 3);
  const total = others + 1;
  const youNo = 1 + Math.floor(hash01(sd, 2) * total);
  const teams = [];
  for (let n = 1; n <= total; n++) {
    const you = n === youNo;
    // skill spread 0.18..0.95; rivals are evenly stratified then shuffled by hash so the field has strong and weak teams.
    teams.push({ no: n, team: `Team ${pad2(n)}`, you, skill: you ? null : 0.18 + 0.77 * ((hash01(sd, 10, n) * 0.55) + (((n * 7 + sd) % total + total) % total) / total * 0.45), disc: hash01(sd, 11, n) });
  }
  return teams;
}

function totalChecks(state) {
  const sec = state.timeLimitSec || state.scenario.clockSeconds || 900;
  return Math.max(1, Math.floor(sec / CHECK_INTERVAL));
}

function maxPoints(state) {
  const svc = state.serviceList.reduce((n, s) => n + (s.points || 0), 0);
  const inj = state.injectList.reduce((n, i) => n + (i.points || 0), 0);
  return svc + inj;
}

// Simulate one rival up to clock `sec` (inclusive of checks at <= sec).
function simTeam(state, t, sec) {
  const sd = seedNum(state.seed);
  const sc = state.scenario;
  const svcs = state.serviceList;
  const nChecks = Math.floor(sec / CHECK_INTERVAL);
  const per = totalChecks(state);
  const waves = sc.redWaves || [];
  const slaEach = sc.slaPenalty || 0;

  // Outage intervals [from, to) per service id.
  const outages = {};
  for (const s of svcs) outages[s.id] = [];
  const compromises = []; // { at, penalty }
  waves.forEach((w, wi) => {
    const p = 0.1 + 0.8 * (1 - t.skill) * (1 - t.skill * 0.3);
    if (hash01(sd, 20, t.no, wi) >= p) return;
    const n = 1 + (hash01(sd, 21, t.no, wi) > 0.6 ? 1 : 0);
    const recover = 45 + (1 - t.skill) * 420 * (0.4 + hash01(sd, 22, t.no, wi));
    for (let k = 0; k < n && svcs.length; k++) {
      const s = svcs[Math.floor(hash01(sd, 23, t.no, wi, k) * svcs.length)];
      outages[s.id].push([w.at, w.at + recover]);
    }
    if (hash01(sd, 24, t.no, wi) < 0.6) compromises.push({ at: w.at, penalty: 15 + Math.round(25 * hash01(sd, 25, t.no, wi)) });
  });

  const status = {};
  const okCount = {};
  const consec = {};
  let sla = 0;
  let up = 0, all = 0;
  for (const s of svcs) { okCount[s.id] = 0; consec[s.id] = 0; status[s.id] = 'up'; }
  for (let k = 1; k <= nChecks; k++) {
    const at = k * CHECK_INTERVAL;
    for (const s of svcs) {
      let down = outages[s.id].some(([a, b]) => at >= a && at < b);
      if (!down && hash01(sd, 30, t.no, k, s.id.length * 31 + s.id.charCodeAt(0)) < 0.025 * (1.2 - t.skill)) down = true;
      all += 1;
      if (down) {
        consec[s.id] += 1;
        if (consec[s.id] === SLA_FAILS) { sla += 1; consec[s.id] = 0; }
      } else { consec[s.id] = 0; okCount[s.id] += 1; up += 1; }
      if (k === nChecks) status[s.id] = down ? 'down' : 'up';
    }
  }
  const svcPts = (upto) => svcs.reduce((n, s) => n + (s.points || 0) * upto[s.id] / per, 0);
  // Previous-check snapshot for delta.
  const prevOk = { ...okCount };
  if (nChecks > 0) for (const s of svcs) if (status[s.id] === 'up') prevOk[s.id] -= 1;
  // Injects: finished at releaseAt + a skill-dependent delay; late = zero.
  let injPts = 0, injDone = 0, injPrev = 0;
  state.injectList.forEach((inj, ii) => {
    const rel = state.engine?.injectTimers?.[inj.id]?.releaseAt ?? inj.releaseAt ?? 0;
    const win = inj.window || sc.injectWindow || 300;
    if (hash01(sd, 40, t.no, ii) > 0.35 + 0.62 * t.skill * (0.6 + 0.4 * t.disc)) return; // skipped
    const delay = win * (0.25 + 1.0 * (1 - t.skill) * hash01(sd, 41, t.no, ii) + 0.35 * hash01(sd, 42, t.no, ii));
    const at = rel + delay;
    if (sec < at) return;
    injDone += 1;
    const pts = delay > win ? 0 : Math.round((inj.points || 0) * (0.4 + 0.6 * Math.min(1, t.skill + 0.25 * hash01(sd, 43, t.no, ii))));
    injPts += pts;
    if (sec - CHECK_INTERVAL >= at) injPrev += pts;
  });
  const compPen = compromises.filter((c) => c.at <= sec).reduce((n, c) => n + c.penalty, 0);
  const compPenPrev = compromises.filter((c) => c.at <= sec - CHECK_INTERVAL).reduce((n, c) => n + c.penalty, 0);
  const scoreNow = svcPts(okCount) + injPts - sla * slaEach - compPen;
  // Delta = what the last check (plus anything that landed in its window) changed.
  const scorePrev = svcPts(prevOk) + injPrev - sla * slaEach - compPenPrev;
  return {
    score: Math.round(scoreNow), delta: Math.round(scoreNow - scorePrev), status,
    uptimePct: all ? Math.round((up / all) * 100) : 100, sla, injects: injDone,
  };
}

/** The player's live score from the engine, consistent with ccdcLab.score() at the end. */
export function liveTeamScore(state) {
  if (state.redTeamRun) return score(state).raw;
  const eng = state.engine;
  const per = totalChecks(state);
  let svc = 0;
  for (const s of state.serviceList) {
    const c = eng?.checks?.[s.id];
    svc += c ? (s.points || 0) * c.ok / per : 0;
  }
  if (!eng) svc = state.serviceList.reduce((n, s) => n + (state.services[s.id]?.state === 'up' ? s.points || 0 : 0), 0);
  let inj = 0;
  for (const i of state.injectList) {
    const rec = state.injects[i.id];
    if (rec?.done && !rec.late) inj += rec.grade?.pts || 0;
  }
  const sla = (eng ? eng.slaViolations : 0) * (state.scenario.slaPenalty || 0);
  const comp = liveCompromises(state).reduce((n, c) => n + (c.penalty || 0), 0);
  return Math.round(svc + inj - sla - comp);
}

function playerRow(state, no) {
  const eng = state.engine;
  const board = scoreboard(state);
  const services = {};
  let ok = 0, all = 0;
  for (const s of state.serviceList) {
    const row = board?.rows.find((r) => r.id === s.id);
    services[s.id] = row ? (row.up ? 'up' : 'down') : (state.services[s.id]?.state === 'up' ? 'up' : 'down');
    const c = eng?.checks?.[s.id];
    if (c) { ok += c.ok; all += c.ok + c.fail; }
  }
  const injects = state.injectList.filter((i) => state.injects[i.id]?.done && !state.injects[i.id].late).length;
  return {
    team: `Team ${pad2(no)}`, you: true, score: liveTeamScore(state), services,
    uptimePct: all ? Math.round((ok / all) * 100) : 100, sla: eng ? eng.slaViolations : 0, injects,
  };
}

/** All teams at a game clock (defaults to the player's engine clock). Unsorted, no ranks. */
export function teamsAt(state, clockSec) {
  const sec = Math.max(0, Math.floor(clockSec ?? state.engine?.clock ?? 0));
  const out = [];
  for (const t of roster(state)) {
    if (t.you) {
      out.push({ ...playerRow(state, t.no), no: t.no, delta: 0 });
    } else {
      const r = simTeam(state, t, sec);
      out.push({ team: t.team, no: t.no, you: false, score: r.score, services: r.status, uptimePct: r.uptimePct, sla: r.sla, injects: r.injects, delta: r.delta });
    }
  }
  return out;
}

/** Sorted rows with rank. The player's delta is tracked across calls on state (change since last refresh of a new check). */
export function standings(state, clockSec) {
  const sec = Math.max(0, Math.floor(clockSec ?? state.engine?.clock ?? 0));
  const rows = teamsAt(state, sec);
  const me = rows.find((r) => r.you);
  // Player delta: compare with the last score recorded for an earlier check.
  const memo = (state._teamsMemo ||= { check: -1, score: me.score, prev: me.score });
  const check = Math.floor(sec / CHECK_INTERVAL);
  if (check !== memo.check) { memo.prev = memo.score; memo.check = check; }
  memo.score = me.score;
  me.delta = me.score - memo.prev;
  rows.sort((a, b) => b.score - a.score || a.no - b.no);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

export function rankOf(state, clockSec) {
  const rows = standings(state, clockSec);
  return { rank: rows.find((r) => r.you).rank, of: rows.length };
}

export { maxPoints };
