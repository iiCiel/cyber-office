// Case file: Capital One, March-July 2019. A recreation of a real breach, built from public sources.
// Same engine as the week (see src/days/index.js for every field); plus caseFile, which drives the
// Case Files menu card and the "what really happened" half of the report.
import { EMAILS, PAGES, REPLY_DRAFTS } from './emails.js';
import { generateLogs, ALERTS, CASE, IP_INFO, DATE } from './logs.js';
import { TIP_TALK, TIP_SCORE } from './talk.js';
import { TICKETS } from './tickets.js';
import { scoreEmail, scoreCase, scoreTicket, scoreConversation, finalize } from '../../game/scoring.js';

const MAIN = 'c1-s3';

function score(st) {
  return finalize([
    ...EMAILS.map((e) => scoreEmail(e, st.mail?.[e.id])),
    scoreConversation(TIP_SCORE, st.enc?.tip),
    ...TICKETS.map((t) => scoreTicket(t, st.tickets?.[t.id])),
    scoreCase(CASE, st.soc?.cases?.[MAIN]),
  ]);
}

function debrief(st) {
  const r = score(st);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const lines = ["Okay. Replay over. Let's compare you to the public record."];
  if (by.case.outcome === 'good') lines.push('Your write-up matches the public account: a misconfigured firewall server, its role credentials, an over-permissive role that could list and copy S3 buckets, access through Tor and a VPN, and a stranger\'s tip as the only detection.');
  else if (st.soc?.cases?.[MAIN]) lines.push('Your write-up missed part of the chain. As reported: a misconfigured firewall server, role credentials, ListBuckets and a sync of the data, then a responsible-disclosure tip on July 17, 2019.');
  else lines.push('You never wrote it up. In the real incident nothing inside the company raised an alarm. A tip did.');
  if (by.case.contained) lines.push('You pulled the stolen session and shrank the role. That is the AWS guidance too: least privilege on roles, and filter what a server may fetch.');
  if (st.enc?.tip?.outcome === 'preserve-and-fix') lines.push('On the tip you kept the evidence first. Capital One confirmed the incident on July 19, two days after the email, and called the FBI.');
  else if (st.enc?.tip?.outcome === 'ignored') lines.push('You filed the tip as spam. In the real incident a tip like it was the only reason anyone found out.');
  else if (st.enc?.tip?.outcome === 'hostile') lines.push('You threatened the reporter. The real company thanked the reporter, as a disclosure program should.');
  else if (st.enc?.tip?.outcome === 'rushed') lines.push('You moved fast on the tip but threw away the instance. Evidence first, then containment.');
  lines.push('A technical note. The DOJ complaint says a firewall misconfiguration let commands reach a server, and that a command got the role\'s credentials. The "SSRF against the metadata service" label comes from security analysts, and AWS later added IMDSv2 (Nov 2019) to make that harder.');
  lines.push('The money question. The OCC fined the bank $80 million in August 2020 and said it moved to the cloud without effective risk assessment. Capital One said about 100 million people in the US and 6 million in Canada were affected, with about 140,000 SSNs and 80,000 bank account numbers in the US data. The attacker was convicted in 2022.');
  if (st.mail?.['aws-suspend']?.enteredCreds) lines.push('And you gave your password to the copycat "verify your AWS account" phish. Breaches attract scammers.');
  lines.push("Here's your case report, and what you can honestly say you've done.");
  return lines;
}

