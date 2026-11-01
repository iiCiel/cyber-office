// Dev-only preview of the CCDC web apps (never linked from the game).
import { CCDC_LAB } from '../src/data/ccdcLabScenario.js';
import { newGame, answerInject, MODES } from '../src/game/ccdcLab.js';
import { attachEngine, tickTo } from '../src/game/ccdcEngine.js';
import { ScoreboardApp } from '../src/ui/ccdc/ScoreboardApp.js';
import { InjectsApp } from '../src/ui/ccdc/InjectsApp.js';
import { ChatApp } from '../src/ui/ccdc/ChatApp.js';

const q = new URLSearchParams(location.search);
const view = q.get('view') || 'all';
const start = Number(q.get('t') || 400);
const state = attachEngine(newGame(CCDC_LAB, { seed: 3, mode: MODES.COMPETITION }));
let clock = 0;
const adv = (to) => { while (clock < to) { clock = Math.min(to, clock + 5); tickTo(state, clock); } };
adv(start);
window.__state = state; window.__adv = adv;

const injects = new InjectsApp({
  state, guided: q.get('guided') === '1', clock: () => clock,
  onSubmit: (id, text) => answerInject(state, id, text),
});
const sb = new ScoreboardApp({ state, clock: () => clock, injects });
const chat = new ChatApp({ state, clock: () => clock });
window.__apps = { sb, injects, chat };

const root = document.getElementById('root');
const cell = (el) => { const d = document.createElement('div'); d.append(el.el); return d; };
if (view === 'scoreboard') { root.append(cell(sb)); const t = q.get('tab'); if (t) sb.show(t); }
else if (view === 'injects') { root.append(cell(injects)); injects.select(state.injectList[0].id); }
else if (view === 'chat') root.append(cell(chat));
else { root.style.gridTemplateColumns = innerWidth > 900 ? '1.4fr 1fr' : '1fr'; root.append(cell(sb), cell(chat)); }
setInterval(() => { if (q.get('live') === '1') adv(clock + 1); document.getElementById('clk').textContent = `clock ${clock}s`; sb.refresh(); injects.refresh(); chat.refresh(); }, 1000);
