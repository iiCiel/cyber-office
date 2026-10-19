// Day 5 logs: the ransomware. The attacker uses the foothold they've built all week.
//   03:40  svc_backup logs on to FILE01 again (if it was never disabled Thursday) OR a new account if it was
//   03:45  a scheduled task is created on DC01 to run a payload across every machine (GPO push)
//   09:10  (in-game, after the alert) files start getting encrypted: *.halcyon-locked everywhere
// The ransom note (README_RESTORE.txt) is written to every share.
// Recovery depends on the week: a tested backup (Thu) = clean recovery; old backup = partial; none = pay or lose it.

import { T, logBuilder, finishLogs, backgroundNoise } from '../../game/logkit.js';

export const DATE = { weekday: 'FRI', name: 'Friday', month: 'Oct', day: 23, year: 2026, domain: 'halcyonmutual.local', netbios: 'HALCYON' };
export const C2 = '203.0.113.45';
export const RANSOM_IP = '91.219.236.14';

export const IP_INFO = {
  '203.0.113.45': { where: 'Moldova', owner: 'AS-KRANNET hosting', note: 'The C2 server all week: USB stick, invoice, svc_backup theft. Now pushing ransomware.', external: true },
  '91.219.236.14': { where: 'unknown (Tor)', owner: 'Tor exit relay', note: 'Where the ransom payment site is hosted.', external: true },
};

export function generateLogs({ nowMinutes = 24 * 60, carry = {}, alertAt = null } = {}) {
  const b = logBuilder(1023);
  const { add, ok, proc } = b;
  const svcDisabled = carry.d4Contained; // Thursday shut svc_backup down
  const actor = svcDisabled ? 'admin_helpdesk' : 'svc_backup';
  const actorNote = svcDisabled ? 'a different account (the attacker made a new admin after Thursday)' : 'the svc_backup account that was never disabled';

  // Pre-dawn: the attacker stages the ransomware.
  add(T(3, 40, 2), 'vpn01', 'openvpn', `openvpn[1187]: ${C2}:53900 [${actor}] Peer Connection Initiated with [AF_INET]${C2}:53900`, { ip: C2, user: actor, attack: true, key: 'vpn-in' });
  ok(T(3, 42, 10), actor, '172.16.0.95', 'DC01', 10, { attack: true, key: 'dc-logon', note: actorNote });
  proc(T(3, 45, 0), 'dc01', actor, 'C:\\Windows\\System32\\schtasks.exe', 'schtasks /create /tn "Updater" /tr "\\\\dc01\\sysvol\\p.exe" /sc once /ru SYSTEM /s *.halcyonmutual.local', 'C:\\Windows\\System32\\cmd.exe', { attack: true, key: 'schtask' });
  proc(T(3, 46, 20), 'dc01', actor, 'C:\\Windows\\System32\\vssadmin.exe', 'vssadmin delete shadows /all /quiet', 'C:\\Windows\\System32\\cmd.exe', { attack: true, key: 'shadowdelete' });

  // Morning detonation (scaled to when the alert fires, ~09:08).
  const boom = alertAt != null ? alertAt * 60 : T(9, 8);
  proc(boom, 'file01', 'SYSTEM', 'C:\\Windows\\Temp\\p.exe', 'p.exe --encrypt --ext .halcyon-locked --note README_RESTORE.txt', 'C:\\Windows\\System32\\svchost.exe', { attack: true, key: 'ransom-proc' });
  add(boom + 6, 'file01', 'smbd_audit', `SYSTEM|127.0.0.1|rename|ok|Shared/Claims/2026/Q4_summary.xlsx -> Q4_summary.xlsx.halcyon-locked`, { attack: true, key: 'first-encrypt' });
  add(boom + 9, 'edr', 'defender', `edr: ALERT behavior:Win32/Ransom.Gen on FILE01 process p.exe (mass file rename, shadow copies deleted) severity=Critical`, { attack: true, key: 'edr-alert' });
  add(boom + 30, 'dc01', 'edr', `edr: p.exe launched on 41 hosts via scheduled task "Updater"`, { attack: true, key: 'spread' });

  // Everyone's normal Friday morning (number matching on, if Tuesday's write-up was good).
  backgroundNoise(b, {
    arrivals: [
      ['priya.r', T(7, 20)],
      ['dana.k', T(6, 0)],
      ['t.okoye', T(8, 0)],
      ['c.reyes', T(8, 5)],
      ['m.chen', T(8, 22)],
    ],
  });
  ok(T(6, 9, 0), 'analyst01', '10.0.4.142', 'WS-0142', 2);
  return finishLogs(b.ev, { nowMinutes, date: DATE });
}

