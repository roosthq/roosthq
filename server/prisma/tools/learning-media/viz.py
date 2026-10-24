#!/usr/bin/env python
"""Deterministic visual question generator (MATH + LOGIC).

Every image is drawn from the parameters that define its answer, so the answer
is correct by construction (a clock showing 4:15 is drawn FROM 4:15). Writes
web/public/learning/img/viz/<hash>.webp and question rows into
server/prisma/seed-data/edu-sync/new/<SUBJECT>-<GRADE>-viz.json
"""
import hashlib
import json
import math
import os
import random

from PIL import Image, ImageDraw, ImageFont

REPO = r'C:\Users\sheac\Github Personal\Family Calendar System'
IMG_DIR = os.path.join(REPO, 'web', 'public', 'learning', 'img', 'viz')
OUT_DIR = os.path.join(REPO, 'server', 'prisma', 'seed-data', 'edu-sync', 'new')
os.makedirs(IMG_DIR, exist_ok=True)
os.makedirs(OUT_DIR, exist_ok=True)

K = 3  # supersample
W, H = 640, 480
RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE, PINK, BROWN, GRAY = '#e5484d', '#f59e0b', '#f2d03b', '#3fae6a', '#3d8bf2', '#8e5be0', '#ec6bb0', '#8b6b4a', '#9aa3b2'
COLORS = [RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE]
COLOR_NAMES = {RED: 'red', ORANGE: 'orange', YELLOW: 'yellow', GREEN: 'green', BLUE: 'blue', PURPLE: 'purple', PINK: 'pink', BROWN: 'brown'}
INK = '#23202b'
BG = '#ffffff'
FONT_PATH = r'C:\Windows\Fonts\arialbd.ttf'


def font(size):
    return ImageFont.truetype(FONT_PATH, int(size * K))


class Cv:
    def __init__(self, bg=BG):
        self.im = Image.new('RGB', (W * K, H * K), bg)
        self.d = ImageDraw.Draw(self.im)

    def pt(self, p):
        return (p[0] * K, p[1] * K)

    def line(self, a, b, fill=INK, width=3):
        self.d.line([self.pt(a), self.pt(b)], fill=fill, width=int(width * K))

    def rect(self, x0, y0, x1, y1, fill=None, outline=INK, width=3, r=0):
        box = [x0 * K, y0 * K, x1 * K, y1 * K]
        if r:
            self.d.rounded_rectangle(box, radius=r * K, fill=fill, outline=outline, width=int(width * K))
        else:
            self.d.rectangle(box, fill=fill, outline=outline, width=int(width * K))

    def ellipse(self, cx, cy, rx, ry=None, fill=None, outline=INK, width=3):
        ry = rx if ry is None else ry
        self.d.ellipse([(cx - rx) * K, (cy - ry) * K, (cx + rx) * K, (cy + ry) * K], fill=fill, outline=outline, width=int(width * K))

    def poly(self, pts, fill=None, outline=INK, width=3):
        P = [self.pt(p) for p in pts]
        if fill:
            self.d.polygon(P, fill=fill)
        if outline:
            self.d.line(P + [P[0]], fill=outline, width=int(width * K), joint='curve')

    def text(self, xy, s, size=28, fill=INK, anchor='mm'):
        self.d.text(self.pt(xy), s, font=font(size), fill=fill, anchor=anchor)

    def arc(self, cx, cy, r, a0, a1, fill=INK, width=3):
        self.d.arc([(cx - r) * K, (cy - r) * K, (cx + r) * K, (cy + r) * K], a0, a1, fill=fill, width=int(width * K))

    def pie(self, cx, cy, r, a0, a1, fill, outline=INK, width=3):
        self.d.pieslice([(cx - r) * K, (cy - r) * K, (cx + r) * K, (cy + r) * K], a0, a1, fill=fill, outline=outline, width=int(width * K))

    def finish(self, size=(W, H)):
        return self.im.resize(size, Image.LANCZOS)


def save(img, key):
    h = hashlib.sha1(key.encode()).hexdigest()[:12]
    path = os.path.join(IMG_DIR, h + '.webp')
    if not os.path.exists(path):
        img.save(path, 'WEBP', lossless=True, method=6)
    return f'learning/img/viz/{h}.webp'


# ----------------------------------------------------------------- drawers

def clock(h, m, size=(W, H)):
    c = Cv()
    cx, cy, R = W / 2, H / 2, 205
    c.ellipse(cx, cy, R + 12, fill='#4b5563', outline='#4b5563')
    c.ellipse(cx, cy, R, fill='#fffdf6', outline=INK, width=4)
    for i in range(60):
        a = math.radians(i * 6)
        long = i % 5 == 0
        r0 = R - (22 if long else 11)
        c.line((cx + r0 * math.sin(a), cy - r0 * math.cos(a)), (cx + (R - 4) * math.sin(a), cy - (R - 4) * math.cos(a)), INK, 4 if long else 2)
    for n in range(1, 13):
        a = math.radians(n * 30)
        c.text((cx + (R - 48) * math.sin(a), cy - (R - 48) * math.cos(a)), str(n), 38)
    ah = math.radians((h % 12) * 30 + m * 0.5)
    am = math.radians(m * 6)
    c.line((cx, cy), (cx + 100 * math.sin(ah), cy - 100 * math.cos(ah)), RED, 12)
    c.line((cx, cy), (cx + 160 * math.sin(am), cy - 160 * math.cos(am)), BLUE, 7)
    c.ellipse(cx, cy, 11, fill=INK)
    return c.finish(size)


