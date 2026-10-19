import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../src/game/shell.js';

const CT = JSON.stringify({ Records: [
  { eventName: 'ListBuckets', sourceIPAddress: '203.0.113.17', userIdentity: { type: 'AssumedRole', arn: 'arn:aws:sts::1:assumed-role/waf/i-1' } },
  { eventName: 'GetObject', sourceIPAddress: '203.0.113.17', userIdentity: { type: 'AssumedRole' } },
  { eventName: 'ListBuckets', sourceIPAddress: '10.0.0.5', userIdentity: { type: 'IAMUser', userName: 'ops' } },
] }, null, 2);
const ACCESS = [
  '198.51.100.23 - - [21/Oct/2026:02:10:05 -0400] "GET /api/claims?id=1 HTTP/1.1" 500 312 "-" "python-requests/2.32.3"',
  '198.51.100.23 - - [21/Oct/2026:02:10:20 -0400] "GET /api/claims?id=2 HTTP/1.1" 200 1843221 "-" "python-requests/2.32.3"',
  '192.0.2.10 - - [21/Oct/2026:06:00:01 -0400] "GET / HTTP/1.1" 200 5120 "-" "Mozilla/5.0"',
].join('\n') + '\n';
const ctx = { fs: { '/home/analyst01/ct.json': CT, '/var/log/access.log': ACCESS, '/var/log/a/b.json': '{}', '/var/log/a/c.txt': 'x' }, cwd: '/home/analyst01' };
const sh = (l, c = ctx) => run(l, c).out;

test('jq: iterate, select, project, raw output, compact', () => {
  assert.equal(sh("jq -r '.Records[] | select(.eventName==\"ListBuckets\") | .sourceIPAddress' ct.json"), '203.0.113.17\n10.0.0.5\n');
  assert.equal(sh("jq '.Records | length' ct.json"), '3\n');
  assert.equal(sh("jq -c '.Records[0] | {e: .eventName, ip: .sourceIPAddress}' ct.json"), '{"e":"ListBuckets","ip":"203.0.113.17"}\n');
  assert.equal(sh("jq -r '.Records[].userIdentity.type' ct.json | sort | uniq -c").trim().split('\n').length, 2);
  assert.match(sh("jq '.Records[0].userIdentity.arn' ct.json"), /assumed-role/);
  assert.match(sh("jq '.nope.nope[' ct.json"), /syntax error|compile error/);
  assert.equal(sh("jq '.Records | map(.eventName) | unique' ct.json"), '[\n  "GetObject",\n  "ListBuckets"\n]\n');
});

test('awk: columns, -F, conditions, sums and arrays', () => {
  assert.equal(sh("awk '{print $1}' /var/log/access.log | sort | uniq -c | sort -rn | head -1").trim(), '2 198.51.100.23');
  assert.equal(sh("awk '$9 == 200 {print $7}' /var/log/access.log"), '/api/claims?id=2\n/\n');
  assert.equal(sh("awk '{s += $10} END {print s}' /var/log/access.log"), '1848653\n');
  assert.equal(sh("awk -F'\"' '{print $6}' /var/log/access.log | sort -u").trim().split('\n').length, 2);
  assert.equal(sh("awk '{c[$1]++} END {for (k in c) print k, c[k]}' /var/log/access.log | sort").trim(), '192.0.2.10 1\n198.51.100.23 2');
  assert.equal(sh("awk '/python/ && $10 > 1000 {print NR, $1}' /var/log/access.log"), '2 198.51.100.23\n');
  assert.equal(sh("awk '{print $1, $7}' /var/log/access.log | head -1"), '198.51.100.23 /api/claims?id=1\n');
});

test('sed, tr, base64, find', () => {
  assert.equal(sh("echo hello world | sed 's/world/there/'"), 'hello there\n');
  assert.equal(sh("echo abc abc | sed 's/b/X/g'"), 'aXc aXc\n');
  assert.equal(sh("echo Hello | tr 'A-Z' 'a-z'"), 'hello\n');
  assert.equal(sh('echo aGVsbG8gd29ybGQ= | base64 -d'), 'hello world\n');
  assert.equal(sh('echo hello | base64'), 'aGVsbG8=\n');
  assert.equal(sh('find /var/log -name "*.json"'), '/var/log/a/b.json\n');
});

test('cases can add their own commands', () => {
  const r = run('aws sts get-caller-identity', { ...ctx, commands: { aws: (a) => `{"args":"${a.join(' ')}"}\n` } });
  assert.equal(r.out, '{"args":"sts get-caller-identity"}\n');
  assert.match(sh('aws s3 ls'), /command not found/);
});
