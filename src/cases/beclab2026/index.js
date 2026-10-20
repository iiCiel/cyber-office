// Lab: "The invoice that changed banks". A fictional adversary-in-the-middle (AiTM) phishing and business-email-compromise incident
// at Halcyon Mutual, investigated in Microsoft 365 and Entra ID logs. Same engine as the week and the Case Files (see
// src/days/index.js for every field); caseFile.kind = 'lab' tells the menu and the report this is a training scenario, not a
// recreation of a real breach. Detection and response only: no attacker tooling is produced and the phish is not provided.
import { EMAILS, PAGES, REPLY_DRAFTS } from './emails.js';
import { generateLogs, ALERTS, CASE, IP_INFO, DATE, DOM, VICTIM, AITM, LOOK_MTA, LURE_MTA, RES } from './logs.js';
import { WIRE_TALK, WIRE_SCORE, BANK_TALK, BANK_SCORE } from './talk.js';
import { TICKETS } from './tickets.js';
import { scoreEmail, scoreCase, scoreTicket, scoreConversation, finalize } from '../../game/scoring.js';
import { makeAzCli, cliError } from '../../game/cloudcli.js';
import { uuid, fakeId } from '../../game/cloudfmt.js';

const MAIN = 'bec-payment';
// Hunting in the tenant: Graph (az rest) for the user's inbox rules and MFA methods, or jq / grep on the exported logs.
const HUNT_RE = /(\baz\s+(ad\s+user|rest)\b|\bjq\b|\bgrep\b.*(InboxRule|messageRules|anomalousToken|claim in the token|signinlogs|unified-audit|auditlogs)|\bawk\b.*(signinlogs|unified-audit|auditlogs))/i;

function huntItem(st) {
  const cmds = st.events.filter((e) => e.type === 'terminal-cmd');
  const hit = cmds.filter((e) => HUNT_RE.test(e.cmd));
  const found = hit.some((e) => /messageRules|authentication\/methods|InboxRule|anomalousToken|claim in the token|50126|MoveToFolder/i.test(e.cmd));
  return {
    id: 'hunt',
    area: 'Terminal',
    title: 'Find the inbox rule and the attacker\'s sign-in',
    max: 10,
    teaches: { skill: 'List a mailbox\'s inbox rules and MFA methods with Microsoft Graph (az rest), and mine exported sign-in and audit logs with jq and grep', secplus: '4.9 Use data sources to support an investigation; 4.6 Identity and access management' },
    outcome: found ? 'good' : cmds.length ? 'ok' : 'bad',
    points: found ? 10 : cmds.length ? 4 : 0,
    what: found ? 'You listed Rosa\'s inbox rules or her sign-in methods (or searched the exports) and found the two rules named "." and the Authenticator app nobody enrolled.' : cmds.length ? 'You opened the Terminal but never looked at Rosa\'s inbox rules, her MFA methods or the exported logs.' : 'You never looked at the mailbox or the sign-ins from the Terminal.',
    why: 'The logs show what was done; the mailbox shows what is still there. Asking Graph for a user\'s messageRules and authentication methods puts the two rules named "." and a phone nobody enrolled right in front of you, which is exactly what incident response playbooks for compromised mailboxes ask you to check. Then remove them, and revoke the sessions.',
  };
}

function score(st) {
  return finalize([
    ...EMAILS.map((e) => scoreEmail(e, st.mail?.[e.id])),
    ...TICKETS.map((t) => scoreTicket(t, st.tickets?.[t.id])),
    scoreConversation(WIRE_SCORE, st.enc?.wire),
    huntItem(st),
    scoreConversation(BANK_SCORE, st.enc?.bank),
    scoreCase(CASE, st.soc?.cases?.[MAIN]),
  ]);
}

