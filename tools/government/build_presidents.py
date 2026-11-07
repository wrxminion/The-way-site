#!/usr/bin/env python3
"""Builds the presidents layer and the Federal Reserve page of the Government section.

Writes:
  site/government/presidents/index.html          every presidency, with the money during its budget years
  site/government/presidents/<slug>.html         one page per president (Cleveland and Trump: one page, two presidencies)
  site/government/federal-reserve/index.html     what the Fed is, who owns the Reserve Banks, who picks whom, every chair

Run from the repo root:
  python3 tools/government/build_presidents.py ../congress-legislators [judges.csv]

Data (all public, saved in tools/government/data/presidents/):
  treasury-debt-outstanding.csv   Treasury Fiscal Data, Historical Debt Outstanding API, 1790 to 2026 (fetched Nov 6, 2026)
  omb-budget-fy1901-2026.csv      OMB receipts, outlays and surplus or deficit, millions of dollars, as published by FRED
                                  (series FYFR, FYONET, FYFSD, updated Oct 28, 2026). Checked against CBO: within $4.3 billion.
  cbo-gdp-shares-fy1962-2025.csv  CBO Historical Budget Data, February 2026 (github.com/US-CBO/cbo-data), shares of GDP
  fjc-appointments.json           made from the Federal Judicial Center judges.csv when that file is passed; reused otherwise
Presidents and vice presidents come from executive.yaml in the congress-legislators dataset.
FY2026 receipts and outlays are left out until the OMB tables carry the final year.
"""
import csv
import datetime
import glob
import json
import os
import re
import sys

import yaml

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_congress import ROOT, SITE_URL, e, full_name, git_info, long_date, ordinal, page  # noqa: E402
from build_executive import presidencies  # noqa: E402
from photos import figure_html  # noqa: E402  D230: building photos

DATA = os.path.join(ROOT, 'tools', 'government', 'data', 'presidents')
OUT = os.path.join(ROOT, 'site', 'government', 'presidents')
FED_OUT = os.path.join(ROOT, 'site', 'government', 'federal-reserve')
EXTRA_CSS = '/government/presidents/presidents.css?v=1'
LAST_BUDGET_FY = 2025
CHECKED = 'November 6, 2026'

TREASURY_URL = 'https://fiscaldata.treasury.gov/datasets/historical-debt-outstanding/'
OMB_URL = 'https://www.whitehouse.gov/omb/information-resources/budget/historical-tables/'
FRED_URL = 'https://fred.stlouisfed.org/series/FYFSD'
CBO_URL = 'https://www.cbo.gov/data/budget-economic-data'
FJC_URL = 'https://www.fjc.gov/history/judges/biographical-directory-article-iii-federal-judges-export'
APP = 'https://www.presidency.ucsb.edu'

# govtrack id -> (page slug, name used by the Federal Judicial Center, American Presidency Project paths, library site)
# APP paths and library sites as linked from presidency.ucsb.edu/presidents and archives.gov/presidential-libraries (Nov 6, 2026).
PRESIDENTS = {
    411351: ('george-washington', 'George Washington', ['/people/president/george-washington'], ''),
    400699: ('john-adams', 'John Adams', ['/people/president/john-adams'], ''),
    405974: ('thomas-jefferson', 'Thomas Jefferson', ['/people/president/thomas-jefferson'], ''),
    407071: ('james-madison', 'James Madison', ['/people/president/james-madison'], ''),
    407829: ('james-monroe', 'James Monroe', ['/people/president/james-monroe'], ''),
    400702: ('john-quincy-adams', 'John Quincy Adams', ['/people/president/john-quincy-adams'], ''),
    405913: ('andrew-jackson', 'Andrew Jackson', ['/people/president/andrew-jackson'], ''),
    411074: ('martin-van-buren', 'Martin Van Buren', ['/people/president/martin-van-buren'], ''),
    405153: ('william-henry-harrison', '', ['/people/president/william-henry-harrison'], ''),
    411018: ('john-tyler', 'John Tyler', ['/people/president/john-tyler'], ''),
    408802: ('james-k-polk', 'James K. Polk', ['/people/president/james-k-polk'], ''),
    412344: ('zachary-taylor', 'Zachary Taylor', ['/people/president/zachary-taylor'], ''),
    404072: ('millard-fillmore', 'Millard Fillmore', ['/people/president/millard-fillmore'], ''),
    408730: ('franklin-pierce', 'Franklin Pierce', ['/people/president/franklin-pierce'], ''),
    401954: ('james-buchanan', 'James Buchanan', ['/people/president/james-buchanan'], ''),
    406807: ('abraham-lincoln', 'Abraham Lincoln', ['/people/president/abraham-lincoln'], ''),
    406017: ('andrew-johnson', 'Andrew Johnson', ['/people/president/andrew-johnson'], ''),
    412350: ('ulysses-s-grant', 'Ulysses Grant', ['/people/president/ulysses-s-grant'], ''),
    405261: ('rutherford-b-hayes', 'Rutherford B. Hayes', ['/people/president/rutherford-b-hayes'], ''),
    404436: ('james-a-garfield', 'James A. Garfield', ['/people/president/james-garfield'], ''),
    400945: ('chester-a-arthur', 'Chester A. Arthur', ['/people/president/chester-arthur'], ''),
    412354: ('grover-cleveland', 'Grover Cleveland', ['/people/president/grover-cleveland', '/people/president/grover-cleveland-0'], ''),
    405139: ('benjamin-harrison', 'Benjamin Harrison', ['/people/president/benjamin-harrison'], ''),
    407515: ('william-mckinley', 'William McKinley', ['/people/president/william-mckinley'], ''),
    409394: ('theodore-roosevelt', 'Theodore Roosevelt', ['/people/president/theodore-roosevelt'], ''),
    412359: ('william-howard-taft', 'William H. Taft', ['/people/president/william-howard-taft'], ''),
    412360: ('woodrow-wilson', 'Woodrow Wilson', ['/people/president/woodrow-wilson'], ''),
    405073: ('warren-g-harding', 'Warren G. Harding', ['/people/president/warren-g-harding'], ''),
    402859: ('calvin-coolidge', 'Calvin Coolidge', ['/people/president/calvin-coolidge'], ''),
    412363: ('herbert-hoover', 'Herbert Hoover', ['/people/president/herbert-hoover'], 'https://hoover.archives.gov/'),
    412364: ('franklin-d-roosevelt', 'Franklin D. Roosevelt', ['/people/president/franklin-d-roosevelt'], 'https://www.fdrlibrary.org/'),
    410956: ('harry-s-truman', 'Harry S Truman', ['/people/president/harry-s-truman'], 'https://www.trumanlibrary.gov/'),
    412366: ('dwight-d-eisenhower', 'Dwight D. Eisenhower', ['/people/president/dwight-d-eisenhower'], 'http://www.eisenhowerlibrary.gov/'),
    406274: ('john-f-kennedy', 'John F. Kennedy', ['/people/president/john-f-kennedy'], 'http://www.jfklibrary.org/'),
    406058: ('lyndon-b-johnson', 'Lyndon B. Johnson', ['/people/president/lyndon-b-johnson'], 'http://www.lbjlibrary.org/'),
    408200: ('richard-nixon', 'Richard M. Nixon', ['/people/president/richard-nixon'], 'http://www.nixonlibrary.gov/'),
    404212: ('gerald-r-ford', 'Gerald Ford', ['/people/president/gerald-r-ford'], 'http://www.fordlibrarymuseum.gov/'),
    412371: ('jimmy-carter', 'Jimmy Carter', ['/people/president/jimmy-carter'], 'http://www.jimmycarterlibrary.gov/'),
    412372: ('ronald-reagan', 'Ronald Reagan', ['/people/president/ronald-reagan'], 'http://www.reaganlibrary.gov/'),
    402108: ('george-h-w-bush', 'George H.W. Bush', ['/people/president/george-bush'], 'https://www.bush41library.gov/'),
    412374: ('william-j-clinton', 'William J. Clinton', ['/people/president/william-j-clinton'], 'https://www.clintonlibrary.gov/'),
    412375: ('george-w-bush', 'George W. Bush', ['/people/president/george-w-bush'], 'http://www.georgewbushlibrary.gov/'),
    400629: ('barack-obama', 'Barack Obama', ['/people/president/barack-obama'], 'https://www.obamalibrary.gov/'),
    300008: ('joseph-r-biden-jr', 'Joseph R. Biden', ['/people/president/joseph-r-biden-jr'], 'https://www.bidenlibrary.gov/'),
    412733: ('donald-j-trump', 'Donald J. Trump', ['/people/president/donald-j-trump-1st-term', '/people/president/donald-j-trump-2nd-term'],
             'https://www.trumplibrary.gov/'),
}

