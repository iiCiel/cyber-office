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
- [x] M1: Phaser + Vite project set up, deployed to GitHub Pages (a "hello" room you can walk around). Done Oct 16, 2026. Live: https://iiciel.github.io/cyber-office/ · Repo: https://github.com/iiCiel/cyber-office
- [ ] M2: Office tilemap in Tiled, player movement and collisions, desk/server room interactions
- [ ] M3: Mail client UI with the 5 Day 1 emails, link hover and headers
- [ ] M4: Log viewer with the Day 1 alert
- [ ] M5: Coworker NPC and the social-engineering request
- [ ] M6: Consequences and the end-of-day report card
- [ ] M7: Playtest with 2-3 friends, fix what's confusing
- [ ] Later: Days 2-5 and the attacker storyline, sound, original art

### Where things are (code map)
- `src/main.js` game config (960x720, pixelArt, Arcade physics). `src/config.js` tile size 16, zoom 3.
- `src/scenes/` Boot (makes textures + walk anims), Title, Office (room, player, props, coworker, HUD, interactions).
- `src/data/officeMap.js` hand-written room layout (char grid), props with collision footprints and their dialog lines, coworker Dana, spawn. M2 replaces the grid with a Tiled map.
- `src/art/` placeholder pixel art drawn in code (character sprites as char grids, furniture as rects). No external assets yet.
- `src/ui/DialogBox.js` typewriter dialog. Two cameras: main (zoom 3, world) + UI camera (zoom 1, crisp text). New UI objects must go through `scene.ui(obj)`; world objects added after create need `addWorldLate`.
- `scripts/smoke.mjs` Playwright (playwright-core + installed Chrome) test: title -> office -> walk to desk -> interact -> collision -> click-to-walk. Run `npm run build`, `npx vite preview --port 4173`, then `npm run smoke` (or `node scripts/smoke.mjs <url> <outDir>` for the live site).
- Deploy: `.github/workflows/deploy.yml` builds and publishes to Pages on every push to main. Vite `base` is `/cyber-office/` (dev URL is http://localhost:5173/cyber-office/).
- Git: commits use the GitHub no-reply email (172845298+iiCiel@users.noreply.github.com), set in this repo's local git config, because GitHub blocks pushes that expose his private email.

### Issues / blockers
- Click-to-walk moves in a straight line and slides along obstacles; no pathfinding. It can give up behind a desk. Add grid A* in M2 once the Tiled map exists.
- Text uses the Courier New system font; looks fine but not pixel-art. Consider a CC0 pixel font later.
- Dialog lines on the desk/SOC console say "(next updates)", placeholders to remove in M3/M4.
- On phones you can walk by tapping, but the room is small on a phone screen. Not a priority before M7.
- GitHub warns that `ubuntu-latest` moves to Ubuntu 26 on Oct 19, 2026; the workflow should be fine but check the next deploy.

### Open questions (for Soliman)
- Game title (Cyber Office is a placeholder)
- Make our own art early, or stay on free packs until Day 1 is fun?
- Repo went public on M1 (the run asked for a GitHub Pages deploy, and free Pages needs a public repo). Flip it to private in GitHub settings if you'd rather wait until the vertical slice.
- The fictional company is "Halcyon Mutual Insurance" and the coworker is "Dana (IT helpdesk)". OK to keep?

### How each Continue run works
Pick the next unchecked milestone, build it, test it in a browser, commit, and update this file (check off what's done, add issues). Keep each run to one milestone.
