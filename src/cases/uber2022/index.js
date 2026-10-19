// Case file: Uber, September 15, 2022. A recreation of a real breach, built from public reporting.
// Same engine as the week (see src/days/index.js for every field); plus caseFile, which drives the
// Case Files menu card and the "what really happened" half of the report.
import { EMAILS, PAGES, REPLY_DRAFTS } from './emails.js';
import { generateLogs, ALERTS, CASE, IP_INFO, DATE, VPN_IP } from './logs.js';
import { SLACK_GENERAL, SLACK_SCORE } from './talk.js';
import { scoreEmail, scoreCase, scoreConversation, finalize } from '../../game/scoring.js';

const MAIN = 'uber-pam';
// Finding the script: any recursive grep of the share, or opening the script itself.
const FIND_RE = /(grep\b.*\s-\w*[rR]\w*\b.*|\bpam-sync\.ps1\b)/;

function scriptItem(st) {
  const cmds = st.events.filter((e) => e.type === 'terminal-cmd');
  const found = cmds.some((e) => FIND_RE.test(e.cmd));
  return {
    id: 'script',
    area: 'Terminal',
    title: 'Find the hardcoded admin password on the IT share',
    max: 10,
    teaches: { skill: 'Hunt for secrets in files (grep -r)', secplus: '4.9 Use data sources to support an investigation' },
    outcome: found ? 'good' : cmds.length ? 'ok' : 'bad',
    points: found ? 10 : cmds.length ? 4 : 0,
    what: found ? `You found pam-sync.ps1 and its plaintext vault admin password (${cmds.length} command${cmds.length === 1 ? '' : 's'}).` : cmds.length ? 'You opened the Terminal but never found the script.' : 'You never searched the share.',
    why: 'This is the hinge of the whole breach. A VPN session as a contractor is a foothold. A password in a script that anyone on the network could read made it the keys to everything. Real defenders run secret scanners across shares and repos so that file never exists.',
  };
}

function score(st) {
  return finalize([
    ...EMAILS.map((e) => scoreEmail(e, st.mail?.[e.id])),
    scoreConversation(SLACK_SCORE, st.enc?.slack),
    scriptItem(st),
    scoreCase(CASE, st.soc?.cases?.[MAIN]),
  ]);
}

function debrief(st) {
  const r = score(st);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const lines = ['Okay. Replay over. Let\'s compare you to what really happened.'];
  if (by.case.outcome === 'good') lines.push('Your write-up matches the real chain: bought password, push spam, one approval after a WhatsApp message, then a script holding the vault admin password.');
  else if (st.soc?.cases?.[MAIN]) lines.push('Your write-up missed part of the chain. In reality: bought password, push spam, a WhatsApp message from "IT", one approval, then a script with the vault admin password.');
  else lines.push('You never wrote it up. In the real breach, the attacker had admin over Slack, Google Workspace and more by the time anyone looked.');
  if (by.case.contained) lines.push('You disabled the account and rotated the vault secrets. That is roughly what Uber did that night: rotated keys, locked the codebase, forced everyone to sign in again.');
  if (by.script.outcome === 'good') lines.push('And you found pam-sync.ps1. The US Cyber Safety Review Board called out exactly this: privileged credentials in a PowerShell script on a misconfigured share.');
  if (st.enc?.slack?.outcome === 'joke') lines.push('About the Slack post: you called it a joke. So did a lot of real employees. The attacker was still inside.');
  if (st.mail?.contractor?.read) lines.push('Ravi\'s email at 14:31 was the earliest warning anyone had. In real life, reports like that often sit in a queue.');
  if (st.mail?.['sso-reverify']?.enteredCreds) lines.push('And you gave your password to the copycat phish. Breaches attract scammers. Stay sharp when things are loud.');
  lines.push('Real outcome: Uber said it found no evidence that rider data or production systems were touched, and that it believes the attacker is affiliated with Lapsus$.');
  lines.push("Here's your case report, and what you can honestly say you've done.");
  return lines;
}

