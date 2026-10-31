// Live host state for the CCDC lab terminals. Status commands (Get-Service, Get-LocalUser, Get-ScheduledTask,
// systemctl status, ufw status) read this per-game object, and admin commands update it, so when the player
// checks their work the box shows its CURRENT state rather than the state it started in. Pure data; unit tested.

const clone = (v) => JSON.parse(JSON.stringify(v));
const lc = (s) => String(s || '').toLowerCase();

const DEFAULT_WIN_SERVICES = [
  { Status: 'Running', Name: 'EventLog', DisplayName: 'Windows Event Log', StartType: 'Automatic' },
  { Status: 'Running', Name: 'WinRM', DisplayName: 'Windows Remote Management (WS-Management)', StartType: 'Automatic' },
  { Status: 'Running', Name: 'WinDefend', DisplayName: 'Microsoft Defender Antivirus Service', StartType: 'Automatic' },
];
const DC_SERVICES = [
  { Status: 'Running', Name: 'DNS', DisplayName: 'DNS Server', StartType: 'Automatic' },
  { Status: 'Running', Name: 'NTDS', DisplayName: 'Active Directory Domain Services', StartType: 'Automatic' },
  { Status: 'Running', Name: 'Netlogon', DisplayName: 'Netlogon', StartType: 'Automatic' },
];
const DEFAULT_TASKS = [
  { TaskPath: '\\', TaskName: 'GoogleUpdateTaskMachine', State: 'Ready' },
  { TaskPath: '\\Microsoft\\Windows\\Defrag\\', TaskName: 'ScheduledDefrag', State: 'Ready' },
];

/** Build a device's starting live state from its scenario definition (`dev.live` / `dev.recon` overrides). */
export function initHostState(dev) {
  const spec = dev.live || {};
  const recon = dev.recon || {};
  if (dev.kind === 'pwsh') {
    const isDc = /domain controller/i.test(dev.name || '');
    return {
      winServices: clone(spec.winServices || (isDc ? DC_SERVICES : DEFAULT_WIN_SERVICES)),
      localUsers: clone(spec.localUsers || [
        { Name: 'Administrator', Enabled: false, Description: 'Built-in account for administering the computer/domain' },
        { Name: dev.user || 'user', Enabled: true, Description: '' },
      ]),
      localAdmins: clone(spec.localAdmins || [{ ObjectClass: 'User', Name: `${String(dev.host || 'PC').toUpperCase()}\\Administrator`, PrincipalSource: 'Local' }]),
      tasks: clone(spec.tasks || recon.tasks || DEFAULT_TASKS),
    };
  }
  const units = { ssh: 'active', cron: 'active' };
  const app = (recon.appUnit || '').replace(/\.service$/, '');
  if (app) units[app] = 'active';
  for (const u of spec.units || []) units[u] = 'active';
  return { units, ufw: { enabled: true, rules: clone(spec.ufwRules || []) } };
}

// Value of a named parameter (`-Name X`, `-TaskName X`, `-Member X`) or the first bare argument.
function argOf(toks, names) {
  for (let i = 1; i < toks.length; i++) {
    if (names.includes(lc(toks[i]).replace(/:$/, '')) && toks[i + 1]) return toks[i + 1];
  }
  return toks.slice(1).find((t) => !t.startsWith('-') && !t.startsWith('$')) || '';
}
const words = (line) => (String(line).match(/'[^']*'|"[^"]*"|\S+/g) || []).map((t) => t.replace(/^['"]|['"]$/g, ''));
const sameName = (a, b) => lc(a).split('\\').pop() === lc(b).split('\\').pop();

