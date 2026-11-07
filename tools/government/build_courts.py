#!/usr/bin/env python3
"""Builds the federal courts layer of the Government page: site/government/courts/index.html

Run from the repo root:  python3 tools/government/build_courts.py

Justices, circuits and building facts are typed below from official pages, each with its source URL
and the date it was checked. The U.S. map reuses the state outlines already drawn for /lookup/.
"""
import datetime
import json
import os
import re
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_congress import ROOT, SITE_URL, e, long_date, page  # noqa: E402
from photos import figure_html  # noqa: E402  D230: building photos

OUT = os.path.join(ROOT, 'site', 'government', 'courts')
CHECKED = 'November 6, 2026'
BIOS = 'https://www.supremecourt.gov/about/biographies.aspx'
MEMBERS = 'https://www.supremecourt.gov/about/members_text.aspx'
STRUCT = 'https://www.uscourts.gov/about-federal-courts/court-role-and-structure'
APPEALS = 'https://www.uscourts.gov/about-federal-courts/court-role-and-structure/about-us-courts-appeals'
LINKS = 'https://www.uscourts.gov/about-federal-courts/court-role-and-structure/court-website-links'
S41 = 'https://www.law.cornell.edu/uscode/text/28/41'
S44 = 'https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title28-section44&num=0&edition=prelim'
S1 = 'https://www.law.cornell.edu/uscode/text/28/1'
CONST = 'https://www.archives.gov/founding-docs/constitution-transcript'

# From the Supreme Court's members page, in the order it lists them (Chief Justice, then by oath date).
JUSTICES = [
    ('John G. Roberts, Jr.', 'Chief Justice of the United States', 'George W. Bush', '2005-09-29'),
    ('Clarence Thomas', 'Associate Justice', 'George H. W. Bush', '1991-10-23'),
    ('Samuel A. Alito, Jr.', 'Associate Justice', 'George W. Bush', '2006-01-31'),
    ('Sonia Sotomayor', 'Associate Justice', 'Barack Obama', '2009-08-08'),
    ('Elena Kagan', 'Associate Justice', 'Barack Obama', '2010-08-07'),
    ('Neil M. Gorsuch', 'Associate Justice', 'Donald J. Trump', '2017-04-10'),
    ('Brett M. Kavanaugh', 'Associate Justice', 'Donald J. Trump', '2018-10-06'),
    ('Amy Coney Barrett', 'Associate Justice', 'Donald J. Trump', '2020-10-27'),
    ('Ketanji Brown Jackson', 'Associate Justice', 'Joseph R. Biden, Jr.', '2022-06-30'),
]

# 28 U.S.C. 41 (states and territories) and 28 U.S.C. 44 (circuit judgeships).
CIRCUITS = [
    ('1', 'First Circuit', ['ME', 'MA', 'NH', 'RI'], ['Puerto Rico'], 6),
    ('2', 'Second Circuit', ['CT', 'NY', 'VT'], [], 13),
    ('3', 'Third Circuit', ['DE', 'NJ', 'PA'], ['Virgin Islands'], 14),
    ('4', 'Fourth Circuit', ['MD', 'NC', 'SC', 'VA', 'WV'], [], 15),
    ('5', 'Fifth Circuit', ['LA', 'MS', 'TX'], [], 17),
    ('6', 'Sixth Circuit', ['KY', 'MI', 'OH', 'TN'], [], 16),
    ('7', 'Seventh Circuit', ['IL', 'IN', 'WI'], [], 11),
    ('8', 'Eighth Circuit', ['AR', 'IA', 'MN', 'MO', 'NE', 'ND', 'SD'], [], 11),
    ('9', 'Ninth Circuit', ['AK', 'AZ', 'CA', 'ID', 'MT', 'NV', 'OR', 'WA', 'HI'], ['Guam'], 29),
    ('10', 'Tenth Circuit', ['CO', 'KS', 'NM', 'OK', 'UT', 'WY'], [], 12),
    ('11', 'Eleventh Circuit', ['AL', 'FL', 'GA'], [], 12),
    ('dc', 'D.C. Circuit', ['DC'], [], 11),
    ('fed', 'Federal Circuit', [], [], 12),
]
NAMES = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California', 'CO': 'Colorado',
    'CT': 'Connecticut', 'DE': 'Delaware', 'DC': 'District of Columbia', 'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii',
    'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana',
    'ME': 'Maine', 'MD': 'Maryland', 'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
    'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
    'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
    'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina', 'SD': 'South Dakota',
    'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington',
    'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming',
}


