// Day 3: Theo wants the WAF turned off so his release can ship. Change management under pressure.
// Theo talks like a developer on a deadline: pipeline, prod, false positives, release window.
export const THEO_WAF = {
  start: {
    say: [
      ['Theo Okoye (Developer)', [
        'Hey. Heard about the portal last night. Rough.',
        'So IT flipped ModSecurity to blocking, and rule 942100 is eating my deploy. The 4.2 smoke tests POST JSON with SQL-looking strings and it 403s every one.',
        "Can you turn the WAF off for an hour? I'll flip it back myself, swear. The release window closes at noon.",
      ]],
    ],
    choices: [
      { text: 'Sure, off for an hour.', next: 'disable', set: { outcome: 'disabled' } },
      { text: "No. Raise an emergency change, and I'll help you scope an exclusion for 942100 from your build runner's IP only.", next: 'change', set: { outcome: 'change-request' } },
      { text: "That's not mine to approve, not the morning after a breach. Let's take it to Priya and the emergency CAB.", next: 'escalate', set: { outcome: 'escalated' } },
    ],
  },
  disable: {
    say: [['Theo Okoye (Developer)', ['Legend. Kicking the pipeline now.']], ['You', ['(The portal ships with no WAF in front of it. Nobody turns it back on until 4 PM.)']]],
    end: true,
  },
  change: {
    say: [['Theo Okoye (Developer)', ['Ugh. Yeah, fair, after last night.', "Emergency change is in. If the exclusion is just the build runner and just that rule, I can live with it."]]],
    end: true,
  },
  escalate: {
    say: [['Theo Okoye (Developer)', ["Fine. I'll grab Priya. 4.2 slips to tomorrow, I guess. Product is going to love that."]]],
    end: true,
  },
};
