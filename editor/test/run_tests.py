#!/usr/bin/env python3
"""Проверка редактора уровней: круг "открыть -> сохранить" побайтно и приём результата игровыми инструментами.

    python editor/test/run_tests.py

1. Входы: все блоки reference/cs1999/levels_ext/*.bin и 32 уровня 1997 г., собранные из src/levels + assets_src (sjasmplus);
   каталоги assets_src/levels_ext/<имя>/ и блоки, которые из них собирает tools/levels.py.
2. node editor/test/roundtrip.js - модель редактора (editor/js/core.js): блок -> уровень -> блок, проект JSON, экспорт в каталог и обратно,
   открытие каталогов assets_src, правки.
3. python tools/levels.py import --src <экспорт редактора> --out <tmp>: каждый блок должен совпасть с исходным (и для правленых - с блоком JS).
Код возврата 0 - всё совпало. Ничего вне временного каталога не пишется.
"""
import os
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'tools'))
import brlib  # noqa: E402
from brlib import ROOT, ED, levels  # noqa: E402


def main():
    brlib.utf8_stdout()
    work = tempfile.mkdtemp(prefix='bred_test_')
    fails = 0
    try:
        os.makedirs(os.path.join(work, 'in'))
        inputs = {}
        for n, b in brlib.ref_blocks().items():
            inputs[n] = b
        for n in brlib.LEVELS97:
            inputs['w' + n] = brlib.build97(n)
        for n, b in inputs.items():
            open(os.path.join(work, 'in', n + '.bin'), 'wb').write(b)
        print(f'входных блоков: {len(inputs)} (1999: {len(inputs) - len(brlib.LEVELS97)}, 1997: {len(brlib.LEVELS97)})')
        src = os.path.join(ROOT, 'assets_src', 'levels_ext')
        os.makedirs(os.path.join(work, 'expect'))
        for n in levels.names_src(src):
            d = os.path.join(src, n)
            if os.path.isdir(d):
                shutil.copytree(d, os.path.join(work, 'src', n))
                open(os.path.join(work, 'expect', n + '.bin'), 'wb').write(levels.import_one(n, src))

        print('--- node editor/test/roundtrip.js')
        r = subprocess.run(['node', os.path.join(ED, 'test', 'roundtrip.js'), work])
        if r.returncode:
            fails += 1

        print('--- tools/levels.py import для каталогов, записанных редактором')
        for sub, ref in (('out', lambda n: inputs[n]), ('edit', lambda n: open(os.path.join(work, 'edit_js', n + '.bin'), 'rb').read())):
            outb = os.path.join(work, sub + '_py')
            r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'levels.py'), 'import', '--src', os.path.join(work, sub), '--out', outb],
                               capture_output=True, text=True, encoding='utf-8')
            if r.returncode:
                print('ОШИБКА levels.py import:', r.stdout, r.stderr)
                fails += 1
                continue
            names = sorted(f[:-4] for f in os.listdir(outb))
            bad = [n for n in names if open(os.path.join(outb, n + '.bin'), 'rb').read() != ref(n)]
            print(f'{sub}: {len(names)} блоков собрано tools/levels.py, расхождений: {len(bad)}', bad or '')
            if sub == 'out' and len(names) != len(inputs):
                print('ОШИБКА: собрано не столько блоков, сколько было на входе')
                fails += 1
            fails += len(bad)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    print('ИТОГ:', 'ВСЁ СОВПАДАЕТ' if not fails else f'ОШИБОК: {fails}')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
