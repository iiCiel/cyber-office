// Case file: SolarWinds / SUNBURST. Two walk-up conversations, each a decision the public record shows real victims faced:
//   1. Turn the monitoring server off now, or wait? (CISA ED 21-01 said disconnect or power down; a reboot loses memory evidence)
//   2. Which credentials to reset when the compromised software stored all of them (CISA, Microsoft and FireEye all stress credential
//      reset and the SAML token-signing certificate, not just the product)
// The people are the game's cast playing roles; nothing here is a quote from a real person.

const MIKE = 'Mike (playing the head of operations)';
const THEO = 'Theo (playing the infrastructure lead)';

export const OFF_TALK = {
  start: {
    say: [
      [MIKE, [
        'Got a minute? Theo says ORION01 is on the list. It is also the thing that tells us when a switch or a link dies. On a Monday morning with the quarter-end close this week.',
        'The vendor says install the hotfix tonight and it is fixed. Can we just do that and keep monitoring running until then?',
      ]],
    ],
    choices: [
      { text: 'Not yet and not the way you think. We image ORION01 first (memory and disk), then disconnect it from the network, and cover the monitoring gap by hand and with the firewall\'s own alerts.', next: 'image', set: { outcome: 'image-isolate' } },
      { text: 'Keep it running until the hotfix tonight so we do not lose monitoring.', next: 'keep', set: { outcome: 'keep' } },
      { text: 'Install the hotfix now, in place, and keep it online.', next: 'patch', set: { outcome: 'patch' } },
      { text: 'Pull the plug right now. Safest.', next: 'plug', set: { outcome: 'pull-plug' } },
    ],
  },
  image: {
    say: [
      [MIKE, ['...Okay. How long are we blind for?']],
      ['You', ['(You tell him: about an hour to take the images, then the server stays off the network. For the gap, two people watch the firewall and core switch alerts by hand, and Theo builds a clean monitoring server. You write down the time of each step.)']],
      [MIKE, ['I can sell that. A day of blind spots is cheaper than the other thing.']],
    ],
    end: true,
  },
  keep: {
    say: [
      [MIKE, ['Great. Tonight, then.']],
      ['You', ['(Every hour it stays online the backdoor can keep talking to its server and the actors can keep using the account Orion holds. The hotfix will replace the DLL, but the dropper, the stolen certificate and any credential it read stay. Waiting a day for the sake of monitoring is exactly the trade CISA\'s directive said not to make.)']],
    ],
    end: true,
  },
  patch: {
    say: [
      [MIKE, ['The hotfix, now, and it stays up. Done.']],
      ['You', ['(The upgrade overwrites the DLL and the logs that would show the actors\' tools, and leaves a live server in an unknown state on the network. The stolen certificate and the added app credential are not touched at all. Patching is not cleanup.)']],
    ],
    end: true,
  },
  plug: {
    say: [
      [MIKE, ['Gone. It is off. Good.']],
      ['You', ['(You contain it, but you pulled the power with no image. A memory-only dropper (the TEARDROP FireEye describes) and the BEACON in memory are gone with it, and you cannot say what the actors read. Contain, yes. Image first, if you can.)']],
    ],
    end: true,
  },
};

export const OFF_SCORE = {
  id: 'off',
  area: 'People',
  title: 'The monitoring server that everyone relies on',
  max: 15,
  teaches: { skill: 'Contain a compromised system without destroying the evidence: image, then isolate, then rebuild', secplus: '4.8 Incident response: containment and evidence; 4.2 Forensics' },
  missing: { points: 5, what: 'Mike never came to you about it.', why: 'In a real incident the owner of the compromised system will ask you to keep it running. The answer has to be ready before they ask.' },
  outcomes: {
    'image-isolate': { outcome: 'good', points: 15, what: 'You imaged ORION01, disconnected it, and planned the gap.', why: 'Right. CISA ED 21-01 told federal agencies to disconnect or power down affected Orion servers and to take forensic images of memory and disk where possible. Imaging first keeps the evidence of what the actors ran in memory. A day of manual monitoring is a cost you can plan; an actor with credentials is not.' },
    'pull-plug': { outcome: 'ok', points: 8, what: 'You powered it off straight away.', why: 'Containing it was right. But a hard power-off loses everything in memory: the dropper and the BEACON FireEye describes live there. Take the image first when you can; the server will not reach the network in the hour it takes.', cost: { amount: 120000, text: 'Memory evidence lost, so the scope of the compromise has to be assumed (estimate for this recreation)' } },
    patch: { outcome: 'bad', points: 0, what: 'You patched it and left it online.', why: 'The hotfix replaces the DLL. It does not remove the dropper, the beacon, the stolen credentials or the stolen signing certificate, and it overwrites evidence. The server was still on the network with a Domain Admin account.', cost: { amount: 900000, text: 'Actors keep their access and the evidence of what they did is gone (estimate for this recreation)' } },
    keep: { outcome: 'bad', points: 0, what: 'You kept it running until the hotfix.', why: 'Every hour online is another hour the backdoor can reach its server and use the account Orion holds. Monitoring blindness for a day is an inconvenience; a compromised identity server is a breach.', cost: { amount: 1200000, text: 'Another day of attacker access to a monitoring server with Domain Admin (estimate for this recreation)' } },
  },
};

