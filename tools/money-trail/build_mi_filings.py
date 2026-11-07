#!/usr/bin/env python3
"""Build site/money-trail/mi-filings.js from the Michigan MiTN pull for 2026 Proposal 2.

Usage (from repo root):
  python3 -I tools/money-trail/build_mi_filings.py site <folder with the four clean CSVs>

The CSVs (yes_contributions.csv, yes_expenditures.csv, no_contributions.csv, no_expenditures.csv)
come from the public MiTN search, latest version of each report only (see summary.md beside them).

Rules:
- Money in: every itemized cash and in-kind line from an organization or committee (the state's own
  contributor type). Individuals are left out; only their count and total are kept.
  "Other receipts" (interest, refunds) are left out.
- Money out: direct (cash) payments to organizations that got $10,000 or more in all. Payments to people
  (salary, reimbursements) are left out. In-kind expenditure lines mirror in-kind gifts and are left out.
- Committee totals come from each committee's own Summary Page (cumulative) plus its late reports.
"""
import csv, json, re, sys
from collections import defaultdict
from pathlib import Path

CONTRIB_URL = 'https://mi-boe.entellitrak.com/etk-mi-boe-prod/page.request.do?page=page.miboeContributionPublicSearch'
EXPEND_URL = 'https://mi-boe.entellitrak.com/etk-mi-boe-prod/page.request.do?page=page.miboeCommitteeExpenditureAnalysisPublicSearch'
COMMITTEE_URL = 'https://mi-boe.entellitrak.com/etk-mi-boe-prod/page.request.do?page=page.miboeCommitteePublicSearch'
UPDATED = '2026-11-07'
MEASURE = 'MI-2026-2'

COMMITTEES = [
    {'side': 'yes', 'stance': 'support', 'committee_id': '0606934',
     'name': 'Michiganders for Money Out of Politics',
     'filed_name': 'Michiganders for Money Out of Politics Ballot Committee',
     'filings': 19,
     'cash_in': 9495650.34, 'in_kind_in': 1847431.62, 'spent': 8463068.60, 'spent_through': '2026-10-18',
     'cash_in_note': '$8,695,650.34 reported through Oct 18, 2026, plus $800,000.00 in late reports filed after that',
     'debts': 73075.00, 'org_donors': 57, 'people': 969, 'people_total': 507836.71,
     'legal_paid': 46078.98, 'legal_note': 'Paid to Michael Brady Law, PLLC. Detroit Action also gave $44,875.00 of legal services as in-kind gifts.'},
    {'side': 'no', 'stance': 'oppose', 'committee_id': '0607889',
     'name': 'Protect MI Free Speech',
     'filed_name': 'Protect MI Free Speech',
     'filings': 7,
     'cash_in': 851000.00, 'in_kind_in': 0.0, 'spent': 810227.89, 'spent_through': '2026-10-18',
     'cash_in_note': '$834,000.00 reported through Oct 18, 2026, plus $17,000.00 in a late report filed after that',
     'debts': 20000.00, 'org_donors': 17, 'people': 0, 'people_total': 0.0,
     'legal_paid': 474710.22, 'legal_note': 'Paid to Dykema Gossett PLLC ($357,070.22) and Doster Law Offices ($117,640.00).'},
]

# Payees on the spending lists who are people, not organizations (salary, payroll, contract work). Left out.
PEOPLE_PAYEES = {'COURTNEY OTTO', 'OTTO, COURTNEY', 'EMILY PERRY', 'BAGENSTOS, SAMUEL', 'GOLDENBERG, MARK',
                 'TONAT, ANNA', 'BEDI, NICOLE', 'RANDALL, MATTHEW', 'MARTA JOHNSON', 'KEN SNAPP', 'CHAPMAN, AMY'}
PAYEE_MIN = 10000.0


def iso(d):
    m = re.match(r'^(\d{2})/(\d{2})/(\d{4})$', d or '')
    return f'{m.group(3)}-{m.group(1)}-{m.group(2)}' if m else ''


def key(name, st):
    k = re.sub(r'[^A-Z0-9]+', '_', name.upper()).strip('_')
    return f'mitnname:{k}_{(st or "XX").upper()}'


def amt(v):
    try:
        return round(float(v or 0), 2)
    except ValueError:
        return 0.0


