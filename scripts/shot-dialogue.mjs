// Screenshots of the coworker dialogue as it happens in real play: Priya's morning briefing (Days 1-5),
// Dana's desk chat, and each choice conversation started by its real trigger (vishing call, USB drop,
// Mike, Theo, Carla). Each shot loads that day's saved state through the game's own resume path
// (GameState.startDay + Office scene restart), marks done only the objectives the trigger depends on,
// then lets the game fire the encounter: the phone rings and the player answers it at the desk with E,
// or the coworker walks up to the player. No conversation is opened by hand.
// Also writes day4-inbox-banner.png (Thursday inbox, Northwind email with the CAUTION banner) and
// day4-carla-vs-inbox.png (that inbox next to Carla's call).
// Usage: node scripts/shot-dialogue.mjs [url] [outDir]   Needs the dev server (drives window.__game). Last line prints PASS/FAIL totals and console errors.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const out = process.argv[3] || 'docs/proof/dialogue';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let pass = 0, fail = 0;
const check = (name, ok, info = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const errors = [];

// Objectives done before each trigger fires (taken from the day's objective list, in order).
const BEFORE_SOC = { 1: ['priya', 'my-desk', 'inbox', 'server-door', 'soc'], 2: ['priya', 'my-desk', 'inbox', 'tickets', 'server-door', 'soc'], 3: ['priya', 'my-desk', 'inbox', 'whois', 'server-door', 'soc'] };

// [file, day, how, setup, expected text in the dialog, expected HUD objective]
const SHOTS = [
  ['day1-priya', 1, 'talk:priya', {}, 'Northgate', 'Check in with Priya, your manager'],
  ['day1-dana', 1, 'talk:dana', { done: ['priya'], at: 9 * 60 + 5 }, 'INC0004388', 'Sit down at your desk'],
  ['day1-vishing', 1, 'phone', { done: BEFORE_SOC[1], at: 10 * 60 + 15, near: 'my-desk' }, 'Brennan Freight', 'Answer your desk phone'],
  ['day1-usb', 1, 'walkup:dana', { done: [...BEFORE_SOC[1], 'phone'], enc: { phone: { done: true, outcome: 'callback-verified' } }, at: 10 * 60 + 30, near: 'my-desk' }, 'loading dock', 'Dana is coming over to you'],
  ['day2-priya', 2, 'talk:priya', {}, 'handoff', 'Morning briefing with Priya'],
  ['day2-mike', 2, 'walkup:mike', { done: BEFORE_SOC[2], at: 10 * 60 + 40, near: 'soc' }, 'quarter to seven', 'Mike wants to talk to you'],
  ['day3-priya', 3, 'talk:priya', {}, 'RITM0004471', 'Morning briefing with Priya'],
  ['day3-theo', 3, 'walkup:theo', { done: BEFORE_SOC[3], at: 10 * 60 + 50, near: 'soc' }, '942100', 'Theo needs something from you'],
  ['day4-priya', 4, 'talk:priya', {}, 'NGM-48336', 'Morning briefing with Priya'],
  ['day4-carla', 4, 'phone', { done: ['priya', 'my-desk', 'inbox'], at: 9 * 60 + 12, near: 'my-desk', inbox: 'bec-bank' }, 'external banner', 'Answer your desk phone (Carla)'],
  ['day5-priya', 5, 'talk:priya', {}, 'NGM-48402', 'Morning briefing with Priya'],
];

const hhmm = (m) => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')}`;

for (const [file, day, how, setup, expect, objective] of SHOTS) {
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 860 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.scene.isActive('Title'));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.scene.isActive('Office'));
  await page.waitForTimeout(600);

  // 1) Build that day's saved state and reload the Office through the normal "continue" path.
  await page.evaluate(({ day, setup }) => {
    const s = window.__game.scene.getScene('Office');
    const st = s.state;
    st.startDay(day);
    if (setup.at != null) st.minutes = setup.at;
    for (const id of setup.done || []) st.visited.push(id);
    if (setup.done?.includes('server-door')) st.flags.badgeActive = true;
    Object.assign(st.enc, setup.enc || {});
    st.save();
    s.scene.restart({ resume: true });
  }, { day, setup });
  await page.waitForFunction((day) => {
    const s = window.__game.scene.getScene('Office');
    return window.__game.scene.isActive('Office') && s.state?.day === day && s.dialog;
  }, day);
  await page.waitForTimeout(900);
  // Close the day's intro text (dialog.advance, not Space, so nothing near the player gets used by accident).
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('Office');
    for (let i = 0; i < 20 && s.dialog.isOpen && !s.dialog.choices; i++) { if (s.dialog.typing) s.dialog.finishLine?.(); s.dialog.advance(); }
  });
  // The main alert already fired on days where the SOC case is done (it is how the case got opened).
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('Office');
    const main = s.day.alerts?.find((a) => a.main);
    if (main && s.isDone('soc') && s.state.soc.alerts[main.id] == null) s.state.soc.alerts[main.id] = s.minutes - 40;
    s.updateObjective();
  });

  // 2) Put the player where they would be: next to the person/desk/console.
  const target = how.startsWith('talk:') ? how.slice(5) : setup.near;
  const placed = await page.evaluate((target) => {
    const s = window.__game.scene.getScene('Office');
    const t = s.interactables.find((i) => i.id === target);
    if (!t) return false;
    const spots = [[0, 14], [14, 0], [-14, 0], [0, -14], [0, 18], [18, 4], [-18, 4]];
    for (const [dx, dy] of spots) {
      const x = t.px + dx, y = t.py + dy;
      if (!s.nav.pointBlocked(x, y)) { s.player.setPosition(x, y); s.player.body?.reset(x, y); return true; }
    }
    return false;
  }, target);
  check(`${file}: player placed next to ${target}`, placed);
  await page.waitForTimeout(400);

  // 3) Start the dialogue the way the game does.
  if (how.startsWith('talk:')) {
    await page.waitForFunction((id) => window.__game.scene.getScene('Office').nearest?.id === id, target, { timeout: 5000 }).catch(() => {});
    await page.keyboard.press('e');
  } else if (how === 'phone') {
    if (setup.inbox) {
      // Thursday: sit down, open the inbox and the Northwind email; the phone rings while you read it.
      await page.waitForFunction(() => window.__game.scene.getScene('Office').nearest?.id === 'my-desk', null, { timeout: 5000 }).catch(() => {});
      await page.keyboard.press('e');
      await page.waitForFunction(() => window.__game.scene.getScene('Office').computer.isOpen, null, { timeout: 5000 }).catch(() => {});
      await page.evaluate(() => window.__game.scene.getScene('Office').computer.openApp('mail'));
      await page.waitForTimeout(300);
      await page.click(`#screen-workstation [data-email="${setup.inbox}"]`).catch((e) => errors.push(`click: ${e.message}`));
      await page.waitForFunction(() => Object.values(window.__game.scene.getScene('Office').state.enc).some((e) => e.ringingAt != null), null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(500);
      const txt = await page.locator('#screen-workstation').innerText().catch(() => '');
      check('day4-inbox-banner: Northwind email shows the CAUTION external banner', txt.includes('CAUTION: This email came from outside your organization') && txt.includes('northwindsupplies-billing.com'));
      await page.screenshot({ path: `${out}/day4-inbox-banner.png` });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !window.__game.scene.getScene('Office').computer.isOpen && !window.__game.scene.getScene('Office').seated, null, { timeout: 5000 }).catch(() => {});
      await page.evaluate(() => { const s = window.__game.scene.getScene('Office'); for (let i = 0; i < 10 && s.dialog.isOpen; i++) s.dialog.advance(); });
    }
    const rang = await page.waitForFunction(() => {
      const s = window.__game.scene.getScene('Office');
      return Object.values(s.state.enc).some((e) => e.ringingAt != null && !e.done);
    }, null, { timeout: 20000 }).then(() => true, () => false);
    check(`${file}: desk phone rang by itself`, rang);
    await page.waitForTimeout(500);
    await page.waitForFunction(() => window.__game.scene.getScene('Office').nearest?.id === 'my-desk', null, { timeout: 5000 }).catch(() => {});
    await page.keyboard.press('e');
  } else {
    // Walk-up: wait for the coworker to arrive. Their intro line opens first; read it, then they talk.
    const npc = how.slice(7);
    const started = await page.waitForFunction((id) => window.__game.scene.getScene('Office').state.enc[id]?.started, file.split('-')[1], { timeout: 20000 }).then(() => true, () => false);
    check(`${file}: ${npc} walk-up fired by its trigger`, started);
    await page.waitForFunction(() => window.__game.scene.getScene('Office').dialog.isOpen, null, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.evaluate(() => { const d = window.__game.scene.getScene('Office').dialog; if (d.typing) d.finishLine(); d.advance(); });
    // runConversation starts once the npc has arrived and the intro is closed.
    await page.waitForFunction((npc) => {
      const s = window.__game.scene.getScene('Office');
      return s.dialog.isOpen && !s.npcInfo[npc].walking;
    }, npc, { timeout: 20000 }).catch(() => {});
  }

  // 4) Read through the opening to the last line (choices up, or the end of the briefing).
  const seen = await page.evaluate(async (briefing) => {
    const s = window.__game.scene.getScene('Office');
    const d = s.dialog;
    const seen = [];
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 40; i++) {
      if (!d.isOpen) { await sleep(200); continue; }
      seen.push(d.nameText.text + ': ' + d.lines[d.index]);
      if (d.choosing) break;
      if (d.typing) { await sleep(150); continue; }
      if (briefing && d.index === d.lines.length - 1) break; // a briefing: stop on its last line
      d.advance();
      await sleep(250);
    }
    return [...new Set(seen)];
  }, how.startsWith('talk:'));
  await page.waitForTimeout(3500); // let the typewriter finish the last line
  const hud = await page.evaluate(() => {
    const s = window.__game.scene.getScene('Office');
    const p = s.player, cam = s.cameras.main.worldView;
    const npcOnScreen = Object.fromEntries(Object.entries(s.npcs).map(([id, n]) => [id, cam.contains(n.x, n.y)]));
    return { obj: s.objectiveText.text, clock: s.clockText.text, minutes: s.minutes, player: [Math.round(p.x), Math.round(p.y)], npcOnScreen, speaker: s.dialog.nameText.text, choosing: !!s.dialog.choosing };
  });
  const text = seen.join(' ');
  check(`${file}: dialogue has "${expect}"`, text.includes(expect), text.includes(expect) ? '' : text.slice(0, 160));
  check(`${file}: HUD objective is "${objective}"`, hud.obj.includes(objective), hud.obj);
  if (how.startsWith('walkup:') || how.startsWith('talk:')) {
    const npc = how.split(':')[1];
    check(`${file}: ${npc} is on screen`, hud.npcOnScreen[npc] === true);
  }
  console.log(`      ${file}: ${hud.clock} | ${hud.obj.replace(/\n/g, ' ')} | speaker ${hud.speaker}${hud.choosing ? ' | choices shown' : ''}`);
  await page.screenshot({ path: `${out}/${file}.png` });
  await page.close();
}

// Side by side: the Thursday inbox (banner visible) next to Carla's call.
const banner = path.resolve(out, 'day4-inbox-banner.png');
const carla = path.resolve(out, 'day4-carla.png');
if (fs.existsSync(banner) && fs.existsSync(carla)) {
  const page = await (await browser.newContext({ viewport: { width: 2752, height: 960 } })).newPage();
  const b64 = (f) => `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`;
  await page.setContent(`<body style="margin:0;background:#111;color:#eee;font:20px sans-serif;display:flex;gap:20px;padding:10px">
    <div><div style="padding:6px 0">Thursday inbox: Northwind email with the CAUTION external banner</div><img src="${b64(banner)}" width="1356"></div>
    <div><div style="padding:6px 0">Carla's call a minute later: "It has the external banner, but every vendor email does."</div><img src="${b64(carla)}" width="1356"></div></body>`);
  await page.screenshot({ path: `${out}/day4-carla-vs-inbox.png`, fullPage: true });
  await page.close();
  check('day4-carla-vs-inbox.png written', true);
}
check('no console/network errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`RESULT: ${pass} passed, ${fail} failed, ${errors.length} console/network errors`);
process.exit(fail ? 1 : 0);
