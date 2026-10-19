// Case file: Colonial Pipeline, May 7, 2021. The logs the security team would have had, rebuilt from public reporting.
//
// The real chain (sources in index.js): a legacy VPN with single-factor sign-in (no MFA) that IT reportedly did not
// know was still in use -> initial access around April 29 with a password reportedly found in a batch of leaked
// passwords (not confirmed) -> about 100 GB of data stolen in roughly two hours on May 6 (reported) -> DarkSide
// ransomware on IT and business systems in the early hours of May 7 -> a ransom note found on a control-room
// computer -> Colonial pauses the pipeline (billing was down, spread to operations technology was feared) -> restart May 12.
// The pipeline control network (OT) was not reported as directly compromised, so the logs show it as clean.
//
// What is NOT public: the attacker's exact IPs, internal hostnames, account names, and what the attacker did between
// the first login and the data theft. Those are stand-ins here. IPs come from the documentation ranges (RFC 5737). Times of
// day are made up; the dates (April 29, May 6, May 7) follow the reporting. Unlike the other cases, this one spans
// nine days, so every line carries its own date.

import { T, logBuilder, hms } from '../../game/logkit.js';

export const DATE = { weekday: 'FRI', name: 'Friday', month: 'May', day: 7 };
export const ATTACKER_IP = '203.0.113.58';
export const VPN_IP = '10.60.9.21';
export const EXFIL_IP = '198.51.100.77';
const LEGACY = 'vpnlegacy';

export const IP_INFO = {
  '203.0.113.58': { where: 'Unknown', owner: 'Hosting / anonymizing service', note: 'Never seen on this VPN before April 29. Logged in as vpnlegacy with a password only, no MFA step. (Stand-in IP: the real attacker IPs were not published.)', external: true },
  '10.60.9.21': { where: 'Internal: VPN address pool', owner: 'vpn-gw01', note: 'Handed to every vpnlegacy session. Everything this address does is the attacker.' },
  '198.51.100.77': { where: 'Unknown', owner: 'Cloud / hosting provider', note: 'Where about 100 GB of internal files went on May 6. Never contacted before. (Stand-in IP.)', external: true },
  '10.20.1.15': { where: 'Internal: server VLAN', owner: 'fs-corp01', note: 'The corporate file server: finance, billing exports, HR, contracts.' },
  '10.20.4.30': { where: 'Internal: server VLAN', owner: 'billing01', note: 'The billing system. Hit by ransomware.' },
  '203.0.113.91': { where: 'Unknown', owner: 'Mail host of the lookalike domain', note: 'Sent the "confirm your sign-in" email. Not part of the real incident.', external: true },
  '203.0.113.90': { where: 'Netherlands', owner: 'Anonymizing VPN exit', note: 'Used the analyst01 password right after it was typed into the phishing page. (Stand-in IP.)', external: true },
};

const DAY = 86400;
// day = days relative to May 7 (Apr 29 = -8, May 5 = -2, May 6 = -1).
const A = (day, h, m, s = 0) => day * DAY + T(h, m, s);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const GB = (n) => `${n.toFixed(1)}GB`;

const vpn = (b, t, user, src, extra, profile, method, mfa, result = 'SUCCESS') =>
  b.add(t, 'vpn-gw01', 'vpn', `auth user=${user} profile=${profile} method=${method} mfa=${mfa} result=${result} src=${src}`, { user, ip: src, ...extra });

