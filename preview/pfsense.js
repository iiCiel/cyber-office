// Dev-only preview: mounts the pfSense GUI full-screen on the Cedarline edge firewall.
import { CCDC_LAB } from '../src/data/ccdcLabScenario.js';
import { newGame, runLine } from '../src/game/ccdcLab.js';
import { PfSenseApp } from '../src/ui/ccdc/PfSenseApp.js';
import '../src/ui/ccdc/pfsense.css';

const state = newGame(CCDC_LAB, { seed: 1 });
const dev = state.deviceList.find((d) => d.id === 'edge-fw');
const t0 = Date.now() - 300000; // pretend 5 minutes into the round
const app = new PfSenseApp({ state, dev, run: (l) => runLine(state, 'edge-fw', l), clock: () => (Date.now() - t0) / 1000 });
document.getElementById('root').append(app.el);
setInterval(() => app.refresh(), 1000);
window.__pf = { app, state };
