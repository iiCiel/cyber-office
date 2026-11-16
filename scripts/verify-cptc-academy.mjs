// Plays every offensive Learn-mode lesson and exam through the real Kali desktop and coach, step by step.
//   CHROME_PATH=... node scripts/verify-cptc-academy.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const out = process.argv[3] || 'docs/proof/cptc-academy';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, headless: true } : { channel: 'chrome', headless: true });
let fails = 0, n = 0;
const check = (name, ok, info = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const page = await browser.newPage({ viewport: { width: 1366, height: 820 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(`console: ${m.text()}`); });
const scene = (src, arg) => page.evaluate(([s, a]) => { const x = window.__game.scene.getScene('CptcLab'); return new Function('sc', 'a', `return (async()=>{ ${s} })()`)(x, a); }, [src, arg]);
const panel = page.locator('[data-academy]');

// Model answers that pass each write step (the player writes their own; these prove each is passable).
const REM = {
  'ext-rdp': 'Close RDP 3389 at the edge firewall so it is not on the internet. Put remote access behind a VPN or RD Gateway and require MFA for every remote login.',
  'sql-injection': 'Rewrite the login with parameterized queries / prepared statements so input cannot alter the query. Use a least-privilege database account and validate input.',
  'api-idor': 'Enforce server-side object-level authorization: check the logged-in session owns the requested account id before returning it; never trust the id from the client.',
};
const EXEC = 'The hospital is at elevated risk of a patient-data breach and ransomware. Two issues stand out: Remote Desktop is open to the internet, and the patient portal login is vulnerable to SQL injection. We recommend closing both within 72 hours, which will sharply reduce the risk of a breach.';

await page.goto(`${url}?v=${Date.now()}`);
await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
await page.waitForTimeout(400);
await page.keyboard.press('t');
await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
await page.locator('.comp-card[data-mode="cptc"]').click();
await page.waitForFunction(() => window.__game.scene.isActive('CptcLab'), null, { timeout: 8000 });
await page.waitForTimeout(200);
check('Learn mode is offered on the CPTC brief', await page.locator('input[value="learn"]').count() === 1);
await page.locator('input[value="learn"]').check();
await page.locator('.kx-begin').click();
await page.waitForSelector('[data-academy]');
await page.screenshot({ path: `${out}/lessons.png` });
const ids = await page.locator('[data-lesson]').evaluateAll((e) => e.map((x) => x.dataset.lesson));
check('lessons are listed', ids.length >= 18, String(ids.length));

for (const id of ids) {
  await panel.locator('.ac-tab[data-actab="lessons"]').click();
  await panel.locator(`[data-lesson="${id}"]`).click();
  await page.waitForTimeout(80);
  for (let guard = 0; guard < 40; guard++) {
    const s = await scene(`const p = sc.coach; if (!p.lesson) return null; const st = p.step(); return { i: p.i, type: p.typed(st), ask: st.ask ? { sample: typeof st.ask.sample === 'function' ? st.ask.sample(sc.state) : st.ask.sample } : null, rate: st.rate || null, write: st.write || null, drill: !!st.drill, discovers: st.discovers || null, complete: p.complete, refL: st.rate ? p.finding(st.rate.finding).refLikelihood : null, refI: st.rate ? p.finding(st.rate.finding).refImpact : null };`);
    if (!s) break;
    const where = `${id} step ${s.i + 1}`;
    if (s.ask) { await panel.locator('[data-answer]').fill(s.ask.sample); await panel.locator('[data-check]').click(); }
    else if (s.rate) { await panel.locator(`[data-rate="likelihood:${s.refL}"]`).click(); await panel.locator(`[data-rate="impact:${s.refI}"]`).click(); }
    else if (s.write) { const ans = s.write.exec ? EXEC : (REM[s.write.finding] || 'Apply the specific control that fixes the root cause of this issue, and verify it.'); await panel.locator('[data-write]').fill(ans); await panel.locator('[data-grade]').click(); }
    else if (s.type && !s.complete) { if (s.drill) await panel.locator('[data-reveal]').click(); await scene(`sc.runLine(${JSON.stringify(s.type)})`); await scene('sc.coach.refresh();'); }
    let done = false;
    for (let w = 0; w < 20 && !done; w++) { done = await scene('sc.coach.refresh(); return sc.coach.complete;'); if (!done) await page.waitForTimeout(110); }
    if (!done) { check(`${where} completes`, false, (await panel.innerText()).replace(/\s+/g, ' ').slice(0, 200)); await page.screenshot({ path: `${out}/fail-${id}-${s.i + 1}.png` }); await scene('sc.coach.complete = true; sc.coach.drawStep();'); }
    if (id === 'recon' && s.i === 1) await page.screenshot({ path: `${out}/step-recon.png` });
    if (id === 'web-sqli' && s.rate) await page.screenshot({ path: `${out}/step-rate.png` });
    if (id === 'remediation' && s.write) await page.screenshot({ path: `${out}/step-write.png` });
    await panel.locator('[data-next]').waitFor({ timeout: 4000 });
    await panel.locator('[data-next]').click();
    await page.waitForTimeout(30);
  }
  check(`lesson finished: ${id}`, await panel.locator(`[data-lesson="${id}"].done`).count() === 1);
}

// Exams: drive the engagement via the real runLine + rating, then confirm the goals and the clock.
for (const xid of ['x-meridian', 'x-atlas', 'x-lakeshore']) {
  await panel.locator('.ac-tab[data-actab="exams"]').click();
  await panel.locator(`[data-exam="${xid}"]`).click();
  await page.waitForTimeout(100);
  const started = await panel.locator('[data-exam-clock]').isVisible();
  check(`exam starts: ${xid}`, started);
  await scene(`const x = sc.coach.exam; for (const [, cmd] of x.solutions) sc.runLine(cmd); const refs = {}; for (const f of sc.state.scenario.findings) refs[f.id] = f; for (const id of x.findings) { sc.coach.host.rate(id, 'likelihood', refs[id].refLikelihood); sc.coach.host.rate(id, 'impact', refs[id].refImpact); } sc.coach.host.setExec('The client faces a serious risk of a data breach from several confirmed issues; we recommend fixing them within two weeks to reduce the risk.'); sc.coach.refresh();`);
  for (let w = 0; w < 16; w++) { const ok = await scene('sc.coach.refresh(); return sc.coach.examGoalList().every(g => g.ok);'); if (ok) break; await page.waitForTimeout(150); }
  if (xid === 'x-meridian') await page.screenshot({ path: `${out}/exam.png` });
  const unmet = await scene('return sc.coach.examGoalList().filter(g => !g.ok).map(g => g.text).join(" | ");');
  check(`exam completes: ${xid}`, started && await panel.locator('[data-exam-done]').count() === 1, unmet || 'ok');
  await panel.locator('.ac-back').click();
}

await panel.locator('[data-actab="quiz"]').click();
for (let i = 0; i < 6; i++) {
  const sample = await scene('return sc.coach.quizItem.sample;');
  await panel.locator('[data-quiz-answer]').fill(sample);
  await panel.locator('[data-quiz-check]').click();
  check(`quiz item ${i + 1} accepts its answer`, await panel.locator('.ac-after').count() >= 1);
  if (i === 2) await page.screenshot({ path: `${out}/quiz.png` });
  await panel.locator('[data-quiz-next]').click();
}

await panel.locator('[data-actab="sheet"]').click();
await page.waitForTimeout(100);
check('cheat sheet renders', await panel.locator('.ac-sheet').count() > 3);
await page.screenshot({ path: `${out}/cheat-sheet.png` });
const html = await scene('return (await import("/cyber-office/src/data/cptcAcademy.js")).sheetHtml();');
const pp = await browser.newPage();
await pp.setContent(html);
await pp.pdf({ path: `${out}/reference-sheet.pdf`, format: 'Letter', printBackground: true, preferCSSPageSize: true });
await pp.close();

// Progress persists across a reload.
await page.reload();
await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
await page.waitForTimeout(300);
await page.keyboard.press('t');
await page.waitForFunction(() => window.__game.scene.isActive('Competitions'));
await page.locator('.comp-card[data-mode="cptc"]').click();
await page.waitForFunction(() => window.__game.scene.isActive('CptcLab'));
await page.locator('input[value="learn"]').check();
await page.locator('.kx-begin').click();
await page.waitForSelector('[data-academy]');
check('progress survives a reload', (await panel.locator('.ac-item.done').count()) === ids.length);

await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/phone.png` });
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
