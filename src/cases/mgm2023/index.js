// Case file: MGM Resorts, September 2023. A recreation of a real breach, built from public reporting.
// Same engine as the week (see src/days/index.js for every field); plus caseFile, which drives the
// Case Files menu card and the "what really happened" half of the report.
import { EMAILS, PAGES, REPLY_DRAFTS } from './emails.js';
import { generateLogs, ALERTS, CASE, IP_INFO, DATE } from './logs.js';
import { VISHING_CALL, VISHING_SCORE } from './talk.js';
import { TICKETS } from './tickets.js';
import { scoreEmail, scoreCase, scoreTicket, scoreConversation, finalize } from '../../game/scoring.js';

const MAIN = 'mgm-esxi';

function score(st) {
  return finalize([
    ...EMAILS.map((e) => scoreEmail(e, st.mail?.[e.id])),
    scoreConversation(VISHING_SCORE, st.enc?.vishing),
    ...TICKETS.map((t) => scoreTicket(t, st.tickets?.[t.id])),
    scoreCase(CASE, st.soc?.cases?.[MAIN]),
  ]);
}

function debrief(st) {
  const r = score(st);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const lines = ["Okay. Replay over. Let's compare you to what was reported."];
  if (by.case.outcome === 'good') lines.push('Your write-up matches the reported chain: a call to the help desk, an MFA reset, Okta admin, a new identity provider, cloud admin, then the hypervisors.');
  else if (st.soc?.cases?.[MAIN]) lines.push('Your write-up missed part of the chain. As reported: a call to the help desk, an MFA reset, Okta admin, a rogue identity provider, cloud admin, data theft, then ransomware on the hypervisors.');
  else lines.push('You never wrote it up. In the real incident, MGM had to shut down its own systems before the attackers could finish.');
  if (by.vishing.outcome === 'good') lines.push('On the phone you held the line. Nice. But remember the catch: the caller dials every agent. One person saying no does not stop it. The process has to say no for everyone.');
  else if (st.enc?.vishing?.outcome && by.vishing.outcome === 'bad') lines.push('On the phone you did the reset. That is the reported weak point: a caller with a name, a title and an employee ID. Your colleagues would have faced the same call. Verification has to be a rule, not a feeling.');
  if (by.case.contained) lines.push('You suspended the accounts and removed the rogue identity provider. That is what Okta tells customers to do. MGM, for its part, shut down systems on purpose to stop the spread.');
  lines.push('The money question. According to press reports, MGM did not pay. It had about 10 days of trouble: slot machines, room keys, reservations. MGM later said the event would cost about $100 million in one quarter\'s earnings.');
  lines.push('Caesars, hit by the same group days earlier, reportedly paid around $15 million of a $30 million demand. Caesars has not confirmed that figure. Its operations stayed up. There is no clean answer here. Paying funds criminals and guarantees nothing.');
  if (st.mail?.reenroll?.enteredCreds) lines.push('And you gave your password to the copycat "re-enroll your MFA" phish. Breaches attract scammers. Stay sharp when things are loud.');
  lines.push("Here's your case report, and what you can honestly say you've done.");
  return lines;
}

