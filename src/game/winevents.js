// Windows event log messages, word for word as Windows writes them (Security, System, PowerShell, Sysmon).
//
// Each builder takes one params object and returns the message body that Event Viewer shows on the "General" tab.
// wrapWinEvent() then puts the header that Splunk's Windows add-on prints in front of it (LogName=, EventCode=,
// ComputerName=, ...). Layouts follow Microsoft's documentation of each event ID (learn.microsoft.com, "Advanced
// security audit policy settings" / "Security auditing"), so what the player reads is what a real SOC reads.
//
// Params are small and all optional: the defaults give a plausible, boring event. The compact one-line `msg` the
// game uses for search and evidence comes from summary().

export const DOMAIN_SID = 'S-1-5-21-3623811015-3361044348-30300820';
export const WELL_KNOWN_RID = { administrator: 500, guest: 501, krbtgt: 502, 'domain admins': 512, 'domain users': 513, 'domain guests': 514, 'domain computers': 515, 'domain controllers': 516, 'enterprise admins': 519, 'schema admins': 518 };

const hash = (s) => [...String(s)].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7);

/** Deterministic SID for an account or group name (machine accounts end in $). */
export function sidOf(name, domainSid = DOMAIN_SID) {
  const n = String(name || '').toLowerCase();
  if (!n || n === '-') return 'S-1-0-0';
  if (n === 'system' || n === 'local system') return 'S-1-5-18';
  if (n === 'local service') return 'S-1-5-19';
  if (n === 'network service') return 'S-1-5-20';
  if (WELL_KNOWN_RID[n]) return `${domainSid}-${WELL_KNOWN_RID[n]}`;
  return `${domainSid}-${1100 + (hash(n) % 8900)}`;
}

export const hex = (n) => `0x${Number(n).toString(16).toUpperCase()}`;
const T = (...l) => l.join('\n');
// Windows message templates pad with tabs so values land on a tab stop; these reproduce what Event Viewer shows.
const tabs = (len, indent) => {
  const col = indent + len;
  return '\t'.repeat(Math.max(1, Math.ceil((32 - col) / 8)) + (col % 8 === 0 ? 1 : 0));
};
const tab = (k, v) => `\t${k}:${tabs(k.length + 1, 8)}${v}`;
const top = (k, v) => `${k}:${tabs(k.length + 1, 0)}${v}`;
const dash = (v) => (v === undefined || v === null || v === '' ? '-' : v);

// "Subject" block shared by most events. `p.by` is the account that did the thing.
function subject(p, label = 'Subject') {
  const by = p.by ?? 'SYSTEM';
  const machine = by === 'SYSTEM' ? `${(p.host || 'DC01').toUpperCase()}$` : by;
  const sid = p.bySid || (by === 'SYSTEM' ? 'S-1-5-18' : sidOf(by, p.domainSid));
  return T(
    `${label}:`,
    tab('Security ID', sid),
    tab('Account Name', machine),
    tab('Account Domain', p.netbios || 'HALCYON'),
    tab('Logon ID', p.byLogonId || (by === 'SYSTEM' ? '0x3E7' : '0x1F3A2B')),
  );
}

const targetAccount = (p, label, name) =>
  T(`${label}:`, tab('Security ID', sidOf(name, p.domainSid)), tab('Account Name', name), tab('Account Domain', p.netbios || 'HALCYON'));

const REALM = (p) => (p.realm || `${p.netbios || 'HALCYON'}.LOCAL`).toUpperCase();

// ---------- Logon / logoff ----------

