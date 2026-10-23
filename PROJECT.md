# Project: Cyber Office

> Project file from the Command Center, Oct 23, 2026, 1:08 AM. Paste it into a new project (New project, then "Start from a project file") or into a chat to pick up exactly where this left off.

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

Oct 23: on branch overnight-2026-10-23, commits 3b5b310..97b8a24 (plus notes). NOT pushed and NOT live. To ship: git checkout main && git merge overnight-2026-10-23 && git push origin main, then run the live smoke.
- DST fix. src/game/siemfmt.js easternOffset() uses the real US Eastern rules: since 2007, 2nd Sunday of March to 1st Sunday of November at 2 AM; before that, 1st Sunday of April to last Sunday of October. Existing logs are byte-identical.
- The SolarWinds replay now includes beacons from Oct 12 to Dec 9 and 2 November mail-read sessions. They are appended at the end of generateLogs.
- SolarWinds facts checked against the FireEye CSVs (mandiant/sunburst_countermeasures):
  - DLL hashes match 2020.2.5300.12432.
  - The BEACON domain is now incomeupdate.com.
  - thedoccloud.com is labeled as a second-stage domain.
- The other 9 real cases were fact-checked. The Change Healthcare "March 13" claim was removed.
- Difficulty setting in src/game/difficulty.js (localStorage cyber-office:difficulty):
  - Trainee: 6 s per game minute, a "Stuck?" hint, ransomware at 0.6x.
  - Analyst: the default.
  - Senior: 3 s per game minute, no arrow, ransomware at 1.4x.
  - Scoring is the same at every level. The report card shows the line if the level is not Analyst OR the hint was used.
- Fix-up (cb725d2):
  - The SolarWinds autumn entries had lone backslashes. They now read NT AUTHORITY\SYSTEM and \Inbox / \Sent Items.
  - tests/helpers/caseChecks.js catches lost backslashes in every case.
  - The report card keeps the hint note after switching back to Analyst. smoke-difficulty covers this path.
- Round 2 (Oct 23 morning, commits 6d8b7ab, bd3aafc, 97b8a24 + notes):
  - BIG FIX (bd3aafc): the game clock froze on the 2nd day started in the same tab (Next day, Restart this day, a day jump, a 2nd case). This bug came from the new difficulty code, so it is only on this branch, never live. Cause: Phaser keeps a destroyed timer's delay, so applyDifficulty() thought the clock was already running. Fix: clockEvent = null in OfficeScene.create(). smoke-difficulty now checks the clock ticks by itself after "Start Tuesday". That check failed on the old code (537 -> 537) and passes now (537 -> 539).
  - Also in bd3aafc: a finished day keeps the level it was played on, and saved junk like "toString" falls back to Analyst (unit test).
  - Midnight Blizzard (6d8b7ab): "access removed on or about Jan 13, 2024" is now verified against the Jan 19, 2024 8-K. The filing is added to the sources.
  - Accessibility (97b8a24):
    - The AD Users and Computers tree works with Tab, Enter, Space and the arrow keys, checked by hand in Chrome.
    - Computer screens take focus when they open. When they close, focus goes back, but never into a text field, so the game keys still work (checked).
    - Icon buttons have names.
    - The +/- field buttons work with the keyboard.
    - The mail list uses real buttons.
    - Secondary text and badges reach WCAG AA contrast.

Deploy: git push origin main (Actions about 35 s), then node scripts/smoke.mjs https://iiciel.github.io/cyber-office/ smoke-out/live . Repo: https://github.com/iiCiel/cyber-office . PROJECT.md on disk is the source of truth: never revert it.

###### Milestones
- [x] Concept, M1-M6, Days 2-5, polish, VT323 font, Case Files (15), realism pass, day-picker
- [x] Oct 20: SolarWinds case, music, phone screens, reduced motion
- [x] Oct 23: DST fix, fact fixes, difficulty setting, fix-up (on the branch, waiting for merge and push)
- [x] Oct 23 round 2: clock-freeze fix, Midnight Blizzard date verified, accessibility pass, all suites re-run on the branch (waiting for merge and push)
- [ ] M7 Playtest with 2-3 people (BLOCKED: Soliman picks testers). Kit: PLAYTEST.md.
- [ ] Later: a second week, original art, real-device mobile test

###### Tests (Oct 23 round 2, ALL re-run today on the final branch build 97b8a24)
- npm test: 130/130 (the junk-value checks were added inside an existing test).
- Browser smokes, each taking [url] [outdir]:
  - smoke: 67
  - smoke:bad: 15
  - smoke:week: 37. It ran 3 times in a row on bd3aafc plus once on the final build, with no Day 4 flake.
  - smoke:difficulty: 15 (new: the clock ticks after Next day)
  - smoke:case: 251 for all 15 cases, 0 FAIL. It passed 3 times today:
    - on c71f8e6 (smoke-out/case-branch.log)
    - on bd3aafc (smoke-out/case-r2.log)
    - on the final build (smoke-out/case-final.log)
