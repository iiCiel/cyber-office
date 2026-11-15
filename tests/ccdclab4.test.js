import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CCDC_LAB_4 } from '../src/data/ccdcLabScenario4.js';
import { CCDC_SCENARIOS } from '../src/data/ccdcScenarios.js';
import { newGame, runLine, progress, answerInject } from '../src/game/ccdcLab.js';
import { applyEdit } from '../src/game/ccdcEdit.js';

const fresh = (o = {}) => newGame(CCDC_LAB_4, { seed: 1, ...o });
const run = (s, dev, ...ls) => ls.map((l) => runLine(s, dev, l));
const up = (s, id) => s.services[id].state === 'up';
const open = (s, id) => s.findings[id].status !== 'fixed';

const GOOD = {
  tool23t: 'As found, Permit Inbound and Permit Outbound allowed any to any. We added allow rules per server for web-browsing, ssl, smtp, imap, dns, ldap and WinRM 5985, applied a security profile group (anti-spyware, vulnerability protection) and added a deny-all rule with log at session end. Quotient stayed green.',
  srva07a: 'We installed ClamAV, a free open-source tool, on Rocky, Ubuntu and Debian Linux and on the Windows Server 2022 and 2019 boxes. freshclam updated the definitions on each, and a clamscan scan summary shows Infected files: 0.',
  banner: 'The banner says authorized use only, that activity is monitored and use means consent with no expectation of privacy, and that misuse leads to discipline and criminal prosecution. It shows before login via issue.net and the sshd Banner, legalnoticecaption on Windows, and the PAN-OS and VyOS login banners.',
  eval14a: 'We ran Nmap from Kali against our own 172.25.34.x addresses. Ecom has 22, 80, 443; SSH there is not needed. MSSQL exposes 135 RPC, 139 NetBIOS, 80 and 5985 which are not needed; 445, 1433 and 3389 are required.',
  pcr: 'Open each Quotient credential list (DomainUsers, Splunk) and copy its Usernames tab. Build username,password CSV lines for exactly those names and submit the PCR in Quotient first, then run Set-ADAccountPassword. Exclude svc- service accounts. Check Quotient after one round.',
};

test('scenario 4: registered fourth, shape — 6 devices, 15 findings, 11 scored services, 5 injects', () => {
  assert.equal(CCDC_SCENARIOS[3], CCDC_LAB_4);
  const s = fresh();
  assert.equal(s.deviceList.length, 6);
  assert.equal(s.findingList.length, 15);
  assert.equal(Object.keys(s.services).length, 11);
  assert.equal(s.injectList.length, 5);
});

test('scenario 4: the board starts red where it did on Nov 14 (ecomm-http, ecomm-ping, ad-winrm)', () => {
  const s = fresh();
  for (const id of ['ecomm-http', 'ecomm-ping', 'ad-winrm']) assert.equal(up(s, id), false, `${id} starts down`);
  assert.equal(progress(s).servicesUp, 8);
});

test('scenario 4: the checklist hardens every finding and brings every service up', () => {
  const s = fresh();
  for (const d of s.deviceList) for (const c of d.checklist) runLine(s, d.id, c);
  const p = progress(s);
  assert.equal(p.fixed, 15);
  assert.equal(p.servicesUp, 11);
});

test('scenario 4: no checklist item is prose or a missing command', () => {
  const s = fresh();
  for (const d of s.deviceList) for (const c of d.checklist) {
    const t = runLine(s, d.id, c).lines.map((l) => l.text).join('\n');
    assert.ok(!/command not found|is not recognized|No such file|unsupported script|undefined/i.test(t), `${d.id}: ${c} -> ${t.slice(0, 100)}`);
  }
});

test('scenario 4: typing sudo works on the Linux boxes and the router', () => {
  const s = fresh();
  run(s, 'splunk', 'sudo userdel -r svc-chrony', 'sudo rm /etc/sudoers.d/svc-chrony');
  assert.equal(open(s, 'splunk-backdoor-user'), false);
  assert.ok(!/svc-chrony/.test(s.devState.splunk.fs['/etc/passwd']), 'passwd no longer lists svc-chrony');
});

