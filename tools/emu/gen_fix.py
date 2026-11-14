#!/usr/bin/env python3
"""Make the old gen_<kind>_<variant>.txt scenarios (written before the mission-set box existed) work: insert the mission-set
answer after the difficulty key, and the 2500-frame wait before the first Space. python tools/emu/gen_fix.py std|ext  -> gn<set>_<kind>_<variant>.txt"""
import re, sys
setn = sys.argv[1]
k = '2' if setn == 'ext' else '1'
for kind in ('levels', 'saves', 'ending'):
    for var in ('one', 'two', 'single'):
        s = open(f'tools/emu/scen/gen_{kind}_{var}.txt').read()
        s = s.replace('uEnter\nw700\n', 'uEnter\nw2500\n')
        s = re.sub(r'K([12])\nw20\nK1\n', lambda m: f'K{m.group(1)}\nw60\nK1\nw60\nK{k}\n', s)
        open(f'tools/emu/scen/gn{setn}_{kind}_{var}.txt', 'w').write(s)
