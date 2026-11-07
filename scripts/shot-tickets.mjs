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
  // No toast over the form in proof shots.
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  // All four desktop launchers (icon + label) sit fully above the taskbar.
  const rail = await page.evaluate((W) => {
    const bar = document.querySelector(`${W} .taskbar`).getBoundingClientRect();
    return [...document.querySelectorAll(`${W} .icons .icon`)].map((i) => { const r = i.getBoundingClientRect(); return { label: i.innerText.replace(/\s+/g, ' ').trim(), bottom: Math.round(r.bottom), barTop: Math.round(bar.top), ok: r.bottom <= bar.top + 0.5 && r.height > 0 }; });
  }, W);
  check(`${label}: all ${rail.length} launchers and labels sit above the taskbar`, rail.length === 4 && rail.every((r) => r.ok), rail.map((r) => `${r.label}@${r.bottom}/${r.barTop}`).join(', '));
  await page.screenshot({ path: `${out}/${label}-1-form.png` });
  if (!mobile) { // crops for the side-by-side with the real ServiceNow list and form top (docs/reference/servicenow-incident-*.png)
    await page.locator(`${W} .tlist`).screenshot({ path: `${out}/part-list.png` });
    const box = await page.evaluate((W) => {
      const a = document.querySelector(`${W} .sn-formhead`).getBoundingClientRect();
      const g = document.querySelector(`${W} .sn-grid`).getBoundingClientRect();
      const c = document.querySelector(`${W} .tdetail`).getBoundingClientRect();
      return { x: a.left, y: a.top, width: a.width, height: Math.min(g.bottom, c.bottom) - a.top };
    }, W);
    await page.screenshot({ path: `${out}/part-formtop.png`, clip: box });
    const toasts = await page.locator('.toast').count();
    check('desktop: no toast on screen in the comparison crops', toasts === 0, `toasts=${toasts}`);
  }
  // Keyboard: Tab from the first row to the second row, press Enter, the form must show that INC number.
  await page.locator(`${W} tr[data-ticket]`).first().focus();
  await page.keyboard.press('Tab');
  const focusedId = await page.evaluate(() => document.activeElement?.dataset?.ticket || '');
  const secondId = await page.locator(`${W} tr[data-ticket]`).nth(1).getAttribute('data-ticket');
  const secondInc = (await page.locator(`${W} tr[data-ticket]`).nth(1).locator('.tnum').innerText()).trim();
  check(`${label}: Tab moves focus to the second ticket row`, focusedId === secondId, `${focusedId} vs ${secondId}`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const kbHead = (await page.locator(`${W} .sn-formhead h2`).first().innerText()).trim();
  check(`${label}: Enter on the second row opens ${secondInc}`, kbHead === secondInc, kbHead);
  const thirdInc = (await page.locator(`${W} tr[data-ticket]`).nth(2).locator('.tnum').innerText()).trim();
  await page.keyboard.press('Tab');
  await page.keyboard.press(' ');
  await page.waitForTimeout(150);
  const spHead = (await page.locator(`${W} .sn-formhead h2`).first().innerText()).trim();
  check(`${label}: Space on the third row opens ${thirdInc}`, spHead === thirdInc, spHead);
  await page.screenshot({ path: `${out}/${label}-1k-keyboard.png` });
  // Back to the first ticket (the resolve step below uses it).
  await page.click(`${W} tr[data-ticket]:first-child`);
  await page.waitForTimeout(150);
  if (mobile) {
    // The incident form scrolls inside the window: scroll down to the fields below Caller.
    const sc = await page.evaluate((W) => { const el = document.querySelector(`${W} .tickets`); el.scrollTop = document.querySelector(`${W} .sn-grid`).offsetTop - 40; return { top: el.scrollTop, max: el.scrollHeight - el.clientHeight }; }, W);
    await page.waitForTimeout(150);
    check(`${label}: the incident form scrolls inside the window`, sc.top > 0 && sc.max > 200, `scrollTop=${sc.top} max=${sc.max}`);
    const visible = await page.evaluate((W) => { const win = document.querySelector(`${W} .window .content`).getBoundingClientRect(); return [...document.querySelectorAll(`${W} .sn-field label`)].filter((l) => { const r = l.getBoundingClientRect(); return r.top >= win.top && r.bottom <= win.bottom; }).map((l) => l.innerText.replace(/[*✱]/g, '').trim()); }, W);
    check(`${label}: scrolled form shows the fields below Caller`, ['Category', 'Priority', 'Assignment group'].every((x) => visible.includes(x)), visible.join(','));
    await page.screenshot({ path: `${out}/${label}-1s-scrolled.png` });
  }
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
