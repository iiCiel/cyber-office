// CCDC hands-on scenario: "Cedarline Freight Co." — a 40-person freight brokerage whose IT you and your team
// inherit at 9:00 AM on competition morning. You do NOT pick answers: you open each box's own real terminal
// and TYPE the commands to inspect and harden it. Everything is fiction — RFC 5737 (198.51.100/24, 203.0.113/24)
// and RFC 1918 (10.10.10/24) addresses, invented hosts, canned output, nothing executed.
//
// Each device carries the ctx the inspection engine needs (a bash filesystem, or an AD model for PowerShell).
// Each finding lives on a device and declares:
//   fix:   accept (the correct hardening command, matched case-insensitively) OR steps[] for multi-command fixes
//   traps: plausible-but-wrong commands; a trap can drop scored services (a self-inflicted CCDC outage)
// The `why` lines are the coaching shown in guided mode and always in the debrief.

import { makeDirectory } from '../game/directory.js';
import { withRecon } from '../game/labCommands.js';

// --- the Active Directory model on dc01 (contains the planted rogue Domain Admin) -------------------------
const DC_DIR = makeDirectory({
  domain: 'cedarline.local',
  netbios: 'CEDARLINE',
  ous: [{ name: 'Cedarline' }, { name: 'Staff', parent: 'Cedarline' }, { name: 'ServiceAccounts', parent: 'Cedarline' }],
  groups: [{ name: 'Dispatch', ou: 'Staff', desc: 'Freight dispatch staff' }, { name: 'Accounting', ou: 'Staff', desc: 'Billing and accounts' }],
  users: [
    { sam: 'svc-backup', first: 'Backup', last: 'Service', ou: 'ServiceAccounts', desc: 'Nightly backup job (legitimate)', memberOf: ['Backup Operators'], created: '2021-05-02', pwdLastSet: '2026-08-01' },
    // Planted the week of the round, no documentation, sitting in Domain Admins — the backdoor to remove.
    { sam: 'svc-backup2', first: 'Backup', last: 'Svc2', ou: 'Users', desc: '', memberOf: ['Domain Admins'], created: '2026-10-28', pwdLastSet: '2026-10-28' },
    { sam: 'a.flores', first: 'Ana', last: 'Flores', ou: 'Staff', title: 'Dispatcher', memberOf: ['Dispatch'], pwdLastSet: '2026-07-14' },
    { sam: 'r.pike', first: 'Ron', last: 'Pike', ou: 'Staff', title: 'Accountant', memberOf: ['Accounting'], pwdLastSet: '2026-06-30' },
  ],
  computers: [
    { name: 'DC01', ip: '10.10.10.10', role: 'Domain Controller', os: 'Windows Server 2019' },
    { name: 'WS01', ip: '10.10.10.50', role: 'Workstation', os: 'Windows 10' },
  ],
});

// Box-specific inspection commands. The generic inventory commands (ss, systemctl, journalctl, iptables, ufw,
// last, …) come from labCommands.js via withRecon(); only the per-box specials (wp, crontab, mysql, postconf)
// are declared here.
const bashExtras = (overrides = {}) => ({ ...overrides });

