# Project: Cyber Office

> Project file from the Command Center, Oct 23, 2026, 12:58 AM. Paste it into a new project (New project, then "Start from a project file") or into a chat to pick up exactly where this left off.

## Goal
A pixel-art browser game where you live a real day as a junior security analyst: walk the office, read real-looking email, dig through logs, deal with coworkers, and watch your choices play out. Not a quiz and not a wall of text. Built in public as a portfolio piece for internship applications.

## What each run does
Read PROJECT.md in the project folder. Pick the next unchecked milestone, build it, test it in a browser, commit it to git, then update the project notes (check off what is done, add issues and open questions). One milestone per run. Start with M1: Phaser 3 + Vite project, a room you can walk around, deployed to GitHub Pages.

## Folder
D:\Projects\cyber-office

## Notes (what is done, in progress, next, issues)
###### Status
DONE, pushed and live at https://iiciel.github.io/cyber-office/ :
- The 5-day week.
- Case Files: 15 playable cases. That is 9 real-breach replays (including SolarWinds 2020) plus the AD/AWS/Linux/BEC labs, Midnight Blizzard and NotPetya.
- Realism + AD/cloud pass.
- Day-picker: on the title screen, press 1-5. F opens Case Files.
- Oct 20 (dcda50e): procedural music (src/game/music.js, localStorage cyber-office:music), compact phone screens (placeOnCanvas in src/ui/dom.js), prefers-reduced-motion.

Oct 23 overnight: on branch overnight-2026-10-23, commits 3b5b310..cb725d2 plus notes. NOT pushed and NOT live.
- Oct 23 fix-up (cb725d2): the SolarWinds autumn entries had lone backslashes ('NT AUTHORITYSYSTEM', 'Inbox'). They are now NT AUTHORITY\SYSTEM and \Inbox / \Sent Items. A case unit test now catches lost backslashes in any case. The report card also shows the difficulty line when the hint was used and the player switched back to Analyst. To ship: git checkout main && git merge overnight-2026-10-23 && git push origin main, then run the live smoke.
- DST fix. src/game/siemfmt.js easternOffset() uses the real US Eastern rules: since 2007, 2nd Sunday of March to 1st Sunday of November at 2 AM; before that, 1st Sunday of April to last Sunday of October. Every existing day and case gives byte-identical logs (full dump before and after).
- The SolarWinds replay now includes beacons from Oct 12 to Dec 9 and 2 November mail-read sessions. They are appended at the end of generateLogs so the earlier DGA names and jitter stay the same.
- SolarWinds facts were checked against the FireEye CSVs in mandiant/sunburst_countermeasures:
  - The DLL hashes now match file version 2020.2.5300.12432 (MD5 846e27a6..., SHA256 ce77d116...).
  - The BEACON domain is now incomeupdate.com.
  - thedoccloud.com is a SUNBURST second-stage domain and is now labeled that way.
- All 9 other real cases were fact-checked. One fix: the Change Healthcare "attack vector identified March 13" claim was removed. Capital One's Oct 2022 sentencing and Target's Best1_user framing were confirmed.
- Difficulty setting in src/game/difficulty.js (localStorage cyber-office:difficulty):
  - Trainee: 6 s per game minute, a "Stuck?" hint in the write-up showing the case's primaryEvidence.note, Day 5 ransomware at 0.6x.
  - Analyst: the default, unchanged.
  - Senior: 3 s per game minute, no guide arrow, ransomware at 1.4x.
  - Scoring rules are the same at every level. The report card names a non-default level and says if the hint was used. Set it on the title screen (click or D) or in the P menu. The title screen also has a Music on/off toggle.

Deploy: git push origin main (Actions takes about 35 s), then node scripts/smoke.mjs https://iiciel.github.io/cyber-office/ smoke-out/live . Repo: https://github.com/iiCiel/cyber-office . PROJECT.md on disk is the source of truth: never revert it.