def draw_icon(c, kind, x, y, s, color):
    if kind == 'star':
        pts = []
        for i in range(10):
            a = math.radians(-90 + i * 36)
            r = s if i % 2 == 0 else s * 0.42
            pts.append((x + r * math.cos(a), y + r * math.sin(a)))
        c.poly(pts, fill=color)
    elif kind == 'ball':
        c.ellipse(x, y, s * 0.85, fill=color)
        c.ellipse(x - s * 0.28, y - s * 0.3, s * 0.2, fill='#ffffff', outline=None)
    elif kind == 'heart':
        pts = []
        for i in range(0, 360, 6):
            t = math.radians(i)
            hx = 16 * math.sin(t) ** 3
            hy = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
            pts.append((x + hx * s * 0.055, y - hy * s * 0.055))
        c.poly(pts, fill=color)
    elif kind == 'tri':
        c.poly([(x, y - s), (x + s * 0.95, y + s * 0.8), (x - s * 0.95, y + s * 0.8)], fill=color)
    elif kind == 'square':
        c.rect(x - s * 0.8, y - s * 0.8, x + s * 0.8, y + s * 0.8, fill=color, r=4)


ICON_NAMES = {'star': 'star', 'ball': 'ball', 'heart': 'heart', 'tri': 'triangle', 'square': 'square'}
ICON_PLURAL = {'star': 'stars', 'ball': 'balls', 'heart': 'hearts', 'tri': 'triangles', 'square': 'squares'}


def scatter(rng, n, x0, y0, x1, y1, minDist=62):
    pts = []
    tries = 0
    while len(pts) < n and tries < 20000:
        tries += 1
        p = (rng.uniform(x0, x1), rng.uniform(y0, y1))
        if all(math.hypot(p[0] - q[0], p[1] - q[1]) >= minDist for q in pts):
            pts.append(p)
    return pts if len(pts) == n else None


def group_img(kind, n, color, seed, size=(W, H)):
    rng = random.Random(seed)
    pts = scatter(rng, n, 60, 60, W - 60, H - 60, 70 if n <= 12 else 58)
    if not pts:
        return None
    c = Cv()
    for x, y in pts:
        draw_icon(c, kind, x, y, 26, color)
    return c.finish(size)


def ten_frame(n, color=BLUE, size=(W, H)):
    c = Cv()
    x0, y0, cw = 70, 150, 100
    for r in range(2):
        for i in range(5):
            c.rect(x0 + i * cw, y0 + r * cw, x0 + (i + 1) * cw, y0 + (r + 1) * cw, fill='#f8fafc', outline=INK, width=4)
    for k in range(n):
        r, i = divmod(k, 5)
        c.ellipse(x0 + i * cw + cw / 2, y0 + r * cw + cw / 2, 34, fill=color)
    return c.finish(size)


def shape_img(name, color, size=(W, H), rot=0):
    c = Cv()
    cx, cy = W / 2, H / 2
    def reg(n, r, a0=-90):
        return [(cx + r * math.cos(math.radians(a0 + i * 360 / n)), cy + r * math.sin(math.radians(a0 + i * 360 / n))) for i in range(n)]
    if name == 'circle':
        c.ellipse(cx, cy, 150, fill=color, width=5)
    elif name == 'oval':
        c.ellipse(cx, cy, 210, 120, fill=color, width=5)
    elif name == 'square':
        c.rect(cx - 140, cy - 140, cx + 140, cy + 140, fill=color, width=5)
    elif name == 'rectangle':
        c.rect(cx - 200, cy - 110, cx + 200, cy + 110, fill=color, width=5)
    elif name == 'triangle':
        c.poly([(cx, cy - 160), (cx + 185, cy + 130), (cx - 185, cy + 130)], fill=color, width=5)
    elif name == 'pentagon':
        c.poly(reg(5, 170), fill=color, width=5)
    elif name == 'hexagon':
        c.poly(reg(6, 170, 0), fill=color, width=5)
    elif name == 'octagon':
        c.poly(reg(8, 170, -67.5), fill=color, width=5)
    elif name == 'rhombus':
        c.poly([(cx, cy - 165), (cx + 120, cy), (cx, cy + 165), (cx - 120, cy)], fill=color, width=5)
    elif name == 'trapezoid':
        c.poly([(cx - 90, cy - 110), (cx + 90, cy - 110), (cx + 190, cy + 110), (cx - 190, cy + 110)], fill=color, width=5)
    elif name == 'parallelogram':
        c.poly([(cx - 110, cy - 105), (cx + 200, cy - 105), (cx + 110, cy + 105), (cx - 200, cy + 105)], fill=color, width=5)
    elif name == 'star':
        pts = []
        for i in range(10):
            r = 175 if i % 2 == 0 else 72
            a = math.radians(-90 + i * 36)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        c.poly(pts, fill=color, width=5)
    return c.finish(size)


SHAPE_FACTS = {
    'circle': (0, 0), 'oval': (0, 0), 'square': (4, 4), 'rectangle': (4, 4), 'triangle': (3, 3), 'pentagon': (5, 5),
    'hexagon': (6, 6), 'octagon': (8, 8), 'rhombus': (4, 4), 'trapezoid': (4, 4), 'parallelogram': (4, 4),
}


def pie(n, k, color=BLUE, size=(W, H)):
    c = Cv()
    cx, cy, R = W / 2, H / 2, 185
    for i in range(n):
        a0 = -90 + i * 360 / n
        a1 = -90 + (i + 1) * 360 / n
        c.pie(cx, cy, R, a0, a1, color if i < k else '#f1f5f9')
    return c.finish(size)


def bar_frac(n, k, color=GREEN, size=(W, H)):
    c = Cv()
    x0, y0, w, h = 50, 170, 540, 140
    for i in range(n):
        c.rect(x0 + i * w / n, y0, x0 + (i + 1) * w / n, y0 + h, fill=color if i < k else '#f1f5f9', width=4)
    return c.finish(size)