def src(url, label):
    return '<a class="gw-source" href="%s">Source: %s ↗</a>' % (e(url), e(label))


def state_paths():
    """State outline paths from the /lookup/ page's US map (viewBox 0 0 975 610)."""
    s = open(os.path.join(ROOT, 'site', 'lookup', 'index.html'), encoding='utf-8').read()
    i = s.find('<svg class="sp-map"')
    svg = s[i:s.find('</svg>', i)]
    out = {}
    for attrs, inner in re.findall(r'<a ([^>]*)>(.*?)</a>', svg, re.S):
        st = re.search(r'data-st="(\w+)"', attrs).group(1)
        out[st] = ''.join(re.findall(r'<path[^>]*/?>(?:</path>)?', inner))
    return out


def circuit_map():
    paths = state_paths()
    of = {st: (cid, name) for cid, name, sts, _, _ in CIRCUITS for st in sts}
    parts = []
    for st, p in paths.items():
        cid, name = of[st]
        label = '%s: %s' % (NAMES[st], name)
        parts.append('<a href="#circuit-%s" class="gv-c%s" aria-label="%s"><title>%s</title>%s</a>' % (
            cid, cid, e(label), e(label), p))
    labels = {'1': (905, 140), '2': (838, 168), '3': (850, 235), '4': (815, 300), '5': (470, 470), '6': (720, 270),
              '7': (628, 225), '8': (500, 210), '9': (140, 250), '10': (330, 290), '11': (720, 450), 'dc': (900, 300)}
    tags = ''.join('<text x="%d" y="%d">%s</text>' % (x, y, c) for c, (x, y) in labels.items() if c != 'dc')
    tags += '</g><a href="#circuit-dc" class="gv-usmap-dc" aria-label="District of Columbia: D.C. Circuit"><text x="%d" y="%d">D.C.</text></a><g>' % labels['dc']
    return ('<svg class="gv-usmap" viewBox="0 0 975 610" role="group" aria-label="Map of the 12 regional federal circuits. '
            'Each state links to its circuit below.">%s<g class="gv-usmap-tags" aria-hidden="true">%s</g></svg>' % (''.join(parts), tags))


