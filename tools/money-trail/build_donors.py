#!/usr/bin/env python3
"""Build the people who gave money to federal committees for the Money web (D272, Nov 2026).

    python3 -I tools/money-trail/build_donors.py BULK_DIR site [--main 1000000] [--search 25000]

BULK_DIR holds the FEC 2025-2026 bulk files that tools/money-trail/fec_bulk.py reads; this script uses indiv26.zip
(individual contributions, about 2.5 GB) and cm26.zip (committee names). Standard library only, no API key.

The same rule for every side and every party: a dollar line, nobody picked by hand.
  - People who gave at least --main dollars in all (default $1,000,000) go in site/money-trail/donors.js, which loads
    with the page: a dot for each person, a line to each committee the person gave to, and a Person tracker row.
  - People who gave at least --search dollars (default $25,000) and less than --main go in site/money-trail/donors/NN.json
    (64 small files) with a search list in donors/index.json. They load only when someone searches for a person or opens one.

What is counted: rows the FEC marks as a person (entity type IND), without memo lines (they repeat a gift already
counted), without the lines a conduit such as ActBlue or WinRed files when it passes a gift on (transaction type 24T;
the committee that got the gift lists it too), and without refunds (types starting with 2). Rows whose name is a group
(for example "..., NONFEDERAL ACCOUNT" or a trust) are left out. The file lists a person only once their gifts to one
committee pass $200 in the cycle, so smaller gifts are not here.

One person is often spelled more than one way ("YASS, JEFF" and "YASS, JEFF MR"). Spellings are put together only
when the last name, the first name and the state are the same, the middle initials do not differ, and the ZIP code or
the employer matches too. Two people with the same name in the same state stay apart unless one of those matches.

Privacy (52 U.S.C. 30111(a)(4), 11 CFR 104.15): what is published is the name, city, state, employer and occupation as
filed, the amounts, the dates and the filing links, the same facts fec.gov shows. ZIP codes are used only to match
spellings and are never written to the site files. Street addresses are not in the bulk file. There is no download of
the donor list.
"""
import argparse, collections, io, json, os, re, sys, time, zipfile, zlib

ap = argparse.ArgumentParser()
ap.add_argument('bulk')
ap.add_argument('site')
ap.add_argument('--main', type=float, default=1_000_000)
ap.add_argument('--search', type=float, default=25_000)
ap.add_argument('--shards', type=int, default=64)
ap.add_argument('--cap', type=int, default=25, help='most committees kept per person in the search files')
a = ap.parse_args()
BULK, SITE = a.bulk, a.site
OUT_MAIN = os.path.join(SITE, 'money-trail', 'donors.js')
OUT_DIR = os.path.join(SITE, 'money-trail', 'donors')
t0 = time.time()


def log(*x):
    print(f'[{time.time() - t0:6.0f}s]', *x, flush=True)


def d8(s):  # MMDDYYYY -> YYYY-MM-DD
    s = re.sub(r'\D', '', s or '')
    return s[4:8] + '-' + s[0:2] + '-' + s[2:4] if len(s) == 8 else ''


TITLES = {'MR', 'MRS', 'MS', 'MISS', 'DR', 'PROF', 'HON', 'REV', 'SIR', 'JR', 'SR', 'II', 'III', 'IV', 'V', 'ESQ',
          'MD', 'PHD', 'DDS', 'DMD', 'CPA', 'JD', 'DO', 'RN', 'MBA', 'RET', 'USA', 'USN', 'USMC', 'USAF'}
ORG = re.compile(r'\b(LLC|L L C|INC|CORP|CORPORATION|COMPANY|PAC|FUND|FUNDS|COMMITTEE|ACCOUNT|FOUNDATION|TRUST|TRUSTEE|'
                 r'TRUSTEES|PARTNERS|PARTNERSHIP|LP|LLP|ASSOCIATION|ASSOC|UNION|HOLDINGS|GROUP|BANK|PARTY|NONFEDERAL|'
                 r'ACTION|COUNCIL|CAMPAIGN|ESTATE|UNITEMIZED|ANONYMOUS|VARIOUS|TOTAL|CHURCH|SOCIETY|INSTITUTE|'
                 r'ENTERPRISES|VENTURES|CAPITAL|MANAGEMENT|PROPERTIES|INVESTMENTS|COALITION|AMERICA|AMERICANS)\b')
GENERIC_EMP = re.compile(r'^(|NONE|N ?A|RETIRED|SELF|SELF ?EMPLOYED|SELFEMPLOYED|NOT ?EMPLOYED|UNEMPLOYED|HOMEMAKER|'
                         r'STUDENT|INFORMATION REQUESTED.*|REQUESTED|BEST EFFORTS|REFUSED|UNKNOWN|OWNER|SELF EMPLOYED.*)$')


