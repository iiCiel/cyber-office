// Case file: Change Healthcare (UnitedHealth Group), February 2024. A recreation of a real attack, built from public statements.
// Same engine as the week (see src/days/index.js for every field); plus caseFile, which drives the
// Case Files menu card and the "what really happened" half of the report.
import { EMAILS, PAGES, REPLY_DRAFTS } from './emails.js';
import { generateLogs, ALERTS, CASE, IP_INFO, DATE } from './logs.js';
import { SPREAD_CALL, SPREAD_SCORE, EXTORTION_CALL, EXTORTION_SCORE } from './talk.js';
import { scoreEmail, scoreCase, scoreConversation, finalize } from '../../game/scoring.js';

const MAIN = 'change-citrix';
// Finding the portal: open the export itself, or grep for portals with no MFA.
const FIND_RE = /(portals\.csv|\bgrep\b.*\b(none|cx-remote01|mfa)\b)/i;

function portalItem(st) {
  const cmds = st.events.filter((e) => e.type === 'terminal-cmd');
  const found = cmds.some((e) => FIND_RE.test(e.cmd));
  return {
    id: 'portal',
    area: 'Terminal',
    title: 'Find the remote access portal with no MFA',
    max: 10,
    teaches: { skill: 'Audit remote access for missing MFA (grep)', secplus: '4.9 Use data sources to support an investigation' },
    outcome: found ? 'good' : cmds.length ? 'ok' : 'bad',
    points: found ? 10 : cmds.length ? 4 : 0,
    what: found ? `You found cx-remote01 in the portal export: password only, MFA not enforced (${cmds.length} command${cmds.length === 1 ? '' : 's'}).` : cmds.length ? 'You opened the Terminal but never looked at the portal list.' : 'You never audited the remote access portals.',
    why: 'This is the hinge of the whole attack. The CEO told Congress the Citrix portal "did not have multi-factor authentication", so a stolen login was enough. MFA should cover every remote access path with no exceptions list, and a portal on that list needs an owner and a deadline. The same export has one more weak profile.',
  };
}

function score(st) {
  return finalize([
    ...EMAILS.map((e) => scoreEmail(e, st.mail?.[e.id])),
    scoreConversation(SPREAD_SCORE, st.enc?.spread),
    portalItem(st),
    scoreConversation(EXTORTION_SCORE, st.enc?.extortion),
    scoreCase(CASE, st.soc?.cases?.[MAIN]),
  ]);
}

function debrief(st) {
  const r = score(st);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const lines = ["Okay. Replay over. Let's compare you to what was reported."];
  if (by.case.outcome === 'good') lines.push('Your write-up matches the reported chain: a stolen login on a Citrix portal with no MFA, nine days inside, data taken, then ALPHV/BlackCat ransomware on Feb 21.');
  else if (st.soc?.cases?.[MAIN]) lines.push('Your write-up missed part of the chain. As reported: stolen credentials on a Citrix portal with no MFA on Feb 12, lateral movement and data theft, then ransomware nine days later.');
  else lines.push('You never wrote it up. In the real attack, claims and pharmacy services were disrupted for weeks.');
  if (by.case.contained) lines.push('You disabled the account and cut the links. CISA\'s ALPHV advisory recommends phishing-resistant MFA, remote access controls, and watching for lateral movement.');
  if (by.portal.outcome === 'good') lines.push('And you found cx-remote01. The CEO told House members the portal "did not have multi-factor authentication".');
  if (st.enc?.spread?.outcome === 'severed') lines.push('You cut the data center links. So did the company on Feb 21. Claims went offline for pharmacies and providers nationwide. There was no free option.');
  else if (st.enc?.spread?.outcome === 'rebooted') lines.push('You rebooted and kept claims running. The company cut the links instead, and later called it "the right thing to do".');
  if (st.enc?.extortion?.outcome === 'process') lines.push('You sent the ransom question up with the FBI and counsel. That is how it should go. The real CEO said the decision to pay was his.');
  else if (st.enc?.extortion?.outcome === 'pay-now') lines.push('You wanted to pay at once. Reports say the company did pay, about $22 million, and a second group then claimed the same data and demanded more.');
  if (st.mail?.['status-phish']?.enteredCreds) lines.push('And you gave your password to the "recovery portal" phish. Outages attract scammers. Stay sharp when things are loud.');
  lines.push('Real outcome: the company said it paid a ransom. ALPHV reportedly kept the money, cut off the affiliate, and a second group claimed the data. Change later reported about 190 million people affected (later updated to 192.7 million), the largest US health data breach on record.');
  lines.push('There is no "right answer" on the ransom in this replay. It is a leadership and legal call, made with the FBI.');
  lines.push("Here's your case report, and what you can honestly say you've done.");
  return lines;
}

