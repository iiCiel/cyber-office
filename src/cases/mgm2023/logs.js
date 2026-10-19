// Case file: MGM Resorts, September 2023. The logs the SOC would have had, rebuilt from public reporting.
//
// The chain this replay follows (sources in index.js):
//   a caller impersonating an employee -> the IT help desk resets that person's MFA (per widespread
//   reporting; MGM never published the exact method) -> the attacker signs in to the identity provider
//   (Okta) as that person -> a second, more privileged identity engineer is targeted the same way ->
//   a new Super Administrator -> a NEW identity provider that lets the attacker sign in as anyone
//   (Okta's published "cross-tenant impersonation" pattern) -> cloud admin (Azure) -> data theft ->
//   ransomware against the VMware ESXi hypervisors (ALPHV/BlackCat, as claimed by the group).
//
// Compression: the real call reportedly came days before MGM detected the attack on Sunday, Sep 10.
// This replay folds it into one Sunday morning. Hostnames, usernames and IPs are stand-ins: MGM never
// published its internal details or the attacker's IPs, so IPs come from the documentation ranges
// (RFC 5737). The event shapes follow what Okta, Azure AD, vCenter and ESXi really log.
//
// How the player's phone call shows up: whatever the player decides, the caller also tries the rest of the
// help desk ("it only takes one agent"). If the player resets the account, the reset is logged under
// analyst01. If not, a colleague (hd.rivera) gives in a few minutes later.

import { T, logBuilder, finishLogs } from '../../game/logkit.js';

export const DATE = { weekday: 'SUN', name: 'Sunday', month: 'Sep', day: 10 };
export const RING_DEFAULT = 8 * 60 + 35; // minute the desk phone rings if the engine never recorded it
const ATT_HOME = '198.51.100.40'; // the caller's "home" IP when they sign in
const ATT_INFRA = '203.0.113.55'; // the attacker's own infrastructure (rogue IdP, Azure)
const ATT_DROP = '203.0.113.80'; // where the stolen data goes
const HD_DESK = '10.30.5.21'; // help desk workstation subnet
const JUMP = '10.50.9.14';
const DOM = 'mgmresorts.com';

export const IP_INFO = {
  [ATT_HOME]: { where: 'Newark, United States', owner: 'Residential ISP (consumer broadband)', note: 'Never seen here before this morning. First used by d.voss minutes after the help desk reset his MFA. (Stand-in IP: the real attacker IPs were not published.)', external: true },
  [ATT_INFRA]: { where: 'Netherlands', owner: 'Rented VPS (bulletproof-style hosting)', note: 'Used by the new accounts and the new identity provider. Not an MGM address. (Stand-in IP.)', external: true },
  [ATT_DROP]: { where: 'Germany', owner: 'Rented VPS', note: 'Receives large HTTPS uploads from the file server and the SharePoint export. (Stand-in IP.)', external: true },
  [HD_DESK]: { where: 'Internal: help desk workstations', owner: 'Service desk VLAN', note: 'Where help desk agents work. An MFA reset from here is a help desk action, not the user.' },
  [JUMP]: { where: 'Internal: admin jump host pool', owner: 'jump-lv02', note: 'Admin sessions normally start here. Nobody was scheduled to use it this morning.' },
  '10.30.5.30': { where: 'Internal: help desk workstations', owner: 'hd-ws-07', note: 'Normal help desk workstation.' },
  '10.50.2.12': { where: 'Internal: server VLAN', owner: 'fs-corp01', note: 'The corporate file server.' },
  '10.60.1.5': { where: 'Internal: virtualization management', owner: 'vcsa-lv01', note: 'The vCenter server that manages every ESXi host.' },
  '10.60.2.5': { where: 'Internal: backup network', owner: 'bkp-lv01', note: 'The backup server. Runs snapshots every night by design.' },
  '192.0.2.10': { where: 'Las Vegas, United States', owner: 'Corporate office egress', note: 'Normal employee sign-ins come from here.' },
};

