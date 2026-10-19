// What the SIEM knows about each event beyond the compact one-liner: which index and sourcetype it lives in, the
// raw event exactly as the product wrote it, and the fields Splunk would extract from it.
//
// An event can be described three ways, from richest to simplest:
//   e.win     { code, params }          -> a Windows event (Security / System / PowerShell), printed in Splunk's WinEventLog layout
//   e.sysmon  { id, data }              -> a Sysmon event, printed as XmlWinEventLog
//   e.json    { ...record }             -> a JSON record (CloudTrail, Okta, Entra, Purview, GuardDuty), printed pretty
//   e.raw     'text'                    -> anything already formatted
// Older events only have a compact `msg`; enrich() converts what it can (Windows Security, Okta) and prints the rest
// as the syslog line the product would have sent. Nothing here changes what the game scores on: ids, keys, `attack`,
// `noise`, `msg`, `line` and `short` are untouched.

import { WIN_EVENTS, wrapWinEvent, sysmonXml, sidOf, DOMAIN_SID } from './winevents.js';
import { parseKv, legacyOkta, legacyCloudTrail, legacyUal, legacyAzureAudit } from './cloudfmt.js';

const pad = (n) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Wall-clock seconds since midnight on `date` -> { iso (UTC), us ('10/21/2026 02:24:31 AM'), splunk ('10/21/26 2:24:31.000 AM') }. */
export function stamps(date, t) {
  const year = date.year || 2026;
  const mon = MONTHS.indexOf(date.month);
  const offset = date.utcOffset ?? (mon >= 3 && mon <= 9 ? 4 : mon === 2 || mon === 10 ? 4 : 5); // US Eastern, roughly
  const utc = new Date(Date.UTC(year, mon, date.day, 0, 0, 0) + (t + offset * 3600) * 1000);
  const iso = `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}T${pad(utc.getUTCHours())}:${pad(utc.getUTCMinutes())}:${pad(utc.getUTCSeconds())}Z`;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ap = h < 12 ? 'AM' : 'PM';
  const mm = pad(mon + 1);
  return {
    iso,
    offset,
    us: `${mm}/${pad(date.day)}/${year} ${pad(h12)}:${pad(m)}:${pad(s)} ${ap}`,
    splunk: `${mm}/${pad(date.day)}/${String(year).slice(2)} ${h12}:${pad(m)}:${pad(s)}.000 ${ap}`,
    syslog: `${date.month} ${String(date.day).padStart(2, ' ')} ${pad(h)}:${pad(m)}:${pad(s)}`,
  };
}

// ---------------------------------------------------------------------------------------------- sourcetypes

