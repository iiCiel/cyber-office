// Lab: "The upload that uploaded itself" (Halcyon Mutual, Thursday Oct 29, 2026). A FICTIONAL Linux web-server
// intrusion, read the way a defender reads it after the fact. The attack chain is real; every exploit payload and
// shell string is redacted (like Day 3), because the lesson is reading the evidence and the response, not the attack.
//
//   Wed 23:51  recon: a scanner hits WEB02 (the claims document upload portal, PHP) with odd requests (404s, then a 200)
//   Wed 23:58  a file upload lands an unsigned .php in /var/www/html/uploads (a web shell). nginx logs the POST; auditd
//              logs www-data writing the file. The request body is redacted.
//   Thu 00:03  www-data runs discovery commands (id, uname, sudo -l) via the web shell (auditd EXECVE, args redacted)
//   Thu 00:09  privilege escalation: www-data is allowed (NOPASSWD) to run one backup binary as root; it is abused to
//              spawn a root shell (sudo syslog shows COMMAND; auditd shows the root uid). No password, no 4625-style noise.
//   Thu 00:14  persistence: a cron job in /etc/cron.d, an added root SSH authorized_key (shown as a fingerprint), a
//              systemd service. Credential theft: /etc/shadow and /root/.aws/credentials are read.
//   Thu 00:21  exfiltration: ~180 MB leaves WEB02 to 203.0.113.66 over 443 (netflow + the firewall allow it)
//   Thu 00:40  the attacker logs back in over SSH as root using the planted key, from the same host (auth.log)
// Decoys: normal portal traffic all evening, the office jump host's real SSH, a legit nightly backup cron, Sunday's
// authenticated vuln scan, and a real deploy by Theo on Wednesday afternoon.

import { T, logBuilder, finishLogs } from '../../game/logkit.js';

export const DATE = { weekday: 'THU', name: 'Thursday', month: 'Oct', day: 29, year: 2026, domain: 'halcyonmutual.local', netbios: 'HALCYON' };
const DAY = 86400;
const A = (day, h, m, s = 0) => day * DAY + T(h, m, s);

export const ATT = '203.0.113.66';
const SCAN = '45.95.147.236';
const OFFICE = '10.0.4.142';
const JUMP = '10.0.3.9';
const WEB = 'web02';
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const CURL = 'curl/8.4.0';
const REDACT = (n) => `[REDACTED-payload-${n}-bytes]`;

export const IP_INFO = {
  [ATT]: { where: 'Seychelles', owner: 'AS-OFFSHORE (bulletproof hosting)', note: 'Uploaded the web shell, then logged back in over SSH as root with a planted key. Same hosting block the week-one C2 used. (Stand-in IP.)', external: true },
  [SCAN]: { where: 'Netherlands', owner: 'AS49870 Alsycon B.V.', note: 'Mass internet scanner. Hammers every server it finds. Noise, not the breach.', external: true },
  [OFFICE]: { where: 'Internal: workstations', owner: 'WS-0142 (Analyst One)', note: 'Your own desk.' },
  [JUMP]: { where: 'Internal: servers', owner: 'soc-jump01', note: 'The admin jump host. Legitimate SSH to the servers comes from here.' },
  '10.0.3.52': { where: 'Internal: servers', owner: 'WEB02 (claims upload portal)', note: 'The public-facing PHP app that takes claim documents. Where this started.' },
  '10.0.3.30': { where: 'Internal: servers', owner: 'BACKUP01', note: 'Runs the nightly backup pull from the servers.' },
};

const pad = (n) => String(n).padStart(2, '0');
const clf = (t) => `[${pad(Math.floor((A(-1, 0, 0) + t % DAY) / 1 % 1))}29/Oct/2026:${pad(Math.floor(t % DAY / 3600))}:${pad(Math.floor(t % DAY % 3600 / 60))}:${pad(t % 60)} -0400]`;