def bar_graph(cats, vals, ymax, step, color_by_cat=True, size=(W, H)):
    c = Cv()
    gx0, gy0, gx1, gy1 = 90, 50, 600, 390
    c.line((gx0, gy0), (gx0, gy1), INK, 4)
    c.line((gx0, gy1), (gx1, gy1), INK, 4)
    t = 0
    while t <= ymax:
        y = gy1 - (gy1 - gy0) * t / ymax
        c.line((gx0 - 6, y), (gx1, y), '#cbd5e1' if t else INK, 1.5 if t else 4)
        c.text((gx0 - 22, y), str(t), 22)
        t += step
    bw = (gx1 - gx0) / len(cats)
    for i, (cat, v) in enumerate(zip(cats, vals)):
        x = gx0 + i * bw + bw * 0.18
        y = gy1 - (gy1 - gy0) * v / ymax
        c.rect(x, y, x + bw * 0.64, gy1, fill=COLORS[i % len(COLORS)], width=3)
        c.text((x + bw * 0.32, gy1 + 28), cat, 24)
    return c.finish(size)


def number_line(lo, hi, step, point, label_every=1, fmt=str, size=(W, H)):
    c = Cv()
    x0, x1, y = 60, 580, 250
    c.line((x0 - 20, y), (x1 + 20, y), INK, 5)
    n = int(round((hi - lo) / step))
    for i in range(n + 1):
        x = x0 + (x1 - x0) * i / n
        c.line((x, y - 16), (x, y + 16), INK, 4)
        if i % label_every == 0:
            c.text((x, y + 44), fmt(lo + i * step), 26)
    px = x0 + (x1 - x0) * (point - lo) / (hi - lo)
    c.ellipse(px, y, 17, fill=RED, width=3)
    c.line((px, y - 90), (px, y - 24), RED, 5)
    c.poly([(px - 14, y - 44), (px + 14, y - 44), (px, y - 20)], fill=RED, outline=None)
    return c.finish(size)


