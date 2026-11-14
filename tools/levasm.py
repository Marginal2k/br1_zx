#!/usr/bin/env python3
"""Блок "параметры + код задания" (первые 1104 байта блока уровня, #79C0..#7E0F) <-> читаемый исходник sjasmplus.

Раскладка (как src/levels/w_101.asm): #79C0 параметры и переменные уровня (имена - HEADER), #79E5 TASK_M (63 байта, INCBIN task.bin),
#7A6B pcLOOP (переход на _cLOOP), #7A6D pcINI, дальше код задания до #7AA0 (не больше 53 байт), заполнитель #27, нули (рабочие
массивы BULL, MINE, ... в файле нулевые), #7E00 datMIN (8 слов - золото шахт /100), #7E10 datHER (герои - в блоке следом).
Дизассемблирование - tools/disasm.py (рекурсивный спуск; собирается обратно побайтно, проверяется sjasmplus).
"""
import os
import re
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import disasm

LEVDAT = 0x79C0
OFF_CODE = 0xAB          # pcLOOP = #7A6B
OFF_BULL = 0xE0          # BULL = #7AA0: сюда код не должен заходить
OFF_MIN = 0x440          # datMIN = #7E00
OFF_TASK, TASK_LEN = 37, 63
SCRIPT_LEN = 1104

# (смещение, имя, слов?) - порядок и имена как в w_101.asm
HEADER = [(0, 'isRUNL', 0), (1, 'hTOWER', 0), (2, 'hARC', 0), (3, 'hHORSE', 0), (4, 'hSHILD', 0), (5, 'hBLADE', 0), (6, 'hmaxC', 0), (7, 'hmaxW', 0),
          (8, 'hmaxB1', 0), (9, 'hmaxB2', 0), (10, 'hWALL', 0), (11, 'kTOWER', 0), (12, 'kARC', 0), (13, 'kHORSE', 0), (14, 'kSHILD', 0),
          (15, 'kBLADE', 0), (16, 'kmaxC', 0), (17, 'kmaxW', 0), (18, 'levMAX', 0), (19, 'levDEL', 0), (20, 'lev1ST', 0), (21, 'levTYP', 0),
          (22, 'COLOR', 0), (23, 'MASTER', 0), (24, 'LEVEL', 0), (25, 'MONEY', 0), (31, 'WOOD', 0), (37, 'TASK_M', 0), (100, 'LEVRES', 0),
          (107, 'fsLAND', 0), (108, 'fsMUS', 0), (109, 'SEL_T', 0), (110, 'SEL_N', 0), (116, 'sel_en', 0), (117, 'sel_ti', 0), (118, 'LED', 0),
          (124, '_msg', 0), (125, 'pTX_AD', 1), (127, 'TX_AD', 1), (129, 'pTXdel', 0), (130, 'isPLAT', 0), (131, 'szPLAT', 0), (132, 'bcPLAT', 1),
          (134, 'adPLAT', 1), (136, 'waPLAT', 0), (137, 'onPAUS', 0), (138, 'NOTA', 1), (140, 'se', 1), (142, 'levSND', 0), (143, 'sIY56', 1),
          (145, 'priv_S', 0), (146, 'NOTA2', 1), (148, 'priv_2', 0), (149, 'pntX', 0), (150, 'pntY', 0), (151, 'pntNUM', 0), (152, 'pntDEL', 0),
          (153, 'pntTAR', 0), (154, 'pntUNI', 0), (155, 'pntEN', 0), (161, 'pntMAN', 0), (162, 'END_1', 0), (163, 'END_2', 0), (164, 'TheEND', 0),
          (165, 'dummy', 0)]
COMMENT = {'isRUNL': '#C9 - обычный уровень', 'hTOWER': 'макс. число типов вооружения (1-4)', 'hmaxC': 'число исследуемых заклинаний священника',
           'hmaxW': 'то же волшебника', 'hmaxB1': 'макс. число стандартных зданий', 'hmaxB2': 'макс. число доп. зданий', 'hWALL': '0/17 - можно/нельзя строить стены',
           'kTOWER': 'параметры компьютера', 'levMAX': 'макс. народу в группе врага', 'levDEL': 'средняя задержка между сборами врага',
           'lev1ST': 'начальная задержка первого сбора', 'levTYP': 'тип уровня (0 - обычный)', 'COLOR': 'цвет поля', 'MASTER': 'кто играет: 0 люди, 1 кунги',
           'LEVEL': 'номер уровня', 'MONEY': 'деньги (6 цифр)', 'WOOD': 'лес (6 цифр)', 'TASK_M': 'задание: 3 строки (см. task.txt)',
           'LEVRES': 'текущее время прохождения', 'fsLAND': 'ландшафт 1-4', 'fsMUS': 'мелодия 0-7', 'END_1': '0/1/2 - нет/нет врагов/нет людей',
           'TheEND': '0/1/2 - нет/победа людей/победа врагов (ставит _cLOOP)', 'dummy': 'резерв'}
