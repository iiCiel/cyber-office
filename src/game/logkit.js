// Shared tools for building each day's logs: a seeded PRNG (so logs are identical on every run),
// timestamps, real-format events (Windows Security, Sysmon, CloudTrail, Okta, Entra, Purview...), and the final
// "what the SIEM shows" step. The formats live in winevents.js and cloudfmt.js; siemfmt.js prints and indexes them.
import { WIN_EVENTS, EVENT_LABEL as WIN_LABELS, summary as winSummary, SYSMON_TASKS } from './winevents.js';
import { cloudtrail, guardduty, okta as oktaRecord, entraSignIn, entraAudit, ual as ualRecord, AADSTS, fakeId } from './cloudfmt.js';
import { enrichEvents } from './siemfmt.js';

export const T = (h, m, s = 0) => h * 3600 + m * 60 + s;

export const hms = (sec) =>
  [Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), sec % 60].map((n) => String(n).padStart(2, '0')).join(':');

// Small seeded PRNG (mulberry32).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const EVENT_LABEL = WIN_LABELS;

const awsLabel = (id) => `${id.type}:${id.type === 'AssumedRole' ? `${id.role || id.name}/${id.session}` : id.name}`;

/**
 * A log builder. Every event gets an id in creation order, so ids stay stable no matter which
 * optional (consequence) events get added at the end.
 *
 * Besides add(), the builder has one method per kind of real log:
 *   win(t, host, code, params, extra)  any Windows event in src/game/winevents.js (4624, 4769, 4662, 7045, ...)
 *   sysmon(t, host, id, data, extra)   Sysmon, printed as XmlWinEventLog
 *   aws / guardduty                    CloudTrail records and GuardDuty findings
 *   okta / signin / audit / ual        Okta System Log, Entra ID sign-in and audit logs, Microsoft 365 audit
 *   record(t, host, source, msg, fn)   any other JSON: fn(stamps) returns the record
 * Each also accepts `extra` (key, attack, noise, user, ip...), exactly like add().
 */
