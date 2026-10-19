// Case file: Target, Nov-Dec 2013. The logs a Target security team could have had on Monday, Dec 2, 2013 (Cyber Monday),
// rebuilt from public reporting.
//
// The chain this replay follows (sources in index.js):
//   a phished HVAC contractor (Fazio Mechanical) -> its Target vendor-portal login stolen -> the attackers use it
//   (reported first access Nov 12 per the NYT, Nov 15 per Krebs's sources) -> they move from the vendor-facing side of the
//   network to the inside (how is NOT public; Krebs and SecureWorks suspect a default account of IT management software
//   called Best1_user) -> a small test of card-scraping malware on a few registers (Nov 15-28) -> Symantec flags a server
//   (Nov 28) -> malware pushed to most registers and data-moving malware installed on an internal "staging" server (Nov 30)
//   -> FireEye alerts on each install, nobody acts (Bloomberg Businessweek) -> updated malware and the first FTP uploads to
//   an outside server (Dec 2, Seculert; the malware only uploaded between 10:00 and 18:00, per SecureWorks).
//
// What is NOT public: the attacker's real IPs for the first login, Target's real hostnames, usernames and subnets, the real
// times of day of most events. Those are stand-ins. IPs come from the documentation ranges (RFC 5737) and 10.x. The artifact
// names (the "POSWDS" service, svchosts.exe, winxml.dll, a "BladeLogic" look-alike service, twain_32 share, the Best1_user
// account, files named <computer>_<day>_<month>_<hour>.txt, plain-text FTP) come from the Dell SecureWorks write-up. All
// passwords and FTP credentials are left out.
//
// Unlike a one-day case, this one spans about three weeks, so every line carries its own date.

import { T, logBuilder, hms } from '../../game/logkit.js';

export const DATE = { weekday: 'MON', name: 'Monday', month: 'Dec', day: 2 };
export const VENDOR_IP = '203.0.113.44'; // where the stolen vendor login was used (stand-in)
export const DROP_IP = '198.51.100.23'; // the outside FTP server (stand-in; real drops were compromised servers in the US, Brazil, Russia)
export const PORTAL = '10.70.3.12';
export const STAGE = '10.70.8.31';
export const BMC = '10.70.2.8';
export const REGS = [
  ['reg-1147-03', '10.80.47.13'], ['reg-1147-05', '10.80.47.15'], ['reg-0812-02', '10.80.12.12'], ['reg-0812-04', '10.80.12.14'],
  ['reg-2210-01', '10.80.110.11'], ['reg-2210-06', '10.80.110.16'], ['reg-0455-02', '10.80.55.12'], ['reg-0455-03', '10.80.55.13'],
];

export const IP_INFO = {
  [VENDOR_IP]: { where: 'Unknown', owner: 'Hosting / anonymizing service', note: 'First seen on the vendor portal Nov 12 using the HVAC contractor\'s login. The contractor always signs in from its own office. (Stand-in IP: the real source was not published.)', external: true },
  [DROP_IP]: { where: 'Outside the US', owner: 'Compromised web server (rented / hijacked)', note: 'Plain-text FTP drop. Not on any approved partner list. The real drop servers were hijacked machines in the US, Brazil and Russia. (Stand-in IP.)', external: true },
  '192.0.2.88': { where: 'Sharpsburg, United States', owner: 'Contractor office (Fazio Mechanical)', note: 'Where the contractor normally signs in from.' },
  '192.0.2.91': { where: 'Ohio, United States', owner: 'Second HVAC contractor office', note: 'Normal sign-ins for hvac-mgmt-co, with a hardware token.' },
  [PORTAL]: { where: 'Internal: vendor-facing servers', owner: 'vendor-portal01', note: 'The vendor billing and project portal. It should talk to almost nothing inside the network.' },
  [STAGE]: { where: 'Internal: application servers', owner: 'app-stage01', note: 'A server that registers should never need. In this replay, it collects stolen card files and uploads them. Flagged by Symantec Nov 28 and by FireEye since Nov 30.' },
  [BMC]: { where: 'Internal: IT management', owner: 'bmc-mgmt01', note: 'The IT management / patching server. It uses the Best1_user account every night by design. This is the normal source for that account.' },
  '10.70.5.40': { where: 'Internal: payments', owner: 'pay-batch01', note: 'Sends the nightly card settlement batch to the processor.' },
  '10.70.9.20': { where: 'Internal: supply chain', owner: 'edi-gw01', note: 'Sends nightly supplier orders (EDI) over SFTP to an approved partner.' },
  '192.0.2.150': { where: 'United States', owner: 'Approved supplier partner', note: 'On the approved SFTP list.' },
  '192.0.2.160': { where: 'United States', owner: 'Payment processor', note: 'Receives the nightly settlement batch over HTTPS. Expected.' },
  ...Object.fromEntries(REGS.map(([h, ip]) => [ip, { where: `Internal: store registers`, owner: h, note: 'A store register (point of sale). Cards are read here.' }])),
};

