// Screenshots of the office (title, lobby, whole floor) at desktop and phone size.
// Usage: node scripts/shot-office.mjs [url] [outDir]
// Last line prints PASS/FAIL totals and the console-error count.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const out = process.argv[3] || 'docs/proof/visual';
const classic = url.includes('art=classic');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
let pass = 0, fail = 0, errCount = 0;
const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };

for (const [label, vp, mobile] of [['desktop', { width: 1366, height: 860 }, false], ['phone', { width: 844, height: 390 }, true]]) { // phones play in landscape
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('requestfailed', (r) => errors.push(`requestfailed ${r.url()}`));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.scene.isActive('Title'));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/${label}-1-title.png` });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.scene.isActive('Office'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${label}-2-lobby.png` });
  // Close the opening dialog, then look at the whole floor.
  for (let i = 0; i < 30; i++) {
    const open = await page.evaluate(() => window.__game.scene.getScene('Office').dialog.isOpen);
    if (!open) break;
    await page.keyboard.press('e');
    await page.waitForTimeout(90);
  }
  const ok = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Office');
    const keys = ['desk', 'chair', 'rack', 'plant', 'player'];
    return keys.every((k) => s.textures.exists(k));
  });
  check(`${label}: office textures loaded`, ok);
  if (!classic) {
    const hd = await page.evaluate(() => {
      const s = window.__game.scene.getScene('Office');
      return { tiles: !!s.hdLayers?.floor, props: s.textures.exists('hd-desk-soc'), chars: s.player.scaleX < 1 };
    });
    check(`${label}: HD tiles and props in use`, hd.tiles && hd.props, JSON.stringify(hd));
  }
  await page.screenshot({ path: `${out}/${label}-3-floor.png` });
  check(`${label}: no console/network errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  errCount += errors.length;
  await ctx.close();
}
await browser.close();
console.log(`RESULT: ${pass} passed, ${fail} failed, ${errCount} console/network errors`);
process.exit(fail ? 1 : 0);
