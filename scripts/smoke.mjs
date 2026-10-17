// Browser smoke test: plays Day 1 in real Chrome with mouse clicks (so pathfinding and the HTML apps
// are exercised), checking each step. Screenshots go to the out dir.
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
      computer: s.computer.isOpen, soc: s.soc.isOpen,
      goal: s.objectiveText.text, flags: { ...s.flags, ...s.state.flags }, visited: [...s.state.visited],
      mail: JSON.parse(JSON.stringify(s.state.mail)), events: s.state.events.map((e) => e.type),
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

const W = '#screen-workstation';
const dlg = () => page.evaluate(() => { const d = window.__game.scene.getScene('Office').dialog; return { open: d.isOpen, choosing: !!d.choosing, name: d.nameText.text, text: d.full }; });
async function talkUntilChoice(ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const d = await dlg();
    if (d.choosing) return d;
    if (d.open) await page.keyboard.press('e');
    await page.waitForTimeout(120);
  }
  return dlg();
}
const visible = (sel) => page.locator(sel).first().isVisible().catch(() => false);
const text = (sel) => page.locator(sel).first().innerText().catch(() => '');

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

// ---------- M2: walking, Priya, badge ----------
await clickWorld(376, 146);
await waitArrive();
await page.waitForTimeout(400);
s = await state();
check('click-walk reaches the server door from the lobby', s.dialog && /denied/i.test(s.dialogText), `${s.x},${s.y} ${s.dialogText}`);
check('door stays locked without badge activation', !s.flags.serverOpen);
await closeDialog();

await clickWorld(220, 170);
await waitArrive();
await clickWorld(124, 96);
await waitArrive();
await page.waitForTimeout(300);
s = await state();
check('click on Priya walks over and starts talking', s.dialog && /SOC/.test(s.dialogText), `${s.x},${s.y} ${s.dialogText}`);
await page.screenshot({ path: `${out}/3-priya.png` });
await closeDialog();
s = await state();
check('talking to Priya activates the badge', s.flags.badgeActive && s.visited.includes('priya'));

// ---------- M3: the inbox ----------
await clickWorld(256, 128);
await waitArrive();
await page.waitForTimeout(600);
s = await state();
check('clicking your desk sits you down at the computer', s.computer, `${s.x},${s.y}`);
check('mail opens automatically the first time', await visible(`${W} .window[data-window=mail]`));
check('objective is now "Go through your email"', /email/.test(s.goal), s.goal);
const firstList = await page.locator(`${W} .item`).count();
check('4 emails are waiting at ~9:00 (the 5th arrives later)', firstList === 4, `${firstList}`);

// The fake password reset: hover, headers, explain, then fall for it on purpose.
await page.click(`${W} [data-email=it-reset]`);
await page.hover(`${W} [data-link=reset]`);
const status = await text(`${W} .status`);
check('hovering the link shows the real URL in the status bar', status.includes('login-verify.ru'), status);
await page.click(`${W} [data-action=headers]`);
check('View headers shows raw headers', (await text(`${W} .headers pre`)).includes('Authentication-Results'));
await page.click(`${W} [data-action=explain]`);
const notes = await page.locator(`${W} .headers .note`).count();
check('Explain adds plain-language notes', notes >= 3, `${notes} notes`);
await page.screenshot({ path: `${out}/4-headers.png` });
await page.click(`${W} [data-action=headers]`);
await page.click(`${W} [data-link=reset]`);
check('clicking the link opens the in-game browser on a "Not secure" page', (await text(`${W} .browser .addr`)).includes('Not secure'));
await page.fill(`${W} .browser input[type=password]`, 'hunter2');
await page.screenshot({ path: `${out}/5-phish-page.png` });
await page.click(`${W} [data-action=sign-in]`);
s = await state();
check('typing a password on the phishing page is recorded', s.mail['it-reset']?.enteredCreds && s.events.includes('creds-entered'));
check('the typed password is never stored', !JSON.stringify(await page.evaluate(() => ({ ...localStorage }))).includes('hunter2'));
await page.keyboard.press('Escape');
check('Esc closes the browser first', !(await visible(`${W} .browser`)) && (await visible(`${W} .window`)));
await page.click(`${W} [data-action=report]`);
s = await state();
check('Report phishing moves it to Reported', s.mail['it-reset']?.reported && (await page.locator(`${W} [data-email=it-reset]`).count()) === 0);

