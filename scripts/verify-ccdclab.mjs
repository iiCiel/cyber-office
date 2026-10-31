// Drives the HANDS-ON CCDC mode through the REAL UI (keyboard typing + button clicks), not scene.start:
//   Title -> T -> Compete hub -> click the CCDC card -> role/mode brief -> "Sit down" -> play.
// Then it TYPES real commands into each device's terminal and checks the scored-service bar reacts, proves the
// firewall deny-first wound + recovery, runs a full clean round to an A, and shoots desktop + phone screenshots.
//   node scripts/verify-ccdclab.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5193/cyber-office/';
const out = process.argv[3] || 'smoke-out/ccdclab';
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
const svc = (page) => page.evaluate(() => Object.fromEntries(Object.values(window.__game.scene.getScene('CcdcLab').state.services).map((s) => [s.id, s.state])));
const fixedCount = (page) => page.evaluate(() => { const s = window.__game.scene.getScene('CcdcLab').state; return s.findingList.filter((f) => s.findings[f.id].status === 'fixed').length; });

async function toPlay(page, { guided = true } = {}) {
  await page.goto(url + '?v=' + Date.now());
  await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.keyboard.press('t');
  await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
  await page.waitForTimeout(250);
  await page.locator('.comp-card[data-mode="ccdc"]').click();
  await page.waitForFunction(() => window.__game.scene.isActive('CcdcLab'), null, { timeout: 8000 });
  await page.waitForTimeout(250);
  if (!guided) await page.locator('.cc-mode-btn', { hasText: 'Competition' }).click();
  await page.locator('.cc-go', { hasText: 'Sit down' }).click();
  await page.waitForSelector('.cc-devtabs', { timeout: 8000 });
  await page.waitForTimeout(250);
}

async function pickDevice(page, name) {
  await page.locator('.cc-devtab', { hasText: name }).click();
  await page.waitForTimeout(150);
}
async function typeCmd(page, cmd) {
  const input = page.locator('.eg-input');
  await input.click();
  await input.fill(cmd);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
}
const termText = (page) => page.locator('.eg-out').innerText();

