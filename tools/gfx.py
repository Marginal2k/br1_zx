#!/usr/bin/env python3
"""Графика Чёрного Ворона: двоичные ресурсы <-> PNG (порты 6144.CPP, WBAR_BUT.CPP, WHERO.CPP, WLAND.CPP, WINTRO.CPP).

Все исходные картинки автора - чёрно-белые TIF 256x192 (чёрный = 1 = "чернила"); каждый конвертер забирал из такого
листа прямоугольники и складывал их в .dat. Здесь листы воссоздаются по готовым .dat (порт обратным ходом: те же
циклы, но с записью в лист), а импорт повторяет исходные циклы автора. Раскладка листов - как у автора.
Формат подробно - docs/FORMATS.md.
"""
import os

from PIL import Image

import zxio

SW = 32                                    # байт в строке листа (256 точек)

# ----------------------------------------------------------------------------- биты <-> пиксели
INK, PAPER = (0, 0, 0), (255, 255, 255)


def _unpack(buf, wb, h):
    """байты (по строкам, wb байт в строке) -> список пикселей 0/1 (1 = чернила)."""
    px = []
    for b in buf[:wb * h]:
        px.extend(((b >> 7) & 1, (b >> 6) & 1, (b >> 5) & 1, (b >> 4) & 1, (b >> 3) & 1, (b >> 2) & 1, (b >> 1) & 1, b & 1))
    return px


def _pack(px, wb, h):
    out = bytearray(wb * h)
    for i in range(wb * h):
        v = 0
        for b in px[i * 8:i * 8 + 8]:
            v = (v << 1) | b
        out[i] = v
    return bytes(out)


def save_mono(path, buf, wb, h):
    """1-битный PNG: чёрный = чернила."""
    px = _unpack(buf, wb, h)
    im = Image.new('P', (wb * 8, h))
    im.putpalette([255, 255, 255, 0, 0, 0] + [0, 0, 0] * 254)      # 0 - бумага, 1 - чернила
    im.putdata(px)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)


def load_mono(path, wb, h):
    """любой PNG -> байты (по строкам). Тёмное (яркость < 128) - чернила. Размер картинки должен совпасть."""
    im = Image.open(path)
    if im.size != (wb * 8, h):
        raise ValueError(f'{path}: размер {im.size}, нужен {(wb * 8, h)}')
    if im.mode == 'P':
        pal = im.getpalette()
        ink = [1 if (pal[3 * i] + pal[3 * i + 1] + pal[3 * i + 2]) / 3 < 128 else 0 for i in range(256)]
        px = [ink[v] for v in im.getdata()]
    else:
        g = im.convert('RGBA')
        px = [1 if (p[0] + p[1] + p[2]) / 3 < 128 and p[3] >= 128 else 0 for p in g.getdata()]
    return _pack(px, wb, h)


# 4 состояния пикселя спрайта, индекс = 2*маска + рисунок (маска 1 - силуэт спрайта, рисунок 1 - чернила):
# 0 - вне силуэта, прозрачно (белый); 1 - чернила вне силуэта (красный; быть не должно); 2 - силуэт, бумага (светло-голубой);
# 3 - силуэт, чернила (чёрный)
PAL4 = [(255, 255, 255), (255, 0, 0), (170, 220, 255), (0, 0, 0)]


def save_mask(path, hero, mask, wb, h):
    hp, mp = _unpack(hero, wb, h), _unpack(mask, wb, h)
    im = Image.new('P', (wb * 8, h))
    pal = []
    for c in PAL4:
        pal += list(c)
    im.putpalette(pal + [0, 0, 0] * 252)
    im.putdata([m * 2 + x for x, m in zip(hp, mp)])   # индекс = 2*маска + рисунок
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)


def load_mask(path, wb, h):
    im = Image.open(path)
    if im.size != (wb * 8, h):
        raise ValueError(f'{path}: размер {im.size}, нужен {(wb * 8, h)}')
    rgb = im.convert('RGB')
    cache = {}
    hp, mp = [], []
    for p in rgb.getdata():
        s = cache.get(p)
        if s is None:
            s = min(range(4), key=lambda i: sum((p[k] - PAL4[i][k]) ** 2 for k in range(3)))
            cache[p] = s
        hp.append(s & 1)
        mp.append(s >> 1)
    return _pack(hp, wb, h), _pack(mp, wb, h)


