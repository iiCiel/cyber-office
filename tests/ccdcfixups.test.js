// Regression tests for the supervisor's PR #4 review: inject deadlines, engine-driven scoring, PCR order,
// file-edit edge cases, the pg_hba.conf check, and status commands that reflect the box's live state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CCDC_LAB } from '../src/data/ccdcLabScenario.js';
import { CCDC_LAB_2, HBA_PATH, verifyHba } from '../src/data/ccdcLabScenario2.js';
import { newGame, runLine, answerInject, score, expire, MODES } from '../src/game/ccdcLab.js';
import { attachEngine, tickTo, scoreboard, notePasswordRotated, notePcrFiled, CHECK_INTERVAL, SLA_FAILS } from '../src/game/ccdcEngine.js';
import { applyEdit, isEdit } from '../src/game/ccdcEdit.js';
import { GOOD_INJECTS } from './ccdclab.test.js';

const live1 = () => attachEngine(newGame(CCDC_LAB, { seed: 1, mode: MODES.COMPETITION }));
const hp = (o = {}) => newGame(CCDC_LAB_2, { seed: 1, ...o });
const out = (r) => r.lines.map((l) => l.text).join('\n');

// ---- 1. late injects score zero ---------------------------------------------------------------------------
test('late inject: submitted after its deadline scores 0 even with a full-marks answer', () => {
  const s = live1();
  const t = s.engine.injectTimers['new-user'];
  tickTo(s, t.dueAt + 5);
  assert.equal(t.overdue, true);
  const r = answerInject(s, 'new-user', GOOD_INJECTS['new-user']);
  assert.equal(r.ok, true);
  assert.equal(r.late, true);
  const row = score(s).injectResults.find((x) => x.id === 'new-user');
  assert.equal(row.late, true);
  assert.equal(row.points, 0);
  assert.ok(r.grade.earned > 0, 'the rubric result is still kept for feedback');
});

test('on-time inject: same answer before the deadline earns its points', () => {
  const s = live1();
  tickTo(s, 130);
  answerInject(s, 'new-user', GOOD_INJECTS['new-user']);
  const row = score(s).injectResults.find((x) => x.id === 'new-user');
  assert.equal(row.late, false);
  assert.ok(row.points > 0);
});

test('a LATE incident report does not halve a compromise penalty', () => {
  const s = live1();
  tickTo(s, 730); // incident-report due at 720
  answerInject(s, 'incident-report', GOOD_INJECTS['incident-report']);
  expire(s);
  const wb = score(s).compromises.find((c) => c.id === 'web-shell');
  assert.ok(wb);
  assert.equal(wb.halved, false);
  assert.equal(wb.charged, wb.penalty);
});

// ---- 2. engine drives compromises + service points --------------------------------------------------------
test('engine attached: compromises are what the waves confirmed, not every open finding', () => {
  const s = live1();
  tickTo(s, 180); // wave 1 probes everything open
  // fix the rogue DA after the probe, before the next wave
  runLine(s, 'dc01', 'Disable-ADAccount -Identity svc-backup2');
  runLine(s, 'dc01', "Remove-ADGroupMember -Identity 'Domain Admins' -Members svc-backup2 -Confirm:$false");
  expire(s);
  const ids = score(s).compromises.map((c) => c.id);
  assert.ok(!ids.includes('rogue-da'), 'fixed between waves → not compromised');
  assert.ok(ids.length > 0, 'still-open probed findings are compromised');
});

test('engine attached: service points come from uptime (passed checks / total checks)', () => {
  const s = live1();
  tickTo(s, CHECK_INTERVAL * 4); // 4 good checks
  runLine(s, 'mail01', 'systemctl stop postfix'); // trap: mail01 down
  tickTo(s, CHECK_INTERVAL * 8); // 4 failed checks for mail01
  runLine(s, 'mail01', 'systemctl start postfix');
  const c = s.engine.checks.mail01;
  const g = score(s);
  const mail = g.serviceBreakdown.find((x) => x.id === 'mail01');
  assert.equal(mail.earned, Math.round((mail.max * c.ok) / (c.ok + c.fail)));
  assert.ok(mail.earned < mail.max && mail.earned > 0, 'partial uptime → partial points');
  assert.equal(g.uptimeScored, true);
});

