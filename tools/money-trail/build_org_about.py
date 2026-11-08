"""Build site/money-trail/org-about.js from tools/money-trail/org_about.json (D259).

The JSON is checked by hand: each group's own website was opened on the "checked" date and the quote copied word for word.
This script only checks the shape and writes the JS file. Run from the repository root:
    python tools/money-trail/build_org_about.py
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "tools" / "money-trail" / "org_about.json"
OUT = ROOT / "site" / "money-trail" / "org-about.js"
HTTPS = re.compile(r"^https://[^\s<>\"']+$")

data = json.loads(SRC.read_text(encoding="utf-8"))
seen = {}
orgs = []
for o in data["orgs"]:
    for k in ("key", "org_name", "names", "site", "about_url", "quote"):
        if not o.get(k):
            raise SystemExit(f"{o.get('key')}: missing {k}")
    for k in ("site", "about_url"):
        if not HTTPS.match(o[k]):
            raise SystemExit(f"{o['key']}: {k} must be an https link")
    if "—" in o["quote"] and o["key"] != "seiu":
        print(f"note: {o['key']} quote has an em dash (it is the group's own text, kept as written)")
    if len(o["quote"].split()) > 60:
        raise SystemExit(f"{o['key']}: quote is longer than 60 words")
    for n in o["names"]:
        key = re.sub(r"[^A-Z0-9]", "", n.upper())
        if key in seen:
            raise SystemExit(f"{n} is listed under both {seen[key]} and {o['key']}")
        seen[key] = o["key"]
    orgs.append({k: o[k] for k in ("key", "org_name", "names", "site", "about_url", "quote", "note_for") if k in o})

body = json.dumps({"checked": data["checked"], "orgs": orgs}, ensure_ascii=False, separators=(",", ":"))
OUT.write_text(
    "// What groups in the Money web say about themselves, quoted from their own websites (D259).\n"
    "// Made by tools/money-trail/build_org_about.py from tools/money-trail/org_about.json; do not edit by hand.\n"
    f"window.TW_ORG_ABOUT={body};\n",
    encoding="utf-8",
)
print(f"wrote {OUT.relative_to(ROOT)}: {len(orgs)} groups, {len(seen)} names")
