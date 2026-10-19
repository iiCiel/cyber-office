// Case file: Change Healthcare 2024. Two conversations.
//   1. Ransomware is spreading through the data center. Per the CEO's May 2024 testimony, the company
//      severed connectivity to Change's data centers as soon as it found the ransomware on Feb 21.
//   2. The extortion question. The CEO testified that he made the decision to pay. The scoring rewards
//      the process (escalate, involve the FBI and counsel, plan without trusting the criminals), not a "right" answer.
// People in the replay are fictional roles played by the office crew.

export const SPREAD_CALL = {
  start: {
    say: [
      ['Theo (playing a data center engineer)', [
        'IT Security? We have a problem. Claims servers are throwing file errors, and file names are changing to random endings.',
        'It is moving between servers while I watch. The claims platform links our data centers to every pharmacy and hospital we serve.',
        'I can cut the links between the data centers and the outside right now. That takes claims offline for everyone. Or we keep trying to clean it live. Your call.',
      ]],
    ],
    choices: [
      { text: 'Cut the data center links and external connections now. We will rebuild from clean systems. Keep the machines powered on for forensics.', next: 'sever', set: { outcome: 'severed' } },
      { text: 'Reboot the affected servers and see if they come back clean. Keep claims running.', next: 'reboot', set: { outcome: 'rebooted' } },
      { text: 'Block only the one server that looks worst, and keep everything else up. Claims matter too.', next: 'partial', set: { outcome: 'partial' } },
    ],
  },
  sever: {
    say: [['Theo (playing a data center engineer)', [
      'Cutting the links. Claims will go dark for every pharmacy and hospital we serve. That is going to be loud.',
      'Machines stay on. I will pull the network, not the power.',
      '(The real company made this same call on Feb 21, 2024. The CEO later said it was "extremely disruptive" but "the right thing to do".)',
    ]]],
    end: true,
  },
  reboot: {
    say: [['Theo (playing a data center engineer)', [
      'Rebooting... Okay, three of them came back. Wait. They are encrypting again within a minute.',
      'And whatever was in memory is gone now. Was that a good idea?',
    ]]],
    end: true,
  },
  partial: {
    say: [['Theo (playing a data center engineer)', [
      'Blocked the worst server. Two more just started renaming files.',
      'It has valid admin credentials. It does not need that one server. It is just using what it can reach.',
    ]]],
    end: true,
  },
};

export const SPREAD_SCORE = {
  id: 'spread',
  area: 'People',
  title: 'Ransomware is spreading: cut the links or keep claims running?',
  max: 10,
  teaches: { skill: 'Contain ransomware fast, even when containment is painful', secplus: '4.8 Incident response: containment' },
  missing: { points: 3, what: 'It never came up.', why: '' },
  outcomes: {
    severed: { outcome: 'good', points: 10, what: 'You cut the data center links and kept the machines on.', why: 'This is what the real company did. Disconnecting stops the spread and the attacker\'s access, and leaving machines powered on keeps memory for forensics. It also took claims offline for pharmacies and providers nationwide. There is no free option, but a spreading encryptor with admin rights does not wait.', cost: { amount: 0, text: '' } },
    rebooted: { outcome: 'bad', points: 0, what: 'You rebooted the servers and kept claims running.', why: 'Rebooting does not remove an attacker who has admin rights, and it wipes the memory your investigators need. The encryption restarted within a minute. Isolate first, then investigate.', cost: { amount: 300000, text: 'More servers encrypted and forensic evidence lost (estimate for this replay)' } },
    partial: { outcome: 'ok', points: 3, what: 'You blocked one server and left the rest connected.', why: 'The attacker has valid admin accounts and was already moving. Blocking one host rarely stops that. When you cannot yet tell how far it went, isolate the whole environment and bring services back in stages.', cost: { amount: 150000, text: 'The encryption kept spreading while you waited (estimate for this replay)' } },
  },
};

export const EXTORTION_CALL = {
  start: {
    say: [
      ['Mike (playing an executive)', [
        'Security. I need to know where we are.',
        'Pharmacies cannot process claims. Hospitals are asking when we are back. The board is asking about the ransom note.',
        'Their page says pay and they will give us a decryptor and delete the data. Some people up here say pay it and be done by tonight.',
        'You know the technical picture. What do I tell leadership?',
      ]],
    ],
    choices: [
      { text: 'Do not contact them or pay on our own. Bring in the FBI, outside counsel and an incident response firm, and let leadership decide with that advice. Plan the recovery as if the decryptor will not work.', next: 'process', set: { outcome: 'process' } },
      { text: 'Pay it now before the data leaks. A decryptor gets us back faster, and the data gets deleted.', next: 'pay', set: { outcome: 'pay-now' } },
      { text: 'Never pay, ever. Ignore the note and do not tell anyone outside the company.', next: 'ignore', set: { outcome: 'ignore-all' } },
    ],
  },
  process: {
    say: [['Mike (playing an executive)', [
      'That is a slower answer than I wanted. But I can take it to the room.',
      'Counsel and the FBI first. We decide with the facts, not on a bad morning.',
      '(In the real incident the CEO testified that the decision to pay was his. He called it one of the hardest decisions he ever made.)',
    ]]],
    end: true,
  },
  pay: {
    say: [['Mike (playing an executive)', [
      'Okay. I will push for it today.',
      '...Wait. If they have our data and our word that they delete it, what stops them from keeping a copy? Nobody asked that.',
      '(In the real incident, the payment was made and the data was reportedly still used to extort the company again.)',
    ]]],
    end: true,
  },
  ignore: {
    say: [['Mike (playing an executive)', [
      'Fine. No contact, no outside help.',
      'But we may have breach notification duties, and the FBI wants to hear about this. Is hiding it really an option?',
    ]]],
    end: true,
  },
};

export const EXTORTION_SCORE = {
  id: 'extortion',
  area: 'People',
  title: 'The ransom note: pay, refuse, or decide properly?',
  max: 10,
  teaches: { skill: 'Handle extortion with leadership, law enforcement and counsel, not alone', secplus: '4.8 Incident response: communication and escalation' },
  missing: { points: 3, what: 'It never came up.', why: '' },
  outcomes: {
    process: { outcome: 'good', points: 10, what: 'You escalated it to leadership, the FBI and counsel, and planned the recovery without the decryptor.', why: 'Whether to pay is a business, legal and law enforcement decision, not a SOC call. The real CEO testified that the decision to pay was his. Reported figures put the payment at about $22 million. The gang then reportedly kept the money, and a second group later demanded payment for the same stolen data. Payment buys no guarantee.' },
    'pay-now': { outcome: 'bad', points: 0, what: 'You pushed to pay immediately.', why: 'Paying fast, on your own, with no counsel and no FBI, trusts criminals to delete data they can sell. Nothing forces them to. In the real case a second group reportedly held the data and demanded more. And it funds the next attack.', cost: { amount: 1000000, text: 'Money out the door with no guarantee, and no law enforcement help (estimate for this replay)' } },
    'ignore-all': { outcome: 'bad', points: 2, what: 'You refused to pay but kept it all quiet.', why: 'Refusing to pay can be a sound choice, but only when leadership, counsel and the FBI are in the loop. This is a health care company holding patient data. Breach notification rules and law enforcement help both depend on telling the right people quickly.', cost: { amount: 400000, text: 'Missed notification deadlines and no outside help (estimate for this replay)' } },
  },
};
