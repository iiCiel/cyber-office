# Turns the Codex-generated raw art (art-src/raw/) into game assets in public/art/.
# Tiles -> one 64px tileset in the same index order as src/art/tileArt.js (TILES).
# Props -> magenta keyed out, cropped, fitted to 4x the world size (bottom-centred).
# Chars -> 3x3 sheet sliced into 9 frames of 48x64 (4x the 12x16 world frame).
# Usage: python art-src/process.py
import os
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(ROOT, 'raw')
OUT = os.path.join(ROOT, '..', 'public', 'art')
os.makedirs(OUT, exist_ok=True)
D = 4  # art density: 4 texture pixels per world pixel

TILES = ['floor', 'floor-server', 'wall-top', 'wall-face', 'window', 'front-door', 'tile-light', 'wood',
         'server-door', 'mat', 'carpet-green', 'wall-face-board']
COLS, T = 8, 16 * D
SEAMLESS = {'floor', 'wall-top', 'carpet-green'}

PROPS = {  # world size (w, h) of the procedural texture each one replaces
    'desk': (32, 24), 'desk-mine': (32, 24), 'desk-soc': (32, 24), 'chair': (12, 12), 'rack': (16, 32),
    'plant': (14, 20), 'cooler': (12, 26), 'printer': (22, 18), 'bookshelf': (28, 30), 'coffee': (20, 22),
    'fridge': (16, 30), 'table': (40, 18), 'table-long': (64, 22), 'reception': (48, 24), 'whiteboard': (48, 22),
}
CHARS = ['player', 'coworker', 'manager', 'mike', 'theo', 'carla']


def key_magenta(im):
    """Magenta (#FF00FF-ish) background -> transparent. Already-transparent pixels stay transparent."""
    im = im.convert('RGBA')
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            m = min(r, b) - g
            if a == 0 or (m > 90 and abs(r - b) < 70):
                px[x, y] = (0, 0, 0, 0)
            elif m > 40 and abs(r - b) < 70:  # pink fringe: pull the magenta out and fade it
                k = (m - 40) / 50
                px[x, y] = (int(g + (r - g) * (1 - k)), g, int(g + (b - g) * (1 - k)), int(a * (1 - k)))
    return im


def shrink(im, size):
    """Premultiplied box downscale, so transparent edges do not bleed dark/pink."""
    return im.convert('RGBa').resize(size, Image.BOX).convert('RGBA')


def fit(im, w, h, pad_bottom=0):
    """Scale the cropped art into a w x h canvas, keeping aspect, centred horizontally, standing on the bottom."""
    bb = im.getbbox()
    im = im.crop(bb)
    s = min(w / im.width, (h - pad_bottom) / im.height)
    nw, nh = max(1, round(im.width * s)), max(1, round(im.height * s))
    small = shrink(im, (nw, nh))
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.alpha_composite(small, ((w - nw) // 2, h - pad_bottom - nh))
    return out


def tiles():
    rows = (len(TILES) + COLS - 1) // COLS
    sheet = Image.new('RGBA', (COLS * T, rows * T))
    for i, name in enumerate(TILES):
        im = Image.open(os.path.join(RAW, 'tiles', name + '.png')).convert('RGB')
        if name in SEAMLESS:  # plain surfaces: drop the drawn edge so the grid does not show
            m = im.width // 8
            im = im.crop((m, m, im.width - m, im.height - m))
        sheet.paste(im.resize((T, T), Image.BOX), ((i % COLS) * T, (i // COLS) * T))
    sheet.save(os.path.join(OUT, 'tiles-hd.png'))
    print('tiles-hd.png', sheet.size)


def props():
    for name, (w, h) in PROPS.items():
        src = os.path.join(RAW, 'props', name + '.png')
        im = key_magenta(Image.open(src))
        out = fit(im, w * D, h * D)
        out.save(os.path.join(OUT, f'prop-{name}.png'))
        print(f'prop-{name}.png', out.size)


def chars():
    FW, FH = 12 * D, 16 * D
    order = [('down', ['idle', 'walk1', 'walk2']), ('up', ['idle', 'walk1', 'walk2']), ('side', ['idle', 'walk1', 'walk2'])]
    for name in CHARS:
        src = os.path.join(RAW, 'chars', name + '.png')
        if not os.path.exists(src):
            print('missing', src)
            continue
        im = key_magenta(Image.open(src))
        cw, ch = im.width / 3, im.height / 3
        cells = []  # (cell image, bbox in cell coords)
        for r in range(3):
            for c in range(3):
                cell = im.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
                cells.append((cell, cell.getbbox()))
        # One scale for the whole sheet so every frame is the same size: tallest figure -> FH - 1.
        tall = max(b[3] - b[1] for _, b in cells)
        wide = max(b[2] - b[0] for _, b in cells)
        s = min((FH - 1) / tall, (FW - 2) / wide)
        sheet = Image.new('RGBA', (FW * 9, FH))
        for i, (cell, b) in enumerate(cells):
            row = cells[(i // 3) * 3:(i // 3) * 3 + 3]
            feet = max(bb[3] for _, bb in row)  # shared feet line per row, so walking does not bob
            # Centre on the head (top 30% of the figure), not the legs, so steps do not slide sideways.
            head = cell.crop((b[0], b[1], b[2], b[1] + int((b[3] - b[1]) * 0.3))).getbbox()
            cx = b[0] + (head[0] + head[2]) / 2
            fig = cell.crop(b)
            nw, nh = max(1, round(fig.width * s)), max(1, round(fig.height * s))
            small = shrink(fig, (nw, nh))
            x = i * FW + round(FW / 2 - (cx - b[0]) * s)
            y = FH - round((feet - b[1]) * s)
            frame = Image.new('RGBA', (FW, FH))
            frame.alpha_composite(small, (x - i * FW, y)) if 0 <= x - i * FW and x - i * FW + nw <= FW else frame.alpha_composite(small, ((FW - nw) // 2, y))
            sheet.alpha_composite(frame, (i * FW, 0))
        sheet.save(os.path.join(OUT, f'char-{name}.png'))
        print(f'char-{name}.png', sheet.size, 'frames:', [f'{d}-{s}' for d, ss in order for s in ss])


if __name__ == '__main__':
    import sys
    what = sys.argv[1:] or ['tiles', 'props', 'chars']
    for w in what:
        globals()[w]()