def clean(s):
    return re.sub(r'\s+', ' ', re.sub(r'[^A-Z, ]', ' ', s.upper().replace('.', ''))).strip(' ,')


def parse(raw):
    """(display name, last, first, middle initial) or None when the name is not a person's name."""
    n = clean(raw)
    if not n or ',' not in n or ORG.search(n):
        return None
    last, rest = n.split(',', 1)
    lw = [w for w in last.split() if w not in TITLES]
    rw = [w for w in rest.replace(',', ' ').split() if w not in TITLES]
    if not lw or not rw or len(lw) > 3 or len(rw) > 4:
        return None
    last, first = ' '.join(lw), rw[0]
    mid = rw[1][0] if len(rw) > 1 else ''
    return (last + ', ' + ' '.join(rw), last, first, mid)


def emp_key(e):
    e = re.sub(r'\s+', ' ', re.sub(r'[^A-Z ]', ' ', e.upper())).strip()
    e = re.sub(r'\b(INC|LLC|CORP|CORPORATION|CO|COMPANY|LTD|LP|LLP|THE)\b', '', e).strip()
    return '' if GENERIC_EMP.match(e) else re.sub(r'\s+', ' ', e)


def indiv_rows():
    with zipfile.ZipFile(os.path.join(BULK, 'indiv26.zip')) as z:
        with z.open('itcont.txt') as fh:
            for line in io.TextIOWrapper(fh, encoding='latin-1', newline=''):
                if '|IND|' not in line:
                    continue
                r = line.rstrip('\r\n').split('|')
                if len(r) < 21 or r[6] != 'IND' or r[18] == 'X' or r[5] == '24T' or r[5].startswith('2'):
                    continue
                yield r


# ---------- committees ----------
cm = {}
with zipfile.ZipFile(os.path.join(BULK, 'cm26.zip')) as z:
    for line in io.TextIOWrapper(z.open(z.namelist()[0]), encoding='latin-1'):
        r = line.rstrip('\r\n').split('|')
        if len(r) >= 11:
            cm[r[0]] = (r[1].strip(), r[9])
indiv_info = zipfile.ZipFile(os.path.join(BULK, 'indiv26.zip')).getinfo('itcont.txt')
file_date = '%04d-%02d-%02d' % indiv_info.date_time[:3]
log('committees', len(cm), 'indiv26 itcont.txt', indiv_info.file_size, 'bytes, dated', file_date)

# ---------- pass 1: money per spelling (name, state, ZIP, employer) ----------
var = {}  # (display, last, first, mid, st, zip5, emp) -> amount
parsed = {}
rows_n = skipped = 0
for r in indiv_rows():
    rows_n += 1
    raw = r[7]
    p = parsed.get(raw)
    if p is None:
        p = parsed[raw] = parse(raw) or False
    if not p:
        skipped += 1
        continue
    try:
        amt = float(r[14])
    except ValueError:
        continue
    k = (p[0], p[1], p[2], p[3], r[9].strip().upper()[:2], r[10][:5], emp_key(r[11]))
    var[k] = var.get(k, 0.0) + amt
    if rows_n % 5_000_000 == 0:
        log('pass 1 rows', rows_n, 'spellings', len(var))
log('pass 1 done: person rows', rows_n, 'left out as group names', skipped, 'spellings', len(var))
parsed = None

# ---------- put spellings together ----------
groups = collections.defaultdict(list)  # (last, first, st) -> [variant keys]
gsum = collections.Counter()
for k, v in var.items():
    g = (k[1], k[2], k[4])
    groups[g].append(k)
    gsum[g] += v
cluster_of = {}  # variant key -> cluster number
clusters = []  # cluster number -> list of variant keys


def find(par, x):
    while par[x] != x:
        par[x] = par[par[x]]
        x = par[x]
    return x


