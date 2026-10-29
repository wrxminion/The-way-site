#!/usr/bin/env python3
"""Put each case banner on its case page and on its card in /cases/.

Reads site/img/case-banners/banners.json ({"<slug>": {"alt": ""}}). For every slug it
needs site/img/case-banners/<slug>-1600.webp and <slug>-800.webp (4:1). It adds
  - a <figure class="case-banner"> right after the page header (under the title) in site/cases/<slug>.html
  - an <img class="card-banner"> at the top of the case's card in site/cases/index.html
and sets the cases.css stamp on the pages it touches. Safe to run again: existing
banner markup is replaced, never duplicated.

Run python3 tools/build-case-packets.py afterwards (the packets embed the article).
Usage: python3 tools/apply-case-banners.py
"""
import json
import re
import sys
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
CASES = SITE / "cases"
IMG = SITE / "img" / "case-banners"
CSS_STAMP = "cases.css?v=8"


def img_tag(slug, alt, cls, sizes, lazy):
    base = f"/img/case-banners/{slug}"
    loading = 'loading="lazy" ' if lazy else ""
    return (f'<img class="{cls}" src="{base}-1600.webp" srcset="{base}-800.webp 800w, {base}-1600.webp 1600w" '
            f'sizes="{sizes}" width="1600" height="400" alt="{escape(alt, quote=True)}" {loading}decoding="async">')


def main():
    data = {k: v for k, v in json.loads((IMG / "banners.json").read_text(encoding="utf8")).items()
            if not k.startswith("_")}
    index_path = CASES / "index.html"
    index = index_path.read_text(encoding="utf8")
    problems = []
    for slug, meta in data.items():
        for w in (800, 1600):
            if not (IMG / f"{slug}-{w}.webp").exists():
                problems.append(f"missing {slug}-{w}.webp")
        page = CASES / f"{slug}.html"
        if not page.exists():
            problems.append(f"no case page {slug}.html")
            continue
        alt = meta.get("alt", "")
        s = page.read_text(encoding="utf8")
        s = re.sub(r'<figure class="case-banner">.*?</figure>\n?', "", s, flags=re.S)
        fig = ('<figure class="case-banner">'
               + img_tag(slug, alt, "case-banner-img", "(max-width:1000px) 100vw, 950px", True)
               + "</figure>\n")
        s, n = re.subn(r'(<header class="essay-top">.*?</header>\n?)', lambda m: m.group(1) + fig, s, count=1, flags=re.S)
        if n != 1:
            problems.append(f"{slug}: no essay-top header")
            continue
        s = re.sub(r"cases\.css\?v=\d+", CSS_STAMP, s)
        page.write_text(s, encoding="utf8")
        # card on the index
        index = re.sub(r'(<a class="hub-card[^"]*" href="%s\.html">)<img class="card-banner"[^>]*>' % re.escape(slug), r"\1", index)
        card = img_tag(slug, alt, "card-banner", "(max-width:700px) 100vw, 490px", True)
        index, n = re.subn(r'(<a class="hub-card" href="%s\.html">)' % re.escape(slug), lambda m: m.group(1) + card, index, count=1)
        if n != 1:
            problems.append(f"{slug}: no card on index")
    index = re.sub(r"cases\.css\?v=\d+", CSS_STAMP, index)
    index_path.write_text(index, encoding="utf8")
    for p in problems:
        print("PROBLEM:", p)
    print(f"done: {len(data)} banners, {len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
