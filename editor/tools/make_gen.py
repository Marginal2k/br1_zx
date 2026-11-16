#!/usr/bin/env python3
"""Обучение генератора заготовок по картам игры -> editor/data/gendata.js, data/tile_classes_<L>.json, data/tile_classes.html.

    python editor/tools/make_gen.py

Входы (только чтение): 32 уровня 1997 г. (src/levels + assets_src, сборка во временный каталог) и 32 уровня 1999 г. (assets_src/levels_ext),
графика ландшафта assets_src. Всего 64 карты 64x64 (блоки концовок *_17e - не карты).

Что делает:
1. Статистика по ландшафтам 1..4: частоты тайлов, пары соседей справа и снизу (слева/сверху - те же пары наоборот).
   Клетки зданий (центр + «хвосты» 120..127) - один условный тайл B (=200): здания генератор ставит целиком, тайлами их не рисует.
2. Разметка тайлов по классам (трава, вода, лес, ...): ручная основа по FORMATS.md п. 2.2 (комментарий WLAND.CPP) + автоматическое уточнение:
   вектор тайла - частоты соседей по 4 сторонам; k-средних по косинусной близости с центрами классов ручной основы, голос соседей
   и проходимость (1..51) / доля чернил. Переходные тайлы - те, у которых с какой-то стороны преобладает другой класс («вода | трава»).
   Таблица - data/tile_classes_<L>.json (редактируется руками: поле class; если оно отличается от auto, правка считается ручной и при
   пересборке сохраняется; можно поставить "use": false - тайл не брать в генерацию).
3. Контекст классов: для каждой клетки карт автора ключ «класс клетки + классы 4 соседей» -> какие тайлы автор ставил (частоты).
4. Сценарии: разбор кода заданий (_cLOOP) всех уровней библиотеки - цель и что зашито (координаты, типы героев, типы зданий).
5. Герои (типы по сторонам) и здания (центры по расам) - частоты у автора.
"""
import base64
import collections
import io
import json
import math
import os
import re
import sys

import brlib
from brlib import ROOT, ED, levels, levasm

B = 200              # условный тайл «клетка здания»
MIN_FREQ = 4         # тайлы, которые у автора встречаются реже, в генерацию не берутся
GO_MAX = 52
SIDES = ('n', 'e', 's', 'w')
DXY = ((0, -1), (1, 0), (0, 1), (-1, 0))

# ---------------------------------------------------------------- ручная основа
# ландшафты 1, 2, 4 («снаружи») - нумерация WLAND.CPP; 3 - подземелье (свой набор, по картам w105, w110, w114, w206, w212, human_10, kung_12)
CLASSES_OUT = ['border', 'grass', 'road', 'paveh', 'pavek', 'water', 'bridge', 'forest', 'fence', 'building']
CLASSES_DUN = ['border', 'cave', 'floor', 'wall', 'door', 'rock', 'exit', 'water']
CLASS_RU = {'border': 'граница', 'grass': 'трава', 'road': 'тропа', 'paveh': 'площадь людей', 'pavek': 'площадь кунгов', 'water': 'вода и берега',
            'bridge': 'мост', 'forest': 'лес / скалы', 'fence': 'забор / камни', 'building': 'здание', 'cave': 'пол пещеры', 'floor': 'пол подземелья',
            'wall': 'стена', 'door': 'дверь', 'rock': 'скала', 'exit': 'выход (туннель)'}


def manual_out():
    m = {0: 'border', 7: 'paveh', 8: 'pavek', 56: 'water', 51: 'fence', B: 'building'}
    for t in (1, 2, 3, 4, 5, 6):
        m[t] = 'grass'
    for t in range(9, 17):
        m[t] = 'road'
    for t in list(range(26, 30)) + list(range(52, 56)) + list(range(57, 61)) + list(range(113, 120)):
        m[t] = 'water'
    for t in range(30, 48):
        m[t] = 'bridge'
    for t in (61, 62, 63):
        m[t] = 'forest'
    for t in range(64, 73):
        m[t] = 'fence'
    return m


