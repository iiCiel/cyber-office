// Replays the Nov 14 PCR mistake in Quotient and the right order. node scripts/verify-quotient.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const out = process.argv[3] || 'docs/proof/quotient';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let pass = 0; let fail = 0;
const check = (ok, label) => { if (ok) pass += 1; else fail += 1; console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); };
await page.goto(url + '?v=' + Date.now());
await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
await page.waitForTimeout(400); await page.keyboard.press('t');
await page.waitForFunction(() => window.__game.scene.isActive('Competitions'));
await page.locator('.comp-card[data-mode="ccdc"]').click();
await page.waitForFunction(() => window.__game.scene.isActive('CcdcLab'));
await page.locator('.ccx-radio', { hasText: 'Under Pressure' }).click();
await page.locator('.ccx-btn.primary').click();
await page.waitForSelector('.jb-taskbar');
await page.locator('.jb-tb-app[data-open="quotient"]').click();
const W = page.locator('.jb-win[data-win="quotient"]');
await W.locator('.qt-svc').first().waitFor();
check(await W.locator('.qt-svc').count() === 19, `Services page: ${await W.locator('.qt-svc').count()} service cards`);
await W.locator('.qt-nl[data-page="pcr"]').click();
await W.locator('.qt-select').waitFor();
const pcr = () => page.evaluate(() => window.__game.scene.getScene('CcdcLab').state.engine.pcrs.map((p) => `${p.account}:${p.filed ? 'filed' : '-'}:${p.breaking ? 'BREAKING' : 'ok'}`).join(' '));

// The Nov 14 mistake: paste built from AD (includes svc-splunk and AD-only names).
await W.locator('[data-f="creds"]').fill(['svc-splunk', 'agrapplernamedsam', 'jerry', 'shadbrown', 'johnford', 'daviddurkee', 'jimmy', 'stephanie.brown'].map((u) => `${u},ZipsBlue2026x!`).join('\n'));
await W.locator('[data-btn="submit"]').click();
check((await W.locator('.qt-alert').innerText()).includes('No credentials were updated'), 'AD-built paste rejected whole');
await page.screenshot({ path: `${out}/pcr-rejected.png` });

// Usernames tab: copy the exact list.
await W.locator('[data-tab="usernames"]').click();
const names = await W.locator('.qt-users tbody td').allInnerTexts();
check(names.length > 40 && !names.some((n) => n.startsWith('svc-')), `Usernames tab lists ${names.length} names, no svc-*`);
await W.locator('.qt-select').selectOption('MssqlService');
check((await W.locator('.qt-count').innerText()).includes('1 usernames shown'), 'MssqlService: 1 username');
await page.screenshot({ path: `${out}/usernames-mssql.png` });
await W.locator('.qt-select').selectOption('DomainUsers');
await W.locator('[data-tab="update"]').click();
await W.locator('[data-f="creds"]').fill(names.map((u) => `${u},ZipsBlue2026x!`).join('\n'));
await W.locator('[data-btn="submit"]').click();
check((await W.locator('.qt-alert').innerText()).includes('updated'), 'DomainUsers accepted');
check((await pcr()).includes('DomainUsers:filed'), `engine: ${await pcr()}`);

// Reset in AD without filing Splunk: splunk-query should start failing.
await page.evaluate(() => { const sc = window.__game.scene.getScene('CcdcLab'); sc.run('dc', "Get-ADUser -Filter * | Where-Object { $_.SamAccountName -notlike 'svc-*' } | Set-ADAccountPassword -Reset -NewPassword (ConvertTo-SecureString 'ZipsBlue2026x!' -AsPlainText -Force)"); });
check((await pcr()).includes('Splunk:-:BREAKING'), `Splunk list not filed -> breaking (${await pcr()})`);
check((await pcr()).includes('DomainUsers:filed:ok'), 'DomainUsers pre-approved');
await page.waitForTimeout(200);
// advance two scoring rounds, then open the service page
await page.evaluate(async () => { const m = await import('/cyber-office/src/game/ccdcEngine.js'); const s = window.__game.scene.getScene('CcdcLab').state; m.tickTo(s, s.engine.clock + 125); });
await W.locator('.qt-nl[data-page="services"]').click();
await W.locator('.qt-svc[data-svc="splunk-query"]').click();
const t = await W.locator('.qt-rounds').innerText();
check(/false/.test(t), 'splunk-query round table shows false');
await W.locator('.qt-back').click();
await page.screenshot({ path: `${out}/services.png` });
const red = await W.locator('.qt-svc[data-svc="splunk-query"] .qt-r.down').count();
check(red >= 1, `splunk-query card shows ${red} red round(s), newest first`);
check(await W.locator('.qt-svc[data-svc="splunk-query"] .qt-rounds10 .qt-r').first().evaluate((e) => e.classList.contains('down')), 'newest round is the leftmost icon');
await W.locator('.qt-nl[data-page="graphs"]').click();
await W.locator('.qt-chart').first().waitFor();
const selfRows = await W.locator('svg rect[data-team="self"]').count();
const otherRows = await W.locator('svg rect[data-team="other"]').count();
check(selfRows === 38 && otherRows >= 38 * 9, `Graphs: heatmaps cover every team (${selfRows} self cells, ${otherRows} other cells)`);
check(await W.locator('text.qt-yl.self').count() >= 3, 'your row is highlighted in purple');
check(await W.locator('polyline[data-self="1"]').count() === 1, 'Scores Over Time has your line');
check(await W.locator('rect[data-rank]').count() >= 10, 'Leaderboard lists every team');
await page.screenshot({ path: `${out}/graphs.png`, fullPage: false });
await W.locator('.qt-main').evaluate((m) => { m.scrollTop = 900; });
await page.screenshot({ path: `${out}/graphs-2.png` });
await page.screenshot({ path: `${out}/service-splunk-query.png` });

// File the Splunk list from its Usernames tab.
await W.locator('.qt-nl[data-page="pcr"]').click();
await W.locator('.qt-select').selectOption('Splunk');
await W.locator('[data-tab="usernames"]').click();
const sn = await W.locator('.qt-users tbody td').allInnerTexts();
await W.locator('[data-tab="update"]').click();
await W.locator('[data-f="creds"]').fill(sn.map((u) => `${u},ZipsBlue2026x!`).join('\n'));
await W.locator('[data-btn="submit"]').click();
check((await pcr()).includes('Splunk:filed:ok'), `Splunk filed -> passing (${await pcr()})`);
await page.screenshot({ path: `${out}/pcr-accepted.png` });
check(errors.length === 0, `no console errors ${errors.slice(0, 2).join(' | ')}`);
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
