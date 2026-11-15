// "You vs the real day": for a replay of a real competition (scenario.realDay), line up what the team actually did
// on the day against what the player did in this round. Each row: { label, day, you, verdict } with verdict
// 'better' | 'same' | 'worse' | 'info'. Pure; used by the after-action report.
import { incidentResults } from './incidents.js';

const mmss = (sec) => (sec == null ? '' : `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`);

/** Helpers handed to each scenario row so the data file stays declarative. */
export function dayHelpers(state) {
  const f = (id) => state.findings[id] || {};
  const fixed = (id) => f(id).status === 'fixed';
  const at = (id) => (fixed(id) ? (f(id).fixedAt != null ? ` at ${mmss(f(id).fixedAt)}` : '') : '');
  const trap = (id, t) => !!f(id).triggeredTraps?.[t];
  const breached = (id) => state.engine?.probes?.[id] === 'compromised' || (state.compromises || []).some((c) => c.id === id);
  const uptime = (svc) => { const c = state.engine?.checks?.[svc]; const n = c ? c.ok + c.fail : 0; return n ? Math.round((c.ok / n) * 100) : null; };
  const pcr = (acct) => (state.engine?.pcrs || []).find((p) => p.account === acct) || {};
  const inj = (id) => state.injects[id] || {};
  const reports = () => Object.keys(incidentResults(state)).length;
  return { fixed, at, trap, breached, uptime, pcr, inj, reports, mmss };
}

export function compareRealDay(state) {
  const spec = state.scenario.realDay || [];
  const hp = dayHelpers(state);
  return spec.map((row) => {
    let r;
    try { r = row.you(hp, state); } catch { r = { text: '—', verdict: 'info' }; }
    return { label: row.label, day: row.day, you: r.text, verdict: r.verdict || 'info' };
  });
}
