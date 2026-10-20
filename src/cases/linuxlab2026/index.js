// Lab: "The upload that uploaded itself". A fictional Linux web-server compromise at Halcyon Mutual, read the way a
// defender reads it. The chain is real; every exploit payload and shell string is redacted (like Day 3). Same engine
// as the week and the Case Files; caseFile.kind = 'lab'.
import { EMAILS, PAGES, REPLY_DRAFTS } from './emails.js';
import { generateLogs, ALERTS, CASE, IP_INFO, DATE, ATT } from './logs.js';
import { WEB_TALK, WEB_SCORE } from './talk.js';
import { TICKETS } from './tickets.js';
import { scoreEmail, scoreCase, scoreTicket, scoreConversation, finalize } from '../../game/scoring.js';

const MAIN = 'web-root';
// Hunting in the Terminal: grep the auth/audit logs, or list the persistence the attacker left.
const HUNT_RE = /(grep|awk|less|cat|sort|uniq).*(status\.php|www-data|authorized_keys|cron\.d|sudo|audit|203\.0\.113\.66|shadow)/i;

function huntItem(st) {
  const cmds = st.events.filter((e) => e.type === 'terminal-cmd' && e.shell !== 'pwsh');
  const found = cmds.some((e) => HUNT_RE.test(e.cmd));
  return {
    id: 'hunt',
    area: 'Terminal',
    title: 'Trace the chain on WEB02 (grep the auth, sudo and audit logs)',
    max: 10,
    teaches: { skill: 'Read Linux auth, sudo and auditd logs to reconstruct an intrusion', secplus: '4.9 Use data sources to support an investigation' },
    outcome: found ? 'good' : cmds.length ? 'ok' : 'bad',
    points: found ? 10 : cmds.length ? 4 : 0,
    what: found ? 'You walked the chain in the logs: the upload that wrote status.php, www-data running sudo as root, the files read, and the key added to authorized_keys.' : cmds.length ? 'You opened the Terminal but did not dig into the WEB02 logs.' : 'You never looked at the logs on WEB02.',
    why: 'The logs on the box tell the story the SIEM alert only summarizes: who became root, what they read, and what they left behind. grep across access.log, auth.log and audit.log is how a defender turns "a server is compromised" into a timeline and a list of what to rotate.',
  };
}

function score(st) {
  return finalize([
    ...EMAILS.map((e) => scoreEmail(e, st.mail?.[e.id])),
    scoreConversation(WEB_SCORE, st.enc?.web),
    ...TICKETS.map((t) => scoreTicket(t, st.tickets?.[t.id])),
    huntItem(st),
    scoreCase(CASE, st.soc?.cases?.[MAIN]),
  ]);
}

function debrief(st) {
  const r = score(st);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const lines = ["Okay. Lab over. Let's walk the chain on WEB02 one step at a time."];
  if (by.case.outcome === 'good') lines.push('Your write-up matches it: an upload dropped a web shell as www-data, a NOPASSWD sudo rule to a wildcard script gave root, the shadow file and the AWS keys were read, persistence went in (cron, a root SSH key, a systemd unit), ~180 MB left the box, and the attacker logged back in as root.');
  else if (st.soc?.cases?.[MAIN]) lines.push('Your write-up missed part of the chain: web shell as www-data, sudo to root, credential theft, persistence, exfiltration, then a root SSH login with the planted key.');
  else lines.push('You never wrote it up. The web shell, the root SSH key, the cron job and the systemd unit are all still on the box.');
  if (by.case.contained) lines.push('You isolated and imaged before touching it, and rotated what the box could see. That is the order: a root-level box is rebuilt, not cleaned.');
  if (st.enc?.web?.outcome === 'isolate-image') lines.push('On the server you isolated and imaged first. That is why the memory and the shell history survived.');
  else if (st.enc?.web?.outcome === 'rebooted') lines.push('You rebooted WEB02. The memory went, and the persistence brought the attacker back.');
  else if (st.enc?.web?.outcome === 'left-up') lines.push('You left WEB02 up. It kept exfiltrating with a live root session.');
  if (by.hunt.outcome === 'good') lines.push('And you walked it in the logs yourself. The box always knew; it just needed someone to read it.');
  if (st.mail?.['hosting-phish']?.enteredCreds) lines.push('And you gave your password to the copycat "hosting support" phish that used your own server IP as bait.');
  lines.push('One line to remember: three habits made this — a web account with sudo, an executable upload folder, and a server that could reach the internet. Fix those and the web shell goes nowhere.');
  lines.push("Here's your lab report, and what you can honestly say you've done.");
  return lines;
}

