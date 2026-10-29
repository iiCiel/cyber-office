// Attacker's Playbook: the offense side of each real-breach case.
//
// Soliman's brief (Oct 28, 2026): "to understand how an attack happened, you need to understand how he
// did it." Every case already teaches the defence (caseFile.attack: techniques + fixes). This file adds
// the matching offence, written at the same altitude as the public record and the case timeline: WHAT
// the attacker did at each step of the kill chain, WHAT it left behind, and WHERE a defender breaks it.
//
// Deliberately NOT here: payloads, exploit code, command strings, or any copy-paste recipe. Each step is
// kill-chain narrative at MITRE ATT&CK altitude, the same level as attack[] and the sources. The point is
// to read an intrusion the way a pentester or a defender reads it: as a chain of choices, each of which
// touches something you can see and break. tid values reference techniques already in each case's attack[].
//
// Shape, keyed by caseFile.id:
//   { goal, steps: [{ phase, tid, title, how, trace, stop }], chokepoint }
//     phase  one of the Lockheed/ATT&CK-ish stages shown as a badge
//     tid    an ATT&CK technique id that also appears in the case's attack[] (ties the two sides together)
//     how    what the attacker actually did, conceptually
//     trace  the telemetry / artefact that move creates (what the blue team can see)
//     stop   the control that would have broken the chain at that step
//   chokepoint  the single highest-leverage place the whole chain could have been cut

