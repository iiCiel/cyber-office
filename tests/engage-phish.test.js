import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRun, runCommand, nextStep, autoplay, buildSiem, detections, scoreRun, history } from '../src/game/engage.js';
import { PHISH_ENGAGEMENT, PHISH_FLAG } from '../src/cases/halcyon-phish-engagement.js';

// ATT&CK technique (base id) -> tactic it belongs to, for the techniques this engagement uses.
const TACTIC = { T1589: 'Reconnaissance', T1566: 'Initial Access', T1621: 'Credential Access', T1078: 'Initial Access', T1114: 'Collection' };

const allText = () => {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(PHISH_ENGAGEMENT);
  return out.join('\n');
};

test('PHISH: every step is ATT&CK-tagged with a tactic that matches its technique', () => {
  for (const s of PHISH_ENGAGEMENT.steps) {
    assert.match(s.tid, /^T\d{4}(\.\d{3})?$/, s.id);
    assert.equal(TACTIC[s.tid.split('.')[0]], s.tactic, `${s.id}: ${s.tid} is not ${s.tactic}`);
    assert.ok(s.tname && s.goal && s.defend && s.choices.length, s.id);
  }
});

test('PHISH: the kill chain is the phish -> MFA fatigue -> cloud takeover path, each technique once, in order', () => {
  assert.deepEqual(PHISH_ENGAGEMENT.steps.map((s) => s.tid), ['T1589.002', 'T1566.002', 'T1621', 'T1078.004', 'T1114.002']);
  assert.ok(PHISH_ENGAGEMENT.steps.at(-1).objective, 'reading the mailbox proof is the objective');
});

test('PHISH: only documentation IP ranges and .example hostnames appear', () => {
  const text = allText();
  const ips = text.match(/\b\d{1,3}(\.\d{1,3}){3}\b/g) || [];
  for (const ip of ips) assert.match(ip, /^(192\.0\.2|198\.51\.100|203\.0\.113|127\.0\.0)\./, ip);
  const hosts = text.match(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|local|corp)\b/gi) || [];
  assert.deepEqual(hosts, [], 'real-looking domains');
});

test('PHISH: no exploit content — recon/phishing/identity tools only, canned output', () => {
  const tools = new Set(PHISH_ENGAGEMENT.steps.flatMap((s) => s.choices.map((c) => c.cmd.split(' ')[0])));
  assert.deepEqual([...tools].sort(), ['New-InboxRule', 'curl', 'gophish', 'mfafatigue', 'o365enum']);
  assert.doesNotMatch(allText(), /msfconsole|meterpreter|reverse shell|\/bin\/sh -i|nc -e|powershell -enc|Invoke-/i);
});

test('PHISH: the terminal is a whitelist; later steps are locked until reached', () => {
  const run = newRun(PHISH_ENGAGEMENT);
  for (const bad of ['rm -rf /', 'cat /etc/passwd', 'nmap -p-']) assert.equal(runCommand(run, bad).kind, 'refused', bad);
  assert.equal(run.done.length, 0);
  assert.equal(runCommand(run, 'curl -s https://outlook.halcyon.example/owa/').kind, 'refused', 'the cloud sign-in is locked until the creds+MFA are taken');
  assert.equal(runCommand(run, 'o365enum -d halcyon.example').kind, 'choose', 'right tool, wrong args shows options');
  assert.equal(runCommand(run, PHISH_ENGAGEMENT.steps[0].choices[0].cmd).kind, 'ok');
  assert.equal(run.done.length, 1);
});

test('PHISH: full quiet run reaches the flag and the prompt changes to the victim session', () => {
  const run = newRun(PHISH_ENGAGEMENT);
  let last;
  while (nextStep(run)) {
    const s = nextStep(run);
    last = runCommand(run, s.choices.find((c) => !c.loud && !c.violation).cmd);
    assert.equal(last.kind, 'ok', s.id);
  }
  assert.ok(run.finished);
  assert.ok(last.lines.some((l) => l.includes(PHISH_FLAG)));
  assert.match(run.prompt, /\(d\.reyes\)/);
});

test('PHISH: adding an external auto-forward rule is a rules-of-engagement strike, not progress', () => {
  const run = autoplay('quiet', PHISH_ENGAGEMENT);
  const r2 = newRun(PHISH_ENGAGEMENT);
  for (const id of run.done.slice(0, -1)) runCommand(r2, PHISH_ENGAGEMENT.steps.find((s) => s.id === id).choices[0].cmd);
  const rule = PHISH_ENGAGEMENT.steps.at(-1).choices.find((c) => c.violation);
  const r = runCommand(r2, rule.cmd);
  assert.equal(r.kind, 'violation');
  assert.equal(r2.strikes, 1);
  assert.equal(r2.finished, false);
});

test('PHISH: SIEM shows every move among an identity haystack; the risky sign-in is keyed and alerted', () => {
  for (const mode of ['quiet', 'loud']) {
    const run = autoplay(mode, PHISH_ENGAGEMENT);
    const ev = buildSiem(run);
    assert.ok(ev.filter((e) => e.noise).length > 40, `${mode}: haystack`);
    for (const { step } of history(run)) {
      const mine = ev.filter((e) => e.key === step.id);
      assert.ok(mine.length >= 1, `${mode}: ${step.id}`);
      for (const e of mine) assert.equal(e.attack, step.tid);
      for (const e of mine) assert.ok(e.raw && e.sourcetype, `${step.id} enriched`);
    }
    for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t >= ev[i - 1].t, 'sorted');
    // The cloud sign-in from a new country must be keyed and carry its detection.
    assert.ok(ev.some((e) => e.key === 'signin' && e.detection && /impossible travel/i.test(e.detection)), `${mode}: risky sign-in alert`);
  }
});

test('PHISH: loud raises more alerts; scoring rewards a quiet, complete hunt', () => {
  const q = autoplay('quiet', PHISH_ENGAGEMENT);
  const l = autoplay('loud', PHISH_ENGAGEMENT);
  const eq = buildSiem(q);
  const el = buildSiem(l);
  assert.ok(detections(el).length > detections(eq).length);
  const perfect = (run, ev) => Object.fromEntries(history(run).map(({ step }) => [step.id, ev.find((e) => e.key === step.id).id]));
  const gq = scoreRun(q, eq, perfect(q, eq));
  assert.equal(gq.pct, 100);
  assert.equal(gq.letter, 'A');
  const gl = scoreRun(l, el, perfect(l, el));
  assert.equal(gl.loud, 3, 'recon + phish + mfafatigue can all be loud');
  assert.equal(gl.pct, 70);
  const none = scoreRun(q, eq, {});
  assert.equal(none.pct, 30);
  assert.equal(none.letter, 'F');
});
