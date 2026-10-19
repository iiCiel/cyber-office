// Case file: Capital One, March-July 2019. The logs the cloud security team would have had, rebuilt from public sources.
//
// What the sources say (see index.js): the attacker reached a server behind a misconfigured web application
// firewall ("A firewall misconfiguration permitted commands to reach and be executed by that server" in the DOJ
// complaint); a command obtained the security credentials for a role named "*****-WAF-Role" (name redacted in the
// complaint); a second command listed the buckets the role could see; a third ("Sync Command") copied data out.
// Capital One's logs showed connections from Tor exit nodes and a VPN provider. Many security researchers read
// the first step as server-side request forgery (SSRF) against the instance metadata service. The complaint does
// not use that word, so the replay labels it as the widely reported analysis.
//
// Compression: the real access was in March 2019 and was found July 17. The replay shows the attacker's session
// in the early hours of the shift date so the SIEM can show it. Hostnames, role and bucket names, request shapes
// and every IP are stand-ins. IPs come from the documentation ranges (RFC 5737); the real IPs were not published
// (the complaint only names the kinds of services). Payloads are redacted.

import { T, logBuilder, finishLogs } from '../../game/logkit.js';

export const DATE = { weekday: 'WED', name: 'Wednesday', month: 'Jul', day: 17 };
const ATT_VPN = '198.51.100.62'; // VPN provider address the first requests come from
const ATT_TOR = '203.0.113.17'; // Tor exit node stand-in: the stolen role session is used from here
const WAF = '10.40.3.23'; // waf-prod-03
const ETL = '10.40.8.15';
const BACKUP = '10.40.9.9';
const ADMIN = '192.0.2.25';
const ROLE = 'corp-waf-role';
const SESSION = 'i-0a1b2c3d';

export const IP_INFO = {
  [ATT_VPN]: { where: 'Sweden', owner: 'Commercial VPN service', note: 'Sends the odd requests to the firewall host. Not a customer pattern. (Stand-in IP: the complaint names the kind of service, not the address.)', external: true },
  [ATT_TOR]: { where: 'Tor exit node', owner: 'Anonymizing network', note: 'Uses the firewall role\'s temporary credentials. That role should only ever be used from inside AWS. (Stand-in IP.)', external: true },
  [WAF]: { where: 'Internal: web tier', owner: 'waf-prod-03', note: 'The firewall/proxy server that holds the role.' },
  [ETL]: { where: 'Internal: data platform', owner: 'etl-nightly', note: 'The nightly data job. Reads buckets by design.' },
  [BACKUP]: { where: 'Internal: backup network', owner: 'svc-backup', note: 'Backup copy jobs run from here every night.' },
  [ADMIN]: { where: 'United States', owner: 'Corporate office egress', note: 'Normal admin console logins come from here.' },
  '10.40.1.5': { where: 'Internal: load balancer', owner: 'lb-prod-01', note: 'Health checks to the firewall servers.' },
};

const BUCKETS = ['corp-app-store-01', 'corp-app-store-02', 'corp-app-store-03', 'corp-app-store-04', 'corp-app-store-05', 'corp-app-store-06'];
const WAF_UA = 'Mozilla/5.0 (compatible; customer-browser)';

const ct = (b, t, eventName, who, ip, extra = {}, more = '') =>
  b.add(t, 'cloudtrail', 'cloudtrail', `eventName=${eventName} userIdentity=AssumedRole:${who} sourceIPAddress=${ip}${more}`, { user: who, ip, ...extra });

