// Shared canned "recon" commands for the CCDC lab terminals — the inventory commands a real competitor types in
// the first few minutes to see what a box is actually running, before changing anything. These are read-only
// and produce realistic output; they are merged UNDER each device's own commands, so a device can override any
// of them with box-specific output. Everything is simulated.

import { systemctlStatus, ufwStatus } from './hostState.js';

const lines = (arr) => `${arr.join('\n')}\n`;

// ---- real `ss -tulpn` / `netstat -tulpn` layout -----------------------------------------------------------
// Boxes describe their listeners loosely ("LISTEN 0 128 0.0.0.0:80 users:(("nginx",pid=912,fd=6))", sometimes
// with a header or without a pid). These helpers re-print any such table in the exact column layout of
// iproute2 5.15 (Ubuntu 22.04) and net-tools, including the Netid and Peer columns.
const pidFor = (name) => { let x = 7; for (const c of String(name)) x = (x * 31 + c.charCodeAt(0)) % 4000; return 600 + x; };
const UDP_PORTS = new Set([53, 67, 69, 123, 161, 514, 1812]);
export function parseListen(text) {
  const out = [];
  for (const raw of String(text || '').split('\n')) {
    const m = raw.trim().match(/^(?:(tcp|udp)\s+)?(LISTEN|UNCONN)\s+(\d+)\s+(\d+)\s+(\S+):(\d+|\*)\s+(?:\S+:[\d*]+\s+)?(.*)$/);
    if (!m) continue;
    const [, netid, state, rq, sq, addr, port, rest] = m;
    const pm = rest.match(/\(\("([^"]+)"(?:,pid=(\d+))?(?:,fd=(\d+))?\)\)/);
    const name = pm ? pm[1] : '';
    out.push({ netid: netid || (state === 'UNCONN' ? 'udp' : 'tcp'), state, rq, sq, addr, port, name, pid: pm?.[2] || (name ? String(pidFor(name)) : ''), fd: pm?.[3] || '3' });
  }
  // DNS, NTP, SNMP... also listen on UDP; `ss -u` lists those as UNCONN rows above the TCP ones.
  for (const r of [...out]) {
    if (r.netid === 'tcp' && UDP_PORTS.has(Number(r.port)) && !out.some((o) => o.netid === 'udp' && o.port === r.port)) out.unshift({ ...r, netid: 'udp', state: 'UNCONN', rq: '0', sq: '0', fd: String(Number(r.fd) + 1) });
  }
  return out;
}
export function formatSs(text) {
  const rows = parseListen(text);
  const w = Math.max(18, ...rows.map((r) => `${r.addr}:${r.port}`.length));
  const head = `Netid State  Recv-Q Send-Q ${'Local Address:Port'.padStart(w)} ${'Peer Address:Port'.padStart(17)}Process`;
  const body = rows.map((r) => {
    const peer = r.addr.startsWith('[') || r.addr === '*' ? '[::]:*' : '0.0.0.0:*';
    const proc = r.name ? `users:(("${r.name}",pid=${r.pid},fd=${r.fd}))` : '';
    return `${r.netid.padEnd(5)} ${r.state.padEnd(6)} ${r.rq.padEnd(6)} ${r.sq.padEnd(6)} ${`${r.addr}:${r.port}`.padStart(w)} ${peer.padStart(17)}    ${proc}`.trimEnd();
  });
  return lines([head, ...body]);
}
/** Re-print loose "ESTAB 0 0 10.0.0.5:4444 1.2.3.4:443 users:((...))" rows in ss / netstat columns. */
export function formatConns(rows, style = 'ss') {
  return (rows || []).map((raw) => {
    const m = String(raw).trim().match(/^ESTAB\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s*(.*)$/);
    if (!m) return String(raw);
    const [, rq, sq, loc, peer, rest] = m;
    if (style === 'netstat') {
      const pm = rest.match(/\(\("([^"]+)",pid=(\d+)/);
      return `tcp   ${'0'.padStart(6)} ${'0'.padStart(6)} ${loc.padEnd(23)} ${peer.padEnd(23)} ESTABLISHED ${pm ? `${pm[2]}/${pm[1]}` : '-'}`;
    }
    return `tcp   ESTAB  ${rq.padEnd(6)} ${sq.padEnd(6)} ${loc.padStart(18)} ${peer.padStart(17)}    ${rest}`.trimEnd();
  });
}
/** True when ss/netstat flags ask for listening sockets only (-l without -a). */
export const listenOnly = (args) => { const f = (args || []).filter((a) => a.startsWith('-')).join(''); return /l/.test(f) && !/a/.test(f.replace(/^--all$/, 'a')); };
export function formatNetstat(text) {
  const rows = parseListen(text);
  const head = ['Active Internet connections (only servers)', 'Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name'];
  const body = rows.map((r) => { const v6 = r.addr.startsWith('['); const loc = v6 ? `${r.addr === '[::]' ? '::' : r.addr.slice(1, -1)}:${r.port}` : `${r.addr}:${r.port}`; return `${(r.netid + (v6 ? '6' : '')).padEnd(5)} ${'0'.padStart(6)} ${'0'.padStart(6)} ${loc.padEnd(23)} ${(v6 ? ':::*' : '0.0.0.0:*').padEnd(23)} ${(r.netid === 'udp' ? '' : 'LISTEN').padEnd(11)} ${r.pid ? `${r.pid}/${r.name}` : '-'}`.trimEnd(); });
  return lines([...head, ...body]);
}

/**
 * Linux inventory commands. `opts.listen` is the device's own `ss -tulpn` table (lines after the header); if a
 * box doesn't supply one, a minimal sshd-only default is used.
 */
export function linuxRecon(opts = {}) {
  const listenRows = opts.listen || 'LISTEN  0  128  0.0.0.0:22  users:(("sshd",pid=742,fd=3))';
  const host = opts.host || 'host';
  return {
    ss: () => formatSs(listenRows),
    netstat: () => formatNetstat(listenRows),
    ps: () => lines(['USER       PID  %CPU %MEM COMMAND', 'root         1   0.0  0.1 /sbin/init', 'root       742   0.0  0.2 /usr/sbin/sshd -D', `${opts.appUser || 'www-data'}  1203   0.3  1.1 ${opts.appProc || '/usr/sbin/apache2 -k start'}`]),
    systemctl: (args, _stdin, ctx) => {
      const a = (args || []).join(' ');
      if ((args || [])[0] === 'status' && ctx?.live) return systemctlStatus(ctx.live, args[1]);
      if ((args || [])[0] === 'is-active' && ctx?.live) return `${ctx.live.units?.[String(args[1] || '').replace(/\.service$/, '').replace(/^sshd$/, 'ssh')] || 'unknown'}\n`;
      if (/list-units|list-unit-files/.test(a)) return lines(['UNIT                     LOAD   ACTIVE SUB     DESCRIPTION', 'ssh.service              loaded active running OpenBSD Secure Shell server', `${opts.appUnit || 'apache2.service'}        loaded active running ${opts.appDesc || 'The Apache HTTP Server'}`, 'cron.service             loaded active running Regular background program processing daemon']);
      if (/list-timers/.test(a)) return lines(['NEXT                        LEFT       LAST                        PASSED    UNIT            ACTIVATES', 'Sat 2026-10-31 10:05:00 EDT 48min left Sat 2026-10-31 09:05:01 EDT 11min ago apt-daily.timer apt-daily.service', '', '1 timers listed.', 'Pass --all to see loaded but inactive timers, too.']);
      if (/^status/.test(a) || a.includes('status')) return lines([`● ${args[1] || 'unit'} - service`, '   Loaded: loaded (/lib/systemd/system)', '   Active: active (running) since 09:00:11 EDT' ]);
      return '';
    },
    journalctl: (args) => {
      // systemd 249 (Ubuntu 22.04) layout. Oct 31 2026 is a Saturday.
      const all = [
        ['09:00:11', 'systemd', '1', 'Started OpenBSD Secure Shell server.'],
        ['09:00:12', 'sshd', '742', 'Server listening on 0.0.0.0 port 22.'],
        ['09:00:12', 'sshd', '742', 'Server listening on :: port 22.'],
        ['09:05:01', 'CRON', '1388', 'pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)'],
        ['09:05:01', 'CRON', '1389', '(root) CMD (command -v debian-sa1 > /dev/null && debian-sa1 1 1)'],
        ['09:12:37', 'sshd', '1501', 'Accepted publickey for analyst from 10.10.10.5 port 51122 ssh2: ED25519 SHA256:q3Lw9xY0kF2mT8bRzP4vN1hJcA6sD7eG5uI0oK9lXyQ'],
        ['09:12:37', 'sshd', '1501', 'pam_unix(sshd:session): session opened for user analyst(uid=1000) by (uid=0)'],
        ['09:12:37', 'systemd-logind', '611', 'New session 4 of user analyst.'],
        ['09:16:41', 'sudo', '1544', ' analyst : TTY=pts/0 ; PWD=/home/analyst ; USER=root ; COMMAND=/usr/bin/ss -tulpn'],
        ['09:16:41', 'sudo', '1544', 'pam_unix(sudo:session): session opened for user root(uid=0) by analyst(uid=1000)'],
      ];
      const a = args || [];
      const ui = a.findIndex((x) => x === '-u' || x === '--unit');
      const unit = (ui >= 0 ? String(a[ui + 1] || '') : (a.find((x) => x.startsWith('--unit=')) || '').slice(7)).replace(/\.service$/, '').toLowerCase();
      const sel = all.filter(([, prog]) => !unit || (/^sshd?$/.test(unit) ? prog === 'sshd' || prog === 'systemd' : prog.toLowerCase().includes(unit)));
      if (!sel.length) return '-- No entries --\n';
      return lines(['-- Logs begin at Sat 2026-10-31 09:00:04 EDT, end at Sat 2026-10-31 09:16:41 EDT. --',
        ...sel.map(([t, prog, pid, msg]) => `Oct 31 ${t} ${host} ${prog}[${pid}]: ${msg}`)]);
    },
    iptables: (args) => ((args || []).join(' ').includes('-L')
      ? lines(['Chain INPUT (policy ACCEPT)', 'target     prot opt source               destination', 'Chain FORWARD (policy ACCEPT)', 'Chain OUTPUT (policy ACCEPT)'])
      : ''),
    ufw: (args, _stdin, ctx) => ((args || [])[0] === 'status' || !(args || []).length
      ? (ctx?.live ? ufwStatus(ctx.live) : null) || lines(['Status: active', 'To                         Action      From', '--                         ------      ----', '(no rules — default allow inbound)'])
      : ''),
    lsof: (args) => lines(['COMMAND  PID  USER   FD   TYPE DEVICE NAME', 'sshd     742  root    3u  IPv4  tcp  *:22 (LISTEN)']),
    who: () => lines(['analyst  pts/0        2026-10-31 09:12 (10.10.10.5)']),
    last: () => lines(['analyst  pts/0   10.10.10.5    Sat 09:12   still logged in', 'root     pts/1   203.0.113.66  Sat 02:03 - 02:41  (00:38)', '', 'wtmp begins Sat Oct 31 02:03:17 2026']),
  };
}

/** Windows inventory commands, merged under a device's own. */
export function winRecon(opts = {}) {
  const l2 = (arr) => `\n${arr.join('\n')}\n`;
  return {
    netstat: () => l2(['Active Connections', '', '  Proto  Local Address          State           PID', '  TCP    0.0.0.0:3389           LISTENING       1044', '  TCP    0.0.0.0:445            LISTENING       4', '  TCP    0.0.0.0:135            LISTENING       920']),
    // Status cmdlets read the box's LIVE state (ctx.live, see hostState.js) so they reflect the player's changes.
    'get-scheduledtask': (args, _in, ctx) => {
      const all = ctx?.live?.tasks || opts.tasks || [];
      const n = (args || []).find((a) => !a.startsWith('-'));
      return n ? all.filter((t) => t.TaskName.toLowerCase() === n.toLowerCase()) : all;
    },
    'get-service': (args, _in, ctx) => {
      const all = ctx?.live?.winServices || [];
      const n = ((args || []).find((a) => !a.startsWith('-')) || '').toLowerCase();
      const sel = n ? all.filter((s) => s.Name.toLowerCase() === n) : all;
      if (n && !sel.length) return `Get-Service : Cannot find any service with service name '${n}'.`;
      return sel.map(({ Status, Name, DisplayName, StartType }) => ({ Status, Name, DisplayName, StartType }));
    },
    'get-localuser': (args, _in, ctx) => {
      const all = ctx?.live?.localUsers || [];
      const n = ((args || []).find((a) => !a.startsWith('-')) || '').toLowerCase();
      const sel = n ? all.filter((u) => u.Name.toLowerCase() === n) : all;
      if (n && !sel.length) return `Get-LocalUser : User ${n} was not found.`;
      return sel;
    },
    'get-localgroupmember': (args, _in, ctx) => {
      const g = ((args || []).find((a) => !a.startsWith('-')) || '').toLowerCase();
      if (g && g !== 'administrators') return [];
      return ctx?.live?.localAdmins || [];
    },
    auditpol: (args) => `\nSystem audit policy\nCategory/Subcategory                      Setting\nLogon/Logoff\n  Logon                                   Success and Failure\n  Logoff                                  Success\nAccount Logon\n  Credential Validation                   ${opts.credAudit || 'No Auditing'}\n(simulated)\n`,
    tasklist: () => '\nImage Name                     PID Session Name\n========================= ======== ================\nSystem                           4 Services\nlsass.exe                      640 Services\nexplorer.exe                  3044 Console\n',
  };
}

// Build a realistic `ss -tulpn` listen table for a host from the scored services that run on it, plus sshd.
function listenFor(scenario, host) {
  const procByPort = { 80: 'apache2', 443: 'apache2', 8443: 'portal-api', 25: 'master', 143: 'dovecot', 993: 'dovecot', 3306: 'mysqld', 5432: 'postgres', 53: 'named' };
  const rows = ['LISTEN  0  128  0.0.0.0:22  users:(("sshd",pid=742,fd=3))'];
  for (const s of scenario.services || []) {
    if (s.host !== host) continue;
    for (const p of s.ports) rows.push(`LISTEN  0  128  0.0.0.0:${p}  users:(("${procByPort[p] || 'svc'}",pid=${pidFor(procByPort[p] || 'svc')},fd=${3 + (p % 7)}))`);
  }
  return rows.join('\n');
}

/** Merge recon commands under each device's own commands (device-specific handlers win). */
export function withRecon(scenario) {
  for (const d of scenario.devices) {
    if (!d.ctx) continue;
    const recon = { ...(d.recon || {}) };
    if (d.kind === 'bash') {
      if (!recon.host) recon.host = d.host;
      if (!recon.listen) recon.listen = listenFor(scenario, d.host);
      d.ctx.commands = { ...linuxRecon(recon), ...(d.ctx.commands || {}) };
    } else if (d.kind === 'pwsh') {
      d.ctx.commands = { ...winRecon(recon), ...(d.ctx.commands || {}) };
    }
  }
  return scenario;
}
