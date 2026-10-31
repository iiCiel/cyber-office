// Drives the CCDC and CPTC engines headless (no DOM) to prove the scoring, traps and grades behave.
//   node scripts/drive-competitions.mjs
import assert from 'node:assert/strict';
import { CCDC_SCENARIO } from '../src/data/ccdcScenario.js';
import * as ccdc from '../src/game/ccdc.js';
import { CPTC_SCENARIO } from '../src/data/cptcScenario.js';
import * as cptc from '../src/game/cptc.js';

let pass = 0, fail = 0;
const ok = (name, cond, info = '') => { if (cond) { pass++; console.log(`PASS  ${name}`); } else { fail++; console.log(`FAIL  ${name}  ${info}`); } };

// ---------- CCDC ----------
console.log('\n=== CCDC: Cedarline Freight ===');

// 1) A perfect blue-team round: fix every finding with its correct action, answer every inject correctly.
{
  const g = ccdc.newGame(CCDC_SCENARIO);
  for (const f of CCDC_SCENARIO.findings) {
    const right = f.actions.find((a) => a.fixes);
    const r = ccdc.applyAction(g, f.id, right.id);
    ok(`fix ${f.id}`, r.ok && r.outcome === 'fixed', JSON.stringify(r));
  }
  for (const i of CCDC_SCENARIO.injects) {
    const right = i.choices.find((c) => c.correct);
    ccdc.answerInject(g, i.id, right.id);
  }
  ccdc.runRedTeam(g);
  const sc = ccdc.score(g);
  ok('perfect round: all services UP', sc.services.every((s) => s.state === 'up'));
  ok('perfect round: no compromises', sc.compromiseCount === 0, `got ${sc.compromiseCount}`);
  ok('perfect round: full service points', sc.servicePts === sc.serviceMax, `${sc.servicePts}/${sc.serviceMax}`);
  ok('perfect round: full inject points', sc.injectPts === sc.injectMax, `${sc.injectPts}/${sc.injectMax}`);
  ok('perfect round: grade A', sc.letter === 'A', `pct ${sc.pct} letter ${sc.letter}`);
}

// 2) The block-all firewall trap drops a scored service immediately.
{
  const g = ccdc.newGame(CCDC_SCENARIO);
  const before = Object.values(g.services).filter((s) => s.state === 'up').length;
  const r = ccdc.applyAction(g, 'firewall-anyany', 'deny-all');
  ok('deny-all firewall drops a service', r.droppedService && Object.values(g.services).filter((s) => s.state === 'up').length < before, JSON.stringify(r));
}

// 3) The MySQL localhost trap drops the database service.
{
  const g = ccdc.newGame(CCDC_SCENARIO);
  const r = ccdc.applyAction(g, 'mysql-exposed', 'localhost');
  ok('bind MySQL to localhost drops db01', g.services.db01.state === 'down', JSON.stringify(r));
  // ...and the correct fix restores it.
  const fix = ccdc.applyAction(g, 'mysql-exposed', 'proper');
  ok('correct MySQL fix restores db01', g.services.db01.state === 'up', JSON.stringify(fix));
}

// 4) The scored-account-without-PCR trap.
{
  const g = ccdc.newGame(CCDC_SCENARIO);
  ccdc.applyAction(g, 'shared-local-admin', 'rotate-all-nopcr');
  ok('rotate scored account without PCR drops a service', Object.values(g.services).some((s) => s.state === 'down'));
}

// 5) An all-wrong / do-nothing round: every exploitable finding becomes a compromise, grade is poor.
{
  const g = ccdc.newGame(CCDC_SCENARIO);
  ccdc.runRedTeam(g); // touch nothing
  const sc = ccdc.score(g);
  const exploitable = CCDC_SCENARIO.findings.filter((f) => f.exploitable).length;
  ok('do-nothing round: every open finding is a compromise', sc.compromiseCount === exploitable, `${sc.compromiseCount} vs ${exploitable}`);
  ok('do-nothing round: penalty applied', sc.compromisePenalty > 0, `${sc.compromisePenalty}`);
  ok('do-nothing round: grade not A', sc.letter !== 'A', sc.letter);
}