def manual_dun():
    m = {0: 'border', 1: 'cave', 2: 'cave', 3: 'cave', 5: 'exit', 6: 'floor', 13: 'floor', 61: 'door', 88: 'rock'}
    for t in (80, 81, 82, 83, 85):
        m[t] = 'wall'
    for t in range(89, 113):
        m[t] = 'rock'
    return m


MANUAL = {1: manual_out(), 2: manual_out(), 3: manual_dun(), 4: manual_out()}


def classes_of(land):
    return CLASSES_DUN if land == 3 else CLASSES_OUT


# ---------------------------------------------------------------- карты
def load_levels():
    """{имя: блок} - 64 уровня (без концовок)."""
    out = {}
    for n in brlib.LEVELS97:
        out['w' + n] = brlib.build97(n)
    src = os.path.join(ROOT, 'assets_src', 'levels_ext')
    for n in levels.names_src(src):
        if os.path.isdir(os.path.join(src, n)):
            out[n] = levels.import_one(n, src)
    return out


SHIFT = [1, 65, 64, 63, -1, -65, -64, -63]


def token_map(m, land):
    """карта -> список тайлов, клетки зданий -> B (только снаружи: в подземелье тайлы >= 78 - стены и скалы)."""
    t = list(m)
    if land == 3:
        return t
    for i, v in enumerate(m):
        if v >= 120:
            c = i + SHIFT[v - 120]
            t[i] = B
            if 0 <= c < 4096:
                t[c] = B
    return t


def sprites(land):
    return open(os.path.join(brlib.assets_dir(), 'data', f'w{land}spr.dat'), 'rb').read()


def ink(spr, t):
    if t >= 384:
        return 0.5
    return sum(bin(x).count('1') for x in spr[t * 32:t * 32 + 32]) / 256


# ---------------------------------------------------------------- разметка
def cosine(a, b):
    num = sum(a[k] * b.get(k, 0) for k in a)
    da = math.sqrt(sum(v * v for v in a.values()))
    db = math.sqrt(sum(v * v for v in b.values()))
    return num / (da * db) if da and db else 0.0


def classify(land, freq, nb, spr, old):
    """nb[t][d] - Counter соседей тайла t со стороны d. Возвращает {t: dict(class, auto, src, trans, ...)}."""
    man = MANUAL[land]
    tiles = sorted(freq)
    # вектор тайла: (сторона, сосед) -> доля
    vec = {}
    for t in tiles:
        v = {}
        for d in range(4):
            tot = sum(nb[t][d].values()) or 1
            for n, c in nb[t][d].items():
                v[(d, n)] = c / tot
        vec[t] = v
    cls = {t: man[t] for t in tiles if t in man}
    auto = {}
    for _ in range(6):     # k-средних: центры классов по текущей разметке, переназначение авто-тайлов
        cent = collections.defaultdict(collections.Counter)
        inks = collections.defaultdict(list)
        pas = collections.defaultdict(list)
        for t, c in cls.items():
            for k, x in vec[t].items():
                cent[c][k] += x * math.log(1 + freq[t])
            inks[c].append(ink(spr, t))
            pas[c].append(1 <= t < GO_MAX)
        new = {}
        for t in tiles:
            best, bs = None, -1
            for c in cent:
                if c in ('border', 'building', 'exit', 'door') and t not in man:
                    continue      # эти классы - только ручные
                s = cosine(vec[t], cent[c])
                # голос соседей: доля соседей того же класса
                same = sum(x for (d, n), x in vec[t].items() if cls.get(n) == c) / 4
                s = 0.6 * s + 0.4 * same
                s -= 0.3 * abs(ink(spr, t) - sum(inks[c]) / len(inks[c]))
                p = sum(pas[c]) / len(pas[c])
                if (1 <= t < GO_MAX) != (p >= 0.5):
                    s *= 0.85
                if s > bs:
                    best, bs = c, s
            new[t] = (best, bs)
        auto = new
        cls = {t: man.get(t, auto[t][0]) for t in tiles}
    rows = {}
    for t in tiles:
        a = auto[t][0]
        o = old.get(t)
        if o is not None and o.get('class') != o.get('auto'):      # ручная правка пользователя
            c, src = o['class'], 'manual'
        elif t in man:
            c, src = man[t], 'manual'
        else:
            c, src = a, 'auto'
        use = freq[t] >= MIN_FREQ and not (o is not None and o.get('use_user'))
        rows[t] = dict(t=t, cls=c, auto=a, src=src, freq=freq[t], go=1 <= t < GO_MAX, use=use, score=round(auto[t][1], 3))
    # переходы: с какой стороны преобладает другой класс
    for t in tiles:
        tr = {}
        for d in range(4):
            cc = collections.Counter()
            for n, k in nb[t][d].items():
                cc[rows[n]['cls'] if n in rows else '?'] += k
            tot = sum(cc.values())
            if not tot:
                continue
            c, k = cc.most_common(1)[0]
            if c != rows[t]['cls'] and k / tot >= 0.5:
                tr[SIDES[d]] = c
        rows[t]['trans'] = tr
    return rows