export function logBuilder(seed) {
  const r = rng(seed);
  const ev = [];
  let logonSeq = 0x3e7a00;
  const add = (t, host, source, msg, extra = {}) => {
    ev.push({ id: `E${ev.length}`, t, host, source, msg, ...extra });
    return ev[ev.length - 1];
  };
  const logonId = () => `0x${(logonSeq += 0x1f + Math.floor(r() * 0x40)).toString(16).toUpperCase()}`;
  const win = (t, host, code, p = {}, extra = {}) => {
    const spec = WIN_EVENTS[code];
    const source = spec.log === 'System' ? 'WinSystem' : spec.log && spec.log !== 'Security' ? 'PowerShell' : 'Security';
    return add(t, host, source, winSummary(code, { host, ...p }), { win: { code, params: { host, ...p } }, user: p.user, ip: p.ip, ...extra });
  };
  return {
    r,
    ev,
    add,
    pick: (a) => a[Math.floor(r() * a.length)],
    logonId,
    win,
    fail(t, user, ip, ws, extra = {}) {
      const port = 49152 + Math.floor(r() * 16000);
      win(t, 'dc01', 4625, { user, ip, ws, port, type: 3 }, extra);
      return port;
    },
    ok(t, user, ip, ws, type, extra = {}) {
      return win(t, 'dc01', 4624, { user, ip, ws, type, logonId: logonId() }, extra);
    },
    logoff(t, user, type = 3, extra = {}) {
      return win(t, 'dc01', 4634, { user, type }, extra);
    },
    proc(t, host, user, exe, cmd, parent, extra = {}) {
      return win(t, host, 4688, { user, proc: exe, parent, cmd, logonId: logonId() }, extra);
    },
    sysmon(t, host, id, data, extra = {}) {
      const label = (SYSMON_TASKS[id] || '').split(' (')[0];
      const text = typeof data === 'function' ? '' : data.filter(([k]) => ['Image', 'CommandLine', 'TargetFilename', 'DestinationIp', 'SourceImage', 'TargetImage', 'TargetObject'].includes(k)).map(([k, v]) => `${k}="${v}"`).join(' ');
      return add(t, host, 'Sysmon', `Sysmon EventID=${id} ${label}${text ? ` ${text}` : ''}`, { sysmon: { id, data }, ...extra });
    },
    aws(t, o, extra = {}) {
      const msg = `eventName=${o.name} userIdentity=${awsLabel(o.id)} sourceIPAddress=${o.ip || '203.0.113.10'}${o.error ? ` errorCode=${o.error}` : ''}${o.bucket ? ` bucket=${o.bucket}` : ''}${o.msgExtra ? ` ${o.msgExtra}` : ''}`;
      return add(t, o.host || 'cloudtrail', 'cloudtrail', msg, { make: (st) => cloudtrail({ utc: st.iso, ...o }), user: o.id.name, ip: o.ip, ...extra });
    },
    guardduty(t, o, extra = {}) {
      return add(t, 'guardduty', 'guardduty', `GuardDuty finding type=${o.type} severity=${o.severity ?? 5}${o.msgExtra ? ` ${o.msgExtra}` : ''}`, { make: (st) => guardduty({ utc: st.iso, ...o }), ...extra });
    },
    okta(t, o, extra = {}) {
      const target = o.targets?.[0] ? ` target=${o.targets[0].alternateId || o.targets[0].displayName}` : '';
      const msg = `eventType=${o.eventType} outcome=${o.result || 'SUCCESS'} actor=${o.actor} client_ip=${o.ip}${target}${o.displayMessage ? ` displayMessage="${o.displayMessage}"` : ''}`;
      return add(t, o.host || 'okta-prod', 'okta', msg, { make: (st) => oktaRecord({ utc: st.iso, ...o }), user: o.actor.split('@')[0], ip: o.ip, ...extra });
    },
    signin(t, o, extra = {}) {
      const code = o.errorCode ?? 0;
      const msg = `SigninLogs user=${o.upn} app="${o.app || 'Office 365 Exchange Online'}" ip=${o.ip} result=${code === 0 ? 'Success' : 'Failure'} errorCode=${code}${code ? ` reason="${(AADSTS[code] || '').slice(0, 60)}"` : ''} client="${o.client || 'Browser'}"${o.msgExtra ? ` ${o.msgExtra}` : ''}`;
      return add(t, 'entra-id', 'entra-signin', msg, { make: (st) => entraSignIn({ utc: st.iso, ...o }), user: o.upn.split('@')[0], ip: o.ip, ...extra });
    },
    audit(t, o, extra = {}) {
      const by = o.by.app ? `app:${o.by.app}` : o.by.upn;
      const msg = `AuditLogs category=${o.category || 'UserManagement'} activity="${o.activity}" initiatedBy=${by}${o.by.ip ? ` ip=${o.by.ip}` : ''}${o.targets?.length ? ` target="${o.targets.map((x) => x.name || x.upn).join(', ')}"` : ''} result=${o.result || 'success'}${o.msgExtra ? ` ${o.msgExtra}` : ''}`;
      return add(t, 'entra-id', 'azure-audit', msg, { make: (st) => entraAudit({ utc: st.iso, ...o }), user: (o.by.upn || o.by.app || '').split('@')[0], ip: o.by.ip, ...extra });
    },
    ual(t, o, extra = {}) {
      const msg = `Operation=${o.op} UserId=${o.user} ClientIP=${o.ip}${o.objectId ? ` ObjectId=${o.objectId}` : ''}${o.msgExtra ? ` ${o.msgExtra}` : ''}`;
      return add(t, 'm365', o.source || 'm365-audit', msg, { make: (st) => ualRecord({ utc: st.iso, ...o }), user: o.user.split('@')[0], ip: o.ip, ...extra });
    },
    record(t, host, source, msg, make, extra = {}) {
      return add(t, host, source, msg, { make, ...extra });
    },
    /** Sysmon 1, process created. o = { user, image, cmd, parent, parentCmd, cwd, integrity, original, product, company, description } */
    sysmon1(t, host, o, extra = {}) {
      const name = o.image.split('\\').pop();
      return this.sysmon(t, host, 1, (st) => [
        ['RuleName', o.rule || '-'], ['UtcTime', sysUtc(st, t)], ['ProcessGuid', pguid(host, t, name)], ['ProcessId', o.pid ?? 1000 + (hashN(`${host}${t}${name}`) % 8000)],
        ['Image', o.image], ['FileVersion', o.fileVersion || '10.0.19041.1 (WinBuild.160101.0800)'], ['Description', o.description || name], ['Product', o.product || 'Microsoft® Windows® Operating System'],
        ['Company', o.company || 'Microsoft Corporation'], ['OriginalFileName', o.original || name], ['CommandLine', o.cmd ?? o.image], ['CurrentDirectory', o.cwd || 'C:\\Windows\\system32\\'],
        ['User', o.user], ['LogonGuid', pguid(host, 0, o.user)], ['LogonId', o.logonId || '0x2D41F7'], ['TerminalSessionId', o.session ?? 1], ['IntegrityLevel', o.integrity || 'Medium'],
        ['Hashes', `MD5=${fakeId(`m${o.image}`, 32, '0123456789ABCDEF')},SHA256=${fakeId(`s${o.image}`, 64, '0123456789ABCDEF')},IMPHASH=${fakeId(`i${o.image}`, 32, '0123456789ABCDEF')}`],
        ['ParentProcessGuid', pguid(host, t - 30, o.parent)], ['ParentProcessId', o.ppid ?? 900 + (hashN(`${host}${o.parent}`) % 6000)], ['ParentImage', o.parent], ['ParentCommandLine', o.parentCmd || o.parent], ['ParentUser', o.parentUser || o.user],
      ], { user: o.user.split('\\').pop(), ...extra });
    },
    /** Sysmon 3, network connection. o = { user, image, srcIp, srcPort, dstIp, dstPort, dstHost, proto } */
    sysmon3(t, host, o, extra = {}) {
      const name = o.image.split('\\').pop();
      return this.sysmon(t, host, 3, (st) => [
        ['RuleName', o.rule || 'technique_id=T1021,technique_name=Remote Services'], ['UtcTime', sysUtc(st, t)], ['ProcessGuid', pguid(host, t - 5, name)], ['ProcessId', o.pid ?? 1000 + (hashN(`${host}${name}`) % 8000)],
        ['Image', o.image], ['User', o.user], ['Protocol', o.proto || 'tcp'], ['Initiated', 'true'], ['SourceIsIpv6', 'false'], ['SourceIp', o.srcIp], ['SourceHostname', o.srcHost || `${host}.${'local'}`], ['SourcePort', o.srcPort ?? 49152 + (hashN(`${t}${host}`) % 16000)], ['SourcePortName', '-'],
        ['DestinationIsIpv6', 'false'], ['DestinationIp', o.dstIp], ['DestinationHostname', o.dstHost || '-'], ['DestinationPort', o.dstPort], ['DestinationPortName', o.dstPortName || '-'],
      ], { ip: o.dstIp, user: o.user.split('\\').pop(), ...extra });
    },
    /** Sysmon 10, process access (LSASS reads). o = { sourceImage, targetImage, access: '0x1010', sourceUser, targetUser, trace } */
    sysmon10(t, host, o, extra = {}) {
      return this.sysmon(t, host, 10, (st) => [
        ['RuleName', o.rule || 'technique_id=T1003,technique_name=OS Credential Dumping'], ['UtcTime', sysUtc(st, t)], ['SourceProcessGUID', pguid(host, t - 9, o.sourceImage)], ['SourceProcessId', o.spid ?? 4000 + (hashN(`${host}${t}`) % 5000)], ['SourceThreadId', 5120],
        ['SourceImage', o.sourceImage], ['TargetProcessGUID', pguid(host, 1, o.targetImage)], ['TargetProcessId', o.tpid ?? 712], ['TargetImage', o.targetImage || 'C:\\Windows\\system32\\lsass.exe'], ['GrantedAccess', o.access || '0x1010'],
        ['CallTrace', o.trace || 'C:\\Windows\\SYSTEM32\\ntdll.dll+9d4c4|C:\\Windows\\System32\\KERNELBASE.dll+2b7a3|UNKNOWN(00007FF8A1B2C4D1)'], ['SourceUser', o.sourceUser], ['TargetUser', o.targetUser || 'NT AUTHORITY\\SYSTEM'],
      ], extra);
    },
    /** Sysmon 11, file created. o = { user, image, file } */
    sysmon11(t, host, o, extra = {}) {
      return this.sysmon(t, host, 11, (st) => [
        ['RuleName', o.rule || '-'], ['UtcTime', sysUtc(st, t)], ['ProcessGuid', pguid(host, t - 4, o.image)], ['ProcessId', o.pid ?? 1000 + (hashN(`${host}${o.image}`) % 8000)], ['Image', o.image], ['TargetFilename', o.file], ['CreationUtcTime', sysUtc(st, t)], ['User', o.user],
      ], extra);
    },
  };
}