export default {
  n: 2,
  caseId: 'capital-one-2019',
  date: DATE,
  title: 'Capital One · July 2019',
  start: 8 * 60 + 5,
  endAt: 11 * 60 + 30,
  intro: ['Case Files: Capital One, July 17, 2019.', 'A replay of a real breach. Priya is running it from her office.'],
  badgeAtStart: true,
  cast: ['mike', 'theo'],

  emails: EMAILS,
  pages: PAGES,
  replyDrafts: REPLY_DRAFTS,
  logs: (st) => generateLogs({ nowMinutes: st.minutes }),
  ipInfo: IP_INFO,
  alerts: ALERTS,
  tickets: TICKETS,

  npcLines: {
    priya: {
      talk: [
        'Welcome to Case Files. Today: Capital One, 2019.',
        "It's Wednesday, July 17, 2019, 8:05 AM. You're the cloud security analyst. There is an IAM review queue, a disclosure inbox, and CloudTrail.",
        'The replay squeezes four months into one morning. In reality the access was in March, and nobody inside Capital One noticed. A tip on July 17 broke it open. The logs are already in the SIEM.',
        'Start with your inbox.',
      ],
      again: ['Inbox first. Then the review queue.'],
    },
    dana: { talk: ["I'm on the service desk. I mostly watch the queue today."], again: ['The review queue is yours.'] },
    mike: { talk: ["I'm playing the product owner for the cards app. I just want it not to break."], again: ['Please do not break the firewall.'] },
    theo: { talk: ["I'm the cloud platform engineer. Roles, buckets, firewall servers. That is me."], again: ['If you need CloudTrail, ask me.'] },
  },

  objectives: [
    { id: 'priya', type: 'talk', text: 'Get the case briefing from Priya' },
    { id: 'my-desk', type: 'sit', text: 'Sit down at your desk' },
    { id: 'inbox', type: 'inbox', target: 'my-desk', text: 'Go through the security and disclosure inbox' },
    { id: 'tip', type: 'encounter', target: 'theo', text: 'Theo is coming over about the disclosure email', waitText: 'Someone is on the way to talk to you.' },
    { id: 'tickets', type: 'tickets', target: 'my-desk', text: 'Work through the IAM review queue' },
    { id: 'server-door', type: 'badge', text: 'Badge into the server room' },
    { id: 'soc', type: 'case', target: 'soc', text: 'Work the case at the SOC console' },
    { id: 'debrief', type: 'debrief', target: 'priya', text: 'Debrief with Priya: what really happened' },
  ],
  encounters: [{ id: 'tip', type: 'walkup', npc: 'theo', after: 'inbox', delayMs: 1500, fallbackAt: 8 * 60 + 40, intro: 'Hey. Did you see the disclosure email?', conv: TIP_TALK }],

  score,
  debrief,

  caseFile: {
    id: 'capital-one-2019',
    company: 'Capital One',
    when: 'March-July 2019',
    title: 'One firewall, one role, 100 million customers',
    pitch: 'A misconfigured web application firewall handed an outsider its cloud role credentials. The role could list and copy S3 buckets. About 100 million people in the US and 6 million in Canada were affected, and a stranger\'s email was how the bank found out.',
    tags: ['SSRF', 'Cloud misconfig', 'IAM / least privilege', 'Logging and alerting', 'Responsible disclosure'],
    difficulty: 'Intermediate',
    headline: 'In March 2019 an outside attacker got to a server behind a misconfigured web application firewall at Capital One, obtained the credentials of its cloud role, and used them to list and copy data from storage buckets. Capital One learned of it from a July 17 tip.',
    timeline: [
      { when: 'Mar 22-23, 2019', what: 'Capital One says the unauthorized access took place on these days. The DOJ complaint describes a firewall misconfiguration that let commands reach and run on a server.' },
      { when: 'Per the complaint (dates not given)', what: 'A command obtained the security credentials for a role (name redacted, "...-WAF-Role"), a second command listed buckets the role could see, and a third, the "Sync Command", copied data out. Capital One\'s logs showed connections from Tor and a VPN service.' },
      { when: 'Apr 21, 2019 (complaint)', what: 'A file posted publicly on GitHub holds the three commands and a list of more than 700 folders or buckets.' },
      { when: 'Jun 27, 2019 (reported)', what: 'The attacker posts a list of databases found on misconfigured cloud instances in a Slack channel; two entries belong to Capital One (reported by Krebs on Security).' },
      { when: 'Jul 17, 2019', what: 'An outside GitHub user alerts Capital One through its Responsible Disclosure Program about data of theirs on GitHub.' },
      { when: 'Jul 19, 2019', what: 'Capital One determines the incident, fixes the configuration, and works with the FBI.' },
      { when: 'Jul 29-30, 2019', what: 'The FBI arrests the attacker, a former employee of the cloud provider according to the complaint. Capital One announces the breach: about 100 million people in the US and 6 million in Canada.' },
      { when: 'Aug 6, 2020', what: 'The OCC fines Capital One $80 million for moving to the public cloud without effective risk assessment and not fixing deficiencies in time.' },
      { when: 'Jun 2022', what: 'A federal jury convicts the attacker of wire fraud and unauthorized access to protected computers (DOJ). The attacker is sentenced in October 2022 to time served and five years of probation (news reports).' },
    ],
    realOutcome: [
      'Capital One said about 100 million people in the US and about 6 million in Canada were affected: credit card applications from 2005 to early 2019 and some customer data (names, addresses, dates of birth, credit scores, limits, balances).',
      'About 140,000 US Social Security numbers, about 80,000 linked bank account numbers and about 1 million Canadian Social Insurance Numbers were taken. Capital One said card numbers and login credentials were not.',
      'The OCC fined Capital One $80 million in August 2020. The bank had earlier been widely reported to expect $100 to $150 million in 2019 costs, and a class action settlement was given preliminary approval in February 2022.',
      'The attacker was a former employee of the cloud provider (per the complaint), and was charged with computer fraud, then convicted in 2022. The complaint says data from more than 30 other organizations was involved too.',
    ],
    failures: [
      'A web application firewall was configured so that a request could make the server do something it should not, and it was reachable from the internet.',
      'The WAF server\'s role was over-permissive: it could list buckets and read data in them, far beyond what a firewall needs.',
      'The instance metadata service gave a temporary credential to any request from the host, with no token. (AWS later added IMDSv2 in November 2019.)',
      'Nobody noticed role credentials being used from Tor and a VPN. The company learned of it from an outside tip, months later.',
      'Sensitive data was readable by a role that should not have touched it.',
      'The OCC said the bank moved to the cloud without effective risk assessment and was slow to correct deficiencies.',
    ],
    attack: [
      { id: 'T1190', name: 'Exploit Public-Facing Application', fix: 'Review every web-facing proxy or firewall rule and test misconfigurations. Block requests that make the server fetch internal or link-local addresses. Allow only known outbound destinations.' },
      { id: 'T1552.005', name: 'Unsecured Credentials: Cloud Instance Metadata API', fix: 'Require IMDSv2 (session tokens, hop limit 1), or turn the metadata service off where it is not needed, and block it from app-layer proxies.' },
      { id: 'T1078.004', name: 'Valid Accounts: Cloud Accounts', fix: 'Alert on role credentials used from addresses outside your own network or cloud, and keep roles short-lived and scoped.' },
      { id: 'T1580', name: 'Cloud Infrastructure Discovery', fix: 'Deny s3:ListAllMyBuckets and wildcard resources to workloads that do not need them. A role that cannot list buckets cannot go shopping.' },
      { id: 'T1530', name: 'Data from Cloud Storage', fix: 'Scope roles to named buckets, enable data-event logging on sensitive buckets, alert on bulk reads, and encrypt or tokenize sensitive fields.' },
      { id: 'T1090.003', name: 'Proxy: Multi-hop Proxy', fix: 'Treat Tor and anonymizing-VPN sources as high risk for any service-role session. They have no business using an instance role.' },
    ],
    resume: 'Investigated a simulated recreation of the 2019 Capital One cloud breach in Cyber Office: triaged a responsible-disclosure report, reviewed IAM roles for least privilege, and traced stolen instance-role credentials through CloudTrail and WAF logs to bulk S3 reads (MITRE ATT&CK T1552.005, T1580, T1530), then wrote a containment plan. Score: {grade}.',
    sources: [
      { title: 'US Department of Justice (W.D. Wash.): Seattle tech worker arrested for data theft involving a large financial services company', url: 'https://www.justice.gov/usao-wdwa/pr/seattle-tech-worker-arrested-data-theft-involving-large-financial-services-company' },
      { title: 'US Department of Justice (W.D. Wash.): United States v. Paige Thompson (complaint and case page)', url: 'https://www.justice.gov/usao-wdwa/united-states-v-paige-thompson' },
      { title: 'Capital One: 2019 Cybersecurity Incident (company statement)', url: 'https://www.capitalone.com/digital/facts2019/' },
      { title: 'OCC: Press release, $80 million penalty against Capital One (Aug 6, 2020)', url: 'https://www.occ.gov/news-issuances/news-releases/2020/nr-occ-2020-101.html' },
      { title: 'OCC: Consent order against Capital One (EA 2020-036)', url: 'https://www.occ.gov/static/enforcement-actions/ea2020-036.pdf' },
      { title: 'US Department of Justice (W.D. Wash.): Former Seattle tech worker convicted of wire fraud and computer intrusions (Jun 2022)', url: 'https://www.justice.gov/usao-wdwa/pr/former-seattle-tech-worker-convicted-wire-fraud-and-computer-intrusions' },
      { title: 'Krebs on Security: Capital One Data Theft Impacts 106M People', url: 'https://krebsonsecurity.com/2019/07/capital-one-data-theft-impacts-106m-people/' },
      { title: 'AWS Security Blog: Defense in depth: open firewalls, reverse proxies, SSRF and the EC2 metadata service (IMDSv2)', url: 'https://aws.amazon.com/blogs/security/defense-in-depth-open-firewalls-reverse-proxies-ssrf-vulnerabilities-ec2-instance-metadata-service/' },
      { title: 'Cloud Security Alliance: A Technical Analysis of the Capital One Cloud Misconfiguration Breach', url: 'https://cloudsecurityalliance.org/blog/2019/08/09/a-technical-analysis-of-the-capital-one-cloud-misconfiguration-breach' },
    ],
    disclaimer: 'A dramatized recreation based on public sources. Capital One never published its internal details, so the staff, hostnames, role and bucket names, log lines, request shapes and every IP address are fictional stand-ins (IPs come from documentation ranges). The attacker\'s commands are redacted and non-working. The chain follows the DOJ complaint and Capital One\'s statement: a misconfigured firewall, a role\'s credentials, a bucket listing, a sync of the data, Tor and VPN access, a July 17 tip. The "SSRF against the instance metadata service" step is the widely reported analysis, not wording from the complaint. The months between the access and the tip are compressed into one Wednesday morning, the weekly config digest, the "verify your AWS account" phish and the SIEM alert did not exist in reality, and IMDSv2 did not exist in July 2019 (AWS released it Nov 19, 2019). Dollar costs in your report are estimates for this replay.',
  },
};
