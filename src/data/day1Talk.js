// Day 1 conversations with choices (M5).
//
// A conversation is a map of nodes. Each node:
//   say:     [[speaker, [lines...]], ...]  shown in order
//   choices: [{ text, next, set }]          `set` is merged into the conversation's result
//   end:     true                           conversation ends after `say`
// The runner (OfficeScene.runConversation) stores the merged result in GameState.

const CALLER = 'Caller · +1 (216) 555-0187';

// Vishing: someone pretending to be Mike Chen from Sales wants a password reset over the phone.
// The tell: the real Mike badged in and logged on at his desk at 08:21 (it's in the SIEM logs),
// the caller ID isn't Mike's number in the directory, and he's pushing urgency and authority.
export const PHONE_CALL = {
  start: {
    say: [
      [CALLER, [
        'Hey, is this IT security? This is Mike Chen, from Sales.',
        "I'm at the airport and I'm locked out of my email. My client demo starts in 20 minutes.",
        "Helpdesk isn't picking up. Can you reset my password and just read me the new one? Please.",
      ]],
    ],
    choices: [
      { text: 'Sure. Resetting it now...', next: 'reset', set: { outcome: 'reset' } },
      { text: "Before I do anything: what's your employee ID?", next: 'askid', set: { askedId: true } },
      { text: "I'll call you back on your number in the company directory.", next: 'callback', set: { askedCallback: true } },
      { text: "Resets go through the helpdesk's verification. I'll open a ticket for you.", next: 'ticket' },
    ],
  },
  askid: {
    say: [[CALLER, ["Uh... it's 20417. I don't have my badge on me, I'm traveling.", 'Come on, the demo is in 15 minutes.']]],
    choices: [
      { text: 'Okay, that matches. Resetting it now.', next: 'reset', set: { outcome: 'reset-after-id' } },
      { text: "I'll call you back on your number in the company directory.", next: 'callback', set: { askedCallback: true } },
      { text: "Resets go through the helpdesk's verification. I'll open a ticket for you.", next: 'ticket' },
    ],
  },
  callback: {
    say: [[CALLER, ['Call me back? My phone is about to die!', "Look, Mark Holloway is going to hear about this if I miss this demo. It's a big client."]]],
    choices: [
      { text: "Sorry. Directory number, or it doesn't happen.", next: 'verify', set: { outcome: 'callback-verified' } },
      { text: 'Okay, okay. Resetting it now.', next: 'reset', set: { outcome: 'reset-under-pressure' } },
    ],
  },
  ticket: {
    say: [[CALLER, ["A ticket? I don't have time for a ticket! Just reset it!"]]],
    choices: [
      { text: "That's the process. The helpdesk will verify you and call you back.", next: 'refused', set: { outcome: 'refused-process' } },
      { text: 'Fine, fine. Resetting it now.', next: 'reset', set: { outcome: 'reset-under-pressure' } },
    ],
  },
  reset: {
    say: [
      [CALLER, ["Oh, thank you! You're a lifesaver."]],
      ['You', ['(You read the new password over the phone. He hangs up fast.)']],
    ],
    end: true,
  },
  verify: {
    say: [
      [CALLER, ['...Fine. Whatever.', '(click)']],
      ['You', ["(You look up Mike Chen in the directory and call his desk: +1 (330) 555-0142.)"]],
      ['Mike Chen', ["Hello? Yeah, this is Mike. I'm at my desk on the second floor.", "Locked out? No. And I'm not at any airport.", 'Wait. Someone is pretending to be me?!']],
    ],
    end: true,
  },
  refused: {
    say: [
      [CALLER, ['(He hangs up.)']],
      ['You', ['Hm. Mike Chen badged in at 8:21 this morning. Was he really at the airport?']],
    ],
    end: true,
  },
};

// Baiting: Dana found a USB stick in the parking lot.
export const USB_DROP = {
  start: {
    say: [
      ['Dana (IT helpdesk)', [
        'Hey! Found this in the parking lot. A USB stick labeled "SALARIES 2026".',
        "There's another one just like it on someone's desk, too. Weird.",
        "Can you plug it into your PC and see whose it is? I'm dying to know. I mean, so we can return it.",
      ]],
    ],
    choices: [
      { text: 'Sure, hand it over.', next: 'plug', set: { outcome: 'plugged' } },
      { text: "Nope. Unknown USB sticks don't go in any of our PCs. I'll bag it and give it to Priya to check safely.", next: 'safe', set: { outcome: 'handed-to-soc' } },
      { text: 'Just throw it in the trash.', next: 'trash', set: { outcome: 'trashed' } },
    ],
  },
  plug: {
    say: [
      ['You', ['(You plug it in. A black window flashes open and closes in a blink. Then nothing.)']],
      ['Dana (IT helpdesk)', ['Huh. Empty? Lame.']],
    ],
    end: true,
  },
  safe: {
    say: [
      ['Dana (IT helpdesk)', ["Ugh, fine. You're no fun.", "...Okay, that's actually smart. I'll grab the other one before somebody plugs it in."]],
    ],
    end: true,
  },
  trash: {
    say: [['Dana (IT helpdesk)', ['Into the bin it goes. Bye, salaries.']]],
    end: true,
  },
};