for g, ks in groups.items():
    if gsum[g] < a.search:
        continue  # even all spellings together stay under the line
    par = {k: k for k in ks}
    by_mid = collections.defaultdict(list)
    for k in ks:
        by_mid[k[3]].append(k)
    for mid, mk in by_mid.items():  # same middle initial (or none): same ZIP or same employer
        seen = {}
        for k in mk:
            for tag in (('z', k[5]) if k[5] else None, ('e', k[6]) if k[6] else None):
                if tag is None:
                    continue
                if tag in seen:
                    ra, rb = find(par, k), find(par, seen[tag])
                    if ra != rb:
                        par[ra] = rb
                else:
                    seen[tag] = k
    # a spelling with no middle initial joins a spelling with one only when exactly one such group shares its ZIP or employer
    roots = collections.defaultdict(list)
    for k in ks:
        roots[find(par, k)].append(k)
    with_mid = {rt: m for rt, m in roots.items() if m[0][3]}
    for rt, m in list(roots.items()):
        if m[0][3]:
            continue
        tags = {('z', k[5]) for k in m if k[5]} | {('e', k[6]) for k in m if k[6]}
        hits = [r2 for r2, m2 in with_mid.items() if tags & ({('z', k[5]) for k in m2 if k[5]} | {('e', k[6]) for k in m2 if k[6]})]
        if len(hits) == 1:
            par[find(par, rt)] = find(par, hits[0])
    roots = collections.defaultdict(list)
    for k in ks:
        roots[find(par, k)].append(k)
    for m in roots.values():
        if sum(var[k] for k in m) >= a.search:
            n = len(clusters)
            clusters.append(m)
            for k in m:
                cluster_of[k] = n
log('people over the search line', len(clusters))
var = None
groups = None

# ---------- pass 2: gifts per person, committee and year ----------
lines = collections.defaultdict(lambda: [0.0, 0, 0.0, '', '9999', ''])  # (cluster, cmte, year) -> amt, n, max, img, first, last
latest = {}  # cluster -> (date, city, employer, occupation)
spell = collections.defaultdict(collections.Counter)
parsed = {}
for r in indiv_rows():
    raw = r[7]
    p = parsed.get(raw)
    if p is None:
        p = parsed[raw] = parse(raw) or False
    if not p:
        continue
    k = (p[0], p[1], p[2], p[3], r[9].strip().upper()[:2], r[10][:5], emp_key(r[11]))
    c = cluster_of.get(k)
    if c is None:
        continue
    try:
        amt = float(r[14])
    except ValueError:
        continue
    day = d8(r[13])
    t = lines[(c, r[0], day[:4] or 'none')]
    t[0] += amt
    t[1] += 1
    if amt > t[2] and re.match(r'^\d{11,18}$', r[4]):
        t[2], t[3] = amt, r[4]
    if day and day < t[4]:
        t[4] = day
    if day > t[5]:
        t[5] = day
    if day >= latest.get(c, ('',))[0]:
        latest[c] = (day, r[8].strip().upper(), r[11].strip().upper(), r[12].strip().upper())
    spell[c][re.sub(r'\s+', ' ', raw.strip().upper())] += 1
log('pass 2 done: person, committee and year lines', len(lines))
parsed = None

# ---------- one record per person ----------
per = collections.defaultdict(list)
for (c, cid, yr), t in lines.items():
    per[c].append([cid, yr, round(t[0], 2), t[1], round(t[2], 2), t[3], t[4] if t[4] != '9999' else '', t[5]])
people = []
for c, ls in per.items():
    total = round(sum(x[2] for x in ls), 2)
    if total < a.search:
        continue
    m = clusters[c]
    disp = collections.Counter()
    for k in m:
        disp[k[0]] += 1
    name = max(m, key=lambda k: (disp[k[0]], k[0]))[0]
    st = m[0][4]
    day, city, emp, occ = latest.get(c, ('', '', '', ''))
    ls.sort(key=lambda x: (-x[2], x[0], x[1]))
    people.append({'name': name, 'st': st, 'city': city, 'emp': emp, 'occ': occ, 'total': total, 'gifts': sum(x[3] for x in ls),
                   'spell': [s for s, _ in spell[c].most_common(5)], 'lines': ls})
people.sort(key=lambda p: (-p['total'], p['name'], p['st']))

# Every dot needs its own name, because the web joins lines by name. A name that more than one person has (in any state)
# gets the state after it, then the city when two are in the same state, then a number.
by_name = collections.Counter(p['name'] for p in people)
by_name_st = collections.Counter((p['name'], p['st']) for p in people)
used = set()
for p in people:
    label = p['name']
    if by_name[p['name']] > 1:
        label = f"{p['name']} ({p['st'] or 'no state on the filing'})"
        if p['st'] and by_name_st[(p['name'], p['st'])] > 1:
            label = f"{p['name']} ({p['city'].title() + ', ' if p['city'] else ''}{p['st']})"
    base, n = label, 2
    while label in used:
        label, n = f'{base} {n}', n + 1
    used.add(label)
    p['label'] = label
    p['id'] = 'P' + format(zlib.crc32((label + '|' + p['st']).encode()) & 0xFFFFFFFF, '08x')
assert len({p['id'] for p in people}) == len(people), 'two people got the same ID'


