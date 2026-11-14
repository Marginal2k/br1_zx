"""Общие функции инструментов редактора (editor/tools, editor/test): доступ к tools/ игры только на чтение."""
import glob
import os
import subprocess
import sys
import tempfile

ED = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(ED)
sys.path.insert(0, os.path.join(ROOT, 'tools'))

import assets as assets_tool   # noqa: E402
import disasm                  # noqa: E402
import levasm                  # noqa: E402
import levels                  # noqa: E402

LEVELS97 = [f'{s}{i:02}' for s in '12' for i in range(1, 17)]    # 101..116, 201..216 (117end/217end - код концовок)


def utf8_stdout():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass


_assets_dir = None


def assets_dir():
    """двоичные ресурсы, собранные из assets_src во временный каталог (как build.py make_assets, но не трогая build/)."""
    global _assets_dir
    if _assets_dir is None:
        _assets_dir = tempfile.mkdtemp(prefix='bred_assets_')
        assets_tool.do_import(os.path.join(ROOT, 'assets_src'), _assets_dir)
    return _assets_dir


def build97(num):
    """блок уровня 1997 г. (12608 байт) из src/levels/main_<num>.asm и ресурсов assets_src."""
    out = tempfile.mkdtemp(prefix='bred_l97_')
    r = subprocess.run([disasm.SJASM, '--nologo', '--msg=err', '-I', os.path.join(ROOT, 'src', 'levels'), '-I', assets_dir(),
                        os.path.join(ROOT, 'src', 'levels', f'main_{num}.asm')], capture_output=True, text=True, cwd=out)
    if r.returncode:
        raise RuntimeError(f'main_{num}.asm: {r.stdout}{r.stderr}')
    with open(os.path.join(out, f'{num}.bin'), 'rb') as f:
        return f.read()


def ref_blocks():
    ref = os.path.join(ROOT, 'reference', 'cs1999', 'levels_ext')
    return {os.path.basename(p)[:-4]: open(p, 'rb').read() for p in sorted(glob.glob(os.path.join(ref, '*.bin')))}
