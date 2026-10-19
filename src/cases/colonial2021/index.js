// Case file: Colonial Pipeline, May 7, 2021. A recreation of a real attack, built from public reporting.
// Same engine as the week (see src/days/index.js for every field); plus caseFile, which drives the
// Case Files menu card and the "what really happened" half of the report.
import { EMAILS, PAGES, REPLY_DRAFTS } from './emails.js';
import { generateLogs, ALERTS, CASE, IP_INFO, DATE } from './logs.js';
import { NOTE_FOUND, NOTE_SCORE, SHUTDOWN_CALL, SHUTDOWN_SCORE } from './talk.js';
import { scoreEmail, scoreCase, scoreConversation, finalize } from '../../game/scoring.js';

const MAIN = 'colonial-vpn';
// Finding the account: open the export itself, or grep for accounts with no MFA / the legacy profile.
const FIND_RE = /(accounts\.csv|\bgrep\b.*\b(none|legacy|vpnlegacy|mfa)\b)/i;

function vpnItem(st) {
  const cmds = st.events.filter((e) => e.type === 'terminal-cmd');
  const found = cmds.some((e) => FIND_RE.test(e.cmd));
  return {
    id: 'vpn',
    area: 'Terminal',
    title: 'Find the forgotten VPN account with no MFA',
    max: 10,
    teaches: { skill: 'Audit accounts for missing MFA and stale access (grep)', secplus: '4.9 Use data sources to support an investigation' },
    outcome: found ? 'good' : cmds.length ? 'ok' : 'bad',
    points: found ? 10 : cmds.length ? 4 : 0,
    what: found ? `You found vpnlegacy in the VPN export: password only, no owner, still enabled (${cmds.length} command${cmds.length === 1 ? '' : 's'}).` : cmds.length ? 'You opened the Terminal but never looked at the VPN account list.' : 'You never audited the VPN accounts.',
    why: 'This is the hinge of the whole attack. Reporting says Colonial\'s IT team did not know this VPN was still in use, and it had no MFA, so one password was enough. Real defenders keep an inventory of every remote-access account and profile, and retire what nobody owns. Two more old profiles in the same export have the same problem.',
  };
}

function score(st) {
  return finalize([
    ...EMAILS.map((e) => scoreEmail(e, st.mail?.[e.id])),
    scoreConversation(NOTE_SCORE, st.enc?.note),
    vpnItem(st),
    scoreConversation(SHUTDOWN_SCORE, st.enc?.shutdown),
    scoreCase(CASE, st.soc?.cases?.[MAIN]),
  ]);
}

function debrief(st) {
  const r = score(st);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const lines = ["Okay. Replay over. Let's compare you to what really happened."];
  if (by.case.outcome === 'good') lines.push('Your write-up matches the real chain: a legacy VPN with no MFA, a week of quiet access, about 100 GB stolen, then DarkSide ransomware on the IT side. The pipeline control network was not the target.');
  else if (st.soc?.cases?.[MAIN]) lines.push('Your write-up missed part of the chain. In reality: a legacy VPN with no MFA, a week of access, about 100 GB copied out on May 6, then ransomware on billing and business systems on May 7.');
  else lines.push('You never wrote it up. In the real attack, the pipeline was down for about six days.');
  if (by.case.contained) lines.push('You closed the VPN and separated IT from OT. That is what CISA and the FBI recommend: MFA on all remote access, disable unused accounts, segment IT from OT.');
  if (by.vpn.outcome === 'good') lines.push("And you found vpnlegacy. According to coverage of the CEO's Senate testimony, Colonial's own IT team did not know that VPN was still in use.");
  if (st.enc?.shutdown?.outcome === 'shutdown') lines.push('You paused the pipeline. So did Colonial, on May 7. It restarted on May 12. Fuel shortages followed in the Southeast. There was no free option.');
  else if (st.enc?.shutdown?.outcome === 'isolate-run') lines.push('You kept it running by hand. Colonial chose to pause instead. Both are defensible. Neither is free.');
  else if (st.enc?.shutdown?.outcome === 'keep-running') lines.push('You kept it running as normal. Colonial paused, because it could not prove the control side was safe. Shutdown caused shortages, but running on a hunch could have been worse.');
  if (st.enc?.note?.outcome === 'deleted') lines.push('You had the ransom note deleted. In a real investigation that is evidence you cannot get back.');
  if (st.mail?.['restore-access']?.enteredCreds) lines.push('And you gave your password to the "confirm your sign-in" phish. Outages attract scammers. Stay sharp when things are loud.');
  lines.push('Real outcome: Colonial reportedly paid about $4.4 million in bitcoin (75 BTC) on May 8, after leadership decided on May 7 to pay. The decryptor was reportedly slow, so the company relied largely on backups. On June 7 the US Justice Department announced it had seized 63.7 BTC, about $2.3 million, of the payment.');
  lines.push('There is no "right answer" on the ransom in this replay. It is a leadership and legal call, made with the FBI.');
  lines.push("Here's your case report, and what you can honestly say you've done.");
  return lines;
}

