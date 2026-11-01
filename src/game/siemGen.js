// Seeded, index-addressable procedural log generator for the CCDC SIEM ("2.3 million logs, someone got in").
//
//   const siem = createSiem(scenario, { seed: 7 });
//   siem.get(i)            -> { i, t, host, index, source, sourcetype, raw, fields }   deterministic, no big arrays
//   siem.count(clockSec)   -> number of events that exist `clockSec` seconds into the round (the index keeps growing)
//   siem.indexAtTime(t)    -> first index whose time >= t (binary-search free: time is a monotone function of index)
//   siem.onWave(findingId, clockSec, outcome) -> indices of the red-team burst it added
//
// Time model: history [startEpoch, startEpoch+spanSec) holds `total` events, t = start + floor(i * span/total).
// The round starts at roundStart = startEpoch + spanSec; after that ~`liveRate` events per game-second are appended.
// The hand-written attack story (src/data/siemStories.js) is placed on top of the noise at fixed indices, so the
// evidence is always at the same place for a given scenario + total, but only a search finds it.
//
// Addresses are fiction: noise comes from 100.64.0.0/10 and 198.18.0.0/15; the story uses RFC 5737 ranges
// (198.51.100/24, 203.0.113/24) and the scenario's RFC 1918 LAN. Log text follows the real products' formats.

import { STORIES } from '../data/siemStories.js';

export const TZ_OFFSET = -4 * 3600; // US Eastern daylight time (the round is Oct 31, before the Nov 1 fall-back)
export const TZ_NAME = 'EDT';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n) => (n < 10 ? '0' + n : '' + n);

// ---------- time formatting (cached per second: consecutive events share a second) ----------
let cT = -1; let cL = null; let cU = null;
function civil(sec) {
  const days = Math.floor(sec / 86400);
  const s = sec - days * 86400;
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d, h: Math.floor(s / 3600), mi: Math.floor((s % 3600) / 60), s: s % 60 };
}
function parts(t) {
  if (t !== cT) { cT = t; cL = civil(t + TZ_OFFSET); cU = null; }
  return cL;
}
const utcParts = (t) => civil(t);
export const fmtSyslog = (t) => { const c = parts(t); return `${MON[c.m - 1]} ${c.d < 10 ? ' ' + c.d : c.d} ${p2(c.h)}:${p2(c.mi)}:${p2(c.s)}`; };
export const fmtApache = (t) => { const c = parts(t); return `${p2(c.d)}/${MON[c.m - 1]}/${c.y}:${p2(c.h)}:${p2(c.mi)}:${p2(c.s)} -0400`; };
export const fmtWin = (t) => { const c = parts(t); const h12 = c.h % 12 === 0 ? 12 : c.h % 12; return `${p2(c.m)}/${p2(c.d)}/${c.y} ${p2(h12)}:${p2(c.mi)}:${p2(c.s)} ${c.h < 12 ? 'AM' : 'PM'}`; };
const fmtMy = (t, frac) => { const c = utcParts(t); return `${c.y}-${p2(c.m)}-${p2(c.d)}T${p2(c.h)}:${p2(c.mi)}:${p2(c.s)}.${frac}Z`; };
const fmtPg = (t, ms) => { const c = parts(t); return `${c.y}-${p2(c.m)}-${p2(c.d)} ${p2(c.h)}:${p2(c.mi)}:${p2(c.s)}.${ms} EDT`; };
/** Splunk's default _time display, e.g. 10/31/26 9:12:44.000 AM */
export const fmtSplunk = (t) => { const c = civil(t + TZ_OFFSET); const h12 = c.h % 12 === 0 ? 12 : c.h % 12; return `${c.m}/${c.d}/${String(c.y).slice(2)} ${h12}:${p2(c.mi)}:${p2(c.s)}.000 ${c.h < 12 ? 'AM' : 'PM'}`; };
export const fmtLocal = (t) => { const c = civil(t + TZ_OFFSET); return `${c.y}-${p2(c.m)}-${p2(c.d)} ${p2(c.h)}:${p2(c.mi)}:${p2(c.s)}`; };
export const fmtShort = (t) => { const c = civil(t + TZ_OFFSET); return `${MON[c.m - 1]} ${c.d} ${p2(c.h)}:${p2(c.mi)}`; };

// ---------- deterministic randomness ----------
function hash(x) {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}
let S = 0;
const nx = () => { S = hash((S + 0x9e3779b9) | 0); return S; };
const rnd = (n) => nx() % n;
const pick = (a) => a[nx() % a.length];
const hex = (n, w) => n.toString(16).toUpperCase().padStart(w, '0');

function noiseIp(x) {
  return (x & 1)
    ? `198.${18 + ((x >>> 1) & 1)}.${(x >>> 2) & 255}.${1 + ((x >>> 10) % 254)}`
    : `100.${64 + ((x >>> 1) & 63)}.${(x >>> 7) & 255}.${1 + ((x >>> 15) % 254)}`;
}
const makePool = (n, salt) => Array.from({ length: n }, (_, j) => noiseIp(hash(Math.imul(j + 1, 0x9e3779b1) ^ salt)));

