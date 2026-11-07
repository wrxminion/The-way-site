#!/usr/bin/env python3
"""Builds /government/presidents/costs/: what the office of president costs.

Travel, protection, money paid to a president's own property, family and vice president trips, who gets the
Secret Service contract money, the White House budget, and where public detail stops.

Run from the repo root (after build_presidents.py, which it reuses for the page shell):
  python3 tools/government/build_president_costs.py

Data:
  tools/government/data/president-costs/ss_lodging_transactions_clean.csv
  tools/government/data/president-costs/ss_president_owned_transactions.csv
  tools/government/data/president-costs/summary.json
      Every U.S. Secret Service contract and IDV transaction on USAspending.gov, fiscal 2008 to 2026, pulled Nov 7, 2026
      with ss_pull.py (same folder, stdlib only, no keys). The president is assigned by action date.
  Every other figure is written below with the link it came from (research of Nov 7, 2026).

Labels: every figure says what kind of number it is. "Record" = a government record (budget, contract, GAO,
FOIA release, financial disclosure). "News report" = a newspaper's report of records. "Advocacy group" = a count
by a group that takes sides, built from government records. "Estimate" = someone multiplied a rate. The same
rule is used for every president.
"""
import csv
import json
import os
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_congress import ROOT, SITE_URL, e  # noqa: E402
from build_presidents import shell  # noqa: E402

DATA = os.path.join(ROOT, 'tools', 'government', 'data', 'president-costs')
OUT = os.path.join(ROOT, 'site', 'government', 'presidents', 'costs')
CHECKED = 'November 7, 2026'

# ---------- sources ----------
CRS = 'https://www.everycrsreport.com/reports/R48129.html'
FNN = 'https://federalnewsnetwork.com/hiring-retention/2026/01/dhs-spending-bill-bolsters-staffing-at-cisa-fema-secret-service/'
EOP = 'https://www.whitehouse.gov/wp-content/uploads/2026/04/eop_fy2027.pdf'
FR_MICRO = 'https://www.govinfo.gov/content/pkg/FR-2025-08-27/html/2025-16412.htm'
FAR_4606 = 'https://www.acquisition.gov/far/4.606'
AF1_RATE = 'https://www.twz.com/45066/here-is-what-the-vc-25a-air-force-one-jets-now-cost-per-hour-to-fly'
AF1_NEW = 'https://www.twz.com/air/boeing-has-now-eaten-3b-in-air-force-one-cost-overruns'
GAO = 'https://www.gao.gov/products/gao-19-178'
UFC = 'https://news.yahoo.com/donald-trump-visit-york-ufc-152513514.html'
DISPATCH = 'https://thedispatch.com/article/has-donald-trumps-personal-travel-cost-taxpayers-10-7-million'
GOLF = 'https://www.yahoo.com/news/articles/taxpayer-cost-trump-golf-trips-160314952.html'
FERRET = 'https://www.theferret.scot/fact-check-trump-visit-scotland/'
JW_TOTAL = 'https://www.judicialwatch.org/judicial-watch-obama-travel-totals-nearly-100-million/'
JW_TRIPS = 'https://www.judicialwatch.org/judicial-watch-new-obama-travel-costs-bring-eight-year-total-96-million/'
FACTCHECK = 'https://www.factcheck.org/2017/06/trump-didnt-bill-obamas/'
OVERSIGHT_EMOL = 'https://oversightdemocrats.house.gov/imo/media/doc/2024-10-18COA-DEM-Staff-Report-Domestic-Emoluments.pdf'
OVERSIGHT_FOREIGN = 'https://oversightdemocrats.house.gov/imo/media/doc/2024-01-04.COA%20DEMS%20-%20Mazars%20Report.pdf'
NPR = 'https://www.npr.org/2022/10/17/1129491352/trump-hotels-overcharged-secret-service-agents'
WEEK = 'https://theweek.com/speedreads/894387/maralago-charged-secret-service-agents-650-night-rooms-guarding-trump'
PUBCIT = ('https://www.citizen.org/news/public-citizen-records-request-uncovers-140000-in-spending-by-secret-service-at-'
          'trump-properties-in-new-jersey-florida/')
FOX = 'https://www.foxnews.com/politics/trumps-businesses-charged-taxpayers-1-1m-for-secret-service-stays-some-when-the-club-was-closed'
GLOBE = 'https://www.bostonglobe.com/2021/07/08/nation/trump-charged-secret-service-nearly-10200-may-agents-rooms/'
SCOT_250K = ('https://www.scotsman.com/news/politics/donald-trumps-scottish-resorts-have-been-paid-around-ps250000-his-government-'
             'bill-could-be-higher-3020837')
SCOT_2023 = ('https://www.scotsman.com/news/politics/revealed-the-huge-bill-donald-trumps-scottish-resorts-charged-secret-service-'
             'for-former-us-presidents-visit-4277231')
