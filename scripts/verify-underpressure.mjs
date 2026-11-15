// Full browser playthrough of CCDC company 4, the Under Pressure Water Authority (Invitational replay).
//   node scripts/verify-underpressure.mjs [url] [outDir]
// Plays the round the way it went on Nov 14, 2026: router first, then Splunk, the web store, mail and the DC,
// including two of the team's real mistakes (stopping SSH on Splunk, a bulk reset that hits svc-splunk).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const out = process.argv[3] || 'docs/proof/underpressure';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let fails = 0, n = 0;
const check = (name, ok, info = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const scene = (page, fn) => page.evaluate((src) => { const sc = window.__game.scene.getScene('CcdcLab'); return new Function('sc', src)(sc); }, fn);
const openWin = async (page, id) => { await page.locator(`.jb-tb-app[data-open="${id}"]`).click(); await page.waitForTimeout(250); };
const win = (page, id) => page.locator(`.jb-win[data-win="${id}"]`);
const status = (page, id) => scene(page, `return sc.state.findings['${id}']?.status;`);
const svc = (page, id) => scene(page, `return sc.state.services['${id}']?.state;`);
async function type(page, id, cmd) {
  const inp = win(page, id).locator('.tv-input').last();
  await inp.fill(cmd); await inp.press('Enter'); await page.waitForTimeout(200);
}
const lastText = (page, id) => win(page, id).innerText();

const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('response', (r) => { if (r.status() >= 400) errors.push(`http ${r.status()} ${r.url()}`); });

await page.goto(url + '?v=' + Date.now());
await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
await page.waitForTimeout(400);
await page.keyboard.press('t');
await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
await page.locator('.comp-card[data-mode="ccdc"]').click();
await page.waitForFunction(() => window.__game.scene.isActive('CcdcLab'), null, { timeout: 8000 });
await page.waitForTimeout(300);
await page.locator('.ccx-radio', { hasText: 'Under Pressure' }).click();
check('packet shows Under Pressure', (await page.locator('.ccx-page').nth(1).innerText()).includes('Under Pressure'));
await page.screenshot({ path: `${out}/1-packet.png` });
await page.locator('.ccx-radio', { hasText: 'Competition' }).click();
await page.locator('.ccx-btn.primary').click();
await page.waitForSelector('.jb-taskbar');
check('scenario is the invitational replay', (await scene(page, 'return sc.scenario.id;')) === 'underpressure-invitational-2026');
check('ecomm-http starts DOWN', (await svc(page, 'ecomm-http')) === 'down');
check('ad-winrm starts DOWN', (await svc(page, 'ad-winrm')) === 'down');
await page.screenshot({ path: `${out}/2-desktop.png` });

// --- VyOS first ---
await openWin(page, 'ssh-vyos');
await type(page, 'ssh-vyos', 'show system login');
check('router shows the planted key', (await lastText(page, 'ssh-vyos')).includes('cyberrange-lab'));
await type(page, 'ssh-vyos', 'configure');
await type(page, 'ssh-vyos', 'set system login user vyos authentication plaintext-password W4ter-Router-2026!');
await type(page, 'ssh-vyos', 'delete system login user vyos authentication public-keys cyberrange-lab');
await type(page, 'ssh-vyos', 'delete service ssh');
await type(page, 'ssh-vyos', 'commit');
await type(page, 'ssh-vyos', 'save');
check('vyos-backdoor fixed', (await status(page, 'vyos-backdoor')) === 'fixed');
check('vyos-ssh fixed', (await status(page, 'vyos-ssh')) === 'fixed');
await page.screenshot({ path: `${out}/3-vyos.png` });

// --- Splunk, including the wrong-tab mistake ---
await openWin(page, 'ssh-splunk');
await type(page, 'ssh-splunk', 'sudo systemctl stop ssh');
check('mistake: stopping ssh on Splunk drops splunk-ssh', (await svc(page, 'splunk-ssh')) === 'down');
await page.screenshot({ path: `${out}/4-splunk-mistake.png` });
await type(page, 'ssh-splunk', 'sudo userdel -r svc-chrony');
await type(page, 'ssh-splunk', 'sudo rm /etc/sudoers.d/svc-chrony');
check('svc-chrony removed', (await status(page, 'splunk-backdoor-user')) === 'fixed');
await type(page, 'ssh-splunk', 'cat /etc/cron.d/quotient_scoring');
check('quotient_scoring is readable before deleting', (await lastText(page, 'ssh-splunk')).includes('waterplant operational report'));
await type(page, 'ssh-splunk', 'sudo crontab -r');
await type(page, 'ssh-splunk', 'sudo rm /etc/cron.d/e2scrub');
check('firewall wiper cron removed', (await status(page, 'splunk-fw-wiper')) === 'fixed');
await page.screenshot({ path: `${out}/5-splunk.png` });

// --- Rocky Ecom: drop table, then the goose kit ---
await openWin(page, 'ssh-ecom');
await type(page, 'ssh-ecom', 'curl -I localhost');
check('curl localhost hangs while the drop table exists', (await lastText(page, 'ssh-ecom')).includes('timed out'));
await type(page, 'ssh-ecom', 'sudo nft delete table inet firewalld_policy_drop');
check('ecomm-http back UP', (await svc(page, 'ecomm-http')) === 'up');
await type(page, 'ssh-ecom', 'ps -ef');
check('ps shows the fake scoringengine', (await lastText(page, 'ssh-ecom')).includes('/bin/scoringengine'));
await page.screenshot({ path: `${out}/6-ecom-ps.png` });
await type(page, 'ssh-ecom', 'sudo kill -9 7484');
await type(page, 'ssh-ecom', 'sudo rm /bin/scoringengine');
await type(page, 'ssh-ecom', 'sudo rm /usr/lib/.honk');
check('goose kit removed', (await status(page, 'ecom-goose')) === 'fixed');
await page.screenshot({ path: `${out}/7-ecom.png` });

// --- DC: WinRM, svc-splunk, and the bulk reset trap ---
await openWin(page, 'rdp-dc');
await win(page, 'rdp-dc').locator('.wd-tbtn[aria-label$="PowerShell"]').click();
await page.waitForSelector('.jb-win[data-win="rdp-dc"] .tv-input');
await type(page, 'rdp-dc', 'Get-NetConnectionProfile');
check('DC shows the Public profile', (await lastText(page, 'rdp-dc')).includes('Public'));
await type(page, 'rdp-dc', 'netsh advfirewall show allprofiles state');
check('DC firewall locked: Access is denied', (await lastText(page, 'rdp-dc')).includes('Access is denied'));
await page.screenshot({ path: `${out}/10-dc-access-denied.png` });
await type(page, 'rdp-dc', 'Remove-Item C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\profile.ps1');
await type(page, 'rdp-dc', 'C:\\Tools\\PsExec64.exe -s -i powershell');
await type(page, 'rdp-dc', 'Set-Acl HKLM:\\SYSTEM\\CurrentControlSet\\Services\\SharedAccess\\Parameters\\FirewallPolicy $a');
await page.screenshot({ path: `${out}/11-dc-unlocked.png` });
await type(page, 'rdp-dc', 'Set-NetFirewallRule -DisplayGroup "Windows Remote Management" -RemoteAddress Any');
check('ad-winrm back UP', (await svc(page, 'ad-winrm')) === 'up');
await type(page, 'rdp-dc', 'Remove-ADGroupMember "Domain Admins" svc-splunk -Confirm:$false');
await type(page, 'rdp-dc', 'Remove-ADGroupMember "Enterprise Admins" svc-splunk -Confirm:$false');
check('svc-splunk out of DA/EA', (await status(page, 'dc-svc-da')) === 'fixed');
await type(page, 'rdp-dc', 'Set-ADAccountPassword svc-splunk -Reset');
check('mistake: resetting svc-splunk drops splunk-query', (await svc(page, 'splunk-query')) === 'down');
await page.screenshot({ path: `${out}/8-dc.png` });

check('no console or network errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`\n${n - fails}/${n} checks passed, ${fails} failed, ${errors.length} console/network errors`);
await browser.close();
process.exit(fails ? 1 : 0);
