# Cyber Office

A pixel-art browser game where you work as a junior security analyst. Walk the office, triage a real-looking inbox, hunt through SIEM logs and a Unix terminal, deal with coworkers and phone calls, and see what your choices cost the company.

**Play:** https://iiciel.github.io/cyber-office/ (saves in your browser)

## Two ways to play

### The week (about 1 hour)
Five days at Halcyon Mutual Insurance, one attacker group, and choices that carry from day to day.
- **Mon:** phishing, a 3 AM brute force from a Tor exit node, a vishing call, a "SALARIES 2026" USB stick in the parking lot.
- **Tue:** MFA fatigue, a macro-laden invoice, a QR-code phish, the helpdesk ticket queue.
- **Wed:** SQL injection on the customer portal, investigated in the SIEM and a real terminal (grep, awk, sort, whois).
- **Thu:** a vendor email compromise, a service account exfiltrating data, failing backups.
- **Fri:** ransomware with a live damage counter. Your backup decisions all week pick one of three endings.

### Case Files: replay real breaches
Each case rebuilds a documented incident from public reports: the same way in, the same mistakes, the same clues in the logs. You're the analyst on shift. At the end you see what really happened: the real timeline, the company's actual failures, the MITRE ATT&CK techniques with fixes, the sources, and a resume line you've honestly earned ("investigated a simulated recreation of...").
- **Uber, Sept 2022:** a bought contractor password, 50+ MFA pushes, a WhatsApp message from "IT", and an admin password hardcoded in a PowerShell script on a network share.
- **MGM Resorts, Sept 2023:** a help-desk phone call, an Okta super admin, a rogue identity provider, and encrypted hypervisors.
- **Colonial Pipeline, May 2021:** a forgotten VPN account with no MFA, DarkSide ransomware, and the decision to shut down the pipeline.
- **SolarWinds, Dec 2020 (SUNBURST):** a signed, trojanized Orion update, generated avsvmcloud.com DNS names, a hands-on follow-up on the identity server, a stolen SAML signing certificate (Golden SAML), a forged administrator sign-in, and a certificate added to a Microsoft 365 app that reads mail. Investigate in resolver, Sysmon, ADFS, Entra ID and Unified Audit Log records, with grep/jq and the `az` CLI.
- Also: Target 2013, Equifax 2017, Capital One 2019, MOVEit 2023, Change Healthcare 2024, Maersk/NotPetya 2017 (Active Directory) and Midnight Blizzard 2024 (Microsoft Entra ID / Microsoft 365).

### Labs: invented scenarios, real techniques and real logs
Cards marked LAB are fictional incidents at Halcyon Mutual built from documented techniques:
- **The service account that knew too much (Active Directory):** a macro phish, Kerberoasting (event 4769, RC4), a PsExec hop, an LSASS dump, DCSync (event 4662) and a hidden Domain Admin. Investigate in Windows Security and Sysmon logs, PowerShell with the AD cmdlets, and AD Users and Computers.
- **The key on GitHub (AWS):** an exposed IAM access key, miners in eight regions, a backdoor admin user created before AWS's quarantine policy landed, S3 exfiltration and CloudTrail switched off. Investigate in CloudTrail, GuardDuty and GitHub audit JSON, with the `aws` CLI and `jq`.

### Logs look like the real products
The SOC console is modeled on Splunk Enterprise Security: SPL search (`index=aws eventName=CreateUser | stats count by userIdentity.userName`), a timeline, the fields sidebar with Selected fields, JSON trees, and Windows events in Splunk's WinEventLog layout with the exact Microsoft message text. Windows Security, System, PowerShell and Sysmon events, AWS CloudTrail and GuardDuty, Okta, Microsoft Entra ID and Microsoft 365 audit logs are all written in the vendors' real formats.

Accuracy rules for every case: each attacker move comes from a cited source; anything only the attacker claimed is labeled as such; nobody real inside the company is named; internal hostnames, users and IPs are stand-ins (RFC 5737 documentation ranges). Attack payloads are redacted.

## Every report card
Each decision is graded with what happened and why, a cost to the company, and the CompTIA Security+ (SY0-701) objective it practices.

## Controls
- Move: WASD / arrow keys, or click where you want to go (click a person or object to walk over and use it)
- Use / talk: E, Space or Enter · Choices: 1-4 or click · Menu: P or Esc · Mute: M · Music on/off: in the P menu
- Title screen: click a weekday or press 1-5 to jump straight to it
- Phones: play in landscape. On small screens the computer, report and Case Files screens fill the whole display so text stays readable, with a Stand up button at the bottom.
- Reduced motion: if your OS asks for reduced motion, alerts don't shake the screen.
- Title screen: F opens Case Files

## Run it locally
```
npm install
npm run dev        # then open http://localhost:5173/cyber-office/
```

## Test
```
npm test                                    # unit tests: pathfinding, logs, scoring, shell, sound, every case file
npm run build
npx vite preview --port 4173 --strictPort   # in another terminal
npm run smoke                               # plays Day 1 in Chrome, screenshots in smoke-out/
npm run smoke:bad                           # plays the worst possible Day 1
npm run smoke:week                          # plays all five days
npm run smoke:case                          # plays every Case File
```

## How it's built
- Phaser 3 + Vite, plain JavaScript. The office is a [Tiled](https://www.mapeditor.org/) map (`public/maps/office.tmj`); placeholder pixel art is drawn in code (`src/art/`). In-world text uses the VT323 pixel font.
- One data-driven engine runs every day and every case (`src/scenes/OfficeScene.js`). A day or case is a data module: emails, seeded logs, alerts, encounters, terminal files, objectives, scoring (`src/days/dayN/`, `src/cases/<case>/`).
- The in-game screens (mail, browser, SIEM, terminal, tickets) are real HTML laid over the canvas and scaled to the pixel-art monitor. All content goes in through `textContent`, never `innerHTML`.
- The terminal is a small simulated Ubuntu shell with real flags and pipes (`src/game/shell.js`, `shellplus.js`: grep, awk, sed, jq, base64, find; unit tested), a PowerShell console with the Active Directory cmdlets and `Get-WinEvent` over the day's logs (`src/game/pwsh.js`), and working `aws` and `az` CLIs (`src/game/cloudcli.js`).
- Log formats: `src/game/winevents.js` (Windows events), `cloudfmt.js` (CloudTrail, GuardDuty, Okta, Entra, Purview), `siemfmt.js` (sourcetypes and fields), `spl.js` (the search language). AD Users and Computers is `src/ui/apps/AdApp.js`, fed by `src/game/directory.js`.
- Sound effects and the background music are synthesized with Web Audio (`src/game/sound.js`, `src/game/music.js`): no audio files. The music has four moods (menus, the workday, alerts, the report card) and follows what is happening.
- Deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.