// ---------- vocab ----------
const BAD_USERS = ['admin', 'test', 'oracle', 'ubuntu', 'postgres', 'git', 'user', 'pi', 'ftpuser', 'guest', 'www', 'deploy2', 'jenkins', 'hadoop', 'nagios', 'tomcat', 'mysql', 'support', 'ansible', 'redis', 'minecraft', 'steam', 'zabbix', 'webmaster', 'data', 'sysadmin'];
const UAS_USER = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Mobile Safari/537.36',
];
const UAS_BOT = [
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
  'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)',
  'Mozilla/5.0 (compatible; MJ12bot/v1.4.8; http://mj12bot.com/)',
];
const UAS_SCAN = ['python-requests/2.28.1', 'curl/7.68.0', 'Go-http-client/1.1', 'Mozilla/5.0 zgrab/0.x', 'masscan/1.3 (https://github.com/robertdavidgraham/masscan)', 'Mozilla/5.0 (X11; Linux x86_64; rv:91.0) Gecko/20100101 Firefox/91.0', 'libwww-perl/6.43', 'Wget/1.20.3 (linux-gnu)'];
const PATHS_OK = ['/', '/', '/', '/index.php', '/about/', '/services/', '/contact/', '/quote/', '/track/', '/careers/', '/wp-content/themes/twentytwenty/style.css', '/wp-includes/js/jquery/jquery.min.js', '/wp-content/uploads/2026/09/dock-photo.jpg', '/favicon.ico', '/robots.txt', '/feed/', '/sitemap.xml', '/news/'];
const PATHS_SCAN = ['/wp-login.php', '/wp-login.php', '/xmlrpc.php', '/wp-admin/', '/.env', '/phpmyadmin/', '/admin/', '/administrator/', '/.git/config', '/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php', '/cgi-bin/luci', '/actuator/health', '/server-status', '/wp-config.php.bak', '/backup.zip', '/config.json', '/boaform/admin/formLogin', '/HNAP1/', '/solr/admin/info/system', '/owa/auth/logon.aspx', '/console/', '/.aws/credentials', '/wp-content/plugins/wp-file-manager/readme.txt'];
const REFS = ['-', '-', '-', 'https://www.google.com/', 'https://www.bing.com/', 'https://duckduckgo.com/'];
const FW_PORTS = [22, 23, 80, 443, 445, 1433, 3306, 3389, 5900, 8080, 8443, 21, 25, 110, 139, 5060, 6379, 9200, 27017, 1900, 5432, 2323, 8888, 81, 7547];
const LAN_STAFF_CMDS = ['/usr/bin/apt update', '/usr/bin/systemctl status apache2', '/usr/bin/tail -n 50 /var/log/syslog', '/usr/bin/journalctl -u ssh', '/bin/ls /root', '/usr/sbin/service cron status'];
const CRON_CMDS = ['   cd / && run-parts --report /etc/cron.hourly', '[ -x /usr/lib/php/sessionclean ] && /usr/lib/php/sessionclean', '/usr/bin/test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.daily )', 'command -v debian-sa1 > /dev/null && debian-sa1 1 1', '/usr/local/bin/logrotate-check.sh', '/usr/lib/ubuntu-release-upgrader/release-upgrade-motd'];
const SYSTEMD = ['Started Daily apt download activities.', 'Started Daily apt upgrade and clean activities.', 'Starting Rotate log files...', 'Started Rotate log files.', 'Starting Message of the Day...', 'Started Session 4821 of user ops.', 'Starting Daily man-db regeneration...'];
const SQL_NOISE = ['SELECT id,ref,status FROM shipments WHERE status = $1 ORDER BY updated DESC LIMIT 50', 'UPDATE shipments SET status = $1 WHERE id = $2', 'SELECT count(*) FROM shipments', 'INSERT INTO audit_log(actor,action) VALUES ($1,$2)', 'SELECT * FROM members WHERE member_no = $1', 'SELECT balance FROM accounts WHERE member_no = $1'];

// ---------- Windows Security rendering (Splunk "WinEventLog" key=value + Message block) ----------
const SID_BASE = 'S-1-5-21-3623811015-3361044348-30300820';
const ridOf = (name) => 1000 + (hash(name.length * 131 + name.charCodeAt(0) * 17 + name.charCodeAt(name.length - 1)) % 4000);
const sidFor = (name) => (/^(administrator)$/i.test(name) ? `${SID_BASE}-500` : /^(guest)$/i.test(name) ? `${SID_BASE}-501` : `${SID_BASE}-${ridOf(name)}`);

const WIN_META = {
  4624: ['Logon', 'Audit Success', 'An account was successfully logged on.'],
  4625: ['Logon', 'Audit Failure', 'An account failed to log on.'],
  4634: ['Logoff', 'Audit Success', 'An account was logged off.'],
  4672: ['Special Logon', 'Audit Success', 'Special privileges assigned to new logon.'],
  4688: ['Process Creation', 'Audit Success', 'A new process has been created.'],
  4698: ['Other Object Access Events', 'Audit Success', 'A scheduled task was created.'],
  4720: ['User Account Management', 'Audit Success', 'A user account was created.'],
  4722: ['User Account Management', 'Audit Success', 'A user account was enabled.'],
  4724: ['User Account Management', 'Audit Success', 'An attempt was made to reset an account\'s password.'],
  4728: ['Security Group Management', 'Audit Success', 'A member was added to a security-enabled global group.'],
  4732: ['Security Group Management', 'Audit Success', 'A member was added to a security-enabled local group.'],
  4768: ['Kerberos Authentication Service', 'Audit Success', 'A Kerberos authentication ticket (TGT) was requested.'],
  4769: ['Kerberos Service Ticket Operations', 'Audit Success', 'A Kerberos service ticket was requested.'],
  808: ['None', 'Classic', 'The print spooler failed to load a plug-in module.'],
};
const T = '\t';

