import json,sys
j=json.load(open(f'build/emu/{sys.argv[1]}.json'))['data']
m=j.get('mem',{})
for k,v in m.items():
    if len(v)<=8 or (isinstance(v,str) and len(v)<=16): print('mem',k,v)
