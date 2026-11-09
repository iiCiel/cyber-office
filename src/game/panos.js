// A PAN-OS 11 firewall for the CCDC lab: the operational and configure CLI, a candidate config that does nothing
// until it is committed, and a first-match security policy with real PAN-OS semantics (zones, pre-NAT destination
// addresses, App-ID, application-default). Midwest teams meet this box on drop-flag morning, so the behaviour that
// bites people on the day is modelled: a commit is a job that takes a while, security rules match the PUBLIC
// address but the post-NAT zone, and there is an interzone-default deny under everything.
//
// Pure data. Rule shape: { name, from:[], to:[], source:[], destination:[], application:[], service:[], action,
// disabled? }. Nothing is executed.

const clone = (v) => JSON.parse(JSON.stringify(v));
const ACTIONS = new Set(['allow', 'deny', 'drop', 'reset-client', 'reset-server', 'reset-both']);

// The App-IDs a team actually uses in a rule, with their application-default ports.
export const APPS = {
  'web-browsing': { proto: 'tcp', ports: [80] }, ssl: { proto: 'tcp', ports: [443] }, smtp: { proto: 'tcp', ports: [25] },
  'smtp-base': { proto: 'tcp', ports: [25] }, pop3: { proto: 'tcp', ports: [110] }, imap: { proto: 'tcp', ports: [143] },
  dns: { proto: 'udp', ports: [53] }, 'dns-base': { proto: 'udp', ports: [53] }, ntp: { proto: 'udp', ports: [123] },
  ping: { proto: 'icmp', ports: [0] }, icmp: { proto: 'icmp', ports: [0] }, ssh: { proto: 'tcp', ports: [22] }, telnet: { proto: 'tcp', ports: [23] },
  'ms-rdp': { proto: 'tcp', ports: [3389] }, 'ms-ds-smb': { proto: 'tcp', ports: [445] }, netbios: { proto: 'tcp', ports: [139] }, 'msrpc-base': { proto: 'tcp', ports: [135] },
  'windows-remote-management': { proto: 'tcp', ports: [5985] }, mysql: { proto: 'tcp', ports: [3306] }, ldap: { proto: 'tcp', ports: [389] }, kerberos: { proto: 'tcp', ports: [88] },
  'docker-base': { proto: 'tcp', ports: [2375] }, splunk: { proto: 'tcp', ports: [8000, 8089] }, 'ms-update': { proto: 'tcp', ports: [443] },
};
const APP_BY_PORT = { 80: 'web-browsing', 443: 'ssl', 25: 'smtp', 110: 'pop3', 143: 'imap', 53: 'dns', 22: 'ssh', 23: 'telnet', 3389: 'ms-rdp', 445: 'ms-ds-smb', 139: 'netbios', 135: 'msrpc-base', 5985: 'windows-remote-management', 3306: 'mysql', 2375: 'docker-base', 8000: 'splunk', 8089: 'splunk' };

const BUILTIN_SERVICES = { any: null, 'application-default': null, 'service-http': { proto: 'tcp', ports: [80, 8080] }, 'service-https': { proto: 'tcp', ports: [443] } };
const FIELDS = new Set(['from', 'to', 'source', 'destination', 'application', 'service', 'action', 'disabled', 'source-user', 'hip-profiles', 'category', 'log-start', 'log-end', 'log-setting', 'description', 'tag', 'profile-setting', 'rule-type', 'negate-source', 'negate-destination']);

// ---- the config ---------------------------------------------------------------------------------------------

/** A firewall from its scenario spec: { zones, interfaces, nat, rules, hostname, serial }. */
export function makePanos(spec) {
  const base = { rules: clone(spec.rules || []), services: {}, addresses: {}, adminPw: null };
  return { panos: true, spec, mode: 'op', running: clone(base), candidate: clone(base), rules: clone(base.rules), jobs: [], nextJob: 2, pendingCommit: null, watchSrc: [], dirty: false };
}

// ---- matching -----------------------------------------------------------------------------------------------

