// One-off verification for the Attacker's Playbook: open the Report scene for several cases and confirm
// the playbook section renders with its steps, phases, tids and chokepoint. Screenshots to smoke-out/playbook.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:4188/cyber-office/';
const out = process.argv[3] || 'smoke-out/playbook';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let fails = 0, n = 0;
const check = (name, ok, info = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };

await page.goto(url);
await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 15000 });

const cases = ['php2shell-2026', 'uber-2022', 'solarwinds-2020', 'target-2013', 'mgm-2023', 'notpetya-2017'];
for (const id of cases) {
  // Build a fresh case state and jump straight to the Report scene for it.
  await page.evaluate(async (caseId) => {
    const g = window.__game;
    for (const k of ['Office', 'Report', 'Menu', 'CaseFiles']) g.scene.stop(k);
    const { GameState } = await import('/cyber-office/src/game/GameState.js');
    const st = new GameState({ caseMode: true });
    st.caseId = caseId;
    st.day = 6;
    st.minutes = 12 * 60;
    window.__game.scene.start('Report', { state: st });
  }, id).catch(() => {});
  await page.waitForFunction(() => window.__game.scene.isActive('Report'), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  const info = await page.evaluate((caseId) => {
    const sec = document.querySelector(`.playbook[data-playbook="${caseId}"]`);
    if (!sec) return { found: false };
    return {
      found: true,
      steps: sec.querySelectorAll('.pb-step').length,
      phases: [...sec.querySelectorAll('.pb-phase')].map((e) => e.textContent),
      tids: [...sec.querySelectorAll('.pb-tid')].map((e) => e.textContent),
      hasGoal: !!sec.querySelector('.pb-goal'),
      hasChoke: !!sec.querySelector('.pb-choke'),
      moveRows: sec.querySelectorAll('.pb-row.move').length,
      stopRows: sec.querySelectorAll('.pb-row.stop').length,
    };
  }, id);
  check(`${id}: playbook section renders`, info.found, JSON.stringify(info));
  if (info.found) {
    check(`${id}: has >=3 steps with move+stop rows`, info.steps >= 3 && info.moveRows === info.steps && info.stopRows === info.steps, `steps=${info.steps} move=${info.moveRows} stop=${info.stopRows}`);
    check(`${id}: has goal and chokepoint`, info.hasGoal && info.hasChoke);
    check(`${id}: every step shows a Txxxx technique id`, info.tids.length === info.steps && info.tids.every((t) => /^T\d{4}/.test(t)), info.tids.join(','));
  }
  await page.locator(`.playbook[data-playbook="${id}"]`).screenshot({ path: `${out}/${id}.png` }).catch(() => {});
}
check('no page errors', errors.length === 0, errors.join(' | '));
console.log(`\n${n - fails}/${n} checks passed`);
await browser.close();
process.exit(fails ? 1 : 0);
