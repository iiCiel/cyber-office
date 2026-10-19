// Case file: MOVEit Transfer zero-day (CVE-2023-34362), May-June 2023. A recreation of a real campaign,
// built from public reporting. You are a defender at one of the 2,700+ customer organizations.
// Same engine as the week (see src/days/index.js for every field); plus caseFile, which drives the
// Case Files menu card and the "what really happened" half of the report.
import { EMAILS, PAGES, REPLY_DRAFTS } from './emails.js';
import { generateLogs, ALERTS, CASE, IP_INFO, DATE } from './logs.js';
import { EXPOSURE_CALL, EXPOSURE_SCORE, PARTNER_CALL, PARTNER_SCORE } from './talk.js';
import { scoreEmail, scoreCase, scoreConversation, finalize } from '../../game/scoring.js';

const MAIN = 'moveit-shell';
// Hunting the shell: grep or open anything about human2 / the secret header / the rogue user, or look at wwwroot / the IIS logs.
const FIND_RE = /(human2|silock|health\s*check|\bgrep\b.*\b(wwwroot|iis|guestaccess)\b|\bls\b.*wwwroot)/i;

function huntItem(st) {
  const cmds = st.events.filter((e) => e.type === 'terminal-cmd');
  const found = cmds.some((e) => FIND_RE.test(e.cmd));
  return {
    id: 'hunt',
    area: 'Terminal',
    title: 'Hunt the MOVEit server for the web shell',
    max: 10,
    teaches: { skill: 'Hunt for web shells: new files, odd requests, unknown admins (grep)', secplus: '4.9 Use data sources to support an investigation' },
    outcome: found ? 'good' : cmds.length ? 'ok' : 'bad',
    points: found ? 10 : cmds.length ? 4 : 0,
    what: found ? `You found human2.aspx in wwwroot, the requests that used it, and the "Health Check Service" admin (${cmds.length} command${cmds.length === 1 ? '' : 's'}).` : cmds.length ? 'You opened the Terminal but never looked for the web shell.' : 'You never searched the MOVEit server.',
    why: 'This is the check the vendor and CISA both asked for. A patch only closes the hole. Whether you were already compromised depends on what is on disk: a file next to human.aspx that the product does not ship, hits on it in the IIS logs, and a sysadmin account nobody created. Real defenders hunt first, then patch.',
  };
}

function score(st) {
  return finalize([
    ...EMAILS.map((e) => scoreEmail(e, st.mail?.[e.id])),
    scoreConversation(EXPOSURE_SCORE, st.enc?.exposure),
    huntItem(st),
    scoreConversation(PARTNER_SCORE, st.enc?.partner),
    scoreCase(CASE, st.soc?.cases?.[MAIN]),
  ]);
}

function debrief(st) {
  const r = score(st);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const lines = ["Okay. Replay over. Let's compare you to what really happened."];
  if (by.case.outcome === 'good') lines.push('Your write-up matches the real chain: a SQL injection in a file-transfer product, a web shell named human2.aspx, a hidden admin called Health Check Service, and files downloaded within minutes. All of it over a holiday weekend.');
  else if (st.soc?.cases?.[MAIN]) lines.push('Your write-up missed part of the chain. In reality: an SQL injection, a web shell next to a legitimate file, a rogue admin account, then bulk downloads. The data was gone days before the vendor said a word.');
  else lines.push('You never wrote it up. In the real campaign, the web shell kept working after the advisory came out.');
  if (by.case.contained) lines.push('You blocked the web interface, preserved the server and hunted before patching. That is what the vendor, CISA and responders recommended. Patch and rebuild come after.');
  if (st.enc?.exposure?.outcome === 'patch-only') lines.push('You patched and reopened. Many real victims were hit before they ever saw the advisory, and a patch does not remove a shell planted days earlier.');
  else if (st.enc?.exposure?.outcome === 'keep-open') lines.push('You kept it online "for payroll". It is the same trade real teams faced. Mandiant saw large thefts within minutes of a shell going in, so the risk of waiting was real.');
  if (by.hunt.outcome === 'good') lines.push('And you found human2.aspx. CISA and Mandiant both describe it as made to look like the legitimate human.aspx. One character.');
  if (st.enc?.partner?.outcome === 'false-assurance') lines.push('You told the partner they were safe. In the real campaign, victims were learning about it from Cl0p\'s leak site from June 6. Honest early statements age better.');
  if (st.mail?.hotfix?.enteredCreds) lines.push('And you gave your password to the "emergency hotfix" phish. Big vulnerabilities attract scammers. Stay sharp when things are loud.');
  lines.push('Real outcome: according to the security firm Emsisoft, more than 2,700 organizations and about 95.8 million people were affected by mid-2024 (the count kept growing as notices were filed). Cl0p did not need ransomware: stealing the data was enough, and it posted victims on a leak site.');
  lines.push('The lesson is not "patch faster". Nobody could patch a zero-day. It is: know what internet-facing software holds your data, watch it, keep less on it, and look for compromise as well as patching.');
  lines.push("Here's your case report, and what you can honestly say you've done.");
  return lines;
}

