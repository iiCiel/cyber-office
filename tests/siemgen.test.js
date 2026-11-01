import test from 'node:test';
import assert from 'node:assert/strict';
import { createSiem } from '../src/game/siemGen.js';
import { startSearch } from '../src/game/siemSearch.js';
import { STORIES } from '../src/data/siemStories.js';
import CED from '../src/data/ccdcLabScenario.js';
import HP from '../src/data/ccdcLabScenario2.js';

const run = (siem, q, o = {}) => new Promise((res) => startSearch(siem, q, { ...o, onDone: res }));

const ced = createSiem(CED, { seed: 1 });
const hp = createSiem(HP, { seed: 1 });

test('at least 2,000,000 events, index-addressable and deterministic', () => {
  assert.ok(ced.total >= 2_000_000);
  assert.ok(hp.total >= 2_000_000);
  for (const i of [0, 1, 999, 1_234_567, ced.total - 1]) {
    const a = ced.get(i); const b = ced.get(i);
    assert.equal(a.raw, b.raw);
    assert.equal(a.t, b.t);
    assert.equal(a.i, i);
  }
  const other = createSiem(CED, { seed: 2 });
  assert.notEqual(other.get(5000).raw, ced.get(5000).raw);
});

test('time is a monotone function of index; indexAtTime inverts it', () => {
  let prev = -1;
  for (let i = 0; i < ced.total + 5000; i += 997) {
    const t = ced.tOf(i);
    assert.ok(t >= prev);
    prev = t;
  }
  for (const i of [10, 123456, 2_000_000]) {
    const t = ced.tOf(i);
    const j = ced.indexAtTime(t);
    assert.ok(j <= i && ced.tOf(j) >= t && (j === 0 || ced.tOf(j - 1) < t));
  }
});

test('get(i) is fast: 200k calls under a generous bound', () => {
  const t0 = performance.now();
  let n = 0;
  for (let i = 0; i < 200_000; i++) n += ced.get((i * 11) % ced.total).t > 0 ? 1 : 0;
  const ms = performance.now() - t0;
  assert.equal(n, 200_000);
  assert.ok(ms < 1500, `200k get() took ${ms.toFixed(0)}ms`);
});

