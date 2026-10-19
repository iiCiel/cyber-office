// Case file: Colonial Pipeline 2021. Two conversations.
//   1. The ransom note, found on a control-room PC (reported to have happened early on May 7).
//   2. The shutdown decision. Colonial really did pause its pipeline on May 7 and restarted it May 12.
//      There is no free option here, so the scoring rewards a safe, reasoned choice and says plainly what it cost.
// People in the replay are fictional roles played by the office crew.

export const NOTE_FOUND = {
  start: {
    say: [
      ['Theo (playing a control room operator)', [
        'Hey. Sorry to bother IT Security.',
        'There is a text file on my control room PC. It says our files are encrypted and our data was copied.',
        'It says to contact them, or they will publish it. The pipeline screens look normal to me.',
        "I haven't touched anything. What do I do?",
      ]],
    ],
    choices: [
      { text: "Don't touch it. Photograph the screen, leave the PC on, and unplug its network cable. I'm escalating.", next: 'preserved', set: { outcome: 'preserved' } },
      { text: 'Delete the file and reboot the PC. Probably a glitch.', next: 'deleted', set: { outcome: 'deleted' } },
      { text: "Open the contact address in the note and see what they want. Let's find out what we're dealing with.", next: 'contacted', set: { outcome: 'contacted' } },
    ],
  },
  preserved: {
    say: [['Theo (playing a control room operator)', ['Photo taken. Cable out. PC stays on.', "I'll tell the others to leave their screens alone too."]]],
    end: true,
  },
  deleted: {
    say: [['Theo (playing a control room operator)', ['Okay. Deleted. Rebooting...', 'Huh. It was the only copy of that file. Was that the note you needed to see?']]],
    end: true,
  },
  contacted: {
    say: [['Theo (playing a control room operator)', ['The page asks for a company ID and says a "negotiator" will talk to me.', 'It has a chat box. It already knows which company I am. That cannot be good.']]],
    end: true,
  },
};

export const NOTE_SCORE = {
  id: 'note',
  area: 'People',
  title: 'A ransom note on a control room PC',
  max: 10,
  teaches: { skill: 'Preserve evidence when ransomware is found', secplus: '4.8 Incident response: detection and containment' },
  missing: { points: 3, what: 'It never came up.', why: '' },
  outcomes: {
    preserved: { outcome: 'good', points: 10, what: 'You kept the evidence and cut the PC off the network.', why: 'Right. A photo keeps the note. Leaving the PC powered on keeps what is in memory. Unplugging the cable stops it talking to anything else. Rebooting or deleting would destroy clues you need.' },
    deleted: { outcome: 'bad', points: 0, what: 'You had the note deleted and the PC rebooted.', why: 'That destroys evidence, and the PC may still be connected to other machines. Never assume a glitch. Keep the machine as it is and isolate it.' },
    contacted: { outcome: 'bad', points: 2, what: 'You had someone open the attacker\'s contact page.', why: 'Contacting the attackers is a leadership and law enforcement decision, not an operator\'s. It tells them who you are and that someone is reading. Contain first, then bring in the FBI and your legal team.' },
  },
};

export const SHUTDOWN_CALL = {
  start: {
    say: [
      ['Mike (playing the operations manager)', [
        'I need an answer from security, and I need it now.',
        "Billing is down. Without it we can't record who took how much fuel, so we can't invoice anyone.",
        "The control room says the pipeline looks normal. But can you tell me for sure that the control network is clean? Because I can't.",
        'Every hour we are down, the Southeast feels it. Every hour we run blind, I risk something worse. Do we keep the pipeline running?',
      ]],
    ],
    choices: [
      { text: "Pause operations and cut IT off from the control network until we can confirm it's clean. Restart in stages.", next: 'shutdown', set: { outcome: 'shutdown' } },
      { text: 'Cut IT off from the control network and keep running, with operators controlling it by hand.', next: 'isolate-run', set: { outcome: 'isolate-run' } },
      { text: "Keep running as normal. The control room says it looks fine. We'll fix billing later.", next: 'keep', set: { outcome: 'keep-running' } },
    ],
  },
  shutdown: {
    say: [['Mike (playing the operations manager)', [
      "That's going to hurt. Shortages. Phone calls from the top floor.",
      "But I can't prove the control side is safe, and I can't bill. Okay. We pause, and we restart in stages as you confirm each part.",
      '(Colonial made this same call on May 7, 2021. It restarted on May 12.)',
    ]]],
    end: true,
  },
  'isolate-run': {
    say: [['Mike (playing the operations manager)', [
      'Manual control. It means fewer people watching more screens, with no billing and no easy way to tell if someone is already inside.',
      "If that goes wrong, I'm the one answering for it. But okay. Cut the link now, and tell me the moment you find anything on the control side.",
    ]]],
    end: true,
  },
  keep: {
    say: [['Mike (playing the operations manager)', [
      'Fine. If you say so.',
      "...Wait. If billing is encrypted and nobody can tell me the control side is safe, why am I the one deciding to keep going on a hunch? Write that down somewhere.",
    ]]],
    end: true,
  },
};

export const SHUTDOWN_SCORE = {
  id: 'shutdown',
  area: 'People',
  title: 'Keep the pipeline running, or pause it?',
  max: 10,
  teaches: { skill: 'Weigh safety against disruption when you cannot yet prove the safe side', secplus: '4.8 Incident response: containment and communication' },
  missing: { points: 3, what: 'It never came up.', why: '' },
  outcomes: {
    shutdown: { outcome: 'good', points: 10, what: 'You paused operations until the control side could be confirmed safe.', why: 'A defensible call, and the one Colonial made. Colonial said it shut down proactively to contain the threat; reporting at the time pointed to the billing outage and fear that the attack could spread to the systems that run the pipeline. It also caused fuel shortages across the Southeast, and some people argued afterwards that it went too far. There is no free option. The cost of being wrong about safety is the reason to pause while you verify.' },
    'isolate-run': { outcome: 'ok', points: 7, what: 'You isolated IT from the control network and kept running by hand.', why: 'Reasonable, and it keeps the fuel moving. The risk is running manually with no billing and no proof that the control side is clean, while your people are tired and under pressure. It only works if operators are trained to run without IT, and you can monitor the isolated side. Colonial chose to pause instead.' },
    'keep-running': { outcome: 'bad', points: 0, what: 'You kept the pipeline running as normal.', why: 'This bets everything on a feeling. Billing was already encrypted, nobody could prove the control network was separate, and the attackers had reportedly been inside for more than a week. Running a critical system while the attacker may still be inside is the riskiest option. Isolating the networks costs a little. Being wrong costs far more.' },
  },
};
