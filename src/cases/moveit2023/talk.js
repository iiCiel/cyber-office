// Case file: MOVEit 2023. Two conversations, both dramatizations (people are fictional roles).
//   1. The MOVEit admin walks up: the vendor says block web access and patch. Business wants it back by 9.
//   2. A partner phones: "did our files leave?" The right answer is honest, factual and early.
// Real basis: Progress told customers to disable HTTP/HTTPS, patch, and check for compromise;
// TrustedSec advises containing the system without powering it off; the patch does not remove a planted web shell.

const ADMIN = 'Theo (playing the MOVEit admin)';

export const EXPOSURE_CALL = {
  start: {
    say: [
      [ADMIN, [
        'Hey. Did you see the vendor email? Critical bug in MOVEit. They want us to block web access until we patch.',
        'The patch is available. But Mike says payroll files are due by 9 and about 40 partners use the web page.',
        'I can patch and reopen in 20 minutes. Do we just do that?',
      ]],
    ],
    choices: [
      { text: "Block 80/443 now, snapshot the server and copy the logs, and check for human2.aspx and odd accounts before we patch.", next: 'contain', set: { outcome: 'contain-hunt' } },
      { text: 'Patch it now and reopen. The patch fixes the bug.', next: 'patch', set: { outcome: 'patch-only' } },
      { text: "Leave it up until the patch is installed. We can't disrupt payroll.", next: 'open', set: { outcome: 'keep-open' } },
      { text: 'Block the web ports and power the server off to be safe.', next: 'poweroff', set: { outcome: 'power-off' } },
    ],
  },
  contain: {
    say: [[ADMIN, ["Okay. Web ports blocked. SFTP stays up for the payroll file, so Mike can breathe. Snapshot is running.", 'I will pull the IIS logs and the wwwroot listing for you. It is going to be a long day.']]],
    end: true,
  },
  patch: {
    say: [[ADMIN, ['On it. Patching and rebooting.', '...Done, and back online. Hm. That also cleared the temp files and restarted the app pool. Was that a problem?']]],
    end: true,
  },
  open: {
    say: [[ADMIN, ['Okay, but if it is already being exploited, a patch an hour from now is an hour too late.', 'I will leave it up. Mike will be happy.']]],
    end: true,
  },
  poweroff: {
    say: [[ADMIN, ['Web ports blocked. Powering off.', "Wait. That wipes memory, doesn't it? Whatever was running in the web server is gone. Oh well."]]],
    end: true,
  },
};

export const EXPOSURE_SCORE = {
  id: 'exposure',
  area: 'People',
  title: 'The vendor says block web access and patch. Business wants it up by 9',
  max: 15,
  teaches: { skill: 'Contain an exposed server and preserve evidence before patching', secplus: '4.8 Incident response: containment, evidence preservation' },
  missing: { points: 4, what: 'It never came up.', why: '' },
  outcomes: {
    'contain-hunt': { outcome: 'good', points: 15, what: 'You blocked web access, kept evidence and checked for compromise before the patch.', why: 'This is the sequence the vendor and responders recommend: cut the exposed interface (SFTP can stay), keep the server and logs as they are, and hunt first. A patch only closes the hole. If the web shell is already there, the attacker still has the door you left behind.' },
    'power-off': { outcome: 'ok', points: 7, what: 'You blocked access but had the server powered off.', why: 'Blocking was right. Powering off wipes memory, which can hold what the attacker ran. Responders advise containing the server and leaving it on, or pausing the VM, so the evidence stays.' },
    'patch-only': { outcome: 'bad', points: 0, what: 'You patched and reopened without checking for compromise.', why: 'The patch does not remove a web shell or a hidden admin account that were planted before it. And the restart cleared temp files that held evidence. In the real campaign, the shell had been working since May 27.', cost: { amount: 400000, text: 'A live web shell in your DMZ and lost evidence (estimate for this replay)' } },
    'keep-open': { outcome: 'bad', points: 0, what: 'You left the server open to the internet while you waited for the patch.', why: 'The vendor said to disable web traffic first because exploitation was already happening. Mandiant saw theft within minutes of a web shell going in. Every hour online is more files out the door.', cost: { amount: 600000, text: 'More partner files leave the server (estimate for this replay)' } },
  },
};

const CALLER = 'Partner · +1 (330) 555-0142';