function debrief(st) {
  const r = score(st);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const lines = ["Okay. Lab over. Let's compare your answer with how these incidents really go."];
  if (by.case.outcome === 'good') lines.push('Your write-up matches the pattern Microsoft described in 2022: an AiTM phishing page that relays the real sign-in and steals the session cookie, a replay that skips MFA, a mailbox search for invoices, an inbox rule that hides mail, and a payment redirect from a lookalike domain.');
  else if (st.soc?.cases?.[MAIN]) lines.push('Your write-up missed part of the chain. In order: a lure, an AiTM proxy that relayed the sign-in and MFA, a stolen session cookie replayed without MFA, a new attacker-owned MFA app, hiding inbox rules, then lookalike-domain emails and a confirmation from the real mailbox.');
  else lines.push('You never wrote it up. The stolen session still works, and both rules still hide the vendor\'s replies.');
  if (by.case.contained) lines.push('You revoked the session (not just the password), removed the rules and the attacker\'s MFA app, and stopped the money. That is the order Microsoft\'s guidance gives for a compromised mailbox: revoke, remove persistence, then investigate what was read and sent.');
  if (st.enc?.wire?.outcome === 'verify') lines.push('On the wire you called a known number first. Missing a cutoff costs a Monday. In the FBI\'s 2024 PSA on BEC, reported losses were over $55 billion across ten years (Oct 2013 to Dec 2023); verifying by a separate channel is the standard advice.');
  else if (st.enc?.wire?.outcome) lines.push('The wire is the part of this lab that no log can fix. Urgency, secrecy and an unreachable executive are the BEC signature. The control is a callback on a number from your own records, and a second approver on any change of bank details.');
  if (st.enc?.bank?.outcome === 'disclose') lines.push('You told the bank and Tidewater at once and filed with the IC3. Recalls work in hours, and the impersonated vendor can warn its other customers.');
  else if (st.enc?.bank?.outcome) lines.push('On the bank and the vendor: speed is what recovers money, and the vendor who was impersonated is a victim and a source of information. Say what you know, say what you do not, and update later.');
  if (by.hunt.outcome === 'good') lines.push('And you found the two rules named "." and the attacker\'s Authenticator app with Graph or the exports. Real attackers often name rules with a single dot or a blank so they are easy to overlook.');
  if (st.tickets?.['mfa-exemption'] === 'exempt' || st.tickets?.['mfa-exemption']?.choice === 'exempt') lines.push('You exempted the CFO\'s office from MFA. That is the account class BEC attackers choose.');
  if (st.mail?.['m365-expire']?.enteredCreds) lines.push('And you gave your password to the copycat "password expires" page. If it had been an AiTM kit, your MFA would have gone with it.');
  lines.push('The technical lesson in one line: nothing here was a vulnerability. It was MFA that can be relayed, a session cookie that works from anywhere, no alert on inbox rules, and a payment process that trusted an email. Fix those four (FIDO2 or passkeys, token protection and compliant-device policies, inbox-rule alerts, callback verification) and the same attack fails at several steps.');
  lines.push("Here's your lab report, and what you can honestly say you've done.");
  return lines;
}

// ---------------------------------------------------------------------------------------------- the Terminal: exported logs + az
const rosaId = uuid(`uid${VICTIM}`);
const folderId = (n) => `AQMkAGM${fakeId(`folder${n}`, 40, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')}`;

