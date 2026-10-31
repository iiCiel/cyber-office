# Project: Cyber Office

> Project file from the Command Center, Oct 31, 2026, 1:16 PM. Paste it into a new project (New project, then "Start from a project file") or into a chat to pick up exactly where this left off.

## Goal
A pixel-art browser game where you live a real day as a junior security analyst: walk the office, read real-looking email, dig through logs, deal with coworkers, and watch your choices play out. Not a quiz and not a wall of text. Built in public as a portfolio piece for internship applications.

## What each run does
QUALITY BAR (Soliman, Oct 31): no priority order between the lab library, the CCDC mode, and the pentest-competition mode — ALL of them must be really good, deep, realistic and polished, never rushed. Quality over speed and over breadth. Build each piece to a high bar and don't call anything done until it genuinely teaches the player and is verified through the real UI. Take all the time and usage needed.

STANDING GOAL: build a LARGE, varied library of ethical-hacking labs/engagements AND competition-training modes for this educational portfolio game. Soliman wants to get good enough to actually enter and win student cyber competitions he's been skipping. Two headline additions on top of the general lab library:

(A) CCDC MODE (Collegiate Cyber Defense Competition — a BLUE TEAM/defense comp): inherit a small-business network full of default creds/misconfigs, under a clock: triage & inventory, fix weak passwords, harden/close services while KEEPING scored services up (web/mail/DNS/DB), handle management "injects" (business tasks + incident reports), and survive a live red team. Score like real CCDC: service uptime + injects − compromises. Teach the real competitor playbook (first-15-min checklist, what to harden first, how not to drop services).

(B) PENTEST COMPETITION MODE (CPTC-style — the pentest comp he missed): hired as pentesters for a fictional client, scoped RoE, enumerate → find/chain vulns → scored deliverable is a professional pentest report (exec summary, risk-ranked findings, evidence, remediation). Teach report-writing, since that wins CPTC.

Both: beginner-friendly guided version first (hints + a "what competitors actually do" briefing) then an advanced timed version.

General library (ongoing): easy→advanced labs across recon/enumeration, web/OWASP Top 10, network scanning, password & hash attacks, Windows+Linux privesc, Active Directory, phishing/social engineering, wireless, post-exploitation/lateral movement, reporting. Each plays as an interact…

## Folder
D:\Projects\cyber-office

## Notes (what is done, in progress, next, issues)
STATUS: LIVE at https://iiciel.github.io/cyber-office/ (deploys from main via GitHub Actions; `gh run list --branch main`). main HEAD 7fa3efb. Fix-up c247d12 + picker redesign ea09a43 both deployed with success. 16 cases (12 real, 4 labs), and all 16 have playbook + Red team drill + Pentest Report Builder. Title "Red team engagement" (key R) = ENGAGEMENT PICKER with 5 engagements. Registry src/cases/engagements.js = [ext, web, phish, cloud, ad] + ENGAGEMENT_META (category, level, skill, icon) + CATEGORIES/LEVELS. engage.js has loadBests(). MUSIC REMOVED, do not re-add.

DONE OCT 31 FIX-UP (supervisor's 5 items):
1) Lab playbook phases now match ATT&CK tactics: AD T1204.002=Execution, AWS T1552.001=Credential access, Linux T1505.003=Persistence, BEC T1550.004 + T1656=Defense evasion.
2) tests/pentest.test.js runs every report-builder rule over all 16 playbook cases, labs included, and prints the case list. Added 10 techniques to TACTICS.
3) AWS lab playbook: new Collection step T1530 (38 GetObject on halcyon-claims-backup by aws-support-bot) before StopLogging. T1530 added to awslab2026 attack[]. Now 7 steps.
4) Title sub = '5 pentests: external, web SQLi, phishing, AWS cloud, AD'. It fits at 1366x768 and 844x390.
5) LIVE proof: scripts/verify-labs-live.mjs (real keyboard + clicks) = 15/15 on the live site, 0 console errors, all 4 labs grade A, run twice. Screens in smoke-out/labs-live.

