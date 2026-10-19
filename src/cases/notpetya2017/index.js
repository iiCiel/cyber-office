// Case file: A.P. Moller-Maersk / NotPetya, June 27, 2017. A recreation of a real incident, built from public sources: the Active
// Directory case. Same engine as the week (see src/days/index.js for every field); plus caseFile, which drives the Case Files
// menu card and the "what really happened" half of the report. Player scoring is in scoreItems below.
import { EMAILS, PAGES, REPLY_DRAFTS } from './emails.js';
import { generateLogs, ALERTS, CASE, IP_INFO, DATE, MEDOC_IP } from './logs.js';
import { DC_TALK, DC_SCORE, USERS_TALK, USERS_SCORE } from './talk.js';
import { TICKETS } from './tickets.js';
import { HOSTS, PLAN, corpDirectory, hhmm } from './hosts.js';
import { scoreEmail, scoreCase, scoreTicket, scoreConversation, finalize } from '../../game/scoring.js';

const MAIN = 'ad-worm';
// Checking the state of the domain controllers: PowerShell (Get-ADDomainController, repadmin, nltest /dclist, Get-ADComputer) or AD Users and Computers.
const AD_RE = /(get-addomaincontroller|repadmin|dcdiag|nltest.*dclist|dc-gh01|get-adcomputer|domain controllers)/i;

function adItem(st) {
  const cmds = st.events.filter((e) => e.type === 'terminal-cmd' && e.shell === 'pwsh');
  const opens = st.events.filter((e) => e.type === 'ad-open');
  const ghana = cmds.some((e) => /dc-gh01|repadmin/i.test(e.cmd)) || opens.some((e) => /dc-gh01/i.test(e.sam));
  const found = ghana || cmds.some((e) => AD_RE.test(e.cmd)) || opens.some((e) => AD_RE.test(e.sam));
  const used = cmds.length + opens.length;
  return {
    id: 'ad',
    area: 'Active Directory',
    title: 'Find out which domain controllers are still alive',
    max: 10,
    teaches: { skill: 'Check the health and replication state of domain controllers (repadmin, Get-ADDomainController, AD Users and Computers)', secplus: '4.9 Use data sources; 3.4 Resilience' },
    outcome: ghana ? 'good' : found ? 'ok' : used ? 'ok' : 'bad',
    points: ghana ? 10 : found ? 7 : used ? 3 : 0,
    what: ghana ? 'You checked the domain controllers and saw DC-GH01 failing replication since 06:13: the Ghana controller has been dark since the power cut and has not been touched.' : found ? 'You looked at the domain controllers but did not look at the replication state of DC-GH01.' : used ? 'You used PowerShell, but never looked at the domain controllers.' : 'You never looked at Active Directory.',
    why: 'In an Active Directory incident the first question after "what is infected?" is "what is still clean?". Replication shows it: a controller that stopped replicating hours before the attack holds a copy of the domain the attacker never reached. In the real incident, one such controller in Ghana is how the company\'s domain was rebuilt.',
  };
}

function score(st) {
  return finalize([
    ...EMAILS.map((e) => scoreEmail(e, st.mail?.[e.id])),
    scoreConversation(DC_SCORE, st.enc?.dc),
    scoreConversation(USERS_SCORE, st.enc?.users),
    ...TICKETS.map((t) => scoreTicket(t, st.tickets?.[t.id])),
    adItem(st),
    scoreCase(CASE, st.soc?.cases?.[MAIN]),
  ]);
}

