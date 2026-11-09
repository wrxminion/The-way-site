#!/usr/bin/env python3
"""Money Trail: read the FEC bulk files and pick the records for the Money web. Standard library only, no API key.

Usage (from the repo root, or anywhere):
  python3 -I tools/money-trail/fec_bulk.py BULK_DIR OUT.json [--download] [--depth 25]
         [--min-receipts 1] [--min-ie 1] [--min-candidate 1] [--main-receipts 5000000] [--main-ie 1000000] [--main-candidate 5000000]

BULK_DIR holds the FEC 2025-2026 bulk files (https://www.fec.gov/data/browse-data/?tab=bulk-data):
  cm26.zip (committees), cn26.zip (candidates), webk26.zip (committee totals), indiv26.zip (receipts),
  weball26.zip (candidate totals), oth26.zip (committee to committee), pas226.zip (to candidates, independent expenditures),
  oppexp26.zip (operating expenses), independent_expenditure_2026.csv (24 and 48 hour reports).
--download fetches any file that is missing or changed (it compares the size the FEC server reports).

Which committees (the same rule for every side and every party, nobody is picked by hand except the ALWAYS list).
By default (Nov 2026, D262) that is every committee that reported money this cycle:
  - every committee that is not a candidate's own campaign (party, super PAC, hybrid PAC, PAC) with at least
    --min-receipts dollars of total receipts this cycle in the FEC totals file (webk26);
  - every independent expenditure filer that is not a committee (for example a 501(c)(4), FEC IDs C9...)
    with at least --min-ie dollars of independent expenditures in the 2026 file;
  - the main campaign committee of every candidate with at least --min-candidate dollars of total receipts this cycle
    (FEC candidate totals file, weball26), every party and every office alike (0 or less leaves candidates out);
  - the ALWAYS list below, so a group already on the site or asked for by name is never dropped.
Use --min-receipts 5000000 --min-ie 1000000 --min-candidate 0 for the older, smaller pull (D258).
Each committee is marked layer "main" or "more". Main (loaded with the Money Trail page): committees that are not a
candidate's campaign with at least --main-receipts in receipts, independent expenditure filers with at least --main-ie,
candidate campaigns with at least --main-candidate, and the ALWAYS list. More: every other committee; add_fec_batch.py
writes those to small files that the page loads only when someone searches for or opens that committee.
For every committee picked, the same depth:
  - its --depth largest itemized receipts from groups (contributions and transfers; individuals never kept),
  - its --depth largest payments (operating expenses, money to other committees and candidates; refunds left out),
  - its --depth largest independent expenditures (money spent for or against a candidate, with who was paid).
Individuals are never saved: entity types IND and CAN are dropped while reading, and a person who files independent
expenditures under a C9 ID (name written "LAST, FIRST") is not picked.
The result (OUT.json) is read by add_fec_batch.py.
"""
import csv, datetime, heapq, io, json, os, re, sys, urllib.request, zipfile

args, opts = [], {'--min-receipts': 1.0, '--min-ie': 1.0, '--min-candidate': 1.0, '--depth': 25,
                  '--main-receipts': 5000000.0, '--main-ie': 1000000.0, '--main-candidate': 5000000.0}
flags = set()
_a = iter(sys.argv[1:])
for x in _a:
    if x in opts:
        opts[x] = type(opts[x])(next(_a))
    elif x.startswith('--'):
        flags.add(x)
    else:
        args.append(x)
if len(args) != 2:
    sys.exit(__doc__)
BULK, OUT = args
DEPTH = int(opts['--depth'])
os.makedirs(BULK, exist_ok=True)

# Always pulled, whatever the totals say: the groups already on the Money web and the ones asked for by name.
ALWAYS = {
    # Democratic-aligned (batches 1 to 3)
    'C00484642', 'C00495028', 'C00669259', 'C00000935', 'C00042366', 'C00010603', 'C00492140', 'C00495861',
    'C00193433', 'C00486845', 'C00004036',
    # Republican-aligned (the planned Republican batch)
    'C00571703', 'C00504530', 'C00892471', 'C00003418', 'C00075820', 'C00027466', 'C00487470', 'C00687103',
    'C00559740', 'C00571588',
    # Turning Point PAC Inc. (hybrid PAC) and Turning Point Action (independent expenditure filer, the 501(c)(4))
    'C00814152', 'C90019597',
    # Cross-party
    'C00835959',
}
NEVER = {'C00530766'}  # Women Speak Out PAC: was in the old pull list by mistake (wrong ID for Women Vote)

