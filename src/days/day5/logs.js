// Day 5 logs: the ransomware. The attacker uses the foothold they've built all week.
//   03:40  svc_backup logs on to FILE01 again (if it was never disabled Thursday) OR a new account if it was
//   03:45  a scheduled task is created on DC01 to run a payload across every machine (GPO push)
//   09:10  (in-game, after the alert) files start getting encrypted: *.halcyon-locked everywhere
// The ransom note (README_RESTORE.txt) is written to every share.
// Recovery depends on the week: a tested backup (Thu) = clean recovery; old backup = partial; none = pay or lose it.

import { T, logBuilder, finishLogs, backgroundNoise } from '../../game/logkit.js';
import { uuid, fakeId } from '../../game/cloudfmt.js';
import { filterlog, wanScanNoise } from '../../game/fwfmt.js';

export const DATE = { weekday: 'FRI', name: 'Friday', month: 'Oct', day: 23, year: 2026, domain: 'halcyonmutual.local', netbios: 'HALCYON' };
export const C2 = '203.0.113.45';
export const RANSOM_IP = '91.219.236.14';

export const IP_INFO = {
  '203.0.113.45': { where: 'Moldova', owner: 'AS-KRANNET hosting', note: 'The C2 server all week: USB stick, invoice, svc_backup theft. Now pushing ransomware.', external: true },
  '91.219.236.14': { where: 'unknown (Tor)', owner: 'Tor exit relay', note: 'Where the ransom payment site is hosted.', external: true },
};

