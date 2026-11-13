#!/usr/bin/env python3
"""Build site/money-trail/jeffries-web.js: Hakeem Jeffries as a dot on the Money web (D271).

    python3 -I tools/money-trail/build_jeffries_web.py BULK_DIR site

BULK_DIR holds the FEC bulk files for 2025-2026 (cm26.zip, cn26.zip, webk26.zip, weball26.zip, indiv26.zip), the
same files tools/money-trail/fec_bulk.py reads. The FEC build (fec-data.js) has his committees but no dot for him,
because it only keeps committees. This file adds:
  - his FEC candidate record (H2NY10092, House, NY-08) on his member of Congress dot ("Hakeem S. Jeffries (D-NY)",
    Bioguide J000294, made by budgets-view.js from the law votes), or a HAKEEM JEFFRIES dot if that one is missing;
  - one line from him to each FEC committee tied to him: his campaign (FEC candidate file), his leadership PAC
    (FEC committee file, designation D, sponsor JEFFRIES) and the joint fundraising committees named for him
    (FEC committee file, designation J). These lines are registrations, not money;
  - the earmarked money each conduit committee (for example AIPAC PAC or ActBlue) passed on to those committees, added
    together per (conduit, committee) from the conduit's own filings, the same way fec_bulk.py does it (sub_id
    ET<conduit><committee>). A pair the conduit filed only as earmarked receipts (15E naming the committee, as AIPAC PAC
    did for Jeffries Victory Fund) is added up from those lines. fec-data.js wins when it already has the same line.
    People are never kept.
"""
import csv, datetime, io, json, os, re, sys, zipfile

BULK, SITE = sys.argv[1], sys.argv[2]
CAND = 'H2NY10092'
BIOGUIDE = 'J000294'  # his Bioguide ID: the member of Congress dot that budgets-view.js makes from the law votes
IMG = 'https://docquery.fec.gov/cgi-bin/fecimg/?'
csv.field_size_limit(10 ** 9)


def rows(name, member=None):
    z = zipfile.ZipFile(os.path.join(BULK, name))
    with z.open(member or z.namelist()[0]) as f:
        for ln in io.TextIOWrapper(f, encoding='latin-1'):
            yield ln.rstrip('\n').split('|')


def d8(s):
    return f'{s[4:8]}-{s[0:2]}-{s[2:4]}' if re.match(r'^\d{8}$', s or '') else ''


def money(s):
    try:
        return float(s)
    except ValueError:
        return 0.0


cand = next(r for r in rows('cn26.zip') if r[0] == CAND)
pcc = cand[9]
cm = {r[0]: r for r in rows('cm26.zip')}
webk = {r[0]: r for r in rows('webk26.zip')}
weball = next(r for r in rows('weball26.zip') if r[0] == CAND)

# His committees: the principal campaign committee named in the candidate file, the leadership PAC whose sponsor is
# JEFFRIES (designation D), and the joint fundraising committees (designation J) whose name starts with JEFFRIES.
mine = {pcc: ('principal campaign committee', f'The FEC candidate file lists it as the principal campaign committee of {cand[1]} ({CAND}), House, {cand[4]}-{cand[6]}.')}
for cid, r in cm.items():
    if r[8] == 'D' and r[13].strip().upper() == 'JEFFRIES':
        mine[cid] = ('leadership PAC', 'The FEC committee file lists it as a leadership PAC (designation D) with the sponsor name JEFFRIES.')
    elif r[8] == 'J' and r[1].upper().startswith('JEFFRIES '):
        mine[cid] = ('joint fundraising committee', 'The FEC committee file lists it as a joint fundraising committee (designation J) with his name in its name. A joint fundraising committee raises money for several committees and splits it among them; the FEC file does not list which ones.')
if cm[pcc][13].strip().upper() in {cm[c][1].upper() for c in mine}:
    jfc = cm[pcc][13].strip().upper()
    for c in mine:
        if cm[c][1].upper() == jfc:
            mine[c] = (mine[c][0], mine[c][1] + f' Jeffries for Congress names {cm[c][1]} as its connected committee in the same file.')


