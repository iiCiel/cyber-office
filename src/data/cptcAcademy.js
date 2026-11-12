// The offensive Learn-mode curriculum: a coach beside the Kali desktop that teaches the penetration-test
// methodology step by step, each step run in the real terminal and checked against the engine. Framed for CPTC
// (the collegiate offensive competition) and any sanctioned red-team event; everything is simulated, nothing runs.
//
// Step fields:
//   say        what to know, in plain words
//   type       the exact command to run        parts [[piece, meaning]]     look  what to read in the output
//   discovers  the finding id this command confirms (done = it is in the report)
//   match      RegExp the typed line must match (for drills); default: the command ran
//   done(c)    custom check. c = { st, ran(want), found(id), rated(id), lastOut() }
//   ask        { q, a:RegExp|(st)=>RegExp, sample, why, seen? }   seen: the answer must appear in the last output
//   rate       { finding }   the player sets likelihood x impact to match the reference
//   write      { finding?, exec?, pass? }   graded against the finding's rubric or the exec rubric
//   drill      hide the command until "Show me"      after  shown once the step is complete
//   sc         which client this lesson uses: 'meridian' | 'atlas' | 'lakeshore' (default meridian)

const M = 'meridian'; const A = 'atlas'; const L = 'lakeshore';

export const LESSONS = [
  {
    id: 'what', title: 'What an offensive competition is', mins: 8, sc: M,
    steps: [
      { say: 'In an offensive competition you are the attacker, hired to break into a company and then tell them how. CPTC, the Collegiate Penetration Testing Competition, is the main one. Some schools also run red-versus-blue events where you play the attacking side.\n\nThe twist that catches people: you do not win by getting the most shells. You win on the REPORT. The best team finds the real problems, rates them honestly, and writes fixes a business can act on.' },
      { say: 'How the scoring splits, CPTC-style:\n\nCoverage: did you actually find each weakness. About a third.\nRisk rating: did you rate each one correctly. About a third.\nRemediation: do your fixes name the right controls.\nExecutive summary: can a non-technical board act on it.\n\nSo a team that pops every box but writes a weak report loses to a team that found a bit less and wrote it up like professionals.' },
      { say: 'The people and the frame:\n\nYou are an outside assessment team under contract.\nThe client gives you a Rules of Engagement letter: what you may touch, and what you may not.\nWhite team / judges watch and score.\nThere may be a mock client you brief at the end.\n\nYou act like a real consultant: in scope, careful with data, professional in writing.' },
      { ask: { q: 'What decides the winner: number of shells, or the report?', a: /report/i, sample: 'the report', why: 'Coverage, ratings, remediation and the summary are the score.' } },
      { ask: { q: 'You get domain admin in the first ten minutes. Are you basically done? (yes or no)', a: /^n/i, sample: 'no', why: 'You still have to find the rest, rate everything, and write it all up well.' } },
    ],
  },
  {
    id: 'method', title: 'The method: the phases of a test', mins: 10, sc: M,
    steps: [
      { say: 'Every engagement follows the same shape. Learn it and you always know what to do next.\n\n1. Recon: map what exists. Hosts, ports, services.\n2. Enumeration: dig into each service. Versions, logins, files, endpoints.\n3. Exploitation: prove a weakness is real, with the least force needed.\n4. Post-exploitation: from a foothold, find what it reaches. Loot, credentials, lateral movement.\n5. Reporting: write up everything you confirmed.\n\nMost beginners rush to step 3 and miss findings. The points are in careful enumeration.' },
      { say: 'Two rules that separate professionals from script kiddies:\n\nProve, do not destroy. Show a weakness with the smallest action that confirms it. You do not need to encrypt their files to prove ransomware risk.\n\nWrite as you go. Keep notes with the command, the output, the host, and the time, for every finding. The report is built from notes, and you will not remember at 4pm what you did at 10am.' },
      { say: 'This simulator gives you a Kali Linux desktop: a terminal, a notes window, and the report. You type the real tools, and realistic output comes back. Nothing is executed anywhere. The point is the method and the write-up, which carry to any target on the day.' },
      { ask: { q: 'Which phase do beginners skip, losing the most findings?', a: /enum/i, sample: 'enumeration', why: 'Careful enumeration of every service is where coverage points live.' } },
      { ask: { q: 'You confirmed SQL injection. Do you dump the whole patient database to prove it? (yes or no)', a: /^n/i, sample: 'no', why: 'Prove, do not destroy. Minimal, redacted proof only.' } },
    ],
  },
  {
    id: 'roe', title: 'Scope and rules of engagement', mins: 8, sc: M,
    steps: [
      { say: 'Before you touch anything, read the Rules of Engagement. Going out of scope can disqualify you, exactly like the defensive side has its own hard rules.\n\nTypical limits: which IP ranges and domains are in bounds, which are off limits, no attacking the competition infrastructure, no real data exfiltration, and sometimes no denial of service.' },
      { open: 'term', say: 'The scope is one command away in the terminal at any time.', type: 'scope', done: (c) => c.ran(/scope/), look: 'Read every line. In scope, out of scope, and the rules.' },
      { ask: { q: 'From the scope: are the clinical / medical devices in bounds here? (yes or no)', a: /^n/i, sample: 'no', seen: true, why: 'Out of scope. Touching medical devices could be dangerous and is off limits.' } },
      { say: 'Data handling matters for your grade and your professionalism. If you find patient records or card data, you take the smallest possible proof: a redacted screenshot, a count of rows, one masked record. Never pull the whole dataset. The report says what you could have reached, not a copy of it.' },
      { ask: { q: 'Social engineering: the letter allows email phishing but forbids what?', a: /(phone|in.?person|call|physical)/i, sample: 'phone / in-person', why: 'Read the method restrictions. Here, phone and in-person are out.' } },
    ],
  },
  {
    id: 'recon', title: 'Recon: mapping the target', mins: 12, sc: M,
    steps: [
      { say: 'Recon answers one question: what is here? You cannot test what you have not found. The main tool is nmap, which finds live hosts and open ports.' },
      { open: 'term', type: 'nmap -sV 198.51.100.0/24', parts: [['nmap', 'the port scanner'], ['-sV', 'identify the service and version on each port'], ['198.51.100.0/24', 'the external range from the scope']], done: (c) => c.ran(/nmap/), look: 'Three hosts are up. RDP on one, HTTPS on two. Note each one.' },
      { ask: { q: 'Which port is open on the edge host 198.51.100.20?', a: /3389/, sample: '3389', seen: true, why: '3389 is RDP, Remote Desktop. Exposed to the internet, that is a headline finding.' } },
      { say: 'Read nmap output like a map. Each open port is a door to enumerate. The version is a lead: an old version may have a known exploit. The scan even hints at what to try next.\n\nFlags worth knowing:\n-sV service and version\n-p 80,443 or -p- specific ports or all 65535\n-sC run the default safe scripts\n-Pn skip the ping, treat the host as up\n-oN file save the output' },
      { say: 'Then move inside. Many engagements have an internal range you reach after a foothold or over VPN.', type: 'nmap 10.20.0.0/16', done: (c) => c.ran(/nmap.*10\.20/), look: 'A file server on 445 (SMB) and a printer VLAN on 161 (SNMP). Two more things to enumerate.' },
      { ask: { q: 'The internal scan reveals a Windows domain. What is the IP of the domain controller?', a: /10\.20\.0\.10/, sample: '10.20.0.10', seen: true, why: 'A domain controller (ports 53, 88, 389) is the heart of a Windows network. The file server on 10.20.0.15 is next.' } },
      { drill: true, say: 'On your own, no command given: scan the internal printer VLAN host 10.20.0.40. Use nmap.', type: 'nmap -sV 10.20.0.40', match: /nmap.*10\.20\.0\.40/, done: (c) => c.ran(/nmap.*10\.20\.0\.40/), after: 'Recon is a loop: scan, read, enumerate what you found, repeat.' },
    ],
  },
  {
    id: 'web-sqli', title: 'Web: SQL injection', mins: 14, sc: M,
    steps: [
      { say: 'Web apps are where most findings live. The patient portal is on 198.51.100.25. Start by looking at it, then test the login for SQL injection: user input that reaches the database as code.' },
      { open: 'term', say: 'A quick manual probe first. A single quote often breaks a vulnerable query.', type: `curl "https://portal.meridian.example/login" --data "user=admin'&pass=x"`, discovers: 'sql-injection', done: (c) => c.found('sql-injection'), look: 'A database error leaking from the page is the classic tell.' },
      { ask: { q: 'What database error function shows the input reached the query?', a: /mysqli|sql|syntax/i, sample: 'mysqli', seen: true, why: 'The raw SQL error means your quote changed the query. That is injection.' } },
      { say: 'sqlmap automates the proof and is the standard tool. Point it at the request and the parameter.', type: 'sqlmap -u https://portal.meridian.example/login --data=user=admin --batch', parts: [['sqlmap', 'automatic SQL injection tool'], ['-u URL', 'the target'], ['--data', 'the POST body, with the parameter to test'], ['--batch', 'take the default answers, do not prompt']], done: (c) => c.found('sql-injection'), look: 'It confirms the parameter is injectable and names the database.' },
      { ask: { q: 'Which POST parameter did sqlmap confirm as vulnerable?', a: /user/i, sample: 'user', seen: true, why: 'Name the exact parameter in your report. Specifics are what judges reward.' } },
      { say: 'Prove, do not destroy. You can show the database type and that you could read a table. You do NOT dump every patient. One redacted record, or a row count, is proof enough and keeps you professional.\n\nThe real fix, which you will write later, is parameterized queries, not a web firewall bolted in front.' },
      { rate: { finding: 'sql-injection' }, say: 'Rate it. SQL injection in a login that fronts patient data: how likely is it to be exploited, and how bad if it is? Set likelihood and impact below, and match the reference.' },
    ],
  },
  {
    id: 'external', title: 'Exposed services: RDP', mins: 10, sc: M,
    steps: [
      { say: 'Remote Desktop (RDP, port 3389) open to the internet is the single most common ransomware entry point. You saw it in recon on 198.51.100.20. Confirm it accepts domain logins.' },
      { open: 'term', type: 'xfreerdp /v:198.51.100.20', parts: [['xfreerdp', 'a command-line RDP client'], ['/v:HOST', 'the server to connect to']], discovers: 'ext-rdp', done: (c) => c.found('ext-rdp'), look: 'NLA negotiates, a Windows logon is presented, the domain name leaks.' },
      { ask: { q: 'Which domain name did the RDP handshake reveal?', a: /meridian/i, sample: 'MERIDIAN', seen: true, why: 'It confirms this is a domain-joined server accepting domain credentials from the internet.' } },
      { say: 'You do not need to guess a password to prove the finding. The exposure itself is the finding: domain RDP reachable from the internet, no VPN, no MFA. One phished password and an attacker is inside.\n\nIf the engagement allowed it and you had a credential, you would show a single successful login as proof, then stop.' },
      { rate: { finding: 'ext-rdp' }, say: 'Rate it. Internet-facing RDP into a healthcare domain.' },
    ],
  },
  {
    id: 'smb-snmp', title: 'Network services: SMB and SNMP', mins: 12, sc: M,
    steps: [
      { say: 'Internal services leak more than people expect. Two classics: open SMB file shares, and devices that still answer to the default SNMP community string "public".' },
      { open: 'term', say: 'List the shares on the file server. -N tries a null session, no password.', type: 'smbclient -L //10.20.0.15 -N', parts: [['smbclient', 'SMB client'], ['-L //HOST', 'list shares'], ['-N', 'no password (null session)']], discovers: 'smb-share', done: (c) => c.found('smb-share'), look: 'A readable share, and inside it a very sensitive file.' },
      { ask: { q: 'What sensitive file is in the open share?', a: /salar|staff_salaries|payroll|xlsx/i, sample: 'staff_salaries_2026.xlsx', seen: true, why: 'Staff salaries and SSNs readable by any domain user. Note the exact filename as evidence.' } },
      { say: 'Now SNMP. Devices like printers and switches often answer to "public", which leaks configuration and sometimes credentials.', type: 'snmpwalk -v2c -c public 10.20.0.40', parts: [['snmpwalk', 'read SNMP data'], ['-v2c', 'SNMP version 2c'], ['-c public', 'the community string, like a password'], ['10.20.0.40', 'the device']], discovers: 'default-snmp', done: (c) => c.found('default-snmp'), look: 'Device details come back, which means the default community still works.' },
      { ask: { q: 'SNMP leaked the device details. What hardware did it reveal (first word)?', a: /\bhp\b|ethernet|jetdirect/i, sample: 'HP', seen: true, why: 'The default "public" community you supplied returned the device model and config. It should be changed or SNMP disabled.' } },
      { rate: { finding: 'smb-share' }, say: 'Rate the open HR share.' },
    ],
  },
  {
    id: 'tls-discipline', title: 'Rating honestly: the weak-TLS trap', mins: 10, sc: M,
    steps: [
      { say: 'Not every finding is a crisis. The marketing site accepts old TLS 1.0. Real, worth reporting, but it hosts no logins and no patient data. Finding it is easy. The skill is rating it honestly.' },
      { open: 'term', type: 'sslscan www.meridian.example', parts: [['sslscan', 'checks which TLS versions and ciphers a site accepts']], discovers: 'weak-tls', done: (c) => c.found('weak-tls'), look: 'TLS 1.0 is accepted on the brochure site.' },
      { say: 'Here is the trap. Beginners mark everything High to look impressive. Judges punish inflated ratings, because a report that cries wolf on a brochure site is useless for prioritising. A weak cipher on a site with no sensitive data is genuinely Low.\n\nRate by two questions: how likely is real exploitation, and how bad is the outcome. Low likelihood of harm and low impact is a Low. Own that.' },
      { rate: { finding: 'weak-tls' }, say: 'Rate it. Be honest: old TLS, no data, public brochure site.' },
      { ask: { q: 'Why not rate every finding High to look thorough?', a: /(prior|inflat|cry wolf|punish|honest|trust|credib|useless)/i, sample: 'it destroys trust and priority', why: 'Inflated ratings lose points and make the report useless for deciding what to fix first.' } },
    ],
  },
  {
    id: 'matrix', title: 'The risk matrix', mins: 10, sc: M,
    steps: [
      { say: 'Severity comes from a grid: likelihood across, impact down. This is the CPTC matrix, and judges rate against it, so learn it.\n\nLikelihood: how easy and probable is exploitation. Default creds reachable from the internet are High. An attack needing rare conditions is Low.\n\nImpact: how bad if it happens. Full patient-data breach or domain takeover is High. A little information leak is Low.' },
      { say: 'The combinations:\n\nHigh likelihood + High impact = Critical\nHigh + Medium, or Medium + High = High\nMedium + Medium, or Low + High, or High + Low = Medium\neverything else = Low\n\nSo severity is not one slider. A High-impact issue that is hard to exploit is still only Medium. Say why you chose each, in one line, in the report.' },
      { ask: { q: 'High likelihood and High impact gives which severity?', a: /crit/i, sample: 'Critical', why: 'The top-right corner.' } },
      { ask: { q: 'Low likelihood but High impact gives which severity?', a: /medium/i, sample: 'Medium', why: 'A severe outcome that is hard to trigger lands in the middle.' } },
      { ask: { q: 'Medium likelihood and Medium impact?', a: /medium/i, sample: 'Medium', why: 'The centre of the grid.' } },
    ],
  },
  {
    id: 'remediation', title: 'Writing remediations that score', mins: 14, sc: M,
    steps: [
      { say: 'A remediation must name the control that fixes the ROOT CAUSE, not a bandage. Judges grade against the specific controls each finding needs, and they subtract points for naming a wrong one.\n\nThe classic wrong answers:\nSQL injection: "add a web application firewall" or "filter bad characters". The fix is parameterized queries.\nRDP exposed: "move it to a different port". Obscurity is not a control; take it off the internet and put it behind a VPN with MFA.' },
      { write: { finding: 'ext-rdp', pass: 0.6 }, say: 'Write the fix for the internet-facing RDP. Name the real controls. Think: take it off the internet, put remote access behind a VPN or gateway, require MFA. The coach grades it and tells you what is missing.' },
      { write: { finding: 'sql-injection', pass: 0.6 }, say: 'Now the SQL injection fix. Root cause, not a firewall. Think parameterized queries / prepared statements, least-privilege database account, and validate input.' },
      { say: 'A good remediation is specific, names controls, and is proportionate. Do not tell a client to rebuild their whole website to change one TLS setting. Match the effort to the risk. That proportion is itself graded.' },
      { ask: { q: 'The right fix for SQL injection is a web firewall. True or false?', a: /false/i, sample: 'false', why: 'A WAF is defense in depth at best. The fix is parameterized queries.' } },
    ],
  },
  {
    id: 'exec', title: 'The executive summary', mins: 12, sc: M,
    steps: [
      { say: 'The first page is for executives who will never read the technical detail. It decides whether they fund the fixes. Judges grade it on what a board needs, and they subtract points for jargon the board cannot act on: port numbers, CVE ids, CVSS scores.\n\nWhat it needs:\nThe business risk in plain language.\nThe one or two worst issues, by name, in words.\nA timeframe to act.\nWhat improves once fixed.' },
      { write: { exec: true, pass: 0.8 }, say: 'Write the executive summary for Meridian. Lead with the business risk, a patient-data breach or ransomware. Name the two criticals in plain words: the internet-facing Remote Desktop and the portal SQL injection. Give a timeframe. Say what gets better once fixed. No ports, no CVEs. The coach grades it.' },
      { say: 'A board remembers one sentence. Make it: "The hospital is at elevated risk of a patient-data breach from two issues we can close this week." Then back it up. That is what wins the engagement.' },
      { ask: { q: 'Should the executive summary include CVSS scores and port numbers?', a: /^n|no|false/i, sample: 'no', why: 'Those belong in the technical findings. The summary is plain business language.' } },
    ],
  },
  {
    id: 'cloud', title: 'Cloud: open buckets and secrets', mins: 12, sc: A,
    steps: [
      { say: 'This engagement is a credit union, Atlas. Modern companies leak through cloud storage and exposed developer files. These are the findings that make headlines.\n\nAn S3 bucket set to public lets anyone read it with no login.' },
      { open: 'term', type: 'aws s3 ls s3://atlas-statements-prod --no-sign-request', parts: [['aws s3 ls', 'list a bucket'], ['--no-sign-request', 'no credentials: tests whether it is public']], discovers: 'open-bucket', done: (c) => c.found('open-bucket'), look: 'If files list with no credentials, the bucket is world-readable.' },
      { ask: { q: 'What kind of documents are in the open bucket?', a: /(loan|statement|member|account)/i, sample: 'loan statements', seen: true, why: 'Customer financial records, readable by anyone who guesses the name.' } },
      { say: 'Developer servers leak secrets too. A .git directory or a .env file left in the web root hands over source code and passwords.', sc: A, type: 'git-dumper http://dev.atlas-cu.example/.git /tmp/atlas', parts: [['git-dumper', 'reconstructs a repo from an exposed .git folder'], ['/tmp/atlas', 'where to save it']], discovers: 'exposed-env', done: (c) => c.found('exposed-env'), look: 'The repo and its .env come back, with credentials inside.' },
      { say: 'Prove, do not destroy applies hard here. You note that the bucket is public and what classes of file it holds, with one redacted sample at most. You do not download every customer statement. Pulling the whole bucket could itself be the breach.' },
      { rate: { finding: 'open-bucket' }, say: 'Rate the public bucket of loan statements.' },
    ],
  },
  {
    id: 'webauthz', title: 'Broken access control: IDOR', mins: 12, sc: A,
    steps: [
      { say: 'The most common serious web bug today is broken object-level authorization, or IDOR: the app checks that you are logged in, but not that the record you asked for is yours. Change the id in the URL and you read someone else\'s data.' },
      { open: 'term', say: 'Ask the member API for an account that is not yours.', type: 'curl -H "Authorization: Bearer <yours>" https://api.atlas-cu.example/v2/accounts/1002', parts: [['curl', 'make a web request'], ['-H "Authorization: ..."', 'your own valid token'], ['/v2/accounts/1002', 'an account id that is not yours']], discovers: 'api-idor', done: (c) => c.found('api-idor'), look: 'If another member\'s account comes back, authorization is broken.' },
      { ask: { q: 'Changing which part of the request exposed another member\'s data?', a: /(id|account|number|1002|object)/i, sample: 'the account id', why: 'The server trusted the id without checking ownership. That is IDOR.' } },
      { say: 'To prove it safely: request two or three ids that are not yours and show the data differs and is not yours. You do not enumerate every account. A handful is proof; the whole customer base is a breach you caused.\n\nThe fix, for later: enforce authorization on every object, server side, tied to the session, not just authentication.' },
      { rate: { finding: 'api-idor' }, say: 'Rate the IDOR on the member API.' },
      { write: { finding: 'api-idor', pass: 0.5 }, say: 'Write the fix. Root cause: the server must check that the logged-in user owns each record it returns. Object-level authorization on every request, server side.' },
    ],
  },
  {
    id: 'cve', title: 'Known vulnerabilities and default creds', mins: 12, sc: A,
    steps: [
      { say: 'Sometimes the finding is simply an old, unpatched product with a published exploit, or a device still on its default password. Both are fast wins, and both are High likelihood because the work is already done for the attacker.' },
      { open: 'term', say: 'Identify the remote-access gateway, then search for known exploits for its version.', type: 'searchsploit netscaler', parts: [['searchsploit', 'offline search of the Exploit-DB database'], ['netscaler', 'the product you fingerprinted']], discovers: 'vpn-cve', done: (c) => c.found('vpn-cve'), look: 'A matching remote-code-execution entry means a known, exploitable flaw.' },
      { say: 'You confirm the version matches a known CVE. You do NOT need to fire the exploit and risk crashing their production VPN. Version plus a matching advisory is enough to report, and safer. If the rules allowed a proof and it was non-destructive, you would show the version banner.' },
      { say: 'Default credentials are even simpler. A monitoring dashboard still on admin/admin.', type: 'curl -u admin:admin https://ops.atlas-cu.example/', parts: [['curl -u user:pass', 'try a login'], ['admin:admin', 'the vendor default']], discovers: 'default-creds', done: (c) => c.found('default-creds'), look: 'A successful login with the default password confirms it.' },
      { ask: { q: 'Why rate a known-CVE or default-creds finding as High likelihood?', a: /(easy|known|public|exploit|no effort|trivial|already|anyone)/i, sample: 'the exploit is already public', why: 'No skill is needed, so exploitation is highly probable.' } },
      { rate: { finding: 'vpn-cve' }, say: 'Rate the unpatched VPN gateway with a known RCE.' },
    ],
  },
  {
    id: 'rce', title: 'Remote code execution: Jenkins and Tomcat', mins: 14, sc: L,
    steps: [
      { say: 'Lakeshore, a logistics firm, runs developer and server software that hands out code execution when left open. Two classics: an unauthenticated Jenkins Script Console, and Tomcat Manager on default credentials.' },
      { open: 'term', say: 'Check the CI server for an open script console.', type: 'curl http://ci.lakeshore-freight.example/script', parts: [['curl', 'request a page'], ['/script', 'the Jenkins Groovy script console: runs code as the server']], discovers: 'jenkins-script-console', done: (c) => c.found('jenkins-script-console'), look: 'If it answers without a login, anyone can run code on the build server.' },
      { say: 'That is remote code execution, the most severe web finding. Prove it with the smallest thing: run an id or whoami equivalent to show you can execute, capture that one line, and stop. You do not deploy a backdoor.' },
      { say: 'Tomcat Manager lets you upload a web app. On default creds, that is code execution too.', type: 'curl -u tomcat:tomcat http://ops.lakeshore-freight.example/manager/html', parts: [['-u tomcat:tomcat', 'the Tomcat default login'], ['/manager/html', 'the app manager, which can deploy a WAR']], discovers: 'tomcat-default-creds', done: (c) => c.found('tomcat-default-creds'), look: 'Access to the manager means an attacker can upload a WAR and run code.' },
      { ask: { q: 'An open Jenkins script console gives an attacker what?', a: /(rce|code execut|run code|command|shell)/i, sample: 'remote code execution', why: 'Code runs as the Jenkins service account. Rate it Critical.' } },
      { rate: { finding: 'jenkins-script-console' }, say: 'Rate the unauthenticated Jenkins RCE.' },
    ],
  },
  {
    id: 'ad', title: 'Active Directory: roasting and reuse', mins: 16, sc: L,
    steps: [
      { say: 'Inside a Windows network, the attacker\'s road runs through Active Directory. Two techniques win most internal engagements: AS-REP roasting and password reuse.\n\nAS-REP roasting: an account with Kerberos pre-authentication disabled will hand out an encrypted blob you can crack offline, with no login attempt and no lockout.' },
      { open: 'term', type: 'impacket-GetNPUsers lakeshore.local/ -dc-ip 10.30.0.10 -no-pass -usersfile users.txt', parts: [['impacket-GetNPUsers', 'asks the domain controller for AS-REP blobs'], ['-dc-ip', 'the domain controller'], ['-no-pass', 'no credentials needed']], discovers: 'asrep-roast', done: (c) => c.found('asrep-roast'), look: 'A $krb5asrep$ hash means that account is roastable.' },
      { say: 'You crack that hash offline with hashcat, mode 18200, against a wordlist. On the day, cracking a weak service password this way is often your first real credential.', type: 'hashcat -m 18200 asrep.hash rockyou.txt', parts: [['hashcat', 'password cracker'], ['-m 18200', 'the AS-REP hash type'], ['rockyou.txt', 'a common wordlist']], done: (c) => c.ran(/hashcat/), look: 'A cracked password is a foothold credential.' },
      { say: 'Then password reuse. People reuse passwords across accounts and machines. Spray the credential you cracked and see where else it is admin.', type: 'crackmapexec smb 10.30.0.25 -u svc-wms -p <cracked>', parts: [['crackmapexec smb', 'test SMB logins across hosts'], ['-u / -p', 'the username and the password you cracked']], discovers: 'password-reuse-lateral', done: (c) => c.found('password-reuse-lateral'), look: 'A (Pwn3d!) means that credential is local admin there: lateral movement.' },
      { ask: { q: 'What does the (Pwn3d!) marker from crackmapexec mean?', a: /(admin|pwn|local admin|access|owned)/i, sample: 'local admin on that host', why: 'The reused credential gives admin on another machine. That is lateral movement.' } },
      { say: 'Post-exploitation discipline: from that admin access you would look for more credentials and a path to Domain Admin, documenting each hop with the time and the evidence. You prove the chain; you do not ransomware the network to make the point.' },
      { rate: { finding: 'password-reuse-lateral' }, say: 'Rate the password reuse giving local admin and lateral movement.' },
    ],
  },
  {
    id: 'tools', title: 'The Kali toolbox', mins: 8, sc: M,
    steps: [
      { say: 'You do not need hundreds of tools. A dozen cover most of a competition. Know what each one is FOR, so you reach for the right one under pressure.' },
      { say: 'Recon and scanning:\nnmap  hosts, ports, versions, scripts\nmasscan  very fast port sweep of big ranges\n\nWeb:\ngobuster / ffuf / feroxbuster  find hidden paths and files\nnikto / whatweb  quick web server checks\nsqlmap  SQL injection\nburp suite  intercept and tamper with requests, the web tester\'s main tool\nnuclei  templated checks for known issues' },
      { say: 'Network and services:\nsmbclient / smbmap / enum4linux  SMB shares and users\nsnmpwalk  SNMP\nsslscan / testssl.sh  TLS\n\nExploitation and credentials:\nsearchsploit  find known exploits\nmetasploit  exploitation framework\nhydra / medusa  online password guessing\nhashcat / john  offline password cracking\nimpacket, crackmapexec / netexec  Windows and AD\n\nType help in the terminal to see what this simulator understands.' },
      { ask: { q: 'Which tool finds hidden web directories and files?', a: /(gobuster|ffuf|feroxbuster|dirb|dirsearch)/i, sample: 'gobuster or ffuf', why: 'Directory and content discovery.' } },
      { ask: { q: 'Which tool cracks password hashes offline?', a: /(hashcat|john)/i, sample: 'hashcat', why: 'Offline cracking against a wordlist.' } },
      { ask: { q: 'Which tool is the standard for tampering with web requests by hand?', a: /burp/i, sample: 'Burp Suite', why: 'The intercepting proxy every web tester lives in.' } },
    ],
  },
  {
    id: 'reportcraft', title: 'The report, end to end', mins: 12, sc: M,
    steps: [
      { say: 'The deliverable is the report, so treat it as the main event, not an afterthought at 4pm.\n\nStructure:\n1. Executive summary: plain-language risk for the board.\n2. Findings, each with: title, affected system, severity with likelihood and impact, evidence, business impact, and remediation.\n3. Methodology and scope: what you did and within what bounds.\n4. Appendix: the raw evidence.' },
      { say: 'What makes a finding score:\nA clear title a reader understands.\nThe exact system and evidence, copied from your notes, not from memory.\nAn honest severity with one line of reasoning.\nBusiness impact in terms the client cares about, money, data, downtime, regulation.\nA remediation that names the real control.\n\nWrite every finding to the same template. Consistency reads as competence.' },
      { say: 'Practical habits that win:\nAssign findings to writers as you confirm them, so the report grows all engagement.\nWrite the executive summary last, once you know the two worst issues.\nProofread. Spelling and a clean layout change how judges score the same content.\nNever name the competition or your school inside the report; it is addressed to the client.' },
      { ask: { q: 'When should you start writing the report?', a: /(start|begin|through|as you|immediately|all|early|confirm)/i, sample: 'from the start, as you confirm findings', why: 'The report is built from notes taken all engagement, not written at the end.' } },
    ],
  },
  {
    id: 'plan', title: 'Your engagement game plan', mins: 8, sc: M,
    steps: [
      { say: 'With a team and a clock, split the work and follow a plan.\n\nRoles to agree beforehand:\nRecon and scanning, feeding targets to the others.\nWeb testing.\nNetwork and AD.\nA report lead who writes all engagement and owns the summary.\nA captain watching scope, time and the client brief.' },
      { say: 'A sensible order:\n1. Everyone reads the Rules of Engagement. Mark the out-of-scope ranges in red.\n2. Recon the whole scope first. Do not tunnel into the first host you find.\n3. Enumerate every in-scope service before going deep on one.\n4. Confirm findings with minimal proof. Write each up as you go.\n5. Chase chains: a credential here that is admin there.\n6. Last hour: stop testing, finish the report, write the summary, proofread.' },
      { say: 'Communicate. Call out what you are testing so two people do not hammer the same host. Keep one shared notes doc with host, finding, evidence and time. Keep a shared list of credentials found. The report is only as good as those notes.' },
      { say: 'Practice path from here:\n1. Learn mode, all lessons, in order.\n2. Guided engagement on each of the three clients, using the notes hints.\n3. Competition mode, timed, until you clear a client inside the clock.\n4. Take the seat exams.\n\nThe targets on the day will differ. The method and the report craft carry over.' },
    ],
  },
];

