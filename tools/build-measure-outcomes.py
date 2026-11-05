#!/usr/bin/env python3
"""Build site/results/measure-pages.json: which results contest belongs to which ballot measure page.

The Passed / Failed / Not yet called mark on measure pages and Election Studies (site/results/outcome.js)
reads this file, then reads the live results file for the contest. The mark itself is never written by
hand: it comes from the results data ("called" set by AP or the state, or a certified result).

Run from the repository root after the results files exist:
    python3 tools/build-measure-outcomes.py            # writes the file, lists pages with no match
    python3 tools/build-measure-outcomes.py --check    # only lists, writes nothing

For the next election: add pages to site/guide*/measures/ or site/case-studies/, run this, and check the
"no match" list. Add a line to OVERRIDES for any page the automatic matching gets wrong or misses.
"""
import glob, html, json, os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site')
DATA = os.path.join(ROOT, 'results', 'data')

# page path -> contest id, for pages the automatic match cannot do (names instead of numbers, and so on).
OVERRIDES = {
    '/guide-fl/measures/amendment-1.html': 'fl-amd-budget-stabilization-fund',
    '/guide-fl/measures/amendment-2.html': 'fl-amd-exemption-of-tangible-personal-property-on-agricultural-land-from-taxatio',
    '/guide-fl/measures/amendment-3.html': 'fl-amd-increased-homestead-exemption-lower-cap-on-increases-in-non-homestead-pro',
    '/case-studies/florida-amendment-1.html': 'fl-amd-budget-stabilization-fund',
    '/case-studies/florida-amendment-2.html': 'fl-amd-exemption-of-tangible-personal-property-on-agricultural-land-from-taxatio',
    '/case-studies/florida-amendment-3.html': 'fl-amd-increased-homestead-exemption-lower-cap-on-increases-in-non-homestead-pro',
    '/guide-nc/measures/photo-id-amendment.html': 'nc-constitutional-amendment-require-photo-id-for-voting',
    '/guide-nc/measures/income-tax-cap-amendment.html': 'nc-constitutional-amendment-maximum-income-tax-rate-of-3-5',
    '/guide-nc/measures/property-tax-limit-amendment.html': 'nc-constitutional-amendment-property-tax-levy-limit',
    '/case-studies/north-carolina-photo-id-amendment.html': 'nc-constitutional-amendment-require-photo-id-for-voting',
    '/case-studies/north-carolina-income-tax-cap-amendment.html': 'nc-constitutional-amendment-maximum-income-tax-rate-of-3-5',
    '/case-studies/north-carolina-property-tax-limit-amendment.html': 'nc-constitutional-amendment-property-tax-levy-limit',
    '/guide/measures/ballot-issue-7a.html': 'co-front-range-passenger-rail-district-ballot-issue-7a',
    '/guide-ak/measures/measure-2.html': 'ak-68-bm-2-24eseg',
    '/guide-ak/measures/measure-3.html': 'ak-69-bm-3-25uscv',
    '/guide-ks/measures/citizen-voting-amendment.html': 'ks-constitutional-amendment',
    '/guide-mi/measures/proposal-1.html': 'mi-proposal-2026-1-112750',
    '/guide-mi/measures/proposal-2.html': 'mi-proposal-2026-2-112751',
    '/guide-mn/measures/amendment-1-school-fund.html': 'mn-0351-constitutional-amendment-1',
    '/guide-id/measures/hjr-4.html': 'id-idaho-constitutional-amendment-house-joint-resolution-4',
    '/guide-id/measures/hjr-6.html': 'id-idaho-constitutional-amendment-house-joint-resolution-6',
    '/guide-id/measures/proposition-1.html': 'id-proposition-1-reproductive-freedom-privacy-act',
    '/guide-id/measures/state-gun-advisory.html': 'id-advisory-question-house-bill-932',
    '/guide-sd/measures/medicaid-expansion-amendment.html': 'sd-constitutional-amendment-i-an-amendment-to-the-south-dakota-constit',
    '/guide-sd/measures/citizenship-voting-amendment.html': 'sd-constitutional-amendment-j-an-amendment-to-the-south-dakota-constit',
    '/guide-sd/measures/unclaimed-property-trust-amendment.html': 'sd-constitutional-amendment-k-an-amendment-to-the-south-dakota-constit',
    '/guide-sd/measures/sixty-percent-amendment.html': 'sd-constitutional-amendment-l-an-amendment-to-the-south-dakota-constit',
    '/guide-ne/measures/amendment-1.html': 'ne-proposed-amendment-no-1',
    '/guide-ri/measures/green-economy-bonds.html': 'ri-5-green-economy-bonds-55-000-000',
    '/guide-wv/measures/amendment-1-citizenship-voting.html': 'wv-6350',
    '/guide-oh/measures/issue-3.html': 'oh-58f2c0185a8c8a6ae0633390ee0af8c5',
    '/guide-wa/measures/il26-001-parental-rights.html': 'wa-initiative-measure-no-il26-001',
    '/guide-wa/measures/il26-638-girls-school-sports.html': 'wa-initiative-measure-no-il26-638',
    '/guide-wa/measures/ip26-645-income-tax-repeal.html': 'wa-initiative-measure-no-ip26-645',
    '/guide-md/measures/question-1.html': 'md-question-1-constitutional-amendment',
    '/guide-md/measures/question-2.html': 'md-question-2-constitutional-amendment',
    '/guide-md/measures/question-3.html': 'md-question-3-constitutional-amendment',
    '/guide-nm/measures/amendment-1-veto-rules.html': 'nm-constitutional-amendment-1-proposing-an-amendment-to-article-4-sect',
    '/guide-nm/measures/amendment-4-legislator-pay.html': 'nm-constitutional-amendment-4-proposing-to-amend-article-4-section-10-',
    '/guide-nd/measures/measure-1-sixty-percent.html': 'nd-ap-nd84788',
    '/guide-nd/measures/measure-2-school-meals.html': 'nd-ap-nd84789',
    '/guide-wi/measures/question-1-partial-veto.html': 'wi-state-question-1',
    '/guide-wi/measures/question-2-places-of-worship.html': 'wi-state-question-2',
    '/guide-wi/measures/question-3-government-discrimination.html': 'wi-state-question-3',
}

