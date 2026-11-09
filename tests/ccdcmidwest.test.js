import test from 'node:test';
import assert from 'node:assert/strict';
import { CCDC_MIDWEST as MW, TEAM } from '../src/data/ccdcLabMidwest.js';
import { newGame, runLine, MODES, score, requestRevert } from '../src/game/ccdcLab.js';
import { attachEngine, notePasswordRotated, notePcrFiled, tickTo } from '../src/game/ccdcEngine.js';
import { syncServices, weakAccounts, setPower, dirOf } from '../src/game/ccdcBox.js';
import { createSiem } from '../src/game/siemGen.js';
import { gameTime } from '../src/game/ccdcRed.js';

const nat = (x) => `172.25.${20 + TEAM}.${x}`;
const game = (length = 'short') => { const st = newGame(MW, { seed: 11, mode: MODES.COMPETITION, length }); attachEngine(st); return st; };
const text = (r) => r.lines.map((l) => l.text).join('\n');
const pan = (st, ...lines) => lines.map((l) => runLine(st, 'pan', l));
const GOOD = [
  'configure',
  `set rulebase security rules w from Core to User source any destination ${nat(23)} application web-browsing service application-default action allow`,
  `set rulebase security rules e from Core to Public source any destination ${nat(11)} application [ web-browsing ssl ] service application-default action allow`,
  `set rulebase security rules m from Core to Public source any destination ${nat(39)} application [ smtp pop3 ] service application-default action allow`,
  `set rulebase security rules d from Core to Internal source any destination ${nat(20)} application dns service application-default action allow`,
  'set rulebase security rules p from Core to [ User Public Internal ] source any destination any application ping service application-default action allow',
  'delete rulebase security rules allow-all',
];
const commit = (st) => { pan(st, 'commit'); st.engine.clock += 100; syncServices(st); };

test('the competition day runs 08:00 to 12:00 on the Midwest clock', () => {
  const st = game();
  assert.equal(st.timeScale, 16);
  assert.equal(gameTime(st, 0), '08:00');
  assert.equal(gameTime(st, 900), '12:00');
});

test('a real-time round is the full four hours', () => {
  assert.equal(newGame(MW, { seed: 1, length: 'real' }).scenario.clockSeconds, 14400);
});

test('nothing changes on the firewall until the commit job finishes', () => {
  const st = game();
  pan(st, ...GOOD);
  assert.equal(st.devState.pan.firewall.rules[0].name, 'allow-all');
  assert.equal(st.findings['pan-allow-all'].status, 'open');
  pan(st, 'commit');
  assert.equal(st.devState.pan.firewall.rules[0].name, 'allow-all');
  st.engine.clock += 100;
  syncServices(st);
  assert.equal(st.devState.pan.firewall.rules[0].name, 'w');
  assert.equal(st.findings['pan-allow-all'].status, 'fixed');
  assert.ok(Object.values(st.services).every((s) => s.state === 'up'));
});

test('a rule written to the internal address does not carry the traffic', () => {
  const st = game();
  pan(st, ...GOOD, 'delete rulebase security rules w', 'set rulebase security rules w from Core to User source any destination 172.20.242.10 application web-browsing service application-default action allow');
  commit(st);
  assert.equal(st.services['web-http'].state, 'down');
  assert.match(st.services['web-http'].problem, /edge/);
});

test('restricting a public service by source is a rule violation', () => {
  const st = game();
  pan(st, ...GOOD, 'delete rulebase security rules w', `set rulebase security rules w from Core to User source 10.1.1.1 destination ${nat(23)} application web-browsing service application-default action allow`);
  commit(st);
  assert.equal(st.services['web-http'].state, 'down');
  assert.ok(st.ruleViolations.some((v) => v.id === 'source'));
});

test('blocking ping is a rule violation', () => {
  const st = game();
  pan(st, ...GOOD, 'delete rulebase security rules p');
  commit(st);
  assert.ok(st.ruleViolations.some((v) => v.id === 'icmp'));
  assert.equal(score(st).violationPenalty, 10);
});

test('commit validation stops on a bad zone', () => {
  const st = game();
  pan(st, 'configure', 'set rulebase security rules x from Nowhere to Public source any destination any application any service any action allow');
  const [r] = pan(st, 'commit');
  assert.match(text(r), /'Nowhere' is not a valid reference/);
});

test('the firewall password needs a commit too', () => {
  const st = game();
  pan(st, 'configure', 'set mgt-config users admin password', 'Sturdy-Horse-42-Plan', 'Sturdy-Horse-42-Plan');
  assert.equal(st.devState.pan.creds.admin.def, true);
  commit(st);
  assert.equal(st.devState.pan.creds.admin.strong, true);
});

test('each operating system has only its own tools', () => {
  const st = game();
  assert.match(text(runLine(st, 'web', 'systemctl restart apache2')), /command not found/);
  assert.equal(st.devState.web.live.units.apache2, 'active');
  assert.match(text(runLine(st, 'ecom', 'ufw status')), /command not found/);
  assert.match(text(runLine(st, 'dns', 'firewall-cmd --state')), /command not found/);
  assert.match(text(runLine(st, 'web', 'service apache2 status')), /is running/);
});

