#!/usr/bin/env python3
"""Чёрный Ворон 1: исходники + assets -> build/br1.trd, build/br2.trd (два обычных диска TR-DOS) и
build/br_1mb.trd (один образ 1 МБ для эмуляторов/esxDOS, без запросов на смену диска).

    python build.py
    SJASMPLUS=путь python build.py

Что делается (подробно - docs/NOTES.md):
 1. assets -> build/data/*.zx0 (упаковка ZX0, кэш build/cache); блоки уровней собираются из src/levels
 2. для каждого варианта (два диска / один диск):
    - раскладка файлов диска 2 -> build/<вариант>/disk_layout.inc (RESTAB, SAVELIN, DSKNAME)
    - сборка игры (src/game) -> 8 страниц ОЗУ, упаковка в файлы диска 1
    - сборка загрузчика (src/start1) и концовки (src/final); раскладка диска 1 -> disk1_layout.inc
    - образы TR-DOS
"""
import hashlib
import os
import re
import shutil
import struct
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import zx0
import assets as assets_tool      # tools/assets.py: assets_src -> build/assets
import levels as levels_tool      # tools/levels.py: assets_src/levels_ext -> блоки уровней 12608 байт
import text as text_tool          # tools/text.py: таблица глифов
from trd import Trd, basic_program, SPT

B = os.path.join(ROOT, 'build')
SRC = os.path.join(ROOT, 'src')
ASRC = os.path.join(ROOT, 'assets_src')         # редактируемые ресурсы (PNG, txt, csv) - править только их
AS = os.path.join(B, 'assets')                  # двоичные ресурсы, получаются импортом из assets_src
DATA = os.path.join(B, 'data')
CACHE = os.path.join(B, 'cache')
SJ = os.environ.get('SJASMPLUS') or shutil.which('sjasmplus') or r'C:\sjasmplus\sjasmplus.exe'

LOADER_SECTORS = 4              # место загрузчика на диске (файл br1, #6000..#63FF)
SLOT_SECTORS = 51               # слот сохранения: 41 (#7700..#9FFF) + 8 (#B800..#BFFF) + 2 (XY); сверяется с SLOTSEC из disk.asm
SLOTS = {False: 8, True: 6}     # слотов сохранения: два диска / образ 1 МБ (там остаётся меньше места)
EXTLEV = 35                     # номер файла ресурса дополнительного уровня = номер обычного + EXTLEV (53..68 люди, 71..86 кунги)
EXTMUS = 78                     # то же для музыки (87..94); номер файла = 9 + fsMUS + EXTMUS
NFILES = 94                     # всего номеров файлов в RESTAB
LDR_ADR = 0x6000

# упакованные блоки, которые включают сами исходники: INCBIN "x.zx0" <- assets/...
PACKED = {
    'barkov/crow1.zx0': 'barkov/crow1.scr',
    'intro/jammy45.zx0': 'intro/jammy45.bin',
    'intro/wxlag.zx0': 'intro/wxlag.bin',
    'intro/winflick.zx0': 'intro/winflick.bin',
    'intro/winvict.zx0': 'intro/winvict.bin',
    'data/wflictxt.zx0': 'data/wflictxt.bin',
    'data/winstr0.zx0': 'data/winstr0.bin',
    'data/winstr1.zx0': 'data/winstr1.bin',
    'data/winstr2.zx0': 'data/winstr2.bin',
    'bobov/crow_k.zx0': 'bobov/crow_k.mus',
    'bobov/crow_h.zx0': 'bobov/crow_h.mus',
}
FLICKS = 'B D 8 J A C G I 7 E F 9 2 6 H 3 4 5 U V W X Y Z'.split()      # порядок файлов 16..63 диска 1
MUSIC = ['crow_b1', 'crow_b2', 'crow_a2', 'crow_3', 'crow_4', 'crow_5', 'osen', 'x_txy']   # файлы 9..16 диска 2
LEVELS_H = [f'1{i:02}' for i in range(1, 17)] + ['117end']
LEVELS_K = [f'2{i:02}' for i in range(1, 17)] + ['217end']
EXT_H = [f'human_{i:02}' for i in range(1, 17)]    # дополнительные уровни 1999 (assets_src/levels_ext), 17-й - обычные 117end/217end
EXT_K = [f'kung_{i:02}' for i in range(1, 17)]
EXT_MUSIC = [f'mus{i}' for i in range(1, 9)]       # assets_src/music/ext