# ---------------------------------------------------------------- сценарии
def code_lines(asm):
    i = asm.find('_cLOOP:')
    if i < 0:
        return []
    out = []
    for l in asm[i:].splitlines():
        s = l.split(';')[0].strip()
        if s.startswith('DEFS') or s.startswith('datMIN'):
            break
        if s and not s.endswith(':'):
            out.append(s)
    return out


def num(s):
    s = s.strip()
    return int(s[1:], 16) if s.startswith('$') else int(s, 0)


def scenario_of(asm):
    """цель кода задания и что в нём зашито (по образцам, найденным в 64 уровнях).
    TheEND: 1 - победа игрока, 2 - поражение (wmenu2.asm MU_END) за обе расы. Массивы героев: HUMAN - войска игрока (и освобождённые
    пленники), KUNGE - врага (wmisc_1.asm NEWALL: массив = MASTER xor сторона, сторона в файле героев - раса)."""
    L = code_lines(asm)
    txt = '\n'.join(L)
    extra = len(L) > 3
    if 'ld a,(END_2)' in txt:
        return dict(kind='tunnel', who=[22, 23], note='победа (TheEND=1), когда князь/Гризольда (тип 22/23) в массиве HUMAN (войска игрока, куда переходят освобождённые пленники) встанет на тайл 5 (туннель); '
                                                      'нужны: ландшафт 3 и признак подземелья MAP[0]=1; «нет врагов» (END_1=1) победы не даёт')
    if L[:2] == ['ld a,(END_1)', 'ld (TheEND),a']:
        return dict(kind='kill_all', extra=extra, note='исход боя по END_1: 1 - у врага (массив KUNGE) не осталось героев, пленников и зданий - победа; 2 - не осталось своих (HUMAN) - поражение'
                    + ('; дополнительный код не про цель (меняет поведение врагов или цвет экрана)' if extra else ''))
    m = re.search(r'ld (?:ix|hl),(HUMAN|KUNGE|KBUILD|\$7c04|\$b800|\$bb00|\$7d00)', txt)
    if m:
        arr = {'$b800': 'HUMAN', '$bb00': 'KUNGE', '$7d00': 'KBUILD', '$7c04': 'HBUILD'}.get(m.group(1), m.group(1))
        cps = [num(x) for x in re.findall(r'cp (\$[0-9a-f]+)', txt)]
        de = re.findall(r'ld de,(\$[0-9a-f]+)', txt)
        if arr in ('HUMAN', 'KUNGE') and 'sbc hl,de' in txt:
            xy = num(de[-1])
            return dict(kind='reach', array=arr, types=[c for c in cps if c > 2 or arr == 'HUMAN'], x=xy & 255, y=xy >> 8,
                        note=f'победа (TheEND=1), когда герой типа {"/".join(str(c) for c in cps)} из массива {arr} окажется в клетке ({xy & 255},{xy >> 8})')
        if arr in ('HUMAN', 'KUNGE') and 'ld a,(ix+$00)' in txt:
            return dict(kind='lost_hero', array=arr, types=cps, note=f'победа (TheEND=1), когда в массиве {arr} (враг) не станет героя типа {cps[0]}; иначе по END_1')
        if arr == 'HBUILD':
            return dict(kind='build', btype=cps[1] if len(cps) > 1 else cps[0], count=cps[-1],
                        note=f'победа, когда у игрока {cps[-1]} готовых зданий типа {cps[1]} (тип = центр - 78); поражение - по END_1=2')
        if arr == 'KBUILD':
            return dict(kind='destroy', btypes=cps, note=f'победа, когда здание врага типа {"/".join(str(c) for c in cps)} (тип = центр - 90) разрушено; иначе по END_1')
    return dict(kind='other', note='не разобрано')