PICKER REDESIGN: hero with a completed x/N bar, category + level filter chips, 2-column pixel cards (level pips, best-grade stamp, ATT&CK tactic tags), 1 column under 760px. scripts/smoke-picker.mjs <url> <outdir> passes on the live site.

NUMBERS: npm test 269/269. verify-engage 176/176. verify-labs-live 15/15 live.

VERIFY: dev server: `npx vite --port 5192 --strictPort`. Stop it with: Get-NetTCPConnection -LocalPort 5192 | Stop-Process. Live checks: node scripts/verify-labs-live.mjs https://iiciel.github.io/cyber-office/ ; node scripts/smoke-picker.mjs <url> smoke-out/live.

NEXT (Soliman's new direction; all 3 equally important; quality over speed):
A) CCDC blue-team mode.
- Setup: you inherit a misconfigured small business (fictional, doc IPs): fw, DC+DNS, web, mail, DB, workstation. Keep the scored services up (HTTP, SMTP/IMAP, DNS, MySQL).
- Fixes: change default creds, remove backdoors and rogue admins, firewall default-deny + allow scored ports.
- Injects: inventory memo, least-privilege new user, vendor FTP request, incident report, DB-exposure change request.
- Red team: a scheduled red team hits anything left open, and a compromise leaves persistence until you evict it.
- Score = service uptime + injects - compromises.
- Teach the first-15-minutes checklist and the traps: block-all firewall, binding MySQL to localhost, rotating the DB password without updating wp-config, changing the scored user's password without a PCR, a full upgrade/reboot mid-competition.
- Modes: guided (briefing + hints) first, then an advanced timed version. Defensive only.
- Plan: engine src/game/ccdc.js + scenario data + tests + CcdcScene + a "Competitions" title item.
B) CPTC mode built around the deliverable: scope/RoE decisions, chaining canned findings, risk rating, exec summary + findings + remediation, judged like CPTC. Build on src/game/pentest.js.
C) Lab library growth: a safety classifier stopped one attempt to write new attack-chain engagement content on Oct 31, and the supervisor said to drop it for that run. Agree on an approach with Soliman before retrying (e.g. defense-side or report-focused labs).
Older: tool-picker mini-game; link engagements from Case Files.

ISSUES: verify-labs-live red-team screenshots cut off after the first 2 steps (cosmetic; the checks cover the whole debrief). Untracked title.png in the repo root (left alone). Debrief re-renders on every keystroke. No focus trap. Phone not tested by a person. A11y gaps (AD tree focus; index.html blocks pinch-zoom). CRLF/LF mix.
OPEN QUESTIONS: game title / own art / character names / splunk look-alike? M7 playtesters? allow pinch-zoom? How should the lab library grow after the safety block?

