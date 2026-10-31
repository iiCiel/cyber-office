// Browser proof for the PR #4 review fixes, at desktop (1366) and phone (390) widths:
//  - a late inject shows "Submitted late — 0 pts" on its card and "late · 0/25 pts" in the debrief
//  - typed terminal input + an inject draft survive the once-a-second live refresh, and the countdown moves
//  - Harbor Point dc01: Get-Service Spooler shows Stopped after the fix
//   node scripts/verify-fixups.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const out = process.argv[3] || 'smoke-out/fixups';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
let fails = 0, n = 0;
const check = (name, ok, info = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const GOOD_HR = 'Create a standard domain user with New-ADUser, a temporary password with change at next logon, add them only to the Shipping group. Least privilege: not a Domain Admin, no admin rights.';

async function makePage(viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return { page, errors };
}
async function toLab(page) {
  await page.goto(url + '?v=' + Date.now());
  await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.keyboard.press('t');
  await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
  await page.waitForTimeout(200);
  await page.locator('.comp-card[data-mode="ccdc"]').click();
  await page.waitForFunction(() => window.__game.scene.isActive('CcdcLab'), null, { timeout: 8000 });
  await page.waitForTimeout(200);
}
async function setElapsed(page, sec) {
  await page.evaluate((s) => { const sc = window.__game.scene.getScene('CcdcLab'); sc.deadline = Date.now() + (sc.state.timeLimitSec - s) * 1000; }, sec);
  await page.waitForTimeout(1200); // > 1 s so the per-second refresh runs
}

for (const [tag, viewport] of [['1366', { width: 1366, height: 900 }], ['390', { width: 390, height: 844 }]]) {
  // --- late inject ---------------------------------------------------------------------------------------
  {
    const { page, errors } = await makePage(viewport);
    await toLab(page);
    await page.locator('.cc-mode-btn', { hasText: 'Competition' }).click();
    await page.locator('.cc-go', { hasText: 'Sit down' }).click();
    await page.waitForSelector('.cc-devtabs', { timeout: 8000 });
    await setElapsed(page, 130); // HR inject released at 120
    // type into the terminal and into the HR draft, then let several refresh ticks pass
    const term = page.locator('.eg-input');
    await term.fill('cat /etc/hostn');
    const card = page.locator('.cc-inject[data-inject="new-user"]');
    await card.locator('.cc-inj-ta').fill(GOOD_HR);
    const due1 = await card.locator('.cc-inj-due').innerText();
    await page.waitForTimeout(2300);
    const due2 = await card.locator('.cc-inj-due').innerText();
    check(`${tag}: inject countdown moves on its own (no new event needed)`, due1 !== due2, `${due1} → ${due2}`);
    check(`${tag}: terminal typing survives the live refresh`, (await term.inputValue()) === 'cat /etc/hostn');
    check(`${tag}: inject draft survives the live refresh`, (await card.locator('.cc-inj-ta').inputValue()) === GOOD_HR);
    // go past the deadline (120 + 300) and submit the full-marks answer
    await setElapsed(page, 120 + 300 + 15);
    check(`${tag}: card shows OVERDUE`, (await card.locator('.cc-inj-due', { hasText: 'OVERDUE' }).count()) === 1);
    check(`${tag}: draft still there after going overdue`, (await card.locator('.cc-inj-ta').inputValue()) === GOOD_HR);
    await card.locator('.cc-inj-submit').click();
    await page.waitForTimeout(200);
    check(`${tag}: late submission card says "late — 0 pts"`, (await page.locator('.cc-inject[data-inject="new-user"] .cc-inj-late').innerText()).includes('0 pts'));
    await page.locator('.cc-inject[data-inject="new-user"]').scrollIntoViewIfNeeded();
    await page.locator('.cc-inject[data-inject="new-user"]').screenshot({ path: `${out}/late-inject-card-${tag}.png` });
    await page.locator('.cc-endround').click();
    await page.waitForSelector('[data-inject-review="new-user"]', { timeout: 8000 });
    const rev = page.locator('[data-inject-review="new-user"]');
    const revText = await rev.innerText();
    check(`${tag}: debrief shows "late · 0/25 pts"`, /late · 0\/25 pts/.test(revText), revText.split('\n')[0]);
    await rev.scrollIntoViewIfNeeded();
    await rev.screenshot({ path: `${out}/late-inject-debrief-${tag}.png` });
    const pts = await page.evaluate(() => window.__game.scene.getScene('CcdcLab').grade.injectResults.find((r) => r.id === 'new-user').points);
    check(`${tag}: scored points for the late inject === 0`, pts === 0, `${pts}`);
    check(`${tag}: no console/page errors (late inject flow)`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.close();
  }
  // --- Get-Service Spooler after the fix ----------------------------------------------------------------
  {
    const { page, errors } = await makePage(viewport);
    await toLab(page);
    await page.locator('.cc-role-btn', { hasText: 'Harbor Point' }).click();
    await page.locator('.cc-go', { hasText: 'Sit down' }).click();
    await page.waitForSelector('.cc-devtabs', { timeout: 8000 });
    await page.locator('.cc-devtab', { hasText: 'Domain controller' }).click();
    await page.waitForTimeout(150);
    for (const c of ['Get-Service Spooler', 'Stop-Service Spooler -Force', 'Set-Service Spooler -StartupType Disabled', 'Get-Service Spooler']) {
      const inp = page.locator('.eg-input');
      await inp.click(); await inp.fill(c); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    }
    const txt = await page.locator('.eg-out').innerText();
    const after = txt.slice(txt.lastIndexOf('Get-Service Spooler'));
    check(`${tag}: Get-Service Spooler shows Stopped after the fix`, /Stopped/.test(after) && !/Running/.test(after), after.replace(/\s+/g, ' ').slice(0, 120));
    check(`${tag}: … and StartType Disabled`, /Disabled/.test(after));
    await page.locator('.eg-term').scrollIntoViewIfNeeded();
    await page.locator('.eg-term').screenshot({ path: `${out}/spooler-stopped-${tag}.png` });
    check(`${tag}: no console/page errors (spooler flow)`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.close();
  }
}

await browser.close();
console.log(fails ? `FAILED ${fails}/${n}` : `OK  ${n}/${n} checks passed`);
process.exit(fails ? 1 : 0);
