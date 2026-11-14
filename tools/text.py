#!/usr/bin/env python3
"""Тексты Чёрного Ворона: двоичные ресурсы <-> UTF-8 .txt (порты WTEXT.CPP, WTASKTXT.CPP, WINSTR.CPP).

Формат подробно - docs/FORMATS.md. Кратко:
  * Текст в игре - это номера глифов шрифта (wfont.fnt для роликов/титров/заданий, wnf1.fnt для инструкции),
    а не коды ASCII. Таблицы соответствия номер -> символ - CODE_MAIN и CODE_INSTR (как в исходниках автора).
    Латинские и кириллические буквы одинакового начертания - РАЗНЫЕ глифы (см. FORMATS.md); в тексте они разные
    символы Unicode, так что файл точен.
  * Глиф, которого кодировщик автора никогда не выбирает (дубликаты в таблице), записывается как {N}.
  * flick.txt   - ролики (WFLICTXT.TXT автора): блоки по 16 строк 13 символов, строка центрируется, блок кончается '#'/'$'.
  * victory_*.txt - прокрутка титров победы: строки до 12 символов, центрируются, кончается '#'.
  * tasks.txt   - задания уровней: [wNNN] + три строки по 20 символов между '|'.
  * instr.txt   - инструкция: текст как есть ('=' - код 127, конец строки - 126); сжатие парами и словарь
                  (winstr.dat + winstrcm.dat) строятся заново, как в WINSTR.CPP.
"""
import re

# ----------------------------------------------------------------------------- таблицы глифов
CODE_MAIN = ("012345" "6789 _" "АБВГДЕ" "ЖЗИЙКЛ" "МНОПРС" "ТУФХЦЧ" "ШЩЬЫЭЮ" "Я:?.,!" "абвгде" "жзийкл" "мнопрс"
             "туфхцч" "шщьыъэ" "юяёNRS" "IFY()%" "/-^^^^" "^*'abc" "Ddefgh" "<>GJLU")
CODE_INSTR = (" яазвсьедцрфжтгб" "ыхнуймиколпЧэЭюШ" "ёЯАЗВЕСДЬЦЖФРТГБ" "ХЫУЙНМКИОЛПъшщчЩ" "ZЮVNSDFGJLWQRYUI"
              "2513460987,.:;-/" ")(!$%\"+?Ё#++++++")
INSTR_SEARCH = 111          # цикл поиска j<111 в WINSTR.CPP
END_CODE = 127              # код конца блока/строки в роликах, прокрутке, заданиях и '=' в инструкции
NL_CODE = 126               # конец строки в инструкции
SPACE = 10                  # пробел в CODE_MAIN


ENC_MAIN = {}
for _i, _c in enumerate(CODE_MAIN):
    ENC_MAIN[_c] = _i                       # abc[code[i]] = i: побеждает последний
ENC_INSTR = {}
for _i, _c in enumerate(CODE_INSTR[:INSTR_SEARCH]):
    ENC_INSTR.setdefault(_c, _i)            # for (j...) if (code[j]==*m) break: побеждает первый


class TextError(Exception):
    pass


def g_dec(idx, enc, code):
    """номер глифа -> строка (символ или {N})."""
    if idx < len(code) and enc.get(code[idx]) == idx:
        return code[idx]
    return '{%d}' % idx


_ESC = re.compile(r'\{(\d+)\}')


def g_enc_line(s, enc, where=''):
    """строка -> список номеров глифов (символы и {N})."""
    out = []
    pos = 0
    while pos < len(s):
        m = _ESC.match(s, pos)
        if m:
            out.append(int(m.group(1)))
            pos = m.end()
            continue
        c = s[pos]
        if c not in enc:
            raise TextError(f'{where}: символа {c!r} (U+{ord(c):04X}) нет в таблице глифов')
        out.append(enc[c])
        pos += 1
    return out


def _vis_len(s):
    return len(g_enc_line(s, ENC_MAIN))


# ----------------------------------------------------------------------------- центрированные строки
def center_row(idxs, width):
    """как в WTEXT: k глифов в строке width, смещение (13-k)//2."""
    k = len(idxs)
    if k > width:
        raise TextError('слишком длинная строка (%d > %d)' % (k, width))
    row = [SPACE] * width
    ab = (13 - k) // 2
    for i, g in enumerate(idxs):
        row[ab + i] = g
    return row


