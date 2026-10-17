// Tileset art as plain rectangles: [x, y, w, h, color]. Shared by the game docs and by
// scripts/make-tileset.mjs, which paints these into public/maps/tiles.png for Tiled.
// Index in this array = tile id in Tiled (gid = id + 1).

const carpet = (base, line, dot1, dot2) => [
  [0, 0, 16, 16, base],
  [0, 0, 16, 1, line],
  [0, 0, 1, 16, line],
  [4, 5, 1, 1, dot1],
  [11, 10, 1, 1, dot1],
  [8, 2, 1, 1, dot2],
  [2, 12, 1, 1, dot2],
];

export const TILES = [
  { key: 'floor', rects: carpet('#4a5470', '#434c66', '#56617f', '#3f475f') }, // 0
  {
    key: 'floor-server', // 1
    rects: [
      [0, 0, 16, 16, '#2f3640'],
      [0, 0, 16, 1, '#3d4552'],
      [0, 0, 1, 16, '#3d4552'],
      [1, 1, 14, 14, '#323a45'],
      [7, 7, 2, 2, '#262c35'],
    ],
  },
  { key: 'wall-top', solid: true, rects: [[0, 0, 16, 16, '#262636'], [0, 15, 16, 1, '#1b1b28']] }, // 2
  {
    key: 'wall-face', // 3
    solid: true,
    rects: [[0, 0, 16, 16, '#c9c2b2'], [0, 0, 16, 2, '#b3ab99'], [0, 13, 16, 3, '#8a8170']],
  },
  {
    key: 'window', // 4
    solid: true,
    rects: [
      [0, 0, 16, 16, '#c9c2b2'],
      [0, 13, 16, 3, '#8a8170'],
      [2, 2, 12, 10, '#5d4a3a'],
      [3, 3, 10, 8, '#7fb7e6'],
      [3, 3, 10, 2, '#a9d3f2'],
      [7, 3, 1, 8, '#5d4a3a'],
    ],
  },
  {
    key: 'front-door', // 5
    solid: true,
    rects: [[0, 0, 16, 16, '#262636'], [1, 0, 14, 16, '#8b5a2b'], [2, 1, 12, 14, '#a0693a'], [3, 3, 10, 4, '#7fb7e6']],
  },
  {
    key: 'tile-light', // 6
    rects: [[0, 0, 16, 16, '#b9b4a6'], [0, 0, 16, 1, '#a39e90'], [0, 0, 1, 16, '#a39e90'], [8, 8, 8, 8, '#b2ad9f'], [0, 0, 8, 8, '#b2ad9f']],
  },
  {
    key: 'wood', // 7
    rects: [
      [0, 0, 16, 16, '#7a5232'],
      [0, 3, 16, 1, '#6a4528'],
      [0, 7, 16, 1, '#6a4528'],
      [0, 11, 16, 1, '#6a4528'],
      [0, 15, 16, 1, '#6a4528'],
      [5, 0, 1, 3, '#6a4528'],
      [12, 4, 1, 3, '#6a4528'],
      [3, 8, 1, 3, '#6a4528'],
      [10, 12, 1, 3, '#6a4528'],
    ],
  },
  {
    key: 'server-door', // 8 (closed; swapped out of the walls layer when you badge in)
    solid: true,
    rects: [
      [0, 0, 16, 16, '#262636'],
      [2, 0, 12, 16, '#5b6577'],
      [3, 0, 10, 16, '#6e7a8e'],
      [3, 7, 10, 1, '#5b6577'],
      [10, 3, 2, 3, '#1b1b2a'], // badge reader
      [10, 4, 2, 1, '#ff4f4f'],
    ],
  },
  { key: 'mat', rects: [[0, 0, 16, 16, '#b9b4a6'], [1, 2, 14, 12, '#5a3a2a'], [2, 3, 12, 10, '#6b4636']] }, // 9
  { key: 'carpet-green', rects: carpet('#3f6150', '#385746', '#4b7060', '#344f41') }, // 10
  {
    key: 'wall-face-board', // 11 (wall with a cork board, for flavor)
    solid: true,
    rects: [[0, 0, 16, 16, '#c9c2b2'], [0, 0, 16, 2, '#b3ab99'], [0, 13, 16, 3, '#8a8170'], [2, 3, 12, 8, '#a87b4f'], [4, 4, 3, 3, '#f4f1e8'], [9, 5, 3, 4, '#ffe680']],
  },
];

export const TILE_ID = Object.fromEntries(TILES.map((t, i) => [t.key, i]));
export const TILESET_COLUMNS = 8;
