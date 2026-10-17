// One-time generator for public/maps/office.tmj (a Tiled JSON map).
// After this, Tiled is the source of truth: open public/maps/office.tmj in Tiled and edit there.
// Refuses to overwrite an existing map unless you pass --force.
import fs from 'node:fs';
import { TILES, TILE_ID, TILESET_COLUMNS } from '../src/art/tileArt.js';

const OUT = 'public/maps/office.tmj';
if (fs.existsSync(OUT) && !process.argv.includes('--force')) {
  console.error(`${OUT} already exists. Edit it in Tiled, or pass --force to regenerate (loses Tiled edits).`);
  process.exit(1);
}

const r = (s, n) => s.repeat(n);
// prettier-ignore
const GRID = [
  r('T', 32),
  'T' + 'FFNFFNFF' + 'T' + 'FNFFBFFNFFNFF' + 'T' + 'FFFFFFF' + 'T',
  ...Array(6).fill('T' + r('w', 8) + 'T' + r('.', 13) + 'T' + r(',', 7) + 'T'),
  'T' + 'TTT..TTT' + 'T' + r('.', 13) + 'S' + r(',', 7) + 'T',
  'T' + 'FFF..FFF' + 'F' + r('.', 13) + 'S' + r(',', 7) + 'T',
  ...Array(2).fill('T' + r('.', 22) + 'T' + r(',', 7) + 'T'),
  'T' + r('.', 22) + r('T', 9),
  'T' + r('.', 22) + r('F', 8) + 'T',
  'T' + 'TTTT__TTT' + 'T' + 'TTT____TTT' + 'T' + r('T', 9) + 'T',
  'T' + 'FFFF__FFF' + 'T' + 'FFF____FFF' + 'T' + 'FFFFBFFFF' + 'T',
  'T' + r('_', 9) + 'T' + r('_', 10) + 'T' + r('g', 9) + 'T',
  ...Array(2).fill('T' + r('_', 9) + 'T' + r('_', 10) + '_' + r('g', 9) + 'T'),
  'T' + r('_', 9) + 'T' + r('_', 10) + 'T' + r('g', 9) + 'T',
  'T' + r('_', 9) + 'T' + '____mm____' + 'T' + r('g', 9) + 'T',
  r('T', 15) + 'DD' + r('T', 15),
];

const W = 32;
const H = GRID.length;
GRID.forEach((row, i) => {
  if (row.length !== W) throw new Error(`row ${i} has ${row.length} chars`);
});

// char -> [floor tile, wall tile]
const LEGEND = {
  '.': ['floor'], ',': ['floor-server'], w: ['wood'], _: ['tile-light'], g: ['carpet-green'], m: ['mat'],
  T: ['floor', 'wall-top'], F: ['floor', 'wall-face'], N: ['floor', 'window'], B: ['floor', 'wall-face-board'],
  D: ['tile-light', 'front-door'], S: ['floor-server', 'server-door'],
};
const gid = (key) => (key ? TILE_ID[key] + 1 : 0);
const floor = [];
const walls = [];
for (const row of GRID) {
  for (const ch of row) {
    const [f, w] = LEGEND[ch];
    floor.push(gid(f));
    walls.push(gid(w));
  }
}

