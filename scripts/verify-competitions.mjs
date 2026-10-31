// Drives the two competition modes through the REAL UI (keyboard + button clicks), not scene.start:
//   Title -> press T -> Competitions hub -> click the CCDC card -> brief -> defend (fix findings + injects)
//   -> end round -> scorecard.  Then back -> CPTC card -> scope -> rate -> exec -> report.
// Verifies both guided and competition framing on CCDC, takes screenshots, asserts no console/page errors.
//   node scripts/verify-competitions.mjs [url]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5192/cyber-office/';
const out = process.argv[3] || 'smoke-out/competitions';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
let fails = 0, n = 0;
const check = (name, ok, info = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const active = (k) => page.evaluate((key) => window.__game.scene.isActive(key), k);
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });

async function toTitle() {
  await page.goto(url + '?v=' + Date.now());
  await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
  await page.waitForTimeout(500);
}

// ---------- open the hub ----------
await toTitle();
await page.keyboard.press('t');
await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
await page.waitForTimeout(400);
check('Title → T opens the Competitions hub', await active('Competitions'));
check('hub shows both CCDC and CPTC cards', (await page.locator('.comp-card[data-mode="ccdc"]').count()) === 1 && (await page.locator('.comp-card[data-mode="cptc"]').count()) === 1);
await shot('01-hub');

// ---------- CCDC guided run ----------
await page.locator('.comp-card[data-mode="ccdc"]').click();
await page.waitForFunction(() => window.__game.scene.isActive('Ccdc'), null, { timeout: 8000 });
await page.waitForTimeout(300);
check('CCDC brief shows the first-15-minute checklist', (await page.locator('#ccdc .cc-checklist li').count()) >= 4);
check('CCDC brief shows the trap list', (await page.locator('#ccdc .cc-traps li').count()) >= 4);
check('CCDC guided is the default mode', await page.locator('#ccdc .cc-mode-btn.on b').first().textContent().then((t) => /Guided/.test(t)));
await shot('02-ccdc-brief');

// Switch to Competition framing and back (prove both modes render).
await page.locator('#ccdc .cc-mode-btn', { hasText: 'Competition' }).click();
check('CCDC competition mode selectable', await page.locator('#ccdc .cc-mode-btn.on b').first().textContent().then((t) => /Competition/.test(t)));
await page.locator('#ccdc .cc-mode-btn', { hasText: 'Guided' }).click();

// Enter the workspace.
await page.locator('#ccdc .cc-go', { hasText: 'Take the keyboard' }).click();
await page.waitForTimeout(300);
check('CCDC workspace shows 4 scored-service pills', (await page.locator('#ccdc .cc-svc-pill').count()) === 4);
check('CCDC guided shows coaching lines on findings', (await page.locator('#ccdc .cc-f-teach').count()) >= 1);
const findingCount = await page.locator('#ccdc .cc-finding').count();
check('CCDC shows the finding backlog', findingCount >= 6, `${findingCount} findings`);
await shot('03-ccdc-workspace');

// Play a perfect guided round: click the known-correct action on every finding, the correct choice on every inject.
const perfect = await page.evaluate(() => {
  const sc = window.__game.scene.getScene('Ccdc');
  return {
    fixes: sc.scenario.findings.map((f) => ({ fid: f.id, aid: f.actions.find((a) => a.fixes).id })),
    injects: sc.scenario.injects.map((i) => ({ iid: i.id, cid: i.choices.find((c) => c.correct).id })),
  };
});
for (const { fid, aid } of perfect.fixes) {
  await page.locator(`#ccdc .cc-finding[data-finding="${fid}"] .cc-act[data-act="${aid}"]`).click();
  await page.waitForTimeout(40);
}
for (const { iid, cid } of perfect.injects) {
  await page.locator(`#ccdc .cc-inject[data-inject="${iid}"] .cc-inj-choice[data-choice="${cid}"]`).click();
  await page.waitForTimeout(40);
}
const allUp = await page.evaluate(() => Object.values(window.__game.scene.getScene('Ccdc').state.services).every((s) => s.state === 'up'));
check('CCDC: after correct fixes all services stay UP', allUp);
await shot('04-ccdc-fixed');