test('firewalld: a permanent rule does nothing until reload, and reload discards runtime rules', () => {
  const st = game();
  runLine(st, 'ecom', 'firewall-cmd --permanent --remove-service=http');
  syncServices(st);
  assert.equal(st.services['ecom-http'].state, 'up');
  runLine(st, 'ecom', 'firewall-cmd --reload');
  syncServices(st);
  assert.equal(st.services['ecom-http'].state, 'down');
});

test('old package repositories fail the way they do on the day', () => {
  const st = game();
  assert.match(text(runLine(st, 'ecom', 'yum update -y')), /Cannot find a valid baseurl/);
  assert.match(text(runLine(st, 'web', 'apt-get update')), /404/);
});

test('POP3 depends on the domain controller', () => {
  const st = game();
  runLine(st, 'ad', 'Stop-Service NTDS -Force');
  syncServices(st);
  assert.equal(st.services.pop3.state, 'down');
});

test('rotating staff passwords without a ticket breaks POP3 until the ticket is filed', () => {
  const st = game();
  const res = runLine(st, 'ad', "Get-ADUser -Filter * | Set-ADAccountPassword -NewPassword (ConvertTo-SecureString 'Long-Harvest-77-Field' -AsPlainText -Force)");
  assert.ok(res.effects.pcrRotated);
  notePasswordRotated(st);
  assert.ok(st.engine.pcr.breaking);
  notePcrFiled(st);
  assert.equal(st.engine.pcr.breaking, false);
});

test('changing the Administrator password alone needs no ticket', () => {
  const st = game();
  const res = runLine(st, 'ad', "Set-ADAccountPassword -Identity Administrator -NewPassword (ConvertTo-SecureString 'Long-Harvest-77-Field' -AsPlainText -Force)");
  assert.ok(!res.effects.pcrRotated);
});

test('powering a box off and on does not undo what was done to it', () => {
  const st = game();
  runLine(st, 'web', 'rm /var/www/html/index.html');
  setPower(st, 'web', false);
  assert.equal(st.services['web-http'].state, 'down');
  setPower(st, 'web', true);
  st.engine.clock += 100;
  syncServices(st);
  assert.equal(st.devState.web.fs['/var/www/html/index.html'], undefined);
  assert.equal(st.services['web-http'].state, 'down');
});

test('the whole playbook hardens every finding and leaves the services up', () => {
  const st = game();
  const strong = 'Sturdy-Horse-42-Plan';
  for (const d of st.deviceList) {
    for (const raw of d.checklist) {
      const line = raw.replace('NEW-PASSWORD-HERE', strong);
      runLine(st, d.id, line);
      if (/mgt-config users admin password/.test(line)) { runLine(st, d.id, strong); runLine(st, d.id, strong); }
    }
  }
  st.engine.clock += 100;
  syncServices(st);
  const open = st.findingList.filter((f) => st.findings[f.id].status !== 'fixed').map((f) => f.id);
  assert.deepEqual(open, []);
  assert.deepEqual(Object.values(st.services).filter((s) => s.state !== 'up').map((s) => s.id), []);
});

test('Red Team keeps working and a full round scores', () => {
  const st = game();
  tickTo(st, 900);
  assert.ok(st.engine.red.events.length > 3);
  assert.ok(st.engine.red.events.some((e) => e.host === 'pan' || e.type === 'takedown'));
  assert.ok(score(st).max > 900);
});

test('Red Team plants a rule on the firewall that survives a commit until it is deleted', () => {
  const st = game();
  tickTo(st, 900);
  const fw = st.devState.pan.firewall;
  if (fw.rules.some((r) => r.name === 'allow-updates')) {
    assert.equal(fw.candidate.rules[0].name, 'allow-updates');
    assert.ok(fw.watchSrc.length);
  }
});

test('the SIEM story for this network holds its evidence', () => {
  const s = createSiem(MW, { seed: 3 });
  assert.equal(s.attacker, '198.51.100.61');
  assert.equal(s.hunt.length, 4);
});

test('a reverted box keeps the same state object', () => {
  const st = game();
  const before = st.devState.ad;
  requestRevert(st, 'ad');
  assert.equal(st.devState.ad, before);
  assert.ok(before.live.winServices.length);
});

test('a deleted Windows account is not a way in', () => {
  const st = game();
  runLine(st, 'win10', 'Remove-LocalUser -Name svc_print');
  assert.ok(!weakAccounts(st.deviceList.find((d) => d.id === 'win10'), st.devState.win10).includes('svc_print'));
});

test('the captain seat has no box-checked rubric lines', () => {
  const st = newGame(MW, { seed: 2, role: 'ir', length: 'long' });
  assert.ok(st.injectList.every((i) => (i.rubric || []).every((r) => !r.verify)));
});

test('accounts Red Team adds to AD appear in the live directory', () => {
  const st = game();
  assert.ok(dirOf(st.deviceList.find((d) => d.id === 'ad'), st.devState.ad).lookup('svc_audit'));
});
