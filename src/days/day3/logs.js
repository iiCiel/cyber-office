// Day 3 logs: an attack on the customer portal (WEB01), as a defender sees it.
//   02:10  an automated tool from 198.51.100.23 starts hammering /api/claims with malformed input
//          (the WAF flags it as SQL injection; the app answers with 500 errors)
//   02:24  a request that should return one claim returns 1.8 MB instead (the user table leaked)
//   02:27  another returns 48 MB (the claims table)
//   02:33  the attacker logs in to /admin and exports the customer table (31 MB)
// The WAF (ModSecurity) saw all of it, but it runs in DetectionOnly mode: it logs and lets everything through.
// Request payloads are deliberately redacted in this game: the lesson is reading the evidence, not the exploit.
// The same nginx lines are in the Terminal under /var/log/remote/web01/nginx/access.log.

import { T, logBuilder, finishLogs, backgroundNoise } from '../../game/logkit.js';

export const DATE = { weekday: 'WED', name: 'Wednesday', month: 'Oct', day: 21 };
export const ATTACKER_IP = '198.51.100.23';
const TOOL_UA = 'python-requests/2.32.3';
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36';
const REDACTED = (n) => `[REDACTED-SQL-${n}-chars]`;

export const IP_INFO = {
  '198.51.100.23': { where: 'Netherlands', owner: 'AS-SHADOWHOST (bulletproof hosting)', note: "Same hosting company as Tuesday's MFA attacker (198.51.100.77). Same people.", external: true },
};

const pad = (n) => String(n).padStart(2, '0');
const clf = (t) => `[21/Oct/2026:${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)} -0400]`;

export function generateLogs({ nowMinutes = 24 * 60 } = {}) {
  const b = logBuilder(1021);
  const { r, add } = b;
  const nginx = (t, ip, method, path, status, bytes, ua, extra = {}) => {
    const raw = `${ip} - - ${clf(t)} "${method} ${path} HTTP/1.1" ${status} ${bytes} "-" "${ua}"`;
    return add(t, 'web01', 'nginx', `nginx: ${raw}`, { ip, access: raw, ...extra });
  };
  const waf = (t, extra = {}) =>
    add(t, 'web01', 'modsec', `ModSecurity: Warning. SQL injection pattern detected [id "942100"] [uri "/api/claims"] [client ${ATTACKER_IP}] [mode DetectionOnly] action=logged-only`, { ip: ATTACKER_IP, attack: true, ...extra });

  // The attack: lots of malformed requests (errors and tiny responses), then a few huge ones.
  let t = T(2, 10, 5);
  for (let i = 0; i < 46; i++) {
    const status = r() < 0.55 ? 500 : 200;
    nginx(t, ATTACKER_IP, 'GET', `/api/claims?id=CLM-10001${REDACTED(20 + Math.floor(r() * 140))}`, status, status === 500 ? 312 : 180 + Math.floor(r() * 60), TOOL_UA, { attack: true, key: i === 0 ? 'probe-first' : undefined });
    if (i % 3 === 0) waf(t, { key: i === 0 ? 'waf-detect' : undefined });
    t += 12 + Math.floor(r() * 10);
  }
  nginx(T(2, 24, 31), ATTACKER_IP, 'GET', `/api/claims?id=CLM-10001${REDACTED(118)}`, 200, 1843221, TOOL_UA, { attack: true, key: 'dump-users' });
  waf(T(2, 24, 31));
  nginx(T(2, 27, 10), ATTACKER_IP, 'GET', `/api/claims?id=CLM-10001${REDACTED(97)}`, 200, 48220113, TOOL_UA, { attack: true, key: 'dump-claims' });
  waf(T(2, 27, 10));
  nginx(T(2, 33, 5), ATTACKER_IP, 'POST', '/admin/login', 302, 412, BROWSER, { attack: true, key: 'admin-login' });
  nginx(T(2, 33, 40), ATTACKER_IP, 'GET', '/admin/export?table=customers&format=csv', 200, 31455120, BROWSER, { attack: true, key: 'export' });
  add(T(2, 33, 6), 'web01', 'portal', `portal-auth: admin login OK user=admin src=${ATTACKER_IP} (first admin login from outside 10.0.0.0/8 this year)`, { ip: ATTACKER_IP, attack: true });

  // Real customers through the morning.
  const paths = [
    ['GET', '/', 200, 5120],
    ['GET', '/login', 200, 3480],
    ['POST', '/login', 302, 410],
    ['GET', '/static/app.js', 200, 48211],
    ['GET', '/favicon.ico', 200, 1150],
  ];
  for (let tt = T(6, 0); tt < T(10, 30); tt += 40 + Math.floor(r() * 140)) {
    const ip = `192.0.2.${10 + Math.floor(r() * 200)}`;
    if (r() < 0.45) nginx(tt, ip, 'GET', `/claims/status?id=CLM-${20000 + Math.floor(r() * 9000)}`, 200, 1700 + Math.floor(r() * 300), BROWSER);
    else {
      const [m, p, s, by] = b.pick(paths);
      nginx(tt, ip, m, p, s, by + Math.floor(r() * 50), BROWSER);
    }
  }
  backgroundNoise(b, {
    arrivals: [
      ['priya.r', T(7, 40)],
      ['dana.k', T(6, 2)],
      ['t.okoye', T(7, 55)],
      ['m.chen', T(8, 25)],
      ['c.reyes', T(8, 7)],
    ],
  });

  return finishLogs(b.ev, { nowMinutes, date: DATE });
}

