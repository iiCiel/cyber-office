// Plays every Learn-mode lesson through the real panel and consoles, step by step, the way a player would.
//   CHROME_PATH=... node scripts/verify-academy.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const out = process.argv[3] || 'docs/proof/academy';
fs.mkdirSync(out, { recursive: true });
const chromePath = process.env.CHROME_PATH;
const browser = await chromium.launch(chromePath ? { executablePath: chromePath, headless: true } : { channel: 'chrome', headless: true });
let fails = 0, n = 0;
const check = (name, ok, info = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const page = await browser.newPage({ viewport: { width: 1366, height: 800 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(`console: ${m.text()}`); });
const scene = (fn, arg) => page.evaluate(([src, a]) => { const sc = window.__game.scene.getScene('CcdcLab'); return new Function('sc', 'a', `return (async () => { ${src} })()`)(sc, a); }, [fn, arg]);
const panel = page.locator('[data-academy]');
const net = page.locator('.jb-win[data-win="netlab"]');
const tv = () => net.locator('.nl-view .tv-input').first();
const enter = async (v) => { await tv().fill(v); await tv().press('Enter'); await page.waitForTimeout(60); };

await page.goto(`${url}?v=${Date.now()}`);
await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
await page.waitForTimeout(400);
await page.keyboard.press('t');
await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
await page.locator('.comp-card[data-mode="ccdc"]').click();
await page.waitForFunction(() => window.__game.scene.isActive('CcdcLab'), null, { timeout: 8000 });
await page.waitForTimeout(200);
check('Learn is the default round', /Start learning/.test(await page.locator('.ccx-btn.primary').innerText()));
await page.locator('.ccx-btn.primary').click();
await page.waitForSelector('[data-academy]');
await page.screenshot({ path: `${out}/lessons.png` });
const ids = await page.locator('[data-lesson]').evaluateAll((e) => e.map((x) => x.dataset.lesson));
check('lessons are listed', ids.length >= 15, String(ids.length));

const MEMOS = {
  'rdp-request': 'We cannot open remote desktop to the internet because exposed RDP is a major ransomware and brute force risk. Instead we will set up a VPN with multi-factor authentication so that you can reach your office PC safely from the road.',
  'pw-policy': 'All passwords must be at least 14 characters long. Do not reuse a previous password on any system. Today we changed the administrator passwords on our servers. If you need help, please contact the help desk and open a ticket with us.',
};

for (const id of ids) {
  await panel.locator('.ac-tab[data-actab="lessons"]').click();
  await panel.locator(`[data-lesson="${id}"]`).click();
  await page.waitForTimeout(80);
  for (let guard = 0; guard < 60; guard++) {
    const s = await scene(`const p = sc.coach; if (!p.lesson) return null; const s = p.step(); return { i: p.i, vm: s.vm, say: s.say || '', type: typeof s.type === 'function' ? s.type(sc.state) : s.type, ask: s.ask ? { sample: typeof s.ask.sample === 'function' ? s.ask.sample(sc.state) : s.ask.sample } : null, write: s.write || null, sim: typeof s.sim === 'string' ? s.sim : s.sim ? 'fn' : null, hasDone: !!s.done, tl: s.testLines || null, simWait: !!s.simWait, drill: !!s.drill, kind: sc.state.deviceList.find((d) => d.id === s.vm)?.kind, logged: s.vm ? !!sc.jb.app('netlab').loggedIn(s.vm) : false, complete: p.complete };`);
    if (!s) break;
    const where = `${id} step ${s.i + 1}`;
    if (s.ask) { await panel.locator('[data-answer]').fill(s.ask.sample); await panel.locator('[data-check]').click(); }
    else if (s.write) { await panel.locator('[data-memo]').fill(`${await panel.locator('[data-memo]').inputValue()}${MEMOS[s.write.injectId]}`); await panel.locator('[data-grade]').click(); }
    else if (/log in as|sign in with/.test(s.say) && !s.complete) {
      if (s.kind === 'pwsh') {
        await net.locator(`[data-nl="${s.vm}"]`).locator('.nl-caret-hit').click();
        await net.locator('.nl-mi[data-act="cad"]').click();
        await page.waitForTimeout(80);
        await net.locator('.nl-pw').fill('Changeme123');
        await net.locator('.nl-pw').press('Enter');
      } else { await enter(s.say.match(/log in as (\w+)/)[1]); await enter('Changeme123'); }
      await page.waitForTimeout(1250);
    } else if (s.sim === 'fn') { await scene("sc.state.engine.pcr.filed = true; sc.coach.refresh();"); await page.waitForTimeout(50); }
    else if (s.sim === 'incident') {
      await scene(`const { submitIncident } = await import('/cyber-office/src/game/ccdcIncident.js'); const st = sc.state; const im = st.engine.red.implants.find((x) => x.dev === 'mail'); const { gameTime } = await import('/cyber-office/src/game/ccdcRed.js'); const ev = st.engine.red.events.find((e) => e.artifact === im.artifact); submitIncident(st, { host: 'mail', src: st.engine.red.ip, time: gameTime(st, ev.at), what: 'Attacker planted ' + im.artifact, evidence: 'Accepted password for root from ' + st.engine.red.ip + ' and new file ' + im.artifact, remediation: 'Removed the cron file and changed the root password', prevention: 'Rotated passwords, limited SSH through the firewall, and reviewing cron daily from now on' }); sc.coach.refresh();`);
    } else if (s.type && !s.complete) {
      if (s.drill) await panel.locator('[data-reveal]').click();
      await panel.locator('[data-load]').click();
      await page.waitForTimeout(120);
      const input = net.locator('.nl-view .tv-input').first();
      await input.press('Enter');
      await page.waitForTimeout(60);
      for (const x of s.tl || []) { await input.fill(x); await input.press('Enter'); await page.waitForTimeout(40); }
      if (s.simWait) {
        await scene('sc.startedAt -= 60000;');
        await page.waitForTimeout(1300);
        await input.fill('show jobs all'); await input.press('Enter');
      }
    }
    try { await panel.locator('[data-next]').waitFor({ timeout: 3500 }); } catch {
      check(`${where} completes`, false, (await panel.innerText()).replace(/\s+/g, ' ').slice(0, 220));
      await page.screenshot({ path: `${out}/fail-${id}-${s.i + 1}.png` });
      await scene('sc.coach.complete = true; sc.coach.drawStep();');
    }
    if (id === 'panos' && s.i === 5) await page.screenshot({ path: `${out}/step-panos.png` });
    if (id === 'linux' && s.i === 2) await page.screenshot({ path: `${out}/step-linux.png` });
    if (id === 'injects' && s.write) await page.screenshot({ path: `${out}/step-memo.png` });
    await panel.locator('[data-next]').click();
    await page.waitForTimeout(40);
  }
  check(`lesson finished: ${id}`, await panel.locator(`[data-lesson="${id}"].done`).count() === 1);
}
await page.reload();
await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
await page.waitForTimeout(300);
await page.keyboard.press('t');
await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
await page.locator('.comp-card[data-mode="ccdc"]').click();
await page.waitForFunction(() => window.__game.scene.isActive('CcdcLab'), null, { timeout: 8000 });
await page.locator('.ccx-btn.primary').click();
await page.waitForSelector('[data-academy]');
check('progress survives a reload', (await page.locator('.ac-item.done').count()) === ids.length);
await panel.locator('[data-actab="sheet"]').click();
await page.waitForTimeout(100);
await page.screenshot({ path: `${out}/cheat-sheet.png` });
const html = await page.evaluate(async () => (await import('/cyber-office/src/data/ccdcAcademy.js')).sheetHtml());
const pp = await browser.newPage();
await pp.setContent(html);
await pp.pdf({ path: `${out}/reference-sheet.pdf`, format: 'Letter', printBackground: true, preferCSSPageSize: true });
await pp.close();
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/phone.png` });
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
