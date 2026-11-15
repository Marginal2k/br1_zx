import sys, warnings
warnings.filterwarnings('ignore')
from PIL import Image, ImageChops
# usage: cmp_sheet.py ORIGRUN NEWRUN OUT shot1 shot2 ... ; orig row above ours; prints pixel diffs (full canvas, border included)
o,n,out=sys.argv[1:4]; shots=sys.argv[4:]
def L(r,s):
    try: return Image.open(f'build/emu/{r}_{s}.png').convert('RGB')
    except Exception: return None
cols=min(len(shots),4); H=288; Wd=384; SC=0.75
rowsets=[shots[i:i+cols] for i in range(0,len(shots),cols)]
W=Image.new('RGB',((Wd+2)*cols,(2*H+6)*len(rowsets)),(255,0,255))
for ri,rs in enumerate(rowsets):
    for ci,s in enumerate(rs):
        a=L(o,s); b=L(n,s)
        if a is None or b is None: print(s,'missing',a is None,b is None); continue
        sz=(int(a.size[0]*SC),int(a.size[1]*SC)); W.paste(a.resize(sz),(ci*(Wd+2),ri*(2*H+6))); W.paste(b.resize(sz),(ci*(Wd+2),ri*(2*H+6)+H+2))
        if a.size!=b.size: print(s,'size differs'); continue
        d=ImageChops.difference(a,b); bb=d.getbbox(); px=sum(1 for p in d.getdata() if p!=(0,0,0))
        print(f'{s}: diff px={px} bbox={bb}')
W.save(out); print('saved',out)