CREW_GALA = 'https://www.citizensforethics.org/reports-investigations/crew-investigations/secret-service-claims-no-records-of-trump-memecoin-gala/'
CREW_TRACK = ('https://www.citizensforethics.org/reports-investigations/crew-reports/tracking-trumps-visits-to-his-properties-and-'
              'other-conflicts-of-interest/')
WASHTIMES = 'https://m.washingtontimes.com/news/2011/jul/31/biden-charging-secret-service-cottage-rental/'
WASHEX = 'https://www.washingtonexaminer.com/opinion/2076125/joe-biden-also-profited-off-the-secret-service-it-was-also-wrong/'
IVANKA = 'https://www.thedailybeast.com/eye-popping-sum-taxpayers-paid-for-ivanka-trumps-birthday-trip-revealed'
VANCE = 'https://www.scotsman.com/news/politics/jd-vances-holiday-in-scotland-sees-secret-service-rack-up-seven-figure-bill-5352935'
OGE = 'https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/69AEAA9D7455ACD585258E27002DDEE1/$FILE/Donald-J-Trump-2026-278ANNUAL.pdf'
CHEESECAKE = 'https://www.thedailybeast.com/trumps-secret-stake-in-cheesecake-factory-revealed'
PRINCETON = 'https://planetprinceton.com/2018/12/04/kushner-buys-princeton-marriott-for-38-million/'
COMMODORE = 'https://cbsaustin.com/news/nation-world/hotel-that-launched-trump-to-manhattan-fame-to-be-torn-down-02-09-2019'
USASPENDING = 'https://www.usaspending.gov/'
BIDEN_AWARDS = [('HSSS0111P0253', 'https://www.usaspending.gov/award/CONT_AWD_HSSS0111P0253_7009_-NONE-_-NONE-/'),
                ('HSSS0114P0073', 'https://www.usaspending.gov/award/CONT_AWD_HSSS0114P0073_7009_-NONE-_-NONE-/')]

KINDS = {
    'record': ('Record', 'A government record: a budget, contract, GAO report, FOIA release or financial disclosure.'),
    'news': ('News report', 'A newspaper or magazine report of government records.'),
    'advocacy': ('Advocacy group', 'A count by a group that takes sides, built from government records.'),
    'estimate': ('Estimate', 'Someone multiplied a rate. Not a bill or a record.'),
    'statement': ('Statement', 'What someone said. Not a record of money.'),
}

PRESIDENTS = [  # time order; the USAspending data starts in October 2007
    ('George W. Bush', 'george-w-bush', 'George W. Bush', 'October 2007 to January 19, 2009 only (the data starts in October 2007)'),
    ('Barack Obama', 'barack-obama', 'Barack Obama', 'January 20, 2009 to January 19, 2017'),
    ('Donald Trump (1st term)', 'donald-j-trump', 'Donald J. Trump, 1st term', 'January 20, 2017 to January 19, 2021'),
    ('Joe Biden', 'joseph-r-biden-jr', 'Joseph R. Biden', 'January 20, 2021 to January 19, 2025'),
    ('Donald Trump (2nd term)', 'donald-j-trump', 'Donald J. Trump, 2nd term', 'January 20, 2025 to September 30, 2026 (end of fiscal 2026)'),
]


def src(url, label):
    host = url.split('/')[2].replace('www.', '').replace('m.washingtontimes', 'washingtontimes')
    return '<a class="gw-source" href="%s">%s: %s ↗</a>' % (e(url), e(label), e(host))


def usd(x, cents=False):
    if cents:
        return '$' + format(x, ',.2f')
    a = abs(x)
    sign = '-' if x < 0 else ''
    if a >= 1e9:
        return '%s$%s billion' % (sign, ('%.2f' % (a / 1e9)).rstrip('0').rstrip('.'))
    if a >= 1e6:
        return '%s$%s million' % (sign, ('%.2f' % (a / 1e6)).rstrip('0').rstrip('.'))
    return '%s$%s' % (sign, format(round(a), ','))


def nice(name):
    small = {'Of', 'And', 'The', 'At', 'For'}
    words = name.title().replace('&Amp;', '&').split(' ')
    out = [w.lower() if (i and w in small) else w for i, w in enumerate(words)]
    return ' '.join(out).replace('Llc', 'LLC').replace('Inc', 'Inc').replace('Plc', 'PLC').replace('Trs Ihg', 'TRS IHG').replace('Hpt', 'HPT').replace('Owr', 'OWR').replace('Lco', 'LCO').replace('Ha Sub', 'HA Sub')


def item(fig, what, kind, sources, more=''):
    label, title = KINDS[kind]
    return ('<div class="pc-item"><strong class="pc-fig">%s</strong><p>%s</p>%s<p class="pc-meta">'
            '<span class="pc-kind pc-k-%s" title="%s">%s</span> %s</p></div>') % (
        fig, what, ('<p class="gv-small">%s</p>' % more) if more else '', kind, e(title), e(label), ' '.join(src(u, l) for u, l in sources))


