// Overnight shift handoff from the MDR (managed detection and response) provider that watches Halcyon's SIEM
// from 22:00 to 07:00. Real SOCs hand off with a short structured note: what's open, what was closed and why,
// what to watch. The open items come from that night's generated logs (same times, hosts, accounts, IPs);
// the closed P4 items are routine filler.
// The overnight analyst gets some calls wrong (a real risk of handoffs): the player has to check, not trust.
const t = (h, m) => h * 60 + m;
const MDR = { name: 'Ravi Desai (Northgate MDR)', address: 'r.desai@northgatemdr.com' };
const DAYS = { 2: ['Tue', 20, 'Mon 10/19', 'Tue 10/20'], 3: ['Wed', 21, 'Tue 10/20', 'Wed 10/21'], 4: ['Thu', 22, 'Wed 10/21', 'Thu 10/22'], 5: ['Fri', 23, 'Thu 10/22', 'Fri 10/23'] };

const headers = (n, subject, id, time) => {
  const [wd, d] = DAYS[n];
  return [
    `Return-Path: <${MDR.address}>`,
    'Received: from mail-bn8nam12on2104.outbound.protection.outlook.com (40.107.237.104)',
    `  by mail01.halcyonmutual.com (Postfix) with ESMTPS id ${id};`,
    `  ${wd}, ${d} Oct 2026 ${time} -0400 (EDT)`,
    'Authentication-Results: mail01.halcyonmutual.com;',
    '  spf=pass smtp.mailfrom=northgatemdr.com;',
    '  dkim=pass header.d=northgatemdr.com;',
    '  dmarc=pass header.from=northgatemdr.com',
    `From: ${MDR.name} <${MDR.address}>`,
    'To: secops@halcyonmutual.com',
    'Cc: soc-shift@northgatemdr.com',
    `Subject: ${subject}`,
    `Date: ${wd}, ${d} Oct 2026 ${time} -0400`,
  ];
};