function buildAz() {
  const users = [
    ['Priya Raman', 'priya.r', 'Security Operations Lead'], ['Dana Kowalski', 'dana.k', 'Identity and Endpoint Administrator'], ['Theo Okoye', 't.okoye', 'Cloud Engineer'],
    ['Mike Chen', 'm.chen', 'Finance and Operations Director'], ['Rosa Delgado', 'r.delgado', 'Accounts Payable Specialist'], ['Evelyn Hart', 'e.hart', 'Chief Financial Officer'], ['Hugo Pereira', 'h.pereira', 'Account Executive'],
  ].map(([displayName, sam, jobTitle]) => ({ businessPhones: [], displayName, givenName: displayName.split(' ')[0], id: uuid(`uid${sam}@${DOM}`), jobTitle, mail: `${sam}@${DOM}`, mobilePhone: null, officeLocation: null, preferredLanguage: 'en-US', surname: displayName.split(' ').slice(1).join(' '), userPrincipalName: `${sam}@${DOM}` }));
  const find = (id) => users.find((x) => x.id === id || x.userPrincipalName === id || x.displayName === id);
  const need = (f) => { if (!f.id) throw cliError('az ad user show: error: the following arguments are required: --id'); return String(f.id); };
  const ODATA = 'https://graph.microsoft.com/v1.0/$metadata';

  const rules = [
    { id: 'AQAAAAAAAAD', displayName: '.', sequence: 1, isEnabled: true, hasError: false, isReadOnly: false, conditions: { subjectContains: ['spam', 'phish', 'suspicious', 'undeliverable', 'hacked', 'shared with you'] }, actions: { markAsRead: true, moveToFolder: folderId('rss'), stopProcessingRules: true } },
    { id: 'AQAAAAAAAAE', displayName: '.', sequence: 2, isEnabled: true, hasError: false, isReadOnly: false, conditions: { senderContains: ['ar@tidewater-facilities.example', 'billing@tidewater-facilities.example'], bodyOrSubjectContains: ['INV-20418', 'INV-20395', 'bank', 'remittance', 'payment', 'unpaid'] }, actions: { markAsRead: true, moveToFolder: folderId('archive'), stopProcessingRules: true } },
  ];
  const methods = [
    { '@odata.type': '#microsoft.graph.passwordAuthenticationMethod', id: '28c10230-6103-485e-b985-444c60001490', createdDateTime: null },
    { '@odata.type': '#microsoft.graph.phoneAuthenticationMethod', id: '3179e48a-750b-4051-897c-87b9720928f7', phoneNumber: '+1 212XXXXX01', phoneType: 'mobile', smsSignInState: 'notSupported' },
    { '@odata.type': '#microsoft.graph.microsoftAuthenticatorAuthenticationMethod', id: uuid('mfa-attacker'), displayName: 'Pixel 7', deviceTag: 'SoftwareTokenActivated', phoneAppVersion: '6.2410.4521', createdDateTime: '2026-10-23T18:30:05Z' },
  ];
  const rest = (f) => {
    if (String(f.method || 'get').toLowerCase() !== 'get') throw cliError('ERROR: This terminal is read-only for az rest: only --method get is available here.');
    const u = String(f.url || '').replace(/^https:\/\/graph\.microsoft\.com\/(v1\.0|beta)/i, '');
    let m = u.match(/^\/users\/([^/?]+)\/mailFolders\/(?:inbox|Inbox)\/messageRules(?:\?.*)?$/i);
    if (m) {
      const who = decodeURIComponent(m[1]);
      if (who !== VICTIM && who !== rosaId) return { '@odata.context': `${ODATA}#users('${who}')/mailFolders('inbox')/messageRules`, value: [] };
      return { '@odata.context': `${ODATA}#users('${rosaId}')/mailFolders('inbox')/messageRules`, value: rules };
    }
    m = u.match(/^\/users\/([^/?]+)\/authentication\/methods(?:\?.*)?$/i);
    if (m) {
      const who = decodeURIComponent(m[1]);
      if (who !== VICTIM && who !== rosaId) return { '@odata.context': `${ODATA}#users('${who}')/authentication/methods`, value: methods.slice(0, 2) };
      return { '@odata.context': `${ODATA}#users('${rosaId}')/authentication/methods`, value: methods };
    }
    m = u.match(/^\/users(?:\?.*)?$/i);
    if (m) return { '@odata.context': `${ODATA}#users`, value: users };
    throw cliError(`Not Found({"error":{"code":"Request_ResourceNotFound","message":"Resource not found for the segment '${u.split('/')[1] || ''}'.","innerError":{"date":"2026-10-30T13:12:00","request-id":"${uuid('rid')}"}}})`);
  };
  return makeAzCli({
    'account show': () => ({ environmentName: 'AzureCloud', homeTenantId: uuid('tenant-halcyon'), id: '9c1b2d3e-4f50-4a61-8b72-93a4b5c6d7e8', isDefault: true, name: 'Halcyon Production', state: 'Enabled', tenantId: uuid('tenant-halcyon'), user: { name: `analyst01@${DOM}`, type: 'user' } }),
    'ad user list': () => users,
    'ad user show': (f) => { const x = find(need(f)); if (!x) throw cliError(`ERROR: Resource '${f.id}' does not exist or one of its queried reference-property objects are not present.`); return x; },
    rest,
  }, { loggedIn: true, user: `analyst01@${DOM}`, tenant: uuid('tenant-halcyon') });
}

