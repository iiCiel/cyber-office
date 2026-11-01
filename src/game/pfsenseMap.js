// Pure helpers behind the pfSense web GUI (src/ui/ccdc/PfSenseApp.js). No DOM here so node:test can reach it.
// The GUI never touches firewall state: every change is turned into the rule-editor command that
// ccdcFirewall.applyFirewallCommand understands, and the caller runs that line through runLine().

export const PF_VERSION = '2.7.2-RELEASE';

// Protocol choices as the pfSense rule form shows them, mapped to the rule-editor protocol word.
export const PROTO_CHOICES = [
  { label: 'TCP', value: 'tcp', proto: 'tcp', ports: true },
  { label: 'UDP', value: 'udp', proto: 'udp', ports: true },
  { label: 'TCP/UDP', value: 'tcp/udp', proto: 'any', ports: true },
  { label: 'ICMP', value: 'icmp', proto: 'icmp', ports: false },
  { label: 'Any', value: 'any', proto: 'any', ports: false },
];

const NAME_RE = /^[A-Za-z0-9_.\/-]+$/;

/** "From" + "To" boxes of Destination Port Range -> 'any' | '443' | '8000-8100' | null (invalid). */
export function portRange(from, to) {
  const f = String(from ?? '').trim().toLowerCase();
  const t = String(to ?? '').trim().toLowerCase();
  const ok = (v) => /^\d+$/.test(v) && +v >= 1 && +v <= 65535;
  if ((!f || f === 'any') && (!t || t === 'any')) return 'any';
  if (f && ok(f) && (!t || t === f)) return String(+f);
  if (!f && ok(t)) return String(+t);
  if (ok(f) && ok(t) && +t > +f) return `${+f}-${+t}`;
  return null;
}

/**
 * Rule edit form -> rule-editor command.
 * form: { action:'pass'|'block', proto:<PROTO_CHOICES.value>, source:'any'|'single', sourceValue, dest:<alias|'any'>,
 *         portFrom, portTo }
 * Returns { ok:true, command } or { ok:false, errors:[...] }.
 */
export function buildRuleCommand(form) {
  const errors = [];
  const action = form.action === 'block' ? 'block' : form.action === 'pass' ? 'pass' : null;
  if (!action) errors.push('Action must be Pass or Block.');
  const pc = PROTO_CHOICES.find((p) => p.value === form.proto);
  if (!pc) errors.push('Choose a protocol.');
  const port = portRange(form.portFrom, form.portTo);
  if (port === null) errors.push('The destination port range is not valid (use 1-65535, "To" greater than "From").');
  if (pc && !pc.ports && port && port !== 'any') errors.push(`Ports can only be set for TCP, UDP or TCP/UDP, not ${pc.label}.`);
  let from = 'any';
  if (form.source === 'single') {
    from = String(form.sourceValue || '').trim();
    if (!from) errors.push('Enter a source host or alias.');
    else if (!NAME_RE.test(from)) errors.push('The source contains characters that are not allowed.');
  }
  const dst = String(form.dest || '').trim();
  if (!dst) errors.push('Choose a destination.');
  else if (!NAME_RE.test(dst)) errors.push('The destination contains characters that are not allowed.');
  if (errors.length) return { ok: false, errors };
  let command = `${action} ${pc.proto} to ${dst} port ${port}`;
  if (from !== 'any') command += ` from ${from}`;
  return { ok: true, command };
}

export const deleteCommand = (n) => `del ${n}`;
/** Several selected rows -> del commands, highest number first so earlier indexes stay valid. */
export function deleteCommands(numbers) {
  return [...new Set(numbers)].sort((a, b) => b - a).map(deleteCommand);
}
export const defaultCommand = (policy) => (policy === 'block' ? 'default block' : 'default pass');

const PROTO_NAME = { tcp: 'TCP', udp: 'UDP', any: '*', icmp: 'ICMP' };

