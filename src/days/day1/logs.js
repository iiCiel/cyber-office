// Day 1 logs. Generated deterministically (seeded), so every playthrough sees the same story:
//
//   02:00  svc_backup runs the nightly backup (normal: service accounts work at night)
//   03:12  38 failed VPN logons for j.alvarez from 185.220.101.47 (a Tor exit node)
//   03:14  ...then a SUCCESS from the same IP, and the session reads HR payroll files on FILE01
//   all night: internet scanners hammer WEB01's SSH with junk usernames, and none get in (noise)
//   08:02  s.okafor typos her password once, then logs in (normal)
//   08:47  the real j.alvarez badges in and logs on from his own desk (WS-0112)
//
// If the player typed their password into the phishing page, the attacker uses it a few minutes later.

import { T, logBuilder, finishLogs, STAFF } from '../../game/logkit.js';

export const DATE = { weekday: 'MON', name: 'Monday', month: 'Oct', day: 19 };
export const ATTACKER_IP = '185.220.101.47';
export const PHISH_IP = '91.215.85.17';

export const IP_INFO = {
  '185.220.101.47': { where: 'Germany', owner: 'AS205100 F3 Netze e.V.', note: 'Known Tor exit node. Used to hide where an attacker really is.', external: true },
  '91.215.85.17': { where: 'Russia', owner: 'AS49505 Selectel', note: 'Hosting provider. Same IP that sent the fake "IT Support" email this morning.', external: true },
};

/**
 * All log events up to `nowMinutes` (in-game time), oldest first.
 * @param {{ nowMinutes?: number, phishedAt?: number|null }} opts phishedAt = minute the player gave away their password
 */
