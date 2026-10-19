// Lab: "The service account that knew too much". A fictional Active Directory intrusion at Halcyon Mutual, built from real,
// documented techniques (Kerberoasting, LSASS dumping, DCSync) so every log line, PowerShell result and AD property looks
// like the real thing. Same engine as the week and the Case Files (see src/days/index.js for every field); caseFile.kind = 'lab'
// tells the menu and the report this is a training scenario, not a recreation of a real breach.
import { EMAILS, PAGES, REPLY_DRAFTS } from './emails.js';
import { generateLogs, ALERTS, CASE, IP_INFO, DATE, C2 } from './logs.js';
import { DB_TALK, DB_SCORE } from './talk.js';
import { TICKETS } from './tickets.js';
import { halcyonDirectory } from '../../data/halcyonDirectory.js';
import { scoreEmail, scoreCase, scoreTicket, scoreConversation, finalize } from '../../game/scoring.js';

const MAIN = 'ad-dcsync';
// Looking at who is in Domain Admins: PowerShell (Get-ADGroupMember, net group), or opening the group or svc_updater in AD Users and Computers.
const AD_RE = /(domain admins|svc_updater|get-adgroupmember|get-aduser|net group)/i;

function adItem(st) {
  const cmds = st.events.filter((e) => e.type === 'terminal-cmd' && e.shell === 'pwsh');
  const opens = st.events.filter((e) => e.type === 'ad-open');
  const found = cmds.some((e) => AD_RE.test(e.cmd)) || opens.some((e) => /domain admins|svc_updater/i.test(e.sam));
  const used = cmds.length + opens.length;
  return {
    id: 'ad',
    area: 'Active Directory',
    title: 'Find the Domain Admin nobody created',
    max: 10,
    teaches: { skill: 'Audit privileged group membership in Active Directory (PowerShell or AD Users and Computers)', secplus: '4.6 Identity and access management: privileged accounts' },
    outcome: found ? 'good' : used ? 'ok' : 'bad',
    points: found ? 10 : used ? 4 : 0,
    what: found ? 'You checked who is in Domain Admins and found svc_updater: created at 3:12 AM, password never expires, not in any change ticket.' : used ? 'You opened Active Directory but never looked at Domain Admins.' : 'You never looked at Active Directory.',
    why: 'Logs say what happened; the directory says what is left behind. A new member of Domain Admins at 3 AM, created by a.admin from the database server, is persistence: it survives a reboot, a password reset on the first victim, and a firewall block. Real defenders compare privileged group membership to the last known good list on every incident.',
  };
}

function score(st) {
  return finalize([
    ...EMAILS.map((e) => scoreEmail(e, st.mail?.[e.id])),
    scoreConversation(DB_SCORE, st.enc?.db),
    ...TICKETS.map((t) => scoreTicket(t, st.tickets?.[t.id])),
    adItem(st),
    scoreCase(CASE, st.soc?.cases?.[MAIN]),
  ]);
}

function debrief(st) {
  const r = score(st);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const lines = ["Okay. Lab over. Let's walk through what the attacker really did, one technique at a time."];
  if (by.case.outcome === 'good') lines.push('Your write-up matches the chain: a macro on a sales laptop, Kerberoasting for svc_sql, a PsExec hop and an LSASS dump on the database server, DCSync with a.admin, and a hidden Domain Admin for persistence.');
  else if (st.soc?.cases?.[MAIN]) lines.push('Your write-up missed part of the chain. In order: a phished laptop, Kerberoasting (RC4 tickets for service accounts), svc_sql used to reach the database server, an LSASS dump that took a.admin\'s credentials, then DCSync and a new Domain Admin.');
  else lines.push('You never wrote it up. svc_updater is still a Domain Admin, and the attacker holds every password hash in the domain.');
  if (by.case.contained) lines.push('You isolated the machines and reset krbtgt twice. That is the Microsoft guidance for a domain compromise: the old password stays valid until the second reset.');
  if (st.enc?.db?.outcome === 'preserve-isolate') lines.push('On the database server you isolated first and kept the memory. That is why the dump command and the stolen credentials can still be proven.');
  else if (st.enc?.db?.outcome === 'rebooted') lines.push('You rebooted the database server. That cleared the memory where the credential theft tools and the dump command lived.');
  else if (st.enc?.db?.outcome === 'left') lines.push('You left the database server connected. The attacker had a foothold there.');
  if (by.ad.outcome === 'good') lines.push('And you found svc_updater in Domain Admins. A group that grows overnight is the loudest persistence signal there is.');
  if (st.tickets?.['contractor-da'] === 'add' || st.tickets?.['contractor-da']?.choice === 'add') lines.push('You added the contractor to Domain Admins on request. On the weekend of an intrusion, that is one more credential to steal.');
  if (st.mail?.['m365-expire']?.enteredCreds) lines.push('And you gave your password to the "password expires" phish. Weekends are when scammers expect nobody to look.');
  lines.push('The technical lesson in one line: nothing here was a vulnerability. It was an old password, an admin session left on a server, and no alert on the replication rights. Fix those three and the same attack fails at step two.');
  lines.push("Here's your lab report, and what you can honestly say you've done.");
  return lines;
}