function w4624(p) {
  const type = p.type ?? 3;
  const kerberos = p.auth === 'Kerberos' || (p.auth === undefined && type !== 2 && type !== 10 && p.kerberos);
  const interactive = type === 2 || type === 10 || type === 7 || type === 11;
  const pkg = p.auth || (kerberos ? 'Kerberos' : interactive ? 'Negotiate' : 'NTLM');
  const proc = p.logonProcess || (pkg === 'Kerberos' ? 'Kerberos' : type === 2 ? 'User32' : type === 10 ? 'User32' : type === 9 ? 'seclogo' : pkg === 'NTLM' ? 'NtLmSsp ' : 'Advapi  ');
  return T(
    'An account was successfully logged on.',
    '',
    subject({ ...p, by: p.subjectUser ?? 'SYSTEM' }),
    '',
    'Logon Information:',
    tab('Logon Type', type),
    tab('Restricted Admin Mode', p.restrictedAdmin ? 'Yes' : '-'),
    tab('Virtual Account', 'No'),
    tab('Elevated Token', p.elevated ? 'Yes' : 'No'),
    '',
    top('Impersonation Level', 'Impersonation'),
    '',
    'New Logon:',
    tab('Security ID', p.sid || sidOf(p.user, p.domainSid)),
    tab('Account Name', p.user),
    tab('Account Domain', p.netbios || 'HALCYON'),
    tab('Logon ID', p.logonId || '0x2D41F7'),
    tab('Linked Logon ID', '0x0'),
    tab('Network Account Name', '-'),
    tab('Network Account Domain', '-'),
    tab('Logon GUID', p.guid || '{00000000-0000-0000-0000-000000000000}'),
    '',
    'Process Information:',
    tab('Process ID', p.pid || '0x0'),
    tab('Process Name', p.process || (type === 2 ? 'C:\\Windows\\System32\\winlogon.exe' : type === 10 ? 'C:\\Windows\\System32\\svchost.exe' : '-')),
    '',
    'Network Information:',
    tab('Workstation Name', dash(p.ws)),
    tab('Source Network Address', dash(p.ip)),
    tab('Source Port', dash(p.port ?? (p.ip ? 49700 + (hash(`${p.user}${p.ip}`) % 9000) : '-'))),
    '',
    'Detailed Authentication Information:',
    tab('Logon Process', proc),
    tab('Authentication Package', pkg),
    tab('Transited Services', '-'),
    tab('Package Name (NTLM only)', pkg === 'NTLM' ? p.ntlmVersion || 'NTLM V2' : '-'),
    tab('Key Length', pkg === 'NTLM' ? 128 : 0),
    '',
    'This event is generated when a logon session is created. It is generated on the computer that was accessed.',
    '',
    'The subject fields indicate the account on the local system which requested the logon. This is most commonly a service such as the Server service, or a local process such as Winlogon.exe or Services.exe.',
    '',
    'The logon type field indicates the kind of logon that occurred. The most common types are 2 (interactive) and 3 (network).',
  );
}

function w4625(p) {
  const sub = p.subStatus || '0xC000006A';
  const reason = { '0xC0000064': 'Unknown user name or bad password.', '0xC000006A': 'Unknown user name or bad password.', '0xC0000234': 'Account locked out.', '0xC0000072': 'Account currently disabled.', '0xC0000071': 'The specified account\'s password has expired.', '0xC0000070': 'Account logon time restriction violation.' };
  return T(
    'An account failed to log on.',
    '',
    subject({ ...p, by: p.subjectUser ?? 'SYSTEM' }),
    '',
    top('Logon Type', p.type ?? 3),
    '',
    'Account For Which Logon Failed:',
    tab('Security ID', 'S-1-0-0'),
    tab('Account Name', p.user),
    tab('Account Domain', p.netbios || 'HALCYON'),
    '',
    'Failure Information:',
    tab('Failure Reason', reason[p.status === '0xC0000234' ? '0xC0000234' : sub] || 'Unknown user name or bad password.'),
    tab('Status', p.status || '0xC000006D'),
    tab('Sub Status', p.status === '0xC0000234' ? '0xC0000234' : sub),
    '',
    'Process Information:',
    tab('Caller Process ID', '0x0'),
    tab('Caller Process Name', '-'),
    '',
    'Network Information:',
    tab('Workstation Name', dash(p.ws)),
    tab('Source Network Address', dash(p.ip)),
    tab('Source Port', dash(p.port)),
    '',
    'Detailed Authentication Information:',
    tab('Logon Process', 'NtLmSsp '),
    tab('Authentication Package', 'NTLM'),
    tab('Transited Services', '-'),
    tab('Package Name (NTLM only)', '-'),
    tab('Key Length', 0),
    '',
    'This event is generated when a logon request fails. It is generated on the computer where access was attempted.',
  );
}

const w4634 = (p) => T('An account was logged off.', '', targetAccount(p, 'Subject', p.user), tab('Logon ID', p.logonId || '0x2D41F7'), '', top('Logon Type', p.type ?? 3));

const w4647 = (p) => T('User initiated logoff:', '', targetAccount(p, 'Subject', p.user), tab('Logon ID', p.logonId || '0x2D41F7'));

function w4648(p) {
  return T(
    'A logon was attempted using explicit credentials.',
    '',
    subject({ ...p, by: p.by }),
    tab('Logon GUID', '{00000000-0000-0000-0000-000000000000}'),
    '',
    'Account Whose Credentials Were Used:',
    tab('Account Name', p.user),
    tab('Account Domain', p.netbios || 'HALCYON'),
    tab('Logon GUID', '{00000000-0000-0000-0000-000000000000}'),
    '',
    'Target Server:',
    tab('Target Server Name', p.target || 'localhost'),
    tab('Additional Information', p.targetInfo || p.target || 'localhost'),
    '',
    'Process Information:',
    tab('Process ID', p.pid || '0x1c4'),
    tab('Process Name', p.process || 'C:\\Windows\\System32\\svchost.exe'),
    '',
    'Network Information:',
    tab('Network Address', dash(p.ip)),
    tab('Port', p.port || 445),
  );
}