const csv = (rows) => `${rows.map((r) => r.join(',')).join('\n')}\n`;

function terminal() {
  return {
    date: 'Wed Feb 21 2024',
    host: 'SOC-WS-07',
    motd: 'SOC workstation. Exports from the remote access gateway (cx-gw01) are under /mnt/exports/remote. Type help.\n',
    files: {
      '/mnt/exports/remote/README.txt': [
        'Nightly export from cx-gw01. Read-only copy.',
        'portals.csv   one row per remote access portal.',
        'accounts.csv  accounts that signed in this month.',
        'mfa=none means the portal accepts a password alone.',
        '',
      ].join('\n'),
      '/mnt/exports/remote/portals.csv': csv([
        ['portal', 'type', 'auth', 'mfa', 'last_review', 'exception_owner'],
        ['cx-remote02', 'Citrix desktop', 'password+push', 'enforced', '2024-02-05', '-'],
        ['vpn-gw01', 'VPN', 'password+push', 'enforced', '2024-02-05', '-'],
        ['vpn-contractors', 'VPN', 'password+push', 'enforced', '2024-02-05', '-'],
        ['rdg-admin01', 'RD Gateway', 'password+push', 'enforced', '2024-02-05', '-'],
        ['sftp-providers', 'SFTP', 'key', 'enforced', '2024-02-05', '-'],
        ['cx-remote01', 'Citrix desktop', 'password', 'none', '2023-06-14', 'unassigned'],
      ]),
      '/mnt/exports/remote/accounts.csv': csv([
        ['account', 'portal', 'status', 'last_used', 'source'],
        ['j.alvarez', 'cx-remote02', 'enabled', '2024-02-21', 'office'],
        ['k.mensah', 'cx-remote02', 'enabled', '2024-02-20', 'home'],
        ['d.ferraro', 'cx-remote02', 'enabled', '2024-02-20', 'home'],
        ['s.park', 'cx-remote02', 'enabled', '2024-02-19', 'home'],
        ['c.ellery', 'cx-remote01', 'enabled', '2024-02-21', 'external, 203.0.113.44'],
      ]),
      '/home/analyst01/note-photo.txt': [
        '[Photo of the note on an ops workstation, paraphrased. The real text is not reproduced here.]',
        'Says: your network is encrypted and your data was copied.',
        'Says: follow the contact instructions to get a decryptor and stop us publishing the data.',
        '(The contact and payment details are left out on purpose.)',
        '',
      ].join('\n'),
      '/home/analyst01/README.txt': [
        'Tips from Priya:',
        '  The remote access export is under /mnt/exports/remote. A few things to try:',
        '  cat /mnt/exports/remote/portals.csv          read the whole list',
        '  grep -i none /mnt/exports/remote/portals.csv  which portals have no MFA?',
        '  grep -c enforced <file>                       -c counts matching lines',
        '  sort -t, -k5 <file>                           sort by the 5th column (last_review)',
        `  whois 203.0.113.44                            who owns the attacker's IP?`,
        '',
      ].join('\n'),
    },
    whois: {
      '203.0.113.44': 'NetRange: 203.0.113.0 - 203.0.113.255\nOrgName: Example Anonymizing Hosting\nCountry: unknown\nComment: Rented servers, no customer details.\n(Stand-in. The real attacker IPs were not published.)',
      '198.51.100.130': 'NetRange: 198.51.100.0 - 198.51.100.255\nOrgName: Example Cloud Hosting\nCountry: US\nComment: Customer storage. Registered recently.\n(Stand-in.)',
      'chc-outage-status.net': 'Domain Name: CHC-OUTAGE-STATUS.NET\nCreation Date: 2024-02-21T09:40:12Z\nRegistrar: NameSilo, LLC\nRegistrant: REDACTED FOR PRIVACY\n(Registered a few hours ago. Illustrative.)',
    },
    dns: { 'chc-outage-status.net': 'Name:\tchc-outage-status.net\nAddress: 203.0.113.91' },
  };
}