# Chairs, as listed on federalreserve.gov "Board Members Since 1914" (read Nov 6, 2026).
FED_CHAIRS_EX_OFFICIO = [  # the Secretary of the Treasury chaired the Federal Reserve Board, 1913 to 1936
    ('W. G. McAdoo', '1913-12-23', '1918-12-15'), ('Carter Glass', '1918-12-16', '1920-02-01'),
    ('David F. Houston', '1920-02-02', '1921-03-03'), ('Andrew W. Mellon', '1921-03-04', '1932-02-12'),
    ('Ogden L. Mills', '1932-02-12', '1933-03-04'), ('William H. Woodin', '1933-03-04', '1933-12-31'),
    ('Henry Morgenthau, Jr.', '1934-01-01', '1936-02-01'),
]
FED_CHAIRS = [
    ('Marriner S. Eccles', '1936-02-01', '1948-01-31'), ('Thomas B. McCabe', '1948-04-15', '1951-03-31'),
    ('William McChesney Martin, Jr.', '1951-04-02', '1970-01-31'), ('Arthur F. Burns', '1970-02-01', '1978-01-31'),
    ('G. William Miller', '1978-03-08', '1979-08-06'), ('Paul A. Volcker', '1979-08-06', '1987-08-11'),
    ('Alan Greenspan', '1987-08-11', '2006-01-31'), ('Ben S. Bernanke', '2006-02-01', '2014-01-31'),
    ('Janet L. Yellen', '2014-02-03', '2018-02-03'), ('Jerome H. Powell', '2018-02-05', '2026-05-22'),
    ('Kevin Warsh', '2026-05-22', ''),
]
FED_MEMBERS_URL = 'https://www.federalreserve.gov/aboutthefed/bios/board/boardmembership.htm'

D = datetime.date.fromisoformat


def src(url, label):
    host = url.split('/')[2].replace('www.', '')
    return '<a class="gw-source" href="%s">%s: %s ↗</a>' % (e(url), e(label), e(host))


# ---------- fiscal years ----------

def fy_start(y):
    """First day of federal fiscal year y. Calendar years until 1842, a half year in 1843, July to June until 1976, then October."""
    if y <= 1843:
        return datetime.date(y, 1, 1)
    if y <= 1976:
        return datetime.date(y - 1, 7, 1)
    return datetime.date(y - 1, 10, 1)


def fy_end(y):
    if y <= 1842:
        return datetime.date(y, 12, 31)
    if y <= 1976:
        return datetime.date(y, 6, 30)
    return datetime.date(y, 9, 30)


def fy_words(y):
    s, t = fy_start(y), fy_end(y)
    return '%s %d to %s %d' % (long_date(s.isoformat()).split(' ')[0], s.year, long_date(t.isoformat()).split(' ')[0], t.year)


# ---------- money ----------

def sig(x):
    return '%.2f' % x if x < 10 else '%.1f' % x if x < 100 else '%.0f' % x


def money(d):
    """Dollars to short words, e.g. $997.9 billion -> '$998 billion'."""
    neg = d < 0
    d = abs(d)
    if d >= 1e12:
        s = '$%s trillion' % sig(d / 1e12)
    elif d >= 1e9:
        s = '$%s billion' % sig(d / 1e9)
    elif d >= 1e6:
        s = '$%s million' % sig(d / 1e6)
    else:
        s = '${:,.0f}'.format(d)
    return ('-' if neg else '') + s


def balance_words(m):
    """Surplus or deficit in millions -> words."""
    if m > 0:
        return 'Surplus of ' + money(m * 1e6)
    if m < 0:
        return 'Deficit of ' + money(-m * 1e6)
    return 'Balanced'


