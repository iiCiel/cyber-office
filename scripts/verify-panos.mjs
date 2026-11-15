// Clicks through TOOL23T in the Palo Alto web UI (Invitational replay) and checks the engine grades it.
//   node scripts/verify-panos.mjs [url] [outDir]
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
await page.locator('.jb-tb-app[data-open="web-pa"]').click();
const W = page.locator('.jb-win[data-win="web-pa"]');
await W.locator('.pan-grid').waitFor();
const st = () => page.evaluate(() => { const s = window.__game.scene.getScene('CcdcLab').state; return { f: s.findings['pa-permit-any'].status, admin: s.findings['pa-default-admin'].status, dirty: s.devState.pa.pan.dirty, down: Object.entries(s.services).filter(([, v]) => v.state !== 'up').map(([k]) => k), rules: s.devState.pa.pan.candidate.rules.map((r) => r.name) }; });
const ok = async () => { await W.locator('.pan-dlg [data-btn="OK"]').click(); };
const noErr = async (label) => { const e = await W.locator('.pan-dlg-err').count(); check(e === 0, `${label}: no error dialog`); if (e) { console.log(await W.locator('.pan-dlg-err').innerText()); await W.locator('.pan-dlg-err [data-btn="OK"]').click(); } };

// 1. Objects > Security Profile Groups > Add
await W.locator('.pan-tab[data-tab="Objects"]').click();
await W.locator('.pan-toolbar [data-act="Add"]').click();
await W.locator('[data-f="gname"]').fill('inspect');
await W.locator('[data-f="virus"]').selectOption('default');
await W.locator('[data-f="spyware"]').selectOption('default');
await W.locator('[data-f="vulnerability"]').selectOption('default');
await ok(); await noErr('profile group');
check(await W.locator('tr[data-group="inspect"]').count() === 1, 'group listed');
await page.screenshot({ path: `${out}/profile-groups.png` });

// 2. Policies > Security: one allow rule per server
await W.locator('.pan-tab[data-tab="Policies"]').click();
const RULES = [
  ['ecomm', '172.20.240.10', 'web-browsing, ssl, ping', null],
  ['webmail', '172.20.240.15', 'smtp, imap, ssh', null],
  ['splunk', '172.20.240.20', 'ssh, ntp, splunk, ssl', null],
  ['ad-dns', '172.20.240.100', 'dns', null],
  ['ad-winrm', '172.20.240.100', '', 'tcp-5985'],
];
for (const [name, ip, apps, port] of RULES) {
  await W.locator('.pan-toolbar [data-act="Add"]').click();
  await W.locator('[data-f="name"]').fill(name);
  await W.locator('[data-dtab="Source"]').click();
  await W.locator('[data-f="from-any"]').uncheck(); await W.locator('[data-f="from"]').fill('external');
  await W.locator('[data-dtab="Destination"]').click();
  await W.locator('[data-f="to-any"]').uncheck(); await W.locator('[data-f="to"]').fill('internal');
  await W.locator('[data-f="destination-any"]').uncheck(); await W.locator('[data-f="destination"]').fill(ip);
  if (apps) { await W.locator('[data-dtab="Application"]').click(); await W.locator('[data-f="application-any"]').uncheck(); await W.locator('[data-f="application"]').fill(apps); }
  if (port) { await W.locator('[data-dtab="Service/URL Category"]').click(); await W.locator('[data-f="service-mode"]').selectOption('select'); await W.locator('[data-f="service"]').fill(port); }
  await W.locator('[data-dtab="Actions"]').click();
  await W.locator('[data-f="profile-type"]').selectOption('Group');
  await W.locator('[data-f="group"]').selectOption('inspect');
  if (name === 'ad-winrm') await page.screenshot({ path: `${out}/rule-dialog-actions.png` });
  await ok(); await noErr(`rule ${name}`);
}
let s = await st();
check(s.rules.length === 7, `7 rules in candidate (${s.rules.join(', ')})`);
check(s.dirty === true, 'candidate dirty, nothing live yet');
check(await W.locator('.pan-commit-on').count() === 1, 'Commit button shows pending changes');

// 3. Disable the two allow-all rules (select both, Disable)
await W.locator('tr[data-rule="Permit Outbound"] td.pan-num').click();
await W.locator('tr[data-rule="Permit Inbound"] td.pan-num').click();
await W.locator('.pan-toolbar [data-act="Disable"]').click();
check(await W.locator('tr.pan-dis').count() === 2, 'two rules greyed out');

// 4. Override interzone-default: log at session end
await W.locator('tr[data-rule="interzone-default"] td.pan-num').click();
await W.locator('tr[data-rule="Permit Outbound"] td.pan-num').click();
await W.locator('tr[data-rule="Permit Inbound"] td.pan-num').click();
await W.locator('.pan-toolbar [data-act="Override"]').click();
await W.locator('[data-f="log-end"]').check();
await ok(); await noErr('override');
await page.screenshot({ path: `${out}/security-before-commit.png` });
s = await st();
check(s.f !== 'fixed', 'not hardened before commit');

// 5. Commit
await W.locator('.pan-commit').click();
await W.locator('.pan-dlg-commit [data-btn="Commit"]').click();
await W.locator('[data-f="commit-status"]', { hasText: 'Queued' }).waitFor();
await page.screenshot({ path: `${out}/commit-status-queued.png` });
await W.locator('[data-f="commit-result"]', { hasText: 'OK' }).waitFor({ timeout: 5000 });
await page.screenshot({ path: `${out}/commit-status-done.png` });
await W.locator('.pan-dlg-cs [data-btn="Close"]').click();
s = await st();
check(s.f === 'fixed', 'pa-permit-any hardened after commit');
check(s.dirty === false, 'candidate == running');
check(!s.down.some((d) => !['ecomm-http', 'ecomm-ping', 'ad-winrm'].includes(d)), `no new service down (down: ${s.down.join(',')})`);

// 6. Device > Administrators: change admin password, commit
await W.locator('.pan-tab[data-tab="Device"]').click();
await W.locator('.pan-grid .pan-link', { hasText: 'admin' }).click();
await W.locator('[data-f="pw1"]').fill('W@terOps-14!'); await W.locator('[data-f="pw2"]').fill('W@terOps-14!');
await ok(); await noErr('admin pw');
await W.locator('.pan-commit').click();
await W.locator('.pan-dlg-commit [data-btn="Commit"]').click();
await W.locator('[data-f="commit-result"]', { hasText: 'OK' }).waitFor({ timeout: 5000 });
await W.locator('.pan-dlg-cs [data-btn="Close"]').click();
check((await st()).admin === 'fixed', 'pa-default-admin fixed');

// 7. NAT and Zones render like his screenshots
await W.locator('.pan-tab[data-tab="Policies"]').click(); await W.locator('.pan-tree li[data-page="NAT"]').click();
check((await W.locator('.pan-nat').innerText()).includes('dynamic-ip-and-port'), 'NAT shows Default NAT');
await page.screenshot({ path: `${out}/nat.png` });
await W.locator('.pan-tab[data-tab="Network"]').click();
check((await W.locator('.pan-grid').innerText()).includes('ethernet1/3'), 'Zones show external/internal');
await page.screenshot({ path: `${out}/zones.png` });
await W.locator('.pan-tab[data-tab="Policies"]').click();
await page.screenshot({ path: `${out}/security-after.png` });

check(errors.length === 0, `no console errors ${errors.slice(0, 2).join(' | ')}`);
console.log(`${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
