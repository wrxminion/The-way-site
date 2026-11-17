#!/usr/bin/env python3
"""Tariff tracker (D289): tariffs paid, refunds owed and paid, and what companies did with their refunds.

Reads tools/money-trail/tariffs.json (written by hand from the sources named in it) and writes site/money-trail/tariffs.js
(window.TW_TARIFFS). Run from the repo root:

  python3 -I tools/money-trail/build_tariffs.py site

Checks before it writes, and stops on any failure:
  - every dollar figure has a source link (https), who gives it and an "as of" date;
  - every company has one of the known uses (bonuses, customers, prices, sold, unsaid);
  - a company that names a Company tracker slug (company_slug) really is on the Company tracker;
  - dates are YYYY, YYYY-MM or YYYY-MM-DD.

Refunds from different companies are never added together here: they come from different sources, dates and measures
(cash received, a pre-tax gain, a claim filed). The only totals on the page are the ones CBP and CBO give.
"""
import json
import os
import re
import sys

USES = ('bonuses', 'customers', 'prices', 'sold', 'unsaid')
DATE = re.compile(r'^\d{4}(-\d{2}(-\d{2})?)?$')


def fail(msg):
    sys.exit('build_tariffs: ' + msg)


def check_url(u, where):
    if not isinstance(u, str) or not u.startswith('https://'):
        fail(where + ': source link missing or not https: ' + repr(u))


def check_date(d, where, empty_ok=False):
    if empty_ok and d == '':
        return
    if not isinstance(d, str) or not DATE.match(d):
        fail(where + ': bad date ' + repr(d))


def check_money(m, where):
    if not isinstance(m.get('amount'), int) or m['amount'] <= 0:
        fail(where + ': amount must be a positive whole number of dollars')
    if 'hi' in m and (not isinstance(m['hi'], int) or m['hi'] < m['amount']):
        fail(where + ': hi must be a whole number at least amount')
    if not m.get('who') or not m.get('label'):
        fail(where + ': who and label are required')
    check_date(m.get('asof'), where)
    check_url(m.get('url'), where)
    if m.get('url2'):
        check_url(m['url2'], where)


def main():
    if len(sys.argv) != 2:
        fail('usage: build_tariffs.py SITE_DIR')
    site = sys.argv[1]
    here = os.path.dirname(os.path.abspath(__file__))
    data = json.load(open(os.path.join(here, 'tariffs.json'), encoding='utf-8'))
    cj = open(os.path.join(site, 'money-trail', 'companies.js'), encoding='utf-8').read()
    company_slugs = set(re.findall(r'"slug":"([^"]+)"', cj))
    check_date(data.get('checked'), 'checked')
    for i, t in enumerate(data['totals']):
        check_money(t, 'totals[' + str(i) + ']')
    for i, p in enumerate(data['progress']):
        w = 'progress[' + str(i) + ']'
        p.setdefault('label', 'Refunds')
        check_money(p, w)
    for i, p in enumerate(data['programs']):
        w = 'programs[' + str(i) + ']'
        check_url(p.get('url'), w)
        check_date(p.get('start'), w)
        check_date(p.get('end'), w, empty_ok=True)
        if p.get('collected'):
            check_url(p.get('collected_url'), w + ' collected')
        p['hub'] = p['short'].upper() + ' (TARIFF TRACKER)'
    for i, t in enumerate(data['timeline']):
        check_date(t.get('date'), 'timeline[' + str(i) + ']')
        check_url(t.get('url'), 'timeline[' + str(i) + ']')
    slugs = set()
    counts = {u: 0 for u in USES}
    for c in data['companies']:
        s = c['slug']
        if s in slugs:
            fail('duplicate slug ' + s)
        slugs.add(s)
        if c.get('use') not in USES:
            fail(s + ': use must be one of ' + ', '.join(USES))
        counts[c['use']] += 1
        for k in ('refund', 'paid'):
            if c.get(k):
                check_money(c[k], s + ' ' + k)
        u = c.get('use_box')
        if u:
            if not u.get('label') or not u.get('text'):
                fail(s + ' use_box: label and text are required')
            if u.get('amount'):
                if not isinstance(u['amount'], int) or u['amount'] < 0:
                    fail(s + ' use_box: amount must be a whole number')
            check_url(u.get('url'), s + ' use_box')
            if u.get('url2'):
                check_url(u['url2'], s + ' use_box')
        for j, x in enumerate(c.get('lines', [])):
            check_url(x.get('url'), s + ' lines[' + str(j) + ']')
        for k in ('response', 'lawsuit'):
            if c.get(k):
                check_url(c[k].get('url'), s + ' ' + k)
        if c.get('company_slug'):
            if c['company_slug'] not in company_slugs:
                fail(s + ': company_slug ' + c['company_slug'] + ' is not on the Company tracker')
        else:
            c['hub'] = c['name'].split(' (')[0] + ' (company)'
    for i, x in enumerate(data['says']):
        check_url(x.get('url'), 'says[' + str(i) + ']')
        if x.get('url2'):
            check_url(x['url2'], 'says[' + str(i) + ']')
    if data.get('trigger'):
        check_url(data['trigger'].get('url'), 'trigger')
    data['use_counts'] = counts
    out = os.path.join(site, 'money-trail', 'tariffs.js')
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    with open(out, 'w', encoding='utf-8') as f:
        f.write('// Tariff tracker (D289). Built by tools/money-trail/build_tariffs.py from tools/money-trail/tariffs.json. Do not edit by hand.\n')
        f.write('window.TW_TARIFFS=' + body + ';\n')
    print('wrote', out, len(data['companies']), 'companies')


if __name__ == '__main__':
    main()
