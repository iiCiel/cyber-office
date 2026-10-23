# Project: Cyber Office

> Project file from the Command Center, Oct 23, 2026, 12:53 PM. Paste it into a new project (New project, then "Start from a project file") or into a chat to pick up exactly where this left off.

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
- Oct 20 (dcda50e): procedural music, compact phone screens, prefers-reduced-motion.

Oct 23: on branch overnight-2026-10-23, commits 3b5b310 onward (see git log main..overnight-2026-10-23; latest code commit 1c40d9c). NOT pushed and NOT live. To ship: git checkout main && git merge overnight-2026-10-23 && git push origin main, then node scripts/smoke.mjs https://iiciel.github.io/cyber-office/ smoke-out/live
- DST fix (src/game/siemfmt.js easternOffset, real US Eastern rules). The SolarWinds replay now has its Oct-Dec beacons and November mail reads.
- Fact fixes: SolarWinds hashes and domains (checked against the FireEye CSVs). The Change Healthcare "March 13" claim was removed.
- Difficulty setting (src/game/difficulty.js, localStorage cyber-office:difficulty):
  - Trainee: 6 s per minute, a hint, ransomware at 0.6x.
  - Analyst: the default.
  - Senior: 3 s per minute, no arrow, ransomware at 1.4x.
  - Scoring is the same at every level.
- Fix-up cb725d2: SolarWinds backslashes, and the report card keeps the hint note.
- Round 2:
  - bd3aafc: clock-freeze fix (OfficeScene.create() sets clockEvent = null). smoke-difficulty checks that the clock ticks in real time.
  - 6d8b7ab: Midnight Blizzard "access removed on or about Jan 13, 2024" is verified and cited (sec.gov/Archives/edgar/data/789019/000119312524011295/d708866d8k.htm).
  - 97b8a24: accessibility. AD tree keys, overlay focus in and out, aria-labels, native mail buttons, AA badges.
- Fix-up 2 (66cee88): AD tree ArrowUp/ArrowDown/Home/End, with 2 smoke-case checks.
- Round 3 (1c40d9c). A bug-hunt helper read the branch code, and its findings were fixed and tested:
  - Focus trap (src/ui/Overlay.js focusables()/trapTab()): on the computer and SOC screens, Tab wraps last->first, Shift+Tab first->last, and focus outside is pulled back in. The terminal's Tab completion still works. 4 new checks in smoke.mjs; on the old code 2 of them FAIL.
  - MailApp.render keeps keyboard focus on the same email/folder/action. After Report/Delete, focus goes to the next selected email.
  - Title-screen bug (older, also LIVE): after "Quit to title" the 1-5 day picker did nothing. TitleScene now has one this.leaving guard, reset in create().
  - difficulty.js: if storage is blocked or full, the choice still sticks for the session (the unsaved fallback) + a unit test.
  - AA contrast: the leftover grey text, green/red status text, JSON null, the AD twisty and the dim canvas captions. tests/contrast.test.js checks 13 rules.
  - New scripts/smoke-a11y.mjs (npm run smoke:a11y), 11 checks. On the old Mail/Title code it fails 7/11 (smoke-out/a11y-oldcode.log).

###### Milestones
- [x] Concept, M1-M6, Days 2-5, polish, VT323 font, Case Files (15), realism pass, day-picker
- [x] Oct 20: SolarWinds case, music, phone screens, reduced motion
- [x] Oct 23: DST fix, fact fixes, difficulty, fix-up
- [x] Oct 23 round 2: clock-freeze fix, MB date verified, accessibility pass
- [x] Oct 23 fix-up 2: AD tree ArrowUp/ArrowDown/Home/End
- [x] Oct 23 round 3: focus trap, mail-list focus, title day-picker fix, difficulty storage fallback, contrast pass, smoke:a11y
- [ ] M7 Playtest with 2-3 people (BLOCKED: Soliman picks testers). Kit: PLAYTEST.md.
- [ ] Later: a second week, original art, real-device mobile test

