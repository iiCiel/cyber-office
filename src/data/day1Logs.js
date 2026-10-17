// Day 1 logs (M4). Generated deterministically (seeded), so every playthrough sees the same story:
//
//   02:00  svc_backup runs the nightly backup (normal: service accounts work at night)
//   03:12  38 failed VPN logons for j.alvarez from 185.220.101.47 (a Tor exit node)
//   03:14  ...then a SUCCESS from the same IP, and the session reads HR payroll files on FILE01
//   all night: internet scanners hammer WEB01's SSH with junk usernames, and none get in (noise)
//   08:02  s.okafor typos her password once, then logs in (normal)
//   08:47  the real j.alvarez badges in and logs on from his own desk (WS-0112)
//
// If the player typed their password into the phishing page, the attacker uses it a few minutes later.
//
// Formats: Windows Security events (4624/4625/4634) as a SIEM shows them (one line, key=value) with
// the full raw event on expand; OpenVPN and sshd lines in their real syslog format; Samba full_audit.

import { GAME_DATE } from './office.js';

export const ATTACKER_IP = '185.220.101.47';
export const PHISH_IP = '91.215.85.17';

// What a quick IP lookup (whois / threat intel) says. Shown when you click an IP.
export const IP_INFO = {
  '185.220.101.47': { where: 'Germany', owner: 'AS205100 F3 Netze e.V.', note: 'Known Tor exit node. Used to hide where an attacker really is.', external: true },
  '91.215.85.17': { where: 'Russia', owner: 'AS49505 Selectel', note: 'Hosting provider. Same IP that sent the fake "IT Support" email this morning.', external: true },
  '45.95.147.236': { where: 'Netherlands', owner: 'AS49870 Alsycon B.V.', note: 'Mass internet scanner. Tries common usernames on every server it finds.', external: true },
  '193.32.162.157': { where: 'Romania', owner: 'AS47890 Unmanaged Ltd', note: 'Mass internet scanner.', external: true },
};
export function ipInfo(ip) {
  if (IP_INFO[ip]) return IP_INFO[ip];
  if (/^10\.|^172\.16\./.test(ip)) return { where: 'Internal', owner: 'Halcyon Mutual network', note: 'One of our own addresses (10.x office, 172.16.x VPN users).', external: false };
  return { where: 'Unknown', owner: 'Unknown', note: 'No information.', external: true };
}

const WS = {
  'priya.r': ['WS-0107', '10.0.4.17'],
  'j.alvarez': ['WS-0112', '10.0.4.33'],
  'dana.k': ['WS-0120', '10.0.4.40'],
  'm.chen': ['WS-0131', '10.0.4.51'],
  's.okafor': ['WS-0138', '10.0.4.62'],
  analyst01: ['WS-0142', '10.0.4.142'],
};

// Small seeded PRNG (mulberry32) so logs are identical on every run.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EVENT_LABEL = { 4624: 'LOGON OK', 4625: 'LOGON FAILED', 4634: 'LOGOFF' };

export const hms = (sec) =>
  [Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), sec % 60].map((n) => String(n).padStart(2, '0')).join(':');
export const stamp = (sec) => `${GAME_DATE.month} ${GAME_DATE.day} ${hms(sec)}`;
const T = (h, m, s = 0) => h * 3600 + m * 60 + s;

const win4625 = (user, ip, ws, port) => [
  'An account failed to log on.',
  '',
  'Subject:',
  '\tSecurity ID:\t\tNULL SID',
  '\tAccount Name:\t\t-',
  '',
  'Logon Type:\t\t\t3',
  '',
  'Account For Which Logon Failed:',
  `\tAccount Name:\t\t${user}`,
  '\tAccount Domain:\t\tHALCYON',
  '',
  'Failure Information:',
  '\tFailure Reason:\t\tUnknown user name or bad password.',
  '\tStatus:\t\t\t0xC000006D',
  '\tSub Status:\t\t0xC000006A',
  '',
  'Network Information:',
  `\tWorkstation Name:\t${ws}`,
  `\tSource Network Address:\t${ip}`,
  `\tSource Port:\t\t${port}`,
].join('\n');

const win4624 = (user, ip, ws, type, logonId) => [
  'An account was successfully logged on.',
  '',
  `Logon Type:\t\t\t${type}`,
  '',
  'New Logon:',
  `\tAccount Name:\t\t${user}`,
  '\tAccount Domain:\t\tHALCYON',
  `\tLogon ID:\t\t${logonId}`,
  '',
  'Network Information:',
  `\tWorkstation Name:\t${ws}`,
  `\tSource Network Address:\t${ip}`,
  '',
  'Authentication Information:',
  `\tLogon Process:\t\t${type === 2 ? 'User32' : 'NtLmSsp'}`,
  `\tAuthentication Package:\t${type === 2 ? 'Negotiate' : 'NTLM'}`,
].join('\n');

