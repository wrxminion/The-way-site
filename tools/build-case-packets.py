#!/usr/bin/env python3
"""Build one downloadable research packet per case page.

Reads site/cases/<slug>.html and writes
site/cases/packets/<slug>-research-packet.html.

Each packet is a single self-contained file that prints well (the browser's Print,
then Save as PDF, gives a PDF). It holds:
  cover and how to cite; review status and who verified it; the article;
  per-source metadata (title, publisher, date, URL, checked date, opened or not,
  snapshot link and SHA-256 where we have them); every link used in the article;
  revision history (the page's correction history plus its git change log);
  and the build date.

Optional data file tools/case-packet-data.json (absent means "none recorded"):
  {"reviews":   {"<slug>": {"reviewed_by": "Name", "reviewed_at": "2026-11-02"}},
   "snapshots": {"<slug>": [{"url": "https://source...", "wayback": "https://web.archive.org/web/...",
                             "sha256": "64 hex", "captured": "2026-10-25"}]}}
Export it from the evidence vault or the source_snapshots table; never type hashes by hand.

Run again after any case page changes, then commit the packets. No third-party
packages, no zips (CONTRIBUTING rule 8). Usage: python3 tools/build-case-packets.py [slug ...]
"""
import html
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CASES = ROOT / "site" / "cases"
OUT = CASES / "packets"
DATA = ROOT / "tools" / "case-packet-data.json"
BASE = "https://michiinstitute.com/cases/"
REVIEW_PAGE = "https://michiinstitute.com/members/reviews.html?case="

NOT_REVIEWED = ("Not yet reviewed by a person. This page was researched and written with the help of "
                "AI tools. Every key claim is labeled by evidence status near the end, but no person "
                "has checked the sources yet. Treat it as a draft.")

NOISE = re.compile(r"bump|cache stamp|waybar|research packet|rename on static", re.I)  # housekeeping, not content

CSS = """body{font:16px/1.6 Georgia,serif;max-width:820px;margin:32px auto;padding:0 18px;color:#111;background:#fff}
h1{font-size:30px;line-height:1.2;margin:.2em 0}h2{margin-top:1.8em;border-top:2px solid #111;padding-top:.5em}
.small,.sans{font:13px/1.45 Arial,sans-serif;color:#333}.sans{font-size:14px;color:#111}
.status{border:1px solid #888;border-left:6px solid #000;padding:10px 14px;margin:16px 0;font:15px/1.5 Arial,sans-serif;background:#fffbe9}
table{border-collapse:collapse;width:100%;font:13px/1.45 Arial,sans-serif;margin:14px 0}td,th{border:1px solid #bbb;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#eee}a{color:#0a4a63;word-break:break-word}ol.links,ul.log{font:13px/1.5 Arial,sans-serif}
dl.meta{display:grid;grid-template-columns:9em 1fr;gap:2px 12px;font:13px/1.45 Arial,sans-serif;margin:8px 0}dl.meta dt{font-weight:700}dl.meta dd{margin:0;word-break:break-word}
.src{border:1px solid #bbb;padding:8px 12px;margin:10px 0;break-inside:avoid}.src h3{font:700 15px/1.3 Arial,sans-serif;margin:0 0 4px}
.cite{border:1px dashed #666;padding:8px 12px;font:14px/1.5 Arial,sans-serif;background:#f7f7f7}
.toc{font:14px/1.7 Arial,sans-serif}.toc a{text-decoration:none}
@media print{.status{background:#fff}h2{break-after:avoid}tr{break-inside:avoid}.cite{background:#fff}a{color:#000}}"""


def strip_tags(s):
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s))).strip()


def esc(s):
    return html.escape(s, quote=True)


def git_log(slug):
    """(date, subject) for each non-merge commit that changed the page, newest first."""
    try:
        out = subprocess.run(
            ["git", "-C", str(ROOT), "log", "--no-merges", "--format=%as|%s", "--",
             "site/cases/%s.html" % slug],
            capture_output=True, text=True, check=True).stdout
    except Exception:
        return []
    rows = []
    for line in out.splitlines():
        d, _, subj = line.partition("|")
        if NOISE.search(subj):
            continue
        rows.append((d, subj.strip()))
    return rows


