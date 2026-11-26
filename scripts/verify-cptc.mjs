// Reference-match proof for CPTC: Kali Xfce desktop (panel, launchers, workspaces, desktop icons, dark titlebars)
// and Burp Suite (Proxy > HTTP history, Send to Repeater, edit + Send, SQL error proves the injection finding).
//   node scripts/verify-cptc.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const chromePath = process.env.CHROME_PATH;
const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const out = process.argv[3] || 'docs/proof/cptc-ref';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch(chromePath ? { executablePath: chromePath, headless: true } : { channel: 'chrome', headless: true });
let fails = 0, n = 0;
const check = (name, ok, info = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };

async function toDesk(page) {
  await page.goto(url + '?v=' + Date.now());
  await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
  await page.waitForTimeout(400);
  await page.keyboard.press('t');
  await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
  await page.waitForTimeout(250);
  await page.locator('.comp-card[data-mode="cptc"]').click();
  await page.waitForFunction(() => window.__game.scene.isActive('CptcLab'), null, { timeout: 8000 });
  await page.waitForTimeout(250);
  await page.locator('.kx-begin').click();
  await page.waitForSelector('.tv-kali .tv-input', { timeout: 8000 });
  await page.waitForTimeout(300);
}

for (const [tag, viewport] of [['1366', { width: 1366, height: 800 }], ['390', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(`console: ${m.text()}`); });
  await toDesk(page);

  // ---- Kali desktop ----
  const panelH = await page.locator('.kx-panel').evaluate((e) => e.getBoundingClientRect().height);
  check(`[${tag}] Xfce top panel is 30px`, Math.round(panelH) === 30, `${panelH}px`);
  if (tag === '1366') {
    check(`[${tag}] quick launchers + 4 workspaces in the panel`, await page.locator('.kx-ql').count() >= 3 && await page.locator('.kx-ws i').count() === 4);
    check(`[${tag}] desktop icons Trash / File System / Home`, (await page.locator('.kx-icons').innerText()).replace(/\s+/g, ' ').includes('Trash File System Home'));
  }
  const termMenu = await page.locator('.kx-termmenu').first().innerText();
  check(`[${tag}] QTerminal menu File Actions Edit View Help`, /File\s+Actions\s+Edit\s+View\s+Help/.test(termMenu), termMenu.replace(/\s+/g, ' '));
  await page.locator('.tv-kali .tv-input').fill('nmap -sV -Pn 198.51.100.0/24');
  await page.locator('.tv-kali .tv-input').press('Enter');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/kali-desktop-${tag}.png` });

  // ---- Burp: Proxy > HTTP history ----
  const ql = page.locator('.kx-ql[data-quick="burp"]');
  if (await ql.isVisible().catch(() => false)) await ql.click();
  else await page.locator('.kx-task', { hasText: 'Burp' }).first().click();
  await page.waitForSelector('.bp-table', { state: 'visible', timeout: 5000 });
  await page.waitForTimeout(200);
  const rows = await page.locator('.bp-table tbody tr').count();
  check(`[${tag}] Burp Proxy HTTP history lists requests`, rows === 5, `${rows} rows`);
  check(`[${tag}] Proxy tab is active, HTTP history sub-tab on`, await page.locator('.bp-mtab.on').innerText() === 'Proxy' && (await page.locator('.bp-stab.on').innerText()) === 'HTTP history');
  await page.screenshot({ path: `${out}/burp-proxy-${tag}.png` });

  // ---- right-click POST /login -> Send to Repeater ----
  await page.locator('.bp-table tr[data-row="5"]').click({ button: 'right' });
  await page.locator('.bp-ctxi[data-act="repeater"]').waitFor({ state: 'visible' });
  if (tag === '1366') await page.screenshot({ path: `${out}/burp-context-${tag}.png` });
  await page.locator('.bp-ctxi[data-act="repeater"]').click();
  await page.waitForSelector('.bp-edit');
  check(`[${tag}] Repeater opened with the POST /login request`, (await page.locator('.bp-edit').inputValue()).startsWith('POST /login HTTP/1.1'));
  const before = await page.evaluate(() => !!window.__game.scene.getScene('CptcLab').state.discovered['sql-injection']);
  const reqText = (await page.locator('.bp-edit').inputValue()).replace('user=jdoe&pass=Summer2026', "user=admin'--&pass=x");
  await page.locator('.bp-edit').fill(reqText);
  await page.locator('.bp-send').click();
  await page.waitForTimeout(300);
  const resText = await page.locator('.bp-rep .bp-pane').nth(1).innerText();
  check(`[${tag}] Send returns the 500 SQL syntax error`, /500 Internal Server Error/.test(resText) && /error in your SQL syntax/.test(resText));
  const after = await page.evaluate(() => !!window.__game.scene.getScene('CptcLab').state.discovered['sql-injection']);
  check(`[${tag}] the quote in Repeater confirms the SQL injection finding`, !before && after);
  check(`[${tag}] desktop notification pops up`, await page.locator('.kx-notify').count() === 1, await page.locator('.kx-notify').innerText().catch(() => ''));
  check(`[${tag}] Send updates Content-Length to the edited body`, /Content-Length: 20\b/.test(await page.locator('.bp-edit').inputValue()));
  check(`[${tag}] footer shows bytes | millis`, /Done\s+\d+ bytes \| \d+ millis/.test(await page.locator('.bp-rfoot').innerText()));
  await page.screenshot({ path: `${out}/burp-repeater-${tag}.png` });

  // ---- Burp: Proxy > Intercept (fresh game, so the finding is not confirmed yet) ----
  await toDesk(page);
  if (await ql.isVisible()) await ql.click();
  else await page.locator('.kx-task', { hasText: 'Burp' }).first().click();
  await page.waitForSelector('.bp-table', { state: 'visible', timeout: 5000 });
  await page.locator('.bp-stab[data-ptab="Intercept"]').click();
  await page.waitForSelector('.bp-icbar');
  check(`[${tag}] Intercept starts off, Forward and Drop disabled`, (await page.locator('.bp-ictoggle').innerText()).includes('Intercept off')
    && await page.locator('.bp-fwdb').isDisabled() && await page.locator('.bp-drop[data-act="drop"]').isDisabled());
  await page.locator('.bp-ictoggle').click();
  check(`[${tag}] toggle turns Intercept on (blue)`, (await page.locator('.bp-ictoggle').innerText()).includes('Intercept on')
    && await page.locator('.bp-ictoggle').evaluate((b) => getComputedStyle(b).backgroundColor) === 'rgb(43, 103, 168)');
  await page.locator('.bp-open').click();
  await page.waitForSelector('.bp-ictable tbody tr');
  const heldRow = (await page.locator('.bp-ictable tbody tr').first().innerText()).replace(/\s+/g, ' ');
  check(`[${tag}] Open browser: the portal login POST is held`, /HTTP → Request portal\.meridian\.example POST \/login/.test(heldRow), heldRow);
  check(`[${tag}] sub-tab shows Intercept (1)`, (await page.locator('.bp-stab[data-ptab="Intercept"]').innerText()) === 'Intercept (1)');
  check(`[${tag}] held request is editable raw text`, (await page.locator('.bp-icreq .bp-edit').inputValue()).startsWith('POST /login HTTP/1.1'));
  const icBefore = await page.evaluate(() => !!window.__game.scene.getScene('CptcLab').state.discovered['sql-injection']);
  await page.locator('.bp-icreq .bp-edit').fill((await page.locator('.bp-icreq .bp-edit').inputValue()).replace('user=jdoe', "user=jdoe'"));
  if (tag === '1366') await page.screenshot({ path: `${out}/burp-intercept-${tag}.png` });
  await page.locator('.bp-fwdb').click();
  await page.waitForTimeout(300);
  const icAfter = await page.evaluate(() => !!window.__game.scene.getScene('CptcLab').state.discovered['sql-injection']);
  check(`[${tag}] Forwarding the edited request confirms the SQL injection`, !icBefore && icAfter);
  check(`[${tag}] queue empties after Forward`, await page.locator('.bp-ictable tbody tr').count() === 0 && await page.locator('.bp-fwdb').isDisabled());
  await page.locator('.bp-stab[data-ptab="HTTP history"]').click();
  await page.waitForSelector('.bp-table tr[data-row="6"]');
  const r6 = await page.locator('.bp-table tr[data-row="6"] td').allInnerTexts();
  check(`[${tag}] forwarded request lands in HTTP history as #6, Edited, 500`, r6[2] === 'POST' && r6[5] === '✓' && r6[6] === '500', r6.join('|'));
  if (tag === '390') await page.screenshot({ path: `${out}/burp-intercept-history-${tag}.png` });

  check(`[${tag}] no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.close();
}
await browser.close();
console.log(`\n${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
