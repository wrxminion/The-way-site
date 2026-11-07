#!/usr/bin/env python3
"""Builds site/money-trail/justices.js: the nine Supreme Court justices for the Money web (D229).

Run from the repo root:  python3 -I tools/money-trail/build_justices.py

Everything comes from records already on this site:
- the list and order of the justices: JUSTICES in tools/government/build_courts.py (Supreme Court members page)
- the president who nominated each one, the nomination date, the Senate confirmation date and roll call count,
  and the commission date: each justice's page in site/government/courts/judges/, built from the
  Federal Judicial Center's Biographical Directory of Article III Federal Judges.

No dollar amount is written here. A nomination, a confirmation vote and a seat on the Court are not payments.
A justice whose page is missing or does not show a field is written without that field, never guessed.
"""
import datetime
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'government'))
from build_courts import BIOS, JUSTICES  # noqa: E402

JUDGES = os.path.join(ROOT, 'site', 'government', 'courts', 'judges')
OUT = os.path.join(ROOT, 'site', 'money-trail', 'justices.js')
MONTHS = {m: i for i, m in enumerate(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
                                       'September', 'October', 'November', 'December'], 1)}


def iso(text):
    m = re.fullmatch(r'(\w+) (\d+), (\d{4})', text or '')
    if not m or m.group(1) not in MONTHS:
        return ''
    return datetime.date(int(m.group(3)), MONTHS[m.group(1)], int(m.group(2))).isoformat()


def congress_of(day):
    """Each Congress starts on January 3 of an odd year: the 1st began in 1789."""
    d = datetime.date.fromisoformat(day)
    y = d.year - (1 if (d.month, d.day) < (1, 3) else 0)
    return (y - 1789) // 2 + 1


def page_text(path):
    s = open(path, encoding='utf-8').read()
    fjc = re.search(r'href="(https://www\.fjc\.gov/[^"]+)"', s)
    s = s[s.find('<main'):]
    s = html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', s)))
    return s, (fjc.group(1) if fjc else '')


def main():
    pages = {}
    for f in sorted(os.listdir(JUDGES)):
        if not f.endswith('.html'):
            continue
        text, fjc = page_text(os.path.join(JUDGES, f))
        if 'Justice on the Supreme Court of the United States' not in text or 'Status Active' not in text:
            continue
        pages[f[:-5]] = (text, fjc)
    rows, missing = [], []
    for name, title, by, oath in JUSTICES:
        last = name.split(',')[0].split()[-1]
        hits = [k for k in pages if k.split('-')[-1] == last.lower() or ('-' + last.lower() + '-') in ('-' + k + '-')]
        if len(hits) != 1:
            missing.append(name)
            rows.append({'name': name, 'title': title, 'president': by, 'oath': oath, 'bio_source': BIOS})
            continue
        slug = hits[0]
        text, fjc = pages[slug]
        nom = re.search(r'Nominated (\w+ \d+, \d{4})', text)
        conf = re.search(r'Confirmed by the Senate (\w+ \d+, \d{4}): Roll call, (\d+) to (\d+)', text)
        com = re.search(r'Received commission (\w+ \d+, \d{4})', text)
        row = {'name': name, 'title': title, 'president': by, 'oath': oath, 'page': '/government/courts/judges/%s.html' % slug,
               'fjc': fjc, 'bio_source': BIOS}
        if nom and iso(nom.group(1)):
            row['nominated'] = iso(nom.group(1))
        if conf and iso(conf.group(1)):
            row['confirmed'] = iso(conf.group(1))
            row['yea'], row['nay'] = int(conf.group(2)), int(conf.group(3))
            row['congress'] = congress_of(row['confirmed'])
        if com and iso(com.group(1)):
            row['commission'] = iso(com.group(1))
        pslug = re.sub(r'[^a-z0-9]+', '-', by.lower()).strip('-')
        if os.path.exists(os.path.join(ROOT, 'site', 'government', 'presidents', pslug + '.html')):
            row['president_page'] = '/government/presidents/%s.html' % pslug
        rows.append(row)
    data = {'built_from': 'tools/government/build_courts.py (Supreme Court members page) and the justice pages in '
                          'site/government/courts/judges/ (Federal Judicial Center directory)', 'justices': rows}
    with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('// Supreme Court justices for the Money web (D229). Built by tools/money-trail/build_justices.py. Do not edit by hand.\n')
        fh.write('// No dollar amounts: a nomination, a confirmation vote and a seat on the Court are not payments.\n')
        fh.write('window.TW_JUSTICES=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('wrote %d justices to %s' % (len(rows), os.path.relpath(OUT, ROOT)))
    if missing:
        print('no page found for: ' + ', '.join(missing))


if __name__ == '__main__':
    main()
