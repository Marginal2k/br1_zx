#!/usr/bin/env python3
"""Карты и герои уровней Чёрного Ворона: .map / .her <-> текст (CSV и .her.txt) + предпросмотр PNG
(формат - WMAPPER2.CPP, подробно - docs/FORMATS.md).

  NAME.map  4096 байт: 64x64, номер тайла ландшафта; >= 120 - "хвост" здания (120..127: направление к центру здания).
  NAME.her  496 байт: записи по 5 байт {сторона 0 свои/1 враги/2 пленники, тип 0..26, x, y, "для балды"}, затем 0xFF.
  Имя NAME = w<номер>_s<ландшафт 1..4>: ландшафт - файл w<ландшафт>spr.dat.
"""
import os
import re

from PIL import Image, ImageDraw

import zxio

MAP_N = 64
HER_BYTES = 496
HER_MAX = 98
SHIFT = [1, 65, 64, 63, -1, -65, -64, -63]


# ----------------------------------------------------------------------------- .map <-> csv
def map_to_csv(data):
    if len(data) != MAP_N * MAP_N:
        raise ValueError('карта: %d байт вместо 4096' % len(data))
    return '\n'.join(','.join('%3d' % data[y * MAP_N + x] for x in range(MAP_N)) for y in range(MAP_N)) + '\n'


def csv_to_map(text):
    rows = [ln for ln in text.replace('\r', '').split('\n') if ln.strip() and not ln.lstrip().startswith(';')]
    if len(rows) != MAP_N:
        raise ValueError('в карте должно быть %d строк, а их %d' % (MAP_N, len(rows)))
    out = bytearray()
    for n, ln in enumerate(rows, 1):
        vals = [v for v in re.split(r'[,;\s]+', ln.strip()) if v != '']
        if len(vals) != MAP_N:
            raise ValueError('карта, строка %d: %d значений вместо %d' % (n, len(vals), MAP_N))
        for v in vals:
            i = int(v)
            if not 0 <= i <= 255:
                raise ValueError('карта, строка %d: значение %d вне 0..255' % (n, i))
            out.append(i)
    return bytes(out)


# ----------------------------------------------------------------------------- .her <-> txt
HER_HEAD = """; Герои уровня: одна запись на строку - сторона тип x y extra
;   сторона: 0 - свои, 1 - враги, 2 - пленники
;   тип:     0..26 (номер спрайта героя, см. docs/FORMATS.md); для своих и врагов один и тот же набор, расы определяет уровень
;   x y:     клетка карты 0..63 (x - столбец, y - строка в CSV карты)
;   extra:   пятый байт записи ("для балды" - random() в редакторе WMAPPER2); игра его не требует, оставлен для точной копии
"""


def her_to_txt(data):
    if len(data) != HER_BYTES:
        raise ValueError('.her: %d байт вместо %d' % (len(data), HER_BYTES))
    out = [HER_HEAD.rstrip('\n')]
    i = 0
    while i + 5 <= HER_BYTES and data[i] != 0xFF:
        s, t, x, y, e = data[i:i + 5]
        out.append('%d %2d %2d %2d %d' % (s, t, x, y, e - 256 if e > 127 else e))
        i += 5
    if any(b != 0xFF for b in data[i:]):
        raise ValueError('.her: после конца записей не 0xFF')
    return '\n'.join(out) + '\n'


def txt_to_her(text):
    out = bytearray()
    for n, ln in enumerate(text.replace('\r', '').split('\n'), 1):
        ln = ln.split(';')[0].strip()
        if not ln:
            continue
        v = ln.split()
        if len(v) != 5:
            raise ValueError('.her.txt:%d: нужно 5 чисел (сторона тип x y extra)' % n)
        s, t, x, y, e = (int(a) for a in v)
        if not all(0 <= q <= 254 for q in (s, t, x, y)):     # 255 - признак конца
            raise ValueError('.her.txt:%d: недопустимое значение' % n)
        out += bytes([s, t, x, y, e & 0xFF])
    if len(out) > HER_MAX * 5:
        raise ValueError('.her.txt: больше %d героев' % HER_MAX)
    return bytes(out) + b'\xff' * (HER_BYTES - len(out))


