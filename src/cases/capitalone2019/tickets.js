// Case file: Capital One 2019. The cloud security review queue. People and details are fictional.
// Each ticket is one of the gaps the real attack went through: an over-powerful role, a server that could
// be talked into fetching its own credentials, and logging nobody was watching.
export const TICKETS = [
  {
    id: 'waf-role',
    num: 4417,
    title: 'IAM review: web firewall role can read every S3 bucket',
    from: 'Platform Engineering (Ravi)',
    via: 'IAM access review queue, Wed 8:30 AM',
    priority: 'High',
    facts: [['Role', 'corp-waf-role (attached to the firewall servers)'], ['Allows', 's3:ListAllMyBuckets, s3:GetObject on arn:aws:s3:::*'], ['Needs', 'Read its own config bucket only'], ['Last reviewed', 'Never']],
    body: ['The firewall servers use this role to fetch config and write logs. It was created wide open "to get it working" and nobody tightened it.', 'If I narrow it, the firewall might break at 2 AM. Can we leave it?'],
    teaches: { skill: 'Least privilege: scope a cloud role to what the workload needs', secplus: '4.6 Identity and access management: least privilege' },
    options: [
      { id: 'scope', text: 'Remove the wildcard and ListAllMyBuckets. Allow read on the one config bucket and write on the log prefix only. Test it in staging first.', outcome: 'good', points: 10, why: 'Right. A firewall has no reason to list or read customer data buckets. If a role is stolen, a small role limits the damage. The real role could list the buckets and copy data from them, which is how this became a 100 million person breach.', reply: 'Ravi: Fair. I will test in staging today.' },
      { id: 'leave', text: 'Leave it. It works and nobody has complained.', outcome: 'bad', points: 0, why: 'A role that "works" is a role nobody has looked at. Over-broad roles are what turn one stolen session into a mass data theft.', reply: 'Ravi: Great, one less thing.', cost: { amount: 150000, text: 'The role stays a skeleton key (estimate for this replay)' } },
      { id: 'delete', text: 'Delete the role right now', outcome: 'ok', points: 3, why: 'It would stop abuse, but it takes down the firewall on a production day with no plan. Scope it down, do not pull the floor.', reply: 'Ravi: That will page me.' },
    ],
  },
  {
    id: 'metadata',
    num: 4421,
    title: 'Web servers can fetch their own role credentials from the metadata address',
    from: 'AppSec (Nadia)',
    via: 'Security backlog, Wed 8:45 AM',
    priority: 'High',
    facts: [['Finding', 'A request to the proxy can make the server call the metadata address'], ['Where', 'Firewall/proxy servers'], ['Today', 'Any process on the host (or anything it fetches for a caller) can read the role credentials'], ['Replay note', 'In July 2019 only the GET-based metadata service existed. AWS released IMDSv2 on Nov 19, 2019, after this breach.']],
    body: ['The instance metadata service hands out the role\'s temporary keys to any request from the box. If a proxy can be tricked into making that request, the caller gets the keys.', 'What is the fix?'],
    teaches: { skill: 'Stop server-side request forgery (SSRF) against the cloud metadata service', secplus: '2.3 Vulnerabilities: SSRF and misconfiguration' },
    options: [
      { id: 'layered', text: 'Block link-local metadata addresses in the proxy, allow only known outbound destinations, and move to the session-token metadata service (IMDSv2) when available. Require it, with a hop limit of 1.', outcome: 'good', points: 10, why: 'Layers. IMDSv2 (session tokens, PUT, hop limit 1, no X-Forwarded-For) was built after this breach to blunt this class of attack. Until then, filter outbound requests and fix the proxy. Fix the root cause too: do not let a web-facing server fetch arbitrary URLs.', reply: 'Nadia: I will write the proxy rule today.' },
      { id: 'patch', text: 'Just patch the proxy for this one request pattern', outcome: 'ok', points: 4, why: 'Blocking one pattern is a start, but attackers try variants. Combine allow-listing of destinations with a metadata service that needs a token.', reply: 'Nadia: That fixes this one string.' },
      { id: 'accept', text: 'Accept the risk. The metadata address is internal, so outsiders cannot reach it.', outcome: 'bad', points: 0, why: 'This is the assumption the attack breaks. The outsider does not reach it; they make your server do it for them.', reply: 'Nadia: Noted.', cost: { amount: 150000, text: 'The server can still be asked to hand over its keys (estimate for this replay)' } },
    ],
  },
  {
    id: 'logging',
    num: 4430,
    title: 'Alert when instance role credentials are used from outside our network',
    from: 'SOC lead',
    via: 'Detection backlog, Wed 9:10 AM',
    priority: 'Normal',
    facts: [['Logs today', 'CloudTrail is on and stored'], ['Alerts today', 'None for role credentials used from non-AWS addresses'], ['Cost', 'A rule, a queue, and about a day of tuning']],
    body: ['Temporary credentials issued to an instance should be used from that instance. If CloudTrail shows them used from a Tor exit node or a VPN, something is wrong.', 'Do we build it?'],
    teaches: { skill: 'Detect stolen cloud credentials with logging and alerting', secplus: '4.4 Alerting and monitoring' },
    options: [
      { id: 'rule', text: 'Build the alert: role session used from an IP outside our ranges, ListBuckets or bulk GetObject from a role that never did that before. Page on-call. Turn on data-event logging for sensitive buckets.', outcome: 'good', points: 10, why: 'This is the detection that was missing. The access took place in March but the tip came in July. A rule on this pattern would have fired the first time the stolen keys were used from the wrong place. Real services such as AWS GuardDuty later added detections for credentials used from outside AWS.', reply: 'SOC lead: Writing the rule.' },
      { id: 'weekly', text: 'Add it to the weekly report so someone reads it on Monday', outcome: 'ok', points: 4, why: 'Better than nothing, but a weekly digest finds a theft months late. Stolen credentials need a page, not a report.', reply: 'SOC lead: A report. Okay.' },
      { id: 'skip', text: 'No. CloudTrail is on, that is enough.', outcome: 'bad', points: 0, why: 'Logs nobody watches are a diary of the breach. Collecting data is not the same as detecting an attack.', reply: 'SOC lead: Okay.', cost: { amount: 150000, text: 'Months of access go unseen (estimate for this replay)' } },
    ],
  },
];
