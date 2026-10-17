// Day 5 (Friday) emails. The ransom note itself arrives mid-morning (not phishing: it's the real attacker).
// One last phish (a fake "security alert" that's really a lure), and two real: Priya's war-room note and
// the backup test-restore result (which depends on Thursday's ticket).
const t = (h, m) => h * 60 + m;
const ME = 'analyst01@halcyonmutual.com';

export function emailsFor(carry = {}) {
  const restore = carry.d4BackupFixed
    ? {
        id: 'restore-result',
        at: t(8, 15),
        from: { name: 'Dana Kowalski', address: 'dana.k@halcyonmutual.com' },
        to: 'secops@halcyonmutual.com',
        subject: 'Test restore: PASSED ✓',
        external: false,
        phish: false,
        body: ['Morning! The 8 AM test restore worked.', 'We restored last night\'s backup of the HR and Finance shares to a spare server and the files opened fine.', 'So: we have a known-good, tested backup from a few hours ago. Just so you know it\'s there.', 'Dana'],
        headers: internal('dana.k@halcyonmutual.com', 'A71C0D02', '08:15:11'),
        notes: { 'Received:': "From Dana's workstation." },
        verdictNote: 'Real, and it may save the company today: a fresh, tested backup exists because you fixed the backup ticket on Thursday.',
        teaches: { skill: 'A tested restore is worth more than any backup', secplus: '3.4 Resilience and recovery: testing backups' },
      }
    : {
        id: 'restore-result',
        at: t(8, 15),
        from: { name: 'Dana Kowalski', address: 'dana.k@halcyonmutual.com' },
        to: 'secops@halcyonmutual.com',
        subject: 'Backups: still failing',
        external: false,
        phish: false,
        body: ['Heads up: BACKUP01 is still failing (disk full). Newest good backup is from Sunday.', 'Nobody actioned the ticket this week. I\'ll try to fix it today but I\'m slammed.', 'Dana'],
        headers: internal('dana.k@halcyonmutual.com', 'A71C0D02', '08:15:11'),
        notes: { 'Received:': "From Dana's workstation." },
        verdictNote: 'Real, and a warning: the newest backup is five days old, because the backup ticket was never fixed.',
        teaches: { skill: 'Untested backups fail when you need them', secplus: '3.4 Resilience and recovery: testing backups' },
      };

  return [
    {
      id: 'warroom',
      at: t(7, 55),
      from: { name: 'Priya Raman', address: 'priya.raman@halcyonmutual.com' },
      to: 'secops@halcyonmutual.com',
      subject: 'Heads up for today',
      external: false,
      phish: false,
      body: [
        'Morning. I have a bad feeling about today, so: our incident runbook is pinned in the Terminal at /home/analyst01/runbook.txt.',
        'If something big happens, the order is: ISOLATE, then INVESTIGATE, then RECOVER. In that order.',
        'You\'ve had a hell of a first week. Whatever happens, keep your head.',
        'Priya',
      ],
      headers: internal('priya.raman@halcyonmutual.com', '6D02F401', '07:55:03'),
      notes: { 'Received:': "From Priya's workstation." },
      verdictNote: 'Real, and the most useful email of the week. ISOLATE, INVESTIGATE, RECOVER.',
      teaches: { skill: 'Know your incident response order', secplus: '4.8 Incident response: preparation and process' },
    },
    restore,
    {
      id: 'fake-alert',
      at: t(8, 35),
      from: { name: 'Microsoft Defender', address: 'alerts@microsoft-defender-security.com' },
      to: ME,
      subject: '⚠ Threat detected on your device - immediate action required',
      external: true,
      phish: true,
      body: [
        'Microsoft Defender has detected ransomware activity on WS-0142.',
        'To remove the threat, download and run the official removal tool:',
        { link: 'tool', text: 'Download Defender Removal Tool.exe', href: 'http://microsoft-defender-security.com/tool/MSDefender_Removal.exe' },
        'Do not restart your computer until the tool has finished.',
      ],
      headers: [
        'Return-Path: <alerts@microsoft-defender-security.com>',
        'Received: from mx.microsoft-defender-security.com (198.51.100.26)',
        '  by mail01.halcyonmutual.com (Postfix) with ESMTP id 4D9A1E55;',
        '  Fri, 23 Oct 2026 08:35:20 -0400 (EDT)',
        'Authentication-Results: mail01.halcyonmutual.com;',
        '  spf=pass smtp.mailfrom=microsoft-defender-security.com;',
        '  dkim=none; dmarc=none header.from=microsoft-defender-security.com',
        'From: Microsoft Defender <alerts@microsoft-defender-security.com>',
        'Subject: Threat detected on your device - immediate action required',
      ],
      notes: {
        'Return-Path:': 'Not a Microsoft domain. Microsoft Defender does not email you .exe files to run.',
        'Received:': '198.51.100.26: the same hosting block as this week\'s attacks. They\'re using the chaos as cover.',
      },
      verdictNote: 'Phishing. On the day of a real incident, a fake "antivirus" email tells you to run their .exe. That IS the ransomware. Defender never emails you a tool to download.',
      macroCost: { amount: 20000, text: "Run the attacker's \"removal tool\": a second ransomware payload" },
      teaches: { skill: 'Stay calm: attackers use a crisis as cover', secplus: '2.4 Indicators of malicious activity' },
    },
  ];
}

function internal(from, id, time) {
  return [
    `Return-Path: <${from}>`,
    'Received: from WS.halcyonmutual.com (10.0.4.20)',
    `  by mail01.halcyonmutual.com (Postfix) with ESMTPS id ${id};`,
    `  Fri, 23 Oct 2026 ${time} -0400 (EDT)`,
    'Authentication-Results: mail01.halcyonmutual.com;',
    '  spf=pass smtp.mailfrom=halcyonmutual.com; dkim=pass; dmarc=pass',
    `From: ${from}`,
  ];
}

export const PAGES = {
  tool: {
    kind: 'macro-doc',
    url: 'http://microsoft-defender-security.com/tool/MSDefender_Removal.exe',
    title: 'MSDefender_Removal.exe',
    note: 'This file is not signed by Microsoft. Windows SmartScreen blocked it once.',
    lines: ['Microsoft Defender Removal Tool', 'Click "Run anyway" to remove the threat.'],
    afterEnable: 'A progress bar fills to 100%... and every file on your desktop sprouts a .halcyon-locked extension. That was the ransomware.',
  },
};

export const REPLY_DRAFTS = {
  warroom: 'Got it. ISOLATE, INVESTIGATE, RECOVER.',
  'fake-alert': 'Is this real?',
  'restore-result': 'Thanks Dana.',
};
