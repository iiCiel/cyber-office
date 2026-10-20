import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASES, COMING_SOON } from '../src/cases/index.js';
import { searchCases, TOPICS } from '../src/cases/search.js';

const ALL = [...CASES, ...COMING_SOON];
const ids = (q) => searchCases(ALL, q).map((c) => c.caseFile.id);

test('empty query returns every card', () => {
  assert.equal(ids('').length, ALL.length);
  assert.equal(ids('   ').length, ALL.length);
});

test('Active Directory finds the AD lab and NotPetya', () => {
  for (const q of ['active directory', 'Active Directory', 'AD', 'ad']) {
    const r = ids(q);
    assert.ok(r.includes('halcyon-ad-2026'), q);
    assert.ok(r.includes('notpetya-2017'), q);
  }
});

test('short words match word starts only', () => {
  // "ad" must not match "admin" in the Uber card.
  assert.ok(!ids('ad').includes('uber-2022'));
});

test('technique names and ids are searchable', () => {
  assert.deepEqual(ids('kerberoasting'), ['halcyon-ad-2026']);
  assert.ok(ids('T1621').includes('uber-2022'));
  assert.ok(ids('dcsync').includes('halcyon-ad-2026'));
});

test('all words must match', () => {
  assert.deepEqual(ids('ad lab'), ['halcyon-ad-2026']);
  assert.deepEqual(ids('kerberoasting aws'), []);
});

test('abbreviations and kinds', () => {
  assert.ok(ids('aws').includes('halcyon-aws-2026'));
  assert.ok(ids('sqli').includes('moveit-2023'));
  assert.ok(ids('bec').includes('halcyon-bec-2026'));
  assert.ok(ids('lab').every((id) => id.startsWith('halcyon-')));
  assert.equal(ids('lab').length, 4);
});

test('nonsense finds nothing', () => {
  assert.deepEqual(ids('zzqqxx'), []);
});

test('every quick topic finds at least one card', () => {
  for (const t of TOPICS) assert.ok(ids(t).length > 0, t);
});
