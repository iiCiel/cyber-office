// Case file: A.P. Moller-Maersk / NotPetya, Tuesday June 27, 2017. A RECREATION built from public sources. Everything the worm
// ran comes from vendor write-ups (Microsoft, Cisco Talos, BI.ZONE, CISA); hostnames, accounts, addresses and counts are invented.
// The SIEM clock is UTC (Microsoft saw EzVit.exe start rundll32 at about 10:30 GMT).
//
//   Mon 10:14   a helpdesk technician RDPs to the Ukraine office PC with the shared admin account and leaves the session open
//   Tue 06:14   power fails at the Ghana site; its domain controller shuts down cleanly at 06:28 (documented in the real case)
//   Tue 10:33   M.E.Doc's updater (EzVit.exe) starts rundll32 perfc.dat,#1 30 on WS-UA-0412 (T1195.002)
//   Tue 10:33   credential dumper reads LSASS (T1003.001); schtasks reboot is queued; event logs and the USN journal are wiped
//   Tue 10:34   spread: EternalBlue to unpatched SMBv1 hosts, WMIC with the shared local Administrator password (T1078.003, T1047),
//               PsExec with the cached domain admin (T1021.002, T1569.002)
//   Tue 10:38   DC-UA01, then DC-CPH01/02, DC-LON01, DC-NJ01: every domain controller that is online is infected
//   Tue 11:03   first reboot; 11:35-11:50 the rest. Boot record overwritten, file table encrypted (T1561.002)
//
// Decoys: IT's legitimate PsExec and "shutdown /r" patch task, IT's WMIC inventory, the vulnerability scanner's SMB sweep, the
// patched APP-CPH07, routine M.E.Doc updates, the Ghana power loss (a cause, not an attack), a terminal network the firewall protected.

import { T, hms, logBuilder, finishDays, adNoise } from '../../game/logkit.js';
import { HOSTS, PLAN, SITE, hhmm, isDc } from './hosts.js';

export const DATE = { weekday: 'TUE', name: 'Tuesday', month: 'Jun', day: 27, year: 2017, domain: 'corp.example', netbios: 'CORP', utcOffset: 0 };
const DAY = 86400;
const A = (day, h, m, s = 0) => day * DAY + T(h, m, s);
const EPOCH0 = Date.UTC(2017, 5, 27) / 1000;

export const MEDOC_IP = '198.51.100.20';
const SCAN = '10.10.9.20';
const JUMP = '10.10.9.30';
const MON = '10.10.9.40';
const SYS32 = 'C:\\Windows\\System32\\';
const EZVIT = 'C:\\Program Files (x86)\\Medoc\\Medoc\\EzVit.exe'; // stand-in install path; the process name EzVit.exe is from Microsoft
const PW = 'Spring2017!'; // stand-in password that a real WMIC command line would expose

export const IP_INFO = (() => {
  const out = {
    [MEDOC_IP]: { where: 'Internet (documentation range stand-in)', owner: 'upd.me-doc.com.ua (M.E.Doc update server)', note: 'The update server of the Ukrainian tax software M.E.Doc. Talos reports it was proxied to an attacker-controlled host on June 27. The address here is a stand-in.', external: true },
    [SCAN]: { where: 'Internal: core services', owner: 'SCAN01 (vulnerability scanner)', note: 'Scans every site for missing patches on Sundays. Its SMB sweeps are routine.' },
    [JUMP]: { where: 'Internal: core services', owner: 'JUMP-CPH01 (admin jump host)', note: 'Where IT administrators start their sessions.' },
    [MON]: { where: 'Internal: core services', owner: 'MON-CPH01 (Nagios)', note: 'Monitoring. A host that stops answering is reported here.' },
  };
  for (let i = 15; i <= 30; i++) out[`10.40.20.${i}`] = { where: 'Internal: Ukraine office', owner: `10.40.20.${i} (workstation subnet)`, note: 'An address in the Ukraine office workstation subnet, probed by the worm.' };
  for (const hst of Object.values(HOSTS)) out[hst.ip] = { where: `Internal: ${SITE[hst.site]}`, owner: hst.name, note: hst.desc };
  return out;
})();

const p2 = (n) => String(n).padStart(2, '0');
const sysTs = (t) => {
  const d = Math.floor(t / DAY);
  return `Jun ${String(27 + d).padStart(2, ' ')} ${hms(t - d * DAY)}`;
};

let recSeq = 5000000;
/** A Windows event that winevents.js does not template (System 104/1074/6006, Task Scheduler 106, Defender 1116): Splunk's layout, built by hand. */
function winC(b, t, host, o, extra = {}) {
  const d = Math.floor(t / DAY);
  const s = t - d * DAY;
  const h24 = Math.floor(s / 3600);
  const stamp = `06/${p2(27 + d)}/2017 ${p2(h24 % 12 === 0 ? 12 : h24 % 12)}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)} ${h24 < 12 ? 'AM' : 'PM'}`;
  const fqdn = `${host.toUpperCase()}.${DATE.domain}`;
  const raw = [stamp, `LogName=${o.log}`, `EventCode=${o.code}`, `EventType=${o.eventType ?? 4}`, `ComputerName=${fqdn}`, `SourceName=${o.source}`, `Type=${o.type || 'Information'}`, `RecordNumber=${recSeq++}`, 'Keywords=Classic', `TaskCategory=${o.task || 'None'}`, 'OpCode=Info', `Message=${o.message}`].join('\n');
  const msg = `EventCode=${o.code} LogName="${o.log}" SourceName="${o.source}" ComputerName=${fqdn} Message="${o.brief}"`;
  return b.add(t, host, o.src || 'WinSystem', msg, { raw, index: 'wineventlog', sourcetype: `WinEventLog:${o.log}`, srcpath: `WinEventLog:${o.log}`, ...extra });
}

