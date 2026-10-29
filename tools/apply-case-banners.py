#!/usr/bin/env python3
"""Put each case banner on its case page and on its card in /cases/.

Reads site/img/case-banners/banners.json ({"<slug>": {"alt": "", "art": [...]}}). For every slug it
needs site/img/case-banners/<slug>-1600.webp and <slug>-800.webp (4:1), the AI image. It adds
  - a <figure class="case-banner"> right after the page header (under the title) in site/cases/<slug>.html,
    with a small AI-generated note under the image ("Submit your art" links to the members sign-up art question)
  - an <img class="card-banner"> at the top of the case's card in site/cases/index.html
and sets the cases.css stamp on the pages it touches. Safe to run again: existing
banner markup is replaced, never duplicated.

Real art: add "art": [{"id": "ana-1", "credit": "Ana R.", "url": "https://portfolio.example", "alt": ""}, ...] to a slug and drop in
<slug>-<id>-1600.webp and <slug>-<id>-800.webp. Once a slug has art, the AI image is no longer used (the AI files are
not needed); the page shows "Art by <credit>", linked to "url" (optional, https) when given. The script also writes
site/artists/index.html, the "All artists on our site" page, from the same entries. With two or more pieces the page picks one per visit
(site/cases/banner-rotate.js); every piece is 4:1, so nothing jumps. Without JavaScript the first piece shows.

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
CSS_STAMP = "cases.css?v=vf6"


NOTE = ('<figcaption class="case-banner-note">Yes, this image was AI generated. Don\'t like it? '
        '<a href="/members/submit-art.html">Submit your art</a> and we\'ll use it with credit.</figcaption>')


SUBMIT = '<a href="/members/submit-art.html">Submit your art</a>'
ROTATE_JS = '<script src="/cases/banner-rotate.js?v=1" defer></script>\n'


def credit_html(a):
    """The artist's name, linked to their portfolio when they gave an https one."""
    name = escape(a["credit"])
    url = a.get("url", "")
    if url.startswith("https://"):
        return '<a class="case-banner-credit" href="%s" rel="noopener nofollow ugc">%s</a>' % (escape(url, quote=True), name)
    return '<span class="case-banner-credit">%s</span>' % name


def note_for(art):
    if art:
        return '<figcaption class="case-banner-note">Art by %s. Want yours here? %s.</figcaption>' % (credit_html(art[0]), SUBMIT)
    return NOTE


def img_tag(slug, alt, cls, sizes, lazy, stem=None):
    base = f"/img/case-banners/{stem or slug}"
    loading = 'loading="lazy" ' if lazy else ""
    return (f'<img class="{cls}" src="{base}-1600.webp" srcset="{base}-800.webp 800w, {base}-1600.webp 1600w" '
            f'sizes="{sizes}" width="1600" height="400" alt="{escape(alt, quote=True)}" {loading}decoding="async">')


def artists_page(data):
    """site/artists/index.html: every credited artist, their portfolio link and the pages their art is on."""
    people = {}
    for slug, meta in data.items():
        m = re.search(r"<h1[^>]*>(.*?)</h1>", (CASES / f"{slug}.html").read_text(encoding="utf8"), flags=re.S)
        title = re.sub(r"<[^>]+>", "", m.group(1)).strip() if m else slug
        for a in meta.get("art", []):
            p = people.setdefault(a["credit"].strip().lower(), {"credit": a["credit"], "url": a.get("url", ""), "pages": {}})
            if not p["url"] and a.get("url"):
                p["url"] = a["url"]
            p["pages"][slug] = title
    items = []
    for p in sorted(people.values(), key=lambda x: x["credit"].lower()):
        name = credit_html(p)
        pages = ", ".join('<a href="/cases/%s.html">%s</a>' % (sl, escape(t)) for sl, t in sorted(p["pages"].items(), key=lambda kv: kv[1].lower()))
        items.append("<li><strong>%s</strong><br>Art on: %s</li>" % (name, pages))
    body = ('<ul class="artist-list">' + "".join(items) + "</ul>") if items else (
        "<p>No artist art is on the site yet. Every picture you see today is AI generated, and we would love to replace them. %s.</p>" % SUBMIT)
    src = (SITE / "founder.html").read_text(encoding="utf8")
    pre = src[: src.index('<header class="essay-top">')]
    post = src[src.index("</article>"):]
    post = re.sub(r'<section class="depth-cta">.*?</section>\n?', "", post, flags=re.S)
    pre = pre.replace("Where My Way Began", "All artists on our site").replace("One person’s path to an idea that should belong to everyone.", "The people whose art is on our pages, with links to their work.")
    pre = pre.replace("founder.html", "artists/").replace('href="favicon.svg"', 'href="/favicon.svg"')
    pre = pre.replace("</head>", '<link rel="stylesheet" href="/cases/cases.css?v=%s">\n</head>' % CSS_STAMP.split("=")[1], 1)
    head = ('<header class="essay-top"><div class="overline">Credits</div><h1>All artists on our site</h1>'
            '<p class="essay-intro">Real art replaces our AI generated pictures page by page. Every artist is credited here and under their picture.</p></header>\n')
    mid = ('<article class="essay-content" id="read"><div class="essay-body">\n' + body +
           '\n<p>Make art? %s. Read <a href="/members/submit-art.html#why">why we use AI pictures for now</a>.</p>\n' % SUBMIT)
    out = SITE / "artists" / "index.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(pre + head + mid + post, encoding="utf8")


