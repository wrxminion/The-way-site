"""Company tracker, phase 1: fetch public lobbying (LDA.gov) and federal spending (USAspending.gov) records.

Run on a computer whose network reaches lda.gov and api.usaspending.gov (the cloud cannot):
    python fetch_company_records.py OUT_DIR
No key, token or sign-in is used. Writes OUT_DIR/lda_<slug>.json, OUT_DIR/usa_<slug>.json and OUT_DIR/fetch_log.txt.
Safe to rerun: a company whose two files already exist is skipped (delete them to refetch).
"""
import json, os, sys, time, urllib.parse, urllib.request, urllib.error

OUT = sys.argv[1] if len(sys.argv) > 1 else 'raw'
os.makedirs(OUT, exist_ok=True)
LOG = open(os.path.join(OUT, 'fetch_log.txt'), 'a', encoding='utf-8')
UA = {'User-Agent': 'company-tracker-research/1.0', 'Accept': 'application/json'}

# slug: (LDA client name searches, USAspending recipient keyword searches)
COMPANIES = {
    'boeing': (['Boeing'], ['Boeing']),
    'lockheed-martin': (['Lockheed Martin'], ['Lockheed Martin']),
    'spacex': (['Space Exploration Technologies', 'SpaceX'], ['Space Exploration Technologies']),
    'unitedhealth-group': (['UnitedHealth'], ['UnitedHealth']),
    'elevance-health': (['Elevance'], ['Elevance']),
    'cigna': (['Cigna'], ['Cigna']),
    'eli-lilly': (['Eli Lilly'], ['Eli Lilly']),
    'abbott': (['Abbott Laboratories'], ['Abbott Laboratories']),
    'pfizer': (['Pfizer'], ['Pfizer']),
    'comcast': (['Comcast', 'NBCUniversal'], ['Comcast']),
    'charter-communications': (['Charter Communications'], ['Charter Communications']),
    'att': (['AT&T'], ['AT&T']),
    'google': (['Google', 'Alphabet'], ['Google']),
    'amazon': (['Amazon'], ['Amazon']),
    'microsoft': (['Microsoft'], ['Microsoft']),
    'valero': (['Valero'], ['Valero']),
    'phillips-66': (['Phillips 66'], ['Phillips 66']),
    'chevron': (['Chevron'], ['Chevron']),
    'nextera-energy': (['NextEra', 'Florida Power & Light'], ['NextEra']),
    'entergy': (['Entergy'], ['Entergy']),
    'duke-energy': (['Duke Energy'], ['Duke Energy']),
    'home-depot': (['Home Depot'], ['Home Depot']),
    'walmart': (['Walmart'], ['Walmart']),
    'lowes': (["Lowe's"], ["Lowe's"]),
    'jpmorgan-chase': (['JPMorgan'], ['JPMorgan']),
    'ubs': (['UBS'], ['UBS']),
    'aflac': (['Aflac'], ['Aflac']),
    'ups': (['United Parcel Service'], ['United Parcel Service']),
    'enterprise-holdings': (['Enterprise Holdings', 'Enterprise Mobility'], ['Enterprise Holdings', 'Enterprise Rent']),
    'union-pacific': (['Union Pacific'], ['Union Pacific']),
    'honeywell': (['Honeywell'], ['Honeywell']),
    'koch': (['Koch'], ['Koch']),
    'general-motors': (['General Motors'], ['General Motors']),
}
YEARS = [2025, 2026]
FY = {'2025': ('2024-10-01', '2025-09-30'), '2026': ('2025-10-01', '2026-09-30')}


def log(*a):
    s = time.strftime('%H:%M:%S ') + ' '.join(str(x) for x in a)
    print(s, flush=True)
    LOG.write(s + '\n'); LOG.flush()


def call(url, body=None, tries=6):
    for i in range(tries):
        try:
            data = json.dumps(body).encode() if body is not None else None
            h = dict(UA)
            if data: h['Content-Type'] = 'application/json'
            req = urllib.request.Request(url, data=data, headers=h, method='POST' if data else 'GET')
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            wait = int(e.headers.get('Retry-After') or 0) or (10 * (i + 1))
            log('HTTP', e.code, url[:120], 'wait', wait)
            if e.code in (400, 404): return {'_error': e.code, '_body': e.read().decode('utf-8', 'replace')[:500]}
            time.sleep(min(wait, 120))
        except Exception as e:
            log('ERR', type(e).__name__, str(e)[:120], url[:120])
            time.sleep(10 * (i + 1))
    return {'_error': 'gave up'}


