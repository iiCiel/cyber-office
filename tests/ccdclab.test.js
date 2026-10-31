import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CCDC_LAB } from '../src/data/ccdcLabScenario.js';
import {
  newGame, runLine, runRedTeam, score, progress, expire, answerInject,
  rolesFor, devicesForRole, injectsForRole, ROLES, MODES, SERVICE_STATE,
} from '../src/game/ccdcLab.js';

const SCOPED = ['pass tcp to web01 port 80', 'pass tcp to web01 port 443', 'pass any to dc01 port 53', 'pass tcp to mail01 port 25', 'pass tcp to mail01 port 143', 'pass tcp to mail01 port 993', 'pass tcp to db01 port 3306 from scoring'];
// Rubric-complete inject answers (what a strong captain actually writes).
export const GOOD_INJECTS = {
  'inv-memo': 'edge-fw 203.0.113.2 pfSense firewall; dc01 10.10.10.10 Windows Server 2019 domain controller + DNS; web01 10.10.10.20 Ubuntu Apache/WordPress web; db01 10.10.10.40 Ubuntu MySQL database; mail01 10.10.10.30 Ubuntu Postfix mail (SMTP/IMAP).',
  'new-user': 'Create a standard domain user with New-ADUser, temporary password with change at next logon, add only to the Accounting group. Least privilege: not a Domain Admin and no local admin.',
  'vendor-ftp': 'We will not open plaintext FTP (credentials cross the internet unencrypted). Instead we offer SFTP on port 22 to a dedicated, chrooted upload-only account, allow-listed to your source IP address.',
  'incident-report': 'At 09:20 this morning we found a web shell (stats.php) on web01, the WordPress web server, re-run by a root cron. We removed the file and the crontab entry. Recommend blocking PHP execution in uploads to prevent recurrence.',
  pcr: 'PCR: rotate the ccdc-scorecheck password on db01 during the 10:30-10:35 window. Rollback: revert to the old password. The new credential is handed to the white team before the change.',
};

const fresh = (opts = {}) => newGame(CCDC_LAB, { seed: 1, ...opts });
const svcState = (s, id) => s.services[id].state;
const fixed = (s, id) => s.findings[id].status === 'fixed';

test('a fresh game starts with every scored service UP and nothing fixed', () => {
  const s = fresh();
  for (const id of ['web01', 'dc01', 'mail01', 'db01']) assert.equal(svcState(s, id), SERVICE_STATE.UP);
  assert.equal(progress(s).fixed, 0);
});

test('inspection commands reach the real bash engine (cat shows the real file)', () => {
  const s = fresh();
  const r = runLine(s, 'web01', 'cat /var/www/html/wp-config.php');
  const text = r.lines.map((l) => l.text).join('\n');
  assert.match(text, /DB_HOST/);
  assert.match(text, /10\.10\.10\.40/);
});

test('inspection reaches the real PowerShell engine (Get-ADGroupMember lists the rogue admin)', () => {
  const s = fresh();
  const r = runLine(s, 'dc01', "Get-ADGroupMember 'Domain Admins'");
  const text = r.lines.map((l) => l.text).join('\n');
  assert.match(text, /svc-backup2/);
});

test('Get-SmbServerConfiguration (custom cmdlet) shows SMBv1 enabled', () => {
  const s = fresh();
  const r = runLine(s, 'dc01', 'Get-SmbServerConfiguration');
  assert.match(r.lines.map((l) => l.text).join('\n'), /EnableSMB1Protocol\s*:\s*True/);
});

test('the correct wp-cli command fixes the default-password finding', () => {
  const s = fresh();
  const r = runLine(s, 'web01', "wp user update admin --user_pass 'Xk7#freightLANE!'");
  assert.equal(r.effects.fixed, 'web-admin-default');
  assert.ok(fixed(s, 'web-admin-default'));
});

test('the web shell needs BOTH the file and the cron removed (multi-step fix)', () => {
  const s = fresh();
  let r = runLine(s, 'web01', 'rm /var/www/html/wp-content/uploads/2026/10/stats.php');
  assert.equal(r.effects.stepId, 'rm-file');
  assert.ok(!fixed(s, 'web-shell'), 'not fixed after only removing the file');
  r = runLine(s, 'web01', 'crontab -r');
  assert.equal(r.effects.fixed, 'web-shell');
  assert.ok(fixed(s, 'web-shell'));
});

