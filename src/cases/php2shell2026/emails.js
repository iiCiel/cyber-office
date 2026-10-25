// Case file: PHP2Shell. The inbox on Wednesday morning, October 21, 2026 (the day the fixed PHP versions were released, 10:00 AM Eastern).
//   - A threat-intel summary of the public reporting (real facts; Halcyon's feed and wording are invented)
//   - Dana's PHP inventory (invented hosts, which is the point: the old box nobody remembered)
//   - The weekly WAF digest that already contained the answer (invented)
//   - A fake "PHP2Shell scanner / emergency patch" email. Fake PoCs and scanners really did circulate (JFrog reported fake
//     proofs of concept and prank malware on GitHub); this particular email is invented and is NOT part of the incident.
//   - The release notice, arriving at 10:00 AM in the middle of the case
import { STATS } from './logs.js';

const t = (h, m) => h * 60 + m;
const ME = 'security@halcyonmutual.com';
const hdr = (from, addr, ip, id, date, subject, auth = true) => [
  `Return-Path: <${addr}>`,
  `Received: from ${addr.includes('halcyon') ? 'mail01.halcyonmutual.local' : `mail.${addr.split('@')[1]}`} (${ip})`,
  `  by mx.halcyonmutual.com with ESMTPS id ${id};`,
  `  ${date}`,
  'Authentication-Results: mx.halcyonmutual.com;',
  `  spf=pass smtp.mailfrom=${addr.split('@')[1]};`,
  auth ? `  dkim=pass header.d=${addr.split('@')[1]};` : '  dkim=none (message not signed);',
  auth ? `  dmarc=pass header.from=${addr.split('@')[1]}` : `  dmarc=none header.from=${addr.split('@')[1]}`,
  `From: ${from} <${addr}>`,
  `Subject: ${subject}`,
];

