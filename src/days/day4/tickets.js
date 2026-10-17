// Day 4 helpdesk tickets. The backup one matters a lot on Friday.
export const TICKETS = [
  {
    id: 'backup',
    num: 4580,
    title: 'BACKUP01: nightly backup FAILED (4 nights in a row)',
    from: 'monitoring@halcyonmutual.com (automated)',
    via: 'Monitoring system, Thu 01:00 AM',
    priority: 'Normal (auto)',
    facts: [['Job', 'Nightly-Full'], ['Error', 'Insufficient free space on E: (12 MB free)'], ['Last good backup', 'Sun Oct 18, 02:41']],
    body: ['Job "Nightly-Full" failed on BACKUP01.', 'This alert has repeated every night since Monday. Nobody has acknowledged it.'],
    teaches: { skill: 'Backups only count if they run and restore', secplus: '3.4 Resilience and recovery: backups' },
    options: [
      { id: 'fix', text: 'Expand the backup volume, run the backup tonight, and do a test restore tomorrow morning', outcome: 'good', points: 10, why: 'A backup you have never restored is a hope, not a backup. Now there is a fresh, tested copy.', reply: 'Dana: Volume expanded. Backup is running. Test restore booked for 8 AM.' },
      { id: 'delete', text: 'Delete the oldest backups to free up space', outcome: 'ok', points: 5, why: 'It runs again, but you threw away restore points, and you still haven\'t tested a restore.', reply: 'Dana: Done. We have 3 days of history instead of 30.' },
      { id: 'snooze', text: 'Snooze the alert for a week. Backups are IT\'s problem.', outcome: 'bad', points: 0, why: 'Four nights with no backup and counting. If anything breaks this week, the newest copy is from Sunday.', reply: '(The alert goes quiet.)' },
    ],
  },
  {
    id: 'forward',
    num: 4583,
    title: 'Auto-forward my work email to Gmail',
    from: 'Theo Okoye (Developer)',
    via: 'Helpdesk portal, from WS-0127, Thu 8:31 AM',
    priority: 'Low',
    facts: [['Request', 'Forward all mail to theo.okoye.dev@gmail.com']],
    body: ['Outlook on my phone is slow. Can you set up auto-forwarding of all my work email to my personal Gmail?', 'Easier to keep up after hours.'],
    teaches: { skill: 'Keep company data out of personal accounts', secplus: '3.3 Data protection: data loss prevention' },
    options: [
      { id: 'allow', text: 'Set up the forwarding rule', outcome: 'bad', points: 0, why: 'All his mail, including customer data, would live in a personal account we can\'t protect. A forwarding rule is exactly what the attacker used on Mike on Tuesday.', reply: 'Theo: Thanks!' },
      { id: 'mdm', text: 'Decline; set up the managed mail app on his phone instead', outcome: 'good', points: 10, why: 'Solves his real problem (mail on his phone) and the data stays under our control.', reply: 'Theo: Oh, that works. Didn\'t know we had that.' },
      { id: 'some', text: 'Forward only mail from the dev team', outcome: 'ok', points: 4, why: 'Less data leaks, but it still leaks into an account we can\'t protect or wipe.', reply: 'Theo: Good enough.' },
    ],
  },
];
