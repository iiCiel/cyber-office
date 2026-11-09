// The reality layer of the CCDC lab. Every box has a live state (services, host firewall, accounts, files), and
// the scoring engine looks at that state, so a scored service is up only if it really is up: stop apache, delete
// the web root, or firewall the port and the next check fails, whoever did it. Red Team uses the same state.
//
// Two jobs:
//   applyBoxCommand()  - the admin commands an operator types (passwd, reboot, iptables, Stop-Service, ...).
//   serviceProblem()   - why a scored service's check fails right now (null = it passes).
// Everything is simulated: nothing is executed.

import { evalFirewall } from './ccdcFirewall.js';
import { makeDirectory } from './directory.js';
import { systemctlStatus } from './hostState.js';
import { finishCommit, panosEval, panosLine, startCommit } from './panos.js';

export const REBOOT_SECS = 60; // sim seconds a rebooted box stays off the network (two scored checks)
export const REVERT_SECS = 60;
export const REVERT_PENALTY = 15;
export const DEFAULT_PASSWORD = 'Changeme123';

const COMMON = /^(password|passw0rd|p@ssw0rd|admin|administrator|changeme|welcome|letmein|root|toor|qwerty|123456|summer|winter)/i;

/** Would this survive a Red Team spray? Twelve characters, not a dictionary start, not the username. */
export function passwordStrong(pw, user = '') {
  const p = String(pw || '');
  if (p.length < 12 || COMMON.test(p)) return false;
  if (user && p.toLowerCase().includes(String(user).toLowerCase())) return false;
  return p !== DEFAULT_PASSWORD;
}

