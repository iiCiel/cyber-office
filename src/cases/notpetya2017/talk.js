// Case file: NotPetya. Two decisions the real company faced, played by cast members in roles.
// 1) Theo (server engineer): the domain controllers have not rebooted yet. Keep a clean copy, or "reboot everything"?
// 2) Mike (operations, by phone): users see a disk-check screen. What do you tell 40,000 people?

const THEO = 'Theo (playing a server engineer)';
const MIKE = 'Mike Chen (Operations)';

export const DC_TALK = {
  start: {
    say: [
      [THEO, [
        'Got a minute? It is about the domain controllers.',
        'DC-CPH02 and DC-LON01 are infected, but the scheduled task has not fired on them yet, so they are still up and clean enough to boot. The Ghana controller (DC-GH01) is still dark from the power cut.',
        'Dana wants to restart the lot so they come back "fresh". I could also pull one off the network now and power it down, but then people lose a logon server. What do we do?',
      ]],
    ],
    choices: [
      { text: 'Pull a controller off the network and power it down now. Keep it and DC-GH01 untouched as clean copies of Active Directory. Cancel the queued task on the others and keep them off the network.', next: 'preserve', set: { outcome: 'preserve-clean' } },
      { text: 'Cancel the queued shutdown task on the controllers and leave them online, so people can still log on.', next: 'online', set: { outcome: 'cancel-online' } },
      { text: 'Reboot all the controllers now. A reboot clears the malware from memory.', next: 'reboot', set: { outcome: 'rebooted' } },
      { text: 'Plug DC-GH01 back in so it can replicate and repair the others.', next: 'replug', set: { outcome: 'replugged' } },
    ],
  },
  preserve: {
    say: [[THEO, [
      'Okay. DC-CPH02 is unplugged and powered off, and I put a tag on it. Nobody touches it. DC-GH01 stays off until I can get someone physically in the Ghana office.',
      'It will hurt: logons will be slow until we have a plan. But it is the only copy of this domain that the worm has not touched.',
      '(In the real incident a single controller in Ghana, dark because of a power outage, was the only copy of the domain that survived. It was carried out of the country on foot because the link was too slow.)',
    ]]],
    end: true,
  },
  online: {
    say: [[THEO, [
      'Cancelled the task on DC-CPH02 and DC-LON01. They are staying up.',
      '...But the worm is still on them with the admin credentials in memory, and they can still be reached over SMB. If another copy of it lands on them the same way, they are gone, and we have no clean copy anywhere except a powered-off box in Ghana.',
      '(Stopping the task is a good step. Leaving the controllers connected is not containment.)',
    ]]],
    end: true,
  },
  reboot: {
    say: [[THEO, [
      'Rebooting now... wait. It is stuck at a disk-check screen. It says it is repairing the file system and it will not stop.',
      'That is the worm. The reboot just ran its code. DC-CPH02 is gone, and so is DC-LON01.',
      '(The queued reboot is the wipe. Rebooting an infected machine does the attacker\'s job for them.)',
    ]]],
    end: true,
  },
  replug: {
    say: [[THEO, [
      'Okay. Ghana is on its way to the server cabinet. They will plug it in and it will pull changes from everyone else.',
      '...Plugging in the only clean controller while the worm is moving through every site is how it stops being clean. Priya just told me to stop them.',
      '(The recovery plan is to keep the clean copy offline and restore from it, not to expose it to what you are trying to recover from.)',
    ]]],
    end: true,
  },
};

export const DC_SCORE = {
  id: 'dc',
  area: 'People',
  title: 'The domain controllers: keep a clean copy or reboot everything?',
  max: 15,
  teaches: { skill: 'Protect a clean copy of Active Directory and contain domain controllers before rebuilding', secplus: '4.8 Incident response: containment, recovery' },
  missing: { points: 5, what: 'Theo never came to you about the domain controllers.', why: 'The one decision that mattered in the real incident was protecting a clean controller. Nobody asked, so nothing was kept.' },
  outcomes: {
    'preserve-clean': { outcome: 'good', points: 15, what: 'You took a controller off the network and powered it down, kept DC-GH01 dark, and stopped the queued reboot elsewhere.', why: 'Right order. Contain what you can, and keep a clean copy of Active Directory out of reach until the rest is ready to be rebuilt around it. Microsoft\'s forest recovery guide starts from one known-good controller and expects you to have planned and practiced it.' },
    'cancel-online': { outcome: 'ok', points: 7, what: 'You cancelled the reboot task but left the controllers online.', why: 'Stopping the task helps, but the controllers are still infected, still hold admin credentials in memory, and are still reachable. Without a clean copy kept aside, one more mistake loses the domain.', cost: { amount: 2000000, text: 'Domain still at risk while the controllers stay connected (estimate for this replay)' } },
    rebooted: { outcome: 'bad', points: 0, what: 'You rebooted the controllers.', why: 'The scheduled reboot is the wipe. Rebooting an infected machine overwrites its boot record and encrypts its file table. A restart does not clean it.', cost: { amount: 15000000, text: 'Two more domain controllers lost, one fewer way back (estimate for this replay)' } },
    replugged: { outcome: 'bad', points: 2, what: 'You reconnected DC-GH01 while the worm was still active.', why: 'The Ghana controller was the one copy of the domain the worm had not touched. Exposing it to a live outbreak risks losing the only clean copy. Recover around it while it stays offline.', cost: { amount: 25000000, text: 'The one clean copy of Active Directory put at risk (estimate for this replay)' } },
  },
};

