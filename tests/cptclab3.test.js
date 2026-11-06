import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CPTC_LAB_3 } from '../src/data/cptcLabScenario3.js';
import { newReport, runEnum, discoveredFindings, rate, setExecSummary, score } from '../src/game/cptclab.js';

const DISCOVER = {
  'jenkins-script-console': 'curl -s -d \'script=println "id: " + "whoami".execute().text\' http://ci.lakeshore-freight.example:8080/scriptText',
  'snmp-public': 'snmpwalk -v2c -c public 203.0.113.70',
  'tracking-idor': 'curl -s "https://track.lakeshore-freight.example/api/shipments/10492"',
  'tomcat-default-creds': 'curl -u tomcat:s3cret http://ops.lakeshore-freight.example:8080/manager/text/list',
  'asrep-roast': 'impacket-GetNPUsers LAKESHORE.example/ -usersfile users.txt -no-pass -dc-ip 10.30.0.10',
  'password-reuse-lateral': "crackmapexec smb 10.30.0.25 -u svc-wms -p 'cracked-password'",
};

test('scenario 3: every finding is discoverable by a realistic typed command', () => {
  const s = newReport(CPTC_LAB_3);
  for (const f of CPTC_LAB_3.findings) {
    const cmd = DISCOVER[f.id];
    assert.ok(cmd, `missing discover command for ${f.id}`);
    runEnum(s, cmd);
    assert.ok(s.discovered[f.id], `${f.id} not discovered by: ${cmd}`);
  }
  assert.equal(discoveredFindings(s).length, CPTC_LAB_3.findings.length);
});

test('scenario 3: recon (nmap) lists hosts but confirms nothing by itself', () => {
  const s = newReport(CPTC_LAB_3);
  const r = runEnum(s, 'nmap -sV -p- 203.0.113.0/24');
  assert.ok(r.lines.some((l) => /ci\.lakeshore-freight/.test(l.text)));
  assert.equal(discoveredFindings(s).length, 0);
});

test('scenario 3: wrong / out-of-range commands do not confirm a finding', () => {
  const s = newReport(CPTC_LAB_3);
  runEnum(s, 'ping 203.0.113.65');
  // a command against a host entirely outside the scenario's ranges never confirms anything
  runEnum(s, 'nmap 203.0.113.250');
  runEnum(s, 'curl -s http://unrelated.example/');
  assert.equal(discoveredFindings(s).length, 0);
});

test('scenario 3: out-of-scope target is not in the published scope text', () => {
  const s = newReport(CPTC_LAB_3);
  const r = runEnum(s, 'scope');
  const text = r.lines.map((l) => l.text).join('\n');
  assert.ok(/carrier EDI gateway/i.test(text));
  assert.ok(/customs broker/i.test(text));
});

test('scenario 3: model answers score an A; boilerplate does not', () => {
  const s = newReport(CPTC_LAB_3);
  for (const f of CPTC_LAB_3.findings) {
    runEnum(s, DISCOVER[f.id]);
    rate(s, f.id, 'likelihood', f.refLikelihood);
    rate(s, f.id, 'impact', f.refImpact);
    rate(s, f.id, 'remediation', f.modelRemediation);
  }
  setExecSummary(s, CPTC_LAB_3.execModel);
  const g = score(s);
  assert.ok(g.pct >= 90, `model answers should be an A, got ${g.pct}`);

  const b = newReport(CPTC_LAB_3);
  for (const f of CPTC_LAB_3.findings) {
    runEnum(b, DISCOVER[f.id]);
    rate(b, f.id, 'likelihood', 'High'); rate(b, f.id, 'impact', 'High');
    rate(b, f.id, 'remediation', 'Fix the issue as soon as possible and follow best practices.');
  }
  setExecSummary(b, 'There are some issues that should be fixed.');
  assert.ok(score(b).pct < 70, 'boilerplate should not score an A/B');
});

test('scenario 3: partial coverage scores lower than full coverage', () => {
  const full = newReport(CPTC_LAB_3);
  for (const f of CPTC_LAB_3.findings) {
    runEnum(full, DISCOVER[f.id]);
    rate(full, f.id, 'likelihood', f.refLikelihood);
    rate(full, f.id, 'impact', f.refImpact);
    rate(full, f.id, 'remediation', f.modelRemediation);
  }
  setExecSummary(full, CPTC_LAB_3.execModel);

  const partial = newReport(CPTC_LAB_3);
  const firstTwo = CPTC_LAB_3.findings.slice(0, 2);
  for (const f of firstTwo) {
    runEnum(partial, DISCOVER[f.id]);
    rate(partial, f.id, 'likelihood', f.refLikelihood);
    rate(partial, f.id, 'impact', f.refImpact);
    rate(partial, f.id, 'remediation', f.modelRemediation);
  }
  setExecSummary(partial, CPTC_LAB_3.execModel);

  assert.ok(score(partial).pct < score(full).pct, 'partial coverage must score lower');
  assert.equal(score(partial).foundCount, 2);
});

test('scenario 3: remediation rubric flags a wrong control (renaming the Jenkins console)', () => {
  const rubric = CPTC_LAB_3.findings.find((f) => f.id === 'jenkins-script-console').remediationRubric;
  assert.ok(rubric.wrong.some((w) => /renam/i.test(w.re.source)));
});

test('scenario 3: remediation rubric for AS-REP roast asks for pre-auth + strong password + gMSA', () => {
  const rubric = CPTC_LAB_3.findings.find((f) => f.id === 'asrep-roast').remediationRubric;
  const labels = rubric.need.map((n) => n.label).join(' ');
  assert.match(labels, /pre-?auth/i);
  assert.match(labels, /gmsa|managed service account/i);
});
