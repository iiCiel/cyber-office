# Project: Cyber Office

> Project file from the Command Center, Oct 16, 2026, 9:07 PM. Paste it into a new project (New project, then "Start from a project file") or into a chat to pick up exactly where this left off.

## Goal
A pixel-art browser game where you live a real day as a junior security analyst: walk the office, read real-looking email, dig through logs, deal with coworkers, and watch your choices play out. Not a quiz and not a wall of text. Built in public as a portfolio piece for internship applications.

## What each run does
Read PROJECT.md in the project folder. Pick the next unchecked milestone, build it, test it in a browser, commit it to git, then update the project notes (check off what is done, add issues and open questions). One milestone per run. Start with M1: Phaser 3 + Vite project, a room you can walk around, deployed to GitHub Pages.

## Folder
D:\Projects\cyber-office

## Notes (what is done, in progress, next, issues)
### Vision
A pixel-art browser game where you live a real day as a junior security analyst: walk the office, read real-looking email, dig through logs, deal with coworkers, and watch your choices play out. Not a quiz and not a wall of text. Built in public as a portfolio piece for internship applications.

### Core design decisions
- Role: a mix of SOC analyst (alerts, logs) and IT helpdesk (users, passwords, email)
- Audience: beginners first, with optional "dig deeper" details for people who know more
- Platform: browser. Phaser 3 (3.90.0) + Vite 8 (JavaScript), maps made in Tiled, hosted free on GitHub Pages
- Realism: real concepts inside simulated tools: real email header fields, real log formats (Linux auth.log, Windows Event 4625/4624), a few real commands (whois, nslookup, grep)
- Art: placeholder pixel art drawn in code for now; plan is CC0 packs (Kenney, LimeZu-style 16x16), then our own art
- Fiction so far: company "Halcyon Mutual Insurance" (halcyonmutual.com), manager "Priya (SOC lead)", coworker "Dana (IT helpdesk)", player account analyst01 on HALCYON-WS-0142, day is Monday Oct 19 starting 8:57 AM. Seeded clues for later: reception visitor log "Pest control, 7:40 AM", backup 2 days old, unknown rack with amber light, USB stick "SALARIES 2026", sticky-note password, payroll left in printer, phishing test 31% click rate.

### Gameplay loop (one in-game day, about 10-15 minutes)
1. Morning: arrive, manager gives context, check the inbox at your desk.
2. Midday: an alert pops on the SOC screen; go to the server room and check the log viewer.
3. Interruptions: a coworker asks for something (password reset, USB); some are social engineering.
4. End of day: report card: what you caught, what you missed, what it cost.

### In-game tools
Mail client (hover links, View headers, sender details), Log viewer (filter/search, highlight lines), Terminal (a few real commands), Ticket queue (legit or trap).

### How scenarios work
Each scenario is one JSON data file (emails, log lines, NPC lines, right calls, consequences) naming the skill it teaches mapped to Security+ topics. Progress saved in localStorage.

### Plan: vertical slice (Day 1)
5 emails (2 phishing: fake password reset, spoofed "CEO" gift-card request), 1 alert (3 AM failed-login burst then a success), 1 coworker request (password reset by phone, must be verified), end-of-day report. Done = a stranger can play Day 1 start to finish and it feels like a game.

### Milestones
- [x] Concept and design decisions agreed
- [x] M1: Phaser + Vite project, deployed to GitHub Pages, a walkable room (Oct 16, 2026)
- [x] M2: Tiled office map, movement + collisions, desk/server room interactions (Oct 16, 2026). 6 rooms, camera follow, A* click-to-walk, Priya activates badge, badge-locked server door that closes behind you, desk computer screen, SOC console with live log tail, objectives (priya -> my-desk -> server-door -> soc) with on-map arrow
- [x] M3: Mail client with the 5 Day 1 emails, link hover and headers (done Oct 16, 2026). HTML apps inside the Phaser monitor; Report/Delete/Reply/View headers + Explain; in-game browser with a fake sign-in page; choices saved to localStorage; Continue/New day on the title
- [x] M4: Log viewer with the Day 1 alert (done Oct 16, 2026). SIEM in the server room: alert detail with pivots, IP lookup, log search (AND terms, -exclude, source filter), flag evidence, raw Windows events, case write-up (verdict + evidence + response). 3 AM brute force on j.alvarez via VPN from a Tor exit, success, payroll file reads. Typing your password into the phish triggers a second alert on YOUR account
- [x] M5: Coworker NPC and the social-engineering requests (done Oct 16, 2026). Vishing call from fake "Mike Chen" (choices: reset, ask employee ID, call back on directory number, helpdesk ticket; caller escalates with urgency/authority). Dana walks over (pathfinding) with a parking-lot USB stick (plug in / hand to SOC / trash). Choice dialogs with 1-4 keys or click
- [x] M6: Consequences and the end-of-day report card (done Oct 16, 2026). Priya's debrief reveals what your choices caused (password used from Russia, gift-card scam, Mike's mailbox taken over, USB keystroke injector). Report card: per-item outcome with what/why/cost, grade (one outright miss caps A at B), total cost to the company, skills with Security+ objectives, Day 2 teaser, Play again
- [ ] M7: Playtest with 2-3 friends, fix what's confusing
- [ ] Later: Days 2-5 and attacker storyline, sound, original art
Live: https://iiciel.github.io/cyber-office/ . Repo: https://github.com/iiCiel/cyber-office (public). Day 1 vertical slice is complete and playable end to end.

