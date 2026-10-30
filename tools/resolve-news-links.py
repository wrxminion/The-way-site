#!/usr/bin/env python3
"""Find the publisher's own address for Google News redirect links in the election news files.

Run it between two builds (it only needs the network for Google, and runs on the news machine, not in the cloud):
    python3 tools/build-election-news.py && python3 tools/resolve-news-links.py && python3 tools/build-election-news.py
It reads site/news/data/election/*.json, resolves up to --max (default 60) links that are not in the cache yet, and writes
site/news/data/direct-links.json ({"ok": {google id: publisher link}, "failed": {google id: date}}). A failed link is tried again after a day.
Links are stripped of trackers on the way in (news_links.strip_trackers). Nothing but the Google redirect page is fetched.

NOT TESTED against the live service (the cloud build environment cannot reach Google News). Older links decode offline; newer ones go
through Google's batchexecute call, which Google can change. If it stops working the members feed simply shows fewer stories.
"""
import base64, datetime, glob, json, os, re, sys, time, urllib.parse, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import news_links

UA = 'TheWayArchiver/1.0 (nonpartisan research archive)'

def offline(gid):
    """Old-style ids carry the address inside the id itself."""
    try:
        raw = base64.urlsafe_b64decode(gid + '=' * (-len(gid) % 4))
    except Exception:
        return ''
    if raw.startswith(b'\x08\x13\x22'):
        raw = raw[3:]
    if raw.endswith(b'\xd2\x01\x00'):
        raw = raw[:-3]
    if not raw:
        return ''
    n = raw[0]; off = 1
    if n >= 0x80:
        n = (n & 0x7F) | (raw[1] << 7); off = 2
    s = raw[off:off + n].decode('utf-8', 'ignore')
    return s if s.startswith('http') else ''

def fetch(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers={'User-Agent': UA, **(headers or {})})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode('utf-8', 'replace')

def online(gid):
    html = ''
    for u in ('https://news.google.com/rss/articles/' + gid, 'https://news.google.com/articles/' + gid):
        try:
            html = fetch(u)
        except Exception:
            continue
        sg = re.search(r'data-n-a-sg="([^"]+)"', html); ts = re.search(r'data-n-a-ts="([^"]+)"', html)
        if sg and ts:
            break
    else:
        return ''
    inner = json.dumps(["garturlreq", [["X", "X", ["X", "X"], None, None, 1, 1, "US:en", None, 1, None, None, None, None, None, 0, 1], "X", "X", 1, [1, 1, 1], 1, 1, None, 0, 0, None, 0], gid, int(ts.group(1)), sg.group(1)], separators=(',', ':'))
    body = 'f.req=' + urllib.parse.quote(json.dumps([[['Fbv4je', inner]]], separators=(',', ':')))
    try:
        out = fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', body.encode(), {'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'})
        return json.loads(json.loads(out.split('\n\n')[1])[0][2])[1]
    except Exception:
        return ''

def main():
    d = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site', 'news', 'data')
    mx = int(sys.argv[sys.argv.index('--max') + 1]) if '--max' in sys.argv else 60
    cache = news_links.load_cache(d); today = datetime.date.today().isoformat()
    ids = []
    for f in sorted(glob.glob(os.path.join(d, 'election', '*.json'))):
        with open(f, encoding='utf-8') as fh:
            for i in json.load(fh).get('items', []):
                g = news_links.google_news_id(i.get('url'))
                if g and g not in cache['ok'] and cache['failed'].get(g) != today and g not in ids:
                    ids.append(g)
    done = 0
    for g in ids[:mx]:
        u = offline(g) or online(g)
        u = news_links.strip_trackers(u) if u else ''
        if u and not news_links.google_news_id(u) and 'news.google.com' not in u:
            cache['ok'][g] = u; cache['failed'].pop(g, None); done += 1
        else:
            cache['failed'][g] = today
        time.sleep(1.0)
    tmp = news_links.cache_path(d) + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    os.replace(tmp, news_links.cache_path(d))
    print('resolved %d of %d tried (%d waiting)' % (done, min(len(ids), mx), max(len(ids) - mx, 0)))

main()
