# Adds FEC filing records (OpenFEC Schedule A receipts and Schedule B disbursements) to the Money Trail.
# Writes site/money-trail/fec-data.js and bumps its ?v= stamp in site/money-trail/index.html.
#
# Usage (from the repo root):
#   python3 -I tools/money-trail/add_fec_batch.py site INPUT [INPUT ...]
# Each INPUT is a fec_pull_results*.json file from fec_pull.py, a folder of its cache/*.json files,
# or a zip of that cache. Run it again with each new batch: records already in fec-data.js are kept,
# new ones are added, and the same FEC sub_id is never added twice. data.js is not changed.
#
# Rules (the same for every committee, whatever its side):
# - Individuals are never saved: entity_type IND is dropped, and so is any name written "LAST, FIRST".
# - Memo lines (memo_code X) are skipped, because they repeat money already counted on another line.
# - Receipts: only FEC lines 11 and 12 (contributions and transfers). Lines 15 to 17 are refunds,
#   interest and other receipts, not money given by a group.
# - Disbursements: line 28 (refunds of contributions) is skipped.
# - A committee from a cache folder is added only when both its receipts and its disbursements are there.
# - Entity IDs stay distinct: a committee is fec:<FEC ID>; a payee or donor with no FEC ID is
#   fecname:<NAME>_<STATE>, never merged with archive records that have the same name.
import glob, io, json, os, re, sys, zipfile
from collections import Counter
from urllib.parse import urlparse, parse_qs

# --skip CID leaves a committee out (for example a wrong ID in the pull list). It is also removed from
# fec-data.js if an earlier batch added it.
argv, SKIP = [], set()
_a = iter(sys.argv[1:])
for _x in _a:
    if _x == '--skip':
        SKIP.add(next(_a))
    else:
        argv.append(_x)
if len(argv) < 2:
    sys.exit('usage: add_fec_batch.py site INPUT [INPUT ...] [--skip CID ...]')
site = argv[0].rstrip('/') + '/'
OUT = site + 'money-trail/fec-data.js'
INDEX = site + 'money-trail/index.html'

# FEC registers some committees by initials only. The FEC name stays first; the long form helps readers.
READABLE = {
    'C00484642': 'SMP (SENATE MAJORITY PAC)',
    'C00495028': 'HMP (HOUSE MAJORITY PAC)',
    'C00669259': 'FF PAC (FUTURE FORWARD)',
    'C00000935': 'DCCC (DEMOCRATIC CONGRESSIONAL CAMPAIGN COMMITTEE)',
    'C00042366': 'DSCC (DEMOCRATIC SENATORIAL CAMPAIGN COMMITTEE)',
    'C00492140': 'AB PAC (AMERICAN BRIDGE)',
    'C00075820': 'NRCC (NATIONAL REPUBLICAN CONGRESSIONAL COMMITTEE)',
    'C00027466': 'NRSC (NATIONAL REPUBLICAN SENATORIAL COMMITTEE)',
}
ENTITY_TYPE = {'PAC': 'Political committee (FEC)', 'CCM': 'Candidate committee (FEC)', 'PTY': 'Party committee (FEC)',
               'COM': 'Committee (FEC)', 'ORG': 'Organization (as named on an FEC filing)', 'CAN': 'Candidate (FEC)'}
ORG_WORD = re.compile(r'\b(INC|LLC|PAC|FUND|COMMITTEE|COMM|ASSOC|ASSOCIATION|UNION|COUNCIL|PARTY|CAUCUS|CHURCH|PROJECT|'
                      r'FOUNDATION|TRUST|CAMPAIGN|NETWORK|ACTION|LEAGUE|COALITION|CORP|CORPORATION|SOCIETY|CENTER|ALLIANCE|'
                      r'AMERICA|LOCAL|LLP|LP|CO|COMPANY|GROUP|MEDIA|BANK|SERVICES|STRATEGIES|PARTNERS)\b', re.I)


def looks_person(name):
    parts = str(name or '').split(',')
    return len(parts) == 2 and not ORG_WORD.search(name) and all(p.strip() and len(p.strip().split()) <= 3 for p in parts)


def slug(s):
    return re.sub(r'[^A-Z0-9]+', '_', str(s or '').upper()).strip('_')


def https(url):
    return url if isinstance(url, str) and re.match(r'^https://[^\s<>"\']+$', url) else ''


# ---------- read the inputs into {committee_id: {name, type, receipts, disbursements, retrieved}} ----------
pulled = {}


