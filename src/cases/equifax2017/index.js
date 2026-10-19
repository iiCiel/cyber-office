// Case file: Equifax, May-July 2017. A recreation of a real breach, built from public reporting.
// Same engine as the week (see src/days/index.js for every field); plus caseFile, which drives the
// Case Files menu card and the "what really happened" half of the report.
import { EMAILS, PAGES, REPLY_DRAFTS } from './emails.js';
import { generateLogs, ALERTS, CASE, IP_INFO, DATE } from './logs.js';
import { APP_CALL, APP_SCORE, ESCALATE_CALL, ESCALATE_SCORE } from './talk.js';
import { scoreEmail, scoreCase, scoreConversation, finalize } from '../../game/scoring.js';

const MAIN = 'eqx-acis';
// Three things to find: the unpatched Struts app (inventory/scan), the expired certs, the plaintext credentials.
const STRUTS_RE = /(struts|vulnerable|assets\.csv|scan)/i;
const CERT_RE = /(expired|certs|inspection)/i;
const CRED_RE = /(password|passwd|connections\.properties|acis-config)/i;
const FIND_RE = /\b(grep|cat|head|tail)\b.*(struts|vulnerable|assets\.csv|scan|expired|certs|inspection|password|passwd|connections\.properties|acis-config)/i;

function huntItem(st) {
  const cmds = st.events.filter((e) => e.type === 'terminal-cmd');
  const struts = cmds.some((e) => STRUTS_RE.test(e.cmd));
  const certs = cmds.some((e) => CERT_RE.test(e.cmd));
  const creds = cmds.some((e) => CRED_RE.test(e.cmd));
  const n = [struts, certs, creds].filter(Boolean).length;
  const points = n === 3 ? 10 : n === 2 ? 7 : n === 1 ? 4 : 0;
  return {
    id: 'hunt',
    area: 'Terminal',
    title: 'Hunt: unpatched Struts, expired certs, credentials in a file',
    max: 10,
    teaches: { skill: 'Audit assets, certificates and secrets with grep', secplus: '4.9 Use data sources to support an investigation' },
    outcome: n === 3 ? 'good' : n ? 'ok' : 'bad',
    points,
    what: n ? `You found ${n} of 3: ${[struts && 'the vulnerable Struts app', certs && 'the expired certificates', creds && 'the plaintext credentials'].filter(Boolean).join(', ')}.` : cmds.length ? 'You opened the Terminal but never looked at the inventory, the certificates or the config.' : 'You never audited the exports.',
    why: 'These are three of the real failures. The ACIS portal ran a vulnerable Struts that nobody had mapped to an owner and the scan could not see. The certificate on the monitoring device had expired 19 months earlier, and Equifax had over 300 expired certificates. And application credentials sat in a plaintext config file on a share the attackers could read. Any of these, found early, breaks the chain.',
  };
}

function score(st) {
  return finalize([
    ...EMAILS.map((e) => scoreEmail(e, st.mail?.[e.id])),
    scoreConversation(APP_SCORE, st.enc?.app),
    huntItem(st),
    scoreConversation(ESCALATE_SCORE, st.enc?.escalate),
    scoreCase(CASE, st.soc?.cases?.[MAIN]),
  ]);
}

