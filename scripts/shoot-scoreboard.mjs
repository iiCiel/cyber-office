// Dev screenshots of preview/scoreboard.html (see preview/). node scripts/shoot-scoreboard.mjs [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const out = process.argv[2] || 'docs/proof/scoreboard';
fs.mkdirSync(out, { recursive: true });
const base = 'http://localhost:5202/cyber-office/preview/scoreboard.html';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errs = [];
for (const [tag, vp] of [['1366', { width: 1366, height: 768 }], ['390', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp });
  page.on('pageerror', (e) => errs.push(`${tag} pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(`${tag} console: ${m.text()}`); });
  for (const [name, qs] of [['overview', '?view=scoreboard'], ['scoreboard', '?view=scoreboard&tab=scoreboard'], ['services', '?view=scoreboard&tab=services'], ['injects', '?view=scoreboard&tab=injects'], ['injects-memo', '?view=injects'], ['chat', '?view=chat']]) {
    await page.goto(base + qs);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/${name}-${tag}.png` });
  }
  await page.close();
}
console.log(errs.length ? errs.join('\n') : 'no console errors');
await browser.close();
