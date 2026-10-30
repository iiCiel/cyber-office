import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRun, runCommand, nextStep, autoplay, buildSiem, detections, scoreRun, history } from '../src/game/engage.js';
import { WEB_ENGAGEMENT, WEB_FLAG } from '../src/cases/halcyon-web-engagement.js';

// ATT&CK technique (base id) -> tactic it belongs to, for the techniques this engagement uses.
const TACTIC = { T1595: 'Reconnaissance', T1190: 'Initial Access', T1212: 'Credential Access', T1110: 'Credential Access', T1078: 'Initial Access' };

const allText = () => {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(WEB_ENGAGEMENT);
  return out.join('\n');
};

test('WEB: every step is ATT&CK-tagged with a tactic that matches its technique', () => {
  for (const s of WEB_ENGAGEMENT.steps) {
    assert.match(s.tid, /^T\d{4}(\.\d{3})?$/, s.id);
    assert.equal(TACTIC[s.tid.split('.')[0]], s.tactic, `${s.id}: ${s.tid} is not ${s.tactic}`);
    assert.ok(s.tname && s.goal && s.defend && s.choices.length, s.id);
  }
});

test('WEB: the kill chain is the SQLi -> dump -> crack -> takeover path, each technique once, in order', () => {
  assert.deepEqual(WEB_ENGAGEMENT.steps.map((s) => s.tid), ['T1595.003', 'T1190', 'T1212', 'T1110.002', 'T1078']);
  assert.ok(WEB_ENGAGEMENT.steps.at(-1).objective, 'the admin-console takeover is the objective');
});

test('WEB: only documentation IP ranges and .example hostnames appear', () => {
  const text = allText();
  const ips = text.match(/\b\d{1,3}(\.\d{1,3}){3}\b/g) || [];
  for (const ip of ips) assert.match(ip, /^(192\.0\.2|198\.51\.100|203\.0\.113|127\.0\.0)\./, ip);
  const hosts = text.match(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|local|corp)\b/gi) || [];
  assert.deepEqual(hosts, [], 'real-looking domains');
});

test('WEB: no exploit content — recon/injection/credential tools only, canned output', () => {
  const tools = new Set(WEB_ENGAGEMENT.steps.flatMap((s) => s.choices.map((c) => c.cmd.split(' ')[0])));
  assert.deepEqual([...tools].sort(), ['curl', 'ffuf', 'hashcat', 'sqlmap']);
  assert.doesNotMatch(allText(), /msfconsole|meterpreter|reverse shell|\/bin\/sh -i|nc -e|powershell -enc|Invoke-/i);
});

test('WEB: the terminal is a whitelist; later steps are locked until reached', () => {
  const run = newRun(WEB_ENGAGEMENT);
  for (const bad of ['rm -rf /', 'cat /etc/passwd', 'nikto']) assert.equal(runCommand(run, bad).kind, 'refused', bad);
  assert.equal(run.done.length, 0);
  assert.equal(runCommand(run, 'sqlmap -u x -D claims -T users --dump').kind, 'refused', 'the dump tool is locked until SQLi is confirmed');
  assert.equal(runCommand(run, `ffuf -u https://${WEB_ENGAGEMENT.client}`).kind, 'choose', 'right tool, wrong args shows options');
  assert.equal(runCommand(run, WEB_ENGAGEMENT.steps[0].choices[0].cmd).kind, 'ok');
  assert.equal(run.done.length, 1);
});

test('WEB: full quiet run reaches the flag and the prompt changes to an admin shell', () => {
  const run = newRun(WEB_ENGAGEMENT);
  let last;
  while (nextStep(run)) {
    const s = nextStep(run);
    last = runCommand(run, s.choices.find((c) => !c.loud && !c.violation).cmd);
    assert.equal(last.kind, 'ok', s.id);
  }
  assert.ok(run.finished);
  assert.ok(last.lines.some((l) => l.includes(WEB_FLAG)));
  assert.match(run.prompt, /\(admin\)/);
});

test('WEB: dumping the policyholders (PII) table is a rules-of-engagement strike, not progress', () => {
  const run = newRun(WEB_ENGAGEMENT);
  runCommand(run, WEB_ENGAGEMENT.steps[0].choices[0].cmd); // map
  runCommand(run, WEB_ENGAGEMENT.steps[1].choices[0].cmd); // confirm
  const dump = WEB_ENGAGEMENT.steps[2];
  const r = runCommand(run, dump.choices.find((c) => c.violation).cmd);
  assert.equal(r.kind, 'violation');
  assert.equal(run.strikes, 1);
  assert.equal(run.finished, false);
  assert.ok(!run.done.includes('dump'), 'a strike is not progress');
});

test('WEB: SIEM shows every move among a web haystack; the UNION SELECT is keyed and WAF-logged', () => {
  for (const mode of ['quiet', 'loud']) {
    const run = autoplay(mode, WEB_ENGAGEMENT);
    const ev = buildSiem(run);
    assert.ok(ev.filter((e) => e.noise).length > 40, `${mode}: haystack`);
    for (const { step } of history(run)) {
      const mine = ev.filter((e) => e.key === step.id);
      assert.ok(mine.length >= 1, `${mode}: ${step.id}`);
      for (const e of mine) assert.equal(e.attack, step.tid);
      for (const e of mine) assert.ok(e.raw && e.sourcetype, `${step.id} enriched`);
    }
    for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t >= ev[i - 1].t, 'sorted');
    // Even a successful injection leaves the WAF's UNION SELECT signature.
    assert.ok(ev.some((e) => e.key === 'dump' && /UNION SELECT/i.test(e.msg) && e.source === 'waf'), `${mode}: WAF UNION`);
  }
});

test('WEB: loud raises more alerts; scoring rewards a quiet, complete hunt', () => {
  const q = autoplay('quiet', WEB_ENGAGEMENT);
  const l = autoplay('loud', WEB_ENGAGEMENT);
  const eq = buildSiem(q);
  const el = buildSiem(l);
  assert.ok(detections(el).length > detections(eq).length);
  const perfect = (run, ev) => Object.fromEntries(history(run).map(({ step }) => [step.id, ev.find((e) => e.key === step.id).id]));
  const gq = scoreRun(q, eq, perfect(q, eq));
  assert.equal(gq.pct, 100);
  assert.equal(gq.letter, 'A');
  const gl = scoreRun(l, el, perfect(l, el));
  assert.equal(gl.loud, 3, 'map + confirm + dump can all be loud');
  assert.equal(gl.pct, 70);
  const none = scoreRun(q, eq, {});
  assert.equal(none.pct, 30);
  assert.equal(none.letter, 'F');
});
