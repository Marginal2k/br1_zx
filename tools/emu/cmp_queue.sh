#!/bin/bash
# cmp_queue.sh QUEUEFILE : each line "name[:1mb]" ; runs missing orig (c_NAME_o) and ours (c_NAME_n) one at a time on 8851
cd /c/Users/User/Claude-Fable/br
while true; do
  line=$(grep -v '^#' $1 | grep -v '^DONE' | head -1)
  [ -z "$line" ] && break
  n=${line%%:*}; mode=${line#*:}; [ "$mode" = "$line" ] && mode=""
  [ -f build/emu/c_${n}_o.json ] || bash tools/emu/runq.sh 8851 c_${n}_o trd=ref/BR_1.TRD drive2=ref/BR_2.TRD machine=128k beta=1 steps=@cmp_${n}_o budget=900000 </dev/null
  if [ "$mode" = "1mb" ]; then A="trd=br_1mb.trd"; else A="trd=br1.trd drive2=br2.trd"; fi
  [ -f build/emu/c_${n}_n.json ] || bash tools/emu/runq.sh 8851 c_${n}_n $A machine=128k beta=1 steps=@cmp_${n}_n budget=900000 </dev/null
  sed -i "0,/^$line\$/s//DONE $line/" $1
done
echo ALLDONE >> $1