// Objects: x = center, y = bottom edge (feet), in pixels.
let nextId = 1;
const prop = (name, x, y, props = {}) => ({ name, type: 'prop', x, y, props });
const OBJECTS = [
  { name: 'spawn', type: 'spawn', x: 256, y: 332 },
  // Manager office
  prop('mgr-desk', 80, 80, { tex: 'desk' }),
  prop('bookshelf', 120, 52, { tex: 'bookshelf' }),
  prop('plant-mgr', 28, 52, { tex: 'plant' }),
  { name: 'priya', type: 'npc', x: 124, y: 104, props: { sprite: 'manager', face: 'down' } },
  // Open office
  prop('desk-a', 192, 72, { tex: 'desk' }),
  prop('desk-b', 256, 72, { tex: 'desk' }),
  prop('desk-c', 320, 72, { tex: 'desk' }),
  prop('desk-d', 192, 136, { tex: 'desk' }),
  prop('my-desk', 256, 136, { tex: 'desk-mine' }),
  prop('dana-desk', 320, 136, { tex: 'desk' }),
  prop('printer', 40, 184, { tex: 'printer' }),
  prop('plant-office', 356, 52, { tex: 'plant' }),
  prop('plant-office-2', 28, 220, { tex: 'plant' }),
  prop('corkboard', 232, 40, {}),
  { name: 'dana', type: 'npc', x: 348, y: 154, props: { sprite: 'coworker', face: 'left' } },
  // Server room
  { name: 'server-door', type: 'door', x: 376, y: 160 },
  prop('rack-1', 400, 72, { tex: 'rack' }),
  prop('rack-2', 416, 72, { tex: 'rack' }),
  prop('rack-3', 432, 72, { tex: 'rack' }),
  prop('rack-4', 448, 72, { tex: 'rack' }),
  prop('rack-5', 464, 72, { tex: 'rack' }),
  prop('rack-6', 400, 128, { tex: 'rack' }),
  prop('rack-7', 416, 128, { tex: 'rack' }),
  prop('rack-8', 432, 128, { tex: 'rack' }),
  prop('soc', 456, 176, { tex: 'desk-soc' }),
  // Break room
  prop('coffee', 40, 278, { tex: 'coffee' }),
  prop('fridge', 72, 280, { tex: 'fridge' }),
  prop('cooler', 140, 282, { tex: 'cooler' }),
  prop('break-table', 88, 322, { tex: 'table' }),
  // Lobby
  prop('reception', 224, 294, { tex: 'reception' }),
  prop('plant-lobby-1', 188, 278, { tex: 'plant' }),
  prop('plant-lobby-2', 324, 278, { tex: 'plant' }),
  { name: 'front-door', type: 'door', x: 256, y: 352 },
  // Meeting room
  prop('whiteboard', 424, 270, { tex: 'whiteboard' }),
  prop('meeting-table', 424, 318, { tex: 'table-long' }),
];

const toProps = (o) =>
  Object.entries(o).map(([name, value]) => ({ name, type: typeof value === 'boolean' ? 'bool' : 'string', value }));

const map = {
  compressionlevel: -1,
  width: W,
  height: H,
  infinite: false,
  orientation: 'orthogonal',
  renderorder: 'right-down',
  tiledversion: '1.11.0',
  version: '1.10',
  type: 'map',
  tilewidth: 16,
  tileheight: 16,
  nextlayerid: 4,
  nextobjectid: OBJECTS.length + 1,
  layers: [
    { id: 1, name: 'floor', type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: floor },
    { id: 2, name: 'walls', type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data: walls },
    {
      id: 3,
      name: 'objects',
      type: 'objectgroup',
      draworder: 'topdown',
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      objects: OBJECTS.map((o) => ({
        id: nextId++,
        name: o.name,
        type: o.type,
        x: o.x,
        y: o.y,
        width: 0,
        height: 0,
        rotation: 0,
        point: true,
        visible: true,
        ...(o.props && Object.keys(o.props).length ? { properties: toProps(o.props) } : {}),
      })),
    },
  ],
  tilesets: [
    {
      firstgid: 1,
      name: 'office',
      image: 'tiles.png',
      imagewidth: TILESET_COLUMNS * 16,
      imageheight: Math.ceil(TILES.length / TILESET_COLUMNS) * 16,
      columns: TILESET_COLUMNS,
      tilecount: TILES.length,
      tilewidth: 16,
      tileheight: 16,
      margin: 0,
      spacing: 0,
      tiles: TILES.map((t, id) => ({
        id,
        properties: [
          { name: 'name', type: 'string', value: t.key },
          { name: 'collides', type: 'bool', value: !!t.solid },
        ],
      })),
    },
  ],
};

fs.writeFileSync(OUT, JSON.stringify(map, null, 1));
console.log(`wrote ${OUT} (${W}x${H}, ${OBJECTS.length} objects)`);
