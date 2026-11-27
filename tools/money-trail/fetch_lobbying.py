"""Lobbying tracker: read every quarterly lobbying report (LD-2) for 2025 and 2026 from the free bulk files and boil
them down to tools/money-trail/lobbying_export.json, which build_lobbying.py turns into site/money-trail/lobbying.js.

Source: the House Clerk's bulk XML files (one ZIP per quarter, every LD-2 filed with the House and Senate), listed at
https://disclosurespreview.house.gov/ (data/LD/LdSearchPastFilings.json). No key and no sign-in are needed.
The lda.gov REST API allows only a few anonymous requests a minute, so it is used only for the report links
(see build_lobbying.py), never for the totals.

Run on a home computer (the cloud and Bender's device shell cannot reach house.gov):
    python fetch_lobbying.py OUT_DIR            downloads the ZIPs into OUT_DIR (skips ones already there)
    python fetch_lobbying.py OUT_DIR --export   also writes tools/money-trail/lobbying_export.json

How the money is counted (same rule for every client):
  - One report per registrant, client, year and quarter: the one signed last (amendments replace the first report).
  - A client that files its own report (in-house lobbying) gives its total lobbying expenses. That figure is meant to
    include what it paid outside firms, so outside firms' income from that client in that quarter is shown but not
    added again. This is the same rule OpenSecrets uses.
  - A client that files no report of its own: the outside firms' income is added.
  - A report filed "on behalf of" another client (a firm hired by a firm) is shown but not added, because the first
    firm's income already includes it.
  - A quarter under $5,000 is reported with no amount, so it adds nothing.
  - Reports held out of the totals (HOLD below) are listed on the page with the reason.
"""
import collections, io, json, os, re, sys, urllib.request, zipfile

BASE = 'https://disclosurespreview.house.gov/data/LD/'
FILES = ['2025_1stQuarter_XML.zip', '2025_2ndQuarter_XML.zip', '2025_3rdQuarter_XML.zip', '2025_4thQuarter_XML.zip',
         '2026_1stQuarter_XML.zip', '2026_2ndQuarter_XML.zip', '2026_3rdQuarter_XML.zip', '2026_4thQuarter_XML.zip']
# One outside firm reporting $20 million a quarter for one client ($80 million a year, more than the largest in-house
# lobbying total of any group). Shown on the page as filed, not added to any total.
HOLD = {'STATE OF LOC NATION GLOBAL PUBLIC BENEFIT'}
NDET, NLIST = 300, 3000

