#!/usr/bin/env python3
"""Ресурсы Чёрного Ворона: двоичные (assets/) <-> редактируемые (assets_src/: PNG, UTF-8 .txt, CSV).

    python tools/assets.py export [--assets assets] [--out assets_src]   # двоичные -> редактируемые (разово или для проверки)
    python tools/assets.py import [--src assets_src] [--out build/assets] # редактируемые -> ровно те двоичные, что нужны сборке
    python tools/assets.py list                                            # что во что превращается

Конвертеры - tools/gfx.py (графика), tools/text.py (тексты), tools/maps.py (карты и герои); формат - docs/FORMATS.md.
"""
import argparse
import glob
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gfx
import maps
import text as T
import zxio
from zxio import ROOT, rd, rdtext, wr

FLICK_LETTERS = '2 3 4 5 6 7 8 9 a b c d e f g h i j u v w x y z'.split()
INSTR_PICS = ['winstr0', 'winstr1', 'winstr2']
INTRO_SCREENS = ['wxlag', 'winflick', 'winvict']
MUSIC_EXTRA = ['intro/forgivme.mus', 'intro/jammy45.bin']
FONTS = [('wnf1', 16, 96), ('wnf2', 12, 12)]          # имя, глифов в строке PNG, число глифов


class Item:
    """группа ресурсов: имя, список двоичных файлов (относительно assets/), экспорт, импорт."""

    def __init__(self, name, files, exp, imp):
        self.name, self.files, self.exp, self.imp = name, files, exp, imp


def _names(pattern):
    return sorted(os.path.basename(p).rsplit('.', 1)[0].replace('.her', '') for p in glob.glob(pattern))


def catalog(assets=None, src=None):
    """перечень ресурсов, переменных по составу (экраны, задания, карты, музыка): из assets/ или из assets_src/."""
    if assets:
        return dict(scr=_names(os.path.join(assets, 'barkov', '*.scr')), tsk=_names(os.path.join(assets, 'task', '*.tsk')),
                    mp=_names(os.path.join(assets, 'map', '*.map')),
                    mus=['bobov/' + os.path.basename(p) for p in sorted(glob.glob(os.path.join(assets, 'bobov', '*.mus')))] + MUSIC_EXTRA)
    import re
    tasks = re.findall(r'^\[(\w+)\]', rdtext(os.path.join(src, 'text', 'tasks.txt')), re.M)
    return dict(scr=_names(os.path.join(src, 'gfx', 'screens', 'barkov', '*.png')), tsk=sorted(tasks),
                mp=sorted(os.path.basename(p)[:-4] for p in glob.glob(os.path.join(src, 'maps', '*.csv'))),
                mus=['bobov/' + os.path.basename(p) for p in sorted(glob.glob(os.path.join(src, 'music', 'bobov', '*.mus')))] + MUSIC_EXTRA)


