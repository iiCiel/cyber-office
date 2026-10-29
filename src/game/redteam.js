// Red Team Drill engine (pure logic, unit-tested — no DOM, no case content of its own).
//
// Educational framing (built for the University of Akron): you walk the SAME kill chain the real
// attacker took in a case — one step at a time, from the attacker's seat — and at each step you must
// name the control that would have BROKEN the chain there. It is a "think like the attacker so you can
// stop the attacker" drill. All the wording comes from the case's own Attacker's Playbook
// (src/cases/playbooks.js), which is already at ATT&CK narrative altitude (no payloads); this engine
// only shuffles and scores. It generates no attack instructions itself.
//
// A drill is derived from caseFile.attackerView by buildDrill(): one round per kill-chain step. Each
// round shows the step (phase, technique, what the attacker did) and three candidate controls; exactly
// one is the control the playbook pairs with THIS step, the other two are real controls from OTHER steps
// in the same case (plausible, but they break a different link). Picking the right chokepoint advances
// the chain; a wrong pick costs a strike. The payoff is the debrief: the whole chain, your picks, and
// the trace each step left for the blue team.

export const MAX_STRIKES = 3;

// Deterministic hash + shuffle so option order is stable for a given case/round (reproducible tests and
// screenshots) but the right answer is not always in the same slot.
function hash(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i++) x = Math.imul(x ^ str.charCodeAt(i), 16777619) >>> 0;
  return x >>> 0;
}
function shuffle(arr, seed) {
  const a = arr.slice();
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) >>> 0);
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Turn a case's attackerView (the Attacker's Playbook) into a playable drill. Pure data reshaping.
export function buildDrill(caseId, attackerView) {
  const steps = attackerView?.steps || [];
  const allStops = steps.map((s) => s.stop);
  const rounds = steps.map((step, i) => {
    // Two distractors: real controls from other steps of the same case.
    const others = allStops.filter((_, j) => j !== i);
    const picked = shuffle(others, hash(`${caseId}:${i}:d`)).slice(0, 2);
    const options = shuffle(
      [{ text: step.stop, correct: true }, ...picked.map((text) => ({ text, correct: false }))],
      hash(`${caseId}:${i}:o`),
    ).map((o, k) => ({ id: `${i}-${k}`, text: o.text, correct: o.correct }));
    return {
      index: i,
      phase: step.phase,
      tid: step.tid,
      title: step.title,
      how: step.how,
      trace: step.trace,
      stop: step.stop,
      options,
    };
  });
  return {
    caseId,
    goal: attackerView?.goal || '',
    chokepoint: attackerView?.chokepoint || '',
    rounds,
    maxStrikes: MAX_STRIKES,
  };
}

export function startDrill(drill) {
  return { caseId: drill.caseId, round: 0, strikes: 0, picks: [], status: drill.rounds.length ? 'playing' : 'won' };
}

// Answer the current round with an option id. Returns { correct, advanced, state }.
export function answer(drill, state, optionId) {
  if (state.status !== 'playing') throw new Error('drill is over');
  const round = drill.rounds[state.round];
  const opt = round.options.find((o) => o.id === optionId);
  if (!opt) throw new Error(`no option ${optionId} in round ${state.round}`);
  const correct = !!opt.correct;
  if (correct) {
    state.picks.push({ round: state.round, tid: round.tid, phase: round.phase });
    state.round++;
    if (state.round >= drill.rounds.length) state.status = 'won';
  } else {
    state.strikes++;
    if (state.strikes >= drill.maxStrikes) state.status = 'caught';
  }
  return { correct, advanced: correct, caught: state.status === 'caught', state };
}

// Grade: cleared every step with no strikes = A. Each strike drops a letter; running out = F.
export function grade(drill, state) {
  const total = drill.rounds.length;
  if (state.status === 'caught') return { letter: 'F', cleared: state.round, total, strikes: state.strikes };
  const letter = state.strikes === 0 ? 'A' : state.strikes === 1 ? 'B' : 'C';
  return { letter, cleared: state.round, total, strikes: state.strikes };
}

// Best result per drill in localStorage (A beats B beats C beats F).
const KEY = 'cyberoffice.redteam.best';
const RANK = { F: 0, C: 1, B: 2, A: 3 };
export function loadBests(store = globalThis.localStorage) {
  try {
    return JSON.parse(store?.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}
export function recordBest(caseId, g, store = globalThis.localStorage) {
  const all = loadBests(store);
  const old = all[caseId];
  if (!old || (RANK[g.letter] ?? -1) > (RANK[old.letter] ?? -1)) all[caseId] = { letter: g.letter };
  try {
    store?.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage blocked: session only */
  }
  return all[caseId];
}
