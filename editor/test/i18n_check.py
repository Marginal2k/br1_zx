"""Все русские строки интерфейса (ключи перевода) должны быть в js/i18n.js: python editor/test/i18n_check.py [--check]"""
import html
import json
import os
import re
import sys

ED = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
keys = []


def add(k):
    k = k.strip()
    if k and re.search('[А-Яа-яЁё]', k) and k not in keys:
        keys.append(k)


for f in ['js/app.js', 'js/core.js', 'js/gen.js']:
    s = open(os.path.join(ED, f), encoding='utf-8').read()
    for m in re.finditer(r"\b(?:t|tr)\('((?:[^'\\]|\\.)*)'", s):
        add(m.group(1).replace("\\'", "'"))
s = open(os.path.join(ED, 'js/app.js'), encoding='utf-8').read()
for name in ['HNAME', 'SIDE_NAME', 'INK']:
    m = re.search(r'const ' + name + r' = \[(.*?)\];', s, re.S)
    for x in re.findall(r"'([^']*)'", m.group(1)):
        add(x)
m = re.search(r'const GF = \[(.*?)\n  \];', s, re.S)
for x in re.findall(r"'([^']*)'", m.group(1)):
    add(x)
m = re.search(r'const P = \{(.*?)\n  \};', s, re.S)
for x in re.findall(r"'([^']*)'", m.group(1)):
    add(x)
for x in ['людей', 'кунгов', 'пленников']:
    add(x)
h = open(os.path.join(ED, 'index.html'), encoding='utf-8').read()
body = h[h.index('<body>'):h.index('<script')]
for m in re.finditer(r'(?:title|placeholder)="([^"]*)"', body):
    add(html.unescape(m.group(1)))
for m in re.finditer(r'>([^<]+)<', body):
    add(html.unescape(m.group(1)))

if True:
    src = open(os.path.join(ED, 'js/i18n.js'), encoding='utf-8').read()
    have = json.loads(re.search(r'const EN = (\{.*?\n\});', src, re.S).group(1))
    miss = [k for k in keys if k not in have]
    extra = [k for k in have if k not in keys]
    print('keys', len(keys), 'missing', len(miss), 'unused', len(extra))
    for k in miss:
        print('MISSING:', k)
    for k in extra:
        print('UNUSED:', k)
    sys.exit(1 if miss else 0)