def rd(*p):
    with open(os.path.join(*p), 'rb') as f:
        return f.read()


def wr(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb' if isinstance(data, bytes) else 'w', **({} if isinstance(data, bytes) else {'newline': '\n', 'encoding': 'utf-8'})) as f:
        f.write(data)


def pack(data):
    """Блок ZX0 (слово длины + поток); оптимальная упаковка медленная, поэтому кэш."""
    os.makedirs(CACHE, exist_ok=True)
    key = os.path.join(CACHE, hashlib.sha1(b'zx0-1' + data).hexdigest())
    if os.path.exists(key):
        return rd(key)
    out = zx0.pack(data)
    wr(key, out)
    return out


def pack_tail(data, k=4):
    """Блок для распаковки "на месте" в конце памяти: последние k байт данных хранятся сырыми после потока ZX0,
    поток упаковывает остальное (запас k байт у верхней границы). Слово длины = только поток; DELPZX запоминает хвост, переносит поток под верхнюю границу и дописывает хвост после распаковки."""
    body = data[:-k]
    os.makedirs(CACHE, exist_ok=True)
    key = os.path.join(CACHE, hashlib.sha1(b'zx0-stream' + body).hexdigest())
    if os.path.exists(key):
        s = rd(key)
    else:
        s = zx0.compress_stream(body)
        wr(key, s)
    out, used = zx0.unpack_stream(s)
    assert out == body and used == len(s), 'ZX0: проверка распаковки не прошла'
    return struct.pack('<H', len(s)) + s + data[-k:]


def prepack(jobs):
    """Заранее упаковать блоки параллельно (zx0.exe - внешняя программа, один блок занимает секунды; кэш build/cache).
    jobs: [(функция упаковки, данные)]. Без zx0.exe (медленный Python-вариант) параллелизм не помогает, но и не мешает."""
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=max(1, (os.cpu_count() or 2))) as ex:
        list(ex.map(lambda j: j[0](j[1]), jobs))


def asm(src_dir, main, outdir, incs=(), defs=()):
    os.makedirs(outdir, exist_ok=True)
    cmd = [SJ, '--nologo', '--msg=err', '--lst=main.lst', '--sym=main.sym', '-I', os.path.join(SRC, src_dir),
           '-I', os.path.join(SRC, 'lib'), '-I', AS, '-I', DATA] + [x for i in incs for x in ('-I', i)]
    cmd += [f'-D{d}' for d in defs]
    r = subprocess.run(cmd + [os.path.join(SRC, src_dir, main)], capture_output=True, text=True, cwd=outdir)
    if r.returncode:
        sys.exit(f'сборка src/{src_dir}/{main} не удалась:\n{r.stdout}{r.stderr}')
    return outdir


def symbols(path):
    sym = {}
    for ln in open(path, encoding='utf-8', errors='replace'):
        m = re.match(r'(\S+): EQU 0x([0-9A-Fa-f]+)', ln)
        if m:
            sym[m.group(1)] = int(m.group(2), 16)
    return sym


def sectors(n):
    return (n + 255) // 256


def check_in_place(name, packed, dest, size, top, tail=0):
    """Блок читается в dest, DELPZX переносит поток под самую верхнюю границу top (адрес за последним байтом),
    затем распаковка идёт "на месте": читаемый адрес не должен отставать от записываемого."""
    gap = top - (dest + size)
    if gap < 0:
        return f'{name}: распакованный блок выходит за границу (#{dest + size:04X} > #{top:04X})'
    m = zx0.inplace_margin(packed, gap + tail)
    if m < 0:
        return f'{name}: распаковка "на месте" небезопасна (запас {m} байт; зазор {gap})'
    return None


