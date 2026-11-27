"""Revolving door tracker: who lobbies after a job in Congress or the federal government, and who hired them.
Writes tools/money-trail/revolving_export.json, which build_revolving.py turns into site/money-trail/revolving.js.

Sources (free bulk files, no key and no sign-in):
  - every quarterly lobbying report (LD-2) for 2025 and 2026, the same ZIPs fetch_lobbying.py reads;
  - every new lobbying registration (LD-1) for 2025 and 2026: 2025_Registrations_XML.zip, 2026_Registrations_XML.zip.
Both list each lobbyist and, in the "covered position" field, any job in Congress or the executive branch held in the
last 20 years. The law asks for it only the first time a lobbyist is listed for a client, so the registrations matter.

Run on a home computer (the cloud and Bender's device shell cannot reach house.gov):
    python fetch_revolving.py OUT_DIR       uses the ZIPs in OUT_DIR (downloads any that are missing)

Counting rule, the same for everyone:
  - Lobbyists are matched by name as filed ("Jane Doe" in two reports is one person). Two people with the same name
    are counted once; a person filed under two spellings is counted twice.
  - A lobbyist's past jobs are every covered position filed for that name; the longest text is shown.
  - Firms and clients are counted per report: the number of 2025-2026 reports that list the lobbyist.
  - "No", "None" and "N/A" are not a past job.
The committee and agency counts read the job text with fixed word lists (COMM and EXEC below), so a job written in
an unusual way can be missed.
"""
import collections, json, os, re, sys, urllib.request, zipfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_lobbying as FL

REG_FILES = ['2025_Registrations_XML.zip', '2026_Registrations_XML.zip']
NOT_A_JOB = re.compile(r'^(N/?A|NONE|NA|-|NOT APPLICABLE|N\.A\.)\.?$', re.I)
COMM = [('Senate Finance', r'SENATE (COMMITTEE ON )?FINANCE|FINANCE COMMITTEE.*SENATE|SFC\b'), ('House Ways and Means', r'WAYS (AND|&) MEANS'),
        ('House Energy and Commerce', r'ENERGY (AND|&) COMMERCE'), ('Appropriations (House or Senate)', r'APPROPRIATIONS'),
        ('Armed Services (House or Senate)', r'ARMED SERVICES|HASC\b|SASC\b'), ('Judiciary (House or Senate)', r'JUDICIARY'),
        ('Senate HELP (Health, Education, Labor, Pensions)', r'HEALTH,? EDUCATION,? LABOR|\bHELP COMMITTEE'), ('Senate Banking', r'SENATE BANKING|BANKING,? HOUSING'),
        ('House Financial Services', r'FINANCIAL SERVICES COMMITTEE|COMMITTEE ON FINANCIAL SERVICES|HOUSE FINANCIAL SERVICES|HFSC\b'),
        ('Senate Commerce', r'COMMERCE,? SCIENCE'), ('Agriculture (House or Senate)', r'AGRICULTURE COMMITTEE|COMMITTEE ON AGRICULTURE|AG COMMITTEE'),
        ('Homeland Security (House or Senate)', r'HOMELAND SECURITY (AND GOVERNMENTAL|COMMITTEE)|COMMITTEE ON HOMELAND'),
        ('Intelligence (House or Senate)', r'INTELLIGENCE COMMITTEE|SELECT COMMITTEE ON INTELLIGENCE|HPSCI|SSCI'),
        ('Transportation and Infrastructure (House)', r'TRANSPORTATION (AND|&) INFRASTRUCTURE'), ('Environment and Public Works (Senate)', r'ENVIRONMENT (AND|&) PUBLIC WORKS|\bEPW\b'),
        ('Foreign Relations or Foreign Affairs', r'FOREIGN (RELATIONS|AFFAIRS)'), ('Budget (House or Senate)', r'BUDGET COMMITTEE|COMMITTEE ON (THE )?BUDGET'),
        ('Energy and Natural Resources (Senate)', r'ENERGY (AND|&) NATURAL RESOURCES'), ('Natural Resources (House)', r'HOUSE NATURAL RESOURCES|COMMITTEE ON NATURAL RESOURCES'),
        ('Veterans Affairs (House or Senate)', r'VETERANS.? AFFAIRS COMMITTEE|COMMITTEE ON VETERANS'),
        ('Education and the Workforce (House)', r'EDUCATION (AND|&) (THE )?WORKFORCE|EDUCATION (AND|&) LABOR'), ('Oversight (any committee or office with that word)', r'OVERSIGHT')]
