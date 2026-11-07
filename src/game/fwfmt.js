// pfSense firewall log lines ("filterlog"), in the CSV layout pfSense writes to syslog.
// Layout from the Netgate docs (Monitoring > Logs > Raw Filter Log Format), IPv4:
//   rule,subrule,anchor,tracker,interface,reason,action,direction,4,tos,ecn,ttl,id,offset,flags,protoid,proto,length,src,dst,
//   then for tcp: sport,dport,datalen,tcpflags,seq,ack,window,urg,options   for udp: sport,dport,datalen
const hashN = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** o = { rule, iface, act: 'pass'|'block', dir: 'in'|'out', proto: 'tcp'|'udp', src, dst, sport, dport, flags } -> "filterlog[pid]: ..." */
export function filterlog(t, o) {
  const h = hashN(`${t}${o.src}${o.dst}${o.dport}`);
  const tracker = 1000000000 + o.rule * 100 + 3;
  const ttl = o.iface === 'igb0' ? 44 + (h % 200) : 128;
  const ipid = h % 65535;
  const head = [o.rule, '', '', tracker, o.iface, 'match', o.act, o.dir || 'in', 4, '0x0', '', ttl, ipid, 0, o.proto === 'tcp' ? 'DF' : 'none'];
  let tail;
  if (o.proto === 'udp') {
    const len = 28 + (o.len ?? 64);
    tail = [17, 'udp', len, o.src, o.dst, o.sport, o.dport, len - 8];
  } else {
    const flags = o.flags || 'S';
    tail = [6, 'tcp', flags === 'S' ? 60 : 52, o.src, o.dst, o.sport, o.dport, 0, flags, 100000000 + (h % 3900000000), '', o.iface === 'igb0' ? 1024 : 64240, '', flags === 'S' && o.iface !== 'igb0' ? 'mss;sackOK;TS;nop;wscale' : ''];
  }
  return `filterlog[${40000 + (hashN('fw01') % 20000)}]: ${[...head, ...tail].join(',')}`;
}

/** Splunk TA-pfsense style fields from a filterlog line, or null. */
export function filterlogFields(msg) {
  const m = msg.match(/filterlog\[\d+\]: (.*)$/);
  if (!m) return null;
  const f = m[1].split(',');
  if (f[8] !== '4') return null;
  const out = { rule: [f[0]], interface: [f[4]], reason: [f[5]], action: [f[6] === 'pass' ? 'allowed' : 'blocked'], vendor_action: [f[6]], direction: [f[7]], ttl: [f[11]], transport: [f[16]], src_ip: [f[18]], dest_ip: [f[19]] };
  if (f[16] === 'tcp' || f[16] === 'udp') Object.assign(out, { src_port: [f[20]], dest_port: [f[21]] });
  if (f[16] === 'tcp') out.tcp_flags = [f[23]];
  return out;
}

/** Ordinary edge noise: internet scanners hitting the WAN address all day, dropped by the default deny rule (rule 5). */
export function wanScanNoise(add, { count = 180, start = 60, step = 197, wan = '198.51.100.20' } = {}) {
  const SCAN = ['45.95.147.236', '193.32.162.157', '162.142.125.7', '167.94.138.44', '205.210.31.18', '80.82.77.139'];
  const PORTS = [22, 23, 445, 3389, 5900, 8080, 1433, 6379, 9200, 3306];
  for (let i = 0; i < count; i++) {
    const o = { rule: 5, iface: 'igb0', act: 'block', dir: 'in', proto: 'tcp', src: SCAN[(i * 5) % SCAN.length], dst: wan, sport: 40000 + ((i * 2741) % 25000), dport: PORTS[(i * 3) % PORTS.length], flags: 'S' };
    const t = start + i * step + ((i * 7919) % 120);
    add(t, 'fw01', 'pfsense', filterlog(t, o), { ip: o.src });
  }
}
