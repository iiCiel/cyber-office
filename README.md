# Cyber Office

A pixel-art browser game where you live one real day as a junior security analyst. Walk the office, triage a real-looking inbox, investigate a 3 AM break-in in the SIEM, handle a suspicious phone call and a coworker with a "found" USB stick, then see what your choices cost the company.

**Play:** https://iiciel.github.io/cyber-office/ (about 10-15 minutes, saves in your browser)

## What's in Day 1
- **Email:** 5 emails, 2 of them phishing. Hover links to see where they really go, open the raw headers (with an "Explain" mode for SPF/DKIM/DMARC, Return-Path and Reply-To), report, delete or reply. Click a phishing link and you land on a convincing fake sign-in page.
- **SIEM alert:** 38 failed VPN logons for one account from a Tor exit node at 3 AM, then a success, then payroll files being read. Search the logs (Windows 4624/4625, OpenVPN, sshd, Samba audit), look up IPs, flag your evidence and write up the case.
- **Social engineering:** a caller pretending to be a coworker wants a password reset over the phone, and a coworker walks over with a USB stick labeled "SALARIES 2026".
- **Consequences:** give your password to the phishing page and the attacker logs in as you minutes later. At the end of the day your manager tells you what your choices caused, and a report card grades each decision, totals the cost to the company and maps every skill to a CompTIA Security+ (SY0-701) objective.

## Controls
- Move: WASD / arrow keys, or click where you want to go (click a person or object to walk over and use it)
- Use / talk: E, Space or Enter · Choices: 1-4 or click
- Back / stand up: Esc

## Run it locally
```
npm install
npm run dev        # then open http://localhost:5173/cyber-office/
```

## Test
```
npm test                                    # unit tests: pathfinding, log generation, scoring
npm run build
npx vite preview --port 4173 --strictPort   # in one terminal
npm run smoke                               # plays a full day in Chrome (61 checks), screenshots in smoke-out/
npm run smoke:bad                           # plays the worst possible day (15 checks)
```

## How it's built
- Phaser 3 + Vite, plain JavaScript. The office is a [Tiled](https://www.mapeditor.org/) map (`public/maps/office.tmj`); placeholder pixel art is drawn in code (`src/art/`).
- The in-game computer screens (mail, browser, SIEM) are real HTML laid over the canvas and scaled to the pixel-art monitor, so text is crisp and you can type, hover and scroll. All content goes in through `textContent`, never `innerHTML`.
- Content is data: emails in `src/data/day1.js`, logs in `src/data/day1Logs.js` (seeded, so identical every run), conversations in `src/data/day1Talk.js`, scoring in `src/game/scoring.js`.
- Click-to-walk uses A* on an 8px grid with path smoothing (`src/world/pathfinding.js`).
- Deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.

## Edit the map
Open `public/maps/office.tmj` in Tiled. `floor` and `walls` are tile layers (tiles with `collides` block movement). `objects` holds points: `prop` (property `tex`), `npc` (property `sprite`), `door`, `spawn`; the object's name links it to its text in `src/data/office.js`. Tile art lives in `src/art/tileArt.js`; run `npm run tiles` to repaint `public/maps/tiles.png`.
