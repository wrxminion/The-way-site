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
import json, re, sys, datetime
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

out = ['<?xml version="1.0" encoding="UTF-8"?>', '<rss version="2.0"><channel>',
       "<title>The Way: most reported news stories</title>", "<link>%s/news/</link>" % SITE,
       "<description>Stories carried by the most different news sources. Headlines are unchecked unless a page says otherwise.</description>",
       "<language>en-us</language>", "<lastBuildDate>%s</lastBuildDate>" % format_datetime(gen)]
for g in groups[:LIMIT]:
    first = min((items[k] for k in g), key=lambda i: (tier(i), i["first_seen_at"]))  # most credible copy, then earliest
    n = len({items[k]["source"] for k in g})
    desc = "Reported by %d different sources in the last %d hours. Linked copy from %s (tier %d of our source list). Status: Unchecked. Collected by The Way, not reviewed by a person." % (n, HOURS, first.get("source", "unknown"), tier(first))
    out.append('<item><title>%s</title><link>%s</link><guid isPermaLink="false">top-%s</guid><pubDate>%s</pubDate><description>%s</description></item>' % (
        escape(first["title"]), escape("%s/news/go.html?id=%s" % (SITE, first["id"])), escape(first["id"]), format_datetime(when(first["first_seen_at"])), escape(desc)))
out.append("</channel></rss>")
open(OUT, "w", encoding="utf-8").write("\n".join(out) + "\n")
print("wrote %s with %d stories" % (OUT, min(LIMIT, len(groups))))
