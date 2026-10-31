import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CPTC_LAB } from '../src/data/cptcLabScenario.js';
import {
  newReport, runEnum, discoveredFindings, rate, setExecSummary, toReport, expire, score, progress,
  severityFor, MODES,
} from '../src/game/cptclab.js';

const fresh = (opts = {}) => newReport(CPTC_LAB, { seed: 1, ...opts });

test('the risk matrix follows likelihood × impact', () => {
  assert.equal(severityFor('High', 'High'), 'Critical');
  assert.equal(severityFor('High', 'Medium'), 'High');
  assert.equal(severityFor('Low', 'Low'), 'Low');
  assert.equal(severityFor('Medium', 'High'), 'High');
});

test('nmap is recon, not a confirmed finding', () => {
  const s = fresh();
  const r = runEnum(s, 'nmap -sV 198.51.100.0/24');
  assert.ok(!r.discovered);
  assert.match(r.lines.map((l) => l.text).join('\n'), /3389/);
  assert.equal(discoveredFindings(s).length, 0);
});

test('typing the right exploit command discovers a finding exactly once', () => {
  const s = fresh();
  let r = runEnum(s, 'xfreerdp /v:198.51.100.20');
  assert.equal(r.discovered, 'ext-rdp');
  assert.ok(s.discovered['ext-rdp']);
  assert.match(r.lines.map((l) => l.text).join('\n'), /FINDING CONFIRMED/);
  r = runEnum(s, 'xfreerdp /v:198.51.100.20');
  assert.match(r.lines.map((l) => l.text).join('\n'), /already in your report/);
  assert.equal(discoveredFindings(s).length, 1);
});

test('each finding can be discovered by a realistic command', () => {
  const s = fresh();
  runEnum(s, "sqlmap -u https://portal.meridian.example/login --data=user=admin");
  runEnum(s, 'smbclient -L //10.20.0.15 -N');
  runEnum(s, 'snmpwalk -v2c -c public 10.20.0.40');
  runEnum(s, 'sslscan www.meridian.example');
  runEnum(s, 'xfreerdp /v:198.51.100.20');
  assert.equal(discoveredFindings(s).length, CPTC_LAB.findings.length);
});

test('an unknown command returns a helpful no-result, not a crash', () => {
  const s = fresh();
  const r = runEnum(s, 'frobnicate the gibson');
  assert.match(r.lines.map((l) => l.text).join('\n'), /no result/);
});

test('coverage scales with how many findings you actually discovered', () => {
  const s = fresh();
  runEnum(s, 'xfreerdp /v:198.51.100.20');
  const partial = score(s);
  assert.ok(partial.coverage > 0 && partial.coverage < 35);
  assert.equal(partial.foundCount, 1);
});

test('a thorough, well-written report scores an A; the severity must match the reference', () => {
  const s = fresh();
  // Discover everything.
  for (const c of ['xfreerdp /v:198.51.100.20', 'sqlmap -u https://portal.meridian.example/login', 'smbclient -L //10.20.0.15 -N', 'snmpwalk -v2c -c public 10.20.0.40', 'sslscan www.meridian.example']) runEnum(s, c);
  toReport(s);
  // Rate each to its reference severity and write a remediation.
  for (const f of CPTC_LAB.findings) {
    rate(s, f.id, 'likelihood', f.refLikelihood);
    rate(s, f.id, 'impact', f.refImpact);
    rate(s, f.id, 'remediation', 'Root-cause remediation written out in full detail here.');
  }
  setExecSummary(s, 'An elevated risk of a patient-data breach from internet-exposed RDP and portal SQL injection; remediate both within 72 hours.');
  const g = score(s);
  assert.equal(g.coverage, 35);
  assert.equal(g.risk, 30);
  assert.equal(g.remediation, 25);
  assert.equal(g.exec, 10);
  assert.equal(g.pct, 100);
  assert.equal(g.letter, 'A');
});

test('inflating a Low finding to Critical costs risk points', () => {
  const s = fresh();
  runEnum(s, 'sslscan www.meridian.example'); // weak-tls, reference Low
  toReport(s);
  rate(s, 'weak-tls', 'likelihood', 'High');
  rate(s, 'weak-tls', 'impact', 'High'); // -> Critical, two steps off Low
  rate(s, 'weak-tls', 'remediation', 'Disable TLS 1.0 and 1.1.');
  const g = score(s);
  assert.equal(g.risk, 0, 'two-steps-off severity earns no risk credit');
});

test('empty remediation / exec summary are not credited', () => {
  const s = fresh();
  runEnum(s, 'xfreerdp /v:198.51.100.20');
  toReport(s);
  rate(s, 'ext-rdp', 'likelihood', 'High');
  rate(s, 'ext-rdp', 'impact', 'High');
  rate(s, 'ext-rdp', 'remediation', 'too short');
  const g = score(s);
  assert.equal(g.remediation, 0);
  assert.equal(g.exec, 0);
});

test('expire() pushes the player into the report phase', () => {
  const s = fresh({ mode: MODES.COMPETITION });
  expire(s);
  assert.equal(s.phase, 'report');
});

test('progress tracks discovered vs fully-written findings', () => {
  const s = fresh();
  runEnum(s, 'xfreerdp /v:198.51.100.20');
  rate(s, 'ext-rdp', 'likelihood', 'High');
  rate(s, 'ext-rdp', 'impact', 'High');
  rate(s, 'ext-rdp', 'remediation', 'Remove RDP from the internet; require VPN+MFA.');
  const p = progress(s);
  assert.equal(p.found, 1);
  assert.equal(p.rated, 1);
});