test('removing the wrong upload (invoice.pdf) is a trap, not the fix', () => {
  const s = fresh();
  const r = runLine(s, 'web01', 'rm /var/www/html/wp-content/uploads/2026/10/invoice.pdf');
  assert.equal(r.effects.trapId, 'file-only');
  assert.ok(!fixed(s, 'web-shell'));
});

test('removing svc-backup2 fixes the rogue admin; targeting svc-backup is the trap', () => {
  const s = fresh();
  const trap = runLine(s, 'dc01', "Remove-ADGroupMember -Identity 'Domain Admins' -Members svc-backup -Confirm:$false");
  assert.equal(trap.effects.trapId, 'wrong-account');
  assert.ok(!fixed(s, 'rogue-da'));
  const step = runLine(s, 'dc01', 'Disable-ADAccount -Identity svc-backup2');
  assert.equal(step.effects.stepId, 'disable');
  assert.ok(!fixed(s, 'rogue-da'), 'disabling alone leaves it in Domain Admins');
  const ok = runLine(s, 'dc01', "Remove-ADGroupMember -Identity 'Domain Admins' -Members svc-backup2 -Confirm:$false");
  assert.equal(ok.effects.fixed, 'rogue-da');
});

test('disabling SMBv1 with the no-reboot setting fixes it; a reboot drops DNS', () => {
  const s = fresh();
  const ok = runLine(s, 'dc01', 'Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force');
  assert.equal(ok.effects.fixed, 'smbv1-dc');
  const s2 = fresh();
  const trap = runLine(s2, 'dc01', 'Restart-Computer -Force');
  assert.deepEqual(trap.effects.dropped, ['dc01']);
  assert.equal(svcState(s2, 'dc01'), SERVICE_STATE.DOWN);
});

test('postconf fixes the open relay; blocking port 25 drops mail', () => {
  const s = fresh();
  const ok = runLine(s, 'mail01', 'postconf -e "mynetworks=10.10.10.0/24, 127.0.0.0/8"');
  assert.equal(ok.effects.fixed, 'mail-open-relay');
  const s2 = fresh();
  const trap = runLine(s2, 'mail01', 'ufw deny 25');
  assert.deepEqual(trap.effects.dropped, ['mail01']);
});

test('MySQL: strong password + source-restricted firewall fixes it; denying 3306 drops db + web', () => {
  const s = fresh();
  runLine(s, 'db01', "mysql -e \"ALTER USER 'root'@'localhost' IDENTIFIED BY 'S9!cedarDBpw'\"");
  assert.ok(!fixed(s, 'mysql-exposed'), 'one step is not enough');
  const r = runLine(s, 'db01', 'ufw allow from 10.10.10.0/24 to any port 3306');
  assert.equal(r.effects.fixed, 'mysql-exposed');

  const s2 = fresh();
  const trap = runLine(s2, 'db01', 'ufw deny 3306');
  assert.equal(svcState(s2, 'db01'), SERVICE_STATE.DOWN);
  assert.equal(svcState(s2, 'web01'), SERVICE_STATE.DOWN);
});

// --- firewall rule editor ---------------------------------------------------

test('firewall: default-block BEFORE allow rules drops all four services; allow-then-block restores them', () => {
  const s = fresh();
  // The classic self-inflicted wound: remove the permit-any-any, then deny by default before adding allows.
  runLine(s, 'edge-fw', 'del 1');
  let r = runLine(s, 'edge-fw', 'default block');
  assert.equal(svcState(s, 'web01'), SERVICE_STATE.DOWN);
  assert.equal(svcState(s, 'dc01'), SERVICE_STATE.DOWN);
  assert.equal(svcState(s, 'mail01'), SERVICE_STATE.DOWN);
  assert.equal(svcState(s, 'db01'), SERVICE_STATE.DOWN);
  assert.ok(!fixed(s, 'firewall-anyany'));
  // Now add the allow rules — services come back as each port is permitted.
  runLine(s, 'edge-fw', 'pass tcp to web01 port 80 from any');
  runLine(s, 'edge-fw', 'pass tcp to web01 port 443 from any');
  assert.equal(svcState(s, 'web01'), SERVICE_STATE.UP);
  runLine(s, 'edge-fw', 'pass udp to dc01 port 53 from any');
  runLine(s, 'edge-fw', 'pass tcp to mail01 port 25 from any');
  runLine(s, 'edge-fw', 'pass tcp to mail01 port 143 from any');
  runLine(s, 'edge-fw', 'pass tcp to mail01 port 993 from any');
  r = runLine(s, 'edge-fw', 'pass tcp to db01 port 3306 from 198.51.100.9');
  assert.equal(r.effects.fixed, 'firewall-anyany');
  for (const id of ['web01', 'dc01', 'mail01', 'db01']) assert.equal(svcState(s, id), SERVICE_STATE.UP);
});