def grid(items):
    return '<div class="pc-grid">%s</div>' % ''.join(items)


def heading(kicker, h2, p=''):
    return '<div class="gw-heading"><span>%s</span><h2>%s</h2>%s</div>' % (kicker, h2, ('<p>%s</p>' % p) if p else '')


# ---------- USAspending data ----------

def is_hotel(r):
    """Hotel rooms only: service code V23x (lodging) or the word LODGING in the description.
    The pull's wider word list also caught elevator repairs at hotels, perimeter fences, door openers and office
    remodeling; those are left out here."""
    return r['psc'].upper().startswith('V23') or 'LODGING' in r['description'].upper()


# Spellings of one parent company in the data. Hyatt Corp and Hyatt Hotels Corporation share contract 70US0923C70093502.
SAME_PARENT = {'MARRIOTT INTERNATIONAL, INC.': 'MARRIOTT INTERNATIONAL INC', 'HYATT CORP': 'HYATT HOTELS CORPORATION'}


def load_contracts():
    summary = json.load(open(os.path.join(DATA, 'summary.json'), encoding='utf-8'))
    rows = [r for r in csv.DictReader(open(os.path.join(DATA, 'ss_lodging_transactions_clean.csv'), encoding='utf-8')) if is_hotel(r)]
    total, count = Counter(), Counter()
    payee = defaultdict(Counter)
    award = defaultdict(Counter)
    place = {}
    for r in rows:
        a = float(r['amount'])
        p, who = r['president'], r['parent'] or r['recipient']
        who = SAME_PARENT.get(who, who)
        total[p] += a
        count[p] += 1
        payee[p][who] += a
        award[(p, who)][r['link']] += a
        place.setdefault((p, who, r['link']), '%s, %s' % (r['city'].title(), r['state']) if r['state'] else r['city'].title())
    owned = list(csv.DictReader(open(os.path.join(DATA, 'ss_president_owned_transactions.csv'), encoding='utf-8')))
    return summary, total, count, payee, award, place, owned


# ---------- page ----------

def ss_budget_section():
    rows = [('2017', '$2.05 billion', '$836 million', '$52 million'),
            ('2019', '$2.25 billion', '$970 million', '$37 million'),
            ('2020', '$2.42 billion', '$1.09 billion', '$155 million'),
            ('2021', '$2.44 billion', '$1.07 billion', '$84 million'),
            ('2023', '$2.82 billion', '$1.21 billion', '$73 million'),
            ('2024', '$3.09 billion', '$1.49 billion', '$244 million'),
            ('2025', '$3.09 billion', '$1.49 billion', '$244 million'),
            ('2026', '$3.25 billion', '$1.46 billion', '$34 million'),
            ('2027 (request)', '$3.45 billion', '$1.63 billion', '$154 million')]
    table = ''.join('<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>' % r for r in rows)
    return ('<section class="gv-sec" id="budgets">%s'
            '<div class="gv-tiles"><div class="gv-tile"><span>Secret Service, fiscal 2026</span><strong>$3.25 billion</strong>'
            '<em>the level the House and Senate passed</em></div>'
            '<div class="gv-tile"><span>Of that, protection</span><strong>$1.46 billion</strong><em>protective operations</em></div>'
            '<div class="gv-tile"><span>Extra, 2025 law</span><strong>$1.17 billion</strong><em>P.L. 119-21, section 100057, to spend through fiscal 2029, '
            'no public spending plan</em></div>'
            '<div class="gv-tile"><span>Secret Service staff</span><strong>8,269</strong><em>end of fiscal 2025</em></div></div>'
            '<details><summary>Every year in the report</summary><div class="gw-detail gv-scroll"><table class="gv-table pr-table">'
            '<thead><tr><th>Fiscal year</th><th>Total enacted</th><th>Protection</th><th>Campaigns and national special security events</th></tr></thead>'
            '<tbody>%s</tbody></table><p class="gv-small">The Congressional Research Service labels its table in millions of dollars, but the '
            'numbers only add up as thousands of dollars, so they are shown here in billions and millions. The report repeats the fiscal 2024 '
            'figures for 2025. Fiscal 2018 and 2022 are not in the table.</p></div></details>'
            '<p class="gv-note">The Secret Service does “not provide detailed public reporting on its use of funding or personnel for protective '
            'missions” (Congressional Research Service). So there is no official total for what any one president, trip or family member costs.</p>'
            '<p class="gv-small"><span class="pc-kind pc-k-record">Record</span> %s %s</p></section>') % (
        heading('Layer 1 / Protection', 'The Secret Service budget.',
                'The Secret Service protects the president, the vice president, their families, former presidents, some candidates and '
                'big national events. Its budget is set by Congress each year.'),
        table, src(CRS, 'Congressional Research Service, R48129, updated April 28, 2026'), src(FNN, 'Fiscal 2026 DHS bill: Federal News Network'))


