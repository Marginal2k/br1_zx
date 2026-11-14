import sys
# usage: gen_play.py NAME SIDE(H|K) SET(std|ext) LEVEL(1 = real menu start, no cheat)  -> tools/emu/scen/tst_NAME.txt (~60-200 s of play)
name, side, setn = sys.argv[1:4]
lvl = int(sys.argv[4]) if len(sys.argv) > 4 else 1
ext = setn == 'ext'
PRE = "dEnter\nw300\nuEnter\nw2500\nKSpace\nw150\nK8\nw20\nK6\nK2\nK7\nK5\nw20\n"
o = "boot\n"
if lvl == 1:
    o += "w200\nK2\nw2500\nKSpace\nw150\n"
    o += f"K{1 if side=='H' else 2}\nw60\nK1\nw60\nK{2 if ext else 1}\nw300\nKSpace\nw150\n"
else:
    o += PRE + f"c:{name}_cheat\n" + "h2:2:12\n" * (lvl - 1) + f"K6\nw20\nK{1 if side=='H' else 2}\nw60\nK1\nw60\nK{2 if ext else 1}\nw300\nKSpace\nw150\n"
o += f"c:{name}_00\ns:{name}_00\nm:lv{name}:79D8:1\nm:es{name}:783A:1\njs:ay{name}_0:ay\n"
pts = [(40,60),(90,60),(120,110),(60,120),(160,80),(100,40),(30,90),(140,130)]
x, y = 0x7F, 0x88
def mv(x, y, tx, ty):
    s = ""
    dx, dy = tx - x, ty - y
    if dx > 0: s += f"hP:{round(dx/1.95)}:3\n"
    if dx < 0: s += f"hO:{round(-dx/1.95)}:3\n"
    if dy > 0: s += f"hA:{round(dy/1.95)}:3\n"
    if dy < 0: s += f"hQ:{round(-dy/1.95)}:3\n"
    return s
for i in range(10):
    tx, ty = pts[i % len(pts)]
    o += mv(x, y, tx, ty); x, y = tx, ty
    o += "kSpace\nw60\n"
    tx2, ty2 = pts[(i + 3) % len(pts)]
    o += mv(x, y, tx2, ty2); x, y = tx2, ty2
    o += "kSpace\nw300\n"
    if i % 3 == 2:
        o += f"c:{name}_{i:02d}\ns:{name}_{i:02d}\nidle:{name}_{i}:200\njs:ay{name}_{i}:ay\n"
o += f"idle:{name}_end:600\nc:{name}_end\ns:{name}_end\nm:lv{name}e:79D8:1\nm:es{name}e:783A:1\nr:{name}_end\n"
open(f"tools/emu/scen/tst_{name}.txt", "w").write(o)