export const PLAYBOOKS = {
  'php2shell-2026': {
    goal: 'Run code on an internet-facing PHP server with no login, then read whatever that server can read.',
    steps: [
      { phase: 'Recon', tid: 'T1190', title: 'Find PHP that answers the internet', how: 'Scan broadly for hosts that serve PHP, and favour the riskiest setup: Apache with mod_php, where an unauthenticated request runs through the PHP runtime before any app login check. A hidden version banner does not help the defender here: the bug is in the runtime, not the app.', trace: 'Broad internet scanning and odd user agents (VulnCheck saw php2shell-scan/109618). On its own it looks like background noise.', stop: 'Keep a live inventory of every internet-facing PHP host, version and SAPI. You cannot defend hosts you have not listed.' },
      { phase: 'Initial access', tid: 'T1190', title: 'Trigger the bug with a crafted upload', how: 'Send a multipart request whose parsing happens before the runtime finishes initialising. A memory-limit fatal aborts the request before cleanup, leaving reclaimable heap in the worker. No app code and no session_start() is needed (Wiz).', trace: 'A huge multipart POST to an endpoint that never takes uploads, and a single "Allowed memory size exhausted" fatal in the Apache error log. CrowdStrike called that lone fatal the only reliable server-side trace.', stop: 'Size-limit or block multipart uploads at the proxy for endpoints that never take them; patch the runtime (only the update is a complete fix per php.net).' },
      { phase: 'Credential access', tid: 'T1539', title: 'Read the leaked memory back out', how: 'A later request on the same worker makes PHP URL-encode reclaimed heap into a PHPSESSID response cookie. That heap can hold other users\' passwords, tokens and session cookies that passed through the worker.', trace: 'A PHPSESSID cookie in the response that is far too long. Visible only if something inspects response bodies/headers.', stop: 'Invalidate all sessions after a suspected hit and bind sessions to more than a cookie; alert on absurdly long session cookies.' },
      { phase: 'Execution', tid: 'T1059.004', title: 'Turn the foothold into a shell', how: 'Use the code-execution primitive to make the web worker spawn a shell and reach out, then write a small PHP file into a world-writable uploads directory as a backdoor.', trace: 'An Apache/php-fpm child process starting /bin/sh or curl, and a new .php file under wp-content/uploads written by the web user. The FBI advised watching for exactly this.', stop: 'Alert when a web process spawns a shell or writes a .php file; keep uploads non-executable; default-deny outbound from the web tier.' },
      { phase: 'Impact', tid: 'T1552.001', title: 'Harvest secrets and read data', how: 'Read config files the web user can see (database password, app keys, API tokens) and pull the data the app was guarding. A patch applied later does not undo any of this.', trace: 'Outbound connections from a web box that normally only serves pages; config files accessed out of pattern.', stop: 'Assume config was read: rotate DB password, app salts/keys and tokens, and hunt back to the first exploitation date (Amazon: Oct 17), not the disclosure date.' },
    ],
    chokepoint: 'Default-deny outbound from the web tier. The bug gives code execution, but reading memory back and planting a shell still needs the server to talk to the attacker. A web box that can only serve pages is a dead end even when the runtime is vulnerable.',
  },

  'uber-2022': {
    goal: 'Get inside a contractor account, then ride trusted access to the admin tooling.',
    steps: [
      { phase: 'Initial access', tid: 'T1078', title: 'Start with a bought password', how: 'Buy or phish a contractor\'s corporate credential (reported as bought on a dark-web market after a malware infection). The password alone is not enough: MFA still stands.', trace: 'A valid login from an unfamiliar device/location for a contractor account. Easy to wave through.', stop: 'Require a managed/registered device for corporate sign-in; watch breach feeds for leaked staff credentials.' },
      { phase: 'Initial access', tid: 'T1621', title: 'Drown them in MFA prompts', how: 'Log in over and over so the contractor\'s phone keeps buzzing with push approvals (MFA fatigue / push bombing).', trace: 'A burst of MFA push requests and denials for one user in a short window.', stop: 'Number matching on push, rate-limit prompts, and alert on bursts of denials.' },
      { phase: 'Initial access', tid: 'T1656', title: 'Pose as IT to get the approval', how: 'Message the contractor on WhatsApp claiming to be Uber IT and tell them to accept the prompt to make it stop. They do.', trace: 'An out-of-band contact plus a sudden approval right after a denial storm.', stop: 'Teach everyone: IT never asks you to approve a prompt. Give one fast way to report a weird contact.' },
      { phase: 'Discovery', tid: 'T1552.001', title: 'Find secrets on an internal share', how: 'Once on the VPN, browse the intranet and find a PowerShell script on a network share with hard-coded admin credentials for a privileged access management system.', trace: 'A normal user account opening a share and reading scripts it has never touched before.', stop: 'Scan shares and repos for secrets; give scripts short-lived scoped tokens, never embedded admin passwords.' },
      { phase: 'Privilege escalation', tid: 'T1555', title: 'Unlock the vault', how: 'Use those admin credentials to log into the PAM/secret vault, which holds the keys to many other systems (cloud, finance, dashboards).', trace: 'A vault admin login from somewhere other than the usual jump host.', stop: 'Lock vault admin behind hardware MFA and just-in-time approval; alert on admin logins from anywhere unexpected.' },
    ],
    chokepoint: 'The hard-coded admin password on the share. Phishing a contractor is noisy and low-value; it only became a breach because one script handed over the vault. No secret in the file, no escalation.',
  },

  'target-2013': {
    goal: 'Reach the payment registers from outside, by walking in through a vendor.',
    steps: [
      { phase: 'Initial access', tid: 'T1566', title: 'Phish the HVAC vendor', how: 'Phish an HVAC/refrigeration contractor that has a legitimate connection into Target\'s network, and steal its credentials.', trace: 'Malware and credential theft inside a small third party, invisible to the retailer.', stop: 'Hold vendors to your security bar; assume their network is hostile.' },
      { phase: 'Initial access', tid: 'T1199', title: 'Log in through the vendor portal', how: 'Use the vendor\'s credentials to reach an internet-facing vendor portal, then pivot off the segment it lands on.', trace: 'A vendor account reaching systems beyond billing/project tooling.', stop: 'Segment vendor access to exactly the apps it needs; never let it touch the payment network.' },
      { phase: 'Lateral movement', tid: 'T1021.002', title: 'Spread across flat internal network', how: 'Move from the vendor foothold across a flat internal network toward the point-of-sale systems, using Windows admin shares and default/weak accounts.', trace: 'SMB connections and admin-share writes between segments that should never talk.', stop: 'Segment the card environment (PCI) hard; alert on cross-segment admin traffic.' },
      { phase: 'Execution', tid: 'T1005', title: 'Scrape cards from register memory', how: 'Install memory-scraping malware on the registers that reads card data out of RAM in the instant it is unencrypted, disguised as a legitimate service.', trace: 'A new service/task with an innocent-looking name running on POS devices.', stop: 'Application allow-listing on registers; alert on any new service on a POS box.' },
      { phase: 'Exfiltration', tid: 'T1048.003', title: 'Stage and ship the cards out', how: 'Collect scraped data to an internal staging server, then push it out to external drop points over ordinary protocols during business hours.', trace: 'An internal host accumulating data, then unusual outbound transfers. FireEye alerts fired and were not actioned.', stop: 'Someone has to read the alerts. Default-deny egress from the card environment and act on the first hit.' },
    ],
    chokepoint: 'Network segmentation. A refrigeration vendor had no business being one hop from the cash registers. Flat internal networks turn one phished contractor into 40 million cards.',
  },

  'equifax-2017': {
    goal: 'Exploit an unpatched web app, then quietly read database after database.',
    steps: [
      { phase: 'Initial access', tid: 'T1190', title: 'Hit an unpatched Apache Struts', how: 'Exploit a known, already-patched Struts vulnerability (CVE-2017-5638) on an internet-facing dispute portal two months after the fix was public.', trace: 'Exploit attempts against a web app running a version with a published CVE.', stop: 'Patch internet-facing apps on a clock; keep an accurate inventory of what runs where.' },
      { phase: 'Persistence', tid: 'T1505.003', title: 'Drop web shells', how: 'Plant web shells on the server to keep command access, and come and go over months.', trace: 'New script files on the web server and anomalous requests to them.', stop: 'Alert on new executable files written by the web user; file-integrity monitoring.' },
      { phase: 'Credential access', tid: 'T1552.001', title: 'Find more credentials in files', how: 'Read unencrypted credentials stored in files on the server and use them to reach other internal databases.', trace: 'Web host reading config/credential files, then new DB connections.', stop: 'Keep secrets out of files the web user can read; segment the web tier from data stores.' },
      { phase: 'Collection', tid: 'T1078', title: 'Query dozens of databases', how: 'Run thousands of queries across many databases over ~76 days, because the web tier could reach far more data than it needed.', trace: 'Huge query volume to databases a dispute portal should never touch.', stop: 'Least-privilege DB access; monitor query volume and breadth.' },
      { phase: 'Exfiltration', tid: 'T1041', title: 'Leave with the data, unseen', how: 'Compress and exfiltrate the data. An expired certificate had blinded the device meant to inspect this traffic for ~19 months.', trace: 'Encrypted outbound that a working inspection device would have flagged.', stop: 'Keep inspection certs current and monitored; expired monitoring is no monitoring.' },
    ],
    chokepoint: 'Patching the known Struts bug. The whole 147-million-record breach started with a two-month-old CVE on an internet-facing app. Everything after is just what a reachable web tier lets you touch.',
  },

  'colonial-2021': {
    goal: 'Get in with one password, encrypt for ransom, and get paid.',
    steps: [
      { phase: 'Initial access', tid: 'T1133', title: 'Log into a forgotten VPN', how: 'Use a single leaked password (found in a breach data set) to log into a legacy VPN account that was still enabled and had no MFA.', trace: 'A successful VPN login to a dormant account from a new location.', stop: 'MFA on every remote-access path; disable unused accounts; audit VPN accounts regularly.' },
      { phase: 'Credential access', tid: 'T1078', title: 'Reuse valid access', how: 'The account was valid, so no exploit was needed. The affiliate (DarkSide) operated with legitimate access.', trace: 'Normal-looking authenticated activity from an account that normally sits idle.', stop: 'Alert on dormant accounts waking up; baseline normal per-account behaviour.' },
      { phase: 'Exfiltration', tid: 'T1567', title: 'Steal data for double extortion', how: 'Copy sensitive data out before encrypting, so the victim is pressured to pay even if backups exist.', trace: 'Large outbound transfers to a web/cloud service before any encryption begins.', stop: 'Default-deny egress; alert on bulk uploads to unusual destinations.' },
      { phase: 'Impact', tid: 'T1486', title: 'Encrypt and demand ransom', how: 'Deploy ransomware across reachable systems. Colonial pre-emptively shut down the pipeline itself out of caution about billing/operational systems.', trace: 'Mass file-encryption events and ransom notes.', stop: 'Segment IT from OT; tested offline backups; a rehearsed incident plan so you do not over-shut-down.' },
    ],
    chokepoint: 'MFA on the VPN. One reused password opened a national fuel pipeline\'s network because a single legacy account had no second factor. One toggle breaks the entire chain at step one.',
  },

  'capital-one-2019': {
    goal: 'Abuse a misconfigured cloud firewall to make the cloud hand over its own keys.',
    steps: [
      { phase: 'Initial access', tid: 'T1190', title: 'Exploit a misconfigured WAF (SSRF)', how: 'Exploit a server-side request forgery weakness in a misconfigured web application firewall so the server makes requests on the attacker\'s behalf.', trace: 'Odd internal requests originating from the WAF host.', stop: 'Fix the SSRF/WAF misconfiguration; restrict what the proxy can reach internally.' },
      { phase: 'Credential access', tid: 'T1552.005', title: 'Ask the metadata service for keys', how: 'Use the SSRF to reach the cloud instance metadata endpoint and read the temporary IAM credentials attached to the server\'s role.', trace: 'The instance\'s role credentials being used from outside the instance.', stop: 'Enforce IMDSv2 (session-bound metadata); least-privilege instance roles.' },
      { phase: 'Discovery', tid: 'T1580', title: 'List what those keys unlock', how: 'With the role\'s permissions, enumerate cloud storage buckets. The role could list and read far more than that one app needed.', trace: 'ListBuckets / Sync API calls from a role that normally does a narrow job.', stop: 'Scope roles tightly; alert on broad discovery API calls.' },
      { phase: 'Collection', tid: 'T1530', title: 'Sync the buckets down', how: 'Copy the contents of ~100 million customers\' records out of the storage buckets the role could read.', trace: 'Large read/sync volume from storage, logged in CloudTrail.', stop: 'Monitor data-access volume; separate sensitive buckets behind their own policies.' },
      { phase: 'Exfiltration', tid: 'T1090.003', title: 'Hide behind relays', how: 'Route the traffic through Tor and a VPN to obscure origin. (The individual was still identified after boasting online.)', trace: 'Access from anonymising exit nodes, plus the actor\'s own public boasting.', stop: 'Flag API access from anonymising networks; the keys should not have reached that far in the first place.' },
    ],
    chokepoint: 'IMDSv2 and a least-privilege role. SSRF only pays off because the instance role could read 100M records. A session-bound metadata service plus a narrow role turns the SSRF into nothing.',
  },

  'moveit-2023': {
    goal: 'Mass-exploit a file-transfer zero-day and steal data from everyone who runs it.',
    steps: [
      { phase: 'Initial access', tid: 'T1190', title: 'Exploit a zero-day SQL injection', how: 'Exploit a then-unknown SQL injection in MOVEit Transfer (CVE-2023-34362), an internet-facing managed file-transfer app used by thousands of organisations.', trace: 'Anomalous requests to the MOVEit web endpoints before any patch existed.', stop: 'Minimise internet exposure of file-transfer apps; virtual-patch/WAF while vendors respond.' },
      { phase: 'Persistence', tid: 'T1505.003', title: 'Drop the LEMURLOOT web shell', how: 'Plant a web shell (named human2.aspx) to run commands and interact with the app\'s database.', trace: 'A new .aspx file in the web directory and requests carrying a specific header the shell expected.', stop: 'Alert on new web files; file-integrity monitoring on the app directory.' },
      { phase: 'Defense evasion', tid: 'T1136', title: 'Create accounts to blend in', how: 'Create application accounts and sessions so later access looks like normal app activity.', trace: 'New admin/service accounts appearing in the app with no change ticket.', stop: 'Alert on account creation; review app admin lists against change records.' },
      { phase: 'Collection', tid: 'T1213', title: 'Read the transferred files', how: 'Query the database and read the files organisations were moving through MOVEit, then do it at scale across many victims (Cl0p).', trace: 'Bulk reads of stored transfer data and database queries from the web tier.', stop: 'Encrypt stored files with keys the app cannot freely read; monitor bulk access.' },
      { phase: 'Exfiltration', tid: 'T1070', title: 'Take the data and clean up', how: 'Exfiltrate over the app\'s own channel and remove artefacts to slow investigators. Victims were later named on a leak site for extortion.', trace: 'Outbound transfers and deleted/overwritten logs and files.', stop: 'Ship logs off-box in real time so local cleanup cannot erase them; egress monitoring.' },
    ],
    chokepoint: 'Internet exposure of the transfer app plus logs kept only on the box. A zero-day is unavoidable, but a file-mover reachable by the whole internet with erasable local logs is the difference between an incident and a mass breach.',
  },

  'change-2024': {
    goal: 'Enter through a server with no MFA and ransom a healthcare clearinghouse.',
    steps: [
      { phase: 'Initial access', tid: 'T1133', title: 'Log into a Citrix portal with no MFA', how: 'Use stolen credentials to log into a remote-access (Citrix) portal that had no multi-factor authentication enabled.', trace: 'A remote login to a gateway that lacks a second factor.', stop: 'MFA on every external gateway, without exception.' },
      { phase: 'Discovery', tid: 'T1078', title: 'Live in the network for days', how: 'Operate with valid access and move quietly for roughly nine days before deploying ransomware.', trace: 'Reconnaissance and lateral movement from an authenticated account over several days.', stop: 'Baseline behaviour and alert on internal recon; MFA would have stopped step one.' },
      { phase: 'Lateral movement', tid: 'T1021', title: 'Move toward the crown jewels', how: 'Use remote-service access to reach the systems that process a third of US medical claims.', trace: 'Cross-system remote access from the compromised account.', stop: 'Segment critical processing systems; just-in-time admin access.' },
      { phase: 'Exfiltration', tid: 'T1567', title: 'Steal data first', how: 'Exfiltrate large volumes of health and personal data before encryption (double extortion).', trace: 'Bulk outbound transfers ahead of any encryption.', stop: 'Egress monitoring and default-deny from sensitive systems.' },
      { phase: 'Impact', tid: 'T1486', title: 'Encrypt and halt a sector', how: 'Deploy ransomware (ALPHV/BlackCat), disrupting US healthcare billing for weeks. A ransom was paid and the data was still at risk.', trace: 'Mass encryption and ransom demand.', stop: 'Tested offline backups and a rehearsed recovery plan; paying does not guarantee deletion.' },
    ],
    chokepoint: 'MFA on the Citrix portal. A single server without a second factor took down claims processing for a third of the country. The cheapest control, missing on the one door that mattered.',
  },

  'midnight-blizzard-2024': {
    goal: 'Spray into a legacy account, then quietly grant yourself access to mailboxes.',
    steps: [
      { phase: 'Initial access', tid: 'T1110.003', title: 'Password-spray a forgotten account', how: 'A nation-state actor (Midnight Blizzard / APT29) sprays common passwords and lands on a legacy non-production test tenant account that had no MFA.', trace: 'Many failed logins across accounts, then one success on a dormant test account, routed through residential proxies.', stop: 'MFA everywhere including legacy/test; detect spray patterns; retire old tenants.' },
      { phase: 'Discovery', tid: 'T1078.004', title: 'Find an over-privileged app', how: 'From the test tenant, discover a legacy OAuth application that had high privileges into the corporate environment.', trace: 'A test account enumerating app registrations and permissions.', stop: 'Inventory and prune OAuth apps; remove standing high privilege.' },
      { phase: 'Privilege escalation', tid: 'T1098.001', title: 'Give the app your own secret', how: 'Add new credentials to that OAuth app so the attacker can authenticate as it, then grant it broad mailbox access.', trace: 'New client secret added to an app registration; new role/permission grants.', stop: 'Alert on credential/permission changes to privileged apps; approval workflow for consent.' },
      { phase: 'Persistence', tid: 'T1136.003', title: 'Create accounts to keep access', how: 'Create additional accounts and grant them roles so access survives cleanup of the first foothold.', trace: 'New cloud accounts and role assignments with no HR/ticket backing.', stop: 'Reconcile cloud accounts against change records; least standing privilege.' },
      { phase: 'Collection', tid: 'T1114.002', title: 'Read the leadership inboxes', how: 'Use the app\'s mailbox access to read senior leaders\' and security staff\'s email over weeks.', trace: 'Mass mailbox access via an application identity, logged in the audit trail.', stop: 'Alert on app-based bulk mailbox reads; scope app mail permissions tightly.' },
    ],
    chokepoint: 'The legacy test tenant and the over-privileged OAuth app. A spray only works on an account with no MFA; it only mattered because a forgotten app could be turned into a key to production mailboxes. Prune both and the chain dies at step one.',
  },

  'notpetya-2017': {
    goal: 'Not to break in once, but to destroy everything reachable, disguised as ransomware.',
    steps: [
      { phase: 'Initial access', tid: 'T1195.002', title: 'Poison a software update', how: 'Compromise the update server for M.E.Doc, Ukrainian accounting software, and push a malicious update to everyone who runs it (supply chain).', trace: 'A trusted auto-update delivering a tampered binary.', stop: 'Verify update integrity; vendors must protect their build/update pipeline.' },
      { phase: 'Credential access', tid: 'T1003.001', title: 'Dump passwords from memory', how: 'Use a Mimikatz-style technique to pull credentials straight out of LSASS memory on each infected machine.', trace: 'Processes reading LSASS memory.', stop: 'Credential Guard / LSA protection; EDR alerts on LSASS access.' },
      { phase: 'Lateral movement', tid: 'T1210', title: 'Spread with EternalBlue + admin shares', how: 'Propagate automatically using the EternalBlue SMB exploit and the stolen credentials over admin shares and WMI. It needed no human to keep going.', trace: 'SMB exploitation and rapid machine-to-machine spread across the LAN.', stop: 'Patch MS17-010; segment; block SMB between workstations.' },
      { phase: 'Defense evasion', tid: 'T1070.001', title: 'Clear the logs', how: 'Wipe Windows event logs to slow anyone trying to reconstruct what happened.', trace: 'Event logs cleared en masse.', stop: 'Forward logs off-box in real time so local wiping does not blind you.' },
      { phase: 'Impact', tid: 'T1561.002', title: 'Wipe the disks, pretend it is ransom', how: 'Overwrite the master boot record and encrypt files with no real recovery path. The ransom note was a decoy: the goal was destruction (~$10B in damage).', trace: 'Mass unbootable machines and a ransom note that cannot actually decrypt.', stop: 'Tested offline backups and segmentation; recognise a wiper is not a negotiation.' },
    ],
    chokepoint: 'Patching EternalBlue (MS17-010) and segmenting the network. The poisoned update seeded a few machines; the self-spread over an unpatched, flat network is what turned it into the most destructive cyberattack in history.',
  },

  'solarwinds-2020': {
    goal: 'Hide inside a trusted software update, then forge your way into cloud email undetected.',
    steps: [
      { phase: 'Initial access', tid: 'T1195.002', title: 'Backdoor a build, not a server', how: 'Compromise SolarWinds\' build pipeline and insert the SUNBURST backdoor into signed Orion updates, shipped to ~18,000 customers (APT29).', trace: 'A legitimately signed update that carries hidden code. Almost nothing looks wrong.', stop: 'Protect the build pipeline; reproducible builds; monitor what signed software does after install.' },
      { phase: 'Defense evasion', tid: 'T1497.003', title: 'Stay dormant and patient', how: 'Wait ~2 weeks after install, check for analysis tools, and only then wake up, to slip past sandboxes and sensors.', trace: 'Long dwell before any beaconing; environment checks.', stop: 'Behavioural baselining over time, not just install-time scanning.' },
      { phase: 'Command & control', tid: 'T1071.004', title: 'Beacon over DNS, blend in', how: 'Use an algorithm to generate subdomains and signal over DNS/HTTPS that mimics normal Orion telemetry.', trace: 'Unusual DNS lookups and C2 that resembles legitimate product traffic.', stop: 'Monitor DNS for generated domains; alert on a management tool talking to new infrastructure.' },
      { phase: 'Privilege escalation', tid: 'T1606.002', title: 'Forge SAML tokens (Golden SAML)', how: 'Steal the AD FS token-signing key and forge SAML tokens to authenticate as any user, with any MFA, into cloud services.', trace: 'Reading the token-signing key; logins with no matching real authentication event.', stop: 'Protect the token-signing key (HSM); alert on unusual AD FS key access; detect tokens with no corresponding sign-in.' },
      { phase: 'Collection', tid: 'T1114.002', title: 'Read cloud mailboxes, add keys', how: 'Add credentials to cloud apps and read targeted email in Microsoft 365, choosing victims carefully from the 18,000.', trace: 'New app credentials and app-based mailbox access in cloud audit logs.', stop: 'Monitor app credential additions and bulk mail access; least privilege for cloud apps.' },
    ],
    chokepoint: 'Protecting the AD FS token-signing key. The backdoor got them in, but Golden SAML is what let them walk past MFA into cloud email. A key in an HSM with alerting turns the whole supply-chain effort into a dead end at the cloud door.',
  },

  'mgm-2023': {
    goal: 'Talk your way past the help desk, then take over the identity system and ransom it.',
    steps: [
      { phase: 'Recon', tid: 'T1656', title: 'Research an employee on LinkedIn', how: 'Pick a real employee from public profiles (Scattered Spider) so a help-desk call sounds convincing.', trace: 'None on the network: this is open-source research.', stop: 'Limit what staff roles/contacts are public; assume attackers know your org chart.' },
      { phase: 'Initial access', tid: 'T1566.004', title: 'Phone the help desk (vishing)', how: 'Call the IT help desk impersonating that employee and talk the agent into resetting the account\'s MFA, a ~10-minute call.', trace: 'A help-desk MFA reset with weak identity proofing.', stop: 'Strong caller verification (callback, manager, video); never reset MFA on a phone call alone.' },
      { phase: 'Credential access', tid: 'T1556.006', title: 'Register your own MFA', how: 'With the reset done, enrol the attacker\'s own device as the account\'s MFA, then log in legitimately.', trace: 'A new MFA device registered right after a help-desk reset.', stop: 'Alert on MFA re-enrolment; require extra approval for privileged accounts.' },
      { phase: 'Privilege escalation', tid: 'T1484.002', title: 'Take over the identity provider', how: 'Escalate into the Okta/identity tier and modify federation/trust so the attacker controls authentication org-wide.', trace: 'Changes to identity-provider trust settings and admin roles.', stop: 'Lock IdP admin behind hardware MFA and change control; alert on federation changes.' },
      { phase: 'Impact', tid: 'T1486', title: 'Encrypt the estate', how: 'Deploy ransomware (ALPHV) across casino/hotel systems, taking slot machines, room keys and bookings offline (~$100M impact).', trace: 'Mass encryption across business systems.', stop: 'Segment; tested offline backups; the whole chain traces back to one help-desk call.' },
    ],
    chokepoint: 'Help-desk identity proofing. No exploit, no malware at entry: a ten-minute phone call reset an MFA. Strong caller verification on that one process stops a nine-figure ransomware incident before it starts.',
  },
};
