#!/usr/bin/env python3
"""Nonprofit Trail (D280): IRS Form 990 returns for the Money web, the Nonprofit tracker and /money-trail/nonprofits.html.

Reads tools/money-trail/nonprofits.json (which groups, and which filed return of each), gets each return's IRS e-file
XML, and writes site/money-trail/nonprofits.js (window.TW_NONPROFITS). Run from the repo root:

  python3 -I tools/money-trail/build_nonprofits.py site [--cache DIR] [--xml-base URL] [--bmf eo_bmf.csv] [--refresh-ids]

Where the XML comes from: the IRS publishes every e-filed Form 990 as XML (irs.gov "Form 990 Series Downloads",
monthly zip files). The same files, one per return and unchanged, are kept by the GivingTuesday 990 data lake on
Amazon S3 (default --xml-base). Each file is checked: the EIN inside it must match the group's EIN.
--refresh-ids asks the ProPublica Nonprofit Explorer API (which is built from the same IRS files) for each group's
latest object id and updates nonprofits.json. Run it on a computer that can reach projects.propublica.org.

What is read from each return, exactly as filed (nothing estimated):
  Part I     revenue, gifts and grants received, expenses, grants paid, pay and benefits, assets, net assets
  Part VII   every officer, director, key employee and highest paid employee, with pay from the group and related groups
  Schedule B how many donor entries the return lists. Donor names of 501(c)(3) and 501(c)(4) groups are not public.
  Schedule C political spending, lobbying, and line 5: each political organization (527) the group paid
  Schedule I grants to U.S. groups: the LIMIT largest are kept, the count and sum of all lines are kept too
  Schedule R related groups and money moved between them
The same rules and the same depth for every group.
"""
import json, os, re, sys, urllib.request, xml.etree.ElementTree as ET

LIMIT = 50
NS = '{http://www.irs.gov/efile}'
XML_BASE = 'https://gt990datalake-rawdata.s3.amazonaws.com/EfileData/XmlFiles/'
PP_API = 'https://projects.propublica.org/nonprofits/api/v2/organizations/'
PP_XML = 'https://projects.propublica.org/nonprofits/download-xml?object_id='
# Schedule R Part V, line 1 a-s, as printed on the form.
RTX = {'A': 'interest, annuities, royalties or rent from a controlled group', 'B': 'gift, grant or capital contribution to the related group',
       'C': 'gift, grant or capital contribution from the related group', 'D': 'loans or loan guarantees to the related group',
       'E': 'loans or loan guarantees by the related group', 'F': 'dividends from the related group', 'G': 'sale of assets to the related group',
       'H': 'purchase of assets from the related group', 'I': 'exchange of assets', 'J': 'lease of facilities or other assets to the related group',
       'K': 'lease of facilities or other assets from the related group', 'L': 'services or fundraising done for the related group',
       'M': 'services or fundraising done by the related group', 'N': 'sharing of facilities, mailing lists or other assets',
       'O': 'sharing of paid employees', 'P': 'expenses paid back to the related group', 'Q': 'expenses paid back by the related group',
       'R': 'other cash or property sent to the related group', 'S': 'other cash or property received from the related group'}


def t(el, path):
    if el is None:
        return ''
    x = el.find('/'.join(NS + p for p in path.split('/')))
    return (x.text or '').strip() if x is not None and x.text else ''


def n(el, path):
    v = t(el, path)
    try:
        return int(round(float(v)))
    except ValueError:
        return None


def biz(el, path):
    """A business name: line 1 plus line 2 when the filer used both."""
    if el is None:
        return ''
    b = el.find('/'.join(NS + p for p in path.split('/')))
    if b is None:
        return ''
    parts = [(c.text or '').strip() for c in b if c.text and c.text.strip()]
    return re.sub(r'\s+', ' ', ' '.join(parts)).strip()