def eop_section():
    rows = [('White House Office, salaries and expenses', 74, 79, 79),
            ('Executive Residence, operating', 15, 15, 18),
            ('Executive Residence, reimbursable (billed to others)', 11, 18, 18),
            ('White House Repair and Restoration', 2, 2, 6),
            ('Vice President: Special Assistance and Residence', 6, 6, 6),
            ('Office of Administration', 123, 124, 124),
            ('Office of Management and Budget', 229, 129, 146),
            ('National Security Council and Homeland Security Council', 17, 19, 14),
            ('U.S. Trade Representative', 59, 65, 95)]
    table = ''.join('<tr><td>%s</td><td>$%d million</td><td>$%d million</td><td>$%d million</td></tr>' % r for r in rows)
    return ('<section class="gv-sec" id="white-house">%s'
            '<div class="gv-tiles"><div class="gv-tile"><span>White House Office, 2026</span><strong>$79 million</strong><em>pays 388 to 461 staff</em></div>'
            '<div class="gv-tile"><span>Executive Residence, 2026</span><strong>$15 million</strong><em>running the house, plus $18 million billed to others</em></div>'
            '<div class="gv-tile"><span>White House Office travel line</span><strong>$3 to 4 million</strong><em>a year (object class 21.0)</em></div>'
            '<div class="gv-tile"><span>Supplies and materials</span><strong>About $1 million</strong><em>a year, White House Office (object class 26.0); '
            'the Residence is also about $1 million</em></div></div>'
            '<details><summary>Every account, 2025 to 2027</summary><div class="gw-detail gv-scroll"><table class="gv-table pr-table">'
            '<thead><tr><th>Account</th><th>2025 actual</th><th>2026 estimate</th><th>2027 request</th></tr></thead><tbody>%s</tbody></table>'
            '</div></details>'
            '<ul class="gv-list"><li>Limits written in the budget law text: White House travel “not to exceed $100,000” under 3 U.S.C. 103, and '
            'reception and representation “not to exceed $19,000.”</li>'
            '<li>Political events at the Residence must be paid in advance. The president’s party committee must keep $25,000 on deposit, and '
            'the Residence must report official and political events to Congress each year.</li></ul>'
            '<p class="gv-small"><span class="pc-kind pc-k-record">Record</span> %s</p></section>') % (
        heading('Layer 1 / The house and the staff', 'The White House’s own budget.',
                'The Executive Office of the President is a set of accounts in the federal budget. These are the main ones, in millions of '
                'dollars, from the fiscal 2027 budget.'),
        table, src(EOP, 'Executive Office of the President, fiscal 2027 budget'))


def travel_section():
    af1 = grid([
        item('$177,843', 'Cost per flight hour of the current Air Force One jets (VC-25A) in fiscal 2021, from an Air Force FOIA release. '
             'Older figures: $206,337 (2015) and $161,591 (2013).', 'news', [(AF1_RATE, 'The War Zone, FOIA release')]),
        item('$3.9 billion', 'Boeing’s fixed price contract for two new Air Force One jets (VC-25B), signed July 2018.', 'news',
             [(AF1_RATE, 'The War Zone')]),
        item('$6.608 billion', 'GAO’s total estimate for the new jets as of August 2025, up from $6.263 billion in December 2018. Delivery is '
             'hoped for in March 2028. Boeing has lost more than $3 billion on the fixed price.', 'news', [(AF1_NEW, 'The War Zone, quoting GAO')],
             'We have not read the GAO report (GAO-26-108457) itself.'),
    ])
    cards = []
    cards.append(('George W. Bush', '<p>Nothing gathered yet.</p>'))
    cards.append(('Barack Obama', grid([
        item('$99,714,527.82', 'Obama family travel over 8 years, added up by Judicial Watch from Secret Service and Air Force FOIA records. '
             'Includes official, political and vacation trips.', 'advocacy', [(JW_TOTAL, 'Judicial Watch')],
             'FactCheck.org: “Judicial Watch offers no comparable figure for other presidents.” ' + src(FACTCHECK, 'FactCheck.org')),
        item('$7,146,015.18', 'March 2016 trip to Cuba and Argentina. Another example: Honolulu Christmas flights, $2,548,602.', 'advocacy',
             [(JW_TRIPS, 'Judicial Watch')]),
    ])))
    cards.append(('Donald J. Trump, 1st term', grid([
        item('$13.6 million', 'Four trips to Mar-a-Lago, February 3 to March 5, 2017: about $3.4 million a trip. Defense Department $8.5 million, '
             'Homeland Security $5.1 million. Leaves out classified costs and salaries. This is the only per trip cost GAO has published, and '
             'later tallies reuse its rate.', 'record', [(GAO, 'GAO-19-178')]),
        item('$252,567.51', 'November 2, 2019 UFC trip to New York, in federal documents seen by the New York Daily News. $224,212 of it was '
             'agents’ hotels.', 'news', [(UFC, 'New York Daily News via Yahoo')]),
    ])))
    cards.append(('Joseph R. Biden', '<p>No trip cost figures found yet, for Rehoboth Beach, Wilmington or other trips.</p>'))
    cards.append(('Donald J. Trump, 2nd term', grid([
        item('$101.2 million', 'Golf trips to his own properties by March 30, 2026 (110 days), in a HuffPost tally that multiplies GAO’s $3.38 '
             'million per Florida trip. HuffPost projects $300 million by the end of the term.', 'estimate', [(GOLF, 'HuffPost via SILive')],
             'An earlier HuffPost figure, $10.7 million by February 9, 2025, was rated “partially true, but missing context” by The Dispatch. '
             + src(DISPATCH, 'The Dispatch')),
        item('$9.7 million', 'July 2025 Scotland trip, a HuffPost “conservative estimate,” rated “Half True” by The Ferret. The White House has '
             'not released the real cost.', 'estimate', [(FERRET, 'The Ferret')]),
    ])))
    body = ''.join('<article class="pc-pres"><h3>%s</h3>%s</article>' % (e(n), c) for n, c in cards)
    return ('<section class="gv-sec" id="travel">%s<h3>Air Force One</h3>%s<h3 class="pc-by">By president, oldest first</h3>%s</section>') % (
        heading('Layer 2 / Travel', 'What trips cost.',
                'No president’s travel bill is published as a total. What exists: one GAO count, FOIA releases, and estimates that '
                'multiply a rate. Each figure is labeled.'), af1, body)


