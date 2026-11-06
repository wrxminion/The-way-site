"""Build the page-to-trail table for the Follow the money tag (site/follow-money.js).

Reads the ballot measure IDs from site/money-trail/follow.html (the trail page's own records)
and lists every guide measure page and Election Studies page whose measure has a trail.
Prints the JavaScript object to paste between the MEASURES markers in site/follow-money.js,
and lists the measure pages that have no trail (those tags link to the state's Money Trail view).

Run from the repository root:  python3 tools/follow-money/build_measure_map.py
"""
import json
import pathlib
import re

SITE = pathlib.Path('site')
html = (SITE / 'money-trail' / 'follow.html').read_text(encoding='utf-8')
records = json.loads(re.search(r'<script[^>]*id="way-trail-records"[^>]*>(.*?)</script>', html, re.S).group(1))
ballot_ids = {b[0] for b in records['ballots']}

# Election Studies pages are named for the measure; these are the ones that are not plain CO names.
STUDY_STATE = {'florida-': 'fl', 'north-carolina-': 'nc', 'oklahoma-': 'ok'}
NAMED = {  # page slug (state, file) -> trail ID, where the file name does not carry the number
    ('nc', 'income-tax-cap-amendment'): 'NC-INCOME-2026',
    ('nc', 'photo-id-amendment'): 'NC-ID-2026',
    ('nc', 'property-tax-limit-amendment'): 'NC-PROPERTY-2026',
    ('mn', 'amendment-1-school-fund'): 'MN-2026-SCHOOL-FUND',
    ('ks', 'citizen-voting-amendment'): 'KS-2026-NOV-HCR5004',
    ('ia', 'amendment-1-income-tax-two-thirds-vote'): 'IA-2026-NOV-SJR11',
}


def trail_id(st, slug):
    if (st, slug) in NAMED:
        return NAMED[(st, slug)]
    S = st.upper()
    m = re.match(r'(amendment|proposition|prop|issue|question|proposal|state-question|il26|ip26)-([0-9a-z]+?)(?:-|$)', slug)
    if not m:
        return None
    kind, num = m.groups()
    cands = {
        'co': ['CO-' + num.upper()],
        'mi': ['MI-2026-' + num],
        'wi': ['WI-Q' + num],
        'va': ['VA-NOV-Q' + num],
        'wa': ['WA-2026-' + kind.upper() + '-' + num],
        'mo': ['MO-' + kind.capitalize() + '-' + num.upper()],
        'nv': ['NV-Question-' + num],
        'ut': ['UT-Amendment-' + num.upper()],
    }.get(st, [S + '-' + num.upper()])
    for c in cands:
        if c in ballot_ids:
            return c
    return None


table, missing = {}, []
pages = []
for d in sorted(SITE.glob('guide*/measures')):
    st = 'co' if d.parent.name == 'guide' else d.parent.name[-2:]
    pages += [(st, p) for p in sorted(d.glob('*.html')) if p.stem != 'index']
for p in sorted((SITE / 'case-studies').glob('*.html')):
    if p.stem in ('index', 'tabor'):
        continue
    st, slug = 'co', p.stem
    for pre, code in STUDY_STATE.items():
        if slug.startswith(pre):
            st, slug = code, slug[len(pre):]
    pages.append((st, p, slug))
for item in pages:
    st, p = item[0], item[1]
    slug = item[2] if len(item) > 2 else p.stem
    tid = trail_id(st, slug)
    key = '/' + str(p.relative_to(SITE)).replace('\\', '/')
    if tid:
        table[key] = tid
    else:
        missing.append(key)

print('  // MEASURES start (built by tools/follow-money/build_measure_map.py)')
for k in sorted(table):
    print("  '%s': '%s'," % (k, table[k]))
print('  // MEASURES end')
print('// %d pages with a trail; no trail for: %s' % (len(table), ', '.join(missing)))
print('// trail IDs never linked: %s' % ', '.join(sorted(ballot_ids - set(table.values()))))