const PRIV_ADMIN = ['SeSecurityPrivilege', 'SeBackupPrivilege', 'SeRestorePrivilege', 'SeTakeOwnershipPrivilege', 'SeDebugPrivilege', 'SeSystemEnvironmentPrivilege', 'SeLoadDriverPrivilege', 'SeImpersonatePrivilege', 'SeDelegateSessionUserImpersonatePrivilege'];
function w4672(p) {
  return T(
    'Special privileges assigned to new logon.',
    '',
    subject({ ...p, by: p.user, byLogonId: p.logonId || '0x2D41F7' }),
    '',
    `Privileges:\t\t${(p.privileges || PRIV_ADMIN).join('\n\t\t\t')}`,
  );
}

// ---------- Processes / services / tasks ----------

function w4688(p) {
  const user = p.user || 'SYSTEM';
  return T(
    'A new process has been created.',
    '',
    'Creator Subject:',
    tab('Security ID', user === 'SYSTEM' ? 'S-1-5-18' : sidOf(user, p.domainSid)),
    tab('Account Name', user === 'SYSTEM' ? `${(p.host || 'WS-0107').toUpperCase()}$` : user),
    tab('Account Domain', p.netbios || 'HALCYON'),
    tab('Logon ID', p.logonId || '0x2D41F7'),
    '',
    'Target Subject:',
    tab('Security ID', 'S-1-0-0'),
    tab('Account Name', '-'),
    tab('Account Domain', '-'),
    tab('Logon ID', '0x0'),
    '',
    'Process Information:',
    tab('New Process ID', p.pid || hex(1000 + (hash(p.cmd || p.proc) % 8000))),
    tab('New Process Name', p.proc),
    tab('Token Elevation Type', p.elevation || '%%1936'),
    tab('Mandatory Label', 'S-1-16-12288'),
    tab('Creator Process ID', p.ppid || '0x1d8c'),
    tab('Creator Process Name', p.parent),
    tab('Process Command Line', p.cmd ?? ''),
    '',
    'Token Elevation Type indicates the type of token that was assigned to the new process in accordance with User Account Control policy.',
  );
}

function w7045(p) {
  return T('A service was installed in the system.', '', `Service Name:  ${p.service}`, `Service File Name:  ${p.path}`, 'Service Type:  user mode service', `Service Start Type:  ${p.start || 'demand start'}`, `Service Account:  ${p.account || 'LocalSystem'}`);
}

function w4697(p) {
  return T('A service was installed in the system.', '', subject(p), '', 'Service Information:', tab('Service Name', p.service), tab('Service File Name', p.path), tab('Service Type', '0x10'), tab('Service Start Type', '3'), tab('Service Account', p.account || 'LocalSystem'));
}

function w4698(p) {
  const xml = p.taskXml || `<?xml version="1.0" encoding="UTF-16"?>\n<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">\n  <RegistrationInfo>\n    <Date>${p.date || '2026-10-21T02:20:04'}</Date>\n    <Author>${p.netbios || 'HALCYON'}\\${p.by}</Author>\n  </RegistrationInfo>\n  <Triggers>\n    <TimeTrigger>\n      <StartBoundary>${p.date || '2026-10-21T02:20:04'}</StartBoundary>\n      <Enabled>true</Enabled>\n    </TimeTrigger>\n  </Triggers>\n  <Principals>\n    <Principal id="Author">\n      <UserId>S-1-5-18</UserId>\n      <RunLevel>HighestAvailable</RunLevel>\n    </Principal>\n  </Principals>\n  <Actions Context="Author">\n    <Exec>\n      <Command>${p.command || 'C:\\Windows\\System32\\cmd.exe'}</Command>\n      <Arguments>${p.args || ''}</Arguments>\n    </Exec>\n  </Actions>\n</Task>`;
  return T('A scheduled task was created.', '', subject(p), '', 'Task Information:', tab('Task Name', p.task), tab('Task Content', xml));
}

function w1102(p) {
  return T('The audit log was cleared.', '', 'Subject:', tab('Security ID', sidOf(p.by, p.domainSid)), tab('Account Name', p.by), tab('Domain Name', p.netbios || 'HALCYON'), tab('Logon ID', p.byLogonId || '0x2D41F7'));
}

// ---------- Account management ----------

