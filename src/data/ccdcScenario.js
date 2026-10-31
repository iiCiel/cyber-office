// CCDC scenario: "Cedarline Freight Co." — a fictional small logistics business you inherit on the morning
// of the competition. Everything here is made up: documentation-only IP ranges (RFC 5737 198.51.100/24,
// 203.0.113/24 and RFC 1918 10.10.10/24), invented hosts, no real credentials, nothing executable. Every
// finding is written from the DEFENDER's seat — "here is a misconfiguration on a box you now own, here is how
// a sysadmin fixes it" — and every action is an ordinary admin task. The teaching target is the real CCDC
// playbook: triage fast, kill the easy wins (default creds, rogue admins, open firewall), and above all do
// not knock over a scored service while you harden.
//
// Scored services (the scoring engine polls these; keep them UP):
//   HTTP  on web01   ·  DNS on dc01  ·  SMTP+IMAP on mail01  ·  MySQL on db01
//
// Each finding: { id, host, ip, title, severity, category, evidence, teach, exploitable, compromiseImpact,
//   compromisePenalty, dropsOnCompromise?, persistence?, actions: [{ id, label, result, fixes?/misfix?,
//   dropsService?: string[], dropNote?, restoresService?: string[], why }] }. Exactly one action `fixes` the
// finding; the others are traps (misfix, often dropsService) or no-ops. The fixing action's restoresService
// lists EVERY service any of that finding's traps can drop, so a dropped service is always recoverable by
// fixing the finding that broke it (tests/ccdc.test.js enforces this). `why` is the coaching line shown in
// guided mode and always in the debrief, so grading is learnable. Option order is shuffled per game.

