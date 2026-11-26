import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CPTC_LAB } from '../src/data/cptcLabScenario.js';
import { CPTC_LAB_2 } from '../src/data/cptcLabScenario2.js';
import { CPTC_LAB_3 } from '../src/data/cptcLabScenario3.js';
import { CPTC_LAB_4 } from '../src/data/cptcLabScenario4.js';
import { newReport, runEnum, nmapTargets } from '../src/game/cptclab.js';

// Real nmap only reports the hosts you scanned. Scanning ONE host must not print the whole range.
const texts = (r) => r.lines.map((l) => l.text);
const reports = (t) => t.filter((l) => /^Nmap scan report for /.test(l));

const RANGES = [
  ['meridian', CPTC_LAB, 'nmap -sV 198.51.100.0/24'],
  ['atlas', CPTC_LAB_2, 'nmap -sV 203.0.113.0/24'],
  ['lakeshore', CPTC_LAB_3, 'nmap -sV -p- 203.0.113.0/24'],
  ['underpressure', CPTC_LAB_4, 'nmap 172.20.240.0/24'],
];

for (const [name, lab, range] of RANGES) {
  test(`${name}: a range scan still lists every host`, () => {
    const all = reports(texts(runEnum(newReport(lab, { seed: 1 }), range)));
    assert.ok(all.length >= 2, `expected several hosts, got ${all.length}`);
  });

  test(`${name}: scanning each host by IP or name prints only that host`, () => {
    const all = reports(texts(runEnum(newReport(lab, { seed: 1 }), range)));
    for (const rep of all) {
      const [, a, b] = /^Nmap scan report for (\S+)(?: \(([^)]+)\))?/.exec(rep);
      for (const target of [a, b].filter(Boolean)) {
        const out = texts(runEnum(newReport(lab, { seed: 1 }), `nmap -sV ${target}`));
        const got = reports(out);
        if (!got.length) continue; // a finding's own focused output (no report header) is fine
        assert.equal(got.length, 1, `nmap ${target} printed ${got.length} hosts:\n${got.join('\n')}`);
        assert.equal(got[0], rep, `nmap ${target} printed the wrong host`);
        assert.ok(out.some((l) => /^Nmap done: 1 IP address \(1 host up\) scanned in [\d.]+ seconds$/.test(l)), `nmap ${target} footer:\n${out.slice(-2).join('\n')}`);
      }
    }
  });
}

test('meridian: one host by name (the case that used to print all 3)', () => {
  const out = texts(runEnum(newReport(CPTC_LAB, { seed: 1 }), 'nmap -sV www.meridian.example'));
  assert.deepEqual(reports(out), ['Nmap scan report for www.meridian.example (198.51.100.30)']);
});

test('a live-range IP with no host answers like real nmap: host seems down', () => {
  const out = texts(runEnum(newReport(CPTC_LAB, { seed: 1 }), 'nmap 198.51.100.99'));
  assert.equal(reports(out).length, 0);
  assert.ok(out.includes('Note: Host seems down. If it is really up, but blocking our ping probes, try -Pn'));
  assert.ok(out.includes('Nmap done: 1 IP address (0 hosts up) scanned in 3.04 seconds'));
});

test('nmapTargets skips option values and gives up on ranges', () => {
  assert.deepEqual(nmapTargets('nmap -sv -on scan.txt -p 80,443 www.meridian.example'), ['www.meridian.example']);
  assert.equal(nmapTargets('nmap -sv 198.51.100.0/24'), null);
  assert.equal(nmapTargets('nmap 10.20.0.1-50'), null);
  assert.deepEqual(nmapTargets('sudo nmap -ss 10.20.0.10 10.20.0.15'), ['10.20.0.10', '10.20.0.15']);
});
