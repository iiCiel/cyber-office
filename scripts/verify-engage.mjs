// Browser verification for the Red team engagements (src/scenes/EngageScene.js). Opens the title menu, picks
// each engagement from the chooser, plays every move in its scripted terminal (plus a refused command, a locked
// later move, and the out-of-scope move that trips the ROE), reaches the flag, then does the SOC debrief by
// searching and clicking the log line each move left, and checks the grade. Runs against a DEV server:
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
  await page.waitForTimeout(110);
};
const lastLines = (k = 4) => page.evaluate((k) => [...document.querySelectorAll('.eg-out .eg-line')].slice(-k).map((d) => d.textContent).join(' | '), k);
const expectPct = ({ total, loud, strikes, misses }) => {
  const credit = total - 0.5 * misses;
  const hunt = total ? (credit / total) * 70 : 0;
  const stealth = Math.max(0, 30 - loud * 15);
  return Math.max(0, Math.round(hunt + stealth - strikes * 15));
};

async function play(engId, label, { quiet }) {
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 15000 });
  const item = await page.evaluate(() => !!window.__game.scene.getScene('Title').children.getByName('engage-button'));
  check(`${label}: title menu has "Red team engagement"`, item);
  await page.keyboard.press('r');
  await page.waitForFunction(() => window.__game.scene.isActive('Engage'), null, { timeout: 8000 });
  await page.waitForTimeout(250);
  const picks = await page.evaluate(() => document.querySelectorAll('.eg-pick').length);
  check(`${label}: engagement chooser lists both engagements`, picks === 2, `${picks}`);
  if (label.endsWith('desktop')) await fullShot(`${out}/picker.png`);
  await page.click(`[data-eng="${engId}"]`);
  await page.waitForTimeout(200);
  const roe = await page.evaluate(() => document.querySelectorAll('.eg-roe li').length);
  check(`${label}: brief shows rules of engagement`, roe >= 5, `${roe}`);
  if (label.endsWith('desktop')) await fullShot(`${out}/brief-${label}.png`);
  await page.click('[data-action="start"]');
  await page.waitForTimeout(200);

  const plan = await page.evaluate(() => {
    const e = window.__game.scene.getScene('Engage').run.eng;
    return {
      total: e.steps.length, atk: e.attacker.ip, tid0: e.steps[0].tid,
      first: e.steps[0].choices.find((c) => !c.loud && !c.violation).cmd,
      steps: e.steps.map((s) => ({ id: s.id, tid: s.tid, cmds: s.choices.map((c) => ({ cmd: c.cmd, loud: !!c.loud, violation: !!c.violation })) })),
    };
  });

  await type('cat /etc/shadow');
  check(`${label}: non-whitelisted command is refused`, /not available in this simulation/.test(await lastLines(1)), await lastLines(1));
  await type(plan.steps[plan.total - 1].cmds[0].cmd);
  check(`${label}: a later move is locked`, /Not yet/.test(await lastLines(1)), await lastLines(1));
  await page.click('.eg-move:not(.loud)');
  const filled = await page.inputValue('.eg-input');
  check(`${label}: clicking a move fills the command line`, filled === plan.first, filled);
  await page.press('.eg-input', 'Enter');
  await page.waitForTimeout(150);
  check(`${label}: first move returns canned output with its ATT&CK tag`, new RegExp(plan.tid0.replace('.', '\\.')).test(await lastLines(14)));
  if (label.endsWith('desktop')) await page.locator('#engage').screenshot({ path: `${out}/terminal-first-${label}.png` });

  let loud = 0;
  for (const s of plan.steps.slice(1)) {
    const v = s.cmds.find((x) => x.violation);
    if (v) {
      await type(v.cmd);
      check(`${label}: out-of-scope move stopped by the ROE`, /STOPPED by the rules of engagement/.test(await lastLines(4)));
    }
    const c = (quiet ? s.cmds.find((x) => !x.loud && !x.violation) : s.cmds.find((x) => x.loud) || s.cmds.find((x) => !x.violation));
    if (c.loud) loud++;
    await type(c.cmd);
  }
  const st = await page.evaluate(() => { const r = window.__game.scene.getScene('Engage').run; return { done: r.done.length, fin: r.finished, strikes: r.strikes, prompt: r.prompt }; });
  check(`${label}: all ${plan.total} moves done, objective reached, 1 strike`, st.done === plan.total && st.fin && st.strikes === 1, JSON.stringify(st));
  check(`${label}: flag shown in the terminal`, await page.evaluate(() => !!document.querySelector('.eg-line.flag')));
  check(`${label}: kill chain lists ${plan.total} ATT&CK steps`, (await page.evaluate(() => document.querySelectorAll('.eg-chain li').length)) === plan.total);
  await page.locator('#engage').screenshot({ path: `${out}/terminal-done-${label}.png` });

  await page.click('[data-action="debrief"]');
  await page.waitForTimeout(300);
  const dbg = await page.evaluate(() => ({ cards: document.querySelectorAll('.eg-card').length, evs: document.querySelectorAll('.eg-ev').length }));
  check(`${label}: debrief shows ${plan.total} move cards and a full SIEM`, dbg.cards === plan.total && dbg.evs > 40, JSON.stringify(dbg));
  await page.fill('.eg-search', plan.atk);
  await page.waitForTimeout(150);
  const filtered = await page.evaluate(() => document.querySelectorAll('.eg-ev').length);
  check(`${label}: searching your own IP narrows the SIEM`, filtered >= 1 && filtered < 40, `${filtered}`);
  await page.fill('.eg-search', '');
  const ans = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Engage');
    const noise = sc.events_.find((e) => e.noise).id;
    const right = Object.fromEntries(sc.run.done.map((id) => [id, sc.events_.find((e) => e.key === id).id]));
    return { noise, right };
  });
  // One deliberate wrong pick on the first move (a miss → half credit for that step), then every right one.
  const firstStep = Object.keys(ans.right)[0];
  await page.click(`[data-step="${firstStep}"]`);
  await page.click(`[data-ev="${ans.noise}"]`);
  await page.waitForTimeout(100);
  check(`${label}: a wrong pick gets corrective feedback`, /✗/.test(await page.textContent('.eg-feedback')));
  for (const [stepId, evId] of Object.entries(ans.right)) {
    await page.click(`[data-step="${stepId}"]`);
    await page.click(`[data-ev="${evId}"]`);
    await page.waitForTimeout(50);
  }
  const found = await page.evaluate(() => document.querySelectorAll('.eg-card.found').length);
  check(`${label}: all ${plan.total} traces found`, found === plan.total, `${found}`);
  await page.evaluate(() => { document.querySelector('#engage').scrollTop = 0; });
  await page.locator('#engage').screenshot({ path: `${out}/debrief-${label}.png` });
  await page.click('[data-action="finish"]');
  await page.waitForTimeout(250);
  const g = await page.evaluate(() => { const sc = window.__game.scene.getScene('Engage'); return { letter: document.querySelector('.pt-grade')?.textContent, rows: document.querySelectorAll('.eg-res').length, flag: document.querySelector('.eg-flag')?.textContent, pct: sc.grade.pct, alerts: sc.grade.alerts }; });
  check(`${label}: results page with grade, ${plan.total} rows and the flag`, g.rows === plan.total && /^FLAG\{/.test(g.flag || '') && !!g.letter, JSON.stringify(g));
  const want = expectPct({ total: plan.total, loud, strikes: 1, misses: 1 });
  check(`${label}: score matches the rubric (1 miss, 1 strike, ${loud} loud)`, g.pct === want, `got ${g.pct}, expected ${want}`);
  if (label.endsWith('desktop')) await fullShot(`${out}/results-${label}.png`);
  return { g, loud };
}

const ENGS = [{ id: 'halcyon-ext-2026', tag: 'ext' }, { id: 'halcyon-ad-2026', tag: 'ad' }];
for (const e of ENGS) {
  await page.setViewportSize({ width: 1200, height: 900 });
  const d = await play(e.id, `${e.tag}-desktop`, { quiet: true });
  await page.setViewportSize({ width: 844, height: 390 });
  const p = await play(e.id, `${e.tag}-phone-844x390`, { quiet: false });
  check(`${e.tag}: loud path raises more SOC alerts than the quiet path`, p.g.alerts > d.g.alerts, `loud ${p.g.alerts} vs quiet ${d.g.alerts}`);
}

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' / '));
console.log(`\n${n - fails}/${n} passed`);
await browser.close();
process.exit(fails ? 1 : 0);