/**
 * All log events up to `nowMinutes` (in-game time), oldest first.
 * @param {{ phishedAt?: number|null }} opts phishedAt = in-game minute the player gave away their password
 */
export function generateLogs({ nowMinutes = 24 * 60, phishedAt = null } = {}) {
  const r = rng(1019);
  const ev = [];
  let logonSeq = 0x3e7a00;
  // ids are assigned in creation order, so they stay stable no matter which optional events get added.
  const add = (t, host, source, msg, extra = {}) => ev.push({ id: `E${ev.length}`, t, host, source, msg, ...extra });
  const logonId = () => `0x${(logonSeq += 0x1f + Math.floor(r() * 0x40)).toString(16).toUpperCase()}`;

  const fail = (t, user, ip, ws, extra) => {
    const port = 49152 + Math.floor(r() * 16000);
    add(t, 'dc01', 'Security', `EventID=4625 An account failed to log on. user=${user} logon_type=3 src_ip=${ip} workstation=${ws} sub_status=0xC000006A`, {
      raw: win4625(user, ip, ws, port), user, ip, ...extra,
    });
    return port;
  };
  const ok = (t, user, ip, ws, type, extra) =>
    add(t, 'dc01', 'Security', `EventID=4624 An account was successfully logged on. user=${user} logon_type=${type} src_ip=${ip} workstation=${ws}`, {
      raw: win4624(user, ip, ws, type, logonId()), user, ip, ...extra,
    });
  const logoff = (t, user, type = 3) => add(t, 'dc01', 'Security', `EventID=4634 An account was logged off. user=${user} logon_type=${type}`, { user });

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
    const [ws, ip] = WS[user];
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

  const nowSec = nowMinutes * 60;
  return ev
    .filter((e) => e.t <= nowSec)
    .sort((a, b) => a.t - b.t)
    .map((e) => ({
      ...e,
      time: stamp(e.t),
      // Full syslog-style line (what search matches against).
      line: `${stamp(e.t)} ${e.host} ${e.source === 'Security' ? 'Microsoft-Windows-Security-Auditing: ' : ''}${e.msg}`,
      // Compact version for narrow tables: the key=value fields first, the English sentence last.
      short: e.source === 'Security' ? e.msg.replace(/^EventID=(\d+) (.+?)\. (.*)$/, (_, id, _s, rest) => `${id} ${EVENT_LABEL[id] || ''}  ${rest}`) : e.msg,
    }));
}

// The SIEM alert. It fires once the player is done with email (or at 9:40 at the latest).
export const ALERT = {
  id: 'bruteforce-jalvarez',
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
  pivots: ['j.alvarez', ATTACKER_IP, '4625', '4624'],
};

// The extra alert you only get if you typed your password into the phishing page.
export const ALERT_STOLEN = {
  id: 'analyst01-foreign',
  title: 'Logon from a new country for analyst01',
  severity: 'High',
  rule: 'First successful logon for this account from a country never seen before.',
  fields: [
    ['Account', 'analyst01 (that\'s you)'],
    ['Source IP', PHISH_IP],
    ['Country', 'Russia'],
  ],
  pivots: ['analyst01', PHISH_IP],
};

// The case write-up questions. Scored by src/game/scoring.js.
export const CASE = {
  verdicts: [
    { id: 'forgot', text: 'j.alvarez forgot his password, kept trying, and finally got it right.' },
    { id: 'compromised', text: "Someone guessed j.alvarez's password and logged in. The account is compromised." },
    { id: 'noise', text: 'Internet noise: lots of failures, but nobody actually got in.' },
  ],
  correctVerdict: 'compromised',
  actions: [
    { id: 'disable', text: "Disable j.alvarez's account and reset his password", good: true },
    { id: 'block', text: `Block ${ATTACKER_IP} on the VPN / firewall`, good: true },
    { id: 'scope', text: 'Check what the attacker touched (the FILE01 activity)', good: true },
    { id: 'mfa', text: 'Recommend MFA on the VPN so a password alone isn\'t enough', good: true },
    { id: 'reboot', text: 'Reboot DC01 to kick the attacker out', good: false, why: 'Rebooting the domain controller takes down logins for the whole company and destroys evidence in memory.' },
    { id: 'email-pw', text: 'Email j.alvarez his new password', good: false, why: 'Never send passwords by email. If his mailbox is compromised too, the attacker gets the new one.' },
    { id: 'close', text: 'Close the alert. He is at his desk now, so it is fine.', good: false, why: 'He is at his desk now, but the 3 AM session came from a Tor exit node and read payroll files. That wasn\'t him.' },
  ],
  // Lines that count as strong evidence if you flag them.
  keyEvidence: ['success', 'vpn-up', 'exfil', 'real-jalvarez'],
};
