// Full-resolution check: the game fills the window at device pixels, and survives a window resize
// mid-game (HUD pinned to the edges, dialog box on screen, clicks still land on the right spot).
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://localhost:4173/cyber-office/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let fails = 0;
let n = 0;
const check = (name, ok, info = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const page = await browser.newPage({ viewport: { width: 1800, height: 960 }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await page.goto(url);
await page.waitForFunction(() => window.__game?.scene.isActive('Title'));
let c = await page.evaluate(() => ({ w: window.__game.canvas.width, h: window.__game.canvas.height, css: window.__game.canvas.getBoundingClientRect() }));
check('canvas is the window size in device pixels (1800x960 @2x)', c.w === 3600 && c.h === 1920, `${c.w}x${c.h}`);
check('canvas fills the window, no side bars', Math.round(c.css.width) === 1800 && Math.round(c.css.height) === 960 && Math.round(c.css.left) === 0, JSON.stringify(c.css));
const res = await page.evaluate(() => window.__game.scene.getScene('Title').children.list.find((o) => o.type === 'Text').style.resolution);
check('title text is drawn at full resolution', res >= 2.6, String(res));

await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game.scene.isActive('Office'));
await page.waitForTimeout(800);
const zoom = await page.evaluate(() => window.__game.scene.getScene('Office').cameras.main.zoom);
check('office tiles zoom by a whole number', Number.isInteger(zoom), String(zoom));

await page.setViewportSize({ width: 1200, height: 900 });
await page.waitForTimeout(600);
c = await page.evaluate(() => ({ w: window.__game.canvas.width, h: window.__game.canvas.height }));
check('after a resize the canvas follows the window', c.w === 2400 && c.h === 1800, `${c.w}x${c.h}`);
const hud = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Office');
  const mute = s.muteBtn.getBounds();
  const d = s.dialog;
  return { muteRight: mute.right, dialogRight: d.boxX + d.boxW, cam: s.uiCam.zoom, cw: window.__game.canvas.width };
});
const viewW = hud.cw / hud.cam;
check('mute button stays pinned to the right edge', Math.abs(hud.muteRight - (viewW - 16)) < 2, `${hud.muteRight} vs ${viewW - 16}`);
check('dialog box stays inside the window', hud.dialogRight <= viewW, `${hud.dialogRight} <= ${viewW}`);

// A click still lands where it should: click the floor a little right of the player and check the target.
for (let i = 0; i < 20 && (await page.evaluate(() => window.__game.scene.getScene('Office').dialog.isOpen)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(120); }
const tgt = await page.evaluate(() => {
  const s = window.__game.scene.getScene('Office');
  const wx = s.player.x;
  const wy = s.player.y - 24;
  const p = s.toScreen(wx, wy);
  return { wx, wy, ...window.__uiToPage(p.x, p.y) };
});
await page.mouse.click(tgt.x, tgt.y);
await page.waitForTimeout(100);
const goal = await page.evaluate(() => { const r = window.__game.scene.getScene('Office').clickRing; return r.visible ? { x: r.x, y: r.y + 1 } : null; });
check('a click after resizing walks to the clicked spot', goal && Math.hypot(goal.x - tgt.wx, goal.y - tgt.wy) < 12, JSON.stringify({ goal, want: [tgt.wx, tgt.wy] }));
check('no page errors', !errs.length, errs.join(' | '));
await browser.close();
console.log(fails ? `RESIZE FAIL (${fails} of ${n})` : `RESIZE PASS (${n} checks)`);
process.exit(fails ? 1 : 0);
