// Screenshot of the MDR overnight shift handoff email on Days 2-5 (first email in the inbox).
// Usage: node scripts/shot-handoff.mjs [url] [outDir]   Last line prints PASS/FAIL totals and console errors.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const out = process.argv[3] || 'docs/proof/handoff';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let pass = 0, fail = 0;
const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const errors = [];
for (const day of [2, 3, 4, 5]) {
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 860 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.scene.isActive('Title'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.scene.isActive('Office'));
  await page.waitForTimeout(800);
  await page.evaluate(async ({ day, base }) => {
    const { loadDay } = await import(`${base}src/days/index.js`);
    const s = window.__game.scene.getScene('Office');
    if (s.dialog.isOpen) s.dialog.close?.();
    s.state.day = day; s.day = loadDay(day, s.state); s.state.minutes = 9 * 60;
    s.computer.open();
    s.computer.openApp('mail');
  }, { day, base: new URL(url).pathname });
  await page.waitForTimeout(300);
  await page.click('#screen-workstation [data-email="handoff"]').catch((e) => errors.push(`click: ${e.message}`));
  await page.waitForTimeout(300);
  const txt = await page.locator('#screen-workstation').innerText().catch(() => '');
  check(`day ${day}: handoff open in the reader`, txt.includes('Overnight shift handoff') && txt.includes('OPEN / FOR DAY SHIFT'));
  await page.screenshot({ path: `${out}/day${day}-handoff.png` });
  await page.close();
}
check('no console/network errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`RESULT: ${pass} passed, ${fail} failed, ${errors.length} console/network errors`);
process.exit(fail ? 1 : 0);
