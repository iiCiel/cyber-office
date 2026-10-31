// CPTC report engine: the risk matrix is a defensible likelihood×impact lookup; a perfect report scores 100%
// (correct RoE, exact ratings, root-cause remediations, best exec summary); inflating every finding to
// High×High is penalised; off-by-one ratings earn partial credit; the findings table is risk-ranked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CPTC_SCENARIO } from '../src/data/cptcScenario.js';
import {
  newReport, setRoe, setRisk, setRemediation, setExec, completeness, scoreReport,
  severityFor, severityTally, SEVERITIES, LIKELIHOOD, IMPACT,
  roeChoicesFor, remediationsFor, execSummariesFor, execDisplayName, expire, MODES,
} from '../src/game/cptc.js';

function perfectReport() {
  const st = newReport(CPTC_SCENARIO);
  for (const d of CPTC_SCENARIO.roe) setRoe(st, d.id, d.choices.find((c) => c.correct).id);
  for (const f of CPTC_SCENARIO.findings) {
    setRisk(st, f.id, 'likelihood', f.refLikelihood);
    setRisk(st, f.id, 'impact', f.refImpact);
    setRemediation(st, f.id, f.remediations.find((r) => r.correct).id);
  }
  setExec(st, CPTC_SCENARIO.execSummaries.find((e) => e.correct).id);
  return st;
}

test('scenario shape: RoE, findings and exec summaries well-formed', () => {
  for (const d of CPTC_SCENARIO.roe) assert.equal(d.choices.filter((c) => c.correct).length, 1, `${d.id} one correct RoE`);
  for (const f of CPTC_SCENARIO.findings) {
    assert.ok(LIKELIHOOD.includes(f.refLikelihood) && IMPACT.includes(f.refImpact), `${f.id} valid reference dials`);
    assert.equal(f.remediations.filter((r) => r.correct).length, 1, `${f.id} one correct remediation`);
    assert.ok(f.riskRationale, `${f.id} needs a rationale`);
  }
  assert.equal(CPTC_SCENARIO.execSummaries.filter((e) => e.correct).length, 1);
});

test('risk matrix is a correct likelihood×impact lookup', () => {
  assert.equal(severityFor('High', 'High'), 'Critical');
  assert.equal(severityFor('Low', 'Low'), 'Low');
  assert.equal(severityFor('Medium', 'High'), 'High');
  assert.equal(severityFor('High', 'Low'), 'Medium');
  assert.equal(severityFor('Low', 'High'), 'Medium');
  // Every combination yields a valid severity.
  for (const l of LIKELIHOOD) for (const i of IMPACT) assert.ok(SEVERITIES.includes(severityFor(l, i)));
});

test('a perfect report scores 100% / grade A with exact ratings', () => {
  const st = perfectReport();
  assert.ok(completeness(st).complete);
  const g = scoreReport(st);
  assert.equal(g.pct, 100);
  assert.equal(g.letter, 'A');
  assert.ok(g.riskResults.every((r) => r.exact));
  assert.equal(g.max, 100);
});

test('the findings table is risk-ranked, most severe first', () => {
  const g = scoreReport(perfectReport());
  const ranks = g.table.map((t) => SEVERITIES.indexOf(t.refSev));
  for (let i = 1; i < ranks.length; i++) assert.ok(ranks[i] >= ranks[i - 1], 'non-decreasing severity index');
  assert.equal(g.table[0].refSev, 'Critical');
});

test('inflating every finding to High×High is penalised', () => {
  const st = newReport(CPTC_SCENARIO);
  for (const d of CPTC_SCENARIO.roe) setRoe(st, d.id, d.choices.find((c) => c.correct).id);
  for (const f of CPTC_SCENARIO.findings) {
    setRisk(st, f.id, 'likelihood', 'High');
    setRisk(st, f.id, 'impact', 'High');
    setRemediation(st, f.id, f.remediations.find((r) => r.correct).id);
  }
  setExec(st, CPTC_SCENARIO.execSummaries.find((e) => e.correct).id);
  const g = scoreReport(st);
  assert.ok(!g.riskResults.every((r) => r.exact), 'not every inflated rating matches the reference');
  assert.ok(g.pct < 100);
});