/** Apply one admin command to the live state (mutates it). Unknown commands are ignored. */
export function applyHostChange(L, line, kind) {
  if (!L) return;
  const toks = words(line);
  const cmd = lc(toks[0]);
  if (kind === 'pwsh') {
    const svc = (name) => L.winServices.find((s) => sameName(s.Name, name));
    if (cmd === 'stop-service') { const s = svc(argOf(toks, ['-name'])); if (s) s.Status = 'Stopped'; return; }
    if (cmd === 'start-service') { const s = svc(argOf(toks, ['-name'])); if (s && s.StartType !== 'Disabled') s.Status = 'Running'; return; }
    if (cmd === 'set-service') {
      const s = svc(argOf(toks, ['-name']));
      const i = toks.findIndex((t) => lc(t) === '-startuptype');
      if (s && i > 0 && toks[i + 1]) s.StartType = toks[i + 1][0].toUpperCase() + lc(toks[i + 1]).slice(1);
      const st = toks.findIndex((t) => lc(t) === '-status');
      if (s && st > 0 && lc(toks[st + 1]) === 'stopped') s.Status = 'Stopped';
      return;
    }
    if ((cmd === 'sc' || cmd === 'sc.exe') && toks[2]) {
      const s = svc(toks[2]);
      if (!s) return;
      if (lc(toks[1]) === 'stop') s.Status = 'Stopped';
      if (lc(toks[1]) === 'config' && /disabled/i.test(line)) s.StartType = 'Disabled';
      return;
    }
    const user = (name) => L.localUsers.find((u) => sameName(u.Name, name));
    if (cmd === 'disable-localuser') { const u = user(argOf(toks, ['-name'])); if (u) u.Enabled = false; return; }
    if (cmd === 'enable-localuser') { const u = user(argOf(toks, ['-name'])); if (u) u.Enabled = true; return; }
    if (cmd === 'remove-localuser') {
      const n = argOf(toks, ['-name']);
      L.localUsers = L.localUsers.filter((u) => !sameName(u.Name, n));
      L.localAdmins = L.localAdmins.filter((m) => !sameName(m.Name, n));
      return;
    }
    if (cmd === 'remove-localgroupmember') {
      const g = argOf(toks, ['-group', '-name']);
      const m = toks[toks.findIndex((t) => lc(t) === '-member') + 1];
      if (lc(g) === 'administrators' && m) L.localAdmins = L.localAdmins.filter((x) => !sameName(x.Name, m));
      return;
    }
    if (cmd === 'net' && lc(toks[1]) === 'user' && /\/active:no/i.test(line)) { const u = user(toks[2]); if (u) u.Enabled = false; return; }
    if (cmd === 'net' && lc(toks[1]) === 'localgroup' && lc(toks[2]) === 'administrators' && /\/delete/i.test(line)) {
      L.localAdmins = L.localAdmins.filter((x) => !sameName(x.Name, toks[3]));
      return;
    }
    if (cmd === 'unregister-scheduledtask') { const n = argOf(toks, ['-taskname']); L.tasks = L.tasks.filter((t) => lc(t.TaskName) !== lc(n)); return; }
    if (cmd === 'disable-scheduledtask') { const n = argOf(toks, ['-taskname']); const t = L.tasks.find((x) => lc(x.TaskName) === lc(n)); if (t) t.State = 'Disabled'; return; }
    if (cmd === 'schtasks' && /\/delete/i.test(line)) {
      const i = toks.findIndex((t) => lc(t) === '/tn');
      if (i > 0) L.tasks = L.tasks.filter((t) => lc(t.TaskName) !== lc(toks[i + 1]).replace(/^\\/, ''));
    }
    return;
  }
  // Linux
  const unit = (u) => lc(u).replace(/\.service$/, '').replace(/^sshd$/, 'ssh');
  if (cmd === 'systemctl' && toks[2]) {
    const verb = lc(toks[1]);
    const u = unit(toks[2]);
    if (verb === 'stop') L.units[u] = 'inactive';
    else if (verb === 'start' || verb === 'restart' || verb === 'reload') L.units[u] = 'active';
    else if (verb === 'disable' && /--now/.test(line)) L.units[u] = 'inactive';
    return;
  }
  if (cmd === 'service' && toks[2]) {
    const u = unit(toks[1]);
    if (lc(toks[2]) === 'stop') L.units[u] = 'inactive';
    else if (/start|restart|reload/.test(lc(toks[2]))) L.units[u] = 'active';
    return;
  }
  if (cmd === 'ufw') {
    const verb = lc(toks[1]);
    if (verb === 'enable') { L.ufw.enabled = true; return; }
    if (verb === 'disable') { L.ufw.enabled = false; return; }
    if (['allow', 'deny', 'reject', 'limit'].includes(verb)) {
      const rest = toks.slice(2).map(lc);
      const fromI = rest.indexOf('from');
      const portI = rest.indexOf('port');
      const from = fromI >= 0 ? rest[fromI + 1] : 'Anywhere';
      const to = portI >= 0 ? rest[portI + 1] : rest.find((t) => /^\d+(\/\w+)?$/.test(t)) || 'Anywhere';
      L.ufw.rules.push({ to, action: verb.toUpperCase(), from });
    }
  }
}

/** `systemctl status <unit>` text from the live state. */
export function systemctlStatus(L, name) {
  const u = lc(name || '').replace(/\.service$/, '').replace(/^sshd$/, 'ssh');
  const st = L?.units?.[u];
  if (!st) return `Unit ${u || 'unit'}.service could not be found.\n`;
  const active = st === 'active' ? 'active (running) since Fri 2026-10-31 09:00:11 EDT' : 'inactive (dead) since Fri 2026-10-31 (stopped this round)';
  return `● ${u}.service\n     Loaded: loaded (/lib/systemd/system/${u}.service; enabled)\n     Active: ${active}\n`;
}

/** `ufw status` text from the live state. */
export function ufwStatus(L) {
  const f = L?.ufw;
  if (!f) return 'Status: inactive\n';
  if (!f.enabled) return 'Status: inactive\n';
  const head = ['Status: active', '', 'To                         Action      From', '--                         ------      ----'];
  if (!f.rules.length) return `${[...head, '(no rules — default allow inbound)'].join('\n')}\n`;
  return `${[...head, ...f.rules.map((r) => `${String(r.to).padEnd(27)}${r.action.padEnd(12)}${r.from}`)].join('\n')}\n`;
}
