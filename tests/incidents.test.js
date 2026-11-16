import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CCDC_LAB_4 } from '../src/data/ccdcLabScenario4.js';
import { newGame, runLine, score } from '../src/game/ccdcLab.js';
import { submitIncident, matchIncident, coveredByIncident } from '../src/game/incidents.js';

const fresh = () => newGame(CCDC_LAB_4, { seed: 1 });
const GOOD = {
  title: 'Fake scoring engine on Rocky and Ubuntu', hosts: ['ecom', 'email'], time: '14:31', source: '/bin/scoringengine PID 7484 beaconing to 198.51.100.45:8443',
  description: 'ps -ef showed /bin/scoringengine (PID 7484, root, since 12:52) parenting bash /usr/lib/.honk and the ttygoose kit, which broadcast goose art to the consoles.',
  actions: 'Killed 7484 and its children, removed /bin/scoringengine, /usr/lib/.honk and /dev/shm/.ttygoose.*.',
};

test('incidents: six real incidents, none shown to the player up front', () => {
  assert.equal(CCDC_LAB_4.incidents.length, 6);
  assert.equal(matchIncident(CCDC_LAB_4, GOOD).id, 'ir-scoringengine');
  assert.equal(matchIncident(CCDC_LAB_4, { title: 'svc-splunk in Domain Admins', description: 'event 4728' }).id, 'ir-svc-da');
});

test('incidents: full marks need evidence you actually collected on the box', () => {
  let s = fresh();
  let r = submitIncident(s, GOOD);
  assert.equal(r.matched, 'ir-scoringengine');
  assert.ok(r.grade.pts < r.grade.max, 'never ran ps');
  s = fresh();
  runLine(s, 'ecom', 'ps -ef');
  r = submitIncident(s, GOOD);
  assert.equal(r.grade.pts, r.grade.max);
  assert.ok(coveredByIncident(s, 'ecom-goose'));
});

test('incidents: a vague or made-up report is not matched; points win back what Red Team took', () => {
  const s = fresh();
  assert.equal(submitIncident(s, { title: 'weird', description: 'Something seemed off on a server but we are not sure what it was.' }).matched, null);
  runLine(s, 'ecom', 'ps -ef');
  s.compromises = [{ id: 'vyos-backdoor', title: 'router', penalty: 80 }];
  const before = score(s).raw;
  submitIncident(s, GOOD);
  assert.equal(score(s).raw - before, 15);
  assert.equal(score(s).incidentMax, 90);
  s.compromises = [];
  assert.equal(score(s).redKept, score(s).redPool, 'never more than the pool');
});
