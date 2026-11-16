#!/usr/bin/env python3
"""War tracker (D287): wars, military actions and non-combat military missions for the Money web and the War tracker tab.

Reads tools/money-trail/wars.json (written by hand from the sources named in it) and writes site/money-trail/wars.js
(window.TW_WARS). Run from the repo root:

  python3 -I tools/money-trail/build_wars.py site

Checks before it writes, and stops on any failure:
  - every lives count and every dollar figure has a source link (https) and an "as of" date;
  - a lives count never carries a dollar amount, and no lives figure is ever multiplied or turned into money;
  - every president slug has a page under site/government/presidents/;
  - kinds are one of the known kinds.

"Lives lost, at least" for each entry is the sum of the LOW end of the counts marked total: true. Counts that overlap
(for example U.S. deaths inside an all-sides count) are marked total: false so nothing is counted twice.
"""
import json
import os
import sys

KINDS = {
    'war': 'War',
    'strikes': 'Air and missile strikes',
    'raid': 'Raid',
    'peacekeeping': 'Peacekeeping mission',
    'relief': 'Disaster and health relief',
    'engineering': 'Army Corps of Engineers work',
}
COMBAT = {'war', 'strikes', 'raid', 'peacekeeping'}
PRESIDENT_NAMES = {
    'harry-s-truman': 'Harry S. Truman', 'dwight-d-eisenhower': 'Dwight D. Eisenhower', 'lyndon-b-johnson': 'Lyndon B. Johnson',
    'richard-nixon': 'Richard Nixon', 'ronald-reagan': 'Ronald Reagan', 'george-h-w-bush': 'George H. W. Bush',
    'william-j-clinton': 'William J. Clinton', 'george-w-bush': 'George W. Bush', 'barack-obama': 'Barack Obama',
    'donald-j-trump': 'Donald J. Trump', 'joseph-r-biden-jr': 'Joseph R. Biden, Jr.',
}


def fail(msg):
    sys.exit('build_wars: ' + msg)


def check_url(u, where):
    if not isinstance(u, str) or not u.startswith('https://'):
        fail(where + ': source link missing or not https: ' + repr(u))


def main():
    if len(sys.argv) != 2:
        fail('usage: build_wars.py SITE_DIR')
    site = sys.argv[1]
    here = os.path.dirname(os.path.abspath(__file__))
    data = json.load(open(os.path.join(here, 'wars.json'), encoding='utf-8'))
    slugs = set()
    for it in data['items']:
        s = it['slug']
        if s in slugs:
            fail('duplicate slug ' + s)
        slugs.add(s)
        if it['kind'] not in KINDS:
            fail(s + ': unknown kind ' + it['kind'])
        it['kind_label'] = KINDS[it['kind']]
        it['combat'] = it['kind'] in COMBAT
        if not it.get('short'):
            fail(s + ': short name missing')
        it['hub'] = it['short'].upper() + (' (MILITARY ACTION)' if it['combat'] else ' (MILITARY MISSION)')
        pres = []
        for p in it.get('presidents', []):
            page = '/government/presidents/' + p + '.html'
            if not os.path.exists(os.path.join(site, page.lstrip('/'))):
                fail(s + ': no president page ' + page)
            if p not in PRESIDENT_NAMES:
                fail(s + ': add ' + p + ' to PRESIDENT_NAMES')
            pres.append({'slug': p, 'name': PRESIDENT_NAMES[p], 'page': page})
        it['presidents'] = pres
        low = high = 0
        exact = True
        for i, l in enumerate(it.get('lives', [])):
            w = s + ' lives[' + str(i) + ']'
            for k in ('amount', 'usd', 'value'):
                if k in l:
                    fail(w + ': a lives count must never carry a dollar figure')
            if not isinstance(l.get('n'), int) or l['n'] < 0:
                fail(w + ': n must be a whole number')
            if 'hi' in l and (not isinstance(l['hi'], int) or l['hi'] < l['n']):
                fail(w + ': hi must be a whole number at least n')
            check_url(l.get('url'), w)
            if l.get('url2'):
                check_url(l['url2'], w)
            if not l.get('asof') or not l.get('who'):
                fail(w + ': who and asof are required')
            if l.get('total', True):
                low += l['n']
                high += l.get('hi', l['n'])
                if 'hi' in l:
                    exact = False
        it['lives_low'] = low
        it['lives_high'] = high
        it['lives_range'] = not exact
        for i, m in enumerate(it.get('money', [])):
            w = s + ' money[' + str(i) + ']'
            if not isinstance(m.get('amount'), (int, float)) or m['amount'] <= 0:
                fail(w + ': amount must be a positive number')
            check_url(m.get('url'), w)
            if m.get('url2'):
                check_url(m['url2'], w)
            if m.get('web') and not m.get('from'):
                fail(w + ': a line on the web needs a from dot')
        for i, c in enumerate(it.get('contracts', [])):
            check_url(c.get('url'), s + ' contracts[' + str(i) + ']')
        for i, a in enumerate(it.get('authority', [])):
            check_url(a.get('url'), s + ' authority[' + str(i) + ']')
        for i, x in enumerate(it.get('says', [])):
            check_url(x.get('url'), s + ' says[' + str(i) + ']')
        if it.get('trigger'):
            check_url(it['trigger'].get('url'), s + ' trigger')
    data['items'].sort(key=lambda x: x['start'], reverse=True)
    data['kinds'] = KINDS
    out = os.path.join(site, 'money-trail', 'wars.js')
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    with open(out, 'w', encoding='utf-8') as f:
        f.write('// War tracker (D287). Built by tools/money-trail/build_wars.py from tools/money-trail/wars.json. Do not edit by hand.\n')
        f.write('window.TW_WARS=' + body + ';\n')
    print('wrote', out, len(data['items']), 'items')


if __name__ == '__main__':
    main()
