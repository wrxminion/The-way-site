#!/usr/bin/env python3
"""Media outlets for the Money web and the Media tracker (D249).

Reads the FEC bulk pull (media_pull_results.json, made by media_pull.py on a device that can reach fec.gov)
and the ownership list (ownership.json, copied from SEC, IRS and outlet records), and writes
site/money-trail/media.js (window.TW_MEDIA). Run from the repo root:

  python3 -I tools/money-trail/build_media.py site PULL.json OWNERSHIP.json

Rules: memo lines (memo code X) are left out, so nothing is counted twice. People who are not owners are not
named: payee rows filed as individuals (IND) were already dropped by the pull. Totals count every matched row;
the web gets the same depth for every company (its LIMIT largest rows), so no company is drawn bigger by choice.
A payee is matched to a company only by the name written on the filing; the card says so.
"""
import json, os, re, sys, collections

LIMIT = 60
FECIMG = 'https://docquery.fec.gov/cgi-bin/fecimg/?'
FECCMTE = 'https://www.fec.gov/data/committee/'
# Plain names and outlets for each group, used when ownership.json has no row for it.
INFO = {
 'comcast-nbcu': ('Comcast (NBCUniversal)', ['NBC News', 'NBC', 'Telemundo', 'Peacock']),
 'versant': ('Versant Media Group', ['MS NOW (was MSNBC)', 'CNBC']),
 'disney-abc': ('The Walt Disney Company', ['ABC News', 'ABC', 'ESPN', 'Hulu']),
 'paramount-cbs': ('Paramount Skydance', ['CBS News', 'CBS', 'Pluto TV']),
 'wbd-cnn': ('Warner Bros. Discovery', ['CNN', 'HBO']),
 'fox': ('Fox Corporation', ['Fox News', 'Fox Business', 'Fox Television Stations', 'Tubi']),
 'news-corp': ('News Corp', ['The Wall Street Journal', 'New York Post', "Barron's"]),
 'nyt': ('The New York Times Company', ['The New York Times']),
 'wapo': ('The Washington Post', ['The Washington Post']),
 'gannett': ('USA TODAY Co. (Gannett)', ['USA Today', 'local Gannett papers']),
 'latimes': ('Los Angeles Times', ['Los Angeles Times']),
 'newsmax': ('Newsmax', ['Newsmax']),
 'nexstar': ('Nexstar Media Group', ['local TV stations (incl. former TEGNA stations)', 'The Hill', 'NewsNation']),
 'sinclair': ('Sinclair', ['local TV stations']),
 'gray': ('Gray Media', ['local TV stations']),
 'scripps': ('The E.W. Scripps Company', ['local TV stations', 'ION']),
 'hearst': ('Hearst', ['Hearst Television stations', 'Hearst newspapers']),
 'cox-media': ('Cox Media Group', ['local TV and radio stations']),
 'axios': ('Axios', ['Axios']),
 'univision': ('TelevisaUnivision', ['Univision']),
 'charter-spectrum': ('Charter Communications (Spectrum)', ['Spectrum News', 'Spectrum Reach (ad sales)']),
 'iheart': ('iHeartMedia', ['iHeartRadio stations']),
 'audacy': ('Audacy', ['radio stations']),
 'cumulus': ('Cumulus Media', ['radio stations', 'Westwood One']),
 'salem': ('Salem Media Group', ['radio stations', 'Townhall']),
 'siriusxm': ('Sirius XM', ['SiriusXM', 'Pandora']),
 'politico': ('Politico', ['Politico']),
 'daily-wire': ('The Daily Wire', ['The Daily Wire']),
 'breitbart': ('Breitbart News', ['Breitbart']),
 'daily-caller': ('The Daily Caller', ['The Daily Caller']),
 'washington-times': ('The Washington Times', ['The Washington Times']),
 'vox': ('Vox Media', ['Vox', 'New York magazine', 'The Verge']),
 'buzzfeed': ('BuzzFeed', ['BuzzFeed', 'HuffPost']),
 'bloomberg': ('Bloomberg L.P.', ['Bloomberg News', 'Bloomberg Television']),
 'npr': ('NPR (National Public Radio)', ['NPR']),
 'pbs': ('PBS (Public Broadcasting Service)', ['PBS']),
 'allen-media': ('Allen Media Group', ['local TV stations', 'The Weather Channel']),
}
# Company PACs: which group a PAC belongs to, by its name or its connected organization on the FEC record.
PAC_GROUP = [
 ('comcast-nbcu', r'COMCAST|NBC ?UNIVERSAL'), ('versant', r'VERSANT'), ('disney-abc', r'DISNEY'),
 ('paramount-cbs', r'PARAMOUNT|\bCBS\b|SKYDANCE'), ('wbd-cnn', r'WARNER BRO'), ('fox', r'\bFOX CORP'),
 ('news-corp', r'NEWS CORP|DOW JONES'), ('nyt', r'NEW YORK TIMES'), ('wapo', r'WASHINGTON POST'), ('gannett', r'GANNETT'),
 ('nexstar', r'NEXSTAR|TEGNA'), ('sinclair', r'SINCLAIR'), ('gray', r'GRAY (TELEVISION|MEDIA)'), ('scripps', r'SCRIPPS'),
 ('hearst', r'HEARST'), ('cox-media', r'\bCOX MEDIA'), ('axios', r'\bCOX ENTERPRISES'), ('univision', r'UNIVISION'),
 ('charter-spectrum', r'CHARTER COMMUNICATIONS'), ('iheart', r'IHEART'), ('audacy', r'AUDACY'), ('cumulus', r'CUMULUS'),
 ('salem', r'SALEM MEDIA'), ('siriusxm', r'SIRIUS'), ('newsmax', r'NEWSMAX'), ('bloomberg', r'BLOOMBERG'),
 ('broadcasters', r'NATIONAL ASSOCIATION OF BROADCASTERS'),
]
INFO['broadcasters'] = ('National Association of Broadcasters (trade group)', ['speaks for TV and radio station owners'])
# Names the pull matched that are NOT the media company (checked by hand, Nov 8 2026). Add more here when found.
NOT_MEDIA = re.compile(r'VERSANT POWER|PARAMOUNT CONSULTING|NPR GRAPHICS|ALLEN MEDIA STRATEG|BABCOCK|WILCOX|\bBARRON,|STEPHEN BARRON|BULLFEATHERS|HILL BAR|TIMES SQUARE|BARRON\'S RENTAL|BASH BY BARRON|BARRON COUNTY|NEWSSTAND|LAX CNBC|DCA CNBC', re.I)
_PERSON = re.compile(r'^[A-Z][A-Z\'\-. ]+, [A-Z][A-Z\'\-. ]+$')
_FIRM = re.compile(r'\b(INC|LLC|CORP|CO|MEDIA|GROUP|NEWS|TV|RADIO|BROADCAST\w*|COMPANY|LP|LTD|HOLDINGS|NETWORKS?|STATIONS?|TIMES|POST|JOURNAL|COMMUNICATIONS)\b')
class PERSON:  # "LAST, FIRST" with no company word = a person, left out
    @staticmethod
    def match(n): return bool(_PERSON.match(n)) and not _FIRM.search(n)
