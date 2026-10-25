// Case file: PHP2Shell. Two conversations, both dramatizations (the people are fictional roles).
//   1. The web admin walks up right after the 10:00 release: patch and restart, mitigate, leave it up, or contain first?
//   2. The agent support lead phones: "are we hacked? can I tell agents we're fine?" The right answer is honest and early.
// Real basis: php.net says only an update is a complete solution and lists partial mitigations; the NSA advised taking sites
// offline if they could not update immediately; a patch does not remove a web shell planted earlier or secrets already leaked.

const ADMIN = 'Theo (playing the web admin)';

export const EXPOSURE_CALL = {
  start: {
    say: [
      [ADMIN, [
        'Hey. The PHP release is out. 8.2.35 for the agent portal, and it is the Apache mod_php box, the one php.net says is highest risk.',
        'Mike says agents are mid-quote and every minute offline costs. I can patch and restart it in fifteen minutes.',
        'What do you want me to do?',
      ]],
    ],
    choices: [
      { text: 'Put the portal behind a maintenance page now, snapshot the VM with memory, copy the Apache, WAF and audit logs, then patch to 8.2.35 and hunt back to Oct 17 before it comes back.', next: 'contain', set: { outcome: 'contain-hunt' } },
      { text: 'Patch and restart now. The release is out, that fixes it.', next: 'patch', set: { outcome: 'patch-only' } },
      { text: 'Apply the mitigations (upload progress off, a small post size) and keep it up. Patch tonight.', next: 'mitigate', set: { outcome: 'mitigate-only' } },
      { text: 'Leave it as it is. Our WAF and the hidden version header will cover us until the maintenance window.', next: 'open', set: { outcome: 'keep-open' } },
    ],
  },
  contain: {
    say: [[ADMIN, ['Okay. Maintenance page is up. Snapshot with memory is running, and I am copying the Apache, WAF and audit logs to the evidence share.', 'Then 8.2.35. I will look at the old intranet box too.', 'It is going to be a long day.']]],
    end: true,
  },
  patch: {
    say: [[ADMIN, ['On it. Patching and restarting Apache.', '...Done, back up. Hm. The restart also cleared /tmp and every worker process. Was something in there you needed?', '(Patching closes the door from now on. It does not tell you who already came through.)']]],
    end: true,
  },
  mitigate: {
    say: [[ADMIN, ['Okay. session.upload_progress is off in php.ini, workers restarted, post_max_size is down.', 'php.net said only an update is a complete fix, though, and it blocks the confirmed session paths but not other variants. Tonight, then.']]],
    end: true,
  },
  open: {
    say: [[ADMIN, ['Okay, leaving it alone.', 'Hmm. About four in five exposed PHP hosts hide their version, and they are still vulnerable. And the WAF has only been logging, not blocking. But fine.']]],
    end: true,
  },
};

export const EXPOSURE_SCORE = {
  id: 'exposure',
  area: 'People',
  title: 'The fix is out and the portal is the riskiest PHP host we have',
  max: 15,
  teaches: { skill: 'Contain and preserve evidence before you patch a web server that may already be hit', secplus: '4.8 Incident response: containment, evidence preservation' },
  missing: { points: 4, what: 'It never came up.', why: '' },
  outcomes: {
    'contain-hunt': { outcome: 'good', points: 15, what: 'You took the portal offline, kept the evidence, and hunted from Oct 17 before patching.', why: 'This is the order the advice points to. Amazon said to start from Oct 17, NSA said to go offline if you cannot update at once, and php.net says an update is the complete fix. Snapshot first so the memory and /tmp survive, patch by rebuilding or upgrading, then hunt before you let anyone back in.' },
    'patch-only': { outcome: 'ok', points: 7, what: 'You patched and restarted, with no hunt and no evidence kept.', why: 'Patching was necessary and the speed is right. But the bugs were exploited from Oct 17, a patch does not remove a planted web shell or a leaked secret, and the restart threw away the memory and /tmp. Patch is the start of the response, not the end.', cost: { amount: 120000, text: 'Evidence lost and any shell left in place (estimate for this replay)' } },
    'mitigate-only': { outcome: 'bad', points: 2, what: 'You applied partial mitigations and kept the portal online for another day.', why: 'php.net is clear that only an update is a complete solution. The mitigations block the confirmed session paths and not other variants. With exploitation seen since Oct 17, waiting until tonight is a long time on the riskiest host.', cost: { amount: 300000, text: 'A day more on a vulnerable mod_php host (estimate for this replay)' } },
    'keep-open': { outcome: 'bad', points: 0, what: 'You left the portal as it was and relied on the WAF and the hidden version.', why: 'The WAF was in detection-only mode, and hiding the version header only hides it. The bug is reached with a multipart request before any app code runs. Leaving the riskiest host untouched on the day the fix is public, with exploitation seen since Oct 17, is the worst of the four.', cost: { amount: 600000, text: 'An open door on the riskiest host while the exploit is public (estimate for this replay)' } },
  },
};

