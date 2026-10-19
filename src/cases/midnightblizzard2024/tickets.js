// Case file: Microsoft / Midnight Blizzard. The identity and cloud change queue. Each ticket tests one habit the public record
// says made the incident possible: an MFA exemption on a test tenant, a broad app permission approved by default, and
// audit logs kept only as long as the license makes easy.
export const TICKETS = [
  {
    id: 'mfa-exception',
    num: 7301,
    title: 'Extend the MFA exemption for the lab tenant (corp-test) by 90 days',
    from: 'Lab team (QA lead)',
    via: 'Identity queue, Fri 7:30 AM',
    priority: 'Medium',
    facts: [['Tenant', 'corp-test.onmicrosoft.example (legacy, non-production)'], ['Accounts', '41, none with MFA registered'], ['Exemption history', 'Renewed 3 times since 2022'], ['Reason', '"Old test scripts break with MFA"'], ['Contains', 'A leftover app (LabSync-Legacy) with permissions in the main tenant']],
    body: ['The lab team asks for 90 more days without MFA because their automated tests sign in with a password. Nobody has proposed a date to retire the tenant.', 'What do we do?'],
    teaches: { skill: 'Never exempt test and legacy tenants from MFA; fix the tests, not the control', secplus: '4.6 Identity and access management: MFA; 5.2 Risk management' },
    options: [
      { id: 'enforce', text: 'Decline. Require MFA on every account (or move the scripts to a workload identity with a certificate), set a retirement date for the tenant, and review what the leftover app can do.', outcome: 'good', points: 10, why: 'Right. A test tenant with no MFA is a front door. Microsoft\'s own account of this incident starts with a password spray against a legacy, non-production test tenant account that had no MFA. "Test" and "legacy" mean fewer people are watching, not less risk. Scripts that sign in with a human password should use a managed identity or a certificate.', reply: 'QA lead: We can move the scripts to a certificate by the 31st. Fine.' },
      { id: 'extend', text: 'Approve another 90 days. It is only a test tenant.', outcome: 'bad', points: 0, why: 'A fourth renewal is a policy no one reads. The tenant has real permissions in production through a leftover app. An exemption that renews itself is a permanent hole.', reply: 'QA lead: Great, thanks!', cost: { amount: 120000, text: 'The test tenant stays a password-only entry to production (estimate for this recreation)' } },
      { id: 'allowlist', text: 'Approve, but only for sign-ins from the office address range.', outcome: 'ok', points: 4, why: 'Better than nothing: network location is a real control. But it still leaves 41 password-only accounts, the exemption never ends, and an attacker on a residential proxy fails the allow-list only if the policy covers every app and every protocol. Use it to buy time, not as the answer.', reply: 'QA lead: That works for us.' },
    ],
  },
  {
    id: 'app-approval',
    num: 7302,
    title: 'Approve new multi-tenant app "MailInsight Pro" requesting Exchange full_access_as_app',
    from: 'Customer Success (a vendor, via a manager)',
    via: 'Cloud change queue, Fri 7:45 AM',
    priority: 'High',
    facts: [['App', 'MailInsight Pro (publisher not verified)'], ['Requested', 'Office 365 Exchange Online: full_access_as_app (application permission, admin consent)'], ['Scope', 'Every mailbox in the tenant'], ['Reason', '"Analytics on support mailboxes"'], ['Owner on our side', 'None named']],
    body: ['The vendor says it needs mailbox analytics for the support team (about 15 mailboxes) and sent a link for tenant admin consent. The role gives the app access to every mailbox without a user signed in.', 'What do we do?'],
    teaches: { skill: 'Never grant tenant-wide mailbox access to a new app; scope to named mailboxes', secplus: '4.6 Identity and access management: least privilege; 4.4 Application security' },
    options: [
      { id: 'scope', text: 'Decline admin consent as requested. Ask for a verified publisher, a named owner and the 15 mailboxes. If approved, limit the app to those mailboxes (RBAC for Applications) with an expiry and an alert on its use.', outcome: 'good', points: 10, why: 'Right. full_access_as_app is the same role the attacker gave its apps in this case. Microsoft\'s guidance is to review every app that holds it, remove what is unused, and use role-based access control for applications in Exchange Online to limit each app to specific mailboxes. An app that needs 15 mailboxes does not get 4,000.', reply: 'Customer Success: They say they can work with a mailbox group. Sending the list.' },
      { id: 'approve', text: 'Approve the admin consent. The vendor looks reputable and the manager is waiting.', outcome: 'bad', points: 0, why: 'One click gave the app every mailbox in the tenant, with no user in the loop and no expiry. A manager waiting is not a risk review. The grant would also look exactly like the attacker\'s in the audit log.', reply: 'Customer Success: Thanks, that was quick.', cost: { amount: 200000, text: 'A third party with permanent read access to every mailbox (estimate for this recreation)' } },
      { id: 'later', text: 'Leave it in the queue until next week', outcome: 'ok', points: 5, why: 'Safe, but you did not say why or what the safe version looks like. Decline with a reason and a path to yes.', reply: '(no reply)' },
    ],
  },
  {
    id: 'audit-retention',
    num: 7303,
    title: 'Cut audit log retention to save license cost',
    from: 'Finance (via IT)',
    via: 'Cloud change queue, Fri 8:00 AM',
    priority: 'Medium',
    facts: [['Today', 'Entra sign-in and audit logs kept 12 months in the SIEM; Purview Audit (Premium) for leadership, security and legal mailboxes'], ['Proposal', 'Keep 30 days in the SIEM and drop Purview Audit (Premium) for all but IT'], ['Saving', 'About $38,000 a year'], ['Related', 'Activity on a mailbox (MailItemsAccessed) is the only record of what an app read']],
    body: ['Finance asks to reduce audit retention and the Purview audit license to the minimum. The logs "are only used when something goes wrong".', 'What do we do?'],
    teaches: { skill: 'Keep the audit logs that let you reconstruct an intrusion, for as long as intrusions go unnoticed', secplus: '4.9 Use data sources; 3.2 Secure enterprise infrastructure: logging' },
    options: [
      { id: 'keep', text: 'Decline. Keep the SIEM retention and Purview Audit (Premium) for the high-value mailboxes (leadership, security, legal, finance), and save money elsewhere.', outcome: 'good', points: 10, why: 'Right. This intrusion ran for weeks before it was found, and the proof of which mailboxes were read comes from MailItemsAccessed. Microsoft\'s guidance names Microsoft Purview Audit (Premium) as part of the response to password spray and mailbox abuse. A log you did not keep cannot tell you what was taken, and without that you must assume all of it was.', reply: 'Finance: Understood. We will look at other savings.' },
      { id: 'cut', text: 'Approve. Save the $38,000.', outcome: 'bad', points: 0, why: 'Thirty days of sign-in logs would not reach back to the start of a campaign that, in the real case, ran for weeks before anyone found it, and without MailItemsAccessed for the right mailboxes you could not say what the apps read. The $38,000 is cheap next to assuming every mailbox was taken.', reply: 'Finance: Thanks!', cost: { amount: 250000, text: 'Not enough logs to prove what was read, so the notification covers everyone (estimate for this recreation)' } },
      { id: 'test-only', text: 'Cut retention only for the legacy test tenant', outcome: 'bad', points: 0, why: 'The test tenant is where this attack started. It is the tenant with no MFA and the least monitoring, which is exactly where you want the longest memory.', reply: 'Finance: Fine with us.', cost: { amount: 100000, text: 'No record of how the intrusion began (estimate for this recreation)' } },
    ],
  },
];