def parse_sources(src):
    """Rows of the Sources table: dict with title, url, publisher, supports, opened."""
    i = src.find('<h2 id="sources">')
    if i < 0:
        return []
    seg = src[i:]
    j = seg.find("</table>")
    seg = seg[:j]
    head = [strip_tags(h).lower() for h in re.findall(r"<th>(.*?)</th>", seg, re.S)]
    rows = []
    for tr in re.findall(r"<tr>(.*?)</tr>", seg[seg.find("</thead>"):], re.S):
        cells = re.findall(r"<td>(.*?)</td>", tr, re.S)
        if not cells:
            continue
        rec = {"title": "", "url": "", "publisher": "", "supports": "", "opened": ""}
        for name, cell in zip(head, cells):
            text = strip_tags(cell)
            m = re.search(r'href="(https?://[^"]+)"', cell)
            if name in ("title", "source"):
                rec["title"] = text
                if m:
                    rec["url"] = html.unescape(m.group(1))
            elif name == "publisher":
                rec["publisher"] = text
            elif name == "url":
                rec["url"] = html.unescape(m.group(1)) if m else text
            elif name.startswith("supports"):
                rec["supports"] = text
            elif name.startswith("opened"):
                rec["opened"] = text
        # "Supports (opened?)" tables carry the opened note inside the supports text
        if not rec["opened"] and rec["supports"]:
            mo = re.search(r"(opened|not opened|could not|blocked|fetch failed)[^.;]*", rec["supports"], re.I)
            if mo:
                rec["opened"] = mo.group(0)
        rows.append(rec)
    return rows


def correction_rows(src):
    i = src.find("Correction history")
    if i < 0:
        return []
    seg = src[i:]
    seg = seg[:seg.find("</table>")]
    out = []
    for tr in re.findall(r"<tr>(.*?)</tr>", seg, re.S):
        cells = [strip_tags(c) for c in re.findall(r"<td>(.*?)</td>", tr, re.S)]
        if len(cells) >= 3:
            out.append(cells[:3])
    return out