export default {
  n: 2,
  caseId: 'change-2024',
  date: DATE,
  title: 'Change Healthcare · February 2024',
  start: 7 * 60,
  endAt: 10 * 60,
  intro: ['Case Files: Change Healthcare, February 21, 2024.', 'A replay of a real attack. Priya is running it from her office.'],
  badgeAtStart: true,
  cast: ['mike', 'theo'],

  emails: EMAILS,
  pages: PAGES,
  replyDrafts: REPLY_DRAFTS,
  logs: (st) => generateLogs({ nowMinutes: st.minutes, phishedAt: st.phishedAt() }),
  ipInfo: IP_INFO,
  alerts: ALERTS,
  terminal: terminal(),

  npcLines: {
    priya: {
      talk: [
        'Welcome to Case Files. Today we replay a real attack, step by step, from public statements.',
        "It's Wednesday, February 21, 2024, early morning. You're on the security team at Change Healthcare, part of UnitedHealth Group. Its systems connect pharmacies, hospitals and insurers, and handle claims for a huge share of US patients.",
        "The others are playing roles. The attacker's moves are what the company and the government said happened. Your moves are up to you.",
        'Start with your inbox. Claims are failing, and a hospital is already asking why.',
      ],
      again: ['Inbox first. Then follow whatever breaks.'],
    },
    dana: { talk: ["I'm on the pharmacy support line this morning. The phones haven't stopped."], again: ['Still no answers. Lots of calls.'] },
    mike: { talk: ["I'm playing an executive today. A bad day to be me."], again: ['Waiting on security.'] },
    theo: { talk: ["I'm a data center engineer. I keep the claims platform running."], again: ['The file errors are getting worse.'] },
  },

  objectives: [
    { id: 'priya', type: 'talk', text: 'Get the case briefing from Priya' },
    { id: 'my-desk', type: 'sit', text: 'Sit down at your desk' },
    { id: 'inbox', type: 'inbox', target: 'my-desk', text: 'Go through the security inbox' },
    { id: 'spread', type: 'encounter', target: 'theo', text: 'Theo is coming over from the data center', waitText: 'Someone from the data center is on the way.' },
    { id: 'portal', type: 'terminal', match: FIND_RE, target: 'my-desk', waitFor: 'alert', text: 'Terminal: audit the remote access portals for any with no MFA (grep)', waitText: 'Waiting on the SIEM.' },
    { id: 'extortion', type: 'encounter', target: 'mike', text: 'Mike is coming over, and he looks stressed', waitText: 'An executive wants an answer.' },
    { id: 'server-door', type: 'badge', text: 'Badge into the server room' },
    { id: 'soc', type: 'case', target: 'soc', text: 'Work the case at the SOC console' },
    { id: 'debrief', type: 'debrief', target: 'priya', text: 'Debrief with Priya: what was reported' },
  ],
  encounters: [
    { id: 'spread', type: 'walkup', npc: 'theo', after: 'inbox', delayMs: 1500, fallbackAt: 7 * 60 + 20, intro: 'Hey! Got a minute? It is spreading.', conv: SPREAD_CALL },
    { id: 'extortion', type: 'walkup', npc: 'mike', after: 'portal', delayMs: 1500, fallbackAt: 8 * 60 + 30, intro: 'I need to talk to you. Now.', conv: EXTORTION_CALL },
  ],

  score,
  debrief,

  caseFile: {
    id: 'change-2024',
    company: 'Change Healthcare',
    when: 'February 2024',
    title: 'No MFA, no claims',
    pitch: 'Stolen credentials on a remote-access portal without MFA, nine quiet days inside, then ransomware that stalled pharmacy claims nationwide.',
    tags: ['No MFA', 'Ransomware', 'Healthcare', 'ALPHV / BlackCat', 'Dwell time'],
    difficulty: 'Intermediate',
    headline: 'Criminals used stolen credentials on a Citrix portal with no MFA to get into Change Healthcare, spent nine days inside, then deployed ransomware. The ALPHV/BlackCat group claimed the attack. Pharmacy and provider claims were disrupted nationwide.',
    timeline: [
      { when: 'Before Feb 12, 2024', what: 'A Citrix remote-access portal at Change Healthcare accepts a password with no MFA. How the attackers got the credentials has not been made public.' },
      { when: 'Feb 12', what: 'The attackers sign in to the Citrix portal with compromised credentials (CEO written testimony, May 1, 2024).' },
      { when: 'Feb 12 to Feb 21', what: 'The attackers move laterally and take data (testimony). The exact steps, accounts and volumes have not been made public.' },
      { when: 'Feb 21', what: 'Ransomware is deployed nine days after the first login. UnitedHealth Group says in an SEC filing that day that a suspected nation-state actor had accessed some Change systems, and Change disconnects its data centers. Services go down.' },
      { when: 'Late Feb', what: 'ALPHV/BlackCat claims the attack and says it holds about 6 TB of data. That figure is the attacker\'s claim. UnitedHealth later says it believes cybercriminals, not a nation-state, were responsible. More than 90% of pharmacies move to workarounds.' },
      { when: 'Mar 1 to Mar 18', what: 'An e-prescribing workaround is offered on March 1, and a funding program for providers is set up. The UnitedHealth update of March 7 targets payments for March 15 and claims for March 18, and services come back in stages. How the attackers got in is only made public in the May 1 testimony of the CEO.' },
      { when: 'Early March (reported)', what: 'A ransom is paid. Reports put it at about $22 million in bitcoin. The ALPHV affiliate reportedly says the operators kept the money, and a second group, RansomHub, posts that it holds the data (April 8). Neither claim is verified.' },
      { when: 'May 1, 2024', what: 'The UnitedHealth Group CEO testifies to Congress that the portal "did not have multi-factor authentication" and that the decision to pay was his.' },
      { when: 'Jan 2025 and Jul 2025', what: 'The affected total is reported as about 190 million people, later updated to 192.7 million, the largest US health data breach on record.' },
    ],
    realOutcome: [
      'Claims, payments and pharmacy services were disrupted for weeks. Pharmacies used workarounds, and some providers waited a long time for payments.',
      'The company said it paid a ransom. Press reports put it at about $22 million. The attackers reportedly then kept the money, and a second group claimed the stolen data.',
      'About 190 million people were reported affected (later 192.7 million). That is more than half the US population.',
      'The CEO testified that the compromised portal had no MFA, that the attackers were inside nine days, and that the decision to pay was his.',
    ],
    failures: [
      'A Citrix remote-access portal had no MFA. One stolen password was enough.',
      'Nine days passed between the first login and the ransomware, and nobody noticed the lateral movement or the data leaving.',
      'A stolen login reached systems well beyond the remote desktop, so remote access was not walled off from the rest of the network.',
      'Too much data in one place for one breach: claims touch about 1 in 3 US patient records.',
      'Recovery took weeks because core services had to be rebuilt, and many customers had no fallback for claims.',
    ],
    attack: [
      { id: 'T1133', name: 'External Remote Services', fix: 'List every portal and gateway you own, require MFA on all of them, and keep no exceptions list without an owner and a deadline.' },
      { id: 'T1078', name: 'Valid Accounts', fix: 'Check staff passwords against breach lists, alert on first-time logins from new places, and limit what a remote session can reach.' },
      { id: 'T1021', name: 'Remote Services', fix: 'Put remote access in its own zone. Alert when one remote host starts talking to many internal servers.' },
      { id: 'T1567', name: 'Exfiltration Over Web Service', fix: 'Alert on large outbound uploads from file servers, and allow only the servers that need the internet to reach it.' },
      { id: 'T1490', name: 'Inhibit System Recovery', fix: 'Keep immutable, offline backups the attacker cannot reach, alert when shadow copies are deleted, and rehearse a full restore.' },
      { id: 'T1486', name: 'Data Encrypted for Impact', fix: 'Segment data centers so one can be cut off, limit admin accounts, run EDR that blocks mass file renames, and plan for the decryptor not working.' },
    ],
    resume: 'Investigated a simulated recreation of the 2024 Change Healthcare ransomware attack (ALPHV/BlackCat-attributed) in Cyber Office: traced a no-MFA Citrix login, nine days of dwell time, data exfiltration and encryption through remote access, firewall and server logs (MITRE ATT&CK T1133, T1486), and made the containment and extortion calls. Score: {grade}.',
    sources: [
      { title: 'CISA / FBI: #StopRansomware: ALPHV Blackcat (AA23-353A)', url: 'https://www.cisa.gov/news-events/cybersecurity-advisories/aa23-353a' },
      { title: 'Healthcare Dive: UnitedHealth CEO says Change Healthcare portal lacked MFA (written testimony)', url: 'https://www.healthcaredive.com/news/change-healthcare-compromised-credentials-no-mfa/714824/' },
      { title: 'The Record: UnitedHealth CEO tells Congress about the Change attack and ransom', url: 'https://therecord.media/unitedhealth-group-change-healthcare-ransomware-congress' },
      { title: 'GovInfoSecurity: UnitedHealth CEO says paying the ransom was the hardest decision', url: 'https://www.govinfosecurity.com/unitedhealth-ceo-paying-ransom-was-hardest-decision-ever-a-24977' },
      { title: 'Healthcare Dive: UnitedHealth says a nation-state actor hit Change Healthcare (Feb 2024)', url: 'https://www.healthcaredive.com/news/change-cyberattack-unitedhealth-nation-state/708328/' },
      { title: 'Help Net Security: ALPHV/BlackCat threatens to leak data stolen from Change Healthcare', url: 'https://www.helpnetsecurity.com/2024/02/29/alphv-blackcat-change-healthcare/' },
      { title: 'CNBC: Change Healthcare outages extend to a seventh day as pharmacies deploy workarounds', url: 'https://www.cnbc.com/2024/02/27/unitedhealths-change-healthcare-cyberattack-outages-continue-pharmacies-deploy-workarounds.html' },
      { title: 'CyberInsider: Change Healthcare revises breach impact to 192.7 million individuals', url: 'https://cyberinsider.com/change-healthcare-revises-breach-impact-to-192-7-million-individuals/' },
    ],
    disclaimer: 'A dramatized recreation based on public statements and reporting. The staff, hostnames, account names, file names and IP addresses are fictional stand-ins (the real internal details and attacker IPs were never published). The general chain follows the sources: a Citrix portal with no MFA, a first login on Feb 12, nine days inside with lateral movement and data theft, ransomware on Feb 21, a data center shutdown, and a ransom payment. What the attacker did between the first login and the encryption, the data volumes, the times of day, the internal emails and the lookalike phishing email are illustrative. The attackers\' claims (such as 6 TB of data) and the $22 million figure are labeled as claims or reports. The backup details are illustrative. Dollar costs in your report are estimates for this replay.',
  },
};
