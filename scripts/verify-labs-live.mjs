// Live-site check for the 4 practice labs, driven through real UI input (keyboard + mouse clicks on the
// actual buttons, not scene.start): Title -> press F -> Case Files -> click "⚔ Red team it" on each lab card,
// play the drill to its debrief -> back to Case Files -> click "📝 Write the report", Begin, rate every finding
// from the on-screen rubric, Generate. Screenshots per lab + the title screen at 1366x768 and phone landscape.
//   node scripts/verify-labs-live.mjs https://iiciel.github.io/cyber-office/
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'https://iiciel.github.io/cyber-office/';
const out = process.argv[3] || 'smoke-out/labs-live';
fs.mkdirSync(out, { recursive: true });
const LABS = [
  ['halcyon-ad-2026', 'ad'],
  ['halcyon-aws-2026', 'aws'],
  ['halcyon-linux-2026', 'linux'],
  ['halcyon-bec-2026', 'bec'],
];
// Card titles (each lab's caseFile.title) so the right card is clicked.
const LAB_TITLES = {
  'halcyon-ad-2026': 'The service account that knew too much',
  'halcyon-aws-2026': 'The key on GitHub',
  'halcyon-linux-2026': 'The upload that uploaded itself',
  'halcyon-bec-2026': 'The invoice that changed banks',
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let fails = 0, n = 0;
const check = (name, ok, info = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const isActive = (k) => page.evaluate((key) => window.__game.scene.isActive(key), k);

async function toTitle() {
  await page.goto(url + '?v=' + Date.now());
  await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
  await page.waitForTimeout(600);
}
async function titleShot(label) {
  await toTitle();
  const sub = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Title');
    const t = sc.children.list.find((o) => o.type === 'Text' && /pentests/.test(o.text));
    if (!t) return null;
    const b = t.getBounds();
    // The case board starts at x=590 in base coordinates; the sub must end before it.
    return { text: t.text, right: Math.round(b.right), boardX: 590 };
  });
  check(`title @${label}: Red team sub names all 5 pentests and fits`, !!sub && /web SQLi/.test(sub.text) && /AWS/.test(sub.text) && /AD/.test(sub.text) && sub.right < sub.boardX, JSON.stringify(sub));
  await page.screenshot({ path: `${out}/title-${label}.png` });
}

await titleShot('1366x768');
await page.setViewportSize({ width: 844, height: 390 });
await titleShot('phone-844x390');
await page.setViewportSize({ width: 1366, height: 900 });

async function openCaseFiles() {
  await toTitle();
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__game.scene.isActive('CaseFiles'), null, { timeout: 8000 });
  await page.waitForTimeout(500);
}

for (const [id, short] of LABS) {
  // --- Red team it ---
  await openCaseFiles();
  // All labs are "Halcyon Mutual", so find the card by its own title text.
  const card = page.locator('.grid > *').filter({ hasText: LAB_TITLES[id] });
  check(`${short}: lab card found in Case Files`, (await card.count()) === 1, `count ${await card.count()}`);
  await card.locator('button[data-action="red-team"]').click();
  await page.waitForFunction(() => window.__game.scene.isActive('RedTeam'), null, { timeout: 8000 });
  await page.waitForTimeout(400);
  const head = await page.locator('#redteam .rt-step-head').first().textContent().catch(() => '');
  let guard = 0;
  while (guard++ < 30) {
    const done = await page.evaluate(() => window.__game.scene.getScene('RedTeam').state.status !== 'playing');
    if (done) break;
    const optId = await page.evaluate(() => {
      const sc = window.__game.scene.getScene('RedTeam');
      return sc.drill.rounds[sc.state.round].options.find((o) => o.correct).id;
    });
    await page.locator(`.rt-opt[data-opt="${optId}"]`).click();
    await page.waitForTimeout(1100);
  }
  const rt = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('RedTeam');
    return { status: sc.state.status, rounds: sc.drill.rounds.length, grade: document.querySelector('.rt-grade')?.textContent, chain: document.querySelectorAll('.rt-chain .rt-row').length, choke: !!document.querySelector('.rt-choke') };
  });
  check(`${short}: Red team it (${head.trim().slice(0, 30)}) played to debrief`, rt.status === 'won' && rt.grade === 'A' && rt.choke && rt.chain === rt.rounds, JSON.stringify(rt));
  await page.locator('#redteam .rt-wrap').screenshot({ path: `${out}/${short}-redteam.png` }).catch(() => {});

  // --- Write the report ---
  await openCaseFiles();
  await page.locator('.grid > *').filter({ hasText: LAB_TITLES[id] }).locator('button[data-action="pentest"]').click();
  await page.waitForFunction(() => window.__game.scene.isActive('Pentest'), null, { timeout: 8000 });
  await page.waitForTimeout(400);
  await page.locator('.pt-go').click();
  await page.waitForTimeout(300);
  // Decide each pick from the on-screen rubric + KEY FINDING tag only, then click the real button.
  const picks = await page.evaluate(() => {
    const order = ['Critical', 'High', 'Medium', 'Low'];
    const lines = [...document.querySelectorAll('.pt-rubric-mini li:not(.pt-keyrule)')].map((li) => {
      const sev = li.querySelector('.pt-chip').textContent;
      return [sev, li.textContent.slice(sev.length).split(',').map((x) => x.trim())];
    });
    return [...document.querySelectorAll('.pt-findings .pt-finding')].map((row) => {
      const phase = row.querySelector('.pt-phase').textContent;
      const sev = lines.find(([, ps]) => ps.includes(phase))?.[0];
      return { id: row.dataset.finding, phase, pick: row.querySelector('.pt-keytag') ? order[Math.max(0, order.indexOf(sev) - 1)] : sev };
    });
  });
  for (const p of picks) {
    await page.locator(`.pt-findings .pt-finding[data-finding="${p.id}"] .pt-sev`, { hasText: new RegExp(`^${p.pick}$`) }).click();
  }
  await page.locator('[data-action="generate"]').click();
  await page.waitForTimeout(400);
  const rep = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Pentest');
    return { grade: document.querySelector('.pt-grade')?.textContent, rows: document.querySelectorAll('.pt-rep-findings .pt-rep-row').length, findings: sc.eng.findings.length, key: document.querySelectorAll('.pt-keytag').length, choke: !!document.querySelector('.pt-key') };
  });
  check(`${short}: Write the report rated ${picks.length} findings (${picks.map((p) => p.phase + '=' + p.pick).join('; ')}) -> report`, rep.grade === 'A' && rep.rows === rep.findings && rep.key === 1 && rep.choke, JSON.stringify(rep));
  await page.evaluate(() => { const el = document.querySelector('#pentest'); el.style.height = `${el.scrollHeight}px`; el.style.overflow = 'visible'; });
  const h = await page.evaluate(() => Math.ceil(document.querySelector('#pentest').getBoundingClientRect().bottom + 4));
  await page.setViewportSize({ width: 1366, height: Math.max(900, h) });
  await page.waitForTimeout(300);
  await page.locator('#pentest').screenshot({ path: `${out}/${short}-report.png` });
  await page.setViewportSize({ width: 1366, height: 900 });
}

check('0 console/page errors across the run', errors.length === 0, errors.join(' | '));
console.log(`\n${n - fails}/${n} checks passed`);
await browser.close();
process.exit(fails ? 1 : 0);