def load_money():
    debt = []
    with open(os.path.join(DATA, 'treasury-debt-outstanding.csv'), encoding='utf-8') as fh:
        for r in csv.DictReader(fh):
            debt.append((D(r['record_date']), float(r['debt_outstanding_amt'])))
    debt.sort()
    omb = {}
    with open(os.path.join(DATA, 'omb-budget-fy1901-2026.csv'), encoding='utf-8') as fh:
        for r in csv.DictReader(fh):
            y = int(r['fiscal_year'])
            if y <= LAST_BUDGET_FY:
                omb[y] = (float(r['receipts_millions']), float(r['outlays_millions']), float(r['surplus_or_deficit_millions']))
    cbo = {}
    with open(os.path.join(DATA, 'cbo-gdp-shares-fy1962-2025.csv'), encoding='utf-8') as fh:
        for r in csv.DictReader(fh):
            cbo[int(r['fiscal_year'])] = {k: float(v) for k, v in r.items() if k != 'fiscal_year'}
    return debt, omb, cbo


def debt_on_or_before(debt, day):
    best = None
    for d, v in debt:
        if d <= day:
            best = (d, v)
    return best


# ---------- judges ----------

def build_fjc(path, pres):
    """Article III appointments per presidency from FJC judges.csv -> fjc-appointments.json."""
    by_fjc = {v[1]: k for k, v in PRESIDENTS.items() if v[1]}
    out = {}
    with open(path, encoding='utf-8') as fh:
        for r in csv.DictReader(fh):
            name = ' '.join(x.strip() for x in (r['First Name'], r['Middle Name'], r['Last Name']) if x.strip())
            if r['Suffix'].strip():
                name += ', ' + r['Suffix'].strip()
            for i in range(1, 7):
                p = r.get('Appointing President (%d)' % i, '').strip()
                if p not in by_fjc:
                    continue
                when = (r.get('Commission Date (%d)' % i) or r.get('Recess Appointment Date (%d)' % i) or
                        r.get('Confirmation Date (%d)' % i) or r.get('Nomination Date (%d)' % i) or '').strip()
                gt = by_fjc[p]
                cands = [x for x in pres if x['person']['id']['govtrack'] == gt]
                n = cands[0]['n']
                for x in cands:  # two presidencies: pick the one the commission falls in
                    if when and x['start'] <= when < x['end']:
                        n = x['n']
                rec = out.setdefault(str(n), {'counts': {}, 'justices': []})
                ct = r['Court Type (%d)' % i].strip()
                key = {'Supreme Court': 'Supreme Court', 'U.S. Court of Appeals': 'Courts of appeals',
                       'U.S. District Court': 'District courts'}.get(ct, 'Other federal courts')
                rec['counts'][key] = rec['counts'].get(key, 0) + 1
                if ct == 'Supreme Court':
                    rec['justices'].append({'name': name, 'title': r['Appointment Title (%d)' % i].strip(), 'commission': when,
                                            'end': ((r.get('Senior Status Date (%d)' % i) or '').strip() or
                                                    (r.get('Termination Date (%d)' % i) or '').strip()), 'nid': r['nid'].strip()})
    for rec in out.values():
        rec['justices'].sort(key=lambda j: j['commission'])
    with open(os.path.join(DATA, 'fjc-appointments.json'), 'w', encoding='utf-8', newline='\n') as fh:
        json.dump({'source': FJC_URL, 'downloaded': 'November 6, 2026', 'by_presidency': out}, fh, indent=1, sort_keys=True)
        fh.write('\n')


def judge_pages():
    """FJC nid -> slug for the judge pages that exist (sitting judges)."""
    m = {}
    for f in glob.glob(os.path.join(ROOT, 'site', 'government', 'courts', 'judges', '*.html')):
        hit = re.search(r'fjc\.gov/node/(\d+)', open(f, encoding='utf-8').read())
        if hit:
            m[hit.group(1)] = os.path.basename(f)[:-5]
    return m


# ---------- pages ----------

def shell(title, desc, canonical, crumbs, body, depth):
    h = page(title, desc, canonical, crumbs, body, depth)
    return h.replace('<link rel="canonical"', '<link rel="stylesheet" href="%s">\n<link rel="canonical"' % EXTRA_CSS, 1)


def years(p, today):
    if p['end'] <= today and p['start'][:4] == p['end'][:4]:
        return p['start'][:4]
    return '%s to %s' % (p['start'][:4], p['end'][:4]) if p['end'] <= today else '%s to now (term ends %s)' % (p['start'][:4], p['end'][:4])


def budget_years(p):
    s, t = D(p['start']), min(D(p['end']), datetime.date.today())
    return [y for y in range(1789, 2031) if s <= fy_start(y) < t]


def money_for(p, debt, omb, cbo):
    ys = budget_years(p)
    m = {'years': ys}
    if not ys:
        return m
    m['debt_start'] = debt_on_or_before(debt, fy_start(ys[0]))
    end = debt_on_or_before(debt, fy_end(ys[-1]) + datetime.timedelta(days=1))
    if end and m['debt_start'] and end[0] > m['debt_start'][0]:
        m['debt_end'] = end
    m['rows'] = []
    for y in ys:
        d = debt_on_or_before(debt, fy_end(y) + datetime.timedelta(days=1))
        if d and d[0] < fy_start(y):
            d = None
        m['rows'].append((y, omb.get(y), cbo.get(y), d))
    m['rows'] = [r for r in m['rows'] if r[1] or r[3]]
    return m


def chart(rows):
    """Bars for surplus (up) or deficit (down) each budget year, millions of dollars."""
    vals = [(y, o[2]) for y, o, c, d in rows if o]
    if len(vals) < 2:
        return ''
    pos = max(0, max(v for _, v in vals))
    neg = max(0, -min(v for _, v in vals))
    plot = 160.0
    scale = plot / ((pos + neg) or 1)
    w = 600
    mid = 10 + pos * scale
    h = int(10 + plot + 26)
    bw = min(48, (w - 20) / len(vals))
    x0 = (w - bw * len(vals)) / 2
    bars, labels = [], []
    for i, (y, v) in enumerate(vals):
        x = x0 + i * bw
        bh = abs(v) * scale
        cls = 'pr-up' if v >= 0 else 'pr-down'
        y0 = mid - bh if v >= 0 else mid
        bars.append('<rect class="%s" x="%.1f" y="%.1f" width="%.1f" height="%.1f"><title>Fiscal %d: %s</title></rect>' % (
            cls, x + bw * 0.12, y0, bw * 0.76, max(bh, 1), y, e(balance_words(v))))
        if len(vals) <= 12 or i % 2 == 0:
            labels.append('<text x="%.1f" y="%d">%s</text>' % (x + bw / 2, h - 6, "'" + str(y)[2:]))
    return ('<figure class="pr-chart"><svg viewBox="0 0 %d %d" role="img" aria-labelledby="pr-ct"><title id="pr-ct">Surplus or deficit in each '
            'budget year. Bars above the line are surpluses, bars below are deficits. Dollars, not adjusted for inflation.</title>'
            '<path class="pr-axis" d="M%.1f %.1fh%.1f"/>%s%s</svg><figcaption>Above the line: surplus. Below the line: deficit. '
            'Hover or tap a bar for the amount.</figcaption></figure>') % (w, h, x0 - 4, mid, bw * len(vals) + 8, ''.join(bars), ''.join(labels))