GAME_EQU = {0x7AA0: 'BULL', 0x7BC0: 'MINE', 0x7C00: 'HBUILD', 0x7D00: 'KBUILD', 0x7E00: 'BUF512', 0x8000: 'MAP', 0x9000: 'MAP2', 0xA000: 'DSCR',
            0xB800: 'HUMAN', 0xBB00: 'KUNGE', 0xBF10: 'SLAVE'}
PROBE_CLEAN = bytes([0x18, 0x01, 0xC9, 0x3A, 0x62, 0x7A, 0x32, 0x64, 0x7A, 0xC9])      # JR +1 / RET / LD A,(END_1) / LD (TheEND),A / RET
PROBE_SIG = bytes.fromhex('116d7abe')


def has_probe(script):
    """защита TST: pcINI считает сумму памяти и сверяет с байтом игры; при несовпадении через ~175 кадров RST #38."""
    return PROBE_SIG in script[OFF_CODE:OFF_BULL] and script[OFF_CODE] == 0x18 and script[OFF_CODE + 2] == 0xAF


def clean(script):
    """убрать защиту: pcINI = RET, _cLOOP - как у обычного уровня (и в src/levels/w_104.asm и др.): игра ведёт себя так, будто проверка пройдена."""
    s = bytearray(script)
    s[OFF_CODE:OFF_BULL] = PROBE_CLEAN + bytes([0x27]) * (OFF_BULL - OFF_CODE - len(PROBE_CLEAN))
    return bytes(s)


def _runs(data, base):
    """нулевые/заполняющие участки -> DEFS, остальное DEFB по 16."""
    out = []
    i = 0
    while i < len(data):
        j = i
        while j < len(data) and data[j] == data[i]:
            j += 1
        if j - i >= 8:
            out.append('\tDEFS\t%d,#%02X' % (j - i, data[i]) if data[i] else '\tDEFS\t%d' % (j - i))
            i = j
            continue
        k = i
        while k < len(data) and k - i < 16 and not (k + 8 <= len(data) and len(set(data[k:k + 8])) == 1):
            k += 1
        k = max(k, i + 1)
        out.append('\tDEFB\t' + ','.join('#%02X' % b for b in data[i:k]))
        i = k
    return out


