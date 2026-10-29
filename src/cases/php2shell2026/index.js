// Case file: PHP2Shell (CVE-2026-109618 and CVE-2026-109619), October 2026. A recreation of a NEW, real event, built from the
// public reporting listed in caseFile.sources, written on Oct 25, 2026. The company, its servers and everything that happens
// on them are fictional. As of that date the only reported breach (a European government agency, Unit 42 via The Hacker
// News) had been walked back: Unit 42 said it could not confirm initial access came through the PHP2Shell CVEs.
// Same engine as the week (see src/days/index.js for every field); plus caseFile, which drives the Case Files menu card
// and the "what really happened" half of the report.
import { EMAILS, PAGES, REPLY_DRAFTS } from './emails.js';
import { generateLogs, ALERTS, CASE, IP_INFO, DATE, ATT, AMAZON_FIRST, AMAZON_IPS } from './logs.js';
import { EXPOSURE_CALL, EXPOSURE_SCORE, EXEC_CALL, EXEC_SCORE } from './talk.js';
import { TICKETS } from './tickets.js';
import { scoreEmail, scoreCase, scoreTicket, scoreConversation, finalize } from '../../game/scoring.js';

const MAIN = 'php-worker-shell';
// Hunting from Oct 17: grep for the multipart field name, the memory-limit fatals, odd cookies, dead workers, or the portal's logs.
const HUNT_RE = /(PHP_SESSION_UPLOAD_PROGRESS|allowed\s+memory\s+size|upload_progress|PHPSESSID|segmentation|\bgrep\b.*\b(error\.log|access\.log|modsec|audit\.log|agentportal))/i;

function huntItem(st) {
  const cmds = st.events.filter((e) => e.type === 'terminal-cmd');
  const found = cmds.some((e) => HUNT_RE.test(e.cmd));
  return {
    id: 'hunt',
    area: 'Terminal',
    title: 'Hunt the agent portal logs back to Oct 17 (grep)',
    max: 10,
    teaches: { skill: 'Hunt a runtime vulnerability from the first exploitation date: multipart POSTs, memory-limit fatals, odd cookies, web server children', secplus: '4.9 Use data sources to support an investigation' },
    outcome: found ? 'good' : cmds.length ? 'ok' : 'bad',
    points: found ? 10 : cmds.length ? 4 : 0,
    what: found ? `You went looking for PHP_SESSION_UPLOAD_PROGRESS and the memory-limit fatals in the portal's logs (${cmds.length} command${cmds.length === 1 ? '' : 's'}).` : cmds.length ? 'You opened the Terminal but never searched the portal logs for the PHP2Shell pattern.' : 'You never searched the agent portal logs.',
    why: 'Amazon said to start investigations from at least Oct 17, not from the disclosure date. The attempts do not show up as a nice alert: they are a multipart POST to a login page, a "single memory-limit fatal" in the Apache error log, a 500, a very long PHPSESSID cookie. You only find them by grepping for exactly those things, over the days before the news.',
  };
}

function score(st) {
  return finalize([
    ...EMAILS.map((e) => scoreEmail(e, st.mail?.[e.id])),
    scoreConversation(EXPOSURE_SCORE, st.enc?.exposure),
    ...TICKETS.map((t) => scoreTicket(t, st.tickets?.[t.id])),
    huntItem(st),
    scoreConversation(EXEC_SCORE, st.enc?.exec),
    scoreCase(CASE, st.soc?.cases?.[MAIN]),
  ]);
}

