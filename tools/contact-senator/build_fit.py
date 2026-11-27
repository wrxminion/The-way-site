#!/usr/bin/env python3
"""Build site/get-involved/contact-your-senator/fit.js, the data that makes the Contact Your Senator and Contact Your
Representative tools fit each member (D298, Frank Nov 27 2026).

What it holds, for the browser:
- committees: each House and Senate committee (full committees only) and who sits on it, from the congress-legislators
  project (committees-current.yaml and committee-membership-current.yaml).
- votes: recent House and Senate roll calls and how every member voted, from tools/contact-senator/recent_votes/
  (copied from the official Office of the Clerk and senate.gov roll call files; see the header of each file).
- upcoming: the bills and dates in tools/get-involved/upcoming.json (the hand-checked weekly schedule), each with its
  floor date, sponsor, committees and official summary. The page hides each one when its date has passed.
- states: each state's Get Involved page, legislature links and elections from tools/get-involved/states.json.
- topics: groups of words that mean the same thing for the issue search (topics.json, edited by hand).

Nothing here is a guess: a field we do not have is left out, and the page says so.

Usage (from the repo root, after downloading the two yaml files from github.com/unitedstates/congress-legislators):
    python3 tools/contact-senator/build_fit.py committees-current.yaml committee-membership-current.yaml
"""
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
OUT = ROOT / 'site/get-involved/contact-your-senator/fit.js'
STATE_NAMES = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AS': 'American Samoa', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
    'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'DC': 'District of Columbia', 'FL': 'Florida',
    'GA': 'Georgia', 'GU': 'Guam', 'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
    'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland', 'MA': 'Massachusetts',
    'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska',
    'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
    'NC': 'North Carolina', 'ND': 'North Dakota', 'MP': 'Northern Mariana Islands', 'OH': 'Ohio', 'OK': 'Oklahoma',
    'OR': 'Oregon', 'PA': 'Pennsylvania', 'PR': 'Puerto Rico', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont', 'VI': 'U.S. Virgin Islands',
    'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
}
MONTHS = {m: i for i, m in enumerate(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
                                       'September', 'October', 'November', 'December'], 1)}
SHORT_MONTHS = {k[:3]: v for k, v in MONTHS.items()}


def plain(s):
    return ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))


def load_js(path, name):
    t = (ROOT / path).read_text(encoding='utf-8')
    return json.loads(t[t.index('=') + 1:].strip().rstrip(';'))


def bill_key(s):
    """'H R 4464', 'H.R. 4464', 'H.Con.Res. 93', 'H CON RES 93' -> 'hr4464', 'hconres93'."""
    return re.sub(r'[^a-z0-9]', '', (s or '').lower())


def bill_label(key):
    m = re.match(r'^(hr|s|hres|sres|hjres|sjres|hconres|sconres)(\d+)$', key)
    if not m:
        return ''
    names = {'hr': 'H.R.', 's': 'S.', 'hres': 'H.Res.', 'sres': 'S.Res.', 'hjres': 'H.J.Res.', 'sjres': 'S.J.Res.',
             'hconres': 'H.Con.Res.', 'sconres': 'S.Con.Res.'}
    return names[m.group(1)] + ' ' + m.group(2)


def committees(cpath, mpath):
    C = yaml.safe_load(open(cpath, encoding='utf-8'))
    M = yaml.safe_load(open(mpath, encoding='utf-8'))
    out, member = {}, {}
    for c in C:
        if c.get('type') not in ('house', 'senate'):
            continue
        code = c['thomas_id']
        out[code] = {'name': c['name'], 'ch': c['type']}
        for m in M.get(code, []) or []:
            b = m.get('bioguide')
            if not b:
                continue
            role = m.get('title') or ''
            member.setdefault(b, []).append([code, role] if role in ('Chair', 'Chairman', 'Ranking Member', 'Vice Chair', 'Vice Chairman') else code)
    byname = {v['name'].lower(): k for k, v in out.items()}
    return out, member, byname


