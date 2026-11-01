// Browser proof for the Windows remote-desktop GUI (dev preview page), at 1366x768 and 390x844.
//   npx vite --port 5204 --strictPort   then   node scripts/verify-windows.mjs [baseUrl] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const base = process.argv[2] || 'http://localhost:5204/cyber-office/preview/windows.html';
const out = process.argv[3] || 'docs/proof/windows';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let fails = 0; let n = 0;
const check = (name, ok, info = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };

async function open(viewport, qs) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await page.goto(`${base}?${qs}&v=${Date.now()}`);
  await page.waitForSelector('.wd .wd-taskbar');
  await page.waitForTimeout(300);
  return { page, errors };
}
const status = (page, id) => page.evaluate((i) => window.__state.findings[i].status, id);
const shot = (page, name) => page.screenshot({ path: `${out}/${name}.png` });

for (const [tag, vp] of [['1366', { width: 1366, height: 768 }], ['390', { width: 390, height: 844 }]]) {
  const narrow = tag === '390';
  // ---------------- Cedarline domain controller ----------------
  {
    const { page, errors } = await open(vp, 'sc=1&dev=dc01');
    check(`[${tag}] Server Manager opens at sign-in`, await page.locator('.wd-win .wd-sm').count() === 1);
    check(`[${tag}] RDP bar + taskbar + clock`, (await page.locator('.wd-rdp').count()) === 1 && /AM|PM/.test(await page.locator('.wd-clock').innerText()));
    await shot(page, `dc01-server-manager-${tag}`);

    // Start menu -> ADUC
    await page.locator('.wd-startbtn').click();
    check(`[${tag}] Start menu lists the admin tools`, (await page.locator('.wd-start-app').allInnerTexts()).some((t) => /Active Directory Users and Computers/.test(t)));
    if (!narrow) await shot(page, `dc01-start-menu-${tag}`);
    await page.locator('.wd-start-app', { hasText: 'Active Directory Users' }).click();
    await page.waitForSelector('.wd-win .wd-lv');
    await page.locator('.wd-tn', { hasText: /^Users$/ }).first().click();
    const row = page.locator('.wd-win:not(.min) .wd-lv tbody tr', { hasText: 'Backup Svc2' });
    check(`[${tag}] ADUC lists svc-backup2 in Users`, await row.count() === 1);
    await row.click({ button: 'right' });
    await shot(page, `aduc-context-menu-${tag}`);
    await page.locator('.wd-menu-item', { hasText: 'Disable Account' }).click();
    check(`[${tag}] confirmation box names the object`, /has been disabled/.test(await page.locator('.wd-dlg .wd-mbtext').innerText()));
    await page.locator('.wd-dlg .wd-btn', { hasText: 'OK' }).click();
    await page.waitForTimeout(150);
    check(`[${tag}] disabled user shows the down-arrow icon`, await page.locator('.wd-win .wd-lv tbody tr', { hasText: 'Backup Svc2' }).locator('i.i-userdis').count() === 1);
    check(`[${tag}] one step is not a fix`, (await status(page, 'rogue-da')) === 'open');
    await shot(page, `aduc-disabled-${tag}`);

    // Properties > Member Of > Remove Domain Admins
    await page.locator('.wd-win .wd-lv tbody tr', { hasText: 'Backup Svc2' }).dblclick();
    await page.locator('.wd-dlg .wd-tab', { hasText: 'Member Of' }).click();
    await page.locator('.wd-dlg .wd-lv tbody tr', { hasText: 'Domain Admins' }).click();
    await shot(page, `aduc-memberof-${tag}`);
    await page.locator('.wd-dlg .wd-btn', { hasText: 'Remove' }).click();
    await page.locator('.wd-dlg .wd-btn', { hasText: 'Yes' }).click();
    await page.waitForTimeout(150);
    check(`[${tag}] removing from Domain Admins in the GUI fixes the finding`, (await status(page, 'rogue-da')) === 'fixed');
    check(`[${tag}] Member Of list refreshed`, await page.locator('.wd-dlg .wd-lv tbody tr', { hasText: 'Domain Admins' }).count() === 0);
    await page.locator('.wd-dlg .wd-btn', { hasText: 'Cancel' }).click();

    // PowerShell
    await page.locator('.wd-tbtn[aria-label$="PowerShell"]').click();
    await page.waitForSelector('.wd-win .tv-input');
    await page.locator('.tv-input').fill('Get-ADUser svc-backup2 -Properties Enabled');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    check(`[${tag}] PowerShell runs a typed command`, /svc-backup2/i.test(await page.locator('.tv-out').innerText()));
    check(`[${tag}] GUI commands appear in the terminal history`, (await page.evaluate(() => window.__state.devState.dc01.history)).some((l) => /^Disable-ADAccount -Identity svc-backup2$/.test(l)));
    if (!narrow) await shot(page, `powershell-${tag}`);

    // Event Viewer: filter 4720
    await page.evaluate(() => window.__desk.openApp('events'));
    await page.waitForSelector('.wd-evt-list');
    await page.locator('.wd-actions-it', { hasText: 'Filter Current Log' }).first().click().catch(() => {});
    if (narrow) await page.locator('.wd-mbar-i', { hasText: 'Action' }).last().click().then(() => page.locator('.wd-menu-item', { hasText: 'Filter Current Log' }).click());
    await page.locator('.wd-dlg input[type=text]').fill('4720, 4728, 4725, 4729');
    await page.locator('.wd-dlg .wd-btn', { hasText: 'OK' }).click();
    const evRows = await page.locator('.wd-evt-list tbody tr').count();
    check(`[${tag}] Event Viewer filter by ID shows the planted + new events`, evRows >= 4, `${evRows} rows`);
    await page.locator('.wd-evt-list tbody tr').nth(evRows - 1).click();
    check(`[${tag}] preview shows the 4720 text`, /A user account was created/.test(await page.locator('.wd-evt-text').innerText()));
    await shot(page, `event-viewer-${tag}`);

    // Services
    await page.evaluate(() => window.__desk.openApp('services'));
    await page.waitForSelector('.wd-svc-list');
    check(`[${tag}] Services lists DNS`, await page.locator('.wd-svc-list tbody tr', { hasText: 'DNS Server' }).count() === 1);
    await shot(page, `services-${tag}`);
    check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
    await page.close();
  }
  // ---------------- Cedarline workstation: Task Scheduler + local users ----------------
  {
    const { page, errors } = await open(vp, 'sc=1&dev=ws01');
    check(`[${tag}] ws01 is Windows 10 (no Server Manager)`, await page.locator('.wd-sm').count() === 0 && await page.locator('.wd-w10').count() === 1);
    await page.evaluate(() => window.__desk.openApp('tasks'));
    await page.waitForSelector('.wd-tasks-list');
    const task = page.locator('.wd-tasks-list tbody tr', { hasText: 'SystemCheck' });
    check(`[${tag}] SystemCheck is listed`, await task.count() === 1);
    await task.click();
    await shot(page, `task-scheduler-${tag}`);
    await task.click({ button: 'right' });
    await page.locator('.wd-menu-item', { hasText: 'Delete' }).click();
    await page.locator('.wd-dlg .wd-btn', { hasText: 'Yes' }).click();
    await page.waitForTimeout(150);
    check(`[${tag}] deleting SystemCheck in the GUI fixes ws-schtask`, (await status(page, 'ws-schtask')) === 'fixed');
    check(`[${tag}] task gone from the list`, await page.locator('.wd-tasks-list tbody tr', { hasText: 'SystemCheck' }).count() === 0);
    await page.evaluate(() => window.__desk.openApp('events'));
    await page.waitForSelector('.wd-evt-list');
    check(`[${tag}] ws01 Security log has the 4698 evidence`, (await page.evaluate(() => window.__desk.events('Security').filter((e) => e.id === 4698).length)) === 1);
    check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
    await page.close();
  }
  // ---------------- Harbor Point DC: Spooler through Services ----------------
  {
    const { page, errors } = await open(vp, 'sc=2&dev=dc01');
    await page.evaluate(() => window.__desk.openApp('services'));
    await page.waitForSelector('.wd-svc-list');
    const sp = page.locator('.wd-svc-list tbody tr', { hasText: 'Print Spooler' });
    await sp.click();
    await sp.click({ button: 'right' });
    await page.locator('.wd-menu-item', { hasText: /^Stop$/ }).click();
    await page.waitForTimeout(150);
    check(`[${tag}] Stop leaves the Spooler row stopped`, !/Running/.test(await page.locator('.wd-svc-list tbody tr', { hasText: 'Print Spooler' }).innerText()));
    check(`[${tag}] Server Manager flags a stopped automatic service`, await (async () => { await page.evaluate(() => window.__desk.openApp('sm')); return page.locator('.wd-sm-tile.bad').count(); })() >= 1);
    await shot(page, `server-manager-red-${tag}`);
    await page.locator('.wd-svc-list tbody tr', { hasText: 'Print Spooler' }).dblclick().catch(async () => { await page.evaluate(() => window.__desk.openApp('services')); await page.locator('.wd-svc-list tbody tr', { hasText: 'Print Spooler' }).dblclick(); });
    await page.waitForSelector('.wd-dlg');
    await page.locator('.wd-dlg select').selectOption('Disabled');
    await shot(page, `service-properties-${tag}`);
    await page.locator('.wd-dlg .wd-btn', { hasText: 'OK' }).click();
    await page.waitForTimeout(150);
    check(`[${tag}] Stop + Disabled in the GUI fixes print-spooler`, (await status(page, 'print-spooler')) === 'fixed');
    check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
    await page.close();
  }
}
await browser.close();
console.log(`\n${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