// Read the rest of the inbox.
for (const id of ['ms-signin', 'hr-benefits', 'priya-welcome']) await page.click(`${W} [data-email=${id}]`);
s = await state();
check('reading emails marks them read', ['ms-signin', 'hr-benefits', 'priya-welcome'].every((id) => s.mail[id]?.read));
check('inbox objective counts progress', /4\/5 read/.test(s.goal), s.goal);

// Jump the clock so the CEO email arrives.
await page.evaluate(() => { const sc = window.__game.scene.getScene('Office'); sc.minutes = 9 * 60 + 5; sc.tickMinute(); });
await page.waitForTimeout(1300);
check('the CEO email arrives while you are at the desk', (await page.locator(`${W} [data-email=ceo-giftcards]`).count()) === 1);
await page.click(`${W} [data-email=ceo-giftcards]`);
check('Reply-To is shown on the CEO email', (await text(`${W} .reader .head`)).includes('gmail.com'));
await page.click(`${W} [data-action=reply]`);
check('Reply goes to the Gmail Reply-To, not the CEO', (await text(`${W} [data-field=to]`)) === 'mark.holloway.ceo@gmail.com');
// Typing in the reply box must not move the player or trigger interactions.
const before = await state();
await page.click(`${W} .compose textarea`);
await page.keyboard.type('wasd e ');
const typed = await page.inputValue(`${W} .compose textarea`);
const afterType = await state();
check('typing in a text box works and does not move the player', typed.includes('wasd e') && afterType.x === before.x && afterType.y === before.y && !afterType.dialog);
await page.screenshot({ path: `${out}/6-compose.png` });
await page.click(`${W} [data-action=discard]`);
await page.click(`${W} [data-action=report]`);
s = await state();
check('reported the CEO email; inbox objective complete', s.mail['ceo-giftcards']?.reported && s.visited.includes('inbox'), s.goal);
await page.keyboard.press('2');
check('welcome.txt checklist ticks the email step', (await text(`${W} .notes-text`)).includes('[x] Go through your email'));
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
s = await state();
check('Esc closes the window, then stands up', !s.computer);

// ---------- M4: the alert fires; and because we typed our password into the phish, a second one ----------
await page.waitForTimeout(3500);
s = await state();
check('Priya pings you once the alert fires', s.dialog && /Priya/.test(await page.evaluate(() => window.__game.scene.getScene('Office').dialog.nameText.text)), s.dialogText);
await closeDialog();
await page.waitForTimeout(500);
await closeDialog();
s = await state();
check('the brute-force alert fired', s.events.filter((e) => e === 'alert-fired').length >= 1);
check('consequence: the stolen-password alert fired too', await page.evaluate(() => window.__game.scene.getScene('Office').state.soc.alerts['analyst01-foreign'] != null));