EXEC = [('White House or Executive Office of the President', r'WHITE HOUSE|EXECUTIVE OFFICE OF THE PRESIDENT|\bEOP\b|OFFICE OF MANAGEMENT (AND|&) BUDGET|\bOMB\b|NATIONAL SECURITY COUNCIL|DOMESTIC POLICY COUNCIL|NATIONAL ECONOMIC COUNCIL'),
        ('Treasury', r'TREASURY|\bIRS\b|INTERNAL REVENUE'), ('Defense and the military', r'DEPARTMENT OF DEFENSE|DEPT\.? OF DEFENSE|\bDOD\b|PENTAGON|\bARMY\b|\bNAVY\b|AIR FORCE|MARINE CORPS|SECRETARY OF DEFENSE'),
        ('Health and Human Services, FDA, CMS', r'HEALTH (AND|&) HUMAN SERVICES|\bHHS\b|\bFDA\b|\bCMS\b|MEDICARE (AND|&) MEDICAID|\bCDC\b|\bNIH\b'),
        ('Commerce', r'DEPARTMENT OF COMMERCE|DEPT\.? OF COMMERCE|COMMERCE DEPARTMENT|\bNOAA\b'), ('State Department', r'DEPARTMENT OF STATE|DEPT\.? OF STATE|STATE DEPARTMENT|\bUSAID\b'),
        ('Justice', r'DEPARTMENT OF JUSTICE|DEPT\.? OF JUSTICE|\bDOJ\b|\bFBI\b'), ('Homeland Security', r'DEPARTMENT OF HOMELAND|DEPT\.? OF HOMELAND|\bDHS\b|\bICE\b|\bCBP\b|\bTSA\b|\bFEMA\b'),
        ('Energy', r'DEPARTMENT OF ENERGY|DEPT\.? OF ENERGY|\bDOE\b|\bFERC\b'), ('Transportation', r'DEPARTMENT OF TRANSPORTATION|DEPT\.? OF TRANSPORTATION|\bDOT\b|\bFAA\b'),
        ('Agriculture', r'DEPARTMENT OF AGRICULTURE|DEPT\.? OF AGRICULTURE|\bUSDA\b'), ('Environmental Protection Agency', r'\bEPA\b|ENVIRONMENTAL PROTECTION AGENCY'),
        ('Trade Representative', r'TRADE REPRESENTATIVE|\bUSTR\b'), ('Veterans Affairs', r'DEPARTMENT OF VETERANS|DEPT\.? OF VETERANS|\bVA\b'),
        ('Financial regulators (SEC, CFTC, Fed, FDIC, CFPB)', r'\bSEC\b|SECURITIES (AND|&) EXCHANGE|\bCFTC\b|FEDERAL RESERVE|\bFDIC\b|\bCFPB\b|CONSUMER FINANCIAL PROTECTION'),
        ('FCC', r'\bFCC\b|FEDERAL COMMUNICATIONS'), ('Labor', r'DEPARTMENT OF LABOR|DEPT\.? OF LABOR|\bDOL\b'), ('Interior', r'DEPARTMENT OF (THE )?INTERIOR|DEPT\.? OF (THE )?INTERIOR|\bDOI\b'),
        ('Education', r'DEPARTMENT OF EDUCATION|DEPT\.? OF EDUCATION'), ('Housing and Urban Development', r'HOUSING (AND|&) URBAN|\bHUD\b')]
COMM = [(a, re.compile(b)) for a, b in COMM]; EXEC = [(a, re.compile(b)) for a, b in EXEC]
COLS = ['nm', 'cp', 'cp2', 'f', 'fn', 'c', 'cn', 'r', 'cm', 'ex']

