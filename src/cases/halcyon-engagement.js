// Simulated engagement: an authorised external pentest of Halcyon Mutual (the game's fictional employer).
// Everything here is fiction and canned: hosts use the documentation IP ranges (RFC 5737: 192.0.2.0/24,
// 198.51.100.0/24, 203.0.113.0/24) and *.example names (RFC 2606). Commands are a fixed whitelist; each
// one maps to pre-written output. No exploit code, no payloads, no real targets. The attack path is the
// boring, common one real assessors find: an exposed backup file leaks a service-account password, the
// password is reused on SSH and on an internal file share, and a flat network lets the DMZ reach the LAN.
//
// Each step: id, tactic (ATT&CK tactic), tid + tname (ATT&CK technique), goal (what the player is trying to
// do), defend (how a defender catches or prevents it), and choices (one or two commands). A choice may be
// `loud: true` (trips an IDS/WAF alert in the debrief) or `violation: true` (out of scope: the game refuses
// it and counts a rules-of-engagement strike). `logs(b, t, ctx)` writes the blue-team trace of the step into
// the SIEM (src/game/logkit.js builder); every event it writes is keyed to the step so the debrief can grade.

export const ATTACKER = { ip: '198.51.100.66', host: 'assessor' };
export const PORTAL = { ip: '203.0.113.10', dmz: '192.0.2.15', name: 'portal.halcyon.example', host: 'portal01' };
export const FILES = { ip: '192.0.2.20', name: 'files01.halcyon.example', host: 'files01' };
export const CLAIMSDB = { ip: '192.0.2.30', name: 'claimsdb.halcyon.example', host: 'claimsdb01' };
export const DC = { ip: '192.0.2.5', name: 'dc01.halcyon.example', host: 'dc01' };
export const FLAG = 'FLAG{reused-passwords-flat-networks}';

// Date of the engagement (a Friday night window agreed with the client). EDT, so -0400 in web logs.
export const DATE = { weekday: 'FRI', name: 'Friday', month: 'Oct', day: 30, year: 2026, domain: 'halcyon.example', netbios: 'HALCYON' };

