// Case file: MOVEit 2023. The inbox on Thursday morning, June 1, 2023 (the vendor announced the bug on May 31).
//   - The vendor's security notice (real kind of message; wording paraphrased)
//   - A network digest that already showed the big upload from the holiday weekend (illustrative)
//   - A records-management reminder about old files on the transfer server (illustrative, data minimization)
//   - A fake "emergency hotfix" email. NOT part of the reported incident: opportunistic phishing follows
//     every big vulnerability, so it is here to test the player under pressure.
const t = (h, m) => h * 60 + m;
const ME = 'soc-analyst@cedarridge.example';

export const EMAILS = [
  {
    id: 'vendor-notice',
    at: t(6, 20),
    from: { name: 'Progress Security Notices', address: 'security-notices@progress.com' },
    to: 'moveit-admins@cedarridge.example',
    subject: 'Critical vulnerability in MOVEit Transfer: action required',
    external: true,
    phish: false,
    body: [
      'A critical SQL injection vulnerability (CVE-2023-34362) affects MOVEit Transfer. It can let an unauthenticated attacker reach the database and run commands.',
      'Until you patch, disable HTTP and HTTPS traffic to your MOVEit Transfer environment. SFTP and FTP are not affected.',
      'Then review the folder wwwroot for unexpected files such as human2.aspx, check for unknown accounts, and review at least the last 30 days of logs.',
      'Fixed versions and the indicators are on the advisory page in the support portal. Do not follow links in email: open the portal yourself.',
      'Progress Security Team',
    ],
    headers: [
      'Return-Path: <bounce@progress.com>',
      'Received: from mailout.progress.com (192.0.2.60)',
      '  by mx.cedarridge.example with ESMTPS id 4A1B77C2;',
      '  Thu, 1 Jun 2023 06:20:11 -0400 (EDT)',
      'Authentication-Results: mx.cedarridge.example;',
      '  spf=pass smtp.mailfrom=progress.com;',
      '  dkim=pass header.d=progress.com;',
      '  dmarc=pass header.from=progress.com',
      'From: Progress Security Notices <security-notices@progress.com>',
      'Subject: Critical vulnerability in MOVEit Transfer: action required',
    ],
    notes: {
      'Authentication-Results:': 'SPF, DKIM and DMARC all pass for the real vendor domain, and the email tells you to use the portal, not a link.',
      'Received:': 'Sent by the vendor mail system. Nothing odd.',
    },
    verdictNote: 'Real, and urgent. It is also late: attackers began using this bug on May 27. "Patch" is half the job. The email also tells you to look for human2.aspx and unknown accounts, because a server may already be compromised before the fix goes in.',
    teaches: { skill: 'Act on vendor security advisories, and check for compromise as well as patching', secplus: '2.3 Vulnerabilities: zero-day, third-party risk' },
  },
  {
    id: 'netflow-digest',
    at: t(6, 10),
    from: { name: 'Network Reports', address: 'net-reports@cedarridge.example' },
    to: 'secops@cedarridge.example',
    subject: '[Weekly] Top outbound talkers, May 22 to 28',
    external: false,
    phish: false,
    body: [
      'Automated report. Hosts whose outbound traffic is far above their own 30-day baseline:',
      'moveit01 (DMZ)   Sat May 27, 03:00 to 03:21: 6.1 GB to 203.0.113.60 (baseline: under 0.5 GB per day). Destination never seen before.',
      'backup01         Sun May 28, 01:40: 1.1 GB to the backup vendor. Scheduled. Normal.',
      'Review threshold: 10x baseline. This report is generated weekly and sent to a shared mailbox.',
    ],
    headers: [
      'Return-Path: <net-reports@cedarridge.example>',
      'Received: from reports01.cedarridge.example (10.20.3.18)',
      '  by mx.cedarridge.example with ESMTPS id 8D51F00C;',
      '  Thu, 1 Jun 2023 06:10:02 -0400 (EDT)',
      'Authentication-Results: mx.cedarridge.example;',
      '  spf=pass smtp.mailfrom=cedarridge.example;',
      '  dkim=pass header.d=cedarridge.example;',
      '  dmarc=pass header.from=cedarridge.example',
      'From: Network Reports <net-reports@cedarridge.example>',
      'Subject: [Weekly] Top outbound talkers, May 22 to 28',
    ],
    notes: { 'Received:': 'An internal reporting server. A real, scheduled report.' },
    verdictNote: 'Real, and it had the answer five days early. Compare the two rows: one scheduled, known destination, and one 6 GB burst to an address never seen before, from the server that holds partner files. A weekly digest to a shared mailbox is too slow. Large outbound transfers from a file-transfer server should page someone on a holiday weekend.',
    teaches: { skill: 'Read the alerts you already have: unusual outbound volume', secplus: '4.4 Alerting and monitoring' },
  },
  {
    id: 'retention',
    at: t(7, 40),
    from: { name: 'Records Management', address: 'records@cedarridge.example' },
    to: 'moveit-admins@cedarridge.example',
    subject: 'Reminder: Q2 retention review for the transfer server',
    external: false,
    phish: false,
    body: [
      'Hi team,',
      'Our policy says files on the transfer server are deleted 30 days after the partner picks them up. The last export shows about 41,000 files on moveit01. 38% are older than a year. The oldest are from 2019.',
      'They include enrollment files with names, dates of birth and national ID numbers. Please review before the end of Q2.',
      'Records Management',
    ],
    headers: [
      'Return-Path: <records@cedarridge.example>',
      'Received: from mail-int.cedarridge.example (10.20.2.11)',
      '  by mx.cedarridge.example with ESMTPS id 99A1C0D4;',
      '  Thu, 1 Jun 2023 07:40:19 -0400 (EDT)',
      'Authentication-Results: mx.cedarridge.example;',
      '  spf=pass smtp.mailfrom=cedarridge.example;',
      '  dkim=pass header.d=cedarridge.example;',
      '  dmarc=pass header.from=cedarridge.example',
      'From: Records Management <records@cedarridge.example>',
      'Subject: Reminder: Q2 retention review for the transfer server',
    ],
    notes: { 'Authentication-Results:': 'All pass: a real internal message.' },
    verdictNote: 'Real, and it is the data-minimization half of this case. Whatever sits on an internet-facing transfer server is what a zero-day thief can take. A transfer server should be a pipe, not an archive. Old files do not need to be there, and every file you delete before the attack is a file you never have to report.',
    teaches: { skill: 'Data minimization and retention on exposed systems', secplus: '3.3 Data protection: data retention and minimization' },
  },
  {
    id: 'hotfix',
    at: t(8, 10),
    from: { name: 'MOVEit Support', address: 'support@moveit-patchportal.example' },
    to: ME,
    subject: 'URGENT: emergency MOVEit hotfix, install within 1 hour',
    external: true,
    phish: true,
    body: [
      'A critical zero-day affects your MOVEit Transfer server. Attackers are exploiting it now.',
      'Download and run the emergency hotfix on your server, signed in with your MOVEit admin account, within 1 hour.',
      { link: 'hotfix', text: 'Download hotfix and sign in', href: 'https://moveit-patchportal.example/hotfix?ref=urgent' },
      'MOVEit Support',
    ],
    headers: [
      'Return-Path: <bounce@moveit-patchportal.example>',
      'Received: from mail.moveit-patchportal.example (203.0.113.91)',
      '  by mx.cedarridge.example with ESMTP id 5C0E9A11;',
      '  Thu, 1 Jun 2023 08:10:40 -0400 (EDT)',
      'Authentication-Results: mx.cedarridge.example;',
      '  spf=pass smtp.mailfrom=moveit-patchportal.example;',
      '  dkim=none (message not signed);',
      '  dmarc=none header.from=moveit-patchportal.example',
      'From: MOVEit Support <support@moveit-patchportal.example>',
      'Subject: URGENT: emergency MOVEit hotfix, install within 1 hour',
    ],
    notes: {
      'Return-Path:': 'moveit-patchportal.example is not the vendor domain. Anyone can register a name with a product in it.',
      'Authentication-Results:': 'SPF "passes" only because the sender owns that lookalike domain. No DKIM, no DMARC.',
    },
    verdictNote: 'Phishing, the opportunistic kind. Not part of the reported attack, but fake "emergency patch" mails follow every big vulnerability. Get fixes from the vendor portal you already know, never from a link in a mail. And this is addressed to an analyst who has no MOVEit admin login.',
    credsCost: { amount: 25000, text: 'Reset your account in the middle of an incident; check what the copycat touched (estimate for this replay)' },
    teaches: { skill: 'Stay skeptical during an incident: fake patches', secplus: '2.2 Threat vectors: phishing, urgency' },
  },
];

export const PAGES = {
  hotfix: { kind: 'phish-login', url: 'https://moveit-patchportal.example/hotfix?ref=urgent', secure: true, brand: 'MOVEit Support', heading: 'Sign in to download the hotfix', small: 'Admin sign-in required.', done: 'Thank you. Downloading... (There is no hotfix. Your password just left the building.)' },
};

export const REPLY_DRAFTS = {
  'vendor-notice': 'Thanks. Looking at moveit01 now.',
  'netflow-digest': 'Looking at moveit01 now.',
  retention: 'Thanks. Noted. Adding it to the incident.',
  hotfix: 'Done, I installed it.',
};
