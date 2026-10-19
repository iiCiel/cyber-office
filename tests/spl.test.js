import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSearch, fieldSummary, histogram, getField } from '../src/game/spl.js';
import { generateLogs } from '../src/days/day1/logs.js';
import { generateLogs as day3 } from '../src/days/day3/logs.js';

const logs = generateLogs({ nowMinutes: 600 });

test('plain words still work, all must match, -word and NOT exclude', () => {
  assert.equal(runSearch('185.220.101.47 4624', logs).events.length, 1);
  assert.equal(runSearch('j.alvarez 4625', logs).events.length, 38);
  const withOut = runSearch('4625 NOT 185.220.101.47', logs).events.length;
  assert.equal(runSearch('4625', logs).events.length - 38, withOut);
  assert.equal(runSearch('4625 -185.220.101.47', logs).events.length, withOut);
});

test('field=value, wildcards, OR, parentheses, comparison', () => {
  assert.equal(runSearch('EventCode=4625 Account_Name=j.alvarez', logs).events.length, 38);
  assert.equal(runSearch('index=wineventlog EventCode=4624 Logon_Type=2', logs).events.length > 0, true);
  assert.equal(runSearch('sourcetype=linux_secure', logs).events.every((e) => e.source === 'sshd'), true);
  const a = runSearch('src_ip=185.220.101.* EventCode=4625', logs).events.length;
  assert.equal(a, 38);
  const either = runSearch('(EventCode=4624 OR EventCode=4625) Account_Name=j.alvarez', logs).events.length;
  assert.ok(either >= 39);
  const web = day3({ nowMinutes: 600 });
  assert.ok(runSearch('sourcetype=access_combined bytes>1000000', web).events.length >= 3);
});

test('stats, top, table, sort, head, dedup', () => {
  const r = runSearch('EventCode=4625 | stats count by src_ip | sort - count', logs);
  assert.equal(r.error, null);
  assert.equal(r.table.rows[0].count >= 38, true);
  assert.deepEqual(r.table.columns, ['src_ip', 'count']);
  const t = runSearch('sourcetype=linux_secure | top limit=2 src_ip', logs);
  assert.equal(t.table.rows.length, 2);
  assert.ok(t.table.rows[0].percent > 0);
  const tb = runSearch('EventCode=4624 | table _time Account_Name | head 3', logs);
  assert.equal(tb.table.rows.length, 3);
  const dc = runSearch('EventCode=4625 | stats dc(src_ip) as ips count', logs);
  assert.equal(dc.table.rows[0].count, runSearch('EventCode=4625', logs).events.length);
  const dd = runSearch('EventCode=4625 | dedup src_ip', logs);
  assert.ok(dd.events.length < 38 + 5);
});

test('errors read like Splunk', () => {
  assert.match(runSearch('4625 | frobnicate x', logs).error, /Unknown search command 'frobnicate'/);
  assert.match(runSearch('(4625', logs).error, /parenthes/i);
});

test('sidebar summary and timeline', () => {
  const f = fieldSummary(runSearch('EventCode=4625', logs).events);
  assert.ok(f.find((x) => x.name === 'Account_Name'));
  const h = histogram(logs, 24);
  assert.ok(h.buckets.length > 1 && h.buckets.length <= 24 + 1);
  assert.equal(h.buckets.reduce((a, b) => a + b.count, 0), logs.length);
});

test('getField is case-insensitive and knows the built-ins', () => {
  const e = logs.find((x) => x.key === 'success');
  assert.deepEqual(getField(e, 'EVENTCODE'), ['4624']);
  assert.deepEqual(getField(e, 'host'), ['dc01']);
  assert.equal(getField(e, 'sourcetype')[0], 'WinEventLog:Security');
});
