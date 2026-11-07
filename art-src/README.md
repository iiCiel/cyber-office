# art-src: the HD art pipeline

The detailed office art (floor tiles, furniture, the 6 characters) was generated with the OpenAI Codex CLI
image tool, using the prompts in job-tiles.txt, job-props.txt and job-chars.txt and the shared style in STYLE.txt.

1. Codex writes raw PNGs on a magenta background into art-src/raw/{tiles,props,chars}/ (about 45 MB, not in git;
   rerun the job files with Codex to recreate them).
2. `python art-src/process.py [tiles|props|chars]` keys out the magenta, crops, and scales everything to
   4 texture pixels per world pixel. Output goes to public/art/ (tiles-hd.png, prop-*.png, char-*.png).
3. src/art/hd.js loads them and shows them at 1/4 scale, so collisions and positions do not change.
   Add `?art=classic` to the URL to see the old 16px procedural art.

preview/ holds contact sheets of the processed art for review.