export const PARTNER_CALL = {
  start: {
    say: [
      [CALLER, [
        "Hi, it's the compliance lead at Larkin Payroll Services. We saw the news about MOVEit.",
        'We send you payroll and enrollment files through it every night. They have names and ID numbers.',
        'Were our files taken? Can you tell us right now that we are safe?',
      ]],
    ],
    choices: [
      { text: "No, nothing was touched. You're fine.", next: 'assure', set: { outcome: 'false-assurance' } },
      { text: "We're investigating. We blocked the web interface, we have not confirmed whether your files were accessed, and you will hear from our security contact when we know. Please rotate your SFTP credentials.", next: 'honest', set: { outcome: 'honest' } },
      { text: "I can't discuss anything. Contact our legal department.", next: 'stonewall', set: { outcome: 'stonewall' } },
      { text: 'Assume every file on the server is gone, and tell your own customers today.', next: 'overstate', set: { outcome: 'overstate' } },
    ],
  },
  assure: {
    say: [[CALLER, ['Oh, good. Thank you. I will tell my director we are clear.']], ['You', ['(You have no logs reviewed yet. You just promised something you cannot prove.)']]],
    end: true,
  },
  honest: {
    say: [
      [CALLER, ['Okay. Thank you for being straight with me. We will rotate the keys today.', 'One more thing. How long do you keep our files on that server? Our contract says delete after pickup.']],
    ],
    choices: [
      { text: "Honestly, longer than we should. Some files are years old. Once forensics releases the server, we will delete after pickup like the contract says.", next: 'retention', set: { outcome: 'honest-retention' } },
      { text: "I'm not sure. I'll have to check and get back to you.", next: 'vague', set: { outcome: 'honest-vague' } },
    ],
  },
  stonewall: {
    say: [[CALLER, ["That's not a helpful answer. I will have to assume the worst.", '(She hangs up. Hours of her own hunt begin without any help from you.)']]],
    end: true,
  },
  overstate: {
    say: [[CALLER, ['Everything? You are sure? We will have to notify thousands of people on your word.', 'That is a huge call. I hope you checked.']]],
    end: true,
  },
  retention: {
    say: [[CALLER, ['Thank you. That is the answer we needed to hear. We will still need your logs for the file list when you have it.']]],
    end: true,
  },
  vague: {
    say: [[CALLER, ['Please do. Our auditors will ask the same question.']]],
    end: true,
  },
};

export const PARTNER_SCORE = {
  id: 'partner',
  area: 'Phone call',
  title: 'A partner asks: were our files taken?',
  max: 15,
  teaches: { skill: 'Communicate honestly about an incident while scope is unknown', secplus: '4.8 Incident response: communication plan' },
  missing: { points: 5, what: 'You never took the call.', why: 'Partners learn about their exposure from news and leak sites if you stay silent.' },
  outcomes: {
    'honest-retention': { outcome: 'good', points: 15, what: 'You told the truth, gave a next step, and owned the retention problem.', why: 'Right: say what you know, what you do not, and when they will hear more. Own the data-minimization gap, because it is the part the partner can hold you to. In the real campaign, many victims were customers of customers. Organizations learned they were hit through a vendor, not from their own alarms.' },
    'honest-vague': { outcome: 'good', points: 12, what: 'You were honest, but dodged how long you keep their files.', why: 'The honest status was right. Know your retention answer before the call: the files sitting there for years are the part that hurts the most.' },
    stonewall: { outcome: 'ok', points: 6, what: 'You referred the partner to legal and gave no information.', why: 'Legal should be involved, but a partner who knows nothing will assume the worst and may rotate nothing. A short, factual status and a contact is better than a wall.' },
    overstate: { outcome: 'ok', points: 5, what: 'You told them everything was gone, with no logs reviewed.', why: 'You do not know that yet. Overstating sets off notices and panic you may not need, and then you have to walk it back. Report what the logs support.' },
    'false-assurance': { outcome: 'bad', points: 0, what: 'You told the partner they were safe, before reviewing the logs.', why: 'It was not true. The IIS logs show 14 big downloads on May 27 alone. A false "you are fine" is worse than no answer: the partner skips rotating keys and later finds out from a leak site.', cost: { amount: 250000, text: 'Contract dispute and a partner who finds out from the news (estimate for this replay)' } },
  },
};
