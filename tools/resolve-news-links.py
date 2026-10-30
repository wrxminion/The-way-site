#!/usr/bin/env python3
"""Find the publisher's own address for Google News redirect links in the election news files, fast enough to keep up with the feed.

Run it between two builds (it only needs the network for Google, and runs on the news machine, not in the cloud):
    python3 tools/build-election-news.py && python3 tools/resolve-news-links.py && python3 tools/build-election-news.py
It reads site/news/data/election/*.json and resolves every link not in the cache yet, newest stories first, until none are left or the
time budget runs out (--budget seconds, default 600; --max N caps the count, default no cap). Writes
site/news/data/direct-links.json ({"ok": {google id: publisher link}, "failed": {google id: time}}).
Politeness: only Google's redirect page is fetched (never the outlets); all workers share one clock, at most one request per --gap seconds
(default 0.8); on 429/403/5xx it backs off (Retry-After honored) and after 4 blocks in a row it stops and marks nothing failed.
A link Google answered but could not resolve is marked failed with a timestamp and tried again after 3 hours (24 hours once the story is
3 days old). A link that was blocked or timed out is not marked at all, it just stays pending. Nothing is ever deleted from the cache.

NOT TESTED against the live service (the cloud build environment cannot reach Google News). Older links decode offline; newer ones go
through Google's batchexecute call, which Google can change. If it stops working the members feed simply shows fewer stories.
"""
import base64, datetime, glob, json, os, re, sys, threading, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
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

class Blocked(Exception):
    """Google refused, rate limited us, or the network failed. Says nothing about the link itself."""
    def __init__(self, wait=0):
        self.wait = wait

_clock = threading.Lock(); _next = [0.0]; _pause_until = [0.0]
GAP = 0.8

def throttle():
    """One shared clock: no matter how many workers, requests leave at least GAP seconds apart, and none during a back-off."""
    with _clock:
        t = max(time.time(), _next[0], _pause_until[0])
        _next[0] = t + GAP
    if t > time.time():
        time.sleep(t - time.time())

def fetch(url, data=None, headers=None):
    throttle()
    req = urllib.request.Request(url, data=data, headers={'User-Agent': UA, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        if e.code in (403, 429) or e.code >= 500:
            try:
                w = int(e.headers.get('Retry-After', '0'))
            except (TypeError, ValueError):
                w = 0
            raise Blocked(min(max(w, 30), 120))
        raise
    except (urllib.error.URLError, OSError):
        raise Blocked(10)

def online(gid):
    """Publisher link, '' when Google answered but there is none. Raises Blocked when Google would not answer."""
    html = ''
    for u in ('https://news.google.com/rss/articles/' + gid, 'https://news.google.com/articles/' + gid):
        try:
            html = fetch(u)
        except urllib.error.HTTPError:
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
    except urllib.error.HTTPError:
        return ''
    try:
        return json.loads(json.loads(out.split('\n\n')[1])[0][2])[1]
    except Exception:
        return ''

def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

def retry_due(stamp, seen):
    """A failed link is tried again 3 hours later (24 hours once the story is 3 days old). Old date-only stamps count as midnight."""
    try:
        t = datetime.datetime.fromisoformat((stamp + 'T00:00:00Z' if len(stamp) == 10 else stamp).replace('Z', '+00:00'))
    except ValueError:
        return True
    age = datetime.datetime.now(datetime.timezone.utc) - t
    try:
        story = datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(seen.replace('Z', '+00:00'))
    except ValueError:
        story = datetime.timedelta(0)
    return age >= (datetime.timedelta(hours=24) if story >= datetime.timedelta(days=3) else datetime.timedelta(hours=3))

def pending(d, cache):
    found = {}
    for f in sorted(glob.glob(os.path.join(d, 'election', '*.json'))):
        with open(f, encoding='utf-8') as fh:
            for i in json.load(fh).get('items', []):
                g = news_links.google_news_id(i.get('url'))
                if g and g not in cache['ok']:
                    found[g] = max(found.get(g, ''), i.get('first_seen_at') or i.get('published_at') or '')
    return sorted((g for g in found if g not in cache['failed'] or retry_due(cache['failed'][g], found[g])), key=lambda g: found[g], reverse=True)

def good(u):
    u = news_links.strip_trackers(u) if u else ''
    return u if u and not news_links.google_news_id(u) and 'news.google.com' not in u else ''

def arg(name, default):
    return type(default)(sys.argv[sys.argv.index(name) + 1]) if name in sys.argv else default

def main():
    global GAP
    d = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site', 'news', 'data')
    GAP = arg('--gap', 0.8); budget = arg('--budget', 600); mx = arg('--max', 0); workers = arg('--workers', 2)
    cache = news_links.load_cache(d)
    ids = pending(d, cache)
    if mx:
        ids = ids[:mx]
    total = len(ids); deadline = time.time() + budget
    lock = threading.Lock(); st = {'done': 0, 'failed': 0, 'tried': 0, 'blocks': 0, 'stop': False}

    # Pass 1: old-style ids decode offline, no network, no waiting.
    rest = []
    for g in ids:
        u = good(offline(g))
        if u:
            cache['ok'][g] = u; cache['failed'].pop(g, None); st['done'] += 1; st['tried'] += 1
        else:
            rest.append(g)
    save(d, cache)

    def work(g):
        if st['stop'] or time.time() > deadline:
            return
        try:
            u = good(online(g)); blocked = False
        except Blocked as b:
            u = ''; blocked = True
            with _clock:
                _pause_until[0] = max(_pause_until[0], time.time() + b.wait)
        with lock:
            st['tried'] += 1
            if blocked:
                st['blocks'] += 1
                if st['blocks'] >= 4:
                    st['stop'] = True
                return
            st['blocks'] = 0
            if u:
                cache['ok'][g] = u; cache['failed'].pop(g, None); st['done'] += 1
            else:
                cache['failed'][g] = now(); st['failed'] += 1
            if st['tried'] % 20 == 0:
                save(d, cache)

    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(work, rest))
    save(d, cache)
    left = total - st['done'] - st['failed']
    if st['stop']:
        print('4 blocks in a row: Google is refusing or has changed. Stopped; nothing was marked failed for it.')
    print('resolved %d, unresolvable %d, %d still waiting (of %d pending)' % (st['done'], st['failed'], max(left, 0), total))

def save(d, cache):
    tmp = news_links.cache_path(d) + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(cache, f, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    os.replace(tmp, news_links.cache_path(d))

if __name__ == '__main__':
    main()