RULE = ('Congress writes and passes the laws that set taxes and spending. The president can sign or veto them, and today also sends '
        'Congress a budget proposal each year. Here a fiscal year counts toward a presidency when it began while that president was in '
        'office. Wars, recessions and laws passed in earlier years also shape these numbers, so they show what happened during the '
        'years, not who caused it. Dollars are not adjusted for inflation.')


def money_section(p, m, label):
    if not m['years']:
        return ('<section class="gv-sec"><div class="gw-heading"><span>Follow the money%s</span><h2>No budget year began.</h2>'
                '<p>No federal fiscal year began during this presidency, so there is no budget year to show.</p></div></section>') % label
    ys = m['years']
    tiles = []
    if m.get('debt_start'):
        tiles.append(('National debt at the start', money(m['debt_start'][1]), 'on ' + long_date(m['debt_start'][0].isoformat())))
    if m.get('debt_end'):
        ongoing = p['end'] > datetime.date.today().isoformat()
        tiles.append(('National debt so far' if ongoing else 'National debt at the end', money(m['debt_end'][1]), 'on ' + long_date(m['debt_end'][0].isoformat())))
        ch = m['debt_end'][1] - m['debt_start'][1]
        ratio = m['debt_end'][1] / m['debt_start'][1]
        how_much = ('%.1f times the starting amount' % ratio) if ratio >= 2 else (
            '%.0f%% %s' % (abs(ratio - 1) * 100, 'higher' if ch >= 0 else 'lower'))
        tiles.append(('Change in the debt', ('Up ' if ch >= 0 else 'Down ') + money(abs(ch)), how_much))
    bal = [o[2] for y, o, c, d in m['rows'] if o]
    if bal:
        s = sum(bal)
        surplus_n = sum(1 for b in bal if b > 0)
        tiles.append(('All budget years added up', balance_words(s), '%d of %d years with a surplus' % (surplus_n, len(bal))))
    tile_html = ''.join('<div class="gv-tile"><span>%s</span><strong>%s</strong><em>%s</em></div>' % (e(a), e(b), e(c)) for a, b, c in tiles)
    head = ['Fiscal year', 'Receipts', 'Outlays', 'Surplus or deficit', 'Deficit as share of economy', 'Debt at year end']
    body = []
    for y, o, c, d in m['rows']:
        share = ''
        if c:
            v = c['deficit_total_gdp_share']
            share = ('%.1f%% surplus' % v) if v > 0 else ('%.1f%%' % -v)
        body.append('<tr><td>%d<span class="gv-muted"> %s</span></td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>' % (
            y, e(fy_words(y)), e(money(o[0] * 1e6)) if o else '', e(money(o[1] * 1e6)) if o else '',
            e(balance_words(o[2])) if o else '', e(share), e(money(d[1])) if d else ''))
    notes = []
    if any(not o and y < 1901 for y, o, c, d in m['rows']):
        notes.append('Yearly receipts and outlays start in fiscal 1901 in the series used here.')
    if ys[-1] > LAST_BUDGET_FY:
        notes.append('Fiscal %d and later receipts and outlays are not shown yet: they wait for the final totals in the OMB tables.' % (LAST_BUDGET_FY + 1))
    if 1976 in ys or 1977 in ys:
        notes.append('In 1976 the fiscal year moved from July to October. The three months between (July to September 1976) are not in the yearly series.')
    span = 'fiscal %d' % ys[0] if len(ys) == 1 else 'fiscal %d to %d' % (ys[0], ys[-1])
    if p['end'] > datetime.date.today().isoformat():
        span += ' so far'
    return ('<section class="gv-sec" id="money"><div class="gw-heading"><span>Follow the money%s</span><h2>The budget years: %s.</h2>'
            '<p>%s</p></div><div class="gv-tiles">%s</div>%s'
            '<details><summary>Every budget year</summary><div class="gw-detail gv-scroll"><table class="gv-table pr-table"><thead><tr>%s</tr></thead>'
            '<tbody>%s</tbody></table><p class="gv-small">%s</p></div></details>'
            '<p class="gv-small">%s %s %s %s</p></section>') % (
        label, e(span), e(RULE), tile_html, chart(m['rows']), ''.join('<th>%s</th>' % h for h in head), ''.join(body), e(' '.join(notes)),
        src(TREASURY_URL, 'Debt: U.S. Treasury'), src(OMB_URL, 'Receipts and outlays: OMB Historical Tables'),
        src(FRED_URL, 'via FRED'), src(CBO_URL, 'Shares of the economy: CBO'))


def fed_chairs_during(p):
    out = []
    for n, s, t in FED_CHAIRS_EX_OFFICIO + FED_CHAIRS:
        if p['start'] <= s < p['end']:
            out.append((n, s))
    return out


