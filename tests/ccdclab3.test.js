import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CCDC_LAB_3 } from '../src/data/ccdcLabScenario3.js';
import { CCDC_SCENARIOS } from '../src/data/ccdcScenarios.js';
import { newGame, runLine, score, progress, answerInject, MODES } from '../src/game/ccdcLab.js';
import { attachEngine, tickTo, liveCompromises } from '../src/game/ccdcEngine.js';
import { createSiem } from '../src/game/siemGen.js';

const fresh = (o = {}) => newGame(CCDC_LAB_3, { seed: 1, ...o });
const runChecklist = (s) => { for (const d of s.deviceList) for (const c of (d.checklist || [])) runLine(s, d.id, c); };
const ids = (s) => s.findingList.map((f) => f.id);
const isFixed = (s, id) => {
  const f = s.findingList.find((x) => x.id === id);
  return !!(s.findings?.[id]?.fixed ?? f?.fixed ?? s.fixed?.has?.(id));
};

const GOOD = {
  'inv-memo': 'edge-fw 203.0.113.18 pfSense firewall; dc01 10.30.40.10 Windows Server 2022 domain controller + DNS; ws01 10.30.40.55 Windows 11 nurse-station workstation; ehr01 10.30.40.20 Ubuntu nginx EHR web + HL7; db01 10.30.40.40 Ubuntu MySQL database and Redis.',
  'new-user': 'Create a standard domain user with New-ADUser, temporary password with change at next logon, add only to the Clinical Staff group. Least privilege: not a Domain Admin and no local admin.',
  'vendor-api': 'We will not open MySQL 3306 to the internet. Instead we offer a site-to-site VPN or an allow-listed source IP over TLS to a dedicated read-only database account with least privilege.',
  'incident-report': 'At 09:25 this morning we found Defender real-time protection disabled and a hidden exclusion folder (ProgramData) on ws01, the nurse station. We re-enabled protection and removed the exclusion. Recommend tamper protection via Group Policy to prevent recurrence.',
  pcr: 'PCR: rotate the rv-scorecheck password on db01 during the 10:30-10:35 window. Rollback: revert to the old password. The new credential is handed to the white team / scoring team before the change.',
};

test('scenario 3: registered third, shape — 5 devices, 7 findings, 4 scored services, 5 injects', () => {
  assert.equal(CCDC_SCENARIOS[2], CCDC_LAB_3);
  const s = fresh();
  assert.equal(s.deviceList.length, 5);
  assert.equal(s.findingList.length, 7);
  assert.equal(Object.keys(s.services).length, 4);
  assert.equal(s.injectList.length, 5);
  assert.equal(progress(s).fixed, 0, 'every finding is open at the start');
});

test('scenario 3: the checklist hardens every finding with all services UP', () => {
  const s = fresh();
  runChecklist(s);
  const p = progress(s);
  assert.equal(p.fixed, 7, 'all findings fixed');
  assert.equal(p.servicesUp, 4, 'all services up');
});

test('scenario 3: no checklist item is prose (none is command-not-found)', () => {
  const s = fresh();
  for (const d of s.deviceList) for (const c of (d.checklist || [])) {
    const r = runLine(s, d.id, c);
    const t = r.lines.map((l) => l.text).join('\n');
    assert.ok(!/command not found|not a rule-editor command|is not recognized|No such file/i.test(t), `${d.id}: ${c} -> ${t.slice(0, 80)}`);
  }
});

test('scenario 3: each single typed fix closes exactly its finding', () => {
  const one = (dev, lines) => { const s = fresh(); for (const l of lines) runLine(s, dev, l); return progress(s).fixed; };
  assert.equal(one('dc01', ['Set-SmbServerConfiguration -RequireSecuritySignature $true -Force']), 1);
  assert.equal(one('dc01', ['Set-ADDefaultDomainPasswordPolicy -Identity ridgeview.local -MinPasswordLength 12 -ComplexityEnabled $true -LockoutThreshold 5']), 1);
  assert.equal(one('ehr01', ['chmod u-s /usr/bin/find']), 1);
  assert.equal(one('ws01', ['Set-MpPreference -DisableRealtimeMonitoring $false', "Remove-MpPreference -ExclusionPath 'C:\\ProgramData\\Updates'"]), 1);
  assert.equal(one('ehr01', ["sed -i 's/ssl_protocols.*/ssl_protocols TLSv1.2 TLSv1.3;/' /etc/nginx/conf.d/ehr.conf", 'systemctl reload nginx']), 1);
  assert.equal(one('db01', ["sed -i 's/^bind .*/bind 127.0.0.1/' /etc/redis/redis.conf", "echo 'requirepass Rv-Cache-7f3a91c2e5b84d60' >> /etc/redis/redis.conf", 'systemctl restart redis-server']), 1);
});