function terminal() {
  const logs = generateLogs({ nowMinutes: 24 * 60 });
  const access = logs.filter((e) => e.source === 'nginx' && e.access).map((e) => e.access).join('\n');
  const auth = logs.filter((e) => e.source === 'sshd').map((e) => `${e.time} web02 ${e.msg}`).join('\n');
  const audit = logs.filter((e) => e.source === 'auditd').map((e) => `${e.time} web02 ${e.msg}`).join('\n');
  const sudo = logs.filter((e) => e.source === 'sudo').map((e) => `${e.time} web02 ${e.msg}`).join('\n');
  return {
    date: 'Thu Oct 29 2026',
    note: 'You are on the SOC jump host. WEB02\'s logs are mirrored read-only under /var/log/remote/web02/.',
    files: {
      '/var/log/remote/web02/nginx/access.log': `${access}\n`,
      '/var/log/remote/web02/auth.log': `${auth}\n`,
      '/var/log/remote/web02/audit/audit.log': `${audit}\n`,
      '/var/log/remote/web02/sudo.log': `${sudo}\n`,
      '/var/log/remote/web02/etc/cron.d/apache-health': '*/10 * * * * root /dev/shm/.a >/dev/null 2>&1\n# not installed by any package; appeared Thu 00:14\n',
      '/var/log/remote/web02/etc/ssh/authorized_keys.root': 'ssh-rsa AAAA...REDACTED... backup@ops\n# fingerprint SHA256:9Qx7bK2mN8vFq0wL5rT3yH6cJ1pD4sXz7aUeIoP2bR\n# added Thu 00:14; not in configuration management\n',
      '/home/analyst01/README.txt': [
        'Tips from Priya (WEB02 logs are under /var/log/remote/web02/):',
        '  grep status.php /var/log/remote/web02/nginx/access.log          who hit the web shell?',
        "  awk '{print $1}' /var/log/remote/web02/nginx/access.log | sort | uniq -c | sort -rn | head   top talkers",
        '  grep -i sudo /var/log/remote/web02/sudo.log                     who ran sudo as root?',
        '  grep -iE "shadow|credentials|authorized_keys" /var/log/remote/web02/audit/audit.log   what was touched?',
        '  grep -i accepted /var/log/remote/web02/auth.log                 which SSH logins succeeded?',
        '  cat /var/log/remote/web02/etc/cron.d/apache-health',
        '  whois 203.0.113.66',
        '',
        'Payloads and the web shell contents are deliberately not here. Read the evidence, not the exploit.',
        '',
      ].join('\n'),
      '/home/analyst01/iocs.txt': `${ATT}   web shell upload + root SSH return (this incident)\n45.95.147.236  internet scanner (noise)\n`,
    },
    whois: { [ATT]: ['inetnum:        203.0.113.0 - 203.0.113.255', 'netname:        TEST-NET-3', 'org-name:       AS-OFFSHORE', 'descr:          Replay stand-in for the attacker address (bulletproof hosting)', 'country:        SC'].join('\n') },
    dns: {},
  };
}