- Single case: ONLY=<case id> (the AD lab id is halcyon-ad-2026).
- Local test build: npx vite build --outDir smoke-out/dist-mine, then npx vite preview --outDir smoke-out/dist-mine --port 4180.

###### Issues
- The SolarWinds ADFS key-read log shape is a reconstruction (disclaimed).
- Microsoft, MSRC, SEC and GeekWire return 403 to scripts. Web search still finds the text: that is how the 8-K was checked.
- Phone mode has only been tested in an emulated viewport.
- smoke-week Day 4 used to flake: 4 clean runs today. Remove this issue if it stays clean.
- Smokes that move the clock with tickMinute() can hide real-time clock bugs. Keep the real-time check in smoke-difficulty.
- Accessibility leftovers (small):
  - Some grey text is still below AA: .statusbar .jobs, .fcard .x, .meta .lookup, .evt-fields td.ty, .empty, .tnum (#7d8a96 / #6c7590).
  - There is no focus trap in the overlays.
  - index.html blocks pinch-zoom (user-scalable=no). That is a game trade-off, so it is in Open questions.
- Report card records only the LAST difficulty of the day: switching Trainee -> Analyst mid-day (without opening the hint) shows no level line.
- Pacing has not been playtested by a human.
- Some files are CRLF and some LF. Watch for apostrophes in single-quoted JS strings. Backslashes need two in JS source. The Bash tool's heredocs collapse \\ to \, so for edits with backslashes use the Write/Edit tools or node with String.fromCharCode(92).

###### Open questions (for Soliman)
- Game title? Own art or free packs? Keep the character names?
- Who are the 2-3 M7 playtesters?
- Keep or rename the 'splunk>' look-alike?
- Should music default to on (current) or off?
- Are Trainee and Senior paced right? Should using the hint lower the score?
- Merge overnight-2026-10-23 and push? (All suites pass on it. It fixes a clock bug that exists only on the branch, so do NOT cherry-pick 7b37a84 (difficulty) without bd3aafc.)
- Allow pinch-zoom on phones (an accessibility win, but it may fight the game canvas)?
- Should the report card show "Trainee" if you used it at any point in the day, not just at the end?

## Recent runs (newest first)
### Oct 23, 2026: done
- He asked: Fix-up run started by the supervisor. It checked the last run's work itself and found 3 problems: 1. New SolarWinds autumn log entries have broken backslash escapes, so the text comes out wrong: 'NT AUTHORITY\SYSTEM' becomes 'NT AUTHORITYSYSTEM', and the mail folders become 'Inbox' / 'Sent Items' wi
- Did: Fixed the 3 problems the supervisor found in last night's work. Everything is on the branch overnight-2026-10-23 (commits cb725d2 and c71f8e6); nothing is pushed. 1) The new SolarWinds log lines now read NT AUTHORITY\SYSTEM, \Inbox and \Sent Items. Checked by generating the logs: 0 "AUTHORITYSYSTEM", 97 correct, and 102 of 102 folder paths start with a backslash. A new unit test catches this mistake in every case. 2) The report card now says the hint was used even if you switch back to Analyst before the day ends. 3) This is the morning summary. Overnight work: the clock-change (DST) fix, the SolarWinds November activity, 3 fact fixes (SolarWinds file hashes, a SolarWinds domain label, a Change Healthcare date), and the Trainee/Analyst/Senior setting with a Music toggle on the title screen. Tests: 130/130 unit, Day 1 67, worst day 15, full week 37, difficulty 14, SolarWinds case 17, all 15 cases 251 (in smoke-out/case-all.log, from last night). All passed again today except the 251 suite: today I only re-ran the SolarWinds case.
- Where it stood: The live site hasn't changed. The overnight branch is fixed, fully tested and ready to merge and push when you OK it. Only M7 (the playtest) is left, and it needs your testers.
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

## Waiting on Soliman
- The supervisor opened the last Cyber Office run's work and found 3 problems; a fix-up run is fixing them now.
- Try the new settings for 3 minutes: music, difficulty, font and phone layout, and say what to keep
- Review the overnight branch and push it to make it live
- Pick 2-3 people to playtest Cyber Office and send them the ready-made message (milestone M7)
- Answer the open questions: game title, art plan, and whether to keep the character names
- Play Day 1 once, start to finish (about 15 minutes)
