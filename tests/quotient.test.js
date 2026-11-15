import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CCDC_LAB_4 } from '../src/data/ccdcLabScenario4.js';
import { newGame, runLine } from '../src/game/ccdcLab.js';
import { attachEngine, tickTo, notePasswordRotated } from '../src/game/ccdcEngine.js';
import { submitPcr, parsePcr, PCR_REJECT, quotientLists } from '../src/game/quotient.js';

const fresh = () => attachEngine(newGame(CCDC_LAB_4, { seed: 1 }));
const BULK = "Get-ADUser -Filter * | Where-Object { $_.SamAccountName -notlike 'svc-*' } | Set-ADAccountPassword -Reset -NewPassword (ConvertTo-SecureString 'ZipsBlue2026x!' -AsPlainText -Force)";
const paste = (users) => users.map((u) => `${u},ZipsBlue2026x!`).join('\n');
const failing = (s, id) => s.engine.pcrs.some((p) => p.breaking && p.service === id);
const rotate = (s, line) => { const r = runLine(s, 'dc', line); if (r.effects.pcrRotated) notePasswordRotated(s, r.effects.pcrAccounts); return r; };

test('quotient: three credential lists; svc accounts are in AD but not on DomainUsers', () => {
  const L = quotientLists(CCDC_LAB_4);
  assert.deepEqual(Object.keys(L), ['DomainUsers', 'Splunk', 'MssqlService']);
  assert.deepEqual(L.MssqlService.users, ['waterops_svc']);
  assert.ok(!L.DomainUsers.users.some((u) => u.startsWith('svc-')));
  for (const u of L.Splunk.users) assert.ok(L.DomainUsers.users.includes(u), u);
});

test('quotient: one unknown name rejects the whole paste (Nov 14 10:5x: svc-splunk + AD-only names)', () => {
  const s = fresh();
  const users = quotientLists(CCDC_LAB_4).DomainUsers.users;
  const r = submitPcr(s, 'DomainUsers', paste(['svc-splunk', 'agrapplernamedsam', ...users]));
  assert.equal(r.ok, false); assert.equal(r.msg, PCR_REJECT);
  assert.deepEqual(r.unknown, ['svc-splunk', 'agrapplernamedsam']);
  assert.equal(s.engine.pcrs[0].filed, false);
  assert.equal(submitPcr(s, 'DomainUsers', 'john.smith ZipsBlue2026x!').ok, false, 'no comma = rejected');
  assert.equal(submitPcr(s, 'DomainUsers', paste(users)).ok, true, 'the Usernames tab list is accepted');
});

test('quotient: PCR first, then the bulk reset: nothing breaks', () => {
  const s = fresh();
  const L = quotientLists(CCDC_LAB_4);
  assert.ok(submitPcr(s, 'DomainUsers', paste(L.DomainUsers.users)).ok);
  assert.ok(submitPcr(s, 'Splunk', paste(L.Splunk.users)).ok);
  const r = rotate(s, BULK);
  assert.deepEqual(r.effects.pcrAccounts, ['DomainUsers', 'Splunk']);
  assert.equal(failing(s, 'webmail-imap'), false);
  assert.equal(failing(s, 'splunk-query'), false);
  assert.equal(s.services['splunk-query'].state, 'up', 'svc-* excluded: bindDN still works');
});

test('quotient: reset first breaks webmail-imap and splunk-query until each list is filed', () => {
  const s = fresh();
  const L = quotientLists(CCDC_LAB_4);
  rotate(s, BULK);
  assert.equal(failing(s, 'webmail-imap'), true);
  assert.equal(failing(s, 'splunk-query'), true);
  tickTo(s, 120);
  assert.ok(s.engine.history['webmail-imap'].some((h) => !h.ok), 'round table shows false');
  submitPcr(s, 'DomainUsers', paste(L.DomainUsers.users));
  assert.equal(failing(s, 'webmail-imap'), false);
  assert.equal(failing(s, 'splunk-query'), true, 'the separate Splunk list still has the old password');
  submitPcr(s, 'Splunk', paste(L.Splunk.users));
  assert.equal(failing(s, 'splunk-query'), false);
});

test('quotient: bulk reset WITHOUT excluding svc-* still trips the svc-splunk trap', () => {
  const s = fresh();
  const r = rotate(s, "Get-ADUser -Filter * | Set-ADAccountPassword -Reset -NewPassword (ConvertTo-SecureString 'X1!aaaaaa' -AsPlainText -Force)");
  assert.equal(r.effects.trapId, 'reset-svc-splunk');
  assert.equal(s.services['splunk-query'].state, 'down');
  assert.ok(r.effects.pcrRotated, 'and the lists rotated too');
});

test('quotient: resetting only Administrator or svc-palo is not a DomainUsers rotation', () => {
  const s = fresh();
  assert.ok(!rotate(s, 'Set-ADAccountPassword Administrator -Reset').effects.pcrRotated);
  assert.deepEqual(parsePcr('a,b\n\n c,d ').rows.map((r) => r.user), ['a', 'c']);
});
