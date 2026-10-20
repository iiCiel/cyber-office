// Lab: Theo (playing the sysadmin who owns WEB02) wants to fix it fast. What he does is the test.
const THEO = 'Theo (playing the WEB02 sysadmin)';

export const WEB_TALK = {
  start: {
    say: [[THEO, [
      'Hey. WEB02 is mine and it looks wrong this morning. There is a status.php in the uploads folder I did not put there, and the backup script ran as root overnight when it should not have.',
      'I can have it fixed in ten minutes: delete the file, reboot it clean, done. The claims portal needs to be up by nine.',
      'That okay?',
    ]]],
    choices: [
      { text: 'No reboot. Pull it off the network but leave it running, take a disk and memory image, then we investigate and rebuild from clean.', next: 'good', set: { outcome: 'isolate-image' } },
      { text: 'Reboot it clean and delete status.php. Uptime matters.', next: 'reboot', set: { outcome: 'rebooted' } },
      { text: 'Leave it up and serving while we look. We cannot take the portal down.', next: 'leave', set: { outcome: 'left-up' } },
    ],
  },
  good: { say: [[THEO, ['Okay. Isolated the port, took a snapshot with memory, and stood up a replacement from the golden image.', 'The snapshot caught the running processes and the shell history. Good call.', '(Isolate to stop the bleeding, image to keep the evidence, rebuild rather than clean — you cannot trust a box that was root-level owned.)']]], end: true },
  reboot: { say: [[THEO, ['Rebooted. Back up in four minutes.', '...Wait. It phoned out again two minutes after boot. And the memory is gone. There was a cron job and a systemd service I did not know about.', '(A reboot wiped the evidence and the persistence restarted the attacker. Deleting one file was never going to be enough.)']]], end: true },
  leave: { say: [[THEO, ['Left it up.', '...It is still talking to that address, and now there is a root SSH session on it I did not open.', '(A public box that was rooted and is actively exfiltrating has to come off the network, portal or no portal.)']]], end: true },
};

export const WEB_SCORE = {
  id: 'web',
  area: 'People',
  title: 'The rooted server: reboot, leave it up, or isolate and image?',
  max: 15,
  teaches: { skill: 'Contain a compromised server without destroying the evidence or leaving persistence', secplus: '4.8 Incident response: containment, evidence preservation' },
  missing: { points: 5, what: 'Theo never came to you about WEB02.', why: 'A rooted, internet-facing server is the thing that most needs a steady hand. Left to the owner, it gets rebooted and the evidence and the reason are gone.' },
  outcomes: {
    'isolate-image': { outcome: 'good', points: 15, what: 'You isolated WEB02, imaged it, and rebuilt from clean.', why: 'Right order. Isolate so the attacker and the exfil stop, image so you keep the memory and processes, rebuild because a root-level compromise cannot be cleaned in place with any confidence.' },
    rebooted: { outcome: 'bad', points: 2, what: 'You rebooted it to clean it.', why: 'The reboot wiped the memory you needed, and the persistence (cron, systemd, the SSH key) brought the attacker straight back. A "clean" box that reinfects itself is not clean.', cost: { amount: 120000, text: 'Evidence lost and the attacker regained access (estimate for this lab)' } },
    'left-up': { outcome: 'bad', points: 0, what: 'You left WEB02 serving while you investigated.', why: 'Every minute it was up, it kept exfiltrating and the attacker kept a live root session. A rooted public server comes off the network first.', cost: { amount: 200000, text: 'More data out, more time for the attacker (estimate for this lab)' } },
  },
};
