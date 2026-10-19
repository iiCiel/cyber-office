// Case file: NotPetya. Three queue items that test the habits behind the real failures: patching SMBv1, the shared local
// Administrator password, and having an offline, rehearsed way to rebuild Active Directory. Invented requests.
export const TICKETS = [
  {
    id: 'local-admin',
    num: 7301,
    title: 'Keep the same local Administrator password on every PC? (helpdesk request)',
    from: 'Helpdesk (Dana, playing the helpdesk)',
    via: 'Security backlog, Tue 8:45 AM',
    priority: 'High',
    facts: [['Today', 'Local Administrator has the same password on 1,964 workstations and servers'], ['Why', 'Helpdesk can fix any PC without looking up a password'], ['Proposal', 'Keep it, but change it once a year'], ['Alternative', 'Microsoft LAPS: a random password per machine, rotated and stored in Active Directory']],
    body: ['The helpdesk likes it because it is quick. But anyone who gets that one password can sign in to every machine over the network.', 'What do we do?'],
    teaches: { skill: 'Unique, rotated local administrator passwords (LAPS) stop one stolen credential from opening every machine', secplus: '4.6 Identity and access management: privileged accounts' },
    options: [
      { id: 'laps', text: 'Deploy LAPS. Every machine gets its own random local Administrator password, rotated automatically, readable only by the people who need it. Block network logon for local accounts.', outcome: 'good', points: 10, why: 'Right. A shared local password turns one compromised PC into all of them. NotPetya\'s spread used stolen credentials, and the sources list limiting the damage of a stolen credential as a core fix. LAPS means a password found on one machine opens only that machine.', reply: 'Dana: I will script the rollout. The helpdesk can read the password per machine when they need it.' },
      { id: 'yearly', text: 'Keep one shared password but change it every year', outcome: 'bad', points: 0, why: 'The attack does not wait a year. For the days the password is the same everywhere, one machine\'s secret opens every machine.', reply: 'Dana: Easy. Same as now, then.', cost: { amount: 15000000, text: 'One credential still opens every machine (estimate for this replay)' } },
      { id: 'longer', text: 'Keep it shared but make it 20 characters long', outcome: 'ok', points: 4, why: 'Better against guessing, but the worm does not guess: it takes the password from memory and uses it everywhere. Length does not help when the secret is the same on every machine.', reply: 'Dana: OK, I will pick a long one.' },
    ],
  },
  {
    id: 'smbv1',
    num: 7302,
    title: 'Legacy server APP-CPH03 cannot be patched: vendor says it breaks the shipping-documents app',
    from: 'Infrastructure (Theo, playing a server engineer)',
    via: 'Change queue, Tue 9:00 AM',
    priority: 'High',
    facts: [['Server', 'APP-CPH03, Windows Server 2008 R2, MS17-010 missing'], ['Patch', 'MS17-010 (KB4012212 or KB4012215), published March 14, 2017'], ['Vendor', '"Do not patch, not certified"'], ['Exposure', 'TCP 445 reachable from all sites']],
    body: ['The business owner does not want any downtime. The scan has listed this server for three months.', 'What do we do?'],
    teaches: { skill: 'Patch SMBv1 flaws or compensate with disabling SMBv1 and segmentation, instead of accepting open-ended risk', secplus: '4.3 Vulnerability management; 3.2 Secure enterprise infrastructure' },
    options: [
      { id: 'patch-segment', text: 'Test and install the patch this week. Until then disable SMBv1 if the app allows it, and put the server in a segment where only the app\'s clients can reach TCP 445.', outcome: 'good', points: 10, why: 'Right. MS17-010 had been available since March 14; Microsoft and CISA both say to patch and to disable SMBv1 and block SMB between segments. Compensating controls are a bridge to the patch, not a replacement.', reply: 'Theo: I will schedule a test with the vendor on Thursday. Segmenting today.' },
      { id: 'accept', text: 'Accept the risk. The vendor says no.', outcome: 'bad', points: 0, why: 'A vendor\'s uncertified label is not a risk assessment. The exposure is the whole network: it only takes one infected PC. Three months of "accepted" turned into the exploit\'s target list.', reply: 'Theo: Fine, back to the queue.', cost: { amount: 20000000, text: 'A known-vulnerable server stays on the flat network (estimate for this replay)' } },
      { id: 'weekend', text: 'Patch all 214 hosts this weekend, no testing', outcome: 'ok', points: 5, why: 'The intent is right but a blind mass patch can break things, and it ignores the shared-credential path the worm also uses. Do it in waves with a test group first, and cut SMB between sites at once.', reply: 'Theo: That is a lot at once.' },
    ],
  },
  {
    id: 'dc-backup',
    num: 7303,
    title: 'Budget request: offline backups and a recovery drill for Active Directory',
    from: 'Infrastructure (Theo, playing a server engineer)',
    via: 'Security backlog, Tue 9:20 AM',
    priority: 'Medium',
    facts: [['Today', 'Six domain controllers replicate to each other. None is in a backup job.'], ['Assumption', '"If one dies, the others have a copy"'], ['Proposal', 'System-state backups of two domain controllers to an offline or immutable store, plus a yearly forest recovery drill'], ['Reference', 'Microsoft AD Forest Recovery guide: plan and practice at least once a year']],
    body: ['Replication means a bad change (or a worm) is copied everywhere in seconds. The question is whether there is a copy it cannot reach.', 'What do we decide?'],
    teaches: { skill: 'Keep offline or immutable backups of Active Directory and rehearse forest recovery', secplus: '3.4 Resilience and recovery; 4.8 Incident response: recovery' },
    options: [
      { id: 'approve-drill', text: 'Approve it: offline or immutable system-state backups of at least two controllers in different sites, and a forest recovery rehearsal at least once a year.', outcome: 'good', points: 10, why: 'Right. Replication is not a backup: it copies a bad change everywhere. Wired reported that the real company had backups of nearly everything except its domain controllers, and recovery depended on one controller that happened to be switched off by a power cut.', reply: 'Theo: Thank you. I will write the runbook and book the drill.' },
      { id: 'replication', text: 'Decline. Replication already protects us.', outcome: 'bad', points: 0, why: 'Replication copies the worm\'s damage to every controller as quickly as it copies a password change. It protects against a failed disk, not against an attacker or a bad change.', reply: 'Theo: Okay.', cost: { amount: 20000000, text: 'No way back for Active Directory except luck (estimate for this replay)' } },
      { id: 'backup-no-drill', text: 'Approve backups but skip the drill', outcome: 'ok', points: 5, why: 'Half a plan. A backup nobody has restored is a hope, not a recovery. Microsoft advises practicing forest recovery at least once a year.', reply: 'Theo: I would still like the drill.' },
    ],
  },
];