function w4720(p) {
  return T(
    'A user account was created.',
    '',
    subject(p),
    '',
    targetAccount(p, 'New Account', p.user),
    '',
    'Attributes:',
    tab('SAM Account Name', p.user),
    tab('Display Name', p.display || '<value not set>'),
    tab('User Principal Name', p.upn || `${p.user}@${(p.realm || 'halcyonmutual.local').toLowerCase()}`),
    tab('Home Directory', '<value not set>'),
    tab('Home Drive', '<value not set>'),
    tab('Script Path', '<value not set>'),
    tab('Profile Path', '<value not set>'),
    tab('User Workstations', '<value not set>'),
    tab('Password Last Set', '<never>'),
    tab('Account Expires', '<never>'),
    tab('Primary Group ID', 513),
    tab('Allowed To Delegate To', '-'),
    tab('Old UAC Value', '0x0'),
    tab('New UAC Value', '0x15'),
    tab('User Account Control', '\n\t\tAccount Disabled\n\t\t\'Password Not Required\' - Enabled\n\t\t\'Normal Account\' - Enabled'),
    tab('User Parameters', '-'),
    tab('SID History', '-'),
    tab('Logon Hours', 'All'),
    '',
    'Additional Information:',
    tab('Privileges', '-'),
  );
}

const SIMPLE_ACCT = {
  4722: 'A user account was enabled.',
  4725: 'A user account was disabled.',
  4726: 'A user account was deleted.',
  4723: 'An attempt was made to change an account\'s password.',
  4724: 'An attempt was made to reset an account\'s password.',
  4740: 'A user account was locked out.',
  4767: 'A user account was unlocked.',
};
function wAcct(code) {
  return (p) => {
    if (code === 4740) {
      return T(SIMPLE_ACCT[code], '', subject({ ...p, by: 'SYSTEM' }), '', 'Account That Was Locked Out:', tab('Security ID', sidOf(p.user, p.domainSid)), tab('Account Name', p.user), '', 'Additional Information:', tab('Caller Computer Name', p.ws || '-'));
    }
    return T(SIMPLE_ACCT[code], '', subject(p), '', targetAccount(p, 'Target Account', p.user), ...(code === 4724 || code === 4723 ? ['', 'Additional Information:', tab('Privileges', '-')] : []));
  };
}

function w4738(p) {
  return T(
    'A user account was changed.',
    '',
    subject(p),
    '',
    targetAccount(p, 'Target Account', p.user),
    '',
    'Changed Attributes:',
    tab('SAM Account Name', '-'),
    tab('Display Name', '-'),
    tab('User Principal Name', '-'),
    tab('Home Directory', '-'),
    tab('Home Drive', '-'),
    tab('Script Path', '-'),
    tab('Profile Path', '-'),
    tab('User Workstations', '-'),
    tab('Password Last Set', p.pwdLastSet || '-'),
    tab('Account Expires', '-'),
    tab('Primary Group ID', '-'),
    tab('AllowedToDelegateTo', '-'),
    tab('Old UAC Value', p.oldUac || '-'),
    tab('New UAC Value', p.newUac || '-'),
    tab('User Account Control', p.uacText || '-'),
    tab('User Parameters', '-'),
    tab('SID History', '-'),
    tab('Logon Hours', '-'),
    '',
    'Additional Information:',
    tab('Privileges', '-'),
  );
}

const GROUP_ADD = {
  4728: 'A member was added to a security-enabled global group.',
  4732: 'A member was added to a security-enabled local group.',
  4756: 'A member was added to a security-enabled universal group.',
  4729: 'A member was removed from a security-enabled global group.',
  4733: 'A member was removed from a security-enabled local group.',
};
function wGroup(code) {
  return (p) => {
    const dn = p.memberDn || `CN=${p.member},${p.memberOu || 'OU=ServiceAccounts,OU=Halcyon,DC=halcyonmutual,DC=local'}`;
    return T(
      GROUP_ADD[code],
      '',
      subject(p),
      '',
      'Member:',
      tab('Security ID', sidOf(p.member, p.domainSid)),
      tab('Account Name', dn),
      '',
      'Group:',
      tab('Security ID', code === 4732 || code === 4733 ? `S-1-5-32-${{ administrators: 544, 'remote desktop users': 555, 'backup operators': 551 }[String(p.group).toLowerCase()] || 545}` : sidOf(p.group, p.domainSid)),
      tab('Group Name', p.group),
      tab('Group Domain', p.netbios || 'HALCYON'),
      '',
      'Additional Information:',
      tab('Privileges', '-'),
    );
  };
}

// ---------- Kerberos / NTLM (domain controller) ----------