/** A rule -> the cells of one row of the Firewall > Rules table. idx is 0-based. */
export function ruleCells(rule, idx, clock = 0, scoringIp = '198.51.100.9') {
  const pass = rule.action === 'pass';
  const from = !rule.from || rule.from === 'any' ? '*' : rule.from;
  const dst = rule.dst === 'any' ? '*' : rule.dst;
  const port = rule.port === 'any' ? '*' : String(rule.port);
  const protoWord = rule.proto === 'any' ? 'any protocol' : PROTO_NAME[rule.proto] || rule.proto;
  return {
    n: idx + 1,
    pass,
    states: statesText(rule, idx, clock),
    proto: `IPv4 ${PROTO_NAME[rule.proto] || rule.proto}`,
    source: from,
    sourceTitle: from === 'scoring' ? `scoring (${scoringIp})` : '',
    srcPort: '*',
    dest: dst,
    destPort: port,
    gateway: '*',
    queue: 'none',
    schedule: '',
    descr: ruleDescription(rule, protoWord),
  };
}

export function ruleDescription(rule, protoWord) {
  const w = protoWord || (rule.proto === 'any' ? 'any protocol' : String(rule.proto).toUpperCase());
  const verb = rule.action === 'pass' ? 'Allow' : 'Block';
  const to = rule.dst === 'any' ? 'any host' : rule.dst;
  const p = rule.port === 'any' ? '' : ` port ${rule.port}`;
  const f = rule.from && rule.from !== 'any' ? ` from ${rule.from}` : '';
  return `${verb} ${w}${p} to ${to}${f}`;
}

