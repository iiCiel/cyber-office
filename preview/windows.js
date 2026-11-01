// Dev-only preview of the Windows remote-desktop GUI (not part of the game build).
//   /cyber-office/preview/windows.html?sc=1&dev=dc01   (sc: 1 Cedarline, 2 Harbor Point; dev: dc01 | ws01)
import { CCDC_LAB } from '../src/data/ccdcLabScenario.js';
import { CCDC_LAB_2 } from '../src/data/ccdcLabScenario2.js';
import { newGame, runLine } from '../src/game/ccdcLab.js';
import { WinDesktop } from '../src/ui/ccdc/WinDesktop.js';

const q = new URLSearchParams(location.search);
const scenario = q.get('sc') === '2' ? CCDC_LAB_2 : CCDC_LAB;
const devId = q.get('dev') || 'dc01';
const state = newGame(scenario, { seed: 1 });
const dev = state.deviceList.find((d) => d.id === devId);
const t0 = Date.now() - 65 * 1000;
const clock = () => Math.floor((Date.now() - t0) / 1000);
const desk = new WinDesktop({ state, dev, run: (line) => runLine(state, devId, line), termBuffer: [], termHistory: [], clock });
document.getElementById('root').append(desk.el);
setInterval(() => desk.refresh(), 1000);
window.__desk = desk; window.__state = state;
