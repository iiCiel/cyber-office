import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEdit, isEdit } from '../src/game/ccdcEdit.js';
import { CCDC_LAB } from '../src/data/ccdcLabScenario.js';
import { CCDC_LAB_2 } from '../src/data/ccdcLabScenario2.js';
import { newGame, runLine } from '../src/game/ccdcLab.js';

const mk = () => ({ '/etc/ssh/sshd_config': 'Port 22\nPermitRootLogin yes\n', '/root/.ssh/authorized_keys': 'ssh-ed25519 AAAA redteam@h\nssh-ed25519 BBBB admin@h\n', '/tmp/a.txt': 'x\n', '/var/www/d/f1': '1', '/var/www/d/f2': '2' });

test('isEdit recognises editing commands and not inspection', () => {
  for (const c of ['rm x', "sed -i 's/a/b/' f", 'echo y >> f', 'echo y > f', 'tee f', 'nano f', 'truncate -s 0 f']) assert.ok(isEdit(c), c);
  for (const c of ['cat f', 'ls -la', 'grep x f', 'sed s/a/b/ f']) assert.ok(!isEdit(c), c);
});

test('sed -i does an in-place substitution that cat would then show', () => {
  const fs = mk();
  const r = applyEdit(fs, "sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config");
  assert.ok(r.handled && !r.error);
  assert.match(fs['/etc/ssh/sshd_config'], /PermitRootLogin no/);
});

test('sed -i /pattern/d deletes the matching line', () => {
  const fs = mk();
  applyEdit(fs, "sed -i '/redteam@/d' /root/.ssh/authorized_keys");
  assert.ok(!/redteam@/.test(fs['/root/.ssh/authorized_keys']));
  assert.match(fs['/root/.ssh/authorized_keys'], /admin@h/);
});

test('echo append and overwrite change the file', () => {
  const fs = mk();
  applyEdit(fs, "echo 'hello world' >> /tmp/a.txt");
  assert.match(fs['/tmp/a.txt'], /hello world/);
  applyEdit(fs, "echo 'only' > /tmp/a.txt");
  assert.equal(fs['/tmp/a.txt'], 'only\n');
});

test('rm deletes a file; rm -r deletes a folder; errors are reported', () => {
  const fs = mk();
  assert.ok(applyEdit(fs, 'rm /tmp/a.txt').handled);
  assert.equal(fs['/tmp/a.txt'], undefined);
  applyEdit(fs, 'rm -rf /var/www/d');
  assert.equal(fs['/var/www/d/f1'], undefined);
  const r = applyEdit(fs, 'rm /nope');
  assert.ok(r.error);
});

test('editing is live end-to-end: edit sshd_config on mail01, then cat shows the change', () => {
  const s = newGame(CCDC_LAB, { seed: 1 });
  runLine(s, 'mail01', "sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config");
  const out = runLine(s, 'mail01', 'cat /etc/ssh/sshd_config').lines.map((l) => l.text).join('\n');
  assert.match(out, /PermitRootLogin no/, 'cat reflects the in-place edit');
});

test('editing is live end-to-end: removing the planted key on mail01 is visible via cat', () => {
  const s = newGame(CCDC_LAB, { seed: 1 });
  runLine(s, 'mail01', "sed -i '/redteam@/d' /root/.ssh/authorized_keys");
  const out = runLine(s, 'mail01', 'cat /root/.ssh/authorized_keys').lines.map((l) => l.text).join('\n');
  assert.ok(!/redteam@/.test(out), 'the planted key is gone from the file');
});

test('editing does not leak between games (fresh fs each round)', () => {
  const a = newGame(CCDC_LAB_2, { seed: 1 });
  runLine(a, 'app01', 'rm -rf /var/www/portal/.git');
  const b = newGame(CCDC_LAB_2, { seed: 1 });
  const out = runLine(b, 'app01', 'cat /var/www/portal/.git/config').lines.map((l) => l.text).join('\n');
  assert.match(out, /credential|helper|core/i, 'a new game starts with an un-edited filesystem');
});