const DAY = 86400;
// day = days relative to Dec 2, 2013 (Nov 12 = -20, Nov 15 = -17, Nov 28 = -4, Nov 30 = -2).
const A = (day, h, m, s = 0) => day * DAY + T(h, m, s);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fe = (b, t, host, md5tag, extra = {}, more = '') =>
  b.add(t, 'fireeye-nx01', 'fireeye', `alert name=malware.binary severity=CRIT src_host=${host} sample=${md5tag}${more} action=ALERT_ONLY auto_delete=off status=NEW assigned=-`, { ip: STAGE, ...extra });

export function generateLogs({ nowMinutes = 24 * 60 } = {}) {
  const b = logBuilder(2013);
  const { r, add } = b;
  const win = (t, host, msg, extra = {}) => add(t, host, 'Security', msg, extra);

  // ---- Nov 12 (reported): the stolen vendor login is used for the first time. ----
  add(A(-20, 6, 41, 3), 'vendor-portal01', 'portal-auth', `login user=fazio-hvac result=SUCCESS 2fa=none src=${VENDOR_IP} geo="Unknown" new_ip=true`, { user: 'fazio-hvac', ip: VENDOR_IP, attack: true, key: 'vendor-login' });
  add(A(-20, 6, 42, 20), 'vendor-portal01', 'portal-auth', `page user=fazio-hvac path=/supplier-downloads/hvac src=${VENDOR_IP} (public documents, also readable without login)`, { user: 'fazio-hvac', ip: VENDOR_IP, attack: true });
  // How the attackers got from the vendor-facing side to the inside is NOT public. Stand-in: the portal host suddenly talks to many internal subnets.
  const ports = [445, 135, 1433, 3389];
  for (let i = 0; i < 30; i++) {
    const host = `10.70.${8 + (i % 3)}.${10 + ((i * 7) % 50)}`;
    add(A(-20, 7, 3) + i * 41, 'fw-core', 'netflow', `flow src=${PORTAL} dst=${host}:${ports[i % ports.length]} proto=tcp state=${r() < 0.55 ? 'REJECT' : 'ACCEPT'} bytes=${60 + Math.floor(r() * 500)} (normal for this host: 2 destinations)`, { ip: PORTAL, attack: true, key: i === 0 ? 'portal-pivot' : undefined });
  }
  // A default account of IT management software (Best1_user) used from the wrong place. Reported theory (Krebs, SecureWorks); the exact method is not public.
  win(A(-20, 7, 41, 15), 'app-stage01', 'EventID=4624 An account was successfully logged on. user=Best1_user logon_type=3 src_ip=' + PORTAL + ' workstation=VENDOR-PORTAL01', { user: 'Best1_user', ip: PORTAL, attack: true, key: 'default-acct' });

  // ---- Nov 15 - 28 (reported by Krebs's sources): a small test on a few registers. ----
  win(A(-17, 3, 12, 8), 'reg-1147-03', 'EventID=7045 A service was installed in the system. service=POSWDS image=C:\\WINDOWS\\system32\\svchosts.exe start=auto account=LocalSystem installed_by=Best1_user src_ip=' + STAGE, { user: 'Best1_user', ip: STAGE, attack: true, key: 'pos-test' });
  add(A(-17, 3, 12, 40), 'reg-1147-03', 'file-audit', 'file_create path=C:\\WINDOWS\\system32\\winxml.dll writer=svchosts.exe size=1KB (growing: card data is written here)', { ip: '10.80.47.13', attack: true });
  win(A(-16, 3, 9, 51), 'reg-1147-05', 'EventID=7045 A service was installed in the system. service=POSWDS image=C:\\WINDOWS\\system32\\svchosts.exe start=auto account=LocalSystem installed_by=Best1_user src_ip=' + STAGE, { user: 'Best1_user', ip: STAGE, attack: true });

  // ---- Nov 28 (reported, Bloomberg): the antivirus flags the staging server. It logs it and nobody follows up. ----
  add(A(-4, 14, 22, 6), 'sep-mgr01', 'symantec', `detection type=SONAR.Heuristic.Suspicious-Behavior host=app-stage01 ip=${STAGE} process=bladelogic.exe action=LOGGED_ONLY status=unreviewed`, { ip: STAGE, attack: true, key: 'symantec' });

  // ---- Nov 30 (reported): malware pushed to most registers, data-moving malware installed on the staging server. ----
  REGS.forEach(([h, ip], i) => {
    win(A(-2, 13, 40) + i * 25, h, `EventID=4624 An account was successfully logged on. user=Best1_user logon_type=3 src_ip=${STAGE} workstation=APP-STAGE01`, { user: 'Best1_user', ip: STAGE, attack: true });
    win(A(-2, 13, 41) + i * 25, h, `EventID=7045 A service was installed in the system. service=POSWDS image=C:\\WINDOWS\\system32\\svchosts.exe start=auto account=LocalSystem installed_by=Best1_user src_ip=${STAGE}`, { user: 'Best1_user', ip: STAGE, attack: true, key: i === 0 ? 'poswds-push' : undefined });
  });
  win(A(-2, 14, 18, 2), 'app-stage01', 'EventID=7045 A service was installed in the system. service=BladeLogic image=C:\\WINDOWS\\system32\\bladelogic.exe start=auto account=LocalSystem (look-alike of a real IT management product name)', { ip: STAGE, attack: true, key: 'bladelogic-svc' });
  // FireEye fires on each install. Three on Nov 30, two more on Dec 2 as the malware is updated. Action: alert only, nothing deleted.
  fe(b, A(-2, 14, 18, 40), 'app-stage01', 'v1', { attack: true, key: 'fireeye-1' });
  fe(b, A(-2, 14, 19, 12), 'app-stage01', 'v2', { attack: true }, '');
  fe(b, A(-2, 14, 19, 51), 'app-stage01', 'v3', { attack: true, key: 'fireeye-ftp' }, ` decoded_callback=ftp://${DROP_IP}:21 (plain-text FTP to an outside host)`);
  // Dec 2 (reported: updated twice). Times of day are made up.
  fe(b, A(0, 1, 57, 9), 'app-stage01', 'v4', { attack: true }, ` decoded_callback=ftp://${DROP_IP}:21`);
  fe(b, A(0, 5, 20, 33), 'app-stage01', 'v5', { attack: true }, ` decoded_callback=ftp://${DROP_IP}:21`);
  // Registers move their card files to the staging server every few hours: files named <computer>_<day>_<month>_<hour>.txt (SecureWorks).
  [[-2, 14], [-2, 20], [-1, 10], [-1, 16], [0, 4]].forEach(([d, hr], k) => {
    REGS.slice(0, 4).forEach(([h, ip], i) => {
      const day = d === 0 ? 2 : d === -1 ? 1 : 30;
      const month = d >= -1 ? 12 : 11;
      add(A(d, hr, 2) + i * 33, 'app-stage01', 'smbd_audit', `Best1_user|${ip}|create|ok|twain_32/${h.replace(/-/g, '').toUpperCase()}_${day}_${month}_${hr}.txt size=${380 + Math.floor(r() * 900)}KB`, { user: 'Best1_user', ip, attack: true, key: k === 0 && i === 0 ? 'stage-files' : undefined });
    });
  });

  // ---- Dec 2, 10:02 onward: the first uploads to the outside server, in plain-text FTP, only in business hours. ----
  win(A(0, 10, 1, 44), 'app-stage01', 'EventID=4688 A new process has been created. user=SYSTEM process=ftp.exe parent=bladelogic.exe cmd="ftp.exe -s:cmd.txt" (script holds the destination and login: not shown)', { user: 'SYSTEM', ip: STAGE, attack: true, key: 'ftp-proc' });
  let bytes = 12e6;
  for (let i = 0; i < 6; i++) {
    bytes *= 1.6 + r();
    add(A(0, 10, 2, 10) + i * 95, 'fw-edge', 'netflow', `flow src=${STAGE} dst=${DROP_IP}:21 proto=tcp state=ACCEPT app=ftp (plain text) bytes_out=${Math.round(bytes)}`, { ip: DROP_IP, attack: true, key: i === 0 ? 'ftp-exfil' : undefined });
  }

  // ---- Ordinary days, weeks of them: decoys and noise. ----
  const known = [['hvac-mgmt-co', '192.0.2.91', 'token'], ['fazio-hvac', '192.0.2.88', 'none']];
  for (let d = -30; d <= 0; d++) {
    // Contractors sign in from their own offices. (Decoy: one has a token; Fazio's account has none, which was normal at the time.)
    if (d % 3 === 0 && d > -21) {
      const [u, ip, mfa] = known[(d / 3 + 10) % 2];
      add(A(d, 9, 10 + Math.floor(r() * 40), Math.floor(r() * 60)), 'vendor-portal01', 'portal-auth', `login user=${u} result=SUCCESS 2fa=${mfa} src=${ip} new_ip=false`, { user: u, ip, key: d === -3 && u === 'hvac-mgmt-co' ? 'decoy-vendor' : undefined });
    }
    // The IT management server uses Best1_user every night: by design. The attacker's use comes from other machines.
    REGS.forEach(([h, ip], i) => {
      win(A(d, 2, 0, 5 + i * 9), h, `EventID=4624 An account was successfully logged on. user=Best1_user logon_type=3 src_ip=${BMC} workstation=BMC-MGMT01 (scheduled performance collection)`, { user: 'Best1_user', ip: BMC, key: d === -1 && i === 0 ? 'decoy-bmc' : undefined });
    });
    // Nightly supplier orders over SFTP to an approved partner.
    add(A(d, 3, 0, 14), 'fw-edge', 'netflow', `flow src=10.70.9.20 dst=192.0.2.150:22 proto=tcp state=ACCEPT app=sftp bytes_out=${70 + Math.floor(r() * 40)}MB (scheduled, approved partner)`, { ip: '10.70.9.20', key: d === -1 ? 'decoy-edi' : undefined });
    // Nightly card settlement to the payment processor: large, expected, encrypted.
    add(A(d, 1, 30, 22), 'fw-edge', 'netflow', `flow src=10.70.5.40 dst=192.0.2.160:443 proto=tcp state=ACCEPT app=https bytes_out=${(1.2 + r()).toFixed(1)}GB (settlement batch)`, { ip: '10.70.5.40', key: d === -1 ? 'decoy-settle' : undefined });
    for (let tt = A(d, 0, 25); tt < A(d, 23, 59); tt += 7000 + Math.floor(r() * 6000)) {
      add(tt, 'edge-web', 'sshd', `sshd[${3000 + Math.floor(r() * 3000)}]: Failed password for invalid user ${b.pick(['admin', 'root', 'test', 'oracle', 'ubuntu'])} from 45.95.147.236 port ${30000 + Math.floor(r() * 30000)} ssh2`, { ip: '45.95.147.236', noise: true });
    }
  }
  // FireEye "malware.binary" fires on lab and test machines all the time and gets closed as a false positive. This is why one more looked ignorable.
  [[-9, 'lab-pc-022'], [-6, 'dev-vm-114'], [-3, 'lab-pc-031'], [-1, 'qa-build07']].forEach(([d, h], i) => {
    add(A(d, 11, 5 + i * 7, 12), 'fireeye-nx01', 'fireeye', `alert name=malware.binary severity=MAJOR src_host=${h} sample=test-tool action=ALERT_ONLY status=CLOSED reason=false_positive (internal test tool)`, { key: i === 3 ? 'fe-noise' : undefined });
  });

  return finish(b.ev, nowMinutes);
}