### Code map (D:\Projects\cyber-office)
- Day flow (objectives in src/data/office.js): Priya -> sit at desk -> read 5 emails -> (SIEM alert fires ~2.5s after inbox done, or 9:40) -> badge into server room -> SOC case -> desk phone rings (vishing call) -> Dana walks over with a USB stick -> debrief with Priya -> 5:00 PM fade -> Report scene -> Play again.
- public/maps/office.tmj: Tiled map (edit in Tiled). tiles.png painted from src/art/tileArt.js (`npm run tiles`).
- src/data/: office.js (props, NPC lines, objectives), day1.js (5 emails with raw headers + Explain notes, browser pages, reply drafts), day1Logs.js (seeded log generator, alert + case definitions, IP lookups), day1Talk.js (phone + USB conversation trees).
- src/game/: GameState.js (all choices + localStorage save, key cyber-office:day1:v1), scoring.js (scoreDay + debriefLines; grade cap: any outright miss caps A at B).
- src/scenes/: Boot, Title (Continue / New day), Office (everything in the office: map, NPCs, walkNpc, alerts, phone, conversations, debrief), Report (HTML report card).
- src/ui/: Overlay (pixel monitor bezel + HTML screen scaled over the canvas; disables Phaser keyboard while open), ComputerScreen (desktop: Mail, welcome.txt, Terminal stub, Tickets stub), apps/MailApp + apps/Browser, SocScreen (SIEM: overview, alert detail, search, case), DialogBox (typewriter + choices), dom.js (h() builder, textContent only), screen.css.
- src/world/pathfinding.js: A* NavGrid.
- Tests: `npm test` (15 unit tests: pathfinding, logs, scoring). Browser: npm run build; npx vite preview --port 4173 --strictPort (background); `npm run smoke` (64 checks, good-ish path incl. Play again) and `npm run smoke:bad` (15 checks, worst day -> F). Both also run against the live URL: node scripts/smoke.mjs https://iiciel.github.io/cyber-office/ smoke-out/live
- Gotchas: Phaser reuses the Office scene object on restart, so reset every per-day field at the top of create(). Python edits on Windows write CRLF unless newline='
' (.gitattributes normalizes to LF). Shell heredocs mangle backslashes; use the Edit tool for strings with 
.
- Deploy: push to main -> GitHub Actions -> Pages. Repo-local git email is the GitHub no-reply address.

### Issues
- Courier New system font for in-world text, not a pixel font.
- Terminal and Tickets apps are stubs (Terminal: whois/nslookup/grep planned).
- No sound yet.
- Not tested on a real phone. Choices and screens work with touch in theory; the HTML screens are scaled, so text is small on phones.
- Day 1 pacing not playtested by a human yet (M7). The alert fallback is 9:40, the phone fallback 10:30 in-game (1 in-game minute = 4 real seconds).

### Open questions (for Soliman)
- Game title (Cyber Office is a placeholder)
- Own art early, or free packs now that Day 1 is playable?
- Keep the names Halcyon Mutual, Priya, Dana, Mike Chen, j.alvarez?
- Who are the 2-3 playtesters for M7?

### How each run works
Pick the next unchecked milestone, build it, test in a browser (smoke script, extend it for the new feature), commit, push (redeploys), update PROJECT.md. One milestone per run.

## Recent runs (newest first)
### Oct 16, 2026: done, supervisor grade A
- Did: M2 is done and live at https://iiciel.github.io/cyber-office/. The office now has 6 rooms (lobby, open floor, manager's office, break room, meeting room, server room) and is a real Tiled map you can edit. Clicking anywhere walks you there around furniture. Priya, your manager, activates your badge. The server room door is badge-locked and closes behind you. Your desk opens a computer screen, and the SOC console shows a live feed of realistic log lines. An automated test in Chrome plays the whole loop by clicking: 21 checks, passing on my machine and on the live site. There are also 5 unit tests for the pathfinding. A separate code review found 5 small bugs and the test found 1 more (the server door looked shut but you could walk through it once it closed). All 6 are fixed.
- Where it stood: Milestones 1 and 2 of 7 are done. You can walk the whole office and finish a 4-step first-morning checklist, but there's no real security content yet. The inbox, the alert and the coworker request come next.
- Problems: First push was rejected because of GitHub email privacy; the agent amended the commit to use the noreply address. This is a small time loss, but it rewrote the commit's author email.; Two smoke-test failures cost roughly 3 minutes: wrong base path and a stale preview server on port 4173.; The workflow shows a Node/Ubuntu runner deprecation notice (ubuntu-latest moves to Ubuntu 26 on Oct 19). It is not urgent but is not recorded as an open issue.
- Advice for the next run: Set git user.email to the GitHub noreply address before the first commit. Use base /cyber-office/ and run the smoke test via a script that manages its own server. Start with the next unchecked milestone in PROJECT.md and verify on the live site after each push. List issues and open questions explicitly in the notes, not just the checkmarks.

## Waiting on Soliman
- Answer the open questions: game title, art plan, and the names Halcyon Mutual, Priya and Dana
- Play the new office for 3 minutes and say what feels off
- Answer the open questions: game title, art plan, and whether to keep the names 'Halcyon Mutual Insurance' and 'Dana'
- Decide: keep the GitHub repo public, or make it private until Day 1 is playable
- Play the M1 build for 2 minutes and say if it feels right