def phys(addr, n, bank):
    """Диапазон адресов [addr, addr+n) окна памяти -> список (страница ОЗУ, начало, конец) физической памяти.
    #4000-#7FFF - страница 5, #8000-#BFFF - страница 2, #C000-#FFFF - страница bank."""
    out = []
    end = addr + n
    while addr < end:
        if addr < 0x4000:
            page, base, lim = 'ROM', 0, 0x4000
        elif addr < 0x8000:
            page, base, lim = 5, 0x4000, 0x8000
        elif addr < 0xC000:
            page, base, lim = 2, 0x8000, 0xC000
        else:
            page, base, lim = bank, 0xC000, 0x10000
        hi = min(end, lim)
        out.append((page, addr - base, hi - base))
        addr = hi
    return out


def overlap(a, b):
    return any(p == q and lo < hi2 and lo2 < hi for p, lo, hi in a for q, lo2, hi2 in b)


def check_loader(sizes, sym1):
    """Все чтения и распаковки загрузчика при загрузке игры (bGAME): исходник и приёмник не пересекаются физически, не затирают
    живой загрузчик (#6000-#63FF вместе со стеком) и уже распакованное. sizes: {файл: (секторов, длина потока, длина данных)}."""
    BUF1, BUF2 = sym1['BUF1'], sym1['BUF2']
    # живое: загрузчик со стеком (#6000-#63FF) и системные переменные #5C00-#5CFF (их использует ПЗУ TR-DOS при каждом чтении)
    live = phys(sym1['LOADER'], sym1['LDREND'] - sym1['LOADER'], 0) + phys(0x5C00, 0x100, 0)
    kept = []
    errs = []

    def step(name, rd_at, rd_bank, f, un_src, un_bank, un_dst, un_bank_dst, keep=True):
        nsec, stream, raw = sizes[f]
        r = phys(rd_at, nsec * 256, rd_bank)
        if any(a[2] > 0x4000 for a in r if a[0] == rd_bank and rd_at >= 0xC000):
            errs.append(f'{name}: чтение выходит за границу окна')
        for what, rng in (('чтение файла', r), ('поток', phys(un_src, stream + 2, un_bank))):
            if overlap(rng, live):
                errs.append(f'{name}: {what} пересекает живой загрузчик/стек')
            if overlap(rng, kept):
                errs.append(f'{name}: {what} пересекает уже распакованное: {rng} / {kept}')
        d = phys(un_dst, raw, un_bank_dst)
        if overlap(d, live):
            errs.append(f'{name}: распаковка затирает живой загрузчик/стек')
        if overlap(d, kept):
            errs.append(f'{name}: распаковка затирает уже распакованное')
        if overlap(d, phys(un_src, stream + 2, un_bank)):
            errs.append(f'{name}: приёмник пересекается с исходным потоком')
        if keep:
            kept.extend(d)

    for page, f, buf in ((0, 6, BUF1), (1, 7, BUF1), (7, 9, BUF1), (6, 13, BUF1), (5, 12, BUF1)):
        step(f'страница {page} (файл {f})', buf, None, f, buf + 2, None, 0xC000, page)
    step('код игры (файл 8) -> страница 2', 0xC000, 3, 8, 0xC002, 3, 0x8000, None)
    for page, f in ((3, 10), (4, 11)):
        step(f'страница {page} (файл {f})', BUF2, None, f, BUF2 + 2, None, 0xC000, page)
    return errs


# ---------------------------------------------------------------- 1. ресурсы
ext_lv = {}


def make_ext():
    """Дополнительные уровни (assets_src/levels_ext/*/script.asm и др.) -> блоки 12608 байт; текст меню выбора набора -> build/data/menu_ext.inc."""
    src = os.path.join(ASRC, 'levels_ext')
    for n in EXT_H + EXT_K:
        ext_lv[n] = levels_tool.import_one(n, src)
        assert len(ext_lv[n]) == levels_tool.BLOCK
    lines = ['; generated by build.py из assets_src/text/menu_ext.txt: текст меню выбора набора миссий (глифы CODE_MAIN, 127 - конец)']
    for ln in open(os.path.join(ASRC, 'text', 'menu_ext.txt'), encoding='utf-8'):
        ln = ln.rstrip('\r\n')
        if not ln.strip() or ln.startswith('#'):
            continue
        name, _, s = ln.partition('=')
        g = text_tool.g_enc_line(s, text_tool.ENC_MAIN, 'menu_ext.txt ' + name) + [127]
        lines.append(f'{name}\tDEFB\t' + ','.join(map(str, g)) + f'\t; {s}')
    wr(os.path.join(DATA, 'menu_ext.inc'), '\n'.join(lines) + '\n')


