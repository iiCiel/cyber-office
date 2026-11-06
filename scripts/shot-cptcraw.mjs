// Proof for "raw tool output": opens each CPTC engagement in the real UI, types a few commands in the Kali
// terminal and screenshots the terminal window, so you can see real nmap / gobuster / sqlmap / crackmapexec output.
//   node scripts/shot-cptcraw.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const out = process.argv[3] || 'docs/proof/cptc-raw';
fs.mkdirSync(out, { recursive: true });

const RUNS = [
  ['1-meridian', ['nmap -sV 198.51.100.0/24', 'sqlmap -u https://portal.meridian.example/login --data=user=admin', 'smbclient -L //10.20.0.15 -N']],
  ['2-atlas', ['nmap -sV 203.0.113.0/24', 'gobuster dir -u http://dev.atlas-cu.example -w common.txt', 'nuclei -u https://vpn.atlas-cu.example']],
  ['3-lakeshore', ['nmap -sV 10.30.0.0/16', 'impacket-GetNPUsers LAKESHORE.example/ -usersfile users.txt -no-pass -dc-ip 10.30.0.10', "crackmapexec smb 10.30.0.25 -u svc-wms -p 'cracked-password'"]],
];

const browser = await chromium.launch({ channel: 'chrome', headless: true });
let fails = 0;
for (const [i, [name, cmds]] of RUNS.entries()) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url + '?v=' + Date.now());
  await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.keyboard.press('t');
  await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
  await page.locator('.comp-card[data-mode="cptc"]').click();
  await page.waitForFunction(() => window.__game.scene.isActive('CptcLab'), null, { timeout: 8000 });
  await page.waitForTimeout(250);
  await page.locator('input[name="kx-client"]').nth(i).check();
  await page.waitForTimeout(250);
  await page.locator('.kx-begin').click();
  await page.waitForSelector('.tv-kali .tv-input', { timeout: 8000 });
  for (const c of cmds) {
    const input = page.locator('.tv-kali .tv-input');
    await input.click(); await input.fill(c); await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
  }
  const text = await page.locator('.tv-kali .tv-out').innerText();
  const client = await page.evaluate(() => window.__game.scene.getScene('CptcLab').state.scenario.client);
  const summary = text.split('\n').filter((l) => /\s->\s/.test(l) && !/^(\[|SMB|<)/.test(l));
  const ok = errors.length === 0 && summary.length === 0 && /FINDING CONFIRMED/.test(text);
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} (${client}): ${text.split('\n').length} terminal lines, ${summary.length} summary lines, errors=${errors.length}`);
  await page.locator('.tv-kali .tv-out').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.screenshot({ path: `${out}/${name}-terminal.png` });
  await page.close();
}
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
