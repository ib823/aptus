#!/usr/bin/env bash
# ABAP Unit in the open-abap emulator. The emulator computes packed DIV, MOD and / in float64, so
# test data whose intermediate values reach 2^53 is generated only for real ABAP systems:
# with EMULATOR=1 the ltc_*_kernel classes carry no cases.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$HERE/build-emulator"
rm -rf "$WORK"
mkdir -p "$WORK"
cp -r "$HERE/src" "$HERE/tools" "$HERE/sim" "$HERE/abaplint.json" "$HERE/abap_transpile.json" "$WORK/"
ln -s "$HERE/node_modules" "$WORK/node_modules"
cd "$WORK"
EMULATOR=1 python3 -I tools/gen_alloc_tests.py
EMULATOR=1 python3 -I tools/gen_money_tests.py
python3 -I tools/gen_guard_tests.py
npx abap_transpile > transpile.log
node output/index.mjs