# ----------------------------------------------------------------------------- адреса экрана Спектрума
def spec_addr(y):
    return ((y & 0xC0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2)


def spec_to_lin(scr):
    out = bytearray(6144)
    for y in range(192):
        a = spec_addr(y)
        out[y * 32:y * 32 + 32] = scr[a:a + 32]
    return bytes(out)


def lin_to_spec(lin):
    out = bytearray(6144)
    for y in range(192):
        a = spec_addr(y)
        out[a:a + 32] = lin[y * 32:y * 32 + 32]
    return bytes(out)


# ----------------------------------------------------------------------------- экраны
def scr_bw_export(data, path):
    assert len(data) == 6144, len(data)
    save_mono(path, spec_to_lin(data), 32, 192)


def scr_bw_import(path):
    return lin_to_spec(load_mono(path, 32, 192))


ZXRGB = [(0, 0, 0), (0, 0, 215), (215, 0, 0), (215, 0, 215), (0, 215, 0), (0, 215, 215), (215, 215, 0), (215, 215, 215)]
ZXRGBB = [(0, 0, 0), (0, 0, 255), (255, 0, 0), (255, 0, 255), (0, 255, 0), (0, 255, 255), (255, 255, 0), (255, 255, 255)]
ZXPAL = ZXRGB + ZXRGBB             # индекс = цвет + 8 * яркость


def cell_colors(attr):
    ink, paper, br = attr & 7, (attr >> 3) & 7, (attr >> 6) & 1
    return ZXPAL[ink + 8 * br], ZXPAL[paper + 8 * br]


def scr_color_export(data, path):
    """.scr (6144 бит + 768 атрибутов) -> цветной PNG (NAME.png) + исходный .scr рядом (NAME.orig.scr).

    Картинка показывает только цвета; невидимое (какой цвет "чернила", какой "бумага" в однотонной ячейке, мигание,
    скрытые биты) хранится в NAME.orig.scr: при импорте ячейки 8x8, не изменённые в PNG, берутся оттуда как есть."""
    assert len(data) == 6912, len(data)
    lin = spec_to_lin(data[:6144])
    attr = data[6144:]
    px = [0] * (256 * 192)
    for cy in range(24):
        for cx in range(32):
            a = attr[cy * 32 + cx]
            ink, paper, br = a & 7, (a >> 3) & 7, (a >> 6) & 1
            for r in range(8):
                b = lin[(cy * 8 + r) * 32 + cx]
                o = (cy * 8 + r) * 256 + cx * 8
                for k in range(8):
                    px[o + k] = (ink if (b >> (7 - k)) & 1 else paper) + 8 * br
    im = Image.new('P', (256, 192))
    pal = []
    for c in ZXPAL:
        pal += list(c)
    im.putpalette(pal + [0, 0, 0] * 240)
    im.putdata(px)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)
    zxio.wr(orig_path(path), data)


def orig_path(png):
    return png[:-4] + '.orig.scr'


_ZXLOOK = {}
for _i, _c in enumerate(ZXPAL):
    _ZXLOOK.setdefault(_c, _i)


def _zx_index(p):
    """RGB -> (цвет 0..7, яркость 0/1/None для чёрного)."""
    i = _ZXLOOK.get(tuple(p[:3]))
    if i is None:
        i = min(range(16), key=lambda k: sum((p[j] - ZXPAL[k][j]) ** 2 for j in range(3)))
    return i