test('firewall: allow-then-deny (the correct order) never drops a service', () => {
  const s = fresh();
  // Remove the wide-open any-any rule, add scoped allows, THEN default block.
  runLine(s, 'edge-fw', 'del 1');
  runLine(s, 'edge-fw', 'pass tcp to web01 port 80');
  runLine(s, 'edge-fw', 'pass tcp to web01 port 443');
  runLine(s, 'edge-fw', 'pass any to dc01 port 53');
  runLine(s, 'edge-fw', 'pass tcp to mail01 port 25');
  runLine(s, 'edge-fw', 'pass tcp to mail01 port 143');
  runLine(s, 'edge-fw', 'pass tcp to mail01 port 993');
  runLine(s, 'edge-fw', 'pass tcp to db01 port 3306 from scoring');
  const r = runLine(s, 'edge-fw', 'default block');
  assert.equal(r.effects.fixed, 'firewall-anyany');
  assert.equal(s.services.web01.drops, 0, 'no SLA drops when done in the right order');
});

// Loophole helpers: build a rule set that keeps every service up but leaves something open.
const fwWith = (rules) => {
  const s = fresh();
  runLine(s, 'edge-fw', 'del 1');
  for (const r of rules) runLine(s, 'edge-fw', r);
  const last = runLine(s, 'edge-fw', 'default block');
  return { s, last };
};

test('firewall loophole: "pass any to any port 1-65535" + default block is NOT hardened', () => {
  const { s, last } = fwWith(['pass any to any port 1-65535']);
  assert.ok(!fixed(s, 'firewall-anyany'));
  assert.ok(last.lines.some((l) => /Not hardened yet/.test(l.text)), 'the editor says why');
});

test('firewall loophole: "pass tcp/udp to any port any" + default block is NOT hardened', () => {
  const { s } = fwWith(['pass tcp to any port any', 'pass udp to any port any']);
  assert.ok(!fixed(s, 'firewall-anyany'));
  for (const id of ['web01', 'dc01', 'mail01', 'db01']) assert.equal(svcState(s, id), SERVICE_STATE.UP);
});

test('firewall loophole: a whole-host or wide-range pass rule is NOT hardened', () => {
  assert.ok(!fixed(fwWith([...SCOPED, 'pass tcp to web01 port any']).s, 'firewall-anyany'));
  assert.ok(!fixed(fwWith([...SCOPED, 'pass tcp to mail01 port 1-1024']).s, 'firewall-anyany'));
  assert.ok(!fixed(fwWith([...SCOPED, 'pass tcp to dc01 port 3389']).s, 'firewall-anyany'));
});

test('firewall: MySQL 3306 must be scoped "from" the scoring engine', () => {
  const unscoped = SCOPED.map((r) => (r.includes('3306') ? 'pass tcp to db01 port 3306' : r));
  const a = fwWith(unscoped);
  assert.ok(!fixed(a.s, 'firewall-anyany'), '3306 open to the whole internet is not hardened');
  assert.ok(a.last.lines.some((l) => /scope it with "from scoring"/.test(l.text)));
  // Scoped to some other source: the scoring engine is cut off, so the DB goes DOWN.
  const wrongSrc = SCOPED.map((r) => (r.includes('3306') ? 'pass tcp to db01 port 3306 from 203.0.113.50' : r));
  const b = fwWith(wrongSrc);
  assert.equal(svcState(b.s, 'db01'), SERVICE_STATE.DOWN);
  // The scoring engine by IP works the same as the alias.
  const byIp = SCOPED.map((r) => (r.includes('3306') ? 'pass tcp to db01 port 3306 from 198.51.100.9' : r));
  assert.ok(fixed(fwWith(byIp).s, 'firewall-anyany'));
});

