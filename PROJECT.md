# Project: Cyber Office

> Project file from the Command Center, Oct 16, 2026, 10:06 PM. Paste it into a new project (New project, then "Start from a project file") or into a chat to pick up exactly where this left off.

## Goal
A pixel-art browser game where you live a real day as a junior security analyst: walk the office, read real-looking email, dig through logs, deal with coworkers, and watch your choices play out. Not a quiz and not a wall of text. Built in public as a portfolio piece for internship applications.

## What each run does
Read PROJECT.md in the project folder. Pick the next unchecked milestone, build it, test it in a browser, commit it to git, then update the project notes (check off what is done, add issues and open questions). One milestone per run. Start with M1: Phaser 3 + Vite project, a room you can walk around, deployed to GitHub Pages.

## Folder
D:\Projects\cyber-office

## Notes (what is done, in progress, next, issues)
### Vision
A pixel-art browser game where you live a real day as a junior security analyst: walk the office, read real-looking email, dig through logs, deal with coworkers, and watch your choices play out. Not a quiz, not a wall of text. Built in public as a portfolio piece for internship applications.

### Status
Day 1 vertical slice COMPLETE and live: https://iiciel.github.io/cyber-office/ . Repo (public): https://github.com/iiCiel/cyber-office . Latest commit 5bcaca8.

### Milestones
- [x] Concept and design
- [x] M1 Phaser + Vite + GitHub Pages
- [x] M2 Tiled office (6 rooms), A* click-to-walk, badge-locked server room door, desk + SOC screens
- [x] M3 Mail client: 5 emails (fake IT password reset on lookalike domain halcyonmutual-support.com; spoofed CEO gift-card request with Gmail Reply-To and DMARC fail; 3 legit: Microsoft sign-in alert, HR benefits, Priya welcome). Hover links -> real URL in status bar, View headers + Explain notes, Report/Delete/Reply (reply goes to Reply-To), in-game browser with fake sign-in page (password never stored)
- [x] M4 SIEM: seeded logs (Windows 4624/4625/4634 with raw events, OpenVPN, sshd scanner noise, Samba audit, postfix). Story: 38 failed VPN logons for j.alvarez from Tor exit 185.220.101.47 at 03:12, success 03:14:52, payroll/bank/SSN file reads; decoys: svc_backup at 2 AM, s.okafor typo, SSH scanners; real j.alvarez logs on at 08:47. Search (AND, -exclude, source filter), IP lookup, flag evidence, case write-up (verdict, evidence, actions). Typing your password into the phish -> second alert: analyst01 logon from Russia
- [x] M5 Vishing call from fake "Mike Chen" (real Mike logged on at 08:21; callback on directory number exposes it) + Dana walks over with a "SALARIES 2026" parking-lot USB (plug / hand to SOC / trash). Choice dialogs (1-4 or click), conversation trees in src/data/day1Talk.js
- [x] M6 Priya debrief reveals consequences; report card (grade, per-item what/why/cost, total cost, skills with Security+ SY0-701 objectives, Day 2 teaser, Play again). One outright miss caps A at B
- [x] Days 2-5: full week vertical slice (done Oct 17, 2026). Refactored into a data-driven day engine (src/days/dayN). Tue: MFA fatigue + macro invoice + QR phish + tickets. Wed: SQL injection on the portal, investigated in SIEM + Terminal (real shell: grep/awk/sort/whois). Thu: vendor BEC + svc_backup data theft + failing backups. Fri: ransomware finale with a live damage counter; the week's backup choices decide one of 3 endings. Choices carry across days; report chains day-to-day + a week summary. Security note: attack payloads are redacted in-game.
- [ ] M7 Playtest with 2-3 people (needs Soliman to pick testers)
- [x] Polish pass (Oct 17, 2026): procedural sound (Web Audio, mute + M key), pause menu (P/Esc/button: resume, restart day, quit, how-to-play), in-game security glossary (22 terms mapped to Security+), screen shake + red flash on alerts/crisis, mobile rotate hint + touch viewport.
- [ ] Later: original art, a pixel font, music, more weeks, difficulty settings, real-device mobile testing