function debrief(st) {
  const r = score(st);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const lines = ["Okay. Replay over. Let's compare you to the public record."];
  if (by.case.outcome === 'good') lines.push('Your write-up matches the public account: a poisoned update from the Ukrainian tax software, stolen credentials, PsExec and WMIC across the network, the SMBv1 exploit for the unpatched machines, and a queued reboot that destroys each machine.');
  else if (st.soc?.cases?.[MAIN]) lines.push('Your write-up missed part of the chain. As documented: a malicious update from M.E.Doc, a Mimikatz-like tool stealing credentials, spread by PsExec and WMIC with those credentials, the EternalBlue and EternalRomance exploits, then a scheduled reboot that overwrites the boot record and encrypts the file table.');
  else lines.push('You never wrote it up. In the real incident the whole company was inside the blast radius within minutes.');
  if (by.case.contained) lines.push('You cut SMB between sites and kept a clean copy of Active Directory. That is the recovery the real company ended up with, by luck: a domain controller in Ghana had been switched off by a power outage.');
  if (st.enc?.dc?.outcome === 'preserve-clean') lines.push('On the domain controllers you protected a clean copy first. In the real incident, no one had planned that. The surviving controller was found after the fact, and its data had to be carried out of Ghana because the network link was too slow, as Wired reported.');
  else if (st.enc?.dc?.outcome === 'rebooted') lines.push('You rebooted the controllers. The reboot is the weapon: the queued "shutdown /r /f" runs the code that overwrites the boot record.');
  else if (st.enc?.dc?.outcome === 'replugged') lines.push('You plugged the Ghana controller back in during the outbreak. It was the one copy the worm had not touched.');
  if (st.enc?.users?.outcome === 'power-off') lines.push('Your user message was the right one: power off at the disk-repair screen, and do not restart the others.');
  else if (st.enc?.users?.outcome === 'restart-all') lines.push('Telling everyone to restart brought the wipe forward on machines that still had time.');
  if (by.ad.outcome === 'good') lines.push('And you checked replication and saw DC-GH01: the machine the real recovery depended on.');
  if (st.mail?.['vaccine-phish']?.enteredCreds) lines.push('And you gave your password to the "Petya vaccine" phish. Breaking news attracts scammers within hours.');
  lines.push('The costs. Maersk said the attack would cost USD 200-300 million in lost results, and its chairman said later it reinstalled 4,000 servers, 45,000 PCs and 2,500 applications in about ten days (Davos 2019). The White House called NotPetya "the most destructive and costly cyber-attack in history" in February 2018 and attributed it to the Russian military. Maersk was not the target: it was collateral damage from an attack on Ukraine.');
  lines.push('The technical lesson in one line: none of this needed a new weapon. It was an unpatched SMBv1 flaw, one local Administrator password, a Domain Admin cached on workstations, a flat network, and no backup of Active Directory. Fix those five and the same worm stops at one PC.');
  lines.push("Here's your case report, and what you can honestly say you've done.");
  return lines;
}

