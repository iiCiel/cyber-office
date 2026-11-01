// Dev-only preview: mounts the SIEM full screen. ?s=2 for Harbor Point.  Not part of the game bundle.
import { SiemApp } from '../src/ui/ccdc/SiemApp.js';
import { createSiem } from '../src/game/siemGen.js';
import CED from '../src/data/ccdcLabScenario.js';
import HP from '../src/data/ccdcLabScenario2.js';

const sc = new URLSearchParams(location.search).get('s') === '2' ? HP : CED;
const siem = createSiem(sc, { seed: 1 });
let clock = 0;
const app = new SiemApp({
  siem,
  hunt: siem.hunt,
  clock: () => clock,
  onHuntAnswer: (id, text) => {
    const q = siem.hunt.find((x) => x.id === id);
    return q.accept.test(text) ? { ok: true, msg: 'Correct. ' + q.explain } : { ok: false, msg: 'Not quite. Keep looking in the logs.' };
  },
});
document.getElementById('root').append(app.el);
setInterval(() => { clock++; app.refresh(); }, 1000);
app.focus();
window.__siem = { app, siem, setClock: (c) => { clock = c; app.refresh(); } };