const csv = (rows) => `${rows.map((r) => r.join(',')).join('\n')}\n`;

function terminal() {
  return {
    date: 'Fri May 07 2021',
    host: 'SOC-WS-07',
    motd: 'SOC workstation. Exports from the VPN gateway (vpn-gw01) are under /mnt/exports/vpn. Type help.\n',
    files: {
      '/mnt/exports/vpn/README.txt': [
        'Nightly export from vpn-gw01. Read-only copy.',
        'accounts.csv   one row per VPN account.',
        'profiles.txt   what each profile allows.',
        'mfa=none means the account signs in with a password alone.',
        '',
      ].join('\n'),
      '/mnt/exports/vpn/accounts.csv': csv([
        ['account', 'profile', 'mfa', 'status', 'last_used', 'owner'],
        ['j.alvarez', 'employee', 'push', 'enabled', '2021-05-07', 'Ops Scheduling'],
        ['k.mensah', 'employee', 'push', 'enabled', '2021-05-06', 'Finance'],
        ['d.ferraro', 'employee', 'push', 'enabled', '2021-05-06', 'Engineering'],
        ['s.park', 'employee', 'push', 'enabled', '2021-05-05', 'Engineering'],
        ['m.okafor', 'employee', 'push', 'enabled', '2021-05-04', 'Accounting'],
        ['t.nguyen', 'employee', 'push', 'enabled', '2021-05-06', 'Control Systems'],
        ['r.dube', 'employee', 'push', 'enabled', '2021-05-07', 'IT'],
        ['l.brandt', 'contractor', 'push', 'enabled', '2021-05-03', 'Vendor: pump maintenance'],
        ['p.harlan', 'employee', 'push', 'disabled', '2020-09-12', 'Left company'],
        ['backup-agent', 'site-to-site', 'cert', 'enabled', '2021-05-07', 'IT (service)'],
        ['lab-test', 'legacy-remote', 'none', 'enabled', '2018-06-02', 'unassigned'],
        ['tmp-vendor-2019', 'contractor-old', 'none', 'enabled', '2019-11-14', 'unassigned'],
        ['vpnlegacy', 'legacy-remote', 'none', 'enabled', '2021-05-07', 'unassigned'],
      ]),
      '/mnt/exports/vpn/profiles.txt': [
        'employee         auth: password + push      reach: app subnets      split tunnel: yes',
        'contractor       auth: password + push      reach: assigned apps    split tunnel: no',
        'site-to-site     auth: certificate          reach: backup vendor    split tunnel: n/a',
        'contractor-old   auth: password only        reach: all internal     (old, unused)',
        'legacy-remote    auth: password only        reach: all internal     (old, unused)',
        '',
      ].join('\n'),
      '/home/analyst01/note-photo.txt': [
        '[Photo of the note on the control-room PC, paraphrased. The real text is not reproduced here.]',
        'Says: your network is encrypted. Your backups were targeted. We also copied a lot of your data.',
        'Says: follow the contact instructions to get a decryptor and stop us publishing the data.',
        '(The contact address and payment address are left out on purpose.)',
        '',
      ].join('\n'),
      '/home/analyst01/README.txt': [
        'Tips from Priya:',
        '  The VPN export is under /mnt/exports/vpn. A few things to try:',
        '  cat /mnt/exports/vpn/accounts.csv         read the whole list',
        '  grep -i none /mnt/exports/vpn/accounts.csv    which accounts have no MFA?',
        '  grep -c enabled <file>                    -c counts matching lines',
        '  sort -t, -k5 <file>                       sort by the 5th column (last_used)',
        `  whois 203.0.113.58                        who owns the attacker's IP?`,
        '',
      ].join('\n'),
    },
    whois: {
      '203.0.113.58': 'NetRange: 203.0.113.0 - 203.0.113.255\nOrgName: Example Anonymizing Hosting\nCountry: unknown\nComment: Rented servers, no customer details.\n(Stand-in. The real attacker IPs were not published.)',
      '198.51.100.77': 'NetRange: 198.51.100.0 - 198.51.100.255\nOrgName: Example Cloud Hosting\nCountry: US\nComment: Customer storage. Registered recently.\n(Stand-in.)',
      'colonial-secure-login.com': 'Domain Name: COLONIAL-SECURE-LOGIN.COM\nCreation Date: 2021-05-07T08:40:12Z\nRegistrar: NameSilo, LLC\nRegistrant: REDACTED FOR PRIVACY\n(Registered a few hours ago. Illustrative.)',
    },
    dns: { 'colonial-secure-login.com': 'Name:\tcolonial-secure-login.com\nAddress: 203.0.113.91' },
  };
}

