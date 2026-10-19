// Case file: Target, Nov-Dec 2013. A recreation of a real breach, built from public reporting.
// Same engine as the week (see src/days/index.js for every field); plus caseFile, which drives the
// Case Files menu card and the "what really happened" half of the report.
import { EMAILS, PAGES, REPLY_DRAFTS } from './emails.js';
import { generateLogs, ALERTS, CASE, IP_INFO, DATE, REGS } from './logs.js';
import { TRIAGE_CALL, TRIAGE_SCORE, FREEZE_TALK, FREEZE_SCORE } from './talk.js';
import { scoreEmail, scoreCase, scoreConversation, finalize } from '../../game/scoring.js';

const MAIN = 'target-ftp';
// Finding the malware: open the export itself, or grep for the fake service / image name.
const FIND_RE = /(services\.csv|\bgrep\b.*\b(poswds|svchosts|winxml)\b)/i;

function hostItem(st) {
  const cmds = st.events.filter((e) => e.type === 'terminal-cmd');
  const found = cmds.some((e) => FIND_RE.test(e.cmd));
  return {
    id: 'hunt',
    area: 'Terminal',
    title: 'Find the card-scraping service on the registers',
    max: 10,
    teaches: { skill: 'Hunt for a look-alike service across a fleet (grep)', secplus: '4.9 Use data sources to support an investigation' },
    outcome: found ? 'good' : cmds.length ? 'ok' : 'bad',
    points: found ? 10 : cmds.length ? 4 : 0,
    what: found ? `You found the POSWDS service running svchosts.exe on the registers (${cmds.length} command${cmds.length === 1 ? '' : 's'}).` : cmds.length ? 'You opened the Terminal but never looked at the register service list.' : 'You never checked the registers.',
    why: 'The malware reported in this breach installed itself as a service called POSWDS, with a program name one letter off the real Windows svchost.exe, and read card data from memory. Real defenders compare services and running programs across the fleet and alert on anything new. On a locked-down register, only approved programs should run at all.',
  };
}

function score(st) {
  return finalize([
    ...EMAILS.map((e) => scoreEmail(e, st.mail?.[e.id])),
    scoreConversation(TRIAGE_SCORE, st.enc?.triage),
    hostItem(st),
    scoreConversation(FREEZE_SCORE, st.enc?.freeze),
    scoreCase(CASE, st.soc?.cases?.[MAIN]),
  ]);
}

function debrief(st) {
  const r = score(st);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const lines = ["Okay. Replay over. Let's compare you to what was reported."];
  if (by.case.outcome === 'good') lines.push('Your write-up matches the reported chain: a phished contractor, a stolen vendor login, movement to the registers, card-scraping malware, a staging server, and plain-text FTP out.');
  else if (st.soc?.cases?.[MAIN]) lines.push('Your write-up missed part of the chain. As reported: a stolen HVAC contractor login, a move inside, RAM-scraping malware on registers, data staged on an internal server, then FTP to outside servers.');
  else lines.push('You never wrote it up. In the real breach, Target learned of it when the Justice Department called on Dec 12.');
  if (by.triage.outcome === 'good') lines.push('You escalated the alerts. In reality, per Bloomberg Businessweek and the Senate staff report, FireEye alerted on the malware and nobody acted. That is the detail people remember most.');
  else if (st.enc?.triage?.outcome === 'closed') lines.push('You closed the alerts. That is the reported mistake. The tool worked. The process around it did not.');
  if (by.hunt.outcome === 'good') lines.push('You found the POSWDS service. Allow-listing programs on registers would have blocked it from running at all.');
  if (by.case.contained) lines.push('You blocked the exit and isolated the staging server. The attackers could not finish the job.');
  if (st.enc?.freeze?.outcome === 'wait') lines.push('You waited out the freeze. Real card theft ran from Nov 27 to about Dec 15.');
  if (st.mail?.recert?.enteredCreds) lines.push('And you gave your password to the "recertify contractor access" phish. Breaches and holiday rushes attract scammers.');
  lines.push('The irony: Target had been certified PCI compliant in September 2013, according to its own testimony. Compliance is a snapshot. Segmentation and alert response are daily work.');
  lines.push('Real outcome: about 40 million cards and up to 70 million customer records. Target reported $252 million in breach expenses through January 2015, about $162 million net of expected insurance, and paid $18.5 million to 47 states and DC in 2017.');
  lines.push("Here's your case report, and what you can honestly say you've done.");
  return lines;
}

