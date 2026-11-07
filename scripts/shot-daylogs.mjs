// Screenshots of the in-game SOC log search (Day 1) so the raw event formats can be checked against real tools.
// Usage: node scripts/shot-daylogs.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const out = process.argv[3] || 'docs/proof/logs';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
await page.goto(url);
await page.waitForFunction(() => window.__game?.scene.isActive('Title'));
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game.scene.isActive('Office'));
await page.waitForTimeout(800);
const day = Number(process.env.DAY || 1);
await page.evaluate(async ({ day, base }) => {
  const { loadDay } = await import(`${base}src/days/index.js`);
  const s = window.__game.scene.getScene('Office');
  if (s.dialog.isOpen) s.dialog.close?.();
  s.state.day = day; s.day = loadDay(day, s.state); s.minutes = 11 * 60; s.state.minutes = Number(window.__shotMin || 12 * 60);
  s.soc.open();
}, { day, base: new URL(url).pathname });
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/day${day}-soc.png` });
// Optional: QUERY="sourcetype=pfsense:filterlog" also saves the Search page for that query (name from SHOT, default "search").
if (process.env.QUERY) {
  await page.evaluate((q) => window.__game.scene.getScene('Office').soc.go('search', { query: q }), process.env.QUERY);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/day${day}-${process.env.SHOT || 'search'}.png` });
}
console.log('html classes:', await page.evaluate(() => [...new Set([...document.querySelectorAll('#screen-soc *')].map((e) => e.className).filter(Boolean))].slice(0, 40).join(' | ')));
console.log(`RESULT: ${errors.length} console/network errors ${errors.slice(0, 3).join(' | ')}`);
await browser.close();
