// Screenshots + behaviour checks for the SIEM preview page (dev server): node scripts/shot-siem.mjs [url] [outDir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const url = process.argv[2] || 'http://localhost:5201/cyber-office/preview/siem.html';
const out = process.argv[3] || 'docs/proof/siem';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
let fails = 0; const check = (n, ok, i = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${i ? '  (' + i + ')' : ''}`); };
for (const [tag, vp] of [['1366', { width: 1366, height: 768 }], ['390', { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport: vp });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  await page.waitForSelector('.sx-q');
  const search = async (q) => { await page.fill('.sx-q', q); await page.keyboard.press('Enter'); await page.waitForFunction(() => window.__siem.app.job && window.__siem.app.job.state !== 'running', null, { timeout: 60000 }); await page.waitForTimeout(350); };
  await search('sourcetype=linux_secure Accepted');
  const st = await page.textContent('.sx-status');
  check(`[${tag}] status line has events`, /\d[\d,]* events/.test(st), st);
  const rendered = await page.evaluate(() => ({ rows: document.querySelectorAll('.sx-row').length, perPage: window.__siem.app.perPage }));
  check(`[${tag}] list is virtualized (rows rendered <= page size)`, rendered.rows > 0 && rendered.rows <= rendered.perPage, JSON.stringify(rendered));
  await page.screenshot({ path: `${out}/events-${tag}.png` });
  await search('sourcetype=access_combined POST uri=/wp-login.php status=200 | stats count by src_ip | sort - count | head 10');
  const first = await page.textContent('.sx-srow');
  check(`[${tag}] stats shows attacker on top`, /203\.0\.113\.66/.test(first), first);
  await page.screenshot({ path: `${out}/stats-${tag}.png` });
  // click a value adds it to the search
  await page.click('.sx-srow .sx-val');
  await page.waitForFunction(() => window.__siem.app.job.state !== 'running', null, { timeout: 60000 });
  check(`[${tag}] clicking a value edits the search`, /src_ip=203\.0\.113\.66/.test(await page.inputValue('.sx-q')));
  // timeline click narrows
  await search('src_ip=203.0.113.66');
  const before = await page.textContent('.sx-timelbl');
  await page.evaluate(() => { const b = [...document.querySelectorAll('.sx-bar1')].find((x) => !x.classList.contains('z')); b.click(); });
  await page.waitForFunction(() => window.__siem.app.job.state !== 'running', null, { timeout: 60000 });
  check(`[${tag}] timeline bar narrows the range`, (await page.textContent('.sx-timelbl')) !== before);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/timeline-zoom-${tag}.png` });
  // typed text survives refresh; focus kept
  await page.fill('.sx-q', 'half typed');
  await page.focus('.sx-q');
  await page.waitForTimeout(2300);
  check(`[${tag}] refresh() keeps typed input and focus`, (await page.inputValue('.sx-q')) === 'half typed' && (await page.evaluate(() => document.activeElement.classList.contains('sx-q'))));
  // hunt panel
  await page.click('.sx-huntbtn');
  await page.fill('.sx-hin >> nth=0', '203.0.113.66');
  await page.click('.sx-hq >> nth=0 >> button');
  check(`[${tag}] hunt answer shows a check`, /✓/.test(await page.textContent('.sx-hq.ok')));
  await page.fill('.sx-hin >> nth=1', 'no idea');
  await page.click('.sx-hq >> nth=1 >> button');
  check(`[${tag}] wrong hunt answer shows a cross without the answer`, /✗/.test(await page.textContent('.sx-hq.bad')));
  await page.screenshot({ path: `${out}/hunt-${tag}.png` });
  await page.click('.sx-huntbtn');
  // full free-text scan + expanded event
  await page.click('.sx-time'); await page.click('.sx-timemenu >> text=All time');
  // the hidden attack: brute force from one IP, then its successful login
  let t0 = Date.now();
  await search('"Failed password" host=mail01 | stats count by src_ip | sort - count | head 5');
  const t1 = Date.now() - t0;
  const top = await page.textContent('.sx-srow .sx-cell');
  const ip = (top.match(/\d+\.\d+\.\d+\.\d+/) || [])[0];
  const j1 = await page.evaluate(() => ({ ms: window.__siem.app.job.elapsedMs, scanned: window.__siem.app.job.scanned }));
  console.log(`[${tag}] step 1 Failed password stats: job ${Math.round(j1.ms)} ms over ${j1.scanned} events, top IP ${ip}`);
  await page.screenshot({ path: `${out}/hunt-step1-failed-${tag}.png` });
  t0 = Date.now();
  await search('Accepted src_ip=' + ip);
  const j2 = await page.evaluate(() => ({ ms: window.__siem.app.job.elapsedMs, scanned: window.__siem.app.job.scanned }));
  console.log(`[${tag}] step 2 Accepted src_ip=${ip}: job ${Math.round(j2.ms)} ms over ${j2.scanned} events; status: ${await page.textContent('.sx-status')}`);
  check(`[${tag}] Accepted src_ip finds the successful login`, /Accepted/.test(await page.textContent('.sx-list')) && ip === '203.0.113.66');
  await page.screenshot({ path: `${out}/hunt-step2-accepted-${tag}.png` });
  await search('"Domain Admins"');
  await page.click('.sx-chev');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/event-expanded-${tag}.png` });
  check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | ').slice(0, 300));
  await page.close();
}
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
