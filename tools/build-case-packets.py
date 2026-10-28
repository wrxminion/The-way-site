#!/usr/bin/env python3
"""Build one downloadable research packet per case page.

Reads site/preview/pages/cases/<slug>.html and writes
site/preview/pages/cases/packets/<slug>-research-packet.html.
Each packet is a single self-contained file: the review status, the article
with its links, a numbered list of every link used, and the date it was built.
Run it again after any case page changes, then commit the packets.
No third-party packages. Usage: python3 tools/build-case-packets.py [slug ...]
"""
import html
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CASES = ROOT / "site" / "preview" / "pages" / "cases"
OUT = CASES / "packets"
BASE = "https://michiinstitute.com/preview/pages/cases/"

NOT_REVIEWED = ("Not yet reviewed by a person. This page was researched and written with the help of "
                "AI tools. Every key claim is labeled by evidence status near the end, but no person "
                "has checked the sources yet. Treat it as a draft.")
REVIEWED = "Reviewed by a person. See the review history for who checked what and when."

CSS = """body{font:16px/1.6 Georgia,serif;max-width:820px;margin:32px auto;padding:0 18px;color:#111;background:#fff}
h1{font-size:30px;line-height:1.2;margin:.2em 0}h2{margin-top:1.6em}.small{font:13px/1.4 Arial,sans-serif;color:#444}
.status{border:1px solid #888;border-left:6px solid #000;padding:10px 14px;margin:16px 0;font:15px/1.5 Arial,sans-serif;background:#fffbe9}
table{border-collapse:collapse;width:100%;font:13px/1.45 Arial,sans-serif;margin:14px 0}td,th{border:1px solid #bbb;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#eee}a{color:#0a4a63;word-break:break-word}ol.links{font:13px/1.5 Arial,sans-serif}
@media print{.status{background:#fff}h2{break-after:avoid}tr{break-inside:avoid}}"""


def strip_tags(s):
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s))).strip()


def build(slug):
    src = (CASES / (slug + ".html")).read_text(encoding="utf-8")
    title = strip_tags(re.search(r"<h1>(.*?)</h1>", src, re.S).group(1))
    overline = strip_tags(re.search(r'class="overline">(.*?)</div>', src, re.S).group(1))
    meta = re.search(r'<div class="meta">(.*?)</div>', src, re.S)
    meta = strip_tags(meta.group(1)) if meta else ""
    start = src.index('<div class="essay-body">') + len('<div class="essay-body">')
    body = src[start:src.index("</div></article>", start)]
    body = re.sub(r'<aside class="review-banner[^>]*>.*?</aside>', "", body, flags=re.S)
    body = re.sub(r'<div class="meta">.*?</div>', "", body, count=1, flags=re.S)
    body = re.sub(r'<div class="report-box">.*?</div>', "", body, flags=re.S)
    reviewed = bool(re.search(r'class="review-banner reviewed"', src))
    # numbered list of every distinct link used in the article
    links, seen = [], {}
    for m in re.finditer(r'<a [^>]*href="(https?://[^"]+)"[^>]*>(.*?)</a>', body, re.S):
        url, text = html.unescape(m.group(1)), strip_tags(m.group(2))
        if url not in seen:
            seen[url] = len(links) + 1
            links.append((url, text))
    items = "".join('<li><a href="%s">%s</a><br><span class="small">%s</span></li>\n'
                    % (html.escape(u), html.escape(t[:120] or u), html.escape(u)) for u, t in links)
    page = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{t} - research packet - The Way</title>
<style>{css}</style></head><body>
<p class="small">The Way research packet. Built {today}. Online version: <a href="{base}{slug}.html">{base}{slug}.html</a></p>
<p class="small">{over}</p>
<h1>{t}</h1>
<div class="status"><strong>{status}</strong><br>{meta}. Preliminary research, not a final verdict. Found an error? Report it on the online page; corrections stay on the record with their date and reason.</div>
{body}
<h2>Every link used in this article</h2>
<ol class="links">
{items}</ol>
<p class="small">Not left. Not right. We are The Way. A nonpartisan research project, not a political party.</p>
</body></html>
""".format(t=html.escape(title), css=CSS, today=date.today().isoformat(), base=BASE, slug=slug,
           over=html.escape(overline), status=REVIEWED if reviewed else NOT_REVIEWED,
           meta=html.escape(meta.split(" · ")[0] if meta else "Sources date not stated"),
           body=body, items=items)
    OUT.mkdir(exist_ok=True)
    (OUT / (slug + "-research-packet.html")).write_text(page, encoding="utf-8")
    return len(links)


def main():
    slugs = sys.argv[1:] or sorted(p.stem for p in CASES.glob("*.html")
                                   if p.stem != "index" and "report-box" in p.read_text(encoding="utf-8"))
    for s in slugs:
        print("%-40s %d links" % (s, build(s)))
    print("built", len(slugs), "packets in", OUT)


if __name__ == "__main__":
    main()