export function generateLogs({ nowMinutes = 24 * 60, phishedAt = null } = {}) {
  const b = logBuilder(1019);
  const { r, add, fail, ok, logoff } = b;

  // Nightly backup (normal).
  ok(T(2, 0, 3), 'svc_backup', '10.0.3.30', 'BACKUP01', 3);
  for (let i = 0; i < 6; i++) add(T(2, 5 + i * 6, Math.floor(r() * 60)), 'file01', 'smbd_audit', `svc_backup|10.0.3.30|pread|ok|Shared/${['Claims', 'Finance', 'HR', 'IT', 'Legal', 'Sales'][i]}/ (backup job)`, { user: 'svc_backup', ip: '10.0.3.30' });
  logoff(T(2, 41, 12), 'svc_backup');

  // Internet noise against WEB01's SSH all night: failures only.
  const junkUsers = ['admin', 'root', 'test', 'oracle', 'ubuntu', 'postgres', 'git', 'user', 'pi', 'ftpuser'];
  for (let t = T(2, 3); t < T(9, 30); t += 300 + Math.floor(r() * 1500)) {
    const ip = r() < 0.6 ? '45.95.147.236' : '193.32.162.157';
    const u = junkUsers[Math.floor(r() * junkUsers.length)];
    const port = 30000 + Math.floor(r() * 30000);
    add(t, 'web01', 'sshd', `sshd[${3000 + Math.floor(r() * 3000)}]: Failed password for invalid user ${u} from ${ip} port ${port} ssh2`, { ip, noise: true });
  }

  // The attack: password guessing through the VPN, then success.
  let t = T(3, 12, 7);
  for (let i = 0; i < 38; i++) {
    const port = fail(t, 'j.alvarez', ATTACKER_IP, 'VPN01', { attack: true });
    add(t, 'vpn01', 'openvpn', `openvpn[1187]: ${ATTACKER_IP}:${port} TLS Auth Error: Auth Username/Password verification failed for peer`, { ip: ATTACKER_IP, attack: true });
    t += 3 + Math.floor(r() * 3);
  }
  t = T(3, 14, 52);
  ok(t, 'j.alvarez', ATTACKER_IP, 'VPN01', 3, { attack: true, key: 'success' });
  add(t + 1, 'vpn01', 'openvpn', `openvpn[1187]: ${ATTACKER_IP}:51190 [j.alvarez] Peer Connection Initiated with [AF_INET]${ATTACKER_IP}:51190`, { ip: ATTACKER_IP, user: 'j.alvarez', attack: true, key: 'vpn-up' });
  add(t + 2, 'vpn01', 'openvpn', 'openvpn[1187]: j.alvarez/185.220.101.47:51190 MULTI_sva: pool returned IPv4=172.16.0.77', { ip: ATTACKER_IP, user: 'j.alvarez', attack: true });
  const files = ['Shared/HR/Payroll/2026-09_payroll.xlsx', 'Shared/HR/Payroll/2026-10_payroll.xlsx', 'Shared/HR/Employees/bank_details_direct_deposit.csv', 'Shared/HR/Employees/ssn_lookup.xlsx', 'Shared/Finance/Vendors/wire_instructions.docx'];
  files.forEach((f, i) => add(T(3, 17 + i * 3, 10 + i * 7), 'file01', 'smbd_audit', `j.alvarez|172.16.0.77|pread|ok|${f}`, { user: 'j.alvarez', ip: '172.16.0.77', attack: true, key: i === 2 ? 'exfil' : undefined }));
  add(T(3, 31, 40), 'vpn01', 'openvpn', `openvpn[1187]: j.alvarez/${ATTACKER_IP}:51190 SIGTERM[soft,remote-exit] received, client-instance exiting`, { ip: ATTACKER_IP, user: 'j.alvarez', attack: true });
  logoff(T(3, 31, 41), 'j.alvarez');

  // Mail server noise.
  for (let tt = T(5, 50); tt < T(9, 20); tt += 400 + Math.floor(r() * 900)) {
    add(tt, 'mail01', 'postfix', `postfix/smtpd[${800 + Math.floor(r() * 200)}]: connect from mail-sor-f${40 + Math.floor(r() * 30)}.google.com[209.85.220.${30 + Math.floor(r() * 40)}]`);
  }
  add(T(7, 58, 3), 'mail01', 'postfix', `postfix/smtpd[912]: connect from mail.halcyonmutual-support.com[${PHISH_IP}]`, { ip: PHISH_IP });

  // Morning: device setup and people arriving.
  ok(T(6, 1, 14), 'analyst01', '10.0.4.142', 'WS-0142', 2);
  const arrivals = [
    ['priya.r', T(7, 32)],
    ['dana.k', T(5, 55)],
    ['m.chen', T(8, 21)],
    ['s.okafor', T(8, 2)],
    ['j.alvarez', T(8, 47)],
  ];
  for (const [user, at] of arrivals) {
    const [ws, ip] = STAFF[user];
    if (user === 's.okafor') {
      fail(at, user, ip, ws);
      ok(at + 31, user, ip, ws, 2);
    } else {
      ok(at, user, ip, ws, 2, user === 'j.alvarez' ? { key: 'real-jalvarez' } : {});
    }
    add(at + 40 + Math.floor(r() * 60), 'file01', 'smbd_audit', `${user}|${ip}|pread|ok|Shared/${user === 'priya.r' ? 'IT/SOC/runbooks.docx' : 'Claims/2026/Q4_summary.xlsx'}`, { user, ip });
  }

  // Consequence: if the player gave their password to the phishing page, the attacker uses it.
  if (phishedAt != null) {
    const at = (phishedAt + 3) * 60 + 17;
    ok(at, 'analyst01', PHISH_IP, 'VPN01', 3, { attack: true, key: 'analyst01-stolen', ip: PHISH_IP });
    add(at + 1, 'vpn01', 'openvpn', `openvpn[1187]: ${PHISH_IP}:40211 [analyst01] Peer Connection Initiated with [AF_INET]${PHISH_IP}:40211`, { ip: PHISH_IP, user: 'analyst01', attack: true });
  }

  return finishLogs(b.ev, { nowMinutes, date: DATE });
}