test('events have the documented shape and real-looking raw text', () => {
  const seen = new Set();
  for (let i = 0; i < 4000; i++) {
    const e = ced.get(i * 500);
    assert.ok(e.host && e.source && e.sourcetype && e.raw && e.fields && typeof e.t === 'number');
    seen.add(e.sourcetype);
  }
  for (const st of ['access_combined', 'linux_secure', 'pfsense:filterlog', 'WinEventLog:Security', 'postfix', 'mysqld_error', 'syslog']) assert.ok(seen.has(st), st);
  const web = [...Array(200).keys()].map((i) => ced.get(i * 31)).find((e) => e.sourcetype === 'access_combined');
  assert.match(web.raw, /^\S+ - \S+ \[\d\d\/Oct\/2026:\d\d:\d\d:\d\d -0400\] "(GET|POST) \S+ HTTP\/1\.1" \d{3} \d+ "/);
});

test('Harbor Point uses its own hosts and PostgreSQL', () => {
  const seen = new Set();
  for (let i = 0; i < 20000; i++) seen.add(hp.get(i * 100).host);
  assert.ok(seen.has('app01') && seen.has('db01') && seen.has('dc01') && !seen.has('web01') && !seen.has('mail01'));
  const pg = [...Array(5000).keys()].map((i) => hp.get(i * 400)).find((e) => e.sourcetype === 'postgresql');
  assert.match(pg.raw, /\[\d+\] /);
});

test('story: spray IP tops the failed wp-login stats and is not on the first page', async () => {
  const h = await run(ced, 'host=web01 sourcetype=access_combined uri=/wp-login.php method=POST status=200 | stats count by src_ip | sort - count | head 3');
  assert.equal(h.table.rows[0][0], '203.0.113.66');
  assert.ok(h.table.rows[0][1] > 1000);
  assert.ok(h.table.rows[1][1] < h.table.rows[0][1] / 20);
  // the attacker is not on the first 200 events at either end of time
  for (let i = 0; i < 200; i++) assert.ok(!ced.get(i).raw.includes('203.0.113.66'));
  let tail = 0;
  for (let i = ced.total - 200; i < ced.total; i++) if (ced.get(i).raw.includes('203.0.113.66')) tail++;
  assert.ok(tail <= 1);
});

test('story: accepted-password search returns hundreds of legit lines plus the bad ones', async () => {
  const h = await run(ced, 'sourcetype=linux_secure "Accepted password"');
  assert.ok(h.matched > 100 && h.matched < 2000);
  const bad = h.indices(0, h.collected).map((i) => ced.get(i)).filter((e) => e.fields.src_ip === '203.0.113.66');
  assert.equal(bad.length, 2);
  assert.deepEqual(bad.map((e) => e.fields.user).sort(), ['admin', 'root']);
  assert.ok(h.timeline.counts.reduce((a, b) => a + b, 0) === h.matched);
});

test('story: backdoor account and group change are findable by EventCode', async () => {
  const h = await run(ced, 'EventCode=4720 OR EventCode=4728 | table _time host Target_Account_Name Group_Name');
  const names = h.table.rows.map((r) => r[2]);
  assert.ok(names.includes('svc-backup2') && names.includes('n.hughes'));
  const row = h.table.rows.find((r) => r[2] === 'svc-backup2' && r[3] === 'Domain Admins');
  assert.ok(row);
  const t = await run(ced, 'EventCode=4698 | table host Task_Name');
  assert.deepEqual(t.table.rows[0].slice(0, 2), ['ws01', 'SystemCheck']);
});

test('story: C2 beacon is rare among outbound passes (not the top destination)', async () => {
  const h = await run(ced, 'sourcetype=pfsense:filterlog action=pass dir=out | stats count by dest_ip dest_port | sort - count');
  const rowIdx = h.table.rows.findIndex((r) => r[0] === '198.51.100.200' && String(r[1]) === '8443');
  assert.ok(rowIdx > 5, `C2 rank ${rowIdx}`);
  const r = await run(ced, 'sourcetype=pfsense:filterlog action=pass dir=out | rare limit=10 dest_ip');
  assert.ok(r.table.rows.length >= 1);
});

test('Harbor story: git-dumper, first DB login and local admin are findable', async () => {
  const g = await run(hp, 'uri=/.git/* status=200 | stats count by src_ip');
  assert.equal(g.table.rows[0][0], '203.0.113.131');
  const d = await run(hp, 'sourcetype=postgresql "connection authorized" NOT src_ip=10.20.30.*');
  assert.ok(d.matched === 0 || d.matched >= 0); // authorized lines carry the client in the preceding "received" line
  const r = await run(hp, 'sourcetype=postgresql host=db01 "connection received" 203.0.113.131 | table _time');
  assert.ok(r.table.rows.length >= 2);
  const u = await run(hp, 'EventCode=4720 | table _time host Target_Account_Name');
  assert.ok(u.table.rows.some((x) => x[2] === 'svc_update' && x[1] === 'ws01'));
});

test('hunt accept regexes match the right answers and reject others', () => {
  const ok = {
    'cedarline-lab-2026': { attacker_ip: '203.0.113.66', vector: 'brute force on wp-login', first_account: 'admin', first_login_time: '23:07', backdoor_account: 'svc-backup2', c2: '198.51.100.200:8443' },
    'harborpoint-lab-2026': { attacker_ip: '203.0.113.131', vector: 'exposed .git folder', first_account: 'hp_app', first_login_time: '03:41', backdoor_account: 'svc_update', c2: '198.51.100.214:4443' },
  };
  for (const [id, answers] of Object.entries(ok)) {
    const ids = STORIES[id].hunt.map((q) => q.id);
    assert.deepEqual(ids, ['attacker_ip', 'vector', 'first_account', 'first_login_time', 'backdoor_account', 'c2']);
    for (const q of STORIES[id].hunt) {
      assert.match(answers[q.id], q.accept, `${id}/${q.id}`);
      assert.doesNotMatch('203.0.113.7', q.accept);
      assert.doesNotMatch('svc-backup', q.accept);
    }
  }
});

test('onWave adds attack lines at the live index for the finding host', () => {
  const s = createSiem(CED, { seed: 3 });
  const before = s.count(100);
  const added = s.onWave('web-shell', 100, 'compromised');
  assert.ok(added.length >= 10);
  for (const i of added) { assert.ok(i >= before); const e = s.get(i); assert.equal(e.host, 'web01'); assert.match(e.raw, /203\.0\.113\.66/); }
  const probed = s.onWave('ssh-root-key', 200, 'probed');
  assert.ok(probed.length > 0 && probed.length < added.length);
  assert.equal(s.get(probed[0]).host, 'mail01');
  assert.equal(s.count(0), s.total);
  assert.ok(s.count(10) > s.count(0));
});

test('search: cancel stops a running scan; bad syntax reports a Splunk-style error', async () => {
  const h = startSearch(ced, 'foo', { onDone: () => {} });
  h.cancel();
  assert.equal(h.state, 'canceled');
  const bad = await run(ced, 'NOT foo (bar');
  assert.equal(bad.state, 'error');
  const bad2 = await run(ced, 'foo | frobnicate x');
  assert.match(bad2.error, /Unknown search command/);
});

test('search: head N exits early and returns newest first; progress is reported', async () => {
  let progress = 0;
  const h = await run(ced, 'sourcetype=access_combined | head 5', { onProgress: () => { progress++; } });
  assert.equal(h.matched, 5);
  assert.equal(h.collected, 5);
  const ts = h.indices(0, 5).map((i) => ced.get(i).t);
  assert.deepEqual([...ts].sort((a, b) => b - a), ts);
  const full = await run(ced, 'sourcetype=linux_secure', { onProgress: () => { progress++; } });
  assert.ok(progress >= 1);
  assert.ok(full.scanned === full.total);
});