def norm(s):
    s = re.sub(r'\([^)]*\)', ' ', str(s).upper()).replace('&', ' AND ')
    s = re.sub(r'[^A-Z0-9 ]+', ' ', s)
    s = re.sub(r'\b(INC|INCORPORATED|THE|CORP|LLC|CO)\b', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def get_xml(oid, cache, base):
    p = os.path.join(cache, oid + '_public.xml')
    if not os.path.exists(p):
        data = None
        # The S3 copy first; ProPublica serves the same IRS XML when the copy does not have a new return yet.
        for url in (base + oid + '_public.xml', PP_XML + oid):
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'TheWay-nonprofit-trail/1.0'})
                with urllib.request.urlopen(req, timeout=120) as r:
                    data = r.read()
                break
            except Exception as e:
                print('could not get', url, e)
        if data is None:
            raise SystemExit('no XML for object id ' + oid)
        with open(p, 'wb') as f:
            f.write(data)
    return ET.parse(p).getroot()


def fec_names(site):
    """FEC committee names on the Money web (fec-data.js) and in the search layer (fec-more/index.json): norm(name) -> (id, name)."""
    out = {}
    txt = open(os.path.join(site, 'money-trail', 'fec-data.js'), encoding='utf-8').read()
    i = txt.index('const FEC_FILINGS=') + len('const FEC_FILINGS=')
    d, _ = json.JSONDecoder().raw_decode(txt, i)
    ents = d['e']
    for c in d['committees']:
        nm = ents.get('fec:' + c['committee_id'], [c['name']])[0]
        for k in (c.get('fec_name'), c['name']):
            if k:
                out.setdefault(norm(k), (c['committee_id'], nm))
    for eid, v in ents.items():
        if eid.startswith('fec:'):
            out.setdefault(norm(v[0]), (eid[4:], v[0]))
            for inner in re.findall(r'\(([^)]*)\)', v[0]):
                out.setdefault(norm(inner), (eid[4:], v[0]))
    idx = json.load(open(os.path.join(site, 'money-trail', 'fec-more', 'index.json'), encoding='utf-8'))
    cols = idx['columns']
    for row in idx.get('c', []):
        r = dict(zip(cols, row)) if isinstance(row, list) else row
        if r.get('fec_id') and r.get('name'):
            out.setdefault(norm(r['name']), (r['fec_id'], r['name']))
    return out, ents


def section(f):
    if f is None:
        return ''
    if t(f, 'Organization501c3Ind'):
        return '501(c)(3)'
    x = f.find(NS + 'Organization501cInd')
    if x is not None:
        return '501(c)(' + x.get('organization501cTypeTxt', '?') + ')'
    if t(f, 'Organization4947a1NotPFInd'):
        return '4947(a)(1)'
    if t(f, 'Organization527Ind'):
        return '527'
    return ''