// ======================================================================
{
  const { page, errors } = await makePage({ width: 1366, height: 900 });
  await toPlay(page, { guided: true });
  check('CCDC hands-on: play screen reached with device tabs', await page.locator('.cc-devtab').count() >= 5, `${await page.locator('.cc-devtab').count()} tabs`);

  // --- web01 bash: inspect, then fix the default password + the backdoor ---
  await pickDevice(page, 'Web server');
  await typeCmd(page, 'cat /var/www/html/wp-config.php');
  check('web01: cat shows the real wp-config (inspection via real bash engine)', /DB_HOST/.test(await termText(page)));
  await typeCmd(page, "wp user update admin --user_pass 'Xk7#freightLANE!'");
  check('web01: wp-cli hardening command is recognised as a fix', /Hardened: WordPress admin/.test(await termText(page)));
  await typeCmd(page, 'rm /var/www/html/wp-content/uploads/2026/10/stats.php');
  await typeCmd(page, 'crontab -r');
  check('web01: web shell cleared only after BOTH file and cron removed', /Hardened: Web shell/.test(await termText(page)));

  // --- dc01 PowerShell: inspect AD + SMB, fix rogue admin + SMBv1 ---
  await pickDevice(page, 'Domain controller');
  await typeCmd(page, "Get-ADGroupMember 'Domain Admins'");
  check('dc01: Get-ADGroupMember lists the rogue svc-backup2 (real pwsh engine)', /svc-backup2/.test(await termText(page)));
  await typeCmd(page, "Remove-ADGroupMember -Identity 'Domain Admins' -Members svc-backup2 -Confirm:$false");
  await typeCmd(page, 'Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force');
  check('dc01: rogue admin + SMBv1 both hardened', await fixedCount(page) >= 4, `${await fixedCount(page)} fixed`);

  // --- mail01 + db01 bash ---
  await pickDevice(page, 'Mail server');
  await typeCmd(page, 'postconf -e "mynetworks=10.10.10.0/24, 127.0.0.0/8"');
  await pickDevice(page, 'Database server');
  await typeCmd(page, "mysql -e \"ALTER USER 'root'@'localhost' IDENTIFIED BY 'S9!cedarDBpw'\"");
  await typeCmd(page, 'ufw allow from 10.10.10.0/24 to any port 3306');
  check('mail + db hardened at the terminal', await fixedCount(page) >= 6, `${await fixedCount(page)} fixed`);

  // --- firewall rule editor: deny-first wound, then recovery ---
  await pickDevice(page, 'Edge firewall');
  await typeCmd(page, 'del 1');
  await typeCmd(page, 'default block');
  let s = await svc(page);
  check('firewall: default-block before allows drops all four scored services', Object.values(s).every((v) => v === 'down'), JSON.stringify(s));
  for (const r of ['pass tcp to web01 port 80', 'pass tcp to web01 port 443', 'pass any to dc01 port 53', 'pass tcp to mail01 port 25', 'pass tcp to mail01 port 143', 'pass tcp to mail01 port 993', 'pass tcp to db01 port 3306']) await typeCmd(page, r);
  s = await svc(page);
  check('firewall: adding the allow rules brings every service back UP', Object.values(s).every((v) => v === 'up'), JSON.stringify(s));
  check('all seven findings hardened by typed commands', await fixedCount(page) === 7, `${await fixedCount(page)} fixed`);

  // --- submit every inject (worth real points), end the round, read the scorecard ---
  while (await page.locator('.cc-inj-submit').count()) {
    const ta = page.locator('.cc-inj-ta').first();
    await ta.fill('A complete written deliverable: host/IP/OS/role/service, least-privilege account, secure SFTP alternative, structured incident report, full PCR.');
    await page.locator('.cc-inj-submit').first().click();
    await page.waitForTimeout(120);
  }
  await page.screenshot({ path: `${out}/01-play-desktop.png` });
  await page.locator('.cc-endround').click();
  await page.waitForSelector('.cc-grade', { timeout: 8000 });
  const grade = await page.locator('.cc-grade').innerText();
  check('clean round with no compromises scores an A', grade.trim() === 'A', `grade ${grade}`);
  check('no breaches panel after a clean round', await page.locator('.cc-breaches').count() === 0);
  await page.screenshot({ path: `${out}/02-debrief-desktop.png` });
  check('desktop: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// --- competition clock: a losing round that times out ---
{
  const { page, errors } = await makePage({ width: 1366, height: 900 });
  await toPlay(page, { guided: false });
  check('competition mode shows a live clock', await page.locator('.cc-clock').count() === 1);
  // Shorten the deadline so the scene's own timer ends the round, like the real buzzer.
  await page.evaluate(() => { window.__game.scene.getScene('CcdcLab').deadline = Date.now() + 1500; });
  await page.waitForFunction(() => window.__game.scene.getScene('CcdcLab').phase === 'debrief', null, { timeout: 8000 });
  const breaches = await page.locator('.cc-breaches').count();
  check('timeout ends the round and the red team breaches the unfixed boxes', breaches === 1);
  check('timeout banner shown', (await page.locator('.cc-timeout').count()) === 1);
  check('competition: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// --- role seat: Network seat shows only the firewall ---
{
  const { page, errors } = await makePage({ width: 1366, height: 900 });
  await page.goto(url + '?v=' + Date.now());
  await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.keyboard.press('t');
  await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
  await page.waitForTimeout(200);
  await page.locator('.comp-card[data-mode="ccdc"]').click();
  await page.waitForFunction(() => window.__game.scene.isActive('CcdcLab'), null, { timeout: 8000 });
  await page.waitForTimeout(200);
  await page.locator('.cc-role-btn', { hasText: 'Firewall / Network' }).click();
  await page.locator('.cc-go', { hasText: 'Sit down' }).click();
  await page.waitForSelector('.cc-devtabs', { timeout: 8000 });
  check('Network seat owns exactly one device (the firewall)', await page.locator('.cc-devtab').count() === 1, `${await page.locator('.cc-devtab').count()} tabs`);
  check('role seat: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// --- phone ---
{
  const { page, errors } = await makePage({ width: 390, height: 844 });
  await toPlay(page, { guided: true });
  await pickDevice(page, 'Web server');
  await typeCmd(page, "wp user update admin --user_pass 'Xk7#freightLANE!'");
  check('phone: typing on a box works and hardens the finding', /Hardened/.test(await termText(page)));
  const overflow = await page.evaluate(() => { const el = document.querySelector('#ccdclab'); return { doc: document.scrollingElement.scrollWidth <= window.innerWidth + 1, box: el.scrollWidth <= el.clientWidth + 1 }; });
  check('phone: no horizontal overflow on the play screen', overflow.doc && overflow.box, JSON.stringify(overflow));
  await page.screenshot({ path: `${out}/03-play-phone.png` });
  check('phone: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

console.log(`\n${fails ? 'FAIL' : 'OK'}  ${n - fails}/${n} checks passed`);
await browser.close();
process.exit(fails ? 1 : 0);
