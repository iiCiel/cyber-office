// Day 3: Theo wants the WAF turned off so his release can ship. Change management under pressure.
export const THEO_WAF = {
  start: {
    say: [
      ['Theo Okoye (Developer)', [
        'Hey. I heard the portal got hit. Rough.',
        "Now IT switched the WAF to blocking mode, and it's flagging MY release as an attack. My deploy fails every time.",
        'Can you turn the WAF off for an hour? I swear I\'ll turn it back on. The release has to ship today.',
      ]],
    ],
    choices: [
      { text: 'Sure, turning it off for an hour.', next: 'disable', set: { outcome: 'disabled' } },
      { text: "No. File an emergency change request, and I'll help you add a narrow exception for your deploy server only.", next: 'change', set: { outcome: 'change-request' } },
      { text: "That's not my call alone. Let's take it to Priya and the change board.", next: 'escalate', set: { outcome: 'escalated' } },
    ],
  },
  disable: {
    say: [['Theo Okoye (Developer)', ['Legend. Deploying now.']], ['You', ['(The portal sits unprotected while it ships. Nobody turns the WAF back on until 4 PM.)']]],
    end: true,
  },
  change: {
    say: [['Theo Okoye (Developer)', ['Ugh. Fine. Fair, after last night.', 'Change request filed. If the exception is just my build server, I can live with that.']]],
    end: true,
  },
  escalate: {
    say: [['Theo Okoye (Developer)', ["Okay, I'll grab Priya. The release can slip a day, I guess."]]],
    end: true,
  },
};