export function generateLogs({ nowMinutes = 24 * 60 } = {}) {
  const b = logBuilder(2019);
  const { r, add } = b;

  // ---- Config audit: the weekly scan already knew about both gaps ----
  add(T(0, 30, 0), 'cfg-audit', 'cloud-config', `finding=HIGH resource=i-0a1b2c3d (waf-prod-03) detail="app-layer proxy can reach instance metadata service; outbound destination filter: none" open_days=74`, { key: 'meta-open' });
  add(T(0, 30, 2), 'cfg-audit', 'cloud-config', `finding=HIGH resource=${ROLE} detail="allows s3:ListAllMyBuckets, s3:ListBucket, s3:GetObject on arn:aws:s3:::*" last_reviewed=never`, { key: 'role-policy' });

  // ---- Before the shift: the attacker's session (compressed into the early hours) ----
  add(T(1, 12, 5), 'waf-prod-03', 'waf-access', `${ATT_VPN} - "GET /status/check?dest=<redacted: link-local metadata address>/latest/meta-data/iam/security-credentials/ HTTP/1.1" 200 21 "${WAF_UA}"`, { ip: ATT_VPN, attack: true, key: 'ssrf-req' });
  add(T(1, 12, 9), 'waf-prod-03', 'waf-access', `${ATT_VPN} - "GET /status/check?dest=<redacted: link-local metadata address>/latest/meta-data/iam/security-credentials/${ROLE} HTTP/1.1" 200 1412 "${WAF_UA}" body=<redacted: AccessKeyId, SecretAccessKey, SessionToken>`, { ip: ATT_VPN, attack: true, key: 'creds-resp' });
  ct(b, T(1, 18, 31), 'GetCallerIdentity', `${ROLE}/${SESSION}`, ATT_TOR, { attack: true, key: 'role-ext' }, ' userAgent=aws-cli/1.16 note="role session first seen outside AWS address space"');
  ct(b, T(1, 19, 40), 'ListBuckets', `${ROLE}/${SESSION}`, ATT_TOR, { attack: true, key: 'list-buckets' }, ` userAgent=aws-cli/1.16 resultCount=${BUCKETS.length + 700} errorCode=-`);
  BUCKETS.forEach((bk, i) => ct(b, T(1, 21, 0) + i * 14, 'ListObjectsV2', `${ROLE}/${SESSION}`, ATT_TOR, { attack: true }, ` bucket=${bk} errorCode=-`));
  BUCKETS.forEach((bk, i) => ct(b, T(1, 24, 0) + i * 40, 'GetObject', `${ROLE}/${SESSION}`, ATT_TOR, { attack: true, key: i === 0 ? 'sync-get' : undefined }, ` bucket=${bk} objects=${3000 + Math.floor(r() * 9000)} userAgent=aws-cli/1.16 (s3 sync pattern)`));
  let bytes = 2.1e9;
  BUCKETS.forEach((bk, i) => {
    bytes *= 1.2 + r() * 0.3;
    add(T(1, 24, 30) + i * 40, 'cw-metrics', 'cloudwatch', `metric=BytesDownloaded bucket=${bk} bytes=${Math.round(bytes)} dest=${ATT_TOR}`, { ip: ATT_TOR, attack: true, key: i === 0 ? 'egress' : undefined });
  });

  // ---- Decoys: legitimate readers of the same buckets, and a legitimate hit on the same endpoint ----
  add(T(2, 0, 0), 'cloudtrail', 'cloudtrail', `eventName=ListBuckets userIdentity=AssumedRole:etl-nightly-role/i-0e7f8a9b sourceIPAddress=${ETL} note="runs every night, inside our network"`, { user: 'etl-nightly-role', ip: ETL, key: 'decoy-etl' });
  for (let i = 0; i < BUCKETS.length; i++) add(T(2, 1, 0) + i * 30, 'cloudtrail', 'cloudtrail', `eventName=GetObject userIdentity=AssumedRole:etl-nightly-role/i-0e7f8a9b sourceIPAddress=${ETL} bucket=${BUCKETS[i]} objects=${800 + Math.floor(r() * 400)}`, { user: 'etl-nightly-role', ip: ETL });
  add(T(3, 0, 0), 'cloudtrail', 'cloudtrail', `eventName=GetObject userIdentity=AssumedRole:svc-backup/i-0c4d5e6f sourceIPAddress=${BACKUP} bucket=corp-backup-vault objects=20400`, { user: 'svc-backup', ip: BACKUP, key: 'decoy-backup' });
  add(T(6, 40, 0), 'cloudtrail', 'cloudtrail', `eventName=ConsoleLogin userIdentity=IAMUser:m.okafor sourceIPAddress=${ADMIN} mfaUsed=true`, { user: 'm.okafor', ip: ADMIN });
  add(T(7, 20, 0), 'cloudtrail', 'cloudtrail', `eventName=ConsoleLogin userIdentity=IAMUser:s.park sourceIPAddress=${ADMIN} mfaUsed=true`, { user: 's.park', ip: ADMIN });
  for (let tt = T(0, 2); tt < T(11, 30); tt += 55 + Math.floor(r() * 40)) {
    add(tt, 'waf-prod-03', 'waf-access', `10.40.1.5 - "GET /status/check HTTP/1.1" 200 2 "ELB-HealthChecker/2.0"`, { ip: '10.40.1.5', noise: true, key: tt < T(0, 4) ? 'decoy-health' : undefined });
  }
  for (let tt = T(0, 20); tt < T(11, 30); tt += 120 + Math.floor(r() * 400)) {
    add(tt, 'waf-prod-03', 'waf-access', `192.0.2.${40 + Math.floor(r() * 150)} - "${b.pick(['GET /app/login', 'GET /app/offers', 'POST /app/apply', 'GET /app/status'])} HTTP/1.1" 200 ${900 + Math.floor(r() * 4000)} "${WAF_UA}"`, { noise: true });
  }
  for (let tt = T(2, 3); tt < T(11, 30); tt += 700 + Math.floor(r() * 1900)) {
    add(tt, 'waf-prod-03', 'waf-modsec', `ModSecurity: Access denied with code 403. Matched SQL injection rule 942100 client=45.95.147.236 uri=/app/search`, { ip: '45.95.147.236', noise: true });
  }

  return finishLogs(b.ev, { nowMinutes, date: DATE });
}

