#!/usr/bin/env python3
"""Build the list of past heads of the 15 executive departments, for the "Show a president" picker.

Reads tools/government/data/cabinet/ and writes:
  data/cabinet/heads.json  every head of each department (and its earlier forms), with dates and a check mark
  data/cabinet/check.txt   what was checked, and every place the sources disagree

Sources, best first:
  official/*.psv  the department's own list (State: Office of the Historian data, github.com/HistoryAtState/pocom)
  official/wikipedia-full.psv  English Wikipedia officeholder tables: the dates for offices whose own list has no dates
  official/wikipedia-2017-*.psv  English Wikipedia, January 20, 2017 onward (fills the years after the dataset)
  chamberlain-appointments.csv  Tait Chamberlain, United States of America Cabinet Appointments Dataset (2020, CC BY 3.0 US),
      https://github.com/taitcha/American_cabinet_appointments, compiled from CRS report 85-1120 and reference books.
      Used only as a check: it has many typos (see check.txt).
Departments with a full dated official list (State, Treasury, Interior, Commerce, HHS, Energy, Defense since 1947) show that list.
The others show Wikipedia's dates, checked against the department's own names or years and against the dataset.
Acting officials are left out (the official lists mostly leave them out too), so a gap means no appointed head is listed.

Each row: chk  o = on the department's own list with dates; od = name (or years) on that list, dates from elsewhere;
               n = no official list could be read.  agree = 1 when a second source gives the same dates within 7 days.
"""
import csv, datetime, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data', 'cabinet')
OFF = os.path.join(DATA, 'official')
TODAY = datetime.date.today().isoformat()

