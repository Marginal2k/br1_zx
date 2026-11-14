#!/usr/bin/env python3
"""Блоки дополнительных уровней 1999 г. (12608 байт, LEVDAT=#79C0) <-> редактируемые файлы.

Блок: [0..1104) параметры + код задания | [1104..1600) герои | [1600..5696) карта | [5696..12608) экран .scr.
В assets_src/levels_ext/<имя>/:
  script.asm       параметры и код задания, читаемый исходник sjasmplus (tools/levasm.py); для 6 блоков с защитой (TST) - ОЧИЩЕННЫЙ;
  script.orig.asm  (только у этих 6) то же, но точно как в LW (с защитой) - собирается в исходные байты, нужен для проверки;
  task.txt         три строки задания (+ хвост старого текста в комментарии), собирается в task.bin для INCBIN из script.asm;
  map.csv, heroes.txt, screen.png (+screen.orig.scr), preview.png (только просмотр).
Блоки концовок *_17e (код) и испорченный kung_11 лежат как есть (NAME.bin).

    python tools/levels.py export [--ref reference/cs1999/levels_ext] [--out assets_src/levels_ext] [--force]
    python tools/levels.py import [--src assets_src/levels_ext] [--out build/levels_ext]   # блоки 12608 байт (с очисткой от защиты)
"""
import argparse
import glob
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gfx
import levasm
import maps
import text as T
from zxio import ROOT, rd, rdtext, wr

BLOCK = 12608
OFF_HER, OFF_MAP, OFF_SCR = 1104, 1600, 5696
OFF_TASK, TASK_LEN = 37, 63


def is_data_block(b):
    if len(b) != BLOCK or b[0] != 0xC9:
        return False
    try:
        maps.her_to_txt(b[OFF_HER:OFF_MAP])
        task_decode(b[OFF_TASK:OFF_TASK + TASK_LEN])
    except ValueError:
        return False
    return True


def task_decode(region):
    """63 байта задания доп. уровня: три строки переменной длины, каждая кончается кодом 127; дальше - остаток старого текста
    (игра его не читает; нужен только для точной копии). -> (текст: три строки '|...|' и комментарий с хвостом, хвост)."""
    ends = [i for i, b in enumerate(region) if b == T.END_CODE]
    if len(ends) < 3:
        raise ValueError('в задании меньше трёх строк')
    lines, pos = [], 0
    for e in ends[:3]:
        lines.append('|' + ''.join(T.g_dec(g, T.ENC_MAIN, T.CODE_MAIN) for g in region[pos:e]) + '|')
        pos = e + 1
    tail = bytes(region[pos:])
    lines.append('; хвост (остаток старого текста за третьей строкой, игра не читает): ' + (' '.join(str(v) for v in tail) or '-'))
    return chr(10).join(lines) + chr(10), tail


def task_encode(text):
    rows, tail = [], b''
    for ln in text.replace(chr(13), '').split(chr(10)):
        if ln.startswith(';'):
            m = re.search(r':\s*([\d\s-]+)$', ln)
            if m and 'хвост' in ln:
                tail = bytes(int(x) for x in m.group(1).split() if x != '-')
            continue
        if ln.strip():
            rows.append(ln)
    if len(rows) != 3 or not all(r.startswith('|') and r.endswith('|') for r in rows):
        raise ValueError('task.txt: нужно три строки |...|')
    out = bytearray()
    for r in rows:
        out += bytes(T.g_enc_line(r[1:-1], T.ENC_MAIN, 'task.txt')) + bytes([T.END_CODE])
    if len(out) > TASK_LEN:
        raise ValueError('task.txt: текст задания длиннее 63 байт (с признаками конца строк)')
    return bytes(out) + (tail + bytes(TASK_LEN))[:TASK_LEN - len(out)]