export const CASE = {
  id: 'case',
  area: 'Incident',
  title: 'Ransomware on FILE01, spreading',
  max: 40,
  question: 'This is live. What do you do FIRST?',
  teaches: { skill: 'Run the incident response order: isolate, investigate, recover', secplus: '4.8 Incident response process' },
  verdicts: [
    { id: 'pay', text: 'Pay the ransom quietly to make it stop.' },
    { id: 'isolate', text: 'ISOLATE first: cut the spread (network containment), THEN investigate and recover from backup.' },
    { id: 'wipe', text: 'Wipe and rebuild every machine right now.' },
  ],
  correctVerdict: 'isolate',
  wrongVerdictNotes: {
    pay: 'Paying funds the attackers, breaks the law in some cases, and often gets you a broken decryptor. It\'s the last resort, not the first move. Isolate first.',
    wipe: 'Wiping before you isolate lets it keep spreading from the machines you haven\'t reached yet, and destroys the evidence of how they got in.',
  },
  actions: [
    { id: 'isolate-net', text: 'Isolate FILE01 and the affected hosts from the network (pull them off / block at the switch)', good: true },
    { id: 'disable-task', text: 'Delete the "Updater" scheduled task on DC01 and block the C2 IP', good: true },
    { id: 'kill-accounts', text: 'Disable the attacker\'s account and reset the domain admin passwords', good: true },
    { id: 'restore', text: 'Recover encrypted shares from the most recent good backup', good: true },
    { id: 'legal', text: 'Notify Legal, leadership and (as required) regulators and law enforcement', good: true },
    { id: 'pay-ransom', text: 'Pay the ransom to get the decryptor', good: false, why: 'You have other options today. Paying is the last resort, and it funds next week\'s attack on someone else.' },
    { id: 'email-all', text: 'Email all staff the technical details immediately', good: false, why: 'If email is compromised the attacker reads it too. Use an out-of-band channel, and keep the detail in the incident bridge.' },
  ],
  primaryEvidence: { key: 'schtask', note: 'The key evidence is the scheduled task "Updater" on DC01 at 03:45: that is how it reached 41 machines at once.' },
  keyEvidence: ['schtask', 'ransom-proc', 'spread', 'shadowdelete', 'vpn-in', 'edr-alert'],
  containedRequires: ['isolate-net', 'disable-task'],
  // Cost depends on the week's backups (set in day5 index via extra()).
  costs: {
    contained: { amount: 20000, text: 'Contained and recovered from backup' },
    breach: { amount: 480000, text: 'The whole company encrypted; days of downtime' },
  },
  perfectWhy: 'Textbook incident response: isolate the spread, kill the scheduled task and C2, reset the accounts, then recover from a clean backup. This is the day the week pays off.',
  notSubmittedWhy: 'Nobody ran the response. The ransomware encrypted everything it could reach.',
};

export const ALERTS = [
  {
    id: 'ransomware-file01',
    main: true,
    title: 'Ransomware detected on FILE01, spreading to 41 hosts',
    severity: 'Critical',
    rule: 'EDR behavioral detection: mass file rename + shadow copy deletion, plus a scheduled task pushed domain-wide.',
    fields: [
      ['First host', 'FILE01'],
      ['Spreading via', 'scheduled task "Updater" on DC01'],
      ['Hosts hit', '41 and climbing'],
      ['Extension', '.halcyon-locked'],
      ['Source', `VPN from ${C2}`],
    ],
    trigger: { after: 'inbox', delayMs: 2500, fallbackAt: 9 * 60 + 20 },
    notice: '🔥 CRITICAL: ransomware spreading across the network',
    chatFrom: 'Priya (URGENT)',
    chat: [
      "It's happening. Ransomware on FILE01, jumping to other machines RIGHT NOW.",
      'Runbook order: ISOLATE, INVESTIGATE, RECOVER. Server room, SOC console, GO.',
      'Every second counts. Submit the response and I\'ll push the buttons.',
    ],
    case: CASE,
  },
];
