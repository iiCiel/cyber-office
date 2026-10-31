// Drives the LIVE CCDC scoring engine through the REAL competition-mode UI: enters competition mode, drives the
// clock from the page (window.__game clock), and checks that the scoring engine ticks — uptime %, SLA on
// consecutive missed checks, red-team waves escalating probe->compromise, timed injects releasing + going
// overdue, and the Password Change Request gotcha. Everything is simulated.
//   node scripts/verify-ccdcengine.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const out = process.argv[3] || 'smoke-out/ccdcengine';
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

// Advance the live engine by freezing the deadline: we set the scene clock to a chosen elapsed value and call
// tickTo via the scene's own tick path by moving `deadline` back in time, then let one frame run.
async function setElapsed(page, sec) {
  await page.evaluate((s) => {
    const sc = window.__game.scene.getScene('CcdcLab');
    sc.deadline = Date.now() + (sc.state.timeLimitSec - s) * 1000;
  }, sec);
  await page.waitForTimeout(140); // let the Phaser update() loop tick the engine
}
const sb = (page) => page.evaluate(() => {
  const sc = window.__game.scene.getScene('CcdcLab');
  const e = sc.state.engine;
  return {
    sla: e.slaViolations, uptimePts: e.uptimePoints,
    probes: Object.values(e.probes).filter((p) => p === 'probed').length,
    comp: Object.values(e.probes).filter((p) => p === 'compromised').length,
    events: e.events.length, pcrBreaking: !!(e.pcr && e.pcr.breaking),
    rows: sc.state.engine.checks,
  };
});

async function toPlayCompetition(page) {
  await page.goto(url + '?v=' + Date.now());
  await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.keyboard.press('t');
  await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
  await page.waitForTimeout(200);
  await page.locator('.comp-card[data-mode="ccdc"]').click();
  await page.waitForFunction(() => window.__game.scene.isActive('CcdcLab'), null, { timeout: 8000 });
  await page.waitForTimeout(200);
  await page.locator('.cc-mode-btn', { hasText: 'Competition' }).click();
  await page.locator('.cc-go', { hasText: 'Sit down' }).click();
  await page.waitForSelector('.cc-devtabs', { timeout: 8000 });
  await page.waitForTimeout(200);
}
async function typeCmd(page, cmd) {
  const input = page.locator('.eg-input');
  await input.click(); await input.fill(cmd); await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
}
async function pickDevice(page, name) { await page.locator('.cc-devtab', { hasText: name }).click(); await page.waitForTimeout(120); }

// ======================================================================
{
  const { page, errors } = await makePage({ width: 1366, height: 900 });
  await toPlayCompetition(page);
  check('competition mode shows the live clock', await page.locator('.cc-clock').count() === 1);
  check('live scoreboard is rendered', await page.locator('.cc-live').count() === 1);

  // Let a clean round run for 5 engine-minutes: uptime points accrue, no SLA.
  await setElapsed(page, 120);
  let s = await sb(page);
  check('uptime points accrue while services are up', s.uptimePts > 0, `${s.uptimePts} pts`);
  check('no SLA violations on a clean round so far', s.sla === 0);

  // Red-team wave 1 at 180s = probes, not compromises.
  await setElapsed(page, 185);
  s = await sb(page);
  check('red-team wave 1 probes exposed findings (no compromise yet)', s.probes > 0 && s.comp === 0, `${s.probes} probes, ${s.comp} comp`);
  check('live feed logged the wave', await page.locator('.cc-feed-line').count() > 0);

  // Wave 2 at 450s = anything still open becomes a compromise.
  await setElapsed(page, 455);
  s = await sb(page);
  check('red-team wave 2 confirms compromises on what is still open', s.comp > 0, `${s.comp} compromised`);

  // Timed injects: inject 2 (HR) releases at 120s; the injects panel shows a deadline and eventually OVERDUE.
  const dueBadges = await page.locator('.cc-inj-due').count();
  check('released injects show a deadline countdown', dueBadges > 0, `${dueBadges} due badges`);
  await setElapsed(page, 120 + 300 + 10); // past inject-2 window
  check('an unanswered inject shows OVERDUE', (await page.locator('.cc-inj-due.bad', { hasText: 'OVERDUE' }).count()) > 0);

  check('no console/page errors in competition mode', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.screenshot({ path: `${out}/01-live-board.png`, fullPage: true });
}

// --- PCR gotcha: rotating the scored account breaks DB scoring until PCR filed -----------------
{
  const { page, errors } = await makePage({ width: 1366, height: 900 });
  await toPlayCompetition(page);
  await pickDevice(page, 'Database server');
  await typeCmd(page, "mysql -e \"ALTER USER 'ccdc-scorecheck'@'198.51.100.9' IDENTIFIED BY 'New#Score-2026!'\"");
  let s = await sb(page);
  check('PCR: rotating the scored account warns + sets the engine breaking flag', s.pcrBreaking === true);
  await setElapsed(page, 95); // a few checks fail
  s = await sb(page);
  check('PCR: the DB check is failing while the PCR is unfiled', s.rows.db01.fail > 0, `${s.rows.db01.fail} fails`);
  // File the PCR inject.
  const pcrCard = page.locator('.cc-inject[data-inject="pcr"]');
  if (await pcrCard.count()) {
    await pcrCard.locator('.cc-inj-ta').fill('PCR: rotate ccdc-scorecheck on db01 during the 10:30-10:35 window. Rollback: revert to the old password. New credential handed to the white team / scoring team before the change.');
    await pcrCard.locator('.cc-inj-submit').click();
    await page.waitForTimeout(120);
    s = await sb(page);
    check('PCR: filing the change request clears the breaking flag', s.pcrBreaking === false);
  } else check('PCR: inject card is available to file', false, 'pcr card not released yet');
  check('no console/page errors in PCR flow', errors.length === 0, errors.slice(0, 2).join(' | '));
}

console.log(`\n${fails ? 'FAIL' : 'OK'}  ${n - fails}/${n} checks passed`);
await browser.close();
process.exit(fails ? 1 : 0);
