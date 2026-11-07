import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shiftHandoff } from '../src/days/handoff.js';
import { loadDay } from '../src/days/index.js';

test('Days 2-5 open with the MDR overnight handoff, built from that night\'s real log facts', async () => {
  const facts = {
    2: { log: '../src/days/day2/logs.js', must: ['198.51.100.77', 'm.chen', '06:40'] },
    3: { log: '../src/days/day3/logs.js', must: ['198.51.100.23', '/admin/export?table=customers', 'DetectionOnly'] },
    4: { log: '../src/days/day4/logs.js', must: ['svc_backup', '172.16.0.91', 'g.api.mega.co.nz', '4,512,331,904', 'Sun Oct 18 02:41'] },
    5: { log: '../src/days/day5/logs.js', must: ['vssadmin delete shadows /all /quiet', 'Updater', '03:45'] },
  };
  for (const [n, f] of Object.entries(facts)) {
    const e = shiftHandoff(Number(n));
    const text = e.body.join('\n');
    for (const m of f.must) assert.ok(text.includes(m), `day ${n} handoff mentions ${m}`);
    for (const sec of ['SHIFT SUMMARY', 'OPEN / FOR DAY SHIFT', 'CLOSED THIS SHIFT']) assert.ok(text.includes(sec), `day ${n} has ${sec}`);
    assert.equal(e.phish, false);
    assert.ok(e.headers.some((h) => /dmarc=pass header.from=northgatemdr\.com/.test(h)));
    let all = ''; // that day's logs plus earlier days (the watchlist may name an earlier attacker)
    for (const k of Object.keys(facts).filter((k) => Number(k) <= Number(n))) {
      const { generateLogs } = await import(facts[k].log);
      all += generateLogs({ nowMinutes: 24 * 60 }).map((x) => x.raw || x.msg).join('\n');
    }
    for (const ip of text.match(/\b\d+\.\d+\.\d+\.\d+\b/g) || []) assert.ok(all.includes(ip), `day ${n}: ${ip} is in the logs up to that day`);
  }
  assert.match(shiftHandoff(5, { d4Contained: true }).body.join('\n'), /admin_helpdesk/);
  assert.equal(shiftHandoff(1), null);
});

test('The handoff is the first email in the inbox on Days 2-5, and not on Day 1', () => {
  for (const n of [2, 3, 4, 5]) assert.equal(loadDay(n, { campaign: { carry: {} } }).emails[0].id, 'handoff');
  assert.ok(!loadDay(1, { campaign: { carry: {} } }).emails.some((e) => e.id === 'handoff'));
});