function winRaw(e) {
  const f = e.fields; const P = e.P; const code = f.EventCode;
  const [task, kw, title] = WIN_META[code] || ['None', 'Audit Success', 'Event'];
  const host = e.host.toUpperCase();
  const comp = `${host}.${P.domain}`;
  const subj = f.Subject_Account_Name || `${host}$`;
  const subjDom = f.Subject_Account_Domain || P.netbios;
  const subjLine = (lid = '0x3E7') => `Subject:\n${T}Security ID:${T}${T}${subjDom === P.netbios && !/\$$/.test(subj) ? sidFor(subj) : 'S-1-5-18'}\n${T}Account Name:${T}${T}${subj}\n${T}Account Domain:${T}${T}${subjDom}\n${T}Logon ID:${T}${T}${lid}`;
  const user = f.user || '-';
  const netInfo = `Network Information:\n${T}Workstation Name:${T}${f.Workstation_Name || '-'}\n${T}Source Network Address:${T}${f.src_ip || '-'}\n${T}Source Port:${T}${T}${f.src_port || '-'}`;
  const lt = f.Logon_Type || 3;
  const lid = '0x' + hex(hash(e.i * 7 + 3) & 0xffffff, 6);
  let msg;
  switch (code) {
    case 4624:
      msg = `${title}\n\n${subjLine()}\n\nLogon Information:\n${T}Logon Type:${T}${T}${lt}\n${T}Restricted Admin Mode:${T}-\n${T}Virtual Account:${T}${T}No\n${T}Elevated Token:${T}${T}${/admin/i.test(user) || /svc-/.test(user) ? 'Yes' : 'No'}\n\nImpersonation Level:${T}${T}Impersonation\n\nNew Logon:\n${T}Security ID:${T}${T}${sidFor(user)}\n${T}Account Name:${T}${T}${user}\n${T}Account Domain:${T}${T}${f.Account_Domain || P.netbios}\n${T}Logon ID:${T}${T}${lid}\n${T}Linked Logon ID:${T}${T}0x0\n${T}Network Account Name:${T}-\n${T}Network Account Domain:${T}-\n${T}Logon GUID:${T}${T}{00000000-0000-0000-0000-000000000000}\n\nProcess Information:\n${T}Process ID:${T}${T}0x0\n${T}Process Name:${T}${T}-\n\n${netInfo}\n\nDetailed Authentication Information:\n${T}Logon Process:${T}${T}${lt === 3 ? 'NtLmSsp ' : 'Advapi  '}\n${T}Authentication Package:${T}${lt === 3 ? 'NTLM' : 'Negotiate'}\n${T}Transited Services:${T}-\n${T}Package Name (NTLM only):${T}${lt === 3 ? 'NTLM V2' : '-'}\n${T}Key Length:${T}${T}${lt === 3 ? 128 : 0}`;
      break;
    case 4625:
      msg = `${title}\n\n${subjLine()}\n\nLogon Type:${T}${T}${T}${lt}\n\nAccount For Which Logon Failed:\n${T}Security ID:${T}${T}S-1-0-0\n${T}Account Name:${T}${T}${user}\n${T}Account Domain:${T}${T}${f.Account_Domain || P.netbios}\n\nFailure Information:\n${T}Failure Reason:${T}${T}Unknown user name or bad password.\n${T}Status:${T}${T}${T}0xC000006D\n${T}Sub Status:${T}${T}0xC000006A\n\nProcess Information:\n${T}Caller Process ID:${T}0x0\n${T}Caller Process Name:${T}-\n\n${netInfo}\n\nDetailed Authentication Information:\n${T}Logon Process:${T}${T}NtLmSsp \n${T}Authentication Package:${T}NTLM\n${T}Transited Services:${T}-\n${T}Package Name (NTLM only):${T}-\n${T}Key Length:${T}${T}0`;
      break;
    case 4634:
      msg = `${title}\n\nSubject:\n${T}Security ID:${T}${T}${sidFor(user)}\n${T}Account Name:${T}${T}${user}\n${T}Account Domain:${T}${T}${f.Account_Domain || P.netbios}\n${T}Logon ID:${T}${T}${lid}\n\nLogon Type:${T}${T}${T}${lt}\n\nThis event is generated when a logon session is destroyed. It may be positively correlated with a logon event using the Logon ID value. Logon IDs are only unique between reboots on the same computer.`;
      break;
    case 4672:
      msg = `${title}\n\nSubject:\n${T}Security ID:${T}${T}${sidFor(user)}\n${T}Account Name:${T}${T}${user}\n${T}Account Domain:${T}${T}${f.Account_Domain || P.netbios}\n${T}Logon ID:${T}${T}${lid}\n\nPrivileges:${T}${T}SeSecurityPrivilege\n${T}${T}${T}SeBackupPrivilege\n${T}${T}${T}SeRestorePrivilege\n${T}${T}${T}SeTakeOwnershipPrivilege\n${T}${T}${T}SeDebugPrivilege\n${T}${T}${T}SeSystemEnvironmentPrivilege\n${T}${T}${T}SeLoadDriverPrivilege\n${T}${T}${T}SeImpersonatePrivilege`;
      break;
    case 4688:
      msg = `${title}\n\nCreator Subject:\n${T}Security ID:${T}${T}${sidFor(user)}\n${T}Account Name:${T}${T}${user}\n${T}Account Domain:${T}${T}${f.Account_Domain || P.netbios}\n${T}Logon ID:${T}${T}${lid}\n\nTarget Subject:\n${T}Security ID:${T}${T}S-1-0-0\n${T}Account Name:${T}${T}-\n\nProcess Information:\n${T}New Process ID:${T}${T}0x${hex(hash(e.i) & 0xfff, 4)}\n${T}New Process Name:${T}${f.New_Process_Name}\n${T}Token Elevation Type:${T}%%1938\n${T}Creator Process ID:${T}0x${hex(hash(e.i + 9) & 0xfff, 4)}\n${T}Process Command Line:${T}${f.Process_Command_Line || ''}`;
      break;
    case 4720:
      msg = `${title}\n\n${subjLine(lid)}\n\nNew Account:\n${T}Security ID:${T}${T}${sidFor(f.Target_Account_Name)}\n${T}Account Name:${T}${T}${f.Target_Account_Name}\n${T}Account Domain:${T}${T}${f.Target_Account_Domain || P.netbios}\n\nAttributes:\n${T}SAM Account Name:${T}${f.Target_Account_Name}\n${T}Display Name:${T}${T}${f.Display_Name || '<value not set>'}\n${T}User Principal Name:${T}-\n${T}Home Directory:${T}${T}<value not set>\n${T}Primary Group ID:${T}${T}513\n${T}Account Expires:${T}${T}<never>\n${T}User Account Control:${T}\n${T}${T}Account Disabled\n${T}${T}'Password Not Required' - Enabled`;
      break;
    case 4722:
      msg = `${title}\n\n${subjLine(lid)}\n\nTarget Account:\n${T}Security ID:${T}${T}${sidFor(f.Target_Account_Name)}\n${T}Account Name:${T}${T}${f.Target_Account_Name}\n${T}Account Domain:${T}${T}${f.Target_Account_Domain || P.netbios}`;
      break;
    case 4724:
      msg = `${title}\n\n${subjLine(lid)}\n\nTarget Account:\n${T}Security ID:${T}${T}${sidFor(f.Target_Account_Name)}\n${T}Account Name:${T}${T}${f.Target_Account_Name}\n${T}Account Domain:${T}${T}${P.netbios}`;
      break;
    case 4728:
    case 4732:
      msg = `${title}\n\n${subjLine(lid)}\n\nMember:\n${T}Security ID:${T}${T}${sidFor(f.Target_Account_Name)}\n${T}Account Name:${T}${T}CN=${f.Target_Account_Name},CN=Users,DC=${P.domain.split('.').join(',DC=')}\n\nGroup:\n${T}Security ID:${T}${T}${code === 4728 ? SID_BASE + '-' + (f.Group_Rid || 512) : 'S-1-5-32-' + (f.Group_Rid || 544)}\n${T}Group Name:${T}${T}${f.Group_Name}\n${T}Group Domain:${T}${T}${code === 4728 ? P.netbios : 'Builtin'}\n\nAdditional Information:\n${T}Privileges:${T}${T}-`;
      break;
    case 4768:
      msg = `${title}\n\nAccount Information:\n${T}Account Name:${T}${T}${user}\n${T}Supplied Realm Name:${T}${P.netbios}\n${T}User ID:${T}${T}${T}${sidFor(user)}\n\nService Information:\n${T}Service Name:${T}${T}krbtgt\n${T}Service ID:${T}${T}${SID_BASE}-502\n\nNetwork Information:\n${T}Client Address:${T}${T}::ffff:${f.src_ip}\n${T}Client Port:${T}${T}${f.src_port || 49152}\n\nAdditional Information:\n${T}Ticket Options:${T}${T}0x40810010\n${T}Result Code:${T}${T}0x0\n${T}Ticket Encryption Type:${T}0x12\n${T}Pre-Authentication Type:${T}2`;
      break;
    case 4769:
      msg = `${title}\n\nAccount Information:\n${T}Account Name:${T}${T}${user}@${P.domain.toUpperCase()}\n${T}Account Domain:${T}${T}${P.domain.toUpperCase()}\n${T}Logon GUID:${T}${T}{00000000-0000-0000-0000-000000000000}\n\nService Information:\n${T}Service Name:${T}${T}${f.Service_Name}\n${T}Service ID:${T}${T}${sidFor(f.Service_Name.replace(/\$$/, ''))}\n\nNetwork Information:\n${T}Client Address:${T}${T}::ffff:${f.src_ip}\n${T}Client Port:${T}${T}${f.src_port || 49152}\n\nAdditional Information:\n${T}Ticket Options:${T}${T}0x40810000\n${T}Ticket Encryption Type:${T}0x12\n${T}Failure Code:${T}${T}0x0\n${T}Transited Services:${T}-`;
      break;
    case 4698:
      msg = `${title}\n\n${subjLine(lid)}\n\nTask Information:\n${T}Task Name: ${T}${T}\\${f.Task_Name}\n${T}Task Content: ${T}${T}<?xml version="1.0" encoding="UTF-16"?><Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers><Principals><Principal id="Author"><UserId>${P.netbios}\\${subj}</UserId><RunLevel>HighestAvailable</RunLevel></Principal></Principals><Actions Context="Author"><Exec><Command>${f.Task_Command}</Command></Exec></Actions></Task>`;
      break;
    case 808:
      return `${fmtWin(e.t)}\nLogName=Microsoft-Windows-PrintService/Admin\nSourceName=Microsoft-Windows-PrintService\nEventCode=808\nEventType=2\nType=Error\nComputerName=${comp}\nUser=NOT_TRANSLATED\nCategory=None\nCategoryString=None\nRecordNumber=${70000 + (e.i % 90000)}\nKeywords=Classic\nMessage=The print spooler failed to load a plug-in module ${f.Module}, error code 0x45a. See the event user data for context information.`;
    default:
      msg = title;
  }
  return `${fmtWin(e.t)}\nLogName=Security\nEventCode=${code}\nEventType=0\nComputerName=${comp}\nSourceName=Microsoft Windows security auditing.\nType=Information\nRecordNumber=${1000000 + e.i}\nKeywords=${kw}\nTaskCategory=${task}\nOpCode=Info\nMessage=${msg}`;
}