// When the second compromise starts (seconds since midnight), depending on what the player did on the phone.
export function resetTime(st) {
  const ring = st?.enc?.vishing?.ringingAt ?? RING_DEFAULT;
  const o = st?.enc?.vishing?.outcome;
  const byPlayer = ['reset-on-details', 'reset-after-questions', 'reset-under-pressure', 'callback-attacker-number'].includes(o);
  return { at: (ring + (byPlayer ? 3 : 9)) * 60, byPlayer };
}
// First minute at which every event of the chain is in the logs.
export const chainDoneMinute = (st) => Math.ceil(resetTime(st).at / 60) + 60;

const okta = (b, t, eventType, outcome, actor, ip, target, extra = {}, more = '') =>
  b.add(t, 'okta-prod', 'okta', `eventType=${eventType} outcome=${outcome} actor=${actor}@${DOM} client_ip=${ip}${target ? ` target=${target}` : ''}${more}`, { user: actor, ip, ...extra });

export function generateLogs({ nowMinutes = 24 * 60, st = null } = {}) {
  const b = logBuilder(2023);
  const { r, add } = b;

  // ---- Before the shift: the first compromise (overnight help desk) ----
  okta(b, T(5, 48, 20), 'user.mfa.factor.reset_all', 'SUCCESS', 'hd.night', HD_DESK, `d.voss@${DOM}`, { attack: true, key: 'reset-voss' }, ' displayMessage="Reset all MFA factors"');
  add(T(5, 48, 55), 'servicedesk', 'itsm', 'INC-21007 closed by hd.night: "MFA reset, new phone. Caller verified by employee ID and manager name. No callback made." category=access', { user: 'hd.night', ip: HD_DESK, attack: true, key: 'ticket-note' });
  okta(b, T(5, 49, 30), 'user.account.reset_password', 'SUCCESS', 'hd.night', HD_DESK, `d.voss@${DOM}`, { attack: true, key: 'pw-reset-voss' }, ' displayMessage="Reset password" temp_password=issued');
  okta(b, T(5, 53, 10), 'user.session.start', 'SUCCESS', 'd.voss', ATT_HOME, null, { attack: true, key: 'voss-login' }, ' geo="Newark, US" device=unknown_browser new_ip=true');
  okta(b, T(5, 55, 2), 'user.mfa.factor.activate', 'SUCCESS', 'd.voss', ATT_HOME, null, { attack: true, key: 'new-factor' }, ' factor=okta_verify device=new_phone');
  okta(b, T(6, 2, 40), 'user.authentication.sso', 'SUCCESS', 'd.voss', ATT_HOME, null, { attack: true }, ' app=servicedesk-portal');
  okta(b, T(6, 4, 12), 'user.authentication.sso', 'SUCCESS', 'd.voss', ATT_HOME, null, { attack: true }, ' app=sharepoint-it');
  add(T(6, 21, 3), 'servicedesk', 'itsm', 'Directory search by d.voss: "identity" "okta admin" results=4 viewed=a.nolan', { user: 'd.voss', ip: ATT_HOME, attack: true, key: 'recon-directory' });

  // ---- During the shift: the second reset (the call the player takes), then everything after it ----
  const { at: rs, byPlayer } = resetTime(st);
  const resetActor = byPlayer ? 'analyst01' : 'hd.rivera';
  okta(b, rs, 'user.mfa.factor.reset_all', 'SUCCESS', resetActor, byPlayer ? '10.30.5.30' : HD_DESK, `a.nolan@${DOM}`, { attack: true, key: 'reset-nolan' }, ' displayMessage="Reset all MFA factors"');
  okta(b, rs + 50, 'user.account.reset_password', 'SUCCESS', resetActor, byPlayer ? '10.30.5.30' : HD_DESK, `a.nolan@${DOM}`, { attack: true }, ' displayMessage="Reset password" temp_password=issued');
  okta(b, rs + 210, 'user.session.start', 'SUCCESS', 'a.nolan', ATT_HOME, null, { attack: true, key: 'nolan-login' }, ' geo="Newark, US" device=unknown_browser new_ip=true');
  okta(b, rs + 260, 'user.mfa.factor.activate', 'SUCCESS', 'a.nolan', ATT_HOME, null, { attack: true }, ' factor=okta_verify device=new_phone');
  okta(b, rs + 600, 'user.lifecycle.create', 'SUCCESS', 'a.nolan', ATT_HOME, `ops-sync-02@${DOM}`, { attack: true, key: 'acct-create' }, ' displayMessage="Create Okta user"');
  okta(b, rs + 660, 'user.account.privilege.grant', 'SUCCESS', 'a.nolan', ATT_HOME, `ops-sync-02@${DOM}`, { attack: true, key: 'super-admin' }, ' privilege="Super Administrator"');
  okta(b, rs + 840, 'user.session.start', 'SUCCESS', 'ops-sync-02', ATT_INFRA, null, { attack: true }, ' geo="Amsterdam, NL" device=unknown_browser new_ip=true');
  okta(b, rs + 1000, 'system.idp.lifecycle.create', 'SUCCESS', 'ops-sync-02', ATT_INFRA, 'idp="Corp-Backup-IdP" type=SAML2', { attack: true, key: 'rogue-idp' }, ' displayMessage="Create Identity Provider"');
  okta(b, rs + 1050, 'policy.rule.update', 'SUCCESS', 'ops-sync-02', ATT_INFRA, 'policy="IdP Routing" rule=Default', { attack: true, key: 'idp-routing' }, ' change="route all users to Corp-Backup-IdP"');
  add(rs + 1500, 'azure-ad', 'azure-audit', `Add member to role | role="Global Administrator" target=ops-sync-02@${DOM} initiatedBy=federated:Corp-Backup-IdP ip=${ATT_INFRA} result=success`, { user: 'ops-sync-02', ip: ATT_INFRA, attack: true, key: 'azure-ga' });
  for (let i = 0; i < 6; i++) {
    add(rs + 1620 + i * 20, 'm365', 'm365-audit', `Operation=FileDownloaded User=ops-sync-02@${DOM} Site=/sites/${b.pick(['Finance', 'HR-Records', 'Loyalty', 'Legal'])} Items=${300 + Math.floor(r() * 900)} ClientIP=${ATT_INFRA}`, { user: 'ops-sync-02', ip: ATT_INFRA, attack: true, key: i === 0 ? 'sp-bulk' : undefined });
  }
  let bytes = 90e6;
  for (let i = 0; i < 6; i++) {
    bytes *= 1.9 + r();
    add(rs + 2100 + i * 55, 'fw-edge', 'netflow', `flow src=10.50.2.12 dst=${ATT_DROP}:443 proto=tcp state=ACCEPT bytes=${Math.round(bytes)}`, { ip: ATT_DROP, attack: true, key: i === 0 ? 'exfil' : undefined });
  }
  add(rs + 2900, 'vcsa-lv01', 'vcenter', `event=UserLoginSessionEvent user=adm-nolan@vsphere.local src_ip=${JUMP} result=success method=password`, { user: 'adm-nolan', ip: JUMP, attack: true, key: 'vcenter-login' });
  const hosts = Array.from({ length: 12 }, (_, i) => `esx-lv-${String(i + 1).padStart(2, '0')}`);
  hosts.forEach((h, i) => add(rs + 3000 + i * 6, 'vcsa-lv01', 'vcenter', `event=HostSshEnabled host=${h} user=adm-nolan@vsphere.local src_ip=${JUMP}`, { user: 'adm-nolan', ip: JUMP, attack: true, key: i === 0 ? 'esxi-ssh' : undefined }));
  hosts.forEach((h, i) => add(rs + 3300 + i * 8, h, 'esxi-hostd', `Hostd: esxcli vm process kill --type=force count=${8 + Math.floor(r() * 14)} user=root src=${JUMP}`, { ip: JUMP, attack: true, key: i === 0 ? 'vm-kill' : undefined }));
  hosts.forEach((h, i) => {
    add(rs + 3360 + i * 8, h, 'esxi-shell', `ESXShell: datastore files renamed *.vmdk -> *.vmdk.<random-ext> count=${40 + Math.floor(r() * 80)}; note file README written in /vmfs/volumes/ (text paraphrased in this replay)`, { ip: JUMP, attack: true, key: i === 0 ? 'esxi-encrypt' : undefined });
  });
  add(rs + 3480, 'esx-lv-01', 'esxi-hostd', 'Hostd: ransomware note present in datastore root, 11 other hosts show the same file', { ip: JUMP, attack: true });

  // ---- If the player reset the account, the caller also got the colleague on the next line ----
  // (nothing extra: the same events happen either way; only the actor above differs)

  // ---- Ordinary Sunday morning: decoys and noise ----
  // Decoy: a legitimate MFA reset, with a callback noted in the ticket, from a known office IP afterwards.
  okta(b, T(4, 30, 10), 'user.mfa.factor.reset_all', 'SUCCESS', 'hd.night', HD_DESK, `k.mensah@${DOM}`, { key: 'decoy-reset' }, ' displayMessage="Reset all MFA factors"');
  add(T(4, 30, 40), 'servicedesk', 'itsm', 'INC-21003 closed by hd.night: "MFA reset, lost phone. Verified by callback to directory number and manager approval (R. Calder)." category=access', { user: 'hd.night', ip: HD_DESK });
  okta(b, T(4, 41, 3), 'user.session.start', 'SUCCESS', 'k.mensah', '192.0.2.10', null, {}, ' geo="Las Vegas, US" device=managed');
  okta(b, T(4, 42, 15), 'user.mfa.factor.activate', 'SUCCESS', 'k.mensah', '192.0.2.10', null, {}, ' factor=okta_verify device=new_phone');
  // Decoy: the backup server snapshots every VM every night, by design.
  for (let h = 1; h <= 12; h++) add(T(3, 0, 0) + h * 30, 'vcsa-lv01', 'vcenter', `event=VmSnapshotCreated host=esx-lv-${String(h).padStart(2, '0')} user=svc-veeam@vsphere.local src_ip=10.60.2.5 result=success`, { user: 'svc-veeam', ip: '10.60.2.5', key: h === 6 ? 'decoy-backup' : undefined });
  // People signing in as usual.
  for (const [u, at] of [['a.lindqvist', T(5, 30)], ['m.torres', T(6, 15)], ['c.beaumont', T(6, 45)], ['s.park', T(7, 20)], ['j.okafor', T(7, 50)]]) {
    okta(b, at, 'user.session.start', 'SUCCESS', u, '192.0.2.10', null, {}, ' geo="Las Vegas, US" device=managed');
    okta(b, at + 12, 'user.authentication.auth_via_mfa', 'SUCCESS', u, '192.0.2.10', null, {}, ' factor=okta_verify');
  }
  for (let tt = T(2, 3); tt < T(11, 30); tt += 500 + Math.floor(r() * 1700)) {
    add(tt, 'edge-web', 'sshd', `sshd[${3000 + Math.floor(r() * 3000)}]: Failed password for invalid user ${b.pick(['admin', 'root', 'test', 'oracle', 'ubuntu'])} from 45.95.147.236 port ${30000 + Math.floor(r() * 30000)} ssh2`, { ip: '45.95.147.236', noise: true });
  }

  return finishLogs(b.ev, { nowMinutes, date: DATE });
}

