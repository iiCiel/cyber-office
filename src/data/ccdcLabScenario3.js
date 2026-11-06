// Third CCDC hands-on scenario: "Ridgeview Regional Medical Clinic" — a small regional clinic whose IT you and your
// team inherit at 9:00 AM on competition morning. Same hands-on model as Cedarline and Harbor Point (open each
// box's own terminal and TYPE the commands) but a different company and DIFFERENT weaknesses: legacy TLS on the
// EHR web server, a SUID find binary, an unauthenticated Redis cache next to MySQL, SMB signing off and a
// toothless password policy on the domain controller, and Defender switched off (with an exclusion folder) on a
// nurse-station PC. Everything is fiction — RFC 5737 (203.0.113/24, 198.51.100/24) and RFC 1918 (10.30.40/24)
// addresses, invented hosts, canned output, nothing executed.

import { makeDirectory } from '../game/directory.js';
import { withRecon } from '../game/labCommands.js';

// --- the Active Directory model on dc01 --------------------------------------------------------------------
const DC_DIR = makeDirectory({
  domain: 'ridgeview.local',
  netbios: 'RIDGEVIEW',
  ous: [{ name: 'Ridgeview' }, { name: 'Clinical', parent: 'Ridgeview' }, { name: 'ServiceAccounts', parent: 'Ridgeview' }],
  groups: [
    { name: 'Clinical Staff', ou: 'Clinical', desc: 'Nurses, physicians and front-desk staff' },
    { name: 'EHR Admins', ou: 'ServiceAccounts', desc: 'Administrators of the EHR application' },
  ],
  users: [
    { sam: 'svc-ehr', first: 'EHR', last: 'Service', ou: 'ServiceAccounts', desc: 'EHR application service account (legitimate)', pwdLastSet: '2026-08-02' },
    { sam: 'n.park', first: 'Nadia', last: 'Park', ou: 'Clinical', title: 'Charge Nurse', memberOf: ['Clinical Staff'], pwdLastSet: '2026-07-14' },
    { sam: 'd.ibrahim', first: 'Daniel', last: 'Ibrahim', ou: 'Clinical', title: 'Physician', memberOf: ['Clinical Staff'], pwdLastSet: '2026-06-21' },
  ],
  computers: [
    { name: 'DC01', ip: '10.30.40.10', role: 'Domain Controller', os: 'Windows Server 2022' },
    { name: 'WS01', ip: '10.30.40.55', role: 'Workstation', os: 'Windows 11' },
  ],
});

