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

const CMDS = ['xfreerdp /v:198.51.100.20', 'sqlmap -u https://portal.meridian.example/login --data=user=admin', 'nmap 10.20.0.0/16', 'smbclient -L //10.20.0.15 -N', 'snmpwalk -v2c -c public 10.20.0.40', 'sslscan www.meridian.example'];
const REFS = { 'ext-rdp': ['High', 'High'], 'sql-injection': ['High', 'High'], 'smb-share': ['Medium', 'High'], 'default-snmp': ['Medium', 'Medium'], 'weak-tls': ['Low', 'Low'] };
const BOILER = 'Root-cause remediation written out in full for this finding.';
const REAL_REM = {
  'ext-rdp': 'Remove RDP from the internet (close 3389 at the edge) and put remote access behind a VPN with MFA.',
  'sql-injection': 'Rewrite the login query with parameterised queries / prepared statements, validate input server-side, and use a least-privilege database account.',
  'smb-share': 'Restrict the HR$ share to the HR group only, remove Authenticated Users read access, move the file, and audit who accessed it.',
  'default-snmp': 'Change or disable the public SNMP community string (move to SNMPv3) and segment the printer VLAN with an ACL.',
  'weak-tls': 'Disable TLS 1.0 and 1.1 and serve TLS 1.2+ only.',
};
const REAL_EXEC = 'Meridian faces an elevated risk of a patient-data breach: Remote Desktop is exposed to the internet and the patient portal has a SQL injection flaw. We recommend fixing both within 72 hours; once remediated, the main ransomware and data-theft paths are closed.';

// Rate every confirmed finding to its reference severity via the real matrix buttons and write `text(id)`.
async function fillReport(page, text) {
  const order = await page.evaluate(() => { const sc = window.__game.scene.getScene('CptcLab'); return sc.scenario.findings.filter((f) => sc.state.discovered[f.id]).map((f) => f.id); });
  const cards = page.locator('.cx-report-card');
  for (let i = 0; i < order.length; i++) {
    const [lik, imp] = REFS[order[i]];
    const card = cards.nth(i);
    await card.locator('.cx-rate', { hasText: 'Likelihood' }).locator('.cx-rate-btn', { hasText: new RegExp(`^${lik}$`) }).click();
    await card.locator('.cx-rate', { hasText: 'Impact' }).locator('.cx-rate-btn', { hasText: new RegExp(`^${imp}$`) }).click();
    await cards.nth(i).locator('textarea').fill(text(order[i]));
  }
}

