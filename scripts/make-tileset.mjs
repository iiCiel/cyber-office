// Paints src/art/tileArt.js into public/maps/tiles.png (the tileset Tiled and the game both use).
// Run after changing tile art: npm run tiles
import fs from 'node:fs';
import zlib from 'node:zlib';
import { TILES, TILESET_COLUMNS } from '../src/art/tileArt.js';

const T = 16;
const cols = TILESET_COLUMNS;
const rows = Math.ceil(TILES.length / cols);
const W = cols * T;
const H = rows * T;
const px = Buffer.alloc(W * H * 4); // RGBA, transparent by default

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
TILES.forEach((tile, i) => {
  const ox = (i % cols) * T;
  const oy = Math.floor(i / cols) * T;
  for (const [x, y, w, h, c] of tile.rects) {
    const [r, g, b] = hex(c);
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const o = ((oy + yy) * W + ox + xx) * 4;
        px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
      }
    }
  }
});

// Minimal PNG encoder (8-bit RGBA, no filter).
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

fs.mkdirSync('public/maps', { recursive: true });
fs.writeFileSync('public/maps/tiles.png', png);
console.log(`wrote public/maps/tiles.png (${W}x${H}, ${TILES.length} tiles)`);
