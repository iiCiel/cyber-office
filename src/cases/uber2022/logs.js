// Case file: Uber, September 15, 2022. The logs the SOC would have had, rebuilt from public reporting.
//
// The real chain (sources in index.js): a contractor's corporate password, likely bought after malware
// on their personal device -> a flood of MFA push requests -> a WhatsApp message posing as "Uber IT" ->
// the contractor approves -> VPN -> a PowerShell script on a network share holding admin credentials for
// the Thycotic PAM vault -> vault admin -> admin access to Google Workspace, Slack and more -> a message in
// company Slack announcing the breach.
//
// Times are compressed to fit one evening shift. Hostnames, usernames and IPs are stand-ins: the real
// internal names and attacker IPs were never published, so the IPs come from the documentation ranges
// (RFC 5737). The shape of each event matches what the real tools log.

import { T, logBuilder, finishLogs } from '../../game/logkit.js';

export const DATE = { weekday: 'THU', name: 'Thursday', month: 'Sep', day: 15 };
export const ATTACKER_IP = '203.0.113.77';
export const VPN_IP = '10.8.14.23';
const CONTRACTOR = 'r.osei';

export const IP_INFO = {
  '203.0.113.77': { where: 'United Kingdom', owner: 'Residential proxy / VPN exit', note: 'Never seen here before today. First used for r.osei at 13:02 with the correct password. (Stand-in IP: the real attacker IPs were not published.)', external: true },
  '10.8.14.23': { where: 'Internal: VPN address pool', owner: 'vpn-gw01', note: "Handed to r.osei's VPN session at 14:15. Everything this address does after that is the attacker." },
  '10.8.14.31': { where: 'Internal: VPN address pool', owner: 'vpn-gw01', note: 'An employee working from home (a.lindqvist). Normal.' },
  '10.20.1.15': { where: 'Internal: server VLAN', owner: 'fs-it01', note: 'The IT department file share.' },
  '10.20.1.40': { where: 'Internal: server VLAN', owner: 'pam01', note: 'Thycotic Secret Server: the vault that holds admin passwords for everything else.' },
};

const sso = (b, t, user, ip, event, outcome, extra = {}, more = '') =>
  b.add(t, 'sso', 'idp', `event=${event} outcome=${outcome} user=${user}@uber.com src_ip=${ip}${more}`, { user, ip, ...extra });

