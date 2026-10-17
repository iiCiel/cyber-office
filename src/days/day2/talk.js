// Day 2 conversations.

// Mike comes over after the case: he approved the push. How you react decides whether people keep reporting.
export const MIKE_CONFESSES = {
  start: {
    say: [
      ['Mike Chen (Sales)', [
        'Hey... got a minute? Weird thing this morning.',
        'My phone went nuts around 7 with sign-in approvals. Like twenty of them. I was half asleep.',
        'I hit Approve just to make it stop. Is that... bad?',
      ]],
    ],
    choices: [
      { text: "Thanks for telling me. That was an attacker with your password. We'll reset it and clean up. Next time: Deny, then call us.", next: 'supportive', set: { outcome: 'supportive' } },
      { text: 'You did WHAT? Seriously, Mike?', next: 'blamed', set: { outcome: 'blamed' } },
      { text: "Probably fine. The MFA system is brand new, it's just glitchy.", next: 'dismissed', set: { outcome: 'dismissed' } },
    ],
  },
  supportive: {
    say: [['Mike Chen (Sales)', ['Oh no. Okay. Thank you for not yelling at me.', "I'll tell the sales team: if your phone asks and you're not signing in, hit Deny."]]],
    end: true,
  },
  blamed: {
    say: [['Mike Chen (Sales)', ['...Sorry. I thought you\'d want to know.', 'Next time I guess I just won\'t say anything.']]],
    end: true,
  },
  dismissed: {
    say: [['Mike Chen (Sales)', ['Oh good. I was worried.', 'I\'ll just keep approving them then, so they stop.']]],
    end: true,
  },
};
