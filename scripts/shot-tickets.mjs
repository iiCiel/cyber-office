// Screenshots of the ServiceNow-style Tickets app (Day 2 queue) at desktop and phone size, before and after resolving one.
// Works against the Vite dev server (it imports the day loader in the page).
// Usage: node scripts/shot-tickets.mjs [url] [outDir]
// Last line prints PASS/FAIL totals and the console-error count.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const out = process.argv[3] || 'docs/proof/tickets';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let pass = 0, fail = 0, errCount = 0;
const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const W = '#screen-workstation';

for (const [label, vp, mobile] of [['desktop', { width: 1366, height: 860 }, false], ['phone', { width: 844, height: 390 }, true]]) { // phones play in landscape (portrait shows a rotate prompt)
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.scene.isActive('Title'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.scene.isActive('Office'));
  await page.waitForTimeout(800);
  const base = new URL(url).pathname;
  await page.evaluate(async (base) => {
    const { loadDay } = await import(`${base}src/days/index.js`);
    const s = window.__game.scene.getScene('Office');
    if (s.dialog.isOpen) s.dialog.close?.();
    s.state.day = 2;
    s.day = loadDay(2, s.state);
    s.computer.open();
    s.computer.openApp('tickets');
  }, base);
  await page.waitForTimeout(500);
  const rows = await page.locator(`${W} tr[data-ticket]`).count();
  check(`${label}: incident list shows the Day 2 queue`, rows === 3, `rows=${rows}`);
  const head = await page.locator(`${W} .sn-formhead h2`).first().innerText().catch(() => '');
  check(`${label}: form header shows an INC number`, /^INC\d{7}$/.test(head), head);
  await page.screenshot({ path: `${out}/${label}-1-form.png` });
  await page.locator(`${W} .toptions`).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${out}/${label}-1b-resolve.png` });
  await page.click(`${W} [data-option=approval]`);
  await page.waitForTimeout(200);
  await page.click(`${W} tr[data-ticket=payroll-access]`);
  await page.waitForTimeout(200);
  const resolved = await page.locator(`${W} .sn-flow .on`).innerText().catch(() => '');
  check(`${label}: resolving moves the state to Resolved`, resolved === 'Resolved', resolved);
  const note = await page.locator(`${W} .sn-act.note`).count();
  check(`${label}: the choice is posted as a work note`, note === 1);
  await page.screenshot({ path: `${out}/${label}-2-resolved.png` });
  check(`${label}: no console/network errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  errCount += errors.length;
  await ctx.close();
}
await browser.close();
console.log(`RESULT: ${pass} passed, ${fail} failed, ${errCount} console/network errors`);
process.exit(fail ? 1 : 0);
