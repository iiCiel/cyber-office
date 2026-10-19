// Case file: MOVEit Transfer zero-day (CVE-2023-34362), May-June 2023. The logs a CUSTOMER of the product
// would have had, rebuilt from public reporting.
//
// The real chain (sources in index.js): an unauthenticated SQL injection in the MOVEit Transfer web app
// (requests to guestaccess.aspx) -> a web shell, LEMURLOOT, dropped as human2.aspx next to the legitimate
// human.aspx -> the shell checks an X-siLock-Comment header (anything else gets a 404), lists files, creates a
// sysadmin user named "Health Check Service" and an active session for it, downloads files, then deletes the
// user (CISA AA23-158A, Mandiant, TrustedSec). Exploitation began May 27, 2023 (Memorial Day weekend);
// Progress announced the bug May 31. Mandiant saw large thefts within minutes of the shell going in.
//
// NOT public / invented here: this customer's hostnames, users, files, the times of day, the number of
// requests and bytes, the WAF being in detect-only mode, and which IPs were used. IPs come from the
// documentation ranges (RFC 5737); the real IOC addresses are in the advisories and are not reproduced.
// SQL injection payloads are never shown: they are replaced by a redaction note.
// Dates (May 27 through June 1) follow the reporting, so every line carries its own date like the Colonial case.

import { T, logBuilder, hms } from '../../game/logkit.js';

export const DATE = { weekday: 'THU', name: 'Thursday', month: 'Jun', day: 1 };
export const SCAN_IP = '198.51.100.23'; // injects and drops the shell
export const THEFT_IP = '203.0.113.60'; // talks to the shell and pulls the files (Mandiant: theft came from different hosts)
export const LATE_IP = '198.51.100.88'; // still using the shell on June 1
const MOVEIT = '10.20.8.12';
const WEB = 'moveit01';

export const IP_INFO = {
  [SCAN_IP]: { where: 'Unknown', owner: 'Rented VPS (hosting provider)', note: 'First seen on this server May 27. Sends the POSTs to guestaccess.aspx that the WAF flagged but did not block. (Stand-in IP: real IOC addresses are in the CISA/Mandiant advisories.)', external: true },
  [THEFT_IP]: { where: 'Unknown', owner: 'Rented VPS (hosting provider)', note: 'Calls /human2.aspx with the secret header, then downloads files. Never connected to this server before May 27. (Stand-in IP.)', external: true },
  [LATE_IP]: { where: 'Unknown', owner: 'Rented VPS (hosting provider)', note: 'Using the web shell as late as June 1, after the vendor advisory. (Stand-in IP.)', external: true },
  '198.51.100.99': { where: 'Unknown', owner: 'Rented VPS (hosting provider)', note: 'Probes /human2.aspx on many servers. With no secret header it only ever gets a 404. (Stand-in IP.)', external: true },
  '192.0.2.150': { where: 'Ohio, United States', owner: 'Larkin Payroll Services (partner)', note: 'A partner that pulls its payroll files every night. Known, expected, over SFTP and HTTPS.', external: true },
  '203.0.113.200': { where: 'Unknown', owner: 'Cloud / VPN provider', note: 'Customer-facing partner portal users sign in from many networks like this one. Normal.', external: true },
  [MOVEIT]: { where: 'Internal: DMZ', owner: WEB, note: 'The MOVEit Transfer server (IIS + database). Internet-facing on 443 and 22.' },
  '10.20.4.33': { where: 'Internal: office', owner: 'WS-0112 (j.alvarez)', note: 'A staff workstation. Normal use of the MOVEit web page.' },
};

const DAY = 86400;
// day = days relative to June 1 (May 27 = -5, May 31 = -1).
const A = (day, h, m, s = 0) => day * DAY + T(h, m, s);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const mb = (n) => `${n.toFixed(0)}MB`;