export default {
  n: 2,
  caseId: 'colonial-2021',
  date: DATE,
  title: 'Colonial Pipeline · May 2021',
  start: 5 * 60 + 30,
  endAt: 8 * 60 + 30,
  intro: ['Case Files: Colonial Pipeline, May 7, 2021.', 'A replay of a real attack. Priya is running it from her office.'],
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
        'Welcome to Case Files. Today we replay a real attack, step by step, from public reports.',
        "It's Friday, May 7, 2021, early morning. You're on Colonial Pipeline's IT security team. Colonial runs about 5,500 miles of pipeline, and says it carries roughly 45% of the fuel used on the East Coast.",
        "The others are playing roles. The attacker's moves are what really happened. Your moves are up to you.",
        'Start with your inbox. Something is off with billing, and the control room has sent a message.',
      ],
      again: ['Inbox first. Then follow whatever breaks.'],
    },
    dana: { talk: ["I'm playing the IT helpdesk this morning. Billing has been calling since four. Something's wrong."], again: ['Still no answers. Lots of calls.'] },
    mike: { talk: ["I'm the operations manager today. A bad day to be me."], again: ['Waiting on security.'] },
    theo: { talk: ["I'm a control room operator. All I do is watch the screens."], again: ['The screens look normal. That is what worries me.'] },
  },

  objectives: [
    { id: 'priya', type: 'talk', text: 'Get the case briefing from Priya' },
    { id: 'my-desk', type: 'sit', text: 'Sit down at your desk' },
    { id: 'inbox', type: 'inbox', target: 'my-desk', text: 'Go through the security inbox' },
    { id: 'note', type: 'encounter', target: 'theo', text: 'Theo is coming over from the control room', waitText: 'Someone from the control room is on the way.' },
    { id: 'vpn', type: 'terminal', match: FIND_RE, target: 'my-desk', waitFor: 'alert', text: 'Terminal: audit the VPN accounts for any with no MFA (grep)', waitText: 'Waiting on the SIEM.' },
    { id: 'shutdown', type: 'encounter', target: 'mike', text: 'Mike is coming over, and he looks stressed', waitText: 'The operations manager wants an answer.' },
    { id: 'server-door', type: 'badge', text: 'Badge into the server room' },
    { id: 'soc', type: 'case', target: 'soc', text: 'Work the case at the SOC console' },
    { id: 'debrief', type: 'debrief', target: 'priya', text: 'Debrief with Priya: what really happened' },
  ],
  encounters: [
    { id: 'note', type: 'walkup', npc: 'theo', after: 'inbox', delayMs: 1500, fallbackAt: 5 * 60 + 50, intro: 'Hey! Got a minute? Something is on my screen.', conv: NOTE_FOUND },
    { id: 'shutdown', type: 'walkup', npc: 'mike', after: 'vpn', delayMs: 1500, fallbackAt: 6 * 60 + 40, intro: 'I need to talk to you. Now.', conv: SHUTDOWN_CALL },
  ],

  score,
  debrief,

  caseFile: {
    id: 'colonial-2021',
    company: 'Colonial Pipeline',
    when: 'May 7, 2021',
    title: 'One forgotten VPN login, and a pipeline goes dark',
    pitch: 'A VPN profile that nobody remembered, with no MFA, let ransomware attackers into the business network. Billing went down, nobody could prove the control side was safe, and the biggest fuel pipeline in the US paused for days.',
    tags: ['Ransomware', 'No MFA', 'Legacy VPN', 'DarkSide', 'IT/OT'],
    difficulty: 'Intermediate',
    headline: 'Attackers using DarkSide ransomware got into Colonial Pipeline through a legacy VPN with single-factor sign-in, stole about 100 GB, then encrypted business systems. Colonial paused the whole pipeline for about six days.',
    timeline: [
      { when: 'Before Apr 29, 2021', what: "A legacy VPN with password-only sign-in stays reachable. According to coverage of the CEO's Senate testimony, Colonial's IT team did not know it was still in use." },
      { when: 'Apr 29', what: 'The attacker signs in with the legacy VPN account, no second factor needed (initial access date as reported). A Mandiant consultant said the password was found in a batch of leaked passwords on the dark web. How the attacker got it is not confirmed.' },
      { when: 'Apr 29 - May 6', what: 'The attacker works inside the IT network. What exactly they did in this window has not been made public.' },
      { when: 'May 6', what: 'About 100 GB of data is copied out in roughly two hours (reported by Bloomberg).' },
      { when: 'May 7, early morning', what: 'DarkSide ransomware encrypts IT and business systems, including billing. An employee finds a ransom note on a control-room computer (as reported).' },
      { when: 'May 7', what: 'Colonial proactively takes systems offline and pauses the pipeline to contain the threat. Reporting at the time said a key worry was that it could not bill customers, and that the attack might spread. It brings in Mandiant and notifies the FBI. Leadership decides to pay.' },
      { when: 'May 8', what: "Colonial pays about 75 BTC (roughly $4.4 million), according to the CEO. The decryptor is slow, so the company relies largely on backups." },
      { when: 'May 12', what: 'The pipeline restarts. Panic buying and shortages hit the Southeast. The same day, a US Executive Order on improving cybersecurity is signed.' },
      { when: 'Jun 7, 2021', what: 'The US Justice Department announces it seized 63.7 bitcoin (about $2.3 million) of the ransom.' },
    ],
    realOutcome: [
      'The pipeline was offline for about six days and fuel shortages followed in the Southeast. Colonial said the pipeline control (operations) systems were not directly hit. The company shut down as a precaution.',
      'The FBI attributed the attack to DarkSide, a ransomware-as-a-service group. The specific affiliate who attacked Colonial has not been made public.',
      'On June 7, 2021 the Justice Department said it had seized 63.7 bitcoin, about $2.3 million, of the roughly 75 bitcoin Colonial paid.',
      'The attack helped prompt new US pipeline security directives from the TSA and a May 2021 Executive Order on improving the nation\'s cybersecurity.',
    ],
    failures: [
      'A legacy VPN profile with password-only sign-in stayed reachable from the internet.',
      "The account and VPN were not in anyone's inventory, so nobody was watching or retiring them (as reported).",
      'No second factor, so one reused or leaked password was enough.',
      '100 GB left the network in about two hours without anyone noticing.',
      'Billing and operations were tied together closely enough that an IT outage forced a pipeline shutdown.',
      'Weak separation between the business network and the systems that run the pipeline made it hard to prove the control side was safe.',
    ],
    attack: [
      { id: 'T1133', name: 'External Remote Services', fix: 'Find every VPN, remote desktop and gateway you own, retire the ones nobody needs, and require MFA on the rest.' },
      { id: 'T1078', name: 'Valid Accounts', fix: 'Keep an owner for every account, disable stale ones, check staff passwords against breach lists, and alert on first-time logins from new places.' },
      { id: 'T1567', name: 'Exfiltration Over Web Service', fix: 'Alert on large outbound transfers from file servers, and limit which servers can reach the internet at all.' },
      { id: 'T1490', name: 'Inhibit System Recovery', fix: 'Keep offline, tested backups the attacker cannot reach, and alert when shadow copies are deleted.' },
      { id: 'T1486', name: 'Data Encrypted for Impact', fix: 'Segment the network, limit admin accounts, run EDR that blocks mass file renames, and rehearse restoring from backup.' },
    ],
    resume: 'Investigated a simulated recreation of the 2021 Colonial Pipeline ransomware attack (DarkSide-attributed) in Cyber Office: traced a no-MFA legacy VPN login, data exfiltration and file encryption through VPN, firewall and server logs (MITRE ATT&CK T1133, T1486), and made the shutdown and IT/OT isolation call. Score: {grade}.',
    sources: [
      { title: 'CISA / FBI: DarkSide Ransomware: Best Practices for Preventing Business Disruption (AA21-131A)', url: 'https://www.cisa.gov/news-events/cybersecurity-advisories/aa21-131a' },
      { title: 'US Department of Justice: Department of Justice Seizes $2.3 Million in Cryptocurrency Paid to the Ransomware Extortionists Darkside', url: 'https://www.justice.gov/opa/pr/department-justice-seizes-23-million-cryptocurrency-paid-ransomware-extortionists-darkside' },
      { title: 'The Record: DOJ officials say they recovered most of the Colonial ransomware payment', url: 'https://therecord.media/doj-officials-say-they-recovered-most-of-the-colonial-ransomware-payment' },
      { title: 'GovInfoSecurity: Colonial CEO at Senate hearing details ransomware attack', url: 'https://www.govinfosecurity.com/colonial-ceo-at-senate-hearing-details-ransomware-attack-a-16836' },
      { title: 'Bloomberg: Hackers breached Colonial Pipeline using compromised password (June 2021)', url: 'https://www.bloomberg.com/news/articles/2021-06-04/hackers-breached-colonial-pipeline-using-compromised-password' },
    ],
    disclaimer: 'A dramatized recreation based on public reporting. The staff, hostnames, account names, file names and IP addresses are fictional stand-ins (the real internal details and attacker IPs were never published). The general chain follows the sources above: a legacy VPN with no MFA, data theft on May 6, ransomware on May 7, a precautionary shutdown, a payment, and a partial recovery. What the attacker did between the first login and the theft, the number of logins, the times of day, and the lookalike phishing email are illustrative. How the VPN password was obtained is reported but not confirmed. Dollar costs in your report are estimates for this replay.',
  },
};
