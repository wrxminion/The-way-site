#!/usr/bin/env python3
"""The Way: lobbying reports that name each upcoming bill (Get Involved, D282).

Reads the official Lobbying Disclosure Act API at lda.gov with NO key (anonymous use is allowed:
lda.gov/robots.txt says "Allow: /api/v1/", 15 requests a minute, Crawl-delay 4). It runs on a home
computer because the cloud cannot reach lda.gov. No keys, tokens or passwords anywhere.

  python fetch_lda.py                      # every bill in upcoming.json, this year and last year
  python fetch_lda.py --bill "H.R. 2347"   # one bill
  python fetch_lda.py --dry                # print what it would ask, fetch nothing

It writes tools/get-involved/lda.json next to this file. Then run build_get_involved.py and send the
change through the push queue. A filing is kept only when one of its lobbying activity descriptions
names that exact bill number (H.R. 2347, H.R.2347, HR 2347 and the like, never part of a longer number).
Amounts are what the filer reported for the whole quarter across every issue on the report, not money
spent on this one bill, and the pages say so.

Polite and safe: one request every 4.5 seconds, robots.txt checked first, a clear user agent, and it
stops at the first 403, 429 or captcha page instead of trying again. Nothing is worked around.
"""
import argparse, datetime as dt, json, os, re, sys, time
import urllib.error, urllib.parse, urllib.request, urllib.robotparser

HERE = os.path.dirname(os.path.abspath(__file__))
API = 'https://lda.gov/api/v1/filings/'
UA = 'TheWayCivicSite/1.0 (+https://michiinstitute.com/get-involved/; lobbying reports for upcoming bills)'
PAUSE = 4.5
MAX_PAGES = 20          # 25 filings a page; a bill with more than 500 hits is cut off and says so


class Stop(Exception):
    pass


def forms(num):
    """The ways filers write a bill number in their issue text."""
    m = re.match(r'^(H\.R\.|S\.|H\.J\.Res\.|S\.J\.Res\.)\s*(\d+)$', num)
    if not m:
        return [num]
    kind, n = m.groups()
    if kind == 'H.R.':
        return ['H.R. ' + n, 'H.R.' + n, 'HR ' + n, 'HR' + n]
    if kind == 'S.':
        return ['S. ' + n, 'S.' + n]
    return [num]


def names_bill(text, num):
    """True when the text names this exact bill number."""
    m = re.match(r'^(H\.R\.|S\.)\s*(\d+)$', num)
    if not m:
        return num.lower() in (text or '').lower()
    kind, n = m.groups()
    pre = r'H\.?\s?R\.?' if kind == 'H.R.' else r'(?<![A-Za-z.])S\.?'
    return re.search(r'(?<![A-Za-z])' + pre + r'\s?' + n + r'(?!\d)', text or '', re.I) is not None


class Client:
    def __init__(self, dry=False):
        self.dry, self.last = dry, 0.0
        rp = urllib.robotparser.RobotFileParser('https://lda.gov/robots.txt')
        if not dry:
            rp.read()
            if not rp.can_fetch(UA, API):
                raise Stop('robots.txt does not allow ' + API)

    def get(self, url):
        if self.dry:
            print('would fetch', url)
            return {'count': 0, 'results': [], 'next': None}
        wait = self.last + PAUSE - time.time()
        if wait > 0:
            time.sleep(wait)
        self.last = time.time()
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 429, 503):
                raise Stop('lda.gov answered %d for %s; stopping without retrying' % (e.code, url))
            raise
        if body.lstrip()[:1] != '{':
            raise Stop('lda.gov sent a page that is not JSON (maybe a captcha) for ' + url)
        return json.loads(body)


def amount(x):
    try:
        return float(x) if x not in (None, '') else None
    except ValueError:
        return None


def check_bill(cl, num, years, today):
    kept, raw, cut = {}, {}, False
    for y in years:
        for f in forms(num):
            url = API + '?' + urllib.parse.urlencode({'filing_year': y, 'filing_specific_lobbying_issues': f})
            pages, n = 0, 0
            while url and pages < MAX_PAGES:
                d = cl.get(url)
                pages += 1
                n = d.get('count', n)
                for r in d.get('results', []):
                    hits = [a for a in (r.get('lobbying_activities') or []) if names_bill(a.get('description'), num)]
                    if not hits or r.get('filing_uuid') in kept:
                        continue
                    a = hits[0]
                    desc = re.sub(r'\s+', ' ', a.get('description') or '').strip()
                    i = max(0, desc.lower().find(num.split()[-1]) - 80)
                    kept[r['filing_uuid']] = {
                        'bill': num, 'registrant': (r.get('registrant') or {}).get('name', ''),
                        'client': (r.get('client') or {}).get('name', ''), 'year': r.get('filing_year'),
                        'period': r.get('filing_period') or r.get('filing_type_display') or '',
                        'type': r.get('filing_type_display') or r.get('filing_type') or '',
                        'income': amount(r.get('income')), 'expenses': amount(r.get('expenses')),
                        'issue': a.get('general_issue_code_display') or a.get('general_issue_code') or '',
                        'text': desc[i:i + 200], 'uuid': r['filing_uuid'],
                        'url': r.get('filing_document_url') or ('https://lda.gov/filings/public/filing/%s/print/' % r['filing_uuid']),
                        'checked': today}
                url = d.get('next')
            if url:
                cut = True
            raw['%s %s' % (y, f)] = n
    return list(kept.values()), raw, cut


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bill', action='append', help='only this bill (repeat for more)')
    ap.add_argument('--out', default=os.path.join(HERE, 'lda.json'))
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()
    data = json.load(open(os.path.join(HERE, 'upcoming.json'), encoding='utf-8'))
    bills = [b['number'] for b in data['bills']]
    for ev in data.get('events', []):          # laws behind the date pages (funding, defense bill)
        for v in [(ev.get('law') or {}).get('bill')] + ev.get('lda_bills', []):
            if v and v not in bills:
                bills.append(v)
    if a.bill:
        bills = a.bill
    old = json.load(open(a.out, encoding='utf-8')) if os.path.exists(a.out) else {}
    status, filings = old.get('status', {}), [f for f in old.get('filings', []) if f['bill'] not in bills]
    today = dt.date.today().isoformat()
    years = [dt.date.today().year, dt.date.today().year - 1]
    cl = Client(a.dry)
    try:
        for num in bills:
            kept, raw, cut = check_bill(cl, num, years, today)
            filings += kept
            status[num] = {'checked': today, 'complete': not cut, 'raw': raw,
                           'note': 'More than %d pages of results; only the first were read.' % MAX_PAGES if cut else ''}
            print(num, len(kept), 'kept', json.dumps(raw))
    except Stop as e:
        print('STOPPED:', e)
    if a.dry:
        return
    out = {'source': API, 'note': old.get('note') or 'Lobbying Disclosure Act filings that name the bill in their lobbying issue text, read from the official lda.gov API with no key.',
           'status': status, 'filings': sorted(filings, key=lambda f: (f['bill'], f.get('client', ''), str(f.get('period', ''))))}
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    print('wrote', a.out, len(out['filings']), 'filings')


if __name__ == '__main__':
    main()