export function generateLogs({ nowMinutes = 24 * 60, carry = {}, alertAt = null } = {}) {
  const b = logBuilder(1023);
  const { add, ok, proc } = b;
  const svcDisabled = carry.d4Contained; // Thursday shut svc_backup down
  const actor = svcDisabled ? 'admin_helpdesk' : 'svc_backup';
  const actorNote = svcDisabled ? 'a different account (the attacker made a new admin after Thursday)' : 'the svc_backup account that was never disabled';

  // Pre-dawn: the attacker stages the ransomware.
  add(T(3, 40, 2), 'vpn01', 'openvpn', `openvpn[1187]: ${C2}:53900 [${actor}] Peer Connection Initiated with [AF_INET]${C2}:53900`, { ip: C2, user: actor, attack: true, key: 'vpn-in' });
  ok(T(3, 42, 10), actor, '172.16.0.95', 'DC01', 10, { attack: true, key: 'dc-logon', note: actorNote });
  proc(T(3, 45, 0), 'dc01', actor, 'C:\\Windows\\System32\\schtasks.exe', 'schtasks /create /tn "Updater" /tr "\\\\dc01\\sysvol\\p.exe" /sc once /ru SYSTEM /s *.halcyonmutual.local', 'C:\\Windows\\System32\\cmd.exe', { attack: true, key: 'schtask' });
  proc(T(3, 46, 20), 'dc01', actor, 'C:\\Windows\\System32\\vssadmin.exe', 'vssadmin delete shadows /all /quiet', 'C:\\Windows\\System32\\cmd.exe', { attack: true, key: 'shadowdelete' });

  // Morning detonation (scaled to when the alert fires, ~09:08).
  const boom = alertAt != null ? alertAt * 60 : T(9, 8);
  proc(boom, 'file01', 'SYSTEM', 'C:\\Windows\\Temp\\p.exe', 'p.exe --encrypt --ext .halcyon-locked --note README_RESTORE.txt', 'C:\\Windows\\System32\\svchost.exe', { attack: true, key: 'ransom-proc' });
  add(boom + 6, 'file01', 'smbd_audit', `SYSTEM|127.0.0.1|rename|ok|Shared/Claims/2026/Q4_summary.xlsx -> Q4_summary.xlsx.halcyon-locked`, { attack: true, key: 'first-encrypt' });
  // Microsoft Defender for Endpoint alerts, shaped like the Graph security API (alerts_v2) returns them.
  const TENANT = uuid('tenant-halcyon');
  const mdeAlert = (t, o, extra) => {
    const id = `da${fakeId(`mde${o.title}${t}`, 18, '0123456789')}_${fakeId(`tail${o.title}`, 9, '0123456789')}`;
    return b.record(t, 'defender365', 'defender365',
      `DefenderAlert title="${o.title}" severity=${o.severity} serviceSource=microsoftDefenderForEndpoint category=${o.category} devices=${o.devices.length + (o.more || 0)}`,
      (st) => ({
        id, providerAlertId: id, incidentId: '4127', status: 'new', severity: o.severity, classification: null, determination: null,
        serviceSource: 'microsoftDefenderForEndpoint', detectionSource: o.detection || 'microsoftDefenderForEndpoint', productName: 'Microsoft Defender for Endpoint',
        detectorId: uuid(`det${o.title}`), tenantId: TENANT, title: o.title, description: o.description, recommendedActions: o.actions,
        category: o.category, assignedTo: null, alertWebUrl: `https://security.microsoft.com/alerts/${id}?tid=${TENANT}`,
        threatDisplayName: o.threat || null, threatFamilyName: o.family || null, mitreTechniques: o.mitre,
        createdDateTime: st.iso, lastUpdateDateTime: st.iso, firstActivityDateTime: st.iso, lastActivityDateTime: st.iso,
        evidence: [
          ...o.devices.map((d) => ({ '@odata.type': '#microsoft.graph.security.deviceEvidence', createdDateTime: st.iso, verdict: 'malicious', remediationStatus: 'none', deviceDnsName: `${d.toLowerCase()}.${DATE.domain}`, mdeDeviceId: fakeId(`dev${d}`, 40, '0123456789abcdef'), osPlatform: /^WS/.test(d) ? 'Windows10' : 'WindowsServer2019', healthStatus: 'active', riskScore: 'high', onboardingStatus: 'onboarded' })),
          { '@odata.type': '#microsoft.graph.security.processEvidence', createdDateTime: st.iso, verdict: 'malicious', remediationStatus: 'none', processId: 6604, processCommandLine: o.cmd, processCreationDateTime: st.iso,
            imageFile: { sha1: fakeId('s1p.exe', 40, '0123456789abcdef'), sha256: fakeId('sp.exe', 64, '0123456789abcdef'), fileName: 'p.exe', filePath: o.path, fileSize: 1843712 },
            userAccount: { accountName: 'SYSTEM', domainName: 'NT AUTHORITY', userSid: 'S-1-5-18' } },
          ...(o.files || []).map((f) => ({ '@odata.type': '#microsoft.graph.security.fileEvidence', createdDateTime: st.iso, verdict: 'suspicious', remediationStatus: 'none', fileDetails: { fileName: f.split('\\').pop(), filePath: f.slice(0, f.lastIndexOf('\\')) } })),
        ],
      }), extra);
  };
  mdeAlert(boom + 9, {
    title: 'Ransomware behavior detected in the file system', severity: 'high', category: 'Ransomware', family: 'Ransom', threat: 'Behavior:Win32/Ransom.Gen',
    description: 'A process on FILE01 renamed many files to the extension .halcyon-locked and wrote a ransom note. Shadow copies were deleted on DC01 earlier. This is typical of human-operated ransomware.',
    actions: '1. Isolate the device. 2. Contain the account that ran the process. 3. Find and stop the launch mechanism (scheduled task, GPO, PsExec). 4. Restore from a clean backup.',
    mitre: ['T1486', 'T1490'], devices: ['FILE01'], cmd: 'p.exe --encrypt --ext .halcyon-locked --note README_RESTORE.txt', path: 'C:\\Windows\\Temp',
    files: ['D:\\Shared\\Claims\\2026\\Q4_summary.xlsx.halcyon-locked', 'D:\\Shared\\Claims\\README_RESTORE.txt'],
  }, { attack: true, key: 'edr-alert' });

  // The scheduled task fires on the workstations: Sysmon 1 on each (Task Scheduler's svchost starts p.exe from SYSVOL).
  const WS = ['WS-0114', 'WS-0121', 'WS-0133', 'WS-0142', 'WS-0157'];
  WS.forEach((h, i) => b.sysmon1(boom + 18 + i * 2, h.toLowerCase(), {
    user: 'NT AUTHORITY\\SYSTEM', image: '\\\\dc01\\sysvol\\p.exe', cmd: '"\\\\dc01\\sysvol\\p.exe"', integrity: 'System', session: 0, logonId: '0x3E7',
    parent: 'C:\\Windows\\System32\\svchost.exe', parentCmd: 'C:\\Windows\\system32\\svchost.exe -k netsvcs -p -s Schedule',
    rule: 'technique_id=T1053.005,technique_name=Scheduled Task', description: '-', product: '-', company: '-', original: '-', fileVersion: '-',
  }, { attack: true, key: i === 0 ? 'spread-ws' : undefined }));
  mdeAlert(boom + 30, {
    title: 'Ransomware payload remotely launched', severity: 'high', category: 'Ransomware', family: 'Ransom',
    description: `p.exe was started by the Task Scheduler on 41 devices from \\\\dc01\\sysvol\\p.exe. The task "Updater" was created on DC01 at 03:45 by ${actor}.`,
    actions: 'Isolate the affected devices. Delete the scheduled task "Updater" on DC01 and the GPO that pushes it. Disable the account that created it.',
    mitre: ['T1053.005', 'T1570', 'T1486'], devices: WS, more: 36, cmd: '"\\\\dc01\\sysvol\\p.exe"', path: '\\\\dc01\\sysvol',
  }, { attack: true, key: 'spread' });

  // pfSense filterlog from fw01: internet (igb0), servers (igb1, 10.0.2.x), users (igb2, 10.0.4.x).
  const fw = (t, o, extra = {}) => add(t, 'fw01', 'pfsense', filterlog(t, o), { ip: o.src, ...extra });
  fw(T(3, 40, 1), { rule: 12, iface: 'igb0', act: 'pass', dir: 'in', proto: 'udp', src: C2, dst: '198.51.100.20', sport: 53900, dport: 1194 }, { attack: true, key: 'fw-vpn' });
  fw(boom + 2, { rule: 31, iface: 'igb1', act: 'pass', dir: 'in', proto: 'tcp', src: '10.0.2.15', dst: C2, sport: 50211, dport: 443, flags: 'S' }, { attack: true, key: 'fw-c2' });
  WS.forEach((h, i) => fw(boom + 17 + i * 2, { rule: 44, iface: 'igb1', act: 'pass', dir: 'in', proto: 'tcp', src: '10.0.2.10', dst: `10.0.4.${Number(h.slice(3))}`, sport: 49800 + i, dport: 445, flags: 'S' }, { attack: true }));
  wanScanNoise(add);

  // Everyone's normal Friday morning (number matching on, if Tuesday's write-up was good).
  backgroundNoise(b, {
    arrivals: [
      ['priya.r', T(7, 20)],
      ['dana.k', T(6, 0)],
      ['t.okoye', T(8, 0)],
      ['c.reyes', T(8, 5)],
      ['m.chen', T(8, 22)],
    ],
  });
  ok(T(6, 9, 0), 'analyst01', '10.0.4.142', 'WS-0142', 2);
  return finishLogs(b.ev, { nowMinutes, date: DATE });
}

