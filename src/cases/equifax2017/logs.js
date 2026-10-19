// Case file: Equifax, July 29, 2017. The logs the security team would have had, rebuilt from public reporting.
//
// The real chain (sources in index.js): Apache Struts flaw CVE-2017-5638 disclosed Mar 7, 2017 -> advisory emailed
// to ~430 people Mar 9 (patch in 48 hours) -> Mar 15 scans find nothing, ACIS stays unpatched -> attackers enter ACIS
// May 13 -> ~30 web shells -> a mounted file share with plaintext application credentials -> 48 unrelated databases,
// ~9,000 queries, 265 returned PII -> data compressed, staged in a web folder and pulled out with wget (~35 attacker
// IPs) -> the traffic-inspection device had sat idle for 19 months on an expired certificate -> cert renewed
// July 29, suspicious traffic seen at once -> ACIS taken offline July 30.
//
// NOT public: attacker IPs, internal hostnames, file names, exact times. Those are stand-ins (RFC 5737 ranges). Dates
// follow the reporting; times of day are made up. This case spans months, so every line carries its own date.

import { T, logBuilder, hms } from '../../game/logkit.js';

export const DATE = { weekday: 'SAT', name: 'Saturday', month: 'Jul', day: 29 };
export const ATT1 = '203.0.113.44';
export const ATT2 = '198.51.100.23';
export const ATT3 = '203.0.113.77';
const APP = '10.30.2.21';
const WEB = '10.30.1.11';

export const IP_INFO = {
  '203.0.113.44': { where: 'Unknown (reported: China)', owner: 'Hosting provider', note: 'First request to ACIS carrying a Struts exploit string on May 13, and still asking for dispute images on July 29. Stand-in IP: the real ones were not published. The real attackers used about 35 addresses.', external: true },
  '198.51.100.23': { where: 'Unknown', owner: 'Cloud hosting', note: 'Pulled the compressed files out of a web folder on ACIS. Stand-in IP.', external: true },
  '203.0.113.77': { where: 'Germany (leased to a Chinese provider)', owner: 'German ISP, leased onward', note: 'A second source of odd ACIS traffic. The report says an IP owned by a German ISP but leased to a Chinese provider. Stand-in IP.', external: true },
  '10.30.2.21': { where: 'Internal: ACIS app tier', owner: 'acis-app01', note: 'Runs the dispute portal on Struts. Everything the web shells do comes from here.' },
  '10.30.1.11': { where: 'Internal: ACIS web tier', owner: 'acis-web01', note: 'The internet-facing front of the dispute portal.' },
  '10.30.9.5': { where: 'Internal: shared storage', owner: 'nas-app01', note: 'A mounted file share that holds application config files.' },
  '203.0.113.90': { where: 'Netherlands', owner: 'Anonymizing VPN exit', note: 'Used the analyst01 password right after it was typed into the phishing page. Stand-in IP.', external: true },
  '203.0.113.91': { where: 'Unknown', owner: 'Mail host of the lookalike domain', note: 'Sent the "renew your certificate" email. Not part of the real incident.', external: true },
};