const syslog = (st, path, index = 'os') => ({ index, sourcetype: st, path, style: 'syslog' });
export const SOURCETYPES = {
  Security: { index: 'wineventlog', sourcetype: 'WinEventLog:Security', path: 'WinEventLog:Security', style: 'win' },
  nginx: { index: 'web', sourcetype: 'access_combined', path: '/var/log/nginx/access.log', style: 'access' },
  httpd: { index: 'web', sourcetype: 'access_combined', path: '/var/log/httpd/access_log', style: 'syslog' },
  iis: { index: 'web', sourcetype: 'ms:iis:auto', path: 'C:\\inetpub\\logs\\LogFiles\\W3SVC1\\u_ex.log', style: 'syslog' },
  modsec: { index: 'web', sourcetype: 'modsec:audit', path: '/var/log/modsec_audit.log', style: 'syslog' },
  'waf-modsec': { index: 'web', sourcetype: 'modsec:audit', path: '/var/log/modsec_audit.log', style: 'syslog' },
  'waf-access': { index: 'web', sourcetype: 'access_combined', path: '/var/log/nginx/access.log', style: 'syslog' },
  portal: syslog('portal:auth', '/var/log/portal/auth.log', 'web'),
  'portal-auth': syslog('portal:auth', '/var/log/portal/auth.log', 'web'),
  sshd: syslog('linux_secure', '/var/log/auth.log'),
  auditd: syslog('linux:audit', '/var/log/audit/audit.log'),
  postfix: syslog('postfix_syslog', '/var/log/mail.log', 'mail'),
  mail: syslog('mail:gateway', '/var/log/mailgw.log', 'mail'),
  'exchange-audit': { index: 'o365', sourcetype: 'MSExchange:2013:Audit', path: 'WinEventLog:Exchange', style: 'syslog' },
  openvpn: syslog('openvpn', '/var/log/openvpn/openvpn.log', 'network'),
  vpn: syslog('vpn:gateway', '/var/log/vpn.log', 'network'),
  smbd_audit: syslog('samba:full_audit', '/var/log/samba/audit.log', 'file'),
  Sysmon: { index: 'endpoint', sourcetype: 'XmlWinEventLog:Microsoft-Windows-Sysmon/Operational', path: 'XmlWinEventLog:Microsoft-Windows-Sysmon/Operational', style: 'win' },
  WinSystem: { index: 'wineventlog', sourcetype: 'WinEventLog:System', path: 'WinEventLog:System', style: 'win' },
  PowerShell: { index: 'wineventlog', sourcetype: 'WinEventLog:Microsoft-Windows-PowerShell/Operational', path: 'WinEventLog:Microsoft-Windows-PowerShell/Operational', style: 'win' },
  'file-audit': syslog('endpoint:file_create', 'sysmon', 'endpoint'),
  proxy: syslog('proxy:access', '/var/log/proxy/access.log', 'network'),
  netflow: { index: 'network', sourcetype: 'netflow', path: 'udp:2055', style: 'syslog' },
  firewall: syslog('firewall', 'udp:514', 'network'),
  waf: syslog('waf', 'udp:514', 'network'),
  ids: syslog('ids:alert', 'udp:514', 'network'),
  'tls-inspect': syslog('tls:inspect', 'udp:514', 'network'),
  citrix: syslog('citrix:netscaler:syslog', 'udp:514', 'network'),
  fireeye: syslog('fireeye:nx', 'udp:514', 'network'),
  pcap: syslog('pcap:search', 'moloch', 'network'),
  okta: { index: 'identity', sourcetype: 'OktaIM2:log', path: 'Okta:im2', style: 'json' },
  idp: syslog('sso:auth', 'udp:514', 'identity'),
  sso: syslog('sso:auth', 'udp:514', 'identity'),
  'm365-audit': { index: 'o365', sourcetype: 'o365:management:activity', path: 'o365:management:activity', style: 'json' },
  'azure-audit': { index: 'azure', sourcetype: 'azure:monitor:aad', path: 'azure://halcyon-entra-diag/AuditLogs', style: 'json' },
  'entra-signin': { index: 'azure', sourcetype: 'azure:monitor:aad', path: 'azure://halcyon-entra-diag/SignInLogs', style: 'json' },
  'azure-activity': { index: 'azure', sourcetype: 'mscs:azure:eventhub', path: 'azure://halcyon-activity-log', style: 'json' },
  defender365: { index: 'azure', sourcetype: 'ms365:defender:incident:alerts', path: 'ms365:defender:alerts', style: 'json' },
  cloudtrail: { index: 'aws', sourcetype: 'aws:cloudtrail', path: 's3://cloudtrail-logs-111122223333/AWSLogs/111122223333/CloudTrail/us-east-1/', style: 'json' },
  'github-audit': { index: 'saas', sourcetype: 'github:enterprise:audit', path: 'github://halcyon/audit-log', style: 'json' },
  guardduty: { index: 'aws', sourcetype: 'aws:cloudwatch:guardduty', path: 'us-east-1:guardduty', style: 'json' },
  cloudwatch: { index: 'aws', sourcetype: 'aws:cloudwatchlogs', path: 'cloudwatch:metrics', style: 'syslog' },
  'cloud-config': { index: 'aws', sourcetype: 'aws:config:notification', path: 'aws:config', style: 'syslog' },
  'vpc-flow': { index: 'aws', sourcetype: 'aws:cloudwatchlogs:vpcflow', path: 'vpcflow:eni', style: 'syslog' },
  edr: syslog('edr:alert', 'edr', 'endpoint'),
  defender: syslog('defender:alert', 'edr', 'endpoint'),
  symantec: syslog('symantec:ep:security', 'sep', 'endpoint'),
  veeam: syslog('veeam:job', 'veeam', 'backup'),
  backup: syslog('backup:job', 'backup', 'backup'),
  vcenter: syslog('vmware:vclog', '/var/log/vmware/vpxd/vpxd.log', 'virtualization'),
  'esxi-hostd': syslog('vmware:esxlog:hostd', '/var/log/hostd.log', 'virtualization'),
  'esxi-shell': syslog('vmware:esxlog:shell', '/var/log/shell.log', 'virtualization'),
  itsm: syslog('servicenow:incident', 'servicenow', 'itsm'),
  secretserver: syslog('thycotic:secretserver', 'secretserver', 'pam'),
  dbaudit: syslog('db:audit', 'db_audit', 'database'),
  scanner: syslog('qualys:scan', 'qualys', 'vuln'),
  'app-log': syslog('app:log', '/var/log/app.log', 'app'),
  'app-audit': syslog('app:audit', '/var/log/app.log', 'app'),
};
const SYSLOG_TAG = /^[\w./-]+(\[\d+\])?: /;
const GENERIC = { index: 'main', sourcetype: '', path: 'udp:514', style: 'syslog' };

