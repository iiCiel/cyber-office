// Lab: Halcyon Mutual. The identity and mail change queue. Each ticket tests one habit that makes AiTM and BEC easier:
// an external auto-forward, an MFA "fatigue" exemption, and legacy authentication.
export const TICKETS = [
  {
    id: 'auto-forward',
    num: 8101,
    title: 'Allow Hugo Pereira\'s mailbox to auto-forward to his personal Gmail while he travels',
    from: 'Hugo Pereira (Sales)',
    via: 'Mail queue, Fri 8:10 AM',
    priority: 'Medium',
    facts: [['Request', 'Forward all mail to an external personal address (@gmail.com)'], ['Reason', '"Hotel wifi is bad, I read mail on my phone through Gmail"'], ['Today', 'External auto-forwarding is blocked by the outbound spam policy'], ['Related', 'Hugo already has Outlook mobile with MFA']],
    body: ['Hugo wants every message copied to his personal address until Sunday. The mailbox contains customer quotes and contracts.', 'What do we do?'],
    teaches: { skill: 'Do not open an external auto-forward path; give the person a safe way to read mail instead', secplus: '4.6 Identity and access management; 3.3 Data protection' },
    options: [
      { id: 'decline', text: 'Decline. Keep external auto-forwarding blocked, and point him to Outlook mobile (already MFA-protected) or OWA on his managed laptop. Offer a temporary VPN profile for the hotel wifi.', outcome: 'good', points: 10, why: 'Right. An external forward quietly copies everything, forever, to an account you do not control, and it is one of the first things an attacker sets up (T1114.003). It is also why this lab is full of inbox rules: the log cannot tell a forward you approved from one an attacker made unless you know which are approved. Give the person a safe way to do the job.', reply: 'Hugo: OK, Outlook on the phone works. Thanks.' },
      { id: 'approve', text: 'Approve it until Sunday. He is a salesperson on a trip, and the manager is waiting.', outcome: 'bad', points: 0, why: 'Customer quotes now flow to an unmanaged inbox that has no MFA you control, no DLP and no retention, and a forward is easy to forget. It also makes real forwards look the same as attacker ones in the audit log.', reply: 'Hugo: Great, thanks!', cost: { amount: 45000, text: 'Customer data copied to a personal inbox, and a forward left in place (estimate for this lab)' } },
      { id: 'limited', text: 'Approve, but only for mail from three named customers', outcome: 'ok', points: 4, why: 'Narrower, but it is still an external copy of customer contracts, and the rule has to be maintained by someone. A managed alternative would have solved the same problem with no exception.', reply: 'Hugo: That works.' },
    ],
  },
  {
    id: 'mfa-exemption',
    num: 8102,
    title: 'Exempt the CFO\'s office from MFA prompts because "there are too many approvals"',
    from: 'Executive assistant to Evelyn Hart (CFO)',
    via: 'Identity queue, Fri 8:25 AM',
    priority: 'High',
    facts: [['Request', 'Skip MFA for the CFO and two assistants when they sign in from any "trusted" location'], ['Reason', '"She gets 15 push approvals a day and she is traveling"'], ['Today', 'Push approvals with number matching; no phishing-resistant method required'], ['Available', 'FIDO2 security keys and passkeys are licensed and unused']],
    body: ['The CFO\'s office is tired of approving prompts. They want MFA turned off for them from a set of "trusted" locations.', 'What do we do?'],
    teaches: { skill: 'Fix prompt fatigue with a stronger, quieter method (FIDO2, token protection), not with an exemption', secplus: '4.6 Identity and access management: MFA' },
    options: [
      { id: 'fido2', text: 'Decline the exemption. Give the CFO\'s office FIDO2 security keys or passkeys (one touch, no prompts), require them in Conditional Access for finance and executives, and reduce prompts with a longer trusted-device session on compliant devices.', outcome: 'good', points: 10, why: 'Right. Prompt fatigue is real, but the answer is a better factor, not no factor. A FIDO2 key is bound to the real sign-in domain, so an AiTM proxy on another domain gets nothing; and it is faster than a push. Executives and finance are exactly the accounts attackers pick (BEC).', reply: 'EA: A key sounds easier honestly. Send it over.' },
      { id: 'exempt', text: 'Approve. It is the CFO and the locations are trusted.', outcome: 'bad', points: 0, why: '"Trusted location" is an IP list, and an attacker replaying a stolen session does not need MFA anyway. You would have handed the most-impersonated person in the company a password-only account.', reply: 'EA: Wonderful, thank you.', cost: { amount: 90000, text: 'An executive account protected by a password alone (estimate for this lab)' } },
      { id: 'extend', text: 'Keep MFA but lengthen session lifetime to 90 days for the CFO\'s office', outcome: 'ok', points: 4, why: 'Fewer prompts, but a stolen session cookie then lives 90 days. That is the very thing this attack exploits. Combine long sessions with token protection and compliant devices, or avoid it.', reply: 'EA: Fine, less pop-ups.' },
    ],
  },
  {
    id: 'legacy-auth',
    num: 8103,
    title: 'Allow legacy authentication (IMAP and SMTP AUTH) for the new CRM connector',
    from: 'Sales operations',
    via: 'Identity queue, Fri 8:50 AM',
    priority: 'Medium',
    facts: [['Request', 'Remove the Conditional Access block on legacy authentication for the whole tenant "just for the CRM"'], ['Reason', 'The connector only knows basic auth'], ['Today', 'Legacy auth is blocked, except for the scan-to-email account'], ['Risk', 'Basic auth cannot do MFA, and the protocols do not support conditional access signals well']],
    body: ['Sales ops says the new CRM connector supports IMAP with a username and password only. They want the legacy block lifted for everyone until the vendor ships OAuth.', 'What do we do?'],
    teaches: { skill: 'Keep legacy authentication blocked; scope any exception to one account, one address, one protocol', secplus: '4.6 Identity and access management; 4.1 Security techniques: hardening' },
    options: [
      { id: 'oauth', text: 'Decline lifting the block. Require the vendor\'s OAuth (modern auth) connector, or give the CRM one dedicated mailbox with a Conditional Access exception for its fixed IP only, and set a deadline to remove it.', outcome: 'good', points: 10, why: 'Right. Basic authentication skips MFA entirely, so one password found in a data breach or a phish becomes a sign-in that no policy sees. Microsoft turned off basic auth in Exchange Online for good reason. If an exception is unavoidable, make it one account, one IP, one protocol, with an end date.', reply: 'Sales ops: OK, we will ask the vendor for the OAuth connector.' },
      { id: 'lift', text: 'Lift the block for the tenant until the vendor ships OAuth', outcome: 'bad', points: 0, why: 'Every account can now sign in with a password alone over IMAP or POP, bypassing MFA. Attackers test for exactly this (it is how password sprays avoid MFA), and the exception has no end date.', reply: 'Sales ops: Thanks!', cost: { amount: 70000, text: 'Every mailbox reachable with a password alone (estimate for this lab)' } },
      { id: 'single', text: 'Allow it for the CRM service account only, no end date', outcome: 'ok', points: 5, why: 'Better: it is scoped to one account. But without a source address and an end date, a leaked password for that account is a way into its mailbox, with no MFA to stop it.', reply: 'Sales ops: Good, that is all we need.' },
    ],
  },
];