/** A password embedded in a graded command, if there is one. */
export function passwordInLine(line) {
  const m = String(line).match(/--user_pass[= ]+['"]?([^'"\s]+)/i)
    || String(line).match(/identified by\s+['"]([^'"]+)/i)
    || String(line).match(/\bpassword\s+['"]([^'"]+)/i);
  return m ? m[1] : null;
}

const lc = (s) => String(s || '').toLowerCase();
const words = (line) => (String(line).match(/'[^']*'|"[^"]*"|\([^)]*\)|\S+/g) || []).map((t) => t.replace(/^['"]|['"]$/g, ''));
const out = (...t) => ({ handled: true, lines: t.flat().filter((x) => x != null && x !== '').map((text) => ({ cls: '', text })) });
const fail = (...t) => ({ handled: true, lines: t.flat().map((text) => ({ cls: 'err', text })) });
const clock = (state) => state.engine?.clock || 0;

export const PASSWD = '/etc/passwd';
export const AUTH_LOG = '/var/log/auth.log';
export const AUTH_KEYS = '/root/.ssh/authorized_keys';
export const ROOT_CRON = '/var/spool/cron/crontabs/root';

// ---- starting state ------------------------------------------------------------------------------------------

function passwdLine(name, uid) { return `${name}:x:${uid}:${uid}:${name}:${uid === 0 ? '/root' : `/home/${name}`}:/bin/bash`; }

/** Accounts, baseline files and host firewall for a box. Called once per device at new game and on revert. */
export function initBox(dev, ds) {
  const acct = () => ({ pw: DEFAULT_PASSWORD, strong: false, def: true });
  ds.creds = {};
  if (dev.kind === 'firewall') { ds.creds.admin = acct(); return; }
  const L = ds.live;
  L.offlineUntil = 0;
  L.procs = [];
  L.conns = [];
  L.sessions = [];
  L.settings = {};
  if (dev.kind === 'bash') {
    ds.creds.root = acct();
    ds.creds[dev.user || 'analyst'] = acct();
    L.ipt = { policy: 'ACCEPT', rules: [] };
    L.ufw.default = 'allow';
    L.boots = 0;
    if (dev.fwtool) L.ufw.enabled = false; // only an Ubuntu box has ufw, and even there it ships inactive
    if (dev.fwtool === 'firewalld') { L.units.firewalld = 'active'; L.fwd = { running: fwdZone(dev.fwdOpen), permanent: fwdZone(dev.fwdOpen) }; }
    const fs = ds.fs;
    fs[PASSWD] = fs[PASSWD] || `${[passwdLine('root', 0), 'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin', 'www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin', passwdLine(dev.user || 'analyst', 1000)].join('\n')}\n`;
    fs[AUTH_KEYS] = fs[AUTH_KEYS] ?? '';
    fs[AUTH_LOG] = fs[AUTH_LOG] ?? '';
    fs['/etc/crontab'] = fs['/etc/crontab'] || 'SHELL=/bin/sh\n17 *\t* * *\troot\tcd / && run-parts --report /etc/cron.hourly\n';
    fs['/etc/fstab'] = fs['/etc/fstab'] || 'UUID=4e1f2a7c / ext4 defaults 0 1\n';
  } else {
    for (const u of L.localUsers) if (u.Enabled) ds.creds[lc(u.Name)] = acct();
    if (/domain controller/i.test(dev.name || '')) ds.creds.administrator = acct();
    L.runKeys = [];
    L.winFw = { default: 'Allow', rules: [] };
    L.audit = {};
    L.boots = 0;
  }
}

/** This game's own copy of the directory (built on first use, so replays start clean). */
export function dirOf(dev, ds) {
  if (!ds.dir && dev.ctx?.dir?.spec) {
    ds.dir = makeDirectory(JSON.parse(JSON.stringify(dev.ctx.dir.spec)));
    dev.ctx.dir.seedLive?.(ds.dir);
  }
  return ds.dir || null;
}

// ---- accounts ------------------------------------------------------------------------------------------------

function setPassword(ds, user, pw) {
  const name = lc(user);
  ds.creds[name] = { pw, strong: passwordStrong(pw, name), def: pw === DEFAULT_PASSWORD };
}

const isDcBox = (dev) => dev.kind === 'pwsh' && /domain controller/i.test(dev.name || '');

/** Accounts on this box that still open the door: default or weak password, not locked or disabled. */
export function weakAccounts(dev, ds) {
  const res = [];
  for (const [name, c] of Object.entries(ds.creds || {})) {
    if (c.strong || c.locked) continue;
    if (dev.kind === 'pwsh') {
      const local = ds.live?.localUsers?.find((u) => lc(u.Name) === name);
      const domain = isDcBox(dev) ? dirOf(dev, ds)?.lookup(name) : null;
      if (!local && !domain && name !== 'administrator') continue; // the account no longer exists
      if (domain && domain.enabled === false) continue;
      if (local && !local.Enabled && name !== 'administrator') continue;
    }
    res.push(name);
  }
  if (isDcBox(dev)) {
    const dir = dirOf(dev, ds);
    for (const u of dir?.all || []) {
      if (u.type !== 'user' || u.enabled === false || u.created === 'redteam') continue;
      if (lc(u.sam) === 'krbtgt' || lc(u.sam) === 'guest') continue;
      const c = ds.creds[lc(u.sam)];
      if (!c || !c.strong) res.push(lc(u.sam));
    }
  }
  return [...new Set(res)];
}

function secureArg(line) {
  const m = line.match(/ConvertTo-SecureString\s+(?:-String\s+)?['"]([^'"]+)['"]/i);
  return m ? m[1] : null;
}
function namedArg(toks, name) {
  const i = toks.findIndex((t) => lc(t) === lc(name));
  return i >= 0 ? toks[i + 1] : undefined;
}

// ---- host firewall -------------------------------------------------------------------------------------------

function iptRule(toks) {
  const get = (f) => { const i = toks.indexOf(f); return i >= 0 ? toks[i + 1] : null; };
  return { dport: get('--dport'), src: get('-s'), proto: get('-p'), target: get('-j') };
}

function applyIptables(L, toks, line) {
  if (toks.includes('-L') || toks.includes('-S')) return null;
  if (toks.includes('-F')) { L.ipt.rules = []; return out(); }
  if (toks.includes('-P')) {
    const i = toks.indexOf('-P');
    if (toks[i + 1] === 'INPUT' && toks[i + 2]) L.ipt.policy = toks[i + 2].toUpperCase();
    return out();
  }
  if (!/INPUT/.test(line)) return out();
  const r = iptRule(toks);
  if (toks.includes('-A')) L.ipt.rules.push(r);
  else if (toks.includes('-I')) L.ipt.rules.unshift(r);
  else if (toks.includes('-D')) {
    const num = toks[toks.indexOf('-D') + 2];
    if (/^\d+$/.test(num || '')) L.ipt.rules.splice(Number(num) - 1, 1);
    else {
      const k = L.ipt.rules.findIndex((x) => x.dport === r.dport && x.src === r.src && x.target === r.target);
      if (k >= 0) L.ipt.rules.splice(k, 1);
      else return fail('iptables: Bad rule (does a matching rule exist in that chain?).');
    }
  }
  return out();
}

const ipNum = (ip) => ip.split('.').reduce((n, o) => n * 256 + Number(o), 0);
function srcCovers(src, ip) {
  const s = lc(src);
  if (!s || s === 'anywhere' || s === 'any' || s === '0.0.0.0/0') return true;
  const [base, bits = '32'] = s.split('/');
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(base)) return false;
  const size = 2 ** (32 - Number(bits));
  return Math.floor(ipNum(ip) / size) === Math.floor(ipNum(base) / size);
}

// firewalld: the runtime and the permanent config are separate things, and --reload throws the runtime away.
const FWD_SERVICES = { ssh: 22, http: 80, https: 443, smtp: 25, pop3: 110, imap: 143, dns: 53, mysql: 3306, ntp: 123 };
function fwdZone(open = []) { return { zone: 'public', services: open.filter((x) => !/\//.test(x)), ports: open.filter((x) => /\//.test(x)) }; }
function fwdAllows(z, port) {
  if (z.zone !== 'public') return false;
  return z.ports.some((p) => p.split('/')[0] === String(port)) || z.services.some((s) => FWD_SERVICES[s] === Number(port));
}

function firewallCmd(L, line) {
  const f = L.fwd;
  const perm = /--permanent\b/.test(line);
  const z = perm ? f.permanent : f.running;
  const add = (list, v) => { if (list.includes(v)) return out('Warning: ALREADY_ENABLED', 'success'); list.push(v); return out('success'); };
  const rem = (list, v) => { const i = list.indexOf(v); if (i < 0) return out('Warning: NOT_ENABLED', 'success'); list.splice(i, 1); return out('success'); };
  let m;
  if (/--state\b/.test(line)) return L.units.firewalld === 'active' ? out('running') : fail('not running');
  if (L.units.firewalld !== 'active') return fail('FirewallD is not running');
  if (/--reload\b/.test(line)) { f.running = JSON.parse(JSON.stringify(f.permanent)); return out('success'); }
  if ((m = line.match(/--add-port=(\S+)/))) return add(z.ports, m[1]);
  if ((m = line.match(/--remove-port=(\S+)/))) return rem(z.ports, m[1]);
  if ((m = line.match(/--add-service=(\S+)/))) return add(z.services, m[1]);
  if ((m = line.match(/--remove-service=(\S+)/))) return rem(z.services, m[1]);
  if ((m = line.match(/--set-default-zone=(\S+)/))) { f.running.zone = m[1]; f.permanent.zone = m[1]; return out('success'); }
  if (/--get-default-zone\b/.test(line)) return out(f.running.zone);
  if (/--list-ports\b/.test(line)) return out(z.ports.join(' '));
  if (/--list-services\b/.test(line)) return out(z.services.join(' '));
  if (/--add-rich-rule|--remove-rich-rule/.test(line)) return out('success');
  if (/--list-all\b/.test(line)) return out(`${z.zone} (active)`, '  target: default', '  icmp-block-inversion: no', '  interfaces: eth0', '  sources: ', `  services: ${z.services.join(' ')}`, `  ports: ${z.ports.join(' ')}`, '  protocols: ', '  masquerade: no', '  forward-ports: ', '  source-ports: ', '  icmp-blocks: ', '  rich rules: ');
  return fail('usage: see firewall-cmd --help');
}

/** Does the host's own firewall let the scoring engine in on this port? */
function hostAllows(L, ports, scorer) {
  for (const port of ports) {
    if (L.ipt) {
      let verdict = null;
      for (const r of L.ipt.rules) {
        if (r.dport && String(r.dport) !== String(port)) continue;
        if (r.src && !srcCovers(r.src, scorer)) continue;
        verdict = r.target;
        break;
      }
      if ((verdict || L.ipt.policy) !== 'ACCEPT') return false;
    }
    if (L.ufw?.enabled) {
      let verdict = null;
      for (const r of L.ufw.rules) {
        if (String(r.to).split('/')[0] !== String(port) && lc(r.to) !== 'anywhere') continue;
        if (!srcCovers(r.from, scorer)) continue;
        verdict = r.action;
        break;
      }
      if ((verdict ? verdict === 'ALLOW' || verdict === 'LIMIT' : L.ufw.default !== 'deny') === false) return false;
    }
    if (L.fwd && L.units.firewalld === 'active' && !fwdAllows(L.fwd.running, port)) return false;
    if (L.winFw) {
      const rule = L.winFw.rules.find((r) => String(r.port) === String(port));
      if (rule ? rule.action !== 'Allow' : L.winFw.default === 'Block') return false;
    }
  }
  return true;
}

// ---- scored service checks -----------------------------------------------------------------------------------

/** The reason this service's check fails right now, or null when it passes. */
export function serviceProblem(state, svc, { lanOnly = false } = {}) {
  const fwFinding = state.findingList.find((f) => f.fw);
  if (fwFinding && !lanOnly) {
    const edge = state.devState[fwFinding.host];
    if (edge?.firewall && evalFirewall(edge.firewall, fwFinding.fw).down.includes(svc.id)) return 'blocked at the edge firewall';
  }
  if (fwFinding && state.devState[fwFinding.host]?.poweredOff) return 'the firewall is powered off';
  const ds = state.devState[svc.host];
  if (!ds?.live) return null;
  const L = ds.live;
  if (L.bricked) return 'host does not boot';
  if (L.offlineUntil > clock(state)) return 'host is rebooting';
  for (const u of svc.units || []) if (L.units?.[u] !== 'active') return `${u} is not running`;
  for (const n of svc.winServices || []) {
    const s = L.winServices?.find((x) => lc(x.Name) === lc(n));
    if (!s || s.Status !== 'Running') return `${n} service is not running`;
  }
  for (const f of svc.files || []) if (ds.fs?.[f] === undefined) return `${f} is missing`;
  for (const n of svc.needs || []) {
    const other = state.devState[n.host];
    if (!other) continue; // that box is not on this seat
    if (!other.live || other.live.bricked || other.live.offlineUntil > clock(state)) return `${n.host} is unreachable`;
    if (n.winService && other.live.winServices?.find((x) => lc(x.Name) === lc(n.winService))?.Status !== 'Running') return `${n.winService} on ${n.host} is not running`;
  }
  if (svc.content && !svc.content.re.test(ds.fs?.[svc.content.file] || '')) return 'page content is wrong';
  if (svc.healthy && !svc.healthy(ds.fs || {})) return 'configuration is broken';
  const scorer = fwFinding?.fw?.scoringIp || '198.51.100.9';
  if (!hostAllows(L, svc.ports || [], scorer)) return 'blocked by the host firewall';
  return null;
}

/** Recompute every scored service from the boxes. Returns the ids that changed state in each direction. */
export function syncServices(state) {
  panosTick(state);
  const dropped = [];
  const restored = [];
  const services = Object.values(state.services);
  const problems = new Map(services.map((s) => [s.id, serviceProblem(state, s)]));
  for (const s of services) {
    // Dependencies are reached over the LAN, so the edge firewall does not stand between them.
    const dep = !problems.get(s.id) && (s.deps || []).find((d) => state.services[d] && serviceProblem(state, state.services[d], { lanOnly: true }));
    const problem = problems.get(s.id) || (dep ? `${dep} is unreachable` : null);
    const next = problem ? 'down' : 'up';
    if (next !== s.state) {
      (next === 'down' ? dropped : restored).push(s.id);
      if (next === 'down') s.drops += 1;
    }
    s.state = next;
    s.problem = problem;
  }
  return { dropped, restored };
}

// ---- typed admin commands ------------------------------------------------------------------------------------

function linuxUserAdd(ds, name) {
  if (new RegExp(`^${name}:`, 'm').test(ds.fs[PASSWD])) return fail(`useradd: user '${name}' already exists`);
  const uid = 1001 + ds.fs[PASSWD].split('\n').length;
  ds.fs[PASSWD] += `${passwdLine(name, uid)}\n`;
  return out();
}
function linuxUserDel(ds, name) {
  if (!new RegExp(`^${name}:`, 'm').test(ds.fs[PASSWD])) return fail(`userdel: user '${name}' does not exist`);
  ds.fs[PASSWD] = ds.fs[PASSWD].split('\n').filter((l) => !l.startsWith(`${name}:`)).join('\n');
  delete ds.creds[lc(name)];
  return out();
}

function goOffline(state, dev, ds) {
  ds.live.offlineUntil = clock(state) + REBOOT_SECS;
  ds.live.boots = (ds.live.boots || 0) + 1;
  return out(`Connection to ${dev.ip} closed by remote host.`);
}

function linuxCommand(state, dev, ds, line, toks) {
  const L = ds.live;
  const cmd = lc(toks[0]);
  if (/\|\s*chpasswd\b/.test(line)) {
    const body = line.match(/(?:echo|printf)(?:\s+-[en]+)?\s+(['"])(.*?)\1/);
    if (!body) return fail('chpasswd: line 1: missing new password');
    for (const pair of body[2].split(/\\n/)) {
      const k = pair.indexOf(':');
      if (k > 0) setPassword(ds, pair.slice(0, k), pair.slice(k + 1));
    }
    return out();
  }
  const piped = line.match(/(?:echo|printf)(?:\s+-[en]+)?\s+(['"])(.*?)\\n.*?\1\s*\|\s*passwd\s*(\S*)/);
  if (piped) { setPassword(ds, piped[3] || 'root', piped[2]); return out('passwd: password updated successfully'); }
  switch (cmd) {
    case 'passwd': {
      if (toks.includes('-l') || toks.includes('-u')) {
        const u = lc(toks[toks.length - 1]);
        if (ds.creds[u]) ds.creds[u].locked = toks.includes('-l');
        return out('passwd: password expiry information changed.');
      }
      const user = toks[1] || (dev.user || 'analyst');
      if (!new RegExp(`^${user}:`, 'm').test(ds.fs[PASSWD])) return fail(`passwd: user '${user}' does not exist`);
      ds.pending = { kind: 'passwd', user, first: null };
      return out('New password:');
    }
    case 'chpasswd': return fail('chpasswd: pipe user:password pairs in, e.g. echo \'user:pass\' | chpasswd');
    case 'useradd': case 'adduser': return linuxUserAdd(ds, toks[toks.length - 1]);
    case 'userdel': case 'deluser': return linuxUserDel(ds, toks[toks.length - 1]);
    case 'usermod': {
      const u = lc(toks[toks.length - 1]);
      if (toks.includes('-L') && ds.creds[u]) ds.creds[u].locked = true;
      return out();
    }
    case 'reboot': return goOffline(state, dev, ds);
    case 'init': return toks[1] === '6' ? goOffline(state, dev, ds) : null;
    case 'shutdown': return goOffline(state, dev, ds);
    case 'systemctl': {
      const verb = lc(toks[1]);
      if (!['start', 'stop', 'restart', 'reload', 'enable', 'disable'].includes(verb)) return null;
      const unit = lc(toks[toks.length - 1]).replace(/\.service$/, '').replace(/^sshd$/, 'ssh');
      if (!toks[2]) return fail(`Too few arguments.`);
      if (L.units[unit] === undefined) return fail(`Failed to ${verb} ${unit}.service: Unit ${unit}.service not found.`);
      return out();
    }
    case 'service': {
      if (!toks[2]) return null;
      const u = lc(toks[1]).replace(/^sshd$/, 'ssh');
      if (L.units[u] === undefined) return fail(`${toks[1]}: unrecognized service`);
      if (lc(toks[2]) === 'status') return dev.init === 'upstart' ? out(L.units[u] === 'active' ? ` * ${toks[1]} is running` : ` * ${toks[1]} is not running`) : out(systemctlStatus(L, u).replace(/\n$/, '').split('\n'));
      if (dev.init === 'upstart') return out(` * Restarting ${toks[1]}...`, '   ...done.');
      return out(`Redirecting to /bin/systemctl ${lc(toks[2])} ${toks[1]}.service`);
    }
    case 'firewall-cmd': return firewallCmd(L, line);
    case 'apt-get': case 'apt': case 'yum': case 'dnf': return packageManager(dev, cmd, toks);
    case 'ufw': {
      const verb = lc(toks[1]);
      if (verb === 'status' || !verb) return null;
      if (verb === 'enable') return out('Firewall is active and enabled on system startup');
      if (verb === 'disable') return out('Firewall stopped and disabled on system startup');
      if (verb === 'default') return out(`Default incoming policy changed to '${lc(toks[2])}'`, '(be sure to update your rules accordingly)');
      if (verb === 'reset') return out('Resetting all rules to installed defaults.');
      if (verb === 'delete') return out('Rule deleted');
      return out('Rule added');
    }
    case 'iptables': return applyIptables(L, toks, line);
    case 'wp': return /user update/.test(line) ? out('Success: Updated user 1.') : null;
    case 'postconf': {
      if (!toks.includes('-e')) return null;
      const kv = toks[toks.indexOf('-e') + 1] || '';
      const k = kv.indexOf('=');
      const f = ds.fs['/etc/postfix/main.cf'];
      if (k < 0 || f === undefined) return fail('postconf: fatal: bad parameter');
      const key = kv.slice(0, k).trim();
      const re = new RegExp(`^${key}\\s*=.*$`, 'm');
      ds.fs['/etc/postfix/main.cf'] = re.test(f) ? f.replace(re, `${key} = ${kv.slice(k + 1)}`) : `${f}${key} = ${kv.slice(k + 1)}\n`;
      return out();
    }
    case 'crontab': {
      if (toks.includes('-r')) {
        if (ds.fs[ROOT_CRON] === undefined) return fail('no crontab for root');
        delete ds.fs[ROOT_CRON];
        return out();
      }
      return null;
    }
    case 'chmod': case 'chown': case 'chattr': return out();
    case 'kill': case 'pkill': case 'killall': {
      const target = toks[toks.length - 1];
      const before = L.procs.length;
      L.procs = L.procs.filter((p) => String(p.pid) !== target && !p.cmd.includes(target));
      if (before === L.procs.length && cmd !== 'kill') return fail(`${cmd}: no process found`);
      return out();
    }
    case 'curl': case 'wget': return out(String(boxCommands(state, dev, ds).curl(toks.slice(1))).replace(/\n$/, '').split('\n'));
    case 'nano': case 'vi': case 'vim': return null;
    default: return null;
  }
}

// These boxes are old on purpose. Their repositories are gone, so "just patch it" fails the way it does on the day.
function packageManager(dev, cmd, toks) {
  const verb = lc(toks[1]);
  if (!['update', 'upgrade', 'install', 'check-update', 'dist-upgrade'].includes(verb)) return null;
  if (cmd === 'yum' || cmd === 'dnf') {
    return fail('Loaded plugins: fastestmirror', 'Could not retrieve mirrorlist http://mirrorlist.centos.org/?release=7&arch=x86_64&repo=os error was', '14: curl#6 - "Could not resolve host: mirrorlist.centos.org; Unknown error"', '', ' One of the configured repositories failed (Unknown),', ' and yum doesn\'t have enough cached data to continue.', 'Cannot find a valid baseurl for repo: base/7/x86_64');
  }
  const rel = /debian/i.test(dev.os) ? 'jessie' : 'trusty';
  return fail(`Err http://archive.ubuntu.com ${rel}/main amd64 Packages`, '  404  Not Found [IP: 91.189.91.83 80]', `W: Failed to fetch http://archive.ubuntu.com/dists/${rel}/main/binary-amd64/Packages  404  Not Found`, 'E: Some index files failed to download. They have been ignored, or old ones used instead.');
}

/** A tool this operating system does not have: the shell says so, and nothing changes on the box. */
export function missingCommand(dev, line) {
  if (dev.kind !== 'bash' || !dev.init) return null;
  const cmd = lc(line.replace(/^sudo\s+/, '').split(/\s+/)[0]);
  const absent = (dev.init === 'upstart' && cmd === 'systemctl')
    || (cmd === 'ufw' && dev.fwtool !== 'ufw')
    || (cmd === 'firewall-cmd' && dev.fwtool !== 'firewalld')
    || (['apt', 'apt-get', 'dpkg'].includes(cmd) && dev.pkg !== 'apt')
    || (cmd === 'yum' && dev.pkg !== 'yum')
    || (cmd === 'dnf' && dev.pkg !== 'dnf');
  if (!absent) return null;
  return dev.pkg === 'yum' || dev.pkg === 'dnf' ? `-bash: ${cmd}: command not found` : `${cmd}: command not found`;
}

/** Red Team or an admin pressed the power button. Powering on does not undo anything that was done to the box. */
export function setPower(state, devId, on) {
  const ds = state.devState[devId];
  if (!ds) return;
  if (!ds.live) { ds.poweredOff = !on; syncServices(state); return; }
  const L = ds.live;
  if (on) {
    if (!L.off) return;
    L.off = false;
    L.offlineUntil = L.bricked ? Infinity : clock(state) + REBOOT_SECS;
    L.boots = (L.boots || 0) + 1;
  } else { L.off = true; L.offlineUntil = Infinity; }
  syncServices(state);
}

// ---- PAN-OS ---------------------------------------------------------------------------------------------------

const COMMIT_SECS = 90; // competition-clock seconds a commit job takes on a PA-VM

function panosApplied(state, dev, ds, res) {
  const fw = ds.firewall;
  if (res.pw) ds.creds.admin = { pw: res.pw, strong: passwordStrong(res.pw, 'admin'), def: res.pw === DEFAULT_PASSWORD };
  for (const f of state.findingList.filter((x) => x.host === dev.id && x.fw)) {
    const v = panosEval(fw, f.fw);
    state.findings[f.id].status = v.fixed ? 'fixed' : 'open';
    const violation = (id, text) => {
      state.ruleViolations = state.ruleViolations || [];
      if (state.ruleViolations.some((x) => x.id === id)) return;
      state.ruleViolations.push({ id, text, at: clock(state) });
      state.engine?.events.push({ at: clock(state), cls: 'bad', text: `White Team rule violation: ${text}` });
    };
    if (!v.icmp) violation('icmp', 'ICMP was blocked on a public address.');
    if (v.filtered.length) violation('source', 'A public service was restricted by source address.');
  }
}

export function panosTick(state) {
  for (const dev of state.deviceList) {
    if (!dev.panos) continue;
    const ds = state.devState[dev.id];
    if (ds.restartAt && clock(state) >= ds.restartAt) { ds.restartAt = 0; ds.poweredOff = false; }
    const p = ds.firewall.pendingCommit;
    if (p && clock(state) >= p.at) panosApplied(state, dev, ds, finishCommit(ds.firewall));
  }
}

/** One typed line at the firewall console, or one action from the web interface (prefix "@config "). */
export function runPanos(state, dev, ds, rawLine) {
  const fw = ds.firewall;
  const lines = (r) => r.lines.map((text) => ({ cls: r.error ? 'err' : '', text }));
  if (ds.pending?.kind === 'panpw') {
    const p = ds.pending;
    if (p.first === null) { p.first = rawLine; return { lines: [{ cls: '', text: 'Confirm password :' }], effects: {} }; }
    ds.pending = null;
    if (p.first !== rawLine) return { lines: [{ cls: 'err', text: 'Passwords do not match' }], effects: {} };
    fw.candidate.adminPw = rawLine;
    fw.dirty = true;
    return { lines: [], effects: {} };
  }
  const api = {
    startCommit: () => startCommit(fw, state.engine ? clock(state) + COMMIT_SECS / (state.timeScale || 1) : 0),
    reboot: () => { ds.poweredOff = true; ds.restartAt = clock(state) + REBOOT_SECS; },
  };
  const gui = /^@config\s/.test(rawLine);
  const before = fw.mode;
  if (gui) fw.mode = 'config';
  const r = panosLine(fw, gui ? rawLine.replace(/^@config\s+/, '') : rawLine, api);
  if (gui) fw.mode = before;
  if (r.pending) ds.pending = r.pending;
  return { lines: lines(r), effects: { ...(r.logout ? { logout: true } : {}) } };
}

function winServiceOf(L, name) { return L.winServices.find((s) => lc(s.Name) === lc(name)); }

const WIN_SILENT = new Set([
  'disable-localuser', 'enable-localuser', 'remove-localuser', 'remove-localgroupmember', 'unregister-scheduledtask',
  'disable-scheduledtask', 'disable-adaccount', 'enable-adaccount', 'remove-adgroupmember', 'add-adgroupmember', 'remove-aduser',
  'remove-mppreference', 'add-mppreference',
]);

function windowsCommand(state, dev, ds, line, toks) {
  const L = ds.live;
  const cmd = lc(toks[0]);
  const dir = dirOf(dev, ds);
  if (cmd === 'restart-computer' || (cmd === 'shutdown' && /\/r|-r/i.test(line))) return goOffline(state, dev, ds);
  if (/set-adaccountpassword/i.test(line)) {
    const pw = secureArg(line);
    if (!pw) return fail('Set-ADAccountPassword : Cannot validate argument on parameter \'NewPassword\'.');
    if (/get-aduser[^|]*-filter/i.test(line)) {
      for (const u of dir?.all || []) if (u.type === 'user') setPassword(ds, u.sam, pw);
      return out();
    }
    const id = namedArg(toks, '-identity') || toks[1];
    if (dir && !dir.lookup(id)) return fail(`Set-ADAccountPassword : Cannot find an object with identity: '${id}'.`);
    setPassword(ds, id, pw);
    return out();
  }
  if (cmd === 'set-localuser') {
    const pw = secureArg(line);
    if (pw) setPassword(ds, namedArg(toks, '-name') || toks[1], pw);
    return out();
  }
  if (cmd === 'net' && lc(toks[1]) === 'user' && toks[2] && toks[3] && !toks[3].startsWith('/')) {
    setPassword(ds, toks[2], toks[3]);
    if (/\/add/i.test(line) && !L.localUsers.some((u) => lc(u.Name) === lc(toks[2]))) L.localUsers.push({ Name: toks[2], Enabled: true, Description: '' });
    return out('The command completed successfully.');
  }
  if (cmd === 'net' && /\/active:no|\/delete/i.test(line)) return out('The command completed successfully.');
  if (cmd === 'new-aduser') {
    const sam = namedArg(toks, '-samaccountname') || namedArg(toks, '-name') || toks[1];
    if (dir && !dir.lookup(sam)) dir.addUser({ sam, first: sam, last: '', ou: 'Users', created: new Date(0).toISOString().slice(0, 10) });
    const pw = secureArg(line);
    if (pw) setPassword(ds, sam, pw);
    return out();
  }
  if (cmd === 'new-localuser') {
    const name = namedArg(toks, '-name') || toks[1];
    L.localUsers.push({ Name: name, Enabled: true, Description: '' });
    const pw = secureArg(line);
    if (pw) setPassword(ds, name, pw);
    return out();
  }
  if (cmd === 'add-localgroupmember') {
    const m = namedArg(toks, '-member');
    if (m) L.localAdmins.push({ ObjectClass: 'User', Name: m, PrincipalSource: 'Local' });
    return out();
  }
  if (cmd === 'stop-service' || cmd === 'start-service' || cmd === 'restart-service' || cmd === 'set-service') {
    const name = namedArg(toks, '-name') || toks[1];
    const s = winServiceOf(L, name);
    if (!s) return fail(`${toks[0]} : Cannot find any service with service name '${name}'.`);
    if (cmd === 'restart-service' && s.StartType !== 'Disabled') s.Status = 'Running';
    if (cmd === 'start-service' && s.StartType === 'Disabled') return fail(`Start-Service : Service '${s.DisplayName} (${s.Name})' cannot be started because it is disabled.`);
    return out();
  }
  if (cmd === 'sc' || cmd === 'sc.exe') {
    if (lc(toks[1]) === 'query') return null;
    if (lc(toks[1]) === 'delete') {
      L.winServices = L.winServices.filter((s) => lc(s.Name) !== lc(toks[2]));
      return out('[SC] DeleteService SUCCESS');
    }
    return out('[SC] ChangeServiceConfig SUCCESS');
  }
  if (cmd === 'set-netfirewallprofile') {
    const a = namedArg(toks, '-defaultinboundaction');
    if (a) L.winFw.default = lc(a) === 'block' ? 'Block' : 'Allow';
    return out();
  }
  if (cmd === 'new-netfirewallrule') {
    if (lc(namedArg(toks, '-direction') || 'inbound') === 'inbound') {
      L.winFw.rules.unshift({ name: namedArg(toks, '-displayname') || 'rule', port: namedArg(toks, '-localport'), action: lc(namedArg(toks, '-action')) === 'block' ? 'Block' : 'Allow' });
    }
    return out();
  }
  if (cmd === 'remove-netfirewallrule') {
    const n = lc(namedArg(toks, '-displayname') || '');
    L.winFw.rules = L.winFw.rules.filter((r) => lc(r.name) !== n);
    return out();
  }
  if (cmd === 'netsh' && /advfirewall/i.test(line)) {
    if (/add rule/i.test(line) && /dir=in/i.test(line)) {
      L.winFw.rules.unshift({ name: (line.match(/name="?([^"\s]+)/i) || [])[1] || 'rule', port: (line.match(/localport=(\d+)/i) || [])[1], action: /action=block/i.test(line) ? 'Block' : 'Allow' });
      return out('Ok.');
    }
    if (/firewallpolicy\s+blockinbound/i.test(line)) L.winFw.default = 'Block';
    if (/firewallpolicy\s+allowinbound/i.test(line)) L.winFw.default = 'Allow';
    return /show/i.test(line) ? null : out('Ok.');
  }
  if (cmd === 'auditpol' && /\/set/i.test(line)) {
    const sub = (line.match(/\/subcategory:"?([^"]+?)"?(\s|$)/i) || [])[1];
    if (sub) L.audit[lc(sub)] = true;
    return out('The command was successfully executed.');
  }
  if (cmd === 'reg' && lc(toks[1]) === 'delete') {
    const v = namedArg(toks, '/v');
    L.runKeys = L.runKeys.filter((k) => lc(k.name) !== lc(v));
    return out('The operation completed successfully.');
  }
  if (cmd === 'remove-itemproperty') {
    const v = namedArg(toks, '-name');
    L.runKeys = L.runKeys.filter((k) => lc(k.name) !== lc(v));
    return out();
  }
  if (/^set-(smbserverconfiguration|mppreference|addefaultdomainpasswordpolicy)$/.test(cmd)) {
    for (let i = 1; i < toks.length - 1; i++) if (toks[i].startsWith('-') && !toks[i + 1].startsWith('-')) L.settings[lc(toks[i].slice(1))] = toks[i + 1].replace(/^\$/, '');
    return out();
  }
  if (WIN_SILENT.has(cmd)) return out();
  return null;
}

/** Applies an admin command to the box. Returns { handled, lines } or null when the inspection engine should run it. */
export function applyBoxCommand(state, dev, ds, line) {
  if (!ds.live || dev.kind === 'firewall') return null;
  const clean = line.replace(/(^|\|\s*)sudo\s+/g, '$1');
  const toks = words(clean);
  if (!toks.length) return null;
  return dev.kind === 'bash' ? linuxCommand(state, dev, ds, clean, toks) : windowsCommand(state, dev, ds, clean, toks);
}

/** A second or third line typed into an open `passwd` prompt. */
export function continuePending(ds, line) {
  const p = ds.pending;
  if (p.first === null) { p.first = line; return out('Retype new password:'); }
  ds.pending = null;
  if (p.first !== line) return fail('Sorry, passwords do not match.', 'passwd: Authentication token manipulation error', 'passwd: password unchanged');
  setPassword(ds, p.user, line);
  return out('passwd: password updated successfully');
}

// ---- read commands that must show the live box ---------------------------------------------------------------

function httpResponse(state, dev, ds, arg) {
  const local = /localhost|127\.0\.0\.1/.test(arg) || arg.includes(dev.ip);
  if (!local) return `curl: (6) Could not resolve host: ${arg.replace(/^https?:\/\//, '').split('/')[0]}\n`;
  const web = state.serviceList.find((s) => s.host === dev.id && s.ports?.some((p) => p === 80 || p === 443));
  if (!web) return `curl: (7) Failed to connect to ${arg} port 80: Connection refused\n`;
  const problem = serviceProblem(state, web);
  if (problem && /not running|rebooting|boot/.test(problem)) return `curl: (7) Failed to connect to ${arg} port 80: Connection refused\n`;
  if (problem) return 'HTTP/1.1 500 Internal Server Error\nServer: Apache\nContent-Length: 0\n\n';
  const body = web.content ? ds.fs[web.content.file] : '';
  return `HTTP/1.1 200 OK\nServer: Apache\nContent-Type: text/html\n\n${body || ''}`;
}

const ROW = (L) => L.procs.map((p) => `${p.user.padEnd(9)} ${String(p.pid).padStart(5)}   0.1  0.2 ${p.cmd}`);

/** Wrap a device's commands so status tools reflect what is really on the box right now. */
export function boxCommands(state, dev, ds) {
  const base = dev.ctx?.commands || {};
  const L = ds.live;
  if (!L) return base;
  const text = (r) => (r == null ? '' : String(r));
  const wrapped = { ...base };
  const after = (name, fn) => {
    const orig = base[name];
    wrapped[name] = (args, stdin, ctx) => fn(orig ? orig(args, stdin, ctx) : '', args, stdin, ctx);
  };
  if (dev.kind === 'bash') {
    const deadPorts = state.serviceList.filter((s) => s.host === dev.id && (s.units || []).some((u) => L.units[u] !== 'active')).flatMap((s) => s.ports);
    const live = (t) => text(t).split('\n').filter((l) => !deadPorts.some((p) => l.includes(`:${p} `))).join('\n');
    after('ps', (r) => `${text(r).replace(/\n$/, '')}${L.procs.length ? `\n${ROW(L).join('\n')}` : ''}\n`);
    after('ss', (r) => `${live(r).replace(/\n$/, '')}${L.conns.length ? `\n${L.conns.join('\n')}` : ''}\n`);
    after('netstat', (r) => `${live(r).replace(/\n$/, '')}${L.conns.length ? `\n${L.conns.join('\n')}` : ''}\n`);
    after('who', (r) => `${text(r).replace(/\n$/, '')}${L.sessions.length ? `\n${L.sessions.join('\n')}` : ''}\n`);
    wrapped.w = wrapped.who;
    wrapped.crontab = (args) => {
      if ((args || []).includes('-l')) return ds.fs[ROOT_CRON] ?? 'no crontab for root\n';
      return 'usage: crontab -l | crontab -r\n';
    };
    wrapped.iptables = (args) => {
      if (!(args || []).includes('-L') && !(args || []).includes('-S')) return '';
      const rows = L.ipt.rules.map((r) => `${String(r.target).padEnd(10)} ${String(r.proto || 'all').padEnd(4)} --  ${String(r.src || 'anywhere').padEnd(20)} anywhere${r.dport ? `  dpt:${r.dport}` : ''}`);
      return `Chain INPUT (policy ${L.ipt.policy})\ntarget     prot opt source               destination\n${rows.length ? `${rows.join('\n')}\n` : ''}\nChain FORWARD (policy ACCEPT)\n\nChain OUTPUT (policy ACCEPT)\n`;
    };
    wrapped.curl = (args) => {
      const url = (args || []).find((a) => !a.startsWith('-')) || '';
      const res = httpResponse(state, dev, ds, url);
      return (args || []).some((a) => a === '-I' || a === '--head') ? res.split('\n\n')[0].concat('\n') : res;
    };
    wrapped.wget = wrapped.curl;
    wrapped.nc = (args) => {
      const rest = (args || []).filter((a) => !a.startsWith('-'));
      const port = Number(rest[1]);
      const open = port === 22 || state.serviceList.some((s) => s.host === dev.id && s.ports.includes(port) && !deadPorts.includes(port));
      return open ? `Connection to ${rest[0]} ${port} port [tcp/*] succeeded!\n` : `nc: connect to ${rest[0]} port ${port} (tcp) failed: Connection refused\n`;
    };
    wrapped.postconf = (args, stdin, ctx) => {
      const name = (args || []).find((a) => !a.startsWith('-'));
      const f = ds.fs['/etc/postfix/main.cf'];
      if (!name || f === undefined) return base.postconf ? base.postconf(args, stdin, ctx) : '';
      const m = f.match(new RegExp(`^${name}\\s*=.*$`, 'm'));
      return m ? `${m[0]}\n` : `postconf: warning: ${name}: unknown parameter\n`;
    };
  } else {
    for (const name of ['get-smbserverconfiguration', 'get-mppreference', 'get-addefaultdomainpasswordpolicy']) {
      if (!base[name]) continue;
      wrapped[name] = (args, stdin, ctx) => {
        let t = text(base[name](args, stdin, ctx));
        for (const [k, v] of Object.entries(L.settings)) t = t.replace(new RegExp(`^(${k}\\s*:\\s*).*$`, 'im'), `$1${v.replace(/^\w/, (c) => c.toUpperCase())}`);
        return t;
      };
    }
    wrapped.reg = (args) => {
      if (lc((args || [])[0]) !== 'query') return '';
      const rows = L.runKeys.map((k) => `    ${k.name}    REG_SZ    ${k.cmd}`);
      return `\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run\n    SecurityHealth    REG_EXPAND_SZ    %windir%\\system32\\SecurityHealthSystray.exe\n${rows.join('\n')}\n`;
    };
    wrapped['get-itemproperty'] = (args) => {
      if (!/\\run/i.test((args || []).join(' '))) return '';
      return [...L.runKeys.map((k) => `${k.name} : ${k.cmd}`), 'SecurityHealth : %windir%\\system32\\SecurityHealthSystray.exe'].join('\n');
    };
    wrapped.tasklist = (args, stdin, ctx) => `${text(base.tasklist?.(args, stdin, ctx)).replace(/\n$/, '')}${L.procs.length ? `\n${L.procs.map((p) => `${p.cmd.padEnd(25)} ${String(p.pid).padStart(8)} Services`).join('\n')}` : ''}\n`;
    wrapped.netstat = (args, stdin, ctx) => `${text(base.netstat?.(args, stdin, ctx)).replace(/\n$/, '')}${L.conns.length ? `\n${L.conns.join('\n')}` : ''}\n`;
    wrapped.query = () => ` USERNAME   SESSIONNAME   ID  STATE\n ${dev.user}   console   1  Active\n${L.sessions.join('\n')}\n`;
  }
  return wrapped;
}

// ---- host-side changes the shared state helper does not know about --------------------------------------------

/** ufw default / delete / reset (hostState covers allow, deny, enable, disable). */
export function applyUfwExtras(L, line) {
  const toks = words(line.replace(/^sudo\s+/, ''));
  if (lc(toks[0]) !== 'ufw' || !L?.ufw) return;
  const verb = lc(toks[1]);
  if (verb === 'default' && /allow|deny|reject/.test(lc(toks[2]))) L.ufw.default = lc(toks[2]) === 'allow' ? 'allow' : 'deny';
  if (verb === 'reset') { L.ufw.rules = []; L.ufw.enabled = false; L.ufw.default = 'allow'; }
  if (verb === 'delete') {
    if (/^\d+$/.test(toks[2] || '')) { L.ufw.rules.splice(Number(toks[2]) - 1, 1); return; }
    const action = (toks[2] || '').toUpperCase();
    const rest = toks.slice(3).map(lc);
    const fromI = rest.indexOf('from');
    const portI = rest.indexOf('port');
    const from = fromI >= 0 ? rest[fromI + 1] : 'Anywhere';
    const to = portI >= 0 ? rest[portI + 1] : rest.find((t) => /^\d+(\/\w+)?$/.test(t)) || 'Anywhere';
    const k = L.ufw.rules.findIndex((r) => r.action === action && r.from === from && r.to === to);
    if (k >= 0) L.ufw.rules.splice(k, 1);
  }
}
