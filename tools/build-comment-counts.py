#!/usr/bin/env python3
"""Write site/news/data/comment-counts.json for the "(N) comments" links on the news page (SQL 0072).

    python3 tools/build-comment-counts.py [--out site/news/data/comment-counts.json]

Run it in the news cycle, before the commit step. It asks the database for the number of PUBLISHED, not-hidden comments per article
using the public key (the same key the website already ships; no secret needed) and rewrites the file only when a number changed.
If the database cannot be reached the old file is kept and the exit code is 1. Public pages cannot call the database themselves,
which is why the counts are a static file.
"""
import argparse, json, os, re, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))


def cfg():
    with open(os.path.join(HERE, '..', 'site', 'members', 'config.js'), encoding='utf-8') as fh:
        t = fh.read()
    url = re.search(r"supabaseUrl:\s*'([^']+)'", t); key = re.search(r"supabaseAnonKey:\s*'([^']+)'", t)
    if not url or not key:
        sys.exit('no Supabase settings in config.js')
    return url.group(1).rstrip('/'), key.group(1)


def fetch_counts():
    url, key = cfg()
    req = urllib.request.Request(url + '/rest/v1/rpc/public_comment_counts', data=b'{"p_items": null}',
                                 headers={'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))


def to_counts(rows):
    out = {}
    for r in rows or []:
        k = str(r.get('item_key', ''))
        if k.startswith('news:') and re.fullmatch(r'[a-z0-9][a-z0-9._-]{0,119}', k[5:]) and isinstance(r.get('n'), int) and r['n'] > 0:
            out[k[5:]] = r['n']
    return dict(sorted(out.items()))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=os.path.join(HERE, '..', 'site', 'news', 'data', 'comment-counts.json'))
    ap.add_argument('--from-json', help='read the rows from this file instead of the database (tests)')
    a = ap.parse_args(argv)
    try:
        rows = json.load(open(a.from_json)) if a.from_json else fetch_counts()
    except Exception as e:
        print('could not read counts, keeping the old file:', type(e).__name__, file=sys.stderr); return 1
    counts = to_counts(rows)
    try:
        old = json.load(open(a.out)).get('counts')
    except Exception:
        old = None
    if old == counts:
        print('unchanged', len(counts)); return 0
    doc = {'schema': 'theway-comment-counts/1', 'generated_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'counts': counts}
    tmp = a.out + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as fh:
        json.dump(doc, fh, indent=1, sort_keys=True); fh.write('\n')
    os.replace(tmp, a.out)
    print('wrote', len(counts)); return 0


if __name__ == '__main__':
    sys.exit(main())