def parse_votes(path, chamber, senate_ids):
    lines = [l for l in path.read_text(encoding='utf-8').split('\n') if l and not l.startswith('#')]
    roster = {}
    for tok in lines[0].split()[1:]:
        if chamber == 'house':
            roster[tok[:-1]] = tok[-1]
        else:
            k, p = tok.rsplit(':', 1)
            roster[k] = p
    votes = []
    for l in lines[1:]:
        f = l.split('|')
        if chamber == 'house':
            _, n, date, bill, q, res, desc, tot, dflt, ex = f
            d = datetime.strptime(date, '%d-%b-%Y')
            title = desc
            doc = bill
            url = 'https://clerk.house.gov/evs/%d/roll%03d.xml' % (d.year, int(n))
            tot = json.loads(tot)
            yes = sum(v[0] for v in tot.values())
            no = sum(v[1] for v in tot.values())
            vid = 'h-%d-%s' % (d.year, n)
        else:
            _, n, date, q, res, doc, vtitle, dtitle, yn, dflt, ex = f
            d = datetime.strptime(date.split(',')[0] + ',' + date.split(',')[1], '%B %d, %Y')
            title, desc = vtitle, dtitle
            yes, no = (int(x) for x in yn.split('-'))
            tot = None
            url = 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_%05d.htm' % int(n)
            vid = 's-119-2-%s' % n
        default = dict(x.split('=') for x in dflt.split(',') if x)
        cast = {}
        exc = {}
        for tok in ex.split():
            if chamber == 'house':
                exc[tok[:-1]] = tok[-1]
            else:
                k, v = tok.rsplit(':', 1)
                exc[k] = v
        for who, party in roster.items():
            c = exc.get(who, default.get(party, 'X'))
            if c == '-':
                continue
            bid = who if chamber == 'house' else senate_ids.get(who)
            if not bid:
                raise SystemExit('No senator matches %s in senators.js' % who)
            cast[bid] = c
        v = {'id': vid, 'ch': chamber, 'n': int(n), 'date': d.strftime('%Y-%m-%d'),
             'q': q, 'res': res, 'title': title.strip(), 'doc': doc.strip(), 'bill': bill_key(doc) if not doc.startswith('PN') else '',
             'yes': yes, 'no': no, 'url': url, 'cast': cast}
        if desc and desc != title:
            v['desc'] = desc.strip()
        if tot:
            v['tot'] = tot
        votes.append(v)
    return votes


def pack_casts(votes, order):
    """Each vote's casts as one string in the order of `order` (Y, N, P, X, or . for not in office), to keep the file small."""
    for v in votes:
        v['c'] = ''.join(v['cast'].get(i, '.') for i in order)
        del v['cast']


def day_of(label, year=2026):
    m = re.search(r'(January|February|March|April|May|June|July|August|September|October|November|December) (\d+)', label or '')
    return '%d-%02d-%02d' % (year, MONTHS[m.group(1)], int(m.group(2))) if m else ''


def states_in(text):
    out = []
    t = ' ' + plain(text or '') + ' '
    for st, name in STATE_NAMES.items():
        if re.search(r'[^A-Za-z]' + re.escape(name) + r'[^A-Za-z]', t) and not (name == 'Washington' and 'Washington, D' in t):
            out.append(st)
    # 'Virginia' inside 'West Virginia' is not Virginia.
    if 'WV' in out and 'VA' in out and not re.search(r'(?<!West )Virginia', t):
        out.remove('VA')
    return out


def upcoming(U, byname):
    bills = {bill_key(b['number']): b for b in U.get('bills', [])}
    items = []
    for ch in ('house', 'senate'):
        for day in (U.get(ch) or {}).get('days', []):
            when = (day.get('at') or '')[:10] or day_of(day.get('label'))
            for it in day.get('items', []):
                if it.get('bill'):
                    k = bill_key(it['bill'])
                    b = bills.get(k)
                    if not b:
                        continue
                    sp = b.get('sponsor') or {}
                    text = ' '.join([b.get('title', ''), (b.get('summary') or {}).get('text', '')])
                    item = {'id': 'bill-' + k, 'kind': 'bill', 'ch': ch, 'bill': k, 'number': b['number'], 'title': b['title'],
                            'when': when, 'whenLabel': day.get('label', ''), 'how': it.get('how', ''),
                            'sponsor': {'id': sp.get('bioguide', ''), 'name': sp.get('name', '')},
                            'cosponsors': b.get('cosponsors'),
                            'committees': [byname[c.lower()] for c in b.get('committees', []) if c.lower() in byname],
                            'policy': b.get('policy_area') or '',
                            'summary': (b.get('summary') or {}).get('text', ''),
                            'summaryOf': (b.get('summary') or {}).get('version', ''),
                            'latest': b.get('latest_action'),
                            'page': '/get-involved/bills/' + re.sub(r'^([a-z]+)(\d+)$', r'\1-\2', k) + '.html',
                            'states': states_in(text)}
                    if not (ROOT / ('site' + item['page'])).exists():
                        del item['page']
                    items.append(item)
                elif it.get('kind') == 'nomination':
                    items.append({'id': 'nom-' + re.sub(r'[^a-z0-9]+', '-', it['what'].lower())[:60].strip('-'), 'kind': 'nomination', 'ch': ch,
                                  'title': it['what'], 'when': when, 'whenLabel': day.get('label', ''), 'detail': it.get('when', ''),
                                  'src': it.get('src') or [], 'states': states_in(it['what']), 'committees': ['SSJU'] if 'Judge' in it['what'] else []})
    for d in U.get('dates', []):
        items.append({'id': 'date-' + d['at'][:10], 'kind': 'date', 'ch': 'both', 'title': d['what'], 'when': d['at'][:10],
                      'whenLabel': d.get('label', ''), 'note': d.get('note', ''), 'src': d.get('src') or [], 'states': []})
    return items