###### Tests (Oct 23 round 3: ALL suites re-run on the final build, logs in smoke-out/final-*.log)
- npm test: 145/145
- smoke: 71
- smoke:bad: 15
- smoke:week: 37 (5th clean run, no Day 4 flake)
- smoke:difficulty: 15
- smoke:a11y: 11
- smoke:case: 253/253, run alone. Once, while 6 suites ran in parallel, it timed out on Equifax (the terminal icon was "not visible"). Equifax alone passed 16/16 and the full rerun was clean, so run smoke:case on its own.
- To test one case: ONLY=<id>.
- Local build: npx vite build --outDir smoke-out/dist-mine, then npx vite preview --outDir smoke-out/dist-mine --port 4180 --strictPort.

###### Issues
- The SolarWinds ADFS key-read log shape is a reconstruction (disclaimed).
- Microsoft, MSRC, SEC and GeekWire return 403 to scripts.
- Phone mode has only been tested in an emulated viewport. Pacing has not been playtested by a human.
- Smokes that call tickMinute() can hide real-time clock bugs. Keep the real-time check in smoke-difficulty.
- Accessibility leftovers:
  - The focus trap covers only the computer and SOC screens. The report card, Case Files, glossary and P menu are not trapped, and the phone "Stand up" bar sits outside the trap.
  - AD Users and Computers drops focus to <body> after a twisty click, a list-row click, a Properties tab click or closing a dialog (AdApp.js renderTree/renderList/closeDialog).
  - index.html blocks pinch-zoom.
  - .titem.done uses opacity 0.6 (on purpose).
- Unconfirmed: pressing Enter and then a digit within the 250 ms title fade may start two scenes. The shared this.leaving guard should cover it now, but there is no test.
- The report card records only the LAST difficulty of the day.
- Some files are CRLF and some LF. Watch apostrophes in single-quoted JS strings. Backslashes need two in JS source. Use the Edit tool or node for edits.
- Running 6 browser suites in parallel can cause flakes. Run smoke:case alone.

