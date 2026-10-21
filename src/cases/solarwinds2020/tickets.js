// Case file: SolarWinds / SUNBURST. The infrastructure change queue. Each ticket tests one habit the public record says made the
// incident possible or bigger: patching as a cleanup, unrestricted egress from a management server, and installing a signed vendor
// update on trust.
export const TICKETS = [
  {
    id: 'orion-upgrade',
    num: 8101,
    title: 'Upgrade ORION01 to the vendor hotfix and close the vulnerability ticket',
    from: 'IT Operations',
    via: 'Infrastructure queue, Mon 7:35 AM',
    priority: 'High',
    facts: [['Server', 'ORION01, Orion Platform 2020.2 HF 1'], ['Vendor advice', 'Upgrade to the hotfix release'], ['Plan', 'Install tonight 6 PM, in place, close the ticket'], ['Related', 'The resolver log shows avsvmcloud.com lookups from this server'], ['Account', 'svc-solarwinds (Domain Admin)']],
    body: ['IT Ops wants to install the hotfix tonight and close the ticket. The vendor says the hotfix fixes it.', 'What do we do?'],
    teaches: { skill: 'A patch fixes the product; it does not evict an attacker or recover evidence', secplus: '4.8 Incident response: eradication and recovery; 2.3 Supply-chain vulnerabilities' },
    options: [
      { id: 'image-first', text: 'Hold the upgrade. Image the server (memory and disk), disconnect it, rebuild on a clean OS with the patched version, and do not reuse the old credentials. Keep the ticket open until the investigation closes.', outcome: 'good', points: 10, why: 'Right. The hotfix replaces the compromised DLL, but if the backdoor was used, the actors have left more behind: a dropper, a beacon, stolen credentials. CISA ED 21-01 told agencies to disconnect, preserve, rebuild and reset credentials, not just patch. Close the ticket when the investigation does.', reply: 'IT Ops: Understood. We will build a clean server instead.' },
      { id: 'patch', text: 'Approve the upgrade tonight and close the ticket', outcome: 'bad', points: 0, why: 'This is the move that looks responsible and fixes nothing. It overwrites the evidence on the server, and leaves the credentials, the stolen certificate and every later stage in place.', reply: 'IT Ops: Done. See you at six.', cost: { amount: 400000, text: 'Evidence overwritten and the real intrusion left in place (estimate for this recreation)' } },
      { id: 'delay', text: 'Leave it in the queue until next week', outcome: 'ok', points: 3, why: 'Waiting is safer than patching blind, but you did not say what to do instead. Image, isolate and rebuild is the answer.', reply: '(no reply)' },
    ],
  },
  {
    id: 'orion-egress',
    num: 8102,
    title: 'Allow ORION01 outbound to any internet address (for the customer portal and update checks)',
    from: 'Network team',
    via: 'Infrastructure queue, Mon 7:45 AM',
    priority: 'Medium',
    facts: [['Today', 'ORION01 can reach any address on 443 (no allowlist)'], ['Request', 'Make it official: allow any outbound 443 for updates'], ['Why', '"It checks for updates and sends usage statistics"'], ['Related', 'SUNBURST needs outbound DNS and HTTPS to reach its server'], ['Owner', 'Infrastructure']],
    body: ['The network team wants the open rule documented as policy so audit stops asking. It has been open since 2018.', 'What do we do?'],
    teaches: { skill: 'Restrict outbound traffic from management and infrastructure servers to an allowlist', secplus: '3.2 Secure enterprise infrastructure: segmentation and egress control' },
    options: [
      { id: 'restrict', text: 'Decline. Allow only the vendor\'s update hosts and the internal DNS resolver, deny everything else, and alert on any new destination from the server. Servers do not resolve arbitrary public names.', outcome: 'good', points: 10, why: 'Right. SUNBURST had to resolve names under avsvmcloud.com and then reach a second-stage server before it could do anything. CISA and others advised blocking egress from the servers that run Orion. A management server with a short allowlist turns a quiet backdoor into a loud failed connection.', reply: 'Network team: Allowlist drafted. It is a short list.' },
      { id: 'allow', text: 'Approve. It has been open for years and nothing happened.', outcome: 'bad', points: 0, why: 'Nothing "happened" that anyone saw. An open rule is what let the backdoor call home from a server with a Domain Admin account for six months.', reply: 'Network team: Great, thanks.', cost: { amount: 200000, text: 'A management server that can reach anything on the internet (estimate for this recreation)' } },
      { id: 'log', text: 'Approve but turn on logging for the rule', outcome: 'ok', points: 4, why: 'Logging helps you see the traffic, and you did see it in the resolver log this morning. But a log is evidence after the fact; an allowlist stops it. Do both.', reply: 'Network team: Logging on.' },
    ],
  },
  {
    id: 'update-policy',
    num: 8103,
    title: 'Auto-install vendor updates on all management servers the day they are released',
    from: 'IT Operations',
    via: 'Infrastructure queue, Mon 7:55 AM',
    priority: 'Medium',
    facts: [['Proposal', 'Install vendor updates automatically on release day for monitoring, backup, patching and EDR servers'], ['Reason', '"Staying current is a security control"'], ['Signed?', 'Yes: the SUNBURST DLL was signed with the vendor\'s own certificate'], ['Related', 'Management servers hold the most privilege'], ['Current', 'IT applies updates by hand a few weeks after release']],
    body: ['After today IT Ops asked for the opposite of what you would expect: update faster. The argument is that being on the latest version is the best defense.', 'What do we do?'],
    teaches: { skill: 'Treat vendor updates as untrusted until verified: stage, test, monitor, least privilege', secplus: '2.3 Supply-chain vulnerabilities; 4.1 Security techniques: change management' },
    options: [
      { id: 'stage', text: 'Keep staged updates: a test ring first, compare hashes with the vendor\'s published values, watch the new version\'s network and process behavior for a week, and give the software only the rights it needs. Fast for emergency patches, never blind.', outcome: 'good', points: 10, why: 'Right. A valid signature proved who built the SUNBURST DLL, not that it was safe: SolarWinds was itself compromised at build time (CrowdStrike\'s SUNSPOT analysis). You cannot verify away a trusted vendor\'s mistake, but you can limit what the software can reach and notice when it behaves differently.', reply: 'IT Ops: Fair. We will propose a test ring.' },
      { id: 'auto', text: 'Approve. Updates are signed, and fast patching is safer.', outcome: 'bad', points: 0, why: 'Fast patching is good for vulnerabilities, but this is the opposite case. The malicious update was signed, and installing it faster would have spread it faster. For a tool with Domain Admin, speed without checks is the risk.', reply: 'IT Ops: Great, thanks!', cost: { amount: 300000, text: 'A faster path for a poisoned update to reach every management server (estimate for this recreation)' } },
      { id: 'manual-only', text: 'Never update management servers', outcome: 'bad', points: 0, why: 'Unpatched management servers are how other attacks begin. The answer is a controlled process with checks, not no process.', reply: 'IT Ops: Seriously?', cost: { amount: 100000, text: 'Known vulnerabilities left open on privileged servers (estimate for this recreation)' } },
    ],
  },
];