export const CCDC_LAB = {
  id: 'cedarline-lab-2026',
  company: 'Cedarline Freight Co.',
  tagline: 'A 40-person freight brokerage. You and your team just took over IT at 9:00 AM — no documentation, a lot of bad habits, and a red team already connected.',
  clockSeconds: 900,
  slaPenalty: 15,
  injectWindow: 300, // default inject deadline (5 min) once released

  // Red team waves across the round (game-seconds elapsed). A wave probes the exploitable findings still open;
  // a finding probed in one wave and left open becomes a confirmed compromise at the next. Earlier = more time
  // pressure, exactly like the real event's escalating timeline.
  redWaves: [
    { n: 1, at: 180, label: 'external recon + default-credential sweep' },
    { n: 2, at: 450, label: 'exploiting what is still exposed' },
    { n: 3, at: 720, label: 'establishing persistence on anything unfixed' },
  ],

  // Password Change Request: the scoring engine logs into MySQL as ccdc-scorecheck. If you rotate that account's
  // password at the terminal without filing the PCR (inject 5), the DB check fails until the white team gets the
  // new credential. Ties a terminal action to an inject — a classic CCDC gotcha.
  pcr: {
    account: 'ccdc-scorecheck', host: 'db01', service: 'db01', injectId: 'pcr',
    rotateMatch: [/alter user/, /ccdc-scorecheck/, /identified by/],
  },

  // Scored services the engine polls from outside the firewall. Keep them UP. `proto`/`ports` drive the
  // firewall evaluation; `host` ties a service to the box it runs on.
  services: [
    { id: 'web01', name: 'Company website', proto: 'tcp', ports: [80, 443], host: 'web01', ip: '10.10.10.20', points: 120, check: 'GET / returns 200 (pages render from the shipments DB)' },
    { id: 'dc01', name: 'DNS', proto: 'any', ports: [53], host: 'dc01', ip: '10.10.10.10', points: 120, check: 'A-record lookups for cedarline.example resolve' },
    { id: 'mail01', name: 'Mail (SMTP + IMAP)', proto: 'tcp', ports: [25, 143, 993], host: 'mail01', ip: '10.10.10.30', points: 120, check: 'Authenticated send + mailbox fetch succeed' },
    { id: 'db01', name: 'Shipments database (MySQL)', proto: 'tcp', ports: [3306], host: 'db01', ip: '10.10.10.40', points: 120, check: 'The scoring engine logs in as ccdc-scorecheck and SELECTs from the DB' },
  ],

  // The devices you inherit, each with its own terminal. `kind` picks the engine: bash | pwsh | firewall.
  devices: [
    {
      id: 'edge-fw', name: 'Edge firewall', host: 'edge-fw', ip: '203.0.113.2', os: 'pfSense (FreeBSD)', role: 'network', kind: 'firewall',
      prompt: 'edge-fw rule-editor>',
      brief: 'The WAN rule set is a single permit-any-any (rule 1): the whole internet can reach every internal service. Add a pass rule for each scored port FIRST (MySQL only from the scoring engine, 198.51.100.9), then delete the any-any rule and set the default inbound policy to block.',
      // Every checklist item is a real command: clicking it loads exactly that line.
      checklist: [
        'show',
        'pass tcp to web01 port 80', 'pass tcp to web01 port 443',
        'pass any to dc01 port 53',
        'pass tcp to mail01 port 25', 'pass tcp to mail01 port 143', 'pass tcp to mail01 port 993',
        'pass tcp to db01 port 3306 from scoring',
        'del 1',
        'default block',
        'show',
      ],
      firewall: { default: 'pass', rules: [{ action: 'pass', proto: 'any', dst: 'any', port: 'any', from: 'any' }] },
    },
    {
      id: 'dc01', name: 'Domain controller', host: 'dc01', ip: '10.10.10.10', os: 'Windows Server 2019', role: 'windows', kind: 'pwsh',
      prompt: 'PS C:\\Users\\Administrator>', user: 'Administrator', cwd: 'C:\\Users\\Administrator',
      brief: 'The DC also serves DNS (a scored service), so NEVER reboot it mid-round. Find the extra Domain Admin and turn off SMBv1 without a restart.',
      checklist: [
        "Get-ADGroupMember 'Domain Admins'",
        'Get-ADUser svc-backup2 -Properties *',
        'Disable-ADAccount -Identity svc-backup2',
        "Remove-ADGroupMember -Identity 'Domain Admins' -Members svc-backup2 -Confirm:$false",
        'Get-SmbServerConfiguration',
        'Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force',
      ],
      ctx: {
        dir: DC_DIR, user: 'Administrator', host: 'DC01', fs: {}, cwd: 'C:\\Users\\Administrator',
        events: () => [],
        commands: {
          'get-smbserverconfiguration': () => [
            'EnableSMB1Protocol             : True',
            'EnableSMB2Protocol             : True',
            'EncryptData                    : False',
            'RejectUnencryptedAccess        : True',
          ],
        },
      },
    },
    {
      id: 'ws01', name: 'Accounting workstation', host: 'ws01', ip: '10.10.10.50', os: 'Windows 10', role: 'windows', kind: 'pwsh',
      prompt: 'PS C:\\Users\\accounting>', user: 'accounting', cwd: 'C:\\Users\\accounting',
      brief: 'The accounting teller PC. A prior intruder registered a scheduled task that re-launches their tooling at every logon. Find it with Get-ScheduledTask and remove it — leave the legitimate Windows tasks (GoogleUpdate, Defrag) alone.',
      checklist: [
        'Get-ScheduledTask',
        'Unregister-ScheduledTask -TaskName SystemCheck -Confirm:$false',
      ],
      recon: { tasks: [
        { TaskPath: '\\', TaskName: 'SystemCheck', State: 'Ready' },
        { TaskPath: '\\Microsoft\\Windows\\Defrag\\', TaskName: 'ScheduledDefrag', State: 'Ready' },
        { TaskPath: '\\', TaskName: 'GoogleUpdateTaskMachine', State: 'Ready' },
      ] },
      ctx: { dir: DC_DIR, user: 'accounting', host: 'WS01', fs: {}, cwd: 'C:\\Users\\accounting', events: () => [], commands: {} },
    },
    {
      id: 'web01', name: 'Web server', host: 'web01', ip: '10.10.10.20', os: 'Ubuntu 20.04 (Apache + WordPress)', role: 'webdb', kind: 'bash',
      prompt: 'analyst@web01:~$', user: 'analyst', cwd: '/home/analyst',
      brief: 'WordPress admin accepts admin/admin, and a prior intruder left a PHP file in the uploads folder that a root cron job re-runs every 10 minutes. Investigate, then clean up.',
      checklist: [
        'cat /var/www/html/wp-config.php',
        'wp user list',
        "wp user update admin --user_pass='Cedar#Lane-Freight-2026!'",
        'ls -R /var/www/html/wp-content/uploads',
        'crontab -l',
        'rm /var/www/html/wp-content/uploads/2026/10/stats.php',
        'crontab -r',
      ],
      ctx: {
        user: 'analyst', host: 'web01', cwd: '/home/analyst', history: [],
        fs: {
          '/home/analyst/README.txt': 'Cedarline web server. WordPress in /var/www/html. DB is on db01 (10.10.10.40).\n',
          '/var/www/html/wp-config.php': [
            "define( 'DB_NAME', 'cedar_wp' );",
            "define( 'DB_USER', 'wp_app' );",
            "define( 'DB_PASSWORD', 'wp_app_pw' );",
            "define( 'DB_HOST', '10.10.10.40' );   // db01",
            "define( 'AUTH_KEY', '...redacted...' );",
            '', '/* wp-admin login still accepts admin / admin — CHANGE THIS */', '',
          ].join('\n'),
          '/var/www/html/wp-content/uploads/2026/10/invoice.pdf': '%PDF-1.4 (a normal upload)\n',
          '/var/www/html/wp-content/uploads/2026/10/stats.php': '<?php /* NOT part of WordPress — left by a prior intrusion. Re-run by root cron every 10 min. (payload redacted in this simulation) */ ?>\n',
          '/var/spool/cron/crontabs/root': '*/10 * * * * php /var/www/html/wp-content/uploads/2026/10/stats.php >/dev/null 2>&1\n',
        },
        commands: bashExtras({
          wp: (args) => (args[0] === 'user' && args[1] === 'list'
            ? 'ID  user_login  display_name  roles\n1   admin       admin         administrator\n2   editor      Editor        editor\n'
            : 'usage: wp user list | wp user update <user> --user_pass=<pw>\n'),
          crontab: (args) => (args[0] === '-l'
            ? '*/10 * * * * php /var/www/html/wp-content/uploads/2026/10/stats.php >/dev/null 2>&1\n'
            : 'usage: crontab -l | crontab -r\n'),
        }),
      },
    },
    {
      id: 'db01', name: 'Database server', host: 'db01', ip: '10.10.10.40', os: 'Ubuntu 20.04 (MySQL 8)', role: 'webdb', kind: 'bash',
      prompt: 'analyst@db01:~$', user: 'analyst', cwd: '/home/analyst',
      brief: 'MySQL root password is "root" and it listens on 0.0.0.0 (every interface). Two legitimate clients need it: web01 on the LAN (10.10.10.20) and the scoring engine (198.51.100.9, through the edge firewall). Set a strong root password and ALLOW 3306 only from those sources — do NOT just deny 3306, or you cut off both of them.',
      checklist: [
        'grep bind-address /etc/mysql/mysql.conf.d/mysqld.cnf',
        "mysql -e \"ALTER USER 'root'@'localhost' IDENTIFIED BY 'Cedar#DB-Ship-2026!'\"",
        'ufw allow from 10.10.10.0/24 to any port 3306',
        'ufw allow from 198.51.100.9 to any port 3306',
      ],
      ctx: {
        user: 'analyst', host: 'db01', cwd: '/home/analyst', history: [],
        fs: {
          '/home/analyst/README.txt': 'Cedarline shipments DB (MySQL 8). Clients: web01 (10.10.10.20) and the scoring engine.\n',
          '/etc/mysql/mysql.conf.d/mysqld.cnf': '[mysqld]\nuser = mysql\nbind-address = 0.0.0.0        # listens on EVERY interface — far wider than needed\nport = 3306\n',
        },
        commands: bashExtras({
          mysql: (args) => (args.join(' ').toLowerCase().includes('select')
            ? 'id  origin  destination\n1   CLE     COL\n2   AKR     CIN\n'
            : 'mysql: use -e "<SQL>" to run a statement (simulated)\n'),
        }),
      },
    },
    {
      id: 'mail01', name: 'Mail server', host: 'mail01', ip: '10.10.10.30', os: 'Ubuntu 20.04 (Postfix + Dovecot)', role: 'linux', kind: 'bash',
      prompt: 'analyst@mail01:~$', user: 'analyst', cwd: '/home/analyst',
      brief: 'Two problems. Postfix is an open relay (mynetworks = 0.0.0.0/0 relays for the entire internet): scope it to the LAN — do NOT just close port 25, or scored mail stops too. And a prior intruder left an SSH key in root\u2019s authorized_keys with root login allowed: remove the key, turn off root login, and reload sshd.',
      checklist: [
        'grep mynetworks /etc/postfix/main.cf',
        'postconf -e "mynetworks=10.10.10.0/24, 127.0.0.0/8"',
        'grep PermitRootLogin /etc/ssh/sshd_config',
        'cat /root/.ssh/authorized_keys',
        "sed -i '/redteam@/d' /root/.ssh/authorized_keys",
        "sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config",
        'systemctl reload ssh',
      ],
      ctx: {
        user: 'analyst', host: 'mail01', cwd: '/home/analyst', history: [],
        fs: {
          '/home/analyst/README.txt': 'Cedarline mail (Postfix + Dovecot). SMTP 25, IMAP 143/993.\n',
          '/etc/ssh/sshd_config': 'Port 22\nPermitRootLogin yes        # root can log in over SSH — with the planted key below, that is a backdoor\nPasswordAuthentication yes\nPubkeyAuthentication yes\n',
          '/root/.ssh/authorized_keys': 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExAmPlEkEyForTheSimulationOnly0000000000000 redteam@203.0.113.66\n',
          '/etc/postfix/main.cf': 'myhostname = mail01.cedarline.local\nmynetworks = 0.0.0.0/0        # OPEN RELAY — relays for the whole internet\nsmtpd_relay_restrictions = permit_mynetworks permit_sasl_authenticated defer_unauth_destination\ninet_interfaces = all\n',
        },
        commands: bashExtras({
          postconf: (args) => {
            const a = args.join(' ');
            if (/^-?e?\s*mynetworks/i.test(a) || args[0] === 'mynetworks') return 'mynetworks = 0.0.0.0/0\n';
            return 'postconf: read a parameter (postconf mynetworks) or set one (postconf -e "key=value")\n';
          },
        }),
      },
    },
  ],

  findings: [
    {
      id: 'firewall-anyany', host: 'edge-fw', title: 'Edge firewall allows any-to-any inbound', severity: 'Critical',
      teach: 'Default-deny is the goal, but ORDER matters more than the goal: allow the scored ports first, then deny the rest, or you take down all four services with one rule.',
      exploitable: true, compromise: { impact: 'Every exposed internal service (RDP, SMB, MySQL) is reachable from the red team.', penalty: 50 },
      fw: {
        scored: ['web01', 'dc01', 'mail01', 'db01'],
        scoringIp: '198.51.100.9',
        services: [
          { id: 'web01', host: 'web01', ip: '10.10.10.20', proto: 'tcp', ports: [80, 443] },
          { id: 'dc01', host: 'dc01', ip: '10.10.10.10', proto: 'any', ports: [53] },
          { id: 'mail01', host: 'mail01', ip: '10.10.10.30', proto: 'tcp', ports: [25, 143, 993] },
          // MySQL is only polled by the scoring engine; it must never be open to the whole internet.
          { id: 'db01', host: 'db01', ip: '10.10.10.40', proto: 'tcp', ports: [3306], src: 'scoring' },
        ],
      },
      fix: { restores: ['web01', 'dc01', 'mail01', 'db01'], why: 'Allow-list exactly the scored ports per host first (MySQL only "from scoring"), then delete the any-any rule and set the default inbound policy to block. "to any", "port any" or 1-65535 is still wide open. (web01→db01 traffic is LAN and never crosses the edge; restrict that on db01 instead.)' },
      traps: [],
    },
    {
      id: 'web-admin-default', host: 'web01', title: 'WordPress admin uses a default password', severity: 'Critical',
      teach: 'Default/guessable admin passwords are the number-one way red teams get in. Rotating them is the highest-value early action.',
      exploitable: true, compromise: { impact: 'Red team logs into wp-admin and defaces the site / plants a backdoor plugin.', penalty: 60, drops: ['web01'] },
      fix: {
        accept: [[/wp user update/, /user[_ ]?pass/]],
        output: ['Success: Updated the admin user. wp-admin now requires a strong, unique password.'],
        why: 'wp-cli (`wp user update admin --user_pass ...`) rotates the password in place. Verify no other admin accounts exist in the same pass.',
      },
      traps: [
        { id: 'rename', match: [[/wp user/, /rename/]], output: ['A rename changes the login name only — the password is still "admin".'], why: 'Obscurity is not a control. Rotate the password, do not just rename the account.' },
      ],
    },
    {
      id: 'web-shell', host: 'web01', title: 'Web shell + root cron left by a prior intrusion', severity: 'High', reportableBy: 'incident-report',
      teach: 'Persistence must be removed AND its trigger closed, or it simply reappears. Remove the file and the cron entry together.',
      exploitable: true, compromise: { impact: 'The cron re-opens the attacker’s access every 10 minutes regardless of your other fixes.', penalty: 45 },
      fix: {
        steps: [
          { id: 'rm-file', accept: [/rm /, /stats\.php/], label: 'Removed the web shell', output: ['removed ‘/var/www/html/wp-content/uploads/2026/10/stats.php’'], todo: 'delete the stats.php web shell' },
          { id: 'rm-cron', accept: [/crontab/, /-r|remove/], label: 'Cleared the malicious root cron', output: ['root crontab removed — the re-drop job is gone.'], todo: 'remove the root cron entry (crontab -r)' },
        ],
        why: 'Pull the payload (the .php file) AND its trigger (the root cron). Then block PHP execution in the uploads directory so it cannot come back.',
      },
      traps: [
        { id: 'file-only', match: [[/rm /, /invoice\.pdf/]], output: ['That removed a normal upload (invoice.pdf), not the web shell.'], why: 'Read the filenames: the backdoor is stats.php. invoice.pdf is a legitimate upload.' },
      ],
    },
    {
      id: 'mysql-exposed', host: 'db01', title: 'MySQL root password is "root" and it listens on every interface', severity: 'Critical',
      teach: 'Two problems: a trivial password and a service exposed far wider than it needs to be. Fix both without cutting off the clients that legitimately need it (web01 and the scoring engine).',
      exploitable: true, compromise: { impact: 'Red team connects to MySQL directly and dumps/alters the shipments table.', penalty: 55 },
      fix: {
        steps: [
          { id: 'root-pw', accept: [/alter user/, /root/, /identified by/], label: 'Set a strong root password', output: ['Query OK, 0 rows affected — root now has a strong, unique password.'], todo: "set a strong root password (ALTER USER 'root'@'localhost' IDENTIFIED BY ...)" },
          { id: 'restrict', accept: [/ufw/, /3306/, /\ballow\b/, /from (10\.10\.10\.|198\.51\.100\.9\b)/], reject: [/\b(deny|reject|drop|block)\b/, /from any\b|0\.0\.0\.0\/0/], label: 'Restricted 3306 to the LAN clients', output: ['Rule added: allow 3306 from 10.10.10.0/24; the internet can no longer reach MySQL.'], todo: 'restrict port 3306 to the LAN (ufw allow from 10.10.10.0/24 to any port 3306)' },
        ],
        restores: ['db01'],
        why: 'A strong root password plus a host-firewall rule that lets only web01 and the scoring engine reach 3306. The DB stays reachable by exactly the clients that need it.',
      },
      traps: [
        { id: 'deny-all-3306', match: [[/ufw/, /3306/, /deny|reject/]], drops: ['db01', 'web01'], note: 'Port 3306 blocked outright; web01 and the scoring engine can no longer reach the DB.', output: ['ufw: rule added — DENY 3306.'], why: 'Blocking 3306 for everyone cuts off the two legitimate clients too, dropping the database AND the website. Restrict by source, do not deny the port.' },
      ],
    },
    {
      id: 'mail-open-relay', host: 'mail01', title: 'Postfix is configured as an open relay', severity: 'High',
      teach: 'An open relay gets you blocklisted and used for spam. Scope relaying to your own network and authenticated users without breaking legitimate send/receive (a scored service).',
      exploitable: true, compromise: { impact: 'Red team relays spam through your server; the domain gets blocklisted.', penalty: 35 },
      fix: {
        accept: [[/postconf/, /mynetworks/, /10\.10\.10/]],
        output: ['postconf: set mynetworks = 10.10.10.0/24, 127.0.0.0/8', 'Relaying is now scoped to the LAN and authenticated users; open relaying is refused.'],
        restores: ['mail01'],
        why: 'postconf -e "mynetworks=10.10.10.0/24, 127.0.0.0/8" scopes relaying to your hosts; SASL covers roaming users. The scored send/receive path is untouched.',
      },
      traps: [
        { id: 'block-25', match: [[/ufw|iptables/, /25/, /deny|drop|reject|block/]], drops: ['mail01'], note: 'Port 25 blocked; SMTP delivery and the scored mail check both fail.', output: ['Rule added — DROP 25.'], why: 'Closing the mail port stops the abuse and the service you are scored on. Fix the relay config, do not kill the port.' },
      ],
    },
    {
      id: 'ssh-root-key', host: 'mail01', title: 'Planted SSH key + root login on the mail server', severity: 'High',
      teach: 'An authorized_keys entry is persistence that survives every password change. Remove the key, stop root logging in over SSH, and reload sshd so the change takes effect.',
      exploitable: true, compromise: { impact: 'Red team SSHes in as root with its planted key and owns the mail server.', penalty: 45, drops: ['mail01'] },
      fix: {
        steps: [
          { id: 'rm-key', accept: [/authorized_keys/, /\brm\b|truncate|sed -i|>\s*\/root/], label: 'Removed the planted SSH key', output: ['Removed the redteam@203.0.113.66 key from /root/.ssh/authorized_keys.'], todo: 'remove the planted key from /root/.ssh/authorized_keys' },
          { id: 'no-root', accept: [/sshd_config|permitrootlogin/, /permitrootlogin\s+(no|prohibit-password)/], label: 'Turned off SSH root login', output: ['sshd_config: PermitRootLogin no'], todo: 'set PermitRootLogin no in /etc/ssh/sshd_config' },
          { id: 'reload', accept: [/systemctl|service/, /reload|restart/, /\bssh/], label: 'Reloaded sshd', output: ['sshd reloaded — the new config is live. Existing sessions keep working.'], todo: 'reload sshd (systemctl reload ssh)' },
        ],
        why: 'Delete the attacker key from root\u2019s authorized_keys, set PermitRootLogin no, and reload sshd. A config change that is never reloaded protects nothing.',
      },
      traps: [
        { id: 'lock-root-pw', match: [[/passwd/, /-l/, /root/]], output: ['Root\u2019s password is locked — but key-based login does not use the password. The planted key still works.'], why: 'Locking the password does not stop SSH key logins. Remove the key itself.' },
        { id: 'stop-postfix', match: [[/systemctl/, /stop/, /postfix/]], drops: ['mail01'], note: 'Postfix stopped; the scored mail check fails.', output: ['postfix stopped.'], why: 'The backdoor is in SSH, not Postfix. Stopping the mail service drops a scored service and fixes nothing.' },
      ],
    },
    {
      id: 'rogue-da', host: 'dc01', title: 'An extra Domain Admin account you did not create', severity: 'Critical',
      teach: 'A rogue privileged account survives every password reset. Finding and removing extra admins is a top-three first-15-minute task.',
      exploitable: true, compromise: { impact: 'Red team signs in as the hidden Domain Admin and re-owns the domain after your other fixes.', penalty: 65 },
      fix: {
        steps: [
          { id: 'disable', accept: [/disable-adaccount/, /svc-backup2/], label: 'Disabled svc-backup2', output: ['svc-backup2 disabled — it can no longer sign in.'], todo: 'disable the account (Disable-ADAccount -Identity svc-backup2)' },
          { id: 'remove', accept: [/remove-adgroupmember/, /domain admins/, /svc-backup2/], label: 'Removed svc-backup2 from Domain Admins', output: ['svc-backup2 removed from Domain Admins. The real svc-backup account is untouched.'], todo: "remove it from Domain Admins (Remove-ADGroupMember -Identity 'Domain Admins' -Members svc-backup2)" },
        ],
        why: 'Remove-ADGroupMember -Identity "Domain Admins" -Members svc-backup2 (disable it first). Verify it is not referenced by any real service before deleting.',
      },
      traps: [
        { id: 'wrong-account', match: [[/remove-adgroupmember/, /svc-backup\b/], [/disable-adaccount/, /svc-backup\b/]], output: ['That targets svc-backup — the LEGITIMATE nightly backup account. Backups would start failing.'], why: 'Read the names carefully: the backdoor is svc-backup2. Removing svc-backup breaks a business function and leaves the backdoor in place.' },
      ],
    },
    {
      id: 'smbv1-dc', host: 'dc01', title: 'SMBv1 enabled on the domain controller', severity: 'High',
      teach: 'Turn off the dangerous legacy protocol, but do NOT reboot the DC mid-round: DNS lives on it. The protocol switch needs no restart; removing the Windows feature does.',
      exploitable: true, compromise: { impact: 'Red team uses an SMBv1 exploit to run code on the DC.', penalty: 45, drops: ['dc01'] },
      fix: {
        accept: [[/set-smbserverconfiguration/, /enablesmb1protocol/, /\$false/]],
        output: ['EnableSMB1Protocol set to False. The DC stops accepting SMBv1 immediately — no reboot, DNS keeps serving.'],
        restores: ['dc01'],
        why: 'Set-SmbServerConfiguration -EnableSMB1Protocol $false closes the hole with no restart. Schedule the SMB1 feature removal (which needs a reboot) for a maintenance window.',
      },
      traps: [
        { id: 'reboot', match: [/restart-computer/, [/shutdown/, /\/r|-r/]], drops: ['dc01'], note: 'The DC rebooted mid-round; DNS was down for the whole restart.', output: ['Restarting DC01... DNS will be unavailable until it comes back.'], why: 'A reboot of the DC takes DNS (a scored service) offline for minutes. Disable the protocol with the no-reboot setting instead.' },
      ],
    },
    {
      id: 'ws-schtask', host: 'ws01', title: 'Malicious scheduled task on the accounting workstation', severity: 'High',
      teach: 'A scheduled task is a common persistence spot. Removing it closes a logon-triggered re-entry — but confirm the task is not a legitimate one first.',
      exploitable: true, compromise: { impact: 'The task re-launches the attacker’s access at every logon and gives a workstation foothold to pivot from.', penalty: 40 },
      fix: {
        accept: [[/unregister-scheduledtask|schtasks \/delete/, /systemcheck/]],
        output: ['Scheduled task "SystemCheck" removed — the logon-triggered persistence is gone.'],
        why: 'Unregister-ScheduledTask -TaskName SystemCheck removes the planted task. Verify the legitimate tasks (GoogleUpdate, Defrag) are untouched.',
      },
      traps: [
        { id: 'wrong-task', match: [[/unregister-scheduledtask|schtasks \/delete/, /googleupdate|defrag/]], output: ['That removes a legitimate Windows maintenance task, not the planted one.'], why: 'The planted task is SystemCheck. Removing GoogleUpdate/Defrag breaks normal maintenance and leaves the persistence in place.' },
      ],
    },
  ],

  // Written business injects — the IR / captain seat drafts a deliverable. Each is graded against a rubric (the
  // items a white-team judge looks for) with partial credit; blanks are refused and filler earns nothing.
  // These stay as written tasks (real CCDC injects are written); the core defending is done at the terminals.
  injects: [
    {
      id: 'inv-memo', title: 'Inject 1 — Asset inventory memo', from: 'Operations Manager', points: 25, releaseAt: 0,
      prompt: 'Management has no idea what is on the network. Draft an asset inventory (host, IP, OS, role, service) they can hand the auditor by noon.',
      model: 'A table: each host with its IP, OS, role and the service it provides. An auditor can act on it and it is your own map for the round.',
      rubric: [
        { label: 'names at least 4 hosts (edge-fw, dc01, web01, db01, mail01)', re: /\b(edge-fw|dc01|web01|db01|mail01)\b/i, min: 4 },
        { label: 'gives their IP addresses', re: /\b(10\.10\.10\.\d{1,3}|203\.0\.113\.\d{1,3})\b/, min: 3 },
        { label: 'states the operating systems', re: /windows|ubuntu|linux|pfsense|freebsd/i },
        { label: 'states each box’s role / scored service', re: /\b(dns|smtp|imap|mail|mysql|database|web|wordpress|apache|domain controller|firewall)\b/i, min: 3 },
      ],
    },
    {
      id: 'new-user', title: 'Inject 2 — New hire account (least privilege)', from: 'HR', points: 25, releaseAt: 120,
      prompt: 'A new accounting clerk starts today. Describe exactly how you create their account with the access they need and nothing more.',
      model: 'A standard domain user added only to the Accounting group that owns the shared folder they need — not a Domain Admin, not local admin everywhere.',
      rubric: [
        { label: 'creates a standard domain user (e.g. New-ADUser)', re: /new-aduser|domain user|standard user|regular user|user account/i },
        { label: 'adds them only to the Accounting group', re: /accounting/i },
        { label: 'explicitly no admin rights / least privilege', re: /least[- ]privilege|not (a |an )?(domain |local )?admin|no admin|without admin|non-?admin/i },
        { label: 'secure first password (change at next logon / temporary)', re: /change.{0,30}(first|next) (logon|login|sign)|changepasswordatlogon|temporar|one-time/i },
      ],
    },
    {
      id: 'vendor-ftp', title: 'Inject 3 — Vendor file-transfer request', from: 'Vendor (Northgate Logistics)', points: 25, releaseAt: 300,
      prompt: 'A partner asks you to "open FTP, port 21, to the internet" so they can drop manifest files. Write your response.',
      model: 'Offer SFTP (port 22) to a scoped, dedicated account instead of plaintext FTP open to the world — the secure "yes, but".',
      rubric: [
        { label: 'offers SFTP instead of FTP', re: /\bsftp\b|ssh file transfer/i },
        { label: 'names port 22', re: /\b22\b/ },
        { label: 'explains why plain FTP is refused (cleartext credentials)', re: /plain ?text|clear ?text|unencrypted|not encrypted|in the clear/i },
        { label: 'a dedicated, scoped account for the vendor', re: /dedicated|separate account|own account|scoped|chroot|upload[- ]only|restricted account/i },
        { label: 'restricts by the vendor’s source IP', re: /source ip|their ip|allow-?list|whitelist|ip address|from (their|the vendor|northgate)/i },
      ],
    },
    {
      id: 'incident-report', title: 'Inject 4 — Incident report', from: 'CEO', points: 25, releaseAt: 420,
      prompt: 'You found a web shell on the web server. Write the incident report the CEO asked for.',
      model: 'Structured: what was found, when, affected systems, actions taken, and a recommendation. Facts and remediation, not blame.',
      rubric: [
        { label: 'what was found (the web shell, stats.php)', re: /web ?shell|stats\.php|backdoor/i },
        { label: 'when it was found / timeline', re: /\b\d{1,2}:\d{2}\b|\b(am|pm)\b|timeline|this morning|at \d/i },
        { label: 'the affected system (web01)', re: /web01|web server|wordpress/i },
        { label: 'actions taken (removed the file and the root cron)', re: /(remov|delet|clean)[^.]{0,60}(cron|stats\.php|file|shell)|crontab/i },
        { label: 'a recommendation to prevent recurrence', re: /recommend|going forward|prevent|next step/i },
      ],
    },
    {
      id: 'pcr', title: 'Inject 5 — Change request for the scored account', from: 'White team (judges)', points: 25, releaseAt: 0,
      prompt: 'You must rotate the ccdc-scorecheck password. Submit the required change request so scoring is not interrupted.',
      model: 'A PCR naming the host, account, change, time window, rollback plan, and the new credential handed to the scoring team.',
      rubric: [
        { label: 'names the account (ccdc-scorecheck)', re: /ccdc-scorecheck/i },
        { label: 'names the host (db01)', re: /db01|10\.10\.10\.40|database server/i },
        { label: 'a change time window', re: /window|\b\d{1,2}:\d{2}\b|between/i },
        { label: 'a rollback plan', re: /roll ?back|revert|back ?out|restore the old/i },
        { label: 'hands the new credential to the white / scoring team', re: /white team|scoring team|judges|scoring engine|notify/i },
      ],
    },
  ],
};

withRecon(CCDC_LAB);

export default CCDC_LAB;
