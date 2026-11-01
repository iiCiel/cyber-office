// The Windows remote-desktop GUIs only ever act by running PowerShell through runLine; these tests check that
// each GUI action's generated command grades the right findings, and the pure row/event mapping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CCDC_LAB } from '../src/data/ccdcLabScenario.js';
import { CCDC_LAB_2 } from '../src/data/ccdcLabScenario2.js';
import { newGame, runLine } from '../src/game/ccdcLab.js';
import { initHostState } from '../src/game/hostState.js';
import {
  cmd, parseArgs, adModel, adRows, adTree, folderPath, serviceRows, taskRows, localUserRows, stoppedAutoServices,
  securityEvents, systemEvents, commandEvents, filterEvents, fmtDate, fmtClock, hasAdGui, isServerOs,
} from '../src/game/winGuiMap.js';

const g1 = () => newGame(CCDC_LAB, { seed: 1 });
const g2 = () => newGame(CCDC_LAB_2, { seed: 1 });
const status = (s, id) => s.findings[id].status;
const dev = (s, id) => s.deviceList.find((d) => d.id === id);

test('commands: quoting and shape', () => {
  assert.equal(cmd.disableUser('svc-backup2'), 'Disable-ADAccount -Identity svc-backup2');
  assert.equal(cmd.removeMember('Domain Admins', 'svc-backup2'), "Remove-ADGroupMember -Identity 'Domain Admins' -Members svc-backup2 -Confirm:$false");
  assert.equal(cmd.deleteTask('SystemCheck'), 'Unregister-ScheduledTask -TaskName SystemCheck -Confirm:$false');
  assert.equal(cmd.stopService('Spooler'), 'Stop-Service Spooler -Force');
  assert.equal(cmd.setStartup('Spooler', 'Disabled'), 'Set-Service Spooler -StartupType Disabled');
  assert.equal(cmd.disableUser("o'brien x"), "Disable-ADAccount -Identity 'o''brien x'");
  const a = parseArgs(cmd.removeMember('Domain Admins', 'svc-backup2'));
  assert.equal(a.named.identity, 'Domain Admins');
  assert.equal(a.named.members, 'svc-backup2');
});

test('Cedarline: ADUC disable + remove from Domain Admins fixes rogue-da', () => {
  const s = g1();
  assert.equal(status(s, 'rogue-da'), 'open');
  runLine(s, 'dc01', cmd.disableUser('svc-backup2'));
  assert.equal(status(s, 'rogue-da'), 'open', 'one step is not enough');
  runLine(s, 'dc01', cmd.removeMember('Domain Admins', 'svc-backup2'));
  assert.equal(status(s, 'rogue-da'), 'fixed');
});

test('Cedarline: Task Scheduler delete of SystemCheck fixes ws-schtask, deleting a legit task does not', () => {
  const s = g1();
  const wrong = runLine(s, 'ws01', cmd.deleteTask('GoogleUpdateTaskMachine'));
  assert.equal(status(s, 'ws-schtask'), 'open');
  assert.equal(wrong.effects.fixed, undefined);
  runLine(s, 'ws01', cmd.deleteTask('SystemCheck'));
  assert.equal(status(s, 'ws-schtask'), 'fixed');
  assert.ok(!taskRows(s.devState.ws01.live).some((t) => t.name === 'SystemCheck'));
});

test('Harbor Point: Services stop + disable fixes print-spooler and the rows reflect it', () => {
  const s = g2();
  const row = () => serviceRows(s.devState.dc01.live).find((r) => r.id === 'Spooler');
  assert.equal(row().status, 'Running');
  assert.equal(stoppedAutoServices(s.devState.dc01.live).length, 0);
  runLine(s, 'dc01', cmd.stopService('Spooler'));
  assert.equal(row().status, '');
  assert.equal(stoppedAutoServices(s.devState.dc01.live).length, 1, 'Server Manager would flag it red');
  assert.equal(status(s, 'print-spooler'), 'open');
  runLine(s, 'dc01', cmd.setStartup('Spooler', 'Disabled'));
  assert.equal(status(s, 'print-spooler'), 'fixed');
  assert.equal(row().startup, 'Disabled');
  assert.equal(stoppedAutoServices(s.devState.dc01.live).length, 0);
});

