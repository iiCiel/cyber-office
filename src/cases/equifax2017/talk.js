// Case file: Equifax 2017. Two conversations; people are fictional roles played by the office crew.
//   1. The ACIS app owner: take the portal down (with images) or patch and keep it up?
//      Real: Equifax took ACIS offline July 30 at 12:41 pm, and the forensics team imaged the environments.
//   2. The weekend escalation: who do you tell, and when? Real: the CSO emailed legal on July 30, the CEO
//      was told July 31, Mandiant and the FBI were brought in by Aug 2, and the public notice came Sept 7.

export const APP_CALL = {
  start: {
    say: [
      ['Theo (playing the ACIS app owner)', [
        'Hey. I saw the Countermeasures email.',
        'ACIS is live right now. Consumers are filing disputes. It is a Saturday, and I do not want an outage.',
        'The Struts version on it is old. I can patch it in about 20 minutes and restart. Or we can just block that one IP. What do you want?',
      ]],
    ],
    choices: [
      { text: 'Take ACIS offline for emergency maintenance. Image both servers first, then we patch and look for what was left behind.', next: 'offline', set: { outcome: 'offline-image' } },
      { text: 'Block that IP and keep ACIS up. We will look Monday.', next: 'block', set: { outcome: 'block-ip' } },
      { text: 'Patch Struts and restart right now. That closes the hole.', next: 'patch', set: { outcome: 'patch-restart' } },
    ],
  },
  offline: {
    say: [['Theo (playing the ACIS app owner)', ['Okay. Portal down, both servers imaged, nothing touched.', 'I will leave a maintenance page up. (Equifax took ACIS offline on July 30 for emergency maintenance, and imaged the environments.)']]],
    end: true,
  },
  block: {
    say: [['Theo (playing the ACIS app owner)', ['Blocked. Done in a minute.', "...Wait. Countermeasures says it might be more than one address. And whatever is on those servers stays on those servers. Hm."]]],
    end: true,
  },
  patch: {
    say: [['Theo (playing the ACIS app owner)', ['Patched. Restarted. The app is back.', 'Huh. The restart wiped the temp folders and the process list. I hope you did not need those.']]],
    end: true,
  },
};

export const APP_SCORE = {
  id: 'app',
  area: 'People',
  title: 'ACIS owner: patch and restart, or take it offline and image it?',
  max: 15,
  teaches: { skill: 'Contain first, preserve evidence, then fix', secplus: '4.8 Incident response: containment, evidence preservation' },
  missing: { points: 5, what: 'It never came up.', why: 'The portal stayed up while the attackers were inside.' },
  outcomes: {
    'offline-image': { outcome: 'good', points: 15, what: 'You took ACIS offline and imaged the servers first.', why: 'That is what Equifax did on July 30: portal offline for emergency maintenance, and the unexpected files on the servers were imaged for the forensic team. Patching comes after you know what is on the box. Equifax also found SQL injection and insecure direct object reference flaws in the ACIS code that day, so the Struts patch alone would not have been enough.' },
    'block-ip': { outcome: 'ok', points: 5, what: 'You blocked one IP and kept ACIS online.', why: 'Equifax also blocked an ISP early. It helps, but the report says the attackers used about 35 addresses, and the web shells were already on the servers. Blocking one source does not remove a backdoor someone already planted.', cost: { amount: 400000, text: 'Attackers keep access through other addresses (estimate for this replay)' } },
    'patch-restart': { outcome: 'bad', points: 0, what: 'You patched and restarted right away.', why: 'The patch closes the way in, but the attackers already have their web shells and the credentials from the file share. And the restart destroyed volatile evidence: running processes and temp files. You could not later say what was taken.', cost: { amount: 1500000, text: 'Lost evidence and a backdoor left in place (estimate for this replay)' } },
  },
};

export const ESCALATE_CALL = {
  start: {
    say: [
      ['Mike (playing the VP of IT operations)', [
        'I just heard. This is bad, but it is Saturday.',
        'We do not know yet how much was taken. Should we wake up the CIO, the lawyers and the executives tonight? Or wait until Monday when we have facts?',
        'Someone wants to post a note on the website too. Your call?',
      ]],
    ],
    choices: [
      { text: 'Escalate now: CIO, CSO, legal. Start the incident plan, and hire an outside forensics firm and call the FBI. Leave public wording to legal.', next: 'escalate', set: { outcome: 'escalate' } },
      { text: 'Wait until Monday. We should not alarm people before we have the facts.', next: 'wait', set: { outcome: 'wait' } },
      { text: 'Post a notice on the website tonight so people are warned.', next: 'post', set: { outcome: 'post-now' } },
    ],
  },
  escalate: {
    say: [['Mike (playing the VP of IT operations)', [
      'Calling them now. Legal will own the wording.',
      '(In the real incident the CSO emailed legal on July 30, the CEO was told July 31, and Mandiant and the FBI were contacted by August 2. The public notice came on September 7.)',
    ]]],
    end: true,
  },
  wait: {
    say: [['Mike (playing the VP of IT operations)', ['Okay. Monday, then.', '...Though if the attackers are copying data right now, Monday is two more days of it. And nobody is being told what to preserve.']]],
    end: true,
  },
  post: {
    say: [['Mike (playing the VP of IT operations)', ['Posting. Hmm. Legal just texted: who approved a public statement?', 'We do not know the scope yet. A wrong number here is a second mistake.']]],
    end: true,
  },
};

export const ESCALATE_SCORE = {
  id: 'escalate',
  area: 'People',
  title: 'Weekend escalation: who do you tell, and when?',
  max: 10,
  teaches: { skill: 'Escalate to legal and leadership, and bring in outside help', secplus: '4.8 Incident response: communication, escalation' },
  missing: { points: 3, what: 'It never came up.', why: '' },
  outcomes: {
    escalate: { outcome: 'good', points: 10, what: 'You escalated tonight and left the public wording to legal.', why: 'This is the right order: tell the people who can act (leadership, legal), start the incident plan, and get independent forensics. Equifax engaged Mandiant by August 2. Public notice is a legal and leadership decision, made when the scope is better known.' },
    wait: { outcome: 'bad', points: 0, what: 'You waited until Monday.', why: 'Two days of silence while the attackers might still be inside, with no one told to preserve evidence. A weekend is not a reason to delay an incident. Wake people up, then verify.', cost: { amount: 500000, text: 'Delayed response and lost evidence (estimate for this replay)' } },
    'post-now': { outcome: 'ok', points: 4, what: 'You wanted to post a public notice tonight.', why: 'The instinct to warn people is good, but public statements go through legal and leadership, and they need to be accurate. Equifax announced on September 7 with a number that later grew from 143 to about 148 million.' },
  },
};