const ipNum = (ip) => ip.split('.').reduce((n, o) => n * 256 + Number(o), 0);
function coversIp(entry, ip, addrs) {
  const raw = String(entry).toLowerCase();
  if (raw === 'any') return true;
  const v = addrs?.[raw] || raw;
  const range = v.match(/^(\d+\.\d+\.\d+\.\d+)-(\d+\.\d+\.\d+\.\d+)$/);
  if (range) { const n = ipNum(ip); return n >= ipNum(range[1]) && n <= ipNum(range[2]); }
  const [base, bits = '32'] = v.split('/');
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(base)) return false;
  const size = 2 ** (32 - Number(bits));
  return Math.floor(ipNum(ip) / size) === Math.floor(ipNum(base) / size);
}
const zoneOk = (list, z) => list.some((x) => x === 'any' || x === z);

function serviceOk(r, flow, services) {
  return r.service.some((s) => {
    if (s === 'any') return true;
    if (s === 'application-default') {
      const named = r.application.includes('any') ? APPS[flow.app] : APPS[flow.app];
      return !!named && named.ports.includes(flow.port);
    }
    const d = BUILTIN_SERVICES[s] || services?.[s];
    return !!d && d.proto === flow.proto && d.ports.includes(flow.port);
  });
}

/** The first rule a flow hits, or the built-in default. `ignoreSource` asks which rule it would hit from anywhere. */
export function matchFlow(cfg, flow, { ignoreSource = false } = {}) {
  for (const r of cfg.rules) {
    if (r.disabled) continue;
    if (!zoneOk(r.from, flow.from) || !zoneOk(r.to, flow.to)) continue;
    if (!ignoreSource && !r.source.some((s) => coversIp(s, flow.src, cfg.addresses))) continue;
    if (!r.destination.some((d) => coversIp(d, flow.dst, cfg.addresses))) continue;
    if (!r.application.some((a) => a === 'any' || a === flow.app)) continue;
    if (!serviceOk(r, flow, cfg.services)) continue;
    return r;
  }
  return flow.from === flow.to ? { name: 'intrazone-default', action: 'allow', builtin: true } : { name: 'interzone-default', action: 'deny', builtin: true };
}

const flowOf = (spec, host, f, src) => ({ from: spec.zone, to: host.zone, src, dst: host.public, port: f.port, proto: f.proto, app: f.app || APP_BY_PORT[f.port] });

/** Same contract as evalFirewall: { fixed, down, open, note }, plus the rule-compliance facts. */
export function panosEval(fw, spec) {
  const cfg = { rules: fw.rules, services: fw.running.services, addresses: fw.running.addresses };
  const down = [];
  const filtered = [];
  for (const s of spec.services) {
    if (!spec.scored.includes(s.id)) continue;
    for (const f of s.flows) {
      const flow = flowOf(spec, s, f, spec.scoringIp);
      if (matchFlow(cfg, flow).action === 'allow') continue;
      if (!down.includes(s.id)) down.push(s.id);
      if (matchFlow(cfg, flow, { ignoreSource: true }).action === 'allow' && !filtered.includes(s.id)) filtered.push(s.id);
    }
  }
  let open = null;
  outer: for (const h of spec.exposed) {
    for (const src of [spec.scoringIp, ...(fw.watchSrc || [])]) {
      for (const port of h.ports) {
        const app = APP_BY_PORT[port];
        const proto = APPS[app]?.proto || 'tcp';
        if (matchFlow(cfg, flowOf(spec, h, { port, proto, app }, src)).action !== 'allow') continue;
        open = `port ${port} on ${h.public} is reachable from the Core`;
        break outer;
      }
    }
  }
  const icmp = spec.exposed.every((h) => matchFlow(cfg, flowOf(spec, h, { port: 0, proto: 'icmp', app: 'ping' }, spec.scoringIp)).action === 'allow');
  return { fixed: !open && !down.length, down, open, filtered, icmp, note: open || 'no rule allows this scored flow' };
}

// ---- CLI text -----------------------------------------------------------------------------------------------

const braces = (a) => (a.length === 1 ? a[0] : `[ ${a.join(' ')} ]`);

function runningBlock(r, i) {
  return [
    `"${r.name}; index: ${i + 1}" {`,
    `        from ${braces(r.from)};`,
    `        source ${braces(r.source)};`,
    '        source-region none;',
    `        to ${braces(r.to)};`,
    `        destination ${braces(r.destination)};`,
    '        destination-region none;',
    '        user any;',
    '        category any;',
    `        application/service ${r.application.join(',')}/${r.service.join(',')};`,
    `        action ${r.action};`,
    '        terminal yes;',
    '}',
    '',
  ];
}

