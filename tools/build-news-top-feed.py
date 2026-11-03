#!/usr/bin/env python3
"""Build site/news/feed-top.xml: the stories reported by the most different sources.

Reads site/news/data/latest.json (kind "news" only), groups headlines about the same story
(word overlap), ranks groups by how many different sources carry them, and writes the top 10
as RSS. One item per story, linked to /news/go.html with the id of the most credible copy
(tools/news-source-tiers.json, earliest on ties).
This only picks what to post. It is not used for the research priority list.
Groups of more than 40 headlines are skipped: they are template series (for example one
headline per state), not one story.
Usage: python3 tools/build-news-top-feed.py [--limit 10] [--hours 48]
"""
import json, os, re, sys, datetime
from email.utils import format_datetime
from xml.sax.saxutils import escape

TIERS = "tools/news-source-tiers.json"
SRC, OUT, SITE = "site/news/data/latest.json", "site/news/feed-top.xml", "https://michiinstitute.com"
def arg(name, default):
    return int(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default
LIMIT, HOURS = arg("--limit", 10), arg("--hours", 48)
STOP = set("the a an of to in on for and or at by with from as is are be will new says say after over about into its it's his her their this that".split())

def toks(t):
    t = re.sub(r"\s[-|]\s[^-|]{2,40}$", "", t.lower())
    return set(w for w in re.findall(r"[a-z0-9']+", t) if w not in STOP and len(w) > 2)

def when(s):
    d = datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=datetime.timezone.utc)

tiers = json.load(open(TIERS, encoding="utf-8"))
RANK = {name: int(t) for t in ("1", "2", "4") for name in tiers[t]}
def tier(item):
    return RANK.get(item.get("source", ""), 3)

data = json.load(open(SRC, encoding="utf-8"))
gen = when(data["generated_at"])
items = [i for i in data["items"] if i.get("kind") == "news" and i.get("title") and i.get("url")
         and (gen - when(i["first_seen_at"])).total_seconds() <= HOURS * 3600]
items.sort(key=lambda i: i["first_seen_at"])
T = [toks(i["title"]) for i in items]
groups = []
for k, t in enumerate(T):
    if len(t) < 3:
        continue
    for g in groups:
        r = T[g[0]]
        if len(t & r) / len(t | r) >= 0.5:
            g.append(k); break
    else:
        groups.append([k])
groups = [g for g in groups if len(g) <= 40]
groups.sort(key=lambda g: (-len({items[k]["source"] for k in g}), items[g[0]]["first_seen_at"]))

QC_DIR = "site/news/data/quickcheck"
def quick_check(item_id):
    try:
        j = json.load(open(os.path.join(QC_DIR, item_id + ".json"), encoding="utf-8"))
    except (OSError, ValueError):
        return None
    claims = [c for c in j.get("claims", []) if isinstance(c, dict) and c.get("text") and str(c.get("url", "")).startswith(("http://", "https://"))]
    return {"claims": claims, "checked": j.get("checked_by_person") is True} if claims else None

def post_text(first, n, go):
    # Ready-to-post text. The post carries the information itself; the go link is "see more", not a gate.
    # Part after the line ---FIRST COMMENT--- is for the first comment (the source links).
    src = first.get("source", "the source")
    lines = ["%s (reported by %s, carried by %d sources)" % (first["title"], src, n), ""]
    qc = quick_check(first["id"])
    if qc:
        lines.append("What the sources say:")
        for c in qc["claims"][:5]:
            lines.append("- %s (%s)" % (c["text"], c.get("label") or "source"))
        lines += ["", "Checked by a person." if qc["checked"] else "AI quick check (not yet reviewed by a person)."]
    else:
        lines += ["No quick check yet. Headline collected by The Way, not reviewed by a person."]
    lines += ["", "More, with sources and your say: " + go, "---FIRST COMMENT---", "Original story (" + src + "): " + first["url"]]
    if qc:
        for c in qc["claims"][:5]:
            lines.append("%s: %s" % (c.get("label") or "Source", c["url"]))
    return "\n".join(lines)

out = ['<?xml version="1.0" encoding="UTF-8"?>', '<rss version="2.0"><channel>',
       "<title>The Way: most reported news stories</title>", "<link>%s/news/</link>" % SITE,
       "<description>Stories carried by the most different news sources. Headlines are unchecked unless a page says otherwise.</description>",
       "<language>en-us</language>", "<lastBuildDate>%s</lastBuildDate>" % format_datetime(gen)]
for g in groups[:LIMIT]:
    first = min((items[k] for k in g), key=lambda i: (tier(i), i["first_seen_at"]))  # most credible copy, then earliest
    n = len({items[k]["source"] for k in g})
    go = "%s/news/go.html?id=%s" % (SITE, first["id"])
    desc = post_text(first, n, go)
    out.append('<item><title>%s</title><link>%s</link><guid isPermaLink="false">top-%s</guid><pubDate>%s</pubDate><description>%s</description></item>' % (
        escape(first["title"]), escape(go), escape(first["id"]), format_datetime(when(first["first_seen_at"])), escape(desc)))
out.append("</channel></rss>")
open(OUT, "w", encoding="utf-8").write("\n".join(out) + "\n")
print("wrote %s with %d stories" % (OUT, min(LIMIT, len(groups))))
