"""Revolving door tracker: write site/money-trail/revolving.js from tools/money-trail/:
    revolving_export.json             lobbyists who list a past government job, from fetch_revolving.py
    congress_members_since_1985.json  every member of Congress who served after 1985 (bioguide id, first, last, nickname,
                                      middle, chambers, party, state, first year, last year), from the public domain
                                      congress-legislators files (unitedstates.github.io/congress-legislators)
    lobbying_export.json              firm registrant ids, so a former member's firm is the same dot as on the Lobbying tracker
Run:  python3 -I tools/money-trail/build_revolving.py
Standard library only.

A lobbyist is listed as a former member of Congress only when both are true:
  1. one of the jobs filed for that name reads as a member's job ("Member of Congress", "U.S. Senator", "Former
     Congressman" and the like) and not as a staff job (anything with staff, aide, assistant, director, counsel, chief,
     legislative, office of, and similar words is a staff job);
  2. the name matches a member in the congress-legislators list: same last name, and a first name, middle name or
     common short form that matches ("Jim" for James). Misspelled names are not matched, so the list can miss someone.
"""
import datetime, json, os, re, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(HERE, '..', '..', 'site', 'money-trail', 'revolving.js')
X = json.load(open(os.path.join(HERE, 'revolving_export.json'), encoding='utf-8'))
LEG = json.load(open(os.path.join(HERE, 'congress_members_since_1985.json'), encoding='utf-8'))
LOB = json.load(open(os.path.join(HERE, 'lobbying_export.json'), encoding='utf-8'))
NPEOPLE, NFIRMS, NCLIENTS = 1500, 30, 30
people = [dict(zip(X['cols'], p)) for p in X['people']]

def nz(s): return re.sub(r'[^A-Z ]', ' ', unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().upper()).split()
PAIRS = [('JIM', 'JAMES'), ('BOB', 'ROBERT'), ('BUD', 'ROBERT'), ('ROB', 'ROBERT'), ('JERRY', 'GERALD'), ('ZACK', 'ZACHARY'), ('NORM', 'NORMAN'),
         ('CHIP', 'CHARLES'), ('JOE', 'JOSEPH'), ('ED', 'EDWARD'), ('TOM', 'THOMAS'), ('BILL', 'WILLIAM'), ('MIKE', 'MICHAEL'), ('DICK', 'RICHARD'),
         ('RICK', 'RICHARD'), ('DAN', 'DANIEL'), ('DAVE', 'DAVID'), ('STEVE', 'STEVEN'), ('CHRIS', 'CHRISTOPHER'), ('PAT', 'PATRICK'), ('TONY', 'ANTHONY'),
         ('TONY', 'ANTONIO'), ('RON', 'RONALD'), ('DON', 'DONALD'), ('BEN', 'BENJAMIN'), ('SAM', 'SAMUEL'), ('TIM', 'TIMOTHY'), ('MATT', 'MATTHEW'),
         ('GREG', 'GREGORY'), ('GEOFF', 'GEOFFREY'), ('KEN', 'KENNETH'), ('LARRY', 'LAWRENCE'), ('JEFF', 'JEFFREY'), ('ANDY', 'ANDREW'), ('DREW', 'ANDREW'),
         ('RANDY', 'RANDALL'), ('DOUG', 'DOUGLAS'), ('FRED', 'FREDERICK'), ('HANK', 'HENRY'), ('JACK', 'JOHN')]
NICK = {}
for a, b in PAIRS: NICK.setdefault(a, set()).add(b); NICK.setdefault(b, set()).add(a)
def forms(words): return set(words) | {v for w in words for v in NICK.get(w, ())}
MEM = re.compile(r"member of (the )?(u\.?s\.? |us |united states )?(congress|house|senate)|member,? (of )?(the )?(u\.?s\.?|us|united states) (house|senate|congress)|"
                 r"(u\.?s\.?|us|united states) (representative|senator|congress(man|woman)?)\b|\bcongress(man|woman)\b|^\s*(former |fmr\.? )?senator\b|"
                 r"former (u\.?s\.? )?senator|former member\b|mbr\.? of cong|fmr\.? cong|house (of representatives )?member|"
                 r"us house of representatives\s*(:\s*member)?\s*(\d|$|\()|^\s*u\.?s\.? house of representatives\s*$|representative,? u\.?s\.? house|"
                 r"member,? u\.?s\.? house|^\s*u\.?s\.? senat(e|or)\b", re.I)
