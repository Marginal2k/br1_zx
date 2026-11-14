#!/usr/bin/env python3
"""Rebuild every program from src/ with sjasmplus and compare it byte for byte with the released disks
(reference/raven1/RAVEN1.FDI, RAVEN2.FDI; blocks are unpacked with lpz.py).

    python tools/verify_original.py            # report
Differences are classified:
  DEFR   bytes the author's assembler left as "random" fill (DEFR n): masked, the release bytes are taken
  CRC    the ten check sums CHK#0..9: our port of WCRCEXE (patch_crc.py) is applied after the DEFR bytes are copied in
  CRACK  places where the release (the FDI is a patched/cracked copy) differs from the archive: listed explicitly
  TAIL   bytes after the end of the program in the padded disk block
Anything else is printed as "OTHER" with the address.
"""
import os, re, shutil, struct, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import lpz, patch_crc, extract_ref

SJ = shutil.which('sjasmplus') or r'C:\sjasmplus\sjasmplus.exe'
B = os.path.join(ROOT, 'build', 'faithful')
SRC = os.path.join(ROOT, 'work', 'src_faithful')   # frozen faithful conversion (src/ is edited in phase 2)
BS = chr(92)


def asm(name, main='main.asm', variant=None, outdir=None):
    """Assemble src/<name>/<main>; returns (output dir, list of DEFR regions (page, addr, len))."""
    out = outdir or os.path.join(B, name)
    os.makedirs(out, exist_ok=True)
    src = os.path.join(SRC, name)
    if variant:                         # textual changes of the sources, to rebuild what the release was built from
        tmp = os.path.join(B, 'variant_' + name)
        shutil.rmtree(tmp, ignore_errors=True)
        shutil.copytree(src, tmp)
        for fn, old, new in variant:
            p = os.path.join(tmp, fn)
            t = open(p, encoding='utf-8').read()
            assert old in t, (fn, old)
            open(p, 'w', encoding='utf-8', newline='\n').write(t.replace(old, new, 1))
        src = tmp
    r = subprocess.run([SJ, '--nologo', '--msg=err', '-I', src, '-I', os.path.join(SRC, 'lib'),
                        '-I', os.path.join(ROOT, 'work', 'assets_faithful'), os.path.join(src, main)], cwd=out, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f'assembly of {name} failed:\n{r.stdout}{r.stderr}')
    txt = r.stdout + r.stderr
    return out, [(int(a), int(b, 16), int(c)) for a, b, c in re.findall(r'DEFR (\d+) 0x([0-9A-F]+) (\d+)', txt)]


def runs(idx):
    res = []
    for i in idx:
        if res and i == res[-1][1] + 1:
            res[-1][1] = i
        else:
            res.append([i, i])
    return res


def compare(title, rel, mine, base, known=(), tail_from=None):
    """rel, mine: bytes; known: [(from, to, reason)] absolute addresses. Returns (n_diffs, n_unexplained, text)."""
    n = min(len(rel), len(mine))
    cls = {}
    for a, b, why in known:
        for i in range(a, b + 1):
            cls.setdefault(i, why.split(':')[0])
    diffs = [i for i in range(n) if rel[i] != mine[i]]
    expl = {}
    other = []
    for i in diffs:
        a = base + i
        if tail_from is not None and a >= tail_from:
            expl['TAIL'] = expl.get('TAIL', 0) + 1
        elif a in cls:
            expl[cls[a]] = expl.get(cls[a], 0) + 1
        else:
            other.append(a)
    lines = []
    for x, y in runs(other):
        lines.append(f'      OTHER {x:04X}-{y:04X} ({y - x + 1}) release={rel[x - base:x - base + 8].hex()} ours={mine[x - base:x - base + 8].hex()}')
    sizes = f'release {len(rel)} B, ours {len(mine)} B' if len(rel) != len(mine) else f'{len(rel)} B'
    head = f'{title:34} {"IDENTICAL" if not diffs else f"{len(diffs)} differing"} ({sizes})'
    if expl:
        head += '  explained: ' + ', '.join(f'{k} {v}' for k, v in sorted(expl.items()))
    if other:
        head += f'  UNEXPLAINED {len(other)}'
    return len(diffs), len(other), '\n'.join([head] + lines)