export function generateLogs({ nowMinutes = 24 * 60, phishedAt = null } = {}) {
  const b = logBuilder(2022);
  const { r, add } = b;

  // 13:02 the bought password works. Then the push flood.
  sso(b, T(13, 2, 41), CONTRACTOR, ATTACKER_IP, 'auth.password', 'SUCCESS', { attack: true, key: 'pw-ok' }, ' geo="London, GB" device=unknown');
  let t = T(13, 3, 0);
  for (let i = 0; i < 54; i++) {
    const reason = r() < 0.55 ? 'user_denied' : 'timeout';
    sso(b, t, CONTRACTOR, ATTACKER_IP, 'mfa.push', 'FAILURE', { attack: true, key: i === 0 ? 'push-flood' : undefined }, ` factor=push reason=${reason} attempt=${i + 1}`);
    t += 50 + Math.floor(r() * 40);
  }
  sso(b, T(14, 14, 7), CONTRACTOR, ATTACKER_IP, 'mfa.push', 'SUCCESS', { attack: true, key: 'push-approved' }, ' factor=push reason=user_approved attempt=55');
  add(T(14, 15, 2), 'vpn-gw01', 'vpn', `session start user=${CONTRACTOR} src=${ATTACKER_IP}:51244 assigned=${VPN_IP} profile=contractor-full`, { user: CONTRACTOR, ip: ATTACKER_IP, attack: true, key: 'vpn-up' });

  // 14:20-14:48 looking around: one VPN address touching many internal hosts on SMB / WinRM / HTTPS.
  const ports = [445, 5985, 443, 22, 3389];
  for (let i = 0; i < 40; i++) {
    const host = `10.20.${1 + Math.floor(i / 12)}.${10 + ((i * 7) % 60)}`;
    const port = ports[i % ports.length];
    add(T(14, 20) + i * 42, 'fw-core', 'netflow', `flow src=${VPN_IP} dst=${host}:${port} proto=tcp state=${r() < 0.6 ? 'REJECT' : 'ACCEPT'} bytes=${60 + Math.floor(r() * 400)}`, { ip: VPN_IP, attack: true, key: i === 0 ? 'scan' : undefined });
  }

  // 14:52 the script on the IT share. 14:58 the vault, as its admin.
  add(T(14, 51, 30), 'fs-it01', 'smbd_audit', `${CONTRACTOR}|${VPN_IP}|opendir|ok|IT/scripts`, { user: CONTRACTOR, ip: VPN_IP, attack: true });
  add(T(14, 52, 4), 'fs-it01', 'smbd_audit', `${CONTRACTOR}|${VPN_IP}|pread|ok|IT/scripts/pam-sync.ps1`, { user: CONTRACTOR, ip: VPN_IP, attack: true, key: 'script-read' });
  add(T(14, 58, 19), 'pam01', 'secretserver', `Login success user=ss-admin role=Administrator src_ip=${VPN_IP} method=password`, { user: 'ss-admin', ip: VPN_IP, attack: true, key: 'pam-admin' });
  const secrets = ['Google Workspace super admin', 'Slack org owner', 'AWS root (billing)', 'GCP org admin', 'vSphere administrator', 'EDR console admin', 'SSO admin API token'];
  secrets.forEach((s, i) =>
    add(T(15, 1) + i * 75, 'pam01', 'secretserver', `Secret viewed name="${s}" user=ss-admin src_ip=${VPN_IP}`, { user: 'ss-admin', ip: VPN_IP, attack: true, key: i === 0 ? 'secrets-viewed' : undefined }),
  );

  // 15:20 onward: SaaS admin, Slack, the finance tool, the bug bounty dashboard.
  add(T(15, 21, 40), 'gworkspace', 'admin-audit', `event=LOGIN_SUCCESS actor=it-gsuite-admin@uber.com ip=${ATTACKER_IP} role=SUPER_ADMIN`, { ip: ATTACKER_IP, attack: true, key: 'gws-admin' });
  add(T(15, 34, 10), 'slack', 'slack-audit', `action=user_login actor=it-slack-owner ip=${ATTACKER_IP} role=org_owner`, { ip: ATTACKER_IP, attack: true });
  add(T(15, 48, 2), 'slack', 'slack-audit', `action=export_started actor=it-slack-owner ip=${ATTACKER_IP} type=messages_selected_channels`, { ip: ATTACKER_IP, attack: true, key: 'slack-export' });
  add(T(16, 2, 33), 'fin-invoice', 'app-audit', `user=it-finance-admin action=login src_ip=${ATTACKER_IP} result=ok`, { ip: ATTACKER_IP, attack: true });
  add(T(16, 9, 12), 'hackerone', 'saas-audit', `actor=it-h1-admin action=view_reports count=212 ip=${ATTACKER_IP}`, { ip: ATTACKER_IP, attack: true });
  add(T(16, 19, 55), 'slack', 'slack-audit', `action=message_posted actor=it-slack-owner channel=#general ip=${ATTACKER_IP} text="I announce I am a hacker and Uber has suffered a data breach..."`, { ip: ATTACKER_IP, attack: true, key: 'slack-post' });

  // Ordinary evening noise: people on VPN from home with normal MFA, and internet scanners.
  const home = [['a.lindqvist', '10.8.14.31', T(13, 40)], ['k.mensah', '10.8.14.36', T(14, 5)], ['d.ferraro', '10.8.14.40', T(15, 12)], ['s.park', '10.8.14.44', T(15, 55)]];
  for (const [u, ip, at] of home) {
    sso(b, at - 30, u, '198.51.100.' + (20 + Math.floor(r() * 50)), 'auth.password', 'SUCCESS', {}, ' geo="San Francisco, US" device=managed');
    sso(b, at - 22, u, '198.51.100.' + (20 + Math.floor(r() * 50)), 'mfa.push', 'SUCCESS', {}, ' factor=push reason=user_approved attempt=1');
    add(at, 'vpn-gw01', 'vpn', `session start user=${u} assigned=${ip} profile=employee`, { user: u, ip });
    add(at + 300 + Math.floor(r() * 400), 'fs-it01', 'smbd_audit', `${u}|${ip}|pread|ok|${b.pick(['Eng/oncall/rota.xlsx', 'IT/inventory.csv', 'Finance/q3_close.xlsx'])}`, { user: u, ip });
  }
  // A decoy: the svc-backup account logs into the vault every hour, from the backup server, by design.
  for (let h = 12; h <= 16; h++) add(T(h, 0, 5), 'pam01', 'secretserver', 'Login success user=svc-backup role=ReadOnly src_ip=10.20.1.60 method=api_key', { user: 'svc-backup', ip: '10.20.1.60', key: h === 15 ? 'decoy-backup' : undefined });
  for (let tt = T(12, 3); tt < T(17, 0); tt += 500 + Math.floor(r() * 1500)) {
    add(tt, 'edge-web', 'sshd', `sshd[${3000 + Math.floor(r() * 3000)}]: Failed password for invalid user ${b.pick(['admin', 'root', 'test', 'oracle', 'ubuntu'])} from 45.95.147.236 port ${30000 + Math.floor(r() * 30000)} ssh2`, { ip: '45.95.147.236', noise: true });
  }

  // If the player types their password into the "re-verify your SSO" phish, it gets used too.
  if (phishedAt != null) {
    const at = (phishedAt + 2) * 60 + 17;
    sso(b, at, 'analyst01', '203.0.113.90', 'auth.password', 'SUCCESS', { attack: true, key: 'analyst01-pw' }, ' geo="Amsterdam, NL" device=unknown');
    sso(b, at + 5, 'analyst01', '203.0.113.90', 'mfa.push', 'FAILURE', { attack: true }, ' factor=push reason=user_denied attempt=1');
  }

  return finishLogs(b.ev, { nowMinutes, date: DATE });
}