const UA = 'Mozilla/5.0 (X11; Linux x86_64)';
const iis = (b, t, ip, method, uri, status, bytes, extra = {}, more = '') =>
  b.add(t, WEB, 'iis', `${method} ${uri} port=443 src=${ip} ua="${UA}" status=${status} bytes_out=${bytes}${more}`, { ip, ...extra });
const audit = (b, t, msg, extra = {}) => b.add(t, WEB, 'moveit-audit', msg, extra);

export function generateLogs({ nowMinutes = 24 * 60 } = {}) {
  const b = logBuilder(2023);
  const { r, add } = b;

  // ---- Sat May 27, early morning: the SQL injection, the web shell, the files. ----
  iis(b, A(-5, 2, 41, 10), SCAN_IP, 'GET', '/guestaccess.aspx', 200, '8.1KB', { attack: true, key: 'probe' });
  for (let i = 0; i < 4; i++) {
    iis(b, A(-5, 2, 43, 2 + i * 11), SCAN_IP, 'POST', '/guestaccess.aspx', 200, '1.2KB', { attack: true, key: i === 0 ? 'sqli-1' : undefined }, ' req_body="[SQL injection payload redacted in this replay]"');
  }
  add(A(-5, 2, 43, 3), 'waf01', 'waf', `rule=942100 category=sqli action=LOG-ONLY (detection mode) src=${SCAN_IP} uri=/guestaccess.aspx payload="[redacted]" score=5`, { ip: SCAN_IP, attack: true, key: 'waf-sqli' });
  add(A(-5, 2, 50, 30), WEB, 'edr', 'file_create path=C:\\MOVEitTransfer\\wwwroot\\human2.aspx writer=w3wp.exe size=8KB signed=no (every other file in this folder is vendor-signed)', { attack: true, key: 'file-create' });
  add(A(-5, 2, 51, 14), WEB, 'edr', 'file_create path=C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\Temporary ASP.NET Files\\root\\App_Web_x7q2m1rd.dll writer=w3wp.exe size=11KB', { attack: true, key: 'dll-compiled' });
  iis(b, A(-5, 2, 52, 3), THEFT_IP, 'GET', '/human2.aspx', 200, '0.1KB', { attack: true, key: 'human2-first' }, ' hdr=X-siLock-Comment:[REDACTED-GUID] step=none');
  audit(b, A(-5, 2, 52, 4), 'user created: LoginName=k9vq2xw7 RealName="Health Check Service" Permission=SysAdmin(30) source=web-request session=active', { ip: THEFT_IP, attack: true, key: 'hcs-create' });
  iis(b, A(-5, 2, 55, 10), THEFT_IP, 'GET', '/human2.aspx', 200, '3.8MB', { attack: true, key: 'enum' }, ' hdr=X-siLock-Comment:[REDACTED-GUID] X-siLock-Step1:-1 encoding=gzip');
  let total = 0;
  for (let i = 0; i < 14; i++) {
    const m = 380 + r() * 120;
    total += m;
    iis(b, A(-5, 3, 1, 5) + i * 78, THEFT_IP, 'GET', '/human2.aspx', 200, mb(m), { attack: true, key: i === 0 ? 'bulk-dl' : undefined }, ` hdr=X-siLock-Comment:[REDACTED-GUID] X-siLock-Step2:${100 + i} X-siLock-Step3:${5000 + i * 7} encoding=gzip`);
  }
  add(A(-5, 3, 21, 0), 'fw-edge', 'netflow', `summary src=${MOVEIT} dst=${THEFT_IP}:443 window=28m total_out=${(total / 1000).toFixed(1)}GB (normal for this host: under 0.5GB/day)`, { ip: THEFT_IP, attack: true, key: 'exfil-total' });
  iis(b, A(-5, 3, 26, 40), THEFT_IP, 'GET', '/human2.aspx', 200, '0.1KB', { attack: true, key: 'hcs-delete-req' }, ' hdr=X-siLock-Comment:[REDACTED-GUID] X-siLock-Step1:-2');
  audit(b, A(-5, 3, 26, 41), 'user deleted: RealName="Health Check Service" source=web-request', { ip: THEFT_IP, attack: true, key: 'hcs-delete' });

  // ---- The holiday weekend: more of the same, and nobody is watching. ----
  for (let i = 0; i < 9; i++) {
    iis(b, A(-4, 3, 7, 11) + i * 94, THEFT_IP, 'GET', '/human2.aspx', 200, mb(250 + r() * 180), { attack: true }, ` hdr=X-siLock-Comment:[REDACTED-GUID] X-siLock-Step2:${140 + i} X-siLock-Step3:${6100 + i * 5} encoding=gzip`);
  }
  // Other opportunists scan the internet for the shell: without the header it answers 404.
  for (let i = 0; i < 8; i++) {
    iis(b, A(-3 + (i % 3), 4 + i, 12 + i * 5), i % 2 ? '198.51.100.99' : LATE_IP, 'GET', '/human2.aspx', 404, '0.3KB', { attack: true, key: i === 0 ? 'scan-404' : undefined }, ' hdr=(none)');
  }

  // ---- Wed May 31: the vendor announces the bug. Thu June 1: the shell still works. ----
  audit(b, A(-1, 22, 7, 20), 'user created: LoginName=h3m8d1qz RealName="Health Check Service" Permission=SysAdmin(30) source=web-request session=active', { ip: LATE_IP, attack: true, key: 'hcs-create2' });
  iis(b, A(-1, 22, 7, 19), LATE_IP, 'GET', '/human2.aspx', 200, '0.1KB', { attack: true }, ' hdr=X-siLock-Comment:[REDACTED-GUID] step=none');
  iis(b, A(0, 5, 12, 33), LATE_IP, 'GET', '/human2.aspx', 200, '212MB', { attack: true, key: 'still-active' }, ' hdr=X-siLock-Comment:[REDACTED-GUID] X-siLock-Step2:188 X-siLock-Step3:7340 encoding=gzip');

  // ---- Ordinary days: decoys and noise. ----
  const partnerFiles = ['payroll_batch', 'enrollment_changes', 'claims_reconcile'];
  for (let d = -5; d <= 0; d++) {
    // Decoy: a partner's scheduled nightly pull. Big, but known, and from a known address.
    const t = A(d, 23, 10, 5);
    if (t <= A(0, 8, 0)) {
      iis(b, t, '192.0.2.150', 'GET', `/api/v1/files/${partnerFiles[(d + 5) % 3]}.csv`, 200, '410MB', { key: d === -2 ? 'decoy-partner' : undefined }, ' user=larkin-sftp auth=token');
      audit(b, t + 2, `login ok user=larkin-sftp src=192.0.2.150 method=password+ssh-key`, { user: 'larkin-sftp', ip: '192.0.2.150' });
    }
    // Decoy: the legitimate human.aspx (the real file the shell was named after) and staff sign-ins.
    if (d >= -4 && d % 2 === 0 || d === 0) {
      iis(b, A(d, 8, 40 + (d + 5)), '10.20.4.33', 'GET', '/human.aspx', 200, '6.3KB', { key: d === -4 ? 'decoy-human' : undefined, ip: '10.20.4.33' }, ' (vendor file, normal)');
      audit(b, A(d, 8, 41, 10), 'login ok user=j.alvarez src=10.20.4.33 method=password+mfa', { user: 'j.alvarez', ip: '10.20.4.33' });
    }
    // Partner uploads over the web UI all day.
    for (let i = 0; i < 3; i++) {
      const at = A(d, 9 + i * 2, 10 + Math.floor(r() * 40), Math.floor(r() * 60));
      if (at > A(0, 8, 0)) continue;
      iis(b, at, '203.0.113.200', 'POST', '/api/v1/files', 200, '0.4KB', {}, ` user=${b.pick(['hrbenefits-up', 'claimsvendor-up', 'auditfirm-up'])} auth=token`);
    }
    for (let tt = A(d, 0, 20); tt < A(d, 23, 59); tt += 6000 + Math.floor(r() * 5000)) {
      if (tt > A(0, 8, 0)) break;
      add(tt, 'edge-web', 'sshd', `sshd[${3000 + Math.floor(r() * 3000)}]: Failed password for invalid user ${b.pick(['admin', 'root', 'test', 'oracle', 'ubuntu'])} from 45.95.147.236 port ${30000 + Math.floor(r() * 30000)} ssh2`, { ip: '45.95.147.236', noise: true });
    }
  }

  return finish(b.ev, nowMinutes);
}