function terminal() {
  const logs = generateLogs({ nowMinutes: 24 * 60 });
  const cmdlines = logs
    .filter((e) => e.fields?.EventCode?.[0] === '4688')
    .map((e) => `${e.time} ${e.host} ${(e.fields.Account_Name?.[1] ?? e.fields.Account_Name?.[0] ?? '-')} ${e.fields.Process_Command_Line?.[0] ?? ''}`)
    .join('\n');
  return {
    date: 'Sat Oct 24 2026',
    note: 'Process command lines exported from the SIEM are in /var/log/remote/cmdlines.log.',
    files: {
      '/var/log/remote/cmdlines.log': `${cmdlines}\n`,
      '/home/analyst01/README.txt': [
        'Tips from Priya:',
        '  grep -i " -enc " /var/log/remote/cmdlines.log                 any encoded PowerShell?',
        "  grep -i -o -E 'enc [A-Za-z0-9+/=]+' /var/log/remote/cmdlines.log   pull the base64 out",
        '  echo <base64> | base64 -d                                      decode it (PowerShell -enc is base64)',
        '  whois 203.0.113.45                                             who owns the C2 address?',
        '',
        'Windows and Active Directory work happens in the PowerShell app, not here.',
        '',
      ].join('\n'),
      '/home/analyst01/iocs.txt': `${C2}   C2 server (USB stick and fake invoice, week one; now Mike's workstation)\n`,
    },
    whois: {
      [C2]: ['inetnum:        203.0.113.0 - 203.0.113.255', 'netname:        TEST-NET-3', 'descr:          Reserved for documentation (replay stand-in for the attacker address)', 'org-name:       AS-KRANNET hosting', 'country:        MD', 'abuse-mailbox:  abuse@krannet.example'].join('\n'),
    },
    dns: {},
  };
}

function powershell() {
  return {
    host: 'SOC-WIN01',
    winfs: {
      'C:\\Users\\analyst01\\hunting.txt': [
        'Priya\'s starter hunts (copy and run):',
        '',
        'Get-ADGroupMember "Domain Admins" | Select-Object Name, SamAccountName',
        'Get-ADUser svc_updater -Properties Created, PasswordNeverExpires, MemberOf',
        'Get-ADUser -Filter {ServicePrincipalName -like "*"} -Properties ServicePrincipalName, PasswordLastSet | Select-Object Name, PasswordLastSet',
        'Get-ADUser -Filter * -Properties Created | Sort-Object Created -Descending | Select-Object -First 3 Name, Created',
        "Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4769} | Where-Object { $_.Message -match '0x17' } | Select-Object -First 5 TimeCreated, Id",
        "Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4662} | Where-Object { $_.Message -match 'a.admin' } | Measure-Object",
        '',
      ].join('\n'),
      'C:\\Users\\analyst01\\Documents\\notes.txt': 'Mike Chen: Invoice_8841.docm, Enable Content, Fri night.\n',
    },
  };
}