const csv = (rows) => `${rows.map((r) => r.join(',')).join('\n')}\n`;

function terminal() {
  // Fleet service list: normal register services, plus the fake service on the infected ones.
  const infected = new Set(['reg-1147-03', 'reg-1147-05', 'reg-0812-02', 'reg-0812-04', 'reg-2210-01', 'reg-2210-06', 'reg-0455-02', 'reg-0455-03']);
  const clean = ['reg-1147-01', 'reg-1147-02', 'reg-1147-04', 'reg-0812-01', 'reg-0812-03', 'reg-2210-02', 'reg-2210-03', 'reg-0455-01'];
  const rows = [['host', 'service', 'image', 'start', 'installed']];
  for (const h of [...clean, ...REGS.map(([x]) => x)].sort()) {
    rows.push([h, 'PosAgent', 'C:\\Program Files\\Pos\\posagent.exe', 'auto', '2013-04-09']);
    rows.push([h, 'BMCPatrolAgent', 'C:\\Program Files\\BMC\\patrol.exe', 'auto', '2013-04-09']);
    if (infected.has(h)) rows.push([h, 'POSWDS', 'C:\\WINDOWS\\system32\\svchosts.exe', 'auto', h === 'reg-1147-03' || h === 'reg-1147-05' ? '2013-11-15' : '2013-11-30']);
  }
  return {
    date: 'Mon Dec 02 2013',
    note: 'Exports are under /mnt/exports (pos, stage, vendor).',
    files: {
      '/mnt/exports/pos/README.txt': ['Nightly export from the register management server. Read-only copy.', 'services.csv   one row per service per register (sample of stores).', 'Register services should be PosAgent and BMCPatrolAgent. Anything else is new.', ''].join('\n'),
      '/mnt/exports/pos/services.csv': csv(rows.map((r) => r.map((c) => (c.includes(',') ? `"${c}"` : c)))),
      '/mnt/exports/stage/app-stage01-files.txt': [
        'Directory listing, app-stage01, share twain_32 (no register should need this server)',
        'REG114703_30_11_14.txt        412 KB   Nov 30 14:02',
        'REG114705_30_11_14.txt        388 KB   Nov 30 14:03',
        'REG081202_1_12_10.txt         911 KB   Dec 1 10:02',
        'REG081204_1_12_10.txt         870 KB   Dec 1 10:03',
        'data_2013_12_02_10_01_44.txt  11 MB    Dec 2 10:01  (combined file, moved before upload)',
        'cmd.txt                       1 KB     Dec 2 10:01  (FTP script: destination and login not shown here)',
        '',
      ].join('\n'),
      '/mnt/exports/vendor/portal_accounts.csv': csv([
        ['account', 'company', 'type', '2fa', 'last_login', 'last_ip'],
        ['fazio-hvac', 'HVAC and refrigeration contractor', 'vendor', 'none', '2013-11-12', '203.0.113.44'],
        ['hvac-mgmt-co', 'HVAC contractor', 'vendor', 'token', '2013-11-29', '192.0.2.91'],
        ['pest-ctl-04', 'Pest control', 'vendor', 'none', '2013-11-25', '192.0.2.120'],
        ['signage-llc', 'Store signage', 'vendor', 'none', '2013-11-21', '192.0.2.130'],
        ['lawn-svc-02', 'Grounds', 'vendor', 'none', '2013-10-30', '192.0.2.140'],
      ]),
      '/home/analyst01/README.txt': [
        'Tips from Priya:',
        '  grep -i poswds /mnt/exports/pos/services.csv       which registers run the odd service?',
        '  grep -c POSWDS /mnt/exports/pos/services.csv       -c counts matching lines',
        '  cat /mnt/exports/stage/app-stage01-files.txt       what is sitting on the staging server?',
        '  grep -i none /mnt/exports/vendor/portal_accounts.csv    vendors with no 2FA',
        `  whois 198.51.100.23                                 who owns the FTP server?`,
        '',
      ].join('\n'),
    },
    whois: {
      '198.51.100.23': 'NetRange: 198.51.100.0 - 198.51.100.255\nOrgName: Example Web Hosting\nCountry: unknown\nComment: Shared web server. Customer sites. Likely compromised.\n(Stand-in. Real drop servers were hijacked machines in several countries.)',
      '203.0.113.44': 'NetRange: 203.0.113.0 - 203.0.113.255\nOrgName: Example Anonymizing Hosting\nCountry: unknown\nComment: Rented servers, no customer details.\n(Stand-in.)',
    },
    dns: {},
  };
}

