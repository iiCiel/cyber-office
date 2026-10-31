// The Attacker's Playbook (src/cases/playbooks.js): the offence side of each real-breach case. It must be
// well-formed, tie back to the case's own ATT&CK techniques, and stay at narrative altitude (no payloads).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASES } from '../src/cases/index.js';
import { PLAYBOOKS } from '../src/cases/playbooks.js';

const realCases = CASES.filter((c) => c.caseFile.kind !== 'lab');
const labCases = CASES.filter((c) => c.caseFile.kind === 'lab');
const TID = /^T\d{4}(\.\d{3})?$/;
// Things an exploit recipe would contain but a kill-chain narrative should not.
const RECIPE = /(\$\{|<\?php|cmd\.exe|\/bin\/bash -c|base64 -d|curl\s+-s\s+http|powershell -enc|UNION SELECT|; DROP |nc -e)/i;

test('every real (non-lab) case has an Attacker\'s Playbook', () => {
  for (const c of realCases) {
    assert.ok(c.caseFile.attackerView, `${c.caseFile.id} is missing attackerView`);
  }
});

test('every practice lab also has an Attacker\'s Playbook', () => {
  for (const c of labCases) {
    assert.ok(c.caseFile.attackerView, `${c.caseFile.id} (lab) is missing attackerView`);
  }
});

test('playbook keys all map to a registered case id', () => {
  const ids = new Set(CASES.map((c) => c.caseFile.id));
  for (const id of Object.keys(PLAYBOOKS)) assert.ok(ids.has(id), `PLAYBOOKS has an unknown case id: ${id}`);
});

// Well-formedness and tie-to-technique checks apply to every case that carries a playbook — real or lab.
for (const c of CASES) {
  const cf = c.caseFile;
  const av = cf.attackerView;
  test(`${cf.id}: playbook is well-formed`, () => {
    assert.ok(av.goal && av.goal.length > 20, 'needs a goal line');
    assert.ok(av.chokepoint && av.chokepoint.length > 20, 'needs a chokepoint line');
    assert.ok(Array.isArray(av.steps) && av.steps.length >= 3, 'needs at least 3 steps');
    for (const s of av.steps) {
      for (const k of ['phase', 'tid', 'title', 'how', 'trace', 'stop']) {
        assert.ok(s[k] && String(s[k]).trim().length > 0, `${cf.id} step missing ${k}`);
      }
      assert.match(s.tid, TID, `${cf.id}: bad ATT&CK id ${s.tid}`);
      // Narrative altitude, not a recipe: no payload/command syntax in any field.
      for (const field of ['how', 'trace', 'stop', 'title']) {
        assert.doesNotMatch(s[field], RECIPE, `${cf.id} step "${s.title}" reads like an exploit recipe in ${field}`);
      }
    }
    assert.doesNotMatch(av.goal, RECIPE);
    assert.doesNotMatch(av.chokepoint, RECIPE);
  });

  test(`${cf.id}: every playbook step ties to a technique in the case's attack[]`, () => {
    const known = new Set(cf.attack.map((a) => a.id));
    for (const s of av.steps) {
      assert.ok(known.has(s.tid), `${cf.id}: step tid ${s.tid} is not one of the case's attack[] techniques`);
    }
  });
}
