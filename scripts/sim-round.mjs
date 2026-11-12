// Headless CCDC round: drive the real engine over a full competition day and print the
// service up/down timeline + red-team events, to see whether "services drop under continuous
// attack, you bring them back, they get knocked down again" actually happens.
import { CCDC_LAB } from '../src/data/ccdcLabScenario.js';
import { newGame, runLine, MODES, SERVICE_STATE } from '../src/game/ccdcLab.js';
import { attachEngine, tickTo, scoreboard, CHECK_INTERVAL } from '../src/game/ccdcEngine.js';
import { syncServices } from '../src/game/ccdcBox.js';
import { clockAt } from '../src/game/ccdcRound.js';

const MODE = process.argv[2] || 'passive'; // passive | restore
const SEED = Number(process.env.SEED || 7);

const s = attachEngine(newGame(CCDC_LAB, { seed: SEED, length: 'real', mode: MODES.COMPETITION }));
const total = s.scenario.clockSeconds;
const clk = (sec) => clockAt(s.scenario, sec * s.timeScale);

const svcState = () => { syncServices(s); return Object.fromEntries(Object.values(s.services).map((v) => [v.id, v.state])); };
let prev = svcState();
let lastRedIdx = 0;
const line = (sec, msg) => console.log(`${clk(sec).padEnd(6)} ${msg}`);

console.log(`# CCDC round — scenario "${s.scenario.name || CCDC_LAB.name}", seed ${SEED}, mode=${MODE}`);
console.log(`# full competition day ${clk(0)}–${clk(total)}, ${s.serviceList.length} scored services, ${s.deviceList.length} boxes`);
console.log(`# services: ${s.serviceList.map((x) => x.id).join(', ')}\n`);

let restores = 0;
for (let sec = CHECK_INTERVAL; sec <= total; sec += CHECK_INTERVAL) {
  tickTo(s, sec);
  // new red events since last step
  const r = s.engine.red;
  for (; lastRedIdx < r.events.length; lastRedIdx++) {
    const e = r.events[lastRedIdx];
    if (['takedown', 'destroy', 'foothold', 'reentry'].includes(e.type)) {
      const dev = s.deviceList.find((d) => d.id === e.host);
      line(e.at, `  RED ${e.type.toUpperCase().padEnd(8)} ${dev.host}: ${e.text}`);
    }
  }
  // service transitions
  const now = svcState();
  for (const id of Object.keys(now)) {
    if (now[id] !== prev[id]) {
      line(sec, `>>> SERVICE ${id} ${prev[id].toUpperCase()} -> ${now[id].toUpperCase()}`);
    }
  }
  // "player": in restore mode, when a service is down because red stopped a unit / added an iptables drop,
  // bring it back the way a competitor would — restart the unit / flush the rule.
  if (MODE === 'restore') {
    for (const svc of Object.values(s.services)) {
      if (svc.state === SERVICE_STATE.DOWN) {
        const dev = s.deviceList.find((d) => d.id === svc.host);
        const ds = s.devState[svc.host];
        if (!ds.live || ds.live.bricked) continue;
        let acted = false;
        for (const u of svc.units || []) if (ds.live.units[u] === 'inactive') { runLine(s, svc.host, `systemctl start ${u}`); acted = true; }
        if (ds.live.ipt) for (const rule of [...ds.live.ipt.rules]) if (rule.target === 'DROP') { runLine(s, svc.host, 'iptables -F'); acted = true; break; }
        for (const w of svc.winServices || []) { const ws = ds.live.winServices?.find((x) => x.Name === w); if (ws && ws.Status !== 'Running') { runLine(s, svc.host, `Start-Service ${w}`); acted = true; } }
        if (acted) { restores++; line(sec, `    PLAYER restored ${svc.id} on ${dev.host}`); }
      }
    }
  }
  prev = svcState();
}

const sb = scoreboard(s);
console.log(`\n# ---- end of round ----`);
console.log(`# uptime points: ${sb.uptimePoints}   SLA violations: ${sb.slaViolations}`);
for (const row of sb.rows) console.log(`#   ${row.id.padEnd(8)} uptime ${String(row.uptime).padStart(3)}%  SLA viol ${row.violations}  up-now=${row.up}`);
const r = s.engine.red;
const counts = r.events.reduce((m, e) => ((m[e.type] = (m[e.type] || 0) + 1), m), {});
console.log(`# red events: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join('  ')}`);
if (MODE === 'restore') console.log(`# player restores performed: ${restores}`);
