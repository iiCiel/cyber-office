// Browser playthrough of the realistic CCDC round, in both lengths: real service checks on the portal, Red Team
// planting on the boxes, incident reports, reverts, and the after-action report.
//   CHROME_PATH=... node scripts/verify-ccdcreal.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const out = process.argv[3] || 'docs/proof/ccdc-real';
fs.mkdirSync(out, { recursive: true });
const chromePath = process.env.CHROME_PATH;
const browser = await chromium.launch(chromePath ? { executablePath: chromePath, headless: true } : { channel: 'chrome', headless: true });
let fails = 0, n = 0;
const check = (name, ok, info = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const scene = (page, fn, arg) => page.evaluate(([src, a]) => { const sc = window.__game.scene.getScene('CcdcLab'); return new Function('sc', 'a', src)(sc, a); }, [fn, arg]);
const win = (page, id) => page.locator(`.jb-win[data-win="${id}"]`);
const openWin = async (page, id) => { await page.locator(`.jb-tb-app[data-open="${id}"]`).click(); await page.waitForTimeout(250); };
const type = async (w, line) => { const i = w.locator('.tv-input').first(); await i.fill(line); await i.press('Enter'); await w.page().waitForTimeout(120); };
const toSec = (page, sec) => scene(page, `sc.startedAt = Date.now() - ${sec * 1000};`);

for (const [length, seconds, wantInjects, tag] of [['Short', 900, 5, 'short'], ['Long', 3600, 30, 'long']]) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(`${url}?v=${Date.now()}`);
  await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.keyboard.press('t');
  await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
  await page.waitForTimeout(200);
  await page.locator('.comp-card[data-mode="ccdc"]').click();
  await page.waitForFunction(() => window.__game.scene.isActive('CcdcLab'), null, { timeout: 8000 });
  await page.waitForTimeout(200);
  await page.locator('.ccx-radio', { hasText: `${length} ·` }).click();
  await page.locator('.ccx-radio', { hasText: 'Competition' }).click();
  await page.screenshot({ path: `${out}/packet-${tag}.png`, fullPage: true });
  await page.locator('.ccx-btn.primary').click();
  await page.waitForSelector('.jb-taskbar');
  await page.waitForTimeout(400);
  const info = await scene(page, 'return { limit: sc.state.timeLimitSec, injects: sc.state.injectList.length };');
  check(`[${tag}] round is ${seconds / 60} minutes`, info.limit === seconds, String(info.limit));
  check(`[${tag}] ${wantInjects} injects scheduled`, info.injects === wantInjects, String(info.injects));

  // Break a service by hand and see it on the portal.
  await openWin(page, 'ssh-web01');
  const web = win(page, 'ssh-web01');
  await type(web, 'systemctl stop apache2');
  check(`[${tag}] the terminal stays silent`, !/DOWN|Hardened/.test(await web.innerText()));
  await toSec(page, 31);
  await page.waitForTimeout(1300);
  await openWin(page, 'score');
  const score = win(page, 'score');
  const row = () => score.locator('tr', { hasText: 'Company website' }).innerText();
  check(`[${tag}] portal shows the site DOWN after apache is stopped`, /DOWN/.test(await row()), (await row()).replace(/\s+/g, ' '));
  check(`[${tag}] no standings or score on the portal`, !/Leader|Current Score|Place/.test(await score.innerText()));
  await page.screenshot({ path: `${out}/portal-${tag}.png` });
  await openWin(page, 'ssh-web01');
  await type(web, 'systemctl start apache2');
  await toSec(page, 62);
  await page.waitForTimeout(1300);
  await openWin(page, 'score');
  check(`[${tag}] portal shows it UP after apache is started`, /\bUP\b/.test(await row()));

  // Red Team is on the boxes: find something it planted with ordinary tools.
  await toSec(page, Math.floor(seconds * 0.4));
  await page.waitForTimeout(1500);
  const planted = await scene(page, `const e = sc.state.engine.red.events.find(x => x.type==='persist' && x.implant?.path); return e ? { host: e.host, path: e.implant.path, src: e.src, time: null, at: e.at } : null;`);
  check(`[${tag}] Red Team planted a file on a Linux box`, !!planted, planted?.path);
  if (planted) {
    await openWin(page, `ssh-${planted.host}`);
    const box = win(page, `ssh-${planted.host}`);
    const dir = planted.path.replace(/\/[^/]*$/, '');
    await type(box, `ls ${dir}`);
    check(`[${tag}] ls shows the implant`, (await box.innerText()).includes(planted.path.split('/').pop()));
    await page.screenshot({ path: `${out}/implant-${tag}.png` });
    await type(box, `rm ${planted.path}`);
    const time = await scene(page, `return (${(a) => { const t = 9 * 3600 + Math.floor(a.at * a.scale); return `${String(Math.floor(t / 3600)).padStart(2, '0')}:${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}`; }})({ at: a, scale: sc.state.timeScale });`, planted.at);
    await openWin(page, 'ir');
    const ir = win(page, 'ir');
    const before = await scene(page, 'return sc.state.engine.red.events.reduce((n,e)=>n+e.recovered,0);');
    const f = (k) => ir.locator(`[data-field="${k}"]`);
    await f('host').fill(planted.host);
    await f('src').fill(planted.src);
    await f('time').fill(time);
    await f('what').fill(`Red Team planted ${planted.path} for persistence.`);
    await f('evidence').fill(`COMMAND=/usr/bin/tee ${planted.path} from ${planted.src} seen in the auth log`);
    await f('remediation').fill('We removed the file and verified it is gone.');
    await f('prevention').fill('We rotated all default passwords and now alert on new persistence.');
    await ir.locator('button', { hasText: 'Submit report' }).click();
    await page.waitForTimeout(200);
    const after = await scene(page, 'return sc.state.engine.red.events.reduce((n,e)=>n+e.recovered,0);');
    check(`[${tag}] incident report wins points back`, after > before, `${before} -> ${after}`);
    check(`[${tag}] competition does not reveal the grade`, /Received by White Team/.test(await ir.innerText()));
    await page.screenshot({ path: `${out}/incident-${tag}.png` });
  }

  // Revert a box through Tech Support.
  await openWin(page, 'score');
  const btn = score.locator('[data-revert="web01"]');
  await btn.click(); await btn.click();
  await page.waitForTimeout(200);
  const reverts = await scene(page, 'return sc.state.reverts.length;');
  check(`[${tag}] revert goes through after a second click`, reverts === 1, String(reverts));
  await page.screenshot({ path: `${out}/revert-${tag}.png` });

  // Red Team's later phases, then the debrief.
  await toSec(page, seconds - 5);
  await page.waitForTimeout(1500);
  const kinds = await scene(page, 'return [...new Set(sc.state.engine.red.events.map(e=>e.type))];');
  check(`[${tag}] takedowns happened in the afternoon`, kinds.includes('takedown'), kinds.join(','));
  await scene(page, 'sc.endRound();');
  await page.waitForSelector('.ccx-aar');
  const aar = await page.locator('.ccx-aar').innerText();
  check(`[${tag}] standings appear only now`, /Final standing: \d+ of \d+/.test(aar));
  check(`[${tag}] debrief shows what Red Team did`, await page.locator('[data-red-activity]').count() === 1);
  check(`[${tag}] debrief charges the revert`, /Reverts/.test(aar));
  await page.screenshot({ path: `${out}/aar-${tag}.png`, fullPage: false });
  await page.locator('[data-red-activity]').screenshot({ path: `${out}/red-activity-${tag}.png` }).catch(() => {});
  check(`[${tag}] no page or console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}
await browser.close();
console.log(`\n${n - fails}/${n} checks passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