def add_committee(cid, name, ctype, sched, rows, retrieved):
    c = pulled.setdefault(cid, {'name': None, 'type': None, 'receipts': None, 'disbursements': None, 'retrieved': '', 'failed': set()})
    c['name'] = c['name'] or name
    c['type'] = c['type'] or ctype
    if c[sched] is None or len(rows) > len(c[sched]):
        c[sched] = rows
    c['retrieved'] = max(c['retrieved'], retrieved or '')


def read_cache_doc(d):
    req = d.get('_request') or ''
    m = re.match(r'^/schedules/schedule_([ab])/\?(.*)$', req)
    if not m:
        return
    cid = (parse_qs(m.group(2)).get('committee_id') or [''])[0]
    if not re.match(r'^C\d{8}$', cid):
        return
    rows = d.get('results') or []
    name = ctype = None
    for r in rows:
        c = r.get('committee')
        if isinstance(c, dict) and c.get('committee_id') == cid:
            name, ctype = c.get('name'), c.get('committee_type_full')
            break
    add_committee(cid, name, ctype, 'receipts' if m.group(1) == 'a' else 'disbursements', rows, d.get('_retrieved'))


for path in argv[1:]:
    if os.path.isdir(path):
        for f in sorted(glob.glob(os.path.join(path, '**', '*.json'), recursive=True)):
            read_cache_doc(json.load(open(f, encoding='utf-8')))
    elif path.lower().endswith('.zip'):
        with zipfile.ZipFile(path) as z:
            for n in sorted(z.namelist()):
                if n.lower().endswith('.json'):
                    read_cache_doc(json.load(io.TextIOWrapper(z.open(n), encoding='utf-8')))
    else:
        d = json.load(open(path, encoding='utf-8'))
        for c in d.get('committees') or []:
            cid = c.get('committee_id')
            if not cid:
                continue
            first = (c.get('receipts') or c.get('disbursements') or [{}])[0]
            add_committee(cid, c.get('committee_name') or first.get('committee_name'), first.get('committee_type_full'),
                          'disbursements', c.get('disbursements') or [], c.get('disbursements_retrieved'))
            # A schedule whose request failed (for example HTTP 429) has no request recorded: mark it missing.
            for sched, key in (('receipts', 'receipts_request'), ('disbursements', 'disbursements_request')):
                if c.get(key):
                    add_committee(cid, None, None, sched, c.get(sched) or [], c.get(key.replace('request', 'retrieved')))
                else:
                    pulled[cid]['failed'].add(sched)

# ---------- existing state ----------
s = open(site + 'money-trail/data.js', encoding='utf-8').read()
R = json.loads(s[s.index('{'):s.rindex('}') + 1])
archive_tx = {t['transaction_id'] for t in R['transactions']}
archive_names = {e['entity_id']: e['legal_or_reported_name'] for e in R['entities']}

old = {'meta': {}, 'committees': [], 'transactions': [], 'entities': []}
if os.path.exists(OUT):
    t = open(OUT, encoding='utf-8').read()
    m = re.search(r'const FEC_FILINGS=(\{.*?\});\n', t, re.S)
    if m:
        old = json.loads(m.group(1))
tx = {t['transaction_id']: t for t in old['transactions']}
ents = {e['entity_id']: e for e in old['entities']}
committees = {c['committee_id']: c for c in old['committees']}


def display_name(cid, reported):
    if cid in READABLE:
        return READABLE[cid]
    if 'fec:' + cid in archive_names:
        return archive_names['fec:' + cid]
    if 'fec:' + cid in ents:
        return ents['fec:' + cid]['legal_or_reported_name']
    return str(reported or cid).upper().strip()