test('ending the round early fast-forwards to the buzzer (no free perfect round)', () => {
  const s = live1();
  tickTo(s, 5);
  expire(s);
  assert.equal(s.engine.clock, s.timeLimitSec);
  assert.ok(score(s).compromises.length > 0, 'the waves still ran against the untouched boxes');
});

// ---- 3. PCR filed first --------------------------------------------------------------------------------
test('PCR filed BEFORE rotating: the DB check never breaks', () => {
  const s = live1();
  answerInject(s, 'pcr', GOOD_INJECTS.pcr);
  notePcrFiled(s);
  const r = runLine(s, 'db01', "mysql -e \"ALTER USER 'ccdc-scorecheck'@'198.51.100.9' IDENTIFIED BY 'New#Score-2026!'\"");
  assert.equal(r.effects.pcrRotated, true);
  notePasswordRotated(s);
  tickTo(s, CHECK_INTERVAL * SLA_FAILS);
  const row = scoreboard(s).rows.find((x) => x.id === 'db01');
  assert.equal(row.up, true);
  assert.equal(row.uptime, 100);
  assert.equal(s.engine.pcr.breaking, false);
});

// ---- 4. file-edit edge cases ------------------------------------------------------------------------------
test('edit: an unmatched quote prints a bash error and never throws', () => {
  const s = hp();
  let r;
  assert.doesNotThrow(() => { r = runLine(s, 'db01', `sed -i 's/trust/scram-sha-256/ ${HBA_PATH}`); });
  assert.match(out(r), /unexpected EOF/);
  assert.equal(isEdit("echo 'oops >> /tmp/x"), true);
  assert.doesNotThrow(() => applyEdit({}, "echo 'oops >> /tmp/x"));
});

