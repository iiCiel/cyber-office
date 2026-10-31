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

const GOOD_INJECTS = {
  'inv-memo': 'edge-fw 203.0.113.2 pfSense firewall; dc01 10.10.10.10 Windows Server 2019 domain controller + DNS; web01 10.10.10.20 Ubuntu Apache/WordPress web; db01 10.10.10.40 Ubuntu MySQL database; mail01 10.10.10.30 Ubuntu Postfix mail (SMTP/IMAP).',
  'new-user': 'Create a standard domain user with New-ADUser, temporary password with change at next logon, add only to the Accounting group. Least privilege: not a Domain Admin and no local admin.',
  'vendor-ftp': 'We will not open plaintext FTP (credentials cross the internet unencrypted). Instead we offer SFTP on port 22 to a dedicated, chrooted upload-only account, allow-listed to your source IP address.',
  'incident-report': 'At 09:20 this morning we found a web shell (stats.php) on web01, the WordPress web server, re-run by a root cron. We removed the file and the crontab entry. Recommend blocking PHP execution in uploads to prevent recurrence.',
  pcr: 'PCR: rotate the ccdc-scorecheck password on db01 during the 10:30-10:35 window. Rollback: revert to the old password. The new credential is handed to the white team before the change.',
};
async function submitAllInjects(page) {
  for (const [id, text] of Object.entries(GOOD_INJECTS)) {
    const card = page.locator(`.cc-inject[data-inject="${id}"]`);
    await card.locator('.cc-inj-ta').fill(text);
    await card.locator('.cc-inj-submit').click();
    await page.waitForTimeout(100);
  }
}
const injectPts = (page) => page.evaluate(() => { const s = window.__game.scene.getScene('CcdcLab').state; return Object.fromEntries(Object.entries(s.injects).map(([k, v]) => [k, v.grade ? v.grade.pts : null])); });