def main(site, folder):
    site, folder = Path(site), Path(folder)
    tx, ents = [], {}
    for c in COMMITTEES:
        cid = 'mitn:' + c['committee_id']
        ents[cid] = {'entity_id': cid, 'legal_or_reported_name': c['filed_name'],
                     'entity_type': 'Michigan ballot question committee', 'jurisdiction': 'MI',
                     'registry_identifier': 'MiTN Committee ID ' + c['committee_id'], 'source_url': COMMITTEE_URL,
                     'notes': f"Search Committee ID {c['committee_id']} on the MiTN committee search. {c['filings']} filings on record as of Nov 7, 2026."}
        rows = list(csv.DictReader(open(folder / f"{c['side']}_contributions.csv", encoding='utf-8')))
        for r in rows:
            if r['contributor_kind'] == 'individual' or r['type'] not in ('cash', 'in-kind'):
                continue
            sid = key(r['name'], r['state'])
            ents.setdefault(sid, {'entity_id': sid, 'legal_or_reported_name': r['name'],
                                  'entity_type': 'Contributor (as named on a Michigan filing)', 'jurisdiction': r['state'] or 'MI',
                                  'registry_identifier': '', 'source_url': '',
                                  'notes': 'Name as written on the filing. A group with the same name elsewhere is not proven to be the same group.'})
            d = iso(r['date'])
            tid = 'MITN-' + r['receipt_id']
            kind = 'in-kind (goods or services, not cash)' if r['type'] == 'in-kind' else 'cash'
            tx.append({'transaction_id': tid, 'source_entity_id': sid, 'recipient_entity_id': cid,
                       'source_name': r['name'], 'recipient_name': c['name'], 'amount_usd': amt(r['amount']),
                       'transaction_date': d, 'date_kind': 'MiTN_reported_receipt_date', 'cycle': '2026', 'jurisdiction': 'MI',
                       'activity_type': f"Michigan ballot committee contribution, {kind}",
                       'filing_url': CONTRIB_URL,
                       'filing_id': f"MiTN Committee ID {c['committee_id']}; {r['report name']}; item {r['receipt_id']}",
                       'confidence': 'state_filing_latest_version_of_report', 'amendment_status': 'latest version of the report only',
                       'notes': (r['description'].rstrip('.') + '. ' if r['description'] else '') + f"{r['city']}, {r['state']}. Proposal 2 ({c['stance']}).",
                       'evidence_tier': 'state_filing', 'record_kind': 'transaction', 'event_date': d, 'event_id': tid, 'measure_id': MEASURE})
        rows = [r for r in csv.DictReader(open(folder / f"{c['side']}_expenditures.csv", encoding='utf-8')) if r['type'] == 'cash']
        tot = defaultdict(float)
        for r in rows:
            tot[r['name']] += amt(r['amount'])
        for r in rows:
            if r['name'].upper() in PEOPLE_PAYEES or tot[r['name']] < PAYEE_MIN or amt(r['amount']) <= 0:
                continue
            pid = key(r['name'], r['state'])
            ents.setdefault(pid, {'entity_id': pid, 'legal_or_reported_name': r['name'],
                                  'entity_type': 'Payee (as named on a Michigan filing)', 'jurisdiction': r['state'] or 'MI',
                                  'registry_identifier': '', 'source_url': '',
                                  'notes': 'Name as written on the filing. A group with the same name elsewhere is not proven to be the same group.'})
            d = iso(r['date'])
            tid = 'MITN-X-' + r['expense_id']
            tx.append({'transaction_id': tid, 'source_entity_id': cid, 'recipient_entity_id': pid,
                       'source_name': c['name'], 'recipient_name': r['name'], 'amount_usd': amt(r['amount']),
                       'transaction_date': d, 'date_kind': 'MiTN_reported_expenditure_date', 'cycle': '2026', 'jurisdiction': 'MI',
                       'activity_type': 'Michigan ballot committee payment',
                       'filing_url': EXPEND_URL,
                       'filing_id': f"MiTN Committee ID {c['committee_id']}; {r['report name']}; item {r['expense_id']}",
                       'confidence': 'state_filing_latest_version_of_report', 'amendment_status': 'latest version of the report only',
                       'notes': (r['description'] or 'No description on the filing') + f". {r['city']}, {r['state']}.",
                       'evidence_tier': 'state_filing', 'record_kind': 'transaction', 'event_date': d, 'event_id': tid, 'measure_id': MEASURE})
    tx.sort(key=lambda t: (t['transaction_date'], t['transaction_id']))
    # Compact form: each record is one short row; the page expands it (same fields as the FEC records).
    reports, rows = [], []
    for t in tx:
        rep = t['filing_id'].split('; ')[1]
        if rep not in reports:
            reports.append(rep)
        out_ = t['transaction_id'].startswith('MITN-X-')
        side = 0 if t['measure_id'] and (t['recipient_entity_id'] if not out_ else t['source_entity_id']) == 'mitn:0606934' else 1
        other = t['recipient_entity_id'] if out_ else t['source_entity_id']
        kind = 2 if out_ else (1 if 'in-kind' in t['activity_type'] else 0)
        rows.append([t['transaction_id'].split('-')[-1], side, kind, other, t['amount_usd'], t['transaction_date'], reports.index(rep), t['notes']])
    data = {'meta': {'source': 'Michigan Department of State, Michigan Transparency Network (MiTN) public search',
                     'evidence_tier': 'state_filing', 'measure_id': MEASURE, 'records': len(tx), 'updated': UPDATED,
                     'committee_url': COMMITTEE_URL, 'contributions_url': CONTRIB_URL, 'expenditures_url': EXPEND_URL,
                     'method': 'Latest version of each report only. Money in: every itemized cash and in-kind gift from an organization or committee; people are counted but not named. Money out: cash payments to organizations paid $10,000 or more in all; payments to people are left out.',
                     'replaces': ['MI-AGG-001', 'MI-AGG-002', 'MI-AGG-003', 'MI-AGG-004', 'MI-AGG-005', 'MI-AGG-006', 'MI-AGG-007', 'MI-AGG-008', 'MI-AGG-009', 'MI-AGG-010']},
            'committees': COMMITTEES, 'reports': reports,
            'entities': {e['entity_id']: [e['legal_or_reported_name'], e['jurisdiction']] for e in ents.values() if not e['entity_id'].startswith('mitn:')},
            'rows': rows}
    js = ('// Michigan state filing records for 2026 Proposal 2 on the Money Trail. Made by tools/money-trail/build_mi_filings.py; do not edit by hand.\n'
          '// Every record comes from the Michigan MiTN public search. Individuals are not named.\n'
          '// rows: [state item ID, committee (0 yes, 1 no), kind (0 cash gift, 1 in-kind gift, 2 payment), other party, amount, date, report, notes]\n'
          'const MI_FILINGS=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n'
          + EXPAND)
    out = site / 'money-trail' / 'mi-filings.js'
    out.write_text(js, encoding='utf-8')
    print(out, len(tx), 'records', len(ents), 'entities', len(js), 'bytes')


