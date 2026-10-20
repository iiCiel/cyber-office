// Lab: Halcyon Mutual, Thursday Oct 29, 2026. The morning inbox after WEB02 was rooted overnight.
const t = (h, m) => h * 60 + m;
const ME = 'security@halcyonmutual.com';
const hdr = (from, addr, ip, id, date, subject, auth = true) => [
  `Return-Path: <${addr}>`,
  `Received: from ${addr.includes('halcyon') ? 'mail01.halcyonmutual.local' : `mail.${addr.split('@')[1]}`} (${ip})`,
  `  by mx.halcyonmutual.com with ESMTPS id ${id};`,
  `  ${date}`,
  'Authentication-Results: mx.halcyonmutual.com;',
  `  spf=pass smtp.mailfrom=${addr.split('@')[1]};`,
  auth ? `  dkim=pass header.d=${addr.split('@')[1]};` : '  dkim=none (message not signed);',
  auth ? `  dmarc=pass header.from=${addr.split('@')[1]}` : `  dmarc=none header.from=${addr.split('@')[1]}`,
  `From: ${from} <${addr}>`,
  `Subject: ${subject}`,
];

export const EMAILS = [
  {
    id: 'fim-alert',
    at: t(6, 2),
    from: { name: 'File Integrity Monitoring', address: 'fim@halcyonmutual.com' },
    to: ME,
    subject: '[WEB02] New and modified files outside change control (overnight)',
    external: false,
    phish: false,
    body: [
      'Automated report from the file integrity agent on WEB02 (10.0.3.52). Changes not matching any package or release:',
      'NEW   /var/www/html/uploads/status.php   (php, writer www-data, 23:58)',
      'NEW   /etc/cron.d/apache-health          (runs every 10 min as root)',
      'MOD   /root/.ssh/authorized_keys          (+1 key, comment "backup@ops", unrecognized)',
      'NEW   /etc/systemd/system/apache-health.service (enabled, ExecStart=/dev/shm/.a)',
      'These did not come from release 7.4.1 or from configuration management.',
    ],
    headers: hdr('File Integrity Monitoring', 'fim@halcyonmutual.com', '10.0.3.61', '7A10C3D1', 'Thu, 29 Oct 2026 06:02:11 -0400 (EDT)', '[WEB02] New and modified files outside change control'),
    notes: { 'Received:': 'An internal monitoring host. A real, scheduled integrity report.' },
    verdictNote: 'Real, and it is the whole case in one email: a web shell, a root cron job, a planted SSH key and a systemd service, none from any release. File integrity monitoring is how you catch persistence you were not watching for. Start here.',
    teaches: { skill: 'Use file integrity monitoring to catch web shells and persistence', secplus: '4.4 Alerting and monitoring' },
  },
  {
    id: 'dana-portal',
    at: t(6, 40),
    from: { name: 'Dana Kowalski', address: 'dana.k@halcyonmutual.com' },
    to: ME,
    subject: 'WEB02 was slow last night and the backup pull errored',
    external: false,
    phish: false,
    body: [
      'Morning. Two things on WEB02:',
      'The nightly backup pull logged an error at 2 AM (the backup script was already running under a different user?), and the box was pushing a lot of traffic around midnight.',
      'Probably nothing, but you asked us to flag anything odd on the public servers.',
      'Dana',
    ],
    headers: hdr('Dana Kowalski', 'dana.k@halcyonmutual.com', '10.0.3.40', '2C44F6A8', 'Thu, 29 Oct 2026 06:40:03 -0400 (EDT)', 'WEB02 was slow last night'),
    notes: { 'Received:': 'Internal. A real heads-up from IT.' },
    verdictNote: 'Real, and more useful than it looks. "The backup script was already running under a different user" is the privilege-escalation: www-data ran it as root. "A lot of traffic around midnight" is the exfiltration. Thank Dana and dig in.',
    teaches: { skill: 'Treat an operator\'s "probably nothing" as a lead', secplus: '4.8 Incident response: detection' },
  },
  {
    id: 'sudo-digest',
    at: t(6, 0),
    from: { name: 'Server Hardening Scan', address: 'hardening@halcyonmutual.com' },
    to: ME,
    subject: '[Weekly] Linux hardening findings open > 30 days',
    external: false,
    phish: false,
    body: [
      'Automated report. Findings open longer than 30 days:',
      'HIGH  WEB02   www-data has a sudo rule: (root) NOPASSWD: /usr/local/bin/backup-pull.sh. The script calls tar with a wildcard.',
      'HIGH  WEB02   uploads directory is inside the web root and allows PHP execution.',
      'MED   server VLAN   no default-deny on outbound internet; any server can reach the internet on 443.',
      'LOW   WEB02   PHP library two versions behind.',
      'This report is generated weekly. Nobody is paged for HIGH findings.',
    ],
    headers: hdr('Server Hardening Scan', 'hardening@halcyonmutual.com', '10.0.3.61', '5E0A3D22', 'Thu, 29 Oct 2026 06:00:02 -0400 (EDT)', '[Weekly] Linux hardening findings'),
    notes: { 'Received:': 'Internal scanner. A real scheduled report.' },
    verdictNote: 'Real, and it listed every step of the attack before it happened: the sudo rule that gave root, the executable upload folder that took the web shell, and the open egress the data left through. A HIGH finding nobody is paged for is a finding that waits for an attacker.',
    teaches: { skill: 'Act on the hardening findings your tools already report', secplus: '4.4 Alerting and monitoring' },
  },
  {
    id: 'hosting-phish',
    at: t(7, 25),
    from: { name: 'Server Hosting Support', address: 'support@server-billing-secure.net' },
    to: ME,
    subject: 'Suspicious activity on your server: verify to avoid shutdown',
    external: true,
    phish: true,
    body: [
      'We detected abuse originating from your server (10.0.3.52). To avoid suspension in 6 hours, confirm your control panel login.',
      { link: 'host-confirm', text: 'Verify my server', href: 'https://server-billing-secure.net/panel/login?ip=10.0.3.52' },
      'Hosting Support',
    ],
    headers: hdr('Server Hosting Support', 'support@server-billing-secure.net', '203.0.113.91', '7C20E4B1', 'Thu, 29 Oct 2026 07:25:09 -0400 (EDT)', 'Suspicious activity on your server', false),
    notes: {
      'Return-Path:': 'server-billing-secure.net is nobody you have an account with. The real servers are on-premises.',
      'Authentication-Results:': 'SPF passes for the attacker\'s own domain. No DKIM, no DMARC.',
    },
    verdictNote: 'Phishing. It name-drops your server\'s real internal IP to look credible — a detail an attacker who was just on the box would know. Your servers are on-premises; there is no hosting control panel to log in to. A copycat riding the incident.',
    credsCost: { amount: 25000, text: 'Rotate the credentials you exposed and review what the copycat tried (estimate for this lab)' },
    teaches: { skill: 'Spot a copycat phish that rides a real incident', secplus: '2.2 Threat vectors: phishing' },
  },
];

export const PAGES = {
  'host-confirm': { kind: 'phish-login', url: 'https://server-billing-secure.net/panel/login?ip=10.0.3.52', secure: true, brand: 'Hosting Panel', heading: 'Verify your server', small: 'Abuse detected on 10.0.3.52.', done: 'Thank you. Your server is verified. (It isn\'t. Your password just left the building.)' },
};

export const REPLY_DRAFTS = {
  'fim-alert': 'Opening an incident on WEB02 now. Please do not touch the box.',
  'dana-portal': 'Thanks Dana. Do not reboot or clean WEB02 — we need it as-is. More soon.',
  'sudo-digest': 'Reading the WEB02 findings now.',
  'hosting-phish': 'Done, I verified.',
};
