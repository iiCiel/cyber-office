import test from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS, SHEET, sheetHtml } from '../src/data/ccdcAcademy.js';
import { EXAMS, studyNext } from '../src/data/ccdcAcademyMore.js';
import { QUIZ } from '../src/data/ccdcQuiz.js';
import { CCDC_MIDWEST as MW } from '../src/data/ccdcLabMidwest.js';
import { MODES, gradeInject, newGame, resetBoxes, runLine } from '../src/game/ccdcLab.js';
import { attachEngine } from '../src/game/ccdcEngine.js';
import { syncServices } from '../src/game/ccdcBox.js';
import { createSiem } from '../src/game/siemGen.js';
import { startSearch } from '../src/game/siemSearch.js';
import { submitIncident } from '../src/game/ccdcIncident.js';

function fresh() {
  const st = newGame(MW, { seed: 21, mode: MODES.GUIDED, length: 'long' });
  attachEngine(st);
  st.engine.red.next = Infinity;
  return st;
}
const norm = (s) => String(s).trim().replace(/\s+/g, ' ');

function walk(lesson) {
  const st = fresh();
  resetBoxes(st, lesson.vms);
  const log = [];
  let lastOut = '';
  const c = (mark) => ({
    st, loggedIn: () => true,
    ran: (vm, want) => log.slice(mark).some((l) => l.vm === vm && (want instanceof RegExp ? want.test(l.line) : l.line === norm(want))),
    lastIncident: () => st.incidents?.[st.incidents.length - 1],
  });
  lesson.steps.forEach((s, i) => {
    const where = `${lesson.id} step ${i + 1}`;
    const mark = log.length;
    s.setup?.(st);
    const line = typeof s.type === 'function' ? s.type(st) : s.type;
    if (line && s.edit) { /* opened in the console's editor */ } else if (line && s.browser) log.push({ vm: s.vm, line: norm(line) });
    else if (line) {
      const res = runLine(st, s.vm, line);
      lastOut = res.lines.map((l) => l.text).join('\n');
      log.push({ vm: s.vm, line: norm(line) });
      if (s.expectFail) assert.match(lastOut, s.expectFail instanceof RegExp ? s.expectFail : /command not found/, where);
      else assert.doesNotMatch(lastOut, /command not found|not recognized|Unknown command|Invalid syntax/i, `${where}: ${line} -> ${lastOut}`);
      for (const extra of s.testLines || []) runLine(st, s.vm, extra);
    }
    if (s.edit) { const fs = st.devState[s.vm].fs; assert.ok(fs[s.edit.path].includes(s.edit.find), `${where}: ${s.edit.find}`); fs[s.edit.path] = fs[s.edit.path].replace(s.edit.find, s.edit.replace); runLine(st, s.vm, `printf '' | tee -a ${s.edit.path}`); }
    if (s.simWait) { st.engine.clock += 200; syncServices(st); log.push({ vm: s.vm, line: norm(line) }); }
    if (s.sim === 'incident') {
      const im = st.engine.red.implants.find((x) => x.dev === 'mail');
      const ev = st.engine.red.events.find((e) => e.artifact === im.artifact);
      submitIncident(st, { host: 'mail', src: st.engine.red.ip, time: '08:00', what: `Attacker planted ${im.artifact} on the mail server`, evidence: `Accepted password for root from ${st.engine.red.ip} and new file ${im.artifact}`, remediation: 'Removed the cron file and changed the root password', prevention: 'Rotated passwords, limited SSH through the firewall, and reviewing cron daily from now on', at: ev.at });
    } else if (typeof s.sim === 'function') s.sim(st);
    if (s.ask) {
      const re = typeof s.ask.a === 'function' ? s.ask.a(st) : s.ask.a;
      const sample = typeof s.ask.sample === 'function' ? s.ask.sample(st) : s.ask.sample;
      assert.match(sample, re, where);
      if (s.ask.seen) assert.ok(lastOut.includes(sample), `${where}: "${sample}" is not in the output of the previous command:\n${lastOut}`);
    } else if (s.write?.inject) { assert.ok(s.write.inject.rubric.length); } else if (s.done) assert.ok(s.done(c(mark)), `${where}: check did not pass`);
  });
}

for (const lesson of LESSONS) test(`lesson runs start to finish: ${lesson.title}`, () => walk(lesson));

test('lessons work in any order on the same round', () => {
  for (const lesson of [...LESSONS].reverse()) walk(lesson);
});

test('every memo exercise can be passed and a keyword list cannot', () => {
  const st = fresh();
  const answers = {
    'rdp-request': 'To: Sales Director\nFrom: IT Team\nDate: November 14\nSubject: Remote access\n\nWe cannot open remote desktop to the internet because exposed RDP is a major ransomware and brute force risk. Instead we will set up a VPN with multi-factor authentication so that you can reach your office PC safely from the road.',
    'pw-policy': 'To: All Staff\nFrom: IT Team\nDate: November 14\nSubject: Password policy\n\nAll passwords must be at least 14 characters long. Do not reuse a previous password on any system. Today we changed the administrator passwords on our servers. If you need help, please contact the help desk and open a ticket with us.',
  };
  for (const [id, text] of Object.entries(answers)) {
    const inj = st.injectList.find((i) => i.id === id);
    const g = gradeInject(inj, text, st);
    assert.ok(g.pts / g.max >= 0.75, `${id}: ${g.missing}`);
    assert.equal(gradeInject(inj, 'vpn mfa risk not open cannot', st).pts < g.max * 0.75, true);
  }
});

