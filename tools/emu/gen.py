#!/usr/bin/env python3
"""Generate regression scenarios: python tools/emu/gen.py levels|ending|saves one|two|single  -> tools/emu/scen/gen_<kind>_<variant>.txt"""
import sys
kind, var = sys.argv[1], sys.argv[2]
PRE = "dEnter\nw300\nuEnter\nw700\nKSpace\nw30\nK8\nw20\nK6\nK2\nK7\nK5\nw20\n"
def drive_prompt():   # after the difficulty menu the game asks where disk 2 is
    if var == 'one': return ""
    if var == 'two': return "w100\nKb\n"
    return "w100\nins:0:br2.trd\nKa\n"
def start(side, lvl, tag):
    s = PRE + "h2:2:12\n" * (lvl - 1) + f"K6\nw20\nK{1 if side=='H' else 2}\nw20\nK1\n" + drive_prompt() + "w300\nKSpace\nw150\n"
    if var == 'single': pass
    return s
out = ""
if kind == 'levels':
    seq = [('H',1),('K',1),('H',5),('K',8),('H',12),('K',16),('H',2),('K',3),('H',9),('K',10),('H',16),('K',2)]
    for side, lvl in seq:
        t = f"{side}{lvl:02d}"
        out += "boot\n" + start(side, lvl, t) + f"c:{t}\nri:{t}\nchk:im{t}:BE00:257:BF\nchk:vec{t}:BFBF:3:C35D77\nr:{t}\n"
        if var == 'single': out += "ins:0:br1.trd\n"
elif kind == 'ending':
    for side in 'HK':
        out += "boot\n" + PRE + "h1:2:12\nK6\nw20\nK%s\nw20\nK1\n" % (1 if side == 'H' else 2) + drive_prompt() + "w300\nc:e%s1\nKSpace\nw100\nc:e%s2\n" % (side, side)
        if var == 'two': out += "Ka\n"
        if var == 'single': out += "ins:0:br1.trd\nKa\n"
        out += f"w600\nc:e{side}3\nr:e{side}3\nw2500\nc:e{side}4\nr:e{side}4\n"
open(f'tools/emu/scen/gen_{kind}_{var}.txt', 'w').write(out)
