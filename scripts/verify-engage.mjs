// Browser verification for the Red team engagement (src/scenes/EngageScene.js): open it from the title menu,
// type every move into the scripted terminal (plus a refused command and an out-of-scope one), reach the flag,
// then do the SOC debrief by clicking log lines and check the grade. Run against a DEV server:
//   npx vite --port 5192 --strictPort   then   node scripts/verify-engage.mjs http://localhost:5192/cyber-office/
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5192/cyber-office/';
const out = process.argv[3] || 'smoke-out/engage';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let fails = 0, n = 0;
const check = (name, ok, info = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
async function fullShot(path) {
  const vp = page.viewportSize();
  for (let i = 0; i < 4; i++) {
    const need = await page.evaluate(() => {
      const el = document.querySelector('#engage');
      el.style.height = `${el.scrollHeight}px`;
      el.style.overflow = 'visible';
      const r = el.getBoundingClientRect();
      return Math.ceil(r.top + r.height + 4);
    });
    const cur = page.viewportSize();
    if (need <= cur.height) break;
    await page.setViewportSize({ width: cur.width, height: need });
    await page.waitForTimeout(350);
  }
  await page.locator('#engage').screenshot({ path });
  await page.evaluate(() => { const el = document.querySelector('#engage'); el.style.height = ''; el.style.overflow = ''; });
  await page.setViewportSize(vp);
  await page.waitForTimeout(300);
}
const type = async (cmd) => {
  await page.fill('.eg-input', cmd);
  await page.press('.eg-input', 'Enter');
  await page.waitForTimeout(120);
};
const lastLines = (k = 4) => page.evaluate((k) => [...document.querySelectorAll('.eg-out .eg-line')].slice(-k).map((d) => d.textContent).join(' | '), k);

async function play(label) {
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 15000 });
  const item = await page.evaluate(() => !!window.__game.scene.getScene('Title').children.getByName('engage-button'));
  check(`${label}: title menu has "Red team engagement"`, item);
  await page.keyboard.press('r');
  await page.waitForFunction(() => window.__game.scene.isActive('Engage'), null, { timeout: 8000 });
  await page.waitForTimeout(300);
  const roe = await page.evaluate(() => document.querySelectorAll('.eg-roe li').length);
  check(`${label}: brief shows rules of engagement`, roe === 5, `${roe}`);
  if (label === 'desktop') await fullShot(`${out}/brief-${label}.png`);
  await page.click('[data-action="start"]');
  await page.waitForTimeout(200);

  await type('cat /etc/shadow');
  check(`${label}: non-whitelisted command is refused`, /not available in this simulation/.test(await lastLines(1)), await lastLines(1));
  await type('ssh svc_portal@203.0.113.10');
  check(`${label}: a later move is locked`, /Not yet/.test(await lastLines(1)), await lastLines(1));
  // Clicking a move fills the command line (the menu path).
  await page.click('.eg-move:not(.loud)');
  const filled = await page.inputValue('.eg-input');
  check(`${label}: clicking a move fills the command line`, filled.startsWith('nmap -sV'), filled);
  await page.press('.eg-input', 'Enter');
  await page.waitForTimeout(150);
  check(`${label}: nmap returns canned output with ATT&CK tag`, /T1595\.001/.test(await lastLines(14)) && /443\/tcp open/.test(await lastLines(14)));
  if (label === 'desktop') await page.locator('#engage').screenshot({ path: `${out}/terminal-scan-${label}.png` });

  const plan = await page.evaluate(() => window.__game.scene.getScene('Engage').run.eng.steps.map((s) => ({ id: s.id, cmds: s.choices.map((c) => ({ cmd: c.cmd, loud: !!c.loud, violation: !!c.violation })) })));
  for (const s of plan.slice(1)) {
    if (s.id === 'proof') {
      await type('get Q4_claims_export.csv');
      check(`${label}: copying customer data is stopped by the ROE`, /STOPPED by the rules of engagement/.test(await lastLines(4)));
    }
    const c = (label === 'desktop' ? s.cmds.find((x) => !x.loud && !x.violation) : s.cmds.find((x) => x.loud) || s.cmds.find((x) => !x.violation));
    await type(c.cmd);
  }
  const st = await page.evaluate(() => { const r = window.__game.scene.getScene('Engage').run; return { done: r.done.length, fin: r.finished, strikes: r.strikes, prompt: r.prompt }; });
  check(`${label}: all 8 moves done, objective reached`, st.done === 8 && st.fin && st.strikes === 1, JSON.stringify(st));
  check(`${label}: flag shown in the terminal`, await page.evaluate(() => !!document.querySelector('.eg-line.flag')));
  check(`${label}: kill chain lists 8 ATT&CK steps`, (await page.evaluate(() => document.querySelectorAll('.eg-chain li').length)) === 8);
  await page.locator('#engage').screenshot({ path: `${out}/terminal-done-${label}.png` });

  await page.click('[data-action="debrief"]');
  await page.waitForTimeout(300);
  const dbg = await page.evaluate(() => ({ cards: document.querySelectorAll('.eg-card').length, evs: document.querySelectorAll('.eg-ev').length }));
  check(`${label}: debrief shows 8 move cards and the SIEM`, dbg.cards === 8 && dbg.evs > 60, JSON.stringify(dbg));
  // Search filters.
  await page.fill('.eg-search', '198.51.100.66 sshd');
  await page.waitForTimeout(150);
  const filtered = await page.evaluate(() => document.querySelectorAll('.eg-ev').length);
  check(`${label}: search narrows the SIEM`, filtered >= 1 && filtered < 10, `${filtered}`);
  await page.fill('.eg-search', '');
  // One wrong pick (noise) then all the right ones.
  const ans = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Engage');
    const noise = sc.events_.find((e) => e.noise).id;
    const right = Object.fromEntries(sc.run.done.map((id) => [id, sc.events_.find((e) => e.key === id).id]));
    return { noise, right };
  });
  await page.click(`[data-ev="${ans.noise}"]`);
  await page.waitForTimeout(100);
  check(`${label}: wrong pick gets feedback`, /ordinary traffic/.test(await page.textContent('.eg-feedback')));
  for (const [stepId, evId] of Object.entries(ans.right)) {
    await page.click(`[data-step="${stepId}"]`);
    await page.click(`[data-ev="${evId}"]`);
    await page.waitForTimeout(60);
  }
  const found = await page.evaluate(() => document.querySelectorAll('.eg-card.found').length);
  check(`${label}: all 8 traces found`, found === 8, `${found}`);
  if (label === 'desktop') { await page.fill('.eg-search', 'svc_portal'); await page.waitForTimeout(150); }
  await page.evaluate(() => { document.querySelector('#engage').scrollTop = 0; });
  await page.locator('#engage').screenshot({ path: `${out}/debrief-${label}.png` });
  await page.click('[data-action="finish"]');
  await page.waitForTimeout(250);
  const g = await page.evaluate(() => ({ letter: document.querySelector('.pt-grade')?.textContent, rows: document.querySelectorAll('.eg-res').length, flag: document.querySelector('.eg-flag')?.textContent, pct: window.__game.scene.getScene('Engage').grade.pct, alerts: window.__game.scene.getScene('Engage').grade.alerts }));
  check(`${label}: results page with grade, 8 rows and the flag`, g.rows === 8 && /^FLAG\{/.test(g.flag || '') && !!g.letter, JSON.stringify(g));
  return g;
}

const gDesk = await play('desktop');
// quiet + 1 retry + 1 strike: 7.5/8*70 + 30 - 15 = 80.6 -> 81
check('desktop: quiet run with one retry and one strike scores 81 (B)', gDesk.pct === 81 && gDesk.letter === 'B', JSON.stringify(gDesk));
await fullShot(`${out}/results-desktop.png`);

await page.setViewportSize({ width: 844, height: 390 });
const gPhone = await play('phone-844x390');
// loud path (first scan is clicked quiet, internal scan loud): 1 loud (-15), 1 retry, 1 strike: 65.6 + 15 - 15 = 65.6 -> 66 D
check('phone (loud path): loud moves cost stealth and raise more alerts', gPhone.pct === 66 && gPhone.alerts > gDesk.alerts, JSON.stringify(gPhone));
await fullShot(`${out}/results-phone-844x390.png`);

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' / '));
console.log(`\n${n - fails}/${n} passed`);
await browser.close();
process.exit(fails ? 1 : 0);