export const lessonById = (id) => LESSONS.find((l) => l.id === id);

// Timed, no-hint engagements. `solutions` is used only by the test harness, never shown to the player.
export const EXAMS = [
  { id: 'x-meridian', sc: M, title: 'Meridian engagement', minutes: 18, blurb: 'Healthcare. Five findings. Confirm, rate and remediate every one.',
    findings: ['ext-rdp', 'sql-injection', 'smb-share', 'default-snmp', 'weak-tls'],
    solutions: [['ext-rdp', 'xfreerdp /v:198.51.100.20'], ['sql-injection', 'sqlmap -u https://portal.meridian.example/login --data=user=admin --batch'], ['smb-share', 'smbclient -L //10.20.0.15 -N'], ['default-snmp', 'snmpwalk -v2c -c public 10.20.0.40'], ['weak-tls', 'sslscan www.meridian.example']] },
  { id: 'x-atlas', sc: A, title: 'Atlas engagement', minutes: 20, blurb: 'Fintech. Six findings across cloud, API and web.',
    findings: ['open-bucket', 'api-idor', 'vpn-cve', 'default-creds', 'exposed-env', 'dir-listing'],
    solutions: [['open-bucket', 'aws s3 ls s3://atlas-statements-prod --no-sign-request'], ['api-idor', 'curl https://api.atlas-cu.example/v2/accounts/1002'], ['vpn-cve', 'searchsploit netscaler'], ['default-creds', 'curl -u admin:admin https://ops.atlas-cu.example/'], ['exposed-env', 'git-dumper http://dev.atlas-cu.example/.git /tmp/atlas'], ['dir-listing', 'curl http://assets.atlas-cu.example/']] },
  { id: 'x-lakeshore', sc: L, title: 'Lakeshore engagement', minutes: 22, blurb: 'Logistics. Six findings, including a Windows AD chain.',
    findings: ['jenkins-script-console', 'snmp-public', 'tracking-idor', 'tomcat-default-creds', 'asrep-roast', 'password-reuse-lateral'],
    solutions: [['jenkins-script-console', 'curl http://ci.lakeshore-freight.example/script'], ['snmp-public', 'snmpwalk -v2c -c public 203.0.113.70'], ['tracking-idor', 'curl https://track.lakeshore-freight.example/api/shipments/1001'], ['tomcat-default-creds', 'curl -u tomcat:tomcat http://ops.lakeshore-freight.example/manager/html'], ['asrep-roast', 'impacket-GetNPUsers lakeshore.local/ -dc-ip 10.30.0.10 -no-pass'], ['password-reuse-lateral', 'crackmapexec smb 10.30.0.25 -u svc-wms -p cracked']] },
];

