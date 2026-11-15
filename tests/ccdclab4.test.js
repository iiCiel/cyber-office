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

test('scenario 4: registered fourth, shape — 7 devices, 18 findings, 19 scored services, 5 injects', () => {
  assert.equal(CCDC_SCENARIOS[3], CCDC_LAB_4);
  const s = fresh();
  assert.equal(s.deviceList.length, 7);
  assert.equal(s.findingList.length, 18);
  assert.equal(Object.keys(s.services).length, 19);
  assert.equal(s.injectList.length, 5);
});

test('scenario 4: the board starts red where it did on Nov 14 (ecomm-http, ecomm-ping, ad-winrm)', () => {
  const s = fresh();
  for (const id of ['ecomm-http', 'ecomm-ping', 'ad-winrm']) assert.equal(up(s, id), false, `${id} starts down`);
  assert.equal(progress(s).servicesUp, 16);
});

test('scenario 4: the checklist hardens every finding and brings every service up', () => {
  const s = fresh();
  for (const d of s.deviceList) for (const c of d.checklist) runLine(s, d.id, c);
  const p = progress(s);
  assert.equal(p.fixed, 18);
  assert.equal(p.servicesUp, 19);
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

const UNLOCK = ['Remove-Item C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\profile.ps1', 'C:\\Tools\\PsExec64.exe -s -i powershell', 'Set-Acl HKLM:\\SYSTEM\\CurrentControlSet\\Services\\SharedAccess\\Parameters\\FirewallPolicy $a'];
const WINRM = 'Set-NetFirewallRule -DisplayGroup "Windows Remote Management" -RemoteAddress Any';
const txt = (s, dev, l) => runLine(s, dev, l).lines.map((x) => x.text).join('\n');

test('scenario 4: the WinRM rule fix brings ad-winrm back (once the firewall lock is gone)', () => {
  const s = fresh();
  assert.match(txt(s, 'dc', WINRM), /Access is denied/);
  assert.equal(up(s, 'ad-winrm'), false);
  run(s, 'dc', ...UNLOCK, WINRM);
  assert.equal(up(s, 'ad-winrm'), true);
});

test('scenario 4 DC lock: empty output, then Access is denied, then SYSTEM fixes it (Nov 14 session 2)', () => {
  const s = fresh();
  assert.equal(txt(s, 'dc', 'Get-NetFirewallRule').trim(), '', 'profile hook swallows the output');
  assert.match(txt(s, 'dc', 'Get-Content C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\profile.ps1'), /function Get-NetFirewallRule/);
  assert.match(txt(s, 'dc', 'netsh advfirewall show allprofiles state'), /Access is denied/);
  run(s, 'dc', UNLOCK[0]);
  assert.match(txt(s, 'dc', 'Get-NetFirewallRule'), /Access is denied/, 'hook gone, lock still there');
  assert.match(txt(s, 'dc', UNLOCK[2]), /not allowed/, 'Administrator cannot reset the ACL');
  assert.equal(open(s, 'dc-fw-lock'), true);
  run(s, 'dc', UNLOCK[1], UNLOCK[2]);
  assert.equal(open(s, 'dc-fw-lock'), false);
  assert.match(txt(s, 'dc', 'Get-NetFirewallRule'), /Windows Remote Management/);
  assert.match(txt(s, 'dc', 'netsh advfirewall show allprofiles state'), /State\s+ON/);
});

test('scenario 4 DC lock: the lock does not leak into the next game', () => {
  const a = fresh(); run(a, 'dc', ...UNLOCK);
  const b = fresh();
  assert.match(txt(b, 'dc', 'netsh advfirewall show allprofiles state'), /Access is denied/);
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

// --- Palo Alto (TOOL23T hands-on) -----------------------------------------------------------------------------
const PA_GOOD = CCDC_LAB_4.devices.find((d) => d.id === 'pa').checklist.filter((c) => /^set (profile-group|rulebase)/.test(c));

test('scenario 4 PA: nothing is live until commit; then the perimeter is hardened and every service stays up', () => {
  const s = fresh();
  run(s, 'pa', ...PA_GOOD);
  assert.equal(open(s, 'pa-permit-any'), true, 'candidate only');
  assert.equal(s.devState.pa.pan.dirty, true);
  run(s, 'pa', 'commit');
  assert.equal(open(s, 'pa-permit-any'), false);
  for (const id of ['ecomm-ping', 'webmail-smtp', 'webmail-imap', 'splunk-query', 'ad-dns']) assert.equal(s.services[id].downBy['pa-permit-any'], undefined, id);
});

test('scenario 4 PA: disabling both allow-all rules before adding allow rules drops every scored service, re-enabling restores', () => {
  const s = fresh();
  run(s, 'pa', 'set rulebase security rules "Permit Inbound" disabled yes', 'commit');
  assert.equal(up(s, 'splunk-query'), true, 'Permit Outbound is any to any, so it still lets the scorer in');
  const r = run(s, 'pa', 'set rulebase security rules "Permit Outbound" disabled yes', 'commit').pop();
  assert.ok(r.effects.dropped.includes('webmail-imap'));
  assert.equal(up(s, 'splunk-query'), false);
  run(s, 'pa', 'set rulebase security rules "Permit Inbound" disabled no', 'commit');
  assert.equal(up(s, 'splunk-query'), true);
});

test('scenario 4 PA: forgetting one service (WinRM port rule) keeps the finding open and that service down', () => {
  const s = fresh();
  run(s, 'pa', ...PA_GOOD.filter((c) => !/ad-winrm/.test(c)), 'commit');
  assert.equal(open(s, 'pa-permit-any'), true);
  assert.ok(s.services['ad-winrm'].downBy['pa-permit-any']);
});

test('scenario 4 PA: profile group must exist, no-profile rules and unlogged denies keep it open', () => {
  let s = fresh();
  const r = runLine(s, 'pa', 'set rulebase security rules x action allow profile-setting group nope');
  assert.match(r.lines[0].text, /does not exist/);
  s = fresh();
  run(s, 'pa', ...PA_GOOD.filter((c) => !/interzone-default/.test(c)), 'commit');
  assert.equal(open(s, 'pa-permit-any'), true, 'denies not logged');
  const t = runLine(s, 'pa', 'show running rulebase security').lines.map((l) => l.text).join('\n');
  assert.match(t, /"Permit Inbound".*disabled yes/);
});

test('scenario 4 PA: admin password counts only after commit', () => {
  const s = fresh();
  run(s, 'pa', 'configure', 'set mgt-config users admin password');
  assert.equal(open(s, 'pa-default-admin'), true);
  run(s, 'pa', 'commit');
  assert.equal(open(s, 'pa-default-admin'), false);
});

// --- MSSQL ---------------------------------------------------------------------------------------------------------
test('scenario 4 MSSQL: blocking 135/139/5985 and turning IIS off fixes it; blocking a scored port is the trap', () => {
  let s = fresh();
  run(s, 'mssql', 'New-NetFirewallRule -DisplayName x -Direction Inbound -Protocol TCP -LocalPort 135,139,5985 -Action Block');
  assert.equal(open(s, 'mssql-exposed'), true, 'IIS still on');
  run(s, 'mssql', 'Stop-Service W3SVC');
  assert.equal(open(s, 'mssql-exposed'), false);
  for (const [line, svc] of [['New-NetFirewallRule -Direction Inbound -LocalPort 135,139,445 -Action Block', 'mssql-smb'], ['Stop-Service MSSQLSERVER', 'mssql-mssql'], ['Set-ItemProperty "HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server" fDenyTSConnections 1', 'mssql-rdp'], ['Remove-SmbShare SOP -Force', 'mssql-smb']]) {
    s = fresh(); run(s, 'mssql', line);
    assert.equal(up(s, svc), false, line);
  }
});

test('scenario 4 MSSQL: the SOP share and the waterops_svc login are there to find', () => {
  const s = fresh();
  const t = (l) => runLine(s, 'mssql', l).lines.map((x) => x.text).join('\n');
  assert.match(t('Get-SmbShare'), /SOP\s+\*\s+C:\\Shares\\SOP/);
  assert.match(t('Get-ChildItem C:\\Shares\\SOP'), /Chlorine-Dosing-SOP\.docx/);
  assert.match(t('Get-LocalUser'), /waterops_svc/);
  const r = runLine(s, 'mssql', 'net user waterops_svc N3wPass!2026');
  assert.deepEqual(r.effects.pcrAccounts, ['MssqlService'], 'changing waterops_svc is an MssqlService rotation');
});

// --- live events (what happened on the day, on the round clock) ------------------------------------------------
import { attachEngine, tickTo } from '../src/game/ccdcEngine.js';

test('scenario 4 live: goose wall broadcasts land on ecom/email while the kit is running, and stop once removed', () => {
  const s = attachEngine(fresh());
  tickTo(s, 210);
  assert.deepEqual(s.engine.broadcasts.map((b) => b.host), ['ecom', 'email']);
  assert.ok(s.engine.broadcasts[0].lines.some((l) => /you are now the incident/.test(l.text)));
  const fixAll = (dev, id) => { for (const c of CCDC_LAB_4.devices.find((d) => d.id === dev).checklist) runLine(s, dev, c); assert.equal(open(s, id), false); };
  fixAll('ecom', 'ecom-goose'); fixAll('email', 'email-goose');
  tickTo(s, 600);
  assert.equal(s.engine.broadcasts.length, 2, 'no more broadcasts after both kits are gone');
});

test('scenario 4 live: the 13:57 teammate bulk reset breaks AD-login checks unless the PCRs were filed first', async () => {
  const { submitPcr, quotientLists } = await import('../src/game/quotient.js');
  let s = attachEngine(fresh());
  tickTo(s, 610);
  assert.ok(s.engine.pcrs.find((p) => p.account === 'DomainUsers').breaking);
  assert.ok(s.engine.events.some((e) => e.cls === 'team' && /reset EVERY AD password/.test(e.text)));
  s = attachEngine(fresh());
  const L = quotientLists(CCDC_LAB_4);
  for (const n of ['DomainUsers', 'Splunk']) submitPcr(s, n, L[n].users.map((u) => `${u},ZipsBlue2026x!`).join('\n'));
  tickTo(s, 610);
  assert.ok(!s.engine.pcrs.some((p) => p.breaking), 'PCR first: the reset is pre-approved');
});

test('scenario 4 live: router console takeover at 12:05 only if the planted key is still there', () => {
  let s = attachEngine(fresh());
  tickTo(s, 730);
  assert.ok(s.engine.broadcasts.some((b) => b.host === 'vyos' && b.lines.some((l) => /No route to host/.test(l.text))));
  assert.equal(up(s, 'webmail-imap'), false, 'wave 3 confirms the router compromise: services lose their path');
  s = attachEngine(fresh());
  for (const c of CCDC_LAB_4.devices.find((d) => d.id === 'vyos').checklist) runLine(s, 'vyos', c);
  tickTo(s, 730);
  assert.ok(!s.engine.broadcasts.some((b) => b.host === 'vyos'));
  assert.ok(s.engine.events.some((e) => /was refused/.test(e.text)));
});
