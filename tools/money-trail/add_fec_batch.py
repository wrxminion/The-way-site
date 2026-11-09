# Adds FEC filing records to the Money Trail: receipts (Schedule A), payments (Schedule B) and independent
# expenditures (Schedule E, money spent for or against a candidate).
# Writes site/money-trail/fec-data.js and bumps its ?v= stamp in site/money-trail/index.html.
#
# Usage (from the repo root):
#   python3 -I tools/money-trail/add_fec_batch.py site INPUT [INPUT ...] [--skip CID ...]
# Each INPUT is one of:
#   - a fec_bulk*.json file from tools/money-trail/fec_bulk.py (the FEC bulk files, Nov 2026 on). A bulk file is a
#     full snapshot: fec-data.js is rebuilt from it, with the same rule for every committee.
#   - a fec_pull_results*.json file from the older fec_pull.py (OpenFEC API), a folder of its cache/*.json files,
#     or a zip of that cache. These are added to what is already in fec-data.js, and the same FEC sub_id is never
#     added twice.
# data.js is not changed.
#
# Rules (the same for every committee, whatever its side):
# - Individuals are never saved: entity_type IND is dropped, and so is any name written "LAST, FIRST".
# - Memo lines (memo_code X) are skipped, because they repeat money already counted on another line.
# - Receipts: only FEC lines 11 and 12 (contributions and transfers). Lines 15 to 17 are refunds,
#   interest and other receipts, not money given by a group. (fec_bulk.py marks each bulk row 11 or 12 from its
#   FEC transaction type and leaves the rest out.)
# - Payments: line 28 (refunds of contributions) is skipped.
# - Independent expenditures: one line from the group that spent the money to the candidate's own campaign
#   committee, saying "supporting" or "opposing" and who was paid. It is not money given to the candidate.
# - A committee from an API cache folder is added only when both its receipts and its disbursements are there.
# - Entity IDs stay distinct: a committee is fec:<FEC ID>; a payee or donor with no FEC ID is
#   fecname:<NAME>_<STATE>, never merged with archive records that have the same name.
# - A filing line already shown on a media company's dot (media.js, D249) is left out here, so it is not drawn twice.
#
# File format (Nov 2026, to keep the page fast on phones): records are stored as short rows plus one table of
# words, and the end of fec-data.js turns them back into full records in the browser. expand() below does the
# same in Python for the other builders.
import glob, io, json, os, re, sys, zipfile, zlib
from collections import Counter
from urllib.parse import parse_qs

IMG = 'https://docquery.fec.gov/cgi-bin/fecimg/?'
NO_INFERENCE = 'No inference of coordination or misconduct.'
CMTE_NOTE = ('Committee whose FEC filings were pulled for the Money Trail. Records are its largest itemized receipts from '
             'groups, its largest payments and its largest independent expenditures, with the same depth for every committee.')
OTHER_NOTE = 'Named on an FEC filing of a committee in the Money Trail.'
NAME_NOTE = 'Name as written on the filing. A group with the same name elsewhere is not proven to be the same group.'
MORE_NOTE = ("Committee with its own FEC filings on the Money Trail. They load when you open it: search for its name "
             "and pick it under More FEC committees.")
SHARDS = 256  # fec-more/NNN.json files; a committee always lands in the same file (crc32 of its FEC ID)


def shard_of(cid):
    return '%03d' % (zlib.crc32(cid.encode()) % SHARDS)


