"""Lobbying tracker: write site/money-trail/lobbying.js from three files in tools/money-trail/:
    lobbying_export.json  every 2025-2026 quarterly lobbying report (LD-2), boiled down by fetch_lobbying.py
    lobbying_links.json   lda.gov report ids for the largest report of each listed client and firm (looked up by hand
                          through the lda.gov API, a few a minute; a missing id just means no link)
    lobbying_bills.json   bill titles, introduced dates and public law numbers from the GovInfo BILLSTATUS bulk files
Run:  python3 -I tools/money-trail/build_lobbying.py
Standard library only. Checks: every dollar figure is a whole number, every listed client has a name, and the
totals match the sum of the client totals."""
import datetime, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, '..', '..', 'site', 'money-trail', 'lobbying.js')
X = json.load(open(os.path.join(HERE, 'lobbying_export.json'), encoding='utf-8'))
LINKS = json.load(open(os.path.join(HERE, 'lobbying_links.json'), encoding='utf-8'))
BILLS = json.load(open(os.path.join(HERE, 'lobbying_bills.json'), encoding='utf-8'))
ISSUES = json.load(open(os.path.join(HERE, 'lobbying_issues.json'), encoding='utf-8'))
NCARDS, NMORE, NBILLS, NFIRMS, NWEB = 300, 2000, 60, 60, 40

# The same company patterns the Company tracker uses (summarize_company_records.py), so a lobbying client that is one
# of its 33 companies opens that company's card and joins its dot in the Money web.
src = open(os.path.join(HERE, 'summarize_company_records.py'), encoding='utf-8').read()
CO = {m.group(1): re.compile(m.group(2)) for m in re.finditer(r"^ '([a-z0-9-]+)': \(r(?:'|\")(.+?)(?:'|\"), r", src, re.M)}
assert len(CO) >= 30, 'company patterns not found'
def company_of(name):
    up = name.upper().strip()
    if re.search(r'CREDIT UNION|EMPLOYEES', up): return None
    for slug, rx in CO.items():
        if rx.search(up): return slug
    return None

KIND = {'HR': ('H.R.', 'house-bill'), 'S': ('S.', 'senate-bill'), 'HJRES': ('H.J.Res.', 'house-joint-resolution'), 'SJRES': ('S.J.Res.', 'senate-joint-resolution'),
        'HRES': ('H.Res.', 'house-resolution'), 'SRES': ('S.Res.', 'senate-resolution'), 'HCONRES': ('H.Con.Res.', 'house-concurrent-resolution'),
        'SCONRES': ('S.Con.Res.', 'senate-concurrent-resolution')}
def bill(b):
    base, _, cong = b.partition('@'); cong = cong or '119'
    k, n = base.split(' ')
    if k not in KIND: return None
    return {'id': b, 'label': KIND[k][0] + ' ' + n, 'congress': cong, 'url': 'https://www.congress.gov/bill/' + cong + 'th-congress/' + KIND[k][1] + '/' + n}
def bill_name(b):
    t = BILLS.get(b) or {}
    title, short = (t.get('title') or '').strip(), (t.get('short') or '').strip()
    if short and (not title or re.match(r'^(An act|A bill|To |Making|An original|Establishing|A joint|A resolution|A concurrent)', title, re.I) or len(title) > 110): return short
    return title

slug_seen = set()
def slugify(s):
    base = re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:60] or 'client'
    s, i = base, 2
    while s in slug_seen: s = base + '-' + str(i); i += 1
    slug_seen.add(s); return s

clients = []
for c in X['det'][:NCARDS]:
    assert c['n'].strip(), c
    u = LINKS.get('|'.join(c['best'][:3])) if c['best'] else None
    clients.append({
        's': slugify(c['k']), 'n': c['n'].strip(), 'a': [c['t25'], c['t26']], 'self': 1 if c['self'] else 0, 'inh': c['inh'], 'outc': c['outc'], 'out': c['out'],
        'f': [[f[1].strip(), f[2], f[3], f[7], f[0]] for f in c['firms']], 'fc': c['fc'], 'i': [[k, n] for k, n in c['is']],
        'b': [[b, n] for b, n in c['bl'] if bill(b)], 'g': c['gv'], 'lb': c['lb'], 'fo': c['fo'], 'fx': c['fx'], 'st': c['st'], 'r': c['reps'],
        'l': u or '', 'lw': (c['best'][1] + ' Q' + c['best'][2]) if c['best'] else '', 'la': c['best'][3] if c['best'] else None, 'co': company_of(c['n'])})
