// Case file: Equifax, Saturday July 29, 2017. The inbox on the morning the certificate was renewed.
//   - The patch SLA reminder (real in spirit: the GTVM team's March 9 advisory told owners to patch within 48 hours)
//   - Network ops: the certificate on the inspection device is renewed (real: July 29)
//   - Countermeasures: a suspicious request from an outside address (real: seen right after the renewal)
//   - A "renew your certificate" phish. Not part of the real incident: it is here to test the player when a
//     certificate scare is in the air.
// Internal addresses use corp.example, a documentation domain: the real mail setup was never published.
const t = (h, m) => h * 60 + m;
const ME = 'security-analyst@corp.example';

export const EMAILS = [
  {
    id: 'patch-sla',
    at: t(8, 55),
    from: { name: 'Vulnerability Management', address: 'gtvm@corp.example' },
    to: 'it-security@corp.example',
    subject: 'Reminder: critical patches must be applied in 48 hours (owners confirm, then we rescan)',
    external: false,
    phish: false,
    body: [
      'Team,',
      'Policy reminder. A critical vulnerability with a public exploit must be patched within 48 hours of the advisory.',
      'The system owner applies the patch and confirms. Security then rescans within 48 hours to check nothing is left behind.',
      'If your app does not show up in the scan, tell us. We can only check what we know about.',
      'Vulnerability Management',
    ],
    headers: [
      'Return-Path: <gtvm@corp.example>',
      'Received: from mail-int.corp.example (10.20.2.11)',
      '  by mx.corp.example with ESMTPS id 4F12B0A1;',
      '  Sat, 29 Jul 2017 08:55:09 -0400 (EDT)',
      'Authentication-Results: mx.corp.example;',
      '  spf=pass smtp.mailfrom=corp.example;',
      '  dkim=pass header.d=corp.example;',
      '  dmarc=pass header.from=corp.example',
      'From: Vulnerability Management <gtvm@corp.example>',
      'Subject: Reminder: critical patches must be applied in 48 hours',
    ],
    notes: {
      'Received:': 'Through our own relay. Nothing external about it.',
      'Authentication-Results:': 'All pass: a real internal message.',
    },
    verdictNote: 'Real. The policy was fine on paper: patch in 48 hours, then rescan. The Oversight report found it failed in practice. The March 9 advisory went to about 430 people and the ACIS portal still ran a vulnerable Struts. A policy nobody owns end to end does not patch anything.',
    teaches: { skill: 'Know that patch policy needs owners and verification', secplus: '4.3 Vulnerability management: patching, verification' },
  },
  {
    id: 'cert-done',
    at: t(9, 41),
    from: { name: 'Network Operations', address: 'netops@corp.example' },
    to: 'it-security@corp.example',
    subject: 'Change complete: certificate on the ACIS inspection device renewed',
    external: false,
    phish: false,
    body: [
      'FYI. We found the traffic inspection device in front of ACIS has been decrypting nothing, because its certificate had expired.',
      'New certificate installed at 09:41. Decryption is on again.',
      'Heads up: the report says it has been expired for a long time. Nobody was alerted. Several other certificates look old too.',
      'Network Operations',
    ],
    headers: [
      'Return-Path: <netops@corp.example>',
      'Received: from mail-int.corp.example (10.20.2.11)',
      '  by mx.corp.example with ESMTPS id 8B1C3D40;',
      '  Sat, 29 Jul 2017 09:41:55 -0400 (EDT)',
      'Authentication-Results: mx.corp.example;',
      '  spf=pass smtp.mailfrom=corp.example;',
      '  dkim=pass header.d=corp.example;',
      '  dmarc=pass header.from=corp.example',
      'From: Network Operations <netops@corp.example>',
      'Subject: Change complete: certificate on the ACIS inspection device renewed',
    ],
    notes: {
      'Authentication-Results:': 'All pass: this is our own network team.',
      'Received:': 'Inside the network, through our own relay.',
    },
    verdictNote: 'Real. The House Oversight report says the device that monitored ACIS traffic had been inactive for 19 months because of an expired certificate, and that Equifax had let over 300 certificates expire, 79 of them on monitoring for business-critical domains. A tool that silently stops working is worse than no tool, because everyone thinks it is watching.',
    teaches: { skill: 'Track certificate expiry on security tools', secplus: '3.2 Secure infrastructure: certificates and monitoring' },
  },
  {
    id: 'odd-request',
    at: t(9, 55),
    from: { name: 'Countermeasures On-Call', address: 'countermeasures@corp.example' },
    to: 'it-security@corp.example',
    subject: 'Odd requests to ACIS from an outside IP, big responses. Can you look?',
    external: false,
    phish: false,
    body: [
      'Hi,',
      'After the certificate change, the first thing the device decrypted was a request to ACIS from an address in China.',
      'The server answered with more than 10 MB. It looks like image files from credit dispute cases.',
      'I searched the packet capture. That address has been asking since July 25. Before today we could not read any of it.',
      'Can you open the alert?',
      'Countermeasures',
    ],
    headers: [
      'Return-Path: <countermeasures@corp.example>',
      'Received: from mail-int.corp.example (10.20.2.11)',
      '  by mx.corp.example with ESMTPS id 71AA9F02;',
      '  Sat, 29 Jul 2017 09:55:31 -0400 (EDT)',
      'Authentication-Results: mx.corp.example;',
      '  spf=pass smtp.mailfrom=corp.example;',
      '  dkim=pass header.d=corp.example;',
      '  dmarc=pass header.from=corp.example',
      'From: Countermeasures On-Call <countermeasures@corp.example>',
      'Subject: Odd requests to ACIS from an outside IP, big responses. Can you look?',
    ],
    notes: {
      'Authentication-Results:': 'All pass: a real internal message.',
      'Received:': 'Through our own relay.',
    },
    verdictNote: 'Real. The Oversight report says Equifax saw a suspicious request from a China-based address right after the renewal, with responses over 10 MB, and found persistent attempts since July 25. It also says Equifax could not tell what the attacker did before July 29. Good people, caught only because a certificate was fixed by accident.',
    teaches: { skill: 'Escalate a frontline anomaly report', secplus: '4.8 Incident response: detection and escalation' },
  },
  {
    id: 'cert-phish',
    at: t(10, 5),
    from: { name: 'Certificate Renewal Desk', address: 'renewals@certdesk-renewals.example' },
    to: ME,
    subject: 'URGENT: your SSL certificates have expired. Renew within 1 hour',
    external: true,
    phish: true,
    body: [
      'Our records show several SSL certificates registered to your company have expired.',
      'Expired certificates stop your security tools from working. Sign in to renew them now or services will be suspended in 1 hour.',
      { link: 'renew', text: 'Renew my certificates', href: 'https://certdesk-renewals.example/renew?ref=expired' },
      'Certificate Renewal Desk',
    ],
    headers: [
      'Return-Path: <bounce@certdesk-renewals.example>',
      'Received: from mail.certdesk-renewals.example (203.0.113.91)',
      '  by mx.corp.example with ESMTP id 5C20E7B3;',
      '  Sat, 29 Jul 2017 10:05:12 -0400 (EDT)',
      'Authentication-Results: mx.corp.example;',
      '  spf=pass smtp.mailfrom=certdesk-renewals.example;',
      '  dkim=none (message not signed);',
      '  dmarc=none header.from=certdesk-renewals.example',
      'From: Certificate Renewal Desk <renewals@certdesk-renewals.example>',
      'Subject: URGENT: your SSL certificates have expired. Renew within 1 hour',
    ],
    notes: {
      'Return-Path:': 'certdesk-renewals.example is not our domain, and not our certificate authority. Anyone can register a name like that.',
      'Authentication-Results:': 'SPF "passes" only because the sender owns that domain. No DKIM, no DMARC.',
    },
    verdictNote: 'Phishing, the opportunistic kind. Scammers follow news and scares. This one is illustrative: it is not part of the real incident. Real renewals come from your own certificate authority and your own team, and nobody needs your password to renew a certificate.',
    credsCost: { amount: 25000, text: 'Reset your account in the middle of an incident; check what the copycat touched' },
    teaches: { skill: 'Stay skeptical when a scare lands in your inbox', secplus: '2.2 Threat vectors: phishing, urgency' },
  },
];

export const PAGES = {
  renew: { kind: 'phish-login', url: 'https://certdesk-renewals.example/renew?ref=expired', secure: true, brand: 'Certificate Desk', heading: 'Sign in to renew', small: 'Expired certificates found. Sign in within 1 hour to avoid suspension.', done: 'Thank you. Renewal started. (It did not. Your password just left the building.)' },
};

export const REPLY_DRAFTS = {
  'patch-sla': 'Understood. Can we get a list of which apps run Struts, and which the scan actually covers?',
  'cert-done': 'Thanks. Please send me the list of every other expired certificate today.',
  'odd-request': 'On it. Opening the alert now. Please keep that packet capture and do not rotate anything yet.',
  'cert-phish': 'Done, I renewed.',
};
