#!/bin/bash
# usage: runq.sh PORT NAME "run_emu args after play name=NAME" ; retries up to 4 times until build/emu/NAME.json exists
port=$1; name=$2; shift 2
for i in 1 2 3 4; do
  rm -f build/emu/$name.json
  EMU_PORT=$port PYTHONIOENCODING=utf-8 python tools/emu/run_emu.py play name=$name "$@" > build/emu/$name.log 2>&1
  [ -f build/emu/$name.json ] && break
  sleep 5
done
