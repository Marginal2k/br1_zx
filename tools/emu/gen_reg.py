#!/usr/bin/env python3
"""Regression scenario generator (br_1mb / two-disk). python tools/emu/gen_reg.py NAME  -> tools/emu/scen/reg_NAME.txt
 lvl <set:std|ext> <side:H|K> <lvl list comma> [play_frames]   levels started via cheat, with LEVEL/ExtSet/IM2 checks"""
import sys
PRE = "dEnter\nw300\nuEnter\nw2500\nKSpace\nw150\nK8\nw20\nK6\nK2\nK7\nK5\nw20\n"
def start(side, lvl, ext, play=150, two=None):
    s = PRE + "h2:2:12\n" * (lvl - 1) + f"K6\nw20\nK{1 if side=='H' else 2}\nw60\nK1\nw60\nK{2 if ext else 1}\n"
    if two: s += two
    s += "w300\nKSpace\nw" + str(play) + "\n"
    return s
def lvl_block(setn, side, lvl, play_extra=0, two=None, tag=None):
    t = tag or f"{setn[0]}{side}{lvl:02d}"
    ext = setn == 'ext'
    o = "boot\n" + start(side, lvl, ext, two=two)
    o += f"s:{t}\nc:{t}\nm:lv{t}:79D8:1\nm:es{t}:783A:1\nri:{t}\nchk:im{t}:BE00:257:BF\nchk:vec{t}:BFBF:3:C35D77\nr:{t}\n"
    if play_extra:
        o += f"js:ay{t}:ay\nidle:{t}:{play_extra}\ns:{t}b\nc:{t}b\njs:ayb{t}:ay\nri:{t}b\nchk:im{t}b:BE00:257:BF\nr:{t}b\n"
    return o
if __name__ == '__main__':
    kind = sys.argv[1]
    out = ""
    if kind.startswith('lv_'):   # lv_ext_H_1-2-3[_play]
        _, setn, side, lst = kind.split('_')[:4]
        play = int(kind.split('_')[4]) if len(kind.split('_')) > 4 else 0
        for l in lst.split('-'): out += lvl_block(setn, side, int(l), play)
    if kind.startswith('end_'):   # end_ext_H
        _, setn, side = kind.split('_')
        t = f"E{setn[0]}{side}"
        out = "boot\n" + start(side, 17, setn == 'ext', play=0).replace("KSpace\nw0\n", "")
        out += f"c:{t}0\nKSpace\nw100\nc:{t}1\nw600\nc:{t}2\nw1500\nc:{t}3\nw1500\nc:{t}4\nr:{t}\n"
    if kind.startswith('flow_'):   # flow_ab_ext | flow_one_std : full two-disk flow, real intro path, no Enter-skip
        _, mode, setn = kind.split('_')
        d2 = "w100\nc:d2\nKb\n" if mode == 'ab' else "w100\nc:d2\nins:0:br2.trd\nKa\n"
        out = "boot\nw200\nc:logo\nK1\nw600\nc:intro\nhE:20:300\nc:back\nK2\nw2500\nc:demo\nKSpace\nw150\nc:menu\nK1\nw60\nK1\nw60\n"
        out += f"c:setbox\nK{2 if setn == 'ext' else 1}\n" + d2 + "w300\nc:brief\nm:es0:783A:1\nKSpace\nw300\nc:play1\ns:play1\nm:es:783A:1\nm:lv:79D8:1\nri:fl\nchk:imfl:BE00:257:BF\nchk:vecfl:BFBF:3:C35D77\nr:fl\nidle:fl:1500\nc:play2\nri:fl2\nchk:imfl2:BE00:257:BF\nr:fl2\n"
    open(f'tools/emu/scen/reg_{kind}.txt', 'w').write(out)