function candidateBlock(rules) {
  const out = ['rulebase {', '  security {', '    rules {'];
  for (const r of rules) {
    out.push(`      ${r.name} {`, `        to ${braces(r.to)};`, `        from ${braces(r.from)};`, `        source ${braces(r.source)};`, `        destination ${braces(r.destination)};`, `        application ${braces(r.application)};`, `        service ${braces(r.service)};`, `        action ${r.action};`);
    if (r.disabled) out.push('        disabled yes;');
    out.push('      }');
  }
  out.push('    }', '  }', '}');
  return out;
}

export const panosPrompt = (fw, host = 'PA-VM') => `admin@${host}${fw.mode === 'config' ? '#' : '>'}`;

function words(line) {
  return (String(line).match(/\[|\]|"[^"]*"|'[^']*'|[^\s[\]]+/g) || []).map((t) => t.replace(/^['"]|['"]$/g, ''));
}

// `set rulebase security rules NAME from Core to Public source [ a b ] action allow`
function parseFields(toks) {
  const kv = [];
  for (let i = 0; i < toks.length;) {
    const key = toks[i];
    if (!FIELDS.has(key)) return { error: `Invalid syntax.` };
    const val = [];
    i += 1;
    if (toks[i] === '[') {
      i += 1;
      while (i < toks.length && toks[i] !== ']') val.push(toks[i++]);
      i += 1;
    } else if (i < toks.length) val.push(toks[i++]);
    if (!val.length) return { error: `Invalid syntax.` };
    kv.push([key, val]);
  }
  return { kv };
}

function blankRule(name) { return { name, from: [], to: [], source: [], destination: [], application: [], service: [], action: '' }; }

function setRule(fw, name, toks) {
  const parsed = parseFields(toks);
  if (parsed.error) return parsed;
  const cfg = fw.candidate;
  let r = cfg.rules.find((x) => x.name === name);
  if (!r) { r = blankRule(name); cfg.rules.push(r); }
  for (const [k, v] of parsed.kv) {
    if (k === 'action') {
      if (!ACTIONS.has(v[0])) return { error: 'Invalid syntax.' };
      r.action = v[0];
    } else if (k === 'disabled') r.disabled = v[0] === 'yes';
    else if (['from', 'to', 'source', 'destination', 'application', 'service'].includes(k)) r[k] = [...new Set([...(r[k] || []), ...v])];
  }
  return {};
}

/** The errors a commit would stop on. */
export function validate(fw) {
  const zones = new Set(['any', ...fw.spec.zones]);
  const cfg = fw.candidate;
  const errs = [];
  for (const r of cfg.rules) {
    const at = `rulebase -> security -> rules -> ${r.name}`;
    for (const k of ['from', 'to', 'source', 'destination', 'application', 'service']) if (!r[k].length) errs.push(`${at}  is missing '${k}'`);
    if (!r.action) errs.push(`${at}  is missing 'action'`);
    for (const k of ['from', 'to']) for (const z of r[k]) if (!zones.has(z)) errs.push(`${at} -> ${k} '${z}' is not a valid reference`);
    for (const a of r.application) if (a !== 'any' && !APPS[a]) errs.push(`${at} -> application '${a}' is not a valid reference`);
    for (const s of r.service) if (!(s in BUILTIN_SERVICES) && !cfg.services[s]) errs.push(`${at} -> service '${s}' is not a valid reference`);
    for (const k of ['source', 'destination']) for (const a of r[k]) if (a !== 'any' && !/^\d+\.\d+\.\d+\.\d+/.test(a) && !cfg.addresses[a.toLowerCase()]) errs.push(`${at} -> ${k} '${a}' is not a valid reference`);
  }
  return errs;
}

/** Start a commit. `at` is when it lands. */
export function startCommit(fw, at) {
  const errs = validate(fw);
  if (errs.length) return { ok: false, errs };
  const id = fw.nextJob++;
  fw.jobs.push({ id, type: 'Commit', status: 'ACT', result: 'PEND', at });
  fw.pendingCommit = { id, at };
  return { ok: true, id };
}

/** Land a pending commit. Returns the password it set, if any. */
export function finishCommit(fw) {
  const job = fw.jobs.find((j) => j.id === fw.pendingCommit.id);
  job.status = 'FIN'; job.result = 'OK';
  fw.pendingCommit = null;
  const pw = fw.candidate.adminPw;
  fw.candidate.adminPw = null;
  fw.running = clone(fw.candidate);
  fw.rules = fw.running.rules;
  fw.dirty = false;
  return { pw };
}

/** Red Team writes straight into both configs, so the rule survives a commit until someone deletes it. */
export function plantRule(fw, name, ip) {
  const r = { name, from: ['any'], to: ['any'], source: [ip], destination: ['any'], application: ['any'], service: ['any'], action: 'allow' };
  fw.candidate.rules.unshift(clone(r));
  fw.running.rules.unshift(clone(r));
  fw.rules = fw.running.rules;
  fw.watchSrc.push(ip);
}

function moveRule(rules, name, toks) {
  const i = rules.findIndex((r) => r.name === name);
  if (i < 0) return { error: `No such node` };
  const [r] = rules.splice(i, 1);
  const where = toks[0];
  if (where === 'top') rules.unshift(r);
  else if (where === 'bottom') rules.push(r);
  else if (where === 'before' || where === 'after') {
    const k = rules.findIndex((x) => x.name === toks[1]);
    if (k < 0) { rules.splice(i, 0, r); return { error: `No such node` }; }
    rules.splice(where === 'before' ? k : k + 1, 0, r);
  } else { rules.splice(i, 0, r); return { error: 'Invalid syntax.' }; }
  return {};
}

const OK = (lines = []) => ({ lines });
const ERR = (text) => ({ lines: [text], error: true });

function systemInfo(fw) {
  const s = fw.spec;
  return [`hostname: ${s.hostname}`, `ip-address: ${s.mgmtIp}`, 'netmask: 255.255.255.0', `default-gateway: ${s.mgmtGw || '172.20.242.254'}`, 'mac-address: 00:50:56:8a:3c:11', `time: ${s.date || 'Sat Nov 14 08:00:00 2026'}`, 'uptime: 0 days, 3:12:44', 'family: vm', 'model: PA-VM', `serial: ${s.serial}`, 'vm-mode: VMware ESXi', 'sw-version: 11.0.0', 'app-version: 8652-7927', 'threat-version: 8652-7927', 'wildfire-version: 0', 'logdb-version: 11.0.0', 'operational-mode: normal', 'multi-vsys: off'];
}

function interfaces(fw) {
  const rows = fw.spec.interfaces.map((i) => `${i.name.padEnd(20)}${String(i.id).padEnd(7)}1000/full/up      ${i.mac}`);
  const logical = fw.spec.interfaces.map((i) => `${i.name.padEnd(20)}${String(i.id).padEnd(7)}0    vr:default   ${i.zone.padEnd(10)}${i.ip}`);
  return ['total configured hardware interfaces: ' + rows.length, '', 'name                id     speed/duplex/state  mac address', '--------------------------------------------------------------------------------', ...rows, '', 'total configured logical interfaces: ' + logical.length, '', 'name                id     tag  forwarding   zone      address', '--------------------------------------------------------------------------------', ...logical];
}

function natTable(fw) {
  const out = [];
  fw.spec.nat.forEach((n, i) => {
    out.push(`"${n.name}; index: ${i + 1}" {`, `        nat-type ipv4;`, `        from Core;`, `        source any;`, `        to Core;`, `        to-interface ethernet1/3;`, `        destination ${n.public};`, `        service 0:any/any/any;`, `        translate-to "dst: ${n.internal}";`, `        terminal no;`, '}', '');
  });
  return out;
}

function trafficRows(fw, api) {
  const rows = (fw.spec.nat || []).slice(0, 7).map((n, i) => ({ src: `172.31.0.${25 + i}`, dst: n.public, dport: [443, 53, 80, 389, 8000, 80, 25][i] }));
  for (const ip of api.attackers?.() || []) rows.unshift({ src: ip, dst: fw.spec.nat[0].public, dport: 3389 }, { src: ip, dst: fw.spec.nat[2].public, dport: 22 });
  return rows.map((r) => { const hit = matchFlow({ rules: fw.rules, services: fw.running.services, addresses: fw.running.addresses }, { from: 'Core', to: 'any', src: r.src, dst: r.dst, port: r.dport, proto: 'tcp', app: APP_BY_PORT[r.dport] || 'not-applicable' }); return { ...r, rule: hit.name, action: hit.action }; });
}

function trafficLog(fw, api) {
  const out = ['Time                 App             From    Src Port  Source             To      Dst Port  Destination        Rule               Action'];
  for (const r of trafficRows(fw, api)) out.push(`2026/11/14 08:14:22  ${(APP_BY_PORT[r.dport] || 'incomplete').padEnd(16)}Core    ${String(40000 + r.dport).padEnd(10)}${r.src.padEnd(19)}any     ${String(r.dport).padEnd(10)}${r.dst.padEnd(19)}${r.rule.padEnd(19)}${r.action}`);
  return out;
}

function sessionTable(fw, api) {
  const rows = trafficRows(fw, api).filter((r) => r.action === 'allow');
  return ['ID       Application  State   Type  Flag  Src[Sport]/Zone/Proto  (translated)', '         Dst[Dport]/Zone  (translated)', '--------------------------------------------------------------------------------', ...rows.flatMap((r, i) => [`${100 + i}      ${(APP_BY_PORT[r.dport] || 'undecided').padEnd(13)}ACTIVE  FLOW  NS    ${r.src}[${40000 + r.dport}]/Core/6`, `         ${r.dst}[${r.dport}]`])];
}

function jobTable(fw) {
  const rows = fw.jobs.map((j) => `${fw.spec.date || '2026/11/14 08:00:00'}  ${String(j.id).padStart(5)}  ${j.type.padEnd(10)} ${j.status}  ${j.result.padEnd(5)} ${j.status === 'FIN' ? '100%' : '55%'}`);
  return ['Enqueued             Dequeued         ID  Type       Status Result Completed', '------------------------------------------------------------------------------', ...(rows.length ? rows : ['(no jobs)'])];
}

/**
 * One line at the PAN-OS CLI. Mutates `fw`. `api` carries what only the game can do:
 * { startCommit: () => ({ok,id}|{ok:false,errs}), reboot: () => void, gui?:bool }.
 */
export function panosLine(fw, rawLine, api = {}) {
  const line = String(rawLine || '').trim();
  const toks = words(line);
  const c = toks[0];
  if (!c) return OK();

  if (fw.mode === 'op') {
    if (c === 'configure') { fw.mode = 'config'; return OK(['Entering configuration mode', '[edit]']); }
    if (c === 'exit' || c === 'quit') return { lines: [], logout: true };
    if (c === 'show') {
      if (line === 'show system info') return OK(systemInfo(fw));
      if (line === 'show interface all') return OK(interfaces(fw));
      if (line === 'show running security-policy') return OK([...fw.rules.filter((r) => !r.disabled).flatMap(runningBlock), `"interzone-default; index: ${fw.rules.length + 1}" {`, '        action deny;', '        terminal yes;', '}']);
      if (line === 'show running nat-policy') return OK(natTable(fw));
      if (/^show jobs( all)?$/.test(line) || /^show jobs (id \d+|processed|pending)$/.test(line)) return OK(jobTable(fw));
      if (line === 'show admins') return OK(['Admin           From            Client   Session-start        Idle-for', '----------------------------------------------------------------------', 'admin           Console         CLI      11/14 08:02:11       00:00:00s']);
      if (/^show session (all|info)/.test(line)) return OK(sessionTable(fw, api));
      if (/^show log traffic/.test(line)) return OK(trafficLog(fw, api));
      if (line === 'show clock') return OK([fw.spec.date || 'Sat Nov 14 08:00:00 CST 2026']);
      if (/^show config (running|candidate)/.test(line)) return OK(candidateBlock(/running/.test(line) ? fw.rules : fw.candidate.rules));
      return ERR('Invalid syntax.');
    }
    if (c === 'set' && toks[1] === 'cli') return OK();
    if (c === 'ping') return OK(['PING host (56(84) bytes of data.', '64 bytes from host: icmp_seq=1 ttl=64 time=0.4 ms', '--- ping statistics ---', '1 packets transmitted, 1 received, 0% packet loss']);
    if (c === 'request' && toks[1] === 'restart' && toks[2] === 'system') { api.reboot?.(); return OK(['Executing this command will disconnect the current session. Broadcast message from root.', 'The system is going down for reboot NOW!']); }
    if (c === 'test' && toks[1] === 'security-policy-match') {
      const get = (k) => { const i = toks.indexOf(k); return i >= 0 ? toks[i + 1] : null; };
      const protoNum = get('protocol') || '6';
      const port = Number(get('destination-port') || 0);
      const proto = protoNum === '17' ? 'udp' : protoNum === '1' ? 'icmp' : 'tcp';
      if (!get('source') || !get('destination')) return ERR('Invalid syntax.');
      const flow = { from: get('from') || 'any', to: get('to') || 'any', src: get('source'), dst: get('destination'), port, proto, app: get('application') || APP_BY_PORT[port] };
      const cfg = { rules: fw.rules, services: fw.running.services, addresses: fw.running.addresses };
      const hit = matchFlow(cfg, flow);
      if (hit.builtin) return OK([`"${hit.name}; index: ${fw.rules.length + 1}" {`, `        action ${hit.action};`, '}']);
      return OK(runningBlock(hit, fw.rules.indexOf(hit)).filter(Boolean));
    }
    return ERR('Unknown command: ' + c);
  }

  // configuration mode
  const cfg = fw.candidate;
  if (c === 'exit' || c === 'quit') { fw.mode = 'op'; return OK(['Exiting configuration mode']); }
  if (c === 'commit') {
    const r = api.startCommit();
    if (!r.ok) return { lines: ['Validation Error:', ...r.errs, 'Commit failed'], error: true };
    return OK([`Commit job ${r.id} is in progress. Use 'show jobs id ${r.id}' to check the status.`]);
  }
  if (c === 'revert') { fw.candidate = clone(fw.running); fw.dirty = false; return OK(['Candidate configuration reverted to the running configuration.']); }
  if (c === 'save') return OK(['Config saved to ' + (toks[3] || 'running-config.xml')]);
  if (c === 'show') {
    if (/^show rulebase/.test(line) || line === 'show') return OK(candidateBlock(cfg.rules));
    if (line === 'show mgt-config users') return OK(['users {', '  admin {', '    permissions { role-based { superuser yes; } }', '    phash *;', '  }', '}']);
    return ERR('Invalid syntax.');
  }
  if (c === 'run') return panosLine({ ...fw, mode: 'op' }, toks.slice(1).join(' '), api);
  if (c === 'set') {
    fw.dirty = true;
    if (toks[1] === 'rulebase' && toks[2] === 'security' && toks[3] === 'rules' && toks[4]) {
      const r = setRule(fw, toks[4], toks.slice(5));
      return r.error ? ERR(r.error) : OK();
    }
    if (toks[1] === 'service' && toks[2] && toks[3] === 'protocol' && toks[5] === 'port' && toks[6]) {
      cfg.services[toks[2]] = { proto: toks[4], ports: toks[6].split(',').map(Number) };
      return OK();
    }
    if (toks[1] === 'address' && toks[2] && toks[3] === 'ip-netmask' && toks[4]) { cfg.addresses[toks[2].toLowerCase()] = toks[4]; return OK(); }
    if (toks[1] === 'mgt-config' && toks[2] === 'users' && toks[3] === 'admin' && toks[4] === 'password') return { lines: ['Enter password   :'], pending: { kind: 'panpw', first: null } };
    return ERR('Invalid syntax.');
  }
  if (c === 'delete') {
    if (toks[1] === 'rulebase' && toks[2] === 'security' && toks[3] === 'rules' && toks[4]) {
      const before = cfg.rules.length;
      cfg.rules = cfg.rules.filter((r) => r.name !== toks[4]);
      if (before === cfg.rules.length) return ERR('No such node');
      fw.dirty = true;
      return OK();
    }
    return ERR('Invalid syntax.');
  }
  if (c === 'move' && toks[1] === 'rulebase' && toks[3] === 'rules') {
    const r = moveRule(cfg.rules, toks[4], toks.slice(5));
    if (r.error) return ERR(r.error);
    fw.dirty = true;
    return OK();
  }
  if (c === 'rename' && toks[1] === 'rulebase' && toks[3] === 'rules' && toks[5] === 'to' && toks[6]) {
    const r = cfg.rules.find((x) => x.name === toks[4]);
    if (!r) return ERR('No such node');
    r.name = toks[6];
    fw.dirty = true;
    return OK();
  }
  return ERR('Unknown command: ' + c);
}