export const CASE = {
  id: 'case',
  area: 'SOC investigation',
  title: 'How did a help desk phone call end with the hypervisors encrypted?',
  max: 40,
  teaches: { skill: 'Trace an intrusion from a help-desk MFA reset to ransomware', secplus: '4.8 Incident response: analysis, containment' },
  verdicts: [
    { id: 'outage', text: 'A failed vSphere update or storage problem. The Okta activity is a coincidence.' },
    { id: 'helpdesk', text: 'Help desk social engineering: someone impersonating employees got their MFA reset, took over Okta admin accounts, added a rogue identity provider, took data and encrypted the ESXi hypervisors.' },
    { id: 'insider', text: 'An insider: the identity engineers did all of this themselves.' },
    { id: 'vpnbug', text: 'An outside attacker exploited a bug in the VPN and the Okta activity is unrelated.' },
  ],
  correctVerdict: 'helpdesk',
  wrongVerdictNotes: {
    outage: 'Outages do not enable SSH on 12 hosts, force-kill VMs and write note files. And look at the hours before: a new Super Administrator and a new identity provider.',
    insider: 'a.nolan and d.voss each had their MFA reset by the help desk, then signed in from the same new IP minutes later. The real owners were not the ones using those accounts.',
    vpnbug: 'Nothing here exploits software. Every step uses a legitimate login that the help desk handed out. Real reporting on this attack points to social engineering, not a VPN bug.',
  },
  actions: [
    { id: 'suspend', text: 'Suspend d.voss, a.nolan, ops-sync-02 and adm-nolan. Revoke every session and token they hold', good: true },
    { id: 'idp', text: 'Delete the rogue identity provider "Corp-Backup-IdP" and its routing rule, then audit every Super Administrator in Okta', good: true },
    { id: 'azure', text: 'Remove the new Global Administrator in Azure, review its audit log, and rotate break-glass credentials', good: true },
    { id: 'verify', text: 'Require verified identity before any help desk MFA or password reset: callback to the number on file or manager approval', good: true },
    { id: 'isolate', text: 'Cut the hypervisor management network and power down affected hosts on purpose, keeping disks for forensics', good: true },
    { id: 'ir', text: 'Engage the incident response firm, legal and law enforcement. Preserve logs and snapshots', good: true },
    { id: 'fido', text: 'Move admins to phishing-resistant MFA (FIDO2 security keys) and tighten Super Administrator rights', good: true },
    { id: 'resetonly', text: "Just reset d.voss's password and wait to see if it happens again", good: false, why: 'The attacker already has a new Super Administrator, a rogue identity provider and cloud admin. Resetting one password changes none of that.' },
    { id: 'negotiate', text: 'Contact the attackers right away to negotiate, before involving IR or legal', good: false, why: 'Whether to pay is a board-level decision made with counsel, IR and law enforcement. Starting a negotiation first, before scope or recovery options are known, takes that choice away.' },
    { id: 'wipe', text: 'Immediately wipe and reimage every ESXi host', good: false, why: 'That destroys the evidence you need and may destroy intact data. Isolate first, image what you can, then rebuild.' },
  ],
  primaryEvidence: { key: 'reset-voss', note: 'The key line: a help desk user.mfa.factor.reset_all for d.voss at 05:48, followed five minutes later by a login from a new IP and a new MFA device. The help desk ticket says "no callback made".' },
  keyEvidence: ['reset-voss', 'ticket-note', 'voss-login', 'new-factor', 'reset-nolan', 'nolan-login', 'super-admin', 'rogue-idp', 'idp-routing', 'azure-ga', 'exfil', 'esxi-ssh', 'esxi-encrypt'],
  containedRequires: ['suspend', 'idp'],
  costs: {
    contained: { amount: 3500000, text: 'Incident response firm, rebuilding identity and part of the virtual estate, days of reduced operations (estimate for this replay)' },
    breach: { amount: 38000000, text: 'Days of down systems, lost bookings, a rebuilt hypervisor estate, notifications and legal costs (estimate for this replay; MGM itself later reported a hit of about $100 million to one quarter\'s earnings)' },
  },
  perfectWhy: 'That is the reported chain: a phone call to the help desk, an MFA reset, a new Super Administrator, a rogue identity provider, cloud admin, data theft, then the hypervisors. Contain the accounts and the identity provider first, then deal with the hosts.',
  notSubmittedWhy: 'Nobody wrote it up. The attacker kept Okta Super Administrator and a rogue identity provider overnight.',
};

