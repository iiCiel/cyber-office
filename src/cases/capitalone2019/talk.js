// Case file: Capital One 2019. One walk-up conversation: what to do with the disclosure tip.
// In reality (Capital One's own statement) a researcher reported a configuration vulnerability through the
// Responsible Disclosure Program on July 17, 2019, and the company determined the incident on July 19.
// The people here are fictional roles played by the office crew.

const THEO = 'Theo (playing a cloud platform engineer)';

export const TIP_TALK = {
  start: {
    say: [
      [THEO, [
        'Did you see the disclosure email? Somebody says our bucket data is on GitHub.',
        'Honestly it looks like noise. We get a few of these a month. The sender is a stranger.',
        'What do we do with it?',
      ]],
    ],
    choices: [
      { text: 'Treat it as real until proven otherwise. Save the file, check it against our bucket names, and escalate to incident response and legal.', next: 'verified', set: { step1: 'verify' } },
      { text: "Mark it spam. Strangers with a link are a classic scam, and it's not our job to chase them.", next: 'spam', set: { outcome: 'ignored' } },
      { text: 'Write back and tell the sender to delete the post and keep quiet, or we will involve lawyers.', next: 'hostile', set: { outcome: 'hostile' } },
    ],
  },
  verified: {
    say: [
      [THEO, [
        'Okay. I compared the file to our bucket list. The names match. Those are ours.',
        'So the data is real. The role it came through is probably "corp-waf-role". Its credentials are temporary and may have expired already.',
        'What first?',
      ]],
    ],
    choices: [
      { text: 'Export CloudTrail and S3 logs to a locked account first, then restrict the role and fix the server.', next: 'good', set: { outcome: 'preserve-and-fix' } },
      { text: 'Delete the role and terminate the instance right now so it stops.', next: 'rushed', set: { outcome: 'rushed' } },
      { text: "Open a change request. We'll patch it at Friday's window.", next: 'wait', set: { outcome: 'waited' } },
    ],
  },
  spam: {
    say: [[THEO, ['Okay. Archived.', '...Hm. The first lines say "bucket names". You are sure?', '(In the real incident the tip was read and acted on within two days. Here, nobody looks again until the SIEM lights up.)']]],
    end: true,
  },
  hostile: {
    say: [[THEO, ['Sent.', 'Huh. They answered in thirty seconds: "Fine. Good luck." And the post is still up.', '(Threatening a person who is trying to help makes the next one keep quiet, or go public.)']]],
    end: true,
  },
  good: {
    say: [[THEO, ['Logs exported and locked. Role locked down. Tagged the instance for rebuild.', 'The real company did something similar: it confirmed the incident on July 19, fixed the configuration, and brought in the FBI.']]],
    end: true,
  },
  rushed: {
    say: [[THEO, ['Gone. Role deleted, instance terminated.', '...Wait. The instance logs and memory went with it. That was our evidence.']]],
    end: true,
  },
  wait: {
    say: [[THEO, ['Friday it is.', '...Two more days with an open door. Okay. I will write that down.']]],
    end: true,
  },
};

export const TIP_SCORE = {
  id: 'tip',
  area: 'People',
  title: 'The disclosure tip: spam, or the breach?',
  max: 15,
  teaches: { skill: 'Triage a responsible-disclosure report and preserve evidence', secplus: '4.8 Incident response: detection and containment' },
  missing: { points: 5, what: 'The tip never came up.', why: 'In the real incident the whole detection came from this one email. Without it, the access could have gone on.' },
  outcomes: {
    'preserve-and-fix': { outcome: 'good', points: 15, what: 'You treated the tip as real, preserved the logs, then locked down the role.', why: 'Right order. Capital One confirmed the incident within two days of the tip, fixed the configuration and called the FBI. Keep the evidence before you change things, and keep the person who reported it on your side.' },
    rushed: { outcome: 'ok', points: 8, what: 'You believed the tip but deleted the role and the instance before saving evidence.', why: 'Believing it was right, and stopping the access matters. But terminating the instance threw away the memory and local logs the investigators need. Snapshot first, then contain.' },
    waited: { outcome: 'bad', points: 3, what: 'You believed it, then waited for the next change window.', why: 'An open door for two more days with the data already public. Emergency changes exist for exactly this.', cost: { amount: 400000, text: 'More access and more time for the attacker (estimate for this replay)' } },
    ignored: { outcome: 'bad', points: 0, what: 'You filed the tip as spam.', why: 'Most unsolicited mail is junk, but a disclosure inbox exists to catch the one that is not. Reading the first lines would have shown real bucket names. Never decide from the sender alone.', cost: { amount: 1200000, text: 'The data stays public and nobody is working on it (estimate for this replay)' } },
    hostile: { outcome: 'bad', points: 0, what: 'You threatened the person who reported it.', why: 'Hostility pushes helpful researchers away and can push them to the press. Companies that run a disclosure or bug-bounty program publish safe-harbor terms so reporters feel safe. Thank them, and do the work.', cost: { amount: 900000, text: 'A public fight, and the data stays public meanwhile (estimate for this replay)' } },
  },
};
