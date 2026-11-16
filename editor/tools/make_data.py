#!/usr/bin/env python3
"""Данные для веб-редактора уровней: графика игры, таблица глифов, библиотека сценариев -> editor/data/brdata.js.

    python editor/tools/make_data.py

Источники - только assets_src/ и src/levels/ (на чтение; ресурсы собираются во временный каталог, build/ не трогается).
brdata.js - обычный JS-файл (window.BR_DATA = {...}), чтобы index.html работал и при открытии с диска (file://).
Перезапускать после правок графики ландшафта/героев/шрифта или сценариев уровней в assets_src.
"""
import base64
import json
import os
import random
import re
import sys

import brlib
from brlib import ROOT, ED, levels, levasm

sys.path.insert(0, os.path.join(ROOT, 'tools'))
import text as T  # noqa: E402


SAMPLES = 5       # сколько уровней каждого набора (1997, 1999) встроить целиком
SEED = 1997


def b64(b):
    return base64.b64encode(bytes(b)).decode('ascii')


def main():
    brlib.utf8_stdout()
    a = brlib.assets_dir()
    rd = lambda *p: open(os.path.join(a, *p), 'rb').read()
    data = {
        'land': {str(n): b64(rd('data', f'w{n}spr.dat')) for n in range(1, 5)},
        'sprites': {n: b64(rd('data', n + '.dat')) for n in ('wshum', 'wsorc', 'wscreat1', 'wscreat2')},
        'font': b64(rd('data', 'wfont.fnt')),
        'codeMain': list(T.CODE_MAIN),
        'library': [],
        'samples': [],
    }
    lib = data['library']
    blocks = {}
    # 1997: блоки собираются из src/levels/main_NNN.asm, текст script.asm - как сделал бы tools/levels.py export
    for n in brlib.LEVELS97:
        b = brlib.build97(n)
        blocks['w' + n] = ('1997', b)
        lib.append(dict(name='w' + n, set='1997', script=b64(b[:levels.OFF_HER]), asm=levasm.to_asm(b[:levels.OFF_HER], 'w' + n),
                        task=levels.task_decode(b[levels.OFF_TASK:levels.OFF_TASK + levels.TASK_LEN])[0]))
    # 1999: assets_src/levels_ext/<имя>/ (уже очищенные от защиты script.asm)
    src = os.path.join(ROOT, 'assets_src', 'levels_ext')
    for n in levels.names_src(src):
        d = os.path.join(src, n)
        if not os.path.isdir(d):
            continue
        b = levels.import_one(n, src)
        blocks[n] = ('1999', b)
        lib.append(dict(name=n, set='1999', script=b64(b[:levels.OFF_HER]), asm=open(os.path.join(d, 'script.asm'), encoding='utf-8').read(),
                        task=open(os.path.join(d, 'task.txt'), encoding='utf-8').read()))
        if os.path.exists(os.path.join(d, 'script.orig.asm')):     # вариант с защитой TST - только для узнавания кода (в списке не показывается)
            b = levels.import_one(n, src, orig=True)
            lib.append(dict(name=n + ' (с защитой TST)', set='1999', hidden=True, script=b64(b[:levels.OFF_HER]),
                            asm=open(os.path.join(d, 'script.orig.asm'), encoding='utf-8').read(), task=''))
    # уровни игры целиком, чтобы их можно было открыть без файлов игры (публичная версия):
    # SAMPLES случайных уровней 1997 г. и столько же 1999 г.; зерно постоянное - при пересоздании те же уровни
    rnd = random.Random(SEED)
    for st in ('1997', '1999'):
        for n in sorted(rnd.sample(sorted(k for k, v in blocks.items() if v[0] == st), SAMPLES)):
            b = blocks[n][1]
            txt = levels.task_decode(b[levels.OFF_TASK:levels.OFF_TASK + levels.TASK_LEN])[0]
            title = ' '.join(' '.join(l.strip('|') for l in txt.splitlines() if l.startswith('|')).split())
            title = re.sub(r'(\w)- (\w)', r'\1\2', title)     # перенос слова по строкам задания
            data['samples'].append(dict(name=n, set=st, title=title, block=b64(b)))
    out = os.path.join(ED, 'data', 'brdata.js')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write('// создано editor/tools/make_data.py - не править вручную\nwindow.BR_DATA = ')
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
    print('записан', out, os.path.getsize(out), 'байт;', len(lib), 'сценариев в библиотеке; уровни:', ', '.join(x['name'] for x in data['samples']))


if __name__ == '__main__':
    main()
