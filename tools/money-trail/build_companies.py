#!/usr/bin/env python3
"""Build the Company tracker (site/money-trail/companies.js), Nov 2026.

    python3 -I tools/money-trail/build_companies.py BULK_DIR SUMMARY_JSON site

BULK_DIR holds the FEC 2025-2026 bulk files (the same folder tools/money-trail/fec_bulk.py uses): cm26.zip, cn26.zip,
webk26.zip, pas226.zip, oth26.zip and indiv26.zip. SUMMARY_JSON is written by
tools/money-trail/summarize_company_records.py from the files tools/money-trail/fetch_company_records.py downloads:
the public lobbying reports (lda.gov) and federal spending records (api.usaspending.gov). Those two hosts are blocked
from the cloud, so the two fetch scripts run on a home computer. Standard library only, no API key. The FEC part takes
about 2 minutes (indiv26 is big).

How the companies are picked (one rule for every company, no side picked by hand):
  11 sectors, and in each one the 3 companies whose own political action committees (PACs) raised the most money in
  the 2025-2026 cycle, from the FEC committee totals file (webk26). A company with more than one PAC is counted once,
  with all its PACs added together. Only PACs the FEC lists with a company as the connected organization count.
  Company PACs that fit none of the 11 sectors (an accounting firm, a law firm, a senior care supplier) are left for
  a later phase and named in the page note.

What each company shows, every figure with a link to the filing or record:
  1. Its PAC money (FEC): what the PAC raised, and what it gave to candidates and other committees, split by the party
     of the candidate or committee the FEC lists, with the largest recipients.
  2. Gifts from people who list the company as their employer (FEC individual contributions file). These are the
     people's own gifts, not the company's. Names are never shown (52 U.S.C. 30111(a)(4)); only totals and the
     committees that got the money.
  3. Lobbying (LD-2 reports under the Lobbying Disclosure Act): money it spent lobbying with its own staff and fees it
     paid to outside lobbying firms, the issues it listed and the bill numbers the reports name.
  4. Federal money (USAspending): contracts, grants and other awards in fiscal years 2025 and 2026, by agency.
"""
import collections, datetime, io, json, os, re, sys, urllib.parse, zipfile

BULK, SUMMARY, SITE = sys.argv[1:4]
OUT = os.path.join(SITE, 'money-trail', 'companies.js')

SECTORS = ['Defense and aerospace', 'Health insurance', 'Drugs and medical products', 'Telecom and cable',
           'Tech and internet', 'Oil, gas and refining', 'Electric utilities', 'Retail', 'Banks, finance and insurance',
           'Transport and delivery', 'Manufacturing']