// 6) Idempotence: re-applying the correct fix does not double-anything or throw.
{
  const g = ccdc.newGame(CCDC_SCENARIO);
  ccdc.applyAction(g, 'rogue-da', 'remove');
  const again = ccdc.applyAction(g, 'rogue-da', 'remove');
  ok('re-fixing a fixed finding is a safe no-op', again.ok === false && g.findings['rogue-da'].status === 'fixed');
}

// ---------- CPTC ----------
console.log('\n=== CPTC: Meridian Health ===');

// 1) A perfect report: correct RoE, exact reference risk ratings, correct remediations, best exec summary.
{
  const st = cptc.newReport(CPTC_SCENARIO);
  for (const d of CPTC_SCENARIO.roe) cptc.setRoe(st, d.id, d.choices.find((c) => c.correct).id);
  for (const f of CPTC_SCENARIO.findings) {
    cptc.setRisk(st, f.id, 'likelihood', f.refLikelihood);
    cptc.setRisk(st, f.id, 'impact', f.refImpact);
    cptc.setRemediation(st, f.id, f.remediations.find((r) => r.correct).id);
  }
  cptc.setExec(st, CPTC_SCENARIO.execSummaries.find((e) => e.correct).id);
  const c = cptc.completeness(st);
  ok('perfect report: complete', c.complete, JSON.stringify(c));
  const g = cptc.scoreReport(st);
  ok('perfect report: 100%', g.pct === 100, `${g.total}/${g.max} = ${g.pct}%`);
  ok('perfect report: grade A', g.letter === 'A', g.letter);
  ok('perfect report: every risk exact', g.riskResults.every((r) => r.exact));
  ok('perfect report: findings table risk-ranked', g.table[0].refSev === 'Critical', g.table.map((t) => t.refSev).join(','));
}

// 2) The risk matrix is correct at the corners and middle.
{
  ok('matrix High×High = Critical', cptc.severityFor('High', 'High') === 'Critical');
  ok('matrix Low×Low = Low', cptc.severityFor('Low', 'Low') === 'Low');
  ok('matrix Medium×High = High', cptc.severityFor('Medium', 'High') === 'High');
  ok('matrix High×Low = Medium', cptc.severityFor('High', 'Low') === 'Medium');
}

// 3) An all-wrong report: wrong RoE, inflate everything to High×High, worst remediations, empty summary.
{
  const st = cptc.newReport(CPTC_SCENARIO);
  for (const d of CPTC_SCENARIO.roe) cptc.setRoe(st, d.id, d.choices.find((c) => !c.correct && !c.partial)?.id || d.choices[1].id);
  for (const f of CPTC_SCENARIO.findings) {
    cptc.setRisk(st, f.id, 'likelihood', 'High');
    cptc.setRisk(st, f.id, 'impact', 'High');
    cptc.setRemediation(st, f.id, f.remediations.find((r) => !r.correct && !r.partial)?.id || f.remediations[1].id);
  }
  cptc.setExec(st, CPTC_SCENARIO.execSummaries.find((e) => !e.correct && !e.partial).id);
  const g = cptc.scoreReport(st);
  ok('all-wrong report: low grade', g.pct < 60, `${g.pct}% ${g.letter}`);
  ok('all-wrong report: inflating risk is penalised (not every rating exact)', !g.riskResults.every((r) => r.exact));
}

// 4) Off-by-one risk earns partial credit, not zero (defensible but conservative).
{
  const st = cptc.newReport(CPTC_SCENARIO);
  const f = CPTC_SCENARIO.findings.find((x) => cptc.severityFor(x.refLikelihood, x.refImpact) === 'Critical');
  cptc.setRisk(st, f.id, 'likelihood', 'Medium'); // High×High(Critical) -> Medium×High = High (off by one)
  cptc.setRisk(st, f.id, 'impact', 'High');
  const g = cptc.scoreReport(st);
  const r = g.riskResults.find((x) => x.id === f.id);
  ok('off-by-one risk = partial credit', !r.exact && r.close && r.credit === 0.5, JSON.stringify(r));
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