function terminal() {
  const logs = generateLogs({ nowMinutes: 24 * 60 });
  const compact = (e) => JSON.stringify(JSON.parse(e.raw));
  const sign = logs.filter((e) => e.source === 'entra-signin').map(compact).join('\n');
  const audit = logs.filter((e) => e.source === 'azure-audit').map(compact).join('\n');
  const ual = logs.filter((e) => e.source === 'm365-audit').map(compact).join('\n');
  const whois = {
    [AITM]: ['inetnum:        198.51.100.0 - 198.51.100.255', 'netname:        TEST-NET-2', 'descr:          Reserved for documentation (lab stand-in for a rented hosting server)', 'org-name:       AS64510 Nimbus Hosting GmbH', 'country:        DE', 'remarks:        Cloud VPS ranges. Real people do not sign in to Microsoft 365 from here.'].join('\n'),
    [LOOK_MTA]: ['inetnum:        203.0.113.0 - 203.0.113.255', 'netname:        TEST-NET-3', 'descr:          Reserved for documentation (lab stand-in for the mail server of both lookalike domains)', 'org-name:       AS64511 Cobalt VPS', 'country:        NL'].join('\n'),
    [LURE_MTA]: ['inetnum:        203.0.113.0 - 203.0.113.255', 'netname:        TEST-NET-3', 'descr:          Reserved for documentation (lab stand-in for the lure sender)', 'org-name:       AS64511 Cobalt VPS', 'country:        NL'].join('\n'),
    'tidewater-facilities-ap.example': ['Domain Name: TIDEWATER-FACILITIES-AP.EXAMPLE', 'Registry Domain ID: D9918823-LAB', 'Creation Date: 2026-10-26T03:12:09Z', 'Registrar: Budget Names LLC', 'Registrant Country: PA (privacy proxy)', 'Name Server: ns1.cheapdns.example', 'Note: registered the day before its first mail, and 2 days before the vendor-master change.'].join('\n'),
    'halcyonmutual-invoices.example': ['Domain Name: HALCYONMUTUAL-INVOICES.EXAMPLE', 'Registry Domain ID: D9918824-LAB', 'Creation Date: 2026-10-27T03:41:55Z', 'Registrar: Budget Names LLC', 'Registrant Country: PA (privacy proxy)', 'Name Server: ns1.cheapdns.example', 'Note: registered the same registrar, same nameserver, same week as tidewater-facilities-ap.example.'].join('\n'),
  };
  for (const p of RES) whois[p.ip] = [`inetnum:        ${p.ip.split('.').slice(0, 3).join('.')}.0 - ${p.ip.split('.').slice(0, 3).join('.')}.255`, 'netname:        TEST-NET-3', 'descr:          Reserved for documentation (lab stand-in for a residential-proxy exit address)', `org-name:       ${p.isp.replace(/^AS\d+ /, '')}`, 'country:        US', 'remarks:        Consumer broadband customer line used as a proxy exit node. Do not block by address.'].join('\n');
  return {
    date: 'Fri Oct 30 2026',
    note: 'Exported Entra sign-in, audit and Unified Audit Log records (one JSON object per line) are in /var/log/remote. Try az, jq, grep, awk and whois.',
    files: {
      '/var/log/remote/entra/signinlogs.json': `${sign}\n`,
      '/var/log/remote/entra/auditlogs.json': `${audit}\n`,
      '/var/log/remote/m365/unified-audit.json': `${ual}\n`,
      '/home/analyst01/README.txt': [
        'Tips from Priya:',
        `  az rest --method get --url "https://graph.microsoft.com/v1.0/users/${VICTIM}/mailFolders/inbox/messageRules"      what rules are on her inbox?`,
        `  az rest --method get --url "https://graph.microsoft.com/v1.0/users/${VICTIM}/authentication/methods"             which MFA methods does she have?`,
        "  jq -r 'select(.Operation==\"New-InboxRule\") | .ClientIPAddress' /var/log/remote/m365/unified-audit.json     which addresses made inbox rules?",
        "  jq -r 'select(.authenticationDetails[]?.authenticationStepResultDetail==\"MFA requirement satisfied by claim in the token\") | .ipAddress' /var/log/remote/entra/signinlogs.json | sort | uniq -c       replayed sessions, by address",
        `  grep -c ${VICTIM} /var/log/remote/entra/signinlogs.json                                      how many sign-ins for her?`,
        '  whois tidewater-facilities-ap.example                                  who registered the lookalike, and when?',
        '',
      ].join('\n'),
    },
    whois,
    dns: {},
    commands: { az: buildAz() },
  };
}

