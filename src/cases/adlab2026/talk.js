// Lab: one walk-up conversation. Theo (playing the database engineer) has found the leftovers on CLAIMS-DB01.
// The test is the classic one: preserve evidence and contain, or make it "clean" and destroy what you need.

const THEO = 'Theo (playing the database engineer)';

export const DB_TALK = {
  start: {
    say: [
      [THEO, [
        'Morning. Sorry to grab you. CLAIMS-DB01 did something odd overnight.',
        'There is a 41 MB file in C:\\Windows\\Temp called ms.dmp that I did not create. It is gone now, deleted a few minutes after it appeared, but the Temp folder timestamps look strange.',
        'Also Dana\'s admin session from Friday is still open on that server. Can I just reboot it and clear everything out?',
      ]],
    ],
    choices: [
      { text: 'Do not reboot. Pull the network cable (or isolate the port), take a memory and disk snapshot, then we investigate.', next: 'preserve', set: { outcome: 'preserve-isolate' } },
      { text: 'Reboot it. A clean server is a safe server.', next: 'reboot', set: { outcome: 'rebooted' } },
      { text: 'Leave it running as is. It is probably the backup job.', next: 'leave', set: { outcome: 'left' } },
    ],
  },
  preserve: {
    say: [[THEO, [
      'Okay. Isolated the port, and I took a snapshot with memory.',
      'The snapshot has the running processes. I can also see a disconnected session for a.admin that has been there since Friday.',
      '(Memory is where the attacker\'s tools and the stolen credentials were. You just kept it.)',
    ]]],
    end: true,
  },
  reboot: {
    say: [[THEO, [
      'Rebooted. Back up in four minutes, all green.',
      '...Wait. The memory is gone. And the logs only go back to the boot. That was the one place the dump command and its parent process were still visible.',
      '(Isolate and image first. A reboot erases RAM, which is where credential theft tools live.)',
    ]]],
    end: true,
  },
  leave: {
    say: [[THEO, [
      'Okay, leaving it.',
      '...Hm. It is still talking to an address I do not know. I will ask again at lunch.',
      '(An unexplained file and a long-lived admin session on a server are not "probably the backup job." Every hour you wait is another hour of access.)',
    ]]],
    end: true,
  },
};

export const DB_SCORE = {
  id: 'db',
  area: 'People',
  title: 'The database server: reboot, leave it, or preserve?',
  max: 15,
  teaches: { skill: 'Contain a compromised server without destroying the evidence', secplus: '4.8 Incident response: containment, evidence preservation' },
  missing: { points: 5, what: 'Theo never came to you about the server.', why: 'A compromised database server is where the stolen credentials were taken. If nobody secures its memory, the evidence is lost on the next reboot.' },
  outcomes: {
    'preserve-isolate': { outcome: 'good', points: 15, what: 'You isolated the server and took memory and disk snapshots before touching it.', why: 'Right order. Isolate so the attacker cannot reach it, snapshot so the memory and logs are kept, then investigate. Credential-dumping tools leave traces in RAM that disappear on reboot.' },
    rebooted: { outcome: 'bad', points: 2, what: 'You rebooted the server to "clean" it.', why: 'It looks cleaner, but a reboot erases memory, which is where the attacker\'s dump command and the credentials lived. A clean server is not a safe one: the attacker still has what they took.', cost: { amount: 120000, text: 'Evidence lost; the investigation can no longer prove exactly what was taken (estimate for this lab)' } },
    left: { outcome: 'bad', points: 0, what: 'You left the server running and connected.', why: 'The attacker had a foothold on that server and was still connected. Leaving it "to look at later" gives them more time.', cost: { amount: 200000, text: 'More access, more time, more stolen credentials (estimate for this lab)' } },
  },
};
