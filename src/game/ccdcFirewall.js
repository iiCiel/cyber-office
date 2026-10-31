// A pfSense-style edge-firewall RULE EDITOR for the CCDC blue-team mode. Not a shell: the player edits an
// ordered WAN rule list with typed commands (the scene can also render the table and offer buttons), exactly
// the decision a real CCDC network seat makes. The lesson is ORDER: allow the scored ports first, THEN set the
// default inbound policy to block — do it the other way round and every scored service drops at once.
//
// Rule shape: { action:'pass'|'block', proto:'tcp'|'udp'|'any', dst:'<host-or-any>', port:'<n|n-n|any>',
//               from:'<host-or-any>' }. Everything is fiction (RFC 5737 / RFC 1918 hosts); nothing is applied.

const HELP = [
  'Edge firewall (pfSense-style) — WAN inbound rule editor. Simulated; nothing is applied.',
  'Commands:',
  '  show                               list the current rules and the default inbound policy',
  '  pass <proto> to <dst> port <p> [from <src>]   allow traffic (e.g. pass tcp to web01 port 80 from any)',
  '  block <proto> to <dst> port <p> [from <src>]  explicitly block traffic',
  '  default pass | default block       set the default inbound policy (block = default-deny)',
  '  del <n>                            delete rule number n',
  '  help',
  'Scored ports: 80/443 web01 · 53 dc01 · 25/143/993 mail01 · 3306 db01 (from the scoring engine only:',
  '  pass tcp to db01 port 3306 from scoring   — the scoring engine is 198.51.100.9).',
  'Each pass rule must name one scored host and only its scored ports. "to any", "port any" or a wide range',
  'like 1-65535 is still wide open.',
  'Win order: add the pass rules for the scored ports FIRST, then "del" the any-any rule and "default block".',
];

export function firewallHelp() { return HELP; }

const num = (p) => (p === 'any' ? 'any' : String(p));

function fmtRule(r, i) {
  const from = r.from && r.from !== 'any' ? ` from ${r.from}` : ' from any';
  return `${String(i + 1).padStart(2)}  ${r.action.toUpperCase().padEnd(5)} ${r.proto.padEnd(3)}  -> ${String(r.dst).padEnd(7)} port ${num(r.port)}${from}`;
}

export function showFirewall(fw) {
  const lines = ['WAN inbound rules (evaluated top-down):'];
  if (!fw.rules.length) lines.push('  (no rules)');
  else fw.rules.forEach((r, i) => lines.push(fmtRule(r, i)));
  lines.push(`Default inbound policy: ${fw.default.toUpperCase()}${fw.default === 'block' ? '  (default-deny)' : '  (default-allow — everything not blocked is permitted)'}`);
  return lines;
}

const PROTOS = new Set(['tcp', 'udp', 'any', 'icmp']);

/** Parse and apply one rule-editor command. Mutates `fw`. Returns { lines:[], error? }. */
export function applyFirewallCommand(fw, rawLine) {
  const line = String(rawLine || '').trim();
  const t = line.split(/\s+/);
  const cmd = (t[0] || '').toLowerCase();

  if (cmd === 'show' || cmd === 'ls' || cmd === 'status') return { lines: showFirewall(fw) };

  if (cmd === 'default') {
    const pol = (t[1] || '').toLowerCase();
    if (pol !== 'pass' && pol !== 'block') return { error: true, lines: ['usage: default pass | default block'] };
    fw.default = pol;
    return { lines: [`Default inbound policy set to ${pol.toUpperCase()}.`, ...showFirewall(fw)] };
  }

  if (cmd === 'del' || cmd === 'delete' || cmd === 'rm') {
    const n = parseInt(t[1], 10);
    if (!n || n < 1 || n > fw.rules.length) return { error: true, lines: [`usage: del <1-${fw.rules.length}>`] };
    const [removed] = fw.rules.splice(n - 1, 1);
    return { lines: [`Deleted rule ${n}: ${fmtRule(removed, 0).trim()}`, ...showFirewall(fw)] };
  }

  if (cmd === 'pass' || cmd === 'block' || cmd === 'allow' || cmd === 'permit' || cmd === 'deny') {
    const action = cmd === 'pass' || cmd === 'allow' || cmd === 'permit' ? 'pass' : 'block';
    const proto = PROTOS.has((t[1] || '').toLowerCase()) ? t[1].toLowerCase() : 'tcp';
    const toI = t.indexOf('to');
    const portI = t.findIndex((x) => x.toLowerCase() === 'port');
    const fromI = t.indexOf('from');
    const dst = toI >= 0 ? t[toI + 1] : (t[2] || 'any');
    const port = portI >= 0 ? t[portI + 1] : 'any';
    const from = fromI >= 0 ? t[fromI + 1] : 'any';
    if (!dst) return { error: true, lines: ['usage: pass <proto> to <dst> port <p> [from <src>]'] };
    const rule = { action, proto, dst, port: num(port), from };
    fw.rules.push(rule);
    return { lines: [`Added: ${fmtRule(rule, fw.rules.length - 1).trim()}`, ...showFirewall(fw)] };
  }

  return { error: true, lines: [`${cmd || '(empty)'}: not a rule-editor command. Type "help".`] };
}

