// Drives the HANDS-ON CPTC mode through the REAL UI: Title -> T -> hub -> CPTC card -> brief -> Kali terminal,
// TYPES recon/exploit commands to discover findings, switches to the report, rates + writes each finding and
// the exec summary, submits, and reads the scorecard. Desktop + phone.
//   node scripts/verify-cptclab.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5193/cyber-office/';
const out = process.argv[3] || 'smoke-out/cptclab';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
let fails = 0, n = 0;
const check = (name, ok, info = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };

async function makePage(viewport) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return { page, errors };
}
const st = (page) => page.evaluate(() => window.__game.scene.getScene('CptcLab').state);
const foundCount = (page) => page.evaluate(() => { const s = window.__game.scene.getScene('CptcLab').state; return s.scenario.findings.filter((f) => s.discovered[f.id]).length; });

async function toTerminal(page, { guided = true } = {}) {
  await page.goto(url + '?v=' + Date.now());
  await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.keyboard.press('t');
  await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
  await page.waitForTimeout(250);
  await page.locator('.comp-card[data-mode="cptc"]').click();
  await page.waitForFunction(() => window.__game.scene.isActive('CptcLab'), null, { timeout: 8000 });
  await page.waitForTimeout(250);
  if (!guided) await page.locator('.cc-mode-btn', { hasText: 'Competition' }).click();
  await page.locator('.cx-go', { hasText: 'Kali terminal' }).click();
  await page.waitForSelector('.eg-term', { timeout: 8000 });
  await page.waitForTimeout(200);
}
async function typeCmd(page, cmd) {
  const input = page.locator('.eg-input');
  await input.click();
  await input.fill(cmd);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
}
const termText = (page) => page.locator('.eg-out').innerText();

{
  const { page, errors } = await makePage({ width: 1366, height: 900 });
  await toTerminal(page, { guided: true });
  check('CPTC: Kali terminal reached', await page.locator('.eg-term').count() === 1);
  await typeCmd(page, 'nmap -sV 198.51.100.0/24');
  check('nmap recon prints open ports but confirms nothing yet', /3389/.test(await termText(page)) && await foundCount(page) === 0);
  for (const c of ['xfreerdp /v:198.51.100.20', 'sqlmap -u https://portal.meridian.example/login --data=user=admin', 'nmap 10.20.0.0/16', 'smbclient -L //10.20.0.15 -N', 'snmpwalk -v2c -c public 10.20.0.40', 'sslscan www.meridian.example']) await typeCmd(page, c);
  check('typed exploit commands confirm all five findings', await foundCount(page) === 5, `${await foundCount(page)} found`);
  await page.screenshot({ path: `${out}/01-kali-desktop.png` });

  // Go to the report.
  await page.locator('.cx-go', { hasText: 'write the report' }).click();
  await page.waitForSelector('.cx-report-list', { timeout: 8000 });
  check('report step lists only confirmed findings', await page.locator('.cx-report-card').count() === 5, `${await page.locator('.cx-report-card').count()} cards`);

  // Rate each finding to its reference severity + write a remediation, via the real matrix buttons.
  const refs = { 'ext-rdp': ['High', 'High'], 'sql-injection': ['High', 'High'], 'smb-share': ['Medium', 'High'], 'default-snmp': ['Medium', 'Medium'], 'weak-tls': ['Low', 'Low'] };
  const order = await page.evaluate(() => window.__game.scene.getScene('CptcLab').scenario.findings.filter((f) => window.__game.scene.getScene('CptcLab').state.discovered[f.id]).map((f) => f.id));
  const cards = page.locator('.cx-report-card');
  for (let i = 0; i < order.length; i++) {
    const [lik, imp] = refs[order[i]];
    const card = cards.nth(i);
    await card.locator('.cx-rate', { hasText: 'Likelihood' }).locator('.cx-rate-btn', { hasText: new RegExp(`^${lik}$`) }).click();
    await card.locator('.cx-rate', { hasText: 'Impact' }).locator('.cx-rate-btn', { hasText: new RegExp(`^${imp}$`) }).click();
    await card.locator('textarea').fill('Root-cause remediation written out in full for this finding.');
  }
  await page.locator('#cptclab .cx-panel', { hasText: 'Executive summary' }).locator('textarea').fill('Elevated risk of a patient-data breach from internet-exposed RDP and portal SQL injection; remediate both within 72 hours.');
  await page.screenshot({ path: `${out}/02-report-desktop.png` });
  await page.locator('.cx-go', { hasText: 'Submit the report' }).click();
  await page.waitForSelector('.cc-grade', { timeout: 8000 });
  const grade = (await page.locator('.cc-grade').innerText()).trim();
  check('a complete, correctly-rated report scores an A', grade === 'A', `grade ${grade}`);
  await page.screenshot({ path: `${out}/03-debrief-desktop.png` });
  check('desktop: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// Competition clock expiry pushes to the report then grades.
{
  const { page, errors } = await makePage({ width: 1366, height: 900 });
  await toTerminal(page, { guided: false });
  check('CPTC competition shows a clock', await page.locator('.cc-clock').count() === 1);
  const t0 = await page.locator('.cc-clock-val').innerText();
  await page.waitForTimeout(1600);
  const t1 = await page.locator('.cc-clock-val').innerText();
  check('the clock is live and ticks DOWN (carries across phases)', t0 !== t1 && /^\d+:\d\d$/.test(t1), `${t0} -> ${t1}`);
  await typeCmd(page, 'xfreerdp /v:198.51.100.20');
  await page.evaluate(() => { window.__game.scene.getScene('CptcLab').deadline = Date.now() + 1200; });
  await page.waitForFunction(() => window.__game.scene.getScene('CptcLab').phase === 'debrief', null, { timeout: 8000 });
  check('clock expiry grades the report as it stands', (await page.locator('.cc-timeout').count()) === 1);
  check('competition: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// Phone.
{
  const { page, errors } = await makePage({ width: 390, height: 844 });
  await toTerminal(page, { guided: true });
  await typeCmd(page, 'xfreerdp /v:198.51.100.20');
  check('phone: typing in the Kali terminal confirms a finding', await foundCount(page) === 1);
  const overflow = await page.evaluate(() => { const el = document.querySelector('#cptclab'); return document.scrollingElement.scrollWidth <= window.innerWidth + 1 && el.scrollWidth <= el.clientWidth + 1; });
  check('phone: no horizontal overflow', overflow);
  await page.screenshot({ path: `${out}/04-kali-phone.png` });
  check('phone: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

console.log(`\n${fails ? 'FAIL' : 'OK'}  ${n - fails}/${n} checks passed`);
await browser.close();
process.exit(fails ? 1 : 0);