EXPAND = r'''(function(){if(typeof RESEARCH==="undefined")return;const M=MI_FILINGS,C=M.committees,drop=new Set(M.meta.replaces);
const cid=c=>"mitn:"+c.committee_id,ids={};C.forEach(c=>ids[c.name.toUpperCase()]=cid(c));
const kinds=["Michigan ballot committee contribution, cash","Michigan ballot committee contribution, in-kind (goods or services, not cash)","Michigan ballot committee payment"];
RESEARCH.graph_edges=RESEARCH.graph_edges.filter(e=>!drop.has(e.id));
RESEARCH.graph_edges.forEach(e=>{const k=String(e.from_name).toUpperCase();if(e.to_name===M.meta.measure_id&&ids[k])e.from_entity_id=ids[k]});
const have=new Set(RESEARCH.transactions.map(x=>x.transaction_id));
M.rows.forEach(([item,side,kind,other,amount,date,rep,notes])=>{const c=C[side],out=kind===2,id=(out?"MITN-X-":"MITN-")+item,o=M.entities[other]||[other,"MI"];if(have.has(id))return;
 RESEARCH.transactions.push({transaction_id:id,source_entity_id:out?cid(c):other,recipient_entity_id:out?other:cid(c),source_name:out?c.name:o[0],recipient_name:out?o[0]:c.name,amount_usd:amount,
 transaction_date:date,date_kind:out?"MiTN_reported_expenditure_date":"MiTN_reported_receipt_date",cycle:"2026",jurisdiction:"MI",activity_type:kinds[kind],filing_url:out?M.meta.expenditures_url:M.meta.contributions_url,
 filing_id:"MiTN Committee ID "+c.committee_id+"; "+M.reports[rep]+"; item "+item,confidence:"state_filing_latest_version_of_report",notes:notes,evidence_tier:"state_filing",record_kind:"transaction",event_date:date,event_id:id,measure_id:M.meta.measure_id})});
const have2=new Set(RESEARCH.entities.map(x=>x.entity_id));
C.forEach(c=>{if(!have2.has(cid(c)))RESEARCH.entities.push({entity_id:cid(c),legal_or_reported_name:c.filed_name,entity_type:"Michigan ballot question committee",jurisdiction:"MI",registry_identifier:"MiTN Committee ID "+c.committee_id,source_url:M.meta.committee_url,notes:"Search Committee ID "+c.committee_id+" on the MiTN committee search. "+c.filings+" filings on record as of Nov 7, 2026."})});
Object.entries(M.entities).forEach(([id,[n,j]])=>{if(!have2.has(id))RESEARCH.entities.push({entity_id:id,legal_or_reported_name:n,entity_type:"Group named on a Michigan filing",jurisdiction:j,registry_identifier:"",source_url:"",notes:"Name as written on the filing. A group with the same name elsewhere is not proven to be the same group."})});
RESEARCH.ballots.forEach(b=>{if(b.measure_id===M.meta.measure_id){b.support_committee_review="Michigan state filings (MiTN), pulled Nov 7, 2026";b.opposition_committee_review="Michigan state filings (MiTN), pulled Nov 7, 2026"}});
RESEARCH.positions.forEach(p=>{if(p.measure_id===M.meta.measure_id&&ids[String(p.entity_name).toUpperCase()]){p.source_url=M.meta.committee_url;p.confidence="state_filing_committee_registration"}});
RESEARCH.meta.mi=M.meta;RESEARCH.meta.state_committees=C;})();
'''


if __name__ == '__main__':
    main(*sys.argv[1:3])