const hashN = (s) => [...String(s)].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) >>> 0, 7);
const sysUtc = (st, t) => `${st.iso.slice(0, 10)} ${st.iso.slice(11, 19)}.${String(100 + (hashN(`${st.iso}${t}`) % 899))}`;
const pguid = (host, t, name) => {
  const h = fakeId(`pg${host}${t}${name}`, 32, '0123456789abcdef');
  return `{${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}}`;
};

/** Filter to "now", sort, and add the display fields the SIEM uses (line = full, short = compact). */
export function finishLogs(ev, { nowMinutes, date }) {
  const nowSec = nowMinutes * 60;
  const sorted = ev.filter((e) => e.t <= nowSec).sort((a, b) => a.t - b.t); // stable: same-second events keep creation order
  return display(enrichEvents(sorted, date), (e) => `${date.month} ${date.day} ${hms(e.t)}`);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/**
 * Multi-day cases: event times are absolute seconds (day * 86400 + time of day, day 0 = date). Every line carries its
 * own date and `t` becomes the time of day, which is what the SIEM shows.
 */
export function finishDays(ev, { nowMinutes, date }) {
  const DAY = 86400;
  const nowSec = nowMinutes * 60;
  const mon = MONTHS.indexOf(date.month);
  const dated = ev
    .filter((e) => e.t <= nowSec)
    .sort((a, b) => a.t - b.t)
    .map((e) => {
      const day = Math.floor(e.t / DAY);
      const d = new Date(Date.UTC(date.year || 2026, mon, date.day + day));
      return { ...e, abs: e.t, t: e.t - day * DAY, dateObj: { ...date, month: MONTHS[d.getUTCMonth()], day: d.getUTCDate(), year: d.getUTCFullYear() } };
    });
  return display(enrichEvents(dated, date), (e) => `${e.dateObj.month} ${e.dateObj.day} ${hms(e.t)}`);
}

function display(events, stampOf) {
  return events.map((e) => {
    const time = stampOf(e);
    return {
      ...e,
      abs: e.abs ?? e.t,
      time,
      line: `${time} ${e.host} ${e.source === 'Security' ? 'Microsoft-Windows-Security-Auditing: ' : ''}${e.msg}`,
      short: e.source === 'Security' ? e.msg.replace(/^EventID=(\d+) (.+?)\. (.*)$/, (_, id, _s, rest) => `${id} ${EVENT_LABEL[id] || ''}  ${rest}`) : e.msg,
    };
  });
}

// Who works here, and where. Used by every day's background noise.
export const STAFF = {
  'priya.r': ['WS-0107', '10.0.4.17'],
  'j.alvarez': ['WS-0112', '10.0.4.33'],
  'dana.k': ['WS-0120', '10.0.4.40'],
  'c.reyes': ['WS-0124', '10.0.4.44'],
  't.okoye': ['WS-0127', '10.0.4.47'],
  'm.chen': ['WS-0131', '10.0.4.51'],
  's.okafor': ['WS-0138', '10.0.4.62'],
  analyst01: ['WS-0142', '10.0.4.142'],
};

/** Ordinary office noise for a day: arrivals, file share reads, inbound mail, SSH scanners. */
export function backgroundNoise(b, { arrivals, skip = [] }) {
  const { r, add, ok } = b;
  for (const [user, at] of arrivals) {
    if (skip.includes(user)) continue;
    const [ws, ip] = STAFF[user];
    ok(at, user, ip, ws, 2);
    add(at + 40 + Math.floor(r() * 60), 'file01', 'smbd_audit', `${user}|${ip}|pread|ok|Shared/${b.pick(['Claims/2026/Q4_summary.xlsx', 'Sales/pipeline.xlsx', 'IT/inventory.csv', 'Finance/AP/aging_report.xlsx'])}`, { user, ip });
  }
  // Kerberos traffic on the domain controller for the same people (so Get-WinEvent and the SIEM have an AD haystack)
  adNoise(b, { users: arrivals.filter(([u]) => !skip.includes(u)).map(([u, at]) => [u, STAFF[u][0], STAFF[u][1], at]), end: T(10, 30), nas: false });
  for (let tt = T(5, 50); tt < T(11, 0); tt += 400 + Math.floor(r() * 900)) {
    add(tt, 'mail01', 'postfix', `postfix/smtpd[${800 + Math.floor(r() * 200)}]: connect from mail-sor-f${40 + Math.floor(r() * 30)}.google.com[209.85.220.${30 + Math.floor(r() * 40)}]`);
  }
  const junk = ['admin', 'root', 'test', 'oracle', 'ubuntu', 'postgres', 'git', 'user', 'pi', 'ftpuser'];
  for (let t = T(1, 3); t < T(11, 0); t += 400 + Math.floor(r() * 1800)) {
    const ip = r() < 0.6 ? '45.95.147.236' : '193.32.162.157';
    add(t, 'web01', 'sshd', `sshd[${3000 + Math.floor(r() * 3000)}]: Failed password for invalid user ${b.pick(junk)} from ${ip} port ${30000 + Math.floor(r() * 30000)} ssh2`, { ip, noise: true });
  }
}

// IPs everyone has seen before. Days add their own.
export const COMMON_IPS = {
  '45.95.147.236': { where: 'Netherlands', owner: 'AS49870 Alsycon B.V.', note: 'Mass internet scanner. Tries common usernames on every server it finds.', external: true },
  '193.32.162.157': { where: 'Romania', owner: 'AS47890 Unmanaged Ltd', note: 'Mass internet scanner.', external: true },
};

export function ipLookup(ip, dayIps = {}) {
  if (dayIps[ip]) return dayIps[ip];
  if (COMMON_IPS[ip]) return COMMON_IPS[ip];
  if (/^10\.|^172\.16\./.test(ip)) return { where: 'Internal', owner: 'Halcyon Mutual network', note: 'One of our own addresses (10.x office, 172.16.x VPN users).', external: false };
  return { where: 'Unknown', owner: 'Unknown', note: 'No information.', external: true };
}

/** PowerShell -EncodedCommand: base64 of the UTF-16LE text, exactly what attackers paste after `powershell -enc`. */
export function psEnc(text) {
  let bin = '';
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    bin += String.fromCharCode(c & 255, c >> 8);
  }
  return btoa(bin);
}