PARTY = {'DEM': 'Democratic', 'REP': 'Republican', 'DFL': 'Democratic', 'LIB': 'Libertarian', 'GRE': 'Green', 'IND': 'Independent'}
AD = re.compile(r'ADVERT|\bADS?\b|AIR ?TIME|BROADCAST|TELEVISION|\bTV\b|RADIO|DIGITAL|SPONSOR|PLACEMENT|\bMEDIA\b|\bBUY\b|PRODUCTION|STREAMING|CTV|OTT|\bPROMO', re.I)
ORGWORD = re.compile(r'\b(INC|LLC|L\.?P\.?|LTD|TRUST|GROUP|FUND|FUNDS|CAPITAL|CORP|CORPORATION|ADVISORS|ADVISERS|MANAGEMENT|COMPANY|CO\.|HOLDINGS|PARTNERS|BANK|ASSOCIATES|INVESTMENTS|VANGUARD|BLACKROCK|STATE STREET|FOUNDATION|PLC|AG|SE|N\.A\.)\b', re.I)

# Plain notes shown on a card, written from the filings in media-ownership.json (Nov 8 2026). They say when an owner list
# is old or missing. Press reports are never used as owners.
CAVEAT = {
 'charter-spectrum': 'This owner list is from the March 2026 proxy. On August 19, 2026 Charter completed its Liberty Broadband merger and its Cox Communications deal (8-K), so these percentages are out of date. The 8-K caps Cox Enterprises at 30%.',
 'paramount-cbs': 'Owner list from the April 2026 10-K/A. Class A, the only class that votes, is held by Harbor Lights Entertainment, which the filing says David Ellison may be deemed to control. On October 6, 2026 the company sold about 3.9 billion new Class B shares at $12 to investors the 8-K does not name, so the Class B percentages are now much smaller.',
 'wbd-cnn': 'Since October 6, 2026 Warner Bros. Discovery, owner of CNN, is a wholly owned part of Skydance Corporation (8-K).',
 'fox': 'Class A shares do not vote. Fox completed its purchase of Roku on November 6, 2026, after this proxy.',
 'news-corp': 'Class A shares do not vote. LGC Holdco is owned by trusts for Lachlan, Grace and Chloe Murdoch (proxy).',
 'newsmax': 'Each Class A share has ten votes and each Class B share one vote (proxy). The proxy does not state a combined share of the votes.',
 'salem': 'Salem stopped filing with the SEC in February 2024. This is its last proxy, from 2023.',
 'cumulus': 'Cumulus came out of Chapter 11 in October 2026. The old shares were canceled and lenders hold about 95% of the new shares (8-K). The new holders are not named.',
 'univision': 'Grupo Televisa says in its 20-F that it owns 44.3%. The other owners are not stated in a filing we found.',
 'audacy': 'From a 2024 FCC order, written before the reorganization closed: Laurel Tree Opportunities was expected to hold 57% or more of the voting shares, and its only voting shareholder is owned by Fund for Policy Reform, a nonprofit trust. Current owners not found.',
 'buzzfeed': 'On May 26, 2026 a company of Byron Allen\'s family office bought new shares giving it about 51% of the votes (8-K). The other rows are from the April 2026 proxy, before that sale.',
 'wapo': 'No government filing names the owner. The Post itself reported on October 1, 2013 that its sale to Jeff Bezos for $250 million had closed.',
 'npr': 'Nonprofit with no shareholders. Total revenue $354.1 million in the year ending September 2025 (IRS Form 990).',
 'pbs': 'Nonprofit owned by its member stations, no shareholders. Total revenue $696.6 million in the year ending June 2025 (IRS Form 990).',
}
NO_OWNER_RECORD = 'No filed record of the owner found yet.'
OVERRIDE = {  # owner rows replaced where the pull could not open the page it quoted
 'wapo': {'owners': [{'name': 'Jeff Bezos (through Nash Holdings)', 'quote': 'Washington Post closes sale to Amazon founder Jeff Bezos (The Washington Post, October 1, 2013)'}],
          'source_kind': "the outlet's own report", 'filing_date': '2013-10-01',
          'source_url': 'https://www.washingtonpost.com/business/economy/washington-post-closes-sale-to-amazon-founder-jeff-bezos/2013/10/01/fca3b16a-2acf-11e3-97a3-ff2758228523_story.html'},
 'washington-times': {'owners': [], 'source_kind': 'not found', 'source_url': ''},
 'latimes': {'owners': [], 'source_kind': 'not found', 'source_url': ''},
}
SKIP_OWNER = re.compile(r'^(not found|nonprofit)', re.I)

