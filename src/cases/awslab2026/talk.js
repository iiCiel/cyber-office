// Lab: Theo (playing a platform engineer) knows he pushed the .env. What he does next is the test.
const THEO = 'Theo (playing the platform engineer)';

export const KEY_TALK = {
  start: {
    say: [[THEO, [
      'Okay. I need to tell you something before you hear it from the alerts.',
      'Last night I made halcyon/claims-etl public so a contractor could clone it. It had a .env with the ci-deploy key in it. GitHub emailed me about it twenty seconds later. I was already in the car.',
      'I can delete the repo right now. Or rewrite the history. What do you want me to do?',
    ]]],
    choices: [
      { text: 'Revoke the key first (deactivate it, then delete it), keep the repo as evidence, and only then clean the history and rotate everything that was in the .env.', next: 'good', set: { outcome: 'revoke-first' } },
      { text: 'Delete the repo right now so nobody else can see it.', next: 'repo', set: { outcome: 'deleted-repo' } },
      { text: 'Force-push a cleaned history and say nothing. It is embarrassing and it is already fixed.', next: 'hide', set: { outcome: 'hid-it' } },
    ],
  },
  good: { say: [[THEO, ['Key deactivated. Repo set to private, history kept. I will rotate the database password that was in the same file.', 'Honestly? Thank you for not making it worse. I had a feeling I would be in trouble.', '(Blameless handling is why people report leaks quickly. The key is the problem, not the person.)']]], end: true },
  repo: { say: [[THEO, ['Deleted.', '...Wait. The key still works. The repo is gone, but anyone who cloned it in the last ten minutes still has it, and so do the scrapers.', '(Deleting the evidence did not revoke the credential.)']]], end: true },
  hide: { say: [[THEO, ['Done. History rewritten.', '...But the old commits are still reachable by hash, and the key is still active. And now there is a gap in what happened.', '(Hiding it protects nobody. Cleaning git history is not revocation.)']]], end: true },
};

export const KEY_SCORE = {
  id: 'key',
  area: 'People',
  title: 'The engineer who pushed the key: revoke, delete, or hide?',
  max: 15,
  teaches: { skill: 'Handle a leaked credential: revoke first, preserve evidence, no blame', secplus: '4.8 Incident response: containment, evidence preservation' },
  missing: { points: 5, what: 'Theo never came to you about the repo.', why: 'The person who made the mistake is your best witness. If it is unsafe to confess, you hear about it from the bill.' },
  outcomes: {
    'revoke-first': { outcome: 'good', points: 15, what: 'You told Theo to revoke the key first and keep the repo for evidence.', why: 'Right order. A leaked secret is safe only when it stops working. Evidence stays, and nobody is punished for reporting.' },
    'deleted-repo': { outcome: 'bad', points: 2, what: 'You had the repo deleted.', why: 'It feels decisive, but the key still worked, and the evidence of what was exposed is gone. Revoke the credential, then clean up.', cost: { amount: 60000, text: 'The key stayed valid while everyone watched the repo vanish (estimate for this lab)' } },
    'hid-it': { outcome: 'bad', points: 0, what: 'You let Theo rewrite history and stay quiet.', why: 'The key was still active, the commits were still reachable and the incident had no record. A cover-up costs more than the mistake.', cost: { amount: 90000, text: 'Longer exposure and a worse conversation with legal (estimate for this lab)' } },
  },
};