test('MySQL loophole: "ufw deny from any to any port 3306" is the trap, never the fix', () => {
  const s = fresh();
  runLine(s, 'db01', "mysql -e \"ALTER USER 'root'@'localhost' IDENTIFIED BY 'S9!cedarDBpw'\"");
  const r = runLine(s, 'db01', 'ufw deny from any to any port 3306');
  assert.equal(r.effects.trapId, 'deny-all-3306');
  assert.ok(!fixed(s, 'mysql-exposed'));
  assert.equal(svcState(s, 'db01'), SERVICE_STATE.DOWN);
  assert.equal(svcState(s, 'web01'), SERVICE_STATE.DOWN);
  // A second deny (trap already sprung) still does not count as the scoped allow.
  runLine(s, 'db01', 'ufw deny from any to any port 3306');
  assert.ok(!fixed(s, 'mysql-exposed'));
  // "allow from any" is not a restriction either.
  const s2 = fresh();
  runLine(s2, 'db01', "mysql -e \"ALTER USER 'root'@'localhost' IDENTIFIED BY 'S9!cedarDBpw'\"");
  runLine(s2, 'db01', 'ufw allow from any to any port 3306');
  assert.ok(!fixed(s2, 'mysql-exposed'));
});

// --- Linux seat: planted SSH key ---------------------------------------------

test('Linux seat: the SSH backdoor needs key removed + root login off + sshd reloaded', () => {
  const s = newGame(CCDC_LAB, { seed: 1, role: ROLES.LINUX });
  assert.deepEqual(s.findingList.map((f) => f.id).sort(), ['mail-open-relay', 'ssh-root-key']);
  const look = runLine(s, 'mail01', 'cat /root/.ssh/authorized_keys');
  assert.match(look.lines.map((l) => l.text).join('\n'), /redteam@203\.0\.113\.66/);
  const trap = runLine(s, 'mail01', 'passwd -l root');
  assert.equal(trap.effects.trapId, 'lock-root-pw');
  runLine(s, 'mail01', "sed -i '/redteam@/d' /root/.ssh/authorized_keys");
  runLine(s, 'mail01', "sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config");
  assert.ok(!fixed(s, 'ssh-root-key'), 'not live until sshd reloads');
  const r = runLine(s, 'mail01', 'systemctl reload ssh');
  assert.equal(r.effects.fixed, 'ssh-root-key');
});

// --- every guided checklist item is a real, runnable command -----------------

test('running ONLY the guided checklist items hardens every finding with all services UP and no SLA hits', () => {
  const s = fresh();
  for (const d of CCDC_LAB.devices) for (const c of d.checklist) runLine(s, d.id, c);
  assert.equal(progress(s).fixed, s.findingList.length, `fixed ${progress(s).fixed}/${s.findingList.length}`);
  for (const id of ['web01', 'dc01', 'mail01', 'db01']) assert.equal(svcState(s, id), SERVICE_STATE.UP);
  assert.equal(score(s).slaCount, 0);
});

test('no checklist item is prose: none returns "command not found"', () => {
  const s = fresh();
  for (const d of CCDC_LAB.devices) for (const c of d.checklist) {
    const r = runLine(s, d.id, c);
    const text = r.lines.map((l) => l.text).join('\n');
    assert.ok(!/not found|not recognized|not a rule-editor command|usage:/i.test(text), `${d.id}: "${c}" -> ${text}`);
  }
});

// --- injects: graded by rubric, not by submission ----------------------------

test('injects: an empty or very short submission is refused and scores 0', () => {
  const s = fresh();
  assert.equal(answerInject(s, 'vendor-ftp', '').ok, false);
  assert.equal(answerInject(s, 'vendor-ftp', '   ok   ').ok, false);
  assert.equal(s.injects['vendor-ftp'].done, false);
  const g = score(s);
  assert.equal(g.injectPts, 0);
});

test('injects: filler earns little; a rubric-complete answer earns full points', () => {
  const s = fresh();
  const filler = answerInject(s, 'vendor-ftp', 'A complete written deliverable that answers the request professionally.');
  assert.equal(filler.ok, true);
  assert.ok(filler.grade.pts <= 5, `filler got ${filler.grade.pts}`);
  assert.ok(filler.grade.missing.length >= 4);
  const full = answerInject(s, 'pcr', 'PCR: rotate the ccdc-scorecheck password on db01 during the 10:30-10:35 window. Rollback: revert to the old password. The new credential is handed to the white team before the change.');
  assert.equal(full.grade.pts, 25, JSON.stringify(full.grade));
  const g = score(s);
  const row = g.injectResults.find((r) => r.id === 'vendor-ftp');
  assert.ok(row.missing.length >= 4, 'the debrief lists what was missing');
});

