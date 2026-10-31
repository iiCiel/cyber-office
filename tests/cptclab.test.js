import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CPTC_LAB } from '../src/data/cptcLabScenario.js';
import {
  newReport, runEnum, discoveredFindings, rate, setExecSummary, toReport, expire, score, progress,
  severityFor, MODES, lockFinding, gradeText,
} from '../src/game/cptclab.js';

// Real, specific write-ups (what a strong CPTC team writes).
const REAL_REM = {
  'ext-rdp': 'Remove RDP from the internet (close 3389 at the edge) and put remote access behind a VPN with MFA.',
  'sql-injection': 'Rewrite the login query with parameterised queries / prepared statements, validate input server-side, and use a least-privilege database account.',
  'smb-share': 'Restrict the HR$ share to the HR group only, remove Authenticated Users read access, move the file, and audit who accessed it.',
  'default-snmp': 'Change or disable the public SNMP community string (move to SNMPv3) and segment the printer VLAN with an ACL.',
  'weak-tls': 'Disable TLS 1.0 and 1.1 and serve TLS 1.2+ only.',
};
const REAL_EXEC = 'Meridian faces an elevated risk of a patient-data breach: Remote Desktop is exposed to the internet and the patient portal has a SQL injection flaw. We recommend fixing both within 72 hours; once remediated, the main ransomware and data-theft paths are closed.';
const BOILER = 'Root-cause remediation written out in full for this finding.';
const discoverAll = (s) => { for (const c of ['xfreerdp /v:198.51.100.20', 'sqlmap -u https://portal.meridian.example/login', 'smbclient -L //10.20.0.15 -N', 'snmpwalk -v2c -c public 10.20.0.40', 'sslscan www.meridian.example']) runEnum(s, c); toReport(s); };

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
    rate(s, f.id, 'remediation', REAL_REM[f.id]);
  }
  setExecSummary(s, REAL_EXEC);
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

test('boilerplate remediation earns no remediation credit and the report cannot reach an A', () => {
  const s = fresh();
  discoverAll(s);
  for (const f of CPTC_LAB.findings) { rate(s, f.id, 'likelihood', f.refLikelihood); rate(s, f.id, 'impact', f.refImpact); rate(s, f.id, 'remediation', BOILER); }
  setExecSummary(s, REAL_EXEC);
  const g = score(s);
  assert.equal(g.remediation, 0);
  assert.notEqual(g.letter, 'A');
  assert.ok(g.remRows.every((r) => r.missing.length > 0), 'debrief lists the missing controls');
});

test('naming a known-wrong control is penalised; rejecting it is not', () => {
  const rdp = CPTC_LAB.findings.find((f) => f.id === 'ext-rdp').remediationRubric;
  const bad = gradeText(rdp, 'Move RDP to a non-standard port, put it behind a VPN and require MFA.');
  assert.ok(bad.wrong.length === 1 && bad.credit < 0.5, JSON.stringify(bad));
  const good = gradeText(rdp, 'Remove RDP from the internet; require VPN with MFA. Moving the port does not fix it.');
  assert.equal(good.wrong.length, 0);
  assert.equal(good.credit, 1);
  const sql = CPTC_LAB.findings.find((f) => f.id === 'sql-injection').remediationRubric;
  assert.ok(gradeText(sql, 'Deploy a WAF in front of the portal.').credit === 0);
});

test('exec summary is graded on business risk, both critical issues, a timeframe and an outcome', () => {
  const s = fresh();
  discoverAll(s);
  setExecSummary(s, 'The assessment went well and the team was very helpful. Some things could be improved over time.');
  assert.ok(score(s).exec <= 2, `filler exec got ${score(s).exec}`);
  setExecSummary(s, REAL_EXEC);
  assert.equal(score(s).exec, 10);
  setExecSummary(s, REAL_EXEC + ' CVSS 9.8 on port 3389/tcp.');
  assert.ok(score(s).exec < 10, 'jargon costs points');
});

test('guided lock: the model answer is only available after the player commits; locked ratings are frozen', () => {
  const s = fresh();
  runEnum(s, 'xfreerdp /v:198.51.100.20');
  toReport(s);
  assert.equal(lockFinding(s, 'ext-rdp').ok, false, 'cannot lock before rating');
  rate(s, 'ext-rdp', 'likelihood', 'High');
  rate(s, 'ext-rdp', 'impact', 'High');
  assert.equal(lockFinding(s, 'ext-rdp').ok, false, 'cannot lock without a remediation');
  rate(s, 'ext-rdp', 'remediation', REAL_REM['ext-rdp']);
  const r = lockFinding(s, 'ext-rdp');
  assert.equal(r.ok, true);
  assert.equal(r.feedback.credit, 1);
  rate(s, 'ext-rdp', 'impact', 'Low');
  rate(s, 'ext-rdp', 'remediation', 'changed');
  assert.equal(s.report['ext-rdp'].impact, 'High');
  assert.equal(s.report['ext-rdp'].remediation, REAL_REM['ext-rdp']);
});