const CALLER = 'Agent support lead · +1 (330) 555-0187';

export const EXEC_CALL = {
  start: {
    say: [
      [CALLER, [
        'Hi, it is the agent support lead. The agent portal is showing a maintenance page and my phones are lit up.',
        'The news says PHP is "on fire" and a couple of agents have asked if we were hacked.',
        'Are we hacked? Can I tell them we are fine and it is just maintenance?',
      ]],
    ],
    choices: [
      { text: 'Yes, tell them it is just maintenance. Everything is fine.', next: 'assure', set: { outcome: 'false-assurance' } },
      { text: 'We are investigating a possible compromise of the agent portal. We took it offline as a precaution, we have not confirmed whether agent data was accessed, and you will hear from us at 1 PM. Please tell agents to use phone support for now.', next: 'honest', set: { outcome: 'honest' } },
      { text: 'I cannot discuss anything. Talk to legal.', next: 'stonewall', set: { outcome: 'stonewall' } },
      { text: 'Tell agents their data has been stolen and they must change all their passwords everywhere today.', next: 'overstate', set: { outcome: 'overstate' } },
    ],
  },
  assure: {
    say: [[CALLER, ['Oh, great. I will tell them it is just maintenance and they can relax.']], ['You', ['(You have no logs reviewed and a shell alert open. You just promised something you cannot prove.)']]],
    end: true,
  },
  honest: {
    say: [
      [CALLER, ['Okay. Thank you for being straight with me. 1 PM, phone support, understood.', 'One more thing. Some agents will ask whether they should change their password. What do I say?']],
    ],
    choices: [
      { text: 'We will invalidate every agent session and force a password reset when the rebuilt portal returns. Announce it on the status page and by phone, and tell agents we will never send a "reset your password" link by email.', next: 'reset', set: { outcome: 'honest-reset' } },
      { text: 'Tell them to wait. I will know more later.', next: 'vague', set: { outcome: 'honest-vague' } },
    ],
  },
  stonewall: {
    say: [[CALLER, ['That does not help me. I will have to assume the worst, and so will the agents.', '(She hangs up. The rumor mill fills the gap you left.)']]],
    end: true,
  },
  overstate: {
    say: [[CALLER, ['Everything? You are sure? We will have to notify thousands of agents on your word.', 'That is a huge call. I hope you checked.']]],
    end: true,
  },
  reset: {
    say: [[CALLER, ['That I can say. A forced reset, announced by phone and the status page, no email links.', 'Thank you. That is the answer agents will trust.']]],
    end: true,
  },
  vague: {
    say: [[CALLER, ['Okay. They will ask, though, and "wait" is not much.']]],
    end: true,
  },
};

export const EXEC_SCORE = {
  id: 'exec',
  area: 'Phone call',
  title: 'The agent support lead asks: are we hacked, and can I say we are fine?',
  max: 15,
  teaches: { skill: 'Communicate honestly about an incident while the scope is still unknown', secplus: '4.8 Incident response: communication plan' },
  missing: { points: 5, what: 'You never took the call.', why: 'Support teams and agents fill the silence with guesses.' },
  outcomes: {
    'honest-reset': { outcome: 'good', points: 15, what: 'You told the truth, gave a time for the next update, and set up a safe way to handle passwords.', why: 'Say what you know, what you do not, and when they will hear again. Give agents a channel (phone) and a reason not to trust email links, because fake "reset your password" and fake patch emails follow every incident like this.' },
    'honest-vague': { outcome: 'good', points: 12, what: 'You were honest, but "wait" left support with nothing to tell agents about passwords.', why: 'The honest status was right. Have the next step ready: a forced reset after the rebuild, announced through a channel agents can trust.' },
    stonewall: { outcome: 'ok', points: 6, what: 'You referred the caller to legal and gave no information.', why: 'Legal should be involved, but a support team that knows nothing will assume the worst and tell agents the same. A short factual status and a time for the next update is better than a wall.' },
    overstate: { outcome: 'ok', points: 5, what: 'You told them the data was stolen before the logs say so.', why: 'The logs show a web shell and a large database read, but you have not scoped it yet. Overstating sets off panic you may have to walk back. Say what the logs support and what you are still checking.' },
    'false-assurance': { outcome: 'bad', points: 0, what: 'You told support it was just maintenance and everything is fine.', why: 'It was not true: an Apache worker had just started a shell. A false "we are fine" is worse than silence, because agents keep using their passwords and later find out from someone else.', cost: { amount: 250000, text: 'Agents who find out from the news and a support team that repeated your words (estimate for this replay)' } },
  },
};
