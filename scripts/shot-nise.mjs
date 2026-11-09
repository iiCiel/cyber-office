// Screenshot of the NISE page next to the real one (docs/reference/nise-injects-2026.png).
//   CHROME_PATH=... node scripts/shot-nise.mjs [url]
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const chromePath = process.env.CHROME_PATH;
const browser = await chromium.launch(chromePath ? { executablePath: chromePath } : { channel: 'chrome' });
let bad = 0;
for (const [tag, viewport] of [['1366', { width: 1366, height: 800 }], ['390', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errs.push(m.text()); });
  await page.goto(`${url}?v=${Date.now()}`);
  await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.keyboard.press('t');
  await page.waitForFunction(() => window.__game.scene.isActive('Competitions'));
  await page.waitForTimeout(200);
  await page.locator('.comp-card[data-mode="ccdc"]').click();
  await page.waitForFunction(() => window.__game.scene.isActive('CcdcLab'));
  await page.locator('.ccx-radio', { hasText: 'Cedarline' }).click();
  await page.waitForTimeout(200);
  await page.locator('.ccx-radio', { hasText: 'Long ·' }).click();
  await page.locator('.ccx-radio', { hasText: 'Competition' }).click();
  await page.locator('.ccx-btn.primary').click();
  await page.waitForSelector('.jb-taskbar');
  await page.evaluate(() => { window.__game.scene.getScene('CcdcLab').startedAt = Date.now() - 900000; });
  await page.waitForTimeout(1500);
  await page.locator('.jb-tb-app[data-open="injects"]').click();
  await page.waitForTimeout(1300);
  await page.locator('.jb-toast, .jb-notif-toast').evaluateAll((els) => els.forEach((e) => e.remove())).catch(() => {});
  await page.locator('.jb-win[data-win="injects"] .nise').screenshot({ path: `docs/proof/nise/ours-${tag}.png` });
  const rows = await page.locator('.jb-win[data-win="injects"] .ij-row').count();
  await page.locator('.jb-win[data-win="injects"] .ij-row').first().click();
  await page.waitForTimeout(300);
  const box = await page.locator('.jb-win[data-win="injects"] textarea.ij-ta').count();
  console.log(`[${tag}] rows ${rows}, deliverable box ${box}, errors ${errs.length}`, errs.slice(0, 2).join(' | '));
  if (!rows || !box || errs.length) bad++;
  await page.close();
}
await browser.close();
console.log(bad ? `FAILED ${bad}` : 'PASS');
process.exit(bad ? 1 : 0);
