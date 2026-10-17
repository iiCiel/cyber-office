// World is drawn at 16px tiles and zoomed up; UI is drawn at full resolution so text stays crisp.
export const TILE = 16;
export const ZOOM = 3;
export const COLS = 20;
export const ROWS = 15;
export const VIEW_W = COLS * TILE * ZOOM; // 960
export const VIEW_H = ROWS * TILE * ZOOM; // 720

export const FONT = '"Courier New", Courier, monospace';