function debrief(st) {
  const r = score(st);
  const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
  const lines = ["Okay. Replay over. Let's compare you to what really happened, and to what we invented."];
  if (by.case.outcome === 'good') lines.push('Your write-up matches the story: multipart POSTs with PHP_SESSION_UPLOAD_PROGRESS from Oct 17, memory-limit fatals and a huge PHPSESSID cookie (memory leaking out), then on Oct 21 an Apache worker starting /bin/sh and curl and a PHP file dropped in uploads. The first part is how the real exploitation looked to the people who saw it. The second part we invented.');
  else if (st.soc?.cases?.[MAIN]) lines.push('Your write-up missed part of the chain. The attempts started on Oct 17, the Apache error log held memory-limit fatals, a cookie carried leaked memory, and the last step was a worker starting a shell and writing a PHP file.');
  else lines.push('You never wrote it up. The shell in wp-content/uploads and the leaked secrets were still there.');
  if (by.case.contained) lines.push('You took the portal offline, kept the evidence, hunted first, then rebuilt and rotated. That is what the advice points to. A patch alone would have left the shell and the stolen secrets.');
  if (st.enc?.exposure?.outcome === 'patch-only') lines.push('You patched and restarted at once. Fast is good, but the bugs were exploited from Oct 17, a patch does not remove a planted shell, and the restart cleared the memory and /tmp.');
  else if (st.enc?.exposure?.outcome === 'mitigate-only') lines.push('You applied the partial mitigations and waited. php.net says only an update is a complete solution.');
  else if (st.enc?.exposure?.outcome === 'keep-open') lines.push('You left the riskiest host untouched. The WAF was only logging and a hidden version header is not a defense.');
  if (by.hunt.outcome === 'good') lines.push('And you hunted back to Oct 17 yourself. That is the single most useful sentence in the Amazon post: start from at least Oct 17, not the disclosure date.');
  if (st.enc?.exec?.outcome === 'false-assurance') lines.push('You told support everything was fine. Honest, early and partial beats confident and wrong.');
  if (st.mail?.['scanner-phish']?.enteredCreds) lines.push('And you gave your password to the fake "PHP2Shell scanner". Fake proofs of concept and scanners did circulate for this one. Stay sharp when things are loud.');
  lines.push(`What is real: two critical bugs in the PHP runtime, fixed on Oct 21 in 8.5.12, 8.4.27, 8.3.36 and 8.2.35; PHP 8.1 and older get no update from the project; exploitation attempts seen from Oct 17 (from ${AMAZON_FIRST} and later ${AMAZON_IPS.length} more addresses, all shared anonymization services); and, as of Oct 25, 2026, one reported breach (a European government agency) that Unit 42 then said it could not tie to PHP2Shell. What we invented: Halcyon, the servers, the memory leak, the shell and the data read.`);
  lines.push('The lesson is not "patch faster". It is: know every PHP host and version, hunt from the first exploitation date, patch and then check whether you were already hit, rotate what could have leaked, and get the old unpatchable box off the internet.');
  lines.push("Here's your case report, and what you can honestly say you've done.");
  return lines;
}