// ---------- the other templates (real log formats) ----------
function webRaw(e) {
  const f = e.fields;
  return `${f.src_ip} - ${f.user || '-'} [${fmtApache(e.t)}] "${f.method} ${f.uri} HTTP/1.1" ${f.status} ${f.bytes} "${f.referer || '-'}" "${f.useragent}"`;
}
function authRaw(e) {
  const f = e.fields; const h = e.host; const pre = `${fmtSyslog(e.t)} ${h}`; const pid = f.pid; const ip = f.src_ip; const port = f.src_port;
  switch (e.sub) {
    case 'failed_invalid': return `${pre} sshd[${pid}]: Failed password for invalid user ${f.user} from ${ip} port ${port} ssh2`;
    case 'failed_user': return `${pre} sshd[${pid}]: Failed password for ${f.user} from ${ip} port ${port} ssh2`;
    case 'invalid': return `${pre} sshd[${pid}]: Invalid user ${f.user} from ${ip} port ${port}`;
    case 'closed': return `${pre} sshd[${pid}]: Connection closed by authenticating user ${f.user} ${ip} port ${port} [preauth]`;
    case 'disconnect': return `${pre} sshd[${pid}]: Received disconnect from ${ip} port ${port}:11: Bye Bye [preauth]`;
    case 'accepted_pw': return `${pre} sshd[${pid}]: Accepted password for ${f.user} from ${ip} port ${port} ssh2`;
    case 'accepted_key': return `${pre} sshd[${pid}]: Accepted publickey for ${f.user} from ${ip} port ${port} ssh2: RSA SHA256:${f.fp}`;
    case 'session_open': return `${pre} sshd[${pid}]: pam_unix(sshd:session): session opened for user ${f.user} by (uid=0)`;
    case 'session_close': return `${pre} sshd[${pid}]: pam_unix(sshd:session): session closed for user ${f.user}`;
    case 'wpfail': return `${pre} wordpress(${f.site})[${pid}]: Authentication failure for ${f.user} from ${ip}`;
    case 'wpok': return `${pre} wordpress(${f.site})[${pid}]: Accepted password for ${f.user} from ${ip}`;
    case 'sudo': return `${pre} sudo: ${f.user} : TTY=${f.tty} ; PWD=${f.pwd} ; USER=root ; COMMAND=${f.command}`;
    default: return `${pre} sshd[${pid}]: ${f.message || 'Server listening on 0.0.0.0 port 22.'}`;
  }
}
function cronRaw(e) {
  const f = e.fields; const pre = `${fmtSyslog(e.t)} ${e.host}`;
  if (e.sub === 'systemd') return `${pre} systemd[1]: ${f.message}`;
  if (e.sub === 'cron_open') return `${pre} CRON[${f.pid}]: pam_unix(cron:session): session opened for user ${f.user} by (uid=0)`;
  return `${pre} CRON[${f.pid}]: (${f.user}) CMD (${f.command})`;
}
function fwRaw(e) {
  const f = e.fields;
  const proto = f.proto;
  const tail = proto === 'tcp' ? `${f.length || 60},${f.src_ip},${f.dest_ip},${f.src_port},${f.dest_port},0,${f.flags || 'S'},${f.seq || hash(e.i)},,${f.window || 64240},,mss` : proto === 'udp' ? `${f.length || 76},${f.src_ip},${f.dest_ip},${f.src_port},${f.dest_port},${(f.length || 76) - 8}` : `${f.length || 84},${f.src_ip},${f.dest_ip},request`;
  const protoNum = proto === 'tcp' ? 6 : proto === 'udp' ? 17 : 1;
  return `${fmtSyslog(e.t)} ${e.host} filterlog[${f.pid}]: ${f.rule},,,${f.tracker},${f.iface},match,${f.action},${f.dir},4,0x0,,${f.ttl},${f.ipid},0,${proto === 'tcp' ? 'DF' : 'none'},${protoNum},${proto},${tail}`;
}
function mailRaw(e) {
  const f = e.fields; const pre = `${fmtSyslog(e.t)} ${e.host}`; const ip = f.src_ip; const pid = f.pid;
  switch (e.sub) {
    case 'connect': return `${pre} postfix/smtpd[${pid}]: connect from unknown[${ip}]`;
    case 'disconnect': return `${pre} postfix/smtpd[${pid}]: disconnect from unknown[${ip}] ehlo=1 mail=0 rcpt=0 commands=1`;
    case 'reject': return `${pre} postfix/smtpd[${pid}]: NOQUEUE: reject: RCPT from unknown[${ip}]: 554 5.7.1 <${f.rcpt}>: Relay access denied; from=<${f.from}> to=<${f.rcpt}> proto=ESMTP helo=<${f.helo}>`;
    case 'sent': return `${pre} postfix/smtp[${pid}]: ${f.qid}: to=<${f.rcpt}>, relay=${f.relay}[${f.relay_ip}]:25, delay=${f.delay}, delays=0.05/0.01/0.4/0.1, dsn=2.0.0, status=sent (250 2.0.0 Ok: queued as ${f.qid2})`;
    case 'qmgr': return `${pre} postfix/qmgr[${pid}]: ${f.qid}: from=<${f.from}>, size=${f.size}, nrcpt=1 (queue active)`;
    case 'imap_login': return `${pre} dovecot: imap-login: Login: user=<${f.user}>, method=PLAIN, rip=${ip}, lip=${f.lip}, mpid=${pid}, TLS, session=<${f.session}>`;
    case 'imap_fail': return `${pre} dovecot: imap-login: Disconnected (auth failed, 1 attempts in 2 secs): user=<${f.user}>, method=PLAIN, rip=${ip}, lip=${f.lip}, TLS, session=<${f.session}>`;
    default: return `${pre} postfix/smtpd[${pid}]: ${f.message}`;
  }
}
function dbRaw(e) {
  const f = e.fields; const pid = f.pid;
  if (e.P.dbKind === 'postgres') {
    const ts = fmtPg(e.t, f.ms);
    switch (e.sub) {
      case 'pg_received': return `${ts} [${pid}] LOG:  connection received: host=${f.src_ip} port=${f.src_port}`;
      case 'pg_auth': return `${ts} [${pid}] ${f.user}@${f.database} LOG:  connection authorized: user=${f.user} database=${f.database} application_name=${f.app || 'psql'}`;
      case 'pg_role': return `${ts} [${pid}] FATAL:  role "${f.user}" does not exist`;
      case 'pg_db': return `${ts} [${pid}] FATAL:  database "${f.database}" does not exist`;
      case 'pg_stmt': return `${ts} [${pid}] ${f.user}@${f.database} LOG:  statement: ${f.statement}`;
      case 'pg_dur': return `${ts} [${pid}] ${f.user}@${f.database} LOG:  duration: ${f.duration} ms  statement: ${f.statement}`;
      default: return `${ts} [${pid}] LOG:  checkpoint starting: time`;
    }
  }
  switch (e.sub) {
    case 'my_denied': return `${fmtMy(e.t, f.ms + '000')} ${f.thread} [Note] [MY-010926] [Server] Access denied for user '${f.user}'@'${f.src_ip}' (using password: ${f.pw || 'YES'})`;
    case 'my_abort': return `${fmtMy(e.t, f.ms + '000')} ${f.thread} [Warning] [MY-010055] [Server] Aborted connection ${f.thread} to db: 'shipments' user: '${f.user}' host: '${f.src_ip}' (Got timeout reading communication packets)`;
    default: return `${fmtMy(e.t, f.ms + '000')} 0 [System] [MY-010931] [Server] /usr/sbin/mysqld: ready for connections. Version: '8.0.35-0ubuntu0.20.04.1'  socket: '/var/run/mysqld/mysqld.sock'  port: 3306`;
  }
}
const TEMPLATES = { web: webRaw, auth: authRaw, cron: cronRaw, fw: fwRaw, win: winRaw, mail: mailRaw, db: dbRaw };
const INDEX_OF = { web: 'web', auth: 'linux', cron: 'linux', fw: 'network', win: 'windows', mail: 'mail', db: 'database' };