function debrief(st) {
  const r = score(st);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const lines = ["Okay. Replay over. Let's compare you to what the House Oversight report found."];
  if (by.case.outcome === 'good') lines.push('Your write-up matches the real chain: a Struts flaw with a fix already out, web shells, plaintext credentials, 48 databases, and a monitoring device that was blind on an expired certificate.');
  else if (st.soc?.cases?.[MAIN]) lines.push('Your write-up missed part of the chain. In reality: an unpatched Struts on ACIS, web shells, a plaintext credentials file, 48 unrelated databases, data copied out for 76 days, and a blind inspection device.');
  else lines.push('You never wrote it up. In the real incident, ACIS was taken offline only the day after the certificate was fixed.');
  if (by.case.contained) lines.push('You took ACIS down and rotated the credentials. That matches Equifax on July 30, and it is what any team should do before patching.');
  if (by.hunt.outcome === 'good') lines.push('And you found all three weak spots. The report says the scan missed the vulnerable component because it ran on the root directory, not the folder where Struts lived. Visibility is a control.');
  if (st.enc?.app?.outcome === 'offline-image') lines.push('You imaged the servers before changing anything. The forensic team needed exactly that.');
  else if (st.enc?.app?.outcome === 'patch-restart') lines.push('You patched and restarted. Good instinct, wrong order. The web shells and the evidence were still there.');
  if (st.enc?.escalate?.outcome === 'wait') lines.push('You waited until Monday. The attackers had already been inside for 76 days. Another two days is not free.');
  if (st.mail?.['cert-phish']?.enteredCreds) lines.push('And you gave your password to the "renew your certificate" phish. Scares attract scammers. Stay sharp when things are loud.');
  lines.push('Real outcome: Equifax announced the breach on September 7, 2017. The count grew from 143 million to about 148 million people in the US, and the company later reached a settlement of at least $575 million, up to $700 million, with the FTC, the CFPB and states in July 2019.');
  lines.push('In February 2020 the US Justice Department indicted four members of the Chinese military for the hack. That is the DOJ\'s allegation. They have not been tried.');
  lines.push("Here's your case report, and what you can honestly say you've done.");
  return lines;
}

const csv = (rows) => `${rows.map((r) => r.join(',')).join('\n')}\n`;

function terminal() {
  return {
    date: 'Sat Jul 29 2017',
    host: 'SOC-WS-07',
    motd: 'SOC workstation. Exports are under /mnt/exports (assets, scans, certs, acis). Type help.\n',
    files: {
      '/mnt/exports/README.txt': [
        'assets/assets.csv     what runs where (owner, internet-facing, struts version)',
        'scans/struts-scan.txt the March struts signature scan job',
        'certs/inspection.csv  certificates on security tools',
        'acis/acis-config/     ACIS app config as stored on the share',
        'Tip: struts versions before 2.3.32 and 2.5.10.1 are the vulnerable ones (CVE-2017-5638).',
        '',
      ].join('\n'),
      '/mnt/exports/assets/assets.csv': csv([
        ['host', 'app', 'owner', 'internet_facing', 'struts', 'in_scan_scope'],
        ['portal-web03', 'Customer portal', 'Portal team', 'yes', '2.3.32', 'yes'],
        ['hr-app01', 'HR self-service', 'HR IT', 'no', 'none', 'yes'],
        ['acis-web01', 'ACIS dispute portal (web)', '(unassigned)', 'yes', 'none', 'yes'],
        ['acis-web02', 'ACIS dispute portal (web)', '(unassigned)', 'yes', 'none', 'yes'],
        ['acis-app01', 'ACIS dispute portal (app)', '(unassigned)', 'via web tier', '2.3.31 (vulnerable)', 'NO: path not scanned'],
        ['acis-app02', 'ACIS dispute portal (app)', '(unassigned)', 'via web tier', '2.3.31 (vulnerable)', 'NO: path not scanned'],
        ['bi-rpt01', 'Reporting', 'Analytics', 'no', '2.5.12', 'yes'],
      ]),
      '/mnt/exports/scans/struts-scan.txt': [
        'job: struts-signature   run: 2017-03-15   scanner: vulnscan01',
        'targets: 958 external IP addresses',
        'method: component scan from / (root directory only)',
        'note: /opt/acis/webapps/*/WEB-INF/lib was not walked (subdirectory)',
        'result: 0 findings',
        '',
      ].join('\n'),
      '/mnt/exports/certs/inspection.csv': csv([
        ['device', 'subject', 'not_after', 'status', 'alerting'],
        ['netinspect01', '*.acis.corp.example', '2015-12 (about 19 months ago)', 'expired until 2017-07-29', 'none'],
        ['netinspect02', '*.portal.corp.example', '2018-02-11', 'valid', 'none'],
        ['dlp-proxy01', '*.corp.example', '2016-09-30', 'expired', 'none'],
        ['waf-edge01', 'waf.corp.example', '2017-01-14', 'expired', 'none'],
        ['ids-sensor04', 'ids.corp.example', '2016-05-02', 'expired', 'none'],
      ]),
      '/mnt/exports/acis/acis-config/connections.properties': [
        '# ACIS database connections (stored on the shared config mount)',
        'db.user=acis_app',
        'db.password=[redacted: the real file held it in plain text]',
        'db.host=db-core.corp.example',
        'db.databases=acis_disputes,acis_status,acis_docs',
        '# note: the account itself can reach 48 databases',
        '',
      ].join('\n'),
      '/home/analyst01/README.txt': [
        'Tips from Priya:',
        '  grep -i vulnerable /mnt/exports/assets/assets.csv   which apps run a bad struts?',
        '  grep -ri expired /mnt/exports/certs                 which certificates have expired?',
        '  grep -ri password /mnt/exports/acis                 secrets sitting in files?',
        '  cat /mnt/exports/scans/struts-scan.txt              what did the scan actually check?',
        `  whois 203.0.113.44                                  who owns the attacker's IP?`,
        '',
      ].join('\n'),
    },
    whois: {
      '203.0.113.44': 'NetRange: 203.0.113.0 - 203.0.113.255\nOrgName: Example Hosting\nCountry: unknown\nComment: Rented servers, no customer details.\n(Stand-in. The real attacker IPs were not published.)',
      '198.51.100.23': 'NetRange: 198.51.100.0 - 198.51.100.255\nOrgName: Example Cloud Hosting\nCountry: unknown\n(Stand-in.)',
      '203.0.113.77': 'NetRange: 203.0.113.0 - 203.0.113.255\nOrgName: Example German ISP (leased to another provider)\nCountry: DE\n(Stand-in for the German-owned, China-leased address in the report.)',
      'certdesk-renewals.example': 'Domain Name: CERTDESK-RENEWALS.EXAMPLE\nCreation Date: 2017-07-28T22:12:09Z\nRegistrant: REDACTED FOR PRIVACY\n(Registered last night. Illustrative.)',
    },
    dns: { 'certdesk-renewals.example': 'Name:\tcertdesk-renewals.example\nAddress: 203.0.113.91' },
  };
}