def slim(f):
    return {
        'uuid': f.get('filing_uuid'), 'type': f.get('filing_type'), 'type_display': f.get('filing_type_display'),
        'year': f.get('filing_year'), 'period': f.get('filing_period'), 'period_display': f.get('filing_period_display'),
        'doc': f.get('filing_document_url'), 'income': f.get('income'), 'expenses': f.get('expenses'),
        'posted': f.get('dt_posted'), 'termination_date': f.get('termination_date'),
        'registrant': {'id': (f.get('registrant') or {}).get('id'), 'name': (f.get('registrant') or {}).get('name')},
        'client': {'id': (f.get('client') or {}).get('id'), 'name': (f.get('client') or {}).get('name'),
                   'client_id': (f.get('client') or {}).get('client_id')},
        'activities': [{'code': a.get('general_issue_code'), 'issue': a.get('general_issue_code_display'),
                        'description': a.get('description'),
                        'gov': [g.get('name') for g in (a.get('government_entities') or [])],
                        'lobbyists': [{'name': ' '.join(x for x in [(l.get('lobbyist') or {}).get('first_name'), (l.get('lobbyist') or {}).get('last_name')] if x),
                                       'covered_position': l.get('covered_position'), 'new': l.get('new')}
                                      for l in (a.get('lobbyists') or [])]}
                       for a in (f.get('lobbying_activities') or [])],
    }


def lda(slug, names):
    out, seen = [], set()
    for name in names:
        for y in YEARS:
            url = 'https://lda.gov/api/v1/filings/?' + urllib.parse.urlencode({'client_name': name, 'filing_year': y, 'page_size': 25})
            n = 0
            while url:
                j = call(url)
                if '_error' in j:
                    log('LDA fail', slug, name, y, j); out.append({'_error': j, 'name': name, 'year': y}); break
                for f in j.get('results', []):
                    if f.get('filing_uuid') not in seen:
                        seen.add(f.get('filing_uuid')); out.append(slim(f)); n += 1
                url = j.get('next')
                time.sleep(1.2)
            log('LDA', slug, name, y, n, 'filings')
    return out


def usa(slug, keywords):
    res = {'search': [], 'details': {}}
    B = 'https://api.usaspending.gov/api/v2/'
    for kw in keywords:
        j = call(B + 'recipient/', {'keyword': kw, 'award_type': 'all', 'limit': 25, 'page': 1, 'order': 'desc', 'sort': 'amount'})
        res['search'].append({'keyword': kw, 'results': j.get('results', j)})
        time.sleep(0.5)
    rows = [r for s in res['search'] for r in (s['results'] if isinstance(s['results'], list) else [])]
    parents = [r for r in rows if r.get('recipient_level') == 'P'][:4]
    others = [r for r in rows if r.get('recipient_level') == 'R'][:2]
    for r in parents + others:
        rid = r.get('id')
        if not rid or rid in res['details']: continue
        d = {'row': r, 'profile': {}, 'agencies': {}}
        for fy, (a, b) in FY.items():
            d['profile'][fy] = call(B + 'recipient/' + rid + '/?year=' + fy)
            time.sleep(0.4)
            for grp, codes in (('contracts', ['A', 'B', 'C', 'D']), ('grants', ['02', '03', '04', '05']),
                               ('other', ['06', '07', '08', '09', '10', '11', '-1'])):
                filt = {'recipient_id': rid, 'time_period': [{'start_date': a, 'end_date': b}], 'award_type_codes': codes}
                d['agencies'][fy + '_' + grp] = call(B + 'search/spending_by_category/awarding_agency/', {'filters': filt, 'limit': 10, 'page': 1})
                time.sleep(0.4)
            # No award list: on Nov 15, 2026 spending_by_award ignored the recipient_id filter and gave every company the same awards.
        res['details'][rid] = d
        log('USA', slug, r.get('name'), r.get('recipient_level'), r.get('amount'))
    return res


only = sys.argv[2:] if len(sys.argv) > 2 else list(COMPANIES)
for slug in only:
    names, kws = COMPANIES[slug]
    pl, pu = os.path.join(OUT, 'lda_' + slug + '.json'), os.path.join(OUT, 'usa_' + slug + '.json')
    if not os.path.exists(pl):
        data = {'fetched': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'searches': names, 'years': YEARS, 'filings': lda(slug, names)}
        json.dump(data, open(pl, 'w', encoding='utf-8'))
    if not os.path.exists(pu):
        data = {'fetched': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'keywords': kws, **usa(slug, kws)}
        json.dump(data, open(pu, 'w', encoding='utf-8'))
log('DONE', len(only), 'companies')