export function generateLogs({ nowMinutes = 24 * 60, phishedAt = null } = {}) {
  const b = logBuilder(2021);
  const { r, add } = b;
  const win = (t, host, msg, extra = {}) => add(t, host, 'Security', msg, extra);

  // ---- Apr 29 (reported): the first login. The legacy VPN accepts a password alone. ----
  vpn(b, A(-8, 21, 14, 7), LEGACY, ATTACKER_IP, { attack: true, key: 'legacy-login' }, 'legacy-remote', 'password', 'none');
  add(A(-8, 21, 14, 9), 'vpn-gw01', 'vpn', `session start user=${LEGACY} src=${ATTACKER_IP}:50412 assigned=${VPN_IP} profile=legacy-remote`, { user: LEGACY, ip: ATTACKER_IP, attack: true, key: 'vpn-up' });

  // Looking around (stand-in: what the attacker did next is not public). One VPN address touching many internal hosts.
  const ports = [445, 3389, 443, 1433, 5985];
  for (let i = 0; i < 36; i++) {
    const host = `10.20.${1 + Math.floor(i / 12)}.${10 + ((i * 7) % 60)}`;
    add(A(-8, 21, 20) + i * 38, 'fw-core', 'netflow', `flow src=${VPN_IP} dst=${host}:${ports[i % ports.length]} proto=tcp state=${r() < 0.6 ? 'REJECT' : 'ACCEPT'} bytes=${60 + Math.floor(r() * 400)}`, { ip: VPN_IP, attack: true, key: i === 0 ? 'recon' : undefined });
  }
  // An IT service account used from the VPN address (stand-in).
  win(A(-8, 21, 52, 31), 'dc01', 'EventID=4624 An account was successfully logged on. user=svc-itops logon_type=3 src_ip=' + VPN_IP + ' workstation=-', { user: 'svc-itops', ip: VPN_IP, attack: true, key: 'admin-use' });
  win(A(-8, 21, 53, 12), 'fs-corp01', 'EventID=4624 An account was successfully logged on. user=svc-itops logon_type=3 src_ip=' + VPN_IP + ' workstation=-', { user: 'svc-itops', ip: VPN_IP, attack: true });

  // The same legacy account keeps working (stand-in: exact logins are not public).
  vpn(b, A(-2, 22, 3, 40), LEGACY, ATTACKER_IP, { attack: true }, 'legacy-remote', 'password', 'none');
  vpn(b, A(-1, 17, 46, 12), LEGACY, ATTACKER_IP, { attack: true }, 'legacy-remote', 'password', 'none');

  // ---- May 6 (reported): about 100 GB leaves in roughly two hours. ----
  let total = 0;
  for (let i = 0; i < 13; i++) {
    const gb = 7.4 + r() * 0.6;
    total += gb;
    add(A(-1, 18, 5) + i * 570, 'fw-edge', 'netflow', `flow src=10.20.1.15 dst=${EXFIL_IP}:443 proto=tcp state=ACCEPT bytes_out=${GB(gb)} app=https-upload`, { ip: EXFIL_IP, attack: true, key: i === 0 ? 'exfil-start' : undefined });
  }
  add(A(-1, 20, 10), 'fw-edge', 'netflow', `summary src=10.20.1.15 dst=${EXFIL_IP}:443 window=2h04m total_out=${GB(total)} (normal for this host: under 1GB/day)`, { ip: EXFIL_IP, attack: true, key: 'exfil-total' });

  // ---- May 7: the ransomware (reported: IT and business systems, billing). ----
  vpn(b, A(0, 2, 51, 3), LEGACY, ATTACKER_IP, { attack: true }, 'legacy-remote', 'password', 'none');
  add(A(0, 2, 51, 5), 'vpn-gw01', 'vpn', `session start user=${LEGACY} src=${ATTACKER_IP}:51188 assigned=${VPN_IP} profile=legacy-remote`, { user: LEGACY, ip: ATTACKER_IP, attack: true });
  // Backups first: the attackers want to be able to say "your backups are gone". The offline copy is out of reach.
  add(A(0, 1, 30, 4), 'bkp01', 'backup', 'job=billing-nightly status=OK copies=2 (disk, offline-tape) verified=yes size=412GB', { key: 'backup-ok' });
  win(A(0, 3, 31, 40), 'billing01', 'EventID=4688 A new process has been created. user=svc-itops process=vssadmin.exe parent=cmd.exe cmd="vssadmin delete shadows /all /quiet"', { user: 'svc-itops', attack: true, key: 'shadowdelete' });
  win(A(0, 3, 33, 5), 'billing01', 'EventID=4688 A new process has been created. user=svc-itops process=svc_update.exe parent=cmd.exe cmd="svc_update.exe --encrypt --path D:\\ --skip-system"', { user: 'svc-itops', attack: true, key: 'encrypt' });
  const shares = ['Finance/AP/aging_report.xlsx', 'Finance/Contracts/2021_shipper_terms.pdf', 'HR/benefits_2021.docx', 'Billing/exports/April_invoices.csv', 'Legal/templates/nda.docx', 'Ops/Scheduling/nominations_may.xlsx'];
  shares.forEach((p, i) => add(A(0, 3, 34) + i * 7, 'fs-corp01', 'smbd_audit', `SYSTEM|10.20.4.30|rename|ok|${p} -> ${p}.8f3a91c2`, { attack: true, key: i === 0 ? 'mass-rename' : undefined }));
  add(A(0, 3, 40, 2), 'billing01', 'app-log', 'billing-app: invoice batch FAILED: cannot open database (file format not recognized). Billing is unavailable.', { attack: true, key: 'billing-fail' });
  for (let i = 0; i < 14; i++) add(A(0, 3, 42) + i * 70, 'fw-core', 'netflow', `flow src=10.20.4.30 dst=10.20.${2 + (i % 4)}.${20 + i * 3}:445 proto=tcp state=ACCEPT bytes=${900000 + Math.floor(r() * 4000000)}`, { ip: '10.20.4.30', attack: true, key: i === 0 ? 'spread' : undefined });

  // The control network, as seen from the gateway: no outside sessions, nothing unusual. IT and OT are still linked.
  add(A(0, 4, 30, 2), 'scada-gw', 'audit', 'sessions=3 source=plant-range (jump host, engineering-ws, historian) external=0 failed_auth=0 status=NORMAL', { key: 'ot-clear' });
  add(A(0, 4, 31, 9), 'fw-ot01', 'firewall', 'it-to-ot rules active: 2 (historian replication 10.20.6.5 -> 10.40.0.12:4840, jump host 10.20.6.9 -> 10.40.0.5:3389). No hits from VPN pool 10.60.0.0/16.', { key: 'it-ot-link' });
  add(A(0, 5, 2, 15), 'ws-ctrl03', 'file-audit', 'file_create path=C:\\Users\\Public\\Desktop\\README-RESTORE.txt writer=svc_update.exe size=3KB (control-room workstation, IT domain)', { attack: true, key: 'note-found' });

  // ---- Ordinary days: people on VPN with their password and a push, plus a decoy and internet scanners. ----
  const staff = [['j.alvarez', '10.60.1.31'], ['k.mensah', '10.60.1.36'], ['d.ferraro', '10.60.1.40'], ['s.park', '10.60.1.44']];
  for (let d = -8; d <= 0; d++) {
    for (let i = 0; i < 3; i++) {
      const [u, ip] = staff[(d + 8 + i) % staff.length];
      const at = A(d, 6 + i * 3, 10 + Math.floor(r() * 40), Math.floor(r() * 60));
      if (at > A(0, 5, 29)) continue;
      const src = '192.0.2.' + (20 + Math.floor(r() * 60));
      vpn(b, at, u, src, { key: d === -8 && i === 0 ? 'decoy-mfa' : undefined }, 'employee', 'password+push', 'ok');
      add(at + 20 + Math.floor(r() * 60), 'fs-corp01', 'smbd_audit', `${u}|${ip}|pread|ok|${b.pick(['Ops/Scheduling/nominations.xlsx', 'Finance/AP/aging_report.xlsx', 'IT/inventory.csv'])}`, { user: u, ip });
    }
    // Offsite backup upload every night (decoy: a normal big upload, to a vendor, on a schedule).
    add(A(d, 1, 40, 12), 'fw-edge', 'netflow', 'flow src=10.20.5.10 dst=192.0.2.200:443 proto=tcp state=ACCEPT bytes_out=1.1GB app=backup-vendor (scheduled)', { key: d === -1 ? 'decoy-backup' : undefined });
    for (let tt = A(d, 0, 20); tt < A(d, 23, 59); tt += 6000 + Math.floor(r() * 5000)) {
      add(tt, 'edge-web', 'sshd', `sshd[${3000 + Math.floor(r() * 3000)}]: Failed password for invalid user ${b.pick(['admin', 'root', 'test', 'oracle', 'ubuntu'])} from 45.95.147.236 port ${30000 + Math.floor(r() * 30000)} ssh2`, { ip: '45.95.147.236', noise: true });
    }
  }

  // If the player types their password into the "confirm your sign-in" phish, it gets used too.
  if (phishedAt != null) {
    const at = (phishedAt + 2) * 60 + 17;
    add(at, 'idp', 'sso', 'event=auth.password outcome=SUCCESS user=analyst01@colonial.example src_ip=203.0.113.90 geo="Amsterdam, NL" device=unknown', { user: 'analyst01', ip: '203.0.113.90', attack: true, key: 'analyst01-pw' });
    add(at + 5, 'idp', 'sso', 'event=mfa.push outcome=FAILURE user=analyst01@colonial.example src_ip=203.0.113.90 factor=push reason=user_denied attempt=1', { user: 'analyst01', ip: '203.0.113.90', attack: true });
  }

  return finish(b.ev, nowMinutes);
}

