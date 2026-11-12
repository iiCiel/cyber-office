# art-src: retired Codex HD art (not used by the game)

Nov 6, 2026: Soliman preferred the original 16px pixel art, so the game is back on the procedural art in
src/art/textures.js and maps/tiles.png. The Codex HD art is kept here, unused, in case it is wanted later:

- codex-hd/public-art/: the processed PNGs that used to live in public/art/ (tiles-hd.png, prop-*.png, char-*.png).
- codex-hd/src/: hd.js (the loader), autotile.js (wall-top autotiling) and its test. Not imported anywhere.
- job-*.txt, STYLE.txt: the Codex prompts. process.py: the raw-to-game pipeline (it writes to public/art/;
  point it at codex-hd/public-art/ if you rerun it, or the game build will ship the files again).
- preview/: contact sheets of the processed art.

To bring the HD art back, revert the "Restore original pixel art" commit.