# slug: name, sector, PAC name/connected org pattern, employer pattern (employer box starts with the company's own name or a
# short form of it; subsidiaries with other names are not counted), LDA client pattern, USAspending recipient name pattern
C = [
    ('boeing', 'The Boeing Company', 0, r'\bBOEING\b', r'^(THE )?BOEING\b', r'^(THE )?BOEING\b', r'^(THE )?BOEING\b'),
    ('lockheed-martin', 'Lockheed Martin', 0, r'LOCKHEED', r'^LOCKHEED', r'^LOCKHEED MARTIN', r'^LOCKHEED MARTIN'),
    ('spacex', 'SpaceX (Space Exploration Technologies Corp.)', 0, r'SPACE EXPLORATION TECH', r'^(SPACEX|SPACE X\b|SPACE EXPLORATION)', r'^(SPACE EXPLORATION|SPACEX)', r'^SPACE EXPLORATION'),
    ('unitedhealth-group', 'UnitedHealth Group', 1, r'UNITEDHEALTH', r'^(UNITEDHEALTH|UNITED HEALTH ?GROUP|UNITED HEALTHCARE)', r'^(UNITEDHEALTH|UNITED HEALTH)', r'^(UNITEDHEALTH|UNITED HEALTH)'),
    ('elevance-health', 'Elevance Health', 1, r'ELEVANCE', r'^(ELEVANCE|ANTHEM( INC|,|$))', r'^(ELEVANCE|ANTHEM, INC)', r'^(ELEVANCE|ANTHEM)'),
    ('cigna', 'The Cigna Group', 1, r'CIGNA', r'^(THE )?CIGNA', r'^(THE )?CIGNA', r'CIGNA'),
    ('eli-lilly', 'Eli Lilly and Company', 2, r'ELI LILLY', r'^(ELI LILLY|LILLY USA|LILLY$)', r'^ELI LILLY', r'^(ELI LILLY|LILLY USA)'),
    ('abbott', 'Abbott Laboratories', 2, r'ABBOTT LABORATORIES', r'^ABBOTT( LAB|$)', r'^ABBOTT LAB', r'^ABBOTT'),
    ('pfizer', 'Pfizer', 2, r'PFIZER', r'^PFIZER', r'^PFIZER', r'^PFIZER'),
    ('comcast', 'Comcast (with NBCUniversal)', 3, r'COMCAST', r'^(COMCAST|NBCUNIVERSAL|NBC UNIVERSAL)', r'^(COMCAST|NBCUNIVERSAL)', r'^(COMCAST|NBCUNIVERSAL)'),
    ('charter-communications', 'Charter Communications', 3, r'CHARTER COMMUNICATIONS', r'^CHARTER COMMUNICATIONS', r'^CHARTER COMMUNICATIONS', r'^CHARTER COMMUNICATIONS'),
    ('att', 'AT&T', 3, r'^AT&T', r'^(AT&T|AT & T|AT&AMP;T)', r'^(AT&T|AT & T)', r'^(AT&T|AT & T)'),
    ('google', 'Google (Alphabet)', 4, r'GOOGLE', r'^(GOOGLE|ALPHABET)', r'^(GOOGLE|ALPHABET)', r'^(GOOGLE|ALPHABET)'),
    ('amazon', 'Amazon', 4, r'AMAZON', r'^AMAZON', r'^AMAZON', r'^AMAZON'),
    ('microsoft', 'Microsoft', 4, r'MICROSOFT', r'^MICROSOFT', r'^MICROSOFT', r'^MICROSOFT'),
    ('valero', 'Valero Energy', 5, r'VALERO', r'^VALERO', r'^VALERO', r'^VALERO'),
    ('phillips-66', 'Phillips 66', 5, r'PHILLIPS 66', r'^PHILLIPS 66', r'^PHILLIPS 66', r'^PHILLIPS 66'),
    ('chevron', 'Chevron', 5, r'CHEVRON', r'^CHEVRON', r'^CHEVRON', r'^CHEVRON'),
    ('nextera-energy', 'NextEra Energy', 6, r'NEXTERA', r'^NEXTERA', r'^NEXTERA', r'^NEXTERA'),
    ('entergy', 'Entergy', 6, r'ENTERGY', r'^ENTERGY', r'^ENTERGY', r'^ENTERGY'),
    ('duke-energy', 'Duke Energy', 6, r'DUKE ENERGY', r'^DUKE ENERGY', r'^DUKE ENERGY', r'^DUKE ENERGY'),
    ('home-depot', 'The Home Depot', 7, r'HOME DEPOT', r'^(THE )?HOME DEPOT', r'^(THE )?HOME DEPOT', r'^(THE )?HOME DEPOT'),
    ('walmart', 'Walmart', 7, r'WALMART|WAL-MART', r'^(WALMART|WAL-MART|WAL MART)', r'^(WALMART|WAL-MART)', r'^(WALMART|WAL-MART|WAL MART)'),
    ('lowes', "Lowe's Companies", 7, r"LOWE'S COMPANIES", r"^LOWE'?S( COMPANIES| HOME|$)", r"^LOWE'?S", r"^LOWE'?S"),
    ('jpmorgan-chase', 'JPMorgan Chase', 8, r'JPMORGAN', r'^(JPMORGAN|JP MORGAN|J\.? ?P\.? MORGAN)', r'^(JPMORGAN|JP MORGAN|J\.P\. MORGAN)', r'^(JPMORGAN|JP MORGAN|J\.P\. MORGAN)'),
    ('ubs', 'UBS Americas', 8, r'\bUBS\b', r'^UBS\b', r'^UBS\b', r'^UBS\b'),
    ('aflac', 'Aflac', 8, r'AFLAC', r'^AFLAC', r'^AFLAC', r'^AFLAC'),
    ('ups', 'UPS (United Parcel Service)', 9, r'UNITED PARCEL SERVICE', r'^(UPS$|UPS INC|UNITED PARCEL)', r'^(UNITED PARCEL|UPS\b)', r'^(UNITED PARCEL|UPS\b)'),
    ('enterprise-holdings', 'Enterprise Holdings (Enterprise Mobility)', 9, r'ENTERPRISE HOLDINGS', r'^(ENTERPRISE HOLDINGS|ENTERPRISE RENT|ENTERPRISE MOBILITY)', r'^(ENTERPRISE HOLDINGS|ENTERPRISE MOBILITY|ENTERPRISE RENT)', r'^(ENTERPRISE HOLDINGS|ENTERPRISE RENT|ENTERPRISE MOBILITY)'),
    ('union-pacific', 'Union Pacific', 9, r'UNION PACIFIC CORP', r'^UNION PACIFIC', r'^UNION PACIFIC', r'^UNION PACIFIC'),
    ('honeywell', 'Honeywell', 10, r'HONEYWELL', r'^HONEYWELL', r'^HONEYWELL', r'^HONEYWELL'),
    ('koch', 'Koch, Inc. (Koch Industries)', 10, r'^KOCH, INC|KOCHPAC', r'^KOCH( INDUSTRIES| INC| COMPANIES|,|$)', r'^KOCH( INDUSTRIES| INC| COMPANIES|,)', r'^KOCH( INDUSTRIES| INC|,)'),
    ('general-motors', 'General Motors', 10, r'GENERAL MOTORS', r'^(GENERAL MOTORS|GM LLC|GM$)', r'^GENERAL MOTORS', r'^(GENERAL MOTORS|GM GLOBAL)'),
]
# Picked out by the rule above but in none of the 11 sectors (the largest such PACs), named in the page note.
NOT_IN_SECTORS = ['Direct Supply (senior care supplies)', 'PricewaterhouseCoopers (accounting)', 'McGuireWoods (law firm)',
                  'HNTB (engineering)']


