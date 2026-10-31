// CCDC blue-team engine: a perfect round scores A with every service up and no compromises; the named traps
// drop a scored service; a do-nothing round turns every exploitable finding into a compromise; fixes are
// idempotent. Content and engine are checked together so the answer key cannot drift from the scenario.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CCDC_SCENARIO } from '../src/data/ccdcScenario.js';
import { newGame, applyAction, answerInject, runRedTeam, score, progress } from '../src/game/ccdc.js';

function perfectRound() {
  const g = newGame(CCDC_SCENARIO);
  for (const f of CCDC_SCENARIO.findings) applyAction(g, f.id, f.actions.find((a) => a.fixes).id);
  for (const i of CCDC_SCENARIO.injects) answerInject(g, i.id, i.choices.find((c) => c.correct).id);
  runRedTeam(g);
  return g;
}

test('scenario shape: 4 scored services, findings and injects all well-formed', () => {
  assert.equal(CCDC_SCENARIO.services.length, 4);
  for (const f of CCDC_SCENARIO.findings) {
    const fixes = f.actions.filter((a) => a.fixes);
    assert.equal(fixes.length, 1, `${f.id} must have exactly one fixing action`);
    assert.ok(f.actions.every((a) => a.why && a.label && a.result), `${f.id} actions need label/result/why`);
  }
  for (const i of CCDC_SCENARIO.injects) {
    assert.equal(i.choices.filter((c) => c.correct).length, 1, `${i.id} must have exactly one correct choice`);
    assert.ok(i.points > 0, `${i.id} needs points`);
  }
});

test('a perfect round scores A: every service up, no compromises, full points', () => {
  const g = perfectRound();
  const sc = score(g);
  assert.ok(sc.services.every((s) => s.state === 'up'), 'all services up');
  assert.equal(sc.compromiseCount, 0);
  assert.equal(sc.servicePts, sc.serviceMax);
  assert.equal(sc.injectPts, sc.injectMax);
  assert.equal(sc.letter, 'A');
  assert.equal(sc.pct, 100);
});

test('the block-all firewall trap drops a scored service', () => {
  const g = newGame(CCDC_SCENARIO);
  const upBefore = Object.values(g.services).filter((s) => s.state === 'up').length;
  const r = applyAction(g, 'firewall-anyany', 'deny-all');
  assert.ok(r.droppedService, 'deny-all reports a dropped service');
  assert.ok(Object.values(g.services).filter((s) => s.state === 'up').length < upBefore);
});

test('binding MySQL to localhost drops the DB; the correct fix restores it', () => {
  const g = newGame(CCDC_SCENARIO);
  applyAction(g, 'mysql-exposed', 'localhost');
  assert.equal(g.services.db01.state, 'down');
  applyAction(g, 'mysql-exposed', 'proper');
  assert.equal(g.services.db01.state, 'up');
});

test('rotating the DB password without updating the app drops the website', () => {
  const g = newGame(CCDC_SCENARIO);
  applyAction(g, 'mysql-exposed', 'rotate-only');
  assert.equal(g.services.web01.state, 'down');
});

test('changing the scored account with no PCR, and a full DC reboot, each drop a service', () => {
  const g1 = newGame(CCDC_SCENARIO);
  applyAction(g1, 'shared-local-admin', 'rotate-all-nopcr');
  assert.ok(Object.values(g1.services).some((s) => s.state === 'down'));
  const g2 = newGame(CCDC_SCENARIO);
  applyAction(g2, 'smbv1-dc', 'full-update-reboot');
  assert.equal(g2.services.dc01.state, 'down');
});

test('a do-nothing round turns every exploitable finding into a compromise with a penalty', () => {
  const g = newGame(CCDC_SCENARIO);
  runRedTeam(g);
  const sc = score(g);
  const exploitable = CCDC_SCENARIO.findings.filter((f) => f.exploitable).length;
  assert.equal(sc.compromiseCount, exploitable);
  assert.ok(sc.compromisePenalty > 0);
  assert.notEqual(sc.letter, 'A');
});

test('fixing a finding is idempotent and tracked by progress()', () => {
  const g = newGame(CCDC_SCENARIO);
  applyAction(g, 'rogue-da', 'remove');
  const again = applyAction(g, 'rogue-da', 'remove');
  assert.equal(again.ok, false);
  assert.equal(g.findings['rogue-da'].status, 'fixed');
  assert.equal(progress(g).fixed, 1);
});

test('no action can be applied after the red team has run', () => {
  const g = newGame(CCDC_SCENARIO);
  runRedTeam(g);
  const r = applyAction(g, 'web-admin-default', 'strong-pw');
  assert.equal(r.ok, false);
});