test('Harbor Point: Guest disable + Account Operators removal; wrong account is a trap', () => {
  const s = g2();
  const bad = runLine(s, 'dc01', cmd.disableUser('svc-sql'));
  assert.ok(bad.effects.trapId);
  runLine(s, 'dc01', cmd.disableUser('Guest'));
  runLine(s, 'dc01', cmd.removeMember('Account Operators', 'Guest'));
  assert.equal(status(s, 'guest-admin'), 'fixed');
});

test('Harbor Point ws01: local user removal commands', () => {
  const s = g2();
  assert.ok(localUserRows(s.devState.ws01.live).some((u) => u.name === 'svc_update' && u.enabled));
  runLine(s, 'ws01', cmd.disableLocalUser('svc_update'));
  assert.equal(localUserRows(s.devState.ws01.live).find((u) => u.name === 'svc_update').enabled, false);
  runLine(s, 'ws01', cmd.removeLocalAdmin('svc_update'));
  runLine(s, 'ws01', cmd.removeLocalUser('svc_update'));
  assert.ok(!localUserRows(s.devState.ws01.live).some((u) => u.name === 'svc_update'));
});

test('adModel replays typed AD lines without mutating the scenario directory', () => {
  const s = g1();
  const dir = dev(s, 'dc01').ctx.dir;
  const before = adModel(dir, []);
  assert.equal(before.find('svc-backup2').enabled, true);
  assert.ok(before.membersOf('Domain Admins').some((u) => u.sam === 'svc-backup2'));
  const lines = [cmd.disableUser('svc-backup2'), cmd.removeMember('Domain Admins', 'svc-backup2')];
  const after = adModel(dir, lines);
  assert.equal(after.find('svc-backup2').enabled, false);
  assert.ok(!after.membersOf('Domain Admins').some((u) => u.sam === 'svc-backup2'));
  assert.deepEqual(after.find('svc-backup2').memberOf.filter((x) => x === 'Domain Admins'), []);
  assert.equal(adModel(dir, []).find('svc-backup2').enabled, true, 'dir untouched');
  assert.equal(adModel(dir, [cmd.deleteUser('svc-backup2')]).find('svc-backup2'), undefined);
  const re = adModel(dir, [...lines, cmd.addMember('Domain Admins', 'svc-backup2'), cmd.enableUser('svc-backup2')]);
  assert.equal(re.find('svc-backup2').enabled, true);
  assert.ok(re.membersOf('Domain Admins').some((u) => u.sam === 'svc-backup2'));
});

test('ADUC rows: tree, containers, Users list, disabled flag, folder path', () => {
  const s = g1();
  const dir = dev(s, 'dc01').ctx.dir;
  const m = adModel(dir, [cmd.disableUser('svc-backup2')]);
  const top = adTree(m).map((n) => n.name);
  for (const want of ['Builtin', 'Computers', 'Domain Controllers', 'Users', 'Cedarline']) assert.ok(top.includes(want), want);
  const users = adRows(m, m.ouByName.get('Users').dn);
  const rogue = users.find((r) => r.name === 'Backup Svc2');
  assert.ok(rogue && rogue.disabled && rogue.type === 'User');
  assert.ok(users.some((r) => r.name === 'Domain Admins' && r.type === 'Security Group - Global'));
  assert.equal(folderPath(m, rogue.obj), 'cedarline.local/Users');
  const staff = adRows(m, m.ouByName.get('Staff').dn);
  assert.ok(staff.some((r) => r.name === 'Ana Flores'));
  assert.ok(adRows(m, m.ouByName.get('Domain Controllers').dn).some((r) => r.name === 'DC01'));
});

test('gui availability by device', () => {
  const s = g1();
  assert.equal(hasAdGui(dev(s, 'dc01')), true);
  assert.equal(hasAdGui(dev(s, 'ws01')), false);
  assert.equal(isServerOs(dev(s, 'dc01')), true);
  assert.equal(isServerOs(dev(s, 'ws01')), false);
});