const DAY = 86400;
// day = days relative to Jul 29 (May 13 = -77, Mar 15 = -136, Jul 25 = -4).
const A = (day, h, m, s = 0) => day * DAY + T(h, m, s);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function generateLogs({ nowMinutes = 24 * 60, phishedAt = null } = {}) {
  const b = logBuilder(2017);
  const { r, add } = b;

  // ---- The advisory and the scan that missed it (Mar 9, Mar 15) ----
  add(A(-142, 9, 31, 48), 'mail-gw', 'mail', 'list=gtvm-alerts subject="Apache Struts 2 critical: patch within 48 hours" recipients=430 policy=critical', { key: 'advisory' });
  add(A(-136, 13, 56, 10), 'vulnscan01', 'scanner', 'job=struts-signature targets=958 (external IPs) findings=0 note="component scan ran on / only; /opt/acis/webapps/*/WEB-INF/lib not walked"', { key: 'scan-miss' });

  // ---- The inspection device goes blind: cert expired about 19 months before July 29 (date is a stand-in) ----
  add(A(-578, 3, 0, 5), 'netinspect01', 'tls-inspect', 'cert subject=*.acis.corp.example notAfter=expired status=EXPIRED decrypt=OFF sessions passed uninspected', { key: 'cert-expired' });
  for (let d = -77; d < 0; d += 7) add(A(d, 3, 0, 5), 'netinspect01', 'tls-inspect', 'status=EXPIRED decrypt=OFF sessions passed uninspected (acis-web01, acis-app01)', { key: d === -77 ? 'inspect-blind' : undefined });

  // ---- May 13: the exploit and the first web shell ----
  add(A(-77, 20, 31, 12), 'acis-web01', 'httpd', `${ATT1} POST /dispute/upload.action 200 Content-Type="[ognl expression, redacted]" ua=curl`, { ip: ATT1, attack: true, key: 'exploit' });
  add(A(-77, 20, 31, 14), 'acis-app01', 'auditd', 'exec uid=tomcat parent=java cmd="/bin/sh -c id" (spawned by the portal process)', { attack: true, key: 'cmd-exec' });
  add(A(-77, 20, 44, 3), 'acis-app01', 'file-audit', 'file_create path=/opt/acis/webapps/ROOT/help/view2.jsp writer=tomcat size=2KB (not part of any deployment)', { attack: true, key: 'webshell' });
  // About 30 web shells over the 76 days (stand-in names).
  for (let i = 1; i < 8; i++) add(A(-77 + i * 9, 21, 10 + i, 7), i % 2 ? 'acis-app01' : 'acis-app02', 'file-audit', `file_create path=/opt/acis/webapps/ROOT/help/v${i}${i * 3}.jsp writer=tomcat size=${2 + i}KB (not part of any deployment)`, { attack: true });
  add(A(-76, 1, 12, 40), 'acis-app01', 'file-audit', 'No file integrity monitoring on /opt/acis (agent not installed)', { key: 'no-fim' });

  // ---- Credentials in a file, then 48 databases ----
  add(A(-77, 21, 2, 19), 'nas-app01', 'smbd_audit', 'tomcat|10.30.2.21|pread|ok|appconfig/acis/db/connections.properties (plaintext user and password, redacted here)', { ip: APP, attack: true, key: 'cred-file' });
  add(A(-76, 2, 5, 3), 'db-audit', 'dbaudit', 'user=acis_app src=10.30.2.21 connect db=cons_credit01 (ACIS normally uses 3 databases: acis_disputes, acis_status, acis_docs)', { ip: APP, attack: true, key: 'db-sprawl' });
  for (let i = 2; i <= 9; i++) add(A(-76, 2, 5 + i, 30), 'db-audit', 'dbaudit', `user=acis_app src=10.30.2.21 connect db=cons_${['credit', 'ident', 'emp', 'addr', 'legacy', 'batch', 'archive', 'rpt'][i - 2]}${String(i).padStart(2, '0')}`, { ip: APP, attack: true });
  add(A(-70, 4, 40, 0), 'db-audit', 'dbaudit', 'summary user=acis_app window=76d databases=48 queries=~9000 returned_pii_tables=265 (normal: 3 databases)', { ip: APP, attack: true, key: 'db-48' });
  add(A(-60, 3, 12, 20), 'db-audit', 'dbaudit', 'user=acis_app src=10.30.2.21 query=metadata table_schema scan on cons_credit01 rows=0 (looking for PII columns)', { ip: APP, attack: true, key: 'queries' });

  // ---- Staging and exfiltration ----
  for (let i = 0; i < 5; i++) {
    add(A(-40 + i * 8, 2, 20 + i, 0), 'acis-app01', 'file-audit', `file_create path=/opt/acis/webapps/ROOT/static/img/c${i}${i + 7}.zip writer=tomcat size=${40 + i * 9}MB (compressed archive in a web folder)`, { attack: true, key: i === 0 ? 'stage' : undefined });
    add(A(-40 + i * 8, 2, 31 + i, 22), 'acis-web01', 'httpd', `${i % 2 ? ATT2 : ATT1} GET /static/img/c${i}${i + 7}.zip 200 bytes=${(40 + i * 9) * 1048576}`, { ip: i % 2 ? ATT2 : ATT1, attack: true, key: i === 0 ? 'exfil-web' : undefined });
  }
  add(A(-9, 3, 9, 12), 'acis-app01', 'auditd', 'exec uid=tomcat cmd="wget [redacted destination]" (spawned by web shell)', { attack: true });
  add(A(-4, 22, 3, 3), 'acis-web01', 'httpd', `${ATT3} GET /dispute/view.action?id=[redacted] 200 bytes=10873412`, { ip: ATT3, attack: true });
  add(A(-4, 22, 5, 41), 'acis-web01', 'httpd', `${ATT1} GET /dispute/view.action?id=[redacted] 200 bytes=10311204`, { ip: ATT1, attack: true });

  // ---- July 29: the certificate is renewed and the device wakes up ----
  add(A(0, 9, 41, 8), 'netinspect01', 'tls-inspect', 'cert subject=*.acis.corp.example notAfter=2019-07-29 status=VALID decrypt=ON (certificate installed by network ops)', { key: 'cert-renewed' });
  add(A(0, 9, 42, 30), 'netinspect01', 'ids', `alert sig="large response to unusual client" src=${ATT1} dst=10.30.1.11 bytes=10873412 (images from credit dispute files)`, { ip: ATT1, attack: true, key: 'big-response' });
  add(A(0, 9, 46, 2), 'moloch01', 'pcap', `search src=${ATT1} -> persistent requests to ACIS since Jul 25. Earlier sessions: undecryptable (certificate expired)`, { ip: ATT1, attack: true, key: 'since-jul25' });

  // ---- Ordinary noise and decoys ----
  for (let d = -10; d <= 0; d++) {
    for (let i = 0; i < 4; i++) {
      const at = A(d, 8 + i * 3, 5 + Math.floor(r() * 50), Math.floor(r() * 60));
      if (at > A(0, 9, 40)) continue;
      add(at, 'acis-web01', 'httpd', `192.0.2.${20 + Math.floor(r() * 90)} POST /dispute/upload.action 200 bytes=${90000 + Math.floor(r() * 2000000)} (consumer uploads a dispute letter)`, { ip: undefined });
    }
    add(A(d, 2, 0, 15), 'fw-edge', 'netflow', 'flow src=10.30.5.10 dst=192.0.2.210:443 proto=tcp state=ACCEPT bytes_out=2.4GB app=partner-batch (scheduled nightly file to a data partner)', { key: d === -1 ? 'decoy-batch' : undefined });
    for (let tt = A(d, 0, 20); tt < A(d, 23, 59); tt += 7000 + Math.floor(r() * 5000)) {
      add(tt, 'edge-web', 'sshd', `sshd[${3000 + Math.floor(r() * 3000)}]: Failed password for invalid user ${b.pick(['admin', 'root', 'test', 'oracle', 'ubuntu'])} from 45.95.147.236 port ${30000 + Math.floor(r() * 30000)} ssh2`, { ip: '45.95.147.236', noise: true });
    }
  }
  add(A(-136, 15, 0, 0), 'portal-web03', 'app-log', 'struts 2.3.32 loaded (patched build deployed Mar 14 by its owner)', { key: 'decoy-patched' });
  add(A(0, 8, 20, 5), 'netinspect02', 'tls-inspect', 'cert subject=*.portal.corp.example notAfter=2018-02-11 status=VALID decrypt=ON', { key: 'decoy-cert-ok' });

  // If the player types their password into the "renew your certificate" phish, it gets used too.
  if (phishedAt != null) {
    const at = (phishedAt + 2) * 60 + 17;
    add(at, 'idp', 'sso', 'event=auth.password outcome=SUCCESS user=analyst01@corp.example src_ip=203.0.113.90 geo="Amsterdam, NL" device=unknown', { user: 'analyst01', ip: '203.0.113.90', attack: true, key: 'analyst01-pw' });
  }

  return finish(b.ev, nowMinutes);
}