// Like finishLogs, but each line carries its own date. `t` stays the time of day (the SIEM shows it); the
// full timestamp is in `time`/`line`, and ordering uses the absolute second count.
function finish(ev, nowMinutes) {
  const nowSec = A(0, 0, 0) + nowMinutes * 60;
  const stamp = (abs) => {
    const day = Math.floor(abs / DAY);
    const d = new Date(Date.UTC(2021, 4, DATE.day + day));
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${hms(abs - day * DAY)}`;
  };
  return ev
    .filter((e) => e.t <= nowSec)
    .sort((a, b) => a.t - b.t)
    .map((e) => {
      const time = stamp(e.t);
      const tod = e.t - Math.floor(e.t / DAY) * DAY;
      return {
        ...e,
        t: tod,
        time,
        line: `${time} ${e.host} ${e.source === 'Security' ? 'Microsoft-Windows-Security-Auditing: ' : ''}${e.msg}`,
        short: e.source === 'Security' ? e.msg.replace(/^EventID=(\d+) (.+?)\. (.*)$/, (_, id, _s, rest) => `${id}  ${rest}`) : e.msg,
      };
    });
}

export const CASE = {
  id: 'case',
  area: 'SOC investigation',
  title: 'How did ransomware get into the business network?',
  max: 40,
  teaches: { skill: 'Trace ransomware back to its initial access and judge the blast radius', secplus: '4.8 Incident response: analysis, containment' },
  verdicts: [
    { id: 'outage', text: 'A failed update or hardware fault in billing. The text file is a coincidence or a prank.' },
    { id: 'ot', text: 'An attack on the pipeline control system: someone is controlling pumps and valves right now.' },
    { id: 'ransomware', text: 'Ransomware with data theft: an attacker used a forgotten legacy VPN account with no MFA, moved through the IT network, copied about 100 GB, then encrypted billing and business systems. The pipeline control network shows no sign of compromise.' },
    { id: 'insider', text: 'An insider: an employee with VPN access stole the data and deployed ransomware.' },
  ],
  correctVerdict: 'ransomware',
  wrongVerdictNotes: {
    outage: 'An update does not copy 100 GB to an outside address the night before, rename thousands of files to a new extension, delete shadow copies, and leave a ransom note. This is an attack.',
    ot: 'Check the control network logs. The gateway shows no outside sessions and no failed logins, and nothing from the VPN pool reaches it. The damage is on the IT and billing side. Treating IT damage as an OT attack could push you to the wrong response. Not knowing is the real problem, and that is a reason to isolate and verify.',
    insider: 'The sign-in came from an outside address, with no MFA, on a profile nobody was supposed to be using. Real employees use the employee profile with a push approval. No one has to be an insider to use a forgotten account.',
  },
  actions: [
    { id: 'disable-vpn', text: 'Disable the legacy VPN account and every unused VPN profile, and kill any active sessions', good: true },
    { id: 'mfa-all', text: 'Require MFA on all remote access: VPN, email, remote admin', good: true },
    { id: 'segment', text: 'Isolate the IT network from the control (OT) network, and keep watching OT for any change', good: true },
    { id: 'law', text: 'Preserve evidence (disk and memory images, logs), call the FBI and CISA, and bring in an outside incident response firm', good: true },
    { id: 'restore', text: 'Rebuild affected servers and restore billing and files from the offline backups', good: true },
    { id: 'creds', text: 'Reset the passwords of accounts the attacker touched, especially svc-itops and other service and admin accounts', good: true },
    { id: 'resetonly', text: 'Just reset the vpnlegacy password; the rest is noise', good: false, why: 'The attacker already used svc-itops, copied the data and left ransomware behind. Resetting one password leaves the legacy VPN profile, the other unused profiles and every other door open.' },
    { id: 'wipe', text: 'Wipe and rebuild the infected servers right now to get billing back', good: false, why: 'Wiping first destroys the evidence of how they got in and what was taken. You need images and logs before you rebuild, or you cannot tell whether the attacker is still inside.' },
    { id: 'pay', text: 'Pay the ransom immediately, before anyone outside the company finds out', good: false, why: 'Payment is a leadership and legal decision, made with law enforcement, not a SOC shortcut. It does not guarantee a working decryptor, and it funds the next attack. Involve the FBI first.' },
  ],
  primaryEvidence: { key: 'legacy-login', note: 'The key line: vpnlegacy signing in on April 29 from 203.0.113.58 with a password only (mfa=none). It is a week earlier than the ransomware, and it is the door the rest came through.' },
  keyEvidence: ['legacy-login', 'vpn-up', 'recon', 'admin-use', 'exfil-start', 'exfil-total', 'shadowdelete', 'encrypt', 'mass-rename', 'billing-fail', 'note-found', 'ot-clear'],
  containedRequires: ['disable-vpn', 'segment'],
  costs: {
    contained: { amount: 900000, text: 'Outside forensics, rebuilding billing and file servers, days of reduced operations (estimate for this replay)' },
    breach: { amount: 6000000, text: 'The attacker keeps access; operations offline for days; stolen data published (estimate for this replay)' },
  },
  perfectWhy: 'That is the real chain: a forgotten VPN with no MFA, a week of quiet access, a big data theft, then ransomware on billing. Close the door, separate IT from OT, keep the evidence and call the FBI before anyone rebuilds, and restore from backups.',
  notSubmittedWhy: 'Nobody wrote it up. The legacy VPN stayed open, and the attacker kept a way back in.',
};

export const ALERTS = [
  {
    id: 'colonial-vpn',
    main: true,
    title: 'Mass file renames on billing and file servers; legacy VPN account involved',
    severity: 'Critical',
    rule: 'Ransomware behavior (shadow copy deletion, mass renames) plus a VPN session with mfa=none from a new outside address.',
    fields: [
      ['Account', 'vpnlegacy (profile legacy-remote)'],
      ['Source', `${ATTACKER_IP} (first seen Apr 29, 21:14)`],
      ['Outbound', 'About 100 GB to 198.51.100.77, May 6'],
      ['Hit', 'billing01, fs-corp01 and more'],
    ],
    trigger: { after: 'note', delayMs: 2500, fallbackAt: 6 * 60 + 5 },
    notice: '🚨 SIEM alert (Critical): ransomware on billing and file servers',
    chat: [
      "Okay. This is where the real team understood how big it was. The SIEM now sees mass renames on billing and the file server.",
      'First question: how did they get in? There is a VPN session in the logs from a profile called vpnlegacy.',
      'Open the Terminal. The VPN account export is at /mnt/exports/vpn/accounts.csv. Look for accounts with no MFA.',
      'Then the operations manager will want an answer. After that, badge into the server room and work the case.',
    ],
    case: CASE,
  },
  {
    id: 'colonial-analyst-phish',
    title: 'Password OK, MFA denied: analyst01 from Amsterdam',
    severity: 'High',
    rule: 'Correct password from a new country and an unknown device.',
    fields: [['Account', "analyst01 (that's you)"], ['Source IP', '203.0.113.90']],
    callout: 'You typed your password into the "confirm your sign-in" page. Opportunistic phishing always follows an outage. MFA held this time because you denied the push.',
    trigger: { when: (st) => st.phishedAt() != null && st.minutes >= st.phishedAt() + 3 },
    notice: '🚨 SIEM alert: your password was used from Amsterdam',
    chat: ['Your phone just buzzed with a push you didn\'t ask for, right? Deny it. Someone has your password.', 'That "confirm your sign-in" email. Scammers jump on every outage. Resetting you now.'],
  },
];