export const ALERTS = [
  {
    id: 'mgm-esxi',
    main: true,
    title: 'Mass VM power-off and file renames on ESXi hosts',
    severity: 'Critical',
    rule: 'More than 5 hosts: SSH enabled, VMs force-killed and datastore files renamed within 10 minutes.',
    fields: [
      ['Hosts', 'esx-lv-01 to esx-lv-12 (12 hosts)'],
      ['Account', 'adm-nolan@vsphere.local, from the jump host pool'],
      ['Pattern', 'esxcli vm process kill, then *.vmdk renamed, then a note file'],
      ['Impact', 'Slot, reservation and key-card back ends are down (in this replay)'],
    ],
    trigger: { when: (st, min) => (st.visited.includes('tickets') && min >= chainDoneMinute(st)) || min >= 10 * 60 + 40 },
    notice: '🚨 SIEM alert (Critical): ESXi hosts are being encrypted',
    chat: [
      'This is the moment MGM saw it. On Sunday Sep 10, 2023 the company says it found a cybersecurity issue and shut systems down.',
      'Do not start at the hypervisors. Work backward. Who logged in to vCenter? How did they get that account?',
      'Search the SIEM for user.mfa.factor.reset_all. Then badge into the server room and write up the case at the SOC console.',
    ],
    case: CASE,
  },
];
