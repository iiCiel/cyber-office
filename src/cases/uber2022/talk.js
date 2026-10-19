// Case file: Uber 2022. The Slack message. In the real incident, employees reportedly reacted with
// emoji and jokes at first, because nobody believed a hacker would announce himself in #general.

export const SLACK_GENERAL = {
  start: {
    say: [
      ['Mike (playing an Uber engineer)', [
        'Dude. Have you seen #general?',
        'Some account just posted: "I announce I am a hacker and Uber has suffered a data breach." Then a list of systems.',
        "Half the company is replying with emoji. Someone posted a popcorn GIF. It's a joke, right? Like a red-team thing?",
      ]],
    ],
    choices: [
      { text: "That's not a joke. Don't reply, screenshot it, and tell your team to stay out of the thread. I'm escalating now.", next: 'escalated', set: { outcome: 'escalated' } },
      { text: 'Probably a red-team exercise. Ignore it.', next: 'joke', set: { outcome: 'joke' } },
      { text: "Reply to him and ask what he wants. Let's keep him talking.", next: 'replied', set: { outcome: 'replied' } },
    ],
  },
  escalated: {
    say: [['Mike (playing an Uber engineer)', ['...Oh. Okay. Screenshot done.', "I'll tell the channel to stop replying. That popcorn GIF was mine. Deleting it."]]],
    end: true,
  },
  joke: {
    say: [['Mike (playing an Uber engineer)', ['Ha, yeah. Classic. I added a 🍿.', '(In the real breach, this was the most common reaction. The attacker was still inside.)']]],
    end: true,
  },
  replied: {
    say: [['Mike (playing an Uber engineer)', ['Done. He replied: "lol you guys have no idea." Then he posted a screenshot of our AWS console.', 'Is... that bad?']]],
    end: true,
  },
};

export const SLACK_SCORE = {
  id: 'slack',
  area: 'People',
  title: 'The hacker announces himself in #general',
  max: 10,
  teaches: { skill: 'Treat an attacker\'s announcement as a real incident', secplus: '4.8 Incident response: detection and escalation' },
  missing: { points: 3, what: 'It never came up.', why: '' },
  outcomes: {
    escalated: { outcome: 'good', points: 10, what: 'You treated it as real, preserved evidence and escalated.', why: 'Right. An attacker announcing himself is still an attacker. Screenshots preserve evidence, and keeping people out of the thread denies him an audience and a social engineering channel.' },
    joke: { outcome: 'bad', points: 0, what: 'You wrote it off as a joke.', why: 'That is what many employees reportedly did in the real breach, while the attacker still held admin access. Never assume a test: real red teams are scheduled, and the SOC lead knows.' },
    replied: { outcome: 'bad', points: 2, what: 'You had someone engage the attacker.', why: 'Talking to an intruder in a channel he controls tells him you are watching, gives him an audience, and can leak your response plan. Contain first. Law enforcement handles contact.' },
  },
};