export function generateLogs({ nowMinutes = 24 * 60 } = {}) {
  const b = logBuilder(2910);
  const { r, add, pick } = b;
  const j = (n) => Math.floor(r() * n);

  // nginx access line on WEB02 (combined log format)
  const nginx = (t, ip, method, path, status, bytes, ua, extra = {}) => {
    const raw = `${ip} - - [29/Oct/2026:${pad(Math.floor((t % DAY) / 3600))}:${pad(Math.floor((t % DAY) % 3600 / 60))}:${pad(t % 60)} -0400] "${method} ${path} HTTP/1.1" ${status} ${bytes} "-" "${ua}"`;
    return add(t, WEB, 'nginx', `nginx: ${raw}`, { ip, access: raw, ...extra });
  };
  const sshd = (t, line, extra = {}) => add(t, WEB, 'sshd', `sshd[${2000 + j(4000)}]: ${line}`, extra);
  const audit = (t, line, extra = {}) => add(t, WEB, 'auditd', line, extra);
  const exec = (t, seq, comm, exe, redactN, extra = {}) => {
    audit(t, `type=SYSCALL msg=audit(${Math.floor((A(0, 0, 0) + t) )}.${100 + j(800)}:${seq}): arch=c000003e syscall=59 success=yes exit=0 ppid=${1400 + j(40)} pid=${8000 + j(900)} auid=4294967295 uid=33 gid=33 euid=${extra.root ? 0 : 33} comm="${comm}" exe="${exe}" key="exec"`, extra);
    audit(t, `type=EXECVE msg=audit(${Math.floor((A(0, 0, 0) + t))}.${100 + j(800)}:${seq}): argc=${redactN ? 3 : 1} a0="${comm}"${redactN ? ` a1="-c" a2="${REDACT(redactN)}"` : ''}`, extra);
  };

  // ---------- evening: normal portal traffic + legit ops (noise) ----------
  const paths = [['GET', '/'], ['GET', '/login'], ['POST', '/login'], ['GET', '/claims/new'], ['GET', '/static/app.css'], ['GET', '/static/app.js'], ['GET', '/favicon.ico']];
  for (let t = A(-1, 16, 0); t < A(0, 11, 0); t += 130 + j(260)) {
    const ip = `192.0.2.${10 + j(230)}`;
    if (r() < 0.4) nginx(t, ip, 'POST', '/claims/upload', 200, 1800 + j(400), BROWSER);
    else { const [m, p] = pick(paths); nginx(t, ip, m, p, p === '/login' && m === 'POST' ? 302 : 200, 400 + j(5000), BROWSER); }
  }
  // internet scanners on SSH all night (failures only) - decoy
  const junk = ['admin', 'root', 'test', 'oracle', 'ubuntu', 'postgres', 'git', 'user', 'pi'];
  for (let t = A(-1, 21, 0); t < A(0, 11, 0); t += 500 + j(1400)) sshd(t, `Failed password for invalid user ${pick(junk)} from ${SCAN} port ${30000 + j(30000)} ssh2`, { ip: SCAN, noise: true });
  // real admin SSH from the jump host (key auth) - decoy
  for (const [t, who] of [[A(-1, 9, 12), 'dana'], [A(-1, 14, 3), 'theo'], [A(0, 7, 40), 'dana']]) {
    sshd(t, `Accepted publickey for ${who} from ${JUMP} port ${50000 + j(9000)} ssh2: ED25519 SHA256:k3Yf2${who}Q9r7Lmn0pA4bWcXz6ghJt1sdEuVi8oP2qR`, { ip: JUMP, user: who, noise: true, key: who === 'dana' ? 'decoy-admin-ssh' : undefined });
    add(t + 1, WEB, 'sudo', `sudo:     ${who} : TTY=pts/0 ; PWD=/home/${who} ; USER=root ; COMMAND=/usr/bin/systemctl status nginx`, { user: who, noise: true });
  }
  // legit nightly backup cron (decoy) and Theo's Wednesday deploy (decoy)
  add(A(0, 2, 0, 0), WEB, 'cron', `CRON[${3000 + j(500)}]: (backup) CMD (/usr/local/bin/backup-pull.sh >> /var/log/backup.log 2>&1)`, { noise: true, key: 'decoy-cron' });
  add(A(-1, 15, 20), WEB, 'app-log', 'deploy: release 7.4.1 deployed by theo via CI pipeline (git 9f3a1c2). 41 files changed under /var/www/html.', { noise: true, user: 'theo', key: 'decoy-deploy' });
  add(A(-1, 3, 0), WEB, 'app-log', 'vuln-scan: authenticated Qualys scan completed (job #88213). 0 criticals, 2 highs (outdated PHP library, open uploads dir).', { noise: true, key: 'decoy-scan' });

  // ---------- the intrusion ----------
  // recon
  for (let i = 0; i < 24; i++) nginx(A(-1, 23, 51, 4) + i * 3, ATT, 'GET', `/claims/${pick(['..%2f..%2fetc%2fpasswd', 'admin', 'uploads/', 'config.php.bak', 'phpinfo.php', 'server-status'])}`, pick([404, 404, 403, 200]), 150 + j(300), CURL, { attack: true, ip: ATT, key: i === 0 ? 'recon' : undefined });
  nginx(A(-1, 23, 58, 2), ATT, 'POST', `/claims/upload?debug=1&f=${REDACT(142)}`, 200, 212, CURL, { attack: true, ip: ATT, key: 'exploit-upload' });
  audit(A(-1, 23, 58, 3), `type=PATH msg=audit(${Math.floor(A(0, 0, 0) + A(-1, 23, 58, 3))}.201:4471): item=1 name="/var/www/html/uploads/status.php" nametype=CREATE mode=0100644 ouid=33 ogid=33`, { attack: true, key: 'webshell-write', ip: ATT });
  add(A(-1, 23, 58, 3), WEB, 'app-log', 'file-integrity: NEW file /var/www/html/uploads/status.php (php, unsigned, not part of release 7.4.1). Writer: www-data.', { attack: true, key: 'webshell-fim' });
  // web-shell-driven access: GETs to the shell, each runs a command (args redacted)
  const shellCmds = [['id', '/usr/bin/id', 0], ['uname', '/usr/bin/uname', 24], ['sudo', '/usr/bin/sudo', 18], ['cat', '/usr/bin/cat', 40], ['which', '/usr/bin/which', 12]];
  shellCmds.forEach(([comm, exe, red], i) => {
    nginx(A(0, 0, 3, 10) + i * 20, ATT, 'GET', `/uploads/status.php?c=${REDACT(20 + red)}`, 200, 300 + j(900), CURL, { attack: true, ip: ATT, key: i === 0 ? 'webshell-use' : undefined });
    exec(A(0, 0, 3, 11) + i * 20, 4500 + i, comm, exe, red, { attack: true, key: comm === 'sudo' ? 'sudo-l' : undefined });
  });
  // priv-esc: www-data runs the backup binary as root via a NOPASSWD rule, abused to get a root shell
  add(A(0, 0, 9, 2), WEB, 'sudo', 'sudo:  www-data : TTY=none ; PWD=/var/www/html/uploads ; USER=root ; COMMAND=/usr/local/bin/backup-pull.sh', { attack: true, key: 'privesc-sudo' });
  add(A(0, 0, 9, 2), WEB, 'app-log', 'sudoers note: www-data has (root) NOPASSWD: /usr/local/bin/backup-pull.sh — the script calls tar with a wildcard, which can be abused to run arbitrary code as root (GTFOBins-style).', { attack: true, key: 'privesc-why' });
  exec(A(0, 0, 9, 4), 4601, 'bash', '/usr/bin/bash', 0, { attack: true, root: true, key: 'root-shell' });
  // credential theft as root
  audit(A(0, 0, 10, 1), `type=PATH msg=audit(${Math.floor(A(0, 0, 0) + A(0, 0, 10, 1))}.880:4620): item=0 name="/etc/shadow" nametype=NORMAL mode=0100640 ouid=0 ogid=42`, { attack: true, root: true, key: 'read-shadow' });
  audit(A(0, 0, 10, 20), `type=PATH msg=audit(${Math.floor(A(0, 0, 0) + A(0, 0, 10, 20))}.881:4623): item=0 name="/root/.aws/credentials" nametype=NORMAL mode=0100600 ouid=0 ogid=0`, { attack: true, root: true, key: 'read-awskeys' });
  // persistence: cron, authorized_key, systemd
  add(A(0, 0, 14, 2), WEB, 'app-log', 'file-integrity: NEW file /etc/cron.d/apache-health (runs every 10 min as root, calls /dev/shm/.a). Not from any package.', { attack: true, key: 'persist-cron' });
  audit(A(0, 0, 14, 5), `type=PATH msg=audit(${Math.floor(A(0, 0, 0) + A(0, 0, 14, 5))}.900:4650): item=1 name="/root/.ssh/authorized_keys" nametype=NORMAL mode=0100600 ouid=0 ogid=0 key="ssh-keys"`, { attack: true, root: true, key: 'persist-key' });
  add(A(0, 0, 14, 5), WEB, 'app-log', 'file-integrity: /root/.ssh/authorized_keys MODIFIED (+1 key, comment "backup@ops", fingerprint SHA256:9Qx7...do not recognize). Not in config management.', { attack: true, key: 'persist-key-fim' });
  add(A(0, 0, 14, 40), WEB, 'app-log', 'file-integrity: NEW systemd unit /etc/systemd/system/apache-health.service (ExecStart=/dev/shm/.a, enabled). Not from any package.', { attack: true, key: 'persist-systemd' });
  // exfil
  add(A(0, 0, 21, 3), WEB, 'netflow', `flow src=10.0.3.52 dst=${ATT}:443 proto=tcp state=ACCEPT duration=512 bytes_out=188743680 bytes_in=14820`, { attack: true, ip: ATT, key: 'exfil' });
  add(A(0, 0, 21, 3), 'fw01', 'firewall', `ALLOW out src=10.0.3.52 dst=${ATT} dport=443 proto=tcp app=ssl bytes=188743680 note="WEB02 egress to internet on 443 — WEB02 should not initiate outbound"`, { attack: true, ip: ATT, key: 'exfil-fw' });
  // attacker returns over SSH with the planted key
  sshd(A(0, 0, 40, 11), `Accepted publickey for root from ${ATT} port ${51000 + j(2000)} ssh2: RSA SHA256:9Qx7bK2mN8vFq0wL5rT3yH6cJ1pD4sXz7aUeIoP2bR`, { attack: true, ip: ATT, user: 'root', key: 'ssh-return' });
  add(A(0, 0, 40, 12), WEB, 'auditd', `type=USER_LOGIN msg=audit(${Math.floor(A(0, 0, 0) + A(0, 0, 40, 12))}.010:4701): pid=${9100 + j(200)} uid=0 auid=0 ses=42 msg='op=login id=0 exe="/usr/sbin/sshd" hostname=${ATT} addr=${ATT} terminal=ssh res=success'`, { attack: true, ip: ATT, user: 'root' });

  return finishLogs(b.ev, { nowMinutes, date: DATE });
}

