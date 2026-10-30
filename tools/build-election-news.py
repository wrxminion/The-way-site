#!/usr/bin/env python3
"""Trim the news feed to small files for the front page election box.

Reads site/news/data/latest.json and site/news/data/states/<st>.json (written by the news cycle) and writes
site/news/data/election/national.json (newest 60) and election/<st>.json (newest 40 each): election stories only,
duplicates removed, headline/source/date/link only. Run it after the news cycle writes latest.json and the state files.
Usage: python3 tools/build-election-news.py [site/news/data]
"""
import json, os, re, sys

D = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'site', 'news', 'data')
ELECTION = re.compile(r"\b(elections?|ballots?|voters?|voting|votes?|candidates?|primary|primaries|runoff|polls?|polling|campaigns?|midterms?|amendment|proposition|referendum|congressional|secretary of state|redistricting)\b", re.I)
NATIONAL = re.compile(r"\b(congress|senate|house|midterms?|president|presidential|national|nationwide|federal|supreme court|redistricting)\b", re.I)
KEEP = ('title', 'url', 'source', 'published_at', 'first_seen_at', 'states', 'measures', 'image')

def norm(t):
    t = re.sub(r"\s+[-|–—]\s+[^-|–—]{2,40}$", '', t.lower())
    return re.sub(r"[^a-z0-9 ]", '', t).strip()

def key(i):
    return i.get('published_at') or i.get('first_seen_at') or ''

def pick(items, n, extra=None):
    seen, out = set(), []
    for i in sorted(items, key=key, reverse=True):
        t = i.get('title') or ''
        if not ELECTION.search(t) or (extra and not extra.search(t)):
            continue
        k = norm(t)
        if k in seen:
            continue
        seen.add(k)
        out.append({f: i[f] for f in KEEP if f in i})
        if len(out) >= n:
            break
    return out

def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)

def write(p, doc):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(doc, f, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    os.replace(tmp, p)

def main():
    latest = load(os.path.join(D, 'latest.json'))
    stamp = latest.get('generated_at')
    write(os.path.join(D, 'election', 'national.json'), {'schema': 'election-box/1', 'generated_at': stamp, 'items': pick(latest.get('items', []), 60, NATIONAL)})
    sd = os.path.join(D, 'states')
    for fn in sorted(os.listdir(sd)):
        if re.fullmatch(r'[a-z]{2}\.json', fn):
            doc = load(os.path.join(sd, fn))
            write(os.path.join(D, 'election', fn), {'schema': 'election-box/1', 'generated_at': doc.get('generated_at') or stamp, 'items': pick(doc.get('items', []), 40)})

main()
