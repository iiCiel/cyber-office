// Browser verification for the Red Team Drill: open the scene for several cases, play the whole chain by
// clicking the correct control each round, and confirm it wins and shows the debrief. Also checks the
// Case Files "Red team it" button exists. Run against a DEV server (it imports /cyber-office/src modules):
//   npx vite --port 5190 --strictPort   then   node scripts/verify-redteam.mjs http://localhost:5190/cyber-office/
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5190/cyber-office/';
const out = process.argv[3] || 'smoke-out/redteam';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let fails = 0, n = 0;
const check = (name, ok, info = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };

await page.goto(url);
await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 15000 });

// Case Files shows the "Red team it" button.
await page.evaluate(() => { for (const k of ['Office', 'Report', 'Menu']) window.__game.scene.stop(k); window.__game.scene.start('CaseFiles'); });
await page.waitForTimeout(500);
const rtButtons = await page.evaluate(() => document.querySelectorAll('.redteam-btn[data-action="red-team"]').length);
check('Case Files shows Red team buttons', rtButtons >= 12, `found ${rtButtons}`);

const cases = ['php2shell-2026', 'uber-2022', 'mgm-2023', 'target-2013'];
for (const id of cases) {
  await page.evaluate((caseId) => {
    for (const k of ['Office', 'Report', 'Menu', 'CaseFiles']) window.__game.scene.stop(k);
    window.__game.scene.start('RedTeam', { caseId, returnTo: 'CaseFiles' });
  }, id);
  await page.waitForFunction(() => window.__game.scene.isActive('RedTeam'), null, { timeout: 8000 });
  await page.waitForTimeout(300);

  const roundsInfo = await page.evaluate(() => {
    const first = document.querySelector('#redteam .rt-step-head');
    return { hasGoal: !!document.querySelector('.rt-goal'), hasStep: !!first, opts: document.querySelectorAll('.rt-opt').length };
  });
  check(`${id}: first round renders (goal + step + options)`, roundsInfo.hasGoal && roundsInfo.hasStep && roundsInfo.opts >= 2, JSON.stringify(roundsInfo));

  // Play the whole chain, always clicking the control the engine marks correct.
  let guard = 0;
  while (guard++ < 30) {
    const done = await page.evaluate(() => window.__game.scene.getScene('RedTeam').state.status !== 'playing');
    if (done) break;
    // Find which rendered option is correct for the current round and click it.
    const clicked = await page.evaluate(() => {
      const sc = window.__game.scene.getScene('RedTeam');
      const r = sc.drill.rounds[sc.state.round];
      const correct = r.options.find((o) => o.correct);
      const btn = document.querySelector(`.rt-opt[data-opt="${correct.id}"]`);
      if (!btn) return false;
      btn.click();
      return true;
    });
    if (!clicked) break;
    await page.waitForTimeout(1050); // wait out the feedback delay before the next round renders
  }
  const result = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('RedTeam');
    return { status: sc.state.status, grade: document.querySelector('.rt-grade')?.textContent, chain: document.querySelectorAll('.rt-chain .rt-row').length, choke: !!document.querySelector('.rt-choke') };
  });
  check(`${id}: playing all-correct wins`, result.status === 'won', JSON.stringify(result));
  check(`${id}: debrief shows grade A, full chain and chokepoint`, result.grade === 'A' && result.chain >= 3 && result.choke, JSON.stringify(result));
  await page.locator('#redteam .rt-wrap').screenshot({ path: `${out}/${id}.png` }).catch(() => {});
}
check('no page errors', errors.length === 0, errors.join(' | '));
console.log(`\n${n - fails}/${n} checks passed`);
await browser.close();
process.exit(fails ? 1 : 0);
