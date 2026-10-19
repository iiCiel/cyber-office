// Case file: Target 2013. Two conversations. People are fictional roles played by the office crew.
//   1. A phone call from the offsite monitoring desk about the FireEye alerts. Per Bloomberg Businessweek, an offsite team
//      really did see the alerts and pass them on, and nothing happened. Here the decision is yours.
//   2. A walk-up from retail operations on Cyber Monday: contain now, or protect sales? No free option.

const MON = 'Monitoring desk (offsite) · +1 (612) 555-0142';

export const TRIAGE_CALL = {
  start: {
    say: [
      [MON, [
        'Hi, security? Monitoring desk. It is the FireEye alerts on app-stage01 again. Five now, since Saturday.',
        'Same host Symantec flagged Thursday. Two of them show a callback to an FTP server outside the network.',
        'Honestly, malware.binary is our noisiest signature. Lab machines trigger it all the time and we close them. Auto-delete is off, so it only alerts.',
        'It is Cyber Monday. What do you want us to do with it?',
      ]],
    ],
    choices: [
      { text: 'Treat it as a real incident. Escalate now, keep the alerts open, and I will look at what that server talks to.', next: 'escalated', set: { outcome: 'escalated' } },
      { text: 'Let me look first. What else has app-stage01 done?', next: 'look', set: { askedLook: true } },
      { text: 'Turn on FireEye auto-delete for it and move on.', next: 'autodelete', set: { outcome: 'autodelete' } },
      { text: 'It is the noisy signature, and it is Cyber Monday. Close them as false positives.', next: 'closed', set: { outcome: 'closed' } },
    ],
  },
  look: {
    say: [[MON, [
      'Okay. The server is in the application range, not a lab. No register should depend on it.',
      'It has accounts logging in from other machines overnight, and the alerts decode a plain-text FTP destination nobody has heard of.',
      'So? Real, or noise?',
    ]]],
    choices: [
      { text: 'That is not noise. Escalate it as an incident and keep everything as it is.', next: 'escalated2', set: { outcome: 'look-escalated' } },
      { text: 'Probably still a false positive. Close them.', next: 'closed', set: { outcome: 'closed' } },
    ],
  },
  escalated: {
    say: [[MON, ['Escalating. Alerts stay open. I will page the on-call lead and write this down in the ticket.', '(Per reporting, this step is the one that did not happen at Target.)']]],
    end: true,
  },
  escalated2: {
    say: [[MON, ['Escalating. Good, I was uneasy about the FTP callback. Alerts stay open.', '(Per reporting, this step is the one that did not happen at Target.)']]],
    end: true,
  },
  autodelete: {
    say: [[MON, ['Done. It will delete the file next time it sees it.', 'Do you want us to look at how it got there?']]],
    end: true,
  },
  closed: {
    say: [[MON, ['Closing all five as false positive. Thanks. Back to the holiday queue.', '(The FTP server is still out there. So is the malware.)']]],
    end: true,
  },
};

export const TRIAGE_SCORE = {
  id: 'triage',
  area: 'Phone call',
  title: 'Five FireEye alerts on one server, and a callback to an outside FTP host',
  max: 15,
  teaches: { skill: 'Escalate alert patterns on one asset instead of closing them by signature name', secplus: '4.4 Alerting and monitoring' },
  missing: { points: 5, what: 'You never took the call.', why: 'The alerts stayed in the queue as NEW. Per the Senate staff report, that is what happened at Target.' },
  outcomes: {
    escalated: { outcome: 'good', points: 15, what: 'You escalated the alerts as an incident.', why: 'Right. Five alerts on one server, a decoded callback to an outside FTP host and an antivirus flag on the same machine is a pattern. The Senate staff report says Target missed several chances to act on exactly these warnings, and could have caught the attack at installation.' },
    'look-escalated': { outcome: 'good', points: 13, what: 'You checked what the server had done, then escalated.', why: 'Good habit: look at the asset, not the signature name. Same result, a little slower. In a breach, minutes matter.' },
    autodelete: { outcome: 'ok', points: 7, what: 'You turned on auto-delete and moved on.', why: 'Blocking helps: reporting says FireEye could have deleted the malware automatically and that setting was off. But deleting a file is not an investigation. How did it get there? What else is on the network? The attackers had also changed their malware several times.', cost: { amount: 2000000, text: 'Attackers re-deploy another variant and keep going (estimate for this replay)' } },
    closed: { outcome: 'bad', points: 0, what: 'You closed the alerts as false positives.', why: 'This is the reported mistake. A signature can be noisy, but this host is not a lab machine, and the alert decoded an outside FTP destination. Per the Senate staff report, Target\'s team did not respond to multiple FireEye warnings while the attackers kept stealing cards.', cost: { amount: 20000000, text: 'Another two weeks of card theft before anyone notices (estimate for this replay)' } },
  },
};