export function examGoals(exam, sc) {
  const byId = Object.fromEntries(sc.findings.map((f) => [f.id, f]));
  const goals = exam.findings.map((id) => ({ text: `Confirmed: ${byId[id].title}`, done: (c) => c.found(id) }));
  goals.push({ text: 'Every finding rated', done: (c) => exam.findings.every((id) => c.rated(id)) });
  goals.push({ text: 'Executive summary written', done: (c) => (c.st.execSummary || '').trim().length >= 40 });
  return goals;
}

// After a graded engagement, what to study, most useful first.
const STUDY = { 'ext-rdp': 'external', 'sql-injection': 'web-sqli', 'smb-share': 'smb-snmp', 'default-snmp': 'smb-snmp', 'weak-tls': 'tls-discipline', 'open-bucket': 'cloud', 'exposed-env': 'cloud', 'dir-listing': 'cloud', 'api-idor': 'webauthz', 'tracking-idor': 'webauthz', 'vpn-cve': 'cve', 'default-creds': 'cve', 'jenkins-script-console': 'rce', 'tomcat-default-creds': 'rce', 'snmp-public': 'smb-snmp', 'asrep-roast': 'ad', 'password-reuse-lateral': 'ad' };

export function studyNext(state, grade) {
  const out = new Map();
  const add = (lesson, why) => { if (!out.has(lesson)) out.set(lesson, why); };
  const missed = state.scenario.findings.filter((f) => !state.discovered[f.id]);
  const groups = {};
  for (const f of missed) if (STUDY[f.id]) (groups[STUDY[f.id]] ||= []).push(f.title);
  for (const [lesson, titles] of Object.entries(groups)) add(lesson, `Not found: ${titles.join('; ')}.`);
  if (grade.risk < 20) add('matrix', 'Several severity ratings were off from the reference matrix.');
  const weakRem = (grade.remRows || []).filter((r) => r.written && r.credit < 0.5);
  if (weakRem.length) add('remediation', `Remediations missed the root-cause control: ${weakRem.map((r) => r.title).join('; ')}.`);
  if (!grade.execOk) add('exec', 'The executive summary missed what a board needs.');
  return [...out.entries()].map(([lesson, why]) => ({ lesson, why }));
}