def grid_area(w, h, extra=None, size=(W, H)):
    """Rectangle (w x h unit squares), optional extra block for an L-shape: (ew, eh) attached bottom-left below."""
    c = Cv()
    u = min(480 // max(w, 1), 340 // max(h + (extra[1] if extra else 0), 1), 90)
    ox = (W - w * u) / 2
    oy = 40
    cells = [(i, j) for i in range(w) for j in range(h)]
    if extra:
        cells += [(i, h + j) for i in range(extra[0]) for j in range(extra[1])]
    for (i, j) in cells:
        c.rect(ox + i * u, oy + j * u, ox + (i + 1) * u, oy + (j + 1) * u, fill='#bfe3c6', outline=INK, width=2)
    return c.finish(size), len(cells)


def rect_perim(w, h, size=(W, H)):
    c = Cv()
    pw, ph = 380, 200 * h / max(w, h) if w >= h else 200
    ph = 200
    pw = 200 * w / h if h else 200
    pw = max(150, min(420, 260 * w / max(w, h)))
    ph = max(110, min(280, 260 * h / max(w, h)))
    x0, y0 = (W - pw) / 2, (H - ph) / 2
    c.rect(x0, y0, x0 + pw, y0 + ph, fill='#dbeafe', width=5)
    c.text((x0 + pw / 2, y0 - 26), f'{w} cm', 30)
    c.text((x0 + pw / 2, y0 + ph + 28), f'{w} cm', 30)
    c.text((x0 - 52, y0 + ph / 2), f'{h} cm', 30)
    c.text((x0 + pw + 52, y0 + ph / 2), f'{h} cm', 30)
    return c.finish(size)


def angle_img(deg, size=(W, H)):
    c = Cv()
    ox, oy, L = 170, 360, 330
    a = math.radians(deg)
    c.line((ox, oy), (ox + L, oy), INK, 7)
    c.line((ox, oy), (ox + L * math.cos(a), oy - L * math.sin(a)), INK, 7)
    c.arc(ox, oy, 70, -deg, 0, RED, 6)
    if deg == 90:
        c.rect(ox, oy - 40, ox + 40, oy, fill=None, outline=RED, width=5)
    c.ellipse(ox, oy, 8, fill=INK)
    return c.finish(size)


def coord_plane(px, py, size=(W, H)):
    c = Cv()
    gx0, gy0, s = 90, 420, 38
    for i in range(0, 11):
        c.line((gx0 + i * s, gy0), (gx0 + i * s, gy0 - 10 * s), '#d7dee8', 1.5)
        c.line((gx0, gy0 - i * s), (gx0 + 10 * s, gy0 - i * s), '#d7dee8', 1.5)
        c.text((gx0 + i * s, gy0 + 22), str(i), 20)
        c.text((gx0 - 22, gy0 - i * s), str(i), 20)
    c.line((gx0, gy0), (gx0 + 10 * s + 14, gy0), INK, 4)
    c.line((gx0, gy0), (gx0, gy0 - 10 * s - 14), INK, 4)
    c.ellipse(gx0 + px * s, gy0 - py * s, 11, fill=RED, width=3)
    return c.finish(size)


def sym_shape(kind, size=(W, H)):
    """kind: 'sym' (butterfly-ish symmetric) or 'asym' L-shape with a dashed line."""
    c = Cv()
    cx = W / 2
    if kind == 'sym':
        c.poly([(cx, 90), (cx + 150, 170), (cx + 110, 330), (cx, 390), (cx - 110, 330), (cx - 150, 170)], fill='#fde68a', width=5)
    else:
        c.poly([(cx - 150, 110), (cx + 10, 110), (cx + 10, 290), (cx + 170, 290), (cx + 170, 390), (cx - 150, 390)], fill='#fde68a', width=5)
    for y in range(70, 420, 24):
        c.line((cx, y), (cx, y + 12), RED, 4)
    return c.finish(size)


# ---------- logic drawers

def shape_token(c, kind, x, y, s, color):
    if kind == 'circle':
        c.ellipse(x, y, s, fill=color, width=4)
    elif kind == 'square':
        c.rect(x - s, y - s, x + s, y + s, fill=color, width=4)
    elif kind == 'tri':
        c.poly([(x, y - s * 1.1), (x + s * 1.1, y + s * 0.9), (x - s * 1.1, y + s * 0.9)], fill=color, width=4)
    elif kind == 'star':
        pts = []
        for i in range(10):
            r = s * 1.25 if i % 2 == 0 else s * 0.52
            a = math.radians(-90 + i * 36)
            pts.append((x + r * math.cos(a), y + r * math.sin(a)))
        c.poly(pts, fill=color, width=4)
    elif kind == 'diamond':
        c.poly([(x, y - s * 1.2), (x + s * 0.9, y), (x, y + s * 1.2), (x - s * 0.9, y)], fill=color, width=4)
    elif kind == 'heart':
        draw_icon(c, 'heart', x, y + s * 0.05, s * 1.5, color)


def token_img(kind, color, size=(W, H), scale=1.0):
    c = Cv()
    shape_token(c, kind, W / 2, H / 2, 120 * scale, color)
    return c.finish(size)


def seq_img(tokens, size=(W, H)):
    """tokens: list of (kind,color,scale) or None for the '?' box."""
    c = Cv()
    n = len(tokens)
    gap = (W - 60) / n
    for i, t in enumerate(tokens):
        x = 30 + gap * (i + 0.5)
        if t is None:
            c.rect(x - 38, H / 2 - 44, x + 38, H / 2 + 44, fill='#f1f5f9', outline=GRAY, width=4, r=10)
            c.text((x, H / 2), '?', 54, GRAY)
        else:
            shape_token(c, t[0], x, H / 2, min(46, gap * 0.34) * t[2], t[1])
    return c.finish(size)


def odd_one_img(items, size=(W, H)):
    """items: list of (kind,color,scale) laid out in a 2x2 or 2x3 grid with letters."""
    c = Cv()
    n = len(items)
    cols = 2 if n == 4 else 3
    rows = 2
    cw, ch = (W - 60) / cols, (H - 40) / rows
    for i, t in enumerate(items):
        r, q = divmod(i, cols)
        x0, y0 = 30 + q * cw, 20 + r * ch
        c.rect(x0 + 8, y0 + 8, x0 + cw - 8, y0 + ch - 8, fill='#fbfbfd', outline='#cbd5e1', width=2, r=14)
        shape_token(c, t[0], x0 + cw / 2, y0 + ch / 2 + 6, 46 * t[2], t[1])
        c.text((x0 + 30, y0 + 28), 'ABCDEF'[i], 30, '#64748b')
    return c.finish(size)


def matrix_img(cells, size=(W, H)):
    """3x3, cells list of 9 (kind,color,scale) or None for the missing one."""
    c = Cv()
    s = 128
    ox, oy = (W - 3 * s) / 2, (H - 3 * s) / 2
    for i, t in enumerate(cells):
        r, q = divmod(i, 3)
        x0, y0 = ox + q * s, oy + r * s
        c.rect(x0 + 4, y0 + 4, x0 + s - 4, y0 + s - 4, fill='#fbfbfd', outline='#cbd5e1', width=2, r=10)
        if t is None:
            c.text((x0 + s / 2, y0 + s / 2), '?', 50, GRAY)
        else:
            shape_token(c, t[0], x0 + s / 2, y0 + s / 2, 36 * t[2], t[1])
    return c.finish(size)


# ----------------------------------------------------------------- questions

ROWS = {}  # (subject, grade) -> list


def add(subject, grade, row):
    ROWS.setdefault((subject, grade), []).append(row)


def mc(prompt, answer, wrongs, image, alt, tags):
    ch = [answer] + [w for w in wrongs if w != answer]
    seen = []
    for x in ch:
        if x not in seen:
            seen.append(x)
    if len(seen) < 3:
        return None
    return {'type': 'MULTIPLE_CHOICE', 'prompt': prompt, 'choicesJson': seen[:4], 'answer': answer, 'tags': tags + ['visual'], 'media': {'image': image, 'alt': alt}}


def ic(prompt, correct_img, other_imgs, alts, tags, rng):
    opts = [(correct_img, True)] + [(o, False) for o in other_imgs]
    rng.shuffle(opts)
    letters = 'ABCD'[: len(opts)]
    ans = letters[[o[1] for o in opts].index(True)]
    return {
        'type': 'IMAGE_CHOICE', 'prompt': prompt, 'choicesJson': list(letters), 'answer': ans, 'tags': tags + ['visual'],
        'media': {'choiceImages': [o[0] for o in opts], 'choiceAlts': [f'Picture {l}' for l in letters], 'alt': alts},
    }


def fmt_time(h, m):
    return f'{h}:{m:02d}'


def build():
    rng = random.Random(2610)
    # ---- clocks
    def clock_set(grade, minutes_choices, n, label):
        seen = set()
        tries = 0
        while len([1 for _ in seen]) < n and tries < 5000:
            tries += 1
            h = rng.randint(1, 12)
            m = rng.choice(minutes_choices)
            if (h, m) in seen:
                continue
            seen.add((h, m))
            ans = fmt_time(h, m)
            wrong = set()
            while len(wrong) < 3:
                h2 = h if rng.random() < 0.4 else rng.randint(1, 12)
                m2 = m if h2 != h else rng.choice(minutes_choices)
                if rng.random() < 0.3:
                    h2, m2 = (m // 5) or 12, (h * 5) % 60  # classic hands-swapped mistake
                    if m2 not in minutes_choices:
                        continue
                if fmt_time(h2, m2) != ans:
                    wrong.add(fmt_time(h2, m2))
            img = save(clock(h, m), f'clock{h}:{m}')
            r = mc('What time does the clock show?', ans, sorted(wrong), img, f'An analog clock showing {ans}', ['time', label])
            if r:
                add('MATH', grade, r)
            if rng.random() < 0.5 and n > 6:
                pass
    clock_set(1, [0, 30], 24, 'hour-half')
    clock_set(2, [0, 15, 30, 45], 30, 'quarter')
    clock_set(2, [5, 10, 20, 25, 35, 40, 50, 55], 26, 'five-minute')
    clock_set(3, [m for m in range(1, 60) if m % 5 != 0][:40], 24, 'minute')
    # which clock shows X (image choice)
    for grade, mins in ((1, [0, 30]), (2, [0, 15, 30, 45]), (3, [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55])):
        for _ in range(14):
            h = rng.randint(1, 12)
            m = rng.choice(mins)
            others = set()
            while len(others) < 3:
                h2, m2 = rng.randint(1, 12), rng.choice(mins)
                if (h2, m2) != (h, m):
                    others.add((h2, m2))
            correct = save(clock(h, m, (480, 360)), f'clockS{h}:{m}')
            oth = [save(clock(a, b, (480, 360)), f'clockS{a}:{b}') for a, b in sorted(others)]
            add('MATH', grade, ic(f'Which clock shows {fmt_time(h, m)}?', correct, oth, 'Four clocks', ['time', 'clock-pick'], rng))

    # ---- counting
    names = {'star': 'stars', 'ball': 'balls', 'heart': 'hearts', 'tri': 'triangles', 'square': 'squares'}
    for n in range(1, 11):
        for kind in rng.sample(list(names), 3):
            color = rng.choice(COLORS)
            img = group_img(kind, n, color, f'{kind}{n}{color}')
            if not img:
                continue
            f = save(img, f'cnt{kind}{n}{color}')
            wrong = sorted({max(1, n + d) for d in (-2, -1, 1, 2) if max(1, n + d) != n})[:3]
            r = mc(f'How many {names[kind]} are there?', str(n), [str(w) for w in wrong], f, f'{n} {names[kind]}', ['counting'])
            if r:
                add('MATH', 0, r)
    for n in range(11, 21):
        for kind in rng.sample(list(names), 2):
            color = rng.choice(COLORS)
            img = group_img(kind, n, color, f'{kind}{n}{color}')
            if not img:
                continue
            f = save(img, f'cnt{kind}{n}{color}')
            add('MATH', 1, {'type': 'TEXT_INPUT', 'prompt': f'Count the {names[kind]}. How many are there?', 'answer': str(n), 'tags': ['counting', 'visual'], 'media': {'image': f, 'alt': f'{n} {names[kind]}'}})
    # which group has more (image choice of 2 groups)
    for _ in range(18):
        kind = rng.choice(list(names))
        a, b = rng.sample(range(1, 11), 2)
        if abs(a - b) < 2:
            continue
        col = rng.choice(COLORS)
        ia = group_img(kind, a, col, f'm{kind}{a}{col}', (480, 360))
        ib = group_img(kind, b, col, f'm{kind}{b}{col}', (480, 360))
        if not ia or not ib:
            continue
        big, small = (a, ia, 'A'), (b, ib, 'B')
        fa, fb = save(ia, f'mS{kind}{a}{col}'), save(ib, f'mS{kind}{b}{col}')
        more = rng.random() < 0.5
        ans = fa if (a > b) == more else fb
        other = fb if ans == fa else fa
        add('MATH', 0, ic(f'Which picture has {"more" if more else "fewer"} {names[kind]}?', ans, [other], 'Two groups', ['counting', 'compare'], rng))
    # ten frames
    for n in range(1, 10):
        f = save(ten_frame(n), f'tf{n}')
        add('MATH', 1, mc('How many more dots make 10?', str(10 - n), [str(10 - n + d) for d in (-2, -1, 1, 2) if 0 <= 10 - n + d <= 10 and d != 0][:3], f, f'A ten frame with {n} dots', ['make-ten']))
        add('MATH', 0, mc('How many dots are in the ten frame?', str(n), [str(n + d) for d in (-2, -1, 1, 2) if 0 < n + d <= 10 and d != 0][:3], f, f'A ten frame with {n} dots', ['counting']))

    # ---- shapes
    colors = [RED, BLUE, GREEN, ORANGE, PURPLE, PINK]
    for name in SHAPE_FACTS:
        sides, corners = SHAPE_FACTS[name]
        for col in rng.sample(colors, 3):
            f = save(shape_img(name, col), f'shape{name}{col}')
            grade = 0 if name in ('circle', 'square', 'triangle', 'rectangle') else 1 if name in ('oval', 'rhombus', 'pentagon', 'hexagon') else 2
            pool = [s for s in SHAPE_FACTS if s != name]
            wrong = rng.sample([p.capitalize() for p in pool if not (name in ('square', 'rectangle') and p in ('square', 'rectangle'))], 3)
            add('MATH', grade, mc('What shape is this?', name.capitalize(), wrong, f, f'A {COLOR_NAMES[col]} {name}', ['shapes']))
            if sides:
                add('MATH', min(2, grade + 1), {'type': 'TEXT_INPUT', 'prompt': f'How many sides does this shape have?', 'answer': str(sides), 'tags': ['shapes', 'visual'], 'media': {'image': f, 'alt': f'A {name}'}})
    # which picture shows a ...
    for name in ('circle', 'square', 'triangle', 'rectangle', 'hexagon', 'pentagon', 'octagon'):
        for _ in range(2):
            col = rng.choice(colors)
            correct = save(shape_img(name, col, (480, 360)), f'shapeS{name}{col}')
            others = rng.sample([s for s in SHAPE_FACTS if s != name and not (name in ('square', 'rectangle') and s in ('square', 'rectangle'))], 3)
            oc = [save(shape_img(o, rng.choice(colors), (480, 360)), f'shapeS{o}{col}x') for o in others]
            add('MATH', 0 if name in ('circle', 'square', 'triangle', 'rectangle') else 1, ic(f"Which picture shows {'an' if name[0] in 'aeiou' else 'a'} {name}?", correct, oc, 'Four shapes', ['shapes'], rng))

    # ---- fractions
    def fr(n, k):
        return f'{k}/{n}'
    for n in (2, 3, 4, 6, 8):
        for k in range(1, n):
            gr = 1 if n in (2, 4) else 2 if n in (3,) else 3 if n in (6, 8) else 3
            f1 = save(pie(n, k), f'pie{n}{k}')
            others = {fr(n, j) for j in range(1, n) if j != k}
            wrong = sorted(others)[:3] if len(others) >= 3 else sorted(others | {fr(n + 1, k), fr(n - 1 if n > 2 else n + 2, 1)})[:3]
            r = mc('What fraction of the circle is shaded?', fr(n, k), wrong, f1, f'A circle cut into {n} equal parts with {k} shaded', ['fractions'])
            if r:
                add('MATH', gr, r)
            f2 = save(bar_frac(n, k), f'barf{n}{k}')
            r = mc('What fraction of the bar is shaded?', fr(n, k), wrong, f2, f'A bar cut into {n} equal parts with {k} shaded', ['fractions'])
            if r:
                add('MATH', gr if gr > 1 else 2, r)
    for n, k in ((2, 1), (4, 1), (4, 2), (4, 3), (3, 1), (3, 2), (8, 3), (6, 5), (8, 5), (6, 1)):
        correct = save(pie(n, k, size=(480, 360)), f'pieS{n}{k}')
        others = []
        for (n2, k2) in ((n, k + 1 if k + 1 < n else k - 1), (n + 1, k), (n, max(1, k - 1) if k > 1 else k + 1), (n + 2, k + 1)):
            if (n2, k2) != (n, k) and 0 < k2 < n2:
                others.append(save(pie(n2, k2, size=(480, 360)), f'pieS{n2}{k2}'))
        others = list(dict.fromkeys(others))[:3]
        if len(others) == 3:
            add('MATH', 2 if n <= 4 else 3, ic(f'Which picture shows {fr(n, k)} shaded?', correct, others, 'Four circles', ['fractions'], rng))
    # equivalent fractions (grade 4): pairs
    for a, b in ((1, 2), (2, 4), (3, 6), (4, 8), (1, 3), (2, 6), (1, 4), (2, 8), (3, 4), (6, 8)):
        pass
    for (n1, k1, n2, k2) in ((2, 1, 4, 2), (2, 1, 6, 3), (2, 1, 8, 4), (4, 1, 8, 2), (3, 1, 6, 2), (4, 3, 8, 6), (3, 2, 6, 4)):
        f = save(pie(n1, k1), f'pie{n1}{k1}')
        r = mc(f'Which fraction is equal to {fr(n1, k1)}?', fr(n2, k2), [fr(n2, k2 + 1), fr(n2 + 1, k2), fr(n1 + 1, k1)], f, f'A circle with {fr(n1, k1)} shaded', ['fractions', 'equivalent'])
        if r:
            add('MATH', 4, r)

    # ---- bar graphs
    topics = [
        (['Dogs', 'Cats', 'Fish', 'Birds'], 'pets'), (['Red', 'Blue', 'Green', 'Pink'], 'colors'), (['Pizza', 'Tacos', 'Pasta', 'Soup'], 'foods'),
        (['Soccer', 'Swim', 'Chess', 'Art'], 'clubs'), (['Mon', 'Tue', 'Wed', 'Thu'], 'days'), (['Apple', 'Grape', 'Plum', 'Kiwi'], 'fruit'),
    ]
    for ti, (cats, label) in enumerate(topics):
        for rep in range(5):
            vals = rng.sample(range(2, 11), 4)
            ymax = 10
            f = save(bar_graph(cats, vals, ymax, 1 if rep % 2 == 0 else 2), f'bar{label}{vals}{rep % 2}')
            i = vals.index(max(vals))
            j = vals.index(min(vals))
            add('MATH', 2, mc('Which bar is the tallest?', cats[i], [c for c in cats if c != cats[i]], f, f'A bar graph of {label}', ['graphs']))
            add('MATH', 2, mc('Which bar is the shortest?', cats[j], [c for c in cats if c != cats[j]], f, f'A bar graph of {label}', ['graphs']))
            k = rng.randrange(4)
            add('MATH', 3, {'type': 'TEXT_INPUT', 'prompt': f'How many chose {cats[k]}?', 'answer': str(vals[k]), 'tags': ['graphs', 'visual'], 'media': {'image': f, 'alt': f'A bar graph of {label}'}})
            a, b = rng.sample(range(4), 2)
            if vals[a] > vals[b]:
                add('MATH', 4, {'type': 'TEXT_INPUT', 'prompt': f'How many more chose {cats[a]} than {cats[b]}?', 'answer': str(vals[a] - vals[b]), 'tags': ['graphs', 'visual'], 'media': {'image': f, 'alt': f'A bar graph of {label}'}})
            total = sum(vals)
            add('MATH', 4, {'type': 'TEXT_INPUT', 'prompt': 'How many chose in all? Add up every bar.', 'answer': str(total), 'tags': ['graphs', 'visual'], 'media': {'image': f, 'alt': f'A bar graph of {label}'}})

    # ---- number lines
    for p in range(1, 10):
        f = save(number_line(0, 10, 1, p), f'nl0-10-{p}')
        r = mc('What number is the red dot on?', str(p), [str(p + d) for d in (-2, -1, 1, 2) if 0 <= p + d <= 10 and d][:3], f, 'A number line from 0 to 10', ['number-line'])
        if r:
            add('MATH', 1, r)
    for p in range(2, 20, 2):
        f = save(number_line(0, 20, 2, p, 1), f'nl0-20-{p}')
        r = mc('The dots on the number line count by 2s. What number is the red dot on?', str(p), [str(p + d) for d in (-4, -2, 2, 4) if 0 <= p + d <= 20][:3], f, 'A number line counting by 2s', ['number-line', 'skip-count'])
        if r:
            add('MATH', 2, r)
    for p in range(10, 100, 10):
        f = save(number_line(0, 100, 10, p), f'nl0-100-{p}')
        r = mc('What number is the red dot on?', str(p), [str(p + d) for d in (-20, -10, 10, 20) if 0 <= p + d <= 100][:3], f, 'A number line from 0 to 100', ['number-line'])
        if r:
            add('MATH', 2, r)
    for n in (2, 3, 4, 5, 6, 8):
        for k in range(1, n):
            f = save(number_line(0, 1, 1 / n, k / n, 1, lambda v, n=n: ('0' if abs(v) < 1e-9 else '1' if abs(v - 1) < 1e-9 else ''), (W, H)), f'nlfrac{n}{k}')
            if n in (2, 3, 4, 6, 8):
                wrong = [fr(n, j) for j in range(1, n) if j != k]
                r = mc('What fraction is the red dot on?', fr(n, k), wrong[:3] if len(wrong) >= 3 else wrong + [fr(n + 1, k), fr(n, n)], f, f'A number line from 0 to 1 cut into {n} equal parts', ['number-line', 'fractions'])
                if r:
                    add('MATH', 3 if n <= 4 else 4, r)
    for p in range(-8, 9, 2):
        if p == 0:
            continue
        f = save(number_line(-10, 10, 2, p, 1), f'nlneg{p}')
        r = mc('What number is the red dot on?', str(p), [str(p + d) for d in (-4, -2, 2, 4) if -10 <= p + d <= 10 and p + d != p][:3], f, 'A number line from -10 to 10', ['number-line', 'negative-numbers'])
        if r:
            add('MATH', 6, r)
    for p in (0.5, 1.5, 2.5, 3.5, 0.2, 0.7, 0.9, 0.3):
        hi = 1 if p < 1 else 4
        step = 0.1 if p < 1 else 0.5
        f = save(number_line(0, hi, step, p, 5 if p < 1 else 2, lambda v: ('%g' % round(v, 2))), f'nldec{p}')
        wrong = [str(round(p + d, 2)) for d in (-0.2, -0.1, 0.1, 0.2) if 0 <= p + d <= hi and d][:3] if p < 1 else [str(p + d) for d in (-1, -0.5, 0.5, 1) if 0 <= p + d <= 4 and d][:3]
        r = mc('What number is the red dot on?', str(p), wrong, f, 'A number line with decimals', ['number-line', 'decimals'])
        if r:
            add('MATH', 4 if p < 1 else 5, r)

    # ---- area & perimeter
    for w in range(2, 8):
        for h in range(2, 6):
            if w * h > 30 or rng.random() < 0.45:
                continue
            img, cells = grid_area(w, h)
            f = save(img, f'area{w}x{h}')
            add('MATH', 3, {'type': 'TEXT_INPUT', 'prompt': 'Each little square is 1 square unit. What is the area of the shaded rectangle?', 'answer': str(cells), 'tags': ['area', 'visual'], 'media': {'image': f, 'alt': f'A grid rectangle {w} by {h}'}})
    for (w, h, ew, eh) in ((4, 2, 2, 2), (5, 2, 2, 1), (3, 3, 2, 2), (6, 2, 3, 2), (4, 3, 1, 2), (5, 3, 3, 1), (4, 2, 3, 1)):
        img, cells = grid_area(w, h, (ew, eh))
        f = save(img, f'areaL{w}{h}{ew}{eh}')
        add('MATH', 4, {'type': 'TEXT_INPUT', 'prompt': 'Each little square is 1 square unit. What is the area of this L-shape?', 'answer': str(cells), 'tags': ['area', 'visual'], 'media': {'image': f, 'alt': 'An L-shaped grid figure'}})
    for w in range(2, 10):
        for h in range(2, 8):
            if w == h or rng.random() < 0.6:
                continue
            f = save(rect_perim(w, h), f'perim{w}x{h}')
            add('MATH', 3 if w + h < 14 else 4, {'type': 'TEXT_INPUT', 'prompt': 'What is the perimeter of this rectangle in centimeters? (Just type the number.)', 'answer': str(2 * (w + h)), 'tags': ['perimeter', 'visual'], 'media': {'image': f, 'alt': f'A rectangle {w} cm by {h} cm'}})
            add('MATH', 4, {'type': 'TEXT_INPUT', 'prompt': 'What is the area of this rectangle in square centimeters? (Just type the number.)', 'answer': str(w * h), 'tags': ['area', 'visual'], 'media': {'image': f, 'alt': f'A rectangle {w} cm by {h} cm'}})

    # ---- angles
    for deg in (20, 35, 45, 60, 75, 90, 100, 120, 135, 150, 165, 180):
        f = save(angle_img(deg), f'ang{deg}')
        label = 'Right' if deg == 90 else 'Straight' if deg == 180 else 'Acute' if deg < 90 else 'Obtuse'
        r = mc('What kind of angle is this?', label, [x for x in ('Acute', 'Right', 'Obtuse', 'Straight') if x != label], f, f'An angle drawn by two rays', ['angles'])
        if r:
            add('MATH', 4, r)
    # symmetry
    for kind in ('sym', 'asym'):
        f = save(sym_shape(kind), f'symm{kind}')
        add('MATH', 4, mc('Is the dashed red line a line of symmetry for this shape?', 'Yes' if kind == 'sym' else 'No', ['No' if kind == 'sym' else 'Yes', 'Only sometimes'], f, 'A shape with a dashed line', ['symmetry']))

    # ---- coordinate plane
    for _ in range(40):
        px, py = rng.randint(1, 9), rng.randint(1, 9)
        if px == py:
            continue
        f = save(coord_plane(px, py), f'coord{px}{py}')
        wrong = [f'({py}, {px})', f'({px + 1}, {py})', f'({px}, {min(10, py + 1)})']
        wrong = [w for w in dict.fromkeys(wrong) if w != f'({px}, {py})']
        r = mc('What are the coordinates of the red point? (across first, then up)', f'({px}, {py})', wrong, f, f'A coordinate grid with a point at ({px}, {py})', ['coordinates'])
        if r:
            add('MATH', 5 if px + py < 12 else 6, r)

    # ---- LOGIC: sequences, odd one out, matrices
    kinds = ['circle', 'square', 'tri', 'star', 'diamond', 'heart']
    cols = [RED, BLUE, GREEN, ORANGE, PURPLE, YELLOW]
    def tok(k, c_, s=1.0):
        return (k, c_, s)
    for _ in range(80):
        pat = rng.choice(['AB', 'AB', 'ABB', 'AAB', 'ABC', 'color-AB', 'size-grow'])
        ks = rng.sample(kinds, 3)
        cs = rng.sample(cols, 3)
        if pat == 'size-grow':
            seq = [tok(ks[0], cs[0], 0.6 + 0.18 * i) for i in range(5)]
            ans_t = tok(ks[0], cs[0], 0.6 + 0.18 * 5)
            visible = seq[:5]
            grade = 1
            ans_idx = 5
            n_vis = 5
            tokens_full = seq + [ans_t]
        else:
            if pat == 'AB':
                unit = [tok(ks[0], cs[0]), tok(ks[1], cs[1])]
            elif pat == 'ABB':
                unit = [tok(ks[0], cs[0]), tok(ks[1], cs[1]), tok(ks[1], cs[1])]
            elif pat == 'AAB':
                unit = [tok(ks[0], cs[0]), tok(ks[0], cs[0]), tok(ks[1], cs[1])]
            elif pat == 'ABC':
                unit = [tok(ks[0], cs[0]), tok(ks[1], cs[1]), tok(ks[2], cs[2])]
            else:  # color-AB: same shape, alternating colors
                unit = [tok(ks[0], cs[0]), tok(ks[0], cs[1])]
            total = 6 if len(unit) < 3 else 7
            tokens_full = [unit[i % len(unit)] for i in range(total + 1)]
            grade = {'AB': 0, 'color-AB': 0, 'AAB': 1, 'ABB': 1, 'ABC': 2}[pat]
            n_vis = total
        ans_t = tokens_full[n_vis]
        visible = tokens_full[:n_vis]
        stem = save(seq_img(visible + [None]), f'seq{[str(t) for t in visible]}')
        correct = save(token_img(ans_t[0], ans_t[1], (480, 360), ans_t[2]), f'tok{ans_t}')
        wrongs = []
        for k_, c_, s_ in ((ks[0], cs[1], 1), (ks[1], cs[0], 1), (ks[2], cs[2], 1), (ks[0], cs[2], 1), (ks[1], cs[2], 1)):
            if (k_, c_, s_) != ans_t:
                wrongs.append((k_, c_, s_))
        wrongs = list(dict.fromkeys(wrongs))[:3]
        if len(wrongs) < 3:
            continue
        imgs = [save(token_img(w[0], w[1], (480, 360), w[2]), f'tok{w}') for w in wrongs]
        q = ic('What comes next in the pattern?', correct, imgs, 'Four choices', ['patterns'], rng)
        q['media']['image'] = stem
        q['media']['alt'] = 'A row of shapes in a pattern with a missing last one'
        add('LOGIC', grade, q)
    for _ in range(50):
        n = rng.choice([4, 4, 6])
        mode = rng.choice(['color', 'shape', 'size'])
        base_k = rng.choice(kinds)
        base_c = rng.choice(cols)
        items = [tok(base_k, base_c) for _ in range(n)]
        odd = rng.randrange(n)
        if mode == 'color':
            items[odd] = tok(base_k, rng.choice([c_ for c_ in cols if c_ != base_c]))
        elif mode == 'shape':
            items[odd] = tok(rng.choice([k_ for k_ in kinds if k_ != base_k]), base_c)
        else:
            items[odd] = tok(base_k, base_c, 1.55)
        f = save(odd_one_img(items), f'odd{items}')
        letters = 'ABCDEF'[:n]
        r = {'type': 'MULTIPLE_CHOICE', 'prompt': 'Which one is different from the others?', 'choicesJson': list(letters[:4] if n == 4 else letters), 'answer': letters[odd], 'tags': ['odd-one-out', 'visual'], 'media': {'image': f, 'alt': 'Shapes in boxes labeled with letters'}}
        if n == 6:
            r['choicesJson'] = list(letters)
        add('LOGIC', {'color': 0, 'shape': 1, 'size': 2}[mode] + (1 if n == 6 else 0), r)
    for _ in range(40):
        ks = rng.sample(kinds, 3)
        cs = rng.sample(cols, 3)
        kind_mode = rng.random() < 0.5
        cells = []
        for r_ in range(3):
            for q_ in range(3):
                if kind_mode:
                    cells.append(tok(ks[(r_ + q_) % 3], cs[0]))
                else:
                    cells.append(tok(ks[0], cs[(r_ + q_) % 3]))
        ans_t = cells[8]
        shown = cells[:8] + [None]
        stem = save(matrix_img(shown), f'mat{[str(c_) for c_ in cells]}')
        correct = save(token_img(ans_t[0], ans_t[1], (480, 360)), f'tok{ans_t}')
        pool = [(k_, c_, 1.0) for k_ in ks for c_ in cs]
        wr = [w for w in pool if w != ans_t]
        rng.shuffle(wr)
        wrongs = wr[:3]
        imgs = [save(token_img(w[0], w[1], (480, 360)), f'tok{w}') for w in wrongs]
        q = ic('Which shape goes in the empty box?', correct, imgs, 'Four choices', ['patterns', 'matrix'], rng)
        q['media']['image'] = stem
        q['media']['alt'] = 'A three by three grid of shapes with the last box empty'
        add('LOGIC', 3 + (0 if kind_mode else 1), q)


def main():
    build()
    total = 0
    # imports validator via node for a final check is done by merge/validate step
    for (subject, grade), rows in sorted(ROWS.items()):
        # drop exact duplicate (prompt, answer, image)
        seen = set()
        uniq = []
        for r in rows:
            k = (r['prompt'], r['answer'], json.dumps(r.get('media'), sort_keys=True))
            if k in seen:
                continue
            seen.add(k)
            uniq.append(r)
        path = os.path.join(OUT_DIR, f'{subject}-{grade}-viz.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(uniq, f, ensure_ascii=False, indent=1)
        total += len(uniq)
        print(f'{subject} grade {grade}: {len(uniq)}')
    print('total visual questions:', total, '| images:', len(os.listdir(IMG_DIR)))


if __name__ == '__main__':
    main()
