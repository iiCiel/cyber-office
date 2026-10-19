// Case file: Colonial Pipeline, May 7, 2021. The inbox on the morning the ransom note was found.
//   - The control-room report (real in spirit: Colonial's ransom note was reportedly found on a control-room
//     computer early on May 7; the wording and the sender are invented)
//   - A billing batch failure (the billing outage is real and is what pushed Colonial to shut down; the alert text is invented)
//   - A "restore your access" phish. Not part of the real incident: opportunistic phishing follows every
//     headline, so it is here to test the player under pressure.
// Internal addresses use colonial.example, a documentation domain: the real mail setup was never published.
const t = (h, m) => h * 60 + m;
const ME = 'security-analyst@colonial.example';

export const EMAILS = [
  {
    id: 'billing-fail',
    at: t(3, 55),
    from: { name: 'Billing System (automated)', address: 'billing-alerts@colonial.example' },
    to: 'it-ops@colonial.example',
    subject: '[ALERT] Overnight invoice batch FAILED on billing01',
    external: false,
    phish: false,
    body: [
      'Automated alert.',
      'Job: overnight-invoice-batch. Status: FAILED at 03:40.',
      'Error: cannot open database files on billing01 (access denied / unknown file format).',
      'Retries: 3 of 3 failed. Nobody has been paged for this severity.',
      'Impact: delivery volumes cannot be turned into invoices until this is fixed.',
    ],
    headers: [
      'Return-Path: <billing-alerts@colonial.example>',
      'Received: from billing01.colonial.example (10.20.4.30)',
      '  by mx.colonial.example with ESMTPS id 5D10A9C2;',
      '  Fri, 07 May 2021 03:55:12 -0400 (EDT)',
      'Authentication-Results: mx.colonial.example;',
      '  spf=pass smtp.mailfrom=colonial.example;',
      '  dkim=pass header.d=colonial.example;',
      '  dmarc=pass header.from=colonial.example',
      'From: Billing System <billing-alerts@colonial.example>',
      'Subject: [ALERT] Overnight invoice batch FAILED on billing01',
    ],
    notes: {
      'Received:': 'Sent by the billing server itself, inside the network. A real automated alert.',
      'Authentication-Results:': 'All pass: this is our own system talking.',
    },
    verdictNote: 'Real. Files the database cannot open, at 03:40, is not a normal job failure. It is what mass encryption looks like from the application side. Colonial reportedly could not bill its customers, and that billing outage was a big reason it took the pipeline offline. An alert like this should page a human, not wait in a mailbox.',
    teaches: { skill: 'Recognize ransomware from the application side', secplus: '4.4 Alerting and monitoring' },
  },
  {
    id: 'control-room',
    at: t(5, 12),
    from: { name: 'Control Room Shift Lead', address: 'control-room@colonial.example' },
    to: 'it-security@colonial.example',
    subject: 'Strange text file on a control room PC. Please call me',
    external: false,
    phish: false,
    body: [
      'IT Security,',
      'One of my operators just found a text file on the desktop of a control room workstation. It says our files are locked and gives instructions to contact "them".',
      'The pipeline controls look normal on our side. But I have no idea what that PC is connected to, and nobody here has seen this before.',
      'I told everyone not to touch it. Please call me.',
      'Shift lead, control room',
    ],
    headers: [
      'Return-Path: <control-room@colonial.example>',
      'Received: from mail-int.colonial.example (10.20.2.11)',
      '  by mx.colonial.example with ESMTPS id 91AC0E44;',
      '  Fri, 07 May 2021 05:12:31 -0400 (EDT)',
      'Authentication-Results: mx.colonial.example;',
      '  spf=pass smtp.mailfrom=colonial.example;',
      '  dkim=pass header.d=colonial.example;',
      '  dmarc=pass header.from=colonial.example',
      'From: Control Room Shift Lead <control-room@colonial.example>',
      'Subject: Strange text file on a control room PC. Please call me',
    ],
    notes: {
      'Authentication-Results:': 'All pass: this is a real internal message.',
      'Received:': 'Through our own relay. Nothing external about it.',
    },
    verdictNote: 'Real. Reporting says a Colonial employee found the ransom note on a control-room computer early on May 7. Good reporting from the floor: "do not touch it" is the right instinct. Note the open question: what is that PC connected to? That question drove the whole shutdown decision.',
    teaches: { skill: 'Take a frontline report seriously', secplus: '4.8 Incident response: detection and escalation' },
  },
  {
    id: 'restore-access',
    at: t(5, 24),
    from: { name: 'Colonial IT Support', address: 'it-support@colonial-secure-login.com' },
    to: ME,
    subject: 'Network outage: confirm your sign-in within 1 hour to keep your account',
    external: true,
    phish: true,
    body: [
      'We are restoring services after a network outage. All employees must confirm their sign-in details within 1 hour or the account will be suspended.',
      { link: 'restore', text: 'Confirm my account', href: 'https://colonial-secure-login.com/confirm?ref=outage' },
      'Colonial IT Support',
    ],
    headers: [
      'Return-Path: <bounce@colonial-secure-login.com>',
      'Received: from mail.colonial-secure-login.com (203.0.113.91)',
      '  by mx.colonial.example with ESMTP id 3B77F0D1;',
      '  Fri, 07 May 2021 05:24:09 -0400 (EDT)',
      'Authentication-Results: mx.colonial.example;',
      '  spf=pass smtp.mailfrom=colonial-secure-login.com;',
      '  dkim=none (message not signed);',
      '  dmarc=none header.from=colonial-secure-login.com',
      'From: Colonial IT Support <it-support@colonial-secure-login.com>',
      'Subject: Network outage: confirm your sign-in within 1 hour to keep your account',
    ],
    notes: {
      'Return-Path:': 'colonial-secure-login.com is not our domain. Anyone can register a name with a brand in it.',
      'Authentication-Results:': 'SPF "passes" only because the sender owns the lookalike domain. No DKIM, no DMARC.',
    },
    verdictNote: 'Phishing, the opportunistic kind. Scammers use outages and headlines as cover. This one is illustrative: it is not part of the real incident. Real IT does not threaten to suspend you in an hour from an outside domain, and it never asks for your password.',
    credsCost: { amount: 25000, text: 'Reset your account in the middle of an incident; check what the copycat touched' },
    teaches: { skill: 'Stay skeptical during an incident', secplus: '2.2 Threat vectors: phishing, urgency' },
  },
];

export const PAGES = {
  restore: { kind: 'phish-login', url: 'https://colonial-secure-login.com/confirm?ref=outage', secure: true, brand: 'Colonial SSO', heading: 'Confirm your account', small: 'Services are being restored. Sign in within 1 hour to keep your account active.', done: 'Thank you. Your account is confirmed. (It isn\'t. Your password just left the building.)' },
};

export const REPLY_DRAFTS = {
  'billing-fail': 'Looking at billing01 now. Please do not restart it.',
  'control-room': 'Do not touch that PC. Do not reboot it. I am on my way. Calling you in two minutes.',
  'restore-access': 'Done, I confirmed.',
};
