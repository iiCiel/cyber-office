// Numeric proof that a CCDC round is alive: rival scores, red-team waves and injects change over time.
// Plays an untouched round (seed 1) and prints one row per minute. Usage: node scripts/round-timeline.mjs [2]
import { CCDC_LAB } from '../src/data/ccdcLabScenario.js';
import { CCDC_LAB_2 } from '../src/data/ccdcLabScenario2.js';
import { CCDC_LAB_3 } from '../src/data/ccdcLabScenario3.js';
import { newGame, MODES } from '../src/game/ccdcLab.js';
import { attachEngine, tickTo, fmtClock } from '../src/game/ccdcEngine.js';
import { standings } from '../src/game/ccdcTeams.js';

const scen = process.argv[2] === '3' ? CCDC_LAB_3 : process.argv[2] === '2' ? CCDC_LAB_2 : CCDC_LAB;
const s = attachEngine(newGame(scen, { seed: 1, mode: MODES.COMPETITION }));
const end = s.timeLimitSec;
const out = [`# ${scen.company || scen.name || scen.id}: untouched round, seed 1, ${fmtClock(end)} long`, ''];
const first = standings(s, 0).filter((r) => !r.you).map((r) => r.team).slice(0, 4);
out.push(`| clock | you | rank | ${first.join(' | ')} | waves fired | probes / compromised | injects released / overdue | SLA |`);
out.push(`|---|---|---|${first.map(() => '---').join('|')}|---|---|---|---|`);
for (let t = 0; t <= end; t += 60) {
  tickTo(s, t);
  const rows = standings(s, t);
  const me = rows.find((r) => r.you);
  const e = s.engine;
  const probes = Object.values(e.probes);
  const it = Object.values(e.injectTimers);
  out.push(`| ${fmtClock(t)} | ${me.score} | ${me.rank}/${rows.length} | ${first.map((n) => rows.find((r) => r.team === n).score).join(' | ')} | ${e.waves.filter((w) => w.fired).length}/${e.waves.length} | ${probes.length} / ${probes.filter((p) => p === 'compromised').length} | ${it.filter((x) => x.released).length} / ${it.filter((x) => x.overdue).length} | ${e.slaViolations} |`);
}
out.push('', '## Engine events', '', ...s.engine.events.filter((e) => e.cls !== 'team').map((e) => `- ${fmtClock(e.at)} [${e.cls}] ${e.text}`));
console.log(out.join('\n'));