export const USERS_TALK = {
  start: {
    say: [
      [MIKE, [
        'Mike from Operations. We are getting calls from three offices. People say their PCs rebooted and now show a black screen that says it is repairing the disk, and then a message about paying.',
        'The helpdesk line is jammed. I need to put out one message to every office right now. What do I tell them?',
      ]],
    ],
    choices: [
      { text: 'If a PC shows the disk repair screen, switch it off at once and do not turn it back on. Leave unaffected PCs off the network and do not restart them. Call the helpdesk from a phone.', next: 'poweroff', set: { outcome: 'power-off' } },
      { text: 'Tell everyone to restart their PC, which clears most problems.', next: 'restart', set: { outcome: 'restart-all' } },
      { text: 'Tell them to wait for the disk repair to finish. It usually does.', next: 'wait', set: { outcome: 'wait' } },
      { text: 'Tell nobody yet. We should not cause panic until we are sure.', next: 'silent', set: { outcome: 'silent' } },
    ],
  },
  poweroff: {
    say: [[MIKE, [
      'Sent. "If you see a screen that says it is repairing the disk, switch the PC off and leave it off. Everyone else: unplug the network cable, do not restart, call the number on the poster."',
      'The helpdesk calls are slowing down. People are walking over to each other with phones instead.',
      '(Powering off during the fake disk repair stops the file-table encryption that the screen is hiding. Telling people before they reboot keeps unrun machines from running it.)',
    ]]],
    end: true,
  },
  restart: {
    say: [[MIKE, [
      'Sent. Three hundred PCs restarted in ten minutes.',
      '...And now the helpdesk says they all show the same disk-repair screen. The ones that were queued to reboot just did it for us.',
      '(Each infected PC had a reboot already queued. Telling everyone to restart brought the wipe forward on machines that still had time.)',
    ]]],
    end: true,
  },
  wait: {
    say: [[MIKE, [
      'Okay, told them to wait. People are leaving PCs on the disk-repair screen for an hour.',
      '...It looks like it finished, and now every one of them shows a ransom note. The screen was hiding the encryption of the file table the whole time.',
      '(The "disk repair" screen was cover: during it the malware encrypts the master file table.)',
    ]]],
    end: true,
  },
  silent: {
    say: [[MIKE, [
      'Okay, holding it. I will wait until the SOC is sure.',
      '...Twenty minutes later, a hundred more PCs have rebooted on their own. Nobody knew to keep them off.',
      '(Silence feels safe. A short message to switch off and unplug costs nothing and saves machines.)',
    ]]],
    end: true,
  },
};

export const USERS_SCORE = {
  id: 'users',
  area: 'People',
  title: 'The message to every office: restart, wait, or switch off?',
  max: 10,
  teaches: { skill: 'Give users a clear containment instruction during a destructive outbreak', secplus: '4.8 Incident response: communication' },
  missing: { points: 3, what: 'Mike never called about the user message.', why: 'In a wiper outbreak the first instruction users receive decides how many machines survive.' },
  outcomes: {
    'power-off': { outcome: 'good', points: 10, what: 'You told people to switch off PCs showing the disk-repair screen, and to unplug and not restart the others.', why: 'Right. The reboot is where the damage happens, and the repair screen hides the encryption. Cutting power and keeping unrun machines off the network saves the ones that have not rebooted yet.' },
    'restart-all': { outcome: 'bad', points: 0, what: 'You told everyone to restart.', why: 'Each infected PC had a queued reboot. Restarting runs the wipe early.', cost: { amount: 8000000, text: 'Hundreds of PCs lost that would have survived (estimate for this replay)' } },
    wait: { outcome: 'bad', points: 1, what: 'You told people to wait for the disk repair.', why: 'The repair screen is cover for the encryption of the file table. Waiting lets it finish.', cost: { amount: 5000000, text: 'Machines encrypted while their users waited (estimate for this replay)' } },
    silent: { outcome: 'ok', points: 3, what: 'You held the message.', why: 'Waiting for certainty cost machines. A short, safe instruction (switch off, unplug, call) does little harm even if you are wrong.', cost: { amount: 3000000, text: 'More machines rebooted during the delay (estimate for this replay)' } },
  },
};