// Deterministic counters so the States column looks alive without being random.
function statesText(rule, idx, clock) {
  if (rule.action !== 'pass') return '0 /  0 B';
  const widthy = rule.dst === 'any' ? 3 : 1;
  const n = Math.floor(clock / (3 + idx)) * widthy;
  const bytes = n * 1280 + idx * 4096;
  return `${n} / ${fmtBytes(bytes)}`;
}
export function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(2)} KiB`;
  return `${(b / 1048576).toFixed(2)} MiB`;
}

/** The final, implicit row under the WAN rules. */
export function policyRow(fw) {
  if (fw.default === 'block') {
    return { pass: false, label: 'Default deny rule IPv4 (block)', note: 'Anything not allowed above is dropped (the pfSense default on WAN).', toggleTo: 'pass', toggleLabel: 'Set default to pass' };
  }
  return { pass: true, label: 'Default allow rule IPv4 (pass any)', note: 'Nothing above matched, so the packet is PASSED. Click "Set default to block" to get the normal pfSense implicit deny.', toggleTo: 'block', toggleLabel: 'Set default to block' };
}

/** Host aliases for Firewall > Aliases, built from the scenario's scored services plus the scoring engine. */
export function hostAliases(scenario, scoringIp = '198.51.100.9') {
  const seen = new Map();
  for (const s of scenario?.services || []) {
    if (!s.host || seen.has(s.host)) continue;
    seen.set(s.host, { name: s.host, type: 'Host(s)', values: s.ip || '', descr: `${s.name || s.host} (${(s.ports || []).join(', ')})` });
  }
  const rows = [...seen.values()];
  rows.push({ name: 'scoring', type: 'Host(s)', values: scoringIp, descr: 'CCDC scoring engine' });
  return rows;
}

export function scoringIpOf(state) {
  const f = (state?.findingList || []).find((x) => x.fw?.scoringIp);
  return f?.fw?.scoringIp || '198.51.100.9';
}

// --- evaluation for the log view (does NOT grade anything) -------------------------------------------------

function portIn(rulePort, p) {
  if (rulePort === 'any') return true;
  const m = String(rulePort).match(/^(\d+)-(\d+)$/);
  if (m) return p >= +m[1] && p <= +m[2];
  return String(rulePort) === String(p);
}
/** First-match verdict for one packet. Returns { pass, ruleIdx } (ruleIdx -1 = default policy). */
export function verdictFor(fw, pkt) {
  for (let i = 0; i < fw.rules.length; i++) {
    const r = fw.rules[i];
    const protoOk = r.proto === 'any' || pkt.proto === r.proto;
    const dstOk = r.dst === 'any' || r.dst === pkt.dstName || r.dst === pkt.dstIp;
    const from = !r.from || r.from === 'any' || r.from === '0.0.0.0/0' ? 'any' : r.from;
    const fromOk = from === 'any' || from === pkt.srcAlias || from === pkt.srcIp;
    if (protoOk && dstOk && portIn(r.port, pkt.dport) && fromOk) return { pass: r.action === 'pass', ruleIdx: i };
  }
  return { pass: fw.default === 'pass', ruleIdx: -1 };
}

function hash(n) {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d2f4b1) >>> 0;
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0;
  return (x ^ (x >>> 13)) >>> 0;
}

const SCANNERS = ['45.155.205.233', '185.224.128.17', '193.32.162.71', '92.63.197.9', '80.82.77.139', '141.98.11.40', '162.142.125.52', '194.26.135.88'];
const SCAN_PORTS = [22, 23, 445, 1433, 3389, 3306, 5900, 8080, 21, 5060, 139, 6379];
const CLIENT_IPS = ['198.51.100.44', '192.0.2.77', '198.51.100.130', '192.0.2.201'];

export function clockToHms(sec) {
  const t = 9 * 3600 + Math.max(0, Math.floor(sec));
  const p = (v) => String(v).padStart(2, '0');
  return `${p(Math.floor(t / 3600) % 24)}:${p(Math.floor(t / 60) % 60)}:${p(t % 60)}`;
}

/**
 * Plausible filterlog entries for the last `count` events up to `clock` seconds. Same inputs, same output.
 * hosts: [{name, ip, ports:[..], proto}] scored services. Newest first.
 */
export function logEntries({ fw, hosts, clock, count = 50, scoringIp = '198.51.100.9' }) {
  const out = [];
  const list = hosts && hosts.length ? hosts : [{ name: 'web01', ip: '10.10.10.20', ports: [80, 443], proto: 'tcp' }];
  for (let s = Math.floor(clock); s >= 0 && out.length < count; s--) {
    const h = hash(s * 31 + 7);
    if (h % 100 >= 28) continue;
    const h2 = hash(s * 17 + 3);
    let pkt;
    if (h2 % 100 < 48) {
      const dst = list[h2 % list.length];
      pkt = { srcIp: SCANNERS[(h2 >>> 3) % SCANNERS.length], srcAlias: '', dstName: dst.name, dstIp: dst.ip, dport: SCAN_PORTS[(h2 >>> 7) % SCAN_PORTS.length], proto: 'tcp' };
    } else {
      const dst = list[(h2 >>> 4) % list.length];
      const port = dst.ports[(h2 >>> 9) % dst.ports.length];
      const scorer = (h2 >>> 11) % 3 === 0;
      const ip = scorer ? scoringIp : CLIENT_IPS[(h2 >>> 5) % CLIENT_IPS.length];
      pkt = { srcIp: ip, srcAlias: scorer ? 'scoring' : '', dstName: dst.name, dstIp: dst.ip, dport: port, proto: dst.proto === 'udp' ? 'udp' : 'tcp' };
    }
    const v = verdictFor(fw, pkt);
    out.push({
      s,
      time: clockToHms(s),
      pass: v.pass,
      iface: 'WAN',
      rule: v.ruleIdx >= 0 ? `USER_RULE: ${ruleDescription(fw.rules[v.ruleIdx])} (${1770000000 + v.ruleIdx * 7919})` : (fw.default === 'block' ? 'Default deny rule IPv4 (1000000103)' : 'Default allow rule IPv4 (1000000104)'),
      src: `${pkt.srcIp}:${20000 + (h2 % 40000)}`,
      dst: `${pkt.dstIp}:${pkt.dport}`,
      proto: pkt.proto.toUpperCase(),
    });
  }
  return out;
}

/** Text lines of the pfSense SSH console menu (shown after login over SSH). Option 8 opens the shell. */
export const PF_CONSOLE_PROMPT = 'Enter an option: ';
export function pfConsoleBanner(dev) {
  const host = dev?.host || 'edge-fw';
  const wan = dev?.ip || '203.0.113.2';
  const lan = '10.10.10.1';
  return [
    `*** Welcome to pfSense ${PF_VERSION} (amd64) on ${host} ***`,
    '',
    ` WAN (wan)       -> em0        -> v4/DHCP4: ${wan}/24`,
    ` LAN (lan)       -> em1        -> v4: ${lan}/24`,
    '',
    ' 0) Logout (SSH only)                  9) pfTop',
    ' 1) Assign Interfaces                 10) Filter Logs',
    ' 2) Set interface(s) IP address       11) Restart webConfigurator',
    ' 3) Reset webConfigurator password    12) PHP shell + pfSense tools',
    ' 4) Reset to factory defaults         13) Update from console',
    ' 5) Reboot system                     14) Disable Secure Shell (sshd)',
    ' 6) Halt system                       15) Restore recent configuration',
    ' 7) Ping host                         16) Restart PHP-FPM',
    ' 8) Shell',
    '',
  ];
}