def to_asm(script, title):
    assert len(script) == SCRIPT_LEN
    names = {LEVDAT + o: n for o, n, _ in HEADER}
    lines = ['; %s: параметры и код задания дополнительного уровня 1999 г. (#79C0..#7E0F, 1104 байта; продолжение блока - герои, карта, экран)' % title,
             '; собирается sjasmplus (task.bin - из task.txt, см. tools/levels.py); подробности - docs/FORMATS.md', '',
             'LEVDAT\tEQU\t#79C0', '\tORG\tLEVDAT', '']
    # --- заголовок
    for idx, (off, name, word) in enumerate(HEADER):
        nxt = HEADER[idx + 1][0] if idx + 1 < len(HEADER) else OFF_CODE
        raw = script[off:nxt]
        cm = ('\t; ' + COMMENT[name]) if name in COMMENT else ''
        if name == 'TASK_M':
            lines.append('TASK_M\tINCBIN\t"task.bin"%s' % cm)
            continue
        if name == 'LEVRES':
            nxt = 107
            raw = script[off:nxt]
        if word and len(raw) % 2 == 0:
            lines.append('%s\tDEFW\t%s%s' % (name, ','.join('#%04X' % (raw[i] | raw[i + 1] << 8) for i in range(0, len(raw), 2)), cm))
        else:
            lines.append('%s\tDEFB\t%s%s' % (name, ','.join(str(b) if b < 10 else '#%02X' % b for b in raw), cm))
    # --- код (pcLOOP #7A6B .. конец достижимого кода)
    sub = script[OFF_CODE:OFF_BULL]
    org = LEVDAT + OFF_CODE
    ins, owner, ci = disasm.analyse(sub, org, [org, org + 2], {})
    code_end = max((a + len(b) for a, (b, _) in ins.items()), default=org) - org
    lines += ['', ';------------ процедуры: pcLOOP - каждый кадр, pcINI - при старте ------------']
    tmp = tempfile.mkdtemp(prefix='levasm_')
    binp, outp, symp = (os.path.join(tmp, n) for n in ('c.bin', 'c.asm', 'c.sym'))
    open(binp, 'wb').write(sub[:code_end])
    syms = dict(names)
    syms.update({org: 'pcLOOP', org + 2: 'pcINI'})
    syms.update(GAME_EQU)
    open(symp, 'w', encoding='utf-8').write(''.join('%s $%04X\n' % (n, a) for a, n in syms.items()))
    disasm.run(binp, org, outp, [org, org + 2], {}, symp, '', False, 0, True)
    src = open(outp, encoding='utf-8').read().split('\n')
    use_equ = []
    body = []
    started = False
    for ln in src:
        s = ln.strip()
        if not started:
            if s.startswith('ORG'):
                started = True
            elif '\tEQU' in ln or ' EQU ' in ln:
                nm = ln.split()[0]
                if nm not in names.values() and nm not in ('pcLOOP', 'pcINI'):
                    use_equ.append(nm)
            continue
        body.append(ln)
    for nm in use_equ:
        a = next(a for a, n in GAME_EQU.items() if n == nm)
        lines.insert(lines.index('\tORG\tLEVDAT') - 1, '%s\tEQU\t#%04X' % (nm, a))
    text = chr(10).join(body)
    first = next((l for l in body if l.strip()), '')
    mt = re.match(r'\s*jr\s+(L_[0-9A-F]{4})', first)
    if mt:
        text = text.replace(mt.group(1), '_cLOOP')
    text = 'pcLOOP:' + chr(10) + text
    for ln in text.split(chr(10)):
        if '; 7A6D ' in ln and not lines[-1].startswith('pcINI'):
            lines.append('pcINI:')
        lines.append(ln)
    while lines and not lines[-1].strip():
        lines.pop()
    lines.append('')
    tail = script[OFF_CODE + code_end:OFF_MIN]
    k = OFF_BULL - OFF_CODE - code_end
    if tail[:k] == bytes([0x27]) * k and not any(tail[k:]):
        lines += ['\tDEFS\t#7AA0-$,#27\t; заполнитель до BULL (код задания - не более 53 байт: #7A6B..#7A9F)',
                  '\tDEFS\t#7E00-$\t; рабочие массивы BULL, MINE, HBUILD, KBUILD, BUF512 (в файле нули)']
    else:
        lines += _runs(tail, 0)
    lines += ['', 'datMIN\tDEFW\t' + ','.join(str(script[OFF_MIN + 2 * i] | script[OFF_MIN + 2 * i + 1] << 8) for i in range(8)) + '\t; золото 8 шахт (/100)',
              'datHER\t\t; здесь начинаются герои (496 байт), карта (4096) и экран (6912) - в файлах heroes.txt, map.csv, screen.png', '']
    return '\n'.join(lines)


def build(asm_path, task_bin, sjasm=None):
    """собрать script.asm -> 1104 байта. task_bin - 63 байта задания (кладутся рядом как task.bin)."""
    tmp = tempfile.mkdtemp(prefix='levbuild_')
    open(os.path.join(tmp, 'task.bin'), 'wb').write(task_bin)
    out = os.path.join(tmp, 's.bin')
    r = subprocess.run([sjasm or disasm.SJASM, '--nologo', '--msg=err', '--raw=' + out, '-I', tmp, '-I', os.path.dirname(os.path.abspath(asm_path)), asm_path],
                       capture_output=True, text=True)
    if r.returncode:
        raise ValueError('%s: %s' % (asm_path, (r.stdout + r.stderr)[:1500]))
    d = open(out, 'rb').read()
    if len(d) != SCRIPT_LEN:
        raise ValueError('%s: размер %d вместо %d (код задания не должен выходить за #7AA0, данные - за #7E10)' % (asm_path, len(d), SCRIPT_LEN))
    return d