const pad = (n) => String(n).padStart(2, '0');
const clock = (t) => `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
const webStamp = (t) => `[${DATE.day}/${DATE.month}/${DATE.year}:${clock(t)} -0400]`;
const epoch = (t) => Date.UTC(DATE.year, 9, DATE.day) / 1000 + t + 4 * 3600;

/** nginx access_combined line on the portal. */
export function nginx(b, t, ip, method, path, status, bytes, ua, extra = {}) {
  const raw = `${ip} - - ${webStamp(t)} "${method} ${path} HTTP/1.1" ${status} ${bytes} "-" "${ua}"`;
  return b.add(t, PORTAL.host, 'nginx', `nginx: ${raw}`, { ip, access: raw, ...extra });
}
/** auditd EXECVE record for a command run on the portal. */
export function auditExec(b, t, user, uid, argv, extra = {}) {
  const args = argv.map((a, i) => `a${i}="${a}"`).join(' ');
  return b.add(t, PORTAL.host, 'auditd', `type=EXECVE msg=audit(${epoch(t)}.${100 + (t % 800)}:${4000 + (t % 900)}): argc=${argv.length} ${args} auid=${uid} uid=${uid} user=${user}`, { user, ...extra });
}
/** Suricata fast.log style alert (local rules: SIDs 9000100+). */
export function ids(b, t, sid, msg, cls, prio, src, sport, dst, dport, extra = {}) {
  return b.add(t, 'ids01', 'ids', `[1:${sid}:1] ${msg} [Classification: ${cls}] [Priority: ${prio}] {TCP} ${src}:${sport} -> ${dst}:${dport}`, { ip: src, alert: msg, ...extra });
}
export function fw(b, t, action, src, dst, dport, rule, extra = {}) {
  return b.add(t, 'fw01', 'firewall', `action=${action} src=${src} dst=${dst} proto=tcp dport=${dport} rule=${rule}`, { ip: src, ...extra });
}

const UA_CURL = 'curl/8.5.0';
const UA_SCAN = 'Mozilla/5.00 (Nmap Scripting Engine; https://nmap.org/book/nse.html)';
const UA_DIRSCAN = 'dirscan/2.1 (authorised assessment)';

export const ENGAGEMENT = {
  id: 'halcyon-ext-2026',
  name: 'External pentest',
  client: 'Halcyon Mutual',
  title: 'External pentest: Halcyon Mutual',
  blurb: 'Break into the policyholder portal from the internet: scan it, find a forgotten backup that leaks a service password, reuse it on SSH and the internal file share, and prove you reached the claims data. 8 moves, recon → collection.',
  seed: 4207,
  date: DATE,
  attacker: ATTACKER,
  prompt: `${ATTACKER.host}@kali:~$`,
  flag: FLAG,
  noise: engagementNoise,
  summary: 'The one-line report: an old backup leaked a service-account password, the same password opened SSH from the internet and the internal file share, and nothing stopped the DMZ from reaching the LAN. Three cheap fixes (no secrets in the web root, no password SSH, segment the DMZ) break the whole chain.',
  start: 21 * 3600 + 4 * 60, // 21:04, inside the agreed window
  roe: [
    'Authorised by Halcyon Mutual’s CISO for Friday Oct 30, 21:00–23:59. Simulated hosts only.',
    `In scope: ${PORTAL.name} (${PORTAL.ip}) and whatever it can reach on 192.0.2.0/24.`,
    'Objective: prove you could reach the internal file share by reading the planted proof file ROE_PROOF.txt.',
    'Out of scope: reading or copying real customer data, denial of service, anything outside the ranges above.',
    'Stealth counts: the SOC is watching. Loud moves will show up as alerts in the debrief.',
  ],
  steps: [
    {
      id: 'scan-ext',
      tactic: 'Reconnaissance',
      tid: 'T1595.001',
      tname: 'Active Scanning: Scanning IP Blocks',
      goal: 'Find out what the portal exposes to the internet.',
      defend: 'Perimeter IDS rules for port sweeps; expose only the ports the business needs.',
      choices: [
        {
          cmd: `nmap -sV -p 22,80,443 ${PORTAL.ip}`,
          label: 'Targeted scan of the usual ports (quiet)',
          output: [
            `Starting Nmap 7.95 ( https://nmap.org ) at 2026-10-30 21:04 EDT`,
            `Nmap scan report for ${PORTAL.name} (${PORTAL.ip})`,
            'Host is up (0.021s latency).',
            '',
            'PORT    STATE  SERVICE  VERSION',
            '22/tcp  open   ssh      OpenSSH 8.9p1 Ubuntu 3ubuntu0.10 (protocol 2.0)',
            '80/tcp  open   http     nginx 1.24.0 (redirects to https)',
            '443/tcp open   ssl/http nginx 1.24.0',
            '',
            'Nmap done: 1 IP address (1 host up) scanned in 9.81 seconds',
            '# SSH open to the whole internet on a customer portal. Note it.',
          ],
        },
        {
          cmd: `nmap -A -p- -T5 ${PORTAL.ip}`,
          label: 'All 65,535 ports, fastest timing, scripts on (loud)',
          loud: true,
          output: [
            `Starting Nmap 7.95 ( https://nmap.org ) at 2026-10-30 21:04 EDT`,
            `Nmap scan report for ${PORTAL.name} (${PORTAL.ip})`,
            'Host is up (0.019s latency).',
            'Not shown: 65532 filtered tcp ports (no-response)',
            'PORT    STATE  SERVICE  VERSION',
            '22/tcp  open   ssh      OpenSSH 8.9p1 Ubuntu 3ubuntu0.10 (protocol 2.0)',
            '80/tcp  open   http     nginx 1.24.0',
            '|_http-title: Did not follow redirect to https://portal.halcyon.example/',
            '443/tcp open   ssl/http nginx 1.24.0',
            '|_http-title: Halcyon Mutual | Policyholder Portal',
            '| ssl-cert: Subject: commonName=portal.halcyon.example',
            'OS details: Linux 5.15 - 6.8',
            '',
            'Nmap done: 1 IP address (1 host up) scanned in 212.40 seconds',
            '# Same three ports, 65,000 extra probes. The IDS certainly saw that.',
          ],
        },
      ],
      logs(b, t, { loud }) {
        if (loud) {
          for (let i = 0; i < 6; i++) fw(b, t + i * 31, 'deny', ATTACKER.ip, PORTAL.ip, [3389, 445, 8080, 3306, 5900, 21][i], 'edge-default-deny', { key: 'scan-ext', attack: 'T1595.001' });
          ids(b, t + 40, 9000101, 'HALCYON LOCAL SCAN aggressive TCP port sweep (>1000 ports/min)', 'Attempted Information Leak', 2, ATTACKER.ip, 41213, PORTAL.ip, 443, { key: 'scan-ext', attack: 'T1595.001', detection: 'IDS: aggressive port sweep against the portal' });
          nginx(b, t + 150, ATTACKER.ip, 'GET', '/nmaplowercheck1793412311', 404, 153, UA_SCAN, { key: 'scan-ext', attack: 'T1595.001' });
        } else {
          fw(b, t + 2, 'allow', ATTACKER.ip, PORTAL.ip, 22, 'edge-ssh-any', { key: 'scan-ext', attack: 'T1595.001' });
          fw(b, t + 3, 'allow', ATTACKER.ip, PORTAL.ip, 443, 'edge-web', { key: 'scan-ext', attack: 'T1595.001' });
          b.add(t + 5, PORTAL.host, 'sshd', `sshd[2207]: Connection closed by ${ATTACKER.ip} port 41188 [preauth]`, { ip: ATTACKER.ip, key: 'scan-ext', attack: 'T1595.001' });
        }
      },
    },
    {
      id: 'dirscan',
      tactic: 'Reconnaissance',
      tid: 'T1595.003',
      tname: 'Active Scanning: Wordlist Scanning',
      goal: 'Look for forgotten files and folders on the web portal.',
      defend: 'WAF rate rules on bursts of 404s; never leave backups or directory listings in the web root.',
      choices: [
        {
          cmd: `dirscan https://${PORTAL.name}`,
          label: 'Wordlist scan of the portal’s paths',
          output: [
            `dirscan 2.1 :: target https://${PORTAL.name} :: wordlist common.txt (4,614 words)`,
            '/admin           (403)  [Size: 162]',
            '/api/health      (200)  [Size: 17]',
            '/backup/         (200)  [Size: 512]   <- directory listing is ON',
            '/login           (200)  [Size: 6230]',
            '/robots.txt      (200)  [Size: 41]',
            'Finished: 4,614 requests, 4,609 × 404',
            '# A /backup/ folder with listing turned on. Look inside.',
          ],
        },
      ],
      logs(b, t) {
        const junk = ['/.git/HEAD', '/wp-admin/', '/old/', '/test/', '/config.php', '/server-status', '/.env', '/phpinfo.php'];
        junk.forEach((p, i) => nginx(b, t + i * 2, ATTACKER.ip, 'GET', p, 404, 153, UA_DIRSCAN, { key: 'dirscan', attack: 'T1595.003' }));
        nginx(b, t + 20, ATTACKER.ip, 'GET', '/admin', 403, 162, UA_DIRSCAN, { key: 'dirscan', attack: 'T1595.003' });
        nginx(b, t + 24, ATTACKER.ip, 'GET', '/backup/', 200, 512, UA_DIRSCAN, { key: 'dirscan', attack: 'T1595.003' });
        b.add(t + 60, 'waf01', 'waf', `waf: rule=HALCYON-RATE-404 action=log client=${ATTACKER.ip} host=${PORTAL.name} count_404=4609 window=60s`, { ip: ATTACKER.ip, key: 'dirscan', attack: 'T1595.003', detection: 'WAF: 4,609 not-found errors from one address in a minute' });
      },
    },
    {
      id: 'loot-backup',
      tactic: 'Credential Access',
      tid: 'T1552.001',
      tname: 'Unsecured Credentials: Credentials In Files',
      goal: 'Read what is in the exposed backup folder.',
      defend: 'Secrets belong in a vault, not in .env files; alert on any 200 for /backup/*.',
      choices: [
        {
          cmd: `curl -s https://${PORTAL.name}/backup/portal.env.bak`,
          label: 'Download the old config backup',
          output: [
            '# portal.env.bak  (copied 2019-03-14 before the v2 migration)',
            'APP_ENV=production',
            `DB_HOST=${CLAIMSDB.name}`,
            'DB_NAME=claims',
            'DB_USER=svc_portal',
            'DB_PASS=Harbor-Lights-2019',
            'SMTP_RELAY=mail.halcyon.example',
            '# A service-account password in a world-readable file. Seven years old.',
            '# Rules of engagement: use it only to prove access, never against real data.',
          ],
        },
      ],
      logs(b, t) {
        nginx(b, t, ATTACKER.ip, 'GET', '/backup/portal.env.bak', 200, 241, UA_CURL, { key: 'loot-backup', attack: 'T1552.001' });
      },
    },
    {
      id: 'ssh-in',
      tactic: 'Initial Access',
      tid: 'T1078',
      tname: 'Valid Accounts',
      goal: 'Try the leaked password where people reuse passwords: the SSH login.',
      defend: 'No password logins on internet-facing SSH (keys + MFA); alert on service accounts logging in interactively.',
      choices: [
        {
          cmd: `ssh svc_portal@${PORTAL.ip}`,
          label: 'Log in over SSH with the leaked password',
          prompt: 'svc_portal@portal01:~$',
          output: [
            `svc_portal@${PORTAL.ip}'s password: ******************`,
            'Welcome to Ubuntu 22.04.5 LTS (GNU/Linux 5.15.0-125-generic x86_64)',
            'Last login: Tue Mar 12 09:41:07 2019 from 192.0.2.40',
            '# The service account logs in interactively. Its last human login was in 2019.',
          ],
        },
      ],
      logs(b, t) {
        b.add(t, PORTAL.host, 'sshd', `sshd[3311]: Accepted password for svc_portal from ${ATTACKER.ip} port 51122 ssh2`, { ip: ATTACKER.ip, user: 'svc_portal', key: 'ssh-in', attack: 'T1078', detection: 'Rule: service account interactive SSH login from the internet' });
        b.add(t + 1, PORTAL.host, 'sshd', 'sshd[3311]: pam_unix(sshd:session): session opened for user svc_portal(uid=1003) by (uid=0)', { user: 'svc_portal', key: 'ssh-in', attack: 'T1078' });
      },
    },
    {
      id: 'netconf',
      tactic: 'Discovery',
      tid: 'T1016',
      tname: 'System Network Configuration Discovery',
      goal: 'Find out which internal networks this box can see.',
      defend: 'auditd/EDR on servers; a portal account running network commands is unusual.',
      choices: [
        {
          cmd: 'ip addr',
          label: 'Show this host’s network interfaces',
          output: [
            '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536',
            '    inet 127.0.0.1/8 scope host lo',
            '2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500',
            `    inet ${PORTAL.ip}/27 brd 203.0.113.31 scope global eth0`,
            '3: eth1: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500',
            `    inet ${PORTAL.dmz}/24 brd 192.0.2.255 scope global eth1`,
            '# A second leg on 192.0.2.0/24: the internal network. The portal is dual-homed.',
          ],
        },
      ],
      logs(b, t) {
        auditExec(b, t, 'svc_portal', 1003, ['ip', 'addr'], { key: 'netconf', attack: 'T1016' });
      },
    },
    {
      id: 'scan-int',
      tactic: 'Discovery',
      tid: 'T1046',
      tname: 'Network Service Discovery',
      goal: 'Map what is listening on the internal network.',
      defend: 'Segment the DMZ from the LAN; alert when a server starts talking to many internal hosts.',
      choices: [
        {
          cmd: 'nmap -sT -p 445,5432 192.0.2.0/24',
          label: 'Check two ports across the subnet (quiet)',
          output: [
            'Starting Nmap 7.95 ( https://nmap.org ) at 2026-10-30 21:31 EDT',
            `Nmap scan report for ${DC.name} (${DC.ip})`,
            '445/tcp  open   microsoft-ds',
            '5432/tcp closed postgresql',
            `Nmap scan report for ${FILES.name} (${FILES.ip})`,
            '445/tcp  open   microsoft-ds',
            '5432/tcp closed postgresql',
            `Nmap scan report for ${CLAIMSDB.name} (${CLAIMSDB.ip})`,
            '445/tcp  closed microsoft-ds',
            '5432/tcp open   postgresql',
            'Nmap done: 256 IP addresses (6 hosts up) scanned in 14.02 seconds',
            '# The DMZ portal can reach the file server on SMB. It should not be able to.',
          ],
        },
        {
          cmd: 'nmap -p- -T5 192.0.2.0/24',
          label: 'Every port on every host, fastest timing (loud)',
          loud: true,
          output: [
            'Starting Nmap 7.95 ( https://nmap.org ) at 2026-10-30 21:31 EDT',
            `Nmap scan report for ${DC.name} (${DC.ip})`,
            '53/tcp open domain   88/tcp open kerberos   389/tcp open ldap   445/tcp open microsoft-ds',
            `Nmap scan report for ${FILES.name} (${FILES.ip})`,
            '445/tcp open microsoft-ds',
            `Nmap scan report for ${CLAIMSDB.name} (${CLAIMSDB.ip})`,
            '5432/tcp open postgresql',
            'Nmap done: 256 IP addresses (6 hosts up) scanned in 1,804.77 seconds',
            '# Thirty minutes of probes from a web server. The internal IDS lit up.',
          ],
        },
      ],
      logs(b, t, { loud }) {
        if (loud) {
          for (let i = 0; i < 5; i++) fw(b, t + i * 17, 'deny', PORTAL.dmz, `192.0.2.${[5, 20, 30, 41, 77][i]}`, [3389, 22, 1433, 5985, 8443][i], 'dmz-to-lan-default', { key: 'scan-int', attack: 'T1046' });
          ids(b, t + 90, 9000117, 'HALCYON LOCAL SCAN internal host sweep from DMZ', 'Detection of a Network Scan', 1, PORTAL.dmz, 50322, DC.ip, 88, { key: 'scan-int', attack: 'T1046', detection: 'IDS: the portal swept the whole internal subnet' });
        } else {
          fw(b, t + 1, 'allow', PORTAL.dmz, FILES.ip, 445, 'dmz-to-lan-legacy-any', { key: 'scan-int', attack: 'T1046' });
          fw(b, t + 2, 'allow', PORTAL.dmz, DC.ip, 445, 'dmz-to-lan-legacy-any', { key: 'scan-int', attack: 'T1046' });
        }
      },
    },
    {
      id: 'smb-in',
      tactic: 'Lateral Movement',
      tid: 'T1021.002',
      tname: 'Remote Services: SMB/Windows Admin Shares',
      goal: 'Reuse the same password on the internal file share.',
      defend: 'Unique passwords per service account (or gMSAs); service accounts denied network logon where they don’t need it.',
      choices: [
        {
          cmd: `smbclient //${FILES.name}/claims -U svc_portal`,
          label: 'Connect to the file share as svc_portal',
          prompt: 'smb: \\>',
          output: [
            'Password for [HALCYON\\svc_portal]: ******************',
            'Try "help" to get a list of possible commands.',
            'smb: \\> ls',
            '  .                     D        0  Fri Oct 30 18:02:11 2026',
            '  ROE_PROOF.txt         A      214  Fri Oct 30 18:02:11 2026',
            '  Q4_claims_export.csv  A  8811520  Wed Oct 28 07:15:40 2026',
            '  templates             D        0  Mon Sep 14 10:22:03 2026',
            '# Same password, second system. The proof file the client planted is right there.',
          ],
        },
      ],
      logs(b, t) {
        b.win(t, FILES.host, 4624, { user: 'svc_portal', ip: PORTAL.dmz, ws: 'PORTAL01', type: 3, logonId: b.logonId() }, { user: 'svc_portal', ip: PORTAL.dmz, key: 'smb-in', attack: 'T1021.002', detection: 'Rule: svc_portal network logon to files01 from the DMZ' });
        b.add(t + 1, FILES.host, 'smbd_audit', `svc_portal|${PORTAL.dmz}|connect|ok|claims`, { user: 'svc_portal', ip: PORTAL.dmz, key: 'smb-in', attack: 'T1021.002' });
      },
    },
    {
      id: 'proof',
      tactic: 'Collection',
      tid: 'T1039',
      tname: 'Data from Network Shared Drive',
      goal: 'Prove access the way the rules allow: read the planted proof file. Nothing else.',
      defend: 'File-access auditing on sensitive shares; canary files that alert when opened.',
      objective: true,
      choices: [
        {
          cmd: 'get ROE_PROOF.txt',
          label: 'Download the planted proof file',
          output: [
            'getting file \\ROE_PROOF.txt of size 214 as ROE_PROOF.txt (10.4 KiloBytes/sec)',
            '--- ROE_PROOF.txt ---',
            'If you are reading this, you reached the claims share from the internet.',
            'Engagement: halcyon-ext-2026   Planted by: CISO office',
            `Proof token: ${FLAG}`,
            '# Objective reached. Stop here and write it up.',
          ],
        },
        {
          cmd: 'get Q4_claims_export.csv',
          label: 'Download the customer claims export',
          violation: true,
          output: [
            'STOPPED by the rules of engagement.',
            'Q4_claims_export.csv holds real policyholder data. Copying it is out of scope:',
            'an assessor proves access, they do not take the data. Strike recorded.',
          ],
        },
      ],
      logs(b, t) {
        b.add(t, FILES.host, 'smbd_audit', `svc_portal|${PORTAL.dmz}|open|ok|claims/ROE_PROOF.txt (read)`, { user: 'svc_portal', ip: PORTAL.dmz, key: 'proof', attack: 'T1039', detection: 'Canary: ROE_PROOF.txt was opened' });
      },
    },
  ],
};