###### Milestones
- [x] Concept, M1-M6, Days 2-5, polish, VT323 font, Case Files (15), realism pass, day-picker
- [x] Oct 20: SolarWinds case, music, phone screens, reduced motion
- [x] Oct 23 overnight: DST fix, fact fixes, difficulty setting (on the branch, waiting for merge and push)
- [ ] M7 Playtest with 2-3 people (BLOCKED: Soliman picks testers). Kit: PLAYTEST.md.
- [ ] Later: a second week, original art, real-device mobile test

###### Tests
- npm test: 130 unit tests.
- Browser smokes, each taking [url] [outdir]:
  - smoke: 67
  - smoke:bad: 15
  - smoke:week: 37
  - smoke:case: 251 (all 15 cases, about 10 minutes)
  - smoke:difficulty: 14
- Single case: ONLY=solarwinds-2020 node scripts/smoke-case.mjs <url> <out> (a comma-separated list works too).
- Local test build: npx vite build --outDir smoke-out/dist-mine, then npx vite preview --outDir smoke-out/dist-mine --port 4180.
- Scratch scripts (gitignored): smoke-out/edit.py (CRLF-safe edits), iso-dump.mjs (log dump to compare before and after).

###### Issues
- The SolarWinds ADFS key-read log shape is a reconstruction (the disclaimer says so).
- Midnight Blizzard's "access removed about Jan 13" line is unverified (the case already hedges it).
- Microsoft, MSRC, SEC and GeekWire return 403 to scripts.
- Phone mode has only been tested in an emulated viewport.
- smoke-week Day 4 can flake (not reproduced in 2 runs on Oct 23).
- Pacing has not been playtested by a human.
- Some files are CRLF and some LF. Edit with newline-aware tools. Apostrophes inside single-quoted JS strings broke twice: avoid them or escape them. Backslashes too: write two in JS source. The Bash tool's heredocs collapse \\ to \, so use the Write tool or node with String.fromCharCode(92) for edits that contain backslashes.

###### Open questions (for Soliman)
- Game title? Own art or free packs? Keep the character names?
- Who are the 2-3 M7 playtesters?
- Keep or rename the 'splunk>' look-alike?
- Should music default to on (current) or off?
- Are Trainee and Senior paced right? Should using the hint lower the score?
- Merge overnight-2026-10-23 and push?