test('injects: partial answers get partial credit', () => {
  const s = fresh();
  const r = answerInject(s, 'vendor-ftp', 'We will not open FTP. We can offer SFTP on port 22 instead for your manifests.');
  assert.ok(r.grade.pts > 0 && r.grade.pts < 25, `got ${r.grade.pts}`);
});

// --- red team + scoring -----------------------------------------------------

test('the red team compromises every exploitable finding left unfixed', () => {
  const s = fresh();
  const comps = runRedTeam(s);
  assert.equal(comps.length, s.findingList.filter((f) => f.exploitable).length);
});

test('fixing everything leaves no compromises and a strong score', () => {
  const s = fresh();
  // web01
  runLine(s, 'web01', "wp user update admin --user_pass 'Xk7#freightLANE!'");
  runLine(s, 'web01', 'rm /var/www/html/wp-content/uploads/2026/10/stats.php');
  runLine(s, 'web01', 'crontab -r');
  // db01
  runLine(s, 'db01', "mysql -e \"ALTER USER 'root'@'localhost' IDENTIFIED BY 'S9!cedarDBpw'\"");
  runLine(s, 'db01', 'ufw allow from 10.10.10.0/24 to any port 3306');
  // mail01
  runLine(s, 'mail01', 'postconf -e "mynetworks=10.10.10.0/24, 127.0.0.0/8"');
  runLine(s, 'mail01', 'rm /root/.ssh/authorized_keys');
  runLine(s, 'mail01', "sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config");
  runLine(s, 'mail01', 'systemctl restart sshd');
  // dc01
  runLine(s, 'dc01', 'Disable-ADAccount svc-backup2');
  runLine(s, 'dc01', "Remove-ADGroupMember -Identity 'Domain Admins' -Members svc-backup2 -Confirm:$false");
  runLine(s, 'dc01', 'Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force');
  // firewall (allow then deny)
  runLine(s, 'edge-fw', 'del 1');
  for (const r of SCOPED) runLine(s, 'edge-fw', r);
  runLine(s, 'edge-fw', 'default block');
  // injects
  for (const [id, text] of Object.entries(GOOD_INJECTS)) assert.equal(answerInject(s, id, text).grade.pts, 25, id);

  assert.equal(progress(s).fixed, s.findingList.length, 'all findings fixed');
  runRedTeam(s);
  assert.equal(s.compromises.length, 0, 'nothing left to exploit');
  const g = score(s);
  assert.equal(g.servicePts, g.serviceMax);
  assert.ok(g.pct >= 90, `expected an A, got ${g.pct}`);
});

test('expire() ends the round and runs the red team', () => {
  const s = fresh({ mode: MODES.COMPETITION });
  expire(s);
  assert.ok(s.expired && s.redTeamRun);
});

// --- role seats -------------------------------------------------------------

test('role seats partition the devices and findings', () => {
  const seats = rolesFor(CCDC_LAB).map((r) => r.id);
  assert.ok(seats.includes('network') && seats.includes('windows') && seats.includes('webdb') && seats.includes('linux') && seats.includes('ir'));

  const net = newGame(CCDC_LAB, { seed: 1, role: ROLES.NETWORK });
  assert.deepEqual(devicesForRole(CCDC_LAB, ROLES.NETWORK).map((d) => d.id), ['edge-fw']);
  assert.equal(net.findingList.length, 1);
  assert.equal(net.findingList[0].id, 'firewall-anyany');

  const win = newGame(CCDC_LAB, { seed: 1, role: ROLES.WINDOWS });
  assert.deepEqual(win.findingList.map((f) => f.id).sort(), ['rogue-da', 'smbv1-dc']);
  assert.equal(injectsForRole(CCDC_LAB, ROLES.WINDOWS).length, 0, 'technical seats do not carry injects');
  assert.equal(injectsForRole(CCDC_LAB, ROLES.IR).length, CCDC_LAB.injects.length);
});
