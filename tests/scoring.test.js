import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreDay1 as scoreDay, debrief1 as debriefLines } from '../src/days/day1/score.js';

const perfect = {
  mail: {
    'ms-signin': { read: true },
    'hr-benefits': { read: true },
    'priya-welcome': { read: true },
    'it-reset': { read: true, reported: true, clicked: [] },
    'ceo-giftcards': { read: true, reported: true, clicked: [] },
  },
  soc: {
    cases: { 'bruteforce-jalvarez': {
      verdict: 'compromised',
      actions: ['disable', 'block', 'scope', 'mfa'],
      evidence: [{ key: 'success' }, { key: 'exfil' }, { key: 'real-jalvarez' }],
    } },
  },
  enc: { phone: { outcome: 'callback-verified', done: true }, usb: { outcome: 'handed-to-soc', done: true } },
};

const worst = {
  mail: {
    'ms-signin': { read: true, reported: true },
    'hr-benefits': { read: true, reported: true },
    'priya-welcome': { read: true },
    'it-reset': { read: true, clicked: ['reset'], enteredCreds: true },
    'ceo-giftcards': { read: true, replied: true },
  },
  soc: { cases: { 'bruteforce-jalvarez': { verdict: 'forgot', actions: ['close', 'reboot'], evidence: [{ key: null }] } } },
  enc: { phone: { outcome: 'reset', askedId: true, done: true }, usb: { outcome: 'plugged', done: true } },
};

test('a perfect day is an A with only the contained-incident cost', () => {
  const r = scoreDay(perfect);
  assert.equal(r.grade, 'A');
  assert.equal(r.pct, 100);
  assert.equal(r.cost, 6000);
  assert.ok(r.items.every((i) => i.outcome === 'good'));
});

test('the worst day is an F and every mistake has a cost', () => {
  const r = scoreDay(worst);
  assert.equal(r.grade, 'F');
  assert.ok(r.cost > 100000, `cost ${r.cost}`);
  const byId = Object.fromEntries(r.items.map((i) => [i.id, i]));
  for (const id of ['mail-it-reset', 'mail-ceo-giftcards', 'case', 'phone', 'usb']) assert.equal(byId[id].outcome, 'bad', id);
  assert.equal(byId['mail-hr-benefits'].outcome, 'ok', 'reporting a real email is a false positive');
  assert.match(byId.phone.why, /employee ID/);
});

test('an empty day (did nothing) does not crash and scores low', () => {
  const r = scoreDay({});
  assert.ok(r.pct < 50);
  assert.equal(r.items.length, 8);
});

test('every item maps to a Security+ objective', () => {
  for (const i of scoreDay(perfect).items) assert.match(i.teaches.secplus, /^\d\.\d+ /, i.id);
});

test('the debrief mentions the consequences that actually happened', () => {
  const bad = debriefLines(worst).join(' ');
  assert.match(bad, /Russia/);
  assert.match(bad, /gift cards/);
  assert.match(bad, /Lagos/);
  assert.match(bad, /keystroke injector/);
  const good = debriefLines(perfect).join(' ');
  assert.doesNotMatch(good, /Russia|Lagos/);
});

test('one outright miss caps an A at B', () => {
  const oneMiss = { ...perfect, enc: { ...perfect.enc, usb: { outcome: 'plugged', done: true } } };
  const r = scoreDay(oneMiss);
  assert.ok(r.pct >= 90, `pct ${r.pct}`);
  assert.equal(r.grade, 'B');
  assert.equal(r.capped, true);
});
