#!/bin/bash
# cmp_run.sh NAME  : runs scen cmp_NAME_o.txt (original) then cmp_NAME_n.txt (ours) on port 8851 -> build/emu/cmp_NAME_o/n.*
# optional 2nd arg = ours trd (default br1.trd drive2=br2.trd); "1mb" -> br_1mb.trd
cd /c/Users/User/Claude-Fable/br
s=$1
bash tools/emu/runq.sh 8851 c_${s}_o trd=ref/BR_1.TRD drive2=ref/BR_2.TRD machine=128k beta=1 steps=@cmp_${s}_o budget=900000 </dev/null
if [ "$2" = "1mb" ]; then A="trd=br_1mb.trd"; else A="trd=br1.trd drive2=br2.trd"; fi
bash tools/emu/runq.sh 8851 c_${s}_n $A machine=128k beta=1 steps=@cmp_${s}_n budget=900000 </dev/null
echo DONE $s