await page.locator('#ccdc .cc-endround').click();
await page.waitForTimeout(300);
const ccdcGrade = await page.locator('#ccdc .cc-grade').textContent();
check('CCDC round ends on a scorecard with a grade', !!ccdcGrade);
check('CCDC perfect guided round grades A', ccdcGrade.trim() === 'A', `grade ${ccdcGrade}`);
check('CCDC scorecard shows the uptime+injects-compromises tally', (await page.locator('#ccdc .cc-tally-row').count()) >= 4);
await shot('05-ccdc-scorecard');

// ---------- CPTC full report ----------
await page.locator('#ccdc .cc-quit', { hasText: 'Done' }).click();
await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
await page.locator('.comp-card[data-mode="cptc"]').click();
await page.waitForFunction(() => window.__game.scene.isActive('Cptc'), null, { timeout: 8000 });
await page.waitForTimeout(300);
check('CPTC opens on the scope / RoE step', (await page.locator('#cptc .cx-roe-card').count()) >= 3);
await shot('06-cptc-scope');

// Answer every RoE correctly, then advance.
const cptcData = await page.evaluate(() => {
  const sc = window.__game.scene.getScene('Cptc');
  return {
    roe: sc.scenario.roe.map((d) => ({ id: d.id, cid: d.choices.find((c) => c.correct).id })),
    findings: sc.scenario.findings.map((f) => ({ id: f.id, l: f.refLikelihood, i: f.refImpact, rid: f.remediations.find((r) => r.correct).id })),
    exec: sc.scenario.execSummaries.find((e) => e.correct).id,
  };
});
for (const { id, cid } of cptcData.roe) {
  await page.locator(`#cptc .cx-roe-card[data-roe="${id}"] .cx-choice[data-choice="${cid}"]`).click();
  await page.waitForTimeout(40);
}
await page.locator('#cptc .cx-go', { hasText: 'Rate the findings' }).click();
await page.waitForTimeout(300);
check('CPTC shows the risk matrix', (await page.locator('#cptc .cx-matrix').count()) === 1);
check('CPTC shows a finding per scored item', (await page.locator('#cptc .cx-finding').count()) === cptcData.findings.length);
await shot('07-cptc-rate');

// Set each finding's likelihood/impact to the reference and pick the correct remediation.
for (const f of cptcData.findings) {
  await page.locator(`#cptc .cx-finding[data-finding="${f.id}"] .cx-dial-label:has-text("Likelihood") + .cx-dial-btns .cx-dialbtn[data-val="${f.l}"]`).click().catch(async () => {
    await page.locator(`#cptc .cx-finding[data-finding="${f.id}"] .cx-dial`).first().locator(`.cx-dialbtn[data-val="${f.l}"]`).click();
  });
  await page.locator(`#cptc .cx-finding[data-finding="${f.id}"] .cx-dial`).nth(1).locator(`.cx-dialbtn[data-val="${f.i}"]`).click();
  await page.locator(`#cptc .cx-finding[data-finding="${f.id}"] .cx-choice[data-rem="${f.rid}"]`).click();
  await page.waitForTimeout(40);
}
await page.locator('#cptc .cx-go', { hasText: 'Write the summary' }).click();
await page.waitForTimeout(300);
check('CPTC reaches the executive-summary step', (await page.locator('#cptc .cx-exec').count()) === 3);
await page.locator(`#cptc .cx-exec[data-exec="${cptcData.exec}"] .cx-exec-pick`).click();
await shot('08-cptc-exec');

await page.locator('#cptc .cx-go', { hasText: 'Generate the report' }).click();
await page.waitForTimeout(300);
const cptcGrade = await page.locator('#cptc .cx-grade').textContent();
check('CPTC generates a graded report', !!cptcGrade);
check('CPTC perfect report grades A', cptcGrade.trim() === 'A', `grade ${cptcGrade}`);
check('CPTC report has the four scored dimensions', (await page.locator('#cptc .cx-dim').count()) === 4);
check('CPTC report findings are risk-ranked', (await page.locator('#cptc .cx-rep-row').count()) === cptcData.findings.length);
await shot('09-cptc-report');

// ---------- CCDC competition (hints off) + a losing round with traps ----------
await page.locator('#cptc .cx-quit', { hasText: 'Done' }).click();
await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
await page.locator('.comp-card[data-mode="ccdc"]').click();
await page.waitForFunction(() => window.__game.scene.isActive('Ccdc'), null, { timeout: 8000 });
await page.waitForTimeout(200);
// Switch to Competition (no hints) and enter.
await page.locator('#ccdc .cc-mode-btn', { hasText: 'Competition' }).click();
await page.locator('#ccdc .cc-go', { hasText: 'Take the keyboard' }).click();
await page.waitForTimeout(250);
check('CCDC competition mode hides the coach hints', (await page.locator('#ccdc .cc-f-teach').count()) === 0);