export const CASE = {
  id: 'case',
  area: 'SOC investigation',
  title: 'How did a firewall role end up copying customer data out of S3?',
  max: 40,
  teaches: { skill: 'Trace stolen cloud role credentials through CloudTrail to the data', secplus: '4.8 Incident response: analysis, containment' },
  verdicts: [
    { id: 'ssrf-role', text: 'An outside attacker got the web firewall server to reveal its role credentials (widely reported as SSRF against the metadata service), then used that over-permissive role from the internet to list and copy S3 buckets.' },
    { id: 'insider', text: 'An insider with S3 access copied the data from inside the network.' },
    { id: 'awsbug', text: 'A vulnerability in S3 itself exposed the buckets, so there is nothing for us to fix.' },
    { id: 'brute', text: 'An attacker guessed an administrator password and logged in to the AWS console.' },
  ],
  correctVerdict: 'ssrf-role',
  wrongVerdictNotes: {
    insider: 'No console login, no internal source IP. A role session that belongs to a firewall server was used from a Tor exit node. An insider is not what this looks like.',
    awsbug: 'The buckets did what the role was allowed to do. AWS said the issue was a customer misconfiguration, not a flaw in its services. The fix is on our side: the server, the role and the alerting.',
    brute: 'There is no ConsoleLogin from the attacker and no password guessing. The attacker used temporary role credentials, which MFA and strong passwords do not protect.',
  },
  actions: [
    { id: 'revoke', text: 'Revoke the role\'s active sessions (deny tokens issued before now), rotate anything it could reach, and take the stolen session out of play', good: true },
    { id: 'scope', text: 'Cut corp-waf-role down to its own config bucket. No ListAllMyBuckets, no wildcard GetObject', good: true },
    { id: 'proxy', text: 'Fix the firewall/proxy: block requests that reach the metadata address, allow only known outbound destinations, and require the token-based metadata service (IMDSv2) when it ships', good: true },
    { id: 'alert', text: 'Alert on role credentials used from outside our network, and on ListBuckets or bulk GetObject by a role that never did that before', good: true },
    { id: 'ir', text: 'Preserve CloudTrail and S3 logs in a locked account, engage incident response, legal and the FBI, and plan customer and regulator notification', good: true },
    { id: 'tokenize', text: 'Encrypt or tokenize sensitive fields (SSNs, account numbers) so a bucket read is not the whole breach', good: true },
    { id: 'disclosure', text: 'Thank the researcher, confirm receipt, and publish safe-harbor disclosure rules with a response SLA', good: true },
    { id: 'blocktor', text: 'Block the Tor exit node IP and call it done', good: false, why: 'The attacker uses another exit node or VPN in a minute. The weak server and the over-broad role are still there.' },
    { id: 'deletebuckets', text: 'Delete the exposed buckets right now', good: false, why: 'That destroys evidence and customer data. The data is still on the attacker\'s side. Contain the role, keep the buckets.' },
    { id: 'leaveaws', text: 'Shut down the whole AWS account and move back on premises', good: false, why: 'An overreaction. The cloud was not the root cause; a misconfigured server and an over-broad role were. The fix is configuration, least privilege and monitoring.' },
  ],
  primaryEvidence: { key: 'list-buckets', note: 'The key line: ListBuckets, from a Tor address, using the firewall server\'s role session. That role should only ever be used from inside AWS.' },
  keyEvidence: ['ssrf-req', 'creds-resp', 'role-ext', 'list-buckets', 'sync-get', 'egress', 'role-policy', 'meta-open'],
  containedRequires: ['revoke', 'scope'],
  costs: {
    contained: { amount: 2500000, text: 'Incident response, forensics, notifying customers and credit monitoring for the exposed set (estimate for this replay)' },
    breach: { amount: 120000000, text: 'Notification, credit monitoring, legal, regulators and rebuilt controls (estimate for this replay; Capital One was widely reported to expect $100 to $150 million in 2019, and the OCC fined it $80 million in 2020)' },
  },
  perfectWhy: 'That matches the public account: a misconfigured firewall server, role credentials, an over-permissive role that could list and copy S3 buckets, access from Tor and a VPN, and a stranger\'s tip as the only detection. Revoke the session and shrink the role first, then fix the server and the alerting.',
  notSubmittedWhy: 'Nobody wrote it up. The stolen role session, and the role behind it, kept the same permissions.',
};