function w4768(p) {
  const rc4 = p.enc === '0x17';
  return T(
    'A Kerberos authentication ticket (TGT) was requested.',
    '',
    'Account Information:',
    tab('Account Name', p.user),
    tab('Supplied Realm Name', (p.realm || 'halcyonmutual.local').toLowerCase().replace(/\.local$/, '.local')),
    tab('User ID', `${p.netbios || 'HALCYON'}\\${p.user}`),
    '',
    'Service Information:',
    tab('Service Name', 'krbtgt'),
    tab('Service ID', `${p.netbios || 'HALCYON'}\\krbtgt`),
    '',
    'Network Information:',
    tab('Client Address', `::ffff:${p.ip || '10.0.4.17'}`),
    tab('Client Port', p.port || 49733),
    '',
    'Additional Information:',
    tab('Ticket Options', p.options || '0x40810010'),
    tab('Result Code', p.result || '0x0'),
    tab('Ticket Encryption Type', p.enc || '0x12'),
    tab('Session Encryption Type', p.enc || '0x12'),
    tab('Pre-Authentication Type', p.preauth ?? (p.result === '0x0' || !p.result ? 2 : 0)),
    tab('Pre-Authentication EncryptionType', rc4 ? '0x17' : '0x12'),
    '',
    'Certificate Information:',
    tab('Certificate Issuer Name', ''),
    tab('Certificate Serial Number', ''),
    tab('Certificate Thumbprint', ''),
    '',
    'Certificate information is only provided if a certificate was used for pre-authentication.',
    '',
    'Pre-authentication types, ticket options, encryption types and result codes are defined in RFC 4120.',
  );
}

function w4769(p) {
  return T(
    'A Kerberos service ticket was requested.',
    '',
    'Account Information:',
    tab('Account Name', `${p.user}@${REALM(p)}`),
    tab('Account Domain', REALM(p)),
    tab('Logon GUID', p.guid || '{3a7cdd3b-0d8a-5c2f-5b3a-9e1c0f2b6d11}'),
    '',
    'Service Information:',
    tab('Service Name', p.service),
    tab('Service ID', sidOf(p.service, p.domainSid)),
    '',
    'Network Information:',
    tab('Client Address', `::ffff:${p.ip || '10.0.4.17'}`),
    tab('Client Port', p.port || 50122),
    '',
    'Additional Information:',
    tab('Ticket Options', p.options || '0x40810000'),
    tab('Ticket Encryption Type', p.enc || '0x12'),
    tab('Failure Code', p.result || '0x0'),
    tab('Transited Services', '-'),
    '',
    'This event is generated every time access is requested to a resource such as a computer or a Windows service. The service name indicates the resource to which access was requested.',
  );
}

function w4771(p) {
  return T(
    'Kerberos pre-authentication failed.',
    '',
    'Account Information:',
    tab('Security ID', sidOf(p.user, p.domainSid)),
    tab('Account Name', p.user),
    '',
    'Service Information:',
    tab('Service Name', `krbtgt/${p.netbios || 'HALCYON'}`),
    '',
    'Network Information:',
    tab('Client Address', `::ffff:${p.ip}`),
    tab('Client Port', p.port || 51022),
    '',
    'Additional Information:',
    tab('Ticket Options', '0x40810010'),
    tab('Failure Code', p.result || '0x18'),
    tab('Pre-Authentication Type', 2),
  );
}

const w4776 = (p) => T('The computer attempted to validate the credentials for an account.', '', top('Authentication Package', 'MICROSOFT_AUTHENTICATION_PACKAGE_V1_0'), top('Logon Account', p.user), top('Source Workstation', dash(p.ws)), top('Error Code', p.result || '0x0'));

// ---------- Directory service ----------

const GUID_NAMES = {
  '1131f6aa-9c07-11d1-f79f-00c04fc2dcd2': 'DS-Replication-Get-Changes',
  '1131f6ad-9c07-11d1-f79f-00c04fc2dcd2': 'DS-Replication-Get-Changes-All',
  '89e95b76-444d-4c62-991a-0facbeda640c': 'DS-Replication-Get-Changes-In-Filtered-Set',
};
export const DCSYNC_GUIDS = ['1131f6aa-9c07-11d1-f79f-00c04fc2dcd2', '1131f6ad-9c07-11d1-f79f-00c04fc2dcd2'];
function w4662(p) {
  const guids = p.guids || DCSYNC_GUIDS;
  return T(
    'An operation was performed on an object.',
    '',
    subject({ ...p, by: p.user, byLogonId: p.logonId }),
    '',
    'Object:',
    tab('Object Server', 'DS'),
    tab('Object Type', '%{19195a5b-6da0-11d0-afd3-00c04fd930c9}'),
    tab('Object Name', p.objectName || '%{7c4f3e1a-5b7d-4d0e-9a52-1a6f2c0b9d33}'),
    tab('Handle ID', '0x0'),
    '',
    'Operation:',
    tab('Operation Type', 'Object Access'),
    tab('Accesses', 'Control Access'),
    '',
    tab('Access Mask', '0x100'),
    tab('Properties', `Control Access\n\t${guids.map((g) => `{${g}}`).join('\n\t')}`),
    '',
    'Additional Information:',
    tab('Parameter 1', '-'),
    tab('Parameter 2', ''),
  );
}

