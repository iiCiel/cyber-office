import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRun, runCommand, nextStep, autoplay, buildSiem, detections, scoreRun, history } from '../src/game/engage.js';
import { CLOUD_ENGAGEMENT, CLOUD_FLAG } from '../src/cases/halcyon-cloud-engagement.js';

// ATT&CK technique (base id) -> tactic it belongs to, for the techniques this engagement uses.
const TACTIC = { T1190: 'Initial Access', T1552: 'Credential Access', T1078: 'Initial Access', T1619: 'Discovery', T1530: 'Collection' };

const allText = () => {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(CLOUD_ENGAGEMENT);
  return out.join('\n');
};

test('CLOUD: every step is ATT&CK-tagged with a tactic that matches its technique', () => {
  for (const s of CLOUD_ENGAGEMENT.steps) {
    assert.match(s.tid, /^T\d{4}(\.\d{3})?$/, s.id);
    assert.equal(TACTIC[s.tid.split('.')[0]], s.tactic, `${s.id}: ${s.tid} is not ${s.tactic}`);
    assert.ok(s.tname && s.goal && s.defend && s.choices.length, s.id);
  }
});

test('CLOUD: the kill chain is the SSRF -> IMDS keys -> S3 path (Capital One 2019), each technique once, in order', () => {
  assert.deepEqual(CLOUD_ENGAGEMENT.steps.map((s) => s.tid), ['T1190', 'T1552.005', 'T1078.004', 'T1619', 'T1530']);
  assert.ok(CLOUD_ENGAGEMENT.steps.at(-1).objective, 'reading the planted S3 proof file is the objective');
});

test('CLOUD: only documentation IP ranges and .example hostnames appear', () => {
  const text = allText();
  const ips = text.match(/\b\d{1,3}(\.\d{1,3}){3}\b/g) || [];
  for (const ip of ips) assert.match(ip, /^(192\.0\.2|198\.51\.100|203\.0\.113|127\.0\.0)\.|^169\.254\.169\.254$/, ip);
  const hosts = text.match(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|local|corp)\b/gi) || [];
  assert.deepEqual(hosts, [], 'real-looking domains');
});

test('CLOUD: no exploit content — web + AWS CLI tools only, canned output', () => {
  const tools = new Set(CLOUD_ENGAGEMENT.steps.flatMap((s) => s.choices.map((c) => c.cmd.split(' ')[0])));
  assert.deepEqual([...tools].sort(), ['aws', 'curl', 'enumerate-iam', 'ffuf']);
  assert.doesNotMatch(allText(), /msfconsole|meterpreter|reverse shell|\/bin\/sh -i|nc -e|powershell -enc|Invoke-/i);
});

test('CLOUD: the terminal is a whitelist; later steps are locked until reached', () => {
  const run = newRun(CLOUD_ENGAGEMENT);
  for (const bad of ['rm -rf /', 'cat /etc/passwd', 'nmap -p-']) assert.equal(runCommand(run, bad).kind, 'refused', bad);
  assert.equal(run.done.length, 0);
  assert.equal(runCommand(run, 'aws sts get-caller-identity --profile halcyon-stolen').kind, 'refused', 'using the keys is locked until they are stolen');
  assert.equal(runCommand(run, 'curl -s https://docs.halcyon.example/').kind, 'choose', 'right tool, wrong args shows options');
  assert.equal(runCommand(run, CLOUD_ENGAGEMENT.steps[0].choices[0].cmd).kind, 'ok');
  assert.equal(run.done.length, 1);
});

test('CLOUD: full quiet run reaches the flag and the prompt shows the stolen role', () => {
  const run = newRun(CLOUD_ENGAGEMENT);
  let last;
  while (nextStep(run)) {
    const s = nextStep(run);
    last = runCommand(run, s.choices.find((c) => !c.loud && !c.violation).cmd);
    assert.equal(last.kind, 'ok', s.id);
  }
  assert.ok(run.finished);
  assert.ok(last.lines.some((l) => l.includes(CLOUD_FLAG)));
  assert.match(run.prompt, /claims-docs-role/);
});

test('CLOUD: syncing the whole claims bucket is a rules-of-engagement strike, not progress', () => {
  const run = autoplay('quiet', CLOUD_ENGAGEMENT);
  const r2 = newRun(CLOUD_ENGAGEMENT);
  for (const id of run.done.slice(0, -1)) runCommand(r2, CLOUD_ENGAGEMENT.steps.find((s) => s.id === id).choices[0].cmd);
  const sync = CLOUD_ENGAGEMENT.steps.at(-1).choices.find((c) => c.violation);
  const r = runCommand(r2, sync.cmd);
  assert.equal(r.kind, 'violation');
  assert.equal(r2.strikes, 1);
  assert.equal(r2.finished, false);
});

test('CLOUD: SIEM shows every move among a CloudTrail haystack; GuardDuty flags the stolen keys', () => {
  for (const mode of ['quiet', 'loud']) {
    const run = autoplay(mode, CLOUD_ENGAGEMENT);
    const ev = buildSiem(run);
    assert.ok(ev.filter((e) => e.noise).length > 40, `${mode}: haystack`);
    for (const { step } of history(run)) {
      const mine = ev.filter((e) => e.key === step.id);
      assert.ok(mine.length >= 1, `${mode}: ${step.id}`);
      for (const e of mine) assert.equal(e.attack, step.tid);
      for (const e of mine) assert.ok(e.raw && e.sourcetype, `${step.id} enriched`);
    }
    for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t >= ev[i - 1].t, 'sorted');
    // Using instance keys outside AWS must always raise GuardDuty's credential-exfiltration finding, as real JSON.
    const gd = ev.find((e) => e.key === 'usekeys' && e.detection);
    assert.ok(gd && /InstanceCredentialExfiltration\.OutsideAWS/.test(gd.detection), `${mode}: GuardDuty alert`);
    assert.match(gd.raw, /"type":\s*"UnauthorizedAccess:IAMUser\/InstanceCredentialExfiltration\.OutsideAWS"/);
    const ct = ev.find((e) => e.key === 'collect');
    assert.match(ct.raw, /"eventName":\s*"GetObject"/);
    assert.match(ct.raw, /assumed-role\/claims-docs-role/);
  }
});

test('CLOUD: loud raises more alerts; scoring rewards a quiet, complete hunt', () => {
  const q = autoplay('quiet', CLOUD_ENGAGEMENT);
  const l = autoplay('loud', CLOUD_ENGAGEMENT);
  const eq = buildSiem(q);
  const el = buildSiem(l);
  assert.ok(detections(el).length > detections(eq).length);
  const perfect = (run, ev) => Object.fromEntries(history(run).map(({ step }) => [step.id, ev.find((e) => e.key === step.id).id]));
  const gq = scoreRun(q, eq, perfect(q, eq));
  assert.equal(gq.pct, 100);
  assert.equal(gq.letter, 'A');
  const gl = scoreRun(l, el, perfect(l, el));
  assert.equal(gl.loud, 3, 'ssrf + imds + discover can all be loud');
  assert.equal(gl.pct, 70);
  const none = scoreRun(q, eq, {});
  assert.equal(none.pct, 30);
  assert.equal(none.letter, 'F');
});