async function toBrief(page) {
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
  check('guided mode is untimed (no clock shown)', await page.locator('.cc-clock').count() === 0);

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
  await typeCmd(page, 'Disable-ADAccount -Identity svc-backup2');
  await typeCmd(page, "Remove-ADGroupMember -Identity 'Domain Admins' -Members svc-backup2 -Confirm:$false");
  await typeCmd(page, 'Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force');
  check('dc01: rogue admin + SMBv1 both hardened', await fixedCount(page) >= 4, `${await fixedCount(page)} fixed`);

  // --- mail01 + db01 bash ---
  await pickDevice(page, 'Mail server');
  await typeCmd(page, 'postconf -e "mynetworks=10.10.10.0/24, 127.0.0.0/8"');
  await typeCmd(page, 'cat /root/.ssh/authorized_keys');
  check('mail01: the planted root SSH key is visible via cat', /redteam@203\.0\.113\.66/.test(await termText(page)));
  await typeCmd(page, "sed -i '/redteam@/d' /root/.ssh/authorized_keys");
  await typeCmd(page, "sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config");
  await typeCmd(page, 'systemctl reload ssh');
  check('mail01: SSH backdoor hardened (key + root login + reload)', /Hardened: Planted SSH key/.test(await termText(page)));
  await pickDevice(page, 'Database server');
  await typeCmd(page, "mysql -e \"ALTER USER 'root'@'localhost' IDENTIFIED BY 'S9!cedarDBpw'\"");
  await typeCmd(page, 'ufw allow from 10.10.10.0/24 to any port 3306');
  check('mail + db hardened at the terminal', await fixedCount(page) >= 7, `${await fixedCount(page)} fixed`);

  // --- firewall rule editor: deny-first wound, then recovery ---
  await pickDevice(page, 'Edge firewall');
  await typeCmd(page, 'del 1');
  await typeCmd(page, 'default block');
  let s = await svc(page);
  check('firewall: default-block before allows drops all four scored services', Object.values(s).every((v) => v === 'down'), JSON.stringify(s));
  for (const r of ['pass tcp to web01 port 80', 'pass tcp to web01 port 443', 'pass any to dc01 port 53', 'pass tcp to mail01 port 25', 'pass tcp to mail01 port 143', 'pass tcp to mail01 port 993', 'pass tcp to db01 port 3306']) await typeCmd(page, r);
  s = await svc(page);
  check('firewall: adding the allow rules brings every service back UP', Object.values(s).every((v) => v === 'up'), JSON.stringify(s));
  check('firewall: 3306 open "from any" is NOT hardened, and the editor says why', await fixedCount(page) === 7 && /scope it with "from scoring"/.test(await termText(page)), `${await fixedCount(page)} fixed`);
  await typeCmd(page, 'pass tcp to db01 port 3306 from scoring');
  await typeCmd(page, 'del 7');
  check('all eight findings hardened by typed commands', await fixedCount(page) === 8, `${await fixedCount(page)} fixed`);

  // --- injects: blank is refused in the UI, then real answers earn full rubric points ---
  await page.locator('.cc-inject[data-inject="pcr"] .cc-inj-submit').click();
  await page.waitForTimeout(120);
  const refused = await page.evaluate(() => window.__game.scene.getScene('CcdcLab').state.injects.pcr.done === false);
  check('a blank inject is refused (shows an error, not submitted)', refused && await page.locator('.cc-inject[data-inject="pcr"] .cc-flash.bad').count() === 1);
  await submitAllInjects(page);
  const pts = await injectPts(page);
  check('rubric-complete inject answers earn full points (25 each)', Object.values(pts).every((v) => v === 25), JSON.stringify(pts));
  check('guided: the judge rubric result shows on each submitted inject', await page.locator('.cc-rubric').count() === 5);
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
  // Prove the countdown is actually LIVE: the mm:ss value decreases over a short wait.
  const t0 = await page.locator('.cc-clock-val').innerText();
  await page.waitForTimeout(1600);
  const t1 = await page.locator('.cc-clock-val').innerText();
  check('the clock is live and ticks DOWN', t0 !== t1 && /^\d+:\d\d$/.test(t1), `${t0} -> ${t1}`);
  // Shorten the deadline so the scene's own timer ends the round, like the real buzzer.
  await page.evaluate(() => { window.__game.scene.getScene('CcdcLab').deadline = Date.now() + 1500; });
  await page.waitForFunction(() => window.__game.scene.getScene('CcdcLab').phase === 'debrief', null, { timeout: 8000 });
  const breaches = await page.locator('.cc-breaches').count();
  check('timeout ends the round and the red team breaches the unfixed boxes', breaches === 1);
  check('timeout banner shown', (await page.locator('.cc-timeout').count()) === 1);
  check('competition: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// --- EVERY seat starts through the UI with zero page errors and a usable screen ---
const SEATS = [
  { label: 'Whole team', tabs: 5, ir: false },
  { label: 'Firewall / Network', tabs: 1, ir: false },
  { label: 'Windows / Active Directory', tabs: 1, ir: false },
  { label: 'Linux / Services', tabs: 1, ir: false },
  { label: 'Web / Database', tabs: 2, ir: false },
  { label: 'Incident Response', tabs: 0, ir: true },
];
for (const seat of SEATS) {
  const { page, errors } = await makePage({ width: 1366, height: 900 });
  await toBrief(page);
  await page.locator('.cc-role-btn > b', { hasText: seat.label }).click();
  await page.locator('.cc-go', { hasText: 'Sit down' }).click();
  await page.waitForFunction(() => window.__game.scene.getScene('CcdcLab').phase === 'play', null, { timeout: 8000 });
  await page.waitForTimeout(300);
  const tabs = await page.locator('.cc-devtab').count();
  if (seat.ir) {
    const ok = tabs === 0 && await page.locator('.cc-captain').count() === 1 && await page.locator('.cc-inject').count() === 5 && await page.locator('.cc-assets tbody tr').count() === 5;
    await page.screenshot({ path: `${out}/04-ir-seat-desktop.png`, fullPage: false });
    check(`seat "${seat.label}": injects-only captain desk (asset board + 5 injects, no terminal)`, ok, `${tabs} tabs`);
    // Write one inject from the desk, then end the round and check the debrief renders.
    const card = page.locator('.cc-inject[data-inject="vendor-ftp"]');
    await card.locator('.cc-inj-ta').fill('A complete written deliverable that answers the request professionally.');
    await card.locator('.cc-inj-submit').click();
    await page.waitForTimeout(150);
    const filler = await page.evaluate(() => window.__game.scene.getScene('CcdcLab').state.injects['vendor-ftp'].grade.pts);
    check('IR seat: filler inject answer earns low partial credit', filler <= 5, `${filler}/25`);
    await page.locator('.cc-inject[data-inject="pcr"] .cc-inj-ta').fill(GOOD_INJECTS.pcr);
    await page.locator('.cc-inject[data-inject="pcr"] .cc-inj-submit').click();
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${out}/04b-ir-injects-desktop.png`, fullPage: false });
    await page.locator('.cc-endround').click();
    await page.waitForSelector('.cc-inj-review', { timeout: 8000 });
    const missing = await page.locator('[data-inject-review="vendor-ftp"]').innerText();
    check('IR debrief lists each inject with its points and what was missing', /Missing:/.test(missing) && /25\/25 pts/.test(await page.locator('[data-inject-review="pcr"]').innerText()));
    await page.screenshot({ path: `${out}/05-ir-debrief-desktop.png`, fullPage: false });
  } else {
    const ok = tabs === seat.tabs && await page.locator('.eg-input').count() === 1;
    check(`seat "${seat.label}": ${seat.tabs} device tab(s) and a live terminal`, ok, `${tabs} tabs`);
  }
  check(`seat "${seat.label}": 0 page/console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

// --- Checklist-ONLY pass: click every guided checklist item (and press Enter) on every box ---
{
  const { page, errors } = await makePage({ width: 1366, height: 900 });
  await toPlay(page, { guided: true });
  const tabNames = await page.locator('.cc-devtab b').allInnerTexts();
  let clicked = 0;
  let bad = [];
  for (const name of tabNames) {
    await pickDevice(page, name);
    const n = await page.locator('.cc-check-cmd').count();
    for (let i = 0; i < n; i++) {
      const btn = page.locator('.cc-check-cmd').nth(i);
      const cmd = await btn.innerText();
      await btn.click();
      const loaded = await page.locator('.eg-input').inputValue();
      if (loaded !== cmd) bad.push(`${name}: loaded "${loaded}" for "${cmd}"`);
      await page.locator('.eg-input').press('Enter');
      await page.waitForTimeout(100);
      clicked++;
    }
  }
  const text = await page.evaluate(() => Object.values(window.__game.scene.getScene('CcdcLab').out).flat().map((l) => l.text).join('\n'));
  check('checklist click loads the exact command onto the command line', bad.length === 0, bad.slice(0, 2).join(' | '));
  check('no checklist command fails (no "not found"/"usage"/"not a rule-editor command")', !/not found|not recognized|not a rule-editor command|usage:/i.test(text));
  const s = await svc(page);
  const f = await fixedCount(page);
  const sla = await page.evaluate(() => Object.values(window.__game.scene.getScene('CcdcLab').state.services).reduce((n, x) => n + x.drops, 0));
  check(`ONLY clicking checklist items (${clicked}) reaches 8/8 hardened with all services UP and 0 SLA hits`, f === 8 && Object.values(s).every((v) => v === 'up') && sla === 0, `${f}/8 fixed, ${JSON.stringify(s)}, sla ${sla}`);
  check('checklist pass: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
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

// --- phone: the IR / captain seat ---
{
  const { page, errors } = await makePage({ width: 390, height: 844 });
  await toBrief(page);
  await page.locator('.cc-role-btn > b', { hasText: 'Incident Response' }).click();
  await page.locator('.cc-go', { hasText: 'Sit down' }).click();
  await page.waitForSelector('.cc-captain', { timeout: 8000 });
  await page.waitForTimeout(300);
  const overflow = await page.evaluate(() => { const el = document.querySelector('#ccdclab'); return { doc: document.scrollingElement.scrollWidth <= window.innerWidth + 1, box: el.scrollWidth <= el.clientWidth + 1 }; });
  check('phone: IR seat desk has no horizontal overflow', overflow.doc && overflow.box, JSON.stringify(overflow));
  await page.screenshot({ path: `${out}/06-ir-seat-phone.png` });
  check('phone IR seat: no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}

console.log(`\n${fails ? 'FAIL' : 'OK'}  ${n - fails}/${n} checks passed`);
await browser.close();
process.exit(fails ? 1 : 0);