function w5136(p) {
  return T(
    'A directory service object was modified.',
    '',
    subject(p),
    '',
    'Directory Service:',
    tab('Name', (p.realm || 'halcyonmutual.local').toLowerCase()),
    tab('Type', 'Active Directory Domain Services'),
    '',
    'Object:',
    tab('DN', p.dn),
    tab('GUID', p.guid || '{8f2e1d0c-6a4b-4d77-9c31-5be0a7d9e412}'),
    tab('Class', p.class || 'groupPolicyContainer'),
    '',
    'Attribute:',
    tab('LDAP Display Name', p.attr),
    tab('Syntax (OID)', p.oid || '2.5.5.12'),
    tab('Value', p.value),
    '',
    'Operation:',
    tab('Type', p.op || 'Value Added'),
    tab('Correlation ID', '{b1c0a5d2-6e3f-4e1a-8f4b-2a9d7c3e5f60}'),
    tab('Application Correlation ID', '-'),
  );
}

function w5140(p) {
  return T(
    'A network share object was accessed.',
    '',
    subject({ ...p, by: p.user }),
    '',
    'Network Information:',
    tab('Object Type', 'File'),
    tab('Source Address', p.ip),
    tab('Source Port', p.port || 49811),
    '',
    'Share Information:',
    tab('Share Name', p.share || '\\\\*\\ADMIN$'),
    tab('Share Path', p.sharePath || '\\??\\C:\\Windows'),
    '',
    'Access Request Information:',
    tab('Access Mask', '0x1'),
    tab('Accesses', 'ReadData (or ListDirectory)'),
  );
}

function w4104(p) {
  return `Creating Scriptblock text (1 of 1):\n${p.script}\n\nScriptBlock ID: ${p.id || 'b5f6a1e2-7c3d-4f90-8a1b-2d4e6f8a0c13'}\nPath: ${p.path || ''}`;
}

// ---------- registry ----------

/**
 * code -> { body, task (TaskCategory), ok (audit success?), log, source (SourceName), label (short name for the game's one-liners),
 *           summary(p) -> the "k=v" tail of the compact line }
 */