def main():
    report = []
    bad = 0
    tab, boot1, lin1 = extract_ref.disk1()
    f1 = lambda n: open(os.path.join(ROOT, 'work', 'ref', 'disk1', f'f{n:02}.bin'), 'rb').read()

    # ---------------- game
    out, defr = asm('game')
    pages = {n: bytearray(open(os.path.join(out, f'page{n}.bin'), 'rb').read()) for n in (0, 1, 2, 3, 4, 5, 6, 7)}
    fmap = {6: 0, 7: 1, 8: 5, 9: 7, 10: 3, 11: 4, 12: 2, 13: 6}     # disk 1 file -> RAM page
    rel = {}
    for n, p in fmap.items():
        d = f1(n)
        rel[p] = d if n in (6, 13) else lpz.unpack(d)               # files 6 and 13 are stored raw in the release
    base = {5: 0x4000, 2: 0x8000}
    for pg, a, l in defr:
        if pg in rel and l:
            b = base.get(pg, 0xC000)
            pages[pg][a - b:a - b + l] = rel[pg][a - b:a - b + l]    # take the release's "random" bytes
    log = patch_crc.patch(pages[5], pages[0], pages[7], pages[4])
    known = {
        0: [(0xE10D, 0xE10E, 'CRACK: W_PROTEC jumps patched'), (0xE113, 0xE113, 'CRACK'), (0xE124, 0xE125, 'CRACK'),
            (0xE128, 0xE129, 'CRACK'), (0xE12F, 0xE130, 'CRACK')],
        2: [(0x82D9, 0x82D9, 'MAP: archive map is newer'), (0x8319, 0x8319, 'MAP'), (0x8396, 0x8396, 'MAP'),
            (0x83D6, 0x83D6, 'MAP'), (0x88D2, 0x88D4, 'MAP'), (0x8913, 0x8913, 'MAP')],
        6: [(0xFE13, 0xFE86, 'CRACK: start-up stub')],
    }
    names = {0: 'page 0 (#C000, file 6)', 1: 'page 1 (file 7)', 2: 'page 2 (#8000, 4K, file 12)', 3: 'page 3 (file 10)',
             4: 'page 4 (file 11)', 5: 'page 5 (#4000, file 8)', 6: 'page 6 (file 13)', 7: 'page 7 (file 9)'}
    for p in (5, 2, 0, 1, 3, 4, 6, 7):
        r = rel[p]
        t, o, txt = compare('game ' + names[p], r, bytes(pages[p][:len(r)]), base.get(p, 0xC000), known.get(p, ()))
        report.append(txt)
        bad += o
    report.append(f'      (DEFR regions taken from the release: {len(defr)}; check sums recomputed by patch_crc.py: {len(log)}, all equal to the release)')

    # ---------------- START1 (variant: the release has #09 instead of two spaces in the title string)
    var = [('w_start1.asm', 'DEFM\t"  Black Raven StartUp Manager  "', 'DEFB\t9\n\tDEFM\t"Black Raven StartUp Manager  "')]
    out, defr = asm('start1', variant=var)
    b00 = open(os.path.join(out, 'b00.bin'), 'rb').read()
    known = [(0x5E20, 0x5E24, 'DEFR: junk in the padding'), (0x5E62, 0x5E64, 'CRACK: F_DAT entry 6 (page 0 raw at trk 129)'),
             (0x5E77, 0x5E79, 'CRACK: F_DAT entry 13 (page 6 raw at trk 133)'), (0x5FDC, 0x5FDC, 'CRACK: bGloo LD B,5'),
             (0x5FDF, 0x5FDF, 'CRACK: bGloo DEC A removed')]
    t, o, txt = compare('start1 B00 (boot sector)', boot1, b00, 23845, known, tail_from=0x6112)
    report.append(txt); bad += o
    b01 = open(os.path.join(out, 'b01.bin'), 'rb').read()
    t, o, txt = compare('start1 B01 (#6200.., file 4)', f1(4), b01, 0x6200, (), tail_from=0xFE6B)
    report.append(txt); bad += o
    for n, fn in ((2, 'b02.bin'), (3, 'b03.bin')):
        u = lpz.unpack(f1(n))
        m = open(os.path.join(out, fn), 'rb').read()[:len(u)]
        t, o, txt = compare(f'start1 {fn[:3].upper()} (file {n}, unpacked)', u, m, 0xC000)
        report.append(txt); bad += o
    m = open(os.path.join(out, 'b04.bin'), 'rb').read()
    t, o, txt = compare('start1 B04 (#DB00.., file 1)', f1(1), m, 0xDB00, (), tail_from=0xFC00)
    report.append(txt); bad += o

    # ---------------- START2
    out, defr = asm('start2')
    b = open(os.path.join(out, 'b00.bin'), 'rb').read()
    r = open(os.path.join(ROOT, 'work', 'ref', 'disk2', 'start2_b00.bin'), 'rb').read()
    known = [(23845, 23845, 'LABEL: byte #DA-8 applied by the disk maker'), (23847, 23847 + 0x1FF, 'TABLE: file table put in by WDISK2')]
    t, o, txt = compare('start2 boot sector', r, b, 23845, known)
    report.append(txt); bad += o

    # ---------------- FINAL
    out, defr = asm('final')
    b = open(os.path.join(out, 'final.bin'), 'rb').read()
    t, o, txt = compare('final (#8000, file 15)', f1(15), b, 0x8000, (), tail_from=0xBC50)
    report.append(txt); bad += o

    # ---------------- levels
    f2, lin = extract_ref.disk2()
    side0 = bytes(lin[0])
    tbl = open(os.path.join(ROOT, 'archive', 'src', "'W3'", 'ASM80', 'W&DISK2.A80'), 'rb').read().decode('cp866')
    ent = re.findall(r'DEFB\s+(\d+),(\d+)\s*;\s*#(\d+) \((.*?)\)', tbl)
    lv = {}
    for s, sh, n, nm in ent:
        n = int(n)
        if nm.startswith('..' + BS + 'levels'):
            lv[os.path.splitext(nm.split(BS)[-1])[0].upper()] = (int(s) + (256 if n >= 51 else 0)) * 1024 + int(sh) * 4
    ok = 0
    odd = []
    outl = os.path.join(B, 'levels')
    os.makedirs(outl, exist_ok=True)
    for name in sorted(lv):
        mn = 'main_' + name[2:].lower() + '.asm'
        o_, defr = asm('levels', main=mn, outdir=outl)
        m = open(os.path.join(outl, name[2:].lower() + '.bin'), 'rb').read()
        off = lv[name]
        w = struct.unpack_from('<H', side0, off)[0]
        u = lpz.unpack(side0[off:off + w + 2])
        mm = bytearray(m)
        for pg, a, l in defr:
            mm[a - 0x79C0:a - 0x79C0 + l] = u[a - 0x79C0:a - 0x79C0 + l]
        d = [i for i in range(min(len(u), len(mm))) if u[i] != mm[i]]
        if not d and len(u) == len(mm):
            ok += 1
        else:
            odd.append((name, len(u), len(m), [(hex(0x79C0 + x), y - x + 1) for x, y in runs(d)][:6]))
    report.append(f'levels (disk 2 W~xxx)             {ok} of {len(lv)} IDENTICAL after unpacking' + ('' if not odd else f', {len(odd)} differ:'))
    for o_ in odd:
        report.append('      ' + str(o_))
    print('\n'.join(report))
    print(f'\nUNEXPLAINED differing bytes in total: {bad}')


if __name__ == '__main__':
    main()
