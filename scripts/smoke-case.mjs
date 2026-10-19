// Case Files smoke test: opens the Case Files menu, plays the Uber 2022 case end to end in real Chrome
// (good choices), and checks the alert, the Terminal hunt for the hardcoded password, the case, the
// "what really happened" report, the resume line, best-score tracking, and that the week save is untouched.
// Usage: npm run build; npx vite preview --port 4173 --strictPort (background); node scripts/smoke-case.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const url = process.argv[2] || 'http://localhost:4173/cyber-office/';
const out = process.argv[3] || 'smoke-out/case';
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
const st = () => sc((s) => ({ minutes: s.minutes, dialog: s.dialog.isOpen, choosing: !!s.dialog.choosing, name: s.dialog.nameText.text, text: s.dialog.full, soc: s.soc.isOpen, visited: [...s.state.visited], caseId: s.state.caseId, title: s.day.title }));
const W = '#screen-workstation';
const S = '#screen-soc';
// Splunk lists the newest event first, so "the first row" is no longer the earliest. Flag every row that carries an evidence key (or the first row when none do).
const flagBest = async () => {
  await page.selectOption(`${S} select.per`, '100').catch(() => {}); // newest first + 20 per page: show everything
  const n = await page.locator(`${S} .row[data-key]`).count();
  if (!n) return page.locator(`${S} .row .flag`).first().click();
  for (let i = 0; i < n; i++) await page.locator(`${S} .row[data-key] .flag`).nth(i).click();
};

const vis = (sel) => page.locator(sel).first().isVisible().catch(() => false);
const txt = (sel) => page.locator(sel).first().innerText().catch(() => '');
const active = (k) => page.evaluate((key) => window.__game.scene.isActive(key), k);

