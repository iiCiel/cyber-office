// Pure mapping behind the pfSense GUI: form values -> rule-editor commands, rules -> table cells, log entries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CCDC_LAB } from '../src/data/ccdcLabScenario.js';
import { newGame, runLine } from '../src/game/ccdcLab.js';
import {
  portRange, buildRuleCommand, deleteCommands, defaultCommand, ruleCells, policyRow, hostAliases,
  logEntries, verdictFor, pfConsoleBanner, scoringIpOf,
} from '../src/game/pfsenseMap.js';

const form = (o = {}) => ({ action: 'pass', proto: 'tcp', source: 'any', sourceValue: '', dest: 'web01', portFrom: '443', portTo: '', ...o });

test('portRange: any, single, range, invalid', () => {
  assert.equal(portRange('', ''), 'any');
  assert.equal(portRange('443', ''), '443');
  assert.equal(portRange('443', '443'), '443');
  assert.equal(portRange('8000', '8100'), '8000-8100');
  assert.equal(portRange('9000', '8000'), null);
  assert.equal(portRange('abc', ''), null);
  assert.equal(portRange('70000', ''), null);
});

test('buildRuleCommand matches the checklist commands exactly', () => {
  assert.equal(buildRuleCommand(form()).command, 'pass tcp to web01 port 443');
  assert.equal(buildRuleCommand(form({ proto: 'tcp/udp', dest: 'dc01', portFrom: '53' })).command, 'pass any to dc01 port 53');
  assert.equal(buildRuleCommand(form({ dest: 'db01', portFrom: '3306', source: 'single', sourceValue: 'scoring' })).command, 'pass tcp to db01 port 3306 from scoring');
  assert.equal(buildRuleCommand(form({ action: 'block', proto: 'udp', dest: 'any', portFrom: '', portTo: '' })).command, 'block udp to any port any');
});

test('buildRuleCommand rejects bad input', () => {
  assert.equal(buildRuleCommand(form({ dest: '' })).ok, false);
  assert.equal(buildRuleCommand(form({ portFrom: '99999' })).ok, false);
  assert.equal(buildRuleCommand(form({ proto: 'any', portFrom: '80' })).ok, false);
  assert.equal(buildRuleCommand(form({ source: 'single', sourceValue: '' })).ok, false);
  assert.equal(buildRuleCommand(form({ dest: 'a b; rm' })).ok, false);
});

test('deleteCommands go highest first; defaultCommand', () => {
  assert.deepEqual(deleteCommands([2, 5, 3, 5]), ['del 5', 'del 3', 'del 2']);
  assert.equal(defaultCommand('block'), 'default block');
  assert.equal(defaultCommand('pass'), 'default pass');
});

test('ruleCells and policyRow', () => {
  const c = ruleCells({ action: 'pass', proto: 'tcp', dst: 'db01', port: '3306', from: 'scoring' }, 6, 30);
  assert.equal(c.n, 7);
  assert.equal(c.pass, true);
  assert.equal(c.proto, 'IPv4 TCP');
  assert.equal(c.source, 'scoring');
  assert.equal(c.dest, 'db01');
  assert.equal(c.destPort, '3306');
  const any = ruleCells({ action: 'pass', proto: 'any', dst: 'any', port: 'any', from: 'any' }, 0, 0);
  assert.equal(any.proto, 'IPv4 *');
  assert.equal(any.dest, '*');
  assert.equal(ruleCells({ action: 'block', proto: 'tcp', dst: 'any', port: '23', from: 'any' }, 0, 9).pass, false);
  assert.equal(policyRow({ default: 'pass' }).toggleTo, 'block');
  assert.equal(policyRow({ default: 'block' }).pass, false);
});

test('aliases come from the scenario and include the scoring engine', () => {
  const g = newGame(CCDC_LAB, { seed: 1 });
  const a = hostAliases(g.scenario, scoringIpOf(g));
  assert.ok(a.find((x) => x.name === 'web01' && x.values === '10.10.10.20'));
  assert.deepEqual(a.find((x) => x.name === 'scoring').values, '198.51.100.9');
});

test('logs are deterministic and reflect the rule set', () => {
  const g = newGame(CCDC_LAB, { seed: 1 });
  const fw = g.devState['edge-fw'].firewall;
  const hosts = g.scenario.services.map((s) => ({ name: s.host, ip: s.ip, ports: s.ports, proto: s.proto }));
  const args = { fw, hosts, clock: 600, count: 60 };
  const a = logEntries({ ...args });
  assert.deepEqual(a, logEntries({ ...args }));
  assert.ok(a.length > 20);
  assert.ok(a.every((e) => e.pass), 'pass-any lets everything through');
  // after hardening, scanner traffic is blocked and scored traffic still passes
  for (const l of ['pass tcp to web01 port 80', 'pass tcp to web01 port 443', 'pass any to dc01 port 53', 'pass tcp to mail01 port 25',
    'pass tcp to mail01 port 143', 'pass tcp to mail01 port 993', 'pass tcp to db01 port 3306 from scoring', 'del 1', 'default block']) runLine(g, 'edge-fw', l);
  const b = logEntries({ ...args });
  assert.ok(b.some((e) => !e.pass && /Default deny/.test(e.rule)));
  assert.ok(b.some((e) => e.pass && /USER_RULE/.test(e.rule)));
  assert.equal(verdictFor(fw, { proto: 'tcp', dstName: 'db01', dstIp: '10.10.10.40', dport: 3306, srcIp: '45.1.1.1', srcAlias: '' }).pass, false);
  assert.equal(verdictFor(fw, { proto: 'tcp', dstName: 'db01', dstIp: '10.10.10.40', dport: 3306, srcIp: '198.51.100.9', srcAlias: 'scoring' }).pass, true);
});

test('console banner lists the numbered menu and the host', () => {
  const t = pfConsoleBanner({ host: 'edge-fw', ip: '203.0.113.2' }).join('\n');
  assert.match(t, /Welcome to pfSense 2\.7\.2-RELEASE \(amd64\) on edge-fw/);
  assert.match(t, /8\) Shell/);
  assert.match(t, /203\.0\.113\.2\/24/);
});