STAFF = re.compile(r"staff|aide|assistant|\basst\b|director|\bdir\b|counsel|chief|intern|fellow|advis|scheduler|specialist|clerk|liaison|deputy|manager|"
                   r"coordinator|press|policy|legislative|\bleg\.? |\bla\b|\blc\b|\bsla\b|caseworker|\bcos\b|\bea\b|\bld\b|\bmla\b|\bsa\b|\baa\b|employee|"
                   r"office of|correspondent|analyst|associate|officer|services", re.I)
DROP = {'JR', 'SR', 'II', 'III', 'IV', 'HON', 'THE', 'MR', 'MRS', 'MS', 'DR', 'DMD'}
def segs(s): return [x.strip() for x in re.split(r';|\s\|\s|\n', s) if x.strip()]

def member_of(p):
    text = p['cp'] + '; ' + p['cp2']
    if not any(MEM.search(s) and not STAFF.search(s) for s in segs(text)): return None
    w = [x for x in nz(p['nm']) if x not in DROP]
    if len(w) < 2: return None
    W, yrs = forms(w), set(re.findall(r'(?:19|20)\d\d', text))
    found = []
    for m in LEG:
        last = nz(m[2])
        if not last or last[-1] not in W: continue
        firsts = forms([x for f in (m[1], m[3], m[4]) for x in nz(f)])
        if (W - {last[-1]}) & firsts: found.append((m[9] in yrs or m[8] in yrs, m[9], m))
    if not found: return None
    found.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return found[0][2]

def shown_name(m):
    first = m[3] or (m[4] if m[1].endswith('.') and m[4] else m[1])
    return first + ' ' + m[2]
CH = {'rep': 'House', 'sen': 'Senate'}
members = {}
for i, p in enumerate(people):
    m = member_of(p)
    if not m: continue
    p['mem'] = m[0]
    x = members.setdefault(m[0], {'bio': m[0], 'n': shown_name(m), 'ch': ' and '.join(dict.fromkeys(CH[c] for c in m[5].split('/'))), 'p': m[6][:1], 'st': m[7],
                                  'y0': int(m[8]), 'y1': int(m[9]), 'as': [], 'cp': '', 'f': [], 'c': [], 'cn': 0, 'r': 0})
    x['as'].append(p['nm']); x['r'] += p['r']; x['cn'] = max(x['cn'], p['cn'])
    if len(p['cp']) > len(x['cp']): x['cp'] = p['cp']
    for f in p['f']:
        if f.upper() not in {g.upper() for g in x['f']}: x['f'].append(f)
    for c in p['c']:
        if c.upper() not in {g.upper() for g in x['c']}: x['c'].append(c)
mlist = sorted(members.values(), key=lambda x: (-x['cn'], -x['r'], x['n']))
for x in mlist: x['f'], x['c'] = x['f'][:4], x['c'][:5]

# Firm registrant ids (same dots as the Lobbying tracker and the Company tracker), by firm name.
RID = {}
for c in LOB['det']:
    for f in c['firms']: RID.setdefault(f[1].strip().upper(), f[0])
for f in LOB['firms']: RID.setdefault(f[1].strip().upper(), f[0])