def scr_color_import(path):
    """цветной PNG -> .scr. Ячейки 8x8, не менявшиеся относительно NAME.orig.scr (если он есть), берутся из него как есть;
    изменённые (или все, если файла нет) кодируются заново: не более двух цветов одной яркости на ячейку."""
    im = Image.open(path)
    if im.size != (256, 192):
        raise ValueError(f'{path}: размер {im.size}, нужен (256, 192)')
    src = None
    if os.path.exists(orig_path(path)):
        src = zxio.rd(orig_path(path))
        if len(src) != 6912:
            src = None
    rgb = list(im.convert('RGB').getdata())
    lin = bytearray(6144)
    attr = bytearray(768)
    slin = spec_to_lin(src[:6144]) if src else None
    for cy in range(24):
        for cx in range(32):
            cell = [rgb[(cy * 8 + r) * 256 + cx * 8 + k] for r in range(8) for k in range(8)]
            if src:
                a = src[6144 + cy * 32 + cx]
                ink, paper = cell_colors(a)
                same = True
                for r in range(8):
                    b = slin[(cy * 8 + r) * 32 + cx]
                    for k in range(8):
                        want = ink if (b >> (7 - k)) & 1 else paper
                        if want != cell[r * 8 + k]:
                            same = False
                            break
                    if not same:
                        break
                if same:
                    attr[cy * 32 + cx] = a
                    for r in range(8):
                        lin[(cy * 8 + r) * 32 + cx] = slin[(cy * 8 + r) * 32 + cx]
                    continue
            idx = [_zx_index(p) for p in cell]
            cols = {}
            for i in idx:
                key = i & 7 if i != 8 else 0
                cols[key] = cols.get(key, 0) + 1
            br = 1 if any(i >= 9 for i in idx) else 0
            used = sorted(cols, key=lambda c: -cols[c])[:2]
            if len(used) == 1:
                ink = paper = used[0]
            else:
                paper, ink = used[0], used[1]        # бумага - более частый цвет
            attr[cy * 32 + cx] = ink + paper * 8 + br * 64
            for r in range(8):
                v = 0
                for k in range(8):
                    c = idx[r * 8 + k]
                    c = c & 7 if c != 8 else 0
                    v = (v << 1) | (1 if (c == ink and ink != paper) or (c != paper and c == ink) else 0)
                lin[(cy * 8 + r) * 32 + cx] = v
    return lin_to_spec(bytes(lin)) + bytes(attr)


# ----------------------------------------------------------------------------- листы и "раскладки" по .dat
class Sheet:
    """Лист-картинка автора: hero (рисунок) и при необходимости mask (маска)."""

    def __init__(self, name, rows, mask=False):
        self.name, self.rows, self.has_mask = name, rows, mask
        self.hero = bytearray(SW * rows)
        self.mask = bytearray(SW * rows) if mask else None
        self.used = bytearray(SW * rows)          # байты, занятые какими-либо блоками (для проверки пересечений)

    def mark(self, x, y, wb, h):
        for k in range(h):
            for j in range(wb):
                o = (y + k) * SW + x + j
                if self.used[o]:
                    raise AssertionError(f'{self.name}: пересечение блоков в ({x + j},{y + k})')
                self.used[o] = 1


class Layout:
    """Один .dat: список слотов (блок 'лист, x, y, ширина в байтах, высота' или None) в порядке файла."""

    def __init__(self, dat, kind, size=None, fill=None, tail=b''):
        self.dat, self.kind = dat, kind          # kind: 'plain' | 'mask'
        self.slots = []
        self.size, self.fill, self.tail = size, fill, tail

    def add(self, sheet, x, y, wb, h):
        self.slots.append((sheet, x, y, wb, h))

    def slot_len(self, s):
        return s[3] * s[4] * (2 if self.kind == 'mask' else 1)


def _walk(lay):
    """-> [(смещение в .dat, слот)] по слотам (None - заполнитель фиксированной длины lay.fill_len)."""
    pos = 0
    out = []
    for s in lay.slots:
        if s is None:
            out.append((pos, None))
            pos += lay.fill_len
        else:
            out.append((pos, s))
            pos += lay.slot_len(s)
    return out, pos


def layout_to_sheets(lay, data, sheets, shadow=None):
    """.dat -> блоки в листах. shadow: слоты, перекрытые более поздним слотом того же места (не рисуются)."""
    walk, total = _walk(lay)
    n = lay.size if lay.size is not None else total
    if len(data) != n + len(lay.tail):
        raise ValueError(f'{lay.dat}: длина {len(data)}, ожидалось {n + len(lay.tail)}')
    for idx, (pos, s) in enumerate(walk):
        if s is None:
            if data[pos:pos + lay.fill_len] != bytes([lay.fill]) * lay.fill_len:
                raise ValueError(f'{lay.dat}: незадействованный слот {idx} не заполнен {lay.fill:#x}: потеря данных')
            continue
        if shadow and idx in shadow:
            continue
        sh, x, y, wb, h = s
        sheet = sheets[sh]
        sheet.mark(x, y, wb, h)
        p = pos
        for j in range(wb):
            for k in range(h):
                o = (y + k) * SW + x + j
                if lay.kind == 'plain':
                    sheet.hero[o] = data[p]
                    p += 1
                else:
                    m = data[p]
                    sheet.mask[o] = m
                    sheet.hero[o] = m ^ data[p + 1]
                    p += 2
    return data[n:n + len(lay.tail)]


