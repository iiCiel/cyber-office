// Scripted Red Team, for replays of a real day (scenario.scriptedRed). The general Red Team (ccdcRed.js) works the
// boxes on its own; a replay instead follows what happened on the day, in waves. The first time a wave reaches an
// exploitable finding you left open it is a PROBE (a foothold you can still catch and write up). If it is STILL
// open at the next wave, the foothold is confirmed and can take services down (finding.compromise.drops).
// Services go down through svc.downBy, which syncServices() honours alongside the box state.

const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

export function attachScripted(state) {
  const eng = state.engine;
  eng.waves = (state.scenario.redWaves || []).map((w) => ({ ...w, fired: false }));
  eng.probes = {};
}

function log(eng, cls, text) { eng.events.push({ at: eng.clock, cls, text }); }

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
        if (svc) (svc.downBy ||= {})[`redteam:${f.id}`] = 'Compromised by the red team.';
      }
    }
  }
}

/** Fire every wave due by `sec`. */
export function scriptedAdvance(state, sec) {
  const eng = state.engine;
  for (const w of eng.waves || []) {
    if (w.fired || sec < w.at) continue;
    w.fired = true;
    runWave(state, w);
  }
}

/** The buzzer: one last wave, then every confirmed compromise you never closed. */
export function scriptedFinal(state) {
  const eng = state.engine;
  if (!eng) return [];
  if (!eng.finalFired) {
    eng.finalFired = true;
    runWave(state, { n: 'final', label: 'final sweep at the buzzer' });
  }
  return state.findingList
    .filter((f) => eng.probes?.[f.id] === 'compromised' && state.findings[f.id].status !== 'fixed')
    .map((f) => ({ id: f.id, title: f.title, impact: f.compromise?.impact || 'Compromised.', penalty: f.compromise?.penalty || 40 }));
}