/**
 * Ordinary Active Directory traffic on a domain controller, so attacks have a haystack to hide in:
 * every user gets a TGT (4768) at arrival and a few dozen service tickets (4769, AES) over the workday, occasional
 * NTLM validations (4776), and workstations renew their machine accounts. `base` shifts the whole thing to another day
 * (seconds, in the case's absolute time). No failures, no RC4 except one old NAS that has always used it (a decoy).
 * @param {{ users: Array<[string,string,string,number]>, dc?: string, base?: number, end?: number, services?: string[], nas?: boolean }} o
 *        users = [sam, workstation, ip, arrival seconds]
 */
export function adNoise(b, { users, dc = 'dc01', base = 0, end = T(17, 30), services = ['FILE01$', 'DC01$', 'MAIL01$', 'CLAIMS-DB01$', 'WEB01$'], nas = true }) {
  const { r, win } = b;
  for (const [sam, ws, ip, arrive] of users) {
    const at = base + arrive;
    const user = sam;
    win(at, dc, 4768, { user, ip, enc: '0x12', port: 49700 + Math.floor(r() * 9000) }, { user, ip, noise: true });
    win(at + 1, dc, 4769, { user, service: 'krbtgt', ip, enc: '0x12', port: 49700 + Math.floor(r() * 9000) }, { user, ip, noise: true });
    const n = 10 + Math.floor(r() * 14);
    const span = Math.max(900, base + end - at - 600);
    for (let i = 0; i < n; i++) {
      win(at + 30 + Math.floor(r() * span), dc, 4769, { user, service: b.pick(services), ip, enc: '0x12', port: 49700 + Math.floor(r() * 9000) }, { user, ip, noise: true });
    }
    if (r() < 0.3) win(at + 600 + Math.floor(r() * span), dc, 4776, { user, ws }, { user, ip, noise: true });
    win(at - 120, dc, 4768, { user: `${ws.toUpperCase()}$`, ip, enc: '0x12' }, { user: `${ws}$`, ip, noise: true });
  }
  if (nas) {
    for (let t = base + T(8, 5); t < base + end; t += 3600) {
      win(t, dc, 4769, { user: 'NAS01$', service: 'NAS01$', ip: '10.0.3.77', enc: '0x17', port: 40000 + Math.floor(r() * 9000) }, { user: 'NAS01$', ip: '10.0.3.77', noise: true, key: t === base + T(8, 5) ? 'decoy-rc4-machine' : undefined });
    }
  }
}