export default {
  n: 2,
  caseId: 'target-2013',
  date: DATE,
  title: 'Target · Nov-Dec 2013',
  start: 8 * 60,
  endAt: 11 * 60 + 45,
  intro: ['Case Files: Target, Cyber Monday, December 2, 2013.', 'A replay of a real breach. Priya is running it from her office.'],
  badgeAtStart: true,
  cast: ['mike', 'theo'],

  emails: EMAILS,
  pages: PAGES,
  replyDrafts: REPLY_DRAFTS,
  logs: (st) => generateLogs({ nowMinutes: st.minutes }),
  ipInfo: IP_INFO,
  alerts: ALERTS,
  terminal: terminal(),

  npcLines: {
    priya: {
      talk: [
        'Welcome to Case Files. Today: Target, late 2013.',
        "It's Monday, December 2, Cyber Monday. You're on Target's security team. Real attackers have been inside for weeks, and per public reporting, tools have been warning about it since Thanksgiving weekend.",
        "This replay folds about three weeks into one morning. The attacker's moves follow the public record. Your moves are up to you.",
        'Start with your inbox.',
      ],
      again: ['Inbox first. Then the phone. Then the registers.'],
    },
    dana: { talk: ["I'm the monitoring desk lead today. We've been flagging things all weekend. Nobody wrote back."], again: ['If the phone rings, pick it up.'] },
    mike: { talk: ["I'm retail operations today. It's the biggest sales day of the season. Please don't break anything."], again: ['Sales are strong. For now.'] },
    theo: { talk: ["I'm a store systems admin. Registers, scanners, the works."], again: ['Registers look normal to me.'] },
  },

  objectives: [
    { id: 'priya', type: 'talk', text: 'Get the case briefing from Priya' },
    { id: 'my-desk', type: 'sit', text: 'Sit down at your desk' },
    { id: 'inbox', type: 'inbox', target: 'my-desk', text: 'Go through the security inbox' },
    { id: 'triage', type: 'encounter', target: 'my-desk', text: 'Answer your desk phone (monitoring desk)', waitText: 'The monitoring line is quiet. Stay near your desk.' },
    { id: 'hunt', type: 'terminal', match: FIND_RE, target: 'my-desk', waitFor: 'alert', text: 'Terminal: find the odd service on the registers (grep)', waitText: 'Waiting on the SIEM.' },
    { id: 'freeze', type: 'encounter', target: 'mike', text: 'Mike is coming over, and he looks stressed', waitText: 'Retail operations wants an answer.' },
    { id: 'server-door', type: 'badge', text: 'Badge into the server room' },
    { id: 'soc', type: 'case', target: 'soc', text: 'Work the case at the SOC console' },
    { id: 'debrief', type: 'debrief', target: 'priya', text: 'Debrief with Priya: what was reported' },
  ],
  encounters: [
    { id: 'triage', type: 'phone', after: 'inbox', delayMs: 3000, fallbackAt: 8 * 60 + 35, notice: '☎ Your desk phone is ringing (monitoring desk)', conv: TRIAGE_CALL },
    { id: 'freeze', type: 'walkup', npc: 'mike', after: 'hunt', delayMs: 1500, fallbackAt: 10 * 60 + 50, intro: 'Security? Got a minute? It is Cyber Monday.', conv: FREEZE_TALK },
  ],

  score,
  debrief,

  caseFile: {
    id: 'target-2013',
    company: 'Target',
    when: 'Nov-Dec 2013',
    title: 'In through the HVAC vendor',
    pitch: "A heating contractor's stolen login, card-scraping malware on registers, and security alerts that fired and were never acted on.",
    tags: ['Third-party access', 'POS malware', 'Ignored alerts', 'PCI scope'],
    difficulty: 'Intermediate',
    headline: 'Attackers stole network credentials from an HVAC contractor, moved from the vendor side into Target\'s network, installed card-scraping malware on registers, and sent the data out over FTP. Security tools flagged the malware. Nobody acted.',
    timeline: [
      { when: 'April and August 2013', what: 'Card networks publish warnings about RAM-scraping malware aimed at retailers (reported by Reuters, cited in the Senate staff report).' },
      { when: 'September 2013', what: 'Target is certified compliant with the Payment Card Industry Data Security Standard (Target testimony to the Senate, Feb 4, 2014).' },
      { when: 'At least two months before the theft (reported)', what: 'Fazio Mechanical Services, an HVAC and refrigeration contractor, is hit by a malware email attack that steals its Target network login. Malware type (reportedly Citadel) was not confirmed.' },
      { when: 'Nov 12 to 15, 2013 (reported)', what: 'The attackers first use the stolen login on Target\'s network (Nov 12 per the NYT, Nov 15 per sources of Krebs). Exactly how they moved from the vendor side to the registers is not public.' },
      { when: 'Nov 15 to 28 (reported)', what: 'Card-scraping malware is tested on a small number of registers. Symantec flags a suspicious server around Nov 28.' },
      { when: 'Nov 27 to Dec 15', what: 'Card data from US stores is exposed (Target: Nov 27 through Dec 15; Dec 18 for a few registers that were offline).' },
      { when: 'Nov 30 (reported)', what: 'Malware is on most registers, and data-moving malware is installed on an internal server. FireEye raises alerts, per Bloomberg Businessweek. Target\'s team does not act.' },
      { when: 'Dec 2 (reported)', what: 'The attackers update their malware and start sending stolen data over FTP to outside servers, about 11 GB over two weeks (Seculert; Senate staff report).' },
      { when: 'Dec 12', what: 'The Justice Department notifies Target (Target testimony). Dec 15: Target confirms the intrusion and removes the malware from nearly all registers.' },
      { when: 'Dec 18 to Jan 10, 2014', what: 'Krebs breaks the story Dec 18. Target confirms about 40 million cards on Dec 19, encrypted PIN data on Dec 27, and up to 70 million customer records on Jan 10.' },
      { when: 'Mar 26, 2014', what: 'US Senate Commerce Committee staff publish a "kill chain" analysis of the breach.' },
      { when: 'May 23, 2017', what: '47 states and DC reach an $18.5 million settlement with Target, requiring a security program, segmentation of cardholder data and two-factor for some accounts.' },
    ],
    realOutcome: [
      'About 40 million payment card accounts were exposed, plus personal information (name, address, phone or email) of up to 70 million customers. The Senate staff report counts up to 110 million customers.',
      'Target reported $252 million in breach-related expenses through January 2015, about $162 million net of expected insurance (10-K, as reported).',
      'In 2017, 47 states and the District of Columbia reached an $18.5 million settlement, then the largest multistate data breach settlement.',
      'The Senate staff report found Target missed several chances along the kill chain: vendor access, alerts from its malware detection tool, and weak separation inside the network.',
    ],
    failures: [
      'A small contractor had network access to Target and, reportedly, no strong security or two-factor sign-in. Target reportedly rarely required two-factor from small vendors.',
      'The vendor-facing side was not isolated enough from the rest of the network. Attackers reached the registers and an internal staging server.',
      'FireEye alerts fired on the malware, and on the exfiltration route, and were not acted on. Automatic blocking was reportedly off.',
      'Registers could run unapproved programs, so a fake service called POSWDS could scrape card data from memory.',
      'Stolen data was uploaded in plain-text FTP to outside servers without anyone seeing it as unusual.',
      'A "compliant" PCI audit in September 2013 did not mean the network was safe.',
    ],
    attack: [
      { id: 'T1566', name: 'Phishing', fix: 'Train vendors and staff to report phishing, and use real-time endpoint protection. Free on-demand scanners are not enough for a business.' },
      { id: 'T1199', name: 'Trusted Relationship', fix: 'Give vendors only the access they need, require two-factor for all of them, review their accounts, and alert on first-time logins from new IPs.' },
      { id: 'T1078.001', name: 'Valid Accounts: Default Accounts', fix: 'Remove or rotate default accounts of management software, and alert when a service account logs in from a machine other than its management server.' },
      { id: 'T1021.002', name: 'Remote Services: SMB/Windows Admin Shares', fix: 'Segment the payment network from everything else with deny-by-default rules. Registers should accept connections only from the servers they need.' },
      { id: 'T1036.004', name: 'Masquerading: Masquerade Task or Service', fix: 'Alert on new services and program names that nearly match real ones (svchosts.exe, "BladeLogic"). Use allow-listing so only approved programs run on registers.' },
      { id: 'T1005', name: 'Data from Local System', fix: 'Encrypt card data at the swipe (point-to-point encryption) so memory never holds plain card numbers. Move to chip cards.' },
      { id: 'T1074.002', name: 'Data Staged: Remote Data Staging', fix: 'Watch for servers that suddenly collect files from many registers, and alert on a register talking to anything but its payment servers.' },
      { id: 'T1048.003', name: 'Exfiltration Over Alternative Protocol: Exfiltration Over Unencrypted Non-C2 Protocol', fix: 'Allow outbound traffic only to approved destinations, block plain-text FTP at the edge, and page someone when a server uploads to an unknown host.' },
    ],
    resume: 'Investigated a simulated recreation of the 2013 Target breach in Cyber Office: triaged ignored malware-detection alerts, hunted a look-alike malware service across a register fleet, and traced a stolen vendor login to staged card data leaving over FTP (MITRE ATT&CK T1199, T1036.004, T1048.003), then made the contain-versus-sales call. Score: {grade}.',
    sources: [
      { title: 'US Senate Commerce Committee staff report: A "Kill Chain" Analysis of the 2013 Target Data Breach (Mar 26, 2014)', url: 'https://www.commerce.senate.gov/services/files/24d3c229-4f2f-405d-b8db-a3a67f183883' },
      { title: 'Testimony of Target\'s CFO to the Senate Judiciary Committee (Feb 4, 2014)', url: 'https://www.judiciary.senate.gov/imo/media/doc/02-04-14MulliganTestimony.pdf' },
      { title: 'KrebsOnSecurity: Target Hackers Broke in Via HVAC Company', url: 'https://krebsonsecurity.com/2014/02/target-hackers-broke-in-via-hvac-company/' },
      { title: 'KrebsOnSecurity: Email Attack on Vendor Set Up Breach at Target', url: 'https://krebsonsecurity.com/2014/02/email-attack-on-vendor-set-up-breach-at-target/' },
      { title: 'Dell SecureWorks: Inside a Targeted Point-of-Sale Data Breach (Jan 2014)', url: 'https://krebsonsecurity.com/wp-content/uploads/2014/01/Inside-a-Targeted-Point-of-Sale-Data-Breach.pdf' },
      { title: 'Bloomberg Businessweek: Missed Alarms and 40 Million Stolen Credit Card Numbers (Mar 2014)', url: 'https://www.bloomberg.com/news/articles/2014-03-13/target-missed-warnings-in-epic-hack-of-credit-card-data' },
      { title: 'New York Attorney General: $18.5 million multistate settlement with Target (May 23, 2017)', url: 'https://ag.ny.gov/press-release/2017/ag-schneiderman-announces-185-million-multi-state-settlement-target-corporation' },
      { title: 'TechCrunch: Target says the breach cost it $162M in 2013-14', url: 'https://techcrunch.com/2015/02/25/target-says-credit-card-data-breach-cost-it-162m-in-2013-14/' },
    ],
    disclaimer: 'A dramatized recreation based on public reporting. Target never published its internal details, so the staff, hostnames, usernames, subnets and IP addresses are fictional stand-ins (IPs are from documentation ranges or private 10.x). Artifact names such as POSWDS, svchosts.exe, winxml.dll, the BladeLogic look-alike service, the Best1_user default account and the register file naming come from the Dell SecureWorks analysis; all passwords and FTP logins are left out. How the attackers moved from the vendor side to the registers is not public; the log lines for that step, the times of day, the five alert times and the phone call and walk-up conversations are illustrative. The Citadel malware and the default account theory are reported but unconfirmed. Dozens of days of Target history are compressed into one Monday morning. Dollar costs in your report are estimates for this replay.',
  },
};