def sheets_to_layout(lay, sheets, tail=b''):
    walk, total = _walk(lay)
    out = bytearray()
    for idx, (pos, s) in enumerate(walk):
        if s is None:
            out += bytes([lay.fill]) * lay.fill_len
            continue
        sh, x, y, wb, h = s
        sheet = sheets[sh]
        for j in range(wb):
            for k in range(h):
                o = (y + k) * SW + x + j
                if lay.kind == 'plain':
                    out.append(sheet.hero[o])
                else:
                    m = sheet.mask[o]
                    out.append(m)
                    out.append(m ^ sheet.hero[o])
    return bytes(out) + tail


# ----------------------------------------------------------------------------- ландшафт (WLAND.CPP)
L1S1 = [86, 88, 91, 87, 110, 112, 255, 92, 90, 89, 78, 107, 255, 103, 106, 101, 100, 104, 255, 105, 102, 93, 0]
L1S2 = [-1, 81, 84, 80, 109, 111, 255, 85, 83, 82, 255, 96, 99, 94, -1, 97, 255, 98, 95, -1, 79, 108, 0]
L1S3 = [[7, 30, 31, 32, 39, 40, 41, 61, 3, 6, 9, 10, 11, 26, 54, 27],
        [8, 33, 34, 35, 42, 43, 44, 62, 2, 4, 12, 13, 14, 52, 56, 53],
        [0, 36, 37, 38, 45, 46, 47, 63, 1, 5, 15, 16, 383, 28, 55, 29],
        [19, 20, 21, 64, 65, 66, 67, 71, 72, 73, 74, 57, 59, -1, -1, -1],
        [18, 17, 22, 68, 51, 69, 70, 75, -1, 76, 77, 58, 60, -1, -1, -1],
        [25, 24, 23] + [-1] * 13,
        [48, 49, 50] + [-1] * 13,
        [-1] * 16, [-1] * 16, [-1] * 16,
        [-1, -1, -1, 114, 116, 119, 121, 124, 126] + [-1] * 7,
        [113, 118, 123, 115, 117, 120, 122, 125, 127] + [-1] * 7]
L2S1 = [[0, 2, 6, 9, 12, 15, 18, 21, 24, 27, 29, 38, 40, -1, -1, -1],
        [383, 3, 61, 10, 13, 16, 19, 22, 25, 28, 30, 39, 41, -1, -1, -1],
        [1, 4, 63, 11, 14, 17, 20, 23, 26, 52, 53, -1, -1, -1, -1, -1],
        [80, 81, 82, 83, 85, 86] + [-1] * 10,
        [31, 32, 33, 34, 35, 87, 36, 79, 37] + [-1] * 7,
        [56, 113, 118, 123] + [-1] * 12,
        [57, 114, 119, 124] + [-1] * 12,
        [58, 115, 120, 125] + [-1] * 12,
        [59, 116, 121, 126] + [-1] * 12,
        [60, 117, 122, 127] + [-1] * 12,
        [89, 91, 93, 95, 97, 98, 99, 101, 103, 105, 107, 109, 111, -1, -1, -1],
        [90, 92, 94, 96, 88, 5, 100, 102, 104, 106, 108, 110, 112, -1, -1, -1]]

LAND_SLOTS = 384
LAND_FILL = 0x55


def _land_t1(slots, sheet, form):
    """conv_t1: здания 3x3 и 2x2 из листа 'city'/'build'."""
    x, y = 2, 16

    def qu(xx, yy, n):
        slots[n] = (sheet, xx, yy, 2, 16)

    for n in form:
        if n == 0:
            break
        if n == 255:
            x, y = 2, y + 48
            continue
        if n == -1:
            x += 6
            continue
        if n < 108:
            qu(x, y, n)
            n = 128 + (n - 78) * 8
            x -= 2
            qu(x, y, n); n += 1
            y -= 16
            qu(x, y, n); n += 1
            x += 2
            qu(x, y, n); n += 1
            x += 2
            qu(x, y, n); n += 1
            y += 16
            qu(x, y, n); n += 1
            y += 16
            qu(x, y, n); n += 1
            x -= 2
            qu(x, y, n); n += 1
            x -= 2
            qu(x, y, n)
            x += 8
            y -= 16
        else:
            qu(x, y, n)
            n = 368 + (n - 108) * 3
            x -= 2
            qu(x, y, n); n += 1
            y -= 16
            qu(x, y, n); n += 1
            x += 2
            qu(x, y, n)
            y += 16
            x += 4


