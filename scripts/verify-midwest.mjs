// Browser playthrough of the Midwest invitational round: Welcome Inject, drop flag, NETLAB+ consoles, PAN-OS CLI and
// web interface, firewalld, a Password Change Request ticket, and a mistake at the firewall.
//   CHROME_PATH=... node scripts/verify-midwest.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const out = process.argv[3] || 'docs/proof/midwest';
fs.mkdirSync(out, { recursive: true });
const chromePath = process.env.CHROME_PATH;
const browser = await chromium.launch(chromePath ? { executablePath: chromePath, headless: true } : { channel: 'chrome', headless: true });
let fails = 0, n = 0;
const check = (name, ok, info = '') => { n++; if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const scene = (page, fn, arg) => page.evaluate(([src, a]) => { const sc = window.__game.scene.getScene('CcdcLab'); return new Function('sc', 'a', src)(sc, a); }, [fn, arg]);
const page = await browser.newPage({ viewport: { width: 1366, height: 800 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(`console: ${m.text()}`); });
const win = (id) => page.locator(`.jb-win[data-win="${id}"]`);
const openWin = async (id) => { await page.locator(`.jb-tb-app[data-open="${id}"]`).click(); await page.waitForTimeout(200); };
const toSec = (sec) => scene(page, `sc.startedAt = Date.now() - ${sec * 1000};`);
const vm = async (id) => { await win('netlab').locator(`[data-nl="${id}"]`).click(); await page.waitForTimeout(150); };
const type = async (line) => { const i = win('netlab').locator('.nl-view .tv-input'); await i.fill(line); await i.press('Enter'); await page.waitForTimeout(100); };
const screen = () => win('netlab').locator('.nl-view').innerText();

await page.goto(`${url}?v=${Date.now()}`);
await page.waitForFunction(() => window.__game?.scene?.isActive('Title'), null, { timeout: 20000 });
await page.waitForTimeout(400);
await page.keyboard.press('t');
await page.waitForFunction(() => window.__game.scene.isActive('Competitions'), null, { timeout: 8000 });
await page.locator('.comp-card[data-mode="ccdc"]').click();
await page.waitForFunction(() => window.__game.scene.isActive('CcdcLab'), null, { timeout: 8000 });
await page.waitForTimeout(200);
const packet = await page.locator('.ccx-pdf').innerText();
check('packet lists the real addresses', /172\.20\.241\.30/.test(packet) && /172\.25\.27\.11/.test(packet));
check('packet states the source-filter rule', /restrict public services by source/.test(packet));
check('a real-time length is offered', /Real time · 240 min/.test(packet));
await page.locator('.ccx-radio', { hasText: 'Long ·' }).click();
await page.locator('.ccx-radio', { hasText: 'Competition' }).click();
await page.screenshot({ path: `${out}/packet.png`, fullPage: true });
await page.locator('.ccx-btn.primary').click();
await page.waitForSelector('.jb-taskbar');
await page.waitForTimeout(400);

// Before the drop flag
const t0 = await scene(page, 'return sc.elapsed();');
check('the clock does not run before the drop flag', t0 === 0);
await openWin('netlab');
await vm('web');
check('consoles are shut before the drop flag', /drop flag/i.test(await screen()));
await page.screenshot({ path: `${out}/netlab-predrop.png` });
await openWin('injects');
const ij = win('injects');
await ij.locator('.ij-row').first().click();
await page.waitForTimeout(150);
await ij.locator('textarea.ij-ta').fill('Team 7, University of Akron. Captain: Soliman. All members have read the rules and confirm them.');
await ij.locator('button', { hasText: /submit/i }).first().click();
await page.waitForTimeout(900);
check('the Welcome Inject starts the clock', await scene(page, 'return sc.awaitingDrop === false;'));
await page.screenshot({ path: `${out}/nise-welcome.png` });

// NETLAB+ chrome and the console login
await openWin('netlab');
await win('netlab').locator('[data-nl="topology"]').click();
await page.waitForTimeout(100);
await page.screenshot({ path: `${out}/netlab-topology.png` });
await vm('web');
await win('netlab').locator('.nl-btn-wrap', { hasText: 'Ubuntu Srv' }).locator('.nl-caret-hit').click();
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}/netlab-vm-menu.png` });
const menu = await win('netlab').locator('.nl-menu').innerText();
check('VM menu has the real entries', ['Send CTRL+ALT+DEL', 'Undock', 'Actual Size', 'Scale Display', 'Resize Display', 'Revert', 'Power On', 'Power Off', 'Take Screenshot'].every((x) => menu.includes(x)));
check('Revert is greyed out', await win('netlab').locator('.nl-mi', { hasText: 'Revert' }).isDisabled());
await page.keyboard.press('Escape');
await win('netlab').locator('.nl-crumb').click();
await page.waitForTimeout(100);
await type('root');
await type('wrong-password');
check('a wrong password is refused', /Login incorrect/.test(await screen()));
await type('root');
await type('Changeme123');
check('the right password opens a shell', /root@web:~#/.test(await screen()));
await type('systemctl restart apache2');
check('Ubuntu 14 has no systemctl', /command not found/.test(await screen()));
await type('service apache2 status');
check('service works', /is running/.test(await screen()));
await page.screenshot({ path: `${out}/netlab-console.png` });

// firewalld on CentOS
await vm('ecom');
await type('root'); await type('Changeme123');
check('CentOS prompt', /\[root@ecomm ~\]#/.test(await screen()));
await type('firewall-cmd --list-all');
check('firewalld lists its zone', /public \(active\)/.test(await screen()));

// PAN-OS CLI
await vm('pan');
await type('admin'); await type('Changeme123');
check('PAN-OS prompt', /admin@PA-VM>/.test(await screen()));
await type('show system info');
check('system info shows 11.0.0', /sw-version: 11\.0\.0/.test(await screen()));
await type('configure');
const rules = [
  'set rulebase security rules w from Core to User source any destination 172.25.27.23 application web-browsing service application-default action allow',
  'set rulebase security rules e from Core to Public source any destination 172.25.27.11 application [ web-browsing ssl ] service application-default action allow',
  'set rulebase security rules m from Core to Public source any destination 172.25.27.39 application [ smtp pop3 ] service application-default action allow',
  'set rulebase security rules d from Core to Internal source any destination 172.25.27.20 application dns service application-default action allow',
  'set rulebase security rules p from Core to [ User Public Internal ] source any destination any application ping service application-default action allow',
  'delete rulebase security rules allow-all',
];
for (const r of rules) await type(r);
check('nothing live before commit', await scene(page, "return sc.state.devState.pan.firewall.rules[0].name === 'allow-all';"));
await type('commit');
check('commit is a job', /Commit job \d+ is in progress/.test(await screen()));
await page.screenshot({ path: `${out}/panos-cli.png` });
await toSec(40);
await page.waitForTimeout(1400);
check('the commit landed', await scene(page, "return sc.state.devState.pan.firewall.rules[0].name === 'w' && sc.state.findings['pan-allow-all'].status === 'fixed';"));
check('all services still pass after the firewall change', await scene(page, "return Object.values(sc.state.services).every((s) => s.state === 'up');"));
await type('exit');

// The web interface, reached from a User-network VM
await vm('uwks');
await type('root'); await type('Changeme123');
await type('firefox https://172.20.242.150');
await page.waitForTimeout(250);
await type('firefox http://172.20.241.20:8000');
await page.waitForTimeout(400);
check('firefox opens Splunk', await win('siem').isVisible());
await openWin('netlab');
await type('firefox https://172.20.242.150');
await page.waitForTimeout(250);
const pa = win('pan-web');
check('firefox opens the firewall', await pa.isVisible());
await page.screenshot({ path: `${out}/panos-login.png` });
await pa.locator('input[type=password]').fill('Changeme123');
await pa.locator('.pa-login-btn').click();
await page.waitForTimeout(200);
check('Policies > Security shows the rules', (await pa.locator('[data-rule]').count()) === 5);
await pa.locator('[data-tool="Add"]').click();
await page.waitForTimeout(120);
await pa.locator('input[aria-label="Name"]').fill('splunk-in');
await page.screenshot({ path: `${out}/panos-rule.png` });
await pa.locator('[data-dt="Source"]').click();
await pa.locator('input[aria-label="Source Zone"]').fill('User');
await pa.locator('[data-dt="Destination"]').click();
await pa.locator('input[aria-label="Destination Zone"]').fill('Public');
await pa.locator('input[aria-label="Destination Address"]').fill('172.20.241.20');
await pa.locator('[data-dt="Application"]').click();
await pa.locator('input[aria-label="Application"]').fill('splunk');
await pa.locator('[data-btn="OK"]').click();
await page.waitForTimeout(150);
check('a GUI rule lands in the candidate', await pa.locator('[data-rule="splunk-in"]').count() === 1);
await page.screenshot({ path: `${out}/panos-policies.png` });
await pa.locator('[data-commit]').click();
await page.waitForTimeout(120);
await page.screenshot({ path: `${out}/panos-commit.png` });
await pa.locator('[data-btn="Commit"]').click();
await page.waitForTimeout(150);
await toSec(90);
await page.waitForTimeout(1400);
check('the GUI commit landed', await scene(page, "return sc.state.devState.pan.firewall.rules.some((r) => r.name === 'splunk-in');"));
await pa.locator('[data-btn="Close"]').click();

// Support Services and the PCR
await openWin('support');
const sup = win('support');
await page.screenshot({ path: `${out}/support-services.png` });
check('all six tiles', (await sup.locator('.ss-tile').count()) === 6);
await sup.locator('[data-tile="tickets"]').click();
await sup.locator('select[aria-label="Category"]').selectOption('Password Change Request');
await sup.locator('textarea').fill('Rotating all staff mail accounts on AD. New list attached in the ticket.');
await sup.locator('[data-submit]').click();
await page.waitForTimeout(100);
check('a PCR ticket is accepted', /Resolved/.test(await sup.innerText()));
check('the engine knows about it', await scene(page, 'return sc.state.engine.pcr.filed === true;'));

// Windows console
await openWin('netlab');
await vm('ad');
check('Windows waits for Ctrl+Alt+Del', /Ctrl\+Alt\+Delete/.test(await screen()));
await win('netlab').locator('.nl-btn-wrap', { hasText: '2019 AD' }).locator('.nl-caret-hit').click();
await win('netlab').locator('.nl-mi[data-act="cad"]').click();
await page.waitForTimeout(150);
await win('netlab').locator('.nl-pw').fill('Changeme123');
await win('netlab').locator('.nl-pw').press('Enter');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/netlab-windows.png` });
check('the desktop opens', await win('netlab').locator('.wd').isVisible());

// A mistake at the firewall: rule on the internal address.
await vm('pan');
await type('configure');
await type('delete rulebase security rules w');
await type('set rulebase security rules w from Core to User source any destination 172.20.242.10 application web-browsing service application-default action allow');
await type('commit');
await toSec(200);
await page.waitForTimeout(1400);
check('a rule on the internal address drops the web check', await scene(page, "return sc.state.services['web-http'].state === 'down';"));

// Phone width
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/netlab-phone.png` });

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`${n - fails}/${n} checks passed`);
process.exit(fails ? 1 : 0);