const SEC = 'Microsoft Windows security auditing.';
export const WIN_EVENTS = {
  4624: { body: w4624, task: 'Logon', ok: true, label: 'LOGON OK', summary: (p) => `user=${p.user} logon_type=${p.type ?? 3} src_ip=${dash(p.ip)} workstation=${dash(p.ws)}` },
  4625: { body: w4625, task: 'Logon', ok: false, label: 'LOGON FAILED', summary: (p) => `user=${p.user} logon_type=${p.type ?? 3} src_ip=${dash(p.ip)} workstation=${dash(p.ws)} sub_status=${p.subStatus || '0xC000006A'}` },
  4634: { body: w4634, task: 'Logoff', ok: true, label: 'LOGOFF', summary: (p) => `user=${p.user} logon_type=${p.type ?? 3}` },
  4647: { body: w4647, task: 'Logoff', ok: true, label: 'LOGOFF', summary: (p) => `user=${p.user}` },
  4648: { body: w4648, task: 'Logon', ok: true, label: 'EXPLICIT CREDS', summary: (p) => `by=${p.by} used_creds_of=${p.user} target=${p.target || 'localhost'}` },
  4672: { body: w4672, task: 'Special Logon', ok: true, label: 'ADMIN LOGON', summary: (p) => `user=${p.user} privileges=SeDebugPrivilege,SeBackupPrivilege,...` },
  4688: { body: w4688, task: 'Process Creation', ok: true, label: 'PROCESS', summary: (p) => `user=${p.user || 'SYSTEM'} process=${p.proc.split('\\').pop()} parent=${p.parent.split('\\').pop()} cmd="${p.cmd ?? ''}"` },
  4697: { body: w4697, task: 'Security System Extension', ok: true, label: 'SERVICE INSTALLED', summary: (p) => `service=${p.service} path=${p.path}` },
  4698: { body: w4698, task: 'Other Object Access Events', ok: true, label: 'TASK CREATED', summary: (p) => `by=${p.by} task=${p.task} command=${p.command || ''} ${p.args || ''}` },
  1102: { body: w1102, task: 'Log clear', ok: true, label: 'LOG CLEARED', log: 'Security', source: 'Microsoft-Windows-Eventlog', summary: (p) => `The audit log was cleared by=${p.by}` },
  7045: { body: w7045, task: 'None', ok: true, label: 'SERVICE INSTALLED', log: 'System', source: 'Service Control Manager', type: 'Information', summary: (p) => `service=${p.service} path=${p.path} account=${p.account || 'LocalSystem'}` },
  4720: { body: w4720, task: 'User Account Management', ok: true, label: 'USER CREATED', summary: (p) => `by=${p.by} new_user=${p.user}` },
  4722: { body: wAcct(4722), task: 'User Account Management', ok: true, label: 'USER ENABLED', summary: (p) => `by=${p.by} user=${p.user}` },
  4723: { body: wAcct(4723), task: 'User Account Management', ok: true, label: 'PASSWORD CHANGE', summary: (p) => `by=${p.by} user=${p.user}` },
  4724: { body: wAcct(4724), task: 'User Account Management', ok: true, label: 'PASSWORD RESET', summary: (p) => `by=${p.by} user=${p.user}` },
  4725: { body: wAcct(4725), task: 'User Account Management', ok: true, label: 'USER DISABLED', summary: (p) => `by=${p.by} user=${p.user}` },
  4726: { body: wAcct(4726), task: 'User Account Management', ok: true, label: 'USER DELETED', summary: (p) => `by=${p.by} user=${p.user}` },
  4738: { body: w4738, task: 'User Account Management', ok: true, label: 'USER CHANGED', summary: (p) => `by=${p.by} user=${p.user} new_uac=${p.newUac || '-'}` },
  4740: { body: wAcct(4740), task: 'User Account Management', ok: true, label: 'LOCKOUT', summary: (p) => `user=${p.user} caller=${p.ws || '-'}` },
  4767: { body: wAcct(4767), task: 'User Account Management', ok: true, label: 'UNLOCKED', summary: (p) => `by=${p.by} user=${p.user}` },
  4728: { body: wGroup(4728), task: 'Security Group Management', ok: true, label: 'GROUP ADD', summary: (p) => `by=${p.by} member=${p.member} group="${p.group}"` },
  4729: { body: wGroup(4729), task: 'Security Group Management', ok: true, label: 'GROUP REMOVE', summary: (p) => `by=${p.by} member=${p.member} group="${p.group}"` },
  4732: { body: wGroup(4732), task: 'Security Group Management', ok: true, label: 'LOCAL GROUP ADD', summary: (p) => `by=${p.by} member=${p.member} group="${p.group}"` },
  4733: { body: wGroup(4733), task: 'Security Group Management', ok: true, label: 'LOCAL GROUP REMOVE', summary: (p) => `by=${p.by} member=${p.member} group="${p.group}"` },
  4756: { body: wGroup(4756), task: 'Security Group Management', ok: true, label: 'UNIVERSAL GROUP ADD', summary: (p) => `by=${p.by} member=${p.member} group="${p.group}"` },
  4768: { body: w4768, task: 'Kerberos Authentication Service', ok: true, label: 'KERBEROS TGT', summary: (p) => `user=${p.user} src_ip=${p.ip} result=${p.result || '0x0'} enc=${p.enc || '0x12'}` },
  4769: { body: w4769, task: 'Kerberos Service Ticket Operations', ok: true, label: 'KERBEROS TGS', summary: (p) => `user=${p.user} service=${p.service} src_ip=${p.ip} enc=${p.enc || '0x12'} result=${p.result || '0x0'}` },
  4771: { body: w4771, task: 'Kerberos Authentication Service', ok: false, label: 'KERBEROS PREAUTH FAILED', summary: (p) => `user=${p.user} src_ip=${p.ip} failure=${p.result || '0x18'}` },
  4776: { body: w4776, task: 'Credential Validation', ok: (p) => !p?.result || p.result === '0x0', label: 'NTLM VALIDATION', summary: (p) => `user=${p.user} workstation=${dash(p.ws)} error=${p.result || '0x0'}` },
  4662: { body: w4662, task: 'Directory Service Access', ok: true, label: 'DS OBJECT ACCESS', summary: (p) => `user=${p.user} object_type=domainDNS properties=${(p.guids || DCSYNC_GUIDS).map((g) => GUID_NAMES[g] || g).join(',')}` },
  5136: { body: w5136, task: 'Directory Service Changes', ok: true, label: 'DS OBJECT MODIFIED', summary: (p) => `by=${p.by} dn="${p.dn}" attribute=${p.attr}` },
  5140: { body: w5140, task: 'File Share', ok: true, label: 'SHARE ACCESSED', summary: (p) => `user=${p.user} share=${p.share || '\\\\*\\ADMIN$'} src_ip=${p.ip}` },
  4104: { body: w4104, task: 'Execute a Remote Command', ok: true, label: 'POWERSHELL', log: 'Microsoft-Windows-PowerShell/Operational', source: 'Microsoft-Windows-PowerShell', type: 'Verbose', summary: (p) => `user=${p.user} scriptblock="${String(p.script).slice(0, 120).replace(/\s+/g, ' ')}"` },
};

