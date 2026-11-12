import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autotileWallTops, wallMask, BASE_TILES } from '../src/art/autotile.js';

const F = 1; // firstgid
const W = F + 2; // wall-top
const img = { width: 512, height: 256 }; // 8 x 4 slots of 64px

test('wall tops become trimmed variants by neighbour mask', () => {
  const raw = [
    [F, F, F, F],
    [F, W, W, F],
    [F, W, W, F],
    [F, F + 3, F + 3, F],
  ];
  const out = autotileWallTops(raw, F, img);
  // top-left wall tile: neighbours E and S are walls -> mask 2|4 = 6
  assert.equal(out[1][1], F + BASE_TILES + 6);
  assert.equal(out[1][2], F + BASE_TILES + (4 | 8));
  assert.equal(out[2][1], F + BASE_TILES + (1 | 2));
  assert.equal(out[2][2], F + BASE_TILES + (1 | 8));
  assert.equal(out[0][0], F); // non-walls unchanged
  assert.equal(out[3][1], F + 3);
});

test('off-map neighbours count as wall; old tilesets are left alone', () => {
  assert.equal(wallMask([[W]], 0, 0, W), 15);
  const raw = [[W, W], [F, F]];
  assert.deepEqual(autotileWallTops(raw, F, { width: 512, height: 128 }), raw);
});
