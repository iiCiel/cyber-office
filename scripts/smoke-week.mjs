// Full-week smoke test: plays all five days end to end in real Chrome, driving the game with scripted
// "do a good day" actions, and checks each day's alert, case, encounters and the final week ending.
// It uses helpers that teleport the player to speed things up (keyboard/click walking is covered by smoke.mjs).
// Usage: npm run build; npx vite preview --port 4173 --strictPort (background); node scripts/smoke-week.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.argv[2] || 'http://localhost:4173/cyber-office/';
const out = process.argv[3] || 'smoke-out/week';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const results = [];
const check = (name, ok, info = '') => {
  results.push({ ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`);
};

const O = () => window.__game.scene.getScene('Office');
const sc = (fn, arg) => page.evaluate(`(${fn})(window.__game.scene.getScene('Office'), ${JSON.stringify(arg ?? null)})`);
const st = () => sc((s) => ({ day: s.day.n, minutes: s.minutes, dialog: s.dialog.isOpen, choosing: !!s.dialog.choosing, name: s.dialog.nameText.text, text: s.dialog.full, soc: s.soc.isOpen, computer: s.computer.isOpen, visited: [...s.state.visited], goal: s.objectiveText.text }));
const W = '#screen-workstation';
const S = '#screen-soc';
const vis = (sel) => page.locator(sel).first().isVisible().catch(() => false);
const txt = (sel) => page.locator(sel).first().innerText().catch(() => '');

async function drain(untilChoice = false, ms = 20000) {
  const t0 = Date.now();
  let quiet = 0;
  while (Date.now() - t0 < ms) {
    const s = await st();
    if (untilChoice && s.choosing) return s;
    if (!s.dialog) {
      if (!untilChoice && ++quiet >= 3) return s; // a few quiet frames: nothing more is queued
    } else {
      quiet = 0;
      if (!s.choosing) await page.keyboard.press('e');
    }
    await page.waitForTimeout(90);
  }
  return st();
}
async function closeOverlay() {
  for (let i = 0; i < 6; i++) {
    if (!(await sc((s) => s.computer.isOpen || s.soc.isOpen))) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(160);
  }
}
// Answer a ringing phone: clear any chat first, then interact at the desk.
async function answerDesk() {
  await waitRing();
  // A queued chat (e.g. an alert that became ready at the same time) can block the first try; retry.
  for (let i = 0; i < 4; i++) {
    await drain();
    await teleUse(256, 146);
    const s = await drain(true, 6000);
    if (s.choosing) return s;
    if (!(await sc((o) => !!o.ringingEncounter()))) return s; // phone already answered/gone
  }
  return st();
}
async function teleUse(x, y) {
  await sc((s, [px, py]) => { s.path = null; s.pending = null; s.player.setPosition(px, py); s.player.body.reset(px, py); }, [x, y]);
  await page.waitForTimeout(140);
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
}
const setMinutes = (m) => sc((s, mm) => { s.minutes = mm; s.tickMinute(); }, m);
async function waitRing(fallbackAt) {
  // The phone fires on a real ~4s timer after its 'after' objective. Poll real time; nudge the
  // clock to the fallback once so a time-gated call (Day 4) can't stall the test.
  if (fallbackAt) await setMinutes(fallbackAt);
  for (let i = 0; i < 80; i++) {
    if (await sc((s) => !!s.ringingEncounter())) return true;
    await page.waitForTimeout(150);
  }
  return false;
}
async function waitAlertThenSit() {
  // fast-forward the clock until the main alert fires, then go to the server room + SOC.
  for (let i = 0; i < 40; i++) {
    const fired = await sc((s) => { const a = s.day.alerts.find((x) => x.main); return s.state.soc.alerts[a.id] != null; });
    if (fired) break;
    await setMinutes((await st()).minutes + 5);
    await page.waitForTimeout(120);
  }
  await drain();
  await sc((s) => { s.state.flags.badgeActive = true; s.setServerDoor(true); });
  await teleUse(446, 186); // SOC console
  await page.waitForTimeout(500);
}
async function doCase(verdict, actions, evidenceQuery) {
  // flag one real evidence line, pick verdict + actions, submit.
  await page.click(`${S} [data-tab=search]`);
  await page.fill(`${S} .q`, evidenceQuery);
  await page.waitForTimeout(350);
  const flags = await page.locator(`${S} .row .flag`).count();
  if (flags) await page.locator(`${S} .row .flag`).first().click();
  await page.click(`${S} [data-tab=case]`);
  await page.check(`${S} input[name=verdict][value=${verdict}]`);
  for (const a of actions) await page.check(`${S} input[name=action][value=${a}]`).catch(() => {});
  await page.click(`${S} [data-action=submit-case]`);
  await page.waitForTimeout(300);
}
async function readAllMail() {
  // Advance the clock so every email (including late arrivals) is delivered, then read them all.
  const latest = await page.evaluate(() => Math.max(...window.__game.scene.getScene('Office').day.emails.map((e) => e.at)));
  await setMinutes(latest + 1);
  await page.waitForTimeout(400);
  const ids = await page.evaluate(() => window.__game.scene.getScene('Office').day.emails.map((e) => e.id));
  for (const id of ids) {
    for (let i = 0; i < 3 && !(await page.locator(`${W} [data-email=${id}]`).count()); i++) await page.waitForTimeout(200);
    if (await page.locator(`${W} [data-email=${id}]`).count()) { await page.click(`${W} [data-email=${id}]`).catch(() => {}); await page.waitForTimeout(80); }
  }
}
async function doAllTickets(pick) {
  for (const t of await page.evaluate(() => window.__game.scene.getScene('Office').day.tickets?.map((x) => x.id) || [])) {
    await page.click(`${W} [data-ticket=${t}]`).catch(() => {});
    const opt = pick[t] || (await page.locator(`${W} .topt`).first().getAttribute('data-option'));
    await page.click(`${W} [data-option=${opt}]`).catch(() => {});
    await page.waitForTimeout(120);
  }
}

// Plans: for each day, the good choices.
const PLAN = {
  1: { verdict: 'compromised', actions: ['disable', 'block', 'scope', 'mfa'], ev: 'j.alvarez 4624 185.220' },
  2: { verdict: 'fatigue', actions: ['revoke', 'rule', 'numbermatch', 'block'], ev: 'mfa reason=USER_APPROVED', tickets: { 'payroll-access': 'approval', 'okafor-reset': 'temp', teamviewer: 'help' } },
  3: { verdict: 'sqli', actions: ['offline', 'fix', 'resetpw', 'notify', 'block'], ev: '1843221' },
  4: { verdict: 'exfil', actions: ['disable', 'blockcloud', 'blockip', 'restrict', 'legal'], ev: 'mega', tickets: { backup: 'fix', forward: 'mdm' } },
  5: { verdict: 'isolate', actions: ['isolate-net', 'disable-task', 'kill-accounts', 'restore', 'legal'], ev: 'Updater' },
};

await page.goto(url);
await page.waitForFunction(() => window.__game?.scene.isActive('Title'));
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game.scene.isActive('Office'));

for (let day = 1; day <= 5; day++) {
  const p = PLAN[day];
  await page.waitForTimeout(900);
  await drain();
  let s = await st();
  check(`day ${day}: started`, s.day === day, `day=${s.day}`);

  // Priya briefing.
  await teleUse(136, 104);
  await drain();

  // Desk: email (+ tickets on Day 2/4), handle the Carla phone call on Day 4.
  await teleUse(256, 146);
  await page.waitForTimeout(500);
  if (await vis(`${W} .window[data-window=mail]`)) {
    await readAllMail();
    // Terminal objective on Day 3: run whois.
    if (day === 3) {
      await page.keyboard.press('3');
      await page.waitForTimeout(150);
      await page.locator(`${W} .term-in`).fill('whois 198.51.100.23');
      await page.locator(`${W} .term-in`).press('Enter');
      await page.waitForTimeout(150);
      check('day 3: whois shows the bulletproof host', (await txt(`${W} .term-out`)).includes('ShadowHost'));
    }
    if (p.tickets) {
      await page.keyboard.press(day === 2 ? '4' : '4'); // tickets icon index varies; click instead
      await page.click(`${W} [data-app=tickets]`).catch(() => {});
      await page.waitForTimeout(200);
      await doAllTickets(p.tickets);
    }
  }
  await closeOverlay();
  await page.waitForTimeout(200);

  // Day 4: the phone rings (Carla). Answer at the desk, choose "callback".
  if (day === 4) {
    await setMinutes(9 * 60 + 35);
    const c = await answerDesk();
    check('day 4: Carla calls', c.choosing, c.name);
    await page.keyboard.press('1'); // call back on file number
    await drain();
  }

  // The alert + case.
  await waitAlertThenSit();
  check(`day ${day}: at the SOC console`, (await st()).soc, '');
  if (day === 5) {
    const crisis = await sc((s) => !!s.state.crisis);
    check('day 5: the ransomware crisis counter is live', crisis);
  }
  await doCase(p.verdict, p.actions, p.ev);
  const caseOk = await sc((s, v) => { const a = s.day.alerts.find((x) => x.main); return s.state.soc.cases[a.id]?.verdict === v; }, p.verdict);
  check(`day ${day}: case submitted (${p.verdict})`, caseOk);
  if (day === 5) {
    const contained = await sc((s) => s.state.crisis?.stopped && s.state.crisis?.contained);
    check('day 5: the crisis was contained', contained);
  }
  await closeOverlay();
  await page.waitForTimeout(400);
  await drain(); // clear any queued chat so encounters/debrief can start

  // Day 1: the desk phone rings (vishing), then Dana walks up with the USB stick.
  if (day === 1) {
    const c = await answerDesk();
    check('day 1: the phone rings (vishing)', c.choosing, c.name);
    await page.keyboard.press('3'); // call back on the directory number
    await drain(true);
    await page.keyboard.press('1'); // insist
    await drain();
    const u = await drain(true, 25000);
    check('day 1: Dana walks up with the USB', u.choosing, u.text.slice(0, 30));
    await page.keyboard.press('2'); // hand to SOC
    await drain();
    await page.waitForTimeout(3500);
  }

  // Day 2: Mike walks up after the case. Be supportive.
  if (day === 2) {
    const m = await drain(true, 25000);
    check('day 2: Mike walks up', m.choosing, m.text.slice(0, 40));
    await page.keyboard.press('1');
    await drain();
    await page.waitForTimeout(3500);
  }
  // Day 3: Theo walks up. File the change request.
  if (day === 3) {
    const th = await drain(true, 25000);
    check('day 3: Theo walks up about the WAF', th.choosing, th.text.slice(0, 40));
    await page.keyboard.press('2');
    await drain();
    await page.waitForTimeout(3500);
  }

  // Debrief with Priya -> report.
  await drain();
  // Debrief can be briefly gated by an NPC walking home; retry the Priya interaction a couple of times.
  for (let i = 0; i < 4 && !(await page.evaluate(() => window.__game.scene.isActive('Report'))); i++) {
    await drain();
    await teleUse(136, 104);
    await drain();
    await page.waitForFunction(() => window.__game.scene.isActive('Report'), null, { timeout: 6000 }).catch(() => {});
  }
  await page.waitForTimeout(500);
  check(`day ${day}: report card shown`, await vis('#report'));
  const grade = await page.getAttribute('#report .grade', 'data-grade').catch(() => null);
  check(`day ${day}: graded (${grade})`, ['A', 'B', 'C', 'D', 'F'].includes(grade), grade);
  await page.screenshot({ path: `${out}/day${day}.png` });

  if (day < 5) {
    await page.click('#report [data-action=next-day]');
    await page.waitForFunction(() => window.__game.scene.isActive('Office'));
  } else {
    check('week summary shown', await vis('#report [data-week]'));
    const ending = await txt('#report .ending h3');
    check('the week has an ending', ending.length > 0, ending);
    const wkGrade = await page.getAttribute('#report [data-week-grade]', 'data-week-grade').catch(() => null);
    check('a good week ends well', wkGrade === 'A' || wkGrade === 'B', wkGrade);
    await page.screenshot({ path: `${out}/week.png` });
  }
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `WEEK FAIL (${failed} of ${results.length})` : `WEEK PASS (${results.length} checks)`);
await browser.close();
process.exit(failed ? 1 : 0);