// --- evaluation -------------------------------------------------------------

const ALIASES = { scoring: 'scoring', 'scoring-engine': 'scoring', scorer: 'scoring' };
const canonFrom = (f, spec) => {
  const v = String(f || 'any').toLowerCase();
  if (v === 'any' || v === '0.0.0.0/0' || v === '*') return 'any';
  if (ALIASES[v]) return 'scoring';
  if (spec?.scoringIp && v === spec.scoringIp) return 'scoring';
  return v;
};
// Rule dst may be a host name or its IP.
const dstIs = (r, svc) => r.dst === 'any' || r.dst === svc.host || (svc.ip && r.dst === svc.ip);

// Does the rule set allow a given scored service's traffic (from its real source) to reach it? First match wins.
// A service with `src: 'scoring'` is only polled by the scoring engine, so a rule scoped to some other source
// does not carry its traffic.
function allowed(fw, svc, spec) {
  for (const r of fw.rules) {
    const protoOk = r.proto === 'any' || svc.proto === 'any' || r.proto === svc.proto;
    const portOk = portMatch(r.port, svc.ports);
    const from = canonFrom(r.from, spec);
    const fromOk = from === 'any' || (svc.src ? from === svc.src : false);
    if (protoOk && dstIs(r, svc) && portOk && fromOk) return r.action === 'pass';
  }
  return fw.default === 'pass';
}

function portMatch(rulePort, svcPorts) {
  if (rulePort === 'any') return true;
  for (const p of svcPorts) {
    if (String(rulePort) === String(p)) return true;
    const m = String(rulePort).match(/^(\d+)-(\d+)$/);
    if (m && p >= +m[1] && p <= +m[2]) return true;
  }
  return false;
}

// Every port a rule's port field covers (null = any / unbounded).
function rulePorts(rulePort) {
  if (rulePort === 'any') return null;
  const m = String(rulePort).match(/^(\d+)-(\d+)$/);
  if (m) { const a = +m[1], b = +m[2]; if (b - a > 2000) return null; const out = []; for (let p = a; p <= b; p++) out.push(p); return out; }
  return /^\d+$/.test(String(rulePort)) ? [+rulePort] : null;
}

/**
 * Is the WAN still exposed? Returns a reason string, or null when every pass rule is scoped to a scored host and
 * only that host's scored ports, and services that must be source-scoped (MySQL) are.
 */
function exposure(fw, spec) {
  if (fw.default === 'pass') return 'the default inbound policy is still PASS (default-allow)';
  const svcs = spec.services || [];
  for (const r of fw.rules) {
    if (r.action !== 'pass') continue;
    if (r.dst === 'any') return `rule "pass ${r.proto} to any port ${r.port}" still exposes every internal host`;
    const hostSvcs = svcs.filter((s) => dstIs(r, s));
    if (!hostSvcs.length) return `rule passes traffic to ${r.dst}, which runs no scored service`;
    const ports = rulePorts(r.port);
    if (!ports) return `rule "pass ${r.proto} to ${r.dst} port ${r.port}" opens every port on ${r.dst}, not just its scored ones`;
    const allowedPorts = new Set(hostSvcs.flatMap((s) => s.ports));
    const extra = ports.filter((p) => !allowedPorts.has(p));
    if (extra.length) return `rule "pass ${r.proto} to ${r.dst} port ${r.port}" opens ${extra.length} non-scored port(s) on ${r.dst}`;
    for (const s of hostSvcs) {
      if (s.src && portMatch(r.port, s.ports) && canonFrom(r.from, spec) === 'any') {
        return `${s.id} port ${s.ports.join('/')} is open to the whole internet; scope it with "from scoring" (${spec.scoringIp || 'the scoring engine'})`;
      }
    }
  }
  return null;
}

/**
 * Evaluate the firewall finding against the current rules.
 *   fwSpec: { scored:[svcId], scoringIp, services:[{id,host,ip,proto,ports,src?}] } describing the scored traffic
 *   that must survive.
 * Returns { fixed, down:[svcId], note }.
 *   - fixed when the default policy is block, no pass rule leaves anything beyond the scored ports exposed, and
 *     every scored service is still reachable from its real source.
 *   - down lists scored services the current rules would cut off.
 */
export function evalFirewall(fw, fwSpec) {
  const svcById = Object.fromEntries((fwSpec.services || []).map((s) => [s.id, s]));
  const down = [];
  for (const id of fwSpec.scored) {
    const svc = svcById[id];
    if (svc && !allowed(fw, svc, fwSpec)) down.push(id);
  }
  const open = exposure(fw, fwSpec);
  const fixed = fw.default === 'block' && !open && down.length === 0;
  return { fixed, down, open, note: open || 'no allow rule for this scored port' };
}
