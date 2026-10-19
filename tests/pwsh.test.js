import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPwsh } from '../src/game/pwsh.js';
import { halcyonDirectory } from '../src/data/halcyonDirectory.js';
import { generateLogs } from '../src/days/day1/logs.js';

const dir = halcyonDirectory();
const events = generateLogs({ nowMinutes: 600 });
const ctx = { dir, events: () => events, cwd: 'C:\\Users\\analyst01', user: 'analyst01', host: 'WS-0142', fs: { 'C:\\Users\\analyst01\\notes.txt': 'line one\nsvc_backup seen\nline three\n' } };
const ps = (l, c = ctx) => runPwsh(l, c);

test('Get-ADUser prints the real default property list, sorted', () => {
  const out = ps('Get-ADUser svc_sql').out;
  assert.match(out, /DistinguishedName : CN=SQL Service,OU=ServiceAccounts,OU=Halcyon,DC=halcyonmutual,DC=local/);
  assert.match(out, /Enabled           : True/);
  assert.match(out, /SamAccountName    : svc_sql/);
  assert.match(out, /SID               : S-1-5-21-3623811015-3361044348-30300820-\d+/);
  assert.ok(out.indexOf('DistinguishedName') < out.indexOf('Enabled') && out.indexOf('Enabled') < out.indexOf('UserPrincipalName'));
  assert.doesNotMatch(out, /ServicePrincipalNames/);
});

test('-Properties adds attributes; * shows everything', () => {
  const a = ps('Get-ADUser svc_sql -Properties ServicePrincipalNames, PasswordLastSet, PasswordNeverExpires').out;
  assert.match(a, /MSSQLSvc\/claims-db01\.halcyonmutual\.local:1433/);
  assert.match(a, /PasswordNeverExpires\s+: True/);
  assert.match(a, /PasswordLastSet\s+: 5\/21\/2018/);
  const all = ps('Get-ADUser svc_backup -Properties *').out;
  assert.match(all, /adminCount\s+: 1/);
  assert.match(all, /MemberOf\s+: \{CN=Backup Operators/);
});

test('-Filter works with script-block and string syntax', () => {
  const spn = ps('Get-ADUser -Filter {ServicePrincipalName -like "*"} -Properties ServicePrincipalName | Select-Object SamAccountName').out;
  assert.match(spn, /svc_sql/);
  assert.match(spn, /svc_web/);
  assert.doesNotMatch(spn, /priya/);
  const names = ps("Get-ADUser -Filter 'Name -like \"*Service*\"' | Select-Object -ExpandProperty SamAccountName").out;
  assert.ok(names.includes('svc_backup') && names.includes('svc_sql'));
  assert.equal(ps('Get-ADUser -Filter * | Measure-Object').out.match(/Count\s+: (\d+)/)[1], String(dir.users.length));
  assert.match(ps('Get-ADUser -Filter {adminCount -eq 1} | Select-Object -ExpandProperty Name').out, /Backup Service/);
});

test('group membership, nesting and the (command).Count form', () => {
  assert.equal(ps("(Get-ADGroupMember 'Domain Admins').Count").out.trim(), String(dir.groupMembers('Domain Admins').length));
  const members = ps('Get-ADGroupMember "Domain Admins" | Select-Object Name, SamAccountName, objectClass | Format-Table').out;
  assert.match(members, /Name\s+SamAccountName\s+objectClass/);
  assert.match(members, /svc_scan/);
  assert.match(ps('Get-ADPrincipalGroupMembership svc_backup | Select-Object -ExpandProperty name').out, /Backup Operators/);
});

test('errors look like PowerShell errors', () => {
  const r = ps('Get-ADUser nobody');
  assert.ok(r.error);
  assert.match(r.out, /Get-ADUser : Cannot find an object with identity: 'nobody' under: 'DC=halcyonmutual,DC=local'\./);
  assert.match(r.out, /CategoryInfo\s+: ObjectNotFound/);
  assert.match(ps('frobnicate').out, /The term 'frobnicate' is not recognized as the name of a cmdlet/);
  assert.match(ps('Get-ADUser -Bogus 1').out, /A parameter cannot be found that matches parameter name 'Bogus'/);
});

test('Get-WinEvent reads the SIEM events, newest first, with a ProviderName header', () => {
  const out = ps('Get-WinEvent -FilterHashtable @{LogName="Security"; Id=4625} -MaxEvents 2').out;
  assert.match(out, /ProviderName: Microsoft-Windows-Security-Auditing/);
  assert.match(out, /TimeCreated\s+Id LevelDisplayName Message/);
  assert.match(out, /4625 Information\s+An account failed to log on\./);
  const full = ps('Get-WinEvent -FilterHashtable @{LogName="Security"; Id=4624} -MaxEvents 1 | Select-Object -ExpandProperty Message').out;
  assert.match(full, /An account was successfully logged on\./);
  assert.match(full, /Logon Type:\s+2/);
  const filtered = ps("Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625} | Where-Object { $_.Message -match 'j.alvarez' } | Measure-Object").out;
  assert.match(filtered, /Count\s+: 38/);
  assert.match(ps('Get-WinEvent -FilterHashtable @{LogName="Security"; Id=9999}').out, /No events were found that match the specified selection criteria/);
});

test('files, Select-String, location and native tools', () => {
  assert.match(ps('Get-Content notes.txt').out, /svc_backup seen/);
  assert.match(ps('Select-String -Pattern svc_backup -Path notes.txt').out, /notes\.txt:2:svc_backup seen/i);
  assert.equal(ps('cd C:\\').cwd, 'C:\\');
  assert.match(ps('whoami').out, /halcyon\\analyst01/);
  assert.match(ps('net group "Domain Admins" /domain').out, /Members[\s\S]*svc_scan/);
  assert.match(ps('net user svc_sql /domain').out, /Password expires\s+Never/);
  assert.match(ps('setspn -L svc_sql').out, /MSSQLSvc\/claims-db01\.halcyonmutual\.local:1433/);
  assert.match(ps('nltest /dclist:halcyonmutual.local').out, /dc01\.halcyonmutual\.local/);
});

test('pipelines: Sort-Object, Group-Object, ForEach-Object, variables', () => {
  const sorted = ps('Get-ADUser -Filter * -Properties PasswordLastSet | Sort-Object PasswordLastSet | Select-Object -First 1 -ExpandProperty SamAccountName').out.trim();
  assert.ok(sorted.length > 0);
  assert.match(ps('Get-ADComputer -Filter * | Group-Object ObjectClass').out, /Count Name\s+Group|Count\s+Name/);
  assert.match(ps('Get-ADUser -Filter {Enabled -eq $true} | ForEach-Object { $_.SamAccountName }').out, /priya\.r/);
  assert.match(ps('$u = Get-ADUser svc_sql -Properties Description; $u.Description').out, /Runs SQL Server/);
});