def main():
    today = datetime.date.today()
    jd = None
    if len(sys.argv) > 1:
        import build_judges
        jd = build_judges.build(sys.argv[1], CIRCUITS, NAMES, {n.split(',')[0].split()[-1] for n, _, _, _ in JUSTICES})
    jslug = {}
    if jd:
        for j in jd['judges']:
            if j['type'] == 'Supreme Court' and not j.get('retired'):
                jslug[j['r']['Last Name'].strip()] = j['slug']

    def years_on(d):
        y = int((today - datetime.date.fromisoformat(d)).days // 365.25)
        return '%d year%s' % (y, '' if y == 1 else 's')

    def page_link(name):
        last = name.split(',')[0].split()[-1]
        if last in jslug:
            return '<a class="gv-mini" href="judges/%s.html">Full page: confirmation, education, career →</a>' % jslug[last]
        return ''

    # D229: "See in the Money web" for each justice who is a dot in the Money web (site/money-trail/justices.js,
    # built by tools/money-trail/build_justices.py). A justice with no real line there gets no link.
    in_web = set()
    jpath = os.path.join(ROOT, 'site', 'money-trail', 'justices.js')
    if os.path.exists(jpath):
        js = open(jpath, encoding='utf-8').read()
        for j in json.loads(js[js.index('{'):js.rindex('}') + 1]).get('justices', []):
            if j.get('president') or j.get('confirmed'):
                in_web.add(j['name'])

    def web_link(name):
        if name not in in_web:
            return ''
        return ('<a class="gv-web" href="/money-trail/?view=network&amp;hub=%s"><img src="/money-trail/art/money-web-link-blue.webp" alt="" '
                'width="22" height="24" decoding="async">See in the Money web</a>' % urllib.parse.quote(name))

    jcards = []
    for name, title, by, took in JUSTICES:
        slug = re.sub(r'[^a-z]+', '-', name.lower().split(',')[0]).strip('-')
        jcards.append(
            '<li id="j-%s"><span class="gv-role">%s</span><strong>%s</strong>%s%s'
            '<details><summary>More</summary><div class="gw-detail"><p>Appointed by President %s. Took the judicial oath on %s, '
            'about %s on the Court.</p>%s</div></details></li>' % (
                slug, e(title), e(name), page_link(name), web_link(name), e(by), e(long_date(took)), e(years_on(took)), src(BIOS, 'Supreme Court biographies')))

    supreme = (
        '<section id="supreme-court" class="gv-sec"><div class="gw-heading"><span>Layer 2 / The top court</span>'
        '<h2>The Supreme Court.</h2><p>By law, the Court has a Chief Justice and eight associate justices. Any six make a quorum. '
        'Justices are nominated by the president, confirmed by the Senate, and serve during good behavior.</p></div>'
        '<ol class="gv-line gv-justices">%s</ol>'
        '<p>%s %s %s</p>'
        + figure_html('supreme-court', 'gv-photo gv-photo-wide') +  # D230: building photo
        '<div class="gv-facts">'
        '<details open><summary>When was it built?</summary><div class="gw-detail"><p>The cornerstone was laid on October 13, 1932. The building '
        'was completed in 1935, when the Court was finally able to occupy its own building.</p>%s</div></details>'
        '<details><summary>Who designed it?</summary><div class="gw-detail"><p>Architect Cass Gilbert, at the request of Chief Justice William '
        'Howard Taft. A classical Corinthian style was chosen.</p>%s</div></details>'
        '</div></section>') % (
        ''.join(jcards), src(S1, '28 U.S.C. § 1'), src(MEMBERS, 'Supreme Court members'), src(CONST, 'Constitution, Articles II and III'),
        src('https://www.supremecourt.gov/about/buildinghistory.aspx', 'Supreme Court building history'),
        src('https://www.supremecourt.gov/about/buildinghistory.aspx', 'Supreme Court building history'))

    def court_link(cid):
        if not jd or cid not in jd['appeals']:
            return ''
        import build_judges
        c = jd['appeals'][cid]
        n = len(jd['courts'][c])
        d = len(jd['by_circuit'].get(cid, []))
        more = (' and its %d district court%s' % (d, '' if d == 1 else 's')) if d else ''
        return '<a class="gv-open" href="court/%s.html">Meet its %d judges%s →</a>' % (build_judges.court_slug(c), n, more)

    ccards = []
    for cid, name, sts, terr, judges in CIRCUITS:
        if cid == 'fed':
            where = 'Nationwide. The law assigns it all federal judicial districts, for certain kinds of cases.'
        else:
            places = [NAMES[s] for s in sts] + terr
            where = ', '.join(places) + '.'
        ccards.append('<article class="gw-card gv-circuit gv-c%s-card" id="circuit-%s"><p class="gw-eyebrow">Court of appeals</p><h3>%s</h3>'
                      '<p class="gv-big">%d <span>judgeships set by law</span></p><p>%s</p>%s</article>' % (
                          cid, cid, e(name), judges, e(where), court_link(cid)))
    circuits = (
        '<section id="circuits" class="gv-sec"><div class="gw-heading"><span>Layer 3 / Where appeals go</span>'
        '<h2>13 courts of appeals.</h2><p>The 94 district courts are organized into 12 regional circuits. The 13th, the Federal Circuit, '
        'has nationwide reach for certain kinds of cases. Tap a state to jump to its circuit.</p></div>'
        '<figure class="gv-capitol gv-mapfig">%s<figcaption>Colors show circuits only. Alaska and Hawaii are drawn in insets.</figcaption></figure>'
        '<div class="gw-grid gv-top">%s</div>'
        '<p class="gv-small">Together these add up to 179 circuit judgeships. %s %s %s %s</p></section>') % (
        circuit_map(), ''.join(ccards), src(S41, '28 U.S.C. § 41'), src(S44, '28 U.S.C. § 44'), src(APPEALS, 'uscourts.gov: courts of appeals'),
        '<a class="gw-source" href="%s">Every court’s website (uscourts.gov) ↗</a>' % e(LINKS))

    ladder = (
        '<section id="levels" class="gv-sec"><div class="gw-heading"><span>Layer 1 / How a case moves</span>'
        '<h2>Three levels, from trial to the top.</h2><p>District courts are the trial courts. The courts of appeals sit '
        'above them, and the Supreme Court sits above the courts of appeals.</p></div>'
        '<ol class="gv-ladder"><li><span class="gv-big">94</span><strong>District courts</strong><span>The trial courts, where most federal '
        'cases start.</span></li><li><span class="gv-big">13</span><strong>Courts of appeals</strong><span>Hear appeals from the '
        'district courts. <a href="#circuits">See the circuit map</a></span></li><li><span class="gv-big">1</span><strong>Supreme Court</strong>'
        '<span>The highest court. <a href="#supreme-court">Meet the nine justices</a></span></li></ol>'
        '<details><summary>Who chooses federal judges, and for how long?</summary><div class="gw-detail"><p>The president nominates judges for the '
        'Supreme Court, the courts of appeals and the district courts, and the Senate confirms or rejects them. These judges hold their offices '
        'during good behavior, so they have no fixed term. Congress creates appeals and district judgeships by law.</p>%s %s</div></details>'
        '<p>%s</p></section>') % (
        src(CONST, 'Constitution, Articles II and III'),
        src('https://www.uscourts.gov/about-federal-courts/about-federal-judges/authorized-judgeships', 'uscourts.gov: judgeships'),
        src(STRUCT, 'uscourts.gov: court structure'))

    def leaving_html():
        import build_judges as bj
        rows = bj.FUTURE_META.get('rows') or []
        if not rows:
            return ''
        lis = []
        for f in sorted(rows, key=lambda f: (f['date'] or '9999', f['court'])):
            who = ('<a href="judges/%s.html">%s</a>' % (f['slug'], e(f['name']))) if f['slug'] else e(f['name'])
            court = ('<a href="court/%s.html">%s</a>' % (bj.court_slug(f['court']), e(bj.court_short(f['court'])))) if f['court'] else e(f['raw_court'])
            lis.append('<li>%s, %s: <span class="gv-muted">%s</span></li>' % (who, court, e(f['words'])))
        return ('<details class="gv-leaving-box" open><summary>Announced departures: %d judges</summary><div class="gw-detail">'
                '<p>These judges have told the courts they will retire, take senior status or move to another court. Each departure '
                'opens a seat for the president to fill, with Senate confirmation.</p><ul class="gv-list">%s</ul>'
                '<p class="gv-small">As of %s. <a class="gw-source" href="%s">Source: U.S. Courts, future judicial vacancies ↗</a></p></div></details>') % (
            len(rows), ''.join(lis), e(long_date(bj.FUTURE_META['as_of']) if re.match(r'\d{4}-', bj.FUTURE_META['as_of']) else bj.FUTURE_META['as_of']),
            e(bj.FUTURE_META['source']))

    def every_judge():
        if not jd:
            return ''
        import build_judges as bj
        courts = jd['courts']
        cnum = {v: i for i, v in enumerate(['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth',
                                            'Tenth', 'Eleventh', 'District of Columbia', 'Federal'])}

        def circ_rank(c):
            m = re.match(r'U\.S\. Court of Appeals for the (.+) Circuit$', c)
            return cnum.get(m.group(1), 99) if m else 0
        order = sorted(courts, key=lambda c: (0 if c.startswith('Supreme') else 1 if 'Appeals' in c else 3 if 'District Court' in c else 2,
                                              circ_rank(c), bj.court_state(c) or '', bj.court_short(c)))
        groups = []
        for c in order:
            js = sorted(courts[c], key=lambda j: (j['senior'] != '', j['r']['Last Name'], j['name']))
            items = ''.join('<li data-q="%s"><a href="judges/%s.html">%s</a> <span class="gv-muted">%s%s</span></li>' % (
                e((j['name'] + ' ' + c + ' ' + j['president']).lower()), j['slug'], e(j['name']),
                e('Appointed by ' + j['president']) if j['president'] and not j['president'].startswith('None') else '',
                ', retired' if j.get('retired') else ', senior status' if j['senior'] else '') for j in js)
            nret = sum(1 for j in js if j.get('retired'))
            groups.append('<details class="gv-state" data-place="%s"><summary>%s <span class="gv-muted">%s</span></summary>'
                          '<ul class="gv-list">%s</ul><p class="gv-small"><a href="court/%s.html">Open the %s page →</a></p></details>' % (
                              e(c.lower()), e(bj.court_short(c) if not c.startswith('Supreme') else 'Supreme Court'),
                              ('%d + %d retired' % (len(js) - nret, nret)) if nret else str(len(js)), items,
                              bj.court_slug(c), e(bj.court_short(c) if not c.startswith('Supreme') else 'Supreme Court')))
        nj = sum(1 for j in jd['judges'] if not j.get('retired'))
        senior = sum(1 for j in jd['judges'] if j['senior'] and not j.get('retired'))
        return ('<section id="judges" class="gv-sec"><div class="gw-heading"><span>Layer 4 / Every federal judge</span>'
                '<h2>%s judges serving now.</h2><p>%s active and %d on senior status, on %d courts. Open a court, or type a name, a court, a state '
                'or the president who appointed them. Every name opens a page with their Senate confirmation, education and career.</p></div>'
                '<div class="gv-search" data-unit="judge" hidden><label for="gv-q">Search judges</label><input id="gv-q" type="search" autocomplete="off" '
                'placeholder="Name, court, state or president"><span class="gv-muted" aria-live="polite" id="gv-count"></span></div>'
                '%s<div class="gv-states">%s</div><p class="gw-status">%s</p></section>') % (
            '{:,}'.format(nj), '{:,}'.format(nj - senior), senior, len(courts), leaving_html(), ''.join(groups), e(jd['note']))

    body = ('<header class="gv-hero"><p class="gw-eyebrow">The federal courts · Interpret federal laws</p>'
            '<p class="gv-huge">9 <span>Supreme Court justices</span></p><h1>The federal courts</h1>'
            '<p class="gv-lede">94 district courts, 13 courts of appeals and one Supreme Court. Each click goes one layer deeper.</p>'
            '<p class="gw-status">Article III of the Constitution sets up the federal courts. Checked against supremecourt.gov, uscourts.gov '
            'and the U.S. Code on %s.</p></header>'
            '<nav class="gw-jumps" aria-label="On this page"><a href="#levels">How a case moves</a><a href="#supreme-court">The Supreme Court</a>'
            '<a href="#circuits">Circuit map</a>%s</nav>%s%s%s%s'
            '<section class="gw-record"><h2>Where this comes from.</h2><p>Justices and the building: supremecourt.gov. Court structure: uscourts.gov. '
            'Circuits and judgeships: 28 U.S.C. §§ 1, 41 and 44. Checked %s. Individual judges: the Federal Judicial Center’s judge directory. The 179 total is our sum of the counts in § 44. The map reuses the '
            'state outlines from our district lookup. Nothing here rates or ranks a judge.</p>'
            '<nav aria-label="Keep exploring"><a href="/how-government-works.html">How government works</a> · <a href="/government/congress/">Congress</a> · '
            '<a href="/government/executive/">The executive branch</a> · <a href="#top">Return to surface ↑</a></nav></section>') % (
        CHECKED, '<a href="#judges">Every federal judge</a>' if jd else '', ladder, supreme, circuits, every_judge(), CHECKED)
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8', newline='\n') as fh:
        fh.write(page('The federal courts', 'The Supreme Court, the 13 courts of appeals and the 94 district courts, layer by layer: '
                      'the nine justices, the circuit map, the Supreme Court Building and how a case moves. Official sources.',
                      SITE_URL + '/government/courts/',
                      [('The Way', '/'), ('Government', '/how-government-works.html'), ('Federal courts', None)], body, 2))
    print('wrote the courts page')


if __name__ == '__main__':
    main()
