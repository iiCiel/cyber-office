// Case file: Change Healthcare, Feb 21, 2024. The logs the security team would have had, rebuilt from public statements.
//
// The real chain (sources in index.js): criminals used stolen credentials to sign in to a Citrix remote-access portal
// that had no MFA (CEO written testimony, May 1 2024) on Feb 12 -> they moved laterally and took data (testimony) ->
// nine days later, on Feb 21, ransomware was deployed and discovered; the company cut connectivity to Change's data
// centers -> the ALPHV/BlackCat group claimed the attack (its claims of ~6 TB of data are the attacker's) -> a ransom
// was paid (CEO testimony; the ~$22M amount comes from reporting).
//
// What is NOT public: the account used, the attacker's IPs, internal hostnames, what exactly happened between Feb 12 and
// Feb 21, and how much data left on which day. Those are stand-ins; IPs are from the documentation ranges (RFC 5737).
// Times of day are made up; the dates (Feb 12, Feb 21) follow the testimony. Every line carries its own date.

import { T, logBuilder, hms } from '../../game/logkit.js';

export const DATE = { weekday: 'WED', name: 'Wednesday', month: 'Feb', day: 21 };
export const ATTACKER_IP = '203.0.113.44';
export const CITRIX_IP = '10.50.8.14';
export const EXFIL_IP = '198.51.100.130';
const ACCT = 'c.ellery';

export const IP_INFO = {
  '203.0.113.44': { where: 'Unknown', owner: 'Hosting / anonymizing service', note: 'First seen Feb 12. Signed in to the Citrix portal as c.ellery with a password only, no MFA. (Stand-in IP: the real attacker IPs were not published.)', external: true },
  '10.50.8.14': { where: 'Internal: remote access zone', owner: 'cx-remote01', note: 'The Citrix remote-desktop host. From Feb 12 it is the starting point for everything the attacker does.' },
  '198.51.100.130': { where: 'Unknown', owner: 'Cloud / hosting provider', note: 'Where internal files went in the nights before the ransomware. Never contacted before. The attacker later claimed about 6 TB; that figure is not confirmed. (Stand-in IP.)', external: true },
  '10.30.4.10': { where: 'Internal: server VLAN', owner: 'claims-db01', note: 'The claims database. Hit by ransomware.' },
  '10.30.1.15': { where: 'Internal: server VLAN', owner: 'fs-ops01', note: 'Operations file server: provider exports, reports, shared drives.' },
  '203.0.113.91': { where: 'Unknown', owner: 'Mail host of the lookalike domain', note: 'Sent the "recovery portal" email. Not part of the real incident.', external: true },
  '203.0.113.90': { where: 'Netherlands', owner: 'Anonymizing VPN exit', note: 'Used the analyst01 password right after it was typed into the phishing page. (Stand-in IP.)', external: true },
};

const DAY = 86400;
// day = days relative to Feb 21 (Feb 12 = -9).
const A = (day, h, m, s = 0) => day * DAY + T(h, m, s);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const GB = (n) => `${n.toFixed(1)}GB`;

const cx = (b, t, user, src, extra, portal, method, mfa, result = 'SUCCESS') =>
  b.add(t, 'cx-gw01', 'citrix', `auth portal=${portal} user=${user} method=${method} mfa=${mfa} result=${result} src=${src}`, { user, ip: src, ...extra });

