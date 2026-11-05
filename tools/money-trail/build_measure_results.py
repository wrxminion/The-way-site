# Maps each Money Trail ballot measure (site/money-trail/data.js, RESEARCH.ballots) to its contest in the
# live results files (site/results/data/*.json). Writes site/money-trail/measure-results.json.
# Usage: python3 -I tools/money-trail/build_measure_results.py site
# The map says only WHERE the result is. Passed or Failed comes from the results data at view time, using the
# same rule as site/results/outcome.js: only an AP call, an official call or state certification counts.
import json, os, re, sys

site = (sys.argv[1] if len(sys.argv) > 1 else 'site').rstrip('/') + '/'
s = open(site + 'money-trail/data.js', encoding='utf-8').read()
R = json.loads(s[s.index('{'):s.rindex('}') + 1])
pages = json.load(open(site + 'results/measure-pages.json', encoding='utf-8'))['pages']

rx = re.compile(r'^/guide(?:-([a-z]{2}))?/measures/(?:.*?-)?(?:amendment|prop|proposition|question|issue|measure)-([0-9a-z]+)(?=[-.])')
by_key = {}
for path, v in pages.items():
    m = rx.match(path)
    if m and v.get('contest'):
        by_key.setdefault((m.group(1) or 'co').upper() + '-' + m.group(2).upper(), {'state': v['state'], 'contest': v['contest'], 'file': v['file'], 'guide': path})

# Measures whose IDs in the research data do not follow the guide page names. Checked by title on Nov 5, 2026.
MANUAL = {
    'NC-ID-2026': ('nc', 'nc-constitutional-amendment-require-photo-id-for-voting', 'state-nc.json', '/guide-nc/measures/photo-id-amendment.html'),
    'NC-INCOME-2026': ('nc', 'nc-constitutional-amendment-maximum-income-tax-rate-of-3-5', 'state-nc.json', '/guide-nc/measures/income-tax-cap-amendment.html'),
    'NC-PROPERTY-2026': ('nc', 'nc-constitutional-amendment-property-tax-levy-limit', 'state-nc.json', '/guide-nc/measures/property-tax-limit-amendment.html'),
    'MI-2026-1': ('mi', 'mi-proposal-2026-1-112750', 'state-mi.json', None),
    'MI-2026-2': ('mi', 'mi-proposal-2026-2-112751', 'state-mi.json', None),
    'WI-Q1': ('wi', 'wi-state-question-1', 'state-wi.json', None),
    'WI-Q2': ('wi', 'wi-state-question-2', 'state-wi.json', None),
    'WI-Q3': ('wi', 'wi-state-question-3', 'state-wi.json', None),
    'VA-NOV-Q1': ('va', 'va-proposed-constitutional-amendment-question-1', 'state-va.json', None),
    'VA-NOV-Q2': ('va', 'va-proposed-constitutional-amendment-question-2', 'state-va.json', None),
    'VA-NOV-Q3': ('va', 'va-proposed-constitutional-amendment-question-3', 'state-va.json', None),
    'MN-2026-SCHOOL-FUND': ('mn', 'mn-0351-constitutional-amendment-1', 'state-mn.json', None),
    'KS-2026-NOV-HCR5004': ('ks', 'ks-constitutional-amendment', 'state-ks.json', None),
    'IA-2026-NOV-SJR11': ('ia', 'ia-constitutional-amendment-1', 'state-ia.json', None),
    'WA-2026-IL26-001': ('wa', 'wa-initiative-measure-no-il26-001', 'state-wa.json', None),
    'WA-2026-IL26-638': ('wa', 'wa-initiative-measure-no-il26-638', 'state-wa.json', None),
    'WA-2026-IP26-645': ('wa', 'wa-initiative-measure-no-ip26-645', 'state-wa.json', None),
    'MO-Amendment-3': ('mo', 'mo-constitutional-amendment-no-3', 'state-mo.json', None),
    'MO-Amendment-6': ('mo', 'mo-constitutional-amendment-no-6', 'state-mo.json', None),
    'MO-Amendment-7': ('mo', 'mo-constitutional-amendment-no-7', 'state-mo.json', None),
    'MO-Amendment-8': ('mo', 'mo-constitutional-amendment-no-8', 'state-mo.json', None),
    'MO-Proposition-A': ('mo', 'mo-proposition-a', 'state-mo.json', None),
    'NV-Question-6': ('nv', 'nv-statewide-ballot-question-no-6-60921b', 'state-nv.json', None),
    'NV-Question-7': ('nv', 'nv-statewide-ballot-question-no-7-121094', 'state-nv.json', None),
    'UT-Amendment-A': ('ut', 'ut-constitutional-amendment-a', 'state-ut.json', None),
    'UT-Amendment-B': ('ut', 'ut-constitutional-amendment-b', 'state-ut.json', None),
}

out, missing = {}, []
contests = {}
for b in R['ballots']:
    mid = b['measure_id']
    e = None
    if mid in MANUAL:
        st, c, f, g = MANUAL[mid]
        e = {'state': st, 'contest': c, 'file': f, 'guide': g}
    elif mid in by_key:
        e = dict(by_key[mid])
    if e and b.get('election_date') != '2026-11-03':
        e = None  # the results files cover the November 3, 2026 election only
    if e:
        fn = site + 'results/data/' + e['file']
        if fn not in contests:
            contests[fn] = {c['id'] for c in json.load(open(fn, encoding='utf-8')).get('contests', [])} if os.path.exists(fn) else set()
        if e['contest'] not in contests[fn]:
            e = None
    if e:
        out[mid] = {k: v for k, v in e.items() if v}
    else:
        missing.append(mid)

doc = {'note': 'Built by tools/money-trail/build_measure_results.py. Says which results contest belongs to each Money Trail measure. Passed or Failed comes from the results data, never from this file.',
       'measures': out}
open(site + 'money-trail/measure-results.json', 'w', encoding='utf-8').write(json.dumps(doc, indent=1, sort_keys=True) + '\n')
print('mapped', len(out), 'of', len(R['ballots']), '; no November result contest:', ' '.join(missing))