class Ev {
  constructor(i, t, kind, sub, host, P, fields) {
    this.i = i; this.t = t; this.kind = kind; this.sub = sub; this.host = host; this.P = P; this.fields = fields;
    this._raw = undefined;
  }
  get raw() { return this._raw !== undefined ? this._raw : (this._raw = TEMPLATES[this.kind](this)); }
  get index() { return INDEX_OF[this.kind]; }
  get source() {
    switch (this.kind) {
      case 'web': return '/var/log/apache2/access.log';
      case 'auth': return '/var/log/auth.log';
      case 'cron': return '/var/log/syslog';
      case 'fw': return 'udp:514';
      case 'win': return this.fields.EventCode === 808 ? 'WinEventLog:Microsoft-Windows-PrintService/Admin' : 'WinEventLog:Security';
      case 'mail': return '/var/log/mail.log';
      default: return this.P.dbKind === 'postgres' ? '/var/log/postgresql/postgresql-14-main.log' : '/var/log/mysql/error.log';
    }
  }
  get sourcetype() {
    switch (this.kind) {
      case 'web': return 'access_combined';
      case 'auth': return 'linux_secure';
      case 'cron': return 'syslog';
      case 'fw': return 'pfsense:filterlog';
      case 'win': return this.fields.EventCode === 808 ? 'WinEventLog:Microsoft-Windows-PrintService/Admin' : 'WinEventLog:Security';
      case 'mail': return this.sub.startsWith('imap') ? 'dovecot' : 'postfix';
      default: return this.P.dbKind === 'postgres' ? 'postgresql' : 'mysqld_error';
    }
  }
}

// ---------- scenario profile ----------
function buildProfile(scenario, story) {
  const P = { ...story.profile };
  const byId = {};
  for (const d of scenario.devices || []) byId[d.id] = d;
  P.ipOf = {};
  for (const [id, d] of Object.entries(byId)) P.ipOf[id] = d.ip;
  P.wanIp = byId[P.fw]?.ip || '203.0.113.2';
  P.ip = (host) => P.ipOf[host] || P.ipOf.web01 || '10.0.0.1';
  return P;
}