def own_property_section(owned):
    biden = sum(float(r['amount']) for r in owned if r['flag'] == 'Biden owned')
    biden_links = ' '.join(src(u, 'USAspending contract ' + p) for p, u in BIDEN_AWARDS)
    cards = []
    cards.append(('Joseph R. Biden (as vice president and after)', grid([
        item(usd(biden), 'Secret Service rent for a cottage on Biden’s own property in Wilmington, Delaware, April 2011 to September 2017. '
             'The rent started at $2,200 a month. Biden is listed as the vendor. Two contracts, no bidding.', 'record',
             [], 'Contracts: ' + biden_links + ' ' + src(WASHTIMES, 'Washington Times, 2011') + ' ' + src(WASHEX, 'Washington Examiner')),
    ])))
    cards.append(('Donald J. Trump, 1st term and after', grid([
        item('$1.4 million', 'Secret Service spending at Trump-owned U.S. properties in the first term, from a Secret Service spreadsheet given to '
             'the House Oversight Committee. At least 40 waivers let agents pay above the government rate.', 'record',
             [(OVERSIGHT_EMOL, 'House Oversight Committee Democrats staff report, Oct 2024')]),
        item('$1,185 a night', 'Highest room rate charged at the Trump hotel in Washington, nearly 5 times the government rate. $1,160 a night '
             'per room for agents guarding Eric Trump, March 2017.', 'news', [(NPR, 'NPR')]),
        item('$650 a night', 'Mar-a-Lago room rate charged “dozens of times” in 2017; $396.15 in 2018. A Bedminster cottage: $17,000 a month.',
             'news', [(WEEK, 'Washington Post via The Week')]),
        item('$140,000+', 'Found by Public Citizen in Secret Service records, including nearly $87,000 for a Bedminster cottage over 147 days '
             '(about $567 a day).', 'advocacy', [(PUBCIT, 'Public Citizen')]),
        item('$1.1 million+', 'Washington Post tally of Trump business charges by September 2020, including Bedminster billing while the club was '
             'closed for the pandemic.', 'news', [(FOX, 'Fox News, citing the Washington Post')]),
        item('$10,199.52', 'Charged for May 2021, after leaving office; more than $50,000 since January 2021.', 'news', [(GLOBE, 'Boston Globe')]),
        item('About £250,000', 'Paid to Trump’s Scottish resorts over the first term, mostly Defense Department rooms for crews at Prestwick '
             '($184,000+) and $52,000+ from the State Department for the July 2018 visit, paid to SLC Turnberry Limited.', 'news',
             [(SCOT_250K, 'The Scotsman, from records')]),
        item('$108,559', 'Secret Service bill for the May 2023 Scotland visit as a former president. Turnberry got $22,917 for rooms and $32,243 '
             'for staffing.', 'news', [(SCOT_2023, 'The Scotsman, FOIA records')]),
        item('“Free,” then “at cost”', 'What Trump’s company said it charged: agents could “stay at our properties for free” (Eric Trump, 2019), '
             'later “at cost” (2020).', 'statement', [(PUBCIT, 'Public Citizen'), (OVERSIGHT_EMOL, 'House Oversight staff report')]),
    ])))
    cards.append(('Donald J. Trump, 2nd term', grid([
        item('No total found', 'No second term total of payments to Trump properties was found. The Secret Service told CREW it has “no '
             'responsive records” for the April 25, 2026 memecoin gala at Mar-a-Lago. Doral is named host of the 2026 G20.', 'advocacy',
             [(CREW_GALA, 'CREW'), (CREW_TRACK, 'CREW tracker')]),
    ])))
    foreign = item('$7.8 million', 'Not taxpayer money: paid by at least 20 foreign governments to four Trump properties in the first term. '
                   'China $5,572,548. Saudi Arabia at least $615,422.', 'record',
                   [(OVERSIGHT_FOREIGN, 'House Oversight Committee Democrats, “White House for Sale,” Jan 2024')],
                   'From the Trump accounting firm’s records the committee got. A staff report from one party’s members of the committee.')
    return ('<section class="gv-sec" id="own-property">%s%s<h3 class="pc-by">Foreign governments</h3>%s'
            '<p class="gv-note">Same rule for every president: when the government pays a business or property the protected person owns, it is '
            'listed here. Bush and Obama: none found in the contract data (see Layer 4). Not every bill shows up as a contract: the Trump property '
            'bills above are known from FOIA releases and records Congress got, not from federal contract data.</p></section>') % (
        heading('Layer 3 / Who gets paid', 'Money paid to the president’s own property.'),
        ''.join('<article class="pc-pres"><h3>%s</h3>%s</article>' % (e(n), c) for n, c in cards), grid([foreign]))


