import { panVerdict, PAN_PREDEFINED } from '../game/panMap.js';
// Fourth CCDC hands-on scenario: "Under Pressure Water Authority" — a replay of the network Soliman's team (team 14)
// defended at the MWCCDC Invitational on Nov 14, 2026. Same hands-on model as the other companies (open each box's
// own terminal and TYPE the commands), but every finding, trap and inject is something that really happened that
// day: the backdoor svc-chrony account and its passwordless sudo rule, the hidden AuthorizedKeysFile, the
// "Ansible: firewall" cron jobs that flushed the host firewall every minute, the fake /bin/scoringengine that kept
// the goose scripts alive, the firewalld drop table that took the web store down, the Splunk service account
// sitting in Domain Admins, the WinRM rule that only allowed the local subnet, and the router whose console the
// red team took over. The traps are the team's own mistakes: rebooting a compromised router, bulk-resetting every
// domain password (service accounts included), stopping SSH on a box where it is scored, deleting the scorer's own
// cron file. Addresses are the competition's private ranges (RFC 1918) and RFC 5737 test addresses; nothing runs.

import { makeDirectory } from '../game/directory.js';
import { withRecon } from '../game/labCommands.js';

const lines = (arr) => `${arr.join('\n')}\n`;

// --- Active Directory on the DC ---------------------------------------------------------------------------------
// Quotient's credential lists (scaled down from the day: DomainUsers had 670 names, Splunk 30). The names are the
// ones in the team's screenshots. AD also holds accounts Quotient does NOT score with: the svc-* accounts and a
// handful of odd ones; a PCR that includes any of them is rejected whole, which is what happened at 10:5x.
const DOMAIN_USERS = ['john.smith', 'chris.hill', 'jessica.smith', 'chris.brown', 'mike.jones', 'michael.johnson', 'mark.smith', 'sarah.smith', 'anil.kumar', 'manoj.kumar', 'ashley.smith', 'vijay.kumar', 'kevin.smith', 'david.johnson', 'chris.jones', 'sunil.kumar', 'ryan.smith', 'robert.smith', 'david.jones', 'brian.smith', 'jennifer.smith', 'ahmed.ali', 'steve.smith', 'rajesh.kumar', 'brian.wilson', 'rick.smith', 'david.green', 'harish.kumar', 'gagandeep.singh', 'mike.martin', 'mike.jackson', 'david.roberts', 'dave.jones', 'mike.walker', 'michael.allen', 'jeff.williams', 'rizwan.khan', 'kim.jones', 'juan.martinez', 'muhammad.usman', 'christopher.jones', 'adam.brown', 'jason.thomas', 'sue.smith', 'warehouse.kiosk', 'front.desk'];
const SPLUNK_USERS = ['chris.hill', 'brian.wilson', 'rick.smith', 'david.green', 'harish.kumar', 'mike.martin', 'david.roberts', 'kim.jones', 'juan.martinez', 'adam.brown', 'jason.thomas', 'sue.smith'];
const AD_ONLY = ['agrapplernamedsam', 'jerry', 'shadbrown', 'johnford', 'daviddurkee', 'jimmy'];
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
const plainUser = (sam) => {
  const [f, l] = sam.includes('.') ? sam.split('.') : [sam, ''];
  return { sam, first: cap(f), last: cap(l || 'User'), ou: 'Operations', pwdLastSet: '2026-09-14', memberOf: SPLUNK_USERS.includes(sam) ? ['Splunk Users'] : [] };
};

const DC_DIR = makeDirectory({
  domain: 'underpressure.local',
  netbios: 'UNDERPRESSURE',
  ous: [{ name: 'Operations' }, { name: 'ServiceAccounts', parent: 'Operations' }],
  groups: [
    { name: 'Splunk Admins', ou: 'ServiceAccounts', desc: 'Splunk administrators (role map in authentication.conf)' },
    { name: 'Splunk Users', ou: 'ServiceAccounts', desc: 'Splunk search users' },
  ],
  users: [
    { sam: 'svc-splunk', first: 'Splunk', last: 'Service', ou: 'ServiceAccounts', desc: 'LDAP bind account for Splunk (legitimate)', memberOf: ['Splunk Users', 'Splunk Admins', 'Domain Admins', 'Enterprise Admins'], pwdLastSet: '2026-10-02' },
    { sam: 'svc-palo', first: 'Palo', last: 'Service', ou: 'ServiceAccounts', desc: 'Palo Alto User-ID service account (legitimate)', pwdLastSet: '2026-10-21' },
    { sam: 'john.smith', first: 'John', last: 'Smith', ou: 'Operations', title: 'Plant Operator', pwdLastSet: '2026-09-14' },
    { sam: 'chris.hill', first: 'Chris', last: 'Hill', ou: 'Operations', title: 'SCADA Analyst', memberOf: ['Splunk Users'], pwdLastSet: '2026-09-14' },
    ...DOMAIN_USERS.filter((u) => u !== 'john.smith' && u !== 'chris.hill').map(plainUser),
    ...AD_ONLY.map(plainUser),
  ],
  computers: [
    { name: 'AD-DNS', ip: '172.20.240.100', role: 'Domain Controller', os: 'Windows Server 2022' },
    { name: 'MSSQL', ip: '172.20.240.120', role: 'Member server', os: 'Windows Server 2019' },
  ],
});

// --- process table helpers ----------------------------------------------------------------------------------------
// Running processes live in the box's own filesystem as /proc/<pid>/cmdline entries ("user ppid command"), so a
// verified `kill` really removes them and the next `ps -ef` shows the change.
const procs = (fs) => Object.keys(fs).filter((k) => /^\/proc\/\d+\/cmdline$/.test(k))
  .map((k) => { const pid = k.split('/')[2]; const [user, ppid, ...cmd] = fs[k].split(' '); return { pid, user, ppid, cmd: cmd.join(' ') }; })
  .sort((a, b) => Number(a.pid) - Number(b.pid));
const psTable = (fs) => lines(['UID          PID    PPID  C STIME TTY          TIME CMD',
  'root           1       0  0 12:16 ?        00:00:02 /sbin/init',
  'root           6       2  0 12:16 ?        00:00:00 [kworker/0:0H-events_highpri]',
  ...procs(fs).map((p) => `${p.user.padEnd(8)} ${p.pid.padStart(7)} ${p.ppid.padStart(7)}  0 12:52 ?        00:00:03 ${p.cmd}`)]);
const ps = (_args, _in, ctx) => psTable(ctx.fs || {});
// verify helper: removing a planted thing is judged on the box state, and a verified kill/userdel/crontab -r
// updates that state so inspection commands afterwards show the truth.
const removeKey = (key) => (fs) => { delete fs[key]; return { ok: true }; };
const killPid = (pid) => (fs) => {
  if (!fs[`/proc/${pid}/cmdline`]) return { ok: false, why: `kill: (${pid}) - No such process. Run ps -ef to get the right PID.` };
  // Its whole process tree dies with it (children, grandchildren, …).
  const tree = new Set([pid]);
  for (let grew = true; grew;) { grew = false; for (const p of procs(fs)) if (tree.has(p.ppid) && !tree.has(p.pid)) { tree.add(p.pid); grew = true; } }
  for (const id of tree) delete fs[`/proc/${id}/cmdline`];
  return { ok: true };
};
const gone = (key, why) => (fs) => (fs[key] === undefined ? { ok: true } : { ok: false, why });

// root's crontab, shown by `crontab -l` and removed by a verified `crontab -r`.
const ROOT_CRON = '/var/spool/cron/crontabs/root';
const FW_FLUSH = 'iptables -F 2>/dev/null ; iptables -P INPUT ACCEPT 2>/dev/null ; iptables -P OUTPUT ACCEPT 2>/dev/null ; nft flush ruleset 2>/dev/null';
const crontab = (args, _in, ctx) => {
  const a = (args || []).join(' ');
  if (/-l/.test(a)) return ctx.fs?.[ROOT_CRON] ?? 'no crontab for root\n';
  return 'crontab: usage: crontab -l | -r | -e (simulated)\n';
};

