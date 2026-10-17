// Grid pathfinding for click-to-walk. Pure logic (no Phaser) so it can be unit tested in Node.
//
// The grid is finer than the tiles (8px cells by default) so the player can squeeze between desks.
// A cell is walkable if the player's feet box, centered on the cell, overlaps no solid rectangle.

export class NavGrid {
  /**
   * @param {number} width  world width in px
   * @param {number} height world height in px
   * @param {number} cell   cell size in px
   * @param {{halfW:number, h:number}} body player feet box: x-halfW..x+halfW, y-h..y
   */
  constructor(width, height, cell = 8, body = { halfW: 4, h: 5 }) {
    this.cell = cell;
    this.cols = Math.ceil(width / cell);
    this.rows = Math.ceil(height / cell);
    this.body = body;
    this.rects = [];
    this.blocked = new Uint8Array(this.cols * this.rows);
  }

  /** Replace the solid rectangles ({x, y, w, h}, top-left based) and recompute walkability. */
  setSolids(rects) {
    this.rects = rects;
    const { cols, rows } = this;
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const { x, y } = this.center(cx, cy);
        this.blocked[cy * cols + cx] = this.pointBlocked(x, y) ? 1 : 0;
      }
    }
  }

  /** Would the player's feet box at (x, y) overlap anything solid? */
  pointBlocked(x, y) {
    const { halfW, h } = this.body;
    const l = x - halfW, r = x + halfW, t = y - h, b = y;
    for (const s of this.rects) {
      if (l < s.x + s.w && r > s.x && t < s.y + s.h && b > s.y) return true;
    }
    return false;
  }

  center(cx, cy) {
    // Feet sit at the cell's lower-middle so the box is centered vertically in the cell.
    return { x: cx * this.cell + this.cell / 2, y: cy * this.cell + (this.cell + this.body.h) / 2 };
  }

  toCell(x, y) {
    return {
      cx: Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cell))),
      cy: Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.body.h / 2) / this.cell))),
    };
  }

  isWalkable(cx, cy) {
    return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows && !this.blocked[cy * this.cols + cx];
  }

  /** Nearest walkable cell to a world point (breadth-first ring search). */
  nearestWalkable(x, y, maxRadius = 12) {
    const { cx, cy } = this.toCell(x, y);
    if (this.isWalkable(cx, cy)) return { cx, cy };
    let best = null;
    let bestD = Infinity;
    for (let r = 1; r <= maxRadius; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!this.isWalkable(cx + dx, cy + dy)) continue;
          const c = this.center(cx + dx, cy + dy);
          const d = Math.hypot(c.x - x, c.y - y);
          if (d < bestD) { bestD = d; best = { cx: cx + dx, cy: cy + dy }; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Straight walk from a to b stays clear of solids? (sampled every 2px) */
  lineClear(ax, ay, bx, by) {
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (this.pointBlocked(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
    }
    return true;
  }

  /**
   * A* from world point to world point. Returns a list of world waypoints (excluding the start),
   * smoothed so the player walks in straight lines where possible. Returns null if unreachable.
   */
  findPath(sx, sy, tx, ty) {
    const start = this.nearestWalkable(sx, sy);
    const goal = this.nearestWalkable(tx, ty);
    if (!start || !goal) return null;

    const { cols } = this;
    const idx = (cx, cy) => cy * cols + cx;
    const startI = idx(start.cx, start.cy);
    const goalI = idx(goal.cx, goal.cy);
    const g = new Map([[startI, 0]]);
    const came = new Map();
    const open = new MinHeap();
    const h = (cx, cy) => {
      const dx = Math.abs(cx - goal.cx), dy = Math.abs(cy - goal.cy);
      return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
    };
    open.push(startI, h(start.cx, start.cy));
    const closed = new Set();

    while (open.size) {
      const cur = open.pop();
      if (cur === goalI) break;
      if (closed.has(cur)) continue;
      closed.add(cur);
      const cx = cur % cols, cy = (cur - cx) / cols;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (!this.isWalkable(nx, ny)) continue;
          // No cutting corners past solid cells.
          if (dx && dy && (!this.isWalkable(cx + dx, cy) || !this.isWalkable(cx, cy + dy))) continue;
          const ni = idx(nx, ny);
          const ng = g.get(cur) + (dx && dy ? Math.SQRT2 : 1);
          if (ng < (g.get(ni) ?? Infinity)) {
            g.set(ni, ng);
            came.set(ni, cur);
            open.push(ni, ng + h(nx, ny));
          }
        }
      }
    }
    if (!g.has(goalI)) return null;

    const cells = [];
    for (let i = goalI; i !== undefined; i = came.get(i)) cells.push(i);
    cells.reverse();
    const pts = cells.map((i) => this.center(i % cols, Math.floor(i / cols)));

    // If the exact target spot is walkable, end exactly there instead of at the cell center.
    if (!this.pointBlocked(tx, ty)) pts[pts.length - 1] = { x: tx, y: ty };

    // String-pulling: from each anchor, skip ahead to the farthest point still in a clear line.
    const out = [];
    let ax = sx, ay = sy, i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.lineClear(ax, ay, pts[j].x, pts[j].y)) j--;
      out.push(pts[j]);
      ax = pts[j].x; ay = pts[j].y;
      i = j + 1;
    }
    return out;
  }
}

class MinHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(v, p) {
    const a = this.a;
    a.push([p, v]);
    let i = a.length - 1;
    while (i > 0) {
      const pi = (i - 1) >> 1;
      if (a[pi][0] <= a[i][0]) break;
      [a[pi], a[i]] = [a[i], a[pi]];
      i = pi;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top[1];
  }
}