def family_section():
    return ('<section class="gv-sec" id="family">%s%s<p class="gv-small">Not gathered yet: trips by other presidents’ and vice presidents’ '
            'families.</p></section>') % (
        heading('Layer 3 / Family and vice president trips', 'Protecting the family.',
                'Hotel and car contracts only. Salaries, flights and meals are not in these figures.'),
        grid([
            item('$1,837,972', 'Secret Service bill for Vice President J.D. Vance’s family holiday in Scotland, August 2025 (FOIA). $964,724 to '
                 'Little’s Chauffeur Drive in Glasgow; $833,454 for hotels (Radisson Blu $278,101, Doubletree $174,459, Glasgow Marriott '
                 '$134,548, Carnell Estates $37,968); golf carts at Turnberry $12,797; tents and portable toilets $17,311.', 'news',
                 [(VANCE, 'The Scotsman, FOIA records')]),
            item('$93,000', 'Secret Service hotel contracts for Ivanka Trump’s 45th birthday trip to Morocco, October 2026: $59,543 for the '
                 'Sofitel Marrakech (October 21) and $33,457 for La Mamounia (the next day). The records do not name her; she was reportedly the '
                 'only protectee in Morocco.', 'news', [(IVANKA, 'The Daily Beast, first reported by the Daily Mail')]),
            item('$396,000', 'Secret Service cost of protecting Donald Trump Jr. and Eric Trump on three foreign trips, January to February 2017.',
                 'record', [(GAO, 'GAO-19-178')]),
            item('About $12,300', 'Secret Service costs for Eric Trump’s Scotland visits: about $3,800 in Aberdeenshire and $8,500 at Turnberry.',
                 'news', [(SCOT_250K, 'The Scotsman')]),
        ]))