def main(cpath, mpath):
    reps = load_js('site/get-involved/contact-your-representative/representatives.js', 'HOUSE_CONTACTS')['members']
    sens = load_js('site/get-involved/contact-your-senator/senators.js', 'SENATE_CONTACTS')['senators']
    senate_ids = {plain(s['last']).replace(' ', '_') + '-' + s['st']: s['id'] for s in sens}
    comm, member, byname = committees(cpath, mpath)
    hv = parse_votes(HERE / 'recent_votes/house-119-2.txt', 'house', senate_ids)
    sv = parse_votes(HERE / 'recent_votes/senate-119-2.txt', 'senate', senate_ids)
    horder = [m['id'] for m in reps]
    sorder = [s['id'] for s in sens]
    pack_casts(hv, horder)
    pack_casts(sv, sorder)
    U = json.loads((ROOT / 'tools/get-involved/upcoming.json').read_text(encoding='utf-8'))
    S = json.loads((ROOT / 'tools/get-involved/states.json').read_text(encoding='utf-8'))
    up = upcoming(U, byname)
    # Each bill's official summary from the weekly list, so a past vote on a listed bill can say what the bill does.
    bills = {bill_key(b['number']): {'title': b['title'], 'summary': (b.get('summary') or {}).get('text', ''),
                                     'summaryOf': (b.get('summary') or {}).get('version', ''),
                                     'committees': [byname[c.lower()] for c in b.get('committees', []) if c.lower() in byname],
                                     'sponsor': (b.get('sponsor') or {}).get('bioguide', '')}
             for b in U.get('bills', [])}
    states = {}
    for st, name in STATE_NAMES.items():
        slug = re.sub(r'[^a-z]+', '-', name.lower()).strip('-')
        page = '/get-involved/states/%s.html' % slug
        row = {'name': name}
        if (ROOT / ('site' + page)).exists():
            row['page'] = page
        s = (S.get('states') or {}).get(st) or {}
        for k in ('leg', 'elections', 'local', 'elections_note', 'elections_src'):
            if s.get(k):
                row[k] = s[k]
        if (ROOT / ('site/lookup/local/%s.json' % st.lower())).exists():
            row['localData'] = '/lookup/local/%s.json' % st.lower()
        states[st] = row
    topics = json.loads((HERE / 'topics.json').read_text(encoding='utf-8'))['groups']
    data = {
        'built': datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        'checked': {'committees': 'congress-legislators, read %s' % datetime.now(timezone.utc).strftime('%B %-d, %Y'),
                    'upcoming': U.get('checked', ''), 'states': S.get('checked', '')},
        'committees': comm, 'member': member,
        'order': {'house': horder, 'senate': sorder},
        'votes': hv + sv, 'bills': bills, 'upcoming': up, 'states': states, 'topics': topics,
    }
    body = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    OUT.write_text('/* Built by tools/contact-senator/build_fit.py. Do not edit by hand. */\nwindow.CS_FIT=' + body + ';\n', encoding='utf-8')
    print('wrote %s: %d committees, %d members with committees, %d House votes, %d Senate votes, %d upcoming items, %d KB'
          % (OUT.relative_to(ROOT), len(comm), len(member), len(hv), len(sv), len(up), len(body) // 1024))


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
