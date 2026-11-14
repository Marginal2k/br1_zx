#!/usr/bin/env python3
"""Проверка сквозного круга ресурсов Чёрного Ворона (assets/ <-> assets_src/), побайтно.

    python tools/check_assets.py            # полная проверка, код возврата 0 - всё совпало

Проверки:
  1. assets_src/ (то, что лежит в репозитории) -> import -> сверка со ВСЕМИ файлами assets/ (то, что сейчас читает сборка).
  2. assets/ -> export (во временный каталог) -> import -> сверка с assets/ (круг двоичные -> редактируемые -> двоичные).
  3. Охват: каждый файл, который сборка читает из assets/ (INCBIN в src/ и build.py), создаётся импортом.
  4. Устойчивость цветных экранов: PNG без файла NAME.orig.scr (если его потеряли) даёт то же изображение
     (сравниваются пиксели, не байты).
  5. Дополнительные уровни 1999 г. (reference/cs1999/levels_ext, диск New Missions 1999 г., 34 блока по 12608 байт): блок -> файлы -> блок.
"""
import filecmp
import glob
import os
import re
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import assets
import gfx
import levels
from zxio import ROOT, rd

ASSETS = os.path.join(ROOT, 'archive', 'assets_raw')
SRC = os.path.join(ROOT, 'assets_src')
levels_ref = os.path.join(ROOT, 'reference', 'cs1999', 'levels_ext')


def tree(root):
    out = {}
    for d, _, fs in os.walk(root):
        for f in fs:
            p = os.path.join(d, f)
            out[os.path.relpath(p, root).replace(os.sep, '/')] = p
    return out


def compare(label, built, rows):
    ref = tree(ASSETS)
    got = tree(built)
    bad = []
    for rel in sorted(ref):
        if rel not in got:
            bad.append((rel, 'не создан импортом'))
        elif rd(ref[rel]) != rd(got[rel]):
            a, b = rd(ref[rel]), rd(got[rel])
            n = next((i for i, (x, y) in enumerate(zip(a, b)) if x != y), min(len(a), len(b)))
            bad.append((rel, f'различается (длины {len(a)}/{len(b)}, первое расхождение со смещения {n})'))
    extra = sorted(set(got) - set(ref))
    return bad, extra, len(ref)


def incbin_files():
    """файлы assets/, которые читает сборка: INCBIN в src/ (кроме src/original) + build.py (PACKED, FLICKS, MUSIC, уровни)."""
    need = set()
    for p in glob.glob(os.path.join(ROOT, 'src', '**', '*.asm'), recursive=True):
        if os.sep + 'original' + os.sep in p:
            continue
        for m in re.finditer(r'INCBIN\s+"([^"]+)"', open(p, encoding='utf-8', errors='replace').read()):
            need.add(m.group(1))
    sys.path.insert(0, ROOT)
    import build
    for z, s in build.PACKED.items():
        need.discard(z)
        need.add(s)
    need = {n for n in need if not n.endswith('.zx0')}
    for L in build.FLICKS:
        for h in (0, 1):
            need.add(f'intro/flick/wani{L.lower()}_{h}.bin')
    for m in build.MUSIC:
        need.add(f'bobov/{m}.mus')
    for n in range(1, 5):
        need.add(f'data/w{n}spr.dat')
    need |= {'data/whumbutt.dat', 'data/worcbutt.dat', 'data/wbar.dat'}
    return need