let connSeq = 880000;
/** Cisco ASA syslog, as the firewall writes it. */
function asa(b, t, host, sev, id, text, extra = {}) {
  return b.add(t, host, 'cisco:asa', `%ASA-${sev}-${id}: ${text}`, { raw: `${sysTs(t)} ${host} : %ASA-${sev}-${id}: ${text}`, index: 'network', sourcetype: 'cisco:asa', srcpath: 'udp:514', ...extra });
}
const built = (b, t, fw, src, sp, dst, dp, extra) => asa(b, t, fw, 6, 302013, `Built inbound TCP connection ${connSeq++} for wan:${src}/${sp} (${src}/${sp}) to inside:${dst}/${dp} (${dst}/${dp})`, extra);

/** Snort alert_syslog line. Rule texts and sids are the ones Cisco Talos listed for this outbreak. */
function snort(b, t, host, rule, msg, cls, src, sp, dst, dp, extra = {}) {
  return b.add(t, host, 'ids', `snort[2210]: [${rule}] ${msg} [Classification: ${cls}] [Priority: 1] {TCP} ${src}:${sp} -> ${dst}:${dp}`, { ip: src, ...extra });
}
const EB_RULE = ['1:42944:3', 'OS-WINDOWS Microsoft Windows SMB remote code execution attempt', 'Attempted Administrator Privilege Gain'];
const DP_RULE = ['1:43459:1', 'MALWARE-CNC Win.Trojan.Doublepulsar variant successful ping response', 'A Network Trojan was detected'];

/** Nagios core log line (epoch in brackets). */
function nagios(b, t, text, extra = {}) {
  return b.add(t, 'mon-cph01', 'nagios', text, { raw: `[${EPOCH0 + t}] ${text}`, index: 'network', sourcetype: 'nagios', srcpath: '/usr/local/nagios/var/nagios.log', ...extra });
}

const cmdSched = (st) => `cmd.exe /c schtasks /RU "SYSTEM" /Create /SC once /TN "" /TR "C:\\Windows\\system32\\shutdown.exe /r /f" /ST ${st}`;
const CMD_WEVT = 'cmd.exe /c wevtutil cl Setup & wevtutil cl System & wevtutil cl Security & wevtutil cl Application & fsutil usn deletejournal /D C:';
const LOCAL_SID = 'S-1-5-21-2316849521-1873210992-3320126877-500';

