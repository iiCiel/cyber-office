// Lab: Halcyon Mutual, Tuesday Oct 27, 2026. The morning inbox after the key leaked.
//   - GitHub's secret scanning notice and AWS's exposed-key notice (both real kinds of mail; wording is illustrative)
//   - The budget alarm (the first thing many teams actually notice)
//   - A copycat "AWS account suspended" phish (not part of the intrusion)
const t = (h, m) => h * 60 + m;
const ME = 'cloud-security@halcyonmutual.com';

const headers = (from, addr, ip, id, date, subject, auth = true) => [
  `Return-Path: <${addr}>`,
  `Received: from mail.${addr.split('@')[1]} (${ip})`,
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
    id: 'aws-exposed',
    at: t(5, 31),
    from: { name: 'Amazon Web Services', address: 'no-reply-aws@amazon.com' },
    to: ME,
    subject: '[Action Required] Your AWS access key is exposed (Account 111122223333)',
    external: true,
    phish: false,
    body: [
      'Dear AWS customer,',
      'We have become aware that the AWS Access Key AKIA3HALCYONCIDEPLOY (belonging to IAM user "ci-deploy") along with the corresponding Secret Key is publicly available online at https://github.com/halcyon/claims-etl/blob/main/.env.',
      'To protect your account, we have applied the AWSCompromisedKeyQuarantineV3 policy to the user. This policy restricts some actions, such as launching resources, but it does NOT remove the access the key already had.',
      'Please delete the key, review CloudTrail for unauthorized activity, and follow the instructions in AWS Support case 17234098765. Do not remove the quarantine policy until instructed.',
      'Regards, Amazon Web Services, Trust and Safety',
    ],
    headers: headers('Amazon Web Services', 'no-reply-aws@amazon.com', '203.0.113.150', '8A31C0D2', 'Mon, 26 Oct 2026 17:15:41 -0400 (EDT)', '[Action Required] Your AWS access key is exposed'),
    notes: { 'Return-Path:': 'amazon.com. This one is the real sender, and the claim can be checked: the GitHub link is ours.', 'Authentication-Results:': 'SPF, DKIM and DMARC all pass for amazon.com. Passing proves who sent it; here the contents are also verifiable.' },
    verdictNote: 'Real. AWS scans public sources for exposed keys, quarantines them within seconds or minutes, and emails the account. The detail to read twice: the quarantine limits THAT key. It does not undo what was already done with it.',
    teaches: { skill: 'Treat a provider\'s exposed-credential notice as an incident, not a receipt', secplus: '4.8 Incident response: detection and analysis' },
  },
  {
    id: 'github-secret',
    at: t(5, 32),
    from: { name: 'GitHub', address: 'noreply@github.com' },
    to: 't.okoye@halcyonmutual.com',
    subject: '[halcyon/claims-etl] Secret scanning alert: Amazon AWS Access Key ID',
    external: true,
    phish: false,
    body: [
      'A secret was detected in halcyon/claims-etl:',
      'Secret type: Amazon AWS Access Key ID',
      'Location: .env:3 (commit a91f3c2)',
      'The repository became public at 5:12 PM EDT on Oct 26. Revoke the secret first. Removing it from the code does not make it safe, because it stays in the git history.',
    ],
    headers: headers('GitHub', 'noreply@github.com', '203.0.113.151', '5D0E7A19', 'Mon, 26 Oct 2026 17:12:25 -0400 (EDT)', '[halcyon/claims-etl] Secret scanning alert'),
    notes: { 'Return-Path:': 'github.com, a real notification that was also copied to security by an inbox rule.' },
    verdictNote: 'Real, and it arrived 20 seconds after the repo went public. Secret scanning is an alarm, not a fix: the credential is only safe once it is revoked.',
    teaches: { skill: 'Know that a leaked secret must be revoked, not just deleted from the code', secplus: '2.3 Vulnerabilities: hard-coded credentials' },
  },
  {
    id: 'budget',
    at: t(2, 12),
    from: { name: 'AWS Budgets', address: 'budgets@amazon.com' },
    to: ME,
    subject: 'AWS Budgets: halcyon-prod forecasted to exceed budget',
    external: true,
    phish: false,
    body: [
      'Your Monthly cost budget "halcyon-prod" has exceeded the alert threshold.',
      'Budgeted amount: $4,000.00',
      'Forecasted amount: $48,215.77',
      'Largest increase: Amazon Elastic Compute Cloud (p3.16xlarge usage in us-east-1, us-west-1, us-west-2 and 5 other Regions).',
    ],
    headers: headers('AWS Budgets', 'budgets@amazon.com', '203.0.113.152', '1B44F6C8', 'Tue, 27 Oct 2026 02:12:03 -0400 (EDT)', 'AWS Budgets: halcyon-prod forecasted to exceed budget'),
    notes: { 'Return-Path:': 'amazon.com, an automated billing alert.' },
    verdictNote: 'Real. Miners are loud on the bill even when they are quiet in the logs. Many teams first learn about a leaked key from billing, hours later.',
    teaches: { skill: 'Use billing and budget alarms as a detection source', secplus: '4.4 Alerting and monitoring' },
  },
  {
    id: 'aws-suspend',
    at: t(7, 20),
    from: { name: 'AWS Account Security', address: 'security@aws-support-center.net' },
    to: ME,
    subject: 'Your AWS account will be suspended: confirm your identity',
    external: true,
    phish: true,
    body: [
      'We detected unusual activity on your AWS account. To avoid suspension within 12 hours, confirm your identity and billing details.',
      { link: 'aws-confirm', text: 'Confirm identity', href: 'https://aws-support-center.net/confirm?acct=111122223333' },
      'AWS Account Security',
    ],
    headers: headers('AWS Account Security', 'security@aws-support-center.net', '203.0.113.91', '7C20E4B1', 'Tue, 27 Oct 2026 07:20:09 -0400 (EDT)', 'Your AWS account will be suspended', false),
    notes: { 'Return-Path:': 'aws-support-center.net is not amazon.com or aws.amazon.com.', 'Authentication-Results:': 'SPF passes for the attacker\'s own domain. No DKIM, no DMARC.' },
    verdictNote: 'Phishing, the opportunistic kind that follows every public incident. The real AWS notice came from amazon.com and told you to act in your own account, not through a link.',
    credsCost: { amount: 30000, text: 'Rotate console credentials and review the account for what the copycat touched (estimate for this lab)' },
    teaches: { skill: 'Tell a real provider notice from a copycat', secplus: '2.2 Threat vectors: phishing' },
  },
];

export const PAGES = {
  'aws-confirm': { kind: 'phish-login', url: 'https://aws-support-center.net/confirm?acct=111122223333', secure: true, brand: 'AWS Sign-In', heading: 'Confirm your identity', small: 'Unusual activity detected.', done: 'Thank you. Your identity is confirmed. (It isn\'t. Your password just left the building.)' },
};

export const REPLY_DRAFTS = {
  'aws-exposed': 'Acknowledged. Opening an incident and starting on the key and the logs now.',
  'github-secret': 'Thanks. Do not delete the repo yet; we need it for evidence.',
  budget: 'Looking at the EC2 charges now.',
  'aws-suspend': 'Done, I confirmed.',
};