def _land_t2(slots, sheet, grid):
    for i, row in enumerate(grid):
        for j, nn in enumerate(row):
            if nn != -1:
                slots[nn] = (sheet, j * 2, i * 16, 2, 16)


def land_layout(n):
    """w{n}spr.dat: n = 1, 2, 4 - тип 1 (листы wNcity, wNbuild, wNland); n = 3 - подземелье (лист w3land)."""
    lay = Layout(f'w{n}spr.dat', 'plain')
    lay.fill, lay.fill_len = LAND_FILL, 32
    slots = [None] * LAND_SLOTS
    if n == 3:
        _land_t2(slots, 'w3land', L2S1)
    else:
        _land_t1(slots, f'w{n}city', L1S1)
        _land_t1(slots, f'w{n}build', L1S2)
        _land_t2(slots, f'w{n}land', L1S3)
    lay.slots = slots
    return lay


def land_sheets(n):
    return ['w3land'] if n == 3 else [f'w{n}city', f'w{n}build', f'w{n}land']


# ----------------------------------------------------------------------------- спрайты героев (WHERO.CPP)
class Rec:
    """Записывает блоки в порядке, в каком WHERO.CPP пишет .dat."""

    def __init__(self, dat):
        self.lay = Layout(dat, 'mask')
        self.sheet = None
        self.py = 0

    def read_f(self, name):
        self.sheet = name
        self.py = 0

    def unit(self, x, y, wb, h):
        self.lay.add(self.sheet, x, y, wb, h)

    def spr2x2(self):
        for i in range(16):
            self.unit(i * 2, self.py, 2, 16)
        self.py += 16

    def spr2x2ext(self):
        self.spr2x2()
        for i in range(8):
            self.unit(i * 4, self.py, 2, 16)
        self.py += 16

    def spr3xN(self, shft, kvo, wide):
        for i in range(kvo):
            self.unit(i * shft, self.py, wide, 24)

    def spr3x3ext(self):
        self.spr3xN(3, 8, 3); self.py += 48
        self.spr3xN(3, 8, 3); self.py -= 24
        self.spr3xN(6, 4, 3); self.py += 48
        self.spr3xN(6, 4, 3); self.py += 24

    def spr2x3ext_compr(self):
        self.spr3xN(2, 10, 2); self.py += 24
        self.spr3xN(4, 5, 2); self.py += 24

    def conv_f(self, form):
        for f in form:
            if f == 255:
                break
            {0: self.spr2x2, 1: self.spr2x2ext, 2: self.spr3x3ext, 4: self.spr2x3ext_compr}[f]()

    def conv_f2(self):
        self.py = 80
        self.spr3xN(3, 8, 3)

    def conv_f1(self):
        self.py = 0
        for ll in (16, 12):
            for i in range(ll):
                self.unit(i * 2, self.py, 2, 16)
            self.py += 16
        for i in range(6):
            self.unit(i * 4, self.py, 4, 32)
        self.py += 32
        for i in range(18):
            self.unit(i, self.py, 1, 8)


FORM1 = [1, 0, 0, 0, 1, 1, 1, 255]
FORM2 = [2, 2, 255]
FORM3 = [1, 1, 1, 1, 0, 255]
FORM3A = [0, 255]
FORM41 = [4, 255]
FORM42 = [4, 4, 255]


def hero_layouts():
    """-> {dat: Layout} для wshum, wsorc, wscreat2, wscreat1, wmisc, wgrizold."""
    res = {}
    r = Rec('wshum.dat'); r.read_f('whum1'); r.conv_f(FORM1); r.read_f('whum2'); r.conv_f(FORM2); res[r.lay.dat] = r.lay
    r = Rec('wsorc.dat'); r.read_f('worc1'); r.conv_f(FORM1); r.read_f('worc2'); r.conv_f(FORM2); res[r.lay.dat] = r.lay
    r = Rec('wscreat2.dat'); r.read_f('wcreat2'); r.py += 48; r.conv_f(FORM42); res[r.lay.dat] = r.lay
    r = Rec('wscreat1.dat')
    r.read_f('wcreat1'); r.conv_f(FORM3); r.read_f('wcreat2'); r.conv_f(FORM41); r.read_f('wmisc'); r.conv_f2()
    res[r.lay.dat] = r.lay
    r = Rec('wmisc.dat'); r.read_f('wmisc'); r.conv_f1(); res[r.lay.dat] = r.lay
    r = Rec('wgrizold.dat'); r.read_f('wcreat1'); r.py += 144; r.conv_f(FORM3A); res[r.lay.dat] = r.lay
    return res


