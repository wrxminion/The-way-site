#!/usr/bin/env python3
"""Build site/news/feed.xml (RSS 2.0) from site/news/data/latest.json.

Only items of kind "news" are used (no opinion). Newest first by first_seen_at.
Each item links to /news/go.html?id=<id> (our page, with the source link on it).
Every item says plainly that the headline is unchecked, because the data is.
Usage: python3 tools/build-news-feed.py [--limit 25]
"""
import json, sys, datetime
from email.utils import format_datetime
from xml.sax.saxutils import escape

SRC = "site/news/data/latest.json"
OUT = "site/news/feed.xml"
SITE = "https://michiinstitute.com"
limit = 25
if "--limit" in sys.argv:
    limit = int(sys.argv[sys.argv.index("--limit") + 1])

data = json.load(open(SRC, encoding="utf-8"))

def when(item):
    s = item.get("first_seen_at") or item.get("published_at") or ""
    try:
        d = datetime.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        d = datetime.datetime(1970, 1, 1)
    if d.tzinfo is None:
        d = d.replace(tzinfo=datetime.timezone.utc)
    return d

items = [i for i in data.get("items", []) if i.get("kind") == "news" and i.get("title") and i.get("url")]
items.sort(key=when, reverse=True)
items = items[:limit]

built = when({"first_seen_at": data.get("generated_at", "")})
out = ['<?xml version="1.0" encoding="UTF-8"?>',
       '<rss version="2.0"><channel>',
       "<title>The Way: news headlines</title>",
       "<link>%s/news/</link>" % SITE,
       "<description>Recent news headlines collected by The Way (Michi Institute). Headlines are unchecked unless a page says otherwise.</description>",
       "<language>en-us</language>",
       "<lastBuildDate>%s</lastBuildDate>" % format_datetime(built)]
for i in items:
    src = i.get("source") or "unknown source"
    desc = "Source: %s. Status: %s. Collected by The Way, not reviewed by a person." % (src, i.get("status", "Unchecked"))
    out.append("<item><title>%s</title><link>%s</link><guid isPermaLink=\"false\">%s</guid><pubDate>%s</pubDate><description>%s</description></item>" % (
        escape(i["title"]), escape("%s/news/go.html?id=%s" % (SITE, i["id"])), escape(str(i["id"])), format_datetime(when(i)), escape(desc)))
out.append("</channel></rss>")
open(OUT, "w", encoding="utf-8").write("\n".join(out) + "\n")
print("wrote %s with %d items" % (OUT, len(items)))
