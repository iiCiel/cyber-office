// The domain controller's directory is per game: AD changes typed (or clicked in ADUC) show up in Get-ADUser /
// Get-ADGroupMember afterwards, and a new game starts from the scenario's original directory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CCDC_LAB } from '../src/data/ccdcLabScenario.js';
import { newGame, runLine } from '../src/game/ccdcLab.js';

const out = (s, l) => runLine(s, 'dc01', l).lines.map((x) => x.text).join('\n');

test('Disable-ADAccount and Remove-ADGroupMember change what Get-ADUser / Get-ADGroupMember show', () => {
  const s = newGame(CCDC_LAB, { seed: 1 });
  assert.match(out(s, "Get-ADGroupMember 'Domain Admins'"), /svc-backup2/);
  out(s, 'Disable-ADAccount -Identity svc-backup2');
  out(s, "Remove-ADGroupMember -Identity 'Domain Admins' -Members svc-backup2 -Confirm:$false");
  assert.equal(s.findings['rogue-da'].status, 'fixed');
  assert.match(out(s, 'Get-ADUser svc-backup2'), /Enabled\s+:\s+False/);
  assert.doesNotMatch(out(s, "Get-ADGroupMember 'Domain Admins'"), /svc-backup2/);
});

test('a new game starts with the original directory (no leak between rounds)', () => {
  const a = newGame(CCDC_LAB, { seed: 1 });
  out(a, 'Disable-ADAccount -Identity svc-backup2');
  const b = newGame(CCDC_LAB, { seed: 2 });
  assert.match(out(b, 'Get-ADUser svc-backup2'), /Enabled\s+:\s+True/);
  assert.match(out(b, "Get-ADGroupMember 'Domain Admins'"), /svc-backup2/);
});