FILES = ['cm26.zip', 'cn26.zip', 'webk26.zip', 'weball26.zip', 'pas226.zip', 'oth26.zip', 'oppexp26.zip', 'indiv26.zip',
         'independent_expenditure_2026.csv']
HOSTS = ['https://www.fec.gov/files/bulk-downloads/2026/',
         'https://cg-519a459a-0ea3-42c2-b7bc-fa1143481f74.s3-us-gov-west-1.amazonaws.com/bulk-downloads/2026/']
UA = {'User-Agent': 'Michi Institute Money Trail (michiinstitute.com)'}
meta = {}


def fetch(name):
    p = os.path.join(BULK, name)
    last = None
    for host in HOSTS:
        try:
            with urllib.request.urlopen(urllib.request.Request(host + name, headers=UA), timeout=900) as r:
                size = r.headers.get('Content-Length') or ''
                meta[name] = {'url': HOSTS[0] + name, 'last_modified': r.headers.get('Last-Modified'), 'bytes': size}
                if os.path.exists(p) and str(os.path.getsize(p)) == size:
                    return
                with open(p + '.part', 'wb') as f:
                    while True:
                        b = r.read(1 << 20)
                        if not b:
                            break
                        f.write(b)
                os.replace(p + '.part', p)
                print('downloaded', name, os.path.getsize(p), flush=True)
                return
        except Exception as e:  # try the next host
            last = e
    sys.exit(f'could not download {name}: {last}')


for f in FILES:
    if '--download' in flags:
        fetch(f)
    elif not os.path.exists(os.path.join(BULK, f)):
        sys.exit(f'missing {f} in {BULK} (add --download)')
    meta.setdefault(f, {'url': HOSTS[0] + f, 'last_modified': datetime.datetime.fromtimestamp(
        os.path.getmtime(os.path.join(BULK, f)), datetime.timezone.utc).strftime('%a, %d %b %Y %H:%M:%S GMT'),
        'bytes': str(os.path.getsize(os.path.join(BULK, f)))})


def rows(name, member=None, skip=None):
    with zipfile.ZipFile(os.path.join(BULK, name)) as z:
        for n in z.namelist():
            if not n.lower().endswith('.txt') or (member and n != member):
                continue
            with z.open(n) as fh:
                for line in io.TextIOWrapper(fh, encoding='latin-1', newline=''):
                    if skip and skip(line):
                        continue
                    yield line.rstrip('\r\n').split('|')


def d8(s):  # MMDDYYYY -> YYYY-MM-DD
    s = re.sub(r'\D', '', s or '')
    return s[4:8] + '-' + s[0:2] + '-' + s[2:4] if len(s) == 8 else ''