def row_to_line(row, width):
    """строка из width глифов -> текст: обычный (центрируется) или '|точно|'."""
    idx = list(row)
    # границы содержимого
    nz = [i for i, g in enumerate(idx) if g != SPACE]
    if not nz:
        return ''
    a, b = nz[0], nz[-1] + 1
    seg = idx[a:b]
    if center_row(seg, width) == idx:
        return ''.join(g_dec(g, ENC_MAIN, CODE_MAIN) for g in seg)
    return '|' + ''.join(g_dec(g, ENC_MAIN, CODE_MAIN) for g in idx) + '|'


def line_to_row(line, width, where=''):
    if line.startswith('|') and line.endswith('|') and len(line) >= 2:
        row = g_enc_line(line[1:-1], ENC_MAIN, where)
        if len(row) != width:
            raise TextError(f'{where}: в |...| должно быть ровно {width} символов, а их {len(row)}')
        return row
    return center_row(g_enc_line(line, ENC_MAIN, where), width)


# ----------------------------------------------------------------------------- ролики (WFLICTXT)
BLK_LINES, BLK_W = 16, 13
BLOCK_BYTES = BLK_LINES * BLK_W
# блоки, которые в WFLICTXT.TXT автора заканчивались '$', а не '#' (на кодирование не влияет; нужно только для точной копии текста)
DOLLAR_BLOCKS = {5, 11, 17, 23, 29, 35}