export const EMAILS = [
  {
    id: 'ti-brief',
    at: t(6, 15),
    from: { name: 'Threat Intel Feed', address: 'ti@halcyonmutual.com' },
    to: ME,
    subject: 'PHP2Shell: two critical PHP bugs, fix at 10:00 AM today, exploitation seen since Oct 17',
    external: false,
    phish: false,
    body: [
      'Summary of public reporting (links in the portal, we do not link from email):',
      'Two critical bugs in the PHP runtime itself, not in an app: CVE-2026-109618 (RCE via out-of-memory corruption) and CVE-2026-109619 (RCE via stale global state). Unauthenticated remote code execution. They affect PHP 5.4 through 8.5. php.net says the risk is highest for Apache with mod_php, where a request can trigger the attack before any application code runs. PHP-FPM, php-cgi, FrankenPHP and LiteSpeed are affected too.',
      'Fixed releases are scheduled for 14:00 UTC today (10:00 AM our time): PHP 8.5.12, 8.4.27, 8.3.36 and 8.2.35. PHP 8.1 and older get no update from the project.',
      'Amazon Threat Intelligence saw the first exploitation attempt in its honeypots on Oct 17, four days before disclosure: POST form uploads containing the string PHP_SESSION_UPLOAD_PROGRESS. More attempts came from 31.223.184.166, 37.19.200.5, 134.209.159.64, 103.114.163.188 and 95.217.98.37 between 02:00 and 08:00 UTC today, and from 103.216.220.92 on Oct 17. These are shared anonymization services, so investigate rather than just block. Amazon says to start investigations from at least Oct 17, not the disclosure date.',
      'NSA advises taking sites offline if you cannot update right away. CISA had not seen exploitation as of Oct 21.',
      'Please find out which of our hosts run PHP, which version and which SAPI. We do not use Cloudflare. Our WAF is ModSecurity.',
    ],
    headers: hdr('Threat Intel Feed', 'ti@halcyonmutual.com', '10.0.3.61', '3A91C7E2', 'Wed, 21 Oct 2026 06:15:20 -0400 (EDT)', 'PHP2Shell: two critical PHP bugs'),
    notes: { 'Received:': 'Our own feed server: this is Halcyon repackaging public reporting.', 'Authentication-Results:': 'All pass for our own domain.' },
    verdictNote: 'Real. The dates are the key: the bugs were exploited on Oct 17, four days before the fix was public, and a hunt that starts at the disclosure date misses that. It also says the incident-response bar: find every PHP host, and look back to Oct 17.',
    teaches: { skill: 'Turn public threat intelligence into a hunt window and an inventory task', secplus: '4.4 Alerting and monitoring; 5.2 Threat intelligence' },
  },
  {
    id: 'inventory',
    at: t(7, 20),
    from: { name: 'Dana Kowalski', address: 'dana.k@halcyonmutual.com' },
    to: ME,
    subject: 'PHP inventory so far (it is not complete)',
    external: false,
    phish: false,
    body: [
      'Morning. You asked which of our hosts run PHP. This is what I could find in an hour:',
      'agentportal01: WordPress, Apache with mod_php, PHP 8.2.34. Internet-facing behind the WAF. expose_php is Off, so the header does not show a version.',
      'claims-app01: Laravel on nginx with PHP-FPM, PHP 8.3.35. Internet-facing. nginx caps request bodies at 8 MB.',
      'intranet02: the old staff intranet app, PHP 7.4.33. Published to the field offices through a reverse proxy. Nobody has touched it since 2022, and I think 7.4 is end of life.',
      'Not sure about: Marketing\'s WordPress site (hosted by an agency) and two vendor-hosted apps. I do not know their PHP versions.',
      'Dana',
    ],
    headers: hdr('Dana Kowalski', 'dana.k@halcyonmutual.com', '10.0.3.40', '2C44F6A8', 'Wed, 21 Oct 2026 07:20:03 -0400 (EDT)', 'PHP inventory so far'),
    notes: { 'Received:': 'Internal. A real heads-up from IT.' },
    verdictNote: 'Real, and the first useful thing of the day. Notice what it shows: three different setups (mod_php, PHP-FPM, an end-of-life 7.4 box) and three unknowns. Hiding the version header does not make the portal safe: roughly four in five exposed PHP hosts hide it and are still vulnerable. You cannot patch what you have not found.',
    teaches: { skill: 'Inventory every host, version and SAPI before you can say "are we affected?"', secplus: '2.3 Vulnerabilities; 4.1 Asset management' },
  },
  {
    id: 'waf-digest',
    at: t(6, 0),
    from: { name: 'WAF Reports', address: 'waf-reports@halcyonmutual.com' },
    to: ME,
    subject: '[Weekly] WAF detection-only findings, Oct 14 to 20',
    external: false,
    phish: false,
    body: [
      'Automated report. Rules in detection-only mode that matched this week:',
      `LOW   9900101  Multipart request with a huge body sent to a page that takes no uploads   ${STATS.preDisclosure} matches, agents.halcyonmutual.com, mostly /wp-login.php, first seen Sat Oct 17 03:12 AM, source 203.0.113.77`,
      'LOW   920350   Host header is a numeric IP address   4 matches',
      'LOW   942100   SQL injection pattern (login form)   17 matches, all from 45.95.147.236',
      'This report is sent weekly to a shared mailbox. Nobody is paged for LOW findings.',
    ],
    headers: hdr('WAF Reports', 'waf-reports@halcyonmutual.com', '10.0.3.61', '5E0A3D22', 'Wed, 21 Oct 2026 06:00:02 -0400 (EDT)', '[Weekly] WAF detection-only findings'),
    notes: { 'Received:': 'Internal reporting host. A real scheduled report.' },
    verdictNote: 'Real, and it had the answer four days early. A huge multipart POST to a login page that takes no uploads, first seen Oct 17 at 3 AM from one address, is exactly the pattern Amazon later described. It was LOW, in detection-only mode, in a weekly mailbox. Detection that nobody reads is not detection.',
    teaches: { skill: 'Read the alerts you already have, and know which ones need a person', secplus: '4.4 Alerting and monitoring' },
  },
  {
    id: 'scanner-phish',
    at: t(8, 5),
    from: { name: 'PHP Security Response', address: 'response@php-release-alert.example' },
    to: ME,
    subject: 'URGENT: download the free PHP2Shell scanner and emergency patch',
    external: true,
    phish: true,
    body: [
      'Your servers may be affected by PHP2Shell (CVE-2026-109618 and CVE-2026-109619). Our scanner finds it in 2 minutes and our emergency patch fixes it without a restart.',
      'Sign in with your company email to download.',
      { link: 'scanner', text: 'Download scanner and patch', href: 'https://php-release-alert.example/scanner?ref=urgent' },
      'PHP Security Response Team',
    ],
    headers: [
      'Return-Path: <bounce@php-release-alert.example>',
      'Received: from mail.php-release-alert.example (203.0.113.91)',
      '  by mx.halcyonmutual.com with ESMTP id 7C20E4B1;',
      '  Wed, 21 Oct 2026 08:05:09 -0400 (EDT)',
      'Authentication-Results: mx.halcyonmutual.com;',
      '  spf=pass smtp.mailfrom=php-release-alert.example;',
      '  dkim=none (message not signed);',
      '  dmarc=none header.from=php-release-alert.example',
      'From: PHP Security Response <response@php-release-alert.example>',
      'Subject: URGENT: download the free PHP2Shell scanner and emergency patch',
    ],
    notes: {
      'Return-Path:': 'php-release-alert.example is not php.net. Anyone can register a name with PHP in it.',
      'Authentication-Results:': 'SPF "passes" only because the sender owns that lookalike domain. No DKIM, no DMARC.',
    },
    verdictNote: 'Phishing, the opportunistic kind. Not part of the incident: this exact email is invented for the replay, but fake patches and scanners follow every big vulnerability (JFrog reported fake proofs of concept and prank malware on GitHub for this one). PHP ships fixes only as new releases on php.net, through your distribution or vendor. Nobody sends a "patch without a restart" by email.',
    credsCost: { amount: 25000, text: 'Reset your account in the middle of an incident; check what the copycat touched (estimate for this replay)' },
    teaches: { skill: 'Stay skeptical during an incident: fake scanners and patches', secplus: '2.2 Threat vectors: phishing, urgency' },
  },
  {
    id: 'release-notice',
    at: t(10, 0),
    from: { name: 'Threat Intel Feed', address: 'ti@halcyonmutual.com' },
    to: ME,
    subject: 'PHP 8.5.12, 8.4.27, 8.3.36 and 8.2.35 are out',
    external: false,
    phish: false,
    body: [
      'The PHP project released the fixes at 14:00 UTC. php.net: "PHP 8.5.12, 8.4.27, 8.3.36 and 8.2.35 fix two critical vulnerabilities that can allow unauthenticated remote code execution."',
      'Our versions: agentportal01 is on 8.2.34 and needs 8.2.35. claims-app01 is on 8.3.35 and needs 8.3.36. intranet02 is on 7.4.33, which gets no release. The PHP project published only minimal source backports for 7.4, 8.0 and 8.1, with no binaries.',
      'If you get PHP from a distribution or an LTS vendor, they received the patches in advance: check the changelog for the two CVEs, not the version string.',
      'php.net says only an update is a complete solution. Partial mitigations exist (session.upload_progress.enabled=0 in php.ini or the pool config, not ini_set or .user.ini, with every worker restarted; low post_max_size; request size limits at the proxy). PHP 8.2 reaches end of life on Dec 31, 2026.',
    ],
    headers: hdr('Threat Intel Feed', 'ti@halcyonmutual.com', '10.0.3.61', '8B12D0F4', 'Wed, 21 Oct 2026 10:00:04 -0400 (EDT)', 'PHP 8.5.12, 8.4.27, 8.3.36 and 8.2.35 are out'),
    notes: { 'Received:': 'Our own feed server again, relaying the php.net notice.' },
    verdictNote: 'Real, and urgent, and it is half the job. A patch closes the hole from now on. It does not remove anything planted before it and does not rotate anything that already leaked. And the box nobody remembered, PHP 7.4, gets no release at all.',
    teaches: { skill: 'Patch, and know what a patch does not fix (EOL versions, earlier compromise)', secplus: '4.3 Vulnerability management' },
  },
];

export const PAGES = {
  scanner: { kind: 'phish-login', url: 'https://php-release-alert.example/scanner?ref=urgent', secure: true, brand: 'PHP Security Response', heading: 'Sign in to download the scanner', small: 'Company email and password required.', done: 'Thank you. Downloading... (There is no scanner and no patch. Your password just left the building.)' },
};

export const REPLY_DRAFTS = {
  'ti-brief': 'Thanks. Starting the inventory and a hunt back to Oct 17 now.',
  inventory: 'Thanks Dana. Please keep going on the unknowns (Marketing and the vendors). I will ask the agency for versions.',
  'waf-digest': 'Looking at agentportal01 from Oct 17 now.',
  'scanner-phish': 'Done, I downloaded it.',
  'release-notice': 'Thanks. Patching with a hunt first, not instead of one.',
};
