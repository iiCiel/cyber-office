// Coworker dialogue: conversation trees stay wired up after the rewrite, scored outcomes are unchanged,
// and the lines use the SOC/IT details the rest of the game uses (ticket numbers, handoff tickets).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PHONE_CALL, USB_DROP } from '../src/days/day1/talk.js';
import { MIKE_CONFESSES } from '../src/days/day2/talk.js';
import { THEO_WAF } from '../src/days/day3/talk.js';
import { CARLA_CALL } from '../src/days/day4/talk.js';
import { loadDay } from '../src/days/index.js';

const TREES = { PHONE_CALL, USB_DROP, MIKE_CONFESSES, THEO_WAF, CARLA_CALL };
const OUTCOMES = {
  PHONE_CALL: ['reset', 'reset-after-id', 'callback-verified', 'reset-under-pressure', 'refused-process'],
  USB_DROP: ['plugged', 'handed-to-soc', 'trashed'],
  MIKE_CONFESSES: ['supportive', 'blamed', 'dismissed'],
  THEO_WAF: ['disabled', 'change-request', 'escalated'],
  CARLA_CALL: ['callback', 'domain', 'reply', 'paid'],
};

for (const [name, tree] of Object.entries(TREES)) {
  test(`${name}: every choice leads to a node, every path ends, outcomes unchanged`, () => {
    const seen = new Set();
    const walk = (id, depth) => {
      assert.ok(tree[id], `${name}: missing node ${id}`);
      assert.ok(depth < 10, `${name}: loop at ${id}`);
      const n = tree[id];
      for (const [who, lines] of n.say) {
        assert.ok(who && lines.length, `${name}.${id}: empty speech`);
        for (const l of lines) assert.ok(l.length <= 180, `${name}.${id}: line too long for the dialog box: ${l}`);
      }
      if (n.end) return;
      for (const c of n.choices) {
        if (c.set?.outcome) seen.add(c.set.outcome);
        walk(c.next, depth + 1);
      }
    };
    walk('start', 0);
    assert.deepEqual([...seen].sort(), [...OUTCOMES[name]].sort());
  });
}

test('morning briefings reference real tickets and the overnight handoff', () => {
  const st = { minutes: 9 * 60, campaign: { carry: {} }, events: [], phishedAt: () => null };
  const priya = (d) => loadDay(d, { ...st, day: d }).npcLines.priya.talk.join(' ');
  assert.match(priya(2), /INC0004512/);
  assert.match(priya(2), /handoff/);
  assert.match(priya(3), /NGM-48288/);
  assert.match(priya(4), /NGM-48341/);
  assert.match(priya(5), /NGM-48402/);
});

test('each coworker sounds different: no line is shared between two speakers on a day', () => {
  for (const d of [1, 2, 3, 4, 5]) {
    const lines = loadDay(d, { day: d, minutes: 540, campaign: { carry: {} }, events: [], phishedAt: () => null }).npcLines;
    const all = Object.values(lines).flatMap((n) => [...n.talk, ...(n.again || [])]);
    assert.equal(new Set(all).size, all.length, `day ${d} repeats a line`);
  }
});

test('Carla agrees with what the inbox shows: the Northwind email carries the external banner', async () => {
  const { EMAILS } = await import('../src/days/day4/emails.js');
  const bec = EMAILS.find((e) => e.id === 'bec-bank');
  assert.equal(bec.external, true, 'the Northwind email is external, so MailApp shows the CAUTION banner');
  const said = CARLA_CALL.start.say.flatMap(([, l]) => l).join(' ');
  assert.ok(!/no external/i.test(said), 'Carla must not say the email had no external warning');
  assert.match(said, /external banner/i);
});