def president_page(gt, plist, all_pres, debt, omb, cbo, fjc, jpages, today, vps):
    slug, _, app_paths, library = PRESIDENTS[gt]
    person = plist[0]['person']
    name = full_name(person)
    nums = ' and '.join(ordinal(p['n']) for p in plist)
    sections = []
    key_fact = ''
    for idx, p in enumerate(plist):
        label = '' if len(plist) == 1 else ' / %s presidency' % ordinal(p['n'])
        m = money_for(p, debt, omb, cbo)
        if not key_fact and m.get('debt_end'):
            key_fact = '<p class="gv-key-fact"><strong>%s to %s</strong>National debt during the budget years, %s</p>' % (
                e(money(m['debt_start'][1])), e(money(m['debt_end'][1])),
                e('fiscal %d to %d' % (m['years'][0], m['rows'][-1][0]) if len(m['rows']) > 1 else 'fiscal %d' % m['years'][0]))
        party = ' / '.join(dict.fromkeys(x for x in p['parties'] if x))
        party = 'No party' if party == 'no party' else party
        how = {'election': 'Elected', 'succession': 'Succeeded to the office (the president died or resigned)',
               'appointment': 'Appointed'}.get(p['hows'][0], p['hows'][0])
        vp_names = []
        for t, x in vps:
            if t['start'] < p['end'] and t['end'] > p['start'] and x is not person:
                vp_names.append(full_name(x))
        vp_names = list(dict.fromkeys(vp_names))
        tiles = [('Presidency', ordinal(p['n'])), ('In office', '%s to %s' % (long_date(p['start']), long_date(p['end']) if p['end'] <= today else 'now')),
                 ('Party', party), ('How they took office', how),
                 ('Vice president' if len(vp_names) == 1 else 'Vice presidents', ', '.join(vp_names) if vp_names else 'None during this presidency')]
        who = ''.join('<div class="gv-tile"><span>%s</span><strong>%s</strong></div>' % (e(a), e(b)) for a, b in tiles)
        sections.append('<section class="gv-sec"><div class="gw-heading"><span>Layer 1 / Who%s</span><h2>%s presidency, %s.</h2></div>'
                        '<div class="gv-tiles">%s</div></section>' % (label, e(ordinal(p['n']).capitalize()), e(years(p, today)), who))
        sections.append(money_section(p, m, label))
        # appointments
        rec = fjc.get(str(p['n']), {})
        counts = rec.get('counts', {})
        js = rec.get('justices', [])
        parts = []
        if js:
            lis = []
            for j in js:
                nm = e(j['name'])
                link = ('<a href="/government/courts/judges/%s.html">%s</a>' % (jpages[j['nid']], nm)) if j['nid'] in jpages else (
                    '<a href="https://www.fjc.gov/node/%s">%s ↗</a>' % (e(j['nid']), nm))
                served = 'serving since %s' % j['commission'][:4] if not j['end'] else 'served %s to %s' % (j['commission'][:4], j['end'][:4])
                lis.append('<li>%s <span class="gv-muted">%s, %s</span></li>' % (link, e(j['title']), e(served)))
            parts.append('<h3>Supreme Court</h3><ul class="gv-list">%s</ul>' % ''.join(lis))
        if counts:
            total = sum(counts.values())
            order = ['Supreme Court', 'Courts of appeals', 'District courts', 'Other federal courts']
            parts.append('<p class="gv-big">%d <span>appointments to federal courts</span></p><ul class="gv-list">%s</ul>' % (
                total, ''.join('<li>%s: %d</li>' % (e(k), counts[k]) for k in order if k in counts)))
        chairs = fed_chairs_during(p)
        if chairs:
            parts.append('<h3>Federal Reserve</h3><ul class="gv-list">%s</ul>' % ''.join(
                '<li><a href="/government/federal-reserve/#chairs">%s</a> <span class="gv-muted">began as Chair on %s</span></li>' % (
                    e(n), e(long_date(s))) for n, s in chairs))
        if not parts:
            parts.append('<p>The Federal Judicial Center lists no federal judges appointed during this presidency.</p>')
        sections.append('<section class="gv-sec"><div class="gw-heading"><span>Layer 2 / Who they appointed%s</span><h2>Judges and the Fed.</h2>'
                        '<p>Federal judges serve with no fixed term, so these choices last long after a presidency ends. Counts are appointments '
                        '(one person moved to a higher court counts again). Fed chairs are listed by the date they began.</p></div>%s'
                        '<p class="gv-small">%s %s</p></section>' % (label, ''.join(parts), src(FJC_URL, 'Judges: Federal Judicial Center'),
                                                                     src(FED_MEMBERS_URL, 'Fed chairs: Federal Reserve Board')))
    reads = ['<li><a href="%s%s">%s ↗</a> <span class="gv-muted">speeches, orders and other documents</span></li>' % (
        APP, e(pth), 'American Presidency Project' + ('' if len(app_paths) == 1 else ' (%s presidency)' % ordinal(plist[i]['n'])))
        for i, pth in enumerate(app_paths)]
    if library:
        reads.append('<li><a href="%s">Presidential library ↗</a> <span class="gv-muted">run by the National Archives</span></li>' % e(library))
    threads = ('<section class="gv-sec"><div class="gw-heading"><span>Threads to pull</span><h2>Keep following.</h2></div><div class="gv-two">'
               '<article class="gw-card"><h3>Where the money goes next</h3><ul class="gv-list">'
               '<li><a href="/government/federal-reserve/">The Federal Reserve: a federal agency and 12 banks set up as corporations</a></li>'
               '<li><a href="/government/presidents/">Every president, the same numbers side by side</a></li>'
               '<li><a href="/money-trail/">The Money Trail: who funds campaigns and ballot measures</a></li></ul></article>'
               '<article class="gw-card"><h3>Read more</h3><ul class="gv-list">%s</ul></article></div></section>') % ''.join(reads)
    i0 = all_pres.index(plist[0])
    i1 = all_pres.index(plist[-1])
    nav = []
    if i0 > 0:
        q = all_pres[i0 - 1]
        nav.append('<a href="%s.html">← %s</a>' % (PRESIDENTS[q['person']['id']['govtrack']][0], e(full_name(q['person']))))
    nav.append('<a href="./">Every president</a>')
    if i1 + 1 < len(all_pres):
        q = all_pres[i1 + 1]
        nav.append('<a href="%s.html">%s →</a>' % (PRESIDENTS[q['person']['id']['govtrack']][0], e(full_name(q['person']))))
    if not key_fact:
        days = (D(plist[0]['end'] if plist[0]['end'] <= today else today) - D(plist[0]['start'])).days
        key_fact = '<p class="gv-key-fact"><strong>%d days</strong>in office</p>' % days
    yrs = ' and '.join(years(p, today) for p in plist)
    body = ('<header class="gv-hero"><p class="gw-eyebrow">%s president of the United States · %s</p>%s<h1>%s</h1>'
            '<p class="gv-lede">Who they were in office, the money during their budget years, and who they appointed. The same numbers, '
            'from the same sources, are on every president’s page.</p></header>'
            '<nav class="gw-jumps" aria-label="On this page"><a href="#money">Follow the money</a><a href="#threads">Threads to pull</a></nav>'
            '%s<div id="threads">%s</div>'
            '<section class="gw-record"><h2>Where this comes from.</h2><p>Terms, party and vice presidents: the congress-legislators dataset. '
            'Debt: U.S. Treasury, Historical Debt Outstanding. Receipts, outlays and surplus or deficit: OMB Historical Tables, as published by '
            'FRED. Shares of the economy: CBO Historical Budget Data, February 2026. Judges: Federal Judicial Center. Fed chairs: Federal Reserve '
            'Board. Checked %s. Nothing here rates or ranks anyone.</p><nav class="gv-next" aria-label="Keep exploring">%s</nav></section>') % (
        e(nums.capitalize()), e(yrs), key_fact, e(name), ''.join(sections), threads, CHECKED, ' · '.join(nav))
    desc = '%s, %s president (%s): the national debt, receipts, outlays and deficit or surplus in each budget year, and who they appointed. Official sources.' % (
        name, nums, yrs)
    crumbs = [('The Way', '/'), ('Government', '/how-government-works.html'), ('Executive branch', '/government/executive/'),
              ('Presidents', '/government/presidents/'), (name, None)]
    return shell(name, desc, '%s/government/presidents/%s.html' % (SITE_URL, slug), crumbs, body, 3)


