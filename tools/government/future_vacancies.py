#!/usr/bin/env python3
"""Turns the U.S. Courts "Future Judicial Vacancies" page into tools/government/data/future-vacancies.json.

  1. Save https://www.uscourts.gov/data-news/judicial-vacancies/future-judicial-vacancies as an .html file
     (the cloud cannot reach uscourts.gov; download it on a home computer).
  2. python3 tools/government/future_vacancies.py <saved page.html>
  3. Rebuild the courts: python3 tools/government/build_courts.py <judges.csv>
"""
import html as H
import json
import os
import re
import sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'future-vacancies.json')
URL = 'https://www.uscourts.gov/data-news/judicial-vacancies/future-judicial-vacancies'


def cells(row):
    return [re.sub(r'\s+', ' ', H.unescape(re.sub(r'<[^>]+>', ' ', c))).strip()
            for c in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', row, re.S)]


def main():
    s = open(sys.argv[1], encoding='utf-8', errors='replace').read()
    text = re.sub(r'\s+', ' ', H.unescape(re.sub(r'<[^>]+>', ' ', s)))
    m = re.search(r'Update as of\s*([0-9/]+)', text)
    as_of = m.group(1) if m else ''
    tables = re.findall(r'<table[^>]*>(.*?)</table>', s, re.S)
    rows = []
    for t in tables:
        trs = re.findall(r'<tr[^>]*>(.*?)</tr>', t, re.S)
        if not trs:
            continue
        head = [h.lower() for h in cells(trs[0])]
        if not any('incumbent' in h for h in head):
            continue
        for tr in trs[1:]:
            c = cells(tr)
            if len(c) < len(head) or not any(c):
                continue
            d = dict(zip(head, c))
            pick = lambda *keys: next((d[k] for k in d if any(x in k for x in keys)), '')
            rows.append({'court': pick('circuit', 'court'), 'incumbent': pick('incumbent'), 'reason': pick('reason'),
                         'date': pick('vacancy date'), 'nominee': pick('nominee'), 'nomination_date': pick('nomination date'),
                         'notified': pick('notification')})
    if not rows:
        sys.exit('no vacancy table found in the page')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({'source': URL, 'as_of': as_of, 'rows': rows}, open(OUT, 'w', encoding='utf-8', newline='\n'), indent=1, ensure_ascii=False)
    print('wrote %d rows (as of %s) to %s' % (len(rows), as_of, OUT))


if __name__ == '__main__':
    main()
