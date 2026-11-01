// Browser proof for the full-simulation CCDC (jump box): packet → login → PuTTY / pfSense GUI / RDP+ADUC /
// Splunk over millions of lines / inject portal / scoreboard vs other teams / chat → end round → after-action.
//   node scripts/verify-ccdcsim.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const out = process.argv[3] || 'docs/proof/ccdc-sim';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
let fails = 0, n = 0;
const check = (name, ok, info = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const GOOD_HR = 'Create a standard domain user with New-ADUser, a temporary password with change at next logon, add them only to the Shipping group. Least privilege: not a Domain Admin, no admin rights.';
const scene = (page, fn, arg) => page.evaluate(([src, a]) => { const sc = window.__game.scene.getScene('CcdcLab'); return new Function('sc', 'a', src)(sc, a); }, [fn, arg]);

async function toLab(page) {
  await page.goto(url + '?v=' + Date.now());
  await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.keyboard.press('t');
  await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
  await page.waitForTimeout(200);
  await page.locator('.comp-card[data-mode="ccdc"]').click();
  await page.waitForFunction(() => window.__game.scene.isActive('CcdcLab'), null, { timeout: 8000 });
  await page.waitForTimeout(200);
}
const openWin = async (page, id) => { await page.locator(`.jb-tb-app[data-open="${id}"]`).click(); await page.waitForTimeout(250); };
const win = (page, id) => page.locator(`.jb-win[data-win="${id}"]`);

for (const [tag, viewport] of [['1366', { width: 1366, height: 800 }], ['390', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message} @ ${String(e.stack || '').split(/\r?\n/).slice(1, 4).join(' ')}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errors.push(`console: ${m.text()}`); });

  // ---- packet ----
  await toLab(page);
  check(`[${tag}] team packet renders as a document`, await page.locator('.ccx-page h1', { hasText: 'Blue Team Packet' }).count() === 1);
  await page.screenshot({ path: `${out}/packet-${tag}.png` });
  // Competition round, whole team.
  await page.locator('.ccx-radio', { hasText: 'Competition' }).click();
  await page.locator('.ccx-btn.primary').click();
  await page.waitForSelector('.jb-taskbar');
  check(`[${tag}] jump box desktop + taskbar`, await page.locator('.jb-taskbar .jb-tb-app').count() >= 6);

  // ---- scoreboard ----
  await scene(page, 'sc.startedAt = Date.now() - 200000;');
  await page.waitForTimeout(1300);
  await openWin(page, 'score');
  const cells = await win(page, 'score').locator('td').count();
  check(`[${tag}] scoring engine overview grid has team × service cells`, cells >= 30, `${cells} cells`);
  const tray = await page.locator('.jb-tray-score').innerText().catch(() => '');
  check(`[${tag}] tray shows live rank + score`, /#\d+\/\d+/.test(tray), tray.replace(/\s+/g, ' '));
  await page.screenshot({ path: `${out}/scoreboard-${tag}.png` });

  // ---- the round moves on its own: rival scores, red-team waves, injects over time ----
  const snap = () => scene(page, `return { clock: sc.state.engine.clock,
    waves: sc.state.engine.events.filter(e => e.cls === 'red').length, injects: Object.values(sc.state.engine.injectTimers).filter(t => t.released).length };`);
  const scores = async () => page.evaluate(async () => { const sc = window.__game.scene.getScene('CcdcLab'); const mod = await import('/cyber-office/src/game/ccdcTeams.js'); return mod.standings(sc.state, sc.elapsed()).filter((r) => !r.you).map((r) => Math.round(r.score)); });
  const a = await snap(); const sa = await scores();
  await scene(page, 'sc.startedAt -= 330000;');
  await page.waitForTimeout(1500);
  const b = await snap(); const sb = await scores();
  check(`[${tag}] rival team scores move as the clock runs`, sa.join() !== sb.join(), `${sa.slice(0, 3)} → ${sb.slice(0, 3)}`);
  check(`[${tag}] red-team waves fire during the round`, b.waves > a.waves || b.waves >= 2, `${a.waves} → ${b.waves} waves by ${b.clock}s`);
  check(`[${tag}] injects arrive over time`, b.injects > a.injects, `${a.injects} → ${b.injects} released`);
  await openWin(page, 'score');
  await page.screenshot({ path: `${out}/scoreboard-later-${tag}.png` });

  // ---- PuTTY on web01: type a real fix ----
  await openWin(page, 'ssh-web01');
  const ssh = win(page, 'ssh-web01');
  check(`[${tag}] PuTTY shows the Ubuntu login banner`, (await ssh.innerText()).includes('Welcome to Ubuntu'));
  await ssh.locator('.tv-input').fill('ls -R /var/www/html/wp-content/uploads');
  await ssh.locator('.tv-input').press('Enter');
  await ssh.locator('.tv-input').fill('rm /var/www/html/wp-content/uploads/2026/10/stats.php');
  await ssh.locator('.tv-input').press('Enter');
  await ssh.locator('.tv-input').fill('crontab -r');
  await ssh.locator('.tv-input').press('Enter');
  const webFixed = await scene(page, "return Object.entries(sc.state.findings).filter(([k,v]) => v.status==='fixed' && sc.state.findingList.find(f=>f.id===k).host==='web01').length;");
  check(`[${tag}] typed rm + crontab -r in PuTTY fixes the web shell`, webFixed >= 1, `${webFixed} fixed`);
  await page.screenshot({ path: `${out}/putty-web01-${tag}.png` });

  // ---- inject portal: draft survives the per-second refresh ----
  await openWin(page, 'injects');
  const iw = win(page, 'injects');
  const firstRow = iw.locator('.ij-row').first();
  if (await firstRow.count()) await firstRow.click();
  await page.waitForTimeout(200);
  const ta = iw.locator('textarea.ij-ta').first();
  if (await ta.count()) {
    await ta.fill('draft that must survive');
    await page.waitForTimeout(2300);
    check(`[${tag}] inject draft survives live refresh`, (await iw.locator('textarea.ij-ta').first().inputValue()) === 'draft that must survive');
  } else check(`[${tag}] inject portal shows an open inject`, false);
  await page.screenshot({ path: `${out}/injects-${tag}.png` });

  // ---- Splunk ----
  await openWin(page, 'siem');
  const sw = win(page, 'siem');
  await page.waitForTimeout(400);
  const total = await scene(page, 'return sc.siem.count ? sc.siem.count() : (sc.siem.total || 0);');
  check(`[${tag}] SIEM holds millions of events`, total >= 2000000, `${total}`);
  const q = sw.locator('textarea, input[type="text"]').first();
  await q.fill('sourcetype=linux_secure "Failed password" | stats count by src_ip');
  await q.press('Enter');
  await page.waitForTimeout(9000);
  const swText = await sw.innerText();
  check(`[${tag}] Splunk search returns a stats table`, /src_ip/i.test(swText) && /count/i.test(swText));
  await page.screenshot({ path: `${out}/splunk-${tag}.png` });

  // ---- pfSense GUI ----
  await openWin(page, 'pf');
  check(`[${tag}] pfSense webConfigurator renders`, (await win(page, 'pf').innerText()).includes('Firewall'));
  await page.screenshot({ path: `${out}/pfsense-${tag}.png` });

  // ---- RDP to dc01 ----
  await openWin(page, 'rdp-dc01');
  check(`[${tag}] RDP window shows a Windows desktop`, await win(page, 'rdp-dc01').locator('.wd').count() === 1);
  await page.screenshot({ path: `${out}/rdp-dc01-${tag}.png` });

  // ---- chat ----
  await openWin(page, 'chat');
  check(`[${tag}] team chat has teammate messages`, (await win(page, 'chat').innerText()).length > 100);
  await page.screenshot({ path: `${out}/chat-${tag}.png` });

  // ---- end round ----
  await scene(page, 'sc.endRound();');
  await page.waitForSelector('.ccx-aar');
  const aar = await page.locator('.ccx-aar').innerText();
  check(`[${tag}] after-action report with final standings`, /Final standing: \d+ of \d+/.test(aar));
  await page.screenshot({ path: `${out}/aar-${tag}.png`, fullPage: false });

  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}
// ---- practice round: playbook loads commands into the right window; Harbor Point loads too ----
{
  const page = await browser.newPage({ viewport: { width: 1366, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await toLab(page);
  await page.locator('.ccx-btn.primary').click();
  await page.waitForSelector('.jb-win[data-win="playbook"]');
  const cmd = page.locator('.np-cmd[data-dev="web01"]').first();
  const want = (await cmd.innerText()).replace(/^\s*\$\s*/, '');
  await cmd.click();
  await page.waitForTimeout(300);
  const got = await win(page, 'ssh-web01').locator('.tv-input').inputValue();
  check('[practice] playbook click loads the command into web01 PuTTY', got === want, got);
  const dcCmd = page.locator('.np-cmd[data-dev="dc01"]').first();
  await openWin(page, 'playbook');
  await dcCmd.click();
  await page.waitForTimeout(400);
  const ps = await win(page, 'rdp-dc01').locator('.tv-input').first().inputValue().catch(() => '');
  check('[practice] playbook click loads PowerShell on dc01', /^Get-ADGroupMember/.test(ps), ps);
  await page.screenshot({ path: `${out}/practice-playbook-1366.png` });
  await scene(page, 'sc.endRound();');
  await page.locator('.ccx-btn.primary', { hasText: 'Run the round again' }).click();
  await page.locator('.ccx-radio', { hasText: 'Harbor Point' }).click();
  await page.locator('.ccx-btn.primary').click();
  await page.waitForSelector('.jb-taskbar');
  const hp = await page.locator('.jb-tb-app').count();
  check('[practice] Harbor Point round loads its boxes', hp >= 6, `${hp} taskbar apps`);
  check('[practice] no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}
await browser.close();
console.log(`\n${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