export const CASE = {
  id: 'case',
  area: 'SOC investigation',
  title: 'How did a contractor account become vault admin?',
  max: 40,
  teaches: { skill: 'Trace an intrusion from initial access to privilege escalation', secplus: '4.8 Incident response: analysis, containment' },
  verdicts: [
    { id: 'pentest', text: 'An authorized red-team test. Someone forgot to tell the SOC.' },
    { id: 'takeover', text: "Account takeover: the attacker had the contractor's password, pushed MFA prompts until one was approved, then used admin credentials from a script on the IT share to take over the password vault and the SaaS admin accounts." },
    { id: 'insider', text: 'An insider: the contractor went rogue and is attacking from home.' },
    { id: 'prank', text: 'A prank. Someone posted a joke in Slack; nothing was really accessed.' },
  ],
  correctVerdict: 'takeover',
  wrongVerdictNotes: {
    pentest: 'Never assume a test. Real red teams are scheduled and the SOC lead knows. And this "test" posted in #general and exported Slack messages.',
    insider: 'The contractor denied 54 prompts and told IT what happened. The session came from a London proxy with an unknown device. That is someone else using their account.',
    prank: 'Not a prank: the vault admin logged in from the VPN address, viewed cloud and SSO secrets, and Google Workspace has a super-admin login from the same outside IP.',
  },
  actions: [
    { id: 'disable', text: "Disable r.osei, kill every VPN and SSO session it has", good: true },
    { id: 'rotate', text: 'Rotate every secret the vault admin viewed: cloud, SSO, Slack, Google, EDR. Then rotate ss-admin itself', good: true },
    { id: 'reauth', text: 'Force company-wide re-authentication: sign everyone out of Slack, Google and SSO', good: true },
    { id: 'freeze', text: 'Lock the code repositories and pause deployments until the scope is known', good: true },
    { id: 'scripts', text: 'Pull the hardcoded password out of pam-sync.ps1 and scan every share and repo for more', good: true },
    { id: 'mfa', text: 'Switch push MFA to number matching or FIDO2 keys, and rate-limit prompts', good: true },
    { id: 'resetonly', text: "Just reset the contractor's password; the rest is noise", good: false, why: 'The attacker already has the vault admin password and has seen the cloud and SSO secrets. Resetting one password leaves every other door open.' },
    { id: 'reply', text: 'Reply to the hacker in #general and ask what they want', good: false, why: 'Engaging in a channel they control tells them you are watching and can leak your response. Contain first; law enforcement handles contact.' },
    { id: 'shutdown', text: 'Take the customer app offline for everyone', good: false, why: 'Nothing shows production was touched. In the real incident, Uber kept rides and deliveries running and took internal tools offline instead.' },
  ],
  primaryEvidence: { key: 'pam-admin', note: 'The key line: ss-admin logging into Secret Server from the contractor\'s VPN address 10.8.14.23 at 14:58, six minutes after pam-sync.ps1 was read.' },
  keyEvidence: ['pw-ok', 'push-flood', 'push-approved', 'vpn-up', 'scan', 'script-read', 'pam-admin', 'secrets-viewed', 'gws-admin', 'slack-export', 'slack-post'],
  containedRequires: ['disable', 'rotate'],
  costs: {
    contained: { amount: 180000, text: 'Rotating hundreds of secrets, outside forensics, engineers rebuilding access (estimate for this replay)' },
    breach: { amount: 1400000, text: 'The attacker keeps vault and cloud admin overnight; identity systems rebuilt from scratch (estimate for this replay)' },
  },
  perfectWhy: 'That is the real chain: a bought password, 54 rejected pushes, one approval after a WhatsApp message, a script with the vault admin password, then the keys to everything. Contain the account, rotate everything the vault exposed, and kill the hardcoded secret.',
  notSubmittedWhy: 'Nobody wrote it up. The attacker kept the vault admin password, and every secret in it, overnight.',
};

