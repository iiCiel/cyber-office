// Shared checks for a Case File (used by tests/cases.test.js; also handy while writing a new case:
// import your case directly and call checkCase(yourCase) from a scratch test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameState } from '../../src/game/GameState.js';

const fresh = (id) => {
  const st = new GameState({ caseMode: true });
  st.caseId = id;
  return st;
};

export function checkCase(c, { getCase } = {}) {
  const cf = c.caseFile;
  test(`${cf.id}: caseFile is complete`, () => {
    for (const k of ['id', 'company', 'when', 'title', 'pitch', 'difficulty', 'headline', 'resume', 'disclaimer']) assert.ok(cf[k], `missing ${k}`);
    assert.ok(cf.tags.length >= 2);
    assert.ok(cf.timeline.length >= 5, 'timeline needs at least 5 steps');
    assert.ok(cf.realOutcome.length >= 1 && cf.failures.length >= 3);
    assert.ok(cf.sources.length >= 3, 'at least 3 sources');
    for (const s of cf.sources) assert.match(s.url, /^https:\/\//, `source must be https: ${s.url}`);
    assert.ok(cf.attack.length >= 3);
    for (const a of cf.attack) {
      assert.match(a.id, /^T\d{4}(\.\d{3})?$/, `bad ATT&CK id ${a.id}`);
      assert.ok(a.name && a.fix, `${a.id} needs a name and a fix`);
    }
    assert.match(cf.resume, /simulated|recreation/i, 'resume line must say it was simulated');
    assert.ok(cf.resume.includes('{grade}'));
    if (getCase) assert.equal(getCase(cf.id), c);
  });

  test(`${cf.id}: day definition works with the engine`, () => {
    assert.ok(c.objectives.some((o) => o.type === 'debrief'));
    assert.ok(c.objectives.some((o) => o.type === 'case'));
    const main = c.alerts.find((a) => a.main);
    assert.ok(main?.case, 'needs one main alert with a case');
    for (const e of c.encounters || []) assert.ok(c.objectives.some((o) => o.id === e.id), `encounter ${e.id} needs an objective`);
    for (const e of c.emails) assert.ok(e.verdictNote && e.teaches?.skill, `email ${e.id} incomplete`);
    // Emails must have arrived by the time the player can read them (on or before the end of the case).
    for (const e of c.emails) assert.ok(e.at <= (c.endAt ?? 17 * 60), `email ${e.id} arrives after the case ends`);
  });

  test(`${cf.id}: evidence keys exist in the logs, and the attack is visible by the alert`, () => {
    const st = fresh(cf.id);
    st.minutes = c.endAt ?? 17 * 60;
    const logs = c.logs(st);
    const keys = new Set(logs.map((e) => e.key).filter(Boolean));
    const main = c.alerts.find((a) => a.main);
    for (const k of main.case.keyEvidence) assert.ok(keys.has(k), `key evidence "${k}" is not in the logs`);
    assert.ok(keys.has(main.case.primaryEvidence.key));
    // Logs exist by the start of the shift (the attack already happened), and none are flagged as both attack and noise.
    st.minutes = c.start;
    const early = c.logs(st);
    assert.ok(early.filter((e) => e.attack).length >= 5, 'the attack should already be in the logs when the shift starts');
    assert.ok(!logs.some((e) => e.attack && e.noise));
    // Every IP in an attack line can be looked up.
    for (const e of logs.filter((x) => x.attack && x.ip)) assert.ok(c.ipInfo[e.ip], `no IP info for ${e.ip}`);
    // Windows paths and accounts keep their backslashes (a lone backslash in a JS string silently disappears).
    const BS = String.fromCharCode(92);
    const text = JSON.stringify(logs);
    assert.ok(!/NT AUTHORITY(SYSTEM|NETWORK|LOCAL)/.test(text), 'an NT AUTHORITY account lost its backslash');
    assert.ok(!/(Folders?|FolderPath)[":= ]+(Inbox|Sent Items|Deleted Items)/.test(text), 'a mail folder path lost its leading backslash');
    assert.ok(!text.includes(':' + BS + BS + BS + BS + BS + BS), 'tripled backslashes');
  });

  test(`${cf.id}: scoring: an empty run fails, a perfect case write-up scores well`, () => {
    const st = fresh(cf.id);
    const empty = c.score(st, st.campaign);
    assert.ok(['D', 'F'].includes(empty.grade), `empty run should fail, got ${empty.grade}`);
    const main = c.alerts.find((a) => a.main);
    st.soc.cases[main.id] = {
      verdict: main.case.correctVerdict,
      evidence: main.case.keyEvidence.slice(0, 3).map((key) => ({ key })).concat([{ key: main.case.primaryEvidence.key }]),
      actions: main.case.actions.filter((a) => a.good).map((a) => a.id),
    };
    const caseItem = c.score(st, st.campaign).items.find((i) => i.id === (main.case.id || 'case'));
    assert.equal(caseItem.outcome, 'good');
    assert.equal(caseItem.points, caseItem.max);
    assert.ok(caseItem.contained);
    assert.ok(c.debrief(st, st.campaign).length >= 3);
  });
}