test('Security log: seeded, deterministic, plants the scenario evidence', () => {
  const s = g1();
  const d = dev(s, 'dc01');
  const a = securityEvents(d, { initialLive: initHostState(d), dir: d.ctx.dir });
  const b = securityEvents(d, { initialLive: initHostState(d), dir: d.ctx.dir });
  assert.ok(a.length >= 250);
  assert.deepEqual(a.map((e) => `${e.ts}:${e.id}`), b.map((e) => `${e.ts}:${e.id}`));
  for (let i = 1; i < a.length; i++) assert.ok(a[i - 1].ts >= a[i].ts, 'newest first');
  const c = a.find((e) => e.id === 4720);
  assert.match(c.text, /svc-backup2/);
  assert.match(fmtDate(c.ts), /^10\/28\/2026 2:14:\d\d AM$/);
  assert.ok(a.some((e) => e.id === 4728 && /Domain Admins/.test(e.text) && /svc-backup2/.test(e.text)));
  assert.ok(a.some((e) => e.id === 4625 && e.kw === 'Audit Failure'));
  assert.ok(a.some((e) => e.id === 4624 && e.kw === 'Audit Success'));
  assert.ok(a.some((e) => e.id === 4672 && /SeDebugPrivilege/.test(e.text)));
  const w = dev(s, 'ws01');
  const ws = securityEvents(w, { initialLive: initHostState(w), dir: w.ctx.dir });
  assert.ok(ws.some((e) => e.id === 4698 && /SystemCheck/.test(e.text)));
  assert.ok(!ws.some((e) => e.id === 4698 && /GoogleUpdate/.test(e.text)));
});

test('Harbor Point evidence: Guest enabled + svc_update created', () => {
  const s = g2();
  const d = dev(s, 'dc01');
  const a = securityEvents(d, { initialLive: initHostState(d), dir: d.ctx.dir });
  assert.ok(a.some((e) => e.id === 4722 && /Guest/.test(e.text)));
  assert.ok(a.some((e) => e.id === 4732 && /Account Operators/.test(e.text)));
  const w = dev(s, 'ws01');
  const ws = securityEvents(w, { initialLive: initHostState(w), dir: w.ctx.dir });
  assert.ok(ws.some((e) => e.id === 4720 && /svc_update/.test(e.text)));
  assert.ok(ws.some((e) => e.id === 4732 && /Administrators/.test(e.text)));
});

test('player commands become events at their round time', () => {
  const s = g1();
  const d = dev(s, 'dc01');
  const log = [{ line: cmd.disableUser('svc-backup2'), t: 65 }, { line: cmd.removeMember('Domain Admins', 'svc-backup2'), t: 90 }, { line: cmd.stopService('Spooler'), t: 100 }];
  const ev = commandEvents(d, log, d.ctx.dir);
  assert.deepEqual(ev.map((e) => e.id), [4725, 4729, 7036]);
  assert.equal(fmtDate(ev[0].ts), '10/31/2026 9:01:05 AM');
  const sec = securityEvents(d, { initialLive: initHostState(d), cmdLog: log, dir: d.ctx.dir });
  assert.equal(sec[0].id, 4729);
  const sys = systemEvents(d, { cmdLog: log, dir: d.ctx.dir });
  assert.equal(sys[0].id, 7036);
  assert.match(sys[0].text, /Spooler service entered the stopped state/);
});

test('Event Viewer filter by id list, range, exclusion and keyword', () => {
  const s = g1();
  const d = dev(s, 'dc01');
  const a = securityEvents(d, { initialLive: initHostState(d), dir: d.ctx.dir });
  assert.ok(filterEvents(a, { ids: '4720, 4728' }).every((e) => [4720, 4728].includes(e.id)));
  assert.equal(filterEvents(a, { ids: '4720, 4728' }).length, a.filter((e) => [4720, 4728].includes(e.id)).length);
  assert.ok(filterEvents(a, { ids: '4600-4700' }).every((e) => e.id >= 4600 && e.id <= 4700));
  assert.ok(!filterEvents(a, { ids: '-4624' }).some((e) => e.id === 4624));
  assert.ok(filterEvents(a, { keywords: ['Audit Failure'] }).every((e) => e.kw === 'Audit Failure'));
  assert.equal(filterEvents(a, {}).length, a.length);
});

test('clock helpers', () => {
  assert.deepEqual(fmtClock(0), { time: '9:00 AM', date: '10/31/2026' });
  assert.equal(fmtClock(65 * 60).time, '10:05 AM');
  assert.equal(taskRows(initHostState(dev(g1(), 'ws01'))).length, 3);
});
