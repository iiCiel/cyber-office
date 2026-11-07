// Screenshots of the rewritten coworker dialogue: Priya's morning briefing (Days 1-5) and the
// opening of each choice conversation (vishing call, USB drop, Mike, Theo, Carla).
// Usage: node scripts/shot-dialogue.mjs [url] [outDir]   Last line prints PASS/FAIL totals and console errors.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const out = process.argv[3] || 'docs/proof/dialogue';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let pass = 0, fail = 0;
const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const errors = [];

// [file, day, kind, payload, expected text]
const SHOTS = [
  ['day1-priya', 1, 'npc', 'priya', 'Northgate'],
  ['day1-dana', 1, 'npc', 'dana', 'INC0004388'],
  ['day1-vishing', 1, 'conv', ['day1/talk.js', 'PHONE_CALL'], 'Brennan Freight'],
  ['day1-usb', 1, 'conv', ['day1/talk.js', 'USB_DROP'], 'loading dock'],
  ['day2-priya', 2, 'npc', 'priya', 'handoff'],
  ['day2-mike', 2, 'conv', ['day2/talk.js', 'MIKE_CONFESSES'], 'quarter to seven'],
  ['day3-priya', 3, 'npc', 'priya', 'RITM0004471'],
  ['day3-theo', 3, 'conv', ['day3/talk.js', 'THEO_WAF'], '942100'],
  ['day4-priya', 4, 'npc', 'priya', 'NGM-48336'],
  ['day4-carla', 4, 'conv', ['day4/talk.js', 'CARLA_CALL'], 'remit-to'],
  ['day5-priya', 5, 'npc', 'priya', 'NGM-48402'],
];

for (const [file, day, kind, payload, expect] of SHOTS) {
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 860 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.scene.isActive('Title'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.scene.isActive('Office'));
  await page.waitForTimeout(800);
  const text = await page.evaluate(async ({ day, kind, payload, base }) => {
    const { loadDay } = await import(`${base}src/days/index.js`);
    const s = window.__game.scene.getScene('Office');
    if (s.dialog.isOpen) s.dialog.close?.();
    s.state.day = day; s.day = loadDay(day, s.state); s.state.minutes = 9 * 60;
    let lines;
    if (kind === 'npc') {
      lines = s.day.npcLines[payload].talk;
      s.dialog.open(payload === 'priya' ? 'Priya Raman (SOC lead)' : 'Dana (IT helpdesk)', lines);
    } else {
      const mod = await import(`${base}src/days/${payload[0]}`);
      const tree = mod[payload[1]];
      lines = tree.start.say.flatMap(([, l]) => l);
      s.runConversation('shot', tree, () => {});
    }
    return lines.join(' ');
  }, { day, kind, payload, base: new URL(url).pathname });
  await page.waitForTimeout(700);
  // Page through to the last line so the choices (or the end of the briefing) are on screen.
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(250); }
  check(`${file}: dialogue has "${expect}"`, text.includes(expect));
  await page.waitForTimeout(3000); // let the typewriter finish the line before the shot
  await page.screenshot({ path: `${out}/${file}.png` });
  await page.close();
}
check('no console/network errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`RESULT: ${pass} passed, ${fail} failed, ${errors.length} console/network errors`);
process.exit(fail ? 1 : 0);