### Code map (D:\Projects\cyber-office)
- THE GAME IS NOW A 5-DAY CAMPAIGN. Each day is a data file in src/days/dayN/ (index.js = the day definition: emails, pages, logs, alerts, tickets, encounters, objectives, score, debrief, carry, teaser, prepare).
- src/days/index.js: DAYS array, getDay(n), loadDay(n, st) (applies the day's prepare() so text reacts to earlier choices).
- src/game/GameState.js (save key cyber-office:save:v2): current day (visited, flags, mail, events, soc{alerts,cases,flagged}, enc, tickets, term, crisis) + campaign {history[], carry{}}. startDay(n), recordDay(result, carry).
- src/game/scoring.js: scoreEmail / scoreCase / scoreTicket / scoreConversation / finalize (grade, cost, skills; one outright miss caps A at B).
- src/game/logkit.js: seeded log builder (Windows 4624/4625/4634/4688 raw events, VPN, proxy, idp/okta, smbd), backgroundNoise, ipLookup. Each day's logs.js builds its story on top.
- src/game/shell.js: a real-ish Unix shell (ls/cd/cat/grep/wc/sort/uniq/cut/awk/head/tail/whois/nslookup, pipes) for the Terminal. Pure, unit-tested (tests/shell.test.js). Attack request bodies are REDACTED (e.g. [REDACTED-SQL-118-chars]) on purpose.
- src/scenes/OfficeScene.js: the day engine. Objective types talk/sit/inbox/tickets/terminal/badge/case/encounter/debrief. Alerts fire on trigger.after (an objective) or trigger.when(state). Encounters are phone (desk rings) or walkup (NPC pathfinds to you). Day 5 crisis = a live file-encryption counter that stops when the case is contained.
- src/scenes/ReportScene.js: records the day into the campaign, chains to the next day / replay / play-again, and after Friday shows the week summary + ending (day.weekEnding).
- src/game/sound.js: procedural Web Audio synth (named effects, mute persisted). Shared instance in game.registry/window.__sound; scenes read this.sound. Unit tested (tests/sound.test.js).
- src/scenes/MenuScene.js: pause menu (launched over a paused Office). Resume/restart-day/quit/how-to-play + the glossary (src/data/glossary.js, HTML panel).
- src/ui/: ComputerScreen (desktop: Mail, welcome.txt, Terminal, Tickets), apps/MailApp (+ attachments, QR codes), apps/Browser (login page / macro doc / PDF viewer), apps/TerminalApp, apps/TicketsApp, SocScreen (day-driven SIEM), DialogBox (choices), Overlay (HTML over the pixel monitor).
- Days/story: Mon brute-force (Tor) + USB bait; Tue MFA fatigue + macro + QR (203.0.113.45 C2); Wed SQL injection on portal (ShadowHost 198.51.100.x); Thu vendor BEC + svc_backup exfil to Mega + backups; Fri ransomware. One attacker group all week; IOCs recur.
- Tests: `npm test` (26 unit: pathfinding, logs, scoring, shell). Browser: npm run build; npx vite preview --port 4173 --strictPort (bg); `npm run smoke` (Day 1, 66), `npm run smoke:bad` (worst Day 1, 15), `npm run smoke:week` (all 5 days, 37). Live: append the URL + out dir.
- Gotchas: Phaser reuses the Office scene between days/replay/play-again, so create() resets every per-day field. Python edits on Windows: write with newline='
'. Shell heredocs mangle backslashes in JS strings; use the Edit tool for strings with 
 or 	. Restart vite preview after vite.config.js changes.
- Deploy: push to main -> GitHub Actions -> Pages. Repo-local git email = GitHub no-reply.

### Issues
- In-world dialog uses Courier New, not a true pixel font (readable, just not pixel-styled). No music yet (sound effects are in).
- Pacing not playtested by a human. Alert/phone fallbacks exist so a day can't stall.
- On phones: a rotate-to-landscape hint shows in portrait; touch works, but the in-game HTML screens are small on tiny phones. Not tested on a real device.
- smoke-week.mjs can flake on a slow connection at the Day 4 phone/debrief timing (passes on rerun); the game itself is fine.

### Open questions (for Soliman)
- Game title (Cyber Office is a placeholder)
- Own art now, or free packs?
- Keep the names Halcyon Mutual, Priya, Dana, Mike Chen, j.alvarez?
- Who are the 2-3 playtesters for M7?

### How each run works
Pick the next unchecked milestone (or polish if blocked on Soliman), build, test (unit + both smoke scripts, extend them), commit, push (redeploys), check the live site, update PROJECT.md.

## Recent runs (newest first)
### Oct 16, 2026: done, supervisor grade A
- Did: Built 4 milestones (M3-M6), so Day 1 can now be played start to finish at https://iiciel.github.io/cyber-office/ (about 10-15 minutes): - A real inbox: 5 emails, 2 of them phishing. You can hover links, view headers with an "Explain" mode, and land on a fake sign-in page. - A 3 AM break-in to investigate in the server-room SIEM, with log search, IP lookup, evidence flags and a case write-up. - A fake "Mike from Sales" phone call and a USB stick a coworker found in the parking lot. - An end-of-day debrief and report card with a grade, the cost to the company and Security+ topics. Testing: 15 unit tests, plus 2 browser tests that play a full day in Chrome (64 checks) and the worst possible day (15 checks). Both pass on the live site. A code review found 9 bugs, including one where "Play again" froze the player on day 2; all 9 are fixed.
- Where it stood: 6 of 7 milestones are done, so the Day 1 vertical slice is complete and live. The only milestone left is M7, which needs 2-3 real people to playtest it.
- Problems: First push was rejected because of GitHub email privacy; the agent amended the commit to use the noreply address. This is a small time loss, but it rewrote the commit's author email.; Two smoke-test failures cost roughly 3 minutes: wrong base path and a stale preview server on port 4173.; The workflow shows a Node/Ubuntu runner deprecation notice (ubuntu-latest moves to Ubuntu 26 on Oct 19). It is not urgent but is not recorded as an open issue.
- Advice for the next run: Set git user.email to the GitHub noreply address before the first commit. Use base /cyber-office/ and run the smoke test via a script that manages its own server. Start with the next unchecked milestone in PROJECT.md and verify on the live site after each push. List issues and open questions explicitly in the notes, not just the checkmarks.

## Waiting on Soliman
- Answer the open questions: game title, art plan, and whether to keep the character names
- Pick 2-3 people to playtest it (milestone M7)
- Play Day 1 once, start to finish (about 15 minutes)
- Answer the open questions: game title, art plan, and the names Halcyon Mutual, Priya and Dana
- Play the new office for 3 minutes and say what feels off
- Answer the open questions: game title, art plan, and whether to keep the names 'Halcyon Mutual Insurance' and 'Dana'
- Decide: keep the GitHub repo public, or make it private until Day 1 is playable
- Play the M1 build for 2 minutes and say if it feels right