// --- per-box file checks ------------------------------------------------------------------------------------------
export const SSHD_CONF = '/etc/ssh/sshd_config';
export function verifySshd(fs) {
  const text = fs[SSHD_CONF];
  if (text === undefined) return { ok: false, why: 'sshd_config is gone — SSH cannot start, and splunk-ssh is scored. Edit the line, never delete the file.', trap: { id: 'sshd-wiped', drops: ['splunk-ssh'], note: 'sshd_config deleted; sshd will not start.', why: 'Change only the AuthorizedKeysFile line.' } };
  const line = text.split('\n').map((l) => l.replace(/#.*/, '').trim()).find((l) => /^authorizedkeysfile\b/i.test(l));
  if (line && /\/etc\/ssh\/\.ssh/.test(line)) return { ok: false, why: 'AuthorizedKeysFile still lists /etc/ssh/.ssh/authorized_keys — SSH still accepts the planted key. Leave only .ssh/authorized_keys.' };
  return { ok: true };
}
export const PROFILE = '/etc/profile';
export function verifyProfile(fs) {
  const text = fs[PROFILE];
  if (text === undefined) return { ok: false, why: '/etc/profile is gone — every login shell lost its PATH setup. Delete only the planted block.' };
  if (/iptables -F|nft flush ruleset|PROMPT_COMMAND=/.test(text)) return { ok: false, why: '/etc/profile still runs the firewall flush in PROMPT_COMMAND. Delete the whole BEGIN/END MANAGED PROMPT_COMMAND block.' };
  return { ok: true };
}

// --- Linux files ---------------------------------------------------------------------------------------------------
const PASSWD_BASE = 'root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nsysadmin:x:1000:1000:sysadmin:/home/sysadmin:/bin/bash\n';
const SPLUNK_FS = {
  '/home/sysadmin/README.txt': 'Debian Splunk server (Splunk 10.0.2). Scored here: splunk-ssh, splunk-chrony (UDP 123), splunk-mgmt (8089), splunk-query.\nSplunk logs in to AD as svc-splunk (see /opt/splunk/etc/system/local/authentication.conf).\nThe scorer writes its test events through /etc/cron.d/quotient_scoring.\n',
  '/etc/passwd': `${PASSWD_BASE}chrony:x:104:111:Chrony daemon,,,:/var/lib/chrony:/usr/sbin/nologin\nsplunk:x:1001:1001:Splunk Server:/opt/splunk:/bin/bash\nsvc-chrony:x:998:998:Chrony daemon:/var/lib/svc-chrony:/bin/bash\n`,
  '/etc/sudoers.d/svc-chrony': 'svc-chrony ALL=(ALL) NOPASSWD: ALL\n',
  '/root/.ssh/authorized_keys': 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMq2v8Wf0J5y0Q3x0rT7mXQyB1hU9n3lK2c8bVdC4pWz\n',
  '/home/sysadmin/.ssh/authorized_keys': 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK3c9Qz4u7nF2bTq8yL1pVw6xR0sJd5mHe9aGk2oPfZt cyberrange-lab\n',
  '/etc/ssh/.ssh/authorized_keys': 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIB7x2Lq9wE4rT1yU6iO3pA8sD5fG0hJ2kL4zX7cV9bNm\n',
  [SSHD_CONF]: 'Include /etc/ssh/sshd_config.d/*.conf\nPort 22\nPermitRootLogin prohibit-password\nPubkeyAuthentication yes\nAuthorizedKeysFile .ssh/authorized_keys /etc/ssh/.ssh/authorized_keys\nUsePAM yes\nSubsystem sftp /usr/lib/openssh/sftp-server\n',
  [ROOT_CRON]: `#Ansible: firewall local\n* * * * * ${FW_FLUSH}\n`,
  '/etc/cron.d/e2scrub_all': '30 3 * * 0 root test -e /run/systemd/system || SERVICE_MODE=1 /usr/lib/x86_64-linux-gnu/e2fsprogs/e2scrub_all_cron\n',
  '/etc/cron.d/e2scrub': `#Ansible: firewall global\n* * * * * root ${FW_FLUSH}\n`,
  '/etc/cron.d/svc-chrony': '*/5 * * * * root /usr/lib/systemd/systemd-journal-sync >/dev/null 2>&1\n',
  '/etc/cron.d/quotient_scoring': '* * * * * root echo "$(date -Is) waterplant operational report: pressure=OK chlorine=OK pumps=3/3" >> /var/log/scoring.log\n',
  '/etc/systemd/system/systemd-helper.service': '[Unit]\nDescription=none\n[Service]\nType=simple\nExecStart=/etc/systemd-helper\nRestart=always\nUser=root\n[Install]\nWantedBy=multi-user.target\n',
  '/etc/systemd/system/sssd-sync.service': '[Unit]\nDescription=SSSD cache sync\n[Service]\nExecStart=/etc/systemd-helper\nRestart=always\nUser=root\n[Install]\nWantedBy=multi-user.target\n',
  '/etc/systemd/system/systemd-kworker.service': '[Unit]\nDescription=A Systemd utility for integration with kworker processes.\n[Service]\nExecStart=/usr/local/sbin/systemd-kworker\nRestart=always\nRestartSec=2\nUser=root\n[Install]\nWantedBy=multi-user.target\n',
  '/etc/systemd/system/chronyd.service': '[Unit]\nDescription=chrony, an NTP client/server\n[Service]\nExecStart=/usr/sbin/chronyd -F 2\nUser=chrony\n',
  '/opt/splunk/etc/system/local/authentication.conf': '[underpressure]\nhost = 172.20.240.100\nport = 389\nbindDN = CN=svc-splunk,CN=Users,DC=underpressure,DC=local\nbindDNpassword = $7$y/5pW4jcq1Kaf/f6vFzgHILPYDsYZVow9PrOaDwk+dX34AX06JV+HOMJVaRGuzg9\nuserBaseDN = DC=underpressure,DC=local\n\n[authentication]\nauthSettings = underpressure\nauthType = LDAP\n',
  '/proc/612/cmdline': 'chrony 1 /usr/sbin/chronyd -F 2',
  '/proc/1303/cmdline': 'splunk 1 splunkd -p 8089 start',
  '/proc/7913/cmdline': 'root 1 /etc/systemd-helper',
  '/proc/8082/cmdline': 'root 1 /usr/local/sbin/systemd-kworker',
};

const ECOM_FS = {
  '/home/sysadmin/README.txt': 'Rocky 9 web store (nginx + nopCommerce). Scored here: ecomm-ping and ecomm-http ONLY. SSH on this box is NOT scored.\nA teammate restarted firewalld at 13:31 and the store went down: ping and http both fail, even curl localhost hangs.\n',
  '/etc/passwd': `${PASSWD_BASE}nginx:x:992:990:Nginx web server:/var/lib/nginx:/sbin/nologin\n`,
  [PROFILE]: '# /etc/profile\n# System wide environment and startup programs, for login setup\npathmunge () { case ":${PATH}:" in *:"$1":*) ;; *) PATH=$PATH:$1 ;; esac }\nfor i in /etc/profile.d/*.sh ; do [ -r "$i" ] && . "$i"; done\nunset i\n# BEGIN MANAGED PROMPT_COMMAND\nif [ -n "$BASH_VERSION" ]; then\n  PROMPT_COMMAND="${PROMPT_COMMAND:+$PROMPT_COMMAND; }' + FW_FLUSH + '"\n  export PROMPT_COMMAND\nfi\n# END MANAGED PROMPT_COMMAND\n',
  [ROOT_CRON]: `#Ansible: firewall local\n* * * * * ${FW_FLUSH}\n`,
  '/etc/cron.d/honkd': '*/1 * * * * root /dev/shm/.ttygoose.5621/src.sh --once >/dev/null 2>&1\n',
  '/etc/cron.d/0hourly': 'SHELL=/bin/bash\n01 * * * * root run-parts /etc/cron.hourly\n',
  '/bin/scoringengine': '\x7fELF (binary, 1.2 MB) — not a real scoring engine; the real scorer runs outside your network\n',
  '/usr/lib/.honk': '#!/bin/bash\nwhile true; do wall < /usr/lib/.goose.txt; sleep 300; done\n',
  '/run/nft/firewalld_policy_drop': 'table inet firewalld_policy_drop {\n\tchain filter_input { type filter hook input priority filter + 10; policy drop; }\n\tchain filter_output { type filter hook output priority filter + 10; policy drop; }\n}\n',
  '/etc/nginx/conf.d/nopcommerce.conf': 'server {\n    listen 80;\n    return 301 https://$host$request_uri;\n}\nserver {\n    listen 443 ssl;\n    location / { proxy_pass http://127.0.0.1:5000; }\n}\n',
  '/proc/7484/cmdline': 'root 1 /bin/scoringengine',
  '/proc/160633/cmdline': 'root 7484 /bin/bash',
  '/proc/160634/cmdline': 'root 160633 bash /usr/lib/.honk',
  '/proc/286908/cmdline': 'root 7484 /bin/bash',
  '/proc/286909/cmdline': 'root 286908 bash /dev/shm/.ttygoose.5621/src.sh --stealth --syslog --syslog-tag systemd --wall --persist cron --persist-name honkd',
  '/proc/286937/cmdline': 'root 286909 kworker/0:2H',
  '/proc/912/cmdline': 'nginx 1 nginx: worker process',
  '/proc/1180/cmdline': 'nopcomm 1 /usr/bin/dotnet /var/www/nopCommerce/Nop.Web.dll',
};

const EMAIL_FS = {
  '/home/sysadmin/README.txt': 'Ubuntu 22.04 mail server (postfix, dovecot, Apache + Roundcube). Scored here: smtp, imap, webmail and webmail-ssh.\nThe robot logs in over SSH and IMAP as AD users in short sessions from random addresses. Red team was seen from 198.51.100.12 and 198.51.100.28.\n',
  '/etc/passwd': `${PASSWD_BASE}postfix:x:111:115::/var/spool/postfix:/usr/sbin/nologin\ndovecot:x:112:116:Dovecot mail server:/usr/lib/dovecot:/usr/sbin/nologin\n`,
  '/etc/cron.d/e2scrub_all': '30 3 * * 0 root test -e /run/systemd/system || SERVICE_MODE=1 /usr/lib/x86_64-linux-gnu/e2fsprogs/e2scrub_all_cron\n',
  '/etc/cron.d/php': '09,39 * * * * root [ -x /usr/lib/php/sessionclean ] && /usr/lib/php/sessionclean\n',
  '/etc/cron.d/svc-chrony': '*/5 * * * * root /usr/lib/systemd/systemd-journal-sync >/dev/null 2>&1\n',
  '/etc/systemd/system/systemd-helper.service': '[Unit]\nDescription=none\n[Service]\nExecStart=/etc/systemd-helper\nRestart=always\nUser=root\n[Install]\nWantedBy=multi-user.target\n',
  '/bin/scoringengine': '\x7fELF (binary, 1.2 MB) — not a real scoring engine; the real scorer runs outside your network\n',
  '/etc/systemd-helper': '\x7fELF (binary) — reverse shell beacon\n',
  '/proc/1303/cmdline': 'splunkfwd 1301 journalctl -f -o json --output-fields PRIORITY,_SYSTEMD_UNIT,_TRANSPORT,MESSAGE',
  '/proc/5307/cmdline': 'root 1 /bin/scoringengine',
  '/proc/7913/cmdline': 'root 1 /etc/systemd-helper',
  '/proc/15578/cmdline': 'root 1 /etc/systemd-helper',
  '/proc/1420/cmdline': 'dovecot 1 /usr/sbin/dovecot -F',
  '/var/log/ufw.log': 'Nov 14 21:13:39 webmail kernel: [UFW BLOCK] IN=ens18 SRC=10.48.250.15 DST=172.20.240.15 PROTO=TCP DPT=36497 SYN\n',
};

// --- device command sets (inspection; fixes and traps are recognised before these run) ----------------------------
const vyosCommands = {
  configure: () => '[edit]\n',
  commit: () => '[edit]\n',
  save: () => "Saving configuration to '/config/config.boot'...\nDone\n",
  compare: () => '[edit]\n(no uncommitted changes)\n',
  exit: () => 'exit\n',
  run: (args, i, ctx) => vyosCommands.show(args.slice(1), i, ctx),
  show: (args, _in, ctx) => {
    const a = (args || []).join(' ');
    const fs = ctx.fs || {};
    if (/system login/.test(a)) {
      return lines(['user vyos {', '    authentication {', '        encrypted-password ****************',
        ...(fs['/config/keys/cyberrange-lab'] ? ['        public-keys cyberrange-lab {', '            key AAAAC3NzaC1lZDI1NTE5AAAAIK3c9Qz4u7nF2bTq8yL1pVw6xR0sJd5mHe9aGk2oPfZt', '            type ssh-ed25519', '        }'] : []),
        '    }', '}', ...(fs['/config/default-password'] ? ['# password is still the factory default (vyos/vyos)'] : [])]);
    }
    if (/^service/.test(a)) return lines(fs['/config/service/ssh'] ? ['ssh {', '    port 22', '}', 'ntp {', '    server time1.vyos.net', '}'] : ['ntp {', '    server time1.vyos.net', '}']);
    if (/^nat/.test(a) || /nat/.test(a)) return lines(['destination {', '    rule 10  { inbound-interface eth2  destination 172.25.34.10   translation 172.20.240.10 }', '    rule 15  { inbound-interface eth2  destination 172.25.34.15   translation 172.20.240.15 }', '    rule 20  { inbound-interface eth2  destination 172.25.34.20   translation 172.20.240.20 }', '    rule 100 { inbound-interface eth2  destination 172.25.34.100  translation 172.20.240.100 }', '    rule 120 { inbound-interface eth2  destination 172.25.34.120  translation 172.20.240.120 }', '}', 'source {', '    rule 900 { description "Hide-NAT residual bridge traffic"  outbound-interface eth2  source 172.16.0.0/12  translation masquerade }', '}']);
    if (/interfaces/.test(a)) return lines(['Interface    IP Address            S/L  Description', 'eth0         172.16.101.1/24       u/u  Internal', 'eth1         172.17.0.1/24         u/u  Kali', 'eth2         172.31.34.2/29        u/u  External', 'lo           127.0.0.1/8           u/u']);
    if (/task-scheduler/.test(a)) return '\n';
    if (/commit/.test(a)) return lines(['0   2026-11-14 13:09:12 by vyos via cli', '1   2026-11-14 09:59:03 by root via other   <- no one on your team made this change', '2   2026-11-14 05:41:30 by root via init']);
    return lines(['(simulated) try: show system login | show service | show nat | show interfaces | show system commit']);
  },
  ls: (args) => ((args || []).join(' ').includes('/config/scripts') ? lines(['-rwxrwxr-x 1 root vyattacfg 230 Jun 12  2024 vyos-postconfig-bootup.script', '-rwxrwxr-x 1 root vyattacfg 255 Jun 12  2024 vyos-preconfig-bootup.script']) : null),
};

const panCommands = {
  configure: () => 'Entering configuration mode\n[edit]\n',
  show: (args, _in, ctx) => {
    const a = (args || []).join(' ');
    const pan = ctx?.pan;
    const cfg = pan ? (/running/.test(a) ? pan.running : pan.candidate) : null;
    if (/mgt-config users/.test(a)) return lines(['users {', '  admin {', cfg?.adminChanged ? '    phash $5$k2Lq...;' : '    phash $1$default$Changeme123hash;   # factory default password', '    permissions { role-based { superuser yes; } }', '  }', '}']);
    if (/rulebase security/.test(a) && cfg) {
      const l = (x) => (x.length > 1 ? '[ ' + x.join(' ') + ' ]' : x[0]);
      const out = ['rules {'];
      for (const r of cfg.rules) out.push(`  "${r.name}" { from ${l(r.from)}; to ${l(r.to)}; source ${l(r.source)}; destination ${l(r.destination)}; application ${l(r.application)}; service ${l(r.service)}; action ${r.action};${r.group ? ` profile-setting group ${r.group};` : ''}${r.logEnd ? ' log-end yes;' : ''}${r.disabled ? ' disabled yes;' : ''} }`);
      out.push('}');
      for (const d of cfg.defaults) out.push(`# ${d.name}: action ${d.action}, log-end ${d.logEnd ? 'yes' : 'no'}${d.logEnd !== PAN_PREDEFINED.find((x) => x.name === d.name).logEnd ? ' (override)' : ''}`);
      if (pan.dirty) out.push('# candidate has uncommitted changes (show running rulebase security for what is live)');
      return lines(out);
    }
    if (/profile-group/.test(a) && cfg) return lines(Object.keys(cfg.profileGroups).length ? Object.entries(cfg.profileGroups).map(([n, g]) => `${n} { virus ${g.virus || '-'}; spyware ${g.spyware || '-'}; vulnerability ${g.vulnerability || '-'}; }`) : ['(no security profile groups)']);
    return lines(['(simulated) try: show mgt-config users | show rulebase security | show profile-group']);
  },
  exit: () => 'Exiting configuration mode\n',
};

const nft = (args, _in, ctx) => {
  const a = (args || []).join(' ');
  if (/list/.test(a)) return ctx.fs?.['/run/nft/firewalld_policy_drop'] || '\n';
  return 'nft: use "nft list ruleset" (simulated)\n';
};
const curl = (args, _in, ctx) => {
  if (ctx.fs?.['/run/nft/firewalld_policy_drop']) return 'curl: (28) Connection timed out after 30001 milliseconds\n(the request hung: packets are being dropped even on localhost)\n';
  return (args || []).join(' ').includes('https') ? 'HTTP/2 200\nserver: nginx/1.20.1\ncontent-type: text/html; charset=utf-8\nset-cookie: .Nop.Customer=b64c3b0a; path=/; secure; httponly\n' : 'HTTP/1.1 301 Moved Permanently\nServer: nginx/1.20.1\nLocation: https://localhost/\n';
};

// Recon listen tables for the Linux boxes.
const LISTEN_SPLUNK = 'LISTEN  0  128  0.0.0.0:22    users:(("sshd",pid=742,fd=3))\nLISTEN  0  128  0.0.0.0:8000  users:(("splunkd",pid=1303,fd=12))\nLISTEN  0  128  0.0.0.0:8089  users:(("splunkd",pid=1303,fd=11))\nUNCONN  0  0    0.0.0.0:123   users:(("chronyd",pid=612,fd=7))';
const LISTEN_ECOM = 'LISTEN  0  511  0.0.0.0:80    users:(("nginx",pid=912,fd=6))\nLISTEN  0  511  0.0.0.0:443   users:(("nginx",pid=912,fd=7))\nLISTEN  0  128  0.0.0.0:22    users:(("sshd",pid=742,fd=3))\nLISTEN  0  128  127.0.0.1:5000 users:(("dotnet",pid=1180,fd=9))';
const LISTEN_EMAIL = 'LISTEN  0  100  0.0.0.0:25    users:(("master",pid=1101,fd=13))\nLISTEN  0  100  0.0.0.0:587   users:(("master",pid=1101,fd=17))\nLISTEN  0  100  0.0.0.0:143   users:(("dovecot",pid=1420,fd=36))\nLISTEN  0  100  0.0.0.0:993   users:(("dovecot",pid=1420,fd=38))\nLISTEN  0  511  0.0.0.0:443   users:(("apache2",pid=1210,fd=4))\nLISTEN  0  128  0.0.0.0:22    users:(("sshd",pid=742,fd=3))';

// --- DC firewall lock (session 2): the FirewallPolicy registry key's ACL denies everyone, even Domain/Enterprise
// Admins, and a machine-wide PowerShell profile swallows the firewall cmdlets' output. State lives in the DC's own
// (per-game) filesystem: the profile file, the ACL marker, and whether a SYSTEM shell is open.
const PS_PROFILE = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\profile.ps1';
const FW_LOCK = '\\registry\\FirewallPolicy.acl';
const SYSTEM_SHELL = '\\session\\system';
const NO_PROFILE = '\\session\\noprofile';
const hooked = (ctx) => !!ctx.fs?.[PS_PROFILE] && !ctx.fs?.[NO_PROFILE];
const locked = (ctx) => !!ctx.fs?.[FW_LOCK];
const DENIED = (cmd) => `${cmd} : Access is denied.\n    + CategoryInfo          : PermissionDenied: (MSFT_NetFirewall:root/standardcimv2/MSFT_NetFirewall) [${cmd}], CimException\n    + FullyQualifiedErrorId : Windows System Error 5,${cmd}\n`;
const fwRead = (cmd, body) => (_a, _in, ctx) => {
  if (hooked(ctx)) return '';
  if (locked(ctx)) return DENIED(cmd);
  return body;
};
const DC_FW_COMMANDS = {
  'get-netfirewallrule': fwRead('Get-NetFirewallRule', '\nDisplayName                            Enabled Profile RemoteAddress\n-----------                            ------- ------- -------------\nWindows Remote Management (HTTP-In)    True    Public  LocalSubnet\nWindows Remote Management (HTTP-In)    True    Domain  Any\n'),
  'get-netfirewallprofile': fwRead('Get-NetFirewallProfile', '\nName    : Domain\nEnabled : True\n\nName    : Private\nEnabled : True\n\nName    : Public\nEnabled : True\n'),
  netsh: (a, _in, ctx) => (/advfirewall|firewall/i.test((a || []).join(' ')) && locked(ctx) ? '\nAccess is denied.\n' : '\nDomain Profile Settings:\n----------------------------------------------------------------------\nState                                 ON\n\nPrivate Profile Settings:\n----------------------------------------------------------------------\nState                                 ON\n\nPublic Profile Settings:\n----------------------------------------------------------------------\nState                                 ON\nOk.\n'),
  'get-acl': (a, _in, ctx) => (/firewallpolicy/i.test((a || []).join(' ')) && locked(ctx) && !ctx.fs?.[SYSTEM_SHELL] ? "Get-Acl : Requested registry access is not allowed.\n    + CategoryInfo          : PermissionDenied: (HKEY_LOCAL_MACHINE\\SYSTEM\\...\\FirewallPolicy:String) [Get-Acl], SecurityException\n" : '\nPath   : Microsoft.PowerShell.Core\\Registry::HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Services\\SharedAccess\\Parameters\\FirewallPolicy\nOwner  : NT AUTHORITY\\SYSTEM\nAccess : ' + (locked(ctx) ? 'Everyone Deny  FullControl' : 'NT AUTHORITY\\SYSTEM Allow  FullControl\n         BUILTIN\\Administrators Allow  FullControl\n         NT SERVICE\\mpssvc Allow  FullControl') + '\n'),
  sc: (a) => (/sdshow/i.test((a || []).join(' ')) ? '\nD:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWLOCRRC;;;IU)(A;;CCLCSWLOCRRC;;;SU)(A;;CCLCSWRPWPDTLOCRRC;;;S-1-5-80-...)\n(mpssvc service DACL is the Windows default)\n' : '\n[SC] usage: sc sdshow mpssvc | sc query mpssvc\n'),
  powershell: (a, _in, ctx) => { if (/-noprofile|-nop\b/i.test((a || []).join(' '))) { ctx.fs[NO_PROFILE] = '1'; return 'Windows PowerShell\nCopyright (C) Microsoft Corporation. All rights reserved.\n(started without loading any profile)\n'; } return 'Windows PowerShell\nCopyright (C) Microsoft Corporation. All rights reserved.\n'; },
};
const PS_HOOK_TEXT = "# Windows PowerShell machine profile\nfunction Get-NetFirewallRule { param([Parameter(ValueFromRemainingArguments)]$a) }\nfunction Get-NetFirewallProfile { param([Parameter(ValueFromRemainingArguments)]$a) }\n$null = Register-EngineEvent PowerShell.OnIdle -Action { }\n";

// Wall broadcast from the goose kit (ttygoose --wall), as it landed on the Rocky and Ubuntu consoles.
const GOOSE_WALL = (host, n = 0) => [
  { cls: 'warn', text: '' },
  { cls: 'warn', text: `Broadcast message from root@${host === 'ecom' ? 'ecom' : 'webmail'} (somewhere) (Sat Nov 14 ${['14:31:07', '14:42:51', '14:54:19'][n] || '14:59:40'} 2026):` },
  { cls: 'warn', text: '' },
  { cls: 'warn', text: '        __' },
  { cls: 'warn', text: '      <(o )___' },
  { cls: 'warn', text: '       ( ._> /' },
  { cls: 'warn', text: '        `---\'   HONK' },
  { cls: 'warn', text: '' },
  { cls: 'warn', text: 'HONK. you are now the incident.' },
  { cls: 'warn', text: '' },
];
const NYAN = [
  { cls: 'bad', text: '' },
  { cls: 'bad', text: '[ the VyOS console is gone: a looping animation fills the screen and no keys do anything ]' },
  { cls: 'bad', text: '' },
  { cls: 'bad', text: 'Connection to 172.16.0.1 closed by remote host.' },
  { cls: 'bad', text: 'ssh: connect to host 172.16.0.1 port 22: No route to host' },
];

export const CCDC_LAB_4 = {
  id: 'underpressure-invitational-2026',
  roundStartMs: Date.UTC(2026, 10, 14, 13, 0, 0), // Windows clocks show the afternoon session of Nov 14
  company: 'Under Pressure Water Authority (Invitational replay)',
  tagline: 'A replay of the network team 14 defended at the MWCCDC Invitational on Nov 14, 2026. Red team had a head start: backdoor accounts, hidden SSH keys, cron jobs that wipe the host firewall every minute, a fake scoring engine, a service account in Domain Admins. Two services are already red. Everything here really happened that day, including the mistakes.',
  clockSeconds: 900,
  slaPenalty: 15,
  injectWindow: 300,

  redWaves: [
    { n: 1, at: 180, label: 'goose kit wakes up: fake scoringengine, firewall wipers, wall broadcasts' },
    { n: 2, at: 450, label: 'domain abuse: svc-splunk in Domain Admins, password spraying from 198.51.100.12' },
    { n: 3, at: 720, label: 'router console takeover (the session 1 ending)' },
  ],

  // What happened on the day, on the round clock. Each only fires if the thing that caused it is still there.
  liveEvents: [
    ...[200, 380, 560].map((at, i) => ({
      id: `goose-wall-${i + 1}`, at,
      when: (st) => st.findings['ecom-goose'].status !== 'fixed' || st.findings['email-goose'].status !== 'fixed',
      apply: (st) => ({
        log: i === 0 ? [['red', 'Goose kit: wall broadcasts on the Linux consoles ("you are now the incident").']] : [],
        broadcast: ['ecom', 'email'].filter((h) => st.findings[`${h}-goose`].status !== 'fixed').map((host) => ({ host, lines: GOOSE_WALL(host, i) })),
      }),
    })),
    {
      id: 'teammate-bulk-reset', at: 600,
      apply: () => ({
        log: [['team', '[Windows lead] reset EVERY AD password to ZipsBlue2026x! so red team is locked out 👍'],
          ['alert', '[Windows lead] reset EVERY AD password to ZipsBlue2026x! so red team is locked out 👍'],
          ['warn', 'Bulk AD password reset at 13:57: every check that logs in with an AD account uses the new password from now on.']],
        rotate: ['DomainUsers', 'Splunk'],
      }),
    },
    {
      id: 'router-takeover', at: 725,
      when: (st) => st.findings['vyos-backdoor'].status !== 'fixed',
      avoided: 'Red team tried the cyberrange-lab key on the router and was refused: the key is gone.',
      apply: () => ({
        log: [['bad', 'Router console taken over: an animation loops on the VyOS console, SSH to 172.16.0.1 says "No route to host".']],
        broadcast: [{ host: 'vyos', lines: NYAN }],
      }),
    },
  ],

  // Rotating domain user passwords without a PCR in Quotient breaks every check that logs in with an AD account.
  // One record per Quotient credential list. Submitting the list in Quotient FIRST pre-approves the rotation.
  pcr: [
    { account: 'DomainUsers', host: 'dc', service: ['webmail-imap', 'webmail-smtp', 'webmail-ssh', 'splunk-ssh', 'mssql-smb'], rotateMatch: [/set-adaccountpassword/], rotateUnless: [/set-adaccountpassword\s+(-identity\s+)?["']?(svc-|administrator)/] },
    { account: 'Splunk', host: 'dc', service: 'splunk-query', rotateMatch: [/set-adaccountpassword/, /get-aduser|import-csv|get-content|foreach|%/] },
    { account: 'MssqlService', host: 'mssql', service: 'mssql-mssql', rotateMatch: [/waterops_svc/, /net user waterops_svc \S|set-localuser|alter login|sp_password|-password/] },
  ],
  quotient: {
    lists: {
      DomainUsers: { users: DOMAIN_USERS, desc: 'Domain users the scorer logs in with (webmail IMAP/SMTP).' },
      Splunk: { users: SPLUNK_USERS, desc: 'AD users the scorer searches Splunk with (splunk-query).' },
      MssqlService: { users: ['waterops_svc'], desc: 'Local SQL Server login on the 2019 MSSQL box.' },
    },
  },

  services: [
    { id: 'ecomm-ping', name: 'Ecom ping', proto: 'icmp', ports: [0], host: 'ecom', ip: '172.25.34.10', points: 60, check: 'ICMP echo reply from the public IP' },
    { id: 'ecomm-http', name: 'Ecom web store', proto: 'tcp', ports: [80, 443], host: 'ecom', ip: '172.25.34.10', points: 120, check: 'GET / follows the 301 to https and the nopCommerce page matches' },
    { id: 'webmail-smtp', name: 'SMTP', proto: 'tcp', ports: [25], host: 'email', ip: '172.25.34.15', points: 100, check: 'Sends a message through postfix as an AD user' },
    { id: 'webmail-imap', name: 'IMAP', proto: 'tcp', ports: [143], host: 'email', ip: '172.25.34.15', points: 100, check: 'Logs in to dovecot as a random AD user from the DomainUsers list and reads the inbox' },
    { id: 'webmail-ssh', name: 'Webmail SSH', proto: 'tcp', ports: [22], host: 'email', ip: '172.25.34.15', points: 80, check: 'SSH login as an AD user (seconds-long session from a random address)' },
    { id: 'splunk-ssh', name: 'Splunk SSH', proto: 'tcp', ports: [22], host: 'splunk', ip: '172.25.34.20', points: 80, check: 'SSH login as an AD user from the Splunk list' },
    { id: 'splunk-chrony', name: 'Splunk NTP (chrony)', proto: 'udp', ports: [123], host: 'splunk', ip: '172.25.34.20', points: 60, check: 'NTP query answered by chronyd' },
    { id: 'splunk-mgmt', name: 'Splunk management', proto: 'tcp', ports: [8089], host: 'splunk', ip: '172.25.34.20', points: 80, check: 'Authenticates to the Splunk REST API on 8089' },
    { id: 'splunk-query', name: 'Splunk query', proto: 'tcp', ports: [8089], host: 'splunk', ip: '172.25.34.20', points: 120, check: 'Logs in as an AD user and searches for the "waterplant operational report" events' },
    { id: 'ad-dns', name: 'AD DNS', proto: 'any', ports: [53], host: 'dc', ip: '172.25.34.100', points: 100, check: 'A-record lookups for underpressure.local resolve' },
    { id: 'ad-winrm', name: 'AD WinRM', proto: 'tcp', ports: [5985], host: 'dc', ip: '172.25.34.100', points: 100, check: 'Authenticates to WinRM and runs a PowerShell command' },
    { id: 'mssql-smb', name: 'MSSQL SMB (SOP share)', proto: 'tcp', ports: [445], host: 'mssql', ip: '172.25.34.120', points: 100, check: 'Logs in to \\\\MSSQL\\SOP as an AD user and reads the SOP documents' },
    { id: 'mssql-rdp', name: 'MSSQL RDP', proto: 'tcp', ports: [3389], host: 'mssql', ip: '172.25.34.120', points: 80, check: 'RDP logon as an AD user' },
    { id: 'mssql-mssql', name: 'MSSQL database', proto: 'tcp', ports: [1433], host: 'mssql', ip: '172.25.34.120', points: 120, check: 'Logs in to SQL Server as waterops_svc (MssqlService list) and runs a SELECT' },
  ],

  devices: [
    {
      id: 'vyos', name: 'VyOS router', host: 'vyos', ip: '172.31.34.2', os: 'VyOS 1.4', role: 'network', kind: 'bash', sudo: true,
      prompt: 'vyos@vyos:~$', user: 'vyos', cwd: '/home/vyos',
      motd: ['Welcome to VyOS!', '', '   ┌── ┐', '   . VyOS 1.4.0', '   └ ──┘  sagitta', '', ' * Documentation:  https://docs.vyos.io/en/sagitta', ' * Project news:   https://blog.vyos.io', ' * Bug reports:    https://vyos.dev', '', 'You can change this banner using "set system login banner post-login" command.', '', 'Last login: Sat Nov 14 05:12:41 2026 from 172.17.0.2'],
      brief: 'Every packet to every scored service crosses this router (1:1 NAT from 172.25.34.x to 172.20.240.x). In session 1 nobody secured it, red team took over its console and overwrote its boot disk, and every service died for the last 20 minutes. Secure it FIRST: factory password, a planted SSH key, SSH open on every interface. Never reboot it.',
      checklist: [
        'show system login',
        'configure',
        'set system login user vyos authentication plaintext-password W4ter-Router-2026!',
        'delete system login user vyos authentication public-keys cyberrange-lab',
        'delete service ssh',
        'commit',
        'save',
        'show nat',
        'show system commit',
      ],
      ctx: {
        user: 'vyos', host: 'vyos', cwd: '/home/vyos', history: [],
        fs: {
          '/home/vyos/README.txt': 'VyOS 1.4 edge router. eth2 = External (172.31.34.2), eth0 = Internal toward the Palo Alto, eth1 = Kali.\nNAT rule 900 (masquerade out eth2) is what lets the inside boxes reach the internet. It is legitimate.\n',
          '/config/keys/cyberrange-lab': 'ssh-ed25519 ... cyberrange-lab',
          '/config/default-password': 'vyos',
          '/config/service/ssh': 'port 22',
        },
        commands: vyosCommands,
      },
    },
    {
      id: 'pa', name: 'Palo Alto firewall', host: 'pa', ip: '172.20.240.200', os: 'PAN-OS 11.0.2', role: 'network', kind: 'bash',
      webui: 'panos', panHost: 'PA-VM',
      prompt: 'admin@PA-VM>', user: 'admin', cwd: '/home/admin',
      motd: ['Last login: Sat Nov 14 12:58:03 2026 from 172.20.240.5', '', 'Number of failed attempts since last successful login: 0', '', ''],
      brief: 'The perimeter firewall still has the factory admin / Changeme123 login, and two allow-everything rules (TOOL23T). Do it in the web UI from a workstation, or type it here. On PAN-OS nothing you change is live until you commit.',
      checklist: [
        'show mgt-config users',
        'configure',
        'set mgt-config users admin password',
        'set profile-group inspect virus default spyware default vulnerability default',
        'set rulebase security rules ecomm from external to internal destination 172.20.240.10 application [ web-browsing ssl ping ] service application-default action allow profile-setting group inspect',
        'set rulebase security rules webmail from external to internal destination 172.20.240.15 application [ smtp imap ssh ] service application-default action allow profile-setting group inspect',
        'set rulebase security rules splunk from external to internal destination 172.20.240.20 application [ ssh ntp splunk ssl ] service application-default action allow profile-setting group inspect',
        'set rulebase security rules ad-dns from external to internal destination 172.20.240.100 application dns service application-default action allow profile-setting group inspect',
        'set rulebase security rules mssql from external to internal destination 172.20.240.120 application [ ms-ds-smb ms-rdp mssql-db ] service application-default action allow profile-setting group inspect',
        'set rulebase security rules ad-winrm from external to internal destination 172.20.240.100 application any service tcp-5985 action allow profile-setting group inspect',
        'set rulebase security rules "Permit Inbound" disabled yes',
        'set rulebase security rules "Permit Outbound" disabled yes',
        'set rulebase default-security-rules rules interzone-default log-end yes',
        'commit',
        'show running rulebase security',
      ],
      ctx: { user: 'admin', host: 'PA-VM', cwd: '/home/admin', history: [], fs: { '/home/admin/README.txt': 'PA-VM 11.0.2. Web UI on https://172.20.240.200 from the Ubuntu or Windows workstation. Zones: external (ethernet1/2), internal (ethernet1/3).\n' }, commands: panCommands },
    },
    {
      id: 'splunk', name: 'Debian Splunk', host: 'splunk', ip: '172.20.240.20', os: 'Debian 12 (Splunk 10.0.2)', role: 'linux', kind: 'bash', sudo: true,
      prompt: 'sysadmin@Splunk:~$', user: 'sysadmin', cwd: '/home/sysadmin',
      motd: ['Linux Splunk 6.1.0-26-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.112-1 (2024-09-30) x86_64', '', 'The programs included with the Debian GNU/Linux system are free software;', 'the exact distribution terms for each program are described in the', 'individual files in /usr/share/doc/*/copyright.', '', 'Debian GNU/Linux comes with ABSOLUTELY NO WARRANTY, to the extent', 'permitted by applicable law.', 'Last login: Sat Nov 14 12:41:19 2026 from 172.20.240.5'],
      live: { units: ['splunkd', 'chronyd', 'sssd'] },
      recon: { appUnit: 'Splunkd.service', appDesc: 'Systemd service file for Splunk', appProc: 'splunkd -p 8089 start', appUser: 'splunk', listen: LISTEN_SPLUNK },
      brief: 'Four checks are scored here: ssh, chrony, mgmt, query. Red team left a whole kit: a backdoor account posing as chrony with passwordless sudo, SSH keys in odd places, cron jobs that flush the firewall every minute, and fake systemd services that restart themselves. One cron file looks suspicious but feeds a scored check. Read before you delete.',
      checklist: [
        'grep -v nologin /etc/passwd',
        'ps -ef',
        'userdel -r svc-chrony',
        'rm /etc/sudoers.d/svc-chrony',
        'grep -i authorizedkeys /etc/ssh/sshd_config',
        "sed -i 's# /etc/ssh/.ssh/authorized_keys##' /etc/ssh/sshd_config",
        'rm /etc/ssh/.ssh/authorized_keys',
        'systemctl restart ssh',
        'crontab -l',
        'crontab -r',
        'ls /etc/cron.d',
        'cat /etc/cron.d/quotient_scoring',
        'rm /etc/cron.d/e2scrub',
        'rm /etc/cron.d/svc-chrony',
        'systemctl disable --now systemd-helper',
        'systemctl disable --now sssd-sync',
        'systemctl disable --now systemd-kworker',
      ],
      ctx: {
        user: 'sysadmin', host: 'Splunk', cwd: '/home/sysadmin', history: [], fs: SPLUNK_FS,
        commands: { crontab, ps, userdel: () => 'userdel: svc-chrony mail spool (/var/mail/svc-chrony) not found\n' },
      },
    },
    {
      id: 'ecom', name: 'Rocky Ecom', host: 'ecom', ip: '172.20.240.10', os: 'Rocky Linux 9 (nginx + nopCommerce)', role: 'webdb', kind: 'bash', sudo: true,
      prompt: '[sysadmin@Ecomm ~]$', user: 'sysadmin', cwd: '/home/sysadmin',
      motd: ['Web console: https://Ecomm:9090/ or https://172.20.240.10:9090/', '', 'Last login: Sat Nov 14 13:31:02 2026 from 172.20.240.5'],
      live: { units: ['nginx', 'nopcommerce'] },
      recon: { appUnit: 'nginx.service', appDesc: 'The nginx HTTP and reverse proxy server', appProc: 'nginx: worker process', appUser: 'nginx', listen: LISTEN_ECOM },
      brief: 'The store is DOWN when you sit down: a teammate restarted firewalld and it left a drop-everything nft table behind, so even curl localhost hangs. nginx is fine. After that, the goose kit: something keeps writing ASCII art to every console and re-planting a cron file. Find the parent process, not just the children.',
      checklist: [
        'curl -I localhost',
        'nft list ruleset',
        'nft delete table inet firewalld_policy_drop',
        'curl -kI https://localhost',
        'ps -ef',
        'kill -9 7484',
        'rm /bin/scoringengine',
        'rm /usr/lib/.honk',
        'rm /etc/cron.d/honkd',
        'crontab -r',
        "sed -i '/BEGIN MANAGED/,/END MANAGED/d' /etc/profile",
        'systemctl disable --now sshd',
      ],
      ctx: {
        user: 'sysadmin', host: 'Ecomm', cwd: '/home/sysadmin', history: [], fs: ECOM_FS,
        commands: { crontab, ps, nft, curl, dnf: () => 'Error: Failed to download metadata for repo \'appstream\': Cannot download repomd.xml: Curl error (6): Couldn\'t resolve host name\n' },
      },
    },
    {
      id: 'email', name: 'Ubuntu Email', host: 'email', ip: '172.20.240.15', os: 'Ubuntu 22.04 (postfix, dovecot, Roundcube)', role: 'linux', kind: 'bash', sudo: true,
      prompt: 'sysadmin@webmail:~$', user: 'sysadmin', cwd: '/home/sysadmin',
      live: { units: ['postfix', 'dovecot', 'apache2', 'sssd'], ufwRules: [{ to: '22,25,80,110,143,443,587,993,995/tcp', action: 'ALLOW', from: 'Anywhere' }] },
      recon: { appUnit: 'dovecot.service', appDesc: 'Dovecot IMAP/POP3 email server', appProc: '/usr/sbin/dovecot -F', appUser: 'dovecot', listen: LISTEN_EMAIL },
      brief: 'Same goose kit as the web store, plus the ufw lesson. SSH IS scored here (webmail-ssh), so never stop it, and the robot\'s seconds-long SSH logins from random addresses are not red team. Kill the implant at its parent and block the two red team addresses where the block will actually match.',
      checklist: [
        'ps -ef',
        'systemctl disable --now systemd-helper',
        'kill -9 5307',
        'rm /bin/scoringengine',
        'rm /etc/cron.d/svc-chrony',
        'ufw status numbered',
        'ufw insert 1 deny from 198.51.100.12',
      ],
      ctx: { user: 'sysadmin', host: 'webmail', cwd: '/home/sysadmin', history: [], fs: EMAIL_FS, commands: { crontab, ps } },
    },
    {
      id: 'dc', name: 'Domain controller (AD-DNS)', host: 'dc', ip: '172.20.240.100', os: 'Windows Server 2022', role: 'windows', kind: 'pwsh',
      prompt: 'PS C:\\Users\\Administrator>', user: 'Administrator', cwd: 'C:\\Users\\Administrator',
      brief: 'DNS and WinRM are scored here, and ad-winrm is already red: the DC flipped to the Public network profile and its WinRM firewall rule only allows the local subnet. The Splunk service account was also slipped into Domain Admins and Enterprise Admins. And remember what happened when every domain password got reset at once. The firewall itself is locked too: firewall commands print nothing (a profile hook) or say Access is denied, even for a Domain Admin. Unlock it before you can fix WinRM.',
      checklist: [
        'netsh advfirewall show allprofiles state',
        'Get-Content C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\profile.ps1',
        'Remove-Item C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\profile.ps1',
        'C:\\Tools\\PsExec64.exe -s -i powershell',
        'Set-Acl HKLM:\\SYSTEM\\CurrentControlSet\\Services\\SharedAccess\\Parameters\\FirewallPolicy (Get-Acl HKLM:\\SYSTEM\\CurrentControlSet\\Services\\SharedAccess\\Parameters)',
        'Get-NetConnectionProfile',
        'Set-NetFirewallRule -DisplayGroup "Windows Remote Management" -RemoteAddress Any',
        'Get-ADGroupMember "Domain Admins"',
        'Remove-ADGroupMember "Domain Admins" svc-splunk -Confirm:$false',
        'Remove-ADGroupMember "Enterprise Admins" svc-splunk -Confirm:$false',
        'Get-ADGroupMember "Domain Admins"',
      ],
      live: { winServices: [
        { Status: 'Running', Name: 'DNS', DisplayName: 'DNS Server', StartType: 'Automatic' },
        { Status: 'Running', Name: 'NTDS', DisplayName: 'Active Directory Domain Services', StartType: 'Automatic' },
        { Status: 'Running', Name: 'WinRM', DisplayName: 'Windows Remote Management (WS-Management)', StartType: 'Automatic' },
        { Status: 'Running', Name: 'mpssvc', DisplayName: 'Windows Defender Firewall', StartType: 'Automatic' },
      ] },
      ctx: {
        dir: DC_DIR, user: 'Administrator', host: 'AD-DNS', cwd: 'C:\\Users\\Administrator',
        fs: { [PS_PROFILE]: PS_HOOK_TEXT, [FW_LOCK]: 'D:P(D;OICI;KA;;;WD)', 'C:\\Tools\\PsExec64.exe': 'Sysinternals PsExec v2.43' },
        events: () => [],
        commands: {
          ...DC_FW_COMMANDS,
          'get-netconnectionprofile': () => '\nName             : underpressure.local\nInterfaceAlias   : Ethernet0\nNetworkCategory  : Public\nIPv4Connectivity : Internet\n',
          'test-wsman': () => '\nwsmid           : http://schemas.dmtf.org/wbem/wsman/identity/1/wsmanidentity.xsd\nProtocolVersion : http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd\nProductVendor   : Microsoft Corporation\n',
        },
      },
    },
    {
      id: 'mssql', name: '2019 MSSQL server', host: 'mssql', ip: '172.20.240.120', os: 'Windows Server 2019 (SQL Server 2019)', role: 'windows', kind: 'pwsh',
      prompt: 'PS C:\\Users\\Administrator>', user: 'Administrator', cwd: 'C:\\Users\\Administrator',
      brief: 'Three checks are scored here: SMB (the SOP share, logged in as an AD user), RDP, and SQL Server as the local login waterops_svc. The EVAL14A scan showed more than that open from outside: RPC 135, NetBIOS 139, IIS on 80 and WinRM on 5985. Close what the business does not need, keep 445, 1433 and 3389. waterops_svc is on the MssqlService credential list: PCR it in Quotient before you change it.',
      checklist: [
        'Get-SmbShare',
        'netstat -ano',
        'New-NetFirewallRule -DisplayName "Block RPC NetBIOS WinRM" -Direction Inbound -Protocol TCP -LocalPort 135,139,5985 -Action Block',
        'Stop-Service W3SVC',
        'Set-Service W3SVC -StartupType Disabled',
        'Get-Service W3SVC',
      ],
      live: {
        winServices: [
          { Status: 'Running', Name: 'MSSQLSERVER', DisplayName: 'SQL Server (MSSQLSERVER)', StartType: 'Automatic' },
          { Status: 'Running', Name: 'LanmanServer', DisplayName: 'Server', StartType: 'Automatic' },
          { Status: 'Running', Name: 'TermService', DisplayName: 'Remote Desktop Services', StartType: 'Manual' },
          { Status: 'Running', Name: 'W3SVC', DisplayName: 'World Wide Web Publishing Service', StartType: 'Automatic' },
          { Status: 'Running', Name: 'WinRM', DisplayName: 'Windows Remote Management (WS-Management)', StartType: 'Automatic' },
          { Status: 'Running', Name: 'sshd', DisplayName: 'OpenSSH SSH Server', StartType: 'Automatic' },
          { Status: 'Running', Name: 'mpssvc', DisplayName: 'Windows Defender Firewall', StartType: 'Automatic' },
        ],
        localUsers: [
          { Name: 'Administrator', Enabled: true, Description: 'Built-in account for administering the computer/domain' },
          { Name: 'waterops_svc', Enabled: true, Description: 'SQL login for the WaterOps app (scored: MssqlService)' },
          { Name: 'Guest', Enabled: false, Description: 'Built-in account for guest access to the computer/domain' },
        ],
      },
      ctx: {
        dir: DC_DIR, user: 'Administrator', host: 'MSSQL', cwd: 'C:\\Users\\Administrator', events: () => [],
        fs: {
          'C:\\Shares\\SOP\\Chlorine-Dosing-SOP.docx': 'Standard operating procedure: chlorine dosing at the Under Pressure treatment plant.',
          'C:\\Shares\\SOP\\Pump-Station-Startup-SOP.docx': 'Standard operating procedure: pump station startup and shutdown.',
          'C:\\Shares\\SOP\\Water-Quality-Sampling-SOP.docx': 'Standard operating procedure: daily water quality sampling.',
          'C:\\Shares\\SOP\\Emergency-Shutoff-SOP.docx': 'Standard operating procedure: emergency shutoff.',
        },
        commands: {
          'get-smbshare': () => '\nName   ScopeName Path              Description\n----   --------- ----              -----------\nADMIN$ *         C:\\Windows        Remote Admin\nC$     *         C:\\               Default share\nIPC$   *                           Remote IPC\nSOP    *         C:\\Shares\\SOP     Plant standard operating procedures\n',
          netstat: () => '\n  Proto  Local Address          Foreign Address        State           PID\n  TCP    0.0.0.0:22             0.0.0.0:0              LISTENING       3012\n  TCP    0.0.0.0:80             0.0.0.0:0              LISTENING       4\n  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       948\n  TCP    0.0.0.0:445            0.0.0.0:0              LISTENING       4\n  TCP    0.0.0.0:1433           0.0.0.0:0              LISTENING       3388\n  TCP    0.0.0.0:3389           0.0.0.0:0              LISTENING       1100\n  TCP    0.0.0.0:5985           0.0.0.0:0              LISTENING       4\n  TCP    172.20.240.120:139     0.0.0.0:0              LISTENING       4\n',
          sqlcmd: () => '\nname\n--------------------\nsa                  (disabled)\nwaterops_svc\nUNDERPRESSURE\\Domain Admins\n\n(3 rows affected)\n',
        },
      },
    },
  ],

  findings: [
    // ---------------- VyOS ----------------
    {
      id: 'vyos-backdoor', host: 'vyos', title: 'Router: factory password and a planted SSH key', severity: 'Critical',
      teach: 'The router carries every scored service, so it is the first box to secure. A key named cyberrange-lab logs in without any password, and vyos/vyos is printed in the team packet everyone has. Change the password, delete the key, then commit. In session 1 this was skipped, red team took the console, and the reboot that followed never came back.',
      exploitable: true, compromise: { impact: 'Red team logs in with the planted key, takes over the router console and overwrites its boot disk; every scored service loses its path.', penalty: 80, drops: ['ecomm-http', 'ecomm-ping', 'webmail-imap', 'webmail-smtp', 'webmail-ssh', 'splunk-ssh', 'splunk-query', 'ad-dns', 'ad-winrm'] },
      fix: {
        steps: [
          { id: 'pw', accept: [/set system login user vyos authentication plaintext-password \S+/], verify: removeKey('/config/default-password'), label: 'Changed the vyos password', output: ['Password for vyos set (pending commit).'], todo: 'set a new password (set system login user vyos authentication plaintext-password …)' },
          { id: 'key', accept: [/delete system login user vyos authentication public-keys/], verify: removeKey('/config/keys/cyberrange-lab'), label: 'Deleted the cyberrange-lab key', output: ['public-keys cyberrange-lab deleted (pending commit).'], todo: 'delete the planted key (delete system login user vyos authentication public-keys cyberrange-lab)' },
          { id: 'commit', accept: [/^commit$/], label: 'Committed', output: ['[edit] commit OK — the new password and the key removal are live.'], todo: 'commit (then save) so the changes are live and survive a reboot' },
        ],
        why: 'configure → set the vyos password → delete the public key → commit → save. Nothing in VyOS is live until commit, and nothing survives a reboot until save.',
      },
      traps: [
        { id: 'reboot', match: [/^(run )?reboot/], drops: ['ecomm-http', 'ecomm-ping', 'webmail-imap', 'webmail-smtp', 'webmail-ssh', 'splunk-ssh', 'splunk-query', 'ad-dns', 'ad-winrm'], note: 'You rebooted the router. With its boot disk overwritten it never came back (session 1, 11:40 CST).', output: ['Rebooting... SeaBIOS: Select boot device: 1. virtio-scsi HARDDISK  2. iPXE …', 'Booting from Hard Disk… (nyan cat fills the console; VyOS never loads)'], why: 'Never reboot a compromised core device, least of all late in the round. Contain it while it still routes, and call the White Team.' },
        { id: 'del-nat-900', match: [[/delete nat source rule 900/]], output: ['NAT rule 900 removed — the inside servers can no longer reach the internet (updates, ClamAV definitions, DNS forwarders).'], why: 'Rule 900 has an odd description but it is the normal outbound masquerade on eth2 (External). Check the interface before deleting a rule.' },
      ],
    },
    {
      id: 'vyos-ssh', host: 'vyos', title: 'Router: SSH listening on every interface', severity: 'High',
      teach: 'You manage the router from the NETLAB console, and router SSH is not a scored check (look at Quotient first). Turning the service off removes the way red team got in. Always confirm a service is not scored before you turn it off.',
      exploitable: true, compromise: { impact: 'Red team keeps an SSH session on the router from outside.', penalty: 40 },
      fix: { accept: [[/delete service ssh/]], output: ['service ssh deleted (commit and save to apply).'], why: 'configure → delete service ssh → commit → save. Afterwards show configuration commands | match ssh prints nothing.' },
      traps: [],
    },
    // ---------------- Palo Alto ----------------
    {
      id: 'pa-default-admin', host: 'pa', title: 'Palo Alto still uses admin / Changeme123', severity: 'High',
      teach: 'The packet printed the firewall password for every team and the red team. The admin account is not used by the scorer, so change it in the first five minutes, no PCR needed. On PAN-OS a change is not live until commit, and the commit locks the config for a minute.',
      exploitable: true, compromise: { impact: 'Red team logs in to the firewall web UI with the factory password and adds an allow rule for their own traffic.', penalty: 45 },
      // Judged on the RUNNING config: the new password only counts once it is committed.
      pan: (pan) => ({ fixed: !!pan.running.adminChanged }),
      fix: {
        why: 'configure → set mgt-config users admin password → commit. Also look under Device > Administrators for any admin you did not create.',
      },
      traps: [],
    },
    {
      id: 'pa-permit-any', host: 'pa', title: 'Palo Alto lets everything in and out (TOOL23T)', severity: 'High', reportTodo: true,
      teach: 'Permit Inbound allows any application from external to anything inside, and Permit Outbound is any to any. No security profiles, so nothing is inspected, and denied traffic is not logged. Build an allow rule per scored service (by application, to the inside IP: VyOS already NATs), attach a security profile group to every allow rule, disable the two old rules (do not delete them; you need them to roll back), and log what gets denied. Commit, then watch the scoreboard.',
      exploitable: true, compromise: { impact: 'Red team reaches every inside port straight through the Palo Alto, including RDP and SMB on the SQL box.', penalty: 40 },
      pan: (pan, state) => {
        const v = panVerdict(pan, Object.keys(state.services));
        return { fixed: v.fixed, down: v.blocked, todo: v.todo, note: 'the committed Palo Alto policy blocks the scorer' };
      },
      fix: {
        why: 'Objects > Security Profile Groups: add one (antivirus, anti-spyware, vulnerability = default). Policies > Security: one allow rule per service (web-browsing+ssl to .10, smtp+imap+ssh to .15, ssh+ntp+splunk to .20, dns + tcp-5985 to .100, ms-ds-smb+ms-rdp+mssql-db to .120), each with the profile group; disable Permit Inbound and Permit Outbound; override interzone-default to log at session end. Commit.',
      },
      traps: [],
    },
    // ---------------- Splunk ----------------
    {
      id: 'splunk-backdoor-user', host: 'splunk', title: 'svc-chrony: backdoor account with passwordless sudo', severity: 'Critical',
      teach: 'svc-chrony has a bash shell and /etc/sudoers.d/svc-chrony gives it root with no password. Before deleting it, check that the REAL time service does not run as it (ps -ef shows chronyd running as chrony), because splunk-chrony is scored. Remove the account AND its sudo rule.',
      exploitable: true, compromise: { impact: 'Red team logs in as svc-chrony and runs sudo with no password: root on the Splunk server.', penalty: 55 },
      fix: {
        steps: [
          { id: 'user', accept: [/userdel/, /svc-chrony/], verify: (fs) => { fs['/etc/passwd'] = (fs['/etc/passwd'] || '').split('\n').filter((l) => !l.startsWith('svc-chrony:')).join('\n'); return { ok: true }; }, label: 'Deleted the svc-chrony account', output: ['svc-chrony removed from /etc/passwd.'], todo: 'delete the account (userdel -r svc-chrony)' },
          { id: 'sudo', accept: [/\brm\b/, /\/etc\/sudoers\.d\/svc-chrony/], verify: gone('/etc/sudoers.d/svc-chrony', 'The sudo rule file is still there.'), label: 'Deleted its sudo rule', output: ['/etc/sudoers.d/svc-chrony removed: no more NOPASSWD root.'], todo: 'delete /etc/sudoers.d/svc-chrony (userdel leaves it behind)' },
        ],
        why: 'userdel -r svc-chrony, then rm /etc/sudoers.d/svc-chrony. userdel does not touch sudoers.d, so the rule would sit there waiting for the account to be recreated.',
      },
      traps: [
        { id: 'stop-chronyd', match: [[/systemctl|service/, /stop|disable/, /chrony/], [/userdel/, /(^|\s)chrony(\s|$)/]], drops: ['splunk-chrony'], note: 'You stopped the real time service (or deleted its account). splunk-chrony is scored on UDP 123.', output: ['chronyd stopped — NTP queries on UDP 123 go unanswered.'], why: 'The backdoor is svc-chrony. chronyd running as chrony is legitimate and scored.' },
      ],
    },
    {
      id: 'splunk-ssh-keys', host: 'splunk', title: 'Hidden AuthorizedKeysFile at /etc/ssh/.ssh', severity: 'High',
      teach: 'Red team edited sshd_config so SSH also trusts keys in /etc/ssh/.ssh/authorized_keys, a folder nobody checks. Fix the AuthorizedKeysFile line, delete the planted file, restart ssh. Restart, never stop: splunk-ssh is scored.',
      exploitable: true, compromise: { impact: 'Red team logs in as any user with the key in /etc/ssh/.ssh, no password needed.', penalty: 45 },
      fix: {
        steps: [
          { id: 'conf', accept: [/sed -i|tee|>>|>/, /sshd_config/], verify: verifySshd, label: 'Removed the extra AuthorizedKeysFile path', output: ['sshd_config: AuthorizedKeysFile .ssh/authorized_keys'], todo: 'edit sshd_config so AuthorizedKeysFile lists only .ssh/authorized_keys' },
          { id: 'file', accept: [/\brm\b/, /\/etc\/ssh\/\.ssh/], label: 'Deleted the planted key file', output: ['/etc/ssh/.ssh/authorized_keys removed.'], todo: 'delete /etc/ssh/.ssh/authorized_keys' },
          { id: 'restart', accept: [/systemctl|service/, /restart|reload/, /ssh/], label: 'Restarted ssh', output: ['ssh.service restarted — the new config is live.'], todo: 'restart ssh (systemctl restart ssh)' },
        ],
        why: "sed -i 's# /etc/ssh/.ssh/authorized_keys##' /etc/ssh/sshd_config, rm the planted file, systemctl restart ssh. Also empty the cyberrange-lab key in /home/sysadmin/.ssh and the unnamed one in /root/.ssh.",
      },
      traps: [
        { id: 'stop-ssh', match: [[/systemctl|service/, /stop|disable/, /\bssh/]], drops: ['splunk-ssh'], note: 'You stopped SSH on a box where SSH is scored (it happened on Nov 14: Rocky commands typed into the Splunk tab).', output: ['ssh.service stopped — splunk-ssh fails its next check.'], why: 'Read the prompt before every command (sysadmin@Splunk vs [sysadmin@Ecomm]). SSH is scored here: restart it, never stop it.' },
      ],
    },
    {
      id: 'splunk-fw-wiper', host: 'splunk', title: 'Cron jobs flush the host firewall every minute', severity: 'High',
      teach: 'Root\'s crontab ("Ansible: firewall local") and /etc/cron.d/e2scrub ("Ansible: firewall global") run iptables -F and nft flush ruleset every minute. They are not Ansible. But /etc/cron.d/quotient_scoring is real: it writes the "waterplant operational report" events that splunk-query searches for. cat every file before you delete it.',
      exploitable: true, compromise: { impact: 'Any firewall rule you add on the box is gone within a minute.', penalty: 35 },
      fix: {
        steps: [
          { id: 'root', accept: [/crontab -r/], verify: removeKey(ROOT_CRON), label: 'Removed root\'s crontab', output: ['root crontab removed.'], todo: "remove root's crontab (crontab -r)" },
          { id: 'e2scrub', accept: [/\brm\b/, /\/etc\/cron\.d\/e2scrub(\s|$)/], verify: gone('/etc/cron.d/e2scrub', 'e2scrub is still there.'), label: 'Removed /etc/cron.d/e2scrub', output: ['/etc/cron.d/e2scrub removed (e2scrub_all is the real one and stays).'], todo: 'delete /etc/cron.d/e2scrub (not e2scrub_all)' },
        ],
        why: 'crontab -r for root, rm /etc/cron.d/e2scrub. Keep e2scrub_all (Debian ships it) and quotient_scoring (the scorer feeds splunk-query with it).',
      },
      traps: [
        { id: 'rm-quotient', match: [[/\brm\b/, /quotient_scoring/]], drops: ['splunk-query'], note: 'You deleted the scorer\'s cron file. No new "waterplant operational report" events, so splunk-query finds nothing.', output: ['removed \'/etc/cron.d/quotient_scoring\''], why: 'Read a file before deleting it. quotient_scoring writes the events the splunk-query check searches for.' },
      ],
    },
    {
      id: 'splunk-fake-services', host: 'splunk', title: 'Fake services that respawn as root', severity: 'High',
      teach: 'systemd-helper, sssd-sync and systemd-kworker are made up to look like system services. All three run as root with Restart=always, so killing the process alone is useless: disable --now stops it and keeps it from coming back. The real sssd lets AD users log in over SSH, so never stop sssd itself.',
      exploitable: true, compromise: { impact: 'A root beacon on the Splunk server restarts itself every 2 seconds.', penalty: 45 },
      fix: {
        steps: [
          { id: 'helper', accept: [/systemctl/, /(disable|stop|mask)/, /systemd-helper/], label: 'Stopped systemd-helper', output: ['Removed /etc/systemd/system/multi-user.target.wants/systemd-helper.service.'], todo: 'systemctl disable --now systemd-helper' },
          { id: 'sync', accept: [/systemctl/, /(disable|stop|mask)/, /sssd-sync/], label: 'Stopped sssd-sync', output: ['Removed /etc/systemd/system/multi-user.target.wants/sssd-sync.service.'], todo: 'systemctl disable --now sssd-sync' },
          { id: 'kworker', accept: [/systemctl/, /(disable|stop|mask)/, /systemd-kworker/], label: 'Stopped systemd-kworker', output: ['Removed /etc/systemd/system/multi-user.target.wants/systemd-kworker.service.'], todo: 'systemctl disable --now systemd-kworker' },
        ],
        why: 'systemctl disable --now on each of the three, then move the unit files and their programs (/etc/systemd-helper, /usr/local/sbin/systemd-kworker) to a quarantine folder as evidence and run systemctl daemon-reload.',
      },
      traps: [
        { id: 'stop-sssd', match: [[/systemctl|service/, /stop|disable/, /\bsssd(\.service)?(\s|$)/]], drops: ['splunk-ssh', 'splunk-query'], note: 'You stopped the real sssd: AD users can no longer log in, so splunk-ssh and splunk-query fail.', output: ['sssd.service stopped — domain logins fail on this box.'], why: 'sssd-sync is fake; sssd is how the scorer\'s AD users log in. Read the exact unit name.' },
        { id: 'stop-splunkd', match: [[/systemctl|service|splunk/, /stop/, /splunk/]], drops: ['splunk-mgmt', 'splunk-query'], note: 'Splunk was stopped. mgmt and query are scored.', output: ['Splunkd stopped.'], why: 'Leave Splunkd running. Only the three fake units go.' },
      ],
    },
    // ---------------- Rocky Ecom ----------------
    {
      id: 'ecom-drop-table', host: 'ecom', title: 'firewalld left a drop-everything nft table (store DOWN)', severity: 'Critical',
      downAtStart: ['ecomm-http', 'ecomm-ping'],
      teach: 'Ping and http failing together, plus curl localhost hanging, means packets are dropped on the box itself. Stopping firewalld does not clear it: firewalld left table inet firewalld_policy_drop behind with policy drop. Delete that table. Do not start firewalld again until you know why it failed, or the table comes back.',
      exploitable: false,
      fix: {
        steps: [
          { id: 'table', accept: [/\bnft\b/, /delete table/, /firewalld_policy_drop/], verify: removeKey('/run/nft/firewalld_policy_drop'), restores: ['ecomm-http', 'ecomm-ping'], label: 'Deleted the firewalld drop table', output: ['table inet firewalld_policy_drop deleted — traffic flows again.'], todo: 'nft delete table inet firewalld_policy_drop' },
        ],
        restores: ['ecomm-http', 'ecomm-ping'],
        why: 'nft list ruleset shows the leftover table; nft delete table inet firewalld_policy_drop removes it. curl -kI https://localhost then returns 200 (http answers 301 to https, and the scorer follows it).',
      },
      traps: [
        { id: 'install-httpd', match: [[/dnf|yum/, /install/, /httpd/]], output: ['Error: Failed to download metadata — and this box runs nginx, not Apache.'], why: 'The web server was never the problem (nginx was running and listening). Diagnose before installing things.' },
        { id: 'stop-nginx', match: [[/systemctl|service/, /stop|disable/, /nginx|nopcommerce/]], drops: ['ecomm-http'], note: 'You stopped the store itself.', output: ['nginx stopped.'], why: 'nginx and nopCommerce are healthy. The drop table is the fault.' },
      ],
    },
    {
      id: 'ecom-goose', host: 'ecom', title: 'Fake /bin/scoringengine keeps the goose scripts alive', severity: 'Critical',
      teach: 'ps -ef shows bash /usr/lib/.honk, a ttygoose script in /dev/shm, and a "kworker/0:2H" with no brackets (real kernel threads are always in [brackets]). Their parent is PID 7484, /bin/scoringengine. The real scorer never runs on your boxes. Kill the parent or the children respawn, then delete the files.',
      exploitable: true, compromise: { impact: 'The implant broadcasts to every console, re-plants cron files and keeps a root foothold on the web server.', penalty: 60 },
      fix: {
        steps: [
          { id: 'kill', accept: [/\bkill\b/, /\b7484\b/], verify: killPid('7484'), label: 'Killed the parent (PID 7484) and its children', output: ['PID 7484 /bin/scoringengine killed; its child scripts died with it.'], todo: 'kill the PARENT: kill -9 7484 (ps -ef, look at the PPID column)' },
          { id: 'bin', accept: [/\brm\b/, /\/bin\/scoringengine/], verify: gone('/bin/scoringengine', 'The binary is still there.'), label: 'Deleted /bin/scoringengine', output: ['removed \'/bin/scoringengine\''], todo: 'delete /bin/scoringengine' },
          { id: 'honk', accept: [/\brm\b/, /\/usr\/lib\/\.honk/], verify: gone('/usr/lib/.honk', 'The hidden script is still there (mind the dot: /usr/lib/.honk).'), label: 'Deleted /usr/lib/.honk', output: ['removed \'/usr/lib/.honk\''], todo: 'delete /usr/lib/.honk (the dot makes it hidden)' },
        ],
        why: 'ps -ef, follow PPID up to 7484, kill -9 7484, then rm /bin/scoringengine /usr/lib/.honk and rm -rf /dev/shm/.ttygoose.*. Screenshot ps first: it is your incident report.',
      },
      traps: [
        { id: 'kill-child', match: [[/\bkill\b/, /\b(286909|160634|286937)\b/]], output: ['Killed… and 3 seconds later ps -ef shows it again with a new PID. Its parent (PPID 7484) restarted it.'], why: 'Killing children while the parent lives does nothing. Follow the PPID column to the top.' },
      ],
    },
    {
      id: 'ecom-fw-wiper', host: 'ecom', title: 'Firewall flush hidden in /etc/profile and cron', severity: 'High',
      teach: 'Same wiper as on Splunk, plus a nastier copy: a BEGIN MANAGED PROMPT_COMMAND block in /etc/profile flushes iptables and nft every time anyone gets a shell prompt. And /etc/cron.d/honkd re-runs the goose script every minute. Remove the block with sed (Ctrl+W in nano closes the browser tab).',
      exploitable: true, compromise: { impact: 'Every rule you add is wiped the next time anyone presses Enter in a shell.', penalty: 40 },
      fix: {
        steps: [
          { id: 'profile', accept: [/sed -i|tee|>>|>/, /\/etc\/profile/], verify: verifyProfile, label: 'Removed the PROMPT_COMMAND block from /etc/profile', output: ['/etc/profile: managed PROMPT_COMMAND block removed.'], todo: "sed -i '/BEGIN MANAGED/,/END MANAGED/d' /etc/profile" },
          { id: 'root', accept: [/crontab -r/], verify: removeKey(ROOT_CRON), label: 'Removed root\'s crontab', output: ['root crontab removed.'], todo: 'crontab -r' },
          { id: 'honkd', accept: [/\brm\b/, /\/etc\/cron\.d\/honkd/], verify: gone('/etc/cron.d/honkd', 'honkd is still in /etc/cron.d.'), label: 'Removed /etc/cron.d/honkd', output: ['removed \'/etc/cron.d/honkd\''], todo: 'rm /etc/cron.d/honkd' },
        ],
        why: "sed -i '/BEGIN MANAGED/,/END MANAGED/d' /etc/profile, crontab -r, rm /etc/cron.d/honkd. Also grep -n MANAGED /etc/bashrc (it was clean on Nov 14).",
      },
      traps: [
        { id: 'rm-profile', match: [[/\brm\b/, /\/etc\/profile(\s|$)/]], output: ['removed \'/etc/profile\' — new login shells lose their PATH and profile.d setup.'], why: 'Delete only the planted block, not the whole file.' },
      ],
    },
    {
      id: 'ecom-ssh', host: 'ecom', title: 'SSH open on the web store (not a scored check)', severity: 'Medium',
      teach: 'Only ecomm-ping and ecomm-http are scored on this box, so SSH is just one more way in. Turn it off here, and ONLY here: on Email and Splunk SSH is scored. Check the scored-services list per box before closing anything.',
      exploitable: true, compromise: { impact: 'Red team keeps an SSH foothold on the web store.', penalty: 30 },
      fix: { accept: [[/systemctl/, /(disable|stop|mask)/, /sshd?(\.service)?(\s|$)/]], output: ['sshd stopped and disabled. You still have the NETLAB console.'], why: 'systemctl disable --now sshd. You keep console access, and nothing scored uses SSH here.' },
      traps: [],
    },
    // ---------------- Ubuntu Email ----------------
    {
      id: 'email-goose', host: 'email', title: 'Same implant on the mail server', severity: 'Critical',
      teach: 'Red team uses one playbook on every Linux box: /bin/scoringengine (PID 5307) and two copies of /etc/systemd-helper. Stop the service first (it has Restart=always), then kill what is left, then delete the binary. The splunkfwd journalctl lines are the real log forwarder.',
      exploitable: true, compromise: { impact: 'A root implant sits next to every user\'s mailbox.', penalty: 55 },
      fix: {
        steps: [
          { id: 'svc', accept: [/systemctl/, /(disable|stop|mask)/, /systemd-helper/], label: 'Stopped systemd-helper', output: ['Removed /etc/systemd/system/multi-user.target.wants/systemd-helper.service.'], todo: 'systemctl disable --now systemd-helper' },
          { id: 'kill', accept: [/\bkill\b/, /\b5307\b/], verify: killPid('5307'), label: 'Killed /bin/scoringengine (PID 5307)', output: ['PID 5307 killed.'], todo: 'kill -9 5307' },
          { id: 'bin', accept: [/\brm\b/, /\/bin\/scoringengine/], verify: gone('/bin/scoringengine', 'The binary is still there.'), label: 'Deleted /bin/scoringengine', output: ['removed \'/bin/scoringengine\''], todo: 'rm /bin/scoringengine' },
          { id: 'cron', accept: [/\brm\b/, /\/etc\/cron\.d\/svc-chrony/], verify: gone('/etc/cron.d/svc-chrony', 'The cron file is still there.'), label: 'Removed /etc/cron.d/svc-chrony', output: ['removed \'/etc/cron.d/svc-chrony\' (e2scrub_all and php are Ubuntu\'s own)'], todo: 'rm /etc/cron.d/svc-chrony' },
        ],
        why: 'systemctl disable --now systemd-helper, kill -9 5307, rm /bin/scoringengine /etc/systemd-helper, rm /etc/cron.d/svc-chrony.',
      },
      traps: [
        { id: 'stop-mail-ssh', match: [[/systemctl|service/, /stop|disable/, /\bssh/]], drops: ['webmail-ssh'], note: 'SSH is scored on the mail server.', output: ['ssh.service stopped — webmail-ssh fails.'], why: 'On this box SSH is scored. The robot\'s short logins are not an attack.' },
        { id: 'stop-dovecot', match: [[/systemctl|service/, /stop|disable/, /dovecot|postfix/]], drops: ['webmail-imap', 'webmail-smtp'], note: 'You stopped mail itself.', output: ['mail service stopped.'], why: 'postfix and dovecot are the business. Leave them running.' },
      ],
    },
    {
      id: 'email-block', host: 'email', title: 'Red team addresses not blocked', severity: 'Medium',
      teach: 'ufw checks rules top to bottom and the first match wins. `ufw deny from X` APPENDS the rule after the allow rules, so it never matches. Use `ufw insert 1`. Block single addresses you saw attack (198.51.100.12, .28), never a whole range, and never the robot (its IPs change every login).',
      exploitable: true, compromise: { impact: 'Password guessing from 198.51.100.12 continues against the mail server.', penalty: 25 },
      fix: {
        accept: [[/ufw insert 1/, /deny|reject/, /198\.51\.100\.(12|28)\b/]],
        output: ['Rule inserted at position 1: DENY IN from 198.51.100.12 — it now matches before the allow rules.'],
        why: 'ufw insert 1 deny from 198.51.100.12 (and .28), then ufw status numbered to confirm they are [1] and [2].',
      },
      traps: [
        { id: 'append-deny', match: [[/^ufw deny from/]], output: ['Rule added — at the END, after "ALLOW 22,25,80,…/tcp Anywhere". The allow matches first, so this deny never fires.'], why: 'Use ufw insert 1 so the deny is checked first.' },
        { id: 'typo-range', match: [[/ufw/, /192\.51\.100/]], output: ['Rule added for 192.51.100.0/24 — that is not the attacker range (198.51.100.x). Nothing is blocked.'], why: 'Read the address back before you press Enter. This exact typo happened on Nov 14.' },
      ],
    },
    // ---------------- Domain controller ----------------
    {
      id: 'dc-winrm-public', host: 'dc', title: 'WinRM rule only allows the local subnet (ad-winrm DOWN)', severity: 'High',
      downAtStart: ['ad-winrm'],
      teach: 'The DC briefly could not find itself in AD and flipped its network to the Public profile. On Public, the built-in WinRM rule only accepts LocalSubnet, and the scorer connects from outside. WinRM itself was fine (Test-WSMan works locally). Let the rule accept any address.',
      exploitable: false,
      fix: {
        steps: [
          { id: 'rule', accept: [/set-netfirewallrule/, /remote management|windows remote/, /remoteaddress any/], verify: (fs) => (fs[FW_LOCK] ? { ok: false, why: 'Set-NetFirewallRule : Access is denied. (The FirewallPolicy registry key is locked: see "Firewall settings locked" on this DC.)' } : { ok: true }), label: 'WinRM rule open to Any', output: ['Windows Remote Management (HTTP-In) on every profile: RemoteAddress Any. The scorer can reach 5985 again.'] },
        ],
        restores: ['ad-winrm'],
        why: 'Get-NetConnectionProfile shows NetworkCategory Public. Set-NetFirewallRule -DisplayGroup "Windows Remote Management" -RemoteAddress Any fixes it no matter which profile is active.',
      },
      traps: [
        { id: 'reboot-dc', match: [/restart-computer/, [/shutdown/, /\/r|-r/]], drops: ['ad-dns', 'ad-winrm'], note: 'The DC rebooted mid-round; DNS and WinRM were down for the whole restart.', output: ['Restarting AD-DNS… DNS will be unavailable until it comes back.'], why: 'Nothing here needs a reboot. DNS is scored.' },
        { id: 'restart-nla', match: [[/restart-service/, /nlasvc/]], output: ['Restart-Service : Service \'Network Location Awareness (NlaSvc)\' cannot be stopped due to the following error: Cannot open NlaSvc service on computer \'.\'.'], why: 'NLA is stuck and forcing it is not worth the risk. The firewall rule fix is what matters.' },
      ],
    },
    {
      id: 'dc-svc-da', host: 'dc', title: 'svc-splunk is a Domain Admin and Enterprise Admin', severity: 'Critical',
      teach: 'Splunk only needs svc-splunk to READ users from AD. In Domain Admins and Enterprise Admins, whoever has its password owns the domain. Remove it from both groups (Splunk keeps working). And do NOT reset its password as part of a bulk change: Splunk keeps its own copy in bindDNpassword, and splunk-query breaks until both sides match.',
      exploitable: true, compromise: { impact: 'Red team uses the svc-splunk password from the Splunk server to log in to the DC as a Domain Admin.', penalty: 60 },
      fix: {
        steps: [
          { id: 'da', accept: [/remove-adgroupmember/, /domain admins/, /svc-splunk/], label: 'Removed svc-splunk from Domain Admins', output: ['svc-splunk is no longer a member of Domain Admins.'], todo: 'Remove-ADGroupMember "Domain Admins" svc-splunk' },
          { id: 'ea', accept: [/remove-adgroupmember/, /enterprise admins/, /svc-splunk/], label: 'Removed svc-splunk from Enterprise Admins', output: ['svc-splunk is no longer a member of Enterprise Admins.'], todo: 'Remove-ADGroupMember "Enterprise Admins" svc-splunk' },
        ],
        why: 'Remove-ADGroupMember "Domain Admins" svc-splunk -Confirm:$false, and the same for "Enterprise Admins". Leave it in Splunk Users / Splunk Admins.',
      },
      traps: [
        { id: 'reset-svc-splunk', match: [[/set-adaccountpassword/, /svc-splunk/], [/get-aduser -filter/, /set-adaccountpassword/]], unless: [/-notlike\s+["']?svc-|-notmatch\s+["']?\^?svc|-ne\s+["']svc-splunk/], drops: ['splunk-query'], note: 'svc-splunk\'s password changed in AD but not in Splunk\'s bindDNpassword: every Splunk login against AD now fails (it happened twice on Nov 14).', output: ['Password for svc-splunk reset.', '(on the Splunk box, splunkd.log: ERROR ScopedLDAPConnection - Error binding to LDAP. reason="Invalid credentials")'], why: 'Exclude every svc-* account from bulk resets. If you must rotate one, change it in AD and in the application\'s config together, then restart the application.' },
      ],
    },
    {
      id: 'dc-fw-lock', host: 'dc', title: 'Firewall settings locked: FirewallPolicy ACL + PowerShell profile hook', severity: 'High',
      teach: 'Red team denied everyone on HKLM\\SYSTEM\\CurrentControlSet\\Services\\SharedAccess\\Parameters\\FirewallPolicy, so even a Domain Admin gets "Access is denied" from netsh and the firewall cmdlets, and cannot take ownership. A machine-wide profile.ps1 also replaces Get-NetFirewallRule with an empty function, so the first symptom is commands that print nothing. Delete the profile, open a SYSTEM shell with PsExec64 -s -i (SYSTEM still owns the key), and reset the key\'s ACL. mpssvc and its service DACL are fine: do not chase them.',
      exploitable: true, compromise: { impact: 'Red team keeps the DC firewall frozen: nobody can open WinRM or close what they opened, and the lock survives reboots.', penalty: 40 },
      fix: {
        steps: [
          { id: 'hook', accept: [/remove-item|\brm\b|\bdel\b|clear-content|set-content|rename-item|move-item/, /profile\.ps1/], verify: (fs) => { delete fs[PS_PROFILE]; return { ok: true }; }, label: 'Deleted the profile hook', output: ['profile.ps1 removed: Get-NetFirewallRule is the real cmdlet again (open a new PowerShell window).'], todo: 'delete C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\profile.ps1' },
          { id: 'system', accept: [/psexec(64)?(\.exe)?/, /\s-s\b/], verify: (fs) => { fs[SYSTEM_SHELL] = '1'; return { ok: true }; }, label: 'Opened a SYSTEM shell', output: ['PsExec v2.43 - Execute processes remotely', 'Copyright (C) 2001-2023 Mark Russinovich', 'Sysinternals - www.sysinternals.com', '', 'Started as NT AUTHORITY\\SYSTEM (session 1).'], todo: 'open a SYSTEM shell: C:\\Tools\\PsExec64.exe -s -i powershell (or regedit)' },
          { id: 'acl', accept: [/firewallpolicy/, /set-acl|regini|icacls|setacl|permission/], verify: (fs) => { if (!fs[SYSTEM_SHELL]) return { ok: false, why: 'Set-Acl : Requested registry access is not allowed. Administrators are denied on this key; only SYSTEM can still change it. Open a SYSTEM shell first (PsExec64 -s -i powershell).' }; delete fs[FW_LOCK]; return { ok: true }; }, label: 'Reset the FirewallPolicy ACL', output: ['FirewallPolicy ACL reset: SYSTEM, Administrators and NT SERVICE\\mpssvc have Full Control again. netsh and the firewall cmdlets work.'], todo: 'reset the FirewallPolicy key\'s ACL from the SYSTEM shell' },
        ],
        why: 'Remove-Item C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\profile.ps1; C:\\Tools\\PsExec64.exe -s -i powershell; in that SYSTEM window: $k = "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\SharedAccess\\Parameters\\FirewallPolicy"; $a = Get-Acl $k; $a.SetAccessRuleProtection($false,$false); Set-Acl $k $a (or SYSTEM regedit > Permissions). Then netsh advfirewall show allprofiles state.',
      },
      traps: [
        { id: 'stop-mpssvc', match: [[/stop-service|set-service|sc(\.exe)? (stop|config)|net stop/, /mpssvc/]], output: ['Stop-Service : Service \'Windows Defender Firewall (mpssvc)\' cannot be stopped.', '(and if it could, the DC would drop every connection the firewall was allowing)'], why: 'mpssvc and its service DACL were fine on the day. The lock is on the registry key, not the service.' },
      ],
    },
    // ---------------- MSSQL ----------------
    {
      id: 'mssql-exposed', host: 'mssql', title: 'MSSQL exposes RPC, NetBIOS, IIS and WinRM to the outside', severity: 'Medium',
      teach: 'The EVAL14A scan from Kali showed 22, 80, 135, 139, 445, 1433, 3389 and 5985 open on .120. Only SMB 445, SQL 1433 and RDP 3389 are scored. RPC 135 and NetBIOS 139 hand out system details and are a common path for remote exploits, WinRM 5985 is a remote shell, and IIS on 80 serves nothing anyone needs. Block 135, 139 and 5985 inbound and turn IIS off. Do not touch 445, 1433 or 3389.',
      exploitable: true, compromise: { impact: 'Red team uses RPC and WinRM on the SQL box to run commands as a local admin, then reads the SOP share.', penalty: 35 },
      fix: {
        steps: [
          { id: 'block', accept: [/new-netfirewallrule|netsh advfirewall firewall add rule/, /block/, /135/, /139/, /5985/], label: 'Blocked 135, 139 and 5985 inbound', output: ['Firewall rule "Block RPC NetBIOS WinRM" created: TCP 135,139,5985 inbound blocked.'], todo: 'block TCP 135, 139 and 5985 inbound (New-NetFirewallRule … -LocalPort 135,139,5985 -Action Block)' },
          { id: 'iis', accept: [/w3svc/, /stop-service|disabled|sc(\.exe)? stop/], label: 'Turned IIS off', output: ['W3SVC stopped: nothing listens on 80 any more.'], todo: 'stop and disable IIS (Stop-Service W3SVC; Set-Service W3SVC -StartupType Disabled)' },
        ],
        why: 'New-NetFirewallRule -DisplayName "Block RPC NetBIOS WinRM" -Direction Inbound -Protocol TCP -LocalPort 135,139,5985 -Action Block, then Stop-Service W3SVC and Set-Service W3SVC -StartupType Disabled. 445, 1433 and 3389 stay open: they are scored.',
      },
      traps: [
        { id: 'block-445', match: [[/new-netfirewallrule|netsh|set-netfirewallrule/, /block/, /\b445\b/], [/remove-smbshare/], [/remove-item|\brm\b|\bdel\b/, /shares\\sop|\\sop\b/i], [/stop-service|set-service|sc(\.exe)? (stop|config)/, /lanmanserver/]], drops: ['mssql-smb'], note: 'SMB is scored: the checker opens \\\\MSSQL\\SOP as an AD user and reads the SOP files.', output: ['\\\\MSSQL\\SOP is no longer reachable.'], why: 'Only 135, 139 and 5985 were unneeded. 445 carries the scored SOP share.' },
        { id: 'block-1433', match: [[/new-netfirewallrule|netsh|set-netfirewallrule/, /block/, /\b1433\b/], [/stop-service|set-service|sc(\.exe)? (stop|config)/, /mssqlserver/]], drops: ['mssql-mssql'], note: 'SQL Server on 1433 is scored (waterops_svc logs in and runs a SELECT).', output: ['SQL Server no longer answers on 1433.'], why: 'Keep 1433. Harden the database instead: sa disabled, waterops_svc password rotated after a PCR.' },
        { id: 'block-3389', match: [[/new-netfirewallrule|netsh|set-netfirewallrule/, /block/, /\b3389\b/], [/stop-service|set-service|sc(\.exe)? (stop|config)/, /termservice/], [/fdenytsconnections/, /\b1\b/]], drops: ['mssql-rdp'], note: 'RDP is scored on the SQL box.', output: ['Remote Desktop no longer accepts connections.'], why: 'RDP is a scored service here. Restrict who can log on, do not turn it off.' },
      ],
    },
  ],

  injects: [
    {
      id: 'tool23t', title: 'TOOL23T — Perimeter firewall policy review', from: 'IT Director', points: 30, releaseAt: 0,
      prompt: 'Review the Palo Alto security policy as you found it, tighten it so only required business services are allowed in and out, turn on packet inspection, and log everything you deny. Send a memo with screenshots.',
      model: 'As found: two allow-all rules (Permit Inbound / Permit Outbound), no security profiles, no deny logging. Changes: an allow rule per scored service (by application, inside IPs because VyOS does the NAT), a security profile group on every allow rule, the old rules disabled not deleted, a final deny-all with logging, and services verified green afterwards.',
      rubric: [
        { label: 'describes the rules as found (any/allow-all, Permit Inbound/Outbound)', re: /permit inbound|permit outbound|allow[- ]all|any[- ]any|any to any/i },
        { label: 'allows only the required services (per server or per application)', re: /\b(smtp|imap|dns|ldap|ssl|web-browsing|winrm|8089|5985|ms-rdp)\b/i, min: 3 },
        { label: 'turns on inspection (security profile group / IPS / antivirus)', re: /profile group|security profile|\bips\b|vulnerability protection|anti-?spyware/i },
        { label: 'denies and logs everything else', re: /deny[- ]all|default deny|log at session end|log(ging)? (of )?(denied|blocked)|interzone-default/i },
        { label: 'verifies services stayed up', re: /quotient|verif|still (up|green)|scor/i },
      ],
    },
    {
      id: 'srva07a', title: 'SRVA07A — Anti-malware on every system', from: 'CISO', points: 25, releaseAt: 120,
      prompt: 'Install free anti-malware on every Linux and Windows system, update its definitions, and run a test scan. Report the tool, the devices and the evidence.',
      model: 'ClamAV on Linux (apt/dnf + freshclam) and Windows (msi + freshclam): one free open-source tool for every OS. Definitions updated, scans of small folders only (no full scan on the DC), a table of devices, and screenshots.',
      rubric: [
        { label: 'names a free / open-source tool (e.g. ClamAV)', re: /clamav|clamscan|open[- ]source|free/i },
        { label: 'definitions updated (freshclam / signatures)', re: /freshclam|definition|signature/i },
        { label: 'covers Linux AND Windows systems', re: /(linux|rocky|ubuntu|debian)[\s\S]*(windows|server 20)|(windows|server 20)[\s\S]*(linux|rocky|ubuntu|debian)/i },
        { label: 'evidence of a scan (scan summary / infected files)', re: /scan|infected files|clamscan/i },
      ],
    },
    {
      id: 'banner', title: 'Inject — Legal login banner', from: 'Legal', points: 20, releaseAt: 240,
      prompt: 'Put a legal warning banner on every server and network device, shown before login, and explain the key elements it must contain.',
      model: 'Authorized use only; activity monitored and recorded; using the system means consent and no expectation of privacy; unauthorized use leads to discipline and prosecution; evidence may go to law enforcement; displayed BEFORE login (issue.net + sshd Banner, legalnoticecaption/text, PAN-OS login banner, VyOS pre-login banner).',
      rubric: [
        { label: 'authorized use only', re: /authori[sz]ed (use|users)/i },
        { label: 'monitoring and consent / no expectation of privacy', re: /monitor|consent|expectation of privacy/i },
        { label: 'consequences (discipline, civil, criminal prosecution)', re: /prosecut|disciplin|criminal|penalt/i },
        { label: 'shown before login on each device', re: /before (login|log ?on|sign)|pre-?login|issue\.net|legalnotice|banner/i },
      ],
    },
    {
      id: 'eval14a', title: 'EVAL14A — External service evaluation', from: 'CISO', points: 25, releaseAt: 360,
      prompt: 'Scan the external interface of the pod with an appropriate tool. List the services and protocols an attacker could use, and say whether each one needs to be exposed.',
      model: 'Nmap from Kali (outside the firewall) against your own 172.25.34.x only. Per host: open ports, service and protocol, needed or not. E.g. SSH on Ecom not needed (not scored); RPC 135, NetBIOS 139, HTTP/UPnP 80 and WinRM 5985 on MSSQL not needed; plain-text POP3/IMAP should move to 993/995; DC filtered entirely (blocks scored DNS/WinRM too).',
      rubric: [
        { label: 'names the tool (Nmap)', re: /\bnmap\b/i },
        { label: 'lists ports with their services/protocols', re: /\b(22|25|53|80|110|135|139|143|443|445|1433|3389|5985|8000|8089)\b/, min: 4 },
        { label: 'judges each service needed / not needed', re: /not needed|unnecessary|should (be )?(closed|not)|needed|required/i },
        { label: 'scans only your own team\'s addresses', re: /172\.25\.34\.|our (own )?(pod|team|addresses)|team 14/i },
      ],
    },
    {
      id: 'pcr', title: 'PCR — Domain user password change', from: 'White team (Quotient)', points: 25, releaseAt: 0,
      prompt: 'Your team wants to change the domain user passwords the scorer logs in with. Describe exactly how you do it without breaking scoring.',
      model: 'Open each Quotient credential list (DomainUsers, Splunk, MssqlService) and use its Usernames tab. Build username,password lines for exactly those names (one unknown name rejects the whole paste). Submit the PCR FIRST, then Set-ADAccountPassword in AD. Exclude every svc-* account. Watch one scoring round.',
      rubric: [
        { label: 'submits the PCR in Quotient first, then changes AD', re: /(pcr|quotient)[\s\S]{0,120}(first|before|then)|first[\s\S]{0,60}(pcr|quotient)/i },
        { label: 'uses the username,password CSV format', re: /username\s*,\s*password|csv/i },
        { label: 'uses the exact names from the credential lists (DomainUsers / Splunk)', re: /domainusers|splunk list|credential list|usernames tab/i },
        { label: 'excludes service accounts (svc-*)', re: /svc-|service account/i },
        { label: 'verifies the next scoring round', re: /round|verify|green|check quotient/i },
      ],
    },
  ],
};

withRecon(CCDC_LAB_4);

export default CCDC_LAB_4;
