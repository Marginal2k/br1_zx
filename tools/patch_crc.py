#!/usr/bin/env python3
"""Python port of CPP/WCRCEXE.CPP: puts the ten check sums of the game into the built pages 5, 0, 7, 4.
The source has #EE in these places (CHK#0 ... CHK#9). The game (W_CRC.A80 code, TST#n) compares them at run time."""
import sys


def rrca(v):
    return ((v & 1) << 7) | (v >> 1)


def rlca(v):
    return ((v << 1) & 255) | (v >> 7)


def patch(p5, p0, p7, p4):
    """Pages are bytearrays of 16384 bytes; returns a list of (page name, address, old, new)."""
    log = []

    def put(page, name, base, addr, v, idx):
        off = addr - base
        assert page[off] == 0xEE, f'CRC#{idx}: unexpected {page[off]:02X} at {addr:04X}'
        log.append((name, addr, page[off], v))
        page[off] = v
    B5, B0 = 0x4000, 0xC000
    s = 0
    for i in range(0x3600):
        s = (s - p5[0x50 + i]) & 255
    put(p5, 'p5', B5, 0x4002, s, 0)
    s = 0
    for i in range(0x3400):
        s = (s + p0[i]) & 255
    put(p5, 'p5', B5, 0x400C, s, 1)
    s = 0
    for i in range(0x3600):
        s = rrca((s + p5[0x50 + i]) & 255)
    put(p5, 'p5', B5, 0x4043, s, 2)
    s = 0
    for i in range(0, 0x3600, 2):
        s = ((s + p5[0x50 + i]) & 255) ^ p5[0x50 + i + 1]
    put(p5, 'p5', B5, 0x4045, s, 3)
    s = 0
    for i in range(0x3400):
        s = rlca((s + p0[i]) & 255)
    put(p5, 'p5', B5, 0x7650, s, 4)
    s = 0
    for i in range(0x3400):
        s = rlca((s - p0[i]) & 255)
    put(p0, 'p0', B0, 0xF4AF, s, 5)
    s = 0
    for i in range(0x3500):
        s = (s + p5[0x80 + i]) & 255
    put(p7, 'p7', B0, 0xDB00, s, 6)
    s = 0
    for i in range(0x3500):
        s ^= p5[0x60 + i]
    put(p7, 'p7', B0, 0xFFFE, s, 7)
    s = 0
    for i in range(0x3600):
        s ^= p5[0x50 + i]
        s = (s + p5[0x50 + i]) & 255
    put(p4, 'p4', B0, 0xFF00, s, 8)
    put(p5, 'p5', B5, 0x4044, s, 90)        # reserve copy of sum 8
    s = 0
    for i in range(0x3300):
        s ^= p0[0x100 + i]
    put(p0, 'p0', B0, 0xF4AE, s, 9)
    return log