export const EVENT_LABEL = Object.fromEntries(Object.entries(WIN_EVENTS).map(([k, v]) => [k, v.label]));

export const supported = (code) => !!WIN_EVENTS[code];

/** The compact one-liner the game searches and shows in evidence lists (same shape the original logs used). */
export function summary(code, p) {
  const spec = WIN_EVENTS[code];
  const body = spec.body(p).split('\n')[0].replace(/:$/, '');
  return `EventID=${code} ${body}. ${spec.summary(p)}`;
}

export const eventBody = (code, p) => WIN_EVENTS[code].body(p);

/**
 * Put the Splunk Windows add-on header in front of a message body.
 * @param {{code:number|string, body:string, host:string, domain:string, stamp:string, record:number, ok?:boolean}} o
 */
export function wrapWinEvent({ code, body, host, domain = 'halcyonmutual.local', stamp, record, ok = true }) {
  const spec = WIN_EVENTS[code] || {};
  const log = spec.log || 'Security';
  const source = spec.source || SEC;
  const audit = log === 'Security';
  const lines = [
    stamp,
    `LogName=${log}`,
    `EventCode=${code}`,
    `EventType=${spec.type === 'Information' ? 4 : 0}`,
    `ComputerName=${host.toUpperCase()}.${domain}`,
    `SourceName=${source}`,
    `Type=${spec.type || 'Information'}`,
    `RecordNumber=${record}`,
    `Keywords=${audit ? (ok ? 'Audit Success' : 'Audit Failure') : 'Classic'}`,
    `TaskCategory=${spec.task || 'None'}`,
    'OpCode=Info',
    `Message=${body}`,
  ];
  return lines.join('\n');
}

// ---------- Sysmon (Microsoft-Windows-Sysmon/Operational), as Splunk's XmlWinEventLog prints it ----------

const SYSMON_TASK = { 1: 'Process Create (rule: ProcessCreate)', 3: 'Network connection detected (rule: NetworkConnect)', 7: 'Image loaded (rule: ImageLoad)', 8: 'CreateRemoteThread detected (rule: CreateRemoteThread)', 10: 'Process accessed (rule: ProcessAccess)', 11: 'File created (rule: FileCreate)', 13: 'Registry value set (rule: RegistryEvent)', 22: 'Dns query (rule: DnsQuery)' };
const SYSMON_VER = { 1: 5, 3: 5, 7: 3, 8: 2, 10: 3, 11: 2, 13: 2, 22: 5 };

const xmlEsc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * @param {number} id Sysmon event id (1, 3, 7, 8, 10, 11, 13, 22)
 * @param {{host:string, domain?:string, utc:string, record:number, data:Array<[string,string]>}} o data = ordered Name/Value pairs
 */
export function sysmonXml(id, { host, domain = 'halcyonmutual.local', utc, record, data }) {
  const d = data.map(([k, v]) => `<Data Name='${k}'>${xmlEsc(v)}</Data>`).join('');
  return `<Event xmlns='http://schemas.microsoft.com/win/2004/08/events/event'><System><Provider Name='Microsoft-Windows-Sysmon' Guid='{5770385F-C22A-43E0-BF4C-06F5698FFBD9}'/><EventID>${id}</EventID><Version>${SYSMON_VER[id] || 3}</Version><Level>4</Level><Task>${id}</Task><Opcode>0</Opcode><Keywords>0x8000000000000000</Keywords><TimeCreated SystemTime='${utc}'/><EventRecordID>${record}</EventRecordID><Correlation/><Execution ProcessID='3412' ThreadID='4920'/><Channel>Microsoft-Windows-Sysmon/Operational</Channel><Computer>${host.toUpperCase()}.${domain}</Computer><Security UserID='S-1-5-18'/></System><EventData>${d}</EventData></Event>`;
}

export const SYSMON_TASKS = SYSMON_TASK;