const BODY = {
  2: () => ({
    ticket: 'NGM-48213',
    lines: [
      'SHIFT SUMMARY\nQuiet night. 1 item handed to day shift, 2 closed, 0 P1 calls.',
      'OPEN / FOR DAY SHIFT\n[P3] NGM-48213  Okta MFA push denials for m.chen\n  06:41-07:00  26 push denies or timeouts, source 198.51.100.77 (geo NL).\n  Password step succeeded at 06:40.\n  Today is your MFA rollout day (per your IT notice), so this is probably enrollment noise.\n  Not confirmed with the user (outside business hours). Please confirm and close.',
      'CLOSED THIS SHIFT\n[P4] NGM-48201  4625 x214 on WS-0131, locked-out cached creds after a password change. Benign. Closed.\n[P4] NGM-48207  Windows Update traffic spike 02:00-02:40 (WSUS). Expected. Closed.',
      'WATCHLIST\n- Your Day 1 phish and brute-force IPs are on our watchlist. No new hits.\n- WAN scan noise on fw01 normal (blocked by rule 5).',
      'Ravi Desai\nTier 1 Analyst, Overnight | Northgate MDR\nShift 22:00-07:00 ET | Tickets: portal.northgatemdr.com',
    ],
    note: 'The open item is real and it is not enrollment noise: a correct password from the Netherlands followed by 26 pushes is MFA fatigue. Overnight analysts see one slice; check the logs yourself.',
  }),
  3: () => ({
    ticket: 'NGM-48288',
    lines: [
      'SHIFT SUMMARY\n1 item handed to day shift, 1 closed, 0 P1 calls.',
      'OPEN / FOR DAY SHIFT\n[P2] NGM-48288  ModSecurity 942100 (SQL injection) on WEB01, /api/claims\n  02:10-02:33  repeated hits from 198.51.100.23, many HTTP 500s.\n  WAF is in DetectionOnly mode, so nothing was blocked.\n  02:33 there is a POST /admin/login (302) and then GET /admin/export?table=customers (200, ~31 MB) from the same IP.\n  I could not tell if that export is a scheduled admin job. No change ticket found. Not a P1 by your escalation matrix (no outage, no EDR alert), so no phone call.',
      'CLOSED THIS SHIFT\n[P4] NGM-48279  Okta: 3 users re-enrolled MFA after the rollout. Expected. Closed.',
      'WATCHLIST\n- 198.51.100.77 (Tue MFA case) on our watchlist. No hits overnight.\n- Still pending from you: decision on WAF blocking mode.',
      'Ravi Desai\nTier 1 Analyst, Overnight | Northgate MDR\nShift 22:00-07:00 ET',
    ],
    note: 'The open item is the breach. SQL injection errors, then an admin login and a 31 MB customer export from the same IP, is data theft, and a P2 queue is too slow for it.',
  }),
  4: () => ({
    ticket: 'NGM-48341',
    lines: [
      'SHIFT SUMMARY\n2 items handed to day shift, 1 closed, 0 P1 calls.',
      'OPEN / FOR DAY SHIFT\n[P3] NGM-48336  Veeam job "Nightly-Full" FAILED at 01:00 on BACKUP01\n  Insufficient free space on E: (12 MB free). Last successful full: Sun Oct 18 02:41.\n  No successful full backup since Sunday. Needs your IT team, we have no access to BACKUP01.',
      '[P2] NGM-48341  Large upload to online storage by svc_backup\n  01:58 RDP logon (type 10) svc_backup from 172.16.0.91 to FILE01.\n  02:39 proxy ALLOW svc_backup -> g.api.mega.co.nz:443, bytes_out 4,512,331,904 (category Online Storage).\n  Could be an offsite backup copy, it is the backup account. Please confirm with IT that Mega is approved.',
      'CLOSED THIS SHIFT\n[P4] NGM-48330  WEB01 maintenance page 23:10-23:40 (portal patch). Expected. Closed.',
      'Ravi Desai\nTier 1 Analyst, Overnight | Northgate MDR\nShift 22:00-07:00 ET',
    ],
    note: 'Both open items matter. A backup account that logs on interactively (RDP) and sends 4.5 GB to Mega is exfiltration, not a backup. And nobody has a working backup since Sunday.',
  }),
  5: (c) => {
    const actor = c.d4Contained ? 'admin_helpdesk' : 'svc_backup';
    return {
      ticket: 'NGM-48402',
      lines: [
        'SHIFT SUMMARY\n0 items open, 2 closed, 0 P1 calls.',
        'OPEN / FOR DAY SHIFT\nNone.',
        `CLOSED THIS SHIFT\n[P3] NGM-48402  vssadmin delete shadows /all /quiet on DC01\n  03:46:20 by ${actor}, after a VPN logon at 03:40 and RDP to DC01 at 03:42.\n  ${c.d4Contained ? 'Account looks like a helpdesk admin doing maintenance.' : 'Matches the backup service account, and backup software uses vssadmin.'} Closed as benign true positive.\n[P4] NGM-48399  fw01 rule 5 drops from WAN scanners. Normal. Closed.`,
        'NOTE\nDC01 also has a new scheduled task "Updater" created 03:45 (one-time, runs as SYSTEM). Did not alert. Mentioning it for completeness.',
        'Have a good weekend.\nRavi Desai\nTier 1 Analyst, Overnight | Northgate MDR\nShift 22:00-07:00 ET',
      ],
      note: `This one was closed wrong. Deleting every shadow copy on a domain controller at 3:46 AM, right after ${actor} came in over the VPN, is the classic step before ransomware. So is a one-time SYSTEM task called "Updater" pointing at SYSVOL.`,
    };
  },
};

/** The overnight MDR handoff email for day n (2-5), or null for days without one. */
export function shiftHandoff(n, carry = {}) {
  if (!BODY[n]) return null;
  const [, , from, to] = DAYS[n];
  const b = BODY[n](carry);
  const subject = `[Halcyon] Overnight shift handoff ${from} 22:00 - ${to} 07:00 ET`;
  return {
    id: 'handoff',
    at: t(7, 4),
    from: MDR,
    to: 'secops@halcyonmutual.com',
    subject,
    external: true,
    phish: false,
    handoff: true,
    body: b.lines,
    headers: headers(n, subject, `7C${n}0A1F4`, '07:04:38'),
    notes: { 'Authentication-Results:': 'All pass for northgatemdr.com, our MDR provider.', 'Cc:': "The MDR's shift mailbox, so their next shift sees it too." },
    verdictNote: `Real. Our MDR provider's overnight handoff. ${b.note}`,
    teaches: { skill: 'Read the shift handoff, then verify it', secplus: '4.8 Incident response: escalation and handoff' },
  };
}