// ---------- M2: server room ----------
await clickWorld(300, 150);
await waitArrive();
await page.waitForTimeout(800);
await clickWorld(446, 168);
await waitArrive();
await page.waitForTimeout(400);
s = await state();
check('clicking past the closed door walks to it and badges in', s.flags.serverOpen && /green/.test(s.dialogText), s.dialogText);
await closeDialog();
await clickWorld(446, 168);
await waitArrive();
await page.waitForTimeout(1500);
s = await state();
check('walks through the open door and sits at the SOC console', s.soc && s.x > 384, `${s.x},${s.y}`);
const S = '#screen-soc';
await page.screenshot({ path: `${out}/7-soc.png` });
check('the SOC overview lists both alerts', (await page.locator(`${S} .alert-row`).count()) === 2);
await page.click(`${S} [data-alert=bruteforce-jalvarez]`);
await page.click(`${S} .iplookup[data-ip="185.220.101.47"]`);
check('IP lookup says it is a Tor exit node', (await text(`${S} .ipcard`)).includes('Tor'));
await page.click(`${S} [data-action=investigate]`);
const search = async (q) => { await page.fill(`${S} .q`, q); await page.waitForTimeout(350); };
await search('185.220.101.47 4624');
check('searching the IP + 4624 finds exactly the one successful logon', (await page.locator(`${S} .row`).count()) === 1 && (await page.locator(`${S} .row[data-key=success]`).count()) === 1);
await page.click(`${S} .row[data-key=success] .flag`);
await page.click(`${S} .row[data-key=success] .msg`);
check('clicking a line shows the raw Windows event', (await text(`${S} .raw`)).includes('185.220.101.47'));
await search('j.alvarez -185.220 4624');
await page.click(`${S} .row[data-key=real-jalvarez] .flag`);
await search('bank_details');
await page.click(`${S} .row[data-key=exfil] .flag`);
await search('4625 j.alvarez');
check('38 failed logons for j.alvarez', /^38 events/.test(await text(`${S} .count`)), await text(`${S} .count`));
await page.screenshot({ path: `${out}/8-search.png` });
await page.click(`${S} [data-tab=case]`);
check('the case lists the 3 flagged lines as evidence', (await text(`${S} .evidence`)).split(String.fromCharCode(10)).length === 3);
await page.check(`${S} input[name=verdict][value=compromised]`);
for (const a of ['disable', 'block', 'scope', 'mfa']) await page.check(`${S} input[name=action][value=${a}]`);
await page.screenshot({ path: `${out}/9-case.png` });
await page.click(`${S} [data-action=submit-case]`);
s = await state();
const cf = await page.evaluate(() => window.__game.scene.getScene('Office').state.soc.cases['bruteforce-jalvarez']);
check('submitting the case completes the objective', cf?.verdict === 'compromised' && cf.evidence.length === 3 && s.visited.includes('soc'), s.goal);
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.waitForTimeout(3600);
s = await state();
check('door closes behind you while you are inside', !s.flags.serverOpen && s.x > 384);
await clickWorld(330, 170);
await waitArrive();
await page.waitForTimeout(400);
s = await state();
check('clicking outside from the closed server room badges you out', s.flags.serverOpen, `${s.x},${s.y}`);
await closeDialog();
await clickWorld(300, 190);
s = await waitArrive();
check('walks back out of the server room', s.x < 368, `${s.x},${s.y}`);
await page.waitForTimeout(3600);
s = await state();
const solid = await page.evaluate(() => {
  const sc = window.__game.scene.getScene('Office');
  return sc.wallsLayer.getTileAt(23, 8)?.collides && sc.wallsLayer.getTileAt(23, 9)?.collides && sc.nav.pointBlocked(376, 150);
});
check('server door closes behind you and is solid again', !s.flags.serverOpen && solid);
await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(4000);
await page.keyboard.up('ArrowLeft');
s = await state();
check('keyboard movement stops at the outer wall', s.x >= 20 && s.x < 40, `${s.x},${s.y}`);

// ---------- M5: the phone call and the USB stick ----------
s = await state();
check('the desk phone is ringing after the case', await page.evaluate(() => { const sc = window.__game.scene.getScene('Office'); return sc.state.enc.phone?.ringingAt != null && sc.ringIcon?.visible; }));
check('objective: answer your desk phone', /phone/.test(s.goal), s.goal);
await clickWorld(256, 128);
await waitArrive();
let d = await talkUntilChoice();
check('"Mike from Sales" asks for a password reset, with 4 choices', d.choosing && /Caller/.test(d.name) && (await page.evaluate(() => window.__game.scene.getScene('Office').dialog.choiceItems.length)) === 4, d.name);
await page.screenshot({ path: `${out}/10-phone.png` });
await page.keyboard.press('3'); // call back on the directory number
d = await talkUntilChoice();
check('the caller pushes back with authority and urgency', /Mark Holloway/.test(d.text), d.text);
// Click the first choice with the mouse ("Directory number, or it doesn't happen").
{
  const pos = await page.evaluate(() => { const t = window.__game.scene.getScene('Office').dialog.choiceItems[0]; return { x: t.x + 30, y: t.y + t.height / 2 }; });
  const box = await page.locator('canvas').boundingBox();
  const k = box.width / 960;
  await page.mouse.click(box.x + pos.x * k, box.y + pos.y * k);
}
await page.waitForTimeout(300);
for (let i = 0; i < 40 && (await dlg()).open && !/Dana/.test((await dlg()).name); i++) { await page.keyboard.press('e'); await page.waitForTimeout(110); }
s = await state();
let ph = await page.evaluate(() => window.__game.scene.getScene('Office').state.enc.phone);
check('calling back exposes the fake; outcome recorded', ph?.outcome === 'callback-verified' && ph.done && s.visited.includes('phone'), JSON.stringify(ph));

// Dana walks over with a USB stick.
d = await talkUntilChoice(20000);
const dana = await page.evaluate(() => { const sc = window.__game.scene.getScene('Office'); return { dx: Math.abs(sc.npcs.dana.x - sc.player.x), dy: Math.abs(sc.npcs.dana.y - sc.player.y) }; });
check('Dana walks up to you and offers the USB stick', d.choosing && /USB|plug/.test(d.text) && dana.dx + dana.dy < 40, `${JSON.stringify(dana)} ${d.text}`);
await page.screenshot({ path: `${out}/11-usb.png` });
check('the phone stops ringing once answered', !(await page.evaluate(() => window.__game.scene.getScene('Office').ringIcon.visible)));
await page.keyboard.press('2');
await closeDialog();
await page.waitForTimeout(4000);
const usb = await page.evaluate(() => { const sc = window.__game.scene.getScene('Office'); return { usb: sc.state.enc.usb, back: Math.hypot(sc.npcs.dana.x - 348, sc.npcs.dana.y - 154) < 3 }; });
check('handing the USB to the SOC is recorded; Dana goes back to her desk', usb.usb?.outcome === 'handed-to-soc' && usb.back, JSON.stringify(usb));