// Like finishLogs, but each line carries its own date. `t` stays the time of day (the SIEM shows it); the
// full timestamp is in `time`/`line`, and ordering uses the absolute second count.
function finish(ev, nowMinutes) {
  const nowSec = A(0, 0, 0) + nowMinutes * 60;
  const stamp = (abs) => {
    const day = Math.floor(abs / DAY);
    const d = new Date(Date.UTC(2023, 5, DATE.day + day));
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${hms(abs - day * DAY)}`;
  };
  return ev
    .filter((e) => e.t <= nowSec)
    .sort((a, b) => a.t - b.t)
    .map((e) => {
      const time = stamp(e.t);
      const tod = e.t - Math.floor(e.t / DAY) * DAY;
      return { ...e, t: tod, time, line: `${time} ${e.host} ${e.msg}`, short: e.msg };
    });
}

export const CASE = {
  id: 'case',
  area: 'SOC investigation',
  title: 'What is human2.aspx, and what left the MOVEit server?',
  max: 40,
  teaches: { skill: 'Confirm a web-shell compromise of an internet-facing server, scope the data loss and contain it', secplus: '4.8 Incident response: analysis, containment' },
  verdicts: [
    { id: 'scan', text: 'Routine internet scanning. The POSTs and the 404s are background noise, and the big download is a partner doing its normal pull.' },
    { id: 'moveit0day', text: 'Exploitation of the MOVEit Transfer SQL injection (CVE-2023-34362): a web shell, human2.aspx, was dropped on May 27, a hidden sysadmin account was created, and files were downloaded from the server. It is still being used. Patching alone will not remove it.' },
    { id: 'creds', text: 'A partner password was stolen, and the attacker simply logged in and downloaded files with it.' },
    { id: 'insider', text: 'An insider with MOVEit admin rights created the account and took the files.' },
  ],
  correctVerdict: 'moveit0day',
  wrongVerdictNotes: {
    scan: 'Scanners get a 404 from human2.aspx because they lack the secret header. The sources that got 200s sent that header, after POSTs to guestaccess.aspx, a new unsigned file in wwwroot, a new sysadmin account and gigabytes going out in 28 minutes. That is not noise.',
    creds: 'No login is involved. The downloads come through human2.aspx, a file that is not part of MOVEit, from addresses with no account on this server. The partner pull is the other, known, scheduled traffic.',
    insider: 'The account "Health Check Service" was created by a web request, not by an admin. The requests come from outside addresses, and the file was dropped by the web server process right after the injection requests.',
  },
  actions: [
    { id: 'isolate', text: 'Block HTTP and HTTPS to moveit01 (as Progress advises), keep it powered on, and take a disk and memory snapshot and copies of the IIS and audit logs first', good: true },
    { id: 'hunt', text: 'Hunt for human2.aspx and any other new files in wwwroot, App_Web DLLs, and every unknown sysadmin account and active session, over at least 30 days of logs', good: true },
    { id: 'patch', text: 'Rebuild or restore moveit01 from a clean image that predates May 27, then install the fixed MOVEit version before it goes back online', good: true },
    { id: 'rotate', text: 'Rotate everything the server could reach: service and database accounts, API tokens, partner SFTP keys and passwords, and any cloud storage keys', good: true },
    { id: 'scope', text: 'Use the IIS logs to list which files were downloaded, classify the data in them, and bring in IR, legal and the FBI/CISA. Plan notices to partners and affected people', good: true },
    { id: 'minimize', text: 'Purge files from the transfer server after delivery and set short retention, so it is a pipe and not an archive', good: true },
    { id: 'patchonly', text: 'Install the patch, reboot and reopen the server. The bug is fixed, so we are done', good: false, why: 'The patch closes the SQL injection, not the web shell or the accounts already planted, and the data is already gone. Patching alone leaves the attacker a way back and tells you nothing about who was hit.' },
    { id: 'deleteshell', text: 'Delete human2.aspx and the Health Check Service user and move on', good: false, why: 'That destroys your evidence and hides which files left. The attacker may have left other doors, and without the logs you cannot tell your partners what was taken.' },
    { id: 'quiet', text: 'Tell nobody until the attackers contact us, so we do not cause a panic', good: false, why: 'Cl0p did not call first: it posted victims on its leak site on June 6 and the data was already stolen. Customers and partners need facts early, from you, not from an extortion page.' },
  ],
  primaryEvidence: { key: 'file-create', note: 'The key line: w3wp.exe wrote an unsigned human2.aspx into wwwroot on May 27 at 02:50, seven minutes after the SQL injection requests. MOVEit does not ship that file. Real MOVEit has human.aspx, with no 2.' },
  keyEvidence: ['sqli-1', 'waf-sqli', 'file-create', 'hcs-create', 'enum', 'bulk-dl', 'exfil-total', 'hcs-delete', 'still-active', 'hcs-create2', 'dll-compiled'],
  containedRequires: ['isolate', 'hunt'],
  costs: {
    contained: { amount: 650000, text: 'Outside forensics, rebuilding the server, notices and credit monitoring for affected people, partner contract fallout (estimate for this replay)' },
    breach: { amount: 5500000, text: 'The shell stays live, more files leave, extortion and publication follow, plus regulators and lawsuits (estimate for this replay)' },
  },
  perfectWhy: 'That is the real pattern: an internet-facing file-transfer server, a zero-day, a web shell, a hidden admin, and a data grab within minutes. Contain without destroying evidence, hunt, scope what left, rebuild and patch, rotate and tell people.',
  notSubmittedWhy: 'Nobody wrote it up. The web shell stayed live and the attacker kept pulling files.',
};

export const ALERTS = [
  {
    id: 'moveit-shell',
    main: true,
    title: 'Vendor IOC match: /human2.aspx on moveit01, large outbound transfer',
    severity: 'Critical',
    rule: 'Vendor/CISA IOC list: request to /human2.aspx or X-siLock-* headers, plus moveit01 outbound more than 10x its baseline.',
    fields: [
      ['Host', 'moveit01 (MOVEit Transfer, internet-facing)'],
      ['IOC', '/human2.aspx, X-siLock-Comment header, user "Health Check Service"'],
      ['First seen', 'May 27, 02:52'],
      ['Outbound', 'About 6 GB to 203.0.113.60 in 28 minutes, May 27'],
    ],
    trigger: { after: 'exposure', delayMs: 2500, fallbackAt: 9 * 60 },
    notice: '🚨 SIEM alert (Critical): MOVEit web shell IOC match',
    chat: [
      'The IOC list finally matched. Remember, the exploitation started on Saturday May 27 and the vendor only announced it on Wednesday. Five days of a head start.',
      'First question: is this server compromised, and is it still being used? Check the file system, not only the logs.',
      'Open the Terminal. The MOVEit server export is at /mnt/moveit01. Look at wwwroot and the IIS logs for human2.',
      'Then a partner is likely to call. After that, badge into the server room and work the case.',
    ],
    case: CASE,
  },
];