HERO_SHEETS = ['whum1', 'whum2', 'worc1', 'worc2', 'wcreat1', 'wcreat2', 'wmisc']


# ----------------------------------------------------------------------------- кнопки, панель, шрифт, имена (WBAR_BUT.CPP)
NBUTT, NFONT, NNAME = 81, 114, 46


def button_layout(dat, sheet):
    lay = Layout(dat, 'plain')
    ix = iy = 0
    for n in range(NBUTT):
        lay.add(sheet, ix, iy // 32, 3, 23)       # iy - смещение в байтах листа, 768 = 24 строки
        ix += 3
        if ix >= 30:
            ix = 0
            iy += 768
    lay.tail = b'\x00'                            # "в конце доп. байт"
    return lay


def bar_layouts():
    bar = Layout('wbar.dat', 'plain')
    bar.add('wbar', 24, 0, 8, 192)
    font = Layout('wfont.fnt', 'plain')
    ix = iy = 0
    for n in range(NFONT):
        font.add('wbar', 18 + ix, iy * 8, 1, 8)
        ix += 1
        if ix >= 6:
            ix = 0
            iy += 1
    names = Layout('wnames.dat', 'plain')
    ix = iy = 0
    for n in range(NNAME):
        names.add('wbar', ix, iy * 8 + 1, 6, 7)
        iy += 1
        if iy >= 24:
            iy = 0
            ix += 6
    return {l.dat: l for l in (bar, font, names)}


# ----------------------------------------------------------------------------- сборка всего набора
def all_families():
    """-> список (имя группы, {dat: Layout}, {лист: (строк, mask?)}, папка PNG под assets_src/gfx, путь .dat в assets)."""
    fam = []
    for n in (1, 2, 3, 4):
        lay = land_layout(n)
        fam.append((f'land{n}', {lay.dat: lay}, {s: (192, False) for s in land_sheets(n)}))
    fam.append(('heroes', hero_layouts(), {s: (192, True) for s in HERO_SHEETS}))
    fam.append(('buttons_h', {'whumbutt.dat': button_layout('whumbutt.dat', 'whumbutt')}, {'whumbutt': (216, False)}))
    fam.append(('buttons_o', {'worcbutt.dat': button_layout('worcbutt.dat', 'worcbutt')}, {'worcbutt': (216, False)}))
    fam.append(('panel', bar_layouts(), {'wbar': (192, False)}))
    return fam


def sheet_png_path(root, sheet):
    d = 'land' if sheet.startswith(('w1', 'w2', 'w3', 'w4')) and sheet[2:] in ('city', 'build', 'land') else \
        'buttons' if sheet.endswith('butt') else 'panel' if sheet == 'wbar' else 'heroes'
    return os.path.join(root, 'gfx', d, sheet + '.png')


def export_family(fam, datdir, outroot):
    name, layouts, sheet_info = fam
    sheets = {n: Sheet(n, r, m) for n, (r, m) in sheet_info.items()}
    for dat, lay in layouts.items():
        lay_tail = layout_to_sheets(lay, zxio.rd(datdir, dat), sheets)
        if lay_tail != lay.tail:
            raise ValueError(f'{dat}: хвост {lay_tail!r} не равен {lay.tail!r}')
    for n, sh in sheets.items():
        p = sheet_png_path(outroot, n)
        if sh.has_mask:
            save_mask(p, bytes(sh.hero), bytes(sh.mask), SW, sh.rows)
        else:
            save_mono(p, bytes(sh.hero), SW, sh.rows)


def import_family(fam, srcroot, datdir):
    name, layouts, sheet_info = fam
    sheets = {}
    for n, (r, m) in sheet_info.items():
        sh = Sheet(n, r, m)
        p = sheet_png_path(srcroot, n)
        if m:
            h, mk = load_mask(p, SW, r)
            sh.hero, sh.mask = bytearray(h), bytearray(mk)
        else:
            sh.hero = bytearray(load_mono(p, SW, r))
        sheets[n] = sh
    for dat, lay in layouts.items():
        zxio.wr(os.path.join(datdir, dat), sheets_to_layout(lay, sheets, lay.tail))


# ----------------------------------------------------------------------------- плоские картинки: заставки интро, ролики, шрифты
def flick_png(letter):
    return os.path.join('gfx', 'flick', f'flick_{letter}.png')


FLICK_W, FLICK_H, FLICK_N = 14, 144, 8           # кадр 112x144, 8 кадров в файле _0 и 8 в файле _1


def flick_export(letter, d0, d1, outroot):
    """16 кадров (8 из wani?_0 и 8 из wani?_1) -> один лист 8 столбцов x 2 строки."""
    fs = FLICK_W * FLICK_H
    assert len(d0) == len(d1) == fs * FLICK_N, (len(d0), len(d1))
    wb = FLICK_W * 8
    px = [0] * (wb * FLICK_N * 2 * FLICK_H)
    W = wb * FLICK_N
    for r, d in enumerate((d0, d1)):
        for f in range(FLICK_N):
            fr = _unpack(d[f * fs:(f + 1) * fs], FLICK_W, FLICK_H)
            for y in range(FLICK_H):
                o = (r * FLICK_H + y) * W + f * wb
                px[o:o + wb] = fr[y * wb:(y + 1) * wb]
    im = Image.new('P', (W, FLICK_H * 2))
    im.putpalette([255, 255, 255, 0, 0, 0] + [0, 0, 0] * 254)
    im.putdata(px)
    p = os.path.join(outroot, flick_png(letter))
    os.makedirs(os.path.dirname(p), exist_ok=True)
    im.save(p, optimize=True)


def flick_import(letter, srcroot):
    p = os.path.join(srcroot, flick_png(letter))
    wb = FLICK_W * 8
    data = load_mono(p, FLICK_W * FLICK_N, FLICK_H * 2)       # весь лист байтами: строки по 112 байт
    W = FLICK_W * FLICK_N
    res = []
    for r in range(2):
        out = bytearray()
        for f in range(FLICK_N):
            for y in range(FLICK_H):
                o = (r * FLICK_H + y) * W + f * FLICK_W
                out += data[o:o + FLICK_W]
        res.append(bytes(out))
    return res


XLAG_W, XLAG_H, XLAG_N = 20, 128, 5                # кадр 160x128, 5 кадров в блоке


def xlag_export(n, data, outroot):
    fs = XLAG_W * XLAG_H
    assert len(data) == fs * XLAG_N
    rows = bytearray()
    for y in range(XLAG_H):
        for f in range(XLAG_N):
            rows += data[f * fs + y * XLAG_W:f * fs + (y + 1) * XLAG_W]
    save_mono(os.path.join(outroot, 'gfx', 'intro', f'xlag_bl{n}.png'), bytes(rows), XLAG_W * XLAG_N, XLAG_H)


def xlag_import(n, srcroot):
    rows = load_mono(os.path.join(srcroot, 'gfx', 'intro', f'xlag_bl{n}.png'), XLAG_W * XLAG_N, XLAG_H)
    out = bytearray()
    for f in range(XLAG_N):
        for y in range(XLAG_H):
            o = y * XLAG_W * XLAG_N + f * XLAG_W
            out += rows[o:o + XLAG_W]
    return bytes(out)


def font8_export(data, ncols, path):
    n = len(data) // 8
    nrows = (n + ncols - 1) // ncols
    buf = bytearray(ncols * nrows * 8)
    for g in range(n):
        gx, gy = g % ncols, g // ncols
        for r in range(8):
            buf[(gy * 8 + r) * ncols + gx] = data[g * 8 + r]
    save_mono(path, bytes(buf), ncols, nrows * 8)


def font8_import(path, n, ncols):
    nrows = (n + ncols - 1) // ncols
    buf = load_mono(path, ncols, nrows * 8)
    out = bytearray()
    for g in range(n):
        gx, gy = g % ncols, g // ncols
        for r in range(8):
            out.append(buf[(gy * 8 + r) * ncols + gx])
    return bytes(out)
