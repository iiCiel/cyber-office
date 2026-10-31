// Live UI check for the SECOND scenarios: picks Harbor Point (CCDC) + Atlas (CPTC) through the real menus and
// proves they load, inspect and discover/harden.  node scripts/verify-scenario2.mjs [url]
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://localhost:5194/cyber-office/';
const b = await chromium.launch({ channel: 'chrome', headless: true });
let fails=0; const ck=(n,ok,i='')=>{ if(!ok)fails++; console.log(`${ok?'PASS':'FAIL'}  ${n}${i?`  (${i})`:''}`); };
const page = await b.newPage({ viewport: { width: 1366, height: 900 } });
const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});

// ---- CCDC company 2 ----
await page.goto(url+'?v='+Date.now());
await page.waitForFunction(()=>window.__game?.scene?.isActive('Title'),null,{timeout:20000});
await page.waitForTimeout(400); await page.keyboard.press('t');
await page.waitForFunction(()=>window.__game.scene.isActive('Competitions'),null,{timeout:8000});
await page.waitForTimeout(200);
await page.locator('.comp-card[data-mode="ccdc"]').click();
await page.waitForFunction(()=>window.__game.scene.isActive('CcdcLab'),null,{timeout:8000});
await page.waitForTimeout(200);
ck('CCDC: company picker shows 2 companies', await page.locator('.cc-panel', {hasText:'Pick a company'}).locator('.cc-role-btn').count()===2);
await page.locator('.cc-role-btn', {hasText:'Harbor Point'}).click();
await page.waitForTimeout(150);
const id = await page.evaluate(()=>window.__game.scene.getScene('CcdcLab').scenario.id);
ck('CCDC: selecting Harbor Point sets the scenario', id==='harborpoint-lab-2026', id);
await page.locator('.cc-mode-btn',{hasText:'Competition'}).click();
await page.locator('.cc-go',{hasText:'Sit down'}).click();
await page.waitForSelector('.cc-devtabs',{timeout:8000}); await page.waitForTimeout(200);
ck('CCDC HP: 5 device tabs', await page.locator('.cc-devtab').count()===5, `${await page.locator('.cc-devtab').count()}`);
ck('CCDC HP: live board rendered', await page.locator('.cc-live').count()===1);
// inspect on ws01
await page.locator('.cc-devtab',{hasText:'Teller workstation'}).click(); await page.waitForTimeout(120);
const inp = page.locator('.eg-input'); await inp.click(); await inp.fill('Get-LocalUser'); await page.keyboard.press('Enter'); await page.waitForTimeout(120);
ck('CCDC HP ws01: Get-LocalUser shows svc_update', /svc_update/.test(await page.locator('.eg-out').innerText()));
// fix on dc01 spooler
await page.locator('.cc-devtab',{hasText:'Domain controller'}).click(); await page.waitForTimeout(120);
for (const c of ['Stop-Service Spooler -Force','Set-Service Spooler -StartupType Disabled']) { await inp.click(); await inp.fill(c); await page.keyboard.press('Enter'); await page.waitForTimeout(120); }
ck('CCDC HP dc01: spooler hardened', /Hardened: Print Spooler/.test(await page.locator('.eg-out').innerText()));
ck('CCDC HP: no console errors', errs.length===0, errs.slice(0,2).join(' | '));

// ---- CPTC client 2 ----
errs.length=0;
await page.goto(url+'?v='+Date.now());
await page.waitForFunction(()=>window.__game?.scene?.isActive('Title'),null,{timeout:20000});
await page.waitForTimeout(400); await page.keyboard.press('t');
await page.waitForFunction(()=>window.__game.scene.isActive('Competitions'),null,{timeout:8000});
await page.waitForTimeout(200);
await page.locator('.comp-card[data-mode="cptc"]').click();
await page.waitForFunction(()=>window.__game.scene.isActive('CptcLab'),null,{timeout:8000});
await page.waitForTimeout(200);
ck('CPTC: client picker shows 2 clients', await page.locator('.cx-panel', {hasText:'Pick a client'}).locator('.cc-mode-btn').count()===2);
await page.locator('.cc-mode-btn',{hasText:'Atlas'}).click(); await page.waitForTimeout(150);
const cid = await page.evaluate(()=>window.__game.scene.getScene('CptcLab').scenario.id);
ck('CPTC: selecting Atlas sets the scenario', cid==='atlas-fintech-2026', cid);
await page.locator('.cx-go',{hasText:'Open the Kali terminal'}).click();
await page.waitForSelector('.eg-input',{timeout:8000}); await page.waitForTimeout(200);
const ki = page.locator('.eg-input'); await ki.click(); await ki.fill('aws s3 ls s3://atlas-statements-prod --no-sign-request'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
ck('CPTC Atlas: bucket finding discovered at the terminal', /FINDING CONFIRMED/.test(await page.locator('.eg-out').innerText()));
ck('CPTC Atlas: no console errors', errs.length===0, errs.slice(0,2).join(' | '));

console.log(`\n${fails?'FAIL':'OK'} ${fails} failures`);
await b.close(); process.exit(fails?1:0);
