"""Company tracker: boil the raw lobbying (lda.gov) and federal spending (USAspending) files down to what the site shows.
    py -3 summarize_company_records.py raw summary.json
Then, on a computer with the FEC bulk files:  python3 -I tools/money-trail/build_companies.py BULK_DIR summary.json site
Standard library only. Reads raw/lda_<slug>.json and raw/usa_<slug>.json, writes one small JSON file."""
import collections, datetime, json, os, re, sys
RAW, OUT = sys.argv[1], sys.argv[2]
# slug: (LDA client name pattern, client names to leave out, USAspending recipient name pattern)
C = {
 'boeing': (r'^(THE )?BOEING\b', r'CREDIT UNION|EMPLOYEES', r'^(THE )?BOEING\b'),
 'lockheed-martin': (r'^LOCKHEED MARTIN', r'', r'^LOCKHEED MARTIN'),
 'spacex': (r'^(SPACE EXPLORATION|SPACEX)', r'', r'^SPACE EXPLORATION'),
 'unitedhealth-group': (r'^(UNITEDHEALTH|UNITED HEALTH)', r'', r'^(UNITEDHEALTH|UNITED HEALTH)'),
 'elevance-health': (r'^(ELEVANCE|ANTHEM, INC)', r'', r'^(ELEVANCE|ANTHEM)'),
 'cigna': (r'^(THE )?CIGNA', r'', r'CIGNA'),
 'eli-lilly': (r'^ELI LILLY', r'', r'^(ELI LILLY|LILLY USA)'),
 'abbott': (r'^ABBOTT LAB', r'', r'^ABBOTT'),
 'pfizer': (r'^PFIZER', r'', r'^PFIZER'),
 'comcast': (r'^(COMCAST|NBCUNIVERSAL)', r'', r'^(COMCAST|NBCUNIVERSAL)'),
 'charter-communications': (r'^CHARTER COMMUNICATIONS', r'', r'^CHARTER COMMUNICATIONS'),
 'att': (r'^(AT&T|AT & T)', r'', r'^(AT&T|AT & T)'),
 'google': (r'^(GOOGLE|ALPHABET)', r'', r'^(GOOGLE|ALPHABET)'),
 'amazon': (r'^AMAZON', r'', r'^AMAZON'),
 'microsoft': (r'^MICROSOFT', r'', r'^MICROSOFT'),
 'valero': (r'^VALERO', r'', r'^VALERO'),
 'phillips-66': (r'^PHILLIPS 66', r'', r'^PHILLIPS 66'),
 'chevron': (r'^CHEVRON', r'', r'^CHEVRON'),
 'nextera-energy': (r'^(NEXTERA|FLORIDA POWER (&|AND) LIGHT)', r'', r'^NEXTERA'),
 'entergy': (r'^ENTERGY', r'', r'^ENTERGY'),
 'duke-energy': (r'^DUKE ENERGY', r'', r'^DUKE ENERGY'),
 'home-depot': (r'^(THE )?HOME DEPOT', r'', r'^(THE )?HOME DEPOT'),
 'walmart': (r'^(WALMART|WAL-MART)', r'', r'^(WALMART|WAL-MART|WAL MART)'),
 'lowes': (r"^LOWE'?S", r'', r"^LOWE'?S"),
 'jpmorgan-chase': (r'^(JPMORGAN|JP MORGAN|J\.P\. MORGAN)', r'', r'^(JPMORGAN|JP MORGAN|J\.P\. MORGAN)'),
 'ubs': (r'^UBS\b', r'', r'^UBS\b'),
 'aflac': (r'^AFLAC', r'', r'^AFLAC'),
 'ups': (r'^(UNITED PARCEL|UPS\b)', r'', r'^(UNITED PARCEL|UPS\b)'),
 'enterprise-holdings': (r'^(ENTERPRISE HOLDINGS|ENTERPRISE MOBILITY|ENTERPRISE RENT)', r'', r'^(ENTERPRISE HOLDINGS|ENTERPRISE RENT|ENTERPRISE MOBILITY)'),
 'union-pacific': (r'^UNION PACIFIC', r'', r'^UNION PACIFIC'),
 'honeywell': (r'^HONEYWELL', r'', r'^HONEYWELL'),
 'koch': (r'^KOCH( INDUSTRIES| INC| COMPANIES|,)', r'', r'^KOCH( INDUSTRIES| INC|,)'),
 'general-motors': (r'^GENERAL MOTORS', r'', r'^(GENERAL MOTORS|GM GLOBAL)'),
}
# USAspending has no record for the whole company under these names, only for one part of it
SUBSIDIARY_ONLY = {'cigna', 'home-depot', 'nextera-energy'}
Q = {'first_quarter': 1, 'second_quarter': 2, 'third_quarter': 3, 'fourth_quarter': 4}
BILL = re.compile(r'(?<![A-Za-z.])(H\.?\s?R\.?|H\.?\s?J\.?\s?RES\.?|S\.?\s?J\.?\s?RES\.?|H\.?\s?RES\.?|S\.?\s?RES\.?|S\.)\s?(\d{1,5})\b', re.I)
KIND = {'HR': ('H.R.', 'house-bill'), 'S': ('S.', 'senate-bill'), 'HJRES': ('H.J.Res.', 'house-joint-resolution'), 'SJRES': ('S.J.Res.', 'senate-joint-resolution'),
        'HRES': ('H.Res.', 'house-resolution'), 'SRES': ('S.Res.', 'senate-resolution')}
