// CPTC hands-on target #2: "Atlas Credit Union Services" - a fictional regional fintech that runs online banking
// for small credit unions (SaaS). Same shape as CPTC_LAB (see cptcLabScenario.js): the player TYPES recon and
// exploitation commands in the Kali terminal to discover each weakness, then writes the report. Everything is
// fiction - RFC 5737 (203.0.113.0/24) and *.example (RFC 2606) hosts, canned output, nothing executed.
//
// Each finding carries `discover` (command patterns, matched case-insensitively against the LOWERCASED typed line;
// all patterns in a group must match, any group may match) and `reveal` (canned output). Findings are tried in
// order, so each one is keyed to its own host to keep commands from colliding.

export const CPTC_LAB_2 = {
  id: 'atlas-fintech-2026',
  client: 'Atlas Credit Union Services',
  engagement: 'External web, API and cloud penetration test, one week, remote.',
  clockSeconds: 600,
  prompt: 'assessor@kali:~$',
  scope: [
    'In scope: the 203.0.113.0/24 external range, *.atlas-cu.example, and the AWS-style storage account "atlas-prod".',
    'Out of scope: the core-banking mainframe, the card processor, and any third-party SaaS. No denial-of-service and no brute-forcing real member logins.',
    'Objective: find and prove the exploitable weaknesses, then report them. Do NOT download real member data - minimal, redacted proof only (a file listing or one record count).',
    'Rules of engagement: testing windows 08:00-18:00 ET; stop and call the client contact if you see evidence of an existing intruder.',
  ],

  recon: [
    { match: [[/nmap/, /203\.0\.113/]], output: [
      'Starting Nmap 7.94 ( https://nmap.org )',
      'Nmap scan report for vpn.atlas-cu.example (203.0.113.15)',
      '  443/tcp  open  https           <- remote-access gateway login page',
      'Nmap scan report for api.atlas-cu.example (203.0.113.20)',
      '  443/tcp  open  https           <- member mobile/web API (JSON)',
      'Nmap scan report for ops.atlas-cu.example (203.0.113.40)',
      '  443/tcp  open  https           <- monitoring dashboard',
      'Nmap scan report for dev.atlas-cu.example (203.0.113.50)',
      '  80/tcp   open  http            <- staging web server',
      'Nmap scan report for assets.atlas-cu.example (203.0.113.60)',
      '  443/tcp  open  https           <- static assets / brochures',
      'Nmap done: 256 IP addresses (5 hosts up) scanned',
      'Next: look at each host (the VPN gateway, the API, the ops dashboard, the dev server, the assets host) and check for cloud storage.',
    ] },
    { match: ['subfinder', 'amass', [/dig|dnsrecon|fierce|dnsenum/, /atlas-cu/]], output: [
      'DNS enumeration for atlas-cu.example:',
      '  vpn.atlas-cu.example     203.0.113.15',
      '  api.atlas-cu.example     203.0.113.20',
      '  ops.atlas-cu.example     203.0.113.40',
      '  dev.atlas-cu.example     203.0.113.50',
      '  assets.atlas-cu.example  203.0.113.60',
      '  statements.atlas-cu.example  CNAME  atlas-statements-prod.s3.cloud.example',
      'Next: that CNAME points at a storage bucket - see whether it answers without credentials.',
    ] },
    { match: [[/whatweb|wafw00f|httpx/, /atlas-cu|203\.0\.113/]], output: [
      'Fingerprint: api.atlas-cu.example  nginx, JSON REST, JWT bearer auth, paths under /v2/.',
      'Fingerprint: vpn.atlas-cu.example  Citrix-style gateway portal (version string in login page).',
      'Next: dig into each service with a purpose-built tool.',
    ] },
  ],

  findings: [
    {
      id: 'open-bucket', title: 'Cloud storage bucket holding loan statements is publicly readable', system: 'Cloud / atlas-statements-prod',
      category: 'Cloud misconfiguration',
      discover: [
        [/aws|s3cmd|s3scanner|cloud_enum/, /s3|bucket|atlas-statements/],
        [/curl|wget/, /atlas-statements|\.s3\./],
      ],
      reveal: [
        'aws s3 ls s3://atlas-statements-prod --no-sign-request  ->  anonymous listing succeeded.',
        '  PRE 2026/   PRE 2025/   2026-09-30  loan_statements_index.csv   (48 MB)',
        'Bucket ACL grants READ to AllUsers. Object names embed member numbers.',
        'Minimal proof only: listed the top level and the object count; did NOT download any statement.',
      ],
      evidence: 'The statements bucket allows anonymous listing and reads (ACL: AllUsers READ). Thousands of PDF loan statements named by member number are exposed.',
      businessImpact: 'Anyone on the internet can read member financial statements. This is a reportable data breach for every credit union customer and a direct regulatory (GLBA) and reputational event.',
      refLikelihood: 'High', refImpact: 'High',
      remediationRubric: {
        need: [
          { label: 'block public access / remove anonymous (AllUsers) access', re: /(block|disabl|remov|revok|restrict|clos)[^.]{0,40}(public|anonymous|allusers)|public access block|make (the )?bucket private/i },
          { label: 'least-privilege bucket policy / IAM roles', re: /bucket policy|least[- ]privilege|\biam\b/i },
          { label: 'review access logs to assess exposure and notify if needed', re: /audit|access log|cloudtrail|assess|determine|notif|breach/i },
        ],
        wrong: [
          { label: 'encryption does not stop an anonymous read of a public object', re: /encrypt/i, unless: /not|wrong|does ?n.t/i },
          { label: 'renaming the bucket is obscurity, not access control', re: /renam(e|ing)|obscur|unguessable|random(ize)? (the )?name/i },
        ],
      },
      modelRemediation: 'Turn on block-public-access and remove the anonymous grant, apply a least-privilege bucket policy limited to named IAM roles, and review the access logs to determine what was read and whether breach notification is needed. Renaming the bucket is obscurity, not access control.',
    },
    {
      id: 'api-idor', title: "Member API returns any account to any logged-in user (broken object-level authorization)", system: 'API / api.atlas-cu.example',
      category: 'Broken access control (OWASP API1)',
      discover: [
        [/curl|ffuf|httpie|burp|wfuzz/, /api\.atlas-cu|203\.0\.113\.20|\/v2\/accounts/],
        [/curl|ffuf|httpie/, /idor|accounts\/\d/],
      ],
      reveal: [
        'GET /v2/accounts/10043/statements   (token for member 10042)  ->  200 OK.',
        "GET /v2/accounts/10044/statements   ->  200 OK; returned another member's name and balance.",
        'The API checks that the token is valid but never that the account belongs to the caller. IDs are sequential.',
        'Minimal proof only: two test accounts, one record each, redacted.',
      ],
      evidence: "Changing the account number in the URL returns another member's statements; the API validates the token but not ownership. Account IDs are sequential and guessable.",
      businessImpact: "Any registered member can read every other member's financial data by counting upward. It is trivial to automate, so a single curious or malicious user could harvest the entire customer base.",
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
      modelRemediation: 'Enforce object-level authorization server-side on every request - the caller must own the account - and replace sequential IDs with unpredictable UUIDs as defence in depth. Add automated authorization regression tests and monitoring for enumeration. Hiding the endpoint is not a fix.',
    },
    {
      id: 'vpn-cve', title: 'Remote-access gateway runs an outdated build with a known remote-code-execution flaw', system: 'Edge / vpn.atlas-cu.example',
      category: 'Outdated software',
      discover: [
        [/nuclei|nmap|curl|searchsploit|whatweb|nikto/, /vpn\.atlas-cu|203\.0\.113\.15(?!\d)|netscaler|citrix/],
        [/searchsploit/, /netscaler|citrix/],
      ],
      reveal: [
        'nuclei -u https://vpn.atlas-cu.example  ->  [citrix-gateway-version] build 13.0-82.45 (end of support).',
        '[CVE template match] unauthenticated path-traversal / remote code execution - fixed in a later build.',
        'Confirmed with a harmless version-check request only; did NOT run an exploit payload.',
      ],
      evidence: 'The internet-facing remote-access gateway reports a firmware build with a publicly known, actively exploited unauthenticated RCE. Version confirmed from the login page; no exploit was run.',
      businessImpact: 'This is the front door to the internal network, and the flaw is on mass-exploitation lists. A compromise would give an attacker an internal foothold and session tokens for remote staff. Exploiting it needs no password, but it does need tooling and timing.',
      refLikelihood: 'Medium', refImpact: 'High',
      remediationRubric: {
        need: [
          { label: 'patch / upgrade the gateway to the fixed build', re: /patch|upgrade|update[^.]{0,30}(firmware|version|appliance|build|gateway)|fixed (build|release|version)/i },
          { label: 'assume compromise: hunt for indicators, invalidate sessions, rotate credentials', re: /compromise|indicators|\bioc|hunt|rotate|invalidate|reset|session|forensic|review (the )?logs/i },
          { label: 'patch SLA / vulnerability management for internet-facing appliances (and MFA)', re: /\bsla\b|vulnerability management|patch (cadence|management|process|policy)|asset inventory|\bmfa\b|multi-?factor/i },
        ],
        wrong: [
          { label: 'hiding the version banner does not remove the flaw', re: /banner|hide the version|obscur|\bwaf\b/i },
        ],
      },
      modelRemediation: "Patch the gateway to the vendor's fixed build now, treat it as potentially compromised (review logs for indicators of compromise, invalidate active sessions and rotate credentials), and set a patch SLA for internet-facing appliances with MFA enforced. Hiding the version banner is not a fix.",
    },
    {
      id: 'default-creds', title: 'Monitoring dashboard accepts the default admin password', system: 'Web / ops.atlas-cu.example',
      category: 'Default credentials',
      discover: [
        [/curl|hydra|medusa|ffuf|nuclei|httpie|patator/, /ops\.atlas-cu|203\.0\.113\.40(?!\d)/],
      ],
      reveal: [
        'curl -u admin:admin https://ops.atlas-cu.example/api/org  ->  200 OK {"name":"Atlas Ops","role":"Admin"}',
        'Default vendor credentials accepted. The account is a full administrator: dashboards, data sources, API keys.',
        'Logged in once to prove access; changed nothing.',
      ],
      evidence: 'The internet-facing monitoring dashboard accepts the vendor default admin:admin and returns an administrator session with access to data sources and API keys.',
      businessImpact: 'Full admin on the monitoring platform exposes infrastructure topology and stored service credentials, and can be used to blind the security team. Anyone who can reach it can log in.',
      refLikelihood: 'High', refImpact: 'Medium',
      remediationRubric: {
        need: [
          { label: 'change the default password to a unique strong one', re: /(chang|rotat|reset|replac|remov|disabl)[^.]{0,40}(default|admin|password|credential)|unique[^.]{0,20}password/i },
          { label: 'take it off the internet / restrict to VPN or an allow-list', re: /vpn|internal(ly)?|allow-?list|restrict[^.]{0,40}(access|network|ip)|not (be )?(exposed|internet)/i },
          { label: 'put it behind SSO / MFA', re: /\bsso\b|\bmfa\b|multi-?factor|single sign/i },
        ],
        wrong: [
          { label: 'renaming the admin account is obscurity', re: /renam(e|ing) (the )?(admin|account|user)|hidden url|obscur/i },
        ],
      },
      modelRemediation: 'Change the default admin password to a unique strong one, take the dashboard off the internet and restrict it to the VPN or an allow-list, and put it behind SSO with MFA. Renaming the admin account is not a fix.',
    },
    {
      id: 'exposed-env', title: 'Staging server exposes .env and a .git directory', system: 'Web / dev.atlas-cu.example',
      category: 'Information disclosure',
      discover: [
        [/curl|gobuster|ffuf|feroxbuster|git-dumper|dirb|nuclei|wget|dirsearch/, /dev\.atlas-cu|203\.0\.113\.50(?!\d)/],
      ],
      reveal: [
        'curl -s http://dev.atlas-cu.example/.env  ->  200 OK (first lines, secrets masked):',
        '  DB_HOST=db-stg.atlas-cu.example   DB_PASSWORD=Stg-********   JWT_SECRET=********',
        'gobuster: /.git/HEAD [200]  -> repository can be reconstructed.',
        'Did NOT use the credentials; masked the values in the evidence.',
      ],
      evidence: 'The staging web root serves .env (database password and JWT signing secret) and a browsable .git directory. Values were masked in evidence and not used.',
      businessImpact: 'Leaked secrets can allow database access and token forgery if reused in production. Impact is limited to staging unless secrets are shared, which is common.',
      refLikelihood: 'Medium', refImpact: 'Medium',
      remediationRubric: {
        need: [
          { label: 'remove .env/.git from the web root and deny dotfiles', re: /(remov|delet|block|deny|restrict)[^.]{0,40}(\.env|\.git|dotfile|web ?root|file)/i },
          { label: 'rotate every exposed secret', re: /rotat|revoke|reissue|regenerate/i },
          { label: 'deploy from CI/CD with a secrets manager', re: /ci\/cd|pipeline|build artifact|deploy (from|via)|secrets? manager|vault|secret scanning|pre-commit/i },
        ],
        wrong: [
          { label: 'rewriting git history does not un-leak a secret', re: /rewrit(e|ing) (the )?(git )?history|filter-branch|force[- ]push/i },
        ],
      },
      modelRemediation: 'Remove .env and .git from the web root and deny dotfiles at the web server, rotate every secret that was exposed (database password, signing key), and deploy from a CI/CD pipeline with a secrets manager instead of copying the working tree. Rewriting git history does not un-leak a secret.',
    },
    {
      id: 'dir-listing', title: 'Directory listing enabled on the static assets host', system: 'Web / assets.atlas-cu.example',
      category: 'Information disclosure',
      discover: [
        [/curl|gobuster|ffuf|nikto|feroxbuster|nuclei|wget|dirb/, /assets\.atlas-cu|203\.0\.113\.60(?!\d)/],
      ],
      reveal: [
        'curl -s https://assets.atlas-cu.example/files/  ->  "Index of /files/"',
        '  brochure_2024.pdf   rate_sheet_Q3.pdf   old_press_kit.zip',
        'Only public marketing material is listed. No member data, no credentials.',
      ],
      evidence: 'The assets host returns an auto-generated "Index of /files/" page. Everything listed is already-public marketing material.',
      businessImpact: 'Directory indexing aids reconnaissance and can leak stale files, but here it lists only public brochures. Low value to an attacker and no member data is reachable.',
      refLikelihood: 'Low', refImpact: 'Low',
      remediationRubric: {
        need: [
          { label: 'disable directory indexing', re: /(disabl|turn off|remov)[^.]{0,30}(directory|index|listing|autoindex)|autoindex off|-indexes/i },
          { label: 'review and remove stale files', re: /(remov|delet|review|inventor|audit|clean)[^.]{0,40}(file|content|asset|pdf|document|stale)/i },
        ],
        wrong: [
          { label: 'rebuilding or migrating the site is out of proportion for a config change', re: /rebuild|redesign|migrate the (site|host)|take the (site|host) (down|offline)/i },
        ],
      },
      modelRemediation: 'Disable directory indexing at the web server (autoindex off) and review the folder to remove stale files. Rate it honestly as Low; do not rebuild the site for a one-line config change.',
    },
  ],

  execRubric: {
    need: [
      { label: 'business risk in plain language (member data / breach / regulators)', re: /member|customer|breach|fraud|financial|reputation|regulat|glba|business/i },
      { label: 'names the publicly readable cloud storage', re: /bucket|cloud storage|storage|statements/i },
      { label: "names the API letting members see other members' accounts", re: /\bapi\b|other members|other customers|account data|authori[sz]ation|idor/i },
      { label: 'a timeframe (e.g. within 48 hours)', re: /\b\d+\s*(hours?|days?|weeks?)\b|immediately|this week|within/i },
      { label: 'the action and the outcome once fixed', re: /(once|after|when)[^.]{0,50}(fix|remediat|closed|done|address)|reduc|lower(s|ed)? the risk|recommend/i },
    ],
    wrong: [
      { label: 'jargon the board cannot act on (ports, CVSS, CVE ids)', re: /cvss|\/tcp\b|port \d{2,5}|cve-\d|s3:\/\//i },
    ],
  },
  execModel: "Atlas faces an elevated risk of a member-data breach and regulatory exposure. Two critical issues need action: a cloud storage bucket holding loan statements is readable by anyone on the internet, and the member API lets any logged-in user view other members' accounts. We recommend closing both within 48 hours; once fixed, the risk of a reportable breach drops sharply. Four lower-risk items (an outdated remote-access gateway, a default admin password, leaked staging secrets, and a file listing) follow on a 30-day plan.",
};

export default CPTC_LAB_2;
