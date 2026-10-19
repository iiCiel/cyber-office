// Case file: Microsoft / Midnight Blizzard. Two walk-up conversations, each testing a decision the public record shows was real:
//   1. Who needs to know, and how fast (Microsoft detected Jan 12, disclosed in an SEC 8-K on Jan 19, 2024)
//   2. Secrets that were sitting in mail (Microsoft's March 8 update: some of the secrets were shared between customers and
//      Microsoft in email, and the actor used information from the mailboxes to try to reach other systems)
// The people are the game's cast playing roles; nothing here is a quote from a real person.

const MIKE = 'Mike (playing a business executive)';
const THEO = 'Theo (playing a cloud engineer)';

export const DISCLOSE_TALK = {
  start: {
    say: [
      [MIKE, [
        'Got a minute? Legal just told me my mailbox is on the list of the ones the apps read. So is the General Counsel\'s.',
        'The board meets Monday and the quarter closes in three weeks. If this goes out as a "material incident" the stock will take a hit.',
        'Can we keep it quiet until we know more? We can say more when we are sure.',
      ]],
    ],
    choices: [
      { text: 'No. I will brief the CISO and Legal now so the disclosure committee can decide on materiality. We write down what we know and when we learned it.', next: 'process', set: { outcome: 'process' } },
      { text: 'Fine. I will keep it inside Security until the investigation is done.', next: 'quiet', set: { outcome: 'quiet' } },
      { text: 'I will tell Legal, but not the board or the auditors until we know the numbers.', next: 'partial', set: { outcome: 'partial' } },
      { text: 'Let us put out a public statement today so we are ahead of it.', next: 'early', set: { outcome: 'early' } },
    ],
  },
  process: {
    say: [
      [MIKE, ['...Okay. That is not what I hoped to hear.']],
      ['You', ['(You explain that Legal decides materiality, not Security and not him. You tell him not to delete or edit anything, and to avoid email about it. You write the timeline: first suspicious sign-in, detection, containment.)']],
      [MIKE, ['Legal wants to move fast. They say the SEC rule is four business days from the moment we decide it is material, not from when we found it. So the decision itself cannot drag.']],
    ],
    end: true,
  },
  quiet: {
    say: [
      [MIKE, ['Good. Thank you. Let us keep it small.']],
      ['You', ['(Legal does not know. The disclosure committee does not know. If this later turns out to be material, the company will have had days of knowledge it did not act on, and no record of why. The decision about materiality was never made by the people whose job it is.)']],
    ],
    end: true,
  },
  partial: {
    say: [
      [MIKE, ['Legal only. That works for now.']],
      ['You', ['(Legal gets the facts, which is right. But "not the board, not the auditors" is a decision for Legal and the disclosure committee to make, not for Security to make for them, and not for a business owner to ask for. Telling only some of the people who need to know is how a record of the delay gets written.)']],
    ],
    end: true,
  },
  early: {
    say: [
      [MIKE, ['A statement today? Without knowing what was taken?']],
      ['You', ['(You do not know yet. Whether an incident is material, what the statement says, and when it goes out are Legal\'s call. A statement that guesses what was taken can be wrong in either direction, and has to be corrected later. Tell Legal first.)']],
    ],
    end: true,
  },
};

export const DISCLOSE_SCORE = {
  id: 'disclose',
  area: 'People',
  title: 'The executive who wants it kept quiet',
  max: 15,
  teaches: { skill: 'Escalate an incident to Legal and the disclosure process instead of hiding it', secplus: '5.2 Risk management and governance; 4.8 Incident response: communication' },
  missing: { points: 5, what: 'Mike never came to you about it.', why: 'In a real incident someone with something to lose will ask you to keep it quiet. The answer has to be ready before they ask.' },
  outcomes: {
    process: { outcome: 'good', points: 15, what: 'You said no and took it to the CISO and Legal.', why: 'Right. Whether an incident is material is for Legal and the disclosure committee to decide, quickly. Under the SEC rule that took effect in December 2023, a Form 8-K Item 1.05 is generally due four business days after a company determines an incident is material. Microsoft filed on Jan 19, 2024, a week after it detected the activity on Jan 12.' },
    early: { outcome: 'ok', points: 6, what: 'You wanted to announce right away.', why: 'The instinct to be open is better than hiding, but Security does not decide what is said or when. A hasty statement about what was or was not taken is often wrong. Send the facts to Legal, who decides.' },
    partial: { outcome: 'ok', points: 6, what: 'You told Legal but agreed to hold back the rest.', why: 'Telling Legal is right. Agreeing to keep the board and auditors out of it is not your decision, and it is how a delay turns into a cover-up. Legal decides who is told and when.', cost: { amount: 150000, text: 'A documented delay in telling the people who needed to know (estimate for this recreation)' } },
    quiet: { outcome: 'bad', points: 0, what: 'You agreed to keep it quiet.', why: 'Nobody who decides materiality was told. If the incident is later found to be material, the company has days of knowledge it did not act on. The SEC four-business-day clock runs from the materiality decision, and "we did not ask" is not a defense.', cost: { amount: 2000000, text: 'Regulatory exposure and loss of trust from an unreported incident (estimate for this recreation)' } },
  },
};

