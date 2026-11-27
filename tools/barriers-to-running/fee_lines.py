"""List the candidate filing fees that already show in the Money web data.

Reads site/money-trail/fec-data.js and site/money-trail/fec-more/*.json (both made from the FEC bulk files)
and keeps every payment whose FEC purpose says it was a filing, qualifying or ballot fee and whose payee is a
state or local election office. Writes site/get-involved/barriers-to-running/fee-lines.js.
Nothing is added that is not in those files. Run again after the FEC data changes.
"""
import glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MT = os.path.join(ROOT, 'site', 'money-trail')
OUT = os.path.join(ROOT, 'site', 'get-involved', 'barriers-to-running', 'fee-lines.js')

STATES = {'ALABAMA': 'al', 'ALASKA': 'ak', 'ARIZONA': 'az', 'ARKANSAS': 'ar', 'CALIFORNIA': 'ca', 'COLORADO': 'co', 'CONNECTICUT': 'ct',
          'DELAWARE': 'de', 'FLORIDA': 'fl', 'GEORGIA': 'ga', 'HAWAII': 'hi', 'IDAHO': 'id', 'ILLINOIS': 'il', 'INDIANA': 'in', 'IOWA': 'ia',
          'KANSAS': 'ks', 'KENTUCKY': 'ky', 'LOUISIANA': 'la', 'MAINE': 'me', 'MARYLAND': 'md', 'MASSACHUSETTS': 'ma', 'MICHIGAN': 'mi',
          'MINNESOTA': 'mn', 'MISSISSIPPI': 'ms', 'MISSOURI': 'mo', 'MONTANA': 'mt', 'NEBRASKA': 'ne', 'NEVADA': 'nv', 'NEW HAMPSHIRE': 'nh',
          'NEW JERSEY': 'nj', 'NEW MEXICO': 'nm', 'NEW YORK': 'ny', 'NORTH CAROLINA': 'nc', 'NORTH DAKOTA': 'nd', 'OHIO': 'oh', 'OKLAHOMA': 'ok',
          'OREGON': 'or', 'PENNSYLVANIA': 'pa', 'RHODE ISLAND': 'ri', 'SOUTH CAROLINA': 'sc', 'SOUTH DAKOTA': 'sd', 'TENNESSEE': 'tn', 'TEXAS': 'tx',
          'UTAH': 'ut', 'VERMONT': 'vt', 'VIRGINIA': 'va', 'WASHINGTON': 'wa', 'WEST VIRGINIA': 'wv', 'WISCONSIN': 'wi', 'WYOMING': 'wy'}
FEE = re.compile(r'\b(FILING|QUALIFYING|QUALIFICATION|BALLOT ACCESS|BALLOT|CANDIDATE)\s*(FILING\s*)?FEES?\b', re.I)
OFFICE = re.compile(r'SECRETARY OF STATE|SECRETARY OF THE STATE|DEPARTMENT OF STATE|DEPT\.? OF STATE|DIVISION OF ELECTIONS|DIVISIONS OF ELECTIONS|'
                    r'BOARD OF ELECTIONS|ELECTIONS? (BOARD|COMMISSION|DIVISION|OFFICE|DEPARTMENT)|STATE ELECTION|SUPERVISOR OF ELECTIONS|'
                    r'COMMONWEALTH OF|STATE OF |STATE TREASURER|TREASURER OF STATE|SECRETARY OF THE COMMONWEALTH|LIEUTENANT GOVERNOR|DEPARTMENT OF ELECTIONS', re.I)


CAND = {'House': 'House', 'Senate': 'Senate', 'Candidate committee (FEC)': ''}
SKIP = re.compile(r'ANNUAL|LATE|PENALTY|FINE', re.I)


def state_of(name, cand_state):
    up = ' ' + name.upper() + ' '
    for nm in sorted(STATES, key=len, reverse=True):
        if re.search(r'\b' + nm + r'\b', up):
            if nm in ('VIRGINIA', 'KANSAS', 'WASHINGTON') and re.search(r'WEST VIRGINIA|ARKANSAS|WASHINGTON,? DC|DISTRICT OF COLUMBIA', up) and nm != 'WEST VIRGINIA':
                continue
            return STATES[nm]
    return cand_state


def rows_of(D, cmte):
    S, E = D['s'], D['e']
    for r in D['rows']:
        sub, src, rec, amt, day, act, img, fil, amd, nh, npl, nd, cid = r[:13]
        desc = S[nd] if isinstance(nd, int) and 0 <= nd < len(S) else ''
        to = E[S[rec]][0]
        fe = E[S[src]]
        typ = S[fe[1]] if len(fe) > 1 and isinstance(fe[1], int) else ''
        yield dict(sub=sub, frm=fe[0], typ=typ, to=to, amt=amt, day=day, desc=desc, cid=cid, img=img, cs=cmte.get(cid, ''))


def main():
    seen, out = set(), []
    files = [os.path.join(MT, 'fec-data.js')] + sorted(glob.glob(os.path.join(MT, 'fec-more', '[0-9]*.json')))
    for f in files:
        txt = open(f, encoding='utf-8').read()
        if f.endswith('.js'):
            i = txt.index('const FEC_FILINGS=') + len('const FEC_FILINGS=')
            D, _ = json.JSONDecoder().raw_decode(txt, i)
        else:
            D = json.loads(txt)
        if 's' not in D:
            continue
        cmte = {c['committee_id']: c.get('state', '') for c in D.get('committees', [])}
        for x in rows_of(D, cmte):
            if x['typ'] not in CAND or not FEE.search(x['desc']) or SKIP.search(x['desc']) or not OFFICE.search(x['to']) or not x['amt'] or x['amt'] <= 0:
                continue
            if x['sub'] in seen:
                continue
            seen.add(x['sub'])
            st = state_of(x['to'], (x['cs'] or '').lower())
            img = x['img']
            url = ('https://docquery.fec.gov/cgi-bin/fecimg/?' + img) if img and re.match(r'^[0-9]', str(img)) else (img or '')
            out.append([st, x['frm'], x['cid'], CAND[x['typ']], x['to'], x['amt'], x['day'], x['desc'], url])
    out.sort(key=lambda r: (r[0], -r[5], r[1]))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as fh:
        fh.write('// Made by tools/barriers-to-running/fee_lines.py from the Money web FEC files. Do not edit by hand.\n')
        fh.write('// Each row: [state, campaign, FEC committee ID, office (House, Senate or blank), payee as written, amount, date, purpose as written, FEC filing link]\n')
        fh.write('window.BARRIER_FEE_LINES=' + json.dumps(out, separators=(',', ':')) + ';\n')
    print(len(out), 'fee lines;', len({r[0] for r in out}), 'states')


if __name__ == '__main__':
    main()