MON = {m: i + 1 for i, m in enumerate('JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split())}


def dmy(s):  # 16-MAY-26 -> 2026-05-16
    m = re.match(r'^(\d{1,2})-([A-Z]{3})-(\d{2,4})$', (s or '').strip().upper())
    if not m or m.group(2) not in MON:
        return ''
    y = int(m.group(3)); y = y + 2000 if y < 100 else y
    return f'{y:04d}-{MON[m.group(2)]:02d}-{int(m.group(1)):02d}'


def money(s):
    try:
        return round(float(s), 2)
    except (TypeError, ValueError):
        return None


def img_url(img):
    return f'https://docquery.fec.gov/cgi-bin/fecimg/?{img}' if re.match(r'^\d{11,18}$', img or '') else ''


TYPE_FULL = {'X': 'Party - Nonqualified', 'Y': 'Party - Qualified', 'Z': 'National Party Nonfederal Account',
             'N': 'PAC - Nonqualified', 'Q': 'PAC - Qualified', 'O': 'Super PAC (Independent Expenditure-Only)',
             'U': 'Single-candidate independent expenditure', 'V': 'Hybrid PAC (with Non-Contribution Account) - Nonqualified',
             'W': 'Hybrid PAC (with Non-Contribution Account) - Qualified', 'I': 'Independent expenditor (person or group)',
             'C': 'Communication cost', 'E': 'Electioneering communication', 'D': 'Delegate committee',
             'H': 'House', 'S': 'Senate', 'P': 'Presidential'}

# ---------- committees, candidates, totals ----------
cm = {}
for r in rows('cm26.zip'):
    if len(r) >= 15:
        cm[r[0]] = {'name': r[1], 'state': r[6], 'designation': r[8], 'type': r[9], 'party': r[10], 'org_type': r[12],
                    'connected_org': r[13], 'cand_id': r[14]}
cn = {}
for r in rows('cn26.zip'):
    if len(r) >= 10:
        cn[r[0]] = {'name': r[1], 'party': r[2], 'year': r[3], 'state': r[4], 'office': r[5], 'district': r[6], 'pcc': r[9]}
totals = {}
for r in rows('webk26.zip'):
    if len(r) >= 27:
        totals[r[0]] = {'name': r[1], 'type': r[2], 'receipts': money(r[5]) or 0, 'disbursements': money(r[12]) or 0,
                        'independent_expenditures': money(r[23]) or 0, 'through': d8(r[26]) if '/' not in r[26] else
                        (r[26][6:10] + '-' + r[26][0:2] + '-' + r[26][3:5])}

# candidate totals (weball26): CAND_ID NAME ICI PTY_CD PARTY TTL_RECEIPTS TRANS_FROM_AUTH TTL_DISB ... CVG_END_DT (27)
cand_tot = {}
for r in rows('weball26.zip'):
    if len(r) >= 28:
        cand_tot[r[0]] = {'receipts': money(r[5]) or 0, 'disbursements': money(r[7]) or 0,
                          'through': r[27][6:10] + '-' + r[27][0:2] + '-' + r[27][3:5] if '/' in r[27] else d8(r[27])}

# independent expenditure file (24 and 48 hour reports, also C9 filers that are not committees)
ie_csv = []
with open(os.path.join(BULK, 'independent_expenditure_2026.csv'), encoding='latin-1', newline='') as fh:
    for x in csv.DictReader(fh):
        ie_csv.append({(k or '').strip().lower(): (v or '').strip() for k, v in x.items() if k})
ie_tot = {}
for x in ie_csv:
    ie_tot[x.get('spe_id', '')] = ie_tot.get(x.get('spe_id', ''), 0) + (money(x.get('exp_amo')) or 0)

pick = {}
for cid, t in totals.items():
    if t['type'] in ('H', 'S', 'P') or cid in NEVER:
        continue
    if t['receipts'] >= opts['--min-receipts']:
        pick[cid] = 'receipts of at least $' + format(int(opts['--min-receipts']), ',')
ORG_WORD = re.compile(r'\b(INC|LLC|PAC|FUND|COMMITTEE|COMM|ASSOC|ASSOCIATION|UNION|COUNCIL|PARTY|CAUCUS|CHURCH|PROJECT|'
                      r'FOUNDATION|TRUST|CAMPAIGN|NETWORK|ACTION|LEAGUE|COALITION|CORP|CORPORATION|SOCIETY|CENTER|ALLIANCE|'
                      r'AMERICA|LOCAL|LLP|LP|CO|COMPANY|GROUP|MEDIA|BANK|SERVICES|STRATEGIES|PARTNERS)\b', re.I)


def looks_person(name):  # filings write a person as "LAST, FIRST"
    parts = str(name or '').split(',')
    return len(parts) == 2 and not ORG_WORD.search(name) and all(p.strip() and len(p.strip().split()) <= 3 for p in parts)


people_ie = set()  # a person can file independent expenditures under a C9 ID: people are never kept
ie_name = {x.get('spe_id', ''): x.get('spe_nam', '') for x in ie_csv}
for cid, tot in ie_tot.items():
    nm = (cm.get(cid) or {}).get('name') or ie_name.get(cid, '')
    if cid.startswith('C9') and looks_person(nm):
        people_ie.add(cid)
for cid, tot in ie_tot.items():
    if cid in people_ie:
        continue
    if cid.startswith('C9') and tot >= opts['--min-ie'] and cid not in NEVER:
        pick.setdefault(cid, 'independent expenditures of at least $' + format(int(opts['--min-ie']), ','))
cand_of = {}  # campaign committee -> candidate
if opts['--min-candidate'] > 0:
    for cand, t in cand_tot.items():
        pcc = (cn.get(cand) or {}).get('pcc') or ''
        if re.match(r'^C\d{8}$', pcc) and pcc not in NEVER and t['receipts'] >= opts['--min-candidate']:
            cand_of[pcc] = cand
            if pcc not in totals or totals[pcc]['type'] in ('H', 'S', 'P'):
                totals[pcc] = {'name': (cm.get(pcc) or {}).get('name') or cn[cand]['name'], 'type': (cm.get(pcc) or {}).get('type') or cand[0],
                               'receipts': t['receipts'], 'disbursements': t['disbursements'], 'independent_expenditures': 0,
                               'through': t['through']}
            pick.setdefault(pcc, 'candidate campaign with receipts of at least $' + format(int(opts['--min-candidate']), ','))
for cid in ALWAYS:
    pick.setdefault(cid, 'named on the Money Trail list')
print('committees picked', len(pick), ' people left out (C9 filers):', len(people_ie), flush=True)

# ---------- keep the largest N per committee and kind ----------
heaps = {}  # (cid, kind) -> heap of (amount, sub_id, row)
seen_sub = set()


def keep(cid, kind, amount, sub, row):
    if not amount or amount <= 0 or not sub or sub in seen_sub:
        return
    seen_sub.add(sub)
    h = heaps.setdefault((cid, kind), [])
    item = (amount, sub, row)
    if len(h) < DEPTH:
        heapq.heappush(h, item)
    elif item > h[0]:
        heapq.heapreplace(h, item)


# Receipt transaction types kept: contributions (10, 11, 13, 15, 15C, 15E, 15Z, 18K, 18U, party accounts 30-32) and
# transfers from affiliated committees (18G). Memo shares (15J, 18J), loans (16), offsets (17), refunds (20, 22) are not.
REC_CONTRIB = re.compile(r'^(10|11|13|15|15C|15E|15Z|18K|18U|30|30K|30T|31|31K|31T|32|32K|32T)$')
REC_TRANSFER = re.compile(r'^(18G|30G|31G|32G)$')
REC_LABEL = {'10': 'Contribution to a super PAC account', '11': 'Contribution from a tribe', '13': 'Inaugural donation',
             '15': 'Contribution', '15C': 'Contribution from the candidate', '15E': 'Earmarked contribution',
             '15Z': 'In-kind contribution from a registered filer', '18K': 'Contribution from a registered committee',
             '18U': 'Contribution from an unregistered committee', '18G': 'Transfer from an affiliated committee'}


def rec_line(tp):
    if REC_CONTRIB.match(tp):
        return '11'
    if REC_TRANSFER.match(tp):
        return '12'
    return ''


def receipt(r, src):
    # itcont / itoth: CMTE_ID AMNDT RPT_TP PGI IMAGE TRAN_TP ENTITY NAME CITY ST ZIP EMP OCC DATE AMT OTHER_ID TRAN_ID FILE MEMO MEMO_TEXT SUB_ID
    if len(r) < 21 or r[0] not in pick or r[6] in ('IND', 'CAN') or r[18] == 'X':  # people (and candidates) are never kept
        return
    line = rec_line(r[5])
    if not line:
        return
    keep(r[0], 'receipts', money(r[14]), r[20], {
        'sub_id': r[20], 'transaction_id': r[16], 'image_number': r[4], 'pdf_url': img_url(r[4]), 'file_number': r[17],
        'line_number': line, 'line_number_label': REC_LABEL.get(r[5], 'Contribution or transfer') + f' (transaction type {r[5]})',
        'report_type': r[2], 'report_year': '', 'amendment_indicator': r[1], 'memo_code': r[18], 'memo_text': r[19],
        'entity_type': r[6], 'contributor_name': r[7], 'contributor_id': r[15] if re.match(r'^C\d{8}$', r[15]) else '',
        'contributor_committee_name': (cm.get(r[15]) or {}).get('name', ''),
        'contributor_city': r[8], 'contributor_state': r[9], 'contribution_receipt_date': d8(r[13]),
        'contribution_receipt_amount': money(r[14]), 'receipt_type': r[5], 'committee_id': r[0],
        'two_year_transaction_period': '2026', 'bulk_file': src})


def payment(cid, sub, amount, row):
    if row.get('entity_type') == 'CAN' and not row.get('recipient_committee_id'):
        return  # paid to a candidate as a person (for example a reimbursement): people are never kept
    keep(cid, 'disbursements', amount, sub, row)


ie_seen = set()  # (spender, tran_id) already read from the periodic reports


def ie_row(cid, sub, amount, cand, sup_opp, payee, purpose, date, image, file_num, tran, amnd, rpt, src):
    c = cn.get(cand) or {}
    pcc = c.get('pcc') or ''
    keep(cid, 'independent_expenditures', amount, sub, {
        'sub_id': sub, 'transaction_id': tran, 'image_number': image, 'pdf_url': img_url(image), 'file_number': file_num,
        'line_number': '24', 'report_type': rpt, 'amendment_indicator': amnd, 'committee_id': cid,
        'candidate_id': cand, 'candidate_name': c.get('name') or '', 'candidate_party': c.get('party') or '',
        'candidate_office': c.get('office') or '', 'candidate_office_state': c.get('state') or '',
        'candidate_office_district': c.get('district') or '', 'candidate_committee_id': pcc,
        'candidate_committee_name': (cm.get(pcc) or {}).get('name') or '',
        'support_oppose_indicator': sup_opp, 'payee_name': payee, 'expenditure_description': purpose,
        'expenditure_date': date, 'expenditure_amount': amount, 'two_year_transaction_period': '2026', 'bulk_file': src})


print('reading pas226 (to candidates, independent expenditures)', flush=True)
for r in rows('pas226.zip'):
    # CMTE_ID AMNDT RPT_TP PGI IMAGE TRAN_TP ENTITY NAME CITY ST ZIP EMP OCC DATE AMT OTHER_ID CAND_ID TRAN_ID FILE MEMO MEMO_TEXT SUB_ID
    if len(r) < 22 or r[0] not in pick or r[19] == 'X':
        continue
    amt = money(r[14])
    if r[5] in ('24A', '24E'):
        ie_seen.add((r[0], r[17]))
        ie_row(r[0], r[21], amt, r[16], 'O' if r[5] == '24A' else 'S', r[7], r[20], d8(r[13]), r[4], r[18], r[17], r[1], r[2], 'pas226')
        continue
    if r[6] == 'IND':
        continue
    # 24K / 24Z go to a committee (OTHER_ID, else the candidate's own committee). 24C, 24F and 24N are spent on a
    # candidate's behalf and paid to a vendor: the vendor stays the payee, and the candidate is named in the description.
    rid = ''
    if r[5] in ('24K', '24Z'):
        rid = r[15] if re.match(r'^C\d{8}$', r[15]) else (cn.get(r[16]) or {}).get('pcc', '')
    cand_txt = (cn.get(r[16]) or {}).get('name', '') if r[5] not in ('24K', '24Z') else ''
    payment(r[0], r[21], amt, {
        'sub_id': r[21], 'transaction_id': r[17], 'image_number': r[4], 'pdf_url': img_url(r[4]), 'file_number': r[18],
        'line_number': '23' if r[5] in ('24K', '24Z') else '25' if r[5] == '24C' else '', 'report_type': r[2],
        'line_number_label': {'24K': 'Contribution to a candidate committee', '24Z': 'In-kind contribution to a candidate committee',
                              '24C': 'Coordinated party expenditure', '24F': 'Communication cost', '24N': 'Communication cost against'}.get(r[5], 'Payment') + f' (transaction type {r[5]})',
        'amendment_indicator': r[1], 'memo_code': r[19], 'memo_text': r[20], 'entity_type': r[6], 'recipient_name': r[7],
        'recipient_committee_id': rid,
        'recipient_committee_name': (cm.get(rid) or {}).get('name', ''),
        'recipient_city': r[8], 'recipient_state': r[9], 'disbursement_date': d8(r[13]), 'disbursement_amount': amt,
        'disbursement_description': ((r[20] or '').strip() + (' (for candidate ' + cand_txt + ')' if cand_txt else '')).strip(),
        'disbursement_type': r[5], 'candidate_id': r[16],
        'committee_id': r[0], 'two_year_transaction_period': '2026', 'bulk_file': 'pas226'})

print('reading independent_expenditure_2026.csv (24 and 48 hour reports)', flush=True)
latest = {}
for x in ie_csv:
    k = (x.get('spe_id', ''), x.get('tran_id', ''))
    if k[0] not in pick or k in ie_seen:
        continue
    if k not in latest or (x.get('file_num') or '0') > (latest[k].get('file_num') or '0'):
        latest[k] = x
for (cid, tran), x in latest.items():
    amt = money(x.get('exp_amo'))
    sub = 'IE' + (x.get('file_num') or '') + '-' + re.sub(r'[^A-Za-z0-9.]', '', tran)
    ie_row(cid, sub, amt, x.get('cand_id', ''), x.get('sup_opp', ''), x.get('pay', ''), x.get('pur', ''),
           dmy(x.get('exp_date')) or dmy(x.get('dissem_dt')), x.get('image_num', ''), x.get('file_num', ''), tran,
           x.get('amndt_ind', ''), '24/48 hour report', 'independent_expenditure_2026')

print('reading oth26 (committee to committee)', flush=True)
for r in rows('oth26.zip', skip=lambda ln: '|IND|' in ln):
    if len(r) < 21 or r[0] not in pick or r[18] == 'X':
        continue
    if r[5].startswith('1'):
        receipt(r, 'oth26')
    elif r[5].startswith('2') and not r[5].startswith('22') and r[5] not in ('24A', '24E') and r[6] != 'IND':
        amt = money(r[14])
        payment(r[0], r[20], amt, {
            'sub_id': r[20], 'transaction_id': r[16], 'image_number': r[4], 'pdf_url': img_url(r[4]), 'file_number': r[17],
            'line_number': '22' if r[5] == '24G' else '23', 'report_type': r[2], 'amendment_indicator': r[1],
            'line_number_label': {'24G': 'Transfer to an affiliated committee', '24K': 'Contribution to a committee',
                                  '24T': 'Earmarked contribution passed on', '24Z': 'In-kind contribution to a committee'}.get(r[5], 'Payment to a committee') + f' (transaction type {r[5]})',
            'memo_code': r[18], 'memo_text': r[19], 'entity_type': r[6], 'recipient_name': r[7],
            'recipient_committee_id': r[15] if re.match(r'^C\d{8}$', r[15]) else '', 'recipient_city': r[8],
            'recipient_committee_name': (cm.get(r[15]) or {}).get('name', ''),
            'recipient_state': r[9], 'disbursement_date': d8(r[13]), 'disbursement_amount': amt,
            'disbursement_description': (r[19] or '').strip(), 'disbursement_type': r[5], 'committee_id': r[0],
            'two_year_transaction_period': '2026', 'bulk_file': 'oth26'})

print('reading oppexp26 (operating expenses)', flush=True)
for r in rows('oppexp26.zip'):
    # CMTE_ID AMNDT RPT_YR RPT_TP IMAGE LINE FORM SCHED NAME CITY ST ZIP DATE AMT PGI PURPOSE CAT CAT_DESC MEMO MEMO_TEXT ENTITY SUB_ID FILE TRAN_ID BACK_REF
    if len(r) < 24 or r[0] not in pick or r[18] == 'X' or r[20] in ('IND', 'CAN') or r[5].upper().lstrip('SB').startswith('28'):
        continue
    amt = money(r[13])
    payment(r[0], r[21], amt, {
        'sub_id': r[21], 'transaction_id': r[23], 'image_number': r[4], 'pdf_url': img_url(r[4]), 'file_number': r[22],
        'filing_form': r[6], 'line_number': r[5].upper().lstrip('SB') or r[5], 'line_number_label': r[17] or '',
        'report_type': r[3], 'report_year': r[2], 'amendment_indicator': r[1], 'memo_code': r[18], 'memo_text': r[19],
        'entity_type': r[20], 'recipient_name': r[8], 'recipient_committee_id': '', 'recipient_city': r[9],
        'recipient_state': r[10], 'disbursement_date': d8(r[12]), 'disbursement_amount': amt,
        'disbursement_description': r[15], 'disbursement_purpose_category': r[17], 'committee_id': r[0],
        'two_year_transaction_period': '2026', 'bulk_file': 'oppexp26'})

print('reading indiv26 (receipts; individuals skipped while reading, this is the big one)', flush=True)
n = 0
for r in rows('indiv26.zip', member='itcont.txt', skip=lambda ln: '|IND|' in ln):
    n += 1
    receipt(r, 'indiv26')
print('non-individual receipt rows read', n, flush=True)

# ---------- write ----------
now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
out = []
for cid, why in sorted(pick.items(), key=lambda kv: -(totals.get(kv[0], {}).get('receipts') or ie_tot.get(kv[0], 0))):
    c = cm.get(cid) or {}
    t = totals.get(cid) or {}
    got = {k: [x[2] for x in sorted(heaps.get((cid, k), []), reverse=True)]
           for k in ('receipts', 'disbursements', 'independent_expenditures')}
    t0 = totals.get(cid) or {}
    if cid in ALWAYS:
        layer = 'main'
    elif cid in cand_of:
        layer = 'main' if (t0.get('receipts') or 0) >= opts['--main-candidate'] else 'more'
    else:
        layer = 'main' if ((t0.get('receipts') or 0) >= opts['--main-receipts'] or
                           (cid.startswith('C9') and ie_tot.get(cid, 0) >= opts['--main-ie'])) else 'more'
    if layer == 'main' and why.startswith('receipts of at least'):
        why = 'receipts of at least $' + format(int(opts['--main-receipts']), ',')
    elif layer == 'main' and why.startswith('candidate campaign'):
        why = 'candidate campaign with receipts of at least $' + format(int(opts['--main-candidate']), ',')
    elif layer == 'main' and why.startswith('independent expenditures'):
        why = 'independent expenditures of at least $' + format(int(opts['--main-ie']), ',')
    out.append({'committee_id': cid, 'layer': layer, 'committee_name': c.get('name') or t.get('name') or cid,
                'committee_type': c.get('type') or t.get('type') or '', 'committee_type_full': TYPE_FULL.get(c.get('type') or t.get('type') or '', ''),
                'party': c.get('party') or '', 'connected_org': c.get('connected_org') or '', 'state': c.get('state') or '',
                'candidate': ({'id': cand_of[cid], 'name': cn[cand_of[cid]]['name'], 'party': cn[cand_of[cid]]['party'],
                               'office': cn[cand_of[cid]]['office'], 'state': cn[cand_of[cid]]['state'],
                               'district': cn[cand_of[cid]]['district']} if cid in cand_of else None),
                'why': why, 'totals': {'receipts': t.get('receipts'), 'disbursements': t.get('disbursements'),
                                       'independent_expenditures': t.get('independent_expenditures') or round(ie_tot.get(cid, 0), 2),
                                       'through': t.get('through')},
                'receipts_request': 'fec bulk', 'disbursements_request': 'fec bulk',
                'receipts_retrieved': now, 'disbursements_retrieved': now, **got})
res = {'source': 'fec_bulk', 'retrieved': now, 'files': meta, 'depth': DEPTH,
       'rule': {'min_receipts': opts['--min-receipts'], 'min_ie': opts['--min-ie'], 'min_candidate': opts['--min-candidate'],
                'main_receipts': opts['--main-receipts'], 'main_ie': opts['--main-ie'], 'main_candidate': opts['--main-candidate'], 'always': sorted(ALWAYS), 'never': sorted(NEVER)},
       'committees': out}
with open(OUT + '.part', 'w', encoding='utf-8') as f:
    json.dump(res, f)
os.replace(OUT + '.part', OUT)
print('wrote', OUT, os.path.getsize(OUT), 'committees', len(out), flush=True)