// Printable one-page cheat sheet. Printed notes are commonly allowed; your own event's rules decide.
export const SHEET = [
  ['Mindset', [
    ['You win on the REPORT', 'coverage + ratings + remediation + summary'],
    ['Prove, do not destroy', 'minimal, redacted proof; never dump real data'],
    ['Write as you go', 'host, command, output, time — for every finding'],
    ['Stay in scope', 'read the RoE; out-of-scope = disqualification'],
    ['Rate honestly', 'inflated severities lose points'],
  ]],
  ['Phases', [['1 Recon', 'what exists (nmap)'], ['2 Enumerate', 'dig into each service'], ['3 Exploit', 'prove with least force'], ['4 Post-exploit', 'loot, creds, lateral'], ['5 Report', 'write up everything confirmed']]],
  ['Recon', [['nmap -sV RANGE', 'hosts, ports, versions'], ['nmap -p- HOST', 'all 65535 ports'], ['nmap -sC HOST', 'default safe scripts'], ['nmap -Pn HOST', 'skip ping'], ['masscan', 'fast sweep of big ranges']]],
  ['Web', [['gobuster/ffuf/feroxbuster', 'hidden paths and files'], ['whatweb / nikto', 'server + quick checks'], ['sqlmap -u URL --data=P', 'SQL injection'], ['Burp Suite', 'intercept and tamper'], ['nuclei', 'templated known-issue checks'], ['curl /v2/accounts/<id>', 'IDOR: change the id'], ['git-dumper URL/.git', 'exposed repo and .env']]],
  ['Network / services', [['smbclient -L //HOST -N', 'SMB shares, null session'], ['smbmap / enum4linux', 'shares and users'], ['snmpwalk -v2c -c public HOST', 'default SNMP string'], ['sslscan HOST', 'weak TLS']]],
  ['Exploit / creds', [['searchsploit NAME', 'known exploits'], ['curl -u admin:admin URL', 'default creds'], ['hydra / medusa', 'online password guessing'], ['hashcat -m 18200 f wl', 'crack AS-REP offline'], ['metasploit', 'exploit framework']]],
  ['Active Directory', [['impacket-GetNPUsers -no-pass', 'AS-REP roast'], ['hashcat -m 18200', 'crack the AS-REP hash'], ['crackmapexec smb HOST -u U -p P', 'spray; (Pwn3d!) = local admin'], ['impacket-secretsdump', 'dump hashes once admin'], ['Reuse the credential', 'lateral movement']]],
  ['Risk matrix (Likelihood x Impact)', [['High x High', 'Critical'], ['High x Med / Med x High', 'High'], ['Med x Med / Low x High / High x Low', 'Medium'], ['everything else', 'Low'], ['Likelihood', 'how easy / probable'], ['Impact', 'how bad if it happens']]],
  ['Remediation: root cause', [['SQL injection', 'parameterized queries, NOT a WAF alone'], ['RDP exposed', 'off the internet, VPN + MFA, NOT a new port'], ['IDOR', 'server-side object authorization'], ['Default creds', 'change them; disable unused accounts'], ['Known CVE', 'patch / upgrade the product'], ['Open bucket', 'make private; least privilege']]],
  ['Executive summary', [['Plain business risk', 'breach, ransomware, data, downtime'], ['Name the 1-2 worst', 'in words, not jargon'], ['A timeframe', 'e.g. within 72 hours'], ['What improves once fixed', ''], ['NO', 'ports, CVE ids, CVSS']]],
];

export function sheetHtml() {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const body = SHEET.map(([t, rows]) => `<section><h2>${esc(t)}</h2><table>${rows.map(([a, b]) => `<tr><td class="c">${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table></section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Offensive reference sheet</title><style>
@page { size: letter; margin: 0.4in; }
body { font: 9.5px/1.25 Arial, Helvetica, sans-serif; color: #000; margin: 0; columns: 2; column-gap: 0.25in; }
h1 { font-size: 13px; margin: 0 0 4px; column-span: all; }
section { break-inside: avoid; margin-bottom: 8px; }
h2 { font-size: 10.5px; margin: 0 0 2px; padding: 1px 3px; background: #000; color: #fff; }
table { border-collapse: collapse; width: 100%; }
td { padding: 1px 3px; border-bottom: 1px solid #bbb; vertical-align: top; }
td.c { font-family: Consolas, 'DejaVu Sans Mono', monospace; font-size: 8.8px; word-break: break-word; }
</style></head><body><h1>Offensive / CPTC reference sheet (your event's rules override this)</h1>${body}</body></html>`;
}