const KIND_ORDER = ['web', 'auth', 'fw', 'win', 'ws', 'mail', 'db', 'cron'];

/**
 * @param {object} scenario  CCDC lab scenario (devices[] with id/ip, findings[] with id/host)
 * @param {{seed?:number,total?:number,spanSec?:number,startEpoch?:number,liveRate?:number}} opts
 */
export function createSiem(scenario, opts = {}) {
  const story = opts.story || STORIES[scenario.id];
  if (!story) throw new Error(`No SIEM story for scenario ${scenario.id}`);
  const seed = opts.seed ?? 1;
  const total = opts.total ?? 2_300_000;
  const spanSec = opts.spanSec ?? story.spanSec ?? 24 * 3600;
  const roundStart = opts.roundStart ?? story.roundStart;
  const startEpoch = opts.startEpoch ?? roundStart - spanSec;
  const liveRate = opts.liveRate ?? 60;
  const P = buildProfile(scenario, story);
  const stride = spanSec / total;
  let idHash = 0; for (const ch of scenario.id) idHash = (Math.imul(idHash, 31) + ch.charCodeAt(0)) | 0;
  const seedMix = (Math.imul(seed, 0x9e3779b1) + idHash) | 0;
  const saltIp = hash(seed * 31 + 7);

  // pools
  const visitors = makePool(2500, saltIp ^ 1);
  const bots = makePool(700, saltIp ^ 2);
  const scanners = makePool(4000, saltIp ^ 3);
  const sshLoud = makePool(12, saltIp ^ 4);
  const sshAll = makePool(5000, saltIp ^ 5);
  const fwAll = makePool(3500, saltIp ^ 6);
  const fwLoud = makePool(10, saltIp ^ 7);
  const mailIps = makePool(900, saltIp ^ 8);
  const fwPopular = makePool(40, saltIp ^ 9);

  // kind thresholds (per mille)
  const hasMail = !!P.mail;
  const W = { web: 330, auth: 140, fw: 190, win: 110, ws: 20, mail: hasMail ? 80 : 0, db: 50, cron: 80 };
  if (!hasMail) W.web += 80;
  const cum = []; let acc = 0;
  for (const k of KIND_ORDER) { acc += W[k]; cum.push(acc); }

  const tOf = (i) => (i < total ? startEpoch + Math.floor(i * stride) : roundStart + Math.floor((i - total) / liveRate));
  const indexAtTime = (t) => {
    if (t <= startEpoch) return 0;
    if (t <= roundStart) { let i = Math.ceil((t - startEpoch) / stride); while (i > 0 && tOf(i - 1) >= t) i--; while (tOf(i) < t) i++; return Math.min(i, total); }
    return total + (t - roundStart) * liveRate;
  };

  const users = P.adUsers;
  const lan = P.lanPrefix;
  const lanIps = users.map((_, j) => `${lan}.${100 + (j % 100)}`);
  const linuxHosts = P.linux;

  const L = (d, g, host, fields) => d(g, host, fields); // (unused helper kept tiny)
  void L;

  // ---- noise generators; each returns an Ev for index i at time t ----
  const mkWeb = (i, t) => {
    const r = nx() % 100;
    let ip; let method = 'GET'; let uri; let status; let bytes; let ua; let ref = '-';
    if (r < 55) {
      ip = visitors[rnd(visitors.length)]; uri = pick(PATHS_OK); ua = pick(UAS_USER); ref = pick(REFS);
      const s = rnd(100); status = s < 88 ? 200 : s < 94 ? 301 : s < 97 ? 304 : 404;
      bytes = status === 304 ? 0 : status === 301 ? 235 : 600 + rnd(48000);
      if (/\.(jpg|css|js)$/.test(uri)) { ref = 'https://' + P.publicHost + '/'; }
    } else if (r < 80) {
      ip = bots[rnd(bots.length)]; uri = pick(PATHS_OK); ua = pick(UAS_BOT);
      const s = rnd(100); status = s < 85 ? 200 : s < 93 ? 301 : 404; bytes = status === 301 ? 235 : 500 + rnd(30000);
    } else {
      ip = scanners[rnd(scanners.length)]; uri = pick(PATHS_SCAN); ua = pick(UAS_SCAN);
      if (uri === '/wp-login.php' && rnd(100) < 70) method = 'POST';
      if (uri === '/xmlrpc.php') method = 'POST';
      if (uri === '/wp-login.php') { status = method === 'POST' ? 200 : 200; bytes = method === 'POST' ? 5180 + rnd(120) : 4190; }
      else if (uri === '/xmlrpc.php') { status = 200; bytes = 370; }
      else { const s = rnd(100); status = s < 80 ? 404 : s < 95 ? 403 : 301; bytes = status === 404 ? 487 : status === 403 ? 278 : 316; }
    }
    return new Ev(i, t, 'web', '', P.web, P, { src_ip: ip, method, uri, status, bytes, useragent: ua, referer: ref, dest_port: 443, user: '-' });
  };

  const mkAuth = (i, t) => {
    const host = pick(linuxHosts);
    const pid = 1000 + rnd(60000); const port = 1024 + rnd(60000);
    const r = nx() % 10000;
    let sub; let ip; let user;
    if (r < 5400) { sub = 'failed_invalid'; user = pick(BAD_USERS); }
    else if (r < 7000) { sub = 'failed_user'; user = 'root'; }
    else if (r < 7900) { sub = 'invalid'; user = pick(BAD_USERS); }
    else if (r < 8500) { sub = 'closed'; user = rnd(2) ? 'root' : pick(BAD_USERS); }
    else if (r < 9500) { sub = 'disconnect'; user = '-'; }
    else if (r < 9510) { sub = 'accepted_pw'; user = pick(P.linuxUsers); ip = pick(lanIps); }
    else if (r < 9525) { sub = 'accepted_key'; user = pick(P.linuxUsers); ip = pick(lanIps); }
    else if (r < 9532) { sub = P.wp ? 'wpfail' : 'failed_invalid'; user = pick(['admin', 'admin', 'administrator', 'editor', 'test']); }
    else if (r < 9780) { sub = 'sudo'; user = pick(P.linuxUsers); }
    else if (r < 9890) { sub = 'session_open'; user = pick(P.linuxUsers); }
    else { sub = 'session_close'; user = pick(P.linuxUsers); }
    const inbound = sub === 'failed_invalid' || sub === 'failed_user' || sub === 'invalid' || sub === 'closed' || sub === 'disconnect' || sub === 'wpfail';
    if (inbound) ip = rnd(100) < 25 ? sshLoud[rnd(sshLoud.length)] : sshAll[rnd(sshAll.length)];
    const f = { src_ip: ip || '', user, src_port: port, pid, dest_port: 22, app: sub === 'sudo' ? 'sudo' : sub === 'wpfail' ? 'wordpress' : 'sshd', action: /^failed|invalid|closed|disconnect|wpfail/.test(sub) ? 'failure' : 'success', process: sub === 'sudo' ? 'sudo' : 'sshd' };
    if (sub === 'accepted_key') f.fp = 'x8Qm2rN' + hex(hash(i >>> 3), 8) + 'kP1vYdLw3ZtB6cUeA0sJo9H';
    if (sub === 'wpfail') { f.site = P.domain; f.dest_port = 443; f.app = 'wordpress'; if (host !== P.web) { return mkAuthHost(i, t, P.web, f); } }
    if (sub === 'sudo') { f.tty = rnd(2) ? 'pts/0' : 'pts/1'; f.pwd = '/home/' + user; f.command = pick(LAN_STAFF_CMDS); f.src_ip = ''; }
    return new Ev(i, t, 'auth', sub, host, P, f);
  };
  const mkAuthHost = (i, t, host, f) => new Ev(i, t, 'auth', 'wpfail', host, P, f);

  const mkFw = (i, t) => {
    const r = nx() % 100;
    const pid = 30000 + rnd(30000);
    let f;
    if (r < 78) {
      const loud = rnd(100) < 22;
      f = { src_ip: loud ? fwLoud[rnd(fwLoud.length)] : fwAll[rnd(fwAll.length)], dest_ip: P.wanIp, src_port: 1024 + rnd(64000), dest_port: pick(FW_PORTS), proto: 'tcp', action: 'block', dir: 'in', iface: 'em0', rule: 5, tracker: '1000000103', flags: 'S', ttl: 40 + rnd(24), ipid: rnd(65535), pid, length: 60 };
    } else if (r < 97) {
      const h = pick(P.lanHosts); const dp = pick([443, 443, 443, 80, 53, 123]);
      f = { src_ip: P.ip(h), dest_ip: fwPopular[rnd(fwPopular.length)], src_port: 1024 + rnd(60000), dest_port: dp, proto: dp === 53 || dp === 123 ? 'udp' : 'tcp', action: 'pass', dir: 'out', iface: 'em0', rule: 12, tracker: '1000000110', flags: 'S', ttl: 128, ipid: rnd(65535), pid, length: 60 };
    } else {
      f = { src_ip: visitors[rnd(visitors.length)], dest_ip: P.ip(P.web), src_port: 1024 + rnd(64000), dest_port: rnd(2) ? 443 : 80, proto: 'tcp', action: 'pass', dir: 'in', iface: 'em0', rule: 8, tracker: '1000000108', flags: 'S', ttl: 50 + rnd(10), ipid: rnd(65535), pid, length: 60 };
    }
    return new Ev(i, t, 'fw', '', P.fw, P, f);
  };

  const WIN_CODES = [4624, 4624, 4624, 4624, 4634, 4634, 4634, 4634, 4634, 4672, 4672, 4768, 4768, 4769, 4769, 4769, 4625, 4624, 4634, 4769];
  const mkWin = (i, t) => {
    const code = pick(WIN_CODES);
    const ui = rnd(users.length);
    const user = users[ui]; const machine = pick(P.winMachines);
    const f = { EventCode: code, user, Account_Name: user, src_ip: pick(lanIps), src_port: 49152 + rnd(16000), Logon_Type: rnd(10) < 7 ? 3 : 2, Workstation_Name: machine, Account_Domain: P.netbios, action: code === 4625 ? 'failure' : 'success', dest: P.dc };
    if (code === 4672 || code === 4634 && rnd(4) === 0) { f.Logon_Type = 3; }
    if (code === 4624 && rnd(5) === 0) { f.user = machine + '$'; f.Account_Name = f.user; f.src_ip = P.ip(machine.toLowerCase()); }
    if (code === 4672 && rnd(3) === 0) { f.user = pick(P.privUsers); f.Account_Name = f.user; }
    if (code === 4769) { f.Service_Name = rnd(3) ? pick(P.winMachines) + '$' : 'krbtgt'; if (f.Service_Name === 'krbtgt') f.Service_Name = 'krbtgt'; }
    if (code === 4625) { f.Logon_Type = 3; }
    return new Ev(i, t, 'win', '', P.dc, P, f);
  };
  const PROCS = [['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', '"chrome.exe" --type=renderer'], ['C:\\Windows\\System32\\svchost.exe', 'C:\\Windows\\system32\\svchost.exe -k netsvcs -p'], ['C:\\Program Files\\Microsoft Office\\root\\Office16\\EXCEL.EXE', '"EXCEL.EXE" /dde'], ['C:\\Windows\\System32\\taskhostw.exe', 'taskhostw.exe {222A245B-E637-4AE9-A93F-A59CA119A75E}'], ['C:\\Windows\\System32\\wbem\\WmiPrvSE.exe', 'C:\\Windows\\system32\\wbem\\wmiprvse.exe -secured -Embedding']];
  const mkWs = (i, t) => {
    const code = pick([4624, 4634, 4672, 4688, 4688, 4688]);
    const user = pick(users.slice(0, 8));
    const f = { EventCode: code, user, Account_Name: user, src_ip: P.ip(P.ws), src_port: '-', Logon_Type: rnd(3) ? 2 : 7, Workstation_Name: P.ws.toUpperCase(), Account_Domain: P.netbios, action: 'success', dest: P.ws };
    if (code === 4688) { const pr = pick(PROCS); f.New_Process_Name = pr[0]; f.Process_Command_Line = pr[1]; f.process = pr[0].split('\\').pop(); }
    return new Ev(i, t, 'win', '', P.ws, P, f);
  };

  const mkMail = (i, t) => {
    const r = nx() % 100; const ip = mailIps[rnd(mailIps.length)]; const pid = 1000 + rnd(30000);
    const qid = hex(hash(i) & 0xfffff, 5) + hex(hash(i + 1) & 0xfffff, 5);
    const f = { src_ip: ip, pid, dest_port: 25, lip: P.ip(P.mail), session: hex(hash(i + 2), 8) + '/' + hex(hash(i + 3), 8), qid, qid2: hex(hash(i + 4) & 0xfffff, 5), from: `news@${pick(['mailer.example', 'notify.example', 'shop.example'])}`, rcpt: `${pick(users)}@${P.domain.replace('.local', '.example')}`, helo: 'mx' + rnd(9) + '.example', size: 1000 + rnd(90000), relay: 'mx.partner.example', relay_ip: '192.0.2.' + (1 + rnd(250)), delay: (rnd(300) / 100).toFixed(2) };
    let sub;
    if (r < 22) sub = 'connect'; else if (r < 42) sub = 'disconnect'; else if (r < 52) sub = 'reject'; else if (r < 66) sub = 'qmgr'; else if (r < 80) sub = 'sent'; else if (r < 96) { sub = 'imap_login'; f.user = pick(users) + '@' + P.domain.replace('.local', '.example'); f.src_ip = pick(lanIps); } else { sub = 'imap_fail'; f.user = pick(BAD_USERS); }
    f.action = sub === 'imap_fail' || sub === 'reject' ? 'failure' : 'success';
    return new Ev(i, t, 'mail', sub, P.mail, P, f);
  };

  const mkDb = (i, t) => {
    const r = nx() % 100; const pid = 1000 + rnd(30000); const ms = String(100 + rnd(900));
    if (P.dbKind === 'postgres') {
      const f = { src_ip: pick(lanIps.slice(0, 1).concat([P.ip(P.web)])), src_port: 40000 + rnd(20000), pid, ms, user: 'hp_app', database: 'members', dest_port: 5432, app: 'portal', action: 'success' };
      let sub;
      if (r < 22) { sub = 'pg_received'; f.src_ip = P.ip(P.web); }
      else if (r < 44) { sub = 'pg_auth'; f.src_ip = P.ip(P.web); }
      else if (r < 54) { sub = 'pg_role'; f.src_ip = sshAll[rnd(sshAll.length)]; f.user = pick(BAD_USERS); f.action = 'failure'; }
      else if (r < 58) { sub = 'pg_db'; f.src_ip = sshAll[rnd(sshAll.length)]; f.database = pick(['postgres_db', 'test', 'main']); f.action = 'failure'; }
      else if (r < 90) { sub = 'pg_dur'; f.statement = pick(SQL_NOISE); f.duration = (rnd(4000) / 100).toFixed(3); f.src_ip = P.ip(P.web); }
      else sub = 'pg_ckpt';
      return new Ev(i, t, 'db', sub, P.db, P, f);
    }
    const f = { src_ip: sshAll[rnd(sshAll.length)], pid, ms, thread: String(1000 + rnd(9000)), user: pick(['root', 'root', 'admin', 'mysql', 'test', 'wp', 'db']), dest_port: 3306, action: 'failure', app: 'mysqld', pw: rnd(4) ? 'YES' : 'NO' };
    let sub;
    if (r < 60) sub = 'my_denied'; else if (r < 90) { sub = 'my_abort'; f.src_ip = P.ip(P.web); f.user = 'wp'; } else sub = 'my_ready';
    return new Ev(i, t, 'db', sub, P.db, P, f);
  };

  const mkCron = (i, t) => {
    const host = pick(linuxHosts); const r = nx() % 100; const pid = 1000 + rnd(60000);
    if (r < 62) return new Ev(i, t, 'cron', 'cron', host, P, { user: 'root', pid, command: pick(CRON_CMDS), app: 'cron', process: 'CRON' });
    if (r < 76) return new Ev(i, t, 'cron', 'cron_open', host, P, { user: 'root', pid, app: 'cron', process: 'CRON' });
    return new Ev(i, t, 'cron', 'systemd', host, P, { message: pick(SYSTEMD), app: 'systemd', process: 'systemd', pid: 1 });
  };

  const gen = [mkWeb, mkAuth, mkFw, mkWin, mkWs, mkMail, mkDb, mkCron];

  // ---- the hand-written story, placed on its own indices ----
  const overrides = new Map(); // index -> spec
  const ctx = { total, scale: total / 2_300_000, P, startEpoch, roundStart, spanSec };
  const place = (map, spec) => {
    let i = indexAtTime(spec.t);
    if (i >= total && spec.t <= roundStart) i = total - 1;
    while (map.has(i)) i++;
    map.set(i, spec);
    return i;
  };
  const storyIdx = [];
  for (const spec of story.build(ctx)) storyIdx.push(place(overrides, spec));
  storyIdx.sort((a, b) => a - b);

  function fromSpec(i, t, spec) {
    const e = new Ev(i, t, spec.kind, spec.sub || '', spec.host, P, { ...spec.fields });
    if (spec.raw) e._raw = typeof spec.raw === 'function' ? spec.raw(t, e) : spec.raw;
    return e;
  }

  function get(i) {
    const t = tOf(i);
    const ov = overrides.size ? overrides.get(i) : undefined;
    if (ov !== undefined) return fromSpec(i, t, ov);
    S = hash((Math.imul(i, 0x2545f491) + seedMix) | 0);
    const r = nx() % 1000;
    let k = 0;
    while (r >= cum[k]) k++;
    return gen[k](i, t);
  }

  // ---- red-team bursts driven by the engine ----
  const waveLog = [];
  function onWave(findingId, clockSec, outcome) {
    const finding = (scenario.findings || []).find((f) => f.id === findingId);
    const host = finding?.host || P.web;
    const at = roundStart + Math.floor(clockSec);
    const base = total + Math.floor(clockSec * liveRate);
    const n = outcome === 'compromised' ? 18 : 7;
    const specs = story.waveLines ? story.waveLines(ctx, host, outcome, at, n) : [];
    const added = [];
    let idx = base + 1;
    for (const sp of specs) {
      while (overrides.has(idx)) idx++;
      overrides.set(idx, sp);
      added.push(idx++);
    }
    waveLog.push({ findingId, clockSec, outcome, indices: added });
    return added;
  }

  const api = {
    scenarioId: scenario.id, seed, total, spanSec, startEpoch, roundStart, liveRate, profile: P, story,
    hunt: story.hunt, attacker: story.attacker,
    get, tOf, indexAtTime, onWave, waveLog,
    /** number of events that exist `clockSec` seconds into the round */
    count: (clockSec = 0) => total + Math.floor(Math.max(0, clockSec) * liveRate),
    liveAt: (clockSec = 0) => ({ count: total + Math.floor(Math.max(0, clockSec) * liveRate), t: roundStart + Math.floor(clockSec) }),
    storyIndices: storyIdx,
    epochOfClock: (clockSec) => roundStart + Math.floor(clockSec),
  };
  return api;
}

export { SID_BASE };
