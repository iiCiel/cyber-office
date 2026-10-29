// Red Team Drill engine: derives a chokepoint-matching drill from a case's Attacker's Playbook and scores
// a run. It must build a well-formed drill from every real case, always offer exactly one correct control
// per step drawn from that case's own data, and grade/persist results correctly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASES } from '../src/cases/index.js';
import { buildDrill, startDrill, answer, grade, recordBest, loadBests, MAX_STRIKES } from '../src/game/redteam.js';

const realCases = CASES.filter((c) => c.caseFile.kind !== 'lab' && c.caseFile.attackerView);

// A tiny in-memory localStorage stand-in.
function fakeStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

function drillFor(id) {
  const cf = CASES.find((c) => c.caseFile.id === id).caseFile;
  return buildDrill(cf.id, cf.attackerView);
}

test('a drill builds from every real case with an attacker playbook', () => {
  assert.ok(realCases.length >= 12, `expected 12+ real playbooks, got ${realCases.length}`);
  for (const c of realCases) {
    const cf = c.caseFile;
    const d = buildDrill(cf.id, cf.attackerView);
    assert.equal(d.rounds.length, cf.attackerView.steps.length, `${cf.id}: one round per step`);
    assert.ok(d.goal.length > 0 && d.chokepoint.length > 0, `${cf.id}: goal + chokepoint carried over`);
  }
});

test('every round has exactly one correct option, and all options are real controls from the case', () => {
  for (const c of realCases) {
    const cf = c.caseFile;
    const d = buildDrill(cf.id, cf.attackerView);
    const stops = new Set(cf.attackerView.steps.map((s) => s.stop));
    for (const r of d.rounds) {
      const correct = r.options.filter((o) => o.correct);
      assert.equal(correct.length, 1, `${cf.id} round ${r.index}: exactly one correct option`);
      assert.equal(correct[0].text, r.stop, `${cf.id} round ${r.index}: correct option is this step's control`);
      assert.ok(r.options.length >= 2 && r.options.length <= 3, `${cf.id} round ${r.index}: 2-3 options`);
      const ids = new Set(r.options.map((o) => o.id));
      assert.equal(ids.size, r.options.length, 'option ids are unique');
      for (const o of r.options) assert.ok(stops.has(o.text), `${cf.id}: every option is a real control from the case`);
    }
  }
});

test('option order is deterministic for a given case', () => {
  const a = drillFor(realCases[0].caseFile.id);
  const b = drillFor(realCases[0].caseFile.id);
  assert.deepEqual(a.rounds.map((r) => r.options.map((o) => o.id)), b.rounds.map((r) => r.options.map((o) => o.id)));
});

test('picking the right control every time wins with an A', () => {
  const d = drillFor('uber-2022');
  const st = startDrill(d);
  while (st.status === 'playing') {
    const r = d.rounds[st.round];
    const correct = r.options.find((o) => o.correct);
    const res = answer(d, st, correct.id);
    assert.ok(res.correct && res.advanced);
  }
  assert.equal(st.status, 'won');
  const g = grade(d, st);
  assert.equal(g.letter, 'A');
  assert.equal(g.strikes, 0);
  assert.equal(g.cleared, g.total);
});

test('three wrong picks get you caught (F)', () => {
  const d = drillFor('mgm-2023');
  const st = startDrill(d);
  // Keep picking a wrong option on round 0 until caught.
  while (st.status === 'playing') {
    const r = d.rounds[st.round];
    const wrong = r.options.find((o) => !o.correct);
    answer(d, st, wrong.id);
  }
  assert.equal(st.status, 'caught');
  assert.equal(st.strikes, MAX_STRIKES);
  assert.equal(grade(d, st).letter, 'F');
});

test('wrong then right: a strike drops the grade but the chain still advances', () => {
  const d = drillFor('target-2013');
  const st = startDrill(d);
  // One wrong pick on the first round, then all correct.
  const r0 = d.rounds[0];
  answer(d, st, r0.options.find((o) => !o.correct).id);
  assert.equal(st.strikes, 1);
  assert.equal(st.round, 0, 'a wrong pick does not advance');
  while (st.status === 'playing') {
    const r = d.rounds[st.round];
    answer(d, st, r.options.find((o) => o.correct).id);
  }
  assert.equal(st.status, 'won');
  assert.equal(grade(d, st).letter, 'B');
});

test('answering after the drill is over throws', () => {
  const d = drillFor('equifax-2017');
  const st = startDrill(d);
  while (st.status === 'playing') answer(d, st, d.rounds[st.round].options.find((o) => o.correct).id);
  assert.throws(() => answer(d, st, d.rounds[0].options[0].id));
});

test('best score persists and only improves', () => {
  const store = fakeStore();
  recordBest('uber-2022', { letter: 'C' }, store);
  assert.equal(loadBests(store)['uber-2022'].letter, 'C');
  recordBest('uber-2022', { letter: 'A' }, store);
  assert.equal(loadBests(store)['uber-2022'].letter, 'A');
  recordBest('uber-2022', { letter: 'F' }, store);
  assert.equal(loadBests(store)['uber-2022'].letter, 'A', 'a worse result does not overwrite a better one');
});
