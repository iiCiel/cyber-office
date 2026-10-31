import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CCDC_LAB_2 } from '../src/data/ccdcLabScenario2.js';
import { newGame, runLine, score, progress, answerInject, MODES } from '../src/game/ccdcLab.js';
import { attachEngine, tickTo, liveCompromises } from '../src/game/ccdcEngine.js';

const fresh = (o = {}) => newGame(CCDC_LAB_2, { seed: 1, ...o });
const runChecklist = (s) => { for (const d of s.deviceList) for (const c of (d.checklist || [])) runLine(s, d.id, c); };

const GOOD = {
  'inv-memo': 'edge-fw 203.0.113.3 pfSense firewall; dc01 10.20.30.10 Windows Server 2022 domain controller + DNS; ws01 10.20.30.55 Windows 10 teller workstation; app01 10.20.30.20 Ubuntu Apache portal web + api; db01 10.20.30.40 Ubuntu PostgreSQL database.',
  'new-user': 'Create a standard domain user with New-ADUser, temporary password with change at next logon, add only to the Tellers group. Least privilege: not a Domain Admin and no local admin.',
  'vendor-api': 'We will not open PostgreSQL 5432 to the internet. Instead we offer a site-to-site VPN or an allow-listed source IP over TLS to a dedicated read-only database account with least privilege.',
  'incident-report': 'At 09:25 this morning we found attacker persistence on app01 (the portal server): a root cron re-running a planted portal-sync script. We removed the cron entry and the script. Recommend file integrity monitoring to prevent recurrence.',
  pcr: 'PCR: rotate the hp-scorecheck password on db01 during the 10:30-10:35 window. Rollback: revert to the old password. The new credential is handed to the white team / scoring team before the change.',
};

test('scenario 2: shape — 5 devices, 7 findings, 4 scored services, 5 injects', () => {
  const s = fresh();
  assert.equal(s.deviceList.length, 5);
  assert.equal(s.findingList.length, 7);
  assert.equal(Object.keys(s.services).length, 4);
  assert.equal(s.injectList.length, 5);
});

test('scenario 2: the first-15 checklist hardens every finding with all services UP', () => {
  const s = fresh();
  runChecklist(s);
  const p = progress(s);
  assert.equal(p.fixed, 7, 'all findings fixed');
  assert.equal(p.servicesUp, 4, 'all services up');
});

test('scenario 2: no checklist item is prose (none is command-not-found)', () => {
  const s = fresh();
  for (const d of s.deviceList) for (const c of (d.checklist || [])) {
    const r = runLine(s, d.id, c);
    const t = r.lines.map((l) => l.text).join('\n');
    assert.ok(!/command not found|not a rule-editor command|is not recognized/i.test(t), `${d.id}: ${c} -> ${t.slice(0, 60)}`);
  }
});

test('scenario 2: PostgreSQL deny-all trap drops the DB; reboot trap drops DNS', () => {
  const a = fresh(); runLine(a, 'db01', 'ufw deny 5432'); assert.equal(a.services.db.state, 'down');
  const b = fresh(); runLine(b, 'dc01', 'Restart-Computer -Force'); assert.equal(b.services.dns.state, 'down');
});

test('scenario 2: a full clean round with injects scores an A', () => {
  const s = fresh();
  runChecklist(s);
  for (const [id, text] of Object.entries(GOOD)) answerInject(s, id, text);
  const g = score(s);
  assert.equal(g.fixed, 7);
  assert.ok(g.pct >= 90, `clean round should be an A, got ${g.pct}`);
});

test('scenario 2: live engine — leaving the Spooler open lets the red team compromise the DC', () => {
  const s = attachEngine(fresh({ mode: MODES.COMPETITION }));
  tickTo(s, 180); tickTo(s, 450);
  assert.ok(liveCompromises(s).some((c) => c.id === 'print-spooler'), 'unfixed Spooler is compromised by wave 2');
});