export default {
  n: 2,
  caseId: 'equifax-2017',
  date: DATE,
  title: 'Equifax · May to July 2017',
  start: 9 * 60,
  endAt: 12 * 60 + 30,
  intro: ['Case Files: Equifax, July 29, 2017.', 'A replay of a real breach. Priya is running it from her office.'],
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
        'Welcome to Case Files. Today: Equifax, 2017.',
        "It's Saturday, July 29, 2017, 9:00 AM. You're on Equifax's security team. The attackers have been inside for 76 days. You do not know that yet.",
        'The fix for the Struts flaw they used had been public since March. This replay is built from the House Oversight report. The others are playing roles.',
        'Start with your inbox. Network ops just touched a certificate.',
      ],
      again: ['Inbox first. Then follow whatever looks odd.'],
    },
    dana: { talk: ["I'm on the help desk. Weekend shift. Mostly password resets."], again: ['Quiet. Too quiet.'] },
    mike: { talk: ["I'm playing the VP of IT operations. I will want a clear answer soon."], again: ['Waiting on security.'] },
    theo: { talk: ["I'm the ACIS app owner. It is an old system. Built in the 1970s, I hear."], again: ['Do not break my portal. Okay, break it if you must.'] },
  },

  objectives: [
    { id: 'priya', type: 'talk', text: 'Get the case briefing from Priya' },
    { id: 'my-desk', type: 'sit', text: 'Sit down at your desk' },
    { id: 'inbox', type: 'inbox', target: 'my-desk', text: 'Go through the security inbox' },
    { id: 'app', type: 'encounter', target: 'theo', text: 'Theo, the ACIS app owner, is coming over', waitText: 'The ACIS owner is on the way.' },
    { id: 'hunt', type: 'terminal', match: FIND_RE, target: 'my-desk', waitFor: 'alert', text: 'Terminal: audit the exports (Struts app, expired certs, credentials in files)', waitText: 'Waiting on the SIEM.' },
    { id: 'escalate', type: 'encounter', target: 'mike', text: 'Mike is coming over, and he looks stressed', waitText: 'The VP of IT operations wants an answer.' },
    { id: 'server-door', type: 'badge', text: 'Badge into the server room' },
    { id: 'soc', type: 'case', target: 'soc', text: 'Work the case at the SOC console' },
    { id: 'debrief', type: 'debrief', target: 'priya', text: 'Debrief with Priya: what the report found' },
  ],
  encounters: [
    { id: 'app', type: 'walkup', npc: 'theo', after: 'inbox', delayMs: 1500, fallbackAt: 10 * 60 + 15, intro: 'Hey! Got a minute? About ACIS.', conv: APP_CALL },
    { id: 'escalate', type: 'walkup', npc: 'mike', after: 'hunt', delayMs: 1500, fallbackAt: 11 * 60 + 15, intro: 'I need to talk to you. Now.', conv: ESCALATE_CALL },
  ],

  score,
  debrief,

  caseFile: {
    id: 'equifax-2017',
    company: 'Equifax',
    when: 'May to July 2017',
    title: 'The patch that never landed',
    pitch: 'An Apache Struts flaw with a fix already out, a scan that missed one portal, and an expired certificate that hid 76 days of data leaving.',
    tags: ['Unpatched CVE', 'Web shells', 'Expired cert', 'Plaintext credentials', 'Segmentation'],
    difficulty: 'Intermediate',
    headline: 'Attackers used an unpatched Apache Struts flaw on Equifax\'s ACIS dispute portal to get in on May 13, 2017. They stayed 76 days, reached 48 unrelated databases with credentials found in a file, and copied out personal data on about 148 million people. A monitoring device blind on an expired certificate hid it.',
    timeline: [
      { when: 'Mar 7, 2017', what: 'The Apache Struts flaw CVE-2017-5638 is publicly disclosed, with a fixed version. DHS alerts Equifax the next day.' },
      { when: 'Mar 9, 2017', what: 'Equifax\'s vulnerability team emails the alert to over 400 people: patch within 48 hours. The ACIS portal is not patched.' },
      { when: 'Mar 15, 2017', what: 'Two scans find no vulnerable system among 958 external addresses. The interim CSO later said one scan ran on the root directory, not the subfolder where Struts lived.' },
      { when: 'About Dec 2015 to Jul 2017', what: 'The device that inspects ACIS traffic sits inactive for 19 months because its certificate expired. Equifax had let over 300 certificates expire.' },
      { when: 'May 13, 2017', what: 'Attackers enter ACIS through the Struts flaw, and drop web shells (about 30 in all). Entry through Struts is Equifax\'s and Mandiant\'s finding.' },
      { when: 'May to July', what: 'They find plaintext credentials on a file share, use them to reach 48 databases, run about 9,000 queries (265 returned personal data), compress the files in a web folder and pull them out with wget. About 35 IP addresses are used.' },
      { when: 'Jul 29, 2017', what: 'The certificate is renewed. Equifax immediately sees a suspicious request from a China-based address and big responses.' },
      { when: 'Jul 30, 2017', what: 'Equifax finds SQL injection and direct-object-reference flaws in ACIS, and takes the portal offline at 12:41 pm.' },
      { when: 'Aug 2, 2017', what: 'Equifax engages Mandiant and contacts the FBI.' },
      { when: 'Sep 7, 2017', what: 'Equifax announces the breach: 143 million US consumers. The count later grows to about 148 million.' },
      { when: 'Jul 22, 2019', what: 'Equifax settles with the FTC, the CFPB and states: at least $575 million, up to $700 million.' },
      { when: 'Feb 10, 2020', what: 'The US Justice Department indicts four members of the Chinese military (PLA 54th Research Institute) for the intrusion. These are allegations.' },
    ],
    realOutcome: [
      'Names, Social Security numbers, birth dates, addresses and in some cases driver\'s license numbers of about 148 million people were taken, per the House Oversight report. Equifax also said 209,000 credit card numbers and 182,000 dispute documents were accessed.',
      'The CIO and CSO retired within eight days of the announcement, and the CEO left on September 26.',
      'Equifax agreed in July 2019 to pay at least $575 million, and up to $700 million, to settle with the FTC, the CFPB and states.',
      'The DOJ said in February 2020 that four members of the Chinese military hacked Equifax. The DOJ alleged this. China denied it.',
    ],
    failures: [
      'A critical Struts patch with a public exploit was not applied on ACIS, though an advisory reached about 430 people with a 48-hour deadline.',
      'Nobody could say which apps ran Struts. The scan checked the root folder and missed the subfolder where it lived: an asset inventory and visibility failure.',
      'The monitoring device had been blind for 19 months on an expired certificate, with no alert on expiry.',
      'Application credentials sat in a plaintext file on a share any ACIS server could read.',
      'ACIS needed 3 databases but the account reached 48: no segmentation or least privilege.',
      'No file integrity monitoring on ACIS, so about 30 web shells appeared without an alert.',
      'Personal data in those databases was not encrypted at rest.',
    ],
    attack: [
      { id: 'T1190', name: 'Exploit Public-Facing Application', fix: 'Patch critical flaws with a public exploit within days, keep an inventory of every app and its components, and scan the full path, then verify the patch landed.' },
      { id: 'T1505.003', name: 'Server Software Component: Web Shell', fix: 'Turn on file integrity monitoring on web servers, alert on new .jsp files outside a deployment, and run the app as a low-privilege user.' },
      { id: 'T1552.001', name: 'Unsecured Credentials: Credentials In Files', fix: 'Move secrets into a vault, restrict who can read config shares, and scan shares for passwords.' },
      { id: 'T1078', name: 'Valid Accounts', fix: 'Give each app a database account limited to the databases it needs, and alert when one account connects to dozens of databases.' },
      { id: 'T1560', name: 'Archive Collected Data', fix: 'Alert on new archive files in web folders, and encrypt personal data at rest so a stolen file is not readable.' },
      { id: 'T1041', name: 'Exfiltration Over C2 Channel', fix: 'Keep traffic inspection alive: track certificate expiry on security tools and alert 30 days ahead. Alert on big outbound responses.' },
    ],
    resume: 'Investigated a simulated recreation of the 2017 Equifax breach in Cyber Office: traced an unpatched Apache Struts flaw, web shells, plaintext credentials and a blind inspection device through web, database and network logs (MITRE ATT&CK T1190, T1505.003, T1552.001), audited inventory, certificates and secrets, and made the containment and escalation calls. Score: {grade}.',
    sources: [
      { title: 'US House Oversight Committee: The Equifax Data Breach (staff report, Dec 2018)', url: 'https://oversight.house.gov/wp-content/uploads/2018/12/Equifax-Report.pdf' },
      { title: 'US GAO: Data Protection: Actions Taken by Equifax and Federal Agencies (GAO-18-559)', url: 'https://www.gao.gov/products/gao-18-559' },
      { title: 'Equifax: Equifax Announces Cybersecurity Incident Involving Consumer Information (Sep 7, 2017)', url: 'https://investor.equifax.com/news-events/press-releases/detail/224/equifax-announces-cybersecurity-incident-involving-consumer' },
      { title: 'US Department of Justice: Chinese Military Personnel Charged with Computer Fraud, Economic Espionage and Wire Fraud (Feb 2020)', url: 'https://www.justice.gov/opa/pr/chinese-military-personnel-charged-computer-fraud-economic-espionage-and-wire-fraud-hacking' },
      { title: 'Apache Struts security bulletin S2-045 (CVE-2017-5638)', url: 'https://cwiki.apache.org/confluence/display/WW/S2-045' },
      { title: 'CFPB: CFPB, FTC and states announce settlement with Equifax over 2017 data breach', url: 'https://www.consumerfinance.gov/about-us/newsroom/cfpb-ftc-states-announce-settlement-with-equifax-over-2017-data-breach/' },
    ],
    disclaimer: 'A dramatized recreation based on public reporting, chiefly the House Oversight report. The staff, hostnames, file names, account names and IP addresses are fictional stand-ins (the real internal details and attacker IPs were not published). The chain follows the sources: the Struts flaw, the missed scan, web shells, a plaintext credentials file, 48 databases, the 19-month expired certificate and the July 29 and 30 discovery. The times of day, the log lines, the Saturday-morning inbox, the conversations and the "renew your certificate" phish are illustrative. Attribution to the Chinese military is the US Justice Department\'s allegation. Dollar costs in your report are estimates for this replay.',
  },
};
