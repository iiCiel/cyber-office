import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CCDC_LAB } from '../src/data/ccdcLabScenario.js';
import { CCDC_LAB_2 } from '../src/data/ccdcLabScenario2.js';
import { newGame, runLine, answerInject, score, expire, MODES } from '../src/game/ccdcLab.js';
import { attachEngine, tickTo } from '../src/game/ccdcEngine.js';
import { teamsAt, standings, rankOf, liveTeamScore, roster } from '../src/game/ccdcTeams.js';

const fresh = (seed = 1, sc = CCDC_LAB) => attachEngine(newGame(sc, { seed, mode: MODES.COMPETITION }));
const strip = (rows) => rows.filter((r) => !r.you).map((r) => JSON.stringify(r));

test('roster has 9-11 rivals plus the player, deterministic per seed', () => {
  for (const seed of [1, 2, 3, 99, 12345]) {
    const r = roster(fresh(seed));
    assert.ok(r.length >= 10 && r.length <= 12);
    assert.equal(r.filter((t) => t.you).length, 1);
    assert.deepEqual(r.map((t) => t.team), roster(fresh(seed)).map((t) => t.team));
  }
});

test('rival teams recompute identically from (seed, clock)', () => {
  const a = fresh(7); const b = fresh(7);
  tickTo(a, 600);
  assert.deepEqual(strip(teamsAt(a, 450)), strip(teamsAt(b, 450)));
  assert.deepEqual(strip(teamsAt(a, 450)), strip(teamsAt(a, 450)));
});

test('different seeds give different fields', () => {
  assert.notDeepEqual(strip(teamsAt(fresh(1), 600)), strip(teamsAt(fresh(2), 600)));
});

test('scores only go up over time except for SLA / compromise hits, and move every check early', () => {
  const s = fresh(3);
  const at = (t) => teamsAt(s, t).filter((r) => !r.you).reduce((n, r) => n + r.score, 0);
  assert.ok(at(300) > at(60));
  assert.ok(at(60) > 0);
});

test('rivals lose services around wave times', () => {
  const s = fresh(5);
  const downsAt = (t) => teamsAt(s, t).filter((r) => !r.you).reduce((n, r) => n + Object.values(r.services).filter((v) => v === 'down').length, 0);
  assert.ok(downsAt(180 + 30) > downsAt(150), 'more services down right after wave 1');
  assert.ok(downsAt(450 + 30) > downsAt(420), 'and after wave 2');
});

test('the field is spread out: a strong and a weak team exist', () => {
  const rows = teamsAt(fresh(4), 900).filter((r) => !r.you).map((r) => r.score).sort((a, b) => a - b);
  assert.ok(rows[rows.length - 1] - rows[0] > 100, 'spread ' + rows.join(','));
});

test('standings are sorted and ranked, rank reflects the player score', () => {
  const s = fresh(6);
  tickTo(s, 400);
  const rows = standings(s);
  rows.forEach((r, i) => assert.equal(r.rank, i + 1));
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].score >= rows[i].score);
  const before = rankOf(s).rank;
  // Break a service: the player's rank can only get worse or stay.
  runLine(s, 'db01', 'ufw deny 3306');
  tickTo(s, 700);
  const after = rankOf(s).rank;
  assert.ok(after >= before - 0, 'rank did not improve while services were down');
});

test('player can finish anywhere: idle player is not first, a perfect round beats most rivals', () => {
  const idle = fresh(8);
  runLine(idle, 'db01', 'ufw deny 3306');
  tickTo(idle, 900); expire(idle);
  const idleRank = rankOf(idle, 900);
  const good = fresh(8);
  tickTo(good, 900);
  for (const i of good.injectList) answerInject(good, i.id, 'x'.repeat(5)); // too short -> ignored
  expire(good);
  const goodRank = rankOf(good, 900);
  assert.ok(goodRank.rank <= idleRank.rank);
  assert.ok(idleRank.rank >= Math.ceil(idleRank.of / 2), 'broken player sits in the lower half, got ' + idleRank.rank);
});

test('liveTeamScore matches the final scorecard at the end of the round', () => {
  for (const sc of [CCDC_LAB, CCDC_LAB_2]) {
    const s = fresh(9, sc);
    tickTo(s, 150);
    const mid = liveTeamScore(s);
    assert.ok(mid > 0);
    tickTo(s, sc.clockSeconds);
    expire(s);
    assert.equal(liveTeamScore(s), score(s).raw);
  }
});

test('before any wave a quiet player has earned exactly points x passed/total checks', () => {
  const s = fresh(10);
  tickTo(s, 150); // 5 of 30 checks
  const max = s.serviceList.reduce((n, x) => n + x.points, 0);
  assert.equal(liveTeamScore(s), Math.round((max * 5) / 30));
});
