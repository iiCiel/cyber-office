// Raw-looking tool output for CPTC engagement #4: Under Pressure Water Authority (the MWCCDC Invitational
// network, seen from the red team's seat). Shown in place of the one-line summaries in competition mode: the
// player reads real-format nmap / ssh / crackmapexec / sudo output and works out the finding themselves.
// Fiction only — the hosts are the fictional Water Authority network (172.20.240.0/24 corp, 172.31.34.0/24 edge),
// reached from Kali at 172.17.0.2. Secrets, keys, hashes and payloads are redacted on purpose: this is a
// recon-and-report game, not a weaponisation tutorial.

const NMAP_HDR = () => ['Starting Nmap 7.94SVN ( https://nmap.org ) at 2026-11-14 09:06 CST'];

export const RAW_4 = {
  recon: [
    // 0: external / edge sweep (the Palo Alto and the router)
    [{ out: [
      ...NMAP_HDR(),
      'Nmap scan report for pa-vm (172.20.240.200)',
      'Host is up (0.012s latency).',
      'PORT     STATE SERVICE    VERSION',
      '443/tcp  open  ssl/https  Palo Alto Networks PAN-OS management',
      '|_http-title: PA-VM - Palo Alto Networks',
      '22/tcp   open  ssh        OpenSSH (PAN-OS)',
      '',
      'Nmap scan report for vyos (172.31.34.2)',
      'Host is up (0.013s latency).',
      'PORT    STATE SERVICE VERSION',
      '22/tcp  open  ssh     OpenSSH 8.4 (VyOS 1.4)',
      '|_ssh-auth-methods: publickey, password',
      '',
      'Nmap done: 256 IP addresses (2 hosts up) scanned in 38.44 seconds',
      'Note: the Palo Alto is the edge. Scan THROUGH it next to see what the inside exposes.',
    ] }],
    // 1: internal sweep through the firewall (the any-any rule means these answer from outside)
    [
      { when: [[/crackmapexec|netexec|nxc/]], out: [
        'SMB         172.20.240.100  445   DC01       [*] Windows Server 2022 Build 20348 x64 (name:DC01) (domain:underpressure.local) (signing:True) (SMBv1:False)',
        'SMB         172.20.240.120  445   SQL01      [*] Windows Server 2019 Build 17763 x64 (name:SQL01) (domain:underpressure.local) (signing:False) (SMBv1:False)',
        'SMB         172.20.240.120  5985  SQL01      [*] http://172.20.240.120:5985/wsman  WinRM OPEN',
        'SMB         172.20.240.5    445   UB-WKST    [*] Ubuntu 22.04 (Samba)',
      ] },
      { out: [
        ...NMAP_HDR(),
        'Nmap scan report for 172.20.240.10 (ecom)',
        'PORT    STATE SERVICE  VERSION',
        '80/tcp  open  http     nginx 1.24 (nopCommerce)',
        '443/tcp open  ssl/http nginx 1.24',
        '22/tcp  open  ssh      OpenSSH 9.0',
        '',
        'Nmap scan report for 172.20.240.15 (email)',
        'PORT    STATE SERVICE  VERSION',
        '25/tcp  open  smtp     Postfix',
        '143/tcp open  imap     Dovecot',
        '993/tcp open  imaps    Dovecot',
        '',
        'Nmap scan report for 172.20.240.20 (splunk)',
        'PORT     STATE SERVICE VERSION',
        '22/tcp   open  ssh     OpenSSH 9.0 (Debian)',
        '8000/tcp open  http    Splunkd httpd',
        '8089/tcp open  https   Splunkd management',
        '',
        'Nmap scan report for 172.20.240.100 (dc)',
        'PORT    STATE SERVICE       VERSION',
        '53/tcp  open  domain        Simple DNS Plus',
        '88/tcp  open  kerberos-sec  Microsoft Windows Kerberos',
        '389/tcp open  ldap          AD LDAP (Domain: underpressure.local)',
        '445/tcp open  microsoft-ds',
        '5985/tcp open winrm         Microsoft HTTPAPI httpd 2.0',
        '',
        'Nmap scan report for 172.20.240.120 (mssql)',
        'PORT     STATE SERVICE     VERSION',
        '135/tcp  open  msrpc       Microsoft Windows RPC',
        '139/tcp  open  netbios-ssn',
        '445/tcp  open  microsoft-ds',
        '1433/tcp open  ms-sql-s    Microsoft SQL Server 2019',
        '5985/tcp open  winrm',
        '',
        'Nmap done: hosts reachable straight through the Palo Alto (no segmentation).',
      ] },
    ],
  ],

  findings: {
    'pa-default-admin': [
      { when: [[/curl|http|login|web/]], out: [
        '$ curl -sk https://172.20.240.200/php/login.php -d "user=admin&passwd=<redacted>"',
        '{"response":{"status":"success","result":{"isObsolete":"no"}}}',
        '-> PAN-OS management accepted the factory administrator login (admin / factory default).',
        'Session cookie issued; full web-UI access to the firewall policy. Credential value redacted.',
      ] },
      { out: [
        'ssh admin@172.20.240.200',
        "admin@172.20.240.200's password:",
        'Last login: Fri Nov 14 09:02:17 2026',
        'admin@PA-VM> show admins',
        'Name   Type        From          Session',
        'admin  superuser   172.17.0.2    web+ssh   <- factory account still enabled, superuser',
      ] },
    ],
    'pa-permit-any': [
      { when: [[/nmap|through|rule|policy/]], out: [
        'admin@PA-VM> show running security-policy',
        '"TOOL23T-temp" {',
        '   from any;  to any;  source any;  destination any;',
        '   application any;  service any;  action allow;  log-end no;',
        '}',
        '-> One any-any allow rule at the top. Every inside port (RDP 3389, SMB 445, WinRM 5985) is reachable from outside.',
      ] },
    ],
    'vyos-backdoor': [
      { when: [[/ssh.*-i|key|identity/]], out: [
        '$ ssh -i ./<redacted-key> vyos@172.31.34.2',
        'Linux vyos 6.1.0  VyOS 1.4',
        'Last login: Fri Nov 14 09:04:55 2026 from 198.51.100.28',
        'vyos@vyos:~$ id',
        'uid=1000(vyos) groups=1000(vyos),4(adm),27(sudo)  <- planted key, sudo group',
        '-> Logged in to the router with a planted SSH key, no password. From here: operator console, then overwrite the boot image.',
      ] },
      { out: [
        '$ hydra -l vyos -P factory-defaults.txt ssh://172.31.34.2',
        'Hydra v9.5 starting',
        '[22][ssh] host: 172.31.34.2   login: vyos   password: <redacted factory default>',
        '1 of 1 target successfully completed, 1 valid password found',
        '-> Router also still accepts its factory password over SSH on every interface.',
      ] },
    ],
    'splunk-backdoor-user': [
      { when: [[/sudo|svc-chrony|-l/]], out: [
        '$ ssh svc-chrony@172.20.240.20',
        'svc-chrony@splunk:~$ sudo -l',
        'Matching Defaults entries for svc-chrony on splunk:',
        '    !authenticate',
        'User svc-chrony may run the following commands on splunk:',
        '    (ALL : ALL) NOPASSWD: ALL   <- backdoor account, passwordless sudo = instant root',
      ] },
    ],
    'splunk-ssh-keys': [
      { when: [[/sshd_config|\/etc\/ssh|authorizedkeys/]], out: [
        '$ ssh splunk cat /etc/ssh/sshd_config | grep -i authorizedkeys',
        'AuthorizedKeysFile  /etc/ssh/.ssh/%u    <- not the usual ~/.ssh',
        '$ ls -la /etc/ssh/.ssh/',
        '-rw-r--r-- 1 root root  563 Nov 13 23:51 root',
        '-rw-r--r-- 1 root root  563 Nov 13 23:51 splunkadmin',
        '-> A hidden keys directory lets a planted key log in as ANY user, no password.',
      ] },
    ],
    'linux-persistence': [
      { when: [[/scoringengine|cron|profile|persist/]], out: [
        '$ ls -la /bin/scoringengine',
        '-rwsr-xr-x 1 root root 184320 Nov 13 23:49 /bin/scoringengine  <- setuid-root, not a real binary',
        '$ crontab -l ; cat /etc/profile | tail -3',
        '* * * * *  iptables -F        <- flushes the firewall every minute',
        '* * * * *  /bin/scoringengine --beacon',
        '/etc/profile: pkill -f scoringengine; /bin/scoringengine &  <- respawns on every login',
        '-> Implant + cron/profile persistence. Any firewall rule the defender adds is wiped within 60s.',
      ] },
    ],
    'dc-svc-da': [
      { when: [[/crackmapexec|netexec|nxc|bloodhound|net group|net user/]], out: [
        '$ nxc smb 172.20.240.100 -u svc-splunk -p <reused-from-splunk> ',
        'SMB   172.20.240.100  445  DC01  [+] underpressure.local\\svc-splunk (Pwn3d!)',
        '$ nxc ldap 172.20.240.100 -u svc-splunk -p <redacted> -M group-mem -o GROUP="Domain Admins"',
        'LDAP  172.20.240.100       underpressure.local\\svc-splunk  member of: Domain Admins, Enterprise Admins',
        '-> The svc-splunk password read off the Splunk box logs straight into the DC as a Domain Admin. Full domain.',
      ] },
    ],
    'mssql-exposed': [
      { when: [[/winrm|evil-winrm|5985|rpc|135/]], out: [
        '$ evil-winrm -i 172.20.240.120 -u sqladmin -p <redacted>',
        '*Evil-WinRM* PS C:\\> whoami /groups | findstr Administrators',
        'BUILTIN\\Administrators   Alias   S-1-5-32-544   Enabled by default',
        '*Evil-WinRM* PS C:\\> type \\\\172.20.240.120\\ops$\\SOP-remote-access.docx',
        '-> WinRM (5985) and RPC (135) exposed to the outside. Command execution as a local admin; the SOP share is readable.',
      ] },
    ],
    'wkst-default': [
      { when: [[/ssh|172\.20\.240\.5|wkst|key/]], out: [
        '$ ssh -i ./cyberrange-lab student@172.20.240.5',
        'student@UB-WKST:~$ id',
        'uid=1000(student) groups=1000(student),27(sudo)',
        '-> The workstation trusts the shared cyberrange-lab key (and the packet default password). A foothold inside the LAN to reach the servers.',
      ] },
    ],
  },
};

export default RAW_4;
