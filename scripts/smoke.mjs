// Browser smoke test: plays the M2 loop in real Chrome using mouse clicks (so pathfinding is exercised).
// Usage: npm run build; npx vite preview --port 4173 --strictPort (in another terminal); npm run smoke
//        node scripts/smoke.mjs <url> <outDir>   e.g. against the live GitHub Pages site
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.argv[2] || 'http://localhost:4173/cyber-office/';
const out = process.argv[3] || 'smoke-out';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`);
};

const state = () =>
  page.evaluate(() => {
    const s = window.__game.scene.getScene('Office');
    return {
      x: Math.round(s.player.x), y: Math.round(s.player.y),
      dialog: s.dialog.isOpen, dialogText: s.dialog.isOpen ? s.dialog.full : '',
      walking: !!s.path, pending: s.pending?.id ?? null, near: s.nearest?.id ?? null,
      computer: s.computer.isOpen, soc: s.soc.isOpen, winVisible: s.computer.win.visible,
      winBody: s.computer.winBody.text, tail: s.soc.lines.length,
      goal: s.objectiveText.text, flags: { ...s.flags }, visited: [...s.visited],
    };
  });

async function clickWorld(wx, wy) {
  const box = await page.locator('canvas').boundingBox();
  const v = await page.evaluate(() => {
    const c = window.__game.scene.getScene('Office').cameras.main.worldView;
    return { x: c.x, y: c.y };
  });
  const k = box.width / 960;
  await page.mouse.click(box.x + (wx - v.x) * 3 * k, box.y + (wy - v.y) * 3 * k);
}

async function waitArrive(ms = 9000) {
  const t0 = Date.now();
  await page.waitForTimeout(100);
  while (Date.now() - t0 < ms) {
    const s = await state();
    if (!s.walking && !s.pending) return s;
    await page.waitForTimeout(50);
  }
  return state();
}

async function closeDialog() {
  for (let i = 0; i < 30 && (await state()).dialog; i++) {
    await page.keyboard.press('e');
    await page.waitForTimeout(90);
  }
}

await page.goto(url);
await page.waitForFunction(() => window.__game?.scene.isActive('Title'));
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/1-title.png` });
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game.scene.isActive('Office'));
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/2-lobby.png` });
await closeDialog();
let s = await state();
check('starts in the lobby', s.y > 300, `${s.x},${s.y}`);

// a) Server door before talking to Priya: denied.
await clickWorld(376, 146);
s = await waitArrive();
await page.waitForTimeout(400);
s = await state();
check('click-walk reaches the server door from the lobby', s.dialog && /denied/i.test(s.dialogText), `${s.x},${s.y} ${s.dialogText}`);
check('door stays locked without badge activation', !s.flags.serverOpen);
await closeDialog();

// b) Talk to Priya. She's off-screen from the server door, so walk toward her office first.
await clickWorld(220, 170);
await waitArrive();
await clickWorld(124, 96);
s = await waitArrive();
await page.waitForTimeout(300);
s = await state();
check('click on Priya walks over and starts talking', s.dialog && /SOC/.test(s.dialogText), `${s.x},${s.y} ${s.dialogText}`);
await page.screenshot({ path: `${out}/3-priya.png` });
await closeDialog();
s = await state();
check('talking to Priya activates the badge', s.flags.badgeActive && s.visited.includes('priya'));

// c) Sit at your desk and open welcome.txt.
await clickWorld(256, 128);
s = await waitArrive();
await page.waitForTimeout(500);
s = await state();
check('clicking your desk sits you down at the computer', s.computer, `${s.x},${s.y}`);
// Click the Mail icon with the mouse (UI camera input), then switch to welcome.txt with the keyboard.
{
  const box = await page.locator('canvas').boundingBox();
  const k = box.width / 960;
  await page.mouse.click(box.x + 138 * k, box.y + 108 * k);
  await page.waitForTimeout(200);
  const m = await page.evaluate(() => window.__game.scene.getScene('Office').computer.winTitle.text);
  check('clicking the Mail icon opens the Mail window', m.startsWith('Mail'), m);
}
await page.keyboard.press('2');
await page.waitForTimeout(200);
s = await state();
check('welcome.txt shows the checklist with Priya ticked', s.winVisible && s.winBody.includes('[x] Check in with Priya'));
await page.screenshot({ path: `${out}/4-computer.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
s = await state();
check('Esc closes the app window first', s.computer && !s.winVisible);
// Click the "Stand up" button with the mouse: closes the screen and must NOT walk the player.
{
  const box = await page.locator('canvas').boundingBox();
  const k = box.width / 960;
  const before = await state();
  await page.mouse.click(box.x + 850 * k, box.y + 24 * k);
  await page.waitForTimeout(600);
  s = await state();
  check('clicking "Stand up" stands up without walking off', !s.computer && !s.walking && s.x === before.x && s.y === before.y && s.visited.includes('my-desk'), `${before.x},${before.y} -> ${s.x},${s.y}`);
}

// d) Click the SOC console while the door is closed: you walk to the door and badge in.
await clickWorld(300, 150);
await waitArrive();
await page.waitForTimeout(800); // let the camera settle
await clickWorld(446, 168);
s = await waitArrive();
await page.waitForTimeout(400);
s = await state();
check('clicking past the closed door walks to it and badges in', s.flags.serverOpen && /green/.test(s.dialogText), s.dialogText);
await closeDialog();

// e) Walk through the door to the SOC console.
await clickWorld(456, 168);
s = await waitArrive();
await page.waitForTimeout(1500);
s = await state();
check('walks through the open door and sits at the SOC console', s.soc && s.x > 384, `${s.x},${s.y}`);
check('SOC console shows a live log tail', s.tail >= 10, `${s.tail} lines`);
await page.screenshot({ path: `${out}/5-soc.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
s = await state();
check('all objectives done', s.goal.includes('Explore'), s.goal);

// f) Stay inside until the door closes, then click the office: you walk to the door and badge out.
await page.waitForTimeout(3600);
s = await state();
check('door closes behind you while you are inside', !s.flags.serverOpen && s.x > 384);
await clickWorld(330, 170);
s = await waitArrive();
await page.waitForTimeout(400);
s = await state();
check('clicking outside from the closed server room badges you out', s.flags.serverOpen, `${s.x},${s.y} ${s.dialogText}`);
await closeDialog();
await clickWorld(300, 190);
s = await waitArrive();
check('walks back out of the server room', s.x < 368, `${s.x},${s.y}`);
await page.waitForTimeout(3600);
s = await state();
check('server door closes behind you', !s.flags.serverOpen);
{
  const solid = await page.evaluate(() => {
    const sc = window.__game.scene.getScene('Office');
    return sc.wallsLayer.getTileAt(23, 8)?.collides && sc.wallsLayer.getTileAt(23, 9)?.collides && sc.nav.pointBlocked(376, 150);
  });
  check('the re-closed door is solid again (physics + pathfinding)', solid);
}
await page.screenshot({ path: `${out}/6-office.png` });

// g) Keyboard + wall collision: hold left for 4s, you stop at the outer wall.
await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(4000);
await page.keyboard.up('ArrowLeft');
s = await state();
check('keyboard movement stops at the outer wall', s.x >= 20 && s.x < 40, `${s.x},${s.y}`);

check('no console errors', errors.length === 0, errors.join(' | '));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `SMOKE FAIL (${failed} of ${results.length})` : `SMOKE PASS (${results.length} checks)`);
await browser.close();
process.exit(failed ? 1 : 0);