test('the Splunk lesson answers are in the logs', async () => {
  const siem = createSiem(MW, { seed: 3 });
  const run = (q) => new Promise((resolve) => { const j = startSearch(siem, q, { onDone: (h) => resolve(h) }); j.done && resolve(j); });
  const a = await run('sourcetype=access_combined uploads | stats count by src_ip, uri');
  assert.ok(JSON.stringify(a.table).includes('198.51.100.61'));
  const b = await run('sourcetype=linux_secure "Accepted password" root | stats count by src_ip');
  assert.ok(JSON.stringify(b.table).includes('172.20.242.10'));
  const c = await run('EventCode=4728 | stats count by user');
  assert.ok(JSON.stringify(c.table).includes('svc_audit'));
});

test('the printable sheet carries every section', () => {
  const html = sheetHtml();
  for (const [t] of SHEET) assert.ok(html.includes(t.replace('&', '&amp;')), t);
});

test('a stateful iptables rule does not count as allowing a port', () => {
  const st = fresh();
  runLine(st, 'dns', 'iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT');
  runLine(st, 'dns', 'iptables -P INPUT DROP');
  syncServices(st);
  assert.equal(st.services.dns.state, 'down');
});

test('blocking a whole subnet is a rule violation, a single address is not', () => {
  const st = fresh();
  const pan = (...l) => l.forEach((x) => runLine(st, 'pan', x));
  pan('configure', 'set rulebase security rules bad from Core to any source 198.51.100.7 destination any application any service any action deny', 'move rulebase security rules bad top', 'commit');
  st.engine.clock += 200; syncServices(st);
  assert.ok(!(st.ruleViolations || []).some((v) => v.id === 'subnet'));
  pan('set rulebase security rules wide from Core to any source 198.51.100.0/24 destination any application any service any action deny', 'commit');
  st.engine.clock += 200; syncServices(st);
  assert.ok(st.ruleViolations.some((v) => v.id === 'subnet'));
});

const STRONG = 'Sturdy-Horse-42-Plan';
function playChecklists(st, vms) {
  for (const id of vms) {
    const d = st.deviceList.find((x) => x.id === id);
    for (const raw of d.checklist) {
      const line = raw.replace('NEW-PASSWORD-HERE', STRONG);
      if (!/^firefox/.test(line)) runLine(st, id, line);
    }
  }
}

for (const x of EXAMS) test(`exam can be completed: ${x.title}`, () => {
  const st = fresh();
  resetBoxes(st, x.vms);
  x.setup?.(st);
  if (x.id === 'x-ir') {
    const dev = 'ecom';
    runLine(st, dev, 'pkill -9 -t pts/7');
    const im = st.engine.red.implants.find((i) => i.dev === dev);
    runLine(st, dev, `userdel ${im.artifact}`);
    submitIncident(st, { host: 'ecomm', src: st.engine.red.ip, time: '08:00', what: `Attacker created ${im.artifact}`, evidence: `Accepted password for root from ${st.engine.red.ip} and new account ${im.artifact}`, remediation: 'Removed the account and changed the root password', prevention: 'Rotated passwords, limited SSH through the firewall and reviewing accounts daily from now on' });
  } else playChecklists(st, x.vms);
  if (x.id === 'x-firewall') { runLine(st, 'pan', 'configure'); runLine(st, 'pan', 'set mgt-config users admin password'); runLine(st, 'pan', STRONG); runLine(st, 'pan', STRONG); runLine(st, 'pan', 'commit'); }
  for (const v of x.vms) if (st.devState[v].creds.root) { runLine(st, v, 'passwd root'); runLine(st, v, STRONG); runLine(st, v, STRONG); }
  st.engine.clock += 200;
  syncServices(st);
  const c = { st, ran: () => true, loggedIn: () => true, lastIncident: () => st.incidents?.[st.incidents.length - 1] };
  for (const g of x.goals) assert.ok(g.done(c), `${x.id}: ${g.text}`);
});

test('every quiz answer passes its own check', () => { for (const q of QUIZ) assert.match(q.sample, q.a, q.q); });

test('every finding has a lesson to study', () => {
  const st = fresh();
  const list = studyNext(st, { violationPenalty: 0, slaCount: 0, injectResults: [], injectMax: 0, injectPts: 0, ruleViolations: [] });
  const ids = LESSONS.map((l) => l.id);
  assert.ok(list.length > 5);
  for (const x of list) assert.ok(ids.includes(x.lesson), x.lesson);
});

test('an immutable file refuses root until the flag comes off', () => {
  const st = fresh();
  assert.match(runLine(st, 'web', 'rm /root/.ssh/authorized_keys').lines[0].text, /not permitted/);
  runLine(st, 'web', 'chattr -i /root/.ssh/authorized_keys');
  runLine(st, 'web', 'rm /root/.ssh/authorized_keys');
  assert.equal(st.devState.web.fs['/root/.ssh/authorized_keys'], undefined);
});

test('with outbound closed, beacons cannot call home', async () => {
  const { panosEgressOpen } = await import('../src/game/ccdcBox.js');
  const st = fresh();
  const dev = st.deviceList.find((d) => d.id === 'ecom');
  assert.ok(panosEgressOpen(st, dev));
  for (const l of ['configure', 'delete rulebase security rules allow-all', 'commit']) runLine(st, 'pan', l);
  st.engine.clock += 200; syncServices(st);
  assert.ok(!panosEgressOpen(st, dev));
});