MONTHS = {m: i + 1 for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'])}


def pdate(s):
    """'March 8, 1849' / 'Mar 8, 1849' / '8 March 1849' / '3/8/1849' / '1849-03-08' -> ISO, or '' if not a full date."""
    s = (s or '').strip()
    if not s:
        return ''
    m = re.match(r'^(\d{4})-(\d\d)-(\d\d)$', s)
    if m:
        return s
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', s)
    if m:
        return '%s-%02d-%02d' % (m.group(3), int(m.group(1)), int(m.group(2)))
    m = re.match(r'^([A-Za-z]+)\.? (\d{1,2}), (\d{4})$', s)
    if m:
        return '%s-%02d-%02d' % (m.group(3), MONTHS[m.group(1)[:3].lower()], int(m.group(2)))
    m = re.match(r'^(\d{1,2}) ([A-Za-z]+) (\d{4})$', s)
    if m:
        return '%s-%02d-%02d' % (m.group(3), MONTHS[m.group(2)[:3].lower()], int(m.group(1)))
    return ''


SUFFIX = {'jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', '4th', 'md', 'm.d.', 'm.d', 'jr.,'}


def last(name):
    n = re.sub(r'\(.*?\)|"[^"]*"', ' ', name).replace(',', ' ')
    toks = [t for t in n.split() if t.lower().strip('.') not in {s.strip('.') for s in SUFFIX}]
    t = toks[-1].lower() if toks else ''
    return {'gutierrez': 'gutierrez', 'peña': 'pena'}.get(t, t)


def days(a, b):
    return abs((datetime.date.fromisoformat(a) - datetime.date.fromisoformat(b)).days)


def rpsv(fn, cols):
    out = []
    p = os.path.join(OFF, fn) if not fn.startswith('wikipedia') else os.path.join(OFF, fn)
    with open(p, encoding='utf-8') as f:
        for line in f:
            line = line.rstrip('\n')
            if not line or line.startswith('#'):
                continue
            parts = line.split('|') + [''] * len(cols)
            out.append(dict(zip(cols, parts)))
    return out


# --- departments: key, today's office, earlier offices, when the first head of the current form could serve
DEPTS = [
    ('state', ['Secretary of State']),
    ('treasury', ['Secretary of the Treasury', 'Secretary of Treasury']),
    ('defense', ['Secretary of War', 'Secretary of Defense']),
    ('justice', ['Attorney General']),
    ('interior', ['Secretary of the Interior']),
    ('agriculture', ['Secretary of Agriculture']),
    ('commerce', ['Secretary of Commerce and Labor', 'Secretary of Commerce']),
    ('labor', ['Secretary of Commerce and Labor', 'Secretary of Labor']),
    ('hhs', ['Secretary of Health, Education, and Welfare', 'Secretary of Health and Human Services', 'Secretary of of Health and Human Services']),
    ('hud', ['Secretary of Housing and Urban Development']),
    ('dot', ['Secretary of Transportation']),
    ('energy', ['Secretary of Energy']),
    ('education', ['Secretary of Education']),
    ('va', ["Secretary of Veterans' Affairs", 'Secretary of Veterans Affairs']),
    ('dhs', ['Secretary of Homeland Security']),
]
OFFICE_FIX = {'Secretary of Treasury': 'Secretary of the Treasury', 'Secretary of of Health and Human Services': 'Secretary of Health and Human Services',
              "Secretary of Veterans' Affairs": 'Secretary of Veterans Affairs'}
# The Department of Defense began when Forrestal took office (DoD Key Officials); the last Secretary of War served until then.
WAR_END = '1947-09-17'
HEW_TO_HHS = '1980-05-04'  # HHS historical highlights: renamed Health and Human Services on May 4, 1980

log = []


def chamberlain_all():
    rows = []
    with open(os.path.join(DATA, 'chamberlain-appointments.csv'), encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            if r['SenateVotesFor'] == 'acting':
                continue
            rows.append(dict(office=OFFICE_FIX.get(r['Department'], r['Department']), name=r['Name'].strip(),
                             start=pdate(r['ServiceStart']), end=pdate(r['ServiceEnd']), admin=r['Administration']))
    return rows


def official():
    o = {}
    st = []
    for r in rpsv('state.psv', ['name', 'appointed', 'start', 'end', 'note']):
        st.append(dict(office='Secretary of State', name=r['name'], start=r['start'] or r['appointed'], end=r['end'], note=''))
    o['state'] = (st, 'https://history.state.gov/departmenthistory/people/principalofficers/secretary', 'full')
    def simple(fn, office, url, cols=('name', 'start', 'end', 'note'), kind='full'):
        rr = []
        for r in rpsv(fn, list(cols)):
            off = office
            if 'Commerce and Labor' in r.get('note', ''):
                off = 'Secretary of Commerce and Labor'
            rr.append(dict(office=off, name=r['name'], start=pdate(r.get('start', '')), end=pdate(r.get('end', '')),
                           ys=r.get('start', '')[-4:], ye=r.get('end', '')[-4:], note=r.get('note', '')))
        return rr, url, kind
    o['treasury'] = simple('treasury.psv', 'Secretary of the Treasury', 'https://home.treasury.gov/about/history/prior-secretaries')
    d, u, k = simple('defense.psv', 'Secretary of Defense', 'https://history.defense.gov/Portals/70/Documents/key_officials/KeyOfficials-2026-07-24.pdf')
    o['defense'] = ([r for r in d if r['note'] != 'acting'], u, k)
    o['interior'] = simple('interior.psv', 'Secretary of the Interior', 'https://www.doi.gov/whoweare/past_secretaries')
    o['agriculture'] = simple('agriculture.psv', 'Secretary of Agriculture', 'https://www.usda.gov/about-usda/general-information/history/former-secretaries', kind='extract')
    o['commerce'] = simple('commerce.psv', 'Secretary of Commerce', 'https://www.commerce.gov/node/502')
    o['hhs'] = simple('hhs.psv', 'Secretary of Health and Human Services', 'https://www.hhs.gov/about/historical-highlights/index.html')
    o['energy'] = simple('energy.psv', 'Secretary of Energy', 'https://www.energy.gov/lm/doe-history/secretaries-energy')
    o['labor'] = simple('labor-years.psv', 'Secretary of Labor', 'https://www.dol.gov/general/aboutdol/history/sec-chrono', kind='years')
    o['justice'] = simple('ag-years.psv', 'Attorney General', 'https://www.justice.gov/ag/historical-bios', kind='years')
    o['hud'] = simple('hud-starts.psv', 'Secretary of Housing and Urban Development', 'https://www.hud.gov/aboutus/history', cols=('name', 'start', 'note'), kind='starts')
    names = lambda fn: [l.split('|')[0].strip() for l in open(os.path.join(OFF, fn), encoding='utf-8') if l.strip() and not l.startswith('#')]
    o['war'] = ([dict(name=n) for n in names('war-names.txt')], 'https://www.govinfo.gov/content/pkg/GOVPUB-D114-PURL-gpo34904/pdf/GOVPUB-D114-PURL-gpo34904.pdf', 'names')
    o['education'] = ([dict(name=n) for n in names('education-names.txt')], 'https://www.ed.gov/about/ed-organization/leadership-directory', 'names')
    o['dhs'] = ([dict(name=n) for n in names('dhs-names.txt')], 'https://www.dhs.gov/portraits-secretaries-homeland-security', 'names')
    return o


def wiki_full():
    w = {}
    p = os.path.join(OFF, 'wikipedia-full.psv')
    if os.path.exists(p):
        for r in rpsv('wikipedia-full.psv', ['dept', 'office', 'name', 'start', 'end']):
            w.setdefault(r['dept'], []).append(dict(office=r['office'], name=r['name'], start=pdate(r['start']), end=pdate(r['end'])))
    return w


def wiki():
    w = {}
    for fn in ('wikipedia-2017-part1.psv', 'wikipedia-2017-part2.psv'):
        for r in rpsv(fn, ['dept', 'name', 'start', 'end', 'note']):
            if r['note'].startswith('acting'):
                continue
            w.setdefault(r['dept'], []).append(dict(name=r['name'], start=pdate(r['start']), end=pdate(r['end'])))
    return w


OFFICE_OF = {'state': 'Secretary of State', 'treasury': 'Secretary of the Treasury', 'defense': 'Secretary of Defense', 'justice': 'Attorney General',
             'interior': 'Secretary of the Interior', 'agriculture': 'Secretary of Agriculture', 'commerce': 'Secretary of Commerce',
             'labor': 'Secretary of Labor', 'hhs': 'Secretary of Health and Human Services', 'hud': 'Secretary of Housing and Urban Development',
             'dot': 'Secretary of Transportation', 'energy': 'Secretary of Energy', 'education': 'Secretary of Education',
             'va': 'Secretary of Veterans Affairs', 'dhs': 'Secretary of Homeland Security'}
# Facts from the department's own page about today's head, already shown on the executive page (checked Nov 6, 2026).
CURRENT_OFFICIAL = {
    'labor': dict(name='Keith Sonderling', start='2026-10-02', src='https://www.dol.gov/agencies/osec/keith-sonderling',
                  note='sworn in October 2, 2026, after Senate confirmation on September 30, 2026'),
}


def find(rows, name, start, tol=200):
    L = ALIAS.get(last(name), last(name))
    best = None
    for r in rows:
        if ALIAS.get(last(r['name']), last(r['name'])) != L:
            continue
        rs = r.get('start') or ''
        if start and rs:
            d = days(start, rs)
            if d <= tol and (best is None or d < best[0]):
                best = (d, r)
        elif start and r.get('ys'):
            if abs(int(start[:4]) - int(r['ys'])) <= 1 and (best is None or best[0] > 999):
                best = (999, r)
        elif best is None:
            best = (9999, r)
    return best[1] if best else None


ALIAS = {'coleman': 'colman'}
FULL = {'state', 'treasury', 'interior', 'commerce', 'hhs', 'energy'}
CORRECTIONS = {}  # none needed: departments without a dated official list take their dates from Wikipedia, checked against the dataset
DROP = {}


def merge_same(rows):
    """One row per tenure: join a person's overlapping or back-to-back rows in the same office."""
    out = []
    for r in rows:
        p = next((x for x in out if x['office'] == r['office'] and last(x['name']) == last(r['name']) and x['start'] and r['start']
                  and (r['start'] <= (x['end'] or '9999') or days(x['end'], r['start']) <= 3)
                  and r['start'] >= x['start']), None)
        if p:
            if not r['end'] or (p['end'] and r['end'] > p['end']):
                p['end'] = r['end']
            continue
        out.append(dict(r))
    return out


def admin_ranges(ch_all):
    a = {}
    for r in ch_all:
        if r['office'] == 'President':
            a.setdefault(r['admin'], []).append((r['start'], r['end'] or TODAY))
    return a


def build():
    ch_all = chamberlain_all()
    ranges = admin_ranges(ch_all)
    # admin check on the raw dataset rows
    bad = set()
    for r in ch_all:
        if r['office'] == 'President' or not r['start']:
            continue
        rg = ranges.get(r['admin'])
        if rg and not any(days(r['start'], s) <= 31 or (s <= r['start'] <= e) or days(r['start'], e) <= 31 for s, e in rg):
            bad.add((r['office'], r['name'], r['start']))
            log.append('dataset: %s, %s, start %s is outside the %s presidency' % (r['office'], r['name'], r['start'], r['admin']))
    ch = merge_same([r for r in ch_all if r['office'] != 'President'])
    off = official()
    wk = wiki()
    wf = wiki_full()
    heads = {}
    for key, offices in DEPTS:
        ds = [dict(r, src='dataset') for r in ch if r['office'] in offices]
        keep = []
        for r in ds:
            k = (key, last(r['name']).capitalize())
            if (key, r['name'].split()[-1]) in DROP or k in DROP:
                log.append('%s: dataset row %s %s left out: %s' % (key, r['name'], r['start'], DROP.get(k) or DROP.get((key, r['name'].split()[-1]))))
                continue
            for (ck, cn), fix in CORRECTIONS.items():
                if ck == key and last(r['name']) == cn.lower():
                    log.append('%s: %s corrected (%s -> %s): %s' % (key, r['name'], r['start'] + ' to ' + (r['end'] or 'open'),
                                                                     fix.get('start', r['start']) + ' to ' + fix.get('end', r['end'] or 'open'), fix['why']))
                    r.update({x: y for x, y in fix.items() if x in ('start', 'end')})
            keep.append(r)
        ds = keep
        wrows = [w for w in wk.get(key, [])]
        o = off.get(key)
        official_urls = []
        if key in FULL:
            orows, ourl, kind = o
            official_urls.append(ourl)
            rows = []
            for x in orows:
                office = x['office']
                if key == 'hhs' and x['start'] < HEW_TO_HHS:
                    office = 'Secretary of Health, Education, and Welfare'
                note = x.get('note', '') if x.get('note') not in ('extract', 'Commerce and Labor', 'month only') else ''
                if not x['start']:
                    m = find(ds, x['name'], '')
                    log.append('%s: %s official list gives month and year only; dataset dates %s to %s shown' % (key, x['name'], m['start'], m['end']))
                    rows.append(dict(office=office, name=x['name'], start=m['start'], end=m['end'], src='dataset', chk='od', note=''))
                    continue
                m = find(ds, x['name'], x['start'], tol=400)
                if x.get('note') == 'extract' and m:
                    for f in ('start', 'end'):
                        if x[f] and m[f] and days(x[f], m[f]) > 3:
                            log.append('%s: %s %s: official list (read through an extract) %s, dataset %s. Dataset shown, marked.' % (key, x['name'], f, x[f], m[f]))
                    rows.append(dict(office=office, name=x['name'], start=m['start'], end=m['end'] or x['end'], src='dataset', chk='od', note=''))
                    continue
                rows.append(dict(office=office, name=x['name'], start=x['start'], end=x['end'], src='official', chk='o' if x.get('note') != 'extract' else 'od', note=note))
                if not m:
                    log.append('%s: %s (official, from %s) is not in the dataset' % (key, x['name'], x['start']))
                else:
                    if m['start'] and days(m['start'], x['start']) > 7:
                        log.append('%s: %s start: official %s, dataset %s. Official shown.' % (key, x['name'], x['start'], m['start']))
                    if m['end'] and x['end'] and days(m['end'], x['end']) > 7:
                        log.append('%s: %s end: official %s, dataset %s. Official shown.' % (key, x['name'], x['end'], m['end']))
            for r in ds:
                if not find(orows, r['name'], r['start'], tol=400) and r['start'] < max(x['start'] for x in orows if x['start']):
                    log.append('%s: dataset row %s (from %s) is not on the official list, left out' % (key, r['name'], r['start']))
            lastoff = max(x['start'] for x in orows if x['start'])
            for w in wrows:
                m = find(rows, w['name'], w['start'], tol=60)
                if m:
                    if w['end'] and not m['end'] and m['start'] < '2025-01-01':
                        m['end'] = w['end']; m['chk'] = 'od'
                    if m['chk'] == 'od' and days(m['start'], w['start']) <= 3 and (not m['end'] or not w['end'] or days(m['end'], w['end']) <= 3):
                        m['agree'] = 1
                    for f in ('start', 'end'):
                        if m[f] and w[f] and days(m[f], w[f]) > 3:
                            log.append('%s: %s %s: official %s, Wikipedia %s. Official shown.' % (key, w['name'], f, m[f], w[f]))
                elif w['start'] > lastoff:
                    rows.append(dict(office=OFFICE_OF[key], name=w['name'], start=w['start'], end=w['end'], src='wikipedia', chk='n'))
        else:
            # No full official list with dates: Wikipedia's officeholder table gives the dates, checked against the
            # department's own names or years and against the Chamberlain dataset.
            if key == 'defense':
                base = [dict(w) for w in wf.get(key, []) if w['office'] == 'Secretary of War']
            else:
                base = [dict(w) for w in wf.get(key, [])]
            for w in (wk.get(key, []) if key != 'defense' else []):
                if w['start'] >= '2017-01-20' and not find(base, w['name'], w['start'], tol=60):
                    base.append(dict(w, office=OFFICE_OF[key]))
                elif w['start'] >= '2017-01-20':
                    b = find(base, w['name'], w['start'], tol=60)
                    if not b['end']:
                        b['end'] = w['end']
            rows = []
            for w in base:
                r = dict(office=w.get('office') or OFFICE_OF[key], name=w['name'], start=w['start'], end=w['end'], src='wikipedia', chk='n', note='')
                if key == 'defense' and (not r['end'] or r['end'] > WAR_END):
                    log.append('defense: %s, Secretary of War, end %s shown as %s, the day the first Secretary of Defense took office (DoD Key Officials)' % (r['name'], r['end'], WAR_END))
                    r['end'] = WAR_END
                d = find([x for x in ds if x['office'] == r['office'] or key not in ('defense', 'labor')], r['name'], r['start'], tol=400)
                if d and days(d['start'], r['start']) <= 7 and (not d['end'] or not r['end'] or days(d['end'], r['end']) <= 7):
                    r['agree'] = 1
                elif d:
                    log.append('%s: %s: Wikipedia %s to %s, dataset %s to %s. Wikipedia shown.' % (key, r['name'], r['start'], r['end'] or 'now', d['start'], d['end'] or 'open'))
                elif r['start'] < '2021':
                    log.append('%s: %s (Wikipedia, from %s) is not in the dataset' % (key, r['name'], r['start']))
                rows.append(r)
            for x in ds:
                if x['office'] in ('Secretary of Defense', 'Secretary of Commerce and Labor'):
                    continue
                if x['start'] < '2017' and not find(rows, x['name'], x['start'], tol=400):
                    log.append('%s: dataset row %s (%s, from %s) is not in the Wikipedia list, left out' % (key, x['name'], x['office'], x['start']))
            if key == 'defense':
                war = off['war'][0]
                official_urls += [off['war'][1], off['defense'][1]]
                for r in rows:
                    if any(last(x['name']) == last(r['name']) for x in war):
                        r['chk'] = 'od'
                    elif last(r['name']) == 'royall':
                        r['chk'] = 'od'; r['note'] = 'the last Secretary of War; the Army lists him as its first Secretary of the Army'
                    else:
                        log.append('defense: %s (Secretary of War) is not on the Army list' % r['name'])
                for x in off['defense'][0]:
                    rows.append(dict(office='Secretary of Defense', name=x['name'], start=x['start'], end=x['end'], src='official', chk='o', note=x.get('note', '')))
                for w in wk.get(key, []):
                    m = find(off['defense'][0], w['name'], w['start'], tol=60)
                    for f in ('start', 'end'):
                        if m and m[f] and w[f] and days(m[f], w[f]) > 3:
                            log.append('defense: %s %s: official %s, Wikipedia %s. Official shown.' % (w['name'], f, m[f], w[f]))
            elif o and o[2] in ('years', 'starts', 'extract'):
                orows, ourl, kind = o
                official_urls.append(ourl)
                for r in rows:
                    x = find(orows, r['name'], r['start'], tol=400)
                    if not x:
                        if kind != 'years' or r['start'][:4] >= orows[0]['ys']:
                            if r['start'] < '2021':
                                log.append('%s: %s (from %s) is not on the official list' % (key, r['name'], r['start']))
                        continue
                    r['chk'] = 'od'
                    if kind == 'years':
                        if x.get('ys') and abs(int(r['start'][:4]) - int(x['ys'])) > 1:
                            log.append('%s: %s start year: official %s, shown %s' % (key, r['name'], x['ys'], r['start'][:4]))
                        if x.get('ye') and r['end'] and abs(int(r['end'][:4]) - int(x['ye'])) > 1:
                            log.append('%s: %s end year: official %s, shown %s' % (key, r['name'], x['ye'], r['end'][:4]))
                    else:
                        for f in ('start', 'end'):
                            if x.get(f) and r[f] and days(x[f], r[f]) > 7:
                                log.append('%s: %s %s: official list %s%s, Wikipedia %s. Official shown.' % (
                                    key, r['name'], f, x[f], ' (read through an extract)' if kind == 'extract' else '', r[f]))
                                r[f] = x[f]
                        if 'confirmation' in x.get('note', ''):
                            r['note'] = 'the start shown is the date the Senate confirmed'
                        if x.get('start') and days(x['start'], r['start']) <= 7 and (kind == 'starts' or (x.get('end') and r['end'] and days(x['end'], r['end']) <= 7)):
                            r['agree'] = 1
                for x in orows:
                    if not find(rows, x['name'], x.get('start') or (x.get('ys', '') + '-07-01' if x.get('ys') else ''), tol=400):
                        log.append('%s: official %s (%s) is not in the Wikipedia list' % (key, x['name'], x.get('start') or x.get('ys')))
                if key == 'labor':
                    for x in off['commerce'][0]:
                        if x['office'] == 'Secretary of Commerce and Labor':
                            rows.append(dict(office=x['office'], name=x['name'], start=x['start'], end=x['end'], src='official', chk='o', note=''))
                    official_urls.append(off['commerce'][1])
            elif key in ('education', 'dhs'):
                official_urls.append(off[key][1])
                for r in rows:
                    if any(last(x['name']) == last(r['name']) for x in off[key][0]):
                        r['chk'] = 'od'

        if key == 'va':
            for r in rpsv('wikipedia-va-administrators.psv', ['name', 'start', 'end', 'note']):
                rows.append(dict(office='Administrator of Veterans Affairs', name=r['name'], start=pdate(r['start']), end=pdate(r['end']), src='wikipedia', chk='n'))
        if key in CURRENT_OFFICIAL:
            c = CURRENT_OFFICIAL[key]
            rows = [r for r in rows if last(r['name']) != last(c['name']) or r['start'] < '2026']
            rows.append(dict(office=OFFICE_OF[key], name=c['name'], start=c['start'], end='', src='official', chk='o', note=c['note']))
            official_urls.append(c['src'])
        if key == 'hhs':
            for r in rows:
                if r['start'] < HEW_TO_HHS:
                    r['office'] = 'Secretary of Health, Education, and Welfare'
        rows.sort(key=lambda r: (r['start'], r['end'] or '9999'))
        for a, b in zip(rows, rows[1:]):
            # an end that runs past the next head's start: take the dataset's end when it fits
            if a['office'] == b['office'] and a['end'] and b['start'] and a['end'] > b['start'] and days(a['end'], b['start']) > 3 and a['src'] == 'wikipedia':
                d = find(ds, a['name'], a['start'], tol=60)
                if d and d['end'] and d['end'] <= b['start']:
                    log.append('%s: %s end: Wikipedia %s runs past %s taking office on %s; dataset end %s shown' % (key, a['name'], a['end'], b['name'], b['start'], d['end']))
                    a['end'] = d['end']; a['agree'] = 0
        for a, b in zip(rows, rows[1:]):
            if a['office'] != b['office'] and key in ('labor', 'commerce', 'defense', 'va'):
                continue
            if a['end'] and b['start'] and a['end'] > b['start'] and days(a['end'], b['start']) > 3:
                log.append('%s: CHECK overlap %s (to %s) and %s (from %s)' % (key, a['name'], a['end'], b['name'], b['start']))
        opens = [r for r in rows if not r['end']]
        if len(opens) != 1 and not (key == 'justice' and not opens):  # today's attorney general is acting, so no open row
            log.append('%s: CHECK open-ended rows: %s' % (key, ', '.join(r['name'] for r in opens) or 'none'))
        for r in rows:
            r.setdefault('chk', 'n'); r.setdefault('note', ''); r.setdefault('agree', 0)
            if (r['office'], r['name'], r['start']) in bad:
                log.append('%s: CHECK %s start %s still outside its presidency' % (key, r['name'], r['start']))
        heads[key] = dict(rows=rows, official=official_urls)
    return heads


if __name__ == '__main__':
    import sys
    h = build()
    for k, v in h.items():
        for r in v['rows']:
            for f in ('admin', 'ys', 'ye', 'src_end'):
                r.pop(f, None)
    if '--dry' in sys.argv:
        print('\n'.join(log))
    else:
        json.dump(h, open(os.path.join(DATA, 'heads.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        open(os.path.join(DATA, 'check.txt'), 'w', encoding='utf-8').write('\n'.join(log) + '\n')
        print(len(log), 'notes')
