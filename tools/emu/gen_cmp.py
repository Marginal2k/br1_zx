import sys
# gen_cmp.py : writes cmp_game_{o,n}_<side><lvl>.txt  (side 1=humans 2=kungs; lvl 1..17; no cheat; LEVEL poked at menu)
for side in (1,2):
  for lvl in (1,5,10,16):
    for tag in 'on':
        L=[]
        if tag=='n': L+=['boot','w200','K2']
        else: L+=['w400','K2']
        L+=['w2500','KSpace','w150','s:menu']
        if lvl>1: L+=['p79D8:%02X'%lvl]
        L+=[f'K{side}','w60','s:diff','K1','w60']
        if tag=='n': L+=['s:miss','K1','w60']
        L+=['s:dsk','Kb','w300','s:castle','kSpace','w100','s:brief','w300','kSpace','w100','s:start','w300','s:g1','w600','s:g2','kh','w60','s:pause','kSpace','w60','s:g3','m:lv:79D8:1']
        open(f'tools/emu/scen/cmp_game_{tag}_{side}{lvl}.txt','w').write('\n'.join(L)+'\n')