def rows(name, member=None, skip=None):
    with zipfile.ZipFile(os.path.join(BULK, name)) as z:
        m = member or z.namelist()[0]
        for ln in io.TextIOWrapper(z.open(m), encoding='latin-1', newline=''):
            if skip and skip(ln):
                continue
            yield ln.rstrip('\r\n').split('|')


def money(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return 0.0


def d8(s):
    s = re.sub(r'\D', '', s or '')
    return s[4:8] + '-' + s[0:2] + '-' + s[2:4] if len(s) == 8 else ''


def img(i):
    return f'https://docquery.fec.gov/cgi-bin/fecimg/?{i}' if re.match(r'^\d{11,18}$', i or '') else ''


def bulk_date(name):
    return datetime.datetime.fromtimestamp(os.path.getmtime(os.path.join(BULK, name)), datetime.timezone.utc).strftime('%Y-%m-%d')


print('committees and candidates', flush=True)
cm = {r[0]: {'name': r[1], 'des': r[8], 'type': r[9], 'party': r[10], 'org': r[12], 'conn': r[13], 'cand': r[14] if len(r) > 14 else ''}
      for r in rows('cm26.zip') if len(r) >= 14}
cn = {r[0]: {'name': r[1], 'party': r[2], 'office': r[5], 'state': r[4], 'district': r[6]} for r in rows('cn26.zip') if len(r) >= 10}
wk = {r[0]: r for r in rows('webk26.zip') if len(r) >= 27}

# ---------- 1. company PACs ----------
pacs, pac_of = {}, {}
for slug, name, sec, pac_pat, *_ in C:
    ids = [c for c, x in cm.items() if x['type'] in ('Q', 'N') and x['org'] == 'C' and x['des'] in ('B', 'U')
           and (re.search(pac_pat, x['conn']) or re.search(pac_pat, x['name'])) and c in wk and money(wk[c][5]) > 0]
    pacs[slug] = sorted(ids, key=lambda c: -money(wk[c][5]))
    for c in ids:
        pac_of[c] = slug
    print(' ', slug, [(c, cm[c]['name'][:50], money(wk[c][5])) for c in pacs[slug]], flush=True)

# party of a recipient: the candidate's party, else the committee's own listed party, else the candidate tied to the committee
PARTY = {'REP': 'Republican', 'DEM': 'Democratic'}


def side(cmte, cand=''):
    p = (cn.get(cand) or {}).get('party') or (cm.get(cmte) or {}).get('party') or (cn.get((cm.get(cmte) or {}).get('cand', '')) or {}).get('party', '')
    return 'REP' if p in ('REP', 'R') else 'DEM' if p in ('DEM', 'D', 'DFL') else 'other'


def kind_of(cmte, cand=''):
    x = cm.get(cmte) or {}
    if cand or x.get('type') in ('H', 'S', 'P'):
        return 'candidates'
    if x.get('type') in ('X', 'Y', 'Z'):
        return 'party committees'
    if x.get('des') == 'D':
        return 'leadership PACs'
    return 'other PACs and committees'


gifts = collections.defaultdict(dict)  # slug -> sub_id -> gift
print('pas226 (gifts to candidates)', flush=True)
for r in rows('pas226.zip'):
    if len(r) < 22 or r[0] not in pac_of or r[19] == 'X' or r[5] not in ('24K', '24Z'):
        continue
    rid = r[15] if re.match(r'^C\d{8}$', r[15]) else ''
    gifts[pac_of[r[0]]][r[21]] = {'pac': r[0], 'to': rid, 'to_name': r[7], 'cand': r[16], 'amt': money(r[14]), 'date': d8(r[13]), 'img': r[4], 'file': r[18], 'src': 'pas226'}
print('oth26 (gifts to committees)', flush=True)
for r in rows('oth26.zip', skip=lambda ln: '|IND|' in ln):
    if len(r) < 21 or r[0] not in pac_of or r[18] == 'X' or r[5] not in ('24K', '24Z'):
        continue
    g = gifts[pac_of[r[0]]]
    if r[20] in g:
        continue
    rid = r[15] if re.match(r'^C\d{8}$', r[15]) else ''
    g[r[20]] = {'pac': r[0], 'to': rid, 'to_name': r[7], 'cand': (cm.get(rid) or {}).get('cand', '') if (cm.get(rid) or {}).get('type') in ('H', 'S', 'P') else '',
                'amt': money(r[14]), 'date': d8(r[13]), 'img': r[4], 'file': r[17], 'src': 'oth26'}


def label_cmte(cid, fallback):
    x = cm.get(cid) or {}
    return x.get('name') or fallback


def cand_text(cand):
    c = cn.get(cand)
    if not c:
        return ''
    off = {'H': 'House', 'S': 'Senate', 'P': 'President'}.get(c['office'], '')
    where = c['state'] + ('-' + c['district'] if c['office'] == 'H' and c['district'] not in ('', '00') else '')
    return f"{c['name']} ({(c['party'] or '?')[:1]}, {off}, {where})".replace('(R', '(R').strip()


pac_out = {}
for slug, *_ in C:
    ids = pacs[slug]
    G = list(gifts[slug].values())
    by = collections.defaultdict(lambda: {'amt': 0.0, 'n': 0, 'big': None, 'first': '', 'last': ''})
    split = collections.Counter(); kinds = collections.Counter()
    for g in G:
        key = g['to'] or ('name:' + g['to_name'])
        b = by[key]; b['amt'] += g['amt']; b['n'] += 1
        b['first'] = min(b['first'] or g['date'], g['date']); b['last'] = max(b['last'], g['date'])
        if not b['big'] or g['amt'] > b['big']['amt']:
            b['big'] = g
        b['cand'] = b.get('cand') or g['cand']
        split[side(g['to'], g['cand'])] += g['amt']; kinds[kind_of(g['to'], g['cand'])] += g['amt']
    top = []
    for key, b in sorted(by.items(), key=lambda kv: -kv[1]['amt']):
        cid = key if not key.startswith('name:') else ''
        top.append({'cmte': cid, 'name': label_cmte(cid, b['big']['to_name'] or key[5:]), 'cand': cand_text(b.get('cand', '')), 'party': side(cid, b.get('cand', '')),
                    'kind': kind_of(cid, b.get('cand', '')), 'amt': round(b['amt'], 2), 'n': b['n'], 'first': b['first'], 'last': b['last'],
                    'link': img(b['big']['img']), 'file': b['big']['file'], 'pac': b['big']['pac']})
    comm = []
    for c in ids:
        w = wk[c]
        comm.append({'id': c, 'name': cm[c]['name'], 'receipts': money(w[5]), 'from_people': money(w[7]), 'spent': money(w[12]),
                     'gave_reported': money(w[22]), 'cash': money(w[19]), 'through': d8(w[26]) if re.match(r'^\d{2}/\d{2}/\d{4}$', w[26]) is None else
                     w[26][6:10] + '-' + w[26][0:2] + '-' + w[26][3:5]})
    pac_out[slug] = {'committees': comm, 'receipts': round(sum(x['receipts'] for x in comm), 2),
                     'gave': round(sum(g['amt'] for g in G), 2), 'gifts': len(G), 'recipients': len(by),
                     'to_rep': round(split['REP'], 2), 'to_dem': round(split['DEM'], 2), 'to_other': round(split['other'], 2),
                     'kinds': {k: round(v, 2) for k, v in kinds.most_common()}, 'top': top[:12], 'all_top': top[:40]}

# ---------- 2. people who list the company as employer ----------
print('indiv26 (people who list the company as employer), about 4 minutes', flush=True)
emp_re = [(slug, re.compile(pat)) for slug, n, s, p, pat, *_ in C]
emp = {slug: {'amt': 0.0, 'n': 0, 'people': set(), 'by': collections.Counter(), 'byn': collections.Counter(), 'person': collections.Counter(), 'names': collections.Counter(), 'last': ''} for slug, *_ in C}
EMP_HINT = re.compile(r'BOEING|LOCKHEED|SPACE|UNITED ?HEALTH|ELEVANCE|ANTHEM|CIGNA|LILLY|ABBOTT|PFIZER|COMCAST|NBC|CHARTER|AT ?& ?T|AT&AMP|GOOGLE|ALPHABET|AMAZON|MICROSOFT|VALERO|PHILLIPS|CHEVRON|NEXTERA|ENTERGY|DUKE|HOME DEPOT|WAL|LOWE|MORGAN|UBS|AFLAC|UPS|UNITED PARCEL|ENTERPRISE|UNION PACIFIC|HONEYWELL|KOCH|GENERAL MOTORS|GM')
for r in rows('indiv26.zip', member='itcont.txt'):
    if len(r) < 21:
        continue
    e = r[11].strip().upper()
    if not e or not EMP_HINT.search(e) or r[6] != 'IND' or r[18] == 'X' or r[5] == '24T' or r[5].startswith('2'):
        continue
    for slug, rx in emp_re:
        if rx.search(e):
            x = emp[slug]; a = money(r[14])
            x['amt'] += a; x['n'] += 1; x['people'].add((r[7], r[10][:5])); x['by'][r[0]] += a; x['byn'][r[0]] += 1
            x['person'][(r[7], r[10][:5])] += a; x['names'][r[7]] += a; x['last'] = max(x['last'], d8(r[13]))
            break
emp_out = {}
for slug, name, sec, pac_pat, emp_pat, *_ in C:
    x = emp[slug]
    split = collections.Counter(); own = 0.0
    for cid, a in x['by'].items():
        if cid in pacs[slug]:
            own += a
        else:
            split[side(cid)] += a
    top = [{'cmte': cid, 'name': label_cmte(cid, cid), 'party': side(cid), 'kind': 'this company’s own PAC' if cid in pacs[slug] else kind_of(cid),
            'amt': round(a, 2), 'n': x['byn'][cid]} for cid, a in x['by'].most_common(10)]
    big = x['person'].most_common(1)
    big_name = x['names'].most_common(1)
    emp_out[slug] = {'pattern': emp_pat, 'amt': round(x['amt'], 2), 'gifts': x['n'], 'people': len(x['people']), 'own_pac': round(own, 2),
                     'to_rep': round(split['REP'], 2), 'to_dem': round(split['DEM'], 2), 'to_other': round(split['other'], 2), 'top': top,
                     'largest_person': round(big[0][1], 2) if big else 0, 'largest_is_musk': bool(big_name and big_name[0][0].startswith('MUSK, ELON')),
                     'newest': x['last']}
    print(' ', slug, emp_out[slug]['amt'], emp_out[slug]['people'], flush=True)


# ---------- 3 and 4: lobbying and federal money (summary made on a home computer) ----------
S = json.load(open(SUMMARY, encoding='utf-8'))
MEDIA = {'comcast': ('comcast-nbcu', 'COMCAST CORPORATION'), 'charter-communications': ('charter-spectrum', 'CHARTER COMMUNICATIONS, INC.')}
QWORD = {'1': 'the first quarter', '2': 'the second quarter', '3': 'the third quarter', '4': 'the fourth quarter'}
y, q = S['lobby_through'].split(' Q')

# The employer pattern in plain words, for the page (same order as the patterns above)
EMP_WORDS = {'boeing': ['BOEING', 'THE BOEING'], 'lockheed-martin': ['LOCKHEED'], 'spacex': ['SPACEX', 'SPACE X', 'SPACE EXPLORATION'],
             'unitedhealth-group': ['UNITEDHEALTH', 'UNITED HEALTH GROUP', 'UNITED HEALTHCARE'], 'elevance-health': ['ELEVANCE', 'ANTHEM INC'],
             'cigna': ['CIGNA', 'THE CIGNA'], 'eli-lilly': ['ELI LILLY', 'LILLY USA', 'LILLY (alone)'], 'abbott': ['ABBOTT LAB', 'ABBOTT (alone)'],
             'pfizer': ['PFIZER'], 'comcast': ['COMCAST', 'NBCUNIVERSAL', 'NBC UNIVERSAL'], 'charter-communications': ['CHARTER COMMUNICATIONS'],
             'att': ['AT&T', 'AT & T'], 'google': ['GOOGLE', 'ALPHABET'], 'amazon': ['AMAZON'], 'microsoft': ['MICROSOFT'], 'valero': ['VALERO'],
             'phillips-66': ['PHILLIPS 66'], 'chevron': ['CHEVRON'], 'nextera-energy': ['NEXTERA'], 'entergy': ['ENTERGY'], 'duke-energy': ['DUKE ENERGY'],
             'home-depot': ['HOME DEPOT', 'THE HOME DEPOT'], 'walmart': ['WALMART', 'WAL-MART', 'WAL MART'], 'lowes': ["LOWE'S COMPANIES", "LOWE'S HOME", "LOWE'S (alone)"],
             'jpmorgan-chase': ['JPMORGAN', 'JP MORGAN', 'J.P. MORGAN'], 'ubs': ['UBS'], 'aflac': ['AFLAC'], 'ups': ['UPS (alone)', 'UPS INC', 'UNITED PARCEL'],
             'enterprise-holdings': ['ENTERPRISE HOLDINGS', 'ENTERPRISE RENT', 'ENTERPRISE MOBILITY'], 'union-pacific': ['UNION PACIFIC'], 'honeywell': ['HONEYWELL'],
             'koch': ['KOCH INDUSTRIES', 'KOCH INC', 'KOCH COMPANIES', 'KOCH (alone)'], 'general-motors': ['GENERAL MOTORS', 'GM LLC', 'GM (alone)']}

companies = []
for slug, name, sec, pac_pat, emp_pat, *_ in C:
    e = emp_out[slug]
    ws = EMP_WORDS[slug]
    e['search_url'] = 'https://www.fec.gov/data/receipts/individual-contributions/?two_year_transaction_period=2026&contributor_employer=' + urllib.parse.quote(ws[0].replace(' (alone)', ''))
    e['pattern'] = 'starts with ' + ' or '.join('“' + w + '”' for w in ws)
    x = S['companies'].get(slug) or {}
    L, F = x.get('lobby'), x.get('fed')
    if L:
        L['search_url'] = L.get('in_house_link') or ((L.get('firms') or [{}])[0].get('link') or '')
        L.pop('clients', None)
    mid, mhub = MEDIA.get(slug, (None, None))
    p = dict(pac_out[slug]); p.pop('all_top', None)
    companies.append({'slug': slug, 'name': name, 'sector': SECTORS[sec], 'hub': mhub or name + ' (company)', 'media_id': mid,
                      'pac': p, 'emp': e, 'lobby': L, 'fed': F})
meta = {'built': datetime.date.today().isoformat(), 'sectors': SECTORS, 'not_in_sectors': NOT_IN_SECTORS, 'fy': 2026,
        'lobby_through': QWORD[q] + ' of ' + y, 'lda_fetched': S.get('lda_fetched'),
        'fec_files': {f: bulk_date(f) for f in ['cm26.zip', 'webk26.zip', 'pas226.zip', 'oth26.zip', 'indiv26.zip']},
        'rule_text': 'How these companies were picked: 11 sectors, and in each one the 3 companies whose own PACs raised the most money in 2025-2026, from the FEC committee totals file (' + bulk_date('webk26.zip') + '). A company with more than one PAC is counted once, all its PACs added together. The same rule for every company; no side was picked by hand. Large company PACs that fit none of the 11 sectors, such as ' + ', '.join(NOT_IN_SECTORS) + ', are left for a later phase. Sources: FEC bulk data files; lobbying reports (LD-2) from lda.gov, pulled ' + str(S.get('lda_fetched')) + '; federal awards from USAspending.gov. Lobbying and federal money are added as reported; contracts can include work done by companies under the parent company.'}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
body = json.dumps({'meta': meta, 'companies': companies}, ensure_ascii=False, separators=(',', ':'))
with open(OUT, 'w', encoding='utf-8') as fh:
    fh.write('// Company tracker data. Made by tools/money-trail/build_companies.py from FEC bulk files, LD-2 lobbying reports (lda.gov)\n'
             '// and USAspending records; do not edit by hand. People who gave are never named here.\n')
    fh.write('window.TW_COMPANIES=' + body + ';\n')
print('wrote', OUT, os.path.getsize(OUT), 'bytes,', len(companies), 'companies', flush=True)