def items(cat):
    """список Item для перечня cat (см. catalog)."""
    it = []
    scr, tsk, mp, MUSIC_FILES = cat['scr'], cat['tsk'], cat['mp'], cat['mus']

    # --- экраны .scr (цветные)
    it.append(Item('экраны barkov (цветные)', [f'barkov/{n}.scr' for n in scr],
                   lambda a, s: [gfx.scr_color_export(rd(a, 'barkov', n + '.scr'), os.path.join(s, 'gfx', 'screens', 'barkov', n + '.png')) for n in scr],
                   lambda s, o: [wr(os.path.join(o, 'barkov', n + '.scr'), gfx.scr_color_import(os.path.join(s, 'gfx', 'screens', 'barkov', n + '.png'))) for n in scr]))
    # --- чёрно-белые экраны 6144
    bw = [('intro', n, f'intro/{n}.bin') for n in INTRO_SCREENS] + [('instr', n, f'data/{n}.bin') for n in INSTR_PICS]
    it.append(Item('экраны интро/инструкции (ч/б)', [b[2] for b in bw],
                   lambda a, s: [gfx.scr_bw_export(rd(a, b[2]), os.path.join(s, 'gfx', 'screens', b[0], b[1] + '.png')) for b in bw],
                   lambda s, o: [wr(os.path.join(o, b[2]), gfx.scr_bw_import(os.path.join(s, 'gfx', 'screens', b[0], b[1] + '.png'))) for b in bw]))
    # --- листы ландшафта, героев, кнопок, панели
    for fam in gfx.all_families():
        files = ['data/' + d for d in fam[1]]
        it.append(Item('листы: ' + fam[0], files,
                       (lambda f: lambda a, s: gfx.export_family(f, os.path.join(a, 'data'), s))(fam),
                       (lambda f: lambda s, o: gfx.import_family(f, s, os.path.join(o, 'data')))(fam)))
    # --- шрифты инструкции
    it.append(Item('шрифты инструкции', [f'data/{n}.fnt' for n, _, _ in FONTS],
                   lambda a, s: [gfx.font8_export(rd(a, 'data', n + '.fnt'), c, os.path.join(s, 'gfx', 'fonts', n + '.png')) for n, c, _ in FONTS],
                   lambda s, o: [wr(os.path.join(o, 'data', n + '.fnt'),
                                    gfx.font8_import(os.path.join(s, 'gfx', 'fonts', n + '.png'), g, c)) for n, c, g in FONTS]))
    # --- кадры заставки интро и ролики
    it.append(Item('кадры интро (xlag_bl)', [f'intro/xlag_bl{n}.dat' for n in (0, 1)],
                   lambda a, s: [gfx.xlag_export(n, rd(a, 'intro', f'xlag_bl{n}.dat'), s) for n in (0, 1)],
                   lambda s, o: [wr(os.path.join(o, 'intro', f'xlag_bl{n}.dat'), gfx.xlag_import(n, s)) for n in (0, 1)]))

    def fl_exp(a, s):
        for L in FLICK_LETTERS:
            gfx.flick_export(L, rd(a, 'intro', 'flick', f'wani{L}_0.bin'), rd(a, 'intro', 'flick', f'wani{L}_1.bin'), s)

    def fl_imp(s, o):
        for L in FLICK_LETTERS:
            d0, d1 = gfx.flick_import(L, s)
            wr(os.path.join(o, 'intro', 'flick', f'wani{L}_0.bin'), d0)
            wr(os.path.join(o, 'intro', 'flick', f'wani{L}_1.bin'), d1)

    it.append(Item('кадры роликов (flick)', [f'intro/flick/wani{L}_{h}.bin' for L in FLICK_LETTERS for h in (0, 1)], fl_exp, fl_imp))

    # --- тексты
    tdir = lambda s, n: os.path.join(s, 'text', n)
    it.append(Item('текст роликов', ['data/wflictxt.bin'],
                   lambda a, s: wr(tdir(s, 'flick.txt'), T.flick_decode(rd(a, 'data', 'wflictxt.bin'))),
                   lambda s, o: wr(os.path.join(o, 'data', 'wflictxt.bin'), T.flick_encode(rdtext(tdir(s, 'flick.txt'))))))
    for race, f in (('human', 'wvicthum'), ('orc', 'wvictorc')):
        it.append(Item('титры победы ' + race, [f'data/{f}.dat'],
                       (lambda r, f: lambda a, s: wr(tdir(s, f'victory_{r}.txt'), T.scroll_decode(rd(a, 'data', f + '.dat'))))(race, f),
                       (lambda r, f: lambda s, o: wr(os.path.join(o, 'data', f + '.dat'), T.scroll_encode(rdtext(tdir(s, f'victory_{r}.txt')))))(race, f)))

    def tk_exp(a, s):
        wr(tdir(s, 'tasks.txt'), T.tasks_decode([(n, rd(a, 'task', n + '.tsk')) for n in tsk]))

    def tk_imp(s, o):
        res = T.tasks_encode(rdtext(tdir(s, 'tasks.txt')))
        if sorted(res) != tsk:
            raise ValueError('tasks.txt: набор заданий %s не совпадает с нужным %s' % (sorted(set(res) ^ set(tsk)), tsk[:2]))
        for n, d in res.items():
            wr(os.path.join(o, 'task', n + '.tsk'), d)

    it.append(Item('тексты заданий', [f'task/{n}.tsk' for n in tsk], tk_exp, tk_imp))
    it.append(Item('инструкция', ['data/winstr.dat', 'data/winstrcm.dat'],
                   lambda a, s: wr(tdir(s, 'instr.txt'), T.instr_decode(rd(a, 'data', 'winstr.dat'), rd(a, 'data', 'winstrcm.dat'))),
                   lambda s, o: [wr(os.path.join(o, 'data', n), d) for n, d in zip(('winstr.dat', 'winstrcm.dat'), T.instr_encode(rdtext(tdir(s, 'instr.txt'))))]))

    # --- карты и герои

    def mp_exp(a, s):
        for n in mp:
            m, h = rd(a, 'map', n + '.map'), rd(a, 'map', n + '.her')
            wr(os.path.join(s, 'maps', n + '.csv'), maps.map_to_csv(m))
            wr(os.path.join(s, 'maps', n + '.her.txt'), maps.her_to_txt(h))
        preview(a, s)

    def mp_imp(s, o):
        for n in mp:
            wr(os.path.join(o, 'map', n + '.map'), maps.csv_to_map(rdtext(os.path.join(s, 'maps', n + '.csv'))))
            wr(os.path.join(o, 'map', n + '.her'), maps.txt_to_her(rdtext(os.path.join(s, 'maps', n + '.her.txt'))))

    it.append(Item('карты и герои', [f'map/{n}.{e}' for n in mp for e in ('map', 'her')], mp_exp, mp_imp))
    # --- музыка (двоичная, без изменений)
    it.append(Item('музыка (без изменений)', MUSIC_FILES,
                   lambda a, s: [wr(os.path.join(s, 'music', f), rd(a, f)) for f in MUSIC_FILES],
                   lambda s, o: [wr(os.path.join(o, f), rd(s, 'music', f)) for f in MUSIC_FILES]))
    return it


