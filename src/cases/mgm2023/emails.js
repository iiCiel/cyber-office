// Case file: MGM 2023. The inbox on the Sunday morning of the breach.
//   - The overnight help desk handoff (illustrative wording, but it carries the real weak point: a reset with no callback)
//   - An identity alert digest (automated; the kind of alert that would have shown the takeover)
//   - A "re-enroll your MFA" phish. NOT part of the reported incident: opportunistic phishing follows
//     every public breach, so it is here to test the player under pressure.
const t = (h, m) => h * 60 + m;
const ME = 'soc-analyst@mgmresorts.com';

export const EMAILS = [
  {
    id: 'handoff',
    at: t(7, 55),
    from: { name: 'Overnight Help Desk', address: 'hd.night@mgmresorts.com' },
    to: 'soc@mgmresorts.com',
    subject: 'Handoff: one odd call at 05:48',
    external: false,
    phish: false,
    body: [
      'Hi SOC,',
      'Quiet night. One thing to flag. At 05:48 a man called saying he was d.voss in Revenue Systems. New phone, the authenticator did not move over.',
      'He knew the employee ID and his manager by name. I reset his MFA and password and closed the ticket.',
      'I did not call him back. The directory number went to voicemail and he sounded stressed. Probably fine? Flagging anyway.',
      'Night desk',
    ],
    headers: [
      'Return-Path: <hd.night@mgmresorts.com>',
      'Received: from mail-int.mgmresorts.com (10.20.2.11)',
      '  by mx.mgmresorts.com with ESMTPS id 3B77C1A2;',
      '  Sun, 10 Sep 2023 07:55:12 -0700 (PDT)',
      'Authentication-Results: mx.mgmresorts.com;',
      '  spf=pass smtp.mailfrom=mgmresorts.com;',
      '  dkim=pass header.d=mgmresorts.com;',
      '  dmarc=pass header.from=mgmresorts.com',
      'From: Overnight Help Desk <hd.night@mgmresorts.com>',
      'To: soc@mgmresorts.com',
      'Subject: Handoff: one odd call at 05:48',
    ],
    notes: {
      'Authentication-Results:': 'All pass: this is a real internal message from the real help desk mailbox.',
      'Received:': 'Sent through the internal relay. Nothing external.',
    },
    verdictNote: 'Real, and it is the whole weak point in four lines. The caller knew an employee ID and a manager name, which anyone can find from LinkedIn or old data. Nobody called back on the number on file. Reported attacks on help desks start exactly like this.',
    teaches: { skill: 'Spot weak identity verification in a help-desk process', secplus: '2.2 Threat vectors: social engineering, impersonation' },
  },
  {
    id: 'identity-digest',
    at: t(6, 10),
    from: { name: 'Identity Alerts', address: 'identity-alerts@mgmresorts.com' },
    to: 'secops@mgmresorts.com',
    subject: '[Digest] Identity events needing review, last 12 hours',
    external: false,
    phish: false,
    body: [
      'Automated report. Accounts with events that match review rules:',
      'd.voss    MFA reset by help desk (05:48), then sign-in from a NEW IP and enrollment of a NEW MFA device (05:53, 05:55).',
      'k.mensah  MFA reset by help desk (04:30), then sign-in from a known office IP. Ticket shows callback. OK.',
      'Review rules are in the identity admin console. This digest is generated every 12 hours.',
    ],
    headers: [
      'Return-Path: <identity-alerts@mgmresorts.com>',
      'Received: from reports01.mgmresorts.com (10.20.3.18)',
      '  by mx.mgmresorts.com with ESMTPS id 8D51F00C;',
      '  Sun, 10 Sep 2023 06:10:02 -0700 (PDT)',
      'Authentication-Results: mx.mgmresorts.com;',
      '  spf=pass smtp.mailfrom=mgmresorts.com;',
      '  dkim=pass header.d=mgmresorts.com;',
      '  dmarc=pass header.from=mgmresorts.com',
      'From: Identity Alerts <identity-alerts@mgmresorts.com>',
      'Subject: [Digest] Identity events needing review, last 12 hours',
    ],
    notes: { 'Received:': 'An internal reporting server. A real, scheduled report.' },
    verdictNote: 'Real. Compare the two rows. Both had an MFA reset by the help desk. One signs in from the office and the ticket shows a callback. The other signs in from a new IP and adds a new device. A digest twice a day is too slow: a reset followed by a new-IP login should page someone at once. Okta publishes guidance on exactly this pattern.',
    teaches: { skill: 'Read the alerts you already have', secplus: '4.4 Alerting and monitoring' },
  },
  {
    id: 'reenroll',
    at: t(8, 20),
    from: { name: 'MGM IT Security', address: 'it-security@mgm-sso-help.com' },
    to: ME,
    subject: 'ACTION REQUIRED: re-enroll your MFA device today',
    external: true,
    phish: true,
    body: [
      'Due to a security update, all employees must re-enroll their MFA device before 10:00 AM today.',
      'Accounts that are not re-enrolled will be locked to protect company data.',
      { link: 'reenroll', text: 'Re-enroll my device', href: 'https://sso.mgm-sso-help.com/enroll?ref=update' },
      'MGM IT Security',
    ],
    headers: [
      'Return-Path: <bounce@mgm-sso-help.com>',
      'Received: from mail.mgm-sso-help.com (203.0.113.91)',
      '  by mx.mgmresorts.com with ESMTP id 5C0E9A11;',
      '  Sun, 10 Sep 2023 08:20:40 -0700 (PDT)',
      'Authentication-Results: mx.mgmresorts.com;',
      '  spf=pass smtp.mailfrom=mgm-sso-help.com;',
      '  dkim=none (message not signed);',
      '  dmarc=none header.from=mgm-sso-help.com',
      'From: MGM IT Security <it-security@mgm-sso-help.com>',
      'Subject: ACTION REQUIRED: re-enroll your MFA device today',
    ],
    notes: {
      'Return-Path:': 'mgm-sso-help.com is not mgmresorts.com. Anyone can register a name with a brand in it.',
      'Authentication-Results:': 'SPF "passes" only because the sender owns the lookalike domain. No DKIM, no DMARC.',
    },
    verdictNote: 'Phishing, the opportunistic kind. Not part of the reported MGM attack, but copycats show up whenever a breach is in the news. Real IT never sends a link and a deadline to re-enroll your MFA. Re-enrolling MFA is exactly what the real attacker wanted.',
    credsCost: { amount: 25000, text: 'Reset your account in the middle of an incident; check what the copycat touched (estimate for this replay)' },
    teaches: { skill: 'Stay skeptical during an incident', secplus: '2.2 Threat vectors: phishing, urgency' },
  },
];

export const PAGES = {
  reenroll: { kind: 'phish-login', url: 'https://sso.mgm-sso-help.com/enroll?ref=update', secure: true, brand: 'MGM SSO', heading: 'Re-enroll your MFA device', small: 'Security update. Sign in to keep your account active.', done: 'Thank you. Your device is enrolled. (It isn\'t. Your password just left the building.)' },
};

export const REPLY_DRAFTS = {
  handoff: 'Thanks. Looking at d.voss now. Please call back on the directory number for anything like this from now on.',
  'identity-digest': 'Looking at d.voss now.',
  reenroll: 'Done, I re-enrolled.',
};