def rec(p, cap=None):
    """One person. The page file keeps a line per committee and year with the filing of the largest gift. The search files keep
    one line per committee (the years added together, the largest committees first, at most --cap) and link to the FEC's own
    list of that person's gifts to that committee instead of one filing, so they stay small."""
    ls = p['lines']
    if cap is not None:
        by = {}
        for cid, yr, amt, n, big, img, first, last in ls:
            t = by.setdefault(cid, [cid, 'all', 0.0, 0, 0.0, '', '', ''])
            t[2] = round(t[2] + amt, 2)
            t[3] += n
            t[7] = max(t[7], last)
        ls = sorted(by.values(), key=lambda x: (-x[2], x[0]))[:cap]
    return [p['id'], p['label'], p['city'], p['st'], p['emp'], p['occ'], p['total'], p['gifts'], len({x[0] for x in p['lines']}),
            p['spell'], [x for x in ls]]


def ctable(recs):
    ids = sorted({x[0] for r in recs for x in r[10]})
    return {cid: list(cm.get(cid, ('FEC COMMITTEE ' + cid, ''))) for cid in ids}


meta = {'built': time.strftime('%Y-%m-%d'), 'file_date': file_date, 'main_line': a.main, 'search_line': a.search,
        'source': 'FEC bulk data file of individual contributions, 2025-2026 (indiv26.zip), file dated ' + file_date,
        'people_main': 0, 'people_search': 0}
main = [p for p in people if p['total'] >= a.main]
more = [p for p in people if p['total'] < a.main]
meta['people_main'], meta['people_search'] = len(main), len(more)
meta['dollars_main'] = round(sum(p['total'] for p in main), 2)
meta['v'] = format(zlib.crc32(json.dumps([meta['file_date'], len(main), len(more), meta['dollars_main']]).encode()) & 0xFFFFFFFF, '08x')
recs = [rec(p) for p in main]
D = {'meta': meta, 'c': ctable(recs), 'd': recs}
head = ('// People who gave money to federal committees, for the Money web (D272). Made by tools/money-trail/build_donors.py '
        'from the FEC individual contributions file; do not edit by hand.\n'
        '// Only people who gave $' + f'{a.main:,.0f}' + ' or more in all are in this file. People who gave $' + f'{a.search:,.0f}'
        + ' or more are in donors/, loaded on search. Name, city, state, employer and occupation as filed; ZIP codes are never kept.\n'
        '// Federal law bars using donor names from FEC filings to ask for money or for business (52 U.S.C. 30111(a)(4)).\n')
with open(OUT_MAIN, 'w', encoding='utf-8', newline='\n') as f:
    f.write(head + 'window.TW_DONORS=' + json.dumps(D, separators=(',', ':'), ensure_ascii=False) + ';\n')
log('donors.js', len(main), 'people', sum(len(r[10]) for r in recs), 'lines', os.path.getsize(OUT_MAIN), 'bytes')

os.makedirs(OUT_DIR, exist_ok=True)
for fn in os.listdir(OUT_DIR):
    if re.match(r'^\d{2,3}\.json$|^index\.json$', fn):
        os.remove(os.path.join(OUT_DIR, fn))
shards = collections.defaultdict(list)
for p in more:
    shards[zlib.crc32(p['id'].encode()) % a.shards].append(rec(p, a.cap))
size = 0
for n in range(a.shards):
    rs = shards.get(n, [])
    fn = os.path.join(OUT_DIR, f'{n:02d}.json')
    with open(fn, 'w', encoding='utf-8', newline='\n') as f:
        json.dump({'c': ctable(rs), 'd': rs}, f, separators=(',', ':'), ensure_ascii=False)
    size += os.path.getsize(fn)
idx = {'v': meta['v'], 'built': meta['built'], 'file_date': file_date, 'shards': a.shards, 'search_line': a.search, 'main_line': a.main,
       'columns': ['id', 'name', 'city', 'state', 'total', 'committees'],
       'd': [[p['id'], p['label'], p['city'], p['st'], round(p['total']), len({x[0] for x in p['lines']})] for p in more]}
fi = os.path.join(OUT_DIR, 'index.json')
with open(fi, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(idx, f, separators=(',', ':'), ensure_ascii=False)
log('donors/', len(more), 'people in', a.shards, 'files', size, 'bytes; index', os.path.getsize(fi), 'bytes')
# the page asks for the new file when it changes (the same way add_fec_batch.py stamps fec-data.js)
ix = os.path.join(SITE, 'money-trail', 'index.html')
if os.path.exists(ix):
    h = open(ix, encoding='utf-8').read()
    h2 = re.sub(r'donors\.js\?v=[^"]*', 'donors.js?v=' + meta['v'], h)
    if h2 != h:
        open(ix, 'w', encoding='utf-8', newline='\n').write(h2)
print('people:', len(main), 'on the page,', len(more), 'on search; v', meta['v'])