export function generateLogs({ nowMinutes = 24 * 60, phishedAt = null } = {}) {
  const b = logBuilder(2024);
  const { r, add } = b;
  const win = (t, host, msg, extra = {}) => add(t, host, 'Security', msg, extra);

  // ---- Feb 12 (testimony): the first login. The Citrix portal accepts a password alone. ----
  cx(b, A(-9, 2, 17, 8), ACCT, ATTACKER_IP, { attack: true, key: 'citrix-login' }, 'cx-remote01', 'password', 'none');
  add(A(-9, 2, 17, 11), 'cx-gw01', 'citrix', `session start portal=cx-remote01 user=${ACCT} src=${ATTACKER_IP}:50931 desktop=${CITRIX_IP}`, { user: ACCT, ip: ATTACKER_IP, attack: true, key: 'citrix-session' });

  // Looking around (stand-in: what the attacker did next is not public). One host touching many internal hosts.
  const ports = [445, 3389, 443, 1433, 5985];
  for (let i = 0; i < 36; i++) {
    const host = `10.30.${1 + Math.floor(i / 12)}.${10 + ((i * 7) % 60)}`;
    add(A(-9, 2, 30) + i * 41, 'fw-core', 'netflow', `flow src=${CITRIX_IP} dst=${host}:${ports[i % ports.length]} proto=tcp state=${r() < 0.6 ? 'REJECT' : 'ACCEPT'} bytes=${60 + Math.floor(r() * 400)}`, { ip: CITRIX_IP, attack: true, key: i === 0 ? 'recon' : undefined });
  }
  // Lateral movement (testimony: the attackers "moved laterally"). A service admin account used from the Citrix host (stand-in).
  win(A(-9, 3, 9, 31), 'dc01', 'EventID=4624 An account was successfully logged on. user=svc-claimsadm logon_type=3 src_ip=' + CITRIX_IP + ' workstation=-', { user: 'svc-claimsadm', ip: CITRIX_IP, attack: true, key: 'admin-use' });
  win(A(-9, 3, 10, 12), 'fs-ops01', 'EventID=4624 An account was successfully logged on. user=svc-claimsadm logon_type=3 src_ip=' + CITRIX_IP + ' workstation=-', { user: 'svc-claimsadm', ip: CITRIX_IP, attack: true });

  // The same account keeps working for days (stand-in: the exact logins are not public).
  for (const [d, h, m] of [[-8, 21, 40], [-7, 1, 12], [-5, 23, 5], [-4, 2, 50], [-2, 22, 18], [-1, 1, 44]]) {
    cx(b, A(d, h, m, 21), ACCT, ATTACKER_IP, { attack: true }, 'cx-remote01', 'password', 'none');
  }

  // ---- Data theft (testimony: data was exfiltrated). Stand-in volumes, nights Feb 17-20. ----
  let total = 0;
  for (const d of [-4, -3, -2, -1]) {
    for (let i = 0; i < 4; i++) {
      const gb = 28 + r() * 9;
      total += gb;
      add(A(d, 1, 10) + i * 1100, 'fw-edge', 'netflow', `flow src=10.30.1.15 dst=${EXFIL_IP}:443 proto=tcp state=ACCEPT bytes_out=${GB(gb)} app=https-upload`, { ip: EXFIL_IP, attack: true, key: d === -4 && i === 0 ? 'exfil-start' : undefined });
    }
  }
  add(A(-1, 3, 5), 'fw-edge', 'netflow', `summary src=10.30.1.15 dst=${EXFIL_IP}:443 window=4 nights total_out=${GB(total)} (normal for this host: under 2GB/day)`, { ip: EXFIL_IP, attack: true, key: 'exfil-total' });

  // ---- Feb 21 (testimony): ransomware, nine days after the first login. ----
  cx(b, A(0, 4, 52, 3), ACCT, ATTACKER_IP, { attack: true }, 'cx-remote01', 'password', 'none');
  add(A(0, 4, 52, 5), 'cx-gw01', 'citrix', `session start portal=cx-remote01 user=${ACCT} src=${ATTACKER_IP}:51210 desktop=${CITRIX_IP}`, { user: ACCT, ip: ATTACKER_IP, attack: true });
  add(A(0, 1, 30, 4), 'bkp01', 'backup', 'job=claims-nightly status=OK copies=2 (disk, immutable-offsite) verified=yes size=9.8TB', { key: 'backup-ok' });
  win(A(0, 5, 41, 40), 'claims-db01', 'EventID=4688 A new process has been created. user=svc-claimsadm process=vssadmin.exe parent=cmd.exe cmd="vssadmin delete shadows /all /quiet"', { user: 'svc-claimsadm', attack: true, key: 'shadowdelete' });
  win(A(0, 5, 43, 5), 'claims-db01', 'EventID=4688 A new process has been created. user=svc-claimsadm process=enc_svc.exe parent=cmd.exe cmd="enc_svc.exe --encrypt --path E:\\ [redacted]"', { user: 'svc-claimsadm', attack: true, key: 'encrypt' });
  const shares = ['Providers/exports/eligibility_feb.csv', 'Providers/remits/835_batch_0219.dat', 'Reports/claims_summary_q4.xlsx', 'Support/cases/open_tickets.xlsx', 'Legal/templates/baa.docx', 'Ops/runbooks/failover.docx'];
  shares.forEach((p, i) => add(A(0, 5, 44) + i * 7, 'fs-ops01', 'smbd_audit', `SYSTEM|10.30.4.10|rename|ok|${p} -> ${p}.a91f03c7`, { attack: true, key: i === 0 ? 'mass-rename' : undefined }));
  add(A(0, 5, 48, 2), 'claims-gw01', 'app-log', 'claims-gw: pharmacy and provider requests FAILED: cannot read claims database (file format not recognized). Service unavailable.', { attack: true, key: 'claims-fail' });
  for (let i = 0; i < 14; i++) add(A(0, 5, 50) + i * 70, 'fw-core', 'netflow', `flow src=10.30.4.10 dst=10.30.${2 + (i % 4)}.${20 + i * 3}:445 proto=tcp state=ACCEPT bytes=${900000 + Math.floor(r() * 4000000)}`, { ip: '10.30.4.10', attack: true, key: i === 0 ? 'spread' : undefined });
  add(A(0, 6, 10, 15), 'ws-ops12', 'file-audit', 'file_create path=C:\\Users\\Public\\Desktop\\RECOVER-FILES.txt writer=enc_svc.exe size=3KB (ransom note, contents not reproduced)', { attack: true, key: 'note-found' });
  add(A(0, 6, 14, 2), 'fw-dc', 'firewall', 'inter-datacenter links dc-a <-> dc-b: UP (replication active). Spread to the second data center is possible until these are cut.', { key: 'dc-link' });

  // ---- Ordinary days: staff on Citrix with password + push, a decoy, and scanners. ----
  const staff = [['j.alvarez', '10.50.1.31'], ['k.mensah', '10.50.1.36'], ['d.ferraro', '10.50.1.40'], ['s.park', '10.50.1.44']];
  for (let d = -9; d <= 0; d++) {
    for (let i = 0; i < 3; i++) {
      const [u, ip] = staff[(d + 9 + i) % staff.length];
      const at = A(d, 6 + i * 3, 10 + Math.floor(r() * 40), Math.floor(r() * 60));
      if (at > A(0, 5, 29)) continue;
      const src = '192.0.2.' + (20 + Math.floor(r() * 60));
      cx(b, at, u, src, { key: d === -9 && i === 0 ? 'decoy-mfa' : undefined }, 'cx-remote02', 'password+push', 'ok');
      add(at + 20 + Math.floor(r() * 60), 'fs-ops01', 'smbd_audit', `${u}|${ip}|pread|ok|${b.pick(['Providers/exports/eligibility.csv', 'Reports/claims_summary_q4.xlsx', 'IT/inventory.csv'])}`, { user: u, ip });
    }
    // Offsite backup every night (decoy: a normal big upload, to a vendor, on a schedule).
    add(A(d, 1, 40, 12), 'fw-edge', 'netflow', 'flow src=10.30.5.10 dst=192.0.2.200:443 proto=tcp state=ACCEPT bytes_out=54GB app=backup-vendor (scheduled)', { key: d === -1 ? 'decoy-backup' : undefined });
    for (let tt = A(d, 0, 20); tt < A(d, 23, 59); tt += 6000 + Math.floor(r() * 5000)) {
      add(tt, 'edge-web', 'sshd', `sshd[${3000 + Math.floor(r() * 3000)}]: Failed password for invalid user ${b.pick(['admin', 'root', 'test', 'oracle', 'ubuntu'])} from 45.95.147.236 port ${30000 + Math.floor(r() * 30000)} ssh2`, { ip: '45.95.147.236', noise: true });
    }
  }

  // If the player types their password into the "recovery portal" phish, it gets used too.
  if (phishedAt != null) {
    const at = (phishedAt + 2) * 60 + 17;
    add(at, 'idp', 'sso', 'event=auth.password outcome=SUCCESS user=analyst01@change.example src_ip=203.0.113.90 geo="Amsterdam, NL" device=unknown', { user: 'analyst01', ip: '203.0.113.90', attack: true, key: 'analyst01-pw' });
    add(at + 5, 'idp', 'sso', 'event=mfa.push outcome=FAILURE user=analyst01@change.example src_ip=203.0.113.90 factor=push reason=user_denied attempt=1', { user: 'analyst01', ip: '203.0.113.90', attack: true });
  }

  return finish(b.ev, nowMinutes);
}