def contracts_section(summary, total, count, payee, award, place):
    rows = []
    for key, slug, name, span in PRESIDENTS:
        s = summary['by_president'][key]
        rows.append('<tr><td><a href="/government/presidents/%s.html">%s</a><span class="gv-muted">%s</span></td><td>%s</td><td>%s</td>'
                    '<td>%s</td></tr>' % (slug, e(name), e(span), format(s['transactions'], ','), e(usd(s['obligations'])),
                                          e(usd(total.get(key, 0))) if total.get(key) else '$0'))
    cards = []
    for key, slug, name, span in PRESIDENTS:
        top = [x for x in payee[key].most_common() if x[1] > 0][:6]
        if not top or total[key] < 100000:
            cards.append('<article class="gw-card"><h3>%s</h3><p>%s</p></article>' % (
                e(name), 'No hotel contracts in the data.' if key.startswith('George') else
                'Almost no hotel contracts in the data (%d rows, %s in all), so hotel bills in these years were paid some other way.' % (
                    count[key], usd(total[key]))))
            continue
        lis = []
        for who, amt in top:
            link, _ = award[(key, who)].most_common(1)[0]
            lis.append('<li><strong>%s</strong> %s <span class="gv-muted">largest contract in %s</span> <a class="gw-source" href="%s">'
                       'USAspending ↗</a></li>' % (e(usd(amt)), e(nice(who)),
                                                   e(place[(key, who, link)]), e(link)))
        cards.append('<article class="gw-card"><h3>%s</h3><p class="gv-big">%s <span>hotel rooms, %d contract actions</span></p>'
                     '<ul class="gv-list pc-payees">%s</ul></article>' % (e(name), e(usd(total[key])), count[key], ''.join(lis)))
    return ('<section class="gv-sec" id="contracts">%s<div class="gw-detail gv-scroll"><table class="gv-table pr-table">'
            '<thead><tr><th>President</th><th>Secret Service contract actions</th><th>All Secret Service contract money</th><th>Hotel rooms</th></tr>'
            '</thead><tbody>%s</tbody></table></div>'
            '<p class="gv-small">Money is assigned to the president in office on the date of each contract action. Contract money pays for '
            'everything the Secret Service buys (cars, radios, computers, buildings, training), not only protection. Amounts can be negative '
            'when money is taken back. Hotel rooms = service code V23 (lodging) or the word “lodging” in the description; elevator repairs at '
            'hotels, fences and remodeling are left out.</p>'
            '<h3 class="pc-by">Largest hotel payees, by parent company</h3><div class="pc-cols">%s</div>'
            '<div class="pc-grid pc-grid-2">%s%s</div>'
            '<p class="gv-small"><span class="pc-kind pc-k-record">Record</span> %s Pulled from USAspending on November 7, 2026: every U.S. Secret '
            'Service contract and IDV transaction, fiscal 2008 to 2026 (data starts in October 2007, so Bush is partial and Clinton is not in it).</p>'
            '</section>') % (
        heading('Layer 4 / Who gets the contract money', 'Secret Service contracts, by president.',
                'Federal contracts over $15,000 are public with the vendor’s name. This is every Secret Service contract on USAspending.gov.'),
        ''.join(rows), ''.join(cards),
        item('No contract to a Trump club or hotel', 'No Secret Service contract went to Mar-a-Lago, Bedminster, Doral or any Trump club or hotel '
             'in this data. The bills in Layer 3 are known from FOIA releases and records Congress got. The Washington Post reported that '
             'payments over $10,000 are usually supposed to be listed in federal databases but largely are not. Not in the contracts does not '
             'mean not paid.', 'record', [(USASPENDING, 'USAspending'), (WEEK, 'Washington Post via The Week')]),
        item('Checked and not counted', 'Trump Palace Condominium in New York got $206,869 for an antenna site lease, 2011 to 2018. The payee is '
             'the building’s condo association; we have not confirmed who owns it, so it is not counted as a Trump business. Automotive Care '
             'of Doral LLC ($6,974.44, a Miami car repair shop) is not a Trump business.', 'record',
             [(USASPENDING + 'award/CONT_AWD_HSSS0113L0314_7009_-NONE-_-NONE-/', 'USAspending'),
              (USASPENDING + 'award/CONT_AWD_70US0918P70090065_7009_-NONE-_-NONE-/', 'USAspending')]),
        src(USASPENDING, 'USAspending.gov'))


def stock_section():
    return ('<section class="gv-sec" id="stock">%s%s'
            '<p class="gv-note">Worth watching, not proof. Marriott and Hyatt are also the two largest Secret Service hotel payees under Biden '
            '(Layer 4). The stock values are small next to the contracts, and nothing here shows that money was steered. The White House says '
            'the portfolio is run by third parties with no input from the family. We have not checked other presidents’ disclosures for hotel '
            'stock yet.</p></section>') % (
        heading('Layer 5 / Ties to the hotels', 'Does the president own the hotels the government pays?',
                'From Trump’s 2026 annual financial disclosure (OGE Form 278e, covering 2025). Values are the ranges the form uses.'),
        grid([
            item('$50,001 to $100,000', 'Marriott International stock, dividends $201 to $1,000. No trade shown.', 'record',
                 [(OGE, 'OGE Form 278e, page 13, line 271')]),
            item('$50,001 to $100,000', 'Hilton Worldwide stock. Host Hotels &amp; Resorts: $1,001 to $15,000.', 'record',
                 [(OGE, 'OGE Form 278e, page 12, lines 222 and 227')]),
            item('Not found yet', 'Hyatt: not in the part of the form we read. Not proven absent; the rest of the form was not read.', 'record',
                 [(OGE, 'OGE Form 278e')]),
            item('$100,001 to $250,000', 'McDonald’s stock.', 'record', [(OGE, 'OGE Form 278e, page 13, line 276')]),
            item('$15,001 to $50,000', 'Cheesecake Factory stock held on December 31, 2025, after buys of $35,007 to $175,000 in 2025. No record '
                 'of a government paid Cheesecake Factory order was found.', 'news', [(CHEESECAKE, 'The Daily Beast, from the June 2026 form')]),
            item('$37.6 million', 'Kushner Companies (Jared Kushner’s family firm) bought the Princeton Marriott at Forrestal in December 2018. The '
                 'articles do not say whether Marriott manages it.', 'news', [(PRINCETON, 'Planet Princeton')]),
            item('Sold in 1996', 'Trump partnered with Hyatt Corp. in the late 1970s to buy the Commodore Hotel, which became the Grand Hyatt New '
                 'York, and sold his stake in 1996. No current Trump license or management deal with Marriott or Hyatt was found (not fully '
                 'searched).', 'news', [(COMMODORE, 'AP via CBS Austin')]),
        ]))