def parse_reg(name, x):
    lob = []
    for lb in x.split('<lobbyist>')[1:]:
        fn = FL.tag(lb, 'lobbyistFirstName') or FL.tag(lb, 'firstName'); ln = FL.tag(lb, 'lobbyistLastName') or FL.tag(lb, 'lastName')
        if not fn and not ln: continue
        suf = FL.tag(lb, 'lobbyistSuffix')
        lob.append([(fn + ' ' + ln + (' ' + suf if suf else '')).strip(), FL.tag(lb, 'coveredPosition')[:400]])
    head = x.split('<lobbyists>')[0]
    org = FL.tag(head, 'organizationName') or (FL.tag(head, 'firstName') + ' ' + FL.tag(head, 'lastName')).strip()
    return [name.replace('.xml', ''), FL.tag(head, 'senateID'), org, FL.tag(head, 'clientName'), lob]

def revolving(best, C, F, regs):
    P = {}
    def add(nm, cp, firm, client, reg):
        k = re.sub(r'\s+', ' ', nm.upper()).strip()
        p = P.setdefault(k, {'nm': nm, 'cps': set(), 'firms': collections.Counter(), 'clients': collections.Counter(), 'reps': 0})
        if cp and not NOT_A_JOB.match(cp.strip()): p['cps'].add(re.sub(r'\s+', ' ', cp).strip())
        if firm: p['firms'][firm] += 1
        if client: p['clients'][client] += 1
        if not reg: p['reps'] += 1
    for r, _, _, _ in best.values():
        key = FL.norm_client(r[5])[0]
        for nm, cp, _new in r[15]: add(nm, cp, r[4], key, False)
    for g in regs:
        key = FL.norm_client(g[3])[0]
        for nm, cp in g[4]: add(nm, cp, g[2], key, True)
    people, comm, exe = [], collections.Counter(), collections.Counter()
    for p in P.values():
        if not p['cps']: continue
        cps = sorted(p['cps'], key=len, reverse=True); up = '; '.join(cps).upper()
        cm = [a for a, rx in COMM if rx.search(up)]; ex = [a for a, rx in EXEC if rx.search(up)]
        comm.update(cm); exe.update(ex)
        name = lambda k: C[k]['name'] if k in C else k
        people.append({'nm': p['nm'], 'cp': cps[0][:320], 'cp2': cps[1][:200] if len(cps) > 1 else '', 'f': [f for f, _ in p['firms'].most_common(3)], 'fn': len(p['firms']),
                       'c': [name(k) for k, _ in p['clients'].most_common(4)], 'cn': len(p['clients']), 'r': p['reps'], 'cm': cm, 'ex': ex})
    people.sort(key=lambda r: (-r['cn'], -r['r']))
    firms = sorted([f for f in F.values() if f['former']], key=lambda f: -len(f['former']))[:40]
    clients = sorted([c for c in C.values() if c['former']], key=lambda c: -len(c['former']))[:40]
    return {'tot': {'lobbyists': len(P), 'former': len(people), 'regs': len(regs)}, 'people': people,
            'comm': comm.most_common(), 'exec': exe.most_common(),
            'firms': [[f['name'], len(f['former']), len(f['lob']), round(f['amt'])] for f in firms],
            'clients': [[c['name'], len(c['former']), len(c['lob']), round(c['total'])] for c in clients]}

if __name__ == '__main__':
    out = sys.argv[1]; os.makedirs(out, exist_ok=True); recs, regs = [], []
    for f in FL.FILES + REG_FILES:
        p = os.path.join(out, f)
        if not os.path.exists(p):
            print('download', f); urllib.request.urlretrieve(FL.BASE + f, p)
        with zipfile.ZipFile(p) as z:
            for n in z.namelist():
                x = z.read(n).decode('utf-8', 'replace')
                (regs.append(parse_reg(n, x)) if f in REG_FILES else recs.append(FL.parse(n, x)))
    best, C, F, B, I, LOB = FL.aggregate(recs)
    X = revolving(best, C, F, regs)
    X['cols'] = COLS; X['people'] = [[p[k] for k in COLS] for p in X['people']]
    dst = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'revolving_export.json')
    json.dump(X, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('wrote', dst, X['tot'])