def index_page(pres, debt, omb, cbo, today):
    rows = []
    for p in reversed(pres):
        gt = p['person']['id']['govtrack']
        m = money_for(p, debt, omb, cbo)
        if m.get('debt_end'):
            d = '%s to %s' % (money(m['debt_start'][1]), money(m['debt_end'][1]))
        else:
            d = ''
        bal = [o[2] for y, o, c, dd in m.get('rows', []) if o]
        span = ''
        if m['years']:
            span = 'fiscal %d' % m['years'][0] if len(m['years']) == 1 else 'fiscal %d to %d' % (m['years'][0], m['years'][-1])
        rows.append('<tr><td>%d</td><td><a href="%s.html">%s</a></td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>' % (
            p['n'], PRESIDENTS[gt][0], e(full_name(p['person'])), e(years(p, today)), e(span or 'none'), e(d),
            e(balance_words(sum(bal))) if bal else ''))
    body = ('<header class="gv-hero"><p class="gw-eyebrow">The executive branch · Every president</p>'
            '<p class="gv-huge">47 <span>presidencies, 45 people</span></p><h1>Every president, and the money during their years</h1>'
            '<p class="gv-lede">Open a president for who they were in office, the national debt, receipts, outlays and deficit or surplus in each '
            'budget year, and the judges and Fed chairs from their years.</p></header>'
            '<section class="gv-sec"><div class="gw-heading"><span>Layer 1 / The rule</span><h2>The same rule for everyone.</h2><p>%s</p></div>'
            '<div class="gw-detail gv-scroll"><table class="gv-table pr-table pr-idx"><thead><tr><th>No.</th><th>President</th><th>Years</th><th>Budget years</th>'
            '<th>National debt over those years</th><th>All budget years added up</th></tr></thead><tbody>%s</tbody></table></div>'
            '<p class="gv-small">Yearly receipts and outlays start in fiscal 1901, so earlier totals are blank. Fiscal %d and later wait for final OMB totals. '
            '%s %s %s</p></section>'
            '<section class="gv-sec"><div class="gw-heading"><span>Threads to pull</span><h2>Keep following.</h2></div><ul class="gv-list">'
            '<li><a href="/government/federal-reserve/">The Federal Reserve: what it is and who owns the Reserve Banks</a></li>'
            '<li><a href="/government/executive/">The executive branch today</a></li>'
            '<li><a href="/government/courts/">The federal courts and every judge</a></li>'
            '<li><a href="/government/congress/">Congress, which writes the budget laws</a></li></ul></section>'
            '<section class="gw-record"><h2>Where this comes from.</h2><p>U.S. Treasury, Historical Debt Outstanding. OMB Historical Tables, as '
            'published by FRED. CBO Historical Budget Data, February 2026. Terms from the congress-legislators dataset. Checked %s. Nothing here '
            'rates or ranks anyone.</p></section>') % (
        e(RULE), ''.join(rows), LAST_BUDGET_FY + 1, src(TREASURY_URL, 'U.S. Treasury'), src(OMB_URL, 'OMB'), src(CBO_URL, 'CBO'), CHECKED)
    return shell('Every president', 'Every U.S. president with the national debt, receipts, outlays and deficit or surplus during their budget '
                 'years, and the judges they appointed. Official sources, the same rule for everyone.', SITE_URL + '/government/presidents/',
                 [('The Way', '/'), ('Government', '/how-government-works.html'), ('Executive branch', '/government/executive/'),
                  ('Presidents', None)], body, 2)


# ---------- Federal Reserve ----------

LAW = 'https://www.law.cornell.edu/uscode/text/12/'
FED_FAQ = 'https://www.federalreserve.gov/faqs/about_14986.htm'
FED_WHO = 'https://www.federalreserve.gov/aboutthefed/structure-federal-reserve-system.htm'
FED_DIRECTORS = 'https://www.federalreserve.gov/aboutthefed/directors/about.htm'
STL = 'https://www.stlouisfed.org/in-plain-english/who-owns-the-federal-reserve-banks'
FACTCHECK = 'https://www.factcheck.org/2008/03/federal-reserve-bank-ownership'
FOMC = 'https://www.federalreserve.gov/monetarypolicy/fomc.htm'
FED_SYSTEM = 'https://www.federalreserve.gov/aboutthefed/federal-reserve-system.htm'
FED_EXPLAINED = 'https://www.federalreserve.gov/aboutthefed/fedexplained/who-we-are.htm'
FED_ACT = 'https://www.federalreservehistory.org/essays/federal-reserve-act-signed'
FED_EXTRA = {
    # district order, as listed on federalreserve.gov (read Nov 6, 2026)
    'banks': ['1 Boston', '2 New York', '3 Philadelphia', '4 Cleveland', '5 Richmond', '6 Atlanta', '7 Chicago', '8 St. Louis',
              '9 Minneapolis', '10 Kansas City', '11 Dallas', '12 San Francisco'],
    'fomc': ('<div class="gv-two pr-gap"><article class="gw-card"><p class="gw-eyebrow">Where rates are set</p><h3>The Federal Open Market Committee</h3>'
             '<p>The committee that “sets crucial U.S. monetary policy at meetings held at least 8 times each year.” It has 12 voting members: '
             'the 7 governors, the president of the New York Reserve Bank, and 4 of the other 11 Reserve Bank presidents, who take turns in '
             'one-year terms.</p><p>' + '<a class="gw-source" href="' + FOMC + '">Source: Federal Reserve Board ↗</a></p></article>'
             '<article class="gw-card"><p class="gw-eyebrow">What Congress asked for</p><h3>Its goals</h3><p>The Fed says it sets monetary '
             'policy “to promote maximum employment and stable prices in the U.S. economy,” the goals set by Congress.</p>'
             '<p>Congress created the Fed with the Federal Reserve Act, which President <a href="/government/presidents/woodrow-wilson.html">Woodrow '
             'Wilson</a> signed on December 23, 1913.</p><p><a class="gw-source" href="' + FED_EXPLAINED + '">Source: Federal Reserve Board ↗</a> '
             '<a class="gw-source" href="' + FED_ACT + '">Source: Federal Reserve History ↗</a></p></article></div>'),
    'fomc_note': '',
}


