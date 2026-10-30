import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRun, runCommand, nextStep, autoplay, buildSiem, detections, scoreRun, history, norm } from '../src/game/engage.js';
import { ENGAGEMENT, FLAG } from '../src/cases/halcyon-engagement.js';

// ATT&CK technique (base id) -> tactic it belongs to, for the techniques this engagement uses.
const TACTIC = { T1595: 'Reconnaissance', T1552: 'Credential Access', T1078: 'Initial Access', T1016: 'Discovery', T1046: 'Discovery', T1021: 'Lateral Movement', T1039: 'Collection' };

const allText = () => {
  const out = [];
  const walk = (v) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(ENGAGEMENT);
  return out.join('\n');
};

test('every step is ATT&CK-tagged with a tactic that matches its technique', () => {
  for (const s of ENGAGEMENT.steps) {
    assert.match(s.tid, /^T\d{4}(\.\d{3})?$/, s.id);
    assert.equal(TACTIC[s.tid.split('.')[0]], s.tactic, `${s.id}: ${s.tid} is not ${s.tactic}`);
    assert.ok(s.tname && s.goal && s.defend && s.choices.length, s.id);
  }
});

test('only documentation IP ranges and .example hostnames appear', () => {
  const text = allText();
  const ips = text.match(/\b\d{1,3}(\.\d{1,3}){3}\b/g) || [];
  for (const ip of ips) assert.match(ip, /^(192\.0\.2|198\.51\.100|203\.0\.113|127\.0\.0)\./, ip);
  const hosts = text.match(/\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|local|corp)\b/gi) || [];
  assert.deepEqual(hosts.filter((h) => !/nmap\.org/i.test(h)), [], 'real-looking domains');
});

test('no real exploit content: commands are recon/login/file tools only', () => {
  const tools = new Set(ENGAGEMENT.steps.flatMap((s) => s.choices.map((c) => c.cmd.split(' ')[0])));
  assert.deepEqual([...tools].sort(), ['curl', 'dirscan', 'get', 'ip', 'nmap', 'smbclient', 'ssh']);
  assert.doesNotMatch(allText(), /msfconsole|meterpreter|reverse shell|\/bin\/sh -i|nc -e|powershell -enc/i);
});

test('the terminal is a whitelist: anything else is refused and nothing advances', () => {
  const run = newRun();
  for (const bad of ['rm -rf /', 'cat /etc/shadow', 'python3 -c "print(1)"', 'nc 203.0.113.10 22']) {
    const r = runCommand(run, bad);
    assert.equal(r.kind, 'refused', bad);
  }
  assert.equal(run.done.length, 0);
  assert.equal(runCommand(run, 'ssh svc_portal@203.0.113.10').kind, 'refused', 'later step is locked');
  assert.equal(runCommand(run, 'nmap 203.0.113.10').kind, 'choose', 'right tool, wrong args shows options');
  assert.equal(runCommand(run, 'help').kind, 'builtin');
  assert.equal(runCommand(run, '  NMAP   -sV -p 22,80,443   203.0.113.10 ').kind, 'ok', 'case/space-insensitive');
  assert.equal(run.done.length, 1);
});

test('full quiet run reaches the flag; output and prompts change along the way', () => {
  const run = newRun();
  let last;
  while (nextStep(run)) {
    const s = nextStep(run);
    last = runCommand(run, s.choices.find((c) => !c.loud && !c.violation).cmd);
    assert.equal(last.kind, 'ok');
  }
  assert.ok(run.finished);
  assert.ok(last.lines.some((l) => l.includes(FLAG)));
  assert.equal(run.prompt, 'smb: \\>');
});

test('copying the customer data is a rules-of-engagement strike, not progress', () => {
  const run = autoplay('quiet');
  const r2 = newRun();
  for (const id of run.done.slice(0, -1)) runCommand(r2, ENGAGEMENT.steps.find((s) => s.id === id).choices[0].cmd);
  const r = runCommand(r2, 'get Q4_claims_export.csv');
  assert.equal(r.kind, 'violation');
  assert.equal(r2.strikes, 1);
  assert.equal(r2.finished, false);
});

test('SIEM shows every move: each step leaves at least one keyed, ATT&CK-tagged event among noise', () => {
  for (const mode of ['quiet', 'loud']) {
    const run = autoplay(mode);
    const ev = buildSiem(run);
    assert.ok(ev.filter((e) => e.noise).length > 40, 'haystack');
    for (const { step } of history(run)) {
      const mine = ev.filter((e) => e.key === step.id);
      assert.ok(mine.length >= 1, `${mode}: ${step.id}`);
      for (const e of mine) assert.equal(e.attack, step.tid);
      for (const e of mine) assert.ok(e.raw && e.sourcetype, `${step.id} enriched`);
    }
    for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t >= ev[i - 1].t, 'sorted');
  }
});

test('loud choices raise more alerts and cost stealth', () => {
  const q = autoplay('quiet');
  const l = autoplay('loud');
  const eq = buildSiem(q);
  const el = buildSiem(l);
  assert.ok(detections(el).length > detections(eq).length);
  const perfect = (run, ev) => Object.fromEntries(history(run).map(({ step }) => [step.id, ev.find((e) => e.key === step.id).id]));
  const gq = scoreRun(q, eq, perfect(q, eq));
  const gl = scoreRun(l, el, perfect(l, el));
  assert.equal(gq.pct, 100);
  assert.equal(gq.letter, 'A');
  assert.equal(gl.pct, 70);
  const none = scoreRun(q, eq, {});
  assert.equal(none.pct, 30);
  assert.equal(none.letter, 'F');
  const half = scoreRun(q, eq, perfect(q, eq), { 'ssh-in': 2 });
  assert.equal(half.found, 8);
  assert.ok(half.pct < 100 && half.pct > 90, `retries cost half credit (${half.pct})`);
  const noise = eq.find((e) => e.noise);
  assert.equal(scoreRun(q, eq, { 'ssh-in': noise.id }).found, 0, 'noise is not evidence');
});

test('norm collapses whitespace and case', () => {
  assert.equal(norm('  IP   Addr '), 'ip addr');
});