async function drain(untilChoice = false, ms = 20000) {
  const t0 = Date.now();
  let quiet = 0;
  while (Date.now() - t0 < ms) {
    const s = await st();
    if (untilChoice && s.choosing) return s;
    if (!s.dialog) {
      if (!untilChoice && ++quiet >= 3) return s;
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
async function teleUse(x, y) {
  await sc((s, [px, py]) => { s.path = null; s.pending = null; s.player.setPosition(px, py); s.player.body.reset(px, py); }, [x, y]);
  await page.waitForTimeout(140);
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
}
const setMinutes = (m) => sc((s, mm) => { s.minutes = mm; s.tickMinute(); }, m);

await page.goto(url);
await page.waitForFunction(() => window.__game?.scene.isActive('Title'));

// ONLY=id1,id2 plays just those cases from the plans below (skips the long Uber walkthrough).
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
if (ONLY) {
  await page.waitForTimeout(300);
  await page.keyboard.press('f');
}
uber: {
if (ONLY) break uber;
// Start the week first, so we can prove a case never touches the week's save.
await page.keyboard.press('Enter');
await page.waitForFunction(() => window.__game.scene.isActive('Office'));
await page.waitForTimeout(600);
await page.evaluate(() => { window.__game.scene.stop('Office'); window.__game.scene.start('Title'); });
await page.waitForFunction(() => window.__game.scene.isActive('Title'));
const weekBefore = await page.evaluate(() => localStorage.getItem('cyber-office:save:v2'));
check('a week save exists before the case', !!weekBefore);

// Title -> Case Files (F key).
await page.waitForTimeout(300);
await page.keyboard.press('f');
await page.waitForFunction(() => window.__game.scene.isActive('CaseFiles'));
check('Case Files menu opens from the title (F)', await vis('#cases'));
check('the Uber 2022 card is listed with sources-based pitch', (await txt('#cases [data-case=uber-2022]')).includes('Uber'));
await page.screenshot({ path: `${out}/1-menu.png` });
await page.click('#cases [data-case=uber-2022] [data-action=open-case]');
await page.waitForFunction(() => window.__game.scene.isActive('Office'));
await page.waitForTimeout(900);
let s = await st();
check('the case starts in case mode', s.caseId === 'uber-2022', `${s.caseId} / ${s.title}`);
check('the clock starts at 4:24 PM on the real date', (await sc((o) => o.clockText.text)).includes('THU') && s.minutes === 16 * 60 + 24, await sc((o) => o.clockText.text));
await drain();

// Briefing.
await teleUse(136, 104);
const brief = await sc((o) => o.dialog.full);
await drain();
check('Priya frames it as a replay of a real breach', /real breach/i.test(brief), brief.slice(0, 60));

// Inbox: read everything, report the copycat phish.
await teleUse(256, 146);
await page.waitForTimeout(500);
await setMinutes(16 * 60 + 25);
await page.waitForTimeout(400);
for (const id of ['contractor', 'mfa-digest', 'sso-reverify']) {
  await page.click(`${W} [data-email=${id}]`).catch(() => {});
  await page.waitForTimeout(120);
}
check('the contractor\'s WhatsApp report is in the inbox', (await txt(`${W} .window[data-window=mail]`)).includes('WhatsApp'));
await page.click(`${W} [data-action=report]`);
await page.waitForTimeout(200);
const reported = await sc((o) => !!o.state.mail['sso-reverify']?.reported);
check('reported the copycat phish', reported);
await closeOverlay();
await page.waitForTimeout(300);
await drain();

// Mike walks up about #general.
const m = await drain(true, 25000);
check('Mike walks up about the Slack post', m.choosing && /joke/.test(m.text), m.text.slice(0, 50));
await page.keyboard.press('1');
await drain();

// The alert fires; Priya points at the Terminal.
for (let i = 0; i < 30 && !(await sc((o) => o.state.soc.alerts['uber-pam'] != null)); i++) await page.waitForTimeout(200);
check('the critical vault-admin alert fires', await sc((o) => o.state.soc.alerts['uber-pam'] != null));
await drain();

// Terminal: grep the share.
await teleUse(256, 146);
await page.waitForTimeout(400);
await page.click(`${W} [data-app=terminal]`);
await page.waitForTimeout(200);
await page.locator(`${W} .term-in`).fill('grep -ril password /mnt/fs-it01/IT');
await page.locator(`${W} .term-in`).press('Enter');
await page.waitForTimeout(150);
const termOut = await txt(`${W} .term-out`);
check('grep -ril lists pam-sync.ps1', termOut.includes('/mnt/fs-it01/IT/scripts/pam-sync.ps1'), termOut.split('\n').slice(-4).join(' | '));
await page.locator(`${W} .term-in`).fill('cat /mnt/fs-it01/IT/scripts/pam-sync.ps1');
await page.locator(`${W} .term-in`).press('Enter');
await page.waitForTimeout(150);
check('the script shows the hardcoded vault admin (password redacted)', (await txt(`${W} .term-out`)).includes('$Username = "ss-admin"'));
check('the prompt is the Ubuntu jump host', (await txt(`${W} .term-prompt`)).includes('soc-jump01'));
await page.screenshot({ path: `${out}/2-terminal.png` });
check('the Terminal objective completes', await sc((o) => o.state.visited.includes('script')));
await closeOverlay();
await drain();

// SOC case.
await sc((o) => { o.state.flags.badgeActive = true; o.setServerDoor(true); });
await teleUse(446, 186);
await page.waitForTimeout(500);
check('at the SOC console', (await st()).soc);
await page.click(`${S} [data-tab=search]`);
await page.fill(`${S} .q`, 'ss-admin Login');
await page.waitForTimeout(350);
const rows = await page.locator(`${S} .row .flag`).count();
check('SIEM search finds the vault admin login', rows >= 1, `${rows} rows`);
if (rows) await flagBest();
await page.fill(`${S} .q`, 'pam-sync');
await page.waitForTimeout(350);
if (await page.locator(`${S} .row .flag`).count()) await flagBest();
await page.screenshot({ path: `${out}/3-siem.png` });
await page.click(`${S} [data-tab=case]`);
await page.check(`${S} input[name=verdict][value=takeover]`);
for (const a of ['disable', 'rotate', 'reauth', 'freeze', 'scripts', 'mfa']) await page.check(`${S} input[name=action][value=${a}]`);
await page.click(`${S} [data-action=submit-case]`);
await page.waitForTimeout(300);
check('case submitted', await sc((o) => o.state.soc.cases['uber-pam']?.verdict === 'takeover'));
await closeOverlay();
await drain();

// Debrief -> report.
for (let i = 0; i < 4 && !(await active('Report')); i++) {
  await drain();
  await teleUse(136, 104);
  await drain();
  await page.waitForFunction(() => window.__game.scene.isActive('Report'), null, { timeout: 6000 }).catch(() => {});
}
await page.waitForTimeout(500);
check('case report shown', await vis('#report [data-casefile=uber-2022]'));
const grade = await page.getAttribute('#report .grade', 'data-grade').catch(() => null);
check('a good run grades A', grade === 'A', grade);
const rep = await txt('#report');
check('report: kicker names the company and date', rep.includes('Case file · Uber · September 15, 2022'));
check('report: real timeline is shown', (await page.locator('#report .timeline li').count()) >= 6);
check('report: 6 ATT&CK techniques with links', (await page.locator('#report .tech a.tid').count()) === 6);
check('report: resume line earned and honest ("simulated")', (await txt('#report [data-resume]')).includes('simulated recreation of the Uber 2022 breach'));
check('report: sources listed', (await page.locator('#report .sources a').count()) >= 4);
check('report: Back to Case Files button', await vis('#report [data-action=case-files]'));
check('report: no week "next day" button', !(await vis('#report [data-action=next-day]')));
await page.screenshot({ path: `${out}/4-report.png`, fullPage: false });
await page.locator('#report .resume-box').scrollIntoViewIfNeeded().catch(() => {});
await page.screenshot({ path: `${out}/5-report-resume.png` });

// Back to Case Files: best score recorded.
await page.click('#report [data-action=case-files]');
await page.waitForFunction(() => window.__game.scene.isActive('CaseFiles'));
check('Case Files shows the best grade', (await txt('#cases [data-case=uber-2022] .best')).includes('Best: A'));
const weekAfter = await page.evaluate(() => localStorage.getItem('cyber-office:save:v2'));
check('the week save is untouched by the case', weekAfter === weekBefore);

// Replay works and starts fresh.
await page.click('#cases [data-case=uber-2022] [data-action=open-case]');
await page.waitForFunction(() => window.__game.scene.isActive('Office'));
await page.waitForTimeout(700);
s = await st();
check('replaying the case starts fresh', s.caseId === 'uber-2022' && s.visited.length === 0, JSON.stringify(s.visited));
// Pause menu labels in case mode, and Quit returns to Case Files.
await drain();
await page.keyboard.press('p');
await page.waitForTimeout(400);
const menuTxt = await page.evaluate(() => { const out = []; const walk = (l) => l.forEach((c) => { if (c.text) out.push(c.text); if (c.list) walk(c.list); }); walk(window.__game.scene.getScene('Menu').children.list); return out.join('|'); });
check('pause menu says "Restart this case"', menuTxt.includes('Restart this case'), menuTxt);
await page.evaluate(() => window.__game.scene.getScene('Menu').quit());
await page.waitForFunction(() => window.__game.scene.isActive('CaseFiles'), null, { timeout: 5000 }).catch(() => {});
check('Quit returns to Case Files', await active('CaseFiles'));

}
// ---------- Generic runner for the other cases: a "good run" plan per case ----------
async function readAll(reportIds = []) {
  const latest = await page.evaluate(() => Math.max(...window.__game.scene.getScene('Office').day.emails.map((e) => e.at)));
  if ((await st()).minutes <= latest) await setMinutes(latest + 1);
  await page.waitForTimeout(400);
  const ids = await page.evaluate(() => window.__game.scene.getScene('Office').day.emails.map((e) => e.id));
  for (const id of ids) {
    await page.click(`${W} [data-email=${id}]`).catch(() => {});
    await page.waitForTimeout(100);
    if (reportIds.includes(id)) {
      await page.click(`${W} [data-action=report]`).catch(() => {});
      await page.waitForTimeout(150);
    }
  }
}
async function answerPhone(choices) {
  for (let i = 0; i < 80 && !(await sc((o) => !!o.ringingEncounter())); i++) await page.waitForTimeout(150);
  const rang = await sc((o) => !!o.ringingEncounter());
  let s0 = null;
  for (let i = 0; i < 4 && rang; i++) {
    await drain();
    await teleUse(256, 146);
    s0 = await drain(true, 6000);
    if (s0.choosing) break;
  }
  for (const c of choices) {
    const s1 = await drain(true, 8000);
    if (!s1.choosing) break;
    await page.keyboard.press(String(c));
    await page.waitForTimeout(200);
  }
  await drain();
  return { rang, first: s0 };
}
async function walkup(choices) {
  const s0 = await drain(true, 25000);
  for (const c of choices) {
    const s1 = await drain(true, 8000);
    if (!s1.choosing) break;
    await page.keyboard.press(String(c));
    await page.waitForTimeout(200);
  }
  await drain();
  return s0;
}

async function playCase(p) {
  await page.waitForFunction(() => window.__game.scene.isActive('CaseFiles'));
  await page.click(`#cases [data-case=${p.id}] [data-action=open-case]`);
  await page.waitForFunction(() => window.__game.scene.isActive('Office'));
  await page.waitForTimeout(900);
  const s0 = await st();
  check(`${p.id}: starts in case mode`, s0.caseId === p.id, s0.title);
  await drain();
  await teleUse(136, 104); // briefing
  await drain();
  await teleUse(256, 146); // desk + inbox
  await page.waitForTimeout(500);
  await readAll(p.report || []);
  for (const id of p.report || []) check(`${p.id}: reported ${id}`, await sc((o, i) => !!o.state.mail[i]?.reported, id));
  if (p.terminalEarly) await runTerminal(p);
  await closeOverlay();
  await drain();
  for (const step of p.steps || []) {
    if (step.phone) {
      const r = await answerPhone(step.phone);
      check(`${p.id}: phone call (${step.label})`, r.rang && r.first?.choosing, r.first?.name);
    }
    if (step.walkup) {
      const w = await walkup(step.walkup);
      check(`${p.id}: walk-up (${step.label})`, w.choosing, w.name);
    }
    if (step.tickets) {
      await teleUse(256, 146);
      await page.waitForTimeout(400);
      await page.click(`${W} [data-app=tickets]`).catch(() => {});
      await page.waitForTimeout(200);
      for (const [t, opt] of Object.entries(step.tickets)) {
        await page.click(`${W} [data-ticket=${t}]`).catch(() => {});
        await page.click(`${W} [data-option=${opt}]`).catch(() => {});
        await page.waitForTimeout(120);
      }
      check(`${p.id}: tickets done`, await sc((o, ids) => ids.every((i) => o.state.tickets[i]), Object.keys(step.tickets)));
      await closeOverlay();
      await drain();
    }
    if (step.terminal) await runTerminal(p);
  }
  // Fast-forward until the main alert fires.
  for (let i = 0; i < 60; i++) {
    if (await sc((o) => { const a = o.day.alerts.find((x) => x.main); return o.state.soc.alerts[a.id] != null; })) break;
    await setMinutes((await st()).minutes + 5);
    await page.waitForTimeout(150);
  }
  check(`${p.id}: main alert fires`, await sc((o) => { const a = o.day.alerts.find((x) => x.main); return o.state.soc.alerts[a.id] != null; }));
  await drain();
  if (p.terminalAfterAlert) await runTerminal(p);
  if (p.powershell) await runTerminal(p, 'powershell');
  for (const step of p.afterAlert || []) {
    if (step.walkup) {
      const w = await walkup(step.walkup);
      check(`${p.id}: walk-up (${step.label})`, w.choosing, w.name);
    }
    if (step.phone) {
      const r = await answerPhone(step.phone);
      check(`${p.id}: phone call (${step.label})`, r.rang && r.first?.choosing, r.first?.name);
    }
  }
  await sc((o) => { o.state.flags.badgeActive = true; o.setServerDoor(true); });
  await teleUse(446, 186);
  await page.waitForTimeout(500);
  check(`${p.id}: at the SOC console`, (await st()).soc);
  await page.click(`${S} [data-tab=search]`);
  let found = 0;
  for (const q of p.search) {
    await page.fill(`${S} .q`, q);
    await page.waitForTimeout(350);
    const n = await page.locator(`${S} .row .flag`).count();
    if (n) { await flagBest(); found++; }
  }
  check(`${p.id}: SIEM search finds the evidence`, found === p.search.length, `${found}/${p.search.length}`);
  const flaggedPrimary = await sc((o) => { const a = o.day.alerts.find((x) => x.main); return o.state.events.some((e) => e.type === 'log-flagged' && e.key === a.case.primaryEvidence.key); });
  check(`${p.id}: primary evidence flagged`, flaggedPrimary);
  await page.screenshot({ path: `${out}/${p.id}-siem.png` });
  await page.click(`${S} [data-tab=case]`);
  await page.check(`${S} input[name=verdict][value=${p.verdict}]`);
  for (const a of p.actions) await page.check(`${S} input[name=action][value=${a}]`);
  await page.click(`${S} [data-action=submit-case]`);
  await page.waitForTimeout(300);
  check(`${p.id}: case submitted`, await sc((o, v) => { const a = o.day.alerts.find((x) => x.main); return o.state.soc.cases[a.id]?.verdict === v; }, p.verdict));
  await closeOverlay();
  await drain();
  for (const step of p.afterCase || []) {
    if (step.walkup) {
      const w = await walkup(step.walkup);
      check(`${p.id}: walk-up (${step.label})`, w.choosing, w.name);
    }
    if (step.phone) {
      const r = await answerPhone(step.phone);
      check(`${p.id}: phone call (${step.label})`, r.rang && r.first?.choosing, r.first?.name);
    }
  }
  for (let i = 0; i < 5 && !(await active('Report')); i++) {
    await drain();
    await teleUse(136, 104);
    await drain();
    await page.waitForFunction(() => window.__game.scene.isActive('Report'), null, { timeout: 6000 }).catch(() => {});
  }
  await page.waitForTimeout(500);
  check(`${p.id}: case report shown`, await vis(`#report [data-casefile=${p.id}]`));
  const g = await page.getAttribute('#report .grade', 'data-grade').catch(() => null);
  check(`${p.id}: good run grades A or B`, ['A', 'B'].includes(g), g);
  const missed = await page.evaluate(() => [...document.querySelectorAll('#report .ritem.bad, #report .ritem.ok')].map((d) => d.dataset.item).join(','));
  if (missed) console.log(`      (not perfect: ${missed})`);
  check(`${p.id}: timeline, ATT&CK and sources shown`, (await page.locator('#report .timeline li').count()) >= 5 && (await page.locator('#report .tech').count()) >= 3 && (await page.locator('#report .sources a').count()) >= 3);
  check(`${p.id}: resume line says "simulated"`, /simulated/.test(await txt('#report [data-resume]')));
  await page.screenshot({ path: `${out}/${p.id}-report.png` });
  await page.click('#report [data-action=case-files]');
  await page.waitForFunction(() => window.__game.scene.isActive('CaseFiles'));
  check(`${p.id}: best grade on the card`, (await txt(`#cases [data-case=${p.id}] .best`)).startsWith('Best:'));
}
async function runTerminal(p, app = 'terminal') {
  const cfg = p[app];
  await teleUse(256, 146);
  await page.waitForTimeout(400);
  await page.click(`${W} [data-app=${app}]`);
  await page.waitForTimeout(200);
  await page.locator(`${W} .term-in`).fill(cfg.cmd);
  await page.locator(`${W} .term-in`).press('Enter');
  await page.waitForTimeout(200);
  check(`${p.id}: ${app} finds ${cfg.expect}`, (await txt(`${W} .term-out`)).includes(cfg.expect));
  await closeOverlay();
  await drain();
}

const PLANS = {
  'mgm-2023': {
    id: 'mgm-2023',
    report: ['reenroll'],
    steps: [{ label: 'help desk vishing', phone: [3, 1] }, { tickets: { 'new-phone': 'callback', 'admin-contractor': 'scoped', 'expired-pw': 'temp' } }],
    search: ['reset_all voss', 'No callback'],
    verdict: 'helpdesk',
    actions: ['suspend', 'idp', 'azure', 'verify', 'isolate', 'ir', 'fido'],
  },
  'colonial-2021': {
    id: 'colonial-2021',
    report: ['restore-access'],
    steps: [{ label: 'ransom note found', walkup: [1] }],
    terminalAfterAlert: true,
    terminal: { cmd: 'grep -i none /mnt/exports/vpn/accounts.csv', expect: 'vpnlegacy' },
    afterAlert: [{ label: 'shut the pipeline down?', walkup: [1] }],
    search: ['mfa=none', 'vssadmin'],
    verdict: 'ransomware',
    actions: ['disable-vpn', 'mfa-all', 'segment', 'law', 'restore', 'creds'],
  },
};
// New cases keep their playbook in scripts/case-plans/<id>.mjs (default export, same shape as above).
import { readdirSync } from 'node:fs';
for (const f of readdirSync(new URL('./case-plans/', import.meta.url)).filter((x) => x.endsWith('.mjs'))) {
  const plan = (await import(`./case-plans/${f}`)).default;
  PLANS[plan.id] = plan;
}
const only = process.env.CASE;
for (const id of Object.keys(PLANS).filter((k) => !ONLY || ONLY.includes(k))) {
  if (only && only !== id) continue;
  if (!(await active('CaseFiles'))) await page.evaluate(() => { for (const k of ['Office', 'Report', 'Menu']) window.__game.scene.stop(k); window.__game.scene.start('CaseFiles'); });
  await playCase(PLANS[id]);
}

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `CASE FAIL (${failed} of ${results.length})` : `CASE PASS (${results.length} checks)`);
process.exit(failed ? 1 : 0);