export const CASE = {
  id: 'case',
  area: 'SOC investigation',
  title: 'A web server that logged in to itself as root at midnight',
  max: 40,
  question: 'What happened on WEB02 overnight?',
  teaches: { skill: 'Trace a Linux web compromise through access, auth, sudo and auditd logs', secplus: '4.9 Use data sources: Linux logs; 2.4 Malicious activity' },
  verdicts: [
    { id: 'chain', text: 'The upload portal was abused to drop a PHP web shell as www-data. The attacker used a NOPASSWD sudo rule to get root, stole credentials and the shadow file, added persistence (cron, a root SSH key, a systemd unit), exfiltrated ~180 MB, then logged back in over SSH as root.' },
    { id: 'scanner', text: 'Just the internet scanner from 45.95.147.236. Noise, nothing taken.' },
    { id: 'brute', text: 'An attacker brute-forced the root SSH password and logged in.' },
    { id: 'insider', text: 'Theo did it during his Wednesday deploy.' },
  ],
  correctVerdict: 'chain',
  wrongVerdictNotes: {
    scanner: 'That scanner only ever failed SSH logins. The breach came through the web app (a 200 on an upload with a redacted body), then a new .php file, then sudo to root. Different source, different story.',
    brute: 'There is no successful password login and no burst of failures for root. The root SSH login used a publickey that was added to authorized_keys at 00:14 — the attacker brought their own key after already being root.',
    insider: 'Theo\'s deploy was Wednesday afternoon over the CI pipeline and is signed to release 7.4.1. status.php is not in that release, was written by www-data at 23:58, and the root actions came from 203.0.113.66.',
  },
  actions: [
    { id: 'isolate', text: 'Isolate WEB02 from the network (block its egress and inbound) but keep it powered on, and take a disk and memory image before touching it', good: true },
    { id: 'keys', text: 'Remove the planted authorized_key, the cron job and the systemd unit, and rotate every credential that was on the box (the AWS keys, the shadow hashes, the app DB password)', good: true },
    { id: 'sudo', text: 'Fix the sudoers rule: www-data should have no sudo at all, and no script run as root should use a shell wildcard', good: true },
    { id: 'rebuild', text: 'Rebuild WEB02 from a known-good image and redeploy the app from source, rather than cleaning in place', good: true },
    { id: 'patch', text: 'Fix the upload portal: validate file type and store uploads outside the web root with execution disabled, and patch the outdated library the scan flagged', good: true },
    { id: 'egress', text: 'Block outbound internet from the server VLAN by default (WEB02 had no reason to reach the internet on 443)', good: true },
    { id: 'ir', text: 'Open an incident: the AWS keys and claims data were exposed, so rotate the keys in AWS and involve legal and privacy for notification', good: true },
    { id: 'reboot', text: 'Reboot WEB02 and delete status.php so it is clean again', good: false, why: 'A reboot wipes the memory and the running processes you need, and deleting one file leaves the cron job, the SSH key and the systemd unit. The box would re-infect itself in ten minutes.' },
    { id: 'blockip', text: 'Block 203.0.113.66 at the firewall and close it out', good: false, why: 'The attacker already has persistence that calls out on its own schedule, and can return from any IP using the planted key. Block it, but it is not containment.' },
    { id: 'chmod', text: 'Just remove the web shell and chmod the uploads directory', good: false, why: 'The attacker is already root with three persistence mechanisms. Cleaning the entry point does nothing about that.' },
    { id: 'nothing', text: 'It is only the claims portal, not a domain controller. Watch it for now.', good: false, why: 'It is a public server that was rooted, holds AWS keys and claims data, and is actively exfiltrating. Watching it is the most expensive option.' },
  ],
  primaryEvidence: { key: 'privesc-sudo', note: 'The key line: sudo shows www-data running /usr/local/bin/backup-pull.sh as root at 00:09. A web server account should never have sudo, and that script\'s wildcard made it a root shell.' },
  keyEvidence: ['exploit-upload', 'webshell-write', 'webshell-use', 'privesc-sudo', 'read-shadow', 'read-awskeys', 'persist-key', 'exfil', 'ssh-return'],
  containedRequires: ['isolate', 'keys'],
  costs: {
    contained: { amount: 70000, text: 'Rebuild WEB02, rotate the exposed AWS keys and app secrets, incident response and a weekend of overtime (estimate for this lab)' },
    breach: { amount: 650000, text: 'The attacker keeps root, the AWS keys and a way back in: claims data and cloud access are theirs, and notification follows (estimate for this lab)' },
  },
  perfectWhy: 'Right order: isolate without destroying the evidence, pull the persistence and rotate everything the box could see, then rebuild from clean and fix the two root causes — a web account with sudo and a server that can reach the internet.',
  notSubmittedWhy: 'Nobody wrote it up. The web shell, the root SSH key, the cron job and the systemd unit are all still there.',
};