export function generateLogs({ nowMinutes = 24 * 60 } = {}) {
  const b = logBuilder(2706);
  const { r, win, add } = b;
  const jit = (n) => Math.floor(r() * n);
  const services = ['FILE-CPH01$', 'SQL-CPH02$', 'APP-CPH03$', 'DC-CPH01$', 'MAIL-CPH01$'];
  const noise = (users, dc, day, end) => adNoise(b, { users, dc, base: A(day, 0, 0), end, services, nas: false });

  // ---------------- ordinary directory traffic: Monday, and Tuesday until the worm ----------------
  const staff = {
    cph: [['priya.r', 'WS-CPH-0107', '10.10.20.107', T(7, 32)], ['dana.k', 'WS-CPH-0120', '10.10.20.120', T(5, 55)], ['t.okoye', 'WS-CPH-0127', '10.10.20.127', T(7, 55)]],
    ua: [['ua.fin01', 'WS-UA-0412', '10.40.20.12', T(6, 12)], ['ua.fin02', 'WS-UA-0415', '10.40.20.15', T(6, 25)]],
    lon: [['lon.ops01', 'WS-LON-0207', '10.20.20.7', T(8, 3)]],
    nj: [['nj.ops01', 'WS-NJ-0311', '10.30.20.11', T(8, 18)]],
  };
  for (const day of [-1, 0]) {
    const end = T(17, 40);
    noise(staff.cph, 'dc-cph01', day, end);
    noise(staff.ua, 'dc-ua01', day, end);
    noise(staff.lon, 'dc-lon01', day, end);
    noise(staff.nj, 'dc-nj01', day, end);
  }
  noise([['gh.ops01', 'WS-GH-0509', '10.50.20.9', T(5, 12)]], 'dc-gh01', -1, T(17, 40));
  noise([['gh.ops01', 'WS-GH-0509', '10.50.20.9', T(5, 12)]], 'dc-gh01', 0, T(6, 12));

  // ---------------- Ghana: the power cut that, by accident, saved the company's Active Directory ----------------
  add(A(0, 6, 14, 2), 'mon-gh01', 'apcupsd', 'apcupsd[1432]: Power failure.', { key: 'gh-power-fail' });
  add(A(0, 6, 14, 8), 'mon-gh01', 'apcupsd', 'apcupsd[1432]: Running on UPS batteries.');
  add(A(0, 6, 27, 40), 'mon-gh01', 'apcupsd', 'apcupsd[1432]: Reached run time limit on batteries.');
  add(A(0, 6, 27, 41), 'mon-gh01', 'apcupsd', 'apcupsd[1432]: Initiating system shutdown!');
  winC(b, A(0, 6, 28, 12), 'dc-gh01', { log: 'System', code: 6006, source: 'EventLog', task: 'None', message: 'The Event log service was stopped.', brief: 'The Event log service was stopped.' }, { key: 'gh-offline' });
  nagios(b, A(0, 6, 29, 5), 'HOST ALERT: dc-gh01;DOWN;HARD;1;CRITICAL - Host Unreachable (10.50.1.10)');
  nagios(b, A(0, 6, 29, 5), 'HOST ALERT: ws-gh-0509;DOWN;HARD;1;CRITICAL - Host Unreachable (10.50.20.9)');

  // ---------------- Sunday: the vulnerability scanner's routine SMB sweep (decoy) and what it found ----------------
  const targets = ['app-cph03', 'app-cph07', 'ws-ua-0417', 'srv-ua-app01', 'file-cph01', 'ws-cph-0101'];
  targets.forEach((tg, i) => {
    win(A(-2, 2, 4 + i, 11), tg, 4624, { user: 'svc_scan', ip: SCAN, ws: 'SCAN01', type: 3, auth: 'NTLM', logonId: b.logonId() }, { noise: true, user: 'svc_scan', ip: SCAN, key: i === 0 ? 'decoy-scanner' : undefined });
    win(A(-2, 2, 4 + i, 13), tg, 5140, { user: 'svc_scan', ip: SCAN, share: '\\\\*\\IPC$', sharePath: '' }, { noise: true, user: 'svc_scan', ip: SCAN });
  });
  const scanLine = (t, text, extra) => add(t, 'scan01', 'scanner', text, extra);
  scanLine(A(-2, 5, 41, 2), 'job=weekly-credentialed scope=all-sites hosts_scanned=2412 started=02:00 finished=05:41');
  scanLine(A(-2, 5, 41, 3), 'finding host=app-cph03 ip=10.10.1.40 os="Windows Server 2008 R2" check=MS17-010 result=MISSING kb=4012212,4012215 severity=Critical', { key: 'unpatched-list' });
  scanLine(A(-2, 5, 41, 3), 'finding host=srv-ua-app01 ip=10.40.1.30 os="Windows Server 2008 R2" check=MS17-010 result=MISSING kb=4012212,4012215 severity=Critical');
  scanLine(A(-2, 5, 41, 4), 'finding host=ws-ua-0417 ip=10.40.20.17 os="Windows 7 Professional" check=MS17-010 result=MISSING kb=4012212,4012215 severity=Critical');
  scanLine(A(-2, 5, 41, 4), 'finding host=app-cph07 ip=10.10.1.47 os="Windows Server 2012 R2" check=MS17-010 result=PATCHED kb=4012213', { key: 'decoy-patched' });
  scanLine(A(-2, 5, 41, 5), 'summary check=MS17-010 missing=214 hosts (41 servers) smb1_enabled=2290 hosts local_admin_password_identical=1964 hosts');

  // ---------------- Monday: the habits the worm used, and ordinary IT work that looks like it ----------------
  win(A(-1, 10, 14, 6), 'ws-ua-0412', 4624, { user: 'adm.helpdesk', ip: JUMP, ws: 'JUMP-CPH01', type: 10, logonId: '0x4C2A19', elevated: true }, { key: 'adm-session', user: 'adm.helpdesk', ip: JUMP });
  win(A(-1, 10, 14, 7), 'ws-ua-0412', 4672, { user: 'adm.helpdesk', logonId: '0x4C2A19' }, { user: 'adm.helpdesk' });
  win(A(-1, 10, 41, 0), 'ws-ua-0412', 4634, { user: 'adm.helpdesk', type: 3, logonId: '0x4C2A02' }, { noise: true, user: 'adm.helpdesk' }); // the RDP session itself stays "Disconnected"
  win(A(-1, 15, 20, 8), 'dc-cph01', 4688, { user: 'adm.dana', proc: `${SYS32}wbem\\WMIC.exe`, parent: `${SYS32}cmd.exe`, cmd: 'wmic /node:"FILE-CPH01" os get Caption,Version', logonId: '0x51C3E2' }, { noise: true, user: 'adm.dana', key: 'decoy-wmic' });
  win(A(-1, 17, 31, 20), 'prt-cph01', 4624, { user: 'adm.dana', ip: JUMP, ws: 'JUMP-CPH01', type: 3, auth: 'NTLM', logonId: '0x5A11C0' }, { noise: true, user: 'adm.dana', ip: JUMP });
  win(A(-1, 17, 31, 22), 'prt-cph01', 5140, { user: 'adm.dana', ip: JUMP, share: '\\\\*\\ADMIN$', sharePath: '\\??\\C:\\Windows' }, { noise: true, user: 'adm.dana', ip: JUMP });
  win(A(-1, 17, 31, 25), 'prt-cph01', 7045, { service: 'PSEXESVC', path: '%SystemRoot%\\PSEXESVC.exe' }, { noise: true, key: 'decoy-psexec' });
  win(A(-1, 17, 31, 26), 'prt-cph01', 4688, { user: 'adm.dana', proc: `${SYS32}cmd.exe`, parent: 'C:\\Windows\\PSEXESVC.exe', cmd: 'cmd.exe /c net stop spooler & net start spooler', logonId: '0x5A11C0' }, { noise: true, user: 'adm.dana' });
  win(A(-1, 17, 52, 0), 'prt-cph01', 4698, { by: 'svc_patch', task: '\\Patch-Reboot', command: `${SYS32}shutdown.exe`, args: '/r /t 60 /c "Monthly patch reboot (CHG-4417)"', date: '2017-06-26T22:00:00' }, { noise: true, key: 'decoy-task' });
  win(A(-1, 22, 0, 2), 'prt-cph01', 4688, { user: 'SYSTEM', proc: `${SYS32}shutdown.exe`, parent: `${SYS32}taskeng.exe`, cmd: 'shutdown.exe /r /t 60 /c "Monthly patch reboot (CHG-4417)"', logonId: '0x3E7' }, { noise: true });
  winC(b, A(-1, 22, 0, 3), 'prt-cph01', { log: 'System', code: 1074, source: 'User32', message: 'The process C:\\Windows\\system32\\shutdown.exe (PRT-CPH01) has initiated the restart of computer PRT-CPH01 on behalf of user CORP\\svc_patch for the following reason: Operating System: Recovery (Planned)\n Reason Code: 0x80020002\n Shutdown Type: restart\n Comment: Monthly patch reboot (CHG-4417)', brief: 'shutdown.exe initiated the restart of PRT-CPH01 on behalf of CORP\\svc_patch. Comment: Monthly patch reboot (CHG-4417)' }, { noise: true });
  // M.E.Doc's updater checks in every morning at the Ukraine office; nothing about it looks unusual
  for (const d of [-5, -4, -3, -2, -1, 0]) {
    if (d === 0) continue;
    b.sysmon3(A(d, 8, 52, 10 + jit(40)), 'ws-ua-0412', { user: 'CORP\\ua.fin01', image: EZVIT, srcIp: '10.40.20.12', dstIp: MEDOC_IP, dstPort: 80, dstPortName: 'http', dstHost: 'upd.me-doc.com.ua', rule: '-' }, { noise: true, key: d === -1 ? 'decoy-medoc-routine' : undefined });
  }

  // ---------------- Tuesday 10:31: the update, then patient zero ----------------
  const ZERO = HOSTS['ws-ua-0412'];
  const zp = PLAN[0];
  const stZ = hhmm(zp.sched);
  const ZU = 'CORP\\ua.fin01';
  const TMP = 'C:\\Users\\ua.fin01\\AppData\\Local\\Temp\\FD39.tmp';
  b.sysmon3(A(0, 10, 31, 55), 'ws-ua-0412', { user: ZU, image: EZVIT, srcIp: ZERO.ip, dstIp: MEDOC_IP, dstPort: 80, dstPortName: 'http', dstHost: 'upd.me-doc.com.ua', rule: '-' }, { attack: true, key: 'medoc-update' });
  b.sysmon11(A(0, 10, 32, 48), 'ws-ua-0412', { user: ZU, image: EZVIT, file: 'C:\\ProgramData\\perfc.dat' }, { attack: true, key: 'perfc-dropped' });
  const rdCmd = 'C:\\Windows\\system32\\rundll32.exe "C:\\ProgramData\\perfc.dat",#1 30';
  b.sysmon1(zp.t, 'ws-ua-0412', { user: ZU, image: `${SYS32}rundll32.exe`, cmd: rdCmd, parent: EZVIT, parentCmd: `"${EZVIT}"`, cwd: 'C:\\Program Files (x86)\\Medoc\\Medoc\\', integrity: 'High', original: 'RUNDLL32.EXE', description: 'Windows host process (Rundll32)' }, { attack: true, key: 'p0-rundll' });
  win(zp.t, 'ws-ua-0412', 4688, { user: 'ua.fin01', proc: `${SYS32}rundll32.exe`, parent: EZVIT, cmd: rdCmd, logonId: '0x7A3C11' }, { attack: true, user: 'ua.fin01' });
  b.sysmon11(zp.t + 2, 'ws-ua-0412', { user: ZU, image: `${SYS32}rundll32.exe`, file: 'C:\\Windows\\perfc.dat' }, { attack: true });
  b.sysmon11(zp.t + 3, 'ws-ua-0412', { user: ZU, image: `${SYS32}rundll32.exe`, file: 'C:\\Windows\\dllhost.dat' }, { attack: true, key: 'dllhost-dat' });
  b.sysmon11(zp.t + 21, 'ws-ua-0412', { user: ZU, image: `${SYS32}rundll32.exe`, file: TMP }, { attack: true });
  b.sysmon1(zp.t + 23, 'ws-ua-0412', { user: ZU, image: TMP, cmd: TMP, parent: `${SYS32}rundll32.exe`, parentCmd: rdCmd, cwd: 'C:\\Windows\\system32\\', integrity: 'High', description: '-', original: '-', company: '-', product: '-' }, { attack: true });
  b.sysmon10(zp.t + 24, 'ws-ua-0412', { sourceImage: TMP, targetImage: `${SYS32}lsass.exe`, access: '0x1410', sourceUser: ZU, targetUser: 'NT AUTHORITY\\SYSTEM', trace: 'C:\\Windows\\SYSTEM32\\ntdll.dll+4d7ea|C:\\Windows\\system32\\KERNELBASE.dll+1a3b1|UNKNOWN(0000000000B7A2C4)' }, { attack: true, key: 'lsass-access' });
  win(zp.t + 25, 'ws-ua-0412', 4688, { user: 'SYSTEM', proc: `${SYS32}cmd.exe`, parent: `${SYS32}rundll32.exe`, cmd: cmdSched(stZ), logonId: '0x3E7' }, { attack: true, key: 'schtask-reboot' });
  winC(b, zp.t + 26, 'ws-ua-0412', { log: 'Microsoft-Windows-TaskScheduler/Operational', code: 106, source: 'Microsoft-Windows-TaskScheduler', task: 'Task registered', message: 'User "NT AUTHORITY\\SYSTEM"  registered Task Scheduler task "\\"', brief: 'User NT AUTHORITY\\SYSTEM registered Task Scheduler task with an empty name' }, { src: 'TaskScheduler', attack: true });
  win(zp.t + 29, 'ws-ua-0412', 4688, { user: 'SYSTEM', proc: `${SYS32}cmd.exe`, parent: `${SYS32}rundll32.exe`, cmd: CMD_WEVT, logonId: '0x3E7' }, { attack: true, key: 'wevtutil-cmd' });
  win(zp.t + 31, 'ws-ua-0412', 4688, { user: 'SYSTEM', proc: `${SYS32}fsutil.exe`, parent: `${SYS32}cmd.exe`, cmd: 'fsutil usn deletejournal /D C:', logonId: '0x3E7' }, { attack: true });
  winC(b, zp.t + 32, 'ws-ua-0412', { log: 'System', code: 104, source: 'Microsoft-Windows-Eventlog', task: 'Log clear', message: 'The System log file was cleared.', brief: 'The System log file was cleared.' }, { attack: true });
  win(zp.t + 33, 'ws-ua-0412', 1102, { by: 'SYSTEM', netbios: 'NT AUTHORITY' }, { attack: true, key: 'log-clear' });
  // Scanning the local /24 on 139 and 445
  for (let i = 0; i < 16; i++) {
    b.sysmon3(zp.t + 40 + i, 'ws-ua-0412', { user: ZU, image: `${SYS32}rundll32.exe`, srcIp: ZERO.ip, dstIp: `10.40.20.${15 + i}`, dstPort: i % 5 === 4 ? 139 : 445, dstPortName: i % 5 === 4 ? 'netbios-ssn' : 'microsoft-ds' }, { attack: true, key: i === 0 ? 'scan-445' : undefined });
  }

  // ---------------- spread ----------------
  const SRC_USER = { 'ws-ua-0412': 'ua.fin01' };
  const wmicCmd = (dst, user) => `wmic.exe /node:"${dst}" /user:"${user}" /password:"${PW}" process call create "C:\\Windows\\System32\\rundll32.exe \\"C:\\Windows\\perfc.dat\\" #1 60"`;
  const idsFor = (hst) => (hst.site === 'ua' ? 'ids-ua01' : 'ids-cph01');
  let firstPsexec = true;
  let firstLocal = true;
  for (const p of PLAN.slice(1)) {
    const dst = HOSTS[p.host];
    const src = HOSTS[p.src];
    const dc = isDc(p.host);
    const t = p.t;
    const stx = hhmm(p.sched);
    const story = dc || ['file-cph01', 'app-cph03', 'app-cph07', 'srv-ua-app01', 'ws-ua-0417', 'bkp-cph01'].includes(p.host);
    const sUser = SRC_USER[p.src] || 'SYSTEM';
    const cross = src.site !== dst.site;

    // WAN firewall sees the cross-site SMB
    if (cross) built(b, t - 2, `fw-${dst.site}01`, src.ip, 49800 + jit(1500), dst.ip, 445, { ip: src.ip, attack: true });

    if (p.via === 'eb' || p.ebTried) {
      const sensor = idsFor(dst);
      const sp = 50000 + jit(9000);
      const first = p.host === 'ws-ua-0417';
      snort(b, t - 4, sensor, EB_RULE[0], EB_RULE[1], EB_RULE[2], src.ip, sp, dst.ip, 445, { attack: true, key: first ? 'eternalblue-ids' : p.ebTried ? 'decoy-patched-ids' : undefined });
      if (p.via === 'eb') snort(b, t - 2, sensor, DP_RULE[0], DP_RULE[1], DP_RULE[2], dst.ip, 445, src.ip, sp, 445, { attack: true, ip: dst.ip });
    }

    if (p.via !== 'eb') {
      // the command on the source machine
      if (p.via === 'local' || p.via === 'wmic') {
        const user = p.via === 'local' ? `${dst.name}\\Administrator` : 'CORP\\adm.helpdesk';
        win(t - 1, p.src, 4688, { user: sUser, proc: `${SYS32}wbem\\WMIC.exe`, parent: `${SYS32}rundll32.exe`, cmd: wmicCmd(dst.ip, user), logonId: '0x3E7' }, { attack: true, user: sUser, key: p.via === 'wmic' ? 'wmic-spread' : firstLocal ? 'wmic-local' : undefined });
        if (p.via === 'local') firstLocal = false;
      } else {
        win(t - 1, p.src, 4688, { user: sUser, proc: 'C:\\Windows\\dllhost.dat', parent: `${SYS32}rundll32.exe`, cmd: `C:\\WINDOWS\\dllhost.dat \\\\${dst.ip} -accepteula -s -d C:\\Windows\\System32\\rundll32.exe C:\\Windows\\perfc.dat,#1 60`, logonId: '0x3E7' }, { attack: true, user: sUser, key: firstPsexec ? 'psexec-cmd' : undefined });
      }
      // the logon on the target
      const lp = p.via === 'local'
        ? { user: 'Administrator', netbios: dst.name, sid: LOCAL_SID, ip: src.ip, ws: src.name, type: 3, auth: 'NTLM', logonId: b.logonId() }
        : { user: 'adm.helpdesk', ip: src.ip, ws: src.name, type: 3, auth: 'NTLM', logonId: b.logonId() };
      win(t, p.host, 4624, lp, { attack: true, user: lp.user, ip: src.ip, key: p.via === 'local' && p.host === 'ws-ua-0415' ? 'local-admin-reuse' : dc && p.host === 'dc-ua01' ? 'dc-logon' : undefined });
      if (story) win(t, p.host, 4672, { user: lp.user, netbios: lp.netbios, logonId: lp.logonId }, { attack: true, user: lp.user, ip: src.ip });
      if (p.via === 'psexec') {
        if (story) win(t + 1, p.host, 5140, { user: 'adm.helpdesk', ip: src.ip, share: '\\\\*\\ADMIN$', sharePath: '\\??\\C:\\Windows' }, { attack: true, user: 'adm.helpdesk', ip: src.ip, key: p.host === 'file-cph01' ? 'admin-share' : undefined });
        win(t + 3, p.host, 7045, { service: 'PSEXESVC', path: '%SystemRoot%\\PSEXESVC.exe' }, { attack: true, key: p.host === 'dc-ua01' ? 'dc-psexec' : p.host === 'file-cph01' ? 'psexec-svc' : undefined });
        if (story) win(t + 3, p.host, 4688, { user: 'SYSTEM', proc: 'C:\\Windows\\PSEXESVC.exe', parent: `${SYS32}services.exe`, cmd: 'C:\\Windows\\PSEXESVC.exe', logonId: '0x3E7' }, { attack: true });
        firstPsexec = false;
      }
      const parent = p.via === 'psexec' ? 'C:\\Windows\\PSEXESVC.exe' : `${SYS32}wbem\\WmiPrvSE.exe`;
      const rdc = p.via === 'psexec' ? 'C:\\Windows\\System32\\rundll32.exe C:\\Windows\\perfc.dat,#1 60' : 'C:\\Windows\\System32\\rundll32.exe "C:\\Windows\\perfc.dat" #1 60';
      win(t + 4, p.host, 4688, { user: 'SYSTEM', proc: `${SYS32}rundll32.exe`, parent, cmd: rdc, logonId: '0x3E7' }, { attack: true });
      if (dc) b.sysmon1(t + 4, p.host, { user: 'NT AUTHORITY\\SYSTEM', image: `${SYS32}rundll32.exe`, cmd: rdc, parent, parentCmd: parent, integrity: 'System', original: 'RUNDLL32.EXE', description: 'Windows host process (Rundll32)' }, { attack: true });
    }
    win(t + 8, p.host, 4688, { user: 'SYSTEM', proc: `${SYS32}cmd.exe`, parent: `${SYS32}rundll32.exe`, cmd: cmdSched(stx), logonId: '0x3E7' }, { attack: true });
    if (story) {
      winC(b, t + 9, p.host, { log: 'Microsoft-Windows-TaskScheduler/Operational', code: 106, source: 'Microsoft-Windows-TaskScheduler', task: 'Task registered', message: 'User "NT AUTHORITY\\SYSTEM"  registered Task Scheduler task "\\"', brief: 'User NT AUTHORITY\\SYSTEM registered Task Scheduler task with an empty name' }, { src: 'TaskScheduler', attack: true });
      win(t + 24, p.host, 4688, { user: 'SYSTEM', proc: `${SYS32}cmd.exe`, parent: `${SYS32}rundll32.exe`, cmd: CMD_WEVT, logonId: '0x3E7' }, { attack: true });
      winC(b, t + 27, p.host, { log: 'System', code: 104, source: 'Microsoft-Windows-Eventlog', task: 'Log clear', message: 'The System log file was cleared.', brief: 'The System log file was cleared.' }, { attack: true });
    }
    win(t + 28, p.host, 1102, { by: 'SYSTEM', netbios: 'NT AUTHORITY' }, { attack: true, key: p.host === 'dc-cph01' ? 'dc-log-clear' : undefined });
  }

  // The first domain controller scans every site (DHCP enumeration in the worm's code), and the firewalls show what got through
  for (let i = 0; i < 14; i++) {
    const site = ['10.10.20', '10.20.20', '10.30.20', '10.10.1'][i % 4];
    built(b, A(0, 10, 38, 30) + i * 3, 'fw-cph01', '10.40.1.10', 50100 + i * 7, `${site}.${20 + i * 3}`, 445, { ip: '10.40.1.10', attack: true, key: i === 0 ? 'dc-scan-wan' : undefined });
  }
  for (let i = 0; i < 3; i++) {
    asa(b, A(0, 10, 38, 50) + i * 4, 'fw-cph01', 4, 106023, `Deny tcp src wan:10.40.1.10/${50300 + i} dst tos:10.60.1.${21 + i}/445 by access-group "WAN_TO_TOS" [0x2e3ae8a1, 0x0]`, { ip: '10.40.1.10', attack: true, key: i === 0 ? 'segmentation-held' : undefined });
  }
  asa(b, A(0, 10, 40, 5), 'fw-cph01', 6, 302014, `Teardown TCP connection ${connSeq++} for wan:10.40.1.10/50412 to ghana:10.50.1.10/445 duration 0:00:30 bytes 0 SYN Timeout`, { ip: '10.40.1.10', attack: true, key: 'gh-unreachable' });

  // AV catches up (the real detection arrived with a definition update after the outbreak began)
  for (const [i, tg] of ['ws-ua-0418', 'file-cph01', 'ws-cph-0101'].entries()) {
    const t = A(0, 11, 8 + i, 20);
    winC(b, t, tg, { log: 'Microsoft-Windows-Windows Defender/Operational', code: 1116, source: 'Microsoft-Windows-Windows Defender', type: 'Warning', eventType: 3, task: 'None', message: 'Windows Defender Antivirus has detected malware or other potentially unwanted software.\n\tName: Ransom:Win32/Petya\n\tSeverity: Severe\n\tCategory: Ransomware\n\tPath: file:_C:\\Windows\\perfc.dat\n\tDetection Origin: Local machine\n\tDetection Type: Concrete\n\tDetection Source: Real-Time Protection\n\tUser: NT AUTHORITY\\SYSTEM\n\tProcess Name: Unknown\n\tSignature Version: AV: 1.247.197.0', brief: 'Windows Defender Antivirus has detected malware. Name: Ransom:Win32/Petya Severity: Severe Path: file:_C:\\Windows\\perfc.dat Signature Version: AV: 1.247.197.0' }, { src: 'Defender', index: 'endpoint', attack: true, key: i === 0 ? 'av-late' : undefined });
  }

  // ---------------- the reboot wave: the queued tasks fire ----------------
  for (const p of PLAN) {
    const hst = HOSTS[p.host];
    const t = p.sched + jit(3);
    const old = hst.os.includes('Windows 7') || hst.os.includes('2008');
    win(t, p.host, 4688, { user: 'SYSTEM', proc: `${SYS32}shutdown.exe`, parent: old ? `${SYS32}taskeng.exe` : `${SYS32}svchost.exe`, cmd: 'C:\\Windows\\system32\\shutdown.exe /r /f', logonId: '0x3E7' }, { attack: true, key: p.host === 'ws-ua-0412' ? 'p0-reboot' : undefined });
    const H = hst.name;
    winC(b, t + 1, p.host, { log: 'System', code: 1074, source: 'User32', message: `The process C:\\Windows\\system32\\shutdown.exe (${H}) has initiated the restart of computer ${H} on behalf of user NT AUTHORITY\\SYSTEM for the following reason: No title for this reason could be found\n Reason Code: 0x800000ff\n Shutdown Type: restart\n Comment: `, brief: `shutdown.exe initiated the restart of ${H} on behalf of NT AUTHORITY\\SYSTEM. Reason Code: 0x800000ff` }, { attack: true, key: p.host === 'dc-cph01' ? 'dc-reboot' : undefined });
    nagios(b, t + 80 + jit(60), `HOST ALERT: ${p.host};DOWN;HARD;1;CRITICAL - Host Unreachable (${hst.ip})`, { attack: true, ip: hst.ip, key: p.host === 'dc-cph01' ? 'dc-down' : undefined });
  }

  return finishDays(b.ev, { nowMinutes, date: DATE });
}