// A bad hardening move: the deny-all firewall trap drops a scored service immediately.
await page.locator('#ccdc .cc-finding[data-finding="firewall-anyany"] .cc-act[data-act="deny-all"]').click();
await page.waitForTimeout(150);
const droppedNow = await page.evaluate(() => Object.values(window.__game.scene.getScene('Ccdc').state.services).some((s) => s.state === 'down'));
check('CCDC: the deny-all trap drops a service (shown live)', droppedNow);
check('CCDC: a dropped-service warning flash appears', (await page.locator('#ccdc .cc-flash.bad').count()) >= 1);

// End the round having left everything else open → the red team gets in.
await page.locator('#ccdc .cc-endround').click();
await page.waitForTimeout(250);
const badGrade = await page.locator('#ccdc .cc-grade').textContent();
check('CCDC losing round does not grade A', badGrade.trim() !== 'A', `grade ${badGrade}`);
check('CCDC debrief shows how the red team got in', (await page.locator('#ccdc .cc-breaches li').count()) >= 1);
const compromises = await page.evaluate(() => window.__game.scene.getScene('Ccdc').grade.compromiseCount);
check('CCDC losing round records compromises', compromises >= 1, `${compromises} compromises`);
await shot('10-ccdc-losing-scorecard');

// ---------- CPTC weak report (inflated risk + wrong exec) ----------
await page.locator('#ccdc .cc-quit', { hasText: 'Done' }).click();
await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
await page.locator('.comp-card[data-mode="cptc"]').click();
await page.waitForFunction(() => window.__game.scene.isActive('Cptc'), null, { timeout: 8000 });
await page.waitForTimeout(200);
const weak = await page.evaluate(() => {
  const sc = window.__game.scene.getScene('Cptc');
  return {
    roe: sc.scenario.roe.map((d) => ({ id: d.id, cid: (d.choices.find((c) => !c.correct) || d.choices[1]).id })),
    findings: sc.scenario.findings.map((f) => ({ id: f.id, rid: (f.remediations.find((r) => !r.correct) || f.remediations[1]).id })),
    exec: (sc.scenario.execSummaries.find((e) => !e.correct && !e.partial)).id,
  };
});
for (const { id, cid } of weak.roe) { await page.locator(`#cptc .cx-roe-card[data-roe="${id}"] .cx-choice[data-choice="${cid}"]`).click(); await page.waitForTimeout(30); }
await page.locator('#cptc .cx-go', { hasText: 'Rate the findings' }).click();
await page.waitForTimeout(200);
// Inflate every finding to High × High and pick a weak remediation.
for (const f of weak.findings) {
  const card = page.locator(`#cptc .cx-finding[data-finding="${f.id}"]`);
  await card.locator('.cx-dial').nth(0).locator('.cx-dialbtn[data-val="High"]').click();
  await card.locator('.cx-dial').nth(1).locator('.cx-dialbtn[data-val="High"]').click();
  await card.locator(`.cx-choice[data-rem="${f.rid}"]`).click();
  await page.waitForTimeout(30);
}
await page.locator('#cptc .cx-go', { hasText: 'Write the summary' }).click();
await page.waitForTimeout(200);
await page.locator(`#cptc .cx-exec[data-exec="${weak.exec}"] .cx-exec-pick`).click();
await page.locator('#cptc .cx-go', { hasText: 'Generate the report' }).click();
await page.waitForTimeout(250);
const weakGrade = await page.locator('#cptc .cx-grade').textContent();
check('CPTC weak report does not grade A', weakGrade.trim() !== 'A', `grade ${weakGrade}`);
check('CPTC weak report flags the poor executive summary', (await page.locator('#cptc .cx-report-exec.bad, #cptc .cx-report-exec.warn').count()) >= 1);
check('CPTC weak report flags mis-rated risk rows', (await page.locator('#cptc .cx-rep-row.miss, #cptc .cx-rep-row.close').count()) >= 1);
await shot('11-cptc-weak-report');

check('no console or page errors during the whole run', errors.length === 0, errors.slice(0, 4).join(' | '));

console.log(`\n${fails === 0 ? 'ALL PASS' : 'FAILURES'}: ${n - fails}/${n} checks passed`);
await browser.close();
process.exit(fails === 0 ? 0 : 1);
