import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, tokenize } from '../src/game/shell.js';

const log = [
  '198.51.100.23 - - [21/Oct/2026:03:10:01 -0400] "GET /api/claims?id=CLM-10001[REDACTED-SQL-40-chars] HTTP/1.1" 500 312 "-" "python-requests/2.32.3"',
  '10.0.4.51 - - [21/Oct/2026:08:30:00 -0400] "GET /claims/status HTTP/1.1" 200 1840 "-" "Mozilla/5.0"',
  '198.51.100.23 - - [21/Oct/2026:03:12:44 -0400] "GET /api/claims?id=CLM-10001[REDACTED-SQL-118-chars] HTTP/1.1" 200 1843221 "-" "python-requests/2.32.3"',
  '10.0.4.51 - - [21/Oct/2026:08:31:00 -0400] "GET /claims/status HTTP/1.1" 200 1840 "-" "Mozilla/5.0"',
].join('\n') + '\n';

const ctx = (extra = {}) => ({
  cwd: '/home/analyst01',
  fs: { '/var/log/remote/web01/nginx/access.log': log, '/home/analyst01/notes.txt': 'hello\n' },
  whois: { '198.51.100.23': 'OrgName: Bulletproof Hosting Ltd' },
  dns: { 'evil.example': 'Name: evil.example\nAddress: 198.51.100.23' },
  ...extra,
});
const A = '/var/log/remote/web01/nginx/access.log';

test('tokenize respects quotes', () => {
  assert.deepEqual(tokenize(`cut -d ' ' -f 1 "a b.log"`), ['cut', '-d', ' ', '-f', '1', 'a b.log']);
});

test('grep finds the attack requests and counts them', () => {
  assert.equal(run(`grep -c REDACTED ${A}`, ctx()).out, '2\n');
  assert.equal(run(`grep -i redacted ${A} | grep 1843221 | wc -l`, ctx()).out, '1\n');
  assert.equal(run(`grep -v 198.51.100.23 ${A} | wc -l`, ctx()).out, '2\n');
});

test('top talkers pipeline: cut | sort | uniq -c | sort -rn | head', () => {
  const out = run(`cut -d ' ' -f 1 ${A} | sort | uniq -c | sort -rn | head -n 1`, ctx()).out;
  assert.match(out, /^\s+2 (10\.0\.4\.51|198\.51\.100\.23)\n$/);
});

test("awk '{print $1}' and sort -n on a byte column", () => {
  assert.equal(run(`awk '{print $1}' ${A} | sort | uniq | wc -l`, ctx()).out, '2\n');
  const biggest = run(`awk '{print $10}' ${A} | sort -n | tail -n 1`, ctx()).out;
  assert.equal(biggest, '1843221\n');
});

test('ls, cd, cat, relative paths', () => {
  assert.equal(run('ls /var/log/remote', ctx()).out, 'web01/\n');
  const c = run('cd /var/log/remote/web01/nginx', ctx());
  assert.equal(c.cwd, '/var/log/remote/web01/nginx');
  assert.equal(run('head -n 1 access.log', ctx({ cwd: c.cwd })).out.split(' ')[0], '198.51.100.23');
  assert.equal(run('cat notes.txt', ctx()).out, 'hello\n');
});

test('whois and nslookup use the day data', () => {
  assert.match(run('whois 198.51.100.23', ctx()).out, /Bulletproof/);
  assert.match(run('nslookup evil.example', ctx()).out, /198\.51\.100\.23/);
  assert.match(run('nslookup nope.example', ctx()).out, /NXDOMAIN/);
});

test('helpful errors, never throws', () => {
  assert.match(run('rm -rf /', ctx()).out, /read-only/);
  assert.match(run('frobnicate', ctx()).out, /command not found/);
  assert.match(run('cat nope.txt', ctx()).out, /No such file/);
  assert.match(run('grep', ctx()).out, /usage/);
  assert.match(run('echo "unterminated', ctx()).out, /unterminated/);
  assert.match(run('cat |', ctx()).out, /syntax error/);
});

test('grep -r searches a whole folder and prefixes paths; -l lists files; -ri works', () => {
  const fs = {
    '/mnt/share/IT/scripts/a.ps1': 'Write-Host hi\n',
    '/mnt/share/IT/scripts/pam-sync.ps1': '$User = "admin"\n$Password = "x"\n',
    '/mnt/share/IT/old/b.ps1': '# password rotated\n',
  };
  const c = { cwd: '/mnt/share', fs };
  assert.equal(run('grep -r Password IT/scripts', c).out, 'IT/scripts/pam-sync.ps1:$Password = "x"\n');
  assert.equal(run('grep -ril password .', c).out, 'IT/old/b.ps1\nIT/scripts/pam-sync.ps1\n');
  assert.equal(run('grep -rc -i password /mnt/share', c).out, '2\n');
  assert.match(run('grep password IT', c).out, /Is a directory/);
});
