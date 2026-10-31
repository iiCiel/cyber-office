// Second CCDC hands-on scenario: "Harbor Point Credit Union" — a small community credit union whose IT you and
// your team inherit at 9:00 AM on competition morning. Same hands-on model as Cedarline (open each box's own
// terminal and TYPE the commands) but a different company: a Windows teller WORKSTATION, a PostgreSQL database,
// Print Spooler on the domain controller (PrintNightmare), an exposed .git folder leaking DB creds, and a
// planted local-admin account. Everything is fiction — RFC 5737 (203.0.113/24) and RFC 1918 (10.20.30/24)
// addresses, invented hosts, canned output, nothing executed.

import { makeDirectory } from '../game/directory.js';
import { withRecon } from '../game/labCommands.js';

// --- the Active Directory model on dc01 --------------------------------------------------------------------
const DC_DIR = makeDirectory({
  domain: 'harborpoint.local',
  netbios: 'HARBORPT',
  ous: [{ name: 'HarborPoint' }, { name: 'Tellers', parent: 'HarborPoint' }, { name: 'ServiceAccounts', parent: 'HarborPoint' }],
  groups: [
    { name: 'Account Operators', builtin: 548, desc: 'Members can administer domain user and group accounts' },
    { name: 'Tellers', ou: 'Tellers', desc: 'Branch teller staff' },
  ],
  users: [
    { sam: 'svc-sql', first: 'SQL', last: 'Service', ou: 'ServiceAccounts', desc: 'Member-portal DB service account (legitimate)', pwdLastSet: '2026-08-10' },
    { sam: 'j.okafor', first: 'Joy', last: 'Okafor', ou: 'Tellers', title: 'Teller', memberOf: ['Tellers'], pwdLastSet: '2026-07-01' },
    { sam: 'm.reyes', first: 'Marco', last: 'Reyes', ou: 'Tellers', title: 'Head Teller', memberOf: ['Tellers'], pwdLastSet: '2026-06-18' },
  ],
  computers: [
    { name: 'DC01', ip: '10.20.30.10', role: 'Domain Controller', os: 'Windows Server 2022' },
    { name: 'WS01', ip: '10.20.30.55', role: 'Workstation', os: 'Windows 10' },
  ],
});
// The Guest account ships disabled; the red team re-enabled it and slipped it into Account Operators the week of
// the round — a privileged backdoor that hides in plain sight.
DC_DIR.setEnabled('Guest', true);
DC_DIR.addMember('Account Operators', 'Guest');

// Shared inspection commands for the Linux boxes: the recon a real competitor runs before touching anything.
const bashExtras = (overrides = {}) => ({
  ss: (args) => {
    const a = args.join(' ');
    const rows = overrides._listen || 'State   Recv-Q  Send-Q  Local Address:Port   Process\nLISTEN  0       128     0.0.0.0:22           users:(("sshd"))\n';
    return /(-l|-t|-u|-n|-p|-a)/.test(a) || !a ? rows : rows;
  },
  netstat: (args) => (overrides._listen || 'Active Internet connections\nProto Local Address      State\ntcp   0.0.0.0:22          LISTEN\n'),
  ps: () => 'USER   PID  COMMAND\nroot     1  /sbin/init\nroot   540  /usr/sbin/sshd -D\n',
  systemctl: (args) => `${args[1] || 'unit'} — loaded, active (running) [simulated]\n`,
  ufw: (args) => (args[0] === 'status' || !args.length
    ? 'Status: active\nTo                         Action      From\n--                         ------      ----\n(no rules — default allow inbound)\n'
    : `ufw: added rule (simulated): ${args.join(' ')}\n`),
  find: undefined, // keep the real find from shellplus
  ...overrides,
});
// strip the undefined key so we don't shadow the real `find`
const bx = (o = {}) => { const e = bashExtras(o); delete e.find; return e; };

// Canned Windows recon output shared by the two Windows boxes.
const winCommands = (extra = {}) => ({
  netstat: () => '\nActive Connections\n\n  Proto  Local Address          State           PID\n  TCP    0.0.0.0:3389           LISTENING       1044\n  TCP    0.0.0.0:445            LISTENING       4\n  TCP    0.0.0.0:135            LISTENING       920\n',
  ...extra,
});