export const CASE = {
  id: 'case',
  area: 'Incident',
  title: 'Ransomware on FILE01, spreading',
  max: 40,
  question: 'This is live. What do you do FIRST?',
  teaches: { skill: 'Run the incident response order: isolate, investigate, recover', secplus: '4.8 Incident response process' },
  verdicts: [
    { id: 'pay', text: 'Pay the ransom quietly to make it stop.' },
    { id: 'isolate', text: 'ISOLATE first: cut the spread (network containment), THEN investigate and recover from backup.' },
    { id: 'wipe', text: 'Wipe and rebuild every machine right now.' },
  ],
  correctVerdict: 'isolate',
  wrongVerdictNotes: {
    pay: 'Paying funds the attackers, breaks the law in some cases, and often gets you a broken decryptor. It\'s the last resort, not the first move. Isolate first.',
    wipe: 'Wiping before you isolate lets it keep spreading from the machines you haven\'t reached yet, and destroys the evidence of how they got in.',
  },
  actions: [
    { id: 'isolate-net', text: 'Isolate FILE01 and the affected hosts from the network (pull them off / block at the switch)', good: true },
    { id: 'disable-task', text: 'Delete the "Updater" scheduled task on DC01 and block the C2 IP', good: true },
    { id: 'kill-accounts', text: 'Disable the attacker\'s account and reset the domain admin passwords', good: true },
    { id: 'restore', text: 'Recover encrypted shares from the most recent good backup', good: true },
    { id: 'legal', text: 'Notify Legal, leadership and (as required) regulators and law enforcement', good: true },
    { id: 'pay-ransom', text: 'Pay the ransom to get the decryptor', good: false, why: 'You have other options today. Paying is the last resort, and it funds next week\'s attack on someone else.' },
    { id: 'email-all', text: 'Email all staff the technical details immediately', good: false, why: 'If email is compromised the attacker reads it too. Use an out-of-band channel, and keep the detail in the incident bridge.' },
  ],
  primaryEvidence: { key: 'schtask', note: 'The key evidence is the scheduled task "Updater" on DC01 at 03:45: that is how it reached 41 machines at once.' },
  keyEvidence: ['schtask', 'ransom-proc', 'spread', 'shadowdelete', 'vpn-in', 'edr-alert'],
  containedRequires: ['isolate-net', 'disable-task'],
  // Cost depends on the week's backups (set in day5 index via extra()).
  costs: {
    contained: { amount: 20000, text: 'Contained and recovered from backup' },
    breach: { amount: 480000, text: 'The whole company encrypted; days of downtime' },
  },
  perfectWhy: 'Textbook incident response: isolate the spread, kill the scheduled task and C2, reset the accounts, then recover from a clean backup. This is the day the week pays off.',
  notSubmittedWhy: 'Nobody ran the response. The ransomware encrypted everything it could reach.',
};

export const ALERTS = [
  {
    id: 'ransomware-file01',
    main: true,
    title: 'Ransomware detected on FILE01, spreading to 41 hosts',
    severity: 'Critical',
    rule: 'EDR behavioral detection: mass file rename + shadow copy deletion, plus a scheduled task pushed domain-wide.',
    fields: [
      ['First host', 'FILE01'],
      ['Spreading via', 'scheduled task "Updater" on DC01'],
      ['Hosts hit', '41 and climbing'],
      ['Extension', '.halcyon-locked'],
      ['Source', `VPN from ${C2}`],
    ],
    trigger: { after: 'inbox', delayMs: 2500, fallbackAt: 9 * 60 + 20 },
    notice: '🔥 CRITICAL: ransomware spreading across the network',
    chatFrom: 'Priya (URGENT)',
    chat: [
      "It's happening. Ransomware on FILE01, jumping to other machines RIGHT NOW.",
      'Runbook order: ISOLATE, INVESTIGATE, RECOVER. Server room, SOC console, GO.',
      'Every second counts. Submit the response and I\'ll push the buttons.',
    ],
    case: CASE,
  },
];