def apply_owners(G, o):
    """Fills a company's name, outlets, owners and notes from one media-ownership.json row (plus OVERRIDE and CAVEAT)."""
    o = dict(o, **OVERRIDE.get(G['id'], {}))
    if o.get('parent') and o.get('parent') != 'not found': G['name'] = o['parent']
    if o.get('outlets'): G['outlets'] = o['outlets']
    for k in ('public', 'ticker', 'cik', 'source_kind', 'source_url', 'filing_date'):
        if o.get(k) not in (None, '', 'not found'): G[k] = o[k]
        elif k in ('source_kind', 'source_url'): G.pop(k, None)
    G['owners'] = []
    for w in o.get('owners') or []:
        if not w.get('name') or SKIP_OWNER.match(w['name']): continue
        G['owners'].append({k: w.get(k) for k in ('name', 'class', 'percent', 'voting_percent', 'as_of', 'quote') if w.get(k) not in (None, '', 'None')} | {'person': not ORGWORD.search(w['name'])})
    G['caveat'] = CAVEAT.get(G['id']) or ('' if G['owners'] else NO_OWNER_RECORD)

MON = {m: i + 1 for i, m in enumerate(['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'])}
def day(s):
    """FEC files write dates several ways (YYYY-MM-DD, MM/DD/YYYY, DD-MON-YY). Returns YYYY-MM-DD or ''."""
    s = (s or '').strip().upper()
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', s)
    if m: return m.group(0)
    m = re.match(r'(\d{1,2})/(\d{1,2})/(\d{4})', s)
    if m: return '%s-%02d-%02d' % (m.group(3), int(m.group(1)), int(m.group(2)))
    m = re.match(r'(\d{1,2})-([A-Z]{3})-(\d{2,4})', s)
    if m and m.group(2) in MON:
        y = m.group(3); y = ('20' + y) if len(y) == 2 else y
        return '%s-%02d-%02d' % (y, MON[m.group(2)], int(m.group(1)))
    return ''