function finish(ev, nowMinutes) {
  const nowSec = A(0, 0, 0) + nowMinutes * 60;
  const stamp = (abs) => {
    const day = Math.floor(abs / DAY);
    const d = new Date(Date.UTC(2017, 6, DATE.day + day));
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
  title: 'What is behind the huge image responses from ACIS?',
  max: 40,
  teaches: { skill: 'Trace a data theft back to an unpatched flaw and judge the blast radius', secplus: '4.8 Incident response: analysis, containment' },
  verdicts: [
    { id: 'normal', text: 'Normal traffic: consumers downloading their dispute images. A noisy alert.' },
    { id: 'ddos', text: 'A denial-of-service attempt against the dispute portal.' },
    { id: 'struts', text: 'A long intrusion: attackers used the unpatched Struts flaw on ACIS, planted web shells, found plaintext credentials, reached dozens of unrelated databases and copied personal data out. The expired inspection certificate hid it.' },
    { id: 'insider', text: 'An insider with ACIS database credentials copying data out.' },
  ],
  correctVerdict: 'struts',
  wrongVerdictNotes: {
    normal: 'Real consumers do not request 10 MB responses from an address in a new country, and the same address has been probing since July 25. The big responses are the visible tip of weeks of activity.',
    ddos: 'A denial of service makes noise to knock a system over. Here the portal answered every request. The attacker wanted what was inside it.',
    insider: 'The first request carried a Struts exploit string from an outside address, and the web shells came right after. No inside knowledge was needed. The app account was just sitting in a plaintext file.',
  },
  actions: [
    { id: 'offline', text: 'Take ACIS offline for emergency maintenance, and image the web and app servers first', good: true },
    { id: 'creds', text: 'Rotate every credential in the config file and on the shares ACIS could reach, and move secrets into a vault', good: true },
    { id: 'shells', text: 'Hunt for web shells on every ACIS server (recent .jsp files, not in a deployment) and rebuild from clean builds', good: true },
    { id: 'segment', text: 'Restrict the ACIS account to the 3 databases it needs and separate ACIS from the other databases', good: true },
    { id: 'certs', text: 'Renew every expired certificate on inspection devices and alert on expiry 30 days ahead', good: true },
    { id: 'ir', text: 'Preserve evidence, call legal and the CIO and CSO, and bring in an outside forensics firm and the FBI', good: true },
    { id: 'patch', text: 'Patch Struts on every app, and rescan the full path with an inventory of what runs where', good: true },
    { id: 'patchonly', text: 'Just patch Struts and put ACIS back online', good: false, why: 'The attackers already have web shells, credentials and a way back. Patching closes the front door and leaves everything they planted. Hunt and rebuild first.' },
    { id: 'blockip', text: 'Block the one suspicious IP; that is the attacker', good: false, why: 'The real attackers used about 35 addresses. Blocking one is whack-a-mole, and it tells you nothing about what is already inside.' },
    { id: 'rebuildnow', text: 'Wipe and rebuild the ACIS servers right now, no images', good: false, why: 'Without images you lose the web shells, the commands and the log trail. You could not say what was taken, which Equifax needed to know.' },
  ],
  primaryEvidence: { key: 'exploit', note: 'The key line: May 13, a POST to the ACIS upload page with an exploit string in the Content-Type header (CVE-2017-5638). It is 76 days older than today and it is the door.' },
  keyEvidence: ['advisory', 'scan-miss', 'exploit', 'webshell', 'cred-file', 'db-48', 'exfil-web', 'cert-expired', 'inspect-blind', 'big-response', 'since-jul25', 'cert-renewed'],
  containedRequires: ['offline', 'creds'],
  costs: {
    contained: { amount: 3000000, text: 'Outside forensics, rebuilding ACIS, credential rotation, legal work (estimate for this replay)' },
    breach: { amount: 90000000, text: 'Months more of silent access, then a notification to a huge number of people (estimate for this replay)' },
  },
  perfectWhy: 'That is the real chain: a known flaw with a fix already out, a scan that missed it, web shells, a credentials file, 48 databases, and a blind monitoring device. Take ACIS offline with images, rotate credentials, hunt the shells, patch, and fix the certificate process.',
  notSubmittedWhy: 'Nobody wrote it up. ACIS stayed online, and the attackers kept their access.',
};

export const ALERTS = [
  {
    id: 'eqx-acis',
    main: true,
    title: 'Large responses from ACIS to an unusual outside client; inspection device just came back',
    severity: 'Critical',
    rule: 'Response over 10 MB to a client seen only since July 25, found by the inspection device after its certificate was renewed.',
    fields: [
      ['Client', `${ATT1} (since Jul 25)`],
      ['Hit', 'acis-web01, acis-app01'],
      ['Device', 'netinspect01: cert renewed 09:41'],
      ['Blind spot', 'decrypt was OFF until today'],
    ],
    trigger: { after: 'app', delayMs: 2500, fallbackAt: 10 * 60 + 20 },
    notice: '🚨 SIEM alert (Critical): big responses from the dispute portal',
    chat: [
      'This is the moment the real team saw it. The device decrypts again, and it does not like what it sees on ACIS.',
      'Open the Terminal. Exports are under /mnt/exports: the asset inventory, the scan job, the certificate list and the ACIS config. Look for what should have been fixed.',
      'Someone from IT will want a decision soon. Then badge into the server room and work the case.',
    ],
    case: CASE,
  },
  {
    id: 'eqx-analyst-phish',
    title: 'Password OK from Amsterdam on a new device: analyst01',
    severity: 'High',
    rule: 'Correct password from a new country and an unknown device.',
    fields: [['Account', "analyst01 (that's you)"], ['Source IP', '203.0.113.90']],
    callout: 'You typed your password into the "renew your certificate" page. Opportunistic phishing follows every certificate scare. Reset it, and check what the copycat touched.',
    trigger: { when: (st) => st.phishedAt() != null && st.minutes >= st.phishedAt() + 3 },
    notice: '🚨 SIEM alert: your password was used from Amsterdam',
    chat: ['Someone has your password. That "renew your certificate" page was not ours.', 'Resetting you now. Next time, check the sender before you type.'],
  },
];
