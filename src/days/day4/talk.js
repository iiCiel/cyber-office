// Day 4: Carla from Finance calls about the "new bank details".
export const CARLA_CALL = {
  start: {
    say: [
      ['Carla Reyes (Finance)', [
        'Hi, it\'s Carla. Did you see my email?',
        'Northwind says their bank changed. There\'s a signed letter and everything, and it got through the spam filter.',
        'Invoice NW-7781, $48,200, due today. Can I pay it to the new account?',
      ]],
    ],
    choices: [
      { text: 'Hold off. Call Northwind on the number in our vendor file, not one from the email, and confirm the change first.', next: 'callback', set: { outcome: 'callback' } },
      { text: "Look at the sender: northwindsupplies-billing.com isn't their real domain. Don't pay; report it.", next: 'domain', set: { outcome: 'domain' } },
      { text: 'Reply to their email and ask them to confirm.', next: 'reply', set: { outcome: 'reply' } },
      { text: 'It passed the spam filter and has a signed letter. Go ahead.', next: 'pay', set: { outcome: 'paid' } },
    ],
  },
  callback: {
    say: [
      ['You', ['(Twenty minutes later.)']],
      ['Carla Reyes (Finance)', ['I called the number in our vendor file. Their real AR person, Janet, has never heard of a bank change.', "She's furious. I'm not paying anyone today. Thank you."]],
    ],
    end: true,
  },
  domain: {
    say: [['Carla Reyes (Finance)', ['Oh. Oh no. It\'s "-billing". I would never have noticed.', "Okay. Not paying. I'll forward it to the SOC."]]],
    end: true,
  },
  reply: {
    say: [
      ['You', ['(Carla replies. Ten minutes later "Janet" answers.)']],
      ['Carla Reyes (Finance)', ['They confirmed! Very polite. Paying now.']],
    ],
    end: true,
  },
  pay: {
    say: [['Carla Reyes (Finance)', ['Great. Sending the wire now. Thanks!']]],
    end: true,
  },
};