## Recent runs (newest first)
### Oct 31, 2026: done
- He asked: Fix-up run started by the supervisor. It checked the last run's work itself and found 5 problems: 1. Lab playbook steps break the project's rule that a step's phase must be one of its ATT&CK technique's tactics. Because the report builder grades severity by phase, the answer key for these labs is wr
- Did: All 5 fixes are live and checked on the real site. The red team menu is redesigned. No new hacking labs this run: a safety check blocked that content. 1. Done + live: the lab "attack steps" now match the right MITRE ATT&CK stage. The AWS lab gained the missing step where the attacker reads the S3 bucket. Tests now cover all 16 cases (269/269 pass). 2. Done + live: the title screen says "5 pentests: external, web SQLi, phishing, AWS cloud, AD" instead of "Two". It fits on laptop and phone screens. 3. Done + live: on the real site a script opened each of the 4 labs and played "Red team it", then filled in "Write the report" and generated it. Result: 15/15 checks pass, 0 errors, all grade A. 4. Done + live: new Red team menu. Cards with level badges (Beginner / Intermediate / Advanced), filters by topic and level, a "2/5 completed" progress bar and your best grade stamped on each card. Labs: 5 before, 5 now. 5. Needs you: the CCDC defense mode and the CPTC report-writing mode are planned in detail for the next run. Not built yet; the supervisor told me to stop after the fixes. Next: open https://iiciel.github.io/cyber-office/ , press Ctrl+Shift+R, then press R to see the new menu. De…
- Where it stood: Live game: 16 cases, all with playbook + red-team drill + report builder, plus 5 red-team engagements behind a redesigned card menu. All supervisor fixes are verified on the live site.
### Oct 31, 2026: done, supervisor grade B
- Did: Done + live: all 4 practice labs now have the full security treatment (playbook + red-team drill + report builder), not just the real breach cases. 1. Done + live: Attacker's Playbook added to the 4 labs (AD, AWS, Linux, email-fraud/BEC) — a step-by-step "here's how the attack happened" written from each lab's own facts. 2. Done + live (bonus): because of that, the "⚔ Red team it" and "📝 Write the report" modes now also work on all 4 labs — before, labs only had the hunt. Every case in the game now has all 3 modes. 3. Done: checked all 4 labs render in a real browser, 0 errors; tests 268/268 (added 9). 4. Needs you (unchanged): play the 5 red-team engagements once and say if they're good enough for University of Akron. Next: open https://iiciel.github.io/cyber-office/ , Ctrl+Shift+R, press 📁 Case Files, open a "Practice lab" card, try "⚔ Red team it". Details: commit 13dab77 on main, deploy succeeded, live bundle BNt3xqyY contains the new lab playbooks.
- Where it stood: Live game: all 16 cases (12 real + 4 labs) now carry the Attacker's Playbook, Red Team drill and Pentest Report Builder; plus 5 red-team engagements behind the R picker. Still waiting on Soliman's feedback on the engagements.
- Problems: The task said to pick the next unchecked milestone, one per run, starting with M1. This run built something not named in the instructions. M1 was probably already done before the run, since the repo had a fifth engagement committed, but th…; The browser checks went through window.__game and forced scene starts. They did not test the real click path from Case Files.; Stray files were left around: title.png untracked, and a screenshot saved in smoke-out.; Wasted a few calls on a blocked sleep-based wait and an empty output file read.
- Advice for the next run: Read PROJECT.md and name the milestone you are building; say so if it differs from the one asked. Test through the real UI clicks, for every lab and every mode you claim. Use a single status check for deploys instead of sleep loops.
### Oct 30, 2026: done, supervisor grade B
- Did: A 5th red-team engagement is live: an AWS cloud hack modeled on the 2019 Capital One breach. 1. Done + live: "AWS cloud (SSRF → S3)". A URL-import field fetches whatever address you give it (SSRF). You point it at the server's metadata service, steal its AWS keys, use them from your own laptop, list the S3 bucket and read the proof file. 2. Done: the SOC debrief uses real AWS log formats (CloudTrail, GuardDuty alerts, WAF and web logs). Using stolen server keys outside AWS always triggers GuardDuty, just like in real life. There's also a trap: downloading the whole bucket of customer files counts as a rules-of-engagement strike. 3. Done: fixed a bug where the game screen stayed too big after you shrank the browser window on a normal monitor. 4. Needs you: play the engagements once and say if they're good enough to show University of Akron. I'm not adding a 6th until you've looked. Next: open https://iiciel.github.io/cyber-office/ , press Ctrl+Shift+R, press R, pick "AWS cloud (SSRF → S3)". Details: commit d77b649 is on main and the deploy succeeded. The live site's code includes halcyon-cloud-2026. Tests: 259/259 unit, 176/176 browser (all 5 engagements, desktop + phone, 0 page er…
- Where it stood: Live game has 5 red-team engagements behind the R picker (external, web SQLi, phishing/M365, AWS cloud, internal AD), each with a terminal, a SOC debrief and a grade. Waiting on Soliman's feedback.
- Problems: The run was told to start with M1 (Phaser project and walkable room), or pick the next unchecked milestone. The project was already far past that, so it appears to have picked its own work. The transcript doesn't show it reading PROJECT.md…; About 10 minutes went on the verify failures, mostly on layout guesses. The first scroll fix was wrong, and it took several diagnostic reruns to find the real cause.; One blocked command (sleep) cost a retry. Monitor use was fine after that.; Pushed straight to main and deployed. The notes only say the project deploys from main, so this is probably within the project's rules. The memory file only covers ZipsMarket, not this project.; Nothing in the transcript shows a CAPTCHA, a password, or deleted files. The content is a fictional lab, so the hard rules were not breached.
- Advice for the next run: Read PROJECT.md first and follow its milestone list, not the prompt's stale 'M1' line. Do not add a 6th engagement until Soliman has played the current five. When a browser check fails, dump the layout state first, not after two guessed fixes. Run the test suite with visible final counts before committing.
### Oct 30, 2026: done, supervisor grade A
- He asked: continue what we were doing, add ethical hacking stuff, pen testing. (supervisor make sure he does it and doesnt get blocked, find ways)
- Did: 4 red-team engagements are now LIVE for your interviewer (added 2 more this run). 1. Done + live: web-app SQL injection pentest (OWASP A03) — one quote → read the admin password from the DB → crack it → take over the admin console. 2. Done + live: phishing → MFA fatigue → Microsoft 365 account takeover (the Uber/MGM-style path): phish a password, push-bomb MFA, sign in from a new country, read the mailbox. 3. Done + live: the internal AD takeover that was stuck last run (push had been blocked) — pushed and deployed. 4. Done: the "Red team engagement" picker (press R) now has 4 scenarios: External pentest, Web SQLi, Phishing/M365, Internal AD — each with its own SOC debrief (find your own tracks in realistic logs) and an A–F grade. 5. Needs you: play them once and tell me if the security side is good enough to show University of Akron. Next: open https://iiciel.github.io/cyber-office/ , hard-refresh (Ctrl+Shift+R), press R. Details: tested 250/250 unit + 141/141 browser (desktop + phone, 0 errors); commits 8c23c7f (web) + 3cf06eb (phish) on main; live bundle verified to contain both.
- Where it stood: Live game has 4 red-team engagements behind the title-screen picker (external pentest, web SQLi, phishing/M365, internal AD), each a scripted terminal + SOC debrief + grade. The 4 practice labs still have no playbooks.
- Problems: One wasted tool call: a blocked 'sleep' command. The agent recovered.; Waiting on the deploy used a background watch that returned empty output, plus a wakeup. It then checked the live bundle directly, so the watch was a waste.; The supervisor check at 11:21 was a bare 'on_track, continue', so it did not add anything toward 'find ways, don't get blocked'.; Pentest content is only simulated inside the game. The ethics are fine, but there is no real lab or tool exercise.
- Advice for the next run: Check the live deploy with a single 'gh run view' or bundle grep, not a sleep. Before adding a 4th scenario, read Soliman's feedback on the 3 existing ones. Keep pushing to main only as PROJECT.md allows, and verify the live bundle after each deploy.
### Oct 29, 2026: stopped by the supervisor, supervisor grade B
- He asked: go keep adding and working on red teaming, pentesting stuff. actual hacks and specific stuff, im sending this website to an interviewer. (supervisor make sure he does it and doesnt get blocked, find way around it)
- Did: 232/232. Now update PROJECT.md notes, then commit and push. Let me make targeted edits:
- Problems: git push was rejected, so the work is not on GitHub Pages. Soliman is sending this site to an interviewer, so the new content is not visible yet. The memory note allows pushes only for ZipsMarket, not here.; Ran out of plan (90% usage) after 16 minutes, with one milestone's worth of work done.; The first browser verify failed on a syntax error that tests did not catch. Tests passed 223/223 while the app was broken, so tests alone gave false confidence.; Only one new engagement was added, though the ask was to keep adding actual hacks and specific stuff. Scope was modest for the time.; The first probe failed with a missing playwright-core module, which wasted a call.
- Advice for the next run: Check whether the last commit is pushed before starting; if not, ask or leave it for Soliman. Run the browser verify right after the first scene edit, not at the end. Next, add another specific attack scenario (e.g. web app SQLi/phishing path) with its SOC debrief. Stop the dev server with a Windows command, not lsof.

## Waiting on Soliman
- The supervisor opened the last Cyber Office run's work and found 5 problems; a fix-up run is fixing them now.
- Play the 5 red-team engagements once and say if they're good enough to show University of Akron
- Pick 2-3 people to playtest Cyber Office and send them the ready-made message (milestone M7)
