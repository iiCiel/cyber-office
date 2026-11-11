// Day 4: Carla from Finance (accounts payable) calls about the "new bank details".
// She talks AP: remit-to change, vendor master, wire cut-off. Careful, but busy.
export const CARLA_CALL = {
  start: {
    say: [
      ['Carla Reyes (Finance)', [
        'Hi, Carla in AP. Did my email come through?',
        'Northwind sent a remit-to change. New bank, signed letter on their letterhead. It has the external banner, but every vendor email does.',
        'Invoice NW-7781, $48,200, due today, and the wire cut-off is 2 PM. Can I update the vendor master and pay it?',
      ]],
    ],
    choices: [
      { text: 'Hold it. Call Northwind on the number already in the vendor master, not one from the email, and confirm the change first.', next: 'callback', set: { outcome: 'callback' } },
      { text: "Look at the sender domain: northwindsupplies-billing.com isn't theirs. Don't pay, and report it as phishing.", next: 'domain', set: { outcome: 'domain' } },
      { text: 'Reply to the email and ask them to confirm.', next: 'reply', set: { outcome: 'reply' } },
      { text: 'It passed the filter and the letter is signed. Go ahead.', next: 'pay', set: { outcome: 'paid' } },
    ],
  },
  callback: {
    say: [
      ['You', ['(Twenty minutes later.)']],
      ['Carla Reyes (Finance)', ["Called the number on file. Janet in their AR has never heard of a bank change. She's flagging it on their side.", "Nothing goes out today. I've put a hold on the vendor record. Thank you."]],
    ],
    end: true,
  },
  domain: {
    say: [['Carla Reyes (Finance)', ['Oh. Oh no. "-billing". I read that three times and never saw it.', "Okay. Not paying. I'll hit Report Phish so it lands with the SOC."]]],
    end: true,
  },
  reply: {
    say: [
      ['You', ['(Carla replies on the same thread. Ten minutes later "Janet" answers.)']],
      ['Carla Reyes (Finance)', ['She confirmed! Very professional. The wire goes out before cut-off.']],
    ],
    end: true,
  },
  pay: {
    say: [['Carla Reyes (Finance)', ['Great. Releasing the wire now. Thanks!']]],
    end: true,
  },
};