export const ALERTS = [
  {
    id: 'web-newfile',
    title: 'Unsigned .php written under the web root on WEB02',
    severity: 'High',
    rule: 'File integrity monitoring: a new executable file appeared in /var/www/html that is not part of any release.',
    fields: [['File', '/var/www/html/uploads/status.php'], ['Writer', 'www-data'], ['When', 'Wed 23:58'], ['Release', 'Not in 7.4.1 (deployed Wed 15:20)']],
    trigger: { when: (st, min) => min >= 8 * 60 + 40 },
    notice: '🚨 SIEM alert (High): unsigned status.php written on WEB02',
    chat: ['A PHP file nobody deployed showed up in the uploads folder, written by the web server account. That is a web shell until proven otherwise.', 'Start at the access log: what POST created it, and what has hit status.php since?'],
  },
  {
    id: 'web-root',
    main: true,
    title: 'Web server account escalated to root, then the server logged in to itself',
    severity: 'Critical',
    rule: 'sudo to root by www-data, or a successful root SSH login to a server from an external address.',
    fields: [['Host', 'WEB02 (10.0.3.52)'], ['Escalation', 'www-data → root via /usr/local/bin/backup-pull.sh (NOPASSWD)'], ['Root SSH from', '203.0.113.66 (planted key)'], ['Egress', '~180 MB to 203.0.113.66:443']],
    trigger: { when: (st, min) => (st.visited.includes('tickets') && min >= 9 * 60 + 30) || min >= 10 * 60 + 30 },
    notice: '🚨 SIEM alert (Critical): www-data became root on WEB02; data left the box',
    chat: ['This is the one. The web account became root, read the shadow file and the AWS keys, and the box shipped 180 MB to the internet.', 'Work the chain in the Terminal: grep the auth and audit logs under /var/log/remote/web02, check the sudoers note, and list what was added to /etc/cron.d and authorized_keys.', 'Then write it up at the SOC console.'],
    case: CASE,
  },
];