/** The raw nginx access log as a file, for the Terminal. */
export function accessLog(nowMinutes) {
  return `${generateLogs({ nowMinutes })
    .filter((e) => e.access)
    .map((e) => e.access)
    .join('\n')}\n`;
}

export const CASE = {
  id: 'case',
  area: 'SOC alert',
  title: 'Customer portal attack (WEB01)',
  max: 30,
  question: 'What happened on the portal?',
  teaches: { skill: 'Read web server logs: errors, then oversized responses', secplus: '4.9 Use data sources: application and web logs' },
  verdicts: [
    { id: 'scanner', text: 'Just a scanner poking at us. Errors only, nothing taken.' },
    { id: 'sqli', text: 'SQL injection worked: the user and claims tables leaked, then the attacker logged in to admin and exported customers.' },
    { id: 'customer', text: 'A customer typed odd characters into the claim search.' },
  ],
  correctVerdict: 'sqli',
  wrongVerdictNotes: {
    scanner: 'Look at the response sizes: a claim lookup is about 1.8 KB, and three of these responses were 1.8 MB, 48 MB and 31 MB. That is data leaving.',
    customer: 'One customer does not send 50 malformed requests in 15 minutes at 2 AM from a hosting company, then log in as admin.',
  },
  actions: [
    { id: 'offline', text: 'Put the portal in maintenance mode until it is fixed', good: true },
    { id: 'fix', text: 'Have Theo fix the query (parameterized statements) and switch the WAF to blocking mode', good: true },
    { id: 'resetpw', text: 'Reset the admin account and force a password reset for every portal user', good: true },
    { id: 'notify', text: 'Tell Legal: customer data left the building (breach notification rules apply)', good: true },
    { id: 'block', text: `Block ${ATTACKER_IP} at the firewall`, good: true },
    { id: 'deletelogs', text: 'Delete the access logs so the leak does not spread internally', good: false, why: 'The logs are the evidence. Deleting them can also break legal hold rules.' },
    { id: 'restore', text: 'Restore the database from last night\'s backup to undo it', good: false, why: 'Restoring doesn\'t un-steal data, and it wipes evidence of what was touched.' },
  ],
  primaryEvidence: { key: 'dump-users', note: 'The key evidence is the 200 response of 1,843,221 bytes at 02:24:31: a claim lookup should be about 1.8 KB.' },
  keyEvidence: ['dump-users', 'dump-claims', 'admin-login', 'export', 'waf-detect', 'probe-first'],
  containedRequires: ['offline', 'fix'],
  costs: {
    contained: { amount: 38000, text: 'Notify 3,412 customers; portal fixed the same day' },
    breach: { amount: 180000, text: 'The hole stayed open; the attacker exported data again, regulators got involved' },
  },
  perfectWhy: 'Exactly: errors while probing, then three oversized responses and an admin export. Portal down, hole fixed, Legal told.',
  notSubmittedWhy: 'Nobody looked. The hole stayed open and the attacker came back the next night.',
};

export const ALERTS = [
  {
    id: 'portal-sqli',
    main: true,
    title: 'WAF: SQL injection pattern on WEB01, then large responses',
    severity: 'Critical',
    rule: 'More than 10 WAF SQL injection detections from one source, followed by a response more than 100x the normal size for that URL.',
    fields: [
      ['Host', 'web01 (customer portal)'],
      ['Source IP', ATTACKER_IP],
      ['URL', '/api/claims'],
      ['Biggest response', '48,220,113 bytes'],
      ['WAF mode', 'DetectionOnly (not blocking)'],
    ],
    trigger: { after: 'inbox', delayMs: 2500, fallbackAt: 9 * 60 + 40 },
    notice: '🚨 SIEM alert (Critical): attack on the customer portal',
    chat: [
      'Critical alert on the customer portal. The source is 198.51.100.23.',
      'First, from the Terminal on your PC: whois 198.51.100.23. I want to know who that is.',
      'Then the SOC console: what did they get? Hint: look at the response sizes.',
    ],
    case: CASE,
  },
];
