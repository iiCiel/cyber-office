// Drives the two competition modes through the REAL UI (keyboard + button clicks), not scene.start:
//   Title -> press T -> Competitions hub -> click the CCDC card -> brief -> defend (fix findings + injects)
//   -> end round -> scorecard.  Then back -> CPTC card -> scope -> rate -> exec -> report.
// Desktop pass (1366x900): perfect + losing paths in both modes, the guided trap -> correct fix -> service UP
// recovery, shuffled option order, competition-mode locking + no feedback + a real clock that expires, neutral
// CPTC exec labels and a player-built severity tally.
// Phone pass (390x844): hub, CCDC brief/defend/debrief and all four CPTC phases, full-page screenshots, and a
// no-horizontal-overflow check on every screen.
//   node scripts/verify-competitions.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5192/cyber-office/';
const out = process.argv[3] || 'smoke-out/competitions';
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

async function toTitle(page) {
  await page.goto(url + '?v=' + Date.now());
  await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
  await page.waitForTimeout(500);
}
async function toHub(page) {
  await page.keyboard.press('t');
  await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
  await page.waitForTimeout(300);
}
async function openCard(page, mode, scene) {
  await page.locator(`.comp-card[data-mode="${mode}"]`).click();
  await page.waitForFunction((k) => window.__game.scene.isActive(k), scene, { timeout: 8000 });
  await page.waitForTimeout(250);
}
async function backToHub(page, rootSel, cls) {
  await page.locator(`${rootSel} ${cls}`, { hasText: 'Done' }).click();
  await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
  await page.waitForTimeout(200);
}
const svcStates = (page) => page.evaluate(() => Object.fromEntries(Object.values(window.__game.scene.getScene('Ccdc').state.services).map((s) => [s.id, s.state])));

// The overlays are position:fixed and scroll internally, so a plain fullPage screenshot would only show one
// screen. Temporarily let the active overlay grow to its full content height, shoot the whole page, restore.
async function fullShot(page, sel, path) {
  // Grow the viewport HEIGHT (width unchanged, so the layout is identical) until the overlay's whole content fits
  // without scrolling, take the shot, then restore the phone viewport.
  const vp = page.viewportSize();
  const need = await page.evaluate((s) => {
    const el = document.querySelector(s);
    const k = el.getBoundingClientRect().width / el.offsetWidth || 1;
    return Math.ceil(el.scrollHeight * k) + 4;
  }, sel);
  await page.setViewportSize({ width: vp.width, height: Math.max(vp.height, Math.min(need, 16000)) });
  await page.waitForTimeout(400);
  await page.screenshot({ path });
  await page.setViewportSize(vp);
  await page.waitForTimeout(300);
}

// No horizontal overflow: neither the document nor the overlay (nor any child poking out of it) is wider than the screen.
async function noOverflow(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    const docOk = document.scrollingElement.scrollWidth <= window.innerWidth;
    const inner = el ? el.scrollWidth <= el.clientWidth + 1 : true;
    const r = el?.getBoundingClientRect();
    const boxOk = r ? r.right <= window.innerWidth + 1 && r.left >= -1 : true;
    return { ok: docOk && inner && boxOk, doc: `${document.scrollingElement.scrollWidth}/${window.innerWidth}`, inner: el ? `${el.scrollWidth}/${el.clientWidth}` : '-' };
  }, sel);
}

