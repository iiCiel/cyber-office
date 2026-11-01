// Pure mapping logic behind the Windows remote-desktop GUIs (src/ui/ccdc/WinDesktop.js).
//   - cmd.*            : GUI action -> the PowerShell line that is sent through the normal terminal path (runLine),
//                        so grading is identical whether the player clicks or types.
//   - adModel()        : the Active Directory as it stands NOW = the scenario directory plus every AD command the
//                        player has run (the lab engine records the typed line but does not edit the directory).
//   - adTree/adRows    : directory -> ADUC tree and list rows.
//   - serviceRows/taskRows/localUserRows : live host state -> services.msc / Task Scheduler / lusrmgr rows.
//   - securityEvents/systemEvents : seeded, plausible event logs for a host, including the planted evidence.
// No DOM in here; unit tested in tests/wingui.test.js.

// ---------- GUI action -> PowerShell command ------------------------------------------------------------

export const psName = (s) => (/^[\w.$@-]+$/.test(String(s)) ? String(s) : `'${String(s).replace(/'/g, "''")}'`);
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

export const cmd = {
  disableUser: (sam) => `Disable-ADAccount -Identity ${psName(sam)}`,
  enableUser: (sam) => `Enable-ADAccount -Identity ${psName(sam)}`,
  removeMember: (group, sam) => `Remove-ADGroupMember -Identity ${q(group)} -Members ${psName(sam)} -Confirm:$false`,
  addMember: (group, sam) => `Add-ADGroupMember -Identity ${q(group)} -Members ${psName(sam)}`,
  resetPassword: (sam, pw) => `Set-ADAccountPassword -Identity ${psName(sam)} -Reset -NewPassword (ConvertTo-SecureString ${q(pw)} -AsPlainText -Force)`,
  deleteUser: (sam) => `Remove-ADUser -Identity ${psName(sam)} -Confirm:$false`,
  stopService: (n) => `Stop-Service ${psName(n)} -Force`,
  startService: (n) => `Start-Service ${psName(n)}`,
  setStartup: (n, type) => `Set-Service ${psName(n)} -StartupType ${type}`,
  deleteTask: (n) => `Unregister-ScheduledTask -TaskName ${psName(n)} -Confirm:$false`,
  disableTask: (n) => `Disable-ScheduledTask -TaskName ${psName(n)}`,
  disableLocalUser: (n) => `Disable-LocalUser -Name ${psName(n)}`,
  enableLocalUser: (n) => `Enable-LocalUser -Name ${psName(n)}`,
  removeLocalUser: (n) => `Remove-LocalUser -Name ${psName(n)}`,
  removeLocalAdmin: (n) => `Remove-LocalGroupMember -Group Administrators -Member ${psName(n)}`,
  restart: () => 'Restart-Computer -Force',
  shutdown: () => 'shutdown /s /t 0',
};

// ---------- tiny PowerShell line parser (enough for the commands above) ---------------------------------