def side(p):
    p = (p or '').upper()
    return 'DEM' if p in ('DEM', 'DFL') else 'REP' if p == 'REP' else 'OTHER' if p else 'NONE'

def main(site, pull_path, own_path):
    P = json.load(open(pull_path, encoding='utf-8'))
    O = json.load(open(own_path, encoding='utf-8')) if own_path and os.path.exists(own_path) else []
    own = {o.get('group'): o for o in O if isinstance(o, dict)}
    groups = {g: {'id': g, 'name': INFO.get(g, (g, []))[0], 'outlets': INFO.get(g, (g, []))[1], 'owners': [], 'pacs': [],
                  'paid': collections.Counter(), 'paid_n': collections.Counter(), 'pac': collections.Counter(), 'pac_n': collections.Counter(),
                  'names': collections.Counter(), 'rows': [], 'pac_rows': []} for g in INFO}
    print('ownership groups not matched to an id:', [g for g in own if g not in groups])
    for g, o in own.items():
        if g in groups: apply_owners(groups[g], o)
    cname = {}
    # 1. Payments to media companies: operating expenditures (Schedule B) and independent expenditures (Schedule E).
    for r in P.get('payments_to_outlets', []):
        if (r.get('memo_cd') or '').upper() == 'X' or r['group'] not in groups or not r.get('amount') or NOT_MEDIA.search(r.get('payee') or ''): continue
        G = groups[r['group']]; s = side(r.get('cmte_party')); a = r['amount']
        kind = 'ad' if AD.search((r.get('purpose') or '') + ' ' + (r.get('category') or '')) else 'other'
        G['paid'][kind] += a; G['paid_n'][kind] += 1; G['paid'][s] += a; G['paid_n'][s] += 1; G['names'][r['payee']] += 1
        cname[r['cmte_id']] = r.get('cmte_name') or r['cmte_id']
        if a > 0: G['rows'].append(['B', r['cmte_id'], r['payee'], a, r.get('date', ''), (r.get('purpose') or '').strip(), r.get('image_num', ''), r.get('sub_id', ''), s, r.get('state', '')])
    for r in P.get('ie_to_outlets', []):
        if r.get('group') not in groups or NOT_MEDIA.search(r.get('pay') or '') or PERSON.match((r.get('pay') or '').strip().upper()): continue
        try: a = round(float(r.get('exp_amo') or 0), 2)
        except ValueError: continue
        if not a: continue
        G = groups[r['group']]; s = side(r.get('spe_party'))
        G['paid']['ie'] += a; G['paid_n']['ie'] += 1; G['paid'][s] += a; G['paid_n'][s] += 1; G['names'][r.get('pay', '')] += 1
        cname[r.get('spe_id', '')] = r.get('spe_nam') or r.get('spe_id', '')
        so = {'S': 'for', 'O': 'against'}.get((r.get('sup_opp') or '').upper(), '')
        pur = (r.get('pur') or '').strip() + (' (spent ' + so + ' ' + r['cand_name'].strip() + ')' if so and r.get('cand_name') else '')
        dt = day(r.get('exp_date') or r.get('dissem_dt') or '')
        if a > 0: G['rows'].append(['E', r.get('spe_id', ''), r.get('pay', ''), a, dt, pur, r.get('image_num', ''), (r.get('file_num', '') + '-' + r.get('tran_id', '')).strip('-'), s, r.get('can_off_sta', '')])
    # 2. Company PACs and what they gave (to candidates: pas2; to other committees: oth).
    pacg = {}
    for c in P.get('committees_matched', []):
        hay = (c.get('name', '') + ' | ' + c.get('connected_org', '')).upper()
        if NOT_MEDIA.search(hay): continue
        g = next((g for g, rx in PAC_GROUP if re.search(rx, hay)), None)
        if not g: continue
        pacg[c['cmte_id']] = g; cname[c['cmte_id']] = c['name']
        groups[g]['pacs'].append({'id': c['cmte_id'], 'name': c['name'], 'connected_org': c.get('connected_org', ''), 'type': c.get('type', ''), 'designation': c.get('designation', '')})
    seen = set()
    for kind, key in (('C', 'pac_to_candidates'), ('M', 'pac_to_committees')):
        for r in P.get(key, []):
            g = pacg.get(r['cmte_id'])
            if not g or (r.get('memo_cd') or '').upper() == 'X' or not r.get('amount') or r.get('sub_id') in seen: continue
            seen.add(r.get('sub_id'))
            s = side(r.get('cand_party') if kind == 'C' else r.get('other_party'))
            G = groups[g]; G['pac'][s] += r['amount']; G['pac_n'][s] += 1
            who = r.get('name') or r.get('other_id')
            cand = (r.get('cand_name') or '').strip()
            if r['amount'] > 0: G['pac_rows'].append([kind, r['cmte_id'], r.get('other_id', ''), who, r['amount'], r.get('date', ''), cand, r.get('image_num', ''), r.get('sub_id', ''), s, r.get('tran_tp', '')])
    out = []
    for g, G in groups.items():
        rows = sorted(G['rows'], key=lambda x: -x[3]); prow = sorted(G['pac_rows'], key=lambda x: -x[4])
        if not (rows or prow or G['owners'] or G['pacs']): continue
        paid_total = sum(G['paid'][k] for k in ('ad', 'other', 'ie'))
        out.append({'id': g, 'name': G['name'], 'outlets': G['outlets'], 'owners': G['owners'], 'pacs': G['pacs'],
                    **{k: G[k] for k in ('public', 'ticker', 'cik', 'source_kind', 'source_url', 'filing_date', 'caveat') if G.get(k) not in (None, '')},
                    'paid': {'total': round(paid_total, 2), 'n': sum(G['paid_n'][k] for k in ('ad', 'other', 'ie')),
                             **{k: round(G['paid'][k], 2) for k in ('ad', 'other', 'ie', 'DEM', 'REP', 'OTHER', 'NONE')},
                             **{k + '_n': G['paid_n'][k] for k in ('ad', 'other', 'ie', 'DEM', 'REP', 'OTHER', 'NONE')}},
                    'pac_gave': {'total': round(sum(G['pac'].values()), 2), 'n': sum(G['pac_n'].values()),
                                 **{k: round(G['pac'][k], 2) for k in ('DEM', 'REP', 'OTHER', 'NONE')}, **{k + '_n': G['pac_n'][k] for k in ('DEM', 'REP', 'OTHER', 'NONE')}},
                    'payee_names': [n for n, _ in G['names'].most_common(8)],
                    'rows': rows[:LIMIT], 'pac_rows': prow[:LIMIT]})
    out.sort(key=lambda x: -(x['paid']['total'] + x['pac_gave']['total']))
    used = {r[1] for x in out for r in x['rows']} | {r[1] for x in out for r in x['pac_rows']} | {p['id'] for x in out for p in x['pacs']}
    data = {'meta': {'retrieved': P.get('retrieved'), 'files': P.get('files'), 'limit': LIMIT, 'cycle': '2026',
                     'method': 'FEC 2025-2026 bulk files: every operating expenditure and independent expenditure whose payee name, as written on the filing, names a media company, and every gift by a media company PAC. Memo lines left out. Totals count every row; the web shows the ' + str(LIMIT) + ' largest rows for each company, the same depth for all.',
                     'img': FECIMG, 'cmte': FECCMTE},
            'committees': {k: v for k, v in cname.items() if k in used}, 'groups': out}
    p = os.path.join(site, 'money-trail', 'media.js')
    with open(p, 'w', encoding='utf-8') as f:
        f.write('// Media companies for the Money web and the Media tracker (D249). Built by tools/money-trail/build_media.py. Do not edit by hand.\n')
        f.write('// Every money row is one line of a public FEC filing. Owners come from SEC, IRS or the outlet\'s own records, as each card says.\n')
        f.write('window.TW_MEDIA=' + json.dumps(data, separators=(',', ':'), ensure_ascii=False) + ';\n')
    print('wrote', p, os.path.getsize(p), 'bytes,', len(out), 'companies,', sum(len(x['rows']) + len(x['pac_rows']) for x in out), 'rows in the web')
    for x in out: print(' ', x['id'], x['paid']['n'], round(x['paid']['total']), 'pac', x['pac_gave']['n'], round(x['pac_gave']['total']), 'owners', len(x['owners']), '|', '; '.join(p['name'] for p in x['pacs']))
    print('PAYEE NAMES TO CHECK (name as filed | lines | dollars), top 10 per company, before the NOT_MEDIA filter:')
    for g, v in (P.get('payee_names') or {}).items():
        print('[' + g + ']', ' || '.join('%s | %d | %d' % (n, c, t) for n, c, t in v[:10]))

