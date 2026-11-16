import test from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS, EXAMS, SHEET, sheetHtml, studyNext, examGoals } from '../src/data/cptcAcademy.js';
import { QUIZ } from '../src/data/cptcQuiz.js';
import { CPTC_SCENARIOS } from '../src/data/cptcScenarios.js';
import { newReport, runEnum, rate, setExecSummary, gradeText, severityFor, score, MODES } from '../src/game/cptclab.js';

const scenarioFor = (key) => CPTC_SCENARIOS.find((s) => s.id.startsWith(key)) || CPTC_SCENARIOS[0];
const norm = (s) => String(s).trim().replace(/\s+/g, ' ').toLowerCase();

function walk(lesson) {
  const sc = scenarioFor(lesson.sc || 'meridian');
  const st = newReport(sc, { mode: MODES.GUIDED });
  const log = [];
  let lastOut = '';
  const c = (mark) => ({
    st,
    ran: (want) => log.slice(mark).some((l) => (want instanceof RegExp ? want.test(l) : norm(l).includes(norm(want)))),
    found: (id) => !!st.discovered[id],
    rated: (id) => { const r = st.report[id]; return !!(r && r.likelihood && r.impact); },
    lastOut: () => lastOut,
  });
  lesson.steps.forEach((s, i) => {
    const where = `${lesson.id} step ${i + 1}`;
    const mark = log.length;
    const cmd = typeof s.type === 'function' ? s.type(st) : s.type;
    if (cmd) {
      const r = runEnum(st, cmd);
      lastOut = r.lines.map((l) => l.text).join('\n');
      log.push(norm(cmd));
      assert.doesNotMatch(lastOut, /: no result\. type|not a rule-editor/i, `${where}: "${cmd}" produced nothing:\n${lastOut}`);
    }
    if (s.ask) {
      const re = typeof s.ask.a === 'function' ? s.ask.a(st) : s.ask.a;
      assert.match(s.ask.sample, re, `${where}: sample fails its own regex`);
      if (s.ask.seen) assert.ok(lastOut.toLowerCase().includes(String(s.ask.sample).toLowerCase()), `${where}: "${s.ask.sample}" not in output:\n${lastOut}`);
    } else if (s.rate) {
      const f = sc.findings.find((x) => x.id === s.rate.finding);
      rate(st, f.id, 'likelihood', f.refLikelihood);
      rate(st, f.id, 'impact', f.refImpact);
      assert.equal(severityFor(f.refLikelihood, f.refImpact), severityFor(st.report[f.id].likelihood, st.report[f.id].impact), where);
    } else if (s.write) {
      if (s.write.exec) { setExecSummary(st, EXEC_ANSWERS[sc.id] || ''); assert.ok(gradeText(sc.execRubric, st.execSummary).credit >= (s.write.pass || 0.6), `${where}: exec answer too weak`); }
      else { const f = sc.findings.find((x) => x.id === s.write.finding); const g = gradeText(f.remediationRubric, REM_ANSWERS[f.id] || ''); assert.ok(g.credit >= (s.write.pass || 0.6), `${where}: remediation answer for ${f.id} scored ${g.credit}: missing ${g.missing}`); }
    } else if (s.discovers) assert.ok(c(mark).found(s.discovers), `${where}: did not confirm ${s.discovers}`);
    else if (s.done) assert.ok(s.done(c(mark)), `${where}: check failed`);
  });
}

// Model answers good enough to pass each write step (the player writes their own; these prove it is passable).
const REM_ANSWERS = {
  'ext-rdp': 'Remove RDP from the internet by closing 3389 at the edge firewall. Put all remote access behind a VPN or RD Gateway and require MFA for every remote login.',
  'sql-injection': 'Rewrite the login to use parameterized queries / prepared statements so input cannot change the query. Run the database account with least privilege and validate input.',
  'api-idor': 'Enforce object-level authorization on the server for every request: check the logged-in session owns the account id before returning it, do not trust the id from the client.',
};
const EXEC_ANSWERS = {
  'meridian-lab-2026': 'The hospital is at elevated risk of a patient-data breach and ransomware. Two issues stand out: Remote Desktop is open to the internet, and the patient portal login is vulnerable to SQL injection. We recommend closing both within 72 hours, which will sharply lower the risk of a breach.',
};

for (const lesson of LESSONS) test(`offensive lesson runs start to finish: ${lesson.title}`, () => walk(lesson));

test('lessons work in any order', () => { for (const l of [...LESSONS].reverse()) walk(l); });

test('every exam is fully completable', () => {
  for (const x of EXAMS) {
    const sc = scenarioFor(x.sc);
    const st = newReport(sc, { mode: MODES.GUIDED });
    for (const [, cmd] of x.solutions) runEnum(st, cmd);
    for (const id of x.findings) { const f = sc.findings.find((z) => z.id === id); rate(st, id, 'likelihood', f.refLikelihood); rate(st, id, 'impact', f.refImpact); }
    setExecSummary(st, 'The client faces a serious risk of a data breach from several issues we confirmed, which we recommend fixing within two weeks to reduce the risk.');
    const c = { st, found: (id) => !!st.discovered[id], rated: (id) => { const r = st.report[id]; return !!(r && r.likelihood && r.impact); } };
    for (const g of examGoals(x, sc)) assert.ok(g.done(c), `${x.id}: ${g.text}`);
    assert.ok(score(st).coverage > 0, x.id);
  }
});

test('every quiz answer passes its own check', () => { for (const q of QUIZ) assert.match(q.sample, q.a, q.q); });

test('every finding in each scenario maps to a study lesson', () => {
  const ids = LESSONS.map((l) => l.id);
  for (const sc of CPTC_SCENARIOS) {
    const st = newReport(sc, {});
    const list = studyNext(st, { risk: 0, remRows: [], execOk: false });
    for (const x of list) assert.ok(ids.includes(x.lesson), `${sc.id}: ${x.lesson}`);
    assert.ok(list.length >= sc.findings.length / 2, sc.id);
  }
});

test('the printable sheet carries every section', () => { const html = sheetHtml(); for (const [t] of SHEET) assert.ok(html.includes(t.replace('&', '&amp;')), t); });

test('a rate step reference severity is self-consistent', () => {
  for (const sc of CPTC_SCENARIOS) for (const f of sc.findings) assert.ok(severityFor(f.refLikelihood, f.refImpact), `${sc.id}/${f.id}`);
});
