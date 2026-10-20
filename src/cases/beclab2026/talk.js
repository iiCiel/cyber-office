// Lab: Halcyon Mutual BEC. Two walk-up conversations, each a real decision:
//   1. Wire it now because the "CFO" said so, or verify the bank change on a known number first (Mike, finance)
//   2. Tell the real vendor and the bank now, or wait until we are "sure" (Dana, who has the bank's fraud desk on the line)
// The people are the game's cast playing roles.

const MIKE = 'Mike (playing the finance director)';
const DANA = 'Dana (playing the IT and identity admin)';

export const WIRE_TALK = {
  start: {
    say: [
      [MIKE, [
        'Security, I need a quick answer. Evelyn emailed me at 9:10: release the Tidewater wire, $184,350, before the 11:00 cutoff. She says she is on a plane and cannot talk.',
        'Rosa says the vendor is chasing us too. The bank details were updated Wednesday and Thursday\'s smaller payment went to the new account without a problem on our side.',
        'If we miss the cutoff it goes Monday, and Tidewater cleans our building and runs our badge system. Can I just send it?',
      ]],
    ],
    choices: [
      { text: 'Hold the wire. Verify the bank details with Tidewater by calling the number in the signed contract (not the email), and confirm with Evelyn on a known number or in person. Missing the cutoff costs nothing next to a lost wire.', next: 'verify', set: { outcome: 'verify' } },
      { text: 'Send it. The CFO asked, and we can sort out the rest on Monday.', next: 'send', set: { outcome: 'sent' } },
      { text: 'Ask Rosa to confirm by email that the vendor really changed the account.', next: 'rosa', set: { outcome: 'ask-rosa' } },
      { text: 'Send half now and the rest after we hear back.', next: 'half', set: { outcome: 'half' } },
    ],
  },
  verify: {
    say: [
      [MIKE, ['...Okay. I will not like telling Evelyn. But yes, the number in the contract. Marcus Webb is the AR contact. I will call him myself.']],
      ['You', ['(You explain the email trail: the bank-change mail came from tidewater-facilities-ap.example, a different domain; the "CFO" email came from halcyonmutual-invoices.example, a domain registered days ago, sent from the same server. Urgent, secret, and "I cannot talk" are the shape of BEC. A callback on a number you already had is the control that works.)']],
      [MIKE, ['Marcus says they have not changed anything and are waiting for last Thursday\'s payment. So Thursday\'s $42,600 went to the wrong place. I am calling the bank.']],
    ],
    end: true,
  },
  send: {
    say: [
      [MIKE, ['Sending it now. Thanks.']],
      ['You', ['(The wire goes to an account the attacker controls. Wires are fast and hard to recall; the first hours matter most. The "CFO" email was a lookalike domain, and nobody checked the bank details with the vendor on a known number.)']],
    ],
    end: true,
  },
  rosa: {
    say: [
      [MIKE, ['I will email her. She "confirmed" it on Tuesday, so she can confirm again.']],
      ['You', ['(Rosa\'s mailbox is the one the attacker is using. A confirmation from it, or from the same "vendor" email thread, proves nothing, and email is exactly the channel that is compromised. Verify out of band: a call to a number you already had.)']],
    ],
    end: true,
  },
  half: {
    say: [
      [MIKE, ['Half and half. That seems safe.']],
      ['You', ['(There is no safe half of a wire to a fraudster\'s account. $92,175 is gone, and the real vendor is still unpaid. The control is verification before sending, not splitting the loss.)']],
    ],
    end: true,
  },
};

export const WIRE_SCORE = {
  id: 'wire',
  area: 'People',
  title: 'The CFO who needs the wire now',
  max: 15,
  teaches: { skill: 'Verify a payment or bank-detail change out of band on a known number, whatever the urgency', secplus: '5.2 Risk management; 2.2 Threat vectors: business email compromise' },
  missing: { points: 5, what: 'Mike never came to you about the wire.', why: 'In a real BEC the pressure arrives close to the cutoff and from someone senior. The answer has to be ready before they ask.' },
  outcomes: {
    verify: { outcome: 'good', points: 15, what: 'You held the wire and verified on a known number.', why: 'Right. This is the single control that stops most BEC wire fraud: a callback to a number from your own records, not from the email, plus a second approver for any change in bank details. The FBI\'s own advice for BEC is to verify payment changes by a separate, known channel.' },
    half: { outcome: 'bad', points: 0, what: 'You sent half the wire.', why: 'Half of a fraud is still a fraud. Verification comes before any money moves, not as a way of splitting it.', cost: { amount: 92175, text: 'Half of the Tidewater wire sent to the attacker\'s account (estimate for this lab)' } },
    'ask-rosa': { outcome: 'bad', points: 0, what: 'You asked Rosa to confirm by email.', why: 'Rosa\'s mailbox is the compromised one. A "confirmation" sent from or into it is whatever the attacker wants, and the real vendor\'s replies are being hidden by a rule. Verify by phone, on a number you already had.', cost: { amount: 184350, text: 'The $184,350 wire sent to the attacker\'s account (estimate for this lab)' } },
    sent: { outcome: 'bad', points: 0, what: 'You let the wire go.', why: 'The money went to a fraudster at the "CFO" request of a lookalike domain. Wires are fast, and recalls work best within hours. The pressure, the secrecy and the unreachable boss are the signature of BEC.', cost: { amount: 184350, text: 'The $184,350 wire sent to the attacker\'s account (estimate for this lab)' } },
  },
};