def expand(F):
    """Turn the compact fec-data.js object back into full records (the same as the JavaScript at the end of the file)."""
    if 'transactions' in F:  # older full format
        return F['transactions'], F['entities']
    S, E, cm = F['s'], F['e'], {c['committee_id'] for c in F['committees']}
    ents = []
    for eid, (name, tp, *more) in E.items():
        c = eid[4:] if eid.startswith('fec:') else ''
        ents.append({'entity_id': eid, 'legal_or_reported_name': name, 'entity_type': S[tp], 'jurisdiction': 'US',
                     'registry_identifier': 'FEC ' + c if c else '', 'source_url': f'https://www.fec.gov/data/committee/{c}/' if c else '',
                     'notes': S[more[0]] if more else (CMTE_NOTE if c in cm else OTHER_NOTE if c else NAME_NOTE)})
    tx = []
    for r in F['rows']:
        sub, src, rec, amt, day, act, img, fil, amd, nh, npl, nd, cid, dk, conf = r
        tid = 'FEC-' + sub
        notes = S[nh] if npl < 0 else (S[nh] + (f'Address on the filing: {S[npl]}. ' if S[npl] else '') +
                                        (f'Description on the filing: {S[nd]}. ' if S[nd] else '') + NO_INFERENCE)
        tx.append({'transaction_id': tid, 'source_entity_id': S[src], 'recipient_entity_id': S[rec],
                   'source_name': E[S[src]][0], 'recipient_name': E[S[rec]][0], 'amount_usd': amt, 'transaction_date': day,
                   'date_kind': S[dk], 'cycle': '2026', 'jurisdiction': 'US / FEC filing', 'activity_type': S[act],
                   'filing_url': (IMG + img) if img and img[0].isdigit() else img,
                   'filing_id': S[-fil - 1] if fil < 0 else S[fil] + '; sub_id ' + sub,
                   'confidence': S[conf], 'amendment_status': S[amd], 'notes': notes, 'evidence_tier': 'fec_filing',
                   'record_kind': 'transaction', 'event_date': day, 'event_id': tid, 'fec_committee_id': cid})
    return tx, ents


def load_fec_js(path):
    t = open(path, encoding='utf-8').read()
    a = t.index('const FEC_FILINGS=') + len('const FEC_FILINGS=')
    return json.JSONDecoder().raw_decode(t[a:])[0]