const lc = (s) => String(s || '').toLowerCase();
const stripQ = (t) => t.replace(/^['"]|['"]$/g, '');

export function parseArgs(line) {
  const toks = String(line).match(/\([^)]*\)|'[^']*'|"[^"]*"|\S+/g) || [];
  const out = { cmd: lc(toks[0]), named: {}, pos: [] };
  for (let i = 1; i < toks.length; i++) {
    const t = toks[i];
    if (/^-[A-Za-z]/.test(t)) {
      const m = t.match(/^-([A-Za-z]+):?(.*)$/);
      const name = lc(m[1]);
      if (m[2]) { out.named[name] = stripQ(m[2]); continue; }
      const nx = toks[i + 1];
      if (nx !== undefined && !/^-[A-Za-z]/.test(nx)) { out.named[name] = stripQ(nx); i++; } else out.named[name] = true;
    } else out.pos.push(stripQ(t));
  }
  return out;
}
const arg = (a, names) => { for (const n of names) if (a.named[n] && a.named[n] !== true) return a.named[n]; return a.pos[0] || ''; };
const list = (v) => String(v || '').split(',').map((s) => stripQ(s.trim())).filter(Boolean);

// ---------- Active Directory as it stands now ------------------------------------------------------------

/** Apply the typed AD lines to a copy of the directory data. Never mutates `dir`. */
export function adModel(dir, lines = []) {
  const enabled = new Map(dir.users.map((u) => [lc(u.sam), u.enabled]));
  const deleted = new Set();
  const members = new Map(dir.groups.map((g) => [g.name, [...g.members]]));
  const pwChanged = new Set();
  const same = (a, b) => lc(a) === lc(b);
  for (const line of lines) {
    const a = parseArgs(line);
    const id = () => arg(a, ['identity']);
    if (a.cmd === 'disable-adaccount' || a.cmd === 'enable-adaccount') {
      const u = dir.lookup(id());
      if (u && u.type === 'user') enabled.set(lc(u.sam), a.cmd === 'enable-adaccount');
    } else if (a.cmd === 'remove-adgroupmember' || a.cmd === 'add-adgroupmember') {
      const g = dir.group(id());
      if (!g) continue;
      for (const m of list(a.named.members || a.named.member || a.pos[1])) {
        const o = dir.lookup(m);
        if (!o) continue;
        const cur = members.get(g.name) || [];
        if (a.cmd === 'remove-adgroupmember') members.set(g.name, cur.filter((x) => !same(x, o.sam)));
        else if (!cur.some((x) => same(x, o.sam))) members.set(g.name, [...cur, o.sam]);
      }
    } else if (a.cmd === 'remove-aduser') {
      const u = dir.lookup(id());
      if (u && u.type === 'user' && !u.sid.endsWith('-500')) {
        deleted.add(lc(u.sam));
        for (const [g, ms] of members) members.set(g, ms.filter((x) => !same(x, u.sam)));
      }
    } else if (a.cmd === 'set-adaccountpassword') {
      const u = dir.lookup(id());
      if (u) pwChanged.add(lc(u.sam));
    }
  }
  const memberOf = (sam) => [...members].filter(([, ms]) => ms.some((x) => same(x, sam))).map(([g]) => g);
  const users = dir.users.filter((u) => !deleted.has(lc(u.sam))).map((u) => ({
    ...u, enabled: enabled.get(lc(u.sam)) !== false, memberOf: memberOf(u.sam), pwChanged: pwChanged.has(lc(u.sam)),
  }));
  const computers = dir.computers.map((c) => ({ ...c, memberOf: memberOf(c.sam) }));
  const groups = dir.groups.map((g) => ({ ...g, members: members.get(g.name) || [] }));
  const objs = [...users, ...computers, ...groups];
  return {
    domain: dir.domain, netbios: dir.netbios, dn: dir.dn, dc: dir.dc, ous: dir.ous, ouByName: dir.ouByName,
    users, computers, groups,
    find: (id) => { const k = lc(id).replace(/^.*\\/, ''); return objs.find((o) => lc(o.sam) === k || lc(o.name) === k || lc(o.upn) === k); },
    group: (name) => groups.find((g) => lc(g.name) === lc(name)) || null,
    membersOf: (gname) => (members.get(groups.find((g) => lc(g.name) === lc(gname))?.name) || []).map((s) => objs.find((o) => lc(o.sam) === lc(s))).filter(Boolean),
  };
}

/** Only the typed lines that change the directory (what adModel replays). */
export const isAdLine = (line) => /^\s*(disable-adaccount|enable-adaccount|remove-adgroupmember|add-adgroupmember|remove-aduser|set-adaccountpassword)\b/i.test(line);

export function typeLabel(o) {
  if (o.type === 'user') return 'User';
  if (o.type === 'computer') return 'Computer';
  if (o.type === 'group') return `${o.category} Group - ${o.scope}`;
  return o.kind === 'ou' ? 'Organizational Unit' : o.kind === 'container' && o.name === 'Builtin' ? 'builtinDomain' : 'Container';
}

/** Tree nodes under a container dn: [{dn, name, kind}] (OUs and containers only). */
export function adTree(m, parentDn = m.dn) {
  return m.ous.filter((o) => o.parent === parentDn).sort((a, b) => a.name.localeCompare(b.name)).map((o) => ({ dn: o.dn, name: o.name, kind: o.kind }));
}

/** List rows for a container: child OUs/containers plus the objects that live in it. */
export function adRows(m, dn) {
  const rows = [];
  for (const o of m.ous.filter((x) => x.parent === dn)) rows.push({ key: o.dn, kind: o.kind, name: o.name, type: typeLabel(o), desc: o.desc || '', obj: null, ou: o });
  const here = (o) => { const c = m.ouByName.get(o.ou || 'Users'); return c && c.dn === dn; };
  for (const o of [...m.users, ...m.groups, ...m.computers]) {
    if (!here(o)) continue;
    rows.push({ key: o.dn, kind: o.type, name: o.name, type: typeLabel(o), desc: o.desc || '', obj: o, disabled: o.type !== 'group' && o.enabled === false });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** "cedarline.local/Users" style folder path for the Member Of / Members tabs. */
export function folderPath(m, o) {
  const c = m.ouByName.get(o.ou || 'Users');
  if (!c) return m.domain;
  const parts = [];
  for (let x = c; x; x = m.ous.find((y) => y.dn === x.parent)) parts.unshift(x.name);
  return [m.domain, ...parts].join('/');
}

/** Is this device a domain controller with a directory the GUI can show? */
export const hasAdGui = (dev) => !!(dev?.ctx?.dir && /domain controller/i.test(dev.name || ''));
export const isServerOs = (dev) => /server/i.test(dev?.os || '');

// ---------- services / tasks / local users --------------------------------------------------------------

const SVC_INFO = {
  spooler: ['This service spools print jobs and handles interaction with the printer.  If you turn off this service, you won’t be able to print or see your printers.', 'LocalSystem'],
  dns: ['Enables DNS clients to resolve DNS names by answering DNS queries and dynamic DNS update requests. If this service is stopped, DNS updates will not occur.', 'LocalSystem'],
  ntds: ['AD DS Domain Controller service. If this service is stopped, users will be unable to log on to the network. If this service is disabled, any services that explicitly depend on it will fail to start.', 'LocalSystem'],
  netlogon: ['Maintains a secure channel between this computer and the domain controller for authenticating users and services.', 'LocalSystem'],
  eventlog: ['This service manages events and event logs. It supports logging events, querying events, subscribing to events, archiving event logs, and managing event metadata.', 'NT AUTHORITY\\LocalService'],
  winrm: ['Windows Remote Management (WinRM) service implements the WS-Management protocol for remote management.', 'NT AUTHORITY\\NetworkService'],
  windefend: ['Helps protect users from malware and other potentially unwanted software', 'LocalSystem'],
};
const FILLER = [
  ['AppIDSvc', 'Application Identity', 'Determines and verifies the identity of an application.', 'Manual', 'NT AUTHORITY\\LocalService', false],
  ['BFE', 'Base Filtering Engine', 'The Base Filtering Engine (BFE) is a service that manages firewall and Internet Protocol security (IPsec) policies.', 'Automatic', 'NT AUTHORITY\\LocalService', true],
  ['CryptSvc', 'Cryptographic Services', 'Provides three management services: Catalog Database Service, Protected Root Service and Automatic Root Certificate Update Service.', 'Automatic', 'NT Authority\\NetworkService', true],
  ['Dhcp', 'DHCP Client', 'Registers and updates IP addresses and DNS records for this computer.', 'Automatic', 'NT Authority\\LocalService', true],
  ['Dnscache', 'DNS Client', 'The DNS Client service (dnscache) caches Domain Name System (DNS) names and registers the full computer name for this computer.', 'Automatic', 'NT AUTHORITY\\NetworkService', true],
  ['gpsvc', 'Group Policy Client', 'The service is responsible for applying settings configured by administrators for the computer and users.', 'Automatic', 'LocalSystem', true],
  ['LanmanServer', 'Server', 'Supports file, print, and named-pipe sharing over the network for this computer.', 'Automatic', 'LocalSystem', true],
  ['LanmanWorkstation', 'Workstation', 'Creates and maintains client network connections to remote servers using the SMB protocol.', 'Automatic', 'NT AUTHORITY\\NetworkService', true],
  ['mpssvc', 'Windows Defender Firewall', 'Windows Defender Firewall helps protect your computer by preventing unauthorized users from gaining access to your computer through the Internet or a network.', 'Automatic', 'NT Authority\\LocalService', true],
  ['PlugPlay', 'Plug and Play', 'Enables a computer to recognize and adapt to hardware changes with little or no user input.', 'Manual', 'LocalSystem', true],
  ['RpcSs', 'Remote Procedure Call (RPC)', 'The RPCSS service is the Service Control Manager for COM and DCOM servers.', 'Automatic', 'NT AUTHORITY\\NetworkService', true],
  ['SamSs', 'Security Accounts Manager', 'The startup of this service signals other services that the Security Accounts Manager (SAM) is ready to accept requests.', 'Automatic', 'LocalSystem', true],
  ['Schedule', 'Task Scheduler', 'Enables a user to configure and schedule automated tasks on this computer.', 'Automatic', 'LocalSystem', true],
  ['TermService', 'Remote Desktop Services', 'Allows users to connect interactively to a remote computer.', 'Manual', 'NT Authority\\NetworkService', true],
  ['W32Time', 'Windows Time', 'Maintains date and time synchronization on all clients and servers in the network.', 'Manual', 'NT AUTHORITY\\LocalService', true],
  ['wuauserv', 'Windows Update', 'Enables the detection, download, and installation of updates for Windows and other programs.', 'Manual', 'LocalSystem', false],
];

/** services.msc rows: the box's live services (actionable) plus read-only system filler. */
export function serviceRows(live) {
  const rows = (live?.winServices || []).map((s) => {
    const info = SVC_INFO[lc(s.Name)] || [`${s.DisplayName} service.`, 'LocalSystem'];
    return { name: s.DisplayName, id: s.Name, desc: info[0], status: s.Status === 'Running' ? 'Running' : '', startup: s.StartType, logon: info[1], live: true, running: s.Status === 'Running' };
  });
  const have = new Set(rows.map((r) => lc(r.id)));
  for (const [id, name, desc, startup, logon, run] of FILLER) {
    if (have.has(lc(id))) continue;
    rows.push({ name, id, desc, status: run ? 'Running' : '', startup, logon, live: false, running: run });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/** Services that Server Manager flags: automatic start, but not running. */
export const stoppedAutoServices = (live) => (live?.winServices || []).filter((s) => s.StartType === 'Automatic' && s.Status !== 'Running');

const TASK_META = {
  systemcheck: { trigger: 'At log on of any user', author: 'WS01\\Administrator', created: '10/28/2026 2:31:07 AM', desc: 'Runs a system health check.', action: 'Start a program: C:\\Windows\\Temp\\svchost32.exe -s', next: 'N/A', last: '10/31/2026 8:42:11 AM' },
  googleupdatetaskmachine: { trigger: 'Multiple triggers defined', author: 'Google LLC', created: '8/2/2024 10:11:46 AM', desc: 'Keeps your Google software up to date.', action: 'Start a program: C:\\Program Files (x86)\\Google\\Update\\GoogleUpdate.exe /c', next: '10/31/2026 10:11:46 AM', last: '10/31/2026 9:11:46 AM' },
  scheduleddefrag: { trigger: 'Custom trigger', author: 'Microsoft Corporation', created: '1/1/2019 12:00:00 AM', desc: 'This task optimizes local storage drives.', action: 'Start a program: %windir%\\system32\\defrag.exe -c -h -o -$', next: '11/4/2026 1:00:00 AM', last: '10/28/2026 1:00:00 AM' },
};
export function taskRows(live) {
  return (live?.tasks || []).map((t) => {
    const m = TASK_META[lc(t.TaskName)] || { trigger: 'At log on of any user', author: 'Administrator', created: '1/1/2026 9:00:00 AM', desc: '', action: 'Start a program', next: 'N/A', last: 'Never' };
    return { name: t.TaskName, path: t.TaskPath || '\\', status: t.State === 'Disabled' ? 'Disabled' : 'Ready', trigger: m.trigger, next: t.State === 'Disabled' ? 'N/A' : m.next, last: m.last, result: 'The operation completed successfully. (0x0)', author: m.author, created: m.created, desc: m.desc, action: m.action };
  });
}
export const taskFolders = (rows) => [...new Set(rows.map((r) => r.path))].sort();

export function localUserRows(live) {
  return (live?.localUsers || []).map((u) => ({ name: u.Name, full: '', desc: u.Description || '', enabled: u.Enabled !== false }));
}
export function localAdminRows(live) {
  return (live?.localAdmins || []).map((m) => ({ name: m.Name, cls: m.ObjectClass, source: m.PrincipalSource }));
}

// ---------- seeded event logs ----------------------------------------------------------------------------

export const ROUND_START = Date.UTC(2026, 9, 31, 9, 0, 0);
const pad = (n) => String(n).padStart(2, '0');
export function fmtDate(ms) {
  const d = new Date(ms);
  const h24 = d.getUTCHours();
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()} ${((h24 + 11) % 12) + 1}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} ${h24 < 12 ? 'AM' : 'PM'}`;
}
export const fmtClock = (sec) => { const d = ROUND_START + sec * 1000; const x = new Date(d); const h24 = x.getUTCHours(); return { time: `${((h24 + 11) % 12) + 1}:${pad(x.getUTCMinutes())} ${h24 < 12 ? 'AM' : 'PM'}`, date: `${x.getUTCMonth() + 1}/${x.getUTCDate()}/${x.getUTCFullYear()}` }; };

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (s) => [...String(s)].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7);

const SEC_CAT = {
  4624: 'Logon', 4625: 'Logon', 4634: 'Logoff', 4648: 'Logon', 4672: 'Special Logon', 4720: 'User Account Management', 4722: 'User Account Management', 4724: 'User Account Management',
  4725: 'User Account Management', 4726: 'User Account Management', 4728: 'Security Group Management', 4729: 'Security Group Management', 4732: 'Security Group Management',
  4733: 'Security Group Management', 4738: 'User Account Management', 4698: 'Other Object Access Events', 4699: 'Other Object Access Events', 4701: 'Other Object Access Events',
  4768: 'Kerberos Authentication Service', 4769: 'Kerberos Service Ticket Operations', 4776: 'Credential Validation', 4688: 'Process Creation', 4799: 'Security Group Management',
};
const SEC_TITLE = {
  4624: 'An account was successfully logged on.', 4625: 'An account failed to log on.', 4634: 'An account was logged off.', 4648: 'A logon was attempted using explicit credentials.',
  4672: 'Special privileges assigned to new logon.', 4720: 'A user account was created.', 4722: 'A user account was enabled.', 4724: 'An attempt was made to reset an account\'s password.',
  4725: 'A user account was disabled.', 4726: 'A user account was deleted.', 4728: 'A member was added to a security-enabled global group.', 4729: 'A member was removed from a security-enabled global group.',
  4732: 'A member was added to a security-enabled local group.', 4733: 'A member was removed from a security-enabled local group.', 4738: 'A user account was changed.',
  4698: 'A scheduled task was created.', 4699: 'A scheduled task was deleted.', 4701: 'A scheduled task was disabled.', 4768: 'A Kerberos authentication ticket (TGT) was requested.',
  4769: 'A Kerberos service ticket was requested.', 4776: 'The computer attempted to validate the credentials for an account.',
};

function secText(id, f) {
  const subj = `Subject:\n\tSecurity ID:\t\t${f.subSid || 'S-1-5-18'}\n\tAccount Name:\t\t${f.subject}\n\tAccount Domain:\t\t${f.domain}\n\tLogon ID:\t\t0x${(f.logonId || 0x3e7).toString(16).toUpperCase()}`;
  const tgt = (label) => `\n\n${label}:\n\tSecurity ID:\t\t${f.tSid || 'S-1-5-21-3623811015-3361044348-30300820-' + (1100 + (hash(f.target || '') % 8000))}\n\tAccount Name:\t\t${f.target}\n\tAccount Domain:\t\t${f.domain}`;
  const net = `\n\nNetwork Information:\n\tWorkstation Name:\t${f.wks || f.computer}\n\tSource Network Address:\t${f.ip || '-'}\n\tSource Port:\t\t${f.port || '-'}`;
  switch (id) {
    case 4624: return `${SEC_TITLE[id]}\n\n${subj}\n\nLogon Information:\n\tLogon Type:\t\t${f.type || 3}\n\tRestricted Admin Mode:\t-\n\tVirtual Account:\t\tNo\n\tElevated Token:\t\tYes${tgt('New Logon')}${net}\n\nAuthentication Information:\n\tLogon Process:\t\tNtLmSsp\n\tAuthentication Package:\tNTLM\n\tKey Length:\t\t128`;
    case 4625: return `${SEC_TITLE[id]}\n\n${subj}\n\nLogon Type:\t\t\t${f.type || 3}\n\nAccount For Which Logon Failed:\n\tSecurity ID:\t\tNULL SID\n\tAccount Name:\t\t${f.target}\n\tAccount Domain:\t\t${f.domain}\n\nFailure Information:\n\tFailure Reason:\t\tUnknown user name or bad password.\n\tStatus:\t\t\t0xC000006D\n\tSub Status:\t\t0xC000006A${net}\n\nDetailed Authentication Information:\n\tLogon Process:\t\tNtLmSsp\n\tAuthentication Package:\tNTLM`;
    case 4634: return `${SEC_TITLE[id]}\n${tgt('Subject')}\n\tLogon ID:\t\t0x${(f.logonId || 0x1a2b3).toString(16).toUpperCase()}\n\nLogon Type:\t\t\t${f.type || 3}`;
    case 4672: return `${SEC_TITLE[id]}\n\n${subj}\n\nPrivileges:\t\tSeSecurityPrivilege\n\t\t\tSeBackupPrivilege\n\t\t\tSeRestorePrivilege\n\t\t\tSeTakeOwnershipPrivilege\n\t\t\tSeDebugPrivilege\n\t\t\tSeSystemEnvironmentPrivilege\n\t\t\tSeLoadDriverPrivilege\n\t\t\tSeImpersonatePrivilege`;
    case 4720: case 4722: case 4725: case 4726: case 4724: case 4738:
      return `${SEC_TITLE[id]}\n\n${subj.replace('Subject:', 'Subject:')}${tgt(id === 4720 ? 'New Account' : id === 4726 || id === 4725 || id === 4722 || id === 4724 ? 'Target Account' : 'Target Account')}${id === 4720 ? '\n\nAttributes:\n\tSAM Account Name:\t' + f.target + '\n\tDisplay Name:\t\t<value not set>\n\tUser Account Control:\n\t\tAccount Enabled\n\t\t\'Password Not Required\' - Enabled' : ''}`;
    case 4728: case 4729: case 4732: case 4733:
      return `${SEC_TITLE[id]}\n\n${subj}\n\nMember:\n\tSecurity ID:\t\t${f.tSid || 'S-1-5-21-3623811015-3361044348-30300820-' + (1100 + (hash(f.target || '') % 8000))}\n\tAccount Name:\t\tCN=${f.target},CN=Users,DC=${String(f.domainDns || 'corp.local').split('.').join(',DC=')}\n\nGroup:\n\tSecurity ID:\t\tS-1-5-21-3623811015-3361044348-30300820-${id === 4728 || id === 4729 ? '512' : '544'}\n\tGroup Name:\t\t${f.group}\n\tGroup Domain:\t\t${f.domain}`;
    case 4698: case 4699: case 4701:
      return `${SEC_TITLE[id]}\n\n${subj}\n\nTask Information:\n\tTask Name: \t\t\\${f.target}\n\tTask Content: \t\t<?xml version="1.0" encoding="UTF-16"?>\n\t<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">\n\t  <Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers>\n\t  <Actions Context="Author"><Exec><Command>${f.cmdline || 'C:\\Windows\\System32\\cmd.exe'}</Command></Exec></Actions>\n\t</Task>`;
    case 4768: return `${SEC_TITLE[id]}\n\nAccount Information:\n\tAccount Name:\t\t${f.target}\n\tSupplied Realm Name:\t${f.domain}\n\nService Information:\n\tService Name:\t\tkrbtgt\n\nNetwork Information:\n\tClient Address:\t\t::ffff:${f.ip || '10.10.10.50'}\n\tClient Port:\t\t${f.port || 51234}\n\nAdditional Information:\n\tTicket Options:\t\t0x40810010\n\tResult Code:\t\t0x0`;
    case 4769: return `${SEC_TITLE[id]}\n\nAccount Information:\n\tAccount Name:\t\t${f.target}@${f.domain}\n\tAccount Domain:\t\t${f.domain}\n\nService Information:\n\tService Name:\t\t${f.service || f.computer}\n\nNetwork Information:\n\tClient Address:\t\t::ffff:${f.ip || '10.10.10.50'}\n\tClient Port:\t\t${f.port || 51234}\n\nAdditional Information:\n\tTicket Options:\t\t0x40810000\n\tTicket Encryption Type:\t0x12\n\tFailure Code:\t\t0x0`;
    case 4776: return `${SEC_TITLE[id]}\n\nAuthentication Package:\tMICROSOFT_AUTHENTICATION_PACKAGE_V1_0\nLogon Account:\t${f.target}\nSource Workstation:\t${f.wks || f.computer}\nError Code:\t\t0x0`;
    default: return SEC_TITLE[id] || `Event ${id}`;
  }
}

/** Context describing a host for event generation. */
function hostCtx(dev) {
  const dir = dev?.ctx?.dir;
  const domain = dir?.netbios || String(dev?.host || 'WORKGROUP').toUpperCase();
  return { computer: `${String(dev?.host || 'host').toUpperCase()}${dir ? '.' + dir.domain : ''}`, host: String(dev?.host || 'host').toUpperCase(), domain, domainDns: dir?.domain, dc: hasAdGui(dev), ip: dev?.ip || '10.10.10.10', user: dev?.user || 'Administrator' };
}

const DAY = 86400000;

/**
 * Seeded Security log for a device, newest first. `initialLive` is the box's starting live state (initHostState),
 * used to plant the evidence of whatever the scenario hid there. `cmdLog` ([{line, t}]) turns the player's own
 * admin commands into the events Windows would record.
 */
export function securityEvents(dev, { initialLive, cmdLog = [], dir } = {}) {
  const hc = hostCtx(dev);
  const rnd = mulberry(hash(`sec:${dev?.id}:${dev?.host}`));
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const ev = [];
  const add = (ts, id, f, ok = true) => ev.push({ ts, id, kw: ok ? 'Audit Success' : 'Audit Failure', source: 'Microsoft Windows security auditing.', cat: SEC_CAT[id] || 'Other', log: 'Security', level: 'Information', computer: hc.computer, user: 'N/A', text: secText(id, { domain: hc.domain, computer: hc.host, ...f }) });
  const start = ROUND_START - 3 * DAY;
  const users = hc.dc ? ['Administrator', 'a.flores', 'r.pike', 'j.okafor', 'm.reyes', 'svc-backup'] : [hc.user, 'Administrator'];
  const wks = ['WS01', 'WS02', 'WEB01', 'MAIL01'];
  // background noise
  const n = 260;
  for (let i = 0; i < n; i++) {
    const ts = start + Math.floor(rnd() * 3 * DAY);
    const r = rnd();
    const u = pick(users);
    const ip = `10.${hc.ip.split('.')[1] || 10}.${hc.ip.split('.')[2] || 10}.${pick([10, 20, 30, 40, 50, 55])}`;
    if (r < 0.34) add(ts, 4624, { subject: `${hc.host}$`, target: u, type: pick([3, 3, 3, 2, 10]), ip, port: 49000 + Math.floor(rnd() * 9000), logonId: 0x3e7 });
    else if (r < 0.52) add(ts, 4634, { target: u, type: 3 });
    else if (r < 0.62) add(ts, 4672, { subject: u, logonId: 0x10000 + Math.floor(rnd() * 90000) });
    else if (r < 0.72 && hc.dc) add(ts, 4768, { target: u, ip, port: 50000 + Math.floor(rnd() * 9000) });
    else if (r < 0.82 && hc.dc) add(ts, 4769, { target: u, ip, service: pick(['krbtgt', hc.host + '$', 'cifs/' + hc.host.toLowerCase(), 'ldap/' + hc.host.toLowerCase()]) });
    else if (r < 0.9) add(ts, 4776, { target: u, wks: pick(wks) });
    else add(ts, 4625, { subject: '-', subSid: 'S-1-0-0', logonId: 0, target: pick(['administrator', 'admin', 'test', 'backup']), type: 3, ip: `203.0.113.${20 + Math.floor(rnd() * 60)}`, port: 40000 + Math.floor(rnd() * 20000), wks: '-' }, false);
  }
  // a short RDP password-spray burst against the box the night before the round
  const burst = ROUND_START - 9 * 3600000;
  for (let i = 0; i < 24; i++) add(burst + i * 4000, 4625, { subject: '-', subSid: 'S-1-0-0', logonId: 0, target: pick(['administrator', 'administrateur', 'admin', 'user', 'scanner']), type: 10, ip: '203.0.113.66', port: 51000 + i * 7, wks: 'kali' }, false);

  // planted evidence
  const adminActor = { subject: hc.dc ? 'Administrator' : hc.user, logonId: 0x5a1c2 };
  if (dir && hc.dc) {
    const rogue = dir.users.find((u) => u.created === '2026-10-28' && /svc/i.test(u.sam));
    if (rogue) {
      const t = Date.UTC(2026, 9, 28, 2, 14, 31);
      add(t - 2000, 4624, { subject: `${hc.host}$`, target: 'Administrator', type: 10, ip: '203.0.113.66', port: 50122 });
      add(t - 1000, 4672, { subject: 'Administrator', logonId: 0x5a1c2 });
      add(t, 4720, { ...adminActor, target: rogue.sam, logonId: 0x5a1c2 });
      add(t + 3000, 4738, { ...adminActor, target: rogue.sam });
      for (const g of rogue.memberOf.filter((x) => x !== 'Domain Users')) add(t + 6000, 4728, { ...adminActor, target: rogue.sam, group: g });
    }
    const guest = dir.users.find((u) => lc(u.sam) === 'guest');
    if (guest?.enabled) {
      const t = Date.UTC(2026, 9, 29, 3, 41, 9);
      add(t, 4722, { ...adminActor, target: 'Guest' });
      for (const g of guest.memberOf.filter((x) => x !== 'Domain Users' && x !== 'Domain Guests')) add(t + 4000, 4732, { ...adminActor, target: 'Guest', group: g });
    }
  }
  if (initialLive && !hc.dc) {
    const benign = ['administrator', 'defaultaccount', 'guest', 'wdagutilityaccount', lc(hc.user)];
    for (const u of initialLive.localUsers || []) {
      if (benign.includes(lc(u.Name))) continue;
      const t = Date.UTC(2026, 9, 29, 22, 5, 44);
      add(t, 4720, { ...adminActor, target: u.Name });
      if ((initialLive.localAdmins || []).some((m) => lc(m.Name).endsWith(lc(u.Name)))) add(t + 5000, 4732, { ...adminActor, target: u.Name, group: 'Administrators' });
    }
    for (const t of initialLive.tasks || []) {
      if (/^(googleupdate|scheduleddefrag)/i.test(t.TaskName)) continue;
      add(Date.UTC(2026, 9, 28, 2, 31, 7), 4698, { ...adminActor, target: t.TaskName, cmdline: 'C:\\Windows\\Temp\\svchost32.exe' });
    }
  }
  ev.push(...commandEvents(dev, cmdLog, dir).filter((e) => e.log === 'Security'));
  ev.sort((a, b) => b.ts - a.ts);
  ev.forEach((e, i) => { e.rec = 400000 + (ev.length - i) * 3 + 17; });
  return ev;
}

/** System log: service state changes, plus whatever the player does to services. */
export function systemEvents(dev, { cmdLog = [], dir } = {}) {
  const hc = hostCtx(dev);
  const rnd = mulberry(hash(`sys:${dev?.id}`));
  const ev = [];
  const sys = (ts, id, source, level, text) => ev.push({ ts, id, kw: 'Classic', source, cat: 'None', log: 'System', level, computer: hc.computer, user: 'N/A', text });
  const names = ['Windows Modules Installer', 'Background Intelligent Transfer Service', 'Windows Update', 'Software Protection'];
  for (let i = 0; i < 40; i++) {
    const nm = names[Math.floor(rnd() * names.length)];
    sys(ROUND_START - Math.floor(rnd() * 3 * DAY), 7036, 'Service Control Manager', 'Information', `The ${nm} service entered the ${rnd() < 0.5 ? 'running' : 'stopped'} state.`);
  }
  sys(ROUND_START - 2 * DAY + 3600000, 7045, 'Service Control Manager', 'Information', 'A service was installed in the system.\n\nService Name:  Google Update Service (gupdate)\nService File Name:  "C:\\Program Files (x86)\\Google\\Update\\GoogleUpdate.exe" /svc\nService Type:  user mode service\nService Start Type:  auto start\nService Account:  LocalSystem');
  sys(ROUND_START - 5 * 3600000, 6013, 'EventLog', 'Information', `The system uptime is 912034 seconds.`);
  sys(ROUND_START - 3 * DAY, 6005, 'EventLog', 'Information', 'The Event log service was started.');
  ev.push(...commandEvents(dev, cmdLog, dir).filter((e) => e.log === 'System'));
  ev.sort((a, b) => b.ts - a.ts);
  ev.forEach((e, i) => { e.rec = 90000 + (ev.length - i) * 2; });
  return ev;
}

export function applicationEvents(dev) {
  const hc = hostCtx(dev);
  const rows = [
    [1, 'Windows Error Reporting', 'Information', 'Fault bucket , type 0\nEvent Name: APPCRASH'],
    [16384, 'Software Protection Platform Service', 'Information', 'Successfully scheduled Software Protection service for re-start at 2026-11-01T09:00:00Z. Reason: RulesEngine.'],
    [1001, 'Windows Error Reporting', 'Information', 'Fault bucket 1234567890, type 5\nEvent Name: BEX64'],
    [903, 'Microsoft-Windows-Security-SPP', 'Information', 'The Software Protection service has stopped.'],
  ];
  return rows.map(([id, source, level, text], i) => ({ ts: ROUND_START - (i + 1) * 5 * 3600000, id, kw: 'Classic', source, cat: 'None', log: 'Application', level, computer: hc.computer, user: 'N/A', text, rec: 5000 + i }));
}

/** The events Windows records for the player's own admin commands ([{line, t}], t in round seconds). */
export function commandEvents(dev, cmdLog, dir) {
  const hc = hostCtx(dev);
  const out = [];
  const actor = { subject: hc.dc ? 'Administrator' : hc.user, logonId: 0x5a1c2 };
  const mk = (ts, id, f) => ({ ts, id, kw: 'Audit Success', source: 'Microsoft Windows security auditing.', cat: SEC_CAT[id] || 'Other', log: 'Security', level: 'Information', computer: hc.computer, user: 'N/A', text: secText(id, { domain: hc.domain, computer: hc.host, ...actor, ...f }) });
  const sys = (ts, id, text) => ({ ts, id, kw: 'Classic', source: 'Service Control Manager', cat: 'None', log: 'System', level: 'Information', computer: hc.computer, user: 'N/A', text });
  for (const { line, t } of cmdLog) {
    const ts = ROUND_START + t * 1000;
    const a = parseArgs(line);
    const id = arg(a, ['identity', 'name', 'taskname']);
    if (a.cmd === 'disable-adaccount') out.push(mk(ts, 4725, { target: id }));
    else if (a.cmd === 'enable-adaccount') out.push(mk(ts, 4722, { target: id }));
    else if (a.cmd === 'remove-aduser') out.push(mk(ts, 4726, { target: id }));
    else if (a.cmd === 'set-adaccountpassword') out.push(mk(ts, 4724, { target: id }));
    else if (a.cmd === 'remove-adgroupmember' || a.cmd === 'add-adgroupmember') {
      const g = dir?.group?.(id);
      const global = !g || g.scope === 'Global';
      const adding = a.cmd === 'add-adgroupmember';
      for (const m of list(a.named.members || a.named.member || a.pos[1])) out.push(mk(ts, adding ? (global ? 4728 : 4732) : (global ? 4729 : 4733), { target: m, group: g?.name || id }));
    } else if (a.cmd === 'unregister-scheduledtask') out.push(mk(ts, 4699, { target: id }));
    else if (a.cmd === 'disable-scheduledtask') out.push(mk(ts, 4701, { target: id }));
    else if (a.cmd === 'disable-localuser') out.push(mk(ts, 4725, { target: id }));
    else if (a.cmd === 'enable-localuser') out.push(mk(ts, 4722, { target: id }));
    else if (a.cmd === 'remove-localuser') out.push(mk(ts, 4726, { target: id }));
    else if (a.cmd === 'remove-localgroupmember') out.push(mk(ts, 4733, { target: a.named.member || a.pos[0], group: a.named.group || 'Administrators' }));
    else if (a.cmd === 'stop-service' || a.cmd === 'start-service') out.push(sys(ts, 7036, `The ${arg(a, ['name'])} service entered the ${a.cmd === 'stop-service' ? 'stopped' : 'running'} state.`));
    else if (a.cmd === 'set-service' && a.named.startuptype) out.push(sys(ts, 7040, `The start type of the ${arg(a, ['name'])} service was changed from auto start to ${lc(a.named.startuptype)}.`));
  }
  return out;
}

/** Windows Event Viewer filter: Event IDs like "4720, 4728, 4000-4100, -4624" and a keyword set. */
export function filterEvents(events, { ids = '', keywords = null } = {}) {
  const spec = String(ids).split(',').map((s) => s.trim()).filter(Boolean);
  const inc = []; const exc = [];
  for (const s of spec) {
    const neg = s.startsWith('-');
    const body = neg ? s.slice(1) : s;
    const m = body.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) continue;
    (neg ? exc : inc).push([+m[1], +(m[2] || m[1])]);
  }
  const inR = (id, rs) => rs.some(([a, b]) => id >= a && id <= b);
  return events.filter((e) => (!inc.length || inR(e.id, inc)) && !inR(e.id, exc) && (!keywords || keywords.includes(e.kw)));
}