{
  const { page, errors } = await makePage({ width: 1366, height: 900 });
  await toTerminal(page, { guided: true });
  check('CPTC: Kali terminal reached', await page.locator('.eg-term').count() === 1);
  check('guided mode is untimed (no clock shown)', await page.locator('.cc-clock').count() === 0);
  await typeCmd(page, 'nmap -sV 198.51.100.0/24');
  check('nmap recon prints open ports but confirms nothing yet', /3389/.test(await termText(page)) && await foundCount(page) === 0);
  for (const c of CMDS) await typeCmd(page, c);
  check('typed exploit commands confirm all five findings', await foundCount(page) === 5, `${await foundCount(page)} found`);
  await page.screenshot({ path: `${out}/01-kali-desktop.png` });

  // Go to the report.
  await page.locator('.cx-go', { hasText: 'write the report' }).click();
  await page.waitForSelector('.cx-report-list', { timeout: 8000 });
  check('report step lists only confirmed findings', await page.locator('.cx-report-card').count() === 5, `${await page.locator('.cx-report-card').count()} cards`);

  // Pass 1 — BOILERPLATE: correct ratings, but the same empty sentence under every finding. Must NOT reach an A.
  check('guided: no model rating/remediation is shown before the player locks in', await page.locator('.cx-rc-model').count() === 0);
  await fillReport(page, () => BOILER);
  await page.locator('#cptclab .cx-panel', { hasText: 'Executive summary' }).locator('textarea').fill(REAL_EXEC);
  await page.screenshot({ path: `${out}/02-report-boilerplate-desktop.png` });
  await page.locator('.cx-go', { hasText: 'Submit the report' }).click();
  await page.waitForSelector('.cc-grade', { timeout: 8000 });
  const boilerGrade = (await page.locator('.cc-grade').innerText()).trim();
  const boilerPct = await page.evaluate(() => window.__game.scene.getScene('CptcLab').grade.pct);
  check('boilerplate remediation ("Root-cause remediation written out in full…") can NOT reach an A', boilerGrade !== 'A', `grade ${boilerGrade} · ${boilerPct}%`);
  check('debrief lists the missing controls for each boilerplate remediation', await page.locator('.cx-rem-review li', { hasText: 'Missing:' }).count() === 5);
  await page.screenshot({ path: `${out}/03-debrief-boilerplate-desktop.png`, fullPage: false });
  await page.locator('.cx-rem-review').screenshot({ path: `${out}/03b-boilerplate-remediation-review.png` });

  // Pass 2 — a REAL report: same ratings, specific root-cause controls. Must reach an A.
  await page.locator('.cx-again').click();
  await page.locator('.cx-go', { hasText: 'Kali terminal' }).click();
  await page.waitForSelector('.eg-term', { timeout: 8000 });
  for (const c of CMDS) await typeCmd(page, c);
  await page.locator('.cx-go', { hasText: 'write the report' }).click();
  await page.waitForSelector('.cx-report-list', { timeout: 8000 });
  await fillReport(page, (id) => REAL_REM[id]);
  // Guided lock-in on one finding: the model + rubric feedback appear only after committing; pickers freeze.
  const firstCard = page.locator('.cx-report-card').first();
  await firstCard.locator('.cx-lock').click();
  await page.waitForTimeout(150);
  check('guided: after "Lock in", the model answer + rubric feedback appear for that finding', await page.locator('.cx-report-card').first().locator('.cx-rem-feedback').count() === 1 && await page.locator('.cx-rem-feedback').count() === 1);
  check('guided: a locked finding\'s pickers are disabled', await page.locator('.cx-report-card').first().locator('.cx-rate-btn[disabled]').count() === 6);
  await page.locator('#cptclab .cx-panel', { hasText: 'Executive summary' }).locator('textarea').fill(REAL_EXEC);
  await page.screenshot({ path: `${out}/04-report-real-desktop.png` });
  await page.locator('.cx-go', { hasText: 'Submit the report' }).click();
  await page.waitForSelector('.cc-grade', { timeout: 8000 });
  const grade = (await page.locator('.cc-grade').innerText()).trim();
  const realPct = await page.evaluate(() => window.__game.scene.getScene('CptcLab').grade.pct);
  check('a real, specific report scores an A', grade === 'A', `grade ${grade} · ${realPct}%`);
  await page.screenshot({ path: `${out}/05-debrief-real-desktop.png`, fullPage: false });
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

// Phone: a real report end-to-end, then the debrief at 390 px.
{
  const { page, errors } = await makePage({ width: 390, height: 844 });
  await toTerminal(page, { guided: true });
  for (const c of CMDS) await typeCmd(page, c);
  await page.locator('.cx-go', { hasText: 'write the report' }).click();
  await page.waitForSelector('.cx-report-list', { timeout: 8000 });
  await fillReport(page, (id) => REAL_REM[id]);
  await page.locator('#cptclab .cx-panel', { hasText: 'Executive summary' }).locator('textarea').fill(REAL_EXEC);
  await page.locator('.cx-go', { hasText: 'Submit the report' }).click();
  await page.waitForSelector('.cx-rem-review', { timeout: 8000 });
  const overflow = await page.evaluate(() => { const el = document.querySelector('#cptclab'); return document.scrollingElement.scrollWidth <= window.innerWidth + 1 && el.scrollWidth <= el.clientWidth + 1; });
  check('phone: CPTC debrief has no horizontal overflow', overflow);
  await page.screenshot({ path: `${out}/06-debrief-phone.png` });
  check('phone debrief: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

console.log(`\n${fails ? 'FAIL' : 'OK'}  ${n - fails}/${n} checks passed`);
await browser.close();
process.exit(fails ? 1 : 0);
