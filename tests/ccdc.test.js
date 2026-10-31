// CCDC blue-team engine: a perfect round scores A with every service up and no compromises; the named traps
// drop a scored service; a do-nothing round turns every exploitable finding into a compromise; fixes are
// idempotent. Content and engine are checked together so the answer key cannot drift from the scenario.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CCDC_SCENARIO } from '../src/data/ccdcScenario.js';
import { newGame, applyAction, answerInject, runRedTeam, expire, score, progress, actionsFor, choicesFor, isLocked, MODES } from '../src/game/ccdc.js';

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

test('the deny-all firewall trap drops ALL FOUR scored services, matching its own text', () => {
  const g = newGame(CCDC_SCENARIO);
  const r = applyAction(g, 'firewall-anyany', 'deny-all');
  assert.deepEqual([...r.droppedServices].sort(), ['db01', 'dc01', 'mail01', 'web01']);
  assert.ok(Object.values(g.services).every((s) => s.state === 'down'), 'every scored service is down');
  const text = CCDC_SCENARIO.findings.find((f) => f.id === 'firewall-anyany').actions.find((a) => a.id === 'deny-all').result;
  assert.match(text, /All four scored services/);
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
  applyAction(g, 'mysql-exposed', 'proper');
  assert.equal(g.services.web01.state, 'up', 'the correct MySQL fix also restores the website');
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

// ---- fix-up: every trap is recoverable by the correct fix of the same finding ----

const TRAPS = CCDC_SCENARIO.findings.flatMap((f) =>
  f.actions.filter((a) => a.dropsService?.length).map((a) => ({ f, trap: a, fix: f.actions.find((x) => x.fixes) })));

test('data: every finding\'s correct fix restores every service its traps can drop (arrays)', () => {
  assert.ok(TRAPS.length >= 6, `expected the named traps, got ${TRAPS.length}`);
  for (const { f, trap, fix } of TRAPS) {
    assert.ok(Array.isArray(trap.dropsService), `${f.id}/${trap.id} dropsService is an array`);
    assert.ok(Array.isArray(fix.restoresService), `${f.id} fix restoresService is an array`);
    for (const sid of trap.dropsService) assert.ok(fix.restoresService.includes(sid), `${f.id}: fix must restore ${sid} dropped by ${trap.id}`);
  }
});

for (const { f, trap, fix } of TRAPS) {
  test(`trap ${f.id}/${trap.id} drops [${trap.dropsService.join(', ')}] and ${fix.id} restores them`, () => {
    const g = newGame(CCDC_SCENARIO, { seed: 7 });
    const r = applyAction(g, f.id, trap.id);
    for (const sid of trap.dropsService) assert.equal(g.services[sid].state, 'down', `${sid} down after the trap`);
    assert.deepEqual([...r.droppedServices].sort(), [...trap.dropsService].sort());
    const fixed = applyAction(g, f.id, fix.id);
    assert.equal(fixed.outcome, 'fixed');
    for (const sid of trap.dropsService) assert.equal(g.services[sid].state, 'up', `${sid} back up after the correct fix`);
    assert.deepEqual([...fixed.restoredServices].sort(), [...trap.dropsService].sort());
  });
}

test('a service with two open causes only comes back when BOTH findings are fixed correctly', () => {
  const g = newGame(CCDC_SCENARIO, { seed: 3 });
  applyAction(g, 'mysql-exposed', 'localhost'); // db01 + web01 down
  applyAction(g, 'shared-local-admin', 'rotate-all-nopcr'); // db01 down for a second reason
  applyAction(g, 'shared-local-admin', 'rotate-pcr'); // fixing the account alone must NOT undo the localhost bind
  assert.equal(g.services.db01.state, 'down', 'still bound to localhost');
  applyAction(g, 'mysql-exposed', 'proper');
  assert.equal(g.services.db01.state, 'up');
  assert.equal(g.services.web01.state, 'up');
});

test('recovered outages still cost an SLA penalty (not refunded)', () => {
  const g = newGame(CCDC_SCENARIO, { seed: 4 });
  applyAction(g, 'firewall-anyany', 'deny-all');
  applyAction(g, 'firewall-anyany', 'allow-then-deny');
  const sc = score(g); // tallied before the red team, so only the firewall outage is in play
  assert.equal(sc.servicePts, sc.serviceMax, 'all four back up for the tally');
  assert.equal(sc.slaCount, 4);
  assert.equal(sc.slaPenalty, 4 * CCDC_SCENARIO.slaPenalty);
});

// ---- fix-up: seeded per-game shuffle (the correct option is not always first) ----

const correctIndexes = (g) => [
  ...CCDC_SCENARIO.findings.map((f) => actionsFor(g, f).findIndex((a) => a.fixes)),
  ...CCDC_SCENARIO.injects.map((i) => choicesFor(g, i).findIndex((c) => c.correct)),
];

test('shuffle: the correct option index varies across findings/injects in one game', () => {
  const idx = correctIndexes(newGame(CCDC_SCENARIO, { seed: 12345 }));
  assert.ok(new Set(idx).size > 1, `indexes ${idx}`);
  assert.ok(idx.some((i) => i !== 0), 'not always index 0');
});

test('shuffle: across 50 seeds the correct answer is first only about as often as chance', () => {
  let first = 0, total = 0;
  for (let seed = 1; seed <= 50; seed++) for (const i of correctIndexes(newGame(CCDC_SCENARIO, { seed }))) { total++; if (i === 0) first++; }
  assert.ok(first / total < 0.45, `correct-first rate ${first}/${total}`);
});

test('shuffle: same seed gives the same order (stable within a round), different seeds differ', () => {
  const a = newGame(CCDC_SCENARIO, { seed: 99 });
  const b = newGame(CCDC_SCENARIO, { seed: 99 });
  const c = newGame(CCDC_SCENARIO, { seed: 100 });
  assert.deepEqual(a.order, b.order);
  assert.notDeepEqual(a.order, c.order);
  for (const f of CCDC_SCENARIO.findings) assert.equal(actionsFor(a, f).length, f.actions.length, 'no option lost');
});

// ---- fix-up: competition mode locks every call, and the clock ends the round ----

test('competition mode: a finding locks after one pick (even a wrong one); guided lets you correct it', () => {
  const comp = newGame(CCDC_SCENARIO, { mode: MODES.COMPETITION, seed: 5 });
  applyAction(comp, 'mysql-exposed', 'localhost');
  assert.ok(isLocked(comp, 'mysql-exposed'));
  const retry = applyAction(comp, 'mysql-exposed', 'proper');
  assert.equal(retry.ok, false);
  assert.equal(comp.findings['mysql-exposed'].status, 'misfixed');
  assert.equal(comp.services.db01.state, 'down');
  const guided = newGame(CCDC_SCENARIO, { seed: 5 });
  applyAction(guided, 'mysql-exposed', 'localhost');
  assert.equal(applyAction(guided, 'mysql-exposed', 'proper').ok, true);
});

test('competition mode: an inject locks after one submission', () => {
  const g = newGame(CCDC_SCENARIO, { mode: MODES.COMPETITION, seed: 6 });
  const inj = CCDC_SCENARIO.injects[0];
  const wrong = inj.choices.find((c) => !c.correct);
  assert.equal(answerInject(g, inj.id, wrong.id).ok, true);
  assert.equal(answerInject(g, inj.id, inj.choices.find((c) => c.correct).id).ok, false);
  assert.equal(g.injects[inj.id].answer, wrong.id);
});

test('competition mode has a real time limit, and expire() ends the round and runs the red team', () => {
  const g = newGame(CCDC_SCENARIO, { mode: MODES.COMPETITION, seed: 8 });
  assert.equal(g.timeLimitSec, CCDC_SCENARIO.clockSeconds);
  assert.ok(g.timeLimitSec > 0);
  assert.equal(newGame(CCDC_SCENARIO).timeLimitSec, 0, 'guided has no clock');
  applyAction(g, 'rogue-da', 'remove');
  expire(g);
  assert.ok(g.redTeamRun && g.timedOut);
  const sc = score(g);
  assert.equal(sc.timedOut, true);
  assert.equal(sc.compromiseCount, CCDC_SCENARIO.findings.filter((f) => f.exploitable).length - 1);
  assert.equal(applyAction(g, 'web-admin-default', 'strong-pw').ok, false, 'no moves after the buzzer');
});

// ---- fix-up: taught facts ----

test('SMBv1 fix teaches the right reboot fact', () => {
  const fix = CCDC_SCENARIO.findings.find((f) => f.id === 'smbv1-dc').actions.find((a) => a.fixes);
  assert.match(fix.label, /Set-SmbServerConfiguration -EnableSMB1Protocol \$false/);
  assert.match(fix.label, /no reboot/);
  assert.match(fix.label, /feature.*does need a reboot/);
});

test('edge firewall fix does not claim to filter LAN traffic; MySQL restriction lives on db01', () => {
  const fw = CCDC_SCENARIO.findings.find((f) => f.id === 'firewall-anyany').actions.find((a) => a.fixes);
  assert.doesNotMatch(fw.label, /from web01/);
  const db = CCDC_SCENARIO.findings.find((f) => f.id === 'mysql-exposed').actions.find((a) => a.fixes);
  assert.match(db.label, /db01's host firewall/);
});