# Election Studies pages live in one folder; their state comes from the file name.
STUDY_STATE = [(r'^(amendment-8\d|proposition-)', 'co'), (r'^florida-', 'fl'), (r'^north-carolina-', 'nc'), (r'^oklahoma-', 'ok')]

# How the page itself says the measure passes. Shown next to the count while it is not called yet.
# Taken from the page's own "Passes with ..." line; a page with no such line gets no rule shown.
def pass_rule(text):
    t = re.sub(r'\s+', ' ', text)
    m = re.search(r'Passes with (?:a |an |at least )?([^.(•]{3,140})', t, re.I) or \
        re.search(r'It needs ([^.(•]{3,100}?) to pass', t, re.I)
    if not m:
        return None
    r = m.group(1).strip()
    if re.match(r'Passes with at least', m.group(0), re.I):
        r = 'at least ' + r
    r = re.split(r';|, and (?:it )?takes effect|, for all ', r)[0].strip().rstrip(',;:')
    r = re.sub(r'^(a|an)\s+', '', r, flags=re.I)
    if r.lower() == 'two-thirds':
        r = 'two-thirds of the votes cast on it'
    if len(r) > 1 and not r[1].isupper():
        r = r[0].lower() + r[1:]
    return r or None


def vote_means(raw, side):
    """The page's own one-line YES or NO meaning, from its 'What your vote means' box."""
    m = re.search(r'<div class="' + side + r'">\s*<b>[^<]*</b>\s*<p>(.*?)</p>', raw, re.S)
    if not m:
        return None
    t = ' '.join(text_of(m.group(1)).split())
    if len(t) > 240:
        cut = t[:240].rfind('. ')
        t = t[:cut + 1] if cut > 80 else t[:237].rsplit(' ', 1)[0] + '…'
    return t or None


def text_of(raw):
    raw = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', raw, flags=re.S | re.I)
    return html.unescape(re.sub(r'<[^>]+>', ' ', raw))


def load_contests():
    by_state = {}
    for f in glob.glob(os.path.join(DATA, '*.json')):
        name = os.path.basename(f)
        if name in ('manifest.json', 'balance.json'):
            continue
        try:
            d = json.load(open(f))
        except Exception:
            continue
        for c in d.get('contests', []):
            if c.get('kind') not in ('measure', 'local') or not c.get('state'):
                continue
            by_state.setdefault(c['state'], {})[c['id']] = (name, c)
    return by_state


