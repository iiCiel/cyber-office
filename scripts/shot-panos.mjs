// Screenshot of the Palo Alto web UI (Policies > Security) in the Invitational replay, for the side-by-side.
//   node scripts/shot-panos.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const out = process.argv[3] || 'docs/proof/panos';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url + '?v=' + Date.now());
await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
await page.waitForTimeout(400); await page.keyboard.press('t');
await page.waitForFunction(() => window.__game.scene.isActive('Competitions'));
await page.locator('.comp-card[data-mode="ccdc"]').click();
await page.waitForFunction(() => window.__game.scene.isActive('CcdcLab'));
await page.locator('.ccx-radio', { hasText: 'Under Pressure' }).click();
await page.locator('.ccx-btn.primary').click();
await page.waitForSelector('.jb-taskbar');
await page.locator('.jb-tb-app[data-open="web-pa"]').click();
await page.waitForSelector('.jb-win[data-win="web-pa"] .pan-grid');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/policies-security.png` });
const rows = await page.locator('.jb-win[data-win="web-pa"] .pan-grid tbody tr').count();
const url2 = await page.locator('.jb-win[data-win="web-pa"]').innerText();
console.log(`rows=${rows} hasIp=${url2.includes('172.20.240.200')} errors=${errors.length} ${errors.slice(0, 2).join(' | ')}`);
await browser.close();