// ---------- Save / continue ----------
const visitedBefore = (await state()).visited.length;
await page.reload();
await page.waitForFunction(() => window.__game?.scene.isActive('Title'));
await page.waitForTimeout(300);
await page.keyboard.press('c');
await page.waitForFunction(() => window.__game.scene.isActive('Office'));
await page.waitForTimeout(800);
s = await state();
check('Continue restores progress after a reload', s.visited.length === visitedBefore && s.mail['it-reset']?.enteredCreds, `${s.visited.length}/${visitedBefore}`);

// ---------- M6: debrief and the report card (continuing from the restored save) ----------
s = await state();
check('objective: debrief with Priya', /Priya/.test(s.goal), s.goal);
await closeDialog();
await clickWorld(220, 170);
await waitArrive();
await page.waitForTimeout(600);
await clickWorld(124, 96);
await waitArrive();
await page.waitForTimeout(300);
d = await dlg();
check('Priya debriefs you and mentions what happened with your password', d.open && /Priya/.test(d.name), d.text);
const debriefText = await page.evaluate(() => window.__game.scene.getScene('Office').dialog.lines.join(' '));
check('the debrief reveals consequences (stolen password, USB analysis)', /Russia/.test(debriefText) && /keystroke injector/.test(debriefText), debriefText.slice(0, 120));
await closeDialog();
await page.waitForFunction(() => window.__game.scene.isActive('Report'), null, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(500);
check('the day ends with the report card', await visible('#report'));
const grade = await page.getAttribute('#report .grade', 'data-grade').catch(() => null);
const reportText = await text('#report');
check('report: 90% but capped at B (one outright miss)', grade === 'B' && reportText.includes('90%') && reportText.includes('caps the day at B'), `${grade}`);
check('report: the phishing password is a miss with a cost', (await page.getAttribute('#report [data-item=mail-it-reset]', 'class'))?.includes('bad') && reportText.includes('$10,500'));
check('report: lists Security+ objectives', /Security\+ 2\.2/.test(reportText) && /Security\+ 4\.9/.test(reportText));
await page.screenshot({ path: `${out}/12-report.png` });
await page.click('#report [data-action=play-again]');
await page.waitForFunction(() => window.__game.scene.isActive('Title'));
await page.waitForTimeout(300);
check('Play again clears the save and returns to the title', !(await page.evaluate(() => localStorage.getItem('cyber-office:save:v2'))) && !(await visible('#report')));

// A second day after "Play again" must work too (the scene object is reused by Phaser).
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game.scene.isActive('Office'));
await page.waitForTimeout(1000);
await closeDialog();
const y0 = (await state()).y;
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(600);
await page.keyboard.up('ArrowUp');
const y1 = (await state()).y;
check('Play again: the new day starts fresh and you can move', y1 < y0 - 10 && (await state()).visited.length === 0, `${y0} -> ${y1}`);
await page.evaluate(() => window.__game.scene.getScene('Office').onCaseSubmitted());
await page.waitForTimeout(4800);
check('Play again: the phone still rings on day two', await page.evaluate(() => window.__game.scene.getScene('Office').state.enc.phone?.ringingAt != null));
check('only one set of computer screens exists after a restart', (await page.locator('#screen-workstation').count()) === 1 && (await page.locator('#screen-soc').count()) === 1);

// Sound: the engine initializes and the mute toggle works.
{
  const r = await page.evaluate(() => { const s = window.__sound; s.resume(); s.play('click'); const was = s.muted; const o = window.__game.scene.getScene('Office'); o.toggleMute(); const m = s.muted; o.toggleMute(); return { ctx: !!s.ctx, toggled: m !== was, label: o.muteBtn.text }; });
  check('sound engine starts and mute toggles', r.ctx && r.toggled && /Sound/.test(r.label), JSON.stringify(r));
}

check('no console errors', errors.length === 0, errors.join(' | '));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `SMOKE FAIL (${failed} of ${results.length})` : `SMOKE PASS (${results.length} checks)`);
await browser.close();
process.exit(failed ? 1 : 0);
