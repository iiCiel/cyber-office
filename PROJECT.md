# Project: Cyber Office

> Project file from the Command Center, Oct 16, 2026, 8:20 PM. Paste it into a new project (New project, then "Start from a project file") or into a chat to pick up exactly where this left off.

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
- Art: currently placeholder pixel art drawn in code; plan is free CC0 packs (Kenney, LimeZu-style 16x16), then our own art
- Fiction so far: company "Halcyon Mutual Insurance", coworker "Dana (IT helpdesk)", day starts Monday 8:57 AM

### Gameplay loop (one in-game day, about 10-15 minutes)
1. Morning: arrive, the manager NPC gives one line of context. Check the inbox at your desk.
2. Midday: an alert pops on the SOC screen. Walk to the server room and check the log viewer.
3. Interruptions: a coworker walks up and asks for something (password reset, "can you plug in this USB?"). Some are social engineering.
4. End of day: a short report card: what you caught, what you missed, what it cost the company.

### In-game tools
- Mail client: hover a link to see the real URL, "View headers" button, sender details
- Log viewer: filter and search, highlight suspicious lines yourself
- Terminal: a handful of real commands with simulated output
- Ticket queue: helpdesk requests that can be legit or a trap

### Making it not boring
- A world to walk around, not menus. Show, don't tell. Every choice has a visible consequence later in the week. Slow-burn attacker storyline. Difficulty ramps. Short text everywhere.

### How scenarios work
- Each scenario is one JSON data file (emails, log lines, NPC lines, right calls, consequences), each names the skill it teaches mapped to Security+ topics. Progress saved in localStorage.

### Plan: vertical slice first (Day 1)
- Day 1 content: 5 emails (2 phishing: fake password reset, spoofed "CEO" gift-card request), 1 alert (3 AM failed-login burst then a success), 1 coworker request (password reset by phone, must be verified), end-of-day report.
- Done means: someone who has never seen it can play Day 1 start to finish in a browser, and it feels like a game.

### Milestones
- [x] Concept and design decisions agreed
- [x] M1: Phaser + Vite project, deployed to GitHub Pages, a room you can walk around (done Oct 16, 2026). Live: https://iiciel.github.io/cyber-office/ . Repo: https://github.com/iiCiel/cyber-office (public)
- [x] M2: Office tilemap in Tiled, player movement and collisions, desk/server room interactions (done Oct 16, 2026). 6-room office (32x22 tiles) with camera follow, Priya the manager, badge-locked server room door that closes behind you, desk computer and SOC console screens, objective arrow, click-to-walk with A* pathfinding
- [ ] M3: Mail client UI with the 5 Day 1 emails, link hover and headers
- [ ] M4: Log viewer with the Day 1 alert
- [ ] M5: Coworker NPC and the social-engineering request
- [ ] M6: Consequences and the end-of-day report card
- [ ] M7: Playtest with 2-3 friends, fix what's confusing
- [ ] Later: Days 2-5 and the attacker storyline, sound, original art