HOUSE = re.compile(r"\bHOUSE\b|\bREP\b\.?|REPRESENTATIVE|CONGRESSM|CONGRESSWOMAN|\bH\.?\s?R\.?\b")
SENATE = re.compile(r"SENATE|\bSEN\b\.?|SENATOR")
EXECW = re.compile(r"DEPARTMENT|\bDEPT\b|AGENCY|ADMINISTRATION|ADMINISTRATOR|SECRETARY OF|WHITE HOUSE|EXECUTIVE OFFICE|BUREAU|COMMISSION|\bARMY\b|\bNAVY\b|AIR FORCE|"
                   r"\bUSDA\b|\bHHS\b|\bDOD\b|\bDOJ\b|\bDHS\b|\bDOE\b|\bDOT\b|\bEPA\b|\bFDA\b|\bCMS\b|\bOMB\b|\bUSTR\b|\bSEC\b|\bFCC\b|\bFTC\b|\bNIH\b|\bCDC\b|\bFAA\b|AMBASSADOR|PRESIDENT")
cnt = {'house': 0, 'senate': 0, 'exec': 0}
for p in people:
    up = (p['cp'] + ' ' + p['cp2']).upper()
    cnt['house'] += bool(HOUSE.search(up)); cnt['senate'] += bool(SENATE.search(up)); cnt['exec'] += bool(EXECW.search(up) or p['ex'])

top = people[:NPEOPLE]
for p in people:
    if p.get('mem') and p not in top: top.append(p)
out_people = [[p['nm'], p['cp'][:200] + ('…' if len(p['cp']) > 200 else ''), p['f'][:2], p['c'][:3], p['cn'], p['r'], p.get('mem', '')] for p in top]
party = {}
for x in mlist: party[x['p']] = party.get(x['p'], 0) + 1
assert len(mlist) >= 80, 'member matching broke'
assert all(isinstance(p[4], int) for p in out_people)

meta = {'built': datetime.date.today().isoformat(), 'tot': dict(X['tot'], members=len(mlist), people_shown=len(out_people), **cnt), 'party': party,
        'comm': X['comm'], 'exec': X['exec'], 'web': 40,
        'rule': ('A lobbyist\'s past government jobs are copied from the "covered position" field of every 2025-2026 lobbying report and registration. '
                 'The law asks for any job in Congress or the executive branch held in the last 20 years, but only the first time a firm lists that lobbyist for a client, '
                 'so someone listed for the same client since before 2025 may not show one. Names are matched as filed. '
                 'A lobbyist is listed as a former member of Congress only when the job text says so and the name matches the official list of members. Same rule for every party.'),
        'sources': [['House Clerk bulk files of every lobbying report and registration (LD-1 and LD-2)', 'https://disclosurespreview.house.gov/'],
                    ['LDA.gov, the official lobbying disclosure site (Senate and House)', 'https://lda.gov/'],
                    ['Members of Congress since 1789 (congress-legislators, public domain)', 'https://github.com/unitedstates/congress-legislators'],
                    ['Lobbying Disclosure Act guidance: covered positions', 'https://lobbyingdisclosure.house.gov/amended_lda_guide.html'],
                    ['18 U.S.C. 207, the waiting period before former members may lobby Congress', 'https://www.law.cornell.edu/uscode/text/18/207']]}
data = {'meta': meta, 'members': [{k: x[k] for k in ('bio', 'n', 'ch', 'p', 'st', 'y0', 'y1', 'as', 'cp', 'f', 'c', 'cn', 'r')} for x in mlist],
        'rid': {f: RID[f.upper()] for x in mlist for f in x['f'] if f.upper() in RID},
        'people': out_people, 'firms': X['firms'][:NFIRMS], 'clients': X['clients'][:NCLIENTS]}
js = ('// Revolving door tracker data. Made by tools/money-trail/build_revolving.py from every 2025-2026 lobbying report and\n'
      '// registration (House Clerk bulk files) and the congress-legislators list; do not edit by hand.\n'
      'window.TW_REVOLVING=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
open(SITE, 'w', encoding='utf-8').write(js)
print('wrote', SITE, len(js), 'bytes;', len(mlist), 'former members', party, ';', len(out_people), 'people;', cnt)
