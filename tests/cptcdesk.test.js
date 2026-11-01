import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sevClass, findingNo, cvssBand, fmtClock, severityCounts, docRef, panelClock } from '../src/ui/cptc/helpers.js';

test('severity classes and numbering', () => {
  assert.equal(sevClass('High'), 'kx-sev-high');
  assert.equal(sevClass(null), 'kx-sev-none');
  assert.equal(findingNo(0), 'F-01');
  assert.equal(findingNo(11), 'F-12');
  assert.equal(cvssBand('Critical'), '9.0 - 10.0');
  assert.equal(cvssBand('x'), 'n/a');
});
test('clock, counts, doc ref, panel clock', () => {
  assert.equal(fmtClock(599500), '10:00');
  assert.equal(fmtClock(-5), '0:00');
  assert.deepEqual(severityCounts([{ sev: 'High' }, { sev: 'High' }, { sev: null }, { sev: 'Low' }]), { Critical: 0, High: 2, Medium: 0, Low: 1, Unrated: 1 });
  assert.equal(docRef('Meridian Health Partners'), 'MHP-PT-2026-01');
  assert.equal(panelClock(new Date(2026, 9, 31, 14, 7)), 'Sat 31 Oct, 14:07');
});

import { splitScope, clientDomain } from '../src/ui/cptc/helpers.js';
test('scope split and client domain', () => {
  const s = splitScope(['In scope: 10.0.0.0/24', 'Out of scope: the VLAN', 'Do not exfiltrate data.']);
  assert.deepEqual(s, { inScope: ['10.0.0.0/24'], outOfScope: ['the VLAN'], rules: ['Do not exfiltrate data.'] });
  assert.equal(clientDomain('Meridian Health Partners'), 'meridian.example');
});