export const SECRETS_TALK = {
  start: {
    say: [
      [THEO, [
        'I went through the folders the apps read. The Customer Escalations folder in the security mailbox has a few emails I did not expect.',
        'One customer emailed us a client secret for their API integration in November. Another sent a VPN pre-shared key to get a case moving. They are still in the mailbox in plain text.',
        'The apps read that folder on Wednesday. Do we have to do something about it now, or can it wait until we are sure what they took?',
      ]],
    ],
    choices: [
      { text: 'Treat them as stolen. Tell the customers today, have them rotate the secret and the key, and look for their use from unfamiliar addresses.', next: 'rotate', set: { outcome: 'rotate-notify' } },
      { text: 'Wait until the investigation confirms exactly which emails were taken.', next: 'wait', set: { outcome: 'wait' } },
      { text: 'Delete the emails so they cannot be read again.', next: 'delete', set: { outcome: 'delete' } },
      { text: 'Rotate our own copies of the secrets and leave the customers alone. It is their problem.', next: 'ours', set: { outcome: 'ours-only' } },
    ],
  },
  rotate: {
    say: [
      [THEO, ['Okay. I am writing the notice now: what we saw, which secret, what to do, and where to reach us. I will ask each customer to check their own logs for the secret in use from outside their normal ranges.']],
      ['You', ['(You also ask him to move the secrets out of the mailbox into a vault, and to tell the customers not to send secrets by email again.)']],
    ],
    end: true,
  },
  wait: {
    say: [
      [THEO, ['Okay. We can confirm later which emails were taken.']],
      ['You', ['(The audit log can say which folders were read, but it may not prove which messages were not. Customers are exposed from the moment the apps read the folder. Microsoft said in March 2024 that the actor was using information from the mailboxes to try to reach other systems, including secrets shared in email, and that it was contacting affected customers.)']],
    ],
    end: true,
  },
  delete: {
    say: [
      [THEO, ['Deleted. That is... a lot of mail gone.']],
      ['You', ['(Deleting does nothing about a copy already taken, destroys evidence of what was read and what was sent, and may break a legal hold. The secrets are still valid. Rotate first; keep the evidence.)']],
    ],
    end: true,
  },
  ours: {
    say: [
      [THEO, ['So we rotate ours and say nothing to them?']],
      ['You', ['(The customers\' secret is what the attacker holds. Only they can rotate it. If they do not know, their systems are exposed and ours were the way in.)']],
    ],
    end: true,
  },
};

export const SECRETS_SCORE = {
  id: 'secrets',
  area: 'People',
  title: 'Customer secrets that were sitting in the mailbox',
  max: 15,
  teaches: { skill: 'Treat secrets in exposed mail as compromised: rotate and notify, do not wait or delete', secplus: '4.8 Incident response: containment and notification; 4.6 Secrets management' },
  missing: { points: 5, what: 'Theo never came to you about the secrets.', why: 'Mailboxes are full of passwords, keys and tokens people were told not to send. An intruder with mailbox access reads them first.' },
  outcomes: {
    'rotate-notify': { outcome: 'good', points: 15, what: 'You treated the secrets as stolen and told the customers.', why: 'Right. Microsoft\'s March 8, 2024 update said the actor was using information from the exfiltrated email to try to gain further access, and that some of the secrets were shared between customers and Microsoft by email. CISA\'s Emergency Directive 24-02 told federal agencies to reset credentials found in the exfiltrated mail. Assume exposed, rotate, tell the owner.' },
    ours: { outcome: 'ok', points: 5, what: 'You rotated your own copies but left the customers out.', why: 'Half right. The secret the attacker holds is the customer\'s, and only the customer can rotate it. If they do not know, their systems stay exposed.', cost: { amount: 300000, text: 'A customer breached through a secret we lost, and no warning (estimate for this recreation)' } },
    wait: { outcome: 'bad', points: 0, what: 'You waited for the investigation.', why: 'Proof of exactly what was read can take weeks. In the meantime the secrets work for whoever holds them. Treat anything in a mailbox the attacker read as stolen.', cost: { amount: 800000, text: 'Customer systems reached with secrets we knew were exposed (estimate for this recreation)' } },
    delete: { outcome: 'bad', points: 0, what: 'You deleted the emails.', why: 'Deleting does not help against a copy already taken, it destroys evidence, and it can violate a legal hold. The secrets stay valid. Rotate them instead.', cost: { amount: 500000, text: 'Evidence lost and the secrets still valid (estimate for this recreation)' } },
  },
};
