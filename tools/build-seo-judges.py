#!/usr/bin/env python3
"""Add a crawlable "<State> judges on the 2026 ballot" section to each state's map page and states page.

Reads site/map*/data/judges.json (built by tools/build-map-judges.py), so run that first.
Run from the repository root:  python tools/build-seo-judges.py
The section is plain HTML between <!-- judges-seo --> markers, so running again replaces it.
"""
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, 'site')
# abbreviation: (state name, map folder, states page, judges page path from site/)
STATES = {
    'co': ('Colorado', 'map', 'colorado', 'guide/races/judges-rtd.html'),
    'ak': ('Alaska', 'map-ak', 'alaska', 'guide-ak/races/judges.html'),
    'az': ('Arizona', 'map-az', 'arizona', 'guide-az/races/judges.html'),
    'ca': ('California', 'map-ca', 'california', 'guide-ca/races/judges.html'),
    'fl': ('Florida', 'map-fl', 'florida', 'guide-fl/races/judges.html'),
    'in': ('Indiana', 'map-in', 'indiana', 'guide-in/races/judges.html'),
    'ks': ('Kansas', 'map-ks', 'kansas', 'guide-ks/races/judges.html'),
    'md': ('Maryland', 'map-md', 'maryland', 'guide-md/races/judges.html'),
    'mi': ('Michigan', 'map-mi', 'michigan', 'guide-mi/races/judges.html'),
    'mo': ('Missouri', 'map-mo', 'missouri', 'guide-mo/races/judges.html'),
    'ne': ('Nebraska', 'map-ne', 'nebraska', 'guide-ne/races/judges.html'),
    'nm': ('New Mexico', 'map-nm', 'new-mexico', 'guide-nm/races/judges.html'),
    'ny': ('New York', 'map-ny', 'new-york', 'guide-ny/races/judges.html'),
    'ok': ('Oklahoma', 'map-ok', 'oklahoma', 'guide-ok/races/judges.html'),
    'ut': ('Utah', 'map-ut', 'utah', 'guide-ut/races/judges.html'),
    'wy': ('Wyoming', 'map-wy', 'wyoming', 'guide-wy/races/judges.html'),
}
START, END = '<!-- judges-seo -->', '<!-- /judges-seo -->'


def esc(t):
    return html.escape(t, quote=True)


def section(st):
    name, mapdir, page, jp = STATES[st]
    data = json.load(open(os.path.join(SITE, mapdir, 'data', 'judges.json'), encoding='utf8'))
    by = {}
    seen = set()
    for e in list(data.get('statewide', [])) + [x for v in data.get('counties', {}).values() for x in v] + list(data.get('others', [])):
        k = (e['court'], e['name'])
        if k in seen:
            continue
        seen.add(k)
        by.setdefault(e['court'], []).append(e['name'])
    total = len(seen)
    link = '../' + jp
    out = [START, f'<section class="judges-seo" id="judges" aria-labelledby="judges-h">',
           f'<h2 id="judges-h">{esc(name)} judges on the 2026 ballot</h2>',
           f'<p>Judges on {esc(name)}\'s Tuesday, November 3, 2026 ballot are listed below; the ones you vote on depend on where you live. '
           f'<a href="{esc(link)}">See every {esc(name)} judge with sources and ratings</a>.</p>']
    for court in sorted(by, key=lambda c: (c.split(',')[0], c)):
        out.append(f'<h3>{esc(court)}</h3><ul>' + ''.join(f'<li><a href="{esc(link)}">{esc(n)}</a></li>' for n in by[court]) + '</ul>')
    out.append('</section>')
    out.append(END)
    return '\n'.join(out), total


def put(path, block, anchor_re):
    s = open(path, encoding='utf8').read()
    s = re.sub(re.escape(START) + r'.*?' + re.escape(END) + r'\n?', '', s, flags=re.S)
    m = anchor_re.search(s)
    if not m:
        print('NO ANCHOR', path)
        return False
    s = s[:m.start()] + block + '\n' + s[m.start():]
    open(path, 'w', encoding='utf8').write(s)
    return True


def main():
    for st in STATES:
        name, mapdir, page, jp = STATES[st]
        block, total = section(st)
        ok1 = put(os.path.join(SITE, mapdir, 'index.html'), block, re.compile(r'<footer class="bottom">'))
        ok2 = put(os.path.join(SITE, 'states', page + '.html'), block, re.compile(r'</main>'))
        print(st, total, ok1, ok2)


if __name__ == '__main__':
    sys.exit(main())