stats = Counter()
for cid, c in sorted(pulled.items()):
    if cid in SKIP:
        print(f'skip {cid}: --skip'); continue
    missing = sorted(k for k in ('receipts', 'disbursements') if c[k] is None)
    if len(missing) == 2 or (missing and not set(missing) <= c['failed']):
        print(f'skip {cid}: only one of receipts / disbursements is in this batch')
        continue
    if missing:
        print(f'note {cid}: {missing[0]} failed to download in the pull; adding the other schedule only')
        c[missing[0]] = []
    cname = display_name(cid, c['name'])
    committees[cid] = {'committee_id': cid, 'name': cname, 'fec_name': c['name'], 'committee_type': c['type'],
                       'retrieved': c['retrieved'] or committees.get(cid, {}).get('retrieved', ''), 'missing': missing}
    ents['fec:' + cid] = {'entity_id': 'fec:' + cid, 'legal_or_reported_name': cname,
                          'entity_type': c['type'] or 'Political committee (FEC)', 'jurisdiction': 'US',
                          'registry_identifier': 'FEC ' + cid, 'source_url': f'https://www.fec.gov/data/committee/{cid}/',
                          'notes': 'Committee whose FEC filings were pulled for the Money Trail. Records are the largest '
                                   'itemized receipts from groups and the largest disbursements, with the same depth for every committee.'}
    if missing:
        ents['fec:' + cid]['notes'] += (' Its ' + ('receipts' if missing[0] == 'receipts' else 'payments') +
                                        ' did not download in this pull (the FEC data service said too many requests), so only its '
                                        + ('payments' if missing[0] == 'receipts' else 'receipts') + ' are shown for now.')
    for sched, rows in (('a', c['receipts']), ('b', c['disbursements'])):
        for r in rows:
            sub = str(r.get('sub_id') or '')
            line = str(r.get('line_number') or '')
            amt = r.get('contribution_receipt_amount') if sched == 'a' else r.get('disbursement_amount')
            other = r.get('contributor_name') if sched == 'a' else r.get('recipient_name')
            other_id = r.get('contributor_id') if sched == 'a' else r.get('recipient_committee_id')
            if not sub or not amt or amt <= 0:
                stats['skip_empty'] += 1; continue
            if (r.get('entity_type') or '').upper() == 'IND' or looks_person(other):
                stats['skip_individual'] += 1; continue
            if (r.get('memo_code') or '').upper() == 'X':
                stats['skip_memo'] += 1; continue
            if sched == 'a' and not re.match(r'^1[12]', line):
                stats['skip_receipt_line_' + line] += 1; continue
            if sched == 'b' and line.startswith('28'):
                stats['skip_refund_line_28'] += 1; continue
            tid = 'FEC-' + sub
            if tid in archive_tx:
                stats['already_in_archive'] += 1; continue
            if other_id and re.match(r'^C\d{8}$', str(other_id)):
                oid = 'fec:' + other_id
                oname = display_name(other_id, other)
                if oid not in ents:
                    ents[oid] = {'entity_id': oid, 'legal_or_reported_name': oname,
                                 'entity_type': ENTITY_TYPE.get((r.get('entity_type') or '').upper(), 'Committee (FEC)'),
                                 'jurisdiction': 'US', 'registry_identifier': 'FEC ' + other_id,
                                 'source_url': f'https://www.fec.gov/data/committee/{other_id}/',
                                 'notes': 'Named on an FEC filing of a committee in the Money Trail.'}
            else:
                st = (r.get('contributor_state') if sched == 'a' else r.get('recipient_state')) or ''
                oid = 'fecname:' + slug(other) + ('_' + st if st else '')
                oname = str(other).upper().strip()
                if oid not in ents:
                    ents[oid] = {'entity_id': oid, 'legal_or_reported_name': oname,
                                 'entity_type': ('Payee' if sched == 'b' else 'Donor') + ' with no FEC ID (as named on an FEC filing)',
                                 'jurisdiction': 'US', 'registry_identifier': '', 'source_url': '',
                                 'notes': 'Name as written on the filing. A group with the same name elsewhere is not proven to be the same group.'}
            city = (r.get('contributor_city') if sched == 'a' else r.get('recipient_city')) or ''
            st = (r.get('contributor_state') if sched == 'a' else r.get('recipient_state')) or ''
            date = (r.get('contribution_receipt_date') if sched == 'a' else r.get('disbursement_date')) or ''
            date = date[:10]
            desc = r.get('disbursement_description') if sched == 'b' else r.get('receipt_type_full')
            label = r.get('line_number_label') or ''
            note = (f"From the FEC's public data (OpenFEC API, Schedule {sched.upper()}), retrieved {c['retrieved'][:10]}. "
                    + (f'Address on the filing: {city.title()}, {st}. ' if city or st else '')
                    + (f'Description on the filing: {str(desc).strip()}. ' if desc else '')
                    + 'No inference of coordination or misconduct.')
            rec = {'transaction_id': tid,
                   'source_entity_id': oid if sched == 'a' else 'fec:' + cid,
                   'recipient_entity_id': 'fec:' + cid if sched == 'a' else oid,
                   'source_name': oname if sched == 'a' else cname,
                   'recipient_name': cname if sched == 'a' else oname,
                   'amount_usd': round(float(amt), 2), 'transaction_date': date,
                   'date_kind': 'FEC_reported_receipt_date' if sched == 'a' else 'FEC_reported_disbursement_date',
                   'cycle': str(r.get('two_year_transaction_period') or ''), 'jurisdiction': 'US / FEC filing',
                   'activity_type': f'FEC Schedule {sched.upper()} line {line}' + (f': {label}' if label else ''),
                   'filing_url': https(r.get('pdf_url')),
                   'filing_id': f"FEC {r.get('filing_form') or ''} {r.get('file_number') or ''}; {r.get('report_type') or ''} {r.get('report_year') or ''}; sub_id {sub}".replace('  ', ' '),
                   'confidence': 'FEC itemized record as returned by the OpenFEC API',
                   'amendment_status': {'A': 'Filed on an amended report', 'N': 'Filed on a new report'}.get(r.get('amendment_indicator'), ''),
                   'notes': note, 'evidence_tier': 'fec_filing', 'record_kind': 'transaction',
                   'event_date': date, 'event_id': tid, 'fec_committee_id': cid}
            if tid not in tx:
                stats['added'] += 1
            tx[tid] = rec

