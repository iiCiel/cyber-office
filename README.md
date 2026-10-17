# Cyber Office

A pixel-art browser game where you live a real day as a junior security analyst: walk the office, read real-looking email, dig through logs, deal with coworkers, and watch your choices play out.

**Play:** https://iiciel.github.io/cyber-office/

Status: early. Right now you can walk around the office, bump into furniture, and talk to things. The inbox, log viewer and coworker requests come next (see `PROJECT.md`).

## Controls
- Move: WASD or arrow keys, or click/tap where you want to go
- Interact: E, Space or Enter (or click the thing)

## Run it locally
```
npm install
npm run dev        # then open http://localhost:5173/cyber-office/
```

## Test
```
npm run build
npx vite preview --port 4173      # in one terminal
npm run smoke                     # in another: drives the game in Chrome, saves screenshots to smoke-out/
```

## Tech
Phaser 3 + Vite, plain JavaScript. All art is placeholder pixel art drawn in code (`src/art/`). Deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main`.