/** Ordinary traffic so the player's moves have a haystack to hide in. Deterministic (seeded). */
export function engagementNoise(b, start, end) {
  const { r, add } = b;
  const pages = [['/', 200, 6120], ['/login', 200, 6230], ['/static/app.css', 200, 18211], ['/static/app.js', 200, 92114], ['/api/health', 200, 17], ['/claims/status', 302, 0], ['/favicon.ico', 200, 4286]];
  const uas = ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'];
  for (let t = start - 600; t < end; t += 25 + Math.floor(r() * 70)) {
    const ip = r() < 0.5 ? `198.51.100.${10 + Math.floor(r() * 50)}` : `203.0.113.${100 + Math.floor(r() * 120)}`;
    const [p, s, bytes] = b.pick(pages);
    nginx(b, t, ip, 'GET', p, s, bytes, b.pick(uas), { noise: true });
  }
  // The portal talks to the claims database all night: normal, and a decoy next to the SMB line.
  for (let t = start - 500; t < end; t += 240 + Math.floor(r() * 240)) fw(b, t, 'allow', PORTAL.dmz, CLAIMSDB.ip, 5432, 'dmz-to-db-app', { noise: true });
  // Internet SSH scanners trying default usernames (documentation range).
  const junk = ['admin', 'root', 'test', 'oracle', 'ubuntu', 'postgres', 'git', 'pi'];
  for (let t = start - 400; t < end; t += 180 + Math.floor(r() * 500)) {
    const ip = r() < 0.6 ? '203.0.113.201' : '203.0.113.244';
    add(t, PORTAL.host, 'sshd', `sshd[${2000 + Math.floor(r() * 2000)}]: Failed password for invalid user ${b.pick(junk)} from ${ip} port ${30000 + Math.floor(r() * 30000)} ssh2`, { ip, noise: true });
  }
  // Housekeeping on the portal.
  for (let t = start - 300; t < end; t += 900) auditExec(b, t, 'root', 0, ['/usr/sbin/logrotate', '/etc/logrotate.conf'], { noise: true });
}