def parse(root, org):
    h, d = root.find(NS + 'ReturnHeader'), root.find(NS + 'ReturnData')
    f = d.find(NS + 'IRS990')
    ein = t(h, 'Filer/EIN')
    if ein != org['ein']:
        raise SystemExit('EIN mismatch for %s: file has %s' % (org['ein'], ein))
    o = {
        'ein': ein, 'label': org['label'], 'filed_name': biz(h, 'Filer/BusinessName'),
        'web_id': org.get('web_id') or 'irs:' + ein, 'web_name': org.get('web_name') or biz(h, 'Filer/BusinessName').upper(),
        'object_id': org['object_id'], 'form': t(h, 'ReturnTypeCd'), 'section': section(f),
        'begin': t(h, 'TaxPeriodBeginDt'), 'end': t(h, 'TaxPeriodEndDt'), 'filed': t(h, 'ReturnTs')[:10], 'version': root.get('returnVersion', ''),
        'city': t(h, 'Filer/USAddress/CityNm'), 'state': t(h, 'Filer/USAddress/StateAbbreviationCd'),
        'website': t(f, 'WebsiteAddressTxt'), 'mission': t(f, 'ActivityOrMissionDesc') or t(f, 'MissionDesc'),
        'formed': t(f, 'FormationYr'), 'domicile': t(f, 'LegalDomicileStateCd'), 'employees': n(f, 'TotalEmployeeCnt'),
        'totals': {'revenue': n(f, 'CYTotalRevenueAmt'), 'gifts': n(f, 'CYContributionsGrantsAmt'), 'expenses': n(f, 'CYTotalExpensesAmt'),
                   'grants': n(f, 'CYGrantsAndSimilarPaidAmt'), 'pay': n(f, 'CYSalariesCompEmpBnftPaidAmt'),
                   'assets': n(f, 'TotalAssetsEOYAmt'), 'net': n(f, 'NetAssetsOrFundBalancesEOYAmt')},
        'why': org.get('why', ''), 'web_note': org.get('web_note', ''), 'note': org.get('note', ''),
    }
    # Part VII: people, with pay as filed (from the group, from related groups, other pay such as benefits)
    ppl = []
    for g in f.findall(NS + 'Form990PartVIISectionAGrp'):
        name = t(g, 'PersonNm') or biz(g, 'BusinessName')
        a, b, c = n(g, 'ReportableCompFromOrgAmt') or 0, n(g, 'ReportableCompFromRltdOrgAmt') or 0, n(g, 'OtherCompensationAmt') or 0
        role = [w for k, w in (('IndividualTrusteeOrDirectorInd', 'board'), ('OfficerInd', 'officer'), ('KeyEmployeeInd', 'key employee'),
                                ('HighestCompensatedEmployeeInd', 'highest paid employee'), ('FormerOfcrDirectorTrusteeInd', 'former')) if t(g, k)]
        ppl.append([name, t(g, 'TitleTxt'), a, b, c, ', '.join(role), t(g, 'AverageHoursPerWeekRt')])
    ppl.sort(key=lambda p: -(p[2] + p[3] + p[4]))
    o['people'] = ppl
    # Schedule B: donors. Public copies of 501(c)(3) and (c)(4) returns leave out names and addresses.
    sb = d.find(NS + 'IRS990ScheduleB')
    rows = sb.findall(NS + 'ContributorInformationGrp') if sb is not None else []
    shown = [r for r in rows if t(r, 'ContributorPersonNm') or (biz(r, 'ContributorBusinessName') and 'RESTRICTED' not in biz(r, 'ContributorBusinessName').upper())]
    amt_hidden = any('RESTRICTED' in t(r, 'TotalContributionsAmt').upper() for r in rows)
    o['schedule_b'] = {'filed': sb is not None, 'entries': len(rows), 'names_shown': len(shown), 'amounts_hidden': amt_hidden}
    # Schedule C: politics and lobbying
    sc = d.find(NS + 'IRS990ScheduleC')
    pol = {'filed': sc is not None}
    if sc is not None:
        pol.update({'political_expenditures': n(sc, 'PoliticalExpendituresAmt'), 'spent_directly': n(sc, 'Expended527ActivitiesAmt'),
                    'given_to_527s': n(sc, 'InternalFundsContributedAmt'), 'exempt_function_total': n(sc, 'TotalExemptFunctionExpendAmt'),
                    'volunteer_hours': n(sc, 'VolunteerHoursCnt'),
                    'lobbying': n(sc, 'TotalLobbyingExpendGrp/FilingOrganizationsTotalAmt') if n(sc, 'TotalLobbyingExpendGrp/FilingOrganizationsTotalAmt') is not None else n(sc, 'TotalLobbyingExpendituresAmt'),
                    'lobbying_dues_nondeductible': bool(t(sc, 'SubstantiallyAllDuesNondedInd') in ('1', 'true', 'X'))})
        p527 = []
        for g in sc.findall(NS + 'Section527PoliticalOrgGrp'):
            p527.append({'name': biz(g, 'OrganizationBusinessName'), 'ein': t(g, 'EIN'), 'paid': n(g, 'PaidInternalFundsAmt') or 0,
                         'passed_on': n(g, 'ContributionsRcvdDlvrAmt') or 0, 'city': t(g, 'USAddress/CityNm'), 'state': t(g, 'USAddress/StateAbbreviationCd')})
        p527.sort(key=lambda x: -(x['paid'] + x['passed_on']))
        pol['p527_all'] = {'lines': len(p527), 'paid': sum(x['paid'] for x in p527), 'passed_on': sum(x['passed_on'] for x in p527)}
        pol['p527'] = p527[:LIMIT]
    o['politics'] = pol
    # Schedule I: grants to U.S. groups
    si = d.find(NS + 'IRS990ScheduleI')
    gr = []
    if si is not None:
        for g in si.findall(NS + 'RecipientTable'):
            gr.append({'name': biz(g, 'RecipientBusinessName'), 'ein': t(g, 'RecipientEIN'), 'section': t(g, 'IRCSectionDesc'),
                       'cash': n(g, 'CashGrantAmt') or 0, 'noncash': n(g, 'NonCashAssistanceAmt') or 0, 'purpose': t(g, 'PurposeOfGrantTxt'),
                       'city': t(g, 'USAddress/CityNm'), 'state': t(g, 'USAddress/StateAbbreviationCd')})
    gr.sort(key=lambda x: -(x['cash'] + x['noncash']))
    o['grants_all'] = {'lines': len(gr), 'total': sum(x['cash'] + x['noncash'] for x in gr)}
    o['grants'] = gr[:LIMIT]
    o['foreign_grants'] = d.find(NS + 'IRS990ScheduleF') is not None
    # Schedule R: related groups (Part II tax-exempt, Part IV taxable) and money moved between them (Part V)
    sr = d.find(NS + 'IRS990ScheduleR')
    rel, rtx = [], []
    if sr is not None:
        for g in sr.findall(NS + 'IdRelatedTaxExemptOrgGrp'):
            rel.append({'name': biz(g, 'DisregardedEntityName') or biz(g, 'RelatedOrganizationName'), 'ein': t(g, 'EIN'), 'kind': t(g, 'ExemptCodeSectionTxt'),
                        'state': t(g, 'LegalDomicileStateCd'), 'activity': t(g, 'PrimaryActivitiesTxt'), 'controlled': t(g, 'ControlledOrganizationInd') in ('1', 'true', 'X')})
        for g in sr.findall(NS + 'IdRelatedOrgTxblCorpTrGrp'):
            rel.append({'name': biz(g, 'RelatedOrganizationName'), 'ein': t(g, 'EIN'), 'kind': t(g, 'EntityTypeTxt') or 'taxable',
                        'state': t(g, 'LegalDomicileStateCd'), 'activity': t(g, 'PrimaryActivitiesTxt'), 'controlled': t(g, 'ControlledOrganizationInd') in ('1', 'true', 'X')})
        for g in sr.findall(NS + 'TransactionsRelatedOrgGrp'):
            code = t(g, 'TransactionTypeTxt').upper()
            rtx.append({'name': biz(g, 'OtherOrganizationName'), 'code': code, 'what': RTX.get(code, 'type ' + code), 'amount': n(g, 'InvolvedAmt')})
        rtx.sort(key=lambda x: -(x['amount'] or 0))
    o['related'], o['related_money'] = rel, rtx
    return o