def library_scenarios():
    out = []
    for n in brlib.LEVELS97:
        b = brlib.build97(n)
        out.append(('w' + n, b, levasm.to_asm(b[:levels.OFF_HER], 'w' + n)))
    src = os.path.join(ROOT, 'assets_src', 'levels_ext')
    for n in levels.names_src(src):
        d = os.path.join(src, n)
        if os.path.isdir(d):
            out.append((n, levels.import_one(n, src), open(os.path.join(d, 'script.asm'), encoding='utf-8').read()))
    res = []
    for n, b, asm in out:
        s = scenario_of(asm)
        s.update(name=n, land=b[107], master=b[23], levtyp=b[21])
        m = b[1600:5696]
        s['tile5'] = [[i & 63, i >> 6] for i in range(4096) if m[i] == 5 and b[107] == 3]
        res.append(s)
    return res


# ---------------------------------------------------------------- лист «классы и тайлы»
def tile_png(spr, t, scale=2):
    from PIL import Image
    img = Image.new('L', (16, 16), 255)
    px = img.load()
    for c in range(2):
        for r in range(16):
            byte = spr[t * 32 + c * 16 + r]
            for bit in range(8):
                if byte & (0x80 >> bit):
                    px[c * 8 + bit, r] = 0
    img = img.resize((16 * scale, 16 * scale))
    bio = io.BytesIO()
    img.save(bio, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(bio.getvalue()).decode()


def write_sheet(tables, path):
    css = ('body{font:13px system-ui,sans-serif;margin:16px;background:#fafafa;color:#222}h2{margin:24px 0 6px}h3{margin:12px 0 4px;font-size:14px}'
           '.g{display:flex;flex-wrap:wrap;gap:6px}.t{width:76px;border:1px solid #ccc;background:#fff;padding:3px;text-align:center;font-size:11px}'
           '.t img{image-rendering:pixelated;display:block;margin:0 auto 2px}.a{border-color:#e0a000}.x{opacity:.35}.tr{color:#06c}.m{color:#c00}'
           'p.n{color:#555;max-width:900px}')
    h = [f'<!doctype html><meta charset="utf-8"><title>Классы тайлов</title><style>{css}</style>',
         '<h1>Классы и тайлы (обучение генератора)</h1><p class="n">Создано <code>tools/make_gen.py</code> по 64 картам игры. '
         'Рамка жёлтая - класс выбран автоматически, красная надпись «авто: …» - автоматика не согласна с ручной разметкой. '
         'Бледные - встречаются у автора реже 4 раз или отключены (<code>use: false</code>), в генерацию не идут. '
         'Синим - переход: с какой стороны преобладает другой класс (n/e/s/w - сверху/справа/снизу/слева). '
         'Править: <code>data/tile_classes_&lt;L&gt;.json</code>, поле <code>class</code>, затем снова <code>python tools/make_gen.py</code>.</p>']
    for land, (rows, spr) in tables.items():
        h.append(f'<h2>Ландшафт {land}{" (подземелье)" if land == 3 else ""}</h2>')
        for c in classes_of(land):
            rs = [r for r in rows.values() if r['cls'] == c]
            if not rs:
                continue
            h.append(f'<h3>{c} - {CLASS_RU.get(c, c)} ({len(rs)})</h3><div class="g">')
            for r in sorted(rs, key=lambda r: r['t']):
                t = r['t']
                img = tile_png(spr, t) if t < 384 else ''
                tr = ' '.join(f'{k}:{v}' for k, v in r['trans'].items())
                dis = '' if r['auto'] == r['cls'] else f'<div class="m">авто: {r["auto"]}</div>'
                cl = 't' + (' a' if r['src'] == 'auto' else '') + ('' if r['use'] else ' x')
                h.append(f'<div class="{cl}">' + (f'<img src="{img}" width="32" height="32">' if img else '<b>B</b>') +
                         f'<b>{t if t != B else "здание"}</b> ×{r["freq"]}{"" if r["go"] else " ⛔"}' +
                         (f'<div class="tr">{tr}</div>' if tr else '') + dis + '</div>')
            h.append('</div>')
    open(path, 'w', encoding='utf-8', newline='\n').write('\n'.join(h))


# ---------------------------------------------------------------- главное
def main():
    brlib.utf8_stdout()
    L = load_levels()
    data = {'version': 1, 'B': B, 'goMax': GO_MAX, 'minFreq': MIN_FREQ, 'lands': {}, 'scenarios': [], 'heroes': {}, 'buildings': {}}
    tables = {}
    for land in (1, 2, 3, 4):
        maps = [(n, token_map(b[1600:5696], land)) for n, b in sorted(L.items()) if b[107] == land]
        freq = collections.Counter()
        nb = collections.defaultdict(lambda: [collections.Counter() for _ in range(4)])
        for n, m in maps:
            for i, v in enumerate(m):
                freq[v] += 1
                x, y = i & 63, i >> 6
                for d, (dx, dy) in enumerate(DXY):
                    xx, yy = x + dx, y + dy
                    if 0 <= xx < 64 and 0 <= yy < 64:
                        nb[v][d][m[yy * 64 + xx]] += 1
        spr = sprites(land)
        jpath = os.path.join(ED, 'data', f'tile_classes_{land}.json')
        old = {}
        if os.path.exists(jpath):
            for r in json.load(open(jpath, encoding='utf-8'))['tiles']:
                old[r['tile']] = r
                if r.get('use') is False and r['freq'] >= MIN_FREQ:
                    r['use_user'] = True
        rows = classify(land, freq, nb, spr, old)
        tables[land] = (rows, spr)
        with open(jpath, 'w', encoding='utf-8', newline='\n') as f:
            f.write('{\n "land": %d,\n "note": "class - класс тайла (правится руками; если отличается от auto, при пересборке сохраняется), auto - что '
                    'выбрала автоматика, src - manual/auto, trans - переход: с какой стороны (n/e/s/w) преобладает другой класс, use - брать ли в '
                    'генерацию (реже %d раз - нет), go - проходим (1..51), tile %d - любая клетка здания",\n "classes": %s,\n "tiles": [\n' %
                    (land, MIN_FREQ, B, json.dumps(classes_of(land))))
            f.write(',\n'.join('  ' + json.dumps(dict(tile=r['t'], **{'class': r['cls']}, auto=r['auto'], src=r['src'], freq=r['freq'], go=r['go'],
                                                       use=r['use'], trans=r['trans']), ensure_ascii=False) for r in sorted(rows.values(), key=lambda r: r['t'])))
            f.write('\n ]\n}\n')
        # данные для gen.js: только тайлы, которые идут в генерацию
        use = sorted(t for t, r in rows.items() if r['use'])
        idx = {t: k for k, t in enumerate(use)}
        C = classes_of(land)
        adj = [collections.Counter(), collections.Counter()]       # справа, снизу
        sig = collections.defaultdict(collections.Counter)
        clsmap = {t: r['cls'] for t, r in rows.items()}
        # стороны тайла (n e s w): same[t][d] - сколько раз сосед того же класса, tot[t][d] - всего (рамка карты не в счёт)
        same = collections.defaultdict(lambda: [0, 0, 0, 0])
        tot = collections.defaultdict(lambda: [0, 0, 0, 0])
        for n, m in maps:
            for i, v in enumerate(m):
                x, y = i & 63, i >> 6
                if x < 63 and v in idx and m[i + 1] in idx:
                    adj[0][(idx[v], idx[m[i + 1]])] += 1
                if y < 63 and v in idx and m[i + 64] in idx:
                    adj[1][(idx[v], idx[m[i + 64]])] += 1
                if v in idx:
                    for d, (dx, dy) in enumerate(((0, -1), (1, 0), (0, 1), (-1, 0))):
                        xx, yy = x + dx, y + dy
                        if 0 <= xx < 64 and 0 <= yy < 64 and m[yy * 64 + xx] != 0:
                            tot[v][d] += 1
                            same[v][d] += clsmap.get(m[yy * 64 + xx]) == clsmap[v]
                    k = [C.index(clsmap[v])]
                    for dx, dy in DXY:
                        xx, yy = x + dx, y + dy
                        k.append(C.index(clsmap[m[yy * 64 + xx]]) if 0 <= xx < 64 and 0 <= yy < 64 else 0)
                    sig[','.join(map(str, k))][idx[v]] += 1
        data['lands'][str(land)] = dict(
            classes=C, tiles=use, cls=[C.index(rows[t]['cls']) for t in use], freq=[rows[t]['freq'] for t in use],
            adjR=[[a, b, c] for (a, b), c in sorted(adj[0].items())], adjD=[[a, b, c] for (a, b), c in sorted(adj[1].items())],
            sig={k: [[t, c] for t, c in sorted(v.items())] for k, v in sorted(sig.items())}, maps=[n for n, _ in maps],
            # side[k] = [other, same]: биты сторон n=1 e=2 s=4 w=8, где у автора сосед почти всегда другого класса (берег, край дороги)
            # или почти всегда того же; кисти не ставят, например, береговой тайл посреди реки
            side=[[sum(1 << d for d in range(4) if tot[t][d] >= 4 and same[t][d] <= 0.05 * tot[t][d]),
                   sum(1 << d for d in range(4) if tot[t][d] >= 4 and same[t][d] >= 0.95 * tot[t][d])] for t in use])
        print(f'ландшафт {land}: карт {len(maps)}, тайлов {len(freq)}, в генерации {len(use)}, авто-класс у {sum(r["src"] == "auto" for r in rows.values())}, '
              f'несогласий с ручной {sum(r["src"] == "manual" and r["auto"] != r["cls"] for r in rows.values())}, переходных {sum(bool(r["trans"]) for r in rows.values())}, '
              f'пар справа {len(adj[0])}, снизу {len(adj[1])}, контекстов {len(sig)}')
    write_sheet(tables, os.path.join(ED, 'data', 'tile_classes.html'))
    # герои и здания у автора
    her = collections.defaultdict(collections.Counter)
    bld = collections.defaultdict(collections.Counter)
    for n, b in L.items():
        for k in range(0, 490, 5):
            r = b[1104 + k:1109 + k]
            if r[0] == 0xFF:
                break
            her[f'{b[23]}{min(r[0], 2)}'][r[1]] += 1
        if b[107] != 3:
            m = b[1600:5696]
            for i, v in enumerate(m):
                if 78 <= v <= 112 and any(0 <= i - SHIFT[d] < 4096 and m[i - SHIFT[d]] == 120 + d for d in range(8)):
                    bld[str(b[107])][v] += 1
    data['heroes'] = {k: sorted(v.items()) for k, v in sorted(her.items())}
    data['buildings'] = {k: sorted(v.items()) for k, v in sorted(bld.items())}
    data['scenarios'] = library_scenarios()
    for s in data['scenarios']:
        print(f"  {s['name']:9} земля {s['land']} {'кунги' if s['master'] else 'люди '} {s['kind']:9} {s.get('x', '')},{s.get('y', '')} {s.get('types', s.get('btypes', ''))}")
    out = os.path.join(ED, 'data', 'gendata.js')
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// создано editor/tools/make_gen.py - не править вручную (классы тайлов правятся в data/tile_classes_<L>.json)\nwindow.BR_GEN = ')
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\nif (typeof module !== "undefined") module.exports = window.BR_GEN;\n')
    print('записан', out, os.path.getsize(out), 'байт')


if __name__ == '__main__':
    main()