function terminal() {
  const logs = generateLogs({ nowMinutes: 24 * 60 });
  const file = (pred) => `${logs.filter(pred).map((e) => e.raw || e.line).join('\n')}\n`;
  const on = (host, ...sources) => (e) => e.host === host && sources.includes(e.source);
  const csv = (rows) => `${rows.map((r) => r.join(',')).join('\n')}\n`;
  return {
    date: 'Wed Oct 21 2026',
    note: 'An export of agentportal01 (web, WAF, audit and firewall logs, php.ini), claims-app01, intranet02 and the PHP host inventory is mounted read-only under /mnt.',
    files: {
      '/mnt/agentportal/README.txt': [
        'Read-only export of agentportal01 (WordPress, Apache mod_php, PHP 8.2.34) and its WAF, taken this morning.',
        'logs/apache2/access.log    combined format plus ct= (Content-Type), cl= (Content-Length), rt= (seconds)',
        'logs/apache2/error.log     Apache and PHP errors',
        'logs/waf/                  ModSecurity (detection only) and response inspection',
        'logs/audit/audit.log       auditd and EDR process events',
        'logs/firewall.log          outbound connections from the web tier',
        'logs/portal-auth.log       agent sign-ins and session events',
        'etc/php.ini               the settings that matter',
        'new-files.csv             files under wp-content/uploads created since Oct 17',
        '',
      ].join('\n'),
      '/mnt/agentportal/logs/apache2/access.log': file(on('agentportal01', 'httpd')),
      '/mnt/agentportal/logs/apache2/error.log': file(on('agentportal01', 'httpd-error')),
      '/mnt/agentportal/logs/waf/modsec_audit.log': file(on('waf01', 'modsec')),
      '/mnt/agentportal/logs/waf/response-inspect.log': file(on('waf01', 'waf')),
      '/mnt/agentportal/logs/audit/audit.log': file((e) => e.host === 'agentportal01' && ['auditd', 'edr'].includes(e.source)),
      '/mnt/agentportal/logs/firewall.log': file((e) => e.host === 'fw01' || (e.host === 'agentportal01' && e.source === 'netflow')),
      '/mnt/agentportal/logs/portal-auth.log': file(on('agentportal01', 'portal-auth')),
      '/mnt/agentportal/etc/php.ini': [
        '; excerpt of /etc/php/8.2/apache2/php.ini on agentportal01 (PHP 8.2.34, apache2handler / mod_php)',
        'memory_limit = 128M',
        'post_max_size = 64M',
        'upload_max_filesize = 40M',
        'expose_php = Off',
        'session.upload_progress.enabled = On',
        'session.upload_progress.cleanup = On',
        '',
      ].join('\n'),
      '/mnt/agentportal/new-files.csv': csv([
        ['path', 'created', 'size_kb', 'writer', 'in_release'],
        ['wp-content/uploads/2026/10/q3-brochure.pdf', '2026-10-19', '2410', 'www-data', 'n/a (media)'],
        ['wp-content/uploads/2026/10/class-wp-cache-helper.php', '2026-10-21 10:22', '9', 'www-data', 'no (not part of any plugin or theme)'],
        ['wp-content/uploads/2026/10/agent-badge-oct.png', '2026-10-20', '88', 'www-data', 'n/a (media)'],
      ]),
      '/mnt/claims-app01/logs/nginx/access.log': file(on('claims-app01', 'nginx')),
      '/mnt/intranet02/logs/apache2/access.log': file(on('intranet02', 'httpd')),
      '/mnt/intranet02/logs/apache2/error.log': file(on('intranet02', 'httpd-error')),
      '/mnt/inventory/php-hosts.csv': csv([
        ['host', 'role', 'sapi', 'php_version', 'supported', 'internet_facing', 'version_header'],
        ['agentportal01', 'WordPress agent portal', 'Apache mod_php', '8.2.34', 'yes (fix: 8.2.35)', 'yes (behind WAF)', 'hidden'],
        ['claims-app01', 'Laravel claims intake', 'PHP-FPM behind nginx', '8.3.35', 'yes (fix: 8.3.36)', 'yes', 'hidden'],
        ['intranet02', 'Staff intranet', 'Apache mod_php', '7.4.33', 'NO (end of life, no release)', 'yes (reverse proxy for field offices)', 'shown'],
        ['(marketing site)', 'Marketing WordPress, agency hosted', 'unknown', 'unknown', 'unknown', 'yes', 'unknown'],
        ['(2 vendor-hosted apps)', 'Quote engine, e-sign', 'unknown', 'unknown', 'unknown', 'yes', 'unknown'],
      ]),
      '/home/analyst01/README.txt': [
        'Tips from Priya (the portal export is under /mnt/agentportal, the others under /mnt):',
        '  grep -r PHP_SESSION_UPLOAD_PROGRESS /mnt/agentportal/logs      the multipart field name from the Amazon post',
        '  grep "Allowed memory size" /mnt/agentportal/logs/apache2/error.log      the memory-limit fatals',
        '  grep " 500 " /mnt/agentportal/logs/apache2/access.log      bursts of 500s',
        '  cat /mnt/agentportal/logs/waf/response-inspect.log      PHPSESSID cookies that are far too long',
        '  grep -E "dash|curl" /mnt/agentportal/logs/audit/audit.log      did an Apache child start a shell?',
        '  cat /mnt/agentportal/new-files.csv      new files in uploads',
        '  cat /mnt/inventory/php-hosts.csv      what runs PHP, and which versions',
        '  whois 203.0.113.77',
        '',
        'Request bodies and shell commands are redacted on purpose. Read the evidence, not the exploit.',
        '',
      ].join('\n'),
      '/home/analyst01/iocs.txt': [
        `${ATT}   attacker address in this replay (invented, documentation range)`,
        `${AMAZON_FIRST}   earliest attempt Amazon saw (Oct 17); shared anonymization infrastructure: investigate, do not just block`,
        `${AMAZON_IPS.join(' ')}   Amazon, Oct 21 02:00-08:00 UTC; shared anonymization infrastructure`,
        'user-agent php2shell-scan/109618   reported by VulnCheck',
        '45.95.147.236   internet scanner (noise)',
        '',
      ].join('\n'),
    },
    whois: {
      [ATT]: 'NetRange: 203.0.113.0 - 203.0.113.255\nOrgName: Example Anonymizing VPS Service\nCountry: unknown\nComment: Customers rotate; no details.\n(Stand-in for the attacker address in this replay.)',
      [AMAZON_FIRST]: 'Listed by Amazon Threat Intelligence as the earliest exploitation attempt (Oct 17).\nAmazon describes it as a commercial anonymization network.\n(Registration details are not reproduced here. Shared infrastructure: investigate what it did, do not just block it.)',
      ...Object.fromEntries(AMAZON_IPS.map((ip) => [ip, `Listed by Amazon Threat Intelligence for Oct 21 02:00-08:00 UTC.\nShared anonymization infrastructure.\n(Registration details are not reproduced here. Investigate, do not just block.)`])),
    },
    dns: {},
  };
}

