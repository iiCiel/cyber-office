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
- Coming: Equifax 2017, Target 2013, MOVEit 2023, Change Healthcare 2024.

Accuracy rules for every case: each attacker move comes from a cited source; anything only the attacker claimed is labeled as such; nobody real inside the company is named; internal hostnames, users and IPs are stand-ins (RFC 5737 documentation ranges). Attack payloads are redacted.

## Every report card
Each decision is graded with what happened and why, a cost to the company, and the CompTIA Security+ (SY0-701) objective it practices.

## Controls
- Move: WASD / arrow keys, or click where you want to go (click a person or object to walk over and use it)
- Use / talk: E, Space or Enter · Choices: 1-4 or click · Menu: P or Esc · Mute: M
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
- The terminal is a small simulated Unix shell with real flags and pipes (`src/game/shell.js`, unit tested).
- Sound is synthesized with Web Audio; no asset files.
- Deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.
