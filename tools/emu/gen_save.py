#!/usr/bin/env python3
"""Real in-game save/load scenarios (no JS call into SAVgam).
python tools/emu/gen_save.py NAME SET(std|ext) SIDE(H|K) SLOTS(comma, 1-based) [VARIANT one|two|twoAB|orig]  -> tools/emu/scen/rs_NAME.txt
Save: pointer keys QAOP + Space (~1.95 px/frame) -> right panel lower part -> game menu item 2 "Сохранить игру" -> slot row -> Y.
Load: title menu key 3 -> slot key. Pointer is at 7F,88 after a new game.
VARIANTS: one = br_1mb; two = br1+br2 in ONE drive (disk 2 inserted with ins: on the prompt); twoAB = br1 in A, br2 in B;
          orig = reference BR_1/BR_2 (A+B, original game, no mission-set box)."""
import sys
name, setn, side, slots = sys.argv[1:5]
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
o += f"K{1 if side=='H' else 2}\nw60\nK1\nw60\n" + ("" if var == 'orig' else f"K{2 if ext else 1}\n") + drive_new()
o += "w300\nKSpace\nw200\ns:before\nc:beforec\nm:es0:783A:1\nm:lv0:79D8:1\n"
pos = (0, 0) if var == "orig" else (0x7F, 0x88)   # orig: pointer starts at the top left corner (measured)
for i, sl in enumerate(slots):
    o += move(*pos, *PANEL) + "m:co_p:77CA:2\nkSpace\nw40\n" + (f"c:menu{sl}\n")
    o += move(*PANEL, *MENU1) + f"m:co_m{sl}:77CA:2\nkSpace\nw40\nc:savemenu{sl}\n"
    ty = slot_y(sl)
    o += move(*MENU1, 80, ty) + f"m:co_s{sl}:77CA:2\nkSpace\nw40\nc:confirm{sl}\nKy\nw500\nc:aftersave{sl}\ns:aftersave{sl}\n"
    pos = (80, ty)
    if i + 1 < len(slots): o += "w1000\n"
for sl in slots:
    o += boot()
    o += f"c:title{sl}\nK3\nw60\nc:ldmenu{sl}\n"
    o += f"K{sl}\n" + LDDRV[var].replace("{sl}", str(sl)) + f"w40\nc:ld40_{sl}\nw60\nc:ld100_{sl}\nw200\nc:ld300_{sl}\nw500\ns:load{sl}\nc:loadc{sl}\nm:es{sl}:783A:1\nm:lv{sl}:79D8:1\nri:ld{sl}\nchk:imld{sl}:BE00:257:BF\nchk:vecld{sl}:BFBF:3:C35D77\n"
    o += f"hP:6:20\nw100\ns:move{sl}\nc:movec{sl}\nw1000\ns:later{sl}\n"
if var == 'orig':   # original: slower polling -> long fire press; after the slot key it asks for the save drive letter
    o = o.replace("kSpace", "KSpace")
open(f'tools/emu/scen/rs_{name}.txt', 'w').write(o)