# ----------------------------------------------------------------------------- предпросмотр
# таблицы из WMAPPER2.CPP: смещение спрайта героя в массиве, массив, тип (1 - 2x2, 2/3 - 2x3, 3x3: берётся верх 16 строк)
HSHIFT = [0, 1536, 2560, 3584, 4608, 6144, 7680, 9216, 12672,
          0, 1536, 2560, 3584, 4608, 6144, 7680, 9216, 12672,
          0, 1536, 3072, 4608, 6144, 7168, 8192, 0, 1440]
HMAS = ['wshum'] * 9 + ['wsorc'] * 9 + ['wscreat1'] * 7 + ['wscreat2'] * 2
HTYP = [1, 1, 1, 1, 1, 1, 1, 3, 3, 1, 1, 1, 1, 1, 1, 1, 3, 3, 1, 1, 1, 1, 1, 1, 2, 2, 2]
SIDE_COLOR = [(0, 150, 0), (220, 0, 0), (0, 80, 255)]


def tile_index(m, x, y):
    """номер спрайта ландшафта для клетки (x, y) с учётом "хвостов" зданий."""
    bt = m[y * MAP_N + x]
    if bt >= 120:
        p = y * MAP_N + x + SHIFT[bt - 120]
        at = m[p] if 0 <= p < MAP_N * MAP_N else 0
        bt = (at - 78) * 8 + 128 + (bt - 120) if at < 108 else (at - 108) * 3 + 368 + (bt - 120)
    return bt


def render_preview(mapdata, herdata, land, sprites, path):
    """land - w?spr.dat (12288 байт); sprites - {'wshum': bytes, ...} (для героев, None - без героев). 1024x1024 PNG."""
    W = MAP_N * 16
    im = Image.new('RGB', (W, W), (255, 255, 255))
    px = im.load()
    for y in range(MAP_N):
        for x in range(MAP_N):
            t = tile_index(mapdata, x, y)
            if t * 32 + 32 > len(land):
                t = 0
            tile = land[t * 32:t * 32 + 32]
            for k in range(2):
                for l in range(16):
                    b = tile[k * 16 + l]
                    for bit in range(8):
                        if (b >> (7 - bit)) & 1:
                            px[x * 16 + k * 8 + bit, y * 16 + l] = (0, 0, 0)
    if sprites:
        d = ImageDraw.Draw(im)
        i = 0
        while i + 5 <= HER_BYTES and herdata[i] != 0xFF:
            s, t, hx, hy = herdata[i:i + 4]
            i += 5
            col = SIDE_COLOR[min(s, 2)]
            dat = sprites[HMAS[t]]
            nxt = 16 if HTYP[t] > 1 else 0
            for ii in range(2):
                o = HSHIFT[t] + ii * (32 + nxt)
                for jj in range(16):
                    m = dat[o + jj * 2]
                    h = m ^ dat[o + jj * 2 + 1]
                    for bit in range(8):
                        if (m >> (7 - bit)) & 1 and 0 <= hx < MAP_N and 0 <= hy < MAP_N:
                            px[hx * 16 + ii * 8 + bit, hy * 16 + jj] = col if (h >> (7 - bit)) & 1 else (255, 255, 255)
            d.rectangle([hx * 16, hy * 16, hx * 16 + 15, hy * 16 + 15], outline=col)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)


def land_of(name):
    """w101_s4 -> 4"""
    m = re.fullmatch(r'w(\d+)_s(\d)', name)
    if not m:
        raise ValueError('имя карты %r не вида wN_sL' % name)
    return int(m.group(2))