def fed_page(pres, fed_extra):
    def pres_at(day):
        for p in pres:
            if p['start'] <= day < p['end']:
                return p
        return None

    def chair_rows(rows):
        out = []
        for n, s, t in rows:
            p = pres_at(s)
            who = '<a href="/government/presidents/%s.html">%s</a>' % (PRESIDENTS[p['person']['id']['govtrack']][0], e(full_name(p['person']))) if p else ''
            out.append('<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>' % (e(n), e(long_date(s)), e(long_date(t)) if t else 'now', who))
        return ''.join(out)

    banks = fed_extra.get('banks', [])
    bank_html = ('<ul class="gv-list pr-banks">%s</ul><p>%s</p>' % (''.join('<li>%s</li>' % e(b) for b in banks), src(FED_SYSTEM, 'The 12 districts'))) if banks else ''
    fomc_html = fed_extra.get('fomc', '')
    body = (
        '<header class="gv-hero"><p class="gw-eyebrow">The Federal Reserve · The central bank of the United States</p>'
        '<p class="gv-key-fact"><strong>A federal agency and 12 banks set up as corporations</strong>Is the Fed a company? One part is a '
        'federal agency. The other part is 12 Reserve Banks, each a corporation created by federal law.</p>'
        '<h1>The Federal Reserve</h1><p class="gv-lede">What it is, who owns the Reserve Banks, who picks whom, and where its profits go. '
        'Every line cites the law or the Fed itself.</p></header>'
        '<nav class="gw-jumps" aria-label="On this page"><a href="#parts">The two parts</a><a href="#owns">Who owns the banks?</a>'
        '<a href="#picks">Who picks whom</a><a href="#money">Where the profits go</a><a href="#chairs">Every chair</a></nav>'
        # layer 1
        '<section id="parts" class="gv-sec"><div class="gw-heading"><span>Layer 1 / The two parts</span><h2>One agency, 12 banks.</h2></div>'
        '<div class="gv-two"><article class="gw-card">' + figure_html('fed') + '<p class="gw-eyebrow">Washington, D.C.</p><h3>The Board of Governors</h3>'
        '<p>A federal agency. The Fed says the Board “is an agency of the federal government that reports to and is directly accountable to Congress.”</p>'
        '<ul class="gv-list"><li>7 governors, each for a staggered 14-year term</li><li>Nominated by the President, confirmed by the Senate</li>'
        '<li>The Chair and Vice Chair serve four-year terms and can be appointed again</li></ul><p>%s</p></article>'
        '<article class="gw-card"><p class="gw-eyebrow">12 districts</p><h3>The 12 Federal Reserve Banks</h3>'
        '<p>Each one is a corporation created under federal law. The Federal Reserve Act says each bank “shall become a body corporate.” '
        'The Fed calls the 12 banks and their 24 branches “the operating arms of the Federal Reserve System.”</p>%s<p>%s %s</p></article></div>%s</section>'
        # layer 2
        '<section id="owns" class="gv-sec"><div class="gw-heading"><span>Layer 2 / Who owns the banks?</span><h2>Banks hold the stock, with strings attached.</h2>'
        '<p>The answer depends on what “own” means, so here are the rules as written.</p></div><div class="gv-tiles">'
        '<div class="gv-tile"><span>Who holds the stock</span><strong>Member banks</strong><em>Holding it is a condition of joining the Federal Reserve System</em></div>'
        '<div class="gv-tile"><span>Can they sell it?</span><strong>No</strong><em>The law says the shares “shall not be transferred or hypothecated” (sold or pledged)</em></div>'
        '<div class="gv-tile"><span>Dividend</span><strong>Capped by law</strong><em>6%% a year for banks with $10 billion or less in assets. For larger banks, the lower of 6%% or the 10-year Treasury rate</em></div>'
        '<div class="gv-tile"><span>Run for profit?</span><strong>No</strong><em>The Fed says the Reserve Banks “are not operated for profit”</em></div></div>'
        '<details><summary>How do different sources put it?</summary><div class="gw-detail"><p>The Board of Governors: “The Federal Reserve System is not “owned” by '
        'anyone,” and “owning Reserve Bank stock is quite different from owning stock in a private company.”</p><p>The St. Louis Fed, asked if the '
        'Fed is public or private: “The answer is both.” It describes the Board as “an independent government agency” and the Reserve Banks as “set up '
        'like private corporations,” and says the Reserve Banks “are not a part of the federal government.”</p><p>FactCheck.org (2008): member banks '
        '“cannot sell or trade their stock or even use that stock as collateral to borrow money.” Its 6 percent dividend line was written before '
        'the current lower limit for large banks, so the dividend above comes from the law itself.</p><p>%s %s %s</p></div></details>'
        '<p class="gv-small">%s %s</p></section>'
        # layer 3
        '<section id="picks" class="gv-sec"><div class="gw-heading"><span>Layer 3 / Who picks whom</span><h2>The President, the Senate, the Board and the banks.</h2></div>'
        '<ol class="gv-line"><li><span class="gv-role">The President</span>nominates the 7 governors</li>'
        '<li><span class="gv-role">The Senate</span>confirms them</li>'
        '<li><span class="gv-role">Member banks</span>elect 6 of the 9 directors of their Reserve Bank: 3 Class A directors who represent the banks, '
        'and 3 Class B directors who represent the public</li>'
        '<li><span class="gv-role">The Board of Governors</span>appoints the other 3, Class C directors, who represent the public</li>'
        '<li><span class="gv-role">Class B and C directors</span>appoint their Reserve Bank’s president for five years, with the Board’s approval</li></ol>'
        '%s<p class="gv-small">%s %s %s</p></section>'
        # layer 4 money
        '<section id="money" class="gv-sec"><div class="gw-heading"><span>Follow the money</span><h2>Where the profits go.</h2>'
        '<p>After paying expenses and the capped dividend, and keeping a surplus that the law also caps, the Reserve Banks must send their net '
        'earnings to the U.S. Treasury. The Fed says they “are required by law to transfer net earnings to the U.S. Treasury.”</p></div>'
        '<p class="gv-small">%s %s</p><ul class="gv-list"><li><a href="/government/presidents/">The national debt and the budget under every president</a></li>'
        '<li><a href="/government/executive/#d-2">The Department of the Treasury</a></li></ul></section>'
        # layer 5 chairs
        '<section id="chairs" class="gv-sec"><div class="gw-heading"><span>Layer 4 / History</span><h2>Every chair since 1914.</h2>'
        '<p>From 1913 to 1936 the Secretary of the Treasury chaired the Federal Reserve Board, as the Board’s own list of members shows. The president shown is the one in office '
        'on the day each chair began.</p></div>'
        '<details open><summary>Chairs of the Board of Governors, 1936 to now</summary><div class="gw-detail gv-scroll"><table class="gv-table"><thead><tr><th>Chair</th>'
        '<th>Began</th><th>Ended</th><th>President that day</th></tr></thead><tbody>%s</tbody></table></div></details>'
        '<details><summary>Treasury Secretaries who chaired the Federal Reserve Board, 1913 to 1936</summary><div class="gw-detail gv-scroll"><table class="gv-table">'
        '<thead><tr><th>Chair</th><th>Began</th><th>Ended</th><th>President that day</th></tr></thead><tbody>%s</tbody></table></div></details>'
        '<p class="gv-small">%s</p></section>'
        '<section class="gw-record"><h2>Where this comes from.</h2><p>The Federal Reserve Act in the U.S. Code (12 U.S.C. 287, 289, 290 and 341), the '
        'Board of Governors’ own pages, the Federal Reserve Bank of St. Louis and FactCheck.org, read %s. Nothing here rates the Fed or argues for or '
        'against it.</p><nav class="gv-next" aria-label="Keep exploring"><a href="/government/presidents/">Every president</a> · '
        '<a href="/government/executive/">Executive branch</a> · <a href="/how-government-works.html">How government works</a></nav></section>') % (
        src(FED_WHO, 'Source: Federal Reserve Board'), bank_html, src(LAW + '341', '12 U.S.C. 341'), src(FED_WHO, 'Federal Reserve Board'),
        fomc_html,
        src(FED_FAQ, 'Board of Governors'), src(STL, 'St. Louis Fed'), src(FACTCHECK, 'FactCheck.org'),
        src(LAW + '287', '12 U.S.C. 287'), src(LAW + '289', '12 U.S.C. 289'),
        fed_extra.get('fomc_note', ''), src(FED_WHO, 'Federal Reserve Board'), src(FED_DIRECTORS, 'Reserve Bank directors'), src(LAW + '341', '12 U.S.C. 341'),
        src(LAW + '289', '12 U.S.C. 289'), src(FED_FAQ, 'Board of Governors'),
        chair_rows(FED_CHAIRS), chair_rows(FED_CHAIRS_EX_OFFICIO), src(FED_MEMBERS_URL, 'Board Members Since 1914'), CHECKED)
    return shell('The Federal Reserve', 'What the Federal Reserve is: a federal agency in Washington and 12 Reserve Banks set up as corporations. '
                 'Who owns the banks, who picks whom, where the profits go, and every chair. The law and the Fed’s own words.',
                 SITE_URL + '/government/federal-reserve/', [('The Way', '/'), ('Government', '/how-government-works.html'),
                                                             ('Federal Reserve', None)], body, 2)