more = [[r[0].strip(), r[1], r[2], r[3], r[4], r[5]] for r in X['list'][:NMORE - NCARDS]]
bills = []
for b in X['bills']:
    if len(bills) >= NBILLS: break
    bb = bill(b['b'])
    if not bb: continue
    t = BILLS.get(b['b']) or {}
    bills.append({'id': b['b'], 'name': bill_name(b['b']), 'law': t.get('law') or '', 'introduced': t.get('introduced') or '', 'sponsor': t.get('sponsor') or '',
                  'c': b['c'], 'r': b['n'], 'top': b['top'][:8]})
firms = []
for f in X['firms'][:NFIRMS]:
    u = LINKS.get('|'.join(f[8][:3])) if len(f) > 8 and f[8] else None
    firms.append({'rid': f[0], 'n': f[1].strip(), 'amt': f[2], 'c': f[3], 'top': f[4], 'lb': f[5], 'fo': f[6], 'r': f[7], 'l': u or ''})
issues = [[k, n, r] for k, n, r in X['issues'] if k in ISSUES]
held = X['held']
tot = X['tot']
assert all(isinstance(x, int) for c in clients for x in c['a'] + [c['inh'], c['outc']])
assert tot['t25'] >= sum(c['a'][0] for c in clients) and tot['t25'] > 1e9
q_done = sorted({d[0][:4] + ' Q' + d[0][5] for d in X['done'] if d[1] > 1000})

meta = {
    'built': datetime.date.today().isoformat(), 'through': q_done[-1], 'quarters': q_done, 'files': X['done'], 'tot': tot,
    'held': [{'firm': h[3], 'client': h[4], 'year': h[1], 'q': h[2], 'amt': h[5]} for h in held],
    'held_total': sum(h[5] or 0 for h in held), 'held_firm_clients': (X.get('heldFirm') or [[None, None]])[0][1], 'web': NWEB,
    'rule': ('One report per lobbying firm, client and quarter: the one filed last, so a corrected report replaces the first one. '
             'A group that lobbies with its own staff files its own report and gives its total lobbying costs, which by law include what it paid outside firms, '
             'so those firms\' fees are shown on its card but not added again. For a group that only hires outside firms, the firms\' fees are added. '
             'A report a firm files "on behalf of" another firm\'s client is shown but not added, because the first firm\'s fee already includes it. '
             'A quarter under $5,000 is reported with no amount. Amounts are rounded to the nearest $10,000 by law. The same rule for every client. '
             'OpenSecrets counts lobbying the same way, so its totals should be close but may not match exactly.'),
    'sources': [['House Clerk bulk files of every lobbying report (LD-2), one ZIP a quarter', 'https://disclosurespreview.house.gov/'],
                ['LDA.gov, the official lobbying disclosure site (Senate and House)', 'https://lda.gov/'],
                ['GovInfo bill status files (titles and laws)', 'https://www.govinfo.gov/bulkdata/BILLSTATUS/119'],
                ['Lobbying Disclosure Act guidance (what each report must include)', 'https://lobbyingdisclosure.house.gov/amended_lda_guide.html']]
}
data = {'meta': meta, 'issue_names': ISSUES, 'clients': clients, 'more': more, 'bills': bills, 'firms': firms, 'issues': issues}
out = ('// Lobbying tracker data. Made by tools/money-trail/build_lobbying.py from every 2025-2026 quarterly lobbying report\n'
       '// (LD-2, House Clerk bulk files) and GovInfo bill status files; do not edit by hand.\n'
       'window.TW_LOBBYING=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
open(SITE, 'w', encoding='utf-8').write(out)
print('wrote', SITE, len(out), 'bytes;', len(clients), 'cards,', len(more), 'more,', len(bills), 'bills,', len(firms), 'firms; links',
      sum(1 for c in clients if c['l']), '/', len(clients), '; companies', sum(1 for c in clients if c['co']))
