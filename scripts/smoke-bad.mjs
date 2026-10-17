// Second browser test: play the WORST possible day, fast (teleporting between spots), to make sure
// every bad-choice path works and ends in an F with the right consequences.
// Usage: same as smoke.mjs:  node scripts/smoke-bad.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.argv[2] || 'http://localhost:4173/cyber-office/';
const out = process.argv[3] || 'smoke-out/bad';
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

const sc = (fn, arg) => page.evaluate(`(${fn})(window.__game.scene.getScene('Office'), ${JSON.stringify(arg ?? null)})`);
const dlg = () => sc((s) => ({ open: s.dialog.isOpen, choosing: !!s.dialog.choosing, name: s.dialog.nameText.text, text: s.dialog.full }));
async function drain(untilChoice = false, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const d = await dlg();
    if (untilChoice && d.choosing) return d;
    if (!d.open && !untilChoice) return d;
    if (d.open && !d.choosing) await page.keyboard.press('e');
    await page.waitForTimeout(110);
  }
  return dlg();
}
// Teleport next to a thing and use it.
async function use(x, y) {
  await sc((s, [px, py]) => { s.path = null; s.player.setPosition(px, py); s.player.body.reset(px, py); }, [x, y]);
  await page.waitForTimeout(150);
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
}
const W = '#screen-workstation';
const S = '#screen-soc';

await page.goto(url);
await page.waitForFunction(() => window.__game?.scene.isActive('Title'));
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game.scene.isActive('Office'));
await page.waitForTimeout(900);
await drain();

await use(136, 104); // Priya
await drain();
await use(256, 146); // desk
await page.waitForTimeout(400);
// Worst email choices: report the real ones, fall for both phish.
for (const id of ['ms-signin', 'hr-benefits']) {
  await page.click(`${W} [data-email=${id}]`);
  await page.click(`${W} [data-action=report]`);
}
await page.click(`${W} [data-email=priya-welcome]`);
await page.click(`${W} [data-email=it-reset]`);
await page.click(`${W} [data-link=reset]`);
await page.fill(`${W} .browser input[type=password]`, 'Summer2026!');
await page.click(`${W} [data-action=sign-in]`);
await page.keyboard.press('Escape');
await sc((s) => { s.minutes = 9 * 60 + 5; s.tickMinute(); });
await page.waitForTimeout(1300);
await page.click(`${W} [data-email=ceo-giftcards]`);
await page.click(`${W} [data-action=reply]`);
await page.click(`${W} [data-action=send]`);
const sent = await sc((s) => s.state.events.find((e) => e.type === 'reply-sent'));
check('reply to the CEO scam was sent to Gmail', sent?.to === 'mark.holloway.ceo@gmail.com');
await page.click(`${W} [data-folder=sent]`);
check('Sent folder shows the reply', (await page.locator(`${W} .list .item`).count()) === 1);
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('reporting real emails still completes the inbox step', await sc((s) => s.isDone('inbox')));
await page.waitForTimeout(3200);
await drain();
await page.waitForTimeout(500);
await drain();

// Wrong case: "he forgot his password", bad actions, flag only noise.
await sc((s) => { s.state.flags.badgeActive = true; s.setServerDoor(true); });
await use(456, 186);
await page.waitForTimeout(400);
await page.click(`${S} [data-tab=search]`);
await page.fill(`${S} .q`, 'invalid user');
await page.waitForTimeout(350);
await page.click(`${S} .row .flag`);
await page.click(`${S} [data-tab=case]`);
await page.check(`${S} input[name=verdict][value=forgot]`);
await page.click(`${S} [data-action=submit-case]`);
check('case form refuses to submit without a response action', (await page.locator(`${S} .formmsg`).innerText()).includes('response'));
await page.check(`${S} input[name=action][value=close]`);
await page.check(`${S} input[name=action][value=reboot]`);
await page.click(`${S} [data-action=submit-case]`);
check('wrong case submitted', await sc((s) => s.state.soc.cases['bruteforce-jalvarez']?.verdict === 'forgot'));
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
await page.waitForTimeout(4500);
await drain();

// Phone: cave immediately.
await use(256, 146);
let d = await drain(true);
check('phone call offers choices', d.choosing, d.name);
await page.keyboard.press('1');
await drain();
check('password reset given away', await sc((s) => s.state.enc.phone?.outcome === 'reset'));
// USB: plug it in.
d = await drain(true, 20000);
check('Dana offers the USB stick', d.choosing && /USB|plug/.test(d.text));
await page.keyboard.press('1');
await drain();
check('USB plugged in', await sc((s) => s.state.enc.usb?.outcome === 'plugged'));
await page.waitForTimeout(2500);

// Debrief + report.
await use(136, 104);
const lines = await sc((s) => s.dialog.lines.join(' '));
check('debrief names every consequence', /Russia/.test(lines) && /gift cards/.test(lines) && /Lagos/.test(lines) && /reimaged/.test(lines), lines.slice(0, 100));
await drain();
await page.waitForFunction(() => window.__game.scene.isActive('Report'), null, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(500);
const grade = await page.getAttribute('#report .grade', 'data-grade').catch(() => null);
const report = await page.locator('#report').innerText().catch(() => '');
check('worst day is graded F', grade === 'F', grade);
check('report totals the damage', /\$\d{3},\d{3}/.test(report), report.match(/Cost to the company: \S+/)?.[0]);
check('false positives show as partial, not misses', (await page.getAttribute('#report [data-item=mail-hr-benefits]', 'class'))?.includes('ok'));
await page.screenshot({ path: `${out}/report-F.png` });

// Continue on a finished day goes back to the report.
await page.reload();
await page.waitForFunction(() => window.__game?.scene.isActive('Title'));
await page.waitForTimeout(300);
await page.keyboard.press('c');
await page.waitForFunction(() => window.__game.scene.isActive('Report'), null, { timeout: 5000 }).catch(() => {});
check('Continue after the day is over reopens the report', await page.locator('#report').isVisible().catch(() => false));

check('no console errors', errors.length === 0, errors.join(' | '));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `SMOKE-BAD FAIL (${failed} of ${results.length})` : `SMOKE-BAD PASS (${results.length} checks)`);
await browser.close();
process.exit(failed ? 1 : 0);