export default {
  n: 2,
  caseId: 'halcyon-ad-2026',
  date: DATE,
  title: 'Halcyon Mutual · Oct 24, 2026 (lab)',
  start: 8 * 60 + 5,
  endAt: 11 * 60 + 30,
  intro: ['Lab: the service account that knew too much.', 'Saturday on-call at Halcyon Mutual. Priya is in too.'],
  badgeAtStart: true,
  cast: ['mike', 'theo'],

  emails: EMAILS,
  pages: PAGES,
  replyDrafts: REPLY_DRAFTS,
  logs: (st) => generateLogs({ nowMinutes: st.minutes }),
  ipInfo: IP_INFO,
  alerts: ALERTS,
  tickets: TICKETS,
  directory: halcyonDirectory({
    users: [
      { sam: 'svc_updater', display: 'svc_updater', ou: 'Users', service: true, mail: '', desc: '', memberOf: ['Domain Admins'], neverExpires: true, adminCount: 1, pwdLastSet: '2026-10-24', pwdTime: '3:12:31 AM', created: '2026-10-24', createdTime: '3:12:30 AM', logonCount: 2, lastLogon: '2026-10-24' },
    ],
    computers: [{ name: 'NAS01', ou: 'Servers', ip: '10.0.3.77', os: 'Linux (Samba 4.13)', osVersion: '4.13', desc: 'Old file appliance. Only speaks RC4 Kerberos.', role: 'Server' }],
  }),
  terminal: terminal(),
  powershell: powershell(),

  npcLines: {
    priya: {
      talk: [
        'Welcome to the lab. This one is made up, but every technique in it is real and every log line looks like the real thing.',
        "It's Saturday, October 24, 2026, 8:05 AM. I'm on call too. Mike texted me about an invoice and a loud laptop, and the SIEM has started flagging a few things.",
        "You have two new tools today. The PowerShell app has the Active Directory cmdlets (Get-ADUser and friends). AD Users and Computers shows the directory the way Dana sees it. Try View, Advanced Features.",
        'Start with your inbox.',
      ],
      again: ['Inbox first. Then the identity queue.'],
    },
    dana: { talk: ["I'm on the weekend rota. I patched CLAIMS-DB01 yesterday and I'm hoping that's not related."], again: ['My admin account is a.admin. Please do not tell me it is in the alerts.'] },
    mike: { talk: ["I'm Mike from Sales. I opened one invoice. One."], again: ['Is my laptop going to be okay?'] },
    theo: { talk: ["I'm the database engineer on call. CLAIMS-DB01 is mine."], again: ['If you need the claims server, ask me first.'] },
  },

  objectives: [
    { id: 'priya', type: 'talk', text: 'Get the lab briefing from Priya' },
    { id: 'my-desk', type: 'sit', text: 'Sit down at your desk' },
    { id: 'inbox', type: 'inbox', target: 'my-desk', text: 'Go through the security inbox' },
    { id: 'db', type: 'encounter', target: 'theo', text: 'Theo is coming over about the database server', waitText: 'Someone is on the way to talk to you.' },
    { id: 'tickets', type: 'tickets', target: 'my-desk', text: 'Work through the identity request queue' },
    { id: 'ad', type: 'terminal', match: AD_RE, target: 'my-desk', waitFor: 'alert', text: 'Check who is in Domain Admins (PowerShell, or AD Users and Computers)', waitText: 'Waiting on the SIEM.' },
    { id: 'server-door', type: 'badge', text: 'Badge into the server room' },
    { id: 'soc', type: 'case', target: 'soc', text: 'Work the case at the SOC console' },
    { id: 'debrief', type: 'debrief', target: 'priya', text: 'Debrief with Priya: what the attacker did' },
  ],
  encounters: [{ id: 'db', type: 'walkup', npc: 'theo', after: 'inbox', delayMs: 1500, fallbackAt: 8 * 60 + 40, intro: 'Hey! Got a minute? Something is off on the claims server.', conv: DB_TALK }],

  score,
  debrief,

  caseFile: {
    id: 'halcyon-ad-2026',
    kind: 'lab',
    company: 'Halcyon Mutual',
    when: 'Oct 24, 2026 · Lab',
    title: 'The service account that knew too much',
    pitch: 'A salesperson clicks "Enable Content". By 3 AM the attacker has Kerberoasted a service account, dumped LSASS on the database server, replicated every password hash in the domain with DCSync, and added a hidden Domain Admin. Investigate it in real Windows event logs, PowerShell and AD Users and Computers.',
    tags: ['Active Directory', 'Kerberoasting', 'DCSync', 'Lateral movement', 'Windows event logs'],
    difficulty: 'Advanced',
    headline: 'A macro document on a sales laptop led to Kerberoasting of svc_sql, a PsExec hop to CLAIMS-DB01, an LSASS memory dump that exposed a domain admin session, a DCSync against DC01 and a new Domain Admin (svc_updater), all inside three hours and none of it triggering a failed-logon alert.',
    timeline: [
      { when: 'Fri 16:38', what: 'Dana\'s admin account (a.admin) RDPs to CLAIMS-DB01 to patch it, and the session is left Disconnected. Its credentials stay in the server\'s memory.' },
      { when: 'Sat 00:41', what: 'On WS-0131, WINWORD.EXE (Invoice_8841.docm, "Enable Content") starts powershell.exe -nop -w hidden -enc ..., which downloads a stager from 203.0.113.45. Sysmon 1, Security 4688, PowerShell 4104.' },
      { when: 'Sat 00:52', what: 'Discovery with built-in tools: net group "Domain Admins" /domain, nltest /dclist, setspn -Q */* (T1087, T1018, T1558.003 recon).' },
      { when: 'Sat 01:04', what: 'Kerberoasting: DC01 logs two 4769 events for svc_sql and svc_web from WS-0131 with Ticket Encryption Type 0x17 (RC4) in two seconds. Cracked offline.' },
      { when: 'Sat 02:09', what: 'svc_sql signs in from WS-0131 (4768, 4624 type 3 on CLAIMS-DB01). Admin share access (5140), PSEXESVC installed (7045), quser to find logged-on admins.' },
      { when: 'Sat 02:13', what: 'rundll32.exe comsvcs.dll, MiniDump 712 ... ms.dmp full: an LSASS memory dump (Sysmon 10 access 0x1fffff). The file is copied to WS-0131 and deleted.' },
      { when: 'Sat 03:04', what: 'DC01 logs a TGT for a.admin with RC4 (0x17) from CLAIMS-DB01 (overpass-the-hash), then three 4662 events with the replication rights: DCSync.' },
      { when: 'Sat 03:12', what: 'a.admin (the stolen session) creates svc_updater (4720), resets its password (4724), makes it never-expire (4738) and adds it to Domain Admins (4728).' },
      { when: 'Sat 08:05', what: 'Your shift. Mike\'s message and the AD health digest are in the inbox; the first alert fires at 08:40.' },
    ],
    realOutcome: [
      'Kerberoasting needs no special rights. Any domain user can ask a domain controller for a service ticket for any account that has an SPN, and the ticket is encrypted with that account\'s password. Cracking happens offline, so there are no failed logons to alert on.',
      'DCSync abuses the replication protocol domain controllers use to stay in sync. Anyone with the "Replicating Directory Changes" and "...All" rights (Domain Admins have them by default) can ask a DC for any account\'s password hash, including krbtgt.',
      'Credentials live in LSASS memory for as long as a session exists on a machine. An admin who signs in to a server, or leaves a session disconnected, leaves something an attacker with local admin can take.',
      'With the krbtgt hash an attacker can forge tickets (a "golden ticket"). That is why a domain compromise ends with resetting krbtgt twice, then every admin and service account.',
    ],
    failures: [
      'A service account password from 2018, never expiring, on an account with an SPN: crackable offline.',
      'RC4 allowed for user-account service tickets, which makes cracking far faster than AES.',
      'A Domain Admin account (a.admin) logged on to a database server and left a session behind: no tiering.',
      'svc_sql had local admin on a server it needed only as a service: more rights than the job needs.',
      'No alert for DCSync (4662 by a non-DC), and none for RC4 tickets to user accounts. The weekly health report listed the gaps and nobody was paged.',
      'A macro-enabled document was allowed to run PowerShell with a hidden window on a sales workstation.',
    ],
    attack: [
      { id: 'T1204.002', name: 'User Execution: Malicious File', fix: 'Block macros from the internet (Mark-of-the-Web), disable Office macros by policy, and block child processes of Office apps with attack surface reduction rules.' },
      { id: 'T1558.003', name: 'Steal or Forge Kerberos Tickets: Kerberoasting', fix: 'Use group managed service accounts or 25+ character random passwords, require AES, and alert on 4769 with encryption 0x17 for user accounts.' },
      { id: 'T1021.002', name: 'Remote Services: SMB/Windows Admin Shares', fix: 'Remove local admin from service accounts, restrict workstation-to-server SMB, and alert on PSEXESVC installs (7045) and ADMIN$ access from workstations.' },
      { id: 'T1003.001', name: 'OS Credential Dumping: LSASS Memory', fix: 'Turn on Credential Guard and LSA protection, put admins in Protected Users, never sign admins in to lower-tier machines, and alert on Sysmon 10 access to lsass.exe.' },
      { id: 'T1003.006', name: 'OS Credential Dumping: DCSync', fix: 'Alert on 4662 with the replication rights from any account that is not a domain controller, and review who holds those rights.' },
      { id: 'T1136.002', name: 'Create Account: Domain Account', fix: 'Alert on new members of Domain Admins (4728, 4756) and compare privileged groups with a known good list; reset krbtgt twice after a domain compromise.' },
    ],
    resume: 'Investigated a simulated Active Directory intrusion in Cyber Office: traced a macro-phished workstation through Kerberoasting (event 4769, RC4), PsExec lateral movement and an LSASS dump to a DCSync (event 4662) and a rogue Domain Admin using Windows Security and Sysmon logs, PowerShell AD cmdlets and AD Users and Computers (MITRE ATT&CK T1558.003, T1003.001, T1003.006), then wrote a containment plan including a double krbtgt reset. Score: {grade}.',
    sources: [
      { title: 'MITRE ATT&CK: Steal or Forge Kerberos Tickets: Kerberoasting (T1558.003)', url: 'https://attack.mitre.org/techniques/T1558/003/' },
      { title: 'MITRE ATT&CK: OS Credential Dumping: DCSync (T1003.006)', url: 'https://attack.mitre.org/techniques/T1003/006/' },
      { title: 'MITRE ATT&CK: OS Credential Dumping: LSASS Memory (T1003.001)', url: 'https://attack.mitre.org/techniques/T1003/001/' },
      { title: 'Microsoft Learn: 4769(S, F): A Kerberos service ticket was requested', url: 'https://learn.microsoft.com/en-us/windows/security/threat-protection/auditing/event-4769' },
      { title: 'Microsoft Learn: 4662(S, F): An operation was performed on an object', url: 'https://learn.microsoft.com/en-us/windows/security/threat-protection/auditing/event-4662' },
      { title: 'Microsoft Learn: AD Forest Recovery, resetting the krbtgt password', url: 'https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/ad-forest-recovery-resetting-the-krbtgt-password' },
      { title: 'Microsoft Support: KB5020805, How to manage Kerberos protocol changes related to CVE-2022-37966', url: 'https://support.microsoft.com/en-us/topic/kb5020805-how-to-manage-kerberos-protocol-changes-related-to-cve-2022-37966-fd837ac3-cdec-4e76-a6ec-86e67501407d' },
    ],
    disclaimer: 'A fictional training scenario. Halcyon Mutual, its staff, hostnames, accounts and IP addresses (documentation ranges) are invented, and no real organization is depicted. The techniques are real and the log formats follow Microsoft\'s documentation of each event ID: Security 4624, 4662, 4688, 4720, 4724, 4728, 4738, 4768, 4769, 5140, System 7045, PowerShell 4104 and Sysmon 1, 3, 10 and 11. Command lines are reproduced as defenders see them; the macro and stager are not provided. Timings and the number of events are compressed for play. Dollar costs in your report are estimates for this lab.',
  },
};