export const FREEZE_TALK = {
  start: {
    say: [
      ['Mike (playing retail operations)', [
        'Security? I heard you are looking at the registers. It is Cyber Monday. We are in a change freeze until after Christmas.',
        'I am not pulling registers off the network, and I am not letting anyone push changes to stores today.',
        'Tell me straight. Is it real? And what do you need from me?',
      ]],
    ],
    choices: [
      { text: 'Real. Block outbound FTP to anything not approved, isolate the staging server, keep the registers selling, and sweep them store by store with a plan.', next: 'surgical', set: { outcome: 'surgical' } },
      { text: 'Block the FTP traffic only. Leave the servers and registers alone for now.', next: 'ftponly', set: { outcome: 'ftp-only' } },
      { text: 'Pull every register offline until they are clean.', next: 'pullall', set: { outcome: 'pull-all' } },
      { text: 'Then we wait for the freeze to lift. I will log a ticket.', next: 'wait', set: { outcome: 'wait' } },
    ],
  },
  surgical: {
    say: [['Mike (playing retail operations)', ['That I can live with. Sales keep running, and you are not touching stores blindly.', 'Tell me which stores first. (Target removed the malware from nearly all registers on Dec 15, once the Justice Department had called.)']]],
    end: true,
  },
  ftponly: {
    say: [['Mike (playing retail operations)', ['Fine by me, it costs nothing.', '...But if the malware is still on the registers, and the staging server is still up, what stops them from picking a new drop server tomorrow?']]],
    end: true,
  },
  pullall: {
    say: [['Mike (playing retail operations)', ['Every register, on Cyber Monday? Stores will be cash only. The CEO will be calling you.', 'You do not even know how many are infected, do you?']]],
    end: true,
  },
  wait: {
    say: [['Mike (playing retail operations)', ['Good. I did not want to have this conversation anyway.', '...Wait. If it is real, every day we wait is more cards, isn\'t it? Write that down somewhere.']]],
    end: true,
  },
};

export const FREEZE_SCORE = {
  id: 'freeze',
  area: 'People',
  title: 'Cyber Monday and a change freeze: contain now, or protect sales?',
  max: 10,
  teaches: { skill: 'Contain an active breach in proportion to the business impact', secplus: '4.8 Incident response: containment' },
  missing: { points: 3, what: 'It never came up.', why: '' },
  outcomes: {
    surgical: { outcome: 'good', points: 10, what: 'You blocked the exit and isolated the staging server, and kept the registers selling.', why: 'A proportionate answer. Stop the uploads and the data collection point, keep the evidence, and clean the registers in a plan. A change freeze is for routine changes. It does not cover an active breach.' },
    'ftp-only': { outcome: 'ok', points: 6, what: 'You blocked the FTP traffic and left everything else alone.', why: 'It stops this leak, which matters. But the registers still scrape cards and the staging server still holds them. The attackers had already changed the malware and the drop servers more than once, so they can just choose another route.', cost: { amount: 3000000, text: 'Attackers switch to another drop server (estimate for this replay)' } },
    'pull-all': { outcome: 'ok', points: 5, what: 'You pulled every register offline.', why: 'It would stop the card theft, but on Cyber Monday it costs a huge amount of sales and you do not yet know the scope. Reboots and cleaning without imaging destroy evidence. Proportionate beats panicked.', cost: { amount: 12000000, text: 'Lost sales across stores on Cyber Monday (estimate for this replay)' } },
    wait: { outcome: 'bad', points: 0, what: 'You waited for the freeze to lift.', why: 'In the real breach, card data was taken from Nov 27 to Dec 15, and uploads continued until the Justice Department called on Dec 12. Every day of waiting means more stolen cards.', cost: { amount: 25000000, text: 'Weeks of additional card theft and a far larger breach (estimate for this replay)' } },
  },
};
