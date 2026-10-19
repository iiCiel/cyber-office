// Case file: Capital One 2019. The inbox on the morning the tip arrived (Wednesday, July 17, 2019).
//   - The disclosure tip (real in spirit: on July 17 an outsider emailed Capital One's responsible-disclosure
//     address about data on GitHub; the wording and sender here are invented)
//   - A cloud config digest (illustrative automated report: the kind of finding that was sitting in plain sight)
//   - A "your AWS account will be suspended" phish. NOT part of the real incident: copycats follow every
//     breach, so it is here to test the player under pressure.
// Internal addresses use capone.example, a documentation-style domain: the real mail setup was never published.
const t = (h, m) => h * 60 + m;
const ME = 'cloud-security@capone.example';

export const EMAILS = [
  {
    id: 'tip',
    at: t(7, 50),
    from: { name: 'A. Reporter', address: 'a.reporter.sec@mail.example' },
    to: 'disclosure@capone.example',
    subject: 'Possible leaked data from your cloud storage',
    external: true,
    phish: false,
    body: [
      'Hello,',
      'There seems to be some leaked data of yours, posted publicly on GitHub. It looks like it was taken from cloud storage buckets, and it has names of what appear to be your buckets.',
      'I am not affiliated with whoever posted it. I am telling you in case it is real. [The link to the public file was removed in this replay.]',
      'Please let me know you got this.',
    ],
    headers: [
      'Return-Path: <a.reporter.sec@mail.example>',
      'Received: from mail-relay.mail.example (203.0.113.140)',
      '  by mx.capone.example with ESMTPS id 71C0E4B2;',
      '  Wed, 17 Jul 2019 07:50:33 -0400 (EDT)',
      'Authentication-Results: mx.capone.example;',
      '  spf=pass smtp.mailfrom=mail.example;',
      '  dkim=pass header.d=mail.example;',
      '  dmarc=pass header.from=mail.example',
      'From: A. Reporter <a.reporter.sec@mail.example>',
      'To: disclosure@capone.example',
      'Subject: Possible leaked data from your cloud storage',
    ],
    notes: {
      'Authentication-Results:': 'All pass, but that only proves the mail came from the domain it says. It says nothing about whether the claim is true.',
      'Return-Path:': 'A personal address from a stranger. That is exactly who a responsible-disclosure inbox exists for.',
    },
    verdictNote: 'Real, and it is the way this breach was actually found. On July 17, 2019 an outsider emailed Capital One\'s responsible-disclosure address about data on GitHub, and the company confirmed the incident two days later. Months of attacker activity had set off no internal alarm. An unsolicited email from a stranger is not automatically a scam. Check the claim; do not guess from the sender.',
    teaches: { skill: 'Triage a responsible-disclosure report fast', secplus: '4.8 Incident response: detection and analysis' },
  },
  {
    id: 'cloud-digest',
    at: t(6, 5),
    from: { name: 'Cloud Config Audit', address: 'cloud-audit@capone.example' },
    to: 'cloud-security@capone.example',
    subject: '[Weekly] Open cloud configuration findings',
    external: false,
    phish: false,
    body: [
      'Automated report. Findings open longer than 30 days:',
      'HIGH    i-0a1b2c3d (waf-prod-03): app-layer proxy can reach the instance metadata service; no outbound destination filter. Open 74 days.',
      'HIGH    role corp-waf-role: policy allows s3:ListAllMyBuckets and s3:GetObject on arn:aws:s3:::*. Last reviewed: never.',
      'MED     No alert rule for "instance role credentials used from outside our own network".',
      'LOW     3 untagged buckets.',
      'This report is generated weekly. Nobody is paged for HIGH findings.',
    ],
    headers: [
      'Return-Path: <cloud-audit@capone.example>',
      'Received: from reports02.capone.example (10.40.3.18)',
      '  by mx.capone.example with ESMTPS id 5E0A3D10;',
      '  Wed, 17 Jul 2019 06:05:02 -0400 (EDT)',
      'Authentication-Results: mx.capone.example;',
      '  spf=pass smtp.mailfrom=capone.example;',
      '  dkim=pass header.d=capone.example;',
      '  dmarc=pass header.from=capone.example',
      'From: Cloud Config Audit <cloud-audit@capone.example>',
      'Subject: [Weekly] Open cloud configuration findings',
    ],
    notes: { 'Received:': 'An internal reporting server. A real, scheduled report.' },
    verdictNote: 'Real, and illustrative. This digest is invented, but the pattern is the lesson: the OCC later faulted the bank for moving to the public cloud without effective risk assessment, and for not fixing deficiencies in time. A finding that nobody is paged for is a finding that stays open. The attack used exactly these two gaps: an over-reachable server and an over-powerful role.',
    teaches: { skill: 'Act on the findings your tools already report', secplus: '4.4 Alerting and monitoring' },
  },
  {
    id: 'aws-suspend',
    at: t(8, 10),
    from: { name: 'AWS Security', address: 'security@aws-account-verify.com' },
    to: ME,
    subject: 'URGENT: IAM keys exposed. Verify your account within 2 hours',
    external: true,
    phish: true,
    body: [
      'We detected exposed access keys on your AWS account. To avoid suspension, verify your credentials now.',
      { link: 'aws-verify', text: 'Verify my AWS account', href: 'https://console.aws-account-verify.com/signin?ref=iam-alert' },
      'Accounts not verified within 2 hours will be locked.',
      'AWS Security Team',
    ],
    headers: [
      'Return-Path: <bounce@aws-account-verify.com>',
      'Received: from mail.aws-account-verify.com (203.0.113.91)',
      '  by mx.capone.example with ESMTP id 4D8F2B01;',
      '  Wed, 17 Jul 2019 08:10:21 -0400 (EDT)',
      'Authentication-Results: mx.capone.example;',
      '  spf=pass smtp.mailfrom=aws-account-verify.com;',
      '  dkim=none (message not signed);',
      '  dmarc=none header.from=aws-account-verify.com',
      'From: AWS Security <security@aws-account-verify.com>',
      'Subject: URGENT: IAM keys exposed. Verify your account within 2 hours',
    ],
    notes: {
      'Return-Path:': 'aws-account-verify.com is not amazon.com or aws.amazon.com. Anyone can register a name with a brand in it.',
      'Authentication-Results:': 'SPF "passes" only because the sender owns the lookalike domain. No DKIM, no DMARC.',
    },
    verdictNote: 'Phishing, the opportunistic kind. Not part of the real Capital One incident: copycats follow every headline. Real AWS notices do not ask you to sign in through an emailed link under a two-hour threat. Cloud console passwords and keys are the prize the real attacker never needed to phish.',
    credsCost: { amount: 30000, text: 'Rotate your console credentials and keys, review the audit trail for what the copycat touched (estimate for this replay)' },
    teaches: { skill: 'Spot cloud-credential phishing', secplus: '2.2 Threat vectors: phishing, urgency' },
  },
];

export const PAGES = {
  'aws-verify': { kind: 'phish-login', url: 'https://console.aws-account-verify.com/signin?ref=iam-alert', secure: true, brand: 'AWS Sign-In', heading: 'Verify your AWS account', small: 'Exposed keys detected. Sign in to keep your account active.', done: 'Thank you. Your account is verified. (It isn\'t. Your password just left the building.)' },
};

export const REPLY_DRAFTS = {
  tip: 'Thank you. We received your report and are looking at it now. Please keep the details private while we investigate.',
  'cloud-digest': 'Looking at the two HIGH items now.',
  'aws-suspend': 'Done, I verified.',
};