### Code map (D:\Projects\cyber-office)
- src/main.js: game config (960x720, pixelArt, Arcade physics). src/config.js: tile 16px, zoom 3.
- public/maps/office.tmj: THE MAP (Tiled JSON, 32x22). Layers: floor, walls (tiles with collides=true block), objects (points: prop with property tex, npc with property sprite, door, spawn). Object names link to text/behavior in src/data/office.js. Edit in Tiled from now on. scripts/bootstrap-map.mjs generated it once and refuses to overwrite (needs --force).
- public/maps/tiles.png: tileset, painted from src/art/tileArt.js by `npm run tiles` (scripts/make-tileset.mjs, tiny built-in PNG encoder).
- src/data/office.js: all office text and behavior: FOOTPRINTS (collision per texture), NPCS (Priya, Dana: talk + again lines), PROPS (kind talk/desk/soc), DOORS (server-door badge, front-door), OBJECTIVES (priya -> my-desk -> server-door -> soc), GAME_DATE (Mon Oct 19, starts 8:57).
- src/scenes/OfficeScene.js: loads the map, builds props/NPCs/doors from the object layer, physics, camera follow, HUD (clock, objective + step counter, yellow objective arrow), E prompt, click-to-walk, interactions (talk, sit at desk -> ComputerScreen, sit at SOC -> SocScreen, badge door). Priya's talk sets flags.badgeActive; badge removes the server-door tiles from the walls layer and puts them back 3s after the doorway is clear.
- src/world/pathfinding.js: NavGrid (8px cells, player feet box 8x5), A* with no corner cutting, string-pulling. Pure JS, unit-tested in tests/pathfinding.test.js (`npm test`). Clicking something behind the closed server door walks you to the door.
- src/ui/: DialogBox (typewriter; jumps to top of screen when the player is low on screen), Overlay (monitor frame base, Esc closes), ComputerScreen (desktop: Mail/welcome.txt/Terminal/Tickets placeholders, keys 1-4), SocScreen (SIEM dashboard with a live tail of realistic benign log lines: sshd, Windows 4624/4634, postfix, openvpn, smbd).
- src/art/: pixels.js (player/coworker/manager 12x16 sprites), textures.js (furniture drawn in code), tileArt.js (tiles).
- Two cameras: main (zoom 3, world) and uiCam (zoom 1, crisp text). Use scene.world(obj) for world objects and scene.ui(obj) for UI; both auto-ignore on the other camera.
- scripts/smoke.mjs: Playwright (playwright-core + installed Chrome, headless) plays the M2 loop with mouse clicks, 17 checks. Run: npm run build; npx vite preview --port 4173 --strictPort (background); npm run smoke. Live: node scripts/smoke.mjs https://iiciel.github.io/cyber-office/ smoke-out/live. Screenshots in smoke-out/ (gitignored). Note: the camera shows only part of the map, so the test must walk near things before clicking them.
- Deploy: .github/workflows/deploy.yml publishes to Pages on every push to main. Vite base is /cyber-office/, dev URL http://localhost:5173/cyber-office/.
- Git: repo-local user.email is 172845298+iiCiel@users.noreply.github.com (GitHub blocks pushes showing his private email).

### Issues
- Text uses the Courier New system font, not a pixel font. Consider a CC0 pixel font.
- Placeholders to replace: Mail app says the mailbox is syncing (M3), SOC console has no alerts (M4), Terminal and Tickets are stubs.
- NPCs stand still (a gentle idle bob only). Walking NPCs come with M5.
- On phones you can tap to walk and tap things to use them, but there's no on-screen button for Esc (to stand up from a computer, tap "Stand up" top-right). Not tested on a real phone yet.
- Gotcha: vite preview has to be restarted after changing vite.config.js.

### Open questions (for Soliman)
- Game title (Cyber Office is a placeholder)
- Own art early, or free packs until Day 1 is fun?
- The repo was made public for the Pages deploy. OK, or make it private until the vertical slice?
- Keep "Halcyon Mutual Insurance" and "Dana"?

### How each run works
Pick the next unchecked milestone, build it, test it in a browser (smoke script), commit, push (this redeploys), and update PROJECT.md. One milestone per run.

## Recent runs (newest first)
### Oct 16, 2026: done
- Did: M1 is done and live at https://iiciel.github.io/cyber-office/. It has a title screen and one office room with a server room. You walk with WASD, the arrow keys, or by clicking. Furniture blocks you, and you press E to talk to 13 objects and one coworker, Dana. There's also a clock and a short list of objectives. An automated test in real Chrome passed on my machine and again on the live site: walking, bumping into a desk, using your desk, and click-to-walk, with no console errors. 3 commits are pushed to https://github.com/iiCiel/cyber-office, and every new push redeploys the site.
- Where it stood: Milestone 1 of 7 is done. The game runs in any browser from a public link. All the art is a simple placeholder drawn in code.

## Waiting on Soliman
- Answer the open questions: game title, art plan, and whether to keep the names 'Halcyon Mutual Insurance' and 'Dana'
- Decide: keep the GitHub repo public, or make it private until Day 1 is playable
- Play the M1 build for 2 minutes and say if it feels right