def flick_decode(data):
    if len(data) % BLOCK_BYTES:
        raise TextError('wflictxt.bin: длина не кратна %d' % BLOCK_BYTES)
    out = []
    for b in range(len(data) // BLOCK_BYTES):
        blk = data[b * BLOCK_BYTES:(b + 1) * BLOCK_BYTES]
        lines = []
        for j in range(BLK_LINES):
            lines.append(row_to_line([blk[i * BLK_LINES + j] for i in range(BLK_W)], BLK_W))
        while lines and lines[-1] == '':
            lines.pop()
        out += lines
        out.append('$' if b in DOLLAR_BLOCKS else '#')
    return '\n'.join(out) + '\n'


def flick_encode(text):
    lines = text.split('\n')
    if lines and lines[-1] == '':
        lines.pop()
    out = bytearray()
    cur = []
    nblk = 0
    for n, ln in enumerate(lines, 1):
        if ln[:1] in ('#', '$'):
            if len(cur) > BLK_LINES:
                raise TextError(f'flick.txt:{n}: блок {nblk} длиннее {BLK_LINES} строк')
            rows = cur + [[SPACE] * BLK_W] * (BLK_LINES - len(cur))
            for i in range(BLK_W):
                out += bytes(rows[j][i] for j in range(BLK_LINES))
            cur = []
            nblk += 1
        else:
            cur.append(line_to_row(ln, BLK_W, f'flick.txt:{n}'))
    if cur:
        raise TextError('flick.txt: последний блок не закрыт строкой "#"')
    return bytes(out)


# ----------------------------------------------------------------------------- прокрутка победы (WVICT*)
def scroll_decode(data):
    if not data or data[-1] != END_CODE:
        raise TextError('прокрутка должна кончаться байтом 127')
    body = data[:-1]
    if len(body) % 12:
        raise TextError('длина прокрутки не кратна 12')
    out = [row_to_line(body[i:i + 12], 12) for i in range(0, len(body), 12)]
    out.append('#')
    return '\n'.join(out) + '\n'


def scroll_encode(text):
    out = bytearray()
    lines = text.split('\n')
    for n, ln in enumerate(lines, 1):
        if ln.startswith('#'):
            return bytes(out) + bytes([END_CODE])
        out += bytes(line_to_row(ln, 12, f'строка {n}'))
    raise TextError('нет завершающей строки "#"')


# ----------------------------------------------------------------------------- задания (WTASKTXT)
def tasks_decode(items):
    """items: [(имя 'w101', 63 байта)] -> текст."""
    out = []
    for name, d in items:
        if len(d) != 63 or d[20] != END_CODE or d[41] != END_CODE or d[62] != END_CODE:
            raise TextError(f'{name}.tsk: ожидалось 3x(20+127)')
        out.append('[%s]' % name)
        for i in (0, 21, 42):
            out.append('|' + ''.join(g_dec(g, ENC_MAIN, CODE_MAIN) for g in d[i:i + 20]) + '|')
        out.append('')
    return '\n'.join(out)


def tasks_encode(text):
    res = {}
    name = None
    rows = []
    for n, ln in enumerate(text.split('\n'), 1):
        ln = ln.rstrip('\r')
        if not ln.strip():
            continue
        m = re.fullmatch(r'\[(\w+)\]', ln)
        if m:
            if name:
                raise TextError(f'tasks.txt:{n}: у задания {name} не три строки')
            name, rows = m.group(1), []
            continue
        if not (name and ln.startswith('|') and ln.endswith('|')):
            raise TextError(f'tasks.txt:{n}: ожидалась строка |...| или [имя]')
        g = g_enc_line(ln[1:-1], ENC_MAIN, f'tasks.txt:{n}')
        if len(g) != 20:
            raise TextError(f'tasks.txt:{n}: в строке задания должно быть 20 символов, а их {len(g)}')
        rows.append(g)
        if len(rows) == 3:
            res[name] = bytes(rows[0] + [END_CODE] + rows[1] + [END_CODE] + rows[2] + [END_CODE])
            name = None
    if name:
        raise TextError(f'tasks.txt: у задания {name} не три строки')
    return res


# ----------------------------------------------------------------------------- инструкция (WINSTR)
def instr_expand(dat, cm):
    pairs = [(cm[2 * k], cm[2 * k + 1]) for k in range(128)]
    raw = []
    for b in dat:
        if b >= 128:
            raw += pairs[b - 128]
        else:
            raw.append(b)
    return raw


def instr_decode(dat, cm):
    raw = instr_expand(dat, cm)
    out = []
    for g in raw:
        if g == NL_CODE:
            out.append('\n')
        elif g == END_CODE:
            out.append('=')
        else:
            out.append(g_dec(g, ENC_INSTR, CODE_INSTR))
    return ''.join(out)


def instr_encode(text, tail=()):
    """text -> (winstr.dat, winstrcm.dat). Порт WINSTR.CPP, включая округление в буфере на месте.

    tail - байты исходного файла за концом текста (в C они остаются в буфере и на последней паре читается m[1]);
    для восстановления побайтно берутся из instr_tail.bin при экспорте.
    """
    # convert_INSTR: исходный текст автора - CP866, CRLF, '*' - пробел, пробел перед CRLF отбрасывается
    t = text.replace('*', ' ')
    lines = t.split('\n')
    seq = []
    for n, ln in enumerate(lines):
        last = n == len(lines) - 1
        if ln.endswith(' ') and not last:
            ln = ln[:-1]
        if ln.endswith(' ') and last:
            pass
        i = 0
        while i < len(ln):
            if ln[i] == '=':
                seq.append(END_CODE)
                i += 1
                continue
            m = _ESC.match(ln, i)
            if m:
                seq.append(int(m.group(1)))
                i = m.end()
                continue
            if ln[i] not in ENC_INSTR:
                raise TextError(f'instr.txt: символа {ln[i]!r} (U+{ord(ln[i]):04X}) нет в таблице глифов, строка {n + 1}')
            seq.append(ENC_INSTR[ln[i]])
            i += 1
        if not last:
            seq.append(NL_CODE)
    m = seq + list(tail) + [0, 0]          # буфер: за концом - остатки исходного файла
    ln_ = len(seq)
    # search
    data = [[0] * 100 for _ in range(100)]
    for i in range(ln_ - 1):
        if m[i] < 100 and m[i + 1] < 100:
            data[m[i]][m[i + 1]] += 1
    # compress_ini
    cmpr = []
    for k in range(128):
        mx = mi = mj = 0
        for i in range(100):
            row = data[i]
            for j in range(100):
                if row[j] > mx:
                    mx, mi, mj = row[j], i, j
        cmpr.append((mi, mj))
        data[mi][mj] = -(k + 1)
    for i in range(100):
        for j in range(100):
            data[i][j] = 0 if data[i][j] > 0 else -data[i][j]
    # compress (на месте: читаем m[p], пишем в out)
    out = []
    p = 0
    left = ln_
    while left > 0:
        if m[p] < 100 and m[p + 1] < 100 and data[m[p]][m[p + 1]] > 0:
            out.append(data[m[p]][m[p + 1]] + 127)
            p += 1
            left -= 1
        else:
            out.append(m[p])
        p += 1
        left -= 1
    cm = bytes(b for pr in cmpr for b in pr)
    return bytes(out), cm