// ======================================================================
// DESKTOP PASS
// ======================================================================
console.log('\n=== Desktop 1366x900 ===');
{
  const { page, errors } = await makePage({ width: 1366, height: 900 });
  const active = (k) => page.evaluate((key) => window.__game.scene.isActive(key), k);
  const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });

  await toTitle(page);
  await toHub(page);
  check('Title → T opens the Competitions hub', await active('Competitions'));
  check('hub shows both CCDC and CPTC cards', (await page.locator('.comp-card[data-mode="ccdc"]').count()) === 1 && (await page.locator('.comp-card[data-mode="cptc"]').count()) === 1);
  await shot('01-hub');

  // ---------- CCDC guided ----------
  await openCard(page, 'ccdc', 'Ccdc');
  check('CCDC brief shows the first-15-minute checklist', (await page.locator('#ccdc .cc-checklist li').count()) >= 4);
  check('CCDC brief shows the trap list', (await page.locator('#ccdc .cc-traps li').count()) >= 4);
  check('CCDC guided is the default mode', /Guided/.test(await page.locator('#ccdc .cc-mode-btn.on b').first().textContent()));
  check('CCDC competition button advertises a real clock', /15-minute clock/.test(await page.locator('#ccdc .cc-mode-btn').nth(1).textContent()));
  await shot('02-ccdc-brief');

  await page.locator('#ccdc .cc-go', { hasText: 'Take the keyboard' }).click();
  await page.waitForTimeout(300);
  check('CCDC workspace shows 4 scored-service pills', (await page.locator('#ccdc .cc-svc-pill').count()) === 4);
  check('CCDC guided shows coaching lines on findings', (await page.locator('#ccdc .cc-f-teach').count()) >= 1);
  check('CCDC guided has no clock', (await page.locator('#ccdc .cc-clock').count()) === 0);

  // Shuffle visible in the real DOM: the correct button is not always first.
  const domIdx = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Ccdc');
    return sc.scenario.findings.map((f) => {
      const right = f.actions.find((a) => a.fixes).id;
      return [...document.querySelectorAll(`#ccdc .cc-finding[data-finding="${f.id}"] .cc-act`)].findIndex((b) => b.dataset.act === right);
    });
  });
  check('CCDC: correct fix button is not always the top one (shuffled)', domIdx.some((i) => i > 0) && domIdx.every((i) => i >= 0), `indexes ${domIdx.join(',')}`);

  // Trap -> correct fix -> service back UP (guided).
  await page.locator('#ccdc .cc-finding[data-finding="firewall-anyany"] .cc-act[data-act="deny-all"]').click();
  await page.waitForTimeout(150);
  let st = await svcStates(page);
  check('CCDC guided: deny-all drops ALL FOUR scored services', Object.values(st).every((s) => s === 'down'), JSON.stringify(st));
  check('CCDC guided: pinned service bar shows 4 DOWN pills', (await page.locator('#ccdc .cc-svc-pill.down').count()) === 4);
  check('CCDC guided: trap flash is red and names the dropped services', (await page.locator('#ccdc .cc-finding[data-finding="firewall-anyany"] .cc-flash.bad').textContent()).includes('DOWN now'));
  await page.evaluate(() => document.querySelector('#ccdc .cc-finding[data-finding="firewall-anyany"]').scrollIntoView({ block: 'end' }));
  await shot('03a-ccdc-trap-all-down');
  await page.locator('#ccdc .cc-finding[data-finding="firewall-anyany"] .cc-act[data-act="allow-then-deny"]').click();
  await page.waitForTimeout(150);
  st = await svcStates(page);
  check('CCDC guided: correct firewall fix brings all four back UP', Object.values(st).every((s) => s === 'up'), JSON.stringify(st));
  check('CCDC guided: pinned service bar shows 4 UP pills again', (await page.locator('#ccdc .cc-svc-pill.up').count()) === 4);
  check('CCDC guided: fix flash says "Back UP"', (await page.locator('#ccdc .cc-finding[data-finding="firewall-anyany"] .cc-flash.ok').textContent()).includes('Back UP'));
  await page.evaluate(() => document.querySelector('#ccdc .cc-finding[data-finding="firewall-anyany"]').scrollIntoView({ block: 'end' }));
  await shot('03b-ccdc-fixed-all-up');

  // Misfix that drops nothing gets the red tone now (tone bug fixed).
  await page.locator('#ccdc .cc-finding[data-finding="web-admin-default"] .cc-act[data-act="rename-admin"]').click();
  await page.waitForTimeout(100);
  check('CCDC guided: a misfix with no outage is shown red (bad), not amber', (await page.locator('#ccdc .cc-finding[data-finding="web-admin-default"] .cc-flash.bad').count()) === 1);

  // MySQL: rotate-only drops web01; proper restores it.
  await page.locator('#ccdc .cc-finding[data-finding="mysql-exposed"] .cc-act[data-act="rotate-only"]').click();
  await page.waitForTimeout(100);
  check('CCDC guided: rotate-only drops the website', (await svcStates(page)).web01 === 'down');

  // Now play the rest perfectly.
  const perfect = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Ccdc');
    return {
      fixes: sc.scenario.findings.map((f) => ({ fid: f.id, aid: f.actions.find((a) => a.fixes).id })),
      injects: sc.scenario.injects.map((i) => ({ iid: i.id, cid: i.choices.find((c) => c.correct).id })),
    };
  });
  for (const { fid, aid } of perfect.fixes) {
    const btn = page.locator(`#ccdc .cc-finding[data-finding="${fid}"] .cc-act[data-act="${aid}"]`);
    if (await btn.isEnabled()) await btn.click();
    await page.waitForTimeout(40);
  }
  for (const { iid, cid } of perfect.injects) {
    await page.locator(`#ccdc .cc-inject[data-inject="${iid}"] .cc-inj-choice[data-choice="${cid}"]`).click();
    await page.waitForTimeout(40);
  }
  st = await svcStates(page);
  check('CCDC guided: after correcting every trap all services are UP', Object.values(st).every((s) => s === 'up'), JSON.stringify(st));
  await shot('04-ccdc-fixed');

  await page.locator('#ccdc .cc-endround').click();
  await page.waitForTimeout(300);
  const g1 = await page.evaluate(() => window.__game.scene.getScene('Ccdc').grade);
  check('CCDC round ends on a scorecard with a grade', (await page.locator('#ccdc .cc-grade').count()) === 1);
  check('CCDC recovered round: full uptime, 0 compromises, SLA penalty for the 5 outages', g1.servicePts === g1.serviceMax && g1.compromiseCount === 0 && g1.slaCount === 5, `sla ${g1.slaCount} pct ${g1.pct}`);
  check('CCDC scorecard shows uptime + injects − SLA − compromises', (await page.locator('#ccdc .cc-tally-row').count()) >= 5);
  await shot('05-ccdc-scorecard');

  // ---------- CPTC guided, perfect ----------
  await backToHub(page, '#ccdc', '.cc-quit');
  await openCard(page, 'cptc', 'Cptc');
  check('CPTC opens on the scope / RoE step with a mode choice', (await page.locator('#cptc .cx-roe-card').count()) >= 3 && (await page.locator('#cptc .cx-mode-btn').count()) === 2);
  await shot('06-cptc-scope');
  const cptcData = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Cptc');
    return {
      roe: sc.scenario.roe.map((d) => ({ id: d.id, cid: d.choices.find((c) => c.correct).id })),
      findings: sc.scenario.findings.map((f) => ({ id: f.id, l: f.refLikelihood, i: f.refImpact, rid: f.remediations.find((r) => r.correct).id })),
      exec: sc.scenario.execSummaries.find((e) => e.correct).id,
      labels: sc.scenario.execSummaries.map((e) => e.label),
    };
  });
  const roeIdx = await page.evaluate((roe) => roe.map(({ id, cid }) => [...document.querySelectorAll(`#cptc .cx-roe-card[data-roe="${id}"] .cx-choice`)].findIndex((b) => b.dataset.choice === cid)), cptcData.roe);
  for (const { id, cid } of cptcData.roe) { await page.locator(`#cptc .cx-roe-card[data-roe="${id}"] .cx-choice[data-choice="${cid}"]`).click(); await page.waitForTimeout(40); }
  check('CPTC guided: RoE feedback shown after a pick', (await page.locator('#cptc .cx-flash.ok').count()) === 3);
  await page.locator('#cptc .cx-go', { hasText: 'Rate the findings' }).click();
  await page.waitForTimeout(300);
  check('CPTC shows the risk matrix', (await page.locator('#cptc .cx-matrix').count()) === 1);
  const remIdx = await page.evaluate((fs_) => fs_.map(({ id, rid }) => [...document.querySelectorAll(`#cptc .cx-finding[data-finding="${id}"] .cx-choice`)].findIndex((b) => b.dataset.rem === rid)), cptcData.findings);
  check('CPTC: correct RoE/remediation is not always the top button (shuffled)', [...roeIdx, ...remIdx].some((i) => i > 0), `roe ${roeIdx} rem ${remIdx}`);
  await shot('07-cptc-rate');
  for (const f of cptcData.findings) {
    const card = page.locator(`#cptc .cx-finding[data-finding="${f.id}"]`);
    await card.locator('.cx-dial').nth(0).locator(`.cx-dialbtn[data-val="${f.l}"]`).click();
    await card.locator('.cx-dial').nth(1).locator(`.cx-dialbtn[data-val="${f.i}"]`).click();
    await card.locator(`.cx-choice[data-rem="${f.rid}"]`).click();
    await page.waitForTimeout(40);
  }
  await page.locator('#cptc .cx-go', { hasText: 'Write the summary' }).click();
  await page.waitForTimeout(300);
  check('CPTC reaches the executive-summary step', (await page.locator('#cptc .cx-exec').count()) === 3);
  const execLabels = await page.locator('#cptc .cx-exec-label').allTextContents();
  check('CPTC exec options show neutral labels Summary A/B/C', execLabels.map((t) => t.trim()).join('|') === 'Summary A|Summary B|Summary C', execLabels.join('|'));
  const execPageText = await page.locator('#cptc').textContent();
  check('CPTC exec step does not leak grading labels', cptcData.labels.every((l) => !execPageText.includes(l)));
  await page.locator(`#cptc .cx-exec[data-exec="${cptcData.exec}"] .cx-exec-pick`).click();
  await shot('08-cptc-exec');
  await page.locator('#cptc .cx-go', { hasText: 'Generate the report' }).click();
  await page.waitForTimeout(300);
  check('CPTC perfect report grades A', (await page.locator('#cptc .cx-grade').textContent()).trim() === 'A');
  check('CPTC report has the four scored dimensions', (await page.locator('#cptc .cx-dim').count()) === 4);
  check('CPTC report reveals the exec grading label', (await page.locator('#cptc .cx-exec-reveal').textContent()).includes('Business-risk framing'));
  await shot('09-cptc-report');

  // ---------- CCDC competition: lock, no feedback, clock, expiry ----------
  await backToHub(page, '#cptc', '.cx-quit');
  await openCard(page, 'ccdc', 'Ccdc');
  await page.locator('#ccdc .cc-mode-btn').nth(1).click();
  await page.locator('#ccdc .cc-go', { hasText: 'Take the keyboard' }).click();
  await page.waitForTimeout(300);
  check('CCDC competition hides the coach hints', (await page.locator('#ccdc .cc-f-teach').count()) === 0);
  const clock1 = await page.locator('#ccdc .cc-clock-val').textContent();
  check('CCDC competition shows a countdown starting at 15:00', /^1[45]:\d\d$/.test(clock1.trim()), clock1);
  await page.waitForTimeout(2200);
  const clock2 = await page.locator('#ccdc .cc-clock-val').textContent();
  check('CCDC competition clock is actually counting down', clock2 !== clock1, `${clock1} -> ${clock2}`);

  await page.locator('#ccdc .cc-finding[data-finding="mysql-exposed"] .cc-act[data-act="localhost"]').click();
  await page.waitForTimeout(150);
  const card = page.locator('#ccdc .cc-finding[data-finding="mysql-exposed"]');
  check('CCDC competition: finding locks after one pick (all buttons disabled)', (await card.locator('.cc-act:enabled').count()) === 0);
  const flashText = await card.locator('.cc-flash').textContent();
  check('CCDC competition: no right/wrong or "why" text after the pick', /submitted and locked/.test(flashText) && !/trap|Right\.|localhost-only/i.test(flashText), flashText);
  check('CCDC competition: no green/red verdict tags on the card', (await card.locator('.cc-tag.ok, .cc-tag.bad, .cc-flash.ok, .cc-flash.bad').count()) === 0);
  const inj = await page.evaluate(() => { const i = window.__game.scene.getScene('Ccdc').scenario.injects[0]; return { id: i.id, wrong: i.choices.find((c) => !c.correct).id }; });
  await page.locator(`#ccdc .cc-inject[data-inject="${inj.id}"] .cc-inj-choice[data-choice="${inj.wrong}"]`).click();
  await page.waitForTimeout(100);
  check('CCDC competition: inject locks after one submission', (await page.locator(`#ccdc .cc-inject[data-inject="${inj.id}"] .cc-inj-choice:enabled`).count()) === 0);
  await shot('10a-ccdc-competition-locked');

  // Let the real clock run out (fast-forward the deadline; the scene's own timer ends the round).
  await page.evaluate(() => { window.__game.scene.getScene('Ccdc').deadline = Date.now() + 1500; });
  await page.waitForFunction(() => window.__game.scene.getScene('Ccdc').phase === 'debrief', null, { timeout: 6000 }).catch(() => {});
  check('CCDC competition: clock expiry ends the round on its own', (await page.locator('#ccdc .cc-grade').count()) === 1);
  check('CCDC competition: debrief says time ran out', (await page.locator('#ccdc .cc-timeout').count()) === 1);
  const g2 = await page.evaluate(() => window.__game.scene.getScene('Ccdc').grade);
  check('CCDC timed-out round: red team ran and found the open holes', g2.compromiseCount >= 7 && g2.letter !== 'A', `${g2.compromiseCount} compromises, ${g2.letter}`);
  check('CCDC debrief now reveals the why for the locked pick', (await page.locator('#ccdc .cc-review').first().textContent()).includes('Classic trap'));
  await shot('10b-ccdc-timeout-scorecard');

  // ---------- CPTC competition: weak report + clock ----------
  await backToHub(page, '#ccdc', '.cc-quit');
  await openCard(page, 'cptc', 'Cptc');
  await page.locator('#cptc .cx-mode-btn[data-mode="competition"]').click();
  await page.waitForTimeout(200);
  check('CPTC competition shows a 10:00 countdown', /^(10:00|9:5\d)$/.test((await page.locator('#cptc .cc-clock-val').textContent()).trim()));
  const weak = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Cptc');
    return {
      roe: sc.scenario.roe.map((d) => ({ id: d.id, cid: d.choices.find((c) => !c.correct).id })),
      findings: sc.scenario.findings.map((f) => ({ id: f.id, rid: f.remediations.find((r) => !r.correct).id })),
      exec: sc.scenario.execSummaries.find((e) => !e.correct && !e.partial).id,
    };
  });
  for (const { id, cid } of weak.roe) { await page.locator(`#cptc .cx-roe-card[data-roe="${id}"] .cx-choice[data-choice="${cid}"]`).click(); await page.waitForTimeout(30); }
  check('CPTC competition: RoE picks give no right/wrong feedback', (await page.locator('#cptc .cx-flash.ok, #cptc .cx-flash.bad, #cptc .cx-flash.warn').count()) === 0 && (await page.locator('#cptc .cx-flash.sub').count()) === 3);
  await page.locator('#cptc .cx-go', { hasText: 'Rate the findings' }).click();
  await page.waitForTimeout(200);
  for (const f of weak.findings) {
    const c = page.locator(`#cptc .cx-finding[data-finding="${f.id}"]`);
    await c.locator('.cx-dial').nth(0).locator('.cx-dialbtn[data-val="High"]').click();
    await c.locator('.cx-dial').nth(1).locator('.cx-dialbtn[data-val="High"]').click();
    await c.locator(`.cx-choice[data-rem="${f.rid}"]`).click();
    await page.waitForTimeout(30);
  }
  await page.locator('#cptc .cx-go', { hasText: 'Write the summary' }).click();
  await page.waitForTimeout(200);
  const tally = (await page.locator('#cptc .cx-tally').textContent()).trim();
  check('CPTC "findings at a glance" counts the PLAYER\'s ratings (5 inflated Criticals)', tally === `${weak.findings.length} Critical`, tally);
  await page.locator(`#cptc .cx-exec[data-exec="${weak.exec}"] .cx-exec-pick`).click();
  await shot('11a-cptc-competition-exec');
  await page.evaluate(() => { window.__game.scene.getScene('Cptc').deadline = Date.now() + 1200; });
  await page.waitForFunction(() => window.__game.scene.getScene('Cptc').state.phase === 'report', null, { timeout: 6000 }).catch(() => {});
  check('CPTC competition: clock expiry hands the report in on its own', (await page.locator('#cptc .cx-grade').count()) === 1 && (await page.locator('#cptc .cc-timeout').count()) === 1);
  check('CPTC weak report does not grade A', (await page.locator('#cptc .cx-grade').textContent()).trim() !== 'A');
  check('CPTC weak report flags mis-rated risk rows', (await page.locator('#cptc .cx-rep-row.miss, #cptc .cx-rep-row.close').count()) >= 1);
  await shot('11b-cptc-weak-report');

  check('desktop: no console or page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  await page.close();
}