export const ALERTS = [
  {
    id: 'uber-pam',
    main: true,
    title: 'Vault admin login from a contractor VPN session',
    severity: 'Critical',
    rule: 'Secret Server Administrator login from a VPN address pool (admins only log in from the jump host).',
    fields: [
      ['Account', 'ss-admin (Secret Server Administrator)'],
      ['Source', `${VPN_IP} (VPN session of r.osei, contractor)`],
      ['Time', '14:58:19'],
      ['Then', '7 high-value secrets viewed'],
    ],
    trigger: { after: 'slack', delayMs: 2500, fallbackAt: 17 * 60 + 5 },
    notice: '🚨 SIEM alert (Critical): vault admin login from a contractor VPN session',
    chat: [
      'Okay, this is the moment the real SOC caught up. Alert: the Secret Server admin account logged in from a contractor\'s VPN address.',
      'First, how did they get admin? The logs show that VPN address reading a file on the IT share six minutes earlier.',
      'Open the Terminal on your PC. The share is mirrored at /mnt/fs-it01/IT. Search it for passwords.',
      'Then badge into the server room and work the case at the SOC console.',
    ],
    case: CASE,
  },
  {
    id: 'uber-analyst-phish',
    title: 'Password OK, MFA denied: analyst01 from Amsterdam',
    severity: 'High',
    rule: 'Correct password from a new country and an unknown device.',
    fields: [['Account', "analyst01 (that's you)"], ['Source IP', '203.0.113.90']],
    callout: 'You typed your password into the "re-verify your SSO" page. Copycat phishing always follows a public breach. MFA held this time because you denied the push.',
    trigger: { when: (st) => st.phishedAt() != null && st.minutes >= st.phishedAt() + 3 },
    notice: '🚨 SIEM alert: your password was used from Amsterdam',
    chat: ['Your phone just buzzed with a push you didn\'t ask for, right? Deny it. Someone has your password.', 'That "re-verify your SSO" email. Copycats show up within the hour of every public breach. Resetting you now.'],
  },
];
