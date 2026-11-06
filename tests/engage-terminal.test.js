// Red-team engagements feel like a terminal, not a menu: tolerant matching + everyday shell commands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRun, runCommand, nextStep, matchChoice } from '../src/game/engage.js';
import { ENGAGEMENTS } from '../src/cases/engagements.js';

const all = Array.isArray(ENGAGEMENTS) ? ENGAGEMENTS : Object.values(ENGAGEMENTS);

test('every engagement still completes via its listed commands (no ambient command shadows a move)', () => {
  assert.ok(all.length >= 5);
  for (const eng of all) {
    const run = newRun(eng);
    let step; let n = 0;
    while ((step = nextStep(run)) && n++ < 50) {
      const r = runCommand(run, step.choices.find((c) => !c.violation).cmd);
      assert.equal(r.kind, 'ok', `${eng.id}: ${step.id}`);
    }
    assert.ok(run.finished, eng.id);
  }
});

test('sudo prefix and reordered flags count as the same move', () => {
  for (const eng of all) {
    const step = nextStep(newRun(eng));
    const c = step.choices.find((x) => !x.violation).cmd.split(' ');
    if (c.length < 3) continue;
    const alt = `sudo ${c[0]} ${c.slice(1).reverse().join(' ')}`;
    assert.ok(matchChoice(step, alt) >= 0, `${eng.id}: ${alt}`);
  }
});

test('whoami / id / pwd / history follow the current prompt and never advance or strike', () => {
  const run = newRun(all[0]);
  const before = nextStep(run).id;
  for (const c of ['whoami', 'id', 'pwd', 'hostname', 'date', 'uname -a', 'ip a', 'ls', 'history']) {
    const r = runCommand(run, c);
    assert.equal(r.kind, 'builtin', c);
    assert.ok(r.lines.length > 0, c);
  }
  assert.equal(nextStep(run).id, before);
  assert.equal(run.strikes, 0);
  assert.equal(run.refused, 0);
  assert.deepEqual(runCommand(run, 'whoami').lines, ['assessor']);
  runCommand(run, nextStep(run).choices.find((c) => !c.violation).cmd);
  assert.match(runCommand(run, 'history').lines[0], /^\s+1\s+\S/);
});