###### Open questions (for Soliman)
- Game title? Own art or free packs? Keep the character names?
- Who are the 2-3 M7 playtesters?
- Keep or rename the 'splunk>' look-alike?
- Should music default to on (current) or off?
- Are Trainee and Senior paced right? Should using the hint lower the score?
- Merge overnight-2026-10-23 and push? (Don't cherry-pick 7b37a84 without bd3aafc.)
- Allow pinch-zoom on phones?
- Should the report card show Trainee if it was used at any point in the day?

## Recent runs (newest first)
### Oct 23, 2026: done
- He asked: About 1 hour of usage left: make as much progress as you can on the plan (realism, polish, new content already planned, bugs), using parallel helper agents if it helps. Stay on the branch overnight-2026-10-23 and keep tests green. Do NOT push (pushing = live deploy). Nothing destructive. Update the 
- Did: I fixed 4 bugs and improved keyboard use and text contrast. Everything is in one commit (1c40d9c) on the branch overnight-2026-10-23. Nothing is pushed, so the live site hasn't changed. - Bug: after "Quit to title", pressing 1-5 to pick a day did nothing. This bug is also on the live site. Fixed. - Bug: reading mail with the keyboard lost your place after every email. Now focus stays on the email. - Bug: Tab could leave the computer screen. Now it wraps around inside the screen. - Bug: if the browser blocks saving, the difficulty choice wouldn't stick. Now it sticks for the session. - Contrast: all the remaining grey text now meets the readability standard (AA). Every test passed: 145/145 unit, Day 1 71, worst day 15, full week 37, difficulty 15, a new keyboard test 11, and all 15 cases 253/253.
- Where it stood: The live site hasn't changed. The branch overnight-2026-10-23 is fully tested and ready to merge and push when you say so. Only the playtest (M7) is left, and it needs your testers.
### Oct 23, 2026: done, supervisor grade A
- He asked: Fix-up run started by the supervisor. It checked the last run's work itself and found 1 problem: 1. The AD tree's arrow-key support is overstated. Only ArrowRight/ArrowLeft (expand/collapse) are handled. ArrowUp/ArrowDown don't move between items, so the tree is navigated with Tab, not the arrow key
- Did: I fixed the one problem the supervisor found. Last round's notes said the Active Directory list worked with the arrow keys, but only Left/Right (open and close a folder) did anything. Now Up and Down move between items, and Home and End jump to the first and last one (commit 66cee88). I added 2 browser checks for this. They fail on the old code, where focus stays stuck on the top item, and pass now. Down, Down, Up goes #root > #queries > domain > #queries. Tests: unit 130/130, saved in smoke-out/unit.log. The AD case: 18/18. All 15 cases: 253/253 with 0 failures. Nothing is pushed.
- Where it stood: The live site hasn't changed. The branch overnight-2026-10-23 is tested and ready to merge and push when you say so. Only M7, the playtest, is left, and it needs your testers.
- Problems: smoke-out/ is gitignored, so unit.log is not committed and cannot be checked from git history, only from disk.; The run took a few minutes of idle gap between 7:58 and 8:07 with no visible reason, a small time cost.
- Advice for the next run: Stay on branch overnight-2026-10-23 and do not push. When a doc claims a feature, add a test that exercises that exact claim. Print changed doc lines back after editing. Prove edge cases (first and last item), not just the middle path.
### Oct 23, 2026: done, supervisor grade A
- He asked: ROUND 2 (Soliman asleep until he checks later today; can't approve anything). Keep moving the plan forward on the local branch overnight-2026-10-23 in several rounds until usage runs low: open items, bugs, realism, polish, tests. Re-run the full 15-case suite (251 checks) at some point so it's verif
- Did: I found and fixed a serious bug in last night's difficulty setting. After your first day in a browser tab, the game clock stopped, so you couldn't finish Day 2 or a second case. The live site never had it: the bug is only on the branch, and it's fixed there now with a test that catches it. I also confirmed the Midnight Blizzard "access removed about Jan 13" date in Microsoft's SEC filing, and made the computer screens work better with a keyboard and screen readers, with clearer text. Every test was re-run today on the branch: 130/130 unit tests, Day 1 (67 checks), worst day (15), full week (37), difficulty (15), and all 15 cases (251, passed 3 times). Nothing is pushed.
- Where it stood: The live site is unchanged. The branch overnight-2026-10-23 is fully tested and ready to merge and push when you OK it. The only milestone left is M7, the playtest, and it still needs your testers.
- Problems: The clock bug came from last night's difficulty work on the same branch, so part of this run repaired earlier work.; The final test suites took about 30 minutes of a 46-minute run, mostly waiting. The 15-case suite was run three times and the other suites twice.; The run ended about 46 minutes in, with no sign of the 'several rounds until usage runs low' Soliman asked for. It did one round.; Sub-agent edits were broad (6 fixes, 5 files) and were reviewed only by diff and spot checks.
- Advice for the next run: Start from the branch overnight-2026-10-23. Do not push. Run the full suites once at the end, not repeatedly. Write down the source for any date or fact you verify. Use the spare time for more open items and polish instead of stopping after one round.
### Oct 23, 2026: done, supervisor grade A
- He asked: Fix-up run started by the supervisor. It checked the last run's work itself and found 3 problems: 1. New SolarWinds autumn log entries have broken backslash escapes, so the text comes out wrong: 'NT AUTHORITY\SYSTEM' becomes 'NT AUTHORITYSYSTEM', and the mail folders become 'Inbox' / 'Sent Items' wi
- Did: Fixed the 3 problems the supervisor found in last night's work. Everything is on the branch overnight-2026-10-23 (commits cb725d2 and c71f8e6); nothing is pushed. 1) The new SolarWinds log lines now read NT AUTHORITY\SYSTEM, \Inbox and \Sent Items. Checked by generating the logs: 0 "AUTHORITYSYSTEM", 97 correct, and 102 of 102 folder paths start with a backslash. A new unit test catches this mistake in every case. 2) The report card now says the hint was used even if you switch back to Analyst before the day ends. 3) This is the morning summary. Overnight work: the clock-change (DST) fix, the SolarWinds November activity, 3 fact fixes (SolarWinds file hashes, a SolarWinds domain label, a Change Healthcare date), and the Trainee/Analyst/Senior setting with a Music toggle on the title screen. Tests: 130/130 unit, Day 1 67, worst day 15, full week 37, difficulty 14, SolarWinds case 17, all 15 cases 251 (in smoke-out/case-all.log, from last night). All passed again today except the 251 suite: today I only re-ran the SolarWinds case.
- Where it stood: The live site hasn't changed. The overnight branch is fixed, fully tested and ready to merge and push when you OK it. Only M7 (the playtest) is left, and it needs your testers.
- Problems: The first 3 to 4 tool calls were wasted. The shell turned double backslashes into single ones, so the first edit did nothing and left a misleading diff.; The stash test proved nothing because it also stashed the new test. That cost one extra call.; The check script threw a regex SyntaxError on its first run and had to be rewritten.; The final report claims the 251 suite was not re-run, which may not match the logs. The summary is slightly inconsistent.
- Advice for the next run: Edit backslash-heavy files with the Edit tool or node, and check the bytes after each edit. When stashing to prove a test fails, revert only the source file, not the test. State clearly in the report which suites were re-run today and which are old. Stay on the branch and do not push until Soliman decides.
### Oct 23, 2026: done, supervisor grade B
- He asked: OVERNIGHT RUN: Soliman is asleep ~13 hours and cannot approve anything. Do as much useful work as you can on the plan, in several rounds if you can, until usage runs low: open items, bugs, tests, polish, small features already in the plan. Keep tests green. HARD RULES: do NOT push (pushing makes it 
- Did: Overnight I made 6 commits on a local branch, overnight-2026-10-23. Nothing is pushed or live. - Fixed the game's clock-change (daylight saving) bug. Existing logs are unchanged, and the SolarWinds case now has its November activity. - Checked the facts in all 10 real-breach cases against public sources and fixed 3 errors: - SolarWinds: the file hashes didn't match the file version. - SolarWinds: a domain was mislabeled. - Change Healthcare: a date claim had no source. - New difficulty setting: Trainee, Analyst or Senior. Analyst is the game as before. You'll find a music on/off button on the title screen now. - Tests: 130/130 unit tests. In Chrome, all passed: Day 1 (67 checks), the worst day (15), the full week (37, run twice), all 15 cases (251) and the new difficulty test (14).
- Where it stood: The live site is unchanged. Tonight's work is tested and waiting on the overnight-2026-10-23 branch for you to review and push. The only milestone left is M7, the playtest, which still needs your testers.
- Problems: The run stopped while waiting on the background test. It left no final summary, no committed notes and an uncommitted PROJECT.md. Soliman wakes up to unfinished handoff.; Soliman asked for several rounds until usage runs low, but it used only ~26 min of 13 hours and 121k output tokens. Most of the budget was left unused.; Two quote-escaping slips in edited JS strings cost extra test and fix loops (the SolarWinds one was caught by tests).; It spent time on the new difficulty feature and fact edits, rather than open items already in the plan, which is hard to judge from here.; The wakeup was scheduled for 01:01, but the run ended at 12:56 AM, so the follow-up never ran.
- Advice for the next run: Create and confirm the branch overnight-2026-10-23 first. Never end while a test or note is pending: finish PROJECT.md, commit it, and call report_to_soliman first. Run long browser suites with a bounded wait, then record the real pass/fail numbers. Keep working in rounds through the night. Do not stop after one feature. Double-check apostrophes in JS strings before committing.

## Waiting on Soliman
- Try the new settings for 3 minutes: music, difficulty, font and phone layout, and say what to keep
- Review the overnight branch and push it to make it live
- Pick 2-3 people to playtest Cyber Office and send them the ready-made message (milestone M7)
- Answer the open questions: game title, art plan, and whether to keep the character names
- Play Day 1 once, start to finish (about 15 minutes)