def build(slug, extra):
    src = (CASES / (slug + ".html")).read_text(encoding="utf-8")
    title = strip_tags(re.search(r"<h1>(.*?)</h1>", src, re.S).group(1))
    overline = strip_tags(re.search(r'class="overline">(.*?)</div>', src, re.S).group(1))
    case_no = (re.search(r"Case (\d+)", overline) or [None, ""])[1]
    meta = re.search(r'<div class="meta">(.*?)</div>', src, re.S)
    meta = strip_tags(meta.group(1)) if meta else ""
    checked = (re.search(r"Sources checked (\d{4}-\d{2}-\d{2})", meta) or [None, ""])[1]
    start = src.index('<div class="essay-body">') + len('<div class="essay-body">')
    body = src[start:src.index("</div></article>", start)]
    body = re.sub(r'<aside class="review-banner[^>]*>.*?</aside>', "", body, flags=re.S)
    body = re.sub(r'<div class="meta">.*?</div>', "", body, count=1, flags=re.S)
    body = re.sub(r'<div class="report-box">.*?</div>', "", body, flags=re.S)
    body = re.sub(r'<nav class="toc".*?</nav>', "", body, flags=re.S)

    # review status and verifier
    review = extra.get("reviews", {}).get(slug)
    page_says_reviewed = bool(re.search(r'class="review-banner reviewed"', src))
    if review and review.get("reviewed_by"):
        status = "Reviewed by a person."
        verifier = "Verified by %s on %s." % (review["reviewed_by"], review.get("reviewed_at", "a date not recorded"))
    elif page_says_reviewed:
        status = "Reviewed by a person. See the review history for who checked what and when."
        verifier = "The page is marked reviewed; no verifier name is recorded in this packet's data."
    else:
        status = NOT_REVIEWED
        verifier = "No one has verified this page yet. No verifier is recorded."

    # sources with metadata
    snaps = {s["url"]: s for s in extra.get("snapshots", {}).get(slug, []) if s.get("url")}
    sources = parse_sources(src)
    cards = []
    for n, s in enumerate(sources, 1):
        yr = re.search(r"\b(1[6-9]\d\d|20\d\d)\b", s["title"])
        snap = snaps.get(s["url"])
        if snap:
            snap_html = "Wayback: %s<br>SHA-256: %s<br>Captured: %s" % (
                '<a href="%s">%s</a>' % (esc(snap.get("wayback", "")), esc(snap.get("wayback", ""))) if snap.get("wayback") else "none",
                esc(snap.get("sha256", "not recorded")), esc(snap.get("captured", "not recorded")))
        else:
            snap_html = "No snapshot or SHA-256 recorded in this packet yet."
        link = '<a href="%s">%s</a>' % (esc(s["url"]), esc(s["url"])) if s["url"].startswith("http") else esc(s["url"] or "no link given")
        cards.append(
            '<div class="src"><h3>%d. %s</h3><dl class="meta">'
            '<dt>Publisher</dt><dd>%s</dd><dt>Date</dt><dd>%s</dd><dt>URL</dt><dd>%s</dd>'
            '<dt>Supports</dt><dd>%s</dd><dt>Opened by us</dt><dd>%s</dd><dt>Checked</dt><dd>%s</dd>'
            '<dt>Snapshot</dt><dd>%s</dd></dl></div>' % (
                n, esc(s["title"]), esc(s["publisher"] or "not stated"),
                esc(yr.group(1) if yr else "not stated in the title; see the source"), link,
                esc(s["supports"] or "not stated"), esc(s["opened"] or "not stated"),
                esc(checked or "not stated"), snap_html))

    # every link used in the article
    links, seen = [], set()
    for m in re.finditer(r'<a [^>]*href="(https?://[^"]+)"[^>]*>(.*?)</a>', body, re.S):
        url, text = html.unescape(m.group(1)), strip_tags(m.group(2))
        if url not in seen:
            seen.add(url)
            links.append((url, text))
    link_items = "".join('<li><a href="%s">%s</a><br><span class="small">%s</span></li>\n'
                         % (esc(u), esc(t[:120] or u), esc(u)) for u, t in links)

    # revision history
    corr = correction_rows(src)
    corr_html = ("<table><thead><tr><th>Date</th><th>Change</th><th>Reason</th></tr></thead><tbody>%s</tbody></table>" %
                 "".join("<tr><td>%s</td><td>%s</td><td>%s</td></tr>" % tuple(esc(c) for c in r) for r in corr)
                 ) if corr else '<p class="sans">This page does not carry a correction table. Its change log is below.</p>'
    log = git_log(slug)
    first = log[-1][0] if log else "not recorded"
    log_html = "".join("<li>%s: %s</li>" % (esc(d), esc(s)) for d, s in log[:40]) or "<li>No change log available when this packet was built.</li>"

    today = date.today().isoformat()
    url = BASE + slug + ".html"
    cite = ('The Way (Michi Institute). "%s." Case %s, The Observatory. Sources checked %s. '
            'Packet built %s. %s' % (title, case_no or "n/a", checked or "date not stated", today, url))

    page = """<!doctype html>
<html lang="en"><head><meta name="robots" content="noindex, nofollow"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{t} - research packet - The Way</title>
<style>{css}</style></head><body>
<p class="small">The Way research packet. Built {today}. Online version: <a href="{url}">{url}</a></p>
<p class="small">{over}</p>
<h1>{t}</h1>
<div class="status"><strong>{status}</strong><br>{verifier}<br>{meta}. Preliminary research, not a final verdict.</div>
<div class="toc"><strong>In this packet</strong><br>
<a href="#p-review">1. Review status</a> · <a href="#p-article">2. The article</a> · <a href="#p-sources">3. Sources and their details</a> ·
<a href="#p-links">4. Every link used</a> · <a href="#p-history">5. Revision history</a> · <a href="#p-cite">6. How to cite</a></div>

<h2 id="p-review">1. Review status</h2>
<dl class="meta"><dt>Status</dt><dd>{status}</dd><dt>Verified by</dt><dd>{verifier}</dd>
<dt>Sources checked</dt><dd>{checked}</dd><dt>Review history</dt><dd><a href="{review_url}{slug}">{review_url}{slug}</a></dd>
<dt>Packet built</dt><dd>{today}</dd></dl>

<h2 id="p-article">2. The article</h2>
{body}

<h2 id="p-sources">3. Sources and their details</h2>
<p class="sans">One entry per source in the page's Sources table. "Checked" is the date the page says its sources were checked. A Wayback link and SHA-256 appear only where a snapshot has been recorded.</p>
{cards}

<h2 id="p-links">4. Every link used in the article</h2>
<ol class="links">
{link_items}</ol>

<h2 id="p-history">5. Revision history</h2>
<p class="sans">First published (earliest change on record): {first}.</p>
<h3>Corrections on the page</h3>
{corr_html}
<h3>Change log for the page</h3>
<ul class="log">{log_html}</ul>

<h2 id="p-cite">6. How to cite</h2>
<p class="cite">{cite}</p>
<p class="small">This is preliminary research. Before relying on a claim, cite and check the primary source it points to. To save as a PDF: use your browser's Print and choose Save as PDF.</p>
<p class="small">Not left. Not right. We are The Way. A nonpartisan research project, not a political party.</p>
</body></html>
""".format(t=esc(title), css=CSS, today=today, url=url, over=esc(overline), status=esc(status),
           verifier=esc(verifier), meta=esc(meta.split(" · ")[0] if meta else "Sources date not stated"),
           checked=esc(checked or "not stated"), review_url=REVIEW_PAGE, slug=slug, body=body,
           cards="".join(cards) or '<p class="sans">This page has no Sources table.</p>',
           link_items=link_items, first=esc(first), corr_html=corr_html, log_html=log_html, cite=esc(cite))
    OUT.mkdir(exist_ok=True)
    (OUT / (slug + "-research-packet.html")).write_text(page, encoding="utf-8")
    return len(sources), len(links)


def main():
    extra = json.loads(DATA.read_text(encoding="utf-8")) if DATA.exists() else {}
    slugs = sys.argv[1:] or sorted(p.stem for p in CASES.glob("*.html")
                                   if p.stem != "index" and "report-box" in p.read_text(encoding="utf-8"))
    for s in slugs:
        ns, nl = build(s, extra)
        print("%-40s %2d sources %3d links" % (s, ns, nl))
    print("built", len(slugs), "packets in", OUT)


if __name__ == "__main__":
    main()