test('off-by-one risk earns half credit, a two-rank miss earns none', () => {
  const crit = CPTC_SCENARIO.findings.find((f) => severityFor(f.refLikelihood, f.refImpact) === 'Critical');
  const st = newReport(CPTC_SCENARIO);
  setRisk(st, crit.id, 'likelihood', 'Medium'); // -> High (one rank below Critical)
  setRisk(st, crit.id, 'impact', 'High');
  const r = scoreReport(st).riskResults.find((x) => x.id === crit.id);
  assert.equal(r.credit, 0.5);
  assert.ok(r.close && !r.exact);
});

test('an incomplete report is flagged by completeness()', () => {
  const st = newReport(CPTC_SCENARIO);
  assert.equal(completeness(st).complete, false);
  setRoe(st, CPTC_SCENARIO.roe[0].id, CPTC_SCENARIO.roe[0].choices[0].id);
  assert.equal(completeness(st).roeDone, 1);
});

test('severity tally counts the PLAYER\'s own ratings, not the answer key', () => {
  const st = newReport(CPTC_SCENARIO, { seed: 1 });
  // Nothing rated yet: no severities leak, everything is "Unrated".
  assert.deepEqual(severityTally(st), [{ sev: 'Unrated', count: CPTC_SCENARIO.findings.length }]);
  // Rate everything Low x Low: the tally says 5 Low even though the reference has Criticals.
  for (const f of CPTC_SCENARIO.findings) { setRisk(st, f.id, 'likelihood', 'Low'); setRisk(st, f.id, 'impact', 'Low'); }
  assert.deepEqual(severityTally(st), [{ sev: 'Low', count: CPTC_SCENARIO.findings.length }]);
  // A perfect report's tally matches the reference distribution, highest first.
  const tally = severityTally(perfectReport());
  assert.equal(tally.reduce((n, t) => n + t.count, 0), CPTC_SCENARIO.findings.length);
  assert.equal(tally[0].sev, 'Critical');
});

test('shuffle: the correct RoE / remediation / exec option is not always first', () => {
  const idx = (st) => [
    ...CPTC_SCENARIO.roe.map((d) => roeChoicesFor(st, d).findIndex((c) => c.correct)),
    ...CPTC_SCENARIO.findings.map((f) => remediationsFor(st, f).findIndex((r) => r.correct)),
    execSummariesFor(st).findIndex((e) => e.correct),
  ];
  const one = idx(newReport(CPTC_SCENARIO, { seed: 2024 }));
  assert.ok(new Set(one).size > 1 && one.some((i) => i !== 0), `indexes ${one}`);
  let first = 0, total = 0;
  for (let seed = 1; seed <= 50; seed++) for (const i of idx(newReport(CPTC_SCENARIO, { seed }))) { total++; if (i === 0) first++; }
  assert.ok(first / total < 0.5, `correct-first rate ${first}/${total}`);
  assert.deepEqual(newReport(CPTC_SCENARIO, { seed: 7 }).order, newReport(CPTC_SCENARIO, { seed: 7 }).order, 'stable for a seed');
});

test('exec summaries display as neutral "Summary A/B/C", never their grading label', () => {
  const st = newReport(CPTC_SCENARIO, { seed: 11 });
  const names = execSummariesFor(st).map((e) => execDisplayName(st, e.id));
  assert.deepEqual(names, ['Summary A', 'Summary B', 'Summary C']);
  for (const e of CPTC_SCENARIO.execSummaries) assert.ok(!names.includes(e.label));
});

test('competition mode has a clock; expire() marks the report handed in, unanswered parts score 0', () => {
  const st = newReport(CPTC_SCENARIO, { mode: MODES.COMPETITION, seed: 3 });
  assert.equal(st.timeLimitSec, CPTC_SCENARIO.clockSeconds);
  assert.equal(newReport(CPTC_SCENARIO).timeLimitSec, 0);
  const d = CPTC_SCENARIO.roe[0];
  setRoe(st, d.id, d.choices.find((c) => c.correct).id);
  expire(st);
  assert.equal(st.timedOut, true);
  const g = scoreReport(st);
  assert.ok(g.pct > 0 && g.pct < 20, `only one RoE call scored: ${g.pct}%`);
});
