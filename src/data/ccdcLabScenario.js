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

// A couple of inspection-only shell commands per Linux box, so investigating (not just fixing) feels real.
const bashExtras = (overrides = {}) => ({
  ufw: (args) => (args[0] === 'status' || !args.length
    ? 'Status: active\nTo                         Action      From\n--                         ------      ----\n(no rules — default allow inbound)\n'
    : `ufw: added rule (simulated): ${args.join(' ')}\n`),
  systemctl: (args) => `${args[1] || 'service'} — active (running) [simulated]\n`,
  ...overrides,
});

export const CCDC_LAB = {
  id: 'cedarline-lab-2026',
  company: 'Cedarline Freight Co.',
  tagline: 'A 40-person freight brokerage. You and your team just took over IT at 9:00 AM — no documentation, a lot of bad habits, and a red team already connected.',
  clockSeconds: 900,
  slaPenalty: 15,

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
      brief: 'The WAN rule set is a single permit-any-any: the whole internet can reach every internal service. Allow the scored ports first, THEN set the default inbound policy to block.',
      checklist: ['Type `show` to read the current rules', 'Add `pass` rules for every scored port (80/443→web01, 53→dc01, 25/143/993→mail01, 3306→db01)', 'Only then `default block`', 'Re-run `show` to confirm'],
      firewall: { default: 'pass', rules: [{ action: 'pass', proto: 'any', dst: 'any', port: 'any', from: 'any' }] },
    },
    {
      id: 'dc01', name: 'Domain controller', host: 'dc01', ip: '10.10.10.10', os: 'Windows Server 2019', role: 'windows', kind: 'pwsh',
      prompt: 'PS C:\\Users\\Administrator>', user: 'Administrator', cwd: 'C:\\Users\\Administrator',
      brief: 'The DC also serves DNS (a scored service), so NEVER reboot it mid-round. Find the extra Domain Admin and turn off SMBv1 without a restart.',
      checklist: ["Get-ADGroupMember 'Domain Admins'  — spot the account you did not create", 'Remove the rogue account from Domain Admins (disable it first)', 'Get-SmbServerConfiguration  — check EnableSMB1Protocol', 'Set-SmbServerConfiguration -EnableSMB1Protocol $false  (no reboot)'],
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
      id: 'web01', name: 'Web server', host: 'web01', ip: '10.10.10.20', os: 'Ubuntu 20.04 (Apache + WordPress)', role: 'webdb', kind: 'bash',
      prompt: 'analyst@web01:~$', user: 'analyst', cwd: '/home/analyst',
      brief: 'WordPress admin accepts admin/admin, and a prior intruder left a PHP file in the uploads folder that a root cron job re-runs every 10 minutes. Investigate, then clean up.',
      checklist: ['cat /var/www/html/wp-config.php', 'ls -R /var/www/html/wp-content/uploads', 'cat /var/spool/cron/crontabs/root', 'wp user update admin --user_pass <strong>', 'rm the web shell, then crontab -r'],
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
      brief: 'MySQL root password is "root" and it listens on 0.0.0.0 (every interface). Two legitimate clients need it over the LAN: web01 and the scoring engine. Set a strong root password and restrict the port — do NOT just block 3306, or you cut off both of them.',
      checklist: ['grep bind-address /etc/mysql/mysql.conf.d/mysqld.cnf', "mysql -e \"ALTER USER 'root'@'localhost' IDENTIFIED BY '<strong>'\"", 'ufw allow from 10.10.10.0/24 to any port 3306  (LAN clients only)'],
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
      brief: 'Postfix is an open relay: mynetworks = 0.0.0.0/0 means it relays mail for the entire internet. Scope relaying to the LAN and authenticated users — do NOT just close port 25, or legitimate mail (a scored service) stops too.',
      checklist: ['grep mynetworks /etc/postfix/main.cf', 'postconf -e "mynetworks=10.10.10.0/24, 127.0.0.0/8"'],
      ctx: {
        user: 'analyst', host: 'mail01', cwd: '/home/analyst', history: [],
        fs: {
          '/home/analyst/README.txt': 'Cedarline mail (Postfix + Dovecot). SMTP 25, IMAP 143/993.\n',
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
        services: [
          { id: 'web01', host: 'web01', proto: 'tcp', ports: [80, 443] },
          { id: 'dc01', host: 'dc01', proto: 'any', ports: [53] },
          { id: 'mail01', host: 'mail01', proto: 'tcp', ports: [25, 143, 993] },
          { id: 'db01', host: 'db01', proto: 'tcp', ports: [3306] },
        ],
      },
      fix: { restores: ['web01', 'dc01', 'mail01', 'db01'], why: 'Allow-list the scored services first, then set the default inbound policy to block. (web01→db01 traffic is LAN and never crosses the edge; restrict that on db01 instead.)' },
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
      id: 'web-shell', host: 'web01', title: 'Web shell + root cron left by a prior intrusion', severity: 'High',
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
          { id: 'restrict', accept: [/ufw/, /3306/, /allow|from|10\.10\.10/], label: 'Restricted 3306 to the LAN clients', output: ['Rule added: allow 3306 from 10.10.10.0/24; the internet can no longer reach MySQL.'], todo: 'restrict port 3306 to the LAN (ufw allow from 10.10.10.0/24 to any port 3306)' },
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
      id: 'rogue-da', host: 'dc01', title: 'An extra Domain Admin account you did not create', severity: 'Critical',
      teach: 'A rogue privileged account survives every password reset. Finding and removing extra admins is a top-three first-15-minute task.',
      exploitable: true, compromise: { impact: 'Red team signs in as the hidden Domain Admin and re-owns the domain after your other fixes.', penalty: 65 },
      fix: {
        accept: [[/remove-adgroupmember/, /svc-backup2/], [/disable-adaccount/, /svc-backup2/]],
        output: ['svc-backup2 removed from Domain Admins (and disabled). The real svc-backup account is untouched.'],
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
  ],

  // Written business injects — the IR / captain seat drafts a deliverable; full marks for a submitted answer.
  // These stay as written tasks (real CCDC injects are written); the core defending is done at the terminals.
  injects: [
    { id: 'inv-memo', title: 'Inject 1 — Asset inventory memo', from: 'Operations Manager', points: 25, prompt: 'Management has no idea what is on the network. Draft an asset inventory (host, IP, OS, role, service) they can hand the auditor by noon.', model: 'A table: each host with its IP, OS, role and the service it provides. An auditor can act on it and it is your own map for the round.' },
    { id: 'new-user', title: 'Inject 2 — New hire account (least privilege)', from: 'HR', points: 25, prompt: 'A new accounting clerk starts today. Describe exactly how you create their account with the access they need and nothing more.', model: 'A standard domain user added only to the Accounting group that owns the shared folder they need — not a Domain Admin, not local admin everywhere.' },
    { id: 'vendor-ftp', title: 'Inject 3 — Vendor file-transfer request', from: 'Vendor (Northgate Logistics)', points: 25, prompt: 'A partner asks you to "open FTP, port 21, to the internet" so they can drop manifest files. Write your response.', model: 'Offer SFTP (port 22) to a scoped, dedicated account instead of plaintext FTP open to the world — the secure "yes, but".' },
    { id: 'incident-report', title: 'Inject 4 — Incident report', from: 'CEO', points: 25, prompt: 'You found a web shell on the web server. Write the incident report the CEO asked for.', model: 'Structured: what was found, when, affected systems, actions taken, and a recommendation. Facts and remediation, not blame.' },
    { id: 'pcr', title: 'Inject 5 — Change request for the scored account', from: 'White team (judges)', points: 25, prompt: 'You must rotate the ccdc-scorecheck password. Submit the required change request so scoring is not interrupted.', model: 'A PCR naming the host, account, change, time window, rollback plan, and the new credential handed to the scoring team.' },
  ],
};

export default CCDC_LAB;