// ---------------------------------------------------------------------------------------------- the case
const NHOSTS = PLAN.length;
const NDC = PLAN.filter((p) => isDc(p.host)).length;
const NPSEXEC = PLAN.filter((p) => p.via === 'psexec').length;
const FIRST = hhmm(PLAN[0].sched);
const LAST = hhmm(Math.max(...PLAN.map((p) => p.sched)));

export const CASE = {
  id: 'case',
  area: 'SOC investigation',
  title: 'One tax-software update, one stolen credential, an entire Active Directory',
  max: 40,
  question: 'What is happening to the domain, and what do you protect first?',
  teaches: { skill: 'Recognise a credential-stealing worm (PsExec, WMIC, SMBv1) in Windows logs and protect a clean copy of Active Directory', secplus: '4.8 Incident response: containment and recovery; 2.4 Malicious activity' },
  verdicts: [
    { id: 'worm', text: 'A worm arrived with a software update on one Ukraine office PC, stole credentials from memory, and is spreading with PsExec and WMIC (shared local Administrator password, cached domain admin) and the SMBv1 exploit. Each machine has a queued reboot that wipes it, and the online domain controllers are already infected.' },
    { id: 'ransom', text: 'Ordinary ransomware. Isolate a few PCs and negotiate for the decryption key.' },
    { id: 'wannacry', text: 'A copy of WannaCry. Patched machines are safe, so patch MS17-010 and the problem ends.' },
    { id: 'insider', text: 'A helpdesk technician is doing this on purpose with the shared admin account.' },
  ],
  correctVerdict: 'worm',
  wrongVerdictNotes: {
    ransom: 'The reboot is a wipe, not a lock: it overwrites the boot record and encrypts the file table (Microsoft, BI.ZONE). CISA recommends against paying. Treat it as destruction and plan to rebuild from backups, not to buy a key.',
    wannacry: 'It uses the same SMBv1 exploit family, but patching alone does not stop it. APP-CPH07 is patched and was still infected: the worm logged in with the cached domain admin and the shared local Administrator password and used PsExec and WMIC. Credentials, not just the exploit, are how it crossed the company.',
    insider: 'One technician used the shared adm.helpdesk account on Monday. Every use today comes from machines that were infected minutes earlier and from a command line that matches the published worm (dllhost.dat, perfc.dat). That is a stolen credential, not a person.',
  },
  actions: [
    { id: 'isolate-wan', text: 'Cut SMB (TCP 445, 139) between sites at the WAN firewalls and pull the infected segments off the network, keeping the protected terminal network as it is', good: true },
    { id: 'dc-offline', text: 'Power down and disconnect a domain controller that has not rebooted yet and the offline Ghana DC-GH01, and keep them as clean copies of Active Directory until the rest is rebuilt', good: true },
    { id: 'cancel-tasks', text: 'Delete the empty-named SYSTEM scheduled task on machines that have not rebooted yet, and tell users: if a screen says it is "repairing" or checking the disk, switch the PC off', good: true },
    { id: 'creds', text: 'Reset adm.helpdesk, every Domain Admin and service account, and the shared local Administrator password (deploy LAPS) before any rebuilt machine joins the network', good: true },
    { id: 'patch', text: 'Patch MS17-010 and disable SMBv1 on every machine, including the legacy 2008 R2 servers, before it returns to the network', good: true },
    { id: 'rebuild', text: 'Plan to rebuild: restore Active Directory from the clean copy, build the other domain controllers new, and reinstall workstations and servers from clean images', good: true },
    { id: 'block-admin', text: 'Block PsExec and WMI between workstations and servers, and alert on PSEXESVC installs (7045) and ADMIN$ access from anything but the jump host', good: true },
    { id: 'hunt', text: 'Hunt every site for C:\\Windows\\perfc.dat, dllhost.dat and EzVit.exe, and treat every machine that runs M.E.Doc as suspicious', good: true },
    { id: 'reboot-all', text: 'Reboot every machine now to clear the malware out of memory', good: false, why: 'The reboot is the weapon. The queued "shutdown /r /f" is what runs the code that overwrites the boot record and encrypts the file table. Rebooting an infected machine does it to yourself, early.' },
    { id: 'replug-gh', text: 'Bring DC-GH01 back online now so it replicates and heals the other domain controllers', good: false, why: 'The worm is still moving through the network. The Ghana controller is the only copy of Active Directory the worm has not touched, and replication or any SMB path would give it the same fate. Keep it dark until the rest is clean.' },
    { id: 'vaccine', text: 'Create a read-only perfc file on every machine and consider the outbreak handled', good: false, why: 'At best that guards one file name on one machine. It does not stop credential theft, PsExec, WMIC, the exploit, or a copy that is already running, and it was published as a partial mitigation, not a fix.' },
    { id: 'pay', text: 'Pay the ransom to the Bitcoin address in the note', good: false, why: 'CISA recommends against paying. The boot record is already overwritten and the file table encrypted on the machines that rebooted, and paying funds the attacker.' },
    { id: 'av-only', text: 'Push the new antivirus signatures and wait for them to clean up', good: false, why: 'The detection arrived after the outbreak began, and antivirus cannot restore an overwritten boot record. It helps on machines that have not yet run the worm; it is not containment.' },
  ],
  primaryEvidence: { key: 'dc-psexec', note: 'The key line: Service Control Manager event 7045 on DC-UA01. PSEXESVC was installed on a domain controller at 10:38, five minutes after the first rundll32 on a Ukraine office PC, by the shared Domain Admin account. When the controllers fall, so does every logon in the company.' },
  keyEvidence: ['p0-rundll', 'lsass-access', 'local-admin-reuse', 'psexec-svc', 'wmic-spread', 'eternalblue-ids', 'schtask-reboot', 'dc-psexec', 'log-clear', 'adm-session', 'gh-offline'],
  containedRequires: ['isolate-wan', 'dc-offline'],
  costs: {
    contained: { amount: 25000000, text: `Rebuilding the machines that already rebooted, restoring Active Directory from the clean copy, and days of degraded operations (estimate for this replay)` },
    breach: { amount: 300000000, text: 'Every domain controller and most machines wiped. Maersk estimated USD 200-300 million in lost results for the third quarter of 2017 (Maersk interim report); the replay uses the top of that range.' },
  },
  perfectWhy: 'Right order: stop the movement (SMB between sites), protect the one thing nothing else can replace (a clean copy of Active Directory), take the queued reboot away from machines that have not run it yet, then reset the credentials the worm took, and fix the habits that made it work: unpatched SMBv1, one shared local Administrator password, an admin cached on workstations, and no rehearsed way to bring Active Directory back.',
  notSubmittedWhy: `Nobody wrote it up. ${NHOSTS} machines are queued to reboot between ${FIRST} and ${LAST}, and the only untouched domain controller is switched off in Ghana.`,
};

