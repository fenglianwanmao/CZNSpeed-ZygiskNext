#!/bin/bash
# Build the czn-speed Zygisk module zip.
# Requires: ANDROID_NDK_HOME (NDK r25+), python3.
set -e
cd "$(dirname "$0")"

: "${ANDROID_NDK_HOME:?set ANDROID_NDK_HOME to your Android NDK path}"

HOST_TAG=$(ls "$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/" | head -1)
CC="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$HOST_TAG/bin/clang++"
API=24

# python3 alias stubs (e.g. the Windows Store launcher) exit without output;
# fall back to `python` when python3 cannot actually run code
PY=python3
command -v "$PY" >/dev/null 2>&1 && ! "$PY" -c "" 2>/dev/null && PY=python

# 1) assemble the JS bundle from the game-derived script bundle
$PY extract_js.py

# 2) embed it into the C header
$PY gen_headers.py

# 3) compile the native Zygisk module
"$CC" --target=aarch64-linux-android$API -shared -O2 -std=c++17 \
  -fno-exceptions -fno-rtti -fvisibility=hidden -fno-stack-protector \
  -mno-outline-atomics -nostdlib++ \
  -Wall -Wextra -Wno-unused-parameter \
  czn_mod.cpp -o out.so -llog -ldl

# 4) sanity: only zygisk_module_entry should be exported
if command -v llvm-nm >/dev/null 2>&1; then
  "$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$HOST_TAG/bin/llvm-nm" -D --defined-only out.so | grep -E " T " || true
elif command -v nm >/dev/null 2>&1; then
  nm -D --defined-only out.so | grep -E " T " || true
fi

# 5) package the KSU module zip
$PY - <<'PYEOF'
import zipfile, os, hashlib
out = "czn_speed.zip"
if os.path.exists(out):
    os.remove(out)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    z.write("module.prop", "module.prop")
    z.write("out.so", "zygisk/arm64-v8a.so")
h = hashlib.sha256(open(out, "rb").read()).hexdigest()
open(out + ".sha256", "w").write(h + "  " + out + "\n")
print("zip:", out, os.path.getsize(out), "bytes sha256:", h[:16], "...")
PYEOF

echo BUILD_DONE