def owners_only(site, own_path):
    """Re-applies media-ownership.json (and CAVEAT/OVERRIDE) to an existing media.js without the FEC pull."""
    p = os.path.join(site, 'money-trail', 'media.js'); txt = open(p, encoding='utf-8').read()
    head, body = txt.split('window.TW_MEDIA=', 1)
    data = json.loads(body.strip().rstrip(';'))
    own = {o.get('group'): o for o in json.load(open(own_path, encoding='utf-8')) if isinstance(o, dict)}
    for G in data['groups']:
        for k in ('public', 'ticker', 'cik', 'source_kind', 'source_url', 'filing_date', 'caveat', 'notes'): G.pop(k, None)
        if G['id'] in own: apply_owners(G, own[G['id']])
        else: G['owners'] = []; G['caveat'] = CAVEAT.get(G['id'], NO_OWNER_RECORD if G['id'] != 'broadcasters' else '')
        G.pop('person', None)
        if not G.get('caveat'): G.pop('caveat', None)
    with open(p, 'w', encoding='utf-8') as f: f.write(head + 'window.TW_MEDIA=' + json.dumps(data, separators=(',', ':'), ensure_ascii=False) + ';\n')
    print('owners re-applied to', p, os.path.getsize(p), 'bytes')

if __name__ == '__main__':
    if sys.argv[1] == '--owners-only': owners_only(sys.argv[2], sys.argv[3])
    else: main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)
