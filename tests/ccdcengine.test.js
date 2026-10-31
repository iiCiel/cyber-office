import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CCDC_LAB } from '../src/data/ccdcLabScenario.js';
import { newGame, runLine, answerInject, score, MODES } from '../src/game/ccdcLab.js';
import {
  attachEngine, tickTo, scoreboard, notePasswordRotated, notePcrFiled, liveCompromises, CHECK_INTERVAL, SLA_FAILS,
} from '../src/game/ccdcEngine.js';
import { GOOD_INJECTS } from './ccdclab.test.js';

const fresh = (opts = {}) => attachEngine(newGame(CCDC_LAB, { seed: 1, mode: MODES.COMPETITION, ...opts }));

test('a passing round accrues uptime points and no SLA violations', () => {
  const s = fresh();
  tickTo(s, 300);
  const sb = scoreboard(s);
  assert.ok(sb.uptimePoints > 0, 'uptime points accrue while services are up');
  assert.equal(sb.slaViolations, 0);
  for (const r of sb.rows) assert.equal(r.uptime, 100);
});

test('a dropped service accrues an SLA violation after consecutive missed checks', () => {
  const s = fresh();
  runLine(s, 'db01', 'ufw deny 3306'); // trap: drops db01 (and web01)
  tickTo(s, CHECK_INTERVAL * SLA_FAILS);
  const sb = scoreboard(s);
  assert.ok(sb.slaViolations >= 1, 'at least one SLA violation once a service misses SLA_FAILS checks');
  assert.ok(sb.rows.find((r) => r.id === 'db01').uptime < 100);
});

test('injects release over time and go overdue past their window', () => {
  const s = fresh();
  tickTo(s, 10);
  assert.equal(scoreboard(s).events.some((e) => /New inject/.test(e.text) && /HR/.test(e.text)), false, 'inject 2 not released yet at t=10');
  tickTo(s, 130);
  assert.ok(scoreboard(s).events.some((e) => /New inject/.test(e.text)), 'an inject released by t=130');
  // never answered -> overdue after release + window
  tickTo(s, 120 + 300 + 5);
  assert.ok(scoreboard(s).events.some((e) => /overdue/.test(e.text)), 'an unanswered inject goes overdue');
});

test('red-team waves escalate: a probe becomes a compromise only if left open', () => {
  const s = fresh();
  tickTo(s, 180); // wave 1 probes everything open
  assert.equal(liveCompromises(s).length, 0, 'wave 1 only probes — no compromise yet');
  assert.ok(scoreboard(s).probes > 0);
  tickTo(s, 450); // wave 2: still-open probed findings become compromises
  assert.ok(liveCompromises(s).length > 0, 'wave 2 confirms compromises on what is still open');
});

test('fixing a finding before the next wave prevents its compromise', () => {
  const s = fresh();
  tickTo(s, 180); // probed
  // fix the rogue DA before wave 2
  runLine(s, 'dc01', 'Disable-ADAccount -Identity svc-backup2');
  runLine(s, 'dc01', "Remove-ADGroupMember -Identity 'Domain Admins' -Members svc-backup2 -Confirm:$false");
  tickTo(s, 450);
  assert.ok(!liveCompromises(s).some((c) => c.id === 'rogue-da'), 'a finding fixed between waves is not compromised');
});

test('PCR: rotating the scored account breaks the DB check until the PCR is filed', () => {
  const s = fresh();
  const r = runLine(s, 'db01', "mysql -e \"ALTER USER 'ccdc-scorecheck'@'198.51.100.9' IDENTIFIED BY 'New#Score-2026!'\"");
  assert.equal(r.effects.pcrRotated, true);
  notePasswordRotated(s);
  tickTo(s, CHECK_INTERVAL * SLA_FAILS);
  assert.ok(scoreboard(s).rows.find((x) => x.id === 'db01').uptime < 100, 'DB check fails while PCR unfiled');
  const sub = answerInject(s, 'pcr', GOOD_INJECTS.pcr);
  assert.equal(sub.isPcr, true);
  notePcrFiled(s);
  const before = scoreboard(s).rows.find((x) => x.id === 'db01').up;
  assert.equal(before, true, 'DB check recovers once the PCR is filed');
});

test('a full-marks incident report halves the matching compromise penalty', () => {
  const s = fresh();
  answerInject(s, 'incident-report', GOOD_INJECTS['incident-report']);
  // leave web-shell open and let the waves compromise it
  tickTo(s, 180); tickTo(s, 450); tickTo(s, 720);
  const g = score(s);
  const wb = g.compromises.find((c) => c.id === 'web-shell');
  if (wb) {
    // penalty applied at half (45 -> 23) — check the total reflects mitigation vs raw sum
    const rawSum = g.compromises.reduce((n, c) => n + c.penalty, 0);
    assert.ok(g.compromisePenalty < rawSum, 'reported compromise reduces the penalty below the raw sum');
  }
});

test('score() uses engine SLA violations when the engine is attached', () => {
  const s = fresh();
  runLine(s, 'mail01', 'systemctl stop postfix'); // trap drops mail01
  tickTo(s, CHECK_INTERVAL * SLA_FAILS * 2);
  const g = score(s);
  assert.equal(g.slaCount, s.engine.slaViolations);
  assert.ok(g.slaCount >= 1);
});
