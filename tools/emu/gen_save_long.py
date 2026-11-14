#!/usr/bin/env python3
"""Real in-game save/load scenarios (no JS call into SAVgam).
python tools/emu/gen_save.py NAME SET(std|ext) SIDE(H|K) SLOTS(comma, 1-based) [VARIANT one|two|twoAB|orig]  -> tools/emu/scen/rs_NAME.txt
Save: pointer keys QAOP + Space (~1.95 px/frame) -> right panel lower part -> game menu item 2 "Сохранить игру" -> slot row -> Y.
Load: title menu key 3 -> slot key. Pointer is at 7F,88 after a new game.
VARIANTS: one = br_1mb; two = br1+br2 in ONE drive (disk 2 inserted with ins: on the prompt); twoAB = br1 in A, br2 in B;
          orig = reference BR_1/BR_2 (A+B, original game, no mission-set box)."""
import sys
name, setn, side, slots = sys.argv[1:5]
LVL = int(sys.argv[7]) if len(sys.argv) > 7 else 1
XYA = sys.argv[6] if len(sys.argv) > 6 else "7412"
PLAY = 3500
var = sys.argv[5] if len(sys.argv) > 5 else 'one'
slots = [int(x) for x in slots.split(',')]
ext = setn == 'ext'
SPD = 1.95
def boot():
    if var == 'orig':
        return "boot\nw400\nK2\nw1100\nKSpace\nw150\n"
    if var == 'two':
        return "ins:0:br1.trd\nboot\ndEnter\nw300\nuEnter\nw2500\nKSpace\nw150\n"
    return "boot\ndEnter\nw300\nuEnter\nw2500\nKSpace\nw150\n"
def move(cx, cy, tx, ty):
    s = ""
    if tx < cx: s += f"hO:{round((cx-tx)/SPD)}:3\n"
    if tx > cx: s += f"hP:{round((tx-cx)/SPD)}:3\n"
    if ty < cy: s += f"hQ:{round((cy-ty)/SPD)}:3\n"
    if ty > cy: s += f"hA:{round((ty-cy)/SPD)}:3\n"
    return s
LDDRV = {'one': "", 'two': "w60\nc:drvq{sl}\nins:0:br2.trd\nKa\nw60\nc:drvr{sl}\nKa\n", 'twoAB': "w60\nc:drvq{sl}\nKb\nw60\nc:drvr{sl}\nKb\n", 'orig': "w60\nc:drvq{sl}\nKa\nw60\nc:drvr{sl}\nKb\n"}
DRV = {'one': "", 'two': "w100\nc:dsk\nins:0:br2.trd\nKa\n", 'twoAB': "w100\nc:dsk\nKb\n", 'orig': "w100\nc:dsk\nKb\n"}
def drive_new():   # disk-2 drive question after the difficulty/set menus
    return DRV[var]
PANEL = (204, 189)       # pointer inside the lower right panel (opens the game menu)
MENU1 = (80, 75)         # menu item 2 ("Сохранить игру"): rows BY 8..10
def slot_y(sl): return 67 + 8 * (sl - 1)     # row BY = 8 + (sl-1), centre-ish
o = boot()
o += "K8\nw20\nK6\nK2\nK7\nK5\nw20\n" + "h2:2:12\n" * (LVL - 1) + "K6\nw20\n"
o += f"K{1 if side=='H' else 2}\nw60\nK1\nw60\n" + f"K{2 if ext else 1}\n" + drive_new()
o += "w300\nKSpace\nw200\ns:before0\nm:xy0:" + XYA + ":410\nidle:play:" + str(PLAY) + "\ns:before\nc:beforec\nm:es0:783A:1\nm:lv0:79D8:1\nm:xypre:" + XYA + ":410\n"
pos = (0, 0)
for i, sl in enumerate(slots):
    o += move(*pos, *PANEL) + "kSpace\nw40\n" + (f"c:menu{sl}\n")
    o += move(*PANEL, *MENU1) + f"kSpace\nw40\nc:savemenu{sl}\n"
    ty = slot_y(sl)
    o += move(*MENU1, 80, ty) + f"kSpace\nw40\nc:confirm{sl}\ns:conf{sl}\nm:xysave{sl}:" + XYA + ":410\nKy\nw500\nc:aftersave{sl}\ns:aftersave{sl}\n"
    pos = (80, ty)
    if i + 1 < len(slots): o += "w1000\n"
for sl in slots:
    o += boot()
    o += f"c:title{sl}\nK3\nw60\nc:ldmenu{sl}\n"
    o += f"K{sl}\n" + LDDRV[var].replace("{sl}", str(sl)) + f"w40\nm:xyl40_{sl}:" + XYA + f":410\ns:ld40_{sl}\nc:ld40c_{sl}\nw200\nm:xyl240_{sl}:" + XYA + f":410\nw500\ns:load{sl}\nc:loadc{sl}\nm:es{sl}:783A:1\nm:lv{sl}:79D8:1\nri:ld{sl}\nchk:imld{sl}:BE00:257:BF\nchk:vecld{sl}:BFBF:3:C35D77\n"
    o += f"hP:6:20\nw100\ns:move{sl}\nc:movec{sl}\nidle:lat{sl}:1000\ns:later{sl}\nc:laterc{sl}\n"
open(f'tools/emu/scen/rl_{name}.txt', 'w').write(o)
