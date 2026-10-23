// Difficulty smoke test: title line (D key), music toggle, P menu, clock speed per level, guide arrow, Trainee write-up hint, report label.
// Usage: npm run build; npx vite preview --port 4173 (background); node scripts/smoke-difficulty.mjs [url] [outdir]
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://localhost:4173/cyber-office/';
const out = process.argv[3] || 'smoke-out/difficulty';
import fs from 'node:fs'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
let fails = 0, n = 0;
const check = (name, ok, info = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const ev = (fn, a) => page.evaluate(fn, a);
const titleText = (name) => ev((nm) => window.__game.scene.getScene('Title').children.getByName(nm)?.text, name);
await page.goto(url); await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 15000 });
await page.waitForTimeout(500);
check('title shows the difficulty (Analyst by default)', (await titleText('title-difficulty'))?.includes('Analyst'), await titleText('title-difficulty'));
check('title shows the music toggle', /Music: (on|off)/.test(await titleText('title-music') || ''), await titleText('title-music'));
await page.screenshot({ path: `${out}/1-title.png` });
await page.keyboard.press('d');
await page.waitForTimeout(150);
check('D cycles to Senior and does not start the game', (await titleText('title-difficulty'))?.includes('Senior') && await ev(() => window.__game.scene.isActive('Title')));
check('Senior is saved', await ev(() => localStorage.getItem('cyber-office:difficulty')) === 'senior');
const m0 = await titleText('title-music');
const box = await ev(() => { const t = window.__game.scene.getScene('Title').children.getByName('title-music'); const c = window.__game.canvas.getBoundingClientRect(); const s = c.width / 960; return { x: c.left + t.getCenter().x * s, y: c.top + t.getCenter().y * s }; });
await page.mouse.click(box.x, box.y); await page.waitForTimeout(150);
const m1 = await titleText('title-music');
check('clicking the music toggle flips it', m0 !== m1, `${m0} -> ${m1}`);
await page.mouse.click(box.x, box.y); await page.waitForTimeout(150);
// Start Monday (Senior)
await page.keyboard.press('1');
await page.waitForFunction(() => window.__game.scene.isActive('Office'), null, { timeout: 10000 });
await page.waitForTimeout(1200);
for (let i = 0; i < 40 && await ev(() => window.__game.scene.getScene('Office').dialog.isOpen); i++) { await page.keyboard.press('e'); await page.waitForTimeout(120); }
await page.waitForTimeout(400);
const o = () => ev(() => { const s = window.__game.scene.getScene('Office'); return { delay: s.clockEvent?.delay, marker: s.marker.visible, target: !!s.markerTarget, diff: s.state.difficulty }; });
let s = await o();
check('Senior: 3 s per game minute, no arrow', s.delay === 3000 && !s.marker && s.diff === 'senior', JSON.stringify(s));
// Pause menu: switch to Trainee (senior -> trainee is one click)
await page.keyboard.press('p'); await page.waitForTimeout(400);
const menuItem = () => ev(() => window.__game.scene.getScene('Menu').diffItem?.text);
check('P menu shows the difficulty', (await menuItem())?.includes('Senior'), await menuItem());
await ev(() => window.__game.scene.getScene('Menu').diffItem.emit('pointerdown'));
check('clicking it cycles to Trainee', (await menuItem())?.includes('Trainee'), await menuItem());
await page.screenshot({ path: `${out}/2-menu.png` });
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
s = await o();
check('Trainee after closing the menu: 6 s per minute, arrow back', s.delay === 6000 && s.marker && s.diff === 'trainee', JSON.stringify(s));
// Fire the main alert and open the write-up
await ev(() => { const sc = window.__game.scene.getScene('Office'); const a = sc.day.alerts.find((x) => x.main); sc.fireAlert(a); sc.soc.open(); sc.soc.go('case'); });
await page.waitForTimeout(500);
check('Trainee: the write-up has a hint', await page.locator('#screen-soc details[data-hint=case]').count() === 1);
await page.click('#screen-soc details[data-hint=case] summary'); await page.waitForTimeout(200);
const hint = await page.locator('#screen-soc details[data-hint=case] p').innerText();
check('the hint opens and shows the key line', hint.length > 30 && await ev(() => window.__game.scene.getScene('Office').state.hasEvent('hint-used')), hint.slice(0, 60));
await page.screenshot({ path: `${out}/3-hint.png` });
// Analyst: no hint
await ev(() => { localStorage.setItem('cyber-office:difficulty', 'analyst'); const sc = window.__game.scene.getScene('Office'); sc.applyDifficulty(); sc.soc.go('case'); });
await page.waitForTimeout(300);
check('Analyst: no hint, 4 s per minute', await page.locator('#screen-soc details[data-hint=case]').count() === 0 && (await o()).delay === 4000);
// Report label: end the day directly on Trainee
await ev(() => { localStorage.setItem('cyber-office:difficulty', 'trainee'); const sc = window.__game.scene.getScene('Office'); sc.applyDifficulty(); sc.soc.close(); sc.endDay(); });
await page.waitForSelector('#report', { timeout: 10000 });
const lbl = await page.locator('#report [data-difficulty]').innerText().catch(() => '');
check('report says Trainee and that the hint was used', /Trainee, with the write-up hint/.test(lbl), lbl);
await page.screenshot({ path: `${out}/4-report.png` });
check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(fails ? `DIFF FAIL (${fails} of ${n})` : `DIFF PASS (${n} checks)`);
process.exit(fails ? 1 : 0);
