// Day 2 conversations.
// Mike is a non-technical end user: no jargon, a bit embarrassed. The choices model a blameless
// incident conversation against the two classic bad ones (blame, dismiss).

// Mike comes over after the case: he approved the push. How you react decides whether people keep reporting.
export const MIKE_CONFESSES = {
  start: {
    say: [
      ['Mike Chen (Sales)', [
        'Hey, sorry, got a sec? Probably nothing.',
        'My phone went crazy this morning, like quarter to seven. "Approve sign-in?" over and over. I was still in bed.',
        'I hit Approve so it would shut up. Then it stopped. Is that... a thing?',
      ]],
    ],
    choices: [
      { text: "Thanks for telling me, seriously. Someone had your password, and that Approve let them in. We've killed their session and we're resetting you. Next time: Deny, then call us.", next: 'supportive', set: { outcome: 'supportive' } },
      { text: "You approved a sign-in you didn't start? Mike. Come on.", next: 'blamed', set: { outcome: 'blamed' } },
      { text: "Probably the new MFA rollout. It's been glitchy for everyone.", next: 'dismissed', set: { outcome: 'dismissed' } },
    ],
  },
  supportive: {
    say: [['Mike Chen (Sales)', ['Oh man. Okay. Thanks for not making me feel like an idiot.', "I'll tell the team at our 10:30. If your phone asks and you're not logging in, hit Deny and call security."]]],
    end: true,
  },
  blamed: {
    say: [['Mike Chen (Sales)', ["...Yeah. Sorry. Figured you'd want to know.", "Won't bother you next time."]]],
    end: true,
  },
  dismissed: {
    say: [['Mike Chen (Sales)', ['Oh, phew. Okay.', "I'll just keep hitting Approve then, so they stop."]]],
    end: true,
  },
};