// --- nginx TLS check for the ehr01 fix ------------------------------------------------------------------------
// Reads the EDITED file: ssl_protocols must list only TLSv1.2 / TLSv1.3 (no SSLv3, TLSv1, TLSv1.1) and the
// server block must still be there, otherwise the scored website stops answering.
export const NGINX_CONF = '/etc/nginx/conf.d/ehr.conf';
export function verifyTls(fs) {
  const text = fs[NGINX_CONF];
  if (text === undefined || !/server\s*\{/.test(text)) {
    return { ok: false, why: 'The EHR nginx config is gone or has no server block — the website cannot start now.', trap: { id: 'nginx-wiped', drops: ['web'], note: 'ehr.conf was emptied or deleted; nginx has nothing to serve on 443.', why: 'Edit the ssl_protocols line only; never delete the server block. Restore it with listen 443 ssl and ssl_protocols TLSv1.2 TLSv1.3.' } };
  }
  const line = text.split('\n').map((l) => l.replace(/#.*/, '').trim()).find((l) => /^ssl_protocols\b/.test(l));
  if (!line) return { ok: false, why: 'There is no ssl_protocols line left. Set it explicitly: ssl_protocols TLSv1.2 TLSv1.3;' };
  const protos = line.replace(/^ssl_protocols\s+/, '').replace(/;.*$/, '').split(/\s+/).filter(Boolean);
  const legacy = protos.filter((p) => /^(sslv2|sslv3|tlsv1|tlsv1\.0|tlsv1\.1)$/i.test(p));
  if (legacy.length) return { ok: false, why: `ssl_protocols still allows ${legacy.join(', ')} (cat the file to check). Legacy TLS is downgradable (POODLE/BEAST); list only TLSv1.2 and TLSv1.3.` };
  if (!protos.some((p) => /^tlsv1\.[23]$/i.test(p))) return { ok: false, why: 'ssl_protocols lists no modern protocol — clients cannot connect. Use TLSv1.2 TLSv1.3.' };
  return { ok: true };
}

// --- redis.conf check for the db01 fix ------------------------------------------------------------------------
// Redis must stop listening on every interface and must require a password. Reads the edited file.
export const REDIS_CONF = '/etc/redis/redis.conf';
export function verifyRedis(fs) {
  const text = fs[REDIS_CONF];
  if (text === undefined) return { ok: false, why: 'redis.conf is gone — the cache cannot start. Edit it, do not delete it.' };
  const lines = text.split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  const bind = lines.find((l) => /^bind\s/.test(l));
  if (!bind || /(^|\s)(0\.0\.0\.0|\*|::)(\s|$)/.test(bind)) {
    return { ok: false, why: 'Redis still listens on every interface (bind 0.0.0.0). Bind it to 127.0.0.1 — nothing off-box needs the cache.' };
  }
  const pw = lines.find((l) => /^requirepass\s+\S+/.test(l));
  if (!pw || /^requirepass\s+(foobared|password|redis|changeme)$/i.test(pw)) {
    return { ok: false, why: 'Redis has no (or a default) password. Add a long requirepass so a local process cannot use it unauthenticated either.' };
  }
  return { ok: true };
}

// Shared inspection commands for the Linux boxes: the recon a real competitor runs before touching anything.
const bashExtras = (overrides = {}) => ({
  ss: (args) => {
    const a = args.join(' ');
    const rows = overrides._listen || 'State   Recv-Q  Send-Q  Local Address:Port   Process\nLISTEN  0       128     0.0.0.0:22           users:(("sshd"))\n';
    return /(-l|-t|-u|-n|-p|-a)/.test(a) || !a ? rows : rows;
  },
  netstat: () => (overrides._listen || 'Active Internet connections\nProto Local Address      State\ntcp   0.0.0.0:22          LISTEN\n'),
  ps: () => 'USER   PID  COMMAND\nroot     1  /sbin/init\nroot   540  /usr/sbin/sshd -D\n',
  find: undefined, // keep the real find from shellplus
  ...overrides,
});
const bx = (o = {}) => { const e = bashExtras(o); delete e.find; return e; };

// Canned Windows recon output shared by the two Windows boxes.
const winCommands = (extra = {}) => ({
  netstat: () => '\nActive Connections\n\n  Proto  Local Address          State           PID\n  TCP    0.0.0.0:3389           LISTENING       1044\n  TCP    0.0.0.0:445            LISTENING       4\n  TCP    0.0.0.0:135            LISTENING       920\n',
  ...extra,
});

export const CCDC_LAB_3 = {
  id: 'ridgeview-lab-2026',
  company: 'Ridgeview Regional Medical Clinic',
  tagline: 'A regional clinic with 140 staff and one overworked IT closet. You and your team just took over IT at 9:00 AM — an EHR web server, a MySQL database with a cache bolted on, a Windows domain and a nurse-station PC, all with habits the red team has already read about.',
  clockSeconds: 900,
  slaPenalty: 15,
  injectWindow: 300,

  redWaves: [
    { n: 1, at: 180, label: 'legacy-protocol + exposed-cache sweep' },
    { n: 2, at: 450, label: 'abusing what is still open (SUID, SMB relay)' },
    { n: 3, at: 720, label: 'defence evasion + lateral movement to the nurse station' },
  ],

  pcr: {
    account: 'rv-scorecheck', host: 'db01', service: 'db', injectId: 'pcr',
    rotateMatch: [/alter user|set password|identified by/, /rv-scorecheck/, /password|identified/],
  },

  services: [
    { id: 'web', name: 'EHR web portal', proto: 'tcp', ports: [80, 443], host: 'ehr01', ip: '10.30.40.20', points: 120, check: 'GET /login returns 200 over TLS and the EHR sign-in page renders' },
    { id: 'hl7', name: 'HL7 lab-results interface', proto: 'tcp', ports: [2575], host: 'ehr01', ip: '10.30.40.20', points: 120, check: 'An HL7 v2 ping on 2575 returns an ACK' },
    { id: 'dns', name: 'DNS', proto: 'any', ports: [53], host: 'dc01', ip: '10.30.40.10', points: 120, check: 'A-record lookups for ridgeview.example resolve' },
    { id: 'db', name: 'Patient database (MySQL)', proto: 'tcp', ports: [3306], host: 'db01', ip: '10.30.40.40', points: 120, check: 'The scoring engine logs in as rv-scorecheck and SELECTs' },
  ],

  devices: [
    {
      id: 'edge-fw', name: 'Edge firewall', host: 'edge-fw', ip: '203.0.113.18', os: 'pfSense (FreeBSD)', role: 'network', kind: 'firewall',
      prompt: 'edge-fw rule-editor>',
      brief: 'The WAN rule set is a single permit-any-any (rule 1): the whole internet can reach SMB and RDP on the domain controller, the nurse-station PC, Redis and MySQL. Add a pass rule for each scored port FIRST (MySQL only from the scoring engine, 198.51.100.23), then delete the any-any rule and set the default inbound policy to block.',
      checklist: [
        'show',
        'pass tcp to ehr01 port 80', 'pass tcp to ehr01 port 443', 'pass tcp to ehr01 port 2575',
        'pass any to dc01 port 53',
        'pass tcp to db01 port 3306 from scoring',
        'del 1',
        'default block',
        'show',
      ],
      firewall: { default: 'pass', rules: [{ action: 'pass', proto: 'any', dst: 'any', port: 'any', from: 'any' }] },
    },
    {
      id: 'dc01', name: 'Domain controller', host: 'dc01', ip: '10.30.40.10', os: 'Windows Server 2022', role: 'windows', kind: 'pwsh',
      prompt: 'PS C:\\Users\\Administrator>', user: 'Administrator', cwd: 'C:\\Users\\Administrator',
      brief: 'The DC also serves DNS (a scored service), so NEVER reboot it mid-round. Two problems: SMB signing is not required (the door to NTLM relay attacks), and the domain password policy is toothless — 6-character minimum, no lockout, so password spraying never gets locked out.',
      checklist: [
        'Get-SmbServerConfiguration',
        'Set-SmbServerConfiguration -RequireSecuritySignature $true -Force',
        'Get-ADDefaultDomainPasswordPolicy',
        'Set-ADDefaultDomainPasswordPolicy -Identity ridgeview.local -MinPasswordLength 12 -ComplexityEnabled $true -LockoutThreshold 5 -LockoutDuration 00:30:00 -LockoutObservationWindow 00:30:00',
        'Get-ADDefaultDomainPasswordPolicy',
      ],
      adSpec: null,
      live: { winServices: [
        { Status: 'Running', Name: 'DNS', DisplayName: 'DNS Server', StartType: 'Automatic' },
        { Status: 'Running', Name: 'NTDS', DisplayName: 'Active Directory Domain Services', StartType: 'Automatic' },
        { Status: 'Running', Name: 'LanmanServer', DisplayName: 'Server', StartType: 'Automatic' },
      ] },
      ctx: {
        dir: DC_DIR, user: 'Administrator', host: 'DC01', fs: {}, cwd: 'C:\\Users\\Administrator',
        events: () => [],
        commands: winCommands({
          'get-smbserverconfiguration': () => 'EnableSMB1Protocol         : False\nEnableSMB2Protocol         : True\nEnableSecuritySignature    : False\nRequireSecuritySignature   : False\nEncryptData                : False\nRejectUnencryptedAccess    : True\n',
          'get-addefaultdomainpasswordpolicy': () => 'ComplexityEnabled           : False\nDistinguishedName           : DC=ridgeview,DC=local\nLockoutDuration             : 00:30:00\nLockoutObservationWindow    : 00:30:00\nLockoutThreshold            : 0\nMaxPasswordAge              : 90.00:00:00\nMinPasswordAge              : 1.00:00:00\nMinPasswordLength           : 6\nPasswordHistoryCount        : 5\nReversibleEncryptionEnabled : False\n',
        }),
      },
    },
    {
      id: 'ws01', name: 'Nurse-station PC', host: 'ws01', ip: '10.30.40.55', os: 'Windows 11', role: 'windows', kind: 'pwsh',
      prompt: 'PS C:\\Users\\nurse>', user: 'nurse', cwd: 'C:\\Users\\nurse',
      brief: 'The 3rd-floor nurse-station PC. Windows Defender real-time protection has been switched off and a folder (C:\\ProgramData\\Updates) was added to its exclusion list — a place malware can sit unscanned. Turn protection back on AND remove the exclusion (do not touch the real accounts).',
      checklist: [
        'Get-MpPreference',
        'Set-MpPreference -DisableRealtimeMonitoring $false',
        "Remove-MpPreference -ExclusionPath 'C:\\ProgramData\\Updates'",
        'Get-MpPreference',
      ],
      live: {
        winServices: [
          { Status: 'Running', Name: 'WinDefend', DisplayName: 'Microsoft Defender Antivirus Service', StartType: 'Automatic' },
          { Status: 'Running', Name: 'EventLog', DisplayName: 'Windows Event Log', StartType: 'Automatic' },
        ],
        localUsers: [
          { Name: 'Administrator', Enabled: false, Description: 'Built-in admin account' },
          { Name: 'nurse', Enabled: true, Description: 'Nurse station shared profile (domain-joined)' },
        ],
        localAdmins: [
          { ObjectClass: 'User', Name: 'WS01\\Administrator', PrincipalSource: 'Local' },
          { ObjectClass: 'Group', Name: 'RIDGEVIEW\\Domain Admins', PrincipalSource: 'ActiveDirectory' },
        ],
      },
      ctx: {
        dir: DC_DIR, user: 'nurse', host: 'WS01', fs: {}, cwd: 'C:\\Users\\nurse',
        events: () => [],
        commands: winCommands({
          'get-mppreference': () => 'DisableRealtimeMonitoring : True\nDisableBehaviorMonitoring : False\nDisableIOAVProtection     : False\nExclusionPath             : {C:\\ProgramData\\Updates}\nExclusionExtension        : {}\nMAPSReporting             : 2\n',
          'get-mpcomputerstatus': () => 'AMServiceEnabled          : True\nAntivirusEnabled          : True\nRealTimeProtectionEnabled : False\nAntivirusSignatureVersion : 1.421.318.0\nQuickScanAge              : 3\n',
        }),
      },
    },
    {
      id: 'ehr01', name: 'EHR web server', host: 'ehr01', ip: '10.30.40.20', os: 'Ubuntu 22.04 (nginx + EHR app)', role: 'webdb', kind: 'bash',
      prompt: 'analyst@ehr01:~$', user: 'analyst', cwd: '/home/analyst',
      live: { units: ['nginx', 'ehr-app'] },
      recon: {
        appUnit: 'nginx.service', appDesc: 'A high performance web server and a reverse proxy server', appProc: 'nginx: worker process',
        listen: 'LISTEN  0  511  0.0.0.0:80    users:(("nginx",pid=912,fd=6))\nLISTEN  0  511  0.0.0.0:443   users:(("nginx",pid=912,fd=7))\nLISTEN  0  128  0.0.0.0:2575  users:(("ehr-hl7",pid=1180,fd=5))\nLISTEN  0  128  0.0.0.0:22    users:(("sshd",pid=742,fd=3))',
      },
      brief: 'The clinic EHR web server. Two problems: nginx still accepts TLSv1.0 and TLSv1.1 (downgrade attacks on patient sessions), and a leftover SUID bit on /usr/bin/find lets any local user run commands as root (an audit note says: find / -perm -4000).',
      checklist: [
        'cat /etc/nginx/conf.d/ehr.conf',
        "sed -i 's/ssl_protocols.*/ssl_protocols TLSv1.2 TLSv1.3;/' /etc/nginx/conf.d/ehr.conf",
        'cat /etc/nginx/conf.d/ehr.conf',
        'nginx -t',
        'systemctl reload nginx',
        'stat /usr/bin/find',
        'chmod u-s /usr/bin/find',
      ],
      ctx: {
        user: 'analyst', host: 'ehr01', cwd: '/home/analyst', history: [],
        fs: {
          '/home/analyst/README.txt': 'Ridgeview EHR web server (nginx). Site config /etc/nginx/conf.d/ehr.conf. HL7 lab interface on 2575. DB is MySQL on db01 (10.30.40.40).\nLast audit (July): "SUID binaries not reviewed" - try: find / -perm -4000 2>/dev/null\n',
          [NGINX_CONF]: 'server {\n    listen 443 ssl;\n    server_name ehr.ridgeview.example;\n    ssl_certificate     /etc/ssl/certs/ehr.crt;\n    ssl_certificate_key /etc/ssl/private/ehr.key;\n    ssl_protocols TLSv1 TLSv1.1 TLSv1.2;   # legacy protocols still enabled\n    location / { proxy_pass http://127.0.0.1:8080; }\n}\n',
          '/etc/ehr/db.env': 'DB_HOST=10.30.40.40\nDB_USER=ehr_app\n',
        },
        commands: bx({
          nginx: (args) => (args.includes('-t')
            ? 'nginx: the configuration file /etc/nginx/nginx.conf syntax is ok\nnginx: configuration file /etc/nginx/nginx.conf test is successful\n'
            : 'nginx version: nginx/1.18.0 (Ubuntu)\n'),
          stat: (args) => (args.join(' ').includes('/usr/bin/find')
            ? '  File: /usr/bin/find\n  Size: 320160    Blocks: 632    IO Block: 4096 regular file\nAccess: (4755/-rwsr-xr-x)  Uid: (    0/    root)   Gid: (    0/    root)\n'
            : 'stat: cannot statx: No such file or directory\n'),
          _listen: 'State   Recv-Q  Send-Q  Local Address:Port   Process\nLISTEN  0       511     0.0.0.0:80           users:(("nginx"))\nLISTEN  0       511     0.0.0.0:443          users:(("nginx"))\nLISTEN  0       128     0.0.0.0:2575         users:(("ehr-hl7"))\nLISTEN  0       128     0.0.0.0:22           users:(("sshd"))\n',
        }),
      },
    },
    {
      id: 'db01', name: 'Database server', host: 'db01', ip: '10.30.40.40', os: 'Ubuntu 22.04 (MySQL 8 + Redis)', role: 'webdb', kind: 'bash',
      prompt: 'analyst@db01:~$', user: 'analyst', cwd: '/home/analyst',
      live: { units: ['mysql', 'redis-server'] },
      brief: 'MySQL is the scored database, but someone also installed a Redis session cache on this box and left it bound to every interface with no password (protected-mode off) — the classic unauthenticated-Redis foothold. Bind Redis to localhost, set a password, restart it. Do NOT touch MySQL (3306): the scoring engine and ehr01 need it.',
      checklist: [
        'grep -n -E "^(bind|requirepass|protected-mode)" /etc/redis/redis.conf',
        "sed -i 's/^bind .*/bind 127.0.0.1/' /etc/redis/redis.conf",
        "echo 'requirepass Rv-Cache-7f3a91c2e5b84d60' >> /etc/redis/redis.conf",
        'cat /etc/redis/redis.conf',
        'systemctl restart redis-server',
        'ss -tulpn',
      ],
      ctx: {
        user: 'analyst', host: 'db01', cwd: '/home/analyst', history: [],
        fs: {
          '/home/analyst/README.txt': 'Ridgeview patient DB (MySQL 8) on 3306 - scored. Redis session cache on 6379 was added for the EHR portal last spring. Clients: ehr01 (10.30.40.20) and the scoring engine (rv-scorecheck).\n',
          [REDIS_CONF]: 'bind 0.0.0.0\nprotected-mode no\nport 6379\ndaemonize yes\n# requirepass is not set\n',
        },
        commands: bx({
          mysql: (args) => (args.join(' ').toLowerCase().includes('select')
            ? '+----+--------+----------+\n| id | ward   | census   |\n+----+--------+----------+\n|  1 | 3-East | (redacted) |\n+----+--------+----------+\n'
            : 'mysql: use -e "<SQL>" to run a statement (simulated)\n'),
          'redis-cli': (args) => (/ping/i.test(args.join(' ')) ? 'PONG\n' : 'redis-cli: connected without authentication (simulated)\n'),
          _listen: 'State   Recv-Q  Send-Q  Local Address:Port   Process\nLISTEN  0       151     0.0.0.0:3306         users:(("mysqld"))\nLISTEN  0       511     0.0.0.0:6379         users:(("redis-server"))\nLISTEN  0       128     0.0.0.0:22           users:(("sshd"))\n',
        }),
      },
    },
  ],

  findings: [
    {
      id: 'firewall-anyany', host: 'edge-fw', title: 'Edge firewall allows any-to-any inbound', severity: 'Critical',
      teach: 'Default-deny is the goal, but ORDER matters more: allow the scored ports first, then deny the rest, or you take down every scored service with one rule. SMB, RDP, Redis and MySQL must never face the internet.',
      exploitable: true, compromise: { impact: 'SMB on the DC, RDP on the nurse PC, Redis and MySQL are all reachable from the red team.', penalty: 50 },
      fw: {
        scored: ['web', 'hl7', 'dns', 'db'],
        scoringIp: '198.51.100.23',
        services: [
          { id: 'web', host: 'ehr01', ip: '10.30.40.20', proto: 'tcp', ports: [80, 443] },
          { id: 'hl7', host: 'ehr01', ip: '10.30.40.20', proto: 'tcp', ports: [2575] },
          { id: 'dns', host: 'dc01', ip: '10.30.40.10', proto: 'any', ports: [53] },
          { id: 'db', host: 'db01', ip: '10.30.40.40', proto: 'tcp', ports: [3306], src: 'scoring' },
        ],
      },
      fix: { restores: ['web', 'hl7', 'dns', 'db'], why: 'Allow-list exactly the scored ports per host first (MySQL only "from scoring"), then delete the any-any rule and set the default inbound policy to block. ehr01→db01 traffic is LAN and never crosses the edge.' },
      traps: [],
    },
    {
      id: 'smb-signing', host: 'dc01', title: 'SMB signing not required on the domain controller', severity: 'High',
      teach: 'When SMB signing is optional, an attacker on the network can relay captured NTLM authentication to the DC and act as the victim. Requiring signing closes the relay path; it costs almost nothing and needs no reboot, so DNS keeps serving.',
      exploitable: true, compromise: { impact: 'Red team relays a captured NTLM logon to the DC over SMB and creates a privileged session.', penalty: 55 },
      fix: {
        accept: [[/set-smbserverconfiguration/, /requiresecuritysignature[ :=]+(\$true|1|true)/]],
        output: ['RequireSecuritySignature : True — the DC now refuses unsigned SMB sessions, so NTLM relay to it fails.'],
        why: 'Set-SmbServerConfiguration -RequireSecuritySignature $true -Force (in production also enforce it by GPO: "Microsoft network server: Digitally sign communications (always)"). No reboot needed.',
      },
      traps: [
        { id: 'reboot', match: [/restart-computer/, [/shutdown/, /\/r|-r/]], drops: ['dns'], note: 'The DC rebooted mid-round; DNS was down for the whole restart.', output: ['Restarting DC01... DNS will be unavailable until it comes back.'], why: 'Rebooting the DC takes DNS (a scored service) offline. SMB signing applies immediately; no restart required.' },
        { id: 'disable-smb2', match: [[/set-smbserverconfiguration/, /enablesmb2protocol[ :=]+(\$false|0|false)/]], note: 'SMB2/3 disabled on the DC: SYSVOL, NETLOGON and Group Policy stop working for the whole domain.', output: ['EnableSMB2Protocol : False — domain clients can no longer read SYSVOL or apply Group Policy.'], why: 'Do not turn SMB off — require signing on it. SMBv1 is the one to be off, and it already is.' },
      ],
    },
    {
      id: 'weak-pw-policy', host: 'dc01', title: 'Domain password policy: 6 characters, no lockout', severity: 'High',
      teach: 'A 6-character minimum with lockout threshold 0 means unlimited guesses: password spraying against every clinical account is free. Set a 12+ character minimum and a lockout threshold with a sensible observation window.',
      exploitable: true, compromise: { impact: 'Red team sprays common passwords across every domain account with no lockout and lands on a nurse account.', penalty: 50 },
      fix: {
        accept: [[/set-addefaultdomainpasswordpolicy/, /minpasswordlength[ :=]+(1[2-9]|[2-9]\d)\b/, /lockoutthreshold[ :=]+([1-9]|10)\b/]],
        output: ['Default domain password policy updated: MinPasswordLength ≥ 12, LockoutThreshold ≤ 10.'],
        why: 'Set-ADDefaultDomainPasswordPolicy -MinPasswordLength 12 -ComplexityEnabled $true -LockoutThreshold 5 closes both holes: length stops cheap guesses, lockout stops spraying. Setting only one of the two still leaves the other open.',
      },
      traps: [
        { id: 'lockout-1', match: [[/set-addefaultdomainpasswordpolicy/, /lockoutthreshold[ :=]+1\b/]], note: 'A lockout threshold of 1 locks every clinician out after a single typo.', output: ['LockoutThreshold = 1 — one mistyped password now locks an account for the full duration.'], why: 'Pick 5-10: low enough to stop spraying, high enough that a nurse mistyping a password on a busy shift is not locked out.' },
      ],
    },
    {
      id: 'ws-defender-off', host: 'ws01', title: 'Defender real-time protection off, with a folder exclusion', severity: 'High', reportableBy: 'incident-report',
      teach: 'Attackers turn Defender off or exclude a staging folder so their tools are never scanned. Fix both halves: re-enable real-time monitoring and remove the exclusion, or malware simply lives in the excluded folder.',
      exploitable: true, compromise: { impact: 'Red team stages tooling in C:\\ProgramData\\Updates, which Defender never scans, and moves toward the domain from the nurse station.', penalty: 45 },
      fix: {
        steps: [
          { id: 'enable', accept: [/set-mppreference/, /disablerealtimemonitoring[ :=]+(\$false|0|false)/], label: 'Re-enabled real-time protection', output: ['DisableRealtimeMonitoring = False — Defender is scanning in real time again.'], todo: 'turn real-time protection back on (Set-MpPreference -DisableRealtimeMonitoring $false)' },
          { id: 'exclusion', accept: [/remove-mppreference/, /exclusionpath/, /programdata\\updates/], label: 'Removed the staging-folder exclusion', output: ['ExclusionPath C:\\ProgramData\\Updates removed — files there are scanned again.'], todo: 'remove the exclusion (Remove-MpPreference -ExclusionPath C:\\ProgramData\\Updates)' },
        ],
        why: 'Set-MpPreference -DisableRealtimeMonitoring $false turns protection on; Remove-MpPreference -ExclusionPath removes the hiding place. Then run a scan of the excluded folder.',
      },
      traps: [
        { id: 'add-exclusion', match: [[/add-mppreference/, /exclusion/]], output: ['Added another Defender exclusion — you just widened the blind spot.'], why: 'Exclusions are what the attacker wants. Remove them; never add more.' },
      ],
    },
    {
      id: 'tls-legacy', host: 'ehr01', title: 'EHR web server still accepts TLSv1.0 / TLSv1.1', severity: 'Medium',
      teach: 'Legacy TLS is downgradable (BEAST/POODLE-class attacks) and fails HIPAA-style audits. Restrict nginx to TLSv1.2 and TLSv1.3, test the config, then reload — a bad config or a stopped nginx takes the scored portal down.',
      exploitable: true, compromise: { impact: 'Red team downgrades a clinician session to TLSv1.0 and reads patient data in transit.', penalty: 40 },
      fix: {
        steps: [
          // Judged on the file the edit leaves behind (verifyTls), not on the command text.
          { id: 'conf', accept: [/sed -i|tee|>>|>/, /ehr\.conf/], verify: verifyTls, restores: ['web'], label: 'Limited ssl_protocols to TLSv1.2 / TLSv1.3', output: ['ehr.conf: ssl_protocols now lists only TLSv1.2 and TLSv1.3.'], todo: 'edit /etc/nginx/conf.d/ehr.conf so ssl_protocols lists only TLSv1.2 TLSv1.3' },
          { id: 'reload', accept: [/systemctl|service|nginx/, /reload|restart/, /nginx/], label: 'Reloaded nginx', output: ['nginx reloaded — the new TLS settings are live.'], todo: 'reload nginx so the change takes effect (systemctl reload nginx)' },
        ],
        restores: ['web'],
        why: 'sed the ssl_protocols line to "TLSv1.2 TLSv1.3", check with nginx -t, then systemctl reload nginx. Editing the file alone changes nothing until the running nginx reloads.',
      },
      traps: [
        { id: 'stop-nginx', match: [[/systemctl|service/, /stop|disable/, /nginx/]], drops: ['web'], note: 'nginx was stopped; the EHR portal is down.', output: ['nginx stopped — the EHR web portal no longer answers.'], why: 'Reload nginx; do not stop it. The website is a scored service.' },
        { id: 'rm-conf', match: [[/\brm\b/, /ehr\.conf/]], drops: ['web'], note: 'You deleted the EHR site config; nginx has nothing to serve on 443.', output: ['removed ‘/etc/nginx/conf.d/ehr.conf’ — the site is now broken.'], why: 'Edit the ssl_protocols line; never delete the site config.' },
      ],
    },
    {
      id: 'suid-find', host: 'ehr01', title: 'SUID bit on /usr/bin/find (local privilege escalation)', severity: 'High',
      teach: 'A SUID-root find lets any local user run `find . -exec /bin/sh \\;` and get a root shell. Remove the setuid bit (chmod u-s) — find keeps working for everyone, just without root powers. Never delete the binary.',
      exploitable: true, compromise: { impact: 'Red team, holding a low-privilege shell from the web app, runs find -exec and becomes root on the EHR server.', penalty: 50 },
      fix: {
        accept: [[/\bchmod\b/, /(\bu-s\b|\ba-s\b|\bug-s\b|(^|\s)0?755(\s|$)|(^|\s)0?750(\s|$)|(^|\s)0?555(\s|$)|(^|\s)0?711(\s|$))/, /\/usr\/bin\/find/]],
        output: ['mode of ‘/usr/bin/find’ changed from 4755 (rwsr-xr-x) to 0755 (rwxr-xr-x) — no longer runs as root.'],
        why: 'chmod u-s /usr/bin/find drops the setuid bit. Review the rest with find / -perm -4000 and remove the bit from anything that is not passwd, sudo, mount, su and similar.',
      },
      traps: [
        { id: 'chmod-777', match: [[/\bchmod\b/, /(^|\s)(0?777|4777|u\+s|4755)(\s|$)/, /\/usr\/bin\/find/]], output: ['That leaves find SUID-root (or makes it world-writable) — worse than before.'], why: 'The goal is to REMOVE the setuid bit: chmod u-s /usr/bin/find.' },
        { id: 'rm-find', match: [[/\brm\b/, /\/usr\/bin\/find/]], output: ['removed ‘/usr/bin/find’ — scripts and monitoring that rely on find now fail.'], why: 'Do not delete a core utility. Remove only the setuid bit.' },
      ],
    },
    {
      id: 'redis-open', host: 'db01', title: 'Redis bound to every interface with no password', severity: 'Critical',
      teach: 'Unauthenticated Redis on 0.0.0.0 lets anyone on the network read the cache and, worse, use CONFIG SET dir/dbfilename to write an SSH key or cron job on the host. Bind to localhost, require a password, restart.',
      exploitable: true, compromise: { impact: 'Red team connects to Redis with no password, writes an SSH key through CONFIG SET and lands a shell on the database server.', penalty: 60, drops: ['db'] },
      fix: {
        steps: [
          { id: 'conf', accept: [/sed -i|tee|>>|>/, /redis\.conf/], verify: verifyRedis, label: 'Bound Redis to localhost and required a password', output: ['redis.conf: bind 127.0.0.1 and requirepass set.'], todo: 'edit /etc/redis/redis.conf: bind 127.0.0.1 and add a requirepass line' },
          { id: 'restart', accept: [/systemctl|service/, /restart/, /redis/], label: 'Restarted Redis', output: ['redis-server restarted — the new bind address and password are live.'], todo: 'restart Redis so it re-reads the config (systemctl restart redis-server)' },
        ],
        restores: ['db'],
        why: 'sed the bind line to 127.0.0.1, append a long requirepass, then systemctl restart redis-server (a reload does not re-bind). MySQL on 3306 is untouched, so the scored DB keeps answering.',
      },
      traps: [
        { id: 'stop-mysql', match: [[/systemctl|service/, /stop|disable/, /mysql/]], drops: ['db'], note: 'MySQL was stopped; the scored patient database is down.', output: ['mysql stopped — the patient database no longer answers.'], why: 'The risky service is Redis, not MySQL. Leave 3306 alone; the scoring engine and ehr01 need it.' },
        { id: 'deny-3306', match: [[/ufw/, /3306/, /deny|reject/]], drops: ['db'], note: 'Port 3306 blocked outright; ehr01 and the scoring engine can no longer reach the DB.', output: ['ufw: rule added — DENY 3306.'], why: 'The exposed service is Redis (6379). Blocking MySQL cuts off both legitimate clients.' },
      ],
    },
  ],

  injects: [
    {
      id: 'inv-memo', title: 'Inject 1 — Asset inventory memo', from: 'Practice Administrator', points: 25, releaseAt: 0,
      prompt: 'The compliance officer wants an asset inventory by noon for the HIPAA risk analysis. Draft one (host, IP, OS, role/service) she can file.',
      model: 'A table: each host with its IP, OS, role and the service it provides. The compliance officer can file it and it is your own map for the round.',
      rubric: [
        { label: 'names at least 4 hosts (edge-fw, dc01, ws01, ehr01, db01)', re: /\b(edge-fw|dc01|ws01|ehr01|db01)\b/i, min: 4 },
        { label: 'gives their IP addresses', re: /\b(10\.30\.40\.\d{1,3}|203\.0\.113\.\d{1,3})\b/, min: 3 },
        { label: 'states the operating systems', re: /windows|ubuntu|linux|pfsense|freebsd/i },
        { label: 'states each box’s role / scored service', re: /\b(dns|mysql|database|web|ehr|hl7|domain controller|firewall|workstation|redis)\b/i, min: 3 },
      ],
    },
    {
      id: 'new-user', title: 'Inject 2 — New nurse account (least privilege)', from: 'HR', points: 25, releaseAt: 120,
      prompt: 'A new float nurse starts today. Describe exactly how you create their account with the access they need and nothing more.',
      model: 'A standard domain user added only to the Clinical Staff group — not a Domain Admin, not local admin on the nurse-station PC.',
      rubric: [
        { label: 'creates a standard domain user (e.g. New-ADUser)', re: /new-aduser|domain user|standard user|regular user|user account/i },
        { label: 'adds them only to the Clinical Staff group', re: /clinical/i },
        { label: 'explicitly no admin rights / least privilege', re: /least[- ]privilege|not (a |an )?(domain |local )?admin|no admin|without admin|non-?admin/i },
        { label: 'secure first password (change at next logon / temporary)', re: /change.{0,30}(first|next) (logon|login|sign)|changepasswordatlogon|temporar|one-time/i },
      ],
    },
    {
      id: 'vendor-api', title: 'Inject 3 — Lab-analytics vendor access request', from: 'Vendor (Meridian Lab Analytics)', points: 25, releaseAt: 300,
      prompt: 'Your lab-analytics vendor asks you to "open MySQL 3306 to the internet" so their dashboard can pull nightly results. Write your response.',
      model: 'Offer a scoped, encrypted path (VPN or an allow-listed source IP over TLS) to a dedicated read-only account instead of exposing 3306 to the world.',
      rubric: [
        { label: 'refuses to expose 3306 to the whole internet', re: /not? (open|expos)|refus|decline|will not open|instead/i },
        { label: 'offers a VPN or an allow-listed source IP', re: /\bvpn\b|allow-?list|whitelist|source ip|their ip|site-to-site/i },
        { label: 'requires encryption / TLS', re: /\btls\b|ssl|encrypt/i },
        { label: 'a dedicated, read-only database account', re: /dedicated|read-?only|least[- ]privilege|separate account|scoped account/i },
      ],
    },
    {
      id: 'incident-report', title: 'Inject 4 — Incident report', from: 'Chief Medical Officer', points: 25, releaseAt: 420,
      prompt: 'You found Defender switched off and a hidden exclusion folder on the nurse-station PC. Write the incident report the CMO asked for.',
      model: 'Structured: what was found, when, affected systems, actions taken, and a recommendation. Facts and remediation, not blame.',
      rubric: [
        { label: 'what was found (Defender disabled / exclusion folder)', re: /defender|real-?time|exclusion|antivirus|programdata/i },
        { label: 'when it was found / timeline', re: /\b\d{1,2}:\d{2}\b|\b(am|pm)\b|timeline|this morning|at \d/i },
        { label: 'the affected system (ws01 / nurse-station PC)', re: /ws01|nurse|workstation/i },
        { label: 'actions taken (re-enabled protection, removed the exclusion)', re: /(re-?enabl|turn|remov|delet|clean)[^.]{0,60}(defender|real-?time|protection|exclusion|folder)/i },
        { label: 'a recommendation to prevent recurrence', re: /recommend|going forward|prevent|next step|tamper protection|group policy|monitor/i },
      ],
    },
    {
      id: 'pcr', title: 'Inject 5 — Change request for the scored account', from: 'White team (judges)', points: 25, releaseAt: 0,
      prompt: 'You must rotate the rv-scorecheck database password. Submit the required change request so scoring is not interrupted.',
      model: 'A PCR naming the host, account, change, time window, rollback plan, and the new credential handed to the scoring team.',
      rubric: [
        { label: 'names the account (rv-scorecheck)', re: /rv-scorecheck/i },
        { label: 'names the host (db01)', re: /db01|10\.30\.40\.40|database server/i },
        { label: 'a change time window', re: /window|\b\d{1,2}:\d{2}\b|between/i },
        { label: 'a rollback plan', re: /roll ?back|revert|back ?out|restore the old/i },
        { label: 'hands the new credential to the white / scoring team', re: /white team|scoring team|judges|scoring engine|notify/i },
      ],
    },
  ],
};

withRecon(CCDC_LAB_3);

export default CCDC_LAB_3;