// Like finishLogs, but each line carries its own date. `t` stays the time of day (the SIEM shows it).
function finish(ev, nowMinutes) {
  const nowSec = A(0, 0, 0) + nowMinutes * 60;
  const stamp = (abs) => {
    const day = Math.floor(abs / DAY);
    const d = new Date(Date.UTC(2024, 1, DATE.day + day));
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
  title: 'How did ransomware get into the claims platform?',
  max: 40,
  teaches: { skill: 'Trace ransomware back to its initial access and measure dwell time', secplus: '4.8 Incident response: analysis, containment' },
  verdicts: [
    { id: 'outage', text: 'A failed update or storage fault on the claims database. The text file is a coincidence.' },
    { id: 'nation', text: 'A nation-state intrusion that took the claims platform offline for espionage.' },
    { id: 'ransomware', text: 'Ransomware with data theft: an attacker signed in to the Citrix portal with a stolen password and no MFA, spent nine days moving through the network and copying data, then encrypted the claims platform.' },
    { id: 'insider', text: 'An insider: an employee with remote access stole the data and deployed ransomware.' },
  ],
  correctVerdict: 'ransomware',
  wrongVerdictNotes: {
    outage: 'A storage fault does not copy files to an outside address for four nights, rename thousands of files to a new extension, delete shadow copies, and leave a ransom note. This is an attack.',
    nation: 'This was UnitedHealth\'s first guess too: its Feb 21 filing said a "suspected nation-state" actor. It later said the attackers were a cybercrime group. The logs here show a classic ransomware chain: password-only login, lateral movement, data theft, shadow copy deletion, encryption and a ransom note. Naming the wrong actor early can send the response in the wrong direction.',
    insider: 'The sign-in came from an outside address with no MFA. Real staff use the other portal with a password and a push. No one has to be an insider to use a stolen password.',
  },
  actions: [
    { id: 'disable-acct', text: 'Disable c.ellery and svc-claimsadm, kill active Citrix sessions, and take cx-remote01 offline', good: true },
    { id: 'mfa-all', text: 'Require MFA on every remote access portal, with no exceptions list, and phishing-resistant MFA for admins', good: true },
    { id: 'isolate', text: 'Cut the data center links and external connections, and keep the affected machines powered on', good: true },
    { id: 'law', text: 'Preserve evidence (disk and memory images, logs), call the FBI and CISA, and bring in an outside incident response firm', good: true },
    { id: 'restore', text: 'Rebuild the network and core services, replace the compromised machines, and restore from clean backups', good: true },
    { id: 'creds', text: 'Reset every credential the attacker could have touched, starting with service and admin accounts', good: true },
    { id: 'comms', text: 'Tell pharmacies and providers now, set up manual claims workarounds, and start a breach assessment for the stolen data', good: true },
    { id: 'resetonly', text: 'Just reset the c.ellery password; the rest is noise', good: false, why: 'The attacker already used svc-claimsadm, copied data for nights and left ransomware. One password reset leaves the portal without MFA and every other credential in play.' },
    { id: 'wipe', text: 'Wipe and rebuild the encrypted servers right now to get claims back', good: false, why: 'Wiping first destroys the evidence of how they got in and what was taken, and you cannot tell whether the attacker is still inside. Image first, then rebuild.' },
    { id: 'pay', text: 'Pay the ransom right now, before anyone outside the company finds out', good: false, why: 'Payment is a leadership, legal and law enforcement decision, not a SOC shortcut. It does not guarantee the data is deleted. Reportedly a second group held the data and demanded more. Involve the FBI first.' },
  ],
  primaryEvidence: { key: 'citrix-login', note: 'The key line: c.ellery signing in to the Citrix portal on February 12 from 203.0.113.44 with a password only (mfa=none). It is nine days before the ransomware, and it is the door the rest came through.' },
  keyEvidence: ['citrix-login', 'citrix-session', 'recon', 'admin-use', 'exfil-start', 'exfil-total', 'shadowdelete', 'encrypt', 'mass-rename', 'claims-fail', 'note-found', 'dc-link'],
  containedRequires: ['disable-acct', 'isolate'],
  costs: {
    contained: { amount: 2500000, text: 'Outside forensics, rebuilding core services, weeks of reduced claims processing (estimate for this replay)' },
    breach: { amount: 22000000, text: 'The attacker keeps access; claims offline for weeks; stolen patient data published (estimate for this replay)' },
  },
  perfectWhy: 'That is the real chain: a stolen password, a portal with no MFA, nine quiet days, data theft, then ransomware. Close the door, cut the links, keep the evidence, call the FBI before anyone rebuilds, tell your customers, and restore from clean backups.',
  notSubmittedWhy: 'Nobody wrote it up. The portal stayed open, and the attacker kept a way back in.',
};

export const ALERTS = [
  {
    id: 'change-citrix',
    main: true,
    title: 'Mass file renames on claims and file servers; Citrix account involved',
    severity: 'Critical',
    rule: 'Ransomware behavior (shadow copy deletion, mass renames) plus a Citrix session with mfa=none from a new outside address.',
    fields: [
      ['Account', 'c.ellery (portal cx-remote01)'],
      ['Source', `${ATTACKER_IP} (first seen Feb 12, 02:17)`],
      ['Outbound', 'About 4 nights of large uploads to 198.51.100.130'],
      ['Hit', 'claims-db01, fs-ops01 and more'],
    ],
    trigger: { after: 'spread', delayMs: 2500, fallbackAt: 7 * 60 + 40 },
    notice: '🚨 SIEM alert (Critical): ransomware on claims and file servers',
    chat: [
      'Okay. This is where the real team saw how big it was. The SIEM now sees mass renames on the claims database and the file server.',
      'First question: how did they get in? The Citrix logs show one portal, cx-remote01, and one account.',
      'Open the Terminal. The remote access export is at /mnt/exports/remote/portals.csv. Look for portals with no MFA.',
      'Then an executive will ask about the ransom note. After that, badge into the server room and work the case.',
    ],
    case: CASE,
  },
  {
    id: 'change-analyst-phish',
    title: 'Password OK, MFA denied: analyst01 from Amsterdam',
    severity: 'High',
    rule: 'Correct password from a new country and an unknown device.',
    fields: [['Account', "analyst01 (that's you)"], ['Source IP', '203.0.113.90']],
    callout: 'You typed your password into the "recovery portal" page. Opportunistic phishing always follows an outage. MFA held this time because you denied the push. That is exactly what the Citrix portal did not have.',
    trigger: { when: (st) => st.phishedAt() != null && st.minutes >= st.phishedAt() + 3 },
    notice: '🚨 SIEM alert: your password was used from Amsterdam',
    chat: ['Your phone just buzzed with a push you didn\'t ask for, right? Deny it. Someone has your password.', 'That "recovery portal" email. Scammers jump on every outage. Resetting you now.'],
  },
];