def detail_section():
    return ('<section class="gv-sec" id="detail">%s%s</section>') % (
        heading('Layer 6 / Where the detail stops', 'Down to the toilet paper?',
                'No. Public detail stops well before single purchases.'),
        grid([
            item('$15,000', 'Purchases at or under this amount (the micro-purchase threshold since October 1, 2025, up from $10,000) do not have to '
                 'be reported to the federal contract database, and government purchase card buys under it are left out. So toilet paper, '
                 'coffee or a fast food order will almost never show up item by item.', 'record',
                 [(FR_MICRO, 'Federal Register, Aug 27, 2025'), (FAR_4606, 'Federal Acquisition Regulation 4.606')]),
            item('About $1 million', 'The finest public line for the White House’s everyday buying: “Supplies and materials” for a whole year.',
                 'record', [(EOP, 'Fiscal 2027 budget, object class tables')]),
        ]))


def gaps_section():
    return ('<section class="gv-sec" id="gaps">%s<ul class="gv-list">'
            '<li>Bush and Clinton: nothing gathered yet beyond the partial Bush contract data.</li>'
            '<li>Trip costs for Biden as president.</li>'
            '<li>Second term payments to Trump properties: none in the contract data; FOIA is the only route found.</li>'
            '<li>Who pays for the first family’s food: we have not found a primary source for the rule yet.</li>'
            '<li>Whether White House Office records can be requested under FOIA.</li>'
            '<li>Not read directly: the body of GAO-19-178, GAO-26-108457, the Daily Mail Ivanka article and HuffPost’s own pages.</li>'
            '</ul></section>') % heading('Not known yet', 'What is still missing.')


def page_html():
    summary, total, count, payee, award, place, owned = load_contracts()
    kinds = ''.join('<li><span class="pc-kind pc-k-%s">%s</span> %s</li>' % (k, e(v[0]), e(v[1])) for k, v in KINDS.items())
    body = ('<header class="gv-hero"><p class="gw-eyebrow">The executive branch · What the office costs</p>'
            '<p class="gv-key-fact"><strong>$3.25 billion</strong>Secret Service budget for fiscal 2026</p>'
            '<h1>What a president costs</h1>'
            '<p class="gv-lede">Travel, protection, money paid to a president’s own property, family trips, who gets the contract money, and the '
            'White House’s own budget. There is no official total for any president, so every number here says where it came from and what kind '
            'of number it is.</p></header>'
            '<nav class="gw-jumps" aria-label="On this page"><a href="#budgets">Secret Service</a><a href="#white-house">White House</a><a href="#travel">Travel</a>'
            '<a href="#own-property">Own property</a><a href="#family">Family trips</a><a href="#contracts">Contracts</a>'
            '<a href="#stock">Hotel ties</a><a href="#detail">Toilet paper</a></nav>'
            '<section class="gv-sec">%s<ul class="gv-list pc-kinds">%s</ul></section>'
            '%s%s%s%s%s%s%s%s%s'
            '<section class="gv-sec"><div class="gw-heading"><span>Threads to pull</span><h2>Keep following.</h2></div><ul class="gv-list">'
            '<li><a href="/government/presidents/">Every president, the money during their budget years</a></li>'
            '<li><a href="/government/executive/">The executive branch today</a></li>'
            '<li><a href="/money-trail/">The Money Trail: who funds campaigns and where federal money goes</a></li></ul></section>'
            '<section class="gw-record"><h2>Where this comes from.</h2><p>Every figure links to where it came from. Secret Service contracts: '
            'USAspending.gov, pulled November 7, 2026 (the script and files are in the site’s public repository, tools/government/data/president-costs). '
            'Budgets: Congressional Research Service and the fiscal 2027 White House budget. Travel and property bills: GAO, FOIA releases, records '
            'Congress got, and news reports of them. Advocacy groups and estimates are labeled. Checked %s. Nothing here rates or ranks anyone.</p>'
            '<nav class="gv-next" aria-label="Keep exploring"><a href="/government/presidents/">Every president</a></nav></section>') % (
        heading('The rule', 'The same rule for every president.',
                'Presidents are in time order. Every figure carries one of these labels. Nothing is added up across labels.'),
        kinds, ss_budget_section(), eop_section(), travel_section(), own_property_section(owned), family_section(),
        contracts_section(summary, total, count, payee, award, place), stock_section(), detail_section(), gaps_section(), CHECKED)
    return shell('What a president costs',
                 'What the office of president costs: the Secret Service and White House budgets, trip costs, money paid to presidents’ own '
                 'property, family trips, and who gets the Secret Service contract money. Every figure linked and labeled.',
                 SITE_URL + '/government/presidents/costs/',
                 [('The Way', '/'), ('Government', '/how-government-works.html'), ('Executive branch', '/government/executive/'),
                  ('Presidents', '/government/presidents/'), ('What a president costs', None)], body, 3)


def main():
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(page_html())
    print('wrote site/government/presidents/costs/index.html')


if __name__ == '__main__':
    main()