def main():
    data = {k: v for k, v in json.loads((IMG / "banners.json").read_text(encoding="utf8")).items()
            if not k.startswith("_")}
    index_path = CASES / "index.html"
    index = index_path.read_text(encoding="utf8")
    problems = []
    for slug, meta in data.items():
        art = meta.get("art", [])
        stems = [f"{slug}-{a['id']}" for a in art] or [slug]
        for st in stems:
            for w in (800, 1600):
                if not (IMG / f"{st}-{w}.webp").exists():
                    problems.append(f"missing {st}-{w}.webp")
        if any(not a.get("id") or not a.get("credit") for a in art):
            problems.append(f"{slug}: every art piece needs an id and a credit")
            continue
        page = CASES / f"{slug}.html"
        if not page.exists():
            problems.append(f"no case page {slug}.html")
            continue
        alt = (art[0].get("alt", "") if art else meta.get("alt", ""))
        s = page.read_text(encoding="utf8")
        s = re.sub(r'<figure class="case-banner[^"]*"[^>]*>.*?</figure>\n?', "", s, flags=re.S)
        s = s.replace(ROTATE_JS, "")
        rot = ""
        if len(art) > 1:
            pieces = [{"s": f"/img/case-banners/{slug}-{a['id']}", "c": a["credit"], "u": a.get("url", ""), "a": a.get("alt", "")} for a in art]
            rot = ' data-rotate="%s"' % escape(json.dumps(pieces, separators=(",", ":")), quote=True)
        fig = ('<figure class="case-banner"%s>' % rot
               + img_tag(slug, alt, "case-banner-img", "(max-width:1000px) 100vw, 950px", True, stems[0])
               + note_for(art) + "</figure>\n")
        s, n = re.subn(r'(<header class="essay-top">.*?</header>\n?)', lambda m: m.group(1) + fig, s, count=1, flags=re.S)
        if n != 1:
            problems.append(f"{slug}: no essay-top header")
            continue
        s = re.sub(r"cases\.css\?v=[A-Za-z0-9]+", CSS_STAMP, s)
        if rot:
            s = s.replace("</body>", ROTATE_JS + "</body>", 1)
        page.write_text(s, encoding="utf8")
        # card on the index
        index = re.sub(r'(<a class="hub-card[^"]*" href="%s\.html">)<img class="card-banner"[^>]*>' % re.escape(slug), r"\1", index)
        card = img_tag(slug, alt, "card-banner", "(max-width:700px) 100vw, 490px", True, stems[0])
        index, n = re.subn(r'(<a class="hub-card" href="%s\.html">)' % re.escape(slug), lambda m: m.group(1) + card, index, count=1)
        if n != 1:
            problems.append(f"{slug}: no card on index")
    index = re.sub(r"cases\.css\?v=[A-Za-z0-9]+", CSS_STAMP, index)
    index_path.write_text(index, encoding="utf8")
    if not problems:
        artists_page(data)
    for p in problems:
        print("PROBLEM:", p)
    print(f"done: {len(data)} banners, {len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