export default {
  n: 6,
  caseId: 'php2shell-2026',
  date: DATE,
  title: 'PHP2Shell · Oct 21, 2026',
  start: 9 * 60,
  endAt: 12 * 60,
  intro: ['Case Files: PHP2Shell, Wednesday Oct 21, 2026.', 'A replay of a real event, four days after it hit the news. Priya has the SOC open.'],
  badgeAtStart: true,
  cast: ['mike', 'theo'],

  emails: EMAILS,
  pages: PAGES,
  replyDrafts: REPLY_DRAFTS,
  logs: (st) => generateLogs({ nowMinutes: st.minutes }),
  ipInfo: IP_INFO,
  alerts: ALERTS,
  tickets: TICKETS,
  terminal: terminal(),

  npcLines: {
    priya: {
      talk: [
        'Welcome to Case Files. Today: PHP2Shell, October 2026. This one is brand new. It happened last week.',
        "It's Wednesday, October 21, 2026, 9:00 AM. Two critical bugs in the PHP runtime itself let an unauthenticated request run code. The fixed versions land at 10:00 this morning, and exploitation attempts were seen from October 17.",
        "Fair warning. This replay uses what php.net, Wiz, Amazon and others have published. The company, its servers and what happens on them are made up. One real breach was reported this week and then walked back, so nothing is confirmed yet. The shape of the attack is the real one.",
        'Start with your inbox. Dana is building a list of our PHP hosts, and the release email lands at ten.',
      ],
      again: ['Inbox first. Then the patch queue and the portal logs.'],
    },
    dana: { talk: ["I'm IT. I'm trying to find every server that runs PHP. It's more than I thought."], again: ['Still counting PHP hosts.'] },
    mike: { talk: ["I'm the business owner for the agent portal. Agents quote policies there all day. Every minute offline costs real money."], again: ['How long will the portal be down?'] },
    theo: { talk: ["I'm the web admin. The portal runs Apache with mod_php. Yes, I know what php.net says about that."], again: ['Tell me what you want done to the portal.'] },
  },

  objectives: [
    { id: 'priya', type: 'talk', text: 'Get the case briefing from Priya' },
    { id: 'my-desk', type: 'sit', text: 'Sit down at your desk' },
    { id: 'inbox', type: 'inbox', target: 'my-desk', text: 'Go through the SOC inbox (the PHP release email lands at 10:00)' },
    { id: 'exposure', type: 'encounter', target: 'theo', text: 'Theo, the web admin, is coming over', waitText: 'The web admin wants a word.' },
    { id: 'tickets', type: 'tickets', target: 'my-desk', text: 'Work through the PHP patch queue' },
    { id: 'hunt', type: 'terminal', match: HUNT_RE, target: 'my-desk', waitFor: 'alert', text: 'Terminal: hunt the agent portal logs back to Oct 17 (grep)', waitText: 'Waiting on the SIEM.' },
    { id: 'exec', type: 'encounter', target: 'my-desk', text: 'Answer your desk phone (the agent support lead is calling)', waitText: 'The phone is quiet. Stay near your desk.' },
    { id: 'server-door', type: 'badge', text: 'Badge into the server room' },
    { id: 'soc', type: 'case', target: 'soc', text: 'Work the case at the SOC console' },
    { id: 'debrief', type: 'debrief', target: 'priya', text: 'Debrief with Priya: what really happened' },
  ],
  encounters: [
    { id: 'exposure', type: 'walkup', npc: 'theo', after: 'inbox', delayMs: 1500, fallbackAt: 10 * 60 + 5, intro: 'Got a minute? The PHP release just landed.', conv: EXPOSURE_CALL },
    { id: 'exec', type: 'phone', after: 'hunt', delayMs: 3000, fallbackAt: 11 * 60 + 15, notice: '☎ Your desk phone is ringing (agent support)', conv: EXEC_CALL },
  ],

  score,
  debrief,

  caseFile: {
    id: 'php2shell-2026',
    fresh: true,
    company: 'PHP2Shell',
    target: 'Halcyon Mutual', // the fictional insurer in this replay (company is the bug's name, shown on the folder)
    when: 'October 2026',
    title: 'Exploited four days before the fix',
    pitch: 'Two critical bugs in PHP itself, the language behind about 70% of websites, let one request run code on the server. Attackers were trying it on Oct 17. The fix landed on Oct 21. You are the analyst at an insurer whose agent portal runs the riskiest setup, and the question is not whether to patch but what already happened. A brand-new event: this case was written four days after it hit the news.',
    tags: ['Zero-day', 'PHP', 'Web shell', 'Patch management', 'Memory disclosure', 'Just happened'],
    difficulty: 'Intermediate',
    headline: 'In October 2026 the PHP project fixed two critical, unauthenticated remote code execution bugs in the PHP runtime itself: CVE-2026-109618 (out-of-memory corruption) and CVE-2026-109619 (stale global state), both CVSS v4.0 9.2 per PHP and together nicknamed PHP2Shell. They affect PHP 5.4 through 8.5. Amazon saw exploitation attempts from Oct 17, four days before public disclosure. As of Oct 25, 2026 one breach had been reported, at a European government agency, but Unit 42 then said it could not confirm the attackers got in through PHP2Shell. The story was still unfolding. The company in this replay is fictional.',
    timeline: [
      { when: 'Aug 19 to Sep 21, 2026', what: 'Wiz Research finds the first of the bugs (Aug 19). Wiz thanks the PHP team, Calif and OpenAI for their work on discovery, coordination and patch verification. Reports reach the PHP project on Aug 24 and PHP acknowledges them on Sep 21. Wiz confirmed unauthenticated code execution against Drupal (Aug 20) and WordPress (Aug 21). The out-of-memory problem in one of the bugs had also been noticed in PHP\'s 2024 external audit but not fixed.' },
      { when: 'Oct 17', what: 'Amazon Threat Intelligence logs the earliest known exploitation attempt in its MadPot honeypots, from 103.216.220.92 (a commercial anonymization network): POST form uploads containing the string PHP_SESSION_UPLOAD_PROGRESS. Four days before public disclosure.' },
      { when: 'Oct 20', what: 'Details leak on Hacker News. PHP posts an advance notice that evening, moving the release up from Oct 22 to Wednesday Oct 21 at 14:00 UTC. Calif mistakenly releases a proof-of-concept video.' },
      { when: 'Oct 21, 02:00 to 08:00 UTC', what: 'Amazon sees more attempts from 31.223.184.166, 37.19.200.5, 134.209.159.64, 103.114.163.188 and 95.217.98.37 (shared anonymization infrastructure). Cloudflare turns on WAF rules by default at 03:02 UTC, including on free plans. At 07:41 UTC Chainguard publishes patched images early, which the PHP Foundation said broke the embargo.' },
      { when: 'Oct 21, 14:00 UTC', what: 'PHP 8.5.12, 8.4.27, 8.3.36 and 8.2.35 are released. PHP 8.1 and older get no update from the project; it publishes minimal source backports for 7.4, 8.0 and 8.1, with no binaries. Around the release, watchTowr reports its honeypots seeing exploitation attempts in the wild.' },
      { when: 'Oct 21', what: 'The NSA advises taking sites offline if they cannot update immediately, and the UK NCSC warns about backdoors. Many sites go offline as a precaution, including Wikimedia services, the Internet Archive (briefly), BambooHR and government sites in the Netherlands, Finland and France. VirusTotal counts about 758,000 hosts on end-of-life branches (5.4 to 8.1) against about 272,000 on supported ones, and about four in five hide their version.' },
      { when: 'Oct 25', what: 'The Hacker News reports Palo Alto Unit 42\'s account of an attack on a European government agency: within two hours the attacker had password hashes and MFA secrets, then built an NTLM-relay tunnel into Active Directory. The same afternoon Unit 42 retracts its link to the bugs, saying it cannot confirm initial access came through the PHP2Shell CVEs. So no breach is confirmed yet. Details may still change. PHP 8.2 reaches end of life on Dec 31, 2026.' },
    ],
    realOutcome: [
      'As of October 25, 2026, when this replay was written, the story is still unfolding. Palo Alto Unit 42 described one compromise, of a European government agency, where the attacker reached password hashes and MFA secrets within two hours (reported by The Hacker News). Later that day Unit 42 said it could not confirm the attacker got in through the PHP2Shell CVEs, so no breach is confirmed yet. Amazon, VulnCheck, watchTowr and Cloudflare have seen exploitation attempts. Everything about the victim in this replay is invented.',
      'The bugs are in the PHP runtime, not in an app, so they reach every PHP stack: php.net lists PHP-FPM, Apache with mod_php, php-cgi, FrankenPHP and LiteSpeed, and says the risk is highest for mod_php, where an unauthenticated request can trigger the attack before any application code runs.',
      'Per Wiz, multipart requests are parsed before module initialisation finishes, an out-of-memory error aborts the request before cleanup, and a later request on the same worker can make PHP URL-encode reclaimed heap memory into a PHPSESSID response cookie. That is a memory disclosure that can include passwords, tokens and API keys from other requests. The app does not need to call session_start().',
      'CrowdStrike (reported by The Hacker News) says the attack leaves virtually no digital traces, with a single memory-limit fatal in the web server error log as the only server-side trace. The FBI advises watching for PHP processes that unexpectedly launch command shells or download files.',
      'php.net says only an update is a complete solution. Partial mitigations exist (session.upload_progress.enabled=0 in php.ini or the pool config; a low post_max_size; request size limits at the proxy; memory_limit=-1 set with php_admin_value; do not use RLIMIT_AS or RLIMIT_DATA). Distributions and LTS vendors received patches in advance, so check the changelog for the CVE and not the version string.',
    ],
    failures: [
      'Not knowing which hosts run PHP, which version and which server API. "Are we affected?" turned into a day of guessing, and the forgotten end-of-life box was the last one found.',
      'End-of-life PHP (5.4 to 8.1) gets no official release, so exposed old systems stay exposed until someone moves or retires them.',
      'Starting the investigation at the disclosure date. Amazon saw attempts on Oct 17 and said to look back at least that far.',
      'Treating a hidden version header as protection. About four in five exposed hosts hide it, and are still vulnerable.',
      'Detection that nobody reads: a weekly digest that lists a huge multipart POST to a login page, a single memory-limit fatal, or an oversized cookie as LOW (illustrative for this replay).',
      'Patching without hunting. A patch does not remove a web shell or rotate a secret that has already leaked.',
      'Fake fixes and scanners. JFrog reported fake proofs of concept and prank malware on GitHub; urgent "emergency patch" emails follow every big bug.',
    ],
    attack: [
      { id: 'T1190', name: 'Exploit Public-Facing Application', fix: 'Keep a live inventory of every internet-facing PHP host, version and server API. Patch or upgrade first, use partial mitigations only as a stopgap, and put end-of-life systems behind a VPN or an allow-list. Block or size-limit multipart uploads at the proxy.' },
      { id: 'T1505.003', name: 'Server Software Component: Web Shell', fix: 'Alert on any new .php file written by the web user, especially under uploads. Keep uploads non-executable, and watch for the web server process writing files it never wrote before.' },
      { id: 'T1059.004', name: 'Command and Scripting Interpreter: Unix Shell', fix: 'Alert when apache2, nginx or php-fpm start /bin/sh, bash or curl. A web worker has almost no reason to do it, and it matches the FBI\'s advice to watch for PHP processes that unexpectedly launch command shells or download files.' },
      { id: 'T1105', name: 'Ingress Tool Transfer', fix: 'Default-deny outbound traffic from the web tier and allow only named destinations through a proxy. A web server that fetches from an unknown address is a finding.' },
      { id: 'T1552.001', name: 'Unsecured Credentials: Credentials In Files', fix: 'Assume wp-config.php was read. Rotate the database password, WordPress salts and keys, and any API tokens, and move secrets out of files that the web user can read where you can.' },
      { id: 'T1539', name: 'Steal Web Session Cookie', fix: 'Memory leaked through a cookie can hold other users\' session tokens. Invalidate all sessions after a suspected hit, bind sessions to more than a cookie, and alert on one session used from two networks.' },
    ],
    resume: 'Investigated a simulated PHP2Shell incident (the October 2026 PHP runtime remote-code-execution bugs, CVE-2026-109618 and CVE-2026-109619) in Cyber Office: inventoried PHP hosts, hunted Apache, WAF and audit logs back to the first exploitation date (Oct 17), found a web shell dropped by an Apache worker, and chose contain, rebuild and rotate secrets over a patch-only response (MITRE ATT&CK T1190, T1505.003, T1059.004). Score: {grade}.',
    sources: [
      { title: 'php.net: Security advisory and releases PHP 8.5.12, 8.4.27, 8.3.36, 8.2.35 (Oct 21, 2026)', url: 'https://www.php.net/archive/2026.php#2026-10-21-5' },
      { title: 'GitHub Security Advisory GHSA-w8hw-w9fx-j79w (CVE-2026-109618, RCE via OOM corruption)', url: 'https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w' },
      { title: 'GitHub Security Advisory GHSA-6wmf-4rv5-p3rp (CVE-2026-109619, RCE via stale global state)', url: 'https://github.com/php/php-src/security/advisories/GHSA-6wmf-4rv5-p3rp' },
      { title: 'Wiz Research: PHP2Shell technical analysis', url: 'https://www.wiz.io/blog/php2shell-php-rce' },
      { title: 'Amazon Threat Intelligence: PHP2Shell exploitation prior to public disclosure in MadPot', url: 'https://aws.amazon.com/blogs/security/amazon-threat-intelligence-identifies-php2shell-exploitation-prior-to-public-disclosure-in-madpot/' },
      { title: 'The Hacker News: PHP issues emergency patches for two critical flaws', url: 'https://thehackernews.com/2026/10/php-issues-emergency-patches-for-two.html' },
      { title: 'VirusTotal: Sizing the PHP exposure window for CVE-2026-109618 and CVE-2026-109619', url: 'https://blog.virustotal.com/2026/10/sizing-php-exposure-window-for-cve-2026.html' },
      { title: 'UK NCSC: Critical security issue affecting PHP', url: 'https://www.ncsc.gov.uk/news/critical-security-issue-affecting-php' },
      { title: 'NSA: Advisory on PHP updates', url: 'https://www.nsa.gov/Press-Room/Press-Releases-Statements/Press-Release-View/Article/4630238/nsa-advisory-php-updates/' },
      { title: 'Cloudflare: Cloudflare deploys protections against php2shell vulnerability (WAF rules on by default from 03:02 UTC, Oct 21)', url: 'https://blog.cloudflare.com/php-vulnerabilities-waf-protection' },
      { title: 'The Hacker News: Someone tried to exploit PHP2Shell 4 days before the vulnerabilities were publicly disclosed (CrowdStrike, FBI, JFrog)', url: 'https://thehackernews.com/2026/10/someone-tried-to-exploit-php2shell-4.html' },
      { title: 'JFrog Security Research: PHP2Shell, all you need to know (fake PoCs and prank malware)', url: 'https://research.jfrog.com/post/php2shell-all-you-need-to-know-about-cve-2026-109618-and-cve-2026-109619/' },
      { title: 'VulnCheck: PHP2Shell vulnerabilities (canary observations, user agent php2shell-scan/109618)', url: 'https://vulncheck.com/blog/php2shell-vulnerabilities' },
      { title: 'Socket: PHP Foundation says Chainguard broke security embargo (07:41 UTC, Oct 21)', url: 'https://socket.dev/blog/php-embargo-dispute' },
      { title: 'SecurityWeek: PHP2Shell patches land as first exploitation attempts hit sensors (watchTowr)', url: 'https://www.securityweek.com/php2shell-patches-land-as-first-exploitation-attempts-hit-sensors' },
      { title: 'HCAMag: Major HR system goes offline as critical cyber flaw drives wave of global shutdowns (BambooHR)', url: 'https://www.hcamag.com/ca/specialization/payroll/major-hr-system-goes-offline-as-critical-cyber-flaw-drives-wave-of-global-shutdowns/594456' },
      { title: 'Wikipedia: PHP2Shell (Wikimedia, Internet Archive and government sites offline; Calif video; 2024 audit; with its cited press sources)', url: 'https://en.wikipedia.org/wiki/PHP2Shell' },
      { title: 'The Hacker News: PHP2Shell exploitation hits government entity (Unit 42, Oct 25, 2026)', url: 'https://thehackernews.com/2026/10/php2shell-exploitation-hits-government.html' },
      { title: 'Palo Alto Unit 42: Threat brief on CVE-2026-109618 and CVE-2026-109619 (Oct 25 update: cannot confirm initial access came through these CVEs)', url: 'https://unit42.paloaltonetworks.com/cve-2026-109618-cve-2026-109619/' },
    ],
    disclaimer: 'A dramatized replay of a real, very recent event, written on October 25, 2026, four days after public disclosure. Details may change as researchers and vendors publish more. As of that date one breach had been reported (Unit 42, a European government agency) and Unit 42 then said it could not confirm the attacker got in through PHP2Shell, so none was confirmed. The real parts: the two CVEs, the affected versions and server APIs, the fixed releases, the php.net mitigations, the dates and times in the timeline, Wiz\'s technical description, Amazon\'s Oct 17 observation, the string PHP_SESSION_UPLOAD_PROGRESS, the six Amazon addresses (shared anonymization infrastructure), the user agent php2shell-scan/109618 (VulnCheck), the Cloudflare, Chainguard, watchTowr, CrowdStrike, JFrog and FBI statements, the sites that went offline, and the Unit 42 report and its retraction. All of that comes from the sources above. Everything else is fictional: Halcyon Mutual, its staff and servers, the PHP versions, the WAF in detection-only mode, the log lines, the attacker address (203.0.113.77, a documentation range), the memory leak and session reuse, the Apache worker that starts a shell on Oct 21, the web shell file, the database read, the 14 MB that leave, the phone call and the fake scanner email. Request bodies and shell commands are never shown. Which address sent which request in this replay is also invented (VulnCheck, not Amazon, published the scanner user agent). Times, sizes and counts are illustrative. Dollar costs in your report are estimates for this replay.',
  },
};
