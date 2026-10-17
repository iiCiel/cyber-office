import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateLogs, ATTACKER_IP, PHISH_IP } from '../src/days/day1/logs.js';

test('logs are identical on every run', () => {
  assert.deepEqual(generateLogs({ nowMinutes: 600 }), generateLogs({ nowMinutes: 600 }));
});

test('the 3 AM attack: 38 failures then one success from the same IP', () => {
  const logs = generateLogs({ nowMinutes: 600 });
  const fails = logs.filter((e) => e.msg.includes('EventID=4625') && e.ip === ATTACKER_IP);
  const ok = logs.filter((e) => e.msg.includes('EventID=4624') && e.ip === ATTACKER_IP);
  assert.equal(fails.length, 38);
  assert.equal(ok.length, 1);
  assert.ok(ok[0].t > fails[fails.length - 1].t, 'success comes after the burst');
  assert.ok(fails[0].line.startsWith('Oct 19 03:12:07 dc01'));
});

test('only events up to the current time are visible', () => {
  const early = generateLogs({ nowMinutes: 3 * 60 + 13 });
  assert.ok(early.every((e) => e.t <= (3 * 60 + 13) * 60));
  assert.ok(!early.some((e) => e.key === 'success'));
});

test('ids are stable whether or not the phishing consequence is added', () => {
  const a = generateLogs({ nowMinutes: 600 });
  const b = generateLogs({ nowMinutes: 600, phishedAt: 9 * 60 + 2 });
  const success = (l) => l.find((e) => e.key === 'success').id;
  assert.equal(success(a), success(b));
  assert.equal(b.length, a.length + 2);
  assert.ok(b.some((e) => e.ip === PHISH_IP && e.user === 'analyst01' && e.msg.includes('4624')));
});
