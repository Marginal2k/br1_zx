#!/usr/bin/env python3
"""Extract the 1999 Compu-Studio extra levels and music from the "New Missions" disk.

Disk: reference/cs1999/BRNL&ED/brnewlev.fdi (identical to BlackRaven-NewMissions/BRNEWLEV.FDI, one cylinder more).
Format: 10 x 512 sectors (#E1..#EA) per track, no TR-DOS catalog; files are Hrust 1.1 streams ("HR" header) and are
written twice (two copies on side 0).  Here side 0 is read as one linear stream and every Hrust stream is unpacked.

Result: reference/cs1999/levels_ext/{human,kung}_NN.bin, *_17e.bin (12608-byte level blocks) and music/musN.mus.
33 level blocks and the 8 tunes are byte-identical to LW's 2024 port (reference/lw2024); kung_11 is intact here
(LW's copy is damaged).

    python tools/extract_cs1999.py
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hrust            # noqa: E402
from fdi import Fdi     # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DISK = os.path.join(ROOT, 'reference', 'cs1999', 'BRNL&ED', 'brnewlev.fdi')
OUT = os.path.join(ROOT, 'reference', 'cs1999')
BLOCK = 12608
MUS_SIZES = [4224, 4213, 4885, 4500, 4182, 4799, 4916, 4824]          # mus1..mus8, in disk order
LEVELS = [f'human_{i:02}' for i in range(1, 17)] + ['human_17e'] + [f'kung_{i:02}' for i in range(1, 17)] + ['kung_17e']


def side(f, h):
    s = bytearray()
    for c in range(f.cyls):
        for r in range(0xE1, 0xEB):
            try:
                s += f.sector(c, h, r)
            except KeyError:
                s += bytes(512)
    return bytes(s)


def main():
    s = side(Fdi(DISK), 0)
    levels, music = [], []
    seen = set()
    for m in re.finditer(rb'HR', s):
        o = m.start()
        ul, pl = hrust.header(s, o)
        if ul not in (BLOCK, *MUS_SIZES) or not 50 < pl <= ul:
            continue
        try:
            out = hrust.unpack(s[o:], max_steps=3_000_000)
        except ValueError:
            continue
        if out in seen:                       # second copy
            continue
        seen.add(out)
        (levels if ul == BLOCK else music).append(out)
    assert len(levels) == len(LEVELS) and len(music) == len(MUS_SIZES), (len(levels), len(music))
    os.makedirs(os.path.join(OUT, 'levels_ext'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'music'), exist_ok=True)
    for n, b in zip(LEVELS, levels):
        open(os.path.join(OUT, 'levels_ext', n + '.bin'), 'wb').write(b)
    for i, b in enumerate(music, 1):
        assert len(b) == MUS_SIZES[i - 1]
        open(os.path.join(OUT, 'music', f'mus{i}.mus'), 'wb').write(b)
    print(f'{len(levels)} level blocks, {len(music)} tunes -> {OUT}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