function terminal() {
  return {
    date: 'Thu Sep 15 2022',
    note: 'The IT file share (fs-it01) is mirrored read-only at /mnt/fs-it01/IT.',
    files: {
      '/mnt/fs-it01/IT/README.txt': 'IT department share. Scripts for helpdesk and ops.\nPlease do not store personal files here.\n',
      '/mnt/fs-it01/IT/scripts/map-drives.ps1': [
        '# Maps the standard network drives at logon',
        'New-PSDrive -Name "S" -PSProvider FileSystem -Root "\\\\fs-it01\\Shared" -Persist',
        'New-PSDrive -Name "H" -PSProvider FileSystem -Root "\\\\fs-it01\\Home\\$env:USERNAME" -Persist',
        '',
      ].join('\n'),
      '/mnt/fs-it01/IT/scripts/printer-fix.ps1': [
        '# Restarts the print spooler. Run as the logged-on user.',
        'Restart-Service -Name Spooler -Force',
        'Write-Host "Printer queue reset."',
        '',
      ].join('\n'),
      '/mnt/fs-it01/IT/scripts/onboarding-laptop.ps1': [
        '# New laptop setup. Password policy reminder: 14+ characters, no reuse.',
        'Install-Module -Name PSWindowsUpdate -Force',
        'Get-WindowsUpdate -AcceptAll -Install',
        '',
      ].join('\n'),
      '/mnt/fs-it01/IT/scripts/pam-sync.ps1': [
        '# Syncs service account passwords from Secret Server into the deploy tooling.',
        '# TODO: move these credentials into the vault API with a scoped key (ticket OPS-2291)',
        '$SecretServerUrl = "https://pam01.corp.uber.internal/SecretServer"',
        '$Username = "ss-admin"',
        '$Password = "[REDACTED IN THIS REPLAY: plaintext admin password, 18 chars]"',
        '$Body = @{ username = $Username; password = $Password; grant_type = "password" }',
        '$Token = Invoke-RestMethod -Uri "$SecretServerUrl/oauth2/token" -Method Post -Body $Body',
        '',
      ].join('\n'),
      '/mnt/fs-it01/IT/old/vpn-setup-2019.txt': 'Contractor VPN profile: contractor-full (all internal subnets).\nTODO restrict to the app subnets only.\n',
      '/home/analyst01/README.txt': [
        'Tips from Priya:',
        '  ls -R is not here, but grep can search a whole folder:',
        '  grep -r <word> /mnt/fs-it01/IT          search every file under IT for <word>',
        '  grep -ril password /mnt/fs-it01/IT      -i ignore case, -l just list the files',
        '  cat <file>                               read a file',
        `  whois 203.0.113.77                       who owns the attacker's IP?`,
        '',
      ].join('\n'),
    },
    whois: {
      '203.0.113.77': 'NetRange: 203.0.113.0 - 203.0.113.255\nOrgName: Example Residential Proxy Network\nCountry: GB\nComment: Rotating residential exits for rent.\n(Stand-in. The real attacker IPs were not published.)',
      'uber-ssoverify.com': 'Domain Name: UBER-SSOVERIFY.COM\nCreation Date: 2022-09-15T23:51:12Z\nRegistrar: NameSilo, LLC\nRegistrant: REDACTED FOR PRIVACY\n(Registered less than an hour ago.)',
      'uber.com': 'Domain Name: UBER.COM\nCreation Date: 1995-05-19\nRegistrar: MarkMonitor Inc.',
    },
    dns: { 'uber-ssoverify.com': 'Name:\tuber-ssoverify.com\nAddress: 203.0.113.91' },
  };
}