export const CCDC_LAB_2 = {
  id: 'harborpoint-lab-2026',
  company: 'Harbor Point Credit Union',
  tagline: 'A two-branch community credit union. You and your team just took over IT at 9:00 AM — a Windows domain, a member portal, a teller workstation and a database, all with bad habits the red team already knows about.',
  clockSeconds: 900,
  slaPenalty: 15,
  injectWindow: 300,

  redWaves: [
    { n: 1, at: 180, label: 'default-credential + exposed-service sweep' },
    { n: 2, at: 450, label: 'exploiting what is still open' },
    { n: 3, at: 720, label: 'persistence + lateral movement to the teller workstation' },
  ],

  pcr: {
    account: 'hp-scorecheck', host: 'db01', service: 'db', injectId: 'pcr',
    rotateMatch: [/alter (user|role)/, /hp-scorecheck/, /password/],
  },

  services: [
    { id: 'web', name: 'Member website', proto: 'tcp', ports: [80, 443], host: 'app01', ip: '10.20.30.20', points: 120, check: 'GET / returns 200 and the login page renders' },
    { id: 'api', name: 'Member portal API', proto: 'tcp', ports: [8443], host: 'app01', ip: '10.20.30.20', points: 120, check: 'GET /api/health returns 200 over TLS' },
    { id: 'dns', name: 'DNS', proto: 'any', ports: [53], host: 'dc01', ip: '10.20.30.10', points: 120, check: 'A-record lookups for harborpoint.example resolve' },
    { id: 'db', name: 'Member database (PostgreSQL)', proto: 'tcp', ports: [5432], host: 'db01', ip: '10.20.30.40', points: 120, check: 'The scoring engine logs in as hp-scorecheck and SELECTs' },
  ],

  devices: [
    {
      id: 'edge-fw', name: 'Edge firewall', host: 'edge-fw', ip: '203.0.113.3', os: 'pfSense (FreeBSD)', role: 'network', kind: 'firewall',
      prompt: 'edge-fw rule-editor>',
      brief: 'The WAN rule set is a single permit-any-any (rule 1): the whole internet can reach every internal host, including RDP on the teller workstation and PostgreSQL. Add a pass rule for each scored port FIRST (PostgreSQL only from the scoring engine, 198.51.100.9), then delete the any-any rule and set the default inbound policy to block.',
      checklist: [
        'show',
        'pass tcp to app01 port 80', 'pass tcp to app01 port 443', 'pass tcp to app01 port 8443',
        'pass any to dc01 port 53',
        'pass tcp to db01 port 5432 from scoring',
        'del 1',
        'default block',
        'show',
      ],
      firewall: { default: 'pass', rules: [{ action: 'pass', proto: 'any', dst: 'any', port: 'any', from: 'any' }] },
    },
    {
      id: 'dc01', name: 'Domain controller', host: 'dc01', ip: '10.20.30.10', os: 'Windows Server 2022', role: 'windows', kind: 'pwsh',
      prompt: 'PS C:\\Users\\Administrator>', user: 'Administrator', cwd: 'C:\\Users\\Administrator',
      brief: 'The DC also serves DNS (a scored service), so NEVER reboot it mid-round. Two problems: the Print Spooler is running (the PrintNightmare path to code execution on a DC), and the built-in Guest account has been re-enabled and dropped into Account Operators.',
      checklist: [
        'Get-Service Spooler',
        'Stop-Service Spooler -Force',
        'Set-Service Spooler -StartupType Disabled',
        'Get-ADUser Guest -Properties Enabled,MemberOf',
        "Get-ADGroupMember 'Account Operators'",
        'Disable-ADAccount -Identity Guest',
        "Remove-ADGroupMember -Identity 'Account Operators' -Members Guest -Confirm:$false",
      ],
      adSpec: null,
      ctx: {
        dir: DC_DIR, user: 'Administrator', host: 'DC01', fs: {}, cwd: 'C:\\Users\\Administrator',
        events: () => [],
        commands: winCommands({
          'get-service': (args) => {
            const name = (args.find((a) => !a.startsWith('-')) || '').toLowerCase();
            const all = [
              { Status: 'Running', Name: 'Spooler', DisplayName: 'Print Spooler' },
              { Status: 'Running', Name: 'DNS', DisplayName: 'DNS Server' },
              { Status: 'Running', Name: 'NTDS', DisplayName: 'Active Directory Domain Services' },
            ];
            const sel = name ? all.filter((s) => s.Name.toLowerCase() === name) : all;
            if (!sel.length) return `Get-Service : Cannot find any service with service name '${args[0]}'.`;
            return sel.map((s) => s);
          },
        }),
      },
    },
    {
      id: 'ws01', name: 'Teller workstation', host: 'ws01', ip: '10.20.30.55', os: 'Windows 10', role: 'windows', kind: 'pwsh',
      prompt: 'PS C:\\Users\\teller>', user: 'teller', cwd: 'C:\\Users\\teller',
      brief: 'The branch teller PC. A prior intruder created a local account "svc_update" and put it in the local Administrators group — a quiet backdoor and a lateral-movement foothold. Find it and remove it (do not touch the real accounts).',
      checklist: [
        'Get-LocalUser',
        'Get-LocalGroupMember Administrators',
        'Disable-LocalUser -Name svc_update',
        'Remove-LocalGroupMember -Group Administrators -Member svc_update',
        'Remove-LocalUser -Name svc_update',
      ],
      ctx: {
        dir: DC_DIR, user: 'teller', host: 'WS01', fs: {}, cwd: 'C:\\Users\\teller',
        events: () => [],
        commands: winCommands({
          'get-localuser': () => [
            { Name: 'Administrator', Enabled: false, Description: 'Built-in admin account' },
            { Name: 'teller', Enabled: true, Description: 'Branch teller (domain-joined local profile)' },
            { Name: 'svc_update', Enabled: true, Description: '' },
          ],
          'get-localgroupmember': (args) => {
            const g = (args.find((a) => !a.startsWith('-')) || '').toLowerCase();
            if (g && g !== 'administrators') return [];
            return [
              { ObjectClass: 'User', Name: 'WS01\\Administrator', PrincipalSource: 'Local' },
              { ObjectClass: 'Group', Name: 'HARBORPT\\Domain Admins', PrincipalSource: 'ActiveDirectory' },
              { ObjectClass: 'User', Name: 'WS01\\svc_update', PrincipalSource: 'Local' },
            ];
          },
        }),
      },
    },
    {
      id: 'app01', name: 'Member portal server', host: 'app01', ip: '10.20.30.20', os: 'Ubuntu 22.04 (Apache + portal)', role: 'webdb', kind: 'bash',
      prompt: 'analyst@app01:~$', user: 'analyst', cwd: '/home/analyst',
      brief: 'The member portal web server. Two problems: the whole .git folder was deployed into the web root (anyone can download the source and the DB credentials inside it), and a prior intruder left a script that a root cron re-runs every 5 minutes. Investigate, then clean up.',
      checklist: [
        'ls -la /var/www/portal',
        'cat /var/www/portal/.git/config',
        'rm -rf /var/www/portal/.git',
        'crontab -l',
        'cat /etc/cron.d/portal-sync',
        'rm /etc/cron.d/portal-sync',
        'rm /usr/local/bin/portal-sync.sh',
      ],
      ctx: {
        user: 'analyst', host: 'app01', cwd: '/home/analyst', history: [],
        fs: {
          '/home/analyst/README.txt': 'Harbor Point member portal (Apache). Web root /var/www/portal. API on 8443. DB is PostgreSQL on db01 (10.20.30.40).\n',
          '/var/www/portal/index.php': "<?php /* Harbor Point member portal */ require 'config.php'; ?>\n",
          '/var/www/portal/config.php': "<?php\n$DB_HOST='10.20.30.40';\n$DB_NAME='members';\n$DB_USER='portal_app';\n$DB_PASS='p0rtal-app-pw';  // used by the portal\n",
          '/var/www/portal/.git/config': '[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = https://git.harborpoint.local/portal.git\n[credential]\n\thelper = store   # plaintext creds in .git-credentials — the whole repo is downloadable from the web root\n',
          '/etc/cron.d/portal-sync': '*/5 * * * * root /usr/local/bin/portal-sync.sh >/dev/null 2>&1\n',
          '/usr/local/bin/portal-sync.sh': '#!/bin/bash\n# NOT part of the portal — left by a prior intrusion; re-establishes the attacker\u2019s access. (payload redacted)\n',
        },
        commands: bx({
          crontab: (args) => (args[0] === '-l'
            ? 'no crontab for analyst\n'
            : 'usage: crontab -l\n'),
          _listen: 'State   Recv-Q  Send-Q  Local Address:Port   Process\nLISTEN  0       128     0.0.0.0:80           users:(("apache2"))\nLISTEN  0       128     0.0.0.0:443          users:(("apache2"))\nLISTEN  0       128     0.0.0.0:8443         users:(("portal-api"))\nLISTEN  0       128     0.0.0.0:22           users:(("sshd"))\n',
        }),
      },
    },
    {
      id: 'db01', name: 'Database server', host: 'db01', ip: '10.20.30.40', os: 'Ubuntu 22.04 (PostgreSQL 14)', role: 'webdb', kind: 'bash',
      prompt: 'analyst@db01:~$', user: 'analyst', cwd: '/home/analyst',
      brief: 'PostgreSQL trusts everyone: pg_hba.conf has a "host all all 0.0.0.0/0 trust" line (no password, any source) and it listens on every interface. Two legitimate clients need it: app01 on the LAN (10.20.30.20) and the scoring engine (198.51.100.9). Require real authentication and ALLOW 5432 only from those sources — do NOT just deny 5432, or you cut off both of them. Then rotate the hp-scorecheck password and file the PCR.',
      checklist: [
        'grep -n listen_addresses /etc/postgresql/14/main/postgresql.conf',
        'grep -n trust /etc/postgresql/14/main/pg_hba.conf',
        "sed -i 's/host.*all.*all.*0.0.0.0\\/0.*trust/host all all 10.20.30.0\\/24 scram-sha-256/' /etc/postgresql/14/main/pg_hba.conf",
        'systemctl reload postgresql',
        'ufw allow from 10.20.30.20 to any port 5432',
        'ufw allow from 198.51.100.9 to any port 5432',
      ],
      ctx: {
        user: 'analyst', host: 'db01', cwd: '/home/analyst', history: [],
        fs: {
          '/home/analyst/README.txt': 'Harbor Point member DB (PostgreSQL 14). Clients: app01 (10.20.30.20) and the scoring engine (hp-scorecheck).\n',
          '/etc/postgresql/14/main/postgresql.conf': "data_directory = '/var/lib/postgresql/14/main'\nlisten_addresses = '*'        # listens on EVERY interface — far wider than needed\nport = 5432\n",
          '/etc/postgresql/14/main/pg_hba.conf': '# TYPE  DATABASE  USER  ADDRESS        METHOD\nlocal   all       all                  peer\nhost    all       all   127.0.0.1/32   scram-sha-256\nhost    all       all   0.0.0.0/0      trust        # ANY host, NO password — fix this\n',
        },
        commands: bx({
          psql: (args) => (args.join(' ').toLowerCase().includes('select')
            ? ' id | branch | balance\n----+--------+--------\n  1 | HP-01  |  (redacted)\n'
            : 'psql: use -c "<SQL>" to run a statement (simulated)\n'),
          _listen: 'State   Recv-Q  Send-Q  Local Address:Port   Process\nLISTEN  0       244     0.0.0.0:5432         users:(("postgres"))\nLISTEN  0       128     0.0.0.0:22           users:(("sshd"))\n',
        }),
      },
    },
  ],

  findings: [
    {
      id: 'firewall-anyany', host: 'edge-fw', title: 'Edge firewall allows any-to-any inbound', severity: 'Critical',
      teach: 'Default-deny is the goal, but ORDER matters more: allow the scored ports first, then deny the rest, or you take down every scored service with one rule. RDP and PostgreSQL must never face the internet.',
      exploitable: true, compromise: { impact: 'RDP on the teller workstation and PostgreSQL are reachable from the red team.', penalty: 50 },
      fw: {
        scored: ['web', 'api', 'dns', 'db'],
        scoringIp: '198.51.100.9',
        services: [
          { id: 'web', host: 'app01', ip: '10.20.30.20', proto: 'tcp', ports: [80, 443] },
          { id: 'api', host: 'app01', ip: '10.20.30.20', proto: 'tcp', ports: [8443] },
          { id: 'dns', host: 'dc01', ip: '10.20.30.10', proto: 'any', ports: [53] },
          { id: 'db', host: 'db01', ip: '10.20.30.40', proto: 'tcp', ports: [5432], src: 'scoring' },
        ],
      },
      fix: { restores: ['web', 'api', 'dns', 'db'], why: 'Allow-list exactly the scored ports per host first (PostgreSQL only "from scoring"), then delete the any-any rule and set the default inbound policy to block. app01→db01 traffic is LAN and never crosses the edge; restrict that on db01 instead.' },
      traps: [],
    },
    {
      id: 'print-spooler', host: 'dc01', title: 'Print Spooler running on the domain controller', severity: 'Critical',
      teach: 'A domain controller has no business printing. A running Spooler on a DC is the PrintNightmare path to SYSTEM. Stop and disable the service — no reboot needed, so DNS keeps serving.',
      exploitable: true, compromise: { impact: 'Red team uses the Spooler (PrintNightmare) to run code as SYSTEM on the DC.', penalty: 65, drops: ['dns'] },
      fix: {
        steps: [
          { id: 'stop', accept: [/stop-service/, /spooler/], label: 'Stopped the Print Spooler', output: ['Spooler stopped — the running service is no longer reachable.'], todo: 'stop the service (Stop-Service Spooler -Force)' },
          { id: 'disable', accept: [/set-service|sc config spooler|sc\.exe config spooler/, /spooler/, /disabled/], label: 'Disabled the Spooler at boot', output: ['Spooler StartupType = Disabled — it will not come back after a restart.'], todo: 'disable it at boot (Set-Service Spooler -StartupType Disabled)' },
        ],
        restores: ['dns'],
        why: 'Stop-Service Spooler -Force removes the immediate exposure; Set-Service Spooler -StartupType Disabled keeps it off after a reboot. Neither restarts the DC, so DNS is untouched.',
      },
      traps: [
        { id: 'reboot', match: [/restart-computer/, [/shutdown/, /\/r|-r/]], drops: ['dns'], note: 'The DC rebooted mid-round; DNS was down for the whole restart.', output: ['Restarting DC01... DNS will be unavailable until it comes back.'], why: 'Rebooting the DC takes DNS (a scored service) offline for minutes. Stop and disable the Spooler — no restart required.' },
      ],
    },
    {
      id: 'guest-admin', host: 'dc01', title: 'Guest account re-enabled and placed in Account Operators', severity: 'Critical',
      teach: 'The built-in Guest account ships disabled for a reason. Re-enabled and dropped into a privileged group, it is a backdoor that survives password resets. Disable it and strip the group membership.',
      exploitable: true, compromise: { impact: 'Red team signs in as Guest — a privileged account that administers users — and re-owns accounts after your other fixes.', penalty: 55 },
      fix: {
        steps: [
          { id: 'disable', accept: [/disable-adaccount/, /guest/], label: 'Disabled the Guest account', output: ['Guest disabled — it can no longer sign in.'], todo: 'disable the account (Disable-ADAccount -Identity Guest)' },
          { id: 'remove', accept: [/remove-adgroupmember/, /account operators/, /guest/], label: 'Removed Guest from Account Operators', output: ['Guest removed from Account Operators.'], todo: "remove it from Account Operators (Remove-ADGroupMember -Identity 'Account Operators' -Members Guest)" },
        ],
        why: 'Disable-ADAccount Guest, then Remove-ADGroupMember so even if it were re-enabled it holds no privilege. Verify no other disabled-by-default accounts were re-enabled.',
      },
      traps: [
        { id: 'wrong-account', match: [[/disable-adaccount/, /svc-sql\b/], [/disable-adaccount/, /j\.okafor|m\.reyes/]], output: ['That targets a legitimate account (the SQL service account or a teller). Disabling it breaks a business function and leaves Guest in place.'], why: 'Read the names: the backdoor is the built-in Guest account. Disabling real users breaks the business and fixes nothing.' },
      ],
    },
    {
      id: 'exposed-git', host: 'app01', title: 'The .git folder is exposed in the web root (leaks DB credentials)', severity: 'High',
      teach: 'Deploying with the .git directory in the web root lets anyone download the full source history — including the database credentials committed in it. Remove it from the served path (and rotate anything it leaked).',
      exploitable: true, compromise: { impact: 'Red team downloads /portal/.git, recovers the DB credentials, and logs into PostgreSQL as the app.', penalty: 45 },
      fix: {
        accept: [[/\brm\b/, /-rf?|-fr/, /\.git/]],
        output: ['removed ‘/var/www/portal/.git’ — the repository is no longer downloadable from the web root.'],
        why: 'rm -rf /var/www/portal/.git removes the exposed history. Deploy from an export, not a clone; rotate the leaked DB password; and add a web-server rule to deny dot-directories as defence in depth.',
      },
      traps: [
        { id: 'index-only', match: [[/rm /, /index\.php|config\.php/]], drops: ['web'], note: 'You deleted a live portal file; the website stops rendering.', output: ['removed a portal source file — the site is now broken.'], why: 'Do not delete the running application. The exposure is the .git folder; remove that, not the app’s own files.' },
      ],
    },
    {
      id: 'app-cron', host: 'app01', title: 'Attacker persistence: a root cron re-running a planted script', severity: 'High', reportableBy: 'incident-report',
      teach: 'Persistence must be removed AND its trigger closed, or it reappears. Remove the cron entry and the script it runs — together.',
      exploitable: true, compromise: { impact: 'The cron re-establishes the attacker’s access every 5 minutes regardless of your other fixes.', penalty: 45 },
      fix: {
        steps: [
          { id: 'rm-cron', accept: [/\brm\b/, /cron\.d\/portal-sync|\/etc\/cron/], label: 'Removed the malicious cron entry', output: ['removed ‘/etc/cron.d/portal-sync’ — the re-drop schedule is gone.'], todo: 'remove the cron entry (rm /etc/cron.d/portal-sync)' },
          { id: 'rm-script', accept: [/\brm\b/, /portal-sync\.sh/], label: 'Removed the planted script', output: ['removed ‘/usr/local/bin/portal-sync.sh’.'], todo: 'remove the script it runs (rm /usr/local/bin/portal-sync.sh)' },
        ],
        why: 'Pull the trigger (the cron in /etc/cron.d) AND the payload (the script). Leaving either behind lets the persistence return.',
      },
      traps: [],
    },
    {
      id: 'postgres-trust', host: 'db01', title: 'PostgreSQL trusts any host with no password, on every interface', severity: 'Critical',
      teach: 'A "trust" line for 0.0.0.0/0 means anyone who can reach 5432 is in, with no password. Require real authentication and restrict the source to the two clients that need it — without cutting them off.',
      exploitable: true, compromise: { impact: 'Red team connects to PostgreSQL with no credentials and reads/alters the member database.', penalty: 60, drops: ['db'] },
      fix: {
        steps: [
          { id: 'hba', accept: [/sed -i|nano|vi |vim|tee|>>/, /pg_hba/, /scram|md5/], label: 'Required real authentication in pg_hba.conf', output: ['pg_hba.conf: the 0.0.0.0/0 trust line is replaced with scram-sha-256 scoped to the LAN.'], todo: 'replace the "trust" line with a password method scoped to the LAN (edit pg_hba.conf)' },
          { id: 'reload', accept: [/systemctl|service|pg_ctl/, /reload|restart/, /postgres/], label: 'Reloaded PostgreSQL', output: ['postgresql reloaded — the new pg_hba.conf is live.'], todo: 'reload PostgreSQL so the change takes effect (systemctl reload postgresql)' },
          { id: 'restrict', accept: [/ufw/, /5432/, /\ballow\b/, /from (10\.20\.30\.|198\.51\.100\.9\b)/], reject: [/\b(deny|reject|drop|block)\b/, /from any\b|0\.0\.0\.0\/0/], label: 'Restricted 5432 to the two clients', output: ['Rule added: allow 5432 from 10.20.30.0/24; the internet can no longer reach PostgreSQL.'], todo: 'restrict port 5432 to app01 and the scoring engine (ufw allow from 10.20.30.0/24 to any port 5432)' },
        ],
        restores: ['db'],
        why: 'Replace the trust line with scram-sha-256 scoped to the LAN, reload PostgreSQL, and firewall 5432 to app01 and the scoring engine. The DB stays reachable by exactly the clients that need it.',
      },
      traps: [
        { id: 'deny-all-5432', match: [[/ufw/, /5432/, /deny|reject/]], drops: ['db'], note: 'Port 5432 blocked outright; app01 and the scoring engine can no longer reach the DB.', output: ['ufw: rule added — DENY 5432.'], why: 'Blocking 5432 for everyone cuts off the two legitimate clients too. Restrict by source, do not deny the port.' },
      ],
    },
    {
      id: 'ws-local-admin', host: 'ws01', title: 'Planted local administrator account on the teller workstation', severity: 'High',
      teach: 'A local account in the Administrators group is a quiet backdoor and a lateral-movement foothold. Disable and remove it — and confirm it is not a real service account first.',
      exploitable: true, compromise: { impact: 'Red team logs into the teller workstation as svc_update (local admin) and pivots toward the domain.', penalty: 40 },
      fix: {
        steps: [
          { id: 'disable', accept: [/disable-localuser|net user/, /svc_update/], label: 'Disabled svc_update', output: ['svc_update disabled.'], todo: 'disable the account (Disable-LocalUser -Name svc_update)' },
          { id: 'remove', accept: [/remove-localgroupmember|remove-localuser|net localgroup/, /svc_update/], label: 'Removed svc_update from local Administrators', output: ['svc_update removed from the local Administrators group.'], todo: 'remove it from Administrators (Remove-LocalGroupMember -Group Administrators -Member svc_update)' },
        ],
        why: 'Disable-LocalUser then Remove-LocalGroupMember (or Remove-LocalUser) clears the backdoor. The teller and built-in accounts are left alone.',
      },
      traps: [
        { id: 'wrong-account', match: [[/remove-localgroupmember|remove-localuser|disable-localuser/, /\bteller\b/]], output: ['That targets the teller’s own account — a legitimate user. The backdoor is svc_update.'], why: 'Read the names: svc_update is the planted account. Removing the teller breaks the branch and leaves the backdoor.' },
      ],
    },
  ],

  injects: [
    {
      id: 'inv-memo', title: 'Inject 1 — Asset inventory memo', from: 'Operations Manager', points: 25, releaseAt: 0,
      prompt: 'The examiners want an asset inventory by noon. Draft one (host, IP, OS, role/service) they can hand the NCUA auditor.',
      model: 'A table: each host with its IP, OS, role and the service it provides. An auditor can act on it and it is your own map for the round.',
      rubric: [
        { label: 'names at least 4 hosts (edge-fw, dc01, ws01, app01, db01)', re: /\b(edge-fw|dc01|ws01|app01|db01)\b/i, min: 4 },
        { label: 'gives their IP addresses', re: /\b(10\.20\.30\.\d{1,3}|203\.0\.113\.\d{1,3})\b/, min: 3 },
        { label: 'states the operating systems', re: /windows|ubuntu|linux|pfsense|freebsd/i },
        { label: 'states each box’s role / scored service', re: /\b(dns|postgres|postgresql|database|web|portal|api|domain controller|firewall|workstation)\b/i, min: 3 },
      ],
    },
    {
      id: 'new-user', title: 'Inject 2 — New teller account (least privilege)', from: 'HR', points: 25, releaseAt: 120,
      prompt: 'A new teller starts today. Describe exactly how you create their account with the access they need and nothing more.',
      model: 'A standard domain user added only to the Tellers group — not a Domain Admin, not local admin on the workstation.',
      rubric: [
        { label: 'creates a standard domain user (e.g. New-ADUser)', re: /new-aduser|domain user|standard user|regular user|user account/i },
        { label: 'adds them only to the Tellers group', re: /teller/i },
        { label: 'explicitly no admin rights / least privilege', re: /least[- ]privilege|not (a |an )?(domain |local )?admin|no admin|without admin|non-?admin/i },
        { label: 'secure first password (change at next logon / temporary)', re: /change.{0,30}(first|next) (logon|login|sign)|changepasswordatlogon|temporar|one-time/i },
      ],
    },
    {
      id: 'vendor-api', title: 'Inject 3 — Core-banking vendor access request', from: 'Vendor (Keystone Core)', points: 25, releaseAt: 300,
      prompt: 'Your core-banking vendor asks you to "open PostgreSQL 5432 to the internet" so they can pull nightly reports. Write your response.',
      model: 'Offer a scoped, encrypted path (VPN or an allow-listed source IP over TLS) to a dedicated read-only account instead of exposing 5432 to the world.',
      rubric: [
        { label: 'refuses to expose 5432 to the whole internet', re: /not? (open|expos)|refus|decline|will not open|instead/i },
        { label: 'offers a VPN or an allow-listed source IP', re: /\bvpn\b|allow-?list|whitelist|source ip|their ip|site-to-site/i },
        { label: 'requires encryption / TLS', re: /\btls\b|ssl|encrypt/i },
        { label: 'a dedicated, read-only database account', re: /dedicated|read-?only|least[- ]privilege|separate account|scoped account/i },
      ],
    },
    {
      id: 'incident-report', title: 'Inject 4 — Incident report', from: 'CEO', points: 25, releaseAt: 420,
      prompt: 'You found attacker persistence (a root cron re-running a planted script) on the portal server. Write the incident report the CEO asked for.',
      model: 'Structured: what was found, when, affected systems, actions taken, and a recommendation. Facts and remediation, not blame.',
      rubric: [
        { label: 'what was found (the cron persistence / planted script)', re: /cron|persistence|portal-sync|planted|script|backdoor/i },
        { label: 'when it was found / timeline', re: /\b\d{1,2}:\d{2}\b|\b(am|pm)\b|timeline|this morning|at \d/i },
        { label: 'the affected system (app01 / portal server)', re: /app01|portal|web server/i },
        { label: 'actions taken (removed the cron and the script)', re: /(remov|delet|clean)[^.]{0,60}(cron|script|portal-sync|persistence)/i },
        { label: 'a recommendation to prevent recurrence', re: /recommend|going forward|prevent|next step|file integrity|monitor/i },
      ],
    },
    {
      id: 'pcr', title: 'Inject 5 — Change request for the scored account', from: 'White team (judges)', points: 25, releaseAt: 0,
      prompt: 'You must rotate the hp-scorecheck database password. Submit the required change request so scoring is not interrupted.',
      model: 'A PCR naming the host, account, change, time window, rollback plan, and the new credential handed to the scoring team.',
      rubric: [
        { label: 'names the account (hp-scorecheck)', re: /hp-scorecheck/i },
        { label: 'names the host (db01)', re: /db01|10\.20\.30\.40|database server/i },
        { label: 'a change time window', re: /window|\b\d{1,2}:\d{2}\b|between/i },
        { label: 'a rollback plan', re: /roll ?back|revert|back ?out|restore the old/i },
        { label: 'hands the new credential to the white / scoring team', re: /white team|scoring team|judges|scoring engine|notify/i },
      ],
    },
  ],
};

withRecon(CCDC_LAB_2);

export default CCDC_LAB_2;
