# Project: Cyber Office

> Project file from the Command Center, Oct 16, 2026, 7:59 PM. Paste it into a new project (New project, then "Start from a project file") or into a chat to pick up exactly where this left off.

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
- Platform: browser. Phaser 3 + Vite (JavaScript), maps made in Tiled, hosted free on GitHub Pages so anyone can play from a link
- Realism: real concepts inside simulated tools: real email header fields, real log formats (Linux auth.log, Windows Event 4625/4624), a few real commands (whois, nslookup, grep)
- Art: start with free CC0 pixel packs (Kenney, LimeZu-style 16x16 office tiles); swap in our own art later

### Gameplay loop (one in-game day, about 10-15 minutes)
1. Morning: arrive, the manager NPC gives one line of context. Check the inbox at your desk.
2. Midday: an alert pops on the SOC screen. Walk to the server room and check the log viewer.
3. Interruptions: a coworker walks up and asks for something (password reset, "can you plug in this USB?"). Some are social engineering.
4. End of day: a short report card: what you caught, what you missed, what it cost the company.

### In-game tools (each one small, real-looking, and fun to use)
- Mail client: hover a link to see the real URL, "View headers" button, sender details
- Log viewer: filter and search, highlight suspicious lines yourself
- Terminal: a handful of real commands with simulated output
- Ticket queue: helpdesk requests that can be legit or a trap

### Making it not boring
- A world to walk around, not menus. Show, don't tell: NPC reactions, sounds, screens changing.
- Every choice has a visible consequence later in the week (miss a phish on Monday, ransomware lights up the office on Wednesday).
- A slow-burn attacker storyline across the week (one group, escalating from spam to a targeted attack).
- Difficulty ramps from obvious scams to subtle, targeted ones.
- Short text everywhere. One idea per message.

### How scenarios work (so adding content is easy)
- Each scenario is one data file (JSON): the emails, log lines, NPC lines, the right calls, and the consequences.
- Each scenario names the skill it teaches (e.g. "spot a spoofed sender", "read a failed-login burst"), mapped to Security+ topics, so the end-of-day report can say what you learned.
- The game saves progress in the browser (localStorage).

### Plan: vertical slice first (Day 1)
One office room, one inbox, one alert, one coworker, one report.
- Day 1 content: 5 emails (2 phishing: a fake password reset and a spoofed "CEO" gift-card request), 1 alert (a burst of failed logins at 3 AM, then a success), 1 coworker request (password reset by phone, has to be verified), end-of-day report.
- Done means: someone who has never seen it can play Day 1 start to finish in a browser, and it feels like a game.

### Milestones
- [x] Concept and design decisions agreed
- [ ] M1: Phaser + Vite project set up, deployed to GitHub Pages (a "hello" room you can walk around)
- [ ] M2: Office tilemap in Tiled, player movement and collisions, desk/server room interactions
- [ ] M3: Mail client UI with the 5 Day 1 emails, link hover and headers
- [ ] M4: Log viewer with the Day 1 alert
- [ ] M5: Coworker NPC and the social-engineering request
- [ ] M6: Consequences and the end-of-day report card
- [ ] M7: Playtest with 2-3 friends, fix what's confusing
- [ ] Later: Days 2-5 and the attacker storyline, sound, original art

### Issues / blockers
None yet.

### Open questions (for Soliman)
- Game title (Cyber Office is a placeholder)
- Make our own art early, or stay on free packs until Day 1 is fun?
- Should the repo be public from day one (portfolio) or after the vertical slice?

### How each Continue run works
Pick the next unchecked milestone, build it, test it in a browser, commit, and update this file (check off what's done, add issues). Keep each run to one milestone.
