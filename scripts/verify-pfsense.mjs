// Drives the pfSense GUI preview (dev server: npx vite --port 5203 --strictPort) through the real UI.
//   node scripts/verify-pfsense.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5203/cyber-office/preview/pfsense.html';
const out = process.argv[3] || 'docs/proof/pfsense';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let fails = 0;
const check = (n, ok, info = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${info ? `  (${info})` : ''}`); };

const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
await page.goto(url);
await page.waitForSelector('.pf');
const menu = async (top, item) => { await page.locator('.pf-menu-a', { hasText: top }).click(); await page.locator('.pf-dropdown a', { hasText: new RegExp(`^${item}$`) }).click(); };

await menu('Status', 'Dashboard');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/dashboard-1366.png` });

await menu('Firewall', 'Rules');
await page.screenshot({ path: `${out}/rules-before-1366.png` });

const rules = [
  ['tcp', 'web01', '80'], ['tcp', 'web01', '443'], ['tcp/udp', 'dc01', '53'],
  ['tcp', 'mail01', '25'], ['tcp', 'mail01', '143'], ['tcp', 'mail01', '993'], ['tcp', 'db01', '3306', 'scoring'],
];
let shotForm = false;
for (const [proto, dest, port, src] of rules) {
  await page.locator('[data-act="add"]').click();
  await page.selectOption('[name="proto"]', proto);
  await page.selectOption('[name="dest"]', dest);
  await page.fill('[name="portFrom"]', port);
  if (src) { await page.selectOption('[name="source"]', 'single'); await page.fill('[name="sourceValue"]', src); }
  if (!shotForm) { await page.evaluate(() => { document.querySelector('.pf').scrollTop = 0; }); await page.screenshot({ path: `${out}/edit-form-1366.png` }); shotForm = true; }
  await page.locator('[data-act="save"]').click();
}
check('apply banner shown after saves', await page.locator('.pf-alert-warning').count() === 1);
check('no service dropped while adding allow rules', await page.evaluate(() => Object.values(window.__pf.state.services).every((s) => s.state === 'up')));
await page.screenshot({ path: `${out}/rules-after-adds-1366.png` });

// delete the any-any rule (row 1) through the confirm dialog
await page.locator('.pf-row-pass').first().locator('.pf-act-del').click();
await page.screenshot({ path: `${out}/delete-confirm-1366.png` });
await page.locator('[data-act="confirm-delete"]').click();
check('any-any rule gone', await page.evaluate(() => !window.__pf.state.devState['edge-fw'].firewall.rules.some((r) => r.dst === 'any')));
await page.locator('[data-act="default"]').click();
check('default policy is block', await page.evaluate(() => window.__pf.state.devState['edge-fw'].firewall.default) === 'block');
check('firewall finding fixed', await page.evaluate(() => window.__pf.state.findings['firewall-anyany'].status) === 'fixed');
check('all services still up', await page.evaluate(() => Object.values(window.__pf.state.services).every((s) => s.state === 'up')));
await page.locator('.pf-apply').click();
check('apply clears banner', await page.locator('.pf-alert-warning').count() === 0);
await page.screenshot({ path: `${out}/rules-hardened-1366.png` });

// refresh must not steal focus from or clear a form being edited
await page.locator('[data-act="add"]').click();
await page.fill('[name="portFrom"]', '44');
await page.focus('[name="portFrom"]');
await page.waitForTimeout(2300);
check('form survives refresh', await page.inputValue('[name="portFrom"]') === '44' && await page.evaluate(() => document.activeElement?.name) === 'portFrom');
// bad input shows pfSense-style errors
await page.fill('[name="portFrom"]', '99999');
await page.locator('[data-act="save"]').click();
check('input error alert', await page.locator('.pf-alert-danger').count() === 1);
await page.screenshot({ path: `${out}/edit-form-error-1366.png` });
await page.locator('[data-act="cancel"]').click();

await menu('Status', 'System Logs');
await page.screenshot({ path: `${out}/logs-1366.png` });
check('log has blocks after hardening', await page.locator('.pf-logs .pf-bad').count() > 0);
await menu('Diagnostics', 'Command Prompt');
await page.fill('[name="cmd"]', 'show');
await page.locator('[data-act="exec"]').click();
check('command prompt shows rules', /Default inbound policy: BLOCK/.test(await page.locator('.pf-pre').first().textContent()));
await page.screenshot({ path: `${out}/command-prompt-1366.png` });

await page.setViewportSize({ width: 390, height: 844 });
await menu('Firewall', 'Rules').catch(async () => {
  await page.locator('.pf-nav-toggle').click();
  await menu('Firewall', 'Rules');
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/rules-390.png` });
await page.locator('.pf-nav-toggle').click();
await page.screenshot({ path: `${out}/menu-390.png` });
check('no JS errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
