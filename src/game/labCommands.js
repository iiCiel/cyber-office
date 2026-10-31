// Shared canned "recon" commands for the CCDC lab terminals — the inventory commands a real competitor types in
// the first few minutes to see what a box is actually running, before changing anything. These are read-only
// and produce realistic output; they are merged UNDER each device's own commands, so a device can override any
// of them with box-specific output. Everything is simulated.

import { systemctlStatus, ufwStatus } from './hostState.js';

const lines = (arr) => `${arr.join('\n')}\n`;

/**
 * Linux inventory commands. `opts.listen` is the device's own `ss -tulpn` table (lines after the header); if a
 * box doesn't supply one, a minimal sshd-only default is used.
 */
export function linuxRecon(opts = {}) {
  const listenRows = opts.listen || 'LISTEN  0  128  0.0.0.0:22  users:(("sshd",pid=742,fd=3))';
  const host = opts.host || 'host';
  return {
    ss: () => lines(['State  Recv-Q Send-Q  Local Address:Port  Peer Address:Port Process', ...listenRows.split('\n')]),
    netstat: () => lines(['Active Internet connections (only servers)', 'Proto Local Address        State', ...listenRows.split('\n').map((l) => `tcp   ${(l.match(/0\.0\.0\.0:\d+/) || ['0.0.0.0:?'])[0].padEnd(20)} LISTEN`)]),
    ps: () => lines(['USER       PID  %CPU %MEM COMMAND', 'root         1   0.0  0.1 /sbin/init', 'root       742   0.0  0.2 /usr/sbin/sshd -D', `${opts.appUser || 'www-data'}  1203   0.3  1.1 ${opts.appProc || '/usr/sbin/apache2 -k start'}`]),
    systemctl: (args, _stdin, ctx) => {
      const a = (args || []).join(' ');
      if ((args || [])[0] === 'status' && ctx?.live) return systemctlStatus(ctx.live, args[1]);
      if ((args || [])[0] === 'is-active' && ctx?.live) return `${ctx.live.units?.[String(args[1] || '').replace(/\.service$/, '').replace(/^sshd$/, 'ssh')] || 'unknown'}\n`;
      if (/list-units|list-unit-files/.test(a)) return lines(['UNIT                     LOAD   ACTIVE SUB     DESCRIPTION', 'ssh.service              loaded active running OpenBSD Secure Shell server', `${opts.appUnit || 'apache2.service'}        loaded active running ${opts.appDesc || 'The Apache HTTP Server'}`, 'cron.service             loaded active running Regular background program processing daemon']);
      if (/list-timers/.test(a)) return lines(['NEXT                        LEFT       UNIT                     ACTIVATES', 'Wed 2026-10-31 10:05:00 EDT 4min       apt-daily.timer          apt-daily.service']);
      if (/^status/.test(a) || a.includes('status')) return lines([`● ${args[1] || 'unit'} - service`, '   Loaded: loaded (/lib/systemd/system)', '   Active: active (running) since 09:00:11 EDT', '   (simulated)']);
      return lines([`${args[1] || 'unit'}: active (running) [simulated]`]);
    },
    journalctl: (args) => lines(['-- Logs begin at 09:00:00 EDT --', '09:14:02 ' + host + ' sshd[742]: Server listening on 0.0.0.0 port 22.', '09:16:41 ' + host + ' sudo:  analyst : TTY=pts/0 ; PWD=/home/analyst ; USER=root', '(simulated — use journalctl -u <unit> for one service)']),
    iptables: (args) => ((args || []).join(' ').includes('-L')
      ? lines(['Chain INPUT (policy ACCEPT)', 'target     prot opt source               destination', 'Chain FORWARD (policy ACCEPT)', 'Chain OUTPUT (policy ACCEPT)', '(no host firewall rules — the edge firewall is the control point)'])
      : lines(['iptables: use -L to list rules (simulated)'])),
    ufw: (args, _stdin, ctx) => ((args || [])[0] === 'status' || !(args || []).length
      ? (ctx?.live ? ufwStatus(ctx.live) : null) || lines(['Status: active', 'To                         Action      From', '--                         ------      ----', '(no rules — default allow inbound)'])
      : lines([`Rule added (simulated): ${(args || []).join(' ')}`])),
    lsof: (args) => lines(['COMMAND  PID  USER   FD   TYPE DEVICE NAME', 'sshd     742  root    3u  IPv4  tcp  *:22 (LISTEN)', '(simulated)']),
    who: () => lines(['analyst  pts/0        2026-10-31 09:12 (10.10.10.5)']),
    last: () => lines(['analyst  pts/0   10.10.10.5    Fri 09:12   still logged in', 'root     pts/1   203.0.113.66  Fri 02:03 - 02:41  (00:38)   <- off-hours login from an external address', 'wtmp begins Fri 02:03']),
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
    for (const p of s.ports) rows.push(`LISTEN  0  128  0.0.0.0:${p}  users:(("${procByPort[p] || 'svc'}",pid=${1000 + p % 1000},fd=4))`);
  }
  return rows.join('\n');
}

/** Merge recon commands under each device's own commands (device-specific handlers win). */
export function withRecon(scenario) {
  for (const d of scenario.devices) {
    if (!d.ctx) continue;
    const recon = { ...(d.recon || {}) };
    if (d.kind === 'bash') {
      if (!recon.listen) recon.listen = listenFor(scenario, d.host);
      d.ctx.commands = { ...linuxRecon(recon), ...(d.ctx.commands || {}) };
    } else if (d.kind === 'pwsh') {
      d.ctx.commands = { ...winRecon(recon), ...(d.ctx.commands || {}) };
    }
  }
  return scenario;
}
