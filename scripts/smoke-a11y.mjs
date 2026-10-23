// Keyboard smoke test: mail-list focus survives re-renders, and the title-screen day picker works after "Quit to title".
// Usage: npm run build; npx vite preview --port 4173 (background); node scripts/smoke-a11y.mjs [url] [outdir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:4173/cyber-office/';
const out = process.argv[3] || 'smoke-out/a11y';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
let fails = 0, n = 0;
const check = (name, ok, info = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const ev = (fn, a) => page.evaluate(fn, a);
const W = '#screen-workstation';
const focused = () => ev(() => { const a = document.activeElement; return a ? (a.getAttribute('data-email') || a.getAttribute('data-action') || a.getAttribute('data-folder') || a.tagName) : null; });

await page.goto(url);
await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 15000 });
await page.waitForTimeout(400);
await page.keyboard.press('1');
await page.waitForFunction(() => window.__game.scene.isActive('Office'), null, { timeout: 10000 });
await page.waitForTimeout(1200);
for (let i = 0; i < 40 && await ev(() => window.__game.scene.getScene('Office').dialog.isOpen); i++) { await page.keyboard.press('e'); await page.waitForTimeout(120); }
await ev(() => { const sc = window.__game.scene.getScene('Office'); sc.computer.open(); sc.computer.openApp('mail'); });
await page.waitForSelector(`${W} [data-email]`, { timeout: 5000 });
const ids = await page.locator(`${W} .list [data-email]`).evaluateAll((els) => els.map((e) => e.getAttribute('data-email')));
check('inbox has several emails', ids.length >= 3, ids.join(','));

// Enter on an email: it opens, and focus stays on that email (the list is rebuilt underneath).
await page.focus(`${W} [data-email="${ids[1]}"]`);
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
check('Enter opens the email', await ev((id) => !!window.__game.scene.getScene('Office').state.mail[id]?.read, ids[1]));
check('after Enter, focus is still on the same email', await focused() === ids[1], await focused());
// Tab from an email goes to the next email (not back to the desktop icons).
await page.keyboard.press('Tab');
check('Tab then moves to the next email in the list', await focused() === ids[2], await focused());
// Last email in the list: Enter keeps focus on it too (edge of the list).
const last = ids[ids.length - 1];
await page.focus(`${W} [data-email="${last}"]`);
await page.keyboard.press('Enter'); await page.waitForTimeout(150);
check('Enter on the last email keeps focus on it', await focused() === last, await focused());
// Folder button: Enter switches folder and focus stays on that folder button.
await page.focus(`${W} [data-folder=reported]`);
await page.keyboard.press('Enter'); await page.waitForTimeout(150);
check('Enter on a folder keeps focus on that folder', await focused() === 'reported', await focused());
await page.focus(`${W} [data-folder=inbox]`);
await page.keyboard.press('Enter'); await page.waitForTimeout(150);
// Report phishing by keyboard: focus goes to the newly selected email, not the Report button.
await page.focus(`${W} [data-email="${ids[0]}"]`);
await page.keyboard.press('Enter'); await page.waitForTimeout(150);
await page.focus(`${W} [data-action=report]`);
await page.keyboard.press('Enter'); await page.waitForTimeout(200);
const after = await page.locator(`${W} .list [data-email]`).evaluateAll((els) => els.map((e) => e.getAttribute('data-email')));
const f = await focused();
check('after Report phishing, focus is on the next selected email', f && f !== 'report' && after.includes(f) && after[0] === f, `${f}; list ${after.join(',')}`);
check('the reported email left the inbox', !after.includes(ids[0]));
// New mail arriving while an email is focused must not steal focus.
await page.focus(`${W} [data-email="${after[0]}"]`);
await ev(() => window.__game.scene.getScene('Office').computer.mail.render());
check('a re-render (e.g. new mail) keeps focus on the email', await focused() === after[0], await focused());
await page.screenshot({ path: `${out}/1-mail.png` });

// Title screen: Quit to title, then the day picker must still work (Phaser reuses the scene object).
await ev(() => window.__game.scene.getScene('Office').computer.close());
await page.waitForTimeout(300);
await page.keyboard.press('p'); await page.waitForTimeout(400);
await ev(() => window.__game.scene.getScene('Menu').quit());
await page.waitForFunction(() => window.__game.scene.isActive('Title'), null, { timeout: 10000 });
await page.waitForTimeout(500);
await page.keyboard.press('3');
const ok = await page.waitForFunction(() => window.__game.scene.isActive('Office') && window.__game.scene.getScene('Office').state?.day === 3, null, { timeout: 6000 }).then(() => true, () => false);
check('after Quit to title, pressing 3 starts Day 3', ok, String(await ev(() => window.__game.scene.getScene('Office').state?.day)));
await page.screenshot({ path: `${out}/2-day3.png` });

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(fails ? `A11Y FAIL (${fails} of ${n})` : `A11Y PASS (${n} checks)`);
process.exit(fails ? 1 : 0);