export default {
  n: 2,
  caseId: 'mgm-2023',
  date: DATE,
  title: 'MGM Resorts · September 2023',
  start: 8 * 60 + 5,
  endAt: 11 * 60 + 30,
  intro: ['Case Files: MGM Resorts, September 2023.', 'A replay of a real breach. Priya is running it from her office.'],
  badgeAtStart: true,
  cast: ['mike', 'theo'],

  emails: EMAILS,
  pages: PAGES,
  replyDrafts: REPLY_DRAFTS,
  logs: (st) => generateLogs({ nowMinutes: st.minutes, st }),
  ipInfo: IP_INFO,
  alerts: ALERTS,
  tickets: TICKETS,

  npcLines: {
    priya: {
      talk: [
        'Welcome to Case Files. Today: MGM Resorts, September 2023.',
        "It's Sunday, September 10, 8:05 AM. You're on the SOC at MGM, with the help desk phone on your desk.",
        'Fair warning. This replay squeezes about three days into one morning. MGM never published how the attack began. We use what was widely reported: someone found an employee on LinkedIn and called the help desk pretending to be them.',
        'The overnight desk left a note. Start with your inbox.',
      ],
      again: ['Inbox first. Then the phone. Then the queue.'],
    },
    dana: { talk: ["I'm on the help desk this morning. Sundays are quiet. That's what makes me nervous."], again: ['If the phone rings, answer it. Then slow down.'] },
    mike: { talk: ["I'm playing floor operations. If the slot machines go down, you'll hear me first."], again: ['Slots are fine. For now.'] },
    theo: { talk: ["I'm the virtualization admin. Twelve ESXi hosts, one vCenter. Everything runs on those."], again: ["Don't touch my vCenter."] },
  },

  objectives: [
    { id: 'priya', type: 'talk', text: 'Get the case briefing from Priya' },
    { id: 'my-desk', type: 'sit', text: 'Sit down at your desk' },
    { id: 'inbox', type: 'inbox', target: 'my-desk', text: 'Go through the SOC inbox' },
    { id: 'vishing', type: 'encounter', target: 'my-desk', text: 'Answer your desk phone (help desk line)', waitText: 'The help desk line is quiet. Stay near your desk.' },
    { id: 'tickets', type: 'tickets', target: 'my-desk', text: 'Work through the help desk queue' },
    { id: 'server-door', type: 'badge', text: 'Badge into the server room' },
    { id: 'soc', type: 'case', target: 'soc', text: 'Work the case at the SOC console' },
    { id: 'debrief', type: 'debrief', target: 'priya', text: 'Debrief with Priya: what was reported' },
  ],
  encounters: [{ id: 'vishing', type: 'phone', after: 'inbox', delayMs: 3000, fallbackAt: 8 * 60 + 35, notice: '☎ Your desk phone is ringing (help desk line)', conv: VISHING_CALL }],

  score,
  debrief,

  caseFile: {
    id: 'mgm-2023',
    company: 'MGM Resorts',
    when: 'September 2023',
    title: 'One phone call to the help desk',
    pitch: 'Someone finds an employee on LinkedIn and calls the help desk as them. An MFA reset later, the attackers reportedly hold Okta and Azure admin, add their own identity provider, and encrypt the hypervisors. MGM shuts itself down for about 10 days.',
    tags: ['Vishing', 'Help desk', 'Okta / identity', 'Scattered Spider', 'ALPHV ransomware'],
    difficulty: 'Intermediate',
    headline: 'A group known as Scattered Spider (working with the ALPHV/BlackCat ransomware gang) disrupted MGM Resorts for about 10 days in September 2023. Per widespread reporting, it began with a call to the IT help desk.',
    timeline: [
      { when: 'Before Sep 8, 2023 (reported)', what: 'The attacker looks up an MGM employee on LinkedIn, according to widely published reporting. MGM has not confirmed the details.' },
      { when: 'About Sep 8, 2023 (reported)', what: 'A caller posing as that employee phones the IT help desk and gets their credentials and MFA reset, per press reports. The exact method has not been published by MGM.' },
      { when: 'Sep 8 to 10 (claimed by the attackers)', what: 'ALPHV later said the group gained Okta Super Administrator and Azure Global Administrator access and stole data. These are the attackers\' claims, not MGM statements.' },
      { when: 'Sep 10, 2023', what: 'MGM says it identified a cybersecurity issue and, as a precaution, shut down some of its systems. (8-K, Oct 5, 2023)' },
      { when: 'Sep 11 to 19', what: 'Slot machines, digital room keys, reservations, the website and some payments are disrupted. Staff work by hand. Per press reports, MGM did not pay.' },
      { when: 'Mid-September (claimed)', what: 'ALPHV says it encrypted more than 100 ESXi hypervisors. The group claims this; MGM has not confirmed the number.' },
      { when: 'Sep 14, 2023', what: 'Caesars files an 8-K saying a social engineering attack on an IT vendor led to theft of its loyalty database. It was reportedly paid ~$15M, according to the Wall Street Journal. Caesars has not confirmed it.' },
      { when: 'About Sep 20, 2023', what: 'MGM says operations are substantially back to normal.' },
      { when: 'Oct 5, 2023', what: 'MGM files an 8-K: about $100 million negative impact on Q3 adjusted property EBITDAR and about $10 million of one-time consulting and legal costs. Some customers\' personal data was taken.' },
      { when: 'Nov 16, 2023', what: 'CISA and the FBI publish advisory AA23-320A about Scattered Spider, naming help desk impersonation and MFA bypass.' },
    ],
    realOutcome: [
      'About 10 days of disruption to hotels and casinos in Las Vegas and elsewhere: slot machines, room key cards, reservations, the website and some payments.',
      'MGM said it expected about a $100 million negative impact on third-quarter adjusted property EBITDAR, plus about $10 million of one-time costs for consulting and legal fees. These are MGM\'s own figures.',
      'MGM said personal data of some customers was taken: names, contact details, dates of birth and, for some, driver\'s license or Social Security numbers. MGM said it did not believe payment card data was affected.',
      'According to press reports, MGM did not pay the attackers. The same group reportedly got about $15 million from Caesars (unconfirmed by Caesars), and Caesars\' operations stayed up.',
    ],
    failures: [
      'The help desk reset MFA and passwords after a phone call. The caller reportedly knew details taken from LinkedIn, and a callback to the number on file was not enforced.',
      'Weak identity verification. Employee ID numbers and manager names are not secrets.',
      'Too many people had Super Administrator and Global Administrator rights, so one account was enough to own the identity system.',
      'Normal one-time-passcode and push MFA can be reset by a person. Phishing-resistant MFA (security keys) is harder to talk around.',
      'No alert fast enough for "MFA reset, then new-IP login, then new Super Admin, then new identity provider" inside a few hours.',
      'Access from identity down to the hypervisors was too flat, so a stolen admin identity reached the ESXi estate.',
    ],
    attack: [
      { id: 'T1656', name: 'Impersonation', fix: 'Train the help desk on vishing and give them a script that never changes. A good story is not proof.' },
      { id: 'T1566.004', name: 'Phishing: Spearphishing Voice', fix: 'Treat any inbound request to reset a credential as untrusted until you call back on a number from your own records. Never one the caller supplies.' },
      { id: 'T1078.004', name: 'Valid Accounts: Cloud Accounts', fix: 'Alert on sign-ins from new IPs and new devices right after an MFA reset, and limit what any single account can reach.' },
      { id: 'T1556.006', name: 'Modify Authentication Process: Multi-Factor Authentication', fix: 'Alert on every MFA reset and new factor enrollment, require manager approval and callback for resets, and use phishing-resistant MFA for admins.' },
      { id: 'T1484.002', name: 'Domain or Tenant Policy Modification: Trust Modification', fix: 'Alert on any new identity provider or routing rule change. Okta publishes a detection query for it. Keep the number of Super Administrators very small.' },
      { id: 'T1486', name: 'Data Encrypted for Impact', fix: 'Keep management of the hypervisors on a separate network with separate admin accounts, keep offline backups, and practice restoring them.' },
    ],
    resume: 'Investigated a simulated recreation of the MGM Resorts 2023 breach (Scattered Spider / ALPHV-attributed) in Cyber Office: handled a help desk vishing call, traced Okta MFA-reset abuse, a rogue identity provider and ESXi ransomware through identity and hypervisor logs (MITRE ATT&CK T1556.006, T1484.002, T1486), and wrote a containment plan. Score: {grade}.',
    sources: [
      { title: 'MGM Resorts Form 8-K (Oct 5, 2023): cybersecurity issue and financial impact', url: 'https://www.sec.gov/Archives/edgar/data/789570/000119312523251667/d461062d8k.htm' },
      { title: 'CISA and FBI: Scattered Spider advisory AA23-320A', url: 'https://www.cisa.gov/news-events/cybersecurity-advisories/aa23-320a' },
      { title: 'Okta Security: Cross-tenant impersonation prevention and detection', url: 'https://sec.okta.com/articles/2023/08/cross-tenant-impersonation-prevention-and-detection' },
      { title: 'Cybersecurity Dive: MGM says cyberattack will cost $100M', url: 'https://www.cybersecuritydive.com/news/mgm-las-vegas-100m-hit-cyberattack/695852/' },
    ],
    disclaimer: 'A dramatized recreation based on public reporting. MGM never published how the attack began or its internal details, so the caller, the coworkers, hostnames, usernames and IP addresses are fictional stand-ins (IPs are from documentation ranges). The attack chain, techniques and outcomes follow the sources above; things the attackers only claimed, like the Okta Super Administrator access and 100 hypervisors, are labeled as claims. The help desk call, its wording, the "re-enroll your MFA" phish and the log lines are illustrative. The reported timeline of several days is compressed into one Sunday morning. The cost figures in your report are estimates for this replay.',
  },
};
