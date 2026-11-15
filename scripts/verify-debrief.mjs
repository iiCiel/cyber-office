// After-action report of the Invitational replay: the "You vs team 14 on the real day" section.
//   node scripts/verify-debrief.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const out = process.argv[3] || 'docs/proof/underpressure';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let pass = 0; let fail = 0;
const check = (ok, label) => { if (ok) pass += 1; else fail += 1; console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); };
await page.goto(url + '?v=' + Date.now());
await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
await page.waitForTimeout(400); await page.keyboard.press('t');
await page.waitForFunction(() => window.__game.scene.isActive('Competitions'));
await page.locator('.comp-card[data-mode="ccdc"]').click();
await page.waitForFunction(() => window.__game.scene.isActive('CcdcLab'));
await page.locator('.ccx-radio', { hasText: 'Under Pressure' }).click();
await page.locator('.ccx-btn.primary').click();
await page.waitForSelector('.jb-taskbar');
// Fix the router and the DC by their checklists, reboot nothing, then end the round.
await page.evaluate(() => {
  const sc = window.__game.scene.getScene('CcdcLab');
  for (const id of ['vyos', 'dc', 'ecom']) for (const c of sc.state.deviceList.find((d) => d.id === id).checklist) sc.run(id, c);
  sc.endRound();
});
await page.locator('.ccx-realday').waitFor({ timeout: 10000 });
const t = await page.locator('.ccx-realday').innerText();
check(/you vs team 14 on the real day/i.test(t), 'section present');
check(await page.locator('.ccx-realday tr[data-verdict="better"]').count() >= 3, `rows marked better: ${await page.locator('.ccx-realday tr[data-verdict="better"]').count()}`);
check(t.includes('~11:40 CST red team took the console'), 'shows what happened on the day');
await page.locator('.ccx-realday').scrollIntoViewIfNeeded();
await page.screenshot({ path: `${out}/18-debrief-realday.png` });
check(errors.length === 0, `no console errors ${errors.slice(0, 2).join(' | ')}`);
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
