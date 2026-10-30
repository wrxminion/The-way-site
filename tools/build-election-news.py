#!/usr/bin/env python3
"""Trim the news feed to small files for the front page election box.

Reads site/news/data/latest.json and site/news/data/states/<st>.json (written by the news cycle) and writes
site/news/data/election/national.json (newest 60) and election/<st>.json (newest 40 each): election stories only,
duplicates removed, headline/source/date/link only. Run it after the news cycle writes latest.json and the state files.
Usage: python3 tools/build-election-news.py [site/news/data]
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import news_links

D = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'site', 'news', 'data')
ELECTION = re.compile(r"\b(elections?|ballots?|voters?|voting|votes?|candidates?|primary|primaries|runoff|polls?|polling|campaigns?|midterms?|amendment|proposition|referendum|congressional|secretary of state|redistricting)\b", re.I)
NATIONAL = re.compile(r"\b(congress|senate|house|midterms?|president|presidential|national|nationwide|federal|supreme court|redistricting)\b", re.I)
# Content rules (Frank, Oct 30). Local keyword and source lists only, no AI calls. Deaths are allowed.
# Dropped: unsupported science or health claims (below), satire sources, obvious slop or conspiracy items, celebrity and entertainment. Everything kept is election news,
# which already means politics. A satire or slop story that later comes true can be let through by listing its link
# (one per line) in tools/election-news-allow.txt after a person has checked it.
SATIRE = re.compile(r"\b(the onion|onion|babylon bee|clickhole|the daily mash|daily mash|reductress|waterford whispers|duffel blog|newsthump|the borowitz report|borowitz|national report|empire news|world news daily report|hard drive|the beaverton|betoota advocate|satire|parody)\b", re.I)
SLOP = re.compile(r"\b(aliens?|ufos?|uaps?|extraterrestrials?|chemtrails?|flat earth|bigfoot|reptilians?|illuminati|lizard people|crisis actors?|false flag|flat-earth|mind control|miracle cure|secret cabal)\b", re.I)
CELEB = re.compile(r"\b(celebrity|celebrities|hollywood|red carpet|kardashian|box office|grammys?|oscars?|emmys?|reality tv|movie star|pop star|rapper|influencer|tmz|e! news|page six|us weekly|entertainment weekly|hollywood reporter|billboard|variety|deadline)\b", re.I)
# Science and health claims (Frank, Oct 30): a story about vaccines, raw milk, crystals, alternative medicine and the like
# only shows if the headline points to published, expert-reviewed research or a public health body. Otherwise it stays in the
# archive (the day files) and is left out of the box. A keyword check cannot read the research, so a person still checks.
HEALTH = re.compile(r"\b(vaccines?|vaccinations?|vaccinated|anti-vax|raw milk|crystals?|crystal healing|homeopath\w*|detox\w*|essential oils?|ivermectin|miracle cure|cure for cancer|alternative medicine|holistic|natural remedy|natural remedies|supplements?|chiropract\w*|autism|fluoride|5g)\b", re.I)
EVIDENCE = re.compile(r"\b(study|studies|researchers?|journal|published|peer[- ]reviewed|clinical trial|trial|meta-analysis|cdc|fda|nih|who|lancet|nejm|jama|science|scientists?|health officials?|department of health)\b", re.I)
KEEP = ('id', 'title', 'url', 'source', 'published_at', 'first_seen_at', 'states', 'measures', 'image')

def norm(t):
    t = re.sub(r"\s+[-|–—]\s+[^-|–—]{2,40}$", '', t.lower())
    return re.sub(r"[^a-z0-9 ]", '', t).strip()

def allowed():
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'election-news-allow.txt')
    try:
        with open(p, encoding='utf-8') as f:
            return {l.strip() for l in f if l.strip() and not l.startswith('#')}
    except OSError:
        return set()

ALLOW = allowed()
CACHE = news_links.load_cache(D)

def excluded(i):
    if i.get('url') in ALLOW:
        return False
    t = (i.get('title') or '') + ' ' + (i.get('source') or '')
    if HEALTH.search(t) and not EVIDENCE.search(t):
        return True
    return bool(SATIRE.search(t) or SLOP.search(t) or CELEB.search(t))

def key(i):
    return i.get('published_at') or i.get('first_seen_at') or ''

def pick(items, n, extra=None):
    seen, out = set(), []
    for i in sorted(items, key=key, reverse=True):
        t = i.get('title') or ''
        if not ELECTION.search(t) or (extra and not extra.search(t)) or excluded(i):
            continue
        k = norm(t)
        if k in seen:
            continue
        seen.add(k)
        row = {f: i[f] for f in KEEP if f in i}
        # Trackers are stripped from every link. A Google News redirect link is swapped for the publisher's own address when
        # resolve-news-links.py has found it; until then it stays as it was and the members feed leaves the story out.
        row['url'] = news_links.direct_url(row.get('url', ''), CACHE) or row.get('url', '')
        out.append(row)
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