// ---------------------------------------------------------------------------------------------- terminal and PowerShell
function terminal() {
  const logs = generateLogs({ nowMinutes: 24 * 60 });
  const cmdlines = logs
    .filter((e) => e.fields?.EventCode?.[0] === '4688')
    .map((e) => `${e.time} ${e.host} ${(e.fields.Account_Name?.[1] ?? e.fields.Account_Name?.[0] ?? '-')} ${e.fields.Process_Command_Line?.[0] ?? ''}`)
    .join('\n');
  const idsLog = logs.filter((e) => e.source === 'ids').map((e) => e.raw).join('\n');
  return {
    date: 'Tue Jun 27 2017',
    note: 'Process command lines and IDS alerts exported from the SIEM are in /var/log/remote/.',
    files: {
      '/var/log/remote/cmdlines.log': `${cmdlines}\n`,
      '/var/log/remote/ids.log': `${idsLog}\n`,
      '/home/analyst01/README.txt': [
        'Tips from Priya:',
        '  grep -i psexec /var/log/remote/cmdlines.log                   who is running PsExec? (remember: the real one is "psexec", the worm renames it)',
        '  grep -i -E "dllhost.dat|perfc.dat" /var/log/remote/cmdlines.log   the worm\'s files',
        '  grep -i wmic /var/log/remote/cmdlines.log | grep -i "process call"   WMIC spreading vs IT inventory',
        '  grep -i schtasks /var/log/remote/cmdlines.log | awk \'{print $2, $NF}\'   host and reboot time',
        '  grep 42944 /var/log/remote/ids.log                            the SMBv1 exploit alerts',
        '',
        'Windows and Active Directory work happens in the PowerShell app, not here.',
        '',
      ].join('\n'),
      '/home/analyst01/iocs.txt': [
        'Published indicators for the Petya/NotPetya outbreak (vendor write-ups, June 2017):',
        '  C:\\Windows\\perfc.dat                 main payload (a DLL; export #1 started with rundll32.exe)  [Microsoft, Talos]',
        '  C:\\Windows\\dllhost.dat               a renamed copy of Sysinternals PsExec                       [Microsoft, Talos]',
        '  %TEMP%\\*.tmp                          credential-dumping tool dropped and run                      [Microsoft, Talos]',
        '  SHA256 027cc450ef5f8c5f653329641ec1fed91f694e0d229928963b30f6b0d7d3a745   ransomware DLL        [Talos]',
        '  \\\\.\\pipe\\{GUID}                      named pipe used to pass recovered credentials back          [Talos]',
        '  schtasks /RU "SYSTEM" /Create /SC once /TN "" /TR "...shutdown.exe /r /f" /ST hh:mm            [Microsoft]',
        '  upd.me-doc.com.ua (M.E.Doc update server; here shown as ' + MEDOC_IP + ')                       [Talos]',
        '',
      ].join('\n'),
    },
    whois: {
      [MEDOC_IP]: ['inetnum:        198.51.100.0 - 198.51.100.255', 'netname:        TEST-NET-2', 'descr:          Reserved for documentation (replay stand-in for the M.E.Doc update server address)', 'country:        UA'].join('\n'),
    },
    dns: { 'upd.me-doc.com.ua': `Name:\tupd.me-doc.com.ua\nAddress: ${MEDOC_IP}` },
  };
}

// repadmin /replsummary, computed from the infection plan so it agrees with the logs at the moment you run it
function repadmin(args, input, ctx) {
  const events = ctx.events?.() || [];
  const now = Math.max(0, ...events.map((e) => e.abs ?? 0));
  const dcs = Object.values(HOSTS).filter((c) => c.role === 'Domain Controller');
  const fmt = (s) => (s < 60 ? `:${String(s).padStart(2, '0')}s` : s < 3600 ? `${String(Math.floor(s / 60)).padStart(2, '0')}m:${String(s % 60).padStart(2, '0')}s` : `${String(Math.floor(s / 3600)).padStart(2, '0')}h:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m:${String(s % 60).padStart(2, '0')}s`);
  const row = (c, i) => {
    const down = c.name === 'DC-GH01' || (PLAN.find((p) => p.host === c.name.toLowerCase())?.sched ?? Infinity) <= now;
    const since = c.name === 'DC-GH01' ? now - (6 * 3600 + 12 * 60) : down ? now - (PLAN.find((p) => p.host === c.name.toLowerCase()).sched) : 11 + i * 7;
    const fails = down ? '10 /   10  100  (1722) The RPC server is unavailable.' : ' 0 /   10    0';
    return ` ${c.name.padEnd(18)}${fmt(Math.max(1, since)).padStart(10)}   ${fails}`;
  };
  const t = hhmm(now % 86400);
  const lines = [
    '',
    `Replication Summary Start Time: 2017-06-27 ${t}:00`,
    '',
    'Beginning data collection for replication summary, this may take awhile:',
    '  ......',
    '',
    'Source DSA          largest delta    fails/total %%   error',
    ...dcs.map(row),
    '',
    'Destination DSA     largest delta    fails/total %%   error',
    ...dcs.map(row),
    '',
  ];
  return lines;
}

