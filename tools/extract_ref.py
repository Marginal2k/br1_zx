#!/usr/bin/env python3
"""Extract the files of the original disks (reference/raven1/RAVEN1.FDI, RAVEN2.FDI) into work/ref/.

Disk 1: logical track = cyl*2+side; boot = sector #09 (1024) of cyl 0/side 0 (START1.B00); data = 1024-byte sectors #C0..#C4
        of logical tracks 2.. in that order; the table F_DAT (sector, track, length/1024) is inside the boot sector.
Disk 2: boot = sector #09 of cyl 0; data = 1024-byte sectors #C1..#C5 of cylinders 14..69, each cylinder twice (both sides);
        the table (sector number, shift/4) is WX_xxx in the game (W&DISK2.A80).
"""
import os, struct, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from fdi import Fdi
import lpz

REF = os.path.join(ROOT, 'reference', 'raven1')
OUT = os.path.join(ROOT, 'work', 'ref')


def disk1():
    f = Fdi(os.path.join(REF, 'RAVEN1.FDI'))
    out = os.path.join(OUT, 'disk1')
    os.makedirs(out, exist_ok=True)
    boot = f.sector(0, 0, 9)
    open(os.path.join(out, 'start1_b00.bin'), 'wb').write(boot)
    lin = bytearray()
    for t in range(2, 141):
        c, h = t // 2, t % 2
        for r in range(0xC0, 0xC5):
            lin += f.sector(c, h, r)
    open(os.path.join(out, 'disk1.bin'), 'wb').write(bytes(lin))
    i = boot.find(bytes.fromhex('f3dd215f2fcd')) + 15
    tab = []
    for n in range(64):
        s, t, l = boot[i + n * 3:i + n * 3 + 3]
        tab.append((s, t, l))
    res = []
    for n, (s, t, l) in enumerate(tab):
        off = ((t - 2) * 5 + (s - 0xC0)) * 1024
        raw = bytes(lin[off:off + l * 1024])
        open(os.path.join(out, f'f{n:02}.bin'), 'wb').write(raw)
        res.append((n, s, t, l, off))
    return tab, boot, bytes(lin)


def disk2():
    f = Fdi(os.path.join(REF, 'RAVEN2.FDI'))
    out = os.path.join(OUT, 'disk2')
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, 'start2_b00.bin'), 'wb').write(f.sector(0, 0, 9))
    lin = [bytearray(), bytearray()]
    for c in range(14, 70):
        for h in (0, 1):
            for r in range(0xC1, 0xC6):
                lin[h] += f.sector(c, h, r)
    open(os.path.join(out, 'disk2_side0.bin'), 'wb').write(bytes(lin[0]))
    open(os.path.join(out, 'disk2_side1.bin'), 'wb').write(bytes(lin[1]))
    return f, lin


if __name__ == '__main__':
    tab, boot, lin = disk1()
    for n, (s, t, l) in enumerate(tab):
        print(n, hex(s), t, l)
    disk2()