export const CCDC_SCENARIO = {
  id: 'cedarline-2026',
  company: 'Cedarline Freight Co.',
  tagline: 'A 40-person freight brokerage. You and your team just took over IT at 9:00 AM. The last admin left no documentation and a lot of bad habits.',
  clockSeconds: 900, // competition mode: a real 15-minute countdown; at 0:00 the round ends and the red team runs
  slaPenalty: 15, // per service outage caused by your own change (real CCDC logs SLA violations; recovery does not refund them)

  services: [
    { id: 'web01', name: 'Company website (HTTP/HTTPS)', proto: 'HTTP', host: 'web01', ip: '10.10.10.20', points: 120, check: 'GET / returns 200 with the Cedarline homepage (pages are built from the shipments DB)' },
    { id: 'dc01', name: 'DNS', proto: 'DNS', host: 'dc01', ip: '10.10.10.10', points: 120, check: 'A record lookups for cedarline.example resolve' },
    { id: 'mail01', name: 'Mail (SMTP + IMAP)', proto: 'SMTP/IMAP', host: 'mail01', ip: '10.10.10.30', points: 120, check: 'Authenticated send + mailbox fetch succeed' },
    { id: 'db01', name: 'Shipments database (MySQL)', proto: 'MySQL', host: 'db01', ip: '10.10.10.40', points: 120, check: 'The scoring engine logs in as ccdc-scorecheck and SELECTs from wp_shipments; the website also reads it' },
  ],

  // The network you inherited, for the inventory inject and the topology panel.
  hosts: [
    { host: 'edge-fw', ip: '203.0.113.2', role: 'Edge firewall (pfSense)', os: 'FreeBSD' },
    { host: 'dc01', ip: '10.10.10.10', role: 'Domain controller + DNS', os: 'Windows Server 2019' },
    { host: 'web01', ip: '10.10.10.20', role: 'Web server (Apache + WordPress)', os: 'Ubuntu 20.04' },
    { host: 'mail01', ip: '10.10.10.30', role: 'Mail (Postfix + Dovecot)', os: 'Ubuntu 20.04' },
    { host: 'db01', ip: '10.10.10.40', role: 'Database (MySQL 8)', os: 'Ubuntu 20.04' },
    { host: 'ws01', ip: '10.10.10.50', role: 'Reception workstation', os: 'Windows 10' },
  ],

  // The competitor briefing shown before the round — "what good teams actually do".
  briefing: {
    title: 'What winning blue teams do in the first 15 minutes',
    intro: 'You cannot fix everything, and the red team is already connected. CCDC is won by triage and by NOT dropping scored services. Work this order:',
    checklist: [
      'Change the passwords that let the red team walk in the front door FIRST: default and shared admin accounts on every box. This is the single highest-value 15 minutes you will spend.',
      'Find and remove accounts you did not create — especially any extra Domain Admin. A rogue admin account is a backdoor that survives every password change you make.',
      'Stand up a default-deny firewall policy — but explicitly ALLOW the scored ports before you enable it, or you take every service down with one rule.',
      'Only then start closing individual holes (open relay, web shells, SMBv1). Entrenchment beats a half-finished hardening job.',
      'Before you touch a scored service account or reboot a scored box, file a Password/Change Request. Scoring stops the moment the engine cannot log in.',
    ],
    traps: [
      'Default-deny with no allow rules = every scored service drops at once. Allow first, deny last.',
      'Binding MySQL to 127.0.0.1 looks safe, but the web server and the scoring engine both reach it over the network — you just dropped the database AND the website. Bind to the internal interface and restrict it on db01\'s host firewall instead.',
      'Rotating the DB password without updating the app config breaks the website: WordPress can no longer log in. Change both together.',
      'A full "Windows Update + reboot now" on the DC mid-round takes DNS down for the whole reboot. Turn off the risky protocol with a setting that needs no restart; schedule anything that needs a reboot for a maintenance window.',
      'Changing the scored service account password without a Change Request stops the scoring engine from logging in — you lose uptime you were actually serving.',
    ],
  },

  findings: [
    {
      id: 'web-admin-default',
      host: 'web01',
      ip: '10.10.10.20',
      title: 'WordPress admin uses a default password',
      severity: 'Critical',
      category: 'Default credentials',
      evidence: 'wp-admin accepts admin / admin. The account is a full administrator.',
      teach: 'Default and guessable admin passwords are the number-one way red teams get in. Rotating them is the highest-value early action.',
      exploitable: true,
      compromiseImpact: 'Red team logs into wp-admin and defaces the homepage / plants a plugin backdoor.',
      compromisePenalty: 60,
      dropsOnCompromise: 'web01',
      actions: [
        { id: 'strong-pw', label: 'Set a long, unique admin password and confirm no other admin accounts exist', result: 'wp-admin now requires a strong password; the admin inventory is clean.', fixes: true, why: 'Right. Rotate the default and verify the account list in the same pass so a hidden admin cannot undo it.' },
        { id: 'rename-admin', label: 'Rename the "admin" user to "cedar-admin" but keep the password', result: 'The username changed; the password is still "admin".', misfix: true, why: 'A rename is not a password change. The red team still logs in — obscurity is not a control.' },
        { id: 'plugin', label: 'Install a "security" plugin from an unknown source and move on', result: 'An unvetted plugin now runs as admin on the site.', misfix: true, why: 'Installing unknown code to "fix" an auth problem adds attack surface and never changed the weak password.' },
        { id: 'leave', label: 'Leave it — the site is behind the firewall anyway', result: 'No change.', why: 'The web server is a scored, internet-facing service. "Behind the firewall" does not protect the admin login.' },
      ],
    },
    {
      id: 'mysql-exposed',
      host: 'db01',
      ip: '10.10.10.40',
      title: 'MySQL root password is "root" and it listens on every interface',
      severity: 'Critical',
      category: 'Default credentials / exposure',
      evidence: 'bind-address = 0.0.0.0, and root has the password "root" with remote login allowed. Two legitimate clients reach the DB at 10.10.10.40 over the network: web01 (WordPress) and the scoring engine\'s MySQL check.',
      teach: 'Two problems at once: a trivial password and a service exposed far wider than it needs to be. Fix both without cutting off the clients that legitimately need it — the web server and the scoring engine.',
      exploitable: true,
      compromiseImpact: 'Red team connects to MySQL directly and dumps/alters the shipments table.',
      compromisePenalty: 55,
      actions: [
        { id: 'proper', label: 'Set a strong root password, update wp-config.php on web01 to match, bind MySQL to the LAN interface (10.10.10.40), and on db01\'s host firewall allow 3306 only from web01 and the scoring engine', result: 'Root is strong, the website still connects, the scoring check still passes, and nothing else can reach the DB.', fixes: true, restoresService: ['db01', 'web01'], why: 'Right. The DB stays reachable by exactly the clients that need it, the app config changes in the same step as the password, and the password is no longer trivial. If an earlier trap broke the DB or the site, this brings both back.' },
        { id: 'localhost', label: 'Bind MySQL to 127.0.0.1 so nothing external can reach it', result: 'MySQL now only answers on localhost. web01 and the scoring engine can no longer connect — the MySQL check fails and the website throws "Error establishing a database connection".', misfix: true, dropsService: ['db01', 'web01'], dropNote: 'MySQL bound to 127.0.0.1; web01 and the scoring engine cannot reach it.', why: 'Classic trap. The web server and the scoring engine talk to MySQL over the network, so localhost-only cuts off both legitimate clients and drops two scored services. Restrict it with db01\'s host firewall instead.' },
        { id: 'rotate-only', label: 'Rotate the root password only, leave the app config alone', result: 'Root is strong — but web01 still has the old password in wp-config.php, so the website now throws a database error.', misfix: true, dropsService: ['web01'], dropNote: 'WordPress cannot log in to MySQL after the password change.', why: 'Trap. Rotating a DB password without updating the app that uses it breaks the app. Change both together.' },
        { id: 'leave', label: 'Leave it — changing DB settings is risky mid-round', result: 'No change.', why: 'A trivial default password on a database the whole internet can reach is the opposite of safe. The risk is in leaving it.' },
      ],
    },
    {
      id: 'rogue-da',
      host: 'dc01',
      ip: '10.10.10.10',
      title: 'An extra Domain Admin account you did not create',
      severity: 'Critical',
      category: 'Rogue account / backdoor',
      evidence: 'Domain Admins contains svc-backup2, created three days before the round, no matching service or documentation. Your real backup account is svc-backup.',
      teach: 'A rogue privileged account is a backdoor that survives every password reset. Finding and removing extra admins is a top-three first-15-minute task.',
      exploitable: true,
      compromiseImpact: 'Red team signs in as the hidden Domain Admin and re-owns the domain after your other fixes.',
      compromisePenalty: 65,
      persistence: 'Hidden Domain Admin — re-grants access after you rotate other passwords.',
      actions: [
        { id: 'remove', label: 'Confirm svc-backup2 is not referenced by any service, then disable and remove it from Domain Admins', result: 'The rogue admin is gone; the real svc-backup still runs backups.', fixes: true, why: 'Right. Verify it is not a real service account, then strip the privilege. Disable first, remove once confirmed — reversible and clean.' },
        { id: 'reset-pw', label: 'Just reset svc-backup2\'s password', result: 'The account still exists with Domain Admin rights.', misfix: true, why: 'A password reset on a backdoor account you do not control still leaves a Domain Admin the red team planted. Remove the privilege, not just the password.' },
        { id: 'delete-real', label: 'Delete svc-backup (the real backup account) by mistake', result: 'Nightly backups now fail; the rogue svc-backup2 is untouched.', misfix: true, why: 'Wrong account. Deleting the legitimate service account breaks a business function and leaves the backdoor in place. Read the names carefully.' },
        { id: 'leave', label: 'Leave it — removing admins mid-round could break something', result: 'No change.', why: 'An undocumented Domain Admin created days before the round is the definition of what you must remove. The danger is leaving it.' },
      ],
    },
    {
      id: 'web-shell',
      host: 'web01',
      ip: '10.10.10.20',
      title: 'Unknown file and cron job left by a prior intrusion',
      severity: 'High',
      category: 'Backdoor / persistence',
      evidence: 'An unfamiliar .php file sits in wp-content/uploads (uploads should never contain executable PHP), and root\'s crontab runs it every 10 minutes. Neither is part of WordPress.',
      teach: 'Persistence left by an earlier breach must be removed AND the way it got there closed, or it simply comes back. This is defender clean-up, not attacking.',
      exploitable: true,
      compromiseImpact: 'The cron re-opens the attacker\'s access every 10 minutes regardless of your other fixes.',
      compromisePenalty: 45,
      persistence: 'Cron-based re-entry every 10 minutes.',
      actions: [
        { id: 'remove-both', label: 'Remove the file and the cron entry, then block PHP execution in the uploads directory', result: 'The backdoor and its trigger are gone, and uploads can no longer run code.', fixes: true, why: 'Right. Remove the persistence (file + cron) and close the hole that allowed it, so it cannot simply reappear.' },
        { id: 'delete-file', label: 'Delete the .php file only', result: 'The file is gone, but the cron job recreates it on the next run.', misfix: true, why: 'Removing the payload without its trigger means the cron re-drops it in minutes. Pull both, and close the upload path.' },
        { id: 'chmod', label: 'Remove read permissions from the file', result: 'Permissions changed; the cron still runs as root and can reset them.', misfix: true, why: 'A root-owned cron ignores your permission tweak. Remove the cron, not just the file\'s mode.' },
        { id: 'leave', label: 'Leave it for the incident responders after the round', result: 'No change.', why: 'This is live persistence during a live round. It re-grants access every 10 minutes — it cannot wait.' },
      ],
    },
    {
      id: 'firewall-anyany',
      host: 'edge-fw',
      ip: '203.0.113.2',
      title: 'Edge firewall allows any-to-any inbound',
      severity: 'Critical',
      category: 'Firewall / exposure',
      evidence: 'The WAN rule set is a single permit any any. Every internal service is reachable from the internet, including MySQL, RDP and SMB.',
      teach: 'Default-deny is the goal — but the order matters more than the goal. Allow the scored ports first, then deny everything else, or you drop all four services with one rule. The scoring engine polls from outside, so every scored service crosses this firewall.',
      exploitable: true,
      compromiseImpact: 'Every exposed internal service (RDP, SMB, MySQL) is reachable from the red team\'s box.',
      compromisePenalty: 50,
      actions: [
        { id: 'allow-then-deny', label: 'Add WAN allow rules for the scored ports (80/443, 53, 25/143/993, and 3306 from the scoring engine\'s address only), THEN set the default inbound policy to deny', result: 'Every scored service is reachable by the scoring engine; everything else is blocked. RDP, SMB and internet-wide MySQL are no longer exposed.', fixes: true, restoresService: ['web01', 'dc01', 'mail01', 'db01'], why: 'Right. Allow-list the services that must survive, then deny the rest — the only safe order. (web01-to-db01 traffic is LAN and never crosses the edge; that restriction lives on db01\'s host firewall.) If a deny-all took everything down, this restores all four.' },
        { id: 'deny-all', label: 'Set the default policy to deny any-any immediately to be safe', result: 'All inbound traffic is dropped — including HTTP, DNS, mail and MySQL. All four scored services go dark at once.', misfix: true, dropsService: ['web01', 'dc01', 'mail01', 'db01'], dropNote: 'Edge firewall set to deny-all with no allow rules; the scoring engine cannot reach the scored ports.', why: 'The textbook CCDC self-inflicted wound. Deny-all with no allow rules first takes down everything you are scored on. Allow first, deny last.' },
        { id: 'block-mysql-only', label: 'Add one rule to block MySQL from the internet and leave the rest any-any', result: 'MySQL is no longer internet-exposed, but RDP, SMB and everything else still are.', misfix: true, why: 'A single block rule on an any-any base leaves the whole rest of the attack surface open. You need default-deny with an allow-list, not one-off blocks.' },
        { id: 'leave', label: 'Leave it — the internal network is trusted', result: 'No change.', why: 'An any-any WAN rule means the "internal" network is reachable from the entire internet. It is the widest hole on the scoreboard.' },
      ],
    },
    {
      id: 'mail-open-relay',
      host: 'mail01',
      ip: '10.10.10.30',
      title: 'Postfix is configured as an open relay',
      severity: 'High',
      category: 'Service misconfiguration',
      evidence: 'mynetworks = 0.0.0.0/0 — the mail server will relay mail for anyone on the internet, authenticated or not.',
      teach: 'An open relay gets you blocklisted and used for spam. Lock relaying to your own network and authenticated users — without breaking legitimate send/receive, which is what you are scored on.',
      exploitable: true,
      compromiseImpact: 'Red team relays spam through your server; the domain gets blocklisted.',
      compromisePenalty: 35,
      actions: [
        { id: 'restrict', label: 'Set mynetworks to the LAN and require authentication (SASL) for anything else', result: 'Local and authenticated users still send and receive; open relaying is refused.', fixes: true, restoresService: ['mail01'], why: 'Right. Relaying is scoped to your own hosts and authenticated users, which closes the abuse without touching the scored send/receive path.' },
        { id: 'block-25', label: 'Firewall off port 25 entirely', result: 'No mail can be delivered to or from the server — the SMTP score check fails.', misfix: true, dropsService: ['mail01'], dropNote: 'Port 25 blocked; SMTP delivery and the scored check both fail.', why: 'Trap. Closing the mail port stops the abuse and the service you are scored on. Fix the relay config, do not kill the port.' },
        { id: 'leave', label: 'Leave it — mail still works', result: 'No change.', why: 'It "works" for the whole internet. An open relay is active abuse surface and a reputation risk.' },
      ],
    },
    {
      id: 'shared-local-admin',
      host: 'ws01',
      ip: '10.10.10.50',
      title: 'One shared local-admin password reused on every box — including the scored service account',
      severity: 'High',
      category: 'Default credentials / change control',
      evidence: 'Every workstation and server shares the local admin password "Winter2026". The scoring engine\'s authenticated MySQL check logs in as a dedicated account, ccdc-scorecheck, which uses the same password.',
      teach: 'Reused admin passwords let one cracked box unlock them all. Rotate every one — but the scored service account is special: change it without a Change Request and the scoring engine locks out, and you lose uptime you are actually serving.',
      exploitable: true,
      compromiseImpact: 'One cracked hash unlocks local admin on every machine via password reuse.',
      compromisePenalty: 50,
      actions: [
        { id: 'rotate-pcr', label: 'Rotate every admin password to a unique value, and file a Change Request before touching ccdc-scorecheck so scoring is not interrupted', result: 'Each box has a unique admin password; the scored account is changed under an approved PCR with the new credential handed to the scoring team.', fixes: true, restoresService: ['db01'], why: 'Right. Kill the password reuse everywhere, and treat the scored account as change-controlled so you do not blind the scoring engine.' },
        { id: 'rotate-all-nopcr', label: 'Rotate every admin password including ccdc-scorecheck immediately, no paperwork', result: 'Reuse is gone — but the scoring engine still has the old ccdc-scorecheck password and can no longer log in to check your services. Scoring stalls.', misfix: true, dropsService: ['db01'], dropNote: 'ccdc-scorecheck changed with no Change Request; the scoring engine\'s MySQL check can no longer log in.', why: 'Trap. Rotating the scored account without a PCR stops the scoring engine from logging in. You were serving the service but stopped getting credit. File the PCR first.' },
        { id: 'one-box', label: 'Change only ws01\'s password', result: 'ws01 is unique; every server still shares "Winter2026".', misfix: true, why: 'The reuse is the problem, and it spans every box. Fixing one machine leaves the shared password live on the servers.' },
        { id: 'leave', label: 'Leave it — the password is fairly long', result: 'No change.', why: 'Length does not help when the same password is on every host and already known. Reuse is the risk, not entropy.' },
      ],
    },
    {
      id: 'smbv1-dc',
      host: 'dc01',
      ip: '10.10.10.10',
      title: 'SMBv1 enabled on the domain controller',
      severity: 'High',
      category: 'Unpatched / legacy protocol',
      evidence: 'SMBv1 is enabled on dc01 (Get-SmbServerConfiguration shows EnableSMB1Protocol = True) — the protocol family behind EternalBlue-class worms. No current client needs it.',
      teach: 'Turn off the dangerous legacy protocol — but do NOT trigger a reboot of the DC mid-round, because DNS lives on it and a restart drops the scored service. Know which change needs a reboot: switching the SMB1 server protocol off does not; uninstalling the SMB1 Windows feature does.',
      exploitable: true,
      compromiseImpact: 'Red team uses an SMBv1 exploit to run code on the DC.',
      compromisePenalty: 45,
      dropsOnCompromise: 'dc01',
      actions: [
        { id: 'disable-feature', label: 'Disable the SMBv1 server protocol now (Set-SmbServerConfiguration -EnableSMB1Protocol $false, no reboot needed), and schedule removal of the SMB1 Windows feature, which does need a reboot, for a maintenance window', result: 'The DC stops accepting SMBv1 immediately; DNS keeps serving the whole time. Feature removal and its restart are on the change calendar for after the round.', fixes: true, restoresService: ['dc01'], why: 'Right. The protocol switch closes the hole with no restart; uninstalling the feature needs a reboot, so it waits for a maintenance window. If an earlier reboot took DNS down, this gets the DC back serving with SMBv1 off.' },
        { id: 'full-update-reboot', label: 'Run all pending Windows Updates and reboot the DC now to be fully patched', result: 'The DC reboots for several minutes. DNS is down for the entire restart — the scored service check fails repeatedly.', misfix: true, dropsService: ['dc01'], dropNote: 'DC rebooted mid-round for a full update; DNS was down throughout.', why: 'Trap. A full update-and-reboot of the DC takes DNS offline for the whole reboot. Disable the specific feature now; save reboots for a planned window.' },
        { id: 'firewall-445', label: 'Block port 445 at the host firewall on the DC', result: 'SMB is blocked on the DC — including the file sharing domain clients rely on; logons and GPO start failing.', misfix: true, why: 'Blocking 445 outright on a DC breaks domain file sharing and policy. Disable the legacy SMBv1 dialect specifically instead.' },
        { id: 'leave', label: 'Leave it — nobody is using SMBv1', result: 'No change.', why: 'Nobody legitimate is using it, which is exactly why you can safely remove it. Left enabled, it is a worm highway.' },
      ],
    },
  ],

  injects: [
    {
      id: 'inv-memo',
      title: 'Inject 1 — Asset inventory memo',
      from: 'Operations Manager',
      points: 25,
      prompt: 'Management has no idea what is on the network. Reply with an asset inventory they can hand to the auditor by noon.',
      choices: [
        { id: 'table', label: 'A table: each host with its IP, OS, role and the service it provides', correct: true, feedback: 'Exactly what an inventory is. An auditor can act on it and you now have the map you need for the rest of the round.' },
        { id: 'vague', label: '"We have a few servers and some PCs, all patched."', partial: 0.2, feedback: 'Too vague to be an inventory and not even accurate. An inject is scored on a usable, specific deliverable.' },
        { id: 'ignore', label: 'Skip it — defending is more important than paperwork', partial: 0, feedback: 'Injects are worth real points and signal business competence to the judges. Skipping them is leaving the score on the table.' },
      ],
    },
    {
      id: 'new-user',
      title: 'Inject 2 — New hire account (least privilege)',
      from: 'HR',
      points: 25,
      prompt: 'A new accounting clerk starts today. Create their account with the access they need — nothing more.',
      choices: [
        { id: 'standard', label: 'A standard domain user, added only to the Accounting group that owns the shared folder they need', correct: true, feedback: 'Least privilege done right: the access the role needs, nothing extra. This is what the judges are checking for.' },
        { id: 'domain-admin', label: 'A Domain Admin, so they never get blocked on anything', correct: false, partial: 0, feedback: 'Making a clerk a Domain Admin is the opposite of least privilege and hands the red team another high-value target. Never do this.' },
        { id: 'local-admin-all', label: 'Local admin on every machine, to keep it simple', correct: false, partial: 0, feedback: 'Local admin everywhere is excessive and spreads credential-reuse risk. Scope access to the one group the role needs.' },
      ],
    },
    {
      id: 'vendor-ftp',
      title: 'Inject 3 — Vendor file-transfer request',
      from: 'Vendor (Northgate Logistics)',
      points: 25,
      prompt: 'A partner asks you to "open FTP, port 21, to the internet" so they can drop manifest files to you.',
      choices: [
        { id: 'sftp', label: 'Offer SFTP (port 22) to a scoped, dedicated account instead, and explain why', correct: true, feedback: 'Right. You met the business need with an encrypted, scoped alternative rather than exposing plaintext FTP to the world. Judges reward the secure "yes, but".' },
        { id: 'open-ftp', label: 'Open plaintext FTP any-any on the firewall as asked', correct: false, partial: 0, feedback: 'Plaintext FTP exposed to the internet sends credentials in the clear and adds attack surface. The request can be met securely instead.' },
        { id: 'refuse', label: 'Refuse outright with no alternative', correct: false, partial: 0.4, feedback: 'Secure, but a flat "no" fails the business. The best answer offers a safe way to meet the real need.' },
      ],
    },
    {
      id: 'incident-report',
      title: 'Inject 4 — Incident report',
      from: 'CEO',
      points: 25,
      prompt: 'You found a backdoor on the web server. The CEO wants a written incident report.',
      choices: [
        { id: 'structured', label: 'A structured report: what was found, when, affected systems, actions taken, and a recommendation', correct: true, feedback: 'This is the deliverable. Scope, timeline, actions and a recommendation are exactly what an incident report (and the judges) need.' },
        { id: 'oneliner', label: '"We got hacked but it\'s fixed now."', correct: false, partial: 0.2, feedback: 'No scope, no timeline, no actions — not a report. Incident writing is a scored skill; give it structure.' },
        { id: 'blame', label: 'A report blaming the previous admin', correct: false, partial: 0, feedback: 'Blame is not analysis. Report facts, impact and remediation, not fault.' },
      ],
    },
    {
      id: 'pcr',
      title: 'Inject 5 — Change request for the scored account',
      from: 'White team (judges)',
      points: 25,
      prompt: 'You need to rotate the ccdc-scorecheck password (it shares the reused admin password). Submit the required change request.',
      choices: [
        { id: 'proper-pcr', label: 'A PCR naming the host, account, the change, the time window, the rollback plan, and the new credential handed to the scoring team', correct: true, feedback: 'Correct. This is how you rotate a scored account without blinding the scoring engine — the detail is the whole point.' },
        { id: 'just-change', label: 'Skip the request and just change the password — paperwork slows you down', correct: false, partial: 0, feedback: 'Changing the scored account with no PCR locks the scoring engine out and costs you uptime you were actually serving. The PCR is what keeps the credit flowing.' },
        { id: 'change-no-cred', label: 'File a PCR but don\'t include the new password', correct: false, partial: 0.4, feedback: 'Close — but if the scoring team never gets the new credential, the engine still cannot log in. Include the handoff.' },
      ],
    },
  ],
};

export default CCDC_SCENARIO;
