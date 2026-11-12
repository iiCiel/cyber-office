// Wall tops get trim on every side that does not continue into another wall top (lit top/left bevel, shaded
// bottom/right bevel, dark outline), so walls read as raised walls instead of flat black blocks.
// tiles-hd.png holds 16 variants after the base tiles: index TILES.length + mask, mask bits N=1 E=2 S=4 W=8
// set when that neighbour is also a wall top. Off-map counts as wall (no trim at the map edge).
export const WALL_TOP = 2;
export const BASE_TILES = 12;
export function wallMask(raw, y, x, wall) {
  const is = (yy, xx) => yy < 0 || yy >= raw.length || xx < 0 || xx >= raw[yy].length || raw[yy][xx] === wall;
  return (is(y - 1, x) ? 1 : 0) | (is(y, x + 1) ? 2 : 0) | (is(y + 1, x) ? 4 : 0) | (is(y, x - 1) ? 8 : 0);
}
export function autotileWallTops(raw, first, img, tile = 64) {
  const slots = img ? Math.floor(img.width / tile) * Math.floor(img.height / tile) : 0;
  if (slots < BASE_TILES + 16) return raw; // older tileset without the variants
  const wall = first + WALL_TOP;
  return raw.map((row, y) => row.map((t, x) => (t === wall ? first + BASE_TILES + wallMask(raw, y, x, wall) : t)));
}