export default {
  n: 4,
  caseId: 'halcyon-linux-2026',
  date: DATE,
  title: 'Halcyon Mutual · Oct 29, 2026 (lab)',
  start: 8 * 60 + 5,
  endAt: 11 * 60 + 30,
  intro: ['Lab: the upload that uploaded itself.', 'Thursday on-call at Halcyon Mutual. A file integrity alert fired overnight.'],
  badgeAtStart: true,
  cast: ['mike', 'theo'],

  emails: EMAILS,
  pages: PAGES,
  replyDrafts: REPLY_DRAFTS,
  logs: (st) => generateLogs({ nowMinutes: st.minutes }),
  ipInfo: IP_INFO,
  alerts: ALERTS,
  tickets: TICKETS,
  terminal: terminal(),

  npcLines: {
    priya: {
      talk: [
        'Welcome to the Linux lab. It is invented, but the chain is real and so are the logs: nginx, auth.log, sudo and auditd.',
        "It's Thursday, October 29, 2026, 8:05 AM. The file integrity monitor on WEB02 paged overnight. The exploit payloads and the web shell are redacted on purpose — you are reading what a defender sees, not running the attack.",
        'The Terminal has WEB02\'s logs mirrored read-only. grep is your friend.',
        'Start with your inbox.',
      ],
      again: ['Inbox first. Then the hardening queue.'],
    },
    dana: { talk: ["I'm IT this morning. WEB02 was slow and the backup errored. I sent you a note."], again: ['Did you see my email about WEB02?'] },
    mike: { talk: ["I'm the business owner for the claims portal. It needs to be up by nine."], again: ['Is the portal going to be down long?'] },
    theo: { talk: ["I'm the sysadmin for WEB02. I did not put that status.php there."], again: ['Please do not reboot it before I hear back from you.'] },
  },

  objectives: [
    { id: 'priya', type: 'talk', text: 'Get the lab briefing from Priya' },
    { id: 'my-desk', type: 'sit', text: 'Sit down at your desk' },
    { id: 'inbox', type: 'inbox', target: 'my-desk', text: 'Go through the security inbox' },
    { id: 'web', type: 'encounter', target: 'theo', text: 'Theo is coming over about WEB02', waitText: 'Someone is on the way to talk to you.' },
    { id: 'tickets', type: 'tickets', target: 'my-desk', text: 'Work through the server hardening queue' },
    { id: 'hunt', type: 'terminal', match: HUNT_RE, target: 'my-desk', waitFor: 'alert', text: 'Terminal: grep WEB02\'s logs to trace the chain', waitText: 'Waiting on the SIEM.' },
    { id: 'server-door', type: 'badge', text: 'Badge into the server room' },
    { id: 'soc', type: 'case', target: 'soc', text: 'Work the case at the SOC console' },
    { id: 'debrief', type: 'debrief', target: 'priya', text: 'Debrief with Priya: what the attacker did' },
  ],
  encounters: [{ id: 'web', type: 'walkup', npc: 'theo', after: 'inbox', delayMs: 1500, fallbackAt: 8 * 60 + 40, intro: 'Hey. Got a minute? WEB02 looks wrong this morning.', conv: WEB_TALK }],

  score,
  debrief,

  caseFile: {
    id: 'halcyon-linux-2026',
    kind: 'lab',
    company: 'Halcyon Mutual',
    when: 'Oct 29, 2026 · Lab',
    title: 'The upload that uploaded itself',
    pitch: 'The claims upload portal takes a file it should not, and by midnight a web server is rooting itself, reading the AWS keys and shipping 180 MB to the internet. Investigate it in nginx, auth.log, sudo and auditd logs — the way a defender actually reads a Linux compromise. Exploit payloads are redacted; the lesson is the evidence and the response.',
    tags: ['Linux', 'Web shell', 'Privilege escalation', 'Persistence', 'auth.log / auditd'],
    difficulty: 'Intermediate',
    headline: 'A file uploaded to the claims portal on WEB02 executed as a PHP web shell (www-data), which used a NOPASSWD sudo rule on a wildcard backup script to become root, read /etc/shadow and the AWS credentials, installed persistence (a cron job, a root SSH key and a systemd unit), exfiltrated ~180 MB to 203.0.113.66, and logged back in over SSH as root with the planted key.',
    timeline: [
      { when: 'Wed 23:51', what: 'Recon from 203.0.113.66 against the claims portal (path traversal and backup-file guesses; mostly 404s, one 200).' },
      { when: 'Wed 23:58', what: 'A POST to /claims/upload (body redacted) writes an unsigned status.php into /var/www/html/uploads. File integrity flags it; it is not in release 7.4.1.' },
      { when: 'Thu 00:03', what: 'GETs to status.php run discovery commands as www-data (id, uname, sudo -l) — auditd records the exec, arguments redacted.' },
      { when: 'Thu 00:09', what: 'Privilege escalation: www-data runs /usr/local/bin/backup-pull.sh as root via a NOPASSWD sudo rule; the script\'s tar wildcard yields a root shell.' },
      { when: 'Thu 00:10', what: '/etc/shadow and /root/.aws/credentials are read as root.' },
      { when: 'Thu 00:14', what: 'Persistence: /etc/cron.d/apache-health (root, every 10 min), a key added to /root/.ssh/authorized_keys, and a systemd unit apache-health.service.' },
      { when: 'Thu 00:21', what: '~180 MB leaves WEB02 to 203.0.113.66:443; the firewall allows it (no default-deny egress).' },
      { when: 'Thu 00:40', what: 'The attacker logs in over SSH as root from 203.0.113.66 using the planted key.' },
      { when: 'Thu 08:05', what: 'Your shift. The file integrity alert and the hardening digest are in the inbox; the critical alert fires at 08:40.' },
    ],
    realOutcome: [
      'Insecure file upload plus an executable upload directory is one of the most common ways a public web app becomes a shell: the file only has to land somewhere it can run.',
      'Privilege escalation rarely needs a kernel exploit. A service account with sudo to a script that uses a wildcard (or any GTFOBins-listed binary) is enough to become root.',
      'Credentials live on the box: the shadow file, SSH keys, cloud credentials in ~/.aws, and app secrets. A root compromise exposes all of them, so incident response means rotating every one.',
      'Persistence is usually boring and effective: a cron job, an authorized_key, a systemd unit. Because they survive a reboot and a password reset, a rooted box is rebuilt from clean, not cleaned in place.',
    ],
    failures: [
      'The upload directory was inside the web root and allowed PHP execution, so an uploaded file ran as code.',
      'The web service account (www-data) had a NOPASSWD sudo rule, and to a script that used a shell wildcard.',
      'The server VLAN had no default-deny on outbound internet, so 180 MB could leave on 443.',
      'AWS credentials sat in /root/.aws on a public-facing server.',
      'The weekly hardening report listed the sudo rule, the executable uploads folder and the open egress, and nobody was paged.',
      'No alert on a web account using sudo, or on a public server initiating a large outbound transfer.',
    ],
    attack: [
      { id: 'T1190', name: 'Exploit Public-Facing Application', fix: 'Validate uploads by type and content, store them outside the web root with execution disabled, and patch web dependencies.' },
      { id: 'T1505.003', name: 'Server Software Component: Web Shell', fix: 'File integrity monitoring on the web root, alert on new executable files written by the web user, and make upload folders non-executable.' },
      { id: 'T1548.003', name: 'Abuse Elevation Control Mechanism: Sudo and Sudo Caching', fix: 'Remove sudo from service accounts; never allow a script that uses wildcards or shells out to run as root; audit sudoers.' },
      { id: 'T1552.001', name: 'Unsecured Credentials: Credentials In Files', fix: 'Keep cloud credentials off servers (use instance roles), and rotate everything after any root compromise.' },
      { id: 'T1053.003', name: 'Scheduled Task/Job: Cron', fix: 'Monitor /etc/cron.d, /etc/systemd/system and authorized_keys for changes, and compare against configuration management.' },
      { id: 'T1048', name: 'Exfiltration Over Alternative Protocol', fix: 'Default-deny outbound from server VLANs, allow-list required destinations, and alert on large transfers from servers.' },
    ],
    resume: 'Investigated a simulated Linux web-server compromise in Cyber Office: traced an insecure file upload to a web shell, a sudo misconfiguration to root, credential theft and persistence, and data exfiltration across nginx, auth.log, sudo and auditd logs (MITRE ATT&CK T1190, T1505.003, T1548.003), then wrote a containment and rebuild plan. Score: {grade}.',
    sources: [
      { title: 'MITRE ATT&CK: Server Software Component: Web Shell (T1505.003)', url: 'https://attack.mitre.org/techniques/T1505/003/' },
      { title: 'MITRE ATT&CK: Abuse Elevation Control Mechanism: Sudo and Sudo Caching (T1548.003)', url: 'https://attack.mitre.org/techniques/T1548/003/' },
      { title: 'OWASP: Unrestricted File Upload', url: 'https://owasp.org/www-community/vulnerabilities/Unrestricted_File_Upload' },
      { title: 'GTFOBins (how ordinary binaries become privilege escalation)', url: 'https://gtfobins.github.io/' },
      { title: 'Red Hat: Understanding and auditing sudo', url: 'https://www.redhat.com/en/blog/sudo-security-features' },
      { title: 'Linux audit: Understanding Linux auditd and the audit.log', url: 'https://linux-audit.com/understanding-linux-audit-log-files/' },
    ],
    disclaimer: 'A fictional training scenario. Halcyon Mutual, its staff, hostnames and IP addresses (documentation ranges) are invented, and no real organization is depicted. The techniques are real and the log formats follow the real tools (nginx combined access logs, OpenSSH auth.log lines, sudo syslog entries, and Linux auditd SYSCALL/EXECVE/PATH records). Exploit payloads, the web shell contents and the exact shell commands are redacted; the lesson is reading the evidence and the response. Timings and event counts are compressed for play. Dollar costs are estimates for this lab.',
  },
};
