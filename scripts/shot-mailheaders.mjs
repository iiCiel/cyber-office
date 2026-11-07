// Screenshot of the Day 1 phishing email's raw headers (Reply-To, SPF, spam score) at desktop size.
// Usage: node scripts/shot-mailheaders.mjs [url] [outDir]
// Last line prints PASS/FAIL totals and the console-error count.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const out = process.argv[3] || 'docs/proof/mail';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let pass = 0, fail = 0;
const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const page = await (await browser.newContext({ viewport: { width: 1366, height: 860 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
await page.goto(url);
await page.waitForFunction(() => window.__game?.scene.isActive('Title'));
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game.scene.isActive('Office'));
await page.waitForTimeout(800);
const id = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Office');
  if (s.dialog.isOpen) s.dialog.close?.();
  s.computer.open();
  s.computer.openApp('mail');
  const e = s.day.emails.find((m) => m.headers.some((l) => l.startsWith('Received-SPF')));
  return e?.id;
});
check('phishing email found', !!id, id);
await page.waitForTimeout(300);
await page.click(`#screen-workstation [data-email="${id}"]`).catch(() => {});
await page.waitForTimeout(200);
await page.click('#screen-workstation [data-action=headers]').catch(() => {});
await page.waitForTimeout(300);
const txt = await page.locator('#screen-workstation .headers').innerText().catch(() => '');
for (const k of ['Reply-To:', 'Received-SPF:', 'X-Spam-Status:', 'X-Originating-IP:']) check(`headers show ${k}`, txt.includes(k));
await page.screenshot({ path: `${out}/phish-headers.png` });
check('no console/network errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`RESULT: ${pass} passed, ${fail} failed, ${errors.length} console/network errors`);
process.exit(fail ? 1 : 0);