// Like finishLogs, but each line carries its own date. `t` stays the time of day (the SIEM shows it); the
// full timestamp is in `time`/`line`, and ordering uses the absolute second count.
function finish(ev, nowMinutes) {
  const nowSec = A(0, 0, 0) + nowMinutes * 60;
  const stamp = (abs) => {
    const day = Math.floor(abs / DAY);
    const d = new Date(Date.UTC(2013, 11, DATE.day + day));
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
  title: 'How did a heating contractor\'s login end with card data leaving over FTP?',
  max: 40,
  teaches: { skill: 'Trace an intrusion from a third-party login to data exfiltration', secplus: '4.8 Incident response: analysis, containment' },
  verdicts: [
    { id: 'holiday', text: 'Cyber Monday load. The big transfers and the FireEye noise are normal for the busiest week of the year.' },
    { id: 'vendor', text: 'An outsider used a stolen vendor login, reached the inside, planted card-scraping malware on the registers and a staging server, and is now sending the stolen data out over FTP.' },
    { id: 'insider', text: 'A Target employee is stealing card data from inside.' },
    { id: 'skimmer', text: 'Physical card skimmers fitted to the registers in stores.' },
  ],
  correctVerdict: 'vendor',
  wrongVerdictNotes: {
    holiday: 'Settlement and supplier uploads are scheduled, encrypted and go to approved partners. This one is plain-text FTP from a server that should never talk to the internet, to a host nobody approved, after a month of unreviewed alerts.',
    insider: 'Every step uses accounts and hosts that a stolen vendor login and a default management account can reach. The first login came from a new IP on the vendor account, and the logins on the registers come from the staging server, not from a person.',
    skimmer: 'Nothing physical shows up here. A service named POSWDS was installed on the registers, and the card files are being copied to a server. This is malware that reads card data from memory.',
  },
  actions: [
    { id: 'block-ftp', text: 'Block outbound FTP to anything not on the approved list at the edge firewall, and block the outside server', good: true },
    { id: 'isolate-stage', text: 'Isolate app-stage01 from the network but keep it powered on, and image its disk and memory for forensics', good: true },
    { id: 'disable-vendor', text: 'Disable the fazio-hvac login, reset every vendor credential, require two-factor for all vendors, and rotate the default Best1_user account', good: true },
    { id: 'pos-sweep', text: 'Sweep every register for the POSWDS service and svchosts.exe, pull the infected ones, and image before cleaning', good: true },
    { id: 'segment', text: 'Separate the vendor portal and the corporate network from the payment (cardholder) network, with deny-by-default rules', good: true },
    { id: 'alerts', text: 'Fix alert handling: critical FireEye alerts page a named on-call owner, with a response time, and malware blocking turned on', good: true },
    { id: 'ir', text: 'Bring in an incident response firm, legal, the Secret Service and the Justice Department. Preserve logs. Plan customer notification', good: true },
    { id: 'dismiss', text: 'Mark the FireEye alerts as false positives because "malware.binary" fires all the time', good: false, why: 'That is the exact mistake made in the real incident. Five alerts on one server that no register should depend on, a callback to an outside FTP server, plus an antivirus flag on the same host: that is a pattern, not noise.' },
    { id: 'wait', text: 'Wait until the holiday change freeze ends before touching anything', good: false, why: 'Every day the registers keep scraping cards and the staging server keeps uploading. A change freeze is for planned changes, not for an active breach. Contain now.' },
    { id: 'vendor-pw', text: 'Email the contractor and ask them to change their password', good: false, why: 'That fixes one login. The attackers already have malware on the registers and a staging server, and they have changed the malware and drop servers more than once.' },
  ],
  primaryEvidence: { key: 'vendor-login', note: 'The key line: the contractor\'s portal login used from a new IP on Nov 12, with no second factor. Everything after it follows from that one stolen login.' },
  keyEvidence: ['vendor-login', 'portal-pivot', 'default-acct', 'pos-test', 'symantec', 'poswds-push', 'bladelogic-svc', 'fireeye-1', 'fireeye-ftp', 'stage-files', 'ftp-proc', 'ftp-exfil'],
  containedRequires: ['block-ftp', 'isolate-stage'],
  costs: {
    contained: { amount: 9000000, text: 'Incident response firm, sweeping and cleaning registers, reissuing a fraction of the cards, legal and notification (estimate for this replay)' },
    breach: { amount: 175000000, text: 'About two more weeks of card theft, card reissue, lawsuits, and a long clean-up (estimate for this replay; Target itself later reported $252 million in breach expenses through January 2015, about $162 million net of expected insurance)' },
  },
  perfectWhy: 'That is the reported chain: a phished contractor, a stolen vendor login, movement from the vendor side to the registers, card-scraping malware, a staging server, and plain-text FTP to the outside. Contain the exfiltration and the staging server first, then close the vendor path and sweep the registers.',
  notSubmittedWhy: 'Nobody wrote it up. In the real incident, nobody acted until the Justice Department called on Dec 12, and the uploads ran for about two weeks.',
};

export const ALERTS = [
  {
    id: 'target-ftp',
    main: true,
    title: 'Internal server is uploading to an outside FTP server',
    severity: 'Critical',
    rule: 'An internal server that is not on the egress list sends more than 10 MB over plain-text FTP to a destination that is not on the approved list. Host also has open malware alerts.',
    fields: [
      ['Source', 'app-stage01 (10.70.8.31), application servers'],
      ['Destination', `${DROP_IP}:21, plain-text FTP, not approved`],
      ['Process', 'ftp.exe started by bladelogic.exe'],
      ['History', '5 unreviewed FireEye malware.binary alerts since Nov 30, 1 Symantec flag Nov 28'],
    ],
    trigger: { when: (st, min) => (st.visited.includes('triage') && min >= 10 * 60 + 8) || min >= 10 * 60 + 30 },
    notice: '🚨 SIEM alert (Critical): an internal server is uploading to an outside FTP server',
    chat: [
      'This is what the real team never connected. Plain-text FTP out of a server that has no business on the internet, in the middle of Cyber Monday.',
      'Do not start at the upload. Work backward. What is app-stage01? Who has been talking to it? How did they get in?',
      'Open the Terminal and look at the registers. Then badge into the server room and write up the case at the SOC console.',
    ],
    case: CASE,
  },
];