const flatten = (obj, prefix = '', out = {}) => {
  if (obj === null || obj === undefined) return out;
  if (Array.isArray(obj)) {
    obj.forEach((v) => (typeof v === 'object' && v !== null ? flatten(v, `${prefix}{}`, out) : push(out, `${prefix}{}`, v)));
  } else if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (v === null || v === undefined) continue;
      if (typeof v === 'object') flatten(v, prefix ? `${prefix}.${k}` : k, out);
      else push(out, prefix ? `${prefix}.${k}` : k, v);
    }
  }
  return out;
};
function push(out, k, v) {
  if (v === '' || v === undefined) return;
  (out[k] ||= []).push(String(v));
}

// Windows body -> fields the way Splunk's Windows TA names them (Account_Name, Logon_Type, ...).
function winFields(body, code) {
  const out = {};
  let section = '';
  for (const line of body.split('\n')) {
    const sec = line.match(/^([A-Za-z][A-Za-z ()-]+):\s*$/);
    if (sec) {
      section = sec[1];
      continue;
    }
    const m = line.match(/^\s*([A-Za-z][A-Za-z0-9 ()-]*?):\s+(\S.*)$/) || line.match(/^\s*([A-Za-z][A-Za-z0-9 ()-]*?):\t+(.*)$/);
    if (!m || m[2] === '-' ) continue;
    const key = m[1].trim().replace(/[ ()-]+/g, '_').replace(/_$/, '');
    (out[key] ||= []).push(m[2].trim());
  }
  out.EventCode = [String(code)];
  return out;
}

const xmlFields = (data) => Object.fromEntries(data.filter(([, v]) => v !== '' && v !== undefined && v !== '-').map(([k, v]) => [k, [String(v)]]));

// ---------------------------------------------------------------------------------------------- legacy "Security" messages

const SYS32 = 'C:\\Windows\\System32\\';
const exe = (name) => (!name ? '-' : name.includes('\\') ? name : `${SYS32}${name}`);

function legacyWinParams(code, kv, e) {
  const p = { user: kv.user, type: Number(kv.logon_type) || 3, ip: kv.src_ip, ws: kv.workstation };
  if (code === 4688) {
    p.proc = exe(kv.process);
    p.parent = exe(kv.parent);
    p.cmd = kv.cmd ?? '';
  }
  if (code === 4728 || code === 4732 || code === 4756) {
    p.member = kv.member;
    p.group = kv.group;
    p.by = kv.by;
  }
  if (code === 4720) {
    p.by = kv.by;
    p.user = kv.new_user || kv.user;
  }
  if (e.host) p.host = e.host;
  return p;
}

// ---------------------------------------------------------------------------------------------- the pipeline

/**
 * Attach index, sourcetype, source path, raw text, fields and enrichment note to every event.
 * `events` must already be sorted by time.
 */