test('scenario 4: the real Nov 14 mistakes take down the right services', () => {
  let s = fresh(); run(s, 'vyos', 'reboot');
  for (const id of ['webmail-imap', 'splunk-query', 'ad-dns']) assert.equal(up(s, id), false, `router reboot drops ${id}`);

  s = fresh(); run(s, 'splunk', 'sudo systemctl stop ssh');
  assert.equal(up(s, 'splunk-ssh'), false, 'stopping ssh on Splunk (wrong tab) drops splunk-ssh');

  s = fresh(); run(s, 'splunk', 'rm /etc/cron.d/quotient_scoring');
  assert.equal(up(s, 'splunk-query'), false, 'deleting the scorer cron drops splunk-query');

  s = fresh(); run(s, 'splunk', 'systemctl stop chronyd');
  assert.equal(up(s, 'splunk-chrony'), false, 'stopping the real chronyd drops splunk-chrony');

  s = fresh(); run(s, 'splunk', 'systemctl stop sssd');
  assert.equal(up(s, 'splunk-ssh'), false, 'stopping the real sssd drops domain logins');

  s = fresh(); run(s, 'dc', 'Get-ADUser -Filter * | Set-ADAccountPassword -Reset -NewPassword $s');
  assert.equal(up(s, 'splunk-query'), false, 'a bulk reset that includes svc-splunk breaks splunk-query');

  s = fresh(); run(s, 'email', 'systemctl stop ssh');
  assert.equal(up(s, 'webmail-ssh'), false, 'SSH is scored on the mail server');
});

test('scenario 4: stopping SSH is the FIX on the web store (not scored there)', () => {
  const s = fresh(); run(s, 'ecom', 'sudo systemctl disable --now sshd');
  assert.equal(open(s, 'ecom-ssh'), false);
});

test('scenario 4: partial or wrong steps do not close a finding', () => {
  let s = fresh(); run(s, 'ecom', 'kill -9 286909', 'rm /bin/scoringengine', 'rm /usr/lib/.honk');
  assert.equal(open(s, 'ecom-goose'), true, 'killing a child leaves the parent alive');
  assert.ok(s.devState.ecom.fs['/proc/7484/cmdline'], 'parent still running');

  s = fresh(); run(s, 'email', 'ufw deny from 198.51.100.12');
  assert.equal(open(s, 'email-block'), true, 'an appended deny never matches');
  s = fresh(); run(s, 'email', 'ufw insert 1 deny from 192.51.100.12');
  assert.equal(open(s, 'email-block'), true, 'the 192 typo blocks nothing');

  s = fresh(); run(s, 'vyos', 'set system login user vyos authentication plaintext-password X1!', 'commit');
  assert.equal(open(s, 'vyos-backdoor'), true, 'password without deleting the key is not enough');

  s = fresh(); run(s, 'pa', 'set mgt-config users admin password');
  assert.equal(open(s, 'pa-default-admin'), true, 'PAN-OS change without commit is not live');

  s = fresh(); run(s, 'splunk', 'userdel -r svc-chrony');
  assert.equal(open(s, 'splunk-backdoor-user'), true, 'userdel leaves the sudoers rule');

  s = fresh(); run(s, 'dc', 'Remove-ADGroupMember "Domain Admins" svc-splunk -Confirm:$false');
  assert.equal(open(s, 'dc-svc-da'), true, 'still an Enterprise Admin');
});

test('scenario 4: killing the parent also kills its children (ps reflects it)', () => {
  const s = fresh(); run(s, 'ecom', 'kill -9 7484');
  const ps = runLine(s, 'ecom', 'ps -ef').lines.map((l) => l.text).join('\n');
  assert.ok(!/scoringengine|\.honk|ttygoose/.test(ps), ps);
  assert.ok(/nginx: worker process/.test(ps), 'nginx untouched');
});

test('scenario 4: the drop table fix brings the store back and curl stops hanging', () => {
  const s = fresh();
  assert.match(runLine(s, 'ecom', 'curl -I localhost').lines.map((l) => l.text).join(' '), /timed out/);
  run(s, 'ecom', 'nft delete table inet firewalld_policy_drop');
  assert.equal(up(s, 'ecomm-http'), true);
  assert.equal(up(s, 'ecomm-ping'), true);
  assert.match(runLine(s, 'ecom', 'curl -kI https://localhost').lines.map((l) => l.text).join(' '), /200/);
});

test('scenario 4: the WinRM rule fix brings ad-winrm back', () => {
  const s = fresh(); run(s, 'dc', 'Set-NetFirewallRule -DisplayGroup "Windows Remote Management" -RemoteAddress Any');
  assert.equal(up(s, 'ad-winrm'), true);
});

test('scenario 4: strong inject answers get full marks', () => {
  const s = fresh();
  for (const [id, text] of Object.entries(GOOD)) {
    answerInject(s, id, text);
    const g = s.injects[id].grade;
    assert.equal(g.got, g.of, `${id}: missed ${(g.missing || []).join('; ')}`);
  }
});

test('sed range delete removes a BEGIN/END block and nothing else', () => {
  const fs = { '/etc/profile': 'a\n# BEGIN X\nevil\n# END X\nb\n' };
  const r = applyEdit(fs, "sed -i '/BEGIN X/,/END X/d' /etc/profile", { cwd: '/' });
  assert.ok(!r.error);
  assert.equal(fs['/etc/profile'], 'a\nb\n');
});
