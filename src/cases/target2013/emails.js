// Case file: Target 2013. The inbox on Monday, Dec 2, 2013 (Cyber Monday). Wording is illustrative.
//   - An escalation from the monitoring team about the FireEye alerts (real: Bloomberg reported the offsite team flagged them)
//   - A weekly vendor-access digest (automated; would have shown the stolen vendor login)
//   - An industry bulletin about RAM-scraping malware (real: Visa published warnings in April and August 2013)
//   - A "vendor access recertification" phish. NOT part of the reported incident: opportunistic phishing follows every
//     public breach and every holiday rush, so it is here to test the player under pressure.
const t = (h, m) => h * 60 + m;
const ME = 'soc-analyst@target.com';

export const EMAILS = [
  {
    id: 'fireeye-escalation',
    at: t(7, 48),
    from: { name: 'Monitoring Desk (offsite)', address: 'monitoring-ops@target.com' },
    to: 'soc@target.com',
    subject: 'FireEye malware.binary on app-stage01: 5 alerts, still NEW',
    external: false,
    phish: false,
    body: [
      'Hi SOC,',
      'FireEye has fired malware.binary on app-stage01 five times: three on Saturday, two overnight. All still NEW, none assigned.',
      'Symantec logged a suspicious process on the same server on Thursday. FireEye is in alert-only mode, so nothing was deleted.',
      'Two of the alerts decode a callback to an FTP server outside our network. We have flagged this before. Please review.',
      'Monitoring desk',
    ],
    headers: [
      'Return-Path: <monitoring-ops@target.com>',
      'Received: from mail-int.target.com (10.70.1.11)',
      '  by mx.target.com with ESMTPS id 4F12A9C0;',
      '  Mon, 02 Dec 2013 07:48:09 -0600 (CST)',
      'Authentication-Results: mx.target.com;',
      '  spf=pass smtp.mailfrom=target.com;',
      '  dkim=pass header.d=target.com',
      'From: Monitoring Desk (offsite) <monitoring-ops@target.com>',
      'To: soc@target.com',
      'Subject: FireEye malware.binary on app-stage01: 5 alerts, still NEW',
    ],
    notes: {
      'Authentication-Results:': 'All pass: this is a real internal message from the real monitoring mailbox.',
      'Received:': 'Sent through the internal relay. Nothing external.',
    },
    verdictNote: 'Real, and it is the whole story in five lines. A decoded callback to an outside FTP server is the opposite of a false positive. Per Bloomberg Businessweek, the offsite team really did notice and pass alerts on, and nothing happened. Reading the alert is not the same as owning it.',
    teaches: { skill: 'Triage alerts by what they say and where they come from, not by the signature name', secplus: '4.4 Alerting and monitoring' },
  },
  {
    id: 'vendor-digest',
    at: t(6, 30),
    from: { name: 'Access Reports', address: 'access-reports@target.com' },
    to: 'secops@target.com',
    subject: '[Digest] Vendor portal sign-ins from new locations, last 30 days',
    external: false,
    phish: false,
    body: [
      'Automated report. Vendor accounts that signed in from an address not seen before:',
      'fazio-hvac   Nov 12 06:41   NEW IP 203.0.113.44   2fa: none   usual: 192.0.2.88 (Sharpsburg)',
      'hvac-mgmt-co Nov 20 09:12   known IP 192.0.2.91    2fa: token  OK',
      'Vendor accounts with no second factor: 31 of 38. Review rules are in the portal admin console. Generated weekly.',
    ],
    headers: [
      'Return-Path: <access-reports@target.com>',
      'Received: from reports01.target.com (10.70.3.18)',
      '  by mx.target.com with ESMTPS id 7C21B0DE;',
      '  Mon, 02 Dec 2013 06:30:02 -0600 (CST)',
      'Authentication-Results: mx.target.com;',
      '  spf=pass smtp.mailfrom=target.com;',
      '  dkim=pass header.d=target.com',
      'From: Access Reports <access-reports@target.com>',
      'Subject: [Digest] Vendor portal sign-ins from new locations, last 30 days',
    ],
    notes: { 'Received:': 'An internal reporting server. A real, scheduled report.' },
    verdictNote: 'Real. Compare the two rows. One vendor signs in from where it always does and carries a token. The other signs in from a brand-new IP, with no second factor. A weekly digest is too slow: a first-time login on a vendor account should be looked at within hours, and 31 of 38 vendors with no second factor is the bigger problem. In the real breach, Target reportedly rarely required two-factor from small contractors.',
    teaches: { skill: 'Review third-party access and enforce two-factor for vendors', secplus: '5.3 Third-party risk: vendor assessment and monitoring' },
  },
  {
    id: 'ram-bulletin',
    at: t(7, 5),
    from: { name: 'Threat Intel Digest', address: 'intel-digest@target.com' },
    to: 'secops@target.com',
    subject: 'Industry bulletin: card-stealing malware on retail registers (RAM scraping)',
    external: false,
    phish: false,
    body: [
      'Summary of public warnings this year. Card networks warned retailers in April and August that malware can read card numbers from a register\'s memory, before they are encrypted.',
      'Their advice, in short: keep registers on their own network segment, require two-factor for remote access, allow only approved programs to run on registers, and watch for new services and odd outbound traffic.',
      'Action for us: confirm which of these are in place for the payment network. Reply to the intel desk with gaps.',
      '(Paraphrased for this replay.)',
    ],
    headers: [
      'Return-Path: <intel-digest@target.com>',
      'Received: from intel01.target.com (10.70.3.40)',
      '  by mx.target.com with ESMTPS id 9A11E4B7;',
      '  Mon, 02 Dec 2013 07:05:44 -0600 (CST)',
      'Authentication-Results: mx.target.com;',
      '  spf=pass smtp.mailfrom=target.com;',
      '  dkim=pass header.d=target.com',
      'From: Threat Intel Digest <intel-digest@target.com>',
      'Subject: Industry bulletin: card-stealing malware on retail registers (RAM scraping)',
    ],
    notes: { 'Received:': 'Internal intel server. Real, scheduled.' },
    verdictNote: 'Real. Warnings like this existed: per Reuters, Visa published two about RAM-scraping malware in 2013, and the FBI said the technique had been seen since 2011. A bulletin only helps if somebody checks the list against the network. The gap list here would have included flat networks and registers that run any program.',
    teaches: { skill: 'Turn threat intelligence into a checklist for your own network', secplus: '2.5 Mitigation techniques: segmentation, allow lists, access control' },
  },
  {
    id: 'recert',
    at: t(8, 15),
    from: { name: 'Vendor Management', address: 'vendor-mgmt@partnersonline-access.com' },
    to: ME,
    subject: 'ACTION REQUIRED: recertify contractor access by 5 PM today',
    external: true,
    phish: true,
    body: [
      'As part of the holiday security review, every employee who sponsors a contractor must recertify that contractor\'s portal access today.',
      'Sponsors who do not recertify by 5:00 PM will have all their contractor accounts suspended during the busiest week of the year.',
      { link: 'recert', text: 'Recertify contractor access', href: 'https://partnersonline-access.com/recertify?ref=holiday' },
      'Vendor Management',
    ],
    headers: [
      'Return-Path: <bounce@partnersonline-access.com>',
      'Received: from mail.partnersonline-access.com (203.0.113.91)',
      '  by mx.target.com with ESMTP id 2D40B8F3;',
      '  Mon, 02 Dec 2013 08:15:31 -0600 (CST)',
      'Authentication-Results: mx.target.com;',
      '  spf=pass smtp.mailfrom=partnersonline-access.com;',
      '  dkim=none (message not signed);',
      '  dmarc=none header.from=partnersonline-access.com',
      'From: Vendor Management <vendor-mgmt@partnersonline-access.com>',
      'Subject: ACTION REQUIRED: recertify contractor access by 5 PM today',
    ],
    notes: {
      'Return-Path:': 'partnersonline-access.com is not target.com. Anyone can register a name that sounds like a company portal.',
      'Authentication-Results:': 'SPF "passes" only because the sender owns the lookalike domain. No DKIM, no DMARC.',
    },
    verdictNote: 'Phishing, the opportunistic kind. Not part of the reported Target attack, where the phishing hit the contractor, not Target. But vendor logins are exactly what attackers want, and a deadline plus a threat to suspend accounts is the usual push. Real access reviews do not ask you to type a password into a link.',
    credsCost: { amount: 30000, text: 'Reset your account and check what the copycat touched (estimate for this replay)' },
    teaches: { skill: 'Spot phishing aimed at people who manage vendor access', secplus: '2.2 Threat vectors: phishing, urgency' },
  },
];

export const PAGES = {
  recert: { kind: 'phish-login', url: 'https://partnersonline-access.com/recertify?ref=holiday', secure: true, brand: 'Partners Online', heading: 'Recertify contractor access', small: 'Holiday security review. Sign in to continue.', done: 'Thank you. Your contractors are recertified. (They aren\'t. Your password just left the building.)' },
};

export const REPLY_DRAFTS = {
  'fireeye-escalation': 'Thanks. Taking app-stage01 now. Please keep the alerts open and unassigned until I confirm.',
  'vendor-digest': 'Looking at fazio-hvac now.',
  'ram-bulletin': 'Thanks. I will check the payment network against this list.',
  recert: 'Done, I recertified.',
};