def make_data():
    make_ext()
    jobs = [(pack, rd(AS, src)) for src in PACKED.values()]
    jobs += [(pack, rd(AS, 'intro', 'flick', f'wani{L.lower()}_{h}.bin')) for L in FLICKS for h in (0, 1)]
    jobs += [(pack_tail, rd(AS, 'data', f'w{n}spr.dat')) for n in range(1, 5)]
    jobs += [(pack_tail, rd(AS, 'data', f)) for f in ('whumbutt.dat', 'worcbutt.dat')]
    jobs += [(pack_tail, rd(AS, 'bobov', m + '.mus')) for m in MUSIC]
    jobs += [(pack_tail, ext_lv[n]) for n in EXT_H + EXT_K]
    jobs += [(pack_tail, rd(ASRC, 'music', 'ext', m + '.mus')) for m in EXT_MUSIC]
    prepack(jobs)
    for out, src in PACKED.items():
        wr(os.path.join(DATA, out), pack(rd(AS, src)))


def build_levels(variant, defs, layout_inc_dir):
    """Блоки уровней (src/levels) -> bytes; 117end/217end зависят от варианта (ONE_DISK) и от loader_layout.inc."""
    res = {}
    out = os.path.join(B, variant, 'levels')
    for name in LEVELS_H + LEVELS_K:
        end = name.endswith('end')
        if not end and variant != 'two':
            res[name] = res_two[name]
            continue
        asm('levels', f'main_{name}.asm', out, incs=[layout_inc_dir], defs=defs if end else ())
        res[name] = rd(out, f'{name}.bin')
    return res


res_two = {}


