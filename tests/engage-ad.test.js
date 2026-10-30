import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRun, runCommand, nextStep, autoplay, buildSiem, detections, scoreRun, history } from '../src/game/engage.js';
import { AD_ENGAGEMENT, AD_FLAG } from '../src/cases/halcyon-ad-engagement.js';

// ATT&CK technique (base id) -> tactic it belongs to, for the techniques this engagement uses.
const TACTIC = { T1087: 'Discovery', T1558: 'Credential Access', T1110: 'Credential Access', T1078: 'Privilege Escalation', T1003: 'Credential Access' };

const allText = () => {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(AD_ENGAGEMENT);
  return out.join('\n');
};

test('AD: every step is ATT&CK-tagged with a tactic that matches its technique', () => {
  for (const s of AD_ENGAGEMENT.steps) {
    assert.match(s.tid, /^T\d{4}(\.\d{3})?$/, s.id);
    assert.equal(TACTIC[s.tid.split('.')[0]], s.tactic, `${s.id}: ${s.tid} is not ${s.tactic}`);
    assert.ok(s.tname && s.goal && s.defend && s.choices.length, s.id);
  }
});

test('AD: the kill chain is the Kerberoast->crack->DCSync path, each technique once, in order', () => {
  assert.deepEqual(AD_ENGAGEMENT.steps.map((s) => s.tid), ['T1087.002', 'T1558.003', 'T1110.002', 'T1078.002', 'T1003.006']);
  assert.ok(AD_ENGAGEMENT.steps.at(-1).objective, 'the DCSync step is the objective');
});

test('AD: only documentation IP ranges and .example hostnames appear', () => {
  const text = allText();
  const ips = text.match(/\b\d{1,3}(\.\d{1,3}){3}\b/g) || [];
  for (const ip of ips) assert.match(ip, /^(192\.0\.2|198\.51\.100|203\.0\.113|127\.0\.0)\./, ip);
  const hosts = text.match(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|local|corp)\b/gi) || [];
  assert.deepEqual(hosts, [], 'real-looking domains');
});

test('AD: no exploit content — enumeration/credential tools only, canned output', () => {
  const tools = new Set(AD_ENGAGEMENT.steps.flatMap((s) => s.choices.map((c) => c.cmd.split(' ')[0])));
  assert.deepEqual([...tools].sort(), ['GetUserSPNs.py', 'bloodhound-python', 'hashcat', 'nxc', 'secretsdump.py']);
  assert.doesNotMatch(allText(), /msfconsole|meterpreter|reverse shell|\/bin\/sh -i|nc -e|powershell -enc|Invoke-/i);
});

test('AD: the terminal is a whitelist; later steps are locked until reached', () => {
  const run = newRun(AD_ENGAGEMENT);
  for (const bad of ['rm -rf /', 'cat /etc/shadow', 'mimikatz']) assert.equal(runCommand(run, bad).kind, 'refused', bad);
  assert.equal(run.done.length, 0);
  assert.equal(runCommand(run, 'secretsdump.py halcyon.example/svc_sql@192.0.2.5 -just-dc-user krbtgt').kind, 'refused', 'DCSync is locked first');
  assert.equal(runCommand(run, 'nxc smb 192.0.2.5').kind, 'choose', 'right tool, wrong args shows options');
  assert.equal(runCommand(run, AD_ENGAGEMENT.steps[0].choices[0].cmd).kind, 'ok');
  assert.equal(run.done.length, 1);
});

test('AD: full quiet run reaches the flag and the prompt changes to a DA shell', () => {
  const run = newRun(AD_ENGAGEMENT);
  let last;
  while (nextStep(run)) {
    const s = nextStep(run);
    last = runCommand(run, s.choices.find((c) => !c.loud && !c.violation).cmd);
    assert.equal(last.kind, 'ok', s.id);
  }
  assert.ok(run.finished);
  assert.ok(last.lines.some((l) => l.includes(AD_FLAG)));
  assert.match(run.prompt, /\(DA\)/);
});

test('AD: dumping every account hash (-just-dc) is a rules-of-engagement strike, not progress', () => {
  const run = autoplay('quiet', AD_ENGAGEMENT);
  const r2 = newRun(AD_ENGAGEMENT);
  for (const id of run.done.slice(0, -1)) runCommand(r2, AD_ENGAGEMENT.steps.find((s) => s.id === id).choices[0].cmd);
  const r = runCommand(r2, 'secretsdump.py halcyon.example/svc_sql@192.0.2.5 -just-dc');
  assert.equal(r.kind, 'violation');
  assert.equal(r2.strikes, 1);
  assert.equal(r2.finished, false);
});

test('AD: SIEM shows every move among an AD haystack; RC4 roast and DCSync are keyed and tagged', () => {
  for (const mode of ['quiet', 'loud']) {
    const run = autoplay(mode, AD_ENGAGEMENT);
    const ev = buildSiem(run);
    assert.ok(ev.filter((e) => e.noise).length > 40, `${mode}: haystack`);
    for (const { step } of history(run)) {
      const mine = ev.filter((e) => e.key === step.id);
      assert.ok(mine.length >= 1, `${mode}: ${step.id}`);
      for (const e of mine) assert.equal(e.attack, step.tid);
      for (const e of mine) assert.ok(e.raw && e.sourcetype, `${step.id} enriched`);
    }
    for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t >= ev[i - 1].t, 'sorted');
    // The Kerberoast trace must be an RC4 (0x17) service ticket.
    assert.ok(ev.some((e) => e.key === 'roast' && /enc=0x17/.test(e.msg)), `${mode}: RC4 ticket`);
  }
});

test('AD: loud raises more alerts; scoring rewards a quiet, complete hunt', () => {
  const q = autoplay('quiet', AD_ENGAGEMENT);
  const l = autoplay('loud', AD_ENGAGEMENT);
  const eq = buildSiem(q);
  const el = buildSiem(l);
  assert.ok(detections(el).length > detections(eq).length);
  const perfect = (run, ev) => Object.fromEntries(history(run).map(({ step }) => [step.id, ev.find((e) => e.key === step.id).id]));
  const gq = scoreRun(q, eq, perfect(q, eq));
  assert.equal(gq.pct, 100);
  assert.equal(gq.letter, 'A');
  const gl = scoreRun(l, el, perfect(l, el));
  assert.equal(gl.loud, 2, 'enum + roast can both be loud');
  assert.equal(gl.pct, 70);
  const none = scoreRun(q, eq, {});
  assert.equal(none.pct, 30);
  assert.equal(none.letter, 'F');
});
