// Full browser playthrough of CCDC company 3, Ridgeview Regional Medical Clinic.
//   node scripts/verify-ridgeview.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const out = process.argv[3] || 'docs/proof/ridgeview';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let fails = 0, n = 0;
const check = (name, ok, info = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const scene = (page, fn) => page.evaluate((src) => { const sc = window.__game.scene.getScene('CcdcLab'); return new Function('sc', src)(sc); }, fn);
const openWin = async (page, id) => { await page.locator(`.jb-tb-app[data-open="${id}"]`).click(); await page.waitForTimeout(250); };
const win = (page, id) => page.locator(`.jb-win[data-win="${id}"]`);
const status = (page, id) => scene(page, `return sc.state.findings['${id}']?.status;`);
async function type(page, id, cmd) {
  const w = win(page, id); const inp = w.locator('.tv-input').last();
  await inp.fill(cmd); await inp.press('Enter'); await page.waitForTimeout(250);
}
const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()} ${m.location()?.url || ''}`); });
page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()} ${r.url()}`); });

await page.goto(url + '?v=' + Date.now());
await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
await page.waitForTimeout(400);
await page.keyboard.press('t');
await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
await page.locator('.comp-card[data-mode="ccdc"]').click();
await page.waitForFunction(() => window.__game.scene.isActive('CcdcLab'), null, { timeout: 8000 });
await page.waitForTimeout(300);
await page.locator('.ccx-radio', { hasText: 'Ridgeview' }).click();
check('packet shows Ridgeview', (await page.locator('.ccx-page').nth(1).innerText()).includes('Ridgeview'));
await page.screenshot({ path: `${out}/packet.png` });
await page.locator('.ccx-radio', { hasText: 'Competition' }).click();
await page.locator('.ccx-btn.primary').click();
await page.waitForSelector('.jb-taskbar');
check('scenario is ridgeview', (await scene(page, 'return sc.scenario.id;')) === 'ridgeview-lab-2026');
check('taskbar has boxes', await page.locator('.jb-taskbar .jb-tb-app').count() >= 6);

// ehr01: SUID + TLS
await openWin(page, 'ssh-ehr01');
await type(page, 'ssh-ehr01', 'ls -l /usr/bin/find');
await type(page, 'ssh-ehr01', 'chmod u-s /usr/bin/find');
check('suid-find fixed by chmod u-s', (await status(page, 'suid-find')) === 'fixed', await status(page, 'suid-find'));
await type(page, 'ssh-ehr01', "sed -i 's/ssl_protocols .*/ssl_protocols TLSv1.2 TLSv1.3;/' /etc/nginx/conf.d/ehr.conf");
await type(page, 'ssh-ehr01', 'systemctl reload nginx');
check('tls-legacy fixed', (await status(page, 'tls-legacy')) === 'fixed', await status(page, 'tls-legacy'));
await page.screenshot({ path: `${out}/putty-ehr01.png` });

// db01: redis
await openWin(page, 'ssh-db01');
await type(page, 'ssh-db01', "sed -i 's/^bind .*/bind 127.0.0.1/' /etc/redis/redis.conf");
await type(page, 'ssh-db01', "echo 'requirepass Xk9-long-Unguessable-4471' >> /etc/redis/redis.conf");
await type(page, 'ssh-db01', 'systemctl restart redis-server');
check('redis-open fixed', (await status(page, 'redis-open')) === 'fixed', await status(page, 'redis-open'));

// dc01
await openWin(page, 'rdp-dc01');
await win(page,'rdp-dc01').locator('.wd-tbtn[aria-label$="PowerShell"]').click(); await page.waitForSelector('.jb-win[data-win="rdp-dc01"] .tv-input');
await type(page, 'rdp-dc01', 'Set-SmbServerConfiguration -RequireSecuritySignature $true -Force');
check('smb-signing fixed', (await status(page, 'smb-signing')) === 'fixed', await status(page, 'smb-signing'));
await type(page, 'rdp-dc01', 'Set-ADDefaultDomainPasswordPolicy -Identity ridgeview.example -MinPasswordLength 12 -LockoutThreshold 5');
check('weak-pw-policy fixed', (await status(page, 'weak-pw-policy')) === 'fixed', await status(page, 'weak-pw-policy'));
await page.screenshot({ path: `${out}/rdp-dc01.png` });

// ws01
await win(page, 'rdp-dc01').locator('.jb-ctl-min').click(); await openWin(page, 'rdp-ws01');
await win(page,'rdp-ws01').locator('.wd-tbtn[aria-label$="PowerShell"]').click(); await page.waitForSelector('.jb-win[data-win="rdp-ws01"] .tv-input');
await type(page, 'rdp-ws01', 'Set-MpPreference -DisableRealtimeMonitoring $false');
await type(page, 'rdp-ws01', "Remove-MpPreference -ExclusionPath 'C:\\ProgramData\\Updates'");
check('ws-defender-off fixed', (await status(page, 'ws-defender-off')) === 'fixed', await status(page, 'ws-defender-off'));

// firewall via PuTTY shell/GUI presence
await openWin(page, 'pf');
check('pfSense GUI opens', (await win(page, 'pf').innerText()).includes('Firewall'));
await page.screenshot({ path: `${out}/pfsense.png` });

// SIEM
await openWin(page, 'siem');
const q = win(page, 'siem').locator('textarea, input[type="text"]').first();
await q.fill('"Failed password" | stats count by src_ip'); await q.press('Enter');
await page.waitForTimeout(9000);
const st = await win(page, 'siem').innerText();
check('Splunk returns a table', /src_ip/i.test(st) && /count/i.test(st));
await page.screenshot({ path: `${out}/splunk.png` });

await scene(page, 'sc.endRound();');
await page.waitForSelector('.ccx-aar');
const aar = await page.locator('.ccx-aar').innerText();
check('after-action report', /Final standing: \d+ of \d+/.test(aar));
await page.screenshot({ path: `${out}/aar.png` });
check('no errors/404s', errors.length === 0, errors.slice(0, 4).join(' | '));
await browser.close();
console.log(`\n${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
