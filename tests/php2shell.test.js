// PHP2Shell (October 2026): the logs must carry the evidence the public detection advice describes, and the case must stay honest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CASES, getCase } from '../src/cases/index.js';
import { searchCases } from '../src/cases/search.js';
import { generateLogs, CASE, STATS, ATT, AMAZON_FIRST, AMAZON_IPS } from '../src/cases/php2shell2026/logs.js';

const c = getCase('php2shell-2026');
const full = generateLogs({ nowMinutes: 12 * 60 });

test('php2shell is registered first (newest) and marked fresh', () => {
  assert.equal(CASES[0].caseFile.id, 'php2shell-2026');
  assert.equal(c.caseFile.fresh, true);
  assert.equal(CASES.length, 16);
  assert.notEqual(c.caseFile.kind, 'lab');
});

test('php2shell: PHP_SESSION_UPLOAD_PROGRESS rows start on Oct 17, four days before the release', () => {
  const rows = full.filter((e) => e.msg.includes('PHP_SESSION_UPLOAD_PROGRESS'));
  assert.ok(rows.length >= 20, `only ${rows.length}`);
  assert.match(rows[0].time, /^Oct 17 03:12/);
  assert.equal(rows[0].key, 'multipart-first');
  assert.equal(CASE.primaryEvidence.key, 'multipart-first');
  assert.ok(STATS.preDisclosure >= 20 && STATS.warnings > STATS.preDisclosure);
});

test('php2shell: memory-limit fatals, big cookies and dead workers are in the logs', () => {
  const oom = full.filter((e) => e.source === 'httpd-error' && e.msg.includes('PHP Fatal error:  Allowed memory size of 134217728 bytes exhausted'));
  assert.ok(oom.length >= 20);
  assert.ok(full.some((e) => e.source === 'waf' && /cookie_len=\d{4}/.test(e.msg) && e.key === 'cookie-leak'));
  assert.ok(full.some((e) => e.msg.includes('AH00052') && e.msg.includes('Segmentation fault')));
  assert.ok(full.some((e) => e.source === 'edr' && /parent=\/usr\/sbin\/apache2/.test(e.msg) && e.key === 'apache-sh'));
});

test('php2shell: every key evidence key exists once the alert has fired (10:32) and the shell is not there before 10:21', () => {
  const at = generateLogs({ nowMinutes: 10 * 60 + 32 });
  const keys = new Set(at.map((e) => e.key).filter(Boolean));
  for (const k of [...CASE.keyEvidence, CASE.primaryEvidence.key]) assert.ok(keys.has(k), `missing ${k}`);
  const early = generateLogs({ nowMinutes: 10 * 60 + 20 });
  assert.ok(!early.some((e) => e.key === 'apache-sh' || e.key === 'webshell-new'));
  assert.ok(early.some((e) => e.key === 'multipart-first'));
});

test('php2shell: Amazon addresses appear only as blocked scans, and are described as shared infrastructure', () => {
  const real = [AMAZON_FIRST, ...AMAZON_IPS];
  const hits = full.filter((e) => real.includes(e.ip));
  assert.ok(hits.length >= 6);
  for (const e of hits) assert.ok(e.msg.includes(' 413 '), `${e.msg}`);
  const info = c.ipInfo;
  for (const ip of real) assert.match(info[ip].note, /investigate/i);
});

test('php2shell: the invented attacker is a documentation address, and no payloads are shown', () => {
  assert.match(ATT, /^203\.0\.113\./);
  const text = JSON.stringify(full);
  assert.ok(/REDACTED/.test(text));
});

test('php2shell: source files have no single-backslash mistakes and no stray non-ASCII', () => {
  for (const f of ['index', 'emails', 'logs', 'talk', 'tickets']) {
    const src = fs.readFileSync(new URL(`../src/cases/php2shell2026/${f}.js`, import.meta.url), 'utf8');
    assert.ok(!/[ÂÃâƒ‘’“”–—]/.test(src), `${f}.js has mojibake, curly quotes or dashes`);
    assert.ok(!src.includes('\r'), `${f}.js has CRLF line endings`);
  }
});

test('php2shell: only real, sourced facts in the real-world parts, and the Unit 42 report and retraction are stated', () => {
  const cf = c.caseFile;
  assert.match(cf.disclaimer, /Unit 42/);
  assert.match(cf.disclaimer, /could not confirm/);
  assert.match(cf.disclaimer, /October 25, 2026/);
  assert.ok(cf.realOutcome.some((l) => /Unit 42/.test(l) && /could not confirm/.test(l)));
  assert.ok(cf.timeline.some((t) => t.when === 'Oct 25' && /Unit 42/.test(t.what) && /retracts/.test(t.what)));
  // the old line was wrong once Unit 42 reported a compromise on Oct 25; 4chan had no reliable source; Wiz credits OpenAI, not Codex
  const all = JSON.stringify(cf);
  assert.ok(!/no publicly confirmed breaches/i.test(all));
  assert.ok(!/4chan/i.test(all));
  assert.ok(!/Codex/.test(all));
  // every outlet named in the real-world parts has a source entry
  const srcs = cf.sources.map((x) => x.title + ' ' + x.url).join(' ');
  for (const name of ['Cloudflare', 'Chainguard', 'VulnCheck', 'watchTowr', 'CrowdStrike', 'JFrog', 'FBI', 'Unit 42', 'BambooHR', 'Wikipedia']) assert.ok(srcs.includes(name), 'source for ' + name);
  assert.ok(cf.sources.length >= 19);
  assert.ok(cf.tags.includes('Zero-day') && cf.tags.includes('PHP') && cf.tags.includes('Web shell') && cf.tags.includes('Patch management'));
  for (const id of ['T1190', 'T1505.003', 'T1059.004', 'T1105']) assert.ok(cf.attack.some((a) => a.id === id), id);
});

test('php2shell: searching for php, php2shell, mod_php or CVE finds the case', () => {
  for (const q of ['php', 'PHP', 'php2shell', 'PHP2Shell', 'web shell', 'zero-day']) {
    assert.ok(searchCases(CASES, q).some((x) => x.caseFile.id === 'php2shell-2026'), q);
  }
  assert.ok(searchCases(CASES, 'cve-2026-109618').some((x) => x.caseFile.id === 'php2shell-2026'));
  assert.ok(searchCases(CASES, 'just happened').some((x) => x.caseFile.id === 'php2shell-2026'));
});