def refresh_ids(cfg_path):
    cfg = json.load(open(cfg_path, encoding='utf-8'))
    for org in cfg['orgs']:
        req = urllib.request.Request(PP_API + org['ein'].lstrip('0') + '.json', headers={'User-Agent': 'TheWay-nonprofit-trail/1.0'})
        with urllib.request.urlopen(req, timeout=60) as r:
            j = json.load(r)
        oid = (j.get('organization') or {}).get('latest_object_id')
        if oid and oid != org['object_id']:
            print(org['label'], org['object_id'], '->', oid)
            org['object_id'], org['object_id_source'] = oid, 'ProPublica Nonprofit Explorer API latest_object_id'
    with open(cfg_path, 'w', encoding='utf-8') as f:
        json.dump(cfg, f, indent=1, ensure_ascii=False)
        f.write('\n')


def main():
    a = sys.argv[1:]
    if not a:
        raise SystemExit(__doc__)
    site = a[0]
    opt = lambda k, dflt: a[a.index(k) + 1] if k in a else dflt
    cache, base = opt('--cache', os.path.join('tools', 'money-trail', '.irs990-cache')), opt('--xml-base', XML_BASE)
    cfg_path = os.path.join('tools', 'money-trail', 'nonprofits.json')
    if '--refresh-ids' in a:
        refresh_ids(cfg_path)
    os.makedirs(cache, exist_ok=True)
    cfg = json.load(open(cfg_path, encoding='utf-8'))
    fec, ents = fec_names(site)
    # IRS Business Master File (exempt organizations): the legal name for each EIN, so a dot is named the way the IRS names it.
    bmf = {}
    if '--bmf' in a:
        import csv
        with open(opt('--bmf', ''), newline='', encoding='utf-8', errors='replace') as f:
            for r in csv.DictReader(f):
                bmf[r['EIN'].strip()] = re.sub(r'\s+', ' ', r['NAME']).strip()
        cfg['meta']['bmf_file'] = os.path.basename(opt('--bmf', ''))
    orgs = []
    for org in cfg['orgs']:
        if org.get('web_id') and org['web_id'] not in ents:
            raise SystemExit('web_id %s for %s is not on the Money web' % (org['web_id'], org['label']))
        if org.get('web_id'):
            org['web_name'] = ents[org['web_id']][0]
        orgs.append(parse(get_xml(org['object_id'], cache, base), org))
    by_ein = {o['ein']: o for o in orgs}
    alias = {norm(k): v for k, v in cfg['meta'].get('fec_alias', {}).items()}
    fkey = lambda nm, st: 'fecname:' + re.sub(r'[^A-Z0-9]+', '_', nm.upper()).strip('_') + '_' + st.upper()

    def best(nm, st):
        """Where a name written on the return meets the Money web: an FEC committee with that exact name (or a hand alias),
        else a name already on FEC filings with the same name and state, else nothing."""
        if norm(nm) in alias:
            c = alias[norm(nm)]
            return 'fec:' + c, ents.get('fec:' + c, [nm.upper()])[0], 'fec'
        hit = fec.get(norm(nm))
        if hit:
            return 'fec:' + hit[0], ents.get('fec:' + hit[0], [hit[1]])[0], 'fec'
        k = fkey(nm, st) if st else ''
        if k in ents:
            return k, ents[k][0], 'fecname'
        return None
    # One dot per EIN: every spelling of one EIN goes to the same dot. An FEC match for any spelling wins, then the first spelling.
    lines = [(g, 'grant') for o in orgs for g in o['grants']] + [(p, '527') for o in orgs for p in o['politics'].get('p527', [])]
    pick = {}
    for x, _ in lines:
        e = x['ein']
        if not e or e in by_ein:
            continue
        b = best(x['name'], x['state'])
        cur = pick.get(e)
        if b and (not cur or cur[2] == 'irs' or (cur[2] == 'fecname' and b[2] == 'fec')):
            pick[e] = b
        elif not cur:
            pick[e] = ('irs:' + e, bmf.get(e, x['name']).upper(), 'irs')
    for x, _ in lines:
        e = x['ein']
        if e in by_ein:
            x['to_id'], x['to_name'], how = by_ein[e]['web_id'], by_ein[e]['web_name'], 'ein'
        elif e:
            x['to_id'], x['to_name'], how = pick[e]
        else:
            b = best(x['name'], x['state'])
            x['to_id'], x['to_name'], how = b if b else ('', x['name'].upper(), 'name')
        x['match'] = how
        if how == 'fec':
            x['fec_id'] = x['to_id'][4:]
    meta = dict(cfg['meta'])
    meta.update({'limit': LIMIT, 'xml_base': base, 'groups': len(orgs)})
    out = os.path.join(site, 'money-trail', 'nonprofits.js')
    with open(out, 'w', encoding='utf-8') as f:
        f.write('// Nonprofits for the Money web, the Nonprofit tracker and the Nonprofit Trail page (D280). Built by tools/money-trail/build_nonprofits.py. Do not edit by hand.\n')
        f.write('// Every figure is copied from one IRS Form 990 return (IRS e-file XML). Nothing is estimated. Donor names are not in these returns.\n')
        f.write('window.TW_NONPROFITS=' + json.dumps({'meta': meta, 'orgs': orgs}, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print('wrote', out, os.path.getsize(out), 'bytes,', len(orgs), 'groups')


if __name__ == '__main__':
    main()