## Recent runs (newest first)
### Oct 23, 2026: done, supervisor grade B
- He asked: OVERNIGHT RUN: Soliman is asleep ~13 hours and cannot approve anything. Do as much useful work as you can on the plan, in several rounds if you can, until usage runs low: open items, bugs, tests, polish, small features already in the plan. Keep tests green. HARD RULES: do NOT push (pushing makes it 
- Did: Overnight I made 6 commits on a local branch, overnight-2026-10-23. Nothing is pushed or live. - Fixed the game's clock-change (daylight saving) bug. Existing logs are unchanged, and the SolarWinds case now has its November activity. - Checked the facts in all 10 real-breach cases against public sources and fixed 3 errors: - SolarWinds: the file hashes didn't match the file version. - SolarWinds: a domain was mislabeled. - Change Healthcare: a date claim had no source. - New difficulty setting: Trainee, Analyst or Senior. Analyst is the game as before. You'll find a music on/off button on the title screen now. - Tests: 130/130 unit tests. In Chrome, all passed: Day 1 (67 checks), the worst day (15), the full week (37, run twice), all 15 cases (251) and the new difficulty test (14).
- Where it stood: The live site is unchanged. Tonight's work is tested and waiting on the overnight-2026-10-23 branch for you to review and push. The only milestone left is M7, the playtest, which still needs your testers.
- Problems: The run stopped while waiting on the background test. It left no final summary, no committed notes and an uncommitted PROJECT.md. Soliman wakes up to unfinished handoff.; Soliman asked for several rounds until usage runs low, but it used only ~26 min of 13 hours and 121k output tokens. Most of the budget was left unused.; Two quote-escaping slips in edited JS strings cost extra test and fix loops (the SolarWinds one was caught by tests).; It spent time on the new difficulty feature and fact edits, rather than open items already in the plan, which is hard to judge from here.; The wakeup was scheduled for 01:01, but the run ended at 12:56 AM, so the follow-up never ran.
- Advice for the next run: Create and confirm the branch overnight-2026-10-23 first. Never end while a test or note is pending: finish PROJECT.md, commit it, and call report_to_soliman first. Run long browser suites with a bounded wait, then record the real pass/fail numbers. Keep working in rounds through the night. Do not stop after one feature. Double-check apostrophes in JS strings before committing.
### Oct 20, 2026: done, supervisor grade B
- He asked: ok go do improvements, improve on everything
- Did: You asked me to improve everything, so I did four things. All of them are live: - **SolarWinds 2020 (SUNBURST) case:** the last locked card is now playable, so Case Files has 15 cases. - **Background music:** made in code, with 4 moods (menus, workday, alerts, report card). You can turn it off in the P menu. - **Phones:** in landscape, the computer, report, Case Files and glossary screens now fill the whole screen, so text is about 2x bigger. A "Stand up" button sits at the bottom. - **Reduced motion:** if your device asks for less motion, alerts no longer shake the screen. Tests: 126/126 unit tests pass. In Chrome, Day 1 (67 checks), the worst day (15) and the full week (37) all pass. The live site passed all 15 cases (251 checks) and Day 1 (67). Committed and pushed as dcda50e.
- Where it stood: Everything is live at https://iiciel.github.io/cyber-office/: the 5-day week, 15 Case Files and labs, plus music and phone-friendly screens. The only milestone left is M7, the playtest, which is waiting on you to pick testers.
- Problems: The scope was 'improve everything' but the run did only four items. It also did not pick a single milestone as PROJECT.md says.; The Case Files smoke test has no single-case filter on the live site, so it re-ran all 15 cases. Two commands hit timeouts and were moved to the background, costing about 10 minutes.; The live full-case run took about 8 minutes just to prove one new case.; The sub-agent had only a partial view of the shared code, and wrote some log entries that needed fixes (the AD thumbnail log, a query count) before the tests passed.; It closed a stale 'close_for_you' item with a vague reason.
- Advice for the next run: Run only the new case's smoke test (ONLY=<id>) during development, then one full pass before pushing. Test every claimed number in the transcript, including the worst-day run, and show its output. For accessibility changes, test them with the setting actually on. Keep the music toggle obvious and consider defaulting it off.
### Oct 19, 2026: done, supervisor grade B
- Did: No new milestone this run: the only one left is M7 (the playtest), and it's waiting on you to pick testers. To make that easy, I wrote PLAYTEST.md: a message you can paste to testers, what to watch for, 8 questions and a results table. I also checked the live site in Chrome. Unit tests: "pass 111, fail 0". Day 1: "SMOKE PASS (67 checks)". All 14 cases: "CASE PASS (228 checks)". The last 5 GitHub deploys passed on the new Ubuntu 26 runner. Committed and pushed as de09c3c, and the site returns 200. Changes to PROJECT.md: I removed 2 issues that are no longer true ("Case Files not deployed yet" and "check the Ubuntu 26 run"), rewrote the old real-company-names question, and updated the test counts. Nothing was reverted.
- Where it stood: Everything built so far is live at https://iiciel.github.io/cyber-office/: the 5-day week plus 14 Case Files and labs. The only milestone left is M7, a playtest with 2-3 people, and the kit for it is ready.
- Problems: The task text said to start with M1, but the project was already far past that. The agent had to find this out itself, so the run built nothing new.; About 8 minutes (10:13 to 10:21) went on the Case Files smoke test: the first run printed nothing, then the agent read the script's arguments and reran it.; PLAYTEST.md was not asked for. It is useful and small, but it goes beyond 'one milestone per run'.; The agent closed 3 items on Soliman's behalf. Reasons were given, but the third ('replaced by updated todo') is only a judgment call.
- Advice for the next run: Only M7 (playtest) is left, and it needs Soliman's testers. Don't rebuild or re-verify everything. If results from testers are in PLAYTEST.md, turn them into fixes and check them off. If not, do a quick live-site check, report that you're waiting on testers, and stop. If a smoke test prints nothing, rerun it with its args once and report the exact summary line.
### Oct 19, 2026: done, supervisor grade B
- Did: No new milestone this run. The only one left is M7 (playtest with 2-3 people), and it's blocked until you pick the testers. I committed the project file update from the Command Center (b987cb6) and re-ran the 39 unit tests: all pass. The live site is up and returns 200. Nothing was reverted or lost. Nothing was pushed.
- Where it stood: The 5-day game is live. Case Files (3 real-breach replays) is finished and tested, but it's only on your PC: 3 commits are waiting to go live, held until you OK naming Uber, MGM and Colonial Pipeline.
- Problems: Three commits, including Case Files, sit unpushed, so the live site lacks Case Files. The run noted this but didn't push or ask clearly for a go-ahead.; The run committed a Command Center rewrite of PROJECT.md that cut 35 lines without reviewing what was dropped.; No browser test this run (it said so itself), so the Case Files build is still untested live.
- Advice for the next run: Don't start a new milestone until Soliman names the playtesters for M7. If told to deploy, push the 3 waiting commits, then load the live site in a browser and confirm Case Files shows. When the diff of PROJECT.md removes content, list what was removed in the report. Paste the test summary line (pass count) into the report so it can be checked.
### Oct 18, 2026: done, supervisor grade B
- Did: Only M7 (the playtest) was left, and it's blocked until you pick testers, so I built nothing new this run. Instead I found and saved work an earlier session had left uncommitted (33 files): "Case Files", a second mode where you replay 3 real breaches (Uber 2022, MGM 2023, Colonial Pipeline 2021). I re-ran every test and all pass: 39 unit tests, plus 4 Chrome runs (Day 1 with 67 checks, worst day 15, full week 37, all 3 cases 61). Of the 15 source links in the cases, 12 load; Bloomberg, SEC and Uber block automated checks. It's committed (8136bd7 + notes 7583b31) but NOT pushed, so the live site doesn't have it yet. Nothing was reverted or lost: PROJECT.md was edited in place, not reverted.
- Where it stood: The 5-day game is live. Case Files (3 real-breach replays) is finished and tested but only on your PC, waiting for your OK on the real company names. The only milestone left is M7, the playtest.
- Problems: Did not push, so the live GitHub Pages site doesn't have Case Files. It stayed unpushed because the notes said nothing about it, which leaves the portfolio piece out of date.; Spent roughly 8 of 10 minutes re-verifying already-passing work (four smoke suites, screenshots, link checks) before committing. The supervisor had to tell it to stop and commit.; The agent killed a stale preview server process (PID 32824) without checking what it was.; A big feature was left uncommitted by an earlier session, so there was a risk of losing work.
- Advice for the next run: Commit any leftover work first, then verify once. Only M7 is left and it needs Soliman to pick testers. Don't invent new milestones. Push only if PROJECT.md says to; otherwise report that the commit is unpushed. Keep link checks short and note which sites block bots.

## Waiting on Soliman
- Try the new settings for 3 minutes: music, difficulty, font and phone layout, and say what to keep
- Review the overnight branch and push it to make it live
- Pick 2-3 people to playtest Cyber Office and send them the ready-made message (milestone M7)
- Answer the open questions: game title, art plan, and whether to keep the character names
- Play Day 1 once, start to finish (about 15 minutes)