export const ALERTS = [
  {
    id: 'c1-s3',
    main: true,
    title: 'Instance role credentials used from outside AWS: ListBuckets and bulk GetObject',
    severity: 'Critical',
    rule: 'A role session issued to an instance is used from an IP outside our ranges, and lists buckets or reads more than 1,000 objects.',
    fields: [
      ['Role', 'corp-waf-role (session i-0a1b2c3d)'],
      ['Source', '203.0.113.17 (Tor exit node stand-in)'],
      ['Actions', 'ListBuckets, ListObjectsV2, GetObject on 6 buckets (700+ visible)'],
      ['Replay note', 'This alert did not exist in 2019. It is the one the company needed.'],
    ],
    trigger: { when: (st, min) => (st.visited.includes('tickets') && min >= 9 * 60 + 30) || min >= 10 * 60 + 30 },
    notice: '🚨 SIEM alert (Critical): firewall role used from Tor to copy S3 data',
    chat: [
      'In reality, nobody got this alert. Capital One heard about it from a stranger on July 17, 2019. The access itself happened months earlier.',
      "Don't start at the buckets. Work backward. Who is this role session? What did the server do just before?",
      'Search the SIEM for ListBuckets and for the metadata path. Then badge into the server room and write up the case at the SOC console.',
    ],
    case: CASE,
  },
];