ENT = {'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'"}
def dec(s):
    s = re.sub(r'&(amp|lt|gt|quot|apos);', lambda m: ENT[m.group(0)], s)
    s = re.sub(r'&#(\d+);', lambda m: chr(int(m.group(1))), s)
    return re.sub(r'\s+', ' ', s.replace('​', '').replace('\r', '')).strip()
def tag(s, t):
    m = re.search('<' + t + '>([\\s\\S]*?)</' + t + '>', s)
    return dec(m.group(1)) if m else ''
BILL = re.compile(r'(?<![A-Za-z.])(H\.\s?R\.|HR|H\.R|S\.\s?J\.\s?Res\.?|H\.\s?J\.\s?Res\.?|H\.\s?Res\.?|S\.\s?Res\.?|H\.\s?Con\.\s?Res\.?|S\.\s?Con\.\s?Res\.?|S\.)\s?(\d{1,5})(?![\d,])', re.I)
def norm_bill(p, n): return re.sub(r'[.\s]', '', p.upper()) + ' ' + n
# Which Congress a bill number means. Bill numbers are given out in order, so a report for a quarter can only mean the
# 119th Congress bill if that number had been introduced by about 20 days after the quarter ended (when reports are due).
# A higher number means the 118th Congress bill with that number (2023-2024). Built from GovInfo BILLSTATUS introduced dates
# (every 75th House bill and every 50th Senate bill). Numbers up to 20 are kept for leaders and count as the 119th.
CUT = {'HR': {'2025Q1': 3000, '2025Q2': 4560, '2025Q3': 5800, '2025Q4': 7160, '2026Q1': 8420, '2026Q2': 9780, '2026Q3': 20000, '2026Q4': 20000},
       'S': {'2025Q1': 1500, '2025Q2': 2350, '2025Q3': 3020, '2025Q4': 3690, '2026Q1': 4350, '2026Q2': 5060, '2026Q3': 5700, '2026Q4': 20000}}
def congress_bill(b, yq):
    k, n = b.split(' '); cut = CUT.get(k)
    if not cut or int(n) <= 20 or int(n) <= cut.get(yq, 20000): return b
    return b + '@118'
NOT_A_JOB = re.compile(r'^(N/?A|NONE|NA|-|NOT APPLICABLE)\.?$', re.I)

def parse(name, x):
    head = x.split('<alis>')[0]
    issues, bills, gov, lob = [], [], [], {}
    for a in x.split('<ali_info>')[1:]:
        code = tag(a, 'issueAreaCode')
        if code and code not in issues: issues.append(code)
        for m in BILL.finditer(tag(a, 'description')):
            b = norm_bill(m.group(1), m.group(2))
            if b not in bills: bills.append(b)
        for g in re.split(r',\s*', tag(a, 'federal_agencies')):
            if g and g.upper() not in gov: gov.append(g.upper())
        for lb in a.split('<lobbyist>')[1:]:
            fn, ln = tag(lb, 'lobbyistFirstName'), tag(lb, 'lobbyistLastName')
            if not fn and not ln: continue
            suf = tag(lb, 'lobbyistSuffix')
            nm = (fn + ' ' + ln + (' ' + suf if suf else '')).strip()
            cp = tag(lb, 'coveredPosition')[:400]
            k = nm.upper()
            if k not in lob or (not lob[k][1] and cp): lob[k] = [nm, cp, 1 if tag(lb, 'lobbyistNew') == 'Y' else 0]
    num = lambda v: float(re.sub(r'[,$]', '', v)) if v else None
    org = tag(head, 'organizationName') or (tag(head, 'firstName') + ' ' + tag(head, 'lastName')).strip()
    return [name.replace('.xml', ''), tag(head, 'reportYear'), tag(head, 'reportType'), tag(head, 'senateID'), org, tag(head, 'clientName'),
            tag(head, 'selfSelect'), num(tag(head, 'income')), num(tag(head, 'expenses')), tag(head, 'signedDate'), tag(head, 'noLobbying'),
            tag(head, 'terminationDate'), issues, bills, gov, list(lob.values()), tag(head, 'clientState'), tag(head, 'clientGovtEntity')]

SUF = {'INC', 'INCORPORATED', 'LLC', 'LC', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'LTD', 'LIMITED', 'LP', 'LLP', 'PLC', 'PC', 'PLLC', 'NA', 'SA', 'AG', 'NV', 'THE'}
def norm_client(n):
    """A client's name in one form, so 'The Boeing Company', 'Boeing Company' and 'BOEING' are one client."""
    s = str(n or '').upper(); sub = False
    m = re.search(r'ON BEHALF OF\s+(?:THE\s+)?(.+?)\)?$', s)
    if m: s, sub = m.group(1), True
    s = re.sub(r'\((F/?K/?A|FORMERLY|FKA|DBA|D/B/A|AKA)[^)]*\)', ' ', s)
    s = re.sub(r'\([^)]*\)', ' ', s).replace('&', ' AND ')
    s = re.sub(r'[^A-Z0-9 ]+', ' ', s)
    s = re.sub(r'\s+AND\s+(ITS\s+)?(VARIOUS\s+)?(SUBSIDIARIES|AFFILIATES)\s*$', '', re.sub(r'\s+', ' ', s).strip())
    w = s.split(' ')
    while len(w) > 1 and w[-1] in SUF: w.pop()
    while len(w) > 1 and w[0] == 'THE': w.pop(0)
    return ' '.join(w), sub

def signed(s):
    m = re.search(r'(\d+)/(\d+)/(\d+)\s+(\d+):(\d+):(\d+)\s*(AM|PM)?', str(s))
    if not m: return ''
    h = int(m.group(4)) % 12 + (12 if m.group(7) == 'PM' else 0)
    return '%s%02d%02d%02d%s%s' % (m.group(3), int(m.group(1)), int(m.group(2)), h, m.group(5), m.group(6))

def aggregate(recs):
    best = {}
    for r in recs:
        y, t = r[1], r[2]
        if y not in ('2025', '2026'): continue
        q = re.search(r'[1-4]', t)
        if not q: continue
        k = (r[3], y, q.group(0)); d = signed(r[9])
        if k not in best or d > best[k][1]: best[k] = (r, d, y, q.group(0))
    C, F, B, I, LOB = {}, {}, {}, {}, {}
    for r, _, y, q in best.values():
        key, sub = norm_client(r[5])
        if not key: continue
        self = r[6] == 'Y'; amt = r[8] if self else r[7]
        c = C.setdefault(key, {'key': key, 'names': collections.Counter(), 'self': False, 'q': {}, 'inh': 0, 'outAll': 0, 'firms': {}, 'issues': collections.Counter(),
                               'bills': collections.Counter(), 'gov': collections.Counter(), 'lob': set(), 'former': {}, 'reps': 0, 'state': collections.Counter(), 'best': None})
        c['names'][r[5]] += 100 if self else 1; c['reps'] += 1
        if r[16]: c['state'][r[16]] += 1
        yq = y + 'Q' + q; qq = c['q'].setdefault(yq, {'self': 0, 'hasSelf': False, 'out': 0, 'sub': 0})
        rid = r[3].split('-')[0]
        if self:
            c['self'] = True; qq['hasSelf'] = True
            if amt: qq['self'] += amt; c['inh'] += amt
        else:
            f = c['firms'].setdefault(rid, {'rid': rid, 'name': r[4], 'amt': 0, 'n': 0, 'last': '', 'sub': sub})
            f['n'] += 1
            if amt: f['amt'] += amt
            if yq > f['last']: f.update(last=yq, sid=r[3], y=y, qn=q)
            if amt:
                qq['sub' if sub else 'out'] += amt; c['outAll'] += amt
            g = F.setdefault(rid, {'rid': rid, 'name': r[4], 'amt': 0, 'clients': collections.Counter(), 'lob': set(), 'former': set(), 'reps': 0})
            g['reps'] += 1
            if amt: g['amt'] += amt
            g['clients'][key] += amt or 0
        if amt and (not c['best'] or amt > c['best'][3]): c['best'] = [r[3], y, q, amt]
        for i in r[12]:
            c['issues'][i] += 1; ii = I.setdefault(i, {'clients': set(), 'n': 0}); ii['clients'].add(key); ii['n'] += 1
        for b in r[13]:
            b = congress_bill(b, yq)
            c['bills'][b] += 1; bb = B.setdefault(b, {'clients': collections.Counter(), 'n': 0}); bb['clients'][key] += 1; bb['n'] += 1
        for g in r[14]: c['gov'][g] += 1
        for nm, cp, _new in r[15]:
            lk = nm.upper(); c['lob'].add(lk); okc = bool(cp) and not NOT_A_JOB.match(cp.strip())
            if okc: c['former'][lk] = [nm, cp]
            if not self:
                F[rid]['lob'].add(lk)
                if okc: F[rid]['former'].add(lk)
            L = LOB.setdefault(lk, {'nm': nm, 'cp': '', 'firms': set(), 'clients': set()})
            if okc and len(cp) > len(L['cp']): L['cp'] = cp
            L['firms'].add(r[4]); L['clients'].add(key)
    for c in C.values():
        c['t'] = {'2025': 0, '2026': 0}; c['outCounted'] = 0
        for yq, v in c['q'].items():
            c['t'][yq[:4]] += v['self'] if v['hasSelf'] else v['out']
            if not v['hasSelf']: c['outCounted'] += v['out']
        c['total'] = c['t']['2025'] + c['t']['2026']
        c['name'] = c['names'].most_common(1)[0][0]
    return best, C, F, B, I, LOB

def export(best, C, F, B, I, LOB, done):
    R = round
    top = lambda cnt, n: [[k, v] for k, v in cnt.most_common(n)]
    allc = sorted([c for c in C.values() if c['total'] > 0 and c['key'] not in HOLD], key=lambda c: -c['total'])
    det = [{'k': c['key'], 'n': c['name'], 't25': R(c['t']['2025']), 't26': R(c['t']['2026']), 'inh': R(c['inh']), 'out': R(c['outAll']), 'outc': R(c['outCounted']), 'self': c['self'],
            'firms': [[f['rid'], f['name'], R(f['amt']), f['n'], f['sid'], f['y'], f['qn'], 1 if f['sub'] else 0] for f in sorted(c['firms'].values(), key=lambda f: -f['amt'])[:8]],
            'fc': len(c['firms']), 'is': top(c['issues'], 6), 'bl': top(c['bills'], 8), 'gv': [[k[:60], v] for k, v in c['gov'].most_common(5)], 'lb': len(c['lob']), 'fo': len(c['former']),
            'fx': [[a, b[:200]] for a, b in list(c['former'].values())[:4]], 'st': (c['state'].most_common(1) or [['']])[0][0],
            'best': c['best'] and [c['best'][0], c['best'][1], c['best'][2], R(c['best'][3])],
            'q': {k: R(v['self'] if v['hasSelf'] else v['out']) for k, v in c['q'].items()}, 'reps': c['reps']} for c in allc[:NDET]]
    lst = [[c['name'], R(c['t']['2025']), R(c['t']['2026']), len(c['firms']), (c['issues'].most_common(1) or [['']])[0][0], 1 if c['self'] else 0] for c in allc[NDET:NLIST]]
    rank = {c['key']: i for i, c in enumerate(allc)}
    bills = sorted([{'b': b, 'c': len(v['clients']), 'n': v['n'], 'top': [C[k]['name'] for k in sorted([k for k in v['clients'] if k in rank], key=lambda k: rank[k])[:10]]} for b, v in B.items()], key=lambda x: -x['c'])[:120]
    issues = sorted([[i, len(v['clients']), v['n']] for i, v in I.items()], key=lambda x: -x[1])
    fb = {}  # each firm's largest report, for its link
    for r, _, y, q in best.values():
        if r[6] == 'Y': continue
        rid = r[3].split('-')[0]
        if rid not in fb or (r[7] or 0) > fb[rid][3]: fb[rid] = [r[3], y, q, r[7] or 0]
    firms = [[f['rid'], f['name'], R(f['amt']), len(f['clients']), [[C[k]['name'], R(a)] for k, a in f['clients'].most_common(5)], len(f['lob']), len(f['former']), f['reps'],
              fb.get(f['rid'], [])[:3]] for f in sorted(F.values(), key=lambda f: -f['amt'])[:150]]
    tot = {'t25': R(sum(c['t']['2025'] for c in allc)), 't26': R(sum(c['t']['2026'] for c in allc)), 'clients': len(allc), 'clients_all': len(C), 'firms': len(F),
           'lobbyists': len(LOB), 'former': sum(1 for l in LOB.values() if l['cp']), 'reports': len(best)}
    held = [[r[3], y, q, r[4], r[5], r[7]] for r, _, y, q in best.values() if norm_client(r[5])[0] in HOLD]
    held_firm = [[F[h[0].split('-')[0]]['name'], len(F[h[0].split('-')[0]]['clients'])] for h in held[:1]]
    return {'tot': tot, 'det': det, 'list': lst, 'bills': bills, 'issues': issues, 'firms': firms, 'held': held, 'heldFirm': held_firm, 'done': done}

if __name__ == '__main__':
    out = sys.argv[1]; os.makedirs(out, exist_ok=True); recs, done = [], []
    for f in FILES:
        p = os.path.join(out, f)
        if not os.path.exists(p):
            print('download', f); urllib.request.urlretrieve(BASE + f, p)
        with zipfile.ZipFile(p) as z:
            names = z.namelist()
            for n in names: recs.append(parse(n, z.read(n).decode('utf-8', 'replace')))
        done.append([f, len(names)])
    if '--export' in sys.argv:
        X = export(*aggregate(recs), done)
        dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lobbying_export.json')
        json.dump(X, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print('wrote', dst, X['tot'])