num = lambda v: float(v) if v not in (None, '') else None
out = {'companies': {}, 'lobby_through': None}
latest = (0, 0)
for slug, (cpat, cexcl, rpat) in C.items():
    L = json.load(open(os.path.join(RAW, 'lda_' + slug + '.json'), encoding='utf-8'))
    best, clients = {}, collections.Counter()
    for f in L['filings']:
        if '_error' in f or f.get('period') not in Q or (f.get('type') or '').upper() in ('RR', 'RA'): continue
        cn = (f['client']['name'] or '').strip().upper()
        if not re.search(cpat, cn) or (cexcl and re.search(cexcl, cn)): continue
        k = (f['registrant']['id'], f['client']['id'], f['year'], f['period'])
        if k not in best or (f.get('posted') or '') > (best[k].get('posted') or ''): best[k] = f
    firms, issues, bills, gov, people, covered = {}, collections.Counter(), collections.Counter(), collections.Counter(), set(), set()
    tot = inh = outs = 0.0; by_year = collections.Counter(); reports = 0; top_in = None
    for f in best.values():
        reports += 1
        cn = (f['client']['name'] or '').strip().upper(); clients[cn] += 1
        e, i = num(f.get('expenses')), num(f.get('income'))
        yq = (int(f['year']), Q[f['period']]); latest = max(latest, yq)
        if e is not None and i is None:
            inh += e; tot += e; by_year[str(f['year'])] += e
            if not top_in or e > top_in[0]: top_in = (e, f.get('doc'))
        elif i is not None:
            outs += i; tot += i; by_year[str(f['year'])] += i
            r = firms.setdefault(f['registrant']['id'], {'id': f['registrant']['id'], 'name': f['registrant']['name'], 'amt': 0.0, 'reports': 0, 'top': (-1, ''), 'last': ''})
            r['amt'] += i; r['reports'] += 1; r['last'] = max(r['last'], '%d Q%d' % yq)
            if i > r['top'][0]: r['top'] = (i, f.get('doc'))
        elif f['registrant']['name'] and re.search(cpat, f['registrant']['name'].upper()) is None:
            r = firms.setdefault(f['registrant']['id'], {'id': f['registrant']['id'], 'name': f['registrant']['name'], 'amt': 0.0, 'reports': 0, 'top': (-1, ''), 'last': ''})
            r['reports'] += 1; r['last'] = max(r['last'], '%d Q%d' % yq)
            if r['top'][0] < 0: r['top'] = (0, f.get('doc'))
        fi, fb, fg = set(), set(), set()
        for a in f.get('activities') or []:
            if a.get('issue'): fi.add(a['issue'])
            for g in a.get('gov') or []: fg.add(g)
            for m in BILL.finditer(a.get('description') or ''):
                kk = re.sub(r'[^A-Z]', '', m.group(1).upper()); fb.add((kk, int(m.group(2))))
            for l in a.get('lobbyists') or []:
                if l.get('name'):
                    people.add(l['name'].upper())
                    if (l.get('covered_position') or '').strip() and (l.get('covered_position') or '').strip().upper() not in ('N/A', 'NA', 'NONE'): covered.add(l['name'].upper())
        issues.update(fi); gov.update(fg); bills.update(fb)
    fl = sorted(firms.values(), key=lambda r: -r['amt'])
    lobby = None
    if reports:
        lobby = {'reports': reports, 'total': round(tot), 'in_house': round(inh), 'outside': round(outs), 'by_year': dict(sorted(by_year.items())),
                 'firm_count': len(fl), 'firms': [{'id': r['id'], 'name': r['name'], 'amt': round(r['amt']), 'reports': r['reports'], 'last': r['last'], 'link': r['top'][1]} for r in fl[:12]],
                 'issues': [{'issue': k, 'n': n} for k, n in issues.most_common(15)],
                 'bills': [{'bill': KIND[k][0] + ' ' + str(n), 'n': c, 'url': 'https://www.congress.gov/bill/119th-congress/' + KIND[k][1] + '/' + str(n)} for (k, n), c in bills.most_common(15) if k in KIND],
                 'gov': [{'name': k, 'n': n} for k, n in gov.most_common(8)], 'lobbyists': len(people), 'covered': len(covered),
                 'in_house_link': top_in[1] if top_in else '', 'clients': clients.most_common(6)}
    U = json.load(open(os.path.join(RAW, 'usa_' + slug + '.json'), encoding='utf-8'))
    cands = {}
    for s in U['search']:
        for r in (s['results'] if isinstance(s['results'], list) else []): cands[r.get('id')] = r
    pick = [r for r in cands.values() if r.get('recipient_level') == 'P' and re.search(rpat, (r.get('name') or '').upper()) and r.get('id') in U['details']]
    pick.sort(key=lambda r: -(r.get('amount') or 0))
    fed = None
    if pick:
        r = pick[0]; d = U['details'][r['id']]
        def cat(key):
            j = d['agencies'].get(key) or {}
            res = j.get('results') if isinstance(j, dict) else None
            return [{'agency': x.get('name'), 'amt': round(x.get('amount') or 0)} for x in (res or [])], bool((j.get('page_metadata') or {}).get('hasNext')) if isinstance(j, dict) else None
        con, con_more = cat('2026_contracts'); gr, gr_more = cat('2026_grants'); oth, _ = cat('2026_other')
        merged = collections.OrderedDict()
        for x in gr + oth: merged[x['agency']] = merged.get(x['agency'], 0) + x['amt']
        aid = [{'agency': k, 'amt': v} for k, v in merged.items()]
        p26, p25 = d['profile'].get('2026') or {}, d['profile'].get('2025') or {}
        fed = {'recipient': {'id': r['id'], 'name': r.get('name'), 'uei': r.get('uei')}, 'fy': 2026, 'as_of': U['fetched'][:10],
               'amt': round(p26.get('total_transaction_amount') or 0), 'n': p26.get('total_transactions'), 'prev_amt': round(p25.get('total_transaction_amount') or 0),
               'contract_amt': round(sum(x['amt'] for x in con)), 'contracts_complete': not con_more, 'grant_amt': round(sum(x['amt'] for x in aid)),
               'contracts': con[:8], 'grants': aid[:5], 'subsidiary_only': slug in SUBSIDIARY_ONLY,
               'url': 'https://www.usaspending.gov/recipient/' + r['id'] + '/latest'}
    out['companies'][slug] = {'lobby': lobby, 'fed': fed}
# the newest quarter that had ended by the day the reports were pulled (a firm can file a closing report early)
got = datetime.date.fromisoformat(L['fetched'][:10]); done = (got.year, (got.month - 1) // 3) if got.month > 3 else (got.year - 1, 4)
out['lobby_through'] = '%d Q%d' % min(latest, done)
out['lda_fetched'] = L['fetched'][:10]
json.dump(out, open(OUT, 'w', encoding='utf-8'), separators=(',', ':'))
print('wrote', OUT, os.path.getsize(OUT), 'bytes')
