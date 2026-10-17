# Cyber Office

A pixel-art browser game where you live a real day as a junior security analyst: walk the office, read real-looking email, dig through logs, deal with coworkers, and watch your choices play out.

**Play:** https://iiciel.github.io/cyber-office/

Status: early. You can walk the whole office (lobby, open floor, manager's office, break room, meeting room, server room), talk to your manager and a coworker, sit at your computer, badge into the server room, and watch the SOC console's live log feed. The inbox, the log investigation and the coworker requests come next (see `PROJECT.md`).

## Controls
- Move: WASD or arrow keys, or click/tap where you want to go (click on a person or object to walk over and use it)
- Use / talk: E, Space or Enter
- Back / stand up: Esc

## Run it locally
```
npm install
npm run dev        # then open http://localhost:5173/cyber-office/
```

## Edit the map
The office is a [Tiled](https://www.mapeditor.org/) map: open `public/maps/office.tmj` in Tiled.
- `floor` and `walls` are tile layers. Tiles with the `collides` property block movement.
- `objects` is an object layer of points: `prop` (property `tex` = which sprite), `npc` (property `sprite`), `door`, `spawn`.
  The object's name links it to its text and behavior in `src/data/office.js`.
- Tile art lives in `src/art/tileArt.js`; run `npm run tiles` to repaint `public/maps/tiles.png`.

## Test
```
npm test                                  # unit tests (pathfinding)
npm run build
npx vite preview --port 4173 --strictPort   # in one terminal
npm run smoke                             # in another: plays the game in Chrome, screenshots in smoke-out/
```

## Tech
Phaser 3 + Vite, plain JavaScript. Placeholder pixel art is drawn in code (`src/art/`). Deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.