export const BANK_TALK = {
  start: {
    say: [
      [DANA, [
        'Hey. Bad news first: the bank\'s fraud desk called me back about Thursday\'s $42,600. The receiving account was opened 11 days ago and is already mostly empty.',
        'Legal is asking whether we should tell Tidewater and the bank everything now, or wait until Security has the full picture so we do not say something wrong.',
        'The bank says the recall window closes fast. What should we do?',
      ]],
    ],
    choices: [
      { text: 'Tell both now: ask the bank to recall and freeze, tell Tidewater what we know (their domain was impersonated), and file a complaint at ic3.gov. Facts first, conclusions later. Speed is what recovers money.', next: 'tell', set: { outcome: 'disclose' } },
      { text: 'Wait until the investigation is complete so we have it all right.', next: 'wait', set: { outcome: 'wait' } },
      { text: 'Tell the bank but keep Tidewater out of it. It is embarrassing and they might sue.', next: 'bank', set: { outcome: 'bank-only' } },
      { text: 'Quietly pay Tidewater from the operating account and say nothing about why.', next: 'quiet', set: { outcome: 'quiet-pay' } },
    ],
  },
  tell: {
    say: [
      [DANA, ['I am calling the bank back with the wire reference and the receiving account. I will ask for a recall and a freeze, and send them the lookalike email headers.']],
      ['You', ['(You also ask Legal to tell Tidewater what happened: their domain was imitated and they may see more attempts against other customers. Reporting quickly is how recalls succeed, and the real vendor can warn its other customers. You keep the account of what you knew and when.)']],
    ],
    end: true,
  },
  wait: {
    say: [
      [DANA, ['Okay, I will tell the bank we are still working on it.']],
      ['You', ['(Recalling a wire works best within hours to a day or two. Waiting for a "complete picture" gives the attacker time to move the money out. You can state what you know, and say what you do not, in the first call.)']],
    ],
    end: true,
  },
  bank: {
    say: [
      [DANA, ['Bank only. Understood. Tidewater will be annoyed if they find out later.']],
      ['You', ['(The bank call is right. But Tidewater is also a victim: its name and domain were used, it is unpaid, and it can warn other customers and look for a compromise of its own. Leaving them out leaves an angry vendor and a partial story.)']],
    ],
    end: true,
  },
  quiet: {
    say: [
      [DANA, ['So we just cover it and move on?']],
      ['You', ['(That repays the vendor but hides a fraud from the bank, the insurer and Legal, and loses the best chance to recall the money. Cyber insurance often requires prompt notice. The attacker keeps the account and the mailbox.)']],
    ],
    end: true,
  },
};

export const BANK_SCORE = {
  id: 'bank',
  area: 'People',
  title: 'Telling the bank and the real vendor',
  max: 15,
  teaches: { skill: 'Report a fraudulent payment to the bank and the victim vendor immediately, with facts, and file an IC3 complaint', secplus: '4.8 Incident response: communication; 5.2 Risk management' },
  missing: { points: 5, what: 'Dana never came to you about the bank.', why: 'The bank\'s fraud desk is on a clock. In a real incident someone will ask whether to wait; the answer has to be ready.' },
  outcomes: {
    disclose: { outcome: 'good', points: 15, what: 'You told the bank and the vendor right away.', why: 'Right. For wire fraud, reporting to the bank within hours and filing at ic3.gov (the FBI\'s Internet Crime Complaint Center) is the single best chance of recovery, and telling the impersonated vendor helps them protect others. Say what you know and what you do not.' },
    'bank-only': { outcome: 'ok', points: 7, what: 'You told the bank but not the vendor.', why: 'The bank call is the right first move. But the vendor was impersonated and is still unpaid, and may be able to warn its other customers. Leaving it out costs trust and information.', cost: { amount: 25000, text: 'A damaged vendor relationship and a dispute over who owes what (estimate for this lab)' } },
    wait: { outcome: 'bad', points: 0, what: 'You waited for a complete investigation.', why: 'Recalls work in hours. Waiting for a finished picture gives the attacker time to empty the account. You can report facts now and update later.', cost: { amount: 42600, text: 'The $42,600 is not recovered (estimate for this lab)' } },
    'quiet-pay': { outcome: 'bad', points: 0, what: 'You paid the vendor quietly and told nobody.', why: 'It hides a fraud from the bank, Legal and the insurer, forgoes the recall, and leaves the attacker in the mailbox. Silence is not containment.', cost: { amount: 87600, text: 'The lost $42,600, a rejected insurance claim for late notice, and a second attempt (estimate for this lab)' } },
  },
};