def main():
    if len(sys.argv) < 2:
        sys.exit('usage: build_presidents.py <path to congress-legislators checkout> [judges.csv]')
    E = yaml.safe_load(open(os.path.join(sys.argv[1], 'executive.yaml'), encoding='utf-8'))
    today = datetime.date.today().isoformat()
    pres = presidencies(E)
    missing = {p['person']['id']['govtrack'] for p in pres} - set(PRESIDENTS)
    if missing:
        sys.exit('no slug for govtrack ids %s: add them to PRESIDENTS' % sorted(missing))
    if len(sys.argv) > 2:
        build_fjc(sys.argv[2], pres)
    fjc = json.load(open(os.path.join(DATA, 'fjc-appointments.json'), encoding='utf-8'))['by_presidency']
    fed_extra = FED_EXTRA
    debt, omb, cbo = load_money()
    vps = sorted(((t, x) for x in E for t in x['terms'] if t['type'] == 'viceprez'), key=lambda p: p[0]['start'])
    jpages = judge_pages()
    os.makedirs(OUT, exist_ok=True)
    by_person = {}
    for p in pres:
        by_person.setdefault(p['person']['id']['govtrack'], []).append(p)
    written = {'index.html', 'presidents.css'}
    for gt, plist in by_person.items():
        fn = PRESIDENTS[gt][0] + '.html'
        with open(os.path.join(OUT, fn), 'w', encoding='utf-8', newline='\n') as fh:
            fh.write(president_page(gt, plist, pres, debt, omb, cbo, fjc, jpages, today, vps))
        written.add(fn)
    for f in os.listdir(OUT):
        if f.endswith('.html') and f not in written:
            os.remove(os.path.join(OUT, f))
    with open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(index_page(pres, debt, omb, cbo, today))
    os.makedirs(FED_OUT, exist_ok=True)
    with open(os.path.join(FED_OUT, 'index.html'), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(fed_page(pres, fed_extra))
    print('wrote %d president pages, the presidents index and the Federal Reserve page' % len(by_person))


if __name__ == '__main__':
    main()