# ---------------------------------------------------------------- 2. вариант
def build_variant(variant, one):
    vdir = os.path.join(B, variant)
    os.makedirs(vdir, exist_ok=True)
    defs = ['ONE_DISK=1'] if one else []
    label = 'BR1_1MB' if one else 'BR1DISK2'
    dskname = label.ljust(8)
    errors = []

    # --- загрузчик занимает файл br1 сразу после boot: boot - 1 сектор с логического 16, br1 - 17..20
    boot_sec = 16
    ldr_sec = boot_sec + 1
    wr(os.path.join(vdir, 'loader_layout.inc'),
       f'; generated by build.py: where the loader (file br1) is on disk 1 - the ending reads it back\n'
       f'LDR_ADR\tEQU\t#{LDR_ADR:04X}\nLDR_TRK\tEQU\t{ldr_sec // SPT}\nLDR_SEC\tEQU\t{ldr_sec % SPT + 1}\n'
       f'LDR_CNT\tEQU\t{LOADER_SECTORS}\nLDR_FCUT\tEQU\t#{LDR_ADR + 3:04X}\n')
    lv = build_levels(variant, defs, vdir)
    if not one:
        res_two.update(lv)

    prepack([(pack_tail, lv[n]) for n in LEVELS_H + LEVELS_K])
    # --- файлы диска 2: (номер, имя, блок, адрес загрузки, упакован ли)
    res2 = []
    for n in range(1, 5):
        res2.append((n, f'land{n}', pack_tail(rd(AS, 'data', f'w{n}spr.dat')), 0xD000))
    res2.append((6, 'panel', rd(AS, 'data', 'wbar.dat'), 0xA000))
    res2.append((7, 'buthum', pack_tail(rd(AS, 'data', 'whumbutt.dat')), 0xDB01))
    res2.append((8, 'butorc', pack_tail(rd(AS, 'data', 'worcbutt.dat')), 0xDB01))
    for k, m in enumerate(MUSIC):
        res2.append((9 + k, f'mus{k + 1}', pack_tail(rd(AS, 'bobov', m + '.mus')), 0xEC77))
    for k, name in enumerate(LEVELS_H):
        res2.append((18 + k, f'lev{name}'[:8], pack_tail(lv[name]), 0x79C0))
    for k, name in enumerate(LEVELS_K):
        res2.append((36 + k, f'lev{name}'[:8], pack_tail(lv[name]), 0x79C0))
    # дополнительный набор (1999): одним большим блоком (файлы по <=255 секторов), читается по положению; на диске 2
    ext = []
    for k, name in enumerate(EXT_H):
        ext.append((18 + EXTLEV + k, 'x' + name, pack_tail(ext_lv[name]), 0x79C0, ext_lv[name]))
    for k, name in enumerate(EXT_K):
        ext.append((36 + EXTLEV + k, 'x' + name, pack_tail(ext_lv[name]), 0x79C0, ext_lv[name]))
    for k, name in enumerate(EXT_MUSIC):
        raw = rd(ASRC, 'music', 'ext', name + '.mus')
        ext.append((9 + EXTMUS + k, 'x' + name, pack_tail(raw), 0xEC77, raw))
    ext.sort(key=lambda e: e[0])

    disk1 = Trd(label='BR1DISK1' if not one else label, tracks=256 if one else 160)
    disk2 = disk1 if one else Trd(label=label, tracks=160)

    basic = basic_program([(10, 'CLEAR VAL "24575": RANDOMIZE USR VAL "15619": REM : LOAD "br1" CODE'),
                           (20, 'RANDOMIZE USR VAL "24576"')])
    s = disk1.add_file('boot', 'B', basic, start=len(basic), length=len(basic))
    assert s == boot_sec and len(basic) <= 256
    ldr_at = disk1.alloc(LOADER_SECTORS)
    assert ldr_at == ldr_sec
    ldr_entry = len(disk1.files)
    disk1.files.append(None)

    # --- раскладка диска 2 (в варианте "один диск" - сразу после загрузчика)
    tab = {}
    for n, name, data, start in res2:
        s = disk2.add_file(name, 'C', data, start=start)
        tab[n] = (s // SPT, s % SPT + 1, sectors(len(data)))
    blob = b''
    for n, name, data, start, raw in ext:
        tab[n] = None, len(blob) // 256, sectors(len(data))
        blob += data + bytes(-len(data) % 256)
    ext_s0 = None
    for k in range(0, len(blob), 255 * 256):
        s = disk2.add_file(f'ext{k // (255 * 256) + 1}', 'C', blob[k:k + 255 * 256], start=0)
        if ext_s0 is None:
            ext_s0 = s
    for n in tab:
        if tab[n][0] is None:
            s = ext_s0 + tab[n][1]
            tab[n] = (s // SPT, s % SPT + 1, tab[n][2])
    save0 = None
    nslots = SLOTS[one]
    for k in range(nslots):
        s = disk2.add_file(f'save{k + 1}', 'C', bytes(SLOT_SECTORS * 256), start=0x7700)
        if save0 is None:
            save0 = s
    lay = ['; generated by build.py: where the resources of disk 2 and the saved games are',
           '; (RESTAB: logical track, sector 1..16, number of sectors; by file number 1..94)',
           f'NSLOTS\tEQU\t{nslots}\t; slots of the saved games available in the menus',
           f'EXTLEV\tEQU\t{EXTLEV}\t; file number offset of the extra (1999) levels',
           f'EXTMUS\tEQU\t{EXTMUS}\t; file number offset of the extra music',
           f'SAVELIN\tEQU\t{save0}\t; first sector of the slot 0 of the saved games (track*16 + sector-1)',
           f'DSKNAME\tDEFM\t"{dskname}"\t; title of disk 2 (checked in the system sector)', 'RESTAB']
    for n in range(1, NFILES + 1):
        t = tab.get(n, (0, 0, 0))
        nm = next((x[1] for x in res2 + ext if x[0] == n), 'none')
        lay.append(f'\tDEFB\t{t[0]},{t[1]},{t[2]}\t; {n} {nm}')
    wr(os.path.join(vdir, 'disk_layout.inc'), '\n'.join(lay) + '\n')

    # --- игра
    g = asm('game', 'main.asm', os.path.join(vdir, 'game'), incs=[vdir], defs=defs)
    sym = symbols(os.path.join(g, 'main.sym'))
    if sym['SLOTSEC'] != SLOT_SECTORS:
        sys.exit(f"SLOTSEC в disk.asm ({sym['SLOTSEC']}) не равен SLOT_SECTORS в build.py ({SLOT_SECTORS})")
    if sym['NSLOTS'] > 8:
        sys.exit('слотов больше 8: меню рассчитано на 8')
    for n, name, data, start in res2:     # безопасность распаковки "на месте"
        if n in (1, 2, 3, 4):
            e = check_in_place(name, data, 0xD000, len(rd(AS, 'data', f'w{n}spr.dat')), 0x10000, tail=4)
        elif n in (7, 8):
            raw = rd(AS, 'data', 'whumbutt.dat' if n == 7 else 'worcbutt.dat')
            e = check_in_place(name, data, sym['WBUTT'], len(raw), sym['WNAMES'], tail=4)
        elif 9 <= n <= 16:
            e = check_in_place(name, data, sym['WMUSIC'], len(rd(AS, 'bobov', MUSIC[n - 9] + '.mus')), 0x10000, tail=4)
        elif n >= 18:
            lvname = (LEVELS_H + LEVELS_K)[(n - 18) if n < 35 else (n - 36 + 17)]
            e = check_in_place(name, data, 0x79C0, len(lv[lvname]), sym['LVLTOP'] + 1, tail=4)   # поток уровня не должен доходить до таблицы IM2
        else:
            e = None
        if e:
            errors.append(e)
    for n, name, data, start, raw in ext:    # то же для дополнительных уровней и музыки
        if start == 0x79C0:
            e = check_in_place(name, data, 0x79C0, len(raw), sym['LVLTOP'] + 1, tail=4)
        else:
            e = check_in_place(name, data, sym['WMUSIC'], len(raw), 0x10000, tail=4)
        if e:
            errors.append(e)
    pg = {n: rd(g, f'page{n}.bin') for n in range(8)}

    # --- загрузчик (первый проход - размеры), концовка
    fin_dir = asm('final', 'main.asm', os.path.join(vdir, 'final'))
    final = rd(fin_dir, 'final.bin')
    dummy = os.path.join(vdir, 'dummy')
    wr(os.path.join(dummy, 'disk1_layout.inc'), '\tDEFS\t192\n')
    s1 = asm('start1', 'main.asm', os.path.join(vdir, 'start1_pass1'), incs=[dummy])
    b01, b02, b03, b04 = (rd(s1, f'b0{i}.bin') for i in (1, 2, 3, 4))

    prepack([(pack, pg[i]) for i in (0, 1, 3, 4, 5, 6, 7)] + [(pack, pg[2][:0x1000]), (pack, b02), (pack, b03)])
    files1 = {   # номер -> (имя, данные, адрес загрузки)
        1: ('crow', b04, 0xDB00),
        2: ('xlag0', pack(b02), 0xC000),
        3: ('xlag1', pack(b03), 0xC000),
        4: ('intro', b01, 0x6400),
        6: ('g_pg0', pack(pg[0]), 0x7000), 7: ('g_pg1', pack(pg[1]), 0x7000), 8: ('g_pg5', pack(pg[5]), 0x7000),
        9: ('g_pg7', pack(pg[7]), 0x7000), 10: ('g_pg3', pack(pg[3]), 0x7000), 11: ('g_pg4', pack(pg[4]), 0x7000),
        12: ('g_pg2', pack(pg[2][:0x1000]), 0x7000), 13: ('g_pg6', pack(pg[6]), 0x7000),
        15: ('final', final, 0x8000),
    }
    flraw = {}
    for k, L in enumerate(FLICKS):
        for h in (0, 1):
            raw = rd(AS, 'intro', 'flick', f'wani{L.lower()}_{h}.bin')
            n = 16 + k * 2 + h
            files1[n] = (f'fl{L}_{h}', pack(raw), 0xC000)
            flraw[n] = raw
    for n in (2, 3):
        raw = b02 if n == 2 else b03
        e = check_in_place(files1[n][0], files1[n][1], 0xC000, len(raw), 0xFFFF)
        if e:
            errors.append(e)
    for n, raw in flraw.items():
        e = check_in_place(files1[n][0], files1[n][1], 0xC000, len(raw), 0xFFFF)
        if e:
            errors.append(e)
    if sym['LVLTOP'] + 1 > sym['IM2_TAB']:
        errors.append('LVLTOP: поток уровня доходит до таблицы IM2')
    sym1 = symbols(os.path.join(s1, 'main.sym'))
    sizes = {n: (sectors(len(files1[n][1])), struct.unpack('<H', files1[n][1][:2])[0],
                 {6: len(pg[0]), 7: len(pg[1]), 8: len(pg[5]), 9: len(pg[7]), 10: len(pg[3]), 11: len(pg[4]),
                  12: 0x1000, 13: len(pg[6])}[n]) for n in range(6, 14)}
    errors += check_loader(sizes, sym1)
    if errors:
        sys.exit('ОШИБКА упаковки "на месте":\n  ' + '\n  '.join(errors))

    t1 = {}
    for n in sorted(files1):
        name, data, start = files1[n]
        s = disk1.add_file(name, 'C', data, start=start)
        t1[n] = (s % SPT + 1, s // SPT, sectors(len(data)))
        assert t1[n][2] < 256, f'файл {name} длиннее 255 секторов'
    wr(os.path.join(vdir, 'disk1_layout.inc'), '; generated by build.py: files of disk 1 for the loader: sector 1..16, track, number of sectors\n' +
       ''.join(f'\tDEFB\t{t1.get(n, (0, 0, 0))[0]},{t1.get(n, (0, 0, 0))[1]},{t1.get(n, (0, 0, 0))[2]}\t; {n} {files1[n][0] if n in files1 else "none"}\n' for n in range(64)))
    s1 = asm('start1', 'main.asm', os.path.join(vdir, 'start1'), incs=[vdir])
    loader = rd(s1, 'loader.bin')
    assert [rd(s1, f'b0{i}.bin') for i in (1, 2, 3, 4)] == [b01, b02, b03, b04], 'размеры загрузчика изменились между проходами'
    if len(loader) > LOADER_SECTORS * 256:
        sys.exit(f'загрузчик ({len(loader)} байт) не помещается в {LOADER_SECTORS} секторов')
    loader += bytes(LOADER_SECTORS * 256 - len(loader))
    disk1.img[ldr_at * 256:ldr_at * 256 + len(loader)] = loader
    nm = b'br1     C' + struct.pack('<HH', LDR_ADR, len(loader)) + bytes([LOADER_SECTORS, ldr_at % SPT, ldr_at // SPT])
    disk1.files[ldr_entry] = nm

    out = []
    if one:
        disk1.save(os.path.join(B, 'br_1mb.trd'))
        out.append(('br_1mb.trd', disk1, 256 * SPT))
    else:
        disk1.save(os.path.join(B, 'br1.trd'))
        disk2.save(os.path.join(B, 'br2.trd'))
        out += [('br1.trd', disk1, 160 * SPT), ('br2.trd', disk2, 160 * SPT)]
    for name, d, total in out:
        used = (d.next - 16) * 256
        free = (total - d.next) * 256
        print(f'build/{name}: файлов {len(d.files)}, занято {used // 1024} КБ, свободно {free // 1024} КБ')
    return loader


def make_assets():
    """assets_src -> build/assets (tools/assets.py import); пропускается, если ни ресурсы, ни конвертеры не менялись."""
    h = hashlib.sha1()
    conv = ('assets.py', 'gfx.py', 'text.py', 'maps.py', 'zxio.py')
    for base in (ASRC, os.path.join(ROOT, 'tools')):
        for d, _, fs in sorted(os.walk(base)):
            for f in sorted(fs):
                if base == ASRC or (d == base and f in conv):
                    h.update(os.path.relpath(os.path.join(d, f), base).encode())
                    h.update(rd(d, f))
    stamp = os.path.join(AS, '.stamp')
    if os.path.exists(stamp) and open(stamp).read() == h.hexdigest():
        return
    shutil.rmtree(AS, ignore_errors=True)
    assets_tool.do_import(ASRC, AS)
    wr(stamp, h.hexdigest())


def main():
    os.makedirs(B, exist_ok=True)
    make_assets()
    make_data()
    build_variant('two', False)
    build_variant('one', True)
    print('готово: build/br1.trd, build/br2.trd, build/br_1mb.trd')
    return 0


if __name__ == '__main__':
    sys.exit(main())
