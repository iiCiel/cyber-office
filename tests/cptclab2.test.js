import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CPTC_LAB_2 } from '../src/data/cptcLabScenario2.js';
import { newReport, runEnum, rate, setExecSummary, score } from '../src/game/cptclab.js';

const DISCOVER = {
  'open-bucket': 'aws s3 ls s3://atlas-statements-prod --no-sign-request',
  'api-idor': 'curl -s -H "Authorization: Bearer $TOKEN" https://api.atlas-cu.example/v2/accounts/10044/statements',
  'vpn-cve': 'nuclei -u https://vpn.atlas-cu.example',
  'default-creds': 'curl -u admin:admin https://ops.atlas-cu.example/api/org',
  'exposed-env': 'curl -s http://dev.atlas-cu.example/.env',
  'dir-listing': 'curl -s https://assets.atlas-cu.example/files/',
};

test('scenario 2: every finding is discoverable by a realistic typed command', () => {
  const s = newReport(CPTC_LAB_2);
  for (const f of CPTC_LAB_2.findings) {
    const cmd = DISCOVER[f.id];
    assert.ok(cmd, `missing discover command for ${f.id}`);
    runEnum(s, cmd);
    assert.ok(s.discovered[f.id], `${f.id} not discovered by: ${cmd}`);
  }
});

test('scenario 2: model answers score an A; boilerplate does not', () => {
  const s = newReport(CPTC_LAB_2);
  for (const f of CPTC_LAB_2.findings) {
    runEnum(s, DISCOVER[f.id]);
    rate(s, f.id, 'likelihood', f.refLikelihood);
    rate(s, f.id, 'impact', f.refImpact);
    rate(s, f.id, 'remediation', f.modelRemediation);
  }
  setExecSummary(s, CPTC_LAB_2.execModel);
  const g = score(s);
  assert.ok(g.pct >= 90, `model answers should be an A, got ${g.pct}`);

  const b = newReport(CPTC_LAB_2);
  for (const f of CPTC_LAB_2.findings) {
    runEnum(b, DISCOVER[f.id]);
    rate(b, f.id, 'likelihood', 'High'); rate(b, f.id, 'impact', 'High');
    rate(b, f.id, 'remediation', 'Fix the issue as soon as possible and follow best practices.');
  }
  setExecSummary(b, 'There are some issues that should be fixed.');
  assert.ok(score(b).pct < 70, 'boilerplate should not score an A/B');
});