test('edit: relative paths resolve against the current directory after cd', () => {
  const s = hp();
  runLine(s, 'db01', 'cd /etc/postgresql/14/main');
  runLine(s, 'db01', "echo '# note' >> pg_hba.conf");
  assert.match(s.devState.db01.fs[HBA_PATH], /# note\n$/);
  assert.equal(s.devState.db01.fs['/etc/postgresql/14/main/pg_hba.conf'], s.devState.db01.fs[HBA_PATH]);
  assert.equal(s.devState.db01.fs['pg_hba.conf'], undefined, 'no stray relative key');
});

test('edit: echo … | tee -a FILE appends; bare tee is refused and leaves the file intact', () => {
  const fs = { '/etc/x.conf': 'a\n' };
  applyEdit(fs, "echo 'b' | tee -a /etc/x.conf");
  assert.equal(fs['/etc/x.conf'], 'a\nb\n');
  const r = applyEdit(fs, 'tee /etc/x.conf');
  assert.equal(r.error, true);
  assert.equal(fs['/etc/x.conf'], 'a\nb\n', 'bare tee did not wipe the file');
});

test('pg_hba: append-only (trust line left in place) does NOT count as fixed', () => {
  const s = hp();
  runLine(s, 'db01', `echo 'host all all 10.20.30.0/24 scram-sha-256' >> ${HBA_PATH}`);
  assert.equal(s.findings['postgres-trust'].steps.hba, undefined);
  assert.match(s.devState.db01.fs[HBA_PATH], /0\.0\.0\.0\/0\s+trust/);
});

test('pg_hba: tee wipe does NOT count as fixed (bare tee refused; empty file is a trap)', () => {
  const s = hp();
  runLine(s, 'db01', `tee ${HBA_PATH}`);
  assert.equal(s.findings['postgres-trust'].steps.hba, undefined);
  const r = runLine(s, 'db01', `: > ${HBA_PATH}`);
  assert.equal(s.findings['postgres-trust'].steps.hba, undefined);
  assert.equal(r.effects.trapId, 'hba-wiped');
  assert.equal(s.services.db.state, 'down');
});

test('pg_hba: removing trust but locking out the scoring engine is a trap that drops the DB', () => {
  const s = hp();
  const r = runLine(s, 'db01', `sed -i 's/host.*all.*all.*0.0.0.0\\/0.*trust/host all all 10.20.30.0\\/24 scram-sha-256/' ${HBA_PATH}`);
  assert.equal(r.effects.trapId, 'hba-no-scoring');
  assert.equal(s.services.db.state, 'down');
  // adding the scorer back verifies the step and restores the service
  runLine(s, 'db01', `echo 'host all hp-scorecheck 198.51.100.9/32 scram-sha-256' | tee -a ${HBA_PATH}`);
  assert.equal(s.findings['postgres-trust'].steps.hba, true);
  assert.equal(s.services.db.state, 'up');
});

// ---- 5. the checklist keeps the scorer reachable ------------------------------------------------------
test('Harbor Point db01 checklist leaves hp-scorecheck allowed from 198.51.100.9', () => {
  const s = hp();
  for (const c of CCDC_LAB_2.devices.find((d) => d.id === 'db01').checklist) runLine(s, 'db01', c);
  const text = s.devState.db01.fs[HBA_PATH];
  assert.match(text, /host\s+all\s+hp-scorecheck\s+198\.51\.100\.9\/32\s+scram-sha-256/);
  assert.doesNotMatch(text, /0\.0\.0\.0\/0\s+trust/);
  assert.equal(verifyHba(s.devState.db01.fs).ok, true);
  assert.equal(s.findings['postgres-trust'].status, 'fixed');
  assert.equal(s.services.db.state, 'up');
});

// ---- 6. status commands reflect live state ----------------------------------------------------------
test('Get-Service Spooler shows Stopped / Disabled after the fix', () => {
  const s = hp();
  assert.match(out(runLine(s, 'dc01', 'Get-Service Spooler')), /Running/);
  runLine(s, 'dc01', 'Stop-Service Spooler -Force');
  runLine(s, 'dc01', 'Set-Service Spooler -StartupType Disabled');
  const o = out(runLine(s, 'dc01', 'Get-Service Spooler'));
  assert.match(o, /Stopped/);
  assert.match(o, /Disabled/);
  assert.doesNotMatch(o, /Running/);
});

test('Get-LocalUser / Get-LocalGroupMember drop svc_update after removal', () => {
  const s = hp();
  assert.match(out(runLine(s, 'ws01', 'Get-LocalUser')), /svc_update/);
  runLine(s, 'ws01', 'Disable-LocalUser -Name svc_update');
  assert.match(out(runLine(s, 'ws01', 'Get-LocalUser svc_update')), /False/);
  runLine(s, 'ws01', 'Remove-LocalGroupMember -Group Administrators -Member svc_update');
  assert.doesNotMatch(out(runLine(s, 'ws01', 'Get-LocalGroupMember Administrators')), /svc_update/);
  runLine(s, 'ws01', 'Remove-LocalUser -Name svc_update');
  assert.doesNotMatch(out(runLine(s, 'ws01', 'Get-LocalUser')), /svc_update/);
});

test('Get-ScheduledTask drops SystemCheck after Unregister-ScheduledTask', () => {
  const s = newGame(CCDC_LAB, { seed: 1 });
  assert.match(out(runLine(s, 'ws01', 'Get-ScheduledTask')), /SystemCheck/);
  runLine(s, 'ws01', 'Unregister-ScheduledTask -TaskName SystemCheck -Confirm:$false');
  const o = out(runLine(s, 'ws01', 'Get-ScheduledTask'));
  assert.doesNotMatch(o, /SystemCheck/);
  assert.match(o, /ScheduledDefrag/, 'legitimate tasks untouched');
});

test('systemctl status reflects a stop (trap) and a start', () => {
  const s = newGame(CCDC_LAB, { seed: 1 });
  assert.match(out(runLine(s, 'mail01', 'systemctl status postfix')), /active \(running\)/);
  runLine(s, 'mail01', 'systemctl stop postfix');
  assert.match(out(runLine(s, 'mail01', 'systemctl status postfix')), /inactive \(dead\)/);
  runLine(s, 'mail01', 'systemctl start postfix');
  assert.match(out(runLine(s, 'mail01', 'systemctl status postfix')), /active \(running\)/);
});

test('ufw status lists the rules the player added', () => {
  const s = newGame(CCDC_LAB, { seed: 1 });
  assert.match(out(runLine(s, 'db01', 'ufw status')), /no rules/);
  runLine(s, 'db01', 'ufw allow from 10.10.10.0/24 to any port 3306');
  const o = out(runLine(s, 'db01', 'ufw status'));
  assert.match(o, /3306\s+ALLOW\s+10\.10\.10\.0\/24/);
  const s2 = hp();
  runLine(s2, 'db01', 'ufw allow from 198.51.100.9 to any port 5432');
  assert.match(out(runLine(s2, 'db01', 'ufw status')), /5432\s+ALLOW\s+198\.51\.100\.9/);
});
