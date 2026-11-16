// Drive the real TermEditor the way a HUMAN follows the lesson keystrokes (not via setText),
// and confirm the coach's done-check for the nano and vi steps fires.
import { chromium } from 'playwright-core';
const url = 'http://localhost:5194/cyber-office/';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 800 }, deviceScaleFactor: 1 });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`${url}?v=${Date.now()}`);
await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
await page.waitForTimeout(400);
await page.keyboard.press('t');
await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
await page.locator('.comp-card[data-mode="ccdc"]').click();
await page.waitForFunction(() => window.__game.scene.isActive('CcdcLab'), null, { timeout: 8000 });
await page.waitForTimeout(200);
await page.locator('.ccx-btn.primary').click();
await page.waitForSelector('[data-academy]');

// open the editors lesson, jump to the vi step (ecom / PermitRootLogin)
await page.locator('[data-lesson="editors"]').click();
await page.waitForTimeout(100);
const stepInfo = await page.evaluate(() => {
  const p = window.__game.scene.getScene('CcdcLab').coach;
  // advance to the vi step
  for (let k = 0; k < p.lesson.steps.length; k++) { if (p.lesson.steps[k].edit && p.lesson.steps[k].edit.tool === 'vi') { p.i = k; p.complete = false; p.drawStep(); return { i: k, step: p.lesson.steps[k].edit }; } }
  return null;
});
console.log('vi step:', JSON.stringify(stepInfo));

// open the console editor for ecom and type like a human: /yes, xxx, i, 'no', Esc, :wq
const type = async (keys) => { for (const k of keys) { await page.keyboard.press(k); await page.waitForTimeout(15); } };
// open vi via the real console input
await page.evaluate(() => {
  const s = window.__game.scene.getScene('CcdcLab');
  const app = s.jb.app('netlab'); app.openVm('ecom');
});
await page.waitForTimeout(100);
// find the console input and run the vi command through the terminal
await page.evaluate(() => {
  const s = window.__game.scene.getScene('CcdcLab');
  const con = s.jb.app('netlab').console('ecom');
  con.openEditor('vi', '/etc/ssh/sshd_config');
});
await page.waitForTimeout(150);
// focus the editor textarea
const ta = page.locator('.te.te-vi .te-text').first();
await ta.click();
await page.waitForTimeout(50);
// /yes<Enter>
await page.keyboard.press('/');
await page.waitForTimeout(40);
await page.locator('.te-pinput').first().fill('yes');
await page.locator('.te-pinput').first().press('Enter');
await page.waitForTimeout(60);
await ta.click();
await type(['x', 'x', 'x']);     // delete y e s
await page.keyboard.press('i');  // insert
await page.waitForTimeout(30);
await page.keyboard.type('no');
await page.keyboard.press('Escape');
await page.waitForTimeout(30);
// :wq<Enter>
await page.keyboard.press('Shift+Semicolon').catch(()=>{});
await page.keyboard.press(':').catch(()=>{});
await page.waitForTimeout(40);
await page.locator('.te-pinput').first().fill('wq');
await page.locator('.te-pinput').first().press('Enter');
await page.waitForTimeout(150);

const res = await page.evaluate(() => {
  const s = window.__game.scene.getScene('CcdcLab');
  const fs = s.state.devState.ecom.fs['/etc/ssh/sshd_config'];
  s.coach.refresh();
  return { file: fs, complete: s.coach.complete, line: (fs||'').split('\n').find((l)=>/PermitRootLogin/.test(l)) };
});
console.log('result line:', JSON.stringify(res.line));
console.log('coach.complete:', res.complete);
console.log('console errors:', errs.length);
await browser.close();
process.exit(res.complete && errs.length === 0 ? 0 : 1);