// The case write-up questions and how they're scored (see scoreCase in src/game/scoring.js).
export const CASE = {
  id: 'case',
  area: 'SOC alert',
  title: 'Brute force on j.alvarez (3 AM)',
  max: 30,
  teaches: { skill: 'Read a failed-logon burst and spot the success after it', secplus: '4.9 Use data sources to support an investigation' },
  verdicts: [
    { id: 'forgot', text: 'j.alvarez forgot his password, kept trying, and finally got it right.' },
    { id: 'compromised', text: "Someone guessed j.alvarez's password and logged in. The account is compromised." },
    { id: 'noise', text: 'Internet noise: lots of failures, but nobody actually got in.' },
  ],
  correctVerdict: 'compromised',
  wrongVerdictNotes: {
    forgot: "It wasn't j.alvarez: the 3 AM logons came from a Tor exit node, and the real j.alvarez logged on from his own desk at 8:47.",
    default: 'Somebody did get in: look for the 4624 (success) right after the 4625s, from the same IP.',
  },
  actions: [
    { id: 'disable', text: "Disable j.alvarez's account and reset his password", good: true },
    { id: 'block', text: `Block ${ATTACKER_IP} on the VPN / firewall`, good: true },
    { id: 'scope', text: 'Check what the attacker touched (the FILE01 activity)', good: true },
    { id: 'mfa', text: 'Recommend MFA on the VPN so a password alone isn\'t enough', good: true },
    { id: 'reboot', text: 'Reboot DC01 to kick the attacker out', good: false, why: 'Rebooting the domain controller takes down logins for the whole company and destroys evidence in memory.' },
    { id: 'email-pw', text: 'Email j.alvarez his new password', good: false, why: 'Never send passwords by email. If his mailbox is compromised too, the attacker gets the new one.' },
    { id: 'close', text: 'Close the alert. He is at his desk now, so it is fine.', good: false, why: 'He is at his desk now, but the 3 AM session came from a Tor exit node and read payroll files. That wasn\'t him.' },
  ],
  primaryEvidence: { key: 'success', note: 'The key evidence is the successful logon (4624) from the attacker\'s IP at 03:14:52.' },
  keyEvidence: ['success', 'vpn-up', 'exfil', 'real-jalvarez'],
  containedRequires: ['disable', 'block'],
  costs: {
    contained: { amount: 6000, text: 'Incident response the same morning (contained)' },
    breach: { amount: 86000, text: 'Payroll, bank details and SSNs for 214 employees: notification and credit monitoring' },
  },
  perfectWhy: 'Spot on: 38 failures, then a success from a Tor exit node, then payroll files read. Contained before lunch.',
  notSubmittedWhy: `The 3 AM success came from a Tor exit node (${ATTACKER_IP}) and read payroll files. Nobody stopped it.`,
};

// The SIEM alerts. `trigger` decides when each fires (see OfficeScene.checkAlerts).
export const ALERTS = [
  {
    id: 'bruteforce-jalvarez',
    main: true,
    title: 'Multiple failed logons followed by a success',
    severity: 'High',
    rule: 'More than 20 failed logons (4625) for one account within 5 minutes, followed by a successful logon (4624) from the same source.',
    fields: [
      ['Account', 'j.alvarez'],
      ['Source IP', ATTACKER_IP],
      ['Host', 'dc01 (via VPN01)'],
      ['Failed logons', '38'],
      ['Window', '03:12:07 to 03:14:52'],
    ],
    trigger: { after: 'inbox', delayMs: 2500, fallbackAt: 9 * 60 + 40 },
    notice: '🚨 SIEM alert (High): failed logons, then a success',
    chat: [
      'Ping! The SIEM just fired a High alert: a pile of failed logons, then a success.',
      'Go to the SOC console in the server room and tell me what happened.',
      'Search the logs, flag (⚑) your evidence, then write up the case for me.',
    ],
    case: CASE,
  },
  {
    id: 'analyst01-foreign',
    title: 'Logon from a new country for analyst01',
    severity: 'High',
    rule: 'First successful logon for this account from a country never seen before.',
    fields: [
      ['Account', "analyst01 (that's you)"],
      ['Source IP', PHISH_IP],
      ['Country', 'Russia'],
    ],
    callout: 'That is your account, logging in from Russia, a few minutes after you typed your password into that "IT Support" page. Report it to Priya right away (she has been notified) and change your password.',
    trigger: { when: (st) => st.phishedAt() != null && st.minutes >= st.phishedAt() + 3 },
    notice: '🚨 SIEM alert: logon from a new country (analyst01)',
    chat: [
      'Hey. The SIEM says YOUR account just logged in through the VPN from Russia.',
      'Did you type your password into something this morning? That "IT Support" email, maybe?',
      "I'm resetting your password now. Check the SOC console when you can.",
    ],
  },
];