export function enrichEvents(events, date, opts = {}) {
  const domain = date.domain || opts.domain || 'halcyonmutual.local';
  const netbios = date.netbios || opts.netbios || domain.split('.')[0].toUpperCase();
  const records = new Map();
  return events.map((e) => {
    const spec = SOURCETYPES[e.source] || { ...GENERIC, sourcetype: e.source };
    const st = stamps(e.dateObj || date, e.t);
    const { kv } = parseKv(e.msg);
    let note = e.note || null;
    let msgForRaw = e.msg;
    if (!note) {
      const tail = e.msg.match(/\s+\(([^()]{3,})\)\s*$/);
      if (tail && !/^(sic|redacted)/i.test(tail[1])) {
        note = tail[1];
        msgForRaw = e.msg.slice(0, tail.index);
      }
    }
    if (kv.note && !e.note) note = kv.note;
    msgForRaw = msgForRaw.replace(/\s+note="[^"]*"/, '');

    const base = (records.get(e.host) ?? 1000000 + [...e.host].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9000000, 7)) + 1 + Math.floor(e.t % 3);
    records.set(e.host, base);

    let index = e.index || spec.index;
    let sourcetype = e.sourcetype || spec.sourcetype;
    let srcpath = e.srcpath || spec.path;
    let raw = e.raw;
    let fields = {};
    const ctx = { netbios, realm: domain, domainSid: date.domainSid || DOMAIN_SID, host: e.host };

    const secMatch = e.source === 'Security' && e.msg.match(/^EventID=(\d+)/);
    if (e.win || (secMatch && WIN_EVENTS[secMatch[1]])) {
      const code = e.win ? e.win.code : Number(secMatch[1]);
      const params = e.win ? { ...ctx, ...e.win.params } : { ...ctx, ...legacyWinParams(code, kv, e) };
      const w = WIN_EVENTS[code];
      const body = e.winBody || w.body(params);
      const ok = typeof w.ok === 'function' ? w.ok(params) : w.ok;
      raw = wrapWinEvent({ code, body, host: e.host, domain, stamp: st.us, record: base, ok });
      fields = winFields(body, code);
      fields.LogName = [w.log || 'Security'];
      fields.ComputerName = [`${e.host.toUpperCase()}.${domain}`];
      fields.Keywords = [w.log && w.log !== 'Security' ? 'Classic' : ok ? 'Audit Success' : 'Audit Failure'];
      fields.TaskCategory = [w.task];
      fields.SourceName = [w.source || 'Microsoft Windows security auditing.'];
      fields.RecordNumber = [String(base)];
      if (w.log === 'System') sourcetype = 'WinEventLog:System';
      else if (w.log && w.log !== 'Security') sourcetype = `WinEventLog:${w.log}`;
      srcpath = sourcetype;
      index = 'wineventlog';
    } else if (e.sysmon) {
      const data = typeof e.sysmon.data === 'function' ? e.sysmon.data(st) : e.sysmon.data;
      raw = sysmonXml(e.sysmon.id, { host: e.host, domain, utc: st.iso, record: base, data });
      fields = xmlFields(data);
      fields.EventCode = [String(e.sysmon.id)];
      fields.Channel = ['Microsoft-Windows-Sysmon/Operational'];
      fields.Computer = [`${e.host.toUpperCase()}.${domain}`];
      sourcetype = 'XmlWinEventLog:Microsoft-Windows-Sysmon/Operational';
      srcpath = 'XmlWinEventLog:Microsoft-Windows-Sysmon/Operational';
      index = 'endpoint';
    } else if (e.json || e.make || (['okta', 'cloudtrail', 'm365-audit', 'exchange-audit', 'azure-audit'].includes(e.source) && !raw)) {
      const rec = e.json || (e.make ? e.make(st) : e.source === 'cloudtrail' ? legacyCloudTrail(e, st.iso) : e.source === 'azure-audit' ? legacyAzureAudit(e, st.iso) : e.source === 'okta' ? legacyOkta(e, st.iso) : legacyUal(e, st.iso));
      raw = JSON.stringify(rec, null, 2);
      fields = flatten(rec);
    } else if (!raw) {
      if (e.source === 'nginx') raw = e.access || msgForRaw.replace(/^nginx:\s*/, '');
      else raw = `${st.syslog} ${e.host} ${SYSLOG_TAG.test(msgForRaw) ? '' : `${e.source}: `}${msgForRaw}`;
    }

    // Generic key=value extraction for everything that is not already structured.
    if (!Object.keys(fields).length) {
      for (const [k, v] of Object.entries(parseKv(raw.includes('\n') ? e.msg : raw).kv)) fields[k] = [v];
      const web = raw.match(/^(\S+) \S+ \S+ \[[^\]]+\] "(\S+) (\S+) [^"]*" (\d{3}) (\d+|-)(?: "([^"]*)" "([^"]*)")?/);
      if (web) Object.assign(fields, { clientip: [web[1]], method: [web[2]], uri: [web[3]], status: [web[4]], bytes: [web[5]], ...(web[7] ? { useragent: [web[7]] } : {}) });
      if (e.source === 'sshd') {
        const m = e.msg.match(/(Failed|Accepted) (\w+) for (?:invalid user )?(\S+) from (\S+) port (\d+)/);
        if (m) Object.assign(fields, { action: [m[1] === 'Failed' ? 'failure' : 'success'], method: [m[2]], user: [m[3]], src_ip: [m[4]], src_port: [m[5]] });
      }
      if (e.source === 'smbd_audit') {
        const [u, ip, op, res, ...path] = e.msg.split('|');
        if (path.length) Object.assign(fields, { user: [u], src_ip: [ip], operation: [op], result: [res], path: [path.join('|').replace(/\s*\(.*\)$/, '')] });
      }
    }
    // Common aliases (Splunk CIM style), only when the event did not already say it.
    if (e.user && !fields.user) fields.user = [e.user];
    if (e.ip && !fields.src_ip) fields.src_ip = [e.ip];
    const lines = raw.split('\n').length;
    return {
      ...e,
      index,
      sourcetype,
      srcpath,
      raw,
      fields,
      note,
      linecount: lines,
      splunkTime: st.splunk,
      utc: st.iso,
    };
  });
}

/** Flat lowercase text a free-text search can match against (the compact line + every extracted field value). */
export function searchText(e) {
  const f = Object.entries(e.fields || {}).map(([k, v]) => `${k}=${[].concat(v).join(' ')}`);
  return `${e.line} ${e.index} ${e.sourcetype} ${f.join(' ')} ${e.note || ''}`.toLowerCase();
}

export { sidOf };