def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    fails = 0
    tmp = tempfile.mkdtemp(prefix='br_assets_')
    try:
        # 1. assets_src -> import -> assets
        if os.path.isdir(SRC):
            out1 = os.path.join(tmp, 'imp_from_src')
            assets.do_import(SRC, out1)
            bad, extra, n = compare('assets_src', out1, None)
            print(f'[1] assets_src -> import -> assets/: {n - len(bad)} из {n} файлов совпали побайтно' + ('' if not bad else f', ОТЛИЧАЮТСЯ {len(bad)}'))
            for rel, why in bad:
                print('    ', rel, why)
            if extra:
                print('     лишние файлы импорта (в assets/ нет):', extra)
            fails += len(bad)
        else:
            print('[1] assets_src/ нет - пропущено')
            fails += 1
        # 2. assets -> export -> import -> assets
        ex = os.path.join(tmp, 'exported')
        assets.do_export(ASSETS, ex)
        out2 = os.path.join(tmp, 'imp_from_export')
        assets.do_import(ex, out2)
        bad, extra, n = compare('export', out2, None)
        print(f'[2] assets/ -> export -> import -> assets/: {n - len(bad)} из {n} файлов совпали побайтно' + ('' if not bad else f', ОТЛИЧАЮТСЯ {len(bad)}'))
        for rel, why in bad:
            print('    ', rel, why)
        fails += len(bad)
        # 3. охват сборки
        made = set(tree(out2))
        miss = sorted(incbin_files() - made)
        print(f'[3] файлов assets/, нужных сборке: {len(incbin_files())}; не создаётся импортом: {len(miss)}')
        for m in miss:
            print('    ', m)
        fails += len(miss)
        # 4. цветные экраны без NAME.orig.scr
        from PIL import Image
        nb = 0
        scrs = sorted(glob.glob(os.path.join(ex, 'gfx', 'screens', 'barkov', '*.png')))
        diff_bytes = 0
        for p in scrs:
            im = Image.open(p)
            raw = Image.new('P', im.size)
            raw.putpalette(im.getpalette())
            raw.putdata(list(im.get_flattened_data() if hasattr(im, 'get_flattened_data') else im.getdata()))
            q = os.path.join(tmp, 'nohint.png')
            raw.save(q)
            back = gfx.scr_color_import(q)
            orig = rd(ASSETS, 'barkov', os.path.basename(p)[:-4] + '.scr')
            if back != orig:
                diff_bytes += 1
            # визуальное равенство
            q2 = os.path.join(tmp, 'again.png')
            gfx.scr_color_export(back, q2)
            a = Image.open(q).convert('RGB').tobytes()
            b = Image.open(q2).convert('RGB').tobytes()
            if a != b:
                nb += 1
                print('     изображение изменилось после круга без служебного блока:', os.path.basename(p))
        print(f'[4] цветные экраны без NAME.orig.scr: {len(scrs) - nb} из {len(scrs)} дают то же изображение '
              f'(байты .scr совпадают у {len(scrs) - diff_bytes}: остальные отличаются только невидимым - выбором ink/paper в однотонных ячейках)')
        fails += nb
        # 5. дополнительные уровни 1999 г. (reference/cs1999): блок -> файлы -> блок
        ref = levels.names(levels_ref)
        if ref:
            ex5 = os.path.join(tmp, 'ext')
            for n in ref:
                levels.export_one(n, rd(levels_ref, n + '.bin'), ex5)
            parsed = sum(1 for n in ref if os.path.isdir(os.path.join(ex5, n)))
            bad5 = [n for n in ref if levels.import_one(n, ex5, orig=True) != rd(levels_ref, n + '.bin')]
            lx = os.path.join(SRC, 'levels_ext')
            bad6 = []
            if os.path.isdir(lx):
                bad6 = [n for n in ref if levels.import_one(n, lx, orig=True) != rd(levels_ref, n + '.bin')]
            # очищенные блоки: отличаются от LW только кодом задания (#7A6B..#7A9F) и только у блоков с защитой
            cleaned, bad7 = [], []
            for n in ref:
                if not os.path.isdir(os.path.join(lx, n)):
                    continue
                a, b = rd(levels_ref, n + '.bin'), levels.import_one(n, lx)
                diff = [k for k in range(len(a)) if a[k] != b[k]]
                if diff:
                    cleaned.append(n)
                    if not (min(diff) >= 171 and max(diff) < 224 and levels.levasm.has_probe(a[:1104]) and not levels.levasm.has_probe(b[:1104])):
                        bad7.append(n)
            print(f'[5] доп. уровни 1999 г.: {len(ref) - len(bad5)} из {len(ref)} блоков (12608 байт) круг export->import (script.orig.asm) побайтно; '
                  f'из assets_src/levels_ext: {len(ref) - len(bad6)} из {len(ref)}; разобраны на карту/героев/параметры/текст/экран: {parsed}, как есть: {len(ref) - parsed}')
            print(f'[6] очищенные от защиты TST блоки (script.asm): {len(cleaned)} ({", ".join(cleaned)}); отличие от LW только в #7A6B..#7A9F: {"да" if not bad7 else "НЕТ " + str(bad7)}')
            for n in bad5 + bad6 + bad7:
                print('    ', n)
            fails += len(bad7)
            fails += len(bad5) + len(bad6)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print('ИТОГ:', 'ВСЁ СОВПАДАЕТ' if not fails else f'ЕСТЬ РАСХОЖДЕНИЯ ({fails})')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
