// Browser smoke test: boots the game in real Chrome, walks the player to a desk, interacts, screenshots.
// Usage: npm run build && npx vite preview --port 4173 &  then  node scripts/smoke.mjs [url] [outDir]
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

const pos = () => page.evaluate(() => {
  const s = window.__game.scene.getScene('Office');
  return { x: s.player.x, y: s.player.y, dialog: s.dialog.isOpen, near: s.nearest?.id ?? null, goal: s.objectiveText.text };
});

async function closeDialog() {
  for (let i = 0; i < 20 && (await pos()).dialog; i++) {
    await page.keyboard.press('e');
    await page.waitForTimeout(120);
  }
}

// Hold a key until the player crosses a coordinate (or 4s pass).
async function walk(key, axis, target) {
  await page.keyboard.down(key);
  const t0 = Date.now();
  while (Date.now() - t0 < 4000) {
    const p = await pos();
    const done = key === 'ArrowLeft' || key === 'ArrowUp' ? p[axis] <= target : p[axis] >= target;
    if (done) break;
    await page.waitForTimeout(16);
  }
  await page.keyboard.up(key);
  await page.waitForTimeout(80);
}

await page.goto(url);
await page.waitForFunction(() => window.__game?.scene.isActive('Title'));
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/1-title.png` });

await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game.scene.isActive('Office'));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/2-office-intro.png` });
await closeDialog();

const start = await pos();
await walk('ArrowLeft', 'x', 88);
await walk('ArrowUp', 'y', 96);
const mid = await pos();
await walk('ArrowLeft', 'x', 50);
const atDesk = await pos();
await page.screenshot({ path: `${out}/3-at-desk.png` });
await page.keyboard.press('e');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/4-desk-dialog.png` });
await closeDialog();
const after = await pos();

// Collision check: walk straight up into the desk; player should stop below it.
await walk('ArrowUp', 'y', 60);
const blocked = await pos();

// Click-to-walk: click an empty floor spot (world 160,200) and check the player heads there.
const box = await page.locator('canvas').boundingBox();
const k = box.width / 960;
await page.mouse.click(box.x + 160 * 3 * k, box.y + 200 * 3 * k);
await page.waitForTimeout(4000);
const clicked = await pos();
await page.screenshot({ path: `${out}/5-after-click.png` });

console.log(JSON.stringify({ start, mid, atDesk, after, blocked, clicked, errors }, null, 2));
const ok =
  errors.length === 0 &&
  mid.y < start.y - 50 &&
  atDesk.near === 'my-desk' &&
  after.goal.includes('coworker') &&
  blocked.y > 80 &&
  Math.hypot(clicked.x - 160, clicked.y - 200) < 6;
console.log(ok ? 'SMOKE PASS' : 'SMOKE FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