def main():
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
        'C00571703': 'SLF PAC (SENATE LEADERSHIP FUND)',
        'C00504530': 'CLF (CONGRESSIONAL LEADERSHIP FUND)',
        'C00687103': 'AFP ACTION (AMERICANS FOR PROSPERITY ACTION)',
    }
    ENTITY_TYPE = {'PAC': 'Political committee (FEC)', 'CCM': 'Candidate committee (FEC)', 'PTY': 'Party committee (FEC)',
                   'COM': 'Committee (FEC)', 'ORG': 'Organization (as named on an FEC filing)', 'CAN': 'Candidate (FEC)'}
    ORG_WORD = re.compile(r'\b(INC|LLC|PAC|FUND|COMMITTEE|COMM|ASSOC|ASSOCIATION|UNION|COUNCIL|PARTY|CAUCUS|CHURCH|PROJECT|'
                          r'FOUNDATION|TRUST|CAMPAIGN|NETWORK|ACTION|LEAGUE|COALITION|CORP|CORPORATION|SOCIETY|CENTER|ALLIANCE|'
                          r'AMERICA|LOCAL|LLP|LP|CO|COMPANY|GROUP|MEDIA|BANK|SERVICES|STRATEGIES|PARTNERS)\b', re.I)
    OFFICE = {'H': 'House', 'S': 'Senate', 'P': 'President'}

    def looks_person(name):
        parts = str(name or '').split(',')
        return len(parts) == 2 and not ORG_WORD.search(name) and all(p.strip() and len(p.strip().split()) <= 3 for p in parts)

    def slug(s):
        return re.sub(r'[^A-Z0-9]+', '_', str(s or '').upper()).strip('_')

    def https(url):
        return url if isinstance(url, str) and re.match(r'^https://[^\s<>"\']+$', url) else ''

    # ---------- read the inputs ----------
    pulled = {}
    bulk = None

    def add_committee(cid, name, ctype, sched, rows, retrieved):
        c = pulled.setdefault(cid, {'name': None, 'type': None, 'receipts': None, 'disbursements': None, 'ies': [],
                                    'retrieved': '', 'failed': set(), 'party': '', 'totals': None, 'why': '',
                                    'layer': 'main', 'candidate': None})
        c['name'] = c['name'] or name
        c['type'] = c['type'] or ctype
        if c[sched] is None or len(rows) > len(c[sched]):
            c[sched] = rows
        c['retrieved'] = max(c['retrieved'], retrieved or '')
        return c

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
            if d.get('source') == 'fec_bulk':
                bulk = d
            for c in d.get('committees') or []:
                cid = c.get('committee_id')
                if not cid:
                    continue
                first = (c.get('receipts') or c.get('disbursements') or [{}])[0]
                p = add_committee(cid, c.get('committee_name') or first.get('committee_name'),
                                  c.get('committee_type_full') or first.get('committee_type_full'),
                                  'disbursements', c.get('disbursements') or [], c.get('disbursements_retrieved'))
                p['ies'] = c.get('independent_expenditures') or p['ies']
                p['party'] = c.get('party') or p['party']
                p['totals'] = c.get('totals') or p['totals']
                p['why'] = c.get('why') or p['why']
                p['layer'] = c.get('layer') or p['layer']
                p['candidate'] = c.get('candidate') or p['candidate']
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

    # Filing lines already drawn on a media company's dot (media.js): left out here so they are not drawn twice.
    media_subs = set()
    if os.path.exists(site + 'money-trail/media.js'):
        t = open(site + 'money-trail/media.js', encoding='utf-8').read()
        a = t.index('TW_MEDIA=') + len('TW_MEDIA=')
        for g in json.JSONDecoder().raw_decode(t[a:])[0].get('groups', []):
            media_subs.update(str(r[7]) for r in g.get('rows', []) if r and r[0] != 'E')
            media_subs.update(str(r[8]) for r in g.get('pac_rows', []))

    old_tx, old_ents, old_cm = [], [], []
    if os.path.exists(OUT) and not bulk:
        F0 = load_fec_js(OUT)
        old_tx, old_ents = expand(F0)
        old_cm = F0['committees']
    if bulk:
        print('bulk snapshot: fec-data.js is rebuilt from it (records from earlier batches are replaced)')
    tx = {t['transaction_id']: t for t in old_tx}
    ents = {e['entity_id']: e for e in old_ents}
    committees = {c['committee_id']: c for c in old_cm}

    def display_name(cid, reported):
        if cid in READABLE:
            return READABLE[cid]
        if 'fec:' + cid in archive_names:
            return archive_names['fec:' + cid]
        if 'fec:' + cid in ents:
            return ents['fec:' + cid]['legal_or_reported_name']
        return str(reported or cid).upper().strip()

    if bulk:
        src_note = lambda sched, c: (f"From the FEC's public data (FEC bulk data files, Schedule {sched}), files dated "
                                     f"{bulk_day}. ")
        confidence = 'FEC itemized record from the FEC bulk data files'
    else:
        src_note = lambda sched, c: f"From the FEC's public data (OpenFEC API, Schedule {sched}), retrieved {c['retrieved'][:10]}. "
        confidence = 'FEC itemized record as returned by the OpenFEC API'
    bulk_day = ''
    if bulk:
        days = sorted(v.get('last_modified') or '' for v in bulk['files'].values())
        from email.utils import parsedate_to_datetime
        try:
            bulk_day = max(parsedate_to_datetime(x).strftime('%Y-%m-%d') for x in days if x)
        except Exception:
            bulk_day = bulk['retrieved'][:10]

    def other_entity(other_id, other, etype, st, sched_word):
        if other_id and re.match(r'^C\d{8}$', str(other_id)):
            oid = 'fec:' + other_id
            oname = display_name(other_id, other)
            if oid not in ents:
                ents[oid] = {'entity_id': oid, 'legal_or_reported_name': oname,
                             'entity_type': ENTITY_TYPE.get((etype or '').upper(), 'Committee (FEC)'),
                             'jurisdiction': 'US', 'registry_identifier': 'FEC ' + other_id,
                             'source_url': f'https://www.fec.gov/data/committee/{other_id}/', 'notes': OTHER_NOTE}
            return oid, oname
        oid = 'fecname:' + slug(other) + ('_' + st if st else '')
        oname = str(other).upper().strip()
        if oid not in ents:
            ents[oid] = {'entity_id': oid, 'legal_or_reported_name': oname,
                         'entity_type': sched_word + ' with no FEC ID (as named on an FEC filing)',
                         'jurisdiction': 'US', 'registry_identifier': '', 'source_url': '', 'notes': NAME_NOTE}
        return oid, oname

    stats = Counter()
    empty = []
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
        if bulk and not (c['receipts'] or c['disbursements'] or c['ies']):
            if c['layer'] == 'more':
                stats['more_no_records'] += 1
            else:
                empty.append({'committee_id': cid, 'name': display_name(cid, c['name']), 'why': c['why']})
            continue
        # Bulk: a committee that reported payments in its totals but has no payment lines in the bulk files yet
        # (the FEC has not finished processing them) says so, like a failed download.
        T = c['totals'] or {}
        gap = (T.get('disbursements') or 0) - (T.get('independent_expenditures') or 0)
        lag = bool(bulk) and not c['disbursements'] and gap > max(100000, 0.1 * (T.get('disbursements') or 0))
        cname = display_name(cid, c['name'])
        committees[cid] = {'committee_id': cid, 'name': cname, 'fec_name': c['name'], 'committee_type': c['type'],
                           'retrieved': c['retrieved'] or committees.get(cid, {}).get('retrieved', ''), 'missing': missing}
        if bulk:
            committees[cid].update({'party': c['party'], 'totals': c['totals'], 'why': c['why'], 'retrieved': bulk_day + 'T00:00:00Z'})
            if c['candidate']:
                committees[cid]['candidate'] = c['candidate']
            if c['layer'] == 'more':
                committees[cid]['layer'] = 'more'
            if lag:
                committees[cid]['lag'] = ['disbursements']
        ents['fec:' + cid] = {'entity_id': 'fec:' + cid, 'legal_or_reported_name': cname,
                              'entity_type': c['type'] or 'Political committee (FEC)', 'jurisdiction': 'US',
                              'registry_identifier': 'FEC ' + cid, 'source_url': f'https://www.fec.gov/data/committee/{cid}/',
                              'notes': CMTE_NOTE}
        if missing:
            ents['fec:' + cid]['notes'] += (' Its ' + ('receipts' if missing[0] == 'receipts' else 'payments') +
                                            ' did not download in this pull (the FEC data service said too many requests), so only its '
                                            + ('payments' if missing[0] == 'receipts' else 'receipts') + ' are shown for now.')
        if lag:
            ents['fec:' + cid]['notes'] += (' Its payment lines are not in the FEC bulk files yet (the FEC is still processing them), '
                                            'so only its receipts and its spending for or against candidates are shown for now.')
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
                if sub in media_subs:
                    stats['on_media_dot'] += 1; continue
                tid = 'FEC-' + sub
                if tid in archive_tx:
                    stats['already_in_archive'] += 1; continue
                st = (r.get('contributor_state') if sched == 'a' else r.get('recipient_state')) or ''
                # a committee gets its name as registered with the FEC (bulk files), not the name typed on this line
                reg = r.get('contributor_committee_name') if sched == 'a' else r.get('recipient_committee_name')
                oid, oname = other_entity(other_id, reg or other, r.get('entity_type'), st, 'Payee' if sched == 'b' else 'Donor')
                city = (r.get('contributor_city') if sched == 'a' else r.get('recipient_city')) or ''
                date = ((r.get('contribution_receipt_date') if sched == 'a' else r.get('disbursement_date')) or '')[:10]
                desc = r.get('disbursement_description') if sched == 'b' else r.get('receipt_type_full')
                label = r.get('line_number_label') or ''
                place = ', '.join(x for x in (city.title(), st) if x)
                rec = {'transaction_id': tid,
                       'source_entity_id': oid if sched == 'a' else 'fec:' + cid,
                       'recipient_entity_id': 'fec:' + cid if sched == 'a' else oid,
                       'source_name': oname if sched == 'a' else cname,
                       'recipient_name': cname if sched == 'a' else oname,
                       'amount_usd': round(float(amt), 2), 'transaction_date': date,
                       'date_kind': 'FEC_reported_receipt_date' if sched == 'a' else 'FEC_reported_disbursement_date',
                       'cycle': '2026', 'jurisdiction': 'US / FEC filing',
                       'activity_type': f'FEC Schedule {sched.upper()} line {line}' + (f': {label}' if label else ''),
                       'filing_url': https(r.get('pdf_url')),
                       'filing_id': f"FEC {r.get('filing_form') or ''} {r.get('file_number') or ''}; {r.get('report_type') or ''} {r.get('report_year') or ''}; sub_id {sub}".replace('  ', ' '),
                       'confidence': confidence,
                       'amendment_status': {'A': 'Filed on an amended report', 'N': 'Filed on a new report'}.get(r.get('amendment_indicator'), ''),
                       'notes': src_note(sched.upper(), c) + (f'Address on the filing: {place}. ' if place else '')
                                + (f'Description on the filing: {str(desc).strip()}. ' if desc and str(desc).strip() else '') + NO_INFERENCE,
                       'evidence_tier': 'fec_filing', 'record_kind': 'transaction',
                       'event_date': date, 'event_id': tid, 'fec_committee_id': cid}
                if tid not in tx:
                    stats['added'] += 1
                tx[tid] = rec
        for r in c['ies'] or []:
            sub = str(r.get('sub_id') or '')
            amt = r.get('expenditure_amount')
            pcc = r.get('candidate_committee_id') or ''
            if not sub or not amt or amt <= 0:
                stats['skip_empty'] += 1; continue
            if not re.match(r'^C\d{8}$', pcc):
                stats['ie_no_candidate_committee'] += 1; continue
            tid = 'FEC-' + sub
            oid, oname = other_entity(pcc, r.get('candidate_committee_name') or pcc, 'CCM', '', 'Candidate committee')
            ents[oid]['entity_type'] = 'Candidate committee (FEC)'
            way = {'S': 'supporting', 'O': 'opposing'}.get(r.get('support_oppose_indicator'), 'about')
            seat = OFFICE.get(r.get('candidate_office'), '')
            where = r.get('candidate_office_state') or ''
            if r.get('candidate_office') == 'H' and r.get('candidate_office_district') not in ('', None, '00'):
                where += '-' + str(r.get('candidate_office_district'))
            who = (r.get('candidate_name') or r.get('candidate_id') or '').strip()
            day = (r.get('expenditure_date') or '')[:10]
            payee = (r.get('payee_name') or '').strip()
            if looks_person(payee):
                payee = 'a person (not named here)'
            fid = (f"FEC {r.get('report_type') or ''} file {r.get('file_number') or ''}; transaction {r.get('transaction_id') or ''}"
                   if not sub[0].isdigit() else f"FEC Schedule E {r.get('file_number') or ''}; {r.get('report_type') or ''}; sub_id {sub}")
            rec = {'transaction_id': tid, 'source_entity_id': 'fec:' + cid, 'recipient_entity_id': oid,
                   'source_name': cname, 'recipient_name': oname, 'amount_usd': round(float(amt), 2), 'transaction_date': day,
                   'date_kind': 'FEC_reported_expenditure_date', 'cycle': '2026', 'jurisdiction': 'US / FEC filing',
                   'activity_type': (f'FEC Schedule E: independent expenditure {way} {who}'
                                     + (f' ({seat}, {where})' if seat or where else '') + (f', paid to {payee}' if payee else '')
                                     + '. Spent on its own, not given to the candidate'),
                   'filing_url': https(r.get('pdf_url')), 'filing_id': fid, 'confidence': confidence,
                   'amendment_status': {'A': 'Filed on an amended report', 'N': 'Filed on a new report'}.get(r.get('amendment_indicator'), ''),
                   'notes': src_note('E', c) + (f'Description on the filing: {str(r.get("expenditure_description")).strip()}. ' if (r.get('expenditure_description') or '').strip() else '')
                            + 'An independent expenditure is money a group spends on its own (ads, mail, calls) to help or hurt a candidate. '
                            + 'The line points to the candidate\'s campaign committee only to show who the spending was about. ' + NO_INFERENCE,
                   'evidence_tier': 'fec_filing', 'record_kind': 'transaction', 'event_date': day, 'event_id': tid,
                   'fec_committee_id': cid}
            if tid not in tx:
                stats['added_ie'] += 1
            tx[tid] = rec

    for cid in SKIP:
        committees.pop(cid, None)
        tx = {k: v for k, v in tx.items() if v['fec_committee_id'] != cid}

    # keep only entities a record or a pulled committee uses
    used = {t['source_entity_id'] for t in tx.values()} | {t['recipient_entity_id'] for t in tx.values()} | {'fec:' + c for c in committees}
    ents = {k: v for k, v in ents.items() if k in used}
    txs = sorted(tx.values(), key=lambda t: (t['fec_committee_id'], -t['amount_usd'], t['transaction_id']))
    for t in txs:  # one spelling per entity: the name of its entity (two filings can space a name differently)
        t['source_name'] = ents[t['source_entity_id']]['legal_or_reported_name']
        t['recipient_name'] = ents[t['recipient_entity_id']]['legal_or_reported_name']
    # ---------- two layers: main (fec-data.js, loaded with the page) and more (fec-more/, loaded when opened) ----------
    more_c = {k: v for k, v in committees.items() if v.get('layer') == 'more'}
    main_c = {k: v for k, v in committees.items() if v.get('layer') != 'more'}
    for v in committees.values():
        v.pop('layer', None)
    main_tx = [t for t in txs if t['fec_committee_id'] not in more_c]
    used_main = ({t['source_entity_id'] for t in main_tx} | {t['recipient_entity_id'] for t in main_tx} |
                 {'fec:' + c for c in main_c})
    main_ents = {}
    for k in used_main:
        e = ents[k]
        if k[4:] in more_c:  # its own filings are in fec-more: say so instead of "pulled for the Money Trail"
            e = dict(e, notes=MORE_NOTE)
        main_ents[k] = e
    more_tx = [t for t in txs if t['fec_committee_id'] in more_c]

    if bulk:
        rule = bulk['rule']
        cand_rule = (f"the campaign committee of every candidate with at least ${int(rule['main_candidate']):,} in receipts, "
                     if rule.get('min_candidate', -1) > 0 and rule.get('main_candidate') else '')
        meta = {'source': 'FEC bulk data files (fec.gov/data/browse-data, 2025-2026): committees, candidates, totals, '
                          'receipts, payments and independent expenditures',
                'method': (f"Loaded with the page: every committee that is not a candidate's own campaign with at least "
                           f"${int(rule.get('main_receipts', rule['min_receipts'])):,} in total receipts this cycle (FEC totals file), "
                           f"every independent expenditure filer with at least ${int(rule.get('main_ie', rule['min_ie'])):,} "
                           f"in independent expenditures, {cand_rule}and the groups already on the Money Trail. "
                           + (f"{len(more_c):,} more committees (every other committee and candidate campaign with money in the "
                              "FEC files, every party alike) load when you search for one or open it. " if more_c else '')
                           + f"For each one, the same depth: its {bulk['depth']} largest itemized receipts from groups, its "
                           f"{bulk['depth']} largest payments and its {bulk['depth']} largest independent expenditures, "
                           "then memo lines, refunds and individuals removed."),
                'files': bulk['files'], 'depth': bulk['depth'], 'no_records': empty}
    else:
        meta = {'source': 'FEC OpenFEC API v1 (api.open.fec.gov), Schedule A and Schedule B',
                'method': 'For every committee: its 100 largest itemized receipts from groups and its 100 largest disbursements '
                          'for the 2026 cycle, then memo lines, refunds and individuals removed.'}
    meta.update({'evidence_tier': 'fec_filing', 'records': len(main_tx), 'entities': len(main_ents), 'committees': len(main_c),
                 'updated': max([c['retrieved'] for c in committees.values()] or [''])[:10]})
    if more_c:
        meta['more'] = {'committees': len(more_c), 'records': len(more_tx), 'shards': SHARDS, 'index': 'fec-more/index.json'}

    NOTE_RX = re.compile(r'^(From the FEC.*?\. )(?:Address on the filing: (.*?)\. )?(?:Description on the filing: (.*?)\. )?'
                         + re.escape(NO_INFERENCE) + '$', re.S)

    def compact(cms, txl, entd):
        S, SI = [], {}

        def si(x):
            x = '' if x is None else str(x)
            if x not in SI:
                SI[x] = len(S); S.append(x)
            return SI[x]

        E = {}
        cmset = set(cms)
        for e in sorted(entd.values(), key=lambda e: e['entity_id']):
            c = e['entity_id'][4:] if e['entity_id'].startswith('fec:') else ''
            default = CMTE_NOTE if c in cmset else OTHER_NOTE if c else NAME_NOTE
            E[e['entity_id']] = [e['legal_or_reported_name'], si(e['entity_type'])] + ([si(e['notes'])] if e['notes'] != default else [])
        rows = []
        for t in txl:
            sub = t['transaction_id'][4:]
            m = NOTE_RX.match(t['notes'] or '')
            if m:
                nh, npl, nd = si(m.group(1)), si(m.group(2) or ''), si(m.group(3) or '')
            else:
                nh, npl, nd = si(t['notes']), -1, -1
            fu = t['filing_url'] or ''
            img = fu[len(IMG):] if fu.startswith(IMG) and fu[len(IMG):].isdigit() else fu
            fid = t['filing_id'] or ''
            fil = si(fid[:-len('; sub_id ' + sub)]) if fid.endswith('; sub_id ' + sub) else -1 - si(fid)
            rows.append([sub, si(t['source_entity_id']), si(t['recipient_entity_id']), t['amount_usd'], t['transaction_date'],
                         si(t['activity_type']), img, fil, si(t['amendment_status']), nh, npl, nd, t['fec_committee_id'],
                         si(t['date_kind']), si(t['confidence'])])
        d = {'committees': sorted(cms.values(), key=lambda c: c['committee_id']), 's': S, 'e': E, 'rows': rows}
        # self-check: the compact form must give back exactly the same records
        back, back_e = expand(json.loads(json.dumps(d)))
        if back != txl:
            for x, y in zip(back, txl):
                if x != y:
                    print({k: (x.get(k), y.get(k)) for k in y if x.get(k) != y.get(k)}); break
            sys.exit("compact rows do not expand to the same records")
        assert sorted(back_e, key=lambda e: e['entity_id']) == sorted(entd.values(), key=lambda e: e['entity_id']), 'entities differ'
        return d

    data = {'meta': meta, **compact(main_c, main_tx, main_ents)}

    # fec-more: one small file per group of committees, plus an index of names for the search box
    MORE = site + 'money-trail/fec-more/'
    if bulk:
        os.makedirs(MORE, exist_ok=True)
        for f in glob.glob(MORE + '*.json'):
            os.remove(f)
    if more_c:
        groups = {}
        for cid in more_c:
            groups.setdefault(shard_of(cid), []).append(cid)
        by_c = {}
        for t in more_tx:
            by_c.setdefault(t['fec_committee_id'], []).append(t)
        OFF = {'H': 'House', 'S': 'Senate', 'P': 'President'}
        index, kinds = [], {}
        more_bytes = 0
        for sh, cids in sorted(groups.items()):
            txl = [t for cid in sorted(cids) for t in by_c.get(cid, [])]
            used = {t['source_entity_id'] for t in txl} | {t['recipient_entity_id'] for t in txl} | {'fec:' + c for c in cids}
            d = compact({c: more_c[c] for c in cids}, txl, {k: ents[k] for k in used})
            b = json.dumps(d, ensure_ascii=False, separators=(',', ':'))
            open(MORE + sh + '.json', 'w', encoding='utf-8').write(b)
            more_bytes += len(b.encode('utf-8'))
            for cid in cids:
                c = more_c[cid]
                cd = c.get('candidate')
                if cd:
                    where = (cd.get('state') or '') + ('-' + cd['district'] if cd.get('office') == 'H' and cd.get('district') not in ('', None, '00') else '')
                    label = ' '.join(x for x in (OFF.get(cd.get('office'), ''), where) if x) + ' candidate campaign' + (', ' + cd['party'] if cd.get('party') else '')
                else:
                    label = (c.get('committee_type') or 'Committee') + (', ' + c['party'] if c.get('party') else '')
                if label not in kinds:
                    kinds[label] = len(kinds)
                index.append([cid, c['name'], round((c.get('totals') or {}).get('receipts') or 0), kinds[label], len(by_c.get(cid, []))]
                             + ([cd.get('name') or ''] if cd else []))
        index.sort(key=lambda r: -r[2])
        # the file of a committee is not stored: it is crc32(FEC ID) % shards, three digits (fec-more.js does the same)
        idx = {'updated': meta['updated'], 'committees': len(index), 'records': len(more_tx), 'shards': SHARDS,
               'columns': ['fec_id', 'name', 'receipts', 'kind', 'lines', 'candidate'], 'kinds': list(kinds), 'c': index}
        ib = json.dumps(idx, ensure_ascii=False, separators=(',', ':'))
        open(MORE + 'index.json', 'w', encoding='utf-8').write(ib)
        print(f'fec-more: {len(more_c)} committees, {len(more_tx)} records, {len(groups)} files, {more_bytes} bytes, index {len(ib.encode())} bytes')
    blob = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    js = ('// FEC filing records for the Money Trail. Made by tools/money-trail/add_fec_batch.py; do not edit by hand.\n'
          '// Every record comes from the FEC public data and links to its filing. Individuals are not included.\n'
          '// Stored as short rows plus a table of words (s) to stay small on phones; the code below rebuilds full records.\n'
          f'const FEC_FILINGS={blob};\n'
          '(function(){const F=FEC_FILINGS,S=F.s,E=F.e,cm=new Set(F.committees.map(c=>c.committee_id)),IMG=' + json.dumps(IMG) + ';'
          'const CN=' + json.dumps(CMTE_NOTE) + ',ON=' + json.dumps(OTHER_NOTE) + ',NN=' + json.dumps(NAME_NOTE) + ',NI=' + json.dumps(NO_INFERENCE) + ';'
          'F.entities=Object.keys(E).map(id=>{const v=E[id],c=id.slice(0,4)==="fec:"?id.slice(4):"";'
          'return {entity_id:id,legal_or_reported_name:v[0],entity_type:S[v[1]],jurisdiction:"US",registry_identifier:c?"FEC "+c:"",'
          'source_url:c?"https://www.fec.gov/data/committee/"+c+"/":"",notes:v.length>2?S[v[2]]:(cm.has(c)?CN:c?ON:NN)}});'
          'F.transactions=F.rows.map(r=>{const [sub,src,rec,amt,day,act,img,fil,amd,nh,npl,nd,cid,dk,conf]=r,tid="FEC-"+sub,s=S[src],t=S[rec];'
          'return {transaction_id:tid,source_entity_id:s,recipient_entity_id:t,source_name:E[s][0],recipient_name:E[t][0],amount_usd:amt,'
          'transaction_date:day,date_kind:S[dk],cycle:"2026",jurisdiction:"US / FEC filing",activity_type:S[act],'
          'filing_url:img&&/^[0-9]/.test(img)?IMG+img:img,filing_id:fil<0?S[-fil-1]:S[fil]+"; sub_id "+sub,confidence:S[conf],'
          'amendment_status:S[amd],notes:npl<0?S[nh]:S[nh]+(S[npl]?"Address on the filing: "+S[npl]+". ":"")+(S[nd]?"Description on the filing: "+S[nd]+". ":"")+NI,'
          'evidence_tier:"fec_filing",record_kind:"transaction",event_date:day,event_id:tid,fec_committee_id:cid}});'
          'if(typeof RESEARCH==="undefined")return;'
          'const t=new Set(RESEARCH.transactions.map(x=>x.transaction_id));F.transactions.forEach(x=>{if(!t.has(x.transaction_id))RESEARCH.transactions.push(x)});'
          'const e=new Set(RESEARCH.entities.map(x=>x.entity_id));F.entities.forEach(x=>{if(!e.has(x.entity_id))RESEARCH.entities.push(x)});'
          'RESEARCH.meta.fec=F.meta;RESEARCH.meta.fec_committees=F.committees.map(c=>c.name);'
          'RESEARCH.meta.fec_missing=F.committees.filter(c=>(c.missing&&c.missing.length)||(c.lag&&c.lag.length)).map(c=>({name:c.name,missing:c.missing&&c.missing.length?c.missing:[],lag:c.lag||[]}));})();\n')
    open(OUT, 'w', encoding='utf-8').write(js)

    # bump the cache stamp so browsers load the new batch
    h = open(INDEX, encoding='utf-8').read()
    stamp = 'f' + re.sub(r'\D', '', meta['updated']) + 'n' + str(len(main_tx))  # date and count, so a daily change is picked up
    h2 = re.sub(r'fec-data\.js\?v=[A-Za-z0-9]+', 'fec-data.js?v=' + stamp, h)
    if h2 != h:
        open(INDEX, 'w', encoding='utf-8').write(h2)

    per = Counter(t['fec_committee_id'] for t in main_tx)
    print('committees:', len(main_c), ' (more, loaded when opened:', len(more_c), ')')
    for cid, n in sorted(per.items(), key=lambda kv: -kv[1])[:5]:
        print(f'  {cid}: {n} records')
    if empty:
        print('no records in the FEC files for:', ', '.join(f"{e['name']} ({e['committee_id']})" for e in empty))
    lagged = [c['name'] for c in main_c.values() if c.get('lag')]
    if lagged:
        print('payments not processed by the FEC yet:', len(lagged), ':', ', '.join(lagged[:12]) + (' ...' if len(lagged) > 12 else ''))
    print('records:', len(main_tx), ' entities:', len(main_ents), ' stamp:', stamp, ' file bytes:', len(js.encode('utf-8')))
    print('this run:', dict(stats))


if __name__ == '__main__':
    main()