export default {
  n: 1,
  caseId: 'uber-2022',
  date: DATE,
  title: 'Uber · September 2022',
  start: 16 * 60 + 24,
  endAt: 19 * 60 + 30,
  intro: ['Case Files: Uber, September 15, 2022.', 'A replay of a real breach. Priya is running it from her office.'],
  badgeAtStart: true,
  cast: ['mike'],

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
        'Welcome to Case Files. Today we replay a real breach, step by step, from public reports.',
        "It's Thursday, September 15, 2022, 4:24 PM. You're the analyst on shift at Uber's SOC. Same office, different logo.",
        "The others are playing roles. The attacker's moves are what really happened. Your moves are up to you.",
        'Start with your inbox. Something has been brewing since lunch.',
      ],
      again: ['Inbox first. Then follow whatever breaks.'],
    },
    dana: { talk: ["I'm playing the IT helpdesk tonight. Quiet so far. Suspiciously quiet."], again: ['Still quiet. I hate it.'] },
    mike: { talk: ["I'm an Uber engineer tonight. Mostly I'm in Slack."], again: ['Slack is weird today.'] },
  },

  objectives: [
    { id: 'priya', type: 'talk', text: 'Get the case briefing from Priya' },
    { id: 'my-desk', type: 'sit', text: 'Sit down at your desk' },
    { id: 'inbox', type: 'inbox', target: 'my-desk', text: 'Go through the SOC inbox' },
    { id: 'slack', type: 'encounter', target: 'mike', text: 'Mike is coming over, looking at his phone', waitText: 'Mike is staring at his phone.' },
    { id: 'script', type: 'terminal', match: FIND_RE, target: 'my-desk', waitFor: 'alert', text: 'Terminal: search /mnt/fs-it01/IT for passwords (grep -r)', waitText: 'Waiting on the SIEM.' },
    { id: 'server-door', type: 'badge', text: 'Badge into the server room' },
    { id: 'soc', type: 'case', target: 'soc', text: 'Work the case at the SOC console' },
    { id: 'debrief', type: 'debrief', target: 'priya', text: 'Debrief with Priya: what really happened' },
  ],
  encounters: [{ id: 'slack', type: 'walkup', npc: 'mike', after: 'inbox', delayMs: 1500, fallbackAt: 16 * 60 + 50, intro: 'Hey! Have you seen Slack?', conv: SLACK_GENERAL }],

  score,
  debrief,

  caseFile: {
    id: 'uber-2022',
    company: 'Uber',
    when: 'September 15, 2022',
    title: 'MFA fatigue to keys of the kingdom',
    pitch: 'A contractor gets 50+ login prompts, then a WhatsApp message from "IT". One tap later, the attacker finds an admin password in a script and owns Slack, Google Workspace and the password vault.',
    tags: ['MFA fatigue', 'Social engineering', 'Hardcoded secrets', 'Lapsus$'],
    difficulty: 'Starter',
    headline: 'An attacker Uber believes is affiliated with Lapsus$ went from one contractor password to admin over Uber\'s internal tools in an afternoon, then announced it in company Slack.',
    timeline: [
      { when: 'Before Sep 15, 2022', what: "Malware on a contractor's personal device. Uber says the attacker likely bought the contractor's corporate password on the dark web." },
      { when: 'Sep 15, afternoon', what: 'The attacker logs in again and again, sending the contractor a flood of MFA push requests.' },
      { when: 'Sep 15', what: 'Posing as Uber IT on WhatsApp, the attacker tells the contractor the prompts will stop if they accept one. They accept. (From the attacker\'s own account, widely reported.)' },
      { when: 'Sep 15', what: 'On the VPN, the attacker finds a PowerShell script on a network share containing admin credentials for the Thycotic privileged access (PAM) vault.' },
      { when: 'Sep 15', what: "Using vault secrets, the attacker reaches Uber's Google Workspace and Slack, an internal finance tool, and the HackerOne bug bounty dashboard (all confirmed by Uber)." },
      { when: 'Sep 15, evening', what: 'The attacker posts in company-wide Slack: "I announce I am a hacker and Uber has suffered a data breach." Many employees reportedly think it\'s a joke.' },
      { when: 'Sep 15-16', what: 'Uber takes internal tools offline, rotates keys, locks the codebase, forces everyone to sign in again, and contacts the FBI and DOJ.' },
      { when: 'Sep 19, 2022', what: 'Uber publishes its update and says it believes the attacker is affiliated with Lapsus$.' },
    ],
    realOutcome: [
      'Uber said it found no evidence that the attacker accessed production systems, rider or driver accounts, or sensitive user databases. Rides and deliveries kept running.',
      'Internal tools went offline for a while. Uber disclosed that the attacker downloaded some internal Slack messages and accessed or downloaded information from an internal tool its finance team uses for invoices.',
      'In 2023 the US Cyber Safety Review Board studied Lapsus$ and its tactics. Its report lists "privileged credentials embedded in a PowerShell script, stored on a misconfigured network share" as one of the ways the group escalated.',
    ],
    failures: [
      'Push MFA with no number matching and no limit on prompts, so a tired user could be worn down.',
      "A contractor's password was already for sale after malware infected a personal device.",
      'Users were not prepared for "IT" contacting them on WhatsApp. Real IT never asks you to approve a prompt.',
      'A broad contractor VPN profile reached internal shares it did not need.',
      'Plaintext admin credentials for the password vault sat in a script on a readable share.',
      'One vault admin credential exposed the keys to cloud, SSO, Slack, Google Workspace and the EDR console.',
    ],
    attack: [
      { id: 'T1078', name: 'Valid Accounts', fix: 'Watch for leaked credentials (breach feeds), require managed devices for corporate sign-in, and give contractors only the access they need.' },
      { id: 'T1621', name: 'Multi-Factor Authentication Request Generation', fix: 'Turn on number matching, rate-limit push prompts, alert on bursts of denials, and move admins to phishing-resistant MFA (FIDO2 security keys).' },
      { id: 'T1656', name: 'Impersonation', fix: 'Teach everyone: IT never asks you to approve a prompt or share a code. Give people one fast way to report a weird contact.' },
      { id: 'T1133', name: 'External Remote Services', fix: 'Scope contractor VPN profiles to the apps they need, or replace the VPN with per-app (zero trust) access.' },
      { id: 'T1552.001', name: 'Unsecured Credentials: Credentials In Files', fix: 'Scan shares and repos for secrets, fail builds that contain them, and give scripts short-lived scoped tokens instead of passwords.' },
      { id: 'T1555', name: 'Credentials from Password Stores', fix: 'Lock vault admin behind hardware MFA and just-in-time approval, and alert on admin logins from anywhere but the jump host.' },
    ],
    resume: 'Investigated a simulated recreation of the Uber 2022 breach (Lapsus$-attributed) in Cyber Office: traced MFA-fatigue initial access and hardcoded PAM vault credentials through SSO, VPN and SaaS audit logs (MITRE ATT&CK T1621, T1552.001), and wrote a containment plan. Score: {grade}.',
    sources: [
      { title: 'Uber Newsroom: Security update (Sept 2022)', url: 'https://www.uber.com/newsroom/security-update/' },
      { title: 'Cyber Safety Review Board: Review of the attacks associated with Lapsus$ (2023)', url: 'https://www.cisa.gov/resources-tools/resources/review-attacks-associated-lapsus-and-related-threat-groups-report' },
      { title: 'CISA fact sheet: Implementing number matching in MFA applications', url: 'https://www.cisa.gov/sites/default/files/publications/fact-sheet-implement-number-matching-in-mfa-applications-508c.pdf' },
      { title: 'CyberArk: Unpacking the Uber breach', url: 'https://www.cyberark.com/resources/pam-self-hosted/unpacking-the-uber-breach' },
      { title: 'BleepingComputer: Uber hacked, internal systems breached', url: 'https://www.bleepingcomputer.com/news/security/uber-hacked-internal-systems-breached-and-vulnerability-reports-stolen/' },
    ],
    disclaimer: 'A dramatized recreation based on public reporting. The contractor, the coworkers, hostnames, usernames and IP addresses are fictional stand-ins (real internal details were never published). The attack chain, techniques and outcomes follow the sources above. The WhatsApp wording and the copycat phish are illustrative. Times are compressed into one evening.',
  },
};
