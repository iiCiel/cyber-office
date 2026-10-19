// Case file: MGM 2023. The phone call. Per widespread reporting (MGM never published the details), the
// attackers found an employee on LinkedIn and called the IT help desk pretending to be that person.
// This call is a dramatization of that idea, aimed at a second, more privileged target. The caller only
// uses facts you could find online or in an old data dump: name, job title, employee ID, manager.
//
// Fair play: whatever you do here, the caller also rings the rest of the help desk. In the replay one
// of them eventually gives in. That is how the reported attack went: it only takes one agent.

const CALLER = 'Caller · +1 (702) 555-0114';

export const VISHING_CALL = {
  start: {
    say: [
      [CALLER, [
        'Hi, help desk? This is Alex Nolan, Senior Identity Engineer.',
        'I got a new phone yesterday and the authenticator did not move over. I am locked out of everything.',
        'My employee ID is 41082. My manager is Rhea Calder. Can you reset my MFA and password so I can get in?',
      ]],
    ],
    choices: [
      { text: "You've got the ID, the title and the manager right. Resetting it now.", next: 'reset', set: { outcome: 'reset-on-details' } },
      { text: 'Quick security questions first: where did you go to school, and what city did you start in?', next: 'questions', set: { askedQuestions: true } },
      { text: "I'll verify you first. I'll call you back on the number in the directory, and your manager approves in the ticket.", next: 'callback', set: { askedCallback: true } },
      { text: 'Resets go through a ticket with manager approval. I will open one.', next: 'ticket' },
    ],
  },
  questions: {
    say: [[CALLER, ['Sure. Ohio State, and I started in Las Vegas in 2016. Easy.', 'Everything is on my LinkedIn, ha. Can we move on?']]],
    choices: [
      { text: 'Those match. Resetting it now.', next: 'reset', set: { outcome: 'reset-after-questions' } },
      { text: "Wait. If it's on your LinkedIn, it's on anyone's. I'll call you back on the directory number.", next: 'callbackq', set: { askedCallback: true } },
    ],
  },
  callback: {
    say: [[CALLER, ['Call me back? My old phone is dead, that is the problem.', 'Use this number instead: 702 555 0191. My manager is going to hear about this delay.']]],
    choices: [
      { text: 'Directory number only, and the manager approves in the ticket. That is the rule.', next: 'verify', set: { outcome: 'callback-verified' } },
      { text: 'Okay, I will call the number you just gave me.', next: 'attackernumber', set: { outcome: 'callback-attacker-number' } },
    ],
  },
  callbackq: {
    say: [[CALLER, ['Call me back? My old phone is dead, that is the problem.', 'Use this number instead: 702 555 0191. My manager is going to hear about this delay.']]],
    choices: [
      { text: 'Directory number only, and the manager approves in the ticket. That is the rule.', next: 'verify', set: { outcome: 'callback-after-questions' } },
      { text: 'Okay, I will call the number you just gave me.', next: 'attackernumber', set: { outcome: 'callback-attacker-number' } },
    ],
  },
  ticket: {
    say: [[CALLER, ['A ticket? Approval? It is Sunday. Rhea is not going to answer.', 'Just reset it. I will be in huge trouble if I am locked out during the weekend.']]],
    choices: [
      { text: "That's the process. When the manager approves, we will call you back on the directory number.", next: 'refused', set: { outcome: 'ticket-held' } },
      { text: 'Fine, fine. Resetting it now.', next: 'reset', set: { outcome: 'reset-under-pressure' } },
    ],
  },
  reset: {
    say: [
      [CALLER, ['Perfect, thank you. You are a lifesaver.']],
      ['You', ['(You reset his MFA and read out a temporary password. The line goes dead fast.)']],
    ],
    end: true,
  },
  attackernumber: {
    say: [
      ['You', ['(You call 702 555 0191. A voice answers on the first ring: "Yes, this is Alex.")']],
      [CALLER, ['See? Same person. Go ahead and reset.']],
      ['You', ['(Calling a number the caller gave you proves nothing. You reset his MFA anyway.)']],
    ],
    end: true,
  },
  verify: {
    say: [
      [CALLER, ['...Fine. Whatever.', '(click)']],
      ['You', ['(You look up Alex Nolan in the directory and call his mobile. He is at home, with his old phone in his hand.)']],
      ['Alex Nolan', ['Locked out? No. My phone works fine. I did not call you.', 'Wait. Someone is pretending to be me?']],
      ['Dana (help desk)', ['Hey. Same voice just called my line, asking for Alex too. I put him on hold. But there are six agents on today.', "In the replay, he keeps dialing until someone gives in. It only takes one."]],
    ],
    end: true,
  },
  refused: {
    say: [
      [CALLER, ['(He hangs up.)']],
      ['Dana (help desk)', ['Another one with that name just rang my line. I said ticket and manager approval too.', 'He will try the whole desk. In the replay, one agent gives in.']],
    ],
    end: true,
  },
};

export const VISHING_SCORE = {
  id: 'vishing',
  area: 'Phone call',
  title: 'The caller who says he has a new phone and needs an MFA reset',
  max: 15,
  teaches: { skill: 'Verify identity out-of-band before resetting MFA or passwords', secplus: '2.2 Threat vectors: vishing and impersonation' },
  missing: { points: 5, what: 'You never took the call.', why: 'The caller moved on to the next agent. In the replay, one of them gave in.' },
  outcomes: {
    'callback-verified': { outcome: 'good', points: 15, what: 'You refused to reset and called back on the directory number.', why: 'The gold standard: a channel the attacker does not control. This is the exact control CISA and Okta recommend for help desks. The real Alex had never called. Note the catch: one agent holding the line is not enough, because the caller simply tries the next agent. The process has to be the same for everyone.' },
    'ticket-held': { outcome: 'good', points: 12, what: 'You held the line and kept it on a ticket with manager approval.', why: 'Right. Manager approval and a callback make a social engineer\'s story useless. Still, the caller tries every agent, so the rule has to be enforced for the whole desk, ideally by the system and not just by good habits.' },
    'callback-after-questions': { outcome: 'ok', points: 9, what: 'You asked questions first, then caught yourself and called back.', why: 'Good catch in the end. Security questions whose answers sit on LinkedIn or in old data dumps do not verify anyone. The callback did the work.' },
    'reset-on-details': { outcome: 'bad', points: 0, what: 'You reset the account because the caller knew the ID, title and manager.', why: 'Those are the very details a caller can find online. Knowing facts is not proof of identity. Reportedly this is how the real attackers got in: a caller who knew enough about an employee.', cost: { amount: 250000, text: 'A second identity admin account is in attacker hands (estimate for this replay)' } },
    'reset-after-questions': { outcome: 'bad', points: 0, what: 'You reset it after the caller answered security questions.', why: 'He answered them instantly because the answers are public. Questions the internet can answer verify nobody.', cost: { amount: 250000, text: 'A second identity admin account is in attacker hands (estimate for this replay)' } },
    'reset-under-pressure': { outcome: 'bad', points: 0, what: 'You gave in to the pressure and reset it.', why: 'Urgency and a threat of "my manager will hear about this" are the standard tools of a social engineer. The process exists so you do not have to decide under pressure.', cost: { amount: 250000, text: 'A second identity admin account is in attacker hands (estimate for this replay)' } },
    'callback-attacker-number': { outcome: 'bad', points: 0, what: 'You called back on the number the caller gave you.', why: 'A callback only counts if the number comes from your own records, never from the caller. The attacker answered his own number.', cost: { amount: 250000, text: 'A second identity admin account is in attacker hands (estimate for this replay)' } },
  },
};