export default {
  n: 2,
  caseId: 'halcyon-bec-2026',
  date: DATE,
  title: 'Halcyon Mutual · Oct 30, 2026 (lab)',
  start: 8 * 60 + 5,
  endAt: 11 * 60 + 30,
  intro: ['Lab: the invoice that changed banks.', 'Friday morning at Halcyon Mutual. Priya is in. The wire run is at 11:00.'],
  badgeAtStart: true,
  cast: ['mike', 'dana'],

  emails: EMAILS,
  pages: PAGES,
  replyDrafts: REPLY_DRAFTS,
  logs: (st) => generateLogs({ nowMinutes: st.minutes }),
  ipInfo: IP_INFO,
  alerts: ALERTS,
  tickets: TICKETS,
  terminal: terminal(),

  npcLines: {
    priya: {
      talk: [
        'Welcome to the lab. This one is made up, but every technique is real and every log line looks like the real thing.',
        "It's Friday, October 30, 2026, 8:05 AM. Rosa in accounts payable says our vendor, Tidewater, never got paid. The bank says it did. And the wire run is at 11:00.",
        'The logs are Microsoft 365 and Entra ID, as JSON, in the SIEM. The Terminal has the Azure CLI for Microsoft Graph and the same logs as files, so jq and grep work. The campaign ran about a week; I have squeezed it into the logs you can see.',
        'Start with your inbox.',
      ],
      again: ['Inbox first. Then the identity queue.'],
    },
    dana: { talk: ["I'm the identity admin. I got a call from the bank this morning and I do not like it."], again: ['If the bank calls again I will find you.'] },
    mike: { talk: ["I'm the finance director. Evelyn wants a wire out by 11, and I would rather not be the one who misses it."], again: ['Is the wire still on?'] },
    theo: { talk: ["I'm the engineer. I do not touch mailboxes, but I can pull any log you want."], again: ['Need an export?'] },
  },

  objectives: [
    { id: 'priya', type: 'talk', text: 'Get the lab briefing from Priya' },
    { id: 'my-desk', type: 'sit', text: 'Sit down at your desk' },
    { id: 'inbox', type: 'inbox', target: 'my-desk', text: 'Go through the security inbox' },
    { id: 'tickets', type: 'tickets', target: 'my-desk', text: 'Work through the identity and mail queue' },
    { id: 'hunt', type: 'terminal', match: HUNT_RE, target: 'my-desk', waitFor: 'alert', text: 'Terminal: find Rosa\'s inbox rules and MFA methods (az rest, jq)', waitText: 'Waiting on the SIEM.' },
    { id: 'wire', type: 'encounter', target: 'mike', text: 'Mike is coming over about the 11:00 wire', waitText: 'Someone is on the way to talk to you.' },
    { id: 'bank', type: 'encounter', target: 'dana', text: 'Dana is coming over about the bank', waitText: 'Someone is on the way to talk to you.' },
    { id: 'server-door', type: 'badge', text: 'Badge into the server room' },
    { id: 'soc', type: 'case', target: 'soc', text: 'Work the case at the SOC console' },
    { id: 'debrief', type: 'debrief', target: 'priya', text: 'Debrief with Priya: how these incidents really go' },
  ],
  encounters: [
    { id: 'wire', type: 'walkup', npc: 'mike', after: 'hunt', delayMs: 1500, fallbackAt: 10 * 60 + 5, intro: 'Security! Quick one before the wire run.', conv: WIRE_TALK },
    { id: 'bank', type: 'walkup', npc: 'dana', after: 'wire', delayMs: 1500, fallbackAt: 10 * 60 + 40, intro: 'The bank called me back. Got a minute?', conv: BANK_TALK },
  ],

  score,
  debrief,

  caseFile: {
    id: 'halcyon-bec-2026',
    kind: 'lab',
    company: 'Halcyon Mutual',
    when: 'Oct 30, 2026 · Lab',
    title: 'The invoice that changed banks',
    pitch: 'An accounts-payable clerk approves a real MFA prompt on a fake page. The attacker keeps her session cookie, hides vendor mail with an inbox rule, and sends a lookalike "new bank details" email. By Friday $42,600 is gone and $184,350 is due at 11:00. Investigate it in Microsoft 365 and Entra ID logs, then stop the wire.',
    tags: ['AiTM phishing', 'Session cookie theft', 'Business email compromise', 'Entra ID', 'Microsoft 365 audit logs', 'Inbox rules'],
    difficulty: 'Advanced',
    headline: 'A "shared document" lure led to an adversary-in-the-middle login page that relayed Rosa Delgado\'s password and MFA, a stolen session cookie replayed from residential addresses without MFA, an attacker-owned Authenticator app, two inbox rules that hid warnings and the vendor\'s replies, and lookalike-domain emails that redirected a $42,600 payment and teed up $184,350 more.',
    timeline: [
      { when: 'Fri Oct 23, 14:12', what: 'A lure ("Tidewater Facilities shared Remittance_Advice_Oct.pdf with you") reaches Rosa from a newly registered "DocuShare" domain. Authentication passes for the sender\'s own domain.' },
      { when: 'Fri Oct 23, 14:19', what: 'Rosa signs in on the attacker\'s proxy page and approves her MFA prompt. Entra logs a successful sign-in with MFA completed, from a hosting address in Frankfurt (198.51.100.58 in this lab).' },
      { when: 'Fri Oct 23, 14:24', what: 'The stolen cookie is replayed from a Miami residential address: "MFA requirement satisfied by claim in the token", a Linux browser, ID Protection risk anomalousToken.' },
      { when: 'Fri Oct 23, 14:26-14:44', what: 'Searches for invoice, wire and "bank details"; registers an Authenticator app; creates the first rule (named "."); sends the lure on to her contacts and soft-deletes the sent items.' },
      { when: 'Oct 24 - Oct 29', what: 'Replays every few hours from five home addresses, reading AP mail. Alerts fire in Defender for Cloud Apps and ID Protection and sit unreviewed.' },
      { when: 'Tue Oct 27, 10:41', what: 'The real Tidewater invoice (INV-20418, $184,350) has arrived. A second rule hides every message from the vendor.' },
      { when: 'Tue Oct 27, 11:20', what: 'ap@tidewater-facilities-ap.example (a lookalike registered Oct 26) emails the AP team new bank details; "Rosa" confirms from her real mailbox at 11:44.' },
      { when: 'Thu Oct 29, 16:05', what: 'The first payment ($42,600) has gone to the new account. The rule is edited to hide the vendor\'s chasers; the attacker reads the vendor\'s reply in Archive and stalls it.' },
      { when: 'Fri Oct 30, 09:10', what: 'A fake "CFO" email from halcyonmutual-invoices.example tells Mike to release the $184,350 wire before 11:00. Your shift started at 08:05.' },
    ],
    realOutcome: [
      'AiTM phishing works because the victim really signs in, to the real Microsoft service, through an attacker\'s reverse proxy. The password and the MFA prompt are genuine; what the attacker steals is the session cookie issued afterwards. MFA that can be approved on a phone (push, SMS, codes) is relayed along with it.',
      'In Microsoft\'s July 2022 report on a campaign of this kind, the attackers used the stolen session, found payment threads in the victim\'s mailbox, and used inbox rules to move replies out of sight, then ran BEC against the victim\'s own contacts. The report describes more than 10,000 organizations targeted since September 2021.',
      'Business email compromise is the costliest cybercrime category the FBI tracks: the IC3 reported more than $55 billion in exposed losses from October 2013 to December 2023 (PSA I-091124).',
      'The attacker\'s moves are ordinary, logged operations, so the defense is detection and response: alert on inbox rules, anomalous tokens and new MFA methods; revoke sessions (not only passwords); and verify a bank change on a known number.',
    ],
    failures: [
      'MFA that can be relayed (push approval) protected a finance account that attackers love.',
      'No Conditional Access for compliant devices or token protection, so a session cookie worked from any computer for days.',
      'ID Protection raised anomalousToken and impossible travel, and no policy or person acted on medium risk.',
      'No alert for New-InboxRule that moves mail and marks it read, on a mailbox with a Defender alert already open.',
      'A bank-detail change was accepted by email, and "confirmed" from the same compromised mailbox, with no callback on a known number.',
      'A new MFA method registered from a residential address did not require extra verification.',
    ],
    attack: [
      { id: 'T1566.002', name: 'Phishing: Spearphishing Link', fix: 'Detonate and rewrite links (Safe Links), flag newly registered sender domains, and train people to report. A reported lure is detection.' },
      { id: 'T1557', name: 'Adversary-in-the-Middle', fix: 'Require phishing-resistant MFA (FIDO2 or passkeys, which bind the login to the real domain), and use Conditional Access with compliant-device requirements.' },
      { id: 'T1539', name: 'Steal Web Session Cookie', fix: 'Turn on token protection and continuous access evaluation, shorten sign-in frequency for high-value roles, and alert on anomalousToken.' },
      { id: 'T1550.004', name: 'Use Alternate Authentication Material: Web Session Cookie', fix: 'Revoke sessions and refresh tokens (Revoke-MgUserSignInSession) on any risky sign-in, and treat "MFA satisfied by claim in the token" from a new device and address as a stolen session.' },
      { id: 'T1078.004', name: 'Valid Accounts: Cloud Accounts', fix: 'Remediate medium user risk automatically (require a secure password change and re-registration), and review accounts with new MFA methods.' },
      { id: 'T1114.003', name: 'Email Collection: Email Forwarding Rule', fix: 'Block external auto-forwarding, alert on New-InboxRule and Set-InboxRule with ForwardTo or MoveToFolder, and audit rules named with a single character.' },
      { id: 'T1564.008', name: 'Hide Artifacts: Email Hiding Rules', fix: 'Alert on rules that mark mail as read and move it out of the Inbox, and list rules on any mailbox with a Defender or ID Protection alert.' },
      { id: 'T1534', name: 'Internal Spearphishing', fix: 'Alert on a mailbox sending a lure to many contacts then deleting its Sent Items, and use Defender for Office 365 to claw mail back.' },
      { id: 'T1656', name: 'Impersonation', fix: 'Flag lookalike domains of your vendors and executives, show external-sender tags, and require an out-of-band callback for any bank-detail change.' },
      { id: 'T1657', name: 'Financial Theft', fix: 'Dual approval and a callback on a known number for bank changes and wires; report to the bank within hours and to ic3.gov.' },
    ],
    resume: 'Investigated a simulated adversary-in-the-middle phishing and business-email-compromise incident in Cyber Office: traced a relayed MFA sign-in and a replayed session cookie through Entra ID sign-in logs, found attacker inbox rules and a new MFA method in the Unified Audit Log and Microsoft Graph, linked lookalike-domain emails to a payment redirect (MITRE ATT&CK T1557, T1539, T1114.003), then wrote a response plan with session revocation, phishing-resistant MFA and out-of-band payment verification. Score: {grade}.',
    sources: [
      { title: 'Microsoft Security blog: From cookie theft to BEC: Attackers use AiTM phishing sites as entry point to further financial fraud (Jul 12, 2022)', url: 'https://www.microsoft.com/en-us/security/blog/2022/07/12/from-cookie-theft-to-bec-attackers-use-aitm-phishing-sites-as-entry-point-to-further-financial-fraud/' },
      { title: 'Microsoft Learn: New-InboxRule (Exchange Online PowerShell)', url: 'https://learn.microsoft.com/en-us/powershell/module/exchange/new-inboxrule' },
      { title: 'Microsoft Learn: Phishing investigation and response playbook', url: 'https://learn.microsoft.com/en-us/security/operations/incident-response-playbook-phishing' },
      { title: 'Microsoft Learn: Token protection in Conditional Access', url: 'https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-token-protection' },
      { title: 'Microsoft Learn: Passwordless authentication options for Microsoft Entra ID (FIDO2)', url: 'https://learn.microsoft.com/en-us/entra/identity/authentication/concept-authentication-passwordless' },
      { title: 'Microsoft Learn: What are risk detections? (anomalousToken, unfamiliarFeatures, unlikelyTravel)', url: 'https://learn.microsoft.com/en-us/entra/id-protection/concept-identity-protection-risks' },
      { title: 'Microsoft Learn: Audit log activities (Purview)', url: 'https://learn.microsoft.com/en-us/purview/audit-log-activities' },
      { title: 'Microsoft Graph: user: revokeSignInSessions', url: 'https://learn.microsoft.com/en-us/graph/api/user-revokesigninsessions' },
      { title: 'FBI IC3 PSA I-091124: Business Email Compromise: The $55 Billion Scam (Sep 11, 2024)', url: 'https://www.ic3.gov/PSA/2024/PSA240911' },
      { title: 'MITRE ATT&CK: Adversary-in-the-Middle (T1557)', url: 'https://attack.mitre.org/techniques/T1557/' },
      { title: 'MITRE ATT&CK: Steal Web Session Cookie (T1539)', url: 'https://attack.mitre.org/techniques/T1539/' },
      { title: 'MITRE ATT&CK: Email Forwarding Rule (T1114.003)', url: 'https://attack.mitre.org/techniques/T1114/003/' },
      { title: 'MITRE ATT&CK: Email Hiding Rules (T1564.008)', url: 'https://attack.mitre.org/techniques/T1564/008/' },
    ],
    disclaimer: 'A fictional training scenario. Halcyon Mutual, its staff, the vendor (Tidewater Facilities), the bank, every domain (including the lookalikes), IP addresses (documentation ranges), amounts, event counts and the in-game phishing page and SIEM alerts are invented, and no real organization is depicted. The techniques are real and documented: AiTM phishing that relays the sign-in and steals the session cookie, replay without MFA, inbox rules that hide mail, and payment-redirect BEC (Microsoft\'s July 2022 report; MITRE ATT&CK; FBI IC3). The log formats follow Microsoft\'s schemas (Entra sign-in and audit logs, the Purview Unified Audit Log with the operations UserLoggedIn, MailItemsAccessed, New-InboxRule, Set-InboxRule, Send and SearchQueryInitiatedExchange, Defender XDR EmailEvents); exact field values, the "claim in the token" strings, risk event names and the tokenProtectionStatusDetails field are modeled on Microsoft\'s documentation and may differ in detail from a live tenant. About eight days of attacker activity are compressed into the logs you see; the attacker\'s behavior (rule names, search terms, timing) is a composite and is not claimed to match any single case. No phishing kit, proxy or attacker tooling is provided. Dollar costs in your report are estimates for this lab.',
  },
};
