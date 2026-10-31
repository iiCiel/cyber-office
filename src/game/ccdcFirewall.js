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
  'Scored ports: 80/443 web01 · 53 dc01 · 25/143/993 mail01 · 3306 db01 (from the scoring engine only).',
  'Win order: add the pass rules for the scored ports FIRST, then "default block".',
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

// Does the rule set allow a given scored service's traffic to reach it? A pass rule matches if proto/port/dst
// line up and nothing blocks it earlier. Default-allow means everything not explicitly blocked gets through.
function allowed(fw, svc) {
  for (const r of fw.rules) {
    const protoOk = r.proto === 'any' || svc.proto === 'any' || r.proto === svc.proto;
    const dstOk = r.dst === 'any' || r.dst === svc.host;
    const portOk = portMatch(r.port, svc.ports);
    if (protoOk && dstOk && portOk) return r.action === 'pass';
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

// Is the WAN still wide open (an any-any pass that leaves everything exposed)?
function wideOpen(fw) {
  if (fw.default === 'pass') return true;
  return fw.rules.some((r) => r.action === 'pass' && r.proto === 'any' && r.dst === 'any' && r.port === 'any' && r.from === 'any');
}

/**
 * Evaluate the firewall finding against the current rules.
 *   fwSpec: { scored:[svcId], services:[{id,host,proto,ports}] } describing the scored traffic that must survive.
 * Returns { fixed, down:[svcId], note }.
 *   - fixed when the default policy is block, no wide-open any-any pass remains, and every scored service is
 *     still allowed through.
 *   - down lists scored services the current rules would cut off (default-block with no matching pass rule).
 */
export function evalFirewall(fw, fwSpec, serviceList) {
  const svcById = Object.fromEntries((fwSpec.services || []).map((s) => [s.id, s]));
  const down = [];
  for (const id of fwSpec.scored) {
    const svc = svcById[id];
    if (svc && !allowed(fw, svc)) down.push(id);
  }
  const open = wideOpen(fw);
  const fixed = fw.default === 'block' && !open && down.length === 0;
  return { fixed, down, note: open ? 'the WAN is still open any-any' : 'no allow rule for this scored port' };
}