// ======================================================================
// PHONE PASS 390x844
// ======================================================================
console.log('\n=== Phone 390x844 ===');
{
  const { page, errors } = await makePage({ width: 390, height: 844 });
  const m = (name) => `${out}/m-${name}.png`;
  const phoneScreen = async (label, sel, file) => {
    const o = await noOverflow(page, sel);
    check(`390px ${label}: no horizontal overflow`, o.ok, `doc ${o.doc}, overlay ${o.inner}`);
    check(`390px ${label}: readable upright (no rotate prompt covering it)`, !(await page.locator('#rotate').isVisible()));
    await fullShot(page, sel, m(file));
  };

  await toTitle(page);
  await toHub(page);
  await phoneScreen('hub', '.comp-screen', '01-hub');

  await openCard(page, 'ccdc', 'Ccdc');
  await phoneScreen('CCDC brief', '#ccdc', '02-ccdc-brief');
  await page.locator('#ccdc .cc-mode-btn').nth(1).click();
  await page.locator('#ccdc .cc-go', { hasText: 'Take the keyboard' }).click();
  await page.waitForTimeout(300);
  await page.locator('#ccdc .cc-finding[data-finding="firewall-anyany"] .cc-act[data-act="deny-all"]').click();
  await page.waitForTimeout(150);
  check('390px CCDC defend: clock visible', await page.locator('#ccdc .cc-clock').isVisible());
  await phoneScreen('CCDC defend (competition)', '#ccdc', '03-ccdc-defend');
  await page.locator('#ccdc .cc-endround').click();
  await page.waitForTimeout(300);
  await phoneScreen('CCDC debrief', '#ccdc', '04-ccdc-debrief');

  await backToHub(page, '#ccdc', '.cc-quit');
  await openCard(page, 'cptc', 'Cptc');
  await phoneScreen('CPTC scope', '#cptc', '05-cptc-scope');
  const d = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Cptc');
    return { roe: sc.scenario.roe.map((x) => ({ id: x.id, cid: x.choices.find((c) => c.correct).id })), findings: sc.scenario.findings.map((f) => ({ id: f.id, l: f.refLikelihood, i: f.refImpact, rid: f.remediations.find((r) => r.correct).id })), exec: sc.scenario.execSummaries.find((e) => e.correct).id };
  });
  for (const { id, cid } of d.roe) await page.locator(`#cptc .cx-roe-card[data-roe="${id}"] .cx-choice[data-choice="${cid}"]`).click();
  await page.locator('#cptc .cx-go', { hasText: 'Rate the findings' }).click();
  await page.waitForTimeout(250);
  for (const f of d.findings) {
    const c = page.locator(`#cptc .cx-finding[data-finding="${f.id}"]`);
    await c.locator('.cx-dial').nth(0).locator(`.cx-dialbtn[data-val="${f.l}"]`).click();
    await c.locator('.cx-dial').nth(1).locator(`.cx-dialbtn[data-val="${f.i}"]`).click();
    await c.locator(`.cx-choice[data-rem="${f.rid}"]`).click();
  }
  await page.evaluate(() => { const r = document.querySelector('#cptc'); r.scrollTop = 0; });
  await phoneScreen('CPTC rate', '#cptc', '06-cptc-rate');
  await page.locator('#cptc .cx-go', { hasText: 'Write the summary' }).click();
  await page.waitForTimeout(250);
  await page.locator(`#cptc .cx-exec[data-exec="${d.exec}"] .cx-exec-pick`).click();
  await phoneScreen('CPTC exec', '#cptc', '07-cptc-exec');
  await page.locator('#cptc .cx-go', { hasText: 'Generate the report' }).click();
  await page.waitForTimeout(300);
  check('390px CPTC report grades A', (await page.locator('#cptc .cx-grade').textContent()).trim() === 'A');
  await phoneScreen('CPTC report', '#cptc', '08-cptc-report');

  check('phone: no console or page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  await page.close();
}

console.log(`\n${fails === 0 ? 'ALL PASS' : 'FAILURES'}: ${n - fails}/${n} checks passed`);
await browser.close();
process.exit(fails === 0 ? 0 : 1);