export const CREDS_TALK = {
  start: {
    say: [
      [THEO, [
        'I went through what ORION01 holds. It uses svc-solarwinds, and that account is a Domain Admin. It also stores SNMP strings and logins for forty switches and the firewalls. And it can reach ADFS01.',
        'I can reset svc-solarwinds in two minutes. Is that enough? Or is it more than that?',
      ]],
    ],
    choices: [
      { text: 'More. Treat everything Orion stored or used as stolen: the service account, SNMP and device logins, any admin who signed in to ORION01. And check ADFS01, because the identity server is one hop away and holds the token-signing certificate.', next: 'all', set: { outcome: 'rotate-all' } },
      { text: 'Reset svc-solarwinds and we are done.', next: 'svc', set: { outcome: 'svc-only' } },
      { text: 'Wait until we know what the actors actually read, then reset only that.', next: 'wait', set: { outcome: 'wait' } },
      { text: 'Take svc-solarwinds out of Domain Admins but leave the password.', next: 'remove', set: { outcome: 'remove-da' } },
    ],
  },
  all: {
    say: [
      [THEO, ['Okay. Forty switches, the firewalls, the service account. And ADFS01... I will start a list. If they got to the signing certificate, a password reset does nothing, right?']],
      ['You', ['(Right. You tell him to check ADFS01 for tools, to read the ADFS audit log against the Entra sign-ins, and to plan a rotation of the token-signing certificate. You also ask him to move Orion off Domain Admin and onto a least-privilege account.)']],
    ],
    end: true,
  },
  svc: {
    say: [
      [THEO, ['Reset. Two minutes. Should I tell the switch team?']],
      ['You', ['(The device logins and SNMP strings are still in the actors\' hands, and so is anything they reached with the account before the reset. And you have not looked at ADFS01, which is where FireEye and Microsoft both say the real victims were taken next.)']],
    ],
    end: true,
  },
  wait: {
    say: [
      [THEO, ['Okay. We find out what they read, then rotate.']],
      ['You', ['(You cannot prove what they read, and the logs may not say. CISA\'s guidance is to assume the credentials are stolen and reset them. The actors in this campaign were patient; waiting is giving them time.)']],
    ],
    end: true,
  },
  remove: {
    say: [
      [THEO, ['Done: no more Domain Admin. Password unchanged.']],
      ['You', ['(Good habit, wrong order. The password is still known to the actors, and it still opens every server the account was allowed on. Removing privilege is right as well as a reset, not instead of one.)']],
    ],
    end: true,
  },
};

export const CREDS_SCORE = {
  id: 'creds',
  area: 'People',
  title: 'Which credentials did the monitoring server hold?',
  max: 15,
  teaches: { skill: 'Scope a credential reset to everything the compromised system stored, and look at the identity systems next to it', secplus: '4.6 Identity and access management; 4.8 Incident response: eradication' },
  missing: { points: 5, what: 'Theo never came to you about the credentials.', why: 'A monitoring server holds the keys to everything it watches. The question "what did it know?" has to be asked by someone.' },
  outcomes: {
    'rotate-all': { outcome: 'good', points: 15, what: 'You treated every Orion credential as stolen and pointed Theo at ADFS01.', why: 'Right. CISA and Microsoft both told victims to reset every credential the Orion software used or stored, and to look at the identity infrastructure (the SAML token-signing certificate) for tampering. FireEye wrote that the actors moved from Orion to the identity systems.' },
    'remove-da': { outcome: 'ok', points: 6, what: 'You removed Domain Admin but kept the password.', why: 'Least privilege is right and overdue, but the actors already hold the password and everything it opened. Do both: remove the rights and reset the secret.', cost: { amount: 250000, text: 'Credentials still valid for everything the account could reach before the change (estimate for this recreation)' } },
    'svc-only': { outcome: 'ok', points: 5, what: 'You reset the service account and stopped there.', why: 'A reset helps, but Orion also stored device logins and SNMP strings, and the identity servers were not examined. FireEye and Microsoft both describe the actors reaching ADFS and signing their own tokens.', cost: { amount: 600000, text: 'Device credentials and the signing certificate still in the actors\' hands (estimate for this recreation)' } },
    wait: { outcome: 'bad', points: 0, what: 'You waited to see what they read.', why: 'You cannot prove what was read, and every day of waiting is a day the credentials work. Assume stolen, rotate, then investigate.', cost: { amount: 1000000, text: 'Credentials used for further access while waiting (estimate for this recreation)' } },
  },
};
