#!/usr/bin/env python3
"""One-off: ASM80 sources of the archive -> src/<program>/*.asm (via a80conv.py) and used binaries -> assets/.

    python tools/convert.py
The hand-written files (src/*/main.asm) are not touched.
"""
import os, re, shutil, sys
BS = chr(92)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import a80conv

ARC = os.path.join(ROOT, 'archive', 'src', "'W3'")
ASM = os.path.join(ARC, 'ASM80')
LEV = os.path.join(ARC, 'LEVELS')
used = set()


def incname(n):
    return re.sub(r'[^a-z0-9_.]', '_', n.lower()) + '.asm'


def binmap_for(srcdir):
    def f(p):
        rel = p.replace(BS, '/')
        while rel.startswith('../'):
            rel = rel[3:]
        src = os.path.normpath(os.path.join(srcdir, p.replace(BS, '/')))
        dst = os.path.join(ROOT, 'assets', rel.lower())
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if not os.path.exists(src):
            print('MISSING', src)
        else:
            shutil.copyfile(src, dst)
        used.add(rel.lower())
        return rel.lower()
    return f


GAME = ('W WMAIN WPAGE WLID W_IO XDELPZ W_INTV WLIB2 WLIB2X3 WLIE WLIB1A WSOUND2 WLIK W~LOCAL W_DEMO W~VAR W~LEVEL '
        'WLIB3 WLIB3VI WLIF WINTEL WLIC WLIG WLIB4 W_PROTEC WSTRATEG WLIH WWIZARD WMENU2 WMISC_4 WMAP WMISC_6 '
        'WMISC_1').split()
PROGS = {
    'game': (ASM, GAME),
    'start1': (ASM, ['W&START1', 'W&DISK1', 'XDELPZ', 'W&INTRO', 'W&INSTR']),
    'start2': (ASM, ['W&START2', 'XDELPZ']),
    'final': (ASM, ['W&FINAL', 'XDELPZ']),
}
LEVELS = [f'W~1{i:02}' for i in range(1, 17)] + ['W~117END'] + [f'W~2{i:02}' for i in range(1, 17)] + ['W~217END']


def run(name, srcdir, files, outname=None):
    p = a80conv.Program(srcdir, [f + '.A80' for f in files], binmap=binmap_for(srcdir), incname=lambda n: incname(n))
    out = os.path.join(ROOT, 'src', outname or name)
    for w in dict.fromkeys(p.run(out)):
        print(name, 'warning:', w)


if __name__ == '__main__':
    for n, (d, fl) in PROGS.items():
        run(n, d, fl)
    for l in LEVELS:
        run(l, LEV, [l], 'levels')

    NL = chr(10)
    for l in LEVELS:
        nm = incname(l)
        mn = nm.replace('.asm', '')[2:]
        txt = ['; level data block of ' + l + ' (the original: ASM80 -> W~xxx.BIN -> XLPZ -> W~xxx.LPZ on disk 2)',
               '	DEVICE ZXSPECTRUM128', '	INCLUDE "defr.inc"', '	INCLUDE "' + nm + '"', 'LEVEND',
               '	SAVEBIN "' + mn + '.bin",LEVDAT,LEVEND-LEVDAT']
        with open(os.path.join(ROOT, 'src', 'levels', 'main_' + mn + '.asm'), 'w', newline=NL) as f:
            f.write(NL.join(txt) + NL)