const csv = (rows) => `${rows.map((r) => r.join(',')).join('\n')}\n`;

function terminal() {
  return {
    date: 'Thu Jun 01 2023',
    host: 'SOC-WS-07',
    motd: 'SOC workstation. An export of moveit01 (web root, IIS logs, user list, file list) is mounted read-only at /mnt/moveit01. Type help.\n',
    files: {
      '/mnt/moveit01/README.txt': [
        'Read-only export of moveit01 (MOVEit Transfer, DMZ), taken this morning.',
        'wwwroot/           the web root, one file per page',
        'wwwroot-listing.csv   created date, size, and whether the file is vendor-signed',
        'iis/               IIS access logs, one file per day',
        'db/users.csv       MOVEit user list      db/files-inventory.csv   what is stored',
        '',
      ].join('\n'),
      '/mnt/moveit01/wwwroot/default.aspx': '<%@ Page Language="C#" %>  (MOVEit sign-in page, vendor file)\n',
      '/mnt/moveit01/wwwroot/guestaccess.aspx': '<%@ Page Language="C#" %>  (MOVEit guest access page, vendor file)\n',
      '/mnt/moveit01/wwwroot/human.aspx': '<%@ Page Language="C#" %>  (MOVEit vendor file: the legitimate "human" check page)\n',
      '/mnt/moveit01/wwwroot/human2.aspx': [
        '<%@ Page Language="C#" ... %>',
        '[Web shell source is NOT reproduced in this replay.]',
        'What the published analysis says it does: checks a request header named X-siLock-Comment against a hard-coded value',
        '(anything else gets a 404), lists files, creates or deletes a sysadmin called "Health Check Service", and returns files gzip-compressed.',
        '',
      ].join('\n'),
      '/mnt/moveit01/wwwroot/web.config': '<configuration> ... (vendor file)\n',
      '/mnt/moveit01/wwwroot-listing.csv': csv([
        ['name', 'created', 'size_kb', 'vendor_signed'],
        ['default.aspx', '2022-11-14', '12', 'yes'],
        ['guestaccess.aspx', '2022-11-14', '9', 'yes'],
        ['human.aspx', '2022-11-14', '6', 'yes'],
        ['human2.aspx', '2023-05-27', '8', 'no'],
        ['web.config', '2022-11-14', '4', 'yes'],
      ]),
      '/mnt/moveit01/iis/u_ex230527.log': [
        '#Fields: date time c-ip cs-method cs-uri-stem sc-status sc-bytes x-siLock',
        '2023-05-27 02:43:02 198.51.100.23 POST /guestaccess.aspx 200 1230 -',
        '2023-05-27 02:43:13 198.51.100.23 POST /guestaccess.aspx 200 1230 -',
        '2023-05-27 02:52:03 203.0.113.60 GET /human2.aspx 200 120 comment',
        '2023-05-27 02:55:10 203.0.113.60 GET /human2.aspx 200 3984000 step1=-1',
        '2023-05-27 03:01:05 203.0.113.60 GET /human2.aspx 200 421000000 step2=100,step3=5000',
        '2023-05-27 03:02:23 203.0.113.60 GET /human2.aspx 200 455000000 step2=101,step3=5007',
        '2023-05-27 03:03:41 203.0.113.60 GET /human2.aspx 200 398000000 step2=102,step3=5014',
        '2023-05-27 03:26:40 203.0.113.60 GET /human2.aspx 200 120 step1=-2',
        '2023-05-27 23:10:05 192.0.2.150 GET /api/v1/files/payroll_batch.csv 200 410000000 -',
        '(excerpt: custom header logging was on. Request details are paraphrased.)',
        '',
      ].join('\n'),
      '/mnt/moveit01/iis/u_ex230528.log': [
        '#Fields: date time c-ip cs-method cs-uri-stem sc-status sc-bytes x-siLock',
        '2023-05-28 03:07:11 203.0.113.60 GET /human2.aspx 200 301000000 step2=140,step3=6100',
        '2023-05-28 03:08:45 203.0.113.60 GET /human2.aspx 200 266000000 step2=141,step3=6105',
        '2023-05-28 04:13:12 198.51.100.88 GET /human2.aspx 404 310 -',
        '2023-05-28 08:41:00 10.20.4.33 GET /human.aspx 200 6300 -',
        '',
      ].join('\n'),
      '/mnt/moveit01/iis/u_ex230531.log': [
        '#Fields: date time c-ip cs-method cs-uri-stem sc-status sc-bytes x-siLock',
        '2023-05-31 22:07:19 198.51.100.88 GET /human2.aspx 200 120 comment',
        '',
      ].join('\n'),
      '/mnt/moveit01/iis/u_ex230601.log': [
        '#Fields: date time c-ip cs-method cs-uri-stem sc-status sc-bytes x-siLock',
        '2023-06-01 05:12:33 198.51.100.88 GET /human2.aspx 200 212000000 step2=188,step3=7340',
        '',
      ].join('\n'),
      '/mnt/moveit01/db/users.csv': csv([
        ['loginname', 'realname', 'permission', 'created', 'last_login'],
        ['admin-lv', 'MOVEit Admin', 'SysAdmin', '2020-03-02', '2023-06-01'],
        ['svc-sync', 'Sync Service', 'Admin', '2021-08-19', '2023-06-01'],
        ['larkin-sftp', 'Larkin Payroll Services', 'User', '2021-02-11', '2023-05-31'],
        ['hrbenefits-up', 'HR Benefits Upload', 'User', '2022-01-04', '2023-05-31'],
        ['h3m8d1qz', 'Health Check Service', 'SysAdmin', '2023-05-31', '2023-05-31'],
      ]),
      '/mnt/moveit01/db/files-inventory.csv': csv([
        ['path', 'owner', 'uploaded', 'size_mb', 'contains'],
        ['/larkin/payroll_batch_0530.csv', 'larkin-sftp', '2023-05-30', '410', 'names, bank details'],
        ['/hrbenefits/enrollment_2023q1.csv', 'hrbenefits-up', '2023-04-02', '280', 'names, DOB, national IDs'],
        ['/claims/recon_2022.csv', 'claimsvendor-up', '2022-12-19', '190', 'names, claim amounts'],
        ['/hrbenefits/enrollment_2021.csv', 'hrbenefits-up', '2021-03-11', '260', 'names, DOB, national IDs'],
        ['/audit/prior_year_files.zip', 'auditfirm-up', '2020-08-27', '900', 'mixed, unclassified'],
        ['/hrbenefits/enrollment_2019.csv', 'hrbenefits-up', '2019-04-09', '240', 'names, DOB, national IDs'],
        ['(41,306 files in total, 38% older than one year. Policy: delete 30 days after pickup.)', '', '', '', ''],
      ]),
      '/home/analyst01/README.txt': [
        'Tips from Priya:',
        '  ls /mnt/moveit01/wwwroot              what pages does the web server have?',
        '  cat /mnt/moveit01/wwwroot-listing.csv     created dates and who signed each file',
        '  grep -r human2 /mnt/moveit01/iis      every request to a suspicious page',
        '  grep -ri "health check" /mnt/moveit01/db     odd accounts',
        '  whois 203.0.113.60                    who owns the attacker IP?',
        '',
      ].join('\n'),
    },
    whois: {
      '203.0.113.60': 'NetRange: 203.0.113.0 - 203.0.113.255\nOrgName: Example Rented Hosting\nCountry: unknown\nComment: Rented servers, no customer details.\n(Stand-in. Real attacker IPs are in the CISA and Mandiant advisories.)',
      '198.51.100.23': 'NetRange: 198.51.100.0 - 198.51.100.255\nOrgName: Example Cloud Hosting\nCountry: US\nComment: Customer servers. Registered recently.\n(Stand-in.)',
      '198.51.100.88': 'NetRange: 198.51.100.0 - 198.51.100.255\nOrgName: Example Cloud Hosting\nCountry: US\n(Stand-in.)',
      'moveit-patchportal.example': 'Domain Name: MOVEIT-PATCHPORTAL.EXAMPLE\nCreation Date: 2023-06-01T05:44:12Z\nRegistrar: NameSilo, LLC\nRegistrant: REDACTED FOR PRIVACY\n(Registered a few hours ago. Illustrative.)',
    },
    dns: { 'moveit-patchportal.example': 'Name:\tmoveit-patchportal.example\nAddress: 203.0.113.91' },
  };
}