export const ALERTS = [
  {
    id: 'ids-smb',
    title: 'IDS: SMBv1 remote code execution attempts between internal hosts',
    severity: 'High',
    rule: 'Snort sid 42944 (OS-WINDOWS Microsoft Windows SMB remote code execution attempt) or sid 43459 (Doublepulsar ping response) where both source and destination are internal.',
    fields: [
      ['Sensors', 'ids-ua01, ids-cph01'],
      ['Sources', '10.40.20.12 (WS-UA-0412), 10.40.1.10 (DC-UA01), 10.10.1.10 (DC-CPH01)'],
      ['Targets', 'WS-UA-0417, SRV-UA-APP01, APP-CPH03, APP-CPH07'],
      ['Doublepulsar responses', '3 (the exploit worked on those)'],
    ],
    trigger: { when: (st, min) => min >= 10 * 60 + 52 },
    notice: 'SIEM alert (High): SMBv1 exploit attempts between internal hosts',
    chat: [
      'Look at this. An internal workstation is firing the SMB exploit family at its neighbours, and the signature for a Doublepulsar reply fired three times. Three hosts answered, so three hosts were unpatched.',
      'That is the exploit part. Do not stop at it: ask how the other hosts got infected, because the IDS is quiet about them.',
    ],
  },
  {
    id: 'sched-reboot',
    title: 'Mass scheduled shutdown: SYSTEM task with an empty name running "shutdown /r /f"',
    severity: 'High',
    rule: 'Process creation of schtasks.exe with /RU "SYSTEM" /TN "" and shutdown.exe /r /f on more than five hosts within 30 minutes.',
    fields: [
      ['Hosts', `${NHOSTS} machines in 5 sites`],
      ['Fires between', `${FIRST} and ${LAST} UTC`],
      ['Task name', '(empty)'],
      ['Command', 'C:\\Windows\\system32\\shutdown.exe /r /f'],
    ],
    trigger: { when: (st, min) => min >= 11 * 60 },
    notice: 'SIEM alert (High): mass scheduled reboot queued on dozens of hosts',
    chat: [
      'This one has a clock on it. Each machine has a task that reboots it at a set time. The first one just rebooted. The rest fire in the next half hour.',
      'IT has patch-night tasks too, with real names and change tickets. An empty task name running as SYSTEM, queued minutes apart on machines in five countries, is not that.',
    ],
  },
  {
    id: 'ad-worm',
    main: true,
    title: `PsExec service installed on ${NPSEXEC} hosts from domain-admin logons, including ${NDC} of 6 domain controllers`,
    severity: 'Critical',
    rule: 'System event 7045 with Service Name PSEXESVC on more than five hosts within 15 minutes, or on any domain controller outside the jump host.',
    fields: [
      ['Service', 'PSEXESVC (%SystemRoot%\\PSEXESVC.exe)'],
      ['Account', 'CORP\\adm.helpdesk (Domain Admins), NTLM network logons'],
      ['First', 'DC-UA01 at 10:38 (domain controller)'],
      ['Domain controllers hit', `${NDC} of 6 (DC-GH01 is offline)`],
    ],
    trigger: { when: (st, min) => (st.visited.includes('tickets') && min >= 11 * 60 + 5) || min >= 11 * 60 + 15 },
    notice: 'SIEM alert (Critical): PsExec rolling through domain controllers',
    chat: [
      'This is the one. The shared helpdesk admin account is installing PsExec on domain controllers, and none of it comes from the jump host.',
      'Work backward. Where did the account come from? A Ukraine office PC that ran a tax-software update, whose memory held a technician\'s Monday session. Then ask what is still clean.',
      'Search for 7045, then 4624 for adm.helpdesk. Check the domain controllers with PowerShell, then write the case up at the SOC console.',
    ],
    case: CASE,
  },
];
