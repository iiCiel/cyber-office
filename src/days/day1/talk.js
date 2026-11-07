// Day 1 conversations with choices (M5).
//
// A conversation is a map of nodes. Each node:
//   say:     [[speaker, [lines...]], ...]  shown in order
//   choices: [{ text, next, set }]          `set` is merged into the conversation's result
//   end:     true                           conversation ends after `say`
// The runner (OfficeScene.runConversation) stores the merged result in GameState.
//
// Voices: Dana is Tier 1 service desk (dry, overworked, talks in ticket numbers and the queue).
// The caller is a vishing attempt that sounds like a stressed salesperson, not a cartoon villain.

const CALLER = 'Caller · +1 (216) 555-0187';

// Vishing: someone pretending to be Mike Chen from Sales wants a password reset over the phone.
// The tell: the real Mike badged in and logged on at his desk at 08:21 (it's in the SIEM logs),
// the caller ID isn't Mike's number in the directory, and he's pushing urgency and authority.
export const PHONE_CALL = {
  start: {
    say: [
      [CALLER, [
        "Hi, is this security? The service desk line just rings out. It's Mike Chen, Sales.",
        "I'm at Hopkins, gate B9, and Outlook keeps saying my password expired. I've got the Brennan Freight demo in twenty minutes.",
        "Can you just reset it and read me the new one? I'll change it after, promise.",
      ]],
    ],
    choices: [
      { text: 'Okay, give me a sec. Resetting it now.', next: 'reset', set: { outcome: 'reset' } },
      { text: "Before I touch the account: what's your employee ID?", next: 'askid', set: { askedId: true } },
      { text: "I'll call you back on the number we have for you in the directory.", next: 'callback', set: { askedCallback: true } },
      { text: "Password resets need identity verification through the service desk. I'll open an incident for you.", next: 'ticket' },
    ],
  },
  askid: {
    say: [[CALLER, ['Uh, 20417? My badge is in my checked bag.', "Look, I'm boarding in fifteen. Can we do this?"]]],
    choices: [
      { text: 'Okay, 20417 matches. Resetting it now.', next: 'reset', set: { outcome: 'reset-after-id' } },
      { text: "Employee IDs are on every org chart. I'll call you back on your directory number.", next: 'callback', set: { askedCallback: true } },
      { text: "Password resets need identity verification through the service desk. I'll open an incident for you.", next: 'ticket' },
    ],
  },
  callback: {
    say: [[CALLER, ["Call me back? I'm on 4% battery, man.", "Mark Holloway signed off on this account personally. If I lose Brennan over a callback, that's on you."]]],
    choices: [
      { text: "Understood. It's a directory callback or nothing, for anyone, VPs included.", next: 'verify', set: { outcome: 'callback-verified' } },
      { text: 'Okay, okay. Resetting it now.', next: 'reset', set: { outcome: 'reset-under-pressure' } },
    ],
  },
  ticket: {
    say: [[CALLER, ['An incident? Like a ticket? Nobody reads those before Thursday.', "Just reset it. I'll do the paperwork later."]]],
    choices: [
      { text: "The service desk will verify you and call you back. That's the process for everyone.", next: 'refused', set: { outcome: 'refused-process' } },
      { text: 'Fine, fine. Resetting it now.', next: 'reset', set: { outcome: 'reset-under-pressure' } },
    ],
  },
  reset: {
    say: [
      [CALLER, ["Perfect. You're a lifesaver.", 'Spell it for me? ...Got it. Bye.']],
      ['You', ['(You read the new password over the phone. The line goes dead fast.)']],
    ],
    end: true,
  },
  verify: {
    say: [
      [CALLER, ['...Unbelievable. Fine.', '(click)']],
      ['You', ['(You look up Mike Chen in the directory and dial his desk: +1 (330) 555-0142.)']],
      ['Mike Chen (Sales)', ["Mike Chen. Hey, what's up?", "Airport? No, I'm at my desk. Second floor. Been here since eight.", 'Hang on. Someone called you pretending to be me? That is creepy.']],
    ],
    end: true,
  },
  refused: {
    say: [
      [CALLER, ['(He hangs up.)']],
      ['You', ['Hm. The SIEM had Mike Chen badging in at 08:21. Hard to do that from an airport.']],
    ],
    end: true,
  },
};

// Baiting: Dana found a USB stick in the parking lot.
export const USB_DROP = {
  start: {
    say: [
      ['Dana (IT helpdesk)', [
        'Okay, weird one. Facilities found this by the loading dock. Label says "SALARIES 2026".',
        "There's a twin of it on a desk upstairs too. Somebody is handing these out.",
        'Can you plug it in and see whose it is? Strictly for lost-and-found purposes. Obviously.',
      ]],
    ],
    choices: [
      { text: 'Sure, hand it over.', next: 'plug', set: { outcome: 'plugged' } },
      { text: "No. Unknown USB doesn't touch a production box. Bag it, and Priya can image it on the air-gapped analysis laptop.", next: 'safe', set: { outcome: 'handed-to-soc' } },
      { text: 'Just bin it.', next: 'trash', set: { outcome: 'trashed' } },
    ],
  },
  plug: {
    say: [
      ['You', ['(You plug it in. A console window flashes for half a second and closes. Then nothing.)']],
      ['Dana (IT helpdesk)', ['Huh. Empty? Lame.', "...Was that a PowerShell window? I'm going to pretend I didn't see that."]],
    ],
    end: true,
  },
  safe: {
    say: [
      ['Dana (IT helpdesk)', ['Ugh. You sound like the annual training video.', "No, you're right. I'll grab the other one before somebody in Sales plugs it in, and log an INC so it's on record."]],
    ],
    end: true,
  },
  trash: {
    say: [['Dana (IT helpdesk)', ['Into the bin. Bye, salaries.', "...Though if it's what I think it is, somebody might want to look at it. Eh. Not my queue."]]],
    end: true,
  },
};