for cid in SKIP:
    committees.pop(cid, None)
    tx = {k: v for k, v in tx.items() if v['fec_committee_id'] != cid}

# keep only entities a record or a pulled committee uses
used = {t['source_entity_id'] for t in tx.values()} | {t['recipient_entity_id'] for t in tx.values()} | {'fec:' + c for c in committees}
ents = {k: v for k, v in ents.items() if k in used}
txs = sorted(tx.values(), key=lambda t: (t['fec_committee_id'], -t['amount_usd'], t['transaction_id']))
meta = {'source': 'FEC OpenFEC API v1 (api.open.fec.gov), Schedule A and Schedule B',
        'evidence_tier': 'fec_filing', 'records': len(txs), 'entities': len(ents),
        'committees': len(committees), 'updated': max([c['retrieved'] for c in committees.values()] or [''])[:10],
        'method': 'For every committee: its 100 largest itemized receipts from groups and its 100 largest disbursements '
                  'for the 2026 cycle, then memo lines, refunds and individuals removed.'}
data = {'meta': meta, 'committees': sorted(committees.values(), key=lambda c: c['committee_id']),
        'transactions': txs, 'entities': sorted(ents.values(), key=lambda e: e['entity_id'])}
blob = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
js = ('// FEC filing records for the Money Trail. Made by tools/money-trail/add_fec_batch.py; do not edit by hand.\n'
      '// Every record comes from the FEC public data and links to its filing. Individuals are not included.\n'
      f'const FEC_FILINGS={blob};\n'
      '(function(){if(typeof RESEARCH==="undefined")return;'
      'const t=new Set(RESEARCH.transactions.map(x=>x.transaction_id));FEC_FILINGS.transactions.forEach(x=>{if(!t.has(x.transaction_id))RESEARCH.transactions.push(x)});'
      'const e=new Set(RESEARCH.entities.map(x=>x.entity_id));FEC_FILINGS.entities.forEach(x=>{if(!e.has(x.entity_id))RESEARCH.entities.push(x)});'
      'RESEARCH.meta.fec=FEC_FILINGS.meta;RESEARCH.meta.fec_committees=FEC_FILINGS.committees.map(c=>c.name);RESEARCH.meta.fec_missing=FEC_FILINGS.committees.filter(c=>c.missing&&c.missing.length).map(c=>({name:c.name,missing:c.missing}));})();\n')
open(OUT, 'w', encoding='utf-8').write(js)

# bump the cache stamp so browsers load the new batch
h = open(INDEX, encoding='utf-8').read()
stamp = 'f' + str(len(txs))
h2 = re.sub(r'fec-data\.js\?v=[A-Za-z0-9]+', 'fec-data.js?v=' + stamp, h)
if h2 != h:
    open(INDEX, 'w', encoding='utf-8').write(h2)

print('committees:', ', '.join(f"{c['name']} ({c['committee_id']})" for c in data['committees']))
per = Counter(t['fec_committee_id'] for t in txs)
for cid, n in sorted(per.items()):
    print(f'  {cid}: {n} records')
print('records:', len(txs), ' entities:', len(ents), ' stamp:', stamp)
print('this run:', dict(stats))