def totals(cid):
    if cid == pcc:
        return {'receipts': money(weball[5]), 'through': d8(weball[27].replace('/', ''))}
    r = webk.get(cid)
    return {'receipts': money(r[5]), 'through': d8(r[26].replace('/', ''))} if r else {'receipts': 0, 'through': ''}


# Earmarked money passed on, from the conduit's own filings: its 24T lines (the same rule as fec_bulk.py, every line
# counted). A conduit that filed a pair with no 24T line at all, only earmarked receipts naming that committee
# (transaction type 15E with OTHER_ID set, as AIPAC PAC did for Jeffries Victory Fund), is counted from those lines.
lines = {}  # (conduit, committee) -> {'24T': [...], '15E': [...]}
print('reading indiv26 (earmarked lines to his committees only)', flush=True)
for r in rows('indiv26.zip', member='itcont.txt'):
    if len(r) < 21 or r[15] not in mine or r[0] in mine or r[18] == 'X' or r[5] not in ('24T', '15E'):
        continue
    lines.setdefault((r[0], r[15]), {'24T': [], '15E': []})[r[5]].append(r)
earmark = {}
for pair, got in lines.items():
    use = got['24T'] or got['15E']
    a = earmark[pair] = [0.0, 0, -1.0, None, '', '', '24T' if got['24T'] else '15E']
    for r in use:
        amt, day = money(r[14]), d8(r[13])
        a[0] += amt
        a[1] += 1
        if amt > a[2]:
            a[2], a[3] = amt, (r[4], r[17], r[1])
        a[4] = min(a[4] or day, day or a[4])
        a[5] = max(a[5], day)

now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')
z = zipfile.ZipFile(os.path.join(BULK, 'indiv26.zip'))
file_day = datetime.datetime(*z.getinfo('itcont.txt').date_time[:3]).strftime('%Y-%m-%d')
person = {'entity_id': 'fec-cand:' + CAND, 'legal_or_reported_name': 'HAKEEM JEFFRIES', 'entity_type': 'member_of_congress',
          'jurisdiction': 'US', 'registry_identifier': 'FEC candidate ' + CAND,
          'source_url': f'https://www.fec.gov/data/candidate/{CAND}/?cycle=2026',
          'notes': f'U.S. Representative, New York District {cand[6]}, Democrat. FEC candidate {CAND} (filed as "{cand[1]}"). '
                   'The lines from this dot are the FEC committees registered to him or named for him. They are '
                   'registrations, not money; follow each committee for its money.'}
edges = []
for cid, (kind, why) in sorted(mine.items(), key=lambda kv: -totals(kv[0])['receipts']):
    t = totals(cid)
    edges.append({'id': 'JEFFRIES-' + cid, 'from_entity_id': person['entity_id'], 'to_entity_id': 'fec:' + cid,
                  'from_name': person['legal_or_reported_name'], 'to_name': cm[cid][1], 'date': '', 'amount_usd': None,
                  'date_kind': 'committee registration, not a transaction', 'jurisdiction': 'US',
                  'edge_type': 'official_FEC_committee_registration_NOT_money', 'confidence': 'FEC bulk data files (candidate and committee files)',
                  'source_url': f'https://www.fec.gov/data/committee/{cid}/?cycle=2026',
                  'notes': f'His {kind}. {why} Its total receipts in the FEC totals file: ${t["receipts"]:,.2f} through {t["through"]}. Not money from him.'})