function powershell() {
  return {
    host: 'WS-CPH-0142',
    commands: { repadmin },
    winfs: {
      'C:\\Users\\analyst01\\hunting.txt': [
        "Priya's starter hunts (copy and run):",
        '',
        'Get-ADDomainController -Filter * | Select-Object Name, IPv4Address, OperatingSystem',
        'Get-ADComputer -Filter * -Properties Description, LastLogonDate | Where-Object { $_.Name -like "DC-*" } | Select-Object Name, Description',
        'repadmin /replsummary',
        'Get-ADGroupMember "Domain Admins" | Select-Object Name, SamAccountName',
        'Get-ADUser adm.helpdesk -Properties PasswordLastSet, PasswordNeverExpires, MemberOf',
        "Get-WinEvent -FilterHashtable @{LogName='System'; Id=7045} | Where-Object { $_.Message -match 'PSEXESVC' } | Measure-Object",
        "Get-WinEvent -FilterHashtable @{LogName='Security'; Id=1102} | Select-Object -First 5 TimeCreated, MachineName",
        '',
      ].join('\n'),
      'C:\\Users\\analyst01\\Documents\\notes.txt': 'Dana: UA finance PC slow after M.E.Doc update, ~10:30 UTC. Ghana site down since 06:14 (power).\n',
    },
  };
}