def split(b):
    return dict(script=b[:OFF_HER], her=b[OFF_HER:OFF_MAP], map=b[OFF_MAP:OFF_SCR], scr=b[OFF_SCR:])


def export_one(name, b, out, assets=os.path.join(ROOT, 'archive', 'assets_raw')):
    d = os.path.join(out, name)
    if not is_data_block(b):
        wr(os.path.join(out, name + '.bin'), b)
        return 'как есть'
    p = split(b)
    probe = levasm.has_probe(p['script'])
    wr(os.path.join(d, 'script.asm'), levasm.to_asm(levasm.clean(p['script']) if probe else p['script'], name))
    if probe:
        wr(os.path.join(d, 'script.orig.asm'), levasm.to_asm(p['script'], name + ' (как в LW, с защитой TST)'))
    wr(os.path.join(d, 'task.txt'), task_decode(b[OFF_TASK:OFF_TASK + TASK_LEN])[0])
    wr(os.path.join(d, 'map.csv'), maps.map_to_csv(p['map']))
    wr(os.path.join(d, 'heroes.txt'), maps.her_to_txt(p['her']))
    gfx.scr_color_export(p['scr'], os.path.join(d, 'screen.png'))
    land = b[107]
    spr = {n: rd(assets, 'data', n + '.dat') for n in ('wshum', 'wsorc', 'wscreat1', 'wscreat2')}
    maps.render_preview(p['map'], p['her'], rd(assets, 'data', 'w%dspr.dat' % land), spr, os.path.join(d, 'preview.png'))
    return 'разобран, защита убрана' if probe else 'разобран'


def import_one(name, src, orig=False):
    """блок 12608 байт. orig=True - из script.orig.asm (точно как в LW), иначе из script.asm (очищенный)."""
    d = os.path.join(src, name)
    if not os.path.isdir(d):
        return rd(src, name + '.bin')
    asm = os.path.join(d, 'script.orig.asm' if orig and os.path.exists(os.path.join(d, 'script.orig.asm')) else 'script.asm')
    task = task_encode(rdtext(os.path.join(d, 'task.txt')))
    script = levasm.build(asm, task)
    b = script + maps.txt_to_her(rdtext(os.path.join(d, 'heroes.txt'))) + maps.csv_to_map(rdtext(os.path.join(d, 'map.csv'))) \
        + gfx.scr_color_import(os.path.join(d, 'screen.png'))
    assert len(b) == BLOCK, len(b)
    return b


def names(ref):
    return sorted(os.path.basename(p)[:-4] for p in glob.glob(os.path.join(ref, '*.bin')))


def names_src(src):
    return sorted({os.path.basename(p)[:-4] if p.endswith('.bin') else os.path.basename(p) for p in glob.glob(os.path.join(src, '*'))
                   if os.path.isdir(p) or p.endswith('.bin')})


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('cmd', choices=['export', 'import'])
    ap.add_argument('--ref', default=os.path.join(ROOT, 'reference', 'cs1999', 'levels_ext'))
    ap.add_argument('--src', default=os.path.join(ROOT, 'assets_src', 'levels_ext'))
    ap.add_argument('--out')
    ap.add_argument('--force', action='store_true', help='export: перезаписать существующие (правки в script.asm пропадут!)')
    a = ap.parse_args()
    if a.cmd == 'export':
        out = a.out or a.src
        for n in names(a.ref):
            if (os.path.isdir(os.path.join(out, n)) or os.path.exists(os.path.join(out, n + '.bin'))) and not a.force:
                print(n, 'уже есть, пропущен (--force - перезаписать)')
                continue
            print(n, export_one(n, rd(a.ref, n + '.bin'), out))
    else:
        out = a.out or os.path.join(ROOT, 'build', 'levels_ext')
        for n in names_src(a.src):
            wr(os.path.join(out, n + '.bin'), import_one(n, a.src))
        print('блоки записаны в', out)
    return 0


if __name__ == '__main__':
    sys.exit(main())