def key_tokens(path, h1):
    """The measure's number or letter, e.g. 81, 845, 'nn', 'a', and its kind word."""
    base = os.path.basename(path)[:-5]
    m = re.match(r'(amendment|proposition|prop|question|issue|measure|initiative|proposal|bond|ci|i|state-question|public-question)-([0-9a-z]+?)(?:-|$)', base)
    if not m:
        m2 = re.search(r'(Amendment|Proposition|Question|Issue|Measure|Proposal|Bond Question)\s+([0-9A-Z]+)\b', h1)
        return (m2.group(1).lower(), m2.group(2).lower()) if m2 else (None, None)
    return m.group(1), m.group(2)


def auto_match(contests, kind, num):
    if not num:
        return None
    hits = []
    for cid, (fname, c) in contests.items():
        title = (c.get('title') or '') + ' ' + cid
        if not re.search(r'(^|[^0-9a-z])' + re.escape(num) + r'([^0-9a-z]|$)', title.lower()):
            continue
        word = {'prop': 'proposition', 'ci': 'ci', 'i': 'i', 'state-question': 'question',
                'public-question': 'question', 'bond': 'bond'}.get(kind, kind)
        if word and word not in title.lower():
            continue
        if c.get('level') == 'local' and re.search(r'city|town|county|school|district|village|college|parish', c.get('title') or '', re.I):
            continue
        hits.append(cid)
    return hits[0] if len(hits) == 1 else (None if not hits else hits)


def main():
    check = '--check' in sys.argv
    by_state = load_contests()
    pages = sorted(glob.glob(os.path.join(ROOT, 'guide*', 'measures', '*.html'))) + \
        sorted(glob.glob(os.path.join(ROOT, 'case-studies', '*.html')))
    out, missing = {}, []
    for f in pages:
        rel = '/' + os.path.relpath(f, ROOT).replace(os.sep, '/')
        base = os.path.basename(f)
        if base == 'index.html' or base.startswith('tabor'):
            continue
        raw = open(f, encoding='utf-8').read()
        h1m = re.search(r'<h1[^>]*>(.*?)</h1>', raw, re.S)
        h1 = ' '.join(text_of(h1m.group(1)).split()) if h1m else ''
        if rel.startswith('/case-studies/'):
            st = next((s for p, s in STUDY_STATE if re.match(p, base)), None)
        else:
            m = re.match(r'^/guide(?:-([a-z]{2}))?/', rel)
            st = m.group(1) or 'co'
        contests = by_state.get(st, {})
        cid = OVERRIDES.get(rel)
        if not cid:
            kind, num = key_tokens(rel, h1)
            hit = auto_match(contests, kind, num)
            if isinstance(hit, list):
                missing.append((rel, 'more than one match, add it to OVERRIDES: ' + ', '.join(hit[:4])))
                hit = None
            cid = hit
        entry = {'state': st}
        rule = pass_rule(text_of(raw))
        if rule:
            entry['needs'] = rule
        for side in ('yes', 'no'):
            v = vote_means(raw, side)
            if v:
                entry[side] = v
        if cid and cid in contests:
            entry['file'] = contests[cid][0]
            entry['contest'] = cid
        elif not any(r == rel for r, _ in missing):
            missing.append((rel, 'no results contest found in the results files'))
        out[rel] = entry
    # An Election Study with no "Passes with" line borrows the rule from the guide page for the same contest.
    guide_by_contest = {e['contest']: e for r, e in out.items() if r.startswith('/guide') and e.get('contest')}
    for r, e in out.items():
        g = guide_by_contest.get(e.get('contest'))
        if not r.startswith('/case-studies/') or not g:
            continue
        e['guide'] = next(gr for gr, ge in out.items() if ge is g)
        for k in ('needs', 'yes', 'no'):
            if not e.get(k) and g.get(k):
                e[k] = g[k]
    for rel, why in missing:
        print('no match:', rel, '-', why)
    print(len(out), 'pages,', sum(1 for e in out.values() if 'contest' in e), 'matched to a results contest')
    if '--list' in sys.argv:
        for rel, e in out.items():
            c = by_state.get(e['state'], {}).get(e.get('contest'), (None, {}))[1]
            print(rel, '=>', e.get('contest'), '|', (c.get('title') or '')[:70], '| needs:', e.get('needs'))
    if not check:
        dest = os.path.join(ROOT, 'results', 'measure-pages.json')
        with open(dest, 'w', encoding='utf-8') as fh:
            json.dump({'schema': 'theway-measure-pages/1',
                       'note': 'Built by tools/build-measure-outcomes.py. Maps a measure page to its results contest. The mark comes from the results data, never from this file.',
                       'pages': out}, fh, indent=1, sort_keys=True)
            fh.write('\n')
        print('wrote', os.path.relpath(dest))


if __name__ == '__main__':
    main()
