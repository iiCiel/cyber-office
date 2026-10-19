// Case file: Change Healthcare, Feb 21, 2024. The inbox on the morning of the ransomware.
//   - A claims gateway alert (the outage is real; the alert text is invented)
//   - A remote access review digest (illustrative: the real company's internal mail was never published)
//   - A hospital customer asking about outages (illustrative, legit)
//   - An "outage status" phish. Not part of the real incident: scammers follow every outage.
// Internal addresses use change.example, a documentation domain.
const t = (h, m) => h * 60 + m;
const ME = 'security-analyst@change.example';

export const EMAILS = [
  {
    id: 'claims-down',
    at: t(6, 20),
    from: { name: 'Claims Platform (automated)', address: 'claims-alerts@change.example' },
    to: 'it-ops@change.example',
    subject: '[ALERT] Claims gateway: pharmacy and provider requests failing',
    external: false,
    phish: false,
    body: [
      'Automated alert.',
      'Service: claims-gw. Status: DEGRADED since 05:48.',
      'Error: cannot read claims database files on claims-db01 (file format not recognized).',
      'Pharmacy eligibility and claims requests: timing out. Retries failing.',
      'Impact: pharmacies cannot confirm coverage, so patients cannot fill some prescriptions.',
    ],
    headers: [
      'Return-Path: <claims-alerts@change.example>',
      'Received: from claims-gw01.change.example (10.30.4.20)',
      '  by mx.change.example with ESMTPS id 7E02B6A1;',
      '  Wed, 21 Feb 2024 06:20:14 -0500 (EST)',
      'Authentication-Results: mx.change.example;',
      '  spf=pass smtp.mailfrom=change.example;',
      '  dkim=pass header.d=change.example;',
      '  dmarc=pass header.from=change.example',
      'From: Claims Platform <claims-alerts@change.example>',
      'Subject: [ALERT] Claims gateway: pharmacy and provider requests failing',
    ],
    notes: {
      'Received:': 'Sent by our own gateway, inside the network. A real automated alert.',
      'Authentication-Results:': 'All pass: this is our own system talking.',
    },
    verdictNote: 'Real. Database files the application cannot read is not a normal outage. It is what mass encryption looks like from the application side. Claims here sit between pharmacies, hospitals and insurers, so every minute of this is a patient at a counter who cannot get a prescription. An alert like this must page a human.',
    teaches: { skill: 'Recognize ransomware from the application side', secplus: '4.4 Alerting and monitoring' },
  },
  {
    id: 'remote-review',
    at: t(6, 41),
    from: { name: 'Infrastructure Compliance', address: 'infra-compliance@change.example' },
    to: 'it-security@change.example',
    subject: 'Weekly remote access review: 1 portal still on password-only',
    external: false,
    phish: false,
    body: [
      'Weekly digest.',
      'Remote access portals reviewed: 6. With MFA enforced: 5.',
      'Exception: cx-remote01 (Citrix portal, remote desktop). Authentication: password only. Reason on file: legacy integration, MFA planned.',
      'Please confirm the exception owner and a date.',
    ],
    headers: [
      'Return-Path: <infra-compliance@change.example>',
      'Received: from mail-int.change.example (10.30.2.11)',
      '  by mx.change.example with ESMTPS id 4AC10F55;',
      '  Wed, 21 Feb 2024 06:41:02 -0500 (EST)',
      'Authentication-Results: mx.change.example;',
      '  spf=pass smtp.mailfrom=change.example;',
      '  dkim=pass header.d=change.example;',
      '  dmarc=pass header.from=change.example',
      'From: Infrastructure Compliance <infra-compliance@change.example>',
      'Subject: Weekly remote access review: 1 portal still on password-only',
    ],
    notes: {
      'Authentication-Results:': 'All pass: a real internal message.',
      'Received:': 'Through our own relay.',
    },
    verdictNote: 'Real, and it is the whole case in four lines. (This digest is illustrative: the real company\'s internal mail was never published. The fact is real: the CEO told Congress the Citrix portal "did not have multi-factor authentication".) An exception with a reason but no date or owner is how a gap stays open for months.',
    teaches: { skill: 'Track and close MFA exceptions on remote access', secplus: '4.6 Identity and access management: MFA' },
  },
  {
    id: 'hospital-ask',
    at: t(7, 8),
    from: { name: 'Regional Hospital Billing', address: 'billing@stmarys-regional.example' },
    to: 'support@change.example',
    subject: 'Are claims down on your side? Pharmacy is turning patients away',
    external: true,
    phish: false,
    body: [
      'Hello,',
      'Our pharmacy and billing office cannot reach your claims system since early this morning. Patients are waiting at the counter.',
      'Is this an outage on your end? Is there a manual process? We need to know whether to send people home or let them wait.',
      'Regional Hospital Billing',
    ],
    headers: [
      'Return-Path: <billing@stmarys-regional.example>',
      'Received: from mail.stmarys-regional.example (192.0.2.60)',
      '  by mx.change.example with ESMTPS id 21B9D3E0;',
      '  Wed, 21 Feb 2024 07:08:40 -0500 (EST)',
      'Authentication-Results: mx.change.example;',
      '  spf=pass smtp.mailfrom=stmarys-regional.example;',
      '  dkim=pass header.d=stmarys-regional.example;',
      '  dmarc=pass header.from=stmarys-regional.example',
      'From: Regional Hospital Billing <billing@stmarys-regional.example>',
      'Subject: Are claims down on your side? Pharmacy is turning patients away',
    ],
    notes: {
      'Authentication-Results:': 'Passes for the hospital\'s own domain. Matches what we expect from a customer.',
    },
    verdictNote: 'Real, and it shows who pays for an outage here. Not the company: patients and small practices. Reporting at the time described pharmacies and providers switching to manual processing, discount cards and cash, and doctors\' offices waiting on payment. Customer comms is part of incident response.',
    teaches: { skill: 'See the real-world impact of an outage', secplus: '4.8 Incident response: communication' },
  },
  {
    id: 'status-phish',
    at: t(7, 26),
    from: { name: 'Change Healthcare Status', address: 'status@chc-outage-status.net' },
    to: ME,
    subject: 'Service outage: verify your account to access the recovery portal',
    external: true,
    phish: true,
    body: [
      'Change Healthcare services are experiencing an outage. Staff must verify their sign-in to access the recovery portal within 1 hour.',
      { link: 'status', text: 'Open the recovery portal', href: 'https://chc-outage-status.net/verify?ref=outage' },
      'Change Healthcare IT Status',
    ],
    headers: [
      'Return-Path: <bounce@chc-outage-status.net>',
      'Received: from mail.chc-outage-status.net (203.0.113.91)',
      '  by mx.change.example with ESMTP id 8B31C0D4;',
      '  Wed, 21 Feb 2024 07:26:09 -0500 (EST)',
      'Authentication-Results: mx.change.example;',
      '  spf=pass smtp.mailfrom=chc-outage-status.net;',
      '  dkim=none (message not signed);',
      '  dmarc=none header.from=chc-outage-status.net',
      'From: Change Healthcare Status <status@chc-outage-status.net>',
      'Subject: Service outage: verify your account to access the recovery portal',
    ],
    notes: {
      'Return-Path:': 'chc-outage-status.net is not our domain. Anyone can register a name with a brand in it.',
      'Authentication-Results:': 'SPF "passes" only because the sender owns the lookalike domain. No DKIM, no DMARC.',
    },
    verdictNote: 'Phishing, the opportunistic kind. Scammers use outages as cover. This one is illustrative: it is not part of the real incident. And the real lesson of this case is that a stolen login was enough to get in. Do not hand them another one.',
    credsCost: { amount: 25000, text: 'Reset your account in the middle of an incident; check what the copycat touched' },
    teaches: { skill: 'Stay skeptical during an incident', secplus: '2.2 Threat vectors: phishing, urgency' },
  },
];

export const PAGES = {
  status: { kind: 'phish-login', url: 'https://chc-outage-status.net/verify?ref=outage', secure: true, brand: 'Change Healthcare SSO', heading: 'Verify your account', small: 'Services are being restored. Sign in within 1 hour to keep access to the recovery portal.', done: 'Thank you. Your account is verified. (It isn\'t. Your password just left the building.)' },
};

export const REPLY_DRAFTS = {
  'claims-down': 'On it. Do not restart claims-db01. Isolating the data center links now.',
  'remote-review': 'Escalating now. Please disable the exception and enforce MFA on cx-remote01 today.',
  'hospital-ask': 'Sorry about this. We are working on it. Please use your manual claims process for now. A status update is coming.',
  'status-phish': 'Done, I verified.',
};
