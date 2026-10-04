# Embeds mod_js.js into the C header consumed by czn_mod.cpp.
import io, os, hashlib

here = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(here, "mod_js.js")
dst = os.path.join(here, "mod_js.h")

js = io.open(src, "r", encoding="utf-8").read()
DELIM = "MODJSZ"
assert DELIM not in js and ")MODJSZ" not in js, "raw-string terminator collision"
assert "\r" not in js, "CRLF leaked into js bundle"

with io.open(dst, "w", encoding="utf-8", newline="\n") as f:
    f.write("// generated from mod_js.js by gen_headers.py -- do not edit\n")
    f.write("static const char kModJs[] = R\"%s(\n%s\n)%s\";\n" % (DELIM, js, DELIM))

print("mod_js.h: %d bytes (js: %d bytes, sha256 %s)" %
      (os.path.getsize(dst), len(js), hashlib.sha256(js.encode("utf-8")).hexdigest()[:16]))
