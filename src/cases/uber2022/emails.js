// Case file: Uber 2022. The inbox on the evening of the breach.
//   - The contractor's own report (real, and the most important clue in the inbox)
//   - The MFA anomaly digest (real, automated, and nobody read it in time)
//   - A copycat "re-verify your SSO" phish. Not part of the real incident: copycat phishing follows
//     every public breach, so it's here to test the player under pressure.
const t = (h, m) => h * 60 + m;
const ME = 'soc-analyst@uber.com';

export const EMAILS = [
  {
    id: 'contractor',
    at: t(14, 31),
    from: { name: 'Ravi Osei (contractor)', address: 'r.osei@ext.uber.com' },
    to: 'it-support@uber.com',
    subject: 'Weird login prompts + someone from "IT" on WhatsApp??',
    external: false,
    phish: false,
    body: [
      'Hi IT,',
      'For about an hour my phone kept getting sign-in approval requests. Like 50 of them. I kept hitting deny.',
      'Then someone messaged me on WhatsApp saying they were from Uber IT. They said the prompts would keep coming until I accepted one, so I did.',
      'Was that actually you? It stopped after that.',
      'Ravi',
    ],
    headers: [
      'Return-Path: <r.osei@ext.uber.com>',
      'Received: from mail-ext.uber.com (10.20.2.11)',
      '  by mx.uber.com with ESMTPS id 7C21A0F3;',
      '  Thu, 15 Sep 2022 14:31:08 -0700 (PDT)',
      'Authentication-Results: mx.uber.com;',
      '  spf=pass smtp.mailfrom=ext.uber.com;',
      '  dkim=pass header.d=ext.uber.com;',
      '  dmarc=pass header.from=ext.uber.com',
      'From: Ravi Osei <r.osei@ext.uber.com>',
      'To: it-support@uber.com',
      'Subject: Weird login prompts + someone from "IT" on WhatsApp??',
    ],
    notes: {
      'Authentication-Results:': 'All pass: this really is the contractor, from the contractor mail domain.',
      'Received:': 'Sent through our own mail relay. Nothing external about it.',
    },
    verdictNote: 'Real, and it is the whole story in four lines: MFA fatigue (the push flood) plus social engineering (the fake IT message on WhatsApp). IT never asks you to approve a prompt. Reported this way, at 14:31, it was the earliest warning anyone got.',
    teaches: { skill: 'Spot MFA fatigue in a user report', secplus: '2.2 Threat vectors: social engineering, impersonation' },
  },
  {
    id: 'mfa-digest',
    at: t(15, 0),
    from: { name: 'MFA Reports', address: 'mfa-reports@uber.com' },
    to: 'secops@uber.com',
    subject: '[Digest] MFA anomalies, last 2 hours',
    external: false,
    phish: false,
    body: [
      'Automated report. Accounts with unusual MFA activity:',
      'r.osei@ext.uber.com    54 denied or timed-out pushes, then 1 approved (14:14). New device. Source: London, GB.',
      'k.mensah@uber.com      2 timed-out pushes, then 1 approved. Known device.',
      'This digest is generated every 2 hours. Configure thresholds in the MFA admin console.',
    ],
    headers: [
      'Return-Path: <mfa-reports@uber.com>',
      'Received: from reports01.uber.com (10.20.3.18)',
      '  by mx.uber.com with ESMTPS id 1E00B2C4;',
      '  Thu, 15 Sep 2022 15:00:02 -0700 (PDT)',
      'Authentication-Results: mx.uber.com;',
      '  spf=pass smtp.mailfrom=uber.com;',
      '  dkim=pass header.d=uber.com;',
      '  dmarc=pass header.from=uber.com',
      'From: MFA Reports <mfa-reports@uber.com>',
      'Subject: [Digest] MFA anomalies, last 2 hours',
    ],
    notes: { 'Received:': 'An internal reporting server. A real, scheduled report.' },
    verdictNote: 'Real. And look at the first line: 54 failures then one approval from a new device in another country. A digest every two hours is too slow for that. It should page someone the moment it happens.',
    teaches: { skill: 'Read the alerts you already have', secplus: '4.4 Alerting and monitoring' },
  },
  {
    id: 'sso-reverify',
    at: t(16, 22),
    from: { name: 'Uber IT Security', address: 'it-security@uber-ssoverify.com' },
    to: ME,
    subject: 'URGENT: security incident in progress. Re-verify your SSO now',
    external: true,
    phish: true,
    body: [
      'Due to an ongoing security incident, all employees must re-verify their SSO credentials within 30 minutes.',
      'Accounts that are not re-verified will be locked to protect company data.',
      { link: 'reverify', text: 'Re-verify my account', href: 'https://sso.uber-ssoverify.com/login?ref=incident' },
      'Uber IT Security',
    ],
    headers: [
      'Return-Path: <bounce@uber-ssoverify.com>',
      'Received: from mail.uber-ssoverify.com (203.0.113.91)',
      '  by mx.uber.com with ESMTP id 4F9D1A27;',
      '  Thu, 15 Sep 2022 16:22:40 -0700 (PDT)',
      'Authentication-Results: mx.uber.com;',
      '  spf=pass smtp.mailfrom=uber-ssoverify.com;',
      '  dkim=none (message not signed);',
      '  dmarc=none header.from=uber-ssoverify.com',
      'From: Uber IT Security <it-security@uber-ssoverify.com>',
      'Subject: URGENT: security incident in progress. Re-verify your SSO now',
    ],
    notes: {
      'Return-Path:': 'uber-ssoverify.com is not uber.com. Anyone can register a domain with a brand name in it.',
      'Authentication-Results:': 'SPF "passes" only because the attacker owns the lookalike domain. No DKIM, no DMARC.',
    },
    verdictNote: 'Phishing, the copycat kind. Within an hour of any public breach, scammers send "re-verify your account" emails that use the chaos as cover. Real IT announces resets in Slack and on the intranet, never with a 30-minute lockout threat from an outside domain.',
    credsCost: { amount: 25000, text: 'Reset your account in the middle of an incident; check what the copycat touched' },
    teaches: { skill: 'Stay skeptical during an incident', secplus: '2.2 Threat vectors: phishing, urgency' },
  },
];

export const PAGES = {
  reverify: { kind: 'phish-login', url: 'https://sso.uber-ssoverify.com/login?ref=incident', secure: true, brand: 'Uber SSO', heading: 'Re-verify your account', small: 'Security incident in progress. Sign in to keep your account active.', done: 'Thank you. Your account is verified. (It isn\'t. Your password just left the building.)' },
};

export const REPLY_DRAFTS = {
  contractor: 'Hi Ravi, that was NOT us. IT never asks you to approve a prompt. Please do not accept any more. The SOC is on it right now.',
  'mfa-digest': 'Looking at r.osei now.',
  'sso-reverify': 'Done, I re-verified.',
};
