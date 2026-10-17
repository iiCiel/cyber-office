import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NavGrid } from '../src/world/pathfinding.js';

const box = (x, y, w, h) => ({ x, y, w, h });

test('straight line in an empty room is one waypoint', () => {
  const g = new NavGrid(160, 160);
  g.setSolids([]);
  const p = g.findPath(20, 20, 120, 120);
  assert.equal(p.length, 1);
  assert.deepEqual(p[0], { x: 120, y: 120 });
});

test('routes around a wall and never steps into a solid', () => {
  const g = new NavGrid(160, 160);
  const wall = box(70, 0, 20, 130); // gap at the bottom
  g.setSolids([wall]);
  const p = g.findPath(30, 40, 130, 40);
  assert.ok(p && p.length > 1, 'needs a detour');
  let [ax, ay] = [30, 40];
  for (const pt of p) {
    assert.ok(g.lineClear(ax, ay, pt.x, pt.y), `segment to ${pt.x},${pt.y} clips the wall`);
    [ax, ay] = [pt.x, pt.y];
  }
  assert.ok(p.some((pt) => pt.y > 130), 'goes under the wall');
});

test('fully blocked target returns null', () => {
  const g = new NavGrid(160, 160);
  g.setSolids([box(70, 0, 20, 160)]);
  assert.equal(g.findPath(30, 40, 130, 40), null);
});

test('clicking on a solid snaps to the nearest walkable spot', () => {
  const g = new NavGrid(160, 160);
  g.setSolids([box(60, 60, 40, 20)]);
  const p = g.findPath(20, 20, 80, 70);
  assert.ok(p);
  const end = p[p.length - 1];
  assert.equal(g.pointBlocked(end.x, end.y), false);
  assert.ok(Math.hypot(end.x - 80, end.y - 70) < 20);
});

test('fits through a 16px doorway', () => {
  const g = new NavGrid(160, 160);
  g.setSolids([box(70, 0, 16, 64), box(70, 80, 16, 80)]); // 16px gap at y 64..80
  const p = g.findPath(30, 74, 130, 74);
  assert.ok(p, 'should fit through the gap');
});