export default {
  n: 2,
  caseId: 'moveit-2023',
  date: DATE,
  title: 'MOVEit Transfer · June 2023',
  start: 8 * 60,
  endAt: 11 * 60 + 30,
  intro: ['Case Files: MOVEit Transfer, June 1, 2023.', 'A replay of a real campaign. Priya is running it from her office.'],
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
        'Welcome to Case Files. Today: the MOVEit Transfer zero-day, June 2023.',
        "It's Thursday, June 1, 2023, 8:00 AM. You're a defender at a company that uses MOVEit to swap payroll and benefits files with partners. About 2,700 organizations ended up in your position.",
        "Fair warning. This replay uses what the vendor, CISA and Mandiant published. Your company, its server and its partners are stand-ins. The attacker's moves are the real ones.",
        'Start with your inbox. The vendor sent an advisory overnight.',
      ],
      again: ['Inbox first. Then follow the MOVEit server.'],
    },
    dana: { talk: ["I'm on the help desk. Everyone asks if MOVEit is down. I tell them to ask you."], again: ['Still getting calls about MOVEit.'] },
    mike: { talk: ["I'm the business owner for payroll. If those files don't move by 9, people don't get paid."], again: ['Payroll is waiting on this.'] },
    theo: { talk: ["I'm the MOVEit admin. I've run this server for three years. It just works. Usually."], again: ["Don't touch my server."] },
  },

  objectives: [
    { id: 'priya', type: 'talk', text: 'Get the case briefing from Priya' },
    { id: 'my-desk', type: 'sit', text: 'Sit down at your desk' },
    { id: 'inbox', type: 'inbox', target: 'my-desk', text: 'Go through the SOC inbox' },
    { id: 'exposure', type: 'encounter', target: 'theo', text: 'Theo, the MOVEit admin, is coming over', waitText: 'The MOVEit admin wants a word.' },
    { id: 'hunt', type: 'terminal', match: FIND_RE, target: 'my-desk', waitFor: 'alert', text: 'Terminal: hunt moveit01 for the web shell (grep)', waitText: 'Waiting on the SIEM.' },
    { id: 'partner', type: 'encounter', target: 'my-desk', text: 'Answer your desk phone (a partner is calling)', waitText: 'The phone is quiet. Stay near your desk.' },
    { id: 'server-door', type: 'badge', text: 'Badge into the server room' },
    { id: 'soc', type: 'case', target: 'soc', text: 'Work the case at the SOC console' },
    { id: 'debrief', type: 'debrief', target: 'priya', text: 'Debrief with Priya: what really happened' },
  ],
  encounters: [
    { id: 'exposure', type: 'walkup', npc: 'theo', after: 'inbox', delayMs: 1500, fallbackAt: 8 * 60 + 30, intro: 'Got a minute? The vendor emailed about MOVEit.', conv: EXPOSURE_CALL },
    { id: 'partner', type: 'phone', after: 'hunt', delayMs: 3000, fallbackAt: 10 * 60 + 15, notice: '☎ Your desk phone is ringing (a partner)', conv: PARTNER_CALL },
  ],

  score,
  debrief,

  caseFile: {
    id: 'moveit-2023',
    company: 'MOVEit Transfer',
    when: 'May-June 2023',
    title: 'One SQL injection, 2,700+ organizations',
    pitch: 'Cl0p finds a hole in a file-transfer product and uses it over Memorial Day weekend. A web shell called human2.aspx, a hidden admin, gigabytes of partner files gone in minutes. You are one of the customers who finds out after the vendor announces it.',
    tags: ['Zero-day', 'SQL injection', 'Web shell', 'Cl0p', 'Third-party risk'],
    difficulty: 'Intermediate',
    headline: 'The Cl0p ransomware gang (TA505, tracked by Mandiant as UNC4857 and then FIN11) exploited a zero-day SQL injection in Progress MOVEit Transfer starting May 27, 2023, installed a web shell, stole data from the product\'s database and file store, and extorted victims through its leak site. It did not encrypt anything.',
    timeline: [
      { when: '2020 to Jan 2023', what: 'Cl0p ran earlier zero-day campaigns against file-transfer products: Accellion FTA in 2020-21 and Fortra GoAnywhere MFT in January 2023, stealing data without ransomware. (CISA AA23-158A)' },
      { when: 'May 27, 2023 (Saturday, Memorial Day weekend)', what: 'Earliest evidence of exploitation of CVE-2023-34362: POST requests to guestaccess.aspx, a web shell dropped, files stolen. Mandiant saw large thefts within minutes of the shell going in.' },
      { when: 'May 28', what: 'The first samples of human2.aspx are uploaded to VirusTotal (Mandiant).' },
      { when: 'May 31', what: 'Progress Software announces the vulnerability and tells customers to disable HTTP and HTTPS traffic to MOVEit Transfer, then to patch and check for compromise.' },
      { when: 'Jun 2', what: 'CISA adds CVE-2023-34362 to its Known Exploited Vulnerabilities catalog.' },
      { when: 'Jun 6', what: 'Cl0p claims responsibility on its leak site and threatens to publish stolen data. Mandiant merges UNC4857 into FIN11 the same day.' },
      { when: 'Jun 7', what: 'CISA and the FBI publish #StopRansomware advisory AA23-158A with IOCs and detection rules.' },
      { when: 'Jun 9 and Jun 15-16', what: 'Two more MOVEit SQL injection flaws are found and patched: CVE-2023-35036 and CVE-2023-35708.' },
      { when: 'By Jun 28, 2024', what: 'The security firm Emsisoft counts 2,773 organizations and about 95.8 million individuals affected, from notices filed to that point. The totals could still rise.' },
    ],
    realOutcome: [
      'Data was stolen from more than 2,700 organizations, according to Emsisoft\'s running count, including many that did not use MOVEit themselves but whose vendors did. About 95.8 million individuals were affected as of June 2024.',
      'CISA and the FBI attributed the campaign to the Cl0p ransomware gang. Cl0p extorted victims through its leak site rather than encrypting their files.',
      'Progress patched the first flaw and then two more in June, and later moved MOVEit to a service-pack update model. These are vendor and press reports.',
      'The campaign followed the same pattern as Accellion in 2020-21 and GoAnywhere in January 2023: a zero-day in an internet-facing file-transfer product.',
    ],
    failures: [
      'An internet-facing file-transfer server with a zero-day could be exploited by anyone. Nobody could patch before May 31, and a patch afterwards does not remove a web shell already planted.',
      'Attackers had days before most customers heard about the bug, over a holiday weekend, with nobody watching the server.',
      'Large outbound transfers and new files in the web root were not alarmed on, or the alarms went to a weekly report.',
      'Too much data sat on the transfer servers: old files kept for years that should have been deleted after pickup.',
      'A WAF in detection-only mode and logging without alerting recorded the SQL injection attempts but did not stop them (illustrative for this replay).',
      'Third-party risk: many victims learned about their exposure from a vendor or from the attacker\'s leak site.',
    ],
    attack: [
      { id: 'T1190', name: 'Exploit Public-Facing Application', fix: 'Keep an inventory of every internet-facing application, subscribe to the vendor advisories and the CISA KEV catalog, and use a WAF in blocking mode plus virtual patching. Put admin and transfer UIs behind a gateway or VPN where you can.' },
      { id: 'T1505.003', name: 'Server Software Component: Web Shell', fix: 'Alert on any new executable or script file in a web root, especially from the web server process. Keep a baseline of vendor-signed files. Hunt for look-alike names, such as human2.aspx next to human.aspx.' },
      { id: 'T1136', name: 'Create Account', fix: 'Alert on every new admin account and on admin accounts created by a web request. Review the user list after any suspected compromise.' },
      { id: 'T1213', name: 'Data from Information Repositories', fix: 'Keep less data on exposed transfer servers: delete after pickup, encrypt at rest, and classify what stays.' },
      { id: 'T1041', name: 'Exfiltration Over C2 Channel', fix: 'Alert on outbound volume far above baseline from DMZ servers, in near real time. A weekly report is too slow for a holiday weekend.' },
      { id: 'T1070', name: 'Indicator Removal', fix: 'Ship web, audit and EDR logs off the server in real time. The attacker deleted the Health Check Service account to hide, but the audit log still caught it.' },
    ],
    resume: 'Investigated a simulated recreation of the 2023 MOVEit Transfer zero-day campaign (Cl0p-attributed, CVE-2023-34362) in Cyber Office: hunted a human2.aspx web shell on a file-transfer server through IIS, EDR and audit logs, scoped the data stolen, and made the contain-before-patch call (MITRE ATT&CK T1190, T1505.003, T1041). Score: {grade}.',
    sources: [
      { title: 'CISA / FBI: #StopRansomware: CL0P Ransomware Gang Exploits CVE-2023-34362 MOVEit Vulnerability (AA23-158A)', url: 'https://www.cisa.gov/news-events/cybersecurity-advisories/aa23-158a' },
      { title: 'Mandiant: Zero-Day Vulnerability in MOVEit Transfer Exploited for Data Theft', url: 'https://cloud.google.com/blog/topics/threat-intelligence/zero-day-moveit-data-theft/' },
      { title: 'TrustedSec: Critical Vulnerability in Progress MOVEit Transfer, Technical Analysis and Recommendations', url: 'https://trustedsec.com/blog/critical-vulnerability-in-progress-moveit-transfer-technical-analysis-and-recommendations' },
      { title: 'CISA: Adds one known exploited vulnerability to the catalog (CVE-2023-34362, June 2, 2023)', url: 'https://www.cisa.gov/news-events/alerts/2023/06/02/cisa-adds-one-known-exploited-vulnerability-catalog' },
      { title: 'Emsisoft: Unpacking the MOVEit breach, statistics and analysis', url: 'https://www.emsisoft.com/en/blog/44123/unpacking-the-moveit-breach-statistics-and-analysis/' },
      { title: 'Help Net Security: A third MOVEit vulnerability fixed (CVE-2023-35708)', url: 'https://www.helpnetsecurity.com/2023/06/19/cve-2023-35708/' },
    ],
    disclaimer: 'A dramatized recreation based on public reporting. The customer organization, its partners, hostnames, usernames, files, the people, the phone call, the "emergency hotfix" phish, the WAF being in detection mode and the log lines are fictional. IPs are from documentation ranges; the real attacker IPs and hashes are in the CISA and Mandiant advisories. The attack technique (a SQL injection in guestaccess.aspx, a web shell named human2.aspx, the X-siLock headers, the "Health Check Service" account, large downloads) follows the sources, but SQL injection payloads are never shown and the shell source is not reproduced. Times, sizes and the order of requests are illustrative. Dollar costs in your report are estimates for this replay.',
  },
};