test('scenario 3: partial or wrong steps do NOT close a finding', () => {
  const one = (dev, lines) => { const s = fresh(); for (const l of lines) runLine(s, dev, l); return progress(s).fixed; };
  // password policy: length without lockout, lockout without length
  assert.equal(one('dc01', ['Set-ADDefaultDomainPasswordPolicy -MinPasswordLength 12']), 0);
  assert.equal(one('dc01', ['Set-ADDefaultDomainPasswordPolicy -LockoutThreshold 5']), 0);
  // Defender: protection alone leaves the exclusion
  assert.equal(one('ws01', ['Set-MpPreference -DisableRealtimeMonitoring $false']), 0);
  // nginx: reload without editing, or edit without reload
  assert.equal(one('ehr01', ['systemctl reload nginx']), 0);
  assert.equal(one('ehr01', ["sed -i 's/ssl_protocols.*/ssl_protocols TLSv1.2 TLSv1.3;/' /etc/nginx/conf.d/ehr.conf"]), 0);
  // nginx: an edit that keeps TLSv1.1 is not a fix even after reload
  assert.equal(one('ehr01', ["sed -i 's/ssl_protocols.*/ssl_protocols TLSv1.1 TLSv1.2;/' /etc/nginx/conf.d/ehr.conf", 'systemctl reload nginx']), 0);
  // SUID: chmod 777 is a trap, not a fix
  assert.equal(one('ehr01', ['chmod 777 /usr/bin/find']), 0);
  // redis: bind alone (no password) and restart is not enough; password alone with bind 0.0.0.0 is not enough
  assert.equal(one('db01', ["sed -i 's/^bind .*/bind 127.0.0.1/' /etc/redis/redis.conf", 'systemctl restart redis-server']), 0);
  assert.equal(one('db01', ["echo 'requirepass Rv-Cache-7f3a91c2e5b84d60' >> /etc/redis/redis.conf", 'systemctl restart redis-server']), 0);
  // firewall: default block first (before the allow rules) takes services down, so it is not fixed
  const s = fresh(); runLine(s, 'edge-fw', 'del 1'); runLine(s, 'edge-fw', 'default block');
  assert.equal(progress(s).fixed, 0);
});

test('scenario 3: traps — reboot drops DNS, stopping nginx drops the website, deny 3306 drops the DB', () => {
  const b = fresh(); runLine(b, 'dc01', 'Restart-Computer -Force'); assert.equal(b.services.dns.state, 'down');
  const c = fresh(); runLine(c, 'ehr01', 'systemctl stop nginx'); assert.equal(c.services.web.state, 'down');
  const d = fresh(); runLine(d, 'db01', 'ufw deny 3306'); assert.equal(d.services.db.state, 'down');
});

test('scenario 3: a full clean round with injects scores an A', () => {
  const s = fresh();
  runChecklist(s);
  for (const [id, text] of Object.entries(GOOD)) answerInject(s, id, text);
  const g = score(s);
  assert.equal(g.fixed, 7);
  assert.ok(g.pct >= 90, `clean round should be an A, got ${g.pct}`);
});

test('scenario 3: live engine — leaving Redis open lets the red team compromise db01', () => {
  const s = attachEngine(fresh({ mode: MODES.COMPETITION }));
  tickTo(s, 180); tickTo(s, 450);
  assert.ok(liveCompromises(s).some((c) => c.id === 'redis-open'), 'unfixed Redis is compromised by wave 2');
});

test('scenario 3: SIEM wave lines exist for every finding and match the weakness hit', () => {
  const expect = {
    'firewall-anyany': /203\.0\.113\.88/, 'smb-signing': /445|n\.park/, 'weak-pw-policy': /4625|4624|n\.park|Administrator/i,
    'ws-defender-off': /Set-MpPreference|Updates|4688/, 'tls-legacy': /\/login|\/api\/v1|\/session/, 'suid-find': /find/, 'redis-open': /6379|redis/,
  };
  assert.deepEqual(Object.keys(expect).sort(), ids(fresh()).sort());
  for (const [fid, re] of Object.entries(expect)) {
    const siem = createSiem(CCDC_LAB_3, { seed: 5 });
    const added = siem.onWave(fid, 300, 'compromised');
    assert.ok(added.length > 0, fid);
    assert.ok(added.every((i) => re.test(siem.get(i).raw)), `${fid}: ${siem.get(added[0]).raw}`);
  }
});
