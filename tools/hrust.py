#!/usr/bin/env python3
"""Hrust 1.x unpacker: runs a Hrust-1 depacker (tools/bin/hrust1_dep.bin, 256 bytes, taken from another
Hrust-packed game) in the skoolkit Z80 simulator.  Used only to read the 1999 Compu-Studio disks
(reference/cs1999), which store levels and music as Hrust 1.1 streams ("HR", unpacked len, packed len, ...).

    python tools/hrust.py in.hr out.bin
"""
import os
import sys

try:
    from skoolkit.csimulator import CSimulator as Sim
except ImportError:                       # pragma: no cover
    from skoolkit.simulator import Simulator as Sim

DEP = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'bin', 'hrust1_dep.bin')


def header(s, pos=0):
    """(unpacked length, packed length) of the stream at pos, or None."""
    if s[pos:pos + 2] != b'HR':
        return None
    return s[pos + 2] | s[pos + 3] << 8, s[pos + 4] | s[pos + 5] << 8


def unpack(stream, load=0x6000, max_steps=5_000_000):
    """Unpacked bytes, or ValueError if the depacker does not return (not a valid stream)."""
    ul, pl = header(stream)
    mem = bytearray(65536)
    mem[0x5B00:0x5C00] = open(DEP, 'rb').read()
    mem[load:load + pl + 16] = stream[:pl + 16]
    sp = 0x5AF0
    mem[sp] = 0x00
    mem[sp + 1] = 0x01                    # return to #0100
    sim = Sim(mem, {'HL': load, 'DE': load, 'SP': sp, 'PC': 0x5B00})
    for _ in range(max_steps):            # step by step: a broken stream must not hang us
        if sim.registers[24] == 0x0100:   # PC
            return bytes(sim.memory[load:load + ul])
        sim.run()
    raise ValueError('depacker did not finish')


if __name__ == '__main__':
    data = open(sys.argv[1], 'rb').read()
    open(sys.argv[2], 'wb').write(unpack(data))