tx = []
for (con, rid), a in sorted(earmark.items(), key=lambda kv: -kv[1][0]):
    if round(a[0], 2) <= 0:
        continue
    img, fil, amd = a[3]
    span = a[4] + ' to ' + a[5] if a[4] != a[5] else a[5]
    tx.append({'transaction_id': 'FEC-ET' + con + rid, 'source_entity_id': 'fec:' + con, 'recipient_entity_id': 'fec:' + rid,
               'source_name': cm.get(con, [con, con])[1], 'recipient_name': cm[rid][1], 'amount_usd': round(a[0], 2),
               'transaction_date': a[5], 'date_kind': 'Latest date among the earmarked lines added together', 'cycle': '2026',
               'jurisdiction': 'US / FEC filing', 'activity_type': 'FEC: Earmarked contributions passed on, added together (transaction type 24T)',
               'filing_url': IMG + img, 'filing_id': f'FEC file {fil} (largest of {a[1]} earmarked lines added together)',
               'confidence': 'FEC itemized record from the FEC bulk data files', 'amendment_status': 'Amended report' if amd == 'A' else 'Filed on a new report',
               'notes': (f"From the FEC's public data (FEC bulk data files, individual contributions file), file dated {file_day}. "
                         f'{a[1]} earmarked contribution' + ('s' if a[1] != 1 else '') + f' ({span}) in the passing committee’s own filings (transaction type {a[6]}), added together here. '
                         'An earmarked contribution is a gift from one person who names the committee it goes to; this committee received it and passed it on. '
                         f'The people are not named here. The link opens the filing with the largest one (${a[2]:,.2f}). No inference of coordination or misconduct.'),
               'evidence_tier': 'fec_filing', 'record_kind': 'transaction', 'event_date': a[5], 'event_id': 'FEC-ET' + con + rid,
               'fec_committee_id': con})

meta = {'built': now, 'member_dot': 'bioguide:' + BIOGUIDE, 'source': f'FEC bulk data files: candidates and committees (cn26, cm26), totals (webk26, weball26), individual contributions (indiv26, file dated {file_day})',
        'committees': {cid: {'name': cm[cid][1], 'kind': mine[cid][0], **totals(cid)} for cid in mine}}
data = {'meta': meta, 'entity': person, 'edges': edges, 'transactions': tx}
js = ('// Hakeem Jeffries on the Money web (D271). Made by tools/money-trail/build_jeffries_web.py from the FEC bulk files; do not edit by hand.\n'
      '// His FEC candidate record on his member of Congress dot, one registration line (not money) to each FEC committee tied to him, and the earmarked money\n'
      '// conduit committees passed on to those committees, added together per pair. People who gave are not named.\n'
      'window.TW_JEFFRIES=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
      '(function(){const J=window.TW_JEFFRIES;if(typeof RESEARCH==="undefined")return;'
      'const names=new Map(RESEARCH.entities.map(e=>[e.entity_id,e.legal_or_reported_name]));'
      # His member of Congress dot (votes and sponsorships, budgets-view.js) is used when it is there, so one dot has both.
      'const mem=RESEARCH.entities.find(e=>e.entity_id===J.meta.member_dot);let pid=J.entity.entity_id;'
      'if(mem){pid=mem.entity_id;mem.notes=J.entity.notes+" "+(mem.notes||"");mem.registry_identifier=(mem.registry_identifier?mem.registry_identifier+"; ":"")+J.entity.registry_identifier}'
      'else if(!names.has(pid)){RESEARCH.entities.push(J.entity);names.set(pid,J.entity.legal_or_reported_name)}'
      'J.hub=mem?mem.legal_or_reported_name:names.get(pid);const nm=(id,n)=>names.get(id)||n;'
      'const ge=new Set(RESEARCH.graph_edges.map(e=>e.id));J.edges.forEach(e=>{if(!ge.has(e.id))RESEARCH.graph_edges.push({...e,from_entity_id:pid,from_name:J.hub,to_name:nm(e.to_entity_id,e.to_name)})});'
      'const tx=new Set(RESEARCH.transactions.map(t=>t.transaction_id));J.transactions.forEach(t=>{if(!tx.has(t.transaction_id))RESEARCH.transactions.push({...t,source_name:nm(t.source_entity_id,t.source_name),recipient_name:nm(t.recipient_entity_id,t.recipient_name)})});'
      '})();\n')
open(os.path.join(SITE, 'money-trail', 'jeffries-web.js'), 'w', encoding='utf-8').write(js)
print('committees', len(mine), 'earmark lines', len(tx), 'bytes', len(js))
for e in edges:
    print(' ', e['to_name'], e['notes'][:60])
for t in tx:
    print(' ', t['source_name'], '->', t['recipient_name'], t['amount_usd'])
