// Codex review on PR #6 (ccdcLab.js:364): ending a round early must score exactly like letting the clock run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CCDC_LAB } from '../src/data/ccdcLabScenario.js';
import { CCDC_LAB_2 } from '../src/data/ccdcLabScenario2.js';
import { CCDC_LAB_3 } from '../src/data/ccdcLabScenario3.js';
import { newGame, score, expire, MODES } from '../src/game/ccdcLab.js';
import { attachEngine, tickTo } from '../src/game/ccdcEngine.js';

const pick = (sc) => ({ service: sc.service ?? sc.services ?? sc.servicePts, sla: sc.sla ?? sc.slaPenalty, total: sc.total });

for (const [name, scen] of [['CCDC_LAB', CCDC_LAB], ['CCDC_LAB_2', CCDC_LAB_2], ['CCDC_LAB_3', CCDC_LAB_3]]) {
  test(`${name}: ending immediately scores the same as ticking second by second`, () => {
    const a = attachEngine(newGame(scen, { seed: 1, mode: MODES.COMPETITION }));
    expire(a); // jumps straight to the buzzer
    const b = attachEngine(newGame(scen, { seed: 1, mode: MODES.COMPETITION }));
    for (let t = 1; t <= b.timeLimitSec; t++) tickTo(b, t);
    expire(b);
    assert.ok(a.timeLimitSec > 0);
    assert.equal(a.engine.uptimePoints, b.engine.uptimePoints);
    assert.equal(a.engine.slaViolations, b.engine.slaViolations);
    assert.deepEqual(score(a), score(b));
  });

  test(`${name}: a mid-round jump matches stepwise ticking`, () => {
    const a = attachEngine(newGame(scen, { seed: 1, mode: MODES.COMPETITION }));
    tickTo(a, 37); tickTo(a, Math.floor(a.timeLimitSec * 0.8));
    const b = attachEngine(newGame(scen, { seed: 1, mode: MODES.COMPETITION }));
    for (let t = 1; t <= Math.floor(b.timeLimitSec * 0.8); t++) tickTo(b, t);
    assert.equal(a.engine.uptimePoints, b.engine.uptimePoints);
    assert.equal(a.engine.slaViolations, b.engine.slaViolations);
    assert.deepEqual(a.engine.probes, b.engine.probes);
  });
}