export default {
  n: 2,
  caseId: 'notpetya-2017',
  date: DATE,
  title: 'A.P. Moller-Maersk · Jun 27, 2017',
  start: 10 * 60 + 40,
  endAt: 13 * 60 + 30,
  intro: ['Case Files: NotPetya, June 27, 2017.', 'A replay of a real incident. Priya is running it from her office.'],
  badgeAtStart: true,
  cast: ['mike', 'theo'],

  emails: EMAILS,
  pages: PAGES,
  replyDrafts: REPLY_DRAFTS,
  logs: (st) => generateLogs({ nowMinutes: st.minutes }),
  ipInfo: IP_INFO,
  alerts: ALERTS,
  tickets: TICKETS,
  directory: corpDirectory(),
  terminal: terminal(),
  powershell: powershell(),

  npcLines: {
    priya: {
      talk: [
        'Welcome to Case Files. Today: A.P. Moller-Maersk, June 27, 2017: NotPetya.',
        "It's Tuesday, 10:40 UTC. You're on the security team of a global shipping company, modelled on what is publicly known. There is a weekly risk digest, a SIEM, PowerShell with the Active Directory cmdlets, and AD Users and Computers.",
        'The real worm moved through the company in minutes, and the scheduled reboots started within the hour. We have squeezed the quiet parts, so you get about three hours of replay. The first sign is a message from the Ukraine office.',
        'Start with your inbox.',
      ],
      again: ['Inbox first. Then the queue. The clock is not on our side.'],
    },
    dana: { talk: ["I'm on the service desk (playing the helpdesk). The Ukraine office just called."], again: ['If it is nothing, I will be happy. I do not think it is nothing.'] },
    mike: { talk: ["I'm playing Operations. Phones are getting busy."], again: ['Tell me what to tell the offices.'] },
    theo: { talk: ["I'm playing a server engineer. The domain controllers are mine."], again: ['Ask me before anyone touches a domain controller.'] },
  },

  objectives: [
    { id: 'priya', type: 'talk', text: 'Get the case briefing from Priya' },
    { id: 'my-desk', type: 'sit', text: 'Sit down at your desk' },
    { id: 'inbox', type: 'inbox', target: 'my-desk', text: 'Go through the security inbox' },
    { id: 'dc', type: 'encounter', target: 'theo', text: 'Theo is coming over about the domain controllers', waitText: 'Someone is on the way to talk to you.' },
    { id: 'tickets', type: 'tickets', target: 'my-desk', text: 'Work through the infrastructure risk queue' },
    { id: 'ad', type: 'terminal', match: AD_RE, target: 'my-desk', waitFor: 'alert', text: 'Check which domain controllers are alive (PowerShell, or AD Users and Computers)', waitText: 'Waiting on the SIEM.' },
    { id: 'users', type: 'encounter', target: 'my-desk', text: 'Answer your desk phone (Mike, Operations)', waitText: 'Mike said he would call. Stay near your desk.' },
    { id: 'server-door', type: 'badge', text: 'Badge into the server room' },
    { id: 'soc', type: 'case', target: 'soc', text: 'Work the case at the SOC console' },
    { id: 'debrief', type: 'debrief', target: 'priya', text: 'Debrief with Priya: what really happened' },
  ],
  encounters: [
    { id: 'dc', type: 'walkup', npc: 'theo', after: 'inbox', delayMs: 1500, fallbackAt: 10 * 60 + 58, intro: 'Hey! Got a minute? It is about the domain controllers.', conv: DC_TALK },
    { id: 'users', type: 'phone', after: 'dc', delayMs: 4000, fallbackAt: 11 * 60 + 25, notice: '☎ Your desk phone is ringing (Mike, Operations)', conv: USERS_TALK },
  ],

  score,
  debrief,

  caseFile: {
    id: 'notpetya-2017',
    company: 'A.P. Moller-Maersk',
    when: 'June 27, 2017',
    title: 'The domain that was saved by a power cut',
    pitch: 'A poisoned update to Ukrainian tax software dropped a worm that stole Windows credentials and spread with PsExec, WMIC and an SMBv1 exploit. Maersk was not the target, but its Active Directory was destroyed. It was rebuilt from one domain controller in Ghana that a power outage had switched off.',
    tags: ['Active Directory', 'Supply chain', 'Lateral movement', 'Credential theft', 'Wiper', 'Backup and recovery'],
    difficulty: 'Advanced',
    headline: 'On June 27, 2017 a backdoored update of the Ukrainian tax software M.E.Doc delivered NotPetya. It stole credentials with a modified Mimikatz and spread with PsExec, WMIC, and the EternalBlue and EternalRomance exploits, then rebooted each machine and destroyed its boot record. Maersk reported its Active Directory was wiped; a controller in Ghana that was offline from a power outage was reportedly the only copy that survived.',
    timeline: [
      { when: 'Apr 14, May 15, Jun 22, 2017', what: 'Talos finds backdoored versions of the M.E.Doc software (10.01.175-176, 10.01.180-181, 10.01.188-189). CISA says the actors had been in the vendor\'s development environment since at least April 14.' },
      { when: 'Jun 27, ~09:11-12:31 UTC', what: 'Talos: traffic to the M.E.Doc update server is proxied to an outside host during this window, the only time new infections appear. ESET and Talos conclude the update channel delivered the malware.' },
      { when: 'Jun 27, ~10:30 UTC', what: 'Microsoft sees the M.E.Doc updater (EzVit.exe) run: rundll32.exe "C:\\ProgramData\\perfc.dat",#1 30. The worm drops a Mimikatz-like tool, scans ports 139 and 445, and spreads with PsExec (a renamed dllhost.dat), WMIC and EternalBlue/EternalRomance.' },
      { when: 'Within minutes (per vendor analyses)', what: 'On each machine: schtasks /RU "SYSTEM" /Create /SC once /TN "" /TR "...shutdown.exe /r /f" /ST hh:mm queues a reboot; wevtutil clears the logs; fsutil deletes the USN journal.' },
      { when: 'After the queued time', what: 'The reboot loads the worm\'s boot code. The master boot record is overwritten, and a fake disk-check screen hides the encryption of the master file table. The ransom note follows.' },
      { when: 'Jun 27-28 (reported)', what: 'Maersk\'s systems go down worldwide. Wired reports about 150 domain controllers were wiped and that a controller in Ghana, offline because of a power outage, was the only surviving copy; its data was physically carried to the UK.' },
      { when: 'Jul 2017', what: 'Maersk says the attack cost USD 200-300 million, mostly in lost business volume in July (Q2 2017 interim report).' },
      { when: 'Feb 15, 2018', what: 'The White House attributes NotPetya to the Russian military and calls it the most destructive and costly cyber-attack in history (White House statement).' },
      { when: 'Jan 2019', what: 'Maersk\'s chairman says at Davos that the company reinstalled 4,000 servers, 45,000 PCs and 2,500 applications in about ten days (SecurityWeek and others).' },
    ],
    realOutcome: [
      'Maersk said the attack mainly hit Maersk Line, APM Terminals and Damco, and expected a negative result of USD 200-300 million. It said no customer data was lost to third parties.',
      'Its chairman said at Davos in January 2019 that the company had to reinstall 4,000 servers, 45,000 PCs and 2,500 applications, in ten days, work that would normally take months.',
      'Wired reported that Maersk had backups of nearly all its servers but none of its domain controllers, because every controller replicated to the others. After the attack, the one surviving copy was in Ghana, whose controller had been offline from a power outage, and its data was physically flown out because the network link was too slow.',
      'NotPetya was designed to look like ransomware but overwrites the boot record and encrypts the file table (Microsoft, BI.ZONE). The US government attributed it to the Russian military in February 2018. Maersk was not the target; Ukraine was.',
    ],
    failures: [
      'MS17-010 (SMBv1) had been available since March 14, 2017, and unpatched machines were reachable from every site. The worm\'s exploit step needs that gap.',
      'One local Administrator password and cached domain admin sessions let stolen credentials open far more machines than they should (the second and most effective spreading method named by CISA).',
      'A flat network: SMB, PsExec and WMI between sites and between workstations and servers.',
      'Active Directory had no isolated copy. Controllers replicated to each other, so a destructive change reached all of them (reported by Wired).',
      'No way to bring Active Directory back that had been rehearsed: recovery depended on a controller that happened to be switched off.',
      'Software that arrives through a trusted update channel (M.E.Doc) was trusted on machines with full local rights.',
    ],
    attack: [
      { id: 'T1195.002', name: 'Supply Chain Compromise: Compromise Software Supply Chain', fix: 'Run vendor update agents with the least rights, restrict where update traffic may go, and treat software from the country\'s mandatory vendors as untrusted until proven otherwise.' },
      { id: 'T1003.001', name: 'OS Credential Dumping: LSASS Memory', fix: 'Turn on Credential Guard, never sign admins in to workstations, and alert on Sysmon event 10 access to lsass.exe by unsigned binaries.' },
      { id: 'T1078.003', name: 'Valid Accounts: Local Accounts', fix: 'Deploy LAPS so every machine has a unique, rotated local Administrator password, and block network logon for local accounts.' },
      { id: 'T1021.002', name: 'Remote Services: SMB/Windows Admin Shares', fix: 'Segment the network, block TCP 445 between workstations and between sites, and alert on ADMIN$ access and PSEXESVC installs (7045) from anything but the jump host.' },
      { id: 'T1569.002', name: 'System Services: Service Execution', fix: 'Block remote execution by PsExec, alert on service installs from the network, and restrict who may create services remotely.' },
      { id: 'T1047', name: 'Windows Management Instrumentation', fix: 'Restrict remote WMI to management hosts, and alert on wmic /node ... process call create from non-admin machines.' },
      { id: 'T1210', name: 'Exploitation of Remote Services', fix: 'Install MS17-010, disable SMBv1, and alert on SMBv1 exploit signatures between internal hosts.' },
      { id: 'T1053.005', name: 'Scheduled Task/Job: Scheduled Task', fix: 'Alert on tasks created by SYSTEM with empty names, and on shutdown /r /f scheduled across many hosts.' },
      { id: 'T1070.001', name: 'Indicator Removal: Clear Windows Event Logs', fix: 'Forward logs off the host in real time, and alert on events 1102 and 104.' },
      { id: 'T1561.002', name: 'Disk Wipe: Disk Structure Wipe', fix: 'Keep offline and immutable backups, including Active Directory, and practice recovery at least once a year.' },
    ],
    resume: 'Investigated a simulated recreation of the 2017 NotPetya outbreak at A.P. Moller-Maersk in Cyber Office: traced a poisoned software update through credential theft (LSASS), PsExec and WMIC lateral movement and SMBv1 exploitation using Windows Security, System and Sysmon logs, Snort and firewall logs, PowerShell AD cmdlets and AD Users and Computers (MITRE ATT&CK T1195.002, T1003.001, T1021.002, T1561.002), and wrote a containment plan that protects a clean copy of Active Directory. Score: {grade}.',
    sources: [
      { title: 'Wired: The Untold Story of NotPetya, the Most Devastating Cyberattack in History (Aug 2018)', url: 'https://www.wired.com/story/notpetya-cyberattack-ukraine-russia-code-crashed-the-world/' },
      { title: 'Microsoft Security blog: New ransomware, old techniques: Petya adds worm capabilities (Jun 27, 2017)', url: 'https://www.microsoft.com/en-us/security/blog/2017/06/27/new-ransomware-old-techniques-petya-adds-worm-capabilities/' },
      { title: 'Cisco Talos: The MeDoc Connection', url: 'https://blog.talosintelligence.com/the-medoc-connection/' },
      { title: 'Cisco Talos: New Ransomware Variant "Nyetya" Compromises Systems Worldwide', url: 'https://blog.talosintelligence.com/worldwide-ransomware-variant/' },
      { title: 'ESET WeLiveSecurity: TeleBots are back: supply-chain attacks against Ukraine', url: 'https://www.welivesecurity.com/2017/06/30/telebots-back-supply-chain-attacks-against-ukraine/' },
      { title: 'CISA Alert TA17-181A: Petya Ransomware', url: 'https://www.cisa.gov/news-events/alerts/2017/07/01/petya-ransomware' },
      { title: 'BI.ZONE: PETYA malware analysis (commands, MBR and MFT behavior)', url: 'https://bi.zone/eng/news/petya-malware/' },
      { title: 'Maersk: Interim report Q2 2017 (USD 200-300m impact)', url: 'https://investor.maersk.com/news-releases/news-release-details/interim-report-q2-2017' },
      { title: 'SecurityWeek: Maersk Reinstalled 50,000 Computers After NotPetya Attack (Davos 2019)', url: 'https://www.securityweek.com/maersk-reinstalled-50000-computers-after-notpetya-attack' },
      { title: 'White House: Statement from the Press Secretary (Feb 15, 2018), attribution of NotPetya', url: 'https://trumpwhitehouse.archives.gov/briefings-statements/statement-press-secretary-25/' },
      { title: 'Microsoft Security Bulletin MS17-010 (Mar 14, 2017)', url: 'https://learn.microsoft.com/en-us/security-updates/securitybulletins/2017/ms17-010' },
      { title: 'Microsoft Learn: Windows LAPS overview', url: 'https://learn.microsoft.com/en-us/windows-server/identity/laps/laps-overview' },
      { title: 'Microsoft Learn: AD Forest Recovery, devising a plan', url: 'https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/forest-recovery-guide/ad-forest-recovery-devise-a-plan' },
      { title: 'MITRE ATT&CK: NotPetya (S0368)', url: 'https://attack.mitre.org/software/S0368/' },
    ],
    disclaimer: 'A dramatized recreation based on public sources. Maersk never published its internal layout, so the sites, hostnames, accounts, domain (corp.example), the shared helpdesk account, the shared local Administrator password, the staff and every IP address (documentation and private ranges) are invented. The SIEM, the weekly risk digest, the "Petya vaccine" phish, the SIEM alerts and all event counts did not exist in reality. What is documented: the worm\'s behavior and command lines (Microsoft, Cisco Talos, BI.ZONE, CISA), the M.E.Doc update channel (Talos, ESET, CISA), the 10:30 UTC start, the cost estimate and the Davos figures. What is reported but not confirmed by Maersk: the roughly 150 domain controllers, the missing domain controller backups, and the Ghana controller (Wired). Process parents on target machines, Snort rule revisions, the Defender detection timing and the reboot times are reconstructed. The worm\'s speed is compressed and the replay gives you about three hours; the real reboots came within the hour. Dollar costs in your report are estimates for this replay.',
  },
};