def preview(assets, src):
    """PNG-предпросмотры карт (maps/NAME.png) - только из карт/героев/ландшафта; в импорте не участвуют."""
    sprites = {n: rd(assets, 'data', n + '.dat') for n in ('wshum', 'wsorc', 'wscreat1', 'wscreat2')}
    lands = {}
    for p in sorted(glob.glob(os.path.join(assets, 'map', '*.map'))):
        n = os.path.basename(p)[:-4]
        l = maps.land_of(n)
        if l not in lands:
            lands[l] = rd(assets, 'data', f'w{l}spr.dat')
        maps.render_preview(rd(p), rd(assets, 'map', n + '.her'), lands[l], sprites, os.path.join(src, 'maps', n + '.png'))


def do_export(assets, out):
    for it in items(catalog(assets=assets)):
        it.exp(assets, out)


def do_import(src, out):
    for it in items(catalog(src=src)):
        it.imp(src, out)


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('cmd', choices=['export', 'import', 'list', 'preview'])
    ap.add_argument('--assets', default=os.path.join(ROOT, 'archive', 'assets_raw'), help='каталог двоичных ресурсов (export: источник)')
    ap.add_argument('--src', default=os.path.join(ROOT, 'assets_src'), help='каталог редактируемых ресурсов (import: источник)')
    ap.add_argument('--out', help='export: куда писать редактируемые (по умолчанию --src); import: куда писать двоичные (по умолчанию build/assets)')
    a = ap.parse_args()
    if a.cmd == 'export':
        do_export(a.assets, a.out or a.src)
        print('assets_src обновлён:', a.out or a.src)
    elif a.cmd == 'import':
        out = a.out or os.path.join(ROOT, 'build', 'assets')
        do_import(a.src, out)
        print('двоичные ресурсы записаны в', out)
    elif a.cmd == 'preview':
        preview(a.assets, a.out or a.src)
    else:
        for it in items(catalog(assets=a.assets)):
            print('%-34s %3d файл(ов): %s%s' % (it.name, len(it.files), it.files[0], ' ...' if len(it.files) > 1 else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
