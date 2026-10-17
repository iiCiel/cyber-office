// Shared tools for building each day's logs: a seeded PRNG (so logs are identical on every run),
// timestamps, real-format raw Windows events, and the final "what the SIEM shows" step.

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

export const EVENT_LABEL = { 4624: 'LOGON OK', 4625: 'LOGON FAILED', 4634: 'LOGOFF', 4688: 'PROCESS', 4720: 'USER CREATED', 4728: 'GROUP ADD' };

export const win4625 = (user, ip, ws, port) => [
  'An account failed to log on.',
  '',
  'Subject:',
  '\tSecurity ID:\t\tNULL SID',
  '\tAccount Name:\t\t-',
  '',
  'Logon Type:\t\t\t3',
  '',
  'Account For Which Logon Failed:',
  `\tAccount Name:\t\t${user}`,
  '\tAccount Domain:\t\tHALCYON',
  '',
  'Failure Information:',
  '\tFailure Reason:\t\tUnknown user name or bad password.',
  '\tStatus:\t\t\t0xC000006D',
  '\tSub Status:\t\t0xC000006A',
  '',
  'Network Information:',
  `\tWorkstation Name:\t${ws}`,
  `\tSource Network Address:\t${ip}`,
  `\tSource Port:\t\t${port}`,
].join('\n');

export const win4624 = (user, ip, ws, type, logonId) => [
  'An account was successfully logged on.',
  '',
  `Logon Type:\t\t\t${type}`,
  '',
  'New Logon:',
  `\tAccount Name:\t\t${user}`,
  '\tAccount Domain:\t\tHALCYON',
  `\tLogon ID:\t\t${logonId}`,
  '',
  'Network Information:',
  `\tWorkstation Name:\t${ws}`,
  `\tSource Network Address:\t${ip}`,
  '',
  'Authentication Information:',
  `\tLogon Process:\t\t${type === 2 ? 'User32' : 'NtLmSsp'}`,
  `\tAuthentication Package:\t${type === 2 ? 'Negotiate' : 'NTLM'}`,
].join('\n');

export const win4688 = (user, host, proc, cmd, parent) => [
  'A new process has been created.',
  '',
  'Creator Subject:',
  `\tAccount Name:\t\t${user}`,
  '\tAccount Domain:\t\tHALCYON',
  '',
  'Process Information:',
  `\tNew Process Name:\t${proc}`,
  `\tCreator Process Name:\t${parent}`,
  `\tProcess Command Line:\t${cmd}`,
  '',
  `Computer:\t\t${host}.halcyonmutual.local`,
].join('\n');

/**
 * A log builder. Every event gets an id in creation order, so ids stay stable no matter which
 * optional (consequence) events get added at the end.
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
  return {
    r,
    ev,
    add,
    pick: (a) => a[Math.floor(r() * a.length)],
    fail(t, user, ip, ws, extra = {}) {
      const port = 49152 + Math.floor(r() * 16000);
      add(t, 'dc01', 'Security', `EventID=4625 An account failed to log on. user=${user} logon_type=3 src_ip=${ip} workstation=${ws} sub_status=0xC000006A`, {
        raw: win4625(user, ip, ws, port), user, ip, ...extra,
      });
      return port;
    },
    ok(t, user, ip, ws, type, extra = {}) {
      return add(t, 'dc01', 'Security', `EventID=4624 An account was successfully logged on. user=${user} logon_type=${type} src_ip=${ip} workstation=${ws}`, {
        raw: win4624(user, ip, ws, type, logonId()), user, ip, ...extra,
      });
    },
    logoff(t, user, type = 3, extra = {}) {
      return add(t, 'dc01', 'Security', `EventID=4634 An account was logged off. user=${user} logon_type=${type}`, { user, ...extra });
    },
    proc(t, host, user, exe, cmd, parent, extra = {}) {
      const name = exe.split('\\').pop();
      return add(t, host, 'Security', `EventID=4688 A new process has been created. user=${user} process=${name} parent=${parent.split('\\').pop()} cmd="${cmd}"`, {
        raw: win4688(user, host, exe, cmd, parent), user, ...extra,
      });
    },
  };
}

/** Filter to "now", sort, and add the display fields the SIEM uses (line = full, short = compact). */
export function finishLogs(ev, { nowMinutes, date }) {
  const nowSec = nowMinutes * 60;
  const stamp = (sec) => `${date.month} ${date.day} ${hms(sec)}`;
  return ev
    .filter((e) => e.t <= nowSec)
    .sort((a, b) => a.t - b.t) // stable: same-second events keep creation order
    .map((e) => ({
      ...e,
      time: stamp(e.t),
      line: `${stamp(e.t)} ${e.host} ${e.source === 'Security' ? 'Microsoft-Windows-Security-Auditing: ' : ''}${e.msg}`,
      short: e.source === 'Security' ? e.msg.replace(/^EventID=(\d+) (.+?)\. (.*)$/, (_, id, _s, rest) => `${id} ${EVENT_LABEL[id] || ''}  ${rest}`) : e.msg,
    }));
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
