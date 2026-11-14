import json,sys,re
for name in sys.argv[1:]:
    try: d=json.load(open(f'build/emu/{name}.json'))['data']
    except Exception as e: print(name,'NO JSON'); continue
    print('==',name, 'frames', json.load(open(f'build/emu/{name}.json'))['frames'])
    mem=d['mem']
    tags=sorted({k[2:] for k in mem if k.startswith('lv')})
    for t in tags: print(' ',t,'LEVEL=',mem.get('lv'+t),'ExtSet=',mem.get('es'+t))
    for l in d['log']:
        if re.search(r'FAIL|PASS|idle|js ay|!!',l): print('  ',l[:200])
